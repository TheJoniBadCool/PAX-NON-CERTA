// Run with: node tests/battle-rules.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = vm.createContext({
    Math: Object.create(Math), console,
    renderRetreatTable() {}, logAction() {}, coordsToNotation() { return 'test'; }
});
['constants', 'models', 'game-state', 'board-utils', 'movement-rules', 'battle-rules', 'retreat-rules'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createUnit, getRoutedStacks, getRoutedStats, getUnitStats,
       getPieceContents, getBattleCandidateData, casualtyChance,
       resolveCandidateCasualties, queueRetreat, processRetreatsAtRoundStart })`, context);
const state = api.state;
const unit = (type, id = type) => api.createUnit(1, type, id, id);
const candidate = (contents, player = 1) => ({
    id: `piece-${player}`, pieceId: `piece-${player}`, player, contents
});
function close(actual, expected) {
    assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`);
}
function reset(round = 1) {
    state.reset();
    state.round = round;
    state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
}
reset();
const queen = unit('q');
const king = unit('k');
const pawn = unit('p');
close(api.casualtyChance(queen, 0, true, false), 0.60 * 1.10);
close(api.casualtyChance(king, 0, true, false), 0.75 * 1.10);
close(api.casualtyChance(queen, 0.5, true, false), 0.60 * 0.5 * 1.10);
close(api.casualtyChance(queen, 0, true, false, [queen, pawn]), 0.10 * 1.10);
close(api.casualtyChance(king, 0, true, false, [king, queen]), 0.50 * 1.10);
close(api.casualtyChance(queen, 0.5, false, false), 0.10 * 0.5 * 0.5);
close(api.casualtyChance(king, 0.5, false, false), 0.50 * 0.5 * 0.5);
close(api.casualtyChance(pawn, 0.5, true, false), 0.25 * 0.5 * 1.10);

context.Math.random = () => 0.5;
const loneResult = api.resolveCandidateCasualties(candidate([queen]), 0, true, false, []);
assert.equal(loneResult.captured.length, 1, 'Resolution must capture defeated lone royals using their existing odds');
const escortedQueen = unit('q', 'escorted');
const escortedResult = api.resolveCandidateCasualties(candidate([escortedQueen, unit('p', 'escort')]), 0, true, false, []);
assert.ok(escortedResult.survivors.includes(escortedQueen), 'Escorts must protect royal base odds');

api.queueRetreat(1, [queen, pawn], [8, 8]);
let pending = state.retreating[0][0];
assert.equal(pending.reentryRound, 4);
assert.equal(pending.contents[0].routedStacks, 1);
assert.equal(pending.contents[0].routedUntilRound, 7);
assert.equal(queen.routedStacks, undefined, 'Queueing must not mutate the resolved battle snapshot');
state.round = 3;
api.processRetreatsAtRoundStart();
assert.equal(state.retreating[0].length, 1);
state.round = 4;
api.processRetreatsAtRoundStart();
assert.equal(state.retreating[0].length, 0);
let returned = state.board.flat().find(Boolean);
const routedQueen = returned.contents[0];
const routedPawn = returned.contents[1];
assert.equal(api.getRoutedStacks(routedQueen), 1);
assert.ok(api.getUnitStats(routedQueen).includes('3 rounds remaining'));
close(api.casualtyChance(routedQueen, 0, true, false, returned.contents), 0.11 + 0.15);
close(api.casualtyChance(routedQueen, 0.5, false, false, returned.contents), 0.025 + 0.15);
close(api.casualtyChance(routedQueen, 0, true, false), 0.66 + 0.15);
close(api.casualtyChance(pawn, 0, true, false), 0.275);

