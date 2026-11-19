const PLAYER_ICONS = ['🔴', '🔵', '🟢', '🟡'];

function renderRetreatTable() {
    gameState.retreating.forEach((entries, index) => {
        const player = PLAYERS[index];
        const text = entries.length
            ? entries.map(entry => `
                <div class="retreat-entry">
                    <span class="retreat-units">${entry.contents.map(unit =>
                        `<span class="retreat-unit ${player.class}" title="${escapeHtml(`${getUnitName(unit)}${getRoutedStacks(unit) ? ` · ${getRoutedStats(unit, entry.reentryRound)} after return` : ''}`)}">${PIECE_SVGS[getUnitType(unit)]}<span class="retreat-timer">(${Math.max(entry.reentryRound - gameState.round, 0)})</span></span>`
                    ).join('')}</span>
                </div>
            `).join('')
            : '<span class="retreat-empty">—</span>';
        document.getElementById(`retreat-p${player.id}`).innerHTML =
            `<span class="retreat-flag" aria-hidden="true">⚑</span><span class="retreat-entries">${text}</span>`;
    });
    renderDeadPieces();
}

function renderDeadPieces() {
    gameState.deadPieces.forEach((units, index) => {
        const player = PLAYERS[index];
        const text = units.length
            ? units.map(unit =>
                `<span class="dead-unit ${player.class}" title="${escapeHtml(getUnitName(unit))}">${PIECE_SVGS[getUnitType(unit)]}</span>`
            ).join('')
            : '<span class="retreat-empty">—</span>';
        document.getElementById(`dead-p${player.id}`).innerHTML =
            `<span class="dead-flag" aria-hidden="true">💀</span><span class="dead-units">${text}</span>`;
    });
}

function showPrivacyOverlay() {
    gameState.phase = 'TRANSITION';
    gameState.lockedPieceIds = new Set();
    gameState.pendingMerge = null;
    gameState.selectedHeldPiece = null;
    gameState.pendingTransfer = null;
    mergePrompt.classList.add('hidden');
    pieceTooltip.classList.add('hidden');
    const player = PLAYERS[gameState.turnIndex];
    privacyIcon.innerText = '🛡️';
    privacyIcon.style.background = player.color;
    privacyTitle.innerText = `Pass Device to ${player.name} (Player ${player.id})`;
    privacyDesc.innerText = `Previous player locked in their plans. Please hand the device to ${player.name}.`;
    updatePlayerCards();
    renderBoard();
    privacyOverlay.classList.remove('hidden');
}

function updateRoundDisplay() {
    roundTagEl.innerText = `Round ${gameState.round}`;
    const completedRounds = gameState.round - 1;
    const interval = RESOURCE_PURCHASE_INTERVAL;
    const cycleProgress = completedRounds % interval;
    const clock = document.getElementById('round-clock');
    const productionInterval = getResourceProductionInterval();
    const roundsUntilProduction = productionInterval - completedRounds % productionInterval;
    const roundLabel = roundsUntilProduction === 1 ? 'round' : 'rounds';
    const description = `Round clock: ${cycleProgress} of ${interval} rounds completed; purchases on rounds 4, 8, 12, etc.; resource production in ${roundsUntilProduction} ${roundLabel}`;
    document.getElementById('round-clock-hand').style.transform =
        `rotate(${completedRounds * 360 / interval}deg)`;
    document.getElementById('round-clock-status').innerText = `${cycleProgress} / ${interval}`;
    clock.setAttribute('aria-label', description);
    clock.title = description;
    renderObjectives();
}

