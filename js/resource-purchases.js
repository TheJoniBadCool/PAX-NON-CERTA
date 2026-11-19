const RESOURCE_PURCHASE_INTERVAL = 4;
const RESOURCE_PURCHASE_COSTS = {
    pawn: { food: 2, wood: 1, gold: 1 },
    horse: { horse: 2, metal: 1, gold: 1 },
    armour: { food: 1, metal: 2, wood: 2, gold: 1 },
    castle: { stone: 3, food: 1, wood: 2, gold: 1 },
    lucky: { gold: 1, horse: 1, metal: 1, food: 1, wood: 1 }
};
const CASTLE_SIEGE_TIMERS = [
    { attacker: 3, tower: 6 },
    { attacker: 4, tower: 8 },
    { attacker: 6, tower: 12 }
];

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
    const ignoreTurn = Boolean(options.ignoreTurn);
    if (player < 1 || player > 4 || gameState.eliminated[player - 1] ||
        !gameState.activePlayers[player - 1] ||
        (!ignoreTurn && (!isResourcePurchaseRound() ||
            !['PLANNING', 'COMMITTED'].includes(gameState.phase) ||
            (gameState.multiplayer && gameState.committed[player - 1])))) return false;
    if (action === 'pawn' || action === 'horse') {
        const type = action === 'pawn' ? 'p' : 'n';
        const maximum = action === 'pawn' ? 6 : 3;
        if (getPlayerUnitCount(player, type) >= maximum ||
            !getRecruitingCastle(Number(targetId), player)) return false;
    } else if (action === 'armour') {
        const target = findOwnedUnit(player, targetId, true);
        if (!target || isPrisoner(target.unit) ||
            Math.floor(Number(target.unit.armour) || 0) !== 0) return false;
    } else if (action === 'castle') {
        if (!getCastleUpgradeTarget(player, targetId)) return false;
    } else if (action !== 'lucky') {
        return false;
    }
    return hasPlayerResources(player, RESOURCE_PURCHASE_COSTS[action]);
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
        const province = Number(targetId);
        const { castle } = getRecruitingCastle(province, player);
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
    } else {
        logAction(`Player ${player} purchased a Lucky Card. It has no effect yet.`);
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
    const button = (action, targetId, label) =>
        `<button type="button" class="resource-purchase-button" data-purchase="${action}"${targetId === null ? '' : ` data-target="${escapeHtml(String(targetId))}"`}${(action === 'lucky' || targetId !== null) && canPurchaseResourceAction(player, action, targetId) ? '' : ' disabled'}>${escapeHtml(label)} · ${formatResourceCost(RESOURCE_PURCHASE_COSTS[action])}</button>`;
    const recruitmentAvailable = new Set();
    for (let province = 0; province < 16; province++) {
        if (!getRecruitingCastle(province, player)) continue;
        const location = `Province ${province + 1}`;
        for (const action of ['pawn', 'horse']) {
            const capReached = getPlayerUnitCount(player, action === 'pawn' ? 'p' : 'n') >=
                (action === 'pawn' ? 6 : 3);
            if (capReached) continue;
            recruitmentAvailable.add(action);
            options.push(button(action, province, `${action === 'pawn' ? 'Pawn' : 'Horse'} · ${location}`));
        }
    }
    for (const action of ['pawn', 'horse']) {
        if (recruitmentAvailable.has(action)) continue;
        const capReached = getPlayerUnitCount(player, action === 'pawn' ? 'p' : 'n') >=
            (action === 'pawn' ? 6 : 3);
        options.push(button(action, null,
            `${action === 'pawn' ? 'Pawn' : 'Horse'} · ${capReached ? 'Unit limit reached' : 'No eligible province'}`));
    }
    let armourAvailable = false;
    let castleAvailable = false;
    gameState.board.forEach(row => row.forEach(square =>
        getSquarePieces(square).filter(piece => piece.player === player).forEach(piece => {
            if (isTowerPiece(piece)) {
                getPieceContents(piece).filter(unit => !isPrisoner(unit) &&
                    getUnitLevel(unit, 'armour') === 0).forEach(unit => {
                    armourAvailable = true;
                    options.push(button('armour', unit.id, `Armour level 1 · ${getUnitName(unit)}`));
                });
            }
            getPieceContents(piece).filter(unit => getUnitType(unit) === 'r').forEach(unit => {
                if (!getCastleUpgradeTarget(player, unit.id)) return;
                castleAvailable = true;
                const level = Math.max(0, Math.floor(Number(unit.castleUpgradeLevel) || 0)) + 1;
                options.push(button('castle', unit.id, `Castle level ${level} · ${getUnitName(unit)}`));
            });
        })));
    if (!armourAvailable) options.push(button('armour', null, 'Armour level 1 · No eligible unit in a Castle'));
    if (!castleAvailable) options.push(button('castle', null, 'Castle upgrade · No eligible Castle'));
    options.push(button('lucky', null, 'Lucky Card'));
    return options.join('');
}

function formatResourceCost(cost) {
    return Object.entries(cost).map(([key, amount]) => {
        const resource = RESOURCE_TYPES.find(entry => entry.key === key);
        return `${resource.icon}${amount}`;
    }).join(' ');
}
