// Run with: node tests/biomes.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const randomMath = Object.create(Math);
let seed = 0;
randomMath.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
};
const context = vm.createContext({
    console, Math: randomMath, randomLevel: () => 0, logAction() {}, renderRetreatTable() {},
    isTowerGateMove: () => true
});
['constants', 'models', 'game-state', 'setup-utils', 'board-utils', 'movement-rules',
    'planning-rules', 'battle-rules', 'retreat-rules', 'board-setup'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, initBoard, generateBiomes, getTowerGate, isTowerPiece, getBiome,
       getVisiblePiece, getValidMovesForPiece, getPlanArrowKind, createUnit,
       getDefenderTerrainBonus, snapshotHillOccupants, updateHillHeld,
       getBattleCandidateData, processRetreatsAtRoundStart })`, context);
const { state } = api;
const piece = (player, id, type = 'n') => ({
    id, player, type, contents: [api.createUnit(player, type, id + '-unit', id)]
});
for (const size of [10, 12, 14, 16]) {
    for (let run = 1; run <= 20; run++) {
        seed = run;
        state.activePlayers = [true, true, true, true];
        api.initBoard(null, size);
        const counts = {};
        state.biomes.flat().forEach(type => { counts[type] = (counts[type] || 0) + 1; });
        assert.equal(counts.mountain, Math.round(size * size * 0.1));
        assert.equal(counts.forest, Math.round(size * size * 0.2));
        assert.equal(counts.hill, Math.round(size * size * 0.2));
        assert.equal(counts.plains, size * size - counts.mountain - counts.forest - counts.hill);
        const patchSeen = new Set();
        const patchCounts = { mountain: 0, hill: 0, forest: 0 };
        const clustered = { mountain: 0, hill: 0, forest: 0 };
        const limits = { mountain: 6, hill: 10, forest: 10 };
        state.biomes.forEach((row, r) => row.forEach((biome, c) => {
            const key = `${r},${c}`;
            if (biome === 'plains' || patchSeen.has(key)) return;
            patchCounts[biome]++;
            const patch = [[r, c]];
            patchSeen.add(key);
            for (let i = 0; i < patch.length; i++) {
                for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                    if (!dr && !dc) continue;
                    const rr = patch[i][0] + dr, cc = patch[i][1] + dc, neighbor = `${rr},${cc}`;
                    if (rr >= 0 && rr < size && cc >= 0 && cc < size &&
                        state.biomes[rr][cc] === biome && !patchSeen.has(neighbor)) {
                        patchSeen.add(neighbor);
                        patch.push([rr, cc]);
                    }
                }
            }
            assert(patch.length <= limits[biome], `${size}x${size}, seed ${run}: oversized ${biome} patch`);
            if (patch.length > 1) clustered[biome] += patch.length;
        }));
        for (const biome of Object.keys(limits)) {
            assert(patchCounts[biome] >= 2, `${size}x${size}, seed ${run}: ${biome} forms one blob`);
            assert(clustered[biome] >= counts[biome] / 2,
                `${size}x${size}, seed ${run}: ${biome} is too scattered`);
        }
        const seen = new Set();
        const first = state.biomes.flatMap((row, r) => row.map((biome, c) =>
            biome !== 'mountain' && !api.isTowerPiece(state.board[r][c]) ? [r, c] : null)).find(Boolean);
        const queue = [first];
        seen.add(first.join(','));
        for (let i = 0; i < queue.length; i++) {
            const [r, c] = queue[i];
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr, nc = c + dc, key = `${nr},${nc}`;
                if (nr >= 0 && nr < size && nc >= 0 && nc < size &&
                    state.biomes[nr][nc] !== 'mountain' &&
                    !api.isTowerPiece(state.board[nr][nc]) && !seen.has(key)) {
                    seen.add(key);
                    queue.push([nr, nc]);
                }
            }
        }
        assert.equal(seen.size, size * size - counts.mountain - 8);
        state.board.forEach((row, r) => row.forEach((entry, c) => {
            if (!entry) return;
            assert.equal(api.getBiome(r, c), 'plains');
            const [dr, dc] = api.getTowerGate(entry);
            assert.notEqual(api.getBiome(r + dr, c + dc), 'mountain');
        }));
    }
}

const crowded = Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) => piece(1, `${r}-${c}`)));
crowded[0][0] = piece(1, 'castle', 'r');
api.initBoard(crowded);
assert(!state.biomes.flat().includes('mountain'));
assert.equal(state.biomes[0][0], 'plains');

const restricted = Array.from({ length: 10 }, (_, r) =>
    Array.from({ length: 10 }, (_, c) => {
        const unit = piece(1, `tower-${r}-${c}`, 'r');
        unit.contents[0].gate = [r === 0 ? 1 : -1, 0];
        return r < 2 ? piece(1, `unit-${r}-${c}`) : unit;
    }));
const restrictedBiomes = api.generateBiomes(restricted);
assert.equal(restrictedBiomes.flat().filter(biome => biome === 'hill').length, 20,
    'Crowded custom boards can exceed the patch limit to use all available terrain squares');
assert.equal(restrictedBiomes.flat().filter(biome => biome === 'mountain').length, 0);

state.reset();
state.boardSize = 10;
state.board = Array.from({ length: 10 }, () => Array(10).fill(null));
state.biomes = Array.from({ length: 10 }, () => Array(10).fill('plains'));
state.board[4][4] = piece(1, 'defender');
state.board[4][5] = piece(2, 'enemy');
state.biomes[4][4] = 'hill';
state.biomes[4][5] = 'forest';
state.biomes[5][4] = 'mountain';
const defender = { ...state.board[4][4], isStationary: true };
assert.equal(api.getDefenderTerrainBonus(defender, [4, 4]), 0);
const start = api.snapshotHillOccupants();
api.updateHillHeld(start, []);
assert.equal(api.getDefenderTerrainBonus(defender, [4, 4]), 0.25);
assert.equal(api.getDefenderTerrainBonus({ ...defender, isStationary: false }, [4, 4]), 0);
api.updateHillHeld(start, [{ contents: defender.contents }]);
assert.equal(api.getDefenderTerrainBonus(defender, [4, 4]), 0);
const hidden = { ...state.board[4][5], isStationary: true };
assert.equal(api.getDefenderTerrainBonus(hidden, [4, 5]), 0.25);
assert.equal(api.getVisiblePiece(4, 5, 1), null);
assert.equal(api.getVisiblePiece(4, 5, 2).id, 'enemy');
assert(!api.getValidMovesForPiece(4, 4).some(([r, c]) => r === 5 && c === 4));
assert(api.getValidMovesForPiece(4, 4).some(([r, c]) => r === 4 && c === 5));
const move = { player: 1, from: [4, 4], to: [4, 5] };
assert.equal(api.getPlanArrowKind(move, [move]), 'green');
const data = api.getBattleCandidateData({ candidates: [
    { ...defender, terrainBonus: 0.25, pieceId: 'defender' },
    { ...state.board[4][5], pieceId: 'enemy' }
] });
assert.equal(data[0].rawWeight, 1.25);
assert.equal(data[1].rawWeight, 1);
state.phase = 'GAME_OVER';
assert.equal(api.getVisiblePiece(4, 5, 1).id, 'enemy');

state.phase = 'PLANNING';
state.round = 3;
state.retreating[0] = [{
    id: 'retreat', player: 1, contents: [api.createUnit(1, 'n', 'return', 'return')],
    battleSquare: [5, 5], reentryRound: 3
}];
for (let r = 2; r <= 8; r++) for (let c = 2; c <= 8; c++) state.biomes[r][c] = 'mountain';
state.biomes[5][6] = 'plains';
api.processRetreatsAtRoundStart();
assert.equal(state.board[5][6].id, 'retreat');
console.log('Biome generation, concealment, combat and movement checks passed');
