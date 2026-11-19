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

function getPendingResourceTrades(recipient = null) {
    return (gameState.resourceTrades || []).filter(trade => recipient === null || trade.to === recipient);
}

function hasPendingPlayerRequests(recipient = null) {
    return getPendingAllianceRequests(recipient).length > 0 || getPendingResourceTrades(recipient).length > 0;
}

function normalizeResourceTradeAmounts(amounts) {
    if (!amounts || typeof amounts !== 'object' || Array.isArray(amounts) ||
        Object.keys(amounts).some(key => !RESOURCE_TYPES.some(resource => resource.key === key))) return null;
    const normalized = {};
    for (const { key } of RESOURCE_TYPES) {
        const amount = amounts[key] === undefined ? 0 : amounts[key];
        if (!Number.isSafeInteger(amount) || amount < 0) return null;
        normalized[key] = amount;
    }
    return normalized;
}

function prepareResourceTrade(from, to, give, receive) {
    const fromSpending = getResourceSpending(from + 1, give);
    const toSpending = getResourceSpending(to + 1, receive);
    if (!fromSpending || !toSpending) {
        return { error: 'Exchange rejected: both players must still hold all resources they would give.' };
    }
    const fromReceives = RESOURCE_TYPES.some(({ key }) => receive[key] > 0);
    const toReceives = RESOURCE_TYPES.some(({ key }) => give[key] > 0);
    const fromHolder = fromReceives ? getResourceHolderForPlayer(from + 1) : null;
    const toHolder = toReceives ? getResourceHolderForPlayer(to + 1) : null;
    if ((!fromHolder && fromReceives) || (!toHolder && toReceives)) {
        return { error: 'Exchange rejected: a recipient needs a capital Castle, King, or Queen to store resources.' };
    }
    if (RESOURCE_TYPES.some(({ key }) =>
        !Number.isSafeInteger(gameState.resources[from][key] - give[key] + receive[key]) ||
        !Number.isSafeInteger(gameState.resources[to][key] - receive[key] + give[key]))) {
        return { error: 'Exchange rejected: the resulting resource amount is too large.' };
    }
    return { fromSpending, toSpending, fromHolder, toHolder };
}

function applyResourceTradeAction(actor, target, action, terms = null, id = null) {
    if (![actor, target].every(index => Number.isInteger(index) && index >= 0 && index < 4) ||
        actor === target) return 'Choose another active player.';
    if (![actor, target].every(index => gameState.activePlayers[index] && !gameState.eliminated[index])) {
        return 'Exchanges are only available between active, non-eliminated players.';
    }
    const initiating = action === 'propose' || action === 'cancel';
    const planning = ['PLANNING', 'COMMITTED'].includes(gameState.phase);
    if (gameState.multiplayer ? !planning :
        (actor !== gameState.turnIndex || gameState.phase !== (initiating ? 'PLANNING' : 'ALLIANCE_REVIEW'))) {
        return 'Resource exchanges are not available in this phase.';
    }
    if (initiating && gameState.multiplayer && gameState.committed[actor]) {
        return 'Unlock your plan before proposing or cancelling an exchange.';
    }
    if (action === 'propose') {
        if (getPendingResourceTrades().some(trade =>
            (trade.from === actor && trade.to === target) || (trade.from === target && trade.to === actor))) {
            return 'Answer or cancel the pending exchange with that player first.';
        }
        const give = normalizeResourceTradeAmounts(terms?.give);
        const receive = normalizeResourceTradeAmounts(terms?.receive);
        if (!give || !receive) return 'Resource amounts must be non-negative whole numbers.';
        if (!RESOURCE_TYPES.some(({ key }) => give[key] > 0 || receive[key] > 0)) {
            return 'Choose at least one resource to exchange.';
        }
        const prepared = prepareResourceTrade(actor, target, give, receive);
        if (prepared.error) return prepared.error;
        gameState.resourceTrades.push({
            id: gameState.nextResourceTradeId++, from: actor, to: target, give, receive
        });
        return null;
    }
    const trade = getPendingResourceTrades().find(entry => entry.id === id &&
        (action === 'cancel' ? entry.from === actor && entry.to === target :
            entry.from === target && entry.to === actor));
    if (!trade) return 'That exchange proposal is no longer available.';
    if (!['accept', 'decline', 'cancel'].includes(action)) return 'That exchange action is not available.';
    if (action === 'accept') {
        const prepared = prepareResourceTrade(trade.from, trade.to, trade.give, trade.receive);
        if (prepared.error) return prepared.error;
        [...prepared.fromSpending, ...prepared.toSpending].forEach(({ store, resource, amount }) => {
            store[resource] -= amount;
        });
        for (const [holder, amounts] of [[prepared.fromHolder, trade.receive], [prepared.toHolder, trade.give]]) {
            if (!holder) continue;
            const store = getUnitResourceStore(holder, true);
            RESOURCE_TYPES.forEach(({ key }) => { store[key] = (Number(store[key]) || 0) + amounts[key]; });
        }
        refreshResourceTotals();
    }
    gameState.resourceTrades = gameState.resourceTrades.filter(entry => entry !== trade);
    return null;
}
