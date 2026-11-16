function getAdjacentMoves(r, c) {
    const directions = [
        [-1,-1], [-1,0], [-1,1],
        [0,-1],          [0,1],
        [1,-1],  [1,0],   [1,1]
    ];
    return directions
        .map(([dr, dc]) => [r + dr, c + dc])
        .filter(([tr, tc]) => tr >= 0 && tr < 16 && tc >= 0 && tc < 16);
}

function isPawnRestTurn() {
    return gameState.round % 2 === 0;
}

function pieceContainsPawn(piece) {
    return getPieceContents(piece).some(unit => getUnitType(unit) === 'p');
}

function canMoveWholePiece(piece, plans = gameState.plans[piece.player - 1]) {
    const contents = getPlannedPieceContents(piece, plans);
    return contents.length > 0 && (!isPawnRestTurn() ||
        !contents.some(unit => getUnitType(unit) === 'p' || isPrisoner(unit)));
}

function canMoveHeldUnit(unit, plans = gameState.plans.flat()) {
    return !plans.some(plan => plan.prisonerAction && plan.unitId === unit.id) &&
        (!isPawnRestTurn() || (getUnitType(unit) !== 'p' && !isPrisoner(unit)));
}

function canUnitsTarget(contents, target, player) {
    return !target || target.player === player || contents.some(unit => !isPrisoner(unit));
}

// Universal 1-Square Movement Rule in all 8 directions
function getValidMovesForPiece(r, c) {
    const piece = gameState.board[r][c];
    if (!piece || isEliminatedPiece(piece) || gameState.lockedPieceIds.has(piece.id)) return [];
    if (getSiegeAtSquare([r, c])) return [];

    const attackerSiege = getSiegeForAttacker(piece.id);
    if (attackerSiege) {
        return getReadySiegeAssault(piece, [r, c], attackerSiege.towerSquare)
            ? [attackerSiege.towerSquare]
            : [];
    }
    if (!canMoveWholePiece(piece)) return [];
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
        if (tr >= 0 && tr < 16 && tc >= 0 && tc < 16) {
            if (!isTowerGateMove([r, c], [tr, tc])) continue;
            const targetPiece = gameState.board[tr][tc];
            if (!canUnitsTarget(getPieceContents(piece), targetPiece, activePlayerId)) continue;
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
            const target = gameState.board[move.to[0]][move.to[1]];
            const movingTarget = target && active.some(other => !other.isUnmerge && other.pieceId === target.id);
            const swaps = prisoners.filter(other => other !== move && other.player !== move.player &&
                other.to[0] === move.from[0] && other.to[1] === move.from[1] &&
                move.to[0] === other.from[0] && move.to[1] === other.from[1]);
            swaps.forEach(other => { reject.add(move); reject.add(other); });
            const opponents = prisoners.filter(other => other !== move && other.player !== move.player &&
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
