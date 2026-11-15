function battleStat(icon, value, description, className = '') {
    const label = escapeHtml(description);
    return `<span class="battle-stat ${className}" role="img" tabindex="0" title="${label}" aria-label="${label}"><span aria-hidden="true">${icon} ${value}</span></span>`;
}

function renderBattleRolls(rolls) {
    battleRollsEl.innerHTML = `<details class="battle-roll-section">
        <summary title="Show the winner and casualty rolls">🎲 Rolls <span>${rolls.length}</span></summary>
        <div class="battle-roll-list">${rolls.map(roll => `<div>${escapeHtml(roll)}</div>`).join('')}</div>
    </details>`;
}

function renderBattleCandidates(group, candidateResults = null, retreatedUnitIds = new Set()) {
    const candidateData = getBattleCandidateData(group);
    battleCandidatesEl.innerHTML = candidateData.map(entry => {
        const candidate = entry.candidate;
        const player = PLAYERS[candidate.player - 1];
        const icons = entry.contents
            .map(unit => {
                const result = candidateResults && candidateResults.get(candidate.pieceId);
                const isDead = result && result.casualties.some(dead => dead.id === unit.id);
                const isCaptured = result && (result.captured || []).some(captive => captive.id === unit.id);
                const isRetreating = retreatedUnitIds.has(unit.id);
                const winnerCasualtyOdds = Math.round(casualtyChance(
                    unit,
                    entry.probability,
                    false,
                    entry.towerDefender,
                    entry.contents
                ) * 100);
                const loserCasualtyOdds = Math.round(casualtyChance(
                    unit,
                    entry.probability,
                    true,
                    entry.towerDefender,
                    entry.contents
                ) * 100);
                const experienceBonus = 0.05 * getUnitLevel(unit, 'experience');
                const armourBonus = 0.05 * getUnitLevel(unit, 'armour');
                const marker = isCaptured ? '<b class="battle-unit-marker captured">⛓</b>' :
                    isDead ? '<b class="battle-unit-marker dead">✕</b>' :
                    isRetreating ? '<b class="battle-unit-marker retreat">⚑</b>' : '';
                const routed = getRoutedStats(unit);
                const label = escapeHtml(isPrisoner(unit) ? `${getUnitName(unit)} · ${getUnitStats(unit)}` :
                    `${getUnitName(unit)} · XP +${Math.round(experienceBonus * 100)}% · armour +${Math.round(armourBonus * 100)}% · winner casualty ${winnerCasualtyOdds}% · defeated capture ${loserCasualtyOdds}%${routed ? ` · ${routed}` : ''}${isCaptured ? ' · captured' : isDead ? ' · casualty' : isRetreating ? ' · retreating' : ''}`);
                return `<span class="battle-unit ${getUnitDisplayClass(unit, candidate.player)}" role="img" tabindex="0" title="${label}" aria-label="${label}">
                    ${PIECE_SVGS[getUnitType(unit)]}${prisonerChain(unit)}${marker}
                </span>`;
            })
            .join('');
        const names = entry.contents.map(getUnitName).join(', ');
        const stats = [
            battleStat('♟', entry.stackSize, `Stack ${entry.stackSize} counted units · ${names}`),
            battleStat('⚔', entry.rawWeight.toFixed(2), `Raw strength ${entry.rawWeight.toFixed(2)} · effective weight ${entry.weight.toFixed(2)}`),
            entry.sizeBonus ? battleStat('👥', `+${Math.round(entry.sizeBonus * 100)}%`, `Size advantage: +${Math.round(entry.sizeBonus * 100)}% · +20% per extra counted unit above the strongest opponent`) : '',
            entry.experienceBonus ? battleStat('★', `+${Math.round(entry.experienceBonus * 100)}%`, `XP +${Math.round(entry.experienceBonus * 100)}% · +5% per level`) : '',
            entry.armourBonus ? battleStat('🛡', `+${Math.round(entry.armourBonus * 100)}%`, `Armour +${Math.round(entry.armourBonus * 100)}% · +5% per level`) : '',
            entry.routedPenalty ? battleStat('⚑', `-${Math.round(entry.routedPenalty * 100)}%`, `Routed strength -${Math.round(entry.routedPenalty * 100)}% · average of per-unit penalties, applied before the odds curve`) : '',
            entry.moraleBonus ? battleStat('♛', `+${Math.round(entry.moraleBonus * 100)}%`, `Morale: +${Math.round(entry.moraleBonus * 100)}% · King +10%, Queen/Bishop +5%`) : '',
            entry.towerDefenderBonus > 1 ? battleStat('♜', '×3', 'Stationary Tower defence ×3') : ''
        ].join('');
        return `
            <div class="battle-candidate">
                <div class="battle-candidate-header">
                    <span class="battle-candidate-title" style="color: ${player.color};" title="P${candidate.player} ${player.name}">P${candidate.player}</span>
                    ${battleStat('⚖', `${(entry.probability * 100).toFixed(1)}%`, `Chance to win ${(entry.probability * 100).toFixed(1)}%`, 'battle-win-odds')}
                </div>
                <div class="battle-candidate-icons">${icons}</div>
                <div class="battle-candidate-stats">${stats}</div>
            </div>
        `;
    }).join('');
    return candidateData;
}

function renderCaptureChoices() {
    const container = document.getElementById('capture-choices');
    const pending = gameState.pendingCapture;
    container.innerHTML = '';
    btnProceedBattle.disabled = Boolean(pending);
    if (!pending) return;
    const canChoose = !gameState.multiplayer || gameState.turnIndex + 1 === pending.player;
    const heading = document.createElement('div');
    heading.innerText = `P${pending.player}: choose each captured unit's fate${canChoose ? '' : ' — waiting for the winner'}.`;
    container.appendChild(heading);
    pending.contents.forEach(unit => {
        const row = document.createElement('div');
        row.className = 'capture-choice';
        const icon = document.createElement('span');
        icon.className = `battle-unit ${getUnitDisplayClass(unit, unit.player)}`;
        icon.innerHTML = PIECE_SVGS[unit.type];
        icon.title = getUnitName(unit);
        row.appendChild(icon);
        const name = document.createElement('span');
        name.innerText = getUnitName(unit);
        row.appendChild(name);
        ['keep', 'execute'].forEach(fate => {
            const button = document.createElement('button');
            button.innerText = fate === 'keep' ? '⛓ Prisoner' : '✕ Execute';
            button.disabled = !canChoose;
            button.addEventListener('click', () => {
                if (!canChoose) return;
                if (gameState.multiplayer && !Multiplayer.isHost()) {
                    Multiplayer.requestCaptureDecision(pending.id, unit.id, fate);
                    button.disabled = true;
                    return;
                }
                if (!decideCapture(pending.player, pending.id, unit.id, fate)) {
                    hintTextEl.innerText = 'Capture decision rejected: the unit or battle has changed.';
                    return;
                }
                renderCaptureChoices();
                renderBoard();
            });
            row.appendChild(button);
        });
        container.appendChild(row);
    });
}
