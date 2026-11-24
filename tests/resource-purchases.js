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
    ({ state: gameState, createUnit, createResourceStockpiles,
       canPurchaseResourceAction, purchaseResourceAction, getPlayerUnitCount,
       getCastleUpgradeLevel, getBattleCandidateData, refreshResourceTotals,
       getPieceContents, getValidMovesForPiece, registerSiegeStarts, resolveResourceProduction,
       renderResourcePurchaseOptions, renderRequirements, renderPurchaseControl, getPurchaseConditions,
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

for (const round of [1, 2, 3, 4, 5, 8, 12, 13]) {
    state.round = round;
    for (const [action, target] of [
        ['pawn', 1], ['horse', 1], ['armour', 'starting-pawn'],
        ['castle', capital.tower.id], ['lucky', null]
    ]) {
        assert(api.canPurchaseResourceAction(1, action, target),
            `${action} is available in round ${round} when its requirements are met`);
    }
}
state.round = 4;
assert.equal(api.canPurchaseResourceAction(1, 'pawn', 1), true);
assert.equal(api.canPurchaseResourceAction(1, 'pawn', 0), false,
    'The capital province is not a recruiting province');
assert.equal(api.canPurchaseResourceAction(1, 'pawn', 5), false,
    'Diagonal provinces are not adjacent to the capital');
const purchaseOptions = api.renderResourcePurchaseOptions(1);
assert.match(purchaseOptions, /Lucky Card/);
for (const action of ['pawn', 'horse', 'armour', 'castle']) {
    assert.match(purchaseOptions, new RegExp(`data-purchase="${action}"`),
        `The player-card shop also offers ${action}`);
}
assert.match(purchaseOptions, /data-purchase="pawn" data-target="castle:recruit-tower"[^>]*>/);
assert.match(purchaseOptions, /data-purchase="pawn" data-target="castle:capital-tower"[^>]* disabled>/);
assert.match(purchaseOptions, /data-purchase="armour" data-target="starting-pawn"[^>]*>/);
assert.doesNotMatch(purchaseOptions, /data-purchase="armour" data-target="capital-tower"/,
    'The shop does not offer armour for Towers');
assert.doesNotMatch(purchaseOptions, /data-target="(?:castle:)?enemy-castle-tower"/);
assert.equal(api.canPurchaseResourceAction(1, '__proto__'), false);
assert(api.canPurchaseResourceAction(1, 'pawn', `castle:${recruitProvince.tower.id}`));
assert(!api.canPurchaseResourceAction(1, 'pawn', `castle:${diagonalProvince.tower.id}`));
assert(!api.canPurchaseResourceAction(1, 'pawn', `castle:${capital.tower.id}`));
assert(!api.canPurchaseResourceAction(1, 'pawn', `castle:${enemyCastle.tower.id}`));
state.round = 3;
const openOptions = api.renderResourcePurchaseOptions(1);
assert.match(openOptions, /data-purchase="lucky"[^>]*>/);
assert.doesNotMatch(openOptions, /Purchases open on rounds/);
state.multiplayer = true;
state.committed[0] = true;
const lockedOptions = api.renderResourcePurchaseOptions(1);
assert.match(lockedOptions, /Unlock your plan/);
assert([...lockedOptions.matchAll(/<button[^>]*>/g)].every(([tag]) => tag.includes(' disabled')),
    'Committed multiplayer players cannot purchase from the dropdown');
state.multiplayer = false;
state.committed[0] = false;

state.phase = 'RESOLVING';
assert.equal(api.canPurchaseResourceAction(1, 'lucky'), false, 'Purchases still require planning');
state.phase = 'PLANNING';
state.round = 1;
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
assert.match(api.renderRequirements(1, api.costs.horse,
    api.getPurchaseConditions(1, 'horse', `castle:${recruitProvince.tower.id}`)),
    /requirement-missing">Province not already used: ineligible/);
const secondCastle = castle(1, 'second-recruit', 5, 0);
const sharedProvinceOptions = api.renderResourcePurchaseOptions(1);
assert.match(sharedProvinceOptions, /data-purchase="horse" data-target="castle:second-recruit-tower"[^>]*>/);
assert.match(sharedProvinceOptions, /data-purchase="horse" data-target="castle:other-recruit-tower"[^>]*>/);
state.round = 2;
assert(api.purchaseResourceAction(1, 'horse', `castle:${secondCastle.tower.id}`));
assert.equal(secondCastle.piece.contents.at(-1).type, 'n',
    'Recruitment targets the selected Castle even when another Castle shares its province');
assert.equal(otherRecruitProvince.piece.contents.length, 1);
assert.match(api.renderResourcePurchaseOptions(1),
    /data-purchase="horse" data-target="castle:other-recruit-tower"[^>]* disabled>/,
    'A purchase from either Castle disables recruitment in the whole province');
otherRecruitProvince.piece.contents.push(secondCastle.piece.contents.at(-1));
state.board[5][0] = null;
api.refreshResourceTotals();
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
assert.equal(api.canPurchaseResourceAction(1, 'lucky'), true,
    'Lucky Cards are available between former purchase windows');
state.round = 3;

const armourUnit = api.createUnit(1, 'q', 'armour-target', 'Aq-armour');
capital.piece.contents.push(armourUnit);
capital.piece.type = 'r';
assert.match(api.renderPurchaseControl(1, 'armour', armourUnit.id, 'Armour'),
    /data-purchase="armour" data-target="armour-target"[^>]*>/);
assert.equal(api.canPurchaseResourceAction(1, 'armour', capital.tower.id), false,
    'Towers cannot receive the armour purchase');
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
state.round = 5;
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
state.round = 7;
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
const foodBeforeSiege = state.resources[0].food;
const woodBeforeSiege = state.resources[0].wood;
api.registerSiegeStarts([siegeMove]);
assert(siegeMove.siegeStart);
assert.equal(state.sieges.at(-1).towerTimer, 6);
assert.equal(state.sieges.at(-1).attackers[0].timer, 3);
assert.equal(state.resources[0].food, foodBeforeSiege - 1, 'Starting a siege costs 1 Food');
assert.equal(state.resources[0].wood, woodBeforeSiege - 1, 'Starting a siege costs 1 Wood');
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
capital.tower.resourceStockpile.food = 0;
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
assert.equal(state.resources[0].food, 0, 'Rejected siege deployment spends nothing');
state.round = 4;
capital.tower.resourceStockpile.food = 0;
api.refreshResourceTotals();
const unaffordableOptions = api.renderResourcePurchaseOptions(1);
assert.match(unaffordableOptions, /data-purchase="lucky"[^>]* disabled>/);
const unavailableArmour = api.renderPurchaseControl(1, 'armour', 'starting-pawn', 'Armour');
assert.match(unavailableArmour, /data-purchase="armour"[^>]* disabled>/);
assert.match(unavailableArmour, /requirement-missing.*Food: 0 of 1/);
assert(api.getValidMovesForPiece(5, 8).some(([row, column]) => row === 4 && column === 8),
    'An unaffordable siege target remains accessible to show its disabled action');
const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
for (let player = 1; player <= 4; player++) {
    assert.match(html, new RegExp(`id="diplomacy-actions-p${player}"[^<]*</span></span><span class="player-purchase-actions"><details id="resource-purchases-p${player}"`),
        'Each shopping-cart dropdown sits next to the diplomacy control');
    assert.match(html, new RegExp(`id="resource-purchases-p${player}"[^>]*>[\\s\\S]*?<summary[^>]*aria-label="Resource shop"`));
    assert.equal((html.match(new RegExp(`id="resource-purchases-p${player}"`, 'g')) || []).length, 1,
        'The inline purchase panel is replaced, not duplicated');
}
const styles = fs.readFileSync('styles.css', 'utf8');
assert.match(styles, /\.resource-purchase-options\s*\{[^}]*top:\s*auto;[^}]*bottom:\s*100%;/,
    'The purchase panel opens above the player card');

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.activePlayers = [true, true, false, false];
state.phase = 'PLANNING';
state.round = 4;
const owner = castle(1, 'site-owner', 0, 0);
const opponent = castle(2, 'site-opponent', 0, 4);
owner.tower.resourceStockpile = { stone: 2, wood: 2, food: 2, gold: 1 };
api.refreshResourceTotals();
state.provinceResources[0] = [
    { type: 'food', productionChance: 50, row: 0, column: 1 },
    { type: 'wood', productionChance: 100, row: 0, column: 1 }
];
state.provinceResources[1] = { type: 'gold', productionChance: 100 };
assert.match(api.renderResourcePurchaseOptions(1), /data-purchase="resource" data-target="0:0"/);
assert.doesNotMatch(api.renderResourcePurchaseOptions(1), /data-purchase="resource" data-target="1:0"/);
assert.match(api.renderPurchaseControl(1, 'resource', '0:0', 'Upgrade Food'),
    /Increase production from 1 to 2 per successful check/);
for (const target of [null, '', '0', '00:0', '0:-1', '0:2', '16:0', '0:1.0', '0:9007199254740992']) {
    assert.equal(api.purchaseResourceAction(1, 'resource', target), false, `Invalid site target ${target}`);
}
assert.equal(api.purchaseResourceAction(2, 'resource', '0:0'), false, 'Only the province owner can upgrade');
state.board[1][0] = { id: 'contesting-tower', player: 2, type: 'r',
    contents: [api.createUnit(2, 'r', 'contesting-tower-unit')] };
assert.equal(api.purchaseResourceAction(1, 'resource', '0:0'), false, 'Contested provinces cannot upgrade');
state.board[1][0] = null;
state.eliminated[0] = true;
assert.equal(api.purchaseResourceAction(1, 'resource', '0:0'), false, 'Eliminated players cannot upgrade');
state.eliminated[0] = false;
state.round = 3;
assert.equal(api.canPurchaseResourceAction(1, 'resource', '0:0'), true, 'Sites can be upgraded on any round');
state.multiplayer = true;
state.committed[0] = true;
assert.equal(api.purchaseResourceAction(1, 'resource', '0:0'), false, 'Committed plans cannot purchase');
state.committed[0] = false;
state.multiplayer = false;
owner.tower.resourceStockpile.stone = 1;
api.refreshResourceTotals();
assert.equal(api.purchaseResourceAction(1, 'resource', '0:0'), false, 'All costs must be affordable');
assert.equal(state.provinceResources[0][0].productionUpgraded, undefined);
owner.tower.resourceStockpile.stone = 2;
api.refreshResourceTotals();
assert(api.purchaseResourceAction(1, 'resource', '0:0'));
assert.equal(state.provinceResources[0][0].productionUpgraded, true);
assert.equal(state.provinceResources[0][1].productionUpgraded, undefined, 'Shared-square sites upgrade independently');
for (const key of ['stone', 'wood', 'food', 'gold']) assert.equal(state.resources[0][key], 0);
assert.equal(api.purchaseResourceAction(1, 'resource', '0:0'), false, 'A site can only be upgraded once');
assert.match(api.renderPurchaseControl(1, 'resource', '0:0', 'Upgrade Food'), / disabled>/);
const restored = JSON.parse(JSON.stringify(state.provinceResources));
assert.equal(restored[0][0].productionUpgraded, true, 'Upgrade persists in serialized game state');
api.resolveResourceProduction(1, () => 0.5);
assert.equal(state.resources[0].food, 0, 'An upgraded site still fails at its probability threshold');
api.resolveResourceProduction(2, () => 0.49);
assert.equal(state.resources[0].food, 2, 'A successful upgraded site awards two resources');
owner.piece.player = 2;
owner.tower.player = 2;
api.refreshResourceTotals();
assert.equal(state.provinceResources[0][0].productionUpgraded, true, 'Conquest does not remove a site upgrade');
assert.equal(api.purchaseResourceAction(2, 'resource', '0:0'), false, 'The new owner cannot upgrade it again');
assert(api.purchaseResourceAction(2, 'resource', '0:1'), 'The new owner can upgrade a different site');
const foodBeforeConquestProduction = state.resources[1].food;
api.resolveResourceProduction(3, () => 0);
assert.equal(state.resources[1].food, foodBeforeConquestProduction + 2,
    'After conquest the new owner receives the upgraded output');
console.log('Resource purchases, castle upgrades, and paid siege checks passed.');
