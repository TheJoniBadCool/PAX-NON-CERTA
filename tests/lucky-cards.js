// Run with: node tests/lucky-cards.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
const actions = [];
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
    console, Math: math, logAction(action) { actions.push(action); }, renderRetreatTable() {},
    coordsToNotation() { return 'test'; }, isPubliclyVisiblePiece() { return true; },
    document: {
        createElement: element,
        getElementById(id) { return elements.get(id) || null; }
    }
});
elements.set('temporary-objectives-list', element());
elements.set('resource-purchases-p1', element());
[
    'constants', 'models', 'game-state', 'diplomacy-rules', 'setup-utils', 'board-utils', 'capital-rules',
    'resource-purchases', 'movement-rules', 'planning-rules', 'retreat-rules', 'prisoner-rules', 'siege-rules',
    'status-ui', 'province-food'
].forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.renderRetreatTable = () => {};
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createUnit, refreshResourceTotals, getUnitResourceStore,
       purchaseResourceAction, useLuckyCard, canUseLuckyCards, isPlayerImmobilized,
       canMoveWholePiece, canMoveHeldUnit, getValidMovesForPiece, queueHeldGroupPlan,
       getForceMarchTargets, markForceMarchPlan,
       getReadySiegeAssault, isValidSallyOutPlan, registerSiegeStarts,
       processRetreatsAtRoundStart, renderLuckyCards, LUCKY_CARD_TYPES, REBEL_PLAYER_ID })`, context);
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
const otherPlayer = piece(4, 'q', 8, 8, 29);
state.diplomacy.find(pair => pair.players.includes(0) && pair.players.includes(2)).status = 'allied';
const retreatingQueen = api.createUnit(2, 'q', 'retreating-queen');
retreatingQueen.resourceStockpile = { gold: 31, wood: 4 };
state.retreating[1] = [{ player: 2, contents: [retreatingQueen], reentryRound: 100 }];
api.refreshResourceTotals();

const draws = [0, 0.4, 0.4, 0.2];
math.random = () => draws.shift();
assert(api.purchaseResourceAction(1, 'lucky'));
assert(api.purchaseResourceAction(1, 'lucky'));
assert(api.purchaseResourceAction(1, 'lucky'));
assert(api.purchaseResourceAction(1, 'lucky'));
math.random = () => 0.999999;
assert.deepEqual(Array.from(state.luckyCards[0], card => card.type),
    ['steal', 'immobilize', 'immobilize', 'burglar']);
assert.equal(new Set(state.luckyCards[0].map(card => card.id)).size, 4);
assert.equal(state.resources[0].gold, 6, 'Every card costs resources, including duplicate draws');
const [taxes, stop, secondStop, burglar] = state.luckyCards[0];
state.round = 11;
assert.equal(state.luckyCards[0].length, 4, 'Cards have no expiration');
assert.equal(api.useLuckyCard(1, taxes.id, '__proto__'), 'Choose a valid resource type.');
assert(api.useLuckyCard(2, taxes.id, 'gold'), 'Another player cannot use the hand');
state.phase = 'RESOLVING';
assert(api.useLuckyCard(1, taxes.id, 'gold'), 'Battle/resolution use is unavailable');
state.phase = 'PLANNING';
state.multiplayer = true;
state.committed[0] = true;
assert(api.useLuckyCard(1, taxes.id, 'gold'), 'Committed players must unlock');
state.committed[0] = false;
state.multiplayer = false;
assert.equal(api.useLuckyCard(1, taxes.id, 'gold'), null);
assert.match(actions.at(-1), /used General Taxes/);
assert.equal(state.resources[0].gold, 6 + 17 + 23 + 29 + 31);
assert.equal(enemy.contents[0].resourceStockpile.gold, 0);
assert.equal(ally.contents[0].resourceStockpile.gold, 0, 'Allies are robbed too');
assert.equal(retreatingQueen.resourceStockpile.gold, 0, 'Retreating resource stores are robbed');
assert.equal(retreatingQueen.resourceStockpile.wood, 4, 'Other resources are untouched');
assert.equal(state.resources[0].wood, 6);
assert(api.useLuckyCard(1, taxes.id, 'gold'), 'Used cards cannot be replayed');

for (const target of [0, 1, 5, '2', null, 2.5]) {
    assert(api.useLuckyCard(1, burglar.id, target), `Invalid burglar target ${target}`);
}
state.activePlayers[1] = false;
assert(api.useLuckyCard(1, burglar.id, 2), 'Inactive players cannot be targeted');
state.activePlayers[1] = true;
state.eliminated[1] = true;
assert(api.useLuckyCard(1, burglar.id, 2), 'Eliminated players cannot be targeted');
state.eliminated[1] = false;
state.luckyCards[0].push({ id: 'burglar-ally', type: 'burglar' });
assert.equal(api.useLuckyCard(1, 'burglar-ally', 3), null, 'Allies may be targeted');
for (const key of ['wood', 'food', 'horse', 'metal', 'stone']) {
    assert.equal(ally.contents[0].resourceStockpile[key], 0, `Allied ${key} is stolen`);
}
assert.equal(api.useLuckyCard(1, burglar.id, 2), null);
assert.match(actions.at(-1), /Resources Burglar.*Player 2/);
for (const key of ['gold', 'wood', 'food', 'horse', 'metal', 'stone']) {
    assert.equal(enemy.contents[0].resourceStockpile[key], 0, `All Player 2 ${key} is stolen`);
    assert.equal(retreatingQueen.resourceStockpile[key] || 0, 0, `Retreating Player 2 ${key} is stolen`);
    assert.equal(otherPlayer.contents[0].resourceStockpile[key], key === 'gold' ? 0 : 10,
        `Resources Burglar leaves other players' ${key} untouched`);
}
assert.equal(state.resources[0].gold, 6 + 17 + 23 + 29 + 31);
assert.equal(state.resources[0].wood, 30, 'All stolen resources are transferred to the player');
assert.equal(state.resources[0].food, 26);
assert.equal(state.resources[0].horse, 26);
assert.equal(state.resources[0].metal, 26);
assert.equal(state.resources[0].stone, 30);

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
state.luckyCards[0].push({ id: 'burglar-no-holder', type: 'burglar' });
state.board[0][0] = null;
assert(api.useLuckyCard(1, 'burglar-no-holder', 2), 'A missing receiving holder rejects the card');
assert(state.luckyCards[0].some(card => card.id === 'burglar-no-holder'),
    'A failed Resources Burglar use does not consume the card');
