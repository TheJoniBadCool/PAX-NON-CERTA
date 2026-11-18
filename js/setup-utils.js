function updateCapitalResourceOption(prefix = '') {
    const forced = document.getElementById(`${prefix}resource-mode`).value === '16';
    const input = document.getElementById(`${prefix}resource-capitals`);
    if (forced) input.checked = true;
    input.disabled = forced;
}

function getSavedSetups() {
    try {
        const stored = localStorage.getItem(SAVED_SETUP_STORAGE_KEY) ||
            localStorage.getItem(LEGACY_SAVED_SETUP_STORAGE_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
        console.error('Unable to read saved setups.', error);
        return [];
    }
}

function setSavedSetups(setups) {
    try {
        localStorage.setItem(SAVED_SETUP_STORAGE_KEY, JSON.stringify(setups));
        return true;
    } catch (error) {
        console.error('Unable to save setups.', error);
        return false;
    }
}

function getSetupName(setup) {
    return String(setup.name || '').trim();
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function isValidSavedSetup(setup) {
    if (!setup || !Array.isArray(setup.activePlayers) || setup.activePlayers.length !== 4 ||
        !Array.isArray(setup.board) || !BOARD_SIZES.includes(setup.board.length) ||
        setup.board.some(row => !Array.isArray(row) || row.length !== setup.board.length) ||
        setup.activePlayers.filter(Boolean).length < 2) {
        return false;
    }
    if (setup.map && !isValidCustomMap(setup.map, setup.board.length)) return false;
    const pieces = setup.board.flat().filter(Boolean);
    if (pieces.some(piece => ![1, 2, 3, 4, ...(setup.sandbox === true ? [5] : [])].includes(piece.player) ||
        (piece.player !== REBEL_PLAYER_ID && !setup.activePlayers[piece.player - 1]) ||
        !Array.isArray(piece.contents) || piece.contents.length === 0 ||
        piece.contents.some(unit => !unit || unit.player !== piece.player ||
            !['p', 'r', 'n', 'b', 'q', 'k'].includes(unit.type)))) {
        return false;
    }
    if (setup.sandbox === true) return true;
    return setup.activePlayers.every((isSelected, playerIndex) => {
        const units = pieces
            .filter(piece => piece.player === playerIndex + 1)
            .flatMap(piece => piece.contents);
        const kingCount = units.filter(unit => unit.type === 'k').length;
        return isSelected ? kingCount === 1 && units.some(unit => unit.type === 'q') &&
            units.some(unit => unit.type === 'r') : kingCount === 0;
    });
}

function isValidCustomMap(map, size) {
    if (!map || !Array.isArray(map.biomes) || map.biomes.length !== size ||
        map.biomes.some(row => !Array.isArray(row) || row.length !== size ||
            row.some(biome => !['plains', 'forest', 'hill', 'mountain'].includes(biome))) ||
        !Array.isArray(map.provinceResources) || map.provinceResources.length !== 16) return false;
    return map.provinceResources.every((entry, province) =>
        (entry === null || typeof entry === 'object') &&
        getProvinceResources(map.provinceResources, province).every(resource =>
            resource && RESOURCE_TYPES.some(type => type.key === resource.type) &&
            Number.isFinite(resource.productionChance) &&
            resource.productionChance >= 0 && resource.productionChance <= 100 &&
            ((resource.row === undefined && resource.column === undefined) ||
                (Number.isInteger(resource.row) && Number.isInteger(resource.column) &&
                    resource.row >= 0 && resource.row < size &&
                    resource.column >= 0 && resource.column < size &&
                    getProvinceIndex(resource.row, resource.column, size) === province))));
}

function cloneSetupBoard(board) {
    return JSON.parse(JSON.stringify(board));
}
