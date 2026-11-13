function placeCustomPiece(row, column) {
    const player = gameState.customSetupPlayer + 1;
    const existing = gameState.customSetupBoard[row][column];
    if (existing && existing.player !== player) {
        customSetupStatusEl.innerText = 'Different players cannot share a square.';
        return;
    }
    if (gameState.customSetupType === 'r' && gameState.customSetupBoard.some((boardRow, r) =>
        boardRow.some((piece, c) => isTowerPiece(piece) &&
            Math.max(Math.abs(r - row), Math.abs(c - column)) < 3))) {
        customSetupStatusEl.innerText = 'Towers must have at least two squares between them, including diagonally.';
        return;
    }
    if (gameState.customSetupType === 'k' &&
        gameState.customSetupBoard.flat().some(piece =>
            piece && piece.player === player && getPieceContents(piece).some(unit => unit.type === 'k'))) {
        customSetupStatusEl.innerText = `${PLAYERS[player - 1].name} already has a King.`;
        return;
    }

    const pieceId = `custom_p${player}_${Date.now()}_${Math.random()}`;
    const typeCount = gameState.customSetupBoard.flat()
        .filter(piece => piece && piece.player === player)
        .flatMap(piece => getPieceContents(piece))
        .filter(unit => getUnitType(unit) === gameState.customSetupType).length + 1;
    const unitName = `${PLAYER_CODES[player - 1]}${gameState.customSetupType}${typeCount}`;
    const unit = createUnit(
        player,
        gameState.customSetupType,
        `${pieceId}::unit::0`,
        unitName,
        randomLevel(),
        randomLevel()
    );
    if (existing) {
        existing.contents.push(unit);
        existing.type = getMergedPieceType(existing.contents);
    } else {
        gameState.customSetupBoard[row][column] = {
            id: pieceId,
            player,
            type: gameState.customSetupType,
            contents: [unit]
        };
    }
    customSetupStatusEl.innerText = `${PLAYERS[player - 1].name}: ${getCustomSetupPieceCount(player - 1)} piece(s) placed.`;
    renderCustomSetupBoard();
}

function loadSavedSetup(index) {
    const setup = getSavedSetups()[index];
    if (!isValidSavedSetup(setup)) {
        playerSelectionError.innerText = 'This saved setup is invalid or incomplete.';
        customSetupStatusEl.innerText = 'This saved setup is invalid or incomplete.';
        return;
    }
    showCustomSetup(setup.activePlayers, cloneSetupBoard(setup.board));
}

function deleteSavedSetup(index) {
    const setups = getSavedSetups();
    const setup = setups[index];
    if (!setup || !window.confirm(`Delete saved setup "${getSetupName(setup)}"?`)) return;
    setups.splice(index, 1);
    if (setSavedSetups(setups)) renderAllSavedSetups();
}

function saveCustomSetup() {
    if (!towersAreSpaced(gameState.customSetupBoard)) {
        customSetupStatusEl.innerText = 'Towers must have at least two squares between them, including diagonally.';
        return;
    }
    const setup = {
        name: '',
        activePlayers: [...gameState.activePlayers],
        board: cloneSetupBoard(gameState.customSetupBoard)
    };
    if (!isValidSavedSetup(setup)) {
        customSetupStatusEl.innerText = 'Every selected player must have exactly one King before saving.';
        return;
    }
    const name = window.prompt('Name this custom setup:', '');
    if (name === null || !name.trim()) return;
    setup.name = name.trim();

    const setups = getSavedSetups();
    const existingIndex = setups.findIndex(saved => getSetupName(saved).toLowerCase() === setup.name.toLowerCase());
    if (existingIndex !== -1 && !window.confirm(`Overwrite saved setup "${getSetupName(setups[existingIndex])}"?`)) {
        return;
    }
    if (existingIndex === -1) setups.push(setup);
    else setups[existingIndex] = setup;
    if (setSavedSetups(setups)) {
        customSetupStatusEl.innerText = `Saved setup "${setup.name}".`;
        renderAllSavedSetups();
    } else {
        customSetupStatusEl.innerText = 'Unable to save this setup in browser storage.';
    }
}
