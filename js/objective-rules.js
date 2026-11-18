function initializeObjectives() {
    const unitsByPlayer = PLAYERS.map(() => []);
    const castlesByPlayer = PLAYERS.map(() => []);
    gameState.board.forEach((row, r) => row.forEach((piece, c) => {
        if (!piece || piece.player === REBEL_PLAYER_ID) return;
        const contents = getPieceContents(piece);
        piece.contents = contents;
        unitsByPlayer[piece.player - 1].push(...contents);
        const castle = contents.find(unit => getUnitType(unit) === 'r');
        if (castle) {
            const castles = castlesByPlayer[piece.player - 1];
            castle.castleId = castle.id;
            castle.castleSquare = [r, c];
            castle.castleLetter = String.fromCharCode(65 + castles.length);
            castle.castleLabel = `${PLAYERS[piece.player - 1].name} castle ${String.fromCharCode(65 + castles.length)} (${coordsToNotation(r, c)})`;
            castles.push(castle);
        }
    }));
    const choose = items => items[Math.floor(Math.random() * items.length)];
    gameState.scores = [0, 0, 0, 0];
    gameState.objectives = PLAYERS.map((player, index) => {
        if (!gameState.activePlayers[index]) return [];
        const enemies = PLAYERS.filter((other, i) => i !== index && gameState.activePlayers[i]);
        const defeatTarget = choose(enemies);
        const kingTarget = choose(enemies);
        const queenTarget = choose(enemies);
        const castleTarget = choose(enemies);
        const king = unitsByPlayer[kingTarget.id - 1].find(unit => getUnitType(unit) === 'k');
        const queen = choose(unitsByPlayer[queenTarget.id - 1].filter(unit => getUnitType(unit) === 'q'));
        const castle = choose(castlesByPlayer[castleTarget.id - 1]);
        const ownKing = unitsByPlayer[index].find(unit => getUnitType(unit) === 'k');
        return [
            { kind: 'defeat', targetPlayer: defeatTarget.id, points: 4, label: `${defeatTarget.name} is defeated` },
            ...(king ? [{ kind: 'death', unitId: king.id, targetPlayer: kingTarget.id, unitType: 'king', points: 3, label: `${kingTarget.name} king is dead` }] : []),
            ...(queen ? [{ kind: 'death', unitId: queen.id, targetPlayer: queenTarget.id, unitType: 'queen', unitName: queen.name, points: 2, label: `${queenTarget.name} queen ${queen.name} is dead` }] : []),
            ...(castle ? [{
                kind: 'conquer', castleId: castle.castleId, castlePlayer: castle.player,
                castleLetter: castle.castleLetter, castleSquare: castle.castleSquare,
                points: 1, label: `Control ${castle.castleLabel}`
            }] : []),
            ...(ownKing ? [{ kind: 'death', unitId: ownKing.id, targetPlayer: player.id, unitType: 'king', self: true, points: -4, label: 'Your king is dead' }] : []),
            ...castlesByPlayer[index].map(tower => ({
                kind: 'lose', castleId: tower.castleId, castlePlayer: tower.player,
                castleLetter: tower.castleLetter, castleSquare: tower.castleSquare,
                points: -3, label: `You lost ${tower.castleLabel}`
            }))
        ].map(objective => ({ ...objective, completed: false }));
    });
}

function getObjectiveLabel(objective) {
    if (objective.kind === 'defeat') return `${PLAYERS[objective.targetPlayer - 1].name} is defeated`;
    if (objective.kind === 'death' && !objective.self) {
        const subject = objective.unitType === 'queen'
            ? `queen ${objective.unitName}`
            : 'king';
        return `${PLAYERS[objective.targetPlayer - 1].name} ${subject} is dead`;
    }
    if (objective.kind === 'conquer' || objective.kind === 'lose') {
        const castle = `${PLAYERS[objective.castlePlayer - 1].name} castle ${objective.castleLetter} (${coordsToNotation(...objective.castleSquare)})`;
        return objective.kind === 'conquer' ? `Control ${castle}` : `You lost ${castle}`;
    }
    return objective.label;
}

function updateObjectiveScores() {
    const livingUnitIds = new Set();
    const castleOwners = new Map();
    gameState.board.flat().filter(Boolean).forEach(piece => {
        getPieceContents(piece).forEach(unit => {
            livingUnitIds.add(unit.id);
            if (unit.castleId) castleOwners.set(unit.castleId, piece.player);
        });
    });
    // Retreating units are alive even while temporarily off the board.
    gameState.retreating.flat().forEach(entry => {
        entry.contents.forEach(unit => livingUnitIds.add(unit.id));
    });
    gameState.scores = gameState.objectives.map((objectives, index) => {
        return objectives.reduce((score, objective) => {
            switch (objective.kind) {
                case 'defeat':
                    objective.completed = gameState.eliminated[objective.targetPlayer - 1];
                    break;
                case 'death':
                    objective.completed = !livingUnitIds.has(objective.unitId);
                    break;
                case 'conquer':
                    objective.completed = castleOwners.get(objective.castleId) === index + 1;
                    break;
                case 'lose':
                    objective.completed = castleOwners.get(objective.castleId) !== index + 1;
                    break;
            }
            return score + (objective.completed ? objective.points : 0);
        }, 0);
    });
}

function resolveObjectiveRound() {
    updateObjectiveScores();
    const defeated = [];
    gameState.scores.forEach((score, index) => {
        if (gameState.activePlayers[index] && !gameState.eliminated[index] && score <= -10) {
            defeated.push(index);
        }
    });
    defeated.forEach(index => {
        gameState.eliminated[index] = true;
        logAction(`<b>PLAYER DEFEATED!</b> ${PLAYERS[index].name} reached ${gameState.scores[index]} points.`);
    });
    updateObjectiveScores();
    const winners = gameState.scores.map((score, index) =>
        gameState.activePlayers[index] && !gameState.eliminated[index] && score >= 10 ? index : null
    ).filter(index => index !== null);
    const draw = gameState.activePlayers.every((active, index) => !active || gameState.eliminated[index]);
    return { winners, draw };
}
