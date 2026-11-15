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
    for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) {
            const piece = gameState.board[r][c];
            if (!piece || piece.player !== player) continue;
            const contents = getPieceContents(piece);
            const unit = contents.find(entry => entry.id === unitId && entry.prisonerOf === player);
            if (!unit) continue;
            if (gameState.plans[player - 1].some(move => move.pieceId === piece.id ||
                move.sourcePieceId === piece.id || move.mergeWithPieceId === piece.id)) return false;
            const remaining = contents.filter(entry => entry !== unit);
            if (remaining.length) {
                piece.contents = remaining;
                piece.type = getMergedPieceType(remaining);
            } else {
                gameState.board[r][c] = null;
            }
            if (action === 'execute') {
                recordDeadPieces(gameState, [unit]);
            } else {
                const restored = restorePrisoner(unit);
                queueRetreat(restored.player, [restored], [r, c], true);
            }
            logAction(`P${player} ${action === 'execute' ? 'executed' : 'released'} prisoner ${getUnitName(unit)}.`);
            return true;
        }
    }
    return false;
}
