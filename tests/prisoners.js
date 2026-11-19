// Run with: node tests/prisoners.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element() {
    const classes = new Set();
    const handlers = {};
    let html = '';
    return {
        innerText: '', style: {}, children: [], disabled: false, handlers, queries: {},
        offsetWidth: 24, offsetHeight: 24, offsetTop: 0, offsetLeft: 0, clientWidth: 640, clientHeight: 640,
        set innerHTML(value) { html = value; this.children = []; },
        get innerHTML() { return html; },
        classList: {
            add(value) { classes.add(value); }, remove(value) { classes.delete(value); },
            contains(value) { return classes.has(value); },
            toggle(value, force) { if (force) classes.add(value); else classes.delete(value); }
        },
        addEventListener(event, handler) { (handlers[event] ||= []).push(handler); },
        querySelectorAll(selector) { return this.queries[selector] || []; },
        setAttribute(name, value) { this[name] = value; }, getAttribute() { return 'false'; },
        contains(target) { return this === target || Object.values(this.queries).some(list => list.includes(target)); },
        appendChild(child) { this.children.push(child); },
        remove() {}
    };
}
const elements = new Map();
const logs = [];
const windowHandlers = {};
const context = vm.createContext({
    console, Math: Object.create(Math),
    document: {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        },
        createElement: element, querySelectorAll() { return []; }
    },
    window: { addEventListener(name, handler) { windowHandlers[name] = handler; } },
    setTimeout(fn) { fn(); }, clearTimeout() {}, requestAnimationFrame() {},
    bindBoardInteractions() {}, renderBoard() {}, renderBattleCandidates() {}, renderBattleRolls() {},
    renderCaptureChoices() {}, renderRetreatTable() {}, updatePlayerCards() {},
    logAction(message) { logs.push(message); }, logRoundHeader() {}, saveCustomSetup() {},
    updateRoundDisplay() {}, showPrivacyOverlay() {},
    Multiplayer: { broadcastResolutionStart() {}, beginNextRound() {}, isPendingCommit() { return false; } }
});
['constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'movement-rules',
    'planning-rules', 'battle-rules', 'retreat-rules', 'prisoner-rules', 'objective-rules', 'siege-rules',
    'allied-resolution', 'game']
    .forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`({
    state: gameState, createUnit, getBattleCandidateData, casualtyChance,
    resolveCandidateCasualties, getValidMovesForPiece, canMoveWholePiece, canMoveHeldUnit,
    beginCaptureChoices, decideCapture, managePrisoner, processRetreatsAtRoundStart,
    rejectPrisonerMoveConflicts, applySiegeRoundProgress, processCollisionGroup,
    processSallyBattle, getUnitDisplayClass, prisonerChain, isValidSallyOutPlan, updateObjectiveScores,
    showPieceTooltip, resolvePrisonerPlans, validatePrisonerPlans, resolveAllMoves, getAllPlannedMoves,
    handleSquareAction, handleSquareClick, animatePlannedMovements,
    queueHeldGroupPlan, detachHeldGroup, getPendingHeldIndices
})`, context);
const state = api.state;
const unit = (player, type, id) => api.createUnit(player, type, id, id, 3, 3);
const captive = (origin = 2, owner = 1, type = 'p', id = 'captive') =>
    ({ ...unit(owner, type, id), originalPlayer: origin, prisonerOf: owner });
const piece = (player, contents, id = `piece-${player}`) =>
    ({ id, pieceId: id, player, type: contents[0].type, pieceType: contents[0].type, contents });
