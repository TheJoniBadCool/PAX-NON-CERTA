function getAdjacentMoves(r, c) {
    const directions = [
        [-1,-1], [-1,0], [-1,1],
        [0,-1],          [0,1],
        [1,-1],  [1,0],   [1,1]
    ];
    return directions
        .map(([dr, dc]) => [r + dr, c + dc])
        .filter(([tr, tc]) => tr >= 0 && tr < gameState.boardSize &&
            tc >= 0 && tc < gameState.boardSize);
}

function isPawnRestTurn() {
    return gameState.round % 2 === 0;
}

function pieceContainsPawn(piece) {
    return getPieceContents(piece).some(unit => getUnitType(unit) === 'p');
}

function canMoveWholePiece(piece, plans = gameState.plans[piece.player - 1],
    forceMarch = hasForceMarchAllowance(piece, plans)) {
    if (piece.player === REBEL_PLAYER_ID || isEliminatedPiece(piece) ||
        isPlayerImmobilized(piece.player)) return false;
    const contents = getPlannedPieceContents(piece, plans);
    return contents.length > 0 && (!isPawnRestTurn() ||
        !contents.some(unit => getUnitType(unit) === 'p' || isPrisoner(unit)) ||
        forceMarch);
}

function canMoveHeldUnit(unit, plans = gameState.plans.flat()) {
    return !isPlayerImmobilized(unit.prisonerOf || unit.player) &&
        !plans.some(plan => plan.prisonerAction && plan.unitId === unit.id) &&
        (!isPawnRestTurn() || (getUnitType(unit) !== 'p' && !isPrisoner(unit)));
}

function canUnitsTarget(contents, target, player) {
    return !target || (arePlayersFriendly(target.player, player) &&
        (target.player === player || !isTowerPiece(target))) ||
        (!arePlayersAllied(target.player, player) && contents.some(unit => !isPrisoner(unit)));
}

function canUnitsEnterSquare(contents, square, player) {
    return getVisiblePieces(...square, player).every(target => canUnitsTarget(contents, target, player));
}

// Universal 1-Square Movement Rule in all 8 directions
function getValidMovesForPiece(r, c) {
    const piece = getPieceAt(r, c, gameState.turnIndex + 1);
    if (!piece || isEliminatedPiece(piece) || isPlayerImmobilized(piece.player) ||
        gameState.lockedPieceIds.has(piece.id)) return [];
    if (getSiegeAtSquare([r, c])) return [];

    const attackerSiege = getSiegeForAttacker(piece.id);
    if (attackerSiege) {
        return getReadySiegeAssault(piece, [r, c], attackerSiege.towerSquare)
            ? [attackerSiege.towerSquare]
            : [];
    }
    if (!canMoveWholePiece(piece)) {
        if (!isPawnRestTurn() || piece.type === 'r' ||
            !getCombatContents(piece).some(unit => getUnitType(unit) === 'p')) return [];
        return getAdjacentMoves(r, c).filter(([tr, tc]) => {
            const targets = getPiecesAt(tr, tc);
            return isPassableSquare(tr, tc) &&
                isTowerGateMove([r, c], [tr, tc]) &&
                targets.some(target => target.player !== piece.player &&
                    !arePlayersFriendly(target.player, piece.player) && isTowerPiece(target)) &&
                canUnitsEnterSquare(getPlannedPieceContents(piece), [tr, tc], piece.player);
        });
    }
    if (piece.type === 'r') return []; // Towers and stacks led by Towers are immovable.

    const moves = [];
    const activePlayerId = gameState.turnIndex + 1;
    const currentPlans = gameState.plans[gameState.turnIndex];

    const directions = [
        [-1,-1], [-1,0], [-1,1],
        [0,-1],          [0,1],
        [1,-1],  [1,0],   [1,1]
    ];

    for (const [dr, dc] of directions) {
        const tr = r + dr;
        const tc = c + dc;
        if (tr >= 0 && tr < gameState.boardSize && tc >= 0 && tc < gameState.boardSize) {
            if (!isPassableSquare(tr, tc)) continue;
            if (!isTowerGateMove([r, c], [tr, tc])) continue;
            const targetPiece = getVisiblePiece(tr, tc, activePlayerId);
            if (!canUnitsEnterSquare(getPieceContents(piece), [tr, tc], activePlayerId)) continue;
            if (targetPiece && targetPiece.player !== activePlayerId &&
                isTowerPiece(targetPiece) &&
                !getCombatContents(piece).some(unit => getUnitType(unit) === 'p')) {
                continue;
            }

            if (targetPiece && targetPiece.player === activePlayerId) {
                const targetIsMovingAway = currentPlans.some(p => !p.prisonerAction && p.from[0] === tr && p.from[1] === tc);
                if (!targetIsMovingAway || targetPiece.type === 'r') {
                    moves.push([tr, tc]);
                    continue;
                }
            }
            moves.push([tr, tc]);
        }
    }
    return moves;
}

function rejectPrisonerMoveConflicts(moves) {
    let changed;
    do {
        changed = false;
        const active = moves.filter(move => !move.invalid && !move.siegeCancel && !move.sallyOut);
        const prisoners = active.filter(move => move.contents.every(isPrisoner));
        const reject = new Set();
        prisoners.forEach(move => {
            const target = getPiecesAt(...move.to).find(piece => !arePlayersFriendly(piece.player, move.player));
            const movingTarget = target && active.some(other => !other.isUnmerge && other.pieceId === target.id);
            const swaps = prisoners.filter(other => other !== move && !arePlayersFriendly(other.player, move.player) &&
                other.to[0] === move.from[0] && other.to[1] === move.from[1] &&
                move.to[0] === other.from[0] && move.to[1] === other.from[1]);
            swaps.forEach(other => { reject.add(move); reject.add(other); });
            const opponents = prisoners.filter(other => other !== move && !arePlayersFriendly(other.player, move.player) &&
                other.to[0] === move.to[0] && other.to[1] === move.to[1]);
            const combatArrival = active.some(other => other.to[0] === move.to[0] &&
                other.to[1] === move.to[1] && other.contents.some(unit => !isPrisoner(unit)));
            const stationaryCombat = target && !movingTarget && !isPrisonerOnly(target);
            if (!combatArrival && !stationaryCombat && (opponents.length ||
                target && !movingTarget && target.player !== move.player && isPrisonerOnly(target))) {
                reject.add(move);
                opponents.forEach(other => reject.add(other));
            }
        });
        reject.forEach(move => {
            move.invalid = true;
            changed = true;
            logAction(`Prisoner move by P${move.player} cancelled: prisoners cannot fight each other.`);
        });
    } while (changed);
}
