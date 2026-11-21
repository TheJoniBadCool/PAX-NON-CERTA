// Run with: node tests/resource-trade-ui.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function makeInput(side, resource, amount) {
    const available = {};
    const classes = new Set();
    return {
        dataset: { side, resource },
        valueAsNumber: amount,
        attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        parentElement: {
            querySelector() { return available; },
            classList: {
                toggle(name, enabled) { enabled ? classes.add(name) : classes.delete(name); }
            }
        },
        available,
        classes
    };
}

const give = makeInput('give', 'gold', 0);
const receive = makeInput('receive', 'gold', 0);
const elements = {
    'temporary-objectives-list': { addEventListener() {} },
    'resource-trade-target': { value: '1' },
    'resource-trade-title': {},
    'resource-trade-error': {},
    'resource-trade-amounts': {},
    'resource-trade-modal': { classList: { remove() {} } }
};
const document = {
    getElementById(id) { return elements[id]; },
    querySelectorAll() { return [give, receive]; }
};
const state = {
    turnIndex: 0, phase: 'PLANNING', multiplayer: false,
    showResourcesToOthers: true, resources: [{ gold: 3 }, { gold: 2 }]
};
const context = vm.createContext({
    document, gameState: state, PLAYERS: [{ name: 'Red' }, { name: 'Blue' }],
    RESOURCE_TYPES: [{ key: 'gold', label: 'Gold', icon: 'G' }],
    escapeHtml: value => value
});
vm.runInContext(fs.readFileSync('js/status-ui.js', 'utf8'), context);
const { show, update } = vm.runInContext(
    '({ show: showResourceTradeProposal, update: updateResourceTradeAvailability })', context);

show(1);
assert.match(elements['resource-trade-amounts'].innerHTML, /name="give-gold"/);
assert.match(elements['resource-trade-amounts'].innerHTML, /name="receive-gold"/);
assert.equal(give.available.textContent, '/3');
assert.equal(receive.available.textContent, '/2');
give.valueAsNumber = 4;
receive.valueAsNumber = 2;
update();
assert(give.classes.has('insufficient'));
assert.equal(give.attributes['aria-invalid'], 'true');
assert(!receive.classes.has('insufficient'), 'A balance equal to the amount is sufficient');
receive.valueAsNumber = 3;
update();
assert(receive.classes.has('insufficient'));
state.resources[0].gold = 5;
state.showResourcesToOthers = false;
update();
assert.equal(give.available.textContent, '/5');
assert(!give.classes.has('insufficient'), 'Changed stocks update the warning');
assert.equal(receive.available.textContent, '/?');
assert(!receive.classes.has('insufficient'), 'Private stocks must not leak through warnings');
assert.equal(receive.attributes['aria-invalid'], 'false');
state.showResourcesToOthers = true;
state.resources[1] = null;
update();
assert.equal(receive.available.textContent, '/?');
console.log('Resource exchange popup availability checks passed.');
