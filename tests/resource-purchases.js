// Run with: node tests/resource-purchases.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const context = vm.createContext({
    console, logAction() {}, isPubliclyVisiblePiece() { return true; },
    coordsToNotation() { return 'test'; }
});
[
    'constants', 'models', 'game-state', 'diplomacy-rules', 'setup-utils', 'board-utils',
    'resource-purchases', 'movement-rules', 'siege-rules', 'battle-rules'
].forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createUnit, createResourceStockpiles, isResourcePurchaseRound,
       canPurchaseResourceAction, purchaseResourceAction, getPlayerUnitCount,
       getCastleUpgradeLevel, getBattleCandidateData, refreshResourceTotals,
       getPieceContents, getValidMovesForPiece, registerSiegeStarts,
       renderResourcePurchaseOptions,
       costs: RESOURCE_PURCHASE_COSTS })`, context);
const { state } = api;
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.activePlayers = [true, true, false, false];
state.capitalTowerIds[0] = 'capital-tower';
state.phase = 'PLANNING';
state.round = 4;
state.provinceRecruitmentUsed = Array(16).fill(false);
state.resources = api.createResourceStockpiles();

function castle(player, id, row, column, gate = null) {
    const tower = api.createUnit(player, 'r', `${id}-tower`, `${id}-tower`);
    tower.gate = gate;
    tower.resourceStockpile = {
        horse: 50, food: 50, wood: 50, metal: 50, gold: 50, stone: 50
    };
    const piece = { id, player, type: 'r', contents: [tower] };
    state.board[row][column] = piece;
    return { piece, tower };
}
const capital = castle(1, 'capital', 0, 0);
capital.piece.contents.push(api.createUnit(1, 'p', 'starting-pawn', 'Ap1'));
const recruitProvince = castle(1, 'recruit', 0, 4);
const otherRecruitProvince = castle(1, 'other-recruit', 4, 0);
const diagonalProvince = castle(1, 'diagonal', 4, 4);
const enemyCastle = castle(2, 'enemy-castle', 0, 8, [1, 0]);
state.capitalTowerIds[0] = capital.tower.id;
api.refreshResourceTotals();

assert.equal(api.isResourcePurchaseRound(3), false);
assert.equal(api.isResourcePurchaseRound(4), true);
assert.equal(api.canPurchaseResourceAction(1, 'pawn', 1), true);
assert.equal(api.canPurchaseResourceAction(1, 'pawn', 0), false,
    'The capital province is not a recruiting province');
assert.equal(api.canPurchaseResourceAction(1, 'pawn', 5), false,
    'Diagonal provinces are not adjacent to the capital');
const purchaseOptions = api.renderResourcePurchaseOptions(1);
assert.match(purchaseOptions, /Pawn · Province 2/);
assert.match(purchaseOptions, /Horse · Province 5/);
assert.doesNotMatch(purchaseOptions, /Province 6/,
    'Diagonal provinces are not offered for recruitment');
assert.match(purchaseOptions, /Castle level 1/);
assert.match(purchaseOptions, /data-purchase="armour"/,
    'The shop includes paid armour upgrades as well as recruitment, Castles, and cards');
assert.match(purchaseOptions, /Lucky Card/);
assert.doesNotMatch(purchaseOptions, /data-target="enemy-castle-tower"/,
    'The shop never offers upgrades to enemy units');
state.round = 3;
const closedOptions = api.renderResourcePurchaseOptions(1);
assert.match(closedOptions, /Purchases open on rounds 4, 8, 12/);
assert([...closedOptions.matchAll(/<button[^>]*>/g)].every(([tag]) => tag.includes(' disabled')),
    'All purchases remain visible but disabled outside purchase rounds');
state.round = 4;
state.multiplayer = true;
state.committed[0] = true;
const lockedOptions = api.renderResourcePurchaseOptions(1);
assert.match(lockedOptions, /Unlock your plan/);
assert([...lockedOptions.matchAll(/<button[^>]*>/g)].every(([tag]) => tag.includes(' disabled')),
    'Committed multiplayer players cannot purchase from the dropdown');
state.multiplayer = false;
state.committed[0] = false;

assert(api.purchaseResourceAction(1, 'pawn', 1));
assert.equal(recruitProvince.piece.contents.length, 2);
assert.equal(recruitProvince.piece.contents.at(-1).name, 'Ap2',
    'Recruit names do not collide with starting units');
assert.equal(api.getPlayerUnitCount(1, 'p'), 2);
assert.equal(state.provinceRecruitmentUsed[1], true);
assert.equal(state.resources[0].food, 198);
assert.equal(state.resources[0].wood, 199);
assert.equal(state.resources[0].gold, 199);
assert.equal(api.canPurchaseResourceAction(1, 'horse', 1), false,
    'Pawn and Horse share the one-time province limit');
assert(api.purchaseResourceAction(1, 'horse', 4));
assert.equal(otherRecruitProvince.piece.contents.at(-1).type, 'n');
assert.equal(api.getPlayerUnitCount(1, 'n'), 1);
state.board[8][8] = {
    id: 'existing-pawns', player: 1, type: 'p',
    contents: Array.from({ length: 4 }, (_, index) =>
        api.createUnit(1, 'p', `existing-pawn-${index}`, `Ap-existing-${index}`))
};
assert.equal(api.getPlayerUnitCount(1, 'p'), 6);
state.provinceRecruitmentUsed[1] = false;
assert.equal(api.canPurchaseResourceAction(1, 'pawn', 1), false,
    'The six-living-Pawn cap blocks additional recruitment');
state.provinceRecruitmentUsed[1] = true;
state.board[8][8] = null;

state.round = 5;
assert.equal(api.canPurchaseResourceAction(1, 'lucky'), false,
    'Purchases are unavailable between fourth-round purchase windows');
state.round = 4;

const armourUnit = api.createUnit(1, 'q', 'armour-target', 'Aq-armour');
capital.piece.contents.push(armourUnit);
capital.piece.type = 'r';
assert.match(api.renderResourcePurchaseOptions(1),
    /data-purchase="armour" data-target="armour-target"(?! disabled)/,
    'Eligible armour targets can be purchased directly from the shop');
assert(api.purchaseResourceAction(1, 'armour', armourUnit.id));
assert.equal(armourUnit.armour, 1);
assert.equal(api.canPurchaseResourceAction(1, 'armour', armourUnit.id), false,
    'Paid armour is only available to units at level zero');
armourUnit.armour = 0;
assert.equal(api.canPurchaseResourceAction(2, 'armour', armourUnit.id), false,
    "Players cannot spend another player's resources to upgrade their armour");
armourUnit.armour = 1;

state.sieges = [{
    id: 'existing-siege', towerSquare: [0, 0], towerTimer: 6,
    attackers: [{ pieceId: 'attacker', timer: 3 }]
}];
assert(api.purchaseResourceAction(1, 'castle', capital.tower.id));
assert.equal(api.getCastleUpgradeLevel(capital.piece), 1);
assert.equal(state.sieges[0].towerTimer, 8);
assert.equal(state.sieges[0].attackers[0].timer, 4);
assert(api.purchaseResourceAction(1, 'castle', capital.tower.id));
assert.equal(api.getCastleUpgradeLevel(capital.piece), 2);
assert.equal(state.sieges[0].towerTimer, 12);
assert.equal(state.sieges[0].attackers[0].timer, 6);
assert.equal(api.canPurchaseResourceAction(1, 'castle', capital.tower.id), false,
    'Castles have a two-upgrade maximum');

const defender = api.getBattleCandidateData({ candidates: [{
    player: 1, pieceId: capital.piece.id, isStationary: true,
    contents: [...capital.piece.contents, api.createUnit(1, 'p', 'defender', 'Ap-defender')]
}, {
    player: 2, pieceId: enemyCastle.piece.id, isStationary: false,
    contents: enemyCastle.piece.contents
}] }).find(entry => entry.candidate.player === 1);
assert.equal(defender.towerDefenderBonus, 5);

const resourcesBeforeLucky = { ...state.resources[0] };
assert(api.purchaseResourceAction(1, 'lucky'));
assert.deepEqual({ ...state.resources[0] }, {
    ...resourcesBeforeLucky,
    gold: resourcesBeforeLucky.gold - 1,
    horse: resourcesBeforeLucky.horse - 1,
    metal: resourcesBeforeLucky.metal - 1,
    food: resourcesBeforeLucky.food - 1,
    wood: resourcesBeforeLucky.wood - 1
});

state.sieges = [];
state.round = 2;
state.turnIndex = 0;
const attacker = {
    id: 'attacker', player: 1, type: 'p',
    contents: [api.createUnit(1, 'p', 'attacker-pawn', 'Ap-attacker')]
};
state.board[1][8] = attacker;
assert(api.getValidMovesForPiece(1, 8).some(([row, column]) => row === 0 && column === 8),
    'A Pawn stack can initiate a paid siege while Pawns are inactive');
const siegeMove = {
    player: 1, pieceId: attacker.id, from: [1, 8], to: [0, 8],
    contents: attacker.contents
};
api.registerSiegeStarts([siegeMove]);
assert(siegeMove.siegeStart);
assert.equal(state.sieges.at(-1).towerTimer, 6);
assert.equal(state.sieges.at(-1).attackers[0].timer, 3);
const foodAfterFirstSiege = state.resources[0].food;
const woodAfterFirstSiege = state.resources[0].wood;
const secondAttacker = {
    id: 'attacker-two', player: 1, type: 'p',
    contents: [api.createUnit(1, 'p', 'attacker-two-pawn', 'Ap-attacker-two')]
};
state.board[1][7] = secondAttacker;
api.registerSiegeStarts([{
    player: 1, pieceId: secondAttacker.id, from: [1, 7], to: [0, 8],
    contents: secondAttacker.contents
}]);
assert.equal(state.resources[0].food, foodAfterFirstSiege,
    'Additional attackers join without paying again');
assert.equal(state.resources[0].wood, woodAfterFirstSiege);

state.sieges = [];
for (const piece of state.board.flatMap(row => row.flatMap(square =>
    Array.isArray(square) ? square : square ? [square] : []))) {
    if (piece.player !== 1) continue;
    api.getPieceContents(piece).forEach(unit => {
        if (unit.resourceStockpile) unit.resourceStockpile.food = 0;
    });
}
capital.tower.resourceStockpile.food = 1;
api.refreshResourceTotals();
castle(2, 'second-enemy-castle', 4, 8, [1, 0]);
const unaffordableAttacker = {
    id: 'unaffordable-attacker', player: 1, type: 'p',
    contents: [api.createUnit(1, 'p', 'unaffordable-pawn', 'Ap-unaffordable')]
};
state.board[5][8] = unaffordableAttacker;
const rejectedSiege = {
    player: 1, pieceId: unaffordableAttacker.id, from: [5, 8], to: [4, 8],
    contents: unaffordableAttacker.contents
};
api.registerSiegeStarts([rejectedSiege]);
assert.equal(rejectedSiege.invalid, true);
assert.equal(state.sieges.length, 0, 'Siege deployment without its Food cost is rejected');
assert.equal(state.resources[0].food, 1, 'Rejected siege deployment spends nothing');
state.round = 4;
capital.tower.resourceStockpile.food = 0;
api.refreshResourceTotals();
const unaffordableOptions = api.renderResourcePurchaseOptions(1);
assert.match(unaffordableOptions, /data-purchase="armour"[^>]* disabled>/,
    'Unaffordable armour upgrades are disabled in the shop');
const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
for (let player = 1; player <= 4; player++) {
    assert.match(html, new RegExp(`id="diplomacy-actions-p${player}"[^<]*</span><details id="resource-purchases-p${player}"`),
        'Each shopping-cart dropdown sits next to the diplomacy control');
    assert.match(html, new RegExp(`id="resource-purchases-p${player}"[^>]*>[\\s\\S]*?<summary[^>]*aria-label="Resource shop"`));
    assert.equal((html.match(new RegExp(`id="resource-purchases-p${player}"`, 'g')) || []).length, 1,
        'The inline purchase panel is replaced, not duplicated');
}
console.log('Resource purchases, castle upgrades, and paid siege checks passed.');
