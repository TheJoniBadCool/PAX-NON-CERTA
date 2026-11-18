// Run with: gjs tests/multiplayer-turns.js
const { GLib } = imports.gi;
const decoder = new TextDecoder();
const [, bytes] = GLib.file_get_contents('js/multiplayer.js');
const source = decoder.decode(bytes);
function readSource(path) {
    const [, contents] = GLib.file_get_contents(path);
    return decoder.decode(contents);
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function element() {
    const handlers = {};
    const classes = new Set();
    return {
        handlers, style: {}, value: '', checked: false, innerText: '', innerHTML: '', disabled: false,
        firstElementChild: { innerText: '' },
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value),
            toggle: (value, force) => force ? classes.add(value) : classes.delete(value)
        },
        addEventListener: (event, handler) => { handlers[event] = handler; },
        append() {}, appendChild() {}, remove() {}, setAttribute() {}
    };
}

const elements = new Map();
const document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    },
    createElement() { return element(); },
    querySelector() { return { value: 'zero' }; },
    querySelectorAll() { return []; },
    body: element()
};

class FakeConnection {
    constructor(user) { this.remoteUserId = user; this.open = true; this.handlers = {}; this.sent = []; }
    on(event, handler) { this.handlers[event] = handler; }
    emit(event, value) { if (this.handlers[event]) this.handlers[event](value); }
    send(message) { this.sent.push(message); return Promise.resolve(true); }
    close() { this.open = false; this.emit('close'); }
}

let relay;
let savedTurn;
let finishSave;
class PaxRelay {
    constructor() {
        relay = this;
        this.handlers = {};
        Promise.resolve().then(() => this.handlers.open());
    }
    on(event, handler) { this.handlers[event] = handler; }
    rpc(name, args) {
        assert(name === 'pax_host_turn', 'Host must persist its plan');
        savedTurn = args;
        return new Promise(resolve => { finishSave = resolve; });
    }
    destroy() { this.destroyed = true; }
}

