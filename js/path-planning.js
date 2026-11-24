function samePathSquare(a, b) {
    return a[0] === b[0] && a[1] === b[1];
}

function getPathUnits(path, player) {
    const first = path.steps[0];
    if (!first) return [];
    const piece = getPieceByIdAt(...first.from, first.sourcePieceId || path.pieceId);
    if (!piece || piece.player !== player) return [];
    const units = getPieceContents(piece);
    const selected = units.filter(unit => path.unitIds.includes(unit.id));
    if (selected.length !== path.unitIds.length ||
        (!first.isUnmerge && selected.length !== units.length)) return [];
    return selected;
}

function pathUnitSignature(units) {
    return units.map(unit => `${unit.id}:${unit.type}:${unit.prisonerOf || 0}`).sort().join('|');
}

function pathNeedsRest(units, round) {
    return round % 2 === 0 && units.some(unit => unit.type === 'p' || isPrisoner(unit));
}

function getPathTargets(path, square, player, round) {
    return getVisiblePieces(...square, player).filter(piece => {
        if (piece.id === path.pieceId) return false;
        // Only this round's own orders are known; never extrapolate enemy plans.
        return !(round === gameState.round && piece.player === player && !isTowerPiece(piece) &&
            gameState.plans[player - 1].some(plan => !plan.prisonerAction && !plan.isUnmerge &&
                plan.pieceId === piece.id && !samePathSquare(plan.from, plan.to)));
    });
}

function getPathActionKind(path, from, to, player, round, units) {
    if (!getAdjacentMoves(...from).some(square => samePathSquare(square, to)) ||
        !isPassableSquare(...to) || !isTowerGateMove(from, to)) return null;
    const targets = getPathTargets(path, to, player, round);
    if (targets.some(target => !canUnitsTarget(units, target, player))) return null;
    const enemy = targets.find(target => !arePlayersFriendly(target.player, player));
    if (enemy) {
        if (isTowerPiece(enemy)) {
            return units.some(unit => unit.type === 'p' && !isPrisoner(unit)) &&
                (getSiegeAtSquare(to) || hasPlayerResources(player, SIEGE_COST)) ? 'siege' : null;
        }
        return 'attack';
    }
    if (targets.some(target => target.player === player)) return 'merge';
    return 'move';
}

function getPathScheduleRound(path, units, kind = 'move') {
    let round = path.steps[path.steps.length - 1].round + 1;
    if (kind !== 'siege' && pathNeedsRest(units, round)) round++;
    return round;
}

function getPathInvalidIndex(path, player) {
    const units = getPathUnits(path, player);
    if (!units.length || units.some(unit => unit.type === 'r') || pathUnitSignature(units) !== path.signature ||
        gameState.eliminated[player - 1]) return 0;
    for (let index = 0; index < path.steps.length; index++) {
        const step = path.steps[index];
        if (step.round < gameState.round) return index;
        if (step.round <= (gameState.immobilizedUntilRound[player - 1] || 0) &&
            step.kind !== 'leave') return index;
        if (step.kind === 'leave') {
            const siege = getSiegeForAttacker(path.pieceId);
            if (index || !siege || siege.id !== step.siegeId) return index;
            continue;
        }
        if (pathNeedsRest(units, step.round) && step.kind !== 'siege') return index;
        if (!index && getSiegeAtSquare(step.from)) return index;
        if (!index && !step.isUnmerge && getSiegeForAttacker(path.pieceId)) return index;
        const kind = getPathActionKind(path, step.from, step.to, player, step.round, units);
        if (kind !== step.kind || step.targetId &&
            !getPathTargets(path, step.to, player, step.round).some(piece => piece.id === step.targetId)) return index;
        if (step.isUnmerge && kind === 'siege') return index;
    }
    return -1;
}

function getPathOrder(path, player) {
    const step = path.steps[0];
    const units = getPathUnits(path, player);
    const order = {
        pieceId: path.pieceId, from: [...step.from], to: [...step.to],
        contents: units, pieceType: getMergedPieceType(units), pathId: path.pieceId
    };
    if (step.isUnmerge) Object.assign(order, {
        isUnmerge: true, sourcePieceId: step.sourcePieceId, unitIds: [...path.unitIds]
    });
    if (step.kind === 'leave') Object.assign(order, { siegeCancel: true, siegeId: step.siegeId });
    if (step.kind === 'merge') Object.assign(order, {
        mergeAccepted: true, mergeWithPieceId: step.targetId
    });
    return order;
}