function renderObjectives() {
    const panel = document.getElementById('objectives-panel');
    const visible = gameState.multiplayer || gameState.phase === 'PLANNING';
    panel.classList.toggle('hidden', !visible);
    const rows = document.getElementById('objectives-list');
    rows.innerHTML = '';
    document.getElementById('objectives-score').innerText = '';
    if (!visible) return;
    const index = gameState.turnIndex;
    document.getElementById('objectives-title').innerText = `${PLAYERS[index].name} objectives`;
    document.getElementById('objectives-score').innerText = `${gameState.scores[index]} pts | Win: 20 | Defeat: -20`;
    rows.innerHTML = gameState.objectives[index].map(objective => `
        <li class="objective-item${objective.completed ? ' objective-completed' : ''}">
            <input type="checkbox" disabled ${objective.completed ? 'checked' : ''} aria-label="${escapeHtml(getObjectiveLabel(objective))}">
            <span class="${objective.points < 0 ? 'objective-penalty' : 'objective-reward'}">${objective.points > 0 ? '+' : ''}${objective.points}</span>
            <span class="objective-label">${escapeHtml(getObjectiveLabel(objective))}</span>
        </li>
    `).join('');
    const batch = gameState.missionBatches?.[index];
    if (batch) {
        rows.innerHTML += `<li class="mission-heading">Missions · through round ${batch.expiresRound} · permanent ${gameState.missionPoints[index] >= 0 ? '+' : ''}${gameState.missionPoints[index]} pts · −2 if none succeed</li>` +
            batch.missions.map((mission, missionIndex) => {
                const label = getMissionLabel(mission);
                return `<li class="objective-item mission-item${mission.status === 'completed' ? ' objective-completed' : ''}">
                    <span class="objective-reward">+${mission.points}</span>
                    <span class="objective-label">${escapeHtml(label)} · ${escapeHtml(mission.status)}</span>
                    <button type="button" class="mission-locate" data-mission-index="${missionIndex}" aria-label="Locate ${escapeHtml(label)}" title="Highlight target squares without changing visibility">🔍</button>
                </li>`;
            }).join('');
    }
}

document.getElementById('objectives-list').addEventListener('click', event => {
    const button = event.target.closest('.mission-locate');
    if (!button) return;
    const batch = gameState.missionBatches?.[gameState.turnIndex];
    const mission = batch?.missions[Number(button.dataset.missionIndex)];
    if (!mission || !['PLANNING', 'COMMITTED'].includes(gameState.phase)) return;
    const targets = getMissionTargetSquares(mission, gameState.turnIndex + 1);
    Array.from(boardEl.children).forEach(square => square.classList.remove('sq-mission-target'));
    targets.forEach(([r, c]) => boardEl.children[r * gameState.boardSize + c]?.classList.add('sq-mission-target'));
    button.title = targets.length ? 'Target highlighted without changing visibility' : 'Target is not currently on the board';
});

