const RESOURCE_PURCHASE_COSTS = {
    pawn: { food: 2, wood: 1, gold: 1 },
    horse: { horse: 2, metal: 1, gold: 1 },
    armour: { food: 1, metal: 2, wood: 2, gold: 1 },
    castle: { stone: 3, food: 1, wood: 2, gold: 1 },
    resource: { stone: 2, wood: 2, food: 2, gold: 1 },
    lucky: { gold: 1, horse: 1, metal: 1, food: 1, wood: 1 }
};
const SIEGE_COST = { food: 1, wood: 1 };
const CASTLE_SIEGE_TIMERS = [
    { attacker: 3, tower: 6 },
    { attacker: 4, tower: 8 },
    { attacker: 6, tower: 12 }
];
const LUCKY_CARD_TYPES = {
    steal: {
        label: 'General Taxes',
        icon: '<svg viewBox="0 0 64 64" aria-hidden="true"><g fill="currentColor"><path d="M0 5h9l8 6 5 7-3 3-5-5 3 7-3 2-5-7-2 2-7-5Z"/><path d="M64 5h-9l-8 6-5 7 3 3 5-5-3 7 3 2 5-7 2 2 7-5Z"/><path d="M12 47c2-2 4-2 6 0l7 5h14l8-6c2-1 4-1 5 1s0 4-2 5l-10 8H23l-11-8c-2-2-2-4 0-5Z"/></g><g fill="#eab308" stroke="#854d0e" stroke-width="1.5" stroke-linejoin="round"><path d="M16 21l3 2 3-2-1 5c4 3 6 7 5 11-1 4-13 4-14 0-1-4 1-8 5-11Z"/><path d="M42 21l3 2 3-2-1 5c4 3 6 7 5 11-1 4-13 4-14 0-1-4 1-8 5-11Z"/></g><path d="M15 26h8m18 0h8" stroke="#854d0e" stroke-width="1.5"/></svg>',
        description: 'Choose a resource type. Steal all of it from every other player, including allies.'
    },
    burglar: {
        label: 'Resources Burglar',
        icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 13c0-2 2-3 5-3s5 1 5 3l2 2-1 13H4L3 15Z" fill="currentColor"/><path d="M7 10 6 7l4 2m4 8-3 1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="21" cy="7" r="4" fill="currentColor"/><path d="M18 7h6l-1 2h-4Zm-1 5h7l3 9-4 1 1 8h-5l-2-7-3 7h-5l4-11-3-5Z" fill="currentColor"/><path d="m18 13-4 4-4-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        description: 'Choose another active player. Steal all of their resources, including from allies and retreating units.'
    },
    immobilize: {
        label: 'Stop Sign',
        icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 2H22L30 10V22L22 30H10L2 22V10Z" fill="#dc2626" stroke="white"/><text x="16" y="19" text-anchor="middle" fill="white" font-size="9" font-weight="bold">STOP</text></svg>',
        description: 'Choose another player. Block movement, splits, transfers, retreat re-entry, and siege attacks this round and next. Defence is unaffected.'
    },
    'force-march': {
        label: 'Force March',
        icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 4h6v7c0 2 2 3 5 4l3 2v4H3v-4l4-3c-2-1-4-3-4-5V4Z M15 14h6v5c0 2 2 3 5 4l3 2v4H15v-4l4-3c-2-1-4-3-4-5v-3Z" fill="currentColor"/></svg>',
        description: 'Choose one of your Pawn- or prisoner-containing stacks to move this even-numbered round. One move only.'
    },
    harvest: {
        label: 'Good Harvest Season',
        icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M7 28 16 6m-5 15-5-3m8-3-5-4m3 1 5-5m-2 12 5-3m-7-1 5-5" fill="none" stroke="#a16207" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 5a10 10 0 1 0 9 15A8 8 0 0 1 20 5Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="m22 5 3-2m-1 5 4-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        description: 'Refill the food meter to full in every currently owned province.'
    },
    sabotage: {
        label: 'Sabotage Grain Storages',
        icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M5 10c0-2 5-4 11-4s11 2 11 4v15c0 2-5 4-11 4S5 27 5 25Z" fill="#d6a84f" stroke="#854d0e" stroke-width="1.5"/><path d="M5 10c0 2 5 4 11 4s11-2 11-4M5 17c0 2 5 4 11 4s11-2 11-4M11 7l2 5m5-5-2 5m-3 9 2 6" fill="none" stroke="#854d0e" stroke-width="1.5"/><path d="m22 4 2-2 7 7-2 2Z" fill="#78716c" stroke="#44403c" stroke-width="1"/><path d="M23 4c-2-2 1-3 1-4 3 2 3 4 1 6" fill="#f97316" stroke="#c2410c" stroke-width="1"/></svg>',
        description: "Choose another active player's province. Reduce its food meter by 2; reaching 0 causes an immediate rebellion."
    }
};

