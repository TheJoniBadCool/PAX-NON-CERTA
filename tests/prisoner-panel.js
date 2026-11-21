// Run with: node tests/prisoner-panel.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
const context = vm.createContext({
    document: {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, { innerHTML: '', addEventListener() {} });
            return elements.get(id);
        }
    }
});
['constants', 'models', 'game-state', 'setup-utils', 'status-ui'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createUnit, renderRetreatTable })`, context);
const { state } = api;
const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
for (let player = 1; player <= 4; player++) {
    assert.match(html, new RegExp(
        `id="dead-p${player}"[^>]*></div>\\s*<div id="prisoners-p${player}" class="prisoners-row" aria-label="Prisoners held by [^"]+"></div>`
    ), 'Each prisoner row must follow its dead-pieces row');
}
const captive = (id, origin, owner, type = 'p') => ({
    ...api.createUnit(owner, type, id, id), originalPlayer: origin, prisonerOf: owner
});
const blue = captive('Blue <pawn>', 2, 1);
const green = captive('Green queen', 3, 1, 'q');
const red = captive('Red king', 1, 2, 'k');
state.board = [
    [{ id: 'red-army', player: 1, contents: [blue, api.createUnit(1, 'p', 'fighter')] },
        [{ id: 'blue-army', player: 2, contents: [red] }, { id: 'ally', player: 3, contents: [] }]]
];
state.retreating[0] = [{ player: 1, contents: [green], reentryRound: 4 }];
state.captureRecipient = { player: 1, contents: [blue, captive('Yellow horse', 4, 1, 'n')] };
api.renderRetreatTable();
const row = player => elements.get(`prisoners-p${player}`).innerHTML;
assert.match(row(1), /prisoners-flag.*<svg/);
assert.match(row(1), /prisoner-unit piece-p2.*Blue &lt;pawn&gt;/);
assert.match(row(1), /prisoner-unit piece-p3.*Green queen/);
assert.match(row(1), /prisoner-unit piece-p4.*Yellow horse/);
assert.equal((row(1).match(/class="prisoner-unit /g) || []).length, 3,
    'A temporary capture recipient must not duplicate units also on the board');
assert.match(row(2), /prisoner-unit piece-p1.*Red king/);
assert.match(row(3), /retreat-empty/);
assert.match(row(4), /retreat-empty/);

state.board = [[null]];
state.retreating[0] = [];
state.captureRecipient = null;
state.deadPieces[1].push(blue);
api.renderRetreatTable();
assert.match(row(1), /retreat-empty/, 'Released and executed prisoners no longer appear');
assert.match(row(2), /retreat-empty/, 'Removing an army refreshes its captor’s panel');
assert.match(elements.get('dead-p2').innerHTML, /Blue &lt;pawn&gt;/);
console.log('Prisoner panel checks passed.');
