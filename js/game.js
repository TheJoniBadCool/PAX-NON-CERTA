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
        const playerSelectionModal = document.getElementById('player-selection-modal');
        const playerSelectionError = document.getElementById('player-selection-error');
        const btnStartSelectedGame = document.getElementById('btn-start-selected-game');
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
        const battleLogEl = document.getElementById('battle-log');
        const roundTagEl = document.getElementById('round-tag');
        const dayClockEl = document.getElementById('day-clock');
        const dayClockHandEl = document.getElementById('day-clock-hand');
        const dayClockLabelEl = document.getElementById('day-clock-label');
        const hintTextEl = document.getElementById('hint-text');
        const retreatTableEl = document.getElementById('retreat-table');
        let battleTargetSquare = null;
        bindBoardInteractions();

        function updateBattleConnector() {
            if (!battleTargetSquare || clashOverlay.classList.contains('hidden')) return;

            const boardRect = boardEl.parentElement.getBoundingClientRect();
            const [targetRow, targetColumn] = battleTargetSquare;
            const targetX = ((targetColumn + 0.5) / 16) * 100;
            const targetY = ((targetRow + 0.5) / 16) * 100;
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
                        !getPieceContents(tower).some(unit => getUnitType(unit) !== 'r')) {
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

        function randomLevel() {
            return gameState.progressionMode === 'random' ? 1 + Math.floor(Math.random() * 3) : 0;
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
                if (move.siegeStart || move.sallyOut || move.siegeCancel) continue;
                const sourcePiece = move.isUnmerge
                    ? { player: move.player, type: move.pieceType }
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

        function startNewGame(selectedPlayers, customBoard = null) {
            gameState.activePlayers = selectedPlayers;
            initBoard(customBoard);
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
            gameState.sieges = [];
            gameState.nextUnitSequence = [1, 1, 1, 1];
            btnMergeConfirm.innerText = 'Merge';

            battleLogEl.innerHTML = `
                <div class="log-item" style="color: var(--text-muted); text-align: center;">
                    Match Initialized! Secretly plan multi-piece moves.
                </div>
            `;

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
            gameState.customSetupBoard = setupBoard || createEmptySetupBoard();
            gameState.nextUnitSequence = [1, 1, 1, 1];
            gameState.customSetupPlayer = selectedPlayers.findIndex(Boolean);
            gameState.customSetupType = 'p';
            customSetupStatusEl.innerText = 'Select a player and piece, then click or tap a board square to place it. Every selected player needs exactly one King.';
            renderCustomSetupPlayers();
            renderCustomSetupBoard();
            playerSelectionModal.classList.add('hidden');
            customSetupModal.classList.remove('hidden');
            renderAllSavedSetups();
        }

        function confirmCustomSetup() {
            const missingKing = gameState.activePlayers.findIndex((isSelected, index) =>
                isSelected && !gameState.customSetupBoard.flat().some(piece =>
                    piece && piece.player === index + 1 && getPieceContents(piece).some(unit => unit.type === 'k')));
            if (missingKing !== -1) {
                customSetupStatusEl.innerText = `${PLAYERS[missingKing].name} must have exactly one King.`;
                return;
            }
            customSetupModal.classList.add('hidden');
            startNewGame(gameState.activePlayers, gameState.customSetupBoard);
        }

        function showPlayerSelection() {
            playerSelectionError.innerText = '';
            customSetupModal.classList.add('hidden');
            playerSelectionModal.classList.remove('hidden');
            renderAllSavedSetups();
        }

        function showPieceTooltip(r, c, square) {
            const piece = gameState.board[r][c];
            if (!piece) return;
            if (isEliminatedPiece(piece) || piece.player !== gameState.turnIndex + 1 || gameState.phase !== 'PLANNING') {
                pieceTooltip.classList.add('hidden');
                hintTextEl.innerText = "You can only unmerge or transfer your own pieces during your turn.";
                return;
            }

            const pendingIndices = getPendingHeldIndices(piece, gameState.plans[gameState.turnIndex]);
            const contents = getPieceContents(piece);
            pieceTooltip.innerHTML = contents
                .map((unit, index) => `<span class="held-piece-entry">
                    <button class="held-piece-button ${PLAYERS[piece.player - 1].class}${pendingIndices.has(index) ? ' pending' : ''}${unit.type === 'r' ? ' disabled' : ''}" data-held-index="${index}" title="${getUnitName(unit)}: ${unit.type === 'r' ? 'Tower' : 'Unmerge'}" aria-label="${getUnitName(unit)}">${PIECE_SVGS[unit.type]}</button>
                    <span class="unit-levels" title="${getUnitName(unit)} · Experience ${getUnitLevel(unit, 'experience')} · Armour ${getUnitLevel(unit, 'armour')}">
                        <span class="experience-level">${['0', 'I', 'II', 'III'][getUnitLevel(unit, 'experience')]}</span> 🛡️${getUnitLevel(unit, 'armour')}
                    </span>
                    ${contents.some(other => other.type === 'r') && getUnitLevel(unit, 'armour') < 3 ? `<button class="armor-upgrade-button" data-armour-index="${index}" title="Upgrade armour">🛡️</button>` : ''}
                </span>`)
                .join('');
            if (isPawnRestTurn()) {
                pieceTooltip.querySelectorAll('.held-piece-button').forEach((button, index) => {
                    if (!canMoveHeldUnit(contents[index])) {
                        button.disabled = true;
                        button.title = `${getUnitName(contents[index])}: Pawns cannot move on even-numbered rounds`;
                    }
                });
            }
            pieceTooltip.classList.remove('hidden');
            pieceTooltip.style.left = `${Math.min(square.offsetLeft + square.offsetWidth, boardEl.clientWidth - pieceTooltip.offsetWidth - 8)}px`;
            pieceTooltip.style.top = `${Math.max(8, square.offsetTop - pieceTooltip.offsetHeight - 4)}px`;

            pieceTooltip.querySelectorAll('.held-piece-button').forEach(button => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const heldIndex = Number(button.dataset.heldIndex);
                    const heldUnit = getPieceContents(piece)[heldIndex];
                    if (heldUnit.type === 'r' || !canMoveHeldUnit(heldUnit)) {
                        hintTextEl.innerText = heldUnit.type === 'r'
                            ? "Towers are unmovable and cannot be unmerged or transferred."
                            : "Pawns cannot be moved, unmerged, or transferred on even-numbered rounds.";
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
                    gameState.validMoves = getAdjacentMoves(r, c);
                    hintTextEl.innerText = `Selected a held ${getPieceLabel(gameState.selectedHeldPiece.type)}. Pick an adjacent square or your piece to transfer it.`;
                    renderBoard();
                });

            });
            pieceTooltip.querySelectorAll('.armor-upgrade-button').forEach(button => {
                button.addEventListener('click', (event) => {
                    event.stopPropagation();
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
            if (gameState.phase !== 'PLANNING' || !gameState.selectedSquare) return;
            const selectedPiece = gameState.board[gameState.selectedSquare[0]][gameState.selectedSquare[1]];
            const siege = selectedPiece ? getSiegeForAttacker(selectedPiece.id) : null;
            const attacker = siege && siege.attackers.find(entry => entry.pieceId === selectedPiece.id);
            if (!siege || !attacker || attacker.player !== gameState.turnIndex + 1) return;
            if (gameState.multiplayer) {
                // Planned like any other action: the catapult stack does nothing else this round.
                const plans = gameState.plans[gameState.turnIndex];
                gameState.plans[gameState.turnIndex] = plans.filter(move => move.pieceId !== selectedPiece.id);
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
                contents: [{
                    id: heldPiece.unitId,
                    player: sourcePiece.player,
                    type: heldPiece.type,
                    name: heldPiece.name
                }],
                isUnmerge: true,
                sourcePieceId: sourcePiece.id,
                heldIndex: heldPiece.heldIndex,
                transfer: Boolean(targetPiece),
                mergeWithPieceId: targetPiece ? targetPiece.id : null
            });
        }

        function handleSquareClick(r, c) {
            if (gameState.phase !== 'PLANNING') return;
            pieceTooltip.classList.add('hidden');
            if (gameState.selectedSquare && gameState.validMoves.some(m => m[0] === r && m[1] === c)) {
                handleSquareAction(r, c);
                return;
            }
            const activePlayerId = gameState.turnIndex + 1;
            const clickedPiece = gameState.board[r][c];
            if (clickedPiece && !isEliminatedPiece(clickedPiece) && clickedPiece.player === activePlayerId) {
                selectBoardPiece(r, c, clickedPiece);
            } else {
                gameState.selectedSquare = null;
                gameState.selectedHeldPiece = null;
                gameState.validMoves = [];
                hintTextEl.innerText = "Click or tap one of your pieces to select it, then an adjacent target square to act.";
                renderBoard();
            }
        }

        function handleSquarePopup(r, c) {
            if (gameState.phase !== 'PLANNING') return;
            const piece = gameState.board[r][c];
            if (!piece || isEliminatedPiece(piece) || piece.player !== gameState.turnIndex + 1) return;
            selectBoardPiece(r, c, piece);
            if (!gameState.selectedSquare) return;
            showPieceTooltip(r, c, boardEl.children[r * 16 + c]);
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
                ? "Pawn-containing stacks cannot move on even-numbered rounds. Right-click or long-press to move a non-pawn unit separately."
                : `Selected ${PLAYERS[clickedPiece.player - 1].name} ${getPieceLabel(clickedPiece.type)} at ${coordsToNotation(r, c)}. Click or tap an adjacent target to act; right-click or long-press for the unit list.`;
            renderBoard();
        }

        function handleSquareAction(r, c) {
            if (gameState.phase !== 'PLANNING') return;
            pieceTooltip.classList.add('hidden');

            const activePlayerId = gameState.turnIndex + 1;
            const clickedPiece = gameState.board[r][c];
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
                    hintTextEl.innerText = "Pawns cannot be moved, unmerged, or transferred on even-numbered rounds.";
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
            const targetPiece = gameState.board[r][c];
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
                        move.pieceId !== pieceToMove.id
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
                hintTextEl.innerText = "Pawn-containing stacks cannot move, merge, or attack on even-numbered rounds, except for a ready siege assault.";
                return;
            }

            if (targetPiece && targetPiece.player !== activePlayerId &&
                isTowerPiece(targetPiece) &&
                !getPieceContents(pieceToMove).some(unit => getUnitType(unit) === 'p')) {
                hintTextEl.innerText = "A Tower can only be attacked by a stack containing a Pawn.";
                return;
            }

            if (targetPiece && targetPiece.player === activePlayerId &&
                !currentPlans.some(p => p.from[0] === r && p.from[1] === c)) {
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

            gameState.plans[gameState.turnIndex] = currentPlans.filter(p => !(p.from[0] === fromR && p.from[1] === fromC));
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
            if (gameState.phase !== 'PLANNING') return;
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
            if (gameState.phase !== 'PLANNING' || !gameState.selectedSquare) return;
            const tower = gameState.board[gameState.selectedSquare[0]][gameState.selectedSquare[1]];
            const siege = tower ? getSiegeAtSquare(gameState.selectedSquare) : null;
            if (!tower || !siege || tower.player !== gameState.turnIndex + 1 ||
                !getPieceContents(tower).some(unit => getUnitType(unit) !== 'r')) {
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
            hintTextEl.innerText = "Sally Out queued for this round.";
            renderBoard();
        });

        btnMergeConfirm.addEventListener('click', () => {
            if (gameState.pendingTransfer) {
                const { sourcePiece, heldPiece } = gameState.pendingTransfer;
                const unit = getPieceContents(sourcePiece).find(candidate => candidate.id === heldPiece.unitId);
                if (!unit || !canMoveHeldUnit(unit)) {
                    hintTextEl.innerText = "Pawns cannot be moved, unmerged, or transferred on even-numbered rounds.";
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
                hintTextEl.innerText = "Pawn-containing stacks cannot move or merge on even-numbered rounds.";
                gameState.pendingMerge = null;
                mergePrompt.classList.add('hidden');
                btnMergeConfirm.innerText = 'Merge';
                renderBoard();
                return;
            }
            const currentPlans = gameState.plans[gameState.turnIndex];
            gameState.plans[gameState.turnIndex] = currentPlans.filter(move =>
                move.pieceId !== movingPiece.id && move.pieceId !== targetPiece.id
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
            activePlayerDescEl.innerText = 'Animating all planned movements...';

            logRoundHeader(gameState.round);

            // Collect all proposed movements
            const allIntendedMoves = [];
            for (let p = 0; p < 4; p++) {
                if (gameState.eliminated[p]) continue;
                for (const m of gameState.plans[p]) {
                    allIntendedMoves.push({
                        player: p + 1,
                        pieceId: m.pieceId,
                        from: m.from,
                        to: m.to,
                        pieceType: m.pieceType,
                        contents: m.contents,
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
                move.contents = [{
                    id: heldUnit.id,
                    player: move.player,
                    type: heldUnit.type,
                    name: heldUnit.name
                }];

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
                    if (!source || !getPieceContents(source).some(unit => getUnitType(unit) === 'p')) {
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
                logAction(`<b>Player ${move.player} (${PLAYERS[move.player - 1].name})</b> moved ${getPieceLabel(move.pieceType)}: ${coordsToNotation(...move.from)} ➔ ${coordsToNotation(...move.to)}`);
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

            // Check King eliminations & victory status
            checkPlayerEliminations();
            renderBoard();

            // Reset planned moves for next turn
            gameState.plans = [[], [], [], []];
            applySiegeRoundProgress();
            gameState.round++;
            updateRoundDisplay();
            processRetreatsAtRoundStart();

            // Count active players remaining
            const activePlayers = gameState.eliminated.map((elim, idx) => elim ? null : idx).filter(v => v !== null);

            if (activePlayers.length <= 1) {
                gameState.phase = 'GAME_OVER';
                const winnerIdx = activePlayers[0];
                const winnerName = winnerIdx !== undefined ? `${PLAYERS[winnerIdx].name} (Player ${winnerIdx + 1})` : "Nobody (Draw)";
                
                document.getElementById('gameover-title').innerText = winnerIdx !== undefined ? `${winnerName} Wins!` : "Draw!";
                document.getElementById('gameover-desc').innerText = "All opposing Kings have been captured!";
                document.getElementById('gameover-modal').classList.remove('hidden');
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
                            isStationary: true
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
                        logAction(`🔗 <b>MERGE</b> at ${coordsToNotation(targetR, targetC)}: ` +
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
                    logAction(`🔗 <b>MERGE</b> at ${coordsToNotation(targetR, targetC)}: ${sourceLabels} became a <b>${getPieceLabel(mergedType)} x${mergedContents.length}</b> for ${PLAYERS[mergedPlayer - 1].name}.`);
                    resolve();
                    return;
                }

                clashOverlay.classList.remove('hidden');
                setBattleTarget(group);
                renderBattleCandidates(group);
                battleRollsEl.innerHTML = '';
                const activeCandidateData = getBattleCandidateData(group);
                clashResult.innerText = "Ready";
                clashResult.style.color = "#f59e0b";
                btnStartBattle.classList.remove('hidden');
                btnProceedBattle.classList.add('hidden');

                btnStartBattle.onclick = () => {
                    btnStartBattle.classList.add('hidden');
                    clashResult.innerText = "Fighting...";

                    setTimeout(() => {
                        const roll = Math.random();
                        let accumulatedProbability = 0;
                        let survivorIdx = activeCandidateData.length - 1;
                        for (let idx = 0; idx < activeCandidateData.length; idx++) {
                            accumulatedProbability += activeCandidateData[idx].probability;
                            if (roll <= accumulatedProbability) {
                                survivorIdx = idx;
                                break;
                            }
                        }
                        const survivor = group.candidates[survivorIdx];
                        const battleRolls = [
                            `Winner roll ${(roll * 100).toFixed(2)}% selected P${survivor.player} ${PLAYERS[survivor.player - 1].name}`
                        ];
                        group.survivor = survivor;
                        const candidateDataById = new Map(activeCandidateData.map(entry => [entry.candidate.pieceId, entry]));
                        const winnerData = candidateDataById.get(survivor.pieceId);
                        const towerDefender = group.candidates.some(candidate =>
                            candidate.isStationary &&
                            getPieceContents(candidate).some(unit => getUnitType(unit) === 'r') &&
                            getPieceContents(candidate).some(unit => getUnitType(unit) !== 'r')
                        );
                        const towerSiege = group.candidates.some(candidate =>
                            candidate.isStationary &&
                            getPieceContents(candidate).some(unit => getUnitType(unit) === 'r')
                        );
                        const candidateResults = new Map();
                        const winnerResult = resolveCandidateCasualties(
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
                        renderRetreatTable();
                        const retreatedUnitIds = new Set(
                            retreatEntries.flatMap(entry => entry.contents.map(unit => unit.id))
                        );
                        renderBattleCandidates(group, candidateResults, retreatedUnitIds);

                        const survivorPlayer = PLAYERS[survivor.player - 1];
                        const retreatCount = retreatEntries.reduce((n, entry) => n + entry.contents.length, 0);
                        const casualtyCount = [...candidateResults.values()]
                            .reduce((count, result) => count + result.casualties.length, 0);
                        clashResult.innerText = `${survivorPlayer.name} wins · 💀${casualtyCount} · ↩️${retreatCount}`;
                        clashResult.style.color = survivorPlayer.color;
                        battleRollsEl.innerHTML = `
                            <div class="battle-roll-section"><strong>Rolls</strong><br>
                                ${battleRolls.map(rollEntry => `<div>${rollEntry}</div>`).join('')}
                            </div>`;

                        const candDesc = group.candidates.map(c =>
                            `P${c.player} ${getPieceLabel(c.pieceType)}`
                        ).join(' vs ');
                        logAction(`⚔️ <b>COLLISION RESULT</b> (${candDesc}): <b>P${survivor.player} (${survivorPlayer.name})</b> survived · 💀 ${casualtyCount} casualties · ↩️ ${retreatEntries.reduce((n, entry) => n + entry.contents.length, 0)} retreating.`);
                        btnProceedBattle.classList.remove('hidden');
                    }, 1000);
                };

                btnProceedBattle.onclick = () => {
                    clashOverlay.classList.add('hidden');
                    clearBattleTarget();
                    battleCandidatesEl.innerHTML = '';
                    battleRollsEl.innerHTML = '';
                    btnStartBattle.onclick = null;
                    btnProceedBattle.onclick = null;
                    resolve();
                };
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
                clashOverlay.classList.remove('hidden');
                setBattleTarget(group);
                renderBattleCandidates(group);
                battleRollsEl.innerHTML = '';
                clashResult.innerText = "Ready";
                clashResult.style.color = "#f59e0b";
                btnStartBattle.classList.remove('hidden');
                btnProceedBattle.classList.add('hidden');

                btnStartBattle.onclick = () => {
                    btnStartBattle.classList.add('hidden');
                    clashResult.innerText = "Fighting...";
                    setTimeout(() => {
                        const roll = Math.random();
                        let accumulatedProbability = 0;
                        let survivorIdx = activeCandidateData.length - 1;
                        for (let idx = 0; idx < activeCandidateData.length; idx++) {
                            accumulatedProbability += activeCandidateData[idx].probability;
                            if (roll <= accumulatedProbability) {
                                survivorIdx = idx;
                                break;
                            }
                        }

                        const survivor = group.candidates[survivorIdx];
                        const candidateDataById = new Map(
                            activeCandidateData.map(entry => [entry.candidate.pieceId, entry])
                        );
                        const battleRolls = [
                            `Winner roll ${(roll * 100).toFixed(2)}% selected P${survivor.player} ${PLAYERS[survivor.player - 1].name}`
                        ];
                        const candidateResults = new Map();
                        const winnerData = candidateDataById.get(survivor.pieceId);
                        candidateResults.set(survivor.pieceId, resolveCandidateCasualties(
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
                        renderBattleCandidates(group, candidateResults);
                        const casualtyCount = [...candidateResults.values()]
                            .reduce((count, result) => count + result.casualties.length, 0);
                        const winnerPlayer = PLAYERS[survivor.player - 1];
                        clashResult.innerText = `${winnerPlayer.name} wins Sally Out · 💀${casualtyCount}`;
                        clashResult.style.color = winnerPlayer.color;
                        battleRollsEl.innerHTML = `
                            <div class="battle-roll-section"><strong>Rolls</strong><br>
                                ${battleRolls.map(rollEntry => `<div>${rollEntry}</div>`).join('')}
                            </div>`;
                        logAction(`⚔️ <b>SALLY OUT</b> at ${coordsToNotation(...group.targetSquare)}: ` +
                            `<b>P${survivor.player} (${winnerPlayer.name})</b> won · 💀 ${casualtyCount} casualties.`);
                        btnProceedBattle.classList.remove('hidden');
                    }, 1000);
                };

                btnProceedBattle.onclick = () => {
                    clashOverlay.classList.add('hidden');
                    clearBattleTarget();
                    battleCandidatesEl.innerHTML = '';
                    battleRollsEl.innerHTML = '';
                    btnStartBattle.onclick = null;
                    btnProceedBattle.onclick = null;
                    syncSieges();
                    resolve();
                };
            });
        }

        function checkPlayerEliminations() {
            const kingAlive = [false, false, false, false];

            for (let r = 0; r < 16; r++) {
                for (let c = 0; c < 16; c++) {
                    const piece = gameState.board[r][c];
                    if (piece && getPieceContents(piece).some(unit => unit.type === 'k')) {
                        kingAlive[piece.player - 1] = true;
                    }
                }
            }

            for (let p = 0; p < 4; p++) {
                if (!kingAlive[p] && !gameState.eliminated[p]) {
                    gameState.eliminated[p] = true;
                    logAction(`👑💥 <b>PLAYER ELIMINATED!</b> ${PLAYERS[p].name} (Player ${p + 1}) lost their King!`);
                }
            }
        }

        // Modal triggers
        btnRules.addEventListener('click', () => {
            document.getElementById('rules-modal').classList.remove('hidden');
        });
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
            customSetupStatusEl.innerText = 'Placement reset. Every selected player needs exactly one King.';
            renderCustomSetupBoard();
        });
        btnSaveCustomSetup.addEventListener('click', saveCustomSetup);
        btnLoadCustomSetup.addEventListener('click', () => {
            renderSavedSetups(customSavedSetupListEl, true);
            customSavedSetupListEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
        btnConfirmCustomSetup.addEventListener('click', confirmCustomSetup);
        btnStartSelectedGame.addEventListener('click', () => {
            const selectedPlayers = [...document.querySelectorAll('#player-selection-list input')]
                .map(input => input.checked);
            if (selectedPlayers.filter(Boolean).length < 2) {
                playerSelectionError.innerText = 'Select at least two players to start.';
                return;
            }
            gameState.progressionMode = document.querySelector('input[name="progression-mode"]:checked').value;
            const setupMode = document.querySelector('input[name="setup-mode"]:checked').value;
            if (setupMode === 'custom') {
                playerSelectionModal.classList.add('hidden');
                showCustomSetup(selectedPlayers);
                return;
            }
            startNewGame(selectedPlayers);
        });

        // Start game on load
        window.onload = function() {
            Multiplayer.showMainMenu();
        };
