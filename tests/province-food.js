// Run with: node tests/province-food.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const logs = [];
const context = vm.createContext({
    console, logAction(message) { logs.push(message); }, renderRetreatTable() {},
    isPubliclyVisiblePiece() { return true; }, coordsToNotation() { return 'test'; }
});
[
    'constants', 'models', 'game-state', 'setup-utils', 'board-utils',
    'resource-purchases', 'capital-rules', 'retreat-rules', 'prisoner-rules',
    'siege-rules', 'province-food'
].forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createUnit, reconcileProvinceFood, resolveProvinceFood,
       refillProvinceFood, canRefillProvinceFood, refreshResourceTotals,
       beginCaptureChoices, processRetreatsAtRoundStart, rebel: REBEL_PLAYER_ID })`, context);
const { state } = api;
state.boardSize = 12;
state.board = Array.from({ length: 12 }, () => Array(12).fill(null));
state.biomes = Array.from({ length: 12 }, () => Array(12).fill('plains'));
state.activePlayers = [true, true, false, false];
state.eliminated = [false, false, true, true];
state.phase = 'PLANNING';
const tower = api.createUnit(1, 'r', 'tower');
tower.resourceStockpile = { food: 3, wood: 2 };
const king = api.createUnit(1, 'k', 'king');
const prisoner = { ...api.createUnit(1, 'q', 'prisoner'), originalPlayer: 2, prisonerOf: 1 };
const castle = { id: 'castle', player: 1, type: 'r', contents: [tower, king, prisoner] };
const ally = { id: 'ally', player: 2, type: 'p', contents: [api.createUnit(2, 'p', 'ally-pawn')] };
state.board[0][0] = [castle, ally];
state.capitalTowerIds[0] = tower.id;
api.refreshResourceTotals();
api.reconcileProvinceFood();
assert.equal(state.provinceFood[0], 6);
assert.equal(state.provinceFood[1], null);
assert.equal(api.refillProvinceFood(1, 0), false);
for (const round of [1, 2, 3]) api.resolveProvinceFood(round);
assert.equal(state.provinceFood[0], 6);
api.resolveProvinceFood(4);
assert.equal(state.provinceFood[0], 5);
api.resolveProvinceFood(4);
assert.equal(state.provinceFood[0], 5, 'The same completed round cannot deplete food twice');
assert.equal(api.refillProvinceFood(2, 0), false);
assert.equal(api.refillProvinceFood(1, 0), true);
assert.equal(state.provinceFood[0], 6);
assert.equal(state.resources[0].food, 2);
state.multiplayer = true;
state.committed[0] = true;
assert.equal(api.refillProvinceFood(1, 0), false);
state.committed[0] = false;
state.phase = 'COMMITTED';
state.provinceFood[0] = 5;
assert.equal(api.refillProvinceFood(1, 0), true, 'An unlocked guest can refill after the host commits');
state.multiplayer = false;
state.phase = 'PLANNING';

for (const round of [8, 12, 16, 20, 24]) api.resolveProvinceFood(round);
assert.equal(state.provinceFood[0], 1);
state.round = 29;
api.resolveProvinceFood(28);
assert.equal(castle.player, api.rebel);
assert.equal(tower.resourceStockpile.food, 1, 'Tower resources remain with the Tower');
assert.equal(castle.contents[0].player, api.rebel);
assert.equal(state.resources[0].food, 0);
assert.equal(state.provinceFood[0], null);
assert.equal(state.retreating[0][0].contents[0].id, 'king');
assert.equal(state.retreating[0][0].reentryRound, 31);
assert.equal(state.retreating[0][0].contents[0].routedStacks, 1);
const released = state.retreating[1].find(entry => entry.released);
const routedAlly = state.retreating[1].find(entry => !entry.released);
assert.equal(released.contents[0].id, 'prisoner');
assert.equal(released.contents[0].player, 2);
assert.equal(routedAlly.contents[0].id, 'ally-pawn');
assert.equal(state.horde[0], true);
assert.equal(state.board.flat().filter(piece => piece?.player === api.rebel && piece.type === 'p').length, 1);

castle.player = 2;
castle.contents[0].player = 2;
api.reconcileProvinceFood();
assert.equal(state.provinceFood[0], 6, 'A newly acquired province starts full');
state.provinceFood[0] = 2;
state.board[1][1] = {
    id: 'contesting', player: 1, type: 'r', contents: [api.createUnit(1, 'r', 'contesting-tower')]
};
api.reconcileProvinceFood();
assert.equal(state.provinceFood[0], null);
state.board[1][1] = null;
api.reconcileProvinceFood();
assert.equal(state.provinceFood[0], 6);

state.board = Array.from({ length: 12 }, () => Array(12).fill(null));
state.biomes = Array.from({ length: 12 }, () => Array(12).fill('mountain'));
const crowdedTower = { id: 'crowded', player: 1, type: 'r', contents: [api.createUnit(1, 'r', 'crowded-tower')] };
state.board[0][0] = crowdedTower;
state.provinceFoodOwners = Array(16).fill(null);
state.provinceFood = Array(16).fill(null);
state.lastProvinceFoodRound = null;
api.reconcileProvinceFood();
state.provinceFood[0] = 1;
api.resolveProvinceFood(32);
assert.equal(crowdedTower.player, api.rebel);
assert.equal(crowdedTower.contents.filter(unit => unit.type === 'p').length, 1,
    'The rebel Pawn appears inside the Tower when no passable square is free');

state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
const firstTower = { id: 'first', player: 1, type: 'r', contents: [api.createUnit(1, 'r', 'first-tower')] };
const secondTower = { id: 'second', player: 1, type: 'r', contents: [api.createUnit(1, 'r', 'second-tower')] };
state.board[0][0] = firstTower;
state.board[3][3] = secondTower;
state.provinceFoodOwners = Array(16).fill(null);
state.provinceFood = Array(16).fill(null);
state.lastProvinceFoodRound = null;
api.reconcileProvinceFood();
state.provinceFood[0] = 1;
api.resolveProvinceFood(36);
assert.equal(firstTower.player, api.rebel);
assert.equal(secondTower.player, api.rebel);
assert.equal(state.board.flat().filter(piece => piece?.type === 'p' && piece.player === api.rebel).length, 1,
    'A province with multiple Towers still spawns exactly one rebel Pawn');

state.board[4][4] = { id: 'recipient', player: 1, type: 'p', contents: [api.createUnit(1, 'p', 'own')] };
const capturedRebel = api.createUnit(api.rebel, 'p', 'rebel-captive');
api.beginCaptureChoices(1, [capturedRebel], [4, 4]);
assert.equal(state.pendingCapture, null);
assert.deepEqual(state.board[4][4].contents.map(unit => unit.id), ['own'],
    'Captured rebels do not join the winning army');
console.log('Province food and rebellion checks passed.');