function getForceMarchToken(player, pieceId) {
    return gameState.forceMarch?.[player - 1]?.find(token => token.pieceId === pieceId);
}

function hasForceMarchAllowance(piece, plans = gameState.plans[piece.player - 1] || []) {
    if (!piece || piece.player !== gameState.turnIndex + 1 || !isPawnRestTurn()) return false;
    const token = getForceMarchToken(piece.player, piece.id);
    if (!token) return false;
    return !token.used || plans.some(plan => plan.forceMarch && plan.pieceId === piece.id);
}

function pieceHasRestingUnits(piece, plans = gameState.plans[piece.player - 1] || []) {
    return getPlannedPieceContents(piece, plans)
        .some(unit => getUnitType(unit) === 'p' || isPrisoner(unit));
}

function getForceMarchTargets(player) {
    if (!isPawnRestTurn() || isPlayerImmobilized(player)) return [];
    const targets = [];
    gameState.board.forEach((row, r) => row.forEach((square, c) => {
        getSquarePieces(square).forEach(piece => {
            if (piece.player === player && piece.type !== 'r' && pieceHasRestingUnits(piece) &&
                !getForceMarchToken(player, piece.id) && !getSiegeAtSquare([r, c]) &&
                !getSiegeForAttacker(piece.id)) {
                targets.push({ piece, row: r, column: c });
            }
        });
    }));
    return targets;
}

function markForceMarchPlan(piece, plan, plans = gameState.plans[piece.player - 1] || []) {
    if (!isPawnRestTurn() || !pieceHasRestingUnits(piece, plans)) return false;
    const token = getForceMarchToken(piece.player, piece.id);
    if (!token) return false;
    if (token.used && !plans.some(entry => entry.forceMarch && entry.pieceId === piece.id)) return false;
    token.used = true;
    plan.forceMarch = true;
    return true;
}

function spendForceMarchPlan(player, plan) {
    plan.filter(entry => entry.forceMarch).forEach(entry => {
        const token = getForceMarchToken(player, entry.pieceId);
        if (token) token.used = true;
    });
}

function renderLuckyCardBack(withPlus = false) {
    return `<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="6" y="2" width="21" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><text x="16" y="23" text-anchor="middle" fill="currentColor" font-size="23">?</text>${withPlus ? '<path d="M25 21v10m-5-5h10" stroke="currentColor" stroke-width="3"/>' : ''}</svg>`;
}

function canUseLuckyCards(player) {
    return Number.isInteger(player) && player >= 1 && player <= 4 &&
        gameState.activePlayers[player - 1] && !gameState.eliminated[player - 1] &&
        (gameState.multiplayer
            ? ['PLANNING', 'COMMITTED'].includes(gameState.phase) && !gameState.committed[player - 1]
            : gameState.phase === 'PLANNING' && player === gameState.turnIndex + 1);
}

function cancelImmobilizedPlans(player) {
    gameState.plans[player - 1] = gameState.plans[player - 1]
        .filter(plan => plan.prisonerAction || plan.siegeCancel);
    if (gameState.turnIndex === player - 1) {
        gameState.selectedSquare = null;
        gameState.validMoves = [];
        gameState.selectedHeldPiece = null;
        gameState.pendingMerge = null;
        gameState.pendingTransfer = null;
        gameState.lockedPieceIds = new Set();
    }
}

