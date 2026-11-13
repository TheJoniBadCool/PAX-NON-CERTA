// Online multiplayer over PeerJS (WebRTC). The room creator's browser is the authority:
// it runs the normal game logic and dice, clients only plan their own colour and mirror
// the host's board, battle window and log.
const Multiplayer = (() => {
    const PEER_PREFIX = 'paxnoncerta-';
    const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const ICONS = ['🔴', '🔵', '🟢', '🟡'];
    const SYNC_DELAY_MS = 20;

    const m = {
        role: null,          // 'host' | 'client' | null (hotseat)
        peer: null,
        conn: null,          // client -> host connection
        slots: [null, null, null, null], // host only: { name, token, conn, connected }
        roster: [null, null, null, null], // what the UI shows: { name, connected } | null
        code: '',
        name: '',
        token: '',
        myIndex: 0,
        count: 2,
        started: false,
        gameId: 0,
        joined: false,
        syncTimer: null,
        battleTimer: null,
        logTimer: null,
        retryTimer: null
    };

    const $ = id => document.getElementById(id);
    const mainMenuModal = $('main-menu-modal');
    const mpModal = $('mp-modal');
    const connectView = $('mp-connect-view');
    const lobbyView = $('mp-lobby-view');
    const statusEl = $('mp-status');
    const gameOverModal = $('gameover-modal');
    const btnForceSkip = $('btn-force-skip');
    const btnGameOverRestart = $('btn-gameover-restart');

    function isHost() { return m.role === 'host'; }

    function setStatus(text, isError = false) {
        statusEl.innerText = text;
        statusEl.style.color = isError ? '#f87171' : 'var(--text-muted)';
    }

    function toast(text) {
        const el = document.createElement('div');
        el.className = 'mp-toast';
        el.innerText = text;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4000);
    }

    function randomToken() {
        const bytes = new Uint8Array(12);
        crypto.getRandomValues(bytes);
        return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function randomCode() {
        let code = '';
        for (let i = 0; i < 5; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
        return code;
    }

    function cleanName(value, fallback) {
        const name = String(value || '').replace(/[<>]/g, '').trim().slice(0, 16);
        return name || fallback;
    }

    function hideAllModals() {
        [mainMenuModal, mpModal, gameOverModal, playerSelectionModal, customSetupModal]
            .forEach(modal => modal.classList.add('hidden'));
    }

    // ---------- Menu ----------
    function showMainMenu() {
        hideAllModals();
        mainMenuModal.classList.remove('hidden');
    }

    function showConnectView() {
        hideAllModals();
        connectView.classList.remove('hidden');
        lobbyView.classList.add('hidden');
        mpModal.classList.remove('hidden');
        setStatus('');
    }

    function showLobby() {
        hideAllModals();
        connectView.classList.add('hidden');
        lobbyView.classList.remove('hidden');
        mpModal.classList.remove('hidden');
        renderLobby();
    }

    function renderLobby() {
        $('mp-room-code').innerText = m.code;
        const rosterEl = $('mp-roster');
        rosterEl.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const entry = m.roster[i];
            const row = document.createElement('div');
            row.className = 'mp-roster-row';
            row.style.borderColor = PLAYERS[i].color;
            const label = document.createElement('span');
            label.style.color = PLAYERS[i].color;
            label.innerText = `${ICONS[i]} ${PLAYERS[i].name}`;
            const who = document.createElement('span');
            if (i >= m.count) {
                who.innerText = 'not in this match';
                row.style.opacity = '0.4';
            } else if (!entry) {
                who.innerText = 'waiting for player…';
            } else {
                who.innerText = entry.name + (i === 0 ? ' (host)' : '') + (entry.connected ? '' : ' — disconnected');
            }
            row.append(label, who);
            rosterEl.appendChild(row);
        }
        $('mp-host-options').classList.toggle('hidden', !isHost());
        $('mp-guest-wait').classList.toggle('hidden', isHost());
        if (isHost()) {
            $('mp-count').value = String(m.count);
            const ready = m.roster.slice(0, m.count).every(entry => entry && entry.connected);
            $('btn-mp-start').disabled = !ready;
        }
    }

    // ---------- Host ----------
    function createRoom() {
        m.name = cleanName($('mp-name').value, 'Host');
        m.role = 'host';
        $('btn-mp-create').disabled = true;
        setStatus('Creating room…');
        openHostPeer(0);
    }

    function openHostPeer(attempt) {
        m.code = randomCode();
        const peer = new Peer(PEER_PREFIX + m.code);
        m.peer = peer;
        peer.on('open', () => {
            m.myIndex = 0;
            m.count = 2;
            m.slots = [{ name: m.name, token: randomToken(), conn: null, connected: true }, null, null, null];
            m.roster = rosterFromSlots();
            showLobby();
        });
        peer.on('connection', onHostConnection);
        peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); });
        peer.on('error', error => {
            if (error.type === 'unavailable-id' && attempt < 5) {
                peer.destroy();
                openHostPeer(attempt + 1);
                return;
            }
            if (!m.started && connectView.classList.contains('hidden') === false) {
                $('btn-mp-create').disabled = false;
                m.role = null;
                setStatus(`Could not create room (${error.type}). Check your connection.`, true);
            } else {
                toast(`Network problem: ${error.type}`);
            }
        });
    }

    function rosterFromSlots() {
        return m.slots.map(slot => slot ? { name: slot.name, connected: slot.connected } : null);
    }

    function onHostConnection(conn) {
        conn.on('data', message => onHostMessage(conn, message));
        conn.on('close', () => onHostConnectionClosed(conn));
        conn.on('error', () => onHostConnectionClosed(conn));
    }

    function rejectConnection(conn, reason) {
        conn.send({ type: 'reject', reason });
        setTimeout(() => conn.close(), 300);
    }

    function onHostMessage(conn, message) {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'join') {
            handleJoin(conn, message);
            return;
        }
        const index = conn._slot;
        if (index === undefined || !m.slots[index] || m.slots[index].conn !== conn) return;
        if (message.type === 'commit') {
            const plan = sanitizePlan(index, message.plan);
            if (!plan) {
                conn.send({ type: 'notice', text: 'Your plan was rejected by the host. Please re-plan.' });
                syncTo(index);
                return;
            }
            hostSetCommit(index, true, plan);
        } else if (message.type === 'unlock') {
            hostSetCommit(index, false);
        } else if (message.type === 'armour') {
            handleArmourRequest(index, message.unitId);
        }
    }

    function handleJoin(conn, message) {
        const token = String(message.token || '').slice(0, 64);
        const name = cleanName(message.name, 'Player');
        if (!token) return;
        let index = m.slots.findIndex(slot => slot && slot.token === token);
        if (index >= 0) {
            const previous = m.slots[index].conn;
            m.slots[index].conn = conn;
            m.slots[index].connected = true;
            if (!m.started) m.slots[index].name = name;
            if (previous && previous !== conn) previous.close();
        } else {
            if (m.started) return rejectConnection(conn, 'That game has already started.');
            index = m.slots.findIndex((slot, i) => i < m.count && !slot);
            if (index < 0) return rejectConnection(conn, 'This room is full.');
            m.slots[index] = { name, token, conn, connected: true };
        }
        conn._slot = index;
        m.roster = rosterFromSlots();
        syncTo(index);
        sendLogTo(index);
        sendBattleTo(index);
        broadcastSync();
        if (!m.started) renderLobby(); else refreshControls();
        if (m.started) updatePlayerCards();
    }

    function onHostConnectionClosed(conn) {
        const index = conn._slot;
        if (index === undefined || !m.slots[index] || m.slots[index].conn !== conn) return;
        if (m.started) {
            m.slots[index].connected = false;
            m.slots[index].conn = null;
        } else {
            m.slots[index] = null;
        }
        m.roster = rosterFromSlots();
        broadcastSync();
        if (m.started) updatePlayerCards(); else renderLobby();
    }

    function sanitizePlan(index, plan) {
        if (!Array.isArray(plan) || plan.length > 64 || gameState.eliminated[index]) return null;
        if (!['PLANNING', 'COMMITTED'].includes(gameState.phase)) return null;
        const isSquare = square => Array.isArray(square) && square.length === 2 &&
            square.every(value => Number.isInteger(value) && value >= 0 && value < 16);
        const result = [];
        for (const entry of plan) {
            if (!entry || !isSquare(entry.from) || !isSquare(entry.to)) return null;
            if (Math.max(Math.abs(entry.from[0] - entry.to[0]), Math.abs(entry.from[1] - entry.to[1])) > 1) return null;
            const piece = gameState.board[entry.from[0]][entry.from[1]];
            if (!piece || piece.player !== index + 1) return null;
            const clean = { ...entry };
            if (entry.isUnmerge) {
                if (entry.sourcePieceId !== piece.id) return null;
                const heldUnit = getPieceContents(piece).find(unit => unit.id === entry.unitId);
                if (!heldUnit || !canMoveHeldUnit(heldUnit)) return null;
            } else {
                if (entry.pieceId !== piece.id) return null;
                if (entry.siegeAssault) {
                    const siege = getReadySiegeAssault(piece, entry.from, entry.to);
                    if (!siege || entry.siegeId !== siege.id) return null;
                } else if (entry.sallyOut) {
                    if (!isValidSallyOutPlan(piece, entry.from, entry.to, index + 1, entry.siegeId)) return null;
                } else if (!entry.siegeCancel && !canMoveWholePiece(piece)) {
                    return null;
                }
                clean.pieceType = piece.type;
                clean.contents = getPieceContents(piece);
            }
            result.push(clean);
        }
        return result;
    }

    function handleArmourRequest(index, unitId) {
        if (!['PLANNING', 'COMMITTED'].includes(gameState.phase) || gameState.eliminated[index]) return;
        for (const row of gameState.board) {
            for (const piece of row) {
                if (!piece || piece.player !== index + 1) continue;
                const contents = getPieceContents(piece);
                const unit = contents.find(candidate => candidate.id === unitId);
                if (!unit || !contents.some(other => other.type === 'r') || getUnitLevel(unit, 'armour') >= 3) continue;
                unit.armour = getUnitLevel(unit, 'armour') + 1;
                logAction(`🛡️ <b>${getUnitName(unit)}</b> armour upgraded to ${unit.armour}.`);
                renderBoard();
                return;
            }
        }
    }

    function startMatch() {
        const needed = m.roster.slice(0, m.count);
        if (!needed.every(entry => entry && entry.connected)) return;
        gameState.progressionMode = document.querySelector('input[name="mp-progression"]:checked').value;
        m.started = true;
        m.gameId++;
        gameState.multiplayer = true;
        gameState.committed = [false, false, false, false];
        startNewGame([0, 1, 2, 3].map(i => i < m.count));
        gameState.turnIndex = m.myIndex;
        gameState.phase = 'PLANNING';
        hideAllModals();
        btnGameOverRestart.classList.remove('hidden');
        updatePlayerCards();
        renderBoard();
        hintTextEl.innerText = 'Plan your moves, then press Commit Plans. The round resolves when everyone has committed.';
        syncNow();
    }

    function hostSetCommit(index, value, plan = null) {
        if (!m.started || !['PLANNING', 'COMMITTED'].includes(gameState.phase)) return;
        if (gameState.eliminated[index]) return;
        if (value) gameState.plans[index] = plan;
        gameState.committed[index] = value;
        if (index === m.myIndex) {
            gameState.phase = value ? 'COMMITTED' : 'PLANNING';
            clearTransientUi();
        }
        updatePlayerCards();
        renderBoard();
        if (value) checkAllCommitted();
    }

    function checkAllCommitted() {
        if (gameState.phase === 'RESOLVING') return;
        for (let i = 0; i < 4; i++) {
            if (!gameState.eliminated[i] && !gameState.committed[i]) return;
        }
        resolveAllMoves().catch(error => {
            console.error(error);
            toast('Resolution error — see console.');
        });
    }

    function forceSkipDisconnected() {
        if (!isHost() || !['PLANNING', 'COMMITTED'].includes(gameState.phase)) return;
        for (let i = 0; i < 4; i++) {
            if (!gameState.eliminated[i] && !gameState.committed[i] && m.roster[i] && !m.roster[i].connected) {
                gameState.plans[i] = [];
                gameState.committed[i] = true;
            }
        }
        updatePlayerCards();
        renderBoard();
        checkAllCommitted();
    }

    function beginNextRound() {
        gameState.committed = [false, false, false, false];
        gameState.turnIndex = m.myIndex;
        gameState.lockedPieceIds = new Set();
        gameState.phase = gameState.eliminated[m.myIndex] ? 'COMMITTED' : 'PLANNING';
        clearTransientUi();
        hintTextEl.innerText = 'New round! Plan your moves, then press Commit Plans.';
        updatePlayerCards();
        renderBoard();
    }

    function onGameOver() {
        btnGameOverRestart.classList.toggle('hidden', !isHost());
        if (isHost()) btnGameOverRestart.innerText = 'Back to Lobby';
        updatePlayerCards();
        syncNow();
    }

    function returnToLobby() {
        m.started = false;
        gameState.multiplayer = false;
        gameState.committed = [false, false, false, false];
        m.roster = rosterFromSlots();
        hideAllModals();
        showLobby();
        broadcastSync();
    }

    // ---------- Snapshots & broadcasting ----------
    function buildSync(index, noRender = false) {
        const message = {
            type: 'sync',
            code: m.code,
            started: m.started,
            count: m.count,
            gameId: m.gameId,
            you: index,
            roster: m.roster,
            committed: gameState.committed,
            noRender,
            game: null,
            myPlan: null
        };
        if (m.started) {
            message.game = {
                board: gameState.board,
                eliminated: gameState.eliminated,
                activePlayers: gameState.activePlayers,
                round: gameState.round,
                phase: gameState.phase === 'COMMITTED' ? 'PLANNING' : gameState.phase,
                sieges: gameState.sieges,
                retreating: gameState.retreating,
                nextUnitSequence: gameState.nextUnitSequence,
                progressionMode: gameState.progressionMode,
                gameOver: gameState.phase === 'GAME_OVER' ? {
                    title: $('gameover-title').innerText,
                    desc: $('gameover-desc').innerText
                } : null
            };
            if (gameState.committed[index]) message.myPlan = gameState.plans[index];
        }
        return message;
    }

    function send(conn, message) {
        if (conn && conn.open) conn.send(message);
    }

    function syncTo(index, noRender = false) {
        const slot = m.slots[index];
        if (slot && slot.conn) send(slot.conn, buildSync(index, noRender));
    }

    function broadcastSync(noRender = false) {
        m.slots.forEach((slot, index) => { if (slot && slot.conn) syncTo(index, noRender); });
    }

    function syncNow() {
        clearTimeout(m.syncTimer);
        m.syncTimer = null;
        broadcastSync();
    }

    function onBoardRendered() {
        if (!isHost() || !m.started || m.syncTimer) return;
        m.syncTimer = setTimeout(syncNow, SYNC_DELAY_MS);
    }

    function broadcastToClients(message) {
        m.slots.forEach(slot => { if (slot && slot.conn) send(slot.conn, message); });
    }

    function broadcastResolutionStart(moves) {
        clearTimeout(m.syncTimer);
        m.syncTimer = null;
        broadcastSync(true);
        broadcastToClients({ type: 'anim', moves: JSON.parse(JSON.stringify(moves)) });
    }

    function battleMessage() {
        return {
            type: 'battle',
            visible: !clashOverlay.classList.contains('hidden'),
            candidates: battleCandidatesEl.innerHTML,
            result: clashResult.innerText,
            color: clashResult.style.color,
            rolls: battleRollsEl.innerHTML,
            target: battleTargetSquare
        };
    }

    function sendBattleTo(index) {
        const slot = m.slots[index];
        if (slot && slot.conn && m.started) send(slot.conn, battleMessage());
    }

    function sendLogTo(index) {
        const slot = m.slots[index];
        if (slot && slot.conn && m.started) send(slot.conn, { type: 'log', html: battleLogEl.innerHTML });
    }

    function initializeHostObservers() {
        new MutationObserver(() => {
            if (!isHost() || !m.started || m.battleTimer) return;
            m.battleTimer = setTimeout(() => {
                m.battleTimer = null;
                broadcastToClients(battleMessage());
            }, SYNC_DELAY_MS);
        }).observe(clashOverlay, { attributes: true, childList: true, subtree: true, characterData: true });

        new MutationObserver(() => {
            if (!isHost() || !m.started || m.logTimer) return;
            m.logTimer = setTimeout(() => {
                m.logTimer = null;
                broadcastToClients({ type: 'log', html: battleLogEl.innerHTML });
            }, SYNC_DELAY_MS);
        }).observe(battleLogEl, { childList: true });
    }

    // ---------- Client ----------
    function joinRoom() {
        const code = $('mp-code').value.trim().toUpperCase();
        if (code.length !== 5) {
            setStatus('Enter the 5-character room code.', true);
            return;
        }
        m.name = cleanName($('mp-name').value, 'Player');
        m.role = 'client';
        m.code = code;
        m.joined = false;
        const storageKey = `paxnoncerta-token-${code}`;
        m.token = sessionStorage.getItem(storageKey) || randomToken();
        sessionStorage.setItem(storageKey, m.token);
        $('btn-mp-join').disabled = true;
        connectToHost();
    }

    function connectToHost() {
        clearTimeout(m.retryTimer);
        if (m.peer && !m.peer.destroyed) m.peer.destroy();
        setStatus('Connecting…');
        const peer = new Peer();
        m.peer = peer;
        peer.on('open', () => {
            const conn = peer.connect(PEER_PREFIX + m.code, { reliable: true });
            m.conn = conn;
            conn.on('open', () => conn.send({ type: 'join', token: m.token, name: m.name }));
            conn.on('data', onClientMessage);
            conn.on('close', onClientConnectionLost);
            conn.on('error', onClientConnectionLost);
        });
        peer.on('error', error => {
            if (error.type === 'peer-unavailable') {
                onClientConnectionLost('Room not found or host offline.');
            } else {
                onClientConnectionLost(`Network problem (${error.type}).`);
            }
        });
    }

    function onClientConnectionLost(reason) {
        if (m.role !== 'client') return;
        clearTimeout(m.retryTimer);
        if (!m.joined) {
            m.role = null;
            $('btn-mp-join').disabled = false;
            setStatus(typeof reason === 'string' ? reason : 'Could not connect to the room.', true);
            return;
        }
        toast('Connection to host lost — reconnecting…');
        m.retryTimer = setTimeout(connectToHost, 3000);
    }

    function onClientMessage(message) {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'reject') {
            m.joined = false;
            m.role = null;
            $('btn-mp-join').disabled = false;
            setStatus(message.reason, true);
        } else if (message.type === 'sync') {
            m.joined = true;
            applySync(message);
        } else if (message.type === 'log') {
            battleLogEl.innerHTML = message.html;
        } else if (message.type === 'battle') {
            applyBattle(message);
        } else if (message.type === 'anim') {
            animatePlannedMovements(message.moves);
        } else if (message.type === 'notice') {
            toast(message.text);
        }
    }

    function applySync(message) {
        m.code = message.code;
        m.roster = message.roster;
        m.count = message.count;
        m.myIndex = message.you;
        if (!message.started) {
            const wasStarted = m.started;
            m.started = false;
            gameState.multiplayer = false;
            if (wasStarted) {
                clashOverlay.classList.add('hidden');
                clearBattleTarget();
            }
            showLobby();
            return;
        }

        const game = message.game;
        const isNewGame = !m.started || message.gameId !== m.gameId;
        const isNewRound = isNewGame || game.round !== gameState.round;
        m.started = true;
        m.gameId = message.gameId;
        if (isNewGame) {
            hideAllModals();
            btnGameOverRestart.classList.add('hidden');
        }
        gameState.multiplayer = true;
        if (isNewRound) {
            gameState.plans = [[], [], [], []];
            gameState.lockedPieceIds = new Set();
            clearTransientUi();
        }
        Object.assign(gameState, {
            board: game.board,
            eliminated: game.eliminated,
            activePlayers: game.activePlayers,
            round: game.round,
            sieges: game.sieges,
            retreating: game.retreating,
            nextUnitSequence: game.nextUnitSequence,
            progressionMode: game.progressionMode,
            committed: message.committed,
            turnIndex: message.you
        });
        gameState.phase = game.phase === 'PLANNING' && (message.committed[message.you] || game.eliminated[message.you])
            ? 'COMMITTED'
            : game.phase;
        if (message.myPlan && !gameState.plans[message.you].length) gameState.plans[message.you] = message.myPlan;
        if (gameState.phase !== 'PLANNING') {
            gameState.selectedSquare = null;
            gameState.validMoves = [];
        }

        if (game.phase === 'GAME_OVER' && game.gameOver) {
            $('gameover-title').innerText = game.gameOver.title;
            $('gameover-desc').innerText = game.gameOver.desc;
            btnGameOverRestart.classList.add('hidden');
            gameOverModal.classList.remove('hidden');
        } else {
            gameOverModal.classList.add('hidden');
        }
        if (message.noRender) {
            updatePlayerCards();
        } else {
            updatePlayerCards();
            renderBoard();
        }
    }

    function applyBattle(message) {
        battleCandidatesEl.innerHTML = message.candidates;
        clashResult.innerText = message.result === 'Ready' ? 'Ready — the host starts the battle' : message.result;
        clashResult.style.color = message.color;
        battleRollsEl.innerHTML = message.rolls;
        btnStartBattle.classList.add('hidden');
        btnProceedBattle.classList.add('hidden');
        if (message.visible) {
            clashOverlay.classList.remove('hidden');
            if (message.target) {
                battleTargetSquare = message.target;
                battleConnector.classList.remove('hidden');
                requestAnimationFrame(updateBattleConnector);
            }
        } else {
            clashOverlay.classList.add('hidden');
            clearBattleTarget();
        }
    }

    // ---------- Shared UI ----------
    function clearTransientUi() {
        gameState.pendingMerge = null;
        gameState.selectedHeldPiece = null;
        gameState.pendingTransfer = null;
        gameState.selectedSquare = null;
        gameState.validMoves = [];
        mergePrompt.classList.add('hidden');
        pieceTooltip.classList.add('hidden');
        btnMergeConfirm.innerText = 'Merge';
    }

    function toggleCommit() {
        const me = m.myIndex;
        if (gameState.eliminated[me]) return;
        if (isHost()) {
            if (gameState.phase === 'PLANNING') hostSetCommit(me, true, gameState.plans[me]);
            else if (gameState.phase === 'COMMITTED') hostSetCommit(me, false);
            return;
        }
        if (!['PLANNING', 'COMMITTED'].includes(gameState.phase) || !m.conn || !m.conn.open) return;
        if (gameState.phase === 'PLANNING') {
            clearTransientUi();
            m.conn.send({ type: 'commit', plan: gameState.plans[me] });
        } else {
            m.conn.send({ type: 'unlock' });
        }
    }

    function requestArmourUpgrade(unitId) {
        if (m.conn && m.conn.open) m.conn.send({ type: 'armour', unitId });
    }

    function getRosterEntry(index) {
        return m.roster[index];
    }

    function getBadge(index) {
        const entry = getRosterEntry(index);
        if (!entry) return { text: 'Open', ready: false };
        if (!entry.connected) return { text: 'Disconnected', ready: false };
        if (gameState.phase === 'RESOLVING') return { text: 'Resolving', ready: false };
        if (gameState.committed[index]) return { text: 'Locked in ✔', ready: true };
        return { text: 'Planning…', ready: false };
    }

    function describePhase() {
        const me = m.myIndex;
        if (gameState.phase === 'RESOLVING') return 'Resolving the round: move, merge, then battles.';
        if (gameState.phase === 'GAME_OVER') return 'Game over.';
        if (gameState.eliminated[me]) return 'You were eliminated. Spectating until the match ends.';
        if (gameState.phase === 'COMMITTED') {
            const waiting = PLAYERS
                .filter((player, i) => !gameState.eliminated[i] && !gameState.committed[i])
                .map(player => player.name);
            return `Plan locked. Waiting for: ${waiting.join(', ') || '…'}. You can unlock to change it.`;
        }
        return 'Plan moves for your pieces, then Commit Plans.';
    }

    function refreshControls() {
        for (let i = 0; i < 4; i++) {
            const label = $(`card-p${i + 1}`).firstElementChild;
            const entry = getRosterEntry(i);
            label.innerText = `${ICONS[i]} ${entry ? entry.name : `Player ${i + 1}`} (${PLAYERS[i].name})`;
        }
        const me = m.myIndex;
        const canAct = ['PLANNING', 'COMMITTED'].includes(gameState.phase) && !gameState.eliminated[me];
        btnFinishPlan.disabled = !canAct;
        const canUnlock = gameState.phase === 'COMMITTED' && !gameState.eliminated[me];
        $('commit-plan-icon').innerText = canUnlock ? '↶' : '✓';
        $('commit-plan-label').innerText = canUnlock ? 'Unlock Plan' : 'Commit Plans';
        btnFinishPlan.setAttribute('aria-label', canUnlock ? 'Unlock Plan' : 'Commit Plans');
        btnRestart.innerText = isHost() ? '🔄 Restart Room' : '🚪 Leave';
        activePlayerDescEl.innerText = describePhase();
        btnForceSkip.classList.toggle('hidden', !(isHost() && ['PLANNING', 'COMMITTED'].includes(gameState.phase) &&
            [0, 1, 2, 3].some(i => !gameState.eliminated[i] && !gameState.committed[i] &&
                m.roster[i] && !m.roster[i].connected)));
    }

    function onNewGameRequested() {
        if (!isHost()) {
            if (confirm('Leave this room? You can rejoin with the same room code.')) location.reload();
            return;
        }
        if (gameState.phase === 'RESOLVING') {
            toast('Wait for the round to finish resolving.');
            return;
        }
        if (gameState.phase !== 'GAME_OVER' && !confirm('End this match for everyone and return to the lobby?')) return;
        returnToLobby();
    }

    function leaveToMenu() {
        const message = m.role
            ? 'Leave to the main menu? Other players will lose the host if you are the room creator.'
            : 'Return to the main menu? The current game will be lost.';
        if (confirm(message)) location.reload();
    }

    // ---------- Wiring ----------
    $('btn-menu-hotseat').addEventListener('click', () => {
        mainMenuModal.classList.add('hidden');
        showPlayerSelection();
    });
    $('btn-menu-multiplayer').addEventListener('click', showConnectView);
    $('btn-mp-create').addEventListener('click', createRoom);
    $('btn-mp-join').addEventListener('click', joinRoom);
    $('btn-mp-start').addEventListener('click', startMatch);
    $('btn-mp-back').addEventListener('click', () => {
        if (m.role) location.reload();
        else showMainMenu();
    });
    $('mp-count').addEventListener('change', event => {
        const highestOccupied = m.slots.reduce((max, slot, i) => slot ? i + 1 : max, 0);
        m.count = Math.max(Number(event.target.value), highestOccupied, 2);
        renderLobby();
        broadcastSync();
    });
    $('btn-menu').addEventListener('click', leaveToMenu);
    btnForceSkip.addEventListener('click', forceSkipDisconnected);
    initializeHostObservers();
    // Close promptly so the host sees the disconnect instead of waiting for an ICE timeout.
    window.addEventListener('pagehide', () => { if (m.peer && !m.peer.destroyed) m.peer.destroy(); });

    return {
        showMainMenu,
        isHost,
        toggleCommit,
        requestArmourUpgrade,
        onBoardRendered,
        broadcastResolutionStart,
        beginNextRound,
        onGameOver,
        onNewGameRequested,
        getBadge,
        refreshControls
    };
})();
