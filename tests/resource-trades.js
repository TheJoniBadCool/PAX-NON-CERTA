// Run with: node tests/resource-trades.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const context = vm.createContext({ console });
['constants', 'models', 'game-state', 'diplomacy-rules', 'setup-utils', 'board-utils',
    'resource-purchases'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, applyResourceTradeAction, getPendingResourceTrades,
       refreshResourceTotals, spendPlayerResources,
       resources: RESOURCE_TYPES })`, context);
const { state } = api;
const act = (actor, target, action, terms = null, id = state.resourceTrades[0]?.id) =>
    api.applyResourceTradeAction(actor, target, action, terms, id);
const offer = (give = { gold: 4 }, receive = { wood: 3 }) => ({ give, receive });
const stock = amount => Object.fromEntries(Array.from(api.resources, ({ key }) => [key, amount]));
let holders;
function reset() {
    state.reset();
    state.multiplayer = true;
    holders = [1, 2, 3, 4].map(player => ({
        id: `capital-${player}`, player, type: 'r', resourceStockpile: stock(10)
    }));
    state.board = [holders.map(unit => ({ id: `army-${unit.player}`,
        player: unit.player, type: 'r', contents: [unit] }))];
    state.capitalTowerIds = holders.map(unit => unit.id);
    api.refreshResourceTotals();
}
const balances = () => JSON.stringify([state.board, state.retreating, state.resources]);

reset();
for (const target of [0, -1, 4, '1', null, 1.5]) assert(act(0, target, 'propose', offer()));
for (const actor of [-1, 4, '0', null, 0.5]) assert(act(actor, 1, 'propose', offer()));
for (const amounts of [null, [], 5, { unknown: 1 }, { gold: -1 }, { gold: 0.5 },
    { gold: '2' }, { gold: NaN }, { gold: Infinity }, { gold: Number.MAX_SAFE_INTEGER + 1 }]) {
    assert(act(0, 1, 'propose', { give: amounts, receive: {} }));
    assert(act(0, 1, 'propose', { give: {}, receive: amounts }));
}
assert(act(0, 1, 'propose', offer({}, {})), 'Empty proposals are rejected');
assert.equal(state.resourceTrades.length, 0);
state.activePlayers[1] = false;
assert(act(0, 1, 'propose', offer()));
state.activePlayers[1] = true;
state.eliminated[1] = true;
assert(act(0, 1, 'propose', offer()));
reset();
for (const phase of ['STARTING_POSITION', 'TRANSITION', 'RESOLVING', 'GAME_OVER', 'ALLIANCE_REVIEW']) {
    state.phase = phase;
    assert(act(0, 1, 'propose', offer()), `No proposals in ${phase}`);
}

reset();
const before = balances();
assert(act(0, 1, 'propose', offer({ gold: 11 })), 'Sender needs the full offered amount');
assert(act(0, 1, 'propose', offer({}, { food: 11 })), 'Recipient must hold the full requested amount');
assert.equal(balances(), before);
assert.equal(act(0, 1, 'propose', offer()), null, 'Players at war may exchange resources');
const firstId = state.resourceTrades[0].id;
assert.equal(balances(), before, 'Proposals do not reserve or spend resources');
assert(act(0, 1, 'propose', offer()));
assert(act(1, 0, 'propose', offer()), 'The pending limit applies in both directions');
assert(act(0, 1, 'accept'), 'Senders cannot accept their own proposals');
assert(act(2, 0, 'accept', null, firstId), 'Third parties cannot answer');
assert(act(1, 0, 'cancel'), 'Recipients cannot cancel as the sender');
assert.equal(act(1, 0, 'accept'), null);
assert.equal(state.resources[0].gold, 6);
assert.equal(state.resources[0].wood, 13);
assert.equal(state.resources[1].gold, 14);
assert.equal(state.resources[1].wood, 7);
assert.equal(holders[1].resourceStockpile.gold, 14, 'Transfers reach persistent unit storage');
const transferred = balances();
assert(act(1, 0, 'accept', null, firstId), 'Repeated acceptance cannot transfer twice');
assert.equal(balances(), transferred);
assert.equal(act(0, 1, 'propose', offer()), null, 'Several completed deals per round are allowed');
assert(act(1, 0, 'accept', null, firstId), 'A stale reply cannot accept a newer proposal');
assert.equal(act(0, 1, 'cancel'), null);
assert.equal(balances(), transferred, 'Cancellation moves nothing');
assert.equal(act(0, 1, 'propose', offer()), null);
assert.equal(act(1, 0, 'decline'), null);
assert.equal(balances(), transferred, 'Declining moves nothing');

for (const side of ['give', 'receive']) {
    reset();
    assert.equal(act(0, 1, 'propose', offer()), null);
    const player = side === 'give' ? 1 : 2;
    assert(api.spendPlayerResources(player, side === 'give' ? { gold: 8 } : { wood: 8 }),
        'Offered resources stay spendable');
    const afterSpending = balances();
    assert(act(1, 0, 'accept'), 'Both full balances are rechecked before accepting');
    assert.equal(balances(), afterSpending, 'Failed acceptance makes no partial transfer');
    assert.equal(state.resourceTrades.length, 1, 'An unaffordable proposal can still be declined');
    assert.equal(act(1, 0, 'decline'), null);
}

reset();
state.diplomacy[0].changedRound = state.round;
assert.equal(act(0, 1, 'propose', offer()), null, 'Alliance round locks do not restrict exchanges');
state.committed[0] = state.committed[1] = true;
state.phase = 'COMMITTED';
assert(act(0, 1, 'cancel'), 'Committed senders must unlock to cancel');
assert(act(0, 2, 'propose', offer()), 'Committed senders must unlock to propose');
assert.equal(act(1, 0, 'accept'), null, 'Committed recipients can reply');

for (const terms of [offer({ gold: 10 }, {}), offer({}, { stone: 10 })]) {
    reset();
    assert.equal(act(0, 1, 'propose', terms), null, 'Either side can give nothing');
    assert.equal(act(1, 0, 'accept'), null);
    for (const { key } of api.resources) {
        assert.equal(state.resources[0][key], 10 - (terms.give[key] || 0) + (terms.receive[key] || 0));
        assert.equal(state.resources[1][key], 10 + (terms.give[key] || 0) - (terms.receive[key] || 0));
    }
}

reset();
assert.equal(act(0, 1, 'propose', offer({ gold: 10 }, { gold: 10 })), null);
assert(api.spendPlayerResources(1, { gold: 1 }));
assert(act(1, 0, 'accept'), 'Incoming resources cannot finance the outgoing side, even for the same resource');

reset();
holders[0].resourceStockpile.gold = Number.MAX_SAFE_INTEGER;
api.refreshResourceTotals();
assert(act(1, 0, 'propose', offer({ gold: 1 }, {})), 'Unsafe resulting totals are rejected');

reset();
state.board[0][1].contents = [{ id: 'pawn', player: 2, type: 'p' }];
api.refreshResourceTotals();
assert(act(0, 1, 'propose', offer({ gold: 1 }, {})), 'Recipients need an eligible storage unit');
assert.equal(state.resourceTrades.length, 0);

reset();
holders[1].type = 'k';
state.capitalTowerIds[1] = null;
state.retreating[1] = [{ player: 2, contents: [holders[1]] }];
state.board[0][1] = null;
api.refreshResourceTotals();
assert.equal(act(0, 1, 'propose', offer()), null, 'Retreating Kings can receive resources without a capital');
assert.equal(act(1, 0, 'accept'), null);
assert.equal(holders[1].resourceStockpile.gold, 14);

reset();
state.multiplayer = false;
assert(act(1, 0, 'propose', offer()), 'Hotseat proposals belong to the current planner');
assert.equal(act(0, 1, 'propose', offer()), null);
state.turnIndex = 1;
assert(act(1, 0, 'accept'), 'Hotseat replies must wait for private review');
state.phase = 'ALLIANCE_REVIEW';
assert.equal(act(1, 0, 'accept'), null);
state.reset();
assert.equal(state.resourceTrades.length, 0);
assert.equal(state.nextResourceTradeId, 1);
console.log('Resource exchange validation, atomic transfers, gifts, and lifecycle checks passed.');
