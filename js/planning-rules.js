function getPendingHeldIndices(piece, currentPlans) {
    return new Set(currentPlans
        .filter(move => move.isUnmerge && move.sourcePieceId === piece.id)
        .map(move => move.heldIndex));
}

function getAllPlannedMoves() {
    const moves = [];
    if (gameState.multiplayer && gameState.phase === 'RESOLVING') return moves;
    gameState.plans[gameState.turnIndex].forEach(move =>
        moves.push({ ...move, player: gameState.turnIndex + 1 }));
    return moves;
}

function getPlanArrowKind(move, allMoves) {
    if (move.transfer) return 'blue';

    const destinationMoves = allMoves.filter(other =>
        other.to[0] === move.to[0] && other.to[1] === move.to[1]
    );
    const enemyDestinationMove = destinationMoves.some(other => other.player !== move.player);
    const destinationPiece = gameState.board[move.to[0]][move.to[1]];
    const destinationPieceMovesAway = allMoves.some(other =>
        other.from[0] === move.to[0] && other.from[1] === move.to[1]
    );
    const enemyStationaryTarget = destinationPiece &&
        destinationPiece.player !== move.player &&
        !destinationPieceMovesAway;
    const enemySwap = allMoves.some(other =>
        other.player !== move.player &&
        other.from[0] === move.to[0] && other.from[1] === move.to[1] &&
        other.to[0] === move.from[0] && other.to[1] === move.from[1]
    );

    if (enemyDestinationMove || enemyStationaryTarget || enemySwap) return 'red';
    if (move.mergeAccepted) return 'yellow';

    const samePlayerDestinationMoves = destinationMoves.filter(other =>
        other.player === move.player
    );
    if (samePlayerDestinationMoves.length > 1) return 'yellow';

    return 'green';
}