function useLuckyCard(player, cardId, target) {
    if (!canUseLuckyCards(player)) return 'Lucky Cards can only be used during your unlocked planning turn.';
    const hand = gameState.luckyCards[player - 1];
    const card = hand.find(entry => entry.id === cardId);
    if (!card || !Object.hasOwn(LUCKY_CARD_TYPES, card.type)) return 'That Lucky Card is not in your hand.';
    if (card.type === 'steal') {
        if (!RESOURCE_TYPES.some(resource => resource.key === target)) return 'Choose a valid resource type.';
        const holder = getResourceHolderForPlayer(player);
        if (!holder) return 'You need a capital Tower, King, or Queen to receive stolen resources.';
        let total = 0;
        getResourceBearingUnits().forEach(({ unit, piece }) => {
            if (piece.player === player || piece.player < 1 || piece.player > 4) return;
            const store = getUnitResourceStore(unit);
            const amount = Math.max(0, Number(store?.[target]) || 0);
            if (!amount) return;
            total += amount;
            store[target] = 0;
        });
        const store = getUnitResourceStore(holder, true);
        store[target] = (Number(store[target]) || 0) + total;
        refreshResourceTotals();
        const resource = RESOURCE_TYPES.find(entry => entry.key === target);
        logAction(`Player ${player} used General Taxes and stole ${total} ${resource.label} from all other players.`);
    } else if (card.type === 'burglar') {
        if (!Number.isInteger(target) || target < 1 || target > 4 || target === player ||
            !gameState.activePlayers[target - 1] || gameState.eliminated[target - 1]) {
            return 'Choose another active, non-eliminated player.';
        }
        const holder = getResourceHolderForPlayer(player);
        if (!holder) return 'You need a capital Tower, King, or Queen to receive stolen resources.';
        const received = Object.fromEntries(RESOURCE_TYPES.map(({ key }) => [key, 0]));
        getResourceBearingUnits(target).forEach(({ unit }) => {
            const store = getUnitResourceStore(unit);
            if (!store) return;
            RESOURCE_TYPES.forEach(({ key }) => {
                const amount = Math.max(0, Number(store[key]) || 0);
                if (!amount) return;
                received[key] += amount;
                store[key] = 0;
            });
        });
        const store = getUnitResourceStore(holder, true);
        RESOURCE_TYPES.forEach(({ key }) => {
            store[key] = (Number(store[key]) || 0) + received[key];
        });
        refreshResourceTotals();
        logAction(`Player ${player} used Resources Burglar and stole all resources from Player ${target}.`);
    } else if (card.type === 'immobilize') {
        if (!Number.isInteger(target) || target < 1 || target > 4 || target === player ||
            !gameState.activePlayers[target - 1] || gameState.eliminated[target - 1]) {
            return 'Choose another active, non-eliminated player.';
        }
        gameState.immobilizedUntilRound[target - 1] = Math.max(
            gameState.immobilizedUntilRound[target - 1], gameState.round + 1);
        cancelImmobilizedPlans(target);
        logAction(`Player ${player} used Stop Sign: Player ${target} is immobilized through round ${gameState.immobilizedUntilRound[target - 1]}. Queued movement and siege attacks were cancelled.`);
    } else if (card.type === 'harvest') {
        reconcileProvinceFood();
        let refilled = 0;
        gameState.provinceFoodOwners.forEach((owner, province) => {
            if (owner !== player || gameState.provinceFood[province] >= PROVINCE_FOOD_MAX) return;
            gameState.provinceFood[province] = PROVINCE_FOOD_MAX;
            refilled++;
        });
        logAction(`Player ${player} used Good Harvest Season and refilled the food meters in ${refilled} provinces.`);
    } else if (card.type === 'sabotage') {
        const owner = Number.isInteger(target) && target >= 0 && target < 16
            ? getProvinceOwners(gameState.board)[target] : null;
        if (!owner || owner === player || !gameState.activePlayers[owner - 1] ||
            gameState.eliminated[owner - 1] || gameState.provinceFoodOwners[target] !== owner ||
            !Number.isInteger(gameState.provinceFood[target]) || gameState.provinceFood[target] < 1) {
            return "Choose another active player's owned province with a food meter.";
        }
        gameState.provinceFood[target] = Math.max(0, gameState.provinceFood[target] - 2);
        logAction(`Player ${player} used Sabotage Grain Storages on Player ${owner}'s Province ${target + 1}; food is now ${gameState.provinceFood[target]}.`);
        if (gameState.provinceFood[target] === 0) {
            rebelProvince(target, owner, gameState.round);
            reconcileProvinceFood();
            syncSieges();
            reconcileCapitals();
            refreshResourceTotals();
        }
    } else {
        if (!isPawnRestTurn()) return 'Force March can only be used during an even-numbered round.';
        if (isPlayerImmobilized(player)) return 'Force March cannot be used while you are immobilized.';
        let targetPiece = null;
        let targetSquare = null;
        gameState.board.some((row, r) => row.some((square, c) =>
            getSquarePieces(square).some(piece => {
                if (piece.id !== target || piece.player !== player) return false;
                targetPiece = piece;
                targetSquare = [r, c];
                return true;
            })));
        if (!targetPiece || targetPiece.type === 'r' || !pieceHasRestingUnits(targetPiece) ||
            getForceMarchToken(player, targetPiece.id) || getSiegeForAttacker(targetPiece.id)) {
            return 'Choose one of your eligible Pawn- or prisoner-containing stacks.';
        }
        if (!targetSquare || getSiegeAtSquare(targetSquare)) {
            return 'That stack cannot leave its current square.';
        }
        gameState.forceMarch[player - 1].push({ pieceId: targetPiece.id, used: false });
        logAction(`Player ${player} used Force March for ${getPieceLabel(targetPiece.type)} at ${coordsToNotation(...targetSquare)}.`);
    }
    hand.splice(hand.indexOf(card), 1);
    return null;
}

