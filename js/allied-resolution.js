function addSharedSquareConflicts(groups, moves) {
    gameState.board.forEach((row, r) => row.forEach((square, c) => {
        const remaining = getSquarePieces(square).filter(piece => !moves.some(move =>
            !move.invalid && !move.isUnmerge && !move.siegeStart && !move.sallyOut && !move.siegeCancel &&
            move.pieceId === piece.id));
        if (!remaining.some((piece, index) => remaining.slice(index + 1).some(other =>
            !arePlayersFriendly(piece.player, other.player))) ||
            groups.some(group => group.type === 'TARGET' &&
                group.targetSquare[0] === r && group.targetSquare[1] === c)) return;
        groups.push({
            type: 'TARGET', targetSquare: [r, c], squareNotations: [coordsToNotation(r, c)],
            candidates: remaining.map(piece => ({
                player: piece.player, pieceId: piece.id, pieceType: piece.type,
                from: [r, c], to: [r, c], contents: getPieceContents(piece), isStationary: true
            }))
        });
    }));
}

function isAlliedCastleGroup(group) {
    return group.type === 'TARGET' &&
        group.candidates.some(candidate => getPieceContents(candidate).some(unit => getUnitType(unit) === 'r')) &&
        group.candidates.some((candidate, index) => group.candidates.slice(index + 1).some(other =>
            arePlayersAllied(candidate.player, other.player)));
}

async function resolveRemainingSharedConflicts() {
    while (true) {
        const groups = [];
        addSharedSquareConflicts(groups, []);
        const fighting = groups.filter(group => getAlliedBattleSides(group.candidates));
        if (!fighting.length) return;
        for (const group of fighting) await processCollisionGroup(group);
    }
}

function getAlliedBattleSides(armies) {
    let first;
    let second;
    for (const army of armies) {
        const enemy = armies.find(other => !arePlayersFriendly(army.player, other.player) &&
            (getCombatContents(army).length || getCombatContents(other).length));
        if (enemy) {
            first = army;
            second = enemy;
            break;
        }
    }
    if (!first) return null;
    const sides = [[first], [second]];
    armies.filter(army => army !== first && army !== second).forEach(army => {
        const side = sides.findIndex((members, index) =>
            members.every(member => arePlayersFriendly(member.player, army.player)) &&
            sides[1 - index].every(enemy => !arePlayersFriendly(enemy.player, army.player)));
        if (side >= 0) sides[side].push(army);
    });
    return sides;
}

function makeAlliedBattleCandidate(members) {
    const data = getBattleCandidateData({ candidates: members });
    const leader = [...data].sort((a, b) => b.rawWeight - a.rawWeight ||
        a.candidate.player - b.candidate.player)[0].candidate;
    return {
        ...leader,
        members,
        contents: members.flatMap(member => getPieceContents(member)),
        terrainBonus: Math.max(...members.map(member => member.terrainBonus || 0))
    };
}

