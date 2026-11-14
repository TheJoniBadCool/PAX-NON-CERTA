// A small reliable mailbox over Postgres Changes. Only the addressed user can
// read a message; polling recovers notifications missed while disconnected.
class PaxRelayConnection {
    constructor(peer, id, remoteUserId) {
        this.peer = peer;
        this.id = id;
        this.remoteUserId = remoteUserId;
        this.open = true;
        this.handlers = {};
        this.sendQueue = Promise.resolve();
    }

    on(event, handler) { this.handlers[event] = handler; }
    emit(event, value) { if (this.handlers[event]) this.handlers[event](value); }

    send(message) {
        if (!this.open) {
            this.emit('error', new Error('Connection is closed'));
            return Promise.resolve(false);
        }
        const payload = JSON.parse(JSON.stringify(message));
        const result = this.sendQueue.then(() =>
            this.peer.rpc('pax_send', { p_connection_id: this.id, p_payload: payload }));
        this.sendQueue = result.then(() => true).catch(error => {
            console.error('Supabase relay send failed:', error);
            this.emit('error', error);
            return false;
        });
        return this.sendQueue;
    }

    close() {
        if (!this.open) return;
        this.open = false;
        this.peer.rpc('pax_close_connection', { p_connection_id: this.id })
            .catch(error => console.error('Could not close connection:', error));
        this.emit('close');
    }

    closedByRemote() {
        if (!this.open) return;
        this.open = false;
        this.emit('close');
    }
}

class PaxRelay {
    constructor(hostCode = null, provider = PaxSupabase) {
        this.hostCode = hostCode;
        this.provider = provider;
        this.code = hostCode;
        this.destroyed = false;
        this.createdRoom = false;
        this.handlers = {};
        this.connections = new Map();
        this.seenMessages = new Set();
        this.reconciling = false;
        this.reconcileAgain = false;
        this.timer = null;
        this.channel = null;
        this.start().catch(error => this.fail(error));
    }

    on(event, handler) { this.handlers[event] = handler; }
    emit(event, value) { if (this.handlers[event]) this.handlers[event](value); }

    async rpc(name, args) {
        const { data, error } = await this.client.rpc(name, args);
        if (error) throw error;
        return data;
    }

    async start() {
        const session = await this.provider.signInAsGuest();
        if (this.destroyed) return;
        this.userId = session.user.id;
        this.client = this.provider.getClient();
        if (this.hostCode) {
            try {
                await this.rpc('pax_create_room', { p_code: this.hostCode });
                this.createdRoom = true;
            } catch (error) {
                if (error.code === '23505') error.type = 'unavailable-id';
                throw error;
            }
            if (this.destroyed) {
                await this.rpc('pax_close_room', { p_code: this.hostCode });
                return;
            }
            await this.subscribe();
            if (this.destroyed) return;
            this.startTimer();
        }
        if (!this.destroyed) this.emit('open');
    }

    async subscribe() {
        this.channel = this.client.channel(`pax-${this.code}-${this.userId}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'pax_messages',
                filter: `recipient_id=eq.${this.userId}`
            }, () => this.scheduleReconcile())
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'pax_connections',
                filter: this.hostCode ? `room_code=eq.${this.code}` : `guest_id=eq.${this.userId}`
            }, () => this.scheduleReconcile());
        await new Promise((resolve, reject) => {
            let settled = false;
            const timeout = setTimeout(() => {
                if (!settled) { settled = true; reject(new Error('Realtime subscription timed out')); }
            }, 15000);
            this.channel.subscribe((status, error) => {
                if (status === 'SUBSCRIBED') {
                    if (!settled) { settled = true; clearTimeout(timeout); resolve(); }
                    this.scheduleReconcile();
                } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                    if (!settled) {
                        settled = true;
                        clearTimeout(timeout);
                        reject(error || new Error('Realtime subscription failed'));
                    } else {
                        console.error('Realtime connection problem; polling continues:', error || status);
                    }
                }
            });
        });
    }

    connect(code) {
        const conn = new PaxRelayConnection(this, null, null);
        conn.open = false;
        this.connectGuest(code, conn).catch(error => this.fail(error));
        return conn;
    }

    async connectGuest(code, conn) {
        this.code = code;
        await this.subscribe();
        if (this.destroyed) return;
        conn.id = await this.rpc('pax_connect', { p_code: code });
        if (this.destroyed) {
            await this.rpc('pax_close_connection', { p_connection_id: conn.id });
            return;
        }
        conn.open = true;
        this.connections.set(conn.id, conn);
        this.startTimer();
        conn.emit('open');
        this.scheduleReconcile();
    }

    startTimer() {
        this.timer = setInterval(() => {
            this.heartbeat().catch(error => this.fail(error));
            this.scheduleReconcile();
        }, 5000);
    }

    async heartbeat() {
        if (this.destroyed) return;
        const conn = this.hostCode ? null : [...this.connections.values()][0];
        const alive = await this.rpc('pax_heartbeat', {
            p_code: this.code, p_connection_id: conn ? conn.id : null
        });
        if (!alive) {
            if (conn) conn.closedByRemote();
            else this.fail(new Error('The room is no longer available'));
        }
    }

    scheduleReconcile() {
        if (this.destroyed || !this.code || !this.client) return;
        if (this.reconciling) { this.reconcileAgain = true; return; }
        this.reconciling = true;
        this.reconcile().catch(error => {
            console.error('Supabase relay synchronization failed:', error);
            this.emit('error', { type: 'synchronization', message: error.message });
        }).finally(() => {
            this.reconciling = false;
            if (this.reconcileAgain) { this.reconcileAgain = false; this.scheduleReconcile(); }
        });
    }

    async reconcile() {
        if (this.hostCode) {
            const rows = await this.rpc('pax_list_connections', { p_code: this.code });
            for (const row of rows) {
                let conn = this.connections.get(row.id);
                if (row.active && !conn) {
                    conn = new PaxRelayConnection(this, row.id, row.guest_id);
                    this.connections.set(row.id, conn);
                    this.emit('connection', conn);
                } else if (!row.active && conn && conn.open) {
                    conn.close();
                }
            }
        }
        let query = this.client.from('pax_messages').select('id,connection_id,payload')
            .eq('recipient_id', this.userId);
        if (!this.hostCode) {
            const conn = [...this.connections.values()][0];
            if (!conn) return;
            query = query.eq('connection_id', conn.id);
        }
        const { data, error } = await query.order('id').limit(500);
        if (error) throw error;
        const acknowledged = [];
        for (const row of data) {
            const conn = this.connections.get(row.connection_id);
            if (!conn || !conn.open) {
                if (this.hostCode) acknowledged.push(row.id);
                continue;
            }
            if (!this.seenMessages.has(row.id)) {
                conn.emit('data', row.payload);
                this.seenMessages.add(row.id);
            }
            acknowledged.push(row.id);
        }
        if (acknowledged.length) {
            await this.rpc('pax_ack_messages', { p_ids: acknowledged });
            acknowledged.forEach(id => this.seenMessages.delete(id));
        }
        if (data.length === 500 && acknowledged.length) this.reconcileAgain = true;
    }

    fail(error) {
        if (this.destroyed) return;
        console.error('Supabase relay error:', error);
        this.emit('error', {
            type: error.type || 'network',
            message: error.message || 'Network error'
        });
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        clearInterval(this.timer);
        if (this.channel) this.client.removeChannel(this.channel);
        for (const conn of this.connections.values()) conn.close();
        if (this.createdRoom) {
            this.rpc('pax_close_room', { p_code: this.code })
                .catch(error => console.error('Could not close room:', error));
        }
    }
}
