function coordsToNotation(r, c) {
    const files = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];
    return `${files[c]}${gameState.boardSize - r}`;
}

function getBiome(r, c) {
    return gameState.biomes?.[r]?.[c] || 'plains';
}

function isPassableSquare(r, c) {
    return getBiome(r, c) !== 'mountain';
}

function isConcealedPiece(piece, r, c, viewer = gameState.turnIndex + 1) {
    return Boolean(piece && piece.player !== viewer && getBiome(r, c) === 'forest' &&
        gameState.phase !== 'GAME_OVER');
}

function getVisiblePiece(r, c, viewer = gameState.turnIndex + 1) {
    const piece = gameState.board[r][c];
    return isConcealedPiece(piece, r, c, viewer) ? null : piece;
}

function snapshotHillOccupants() {
    return gameState.board.map((row, r) => row.map((piece, c) =>
        piece && getBiome(r, c) === 'hill'
            ? { player: piece.player, ids: getCombatContents(piece).map(unit => unit.id) }
            : null));
}

function updateHillHeld(start, moves) {
    const moved = new Set(moves.filter(move => !move.invalid && !move.siegeStart &&
        !move.sallyOut && !move.siegeCancel).flatMap(move => move.contents.map(unit => unit.id)));
    gameState.hillHeld = gameState.board.map((row, r) => row.map((piece, c) => {
        const previous = start[r][c];
        if (!piece || !previous || piece.player !== previous.player) return null;
        const ids = getCombatContents(piece).map(unit => unit.id)
            .filter(id => previous.ids.includes(id) && !moved.has(id));
        return ids.length ? { player: piece.player, ids } : null;
    }));
}

function getDefenderTerrainBonus(candidate, square) {
    if (!candidate.isStationary || !square) return 0;
    const [r, c] = square;
    if (getBiome(r, c) === 'forest') return 0.25;
    const held = gameState.hillHeld?.[r]?.[c];
    return getBiome(r, c) === 'hill' && held && held.player === candidate.player &&
        getCombatContents(candidate).some(unit => held.ids.includes(unit.id)) ? 0.25 : 0;
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
    const unit = getPieceContents(piece).find(entry => entry.type === piece.type && !isPrisoner(entry)) ||
        getPieceContents(piece).find(entry => entry.type === piece.type);
    if (unit && isPrisoner(unit)) return getUnitDisplayClass(unit, piece.player);
    const player = PLAYERS[piece.player - 1];
    return `${player ? player.class : ''}${isEliminatedPiece(piece) ? ' piece-eliminated' : ''}`;
}
