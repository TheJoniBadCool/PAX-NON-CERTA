function initializeObjectives() {
    const unitsByPlayer = PLAYERS.map(() => []);
    const castlesByPlayer = PLAYERS.map(() => []);
    gameState.board.forEach((row, r) => row.forEach((square, c) => {
        getSquarePieces(square).forEach(piece => {
            if (piece.player === REBEL_PLAYER_ID) return;
            const contents = getPieceContents(piece);
            piece.contents = contents;
            unitsByPlayer[piece.player - 1].push(...contents);
            contents.filter(unit => getUnitType(unit) === 'r').forEach(castle => {
                const castles = castlesByPlayer[piece.player - 1];
                castle.castleId = castle.id;
                castle.castleSquare = [r, c];
                castle.castleLetter = String.fromCharCode(65 + castles.length);
                castle.castleLabel = `${PLAYERS[piece.player - 1].name} castle ${castle.castleLetter} (${coordsToNotation(r, c)})`;
                castles.push(castle);
            });
        });
    }));
    const choose = items => items[Math.floor(Math.random() * items.length)];
    const resourceTypes = RESOURCE_TYPES.filter(type => gameState.provinceResources.some((_, province) =>
        getProvinceResources(gameState.provinceResources, province).some(resource => resource.type === type.key)));
    gameState.scores = [0, 0, 0, 0];
    gameState.objectives = PLAYERS.map((player, index) => {
        if (!gameState.activePlayers[index]) return [];
        const enemies = PLAYERS.filter((other, i) => i !== index && gameState.activePlayers[i]);
        const enemyUnits = unitsByPlayer.flat().filter(unit =>
            unit.player !== player.id && gameState.activePlayers[unit.player - 1]);
        const enemyKings = enemyUnits.filter(unit => getUnitType(unit) === 'k');
        const enemyQueens = enemyUnits.filter(unit => getUnitType(unit) === 'q');
        const enemyCastles = castlesByPlayer.flat().filter(castle =>
            castle.player !== player.id && gameState.activePlayers[castle.player - 1]);
        const ownKings = unitsByPlayer[index].filter(unit => getUnitType(unit) === 'k');
        const castleObjective = (kind, castle) => ({
            kind, castleId: castle.castleId, castlePlayer: castle.player,
            castleLetter: castle.castleLetter, castleSquare: castle.castleSquare,
            label: kind === 'conquer' ? `Control ${castle.castleLabel}` : `You lost ${castle.castleLabel}`
        });
        const deathObjective = (unit, self = false) => ({
            kind: 'death', unitId: unit.id, targetPlayer: unit.player,
            unitType: getUnitType(unit) === 'k' ? 'king' : 'queen',
            unitName: unit.name, self,
            label: self ? 'Your king is dead' : `${PLAYERS[unit.player - 1].name} ${getUnitType(unit) === 'k' ? 'king' : `queen ${unit.name}`} is dead`
        });
        const choices = [
            ...(enemies.length ? [
                () => ({ kind: 'defeat', targetPlayer: choose(enemies).id }),
                () => ({ kind: 'protector', targetPlayer: choose(enemies).id, penalty: true }),
                () => ({ kind: 'bounty', label: "King/Queen's Bounty: hold another player's King or Queen prisoner for 8 consecutive rounds" })
            ] : []),
            ...(enemyKings.length ? [() => deathObjective(choose(enemyKings))] : []),
            ...(enemyQueens.length ? [() => deathObjective(choose(enemyQueens))] : []),
            ...(enemyCastles.length ? [() => castleObjective('conquer', choose(enemyCastles))] : []),
            ...(ownKings.length ? [() => ({ ...deathObjective(choose(ownKings), true), penalty: true })] : []),
            ...(castlesByPlayer[index].length ? [() => ({ ...castleObjective('lose', choose(castlesByPlayer[index])), penalty: true })] : []),
            ...(resourceTypes.length ? [() => {
                const resource = choose(resourceTypes);
                return { kind: 'monopolist', resourceType: resource.key, label: `Monopolist: control all ${resource.label} production sites` };
            }] : []),
            () => ({ kind: 'expansionist', label: 'Expansionist: hold more provinces than any other player' }),
            () => ({ kind: 'richest', label: 'Richest king: have the largest gold stockpile' }),
            () => ({ kind: 'army', label: 'Largest Army: have the most living combat units' })
        ];
        const count = 6 + Math.floor(Math.random() * 5);
        return Array.from({ length: count }, () => {
            const objective = choose(choices)();
            const points = 2 + Math.floor(Math.random() * 5);
            return { ...objective, points: objective.penalty ? -points : points, completed: false };
        });
    });
}

