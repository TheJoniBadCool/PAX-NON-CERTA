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
    const cycleProgress = completedRounds % 4;
    const clock = document.getElementById('round-clock');
    const description = `Round clock: ${cycleProgress} of 4 rounds completed; resource production in ${4 - cycleProgress} rounds`;
    document.getElementById('round-clock-hand').style.transform = `rotate(${completedRounds * 90}deg)`;
    document.getElementById('round-clock-status').innerText = `${cycleProgress} / 4`;
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
    document.getElementById('objectives-score').innerText = `${gameState.scores[index]} pts | Win: 10 | Defeat: -10`;
    rows.innerHTML = gameState.objectives[index].map(objective => `
        <li class="objective-item${objective.completed ? ' objective-completed' : ''}">
            <input type="checkbox" disabled ${objective.completed ? 'checked' : ''} aria-label="${escapeHtml(objective.label)}">
            <span class="${objective.points < 0 ? 'objective-penalty' : 'objective-reward'}">${objective.points > 0 ? '+' : ''}${objective.points}</span>
            <span class="objective-label">${escapeHtml(getObjectiveLabel(objective))}</span>
        </li>
    `).join('');
}

function updatePlayerCards() {
    for (let i = 0; i < 4; i++) {
        const card = document.getElementById(`card-p${i + 1}`);
        const badge = document.getElementById(`badge-p${i + 1}`);
        card.querySelector('.player-name').innerText =
            `${PLAYER_ICONS[i]} ${PLAYERS[i].name} (Player ${PLAYERS[i].id})`;

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
        const visible = i === gameState.turnIndex && gameState.activePlayers[i] &&
            (gameState.multiplayer || gameState.phase === 'PLANNING');
        resources.classList.toggle('hidden', !visible);
        resources.innerHTML = visible ? RESOURCE_TYPES.map(resource =>
            `<span class="resource-stock" title="${resource.label}" aria-label="${resource.label}: ${gameState.resources[i][resource.key]}"><span aria-hidden="true">${resource.icon}</span><span>${gameState.resources[i][resource.key]}</span></span>`
        ).join('') : '';
    }

    const p = PLAYERS[gameState.turnIndex];
    activePlayerNameEl.innerText = gameState.multiplayer
        ? `You are ${p.name} (Player ${p.id})`
        : `${p.name} (Player ${p.id}) Turn`;
    activePlayerNameEl.style.color = p.color;
    if (gameState.multiplayer) Multiplayer.refreshControls();
    updateRoundDisplay();
}
