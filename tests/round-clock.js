// Run with: node tests/round-clock.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        elements.set(id, {
            style: {},
            classList: { toggle() {} },
            setAttribute(name, value) { this[name] = value; }
        });
    }
    return elements.get(id);
}
const state = {
    round: 1, turnIndex: 0, phase: 'TRANSITION', multiplayer: false,
    scores: [0, 0, 0, 0], objectives: [[], [], [], []]
};
const context = vm.createContext({
    gameState: state,
    document: { getElementById: element },
    roundTagEl: element('round-tag'),
    PLAYERS: [{ name: 'Red' }]
});
vm.runInContext(fs.readFileSync('js/status-ui.js', 'utf8'), context);
function render() {
    vm.runInContext('updateRoundDisplay()', context);
}

for (let round = 1; round <= 13; round++) {
    state.round = round;
    render();
    const progress = (round - 1) % 4;
    assert.equal(element('round-clock-hand').style.transform, `rotate(${(round - 1) * 90}deg)`);
    assert.equal(element('round-clock-status').innerText, `${progress} / 4`);
    assert.match(element('round-clock')['aria-label'], new RegExp(`production in ${4 - progress} rounds`));
    for (const phase of ['PLANNING', 'COMMITTED', 'RESOLVING', 'TRANSITION', 'GAME_OVER']) {
        state.phase = phase;
        state.multiplayer = phase === 'COMMITTED';
        render();
        assert.equal(element('round-clock-hand').style.transform, `rotate(${(round - 1) * 90}deg)`,
            'Phase changes and commitments do not advance the clock');
    }
}

state.round = 1;
render();
assert.equal(element('round-clock-hand').style.transform, 'rotate(0deg)', 'New games reset the clock');
state.round = 28;
state.multiplayer = true;
render();
assert.equal(element('round-clock-hand').style.transform, 'rotate(2430deg)', 'Snapshots restore round progress');
assert.equal(element('round-clock-status').innerText, '3 / 4');

const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
assert.match(html, /id="round-clock"[\s\S]*?id="btn-finish-plan"/);
assert.match(html, /class="plan-action-icon round-clock-face"/, 'Clock and commit icon share dimensions');
console.log('Round clock progression and lifecycle checks passed.');
