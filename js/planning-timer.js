const PlanningTimer = (() => {
    let timeout = null;
    let clockOffset = 0;

    function readSettings(prefix = '') {
        const enabled = document.getElementById(`${prefix}planning-timer-enabled`).checked;
        if (!enabled) return 0;
        const input = document.getElementById(`${prefix}planning-time`);
        if (!input.reportValidity()) return null;
        return Number(input.value) *
            (document.getElementById(`${prefix}planning-time-unit`).value === 'minutes' ? 60 : 1);
    }

    function expired() {
        return gameState.planningDeadline !== null && gameState.planningDeadline !== undefined &&
            Date.now() + clockOffset >= gameState.planningDeadline;
    }

    function refresh(hostNow = null) {
        clearTimeout(timeout);
        timeout = null;
        if (hostNow !== null) clockOffset = hostNow - Date.now();
        const display = document.getElementById('planning-countdown');
        const active = gameState.planningTimeSeconds > 0 && gameState.planningDeadline != null &&
            ['PLANNING', 'COMMITTED'].includes(gameState.phase);
        display.classList.toggle('hidden', !active || gameState.eliminated[gameState.turnIndex]);
        if (!active) return;
        const seconds = Math.max(0, Math.ceil((gameState.planningDeadline - Date.now() - clockOffset) / 1000));
        display.innerText = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        if (expired()) {
            if (gameState.multiplayer) {
                Multiplayer.expirePlanning();
            } else {
                commitCurrentPlans();
            }
            return;
        }
        timeout = setTimeout(refresh, 100);
    }

    function stop() {
        clearTimeout(timeout);
        timeout = null;
        clockOffset = 0;
        gameState.planningDeadline = null;
        document.getElementById('planning-countdown').classList.add('hidden');
    }

    function start() {
        stop();
        if (!(gameState.planningTimeSeconds > 0) ||
            !['PLANNING', 'COMMITTED'].includes(gameState.phase)) return;
        gameState.planningDeadline = Date.now() + gameState.planningTimeSeconds * 1000;
        refresh();
    }

    return { readSettings, expired, refresh, start, stop };
})();

['', 'mp-'].forEach(prefix => {
    const enabled = document.getElementById(`${prefix}planning-timer-enabled`);
    const update = () => {
        document.getElementById(`${prefix}planning-time`).disabled = !enabled.checked;
        document.getElementById(`${prefix}planning-time-unit`).disabled = !enabled.checked;
    };
    enabled.addEventListener('change', update);
    update();
});
