// Run with: node tests/capitals.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set(['hidden']);
    return {
        className: '',
        innerHTML: '',
        innerText: '',
        style: {},
        addEventListener() {},
        classList: {
            add(value) { classes.add(value); },
            remove(value) { classes.delete(value); },
            contains(value) { return classes.has(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
        },
        querySelector() { return element(); }
    };
}
const elements = new Map();
const context = vm.createContext({
    console,
    document: {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        }
    }
});
['constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'capital-rules', 'resource-purchases', 'status-ui'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, initializeCapitals, reconcileCapitals, isCapitalTower, createUnit,
       updatePlayerCards })`, context);
const { state } = api;
context.renderPlayerDiplomacy = () => {};
context.updateRoundDisplay = () => {};
context.activePlayerNameEl = element();
const tower = (player, id) => ({
    id: `${id}-piece`,
    player,
    type: 'r',
    contents: [api.createUnit(player, 'r', id)]
});

state.activePlayers = [true, true, false, true];
state.board = [
    [tower(1, 'red-first'), tower(1, 'red-second')],
    [tower(2, 'blue-capital'), null]
];
api.initializeCapitals(() => 0.99);
assert.equal(state.capitalTowerIds[0], 'red-second', 'Custom setups randomly choose a starting capital');
assert.equal(state.capitalTowerIds[1], 'blue-capital');
assert.equal(state.capitalTowerIds[2], null);
assert.equal(state.horde[2], false, 'Inactive players are not treated as hordes');
assert.equal(state.horde[3], true, 'An active player with no tower starts as a horde');
assert(api.isCapitalTower(state.board[0][1]));
assert(!api.isCapitalTower(state.board[0][0]));

state.board[0][1].player = 2;
api.reconcileCapitals(() => 0);
assert.equal(state.capitalTowerIds[0], 'red-first',
    'Losing the capital selects a remaining owned tower');
assert.equal(state.horde[0], false);
assert.equal(state.capitalTowerIds[1], 'blue-capital',
    'A player keeps their existing capital when acquiring another tower');

state.board[0][0].player = 2;
api.reconcileCapitals(() => 0);
assert.equal(state.capitalTowerIds[0], null);
assert.equal(state.horde[0], true, 'A player with no owned towers becomes a horde');

state.board[1][1] = tower(1, 'red-conquered');
api.reconcileCapitals(() => 0);
assert.equal(state.capitalTowerIds[0], 'red-conquered',
    'A horde automatically establishes a capital when it gains a tower');
assert.equal(state.horde[0], false);

state.activePlayers = [true, true, false, false];
state.horde = [true, false, false, false];
api.updatePlayerCards();
assert(!elements.get('horde-p1').classList.contains('hidden'),
    'Hordes must be displayed in the player panel');
assert.match(fs.readFileSync('PaxNonCerta.html', 'utf8'),
    /id="horde-p1" class="horde-badge hidden" role="status">🐪 Horde/,
    'The player panel must identify horde status with a nomad icon');
assert(elements.get('horde-p2').classList.contains('hidden'),
    'Players with towers must not display the horde marker');

state.phase = 'PLANNING';
state.turnIndex = 0;
api.updatePlayerCards();
assert(elements.get('badge-p1').classList.contains('hidden'), 'Hotseat planning badge occupies no space');
assert(elements.get('badge-p2').classList.contains('hidden'), 'Hotseat hidden badge occupies no space');
state.eliminated[1] = true;
api.updatePlayerCards();
assert(!elements.get('badge-p2').classList.contains('hidden'), 'Elimination remains visible');
assert.equal(elements.get('badge-p2').innerText, 'ELIMINATED');
state.eliminated[1] = false;
state.multiplayer = true;
context.Multiplayer = {
    getBadge: i => i === 0
        ? { text: '', ready: false, hidden: true }
        : { text: 'Locked in ✔', ready: true },
    isPendingCommit: () => false,
    refreshControls() {}
};
api.updatePlayerCards();
assert(elements.get('badge-p1').classList.contains('hidden'), 'Online planning badge occupies no space');
assert(!elements.get('badge-p2').classList.contains('hidden'), 'Online locked status remains visible');
assert.equal(elements.get('badge-p2').innerText, 'Locked in ✔');
state.multiplayer = false;
api.updatePlayerCards();
assert(elements.get('badge-p2').classList.contains('hidden'), 'Badges hide again when status changes');

console.log('Capital and horde checks passed');
