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

function towersAreSpaced(board) {
    const towers = [];
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            const piece = board[r][c];
            if (!piece) continue;
            const count = getPieceContents(piece).filter(unit => getUnitType(unit) === 'r').length;
            if (count > 1 || (count && towers.some(([tr, tc]) =>
                Math.max(Math.abs(tr - r), Math.abs(tc - c)) < 3))) return false;
            if (count) towers.push([r, c]);
        }
    }
    return true;
}

function getTowerGate(piece) {
    const tower = piece && getPieceContents(piece).find(unit => getUnitType(unit) === 'r');
    return tower ? tower.gate : null;
}

function isTowerGateMove(from, to) {
    const source = gameState.board[from[0]][from[1]];
    const target = gameState.board[to[0]][to[1]];
    const matchesGate = (tower, towerSquare, otherSquare) => {
        const gate = getTowerGate(tower);
        return Array.isArray(gate) &&
            towerSquare[0] + gate[0] === otherSquare[0] &&
            towerSquare[1] + gate[1] === otherSquare[1];
    };
    return (!isTowerPiece(source) || matchesGate(source, from, to)) &&
        (!isTowerPiece(target) || matchesGate(target, to, from));
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
