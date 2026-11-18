function coordsToNotation(r, c) {
    const files = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'];
    return `${files[c]}${gameState.boardSize - r}`;
}

function getBiome(r, c) {
    return gameState.biomes?.[r]?.[c] || 'plains';
}

function isPassableSquare(r, c) {
    return getBiome(r, c) !== 'mountain';
}

function getFogVisibility(viewer = null) {
    const size = gameState.boardSize;
    const visible = Array.from({ length: size }, () =>
        Array(size).fill(gameState.phase === 'GAME_OVER'));
    if (gameState.phase === 'GAME_OVER') return visible;
    const viewers = viewer !== null ? [viewer] :
        !gameState.multiplayer && gameState.phase === 'RESOLVING'
            ? gameState.activePlayers.flatMap((active, index) =>
                active && !gameState.eliminated[index] ? [index + 1] : [])
            : [gameState.turnIndex + 1];
    const owners = getProvinceOwners(gameState.board);
    const visibleProvinces = owners.map((_, province) => owners.some((other, index) =>
        viewers.includes(other) &&
        Math.max(Math.abs(Math.floor(province / 4) - Math.floor(index / 4)),
            Math.abs(province % 4 - index % 4)) <= 1));
    if (gameState.fogSight === 'small') {
        owners.forEach((owner, index) => {
            if (!viewers.includes(owner)) return;
            const row = Math.floor(index / 4);
            const column = index % 4;
            const startRow = Math.max(0, Math.floor(row * size / 4) - 2);
            const endRow = Math.min(size, Math.floor((row + 1) * size / 4) + 2);
            const startColumn = Math.max(0, Math.floor(column * size / 4) - 2);
            const endColumn = Math.min(size, Math.floor((column + 1) * size / 4) + 2);
            for (let r = startRow; r < endRow; r++) {
                for (let c = startColumn; c < endColumn; c++) visible[r][c] = true;
            }
        });
    }
    gameState.board.forEach((row, r) => row.forEach((piece, c) => {
        if (gameState.fogSight !== 'small' && visibleProvinces[getProvinceIndex(r, c, size)]) visible[r][c] = true;
        if (!piece || !viewers.includes(piece.player)) return;
        const radius = (gameState.fogSight === 'large' ? 2 : 1) +
            (getCombatContents(piece).some(unit => getUnitType(unit) === 'b') ? 1 : 0);
        for (let rr = Math.max(0, r - radius); rr <= Math.min(size - 1, r + radius); rr++) {
            for (let cc = Math.max(0, c - radius); cc <= Math.min(size - 1, c + radius); cc++) {
                visible[rr][cc] = true;
            }
        }
    }));
    return visible;
}

function isConcealedPiece(piece, r, c, viewer = null, visibility = getFogVisibility(viewer)) {
    return Boolean(piece && piece.player !== (viewer ?? gameState.turnIndex + 1) &&
        gameState.phase !== 'GAME_OVER' &&
        (!visibility[r][c] || (piece.player !== REBEL_PLAYER_ID && getBiome(r, c) === 'forest')));
}

function getVisiblePiece(r, c, viewer = null, visibility = getFogVisibility(viewer)) {
    const piece = gameState.board[r][c];
    if (!isConcealedPiece(piece, r, c, viewer, visibility)) return piece;
    if (!isTowerPiece(piece)) return null;
    return { ...piece, type: 'r', contents: getPieceContents(piece).filter(unit => getUnitType(unit) === 'r') };
}

function getVisibleMovements(moves, viewer = null) {
    const visibility = getFogVisibility(viewer);
    return moves.filter(move => {
        if (move.invalid || move.siegeStart || move.sallyOut || move.siegeCancel) return false;
        const piece = { player: move.player, type: move.pieceType, contents: move.contents };
        return [move.from, move.to].every(([r, c]) =>
            !isConcealedPiece(piece, r, c, viewer, visibility));
    });
}

