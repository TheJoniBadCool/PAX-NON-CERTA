// Run with: node tests/fog-of-war.js
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
    node.classList = { add(name) { node.className += ` ${name}`; } };
    return node;
}

const boardEl = element();
boardEl.parentElement = element();
const logs = [];
const context = vm.createContext({
    console, document: { createElement: element }, boardEl,
    logAction(message) { logs.push(message); },
    renderPlanArrows() {}, renderRetreatTable() {}
});
['constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'movement-rules',
    'planning-rules', 'resource-purchases', 'siege-rules', 'retreat-rules', 'prisoner-rules',
    'capital-rules', 'board-renderer']
    .forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, getFogVisibility, getVisiblePiece, getVisibleMovements,
       isPubliclyVisiblePiece, getPlanArrowKind, getValidMovesForPiece,
       renderBoard, createUnit, resolvePrisonerPlans, processRetreatsAtRoundStart,
       registerSiegeStarts, applySiegeRoundProgress, getUnitResourceStore,
       refreshResourceTotals, coordsToNotation, rebelId: REBEL_PLAYER_ID })`, context);
const { state } = api;
const piece = (player, ...types) => ({
    id: `${player}-${types.join('')}`, player, type: types.includes('r') ? 'r' : types[0],
    contents: types.map((type, index) => {
        const unit = api.createUnit(player, type, `${player}-${type}-${index}`);
        if (type === 'r') unit.gate = [0, -1];
        return unit;
    })
});
function reset(size = 16) {
    state.reset();
    state.boardSize = size;
    state.fogSight = 'medium';
    state.activePlayers = [true, true, false, false];
    state.eliminated = [false, false, true, true];
    state.board = Array.from({ length: size }, () => Array(size).fill(null));
    state.biomes = Array.from({ length: size }, () => Array(size).fill('plains'));
    logs.length = 0;
}

for (const size of [12, 16]) {
    reset(size);
    state.board[0][0] = piece(1, 'r');
    let visibility = api.getFogVisibility(1);
    const boundary = Math.floor(size / 2);
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        assert.equal(visibility[r][c], r < boundary && c < boundary,
            `${size}: own and all eight neighboring provinces, without chained sight`);
    }
    state.board[0][0].player = 2;
    assert.equal(api.getFogVisibility(1).flat().some(Boolean), false,
        'Losing a castle immediately removes its province sight');
    state.board[0][0].player = 1;
    const far = size - 1;
    state.board[far][far] = piece(1, 'r');
    visibility = api.getFogVisibility(1);
    assert.equal(visibility[far][far], true, 'A conquered province immediately grants sight');
    assert.equal(visibility[boundary][boundary], true, 'Conquered provinces reveal their neighbors');
    state.board[far][far - 1] = piece(2, 'r');
    visibility = api.getFogVisibility(1);
    assert.equal(visibility[boundary][boundary], false,
        'Contested provinces grant no ownership sight');
    assert.equal(visibility[far][far - 1], true,
        'Local piece sight still applies in a contested province');
}

for (const size of [12, 16]) {
    const provinceSize = size / 4;
    for (const [provinceRow, provinceColumn] of [[0, 0], [1, 1], [3, 3]]) {
        reset(size);
        state.fogSight = 'small';
        const row = provinceRow * provinceSize;
        const column = provinceColumn * provinceSize;
        state.board[row + 1][column + 1] = piece(1, 'r');
        const visibility = api.getFogVisibility(1);
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
            assert.equal(visibility[r][c],
                r >= row - 2 && r < row + provinceSize + 2 &&
                c >= column - 2 && c < column + provinceSize + 2,
                `${size}: small sight extends two squares from owned province ${provinceRow},${provinceColumn}`);
        }
        state.board[row + 1][column + 1].player = 2;
        assert.equal(api.getFogVisibility(1).flat().some(Boolean), false,
            'Small province sight is lost immediately after conquest');
    }
}

reset();
state.fogSight = 'small';
state.board[5][5] = piece(1, 'r');
state.board[13][13] = piece(1, 'r');
let smallVisibility = api.getFogVisibility(1);
assert(smallVisibility[2][2] && smallVisibility[15][15] && !smallVisibility[2][13],
    'Small sight combines multiple owned provinces without chaining through neighbors');
state.board[4][4] = piece(2, 'r');
smallVisibility = api.getFogVisibility(1);
assert(!smallVisibility[2][2] && smallVisibility[15][15],
    'A contested province no longer grants Small province sight');
state.phase = 'RESOLVING';
state.board[4][4] = null;
state.board[5][5].player = 2;
assert(api.getFogVisibility()[2][2], 'Hotseat resolution combines Small sight from active players');
state.multiplayer = true;
assert(!api.getFogVisibility()[2][2], 'Multiplayer resolution retains only the local Small sight');

reset();
state.fogSight = 'large';
state.board[1][1] = piece(1, 'r');
assert(api.getFogVisibility(1)[7][7] && !api.getFogVisibility(1)[8][8],
    'Large retains full neighboring-province sight without chaining');

reset();
state.board[6][6] = piece(1, 'n');
for (const radius of [1, 2]) {
    if (radius === 2) state.board[6][6].contents.push(api.createUnit(1, 'b', 'bishop'));
    const visibility = api.getFogVisibility(1);
    for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
        assert.equal(visibility[r][c], Math.max(Math.abs(r - 6), Math.abs(c - 6)) <= radius,
            `Local sight must be exactly ${(radius * 2 + 1)}x${(radius * 2 + 1)}`);
    }
}
state.board[6][6].contents[1].prisonerOf = 1;
assert.equal(api.getFogVisibility(1)[8][8], false, 'A captive Bishop cannot provide scouting');
state.board[6][6] = null;
state.board[0][0] = piece(1, 'b');
assert.equal(api.getFogVisibility(1).flat().filter(Boolean).length, 9,
    'Bishop sight is clipped at board edges');
state.board[0][0] = null;
state.board[15][15] = piece(1, 'n');
assert.equal(api.getFogVisibility(1).flat().filter(Boolean).length, 4,
    'Ordinary sight is clipped at board edges');

for (const sight of ['small', 'medium', 'large']) {
    for (const [type, radius] of [['n', sight === 'large' ? 2 : 1],
        ['b', sight === 'large' ? 3 : 2]]) {
        reset();
        state.fogSight = sight;
        state.board[6][6] = piece(1, type);
        const visibility = api.getFogVisibility(1);
        for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
            assert.equal(visibility[r][c], Math.max(Math.abs(r - 6), Math.abs(c - 6)) <= radius,
                `${sight} ${type} sight has radius ${radius}`);
        }
    }
}
state.board[6][6].contents[0].prisonerOf = 1;
assert.equal(api.getFogVisibility(1)[9][9], false, 'A captive Bishop cannot provide large sight');
state.board[6][6] = null;
state.board[0][0] = piece(1, 'b');
assert.equal(api.getFogVisibility(1).flat().filter(Boolean).length, 16,
    'Large Bishop sight is clipped at board edges');

reset();
state.board[6][6] = piece(1, 'b');
state.board[8][8] = piece(2, 'q');
assert.equal(api.getVisiblePiece(8, 8, 1), state.board[8][8]);
state.biomes[8][8] = 'forest';
assert.equal(api.getVisiblePiece(8, 8, 1), null, 'Bishop sight never overrides forest hiding');
assert.equal(api.getVisiblePiece(8, 8, 2), state.board[8][8], 'Own forest pieces remain visible');
state.board[8][8] = piece(api.rebelId, 'p');
assert.equal(api.getVisiblePiece(8, 8, 1), state.board[8][8],
    'The existing rebel exception to forest hiding is preserved inside sight');
state.board[9][9] = piece(api.rebelId, 'p');
assert.equal(api.getVisiblePiece(9, 9, 1), null, 'Rebel troops outside sight are hidden');
state.biomes[8][8] = 'plains';
state.board[8][8] = piece(2, 'p');
state.plans[0] = [{ player: 1, from: [6, 6], to: [7, 7] }];
assert.equal(api.getVisiblePiece(9, 9, 1), null, 'Queued movement does not grant sight');
state.board[7][7] = state.board[6][6];
state.board[6][6] = null;
assert.equal(api.getVisiblePiece(9, 9, 1), state.board[9][9], 'Resolved movement updates sight');
state.board[7][7] = null;
assert.equal(api.getVisiblePiece(8, 8, 1), null, 'Sight is lost when the scout disappears');

reset();
state.board[0][0] = piece(1, 'r');
state.board[15][15] = piece(2, 'r', 'p', 'b', 'q');
const garrison = state.board[15][15];
Object.assign(garrison.contents[1], { routedStacks: 1, routedUntilRound: 4 });
Object.assign(garrison.contents[3], { prisonerOf: 2, originalPlayer: 1 });
let visible = api.getVisiblePiece(15, 15, 1);
assert.equal(visible.type, 'r');
assert.equal(visible.contents.length, 1, 'A fogged castle exposes only its Tower units');
assert.equal(garrison.contents.length, 4, 'Projection must not mutate the actual garrison');
api.renderBoard();
const castleSquare = boardEl.children[255];
assert.match(castleSquare.className, /\bsq-fog\b/);
assert.match(castleSquare.title, /Fog of war/);
assert(castleSquare.children.some(child => child.className === 'tower-gate tower-gate-west'));
for (const badge of ['held-count', 'routed-recovery-badge', 'prisoner-board-badge', 'pawn-rest-badge']) {
    assert(!castleSquare.children.some(child => child.className === badge),
        `A hidden garrison must not leak its ${badge}`);
}
assert(!JSON.stringify(castleSquare).includes(garrison.contents[1].id),
    'Hidden garrison names must not enter the DOM');
state.board[14][14] = piece(1, 'n');
assert.equal(api.getVisiblePiece(15, 15, 1), garrison, 'A scouted castle reveals its garrison');
state.biomes[15][15] = 'forest';
assert.equal(api.getVisiblePiece(15, 15, 1).contents.length, 1,
    'Forest concealment hides the garrison even when the castle is scouted');
state.phase = 'GAME_OVER';
assert.equal(api.getVisiblePiece(15, 15, 1), garrison);
api.renderBoard();
assert(boardEl.children.every(square => !square.className.includes('sq-fog')),
    'Game over removes all fog shading');

reset();
state.board[0][0] = piece(1, 'r');
state.board[15][15] = piece(2, 'r');
state.board[14][13] = piece(2, 'n');
assert.equal(api.getVisiblePiece(14, 13), null);
state.turnIndex = 1;
assert.equal(api.getVisiblePiece(14, 13), state.board[14][13], 'Hotseat switches sight with the player');
state.turnIndex = 0;
state.phase = 'RESOLVING';
assert.equal(api.getVisiblePiece(14, 13), state.board[14][13],
    'Hotseat resolution combines active players fog sight');
assert.equal(api.getVisiblePiece(14, 13, 1), null, 'Explicit viewer requests remain private');
state.multiplayer = true;
assert.equal(api.getVisiblePiece(14, 13), null, 'Multiplayer resolution never combines sight');
state.phase = 'COMMITTED';
assert.equal(api.getVisiblePiece(14, 13), null, 'Committing does not reveal other players');
state.turnIndex = 1;
assert.equal(api.getVisiblePiece(14, 13), state.board[14][13], 'Guest seat uses its own sight');
state.turnIndex = 0;
state.multiplayer = false;
state.phase = 'RESOLVING';
state.eliminated[1] = true;
assert.equal(api.getVisiblePiece(14, 13), null, 'Eliminated players do not add combined sight');

reset();
state.board[5][5] = piece(1, 'n');
state.board[6][6] = piece(2, 'n');
const movement = { player: 2, from: [6, 6], to: [7, 7], pieceType: 'n',
    contents: state.board[6][6].contents };
assert.equal(api.getVisibleMovements([movement], 1).length, 0,
    'Animation cannot reveal a hidden destination');
state.board[5][5] = null;
state.board[8][8] = piece(1, 'n');
assert.equal(api.getVisibleMovements([movement], 1).length, 0,
    'Animation cannot reveal a hidden source');
state.board[5][5] = piece(1, 'b');
assert.equal(api.getVisibleMovements([movement], 1).length, 1);
state.biomes[6][6] = 'forest';
assert.equal(api.getVisibleMovements([movement], 1).length, 0, 'Forest animation hiding is preserved');
assert.equal(api.getVisibleMovements([movement], 2).length, 1, 'Own forest movement is visible');
state.biomes[6][6] = 'plains';
assert.equal(api.getVisibleMovements([{ ...movement, invalid: true }], 1).length, 0);
assert.equal(api.getVisibleMovements([{ ...movement, siegeStart: true }], 1).length, 0);
const plan = { player: 1, from: [5, 5], to: [6, 6] };
assert.equal(api.getPlanArrowKind(plan, [plan]), 'red');
state.biomes[6][6] = 'forest';
assert.equal(api.getPlanArrowKind(plan, [plan]), 'green', 'Arrows do not leak forest defenders');
assert(api.getValidMovesForPiece(5, 5).some(([r, c]) => r === 6 && c === 6),
    'Concealment must not block ordinary movement into a hidden force');

reset();
state.board[0][0] = piece(1, 'r');
state.board[15][15] = piece(2, 'n');
assert.equal(api.isPubliclyVisiblePiece(state.board[15][15], [[15, 15]]), false,
    'The shared log cannot expose a position hidden from any active player');
state.board[14][14] = piece(1, 'n');
assert.equal(api.isPubliclyVisiblePiece(state.board[15][15], [[15, 15]]), true);
state.biomes[15][15] = 'forest';
assert.equal(api.isPubliclyVisiblePiece(state.board[15][15], [[15, 15]]), false);

reset();
const captor = piece(2, 'n', 'q');
Object.assign(captor.contents[1], { prisonerOf: 2, originalPlayer: 1 });
state.board[15][15] = captor;
state.plans[1] = [{
    pieceId: captor.id, from: [15, 15], to: [15, 15],
    prisonerAction: 'release', unitId: captor.contents[1].id
}];
assert.equal(api.resolvePrisonerPlans(), 1);
assert(logs.at(-1).includes('in fog of war'));
assert(!logs.at(-1).includes(api.coordsToNotation(15, 15)));
state.round = 4;
api.processRetreatsAtRoundStart();
assert(logs.at(-1).includes('in fog of war'), 'Hidden re-entry coordinates stay out of public logs');

reset();
state.board[0][0] = piece(1, 'n');
state.board[0][1] = piece(2, 'r');
state.board[12][12] = piece(api.rebelId, 'r', 'p');
state.board[12][11] = piece(2, 'p');
Object.assign(api.getUnitResourceStore(state.board[0][1].contents[0], true), { food: 2, wood: 2 });
api.refreshResourceTotals();
api.registerSiegeStarts([{
    player: 2, pieceId: state.board[12][11].id, from: [12, 11], to: [12, 12]
}]);
assert.equal(state.sieges.length, 1, 'Fog does not prevent authoritative siege deployment');
assert(logs.at(-1).includes('out of sight'));
assert(!logs.at(-1).includes(api.coordsToNotation(12, 12)),
    'A siege announcement must not reveal a hidden attacker through its Tower gate');
api.renderBoard();
const siegeMarks = () => boardEl.children[12 * 16 + 12].children
    .filter(child => child.className === 'siege-mark');
assert.equal(siegeMarks().length, 0, 'A public Tower cannot expose a concealed besieger via its siege mark');
state.board[11][10] = piece(1, 'b');
api.renderBoard();
assert.equal(siegeMarks().length, 1, 'Visible besiegers still display siege status');
state.board[11][10] = null;
state.sieges[0].startedRound = 0;
state.sieges[0].towerTimer = 0;
api.applySiegeRoundProgress();
assert.equal(state.board[12][12].contents.length, 1);
assert(logs.at(-1).includes('out of sight'));
assert(!logs.at(-1).includes(api.coordsToNotation(12, 12)),
    'Attrition must not reveal a hidden garrison location');

console.log('Fog visibility, forest compatibility, tower privacy and rendering checks passed');