function fightAlliedSides(sides, square) {
    if (typeof cancelBattleMovementPaths === 'function') cancelBattleMovementPaths(sides.flat());
    if (typeof recordMissionBattle === 'function') recordMissionBattle(sides.flat());
    const group = {
        type: 'TARGET', targetSquare: square, squareNotations: [coordsToNotation(...square)],
        candidates: sides.map(makeAlliedBattleCandidate)
    };
    const data = getBattleCandidateData(group);
    const captureOnly = data.filter(entry => entry.combatContents.length).length === 1;
    return new Promise(resolve => {
        clashOverlay.classList.remove('hidden');
        setBattleTarget(group);
        renderBattleCandidates(group);
        battleRollsEl.innerHTML = '';
        clashResult.innerText = 'Ready';
        btnProceedBattle.disabled = false;
        btnStartBattle.classList.remove('hidden');
        btnProceedBattle.classList.add('hidden');
        btnStartBattle.onclick = () => {
            btnStartBattle.onclick = null;
            btnStartBattle.classList.add('hidden');
            const roll = captureOnly ? 0 : Math.random();
            const winner = data[0].probability > roll ? 0 : 1;
            const results = new Map();
            const rolls = [`Allied battle winner roll: ${(roll * 100).toFixed(2)}%`];
            data.forEach((entry, index) => results.set(entry.candidate.pieceId,
                captureOnly && index === winner ? {
                    survivors: entry.contents, casualties: [], captured: []
                } : resolveCandidateCasualties(entry.candidate, entry.probability, index !== winner,
                    data.some(other => other.contents.some(unit => getUnitType(unit) === 'r')), rolls)));
            renderBattleCandidates(group, results, new Set(
                results.get(group.candidates[1 - winner].pieceId).survivors.map(unit => unit.id)));
            renderBattleRolls(rolls);
            clashResult.innerText = `${sides[winner].map(army => getPlayerInfo(army.player).name).join(' & ')} win`;
            clashResult.style.color = getPlayerInfo(group.candidates[winner].player).color;
            const winningPlayers = sides[winner].map(army => army.player);
            const winningUnits = sides[winner].flatMap(army =>
                getPieceContents(army).map(unit => ({
                    unit, piece: { player: army.player },
                    row: army.from?.[0] ?? square[0],
                    column: army.from?.[1] ?? square[1]
                })));
            results.forEach(result => result.casualties.forEach(unit =>
                transferStoredUnitResources(winningPlayers, unit, winningUnits)));
            recordDeadPieces(gameState, [...results.values()].flatMap(result => result.casualties));
            logAction(`Allied battle: ${sides[winner].map(army => `P${army.player}`).join(' & ')} won.`);
            btnProceedBattle.classList.remove('hidden');
            btnProceedBattle.onclick = () => {
                btnProceedBattle.onclick = null;
                clashOverlay.classList.add('hidden');
                clearBattleTarget();
                resolve({
                    winners: sides[winner], losers: sides[1 - winner],
                    winnerResult: results.get(group.candidates[winner].pieceId),
                    loserResult: results.get(group.candidates[1 - winner].pieceId),
                    leader: group.candidates[winner].player
                });
            };
        };
        if (captureOnly) btnStartBattle.onclick();
    });
}

let finishAlliedSpoils = null;
let spoilsHotseatPlayer = null;
let spoilsHotseatReady = false;

function chooseAlliedSpoils(participants, kind) {
    if (participants.length === 1) return Promise.resolve({ owner: participants[0] });
    return new Promise(resolve => {
        finishAlliedSpoils = resolve;
        spoilsHotseatPlayer = participants[0];
        spoilsHotseatReady = false;
        gameState.pendingSpoils = {
            id: `spoils_${gameState.round}_${Date.now()}_${Math.random()}`,
            participants, kind, choices: {}
        };
        renderAlliedSpoils();
        if (gameState.multiplayer) Multiplayer.syncAlliedState();
    });
}

function decideAlliedSpoils(player, id, action, target) {
    const pending = gameState.pendingSpoils;
    if (gameState.phase !== 'RESOLVING' || !pending || pending.id !== id ||
        !pending.participants.includes(player)) return false;
    let result = null;
    if (action === 'choose' && pending.participants.includes(target)) {
        pending.choices[player] = target;
        if (pending.participants.every(member => pending.choices[member] === target)) result = { owner: target };
    } else if (action === 'retry') {
        delete pending.choices[player];
    } else if (action === 'war' && pending.participants.includes(target) && arePlayersAllied(player, target) &&
        pending.participants.every(member => pending.choices[member]) &&
        new Set(Object.values(pending.choices)).size > 1) {
        const pair = getDiplomacyPair(player - 1, target - 1);
        pair.status = 'war';
        pair.requestedBy = null;
        pair.changedRound = gameState.round;
        logAction(`P${player} declared war on P${target} over allied spoils. Fighting resumes immediately.`);
        result = { war: true };
    } else {
        return false;
    }
    if (result) {
        gameState.pendingSpoils = null;
        const finish = finishAlliedSpoils;
        finishAlliedSpoils = null;
        renderAlliedSpoils();
        if (finish) finish(result);
    } else if (!gameState.multiplayer) {
        spoilsHotseatPlayer = pending.participants.find(member => !pending.choices[member]) ||
            pending.participants.find(member => member !== player);
        spoilsHotseatReady = false;
    }
    return true;
}

