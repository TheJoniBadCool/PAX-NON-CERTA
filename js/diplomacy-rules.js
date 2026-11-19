function getDiplomacyPair(a, b) {
    return gameState.diplomacy.find(pair => pair.players.includes(a) && pair.players.includes(b) && a !== b);
}

function getPendingAllianceRequests(recipient = null) {
    return gameState.diplomacy.filter(pair => pair.requestedBy !== null &&
        (recipient === null || (pair.players.includes(recipient) && pair.requestedBy !== recipient)));
}

function applyDiplomacyAction(actor, target, action) {
    if (![actor, target].every(index => Number.isInteger(index) && index >= 0 && index < 4) ||
        actor === target) return 'Choose another active player.';
    if (![actor, target].every(index => gameState.activePlayers[index] && !gameState.eliminated[index])) {
        return 'Diplomacy is only available between active, non-eliminated players.';
    }
    const replying = action === 'accept' || action === 'decline';
    const planning = ['PLANNING', 'COMMITTED'].includes(gameState.phase);
    if (gameState.multiplayer ? !planning :
        (actor !== gameState.turnIndex || gameState.phase !== (replying ? 'ALLIANCE_REVIEW' : 'PLANNING'))) {
        return 'Diplomacy is not available in this phase.';
    }
    if (!replying && gameState.multiplayer && gameState.committed[actor]) {
        return 'Unlock your plan before initiating diplomacy.';
    }
    const pair = getDiplomacyPair(actor, target);
    if (replying) {
        if (pair.requestedBy !== target) return 'There is no alliance request from that player.';
        if (action === 'accept') {
            pair.status = 'allied';
            releaseAlliancePrisoners(actor + 1, target + 1);
        }
        pair.requestedBy = null;
        return null;
    }
    if (pair.changedRound === gameState.round) return 'This relationship is locked until next round.';
    if (action === 'request' && pair.status === 'war') {
        pair.requestedBy = actor;
    } else if (action === 'war' && pair.status === 'allied') {
        pair.status = 'war';
    } else {
        return 'That diplomacy action is not available for this relationship.';
    }
    pair.changedRound = gameState.round;
    return null;
}
