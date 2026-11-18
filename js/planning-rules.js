function getPendingHeldIndices(piece, currentPlans) {
    return new Set(currentPlans
        .filter(move => (move.isUnmerge && move.sourcePieceId === piece.id) ||
            (move.prisonerAction && move.pieceId === piece.id))
        .flatMap(move => move.prisonerAction
            ? [getPieceContents(piece).findIndex(unit => unit.id === move.unitId)]
            : getPieceContents(piece).flatMap((unit, index) =>
                (move.unitIds || [move.unitId]).includes(unit.id) ? [index] : [])));
}

function getHeldSelectionUnavailableReason(piece, unit, square) {
    if (unit.type === 'r') return 'Towers cannot be unmerged or transferred.';
    if (getSiegeAtSquare(square)) return 'Defending pieces cannot leave a Tower under siege.';
    const plans = gameState.plans[gameState.turnIndex];
    if (getPendingHeldIndices(piece, plans).has(getPieceContents(piece).findIndex(entry => entry.id === unit.id))) {
        return 'This unit already has an unmerge, transfer, release, or execution plan.';
    }
    if (!canMoveHeldUnit(unit)) return 'Pawns and prisoners cannot move on even-numbered rounds.';
    return '';
}

function getHeldGroupUnits(piece, selection) {
    const ids = selection.unitIds || [selection.unitId];
    const units = ids.map(id => getPieceContents(piece).find(unit => unit.id === id));
    return ids.length && new Set(ids).size === ids.length && units.every(Boolean) ? units : [];
}

function queueHeldGroupPlan(sourcePiece, selection, destination, targetPiece) {
    const units = getHeldGroupUnits(sourcePiece, selection);
    if (!units.length || units.some(unit =>
        getHeldSelectionUnavailableReason(sourcePiece, unit, selection.from))) return false;
    gameState.plans[gameState.turnIndex].push({
        pieceId: `${sourcePiece.id}::unmerge::${units.map(unit => unit.id).join('::')}`,
        from: [...selection.from],
        to: [...destination],
        pieceType: getMergedPieceType(units),
        unitIds: units.map(unit => unit.id),
        contents: units.map(unit => ({ ...unit })),
        isUnmerge: true,
        sourcePieceId: sourcePiece.id,
        transfer: Boolean(targetPiece),
        mergeWithPieceId: targetPiece ? targetPiece.id : null
    });
    return true;
}

function detachHeldGroup(move, source) {
    const units = getHeldGroupUnits(source, move);
    if (!units.length || units.some(unit => unit.type === 'r' || !canMoveHeldUnit(unit))) return false;
    const ids = new Set(units.map(unit => unit.id));
    source.contents = getPieceContents(source).filter(unit => !ids.has(unit.id));
    if (source.contents.length) source.type = getMergedPieceType(source.contents);
    move.contents = units.map(unit => ({ ...unit, player: move.player }));
    move.pieceType = getMergedPieceType(move.contents);
    return true;
}

function getAllPlannedMoves() {
    const moves = [];
    if (gameState.multiplayer && gameState.phase === 'RESOLVING') return moves;
    gameState.plans[gameState.turnIndex].filter(move => !move.prisonerAction).forEach(move =>
        moves.push({ ...move, player: gameState.turnIndex + 1 }));
    return moves;
}

function getPlanArrowKind(move, allMoves) {
    if (move.transfer) return 'blue';

    const destinationMoves = allMoves.filter(other =>
        other.to[0] === move.to[0] && other.to[1] === move.to[1]
    );
    const enemyDestinationMove = destinationMoves.some(other => other.player !== move.player);
    const destinationPiece = getVisiblePiece(move.to[0], move.to[1], move.player);
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
