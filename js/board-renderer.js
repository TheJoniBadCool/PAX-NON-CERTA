function renderBoard() {
    boardEl.innerHTML = '';
    const activePlayerId = gameState.turnIndex + 1;
    const currentPlans = gameState.plans[gameState.turnIndex];
    const selectedPiece = gameState.selectedSquare
        ? gameState.board[gameState.selectedSquare[0]][gameState.selectedSquare[1]]
        : null;
    btnCancelSiege.hidden = !(
        gameState.phase === 'PLANNING' &&
        selectedPiece &&
        getSiegeForAttacker(selectedPiece.id) &&
        selectedPiece.player === activePlayerId
    );
    const selectedSiege = gameState.selectedSquare
        ? getSiegeAtSquare(gameState.selectedSquare)
        : null;
    btnSallyOut.hidden = !(
        gameState.phase === 'PLANNING' &&
        selectedPiece &&
        selectedSiege &&
        selectedPiece.player === activePlayerId &&
        getPieceContents(selectedPiece).some(unit => getUnitType(unit) !== 'r') &&
        selectedPiece.player === gameState.board[selectedSiege.towerSquare[0]][selectedSiege.towerSquare[1]]?.player
    );

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
                const pieceCount = getPieceContents(piece).length;
                if (pieceCount > 1) {
                    const countBadge = document.createElement('div');
                    const pendingCount = getPendingHeldIndices(piece, currentPlans).size;
                    countBadge.className = `held-count${pendingCount > 0 ? ' pending' : ''}`;
                    countBadge.innerText = `x${pieceCount}`;
                    square.appendChild(countBadge);
                }
                square.appendChild(pieceWrapper);
                if (attackerSiege) {
                    const attacker = attackerSiege.attackers.find(entry => entry.pieceId === piece.id);
                    const attackerTimer = document.createElement('div');
                    attackerTimer.className = 'siege-timer';
                    attackerTimer.innerText = attacker.timer;
                    attackerTimer.title = `Catapult assault timer: ${attacker.timer}`;
                    square.appendChild(attackerTimer);
                }
            }

            square.addEventListener('click', () => handleSquareClick(r, c));
            square.addEventListener('contextmenu', (event) => {
                event.preventDefault();
                handleSquareAction(r, c);
            });
            boardEl.appendChild(square);
        }
    }
    renderPlanArrows();
    renderRetreatTable();
    if (typeof Multiplayer !== 'undefined') Multiplayer.onBoardRendered();
}
