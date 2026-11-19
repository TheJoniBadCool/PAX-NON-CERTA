// Run with: node tests/resources.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const node = {
        children: [], className: '', title: '', innerText: '', html: '',
        style: { setProperty() {} },
        appendChild(child) { this.children.push(child); },
        addEventListener() {},
        setAttribute(name, value) { this[name] = value; },
        querySelector() { return element(); },
        set innerHTML(value) { this.children = []; this.html = value; }
    };
    const classes = new Set();
    node.classList = {
        add(name) { classes.add(name); node.className += ` ${name}`; },
        remove(name) { classes.delete(name); },
        toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
    };
    return node;
}
const elements = new Map();
const boardEl = element();
const customSetupBoardEl = element();
boardEl.parentElement = element();
const context = vm.createContext({
    console, document: {
        createElement: element,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        }
    }, boardEl, customSetupBoardEl, customMapPreview: null,
    placeCustomPiece() {}, randomLevel: () => 0,
    renderPlanArrows() {}, renderRetreatTable() {},
    activePlayerNameEl: element(), roundTagEl: element(),
    Multiplayer: {
        getBadge: () => ({ text: 'Ready', ready: true }),
        isPendingCommit: () => false,
        refreshControls() {}, onBoardRendered() {}
    }
});
['constants', 'models', 'game-state', 'diplomacy-rules', 'setup-utils', 'board-utils', 'movement-rules', 'planning-rules',
    'board-setup', 'board-renderer', 'setup-renderer', 'status-ui'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createStartingBoard, initBoard, generateProvinceResources,
       createSeededRandom, resolveResourceProduction, getProvinceIndex, createUnit,
       renderBoard, renderMapPreview, renderCustomSetupBoard, updatePlayerCards,
       isValidCustomMap, types: RESOURCE_TYPES, modes: RESOURCE_MODES })`, context);
const { state } = api;
const plain = value => JSON.parse(JSON.stringify(value));
const counts = (resources, key, values) => values.map(value =>
    resources.filter(resource => resource?.[key] === value).length);
const allPlayers = [true, true, true, true];
const quadrant = province => Math.floor(province / 8) * 2 + Math.floor((province % 4) / 2);

function assertBalanced(resources, requireAll) {
    for (let q = 0; q < 4; q++) {
        const group = resources.filter((resource, province) => resource && quadrant(province) === q);
        if (requireAll) assert(group.length > 0, 'Every quadrant must contain a resource');
        assert.equal(group.reduce((sum, resource) => sum + resource.productionChance, 0),
            group.length ? 25 : 0, 'Each populated quadrant totals exactly 25 percentage points');
        assert(group.every(resource => Number.isInteger(resource.productionChance) &&
            resource.productionChance >= 5), 'Balanced chances remain whole numbers of at least 5%');
    }
}

for (const size of [12, 16]) {
    for (const mode of ['8', '12', '16']) {
        state.resourceCapitals = false;
        const starting = api.createStartingBoard(allPlayers, size, 'resources', null, 'zero', mode);
        const resources = starting.provinceResources.filter(Boolean);
        assert.equal(resources.length, Number(mode));
        assert.deepEqual(counts(resources, 'type', Array.from(api.types, type => type.key)),
            plain(api.modes[mode].counts), 'Four-player maps use the exact resource list');
        assert(resources.every(resource => Number.isInteger(resource.productionChance) &&
            resource.productionChance >= 5 && resource.productionChance <= 95 &&
            !('number' in resource)), 'Each resource has a percentage instead of a production number');
        if (mode !== '16') {
            for (const province of [0, 3, 12, 15]) assert.equal(starting.provinceResources[province], null);
        }
        state.activePlayers = allPlayers;
        state.resourceMode = mode;
        api.initBoard(null, size, 'resources');
        assert.deepEqual(plain(state.provinceResources), plain(starting.provinceResources),
            'Starting a match must reproduce the preview resources');
        const other = api.createStartingBoard(allPlayers, size, 'resources', null, 'zero',
            mode === '8' ? '12' : '8');
        assert.deepEqual(plain(other.board), plain(starting.board), 'Resource mode must not move castles');
        assert.deepEqual(plain(other.biomes), plain(starting.biomes), 'Resource mode must not change terrain');

        api.renderBoard();
        const markers = boardEl.children.flatMap(square => square.children)
            .filter(child => child.className === 'province-resource');
        assert.equal(markers.length, Number(mode), 'One icon per resource-bearing province');
        assert(markers.every(marker => !/\d/.test(marker.innerText) &&
            /Production chance: \d+% every 4 rounds/.test(marker.title)));
        assert(boardEl.children.some(square => square.className.includes('sq-fog') &&
            square.children.some(child => child.className === 'province-resource')),
        'Resource icons remain visible in fog');
        const preview = element();
        api.renderMapPreview(preview, starting, size);
        assert.equal(preview.children.flatMap(square => square.children)
            .filter(child => child.className === 'province-resource').length, Number(mode));
        state.customSetupBoard = starting.board;
        context.customMapPreview = { starting };
        api.renderCustomSetupBoard();
        assert.equal(customSetupBoardEl.children.length, size * size);
        for (let index = 0; index < size * size; index++) {
            const square = customSetupBoardEl.children[index];
            const biome = starting.biomes[Math.floor(index / size)][index % size];
            assert(square.classList.contains(`biome-${biome}`),
                'The placement grid displays the generated biome on every square');
            assert.deepEqual(plain(square.children.filter(child => child.className === 'province-resource')),
                plain(preview.children[index].children.filter(child => child.className === 'province-resource')),
                'Placement resource markers and tooltips match the generated preview');
            for (let player = 1; player <= 4; player++) {
                assert.equal(square.classList.contains(`zone-p${player}`),
                    preview.children[index].classList.contains(`zone-p${player}`));
            }
            if (starting.board[Math.floor(index / size)][index % size]) {
                assert(square.html.includes('<svg'), 'Placement pieces stay visible over the map');
            }
        }
        context.customMapPreview = null;
        api.renderCustomSetupBoard();
        assert(customSetupBoardEl.children.every(square => !square.className.includes('biome-') &&
            !square.children.some(child => child.className === 'province-resource')),
        'Invalidated previews remove terrain and resources from the placement grid');
        starting.provinceResources.forEach((resource, province) => {
            if (!resource) return;
            const minRow = Math.floor(Math.floor(province / 4) * size / 4);
            const minColumn = Math.floor((province % 4) * size / 4);
            state.biomes[minRow][minColumn] = 'mountain';
            state.biomes[minRow][minColumn + 1] = 'plains';
        });
        api.renderBoard();
        const resourcePreview = element();
        api.renderMapPreview(resourcePreview, { ...starting, biomes: state.biomes }, size);
        for (const grid of [boardEl, resourcePreview]) {
            const resourceSquares = grid.children.filter(square => square.children.some(child =>
                child.className === 'province-resource'));
            assert.equal(resourceSquares.length, Number(mode),
                'Moving resources away from mountains must preserve their count');
            assert(resourceSquares.every(square => !square.className.includes('biome-mountain')),
                'No resource may be displayed on mountains');
            starting.provinceResources.forEach((resource, province) => {
                if (!resource) return;
                const minRow = Math.floor(Math.floor(province / 4) * size / 4);
                const minColumn = Math.floor((province % 4) * size / 4);
                const type = api.types.find(type => type.key === resource.type);
                assert(grid.children[minRow * size + minColumn + 1].children.some(child =>
                    child.className === 'province-resource' && child.innerText === type.icon),
                'Each resource moves to the first non-mountain square in its own province');
            });
        }
        const alternate = api.createStartingBoard(allPlayers, size, 'resources-alternate', null, 'zero', mode);
        assert.notDeepEqual(plain(starting.provinceResources), plain(alternate.provinceResources),
            'Different seeds shuffle resource assignments');
    }
}

for (const size of [12, 16]) {
    for (const mode of ['8', '12', '16']) {
        for (const balance of ['allow-empty', 'require-all']) {
            state.resourceCapitals = false;
            const starting = api.createStartingBoard(allPlayers, size, 'balanced-map', null, 'zero', mode, balance);
            assertBalanced(starting.provinceResources, balance === 'require-all');
            assert.equal(starting.provinceResources.filter(Boolean).length, Number(mode));
            state.activePlayers = allPlayers;
            state.resourceMode = mode;
            state.resourceBalance = balance;
            api.initBoard(null, size, 'balanced-map');
            assert.deepEqual(plain(state.provinceResources), plain(starting.provinceResources),
                'Balanced preview and game must match');
            const unbalanced = api.createStartingBoard(allPlayers, size, 'balanced-map', null, 'zero', mode, 'off');
            assert.deepEqual(plain(starting.board), plain(unbalanced.board));
            assert.deepEqual(plain(starting.biomes), plain(unbalanced.biomes));
            assert.deepEqual(counts(starting.provinceResources, 'type', Array.from(api.types, type => type.key)),
                plain(api.modes[mode].counts));
        }
    }
}
state.resourceBalance = 'off';
state.resourceCapitals = false;

for (const players of [[true, true, false, false], [true, true, true, false]]) {
    for (const mode of ['8', '12', '16']) {
        const starting = api.createStartingBoard(players, 12, 'scaled', null, 'zero', mode);
        const rebelCount = 16 - players.filter(Boolean).length;
        const total = mode === '8' ? rebelCount - 4 : mode === '16' ? 16 : rebelCount;
        const resources = starting.provinceResources.filter(Boolean);
        assert.equal(resources.length, total);
        const capitalsAllowed = api.generateProvinceResources(starting.board, mode,
            api.createSeededRandom('scaled-capitals'), 'off', true);
        assert.equal(capitalsAllowed.filter(Boolean).length, total,
            'Allowing capitals preserves counts scaled to the original rebel count');
        const typeCounts = counts(resources, 'type', Array.from(api.types, type => type.key));
        typeCounts.forEach((count, index) => {
            assert(Math.abs(count - api.modes[mode].counts[index] * total / Number(mode)) < 1,
                'Scaled resource proportions differ by less than one unit');
        });
    }
}

for (const size of [12, 16]) {
    for (const mode of ['8', '12', '16']) {
        for (const balance of ['off', 'allow-empty', 'require-all']) {
            state.resourceCapitals = false;
            const excluded = api.createStartingBoard(allPlayers, size, 'capital-pool', null, 'zero', mode, balance, false);
            const included = api.createStartingBoard(allPlayers, size, 'capital-pool', null, 'zero', mode, balance, true);
            assert.equal(included.provinceResources.filter(Boolean).length, Number(mode));
            assert.equal(included.resourceCapitals, true);
            assert.equal(excluded.resourceCapitals, mode === '16', '16 resources always enables capitals');
            assert.deepEqual(plain(included.board), plain(excluded.board));
            assert.deepEqual(plain(included.biomes), plain(excluded.biomes));
            assert.deepEqual(counts(included.provinceResources, 'type', Array.from(api.types, type => type.key)),
                plain(api.modes[mode].counts));
            if (balance !== 'off') assertBalanced(included.provinceResources, balance === 'require-all');
            if (mode === '16') assert.deepEqual(plain(included), plain(excluded));
            state.activePlayers = allPlayers;
            state.resourceMode = mode;
            state.resourceBalance = balance;
            state.resourceCapitals = true;
            api.initBoard(null, size, 'capital-pool');
            assert.deepEqual(plain(state.provinceResources), plain(included.provinceResources),
                'Capitals preview and match reproduce the same resources');
        }
    }
}
for (const size of [12, 16]) {
    state.activePlayers = [true, true, false, false];
    const board = Array.from({ length: size }, () => Array(size).fill(null));
    board[0][0] = castle(1, 'sandbox-castle');
    const map = {
        biomes: Array.from({ length: size }, () => Array(size).fill('mountain')),
        provinceResources: Array.from({ length: 16 }, () => [])
    };
    map.provinceResources[0] = [
        { type: 'food', productionChance: 100, row: 0, column: 0 },
        { type: 'wood', productionChance: 100, row: 0, column: 1 },
        { type: 'gold', productionChance: 0, row: 0, column: 0 },
        { type: 'metal', productionChance: 12.5, row: 1, column: 0 }
    ];
    assert(api.isValidCustomMap(map, size));
    api.initBoard(board, size, 'sandbox-resources', map);
    assert.deepEqual(plain(state.biomes), map.biomes);
    assert.deepEqual(plain(state.provinceResources), map.provinceResources);
    map.biomes[0][0] = 'plains';
    assert.equal(state.biomes[0][0], 'mountain', 'Starting maps must be independently cloned');
    api.renderBoard();
    const marker = boardEl.children[0].children.find(child =>
        child.className.includes('province-resource'));
    assert(marker.innerText.includes('🌾') && marker.innerText.includes('🪙'),
        'Several resource types may share a mountain square');
    api.resolveResourceProduction(4, () => 0.125);
    assert.equal(state.resources[0].food, 1);
    assert.equal(state.resources[0].wood, 1, 'Several sites in one province produce independently');
    assert.equal(state.resources[0].gold, 0, 'Zero-percent sites never produce');
    assert.equal(state.resources[0].metal, 0, 'Fractional probability threshold remains strict');
    api.resolveResourceProduction(8, () => 0.124);
    assert.equal(state.resources[0].metal, 1);
    for (const invalidChance of [-1, 101, null, NaN, '50']) {
        const invalid = plain(map);
        invalid.provinceResources[0][0].productionChance = invalidChance;
        assert(!api.isValidCustomMap(invalid, size));
    }
    const invalidPosition = plain(map);
    invalidPosition.provinceResources[0][0].column = size - 1;
    assert(!api.isValidCustomMap(invalidPosition, size),
        'Resource site coordinates must match their province');
}
state.reset();

function castle(player, id) {
    return { id, player, type: 'r', contents: [api.createUnit(player, 'r', `${id}-tower`)] };
}
const rebelBoard = Array.from({ length: 16 }, () => Array(16).fill(null));
for (let province = 0; province < 16; province++) {
    rebelBoard[Math.floor(province / 4) * 4][(province % 4) * 4] = castle(5, `r-${province}`);
}
for (const province of [0, 3, 12, 15]) {
    rebelBoard[Math.floor(province / 4) * 4][(province % 4) * 4] = castle(1, `p-${province}`);
}
for (const mode of ['8', '12']) {
    let capitalReceivedResource = false;
    let capitalMissedResource = false;
    for (let seed = 0; seed < 30; seed++) {
        const generated = api.generateProvinceResources(rebelBoard, mode, api.createSeededRandom(seed), 'off', true);
        assert.equal(generated.filter(Boolean).length, Number(mode));
        if (generated[0]) capitalReceivedResource = true;
        else capitalMissedResource = true;
    }
    assert(capitalReceivedResource && capitalMissedResource,
        'An eligible capital can receive a resource but is not guaranteed one');
}
let sawEmpty = false;
let sawUneven = false;
for (let seed = 0; seed < 100; seed++) {
    for (const balance of ['allow-empty', 'require-all']) {
        const generated = api.generateProvinceResources(rebelBoard, '8', api.createSeededRandom(seed), balance);
        assertBalanced(generated, balance === 'require-all');
        const countsByQuadrant = Array.from({ length: 4 }, (_, q) =>
            generated.filter((resource, province) => resource && quadrant(province) === q).length);
        if (balance === 'allow-empty' && countsByQuadrant.includes(0)) sawEmpty = true;
        if (balance === 'require-all' && new Set(countsByQuadrant).size > 1) sawUneven = true;
        assert.deepEqual(plain(generated),
            plain(api.generateProvinceResources(rebelBoard, '8', api.createSeededRandom(seed), balance)));
    }
}
assert(sawEmpty, 'Allow-empty mode preserves randomly empty quadrants');
assert(sawUneven, 'Require-all mode does not force equal resource counts');
const sparseBoard = Array.from({ length: 16 }, () => Array(16).fill(null));
sparseBoard[0][0] = castle(5, 'one');
const sparse = api.generateProvinceResources(sparseBoard, '12', api.createSeededRandom('sparse'), 'allow-empty');
assertBalanced(sparse, false);
assert.equal(sparse[0].productionChance, 25, 'A lone resource gets 25%');
assert.throws(() => api.generateProvinceResources(sparseBoard, '12', api.createSeededRandom('sparse'), 'require-all'),
    /Cannot place a resource in every quadrant/);
assert.throws(() => api.generateProvinceResources(sparseBoard, '8', api.createSeededRandom('sparse'), 'require-all'),
    /Cannot place a resource in every quadrant/);
const missingQuadrantBoard = plain(rebelBoard);
for (const province of [10, 11, 14]) {
    missingQuadrantBoard[Math.floor(province / 4) * 4][(province % 4) * 4] = null;
}
assert.throws(() => api.generateProvinceResources(missingQuadrantBoard, '12',
    api.createSeededRandom('missing'), 'require-all'), /Cannot place a resource in every quadrant/);
const capitalsCompleteQuadrants = api.generateProvinceResources(missingQuadrantBoard, '12',
    api.createSeededRandom('missing'), 'require-all', true);
assertBalanced(capitalsCompleteQuadrants, true);
assert(capitalsCompleteQuadrants[15],
    'Allowing capitals can satisfy a quadrant with no eligible rebel province');
assert.equal(capitalsCompleteQuadrants.filter(Boolean).length, 9);
assert.throws(() => api.generateProvinceResources(rebelBoard, '8', api.createSeededRandom('seed'), 'invalid'),
    /Unsupported resource balance/);
state.reset();
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
for (let index = 0; index < 3; index++) state.board[0][index * 4] = castle(5, `rebel-${index}`);
assert.equal(api.generateProvinceResources(state.board, '8', api.createSeededRandom('custom'))
    .filter(Boolean).length, 0, 'Sparse custom maps never generate a negative count');
assert.equal(api.generateProvinceResources(state.board, '12', api.createSeededRandom('custom'))
    .filter(Boolean).length, 3);
state.board[1][1] = castle(1, 'contested');
assert.equal(api.generateProvinceResources(state.board, '12', api.createSeededRandom('custom'))[0], null,
    'A province shared with a player is not a rebel province');
state.board[4][0] = castle(1, 'capital');
state.board[4][4] = castle(1, 'mixed-player-one');
state.board[5][5] = castle(2, 'mixed-player-two');
for (let seed = 0; seed < 30; seed++) {
    const generated = api.generateProvinceResources(state.board, '12', api.createSeededRandom(seed), 'off', true);
    assert.equal(generated.filter(Boolean).length, 2, 'Custom resource count still uses exclusively rebel provinces');
    generated.forEach((resource, province) => {
        if (resource) assert([1, 2, 4].includes(province),
            'Only rebel provinces and exclusively player-owned capitals join the pool, not empty or contested provinces');
    });
}
assert.equal(api.generateProvinceResources(state.board, '16', api.createSeededRandom('custom'))
    .filter(Boolean).length, 16,
    'The 16-resource mode places one resource in every province on custom maps');
for (const chance of [5, 95]) {
    const generated = api.generateProvinceResources(state.board, '12', () => (chance - 5) / 91);
    assert(generated.filter(Boolean).every(resource => resource.productionChance === chance),
        'Random assignment includes both 5% and 95%');
}
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.board[0][0] = castle(1, 'probability-test');
for (const chance of [5, 25, 50, 75, 95]) {
    state.provinceResources[0] = { type: 'food', productionChance: chance };
    state.resources[0].food = 0;
    for (let roll = 0; roll < 100; roll++) {
        state.lastResourceProductionRound = null;
        api.resolveResourceProduction(4, () => roll / 100);
    }
    assert.equal(state.resources[0].food, chance,
        'Production succeeds strictly below the assigned percentage, including 5% and 95%');
}

state.reset();
state.activePlayers = [true, true, true, false];
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.board[0][0] = castle(1, 'red');
state.board[0][4] = castle(2, 'blue');
state.board[0][8] = castle(5, 'rebel');
state.board[0][12] = castle(1, 'red-contested');
state.board[1][13] = castle(2, 'blue-contested');
state.board[4][0] = castle(3, 'eliminated');
state.eliminated[2] = true;
for (let province = 0; province < 6; province++) {
    state.provinceResources[province] = { type: 'food', productionChance: 100 };
}
state.provinceResources[1].type = 'gold';
state.provinceResources[15] = { type: 'wood', productionChance: 100 };
for (const round of [1, 2, 3]) assert.equal(api.resolveResourceProduction(round), false);
assert.equal(api.resolveResourceProduction(4, () => 0.99), true);
assert.equal(state.resources[0].food, 1);
assert.equal(state.resources[1].gold, 1);
assert.equal(state.resources[0].wood, 0);
assert.equal(state.resources[2].food, 0, 'Eliminated owners do not receive production');
assert.equal(api.resolveResourceProduction(4), false, 'Duplicate resolution must not pay twice');
state.board[0][0].player = 2;
assert.equal(api.resolveResourceProduction(8, () => 0.99), true);
assert.equal(state.resources[0].food, 1);
assert.equal(state.resources[1].food, 1, 'Captured provinces pay their current owner');
assert.equal(state.resources[1].gold, 2, 'Stockpiles accumulate without a cap');
state.provinceResources[0].productionChance = 50;
state.provinceResources[1].productionChance = 50;
const rolls = [0.49, 0.50];
assert.equal(api.resolveResourceProduction(12, () => rolls.shift()), true);
assert.equal(rolls.length, 0, 'Each eligible province gets an independent roll');
assert.equal(state.resources[1].food, 2, 'One resource can succeed');
assert.equal(state.resources[1].gold, 2, 'Another resource with the same chance can fail');
assert.equal(state.provinceResources[0].productionChance, 50, 'Production does not reroll assigned chances');
assert.equal(api.resolveResourceProduction(8), false, 'Older rounds must not produce twice');

for (const multiplayer of [false, true]) {
    state.multiplayer = multiplayer;
    for (const phase of ['PLANNING', 'TRANSITION', 'ALLIANCE_REVIEW', 'RESOLVING', 'COMMITTED', 'GAME_OVER']) {
        state.phase = phase;
        for (const viewer of [0, 1]) {
            state.turnIndex = viewer;
            api.updatePlayerCards();
            for (let index = 0; index < 4; index++) {
                const row = elements.get(`resources-p${index + 1}`);
                const visible = index === viewer && (multiplayer || phase === 'PLANNING');
                assert.equal(row.classList.contains('hidden'), !visible);
                assert.equal(row.html.includes('resource-stock'), visible);
                if (!visible) assert.equal(row.html, '', 'Hidden stockpile values must be removed from the DOM');
            }
        }
    }
}
state.reset();
assert(state.resources.every(stock => Object.values(stock).every(count => count === 0)));
assert.equal(state.lastResourceProductionRound, null);
assert.equal(state.provinceResources.filter(Boolean).length, 0);
assert.equal(state.resourceCapitals, false);
console.log('Resource distribution, production, fog rendering and private stockpile checks passed.');
