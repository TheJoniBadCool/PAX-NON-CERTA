function restorePrisoner(unit) {
    const restored = { ...unit, player: unit.originalPlayer || unit.player };
    delete restored.prisonerOf;
    delete restored.prisonerSinceRound;
    delete restored.originalPlayer;
    delete restored.routedStacks;
    delete restored.routedUntilRound;
    return restored;
}

function cancelReleasedPrisonerPlans(unitIds) {
    if (!unitIds.size) return;
    gameState.plans = gameState.plans.map(plans => plans.filter(plan => {
        if (plan.prisonerAction) return !unitIds.has(plan.unitId);
        if (plan.isUnmerge) return !(plan.unitIds || [plan.unitId]).some(id => unitIds.has(id));
        if (!plan.contents?.length) return true;
        const remaining = plan.contents.filter(unit => !unitIds.has(unit.id));
        if (remaining.length === plan.contents.length) return true;
        if (!remaining.length) {
            gameState.lockedPieceIds.delete(plan.pieceId);
            if (plan.mergeWithPieceId) gameState.lockedPieceIds.delete(plan.mergeWithPieceId);
            return false;
        }
        plan.contents = remaining;
        plan.pieceType = getMergedPieceType(remaining);
        return true;
    }));
    gameState.selectedHeldPiece = null;
    gameState.selectedSquare = null;
    gameState.validMoves = [];
    gameState.pendingMerge = null;
    gameState.pendingTransfer = null;
}

function releaseAlliancePrisoners(a, b) {
    const releasedIds = new Set();
    const release = (army, square) => {
        const ally = army.player === a ? b : army.player === b ? a : null;
        if (ally === null) return;
        const contents = getPieceContents(army);
        const released = contents.filter(unit => isPrisoner(unit) && unit.originalPlayer === ally);
        if (!released.length) return;
        released.forEach(unit => releasedIds.add(unit.id));
        army.contents = contents.filter(unit => !released.includes(unit));
        if (army.contents.length) army.type = getMergedPieceType(army.contents);
        queueRetreat(ally, released.map(restorePrisoner), [...square], true);
        logAction(`P${army.player} automatically released ${released.length} prisoner(s) to new ally P${ally}.`);
    };
    gameState.board.forEach((row, r) => row.forEach((cell, c) => {
        getSquarePieces(cell).forEach(army => {
            release(army, [r, c]);
            if (army.contents?.length === 0) removePieceAt(r, c, army.id);
        });
    }));
    for (const player of [a, b]) {
        gameState.retreating[player - 1] = gameState.retreating[player - 1].filter(army => {
            release(army, army.battleSquare);
            return army.contents.length > 0;
        });
    }
    cancelReleasedPrisonerPlans(releasedIds);
}

function addCapturedUnit(player, unit, destination) {
    const [r, c] = destination;
    let piece = gameState.captureRecipient || getPieceAt(r, c, player);
    if (!gameState.captureRecipient && getPiecesAt(r, c).some(other => !arePlayersFriendly(other.player, player))) {
        throw new Error('Capture destination contains an enemy');
    }
    if (!piece) {
        piece = { id: `captives_${unit.id}_${gameState.round}`, player, contents: [] };
        putPieceAt(r, c, piece);
    }
    piece.contents = [...getPieceContents(piece), unit];
    piece.type = getMergedPieceType(piece.contents);
}

function beginCaptureChoices(player, contents, destination, recipient = null) {
    if (gameState.pendingCapture) throw new Error('Previous captures have not been decided');
    gameState.captureRecipient = recipient;
    const pending = [];
    contents.forEach(unit => {
        const originalPlayer = unit.originalPlayer || unit.player;
        if (originalPlayer === REBEL_PLAYER_ID && player !== REBEL_PLAYER_ID) {
            logAction(`${getUnitName(unit)} was eliminated instead of being recruited by P${player}.`);
        } else if (originalPlayer === player) {
            addCapturedUnit(player, restorePrisoner(unit), destination);
            logAction(`${getUnitName(unit)} was rescued by P${player} and can fight again.`);
        } else {
            transferCapturedUnitResources(player, unit);
            pending.push(unit);
        }
    });
    gameState.pendingCapture = pending.length ? {
        id: `capture_${gameState.round}_${contents.map(unit => unit.id).join('_')}`,
        player, contents: pending, destination: [...destination]
    } : null;
    if (!gameState.pendingCapture) gameState.captureRecipient = null;
}

