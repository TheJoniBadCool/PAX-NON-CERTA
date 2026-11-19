function chooseStartingProvince(index, province) {
    if (gameState.phase !== 'STARTING_POSITION' || !gameState.activePlayers[index] ||
        gameState.startingConfirmed[index]) return 'Your starting position is already locked or unavailable.';
    if (province !== null && (!Number.isInteger(province) || province < 0 || province >= 16)) {
        return 'Choose a valid province.';
    }
    if (province !== null && gameState.startingProvinces.some((value, player) =>
        player !== index && value === province)) return 'That province is already claimed.';
    gameState.startingProvinces[index] = province;
    return '';
}

function confirmStartingProvince(index) {
    if (gameState.phase !== 'STARTING_POSITION' || !gameState.activePlayers[index] ||
        gameState.startingProvinces[index] === null) return 'Choose your province before confirming.';
    gameState.startingConfirmed[index] = true;
    return '';
}

function allStartingProvincesConfirmed() {
    return gameState.activePlayers.every((active, index) => !active || gameState.startingConfirmed[index]);
}

function applyStartingProvinces() {
    const provinces = gameState.startingProvinces.filter((_, index) => gameState.activePlayers[index]);
    if (!allStartingProvincesConfirmed() || provinces.some(value =>
        !Number.isInteger(value) || value < 0 || value >= 16) || new Set(provinces).size !== provinces.length) {
        throw new Error('All players must confirm distinct starting provinces.');
    }
    const random = createSeededRandom(`${gameState.mapSeed}:starting-armies`);
    gameState.activePlayers.forEach((active, index) => {
        if (!active) return;
        const province = gameState.startingProvinces[index];
        gameState.board.forEach((row, r) => row.forEach((piece, c) => {
            if (!piece || getProvinceIndex(r, c, gameState.boardSize) !== province) return;
            if (!isTowerPiece(piece)) {
                row[c] = null;
                return;
            }
            const gate = getTowerGate(piece);
            const castle = createPlayerCastle(index, random, gameState.progressionMode,
                gameState.startingArmy);
            getPieceContents(castle).filter(unit => unit.type === 'r')
                .forEach(unit => { unit.gate = [...gate]; });
            row[c] = castle;
        }));
    });
    gameState.phase = 'PLANNING';
    initializeCapitals();
}

let startingPositionPlayer = 0;

function renderStartingPositionSelection() {
    const modal = document.getElementById('starting-position-modal');
    const choosing = gameState.phase === 'STARTING_POSITION';
    modal.classList.toggle('hidden', !choosing);
    if (!choosing) return;
    if (gameState.multiplayer) startingPositionPlayer = Multiplayer.getMyIndex();
    else if (!gameState.activePlayers[startingPositionPlayer]) {
        startingPositionPlayer = gameState.activePlayers.findIndex(Boolean);
    }
    const players = document.getElementById('starting-position-players');
    players.innerHTML = '';
    gameState.activePlayers.forEach((active, index) => {
        if (!active) return;
        const button = document.createElement('button');
        button.className = `btn btn-secondary${index === startingPositionPlayer ? ' starting-position-active' : ''}`;
        button.style.borderColor = PLAYERS[index].color;
        button.setAttribute('aria-pressed', String(index === startingPositionPlayer));
        const province = gameState.startingProvinces[index];
        button.innerText = `${PLAYERS[index].name}: ${province === null ? 'choose province' : `province ${province + 1}`}${gameState.startingConfirmed[index] ? ' (confirmed)' : ''}`;
        button.disabled = gameState.multiplayer;
        button.addEventListener('click', () => {
            startingPositionPlayer = index;
            renderStartingPositionSelection();
        });
        players.appendChild(button);
    });
    const board = document.getElementById('starting-position-board');
    renderMapPreview(board, gameState, gameState.boardSize);
    Array.from(board.children).forEach((square, cell) => {
        const r = Math.floor(cell / gameState.boardSize);
        const c = cell % gameState.boardSize;
        const province = getProvinceIndex(r, c, gameState.boardSize);
        const owner = gameState.startingProvinces.indexOf(province);
        const unavailable = gameState.startingConfirmed[startingPositionPlayer] ||
            (owner !== -1 && owner !== startingPositionPlayer);
        if (owner !== -1) {
            square.classList.add(`zone-p${owner + 1}`, 'starting-province-selected');
            square.style.color = PLAYERS[owner].color;
            square.style.boxShadow = `inset 0 0 0 100px ${PLAYERS[owner].color}33`;
        }
        square.classList.toggle('starting-province-unavailable', unavailable);
        const provinceSize = gameState.boardSize / 4;
        square.classList.toggle('province-top', r % provinceSize === 0);
        square.classList.toggle('province-left', c % provinceSize === 0);
        square.title += ` · Province ${province + 1}${owner === -1 ? '' : ` · ${PLAYERS[owner].name}`}`;
        square.setAttribute('role', 'button');
        square.setAttribute('aria-label', square.title);
        square.setAttribute('aria-disabled', String(unavailable));
        square.setAttribute('aria-pressed', String(owner === startingPositionPlayer));
        square.tabIndex = unavailable ? -1 : 0;
        const choose = () => {
            const value = gameState.startingProvinces[startingPositionPlayer] === province ? null : province;
            if (gameState.multiplayer) {
                Multiplayer.requestStartingProvince(value);
            } else {
                const error = chooseStartingProvince(startingPositionPlayer, value);
                renderStartingPositionSelection();
                if (error) document.getElementById('starting-position-status').innerText = error;
            }
        };
        square.addEventListener('click', choose);
        square.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            choose();
        });
    });
    const confirmed = gameState.startingConfirmed[startingPositionPlayer];
    document.getElementById('starting-position-status').innerText = gameState.multiplayer
        ? (confirmed ? 'Confirmed. Waiting for the other players.' : 'Choose your province, then confirm to lock it.')
        : `Assigning ${PLAYERS[startingPositionPlayer].name}: choose a province, or switch players above. Confirm when everyone has a province.`;
    document.getElementById('btn-confirm-starting-position').disabled = gameState.multiplayer
        ? confirmed || gameState.startingProvinces[startingPositionPlayer] === null
        : gameState.activePlayers.some((active, index) => active && gameState.startingProvinces[index] === null);
}

function finishStartingPositionSelection() {
    applyStartingProvinces();
    initializeObjectives();
    if (typeof initializeMissions === 'function') initializeMissions();
    PlanningTimer.start();
    renderStartingPositionSelection();
    updatePlayerCards();
    renderBoard();
}

document.getElementById('btn-confirm-starting-position').addEventListener('click', () => {
    if (gameState.multiplayer) {
        Multiplayer.requestStartingConfirmation();
        return;
    }
    if (gameState.phase !== 'STARTING_POSITION') return;
    if (gameState.activePlayers.some((active, index) => active && gameState.startingProvinces[index] === null)) {
        document.getElementById('starting-position-status').innerText = 'Choose a province for every player.';
        return;
    }
    gameState.activePlayers.forEach((active, index) => { if (active) confirmStartingProvince(index); });
    finishStartingPositionSelection();
});

document.getElementById('btn-exit-starting-position').addEventListener('click', () => {
    if (gameState.multiplayer) Multiplayer.onNewGameRequested();
    else {
        document.getElementById('starting-position-modal').classList.add('hidden');
        showPlayerSelection();
    }
});
