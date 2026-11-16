function getPieceLabel(type) {
    const map = { p: 'Pawn', r: 'Tower', n: 'Horse', b: 'Bishop', q: 'Queen', k: 'King' };
    return map[type] || type;
}

function getUnitType(unit) {
    return typeof unit === 'string' ? unit : unit.type;
}

function getUnitName(unit) {
    return typeof unit === 'string' ? unit : unit.name;
}

function isPrisoner(unit) {
    return Boolean(unit.prisonerOf);
}

function getCombatContents(piece) {
    return getPieceContents(piece).filter(unit => !isPrisoner(unit));
}

function isPrisonerOnly(piece) {
    return getCombatContents(piece).length === 0;
}

function getUnitDisplayClass(unit, owner) {
    const player = isPrisoner(unit) ? unit.originalPlayer : owner;
    const playerInfo = getPlayerInfo(player);
    return `${playerInfo.class}${!isPrisoner(unit) &&
        (owner === REBEL_PLAYER_ID || gameState.eliminated[owner - 1]) ? ' piece-eliminated' : ''}`;
}

const PRISONER_CHAIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M10 13a5 5 0 0 1 0-7l3-3a5 5 0 0 1 7 7l-3 3M14 11a5 5 0 0 1 0 7l-3 3a5 5 0 0 1-7-7l3-3M8 16l8-8"/></svg>';
const PRISONER_EXECUTE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 17H6a9 9 0 1 1 12 0h-2v4H8Z M10 18v3M14 18v3"/><circle cx="8" cy="10" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="2" fill="currentColor" stroke="none"/><path d="m12 13-1 2h2Z"/></svg>';
const PRISONER_RELEASE_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 22V3"/><path d="M5 3c5-3 9 3 14 0v11c-5 3-9-3-14 0Z" fill="#ffffff"/></svg>';

function prisonerChain(unit) {
    return isPrisoner(unit)
        ? `<span class="prisoner-chain" style="color: ${getPlayerInfo(unit.prisonerOf).color}" title="Prisoner of P${unit.prisonerOf}" aria-label="Prisoner of P${unit.prisonerOf}">${PRISONER_CHAIN_SVG}</span>`
        : '';
}

function createUnit(player, type, id, name = id, experience = 0, armour = 0) {
    return { id, player, type, name, experience, armour };
}

function getMergedPieceType(units) {
    const types = units.map(getUnitType);
    if (types.includes('r')) return 'r';
    if (types.includes('p')) return 'p';
    if (types.includes('n')) return 'n';
    if (types.includes('b')) return 'b';
    if (types.includes('k')) return 'k';
    return 'q';
}

function getPieceContents(piece) {
    const contents = piece.contents || [piece.type];
    return contents.map((unit, index) => typeof unit === 'string'
        ? createUnit(piece.player, unit, `${piece.id}::unit::${index}`, `${PLAYER_CODES[piece.player - 1]}${unit}${index + 1}`)
        : unit);
}

function getPlannedPieceContents(piece, plans = gameState.plans[piece.player - 1] || []) {
    const removedIds = new Set(plans.filter(plan => plan.prisonerAction && plan.pieceId === piece.id)
        .map(plan => plan.unitId));
    return getPieceContents(piece).filter(unit => !removedIds.has(unit.id));
}

function getUnitLevel(unit, attribute) {
    return Math.max(0, Math.min(3, Number(unit[attribute]) || 0));
}

function getUnitStats(unit) {
    if (isPrisoner(unit)) return `Prisoner of P${unit.prisonerOf} · originally P${unit.originalPlayer} · cannot fight`;
    const routed = getRoutedStats(unit);
    return `XP ${getUnitLevel(unit, 'experience')} · 🛡️ ${getUnitLevel(unit, 'armour')}${routed ? ` · ${routed}` : ''}`;
}

function getRoutedStacks(unit, round = gameState.round) {
    return unit.routedUntilRound > round
        ? Math.max(0, Math.min(ROUTED_MAX_STACKS, Math.floor(Number(unit.routedStacks) || 0)))
        : 0;
}

function getRoutedStats(unit, round = gameState.round) {
    const stacks = getRoutedStacks(unit, round);
    if (!stacks) return '';
    return `Routed ×${stacks} · strength -${Math.round(stacks * ROUTED_STRENGTH_PENALTY * 100)}% · casualty +${Math.round(stacks * ROUTED_CASUALTY_PENALTY * 100)}pp · ${unit.routedUntilRound - round} rounds remaining`;
}
