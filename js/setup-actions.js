function placeCustomPiece(row, column) {
    const player = gameState.customSetupPlayer + 1;
    const existing = gameState.customSetupBoard[row][column];
    if (existing && existing.player !== player) {
        customSetupStatusEl.innerText = 'Different players cannot share a square.';
        return;
    }
    const pieceId = `custom_p${player}_${Date.now()}_${Math.random()}`;
    const names = new Set(gameState.customSetupBoard.flat()
        .filter(piece => piece && piece.player === player)
        .flatMap(piece => getPieceContents(piece))
        .map(unit => unit.name));
    let typeCount = 1;
    while (names.has(`${PLAYER_CODES[player - 1]}${gameState.customSetupType}${typeCount}`)) typeCount++;
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
    customSetupStatusEl.innerText = `${getPlayerInfo(player).name}: ${getCustomSetupPieceCount(player - 1)} piece(s) placed.`;
    refreshCustomMapPreview();
}

function editCustomSquare(row, column) {
    const tool = document.getElementById('custom-edit-tool').value;
    if (tool === 'piece') {
        placeCustomPiece(row, column);
        return;
    }
    if (tool === 'erase-piece') {
        gameState.customSetupBoard[row][column] = null;
        customSetupStatusEl.innerText = 'Pieces removed.';
        refreshCustomMapPreview();
        return;
    }
    if (tool === 'resource') {
        const chance = document.getElementById('custom-resource-chance');
        if (!chance.value.trim() || !chance.checkValidity()) {
            customSetupStatusEl.innerText = 'Enter a production chance from 0 to 100%.';
            chance.reportValidity();
            return;
        }
    }
    ensureCustomMap();
    const starting = customMapPreview.starting;
    if (tool === 'biome') {
        starting.biomes[row][column] = document.getElementById('custom-biome').value;
    } else {
        const province = getProvinceIndex(row, column, gameState.boardSize);
        const resources = starting.provinceResources[province];
        if (tool === 'erase-resource') {
            starting.provinceResources[province] = resources.filter(resource =>
                resource.row !== row || resource.column !== column);
        } else if (tool === 'resource') {
            const type = document.getElementById('custom-resource-type').value;
            const resource = resources.find(resource =>
                resource.row === row && resource.column === column && resource.type === type);
            const values = { type, row, column,
                productionChance: Number(document.getElementById('custom-resource-chance').value) };
            if (resource) Object.assign(resource, values);
            else resources.push(values);
        }
    }
    customSetupStatusEl.innerText = 'Map updated. Changes will be used when starting or saving.';
    refreshCustomMapPreview();
}

function loadSavedSetup(index) {
    const setup = getSavedSetups()[index];
    if (!isValidSavedSetup(setup)) {
        playerSelectionError.innerText = 'This saved setup is invalid or incomplete.';
        customSetupStatusEl.innerText = 'This saved setup is invalid or incomplete.';
        return;
    }
    if (Multiplayer.isEditingSetup() && !Multiplayer.setupMatchesRoom(setup.activePlayers)) {
        customSetupStatusEl.innerText = 'This saved setup must use the same players as the room. Change the lobby player count or choose another setup.';
        return;
    }
    gameState.boardSize = setup.board.length;
    document.getElementById('board-size').value = String(gameState.boardSize);
    showCustomSetup(setup.activePlayers, cloneSetupBoard(setup.board), setup.map || null);
    if (setup.seed) {
        document.getElementById('custom-map-seed').value = setup.seed;
        refreshCustomMapPreview();
    }
}

function deleteSavedSetup(index) {
    const setups = getSavedSetups();
    const setup = setups[index];
    if (!setup || !window.confirm(`Delete saved setup "${getSetupName(setup)}"?`)) return;
    setups.splice(index, 1);
    if (setSavedSetups(setups)) renderAllSavedSetups();
}

function saveCustomSetup() {
    const setup = {
        name: '',
        activePlayers: [...gameState.activePlayers],
        boardSize: gameState.boardSize,
        board: cloneSetupBoard(gameState.customSetupBoard),
        sandbox: true,
        map: customMapPreview ? cloneSetupBoard(customMapPreview.starting) : null,
        seed: document.getElementById('custom-map-seed').value.trim()
    };
    if (!isValidSavedSetup(setup)) {
        customSetupStatusEl.innerText = 'Unable to save: this setup contains invalid pieces or map data.';
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
