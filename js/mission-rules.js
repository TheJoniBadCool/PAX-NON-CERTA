const MISSION_BATCH_ROUNDS = 16;

function getMissionBoardUnits() {
    const units = [];
    gameState.board.forEach((row, r) => row.forEach((square, c) =>
        getSquarePieces(square).forEach(piece => {
            piece.contents = getPieceContents(piece);
            piece.contents.forEach(unit => units.push({ unit, player: piece.player, square: [r, c] }));
        })));
    return units;
}

function initializeMissions() {
    gameState.missionPoints = [0, 0, 0, 0];
    gameState.missionBatches = [null, null, null, null];
    issueMissionBatches(1);
}

function issueMissionBatches(startRound, random = Math.random) {
    const choose = list => list[Math.floor(random() * list.length)];
    const units = getMissionBoardUnits();
    units.forEach(({ unit }) => {
        if (getUnitType(unit) === 'r') unit.castleId ||= unit.id;
    });
    const owners = getProvinceOwners(gameState.board);
    const sites = gameState.provinceResources.flatMap((_, province) =>
        getProvinceResources(gameState.provinceResources, province).map(resource => ({
            province, type: resource.type,
            square: getResourcePosition(resource, province, gameState.boardSize, gameState.biomes),
            owner: owners[province]
        })));
    gameState.activePlayers.forEach((active, index) => {
        if (!active || gameState.eliminated[index]) return;
        const player = index + 1;
        const opponents = PLAYERS.filter(other => other.id !== player &&
            gameState.activePlayers[other.id - 1] && !gameState.eliminated[other.id - 1]);
        const own = units.filter(entry => entry.player === player && !isPrisoner(entry.unit) &&
            getUnitType(entry.unit) !== 'r');
        const enemy = units.filter(entry => opponents.some(other => other.id === entry.player) &&
            !isPrisoner(entry.unit));
        const castles = units.filter(entry => entry.player !== player &&
            getUnitType(entry.unit) === 'r' && !isPrisoner(entry.unit));
        const ownCastles = units.filter(entry => entry.player === player &&
            getUnitType(entry.unit) === 'r' && !isPrisoner(entry.unit));
        const enemySites = sites.filter(site => opponents.some(other => other.id === site.owner));
        const ownSites = sites.filter(site => site.owner === player);
        const provinces = owners.map((_, province) => province);
        const unitInfo = entry => ({ id: entry.unit.id, name: getUnitName(entry.unit) });
        const siteInfo = site => ({
            province: site.province, resourceType: site.type, square: site.square,
            targetPlayer: site.owner
        });
        const choices = [
            ...(opponents.length ? [
                () => ({ kind: 'attack-player', targetPlayer: choose(opponents).id }),
                () => ({ kind: 'avoid-player', targetPlayer: choose(opponents).id })
            ] : []),
            ...(enemy.length ? [() => {
                const target = choose(enemy);
                return { kind: 'attack-unit', targetPlayer: target.player, targetUnit: unitInfo(target) };
            }] : []),
            ...(castles.length ? [() => {
                const target = choose(castles);
                return { kind: 'take-castle', castleId: target.unit.castleId,
                    castleName: `${getPlayerInfo(target.player).name} Tower (${coordsToNotation(...target.square)})` };
            }] : []),
            ...(enemySites.length ? [() => ({ kind: 'raid', ...siteInfo(choose(enemySites)) })] : []),
            ...(ownSites.length ? [() => ({ kind: 'protect-resource', ...siteInfo(choose(ownSites)) })] : []),
            ...(own.length ? [
                () => ({ kind: 'protect-unit', targetUnit: unitInfo(choose(own)) }),
                () => {
                    const shuffled = [...own];
                    const selected = [shuffled.splice(Math.floor(random() * shuffled.length), 1)[0]];
                    if (shuffled.length && random() < 0.5) selected.push(choose(shuffled));
                    return { kind: 'fallback', units: selected.map(unitInfo), all: random() < 0.5 };
                },
                () => {
                    const target = choose(own);
                    const current = getProvinceIndex(...target.square, gameState.boardSize);
                    return { kind: 'hold-province', targetUnit: unitInfo(target),
                        province: choose(provinces.filter(province => province !== current)),
                        required: 4 + Math.floor(random() * 5), streak: 0 };
                }
            ] : []),
            ...(own.length && ownCastles.length ? [() => {
                const castle = choose(ownCastles);
                const shuffled = [...own];
                const count = 1 + Math.floor(random() * Math.min(3, shuffled.length));
                const selected = Array.from({ length: count }, () =>
                    shuffled.splice(Math.floor(random() * shuffled.length), 1)[0]);
                return { kind: 'hold-castle', units: selected.map(unitInfo), castleId: castle.unit.castleId,
                    castleName: `your Tower (${coordsToNotation(...castle.square)})`,
                    required: 4 + Math.floor(random() * 5), streak: 0 };
            }] : [])
        ];
        if (!choices.length) {
            gameState.missionBatches[index] = null;
            return;
        }
        gameState.missionBatches[index] = {
            startRound, expiresRound: startRound + MISSION_BATCH_ROUNDS - 1,
            missions: Array.from({ length: 3 }, () => ({
                ...choose(choices)(), points: 1 + Math.floor(random() * 2), status: 'active'
            }))
        };
    });
}

