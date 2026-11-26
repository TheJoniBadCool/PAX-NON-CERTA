// Run with: gjs -c "$(cat js/constants.js js/models.js js/game-state.js js/setup-utils.js js/board-utils.js js/movement-rules.js js/siege-rules.js js/planning-rules.js js/path-planning.js js/plan-renderer.js tests/path-planning.js)"
const gameState = new GameState();
const SIEGE_COST = { food: 1, wood: 1 };
const planArrowsEl = { setAttribute() {}, innerHTML: '' };
function hasPlayerResources() { return true; }
function assert(condition, message) {
    if (!condition) throw new Error(message);
}
function resetPathTest(types = ['b'], square = [5, 5]) {
    gameState.reset();
    gameState.boardSize = 12;
    gameState.board = Array.from({ length: 12 }, () => Array(12).fill(null));
    const piece = {
        id: 'army', player: 1, type: getMergedPieceType(types),
        contents: types.map((type, index) => createUnit(1, type, `unit-${index}`))
    };
    piece.type = getMergedPieceType(piece.contents);
    putPieceAt(...square, piece);
    return piece;
}
function startPath(piece, from = [5, 5], to = [5, 6], extra = {}) {
    const order = {
        pieceId: piece.id, from, to, pieceType: piece.type,
        contents: getPieceContents(piece), ...extra
    };
    gameState.plans[0].push(order);
    assert(beginMovementPath(order), 'A movement-like first action must start tracing');
    return gameState.movementPaths[0].at(-1);
}
function completeFirstStep(path) {
    const order = getPathOrder(path, 1);
    const piece = getPieceByIdAt(...order.from, order.pieceId);
    removePieceAt(...order.from, order.pieceId);
    putPieceAt(...order.to, piece);
    advanceMovementPaths([{ ...order, player: 1 }]);
    gameState.plans = [[], [], [], []];
    gameState.round++;
}

let piece = resetPathTest();
let path = startPath(piece);
assert(appendMovementPathStep([5, 7]) && appendMovementPathStep([6, 8]),
    'Consecutive adjacent moves must extend tracing');
assert(path.steps.map(step => step.round).join() === '1,2,3',
    'Non-Pawns must get consecutive round orders');
refreshMovementPaths(1);
assert(gameState.plans[0].length === 1 && samePathSquare(gameState.plans[0][0].to, [5, 6]),
    'Only the current step may be queued');
assert(samePathSquare(gameState.selectedSquare, [6, 8]), 'Trace selection must follow the future endpoint');
completeFirstStep(path);
refreshMovementPaths(1);
assert(path.steps.length === 2 && gameState.plans[0][0].from[1] === 6 &&
    gameState.plans[0][0].to[1] === 7, 'The next step must queue automatically');
cancelPieceMovementPaths(piece, 1);
assert(!gameState.movementPaths[0].length && !gameState.plans[0].length,
    'Selecting a routed piece must cancel its route and automatic order');

piece = resetPathTest(['p', 'n']);
path = startPath(piece);
appendMovementPathStep([5, 7]);
appendMovementPathStep([5, 8]);
assert(path.steps.map(step => step.round).join() === '1,3,5', 'Pawns must automatically rest on even rounds');
renderPlanArrows();
assert((planArrowsEl.innerHTML.match(/>zzz</g) || []).length === 2,
    'Every intervening Pawn rest must have a zzz marker');
completeFirstStep(path);
refreshMovementPaths(1);
assert(!gameState.plans[0].length, 'Pawn route must queue no action during rest');
advanceMovementPaths([]);
gameState.round++;
refreshMovementPaths(1);
assert(gameState.plans[0].length === 1, 'Pawn route must resume after rest');

piece = resetPathTest(['q']);
piece.contents[0].prisonerOf = 1;
path = startPath(piece);
appendMovementPathStep([5, 7]);
assert(path.steps[1].round === 3, 'Prisoners must retain their existing rest rule');

piece = resetPathTest();
path = startPath(piece);
appendMovementPathStep([5, 7]);
appendMovementPathStep([5, 8]);
putPieceAt(5, 7, { id: 'blocker', player: 2, type: 'n',
    contents: [createUnit(2, 'n', 'enemy')] });
refreshMovementPaths(1);
assert(path.invalidFrom === 1 && gameState.plans[0].length === 1,
    'A visible blocker must invalidate only the dependent suffix and retain the current valid action');
