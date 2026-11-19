// Online multiplayer over Supabase. The room creator's browser is the authority:
// it runs the normal game logic and dice, clients only plan their own colour and mirror
// the host's board, battle window and log.
const Multiplayer = (() => {
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
        myIndex: 0,
        count: 2,
        boardSize: 16,
        mapSeed: '',
        mapPreviewSignature: null,
        setupBoard: null,
        setupMap: null,
        editingSetup: false,
        started: false,
        gameId: 0,
        joined: false,
        syncTimer: null,
        battleTimer: null,
        logTimer: null,
        retryTimer: null,
        pendingCommit: null,
        pendingTimer: null,
        draftSignature: null
    };

    const $ = id => document.getElementById(id);
    const mainMenuModal = $('main-menu-modal');
    const mpModal = $('mp-modal');
    const connectView = $('mp-connect-view');
    const lobbyView = $('mp-lobby-view');
    const statusEl = $('mp-status');
    const gameOverModal = $('gameover-modal');
    const playerNamesModal = $('player-names-modal');
    const btnForceSkip = $('btn-force-skip');
    const btnGameOverRestart = $('btn-gameover-restart');

    function isHost() { return m.role === 'host'; }

    function setStatus(text, isError = false) {
        statusEl.innerText = text;
        statusEl.style.color = isError ? '#f87171' : 'var(--text-muted)';
    }

    function lobbyMapSignature(seed) {
        return JSON.stringify({
            count: m.count,
            boardSize: m.boardSize,
            progression: document.querySelector('input[name="mp-progression"]:checked').value,
            resources: $('mp-resource-mode').value,
            resourceBalance: $('mp-resource-balance').value,
            resourceCapitals: $('mp-resource-capitals').checked,
            setupMode: $('mp-setup-mode').value,
            startingArmy: $('mp-starting-army').value,
            setupBoard: m.setupBoard,
            setupMap: m.setupMap,
            seed
        });
    }

    function invalidateLobbyMapPreview(message = 'Settings changed. Generate a new map preview before starting.') {
        m.mapPreviewSignature = null;
        $('mp-map-preview').innerHTML = '';
        $('mp-map-preview-status').innerText = message;
        renderLobby();
    }

    function generateLobbyMapPreview() {
        const custom = $('mp-setup-mode').value === 'custom';
        if (custom && !m.setupBoard) {
            $('mp-map-preview-status').innerText = 'Configure and confirm custom placement before previewing its map.';
            return;
        }
        const seedInput = $('mp-map-seed');
        const seed = seedInput.value.trim() || createRandomMapSeed();
        seedInput.value = seed;
        const activePlayers = [0, 1, 2, 3].map(index => index < m.count);
        const progression = document.querySelector('input[name="mp-progression"]:checked').value;
        let starting;
        try {
            starting = createStartingBoard(
                activePlayers, m.boardSize, seed, custom ? m.setupBoard : null, progression,
                $('mp-resource-mode').value, $('mp-resource-balance').value,
                $('mp-resource-capitals').checked, custom ? m.setupMap : null, $('mp-setup-mode').value,
                $('mp-starting-army').value);
        } catch (error) {
            if (!(error instanceof ResourceBalanceError)) throw error;
            invalidateLobbyMapPreview(error.message);
            return;
        }
        renderMapPreview($('mp-map-preview'), starting, m.boardSize);
        m.mapSeed = seed;
        m.mapPreviewSignature = lobbyMapSignature(seed);
        $('mp-map-preview-status').innerText =
            'Preview ready. Starting the game will use this exact map and seed.';
        renderLobby();
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
        [mainMenuModal, mpModal, gameOverModal, playerSelectionModal, customSetupModal, playerNamesModal,
            $('starting-position-modal'), $('alliance-review-modal'), $('allied-spoils-modal')]
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
            label.innerText = `${ICONS[i]} ${PLAYERS[i].colorName}`;
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
            updateCapitalResourceOption('mp-');
            $('mp-count').value = String(m.count);
            $('mp-board-size').value = String(m.boardSize);
            $('mp-custom-options').classList.toggle('hidden', $('mp-setup-mode').value !== 'custom');
            $('mp-setup-status').innerText = m.setupBoard
                ? 'Custom placement ready. You can edit it before starting.'
                : 'Place pieces or load a saved setup before starting.';
            const ready = m.roster.slice(0, m.count).every(entry => entry && entry.connected);
            const seed = $('mp-map-seed').value.trim();
            const previewReady = seed && m.mapPreviewSignature === lobbyMapSignature(seed);
            const needsCustomSetup = $('mp-setup-mode').value === 'custom' && !m.setupBoard;
            $('btn-mp-start').disabled = !ready || (!previewReady && !needsCustomSetup);
            if (needsCustomSetup) {
                $('btn-mp-generate-map').disabled = true;
                $('mp-map-preview-status').innerText = 'Configure custom placement before previewing its map.';
            } else {
                $('btn-mp-generate-map').disabled = false;
            }
        }
    }

    function setupMatchesRoom(activePlayers) {
        return Array.isArray(activePlayers) && activePlayers.length === 4 &&
            activePlayers.every((selected, index) => selected === (index < m.count));
    }

    function editCustomSetup() {
        if (!isHost() || m.started) return;
        m.editingSetup = true;
        gameState.boardSize = m.boardSize;
        gameState.progressionMode = document.querySelector('input[name="mp-progression"]:checked').value;
        mpModal.classList.add('hidden');
        showCustomSetup([0, 1, 2, 3].map(i => i < m.count),
            m.setupBoard ? cloneSetupBoard(m.setupBoard) : null, m.setupMap);
    }

    function confirmSetup() {
        if (!isHost() || m.started || !m.editingSetup) return;
        const setup = {
            activePlayers: gameState.activePlayers,
            boardSize: gameState.boardSize,
            board: gameState.customSetupBoard,
            sandbox: true,
            map: customMapPreview?.starting || null
        };
        if (!setupMatchesRoom(setup.activePlayers) || !isValidSavedSetup(setup)) {
            customSetupStatusEl.innerText = 'Invalid sandbox data or player selection does not match the room.';
            return;
        }
        m.setupBoard = cloneSetupBoard(setup.board);
        m.setupMap = setup.map ? cloneSetupBoard(setup.map) : null;
        if (customMapPreview) {
            m.mapSeed = customMapPreview.seed;
            $('mp-map-seed').value = m.mapSeed;
        }
        m.boardSize = setup.board.length;
        m.mapPreviewSignature = null;
        $('mp-map-preview').innerHTML = '';
        $('mp-map-preview-status').innerText = 'Placement changed. Generate a new map preview before starting.';
        $('mp-board-size').value = String(m.boardSize);
        m.editingSetup = false;
        showLobby();
    }

    function cancelSetup() {
        if (!m.editingSetup) return;
        m.editingSetup = false;
        showLobby();
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
        const peer = new PaxRelay(m.code);
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
                peer.destroy();
                $('btn-mp-create').disabled = false;
                m.role = null;
                setStatus(`Could not create room: ${error.message || error.type}`, true);
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
        conn.send({ type: 'reject', reason }).then(() => conn.close());
    }

    function onHostMessage(conn, message) {
        if (!message || typeof message !== 'object') return;
        if (message.type === 'join') {
            handleJoin(conn, message);
            return;
        }
        const index = conn._slot;
        if (index === undefined || !m.slots[index] || m.slots[index].conn !== conn) return;
        if (['draft', 'commit', 'unlock', 'diplomacy', 'resource-trade', 'armour', 'purchase'].includes(message.type) &&
            PlanningTimer.expired()) {
            expirePlanning();
            syncTo(index);
            return;
        }
        if (message.type === 'draft' || message.type === 'commit') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            if (message.type === 'draft' && (!(gameState.planningTimeSeconds > 0) ||
                gameState.committed[index])) return;
            const plan = sanitizePlan(index, message.plan);
            if (!plan) {
                conn.send({ type: 'notice', text: 'Your plan was rejected by the host. Please re-plan.' });
                syncTo(index);
                return;
            }
            if (message.type === 'draft') gameState.plans[index] = plan;
            else hostSetCommit(index, true, plan);
        } else if (message.type === 'unlock') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            hostSetCommit(index, false);
        } else if (message.type === 'diplomacy') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            handleDiplomacy(index, message.target, message.action);
        } else if (message.type === 'resource-trade') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            handleResourceTrade(index, message.target, message.action, message.terms, message.id);
        } else if (message.type === 'allied-spoils') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            if (!decideAlliedSpoils(index + 1, message.id, message.action, message.target)) {
                send(conn, { type: 'notice', text: 'Allied decision rejected: the decision or participants have changed.' });
            }
            renderAlliedSpoils();
            syncNow();
        } else if (message.type === 'rename') {
            const name = cleanName(message.name, PLAYERS[index].colorName);
            m.slots[index].name = name;
            if (index === 0) m.name = name;
            m.roster = rosterFromSlots();
            PLAYERS[index].name = name;
            if (m.started) updatePlayerCards(); else renderLobby();
            broadcastSync();
        } else if (message.type === 'armour') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            handleArmourRequest(index, message.unitId);
        } else if (message.type === 'purchase') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            if (!purchaseResourceAction(index + 1, message.action, message.targetId)) {
                send(conn, { type: 'notice', text: 'Purchase rejected. Check the turn, resources, and target requirements.' });
                syncTo(index);
                return;
            }
            updatePlayerCards();
            renderBoard();
            syncNow();
        } else if (message.type === 'capture-choice') {
            if (message.gameId !== m.gameId || message.round !== gameState.round) return;
            const accepted = decideCapture(index + 1, message.captureId, message.unitId, message.fate);
            if (!accepted) {
                send(conn, { type: 'notice', text: 'Prisoner action rejected. Check ownership, battle state, and queued plans.' });
            }
            renderCaptureChoices();
            renderBoard();
            syncNow();
        } else if (message.type === 'starting-province' || message.type === 'starting-confirm') {
            if (message.gameId !== m.gameId) return;
            handleStartingPosition(index, message.type === 'starting-confirm', message.province);
        }
    }

    function handleJoin(conn, message) {
        const token = conn.remoteUserId;
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
            square.every(value => Number.isInteger(value) && value >= 0 && value < gameState.boardSize);
        if (!plan.every(entry => entry && isSquare(entry.from) && isSquare(entry.to)) ||
            !validatePrisonerPlans(index + 1, plan)) return null;
        const result = [];
        const detachedIds = new Set();
        for (const entry of plan) {
            if (!entry || !isSquare(entry.from) || !isSquare(entry.to)) return null;
            if (Math.max(Math.abs(entry.from[0] - entry.to[0]), Math.abs(entry.from[1] - entry.to[1])) > 1) return null;
            const piece = getPieceAt(...entry.from, index + 1);
            if (!piece || piece.player !== index + 1) return null;
            if (entry.prisonerAction) {
                result.push({
                    pieceId: piece.id, unitId: entry.unitId, prisonerAction: entry.prisonerAction,
                    from: [...entry.from], to: [...entry.from]
                });
                continue;
            }
            const plannedContents = getPlannedPieceContents(piece, plan);
            const plannedPiece = { ...piece, contents: plannedContents };
            const stationarySiegeAction = !entry.isUnmerge && (entry.sallyOut || entry.siegeCancel) &&
                entry.from[0] === entry.to[0] && entry.from[1] === entry.to[1];
            if (!stationarySiegeAction && !isPassableSquare(...entry.to)) return null;
            if (!stationarySiegeAction && !isTowerGateMove(entry.from, entry.to)) return null;
            const clean = { ...entry };
            if (entry.isUnmerge) {
                if (entry.sourcePieceId !== piece.id) return null;
                const ids = entry.unitIds || [entry.unitId];
                if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length) return null;
                const units = ids.map(id => getPieceContents(piece).find(unit => unit.id === id));
                if (units.some(unit => !unit || unit.type === 'r' || !plannedContents.includes(unit) ||
                    !canMoveHeldUnit(unit, plan) || detachedIds.has(unit.id)) ||
                    getSiegeAtSquare(entry.from)) return null;
                units.forEach(unit => detachedIds.add(unit.id));
                clean.unitIds = units.map(unit => unit.id);
                clean.contents = units;
                clean.pieceType = getMergedPieceType(units);
                clean.pieceId = `${piece.id}::unmerge::${clean.unitIds.join('::')}`;
                if (entry.from[0] === entry.to[0] && entry.from[1] === entry.to[1]) return null;
                const destination = getPieceAt(...entry.to);
                if (destination && destination.player !== index + 1 && isTowerPiece(destination)) return null;
            } else {
                if (entry.pieceId !== piece.id) return null;
                const target = getVisiblePiece(...entry.to, index + 1);
                const paidSiegeStart = isPawnRestTurn() && piece.type !== 'r' &&
                    target && !arePlayersFriendly(target.player, index + 1) &&
                    isTowerPiece(target) &&
                    getCombatContents(plannedPiece).some(unit => getUnitType(unit) === 'p') &&
                    (getSiegeAtSquare(entry.to) ||
                        hasPlayerResources(index + 1, { food: 2, wood: 2 }));
                if (entry.siegeAssault) {
                    const siege = getReadySiegeAssault(piece, entry.from, entry.to);
                    if (!siege || entry.siegeId !== siege.id) return null;
                } else if (entry.sallyOut) {
                    if (!isValidSallyOutPlan(piece, entry.from, entry.to, index + 1, entry.siegeId)) return null;
                } else if (!entry.siegeCancel && !canMoveWholePiece(plannedPiece, []) &&
                    !paidSiegeStart) {
                    return null;
                }
                clean.pieceType = piece.type;
                clean.contents = plannedContents;
            }
            const target = getVisiblePiece(...entry.to, index + 1);
            if (!canUnitsTarget(clean.contents, target, index + 1)) return null;
            if (!canUnitsEnterSquare(clean.contents, entry.to, index + 1)) return null;
            if (clean.contents.every(isPrisoner) && (entry.siegeAssault || entry.sallyOut || entry.siegeCancel)) return null;
            result.push(clean);
        }
        return result;
    }

    function handleArmourRequest(index, unitId) {
        if (!purchaseResourceAction(index + 1, 'armour', unitId)) return;
        updatePlayerCards();
        renderBoard();
        syncNow();
    }

    function startMatch() {
        if (!isHost() || m.started) return;
        const planningTime = PlanningTimer.readSettings('mp-');
        if (planningTime === null) return;
        const needed = m.roster.slice(0, m.count);
        if (!needed.every(entry => entry && entry.connected)) return;
        const custom = $('mp-setup-mode').value === 'custom';
        if (custom && !m.setupBoard) {
            editCustomSetup();
            return;
        }
        const seed = $('mp-map-seed').value.trim();
        if (!seed || m.mapPreviewSignature !== lobbyMapSignature(seed)) {
            setStatus('Generate a map preview before starting.', true);
            return;
        }
        m.roster.forEach((entry, index) => {
            PLAYERS[index].name = entry ? cleanName(entry.name, PLAYERS[index].colorName) : PLAYERS[index].colorName;
        });
        gameState.progressionMode = document.querySelector('input[name="mp-progression"]:checked').value;
        gameState.fogSight = $('mp-fog-sight').value;
        gameState.resourceMode = $('mp-resource-mode').value;
        gameState.resourceBalance = $('mp-resource-balance').value;
        gameState.resourceProductionInterval = Number($('mp-resource-production-interval').value || 1);
        gameState.resourceCapitals = gameState.resourceMode === '16' || $('mp-resource-capitals').checked;
        gameState.showResourcesToOthers = $('mp-show-resources-to-others').checked;
        gameState.startingArmy = $('mp-starting-army').value;
        gameState.planningTimeSeconds = planningTime;
        m.started = true;
        m.gameId++;
        gameState.multiplayer = true;
        gameState.committed = [false, false, false, false];
        startNewGame([0, 1, 2, 3].map(i => i < m.count),
            custom ? m.setupBoard : null, m.boardSize, m.mapSeed, custom ? m.setupMap : null,
            $('mp-setup-mode').value, gameState.startingArmy);
        gameState.turnIndex = m.myIndex;
        hideAllModals();
        renderStartingPositionSelection();
        btnGameOverRestart.classList.remove('hidden');
        updatePlayerCards();
        renderBoard();
        hintTextEl.innerText = 'Plan your moves, then press Commit Plans. The round resolves when everyone has committed.';
        syncNow();
    }

    function handleStartingPosition(index, confirming, province) {
        if (!m.started || gameState.phase !== 'STARTING_POSITION') return;
        const error = confirming ? confirmStartingProvince(index) : chooseStartingProvince(index, province);
        if (error) {
            if (index === m.myIndex) $('starting-position-status').innerText = error;
            else send(m.slots[index]?.conn, { type: 'notice', text: error });
            syncTo(index);
            return;
        }
        if (allStartingProvincesConfirmed()) finishStartingPositionSelection();
        else renderStartingPositionSelection();
        syncNow();
    }

    function requestStartingProvince(province) {
        if (isHost()) handleStartingPosition(m.myIndex, false, province);
        else send(m.conn, { type: 'starting-province', gameId: m.gameId, province });
    }

    function requestStartingConfirmation() {
        if (isHost()) handleStartingPosition(m.myIndex, true);
        else send(m.conn, { type: 'starting-confirm', gameId: m.gameId });
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

    function expirePlanning() {
        if (!m.started || !PlanningTimer.expired() ||
            !['PLANNING', 'COMMITTED'].includes(gameState.phase)) return;
        clearTransientUi();
        if (!isHost()) {
            refreshControls();
            return;
        }
        gameState.eliminated.forEach((eliminated, index) => {
            if (!eliminated) gameState.committed[index] = true;
        });
        gameState.phase = 'COMMITTED';
        getPendingAllianceRequests().forEach(pair => { pair.requestedBy = null; });
        gameState.resourceTrades = [];
        const text = 'Planning time expired. Plans committed; unanswered alliance and exchange requests declined.';
        logAction(text);
        toast(text);
        broadcastToClients({ type: 'notice', text });
        updatePlayerCards();
        renderBoard();
        syncNow();
        checkAllCommitted();
    }

    function checkAllCommitted() {
        if (gameState.phase === 'RESOLVING') return;
        for (let i = 0; i < 4; i++) {
            if (!gameState.eliminated[i] && !gameState.committed[i]) return;
        }
        if (hasPendingPlayerRequests()) return;
        resolveAllMoves().catch(error => {
            console.error(error);
            toast('Resolution error — see console.');
        });
    }

    function forceSkipDisconnected() {
        if (!isHost() || !['PLANNING', 'COMMITTED'].includes(gameState.phase)) return;
        if (PlanningTimer.expired()) {
            expirePlanning();
            return;
        }
        for (let i = 0; i < 4; i++) {
            if (!gameState.eliminated[i] && !gameState.committed[i] && m.roster[i] && !m.roster[i].connected) {
                gameState.plans[i] = [];
                gameState.committed[i] = true;
            }
        }
        const declined = getPendingAllianceRequests().filter(pair =>
            pair.players.some(index => m.roster[index] && !m.roster[index].connected));
        declined.forEach(pair => { pair.requestedBy = null; });
        const declinedTrades = getPendingResourceTrades().filter(trade =>
            [trade.from, trade.to].some(index => m.roster[index] && !m.roster[index].connected));
        gameState.resourceTrades = getPendingResourceTrades().filter(trade => !declinedTrades.includes(trade));
        if (declined.length || declinedTrades.length) {
            const text = 'Pending alliance and exchange requests involving skipped disconnected players were declined.';
            toast(text);
            broadcastToClients({ type: 'notice', text });
        }
        updatePlayerCards();
        renderBoard();
        syncNow();
        checkAllCommitted();
    }

    function handleDiplomacy(index, target, action) {
        if (!m.started) return;
        if (PlanningTimer.expired()) {
            expirePlanning();
            return;
        }
        const error = applyDiplomacyAction(index, target, action);
        if (error) {
            if (index === m.myIndex) toast(error);
            else send(m.slots[index]?.conn, { type: 'notice', text: error });
        }
        updatePlayerCards();
        renderBoard();
        syncNow();
        if (!error) checkAllCommitted();
    }

    async function requestDiplomacy(target, action) {
        if (PlanningTimer.expired()) {
            expirePlanning();
            return;
        }
        if (isHost()) {
            handleDiplomacy(m.myIndex, target, action);
            return;
        }
        if (!m.conn || !m.conn.open) {
            toast('Not connected to the host. Diplomacy action was not sent.');
            return;
        }
        try {
            await m.conn.send({ type: 'diplomacy', target, action, gameId: m.gameId, round: gameState.round });
        } catch (error) {
            console.error('Could not send diplomacy action:', error);
            toast(`Could not send diplomacy action: ${error.message}`);
        }
    }

    function handleResourceTrade(index, target, action, terms, id) {
        if (!m.started) return false;
        if (PlanningTimer.expired()) {
            expirePlanning();
            return false;
        }
        const error = applyResourceTradeAction(index, target, action, terms, id);
        if (error) {
            if (index === m.myIndex) {
                toast(error);
                $('resource-trade-error').innerText = error;
            } else send(m.slots[index]?.conn, { type: 'notice', text: error });
        }
        updatePlayerCards();
        renderBoard();
        syncNow();
        if (!error) checkAllCommitted();
        return !error;
    }

    async function requestResourceTrade(target, action, terms = null, id = null) {
        if (PlanningTimer.expired()) {
            expirePlanning();
            return false;
        }
        if (isHost()) return handleResourceTrade(m.myIndex, target, action, terms, id);
        if (!m.conn || !m.conn.open) {
            toast('Not connected to the host. Exchange action was not sent.');
            return false;
        }
        try {
            await m.conn.send({ type: 'resource-trade', target, action, terms, id,
                gameId: m.gameId, round: gameState.round });
            return true;
        } catch (error) {
            console.error('Could not send exchange action:', error);
            toast(`Could not send exchange action: ${error.message}`);
            return false;
        }
    }

    function beginNextRound() {
        gameState.committed = [false, false, false, false];
        gameState.turnIndex = m.myIndex;
        gameState.lockedPieceIds = new Set();
        gameState.phase = gameState.eliminated[m.myIndex] ? 'COMMITTED' : 'PLANNING';
        PlanningTimer.start();
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
        PlanningTimer.stop();
        m.started = false;
        gameState.multiplayer = false;
        $('btn-edit-names').classList.add('hidden');
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
            hostNow: Date.now(),
            game: null,
            myPlan: null
        };
        if (m.started) {
            message.game = {
                board: cloneBoardWithoutResourceStores(),
                biomes: gameState.biomes,
                hillHeld: gameState.hillHeld,
                eliminated: gameState.eliminated,
                activePlayers: gameState.activePlayers,
                capitalTowerIds: gameState.capitalTowerIds,
                horde: gameState.horde,
                round: gameState.round,
                phase: gameState.phase === 'COMMITTED' ? 'PLANNING' : gameState.phase,
                startingPosition: gameState.startingPosition,
                startingArmy: gameState.startingArmy,
                startingProvinces: gameState.startingProvinces,
                startingConfirmed: gameState.startingConfirmed,
                diplomacy: gameState.diplomacy,
                resourceTrades: getPendingResourceTrades().map(trade =>
                    trade.from === index || trade.to === index ? trade :
                        { id: trade.id, from: trade.from, to: trade.to }),
                sieges: gameState.sieges,
                retreating: (gameState.retreating || [[], [], [], []]).map(entries => entries.map(entry => ({
                    ...entry, contents: entry.contents.map(stripResourceStore)
                }))),
                deadPieces: gameState.deadPieces.map(units => units.map(stripResourceStore)),
                nextUnitSequence: gameState.nextUnitSequence,
                progressionMode: gameState.progressionMode,
                boardSize: gameState.boardSize,
                fogSight: gameState.fogSight,
                mapSeed: gameState.mapSeed,
                resourceMode: gameState.resourceMode,
                resourceBalance: gameState.resourceBalance,
                resourceCapitals: gameState.resourceCapitals,
                showResourcesToOthers: gameState.showResourcesToOthers,
                resourceProductionInterval: gameState.resourceProductionInterval,
                planningTimeSeconds: gameState.planningTimeSeconds,
                planningDeadline: gameState.planningDeadline,
                provinceResources: gameState.provinceResources,
                provinceRecruitmentUsed: gameState.provinceRecruitmentUsed || Array(16).fill(false),
                resources: gameState.resources.map((resources, i) =>
                    gameState.showResourcesToOthers || i === index ? resources : null),
                lastResourceProductionRound: gameState.lastResourceProductionRound,
                objectives: gameState.objectives.map((objectives, i) => i === index ? objectives : []),
                missionBatches: (gameState.missionBatches || [null, null, null, null])
                    .map((batch, i) => i === index ? batch : null),
                missionPoints: (gameState.missionPoints || [0, 0, 0, 0])
                    .map((points, i) => i === index ? points : null),
                scores: gameState.scores,
                pendingCapture: gameState.pendingCapture ? {
                    ...gameState.pendingCapture,
                    contents: gameState.pendingCapture.contents.map(stripResourceStore)
                } : null,
                pendingSpoils: gameState.pendingSpoils,
                gameOver: gameState.phase === 'GAME_OVER' ? {
                    title: $('gameover-title').innerText,
                    desc: $('gameover-desc').innerText
                } : null
            };
            if (gameState.committed[index] || gameState.planningTimeSeconds > 0) {
                message.myPlan = gameState.plans[index];
            }
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
        if (m.role === 'client' && m.started && gameState.planningTimeSeconds > 0 &&
            gameState.phase === 'PLANNING' && !PlanningTimer.expired() &&
            !gameState.committed[m.myIndex] && m.pendingCommit === null && m.conn?.open) {
            const plan = gameState.plans[m.myIndex];
            const signature = JSON.stringify([m.gameId, gameState.round, plan]);
            if (signature !== m.draftSignature) {
                m.draftSignature = signature;
                m.conn.send({ type: 'draft', plan, gameId: m.gameId, round: gameState.round })
                    .then(sent => { if (!sent) m.draftSignature = null; })
                    .catch(error => {
                        m.draftSignature = null;
                        console.error('Could not send planning draft:', error);
                        toast(`Could not send planning draft: ${error.message}`);
                    });
            }
        }
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
        broadcastToClients({ type: 'anim', moves: moves.map(stripResourceStoresFromPlan) });
    }

    function battleMessage() {
        return {
            type: 'battle',
            visible: !clashOverlay.classList.contains('hidden'),
            candidates: battleCandidatesEl.innerHTML,
            result: clashResult.innerText,
            color: clashResult.style.color,
            rolls: battleRollsEl.innerHTML,
            target: battleTargetSquare,
            pendingCapture: gameState.pendingCapture ? {
                ...gameState.pendingCapture,
                contents: gameState.pendingCapture.contents.map(stripResourceStore)
            } : null
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
        $('btn-mp-join').disabled = true;
        connectToHost();
    }

    function connectToHost() {
        clearTimeout(m.retryTimer);
        if (m.peer && !m.peer.destroyed) m.peer.destroy();
        setStatus('Connecting…');
        const peer = new PaxRelay();
        m.peer = peer;
        peer.on('open', () => {
            const conn = peer.connect(m.code);
            m.conn = conn;
            conn.on('open', () => conn.send({ type: 'join', name: m.name }));
            conn.on('data', onClientMessage);
            conn.on('close', onClientConnectionLost);
            conn.on('error', onClientConnectionLost);
        });
        peer.on('error', error => {
            if (error.type === 'peer-unavailable') {
                onClientConnectionLost('Room not found or host offline.');
            } else {
                onClientConnectionLost(error.message || `Network problem (${error.type}).`);
            }
        });
    }

    function onClientConnectionLost(reason) {
        if (m.role !== 'client') return;
        clearPendingCommit();
        m.draftSignature = null;
        clearTimeout(m.retryTimer);
        if (!m.joined) {
            if (m.peer) m.peer.destroy();
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
            clearPendingCommit();
            toast(message.text);
        }
    }

    function applySync(message) {
        if (m.pendingCommit !== null && message.committed &&
            message.committed[message.you] === m.pendingCommit) clearPendingCommit();
        m.code = message.code;
        m.roster = message.roster;
        m.count = message.count;
        m.myIndex = message.you;
        PLAYERS.forEach((player, index) => {
            const entry = m.roster[index];
            player.name = entry ? cleanName(entry.name, player.colorName) : player.colorName;
        });
        if (!message.started) {
            PlanningTimer.stop();
            const wasStarted = m.started;
            m.started = false;
            gameState.multiplayer = false;
            $('btn-edit-names').classList.add('hidden');
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
        $('btn-edit-names').classList.remove('hidden');
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
        const previousReleasedIds = new Set(gameState.retreating.flat()
            .filter(entry => entry.released).flatMap(entry => entry.contents.map(unit => unit.id)));
        Object.assign(gameState, {
            board: cloneBoardWithoutResourceStores(game.board),
            biomes: game.biomes,
            hillHeld: game.hillHeld,
            eliminated: game.eliminated,
            activePlayers: game.activePlayers,
            capitalTowerIds: game.capitalTowerIds || [null, null, null, null],
            horde: game.horde || [false, false, false, false],
            round: game.round,
            sieges: game.sieges,
            retreating: (game.retreating || [[], [], [], []]).map(entries => entries.map(entry => ({
                ...entry, contents: entry.contents.map(stripResourceStore)
            }))),
            deadPieces: (game.deadPieces || [[], [], [], []]).map(units => units.map(stripResourceStore)),
            nextUnitSequence: game.nextUnitSequence,
            progressionMode: game.progressionMode,
            boardSize: game.boardSize,
            fogSight: game.fogSight ?? 'medium',
            mapSeed: game.mapSeed || '',
            resourceMode: game.resourceMode,
            resourceBalance: game.resourceBalance,
            resourceCapitals: game.resourceCapitals,
            showResourcesToOthers: game.showResourcesToOthers ?? false,
            resourceProductionInterval: game.resourceProductionInterval ?? 1,
            planningTimeSeconds: game.planningTimeSeconds ?? 0,
            planningDeadline: game.planningDeadline ?? null,
            provinceResources: game.provinceResources,
            provinceRecruitmentUsed: game.provinceRecruitmentUsed || Array(16).fill(false),
            resources: game.resources,
            lastResourceProductionRound: game.lastResourceProductionRound,
            objectives: game.objectives,
            missionBatches: game.missionBatches || [null, null, null, null],
            missionPoints: game.missionPoints || [0, 0, 0, 0],
            scores: game.scores,
            committed: message.committed,
            pendingCapture: game.pendingCapture ? {
                ...game.pendingCapture,
                contents: game.pendingCapture.contents.map(stripResourceStore)
            } : null,
            pendingSpoils: game.pendingSpoils || null,
            startingPosition: game.startingPosition || 'corner',
            startingArmy: game.startingArmy || 'default',
            startingProvinces: game.startingProvinces || [null, null, null, null],
            startingConfirmed: game.startingConfirmed || [false, false, false, false],
            diplomacy: game.diplomacy ?? createDiplomacyState(),
            resourceTrades: game.resourceTrades || [],
            turnIndex: message.you
        });
        $('map-seed-display').innerText = `Map seed: ${gameState.mapSeed}`;
        gameState.phase = game.phase === 'PLANNING' && (message.committed[message.you] || game.eliminated[message.you])
            ? 'COMMITTED'
            : game.phase;
        renderStartingPositionSelection();
        renderCaptureChoices();
        renderAlliedSpoils();
        if (message.myPlan && (gameState.planningTimeSeconds > 0
            ? isNewRound || message.committed[message.you]
            : !gameState.plans[message.you].length)) {
            gameState.plans[message.you] = message.myPlan;
        }
        cancelReleasedPrisonerPlans(new Set(gameState.retreating.flat()
            .filter(entry => entry.released).flatMap(entry => entry.contents.map(unit => unit.id))
            .filter(id => !previousReleasedIds.has(id))));
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
        PlanningTimer.refresh(message.hostNow ?? null);
    }

    function applyBattle(message) {
        gameState.pendingCapture = message.pendingCapture || null;
        renderCaptureChoices();
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

    function clearPendingCommit() {
        clearTimeout(m.pendingTimer);
        m.pendingTimer = null;
        m.pendingCommit = null;
        if (m.started) refreshControls();
    }

    async function toggleCommit() {
        const me = m.myIndex;
        if (gameState.eliminated[me] || m.pendingCommit !== null) return;
        if (!['PLANNING', 'COMMITTED'].includes(gameState.phase)) return;
        if (PlanningTimer.expired()) {
            expirePlanning();
            return;
        }
        const locked = gameState.phase === 'PLANNING';
        const gameId = m.gameId;
        const round = gameState.round;
        const plan = JSON.parse(JSON.stringify(gameState.plans[me]));
        m.pendingCommit = locked;
        clearTransientUi();
        refreshControls();
        if (isHost()) {
            try {
                await m.peer.rpc('pax_host_turn', {
                    p_code: m.code, p_game: gameId, p_round: round,
                    p_plan: plan, p_locked: locked
                });
                if (m.started && m.gameId === gameId && gameState.round === round &&
                    gameState.phase === (locked ? 'PLANNING' : 'COMMITTED') && !PlanningTimer.expired()) {
                    hostSetCommit(me, locked, locked ? plan : null);
                }
            } catch (error) {
                console.error('Could not save host turn:', error);
                toast(`Could not save your plan: ${error.message}`);
            } finally {
                clearPendingCommit();
            }
            return;
        }
        if (!m.conn || !m.conn.open) {
            clearPendingCommit();
            toast('Not connected to the room.');
            return;
        }
        if (locked) {
            clearTransientUi();
            await m.conn.send({ type: 'commit', plan, gameId, round });
        } else {
            await m.conn.send({ type: 'unlock', gameId, round });
        }
        if (m.pendingCommit !== null) {
            m.pendingTimer = setTimeout(() => {
                clearPendingCommit();
                toast('The host did not acknowledge your plan. Check your connection and try again.');
            }, 15000);
        }
    }

    function requestArmourUpgrade(unitId) {
        if (m.conn && m.conn.open) {
            requestPurchase('armour', unitId);
        }
    }

    function requestPurchase(action, targetId = null) {
        if (!m.conn || !m.conn.open) {
            toast('Not connected to the room. Purchase was not sent.');
            return;
        }
        m.conn.send({ type: 'purchase', action, targetId, gameId: m.gameId, round: gameState.round });
    }

    function requestCaptureDecision(captureId, unitId, fate) {
        if (!m.conn || !m.conn.open) {
            toast('Not connected to the host. Capture decision was not sent.');
            return;
        }
        m.conn.send({ type: 'capture-choice', captureId, unitId, fate, gameId: m.gameId, round: gameState.round });
    }

    function getRosterEntry(index) {
        return m.roster[index];
    }

    function renameMyPlayer(value) {
        const index = m.myIndex;
        const name = cleanName(value, PLAYERS[index].colorName);
        if (isHost()) {
            if (!m.slots[index]) return;
            PLAYERS[index].name = name;
            m.name = name;
            m.slots[index].name = name;
            m.roster = rosterFromSlots();
            if (m.started) updatePlayerCards(); else renderLobby();
            broadcastSync();
        } else if (m.conn && m.conn.open) {
            PLAYERS[index].name = name;
            m.name = name;
            if (m.roster[index]) m.roster[index].name = name;
            m.conn.send({ type: 'rename', name });
        } else {
            toast('Not connected to the host. Your name was not updated.');
        }
    }

    function getBadge(index) {
        const entry = getRosterEntry(index);
        if (!entry) return { text: 'Open', ready: false };
        if (!entry.connected) return { text: 'Disconnected', ready: false };
        if (gameState.phase === 'STARTING_POSITION') {
            return { text: gameState.startingConfirmed[index] ? 'Province confirmed' : 'Choosing province…',
                ready: gameState.startingConfirmed[index] };
        }
        if (gameState.phase === 'RESOLVING') return { text: 'Resolving', ready: false };
        if (gameState.committed[index]) return { text: 'Locked in ✔', ready: true };
        return { text: 'Planning…', ready: false };
    }

    function describePhase() {
        const me = m.myIndex;
        if (gameState.phase === 'STARTING_POSITION') return 'Choose your starting province and confirm the agreement.';
        if (gameState.phase === 'RESOLVING') return 'Resolving the round: move, merge, then battles.';
        if (gameState.phase === 'GAME_OVER') return 'Game over.';
        if (gameState.eliminated[me]) return 'You were eliminated. Spectating until the match ends.';
        if (gameState.phase === 'COMMITTED') {
            const waiting = PLAYERS
                .filter((player, i) => !gameState.eliminated[i] && !gameState.committed[i])
                .map(player => player.name);
            const pending = getPendingAllianceRequests().length;
            const trades = getPendingResourceTrades().length;
            return `Plan locked. Waiting for: ${waiting.join(', ') || 'no more plans'}.${pending ? ` ${pending} alliance request(s) must be answered on the player cards before resolution.` : ''}${trades ? ` ${trades} exchange request(s) must be answered on the player cards before resolution.` : ''}${PlanningTimer.expired() ? '' : ' You can unlock to change it.'}`;
        }
        return 'Plan moves for your pieces, then Commit Plans.';
    }

    function refreshControls() {
        for (let i = 0; i < 4; i++) {
            const label = $(`card-p${i + 1}`).querySelector('.player-name');
            const entry = getRosterEntry(i);
            label.innerText = `${ICONS[i]} ${entry ? entry.name : `Player ${i + 1}`} (${PLAYERS[i].colorName})`;
        }
        const me = m.myIndex;
        const canAct = ['PLANNING', 'COMMITTED'].includes(gameState.phase) && !gameState.eliminated[me];
        btnFinishPlan.disabled = !canAct || m.pendingCommit !== null || PlanningTimer.expired();
        const canUnlock = gameState.phase === 'COMMITTED' && !gameState.eliminated[me];
        $('commit-plan-icon').innerText = canUnlock ? '↶' : '✓';
        $('commit-plan-label').innerText = canUnlock ? 'Unlock Plan' : 'Commit Plans';
        btnFinishPlan.setAttribute('aria-label', canUnlock ? 'Unlock Plan' : 'Commit Plans');
        btnRestart.innerText = isHost() ? '🔄 Restart Room' : '🚪 Leave';
        activePlayerDescEl.innerText = describePhase();
        btnForceSkip.classList.toggle('hidden', !(isHost() && ['PLANNING', 'COMMITTED'].includes(gameState.phase) &&
            [0, 1, 2, 3].some(i => !gameState.eliminated[i] &&
                (!gameState.committed[i] || getPendingAllianceRequests().some(pair => pair.players.includes(i)) ||
                    getPendingResourceTrades().some(trade => trade.from === i || trade.to === i)) &&
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
    $('btn-mp-generate-map').addEventListener('click', generateLobbyMapPreview);
    $('btn-mp-setup').addEventListener('click', editCustomSetup);
    $('mp-setup-mode').addEventListener('change', () => invalidateLobbyMapPreview());
    $('mp-starting-army').addEventListener('change', () => invalidateLobbyMapPreview());
    $('mp-map-seed').addEventListener('input', () => invalidateLobbyMapPreview());
    document.querySelectorAll('input[name="mp-progression"]').forEach(input =>
        input.addEventListener('change', () => invalidateLobbyMapPreview()));
    $('btn-custom-setup-back').addEventListener('click', cancelSetup);
    $('btn-mp-back').addEventListener('click', () => {
        if (m.role) location.reload();
        else showMainMenu();
    });
    $('mp-count').addEventListener('change', event => {
        const highestOccupied = m.slots.reduce((max, slot, i) => slot ? i + 1 : max, 0);
        const count = Math.max(Number(event.target.value), highestOccupied, 2);
        if (count !== m.count && m.setupBoard) {
            m.setupBoard = null;
            m.setupMap = null;
            toast('Player count changed. Please configure custom placement again.');
        }
        m.count = count;
        invalidateLobbyMapPreview();
        broadcastSync();
    });
    $('mp-board-size').addEventListener('change', event => {
        const boardSize = Number(event.target.value);
        if (!BOARD_SIZES.includes(boardSize)) return;
        if (boardSize !== m.boardSize && m.setupBoard) {
            m.setupBoard = null;
            m.setupMap = null;
            toast('Board size changed. Please configure custom placement again.');
        }
        m.boardSize = boardSize;
        invalidateLobbyMapPreview();
    });
    $('mp-resource-mode').addEventListener('change', () => invalidateLobbyMapPreview());
    $('mp-resource-balance').addEventListener('change', () => invalidateLobbyMapPreview());
    $('mp-resource-capitals').addEventListener('change', () => invalidateLobbyMapPreview());
    $('btn-menu').addEventListener('click', leaveToMenu);
    $('btn-custom-menu').addEventListener('click', leaveToMenu);
    $('btn-selection-menu').addEventListener('click', leaveToMenu);
    btnForceSkip.addEventListener('click', forceSkipDisconnected);
    initializeHostObservers();
    // Close promptly when possible; the relay also expires missed heartbeats.
    window.addEventListener('pagehide', () => { if (m.peer && !m.peer.destroyed) m.peer.destroy(); });

    return {
        showMainMenu,
        isHost,
        isEditingSetup: () => m.editingSetup,
        setupMatchesRoom,
        confirmSetup,
        isPendingCommit: () => m.pendingCommit !== null,
        toggleCommit,
        expirePlanning,
        requestArmourUpgrade,
        requestPurchase,
        requestCaptureDecision,
        requestDiplomacy,
        requestResourceTrade,
        syncAlliedState: syncNow,
        requestAlliedSpoils: (id, action, target) => {
            if (!m.conn || !m.conn.open) {
                toast('Not connected to the host. Allied decision was not sent.');
                return;
            }
            m.conn.send({ type: 'allied-spoils', id, action, target, gameId: m.gameId, round: gameState.round })
                .catch(error => toast(`Could not send allied decision: ${error.message}`));
        },
        requestStartingProvince,
        requestStartingConfirmation,
        onBoardRendered,
        broadcastResolutionStart,
        beginNextRound,
        onGameOver,
        onNewGameRequested,
        getBadge,
        refreshControls,
        getMyIndex: () => m.myIndex,
        renameMyPlayer
    };
})();
