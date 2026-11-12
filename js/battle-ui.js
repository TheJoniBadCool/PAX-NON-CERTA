function renderBattleCandidates(group, candidateResults = null, retreatedUnitIds = new Set()) {
    const candidateData = getBattleCandidateData(group);
    battleCandidatesEl.innerHTML = candidateData.map(entry => {
        const candidate = entry.candidate;
        const player = PLAYERS[candidate.player - 1];
        const icons = entry.contents
            .map(unit => {
                const result = candidateResults && candidateResults.get(candidate.pieceId);
                const isDead = result && result.casualties.some(dead => dead.id === unit.id);
                const isRetreating = retreatedUnitIds.has(unit.id);
                const winnerCasualtyOdds = Math.round(casualtyChance(
                    unit,
                    entry.probability,
                    false,
                    entry.towerDefender
                ) * 100);
                const loserCasualtyOdds = Math.round(casualtyChance(
                    unit,
                    entry.probability,
                    true,
                    entry.towerDefender
                ) * 100);
                const experienceBonus = 0.05 * getUnitLevel(unit, 'experience');
                const armourBonus = 0.05 * getUnitLevel(unit, 'armour');
                const battleBonus = Math.round((experienceBonus + armourBonus) * 100);
                const marker = isDead ? '<b class="battle-unit-marker dead">✕</b>' :
                    isRetreating ? '<b class="battle-unit-marker retreat">⚑</b>' : '';
                return `<span class="battle-unit ${player.class}${gameState.eliminated[candidate.player - 1] ? ' piece-eliminated' : ''}" title="${getUnitName(unit)} · XP +${Math.round(experienceBonus * 100)}% · armour +${Math.round(armourBonus * 100)}% · winner casualty ${winnerCasualtyOdds}% · defeated casualty ${loserCasualtyOdds}%">
                    ${PIECE_SVGS[getUnitType(unit)]}${marker}
                    <small>⚔️+${battleBonus}%<br>💀W${winnerCasualtyOdds}% / L${loserCasualtyOdds}%</small>
                </span>`;
            })
            .join('');
        const names = entry.contents.map(getUnitName).join(', ');
        return `
            <div class="battle-candidate">
                <div class="battle-candidate-title" style="color: ${player.color};">P${candidate.player} ${player.name}</div>
                <div class="battle-candidate-icons">${icons}</div>
                <div class="battle-candidate-names">${names}</div>
                <div class="battle-candidate-odds">
                    <div><strong>Odds ${(entry.probability * 100).toFixed(1)}%</strong> · raw strength ${entry.rawWeight.toFixed(2)} · effective weight ${entry.weight.toFixed(2)}</div>
                    <div>Stack ${entry.stackSize} · size advantage +${Math.round(entry.sizeBonus * 100)}% (20% per extra counted unit)</div>
                    <div>XP +${Math.round(entry.experienceBonus * 100)}% · armour +${Math.round(entry.armourBonus * 100)}%
                        ${entry.moraleBonus ? ` · morale +${Math.round(entry.moraleBonus * 100)}% (King +10%, Queen/Bishop +5%)` : ''}
                        ${entry.towerDefenderBonus > 1 ? ' · stationary Tower ×3' : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    return candidateData;
}
