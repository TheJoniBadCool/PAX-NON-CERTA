// Run with: node tests/board-sizes.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const context = vm.createContext({
    console,
    randomLevel() { return 0; }
});
['constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'movement-rules', 'board-setup']
    .forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.gameState = vm.runInContext('new GameState()', context);

const api = vm.runInContext(`({
    state: gameState, sizes: BOARD_SIZES, initBoard, getPlayerZone,
    getAdjacentMoves, coordsToNotation, isValidSavedSetup, createEmptySetupBoard,
    isTowerPiece, getTowerGate, towersAreSpaced
})`, context);

for (const size of api.sizes) {
    api.state.activePlayers = [true, true, true, true];
    api.initBoard(null, size);
    assert.equal(api.state.boardSize, size);
    assert.equal(api.state.board.length, size);
    assert(api.state.board.every(row => row.length === size));
    assert.equal(api.state.board.flat().filter(Boolean).length, 8);
    assert(api.towersAreSpaced(api.state.board));
    for (let player = 0; player < 4; player++) {
        const [minRow, minColumn, maxRow, maxColumn] = api.getPlayerZone(player, size);
        const castles = api.state.board.flat().filter(piece => piece && piece.player === player + 1);
        assert.equal(castles.length, 2);
        assert(castles.every(piece => {
            const [row, column] = api.state.board.flatMap((line, r) =>
                line.map((entry, c) => entry === piece ? [r, c] : null)).find(Boolean);
            return row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn;
        }));
    }
    api.state.board.forEach((row, r) => row.forEach((piece, c) => {
        if (!api.isTowerPiece(piece)) return;
        const [dr, dc] = api.getTowerGate(piece);
        assert(r + dr >= 0 && r + dr < size && c + dc >= 0 && c + dc < size);
    }));
    assert.equal(api.createEmptySetupBoard(size).length, size);
    assert.equal(api.getAdjacentMoves(0, 0).length, 3);
    assert.equal(api.getAdjacentMoves(size - 1, size - 1).length, 3);
    assert.equal(api.coordsToNotation(size - 1, size - 1), `${String.fromCharCode(64 + size)}1`);
}

const smallSetup = Array.from({ length: 10 }, () => Array(10).fill(null));
for (let player = 1; player <= 2; player++) {
    for (const [index, type] of ['k', 'q', 'r'].entries()) {
        smallSetup[player - 1][index] = {
            id: `p${player}-${type}`, player, type,
            contents: [{ id: `p${player}-${type}-unit`, player, type }]
        };
    }
}
assert(api.isValidSavedSetup({ activePlayers: [true, true, false, false], board: smallSetup }));
assert(!api.isValidSavedSetup({
    activePlayers: [true, true, false, false],
    board: Array.from({ length: 11 }, () => Array(11).fill(null))
}));

console.log('Board size tests passed.');
