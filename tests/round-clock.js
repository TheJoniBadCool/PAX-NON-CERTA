// Run with: node tests/round-clock.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        elements.set(id, {
            style: {},
            classList: { add() {}, toggle() {} },
            addEventListener() {},
            setAttribute(name, value) { this[name] = value; }
        });
    }
    return elements.get(id);
}
const state = {
    round: 1, turnIndex: 0, phase: 'TRANSITION', multiplayer: false,
    scores: [0, 0, 0, 0], objectives: [[], [], [], []], resourceProductionInterval: 4
};
const context = vm.createContext({
    gameState: state,
    getResourceProductionInterval: interval => Number(interval ?? state.resourceProductionInterval ?? 1),
    document: { getElementById: element },
    roundTagEl: element('round-tag'),
    PLAYERS: [{ name: 'Red' }]
});
vm.runInContext(fs.readFileSync('js/resource-purchases.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/status-ui.js', 'utf8'), context);
function render() {
    vm.runInContext('updateRoundDisplay()', context);
}

for (let round = 1; round <= 13; round++) {
    state.round = round;
    render();
    const progress = (round - 1) % 4 + 1;
    assert.equal(element('round-clock-hand').style.transform, `rotate(${round * 90}deg)`);
    assert.equal(element('round-clock-status').innerText, `${progress} / 4`);
    assert.match(element('round-clock')['aria-label'], new RegExp(`production in ${5 - progress} rounds?`));
    assert.match(element('round-clock')['aria-label'], new RegExp(`round ${progress} of 4 in the purchase cycle`));
    for (const phase of ['PLANNING', 'COMMITTED', 'RESOLVING', 'TRANSITION', 'GAME_OVER']) {
        state.phase = phase;
        state.multiplayer = phase === 'COMMITTED';
        render();
        assert.equal(element('round-clock-hand').style.transform, `rotate(${round * 90}deg)`,
            'Phase changes and commitments do not advance the clock');
    }
}

state.round = 1;
render();
assert.equal(element('round-clock-hand').style.transform, 'rotate(90deg)', 'New games reset the clock');
state.round = 28;
state.multiplayer = true;
render();
assert.equal(element('round-clock-hand').style.transform, 'rotate(2520deg)', 'Snapshots restore round progress');
assert.equal(element('round-clock-status').innerText, '4 / 4');

for (const interval of [1, 2, 4]) {
    state.resourceProductionInterval = interval;
    for (let round = 1; round <= 8; round++) {
        state.round = round;
        render();
        const progress = (round - 1) % 4 + 1;
        assert.equal(element('round-clock-status').innerText, `${progress} / 4`);
        assert.equal(element('round-clock-hand').style.transform, `rotate(${round * 90}deg)`,
            'The hand advances a quarter-turn even when resources are produced every round');
        assert.match(element('round-clock')['aria-label'],
            new RegExp(`production in ${interval - (round - 1) % interval} rounds?`));
        assert.match(element('round-clock')['aria-label'], /purchases on rounds 4, 8, 12/);
    }
}

const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
assert.match(html, /id="resource-production-interval"[\s\S]*?Every turn \(default\)/);
assert.match(html, /id="mp-resource-production-interval"[\s\S]*?Every turn \(default\)/);
assert.match(html, /id="round-clock"[\s\S]*?id="btn-finish-plan"/);
assert.match(html, /class="plan-action-icon round-clock-face"/, 'Clock and commit icon share dimensions');
assert.match(html, /id="round-clock-status">1 \/ 4/);
assert.match(html, /id="shopping-notice"[^>]*role="status"/);
console.log('Round clock progression and lifecycle checks passed.');