function updatePlayerCards() {
    const tradeModal = document.getElementById('resource-trade-modal');
    if (!tradeModal.classList.contains('hidden') &&
        (gameState.phase !== 'PLANNING' || gameState.eliminated[gameState.turnIndex] ||
            (gameState.multiplayer && gameState.committed[gameState.turnIndex]))) {
        tradeModal.classList.add('hidden');
    }
    for (let i = 0; i < 4; i++) {
        const card = document.getElementById(`card-p${i + 1}`);
        const badge = document.getElementById(`badge-p${i + 1}`);
        const hordeBadge = document.getElementById(`horde-p${i + 1}`);
        card.querySelector('.player-name').innerText =
            `${PLAYER_ICONS[i]} ${PLAYERS[i].name} (Player ${PLAYERS[i].id})`;
        hordeBadge.classList.toggle('hidden',
            !gameState.activePlayers[i] || !gameState.horde[i]);

        if (gameState.eliminated[i]) {
            card.className = `player-card player-p${i + 1} eliminated`;
            badge.innerText = 'ELIMINATED';
            badge.style.background = 'rgba(148, 163, 184, 0.2)';
            badge.style.color = '#94a3b8';
        } else if (gameState.multiplayer) {
            const info = Multiplayer.getBadge(i);
            card.className = `player-card player-p${i + 1}${i === gameState.turnIndex ? ' active-turn' : ''}`;
            badge.innerText = info.text;
            badge.style.background = info.ready ? `${PLAYERS[i].color}33` : 'rgba(255,255,255,0.05)';
            badge.style.color = info.ready ? PLAYERS[i].color : 'var(--text-muted)';
        } else if (i === gameState.turnIndex && gameState.phase === 'PLANNING') {
            card.className = `player-card player-p${i + 1} active-turn`;
            badge.innerText = 'Planning';
            badge.style.background = `${PLAYERS[i].color}33`;
            badge.style.color = PLAYERS[i].color;
        } else {
            card.className = `player-card player-p${i + 1}`;
            badge.innerText = 'Hidden';
            badge.style.background = 'rgba(255,255,255,0.05)';
            badge.style.color = 'var(--text-muted)';
        }
        const resources = document.getElementById(`resources-p${i + 1}`);
        const resourcePhaseVisible = gameState.multiplayer || gameState.phase === 'PLANNING';
        const currentPlayerCanManage = i === gameState.turnIndex && gameState.activePlayers[i] &&
            resourcePhaseVisible;
        const resourcesVisible = gameState.activePlayers[i] && resourcePhaseVisible &&
            (i === gameState.turnIndex || gameState.showResourcesToOthers);
        resources.classList.toggle('hidden', !resourcesVisible);
        resources.innerHTML = resourcesVisible ? RESOURCE_TYPES.map(resource =>
            `<span class="resource-stock" title="${resource.label}" aria-label="${resource.label}: ${gameState.resources[i][resource.key]}"><span aria-hidden="true">${resource.icon}</span><span>${gameState.resources[i][resource.key]}</span></span>`
        ).join('') : '';
        const purchases = document.getElementById(`resource-purchases-p${i + 1}`);
        const showShop = currentPlayerCanManage && !gameState.eliminated[i] &&
            ['PLANNING', 'COMMITTED'].includes(gameState.phase);
        purchases.classList.toggle('hidden', !showShop);
        if (!showShop) purchases.open = false;
        document.getElementById(`resource-purchase-options-p${i + 1}`).innerHTML =
            showShop ? renderResourcePurchaseOptions(i + 1) : '';
        renderPlayerDiplomacy(i);
    }

    const p = PLAYERS[gameState.turnIndex];
    activePlayerNameEl.innerText = gameState.multiplayer
        ? `You are ${p.name} (Player ${p.id})`
        : `${p.name} (Player ${p.id}) Turn`;
    activePlayerNameEl.style.color = p.color;
    if (gameState.multiplayer) Multiplayer.refreshControls();
    updateRoundDisplay();
}

function diplomacyBall(index) {
    return `<span class="diplomacy-ball" style="background:${PLAYERS[index].color}" title="${escapeHtml(PLAYERS[index].name)}" role="img" aria-label="${escapeHtml(PLAYERS[index].name)}"></span>`;
}

function diplomacyIcon(status) {
    return `<span class="diplomacy-icon${status === 'allied' ? ' diplomacy-handshake' : ''}" aria-hidden="true">${status === 'allied' ? '🤝' : '⚔️'}</span>`;
}

function diplomacyButton(target, action, icon, label, disabled = false) {
    return `<button type="button" class="diplomacy-button" data-target="${target}" data-diplomacy-action="${action}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"${disabled ? ' disabled' : ''}>${icon}</button>`;
}

function allianceReplyButtons(sender) {
    return diplomacyButton(sender, 'accept', '✓', `Accept alliance with ${PLAYERS[sender].name}`) +
        diplomacyButton(sender, 'decline', '✕', `Decline alliance with ${PLAYERS[sender].name}`);
}

function resourceTradeButton(target, action, label, id = null, disabled = false) {
    return `<button type="button" class="diplomacy-button" data-target="${target}" data-trade-action="${action}"${id === null ? '' : ` data-trade-id="${id}"`}${disabled ? ' disabled' : ''}>${label}</button>`;
}

