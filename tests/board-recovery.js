// Run with: node tests/board-recovery.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
function element() {
    return {
        children: [], style: {}, className: '', innerText: '', title: '',
        classList: { add() {} },
        appendChild(child) { this.children.push(child); },
        setAttribute(name, value) { this[name] = value; },
        set innerHTML(value) { this.html = value; this.children = []; },
        get innerHTML() { return this.html || ''; }
    };
}
const boardEl = element();
boardEl.parentElement = { style: { setProperty() {} } };
const context = vm.createContext({
    document: { createElement: element }, boardEl,
    getPieceClass: () => 'piece-p1',
    getSiegeAtSquare: () => null,
    getSiegeForAttacker: () => null,
    isPawnRestTurn: () => false,
    isTowerPiece: () => false,
    getPendingHeldIndices: () => new Set(),
    renderPlanArrows() {}, renderRetreatTable() {}
});
['constants', 'models', 'game-state', 'board-utils', 'board-renderer'].forEach(name =>
    vm.runInContext(fs.readFileSync(`js/${name}.js`, 'utf8'), context));
const api = vm.runInContext(`const gameState = new GameState();
    ({ state: gameState, renderBoard, createUnit })`, context);
const state = api.state;
state.board = Array.from({ length: 16 }, () => Array(16).fill(null));
const queen = api.createUnit(1, 'q', 'queen', 'Queen "<test>');
Object.assign(queen, { routedStacks: 2, routedUntilRound: 4 });
const pawn = api.createUnit(1, 'p', 'pawn', 'Pawn');
state.board[8][8] = { id: 'stack', player: 1, type: 'p', contents: [queen, pawn] };
const square = () => boardEl.children[8 * 16 + 8];
const badge = () => square().children.find(child => child.className === 'routed-recovery-badge');
api.renderBoard();
assert.ok(badge().innerHTML.includes('class="recovery-cross"'), 'Recovery needs a health cross');
assert.ok(badge().innerHTML.includes('>3</span>'), 'Return round must show three recovery rounds');
assert.ok(badge()['aria-label'].includes('1/2 units affected'), 'Mixed stacks must identify affected units');
assert.ok(badge()['aria-label'].includes('strength -40%'), 'Recovery description must include penalties');
assert.ok(square().children.find(child => child.className === 'piece-p1').title.includes('Routed ×2'),
    'Piece hover must expose routed details without intercepting badge clicks');
assert.equal(square().children.find(child => child.className === 'piece-p1').style.zIndex, '1',
    'Pieces must render above translucent terrain symbols');
assert.ok(!badge().innerHTML.includes('<test>'), 'Unit names must not enter badge HTML');
assert.ok(square().children.some(child => child.className === 'held-count'),
    'Recovery must preserve the stack count');
Object.assign(pawn, { routedStacks: 1, routedUntilRound: 3 });
state.round = 2;
api.renderBoard();
assert.ok(badge().innerHTML.includes('>2</span>'), 'Mixed stacks must show the longest remaining cooldown');
assert.ok(badge().title.includes('2/2 units affected'));
assert.ok(badge().title.includes('1 rounds remaining'), 'Individual cooldowns remain available');
state.round = 3;
api.renderBoard();
assert.ok(badge().innerHTML.includes('>1</span>'), 'Counter must decrease each round');
assert.ok(badge().title.includes('1/2 units affected'), 'Recovered allies must no longer count as affected');
state.round = 4;
api.renderBoard();
assert.equal(badge(), undefined, 'Badge must disappear exactly when recovery expires');

state.round = 1;
state.board[8][8].contents = [queen];
api.renderBoard();
assert.ok(badge().title.includes('1/1 units affected'), 'Single pieces must also show recovery');
state.board[8][8] = null;
api.renderBoard();
assert.equal(badge(), undefined, 'Empty squares must not retain recovery markers');
state.biomes = Array.from({ length: 16 }, () => Array(16).fill('plains'));
state.biomes[8][8] = 'forest';
state.board[8][8] = { id: 'enemy', player: 2, type: 'n', contents: [api.createUnit(2, 'n', 'enemy')] };
api.renderBoard();
assert.ok(square().className.includes('biome-forest') && square().title.includes('Forest'));
assert.equal(square().children.length, 0, 'Concealed enemies must have no artwork or badges');
state.turnIndex = 1;
api.renderBoard();
assert.ok(square().children.some(child => child.className === 'piece-p2'), 'Owners can see their own forest units');
state.turnIndex = 0;
state.biomes[8][8] = 'plains';
const prisoner = { ...api.createUnit(1, 'q', 'captive'), originalPlayer: 2, prisonerOf: 1 };
state.board[8][8] = { id: 'captive-stack', player: 1, type: 'q', contents: [prisoner] };
state.eliminated[1] = true;
api.renderBoard();
assert.ok(square().children.some(child => child.className === 'piece-p2'),
    'Prisoners must retain the original color even after their original player is eliminated');
const chain = square().children.find(child => child.className === 'prisoner-board-badge');
assert.ok(chain.innerHTML.includes('stroke="currentColor"'), 'Chains must use a colorable SVG, not a fixed-color emoji');
assert.equal(chain.style.color, '#ef4444', 'Chains must use the captor color');
const styles = fs.readFileSync('styles.css', 'utf8');
assert.match(styles, /\.sq-light,\s*\.sq-dark\s*\{\s*background-color:\s*var\(--board-dark\);/,
    'Both square classes must use the same board color');
for (let player = 1; player <= 4; player++) {
    assert.match(styles, new RegExp(`\\.zone-p${player}\\s*\\{[^}]*background-color:`),
        `Player ${player}'s territory must retain its color`);
}
assert.match(styles, /\.biome-plains::before, \.biome-forest::before, \.biome-hill::before, \.biome-mountain::before\s*\{[^}]*inset:\s*5%;[^}]*z-index:\s*0;[^}]*opacity:\s*\.35;[^}]*pointer-events:\s*none;/,
    'Terrain symbols must cover the square behind pieces without intercepting interaction');
for (const biome of ['plains', 'forest', 'hill', 'mountain']) {
    assert.match(styles, new RegExp(`\\.biome-${biome}::before\\s*\\{[^}]*color:[^}]*mask:`),
        `${biome} must have a colored, scalable terrain symbol`);
}
assert.match(styles, /\.prisoner-board-badge\s*\{[^}]*top:\s*2px;[^}]*left:\s*auto;[^}]*right:\s*2px;/,
    'Prisoner chain badge must appear in the top-right corner');
assert.match(styles, /\.routed-recovery-badge\s*\{[^}]*pointer-events:\s*none;/,
    'Recovery badge must not interfere with board interaction');
state.boardSize = 12;
state.board = Array.from({ length: 12 }, () => Array(12).fill(null));
api.renderBoard();
assert.equal(boardEl.children.length, 144, 'The rendered grid must use the selected board size');
assert.equal(boardEl.style.gridTemplateColumns, 'repeat(12, 1fr)');
console.log('Board recovery badge checks passed');
