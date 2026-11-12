function renderPlanArrows() {
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
    const lines = allMoves
        .filter(move => move.from[0] !== move.to[0] || move.from[1] !== move.to[1])
        .map(move => {
            const kind = getPlanArrowKind(move, allMoves);
            const color = colors[kind];
            return `<line x1="${move.from[1] + 0.5}" y1="${move.from[0] + 0.5}" x2="${move.to[1] + 0.5}" y2="${move.to[0] + 0.5}" stroke="${color}" stroke-width="0.12" stroke-linecap="round" marker-end="url(#arrow-${kind})" opacity="0.95"></line>`;
        })
        .join('');
    planArrowsEl.innerHTML = `<defs>${defs}</defs>${lines}`;
}
