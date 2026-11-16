function restorePrisoner(unit) {
    const restored = { ...unit, player: unit.originalPlayer || unit.player };
    delete restored.prisonerOf;
    delete restored.originalPlayer;
    delete restored.routedStacks;
    delete restored.routedUntilRound;
    return restored;
}

function addCapturedUnit(player, unit, destination) {
    const [r, c] = destination;
    let piece = gameState.board[r][c];
    if (piece && piece.player !== player) throw new Error('Capture destination belongs to another player');
    if (!piece) {
        piece = { id: `captives_${unit.id}_${gameState.round}`, player, contents: [] };
        gameState.board[r][c] = piece;
    }
    piece.contents = [...getPieceContents(piece), unit];
    piece.type = getMergedPieceType(piece.contents);
}

function beginCaptureChoices(player, contents, destination) {
    if (gameState.pendingCapture) throw new Error('Previous captures have not been decided');
    const pending = [];
    contents.forEach(unit => {
        const originalPlayer = unit.originalPlayer || unit.player;
        if (originalPlayer === player) {
            addCapturedUnit(player, restorePrisoner(unit), destination);
            logAction(`${getUnitName(unit)} was rescued by P${player} and can fight again.`);
        } else {
            pending.push(unit);
        }
    });
    gameState.pendingCapture = pending.length ? {
        id: `capture_${gameState.round}_${contents.map(unit => unit.id).join('_')}`,
        player, contents: pending, destination: [...destination]
    } : null;
}

function decideCapture(player, captureId, unitId, fate) {
    const pending = gameState.pendingCapture;
    if (gameState.phase !== 'RESOLVING' || !pending || pending.player !== player ||
        pending.id !== captureId || !['execute', 'keep'].includes(fate)) return false;
    const unit = pending.contents.find(entry => entry.id === unitId);
    if (!unit) return false;
    if (fate === 'execute') {
        recordDeadPieces(gameState, [unit]);
        logAction(`P${player} executed captured ${getUnitName(unit)}.`);
    } else {
        const captive = {
            ...restorePrisoner(unit),
            originalPlayer: unit.originalPlayer || unit.player,
            player,
            prisonerOf: player
        };
        addCapturedUnit(player, captive, pending.destination);
        logAction(`P${player} kept ${getUnitName(unit)} as a prisoner.`);
    }
    pending.contents = pending.contents.filter(entry => entry.id !== unitId);
    if (!pending.contents.length) gameState.pendingCapture = null;
    return true;
}

function managePrisoner(player, unitId, action) {
    if (!['PLANNING', 'COMMITTED'].includes(gameState.phase) || gameState.eliminated[player - 1] ||
        gameState.multiplayer && gameState.committed[player - 1] ||
        !['execute', 'release'].includes(action)) return false;
    for (let r = 0; r < gameState.boardSize; r++) {
        for (let c = 0; c < gameState.boardSize; c++) {
            const piece = gameState.board[r][c];
            if (!piece || piece.player !== player) continue;
            const contents = getPieceContents(piece);
            const unit = contents.find(entry => entry.id === unitId && entry.prisonerOf === player);
            if (!unit) continue;
            const plans = gameState.plans[player - 1];
            if (plans.some(move => move.isUnmerge && move.unitId === unitId)) return false;
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
        const piece = gameState.board[plan.from[0]][plan.from[1]];
        const unit = piece && getPieceContents(piece).find(unit => unit.id === plan.unitId);
        if (!piece || piece.id !== plan.pieceId || piece.player !== player ||
            !unit || unit.prisonerOf !== player || plans.some(move => move.isUnmerge && move.unitId === unit.id)) return false;
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
            const piece = gameState.board[r][c];
            const location = getBiome(r, c) === 'forest' ? 'in a forest' :
                isPubliclyVisiblePiece(piece, [[r, c]]) ? `at ${coordsToNotation(r, c)}` : 'in fog of war';
            const contents = getPieceContents(piece);
            const unit = contents.find(unit => unit.id === plan.unitId);
            const remaining = contents.filter(entry => entry !== unit);
            if (remaining.length) {
                piece.contents = remaining;
                piece.type = getMergedPieceType(remaining);
            } else {
                gameState.board[r][c] = null;
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
