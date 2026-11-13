        function renderCustomSetupPlayers() {
            customPlayerListEl.innerHTML = PLAYERS
                .map((player, index) => gameState.activePlayers[index] ? `
                    <button class="custom-player-option${gameState.customSetupPlayer === index ? ' selected' : ''}"
                        data-player-index="${index}" style="--player-color:${player.color}">
                        ${player.name} (P${player.id})
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
            for (let r = 0; r < 16; r++) {
                for (let c = 0; c < 16; c++) {
                    const square = document.createElement('div');
                    square.className = `custom-setup-square ${(r + c) % 2 === 0 ? 'sq-light' : 'sq-dark'}`;
                    const piece = gameState.customSetupBoard[r][c];
                    if (piece) {
                        square.classList.add(`custom-piece-p${piece.player}`);
                        square.title = getPieceContents(piece).map(getUnitName).join(', ');
                        square.innerHTML = PIECE_SVGS[piece.type];
                        if (getPieceContents(piece).length > 1) {
                            const badge = document.createElement('span');
                            badge.className = 'custom-stack-count';
                            badge.innerText = `x${getPieceContents(piece).length}`;
                            square.appendChild(badge);
                        }
                    }
                    square.addEventListener('click', () => placeCustomPiece(r, c));
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
