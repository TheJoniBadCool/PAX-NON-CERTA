function getAdjacentMoves(r, c) {
    const directions = [
        [-1,-1], [-1,0], [-1,1],
        [0,-1],          [0,1],
        [1,-1],  [1,0],   [1,1]
    ];
    return directions
        .map(([dr, dc]) => [r + dr, c + dc])
        .filter(([tr, tc]) => tr >= 0 && tr < 16 && tc >= 0 && tc < 16);
}

// Universal 1-Square Movement Rule in all 8 directions
function getValidMovesForPiece(r, c) {
    const piece = gameState.board[r][c];
    if (!piece || isEliminatedPiece(piece) || gameState.lockedPieceIds.has(piece.id)) return [];
    if (getSiegeAtSquare([r, c])) return [];

    const attackerSiege = getSiegeForAttacker(piece.id);
    if (attackerSiege) {
        const attacker = getSiegeAttacker(piece.id);
        const tower = gameState.board[attackerSiege.towerSquare[0]][attackerSiege.towerSquare[1]];
        return attacker && attacker.timer === 0 &&
            tower && isTowerPiece(tower) &&
            getPieceContents(piece).some(unit => getUnitType(unit) === 'p') &&
            isAdjacentSquare([r, c], attackerSiege.towerSquare)
            ? [attackerSiege.towerSquare]
            : [];
    }
    if (piece.type === 'r') return []; // Towers and stacks led by Towers are immovable.

    const moves = [];
    const activePlayerId = gameState.turnIndex + 1;
    const currentPlans = gameState.plans[gameState.turnIndex];

    const directions = [
        [-1,-1], [-1,0], [-1,1],
        [0,-1],          [0,1],
        [1,-1],  [1,0],   [1,1]
    ];

    for (const [dr, dc] of directions) {
        const tr = r + dr;
        const tc = c + dc;
        if (tr >= 0 && tr < 16 && tc >= 0 && tc < 16) {
            const targetPiece = gameState.board[tr][tc];
            if (targetPiece && targetPiece.player !== activePlayerId &&
                isTowerPiece(targetPiece) &&
                !getPieceContents(piece).some(unit => getUnitType(unit) === 'p')) {
                continue;
            }
            if (targetPiece && targetPiece.player === activePlayerId) {
                const targetIsMovingAway = currentPlans.some(p => p.from[0] === tr && p.from[1] === tc);
                if (!targetIsMovingAway || targetPiece.type === 'r') {
                    moves.push([tr, tc]);
                    continue;
                }
            }
            moves.push([tr, tc]);
        }
    }
    return moves;
}
