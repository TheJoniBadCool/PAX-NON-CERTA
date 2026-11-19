function getReadySiegeAssault(piece, from, to) {
    const siege = getSiegeForAttacker(piece.id);
    const attacker = getSiegeAttacker(piece.id);
    const tower = getPieceAt(...to);
    return siege && attacker && attacker.timer === 0 &&
        attacker.sourceSquare[0] === from[0] && attacker.sourceSquare[1] === from[1] &&
        siege.towerSquare[0] === to[0] && siege.towerSquare[1] === to[1] &&
        tower && !arePlayersFriendly(tower.player, piece.player) && isTowerPiece(tower) &&
        getCombatContents(piece).some(unit => getUnitType(unit) === 'p') &&
        isAdjacentSquare(from, to) && isTowerGateMove(from, to)
        ? siege
        : null;
}

function isValidSallyOutPlan(piece, from, to, player, siegeId) {
    const siege = gameState.sieges.find(entry => entry.id === siegeId);
    const tower = siege && getPieceAt(...siege.towerSquare);
    return Boolean(siege && tower && tower.id === piece.id &&
        piece.player === player &&
        from[0] === siege.towerSquare[0] && from[1] === siege.towerSquare[1] &&
        to[0] === siege.towerSquare[0] && to[1] === siege.towerSquare[1] &&
        getCombatContents(piece).some(unit => getUnitType(unit) !== 'r'));
}

function registerSiegeStarts(allIntendedMoves) {
    allIntendedMoves.forEach(move => {
        if (move.invalid || move.isUnmerge || move.siegeAssault) return;
        const source = getPieceByIdAt(...move.from, move.pieceId);
        const target = getPieceAt(...move.to);
        if (!source || source.id !== move.pieceId || !target ||
            arePlayersFriendly(target.player, move.player) || !isTowerPiece(target)) {
            return;
        }
        if (!getCombatContents(source).some(unit => getUnitType(unit) === 'p')) {
            move.invalid = true;
            return;
        }
        let siege = getSiegeAtSquare(move.to);
        const startsSiege = !siege;
        if (startsSiege && !hasPlayerResources(move.player, { food: 2, wood: 2 })) {
            move.invalid = true;
            logAction(`🚫 Player ${move.player}'s siege deployment was rejected: starting a siege costs 2 Food and 2 Wood.`);
            return;
        }

        if (!siege) {
            if (!spendPlayerResources(move.player, { food: 2, wood: 2 })) {
                move.invalid = true;
                logAction(`🚫 Player ${move.player}'s siege deployment was rejected: 2 Food and 2 Wood are required.`);
                return;
            }
            const castleLevel = getCastleUpgradeLevel(target);
            const timers = CASTLE_SIEGE_TIMERS[castleLevel];
            siege = {
                id: `siege_${Date.now()}_${Math.random()}`,
                towerSquare: [...move.to],
                towerTimer: timers.tower,
                startedRound: gameState.round,
                attackers: []
            };
            gameState.sieges.push(siege);
        }
        if (siege.attackers.some(attacker => attacker.pieceId === move.pieceId)) {
            move.invalid = true;
            return;
        }
        siege.attackers.push({
            pieceId: move.pieceId,
            player: move.player,
            sourceSquare: [...move.from],
            timer: CASTLE_SIEGE_TIMERS[getCastleUpgradeLevel(target)].attacker
        });
        move.siegeStart = true;
        move.siegeId = siege.id;
        if (typeof recordMissionAttack === 'function') recordMissionAttack(source, target);
        const location = isPubliclyVisiblePiece(source, [move.from])
            ? `at ${coordsToNotation(...move.to)}` : 'out of sight';
        logAction(`🏹 <b>SIEGE</b>: Player ${move.player} began besieging the Tower ${location}. Assault ready in ${CASTLE_SIEGE_TIMERS[getCastleUpgradeLevel(target)].attacker} rounds${startsSiege ? ' (2 Food + 2 Wood spent)' : ''}.`);
    });
}