function decideCapture(player, captureId, unitId, fate) {
    const pending = gameState.pendingCapture;
    if (gameState.phase !== 'RESOLVING' || !pending || pending.player !== player ||
        pending.id !== captureId || !['execute', 'keep'].includes(fate)) return false;
    const unit = pending.contents.find(entry => entry.id === unitId);
    if (!unit || (unit.originalPlayer || unit.player) === REBEL_PLAYER_ID) return false;
    if (fate === 'execute') {
        recordDeadPieces(gameState, [unit]);
        logAction(`P${player} executed captured ${getUnitName(unit)}.`);
    } else {
        const captive = {
            ...restorePrisoner(unit),
            originalPlayer: unit.originalPlayer || unit.player,
            player,
            prisonerOf: player,
            prisonerSinceRound: gameState.round
        };
        addCapturedUnit(player, captive, pending.destination);
        logAction(`P${player} kept ${getUnitName(unit)} as a prisoner.`);
    }
    pending.contents = pending.contents.filter(entry => entry.id !== unitId);
    if (!pending.contents.length) {
        gameState.pendingCapture = null;
        gameState.captureRecipient = null;
    }
    return true;
}

function managePrisoner(player, unitId, action) {
    if (!['PLANNING', 'COMMITTED'].includes(gameState.phase) || gameState.eliminated[player - 1] ||
        gameState.multiplayer && gameState.committed[player - 1] ||
        !['execute', 'release'].includes(action)) return false;
    for (let r = 0; r < gameState.boardSize; r++) {
        for (let c = 0; c < gameState.boardSize; c++) {
            const piece = getPieceAt(r, c, player);
            if (!piece || piece.player !== player) continue;
            const contents = getPieceContents(piece);
            const unit = contents.find(entry => entry.id === unitId && entry.prisonerOf === player);
            if (!unit) continue;
            const plans = gameState.plans[player - 1];
            if (plans.some(move => move.isUnmerge && (move.unitIds || [move.unitId]).includes(unitId))) return false;
            gameState.plans[player - 1] = plans.filter(move =>
                !(move.prisonerAction && move.unitId === unitId));
            gameState.plans[player - 1].push({
                pieceId: piece.id, unitId, prisonerAction: action,
                from: [r, c], to: [r, c]
            });
            return true;
        }
    }
    return false;
}

function validatePrisonerPlans(player, plans) {
    const ids = new Set();
    return plans.filter(plan => plan.prisonerAction).every(plan => {
        if (!['execute', 'release'].includes(plan.prisonerAction) ||
            plan.from[0] !== plan.to[0] || plan.from[1] !== plan.to[1] || ids.has(plan.unitId)) return false;
        const piece = getPieceAt(...plan.from, player);
        const unit = piece && getPieceContents(piece).find(unit => unit.id === plan.unitId);
        if (!piece || piece.id !== plan.pieceId || piece.player !== player ||
            !unit || unit.prisonerOf !== player || plans.some(move =>
                move.isUnmerge && (move.unitIds || [move.unitId]).includes(unit.id))) return false;
        ids.add(unit.id);
        return true;
    });
}

function resolvePrisonerPlans() {
    gameState.plans.forEach((plans, index) => {
        if (!gameState.eliminated[index] && !validatePrisonerPlans(index + 1, plans)) {
            throw new Error(`Invalid prisoner plans for P${index + 1}`);
        }
    });
    let count = 0;
    for (let index = 0; index < 4; index++) {
        if (gameState.eliminated[index]) continue;
        const plans = gameState.plans[index];
        const actions = plans.filter(plan => plan.prisonerAction);
        if (actions.length && !count) logAction('<b>PRISONER ACTIONS</b> — resolved before movement.');
        actions.forEach(plan => {
            const [r, c] = plan.from;
            const piece = getPieceAt(r, c, index + 1);
            const location = getBiome(r, c) === 'forest' ? 'in a forest' :
                isPubliclyVisiblePiece(piece, [[r, c]]) ? `at ${coordsToNotation(r, c)}` : 'in fog of war';
            const contents = getPieceContents(piece);
            const unit = contents.find(unit => unit.id === plan.unitId);
            const remaining = contents.filter(entry => entry !== unit);
            if (remaining.length) {
                piece.contents = remaining;
                piece.type = getMergedPieceType(remaining);
            } else {
                removePieceAt(r, c, piece.id);
            }
            if (plan.prisonerAction === 'execute') {
                recordDeadPieces(gameState, [unit]);
            } else {
                const restored = restorePrisoner(unit);
                queueRetreat(restored.player, [restored], [r, c], true);
            }
            logAction(`${plan.prisonerAction === 'execute' ? '💀' : '🏳️'} <b>P${index + 1}</b> ${plan.prisonerAction === 'execute' ? 'executed' : 'released'} prisoner <b>${escapeHtml(getUnitName(unit))}</b> ${location}.`);
            count++;
        });
    }
    return count;
}