renderPlanArrows();
assert((planArrowsEl.innerHTML.match(/marker-end="url\(#arrow-yellow\)"/g) || []).length === 2,
    'Only the blocked step and its dependent suffix must be yellow');
assert((planArrowsEl.innerHTML.match(/marker-end="url\(#arrow-green\)"/g) || []).length === 1,
    'The valid prefix must stay green');
finalizeMovementPaths(1);
assert(path.steps.length === 1 && gameState.plans[0].length === 1,
    'Commitment must trim just the invalid suffix');

piece = resetPathTest();
path = startPath(piece);
appendMovementPathStep([5, 7]);
putPieceAt(5, 6, { id: 'blocker', player: 2, type: 'n',
    contents: [createUnit(2, 'n', 'enemy')] });
refreshMovementPaths(1);
assert(path.invalidFrom === 0 && !gameState.plans[0].length,
    'An invalid first step must never execute as an unexpected attack');
gameState.biomes = Array.from({ length: 12 }, () => Array(12).fill('plains'));
gameState.biomes[5][6] = 'forest';
refreshMovementPaths(1);
assert(path.invalidFrom === -1 && gameState.plans[0].length === 1,
    'A forest-concealed enemy must not invalidate or disclose a route');
gameState.biomes[5][6] = 'plains';
removePieceAt(5, 6, 'blocker');
appendMovementPathStep([5, 8]);
putPieceAt(5, 8, { id: 'fog-enemy', player: 2, type: 'n',
    contents: [createUnit(2, 'n', 'fog-unit')] });
refreshMovementPaths(1);
assert(path.invalidFrom === -1, 'Unseen enemies outside current sight must not invalidate future steps');
gameState.biomes[5][7] = 'mountain';
refreshMovementPaths(1);
assert(path.invalidFrom === 1, 'Known impassable terrain must invalidate the dependent suffix');

piece = resetPathTest();
path = startPath(piece);
putPieceAt(5, 7, { id: 'friend', player: 1, type: 'q',
    contents: [createUnit(1, 'q', 'friend-unit')] });
appendMovementPathStep([5, 7]);
assert(path.steps[1].kind === 'merge' && !gameState.tracingPathId,
    'A route may end with a merge, but cannot continue beyond it');
completeFirstStep(path);
refreshMovementPaths(1);
assert(gameState.plans[0][0].mergeAccepted && gameState.lockedPieceIds.has('friend'),
    'A due terminal merge must use normal merge orders and locks');
cancelPieceMovementPaths(piece, 1);
assert(!gameState.lockedPieceIds.has('friend'), 'Cancelling an automatic merge must release its target');

piece = resetPathTest();
path = startPath(piece);
putPieceAt(5, 7, { id: 'enemy', player: 2, type: 'n',
    contents: [createUnit(2, 'n', 'enemy-unit')] });
appendMovementPathStep([5, 7]);
assert(path.steps[1].kind === 'attack' && !gameState.tracingPathId,
    'A visible enemy may be chosen as a terminal attack');
cancelBattleMovementPaths([{ contents: piece.contents }]);
assert(!gameState.movementPaths[0].length, 'Any battle must cancel participating routes, even without casualties');

piece = resetPathTest();
path = startPath(piece);
appendMovementPathStep([5, 7]);
piece.contents.push(createUnit(1, 'b', 'reinforcement'));
advanceMovementPaths([]);
assert(!gameState.movementPaths[0].length, 'A composition change must cancel the route');

piece = resetPathTest(['r', 'n']);
piece.contents[0].gate = [0, 1];
const group = {
    ...piece, id: 'army::unmerge::unit-1', type: 'n', contents: [piece.contents[1]]
};
path = startPath(group, [5, 5], [5, 6], { isUnmerge: true, sourcePieceId: piece.id, unitIds: ['unit-1'] });
appendMovementPathStep([5, 7]);
assert(path.steps[0].isUnmerge && !path.steps[1].isUnmerge,
    'A castle exit must split once and subsequently move the detached group');
assert(sanitizeMovementPaths(1, [path]), 'Valid group routes must survive host sanitization');
piece.contents = [piece.contents[0]];
putPieceAt(5, 6, group);
advanceMovementPaths([{ ...getPathOrder({ ...path, steps: path.steps }, 1), player: 1 }]);
gameState.round++;
gameState.plans = [[], [], [], []];
refreshMovementPaths(1);
assert(gameState.plans[0][0].pieceId === group.id && !gameState.plans[0][0].isUnmerge,
    'The split group must retain identity in later rounds');

