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
    console, document, randomLevel: () => 0,
    initializeObjectives() { objectiveInitializations++; },
    updatePlayerCards() {}, renderBoard() {},
    renderProvinceResource() {}
});
['constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'board-setup', 'starting-position']
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

assert.equal(api.state.startingPosition, 'corner');
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
            if (playerProvince) assert.equal(pieces[0].contents.length, 12);
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
        for (const balance of ['off', 'allow-empty', 'require-all']) {
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
                assert.equal(piece.contents.length, 12);
                assert.equal(piece.contents.filter(unit => unit.type === 'r').length, 2);
                assert.deepEqual(copy(api.getTowerGate(piece)), copy(api.getTowerGate(neutral[r][c])));
            }
        } else assert.deepEqual(copy(piece), neutral[r][c], 'Unchosen rebels stay unchanged');
    }));
    assert(api.chooseStartingProvince(0, 7), 'Selection messages are rejected after setup');
}
console.log('Starting position generation, selection and hotseat checks passed.');
