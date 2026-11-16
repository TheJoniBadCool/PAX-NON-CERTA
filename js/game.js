        const gameState = new GameState();

        // DOM Elements
        const boardEl = document.getElementById('board');
        const planArrowsEl = document.getElementById('plan-arrows');
        const activePlayerNameEl = document.getElementById('active-player-name');
        const activePlayerDescEl = document.getElementById('active-player-desc');
        const btnFinishPlan = document.getElementById('btn-finish-plan');
        const btnClearPlan = document.getElementById('btn-clear-plan');
        const btnCancelSiege = document.getElementById('btn-cancel-siege');
        const btnSallyOut = document.getElementById('btn-sally-out');
        const btnRestart = document.getElementById('btn-restart');
        const btnEditNames = document.getElementById('btn-edit-names');
        const playerSelectionModal = document.getElementById('player-selection-modal');
        const playerSelectionError = document.getElementById('player-selection-error');
        const btnStartSelectedGame = document.getElementById('btn-start-selected-game');
        const playerNamesModal = document.getElementById('player-names-modal');
        const playerNamesEditor = document.getElementById('player-names-editor');
        const customSetupModal = document.getElementById('custom-setup-modal');
        const customSetupBoardEl = document.getElementById('custom-setup-board');
        const customSetupStatusEl = document.getElementById('custom-setup-status');
        const customPlayerListEl = document.getElementById('custom-player-list');
        const btnResetCustomSetup = document.getElementById('btn-reset-custom-setup');
        const btnSaveCustomSetup = document.getElementById('btn-save-custom-setup');
        const btnLoadCustomSetup = document.getElementById('btn-load-custom-setup');
        const btnConfirmCustomSetup = document.getElementById('btn-confirm-custom-setup');
        const savedSetupListEl = document.getElementById('saved-setup-list');
        const customSavedSetupListEl = document.getElementById('custom-saved-setup-list');
        const btnRules = document.getElementById('btn-rules');
        const privacyOverlay = document.getElementById('privacy-overlay');
        const privacyTitle = document.getElementById('privacy-title');
        const privacyDesc = document.getElementById('privacy-desc');
        const privacyIcon = document.getElementById('privacy-icon');
        const btnPrivacyReady = document.getElementById('btn-privacy-ready');
        const clashOverlay = document.getElementById('clash-overlay');
        const battleConnector = document.getElementById('battle-connector');
        const battleConnectorLine = document.getElementById('battle-connector-line');
        const battleConnectorTarget = document.getElementById('battle-connector-target');
        const battleWindow = document.getElementById('battle-window');
        const battleWindowHeader = document.getElementById('battle-window-header');
        const clashResult = document.getElementById('clash-result');
        const battleCandidatesEl = document.getElementById('battle-candidates');
        const battleRollsEl = document.getElementById('battle-rolls');
        const btnStartBattle = document.getElementById('btn-start-battle');
        const btnProceedBattle = document.getElementById('btn-proceed-battle');
        const mergePrompt = document.getElementById('merge-prompt');
        const mergePromptText = document.getElementById('merge-prompt-text');
        const btnMergeConfirm = document.getElementById('btn-merge-confirm');
        const btnMergeCancel = document.getElementById('btn-merge-cancel');
        const pieceTooltip = document.getElementById('piece-tooltip');
        const pieceTooltipUnits = document.getElementById('piece-tooltip-units');
        document.getElementById('btn-close-piece-tooltip').addEventListener('click', () => {
            pieceTooltip.classList.add('hidden');
        });
        const battleLogEl = document.getElementById('battle-log');
        const combatLogPanel = document.getElementById('combat-log-panel');
        const btnToggleCombatLog = document.getElementById('btn-toggle-combat-log');
        const roundTagEl = document.getElementById('round-tag');
        const hintTextEl = document.getElementById('hint-text');
        let battleTargetSquare = null;
        let hotseatMapPreview = null;
        let customMapPreview = null;
        btnToggleCombatLog.addEventListener('click', () => {
            const isExpanded = btnToggleCombatLog.getAttribute('aria-expanded') === 'true';
            combatLogPanel.classList.toggle('hidden', isExpanded);
            document.querySelector('main').classList.toggle('combat-log-hidden', isExpanded);
            btnToggleCombatLog.setAttribute('aria-expanded', String(!isExpanded));
            btnToggleCombatLog.setAttribute('aria-label', `${isExpanded ? 'Show' : 'Hide'} combat log`);
            btnToggleCombatLog.innerText = isExpanded ? '📜 Show Log' : '📜 Hide Log';
        });
        bindBoardInteractions();

        function updateBattleConnector() {
            if (!battleTargetSquare || clashOverlay.classList.contains('hidden')) return;

            const boardRect = boardEl.parentElement.getBoundingClientRect();
            const [targetRow, targetColumn] = battleTargetSquare;
            const targetX = ((targetColumn + 0.5) / gameState.boardSize) * 100;
            const targetY = ((targetRow + 0.5) / gameState.boardSize) * 100;
            const windowRect = battleWindow.getBoundingClientRect();
            const windowLeft = ((windowRect.left - boardRect.left) / boardRect.width) * 100;
            const windowRight = ((windowRect.right - boardRect.left) / boardRect.width) * 100;
            const windowTop = ((windowRect.top - boardRect.top) / boardRect.height) * 100;
            const windowBottom = ((windowRect.bottom - boardRect.top) / boardRect.height) * 100;
            const lineX = Math.max(windowLeft, Math.min(targetX, windowRight));
            const lineY = Math.max(windowTop, Math.min(targetY, windowBottom));

            battleConnectorLine.setAttribute('x1', targetX);
            battleConnectorLine.setAttribute('y1', targetY);
            battleConnectorLine.setAttribute('x2', lineX);
            battleConnectorLine.setAttribute('y2', lineY);
            battleConnectorTarget.setAttribute('cx', targetX);
            battleConnectorTarget.setAttribute('cy', targetY);
        }

        // Cancellations resolve in the movement phase, after sally groups have captured the
        // besiegers, so a simultaneous Sally Out still fights the cancelling catapult.
        function applySiegeCancellations(allIntendedMoves) {
            allIntendedMoves.filter(move => move.siegeCancel && !move.invalid).forEach(move => {
                const siege = gameState.sieges.find(entry => entry.id === move.siegeId);
                const attacker = siege && siege.attackers.find(entry =>
                    entry.pieceId === move.pieceId && entry.player === move.player);
                const piece = gameState.board[move.from[0]][move.from[1]];
                if (!attacker || !piece || piece.id !== move.pieceId) {
                    move.invalid = true;
                    return;
                }
                siege.attackers = siege.attackers.filter(entry => entry !== attacker);
                logAction(`🏳️ Player ${move.player} cancelled a siege at ${coordsToNotation(...siege.towerSquare)}.`);
            });
            syncSieges();
        }

        function createSallyGroups(allIntendedMoves) {
            return allIntendedMoves
                .filter(move => move.sallyOut && !move.invalid)
                .map(move => {
                    const siege = gameState.sieges.find(entry => entry.id === move.siegeId);
                    const tower = siege && gameState.board[siege.towerSquare[0]][siege.towerSquare[1]];
                    if (!siege || !tower || tower.id !== move.pieceId ||
                        !getCombatContents(tower).some(unit => getUnitType(unit) !== 'r')) {
                        move.invalid = true;
                        return null;
                    }
                    const attackers = siege.attackers.map(attacker => {
                        const piece = gameState.board[attacker.sourceSquare[0]][attacker.sourceSquare[1]];
                        return piece && piece.id === attacker.pieceId ? {
                            player: piece.player,
                            pieceId: piece.id,
                            from: [...attacker.sourceSquare],
                            to: [...attacker.sourceSquare],
                            pieceType: piece.type,
                            contents: getPieceContents(piece),
                            isSallyAttacker: true
                        } : null;
                    }).filter(Boolean);
                    if (!attackers.length) {
                        move.invalid = true;
                        return null;
                    }
                    return {
                        type: 'SALLY',
                        targetSquare: [...siege.towerSquare],
                        siegeId: siege.id,
                        candidates: [
                            ...attackers,
                            {
                                player: tower.player,
                                pieceId: tower.id,
                                from: [...siege.towerSquare],
                                to: [...siege.towerSquare],
                                pieceType: tower.type,
                                contents: getPieceContents(tower).filter(unit => getUnitType(unit) !== 'r'),
                                isSallyDefender: true
                            }
                        ]
                    };
                })
                .filter(Boolean);
        }

        function setBattleTarget(group) {
            battleTargetSquare = group.targetSquare || (group.candidates[0] && group.candidates[0].to);
            battleConnector.classList.remove('hidden');
            requestAnimationFrame(updateBattleConnector);
        }

        function clearBattleTarget() {
            battleTargetSquare = null;
            battleConnector.classList.add('hidden');
        }

        function initializeBattleWindowDrag() {
            let dragState = null;
            battleWindowHeader.addEventListener('pointerdown', event => {
                if (event.button !== 0) return;
                const windowRect = battleWindow.getBoundingClientRect();
                const boardRect = battleWindow.parentElement.getBoundingClientRect();
                battleWindow.style.left = `${windowRect.left - boardRect.left}px`;
                battleWindow.style.top = `${windowRect.top - boardRect.top}px`;
                dragState = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    left: windowRect.left - boardRect.left,
                    top: windowRect.top - boardRect.top
                };
                battleWindowHeader.setPointerCapture(event.pointerId);
            });
            battleWindowHeader.addEventListener('pointermove', event => {
                if (!dragState || event.pointerId !== dragState.pointerId) return;
                const boardRect = battleWindow.parentElement.getBoundingClientRect();
                const maxLeft = Math.max(0, boardRect.width - battleWindow.offsetWidth);
                const maxTop = Math.max(0, boardRect.height - battleWindow.offsetHeight);
                const left = Math.max(0, Math.min(maxLeft, dragState.left + event.clientX - dragState.startX));
                const top = Math.max(0, Math.min(maxTop, dragState.top + event.clientY - dragState.startY));
                battleWindow.style.left = `${left}px`;
                battleWindow.style.top = `${top}px`;
                updateBattleConnector();
            });
            const stopDragging = () => { dragState = null; };
            battleWindowHeader.addEventListener('pointerup', stopDragging);
            battleWindowHeader.addEventListener('pointercancel', stopDragging);
            window.addEventListener('resize', updateBattleConnector);
        }

        initializeBattleWindowDrag();

        function randomLevel(random = Math.random, progressionMode = gameState.progressionMode) {
            return progressionMode === 'random' ? 1 + Math.floor(random() * 3) : 0;
        }

        function getNextUnitName(player, type) {
            const sequence = gameState.nextUnitSequence[player - 1]++;
            return `${PLAYER_CODES[player - 1]}${type}${sequence}`;
        }

        function wait(milliseconds) {
            return new Promise(resolve => setTimeout(resolve, milliseconds));
        }

        async function animatePlannedMovements(allMoves) {
            const animationLayer = document.getElementById('movement-animation-layer');
            animationLayer.innerHTML = '';

            for (const move of allMoves) {
                if (move.invalid || move.siegeStart || move.sallyOut || move.siegeCancel) continue;
                if (move.player !== gameState.turnIndex + 1 &&
                    (getBiome(...move.from) === 'forest' || getBiome(...move.to) === 'forest')) continue;
                const sourcePiece = move.isUnmerge
                    ? { player: move.player, type: move.pieceType, contents: move.contents }
                    : gameState.board[move.from[0]][move.from[1]];
                if (!sourcePiece) continue;

                const kind = getPlanArrowKind(move, allMoves);
                const colors = {
                    green: '#22c55e',
                    yellow: '#facc15',
                    red: '#ef4444',
                    blue: '#3b82f6'
                };
                const token = document.createElement('div');
                token.className = `${getPieceClass(sourcePiece)} movement-token`;
                token.style.left = `${move.from[1] * 6.25}%`;
                token.style.top = `${move.from[0] * 6.25}%`;
                token.style.boxShadow = `0 0 14px ${colors[kind]}`;
                token.innerHTML = PIECE_SVGS[sourcePiece.type];
                const captive = getPieceContents(sourcePiece).find(isPrisoner);
                if (captive) token.innerHTML += prisonerChain(captive);
                animationLayer.appendChild(token);

                await new Promise(resolve => requestAnimationFrame(() => {
                    token.style.transform = `translate(${(move.to[1] - move.from[1]) * 100}%, ${(move.to[0] - move.from[0]) * 100}%) scale(0.82)`;
                    resolve();
                }));
                await wait(650);
                token.style.opacity = '0';
                await wait(200);
                token.remove();
            }
        }

        function startNewGame(selectedPlayers, customBoard = null, boardSize = gameState.boardSize, seed = null) {
            gameState.activePlayers = selectedPlayers;
            btnEditNames.classList.remove('hidden');
            initBoard(customBoard, boardSize, seed);
            gameState.turnIndex = gameState.activePlayers.findIndex(isSelected => isSelected);
            gameState.round = 1;
            gameState.phase = 'PLANNING';
            gameState.plans = [[], [], [], []];
            gameState.selectedSquare = null;
            gameState.validMoves = [];
            gameState.lockedPieceIds = new Set();
            gameState.pendingMerge = null;
            gameState.selectedHeldPiece = null;
            gameState.pendingTransfer = null;
            gameState.retreating = [[], [], [], []];
            gameState.deadPieces = [[], [], [], []];
            gameState.sieges = [];
            gameState.pendingCapture = null;
            renderCaptureChoices();
            gameState.nextUnitSequence = [1, 1, 1, 1];
            initializeObjectives();
            btnMergeConfirm.innerText = 'Merge';

            battleLogEl.innerHTML = `
                <div class="log-item" style="color: var(--text-muted); text-align: center;">
                    Match Initialized! ${gameState.boardSize}x${gameState.boardSize} grid. Map seed: ${gameState.mapSeed}.
                    Secretly plan multi-piece moves.
                </div>
            `;
            document.getElementById('map-seed-display').innerText = `Map seed: ${gameState.mapSeed}`;

            document.getElementById('gameover-modal').classList.add('hidden');
            playerSelectionModal.classList.add('hidden');
            privacyOverlay.classList.add('hidden');
            clashOverlay.classList.add('hidden');
            clearBattleTarget();
            mergePrompt.classList.add('hidden');
            renderRetreatTable();

            updatePlayerCards();
            renderBoard();
        }

        function showCustomSetup(selectedPlayers, setupBoard = null) {
            gameState.activePlayers = selectedPlayers;
            if (setupBoard) gameState.boardSize = setupBoard.length;
            gameState.customSetupBoard = setupBoard || createEmptySetupBoard();
            gameState.nextUnitSequence = [1, 1, 1, 1];
            gameState.customSetupPlayer = selectedPlayers.findIndex(Boolean);
            gameState.customSetupType = 'p';
            document.querySelectorAll('.custom-piece-option').forEach(button =>
                button.classList.toggle('selected', button.dataset.pieceType === 'p'));
            const multiplayerSetup = Multiplayer.isEditingSetup();
            document.getElementById('btn-custom-setup-back').classList.toggle('hidden', !multiplayerSetup);
            btnConfirmCustomSetup.innerText = multiplayerSetup ? 'Use Placement' : 'Confirm Placement';
            const priorSeed = multiplayerSetup
                ? document.getElementById('mp-map-seed').value
                : document.getElementById('map-seed').value;
            document.getElementById('custom-map-seed').value = priorSeed.trim();
            customMapPreview = null;
            document.getElementById('custom-map-preview').innerHTML = '';
            document.getElementById('custom-map-preview-status').innerText =
                'Generate the map preview after editing your custom placement.';
            customSetupStatusEl.innerText = 'Every selected player needs exactly one King, at least one Queen and one Tower. Click or tap the board to place pieces.';
            renderCustomSetupPlayers();
            renderCustomSetupBoard();
            playerSelectionModal.classList.add('hidden');
            customSetupModal.classList.remove('hidden');
            updateCustomMapPreviewControls();
            renderAllSavedSetups();
        }

        function confirmCustomSetup() {
            if (!towersAreSpaced(gameState.customSetupBoard)) {
                customSetupStatusEl.innerText = 'Towers must have at least two squares between them, including diagonally. Reset this setup to replace the towers.';
                return;
            }
            const missingKing = gameState.activePlayers.findIndex((isSelected, index) =>
                isSelected && gameState.customSetupBoard.flat()
                    .filter(piece => piece && piece.player === index + 1)
                    .flatMap(getPieceContents).filter(unit => unit.type === 'k').length !== 1);
            if (missingKing !== -1) {
                customSetupStatusEl.innerText = `${PLAYERS[missingKing].name} must have exactly one King.`;
                return;
            }
            const missingObjectiveUnits = gameState.activePlayers.findIndex((isSelected, index) => {
                const units = gameState.customSetupBoard.flat().filter(piece => piece && piece.player === index + 1)
                    .flatMap(getPieceContents);
                return isSelected && (!units.some(unit => unit.type === 'q') || !units.some(unit => unit.type === 'r'));
            });
            if (missingObjectiveUnits !== -1) {
                customSetupStatusEl.innerText = `${PLAYERS[missingObjectiveUnits].name} needs at least one Queen and one Tower for objectives.`;
                return;
            }
            if (Multiplayer.isEditingSetup()) {
                Multiplayer.confirmSetup();
                return;
            }
            const seed = document.getElementById('custom-map-seed').value.trim();
            if (!customMapPreview || customMapPreview.signature !== getCustomMapSignature(seed)) {
                customSetupStatusEl.innerText = 'Generate a map preview for this placement before starting.';
                updateCustomMapPreviewControls();
                return;
            }
            customSetupModal.classList.add('hidden');
            document.getElementById('map-seed').value = seed;
            startNewGame(gameState.activePlayers, gameState.customSetupBoard, gameState.boardSize, seed);
        }

        function getCustomMapSignature(seed) {
            return JSON.stringify({
                players: gameState.activePlayers,
                boardSize: gameState.boardSize,
                progression: gameState.progressionMode,
                board: gameState.customSetupBoard,
                seed
            });
        }

        function updateCustomMapPreviewControls() {
            const multiplayerSetup = Multiplayer.isEditingSetup();
            const seed = document.getElementById('custom-map-seed').value.trim();
            const current = seed && customMapPreview &&
                customMapPreview.signature === getCustomMapSignature(seed);
            btnConfirmCustomSetup.disabled = !multiplayerSetup && !current;
        }

        function invalidateCustomMapPreview() {
            customMapPreview = null;
            document.getElementById('custom-map-preview').innerHTML = '';
            document.getElementById('custom-map-preview-status').innerText =
                'Placement or seed changed. Generate a new map preview.';
            updateCustomMapPreviewControls();
        }

        function generateCustomMapPreview() {
            const seedInput = document.getElementById('custom-map-seed');
            const seed = seedInput.value.trim() || createRandomMapSeed();
            seedInput.value = seed;
            document.getElementById('map-seed').value = seed;
            if (Multiplayer.isEditingSetup()) document.getElementById('mp-map-seed').value = seed;
            const starting = createStartingBoard(
                gameState.activePlayers, gameState.boardSize, seed, gameState.customSetupBoard);
            renderMapPreview(document.getElementById('custom-map-preview'), starting, gameState.boardSize);
            customMapPreview = { seed, signature: getCustomMapSignature(seed) };
            document.getElementById('custom-map-preview-status').innerText =
                'Preview ready. Confirming placement will use this exact terrain and seed.';
            updateCustomMapPreviewControls();
        }

        function showPlayerSelection() {
            playerSelectionError.innerText = '';
            document.getElementById('board-size').value = String(gameState.boardSize);
            document.querySelectorAll('.player-name-input').forEach(input => {
                input.value = PLAYERS[Number(input.dataset.playerName) - 1].name;
            });
            btnEditNames.classList.add('hidden');
            customSetupModal.classList.add('hidden');
            hotseatMapPreview = null;
            document.getElementById('map-preview').innerHTML = '';
            document.getElementById('map-preview-status').innerText = 'Generate a map to preview the starting layout.';
            updateHotseatMapControls();
            playerSelectionModal.classList.remove('hidden');
            renderAllSavedSetups();
        }

        function getSelectedHotseatPlayers() {
            return [...document.querySelectorAll('#player-selection-list input[type="checkbox"]')]
                .map(input => input.checked);
        }

        function getHotseatMapSignature(seed) {
            return JSON.stringify({
                players: getSelectedHotseatPlayers(),
                size: Number(document.getElementById('board-size').value),
                progression: document.querySelector('input[name="progression-mode"]:checked').value,
                seed
            });
        }

        function updateHotseatMapControls() {
            const isCustom = document.querySelector('input[name="setup-mode"]:checked').value === 'custom';
            document.getElementById('hotseat-map-preview-controls').classList.toggle('hidden', isCustom);
            const seed = document.getElementById('map-seed').value.trim();
            const current = seed && hotseatMapPreview &&
                hotseatMapPreview.signature === getHotseatMapSignature(seed);
            btnStartSelectedGame.disabled = !isCustom && !current;
        }

        function generateHotseatMapPreview() {
            const players = getSelectedHotseatPlayers();
            if (players.filter(Boolean).length < 2) {
                document.getElementById('map-preview-status').innerText = 'Select at least two players before generating a map.';
                return;
            }
            const seedInput = document.getElementById('map-seed');
            const seed = seedInput.value.trim() || createRandomMapSeed();
            seedInput.value = seed;
            const size = Number(document.getElementById('board-size').value);
            const progression = document.querySelector('input[name="progression-mode"]:checked').value;
            const starting = createStartingBoard(players, size, seed, null, progression);
            renderMapPreview(document.getElementById('map-preview'), starting, size);
            hotseatMapPreview = { seed, signature: getHotseatMapSignature(seed) };
            document.getElementById('map-preview-status').innerText =
                'Preview ready. Starting the game will use this exact map and seed.';
            updateHotseatMapControls();
        }

        function cleanPlayerName(value, index) {
            return String(value || '').replace(/[<>]/g, '').trim().slice(0, 16) || PLAYERS[index].colorName;
        }

        function showPlayerNamesEditor() {
            playerNamesEditor.innerHTML = '';
            const indices = gameState.multiplayer ? [Multiplayer.getMyIndex()] : [0, 1, 2, 3];
            document.getElementById('player-names-help').innerText = gameState.multiplayer
                ? 'Change the name shown for you in this room.'
                : 'Choose the names shown throughout the game.';
            indices.forEach(index => {
                const label = document.createElement('label');
                label.style.color = PLAYERS[index].color;
                label.innerText = `Player ${index + 1} (${PLAYERS[index].colorName})`;
                const input = document.createElement('input');
                input.type = 'text';
                input.maxLength = 16;
                input.dataset.playerNameEditor = String(index + 1);
                input.value = PLAYERS[index].name;
                input.setAttribute('aria-label', `Player ${index + 1} name`);
                label.appendChild(input);
                playerNamesEditor.appendChild(label);
            });
            playerNamesModal.classList.remove('hidden');
            playerNamesEditor.querySelector('input').focus();
        }

        function savePlayerNames() {
            playerNamesEditor.querySelectorAll('input').forEach(input => {
                const index = Number(input.dataset.playerNameEditor) - 1;
                const name = cleanPlayerName(input.value, index);
                if (gameState.multiplayer) {
                    Multiplayer.renameMyPlayer(name);
                } else {
                    PLAYERS[index].name = name;
                }
            });
            playerNamesModal.classList.add('hidden');
            updatePlayerCards();
            renderBoard();
        }

        function canEditPlans() {
            return gameState.phase === 'PLANNING' &&
                (!gameState.multiplayer || !Multiplayer.isPendingCommit());
        }

        function showPieceTooltip(r, c, square) {
            const piece = gameState.board[r][c];
            if (!piece) return;
            if (isEliminatedPiece(piece) || piece.player !== gameState.turnIndex + 1 || !canEditPlans()) {
                pieceTooltip.classList.add('hidden');
                hintTextEl.innerText = "You can only unmerge or transfer your own pieces during your turn.";
                return;
            }

            const pendingIndices = getPendingHeldIndices(piece, gameState.plans[gameState.turnIndex]);
            const contents = getPieceContents(piece);
            const siege = getSiegeAtSquare([r, c]);
            btnCancelSiege.hidden = !getSiegeForAttacker(piece.id);
            btnSallyOut.hidden = !(siege && contents.some(unit => !isPrisoner(unit) && getUnitType(unit) !== 'r'));
            pieceTooltipUnits.innerHTML = contents
                .map((unit, index) => `<span class="held-piece-entry">
                    <button class="held-piece-button ${getUnitDisplayClass(unit, piece.player)}${pendingIndices.has(index) ? ' pending' : ''}${unit.type === 'r' ? ' disabled' : ''}" data-held-index="${index}" title="${getUnitName(unit)}: ${unit.type === 'r' ? 'Tower' : 'Unmerge'}" aria-label="${getUnitName(unit)}">${PIECE_SVGS[unit.type]}${prisonerChain(unit)}</button>
                    ${!isPrisoner(unit) ? `<span class="unit-levels" title="${escapeHtml(`${getUnitName(unit)} · ${getUnitStats(unit)}`)}">
                        <span class="experience-level">${['0', 'I', 'II', 'III'][getUnitLevel(unit, 'experience')]}</span> 🛡️${getUnitLevel(unit, 'armour')}${getRoutedStacks(unit) ? ` · ⚑${getRoutedStacks(unit)} (${unit.routedUntilRound - gameState.round})` : ''}
                    </span>` : ''}
                    ${!isPrisoner(unit) && contents.some(other => other.type === 'r') && getUnitLevel(unit, 'armour') < 3 ? `<button class="armor-upgrade-button" data-armour-index="${index}" title="Upgrade armour">🛡️</button>` : ''}
                    ${isPrisoner(unit) ? `<button class="prisoner-action-button" data-prisoner-index="${index}" data-action="execute" title="Plan execution of ${escapeHtml(getUnitName(unit))}" aria-label="Execute ${escapeHtml(getUnitName(unit))}">${PRISONER_EXECUTE_SVG}</button><button class="prisoner-action-button" data-prisoner-index="${index}" data-action="release" title="Plan release of ${escapeHtml(getUnitName(unit))}" aria-label="Release ${escapeHtml(getUnitName(unit))}">${PRISONER_RELEASE_SVG}</button>` : ''}
                </span>`)
                .join('');
            if (isPawnRestTurn()) {
                pieceTooltip.querySelectorAll('.held-piece-button').forEach((button, index) => {
                    if (!canMoveHeldUnit(contents[index])) {
                        button.disabled = true;
                        button.title = `${getUnitName(contents[index])}: Pawns and prisoners cannot move on even-numbered rounds`;
                    }
                });
            }
            pieceTooltip.classList.remove('hidden');
            pieceTooltip.style.left = `${Math.max(8, Math.min(square.offsetLeft + square.offsetWidth, boardEl.clientWidth - pieceTooltip.offsetWidth - 8))}px`;
            const above = square.offsetTop - pieceTooltip.offsetHeight - 4;
            pieceTooltip.style.top = `${above >= 8 ? above : Math.min(square.offsetTop + square.offsetHeight + 4, boardEl.clientHeight - pieceTooltip.offsetHeight - 8)}px`;

            pieceTooltip.querySelectorAll('.held-piece-button').forEach(button => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (!canEditPlans()) return;
                    const heldIndex = Number(button.dataset.heldIndex);
                    const heldUnit = getPieceContents(piece)[heldIndex];
                    if (heldUnit.type === 'r' || !canMoveHeldUnit(heldUnit)) {
                        hintTextEl.innerText = heldUnit.type === 'r'
                            ? "Towers are unmovable and cannot be unmerged or transferred."
                            : gameState.plans[gameState.turnIndex].some(plan => plan.prisonerAction && plan.unitId === heldUnit.id)
                            ? "This prisoner is scheduled for release or execution. Reset Plans before moving it."
                            : "Pawns and prisoners cannot be moved, unmerged, or transferred on even-numbered rounds.";
                        return;
                    }
                    gameState.selectedHeldPiece = {
                        from: [r, c],
                        heldIndex,
                        type: heldUnit.type,
                        unitId: heldUnit.id,
                        name: heldUnit.name,
                        sourceId: piece.id
                    };
                    pieceTooltip.classList.add('hidden');
                    gameState.selectedSquare = [r, c];
                    gameState.validMoves = getAdjacentMoves(r, c)
                        .filter(destination => isPassableSquare(...destination) &&
                            isTowerGateMove([r, c], destination) &&
                            canUnitsTarget([heldUnit], getVisiblePiece(...destination, piece.player), piece.player));
                    hintTextEl.innerText = `Selected a held ${getPieceLabel(gameState.selectedHeldPiece.type)}. Pick an adjacent square or your piece to transfer it.`;
                    renderBoard();
                });
            });
            pieceTooltip.querySelectorAll('.prisoner-action-button').forEach(button => {
                button.addEventListener('click', event => {
                    event.stopPropagation();
                    if (!canEditPlans()) return;
                    const unit = contents[Number(button.dataset.prisonerIndex)];
                    if (!managePrisoner(piece.player, unit.id, button.dataset.action)) {
                        hintTextEl.innerText = "Prisoner action rejected. Cancel that prisoner's unmerge or transfer plan first.";
                        return;
                    }
                    hintTextEl.innerText = `${button.dataset.action === 'execute' ? 'Execution' : 'Release'} queued for ${getUnitName(unit)}; it will resolve before movement.`;
                    pieceTooltip.classList.add('hidden');
                    gameState.selectedSquare = null;
                    gameState.selectedHeldPiece = null;
                    gameState.validMoves = [];
                    renderBoard();
                });
            });
            pieceTooltip.querySelectorAll('.armor-upgrade-button').forEach(button => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    if (!canEditPlans()) return;
                    const unit = contents[Number(button.dataset.armourIndex)];
                    if (gameState.multiplayer && !Multiplayer.isHost()) {
                        Multiplayer.requestArmourUpgrade(unit.id);
                        pieceTooltip.classList.add('hidden');
                        return;
                    }
                    unit.armour = getUnitLevel(unit, 'armour') + 1;
                    logAction(`🛡️ <b>${getUnitName(unit)}</b> armour upgraded to ${unit.armour}.`);
                    showPieceTooltip(r, c, square);
                    renderBoard();
                });
            });
        }

        btnCancelSiege.onclick = () => {
            if (!canEditPlans() || !gameState.selectedSquare) return;
            const selectedPiece = gameState.board[gameState.selectedSquare[0]][gameState.selectedSquare[1]];
            const siege = selectedPiece ? getSiegeForAttacker(selectedPiece.id) : null;
            const attacker = siege && siege.attackers.find(entry => entry.pieceId === selectedPiece.id);
            if (!siege || !attacker || attacker.player !== gameState.turnIndex + 1) return;
            if (gameState.multiplayer) {
                // Planned like any other action: the catapult stack does nothing else this round.
                const plans = gameState.plans[gameState.turnIndex];
                gameState.plans[gameState.turnIndex] = plans.filter(move => move.prisonerAction || move.pieceId !== selectedPiece.id);
                gameState.plans[gameState.turnIndex].push({
                    pieceId: selectedPiece.id,
                    from: [...gameState.selectedSquare],
                    to: [...gameState.selectedSquare],
                    pieceType: selectedPiece.type,
                    contents: getPieceContents(selectedPiece),
                    siegeCancel: true,
                    siegeId: siege.id
                });
                gameState.selectedSquare = null;
                gameState.validMoves = [];
                pieceTooltip.classList.add('hidden');
                hintTextEl.innerText = "Cancel Siege queued for this round.";
                renderBoard();
                return;
            }
            siege.attackers = siege.attackers.filter(entry => entry.pieceId !== selectedPiece.id);
            if (!siege.attackers.length) {
                gameState.sieges = gameState.sieges.filter(entry => entry.id !== siege.id);
            }
            logAction(`🏳️ Player ${gameState.turnIndex + 1} cancelled a siege at ${coordsToNotation(...siege.towerSquare)}.`);
            gameState.selectedSquare = null;
            gameState.validMoves = [];
            pieceTooltip.classList.add('hidden');
            hintTextEl.innerText = "Siege cancelled.";
            renderBoard();
        };

        function queueUnmergePlan(sourcePiece, heldPiece, destination, targetPiece) {
            const currentPlans = gameState.plans[gameState.turnIndex];
            const alreadyPlanned = currentPlans.some(move =>
                move.isUnmerge &&
                move.sourcePieceId === sourcePiece.id &&
                move.heldIndex === heldPiece.heldIndex
            );
            if (alreadyPlanned) return;

            gameState.plans[gameState.turnIndex].push({
                pieceId: `${sourcePiece.id}::unmerge::${heldPiece.heldIndex}`,
                from: heldPiece.from,
                to: destination,
                pieceType: heldPiece.type,
                unitId: heldPiece.unitId,
                contents: [{ ...getPieceContents(sourcePiece)[heldPiece.heldIndex] }],
                isUnmerge: true,
                sourcePieceId: sourcePiece.id,
                heldIndex: heldPiece.heldIndex,
                transfer: Boolean(targetPiece),
                mergeWithPieceId: targetPiece ? targetPiece.id : null
            });
        }

        function handleSquareClick(r, c) {
            if (!canEditPlans()) return;
            pieceTooltip.classList.add('hidden');
            if (gameState.selectedSquare && gameState.validMoves.some(m => m[0] === r && m[1] === c)) {
                handleSquareAction(r, c);
                return;
            }
            const activePlayerId = gameState.turnIndex + 1;
            const clickedPiece = getVisiblePiece(r, c, activePlayerId);
            if (clickedPiece && !isEliminatedPiece(clickedPiece) && clickedPiece.player === activePlayerId) {
                selectBoardPiece(r, c, clickedPiece);
                if (gameState.selectedSquare && (getSiegeForAttacker(clickedPiece.id) || getSiegeAtSquare([r, c]) ||
                    getPieceContents(clickedPiece).some(isPrisoner))) {
                    showPieceTooltip(r, c, boardEl.children[r * gameState.boardSize + c]);
                }
            } else {
                gameState.selectedSquare = null;
                gameState.selectedHeldPiece = null;
                gameState.validMoves = [];
                hintTextEl.innerText = "Click or tap one of your pieces to select it, then an adjacent target square to act.";
                renderBoard();
            }
        }

        function handleSquarePopup(r, c) {
            if (!canEditPlans()) return;
            const piece = gameState.board[r][c];
            if (!piece || isEliminatedPiece(piece) || piece.player !== gameState.turnIndex + 1) return;
            selectBoardPiece(r, c, piece);
            if (!gameState.selectedSquare) return;
            showPieceTooltip(r, c, boardEl.children[r * gameState.boardSize + c]);
        }

        function selectBoardPiece(r, c, clickedPiece) {
            if (gameState.lockedPieceIds.has(clickedPiece.id)) {
                pieceTooltip.classList.add('hidden');
                hintTextEl.innerText = "This piece is already committed to a merge for this turn.";
                gameState.selectedSquare = null;
                gameState.selectedHeldPiece = null;
                gameState.validMoves = [];
                renderBoard();
                return;
            }

            gameState.selectedSquare = [r, c];
            gameState.validMoves = getValidMovesForPiece(r, c);
            gameState.selectedHeldPiece = null;
            hintTextEl.innerText = clickedPiece.type === 'r'
                ? (isPawnRestTurn() && pieceContainsPawn(clickedPiece)
                    ? "Towers are unmovable. On even-numbered rounds, non-pawn units in this stack may still be moved separately."
                    : "Towers (Rooks) are unmovable. Right-click or long-press to choose a movable unit from the stack.")
                : !canMoveWholePiece(clickedPiece)
                ? "Stacks containing Pawns or prisoners cannot move on even rounds. Right-click or long-press to move a non-pawn, non-prisoner unit separately."
                : `Selected ${PLAYERS[clickedPiece.player - 1].name} ${getPieceLabel(clickedPiece.type)} at ${coordsToNotation(r, c)}. Click or tap an adjacent target to act; right-click or long-press for the unit list.`;
            renderBoard();
        }

        function handleSquareAction(r, c) {
            if (!canEditPlans()) return;
            pieceTooltip.classList.add('hidden');

            const activePlayerId = gameState.turnIndex + 1;
            const clickedPiece = getVisiblePiece(r, c, activePlayerId);
            if (!gameState.selectedSquare || !gameState.validMoves.some(m => m[0] === r && m[1] === c)) {
                hintTextEl.innerText = "Click or tap one of your pieces before choosing an adjacent target square.";
                return;
            }

            if (gameState.selectedHeldPiece) {
                const sourcePiece = gameState.board[gameState.selectedHeldPiece.from[0]][gameState.selectedHeldPiece.from[1]];
                if (!sourcePiece || sourcePiece.id !== gameState.selectedHeldPiece.sourceId) {
                    gameState.selectedHeldPiece = null;
                    gameState.selectedSquare = null;
                    gameState.validMoves = [];
                    renderBoard();
                    return;
                }
                const heldUnit = getPieceContents(sourcePiece).find(unit =>
                    unit.id === gameState.selectedHeldPiece.unitId);
                if (!heldUnit || !canMoveHeldUnit(heldUnit)) {
                    hintTextEl.innerText = "Pawns and prisoners cannot be moved, unmerged, or transferred on even-numbered rounds.";
                    return;
                }
                if (getSiegeAtSquare(gameState.selectedHeldPiece.from)) {
                    hintTextEl.innerText = "Defending pieces cannot leave a Tower under siege.";
                    return;
                }
                if (clickedPiece && clickedPiece.player !== activePlayerId && isTowerPiece(clickedPiece)) {
                    hintTextEl.innerText = "A Tower must be attacked by the whole stack containing a Pawn, not an unmerged unit.";
                    return;
                }
                if (clickedPiece && clickedPiece.player === activePlayerId) {
                    gameState.pendingTransfer = {
                        sourcePiece,
                        heldPiece: { ...gameState.selectedHeldPiece },
                        destination: [r, c],
                        targetPiece: clickedPiece
                    };
                    gameState.selectedHeldPiece = null;
                    gameState.selectedSquare = null;
                    gameState.validMoves = [];
                    mergePromptText.innerText = `Transfer this ${getPieceLabel(gameState.pendingTransfer.heldPiece.type)} into the selected piece?`;
                    btnMergeConfirm.innerText = 'Transfer';
                    mergePrompt.classList.remove('hidden');
                    renderBoard();
                    return;
                }

                queueUnmergePlan(sourcePiece, gameState.selectedHeldPiece, [r, c], null);
                gameState.selectedHeldPiece = null;
                gameState.selectedSquare = null;
                gameState.validMoves = [];
                hintTextEl.innerText = "Unmerge move queued.";
                renderBoard();
                return;
            }

            const [fromR, fromC] = gameState.selectedSquare;
            const pieceToMove = gameState.board[fromR][fromC];
            const targetPiece = getVisiblePiece(r, c, activePlayerId);
            const currentPlans = gameState.plans[gameState.turnIndex];
            if (!pieceToMove) {
                gameState.selectedSquare = null;
                gameState.validMoves = [];
                renderBoard();
                return;
            }
            const attackerSiege = getSiegeForAttacker(pieceToMove.id);
            if (attackerSiege &&
                attackerSiege.towerSquare[0] === r &&
                attackerSiege.towerSquare[1] === c) {
                if (getReadySiegeAssault(pieceToMove, [fromR, fromC], [r, c])) {
                    gameState.plans[gameState.turnIndex] = currentPlans.filter(move =>
                        move.prisonerAction || move.pieceId !== pieceToMove.id
                    );
                    gameState.plans[gameState.turnIndex].push({
                        pieceId: pieceToMove.id,
                        from: [fromR, fromC],
                        to: [r, c],
                        pieceType: pieceToMove.type,
                        contents: getPieceContents(pieceToMove),
                        siegeAssault: true,
                        siegeId: attackerSiege.id
                    });
                    gameState.selectedSquare = null;
                    gameState.validMoves = [];
                    hintTextEl.innerText = "Assault queued!";
                    renderBoard();
                    return;
                }
            }

            if (!canMoveWholePiece(pieceToMove)) {
                hintTextEl.innerText = "Stacks containing Pawns or prisoners cannot move, merge, or attack on even rounds, except for a ready siege assault.";
                return;
            }

            if (targetPiece && targetPiece.player !== activePlayerId &&
                isTowerPiece(targetPiece) &&
                !getCombatContents(pieceToMove).some(unit => getUnitType(unit) === 'p')) {
                hintTextEl.innerText = "A Tower can only be attacked by a stack containing a Pawn.";
                return;
            }

            if (targetPiece && targetPiece.player === activePlayerId &&
                !currentPlans.some(p => !p.prisonerAction && p.from[0] === r && p.from[1] === c)) {
                gameState.pendingMerge = {
                    from: [fromR, fromC],
                    to: [r, c],
                    movingPiece: pieceToMove,
                    targetPiece
                };
                mergePromptText.innerText = `Merge ${getPieceLabel(pieceToMove.type)} with ${getPieceLabel(targetPiece.type)}? Both pieces will be committed for this turn.`;
                mergePrompt.classList.remove('hidden');
                gameState.selectedSquare = null;
                gameState.validMoves = [];
                renderBoard();
                return;
            }

            gameState.plans[gameState.turnIndex] = currentPlans.filter(p =>
                p.prisonerAction || !(p.from[0] === fromR && p.from[1] === fromC));
            if (fromR !== r || fromC !== c) {
                gameState.plans[gameState.turnIndex].push({
                    pieceId: pieceToMove.id,
                    from: [fromR, fromC],
                    to: [r, c],
                    pieceType: pieceToMove.type,
                    contents: getPieceContents(pieceToMove)
                });
            }

            gameState.selectedSquare = null;
            gameState.validMoves = [];
            hintTextEl.innerText = `Move queued! You have planned ${gameState.plans[gameState.turnIndex].length} piece move(s).`;
            renderBoard();
        }

        btnClearPlan.addEventListener('click', () => {
            if (!canEditPlans()) return;
            gameState.plans[gameState.turnIndex] = [];
            gameState.lockedPieceIds = new Set();
            gameState.pendingMerge = null;
            gameState.selectedHeldPiece = null;
            gameState.pendingTransfer = null;
            mergePrompt.classList.add('hidden');
            pieceTooltip.classList.add('hidden');
            btnMergeConfirm.innerText = 'Merge';
            gameState.selectedSquare = null;
            gameState.validMoves = [];
            hintTextEl.innerText = "Plans reset for current turn.";
            renderBoard();
        });

        btnSallyOut.addEventListener('click', () => {
            if (!canEditPlans() || !gameState.selectedSquare) return;
            const tower = gameState.board[gameState.selectedSquare[0]][gameState.selectedSquare[1]];
            const siege = tower ? getSiegeAtSquare(gameState.selectedSquare) : null;
            if (!tower || !siege || tower.player !== gameState.turnIndex + 1 ||
                !getCombatContents(tower).some(unit => getUnitType(unit) !== 'r')) {
                return;
            }
            const currentPlans = gameState.plans[gameState.turnIndex];
            if (currentPlans.some(move => move.sallyOut && move.pieceId === tower.id)) return;
            currentPlans.push({
                pieceId: tower.id,
                from: [...gameState.selectedSquare],
                to: [...siege.towerSquare],
                pieceType: tower.type,
                contents: getPieceContents(tower),
                sallyOut: true,
                siegeId: siege.id
            });
            gameState.selectedSquare = null;
            gameState.validMoves = [];
            pieceTooltip.classList.add('hidden');
            hintTextEl.innerText = "Sally Out queued for this round.";
            renderBoard();
        });

        btnMergeConfirm.addEventListener('click', () => {
            if (!canEditPlans()) return;
            if (gameState.pendingTransfer) {
                const { sourcePiece, heldPiece } = gameState.pendingTransfer;
                const unit = getPieceContents(sourcePiece).find(candidate => candidate.id === heldPiece.unitId);
                if (!unit || !canMoveHeldUnit(unit)) {
                    hintTextEl.innerText = "Pawns and prisoners cannot be moved, unmerged, or transferred on even-numbered rounds.";
                    gameState.pendingTransfer = null;
                    mergePrompt.classList.add('hidden');
                    btnMergeConfirm.innerText = 'Merge';
                    renderBoard();
                    return;
                }
                queueUnmergePlan(
                    gameState.pendingTransfer.sourcePiece,
                    gameState.pendingTransfer.heldPiece,
                    gameState.pendingTransfer.destination,
                    gameState.pendingTransfer.targetPiece
                );
                gameState.pendingTransfer = null;
                btnMergeConfirm.innerText = 'Merge';
                mergePrompt.classList.add('hidden');
                hintTextEl.innerText = "Transfer queued.";
                renderBoard();
                return;
            }

            if (!gameState.pendingMerge || gameState.phase !== 'PLANNING') return;

            const { from, to, movingPiece, targetPiece } = gameState.pendingMerge;
            if (!canMoveWholePiece(movingPiece)) {
                hintTextEl.innerText = "Stacks containing Pawns or prisoners cannot move or merge on even rounds.";
                gameState.pendingMerge = null;
                mergePrompt.classList.add('hidden');
                btnMergeConfirm.innerText = 'Merge';
                renderBoard();
                return;
            }
            const currentPlans = gameState.plans[gameState.turnIndex];
            gameState.plans[gameState.turnIndex] = currentPlans.filter(move =>
                move.prisonerAction || move.pieceId !== movingPiece.id && move.pieceId !== targetPiece.id
            );
            gameState.plans[gameState.turnIndex].push({
                pieceId: movingPiece.id,
                from,
                to,
                pieceType: movingPiece.type,
                contents: getPieceContents(movingPiece),
                mergeWithPieceId: targetPiece.id,
                mergeAccepted: true
            });
            gameState.lockedPieceIds.add(movingPiece.id);
            gameState.lockedPieceIds.add(targetPiece.id);
            gameState.pendingMerge = null;
            mergePrompt.classList.add('hidden');
            btnMergeConfirm.innerText = 'Merge';
            hintTextEl.innerText = "Merge queued! Both pieces are committed for this turn.";
            renderBoard();
        });

        btnMergeCancel.addEventListener('click', () => {
            gameState.pendingMerge = null;
            gameState.selectedHeldPiece = null;
            gameState.pendingTransfer = null;
            mergePrompt.classList.add('hidden');
            btnMergeConfirm.innerText = 'Merge';
            gameState.selectedSquare = null;
            gameState.validMoves = [];
            hintTextEl.innerText = "Merge cancelled. Choose another move.";
            renderBoard();
        });

        btnFinishPlan.addEventListener('click', () => {
            if (gameState.multiplayer) {
                Multiplayer.toggleCommit();
                return;
            }
            if (gameState.phase !== 'PLANNING') return;
            pieceTooltip.classList.add('hidden');
            advanceTurn();
        });

        function advanceTurn() {
            gameState.selectedSquare = null;
            gameState.validMoves = [];

            // Find next uneliminated player
            let nextIndex = (gameState.turnIndex + 1) % 4;
            let fullCycleCompleted = false;

            while (gameState.eliminated[nextIndex]) {
                nextIndex = (nextIndex + 1) % 4;
                if (nextIndex === gameState.turnIndex) {
                    fullCycleCompleted = true;
                    break;
                }
            }

            if (nextIndex <= gameState.turnIndex) {
                fullCycleCompleted = true;
            }

            if (fullCycleCompleted) {
                // All active players have planned: start simultaneous resolution phase
                resolveAllMoves();
            } else {
                gameState.turnIndex = nextIndex;
                showPrivacyOverlay();
            }
        }

        btnPrivacyReady.addEventListener('click', () => {
            privacyOverlay.classList.add('hidden');
            gameState.phase = 'PLANNING';
            updatePlayerCards();
            renderBoard();
        });

        // --- SIMULTANEOUS TURN RESOLUTION & COMBAT ENGINE ---
        async function resolveAllMoves() {
            gameState.phase = 'RESOLVING';
            updatePlayerCards();

            logRoundHeader(gameState.round);
            activePlayerDescEl.innerText = 'Resolving prisoner releases and executions before movement...';
            const prisonerActions = resolvePrisonerPlans();
            if (prisonerActions) {
                renderBoard();
                if (gameState.multiplayer) Multiplayer.broadcastResolutionStart([]);
                await wait(1000);
            }
            const hillOccupants = snapshotHillOccupants();
            activePlayerDescEl.innerText = 'Animating all planned movements...';

            // Collect all proposed movements
            const allIntendedMoves = [];
            for (let p = 0; p < 4; p++) {
                if (gameState.eliminated[p]) continue;
                for (const m of gameState.plans[p]) {
                    if (m.prisonerAction) continue;
                    const source = gameState.board[m.from[0]][m.from[1]];
                    if (!source || (m.isUnmerge ? source.id !== m.sourcePieceId : source.id !== m.pieceId)) {
                        logAction(`P${p + 1}'s move from ${coordsToNotation(...m.from)} cancelled: its source no longer exists.`);
                        continue;
                    }
                    allIntendedMoves.push({
                        player: p + 1,
                        pieceId: m.pieceId,
                        from: m.from,
                        to: m.to,
                        pieceType: m.isUnmerge ? m.pieceType : source.type,
                        contents: m.isUnmerge ? m.contents : getPieceContents(source),
                        mergeWithPieceId: m.mergeWithPieceId,
                        mergeAccepted: m.mergeAccepted,
                        isUnmerge: m.isUnmerge,
                        sourcePieceId: m.sourcePieceId,
                        heldIndex: m.heldIndex,
                        unitId: m.unitId,
                        transfer: m.transfer,
                        siegeAssault: m.siegeAssault,
                        siegeId: m.siegeId,
                        sallyOut: m.sallyOut,
                        siegeCancel: m.siegeCancel
                    });
                }
            }

            rejectInvalidTowerAttacks(allIntendedMoves);
            rejectPrisonerMoveConflicts(allIntendedMoves);

            // Remove the selected held unit from its source stack before
            // resolving its destination.
            const unmergeMoves = allIntendedMoves
                .filter(item => item.isUnmerge)
                .sort((a, b) => {
                    if (a.sourcePieceId !== b.sourcePieceId) {
                        return a.sourcePieceId.localeCompare(b.sourcePieceId);
                    }
                    return b.heldIndex - a.heldIndex;
                });

            for (const move of unmergeMoves) {
                if (move.invalid) continue;
                const source = gameState.board[move.from[0]][move.from[1]];
                if (!source || source.id !== move.sourcePieceId) {
                    move.invalid = true;
                    continue;
                }

                const sourceContents = getPieceContents(source).slice();
                const heldIndex = sourceContents.findIndex(unit => unit.id === move.unitId);
                if (heldIndex === -1) {
                    move.invalid = true;
                    continue;
                }
                const [heldUnit] = sourceContents.splice(heldIndex, 1);
                const target = gameState.board[move.to[0]][move.to[1]];
                if (target && target.player !== move.player && isTowerPiece(target)) {
                    move.invalid = true;
                    continue;
                }
                move.pieceType = heldUnit.type;
                move.contents = [{ ...heldUnit, player: move.player }];

                if (sourceContents.length === 0) {
                    gameState.board[move.from[0]][move.from[1]] = null;
                    allIntendedMoves
                        .filter(other => !other.isUnmerge && other.pieceId === source.id)
                        .forEach(other => { other.invalid = true; });
                } else {
                    source.contents = sourceContents;
                    source.type = getMergedPieceType(sourceContents);
                    allIntendedMoves
                        .filter(other => !other.isUnmerge && other.pieceId === source.id)
                        .forEach(other => {
                            other.pieceType = source.type;
                            other.contents = getPieceContents(source);
                        });
                }
            }

            allIntendedMoves
                .filter(move => move.siegeAssault && !move.invalid)
                .forEach(move => {
                    const source = gameState.board[move.from[0]][move.from[1]];
                    if (!source || !getCombatContents(source).some(unit => getUnitType(unit) === 'p')) {
                        move.invalid = true;
                        logAction(`🚫 Player ${move.player}'s assault was cancelled: the catapult stack no longer contains a Pawn.`);
                    }
                });

            registerSiegeStarts(allIntendedMoves);
            if (gameState.multiplayer) Multiplayer.broadcastResolutionStart(allIntendedMoves);
            await animatePlannedMovements(allIntendedMoves);

            // Maps to track target destinations & path swaps
            const destinationMap = {}; // "r_c" => list of move intents

            allIntendedMoves.forEach(m => {
                if (m.invalid || m.siegeStart || m.sallyOut || m.siegeCancel) return;
                const key = `${m.to[0]}_${m.to[1]}`;
                if (!destinationMap[key]) destinationMap[key] = [];
                destinationMap[key].push(m);
            });

            const resolvedPieceIDs = new Set();
            const collisionGroups = [];
            const sallyGroups = createSallyGroups(allIntendedMoves);
            applySiegeCancellations(allIntendedMoves);

            // Detect only two-way opposing interceptions. Same-player exchanges
            // remain ordinary simultaneous movement.
            for (let i = 0; i < allIntendedMoves.length; i++) {
                const m1 = allIntendedMoves[i];
                if (m1.invalid || resolvedPieceIDs.has(m1.pieceId)) continue;

                // Check 2-way swap with any other move
                for (let j = i + 1; j < allIntendedMoves.length; j++) {
                    const m2 = allIntendedMoves[j];
                    if (m2.invalid || resolvedPieceIDs.has(m2.pieceId)) continue;

                    if (m1.from[0] === m2.to[0] && m1.from[1] === m2.to[1] &&
                        m1.to[0] === m2.from[0] && m1.to[1] === m2.from[1]) {
                        if (m1.player === m2.player) continue;
                        
                        collisionGroups.push({
                            type: 'SWAP',
                            squareNotations: [coordsToNotation(...m1.from), coordsToNotation(...m1.to)],
                            candidates: [m1, m2],
                            siegeSwap: [m1, m2].some(move => move.siegeStart)
                                ? {
                                    siegeId: [m1, m2].find(move => move.siegeStart).siegeId,
                                    attackerPieceId: [m1, m2].find(move => move.siegeStart).pieceId,
                                    towerSquare: [...[m1, m2].find(move => move.siegeStart).to]
                                }
                                : null
                        });
                        resolvedPieceIDs.add(m1.pieceId);
                        resolvedPieceIDs.add(m2.pieceId);
                        break;
                    }
                }
            }

            // Target groups are built after interceptions are identified. A swap
            // survivor can therefore be merged into, or fight at, its planned
            // destination in the next resolution stage.
            for (const key in destinationMap) {
                const moves = destinationMap[key].filter(m => !resolvedPieceIDs.has(m.pieceId));
                const [r, c] = key.split('_').map(Number);
                const stationaryOccupant = gameState.board[r][c];
                const interceptionGroups = collisionGroups.filter(group =>
                    group.type === 'SWAP' &&
                    group.candidates.some(candidate =>
                        candidate.to[0] === r && candidate.to[1] === c
                    )
                );

                const interceptionSourceIds = new Set(
                    interceptionGroups.flatMap(group => group.candidates.map(candidate => candidate.pieceId))
                );
                // An unmerge moves only a held unit, so the source stack
                // remainder is still a stationary occupant and must be able
                // to defend against an attack on its original square.
                const occupantIsMoving = stationaryOccupant && allIntendedMoves.some(m =>
                    m.from[0] === r && m.from[1] === c &&
                    !m.invalid && !m.siegeStart && !m.sallyOut && !m.siegeCancel &&
                    !m.isUnmerge &&
                    m.pieceId === stationaryOccupant.id &&
                    !interceptionSourceIds.has(m.pieceId)
                );
                const occupantIsInterceptionCandidate = stationaryOccupant &&
                    interceptionSourceIds.has(stationaryOccupant.id);

                const hasPostInterceptionCandidates = moves.length > 0 &&
                    interceptionGroups.length > 0;
                const hasStationaryCollision = stationaryOccupant &&
                    !occupantIsMoving &&
                    !occupantIsInterceptionCandidate;

                if (moves.length > 1 || hasStationaryCollision || hasPostInterceptionCandidates) {
                    const candidates = [...moves];
                    if (hasStationaryCollision) {
                        candidates.push({
                            player: stationaryOccupant.player,
                            pieceId: stationaryOccupant.id,
                            from: [r, c],
                            to: [r, c],
                            pieceType: stationaryOccupant.type,
                            contents: getPieceContents(stationaryOccupant),
                            isStationary: true
                        });
                    }

                    collisionGroups.push({
                        type: 'TARGET',
                        targetSquare: [r, c],
                        squareNotations: [coordsToNotation(r, c)],
                        candidates,
                        interceptionGroups
                    });

                    candidates.forEach(c => resolvedPieceIDs.add(c.pieceId));
                }
            }
            collisionGroups.push(...sallyGroups);

            // Execute non-conflicting moves simultaneously: capture every source
            // piece before placing destinations so same-player swaps are safe.
            const simpleMoves = allIntendedMoves
                .filter(move => !move.invalid && !move.siegeStart && !move.siegeAssault &&
                    !move.sallyOut && !move.siegeCancel && !resolvedPieceIDs.has(move.pieceId))
                .map(move => ({
                    move,
                    piece: move.isUnmerge
                        ? {
                            id: move.pieceId,
                            player: move.player,
                            type: move.pieceType,
                            contents: move.contents
                        }
                        : gameState.board[move.from[0]][move.from[1]]
                }))
                .filter(entry => entry.piece &&
                    (entry.move.isUnmerge || entry.piece.id === entry.move.pieceId));

            simpleMoves.forEach(({ move }) => {
                if (!move.isUnmerge) {
                    gameState.board[move.from[0]][move.from[1]] = null;
                }
            });
            simpleMoves.forEach(({ move, piece }) => {
                gameState.board[move.to[0]][move.to[1]] = piece;
                if (getBiome(...move.from) === 'forest' || getBiome(...move.to) === 'forest') {
                    logAction(`<b>Player ${move.player} (${PLAYERS[move.player - 1].name})</b> moved through a forest.`);
                } else {
                    logAction(`<b>Player ${move.player} (${PLAYERS[move.player - 1].name})</b> moved ${getPieceLabel(move.pieceType)}: ${coordsToNotation(...move.from)} ➔ ${coordsToNotation(...move.to)}`);
                }
            });

            renderBoard();

            // Process Conflict Battles sequentially with animated modal overlays
            for (const group of collisionGroups) {
                if (group.type === 'TARGET' && group.interceptionGroups) {
                    group.interceptionGroups.forEach(interception => {
                        if (interception.survivor &&
                            interception.survivor.to[0] === group.targetSquare[0] &&
                            interception.survivor.to[1] === group.targetSquare[1]) {
                            group.candidates.push(interception.survivor);
                        }
                    });
                }
                await processCollisionGroup(group);
                renderBoard();
            }

            // Reset planned moves for next turn
            gameState.plans = [[], [], [], []];
            applySiegeRoundProgress();
            updateHillHeld(hillOccupants, allIntendedMoves);
            gameState.round++;
            updateRoundDisplay();
            processRetreatsAtRoundStart();
            const { winners, draw } = resolveObjectiveRound();
            renderBoard();

            // Count active players remaining
            const activePlayers = gameState.eliminated.map((elim, idx) => elim ? null : idx).filter(v => v !== null);

            if (winners.length || draw) {
                gameState.phase = 'GAME_OVER';
                const winnerNames = winners.map(index => PLAYERS[index].name).join(' & ');
                document.getElementById('gameover-title').innerText = draw ? 'Draw!' :
                    `${winnerNames} ${winners.length === 1 ? 'Wins' : 'Win'}!`;
                document.getElementById('gameover-desc').innerText = draw ? 'All players reached -10 points and were defeated.' :
                    winners.map(index => `${PLAYERS[index].name}: ${gameState.scores[index]} points`).join(' · ');
                document.getElementById('gameover-modal').classList.remove('hidden');
                updatePlayerCards();
                renderBoard();
                if (gameState.multiplayer) Multiplayer.onGameOver();
            } else if (gameState.multiplayer) {
                Multiplayer.beginNextRound();
            } else {
                gameState.turnIndex = activePlayers[0];
                showPrivacyOverlay();
            }
        }

        function processCollisionGroup(group) {
            return new Promise((resolve) => {
                if (group.type === 'SALLY') {
                    processSallyBattle(group).then(resolve);
                    return;
                }
                if (group.type === 'TARGET') {
                    const candidatesByPlayer = {};
                    group.candidates.forEach(candidate => {
                        if (!candidatesByPlayer[candidate.player]) {
                            candidatesByPlayer[candidate.player] = [];
                        }
                        candidatesByPlayer[candidate.player].push(candidate);
                    });

                    const mergedCandidates = Object.values(candidatesByPlayer).map(candidates => {
                        const contents = candidates.flatMap(candidate => candidate.contents || [{
                            id: `${candidate.pieceId}::unit::0`,
                            player: candidate.player,
                            type: candidate.pieceType,
                            name: `${PLAYER_CODES[candidate.player - 1]}${candidate.pieceType}1`
                        }]);
                        const [targetR, targetC] = group.targetSquare;

                        candidates.forEach(candidate => {
                            const [fromR, fromC] = candidate.from;
                            if (!candidate.isUnmerge &&
                                gameState.board[fromR][fromC] &&
                                gameState.board[fromR][fromC].id === candidate.pieceId) {
                                gameState.board[fromR][fromC] = null;
                            }
                        });

                        return {
                            player: candidates[0].player,
                            pieceId: candidates[0].pieceId,
                            from: [targetR, targetC],
                            to: [targetR, targetC],
                            pieceType: getMergedPieceType(contents),
                            contents,
                            isStationary: true,
                            terrainBonus: Math.max(...candidates.map(candidate =>
                                getDefenderTerrainBonus(candidate, group.targetSquare)))
                        };
                    });

                    const [targetR, targetC] = group.targetSquare;
                    if (mergedCandidates.length === 1) {
                        const survivor = mergedCandidates[0];
                        gameState.board[targetR][targetC] = {
                            id: survivor.pieceId,
                            player: survivor.player,
                            type: survivor.pieceType,
                            contents: survivor.contents
                        };
                        logAction(getBiome(targetR, targetC) === 'forest'
                            ? `🔗 <b>MERGE</b> in a forest for ${PLAYERS[survivor.player - 1].name}.`
                            : `🔗 <b>MERGE</b> at ${coordsToNotation(targetR, targetC)}: ` +
                                `${survivor.contents.length} unit(s) consolidated for ` +
                                `${PLAYERS[survivor.player - 1].name}.`);
                        resolve();
                        return;
                    }

                    group.candidates = mergedCandidates;
                    group.sourcesCleared = true;
                }

                if (group.type === 'MERGE') {
                    const [targetR, targetC] = group.targetSquare;
                    const mergedContents = group.candidates.flatMap(candidate =>
                        candidate.contents || [{
                            id: `${candidate.pieceId}::unit::0`,
                            player: candidate.player,
                            type: candidate.pieceType,
                            name: `${PLAYER_CODES[candidate.player - 1]}${candidate.pieceType}1`
                        }]
                    );
                    const mergedType = getMergedPieceType(mergedContents);
                    const mergedPlayer = group.candidates[0].player;

                    group.candidates.forEach(candidate => {
                        const [fromR, fromC] = candidate.from;
                        if (gameState.board[fromR][fromC] && gameState.board[fromR][fromC].id === candidate.pieceId) {
                            gameState.board[fromR][fromC] = null;
                        }
                    });

                    gameState.board[targetR][targetC] = {
                        id: group.candidates[0].pieceId,
                        player: mergedPlayer,
                        type: mergedType,
                        contents: mergedContents
                    };

                    const sourceLabels = group.candidates.map(candidate =>
                        `x${(candidate.contents || [candidate.pieceType]).length} ${getPieceLabel(candidate.pieceType)}`
                    ).join(' + ');
                    logAction(getBiome(targetR, targetC) === 'forest'
                        ? `🔗 <b>MERGE</b> in a forest for ${PLAYERS[mergedPlayer - 1].name}.`
                        : `🔗 <b>MERGE</b> at ${coordsToNotation(targetR, targetC)}: ${sourceLabels} became a <b>${getPieceLabel(mergedType)} x${mergedContents.length}</b> for ${PLAYERS[mergedPlayer - 1].name}.`);
                    resolve();
                    return;
                }

                clashOverlay.classList.remove('hidden');
                setBattleTarget(group);
                renderBattleCandidates(group);
                battleRollsEl.innerHTML = '';
                const activeCandidateData = getBattleCandidateData(group);
                const captureOnly = activeCandidateData.filter(entry => entry.combatContents.length).length === 1 &&
                    activeCandidateData.some(entry => !entry.combatContents.length);
                clashResult.innerText = "Ready";
                clashResult.style.color = "#f59e0b";
                btnStartBattle.classList.remove('hidden');
                btnProceedBattle.classList.add('hidden');

                btnStartBattle.onclick = () => {
                    btnStartBattle.onclick = null;
                    btnStartBattle.classList.add('hidden');
                    clashResult.innerText = "Fighting...";

                    setTimeout(() => {
                        const roll = captureOnly ? 0 : Math.random();
                        let accumulatedProbability = 0;
                        let survivorIdx = activeCandidateData.length - 1;
                        for (let idx = 0; idx < activeCandidateData.length; idx++) {
                            accumulatedProbability += activeCandidateData[idx].probability;
                            if (activeCandidateData[idx].probability > 0 && roll < accumulatedProbability) {
                                survivorIdx = idx;
                                break;
                            }
                        }
                        const survivor = group.candidates[survivorIdx];
                        const battleRolls = [
                            captureOnly ? `Unopposed prisoner capture by P${survivor.player}; no battle roll.` :
                                `Winner roll ${(roll * 100).toFixed(2)}% selected P${survivor.player} ${PLAYERS[survivor.player - 1].name}`
                        ];
                        group.survivor = survivor;
                        const candidateDataById = new Map(activeCandidateData.map(entry => [entry.candidate.pieceId, entry]));
                        const winnerData = candidateDataById.get(survivor.pieceId);
                        const towerDefender = group.candidates.some(candidate =>
                            candidate.isStationary &&
                            getPieceContents(candidate).some(unit => getUnitType(unit) === 'r') &&
                            getCombatContents(candidate).some(unit => getUnitType(unit) !== 'r')
                        );
                        const towerSiege = group.candidates.some(candidate =>
                            candidate.isStationary &&
                            getPieceContents(candidate).some(unit => getUnitType(unit) === 'r')
                        );
                        const candidateResults = new Map();
                        const winnerResult = captureOnly ? {
                            survivors: getPieceContents(survivor), casualties: [], captured: []
                        } : resolveCandidateCasualties(
                            survivor,
                            winnerData ? winnerData.probability : 0,
                            false,
                            towerDefender && !getPieceContents(survivor).some(unit => getUnitType(unit) === 'r'),
                            battleRolls
                        );
                        candidateResults.set(survivor.pieceId, winnerResult);
                        const retreatEntries = [];
                        const capturedTowers = [];

                        group.candidates.forEach((cand, idx) => {
                            const [fr, fc] = cand.from;
                            if (!group.sourcesCleared && !cand.isStationary &&
                                gameState.board[fr][fc] &&
                                gameState.board[fr][fc].id === cand.pieceId) {
                                gameState.board[fr][fc] = null;
                            }

                            if (idx === survivorIdx) {
                                const survivorContents = [...winnerResult.survivors];
                                const [tr, tc] = cand.to;
                                const conqueredTower = group.siegeSwap &&
                                    cand.pieceId === group.siegeSwap.attackerPieceId &&
                                    tr === group.siegeSwap.towerSquare[0] &&
                                    tc === group.siegeSwap.towerSquare[1]
                                    ? gameState.board[tr][tc]
                                    : null;
                                if (conqueredTower && isTowerPiece(conqueredTower)) {
                                    const capturedTowers = getPieceContents(conqueredTower)
                                        .filter(unit => getUnitType(unit) === 'r')
                                        .map(unit => ({
                                            ...unit,
                                            player: cand.player,
                                            id: `${cand.pieceId}::captured::${Date.now()}::${Math.random()}`,
                                            name: getNextUnitName(cand.player, 'r')
                                        }));
                                    survivorContents.push(...capturedTowers);
                                }
                                if (survivorContents.length) {
                                    gameState.board[tr][tc] = {
                                        id: cand.pieceId,
                                        player: cand.player,
                                        type: getMergedPieceType(survivorContents),
                                        contents: survivorContents
                                    };
                                }
                                return;
                            }

                            const candidateData = candidateDataById.get(cand.pieceId);
                            const isSiege = towerSiege;
                            const result = resolveCandidateCasualties(
                                cand,
                                candidateData ? candidateData.probability : 0,
                                true,
                                isSiege,
                                battleRolls
                            );
                            candidateResults.set(cand.pieceId, result);
                            const retained = [];
                            result.survivors.forEach(unit => {
                                if (isSiege && getUnitType(unit) === 'r') {
                                    const captured = {
                                        ...unit,
                                        player: survivor.player,
                                        id: `${cand.pieceId}::captured::${Date.now()}::${Math.random()}`,
                                        name: getNextUnitName(survivor.player, 'r')
                                    };
                                    capturedTowers.push(captured);
                                } else {
                                    retained.push(unit);
                                }
                            });
                            if (retained.length) {
                                retreatEntries.push({ player: cand.player, contents: retained });
                            }
                        });

                        const destination = survivor.to;
                        if (capturedTowers.length) {
                            const boardPiece = gameState.board[destination[0]][destination[1]];
                            if (boardPiece && boardPiece.player === survivor.player) {
                                boardPiece.contents.push(...capturedTowers);
                                boardPiece.type = getMergedPieceType(boardPiece.contents);
                            } else if (!boardPiece) {
                                gameState.board[destination[0]][destination[1]] = {
                                    id: `${survivor.pieceId}::captured-tower`,
                                    player: survivor.player,
                                    type: 'r',
                                    contents: capturedTowers
                                };
                            }
                        }
                        retreatEntries.forEach(entry => queueRetreat(entry.player, entry.contents, destination));
                        recordDeadPieces(gameState, [...candidateResults.values()].flatMap(result => result.casualties));
                        const capturedUnits = [...candidateResults.values()].flatMap(result => result.captured);
                        beginCaptureChoices(survivor.player, capturedUnits, destination);
                        renderCaptureChoices();
                        renderRetreatTable();
                        const retreatedUnitIds = new Set(
                            retreatEntries.flatMap(entry => entry.contents.map(unit => unit.id))
                        );
                        renderBattleCandidates(group, candidateResults, retreatedUnitIds);

                        const survivorPlayer = PLAYERS[survivor.player - 1];
                        const retreatCount = retreatEntries.reduce((n, entry) => n + entry.contents.length, 0);
                        const casualtyCount = [...candidateResults.values()]
                            .reduce((count, result) => count + result.casualties.length, 0);
                        clashResult.innerText = `${survivorPlayer.name} wins · 💀${casualtyCount} · ⛓${capturedUnits.length} · ↩️${retreatCount}`;
                        clashResult.style.color = survivorPlayer.color;
                        renderBattleRolls(battleRolls);

                        const candDesc = group.candidates.map(c =>
                            `P${c.player} ${getPieceLabel(c.pieceType)}`
                        ).join(' vs ');
                        logAction(`⚔️ <b>COLLISION RESULT</b> (${candDesc}): <b>P${survivor.player} (${survivorPlayer.name})</b> survived · 💀 ${casualtyCount} casualties · ⛓ ${capturedUnits.length} captured · ↩️ ${retreatEntries.reduce((n, entry) => n + entry.contents.length, 0)} retreating.`);
                        btnProceedBattle.classList.remove('hidden');
                    }, captureOnly ? 0 : 1000);
                };

                btnProceedBattle.onclick = () => {
                    if (gameState.pendingCapture) return;
                    if (group.type === 'SWAP' && group.survivor) {
                        const winner = group.survivor;
                        const piece = gameState.board[winner.to[0]][winner.to[1]];
                        group.survivor = piece && piece.player === winner.player ? {
                            ...winner,
                            pieceId: piece.id,
                            pieceType: piece.type,
                            contents: getPieceContents(piece)
                        } : null;
                    }
                    clashOverlay.classList.add('hidden');
                    clearBattleTarget();
                    battleCandidatesEl.innerHTML = '';
                    battleRollsEl.innerHTML = '';
                    btnStartBattle.onclick = null;
                    btnProceedBattle.onclick = null;
                    resolve();
                };
                if (captureOnly) btnStartBattle.onclick();
            });
        }

        function processSallyBattle(group) {
            return new Promise((resolve) => {
                const tower = gameState.board[group.targetSquare[0]][group.targetSquare[1]];
                const hasAttacker = group.candidates.some(candidate => {
                    if (!candidate.isSallyAttacker) return false;
                    const piece = gameState.board[candidate.from[0]][candidate.from[1]];
                    return piece && piece.id === candidate.pieceId;
                });
                if (!tower || !isTowerPiece(tower) || !hasAttacker) {
                    resolve();
                    return;
                }
                const activeCandidateData = getBattleCandidateData(group);
                const captureOnly = activeCandidateData.filter(entry => entry.combatContents.length).length === 1 &&
                    activeCandidateData.some(entry => !entry.combatContents.length);
                clashOverlay.classList.remove('hidden');
                setBattleTarget(group);
                renderBattleCandidates(group);
                battleRollsEl.innerHTML = '';
                clashResult.innerText = "Ready";
                clashResult.style.color = "#f59e0b";
                btnStartBattle.classList.remove('hidden');
                btnProceedBattle.classList.add('hidden');

                btnStartBattle.onclick = () => {
                    btnStartBattle.onclick = null;
                    btnStartBattle.classList.add('hidden');
                    clashResult.innerText = "Fighting...";
                    setTimeout(() => {
                        const roll = captureOnly ? 0 : Math.random();
                        let accumulatedProbability = 0;
                        let survivorIdx = activeCandidateData.length - 1;
                        for (let idx = 0; idx < activeCandidateData.length; idx++) {
                            accumulatedProbability += activeCandidateData[idx].probability;
                            if (activeCandidateData[idx].probability > 0 && roll < accumulatedProbability) {
                                survivorIdx = idx;
                                break;
                            }
                        }

                        const survivor = group.candidates[survivorIdx];
                        const candidateDataById = new Map(
                            activeCandidateData.map(entry => [entry.candidate.pieceId, entry])
                        );
                        const battleRolls = [
                            captureOnly ? `Unopposed prisoner capture by P${survivor.player}; no battle roll.` :
                                `Winner roll ${(roll * 100).toFixed(2)}% selected P${survivor.player} ${PLAYERS[survivor.player - 1].name}`
                        ];
                        const candidateResults = new Map();
                        const winnerData = candidateDataById.get(survivor.pieceId);
                        candidateResults.set(survivor.pieceId, captureOnly ? {
                            survivors: getPieceContents(survivor), casualties: [], captured: []
                        } : resolveCandidateCasualties(
                            survivor,
                            winnerData ? winnerData.probability : 0,
                            false,
                            false,
                            battleRolls
                        ));

                        group.candidates.forEach((candidate, index) => {
                            if (index === survivorIdx) return;
                            const candidateData = candidateDataById.get(candidate.pieceId);
                            candidateResults.set(candidate.pieceId, resolveCandidateCasualties(
                                candidate,
                                candidateData ? candidateData.probability : 0,
                                true,
                                false,
                                battleRolls
                            ));
                        });

                        const defender = group.candidates.find(candidate => candidate.isSallyDefender);
                        const towerUnits = tower
                            ? getPieceContents(tower).filter(unit => getUnitType(unit) === 'r')
                            : [];
                        const defenderResult = defender && candidateResults.get(defender.pieceId);
                        if (tower && defenderResult) {
                            tower.contents = [...towerUnits, ...defenderResult.survivors];
                            tower.type = getMergedPieceType(tower.contents);
                        }

                        const retreatEntries = [];
                        group.candidates
                            .filter(candidate => !candidate.isSallyDefender && candidate !== survivor)
                            .forEach(candidate => {
                                const result = candidateResults.get(candidate.pieceId);
                                const source = gameState.board[candidate.from[0]][candidate.from[1]];
                                if (source && source.id === candidate.pieceId) {
                                    gameState.board[candidate.from[0]][candidate.from[1]] = null;
                                }
                                if (result && result.survivors.length) {
                                    retreatEntries.push({
                                        player: candidate.player,
                                        contents: result.survivors
                                    });
                                }
                            });

                        if (survivor.isSallyAttacker) {
                            const result = candidateResults.get(survivor.pieceId);
                            const source = gameState.board[survivor.from[0]][survivor.from[1]];
                            if (source && source.id === survivor.pieceId) {
                                if (result.survivors.length) {
                                    source.contents = result.survivors;
                                    source.type = getMergedPieceType(source.contents);
                                } else {
                                    gameState.board[survivor.from[0]][survivor.from[1]] = null;
                                }
                            }
                        } else {
                            const result = candidateResults.get(survivor.pieceId);
                            if (tower && defender) {
                                tower.contents = [...towerUnits, ...(result ? result.survivors : [])];
                                tower.type = getMergedPieceType(tower.contents);
                            }
                        }

                        retreatEntries.forEach(entry => queueRetreat(entry.player, entry.contents, group.targetSquare));
                        recordDeadPieces(gameState, [...candidateResults.values()].flatMap(result => result.casualties));
                        const capturedUnits = [...candidateResults.values()].flatMap(result => result.captured);
                        beginCaptureChoices(survivor.player, capturedUnits,
                            survivor.isSallyAttacker ? survivor.from : group.targetSquare);
                        renderCaptureChoices();
                        renderBattleCandidates(group, candidateResults);
                        const casualtyCount = [...candidateResults.values()]
                            .reduce((count, result) => count + result.casualties.length, 0);
                        const winnerPlayer = PLAYERS[survivor.player - 1];
                        clashResult.innerText = `${winnerPlayer.name} wins Sally Out · 💀${casualtyCount} · ⛓${capturedUnits.length}`;
                        clashResult.style.color = winnerPlayer.color;
                        renderBattleRolls(battleRolls);
                        logAction(`⚔️ <b>SALLY OUT</b> at ${coordsToNotation(...group.targetSquare)}: ` +
                            `<b>P${survivor.player} (${winnerPlayer.name})</b> won · 💀 ${casualtyCount} casualties.`);
                        btnProceedBattle.classList.remove('hidden');
                    }, captureOnly ? 0 : 1000);
                };

                btnProceedBattle.onclick = () => {
                    if (gameState.pendingCapture) return;
                    clashOverlay.classList.add('hidden');
                    clearBattleTarget();
                    battleCandidatesEl.innerHTML = '';
                    battleRollsEl.innerHTML = '';
                    btnStartBattle.onclick = null;
                    btnProceedBattle.onclick = null;
                    syncSieges();
                    resolve();
                };
                if (captureOnly) btnStartBattle.onclick();
            });
        }

        // Modal triggers
        btnRules.addEventListener('click', () => {
            document.getElementById('rules-modal').classList.remove('hidden');
        });
        btnEditNames.addEventListener('click', showPlayerNamesEditor);
        document.getElementById('btn-cancel-names').addEventListener('click', () => {
            playerNamesModal.classList.add('hidden');
        });
        document.getElementById('btn-save-names').addEventListener('click', savePlayerNames);
        document.getElementById('btn-close-rules').addEventListener('click', () => {
            document.getElementById('rules-modal').classList.add('hidden');
        });
        document.getElementById('btn-ack-rules').addEventListener('click', () => {
            document.getElementById('rules-modal').classList.add('hidden');
        });

        const requestNewGame = () => gameState.multiplayer ? Multiplayer.onNewGameRequested() : showPlayerSelection();
        btnRestart.addEventListener('click', requestNewGame);
        document.getElementById('btn-gameover-restart').addEventListener('click', requestNewGame);
        document.querySelectorAll('.custom-piece-option').forEach(button => {
            button.addEventListener('click', () => {
                gameState.customSetupType = button.dataset.pieceType;
                document.querySelectorAll('.custom-piece-option').forEach(option => option.classList.remove('selected'));
                button.classList.add('selected');
            });
        });
        btnResetCustomSetup.addEventListener('click', () => {
            gameState.customSetupBoard = createEmptySetupBoard();
            gameState.nextUnitSequence = [1, 1, 1, 1];
            customSetupStatusEl.innerText = 'Placement reset. Every selected player needs exactly one King, at least one Queen and one Tower.';
            renderCustomSetupBoard();
        });
        btnSaveCustomSetup.addEventListener('click', saveCustomSetup);
        btnLoadCustomSetup.addEventListener('click', () => {
            renderSavedSetups(customSavedSetupListEl, true);
            customSavedSetupListEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        btnConfirmCustomSetup.addEventListener('click', confirmCustomSetup);
        btnStartSelectedGame.addEventListener('click', () => {
            const selectedPlayers = getSelectedHotseatPlayers();
            if (selectedPlayers.filter(Boolean).length < 2) {
                playerSelectionError.innerText = 'Select at least two players to start.';
                return;
            }
            document.querySelectorAll('.player-name-input').forEach(input => {
                const index = Number(input.dataset.playerName) - 1;
                PLAYERS[index].name = cleanPlayerName(input.value, index);
            });
            gameState.progressionMode = document.querySelector('input[name="progression-mode"]:checked').value;
            gameState.boardSize = Number(document.getElementById('board-size').value);
            const setupMode = document.querySelector('input[name="setup-mode"]:checked').value;
            if (setupMode === 'custom') {
                playerSelectionModal.classList.add('hidden');
                showCustomSetup(selectedPlayers);
                return;
            }
            const seed = document.getElementById('map-seed').value.trim();
            if (!hotseatMapPreview || hotseatMapPreview.signature !== getHotseatMapSignature(seed)) {
                playerSelectionError.innerText = 'Generate a map preview before starting.';
                updateHotseatMapControls();
                return;
            }
            startNewGame(selectedPlayers, null, gameState.boardSize, hotseatMapPreview.seed);
        });
        document.getElementById('btn-generate-map').addEventListener('click', generateHotseatMapPreview);
        document.getElementById('btn-custom-generate-map').addEventListener('click', generateCustomMapPreview);
        document.getElementById('custom-map-seed').addEventListener('input', () => {
            document.getElementById('map-seed').value = document.getElementById('custom-map-seed').value;
            if (Multiplayer.isEditingSetup()) {
                document.getElementById('mp-map-seed').value = document.getElementById('custom-map-seed').value;
            }
            invalidateCustomMapPreview();
        });
        const invalidateHotseatPreview = () => {
            hotseatMapPreview = null;
            document.getElementById('map-preview').innerHTML = '';
            document.getElementById('map-preview-status').innerText =
                'Settings changed. Generate a new map preview before starting.';
            updateHotseatMapControls();
        };
        document.querySelectorAll(
            '#player-selection-list input[type="checkbox"], #board-size, #map-seed, ' +
            'input[name="progression-mode"]'
        ).forEach(input => input.addEventListener(input.id === 'map-seed' ? 'input' : 'change',
            invalidateHotseatPreview));
        document.querySelectorAll('input[name="setup-mode"]').forEach(input =>
            input.addEventListener('change', updateHotseatMapControls));

        // Start game on load
        window.onload = function() {
            Multiplayer.showMainMenu();
        };