function getPlayerUnitCount(player, type) {
    let count = 0;
    const countUnits = units => units.filter(unit =>
        (unit.originalPlayer || unit.player) === player && getUnitType(unit) === type).length;
    gameState.board.forEach(row => row.forEach(square => getSquarePieces(square).forEach(piece => {
        count += countUnits(getPieceContents(piece));
    })));
    (gameState.retreating?.[player - 1] || []).forEach(entry => {
        count += countUnits(entry.contents || []);
    });
    count += countUnits(gameState.pendingCapture?.contents || []);
    return count;
}

function hasPlayerResources(player, cost) {
    if (player < 1 || player > 4) return false;
    const stockpile = gameState.resources?.[player - 1];
    return Boolean(stockpile && Object.entries(cost).every(([resource, amount]) =>
        (Number(stockpile[resource]) || 0) >= amount));
}

function getResourceSpending(player, cost) {
    if (!hasPlayerResources(player, cost)) return null;
    const holders = getResourceBearingUnits(player);
    const spending = [];
    for (const [resource, amount] of Object.entries(cost)) {
        let remaining = amount;
        for (const { unit } of holders) {
            const store = getUnitResourceStore(unit);
            const available = Math.max(0, Math.floor(Number(store?.[resource]) || 0));
            const spent = Math.min(available, remaining);
            if (spent) spending.push({ store, resource, amount: spent });
            remaining -= spent;
            if (!remaining) break;
        }
        if (remaining) return null;
    }
    return spending;
}

function spendPlayerResources(player, cost) {
    const spending = getResourceSpending(player, cost);
    if (!spending) return false;
    spending.forEach(({ store, resource, amount }) => { store[resource] -= amount; });
    refreshResourceTotals();
    return true;
}

function getCapitalProvince(player) {
    const capitalId = gameState.capitalTowerIds?.[player - 1];
    if (!capitalId) return null;
    for (let row = 0; row < gameState.boardSize; row++) {
        for (let column = 0; column < gameState.boardSize; column++) {
            const tower = getPiecesAt(row, column).find(piece =>
                piece.player === player && getPieceContents(piece).some(unit =>
                    unit.id === capitalId && getUnitType(unit) === 'r'));
            if (tower) return getProvinceIndex(row, column, gameState.boardSize);
        }
    }
    return null;
}

function isProvinceAdjacentToCapital(province, player) {
    const capital = getCapitalProvince(player);
    if (capital === null || province === capital) return false;
    return Math.abs(Math.floor(province / 4) - Math.floor(capital / 4)) +
        Math.abs((province % 4) - (capital % 4)) === 1;
}

function getRecruitingCastle(province, player) {
    if (!Number.isInteger(province) || province < 0 || province >= 16 ||
        getProvinceOwners(gameState.board)[province] !== player ||
        !isProvinceAdjacentToCapital(province, player) ||
        gameState.provinceRecruitmentUsed?.[province]) return null;
    for (let row = 0; row < gameState.boardSize; row++) {
        for (let column = 0; column < gameState.boardSize; column++) {
            if (getProvinceIndex(row, column, gameState.boardSize) !== province) continue;
            const castle = getPiecesAt(row, column).find(piece =>
                piece.player === player && isTowerPiece(piece));
            if (castle) return { castle, row, column };
        }
    }
    return null;
}

