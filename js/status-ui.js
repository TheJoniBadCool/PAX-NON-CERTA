function renderRetreatTable() {
    retreatTableEl.innerHTML = gameState.retreating.map((entries, index) => {
        const player = PLAYERS[index];
        const text = entries.length
            ? entries.map(entry => `
                <div class="retreat-entry">
                    <span class="retreat-units">${entry.contents.map(unit =>
                        `<span class="retreat-unit ${player.class}" title="${getUnitName(unit)}">${PIECE_SVGS[getUnitType(unit)]}<span class="retreat-timer">(${Math.max(entry.reentryRound - gameState.round, 0)})</span></span>`
                    ).join('')}</span>
                </div>
            `).join('')
            : '<span class="retreat-empty">—</span>';
        return `<div class="retreat-row"><span class="retreat-player" style="color:${player.color}">P${player.id}</span><span class="retreat-entries">${text}</span></div>`;
    }).join('');
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
    const timeOfDay = ['Dawn', 'Day', 'Dusk', 'Night'][(gameState.round - 1) % 4];
    roundTagEl.innerText = `Round ${gameState.round}`;
    dayClockLabelEl.innerText = timeOfDay;
    dayClockEl.setAttribute('aria-label', `Round ${gameState.round}: ${timeOfDay}`);
    dayClockHandEl.style.transform = `rotate(${(gameState.round - 1) * 90}deg)`;
}

function updatePlayerCards() {
    for (let i = 0; i < 4; i++) {
        const card = document.getElementById(`card-p${i + 1}`);
        const badge = document.getElementById(`badge-p${i + 1}`);

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
    }

    const p = PLAYERS[gameState.turnIndex];
    activePlayerNameEl.innerText = gameState.multiplayer
        ? `You are ${p.name} (Player ${p.id})`
        : `${p.name} (Player ${p.id}) Turn`;
    activePlayerNameEl.style.color = p.color;
    if (gameState.multiplayer) Multiplayer.refreshControls();
    updateRoundDisplay();
}
