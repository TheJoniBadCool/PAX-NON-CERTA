// Run with: node tests/allied-squares.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set(['hidden']);
    return {
        children: [], handlers: {}, style: {}, dataset: {}, innerText: '', className: '', title: '', disabled: false,
        classList: {
            add(value) { classes.add(value); },
            remove(value) { classes.delete(value); },
            contains(value) { return classes.has(value); },
            toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
        },
        set innerHTML(value) { this.html = value; this.children = []; },
        get innerHTML() { return this.html || ''; },
        appendChild(child) { this.children.push(child); },
        querySelector() { return element(); },
        querySelectorAll() { return []; },
        addEventListener(event, handler) {
            const previous = this.handlers[event];
            this.handlers[event] = previous ? (...args) => { previous(...args); handler(...args); } : handler;
        },
        setAttribute(name, value) { this[name] = value; }
    };
}
const elements = new Map();
const getElement = id => {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
};
getElement('board').parentElement = element();
const logs = [];
let battleCount = 0;
const randomMath = Object.create(Math);
randomMath.random = () => 0.99;
const context = vm.createContext({
    console, Math: randomMath,
    document: {
        getElementById: getElement, createElement: element, querySelectorAll: () => []
    },
    window: { addEventListener() {} },
    setTimeout(callback) { callback(); return 1; }, clearTimeout() {},
    saveCustomSetup() {}, renderStartingPositionSelection() {},
    Multiplayer: {
        isPendingCommit: () => false, refreshControls() {}, onBoardRendered() {},
        isHost: () => true, syncAlliedState() {}, broadcastResolutionStart() {},
        beginNextRound() { api.state.phase = 'PLANNING'; },
        getBadge: () => ({ text: '', ready: false })
    }
});
['constants', 'models', 'game-state', 'planning-timer', 'setup-utils', 'diplomacy-rules', 'board-utils',
'capital-rules',
    'movement-rules', 'planning-rules', 'battle-rules', 'siege-rules', 'retreat-rules', 'prisoner-rules',
    'objective-rules', 'board-renderer', 'resource-purchases', 'status-ui', 'battle-ui',
    'province-food', 'allied-resolution', 'path-planning', 'game']
    .forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.captureLog = text => logs.push(text);
vm.runInContext(`
    const actualRenderBoard = renderBoard;
    renderBoard = () => {};
    renderPlanArrows = () => {};
    logAction = text => captureLog(text);
    logRoundHeader = () => {};
    animatePlannedMovements = async () => {};
    wait = async () => {};
    setBattleTarget = () => {};
    clearBattleTarget = () => {};
`, context);
const api = vm.runInContext(`({
    state: gameState, getSquarePieces, getPiecesAt, getPieceAt, getPieceByIdAt,
    putPieceAt, removePieceAt, setPiecesAt, getPieceContents, createUnit, arePlayersAllied,
    getVisiblePiece, getVisiblePieces, getFogVisibility, getValidMovesForPiece,
    getAlliedBattleSides, getBattleCandidateData, resolveAllMoves, processCollisionGroup,
    renderBoard: actualRenderBoard, getPlanArrowKind, decideAlliedSpoils,
    chooseAlliedSpoils, renderAlliedSpoils, resolveAlliedSally, validatePrisonerPlans, managePrisoner, resolvePrisonerPlans,
    updateObjectiveScores, getDefenderTerrainBonus, snapshotHillOccupants, updateHillHeld,
    beginCaptureChoices, decideCapture, getReadySiegeAssault, syncSieges, canUnitsTarget,
    reconcileProvinceFood, refreshResourceTotals, showPieceTooltip
})`, context);
const state = api.state;
const copy = value => JSON.parse(JSON.stringify(value));
let sequence = 0;
function piece(player, types = ['n']) {
    const id = `army-${++sequence}`;
    return {
        id, player, type: types.includes('r') ? 'r' : types[0],
        contents: types.map((type, i) => {
            const unit = api.createUnit(player, type, `${id}-${i}`);
            if (type === 'r') unit.gate = [0, -1];
            return unit;
        })
    };
}
function ally(a, b) {
    state.diplomacy.find(pair => pair.players.includes(a - 1) && pair.players.includes(b - 1)).status = 'allied';
}
function reset() {
    state.reset();
    state.boardSize = 12;
    state.board = Array.from({ length: 12 }, () => Array(12).fill(null));
    state.biomes = Array.from({ length: 12 }, () => Array(12).fill('plains'));
    logs.length = 0;
    battleCount = 0;
    getElement('btn-start-battle').onclick = null;
    getElement('btn-proceed-battle').onclick = null;
}
function order(army, from, to, extra = {}) {
    const plan = {
        pieceId: army.id, from, to, pieceType: army.type, contents: army.contents, ...extra
    };
    state.plans[army.player - 1].push(plan);
    return plan;
}
async function drive(promise, vote) {
    let done = false;
    let failure;
    promise.then(() => { done = true; }, error => { failure = error; done = true; });
    for (let tick = 0; tick < 200 && !done; tick++) {
        await Promise.resolve();
        if (state.pendingSpoils) {
            const pending = state.pendingSpoils;
            if (vote) vote(pending);
            else pending.participants.forEach(player =>
                api.decideAlliedSpoils(player, pending.id, 'choose', pending.participants[0]));
        } else if (state.pendingCapture) {
            const pending = state.pendingCapture;
            [...pending.contents].forEach(unit => api.decideCapture(pending.player, pending.id, unit.id, 'keep'));
        } else if (getElement('btn-start-battle').onclick) {
            battleCount++;
            getElement('btn-start-battle').onclick();
        } else if (getElement('btn-proceed-battle').onclick) {
            getElement('btn-proceed-battle').onclick();
        }
    }
    if (failure) throw failure;
    assert(done, 'Resolution must complete rather than getting stuck');
    await promise;
}
function candidate(army, square, origins = null) {
    return {
        player: army.player, pieceId: army.id, pieceType: army.type,
        from: square, to: square, contents: army.contents, isStationary: true,
        origins: origins || [{ square, ids: army.contents.map(unit => unit.id) }]
    };
}