function getObjectiveLabel(objective) {
    if (objective.kind === 'defeat') return `${PLAYERS[objective.targetPlayer - 1].name} is defeated`;
    if (objective.kind === 'protector') return `Protector: ${PLAYERS[objective.targetPlayer - 1].name} is defeated`;
    if (objective.kind === 'death' && !objective.self) {
        const subject = objective.unitType === 'queen' ? `queen ${objective.unitName}` : 'king';
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
    const armies = [0, 0, 0, 0];
    const royalPrisoners = [[], [], [], []];
    const visit = (piece, onBoard) => {
        getPieceContents(piece).forEach(unit => {
            livingUnitIds.add(unit.id);
            if (onBoard && unit.castleId) castleOwners.set(unit.castleId, piece.player);
            if (piece.player < 1 || piece.player > 4) return;
            if (isPrisoner(unit)) {
                if (unit.prisonerOf === piece.player && unit.originalPlayer >= 1 &&
                    unit.originalPlayer <= PLAYERS.length && unit.originalPlayer !== piece.player &&
                    ['k', 'q'].includes(getUnitType(unit))) royalPrisoners[piece.player - 1].push(unit);
            } else if (getUnitType(unit) !== 'r') {
                armies[piece.player - 1]++;
            }
        });
    };
    gameState.board.flat().flatMap(getSquarePieces).forEach(piece => visit(piece, true));
    gameState.retreating.forEach((entries, index) => entries.forEach(entry =>
        visit({ player: entry.player || index + 1, contents: entry.contents }, false)));
    const provinceOwners = getProvinceOwners(gameState.board);
    const provinces = PLAYERS.map(player => provinceOwners.filter(owner => owner === player.id).length);
    const gold = PLAYERS.map((_, index) => gameState.resources[index]?.gold || 0);
    const leads = (values, index) => values[index] > 0 && gameState.activePlayers.every((active, other) =>
        !active || gameState.eliminated[other] || other === index || values[index] > values[other]);
    gameState.scores = gameState.objectives.map((objectives, index) =>
        objectives.reduce((score, objective) => {
            switch (objective.kind) {
                case 'defeat':
                case 'protector':
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
                case 'expansionist':
                    objective.completed = leads(provinces, index);
                    break;
                case 'richest':
                    objective.completed = leads(gold, index);
                    break;
                case 'army':
                    objective.completed = leads(armies, index);
                    break;
                case 'monopolist': {
                    const sites = gameState.provinceResources.flatMap((_, province) =>
                        getProvinceResources(gameState.provinceResources, province)
                            .filter(resource => resource.type === objective.resourceType)
                            .map(() => provinceOwners[province]));
                    objective.completed = sites.length > 0 && sites.every(owner => owner === index + 1);
                    break;
                }
                case 'bounty':
                    objective.completed ||= royalPrisoners[index].some(unit =>
                        Number.isInteger(unit.prisonerSinceRound) &&
                        gameState.round - 1 - unit.prisonerSinceRound >= 8);
                    break;
            }
            return score + (objective.completed ? objective.points : 0);
        }, gameState.missionPoints?.[index] || 0));
}

function resolveObjectiveRound() {
    let defeated;
    do {
        updateObjectiveScores();
        defeated = [];
        gameState.scores.forEach((score, index) => {
            if (gameState.activePlayers[index] && !gameState.eliminated[index] && score <= -20) {
                defeated.push(index);
            }
        });
        defeated.forEach(index => {
            gameState.eliminated[index] = true;
            logAction(`<b>PLAYER DEFEATED!</b> ${PLAYERS[index].name} reached ${gameState.scores[index]} points.`);
        });
    } while (defeated.length);
    const winners = gameState.scores.map((score, index) =>
        gameState.activePlayers[index] && !gameState.eliminated[index] && score >= 20 ? index : null
    ).filter(index => index !== null);
    const draw = gameState.activePlayers.every((active, index) => !active || gameState.eliminated[index]);
    return { winners, draw };
}
