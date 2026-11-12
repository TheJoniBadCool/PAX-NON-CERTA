function coordsToNotation(r, c) {
    const files = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];
    return `${files[c]}${16 - r}`;
}

function getSiegeAtSquare(square) {
    return gameState.sieges.find(siege =>
        siege.towerSquare[0] === square[0] && siege.towerSquare[1] === square[1]
    );
}

function getSiegeForAttacker(pieceId) {
    return gameState.sieges.find(siege =>
        siege.attackers.some(attacker => attacker.pieceId === pieceId)
    );
}

function getSiegeAttacker(pieceId) {
    const siege = getSiegeForAttacker(pieceId);
    return siege ? siege.attackers.find(attacker => attacker.pieceId === pieceId) : null;
}

function isTowerPiece(piece) {
    return Boolean(piece && getPieceContents(piece).some(unit => getUnitType(unit) === 'r'));
}

function isAdjacentSquare(first, second) {
    return Math.max(Math.abs(first[0] - second[0]), Math.abs(first[1] - second[1])) === 1;
}

function isEliminatedPiece(piece) {
    return Boolean(piece && gameState.eliminated[piece.player - 1]);
}

function getPieceClass(piece) {
    const player = PLAYERS[piece.player - 1];
    return `${player ? player.class : ''}${isEliminatedPiece(piece) ? ' piece-eliminated' : ''}`;
}
