// Run with: node tests/objectives.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set();
    const handlers = {};
    return {
        innerHTML: '', innerText: '', style: {}, handlers,
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value),
            toggle(value, force) {
                if (force) classes.add(value);
                else classes.delete(value);
            }
        },
        addEventListener(event, handler) { handlers[event] = handler; },
        setAttribute() {}, getAttribute() { return 'false'; },
        querySelector() { return element(); }
    };
}
const elements = new Map();
const document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    },
    querySelectorAll() { return []; },
    querySelector() { return element(); }
};
const context = vm.createContext({
    document, window: { addEventListener() {} }, console, Math: Object.create(Math),
    setTimeout(fn) { fn(); }, requestAnimationFrame() {},
    bindBoardInteractions() {}, renderBoard() {}, renderBattleCandidates() {}, renderBattleRolls() {},
    renderCaptureChoices() {},
    renderCustomSetupBoard() {}, renderCustomSetupPlayers() {},
    renderAllSavedSetups() {}, renderSavedSetups() {}, logAction() {}, logRoundHeader() {},
    Multiplayer: {
        getBadge() { return { text: 'Planning', ready: false }; },
        refreshControls() {}, broadcastResolutionStart() {},
        beginNextRound() { context.nextRound = true; },
        onGameOver() { context.gameOver = true; }
    }
});
[
    'constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'battle-rules',
    'siege-rules', 'movement-rules', 'planning-rules', 'retreat-rules', 'prisoner-rules', 'objective-rules',
    'board-setup', 'setup-actions', 'status-ui', 'game'
].forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.animatePlannedMovements = async () => {};
const api = vm.runInContext(`({
    state: gameState, startNewGame, initializeObjectives, updateObjectiveScores,
    resolveObjectiveRound, resolveAllMoves, processCollisionGroup, renderObjectives,
    confirmCustomSetup, isValidSavedSetup, showPrivacyOverlay, queueUnmergePlan, players: PLAYERS
})`, context);
const state = api.state;
const players = api.players;

function setup(count = 2) {
    const board = Array.from({ length: 16 }, () => Array(16).fill(null));
    for (let index = 0; index < count; index++) {
        ['r', 'r', 'k', 'q', 'p'].forEach((type, n) => {
            const id = `p${index + 1}-${type}-${n}`;
            const column = [0, 4, 8, 9, 10][n];
            board[index * 4][column] = {
                id, player: index + 1, type,
                contents: [{ id: `${id}-unit`, player: index + 1, type, name: id }]
            };
        });
    }
    return board;
}
function start(count = 2) {
    state.multiplayer = false;
    api.startNewGame([true, count >= 2, count >= 3, count >= 4], setup(count));
}
function removeType(player, type) {
    state.board.forEach(row => row.forEach((piece, column) => {
        if (!piece || piece.player !== player) return;
        piece.contents = piece.contents.filter(unit => unit.type !== type);
        if (!piece.contents.length) row[column] = null;
    }));
}
function changeCastleOwner(castleId, player) {
    const piece = state.board.flat().find(piece =>
        piece && piece.contents.some(unit => unit.castleId === castleId));
    piece.player = player;
    piece.id += '-captured';
    piece.contents.forEach(unit => {
        unit.player = player;
        unit.id += '-captured';
    });
}

