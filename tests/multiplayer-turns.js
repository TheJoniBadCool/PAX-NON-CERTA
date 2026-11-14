// Run with: gjs tests/multiplayer-turns.js
const { GLib } = imports.gi;
const decoder = new TextDecoder();
const [, bytes] = GLib.file_get_contents('js/multiplayer.js');
const source = decoder.decode(bytes);

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function element() {
    const handlers = {};
    const classes = new Set();
    return {
        handlers, style: {}, value: '', innerText: '', innerHTML: '', disabled: false,
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
    committed: [false, false, false, false], phase: 'PLANNING', round: 1
};
let resolutions = 0;
const ctx = {
    document, PaxRelay,
    crypto: { getRandomValues: bytes => bytes.fill(1) },
    window: { addEventListener() {} },
    MutationObserver: class { observe() {} },
    setTimeout: () => 1, clearTimeout() {}, console: { error() {} },
    PLAYERS: [1, 2, 3, 4].map(id => ({ name: `Player ${id}`, color: 'red' })),
    gameState: state,
    mainMenuModal: element(), playerSelectionModal: element(), customSetupModal: element(),
    clashOverlay: element(), battleLogEl: element(), battleCandidatesEl: element(),
    clashResult: element(), battleRollsEl: element(), battleTargetSquare: null,
    mergePrompt: element(), pieceTooltip: element(), btnMergeConfirm: element(),
    btnFinishPlan: element(), btnRestart: element(), activePlayerDescEl: element(),
    hintTextEl: element(), btnStartBattle: element(), btnProceedBattle: element(),
    startNewGame() {
        state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
        state.board[0][0] = { id: 'guest-piece', player: 2, type: 'p' };
        state.plans = [[], [], [], []];
        state.eliminated = [false, false, true, true];
    },
    updatePlayerCards() {}, renderBoard() {}, logAction() {}, showPlayerSelection() {},
    isTowerGateMove: () => true, canMoveWholePiece: () => true,
    getPieceContents: () => [{ id: 'unit', type: 'p' }],
    resolveAllMoves() { resolutions++; state.phase = 'RESOLVING'; return Promise.resolve(); }
};

async function run() {
    const multiplayer = new Function('ctx', `with (ctx) { ${source}\n return Multiplayer; }`)(ctx);
    document.getElementById('mp-name').value = 'Host';
    document.getElementById('btn-mp-create').handlers.click();
    await Promise.resolve();

    const guest = new FakeConnection('guest-id');
    relay.handlers.connection(guest);
    guest.emit('data', { type: 'join', name: 'Guest' });
    document.getElementById('btn-mp-start').handlers.click();
    assert(state.multiplayer && state.round === 1, 'Host should start a multiplayer game');

    guest.emit('data', { type: 'commit', gameId: 1, round: 2, plan: [] });
    assert(!state.committed[1], 'A stale or future turn must be ignored');
    const guestPlan = [{ from: [0, 0], to: [0, 1], pieceId: 'guest-piece' }];
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
    print('Multiplayer turn checks passed');
}

run().catch(error => {
    printerr(error.stack || error.message);
    imports.system.exit(1);
});