function renderAlliedSpoils() {
    const modal = document.getElementById('allied-spoils-modal');
    const pending = gameState.pendingSpoils;
    modal.classList.toggle('hidden', !pending);
    if (!pending) return;
    const player = gameState.multiplayer ? gameState.turnIndex + 1 : spoilsHotseatPlayer;
    document.getElementById('allied-spoils-title').innerText = pending.kind === 'castle'
        ? 'Agree on the castle owner' : 'Agree who handles prisoners';
    const status = document.getElementById('allied-spoils-status');
    const options = document.getElementById('allied-spoils-options');
    options.innerHTML = '';
    const disagreement = pending.participants.every(member => pending.choices[member]) &&
        new Set(Object.values(pending.choices)).size > 1;
    status.innerText = (disagreement ? 'No agreement. Re-decide or declare war to settle this by battle. ' :
        'Resolution waits for unanimous agreement. ') +
        pending.participants.map(member => `${getPlayerInfo(member).name}: ${
            pending.choices[member] ? getPlayerInfo(pending.choices[member]).name : 'undecided'}`).join(' | ');
    if (!pending.participants.includes(player)) return;
    const addButton = (text, action, target = null) => {
        const button = document.createElement('button');
        button.className = 'btn btn-secondary';
        button.innerText = text;
        button.addEventListener('click', () => {
            if (action === 'ready') {
                spoilsHotseatReady = true;
            } else if (gameState.multiplayer && !Multiplayer.isHost()) {
                Multiplayer.requestAlliedSpoils(pending.id, action, target);
                return;
            } else if (!decideAlliedSpoils(player, pending.id, action, target)) {
                status.innerText = 'Decision rejected: the participants or battle have changed.';
                return;
            }
            renderAlliedSpoils();
            if (gameState.multiplayer) Multiplayer.syncAlliedState();
        });
        options.appendChild(button);
    };
    if (!gameState.multiplayer && !spoilsHotseatReady) {
        status.innerText = `Pass device to ${getPlayerInfo(player).name} to decide.`;
        addButton('I Am Ready', 'ready');
        return;
    }
    pending.participants.forEach(member => addButton(`Choose ${getPlayerInfo(member).name}`, 'choose', member));
    if (pending.choices[player]) addButton('Re-decide', 'retry');
    if (disagreement) pending.participants.filter(member => member !== player && arePlayersAllied(player, member))
        .forEach(member => addButton(`Declare War on ${getPlayerInfo(member).name}`, 'war', member));
}

async function returnAlliedArmy(army, battleSquare, allowBattleSquare = false) {
    const placed = [];
    const assigned = new Set((army.origins || []).flatMap(origin => origin.ids));
    const extras = army.contents.filter(unit => !assigned.has(unit.id));
    if (extras.length && army.origins?.length) army.origins[0].ids.push(...extras.map(unit => unit.id));
    for (const origin of army.origins || []) {
        const contents = army.contents.filter(unit => origin.ids.includes(unit.id));
        if (!contents.length) continue;
        const square = origin.square;
        if ((!allowBattleSquare && square[0] === battleSquare[0] && square[1] === battleSquare[1]) ||
            getPiecesAt(...square).some(other => other.player !== army.player && isTowerPiece(other))) {
            queueRetreat(army.player, contents, battleSquare);
        } else if (getPiecesAt(...square).some(other => !arePlayersFriendly(other.player, army.player))) {
            logAction(`P${army.player} fights for its original siege square.`);
            await processCollisionGroup({
                type: 'TARGET', targetSquare: square, squareNotations: [coordsToNotation(...square)],
                candidates: [{
                    ...army, contents, from: square, to: square, isUnmerge: true, isStationary: false
                }, ...getPiecesAt(...square).map(piece => ({
                    player: piece.player, pieceId: piece.id, pieceType: piece.type, contents: getPieceContents(piece),
                    from: square, to: square, isStationary: true
                }))]
            });
            if (getPieceAt(...square, army.player)) placed.push(square);
        } else {
            const existing = getPieceAt(...square, army.player);
            const combined = [...(existing ? getPieceContents(existing) : []), ...contents];
            putPieceAt(...square, {
                id: existing?.id || `${army.pieceId}::return::${square.join('_')}`,
                player: army.player, type: getMergedPieceType(combined), contents: combined
            });
            placed.push(square);
        }
    }
    return placed;
}