async function run() {
    reset();
    const foodTower = piece(1, ['r']);
    foodTower.contents[0].resourceStockpile = { food: 2 };
    state.board[0][0] = foodTower;
    state.selectedSquare = [0, 0];
    api.reconcileProvinceFood();
    state.provinceFood[0] = 2;
    api.refreshResourceTotals();
    api.renderBoard();
    const towerSquare = getElement('board').children[0];
    const meter = towerSquare.children.find(child => child.className === 'province-food-meter');
    assert(meter && !meter.disabled);
    assert.equal(meter.children.length, 6);
    assert.equal(meter.children.filter(child => child.className.includes('filled')).length, 2);
    assert(towerSquare.children.some(child => child.className === 'province-food-warning'));
    api.showPieceTooltip(0, 0, towerSquare);
    const foodControl = getElement('province-food-control');
    assert(!foodControl.classList.contains('hidden'));
    assert.match(foodControl.innerHTML, /aria-label="Province food 2\/6\. Add 1 step for 1 Food\."/);
    assert.match(foodControl.innerHTML, /class="grain-bag"/);
    assert.match(foodControl.innerHTML, /class="grain-arrow"/);
    assert.match(foodControl.innerHTML, /class="province-food-count"[^>]*>2\/6<\/span>/);
    assert.doesNotMatch(getElement('piece-tooltip-units').innerHTML, /province-food-refill/);
    getElement('board').handlers.click({ target: { closest() { return meter; } } });
    assert.equal(state.provinceFood[0], 3, 'Clicking the meter refills one food step');
    assert.equal(state.resources[0].food, 1);
    const refillButton = { disabled: false, dataset: { purchase: 'province-food', target: '0' } };
    getElement('piece-tooltip').handlers.click({ target: { closest() { return refillButton; } } });
    assert.equal(state.provinceFood[0], 4, 'The Tower unit-list button also refills food');
    assert.equal(state.resources[0].food, 0);
    assert.match(foodControl.innerHTML, /data-purchase="province-food"[^>]* disabled>/,
        'The refill button is disabled when the player has no Food');
    assert.match(foodControl.innerHTML, /class="province-food-count"[^>]*>4\/6<\/span>/,
        'The visible food count updates after refilling');
    const mobile = piece(1);
    state.board[1][1] = mobile;
    state.selectedSquare = [1, 1];
    api.showPieceTooltip(1, 1, towerSquare);
    assert(foodControl.classList.contains('hidden'), 'Non-Tower unit lists do not show the refill control');
    const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
    assert(html.indexOf('id="province-food-control"') < html.indexOf('id="piece-tooltip-units"'),
        'The refill control appears before the unit buttons');

    reset();
    ally(1, 2);
    const red = piece(1, ['n', 'q']);
    const blue = piece(2);
    api.putPieceAt(4, 4, red);
    api.putPieceAt(4, 4, blue);
    assert.equal(api.getPiecesAt(4, 4).length, 2);
    assert.equal(api.getPieceAt(4, 4, 2), blue);
    assert.equal(api.getVisiblePiece(4, 4, 1), red);
    assert.equal(api.getVisiblePiece(4, 4, 2), blue);
    api.removePieceAt(4, 4, red.id);
    assert.equal(state.board[4][4], blue, 'Removing one owner preserves the other and normalizes singleton cells');
    api.putPieceAt(4, 4, red);
    const snapshot = copy(state.board);
    state.board = snapshot;
    assert.equal(api.getPiecesAt(4, 4).length, 2, 'Shared cells survive JSON snapshots');
    api.renderBoard();
    const shared = getElement('board').children[4 * 12 + 4];
    assert.equal(shared.children.filter(child => child.className === 'shared-army').length, 2);
    assert(shared.children.filter(child => child.className === 'shared-army').every(child =>
        child.style.width === '76%' && child.children.length), 'Shared icons shrink without losing their armies');
    const sharedCounts = shared.children.filter(child => child.className === 'held-count');
    assert.equal(sharedCounts.length, 1, 'Shared squares show one yellow total-count badge');
    assert.equal(sharedCounts[0].innerText, '3');
    assert.equal(sharedCounts[0].style.background, undefined, 'The badge uses the default yellow styling');
    for (let a = 1; a <= 4; a++) for (let b = a + 1; b <= 4; b++) ally(a, b);
    api.putPieceAt(4, 4, piece(3));
    api.putPieceAt(4, 4, piece(4));
    api.renderBoard();
    assert.equal(getElement('board').children[4 * 12 + 4].children.filter(child =>
        child.className === 'shared-army' && child.style.width === '62%').length, 4,
    'Four co-located players render four smaller, staggered armies');
    assert.equal(getElement('board').children[4 * 12 + 4].children.find(child =>
        child.className === 'held-count').innerText, '5');
    for (let player = 1; player <= 4; player++) {
        assert.equal(api.getVisiblePiece(4, 4, player).player, player, 'Clicking prioritizes the viewer’s own army');
    }

    reset();
    ally(1, 2);
    state.biomes[1][1] = 'forest';
    const allyBishop = piece(2, ['b']);
    state.board[1][1] = allyBishop;
    assert(api.getFogVisibility(1)[3][3], 'A direct allied Bishop shares its extended sight');
    assert.equal(api.getVisiblePiece(1, 1, 1), allyBishop, 'Allied troops are visible in forests');
    ally(2, 3);
    state.board[10][10] = piece(3);
    assert(!api.getFogVisibility(1)[10][10], 'Vision does not chain through an ally of an ally');
    assert(api.getFogVisibility(2)[10][10]);
    state.diplomacy.find(pair => pair.players.join() === '0,1').status = 'war';
    assert(!api.getFogVisibility(1)[1][1], 'Declaring war immediately ends shared vision');
    ally(1, 2);
    state.eliminated[1] = true;
    assert(!api.getFogVisibility(1)[1][1], 'Eliminated allies no longer share sight');

    reset();
    ally(1, 2);
    const mover = piece(1);
    const tower = piece(2, ['r', 'p']);
    state.board[4][4] = mover;
    state.board[4][5] = tower;
    assert(!api.getValidMovesForPiece(4, 4).some(([r, c]) => r === 4 && c === 5),
        'Allied Towers cannot be entered through their gate');
    assert(!api.canUnitsTarget(mover.contents, tower, 1));
    state.board[4][5] = piece(2);
    assert(api.getValidMovesForPiece(4, 4).some(([r, c]) => r === 4 && c === 5));
    assert.equal(api.getPlanArrowKind({ from: [4, 4], to: [4, 5], player: 1 }, []), 'green');
    assert.equal(api.getPlanArrowKind({ from: [4, 4], to: [4, 5], player: 1, transfer: true }, []), 'green');
    assert.equal(api.getPlanArrowKind({
        from: [4, 4], to: [4, 5], player: 1, mergeAccepted: true
    }, []), 'green');
    assert.equal(api.getPlanArrowKind(
        { from: [4, 4], to: [4, 5], player: 1 },
        [
            { from: [4, 4], to: [4, 5], player: 1 },
            { from: [5, 5], to: [4, 5], player: 1 }
        ]
    ), 'green', 'Friendly arrivals use the movement arrow color');

    reset();
    ally(1, 2);
    const one = piece(1);
    const two = piece(2);
    state.board[4][4] = one;
    state.board[4][5] = two;
    order(one, [4, 4], [4, 5]);
    await drive(api.resolveAllMoves());
    assert.equal(battleCount, 0, 'Moving onto an ally does not open a battle');
    assert.equal(api.getPiecesAt(4, 5).length, 2);
    assert.equal(api.getPiecesAt(4, 5).reduce((n, army) => n + army.contents.length, 0), 2);
    assert.equal(api.getPieceAt(4, 5, 1).contents[0].player, 1);
    state.turnIndex = 1;
    assert(api.getValidMovesForPiece(4, 5).length, 'Either owner can select their own co-located army');
    order(two, [4, 5], [5, 5]);
    await drive(api.resolveAllMoves());
    assert.equal(api.getPieceAt(4, 5, 1).id, one.id, 'One ally leaving does not move the other');
    assert.equal(api.getPieceAt(5, 5, 2).id, two.id);

    reset();
    ally(1, 2);
    const swapA = piece(1);
    const swapB = piece(2);
    state.board[4][4] = swapA;
    state.board[4][5] = swapB;
    order(swapA, [4, 4], [4, 5]);
    order(swapB, [4, 5], [4, 4]);
    await drive(api.resolveAllMoves());
    assert.equal(battleCount, 0, 'Allied exchanges do not intercept');
    assert.equal(state.board[4][4].id, swapB.id);
    assert.equal(state.board[4][5].id, swapA.id);

    reset();
    ally(1, 2);
    const arriving = piece(1);
    const staying = piece(2);
    state.board[3][4] = arriving;
    state.board[4][4] = staying;
    order(arriving, [3, 4], [4, 4]);
    const reinforcement = piece(1);
    state.board[3][3] = reinforcement;
    order(reinforcement, [3, 3], [4, 4]);
    await drive(api.resolveAllMoves());
    assert.equal(battleCount, 0);
    assert.equal(api.getPiecesAt(4, 4).length, 2);
    assert.equal(api.getPieceAt(4, 4, 1).contents.length, 2, 'Same-owner arrivals merge without merging allies');

    reset();
    ally(1, 2);
    const splitting = piece(1, ['n', 'q']);
    const companion = piece(2);
    api.setPiecesAt(4, 4, [companion, splitting]);
    const detached = splitting.contents[0];
    order(splitting, [4, 4], [4, 5], {
        pieceId: `${splitting.id}::unmerge::${detached.id}`, sourcePieceId: splitting.id,
        pieceType: detached.type, contents: [detached], unitIds: [detached.id], isUnmerge: true
    });
    await drive(api.resolveAllMoves());
    assert.equal(api.getPieceAt(4, 4, 2).id, companion.id);
    assert.equal(api.getPieceAt(4, 4, 1).contents.length, 1, 'Unmerging edits only the chosen owner’s source army');
    assert.equal(api.getPieceAt(4, 5, 1).contents[0].id, detached.id);

    reset();
    const formerA = piece(1);
    const formerB = piece(2);
    api.setPiecesAt(4, 4, [formerA, formerB]);
    await drive(api.resolveAllMoves());
    assert.equal(battleCount, 1, 'Stationary former allies fight after declaring war');
    assert.equal(api.getPiecesAt(4, 4).length, 1);

    reset();
    const escapeA = piece(1);
    const escapeB = piece(2);
    api.setPiecesAt(4, 4, [escapeA, escapeB]);
    order(escapeA, [4, 4], [5, 4]);
    await drive(api.resolveAllMoves());
    assert.equal(battleCount, 0, 'Moving away avoids a former-ally battle');
    assert.equal(api.getPieceAt(4, 4, 2).id, escapeB.id);

    reset();
    ally(1, 2);
    const teamA = piece(1);
    const teamB = piece(2);
    const enemy = piece(3);
    const sides = api.getAlliedBattleSides([candidate(teamA, [4, 4]), candidate(teamB, [4, 4]), candidate(enemy, [4, 4])]);
    assert.equal(sides[0].length, 2, 'Mutual allies fight their common enemy together');
    ally(1, 3);
    const partial = api.getAlliedBattleSides([candidate(teamA, [4, 4]), candidate(teamB, [4, 4]), candidate(enemy, [4, 4])]);
    assert.deepEqual(copy(partial.map(side => side.map(army => army.player))), [[2], [3]],
        'An ally of both combatants stays neutral');

    reset();
    ally(1, 2);
    const alliedA = piece(1);
    const alliedB = piece(2);
    const invader = piece(3);
    api.setPiecesAt(4, 4, [alliedA, alliedB]);
    state.board[3][4] = invader;
    order(invader, [3, 4], [4, 4]);
    let defenceRoll = true;
    randomMath.random = () => defenceRoll ? (defenceRoll = false, 0) : 0.99;
    await drive(api.resolveAllMoves());
    assert.equal(battleCount, 1);
    const alliedSurvivors = api.getPiecesAt(4, 4);
    assert.equal(alliedSurvivors.length, 2, `Allied winners remain separate after a joint defence: ${JSON.stringify(alliedSurvivors)}; ${logs.join('; ')}`);
    assert(alliedSurvivors.every(army => army.contents.every(unit => unit.player === army.player)));
    assert(alliedSurvivors.every(army => army.contents.some(unit => unit.experience === 1)),
        'Both winning armies gain experience');

    reset();
    ally(1, 2);
    ally(1, 3);
    state.phase = 'RESOLVING';
    const neutral = piece(1);
    const rivalA = piece(2);
    const rivalB = piece(3);
    let neutralBattleRoll = true;
    randomMath.random = () => neutralBattleRoll ? (neutralBattleRoll = false, 0) : 0.99;
    await drive(api.processCollisionGroup({
        type: 'TARGET', targetSquare: [4, 4],
        candidates: [candidate(neutral, [4, 4]), candidate(rivalA, [4, 4]), candidate(rivalB, [4, 4])]
    }));
    assert.equal(battleCount, 1);
    assert.equal(api.getPieceAt(4, 4, 1).contents[0].experience, 0,
        'An ally of both sides remains neutral and gains no battle experience');
    assert.equal(api.getPiecesAt(4, 4).length, 2, 'The neutral army and winner remain separate');

    reset();
    ally(1, 2);
    state.phase = 'RESOLVING';
    const decision = api.chooseAlliedSpoils([1, 2], 'castle');
    let pending = state.pendingSpoils;
    assert(!api.decideAlliedSpoils(3, pending.id, 'choose', 1), 'Bystanders cannot vote');
    assert(!api.decideAlliedSpoils(1, 'old', 'choose', 1), 'Stale decisions are rejected');
    assert(!api.decideAlliedSpoils(1, pending.id, 'war', 2), 'War is offered only after actual disagreement');
    api.decideAlliedSpoils(1, pending.id, 'choose', 1);
    api.decideAlliedSpoils(2, pending.id, 'choose', 2);
    api.decideAlliedSpoils(2, pending.id, 'retry');
    assert(!state.pendingSpoils.choices[2]);
    api.decideAlliedSpoils(2, pending.id, 'choose', 1);
    assert.equal((await decision).owner, 1);
    const dispute = api.chooseAlliedSpoils([1, 2], 'prisoners');
    pending = state.pendingSpoils;
    api.decideAlliedSpoils(1, pending.id, 'choose', 1);
    api.decideAlliedSpoils(2, pending.id, 'choose', 2);
    assert(api.decideAlliedSpoils(2, pending.id, 'war', 1));
    assert((await dispute).war);
    assert(!api.arePlayersAllied(1, 2), 'Spoils disagreement can override the diplomacy round lock');

    reset();
    ally(1, 2);
    state.phase = 'RESOLVING';
    const hotseatVote = api.chooseAlliedSpoils([1, 2], 'prisoners');
    assert.match(getElement('allied-spoils-status').innerText, /Pass device to Red/);
    getElement('allied-spoils-options').children[0].handlers.click();
    getElement('allied-spoils-options').children.find(button => button.innerText === 'Choose Blue').handlers.click();
    assert.match(getElement('allied-spoils-status').innerText, /Pass device to Blue/);
    getElement('allied-spoils-options').children[0].handlers.click();
    getElement('allied-spoils-options').children.find(button => button.innerText === 'Choose Blue').handlers.click();
    assert.equal((await hotseatVote).owner, 2, 'Hotseat prompts each ally separately and accepts unanimity');

    reset();
    ally(1, 2);
    const assaultA = piece(1, ['n']);
    const assaultB = piece(2, ['n']);
    const defender = piece(3, ['r', 'p']);
    state.phase = 'RESOLVING';
    const originA = [{ square: [4, 3], ids: assaultA.contents.map(unit => unit.id) }];
    const originB = [{ square: [3, 3], ids: assaultB.contents.map(unit => unit.id) }];
    let castleVotes = 0;
    let prisonerVotes = 0;
    let firstRoll = true;
    randomMath.random = () => firstRoll ? (firstRoll = false, 0) : 0.99;
    await drive(api.processCollisionGroup({
        type: 'TARGET', targetSquare: [4, 4],
        candidates: [candidate(assaultA, [4, 4], originA), candidate(assaultB, [4, 4], originB),
            candidate(defender, [4, 4])]
    }), pending => {
        if (pending.kind === 'castle') castleVotes++;
        else prisonerVotes++;
        pending.participants.forEach(player => api.decideAlliedSpoils(player, pending.id, 'choose',
            pending.kind === 'castle' ? 1 : 2));
    });
    assert(castleVotes && prisonerVotes, 'Castle and prisoner control require separate agreements');
    assert.equal(state.board[4][4].player, 1);
    assert.equal(state.board[4][4].type, 'r');
    assert.equal(api.getPieceAt(3, 3, 2).player, 2, 'Non-owner remains on its original siege square');
    assert(api.getPieceAt(3, 3, 2).contents.some(unit => unit.prisonerOf === 2),
        'Agreed prisoner custodian handles captures on its own siege square');

    reset();
    ally(1, 2);
    state.phase = 'RESOLVING';
    const returnA = piece(1);
    const returnB = piece(2);
    const returnTower = piece(3, ['r', 'p']);
    const sourceInvader = piece(4);
    state.board[3][3] = sourceInvader;
    let returnRoll = true;
    randomMath.random = () => returnRoll ? (returnRoll = false, 0) : 0.99;
    await drive(api.processCollisionGroup({
        type: 'TARGET', targetSquare: [4, 4],
        candidates: [
            candidate(returnA, [4, 4], [{ square: [4, 3], ids: returnA.contents.map(unit => unit.id) }]),
            candidate(returnB, [4, 4], [{ square: [3, 3], ids: returnB.contents.map(unit => unit.id) }]),
            candidate(returnTower, [4, 4])
        ]
    }), pending => pending.participants.forEach(player =>
        api.decideAlliedSpoils(player, pending.id, 'choose', pending.kind === 'castle' ? 1 : 2)));
    assert.equal(battleCount, 2, 'Non-owners immediately fight an enemy occupying their original siege square');
    assert.equal(state.board[4][4].player, 1);
    assert.equal(state.board[3][3].player, 4);
    assert(state.board[3][3].contents.some(unit => unit.prisonerOf === 4),
        'Prisoners follow their agreed custodian into its return battle and can be recaptured');

    reset();
    ally(1, 2);
    state.phase = 'RESOLVING';
    const sallyA = piece(1, ['p', 'n']);
    const sallyB = piece(2, ['p', 'n']);
    const sallyTower = piece(3, ['r', 'n']);
    state.board[4][3] = sallyA;
    state.board[3][3] = sallyB;
    state.board[4][4] = sallyTower;
    const sallyRolls = [0, 0.99, 0.99, 0.99, 0.99, 0.99];
    randomMath.random = () => sallyRolls.length ? sallyRolls.shift() : 0.99;
    await drive(api.processCollisionGroup({
        type: 'SALLY', targetSquare: [4, 4],
        candidates: [
            { ...candidate(sallyA, [4, 3]), isSallyAttacker: true },
            { ...candidate(sallyB, [3, 3]), isSallyAttacker: true },
            { ...candidate(sallyTower, [4, 4]), contents: sallyTower.contents.slice(1), isSallyDefender: true }
        ]
    }));
    assert.equal(battleCount, 1);
    assert.equal(api.getPieceAt(4, 3, 1).contents.length, 2, 'Winning allied catapults remain on their siege squares');
    assert.equal(api.getPieceAt(3, 3, 2).contents.length, 2);
    assert.equal(state.board[4][4].player, 3, 'Sally Out never transfers castle ownership');
    assert.equal(state.board[4][4].contents.length, 2, 'Defeated surviving garrison units remain in the Tower');

    reset();
    ally(1, 2);
    state.phase = 'RESOLVING';
    const warA = piece(1);
    const warB = piece(2);
    const warEnemy = piece(3);
    let disputed = false;
    const disputeRolls = [0, 0.99, 0.99, 0];
    randomMath.random = () => disputeRolls.length ? disputeRolls.shift() : 0.99;
    await drive(api.processCollisionGroup({
        type: 'TARGET', targetSquare: [4, 4],
        candidates: [candidate(warA, [4, 4]), candidate(warB, [4, 4]), candidate(warEnemy, [4, 4])]
    }), pending => {
        if (!disputed) {
            disputed = true;
            pending.participants.forEach(player => api.decideAlliedSpoils(player, pending.id, 'choose', player));
            api.decideAlliedSpoils(1, pending.id, 'war', 2);
        } else pending.participants.forEach(player =>
            api.decideAlliedSpoils(player, pending.id, 'choose', pending.participants[0]));
    });
    assert.equal(battleCount, 2, 'A prisoner-control dispute immediately starts a second battle');
    assert.equal(api.getPiecesAt(4, 4).length, 1);

    reset();
    ally(1, 2);
    const prisonerArmy = piece(2);
    const prisoner = { ...api.createUnit(2, 'p', 'captive'), prisonerOf: 2, originalPlayer: 3 };
    prisonerArmy.contents.push(prisoner);
    const otherOwner = piece(1);
    api.setPiecesAt(4, 4, [otherOwner, prisonerArmy]);
    state.turnIndex = 1;
    assert(api.managePrisoner(2, prisoner.id, 'execute'));
    assert(api.validatePrisonerPlans(2, state.plans[1]));
    api.resolvePrisonerPlans();
    assert.equal(api.getPieceAt(4, 4, 1), otherOwner, 'Prisoner actions never remove a co-located allied army');
    state.objectives[1] = [{ kind: 'death', unitId: prisonerArmy.contents[0].id, points: 3 }];
    api.updateObjectiveScores();
    assert.equal(state.scores[1], 0, 'Units in secondary armies count as alive for objectives');
    state.biomes[4][4] = 'hill';
    const held = api.snapshotHillOccupants();
    api.updateHillHeld(held, []);
    assert.equal(api.getDefenderTerrainBonus({ ...candidate(otherOwner, [4, 4]), isStationary: true }, [4, 4]), 0.25);
    assert.equal(api.getDefenderTerrainBonus({ ...candidate(prisonerArmy, [4, 4]), isStationary: true }, [4, 4]), 0.25,
        'Both owners retain independent hill occupancy');

    reset();
    const onlyA = piece(1);
    const onlyB = piece(2);
    [onlyA, onlyB].forEach(army => army.contents.forEach(unit => {
        unit.prisonerOf = army.player;
        unit.originalPlayer = 3;
    }));
    api.setPiecesAt(4, 4, [onlyA, onlyB]);
    await drive(api.resolveAllMoves());
    assert.equal(battleCount, 0, 'Prisoner-only former allies do not fight each other');
    assert.equal(api.getPiecesAt(4, 4).length, 2);
    console.log('Allied shared squares, rendering, movement, vision, combat and spoils checks passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
