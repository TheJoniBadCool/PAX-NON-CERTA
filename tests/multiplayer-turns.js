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
        querySelector() { return this.firstElementChild; },
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
let nextTimeoutId = 0;
const scheduledTimeouts = [];
class PaxRelay {
    constructor() {
        relay = this;
        this.handlers = {};
        Promise.resolve().then(() => this.handlers.open());
    }
    on(event, handler) { this.handlers[event] = handler; }
    connect() {
        this.connection = new FakeConnection('host-id');
        return this.connection;
    }
    rpc(name, args) {
        assert(name === 'pax_host_turn', 'Host must persist its plan');
        savedTurn = args;
        return new Promise(resolve => { finishSave = resolve; });
    }
    destroy() {
        this.destroyed = true;
        if (this.connection) this.connection.close();
    }
}

const state = {
    board: [], eliminated: [false, false, true, true], plans: [[], [], [], []],
    retreating: [[], [], [], []],
    committed: [false, false, false, false], phase: 'PLANNING', round: 1, boardSize: 16,
    objectives: [
        [{ label: 'Host secret', points: 4 }],
        [{ label: 'Guest secret', points: 3 }], [], []
    ],
    scores: [0, 0, 0, 0]
};
state.resourceMode = '8';
state.capitalTowerIds = [null, null, null, null];
state.horde = [false, false, false, false];
state.deadPieces = [[], [], [], []];
state.resourceBalance = 'off';
state.resourceProductionInterval = 1;
state.provinceResources = [{ type: 'gold', productionChance: 75 }];
state.resources = [{ gold: 99 }, { gold: 3 }, { gold: 0 }, { gold: 0 }];
state.lastResourceProductionRound = 4;
let resolutions = 0;
let captureRequest;
let prisonerRequest;
let spoilsRequest;
let starts = 0;
let agreementsFinished = 0;
let now = 100000;
const ctx = {
    document, PaxRelay,
    Date: { now: () => now },
    BOARD_SIZES: [12, 16],
    REBEL_PLAYER_ID: 5,
    RESOURCE_TYPES: ['horse', 'food', 'wood', 'metal', 'gold', 'stone'].map(key => ({ key })),
    crypto: { getRandomValues: bytes => bytes.fill(1) },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} },
    setTimeout(callback, delay) {
        const timeout = { id: ++nextTimeoutId, callback, delay, cleared: false };
        scheduledTimeouts.push(timeout);
        return timeout.id;
    },
    clearTimeout(id) {
        const timeout = scheduledTimeouts.find(entry => entry.id === id);
        if (timeout) timeout.cleared = true;
    },
    console: { error() {} },
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
    startNewGame(players, board, size, seed, map, startingPosition = 'corner') {
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
        state.phase = startingPosition === 'agreement' ? 'STARTING_POSITION' : 'PLANNING';
        state.startingPosition = startingPosition;
        state.startingProvinces = [null, null, null, null];
        state.startingConfirmed = [false, false, false, false];
        state.diplomacy = ctx.createDiplomacyState();
        state.resourceTrades = [];
        state.nextResourceTradeId = 1;
    },
    updatePlayerCards() {}, renderBoard() {}, logAction() {}, showPlayerSelection() {},
    showCustomSetup(players, board, map) {
        state.activePlayers = players;
        state.customSetupBoard = board || Array.from({ length: 16 }, () => Array(16).fill(null));
        ctx.customMapPreview = map
            ? { seed: 'painted-map', starting: JSON.parse(JSON.stringify(map)) } : null;
        ctx.customSetupModal.classList.remove('hidden');
    },
    isTowerGateMove: () => true, canMoveWholePiece: () => true, getSiegeAtSquare: () => null,
    isPawnRestTurn: () => state.round % 2 === 0, hasPlayerResources: () => true,
    isEliminatedPiece: piece => Boolean(state.eliminated[piece.player - 1]),
    createRandomMapSeed: () => 'test-seed',
    createStartingBoard: () => ({ board: [], biomes: [] }),
    renderMapPreview() {},
    renderStartingPositionSelection() {},
    finishStartingPositionSelection() {
        assert(ctx.allStartingProvincesConfirmed(), 'All players must confirm before agreement completes');
        agreementsFinished++;
        state.phase = 'PLANNING';
    },
    isPassableSquare: (r, c) => state.biomes?.[r]?.[c] !== 'mountain',
    getVisiblePiece: (r, c, player) => {
        const pieces = ctx.getSquarePieces(state.board[r][c]);
        return pieces.find(piece => piece.player === player) || pieces[0] || null;
    },
    getVisiblePieces: (r, c) => ctx.getSquarePieces(state.board[r][c]),
    getPieceContents: piece => piece.contents || [{ id: 'unit', type: 'p' }],
    canUnitsTarget: () => true, isPrisoner: () => false,
    renderCaptureChoices() {}, renderAlliedSpoils() {},
    decideCapture(player, captureId, unitId, fate) {
        captureRequest = { player, captureId, unitId, fate };
        return player === 2;
    },
    decideAlliedSpoils(player, id, action, target) {
        spoilsRequest = { player, id, action, target };
        return player === 2;
    },
    managePrisoner(player, unitId, action) {
        prisonerRequest = { player, unitId, action };
        return player === 2;
    },
    resolveAllMoves() { resolutions++; state.phase = 'RESOLVING'; return Promise.resolve(); }
};
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/planning-timer.js')}
    return { PlanningTimer };
}`)(ctx));
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/game-state.js')}
    ${readSource('js/diplomacy-rules.js')}
    return { createDiplomacyState, getDiplomacyPair, getPendingAllianceRequests, applyDiplomacyAction,
        getPendingResourceTrades, hasPendingPlayerRequests, applyResourceTradeAction };
}`)(ctx));
state.diplomacy = ctx.createDiplomacyState();
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/starting-position.js')}
    return { chooseStartingProvince, confirmStartingProvince, allStartingProvincesConfirmed };
}`)(ctx));
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/setup-utils.js')}
    return { isValidSavedSetup, cloneSetupBoard, updateCapitalResourceOption };
}`)(ctx));
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/board-utils.js')}
    return { towersAreSpaced, getProvinceResources, getProvinceIndex, isTowerPiece,
        cloneBoardWithoutResourceStores, stripResourceStore, stripResourceStoresFromPlan };
}`)({
    gameState: state,
    REBEL_PLAYER_ID: 5,
    getPieceContents: piece => piece.contents,
    getUnitType: unit => unit.type
}));
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/prisoner-rules.js')}
    ${readSource('js/models.js')}
    ${readSource('js/movement-rules.js')}
    return { validatePrisonerPlans, getPlannedPieceContents, isPrisoner, canMoveWholePiece, canMoveHeldUnit,
        getMergedPieceType, getSquarePieces, getPieceAt, getPieceByIdAt, getPiecesAt, arePlayersAllied,
        arePlayersFriendly, putPieceAt, removePieceAt, canUnitsEnterSquare,
        releaseAlliancePrisoners, cancelReleasedPrisonerPlans };
}`)(ctx));
Object.assign(ctx, new Function('ctx', `with (ctx) {
    ${readSource('js/constants.js')}
    ${readSource('js/board-utils.js')}
    ${readSource('js/resource-purchases.js')}
    function getUnitType(unit) { return unit.type; }
    return { getResourceSpending, getResourceHolderForPlayer, getUnitResourceStore, refreshResourceTotals };
}`)(ctx));