async function resolveAlliedEncounter(group) {
    const square = group.targetSquare;
    let armies = group.candidates;
    const prisoners = [];
    const towers = [];
    const recruits = [];
    const victors = new Set();
    let castleOwner = null;
    let prisonerOwner = null;
    while (true) {
        let sides;
        while ((sides = getAlliedBattleSides(armies))) {
            const battle = await fightAlliedSides(sides, square);
            const losingIds = new Set(battle.losers.map(army => army.player));
            const winningIds = new Set(battle.winners.map(army => army.player));
            battle.winners.forEach(army => victors.add(army.player));
            battle.losers.forEach(army => victors.delete(army.player));
            armies = armies.filter(army => !losingIds.has(army.player));
            armies.forEach(army => {
                if (winningIds.has(army.player)) {
                    army.contents = battle.winnerResult.survivors.filter(unit => unit.player === army.player);
                    army.pieceType = getMergedPieceType(army.contents);
                }
            });
            battle.losers.forEach(army => {
                const survivors = battle.loserResult.survivors.filter(unit => unit.player === army.player);
                towers.push(...survivors.filter(unit => getUnitType(unit) === 'r'));
                const retreating = survivors.filter(unit => getUnitType(unit) !== 'r');
                if (army.isSallyDefender) {
                    const tower = getPieceAt(...square, army.player);
                    tower.contents.push(...retreating);
                } else if (army.player === REBEL_PLAYER_ID) recruits.push(...retreating);
                else queueRetreat(army.player, retreating, square);
            });
            prisoners.push(...battle.loserResult.captured.filter(unit =>
                unit.player !== REBEL_PLAYER_ID || isPrisoner(unit)));
            recruits.push(...battle.loserResult.captured.filter(unit =>
                unit.player === REBEL_PLAYER_ID && !isPrisoner(unit)));
            castleOwner = null;
            prisonerOwner = null;
        }
        const participants = armies.filter(army => victors.has(army.player)).map(army => army.player);
        if (towers.length) {
            const decision = await chooseAlliedSpoils(participants, 'castle');
            if (decision.war) continue;
            castleOwner = decision.owner;
        }
        if (prisoners.length) {
            const decision = await chooseAlliedSpoils(participants, 'prisoners');
            if (decision.war) continue;
            prisonerOwner = decision.owner;
        }
        break;
    }
    const leader = castleOwner || prisonerOwner ||
        makeAlliedBattleCandidate(armies.filter(army => !victors.size || victors.has(army.player))).player;
    const leaderArmy = armies.find(army => army.player === leader);
    leaderArmy.contents.push(...recruits.map(unit => ({
        ...unit, player: leader, id: `${unit.id}::recruited::${gameState.round}`,
        name: getNextUnitName(leader, getUnitType(unit))
    })));
    if (castleOwner) {
        armies.find(army => army.player === castleOwner).contents.push(...towers.map(unit => ({
            ...unit, player: castleOwner, id: `${unit.id}::conquered::${gameState.round}`,
            name: getNextUnitName(castleOwner, 'r')
        })));
    }
    if (prisoners.length) {
        const recipient = armies.find(army => army.player === prisonerOwner);
        beginCaptureChoices(prisonerOwner, prisoners, square, recipient);
        renderCaptureChoices();
        renderBoard();
        if (gameState.pendingCapture) await new Promise(resolve => {
            clashOverlay.classList.remove('hidden');
            btnStartBattle.classList.add('hidden');
            btnProceedBattle.classList.remove('hidden');
            btnProceedBattle.onclick = () => {
                if (gameState.pendingCapture) return;
                btnProceedBattle.onclick = null;
                clashOverlay.classList.add('hidden');
                resolve();
            };
        });
    }
    for (const army of armies) {
        if (group.stayAtOrigins || (castleOwner && army.player !== castleOwner)) {
            await returnAlliedArmy(army, square, group.stayAtOrigins);
        } else if (army.contents.length) {
            putPieceAt(...square, {
                id: army.pieceId, player: army.player,
                type: getMergedPieceType(army.contents), contents: army.contents
            });
        }
    }
    syncSieges();
    renderBoard();
}

async function resolveAlliedSally(group) {
    const byPlayer = new Map();
    group.candidates.forEach(candidate => {
        const source = getPieceByIdAt(...candidate.from, candidate.pieceId);
        if (!source) return;
        if (candidate.isSallyDefender) {
            source.contents = getPieceContents(source).filter(unit => getUnitType(unit) === 'r');
        } else removePieceAt(...candidate.from, candidate.pieceId);
        const entry = byPlayer.get(candidate.player);
        const origin = { square: candidate.from, ids: candidate.contents.map(unit => unit.id) };
        if (entry) {
            entry.contents.push(...candidate.contents);
            entry.origins.push(origin);
        } else byPlayer.set(candidate.player, { ...candidate, origins: [origin] });
    });
    await resolveAlliedEncounter({ ...group, stayAtOrigins: true, candidates: [...byPlayer.values()] });
}
