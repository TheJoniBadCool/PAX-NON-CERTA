// Run with: node tests/path-planning-ui.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set(['hidden']);
    return {
        handlers: {}, children: [], style: {}, innerText: '', innerHTML: '', value: '',
        offsetLeft: 0, offsetTop: 0, offsetWidth: 100, offsetHeight: 40,
        clientWidth: 600, clientHeight: 600,
        classList: {
            add(value) { classes.add(value); },
            remove(value) { classes.delete(value); },
            contains(value) { return classes.has(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
        },
        addEventListener(event, handler) { this.handlers[event] = handler; },
        setAttribute() {}, querySelectorAll() { return []; }, querySelector() { return element(); }
    };
}
const elements = new Map();
function getElement(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
}
getElement('board').parentElement = element();
const context = vm.createContext({
    console, document: { getElementById: getElement, querySelectorAll: () => [] },
    window: { addEventListener() {} }, setTimeout(fn) { fn(); }, clearTimeout() {},
    requestAnimationFrame() {}, bindBoardInteractions() {},
    renderBoard() {}, renderCaptureChoices() {}, renderBattleCandidates() {},
    renderBattleRolls() {}, logAction() {}, logRoundHeader() {},
    Multiplayer: {
        isEditingSetup: () => false, isPendingCommit: () => false,
        getBadge: () => ({ text: '', ready: false }), refreshControls() {}
    }
});
[
    'constants', 'models', 'game-state', 'planning-timer', 'diplomacy-rules', 'setup-utils',
    'board-utils', 'capital-rules', 'battle-rules', 'siege-rules', 'movement-rules',
    'planning-rules', 'retreat-rules', 'prisoner-rules', 'objective-rules', 'mission-rules',
    'board-setup', 'starting-position', 'setup-actions', 'resource-purchases', 'status-ui',
    'province-food', 'allied-resolution', 'path-planning', 'plan-renderer', 'game'
].forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
vm.runInContext(`
    updatePlayerCards = () => {};
    renderRetreatTable = () => {};
    animatePlannedMovements = async () => {};
    renderBoard = () => {
        if (gameState.phase === 'PLANNING') {
            refreshMovementPaths(gameState.turnIndex + 1);
            if (gameState.tracingPathId) updatePathTraceSelection();
        }
        renderPlanArrows();
    };
`, context);
const api = vm.runInContext(`({
    state: gameState, handleSquareClick, handleSquareAction, handleSquarePopup, selectBoardPiece,
    resolveAllMoves, createUnit, putPieceAt, refreshMovementPaths, renderBoard,
    refreshResourceTotals
})`, context);
const state = api.state;
function setup(types = ['b']) {
    state.reset();
    state.planningTimeSeconds = 0;
    state.boardSize = 12;
    state.activePlayers = [true, true, false, false];
    state.eliminated = [false, false, true, true];
    state.board = Array.from({ length: 12 }, () => Array(12).fill(null));
    getElement('board').children = Array.from({ length: 144 }, element);
    const piece = {
        id: 'army', player: 1, type: types[0],
        contents: types.map((type, index) => api.createUnit(1, type, `unit-${index}`))
    };
    api.putPieceAt(5, 5, piece);
    getElement('piece-tooltip').classList.add('hidden');
    getElement('merge-prompt').classList.add('hidden');
    return piece;
}
const click = (r, c) => api.handleSquareClick(r, c);
const button = id => (getElement(id).handlers.click || getElement(id).onclick)();

async function run() {
    for (const types of [['p'], ['b', 'p']]) {
        const army = setup(types);
        const prisoner = army.contents.at(-1);
        prisoner.originalPlayer = 2;
        prisoner.prisonerOf = 1;
        click(5, 5);
        assert.ok(getElement('piece-tooltip').classList.contains('hidden'),
            'Selecting a prisoner-only or mixed stack must not force open the unit panel');
        assert.ok(state.validMoves.some(([r, c]) => r === 5 && c === 6),
            'Selecting a prisoner-containing stack preserves its adjacent moves');
        click(5, 6);
        assert.equal(state.plans[0].length, 1, 'A normal click queues the whole stack movement');
        assert.equal(state.plans[0][0].isUnmerge, undefined);
        assert.equal(state.plans[0][0].contents.length, types.length);
        await api.resolveAllMoves();
        assert.equal(state.board[5][6].id, army.id, 'The whole stack moves without unmerging');
        assert.ok(state.board[5][6].contents.some(unit => unit.id === prisoner.id && unit.prisonerOf === 1),
            'Moving preserves prisoner status');
        button('btn-privacy-ready');
        click(5, 6);
        assert.equal(state.validMoves.length, 0, 'Prisoner-containing stacks still rest on even rounds');
        api.handleSquarePopup(5, 6);
        assert.ok(!getElement('piece-tooltip').classList.contains('hidden'),
            'The explicit unit-panel action still opens prisoner management on rest rounds');
        assert.match(getElement('piece-tooltip-units').innerHTML, /data-action="execute"/);
        assert.match(getElement('piece-tooltip-units').innerHTML, /data-action="release"/);
    }

    setup();
    click(5, 5);
    click(5, 6);
    assert.equal(state.movementPaths[0].length, 1, 'A normal move starts a route');
    assert.equal(state.selectedSquare.join(), '5,6', 'Next actions originate from the future square');
    click(5, 7);
    click(6, 8);
    assert.equal(state.movementPaths[0][0].steps.length, 3, 'Board clicks extend the same route');
    assert.equal(state.plans[0].length, 1, 'Future clicks must not queue multiple actions this round');
    await api.resolveAllMoves();
    assert.equal(state.round, 2);
    button('btn-privacy-ready');
    assert.equal(state.plans[0][0].from.join(), '5,6');
    assert.equal(state.plans[0][0].to.join(), '5,7', 'The next round queues its action automatically');
    await api.resolveAllMoves();
    button('btn-privacy-ready');
    assert.equal(state.plans[0][0].to.join(), '6,8');
    await api.resolveAllMoves();
    assert.equal(state.movementPaths[0].length, 0, 'Completed routes must disappear');

    setup();
    click(5, 5);
    click(5, 6);
    click(5, 5);
    assert.equal(state.movementPaths[0].length, 0, 'Clicking the actual routed piece cancels, even beside the trace endpoint');
    assert.equal(state.plans[0].length, 0);
    assert.equal(state.selectedSquare.join(), '5,5');

    setup(['p', 'b']);
    click(5, 5);
    click(5, 6);
    click(5, 7);
    assert.equal(state.movementPaths[0][0].steps[1].round, 3);
    await api.resolveAllMoves();
    button('btn-privacy-ready');
    assert.equal(state.plans[0].length, 0, 'Pawn route must rest during the next even round');
    await api.resolveAllMoves();
    button('btn-privacy-ready');
    assert.equal(state.plans[0][0].to.join(), '5,7', 'Pawn route resumes on its next odd round');
    button('btn-clear-plan');
    assert.equal(state.movementPaths[0].length, 0, 'Reset clears all future routes');
    assert.equal(state.plans[0].length, 0);

    const castle = setup(['r', 'n']);
    castle.contents[0].gate = [0, 1];
    state.selectedSquare = [5, 5];
    state.selectedHeldPiece = {
        from: [5, 5], sourceId: castle.id, unitIds: [castle.contents[1].id]
    };
    state.validMoves = [[5, 6]];
    click(5, 6);
    click(5, 7);
    assert.equal(state.movementPaths[0][0].steps.length, 2, 'A group exiting a castle can trace onward');
    await api.resolveAllMoves();
    button('btn-privacy-ready');
    assert.equal(state.board[5][5].contents.length, 1, 'The tower stays behind');
    assert.equal(state.plans[0][0].pieceId, 'army::unmerge::unit-1');
    assert.equal(state.plans[0][0].isUnmerge, undefined, 'The detached group must not split again');

    setup();
    api.putPieceAt(5, 7, {
        id: 'friend', player: 1, type: 'n', contents: [api.createUnit(1, 'n', 'friend-unit')]
    });
    click(5, 5);
    click(5, 6);
    click(5, 7);
    assert.ok(state.pendingPathAction, 'Future merges use a confirmation');
    button('btn-merge-cancel');
    assert.equal(state.movementPaths[0][0].steps.length, 1, 'Cancelling a future merge keeps the route intact');
    click(5, 7);
    button('btn-merge-confirm');
    assert.equal(state.movementPaths[0][0].steps[1].kind, 'merge');
    assert.equal(state.tracingPathId, null, 'A terminal merge ends tracing');
    assert.equal(state.lockedPieceIds.size, 0, 'A future merge must not lock this round’s target');
    await api.resolveAllMoves();
    button('btn-privacy-ready');
    assert.equal(state.plans[0][0].mergeWithPieceId, 'friend', 'The merge queues only when due');
    await api.resolveAllMoves();
    assert.equal(state.board[5][7].contents.length, 2, 'Terminal merges resolve through normal collision rules');
    assert.equal(state.movementPaths[0].length, 0);

    const raider = setup(['p', 'q']);
    raider.contents[1].resourceStockpile = { food: 1, wood: 1 };
    api.refreshResourceTotals();
    api.putPieceAt(5, 7, {
        id: 'enemy-castle', player: 2, type: 'r',
        contents: [{ ...api.createUnit(2, 'r', 'enemy-tower'), gate: [0, -1] }]
    });
    click(5, 5);
    click(5, 6);
    click(5, 7);
    assert.equal(state.movementPaths[0][0].steps.length, 1, 'Future sieges require normal cost confirmation');
    button('btn-prepare-siege');
    assert.equal(state.movementPaths[0][0].steps[1].kind, 'siege');
    assert.equal(state.movementPaths[0][0].steps[1].round, 2, 'A legal siege can occur on a Pawn rest round');
    assert.equal(state.resources[0].food, 1, 'Future siege costs are not paid while tracing');
    await api.resolveAllMoves();
    button('btn-privacy-ready');
    assert.equal(state.plans[0][0].to.join(), '5,7');
    await api.resolveAllMoves();
    assert.equal(state.sieges.length, 1);
    assert.equal(state.sieges[0].attackers[0].sourceSquare.join(), '5,6');
    assert.equal(state.resources[0].food, 0, 'Siege costs are paid only during resolution');
    assert.equal(state.movementPaths[0].length, 0, 'Starting a terminal siege finishes the route');

    const besieger = setup(['p']);
    api.putPieceAt(5, 4, {
        id: 'castle', player: 2, type: 'r',
        contents: [{ ...api.createUnit(2, 'r', 'tower'), gate: [0, 1] }]
    });
    state.sieges = [{ id: 'siege-test', towerSquare: [5, 4], towerTimer: 4, attackers: [{
        pieceId: besieger.id, player: 1, sourceSquare: [5, 5], timer: 1
    }] }];
    state.selectedSquare = [5, 5];
    button('btn-cancel-siege');
    assert.equal(state.sieges.length, 1, 'Hotseat siege cancellation is queued, not immediate');
    click(5, 6);
    assert.equal(state.plans[0][0].siegeCancel, true);
    assert.equal(state.movementPaths[0][0].steps[1].round, 3);
    await api.resolveAllMoves();
    assert.equal(state.sieges.length, 0, 'The siege ends during resolution');
    button('btn-privacy-ready');
    assert.equal(state.movementPaths[0].length, 1, 'Leave Siege retains its future route');
    assert.equal(state.plans[0].length, 0, 'Pawn still rests after leaving the siege');

    setup();
    click(5, 5);
    click(5, 6);
    click(5, 7);
    api.putPieceAt(5, 7, { id: 'enemy', player: 2, type: 'n',
        contents: [api.createUnit(2, 'n', 'enemy-unit')] });
    api.renderBoard();
    assert.equal(state.movementPaths[0][0].invalidFrom, 1);
    button('btn-finish-plan');
    assert.equal(state.movementPaths[0][0].steps.length, 1, 'Commit trims only the invalid suffix');
    assert.equal(state.plans[0].length, 1);
    console.log('Path tracing click flow, splits, merges, rest turns, siege exit and commitment checks passed.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