async function run() {
    for (let i = 0; i < 100; i++) {
        start(i % 2 ? 2 : 4);
        state.objectives.forEach((objectives, index) => {
            if (!state.activePlayers[index]) {
                assert.equal(objectives.length, 0);
                return;
            }
            assert.equal(objectives.length, 7);
            assert.equal(objectives.filter(objective => objective.points > 0)
                .reduce((sum, objective) => sum + objective.points, 0), 10);
            assert.notEqual(objectives[0].targetPlayer, index + 1);
            assert.equal(state.scores[index], 0);
            assert(objectives.every(objective => !objective.completed));
        });
    }

    start();
    const blueCastle = state.objectives[0].find(objective => objective.kind === 'conquer');
    const blueLoss = state.objectives[1].find(objective => objective.castleId === blueCastle.castleId);
    changeCastleOwner(blueCastle.castleId, 1);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 1);
    assert.equal(state.scores[1], -3);
    assert(blueCastle.completed && blueLoss.completed);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 1, 'Repeated evaluation must not accumulate points');
    changeCastleOwner(blueCastle.castleId, 2);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0);
    assert.equal(state.scores[1], 0);
    assert(!blueCastle.completed && !blueLoss.completed);

    start();
    const king = state.board[4][8];
    state.board[4][8] = null;
    state.retreating[1].push({ contents: king.contents, reentryRound: 99, battleSquare: [4, 8] });
    api.updateObjectiveScores();
    assert.equal(state.scores[1], 0, 'A retreating king is alive');
    state.retreating[1] = [];
    const result = api.resolveObjectiveRound();
    assert.equal(state.scores[0], 3);
    assert.equal(state.scores[1], -4);
    assert(!state.eliminated[1] && !result.winners.length, 'King death alone is not defeat');
    state.board[4][8] = king;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0, 'Restoring the condition reverses the reward');
    assert.equal(state.scores[1], 0, 'Restoring the condition reverses the penalty');

    start();
    state.customSetupBoard = setup();
    state.customSetupBoard[4][9] = null;
    api.confirmCustomSetup();
    assert(document.getElementById('custom-setup-status').innerText.includes('Blue needs'));
    assert(!api.isValidSavedSetup({ activePlayers: [true, true, false, false], board: state.customSetupBoard }));

    start();
    api.renderObjectives();
    assert(document.getElementById('objectives-list').innerHTML.includes('Blue is defeated'));
    players[1].name = 'Blue Commander';
    api.renderObjectives();
    assert(document.getElementById('objectives-list').innerHTML.includes('Blue Commander is defeated'),
        'Objective labels must use the current player name');
    players[1].name = players[1].colorName;
    assert.equal((document.getElementById('objectives-list').innerHTML.match(/<li /g) || []).length, 7,
        'The compact checklist must retain every objective');
    assert(!document.getElementById('objectives-list').innerHTML.includes('<tr'),
        'Checklist entries must use list markup for the two-column layout');
    api.showPrivacyOverlay();
    assert(document.getElementById('objectives-panel').classList.contains('hidden'));
    assert.equal(document.getElementById('objectives-list').innerHTML, '');
    state.phase = 'RESOLVING';
    api.renderObjectives();
    assert.equal(document.getElementById('objectives-list').innerHTML, '');
    state.multiplayer = true;
    state.turnIndex = 1;
    api.renderObjectives();
    assert(document.getElementById('objectives-list').innerHTML.includes('Red is defeated'));
    assert(!document.getElementById('objectives-list').innerHTML.includes('Blue is defeated'));

    // Exercise the real capture code, which changes unit IDs and names.
    start();
    const tower = state.board[4][0];
    const castleId = tower.contents[0].castleId;
    let rolls = 0;
    context.Math.random = () => rolls++ === 0 ? 0 : 0.99;
    const attacker = state.board[0][10];
    const battle = api.processCollisionGroup({
        type: 'TARGET', targetSquare: [4, 0],
        candidates: [
            { player: 1, pieceId: attacker.id, from: [0, 10], to: [4, 0],
                pieceType: 'p', contents: attacker.contents },
            { player: 2, pieceId: tower.id, from: [4, 0], to: [4, 0],
                pieceType: 'r', contents: tower.contents, isStationary: true }
        ]
    });
    document.getElementById('btn-start-battle').onclick();
    document.getElementById('btn-proceed-battle').onclick();
    await battle;
    assert.equal(state.board[4][0].player, 1);
    assert.equal(state.board[4][0].contents.find(unit => unit.type === 'r').castleId, castleId);
    api.updateObjectiveScores();
    assert(state.objectives[1].find(objective => objective.castleId === castleId).completed);
    context.Math.random = Math.random;

    start();
    const routedRoyal = state.board[0][9].contents[0];
    Object.assign(routedRoyal, { routedStacks: 2, routedUntilRound: 10, experience: 2, armour: 1 });
    const royalStack = state.board[0][8];
    royalStack.contents.push(routedRoyal);
    state.board[0][9] = null;
    api.queueUnmergePlan(royalStack, {
        from: [0, 8], type: 'q', unitId: routedRoyal.id, name: routedRoyal.name, heldIndex: 1
    }, [1, 8], null);
    assert.equal(state.plans[0][0].contents[0].routedStacks, 2, 'Unmerge planning preserves routed status');
    await api.resolveAllMoves();
    const splitRoyal = state.board[1][8];
    assert.equal(splitRoyal.contents[0].routedStacks, 2, 'Unmerge resolution preserves routed stacks');
    assert.equal(splitRoyal.contents[0].routedUntilRound, 10, 'Unmerge must not refresh the cooldown');
    assert.equal(splitRoyal.contents[0].experience, 2, 'Unmerge preserves experience');
    assert.equal(splitRoyal.contents[0].armour, 1, 'Unmerge preserves armour');
    api.queueUnmergePlan(splitRoyal, {
        from: [1, 8], type: 'q', unitId: routedRoyal.id, name: routedRoyal.name, heldIndex: 0
    }, [0, 8], royalStack);
    await api.resolveAllMoves();
    assert.equal(state.board[1][8], null, 'Transferred single units leave no source piece');
    const transferredRoyal = state.board[0][8].contents.find(unit => unit.id === routedRoyal.id);
    assert.equal(transferredRoyal.routedStacks, 2, 'Transfer and merge preserve routed stacks');
    assert.equal(transferredRoyal.routedUntilRound, 10, 'Transfer and merge must not reset cooldown');
    assert.equal(state.board[0][8].contents.find(unit => unit.type === 'k').routedStacks, undefined,
        'Fresh allies must not inherit the routed penalty');

    start();
    const blueQueen = state.board[4][9];
    state.board[4][0].contents.push(...blueQueen.contents);
    state.board[4][9] = null;
    const besieger = state.board[0][10];
    state.board[4][1] = besieger;
    state.board[0][10] = null;
    state.sieges = [{
        id: 'test-siege', towerSquare: [4, 0], towerTimer: 0, startedRound: 0,
        attackers: [{ pieceId: besieger.id, player: 1, sourceSquare: [4, 1], timer: 0 }]
    }];
    await api.resolveAllMoves();
    assert.equal(state.scores[0], 2, 'Siege casualties score in the same completed round');

    start();
    const retreatKing = state.board[0][8];
    state.board[0][8] = null;
    state.retreating[0] = [{ contents: retreatKing.contents, reentryRound: 2, battleSquare: [0, 8], player: 1 }];
    state.board.forEach((row, r) => row.forEach((piece, c) => {
        if (!piece) row[c] = {
            id: `filler-${r}-${c}`, player: 1, type: 'p',
            contents: [{ id: `filler-unit-${r}-${c}`, type: 'p', player: 1 }]
        };
    }));
    await api.resolveAllMoves();
    assert.equal(state.scores[0], -4, 'A failed retreat re-entry scores its deaths immediately');
    assert.equal(state.scores[1], 3);

    start();
    state.eliminated[1] = true;
    await api.resolveAllMoves();
    assert.notEqual(state.phase, 'GAME_OVER', 'The last player must still reach 10');
    assert.equal(state.scores[0], 4);

    start();
    state.objectives[0] = [{ kind: 'death', unitId: 'missing', points: 9 }];
    state.objectives[1] = [{ kind: 'death', unitId: 'missing', points: -9 }];
    await api.resolveAllMoves();
    assert.notEqual(state.phase, 'GAME_OVER', 'Nine points must not win');
    assert(!state.eliminated[1], 'Minus nine must not defeat a player');

    start();
    removeType(2, 'k');
    removeType(2, 'q');
    state.board.flat().filter(piece => piece && piece.player === 2 && piece.type === 'r')
        .forEach(piece => changeCastleOwner(piece.contents[0].castleId, 1));
    state.multiplayer = true;
    await api.resolveAllMoves();
    assert(state.eliminated[1], 'A -10 player is defeated');
    assert.equal(state.scores[0], 10, 'Enemy-defeat rewards apply before checking victory');
    assert.equal(state.scores[1], -10);
    assert.equal(state.phase, 'GAME_OVER');
    assert(context.gameOver, 'Multiplayer must receive the game-over notification');

    start(4);
    state.eliminated[2] = state.eliminated[3] = true;
    state.objectives[0] = [{ kind: 'defeat', targetPlayer: 3, points: 10 }];
    state.objectives[1] = [{ kind: 'defeat', targetPlayer: 4, points: 11 }];
    await api.resolveAllMoves();
    assert.equal(state.phase, 'GAME_OVER', 'Scores above 10 also win');
    assert.equal(document.getElementById('gameover-title').innerText, 'Red & Blue Win!');

    start();
    state.objectives[0] = [{ kind: 'death', unitId: 'missing', points: -10 }];
    state.objectives[1] = [{ kind: 'death', unitId: 'missing', points: -11 }];
    await api.resolveAllMoves();
    assert.equal(state.phase, 'GAME_OVER');
    assert.equal(document.getElementById('gameover-title').innerText, 'Draw!');
    assert(state.eliminated[0] && state.eliminated[1]);
    state.objectives[0] = [];
    api.resolveObjectiveRound();
    assert(state.eliminated[0], 'Defeat remains permanent if the score recovers');

    start();
    assert(state.scores.every(score => score === 0));
    assert(state.objectives.flat().every(objective => !objective.completed), 'Restart clears progress');
    console.log('Objective rules, capture, privacy and round-resolution checks passed');
}
run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
