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
    ({ state: gameState, initBoard, generateBiomes, createStartingBoard, getTowerGate, isTowerPiece, getBiome,
       getVisiblePiece, getFogVisibility, getValidMovesForPiece, getPlanArrowKind, createUnit,
       getDefenderTerrainBonus, snapshotHillOccupants, updateHillHeld,
       getBattleCandidateData, processRetreatsAtRoundStart,
       rebelId: REBEL_PLAYER_ID, getPieceContents, getUnitDisplayClass })`, context);
const { state } = api;
const seedPlayers = [true, true, false, false];
const seededMapA = api.createStartingBoard(seedPlayers, 12, 'test-seed');
const seededMapB = api.createStartingBoard(seedPlayers, 12, 'test-seed');
const seededMapC = api.createStartingBoard(seedPlayers, 12, 'different-seed');
assert.equal(JSON.stringify(seededMapA), JSON.stringify(seededMapB),
    'The same seed recreates starting positions, gates and terrain');
assert.notEqual(JSON.stringify(seededMapA), JSON.stringify(seededMapC),
    'Different seeds produce different maps');
assert.equal(state.board.length, 0, 'Generating a preview does not mutate the active game');
state.activePlayers = seedPlayers;
api.initBoard(null, 12, 'test-seed');
assert.equal(JSON.stringify({
    board: state.board, biomes: state.biomes, resourceMode: state.resourceMode,
    resourceBalance: state.resourceBalance,
    resourceCapitals: state.resourceCapitals,
    provinceResources: state.provinceResources
}),
    JSON.stringify(seededMapA), 'Starting the game uses the exact preview for its seed');

const piece = (player, id, type = 'n') => ({
    id, player, type, contents: [api.createUnit(player, type, id + '-unit', id)]
});
for (const size of [12, 16]) {
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
        assert.equal(seen.size, size * size - counts.mountain - 16);
        const rebels = state.board.flat().filter(piece => piece && piece.player === api.rebelId);
        const rebelCastles = rebels.filter(api.isTowerPiece);
        const rebelCastleLocations = state.board.flatMap((row, r) =>
            row.map((piece, c) => piece && piece.player === api.rebelId &&
                api.isTowerPiece(piece) ? { piece, r, c } : null).filter(Boolean));
        assert.equal(rebelCastles.length, 12);
        assert.equal(rebels.filter(piece => !api.isTowerPiece(piece)).length, 12);
        const allCastleLocations = state.board.flatMap((row, r) =>
            row.map((piece, c) => piece && api.isTowerPiece(piece)
                ? { piece, r, c } : null).filter(Boolean));
        assert.equal(allCastleLocations.length, 16);
        for (const { piece, r, c } of allCastleLocations) {
            const provinceRow = Array.from({ length: 4 }, (_, index) => index)
                .find(index => r >= Math.floor(index * size / 4) &&
                    r < Math.floor((index + 1) * size / 4));
            const provinceColumn = Array.from({ length: 4 }, (_, index) => index)
                .find(index => c >= Math.floor(index * size / 4) &&
                    c < Math.floor((index + 1) * size / 4));
            const playerIndex = piece.player - 1;
            const homeRow = playerIndex >= 2 ? 3 : 0;
            const homeColumn = playerIndex === 1 || playerIndex === 2 ? 3 : 0;
            const isPlayerProvince = piece.player !== api.rebelId &&
                provinceRow === homeRow && provinceColumn === homeColumn;
            assert.equal(piece.player === api.rebelId, !isPlayerProvince,
                'Each province has its player castle or one rebel castle, never both');
            if (isPlayerProvince) {
                assert.equal(api.getPieceContents(piece).length, 7,
                    'All starting player units must be in their province castle');
            }
        }
        for (let provinceRow = 0; provinceRow < 4; provinceRow++) {
            for (let provinceColumn = 0; provinceColumn < 4; provinceColumn++) {
                const minRow = Math.floor(provinceRow * size / 4);
                const maxRow = Math.floor((provinceRow + 1) * size / 4);
                const minColumn = Math.floor(provinceColumn * size / 4);
                const maxColumn = Math.floor((provinceColumn + 1) * size / 4);
                const inProvince = allCastleLocations.filter(({ r, c }) =>
                    r >= minRow && r < maxRow && c >= minColumn && c < maxColumn);
                assert.equal(inProvince.length, 1, 'Each province must contain exactly one castle');
                if (inProvince[0].piece.player === api.rebelId) {
                    assert(rebelCastleLocations.some(({ piece }) => piece === inProvince[0].piece));
                    const garrison = api.getPieceContents(inProvince[0].piece);
                    assert.equal(garrison.map(unit => unit.type).sort().join(','), 'p,r');
                    assert(garrison.every(unit => unit.player === api.rebelId));
                }
            }
        }
        const [rebelRow, rebelColumn] = state.board.flatMap((row, r) =>
            row.map((piece, c) => piece && piece.player === api.rebelId &&
                !api.isTowerPiece(piece) ? [r, c] : null).filter(Boolean))[0];
        assert.equal(api.getValidMovesForPiece(rebelRow, rebelColumn).length, 0,
            'Rebel pieces must remain stationary');
        assert(api.getUnitDisplayClass(api.getPieceContents(rebels[0])[0], api.rebelId)
            .includes('piece-eliminated'), 'Rebels must use the defeated-player grey style');
        const rebelBattle = api.getBattleCandidateData({ candidates: [
            { player: 1, pieceId: 'raider', pieceType: 'p',
                contents: [api.createUnit(1, 'p', 'raider-pawn')] },
            { player: api.rebelId, pieceId: rebelCastles[0].id, pieceType: 'r',
                contents: api.getPieceContents(rebelCastles[0]), isStationary: true }
        ] });
        assert.equal(rebelBattle.find(entry => entry.candidate.player === api.rebelId)
            .towerDefenderBonus, 3, 'Rebel castles must defend like normal Towers');
        state.biomes[rebelRow][rebelColumn] = 'forest';
        assert.equal(api.getVisiblePiece(rebelRow, rebelColumn, 1)?.player ?? null,
            api.getFogVisibility(1)[rebelRow][rebelColumn] ? api.rebelId : null,
            'Rebels ignore forest concealment, but not fog of war');
        state.biomes[rebelRow][rebelColumn] = 'plains';
        state.board.forEach((row, r) => row.forEach((entry, c) => {
            if (!entry) return;
            if (!api.isTowerPiece(entry)) return;
            assert.equal(api.getBiome(r, c), 'plains');
            const [dr, dc] = api.getTowerGate(entry);
            assert.notEqual(api.getBiome(r + dr, c + dc), 'mountain');
        }));
    }
}

const crowded = Array.from({ length: 12 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => piece(1, `${r}-${c}`)));
crowded[0][0] = piece(1, 'castle', 'r');
api.initBoard(crowded);
assert(!state.biomes.flat().includes('mountain'));
assert.equal(state.biomes[0][0], 'plains');

const restricted = Array.from({ length: 12 }, (_, r) =>
    Array.from({ length: 12 }, (_, c) => {
        const unit = piece(1, `tower-${r}-${c}`, 'r');
        unit.contents[0].gate = [r === 0 ? 1 : -1, 0];
        return r < 2 ? piece(1, `unit-${r}-${c}`) : unit;
    }));
const restrictedBiomes = api.generateBiomes(restricted);
assert.equal(restrictedBiomes.flat().filter(biome => biome === 'hill').length, 24,
    'Crowded custom boards can exceed the patch limit to use all available terrain squares');
assert.equal(restrictedBiomes.flat().filter(biome => biome === 'mountain').length, 0);

state.reset();
state.boardSize = 12;
state.board = Array.from({ length: 12 }, () => Array(12).fill(null));
state.biomes = Array.from({ length: 12 }, () => Array(12).fill('plains'));
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