function getRecruitmentTarget(player, targetId) {
    if (typeof targetId === 'string' && targetId.startsWith('castle:')) {
        const target = findOwnedUnit(player, targetId.slice(7), true);
        if (!target || getUnitType(target.unit) !== 'r') return null;
        const province = getProvinceIndex(target.row, target.column, gameState.boardSize);
        return { ...target, castle: target.piece, province };
    }
    if (targetId === null || targetId === '') return null;
    const province = Number(targetId);
    const target = getRecruitingCastle(province, player);
    return target ? { ...target, province } : null;
}

function findOwnedUnit(player, unitId, needsCastle = false) {
    for (let row = 0; row < gameState.boardSize; row++) {
        for (let column = 0; column < gameState.boardSize; column++) {
            const piece = getPiecesAt(row, column).find(candidate =>
                candidate.player === player &&
                (!needsCastle || isTowerPiece(candidate)) &&
                getPieceContents(candidate).some(unit =>
                    unit.id === unitId && !isPrisoner(unit)));
            if (!piece) continue;
            const unit = getPieceContents(piece).find(candidate => candidate.id === unitId);
            return { piece, unit, row, column };
        }
    }
    return null;
}

function getCastleUpgradeTarget(player, unitId) {
    const target = findOwnedUnit(player, unitId);
    return target && getUnitType(target.unit) === 'r' &&
        getProvinceOwners(gameState.board)[getProvinceIndex(target.row, target.column, gameState.boardSize)] === player &&
        Math.floor(Number(target.unit.castleUpgradeLevel) || 0) < 2
        ? target
        : null;
}

function getResourceUpgradeTarget(targetId) {
    if (typeof targetId !== 'string' || !/^(?:[0-9]|1[0-5]):(?:0|[1-9][0-9]*)$/.test(targetId)) return null;
    const [province, index] = targetId.split(':').map(Number);
    if (!Number.isSafeInteger(index)) return null;
    const resource = getProvinceResources(gameState.provinceResources, province)[index];
    return resource ? { province, resource } : null;
}

function getNextRecruitmentIdentity(player, type) {
    const names = new Set();
    const addNames = units => units.forEach(unit => {
        if (unit.name) names.add(unit.name);
    });
    gameState.board.forEach(row => row.forEach(square => getSquarePieces(square).forEach(piece =>
        addNames(getPieceContents(piece)))));
    (gameState.retreating || []).flat().forEach(entry => addNames(entry.contents || []));
    (gameState.deadPieces || []).flat().forEach(unit => names.add(unit.name));
    addNames(gameState.pendingCapture?.contents || []);
    let sequence = Math.max(1, Number(gameState.nextUnitSequence[player - 1]) || 1);
    let name = `${PLAYER_CODES[player - 1]}${type}${sequence}`;
    while (names.has(name)) {
        sequence++;
        name = `${PLAYER_CODES[player - 1]}${type}${sequence}`;
    }
    gameState.nextUnitSequence[player - 1] = sequence + 1;
    return { name, sequence };
}

function canPurchaseResourceAction(player, action, targetId = null, options = {}) {
    if (!Object.hasOwn(RESOURCE_PURCHASE_COSTS, action)) return false;
    return getPurchaseConditions(player, action, targetId, options).every(condition => condition.eligible) &&
        hasPlayerResources(player, RESOURCE_PURCHASE_COSTS[action]);
}

function getPurchaseConditions(player, action, targetId = null, options = {}) {
    const conditions = [];
    const add = (label, eligible) => conditions.push({ label, eligible: Boolean(eligible) });
    const validPlayer = player >= 1 && player <= 4 && gameState.activePlayers[player - 1] &&
        !gameState.eliminated[player - 1];
    add('Active player', validPlayer);
    if (!options.ignoreTurn) {
        add('Planning', ['PLANNING', 'COMMITTED'].includes(gameState.phase));
        if (gameState.multiplayer) add('Plan unlocked', !gameState.committed[player - 1]);
    }
    if (!validPlayer) return conditions;
    if (action === 'pawn' || action === 'horse') {
        const type = action === 'pawn' ? 'p' : 'n';
        const maximum = action === 'pawn' ? 6 : 3;
        const target = getRecruitmentTarget(player, targetId);
        add('Unit limit', getPlayerUnitCount(player, type) < maximum);
        add('Owned Castle', target);
        if (target) {
            add('Owned province', getProvinceOwners(gameState.board)[target.province] === player);
            add('Adjacent to capital', isProvinceAdjacentToCapital(target.province, player));
            add('Province not already used', !gameState.provinceRecruitmentUsed?.[target.province]);
        }
    } else if (action === 'armour') {
        const target = targetId === null ? null : findOwnedUnit(player, targetId, true);
        add('Unit in owned Castle', target && getUnitType(target.unit) !== 'r');
        add('Unarmoured', target && Math.floor(Number(target.unit.armour) || 0) === 0);
    } else if (action === 'castle') {
        const target = targetId === null ? null : findOwnedUnit(player, targetId, true);
        add('Owned Castle', target && getUnitType(target.unit) === 'r');
        if (target) {
            add('Owned province', getProvinceOwners(gameState.board)[getProvinceIndex(target.row, target.column, gameState.boardSize)] === player);
            add('Castle level below 2', Math.floor(Number(target.unit.castleUpgradeLevel) || 0) < 2);
        }
    } else if (action === 'resource') {
        const target = getResourceUpgradeTarget(targetId);
        add('Resource site', target);
        add('Owned province', target && getProvinceOwners(gameState.board)[target.province] === player);
        add('Production below 2', target && !target.resource.productionUpgraded);
    }
    return conditions;
}

