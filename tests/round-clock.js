// Run with: node tests/round-clock.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
const slices = Array.from({ length: 12 }, () => ({
    filled: false,
    classList: {
        toggle(name, value) {
            assert.equal(name, 'filled');
            this.owner.filled = value;
        }
    }
}));
for (const slice of slices) slice.classList.owner = slice;
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
    document: {
        getElementById: element,
        querySelectorAll(selector) {
            assert.equal(selector, '#round-clock-slices .round-clock-slice');
            return slices;
        }
    },
    roundTagEl: element('round-tag'),
    PLAYERS: [{ name: 'Red' }]
});
vm.runInContext(fs.readFileSync('js/resource-purchases.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/mission-rules.js', 'utf8'), context);
vm.runInContext(fs.readFileSync('js/status-ui.js', 'utf8'), context);
function render() {
    vm.runInContext('updateRoundDisplay()', context);
}
function assertFilledSlices(progress, message) {
    assert.deepEqual(slices.map(slice => slice.filled),
        slices.map((_, index) => index < progress), message);
}

for (let round = 1; round <= 49; round++) {
    state.round = round;
    render();
    const progress = (round - 1) % 12 + 1;
    assertFilledSlices(progress);
    assert.equal(element('round-clock-status').innerText, `${progress} / 12`);
    assert.match(element('round-clock')['aria-label'], new RegExp(`production in ${4 - (round - 1) % 4} rounds?`));
    assert.match(element('round-clock')['aria-label'], new RegExp(`round ${progress} of 12 in the temporary objective cycle`));
    for (const phase of ['PLANNING', 'COMMITTED', 'RESOLVING', 'TRANSITION', 'GAME_OVER']) {
        state.phase = phase;
        state.multiplayer = phase === 'COMMITTED';
        render();
        assertFilledSlices(progress,
            'Phase changes and commitments do not advance the clock');
    }
}

state.round = 1;
render();
assertFilledSlices(1, 'New games reset the clock');
state.round = 28;
state.multiplayer = true;
render();
assertFilledSlices(4, 'Snapshots restore round progress');
assert.equal(element('round-clock-status').innerText, '4 / 12');

for (const interval of [1, 2, 4]) {
    state.resourceProductionInterval = interval;
    for (let round = 1; round <= 8; round++) {
        state.round = round;
        render();
        const progress = (round - 1) % 12 + 1;
        assert.equal(element('round-clock-status').innerText, `${progress} / 12`);
        assertFilledSlices(progress, 'The clock advances even when resources are produced every round');
        assert.match(element('round-clock')['aria-label'],
            new RegExp(`production in ${interval - (round - 1) % interval} rounds?`));
        assert.match(element('round-clock')['aria-label'], /purchases available every round during planning/);
        assert.match(element('round-clock')['aria-label'], /province food decreases after rounds 4, 8, and 12/);
        assert.match(element('round-clock')['aria-label'], /new temporary objectives at the end of each cycle/);
    }
}

const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
assert.match(html, /id="resource-production-interval"[\s\S]*?Every turn \(default\)/);
assert.match(html, /id="mp-resource-production-interval"[\s\S]*?Every turn \(default\)/);
assert.match(html, /id="round-clock"[\s\S]*?id="btn-finish-plan"/);
const clockFace = html.match(/<svg class="plan-action-icon round-clock-face"[\s\S]*?<\/svg>/)[0];
assert.match(clockFace, /viewBox="0 0 100 100"/);
assert.match(clockFace, /id="round-clock-slice-shape" d="M50 50 L50 8 A42 42/,
    'The wheel has a 42-unit radius');
assert.doesNotMatch(clockFace, /🛒/, 'The clock does not mark obsolete purchase rounds');
assert.equal((clockFace.match(/📜/g) || []).length, 1, 'The completed cycle has a scroll');
const clockSlices = [...clockFace.matchAll(/<use href="#round-clock-slice-shape" class="([^"]+)"(?: transform="rotate\((\d+) 50 50\)")?><\/use>/g)];
assert.equal(clockSlices.length, 12, 'The clock has 12 slices');
assert.deepEqual(clockSlices.map((slice, index) => Number(slice[2] || 0)),
    Array.from({ length: 12 }, (_, index) => index * 30), 'Slices cover the whole clock clockwise');