const state = {
    board: [], eliminated: [false, false, true, true], plans: [[], [], [], []],
    committed: [false, false, false, false], phase: 'PLANNING', round: 1, boardSize: 16,
    objectives: [
        [{ label: 'Host secret', points: 4 }],
        [{ label: 'Guest secret', points: 3 }], [], []
    ],
    scores: [0, 0, 0, 0]
};
state.resourceMode = '8';
state.resourceBalance = 'off';
state.provinceResources = [{ type: 'gold', productionChance: 75 }];
state.resources = [{ gold: 99 }, { gold: 3 }, { gold: 0 }, { gold: 0 }];
state.lastResourceProductionRound = 4;
let resolutions = 0;
let captureRequest;
let prisonerRequest;
let starts = 0;
const ctx = {
    document, PaxRelay,
    BOARD_SIZES: [12, 16],
    REBEL_PLAYER_ID: 5,
    RESOURCE_TYPES: ['horse', 'food', 'wood', 'metal', 'gold'].map(key => ({ key })),
    crypto: { getRandomValues: bytes => bytes.fill(1) },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} },
    setTimeout: () => 1, clearTimeout() {}, console: { error() {} },
    PLAYERS: [1, 2, 3, 4].map(id => ({
        name: `Player ${id}`, colorName: `Color ${id}`, color: 'red'
    })),
    gameState: state,
    customMapPreview: null,
    customSetupStatusEl: element(),
    mainMenuModal: element(), playerSelectionModal: element(), customSetupModal: element(),
    clashOverlay: element(), battleLogEl: element(), battleCandidatesEl: element(),
    clashResult: element(), battleRollsEl: element(), battleTargetSquare: null,
    mergePrompt: element(), pieceTooltip: element(), btnMergeConfirm: element(),
    btnFinishPlan: element(), btnRestart: element(), activePlayerDescEl: element(),
    hintTextEl: element(), btnStartBattle: element(), btnProceedBattle: element(),
    startNewGame(players, board, size, seed, map) {
        starts++;
        state.activePlayers = players;
        state.board = board ? JSON.parse(JSON.stringify(board)) :
            Array.from({ length: 16 }, () => Array(16).fill(null));
        if (!board) state.board[0][0] = { id: 'guest-piece', player: 2, type: 'p' };
        if (map) {
            state.biomes = JSON.parse(JSON.stringify(map.biomes));
            state.provinceResources = JSON.parse(JSON.stringify(map.provinceResources));
        }
        state.plans = [[], [], [], []];
        state.eliminated = [false, false, true, true];
    },
    updatePlayerCards() {}, renderBoard() {}, logAction() {}, showPlayerSelection() {},
    showCustomSetup(players, board, map) {
        state.activePlayers = players;
        state.customSetupBoard = board || Array.from({ length: 16 }, () => Array(16).fill(null));
        ctx.customMapPreview = map
            ? { seed: 'painted-map', starting: JSON.parse(JSON.stringify(map)) } : null;
        ctx.customSetupModal.classList.remove('hidden');
    },
    isTowerGateMove: () => true, canMoveWholePiece: () => true,
    isEliminatedPiece: piece => Boolean(state.eliminated[piece.player - 1]),
    createRandomMapSeed: () => 'test-seed',
    createStartingBoard: () => ({ board: [], biomes: [] }),
    renderMapPreview() {},
    isPassableSquare: (r, c) => state.biomes?.[r]?.[c] !== 'mountain',
    getVisiblePiece: (r, c) => state.board[r][c],
    getPieceContents: piece => piece.contents || [{ id: 'unit', type: 'p' }],
    canUnitsTarget: () => true, isPrisoner: () => false,
    renderCaptureChoices() {},
    decideCapture(player, captureId, unitId, fate) {
        captureRequest = { player, captureId, unitId, fate };
        return player === 2;
    },
    managePrisoner(player, unitId, action) {
        prisonerRequest = { player, unitId, action };
        return player === 2;
    },
    resolveAllMoves() { resolutions++; state.phase = 'RESOLVING'; return Promise.resolve(); }
};
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/setup-utils.js')}
    return { isValidSavedSetup, cloneSetupBoard, updateCapitalResourceOption };
}`)(ctx));
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/board-utils.js')}
    return { towersAreSpaced, getProvinceResources, getProvinceIndex };
}`)({
    REBEL_PLAYER_ID: 5,
    getPieceContents: piece => piece.contents,
    getUnitType: unit => unit.type
}));
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/prisoner-rules.js')}
    ${readSource('js/models.js')}
    ${readSource('js/movement-rules.js')}
    return { validatePrisonerPlans, getPlannedPieceContents, isPrisoner, canMoveWholePiece, canMoveHeldUnit };
}`)(ctx));

async function run() {
    const multiplayer = new Function('ctx', `with (ctx) { ${source}\n return Multiplayer; }`)(ctx);
    ctx.Multiplayer = multiplayer;
    document.getElementById('mp-name').value = 'Host';
    document.getElementById('mp-resource-mode').value = '12';
    document.getElementById('mp-resource-balance').value = 'require-all';
    document.getElementById('mp-resource-capitals').checked = true;
    document.getElementById('btn-mp-create').handlers.click();
    await Promise.resolve();

    const guest = new FakeConnection('guest-id');
    relay.handlers.connection(guest);
    guest.emit('data', { type: 'join', name: 'Guest' });
    const setupMode = document.getElementById('mp-setup-mode');
    setupMode.value = 'custom';
    setupMode.handlers.change();
    assert(!document.getElementById('mp-custom-options').classList.contains('hidden'),
        'Custom placement controls must be visible');
    document.getElementById('btn-mp-start').handlers.click();
    assert(multiplayer.isEditingSetup() && starts === 0 && !state.multiplayer,
        'Starting without custom placement must open the editor, not start a match');
    multiplayer.confirmSetup();
    assert(!multiplayer.isEditingSetup(), 'Empty sandbox placements are allowed');
    document.getElementById('btn-mp-setup').handlers.click();
    assert(multiplayer.setupMatchesRoom([true, true, false, false]) &&
        !multiplayer.setupMatchesRoom([true, false, true, false]) &&
        !multiplayer.setupMatchesRoom([true, true, true, false]),
        'Saved setups must match the room colors, not just the count');
    const custom = state.customSetupBoard;
    custom[0][0] = { id: 'guest-piece', player: 2, type: 'p',
        contents: [{ id: 'unit', player: 2, type: 'p', experience: 2, armour: 1 }] };
    for (const player of [1, 2]) {
        ['k', 'q', 'r'].forEach((type, column) => {
            custom[player * 4][column] = { id: `p${player}-${type}`, player, type,
                contents: [{ id: `p${player}-${type}-unit`, player, type }] };
        });
    }
    const saved = [{ activePlayers: [true, true, true, false], board: custom }];
    ctx.getSavedSetups = () => saved;
    ctx.playerSelectionError = element();
    const loadSavedSetup = new Function('ctx', `with (ctx) {
        ${readSource('js/setup-actions.js')}
        return loadSavedSetup;
    }`)(ctx);
    // A valid three-player setup is incompatible with a two-player room.
    const third = JSON.parse(JSON.stringify(custom));
    ['k', 'q', 'r'].forEach((type, column) => {
        third[12][column] = { player: 3, type, contents: [{ player: 3, type }] };
    });
    saved[0].board = third;
    loadSavedSetup(0);
    assert(state.customSetupBoard === custom && ctx.customSetupStatusEl.innerText.includes('same players'),
        'Loading an incompatible saved setup must leave the draft intact');
    saved[0] = { activePlayers: [true, true, false, false], board: custom };
    loadSavedSetup(0);
    assert(state.customSetupBoard !== custom && state.customSetupBoard[0][0].id === 'guest-piece',
        'Compatible saved setups must load as independent drafts');
    const draft = state.customSetupBoard;
    draft[4][0].contents.push({ player: 1, type: 'k' });
    multiplayer.confirmSetup();
    assert(!multiplayer.isEditingSetup(), 'Duplicate Kings are allowed in sandbox placements');
    document.getElementById('btn-mp-setup').handlers.click();
    state.customSetupBoard[4][0].contents.pop();
    state.customSetupBoard[4][1].contents.push({ id: 'stack-pawn', player: 1, type: 'p' });
    state.customSetupBoard[4][3] = { player: 1, type: 'r', contents: [{ player: 1, type: 'r' }] };
    multiplayer.confirmSetup();
    assert(!multiplayer.isEditingSetup(), 'Adjacent towers are allowed in sandbox placements');
    document.getElementById('btn-mp-setup').handlers.click();
    state.customSetupBoard[4][3] = null;
    const paintedMap = {
        biomes: Array.from({ length: 16 }, () => Array(16).fill('plains')),
        provinceResources: Array.from({ length: 16 }, () => [])
    };
    paintedMap.biomes[2][2] = 'mountain';
    paintedMap.provinceResources[0] = [
        { type: 'gold', productionChance: 75, row: 1, column: 1 },
        { type: 'wood', productionChance: 12.5, row: 1, column: 1 }
    ];
    ctx.customMapPreview = { seed: 'painted-map', starting: paintedMap };
    multiplayer.confirmSetup();
    assert(!multiplayer.isEditingSetup() && starts === 0,
        'Confirming placement must return to the lobby without starting');
    document.getElementById('btn-mp-setup').handlers.click();
    state.customSetupBoard[0][0] = null;
    ctx.customMapPreview.starting.biomes[2][2] = 'forest';
    ctx.customMapPreview.starting.provinceResources[0][0].productionChance = 0;
    document.getElementById('btn-custom-setup-back').handlers.click();
    document.getElementById('btn-mp-generate-map').handlers.click();
    assert(!multiplayer.isEditingSetup(), 'Back to lobby must exit the editor');
    document.getElementById('mp-resource-balance').value = 'allow-empty';
    document.getElementById('mp-resource-balance').handlers.change();
    assert(document.getElementById('mp-map-preview-status').innerText.includes('Settings changed'),
        'Changing balance invalidates the lobby preview');
    document.getElementById('mp-resource-balance').value = 'require-all';
    document.getElementById('mp-resource-balance').handlers.change();
    document.getElementById('btn-mp-generate-map').handlers.click();
    const capitalOption = document.getElementById('mp-resource-capitals');
    capitalOption.checked = false;
    capitalOption.handlers.change();
    assert(document.getElementById('btn-mp-start').disabled,
        'Changing capital eligibility invalidates the lobby preview');
    document.getElementById('mp-resource-mode').value = '16';
    document.getElementById('mp-resource-mode').handlers.change();
    assert(capitalOption.checked && capitalOption.disabled, '16-resource mode forces capitals on');
    document.getElementById('mp-resource-mode').value = '12';
    document.getElementById('mp-resource-mode').handlers.change();
    assert(!capitalOption.disabled, 'Other modes allow changing capital eligibility');
    document.getElementById('btn-mp-generate-map').handlers.click();
    guest.close();
    document.getElementById('btn-mp-start').handlers.click();
    assert(starts === 0, 'A custom match must wait for connected players');
    guest.open = true;
    relay.handlers.connection(guest);
    guest.emit('data', { type: 'join', name: 'Guest' });
    document.getElementById('btn-mp-start').handlers.click();
    assert(state.multiplayer && state.round === 1, 'Host should start a multiplayer game');
    assert(starts === 1 && state.board[0][0].id === 'guest-piece' &&
        state.board[0][0].contents[0].experience === 2,
        'Starting must use the confirmed custom board, not discarded edits');
    assert(state.biomes[2][2] === 'mountain' &&
        state.provinceResources[0][0].productionChance === 75 &&
        state.provinceResources[0][1].productionChance === 12.5,
        'Starting must preserve the confirmed edited map and independent resource sites, not discarded edits');
    state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
    state.biomes[0][1] = 'mountain';
    state.hillHeld = [[{ player: 1, ids: ['held-unit'] }]];
    multiplayer.onBoardRendered();
    guest.emit('data', { type: 'commit', gameId: 1, round: 1,
        plan: [{ from: [0, 0], to: [0, 1], pieceId: 'guest-piece' }] });
    assert(!state.committed[1], 'The host must reject plans that enter mountains');
    state.biomes[0][1] = 'plains';
    guest.emit('data', { type: 'join', name: 'Guest' });
    const sync = guest.sent.filter(message => message.type === 'sync' && message.game).pop();
    assert(sync.game.board[0][0].id === 'guest-piece' &&
        sync.game.board[4][1].contents.length === 2,
        'Guests must receive the authoritative custom starting board and stacks');
    assert(sync.game.biomes === state.biomes && sync.game.hillHeld === state.hillHeld,
        'Guest snapshots must include the authoritative terrain and hill history');
    assert(state.resourceMode === '12' && sync.game.resourceMode === '12',
        'The host-selected resource mode must be used and synchronized');
    assert(state.resourceBalance === 'require-all' && sync.game.resourceBalance === 'require-all',
        'The host-selected balance must be used and synchronized');
    assert(state.resourceCapitals === true && sync.game.resourceCapitals === true,
        'Capital eligibility must be used and synchronized');
    assert(sync.game.provinceResources === state.provinceResources &&
        sync.game.lastResourceProductionRound === state.lastResourceProductionRound &&
        sync.game.provinceResources[0][0].productionChance === 75 &&
        sync.game.provinceResources[0][1].productionChance === 12.5 &&
        sync.game.provinceResources[0][0].row === 1 &&
        sync.game.provinceResources[0][0].column === 1,
        'Rejoining guests must receive resource locations, chances and the last production round');
    assert(sync.game.resources[1].gold === 3 && sync.game.resources[0] === null &&
        sync.game.resources[2] === null && sync.game.resources[3] === null,
        'Snapshots must contain only the receiving player resource stockpile');
    assert(sync.game.objectives[1][0].label === 'Guest secret', 'Guest must receive its objectives');
    assert(sync.game.objectives[0].length === 0 &&
        !JSON.stringify(sync).includes('Host secret'), 'Snapshots must not leak another player objective');
    multiplayer.renameMyPlayer('Host Captain');
    assert(ctx.PLAYERS[0].name === 'Host Captain' &&
        guest.sent.filter(message => message.type === 'sync').pop().roster[0].name === 'Host Captain',
        'The host name must be propagated to the room');
    guest.emit('data', { type: 'rename', name: 'Guest Captain' });
    assert(ctx.PLAYERS[1].name === 'Guest Captain' &&
        guest.sent.filter(message => message.type === 'sync').pop().roster[1].name === 'Guest Captain',
        'A guest rename must be accepted for its own room slot and synchronized');
    guest.emit('data', { type: 'capture-choice', gameId: 1, round: 2,
        captureId: 'stale', unitId: 'unit', fate: 'execute' });
    assert(!captureRequest, 'Stale capture choices must be rejected');
    guest.emit('data', { type: 'capture-choice', gameId: 1, round: 1,
        player: 1, captureId: 'battle', unitId: 'unit', fate: 'keep' });
    assert(captureRequest.player === 2 && captureRequest.captureId === 'battle',
        'Capture authority must use the authenticated slot, not a submitted player');
    guest.emit('data', { type: 'prisoner-action', gameId: 1, round: 1,
        player: 1, unitId: 'unit', action: 'release' });
    assert(!prisonerRequest, 'Immediate prisoner-action messages must no longer be accepted');

    guest.emit('data', { type: 'commit', gameId: 1, round: 2, plan: [] });
    assert(!state.committed[1], 'A stale or future turn must be ignored');
    const guestPlan = [{ from: [0, 0], to: [0, 1], pieceId: 'guest-piece' }];
    const guestPiece = state.board[0][0];
    const prisoner = { id: 'guest-prisoner', player: 2, originalPlayer: 1, prisonerOf: 2, type: 'q' };
    guestPiece.contents.push(prisoner);
    guestPiece.contents[0].type = 'n';
    state.round = 2;
    const decision = {
        from: [0, 0], to: [0, 0], pieceId: 'guest-piece', unitId: 'guest-prisoner', prisonerAction: 'release'
    };
    const commitPlan = plan => guest.emit('data', { type: 'commit', gameId: 1, round: 2, plan });
    commitPlan(guestPlan);
    assert(!state.committed[1], 'Even-round movement with a prisoner must be rejected');
    commitPlan([{ ...decision, unitId: 'unit' }]);
    assert(!state.committed[1], 'Normal units cannot receive prisoner actions');
    commitPlan([{ ...decision, prisonerAction: 'invalid' }]);
    assert(!state.committed[1], 'Unknown prisoner fates must be rejected');
    commitPlan([{ ...decision, to: [0, 1] }]);
    assert(!state.committed[1], 'Prisoner actions must be stationary');
    commitPlan([decision, decision]);
    assert(!state.committed[1], 'Duplicate prisoner decisions must be rejected');
    commitPlan([decision, { ...guestPlan[0], isUnmerge: true,
        unitId: prisoner.id, sourcePieceId: 'guest-piece' }]);
    assert(!state.committed[1], 'Prisoners cannot both leave custody and transfer');
    commitPlan([guestPlan[0], decision]);
    assert(state.committed[1] && state.plans[1].length === 2,
        'Movement and a prisoner decision must be accepted regardless of plan order');
    assert(state.board[0][0].contents.includes(prisoner) && state.board[0][0].contents.length === 2,
        'Committing a prisoner action must not apply it immediately');
    assert(state.plans[1][0].contents.length === 1,
        'Host must rebuild movement using the remaining stack');
    assert(state.plans[1][1].prisonerAction === 'release', 'Host must preserve the validated prisoner decision');
    guest.emit('data', { type: 'unlock', gameId: 1, round: 2 });
    assert(!state.committed[1], 'Unlocking allows prisoner decisions to be changed');
    guestPiece.contents.pop();
    guestPiece.contents[0].type = 'p';
    state.round = 1;
    guest.emit('data', { type: 'commit', gameId: 1, round: 1, plan: guestPlan });
    assert(state.committed[1] && resolutions === 0, 'Guest commitment must wait for host');
    const pending = multiplayer.toggleCommit();
    assert(multiplayer.isPendingCommit(), 'Input must be locked while saving');
    assert(savedTurn.p_locked && savedTurn.p_round === 1 && resolutions === 0,
        'Host commitment must be persisted before resolving');
    finishSave();
    await pending;
    assert(resolutions === 1 && state.phase === 'RESOLVING', 'Both commitments must resolve once');
    assert(state.plans[1][0].contents[0].id === 'unit', 'Host must rebuild submitted unit contents');
    guest.emit('data', { type: 'commit', gameId: 1, round: 1, plan: guestPlan });
    assert(resolutions === 1, 'Repeated commitments must not restart resolution');
    state.phase = 'GAME_OVER';
    multiplayer.onNewGameRequested();
    document.getElementById('mp-count').handlers.change({ target: { value: '3' } });
    assert(document.getElementById('mp-setup-status').innerText.includes('before starting'),
        'Changing player count must clear the confirmed placement');
    setupMode.value = 'random';
    setupMode.handlers.change();
    document.getElementById('mp-count').handlers.change({ target: { value: '2' } });
    document.getElementById('btn-mp-generate-map').handlers.click();
    document.getElementById('btn-mp-start').handlers.click();
    assert(starts === 2 && state.board[4][0] === null,
        'Default random mode must not reuse a previously confirmed custom board');
    print('Multiplayer turn checks passed');
}

run().catch(error => {
    printerr(`${error}\n${error.stack || ''}`);
    imports.system.exit(1);
});