function getMissionLabel(mission) {
    const player = mission.targetPlayer ? getPlayerInfo(mission.targetPlayer).name : '';
    const resource = RESOURCE_TYPES.find(type => type.key === mission.resourceType)?.label;
    const names = mission.units?.map(unit => unit.name).join(', ');
    switch (mission.kind) {
        case 'attack-player': return `Attack ${player}`;
        case 'avoid-player': return `Avoid attacks by ${player} for the full mission`;
        case 'attack-unit': return `Attack ${player}'s ${mission.targetUnit.name}`;
        case 'take-castle': return `Take ${mission.castleName}`;
        case 'raid': return `Raid ${player}'s ${resource} site (${coordsToNotation(...mission.square)})`;
        case 'protect-resource': return `Protect your ${resource} site (${coordsToNotation(...mission.square)}) from raids`;
        case 'protect-unit': return `Keep ${mission.targetUnit.name} from being attacked`;
        case 'fallback': return `Fallback ${mission.all ? 'all your mobile units' : names} to your provinces`;
        case 'hold-castle': return `Keep ${names} in ${mission.castleName} for ${mission.required} consecutive rounds (${mission.streak}/${mission.required})`;
        case 'hold-province': return `Move ${mission.targetUnit.name} to province ${mission.province + 1} and keep it there for ${mission.required} consecutive rounds (${mission.streak}/${mission.required})`;
        default: throw new Error(`Unknown mission kind: ${mission.kind}`);
    }
}

function forEachActiveMission(callback, round = gameState.round) {
    (gameState.missionBatches || []).forEach((batch, index) => {
        if (!batch || gameState.eliminated[index] || round < batch.startRound ||
            round > batch.expiresRound) return;
        batch.missions.filter(mission => mission.status === 'active')
            .forEach(mission => callback(mission, index));
    });
}

function recordMissionAttack(attacker, defender) {
    if (attacker.player === defender.player || arePlayersFriendly(attacker.player, defender.player)) return;
    const targetIds = new Set(getCombatContents(defender).map(unit => unit.id));
    forEachActiveMission((mission, index) => {
        if (attacker.player === index + 1 && defender.player === mission.targetPlayer &&
            (mission.kind === 'attack-player' || mission.kind === 'attack-unit' &&
                targetIds.has(mission.targetUnit.id))) mission.triggered = true;
        if (defender.player === index + 1 &&
            (mission.kind === 'avoid-player' && attacker.player === mission.targetPlayer ||
                mission.kind === 'protect-unit' && targetIds.has(mission.targetUnit.id))) mission.status = 'failed';
    });
}

function recordMissionBattle(candidates) {
    candidates.forEach(attacker => candidates.forEach(defender => {
        if (attacker !== defender && getCombatContents(attacker).length && getCombatContents(defender).length) {
            recordMissionAttack(attacker, defender);
        }
    }));
}

function recordMissionRaid(province, resource, position, owner, raiders, round) {
    forEachActiveMission((mission, index) => {
        if (mission.province !== province || mission.resourceType !== resource.type ||
            mission.square?.[0] !== position[0] || mission.square?.[1] !== position[1]) return;
        if (mission.kind === 'raid' && owner === mission.targetPlayer && raiders.includes(index + 1)) {
            mission.triggered = true;
        }
        if (mission.kind === 'protect-resource' && owner === index + 1 && raiders.length) {
            mission.status = 'failed';
        }
    }, round);
}

function recordMissionCastleOwnership() {
    const units = getMissionBoardUnits();
    forEachActiveMission((mission, index) => {
        if (mission.kind === 'take-castle' && units.some(entry => entry.player === index + 1 &&
            entry.unit.castleId === mission.castleId && !isPrisoner(entry.unit))) mission.triggered = true;
    });
}

