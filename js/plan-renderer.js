function renderPlanArrows() {
    planArrowsEl.setAttribute('viewBox', `0 0 ${gameState.boardSize} ${gameState.boardSize}`);
    const allMoves = getAllPlannedMoves();
    const colors = {
        green: '#22c55e',
        yellow: '#facc15',
        red: '#ef4444',
        blue: '#3b82f6'
    };
    const defs = Object.entries(colors).map(([name, color]) =>
        `<marker id="arrow-${name}" markerWidth="4" markerHeight="4" refX="3.2" refY="2" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L4,2 L0,4 z" fill="${color}"></path></marker>`
    ).join('');
    const paths = ['PLANNING', 'COMMITTED'].includes(gameState.phase)
        ? gameState.movementPaths?.[gameState.turnIndex] || [] : [];
    const lines = allMoves
        .filter(move => !paths.some(path => path.pieceId === move.pathId))
        .filter(move => move.from[0] !== move.to[0] || move.from[1] !== move.to[1])
        .map(move => {
            const kind = getPlanArrowKind(move, allMoves);
            const color = colors[kind];
            return `<line x1="${move.from[1] + 0.5}" y1="${move.from[0] + 0.5}" x2="${move.to[1] + 0.5}" y2="${move.to[0] + 0.5}" stroke="${color}" stroke-width="0.12" stroke-linecap="round" marker-end="url(#arrow-${kind})" opacity="0.95"></line>`;
        })
        .join('');
    const routes = paths.map(path => path.steps.map((step, index) => {
        const kind = path.invalidFrom >= 0 && index >= path.invalidFrom ? 'yellow' : 'green';
        const arrow = samePathSquare(step.from, step.to) ? '' :
            `<line x1="${step.from[1] + 0.5}" y1="${step.from[0] + 0.5}" x2="${step.to[1] + 0.5}" y2="${step.to[0] + 0.5}" stroke="${colors[kind]}" stroke-width="0.1" stroke-linecap="round" marker-end="url(#arrow-${kind})" opacity="0.85"><title>Round ${step.round}</title></line>`;
        const previousRound = index ? path.steps[index - 1].round : gameState.round - 1;
        const rests = step.round > previousRound + 1
            ? `<text x="${step.from[1] + 0.62}" y="${step.from[0] + 0.3}" fill="${colors[kind]}" font-size="0.23" font-weight="bold" stroke="#111827" stroke-width="0.025" paint-order="stroke">zzz<title>Rest: round ${previousRound + 1}</title></text>` : '';
        return arrow + rests;
    }).join('')).join('');
    planArrowsEl.innerHTML = `<defs>${defs}</defs>${lines}${routes}`;
}