function refreshMovementPaths(player) {
    const plans = gameState.plans[player - 1];
    if (player === gameState.turnIndex + 1) {
        plans.filter(plan => plan.pathId && plan.mergeAccepted).forEach(plan => {
            gameState.lockedPieceIds.delete(plan.pieceId);
            gameState.lockedPieceIds.delete(plan.mergeWithPieceId);
        });
    }
    const paths = gameState.movementPaths[player - 1].filter(path =>
        pathUnitSignature(getPathUnits(path, player)) === path.signature);
    gameState.movementPaths[player - 1] = paths;
    if (player === gameState.turnIndex + 1 && gameState.tracingPathId &&
        !paths.some(path => path.pieceId === gameState.tracingPathId)) {
        gameState.tracingPathId = null;
        gameState.pendingPathAction = null;
        gameState.selectedSquare = null;
        gameState.validMoves = [];
    }
    const manualPlans = plans.filter(plan => !plan.pathId);
    const due = paths.filter(path => path.steps[0]?.round === gameState.round);
    const orders = due.map(path => getPathOrder(path, player));
    gameState.plans[player - 1] = [...manualPlans, ...orders];
    paths.forEach(path => { path.invalidFrom = -1; });
    let removed;
    do {
        removed = false;
        paths.filter(path => path.invalidFrom !== 0).forEach(path => {
            path.invalidFrom = getPathInvalidIndex(path, player);
            const first = path.steps[0];
            if (path.invalidFrom === 0 || !first || first.round !== gameState.round) return;
            const conflict = manualPlans.some(plan => !plan.prisonerAction &&
                (plan.pieceId === path.pieceId || plan.isUnmerge &&
                    plan.sourcePieceId === path.pieceId || first.isUnmerge &&
                    plan.pieceId === first.sourcePieceId));
            if (conflict) path.invalidFrom = 0;
        });
        const validIds = new Set(due.filter(path => path.invalidFrom !== 0).map(path => path.pieceId));
        const remaining = gameState.plans[player - 1]
            .filter(plan => !plan.pathId || validIds.has(plan.pathId));
        removed = remaining.length < gameState.plans[player - 1].length;
        gameState.plans[player - 1] = remaining;
    } while (removed);
    due.filter(path => path.invalidFrom !== 0).forEach(path => {
        const first = path.steps[0];
        if (first.kind === 'merge' && player === gameState.turnIndex + 1) {
            gameState.lockedPieceIds.add(path.pieceId);
            gameState.lockedPieceIds.add(first.targetId);
        }
    });
}

function finalizeMovementPaths(player) {
    refreshMovementPaths(player);
    gameState.movementPaths[player - 1] = gameState.movementPaths[player - 1].filter(path => {
        if (path.invalidFrom >= 0) path.steps.splice(path.invalidFrom);
        path.invalidFrom = -1;
        return path.steps.length;
    });
    if (player === gameState.turnIndex + 1) {
        gameState.tracingPathId = null;
        gameState.pendingPathAction = null;
    }
}

function cancelPieceMovementPaths(piece, player) {
    const ids = new Set(getPieceContents(piece).map(unit => unit.id));
    const removed = gameState.movementPaths[player - 1].filter(path =>
        path.unitIds.some(id => ids.has(id)));
    const pathIds = new Set(removed.map(path => path.pieceId));
    removed.forEach(path => {
        if (path.steps[0]?.kind === 'merge') {
            gameState.lockedPieceIds.delete(path.steps[0].targetId);
            gameState.lockedPieceIds.delete(path.pieceId);
        }
    });
    gameState.movementPaths[player - 1] = gameState.movementPaths[player - 1]
        .filter(path => !pathIds.has(path.pieceId));
    gameState.plans[player - 1] = gameState.plans[player - 1]
        .filter(plan => !pathIds.has(plan.pathId));
    gameState.tracingPathId = null;
    gameState.pendingPathAction = null;
}

function beginMovementPath(order) {
    const player = gameState.turnIndex + 1;
    const units = order.contents;
    const kind = order.siegeCancel ? 'leave' :
        getPathActionKind({ pieceId: order.pieceId }, order.from, order.to,
            player, gameState.round, units);
    cancelPieceMovementPaths({ player, contents: units }, player);
    if (kind !== 'move' && kind !== 'leave') return false;
    const path = {
        pieceId: order.pieceId, unitIds: units.map(unit => unit.id),
        signature: pathUnitSignature(units), invalidFrom: -1,
        steps: [{
            from: [...order.from], to: [...order.to], kind, round: gameState.round,
            ...(order.isUnmerge ? { isUnmerge: true, sourcePieceId: order.sourcePieceId } : {}),
            ...(order.siegeCancel ? { siegeId: order.siegeId } : {})
        }]
    };
    gameState.movementPaths[player - 1].push(path);
    order.pathId = path.pieceId;
    gameState.tracingPathId = path.pieceId;
    updatePathTraceSelection();
    return true;
}

function getTracingMovementPath() {
    return gameState.movementPaths[gameState.turnIndex]
        .find(path => path.pieceId === gameState.tracingPathId);
}

function updatePathTraceSelection() {
    const path = getTracingMovementPath();
    if (!path) return;
    const player = gameState.turnIndex + 1;
    const last = path.steps[path.steps.length - 1];
    const units = getPathUnits(path, player);
    const round = getPathScheduleRound(path, units);
    gameState.selectedSquare = [...last.to];
    gameState.selectedHeldPiece = null;
    gameState.validMoves = path.invalidFrom >= 0 ? [] : getAdjacentMoves(...last.to).filter(to =>
        getPathActionKind(path, last.to, to, player, round, units));
}