async function run() {
    const multiplayer = new Function('ctx', `with (ctx) { ${source}\n return Multiplayer; }`)(ctx);
    ctx.Multiplayer = multiplayer;
    document.getElementById('mp-name').value = 'Host';
    document.getElementById('mp-resource-mode').value = '12';
    document.getElementById('mp-resource-balance').value = 'require-all';
    document.getElementById('mp-resource-capitals').checked = true;
    document.getElementById('mp-resource-production-interval').value = '2';
    document.getElementById('mp-fog-sight').value = 'large';
    document.getElementById('mp-starting-army').value = 'full';
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
    document.getElementById('mp-show-resources-to-others').checked = true;
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
    state.horde[1] = true;
    state.missionBatches = [{ missions: [{ secret: 'Host mission' }] },
        { missions: [{ secret: 'Guest mission' }] }, null, null];
    state.missionPoints = [7, 2, 0, 0];
    guest.emit('data', { type: 'join', name: 'Guest' });
    const sync = guest.sent.filter(message => message.type === 'sync' && message.game).pop();
    sync.game.capitalTowerIds = [...sync.game.capitalTowerIds];
    sync.game.horde = [...sync.game.horde];
    assert(sync.game.board[0][0].id === 'guest-piece' &&
        sync.game.board[4][1].contents.length === 2,
        'Guests must receive the authoritative custom starting board and stacks');
    assert(sync.game.biomes === state.biomes && sync.game.hillHeld === state.hillHeld,
        'Guest snapshots must include the authoritative terrain and hill history');
    assert(sync.game.capitalTowerIds[0] === null && sync.game.horde[1],
        'Guest snapshots must synchronize capital and horde status');
    assert(state.resourceMode === '12' && sync.game.resourceMode === '12',
        'The host-selected resource mode must be used and synchronized');
    assert(state.resourceBalance === 'require-all' && sync.game.resourceBalance === 'require-all',
        'The host-selected balance must be used and synchronized');
    assert(state.resourceCapitals === true && sync.game.resourceCapitals === true,
        'Capital eligibility must be used and synchronized');
    assert(state.resourceProductionInterval === 2 && sync.game.resourceProductionInterval === 2,
        'The host-selected production interval must be used and synchronized');
    assert(state.showResourcesToOthers && sync.game.showResourcesToOthers &&
        sync.game.resources[0].gold === 99 && sync.game.resources[1].gold === 3,
        'The default visible setting shares all resource balances with multiplayer guests');
    assert(state.fogSight === 'large' && sync.game.fogSight === 'large',
        'The host-selected fog sight must be used and synchronized to guests');
    assert(sync.game.provinceResources === state.provinceResources &&
        sync.game.lastResourceProductionRound === state.lastResourceProductionRound &&
        sync.game.provinceResources[0][0].productionChance === 75 &&
        sync.game.provinceResources[0][1].productionChance === 12.5 &&
        sync.game.provinceResources[0][0].row === 1 &&
        sync.game.provinceResources[0][0].column === 1,
        'Rejoining guests must receive resource locations, chances and the last production round');
    document.getElementById('mp-show-resources-to-others').checked = false;
    state.showResourcesToOthers = false;
    multiplayer.syncAlliedState();
    const privateResourcesSync = guest.sent.filter(message => message.type === 'sync' && message.game).pop();
    assert(!privateResourcesSync.game.showResourcesToOthers &&
        privateResourcesSync.game.resources[1].gold === 3 &&
        privateResourcesSync.game.resources[0] === null &&
        privateResourcesSync.game.resources[2] === null &&
        privateResourcesSync.game.resources[3] === null,
        'The hidden setting keeps opponents’ resource balances out of multiplayer snapshots');
    assert(sync.game.objectives[1][0].label === 'Guest secret', 'Guest must receive its objectives');
    assert(sync.game.objectives[0].length === 0 &&
        !JSON.stringify(sync).includes('Host secret'), 'Snapshots must not leak another player objective');
    assert(sync.game.missionBatches[0] === null &&
        sync.game.missionBatches[1].missions[0].secret === 'Guest mission' &&
        sync.game.missionPoints[0] === null && sync.game.missionPoints[1] === 2 &&
        !JSON.stringify(sync).includes('Host mission'), 'Snapshots must keep missions and their permanent points private');
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
    guest.emit('data', { type: 'allied-spoils', gameId: 99, round: 1, id: 'decision', action: 'choose', target: 1 });
    guest.emit('data', { type: 'allied-spoils', gameId: 1, round: 99, id: 'decision', action: 'choose', target: 1 });
    assert(!spoilsRequest, 'Stale game and round spoils decisions must not reach the authority');
    guest.emit('data', { type: 'allied-spoils', gameId: 1, round: 1,
        player: 1, id: 'decision', action: 'choose', target: 2 });
    assert(spoilsRequest.player === 2 && spoilsRequest.id === 'decision' && spoilsRequest.target === 2,
        'Spoils votes must use the authenticated player slot');
    guest.emit('data', { type: 'prisoner-action', gameId: 1, round: 1,
        player: 1, unitId: 'unit', action: 'release' });
    assert(!prisonerRequest, 'Immediate prisoner-action messages must no longer be accepted');

    guest.emit('data', { type: 'commit', gameId: 1, round: 2, plan: [] });
    assert(!state.committed[1], 'A stale or future turn must be ignored');
    const guestPlan = [{ from: [0, 0], to: [0, 1], pieceId: 'guest-piece' }];
    const guestPiece = state.board[0][0];
    const sharedHostArmy = { id: 'shared-host', player: 1, type: 'n',
        contents: [{ id: 'host-unit', player: 1, type: 'n' }] };
    state.board[0][0] = [sharedHostArmy, guestPiece];
    guest.emit('data', { type: 'commit', gameId: 1, round: 1, plan: guestPlan });
    assert(state.committed[1] && state.plans[1][0].contents[0].id === 'unit',
        'Guests can plan moves for a secondary army without using another owner’s units');
    guest.emit('data', { type: 'unlock', gameId: 1, round: 1 });
    guest.emit('data', { type: 'commit', gameId: 1, round: 1,
        plan: [{ ...guestPlan[0], pieceId: sharedHostArmy.id }] });
    assert(!state.committed[1], 'A shared square never grants control of another player’s army');
    state.pendingSpoils = { id: 'shared-spoils', kind: 'castle', participants: [1, 2], choices: { 1: 2 } };
    multiplayer.syncAlliedState();
    const sharedSync = JSON.parse(JSON.stringify(guest.sent.filter(message => message.type === 'sync').pop()));
    assert(sharedSync.game.board[0][0].length === 2 && sharedSync.game.pendingSpoils.choices[1] === 2,
        'Snapshots retain every co-located army and pending agreement votes');
    state.pendingSpoils = null;
    state.board[0][0] = guestPiece;
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
    const groupPlan = { ...guestPlan[0], isUnmerge: true, sourcePieceId: 'guest-piece',
        unitIds: ['unit', prisoner.id], contents: [{ id: 'forged' }], pieceType: 'r' };
    commitPlan([groupPlan]);
    assert(!state.committed[1], 'Grouped resting prisoners must be rejected');
    commitPlan([{ ...groupPlan, unitIds: ['unit', 'unit'] }]);
    assert(!state.committed[1], 'Duplicate members within a group must be rejected');
    commitPlan([{ ...groupPlan, unitIds: ['unit', 'missing'] }]);
    assert(!state.committed[1], 'Unknown group members must be rejected');
    commitPlan([decision, groupPlan]);
    assert(!state.committed[1], 'Grouped prisoners cannot also receive custody decisions');
    const secondFighter = { id: 'second-fighter', player: 2, type: 'b' };
    guestPiece.contents.push(secondFighter);
    const mobileGroup = { ...groupPlan, unitIds: ['unit', 'second-fighter'] };
    commitPlan([mobileGroup, { ...mobileGroup, unitIds: ['unit'], to: [1, 0] }]);
    assert(!state.committed[1], 'The same unit cannot appear in two groups');
    commitPlan([mobileGroup]);
    assert(state.committed[1] && state.plans[1].length === 1, 'Non-pawn groups can move on even rounds');
    assert(state.plans[1][0].contents.length === 2 && state.plans[1][0].pieceType === 'n' &&
        state.plans[1][0].contents[1] === secondFighter,
        'Host must reconstruct group members and display type from authoritative units');
    guest.emit('data', { type: 'unlock', gameId: 1, round: 2 });
    guestPiece.contents.pop();
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
    state.board[1][1] = { id: 'host-king', player: 1, type: 'k', contents: [{
        id: 'host-king-unit', player: 1, type: 'k', resourceStockpile: { gold: 99 }
    }] };
    state.board[1][2] = { id: 'guest-king', player: 2, type: 'k', contents: [{
        id: 'guest-king-unit', player: 2, type: 'k', resourceStockpile: { gold: 3 }
    }] };
    ctx.refreshResourceTotals();
    const tradeMessage = { type: 'resource-trade', gameId: 1, round: 1, target: 0,
        action: 'propose', actor: 0, terms: { give: { gold: 1 }, receive: { gold: 2 } } };
    guest.emit('data', { ...tradeMessage, gameId: 99 });
    guest.emit('data', { ...tradeMessage, round: 99 });
    assert(ctx.getPendingResourceTrades().length === 0, 'Stale match and round exchanges must be ignored');
    guest.emit('data', tradeMessage);
    const tradeId = state.resourceTrades[0].id;
    assert(state.resourceTrades[0].from === 1 && state.resourceTrades[0].to === 0,
        'Exchange senders must come from the authenticated slot, not payload actor');
    guest.emit('data', { ...tradeMessage, action: 'accept', id: tradeId });
    assert(state.resources[0].gold === 99 && state.resourceTrades.length === 1,
        'A guest cannot accept its own proposal');
    state.resourceTrades.push({ id: 500, from: 0, to: 2, give: { gold: 77 }, receive: { wood: 44 } });
    multiplayer.syncAlliedState();
    const tradeSync = JSON.parse(JSON.stringify(guest.sent.filter(message => message.type === 'sync').pop()));
    assert(tradeSync.game.resourceTrades[0].give.gold === 1 &&
        tradeSync.game.resourceTrades[0].receive.gold === 2, 'Participants receive complete exchange terms');
    assert(tradeSync.game.resourceTrades[1].give === undefined &&
        tradeSync.game.resourceTrades[1].receive === undefined, 'Other players never receive private exchange terms');
    state.resourceTrades.pop();
    guest.emit('data', { type: 'diplomacy', gameId: 99, round: 1, target: 0, action: 'request' });
    guest.emit('data', { type: 'diplomacy', gameId: 1, round: 99, target: 0, action: 'request' });
    assert(ctx.getPendingAllianceRequests().length === 0, 'Stale match and round diplomacy must be ignored');
    guest.emit('data', { type: 'diplomacy', gameId: 1, round: 1, target: 0, action: 'request', actor: 0 });
    assert(ctx.getDiplomacyPair(0, 1).requestedBy === 1,
        'The authenticated slot, not the payload actor, owns a diplomacy action');
    guest.emit('data', { type: 'diplomacy', gameId: 1, round: 1, target: 0, action: 'accept' });
    assert(ctx.getDiplomacyPair(0, 1).status === 'war', 'Guests cannot accept their own requests');
    guest.emit('data', { type: 'commit', gameId: 1, round: 1, plan: guestPlan });
    assert(state.committed[1] && resolutions === 0, 'Guest commitment must wait for host');
    const pending = multiplayer.toggleCommit();
    assert(multiplayer.isPendingCommit(), 'Input must be locked while saving');
    assert(savedTurn.p_locked && savedTurn.p_round === 1 && resolutions === 0,
        'Host commitment must be persisted before resolving');
    finishSave();
    await pending;
    assert(resolutions === 0 && state.phase === 'COMMITTED',
        'All committed plans must still wait for alliance responses');
    const diplomacySync = JSON.parse(JSON.stringify(guest.sent.filter(message => message.type === 'sync').pop()));
    assert(diplomacySync.game.diplomacy[0].requestedBy === 1 &&
        diplomacySync.game.diplomacy[0].changedRound === 1, 'Snapshots preserve requests and round locks');
    await multiplayer.requestDiplomacy(1, 'accept');
    assert(resolutions === 0, 'Answering an alliance still waits for the pending exchange');
    assert(await multiplayer.requestResourceTrade(1, 'accept', null, tradeId),
        'A committed host can accept an exchange');
    assert(resolutions === 1 && state.phase === 'RESOLVING', 'Both commitments must resolve once');
    assert(state.resources[0].gold === 98 && state.resources[1].gold === 4,
        'Accepted exchanges transfer both full amounts through host-owned unit storage');
    guest.emit('data', { ...tradeMessage, action: 'accept', id: tradeId });
    assert(state.resources[0].gold === 98, 'Replayed responses cannot transfer resources twice');
    assert(state.plans[1][0].contents[0].id === 'unit', 'Host must rebuild submitted unit contents');
    guest.emit('data', { type: 'commit', gameId: 1, round: 1, plan: guestPlan });
    assert(resolutions === 1, 'Repeated commitments must not restart resolution');
    state.round = 2;
    multiplayer.beginNextRound();
    await multiplayer.requestDiplomacy(1, 'war');
    assert(ctx.getDiplomacyPair(0, 1).status === 'war', 'Host war declarations apply immediately');
    guest.emit('data', { type: 'diplomacy', gameId: 1, round: 2, target: 0, action: 'request' });
    assert(ctx.getPendingAllianceRequests().length === 0, 'War cannot be reversed in the same round');
    state.round = 3;
    multiplayer.beginNextRound();
    await multiplayer.requestDiplomacy(1, 'request');
    assert(await multiplayer.requestResourceTrade(1, 'propose', { give: { gold: 1 }, receive: {} }),
        'Alliance requests and exchanges can be pending together');
    guest.emit('data', { type: 'commit', gameId: 1, round: 3, plan: [] });
    const secondCommit = multiplayer.toggleCommit();
    finishSave();
    await secondCommit;
    assert(resolutions === 1, 'Host requests also block resolution');
    guest.emit('data', { type: 'diplomacy', gameId: 1, round: 3, target: 0, action: 'accept' });
    assert(resolutions === 1, 'A remaining exchange also blocks guest-triggered resolution');
    guest.emit('data', { type: 'resource-trade', gameId: 1, round: 3, target: 0,
        action: 'accept', id: state.resourceTrades[0].id });
    assert(resolutions === 2 && ctx.getDiplomacyPair(0, 1).status === 'allied',
        'A committed guest can accept and start resolution');
    state.round = 4;
    multiplayer.beginNextRound();
    await multiplayer.requestDiplomacy(1, 'war');
    state.round = 5;
    multiplayer.beginNextRound();
    await multiplayer.requestDiplomacy(1, 'request');
    await multiplayer.requestResourceTrade(1, 'propose', { give: { gold: 1 }, receive: {} });
    guest.emit('data', { type: 'commit', gameId: 1, round: 5, plan: [] });
    const thirdCommit = multiplayer.toggleCommit();
    finishSave();
    await thirdCommit;
    guest.close();
    multiplayer.refreshControls();
    assert(!document.getElementById('btn-force-skip').classList.contains('hidden'),
        'Skipping must remain available for a committed disconnected player with pending requests');
    document.getElementById('btn-force-skip').handlers.click();
    assert(resolutions === 3 && ctx.getPendingAllianceRequests().length === 0 &&
        ctx.getDiplomacyPair(0, 1).status === 'war' && state.resourceTrades.length === 0,
        'Skipping disconnected players declines their requests and unblocks resolution');
    guest.open = true;
    relay.handlers.connection(guest);
    guest.emit('data', { type: 'join', name: 'Guest' });
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
        'Random mode must not reuse a previously confirmed custom board');
    assert(state.startingPosition === 'random', 'Random mode must reach board initialization');
    state.phase = 'GAME_OVER';
    multiplayer.onNewGameRequested();
    setupMode.value = 'agreement';
    setupMode.handlers.change();
    assert(document.getElementById('btn-mp-start').disabled, 'Changing starting mode invalidates the preview');
    const startingArmy = document.getElementById('mp-starting-army');
    startingArmy.value = 'default';
    startingArmy.handlers.change();
    assert(document.getElementById('btn-mp-start').disabled,
        'Changing starting army invalidates the preview');
    startingArmy.value = 'full';
    document.getElementById('btn-mp-generate-map').handlers.click();
    document.getElementById('btn-mp-start').handlers.click();
    assert(starts === 3 && state.phase === 'STARTING_POSITION',
        'Agreement must not enter normal planning when the match starts');
    guest.emit('data', { type: 'starting-confirm', gameId: 3 });
    assert(!state.startingConfirmed[1], 'Guest cannot confirm before selecting');
    guest.emit('data', { type: 'starting-province', gameId: 2, province: 5 });
    assert(state.startingProvinces[1] === null, 'Stale match selections must be rejected');
    multiplayer.requestStartingProvince(5);
    guest.emit('data', { type: 'starting-province', gameId: 3, province: 5 });
    assert(state.startingProvinces[1] === null, 'A simultaneous duplicate claim must be rejected by the host');
    multiplayer.requestStartingProvince(null);
    guest.emit('data', { type: 'starting-province', gameId: 3, province: 5, player: 1 });
    assert(state.startingProvinces[1] === 5 && state.startingProvinces[0] === null,
        'Province authority must use the authenticated guest slot');
    guest.emit('data', { type: 'starting-province', gameId: 3, province: null });
    assert(state.startingProvinces[1] === null, 'Guests can deselect before confirmation');
    guest.emit('data', { type: 'starting-province', gameId: 3, province: 5 });
    guest.emit('data', { type: 'starting-confirm', gameId: 3 });
    assert(state.startingConfirmed[1] && agreementsFinished === 0,
        'One confirmation must wait for the other players');
    guest.emit('data', { type: 'starting-province', gameId: 3, province: 6 });
    assert(state.startingProvinces[1] === 5, 'Confirmed guests cannot change provinces');
    guest.emit('data', { type: 'commit', gameId: 3, round: 1, plan: [] });
    assert(!state.committed[1], 'Normal planning is unavailable during province selection');
    guest.close();
    guest.open = true;
    relay.handlers.connection(guest);
    guest.emit('data', { type: 'join', name: 'Guest' });
    const agreementSync = JSON.parse(JSON.stringify(guest.sent.filter(message => message.type === 'sync').pop()));
    assert(agreementSync.game.phase === 'STARTING_POSITION' &&
        agreementSync.game.startingProvinces[1] === 5 && agreementSync.game.startingConfirmed[1],
        'Rejoining guests must recover their province and confirmation');
    assert(agreementSync.game.startingArmy === 'full',
        'Rejoining guests must recover the host-selected starting army');
    multiplayer.requestStartingProvince(6);
    multiplayer.requestStartingConfirmation();
    assert(agreementsFinished === 1 && state.phase === 'PLANNING',
        'The final confirmation begins play exactly once');
    guest.emit('data', { type: 'starting-confirm', gameId: 3 });
    assert(agreementsFinished === 1, 'Duplicate confirmations must not restart play');

    state.planningTimeSeconds = 5;
    state.round = 1;
    state.plans = [[], [], [], []];
    state.committed = [false, false, false, false];
    ctx.PlanningTimer.start();
    const deadline = state.planningDeadline;
    state.board[0][0] = { id: 'timed-guest', player: 2, type: 'n',
        contents: [{ id: 'timed-unit', player: 2, type: 'n' }] };
    const timedPlan = [{ pieceId: 'timed-guest', from: [0, 0], to: [0, 1] }];
    guest.emit('data', { type: 'draft', gameId: 3, round: 1, plan: [] });
    assert(!state.committed[1], 'Draft updates do not commit a player');
    guest.emit('data', { type: 'draft', gameId: 3, round: 1, plan: timedPlan });
    assert(state.plans[1][0].pieceId === 'timed-guest', 'The host retains the latest validated private draft');
    multiplayer.onBoardRendered();
    guest.close();
    ctx.getDiplomacyPair(0, 1).requestedBy = 1;
    state.resourceTrades = [{ id: 777, from: 0, to: 1, give: { gold: 1 }, receive: {} }];
    now = deadline;
    const previousResolutions = resolutions;
    ctx.PlanningTimer.refresh();
    assert(state.committed[0] && state.committed[1] && resolutions === previousResolutions + 1,
        'The host auto-commits all active players at the exact deadline, including disconnected players');
    assert(state.plans[1][0].pieceId === 'timed-guest', 'Expiration commits the last received draft, not an empty plan');
    assert(ctx.getPendingAllianceRequests().length === 0 && state.resourceTrades.length === 0,
        'Expiration declines unanswered alliance and exchange requests and allows resolution');
    ctx.PlanningTimer.refresh();
    assert(resolutions === previousResolutions + 1, 'Timer expiration resolves only once');
    state.round++;
    multiplayer.beginNextRound();
    assert(state.planningDeadline === now + 5000 && state.phase === 'PLANNING',
        'Every online round receives a fresh simultaneous deadline');
    state.eliminated[0] = true;
    state.phase = 'COMMITTED';
    now += 5000;
    ctx.PlanningTimer.refresh();
    assert(resolutions === previousResolutions + 2 && state.committed[1],
        'An eliminated host still enforces the deadline for surviving players');
    ctx.PlanningTimer.stop();

    document.getElementById('mp-code').value = 'ABCDE';
    document.getElementById('btn-mp-join').handlers.click();
    await Promise.resolve();
    state.fogSight = 'small';
    state.horde[1] = false;
    relay.connection.emit('data', sync);
    assert(state.fogSight === 'large', 'A guest must restore the host-selected fog sight from a snapshot');
    assert(state.horde[1], 'Guests must restore horde status from a snapshot');
    relay.handlers.error({ type: 'network', message: 'Temporary interruption' });
    assert(relay.connection.open, 'A relay error can schedule reconnect while its connection is still open');
    const retry = scheduledTimeouts.filter(timeout => timeout.delay === 3000).at(-1);
    assert(retry && !retry.cleared, 'A joined guest schedules a retry after connection loss');
    retry.callback();
    await Promise.resolve();
    assert(!scheduledTimeouts.some(timeout => timeout.delay === 3000 && !timeout.cleared),
        'Replacing a disconnected relay must not schedule a competing retry');
    relay.connection.emit('data', sharedSync);
    assert(ctx.getPiecesAt(0, 0).length === 2 && state.pendingSpoils.id === 'shared-spoils' &&
        state.pendingSpoils.choices[1] === 2, 'Rejoining guests recover shared cells and in-progress votes');
    multiplayer.requestAlliedSpoils('shared-spoils', 'choose', 2);
    const guestSpoils = relay.connection.sent.at(-1);
    assert(guestSpoils.type === 'allied-spoils' && guestSpoils.gameId === 1 && guestSpoils.round === 1 &&
        guestSpoils.target === 2, 'Guest spoils decisions carry the current game and round');
    relay.connection.emit('data', diplomacySync);
    assert(ctx.getDiplomacyPair(0, 1).requestedBy === 1 && ctx.getDiplomacyPair(0, 1).changedRound === 1,
        'Clients restore pending requests and same-round locks on reconnect');
    await multiplayer.requestDiplomacy(0, 'decline');
    const diplomacyRequest = relay.connection.sent.at(-1);
    assert(diplomacyRequest.type === 'diplomacy' && diplomacyRequest.target === 0 &&
        diplomacyRequest.action === 'decline' && diplomacyRequest.gameId === 1 && diplomacyRequest.round === 1,
        'Guest diplomacy messages carry their target and current match/round identity');
    relay.connection.emit('data', tradeSync);
    assert(state.resourceTrades[0].id === tradeId && state.resourceTrades[0].receive.gold === 2,
        'Reconnect snapshots restore pending exchanges with their original identity and amounts');
    await multiplayer.requestResourceTrade(0, 'cancel', null, tradeId);
    const tradeRequest = relay.connection.sent.at(-1);
    assert(tradeRequest.type === 'resource-trade' && tradeRequest.target === 0 &&
        tradeRequest.action === 'cancel' && tradeRequest.id === tradeId &&
        tradeRequest.gameId === 1 && tradeRequest.round === 1,
        'Guest exchange messages carry proposal, match, and round identities');
    relay.connection.emit('data', diplomacySync);
    const releaseSync = JSON.parse(JSON.stringify(diplomacySync));
    releaseSync.game.phase = 'PLANNING';
    releaseSync.committed[releaseSync.you] = false;
    const freedUnit = { id: 'freed-on-alliance', player: 2, type: 'n' };
    releaseSync.game.retreating = [[], [{
        player: 2, released: true, battleSquare: [0, 0], reentryRound: 4, contents: [freedUnit]
    }], [], []];
    state.plans[1] = [
        { prisonerAction: 'execute', unitId: freedUnit.id },
        { isUnmerge: true, unitIds: [freedUnit.id] },
        { pieceId: 'emptied-stack', contents: [freedUnit] },
        { pieceId: 'unaffected-stack', contents: [{ id: 'still-here', player: 2, type: 'n' }] }
    ];
    relay.connection.emit('data', releaseSync);
    assert(state.plans[1].length === 1 && state.plans[1][0].pieceId === 'unaffected-stack',
        'Alliance releases must cancel conflicting private guest plans, not just host plans');
    state.selectedSquare = [1, 1];
    relay.connection.emit('data', releaseSync);
    assert(state.selectedSquare !== null, 'Repeated release snapshots must not keep clearing guest selections');
    const oldSnapshot = { ...sync, game: { ...sync.game } };
    delete oldSnapshot.game.fogSight;
    relay.connection.emit('data', oldSnapshot);
    assert(state.fogSight === 'medium', 'Older snapshots must retain the original Medium sight rules');
    relay.connection.emit('data', sync);
    assert(state.fogSight === 'large', 'Reconnecting guests must restore the host-selected fog sight');
    relay.connection.emit('data', agreementSync);
    assert(state.phase === 'STARTING_POSITION' && state.startingConfirmed[1] &&
        state.startingProvinces[1] === 5, 'Clients must restore authoritative agreement state');
    multiplayer.requestStartingProvince(null);
    multiplayer.requestStartingConfirmation();
    const requests = relay.connection.sent.slice(-2);
    assert(requests[0].type === 'starting-province' && requests[0].province === null &&
        requests[1].type === 'starting-confirm' && requests.every(message => message.gameId === 3),
        'Client selection and confirmation requests must carry the current match identity');

    const timedSync = JSON.parse(JSON.stringify(sync));
    timedSync.game.phase = 'PLANNING';
    timedSync.committed = [false, false, true, true];
    timedSync.game.planningTimeSeconds = 5;
    timedSync.hostNow = 5000;
    timedSync.game.planningDeadline = 10000;
    timedSync.myPlan = [{ pieceId: 'restored-draft' }];
    relay.connection.emit('data', timedSync);
    assert(!ctx.PlanningTimer.expired() && document.getElementById('planning-countdown').innerText.endsWith('0:05'),
        'Guest clocks use host time even with a different local clock');
    assert(state.plans[1][0].pieceId === 'restored-draft', 'Rejoining restores the latest host-received private draft');
    state.plans[1] = [{ pieceId: 'draft-marker' }];
    multiplayer.onBoardRendered();
    const draftMessage = relay.connection.sent.at(-1);
    assert(draftMessage.type === 'draft' && draftMessage.plan[0].pieceId === 'draft-marker',
        'Timed guests send private drafts to the host before committing');
    const sentCount = relay.connection.sent.length;
    multiplayer.onBoardRendered();
    assert(relay.connection.sent.length === sentCount, 'Unchanged drafts are not sent repeatedly');
    now += 1000;
    timedSync.hostNow += 1000;
    relay.connection.emit('data', timedSync);
    assert(state.plans[1][0].pieceId === 'draft-marker', 'Routine snapshots preserve unsent local editing');
    assert(document.getElementById('planning-countdown').innerText.endsWith('0:04'),
        'Repeated snapshots do not restart the deadline');
    now += 4000;
    ctx.PlanningTimer.refresh();
    await multiplayer.toggleCommit();
    assert(document.getElementById('planning-countdown').innerText.endsWith('0:00') && ctx.btnFinishPlan.disabled,
        'Guests cannot edit or unlock at expiry while waiting for the host snapshot');
    print('Multiplayer turn checks passed');
}

run().catch(error => {
    printerr(`${error}\n${error.stack || ''}`);
    imports.system.exit(1);
});