function applyCastleUpgrade(target) {
    const previousLevel = Math.max(0, Math.min(2,
        Math.floor(Number(target.unit.castleUpgradeLevel) || 0)));
    const nextLevel = previousLevel + 1;
    target.unit.castleUpgradeLevel = nextLevel;
    const timerIncrease = CASTLE_SIEGE_TIMERS[nextLevel].tower -
        CASTLE_SIEGE_TIMERS[previousLevel].tower;
    const assaultIncrease = CASTLE_SIEGE_TIMERS[nextLevel].attacker -
        CASTLE_SIEGE_TIMERS[previousLevel].attacker;
    gameState.sieges.forEach(siege => {
        if (siege.towerSquare[0] !== target.row || siege.towerSquare[1] !== target.column) return;
        siege.towerTimer += timerIncrease;
        siege.attackers.forEach(attacker => { attacker.timer += assaultIncrease; });
    });
}

function purchaseResourceAction(player, action, targetId = null, options = {}) {
    if (!canPurchaseResourceAction(player, action, targetId, options)) return false;
    const cost = RESOURCE_PURCHASE_COSTS[action];
    if (!spendPlayerResources(player, cost)) return false;
    if (action === 'pawn' || action === 'horse') {
        const { castle, province } = getRecruitmentTarget(player, targetId);
        const type = action === 'pawn' ? 'p' : 'n';
        const { name, sequence } = getNextRecruitmentIdentity(player, type);
        const unit = createUnit(player, type, `purchase_p${player}_${sequence}`, name);
        castle.contents = [...getPieceContents(castle), unit];
        castle.type = getMergedPieceType(castle.contents);
        gameState.provinceRecruitmentUsed[province] = true;
        logAction(`Player ${player} purchased ${action === 'pawn' ? 'a Pawn' : 'a Horse'} in province ${province + 1}.`);
    } else if (action === 'armour') {
        const { unit } = findOwnedUnit(player, targetId, true);
        unit.armour = 1;
        logAction(`🛡️ <b>${getUnitName(unit)}</b> armour upgraded to 1.`);
    } else if (action === 'castle') {
        const target = getCastleUpgradeTarget(player, targetId);
        applyCastleUpgrade(target);
        logAction(`🏰 Castle upgraded to level ${target.unit.castleUpgradeLevel}.`);
    } else if (action === 'resource') {
        const { province, resource } = getResourceUpgradeTarget(targetId);
        resource.productionUpgraded = true;
        const type = RESOURCE_TYPES.find(entry => entry.key === resource.type);
        logAction(`${type.icon} ${type.label} production in province ${province + 1} upgraded to 2.`);
    } else if (action === 'lucky') {
        const types = Object.keys(LUCKY_CARD_TYPES);
        gameState.luckyCards[player - 1].push({
            id: `lucky_${gameState.nextLuckyCardId++}`,
            type: types[Math.floor(Math.random() * types.length)]
        });
        logAction(`Player ${player} purchased a Lucky Card.`);
    }
    return true;
}

