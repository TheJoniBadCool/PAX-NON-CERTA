// Run with: node tests/starting-position.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set();
    return {
        children: [], handlers: {}, style: {}, attributes: {}, disabled: false,
        set innerHTML(value) { this.children = []; },
        classList: {
            add(...values) { values.forEach(value => classes.add(value)); },
            contains(value) { return classes.has(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
        },
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, handler) { this.handlers[name] = handler; }
    };
}
const elements = new Map();
const document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    },
    createElement: element
};
let objectiveInitializations = 0;
const context = vm.createContext({
    console, document, randomLevel: () => 0, clearTimeout() {},
    initializeObjectives() { objectiveInitializations++; },
    updatePlayerCards() {}, renderBoard() {},
    renderProvinceResource() {}
});
['constants', 'models', 'game-state', 'planning-timer', 'setup-utils', 'board-utils',
    'capital-rules', 'board-setup', 'province-food', 'starting-position']
    .forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.gameState = vm.runInContext('new GameState()', context);
const api = vm.runInContext(`({
    state: gameState, createStartingBoard, initBoard, getProvinceIndex, getTowerGate, getPieceContents,
    chooseStartingProvince, confirmStartingProvince, applyStartingProvinces,
    allStartingProvincesConfirmed, renderStartingPositionSelection, finishStartingPositionSelection
})`, context);
const copy = value => JSON.parse(JSON.stringify(value));
const castleProvince = (board, player) => {
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board.length; c++) {
            if (board[r][c]?.player === player && board[r][c].type === 'r') {
                return api.getProvinceIndex(r, c, board.length);
            }
        }
    }
};

assert.equal(api.state.startingPosition, 'agreement');
assert.equal(api.state.startingArmy, 'default');
const defaultPlayers = [true, true, true, true];
const defaultPreview = api.createStartingBoard(defaultPlayers, 12, 'default-setup',
    null, 'zero', '16', 'tiered', true, null, 'agreement', 'default');
api.initBoard(null, 12, 'default-setup');
assert.deepEqual(copy(api.state.board), copy(defaultPreview.board));
assert.deepEqual(copy(api.state.provinceResources), copy(defaultPreview.provinceResources));
assert(api.state.board.flat().filter(Boolean).every(piece => piece.player === 5),
    'The default preview and game start in province selection with only rebels');
