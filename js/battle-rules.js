// DOM-independent battle calculations and casualty resolution.

function getBattleCandidateData(group) {
    const candidates = group.candidates.map(candidate => ({
        candidate,
        contents: candidate.contents || [{
            id: `${candidate.pieceId}::unit::0`,
            player: candidate.player,
            type: candidate.pieceType,
            name: `${PLAYER_CODES[candidate.player - 1]}${candidate.pieceType}1`
        }],
        unitCount: (candidate.contents || [candidate.pieceType]).length
    }));
    const eliteLeague = candidates.every(entry =>
        entry.contents.every(unit => ['b', 'q', 'k'].includes(getUnitType(unit)))
    );
    const towerDefender = candidates.some(entry =>
        entry.candidate.isStationary &&
        entry.contents.some(unit => getUnitType(unit) === 'r') &&
        entry.contents.some(unit => getUnitType(unit) !== 'r')
    );
    const data = candidates.map(entry => {
        const stackSize = eliteLeague
            ? entry.contents.length
            : entry.contents.filter(unit => ['p', 'r', 'n'].includes(getUnitType(unit))).length;
        const strongestOpponent = candidates
            .filter(other => other.candidate.player !== entry.candidate.player)
            .reduce((max, other) => {
                const otherStackSize = eliteLeague
                    ? other.contents.length
                    : other.contents.filter(unit => ['p', 'r', 'n'].includes(getUnitType(unit))).length;
                return Math.max(max, otherStackSize);
            }, 0);
        const sizeBonusSteps = Math.max(0, stackSize - strongestOpponent);
        const moraleBonus = eliteLeague
            ? 0
            : entry.contents.reduce((bonus, unit) => {
                const type = getUnitType(unit);
                if (type === 'k') return bonus + 0.10;
                if (type === 'q' || type === 'b') return bonus + 0.05;
                return bonus;
            }, 0);
        const towerDefenderBonus = entry.candidate.isStationary &&
            entry.contents.some(unit => getUnitType(unit) === 'r') &&
            entry.contents.some(unit => getUnitType(unit) !== 'r') ? 3 : 1;
        const experienceBonus = entry.contents.reduce((bonus, unit) =>
            bonus + (0.05 * getUnitLevel(unit, 'experience')), 0);
        const armourBonus = entry.contents.reduce((bonus, unit) =>
            bonus + (0.05 * getUnitLevel(unit, 'armour')), 0);
        return {
            ...entry,
            stackSize,
            moraleBonus,
            experienceBonus,
            armourBonus,
            towerDefender,
            towerDefenderBonus,
            rawWeight: stackSize * (1 + (STACK_ADVANTAGE_RATE * sizeBonusSteps) + moraleBonus) +
                experienceBonus + armourBonus,
            weight: Math.pow(
                stackSize * (1 + (STACK_ADVANTAGE_RATE * sizeBonusSteps) + moraleBonus) +
                    experienceBonus + armourBonus,
                BATTLE_ODDS_CURVE
            ) * towerDefenderBonus,
            sizeBonus: STACK_ADVANTAGE_RATE * sizeBonusSteps
        };
    });
    const totalWeight = data.reduce((sum, entry) => sum + entry.weight, 0);
    return data.map(entry => ({
        ...entry,
        probability: totalWeight > 0 ? entry.weight / totalWeight : 0
    }));
}

function casualtyChance(unit, battleProbability, isLoser, siege) {
    const base = CASUALTY_WEIGHTS[getUnitType(unit)] || 0;
    const experienceFactor = 1 - (0.05 * getUnitLevel(unit, 'experience'));
    const armourFactor = 1 - (0.05 * getUnitLevel(unit, 'armour'));
    const pursuitFactor = isLoser ? 1.10 : 1;
    const winnerProtectionFactor = isLoser ? 1 : WINNER_CASUALTY_FACTOR;
    const siegeFactor = siege && !['r'].includes(getUnitType(unit)) ? 2 : 1;
    return Math.min(1, base * (1 - battleProbability) * experienceFactor *
        pursuitFactor * winnerProtectionFactor * siegeFactor);
}

function resolveCandidateCasualties(candidate, battleProbability, isLoser, siege, battleRolls) {
    const contents = getPieceContents(candidate);
    const survivors = [];
    const casualties = [];
    const candidateHasTower = contents.some(unit => getUnitType(unit) === 'r');
    contents.forEach(unit => {
        if (getUnitType(unit) === 'r') {
            survivors.push(unit);
            return;
        }
        if (isLoser && siege && candidateHasTower) {
            casualties.push(unit);
            battleRolls.push(`${getUnitName(unit)}: forced casualty (siege)`);
            return;
        }
        const chance = casualtyChance(unit, battleProbability, isLoser, siege);
        const roll = Math.random();
        if (roll < chance) {
            casualties.push(unit);
            battleRolls.push(`${getUnitName(unit)} casualty roll ${(roll * 100).toFixed(2)}% < ${(chance * 100).toFixed(2)}%: casualty`);
        } else {
            survivors.push(unit);
            battleRolls.push(`${getUnitName(unit)} casualty roll ${(roll * 100).toFixed(2)}% < ${(chance * 100).toFixed(2)}%: survives`);
        }
    });
    survivors.forEach(unit => {
        unit.experience = Math.min(3, getUnitLevel(unit, 'experience') + 1);
    });
    return { survivors, casualties };
}