// The shared log must be safe to read again during any player's planning turn.
function isPubliclyVisiblePiece(piece, squares) {
    return gameState.activePlayers.every((active, index) => !active || gameState.eliminated[index] ||
        squares.every(([r, c]) => !isConcealedPiece(piece, r, c, index + 1)));
}

function snapshotHillOccupants() {
    return gameState.board.map((row, r) => row.map((piece, c) =>
        piece && getBiome(r, c) === 'hill'
            ? { player: piece.player, ids: getCombatContents(piece).map(unit => unit.id) }
            : null));
}

function updateHillHeld(start, moves) {
    const moved = new Set(moves.filter(move => !move.invalid && !move.siegeStart &&
        !move.sallyOut && !move.siegeCancel).flatMap(move => move.contents.map(unit => unit.id)));
    gameState.hillHeld = gameState.board.map((row, r) => row.map((piece, c) => {
        const previous = start[r][c];
        if (!piece || !previous || piece.player !== previous.player) return null;
        const ids = getCombatContents(piece).map(unit => unit.id)
            .filter(id => previous.ids.includes(id) && !moved.has(id));
        return ids.length ? { player: piece.player, ids } : null;
    }));
}

function getDefenderTerrainBonus(candidate, square) {
    if (!candidate.isStationary || !square) return 0;
    const [r, c] = square;
    if (getBiome(r, c) === 'forest') return 0.25;
    const held = gameState.hillHeld?.[r]?.[c];
    return getBiome(r, c) === 'hill' && held && held.player === candidate.player &&
        getCombatContents(candidate).some(unit => held.ids.includes(unit.id)) ? 0.25 : 0;
}

function getSiegeAtSquare(square) {
    return gameState.sieges.find(siege =>
        siege.towerSquare[0] === square[0] && siege.towerSquare[1] === square[1]
    );
}

function getSiegeForAttacker(pieceId) {
    return gameState.sieges.find(siege =>
        siege.attackers.some(attacker => attacker.pieceId === pieceId)
    );
}

function getSiegeAttacker(pieceId) {
    const siege = getSiegeForAttacker(pieceId);
    return siege ? siege.attackers.find(attacker => attacker.pieceId === pieceId) : null;
}

function isTowerPiece(piece) {
    return Boolean(piece && getPieceContents(piece).some(unit => getUnitType(unit) === 'r'));
}

function getProvinceIndex(r, c, boardSize) {
    // Invert the floor-based province boundaries used by castle placement.
    const row = Math.ceil((r + 1) * 4 / boardSize) - 1;
    const column = Math.ceil((c + 1) * 4 / boardSize) - 1;
    return row * 4 + column;
}

function getProvinceOwners(board) {
    const owners = Array.from({ length: 16 }, () => new Set());
    board.forEach((row, r) => row.forEach((piece, c) => {
        if (isTowerPiece(piece)) owners[getProvinceIndex(r, c, board.length)].add(piece.player);
    }));
    return owners.map(players => {
        const [owner] = players;
        return players.size === 1 && owner !== REBEL_PLAYER_ID ? owner : null;
    });
}

function getProvinceResourceTooltip(resource) {
    const type = RESOURCE_TYPES.find(type => type.key === resource.type);
    return `${type.label} · Production chance: ${resource.productionChance}% every 4 rounds`;
}

function getProvinceResources(resources, province) {
    // Generated maps store one resource; sandbox maps store lists of positioned sites.
    const value = resources?.[province];
    return Array.isArray(value) ? value : value ? [value] : [];
}

function getResourcePosition(resource, province, size, biomes) {
    if (Number.isInteger(resource.row) && Number.isInteger(resource.column)) {
        return [resource.row, resource.column];
    }
    const minRow = Math.floor(Math.floor(province / 4) * size / 4);
    const minColumn = Math.floor((province % 4) * size / 4);
    const maxRow = Math.floor((Math.floor(province / 4) + 1) * size / 4);
    const maxColumn = Math.floor((province % 4 + 1) * size / 4);
    for (let row = minRow; row < maxRow; row++) {
        for (let column = minColumn; column < maxColumn; column++) {
            if (biomes[row][column] !== 'mountain') return [row, column];
        }
    }
    throw new Error(`No non-mountain square for resource in province ${province + 1}`);
}