assert(api.useLuckyCard(1, 'no-holder', 'gold'));
assert(state.luckyCards[0].some(card => card.id === 'no-holder'), 'Failed use never consumes a card');
state.board[0][0] = owner;
state.luckyCards[0].push(
    { id: 'stop-ui', type: 'immobilize' },
    { id: 'burglar-ui', type: 'burglar' },
    { id: 'harvest-ui', type: 'harvest' },
    { id: 'sabotage-ui', type: 'sabotage' }
);
api.renderLuckyCards(1, true);
const panel = elements.get('lucky-cards-p1');
assert.equal(elements.get('resource-purchases-p1').previous, panel, 'Hand icon is immediately left of the cart');
const html = panel.querySelector('.lucky-card-options').innerHTML;
assert(html.indexOf('data-purchase="lucky"') < html.indexOf('data-lucky-select='), 'Buy-more is the first icon');
assert.match(html, /data-lucky-help/);
assert.match(html, /class="lucky-card-catalog hidden"/);
assert.match(html, /General Taxes/);
assert.match(html, /Resources Burglar/);
assert.match(html, /Stop Sign/);
assert.match(html, /Force March/);
assert.match(html, /Good Harvest Season/);
assert.match(html, /Sabotage Grain Storages/);
assert.match(html, /Refill all provinces/);
assert.match(html, /title="General Taxes: Choose a resource type/);
assert.match(html, /title="Resources Burglar: Choose another active player/);
assert.equal(html.split(api.LUCKY_CARD_TYPES.steal.icon).length - 1, 2,
    'General Taxes artwork appears in both the catalog and the hand');
assert.equal(html.split(api.LUCKY_CARD_TYPES.burglar.icon).length - 1, 3,
    'Resources Burglar artwork appears in the catalog and both cards in the hand');
assert.match(html, /title="Stop Sign: Choose another player/);
assert.match(html, /data-lucky-target="gold"/);
assert.match(html, /data-lucky-target="2"/);
assert.match(html, /data-lucky-target="3"/);
assert.match(html, /data-lucky-select="burglar-ui".*data-lucky-target="2"/);
assert.doesNotMatch(html, /data-lucky-target="1"/);
panel.open = true;
api.renderLuckyCards(1, false);
assert.equal(panel.open, false, 'Privacy handoffs close the hand');
assert.equal(panel.querySelector('.lucky-card-options').innerHTML, '', 'Hidden hands clear card markup');

state.provinceFood = Array(16).fill(null);
state.provinceFoodOwners = Array(16).fill(null);
piece(2, 'r', 0, 8);
context.reconcileProvinceFood();
for (const province of [0, 1]) state.provinceFood[province] = 1;
assert.equal(state.provinceFoodOwners[1], 2, 'The second province belongs to another player');
assert.equal(api.useLuckyCard(1, 'harvest-ui'), null);
assert.equal(state.provinceFood[0], 6, 'Harvest refills the player-owned province');
assert.equal(state.provinceFood[1], 1, 'Harvest leaves another player’s province unchanged');
assert.equal(state.provinceFood[3], null, 'Unowned provinces have no meter to refill');
assert.match(actions.at(-1), /Good Harvest Season/);
state.provinceFood[1] = 4;
state.provinceFood[2] = 2;
state.luckyCards[0].push(
    { id: 'sabotage-effect', type: 'sabotage' },
    { id: 'sabotage-rebellion', type: 'sabotage' }
);
api.renderLuckyCards(1, true);
const sabotageTargets = panel.querySelector('.lucky-card-options').innerHTML;
assert.match(sabotageTargets, /data-lucky-target="1"/);
assert.match(sabotageTargets, /data-lucky-target="2"/);
assert.doesNotMatch(sabotageTargets, /data-lucky-target="0"/);
assert.match(api.useLuckyCard(1, 'sabotage-effect', 0), /another active player/);
assert.match(api.useLuckyCard(1, 'sabotage-effect', '1'), /another active player/);
assert.match(api.useLuckyCard(1, 'sabotage-effect', 3), /another active player/);
state.activePlayers[1] = false;
assert.match(api.useLuckyCard(1, 'sabotage-effect', 1), /another active player/);
state.activePlayers[1] = true;
assert.equal(api.useLuckyCard(1, 'sabotage-effect', 1), null);
assert.equal(state.provinceFood[1], 2, 'Sabotage removes exactly two food steps');
assert(state.luckyCards[0].some(card => card.id === 'sabotage-rebellion'));
assert.equal(api.useLuckyCard(1, 'sabotage-rebellion', 2), null);
assert.equal(state.provinceFood[2], null, 'Zero food immediately triggers a rebellion');
assert.equal(state.board[0][8].player, api.REBEL_PLAYER_ID, 'The sabotaged province becomes rebel-owned');
assert.match(actions.at(-1), /Province 3 rebelled/);

state.round = 12;
state.turnIndex = 0;
state.phase = 'PLANNING';
const marcher = piece(1, 'p', 1, 1);
const captive = api.createUnit(1, 'q', 'captured-queen');
captive.prisonerOf = 1;
captive.originalPlayer = 2;
const prisonerStack = {
    id: 'prisoner-stack', player: 1, type: 'q', contents: [captive]
};
state.board[2][1] = prisonerStack;
state.luckyCards[0].push(
    { id: 'force-pawn', type: 'force-march' },
    { id: 'force-prisoner', type: 'force-march' }
);
assert(api.getForceMarchTargets(1).some(target => target.piece.id === marcher.id));
assert(api.getForceMarchTargets(1).some(target => target.piece.id === prisonerStack.id));
assert.equal(api.useLuckyCard(1, 'force-pawn', marcher.id), null);
assert(api.canMoveWholePiece(marcher), 'Force March allows a Pawn stack to move on an even round');
assert(api.getValidMovesForPiece(1, 1).length > 0, 'Force March exposes ordinary legal moves');
const forcedMove = { pieceId: marcher.id, from: [1, 1], to: [1, 2] };
assert(api.markForceMarchPlan(marcher, forcedMove, state.plans[0]));
assert.equal(forcedMove.forceMarch, true);
state.plans[0].push(forcedMove);
assert(api.canMoveWholePiece(marcher), 'A queued Force March move retains its marker');
state.plans[0] = [];
assert(!api.canMoveWholePiece(marcher), 'Reset Plans spends the one-move allowance');
assert.equal(api.markForceMarchPlan(marcher, {}, state.plans[0]), false);
assert.equal(api.useLuckyCard(1, 'force-prisoner', prisonerStack.id), null);
assert(api.canMoveWholePiece(prisonerStack), 'Force March also allows a prisoner stack to move');
state.round = 13;
state.luckyCards[0].push({ id: 'force-odd', type: 'force-march' });
assert.match(api.useLuckyCard(1, 'force-odd', marcher.id), /even-numbered round/);
assert(state.luckyCards[0].some(card => card.id === 'force-odd'), 'An invalid use does not consume the card');
state.reset();
assert(state.luckyCards.every(hand => hand.length === 0));
assert(state.immobilizedUntilRound.every(round => round === 0));
assert(state.forceMarch.every(tokens => tokens.length === 0));
assert.equal(state.nextLuckyCardId, 1);
console.log('Lucky Card purchases, effects, duration, restrictions, and hand UI checks passed.');