function renderResourcePurchaseOptions(player) {
    if (!['PLANNING', 'COMMITTED'].includes(gameState.phase)) return '';
    const options = [];
    if (gameState.multiplayer && gameState.committed[player - 1]) {
        options.push('<span class="resource-purchase-notice">Unlock your plan to purchase.</span>');
    }
    const add = (action, target, label) => {
        const content = `${escapeHtml(label)} · ${formatResourceCost(RESOURCE_PURCHASE_COSTS[action])}`;
        options.push(renderPurchaseControl(player, action, target, label, 'resource-purchase-button', content));
    };
    const castles = [];
    const armourUnits = [];
    gameState.board.forEach((row, r) => row.forEach((square, c) =>
        getSquarePieces(square).filter(piece => piece.player === player && isTowerPiece(piece))
            .forEach(piece => getPieceContents(piece).filter(unit => !isPrisoner(unit)).forEach(unit => {
                if (getUnitType(unit) === 'r') {
                    castles.push({ unit, province: getProvinceIndex(r, c, gameState.boardSize) });
                } else {
                    armourUnits.push(unit);
                }
            }))));
    for (const { unit, province } of castles) {
        for (const action of ['pawn', 'horse']) {
            add(action, `castle:${unit.id}`,
                `${action === 'pawn' ? 'Pawn' : 'Horse'} · Province ${province + 1} · ${getUnitName(unit)}`);
        }
    }
    if (!castles.length) {
        add('pawn', null, 'Pawn · No owned Castle');
        add('horse', null, 'Horse · No owned Castle');
    }
    armourUnits.forEach(unit => add('armour', unit.id, `Armour level 1 · ${getUnitName(unit)}`));
    if (!armourUnits.length) add('armour', null, 'Armour level 1 · No unit in a Castle');
    castles.forEach(({ unit }) => {
        const level = Math.min(2, Math.max(0, Math.floor(Number(unit.castleUpgradeLevel) || 0)) + 1);
        add('castle', unit.id, `Castle level ${level} · ${getUnitName(unit)}`);
    });
    if (!castles.length) add('castle', null, 'Castle upgrade · No owned Castle');
    const owners = getProvinceOwners(gameState.board);
    gameState.provinceResources.forEach((_, province) => {
        if (owners[province] !== player) return;
        getProvinceResources(gameState.provinceResources, province).forEach((resource, index) => {
            const type = RESOURCE_TYPES.find(entry => entry.key === resource.type);
            const position = getResourcePosition(resource, province, gameState.boardSize, gameState.biomes);
            add('resource', `${province}:${index}`,
                `${type.label} production ${resource.productionUpgraded ? 2 : 1}/2 · Province ${province + 1} · ${coordsToNotation(...position)}`);
        });
    });
    add('lucky', null, 'Lucky Card');
    return options.join('');
}

function renderRequirements(player, cost, conditions = []) {
    const stockpile = gameState.resources?.[player - 1] || {};
    const resources = Object.entries(cost).map(([key, required]) => {
        const available = Number(stockpile[key]) || 0;
        const resource = RESOURCE_TYPES.find(entry => entry.key === key);
        return `<span class="requirement-${available >= required ? 'met' : 'missing'}" aria-label="${resource.label}: ${available} of ${required}">${resource.icon} ${available}/${required}</span>`;
    });
    const checks = conditions.map(({ label, eligible }) =>
        `<span class="requirement-${eligible ? 'met' : 'missing'}">${escapeHtml(label)}: ${eligible ? 'eligible' : 'ineligible'}</span>`);
    return [...resources, ...checks].join(' <span aria-hidden="true">|</span> ');
}

function renderPurchaseControl(player, action, targetId, label, className = '', content = escapeHtml(label)) {
    const description = action === 'resource' ? 'Increase production from 1 to 2 per successful check. ' : '';
    const requirements = description + renderRequirements(player, RESOURCE_PURCHASE_COSTS[action],
        getPurchaseConditions(player, action, targetId));
    const target = targetId === null ? '' : ` data-target="${escapeHtml(String(targetId))}"`;
    return `<span class="requirement-trigger" tabindex="0" data-requirements="${escapeHtml(requirements)}" aria-label="${escapeHtml(label)} requirements" aria-describedby="purchase-requirements"><button type="button" class="${className}" data-purchase="${action}"${target} aria-label="${escapeHtml(label)}"${canPurchaseResourceAction(player, action, targetId) ? '' : ' disabled'}>${content}</button></span>`;
}

function formatResourceCost(cost) {
    return Object.entries(cost).map(([key, amount]) => {
        const resource = RESOURCE_TYPES.find(entry => entry.key === key);
        return `${resource.icon}${amount}`;
    }).join(' ');
}
