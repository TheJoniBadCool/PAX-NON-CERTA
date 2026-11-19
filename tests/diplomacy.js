// Run with: node tests/diplomacy.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const elements = new Map();
function element(id) {
    if (!elements.has(id)) {
        const classes = new Set(['hidden']);
        elements.set(id, {
            innerHTML: '', innerText: '', style: {}, handlers: {},
            classList: {
                add(value) { classes.add(value); },
                remove(value) { classes.delete(value); },
                contains(value) { return classes.has(value); },
                toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
            },
            querySelector() { return element(`${id}-name`); },
            addEventListener(event, handler) { this.handlers[event] = handler; },
            setAttribute(name, value) { this[name] = value; }
        });
    }
    return elements.get(id);
}
const panels = [1, 2, 3, 4].map(id => element(`diplomacy-actions-p${id}`));
panels.push(element('alliance-review-requests'));
let resolutions = 0;
const context = vm.createContext({
    console,
    document: {
        getElementById: element,
        querySelectorAll: selector => selector === '.diplomacy-actions, #alliance-review-requests' ? panels : []
    },
    window: { addEventListener() {} },
    bindBoardInteractions() {}, saveCustomSetup() {}, renderBoard() {},
    initializeObjectives() {}, renderCaptureChoices() {}, renderStartingPositionSelection() {},
    initBoard() {}, Multiplayer: { isPendingCommit: () => false, refreshControls() {}, getBadge: () => ({}) }
});
['constants', 'models', 'game-state', 'diplomacy-rules', 'retreat-rules', 'prisoner-rules',
    'setup-utils', 'status-ui', 'game'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.finishResolution = () => { resolutions++; };
vm.runInContext("resolveAllMoves = () => { gameState.phase = 'RESOLVING'; finishResolution(); }; logAction = () => {};", context);
const api = vm.runInContext(`({
    state: gameState, getDiplomacyPair, getPendingAllianceRequests, applyDiplomacyAction,
    renderPlayerDiplomacy, beginAllianceReview, startNewGame
})`, context);
const state = api.state;
const pair = () => api.getDiplomacyPair(0, 1);
const act = (actor, target, action) => api.applyDiplomacyAction(actor, target, action);
const reset = () => state.reset();
const click = (panel, target, action) => element(panel).handlers.click({
    target: { closest: () => ({ dataset: { target: String(target), diplomacyAction: action } }) }
});

assert.equal(state.diplomacy.length, 6);
assert(state.diplomacy.every(pair => pair.status === 'war' && pair.requestedBy === null));
assert.equal(pair(), api.getDiplomacyPair(1, 0), 'Relationships are symmetric');
assert.equal(api.getDiplomacyPair(0, 0), undefined);
for (const target of [0, -1, 4, '1', null, 1.5]) {
    assert(act(0, target, 'request'), 'Invalid targets must report errors');
}
state.activePlayers[1] = false;
assert(act(0, 1, 'request'), 'Unselected players cannot receive requests');
state.activePlayers[1] = true;
state.eliminated[1] = true;
assert(act(0, 1, 'request'), 'Eliminated players cannot receive requests');
reset();
for (const phase of ['STARTING_POSITION', 'TRANSITION', 'RESOLVING', 'GAME_OVER', 'ALLIANCE_REVIEW']) {
    state.phase = phase;
    assert(act(0, 1, 'request'), `Cannot initiate diplomacy in ${phase}`);
}
reset();
assert(act(1, 0, 'request'), 'Hotseat actors must be the current planner');
assert.equal(act(0, 1, 'request'), null);
assert.equal(pair().status, 'war', 'Requests do not immediately create alliances');
assert.equal(pair().requestedBy, 0);
assert.equal(pair().changedRound, 1);
assert.equal(api.getPendingAllianceRequests(1).length, 1);
assert.equal(api.getPendingAllianceRequests(0).length, 0);
assert(act(0, 1, 'accept'), 'Senders cannot accept their own request');
state.turnIndex = 1;
assert(act(1, 0, 'accept'), 'Hotseat replies wait until the review stage');
state.phase = 'ALLIANCE_REVIEW';
assert.equal(act(1, 0, 'accept'), null);
assert.equal(pair().status, 'allied');
assert.equal(pair().requestedBy, null);
assert(act(1, 0, 'decline'), 'Requests cannot be answered twice');
state.phase = 'PLANNING';
assert(act(1, 0, 'war'), 'Accepting an alliance locks it through this round');
state.round++;
assert.equal(act(1, 0, 'war'), null);
assert.equal(pair().status, 'war', 'War is immediate and symmetric');
assert(act(1, 0, 'request'), 'War declarations lock the pair through this round');
state.round++;
assert.equal(act(1, 0, 'request'), null);
state.turnIndex = 0;
state.phase = 'ALLIANCE_REVIEW';
assert.equal(act(0, 1, 'decline'), null);
assert.equal(pair().status, 'war');
state.phase = 'PLANNING';
assert(act(0, 1, 'request'), 'Declining also locks the pair through this round');
state.round++;
assert.equal(act(0, 1, 'request'), null, 'Declined requests can be retried next round');
assert.equal(api.getDiplomacyPair(0, 2).changedRound, 0, 'Pair actions do not affect third parties');

reset();
state.multiplayer = true;
state.committed[0] = true;
assert(act(0, 1, 'request'), 'Committed players must unlock to initiate diplomacy');
assert.equal(act(1, 0, 'request'), null, 'Guests can act while the host is committed');
state.phase = 'COMMITTED';
assert.equal(act(0, 1, 'accept'), null, 'Committed recipients may answer requests');
state.round++;
state.committed[0] = false;
assert.equal(act(0, 1, 'war'), null);
assert(act(1, 0, 'request'), 'Both parties share the same-round lock');
const before = JSON.stringify(state.diplomacy);
assert(act(0, 2, 'invalid'));
assert.equal(JSON.stringify(state.diplomacy), before, 'Rejected actions must not mutate state');

for (const multiplayer of [false, true]) {
    reset();
    state.multiplayer = multiplayer;
    const captive = (id, owner, originalPlayer) => ({
        id, type: 'n', player: owner, originalPlayer, prisonerOf: owner,
        experience: 3, armour: 2, routedStacks: 2, routedUntilRound: 8
    });
    const red = { id: 'red', player: 1, type: 'n', contents: [
        { id: 'red-soldier', type: 'p', player: 1 },
        captive('blue-captive', 1, 2), captive('green-captive', 1, 3)
    ] };
    const blue = { id: 'blue', player: 2, type: 'n', contents: [captive('red-captive', 2, 1)] };
    const green = { id: 'green', player: 3, type: 'n', contents: [captive('third-party', 3, 1)] };
    state.board = [[red, [blue, green]]];
    state.retreating[0] = [{
        player: 1, battleSquare: [0, 0], reentryRound: 2,
        contents: [captive('retreating-blue', 1, 2), { id: 'retreating-red', type: 'p', player: 1 }]
    }];
    state.plans[0] = [
        { prisonerAction: 'execute', unitId: 'blue-captive' },
        { isUnmerge: true, unitIds: ['blue-captive', 'red-soldier'] },
        { pieceId: 'red', contents: red.contents },
        { prisonerAction: 'release', unitId: 'green-captive' }
    ];
    state.plans[1] = [{ pieceId: 'blue', contents: blue.contents }];
    assert.equal(act(0, 1, 'request'), null);
    assert.equal(red.contents.length, 3, 'A request alone does not release prisoners');
    state.turnIndex = 1;
    state.phase = multiplayer ? 'COMMITTED' : 'ALLIANCE_REVIEW';
    state.committed[0] = state.committed[1] = true;
    assert.equal(act(1, 0, 'accept'), null);
    assert.deepEqual(Array.from(red.contents, unit => unit.id), ['red-soldier', 'green-captive']);
    assert.equal(state.board[0][1], green, 'An emptied captive stack is removed without removing its neighbor');
    assert.equal(state.plans[0].length, 2, 'Only conflicting prisoner actions and split orders are cancelled');
    assert.deepEqual(Array.from(state.plans[0][0].contents, unit => unit.id),
        ['red-soldier', 'green-captive'], 'Surviving movement plans no longer contain released prisoners');
    assert.equal(state.plans[1].length, 0, 'Moves for a prisoner-only stack are cancelled');
    assert.equal(state.retreating[0][0].contents[0].id, 'retreating-red');
    const freed = state.retreating.flat().filter(entry => entry.released);
    assert.equal(freed.length, 3, 'Both owners and prisoners held in retreat are released immediately');
    assert.deepEqual(Array.from(freed).flatMap(entry => Array.from(entry.contents, unit => unit.id)).sort(),
        ['blue-captive', 'red-captive', 'retreating-blue']);
    freed.forEach(entry => {
        assert.equal(entry.reentryRound, state.round + 3);
        entry.contents.forEach(unit => {
            assert.equal(unit.player, entry.player);
            assert.equal(unit.prisonerOf, undefined);
            assert.equal(unit.originalPlayer, undefined);
            assert.equal(unit.routedStacks, 0);
            assert.equal(unit.experience, 3);
            assert.equal(unit.armour, 2);
        });
    });
    assert(act(1, 0, 'accept'), 'Repeated acceptance cannot release the prisoners twice');
    assert.equal(state.retreating.flat().filter(entry => entry.released).length, 3);
}

reset();
api.renderPlayerDiplomacy(1);
assert.match(element('diplomacy-p2').innerHTML, /At war with/);
assert.doesNotMatch(element('diplomacy-p2').innerHTML, /<button/, 'Status row contains only relationship indicators');
assert.match(element('diplomacy-actions-p2').innerHTML, /data-diplomacy-action="request"/);
assert.match(element('diplomacy-actions-p2').innerHTML,
    /data-diplomacy-action="request"[^>]*><span class="diplomacy-icon diplomacy-handshake"[^>]*>🤝/);
assert.match(element('diplomacy-actions-p2').innerHTML, /<details class="diplomacy-menu">/);
assert.match(element('diplomacy-actions-p2').innerHTML, /data-diplomacy-action="war"[^>]* disabled>/,
    'Declare War is disabled when already at war');
assert.doesNotMatch(element('diplomacy-actions-p2').innerHTML, /data-diplomacy-action="request"[^>]* disabled>/);
assert.match(element('diplomacy-actions-p2').innerHTML, /Declare War/);
assert.match(element('diplomacy-actions-p2').innerHTML, /Request Allegiance/);
assert.equal((element('diplomacy-p2').innerHTML.match(/class="diplomacy-ball"/g) || []).length, 3);
click('diplomacy-actions-p2', 1, 'request');
assert.equal(pair().requestedBy, 0, 'Card button handlers initiate diplomacy');
element('btn-clear-plan').handlers.click();
assert.equal(pair().requestedBy, 0, 'Reset Plans must not cancel an alliance request');
assert.equal(pair().changedRound, 1, 'Reset Plans must not clear diplomacy locks');
api.renderPlayerDiplomacy(1);
assert.match(element('diplomacy-actions-p2').innerHTML, /Alliance request pending/);
assert.doesNotMatch(element('diplomacy-actions-p2').innerHTML, /data-diplomacy-action="accept"/,
    'Hotseat approvals must not appear during planning');
state.multiplayer = true;
state.turnIndex = 1;
state.phase = 'COMMITTED';
state.committed[1] = true;
api.renderPlayerDiplomacy(0);
assert.match(element('diplomacy-actions-p1').innerHTML, /data-diplomacy-action="accept"/);
assert.match(element('diplomacy-actions-p1').innerHTML, /data-diplomacy-action="decline"/);
assert(element('card-p1').classList.contains('diplomacy-incoming'), 'Incoming requests highlight the sender card');
assert.match(element('diplomacy-actions-p1').innerHTML, /role="status">Alliance request!/);
state.eliminated[0] = true;
api.renderPlayerDiplomacy(0);
assert.equal(element('diplomacy-p1').innerHTML, '');
assert.equal(element('diplomacy-actions-p1').innerHTML, '');
assert(!element('card-p1').classList.contains('diplomacy-incoming'));

reset();
pair().status = 'allied';
api.renderPlayerDiplomacy(1);
assert.match(element('diplomacy-actions-p2').innerHTML,
    /data-diplomacy-action="war"[^>]*><span class="diplomacy-icon"[^>]*>⚔️/);
assert.match(element('diplomacy-actions-p2').innerHTML, /data-diplomacy-action="request"[^>]* disabled>/,
    'Request Allegiance is disabled when already allied');
assert.doesNotMatch(element('diplomacy-actions-p2').innerHTML, /data-diplomacy-action="war"[^>]* disabled>/);
assert.match(element('diplomacy-p2').innerHTML, /diplomacy-separator"[^>]*>\|<\/span>/,
    'Mixed alliance and war lists have a visible separator');
assert.match(element('diplomacy-p2').innerHTML, /diplomacy-icon diplomacy-handshake/,
    'Alliance indicators also use gray handshakes');
assert.match(fs.readFileSync('styles.css', 'utf8'), /\.diplomacy-handshake\s*\{\s*filter:\s*grayscale\(1\)/);
pair().changedRound = state.round;
api.renderPlayerDiplomacy(1);
for (const action of ['war', 'request']) {
    assert.match(element('diplomacy-actions-p2').innerHTML,
        new RegExp(`data-diplomacy-action="${action}"[^>]* disabled>`), 'Round locks disable both popup options');
}

reset();
click('diplomacy-actions-p2', 1, 'request');
state.turnIndex = 3;
click('diplomacy-actions-p1', 0, 'request');
element('btn-finish-plan').handlers.click();
assert.equal(state.phase, 'TRANSITION', 'The last planner hands off for approval, not resolution');
assert.equal(state.turnIndex, 1);
assert.equal(resolutions, 0);
assert(element('privacy-desc').innerText.includes('review your alliance requests'));
element('btn-privacy-ready').handlers.click();
assert.equal(state.phase, 'ALLIANCE_REVIEW');
assert(!element('alliance-review-modal').classList.contains('hidden'));
assert(element('objectives-panel').classList.contains('hidden'), 'Review must not reveal private plans/objectives');
element('btn-finish-plan').handlers.click();
assert.equal(resolutions, 0, 'Committing cannot bypass approval');
click('alliance-review-requests', 0, 'accept');
assert.equal(pair().status, 'allied');
assert.equal(state.phase, 'TRANSITION');
assert.equal(state.turnIndex, 0, 'The first planner can answer the last planner after all planning');
assert(element('alliance-review-modal').classList.contains('hidden'));
element('btn-privacy-ready').handlers.click();
click('alliance-review-requests', 3, 'decline');
assert.equal(resolutions, 1, 'Resolution begins exactly once after the last answer');
assert.equal(state.diplomacyReviewer, null);
assert.equal(api.getPendingAllianceRequests().length, 0);
assert(element('alliance-review-modal').classList.contains('hidden'));

api.startNewGame([true, true, true, true]);
assert(state.diplomacy.every(pair => pair.status === 'war' && pair.changedRound === 0));
assert.equal(state.diplomacyReviewer, null, 'Starting a new match clears review state');
state.turnIndex = 3;
element('btn-finish-plan').handlers.click();
assert.equal(resolutions, 2, 'Without requests, Hotseat goes directly to resolution');
const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
for (const id of [1, 2, 3, 4]) {
    assert.match(html, new RegExp(`class="player-card-heading"><span class="player-name">[^<]*</span><span id="diplomacy-actions-p${id}"`),
        'Each diplomacy action sits beside the player name');
}
console.log('Diplomacy state, UI, and Hotseat lifecycle checks passed.');
