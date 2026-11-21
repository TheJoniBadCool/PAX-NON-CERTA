const RESOURCE_PURCHASE_INTERVAL = 4;
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
        label: 'Resource burglar',
        icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 9Q16 3 29 9L27 23Q21 27 16 21Q11 27 5 23Z" fill="currentColor"/><path d="M7 13L13 14L12 18L7 17ZM19 14L25 13L25 17L20 18Z" fill="var(--bg-card)"/></svg>',
        description: 'Choose a resource type. Steal all of it from every other player, including allies.'
    },
    immobilize: {
        label: 'Stop Sign',
        icon: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M10 2H22L30 10V22L22 30H10L2 22V10Z" fill="#dc2626" stroke="white"/><text x="16" y="19" text-anchor="middle" fill="white" font-size="9" font-weight="bold">STOP</text></svg>',
        description: 'Choose another player. Block movement, splits, transfers, retreat re-entry, and siege attacks this round and next. Defence is unaffected.'
    }
};

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
        logAction(`Player ${player} used Resource burglar and stole ${total} ${resource.label} from all other players.`);
    } else {
        if (!Number.isInteger(target) || target < 1 || target > 4 || target === player ||
            !gameState.activePlayers[target - 1] || gameState.eliminated[target - 1]) {
            return 'Choose another active, non-eliminated player.';
        }
        gameState.immobilizedUntilRound[target - 1] = Math.max(
            gameState.immobilizedUntilRound[target - 1], gameState.round + 1);
        cancelImmobilizedPlans(target);
        logAction(`Player ${player} used Stop Sign: Player ${target} is immobilized through round ${gameState.immobilizedUntilRound[target - 1]}. Queued movement and siege attacks were cancelled.`);
    }
    hand.splice(hand.indexOf(card), 1);
    return null;
}

function isResourcePurchaseRound(round = gameState.round) {
    return round > 0 && round % RESOURCE_PURCHASE_INTERVAL === 0;
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
        add('Purchase round', isResourcePurchaseRound());
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
    if (!isResourcePurchaseRound()) {
        options.push('<span class="resource-purchase-notice">Purchases open on rounds 4, 8, 12, etc.</span>');
    } else if (gameState.multiplayer && gameState.committed[player - 1]) {
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
