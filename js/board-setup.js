function createRandomMapSeed() {
    return String(Math.floor(Math.random() * 4294967296));
}

function createSeededRandom(seed) {
    let state = 2166136261;
    for (const character of String(seed)) {
        state = Math.imul(state ^ character.charCodeAt(0), 16777619);
    }
    return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function generateBiomes(board, random = Math.random) {
    const size = board.length;
    const biomes = Array.from({ length: size }, () => Array(size).fill('plains'));
    const squares = [];
    const protectedGates = new Set();
    board.forEach((row, r) => row.forEach((piece, c) => {
        squares.push([r, c]);
        if (isTowerPiece(piece)) {
            const [dr, dc] = getTowerGate(piece);
            protectedGates.add(`${r + dr},${c + dc}`);
        }
    }));
    const adjacent = (r, c) => {
        const neighbors = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if ((dr || dc) && r + dr >= 0 && r + dr < size && c + dc >= 0 && c + dc < size) {
                    neighbors.push([r + dr, c + dc]);
                }
            }
        }
        return neighbors;
    };
    const connected = () => {
        const open = squares.filter(([r, c]) =>
            biomes[r][c] !== 'mountain' && !isTowerPiece(board[r][c]));
        if (!open.length) return true;
        const seen = new Set([open[0].join(',')]);
        const queue = [open[0]];
        for (let i = 0; i < queue.length; i++) {
            adjacent(...queue[i]).forEach(([r, c]) => {
                const key = `${r},${c}`;
                if (biomes[r][c] !== 'mountain' && !isTowerPiece(board[r][c]) && !seen.has(key)) {
                    seen.add(key);
                    queue.push([r, c]);
                }
            });
        }
        return seen.size === open.length;
    };
    const total = size * size;
    const targets = {
        mountain: Math.round(total * 0.1),
        hill: Math.round(total * 0.2),
        forest: Math.round(total * 0.2)
    };
    const patchLimits = { mountain: 6, hill: 10, forest: 10 };
    for (const biome of ['mountain', 'hill', 'forest']) {
        for (let count = 0; count < targets[biome]; count++) {
            const patches = Array.from({ length: size }, () => Array(size).fill(-1));
            const patchSizes = [];
            squares.forEach(([r, c]) => {
                if (biomes[r][c] !== biome || patches[r][c] !== -1) return;
                const id = patchSizes.length;
                const queue = [[r, c]];
                patches[r][c] = id;
                for (let i = 0; i < queue.length; i++) {
                    adjacent(...queue[i]).forEach(([rr, cc]) => {
                        if (biomes[rr][cc] === biome && patches[rr][cc] === -1) {
                            patches[rr][cc] = id;
                            queue.push([rr, cc]);
                        }
                    });
                }
                patchSizes.push(queue.length);
            });
            const candidates = squares.filter(([r, c]) => biomes[r][c] === 'plains' &&
                !isTowerPiece(board[r][c]) &&
                (biome !== 'mountain' || (!board[r][c] && !protectedGates.has(`${r},${c}`))));
            const ranked = candidates.map(([r, c]) => {
                const neighbors = adjacent(r, c);
                const similar = neighbors.filter(([rr, cc]) => biomes[rr][cc] === biome).length;
                const mountains = neighbors.filter(([rr, cc]) => biomes[rr][cc] === 'mountain').length;
                const neighboringPatches = new Set(neighbors.map(([rr, cc]) => patches[rr][cc])
                    .filter(id => id !== -1));
                const resultingSize = 1 + [...neighboringPatches]
                    .reduce((sum, id) => sum + patchSizes[id], 0);
                const excess = Math.max(0, resultingSize - patchLimits[biome]);
                return { r, c, excess, score: random() * 3 +
                    (similar ? 1.2 : 0) + (similar === 2 ? 0.3 : 0) +
                    (biome === 'hill' && mountains ? 0.5 : 0) };
            }).sort((a, b) => a.excess - b.excess || b.score - a.score);
            let placed = false;
            for (const { r, c } of ranked) {
                biomes[r][c] = biome;
                if (biome !== 'mountain' || connected()) {
                    placed = true;
                    break;
                }
                biomes[r][c] = 'plains';
            }
            if (!placed) break;
        }
    }
    return biomes;
}