piece = resetPathTest(['p']);
gameState.sieges = [{ id: 'siege-test', towerSquare: [5, 4], attackers: [{
    pieceId: piece.id, player: 1, sourceSquare: [5, 5], timer: 1
}] }];
path = startPath(piece, [5, 5], [5, 5], { siegeCancel: true, siegeId: 'siege-test' });
appendMovementPathStep([5, 6]);
refreshMovementPaths(1);
assert(path.invalidFrom === -1 && path.steps[1].round === 3 &&
    gameState.plans[0][0].siegeCancel, 'Leave Siege must consume its round and then allow a route with rest');
gameState.sieges = [];
advanceMovementPaths([{ ...getPathOrder(path, 1), player: 1 }]);
gameState.round++;
refreshMovementPaths(1);
assert(gameState.movementPaths[0].length === 1 && !gameState.plans[0].length,
    'A cancelled siege route must survive its following Pawn rest round');

piece = resetPathTest();
path = startPath(piece);
appendMovementPathStep([5, 7]);
assert(sanitizeMovementPaths(1, [path]), 'Valid routes must pass host validation');
const malformed = JSON.parse(JSON.stringify(path));
malformed.steps[1].from = [0, 0];
assert(!sanitizeMovementPaths(1, [malformed]), 'Disconnected future steps must be rejected');
assert(!sanitizeMovementPaths(2, [path]), 'Players cannot submit another player’s route');
assert(!sanitizeMovementPaths(1, [path, path]), 'A unit cannot belong to multiple routes');
const injected = JSON.parse(JSON.stringify(path));
injected.steps[1].siegeAssault = true;
assert(!sanitizeMovementPaths(1, [injected])[0].steps[1].siegeAssault,
    'Future steps must not carry arbitrary executable flags');
gameState.immobilizedUntilRound[0] = 2;
refreshMovementPaths(1);
assert(path.invalidFrom === 0 && !gameState.plans[0].length, 'Stop Sign must block automatic route orders');
finalizeMovementPaths(1);
assert(!gameState.movementPaths[0].length, 'Committing an entirely invalid route must remove it');

piece = resetPathTest();
path = startPath(piece);
const follower = { id: 'follower', player: 1, type: 'n', contents: [createUnit(1, 'n', 'follower-unit')] };
putPieceAt(5, 4, follower);
startPath(follower, [5, 4], [5, 5]);
refreshMovementPaths(1);
assert(gameState.plans[0].length === 2, 'Routes may follow same-player pieces moving away this round');
putPieceAt(5, 6, { id: 'blocker', player: 2, type: 'n', contents: [createUnit(2, 'n', 'enemy')] });
refreshMovementPaths(1);
assert(!gameState.plans[0].length && gameState.movementPaths[0].every(route => route.invalidFrom === 0),
    'A cancelled leading move must not make its follower accidentally merge into it');

piece = resetPathTest(['p']);
path = startPath(piece);
putPieceAt(5, 7, { id: 'enemy-castle', player: 2, type: 'r',
    contents: [{ ...createUnit(2, 'r', 'enemy-tower'), gate: [0, -1] }] });
appendMovementPathStep([5, 7]);
assert(path.steps[1].kind === 'siege' && path.steps[1].round === 2,
    'A terminal siege must preserve the existing even-round Pawn exception');

piece = resetPathTest(['p']);
gameState.round = 2;
path = startPath(piece, [5, 5], [5, 6], { forceMarch: true });
assert(getPathInvalidIndex(path, 1) === -1 && sanitizeMovementPaths(1, [path]),
    'Force March must authorize the current even-round Pawn route');
assert(appendMovementPathStep([5, 7]) && path.steps[1].round === 3,
    'Force March applies only to its first move; later route steps follow normal rest rules');
assert(getPathOrder(path, 1).forceMarch, 'The forced route order must retain its authorization marker');

piece = resetPathTest();
path = startPath(piece);
startPath(piece, [5, 5], [6, 5]);
assert(gameState.movementPaths[0].length === 1,
    'Replacing a move through the unit popup must not retain duplicate routes');
gameState.movementPaths = [[], [], [], []];
gameState.plans = [[], [], [], []];
gameState.phase = 'TRANSITION';
renderPlanArrows();
assert(!planArrowsEl.innerHTML.includes('<line'), 'Private future routes must not appear during handoffs');
print('Path planning tests passed');
