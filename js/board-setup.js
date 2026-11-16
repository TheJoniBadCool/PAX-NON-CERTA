// Randomly place two six-unit castle stacks per player inside their 4x4 area.
function generatePlayerPieces(playerIdx) {
    const [minR, minC, maxR, maxC] = PLAYERS[playerIdx].zone;
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

function initBoard(customBoard = null) {
    if (customBoard) {
        gameState.board = cloneSetupBoard(customBoard);
        gameState.eliminated = gameState.activePlayers.map(isSelected => !isSelected);
    } else {
        gameState.board = Array(16).fill(null).map(() => Array(16).fill(null));
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
            .filter(([dr, dc]) => r + dr >= 0 && r + dr < 16 && c + dc >= 0 && c + dc < 16);
        const tower = getPieceContents(piece).find(unit => getUnitType(unit) === 'r');
        tower.gate = directions[Math.floor(Math.random() * directions.length)];
    }));
}

function createEmptySetupBoard() {
    return Array(16).fill(null).map(() => Array(16).fill(null));
}

function getCustomSetupPieceCount(playerIndex) {
    return gameState.customSetupBoard.flat().filter(piece => piece && piece.player === playerIndex + 1)
        .reduce((count, piece) => count + getPieceContents(piece).length, 0);
}