function syncSieges() {
    gameState.sieges = gameState.sieges.filter(siege => {
        const tower = getPieceAt(...siege.towerSquare);
        if (!tower || !isTowerPiece(tower)) return false;
        siege.attackers = siege.attackers.filter(attacker => {
            const piece = getPieceByIdAt(...attacker.sourceSquare, attacker.pieceId);
            return piece && piece.id === attacker.pieceId &&
                piece.player === attacker.player &&
                !arePlayersFriendly(piece.player, tower.player) &&
                getPieceContents(piece).length > 0;
        });
        return siege.attackers.length > 0;
    });
}

function applySiegeRoundProgress() {
    syncSieges();
    gameState.sieges.forEach(siege => {
        if (siege.startedRound === gameState.round) return;
        siege.attackers.forEach(attacker => {
            attacker.timer = Math.max(0, attacker.timer - 1);
        });
        const previousTowerTimer = siege.towerTimer;
        siege.towerTimer -= 1;
        if (previousTowerTimer <= 0) {
            const tower = getPieceAt(...siege.towerSquare);
            const nonTowerUnits = tower
                ? getCombatContents(tower).filter(unit => getUnitType(unit) !== 'r')
                : [];
            if (nonTowerUnits.length) {
                const casualty = nonTowerUnits[Math.floor(Math.random() * nonTowerUnits.length)];
                tower.contents = getPieceContents(tower).filter(unit => unit.id !== casualty.id);
                tower.type = getMergedPieceType(tower.contents);
                const winningUnits = siege.attackers.flatMap(attacker => {
                    const piece = getPieceByIdAt(...attacker.sourceSquare, attacker.pieceId);
                    return piece ? getPieceContents(piece).map(unit => ({
                        unit, piece, row: attacker.sourceSquare[0], column: attacker.sourceSquare[1]
                    })) : [];
                });
                transferStoredUnitResources(
                    [...new Set(siege.attackers.map(attacker => attacker.player))], casualty, winningUnits);
                recordDeadPieces(gameState, [casualty]);
                logAction(isPubliclyVisiblePiece(tower, [siege.towerSquare])
                    ? `🏰 <b>SIEGE</b> at ${coordsToNotation(...siege.towerSquare)}: ${getUnitName(casualty)} was lost to the siege.`
                    : '🏰 <b>SIEGE</b>: A garrison unit was lost out of sight.');
            }
        }
    });
    syncSieges();
}

function rejectInvalidTowerAttacks(allIntendedMoves) {
    allIntendedMoves.forEach(move => {
        if (move.invalid) return;
        const stationarySiegeAction = !move.isUnmerge && (move.sallyOut || move.siegeCancel) &&
            move.from[0] === move.to[0] && move.from[1] === move.to[1];
        if (!stationarySiegeAction && !isTowerGateMove(move.from, move.to)) {
            move.invalid = true;
            logAction(`🚫 Player ${move.player}'s action was rejected: Towers can only be entered or exited through their gate.`);
            return;
        }
        if (move.siegeAssault || move.sallyOut || move.siegeCancel) return;
        if (move.isUnmerge && getSiegeAtSquare(move.from)) {
            move.invalid = true;
            logAction(`🚫 Player ${move.player}'s defending Tower is under siege; ordinary extraction is not allowed.`);
            return;
        }
        const target = getPieceAt(...move.to);
        if (!getPiecesAt(...move.to).every(piece => canUnitsTarget(move.contents, piece, move.player))) {
            move.invalid = true;
            logAction(`Prisoner attack by P${move.player} rejected: prisoners may only move or merge.`);
            return;
        }
        if (!target || target.player === move.player || !isTowerPiece(target)) return;

        if (move.isUnmerge || !move.contents.some(unit => !isPrisoner(unit) && getUnitType(unit) === 'p')) {
            move.invalid = true;
            logAction(`🚫 Player ${move.player}'s attack on a Tower was rejected: a whole stack containing a Pawn is required.`);
        }
    });
}