// Place each player's full roster in one castle in their corner province.
function generatePlayerPieces(playerIdx, random = Math.random, board = gameState.board,
    boardSize = gameState.boardSize, progressionMode = gameState.progressionMode) {
    const provinceRow = playerIdx >= 2 ? 3 : 0;
    const provinceColumn = playerIdx === 1 || playerIdx === 2 ? 3 : 0;
    const minRow = Math.floor(provinceRow * boardSize / 4);
    const maxRow = Math.floor((provinceRow + 1) * boardSize / 4);
    const minColumn = Math.floor(provinceColumn * boardSize / 4);
    const maxColumn = Math.floor((provinceColumn + 1) * boardSize / 4);
    const coords = [];
    for (let r = minRow; r < maxRow; r++) {
        for (let c = minColumn; c < maxColumn; c++) {
            if (!board[r][c]) coords.push([r, c]);
        }
    }
    for (let i = coords.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [coords[i], coords[j]] = [coords[j], coords[i]];
    }
    if (!coords.length) {
        throw new Error(`No free square for player ${playerIdx + 1}'s castle in its starting province`);
    }

    const [r, c] = coords[0];
    const pieceId = `p${playerIdx + 1}_castle`;
    const pieceTypes = ['r', 'b', 'p', 'p', 'n', 'q', 'r', 'b', 'p', 'p', 'n', 'k'];
    const typeCounts = {};
    const contents = pieceTypes.map((pieceType, unitIndex) => {
        typeCounts[pieceType] = (typeCounts[pieceType] || 0) + 1;
        const unitName = `${PLAYER_CODES[playerIdx]}${pieceType}${typeCounts[pieceType]}`;
        return createUnit(
            playerIdx + 1,
            pieceType,
            `${pieceId}::unit::${unitIndex}`,
            unitName,
            randomLevel(random, progressionMode),
            randomLevel(random, progressionMode)
        );
    });
    board[r][c] = {
        id: pieceId,
        player: playerIdx + 1,
        type: 'r',
        contents
    };
}

function generateRebelPieces(random, board, boardSize) {
    for (let provinceRow = 0; provinceRow < 4; provinceRow++) {
        for (let provinceColumn = 0; provinceColumn < 4; provinceColumn++) {
            const minRow = Math.floor(provinceRow * boardSize / 4);
            const maxRow = Math.floor((provinceRow + 1) * boardSize / 4);
            const minColumn = Math.floor(provinceColumn * boardSize / 4);
            const maxColumn = Math.floor((provinceColumn + 1) * boardSize / 4);
            const available = [];
            let hasCastle = false;
            for (let r = minRow; r < maxRow; r++) {
                for (let c = minColumn; c < maxColumn; c++) {
                    if (isTowerPiece(board[r][c])) hasCastle = true;
                    if (!board[r][c]) available.push([r, c]);
                }
            }
            if (hasCastle) continue;
            if (!available.length) {
                throw new Error(`No free square for a rebel castle in province ${provinceRow * 4 + provinceColumn + 1}`);
            }
            const castleIndex = Math.floor(random() * available.length);
            const [r, c] = available.splice(castleIndex, 1)[0];
            const id = `rebel_castle_${provinceRow * 4 + provinceColumn + 1}`;
            board[r][c] = {
                id,
                player: REBEL_PLAYER_ID,
                type: 'r',
                contents: [
                    createUnit(REBEL_PLAYER_ID, 'r', `${id}::tower`, `${PLAYER_CODES[4]}r${provinceRow * 4 + provinceColumn + 1}`),
                    createUnit(REBEL_PLAYER_ID, 'p', `${id}::pawn`, `${PLAYER_CODES[4]}p${provinceRow * 4 + provinceColumn + 1}`)
                ]
            };
            if (!available.length) {
                throw new Error(`No free square for a rebel pawn outside the castle in province ${provinceRow * 4 + provinceColumn + 1}`);
            }
            const [pawnRow, pawnColumn] = available[Math.floor(random() * available.length)];
            const pawnId = `rebel_roamer_${provinceRow * 4 + provinceColumn + 1}`;
            board[pawnRow][pawnColumn] = {
                id: pawnId,
                player: REBEL_PLAYER_ID,
                type: 'p',
                contents: [createUnit(REBEL_PLAYER_ID, 'p', `${pawnId}::pawn`, 'Rebel pawn')]
            };
        }
    }
}

