function getReadySiegeAssault(piece, from, to) {
    const siege = getSiegeForAttacker(piece.id);
    const attacker = getSiegeAttacker(piece.id);
    const tower = gameState.board[to[0]][to[1]];
    return siege && attacker && attacker.timer === 0 &&
        attacker.sourceSquare[0] === from[0] && attacker.sourceSquare[1] === from[1] &&
        siege.towerSquare[0] === to[0] && siege.towerSquare[1] === to[1] &&
        tower && isTowerPiece(tower) &&
        getPieceContents(piece).some(unit => getUnitType(unit) === 'p') &&
        isAdjacentSquare(from, to)
        ? siege
        : null;
}

function isValidSallyOutPlan(piece, from, to, player, siegeId) {
    const siege = gameState.sieges.find(entry => entry.id === siegeId);
    const tower = siege && gameState.board[siege.towerSquare[0]][siege.towerSquare[1]];
    return Boolean(siege && tower && tower.id === piece.id &&
        piece.player === player &&
        from[0] === siege.towerSquare[0] && from[1] === siege.towerSquare[1] &&
        to[0] === siege.towerSquare[0] && to[1] === siege.towerSquare[1] &&
        getPieceContents(piece).some(unit => getUnitType(unit) !== 'r'));
}

function registerSiegeStarts(allIntendedMoves) {
    allIntendedMoves.forEach(move => {
        if (move.invalid || move.isUnmerge || move.siegeAssault) return;
        const source = gameState.board[move.from[0]][move.from[1]];
        const target = gameState.board[move.to[0]][move.to[1]];
        if (!source || source.id !== move.pieceId || !target ||
            target.player === move.player || !isTowerPiece(target)) {
            return;
        }
        if (!getPieceContents(source).some(unit => getUnitType(unit) === 'p')) {
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
        logAction(`🏹 <b>SIEGE</b>: Player ${move.player} began besieging the Tower at ${coordsToNotation(...move.to)}. Assault ready in 3 rounds.`);
    });
}

function syncSieges() {
    gameState.sieges = gameState.sieges.filter(siege => {
        const tower = gameState.board[siege.towerSquare[0]][siege.towerSquare[1]];
        if (!tower || !isTowerPiece(tower)) return false;
        siege.attackers = siege.attackers.filter(attacker => {
            const piece = gameState.board[attacker.sourceSquare[0]][attacker.sourceSquare[1]];
            return piece && piece.id === attacker.pieceId &&
                piece.player === attacker.player &&
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
            const tower = gameState.board[siege.towerSquare[0]][siege.towerSquare[1]];
            const nonTowerUnits = tower
                ? getPieceContents(tower).filter(unit => getUnitType(unit) !== 'r')
                : [];
            if (nonTowerUnits.length) {
                const casualty = nonTowerUnits[Math.floor(Math.random() * nonTowerUnits.length)];
                tower.contents = getPieceContents(tower).filter(unit => unit.id !== casualty.id);
                tower.type = getMergedPieceType(tower.contents);
                logAction(`🏰 <b>SIEGE</b> at ${coordsToNotation(...siege.towerSquare)}: ${getUnitName(casualty)} was lost to the siege.`);
            }
        }
    });
    syncSieges();
}

function rejectInvalidTowerAttacks(allIntendedMoves) {
    allIntendedMoves.forEach(move => {
        if (move.invalid || move.siegeAssault || move.sallyOut) return;
        if (move.isUnmerge && getSiegeAtSquare(move.from)) {
            move.invalid = true;
            logAction(`🚫 The defending Tower at ${coordsToNotation(...move.from)} is under siege; ordinary extraction is not allowed.`);
            return;
        }
        const target = gameState.board[move.to[0]][move.to[1]];
        if (!target || target.player === move.player || !isTowerPiece(target)) return;

        if (move.isUnmerge || !move.contents.some(unit => getUnitType(unit) === 'p')) {
            move.invalid = true;
            logAction(`🚫 Player ${move.player}'s attack on the Tower at ${coordsToNotation(...move.to)} was rejected: a whole stack containing a Pawn is required.`);
        }
    });
}