function updateMissionProgress(completedRound) {
    const units = getMissionBoardUnits();
    const owners = getProvinceOwners(gameState.board);
    const findOwned = (id, player) => units.find(entry =>
        entry.unit.id === id && entry.player === player && !isPrisoner(entry.unit));
    forEachActiveMission((mission, index) => {
        if (gameState.missionBatches[index].lastProgressRound >= completedRound) return;
        const player = index + 1;
        let success = Boolean(mission.triggered);
        const target = mission.targetUnit && findOwned(mission.targetUnit.id, player);
        if (mission.kind === 'take-castle') {
            success ||= units.some(entry => entry.player === player &&
                entry.unit.castleId === mission.castleId && !isPrisoner(entry.unit));
        } else if (mission.kind === 'fallback') {
            const selected = mission.all ? units.filter(entry => entry.player === player &&
                !isPrisoner(entry.unit) && getUnitType(entry.unit) !== 'r') :
                mission.units.map(unit => findOwned(unit.id, player));
            const retreating = gameState.retreating.some((entries, owner) => entries.some(entry =>
                (entry.player || owner + 1) === player &&
                entry.contents.some(unit => !isPrisoner(unit) && getUnitType(unit) !== 'r')));
            success = selected.length > 0 && (!mission.all || !retreating) &&
                selected.every(entry => entry && owners[getProvinceIndex(...entry.square, gameState.boardSize)] === player);
        } else if (mission.kind === 'hold-province' || mission.kind === 'hold-castle') {
            let held;
            if (mission.kind === 'hold-province') {
                held = target && getProvinceIndex(...target.square, gameState.boardSize) === mission.province;
            } else {
                const castle = units.find(entry => entry.player === player &&
                    entry.unit.castleId === mission.castleId && !isPrisoner(entry.unit));
                held = castle && mission.units.every(unit => {
                    const entry = findOwned(unit.id, player);
                    return entry && entry.square[0] === castle.square[0] && entry.square[1] === castle.square[1];
                });
            }
            mission.streak = held ? mission.streak + 1 : 0;
            success = mission.streak >= mission.required;
        } else if (mission.kind === 'protect-unit') {
            const inRetreat = gameState.retreating[index].some(entry =>
                entry.contents.some(unit => unit.id === mission.targetUnit.id && !isPrisoner(unit)));
            if (!target && !inRetreat) mission.status = 'failed';
        } else if (mission.kind === 'protect-resource' && owners[mission.province] !== player) {
            mission.status = 'failed';
        }
        if (mission.status === 'active' && completedRound === gameState.missionBatches[index].expiresRound &&
            ['avoid-player', 'protect-unit', 'protect-resource'].includes(mission.kind)) success = true;
        if (success && mission.status === 'active') {
            mission.status = 'completed';
            gameState.missionPoints[index] += mission.points;
        }
    }, completedRound);
    gameState.missionBatches.forEach(batch => {
        if (batch && completedRound >= batch.startRound && completedRound <= batch.expiresRound &&
            !(batch.lastProgressRound >= completedRound)) batch.lastProgressRound = completedRound;
    });
}

function finishMissionRound(completedRound) {
    updateMissionProgress(completedRound);
    gameState.missionBatches.forEach((batch, index) => {
        if (!batch || completedRound !== batch.expiresRound) return;
        if (!gameState.eliminated[index] && !batch.missions.some(mission => mission.status === 'completed')) {
            gameState.missionPoints[index] -= 2;
        }
        gameState.missionBatches[index] = null;
    });
}

function getMissionTargetSquares(mission, player) {
    const units = getMissionBoardUnits();
    if (mission.square) return [mission.square];
    if (mission.kind === 'hold-province') {
        return gameState.board.flatMap((row, r) => row.flatMap((_, c) =>
            getProvinceIndex(r, c, gameState.boardSize) === mission.province ? [[r, c]] : []));
    }
    const ids = new Set([mission.targetUnit?.id,
        ...(mission.all ? [] : mission.units || []).map(unit => unit.id)].filter(Boolean));
    return units.filter(entry => ids.has(entry.unit.id) ||
        ['attack-player', 'avoid-player'].includes(mission.kind) &&
            entry.player === mission.targetPlayer &&
            entry.unit.id === gameState.capitalTowerIds?.[mission.targetPlayer - 1] ||
        mission.kind === 'fallback' && mission.all && entry.player === player &&
            !isPrisoner(entry.unit) && getUnitType(entry.unit) !== 'r' ||
        mission.castleId && entry.unit.castleId === mission.castleId).map(entry => entry.square);
}
