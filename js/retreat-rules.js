function queueRetreat(player, contents, battleSquare) {
    if (!contents.length) return;
    gameState.retreating[player - 1].push({
        id: `retreat_${Date.now()}_${Math.random()}`,
        player,
        contents,
        battleSquare,
        reentryRound: gameState.round + 3
    });
}

function hasEnemyAdjacent(row, col, player) {
    return getAdjacentMoves(row, col).some(([r, c]) => {
        const piece = gameState.board[r][c];
        return piece && piece.player !== player;
    });
}

function processRetreatsAtRoundStart() {
    for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
        const pending = gameState.retreating[playerIndex];
        const ready = pending.filter(entry => entry.reentryRound <= gameState.round);
        gameState.retreating[playerIndex] = pending.filter(entry => entry.reentryRound > gameState.round);
        ready.forEach(entry => {
            const [br, bc] = entry.battleSquare;
            const nearby = [];
            for (let r = Math.max(0, br - 3); r <= Math.min(15, br + 3); r++) {
                for (let c = Math.max(0, bc - 3); c <= Math.min(15, bc + 3); c++) {
                    const distance = Math.max(Math.abs(r - br), Math.abs(c - bc));
                    if (distance >= 1 && distance <= 3 && !gameState.board[r][c]) {
                        nearby.push([r, c]);
                    }
                }
            }
            const safe = nearby.filter(([r, c]) => !hasEnemyAdjacent(r, c, entry.player));
            const choices = safe.length ? safe : nearby;
            if (!choices.length) {
                logAction(`💀 Retreat from P${entry.player} was lost before re-entry.`);
                return;
            }
            const [r, c] = choices[Math.floor(Math.random() * choices.length)];
            const contents = entry.contents.map(unit => ({ ...unit }));
            const isGray = gameState.eliminated[entry.player - 1];
            gameState.board[r][c] = {
                id: entry.id,
                player: entry.player,
                type: getMergedPieceType(contents),
                contents,
                isGray
            };
            logAction(`↩️ P${entry.player} retreat re-entered at ${coordsToNotation(r, c)}.`);
        });
    }
    renderRetreatTable();
}