function renderProvinceResource(square, r, c, resources, size, biomes = gameState.biomes) {
    const province = getProvinceIndex(r, c, size);
    let marker;
    for (const resource of getProvinceResources(resources, province)) {
        const title = getProvinceResourceTooltip(resource);
        square.title += ` · ${title}`;
        const [row, column] = getResourcePosition(resource, province, size, biomes);
        if (r !== row || c !== column) continue;
        if (!marker) {
            marker = document.createElement('span');
            marker.className = 'province-resource';
            marker.setAttribute('role', 'img');
            square.appendChild(marker);
        } else marker.classList.add('province-resource-multiple');
        marker.innerText += RESOURCE_TYPES.find(type => type.key === resource.type).icon;
        marker.title += `${marker.title ? '; ' : ''}${title}`;
        marker.setAttribute('aria-label', marker.title);
    }
}

function resolveResourceProduction(completedRound, random = Math.random) {
    if (completedRound < 1 || completedRound % 4 !== 0 ||
        gameState.lastResourceProductionRound >= completedRound) return false;
    const owners = getProvinceOwners(gameState.board);
    gameState.provinceResources.forEach((_, province) => {
        const owner = owners[province];
        for (const resource of getProvinceResources(gameState.provinceResources, province)) {
            if (owner && gameState.activePlayers[owner - 1] &&
                !gameState.eliminated[owner - 1] && random() * 100 < resource.productionChance) {
                gameState.resources[owner - 1][resource.type]++;
            }
        }
    });
    gameState.lastResourceProductionRound = completedRound;
    return true;
}

function towersAreSpaced(board) {
    const towers = [];
    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            const piece = board[r][c];
            if (!piece || piece.player === REBEL_PLAYER_ID ||
                !getPieceContents(piece).some(unit => getUnitType(unit) === 'r')) continue;
            if (towers.some(([tr, tc]) =>
                Math.max(Math.abs(tr - r), Math.abs(tc - c)) < 3)) return false;
            towers.push([r, c]);
        }
    }
    return true;
}

function getTowerGate(piece) {
    const tower = piece && getPieceContents(piece).find(unit => getUnitType(unit) === 'r');
    return tower ? tower.gate : null;
}

function isTowerGateMove(from, to) {
    const source = gameState.board[from[0]][from[1]];
    const target = gameState.board[to[0]][to[1]];
    const matchesGate = (tower, towerSquare, otherSquare) => {
        const gate = getTowerGate(tower);
        return Array.isArray(gate) &&
            towerSquare[0] + gate[0] === otherSquare[0] &&
            towerSquare[1] + gate[1] === otherSquare[1];
    };
    return (!isTowerPiece(source) || matchesGate(source, from, to)) &&
        (!isTowerPiece(target) || matchesGate(target, to, from));
}

function isAdjacentSquare(first, second) {
    return Math.max(Math.abs(first[0] - second[0]), Math.abs(first[1] - second[1])) === 1;
}

function isEliminatedPiece(piece) {
    return Boolean(piece && (piece.player === REBEL_PLAYER_ID || gameState.eliminated[piece.player - 1]));
}

function getPieceClass(piece) {
    const unit = getPieceContents(piece).find(entry => entry.type === piece.type && !isPrisoner(entry)) ||
        getPieceContents(piece).find(entry => entry.type === piece.type);
    if (unit && isPrisoner(unit)) return getUnitDisplayClass(unit, piece.player);
    const player = getPlayerInfo(piece.player);
    return `${player ? player.class : ''}${isEliminatedPiece(piece) ? ' piece-eliminated' : ''}`;
}
