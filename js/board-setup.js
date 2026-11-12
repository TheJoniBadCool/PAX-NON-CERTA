// Random Corner Spawning for 12 pieces per player inside 4x4 area
function generatePlayerPieces(playerIdx) {
    const [minR, minC, maxR, maxC] = PLAYERS[playerIdx].zone;
    const pieceTypes = ['k', 'q', 'r', 'r', 'n', 'n', 'b', 'b', 'p', 'p', 'p', 'p'];
    
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

    const typeCounts = {};
    coords.slice(0, 12).forEach((coord, idx) => {
        const [r, c] = coord;
        const pieceId = `p${playerIdx + 1}_${idx}_${Date.now()}_${Math.random()}`;
        const pieceType = pieceTypes[idx];
        typeCounts[pieceType] = (typeCounts[pieceType] || 0) + 1;
        const unitName = `${PLAYER_CODES[playerIdx]}${pieceType}${typeCounts[pieceType]}`;
        gameState.board[r][c] = {
            id: pieceId,
            player: playerIdx + 1,
            type: pieceType,
            contents: [createUnit(playerIdx + 1, pieceType, `${pieceId}::unit::0`, unitName, randomLevel(), randomLevel())]
        };
    });
}

function initBoard(customBoard = null) {
    if (customBoard) {
        gameState.board = customBoard;
        gameState.eliminated = gameState.activePlayers.map(isSelected => !isSelected);
        return;
    }
    gameState.board = Array(16).fill(null).map(() => Array(16).fill(null));
    gameState.eliminated = gameState.activePlayers.map(isSelected => !isSelected);
    for (let p = 0; p < 4; p++) {
        if (gameState.activePlayers[p]) {
            generatePlayerPieces(p);
        }
    }
}

function createEmptySetupBoard() {
    return Array(16).fill(null).map(() => Array(16).fill(null));
}

function getCustomSetupPieceCount(playerIndex) {
    return gameState.customSetupBoard.flat().filter(piece => piece && piece.player === playerIndex + 1)
        .reduce((count, piece) => count + getPieceContents(piece).length, 0);
}
