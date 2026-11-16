// Run with: node tests/provinces.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const node = {
        children: [], className: '', title: '', innerText: '',
        style: { setProperty(name, value) { this[name] = value; } },
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { this[name] = value; },
        set innerHTML(value) { this.children = []; this.html = value; }
    };
    node.classList = {
        add(name) { node.className += ` ${name}`; }
    };
    return node;
}

const boardEl = element();
boardEl.parentElement = element();
const context = vm.createContext({
    console, document: { createElement: element }, boardEl,
    randomLevel: () => 0, isPawnRestTurn: () => false,
    getPendingHeldIndices: () => new Set(),
    renderPlanArrows() {}, renderRetreatTable() {}
});
['constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'board-setup', 'board-renderer']
    .forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, getProvinceOwners, getProvinceIndex, createStartingBoard,
       renderBoard, renderMapPreview, createUnit, isTowerPiece, rebelId: REBEL_PLAYER_ID })`, context);
const { state } = api;
const tint = square => square.className.match(/\bzone-p(\d)\b/)?.[1] || null;

function checkRendering(expectedOwners) {
    const before = JSON.stringify(state.board);
    api.renderBoard();
    const preview = element();
    api.renderMapPreview(preview, { board: state.board, biomes: state.biomes }, state.boardSize);
    assert.equal(boardEl.children.length, state.boardSize ** 2);
    assert.equal(preview.children.length, state.boardSize ** 2);
    for (let r = 0; r < state.boardSize; r++) {
        for (let c = 0; c < state.boardSize; c++) {
            const province = api.getProvinceIndex(r, c, state.boardSize);
            const expected = expectedOwners[province] ? String(expectedOwners[province]) : null;
            const index = r * state.boardSize + c;
            assert.equal(tint(boardEl.children[index]), expected, `Board tint at ${r},${c}`);
            assert.equal(tint(preview.children[index]), expected, `Preview tint at ${r},${c}`);
        }
    }
    assert.equal(JSON.stringify(state.board), before, 'Rendering must not mutate castle ownership');
}

for (const size of [10, 12, 14, 16]) {
    state.boardSize = size;
    const starting = api.createStartingBoard([true, false, true, false], size, 'province-test');
    Object.assign(state, starting);
    const expected = Array(16).fill(null);
    expected[0] = 1;
    expected[15] = 3;
    assert.deepEqual(Array.from(api.getProvinceOwners(state.board)), expected);
    checkRendering(expected);

    for (let pr = 0; pr < 4; pr++) {
        for (let pc = 0; pc < 4; pc++) {
            for (let r = Math.floor(pr * size / 4); r < Math.floor((pr + 1) * size / 4); r++) {
                for (let c = Math.floor(pc * size / 4); c < Math.floor((pc + 1) * size / 4); c++) {
                    assert.equal(api.getProvinceIndex(r, c, size), pr * 4 + pc,
                        'Ownership must follow the same floor-based province boundaries as generation');
                }
            }
        }
    }
    for (let boundary = 1; boundary < 4; boundary++) {
        assert.equal(boardEl.parentElement.style[`--province-boundary-${boundary}`],
            `${Math.floor(boundary * size / 4) / size * 100}%`,
            'Province lines must align with the tinted squares on every board size');
    }

    const castle = state.board.flatMap((row, r) =>
        row.map((piece, c) => piece && api.isTowerPiece(piece) &&
            api.getProvinceIndex(r, c, size) === 1 ? piece : null)).find(Boolean);
    assert.equal(castle.player, api.rebelId);
    castle.player = 2;
    castle.contents.forEach(unit => { unit.player = 2; });
    expected[1] = 2;
    checkRendering(expected);

    castle.player = 4;
    castle.contents.forEach(unit => { unit.player = 4; });
    expected[1] = 4;
    state.board = JSON.parse(JSON.stringify(state.board));
    checkRendering(expected);

    const home = state.board.flat().find(piece => piece?.player === 1 && api.isTowerPiece(piece));
    home.player = 3;
    home.contents.forEach(unit => { unit.player = 3; });
    expected[0] = 3;
    checkRendering(expected);
}

state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
const expected = Array(16).fill(null);
const castle = (player, id) => ({
    id, player, type: 'r', contents: [api.createUnit(player, 'r', `${id}-tower`)]
});
checkRendering(expected);
state.board[4][4] = castle(1, 'red');
state.board[7][7] = castle(2, 'blue');
checkRendering(expected);
state.board[7][7].player = 1;
expected[5] = 1;
checkRendering(expected);
state.board[4][7] = castle(api.rebelId, 'rebel');
expected[5] = null;
checkRendering(expected);
state.board[4][7] = null;
expected[5] = 1;
checkRendering(expected);
state.board[5][5] = {
    id: 'enemy-pawn', player: 2, type: 'p', contents: [api.createUnit(2, 'p', 'pawn')]
};
checkRendering(expected);
state.board[4][4] = null;
state.board[7][7] = null;
expected[5] = null;
checkRendering(expected);

const styles = fs.readFileSync('styles.css', 'utf8');
for (let player = 1; player <= 4; player++) {
    const rule = styles.match(new RegExp(`\\.zone-p${player}\\s*\\{([^}]+)\\}`))[1];
    assert(!rule.includes('!important'), 'Province tint must not override selection highlights');
}
console.log('Province ownership and rendering checks passed');
