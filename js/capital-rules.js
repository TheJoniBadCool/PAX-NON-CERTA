function getOwnedCapitalTowers(player) {
    return gameState.board.flatMap(row => row.flatMap(piece => {
        if (!piece || piece.player !== player) return [];
        return getPieceContents(piece).filter(unit =>
            getUnitType(unit) === 'r' && !isPrisoner(unit));
    }));
}

function initializeCapitals(random = Math.random) {
    gameState.capitalTowerIds = Array(4).fill(null);
    gameState.horde = Array(4).fill(false);
    gameState.activePlayers.forEach((active, index) => {
        if (!active) return;
        const towers = getOwnedCapitalTowers(index + 1);
        if (!towers.length) {
            gameState.horde[index] = true;
            return;
        }
        gameState.capitalTowerIds[index] = towers[Math.floor(random() * towers.length)].id;
    });
}

function reconcileCapitals(random = Math.random) {
    gameState.capitalTowerIds ||= [null, null, null, null];
    gameState.horde ||= [false, false, false, false];
    gameState.activePlayers.forEach((active, index) => {
        if (!active) {
            gameState.capitalTowerIds[index] = null;
            gameState.horde[index] = false;
            return;
        }
        const towers = getOwnedCapitalTowers(index + 1);
        if (towers.some(tower => tower.id === gameState.capitalTowerIds[index])) {
            gameState.horde[index] = false;
        } else if (!towers.length) {
            gameState.capitalTowerIds[index] = null;
            gameState.horde[index] = true;
        } else {
            gameState.capitalTowerIds[index] = towers[Math.floor(random() * towers.length)].id;
            gameState.horde[index] = false;
        }
    });
}

function isCapitalTower(piece) {
    if (!piece || piece.player < 1 || piece.player > 4) return false;
    const capitalId = gameState.capitalTowerIds[piece.player - 1];
    return Boolean(capitalId && getPieceContents(piece).some(unit =>
        unit.id === capitalId && getUnitType(unit) === 'r' && !isPrisoner(unit)));
}
