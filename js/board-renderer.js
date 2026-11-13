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
        handleSquareClick(Math.floor(index / 16), index % 16);
    });
    boardEl.addEventListener('contextmenu', event => {
        event.preventDefault();
        const square = getSquare(event);
        if (!square || suppressClick) return;
        if (press) suppressClick = true;
        cancelPress();
        const index = Array.prototype.indexOf.call(boardEl.children, square);
        handleSquarePopup(Math.floor(index / 16), index % 16);
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
            handleSquarePopup(Math.floor(index / 16), index % 16);
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
    const currentPlans = gameState.plans[gameState.turnIndex];

    for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) {
            const square = document.createElement('div');
            const isLight = (r + c) % 2 === 0;

            let sqClass = `square ${isLight ? 'sq-light' : 'sq-dark'}`;

            if (r <= 3 && c <= 3) sqClass += ' zone-p1';
            else if (r <= 3 && c >= 12) sqClass += ' zone-p2';
            else if (r >= 12 && c >= 12) sqClass += ' zone-p3';
            else if (r >= 12 && c <= 3) sqClass += ' zone-p4';

            square.className = sqClass;

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
                plannedBadge.innerText = '✓';
                square.appendChild(plannedBadge);
            }

            const piece = gameState.board[r][c];
            const siegeAtSquare = getSiegeAtSquare([r, c]);
            if (siegeAtSquare) {
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
                pieceWrapper.style.display = 'flex';
                pieceWrapper.style.alignItems = 'center';
                pieceWrapper.style.justifyContent = 'center';
                pieceWrapper.className = getPieceClass(piece);
                pieceWrapper.title = getPieceContents(piece).map(getUnitName).join(', ');
                const attackerSiege = getSiegeForAttacker(piece.id);
                pieceWrapper.innerHTML = attackerSiege ? PIECE_SVGS.catapult : PIECE_SVGS[piece.type];
                if (isPawnRestTurn() && pieceContainsPawn(piece)) {
                    const pawnRestBadge = document.createElement('div');
                    pawnRestBadge.className = 'pawn-rest-badge';
                    pawnRestBadge.innerText = 'zzz';
                    pawnRestBadge.title = 'Pawn resting this round';
                    square.appendChild(pawnRestBadge);
                }
                const pieceCount = getPieceContents(piece).length;
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
