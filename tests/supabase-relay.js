// Run with: gjs -c "$(cat js/supabase-relay.js tests/supabase-relay.js)"
var setTimeout = () => 1;
var clearTimeout = () => {};
var setInterval = () => 1;
var clearInterval = () => {};
var console = { error: (...args) => printerr(args.map(String).join(' ')) };

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function mockBackend() {
    const rooms = new Map();
    const connections = new Map();
    let messages = [];
    let nextId = 1;
    let failAck = false;

    function provider(userId) {
        const client = {
            channel() {
                return {
                    on() { return this; },
                    subscribe(callback) { callback('SUBSCRIBED'); return this; }
                };
            },
            removeChannel() {},
            from(table) {
                assert(table === 'pax_messages', 'Only mailbox reads are expected');
                const filters = {};
                return {
                    select() { return this; },
                    eq(key, value) { filters[key] = value; return this; },
                    order() { return this; },
                    async limit(max) {
                        return { data: messages.filter(row => row.recipient_id === userId &&
                            Object.keys(filters).every(key => row[key] === filters[key])).slice(0, max), error: null };
                    }
                };
            },
            async rpc(name, args) {
                let data = null;
                let error = null;
                if (name === 'pax_create_room') rooms.set(args.p_code, userId);
                else if (name === 'pax_connect') {
                    if (!rooms.has(args.p_code)) error = { message: 'Room not found' };
                    else {
                        data = `connection-${nextId++}`;
                        connections.set(data, { id: data, room: args.p_code, guest_id: userId, active: true });
                    }
                } else if (name === 'pax_list_connections') {
                    data = [...connections.values()].filter(conn => conn.room === args.p_code &&
                        rooms.get(args.p_code) === userId);
                } else if (name === 'pax_send') {
                    const conn = connections.get(args.p_connection_id);
                    if (!conn || !conn.active) error = { message: 'Connection closed' };
                    else {
                        const host = rooms.get(conn.room);
                        const recipient = userId === host ? conn.guest_id : host;
                        messages.push({ id: nextId++, connection_id: conn.id, recipient_id: recipient,
                            payload: args.p_payload });
                    }
                } else if (name === 'pax_ack_messages') {
                    if (failAck) error = { message: 'Acknowledgement failed' };
                    else messages = messages.filter(row =>
                        row.recipient_id !== userId || !args.p_ids.includes(row.id));
                } else if (name === 'pax_close_connection') {
                    const conn = connections.get(args.p_connection_id);
                    if (conn) conn.active = false;
                } else if (name === 'pax_close_room') rooms.delete(args.p_code);
                else if (name === 'pax_heartbeat') data = true;
                else throw new Error(`Unexpected RPC ${name}`);
                return { data, error };
            }
        };
        return {
            async signInAsGuest() { return { user: { id: userId } }; },
            getClient() { return client; }
        };
    }

    return { provider, setFailAck(value) { failAck = value; } };
}

async function runRelayTests() {
    const backend = mockBackend();
    const host = new PaxRelay('ABCDE', backend.provider('host'));
    const hostReady = new Promise(resolve => host.on('open', resolve));
    const hostConnections = [];
    host.on('connection', conn => hostConnections.push(conn));
    await hostReady;

    const guest = new PaxRelay(null, backend.provider('guest'));
    await new Promise(resolve => guest.on('open', resolve));
    const guestConn = guest.connect('ABCDE');
    await new Promise(resolve => guestConn.on('open', resolve));
    await host.reconcile();
    assert(hostConnections.length === 1, 'Host must discover the guest');
    const hostConn = hostConnections[0];
    assert(hostConn.remoteUserId === 'guest', 'Host must get the authenticated guest ID');

    const received = [];
    hostConn.on('data', message => received.push(message));
    await guestConn.send({ type: 'commit', plan: [], gameId: 1, round: 1 });
    await guestConn.send({ type: 'unlock', gameId: 1, round: 1 });
    await host.reconcile();
    assert(received.map(message => message.type).join(',') === 'commit,unlock',
        'Polling must deliver missed messages in order');

    const replies = [];
    guestConn.on('data', message => replies.push(message));
    await hostConn.send({ type: 'sync', started: true });
    backend.setFailAck(true);
    let failed = false;
    try { await guest.reconcile(); } catch (error) { failed = true; }
    assert(failed && replies.length === 1, 'Acknowledgement errors must surface after delivery');
    backend.setFailAck(false);
    await guest.reconcile();
    assert(replies.length === 1, 'Retrying an acknowledgement must not redeliver the message');

    let sendError = false;
    guestConn.on('error', () => { sendError = true; });
    hostConn.close();
    const sent = await guestConn.send({ type: 'commit', plan: [] });
    assert(!sent && sendError, 'Failed sends must be reported to the connection');
    host.destroy();
    guest.destroy();

    let finishSignIn;
    const pending = new PaxRelay('FGHJK', {
        signInAsGuest: () => new Promise(resolve => { finishSignIn = resolve; }),
        getClient: () => { throw new Error('A destroyed relay must not initialize a client'); }
    });
    pending.destroy();
    finishSignIn({ user: { id: 'host' } });
    await Promise.resolve();
    print('Supabase relay tests passed');
}

runRelayTests().catch(error => {
    printerr(error.stack || error.message);
    imports.system.exit(1);
});
