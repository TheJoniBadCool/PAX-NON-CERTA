// Run with: node tests/lucky-cards.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
function element() {
    const classes = new Set();
    const children = new Map();
    return {
        innerHTML: '', open: false, attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener() {},
        classList: {
            toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); },
            contains(name) { return classes.has(name); }
        },
        querySelector(selector) {
            if (!children.has(selector)) children.set(selector, element());
            return children.get(selector);
        },
        before(node) { this.previous = node; elements.set(node.id, node); }
    };
}
const math = Object.create(Math);
const context = vm.createContext({
    console, Math: math, logAction() {}, renderRetreatTable() {},
    coordsToNotation() { return 'test'; }, isPubliclyVisiblePiece() { return true; },
    document: {
        createElement: element,
        getElementById(id) { return elements.get(id) || null; }
    }
});
elements.set('temporary-objectives-list', element());
elements.set('resource-purchases-p1', element());
[
    'constants', 'models', 'game-state', 'diplomacy-rules', 'setup-utils', 'board-utils',
    'resource-purchases', 'movement-rules', 'planning-rules', 'retreat-rules', 'siege-rules', 'status-ui'
].forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.renderRetreatTable = () => {};
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createUnit, refreshResourceTotals, getUnitResourceStore,
       purchaseResourceAction, useLuckyCard, canUseLuckyCards, isPlayerImmobilized,
       canMoveWholePiece, canMoveHeldUnit, getValidMovesForPiece, queueHeldGroupPlan,
       getReadySiegeAssault, isValidSallyOutPlan, registerSiegeStarts,
       processRetreatsAtRoundStart, renderLuckyCards })`, context);
const { state } = api;
state.boardSize = 12;
state.board = Array.from({ length: 12 }, () => Array(12).fill(null));
state.biomes = Array.from({ length: 12 }, () => Array(12).fill('plains'));
state.round = 4;
function piece(player, type, row, column, gold = 0) {
    const unit = api.createUnit(player, type, `unit-${player}-${row}-${column}`);
    unit.resourceStockpile = { gold, wood: 10, food: 10, horse: 10, metal: 10, stone: 10 };
    const result = { id: unit.id, player, type, contents: [unit] };
    state.board[row][column] = result;
    return result;
}
const owner = piece(1, 'r', 0, 0, 10);
state.capitalTowerIds[0] = owner.contents[0].id;
const enemy = piece(2, 'r', 0, 4, 17);
const ally = piece(3, 'k', 4, 4, 23);
piece(4, 'q', 8, 8, 29);
state.diplomacy.find(pair => pair.players.includes(0) && pair.players.includes(2)).status = 'allied';
const retreatingQueen = api.createUnit(2, 'q', 'retreating-queen');
retreatingQueen.resourceStockpile = { gold: 31, wood: 4 };
state.retreating[1] = [{ player: 2, contents: [retreatingQueen], reentryRound: 100 }];
api.refreshResourceTotals();

math.random = () => 0;
assert(api.purchaseResourceAction(1, 'lucky'));
math.random = () => 0.999999;
assert(api.purchaseResourceAction(1, 'lucky'));
assert(api.purchaseResourceAction(1, 'lucky'));
assert.deepEqual(Array.from(state.luckyCards[0], card => card.type), ['steal', 'immobilize', 'immobilize']);
assert.equal(new Set(state.luckyCards[0].map(card => card.id)).size, 3);
assert.equal(state.resources[0].gold, 7, 'Every card costs resources, including duplicate draws');
const [burglar, stop, secondStop] = state.luckyCards[0];
state.round = 11;
assert.equal(state.luckyCards[0].length, 3, 'Cards have no expiration');
assert.equal(api.useLuckyCard(1, burglar.id, '__proto__'), 'Choose a valid resource type.');
assert(api.useLuckyCard(2, burglar.id, 'gold'), 'Another player cannot use the hand');
state.phase = 'RESOLVING';
assert(api.useLuckyCard(1, burglar.id, 'gold'), 'Battle/resolution use is unavailable');
state.phase = 'PLANNING';
state.multiplayer = true;
state.committed[0] = true;
assert(api.useLuckyCard(1, burglar.id, 'gold'), 'Committed players must unlock');
state.committed[0] = false;
state.multiplayer = false;
assert.equal(api.useLuckyCard(1, burglar.id, 'gold'), null);
assert.equal(state.resources[0].gold, 7 + 17 + 23 + 29 + 31);
assert.equal(enemy.contents[0].resourceStockpile.gold, 0);
assert.equal(ally.contents[0].resourceStockpile.gold, 0, 'Allies are robbed too');
assert.equal(retreatingQueen.resourceStockpile.gold, 0, 'Retreating resource stores are robbed');
assert.equal(retreatingQueen.resourceStockpile.wood, 4, 'Other resources are untouched');
assert.equal(state.resources[0].wood, 7);
assert(api.useLuckyCard(1, burglar.id, 'gold'), 'Used cards cannot be replayed');

const mover = piece(2, 'n', 1, 4);
const selection = { unitIds: [mover.contents[0].id], from: [1, 4] };
state.plans[1] = [
    { pieceId: mover.id, from: [1, 4], to: [2, 4] },
    { isUnmerge: true }, { sallyOut: true }, { siegeAssault: true },
    { prisonerAction: 'release' }, { siegeCancel: true }
];
state.committed[1] = true;
for (const target of [0, 1, 5, '2', null, 2.5]) {
    assert(api.useLuckyCard(1, stop.id, target), `Invalid stop target ${target}`);
}
state.eliminated[1] = true;
assert(api.useLuckyCard(1, stop.id, 2));
state.eliminated[1] = false;
assert.equal(api.useLuckyCard(1, stop.id, 2), null);
assert.equal(state.immobilizedUntilRound[1], 12);
assert.equal(state.committed[1], true, 'Using Stop Sign does not unlock another player');
assert.equal(state.plans[1].length, 2, 'Queued movement, splits, and attacks are removed even if committed');
assert(state.plans[1][0].prisonerAction);
assert(state.plans[1][1].siegeCancel);
state.turnIndex = 1;
assert(api.canUseLuckyCards(2), 'Immobilized players can still play cards');
assert(!api.canMoveWholePiece(mover));
assert(!api.canMoveHeldUnit(mover.contents[0]));
assert.equal(api.getValidMovesForPiece(1, 4).length, 0);
assert.equal(api.queueHeldGroupPlan(mover, selection, [2, 4], null), false);
const siegeMove = { player: 2, pieceId: mover.id, from: [1, 4], to: [0, 0] };
api.registerSiegeStarts([siegeMove]);
assert.equal(siegeMove.invalid, true, 'Immobilization cannot use the even-round siege exception');
assert.equal(api.getReadySiegeAssault(mover, [1, 4], [0, 4]), null);
assert.equal(api.isValidSallyOutPlan(enemy, [0, 4], [0, 4], 2, 'siege'), false);

const returned = api.createUnit(2, 'p', 'returned-pawn');
state.retreating[1] = [{
    id: 'return', player: 2, contents: [returned], reentryRound: 11,
    battleSquare: [5, 5], released: true
}];
api.processRetreatsAtRoundStart();
assert.equal(state.retreating[1].length, 1, 'Ready retreats stay queued during immobilization');
state.round = 12;
assert(api.isPlayerImmobilized(2), 'The second round remains blocked');
api.processRetreatsAtRoundStart();
assert.equal(state.retreating[1].length, 1);
state.round = 13;
assert(!api.isPlayerImmobilized(2), 'Immobilization ends after exactly two rounds');
assert(api.canMoveWholePiece(mover));
api.processRetreatsAtRoundStart();
assert.equal(state.retreating[1].length, 0, 'Re-entry resumes without losing the waiting army');
assert(state.board.flat().some(entry => entry?.id === 'return'));

state.turnIndex = 0;
assert.equal(api.useLuckyCard(1, secondStop.id, 2), null);
assert.equal(state.immobilizedUntilRound[1], 14, 'Reapplication uses the current round');
state.luckyCards[0].push({ id: 'repeat', type: 'immobilize' }, { id: 'no-holder', type: 'steal' });
assert.equal(api.useLuckyCard(1, 'repeat', 2), null);
assert.equal(state.immobilizedUntilRound[1], 14, 'Repeated cards refresh rather than stack duration');
state.board[0][0] = null;
assert(api.useLuckyCard(1, 'no-holder', 'gold'));
assert(state.luckyCards[0].some(card => card.id === 'no-holder'), 'Failed use never consumes a card');
state.board[0][0] = owner;
state.luckyCards[0].push({ id: 'stop-ui', type: 'immobilize' });
api.renderLuckyCards(1, true);
const panel = elements.get('lucky-cards-p1');
assert.equal(elements.get('resource-purchases-p1').previous, panel, 'Hand icon is immediately left of the cart');
const html = panel.querySelector('.lucky-card-options').innerHTML;
assert(html.indexOf('data-purchase="lucky"') < html.indexOf('data-lucky-select='), 'Buy-more is the first icon');
assert.match(html, /title="Resource burglar: Choose a resource type/);
assert.match(html, /title="Stop Sign: Choose another player/);
assert.match(html, /data-lucky-target="gold"/);
assert.match(html, /data-lucky-target="2"/);
assert.doesNotMatch(html, /data-lucky-target="1"/);
panel.open = true;
api.renderLuckyCards(1, false);
assert.equal(panel.open, false, 'Privacy handoffs close the hand');
assert.equal(panel.querySelector('.lucky-card-options').innerHTML, '', 'Hidden hands clear card markup');
state.reset();
assert(state.luckyCards.every(hand => hand.length === 0));
assert(state.immobilizedUntilRound.every(round => round === 0));
assert.equal(state.nextLuckyCardId, 1);
console.log('Lucky Card purchases, effects, duration, restrictions, and hand UI checks passed.');