assert.equal(clockSlices.filter(slice => slice[1].includes('filled')).length, 1, 'The initial round has one filled slice');
const foodMarkers = [...clockFace.matchAll(/<use href="#round-clock-food-decrease" x="([^"]+)" y="([^"]+)" width="9" height="9"><\/use>/g)];
assert.equal(foodMarkers.length, 3, 'The clock has three food decrease markers');
function sliceAt(x, y) {
    x -= 50;
    y -= 50;
    const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360;
    return Math.floor(angle / 30) + 1;
}
const markerSlices = foodMarkers.map(marker => sliceAt(Number(marker[1]) + 4.5, Number(marker[2]) + 4.5));
assert.deepEqual(markerSlices, [4, 8, 12], 'Food decreases are marked inside slices 4, 8, and 12');
const scroll = clockFace.match(/<text x="([^"]+)" y="([^"]+)">📜<\/text>/);
assert(scroll, 'The objective cycle has a scroll marker');
assert.equal(sliceAt(Number(scroll[1]), Number(scroll[2])), 12, 'The scroll is inside slice 12');
assert(Math.hypot(Number(scroll[1]) - 50, Number(scroll[2]) - 50) < 42,
    'The scroll is inside the wheel');
assert(Math.hypot(Number(scroll[1]) - (Number(foodMarkers[2][1]) + 4.5),
    Number(scroll[2]) - (Number(foodMarkers[2][2]) + 4.5)) >= 10,
    'The scroll and food marker do not overlap');
assert.match(clockFace, /id="round-clock-food-decrease"[\s\S]*?d="M25 5v9m-4-4 4 4 4-4"/,
    'Food markers show a downward arrow');
assert.match(html, /aria-label="Round clock:[^"]*province food decreases after rounds 4, 8, and 12/);
assert.doesNotMatch(clockFace, /round-clock-hand/);
assert.match(html, /id="round-clock-status">1 \/ 12/);
assert.doesNotMatch(html, /id="shopping-notice"/);
const css = fs.readFileSync('styles.css', 'utf8');
assert.match(html, /<\/svg>\s*<\/div>\s*<div class="plan-controls">\s*<span id="round-clock-status"[\s\S]*?<span id="planning-countdown"[\s\S]*?<button id="btn-finish-plan"[\s\S]*?<button id="btn-clear-plan"/);
for (const [id, label] of [['btn-finish-plan', 'Commit Plans'], ['btn-clear-plan', 'Reset Plans']]) {
    const button = html.match(new RegExp(`<button id="${id}"[^>]*>[\\s\\S]*?<\\/button>`))[0];
    assert.match(button, new RegExp(`aria-label="${label}"`));
    assert.match(button, new RegExp(`title="${label}"`));
    assert.doesNotMatch(button, new RegExp(`>${label}<`), 'Plan buttons have no visible text label');
}
assert.match(css, /\.plan-actions\s*\{[^}]*display:\s*grid;[^}]*width:\s*13rem;[^}]*aspect-ratio:\s*1\.15;[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(css, /\.plan-controls\s*\{[^}]*display:\s*contents/);
assert.match(css, /\.plan-actions > \.round-clock\s*\{[^}]*grid-area:\s*1\s*\/\s*1\s*\/\s*4\s*\/\s*-1;[^}]*position:\s*relative/);
assert.match(css, /\.round-clock-face\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0;[^}]*width:\s*100%;[^}]*height:\s*100%/);
assert.match(css, /#planning-countdown\s*\{[^}]*font-size:\s*1\.25rem/);
for (const [id, row, column] of [
    ['round-clock-status', 1, 1], ['planning-countdown', 1, 2],
    ['btn-finish-plan', 3, 1], ['btn-clear-plan', 3, 2]
]) {
    assert.match(css, new RegExp(`#${id}\\s*\\{[^}]*grid-area:\\s*${row}\\s*\\/\\s*${column};`));
}
assert.match(css, /\.plan-commit \.plan-action-icon,\s*\.plan-reset \.plan-action-icon\s*\{[^}]*width:\s*1\.75rem;[^}]*height:\s*1\.75rem/);
assert.match(css, /\.board-top-controls\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
assert.match(css, /\.plan-actions\s*\{[^}]*width:\s*min\(100%,\s*13rem\)/);
console.log('Round clock progression and lifecycle checks passed.');
