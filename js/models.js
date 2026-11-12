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

function getUnitLevel(unit, attribute) {
    return Math.max(0, Math.min(3, Number(unit[attribute]) || 0));
}

function getUnitStats(unit) {
    return `XP ${getUnitLevel(unit, 'experience')} · 🛡️ ${getUnitLevel(unit, 'armour')}`;
}
