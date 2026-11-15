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
['constants', 'models', 'game-state', 'board-renderer'].forEach(name =>
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
assert.match(styles, /\.prisoner-board-badge\s*\{[^}]*top:\s*2px;[^}]*left:\s*auto;[^}]*right:\s*2px;/,
    'Prisoner chain badge must appear in the top-right corner');
assert.match(styles, /\.routed-recovery-badge\s*\{[^}]*pointer-events:\s*none;/,
    'Recovery badge must not interfere with board interaction');
console.log('Board recovery badge checks passed');