function formatResourceTradeAmounts(amounts) {
    const nonzero = Object.fromEntries(Object.entries(amounts).filter(([, amount]) => amount > 0));
    return Object.keys(nonzero).length ? formatResourceCost(nonzero) : 'Nothing';
}

function renderResourceTrade(trade, viewer, review = false) {
    const incoming = trade.to === viewer;
    const summary = `<span>${incoming ? 'They give' : 'You give'}: ${formatResourceTradeAmounts(trade.give)}; ${incoming ? 'you give' : 'they give'}: ${formatResourceTradeAmounts(trade.receive)}</span>`;
    const buttons = incoming
        ? resourceTradeButton(trade.from, 'accept', 'Accept exchange', trade.id) +
            resourceTradeButton(trade.from, 'decline', 'Decline exchange', trade.id)
        : resourceTradeButton(trade.to, 'cancel', 'Cancel exchange', trade.id,
            gameState.multiplayer && (gameState.committed[viewer] || Multiplayer.isPendingCommit()));
    return `<div class="resource-trade-request">${incoming ? '<span class="diplomacy-request-alert" role="status">Exchange request!</span>' : '<span>Exchange pending</span>'}${summary}${incoming && !gameState.multiplayer && !review ? '' : buttons}</div>`;
}

function showResourceTradeProposal(target) {
    if (gameState.phase !== 'PLANNING' ||
        (gameState.multiplayer && (gameState.committed[gameState.turnIndex] || Multiplayer.isPendingCommit()))) return;
    document.getElementById('resource-trade-target').value = String(target);
    document.getElementById('resource-trade-title').innerText = `Resource exchange with ${PLAYERS[target].name}`;
    document.getElementById('resource-trade-error').innerText = '';
    document.getElementById('resource-trade-amounts').innerHTML = RESOURCE_TYPES.map(({ key, label, icon }) =>
        `<tr><th scope="row">${icon} ${escapeHtml(label)}</th><td><input type="number" name="give-${key}" aria-label="You give ${escapeHtml(label)}" min="0" step="1" value="0" required></td><td><input type="number" name="receive-${key}" aria-label="You request ${escapeHtml(label)}" min="0" step="1" value="0" required></td></tr>`
    ).join('');
    document.getElementById('resource-trade-modal').classList.remove('hidden');
}

