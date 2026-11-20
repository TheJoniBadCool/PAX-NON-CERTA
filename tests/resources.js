// Run with: node tests/resources.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function element() {
    const node = {
        children: [], className: '', title: '', innerText: '', html: '',
        style: { setProperty() {} },
        offsetWidth: 240, offsetHeight: 120,
        getBoundingClientRect() { return { left: 100, right: 120, top: 200, bottom: 220 }; },
        appendChild(child) { this.children.push(child); },
        listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        showModal() { this.open = true; },
        close() { this.open = false; this.listeners.close?.(); },
        remove() { this.removed = true; },
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
        body: element(),
        documentElement: { clientWidth: 360, clientHeight: 640 },
        createElement: element,
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, element());
            return elements.get(id);
        }
    }, boardEl, customSetupBoardEl, customMapPreview: null, logAction() {},
    placeCustomPiece() {}, randomLevel: () => 0,
    renderPlanArrows() {}, renderRetreatTable() {},
    activePlayerNameEl: element(), roundTagEl: element(),
    Multiplayer: {
        getBadge: () => ({ text: 'Ready', ready: true }),
        isPendingCommit: () => false,
        refreshControls() {}, onBoardRendered() {}
    }
});
['constants', 'models', 'game-state', 'diplomacy-rules', 'setup-utils', 'board-utils',
'resource-purchases', 'capital-rules', 'movement-rules', 'planning-rules',
    'board-setup', 'board-renderer', 'setup-renderer', 'status-ui', 'prisoner-rules'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, createStartingBoard, initBoard, generateProvinceResources,
       createSeededRandom, resolveResourceProduction, getProvinceIndex, createUnit,
       renderBoard, renderMapPreview, renderCustomSetupBoard, updatePlayerCards,
       isValidCustomMap, getUnitResourceStore, refreshResourceTotals,
       transferStoredUnitResources, transferCapturedUnitResources,
       cloneBoardWithoutResourceStores, beginCaptureChoices, decideCapture,
       types: RESOURCE_TYPES, modes: RESOURCE_MODES })`, context);
const { state } = api;
const plain = value => JSON.parse(JSON.stringify(value));
const legacyStockpile = { resourceStockpile: { gold: 3 } };
assert.equal(api.getUnitResourceStore(legacyStockpile, true).stone, 0,
    'Old resource stockpiles migrate the added Stone key');
assert.equal(legacyStockpile.resourceStockpile.gold, 3,
    'Migrating a stockpile preserves existing resource amounts');
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

function assertChanceProfile(resources, balance) {
    const chances = resources.filter(Boolean).map(resource => resource.productionChance).sort((a, b) => a - b);
    if (balance === 'all-100') {
        assert(chances.every(chance => chance === 100), 'Every resource has a 100% chance');
        return;
    }
    assert.deepEqual(plain(chances), [
        ...Array(Math.max(0, chances.length - 7)).fill(20),
        ...Array(Math.min(4, Math.max(0, chances.length - 3))).fill(50),
        ...Array(Math.min(3, chances.length)).fill(100)
    ].sort((a, b) => a - b), 'Tiered chances use the 100%, 50%, and 20% profile');
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
            /Production chance: \d+% per production check/.test(marker.title)));
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
for (const size of [12, 16]) {
    for (const mode of ['8', '12', '16']) {
        for (const balance of ['all-100', 'tiered']) {
            const starting = api.createStartingBoard(allPlayers, size, 'chance-profile', null, 'zero', mode, balance);
            assertChanceProfile(starting.provinceResources, balance);
            assert.deepEqual(plain(starting.provinceResources), plain(api.createStartingBoard(
                allPlayers, size, 'chance-profile', null, 'zero', mode, balance).provinceResources),
            'Chance profiles are reproduced by the map seed');
            state.activePlayers = allPlayers;
            state.resourceMode = mode;
            state.resourceBalance = balance;
            api.initBoard(null, size, 'chance-profile');
            assert.deepEqual(plain(state.provinceResources), plain(starting.provinceResources),
                'Chance-profile preview and game must match');
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
        for (const balance of ['off', 'allow-empty', 'require-all', 'all-100', 'tiered']) {
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
            if (balance === 'allow-empty' || balance === 'require-all') {
                assertBalanced(included.provinceResources, balance === 'require-all');
            } else if (balance === 'all-100' || balance === 'tiered') {
                assertChanceProfile(included.provinceResources, balance);
            }
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
    let propagationStopped = false;
    const beforeInspection = JSON.stringify(state);
    marker.listeners.pointerdown({ stopPropagation() { propagationStopped = true; } });
    assert(propagationStopped, 'Resource touches must not start board long-press selection');
    propagationStopped = false;
    marker.onclick({ stopPropagation() { propagationStopped = true; } });
    assert(propagationStopped, 'Resource taps must not reach board movement or selection handlers');
    const popup = context.document.body.children.at(-1);
    assert.equal(popup.open, true, 'Tapping a resource opens its popup without selecting a piece');
    assert.equal(popup.style.left, '112px', 'Popup stays inside the right screen edge');
    assert.equal(popup.style.top, '76px', 'Popup opens just above the tapped resource');
    assert.equal(popup.children[0].innerText, marker.title);
    assert(popup.children[0].innerText.includes('100%') && popup.children[0].innerText.includes('0%'),
        'The popup includes every resource at a shared site');
    assert.equal(JSON.stringify(state), beforeInspection, 'Inspecting resources leaves game state unchanged');
    popup.children[1].listeners.click();
    assert.equal(popup.open, false);
    assert.equal(popup.removed, true, 'Closing a popup removes it from the document');
    const fractionalMarker = boardEl.children[size].children.find(child =>
        child.className.includes('province-resource'));
    fractionalMarker.getBoundingClientRect = () => ({ left: 0, right: 20, top: 0, bottom: 20 });
    fractionalMarker.onclick({ stopPropagation() {} });
    const fractionalPopup = context.document.body.children.at(-1);
    assert.equal(fractionalPopup.style.left, '20px');
    assert.equal(fractionalPopup.style.top, '24px',
        'Popup opens below the resource when there is no room above');
    assert(fractionalPopup.children[0].innerText.includes('12.5%'),
        'Resource popups preserve fractional production chances');
    fractionalPopup.close();
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
assertChanceProfile(api.generateProvinceResources(state.board, '12',
    api.createSeededRandom('custom'), 'tiered'), 'tiered');
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
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'probability-test');
const probabilityTower = state.board[0][0].contents[0];
for (const chance of [5, 25, 50, 75, 95]) {
    state.provinceResources[0] = { type: 'food', productionChance: chance };
    probabilityTower.resourceStockpile = { horse: 0, food: 0, wood: 0, metal: 0, gold: 0 };
    for (let roll = 0; roll < 100; roll++) {
        state.lastResourceProductionRound = null;
        api.resolveResourceProduction(4, () => roll / 100);
    }
    assert.equal(probabilityTower.resourceStockpile.food, chance,
        'Production succeeds strictly below the assigned percentage, including 5% and 95%');
}

state.reset();
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'interval-test');
state.provinceResources[0] = { type: 'food', productionChance: 100 };
assert.equal(state.resourceProductionInterval, 1, 'Every-turn production is the default');
for (const interval of [1, 2, 4]) {
    state.resourceProductionInterval = interval;
    state.lastResourceProductionRound = null;
    state.board[0][0].contents[0].resourceStockpile = {
        horse: 0, food: 0, wood: 0, metal: 0, gold: 0
    };
    for (let round = 1; round <= 8; round++) {
        assert.equal(api.resolveResourceProduction(round, () => 0), round % interval === 0,
            `Interval ${interval} checks only at its matching completed rounds`);
    }
    assert.equal(state.board[0][0].contents[0].resourceStockpile.food, 8 / interval);
}

state.reset();
state.activePlayers = [true, true, true, false];
state.resourceProductionInterval = 4;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'red');
state.board[0][4] = castle(2, 'blue');
state.board[0][8] = castle(5, 'rebel');
state.board[0][12] = castle(1, 'red-contested');
state.board[1][13] = castle(2, 'blue-contested');
state.board[4][0] = castle(3, 'eliminated');
state.eliminated[2] = true;
state.capitalTowerIds = state.board.flatMap(row => row.filter(Boolean))
    .map(piece => [piece.player, piece.contents[0]])
    .filter(([player]) => player >= 1 && player <= 4)
    .reduce((ids, [player, tower]) => {
        if (!ids[player - 1]) ids[player - 1] = tower.id;
        return ids;
    }, [null, null, null, null]);
for (let province = 0; province < 6; province++) {
    state.provinceResources[province] = { type: 'food', productionChance: 100 };
}
state.provinceResources[1].type = 'gold';
state.provinceResources[15] = { type: 'wood', productionChance: 100 };
for (const round of [1, 2, 3]) assert.equal(api.resolveResourceProduction(round), false);
assert.equal(api.resolveResourceProduction(4, () => 0.99), true);
assert.equal(state.board[0][0].contents[0].resourceStockpile.food, 1);
assert.equal(state.resources[1].gold, 1);
assert.equal(state.resources[0].wood, 0);
assert.equal(state.resources[2].food, 0, 'Eliminated owners do not receive production');
assert.equal(api.resolveResourceProduction(4), false, 'Duplicate resolution must not pay twice');
state.board[0][0].player = 2;
state.board[0][0].contents.forEach(unit => { unit.player = 2; });
api.refreshResourceTotals();
assert.equal(api.resolveResourceProduction(8, () => 0.99), true);
assert.equal(state.resources[0].food, 0);
assert.equal(state.resources[1].food, 2, 'Captured Tower stock and production follow the Tower');
assert.equal(state.resources[1].gold, 2, 'Stockpiles accumulate without a cap');
state.provinceResources[0].productionChance = 50;
state.provinceResources[1].productionChance = 50;
const rolls = [0.49, 0.50];
assert.equal(api.resolveResourceProduction(12, () => rolls.shift()), true);
assert.equal(rolls.length, 0, 'Each eligible province gets an independent roll');
assert.equal(state.resources[1].food, 3, 'One resource can succeed');
assert.equal(state.resources[1].gold, 2, 'Another resource with the same chance can fail');
assert.equal(state.provinceResources[0].productionChance, 50, 'Production does not reroll assigned chances');
assert.equal(api.resolveResourceProduction(8), false, 'Older rounds must not produce twice');

state.showResourcesToOthers = false;
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
                const shop = elements.get(`resource-purchases-p${index + 1}`);
                const options = elements.get(`resource-purchase-options-p${index + 1}`);
                const shopVisible = visible && !state.eliminated[index] &&
                    ['PLANNING', 'COMMITTED'].includes(phase);
                assert.equal(shop.classList.contains('hidden'), !shopVisible,
                    'Only the current player can open the shop during planning');
                assert.equal(options.html.includes('data-purchase="lucky"'), shopVisible);
                if (!shopVisible) {
                    assert.equal(options.html, '', 'Hidden purchase targets are removed from the DOM');
                    assert.equal(shop.open, false, 'The shop closes on a phase or player change');
                }
            }
        }
    }
}
for (const multiplayer of [false, true]) {
    state.multiplayer = multiplayer;
    for (const round of [3, 4, 5, 8]) {
        state.round = round;
        for (const phase of ['PLANNING', 'TRANSITION', 'RESOLVING', 'COMMITTED', 'GAME_OVER']) {
            state.phase = phase;
            for (const viewer of [0, 1, 2, 3]) {
                state.turnIndex = viewer;
                for (const committed of [false, true]) {
                    state.committed[viewer] = committed;
                    api.updatePlayerCards();
                    const available = round % 4 === 0 && state.activePlayers[viewer] &&
                        !state.eliminated[viewer] &&
                        (phase === 'PLANNING' || (multiplayer && phase === 'COMMITTED')) &&
                        (!multiplayer || !committed);
                    assert.equal(elements.get('shopping-notice').innerText,
                        available ? 'It is Shopping time!!' : '');
                    for (let index = 0; index < 4; index++) {
                        assert.equal(elements.get(`resource-purchases-p${index + 1}`).classList.contains('shopping-available'),
                            available && index === viewer, 'Only the current available shop is highlighted');
                    }
                }
                state.committed[viewer] = false;
            }
        }
    }
}
for (const size of [12, 16]) {
    function setupRaid() {
        state.reset();
        state.boardSize = size;
        state.board = Array.from({ length: size }, () => Array(size).fill(null));
        state.biomes = Array.from({ length: size }, () => Array(size).fill('plains'));
        state.board[1][1] = castle(1, 'resource-owner');
        state.board[0][size / 4] = castle(2, 'raid-capital');
        state.capitalTowerIds[1] = 'raid-capital-tower';
        state.board[0][size / 2] = castle(3, 'third-capital');
        state.capitalTowerIds[2] = 'third-capital-tower';
        state.provinceResources[0] = { type: 'food', productionChance: 100 };
    }
    function army(player, types) {
        return { id: `army-${player}`, player, type: types[0],
            contents: types.map((type, index) => api.createUnit(player, type, `unit-${player}-${index}`)) };
    }
    function produce(random = () => 0) {
        api.resolveResourceProduction((state.lastResourceProductionRound || 0) + 1, random);
    }
    for (const type of ['p', 'n', 'b', 'q', 'k']) {
        setupRaid();
        state.board[0][0] = army(2, [type]);
        produce();
        const raids = ['p', 'n'].includes(type);
        assert.equal(state.resources[0].food, raids ? 0 : 1);
        assert.equal(state.resources[1].food, raids ? 1 : 0,
            'Only Pawns and Horses raid enemy resources');
    }
    setupRaid();
    state.board[0][0] = castle(2, 'foreign-tower');
    produce();
    assert.equal(state.resources[0].food, 0);
    assert.equal(state.resources[1].food, 0, 'Tower-only stacks cannot raid a contested province');
    setupRaid();
    state.board[0][1] = army(2, ['p']);
    produce();
    assert.equal(state.resources[0].food, 1, 'Standing nearby in the province does not raid');
    state.board[0][0] = state.board[0][1];
    state.board[0][1] = null;
    produce();
    produce();
    assert.equal(state.resources[0].food, 1);
    assert.equal(state.resources[1].food, 2, 'Raiding continues while the army occupies the site');
    assert.equal(api.resolveResourceProduction(state.lastResourceProductionRound), false);
    assert.equal(state.resources[1].food, 2, 'Duplicate checks cannot pay raiders twice');
    state.board[0][0] = null;
    produce();
    assert.equal(state.resources[0].food, 2, 'Owner income resumes after the raider leaves');

    setupRaid();
    const mixed = army(2, ['q', 'p', 'b']);
    state.board[0][0] = mixed;
    produce();
    assert.equal(state.resources[1].food, 1, 'A free Pawn in a mixed stack enables raiding');
    Object.assign(mixed.contents[1], { prisonerOf: 2, originalPlayer: 3 });
    produce();
    assert.equal(state.resources[0].food, 1, 'Captured Pawns do not enable raiding');
    mixed.contents = [mixed.contents[1]];
    produce();
    assert.equal(state.resources[0].food, 2, 'Prisoner-only stacks do not raid');
    mixed.contents.push(api.createUnit(2, 'n', 'free-horse'));
    produce();
    assert.equal(state.resources[1].food, 2, 'A free Horse alongside prisoners enables raiding');

    setupRaid();
    state.board[0][0] = army(2, ['p']);
    const pair = state.diplomacy.find(pair => pair.players.includes(0) && pair.players.includes(1));
    pair.status = 'allied';
    produce();
    assert.equal(state.resources[0].food, 1, 'Allies neither steal nor block owner income');
    state.board[0][0] = [army(1, ['p']), army(2, ['n'])];
    produce();
    assert.equal(state.resources[0].food, 2, 'Allied co-occupancy leaves owner income unchanged');
    state.board[0][0] = army(2, ['p']);
    pair.status = 'war';
    produce();
    assert.equal(state.resources[1].food, 1, 'Declaring war enables raiding without moving');
    pair.status = 'allied';
    produce();
    assert.equal(state.resources[0].food, 3, 'A new alliance immediately ends raiding');

    for (const player of [2, 5]) {
        setupRaid();
        state.board[0][0] = army(player, ['p']);
        if (player === 2) state.eliminated[1] = true;
        produce();
        assert.equal(state.resources[0].food, 1, 'Eliminated players and rebels cannot raid or block production');
    }
    setupRaid();
    state.board[0][0] = army(2, ['n']);
    state.activePlayers[1] = false;
    produce();
    assert.equal(state.resources[0].food, 1, 'Inactive players cannot raid');

    for (const ownership of ['empty', 'rebel', 'contested', 'eliminated', 'inactive']) {
        setupRaid();
        if (ownership === 'empty') state.board[1][1] = null;
        if (ownership === 'rebel') state.board[1][1] = castle(5, 'rebel-owner');
        if (ownership === 'contested') state.board[1][0] = castle(3, 'other-owner');
        if (ownership === 'eliminated') state.eliminated[0] = true;
        if (ownership === 'inactive') state.activePlayers[0] = false;
        state.board[0][0] = army(2, ['n']);
        produce();
        assert.equal(state.resources[1].food, 1, `Raiders collect from ${ownership} provinces`);
        state.board[0][0] = null;
        produce();
        assert.equal(state.resources[1].food, 1, 'Otherwise non-producing provinces stop paying when raiders leave');
        assert.equal(state.resources[0].food, 0);
    }

    setupRaid();
    state.diplomacy.find(pair => pair.players.includes(1) && pair.players.includes(2)).status = 'allied';
    state.board[0][0] = [army(2, ['p']), army(3, ['n'])];
    for (let roll = 0; roll < 100; roll++) {
        const rolls = [0, roll / 100];
        produce(() => {
            assert(rolls.length, 'Only production and recipient selection need random rolls');
            return rolls.shift();
        });
        assert.equal(rolls.length, 0);
    }
    assert.equal(state.resources[0].food, 0);
    assert.equal(state.resources[1].food, 50);
    assert.equal(state.resources[2].food, 50, 'Multiple raiders have equal chances; production is not duplicated');
    state.diplomacy.find(pair => pair.players.includes(0) && pair.players.includes(1)).status = 'allied';
    produce();
    assert.equal(state.resources[1].food, 50, 'Allies of the owner are excluded from recipient selection');
    assert.equal(state.resources[2].food, 51);

    setupRaid();
    state.biomes[0][0] = 'mountain';
    state.board[0][0] = army(2, ['p']);
    produce();
    assert.equal(state.resources[0].food, 1, 'Generated resources use the same mountain avoidance as rendering');
    state.board[0][1] = state.board[0][0];
    state.board[0][0] = null;
    produce();
    assert.equal(state.resources[1].food, 1, 'Raiding uses the displayed generated resource position');

    setupRaid();
    state.provinceResources[0] = [
        { type: 'food', productionChance: 100, row: 0, column: 1 },
        { type: 'wood', productionChance: 100, row: 0, column: 1 },
        { type: 'gold', productionChance: 100, row: 1, column: 0 }
    ];
    state.board[0][1] = army(2, ['n']);
    produce();
    assert.equal(state.resources[1].food, 1);
    assert.equal(state.resources[1].wood, 1, 'All custom resource types on the occupied square are raided');
    assert.equal(state.resources[0].gold, 1, 'Other sites in the same province keep paying the owner');
    for (const chance of [0, 12.5, 50, 100]) {
        state.provinceResources[0] = [{ type: 'food', productionChance: chance, row: 0, column: 1 }];
        api.getUnitResourceStore(state.board[0][size / 4].contents[0], true).food = 0;
        for (let roll = 0; roll < 200; roll++) produce(() => roll / 200);
        assert.equal(state.resources[1].food, chance * 2, 'Raiding preserves exact production probabilities');
    }
    setupRaid();
    state.resourceProductionInterval = 4;
    state.board[0][0] = army(2, ['p']);
    for (const round of [1, 2, 3]) assert.equal(api.resolveResourceProduction(round), false);
    assert.equal(state.resources[1].food, 0, 'Raiding does not pay between scheduled production checks');
    api.resolveResourceProduction(4, () => 0);
    assert.equal(state.resources[1].food, 1);
}

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'capital-but-not-nearest');
state.board[1][0] = castle(1, 'nearest-first');
state.board[1][2] = castle(1, 'nearest-second');
state.capitalTowerIds[0] = 'capital-but-not-nearest-tower';
state.provinceResources[0] = { type: 'wood', productionChance: 100, row: 1, column: 1 };
api.resolveResourceProduction(1, () => 0);
assert.equal(state.board[0][0].contents[0].resourceStockpile?.wood || 0, 0,
    'Ordinary production does not default to the capital');
assert.equal(state.board[1][0].contents[0].resourceStockpile.wood, 1,
    'Equidistant nearest Towers break ties by first game order');
assert.equal(state.board[1][2].contents[0].resourceStockpile?.wood || 0, 0);
assert.equal(state.resources[0].wood, 1, 'Displayed player total sums Tower stores');
state.board[1][0].player = 2;
state.board[1][0].contents.forEach(unit => { unit.player = 2; });
api.refreshResourceTotals();
assert.equal(state.resources[0].wood, 0);
assert.equal(state.resources[1].wood, 1, 'Resources stored on a Tower follow it when captured');

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'resource-owner');
state.board[0][4] = castle(2, 'raider-capital');
state.capitalTowerIds[1] = 'raider-capital-tower';
state.board[0][1] = {
    id: 'raiding-army', player: 2, type: 'p',
    contents: [api.createUnit(2, 'p', 'raiding-pawn')]
};
state.provinceResources[0] = { type: 'gold', productionChance: 100, row: 0, column: 1 };
api.resolveResourceProduction(1, () => 0);
assert.equal(state.board[0][4].contents[0].resourceStockpile.gold, 1,
    'Raid gains go to the raider’s capital Tower');
assert.equal(state.resources[1].gold, 1);

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'resource-owner');
state.board[0][4] = {
    id: 'first-king', player: 2, type: 'k',
    contents: [api.createUnit(2, 'k', 'first-king-unit')]
};
state.board[1][4] = {
    id: 'second-king', player: 2, type: 'k',
    contents: [api.createUnit(2, 'k', 'second-king-unit')]
};
state.board[0][1] = {
    id: 'raiding-army', player: 2, type: 'p',
    contents: [api.createUnit(2, 'p', 'raiding-pawn')]
};
state.provinceResources[0] = { type: 'metal', productionChance: 100, row: 0, column: 1 };
api.resolveResourceProduction(1, () => 0);
assert.equal(state.board[0][4].contents[0].resourceStockpile.metal, 1,
    'A horde’s raid goes to its first King in game order');
assert.equal(state.board[1][4].contents[0].resourceStockpile?.metal || 0, 0);

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'resource-owner');
state.board[0][4] = {
    id: 'queen-holder', player: 2, type: 'q',
    contents: [api.createUnit(2, 'q', 'queen-holder-unit')]
};
state.board[0][1] = {
    id: 'raiding-army', player: 2, type: 'p',
    contents: [api.createUnit(2, 'p', 'raiding-pawn')]
};
state.provinceResources[0] = { type: 'horse', productionChance: 100, row: 0, column: 1 };
api.resolveResourceProduction(1, () => 0);
assert.equal(state.board[0][4].contents[0].resourceStockpile.horse, 1,
    'A horde without a King stores its raids on its first Queen');

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.board[0][0] = castle(1, 'resource-owner');
state.board[0][1] = {
    id: 'raiding-army', player: 2, type: 'p',
    contents: [api.createUnit(2, 'p', 'raiding-pawn')]
};
state.provinceResources[0] = { type: 'food', productionChance: 100, row: 0, column: 1 };
assert.throws(() => api.resolveResourceProduction(1, () => 0),
    /no capital Tower, King, or Queen to receive raid resources/,
    'Raid production without an eligible holder is an invalid game state');

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.board[0][4] = castle(2, 'captor-capital');
state.capitalTowerIds[1] = 'captor-capital-tower';
const capturedKing = api.createUnit(1, 'k', 'captured-king');
capturedKing.resourceStockpile = { horse: 0, food: 0, wood: 0, metal: 0, gold: 3 };
state.phase = 'RESOLVING';
api.beginCaptureChoices(2, [capturedKing], [5, 5]);
assert.equal(capturedKing.resourceStockpile.gold, 0);
assert.equal(state.board[0][4].contents[0].resourceStockpile.gold, 3,
    'Captured King resources transfer to the capturer’s capital before fate selection');
assert.equal(state.resources[0].gold, 0);
assert.equal(state.resources[1].gold, 3);
const captureId = state.pendingCapture.id;
assert(api.decideCapture(2, captureId, capturedKing.id, 'keep'));
assert.equal(state.resources[1].gold, 3, 'Keeping a prisoner does not duplicate transferred resources');

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.board[0][4] = {
    id: 'captor-king-piece', player: 2, type: 'k',
    contents: [api.createUnit(2, 'k', 'captor-king')]
};
state.board[1][4] = {
    id: 'captor-queen-piece', player: 2, type: 'q',
    contents: [api.createUnit(2, 'q', 'captor-queen')]
};
const capturedQueen = api.createUnit(1, 'q', 'captured-queen');
capturedQueen.resourceStockpile = { horse: 0, food: 0, wood: 2, metal: 0, gold: 0 };
state.phase = 'RESOLVING';
api.beginCaptureChoices(2, [capturedQueen], [5, 5]);
assert.equal(state.board[0][4].contents[0].resourceStockpile.wood, 2,
    'Without a capital Tower, captured resources go to the capturer’s first King');
assert.equal(state.board[1][4].contents[0].resourceStockpile?.wood || 0, 0,
    'Queen is fallback only when capturer has no King');

state.reset();
state.boardSize = 16;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
state.board[0][4] = castle(2, 'split-capital-two');
state.board[0][8] = castle(3, 'split-capital-three');
state.capitalTowerIds[1] = 'split-capital-two-tower';
state.capitalTowerIds[2] = 'split-capital-three-tower';
const splitStock = api.createUnit(1, 'k', 'split-stock');
splitStock.resourceStockpile = { horse: 0, food: 0, wood: 0, metal: 0, gold: 5 };
const winningArmy = player => ({
    unit: api.createUnit(player, 'p', `winner-${player}`),
    piece: { player }, row: 5, column: player
});
api.transferStoredUnitResources([3, 2], splitStock, [
    winningArmy(2), winningArmy(3), winningArmy(3), winningArmy(3)
]);
assert.equal(state.board[0][4].contents[0].resourceStockpile.gold, 2,
    'The larger winning army receives the odd split remainder');
assert.equal(state.board[0][8].contents[0].resourceStockpile.gold, 3);
assert.equal(state.resources[1].gold, 2);
assert.equal(state.resources[2].gold, 3);

state.board[0][4].contents[0].resourceStockpile.gold = 0;
state.board[0][8].contents[0].resourceStockpile.gold = 0;
const tiedSplitStock = api.createUnit(1, 'q', 'tied-split-stock');
tiedSplitStock.resourceStockpile = { horse: 0, food: 0, wood: 0, metal: 0, gold: 1 };
api.transferStoredUnitResources([3, 2], tiedSplitStock, [winningArmy(3), winningArmy(2)]);
assert.equal(state.board[0][4].contents[0].resourceStockpile.gold, 1,
    'Equal-size winning armies award a split remainder to the first player in game order');
assert.equal(state.board[0][8].contents[0].resourceStockpile.gold, 0);

const privateBoard = api.cloneBoardWithoutResourceStores();
assert(privateBoard.every(row => row.every(square => {
    const pieces = Array.isArray(square) ? square : square ? [square] : [];
    return pieces.every(piece => piece.contents.every(unit => !('resourceStockpile' in unit)));
})), 'Multiplayer board snapshots must not expose per-unit resource stores');
assert(state.board[0][4].contents[0].resourceStockpile,
    'Snapshot sanitization does not mutate authoritative stores');

state.reset();
assert(state.resources.every(stock => Object.values(stock).every(count => count === 0)));
assert.equal(state.lastResourceProductionRound, null);
assert.equal(state.provinceResources.filter(Boolean).length, 0);
assert.equal(state.resourceCapitals, false);
assert.equal(state.resourceProductionInterval, 1);
console.log('Resource distribution, production, fog rendering and private stockpile checks passed.');