function reset() {
    state.reset();
    state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
    logs.length = 0;
    context.Math.random = () => 0.99;
}
function keepAll() {
    const pending = state.pendingCapture;
    for (const entry of [...pending.contents]) {
        assert.equal(api.decideCapture(pending.player, pending.id, entry.id, 'keep'), true);
    }
}
async function fight(candidates, target = [8, 8], sally = false) {
    state.phase = 'RESOLVING';
    const result = sally
        ? api.processSallyBattle({ candidates, targetSquare: target })
        : api.processCollisionGroup({ type: 'TARGET', candidates, targetSquare: target });
    if (elements.get('btn-start-battle').onclick) elements.get('btn-start-battle').onclick();
    return { result };
}
async function run() {
    reset();
    const prisoner = captive();
    const fighter = unit(1, 'q', 'fighter');
    const enemy = piece(2, [unit(2, 'b', 'enemy')]);
    let data = api.getBattleCandidateData({ candidates: [piece(1, [fighter, prisoner]), enemy] });
    const baseline = api.getBattleCandidateData({ candidates: [piece(1, [fighter]), enemy] });
    assert.equal(data[0].weight, baseline[0].weight, 'Prisoners must not alter league or bonuses');
    assert.equal(api.casualtyChance(fighter, 0, true, false, [fighter, prisoner]),
        api.casualtyChance(fighter, 0, true, false), 'Prisoners must not protect lone royals');
    data = api.getBattleCandidateData({ candidates: [piece(1, [prisoner]), enemy] });
    assert.equal(data[0].probability, 0);
    assert.equal(data[1].probability, 1);
    context.Math.random = () => 0;
    let result = api.resolveCandidateCasualties(piece(1, [prisoner]), 0, true, true, []);
    assert.equal(result.captured[0], prisoner);
    assert.equal(result.survivors.length + result.casualties.length, 0);
    result = api.resolveCandidateCasualties(piece(1, [prisoner]), 1, false, true, []);
    assert.equal(result.survivors[0], prisoner);
    assert.equal(prisoner.experience, 3);

    state.board[8][8] = piece(1, [prisoner]);
    state.board[8][9] = enemy;
    assert(!api.getValidMovesForPiece(8, 8).some(([r, c]) => r === 8 && c === 9));
    assert(api.getValidMovesForPiece(8, 8).some(([r, c]) => r === 7 && c === 8));
    state.round = 2;
    assert.equal(api.canMoveWholePiece(piece(1, [fighter, prisoner])), false);
    assert.equal(api.canMoveHeldUnit(prisoner), false);
    assert.equal(api.canMoveHeldUnit(fighter), true);
    assert.equal(api.getUnitDisplayClass(prisoner, 1), 'piece-p2');
    assert(api.prisonerChain(prisoner).includes('Prisoner of P1'));

    reset();
    state.phase = 'RESOLVING';
    api.beginCaptureChoices(1, [unit(2, 'k', 'king'), unit(2, 'p', 'pawn')], [8, 8]);
    const pendingId = state.pendingCapture.id;
    assert.equal(api.decideCapture(2, pendingId, 'king', 'execute'), false);
    assert.equal(api.decideCapture(1, 'stale', 'king', 'keep'), false);
    assert.equal(api.decideCapture(1, pendingId, 'king', 'keep'), true);
    assert.equal(state.board[8][8].contents[0].originalPlayer, 2);
    assert.equal(state.board[8][8].contents[0].id, 'king');
    state.objectives[0] = [{ kind: 'death', unitId: 'king', points: 3 }];
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0, 'Captured kings must remain alive for objectives');
    assert.equal(api.decideCapture(1, pendingId, 'pawn', 'execute'), true);
    assert.equal(state.deadPieces[1][0].id, 'pawn');
    assert.equal(state.pendingCapture, null);
    state.phase = 'PLANNING';
    state.round = 2;
    logs.length = 0;
    assert.equal(api.managePrisoner(2, 'king', 'release'), false);
    state.plans[0] = [{ isUnmerge: true, unitId: 'king' }];
    assert.equal(api.managePrisoner(1, 'king', 'release'), false, 'A prisoner cannot move and be released');
    state.plans[0] = [];
    assert.equal(api.managePrisoner(1, 'king', 'release'), true);
    assert(state.board[8][8], 'Queued release must leave the prisoner on the board');
    assert.equal(state.retreating[1].length, 0, 'Queued release must not start re-entry early');
    assert.equal(logs.length, 0, 'Private queued actions must not be announced before resolution');
    assert.equal(api.getAllPlannedMoves().length, 0, 'Prisoner decisions are not movement arrows');
    state.phase = 'RESOLVING';
    assert.equal(api.resolvePrisonerPlans(), 1);
    assert.equal(state.board[8][8], null);
    assert.equal(state.retreating[1][0].reentryRound, 5);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0, 'Released kings awaiting re-entry must remain alive');
    state.board = state.board.map(row => row.map(() => piece(1, [unit(1, 'p', 'blocker')])));
    state.round = 5;
    api.processRetreatsAtRoundStart();
    assert.equal(state.retreating[1][0].reentryRound, 6, 'Blocked releases wait rather than die');
    assert.equal(state.deadPieces[1].length, 1, 'Blocked releases must not add deaths');
    state.board = state.board.map(row => row.map(() => null));
    state.round = 6;
    state.eliminated[1] = true;
    api.processRetreatsAtRoundStart();
    const returned = state.board.flat().find(Boolean);
    assert.equal(returned.player, 2);
    assert.equal(returned.contents[0].prisonerOf, undefined);
    assert.equal(returned.contents[0].routedStacks, 0);
    assert.equal(returned.isGray, true);

    reset();
    state.phase = 'RESOLVING';
    api.beginCaptureChoices(2, [captive()], [8, 8]);
    assert.equal(state.pendingCapture, null, 'Original owner automatically rescues recaptured units');
    assert.equal(state.board[8][8].contents[0].prisonerOf, undefined);
    reset();
    state.phase = 'RESOLVING';
    api.beginCaptureChoices(1, [unit(2, 'q', 'execute-later')], [8, 8]);
    keepAll();
    state.phase = 'PLANNING';
    assert.equal(api.managePrisoner(1, 'execute-later', 'execute'), true);
    assert.equal(state.deadPieces[1].length, 0, 'Queued execution must not kill immediately');
    assert.equal(api.managePrisoner(1, 'execute-later', 'release'), true);
    assert.equal(state.plans[0].length, 1, 'Changing fate replaces the previous decision');
    assert.equal(state.plans[0][0].prisonerAction, 'release');
    elements.get('btn-clear-plan').handlers.click[0]();
    assert.equal(state.plans[0].length, 0, 'Reset Plans cancels prisoner decisions');
    assert(state.board[8][8], 'Reset Plans must keep the prisoner alive');
    api.managePrisoner(1, 'execute-later', 'execute');
    state.phase = 'RESOLVING';
    api.resolvePrisonerPlans();
    assert.equal(state.deadPieces[1][0].id, 'execute-later', 'Execution belongs to the original player');

    reset();
    const a = { ...piece(1, [captive()]), from: [8, 7], to: [8, 8] };
    const b = { ...piece(2, [captive(3, 2, 'q', 'other')]), from: [8, 9], to: [8, 8] };
    state.board[8][7] = a;
    state.board[8][9] = b;
    api.rejectPrisonerMoveConflicts([a, b]);
    assert(a.invalid && b.invalid, 'Opposing prisoner-only arrivals must be cancelled');
    a.invalid = b.invalid = false;
    state.board[8][8] = piece(3, [unit(3, 'p', 'defender')]);
    api.rejectPrisonerMoveConflicts([a, b]);
    assert(!a.invalid && !b.invalid, 'A stationary fighter may capture both prisoner arrivals');
    a.to = [8, 9]; b.to = [8, 7];
    api.rejectPrisonerMoveConflicts([a, b]);
    assert(a.invalid && b.invalid, 'Prisoner swaps must be cancelled');

    reset();
    const defender = { ...piece(1, [captive(3, 1)]), from: [8, 8], to: [8, 8], isStationary: true };
    const attacker = { ...piece(2, [unit(2, 'b', 'attacker')]), from: [8, 9], to: [8, 8] };
    Object.assign(attacker.contents[0], { experience: 0, routedStacks: 3, routedUntilRound: 10 });
    state.board[8][8] = defender;
    state.board[8][9] = attacker;
    let captureRolls = 0;
    context.Math.random = () => { captureRolls++; return 0; };
    let battle = await fight([defender, attacker]);
    assert.equal(captureRolls, 0, 'Unopposed captures must not roll a battle or casualties');
    assert.equal(state.board[8][8].contents[0].experience, 0, 'Capturing non-fighters must not award battle XP');
    assert.equal(state.pendingCapture.player, 2, 'Zero roll must never select a zero-odds prisoner');
    elements.get('btn-proceed-battle').onclick();
    assert.equal(elements.get('clash-overlay').classList.contains('hidden'), false,
        'Proceed must wait for prisoner decisions');
    keepAll();
    elements.get('btn-proceed-battle').onclick();
    await battle.result;
    assert.equal(state.board[8][8].contents.find(entry => entry.id === 'captive').prisonerOf, 2);
    assert.equal(state.retreating.flat().length, 0);

    reset();
    const winner = { ...piece(1, [unit(1, 'p', 'winner')]), from: [8, 7], to: [8, 8] };
    const mixed = { ...piece(2, [unit(2, 'p', 'loser'), captive(3, 2)]),
        from: [8, 8], to: [8, 8], isStationary: true };
    state.board[8][7] = winner;
    state.board[8][8] = mixed;
    let rolls = 0;
    context.Math.random = () => rolls++ === 0 ? 0 : 0.99;
    battle = await fight([winner, mixed]);
    assert.equal(state.retreating[1][0].contents.length, 1, 'Only normal losing survivors route');
    assert.equal(state.pendingCapture.contents[0].id, 'captive');
    keepAll();
    elements.get('btn-proceed-battle').onclick();
    await battle.result;
    assert.equal(state.board[8][8].contents.length, 2);

    reset();
    const swapWinner = { ...piece(1, [unit(1, 'p', 'swap-winner')]), from: [8, 7], to: [8, 8] };
    const swapLoser = { ...piece(2, [captive(3, 2, 'q', 'swap-prisoner')]), from: [8, 8], to: [8, 7] };
    state.board[8][7] = swapWinner;
    state.board[8][8] = swapLoser;
    const swap = { type: 'SWAP', candidates: [swapWinner, swapLoser] };
    state.phase = 'RESOLVING';
    context.Math.random = () => 0;
    const swapped = api.processCollisionGroup(swap);
    if (elements.get('btn-start-battle').onclick) elements.get('btn-start-battle').onclick();
    keepAll();
    elements.get('btn-proceed-battle').onclick();
    await swapped;
    assert.equal(swap.survivor.contents.length, 2, 'Later destination battles must include captured prisoners');
    assert.equal(swap.survivor.contents[1].prisonerOf, 1);

    reset();
    const towerUnit = { ...unit(1, 'r', 'tower'), gate: [0, 1] };
    const tower = piece(1, [towerUnit, captive(3, 1)]);
    state.board[8][8] = tower;
    state.sieges = [{ id: 'siege', towerSquare: [8, 8], startedRound: 0, towerTimer: 0,
        attackers: [{ pieceId: 'catapult', player: 2, sourceSquare: [8, 9], timer: 0 }] }];
    state.board[8][9] = piece(2, [unit(2, 'p', 'catapult-unit')], 'catapult');
    api.applySiegeRoundProgress();
    assert.equal(tower.contents.length, 2, 'Siege attrition must never kill prisoners');
    assert.equal(api.isValidSallyOutPlan(tower, [8, 8], [8, 8], 1, 'siege'), false,
        'Prisoners alone cannot sally out');
    elements.get('board').children[8 * state.boardSize + 9] = element();
    for (const multiplayer of [false, true]) {
        for (const round of [3, 4]) {
            state.multiplayer = multiplayer;
            state.round = round;
            state.phase = 'PLANNING';
            state.turnIndex = 1;
            state.plans = [[], [], [], []];
            const attacker = state.sieges[0].attackers[0];
            attacker.timer = 1;
            elements.get('piece-tooltip').classList.add('hidden');
            api.handleSquareClick(8, 9);
            assert.equal(elements.get('btn-storm-castle').hidden, true,
                'Storm Castle must be hidden until the catapult is ready');
            attacker.timer = 0;
            elements.get('piece-tooltip').classList.add('hidden');
            api.handleSquareClick(8, 9);
            assert.equal(elements.get('btn-storm-castle').hidden, false,
                'A ready catapult must expose Storm Castle in its automatically opened popup');
            assert.equal(state.validMoves.length, 0, 'The popup clears ordinary destination selection');
            elements.get('btn-storm-castle').onclick();
            assert.equal(state.plans[1].length, 1);
            const assault = state.plans[1][0];
            assert.equal(assault.siegeAssault, true);
            assert.equal(assault.siegeId, 'siege');
            assert.equal(assault.pieceId, 'catapult');
            assert.deepEqual(Array.from(assault.from), [8, 9]);
            assert.deepEqual(Array.from(assault.to), [8, 8]);
            assert.equal(elements.get('piece-tooltip').classList.contains('hidden'), true);
            assert.equal(state.selectedSquare, null);
            assert.equal(elements.get('hint-text').innerText, 'Assault queued!');

            api.handleSquareClick(8, 9);
            elements.get('btn-storm-castle').onclick();
            assert.equal(state.plans[1].length, 1, 'Repeated assault orders must replace, not duplicate');
            api.handleSquareClick(8, 9);
            attacker.timer = 1;
            elements.get('btn-storm-castle').onclick();
            assert.equal(state.plans[1].length, 1, 'A stale popup must not queue an unready assault');
            assert(elements.get('hint-text').innerText.startsWith('Assault unavailable:'));
        }
    }
    state.multiplayer = false;
    state.turnIndex = 0;
    state.round = 1;
    state.plans = [[], [], [], []];
    state.sieges[0].attackers[0].timer = 0;
    tower.contents.push(unit(1, 'p', 'guard'));
    const sallyDefender = { ...tower, contents: tower.contents.slice(1), from: [8, 8], to: [8, 8],
        isSallyDefender: true };
    const catapult = { ...state.board[8][9], from: [8, 9], to: [8, 9], isSallyAttacker: true };
    rolls = 0;
    context.Math.random = () => rolls++ === 0 ? 0 : 0.99;
    battle = await fight([catapult, sallyDefender], [8, 8], true);
    assert.equal(state.pendingCapture.destination[1], 9, 'Sally winner keeps prisoners at the catapult');
    assert(!tower.contents.some(entry => entry.id === 'captive'), 'Losing Tower must surrender its prisoners');
    keepAll();
    elements.get('btn-proceed-battle').onclick();
    await battle.result;
    assert(state.board[8][9].contents.some(entry => entry.prisonerOf === 2));

    reset();
    state.board[8][8] = piece(1, [unit(1, 'p', 'guard'), captive()]);
    const popup = elements.get('piece-tooltip');
    const held = [element(), element()];
    held.forEach((button, i) => { button.dataset = { heldIndex: String(i) }; });
    const execute = element();
    execute.dataset = { prisonerIndex: '1', action: 'execute' };
    popup.queries['.held-piece-button'] = held;
    popup.queries['.prisoner-action-button'] = [execute];
    api.showPieceTooltip(8, 8, element());
    const popupHtml = elements.get('piece-tooltip-units').innerHTML;
    const actionIcons = [...popupHtml.matchAll(/class="prisoner-action-button"[^>]*>(.*?)<\/button>/gs)];
    assert.equal(actionIcons.length, 2, 'Prisoners need execute and release controls');
    assert(actionIcons.every(match => match[1].startsWith('<svg') && match[1].endsWith('</svg>')),
        'Prisoner action buttons must contain icons only');
    assert(!popupHtml.includes('>Prisoner of P1'), 'Prisoners must not show custody text under their icons');
    assert(popupHtml.includes('aria-label="Execute captive"') && popupHtml.includes('aria-label="Release captive"'),
        'Icon-only actions must retain accessible labels');
    assert(actionIcons[0][1].includes('<circle cx="8" cy="10"'), 'Execute must use the skull icon');
    assert(actionIcons[1][1].includes('M5 22V3') && actionIcons[1][1].includes('fill="#ffffff"'),
        'Release must use a white flag icon');
    assert.equal(execute.handlers.click.length, 1, 'Popup actions must attach once, not once per held unit');
    execute.handlers.click[0]({ stopPropagation() {} });
    assert.equal(state.board[8][8].contents.length, 2, 'Popup execution must be queued');
    state.phase = 'RESOLVING';
    api.resolvePrisonerPlans();
    assert.equal(state.board[8][8].contents.length, 1);
    assert.equal(state.deadPieces[1][0].id, 'captive');

    reset();
    state.round = 2;
    state.board[8][8] = piece(1, [captive(), unit(1, 'n', 'moving-guard')]);
    api.managePrisoner(1, 'captive', 'execute');
    assert.equal(api.canMoveWholePiece(state.board[8][8]), true,
        'After queued removal the remaining non-pawn stack can move on an even round');
    assert.equal(api.canMoveHeldUnit(state.board[8][8].contents[0]), false);
    state.selectedSquare = [8, 8];
    state.validMoves = [[8, 9]];
    api.handleSquareAction(8, 9);
    assert.equal(state.plans[0].filter(plan => plan.prisonerAction).length, 1,
        'Queuing movement must preserve the prisoner decision');
    state.multiplayer = true;
    let animated = false;
    context.animatePlannedMovements = async moves => {
        animated = true;
        assert.equal(state.deadPieces[1][0].id, 'captive', 'Execution must precede movement animation');
        assert(logs[0].includes('PRISONER ACTIONS') && logs[1].includes('executed'),
            'Executions must be announced before movement');
        assert.equal(moves.length, 1, 'Prisoner actions must not become movement intents');
        assert.equal(moves[0].contents.length, 1, 'Movement must use only surviving stack contents');
        assert.equal(moves[0].pieceType, 'n', 'Movement artwork must follow the remaining stack');
    };
    await api.resolveAllMoves();
    assert(animated);
    assert.equal(state.board[8][8], null);
    assert.equal(state.board[8][9].contents[0].id, 'moving-guard');
    assert.equal(state.plans[0].length, 0);

    reset();
    state.board[8][8] = piece(1, [captive(), unit(1, 'n', 'released-guard')]);
    state.plans[0].push({
        pieceId: 'piece-1', from: [8, 8], to: [8, 9], pieceType: 'p',
        contents: state.board[8][8].contents
    });
    api.managePrisoner(1, 'captive', 'release');
    context.animatePlannedMovements = async moves => {
        assert.equal(state.retreating[1][0].contents[0].id, 'captive',
            'Release must precede movement even when it was planned after the move');
        assert.equal(state.retreating[1][0].battleSquare[1], 8, 'Re-entry uses the original custody square');
        assert.equal(moves[0].contents.length, 1);
        assert(logs[1].includes('released'), 'Releases must be announced');
    };
    await api.resolveAllMoves();
    assert.equal(state.board[8][9].contents[0].id, 'released-guard');
    assert.equal(state.retreating[1][0].reentryRound, 4, 'Release timing starts in resolution');

    reset();
    state.board[8][8] = piece(1, [captive()]);
    state.plans[0].push({
        pieceId: 'piece-1', from: [8, 8], to: [8, 9], pieceType: 'p',
        contents: state.board[8][8].contents
    });
    api.managePrisoner(1, 'captive', 'execute');
    context.animatePlannedMovements = async moves => {
        assert.equal(moves.length, 0, 'Empty stacks must not be animated or recreated');
    };
    await api.resolveAllMoves();
    assert.equal(state.board[8][9], null);
    assert(logs.some(log => log.includes('source no longer exists')), 'Cancelled empty-stack moves must be announced');

    vm.runInContext(fs.readFileSync('js/battle-ui.js', 'utf8'), context);
    const renderChoices = vm.runInContext('renderCaptureChoices', context);
    reset();
    state.phase = 'RESOLVING';
    api.beginCaptureChoices(2, [unit(3, 'q', 'guest-captive')], [8, 8]);
    state.multiplayer = true;
    state.turnIndex = 0;
    renderChoices();
    let buttons = elements.get('capture-choices').children[1].children.slice(2);
    assert(buttons.every(button => button.disabled), "Host cannot choose a guest winner's prisoner fate");
    assert(elements.get('btn-proceed-battle').disabled, 'Pending captures must disable Proceed');
    state.turnIndex = 1;
    let requests = 0;
    context.Multiplayer = {
        isHost: () => false,
        requestCaptureDecision(id, unitId, fate) {
            assert.equal(id, state.pendingCapture.id);
            assert.equal(unitId, 'guest-captive');
            assert.equal(fate, 'keep');
            requests++;
        }
    };
    renderChoices();
    buttons = elements.get('capture-choices').children[1].children.slice(2);
    assert(buttons.every(button => !button.disabled), "Guest winner can choose prisoners' fates");
    buttons[0].handlers.click[0]();
    assert.equal(requests, 1);
    assert(state.pendingCapture, 'Guest UI must await the host rather than mutate the board');

    reset();
    context.Multiplayer = { broadcastResolutionStart() {}, beginNextRound() {} };
    state.multiplayer = true;
    state.board[8][8] = piece(2, [unit(2, 'n', 'fog-mover')]);
    const fogMove = {
        player: 2, pieceId: 'piece-2', from: [8, 8], to: [8, 9], pieceType: 'n',
        contents: state.board[8][8].contents
    };
    context.requestAnimationFrame = callback => callback();
    await api.animatePlannedMovements([fogMove]);
    const animationLayer = elements.get('movement-animation-layer');
    assert.equal(animationLayer.children.length, 0, 'Fogged movement creates no animation tokens');
    state.board[7][7] = piece(1, [unit(1, 'b', 'scout')]);
    await api.animatePlannedMovements([fogMove]);
    assert.equal(animationLayer.children.length, 1, 'Scouted enemy movement remains animated');
    state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
    state.biomes[8][9] = 'forest';
    await api.animatePlannedMovements([fogMove]);
    assert.equal(animationLayer.children.length, 0, 'Scouting cannot animate concealed forest arrivals');
    context.requestAnimationFrame = () => {};

    reset();
    state.multiplayer = true;
    state.board[0][0] = piece(1, [unit(1, 'n', 'distant-viewer')]);
    state.board[15][15] = piece(2, [unit(2, 'n', 'hidden-mover')]);
    state.plans[1] = [{ pieceId: 'piece-2', from: [15, 15], to: [14, 14] }];
    context.animatePlannedMovements = async () => {};
    await api.resolveAllMoves();
    assert.equal(state.board[14][14].contents[0].id, 'hidden-mover',
        'Fog must not change authoritative movement');
    assert(logs.some(log => log.includes('moved through fog of war')));
    assert(!logs.some(log => log.includes('P1') || log.includes('O2')),
        'Hidden movement coordinates must not enter the shared log');
    await api.processCollisionGroup({
        type: 'TARGET', targetSquare: [14, 14],
        candidates: [
            { ...state.board[14][14], pieceId: 'piece-2', pieceType: 'n', from: [14, 14] },
            { player: 2, pieceId: 'reinforcement', pieceType: 'n', from: [15, 15],
                contents: [unit(2, 'n', 'reinforcement')] }
        ]
    });
    assert(logs.at(-1).includes('MERGE') && logs.at(-1).includes('fog of war'),
        'Concealed friendly consolidation must not log its position or stack size');

    reset();
    const groupUnits = [unit(1, 'q', 'group-queen'), unit(1, 'n', 'group-horse'), captive()];
    const groupSource = piece(1, groupUnits, 'group-source');
    state.board[8][8] = groupSource;
    const groupPopup = elements.get('piece-tooltip');
    const groupButtons = groupUnits.map((entry, index) => {
        const button = element();
        button.dataset = { heldIndex: String(index) };
        return button;
    });
    groupPopup.queries = { '.held-piece-button': groupButtons };
    const choose = elements.get('btn-choose-destination');
    const count = elements.get('piece-tooltip-count');
    const clickUnit = index => groupButtons[index].handlers.click.at(-1)({ stopPropagation() {} });
    api.showPieceTooltip(8, 8, element());
    assert.equal(choose.disabled, true);
    clickUnit(0);
    clickUnit(1);
    assert.equal(count.innerText, '2 selected');
    assert.equal(groupButtons[1]['aria-pressed'], 'true');
    assert(groupButtons[1].classList.contains('selected'));
    assert.equal(groupPopup.classList.contains('hidden'), false, 'Toggling must leave the popup open');
    assert.equal(state.selectedHeldPiece, null, 'Selection must not be armed until Choose destination');
    assert.equal(state.validMoves.length, 0, 'Popup must not retain whole-stack destinations');
    assert.equal(state.plans[0].length, 0);
    clickUnit(1);
    assert.equal(count.innerText, '1 selected');
    assert.equal(groupButtons[1]['aria-pressed'], 'false');
    clickUnit(1);
    let prevented = false;
    windowHandlers.click({
        target: element(), stopImmediatePropagation() {}, preventDefault() { prevented = true; }
    });
    assert(prevented && groupPopup.classList.contains('hidden'), 'Outside click only dismisses the popup');
    assert.equal(state.plans[0].length, 0);
    assert.equal(state.selectedSquare, null);
    api.showPieceTooltip(8, 8, element());
    assert.equal(count.innerText, '0 selected', 'Reopening must clear unconfirmed selection');
    clickUnit(0);
    windowHandlers.keydown({ key: 'Escape' });
    assert(groupPopup.classList.contains('hidden'), 'Escape dismisses without an order');
    assert.equal(state.plans[0].length, 0);

    api.showPieceTooltip(8, 8, element());
    clickUnit(0);
    api.handleSquareClick(8, 9);
    assert(groupPopup.classList.contains('hidden'), 'Clicking a board square only dismisses the popup');
    assert.equal(state.plans[0].length, 0, 'An outside board click must never issue an order');
    assert.equal(state.selectedHeldPiece, null);

    api.showPieceTooltip(8, 8, element());
    clickUnit(0);
    clickUnit(1);
    choose.onclick();
    assert(groupPopup.classList.contains('hidden'));
    assert.deepEqual(Array.from(state.selectedHeldPiece.unitIds), ['group-queen', 'group-horse']);
    api.handleSquareAction(8, 9);
    assert.equal(state.plans[0].length, 1, 'Multiple units must queue one intent');
    assert.equal(state.plans[0][0].contents.length, 2);
    assert.equal(state.plans[0][0].pieceType, 'n');
    assert.equal(api.getPendingHeldIndices(groupSource, state.plans[0]).size, 2);
    api.showPieceTooltip(8, 8, element());
    assert(groupButtons[0].disabled && groupButtons[1].disabled, 'Planned units cannot be queued twice');
    assert(groupButtons[0].title.includes('already has'));
    assert.equal(api.queueHeldGroupPlan(groupSource,
        { from: [8, 8], unitIds: ['group-queen'] }, [9, 8], null), false);
    context.animatePlannedMovements = async moves => {
        assert.equal(moves.length, 1);
        assert.equal(moves[0].contents.length, 2, 'Animation must use the complete group');
    };
    await api.resolveAllMoves();
    assert.equal(state.board[8][9].contents.length, 2, 'Selected units move together');
    assert.equal(state.board[8][8].contents.length, 1, 'Unselected units stay behind');
    assert.equal(state.board[8][8].contents[0].id, 'captive');

    reset();
    state.board[8][8] = piece(1, [unit(1, 'q', 'transfer-q'), unit(1, 'b', 'transfer-b')]);
    state.board[8][9] = piece(1, [unit(1, 'n', 'receiver')], 'receiver-stack');
    const transferSelection = { from: [8, 8], sourceId: 'piece-1', unitIds: ['transfer-q', 'transfer-b'] };
    state.selectedHeldPiece = transferSelection;
    state.selectedSquare = [8, 8];
    state.validMoves = [[8, 9]];
    api.handleSquareAction(8, 9);
    assert.equal(state.plans[0].length, 0, 'Friendly transfers require confirmation');
    assert(elements.get('merge-prompt-text').innerText.includes('2 selected'));
    elements.get('btn-merge-confirm').handlers.click[0]();
    assert.equal(state.plans[0].length, 1, 'One confirmation queues the whole transfer');
    assert.equal(state.plans[0][0].transfer, true);
    context.animatePlannedMovements = async () => {};
    await api.resolveAllMoves();
    assert.equal(state.board[8][8], null, 'Selecting all units empties the source');
    assert.equal(state.board[8][9].contents.length, 3, 'Friendly target receives the complete group');

    reset();
    const restricted = piece(1, [
        { ...unit(1, 'r', 'fixed-tower'), gate: [0, 1] },
        unit(1, 'p', 'resting-pawn'), unit(1, 'q', 'mobile-queen'), captive()
    ]);
    state.board[8][8] = restricted;
    state.round = 2;
    const restrictedButtons = restricted.contents.map((entry, index) => {
        const button = element();
        button.dataset = { heldIndex: String(index) };
        return button;
    });
    groupPopup.queries = { '.held-piece-button': restrictedButtons };
    api.showPieceTooltip(8, 8, element());
    assert(restrictedButtons[0].disabled && restrictedButtons[0].title.includes('Towers'));
    assert(restrictedButtons[1].disabled && restrictedButtons[1].title.includes('even-numbered'));
    assert(restrictedButtons[3].disabled && restrictedButtons[3].title.includes('even-numbered'));
    assert.equal(restrictedButtons[2].disabled, false);
    restrictedButtons[2].handlers.click.at(-1)({ stopPropagation() {} });
    choose.onclick();
    assert.deepEqual(Array.from(state.validMoves, square => Array.from(square)), [[8, 9]],
        'Selected groups leaving a Tower must use its gate');
    const missingGroup = { unitIds: ['mobile-queen', 'missing'], player: 1 };
    assert.equal(api.detachHeldGroup(missingGroup, restricted), false);
    assert.equal(restricted.contents.length, 4, 'Invalid groups must not partially remove their units');
    state.round = 1;
    state.plans[0] = [{ isUnmerge: true, sourcePieceId: restricted.id, unitIds: ['captive', 'mobile-queen'] }];
    assert.equal(api.managePrisoner(1, 'captive', 'release'), false, 'Group movement locks prisoner decisions');
    assert.equal(api.validatePrisonerPlans(1, [...state.plans[0], {
        from: [8, 8], to: [8, 8], pieceId: restricted.id, unitId: 'captive', prisonerAction: 'execute'
    }]), false);

    reset();
    state.board[8][8] = piece(1, [unit(1, 'q', 'swap-q'), unit(1, 'b', 'swap-b')], 'swap-source');
    state.board[8][9] = piece(2, [unit(2, 'n', 'swap-enemy')], 'enemy-source');
    assert(api.queueHeldGroupPlan(state.board[8][8],
        { from: [8, 8], unitIds: ['swap-q', 'swap-b'] }, [8, 9], null));
    state.plans[1] = [{ pieceId: 'enemy-source', from: [8, 9], to: [8, 8] }];
    const originalProcess = context.processCollisionGroup;
    const groups = [];
    context.processCollisionGroup = async group => { groups.push(group); };
    await api.resolveAllMoves();
    context.processCollisionGroup = originalProcess;
    const swapGroup = groups.find(group => group.type === 'SWAP');
    assert(swapGroup);
    assert.equal(swapGroup.candidates.length, 2, 'A selected group must be one swap participant');
    assert.equal(swapGroup.candidates.find(candidate => candidate.player === 1).contents.length, 2);

    reset();
    const boardSource = fs.readFileSync('js/board-renderer.js', 'utf8');
    vm.runInContext(boardSource.slice(0, boardSource.indexOf('\nfunction renderBoard')), context);
    vm.runInContext('bindBoardInteractions()', context);
    const board = elements.get('board');
    const sourceSquare = element();
    sourceSquare.parentElement = board;
    sourceSquare.closest = () => sourceSquare;
    board.children = [sourceSquare];
    board.contains = target => target === sourceSquare;
    let popupOpened = 0;
    let squareClicked = 0;
    context.handleSquarePopup = () => { popupOpened++; groupPopup.classList.remove('hidden'); };
    context.handleSquareClick = () => { squareClicked++; };
    board.handlers.pointerdown[0]({
        target: sourceSquare, isPrimary: true, button: 0, pointerType: 'touch',
        pointerId: 1, clientX: 0, clientY: 0
    });
    assert.equal(popupOpened, 1, 'A touch hold opens the unit list');
    windowHandlers.pointerup({ pointerId: 1 });
    const ghostClick = {
        target: sourceSquare, preventDefault() {}, stopPropagation() {},
        stopImmediatePropagation() { throw new Error('Long-press release must reach board suppression'); }
    };
    windowHandlers.click(ghostClick);
    board.handlers.click[0](ghostClick);
    assert.equal(squareClicked, 0, 'Long-press release must not become a destination click');
    assert.equal(groupPopup.classList.contains('hidden'), false,
        'The popup must survive the synthetic click following a touch hold');
    console.log('Prisoner rules and battle integration checks passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