function renderPlayerDiplomacy(index) {
    const panel = document.getElementById(`diplomacy-p${index + 1}`);
    const actions = document.getElementById(`diplomacy-actions-p${index + 1}`);
    const card = document.getElementById(`card-p${index + 1}`);
    card.classList.remove('diplomacy-incoming');
    panel.innerHTML = '';
    actions.innerHTML = '';
    if (!gameState.activePlayers[index] || gameState.eliminated[index]) return;
    const opponents = [0, 1, 2, 3].filter(other => other !== index &&
        gameState.activePlayers[other] && !gameState.eliminated[other]);
    panel.innerHTML = ['allied', 'war'].map(status => {
        const others = opponents.filter(other => getDiplomacyPair(index, other).status === status);
        if (!others.length) return '';
        const label = status === 'allied' ? 'Allied with' : 'At war with';
        return `<span class="diplomacy-group" role="group" aria-label="${label}">${diplomacyIcon(status)}${others.map(diplomacyBall).join('')}</span>`;
    }).filter(Boolean).join('<span class="diplomacy-separator" aria-hidden="true">|</span>');
    const me = gameState.turnIndex;
    const planning = gameState.multiplayer ? ['PLANNING', 'COMMITTED'].includes(gameState.phase) :
        gameState.phase === 'PLANNING';
    if (!planning || !opponents.includes(me)) return;
    const pair = getDiplomacyPair(me, index);
    const trade = getPendingResourceTrades().find(entry =>
        (entry.from === me && entry.to === index) || (entry.from === index && entry.to === me));
    const tradeButton = resourceTradeButton(index, 'propose', '<span aria-hidden="true">⇄</span> Exchange resources',
        null, Boolean(trade) || (gameState.multiplayer &&
            (gameState.committed[me] || Multiplayer.isPendingCommit())));
    if (pair.requestedBy !== null) {
        actions.innerHTML = `<span class="diplomacy-pending" title="Alliance request pending" aria-label="Alliance request pending">${diplomacyIcon('allied')}…</span>`;
        if (gameState.multiplayer && pair.requestedBy === index) {
            card.classList.add('diplomacy-incoming');
            actions.innerHTML = `<span class="diplomacy-request-alert" role="status">Alliance request!</span>` +
                actions.innerHTML + allianceReplyButtons(index);
        }
        actions.innerHTML += tradeButton;
    } else {
        const allied = pair.status === 'allied';
        const roundLocked = pair.changedRound === gameState.round;
        const locked = roundLocked ||
            (gameState.multiplayer && (gameState.committed[me] || Multiplayer.isPendingCommit()));
        const reason = roundLocked ? 'Relationship locked until next round' :
            locked ? 'Unlock your plan before initiating diplomacy' :
                '';
        const war = diplomacyButton(index, 'war', `${diplomacyIcon('war')} Declare War`,
            reason || (allied ? `Declare war on ${PLAYERS[index].name}` : 'Already at war'), locked || !allied);
        const request = diplomacyButton(index, 'request', `${diplomacyIcon('allied')} Request Allegiance`,
            reason || (allied ? 'Already allied' : `Request alliance with ${PLAYERS[index].name}`), locked || allied);
        actions.innerHTML = `<details class="diplomacy-menu"><summary class="diplomacy-button" title="Diplomacy with ${escapeHtml(PLAYERS[index].name)}" aria-label="Diplomacy with ${escapeHtml(PLAYERS[index].name)}">${diplomacyIcon(pair.status)}</summary><div class="diplomacy-popup">${war}${request}${tradeButton}${reason ? `<span class="diplomacy-lock-reason">${reason}</span>` : ''}</div></details>`;
    }
    if (trade) {
        actions.innerHTML += renderResourceTrade(trade, me);
        if (gameState.multiplayer && trade.to === me) card.classList.add('diplomacy-incoming');
    }
}

function beginAllianceReview() {
    document.getElementById('alliance-review-modal').classList.add('hidden');
    const pending = getPendingAllianceRequests();
    const trades = getPendingResourceTrades();
    if (!pending.length && !trades.length) {
        gameState.diplomacyReviewer = null;
        resolveAllMoves();
        return;
    }
    const pair = pending[0];
    const recipient = pair ? pair.players.find(index => index !== pair.requestedBy) : trades[0].to;
    gameState.diplomacyReviewer = recipient;
    gameState.turnIndex = recipient;
    showPrivacyOverlay();
    privacyDesc.innerText = 'Planning is complete. Privately review your alliance and exchange requests before moves resolve.';
}

function renderAllianceReview() {
    document.getElementById('alliance-review-title').innerText = `${PLAYERS[gameState.turnIndex].name}: alliance and exchange requests`;
    document.getElementById('alliance-review-error').innerText = '';
    document.getElementById('alliance-review-requests').innerHTML =
        getPendingAllianceRequests(gameState.turnIndex).map(pair =>
            `<div class="alliance-review-row">${diplomacyIcon('allied')}${diplomacyBall(pair.requestedBy)}${allianceReplyButtons(pair.requestedBy)}</div>`
        ).join('') + getPendingResourceTrades(gameState.turnIndex).map(trade =>
            `<div class="alliance-review-row">${diplomacyBall(trade.from)}${renderResourceTrade(trade, gameState.turnIndex, true)}</div>`
        ).join('');
    document.getElementById('alliance-review-modal').classList.remove('hidden');
}