function appendMovementPathStep(to) {
    const path = getTracingMovementPath();
    const player = gameState.turnIndex + 1;
    const units = getPathUnits(path, player);
    const last = path.steps[path.steps.length - 1];
    let round = getPathScheduleRound(path, units);
    const kind = getPathActionKind(path, last.to, to, player, round, units);
    if (!kind) return false;
    if (kind === 'siege') round = getPathScheduleRound(path, units, kind);
    const target = getPathTargets(path, to, player, round)
        .find(piece => kind === 'merge' ? piece.player === player : !arePlayersFriendly(piece.player, player));
    path.steps.push({
        from: [...last.to], to: [...to], round, kind,
        ...(target ? { targetId: target.id } : {})
    });
    if (kind === 'move') updatePathTraceSelection();
    else {
        gameState.tracingPathId = null;
        gameState.selectedSquare = null;
        gameState.validMoves = [];
    }
    return true;
}

function cancelBattleMovementPaths(candidates) {
    const ids = new Set(candidates.flatMap(candidate =>
        (candidate.contents || []).map(unit => unit.id)));
    gameState.movementPaths = gameState.movementPaths.map(paths =>
        paths.filter(path => !path.unitIds.some(id => ids.has(id))));
}

function advanceMovementPaths(moves) {
    gameState.movementPaths = gameState.movementPaths.map((paths, index) => paths.filter(path => {
        const step = path.steps[0];
        if (step.round === gameState.round) {
            const move = moves.find(move => move.pieceId === path.pieceId && !move.invalid &&
                samePathSquare(move.from, step.from) && samePathSquare(move.to, step.to));
            if (!move) return false;
            const piece = getPieceByIdAt(...step.to, path.pieceId);
            if (!piece || piece.player !== index + 1 ||
                pathUnitSignature(getPieceContents(piece)) !== path.signature) return false;
            path.steps.shift();
        }
        return path.steps.length > 0 && pathUnitSignature(getPathUnits(path, index + 1)) === path.signature;
    }));
    gameState.tracingPathId = null;
    gameState.pendingPathAction = null;
}

// Future steps are private intentions, not executable orders. Rebuild their
// shape here; only the current action goes through the normal plan validator.
function sanitizeMovementPaths(player, paths) {
    if (!Array.isArray(paths) || paths.length > 64) return null;
    const square = value => Array.isArray(value) && value.length === 2 &&
        value.every(n => Number.isInteger(n) && n >= 0 && n < gameState.boardSize);
    const result = [];
    const usedIds = new Set();
    for (const raw of paths) {
        if (!raw || typeof raw.pieceId !== 'string' || !Array.isArray(raw.unitIds) ||
            !raw.unitIds.length || raw.unitIds.some(id => typeof id !== 'string' || usedIds.has(id)) ||
            new Set(raw.unitIds).size !== raw.unitIds.length ||
            !Array.isArray(raw.steps) || !raw.steps.length) return null;
        const steps = [];
        for (const entry of raw.steps) {
            if (!entry || !square(entry.from) || !square(entry.to) ||
                !Number.isSafeInteger(entry.round) || entry.round < gameState.round ||
                !['move', 'attack', 'merge', 'siege', 'leave'].includes(entry.kind)) return null;
            const previous = steps[steps.length - 1];
            if (previous && (previous.kind !== 'move' && previous.kind !== 'leave' ||
                entry.round <= previous.round || !samePathSquare(previous.to, entry.from))) return null;
            if (entry.kind === 'leave' ? steps.length || !samePathSquare(entry.from, entry.to) :
                !getAdjacentMoves(...entry.from).some(to => samePathSquare(to, entry.to))) return null;
            const step = {
                from: [...entry.from], to: [...entry.to], kind: entry.kind, round: entry.round
            };
            if (['attack', 'merge', 'siege'].includes(entry.kind) &&
                typeof entry.targetId !== 'string') return null;
            if (entry.targetId !== undefined) {
                if (typeof entry.targetId !== 'string') return null;
                step.targetId = entry.targetId;
            }
            if (entry.isUnmerge) {
                if (steps.length || typeof entry.sourcePieceId !== 'string') return null;
                step.isUnmerge = true;
                step.sourcePieceId = entry.sourcePieceId;
            }
            if (entry.kind === 'leave') {
                if (typeof entry.siegeId !== 'string') return null;
                step.siegeId = entry.siegeId;
            }
            steps.push(step);
        }
        const path = { pieceId: raw.pieceId, unitIds: [...raw.unitIds], steps, invalidFrom: -1 };
        const units = getPathUnits(path, player);
        if (!units.length || steps[0].isUnmerge &&
            path.pieceId !== `${steps[0].sourcePieceId}::unmerge::${path.unitIds.join('::')}`) return null;
        path.signature = pathUnitSignature(units);
        if (raw.signature !== path.signature) return null;
        path.unitIds.forEach(id => usedIds.add(id));
        result.push(path);
    }
    return result;
}
