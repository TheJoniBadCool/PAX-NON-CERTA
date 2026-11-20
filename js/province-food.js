const PROVINCE_FOOD_MAX = 6;

function reconcileProvinceFood() {
    const owners = getProvinceOwners(gameState.board);
    owners.forEach((owner, province) => {
        if (gameState.provinceFoodOwners[province] !== owner) {
            gameState.provinceFood[province] = owner ? PROVINCE_FOOD_MAX : null;
            gameState.provinceFoodOwners[province] = owner;
        }
    });
}

function canRefillProvinceFood(player, province) {
    return Number.isInteger(province) && province >= 0 && province < 16 &&
        player >= 1 && player <= 4 && gameState.activePlayers[player - 1] &&
        !gameState.eliminated[player - 1] &&
        ['PLANNING', 'COMMITTED'].includes(gameState.phase) &&
        (!gameState.multiplayer || !gameState.committed[player - 1]) &&
        getProvinceOwners(gameState.board)[province] === player &&
        gameState.provinceFoodOwners[province] === player &&
        gameState.provinceFood[province] < PROVINCE_FOOD_MAX &&
        hasPlayerResources(player, { food: 1 });
}

function refillProvinceFood(player, province) {
    if (!canRefillProvinceFood(player, province) || !spendPlayerResources(player, { food: 1 })) return false;
    gameState.provinceFood[province]++;
    logAction(`Player ${player} supplied province ${province + 1} with 1 Food.`);
    return true;
}

function rebelProvince(province, owner, completedRound) {
    const towers = [];
    gameState.board.forEach((row, r) => row.forEach((square, c) => {
        if (getProvinceIndex(r, c, gameState.boardSize) !== province) return;
        const pieces = getSquarePieces(square);
        if (!pieces.some(piece => piece.player === owner && isTowerPiece(piece))) return;
        const remainingPieces = [];
        const releasedRebels = [];
        pieces.forEach(piece => {
            const contents = getPieceContents(piece);
            const remainingTowers = piece.player === owner
                ? contents.filter(unit => getUnitType(unit) === 'r' && !isPrisoner(unit)) : [];
            const occupants = contents.filter(unit => !remainingTowers.includes(unit));
            const rebelPrisoners = occupants.filter(unit => isPrisoner(unit) &&
                unit.originalPlayer === REBEL_PLAYER_ID);
            releasedRebels.push(...rebelPrisoners.map(restorePrisoner));
            const players = new Set(occupants.map(unit => isPrisoner(unit)
                ? unit.originalPlayer || unit.player : unit.player));
            players.forEach(player => {
                if (player === REBEL_PLAYER_ID && occupants.every(unit =>
                    (unit.originalPlayer || unit.player) !== player || isPrisoner(unit))) return;
                if (player < 1 || player > 4) throw new Error('Invalid owner of a Tower occupant.');
                const prisoners = occupants.filter(unit => isPrisoner(unit) &&
                    (unit.originalPlayer || unit.player) === player);
                const troops = occupants.filter(unit => !isPrisoner(unit) && unit.player === player);
                queueRetreat(player, troops, [r, c], false, completedRound);
                queueRetreat(player, prisoners.map(restorePrisoner), [r, c], true, completedRound);
            });
            if (remainingTowers.length) {
                piece.player = REBEL_PLAYER_ID;
                piece.contents = remainingTowers.map(unit => ({ ...unit, player: REBEL_PLAYER_ID }));
                piece.type = 'r';
                delete piece.isGray;
                towers.push(piece);
                remainingPieces.push(piece);
            }
        });
        if (!remainingPieces.length) throw new Error(`Rebelling province ${province + 1} has no Tower.`);
        remainingPieces[0].contents.push(...releasedRebels);
        setPiecesAt(r, c, remainingPieces);
    }));
    const available = [];
    gameState.board.forEach((row, r) => row.forEach((square, c) => {
        if (getProvinceIndex(r, c, gameState.boardSize) === province &&
            !square && isPassableSquare(r, c)) available.push([r, c]);
    }));
    const id = `rebel_shortage_${gameState.round}_${province}_${Math.random()}`;
    const pawn = createUnit(REBEL_PLAYER_ID, 'p', `${id}::pawn`, 'Rebel pawn');
    if (available.length) {
        const [r, c] = available[Math.floor(Math.random() * available.length)];
        gameState.board[r][c] = { id, player: REBEL_PLAYER_ID, type: 'p', contents: [pawn] };
    } else {
        if (!towers.length) throw new Error(`Rebelling province ${province + 1} has no Tower.`);
        towers[0].contents.push(pawn);
    }
    logAction(`Province ${province + 1} rebelled against Player ${owner} due to food shortage.`);
}

function resolveProvinceFood(completedRound) {
    reconcileProvinceFood();
    if (completedRound <= 0 || completedRound % 4 !== 0 ||
        (gameState.lastProvinceFoodRound !== null && completedRound <= gameState.lastProvinceFoodRound)) return;
    gameState.lastProvinceFoodRound = completedRound;
    gameState.provinceFoodOwners.forEach((owner, province) => {
        if (!owner || !gameState.activePlayers[owner - 1] || gameState.eliminated[owner - 1]) return;
        gameState.provinceFood[province]--;
        if (gameState.provinceFood[province] === 0) rebelProvince(province, owner, completedRound);
    });
    reconcileProvinceFood();
    syncSieges();
    reconcileCapitals();
    refreshResourceTotals();
}
