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
        !Array.isArray(setup.board) || setup.board.length !== 16 ||
        setup.board.some(row => !Array.isArray(row) || row.length !== 16) ||
        setup.activePlayers.filter(Boolean).length < 2) {
        return false;
    }
    const pieces = setup.board.flat().filter(Boolean);
    if (pieces.some(piece => ![1, 2, 3, 4].includes(piece.player) ||
        !setup.activePlayers[piece.player - 1] ||
        !Array.isArray(piece.contents) || piece.contents.length === 0 ||
        piece.contents.some(unit => !unit || unit.player !== piece.player ||
            !['p', 'r', 'n', 'b', 'q', 'k'].includes(unit.type)))) {
        return false;
    }
    return setup.activePlayers.every((isSelected, playerIndex) => {
        const kingCount = pieces
            .filter(piece => piece.player === playerIndex + 1)
            .flatMap(piece => piece.contents)
            .filter(unit => unit.type === 'k').length;
        return isSelected ? kingCount === 1 : kingCount === 0;
    });
}

function cloneSetupBoard(board) {
    return JSON.parse(JSON.stringify(board));
}