const enemy = candidate([api.createUnit(2, 'p', 'enemy')], 2);
let data = api.getBattleCandidateData({ candidates: [candidate([routedPawn]), enemy] });
close(data[0].rawWeight, 0.8);
close(data[0].weight, Math.pow(0.8, 1.35));
close(data[0].probability, Math.pow(0.8, 1.35) / (Math.pow(0.8, 1.35) + 1));
const freshPawn = unit('p', 'fresh');
data = api.getBattleCandidateData({ candidates: [candidate([routedPawn, freshPawn]), enemy] });
close(data[0].routedPenalty, 0.1);
close(data[0].rawWeight, 2 * 1.2 * 0.9);
close(api.casualtyChance(freshPawn, 0, true, false, [routedPawn, freshPawn]), 0.275);
const split = api.getPieceContents(candidate([routedQueen]));
assert.equal(api.getRoutedStacks(split[0]), 1, 'Splitting must preserve individual penalties');
const mirrored = JSON.parse(JSON.stringify(returned));
assert.equal(api.getRoutedStacks(mirrored.contents[0]), 1, 'Serialized units must retain penalties');

state.round = 6;
assert.equal(api.getRoutedStacks(routedQueen), 1);
api.queueRetreat(1, [routedQueen], [8, 8]);
pending = state.retreating[0][0];
assert.equal(pending.contents[0].routedStacks, 2);
assert.equal(pending.contents[0].routedUntilRound, 12);
state.round = 9;
api.processRetreatsAtRoundStart();
returned = state.board.flat().find(piece => piece && piece.contents[0].routedStacks === 2);
close(api.casualtyChance(returned.contents[0], 0, true, false), 0.96);
api.queueRetreat(1, returned.contents, [8, 8]);
assert.equal(state.retreating[0][0].contents[0].routedStacks, 3);
state.round = 12;
api.processRetreatsAtRoundStart();
returned = state.board.flat().find(piece => piece && piece.contents[0].routedStacks === 3);
close(api.casualtyChance(returned.contents[0], 0, true, false), 1);
close(api.casualtyChance(returned.contents[0], 0, true, true), 1);
api.queueRetreat(1, returned.contents, [8, 8]);
assert.equal(state.retreating[0][0].contents[0].routedStacks, 3, 'Repeated retreats must respect the cap');
state.round = 15;
api.processRetreatsAtRoundStart();
returned = state.board.flat().find(piece => piece && piece.contents[0].routedUntilRound === 18);
state.round = 17;
assert.equal(api.getRoutedStacks(returned.contents[0]), 3);
state.round = 18;
assert.equal(api.getRoutedStacks(returned.contents[0]), 0);
assert.equal(api.getRoutedStats(returned.contents[0]), '');
close(api.casualtyChance(returned.contents[0], 0, true, false), 0.66);
api.queueRetreat(1, returned.contents, [8, 8]);
assert.equal(state.retreating[0][0].contents[0].routedStacks, 1, 'Expired penalties must restart at one');

const tower = { ...unit('r'), routedStacks: 3, routedUntilRound: 30 };
close(api.casualtyChance(tower, 0, true, true), 0);
const siegeQueen = { ...unit('q'), routedStacks: 1, routedUntilRound: 30 };
const siegeResult = api.resolveCandidateCasualties(candidate([tower, siegeQueen]), 0.9, true, true, []);
assert.equal(siegeResult.captured[0], siegeQueen, 'Defeated siege defenders must be captured');
assert.equal(siegeResult.survivors[0], tower, 'Towers must survive siege resolution');

reset();
api.queueRetreat(1, [unit('q')], [0, 0]);
state.round = 5;
api.processRetreatsAtRoundStart();
returned = state.board.flat().find(Boolean);
assert.equal(returned.contents[0].routedUntilRound, 8, 'Delayed processing must allow three playable rounds');
reset();
api.queueRetreat(1, [unit('q')], [0, 0]);
state.board = state.board.map(row => row.map(() => candidate([unit('p')], 2)));
state.round = 4;
api.processRetreatsAtRoundStart();
assert.equal(state.deadPieces[0].length, 1, 'Blocked re-entry must still kill retreating units');
assert.equal(state.retreating[0].length, 0);
reset();
assert.equal(state.retreating[0].length, 0, 'New games must discard routed retreat queues');
console.log('Battle and routed-retreat checks passed');
