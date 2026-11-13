// Run with: gjs -c "$(cat js/constants.js js/models.js js/game-state.js js/setup-utils.js js/board-utils.js js/movement-rules.js js/siege-rules.js js/planning-rules.js js/board-setup.js js/setup-actions.js js/board-renderer.js tests/tower-gates.js)"
const gameState = new GameState();
const logs = [];
const customSetupStatusEl = { innerText: '' };
function randomLevel() { return 0; }
function logAction(message) { logs.push(message); }
function renderCustomSetupBoard() {}
function assert(condition, message) {
    if (!condition) throw new Error(message);
}
function makePiece(player, type, id, gate) {
    const unit = createUnit(player, type, `${id}-unit`, id);
    if (gate) unit.gate = gate;
    return { id, player, type, contents: [unit] };
}
function emptyBoard() {
    return Array.from({ length: 16 }, () => Array(16).fill(null));
}
function containsSquare(moves, square) {
    return moves.some(move => move[0] === square[0] && move[1] === square[1]);
}

for (let run = 0; run < 300; run++) {
    gameState.activePlayers = [true, true, true, true];
    initBoard();
    assert(towersAreSpaced(gameState.board), 'Random towers must be spaced');
    assert(gameState.board.flat().filter(Boolean).length === 48, 'Random setup must retain all pieces');
    for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) {
            const piece = gameState.board[r][c];
            if (!isTowerPiece(piece)) continue;
            const gate = getTowerGate(piece);
            assert(Math.abs(gate[0]) + Math.abs(gate[1]) === 1, 'Gate must be cardinal');
            assert(r + gate[0] >= 0 && r + gate[0] < 16 &&
                c + gate[1] >= 0 && c + gate[1] < 16, 'Gate must be on the board');
        }
    }
}

const custom = emptyBoard();
custom[0][0] = makePiece(1, 'r', 'corner');
gameState.activePlayers = [true, true, false, false];
initBoard(custom);
assert(!custom[0][0].contents[0].gate, 'Starting a match must not alter the saved setup');
assert([[0, 1], [1, 0]].some(gate =>
    gate[0] === getTowerGate(gameState.board[0][0])[0] &&
    gate[1] === getTowerGate(gameState.board[0][0])[1]), 'Corner gate must point in bounds');

gameState.board = emptyBoard();
gameState.board[5][5] = makePiece(1, 'r', 'tower', [0, 1]);
gameState.board[5][5].contents.push(createUnit(1, 'q', 'queen', 'queen'));
gameState.turnIndex = 0;
gameState.round = 1;
gameState.sieges = [];
gameState.lockedPieceIds = new Set();
gameState.plans = [[], [], [], []];
for (const [r, c] of getAdjacentMoves(5, 5)) {
    const allowed = r === 5 && c === 6;
    assert(isTowerGateMove([5, 5], [r, c]) === allowed, 'Exit must use the gate');
    assert(isTowerGateMove([r, c], [5, 5]) === allowed, 'Entry must use the gate');
    gameState.board[r][c] = makePiece(1, 'q', `friend-${r}-${c}`);
    assert(containsSquare(getValidMovesForPiece(r, c), [5, 5]) === allowed,
        'Friendly movement must only highlight the gate');
    gameState.board[r][c] = makePiece(2, 'p', `enemy-${r}-${c}`);
    gameState.turnIndex = 1;
    assert(containsSquare(getValidMovesForPiece(r, c), [5, 5]) === allowed,
        'Enemy siege must only highlight the gate');
    gameState.turnIndex = 0;
    gameState.board[r][c] = null;
}

