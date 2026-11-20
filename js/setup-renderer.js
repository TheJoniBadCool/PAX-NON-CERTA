        function renderCustomSetupPlayers() {
            customPlayerListEl.innerHTML = [...PLAYERS, REBEL_PLAYER]
                .map((player, index) => (index === 4 || gameState.activePlayers[index]) ? `
                    <button class="custom-player-option${gameState.customSetupPlayer === index ? ' selected' : ''}"
                        data-player-index="${index}" style="--player-color:${player.color}">
                        ${player.name}${index < 4 ? ` (P${player.id})` : ''}
                    </button>` : '')
                .join('');
            customPlayerListEl.querySelectorAll('.custom-player-option').forEach(button => {
                button.addEventListener('click', () => {
                    gameState.customSetupPlayer = Number(button.dataset.playerIndex);
                    renderCustomSetupPlayers();
                });
            });
        }

        function renderCustomSetupBoard() {
            customSetupBoardEl.innerHTML = '';
            customSetupBoardEl.style.setProperty('--board-size', gameState.boardSize);
            const starting = customMapPreview?.starting;
            const provinceOwners = starting ? getProvinceOwners(starting.board) : null;
            for (let r = 0; r < gameState.boardSize; r++) {
                for (let c = 0; c < gameState.boardSize; c++) {
                    const square = document.createElement('div');
                    square.className = `square custom-setup-square ${(r + c) % 2 === 0 ? 'sq-light' : 'sq-dark'}`;
                    if (starting) {
                        const biome = starting.biomes[r][c];
                        square.classList.add(`biome-${biome}`);
                        square.title = `${biome} · ${coordsToNotation(r, c)}`;
                        const owner = provinceOwners[getProvinceIndex(r, c, gameState.boardSize)];
                        if (owner) square.classList.add(`zone-p${owner}`);
                    }
                    const piece = gameState.customSetupBoard[r][c];
                    if (piece) {
                        square.classList.add(piece.player === REBEL_PLAYER_ID
                            ? 'custom-piece-rebel' : `custom-piece-p${piece.player}`);
                        square.title += `${square.title ? ' · ' : ''}${getPieceContents(piece).map(getUnitName).join(', ')}`;
                        square.innerHTML = PIECE_SVGS[piece.type];
                        if (getPieceContents(piece).length > 1) {
                            const badge = document.createElement('span');
                            badge.className = 'custom-stack-count';
                            badge.innerText = `x${getPieceContents(piece).length}`;
                            square.appendChild(badge);
                        }
                    }
                    if (starting) {
                        renderProvinceResource(square, r, c, starting.provinceResources,
                            gameState.boardSize, starting.biomes);
                        const marker = square.querySelector('.province-resource');
                        if (marker) marker.onclick = event => {
                            if (document.getElementById('custom-edit-tool').value !== 'piece') return;
                            event.stopPropagation();
                            const province = getProvinceIndex(r, c, gameState.boardSize);
                            const resources = getProvinceResources(starting.provinceResources,
                                province).filter(resource => {
                                const [row, column] = getResourcePosition(resource, province,
                                    gameState.boardSize, starting.biomes);
                                return row === r && column === c;
                            });
                            const resource = resources.find(resource =>
                                resource.type === document.getElementById('custom-resource-type').value) || resources[0];
                            document.getElementById('custom-edit-tool').value = 'resource';
                            document.getElementById('custom-resource-type').value = resource.type;
                            document.getElementById('custom-resource-chance').value = resource.productionChance;
                            customSetupStatusEl.innerText = `${getProvinceResourceTooltip(resource)}. Click the square to apply edits.`;
                        };
                    }
                    square.addEventListener('click', () => editCustomSquare(r, c));
                    square.addEventListener('contextmenu', event => event.preventDefault());
                    customSetupBoardEl.appendChild(square);
                }
            }
        }

        function renderSavedSetups(listElement, includeLoadButton) {
            const setups = getSavedSetups();
            listElement.innerHTML = setups.length
                ? setups.map((setup, index) => `
                    <div class="saved-setup-row">
                        <span class="saved-setup-name">${escapeHtml(getSetupName(setup) || 'Unnamed setup')}</span>
                        <button class="saved-setup-load btn btn-secondary" data-setup-index="${index}">${includeLoadButton ? 'Load' : 'Edit'}</button>
                        <button class="saved-setup-delete btn btn-secondary" data-setup-index="${index}">Delete</button>
                    </div>
                `).join('')
                : '<span class="saved-setup-empty">No saved custom setups.</span>';

            listElement.querySelectorAll('.saved-setup-load').forEach(button => {
                button.addEventListener('click', () => loadSavedSetup(Number(button.dataset.setupIndex)));
            });
            listElement.querySelectorAll('.saved-setup-delete').forEach(button => {
                button.addEventListener('click', () => deleteSavedSetup(Number(button.dataset.setupIndex)));
            });
        }

        function renderAllSavedSetups() {
            renderSavedSetups(savedSetupListEl, true);
            renderSavedSetups(customSavedSetupListEl, true);
        }
