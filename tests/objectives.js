// Run with: node tests/objectives.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set();
    const handlers = {};
    return {
        innerHTML: '', innerText: '', value: '', checked: false, style: {}, handlers,
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
        isEditingSetup() { return false; },
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
context.renderMapPreview = () => {};
const api = vm.runInContext(`({
    state: gameState, startNewGame, initializeObjectives, updateObjectiveScores,
    resolveObjectiveRound, resolveAllMoves, processCollisionGroup, renderObjectives,
    confirmCustomSetup, showCustomSetup, generateCustomMapPreview, getHotseatMapSignature, isValidSavedSetup,
    showPrivacyOverlay, queueUnmergePlan, players: PLAYERS,
    updateCapitalResourceOption, getCustomMapSignature, ensureCustomMap, refreshCustomMapPreview,
    editCustomSquare, placeCustomPiece, isValidCustomMap,
    getCustomMap: () => customMapPreview?.starting
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
    const resourceSelector = document.getElementById('resource-mode');
    const balanceSelector = document.getElementById('resource-balance');
    balanceSelector.value = 'off';
    resourceSelector.value = '8';
    const smallerSignature = api.getHotseatMapSignature('same-seed');
    resourceSelector.value = '12';
    assert.notEqual(api.getHotseatMapSignature('same-seed'), smallerSignature,
        'Changing resource mode invalidates the hotseat map preview');
    const unbalancedSignature = api.getHotseatMapSignature('same-seed');
    balanceSelector.value = 'allow-empty';
    assert.notEqual(api.getHotseatMapSignature('same-seed'), unbalancedSignature,
        'Changing resource balance invalidates the hotseat map preview');
    const capitals = document.getElementById('resource-capitals');
    const noCapitalsSignature = api.getHotseatMapSignature('same-seed');
    capitals.checked = true;
    assert.notEqual(api.getHotseatMapSignature('same-seed'), noCapitalsSignature,
        'Changing capital eligibility invalidates the hotseat preview');
    api.showCustomSetup([true, true, false, false], setup());
    assert.equal(state.resourceCapitals, true);
    assert.equal(document.getElementById('custom-resource-capitals').checked, true);
    const customCapitalsSignature = api.getCustomMapSignature('same-seed');
    document.getElementById('custom-resource-capitals').handlers.change({ target: { checked: false } });
    document.getElementById('custom-resource-capitals').checked = false;
    assert.equal(state.resourceCapitals, false);
    assert.equal(capitals.checked, false);
    assert.notEqual(api.getCustomMapSignature('same-seed'), customCapitalsSignature,
        'Changing capital eligibility invalidates the custom preview');
    for (const prefix of ['', 'custom-']) {
        const mode = document.getElementById(`${prefix}resource-mode`);
        const input = document.getElementById(`${prefix}resource-capitals`);
        mode.value = '16';
        api.updateCapitalResourceOption(prefix);
        assert.equal(input.checked, true);
        assert.equal(input.disabled, true);
        mode.value = '12';
        api.updateCapitalResourceOption(prefix);
        assert.equal(input.disabled, false);
        input.checked = false;
    }
    assert.equal(state.resourceMode, '12',
        'Opening custom placement from a saved setup uses the selected resource mode');
    assert.equal(state.resourceBalance, 'allow-empty');
    document.getElementById('custom-resource-balance').handlers.change({ target: { value: 'require-all' } });
    document.getElementById('custom-map-seed').value = 'impossible';
    api.generateCustomMapPreview();
    assert.match(document.getElementById('custom-map-preview-status').innerText,
        /Cannot place a resource in every quadrant/);
    assert.equal(document.getElementById('btn-confirm-custom-setup').disabled, false,
        'A failed generator must not prevent starting a manually painted sandbox');
    document.getElementById('custom-resource-balance').handlers.change({ target: { value: 'off' } });
    assert.equal(state.resourceBalance, 'off');
    assert.equal(balanceSelector.value, 'off');
    resourceSelector.value = '8';
    state.resourceMode = '8';
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

    api.startNewGame([true, true, false, false], null, 16, 'province-castles');
    for (let player = 1; player <= 2; player++) {
        const castle = state.board.flat().find(piece => piece && piece.player === player);
        assert.equal(state.board.flat().filter(piece => piece && piece.player === player).length, 1);
        assert.equal(castle.contents.length, 12);
        assert.equal(state.objectives[player - 1].filter(objective => objective.kind === 'lose').length, 1,
            'One physical starting castle must create one loss objective');
    }

    start();
    state.provinceResources[0] = { type: 'food', productionChance: 100 };
    context.Math.random = () => 0.99;
    for (let completed = 1; completed <= 4; completed++) {
        await api.resolveAllMoves();
        assert.equal(state.resources[0].food, completed === 4 ? 1 : 0,
            'Production happens after the fourth resolved round, not at the start of round four');
    }
    assert.equal(state.round, 5);
    assert.equal(state.lastResourceProductionRound, 4);
    context.Math.random = Math.random;
    start();
    assert.equal(state.resources[0].food, 0, 'New games reset accumulated resources');
    assert.equal(state.lastResourceProductionRound, null, 'New games reset production history');
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
    assert.equal(state.phase, 'PLANNING', 'Sandbox matches may start without required objective units');
    assert(state.objectives.flat().every(objective => objective.kind !== 'death' || objective.unitId),
        'Missing sandbox units must not create invalid death objectives');
    assert(!api.isValidSavedSetup({ activePlayers: [true, true, false, false], board: state.customSetupBoard }));
    assert(api.isValidSavedSetup({ sandbox: true,
        activePlayers: [true, true, false, false], board: state.customSetupBoard }));

    for (const size of [12, 16]) {
        state.boardSize = size;
        api.showCustomSetup([true, true, false, false]);
        document.getElementById('custom-map-seed').value = 'sandbox-persistence';
        api.generateCustomMapPreview();
        const mapBefore = JSON.stringify(api.getCustomMap().biomes);
        const resourcesBefore = JSON.stringify(api.getCustomMap().provinceResources);
        for (const [type, column] of [['k', 0], ['k', 0], ['r', 1], ['r', 2]]) {
            state.customSetupType = type;
            api.placeCustomPiece(0, column);
        }
        assert.equal(JSON.stringify(api.getCustomMap().biomes), mapBefore,
            'Adding duplicate kings and adjacent towers must preserve generated terrain');
        assert.equal(JSON.stringify(api.getCustomMap().provinceResources), resourcesBefore);
        document.getElementById('custom-edit-tool').value = 'biome';
        document.getElementById('custom-biome').value = 'mountain';
        api.editCustomSquare(0, 0);
        assert.equal(api.getCustomMap().biomes[0][0], 'mountain',
            'Sandbox terrain may be painted even underneath pieces');
        document.getElementById('custom-edit-tool').value = 'resource';
        const chance = document.getElementById('custom-resource-chance');
        chance.checkValidity = () => true;
        chance.value = '100';
        document.getElementById('custom-resource-type').value = 'gold';
        api.editCustomSquare(0, 0);
        chance.value = '0';
        document.getElementById('custom-resource-type').value = 'wood';
        api.editCustomSquare(0, 0);
        chance.value = '12.5';
        document.getElementById('custom-resource-type').value = 'gold';
        api.editCustomSquare(0, 0);
        let resources = api.getCustomMap().provinceResources[0];
        assert.equal(resources.length, 2, 'Different resource types may share a square');
        assert.equal(resources.find(resource => resource.type === 'gold').productionChance, 12.5,
            'Painting the same resource updates its individual probability');
        assert(api.isValidCustomMap(api.getCustomMap(), size));
        const expectedMap = JSON.parse(JSON.stringify(api.getCustomMap()));
        api.confirmCustomSetup();
        assert.equal(JSON.stringify(state.biomes), JSON.stringify(expectedMap.biomes));
        assert.equal(JSON.stringify(state.provinceResources), JSON.stringify(expectedMap.provinceResources));
        assert.equal(state.board[0][0].contents.filter(unit => unit.type === 'k').length, 2);
        api.showCustomSetup([true, true, false, false], state.customSetupBoard, expectedMap);
        document.getElementById('custom-edit-tool').value = 'erase-resource';
        api.editCustomSquare(0, 0);
        assert.equal(api.getCustomMap().provinceResources[0].length, 0);
        document.getElementById('custom-edit-tool').value = 'erase-piece';
        api.editCustomSquare(0, 0);
        assert.equal(state.customSetupBoard[0][0], null);
        assert.equal(api.getCustomMap().biomes[0][0], 'mountain',
            'Erasing pieces and resources must leave painted biomes intact');
        state.customSetupType = 'p';
        for (const column of [3, 4, 5]) api.placeCustomPiece(1, column);
        document.getElementById('custom-edit-tool').value = 'erase-piece';
        api.editCustomSquare(1, 4);
        api.placeCustomPiece(1, 6);
        const names = state.customSetupBoard.flat().filter(Boolean)
            .flatMap(piece => piece.contents).map(unit => unit.name);
        assert.equal(new Set(names).size, names.length,
            'Erasing and replacing pieces must not duplicate existing unit names');
    }
    state.boardSize = 16;

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
    state.biomes[3][3] = 'hill';
    const defender = state.board[0][10];
    const enemy = state.board[4][10];
    const ally = state.board[0][9];
    state.board[0][10] = state.board[4][10] = state.board[0][9] = null;
    state.board[3][3] = defender;
    state.board[2][3] = enemy;
    state.board[3][2] = ally;
    state.hillHeld = Array.from({ length: 16 }, () => Array(16).fill(null));
    state.hillHeld[3][3] = { player: 1, ids: defender.contents.map(unit => unit.id) };
    let displayedBattle;
    context.renderBattleCandidates = group => { displayedBattle = group; };
    api.processCollisionGroup({
        type: 'TARGET', targetSquare: [3, 3], candidates: [
            { player: 1, pieceId: defender.id, from: [3, 3], to: [3, 3],
                pieceType: defender.type, contents: defender.contents, isStationary: true },
            { player: 1, pieceId: ally.id, from: [3, 2], to: [3, 3],
                pieceType: ally.type, contents: ally.contents },
            { player: 2, pieceId: enemy.id, from: [2, 3], to: [3, 3],
                pieceType: enemy.type, contents: enemy.contents }
        ]
    });
    assert.equal(displayedBattle.candidates.find(candidate => candidate.player === 1).terrainBonus, 0.25,
        'The held hill bonus must survive the real same-player merge');
    assert.equal(displayedBattle.candidates.find(candidate => candidate.player === 2).terrainBonus, 0,
        'Arriving attackers must not receive the hill bonus');
    console.log('Objective rules, capture, privacy and round-resolution checks passed');
}
run().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
