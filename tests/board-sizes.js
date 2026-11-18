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
    isTowerPiece, getTowerGate, towersAreSpaced, rebelId: REBEL_PLAYER_ID, getPieceContents,
    createStartingBoard, getProvinceIndex
})`, context);

assert.deepEqual(Array.from(api.sizes), [12, 16]);
for (const size of [10, 14]) {
    assert.throws(() => api.initBoard(null, size), /Unsupported board size/);
}

for (const size of api.sizes) {
    api.state.activePlayers = [true, true, true, true];
    api.initBoard(null, size);
    assert.equal(api.state.boardSize, size);
    assert.equal(api.state.board.length, size);
    assert(api.state.board.every(row => row.length === size));
    assert.equal(api.state.board.flat().filter(Boolean).length, 28);
    assert(api.towersAreSpaced(api.state.board));
    const rebels = api.state.board.flat().filter(piece => piece && piece.player === api.rebelId);
    assert.equal(rebels.filter(api.isTowerPiece).length, 12);
    assert.equal(rebels.filter(piece => !api.isTowerPiece(piece)).length, 12);
    assert(rebels.filter(api.isTowerPiece).every(piece =>
        api.getPieceContents(piece).some(unit => unit.type === 'p')));
    for (let player = 0; player < 4; player++) {
        const [minRow, minColumn, maxRow, maxColumn] = api.getPlayerZone(player, size);
        const castles = api.state.board.flat().filter(piece => piece && piece.player === player + 1);
        assert.equal(castles.length, 1);
        const [row, column] = api.state.board.flatMap((line, r) =>
            line.map((entry, c) => entry === castles[0] ? [r, c] : null)).find(Boolean);
        assert(row >= minRow && row <= maxRow && column >= minColumn && column <= maxColumn);
        assert.equal(api.getPieceContents(castles[0]).length, 12);
        assert.equal(api.getPieceContents(castles[0]).filter(unit => unit.type === 'r').length, 2);
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

for (const size of api.sizes) {
    for (let mask = 1; mask < 16; mask++) {
        const players = Array.from({ length: 4 }, (_, index) => Boolean(mask & (1 << index)));
        const { board, biomes } = api.createStartingBoard(players, size, `province-pawns-${mask}`);
        const provinces = Array.from({ length: 16 }, () => []);
        const ids = [];
        board.forEach((row, r) => row.forEach((piece, c) => {
            if (!piece) return;
            provinces[api.getProvinceIndex(r, c, size)].push(piece);
            ids.push(piece.id, ...api.getPieceContents(piece).map(unit => unit.id));
            assert.notEqual(biomes[r][c], 'mountain', 'Starting units must not occupy mountains');
        }));
        assert.equal(new Set(ids).size, ids.length, 'Generated piece and unit IDs must be unique');
        for (const pieces of provinces) {
            const castles = pieces.filter(api.isTowerPiece);
            assert.equal(castles.length, 1, 'Each province must have exactly one castle');
            const outside = pieces.filter(piece => !api.isTowerPiece(piece));
            const rebelProvince = castles[0].player === api.rebelId;
            assert.equal(outside.length, rebelProvince ? 1 : 0,
                'Only non-player provinces must have exactly one outside pawn');
            if (rebelProvince) {
                assert.equal(api.getPieceContents(castles[0]).map(unit => unit.type).sort().join(''), 'pr',
                    'Rebel castles must retain their inside pawn');
                assert.equal(outside[0].player, api.rebelId);
                assert.equal(outside[0].type, 'p');
                assert.equal(api.getPieceContents(outside[0]).length, 1);
                assert.equal(api.getPieceContents(outside[0])[0].type, 'p');
            }
        }
    }
}

const smallSetup = Array.from({ length: 12 }, () => Array(12).fill(null));
for (let player = 1; player <= 2; player++) {
    for (const [index, type] of ['k', 'q', 'r'].entries()) {
        smallSetup[player - 1][index] = {
            id: `p${player}-${type}`, player, type,
            contents: [{ id: `p${player}-${type}-unit`, player, type }]
        };
    }
}
assert(api.isValidSavedSetup({ activePlayers: [true, true, false, false], board: smallSetup }));
for (const size of [10, 14]) {
    assert(!api.isValidSavedSetup({
        activePlayers: [true, true, false, false],
        board: Array.from({ length: size }, () => Array(size).fill(null))
    }), `${size}x${size} saved setups are no longer supported`);
}
assert(!api.isValidSavedSetup({
    activePlayers: [true, true, false, false],
    board: Array.from({ length: 11 }, () => Array(11).fill(null))
}));

console.log('Board size tests passed.');