const badExit = { player: 1, from: [5, 5], to: [4, 5], isUnmerge: true, contents: [] };
const badEntry = { player: 1, from: [4, 5], to: [5, 5], isUnmerge: true, contents: [] };
const validExit = { player: 1, from: [5, 5], to: [5, 6], isUnmerge: true, contents: [] };
const badAssault = { player: 2, from: [4, 5], to: [5, 5], siegeAssault: true, contents: [] };
rejectInvalidTowerAttacks([badExit, badEntry, validExit, badAssault]);
assert(badExit.invalid && badEntry.invalid && badAssault.invalid && !validExit.invalid,
    'Resolution must reject all non-gate movements, including assaults');

gameState.board[5][6] = makePiece(2, 'p', 'attacker');
const siegeStart = {
    player: 2, pieceId: 'attacker', from: [5, 6], to: [5, 5],
    contents: getPieceContents(gameState.board[5][6])
};
rejectInvalidTowerAttacks([siegeStart]);
registerSiegeStarts([siegeStart]);
assert(siegeStart.siegeStart && gameState.sieges.length === 1,
    'An attack from the gate must start a siege');
const besiegedExit = { player: 1, from: [5, 5], to: [5, 6], isUnmerge: true, contents: [] };
rejectInvalidTowerAttacks([besiegedExit]);
assert(besiegedExit.invalid, 'A siege must still prevent ordinary gate exits');
gameState.sieges = [{
    id: 'siege', towerSquare: [5, 5], towerTimer: 6, startedRound: 1,
    attackers: [{ pieceId: 'attacker', player: 2, sourceSquare: [5, 6], timer: 0 }]
}];
assert(getReadySiegeAssault(gameState.board[5][6], [5, 6], [5, 5]), 'Ready gate assault must work');
gameState.board[5][5].contents[0].gate = [-1, 0];
assert(!getReadySiegeAssault(gameState.board[5][6], [5, 6], [5, 5]),
    'A siege assault cannot bypass the gate');

gameState.customSetupBoard = emptyBoard();
gameState.customSetupPlayer = 0;
gameState.customSetupType = 'r';
placeCustomPiece(5, 5);
placeCustomPiece(7, 7);
assert(!gameState.customSetupBoard[7][7], 'Diagonal tower spacing must be enforced');
placeCustomPiece(5, 5);
assert(gameState.customSetupBoard[5][5].contents.length === 1, 'Towers cannot share a square');
placeCustomPiece(8, 7);
assert(isTowerPiece(gameState.customSetupBoard[8][7]), 'Towers three squares apart are allowed');
gameState.customSetupBoard[7][7] = makePiece(2, 'r', 'old');
assert(!towersAreSpaced(gameState.customSetupBoard), 'Old invalid setups must be rejected');

const captured = { ...gameState.board[5][5].contents[0], player: 2, id: 'captured' };
const merged = { id: 'merged', player: 2, type: 'r', contents: [captured, createUnit(2, 'p', 'p')] };
assert(getTowerGate(merged)[0] === -1 && getTowerGate(merged)[1] === 0,
    'Captured and merged towers must keep their gate');

function element() {
    return {
        children: [], style: {}, className: '', innerText: '', title: '',
        classList: { add() {} },
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { this[name] = value; }
    };
}
const document = { createElement: element };
const boardEl = element();
function renderPlanArrows() {}
function renderRetreatTable() {}
gameState.board = emptyBoard();
gameState.board[5][5] = merged;
gameState.sieges = [];
gameState.plans = [[], [], [], []];
gameState.turnIndex = 0;
gameState.selectedSquare = null;
gameState.validMoves = [];
for (const [gate, direction, glyph] of [
    [[-1, 0], 'north', '▲'], [[1, 0], 'south', '▼'],
    [[0, -1], 'west', '◀'], [[0, 1], 'east', '▶']
]) {
    captured.gate = gate;
    boardEl.children = [];
    renderBoard();
    const arrow = boardEl.children[5 * 16 + 5].children.find(child => child.className === `tower-gate tower-gate-${direction}`);
    assert(arrow && arrow.innerText === glyph && arrow['aria-label'].includes(direction),
        `The ${direction} gate must render the matching arrow`);
}

print('Tower gate checks passed');
