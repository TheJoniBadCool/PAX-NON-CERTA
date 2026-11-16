function generateBiomes(board) {
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
                return { r, c, excess, score: Math.random() * 3 +
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

// Randomly place two six-unit castle stacks per player inside their 4x4 area.
function generatePlayerPieces(playerIdx) {
    const [minR, minC, maxR, maxC] = getPlayerZone(playerIdx);
    const castleContents = [
        ['r', 'b', 'p', 'p', 'n', 'q'],
        ['r', 'b', 'p', 'p', 'n', 'k']
    ];

    const coords = [];
    for (let r = minR; r <= maxR; r++) {
        for (let c = minC; c <= maxC; c++) {
            coords.push([r, c]);
        }
    }

    for (let i = coords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [coords[i], coords[j]] = [coords[j], coords[i]];
    }

    const towerPairs = [];
    coords.forEach((first, index) => {
        coords.slice(index + 1).forEach(second => {
            if (Math.max(Math.abs(first[0] - second[0]), Math.abs(first[1] - second[1])) >= 3) {
                towerPairs.push([first, second]);
            }
        });
    });
    const towers = towerPairs[Math.floor(Math.random() * towerPairs.length)];

    const typeCounts = {};
    towers.forEach((coord, castleIndex) => {
        const [r, c] = coord;
        const pieceId = `p${playerIdx + 1}_${castleIndex}_${Date.now()}_${Math.random()}`;
        const contents = castleContents[castleIndex].map((pieceType, unitIndex) => {
            typeCounts[pieceType] = (typeCounts[pieceType] || 0) + 1;
            const unitName = `${PLAYER_CODES[playerIdx]}${pieceType}${typeCounts[pieceType]}`;
            return createUnit(
                playerIdx + 1,
                pieceType,
                `${pieceId}::unit::${unitIndex}`,
                unitName,
                randomLevel(),
                randomLevel()
            );
        });
        gameState.board[r][c] = {
            id: pieceId,
            player: playerIdx + 1,
            type: 'r',
            contents
        };
    });
}

function initBoard(customBoard = null, boardSize = gameState.boardSize) {
    if (customBoard) {
        gameState.board = cloneSetupBoard(customBoard);
        gameState.boardSize = customBoard.length;
        gameState.eliminated = gameState.activePlayers.map(isSelected => !isSelected);
    } else {
        if (!BOARD_SIZES.includes(boardSize)) throw new Error(`Unsupported board size: ${boardSize}`);
        gameState.boardSize = boardSize;
        gameState.board = Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
        gameState.eliminated = gameState.activePlayers.map(isSelected => !isSelected);
        for (let p = 0; p < 4; p++) {
            if (gameState.activePlayers[p]) {
                generatePlayerPieces(p);
            }
        }
    }
    gameState.board.forEach((row, r) => row.forEach((piece, c) => {
        if (!isTowerPiece(piece)) return;
        const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]]
            .filter(([dr, dc]) => r + dr >= 0 && r + dr < gameState.boardSize &&
                c + dc >= 0 && c + dc < gameState.boardSize);
        const tower = getPieceContents(piece).find(unit => getUnitType(unit) === 'r');
        tower.gate = directions[Math.floor(Math.random() * directions.length)];
    }));
    gameState.biomes = generateBiomes(gameState.board);
    gameState.hillHeld = [];
}

function createEmptySetupBoard(boardSize = gameState.boardSize) {
    return Array(boardSize).fill(null).map(() => Array(boardSize).fill(null));
}

function getCustomSetupPieceCount(playerIndex) {
    return gameState.customSetupBoard.flat().filter(piece => piece && piece.player === playerIndex + 1)
        .reduce((count, piece) => count + getPieceContents(piece).length, 0);
}
