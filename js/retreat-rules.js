function queueRetreat(player, contents, battleSquare, released = false) {
    if (!contents.length) return;
    const reentryRound = gameState.round + 3;
    gameState.retreating[player - 1].push({
        id: `retreat_${Date.now()}_${Math.random()}`,
        player,
        released,
        contents: contents.map(unit => ({
            ...unit,
            routedStacks: released ? 0 : Math.min(ROUTED_MAX_STACKS, getRoutedStacks(unit) + 1),
            routedUntilRound: released ? 0 : reentryRound + ROUTED_COOLDOWN_ROUNDS
        })),
        battleSquare,
        reentryRound
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
            for (let r = Math.max(0, br - 3); r <= Math.min(gameState.boardSize - 1, br + 3); r++) {
                for (let c = Math.max(0, bc - 3); c <= Math.min(gameState.boardSize - 1, bc + 3); c++) {
                    const distance = Math.max(Math.abs(r - br), Math.abs(c - bc));
                    if (distance >= 1 && distance <= 3 && !gameState.board[r][c] && isPassableSquare(r, c)) {
                        nearby.push([r, c]);
                    }
                }
            }
            const safe = nearby.filter(([r, c]) => !hasEnemyAdjacent(r, c, entry.player));
            const choices = safe.length ? safe : nearby;
            if (!choices.length) {
                if (entry.released) {
                    entry.reentryRound = gameState.round + 1;
                    gameState.retreating[playerIndex].push(entry);
                    logAction(`Released P${entry.player} units await a free re-entry square.`);
                    return;
                }
                recordDeadPieces(gameState, entry.contents);
                logAction(`💀 Retreat from P${entry.player} was lost before re-entry.`);
                return;
            }
            const [r, c] = choices[Math.floor(Math.random() * choices.length)];
            const contents = entry.contents.map(unit => ({
                ...unit,
                routedUntilRound: entry.released ? 0 : gameState.round + ROUTED_COOLDOWN_ROUNDS
            }));
            const isGray = gameState.eliminated[entry.player - 1];
            gameState.board[r][c] = {
                id: entry.id,
                player: entry.player,
                type: getMergedPieceType(contents),
                contents,
                isGray
            };
            logAction(`↩️ P${entry.player} ${entry.released ? 'released units' : 'retreat'} re-entered ${getBiome(r, c) === 'forest' ? 'in a forest' : `at ${coordsToNotation(r, c)}`}.`);
        });
    }
    renderRetreatTable();
}