function createStartingBoard(activePlayers, boardSize, seed, customBoard = null,
    progressionMode = gameState.progressionMode) {
    const random = createSeededRandom(seed);
    const board = customBoard
        ? cloneSetupBoard(customBoard)
        : Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
    if (!customBoard) {
        for (let p = 0; p < 4; p++) {
            if (activePlayers[p]) generatePlayerPieces(p, random, board, boardSize, progressionMode);
        }
        generateRebelPieces(random, board, boardSize);
    }
    board.forEach((row, r) => row.forEach((piece, c) => {
        if (!isTowerPiece(piece)) return;
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .filter(([dr, dc]) => r + dr >= 0 && r + dr < boardSize &&
                c + dc >= 0 && c + dc < boardSize);
        const gate = directions[Math.floor(random() * directions.length)];
        getPieceContents(piece).filter(unit => getUnitType(unit) === 'r')
            .forEach(tower => { tower.gate = gate; });
    }));
    return { board, biomes: generateBiomes(board, random) };
}

function initBoard(customBoard = null, boardSize = gameState.boardSize, seed = null) {
    if (!customBoard && !BOARD_SIZES.includes(boardSize)) {
        throw new Error(`Unsupported board size: ${boardSize}`);
    }
    gameState.mapSeed = seed === null ? createRandomMapSeed() : String(seed);
    gameState.boardSize = customBoard ? customBoard.length : boardSize;
    const starting = createStartingBoard(
        gameState.activePlayers, gameState.boardSize, gameState.mapSeed, customBoard);
    gameState.board = starting.board;
    gameState.biomes = starting.biomes;
    gameState.eliminated = gameState.activePlayers.map(isSelected => !isSelected);
    gameState.hillHeld = [];
}

function renderMapPreview(container, starting, boardSize) {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `repeat(${boardSize}, 1fr)`;
    const provinceOwners = getProvinceOwners(starting.board);
    for (let r = 0; r < boardSize; r++) {
        for (let c = 0; c < boardSize; c++) {
            const square = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            square.className = `square ${isLight ? 'sq-light' : 'sq-dark'} biome-${starting.biomes[r][c]} map-preview-square`;
            const provinceOwner = provinceOwners[getProvinceIndex(r, c, boardSize)];
            if (provinceOwner) square.classList.add(`zone-p${provinceOwner}`);
            const piece = starting.board[r][c];
            if (isTowerPiece(piece)) {
                const marker = document.createElement('span');
                const player = getPlayerInfo(piece.player);
                marker.className = `map-preview-castle ${player.class}`;
                marker.setAttribute('aria-hidden', 'true');
                square.appendChild(marker);
            } else if (piece && piece.player === REBEL_PLAYER_ID) {
                const marker = document.createElement('span');
                marker.className = 'map-preview-pawn';
                marker.innerText = '♟';
                marker.setAttribute('aria-hidden', 'true');
                square.appendChild(marker);
            }
            square.title = `${starting.biomes[r][c]}${piece
                ? ` · ${getPlayerInfo(piece.player).colorName} ${isTowerPiece(piece) ? 'castle' : 'pawn'}` : ''}`;
            container.appendChild(square);
        }
    }
}

function createEmptySetupBoard(boardSize = gameState.boardSize) {
    return Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
}

function getCustomSetupPieceCount(playerIndex) {
    return gameState.customSetupBoard.flat().filter(piece => piece && piece.player === playerIndex + 1)
        .reduce((count, piece) => count + getPieceContents(piece).length, 0);
}