const defaultChances = api.state.provinceResources.map(resource => resource.productionChance);
assert.equal(defaultChances.filter(chance => chance === 100).length, 3);
assert.equal(defaultChances.filter(chance => chance === 50).length, 5);
assert.equal(defaultChances.filter(chance => chance === 20).length, 8);
api.state.reset();
api.state.planningTimeSeconds = 0;
for (const [preset, expected] of [
    ['default', { r: 1, b: 1, p: 2, n: 1, q: 1, k: 1 }],
    ['full', { r: 1, b: 2, p: 4, n: 2, q: 1, k: 1 }]
]) {
    const generated = api.createStartingBoard([true, false, false, false], 12,
        `starting-army-${preset}`, null, 'zero', '8', 'off', false, null, 'corner', preset);
    const castle = generated.board.flat().find(piece => piece?.player === 1);
    const counts = Object.fromEntries(api.getPieceContents(castle).map(unit => unit.type)
        .reduce((entries, type) => entries.set(type, (entries.get(type) || 0) + 1), new Map()));
    assert.deepEqual(counts, expected, `The ${preset} starting army must match its selected roster`);
}
for (const size of [12, 16]) {
    const randomProvinces = new Set();
    for (let mask = 1; mask < 16; mask++) {
        const players = Array.from({ length: 4 }, (_, index) => Boolean(mask & (1 << index)));
        const generate = mode => api.createStartingBoard(players, size, `positions-${mask}`,
            null, 'zero', '8', 'off', false, null, mode);
        const corner = generate('corner');
        players.forEach((active, index) => {
            if (active) assert.equal(castleProvince(corner.board, index + 1), [0, 3, 15, 12][index]);
        });
        const random = generate('random');
        assert.deepEqual(copy(generate('random')), copy(random), 'Random starts must reproduce their preview');
        const claimed = players.flatMap((active, index) => active
            ? [castleProvince(random.board, index + 1)] : []);
        claimed.forEach(province => randomProvinces.add(province));
        assert.equal(new Set(claimed).size, claimed.length, 'Random provinces must be distinct');
        for (let province = 0; province < 16; province++) {
            const pieces = random.board.flatMap((row, r) => row.filter((piece, c) =>
                piece && api.getProvinceIndex(r, c, size) === province));
            const playerProvince = claimed.includes(province);
            assert.equal(pieces.length, playerProvince ? 1 : 2);
            if (playerProvince) assert.equal(pieces[0].contents.length, 7);
            else assert(pieces.every(piece => piece.player === 5));
        }
        random.board.forEach((row, r) => row.forEach((piece, c) => {
            if (piece) assert.notEqual(random.biomes[r][c], 'mountain');
            if (piece?.type === 'r') {
                const [dr, dc] = api.getTowerGate(piece);
                assert.notEqual(random.biomes[r + dr][c + dc], 'mountain');
            }
        }));
    }
    assert(randomProvinces.size > 4, 'Random mode must use more than the four corners');
    for (const mode of ['8', '12', '16']) {
        for (const balance of ['off', 'allow-empty', 'require-all', 'all-100', 'tiered']) {
            const map = api.createStartingBoard([true, true, true, true], size, 'balanced-starts',
                null, 'zero', mode, balance, false, null, 'random');
            assert(map.provinceResources);
        }
    }

    api.state.activePlayers = [true, false, true, true];
    api.state.startingPosition = 'agreement';
    api.initBoard(null, size, 'agreement');
    api.state.phase = 'STARTING_POSITION';
    api.state.startingProvinces = [null, null, null, null];
    api.state.startingConfirmed = [false, false, false, false];
    assert(api.state.board.flat().filter(Boolean).every(piece => piece.player === 5));
    const neutral = copy(api.state.board);
    const biomes = copy(api.state.biomes);
    const resources = copy(api.state.provinceResources);
    assert(api.chooseStartingProvince(1, 0), 'Inactive players cannot choose');
    for (const province of [-1, 16, 0.1, '1', undefined]) {
        assert(api.chooseStartingProvince(0, province), 'Invalid provinces must be rejected');
    }
    assert(api.confirmStartingProvince(0), 'Cannot confirm without a province');
    assert.equal(api.chooseStartingProvince(0, 5), '');
    assert(api.chooseStartingProvince(2, 5), 'A claimed province cannot be chosen');
    assert.equal(api.chooseStartingProvince(0, null), '');
    assert.equal(api.chooseStartingProvince(2, 5), '');
    assert.equal(api.chooseStartingProvince(0, 6), '');
    assert.equal(api.chooseStartingProvince(3, 10), '');
    assert.throws(() => api.applyStartingProvinces(), /confirm/);
    api.renderStartingPositionSelection();
    const board = document.getElementById('starting-position-board');
    assert.equal(board.children.length, size * size);
    assert.equal(document.getElementById('btn-confirm-starting-position').disabled, false);
    // Hotseat's selected player is P1; click their province to deselect it.
    const square = board.children.find(child =>
        child.attributes['aria-label'].includes('Province 7 ·'));
    assert(square);
    square.handlers.click();
    assert.equal(api.state.startingProvinces[0], null);
    assert(document.getElementById('btn-confirm-starting-position').disabled);
    api.chooseStartingProvince(0, 6);
    api.confirmStartingProvince(0);
    assert(api.chooseStartingProvince(0, null), 'Confirmed provinces are locked');
    assert(!api.allStartingProvincesConfirmed());
    const before = objectiveInitializations;
    document.getElementById('btn-confirm-starting-position').handlers.click();
    assert.equal(api.state.phase, 'PLANNING');
    assert.equal(objectiveInitializations, before + 1);
    assert(document.getElementById('starting-position-modal').classList.contains('hidden'));
    assert.deepEqual(copy(api.state.biomes), biomes, 'Choices must not change terrain');
    assert.deepEqual(copy(api.state.provinceResources), resources, 'Choices must not change resources');
    for (const [index, province] of [[0, 6], [2, 5], [3, 10]]) {
        assert.equal(castleProvince(api.state.board, index + 1), province);
    }
    api.state.board.forEach((row, r) => row.forEach((piece, c) => {
        if ([5, 6, 10].includes(api.getProvinceIndex(r, c, size))) {
            if (piece) {
                assert.equal(piece.contents.length, 7);
                assert.equal(piece.contents.filter(unit => unit.type === 'r').length, 1);
                assert.deepEqual(copy(api.getTowerGate(piece)), copy(api.getTowerGate(neutral[r][c])));
            }
        } else assert.deepEqual(copy(piece), neutral[r][c], 'Unchosen rebels stay unchanged');
    }));
    assert(api.chooseStartingProvince(0, 7), 'Selection messages are rejected after setup');
}
api.state.activePlayers = [true, false, false, false];
api.state.startingPosition = 'agreement';
api.state.startingArmy = 'full';
api.initBoard(null, 12, 'agreement-full-army');
api.state.phase = 'STARTING_POSITION';
api.state.startingProvinces = [null, null, null, null];
api.state.startingConfirmed = [false, false, false, false];
assert.equal(api.chooseStartingProvince(0, 0), '');
assert.equal(api.confirmStartingProvince(0), '');
api.applyStartingProvinces();
const fullAgreementCastle = api.state.board.flat().find(piece => piece?.player === 1);
assert.equal(fullAgreementCastle.contents.length, 11,
    "Gentleman's Agreement must apply the selected full roster");
assert.equal(fullAgreementCastle.contents.filter(unit => unit.type === 'r').length, 1);
console.log('Starting position generation, selection and hotseat checks passed.');
