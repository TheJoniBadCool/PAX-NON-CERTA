// Run with: node tests/planning-timer.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set(['hidden']);
    return {
        handlers: {}, style: {}, value: '', checked: false, disabled: false,
        classList: {
            add(value) { classes.add(value); },
            remove(value) { classes.delete(value); },
            contains(value) { return classes.has(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
        },
        addEventListener(event, handler) { this.handlers[event] = handler; },
        querySelector() { return element(); },
        setAttribute() {},
        reportValidity() {
            return this.value !== '' && Number.isInteger(Number(this.value)) &&
                Number(this.value) >= 1 && Number(this.value) <= 86400;
        }
    };
}
const elements = new Map();
function getElement(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
}
getElement('board').parentElement = element();
let now = 100000;
let sequence = 0;
const timers = new Map();
const context = vm.createContext({
    console, Date: { now: () => now },
    document: { getElementById: getElement, querySelectorAll: () => [] },
    window: { addEventListener() {} },
    setTimeout(callback) { timers.set(++sequence, callback); return sequence; },
    clearTimeout(id) { timers.delete(id); },
    saveCustomSetup() {},
    bindBoardInteractions() {},
    Multiplayer: { isEditingSetup: () => false, isPendingCommit: () => false }
});
['constants', 'models', 'game-state', 'capital-rules', 'planning-timer', 'resource-purchases',
    'status-ui', 'game'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
vm.runInContext(`
    updatePlayerCards = () => {};
    renderBoard = () => {};
    let resolutions = 0;
    beginAllianceReview = () => { resolutions++; gameState.phase = 'RESOLVING'; };
    initBoard = () => {
        gameState.eliminated = gameState.activePlayers.map(active => !active);
        gameState.board = [];
    };
    initializeObjectives = () => {};
    renderCaptureChoices = () => {};
    renderRetreatTable = () => {};
    renderStartingPositionSelection = () => {};
    startingPositionPlayer = 0;
`, context);
const api = vm.runInContext(`({
    timer: PlanningTimer, state: gameState, canEditPlans, startNewGame,
    resolutions: () => resolutions
})`, context);
const state = api.state;
const timer = api.timer;
const enabled = getElement('planning-timer-enabled');
const duration = getElement('planning-time');
const unit = getElement('planning-time-unit');

assert.equal(state.planningTimeSeconds, 0, 'Timers default off');
assert.equal(timer.readSettings(), 0);
enabled.checked = true;
enabled.handlers.change();
assert.equal(duration.disabled, false);
for (const value of ['', '0', '-1', '1.5', 'not-a-number']) {
    duration.value = value;
    assert.equal(timer.readSettings(), null, `Invalid time ${value} blocks starting`);
}
duration.value = '2';
unit.value = 'minutes';
assert.equal(timer.readSettings(), 120);
unit.value = 'seconds';
assert.equal(timer.readSettings(), 2);
getElement('mp-planning-timer-enabled').checked = true;
getElement('mp-planning-time').value = '30';
getElement('mp-planning-time-unit').value = 'seconds';
assert.equal(timer.readSettings('mp-'), 30, 'The online lobby has independent timer settings');

state.planningTimeSeconds = 2;
api.startNewGame([true, false, true, false]);
assert.equal(state.planningDeadline, now + 2000, 'Starting a match starts the first planning timer');
assert.equal(getElement('planning-countdown').innerText, '0:02');
getElement('btn-clear-plan').handlers.click();
assert.equal(state.planningDeadline, now + 2000, 'Reset Plans never replenishes planning time');
state.plans[0] = [{ pieceId: 'queued' }];
now += 1999;
timer.refresh();
assert.equal(state.turnIndex, 0, 'No commitment occurs before the deadline');
assert.equal(api.canEditPlans(), true);
now++;
assert.equal(api.canEditPlans(), false, 'Editing stops at the deadline, even before the callback');
timer.refresh();
assert.equal(state.turnIndex, 2, 'Expiry skips inactive players and advances to the next player');
assert.equal(state.phase, 'TRANSITION');
assert.equal(state.plans[0][0].pieceId, 'queued', 'Queued plans are preserved');
assert.equal(state.planningDeadline, null, 'No time is spent during hotseat handoff');
assert.equal(timers.size, 0);
now += 100000;
timer.refresh();
assert.equal(state.turnIndex, 2);
getElement('btn-privacy-ready').handlers.click();
assert.equal(state.planningDeadline, now + 2000, 'Ready starts a fresh full limit');
getElement('btn-finish-plan').handlers.click();
assert.equal(api.resolutions(), 1, 'Manual commitment still works with an empty plan');
assert.equal(state.planningDeadline, null);
assert.equal(timers.size, 0, 'Manual commitment cancels the pending expiry callback');

api.startNewGame([true, true, false, false]);
now += 2000;
timer.refresh();
getElement('btn-privacy-ready').handlers.click();
now += 2000;
timer.refresh();
assert.equal(api.resolutions(), 2, 'The last player automatically commits an empty plan and resolves');
timer.refresh();
assert.equal(api.resolutions(), 2, 'Repeated callbacks do not commit twice');

api.startNewGame([true, true, false, false], null, 16, null, null, 'agreement');
assert.equal(state.planningDeadline, null, 'Province selection is untimed');
assert.equal(timers.size, 0, 'New games cancel previous timers');
state.planningTimeSeconds = 0;
api.startNewGame([true, true, false, false]);
assert.equal(state.planningDeadline, null);
assert.equal(timers.size, 0, 'Disabled timers leave existing untimed behavior unchanged');

console.log('Planning timer settings, hotseat expiry, handoff, and lifecycle checks passed.');

const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
assert.match(html, /id="round-clock-status"[^>]*>[^<]*<\/span>\s*<span id="planning-countdown"/,
    'The planning countdown sits directly below the round clock');
