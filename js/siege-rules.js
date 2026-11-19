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
        if (isPawnRestTurn()) {
            move.invalid = true;
            logAction(`🚫 Player ${move.player}'s siege deployment was rejected: new sieges may only be started on odd-numbered rounds.`);
            return;
        }

        let siege = getSiegeAtSquare(move.to);
        if (!siege) {
            siege = {
                id: `siege_${Date.now()}_${Math.random()}`,
                towerSquare: [...move.to],
                towerTimer: 6,
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
            timer: 3
        });
        move.siegeStart = true;
        move.siegeId = siege.id;
        const location = isPubliclyVisiblePiece(source, [move.from])
            ? `at ${coordsToNotation(...move.to)}` : 'out of sight';
        logAction(`🏹 <b>SIEGE</b>: Player ${move.player} began besieging the Tower ${location}. Assault ready in 3 rounds.`);
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
