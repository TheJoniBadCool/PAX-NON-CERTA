function bindBoardInteractions() {
    let pressTimer = null;
    let press = null;
    let suppressClick = false;

    function cancelPress() {
        clearTimeout(pressTimer);
        pressTimer = null;
        press = null;
    }

    function getSquare(event) {
        const square = event.target.closest('.square');
        return square && square.parentElement === boardEl ? square : null;
    }

    boardEl.addEventListener('click', event => {
        if (suppressClick) {
            event.preventDefault();
            event.stopPropagation();
            return;
        }
        const square = getSquare(event);
        if (!square) return;
        const index = Array.prototype.indexOf.call(boardEl.children, square);
        handleSquareClick(Math.floor(index / gameState.boardSize), index % gameState.boardSize);
    });
    boardEl.addEventListener('contextmenu', event => {
        event.preventDefault();
        const square = getSquare(event);
        if (!square || suppressClick) return;
        if (press) suppressClick = true;
        cancelPress();
        const index = Array.prototype.indexOf.call(boardEl.children, square);
        handleSquarePopup(Math.floor(index / gameState.boardSize), index % gameState.boardSize);
    });
    boardEl.addEventListener('pointerdown', event => {
        const alreadyPressing = press !== null;
        cancelPress();
        suppressClick = false;
        if (alreadyPressing || !event.isPrimary || event.button !== 0 ||
            !['touch', 'pen'].includes(event.pointerType)) return;
        const square = getSquare(event);
        if (!square) return;
        const index = Array.prototype.indexOf.call(boardEl.children, square);
        press = { id: event.pointerId, x: event.clientX, y: event.clientY };
        pressTimer = setTimeout(() => {
            suppressClick = true;
            handleSquarePopup(Math.floor(index / gameState.boardSize), index % gameState.boardSize);
        }, 500);
    });
    window.addEventListener('pointermove', event => {
        if (press && press.id === event.pointerId &&
            Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) {
            suppressClick = true;
            cancelPress();
        }
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => {
        window.addEventListener(type, cancelPress);
    });
}

function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${gameState.boardSize}, 1fr)`;
    boardEl.style.gridTemplateRows = `repeat(${gameState.boardSize}, 1fr)`;
    for (let boundary = 1; boundary < 4; boundary++) {
        boardEl.parentElement.style.setProperty(`--province-boundary-${boundary}`,
            `${Math.floor(boundary * gameState.boardSize / 4) / gameState.boardSize * 100}%`);
    }
    const provinceOwners = getProvinceOwners(gameState.board);
    const visibility = getFogVisibility();
    const currentPlans = gameState.plans[gameState.turnIndex];

    for (let r = 0; r < gameState.boardSize; r++) {
        for (let c = 0; c < gameState.boardSize; c++) {
            const square = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            const biome = getBiome(r, c);

            let sqClass = `square ${isLight ? 'sq-light' : 'sq-dark'} biome-${biome}`;
            if (!visibility[r][c]) sqClass += ' sq-fog';

            const provinceOwner = provinceOwners[getProvinceIndex(r, c, gameState.boardSize)];
            if (provinceOwner) sqClass += ` zone-p${provinceOwner}`;

            square.className = sqClass;
            square.title = `${biome[0].toUpperCase()}${biome.slice(1)} · ${coordsToNotation(r, c)}`;
            if (!visibility[r][c]) square.title += ' · Fog of war';

            if (gameState.selectedSquare && gameState.selectedSquare[0] === r && gameState.selectedSquare[1] === c) {
                square.classList.add('sq-selected');
            }

            if (gameState.validMoves.some(m => m[0] === r && m[1] === c)) {
                square.classList.add('sq-valid');
            }

            const isPlannedFrom = currentPlans.some(p => p.from[0] === r && p.from[1] === c);
            const isPlannedTo = currentPlans.some(p => p.to[0] === r && p.to[1] === c);

            if (isPlannedFrom) {
                square.classList.add('sq-planned-from');
            }
            if (isPlannedTo) {
                const plannedBadge = document.createElement('div');
                plannedBadge.className = 'planned-badge';
                const prisonerPlans = currentPlans.filter(p => p.prisonerAction &&
                    p.from[0] === r && p.from[1] === c);
                plannedBadge.innerText = prisonerPlans.length
                    ? prisonerPlans.map(p => p.prisonerAction === 'execute' ? '💀' : '🏳️').join('') : '✓';
                if (prisonerPlans.length) plannedBadge.title = prisonerPlans.map(p =>
                    `${p.prisonerAction === 'execute' ? 'Execution' : 'Release'} planned before movement`).join('; ');
                square.appendChild(plannedBadge);
            }

            const piece = getVisiblePiece(r, c, null, visibility);
            const siegeAtSquare = getSiegeAtSquare([r, c]);
            const visibleSiege = siegeAtSquare && (piece?.player === gameState.turnIndex + 1 ||
                siegeAtSquare.attackers.some(attacker =>
                    getVisiblePiece(...attacker.sourceSquare, null, visibility)));
            if (visibleSiege) {
                const siegeMark = document.createElement('div');
                siegeMark.className = 'siege-mark';
                siegeMark.innerText = 'XXXX';
                square.appendChild(siegeMark);
                const towerTimer = document.createElement('div');
                towerTimer.className = 'siege-timer';
                towerTimer.innerText = siegeAtSquare.towerTimer;
                towerTimer.title = `Tower siege timer: ${siegeAtSquare.towerTimer}`;
                square.appendChild(towerTimer);
            }
            if (piece) {
                const pieceWrapper = document.createElement('div');
                pieceWrapper.style.width = '100%';
                pieceWrapper.style.height = '100%';
                pieceWrapper.style.position = 'relative';
                pieceWrapper.style.zIndex = '1';
                pieceWrapper.style.display = 'flex';
                pieceWrapper.style.alignItems = 'center';
                pieceWrapper.style.justifyContent = 'center';
                const contents = getPieceContents(piece);
                const displayedUnit = contents.find(unit => unit.type === piece.type && !isPrisoner(unit)) ||
                    contents.find(unit => unit.type === piece.type) || contents[0];
                pieceWrapper.className = getUnitDisplayClass(displayedUnit, piece.player);
                const routedUnits = contents.filter(unit => getRoutedStacks(unit) > 0);
                pieceWrapper.title = contents.map(unit => {
                    const routed = getRoutedStats(unit);
                    return `${unit.castleLabel || getUnitName(unit)}${isPrisoner(unit) ? ` · ${getUnitStats(unit)}` : routed ? ` · ${routed}` : ''}`;
                }).join(', ');
                const attackerSiege = getSiegeForAttacker(piece.id);
                pieceWrapper.innerHTML = attackerSiege ? PIECE_SVGS.catapult : PIECE_SVGS[piece.type];
                const prisoners = contents.filter(isPrisoner);
                if (prisoners.length) {
                    const chains = document.createElement('div');
                    chains.className = 'prisoner-board-badge';
                    chains.style.color = getPlayerInfo(piece.player).color;
                    chains.innerHTML = `${PRISONER_CHAIN_SVG}${prisoners.length > 1 ? prisoners.length : ''}`;
                    chains.title = prisoners.map(unit => `${getUnitName(unit)} · ${getUnitStats(unit)}`).join('; ');
                    square.appendChild(chains);
                }
                if (isPawnRestTurn() && !canMoveWholePiece(piece)) {
                    const pawnRestBadge = document.createElement('div');
                    pawnRestBadge.className = 'pawn-rest-badge';
                    pawnRestBadge.innerText = 'zzz';
                    pawnRestBadge.title = 'Pawn or prisoner resting this round';
                    square.appendChild(pawnRestBadge);
                }
                if (routedUnits.length) {
                    const recoveryBadge = document.createElement('div');
                    const roundsRemaining = Math.max(...routedUnits.map(unit =>
                        unit.routedUntilRound - gameState.round));
                    recoveryBadge.className = 'routed-recovery-badge';
                    recoveryBadge.innerHTML = `<span class="recovery-cross" aria-hidden="true">+</span><span aria-hidden="true">${roundsRemaining}</span>`;
                    recoveryBadge.title = `Routed recovery: ${roundsRemaining} rounds remaining (${routedUnits.length}/${contents.length} units affected). ${routedUnits.map(unit => `${getUnitName(unit)} · ${getRoutedStats(unit)}`).join('; ')}`;
                    recoveryBadge.setAttribute('role', 'img');
                    recoveryBadge.setAttribute('aria-label', recoveryBadge.title);
                    square.appendChild(recoveryBadge);
                }
                const pieceCount = contents.length;
                if (pieceCount > 1) {
                    const countBadge = document.createElement('div');
                    const pendingCount = getPendingHeldIndices(piece, currentPlans).size;
                    countBadge.className = `held-count${pendingCount > 0 ? ' pending' : ''}`;
                    countBadge.innerText = `x${pieceCount}`;
                    square.appendChild(countBadge);
                }
                square.appendChild(pieceWrapper);
                if (isTowerPiece(piece)) {
                    const gate = getTowerGate(piece);
                    if (gate) {
                        const direction = gate[0] === -1 ? 'north' : gate[0] === 1 ? 'south' :
                            gate[1] === -1 ? 'west' : 'east';
                        const arrow = document.createElement('span');
                        arrow.className = `tower-gate tower-gate-${direction}`;
                        arrow.innerText = { north: '▲', south: '▼', west: '◀', east: '▶' }[direction];
                        arrow.title = `Tower gate: ${direction} (${coordsToNotation(r + gate[0], c + gate[1])})`;
                        arrow.setAttribute('aria-label', arrow.title);
                        square.appendChild(arrow);
                    }
                }
                if (attackerSiege) {
                    const attacker = attackerSiege.attackers.find(entry => entry.pieceId === piece.id);
                    const attackerTimer = document.createElement('div');
                    attackerTimer.className = 'siege-timer';
                    attackerTimer.innerText = attacker.timer;
                    attackerTimer.title = `Catapult assault timer: ${attacker.timer}`;
                    square.appendChild(attackerTimer);
                }
            }

            boardEl.appendChild(square);
        }
    }
    renderPlanArrows();
    renderRetreatTable();
    if (typeof Multiplayer !== 'undefined') Multiplayer.onBoardRendered();
}
