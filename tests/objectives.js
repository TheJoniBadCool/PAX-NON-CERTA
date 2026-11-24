// Run with: node tests/objectives.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const classes = new Set();
    const handlers = {};
    return {
        innerHTML: '', innerText: '', value: '', checked: false, style: {}, handlers, children: [],
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
    setTimeout(fn) { fn(); }, clearTimeout() {}, requestAnimationFrame() {},
    bindBoardInteractions() {}, renderBoard() {}, renderBattleCandidates() {}, renderBattleRolls() {},
    renderCaptureChoices() {},
    renderCustomSetupBoard() {}, renderCustomSetupPlayers() {},
    renderAllSavedSetups() {}, renderSavedSetups() {}, logAction() {}, logRoundHeader() {},
    Multiplayer: {
        isEditingSetup() { return false; },
        isPendingCommit: () => false,
        getBadge() { return { text: 'Planning', ready: false }; },
        refreshControls() {}, broadcastResolutionStart() {},
        beginNextRound() { context.nextRound = true; },
        onGameOver() { context.gameOver = true; }
    }
});
[
    'constants', 'models', 'game-state', 'planning-timer', 'diplomacy-rules', 'setup-utils', 'board-utils',
    'capital-rules', 'battle-rules',
    'siege-rules', 'movement-rules', 'planning-rules', 'retreat-rules', 'prisoner-rules', 'objective-rules', 'mission-rules',
    'board-setup', 'starting-position', 'setup-actions', 'resource-purchases', 'status-ui',
    'province-food', 'allied-resolution', 'path-planning', 'game'
].forEach(name => vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
context.animatePlannedMovements = async () => {};
context.renderMapPreview = () => {};
const api = vm.runInContext(`({
    state: gameState, startNewGame, initializeObjectives, updateObjectiveScores,
    resolveObjectiveRound, resolveAllMoves, processCollisionGroup, renderObjectives,
    initializeMissions, issueMissionBatches, finishMissionRound, updateMissionProgress,
    recordMissionBattle, recordMissionAttack, recordMissionRaid, recordMissionCastleOwnership,
    getMissionTargetSquares, getMissionLabel, resolveResourceProduction, registerSiegeStarts,
    beginCaptureChoices, decideCapture, restorePrisoner,
    confirmCustomSetup, showCustomSetup, generateCustomMapPreview, getHotseatMapSignature, isValidSavedSetup,
    showPrivacyOverlay, queueUnmergePlan, players: PLAYERS,
    updateCapitalResourceOption, getCustomMapSignature, ensureCustomMap, refreshCustomMapPreview,
    getUnitResourceStore, refreshResourceTotals,
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
    state.missionBatches = [null, null, null, null];
    state.missionPoints = [0, 0, 0, 0];
    const units = state.board.flat().filter(Boolean).flatMap(piece => piece.contents);
    state.objectives = players.map((player, index) => {
        if (!state.activePlayers[index]) return [];
        const enemy = players.find((other, i) => i !== index && state.activePlayers[i]);
        const king = units.find(unit => unit.player === enemy.id && unit.type === 'k');
        const queen = units.find(unit => unit.player === enemy.id && unit.type === 'q');
        const castle = units.find(unit => unit.player === enemy.id && unit.type === 'r');
        const ownKing = units.find(unit => unit.player === player.id && unit.type === 'k');
        const castleGoal = (unit, kind, points) => ({
            kind, castleId: unit.castleId, castlePlayer: unit.player,
            castleLetter: unit.castleLetter, castleSquare: unit.castleSquare, points
        });
        return [
            { kind: 'defeat', targetPlayer: enemy.id, points: 4 },
            { kind: 'death', unitId: king.id, targetPlayer: enemy.id, unitType: 'king', points: 3 },
            { kind: 'death', unitId: queen.id, targetPlayer: enemy.id, unitType: 'queen', unitName: queen.name, points: 2 },
            castleGoal(castle, 'conquer', 1),
            { kind: 'death', unitId: ownKing.id, targetPlayer: player.id, self: true, label: 'Your king is dead', points: -4 },
            ...units.filter(unit => unit.player === player.id && unit.type === 'r')
                .map(unit => castleGoal(unit, 'lose', -3))
        ].map(objective => ({ ...objective, completed: false }));
    });
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
    context.Math.random = () => 0.5;
    document.getElementById('map-preview').innerHTML = 'old preview';
    document.getElementById('btn-random-seed').handlers.click();
    assert.equal(document.getElementById('map-seed').value, '2147483648');
    assert.equal(document.getElementById('map-preview').innerHTML, '');
    assert.equal(document.getElementById('btn-start-selected-game').disabled, true);
    assert.match(document.getElementById('map-preview-status').innerText, /Settings changed/);
    delete context.Math.random;
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
    document.getElementById('custom-resource-balance').handlers.change({ target: { value: 'tiered' } });
    assert.equal(state.resourceBalance, 'tiered');
    assert.equal(balanceSelector.value, 'tiered');
    document.getElementById('custom-resource-balance').handlers.change({ target: { value: 'off' } });
    assert.equal(state.resourceBalance, 'off');
    assert.equal(balanceSelector.value, 'off');
    resourceSelector.value = '8';
    state.resourceMode = '8';
    const generatedKinds = new Set();
    const generatedCounts = new Set();
    const generatedPoints = new Set();
    let sawRepeatedKind = false;
    let randomSeed = 123456;
    context.Math.random = () => {
        randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
        return randomSeed / 4294967296;
    };
    for (let i = 0; i < 200; i++) {
        start(i % 2 ? 2 : 4);
        state.provinceResources[0] = { type: 'gold', productionChance: 100 };
        api.initializeObjectives();
        state.objectives.forEach((objectives, index) => {
            if (!state.activePlayers[index]) {
                assert.equal(objectives.length, 0);
                return;
            }
            assert(objectives.length >= 6 && objectives.length <= 10);
            generatedCounts.add(objectives.length);
            if (new Set(objectives.map(objective => objective.kind)).size < objectives.length) sawRepeatedKind = true;
            objectives.forEach(objective => {
                generatedKinds.add(objective.kind);
                generatedPoints.add(Math.abs(objective.points));
                assert(Math.abs(objective.points) >= 2 && Math.abs(objective.points) <= 6);
                if (['defeat', 'protector'].includes(objective.kind)) {
                    assert.notEqual(objective.targetPlayer, index + 1);
                }
            });
            assert.equal(state.scores[index], 0);
            assert(objectives.every(objective => !objective.completed));
        });
    }
    context.Math.random = Math.random;
    assert.deepEqual([...generatedCounts].sort((a, b) => a - b), [6, 7, 8, 9, 10]);
    assert.deepEqual([...generatedPoints].sort(), [2, 3, 4, 5, 6]);
    assert(sawRepeatedKind, 'Objective kinds can be repeated');
    for (const kind of ['defeat', 'death', 'conquer', 'lose', 'protector', 'bounty',
        'expansionist', 'monopolist', 'richest', 'army']) {
        assert(generatedKinds.has(kind), `Expected random objective kind ${kind}`);
    }
    assert(!generatedKinds.has('castle-lord'), 'Castle Lord is no longer a random objective');

    start();
    state.objectives = [[
        { kind: 'expansionist', points: 2 },
        { kind: 'army', points: 4 },
        { kind: 'richest', points: 5 },
        { kind: 'monopolist', resourceType: 'gold', points: 6 }
    ], [], [], []];
    state.provinceResources = Array(16).fill(null);
    state.provinceResources[0] = [{ type: 'gold', productionChance: 100 }];
    state.provinceResources[4] = [{ type: 'gold', productionChance: 0 }];
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0, 'Ties, zero gold, and split production do not score');
    const enemyCastle = state.board[4][0].contents[0].castleId;
    changeCastleOwner(enemyCastle, 1);
    state.resources[0].gold = 2;
    state.resources[1].gold = 1;
    state.board[4][10] = null;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 17, 'Each unique lead and complete monopoly earns its reward');
    state.resources[1].gold = 2;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 12, 'A tied gold stockpile revokes the reward');
    state.eliminated[1] = true;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 17, 'Eliminated players do not prevent a unique lead');
    state.eliminated[1] = false;
    changeCastleOwner(enemyCastle, 2);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 4, 'Losing province, castle, and resource leads revokes those rewards');
    state.retreating[1].push({ player: 2, contents: [{ id: 'retreat', player: 2, type: 'p' }] });
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0, 'Retreating combat units count towards the army tie');
    state.retreating[1][0].contents[0].prisonerOf = 2;
    state.retreating[1][0].contents[0].originalPlayer = 1;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 4, 'Prisoners do not count as combat units');
    state.provinceResources[4] = null;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 10, 'Controlling every remaining site establishes a monopoly');
    state.provinceResources[0] = null;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 4, 'A nonexistent resource is not a monopoly');

    start();
    state.provinceResources = Array(16).fill(null);
    state.provinceResources[0] = { type: 'gold', productionChance: 100 };
    state.objectives = [[{ kind: 'richest', points: 20 }], [], [], []];
    context.Math.random = () => 0;
    await api.resolveAllMoves();
    context.Math.random = Math.random;
    assert.equal(state.resources[0].gold, 1);
    assert.equal(state.scores[0], 20, 'Gold produced this round counts before scoring');
    assert.equal(state.phase, 'GAME_OVER', 'A production-driven lead can win immediately');

    start();
    state.objectives = [[{ kind: 'bounty', points: 5 }], [], [], []];
    const captiveKing = state.board[4][8].contents[0];
    state.board[4][8] = null;
    state.phase = 'RESOLVING';
    api.beginCaptureChoices(1, [captiveKing], [0, 9]);
    assert(api.decideCapture(1, state.pendingCapture.id, captiveKing.id, 'keep'));
    let prisoner = state.board[0][9].contents.find(unit => unit.id === captiveKing.id);
    assert.equal(prisoner.prisonerSinceRound, 1);
    for (let round = 2; round <= 9; round++) {
        state.round = round;
        api.updateObjectiveScores();
        assert.equal(state.scores[0], 0, 'Capture round is not a full round in captivity');
    }
    state.retreating[0] = [{ player: 1, contents: [prisoner] }];
    state.board[0][9].contents = state.board[0][9].contents.filter(unit => unit.id !== prisoner.id);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0, 'Retreat does not prematurely complete the bounty');
    state.retreating[0] = [];
    state.board[0][9].contents.push(prisoner);
    const released = api.restorePrisoner(prisoner);
    state.board[0][9].contents = state.board[0][9].contents.filter(unit => unit.id !== prisoner.id);
    api.beginCaptureChoices(1, [released], [0, 9]);
    assert(api.decideCapture(1, state.pendingCapture.id, released.id, 'keep'));
    prisoner = state.board[0][9].contents.find(unit => unit.id === released.id);
    assert.equal(prisoner.prisonerSinceRound, 9, 'Recapture starts a new captivity period');
    state.round = 17;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 0);
    state.round = 18;
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 5, 'Eight full consecutive rounds complete the bounty');
    state.board[0][9].contents = state.board[0][9].contents.filter(unit => unit.id !== prisoner.id);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 5, 'A completed bounty remains earned after release');

    start(4);
    state.objectives = [
        [{ kind: 'protector', targetPlayer: 2, points: -20 }],
        [{ kind: 'protector', targetPlayer: 3, points: -20 }],
        [{ kind: 'death', unitId: 'missing', points: -20 }],
        [{ kind: 'defeat', targetPlayer: 1, points: 20 }]
    ];
    const cascadingResult = api.resolveObjectiveRound();
    assert(state.eliminated[0] && state.eliminated[1] && state.eliminated[2],
        'Protector penalties cascade until no further players are defeated');
    assert.equal(cascadingResult.winners[0], 3);

    api.startNewGame([true, true, false, false], null, 16, 'province-castles');
    for (let player = 1; player <= 2; player++) {
        const castle = state.board.flat().find(piece => piece && piece.player === player);
        assert.equal(state.board.flat().filter(piece => piece && piece.player === player).length, 1);
        assert.equal(castle.contents.length, 7);
        assert(state.objectives[player - 1].filter(objective => objective.kind === 'lose')
            .every(objective => objective.castleId === castle.contents.find(unit => unit.type === 'r').castleId),
            'Loss objectives must refer to the physical starting castle');
    }

    start();
    state.provinceResources[0] = { type: 'food', productionChance: 100 };
    context.Math.random = () => 0.99;
    for (let completed = 1; completed <= 4; completed++) {
        await api.resolveAllMoves();
        assert.equal(state.resources[0].food, completed,
            'Default production happens after each completed round');
        assert.equal(state.lastResourceProductionRound, completed);
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
        document.getElementById('fog-sight').value = 'small';
        api.showCustomSetup([true, true, false, false]);
        assert.equal(state.fogSight, 'small', 'Custom setup uses the selected Hotseat sight');
        document.getElementById('custom-map-seed').value = 'sandbox-persistence';
        api.generateCustomMapPreview();
        const mapBefore = JSON.stringify(api.getCustomMap().biomes);
        const resourcesBefore = JSON.stringify(api.getCustomMap().provinceResources);
        context.Math.random = () => 0.25;
        context.Multiplayer.isEditingSetup = () => true;
        document.getElementById('btn-custom-random-seed').handlers.click();
        assert.equal(document.getElementById('custom-map-seed').value, '1073741824');
        assert.equal(document.getElementById('map-seed').value, '1073741824');
        assert.equal(document.getElementById('mp-map-seed').value, '1073741824');
        assert.equal(JSON.stringify(api.getCustomMap().biomes), mapBefore);
        assert.equal(JSON.stringify(api.getCustomMap().provinceResources), resourcesBefore);
        context.Multiplayer.isEditingSetup = () => false;
        delete context.Math.random;
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
        assert.equal(state.fogSight, 'small', 'Starting a custom game preserves the selected Hotseat sight');
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
        'The permanent checklist must retain every objective');
    assert(!document.getElementById('objectives-list').innerHTML.includes('<tr'),
        'Checklist entries must use list markup');
    state.missionBatches[0] = {
        expiresRound: 12,
        missions: [{ kind: 'attack-player', targetPlayer: 2, points: 2, status: 'active' }]
    };
    api.renderObjectives();
    assert(!document.getElementById('objectives-list').innerHTML.includes('Attack Blue'));
    const temporaryObjectives = document.getElementById('temporary-objectives-list').innerHTML;
    assert(temporaryObjectives.includes('Attack Blue'));
    assert(temporaryObjectives.includes('<input type="checkbox" disabled'));
    assert(!temporaryObjectives.includes('· active'), 'Temporary objectives use a checkbox instead of status text');
    assert(!document.getElementById('temporary-objectives-panel').classList.contains('hidden'));
    state.missionBatches[0].missions[0].status = 'completed';
    api.renderObjectives();
    assert(document.getElementById('temporary-objectives-list').innerHTML.includes('disabled checked'),
        'Completed temporary objectives show a checked box');
    state.missionBatches[0] = null;
    api.renderObjectives();
    assert(document.getElementById('temporary-objectives-panel').classList.contains('hidden'));
    api.showPrivacyOverlay();
    assert(document.getElementById('objectives-panel').classList.contains('hidden'));
    assert.equal(document.getElementById('objectives-list').innerHTML, '');
    state.phase = 'RESOLVING';
    api.renderObjectives();
    assert.equal(document.getElementById('objectives-list').innerHTML, '');
    state.multiplayer = true;
    state.turnIndex = 1;
    api.renderObjectives();
    assert(document.getElementById('objectives-score').innerText.includes('Win: 20 | Defeat: -20'));
    assert(document.getElementById('objectives-list').innerHTML.includes('Red is defeated'));
    assert(!document.getElementById('objectives-list').innerHTML.includes('Blue is defeated'));

    // Exercise the real capture code, which changes unit IDs and names.
    start();
    const tower = state.board[4][0];
    const castleId = tower.contents[0].castleId;
    const towerUnit = tower.contents.find(unit => unit.type === 'r');
    api.getUnitResourceStore(towerUnit, true).gold = 2;
    let rolls = 0;
    context.Math.random = () => rolls++ === 0 ? 0 : 0.99;
    const attacker = state.board[0][10];
    const battleMission = { kind: 'attack-player', targetPlayer: 2, points: 1, status: 'active' };
    state.missionBatches[0] = { startRound: 1, expiresRound: 12, missions: [battleMission] };
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
    assert(battleMission.triggered, 'Real collision battles record mission attacks');
    assert.equal(state.board[4][0].player, 1);
    assert.equal(state.board[4][0].contents.find(unit => unit.type === 'r').castleId, castleId);
    assert.equal(state.board[4][0].contents.find(unit => unit.type === 'r').resourceStockpile.gold, 2,
        'Tower stock follows its Tower unit when captured');
    api.refreshResourceTotals();
    assert.equal(state.resources[0].gold, 2);
    assert.equal(state.resources[1].gold, 0,
        'Player totals are reassigned to the new Tower owner after capture');
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
    assert.notEqual(state.phase, 'GAME_OVER', 'The last player must still reach 20');
    assert.equal(state.scores[0], 4);

    start();
    state.objectives[0] = [{ kind: 'death', unitId: 'missing', points: 19 }];
    state.objectives[1] = [{ kind: 'death', unitId: 'missing', points: -19 }];
    await api.resolveAllMoves();
    assert.notEqual(state.phase, 'GAME_OVER', 'Nineteen points must not win');
    assert(!state.eliminated[1], 'Minus nineteen must not defeat a player');

    start();
    removeType(2, 'k');
    removeType(2, 'q');
    state.board.flat().filter(piece => piece && piece.player === 2 && piece.type === 'r')
        .forEach(piece => changeCastleOwner(piece.contents[0].castleId, 1));
    state.objectives[0] = [{ kind: 'defeat', targetPlayer: 2, points: 20 }];
    state.objectives[1] = [{ kind: 'death', unitId: 'missing', points: -20 }];
    state.multiplayer = true;
    await api.resolveAllMoves();
    assert(state.eliminated[1], 'A -20 player is defeated');
    assert.equal(state.scores[0], 20, 'Enemy-defeat rewards apply before checking victory');
    assert.equal(state.scores[1], -20);
    assert.equal(state.phase, 'GAME_OVER');
    assert(context.gameOver, 'Multiplayer must receive the game-over notification');

    start(4);
    state.eliminated[2] = state.eliminated[3] = true;
    state.objectives[0] = [{ kind: 'defeat', targetPlayer: 3, points: 20 }];
    state.objectives[1] = [{ kind: 'defeat', targetPlayer: 4, points: 21 }];
    await api.resolveAllMoves();
    assert.equal(state.phase, 'GAME_OVER', 'Scores above 20 also win');
    assert.equal(document.getElementById('gameover-title').innerText, 'Red & Blue Win!');

    start();
    state.objectives[0] = [{ kind: 'death', unitId: 'missing', points: -20 }];
    state.objectives[1] = [{ kind: 'death', unitId: 'missing', points: -21 }];
    await api.resolveAllMoves();
    assert.equal(state.phase, 'GAME_OVER');
    assert.equal(document.getElementById('gameover-title').innerText, 'Draw!');
    assert(state.eliminated[0] && state.eliminated[1]);
    state.objectives[0] = [];
    api.resolveObjectiveRound();
    assert(state.eliminated[0], 'Defeat remains permanent if the score recovers');

    start();
    state.provinceResources[0] = [{ type: 'gold', productionChance: 0, row: 1, column: 1 }];
    state.provinceResources[4] = [{ type: 'wood', productionChance: 100, row: 5, column: 1 }];
    const kinds = new Set();
    let seed = 43;
    const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    for (let i = 0; i < 200; i++) {
        api.issueMissionBatches(1, random);
        for (const batch of state.missionBatches.filter(Boolean)) {
            assert.equal(batch.missions.length, 3);
            assert.equal(batch.startRound, 1);
            assert.equal(batch.expiresRound, 12);
            batch.missions.forEach(mission => {
                kinds.add(mission.kind);
                assert([1, 2].includes(mission.points));
                if (mission.required) assert(mission.required >= 4 && mission.required <= 8);
            });
        }
    }
    for (const kind of ['attack-player', 'attack-unit', 'take-castle', 'raid', 'fallback',
        'hold-castle', 'hold-province', 'avoid-player', 'protect-unit', 'protect-resource']) {
        assert(kinds.has(kind), `Mission generation must include ${kind}`);
    }

    const mission = (kind, extra = {}) => ({ kind, points: 2, status: 'active', ...extra });
    const setBatch = (index, missions, startRound = 1) => {
        state.missionBatches[index] = { startRound, expiresRound: startRound + 11, missions };
    };
    start();
    state.objectives = [[], [], [], []];
    const red = state.board[0][10];
    const blue = state.board[4][10];
    const targetUnit = { id: blue.contents[0].id, name: blue.contents[0].name };
    const redUnit = { id: red.contents[0].id, name: red.contents[0].name };
    const attack = mission('attack-player', { targetPlayer: 2 });
    const attackUnit = mission('attack-unit', { targetPlayer: 2, targetUnit });
    const protectedUnit = mission('protect-unit', { targetUnit: redUnit });
    setBatch(0, [attack, attackUnit, protectedUnit]);
    api.recordMissionBattle([red, blue]);
    state.round = 2;
    api.finishMissionRound(1);
    api.updateObjectiveScores();
    assert.equal(attack.status, 'completed');
    assert.equal(attackUnit.status, 'completed');
    assert.equal(protectedUnit.status, 'failed');
    assert.equal(state.scores[0], 4, 'Successful missions add permanent points once');
    api.finishMissionRound(1);
    assert.equal(state.missionPoints[0], 4, 'Re-evaluation does not duplicate mission rewards');
    state.round = 13;
    api.finishMissionRound(12);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], 4, 'Completed rewards survive batch expiration');

    start();
    const prisonerOnly = { player: 2, contents: [{ id: 'captured-only', player: 2,
        type: 'p', prisonerOf: 2, originalPlayer: 1 }] };
    const noBattle = mission('attack-player', { targetPlayer: 2 });
    setBatch(0, [noBattle]);
    api.recordMissionBattle([state.board[0][10], prisonerOnly]);
    assert(!noBattle.triggered, 'Capturing an unopposed prisoner is not a battle');

    start();
    const raidingPawn = state.board[0][10];
    const defenderCastle = state.board[4][0];
    state.board[0][10] = null;
    state.board[4][1] = raidingPawn;
    const siegeAttack = mission('attack-player', { targetPlayer: 2 });
    const siegeProtection = mission('avoid-player', { targetPlayer: 1 });
    setBatch(0, [siegeAttack]);
    setBatch(1, [siegeProtection]);
    const siegeStore = api.getUnitResourceStore(state.board[0][0].contents[0], true);
    siegeStore.food = 2;
    siegeStore.wood = 2;
    api.refreshResourceTotals();
    api.registerSiegeStarts([{
        player: 1, pieceId: raidingPawn.id, from: [4, 1], to: [4, 0],
        contents: raidingPawn.contents
    }]);
    assert(siegeAttack.triggered, 'Starting a siege records an attack');
    assert.equal(siegeProtection.status, 'failed', 'A siege breaks player protection');
    assert(defenderCastle === state.board[4][0]);

    start();
    state.objectives = [[], [], [], []];
    const avoid = mission('avoid-player', { targetPlayer: 2 });
    setBatch(0, [avoid, mission('attack-player', { targetPlayer: 2 }), mission('attack-player', { targetPlayer: 2 })]);
    api.recordMissionAttack(state.board[4][10], state.board[0][10]);
    assert.equal(avoid.status, 'failed');
    state.round = 13;
    api.finishMissionRound(12);
    api.updateObjectiveScores();
    assert.equal(state.scores[0], -2, 'A batch with no successes has one permanent penalty');
    api.finishMissionRound(12);
    assert.equal(state.missionPoints[0], -2, 'The expiration penalty applies only once');

    start();
    state.objectives = [[], [], [], []];
    const safe = mission('avoid-player', { targetPlayer: 2 });
    setBatch(0, [safe]);
    state.round = 12;
    api.finishMissionRound(11);
    assert.equal(safe.status, 'active');
    state.round = 13;
    api.finishMissionRound(12);
    assert.equal(safe.status, 'completed', 'Protection missions complete on the last round');
    assert.equal(state.missionPoints[0], 2);

    start();
    state.objectives = [[], [], [], []];
    const goldSite = { province: 0, resourceType: 'gold', square: [1, 1] };
    state.provinceResources = Array(16).fill(null);
    state.provinceResources[0] = [{ type: 'gold', productionChance: 0, row: 1, column: 1 }];
    const raid = mission('raid', { ...goldSite, targetPlayer: 1 });
    const protectSite = mission('protect-resource', { ...goldSite, targetPlayer: 1 });
    setBatch(0, [protectSite]);
    setBatch(1, [raid]);
    state.board[1][1] = state.board[4][10];
    state.board[4][10] = null;
    assert(api.resolveResourceProduction(1, () => 0.99));
    assert.equal(protectSite.status, 'failed', 'A raid attempt fails protection even when production fails');
    state.round = 2;
    api.finishMissionRound(1);
    assert.equal(raid.status, 'completed', 'An eligible raider completes a raid even when production fails');

    start();
    state.objectives = [[], [], [], []];
    state.provinceResources = Array(16).fill(null);
    state.provinceResources[0] = [{ type: 'gold', productionChance: 0, row: 1, column: 1 }];
    const lastRoundRaid = mission('raid', { ...goldSite, targetPlayer: 1 });
    const lastRoundProtection = mission('protect-resource', { ...goldSite, targetPlayer: 1 });
    setBatch(0, [lastRoundProtection]);
    setBatch(1, [lastRoundRaid]);
    state.board[1][1] = state.board[4][10];
    state.board[4][10] = null;
    state.round = 12;
    await api.resolveAllMoves();
    assert.equal(lastRoundRaid.status, 'completed', 'Raids on the final round are recorded before expiry');
    assert.equal(lastRoundProtection.status, 'failed');
    assert.equal(state.scores[0], -2);
    assert.equal(state.scores[1], 2);

    start();
    state.objectives = [[], [], [], []];
    const pawn = state.board[0][10];
    const pawnInfo = { id: pawn.contents[0].id, name: pawn.contents[0].name };
    const destination = 4;
    const hold = mission('hold-province', { targetUnit: pawnInfo, province: destination, required: 4, streak: 0 });
    const fallback = mission('fallback', { units: [pawnInfo], all: false });
    setBatch(0, [hold, fallback]);
    state.board[4][10] = pawn;
    state.board[0][10] = null;
    state.board[4][1] = pawn;
    state.board[4][10] = null;
    for (let round = 1; round <= 3; round++) {
        state.round = round + 1;
        api.finishMissionRound(round);
    }
    assert.equal(hold.streak, 3);
    api.finishMissionRound(3);
    assert.equal(hold.streak, 3, 'A round is never counted twice');
    assert.equal(fallback.status, 'active', 'An enemy-owned province does not satisfy fallback');
    state.board[8][1] = pawn;
    state.board[4][1] = null;
    state.round = 5;
    api.finishMissionRound(4);
    assert.equal(hold.streak, 0, 'Leaving the province resets the consecutive streak');
    state.board[4][1] = pawn;
    state.board[8][1] = null;
    for (let round = 5; round <= 8; round++) {
        state.round = round + 1;
        api.finishMissionRound(round);
    }
    assert.equal(hold.status, 'completed');
    state.board[0][1] = pawn;
    state.board[4][1] = null;
    state.round = 10;
    api.finishMissionRound(9);
    assert.equal(fallback.status, 'completed');

    start();
    const allFallback = mission('fallback', { all: true, units: [] });
    setBatch(0, [allFallback]);
    const ownCastle = state.board[0][0];
    for (const column of [8, 9, 10]) {
        ownCastle.contents.push(...state.board[0][column].contents);
        state.board[0][column] = null;
    }
    state.retreating[0] = [{ player: 1, contents: [{ id: 'fallback-retreat', player: 1, type: 'p' }] }];
    state.round = 2;
    api.finishMissionRound(1);
    assert.equal(allFallback.status, 'active', 'Fallback-all waits for retreating units');
    state.retreating[0] = [];
    state.round = 3;
    api.finishMissionRound(2);
    assert.equal(allFallback.status, 'completed');

    start();
    state.objectives = [[], [], [], []];
    const redCastle = state.board[0][0];
    const redPawn = state.board[0][10];
    const redPawnInfo = { id: redPawn.contents[0].id, name: redPawn.contents[0].name };
    const garrison = mission('hold-castle', { units: [redPawnInfo],
        castleId: redCastle.contents[0].castleId, required: 4, streak: 0, castleName: 'your Tower' });
    setBatch(0, [garrison]);
    redCastle.contents.push(...redPawn.contents);
    state.board[0][10] = null;
    for (let round = 1; round <= 4; round++) {
        state.round = round + 1;
        api.finishMissionRound(round);
    }
    assert.equal(garrison.status, 'completed', 'Named garrison units must remain in the specified castle');

    start();
    state.objectives = [[], [], [], []];
    const missionBlueCastle = state.board[4][0];
    const capture = mission('take-castle', { castleId: missionBlueCastle.contents[0].castleId, castleName: 'Blue Tower' });
    setBatch(0, [capture]);
    changeCastleOwner(capture.castleId, 1);
    api.recordMissionCastleOwnership();
    changeCastleOwner(capture.castleId, 2);
    state.round = 2;
    api.finishMissionRound(1);
    assert.equal(capture.status, 'completed', 'Taking a castle counts even if lost later in the round');

    start();
    state.objectives = [[], [], [], []];
    setBatch(0, [mission('attack-player', { targetPlayer: 2 })]);
    const firstBatch = state.missionBatches[0];
    state.round = 8;
    await api.resolveAllMoves();
    assert.equal(state.missionBatches[0], firstBatch, 'Missions do not refresh at the former 8-round boundary');
    state.round = 11;
    await api.resolveAllMoves();
    assert.equal(state.missionBatches[0], firstBatch, 'Missions remain active through round 12');
    state.round = 12;
    await api.resolveAllMoves();
    assert.equal(state.missionPoints[0], -2);
    assert.equal(state.scores[0], -2);
    assert.equal(state.missionBatches[0].startRound, 13, 'A fresh batch starts after the twelfth round');
    assert.equal(state.missionBatches[0].expiresRound, 24, 'The next batch lasts a full 12 rounds');
    assert.equal(state.missionBatches[0].missions.length, 3);
    state.round = 24;
    await api.resolveAllMoves();
    assert.equal(state.missionBatches[0].startRound, 25, 'Later batches refresh on the same cycle');

    start();
    state.objectives = [[], [], [], []];
    const realPawn = state.board[0][10];
    state.board[0][10] = null;
    state.board[0][1] = realPawn;
    setBatch(0, [mission('fallback', { units: [{ id: realPawn.contents[0].id, name: 'pawn' }], all: false })]);
    await api.resolveAllMoves();
    assert.equal(state.scores[0], 2, 'A mission success contributes to the actual end-of-round score');

    start();
    state.objectives = [[{ kind: 'death', unitId: 'missing', points: -18 }], [], [], []];
    setBatch(0, [mission('attack-player', { targetPlayer: 2 })]);
    state.round = 12;
    await api.resolveAllMoves();
    assert.equal(state.scores[0], -20);
    assert(state.eliminated[0], 'Batch expiration can eliminate a player in the same round');
    assert.equal(state.missionBatches[0], null, 'Eliminated players receive no new batch');

    state.multiplayer = false;
    api.startNewGame([true, true, false, false], setup());
    assert.equal(state.missionBatches[0].startRound, 1, 'The first mission batch is available at game start');
    assert.equal(state.missionBatches[0].missions.length, 3);
    const trackedUnit = state.board[4][10].contents[0];
    const tracked = mission('attack-unit', { targetPlayer: 2, targetUnit: { id: trackedUnit.id, name: trackedUnit.name } });
    setBatch(0, [tracked]);
    const boardElement = document.getElementById('board');
    boardElement.children = Array.from({ length: 256 }, () => element());
    const fogSquare = boardElement.children[4 * 16 + 10];
    fogSquare.classList.add('sq-fog');
    const button = { dataset: { missionIndex: '0' }, title: '', closest: () => button };
    document.getElementById('temporary-objectives-list').handlers.click({ target: button });
    assert(fogSquare.classList.contains('sq-mission-target'));
    assert(fogSquare.classList.contains('sq-fog'), 'Highlighting must not alter fog');
    state.board[5][10] = state.board[4][10];
    state.board[4][10] = null;
    document.getElementById('temporary-objectives-list').handlers.click({ target: button });
    assert(!fogSquare.classList.contains('sq-mission-target'));
    assert(boardElement.children[5 * 16 + 10].classList.contains('sq-mission-target'),
        'The target highlight follows the named unit');
    const playerTarget = mission('attack-player', { targetPlayer: 2 });
    const capitalTarget = api.getMissionTargetSquares(playerTarget, 1);
    assert.equal(capitalTarget.length, 1, 'Player-only missions locate only the capital');
    const capitalColumn = state.board[4][0].contents[0].id === state.capitalTowerIds[1] ? 0 : 4;
    assert.deepEqual(Array.from(capitalTarget[0]), [4, capitalColumn]);

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
