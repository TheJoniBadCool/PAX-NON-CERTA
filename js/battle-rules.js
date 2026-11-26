// DOM-independent battle calculations and casualty resolution.

function getBattleCandidateData(group) {
    const candidates = group.candidates.map(candidate => ({
        candidate,
        contents: candidate.contents || [{
            id: `${candidate.pieceId}::unit::0`,
            player: candidate.player,
            type: candidate.pieceType,
            name: `${PLAYER_CODES[candidate.player - 1] || 'R'}${candidate.pieceType}1`
        }],
        unitCount: (candidate.contents || [candidate.pieceType]).length
    }));
    candidates.forEach(entry => {
        entry.combatContents = entry.contents.filter(unit => !isPrisoner(unit));
    });
    const eliteLeague = candidates.every(entry =>
        entry.combatContents.every(unit => ['b', 'q', 'k'].includes(getUnitType(unit)))
    );
    const towerDefender = candidates.some(entry =>
        entry.candidate.isStationary &&
        entry.contents.some(unit => getUnitType(unit) === 'r') &&
        entry.combatContents.some(unit => getUnitType(unit) !== 'r')
    );
    const data = candidates.map(entry => {
        const contents = entry.combatContents;
        const stackSize = eliteLeague
            ? contents.length
            : contents.filter(unit => ['p', 'r', 'n'].includes(getUnitType(unit))).length;
        const strongestOpponent = candidates
            .filter(other => other.candidate.player !== entry.candidate.player)
            .reduce((max, other) => {
                const otherStackSize = eliteLeague
                    ? other.combatContents.length
                    : other.combatContents.filter(unit => ['p', 'r', 'n'].includes(getUnitType(unit))).length;
                return Math.max(max, otherStackSize);
            }, 0);
        const sizeBonusSteps = Math.max(0, stackSize - strongestOpponent);
        const moraleBonus = eliteLeague
            ? 0
            : contents.reduce((bonus, unit) => {
                const type = getUnitType(unit);
                if (type === 'k') return bonus + 0.10;
                if (type === 'q' || type === 'b') return bonus + 0.05;
                return bonus;
            }, 0);
        const towerDefenderBonus = entry.candidate.isStationary &&
            entry.contents.some(unit => getUnitType(unit) === 'r') &&
            contents.some(unit => getUnitType(unit) !== 'r')
            ? 3 + getCastleUpgradeLevel({ contents: entry.contents })
            : 1;
        const experienceBonus = contents.reduce((bonus, unit) =>
            bonus + (0.05 * getUnitLevel(unit, 'experience')), 0);
        const armourBonus = contents.reduce((bonus, unit) =>
            bonus + (0.05 * getUnitLevel(unit, 'armour')), 0);
        const routedPenalty = contents.length ? contents.reduce((penalty, unit) =>
            penalty + getRoutedStacks(unit) * ROUTED_STRENGTH_PENALTY, 0) / contents.length : 0;
        const terrainBonus = entry.candidate.terrainBonus || 0;
        const rawWeight = (
            stackSize * (1 + (STACK_ADVANTAGE_RATE * sizeBonusSteps) + moraleBonus) +
            experienceBonus + armourBonus
        ) * (1 - routedPenalty) * (1 + terrainBonus);
        return {
            ...entry,
            stackSize,
            moraleBonus,
            experienceBonus,
            armourBonus,
            routedPenalty,
            terrainBonus,
            towerDefender,
            towerDefenderBonus,
            rawWeight,
            weight: Math.pow(rawWeight, BATTLE_ODDS_CURVE) * towerDefenderBonus,
            sizeBonus: STACK_ADVANTAGE_RATE * sizeBonusSteps
        };
    });
    const totalWeight = data.reduce((sum, entry) => sum + entry.weight, 0);
    return data.map(entry => ({
        ...entry,
        probability: totalWeight > 0 ? entry.weight / totalWeight : 0
    }));
}

function casualtyChance(unit, battleProbability, isLoser, siege, contents = [unit]) {
    if (isPrisoner(unit)) return 0;
    contents = contents.filter(other => !isPrisoner(other));
    const type = getUnitType(unit);
    if (type === 'r') return 0;
    const loneRoyal = isLoser && contents.length === 1 && ['q', 'k'].includes(type);
    const base = (loneRoyal ? LONE_ROYAL_CASUALTY_WEIGHTS[type] : CASUALTY_WEIGHTS[type]) || 0;
    const experienceFactor = 1 - (0.05 * getUnitLevel(unit, 'experience'));
    const armourFactor = 1 - (0.05 * getUnitLevel(unit, 'armour'));
    const pursuitFactor = isLoser ? 1.10 : 1;
    const winnerProtectionFactor = isLoser ? 1 : WINNER_CASUALTY_FACTOR;
    const siegeFactor = siege && !['r'].includes(getUnitType(unit)) ? 2 : 1;
    return Math.min(1, base * (1 - battleProbability) * experienceFactor *
        pursuitFactor * winnerProtectionFactor * siegeFactor +
        getRoutedStacks(unit) * ROUTED_CASUALTY_PENALTY);
}

function resolveCandidateCasualties(candidate, battleProbability, isLoser, siege, battleRolls) {
    const contents = getPieceContents(candidate);
    const survivors = [];
    const casualties = [];
    const captured = [];
    const candidateHasTower = contents.some(unit => getUnitType(unit) === 'r');
    contents.forEach(unit => {
        if (isPrisoner(unit)) {
            (isLoser ? captured : survivors).push(unit);
            return;
        }
        if (getUnitType(unit) === 'r') {
            survivors.push(unit);
            return;
        }
        if (isLoser && siege && candidateHasTower) {
            captured.push(unit);
            battleRolls.push(`${getUnitName(unit)}: captured (siege)`);
            return;
        }
        const chance = casualtyChance(unit, battleProbability, isLoser, siege, contents);
        const roll = Math.random();
        if (roll < chance) {
            (isLoser ? captured : casualties).push(unit);
            battleRolls.push(`${getUnitName(unit)} casualty roll ${(roll * 100).toFixed(2)}% < ${(chance * 100).toFixed(2)}%: ${isLoser ? 'captured' : 'casualty'}`);
        } else {
            survivors.push(unit);
            battleRolls.push(`${getUnitName(unit)} casualty roll ${(roll * 100).toFixed(2)}% < ${(chance * 100).toFixed(2)}%: survives`);
        }
    });
    survivors.forEach(unit => {
        if (isPrisoner(unit)) return;
        unit.experience = Math.min(3, getUnitLevel(unit, 'experience') + 1);
    });
    return { survivors, casualties, captured };
}

function eliminateDefeatedRebels(result, removeSurvivor, battleRolls) {
    const isRebelTroop = unit => unit.player === REBEL_PLAYER_ID &&
        !isPrisoner(unit) && getUnitType(unit) !== 'r';
    const removed = [
        ...result.captured.filter(isRebelTroop),
        ...result.survivors.filter(unit => isRebelTroop(unit) && removeSurvivor(unit))
    ];
    const removedIds = new Set(removed.map(unit => unit.id));
    result.captured = result.captured.filter(unit => !removedIds.has(unit.id));
    result.survivors = result.survivors.filter(unit => !removedIds.has(unit.id));
    result.casualties.push(...removed);
    removed.forEach(unit => battleRolls.push(`${getUnitName(unit)}: eliminated after defeat`));
}
