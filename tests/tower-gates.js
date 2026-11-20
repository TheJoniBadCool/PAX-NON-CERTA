// Run with: gjs -c "$(cat js/constants.js js/models.js js/game-state.js js/setup-utils.js js/board-utils.js js/resource-purchases.js js/capital-rules.js js/movement-rules.js js/siege-rules.js js/planning-rules.js js/board-setup.js js/setup-actions.js js/board-renderer.js tests/tower-gates.js)"
const gameState = new GameState();
const logs = [];
const customSetupStatusEl = { innerText: '' };
function randomLevel() { return 0; }
function logAction(message) { logs.push(message); }
function renderCustomSetupBoard() {}
function refreshCustomMapPreview() {}
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
    gameState.startingArmy = 'full';
    initBoard();
    assert(towersAreSpaced(gameState.board), 'Random towers must be spaced');
    assert(gameState.board.flat().filter(Boolean).length === 28,
        'Random setup must place one castle in each province and one outside pawn per rebel province');
    const rebels = gameState.board.flat().filter(piece => piece && piece.player === REBEL_PLAYER_ID);
    assert(rebels.filter(isTowerPiece).length === 12 &&
        rebels.filter(piece => !isTowerPiece(piece)).length === 12,
    'Each non-player province receives a rebel castle and one outside rebel pawn');
    for (let player = 1; player <= 4; player++) {
        const castles = gameState.board.flat().filter(piece => piece && piece.player === player);
        assert(castles.length === 1, 'Each selected player must have one starting castle');
        const contents = getPieceContents(castles[0]);
        const unitCounts = type => contents.filter(unit => unit.type === type).length;
        assert(unitCounts('r') === 1 && unitCounts('b') === 2 &&
            unitCounts('p') === 4 && unitCounts('n') === 2 &&
            unitCounts('q') === 1 && unitCounts('k') === 1,
        'Each castle must hold the full selected 11-unit roster');
        assert(contents.map(unit => unit.type).sort().join('') === 'bbknnppppqr',
            'The single castle must contain the selected full roster');
        const namesByType = {};
        contents.forEach(unit => {
            (namesByType[unit.type] ||= []).push(unit.name);
            assert(unit.id && unit.name, 'Every starting unit must retain an ID and name');
        });
        Object.values(namesByType).forEach(names =>
            assert(new Set(names).size === names.length, 'Unit names must be unique by type'));
        assert(contents.length === 11, 'Each full starting castle must contain eleven units');
    }
    for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) {
            const piece = gameState.board[r][c];
            if (!isTowerPiece(piece) || piece.player === REBEL_PLAYER_ID) continue;
            const playerIndex = piece.player - 1;
            const minR = playerIndex >= 2 ? 12 : 0;
            const minC = playerIndex === 1 || playerIndex === 2 ? 12 : 0;
            const maxR = minR + 3;
            const maxC = minC + 3;
            assert(r >= minR && r <= maxR && c >= minC && c <= maxC,
                'Player castles must remain in their starting corner province');
            const gate = getTowerGate(piece);
            assert(Math.abs(gate[0]) + Math.abs(gate[1]) === 1, 'Gate must be cardinal');
            assert(r + gate[0] >= 0 && r + gate[0] < 16 &&
                c + gate[1] >= 0 && c + gate[1] < 16, 'Gate must be on the board');
            assert(getPieceContents(piece).filter(unit => unit.type === 'r')
                .every(unit => unit.gate[0] === gate[0] && unit.gate[1] === gate[1]),
            'Every Tower in the castle must retain the shared gate');
        }
    }
}

gameState.activePlayers = [true, false, true, false];
initBoard();
assert(gameState.board.flat().filter(Boolean).length === 30,
    'Every province receives one castle and each non-player province one outside rebel pawn');
assert(gameState.board.flat().filter(piece => piece && piece.player === REBEL_PLAYER_ID &&
    isTowerPiece(piece)).length === 14, 'Unselected provinces receive rebel castles');
assert(gameState.board.flat().filter(piece => piece && [1, 3].includes(piece.player)).length === 2,
    'Only selected players receive a player castle');
assert(!gameState.board.flat().some(piece => piece && [2, 4].includes(piece.player)),
    'Unselected players must have no starting pieces');

const custom = emptyBoard();
custom[0][0] = makePiece(1, 'r', 'corner');
gameState.activePlayers = [true, true, false, false];
initBoard(custom);
assert(!custom[0][0].contents[0].gate, 'Starting a match must not alter the saved setup');
assert([[0, 1], [1, 0]].some(gate =>
    gate[0] === getTowerGate(gameState.board[0][0])[0] &&
    gate[1] === getTowerGate(gameState.board[0][0])[1]), 'Corner gate must point in bounds');

gameState.board = emptyBoard();
gameState.biomes = [];
gameState.board[5][5] = makePiece(1, 'r', 'tower', [0, 1]);
gameState.board[5][5].contents.push(createUnit(1, 'q', 'queen', 'queen'));
gameState.turnIndex = 0;
gameState.round = 1;
gameState.resources[1].food = 2;
gameState.resources[1].wood = 2;
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
gameState.board[10][10] = makePiece(2, 'r', 'attacker-supplies');
gameState.board[10][10].contents[0].resourceStockpile = {
    horse: 0, food: 1, wood: 1, metal: 0, gold: 0, stone: 0
};
refreshResourceTotals();
const siegeStart = {
    player: 2, pieceId: 'attacker', from: [5, 6], to: [5, 5],
    contents: getPieceContents(gameState.board[5][6])
};
rejectInvalidTowerAttacks([siegeStart]);
registerSiegeStarts([siegeStart]);
assert(siegeStart.siegeStart && gameState.sieges.length === 1,
    'An attack from the gate must start a siege');
assert(gameState.resources[1].food === 0, 'Siege deployment spends the Food cost');
assert(gameState.resources[1].wood === 0, 'Siege deployment spends the Wood cost');
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
boardEl.parentElement = { style: { setProperty() {} } };
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
