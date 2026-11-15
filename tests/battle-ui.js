// Run with: gjs -c "$(cat js/constants.js js/models.js js/game-state.js js/setup-utils.js js/battle-rules.js js/battle-ui.js tests/battle-ui.js)"
const gameState = new GameState();
const battleCandidatesEl = { innerHTML: '' };
const battleRollsEl = { innerHTML: '' };
function assert(condition, message) {
    if (!condition) throw new Error(message);
}
function candidate(player, type, count, experience = 0, armour = 0) {
    return {
        player, pieceId: `piece-${player}`, pieceType: type,
        contents: Array.from({ length: count }, (_, index) =>
            createUnit(player, type, `${player}-${index}`, `${PLAYER_CODES[player - 1]}${type}${index + 1}`, experience, armour))
    };
}
const red = candidate(1, 'n', 4);
const blue = candidate(2, 'p', 4);
const group = { candidates: [red, blue] };
const data = renderBattleCandidates(group);
assert(data.every(entry => entry.probability === 0.5), 'Rendering must preserve calculated battle odds');
assert((battleCandidatesEl.innerHTML.match(/class="battle-candidate"/g) || []).length === 2,
    'Every side must have a card');
assert((battleCandidatesEl.innerHTML.match(/class="battle-unit /g) || []).length === 8,
    'Every unit must remain visible');
assert(battleCandidatesEl.innerHTML.includes('Chance to win 50.0%'), 'Win odds must have an explanatory tooltip');
assert(battleCandidatesEl.innerHTML.includes('Raw strength 4.00 · effective weight 6.50'),
    'Strength details must remain in a tooltip');
assert(battleCandidatesEl.innerHTML.includes('An1 · XP +0% · armour +0% · winner casualty 5% · defeated capture 11%'),
    'Each unit must retain its name, bonuses and both casualty chances in a tooltip');
assert(!battleCandidatesEl.innerHTML.includes('<small>'), 'Units must not repeat stat text under their icons');
assert(!battleCandidatesEl.innerHTML.includes('battle-candidate-names'), 'Unit names must not occupy a separate row');
assert(!battleCandidatesEl.innerHTML.includes('+0%</span>'), 'Zero bonuses must not occupy badges');

const results = new Map([[red.pieceId, { casualties: [red.contents[0]] }]]);
renderBattleCandidates(group, results, new Set([blue.contents[1].id]));
assert(battleCandidatesEl.innerHTML.includes('battle-unit-marker dead'), 'Casualty markers must remain visible');
assert(battleCandidatesEl.innerHTML.includes('battle-unit-marker retreat'), 'Retreat markers must remain visible');
assert(battleCandidatesEl.innerHTML.includes('· casualty"'), 'Casualty state must have a text alternative');
assert(battleCandidatesEl.innerHTML.includes('· retreating"'), 'Retreat state must have a text alternative');

const tower = candidate(1, 'r', 1, 1, 2);
tower.isStationary = true;
tower.contents.push(createUnit(1, 'p', 'defender'), createUnit(1, 'k', 'king'));
renderBattleCandidates({ candidates: [tower, candidate(2, 'p', 1)] });
for (const description of ['Stationary Tower defence ×3', 'XP +5%', 'Armour +10%', 'Morale:', 'Size advantage:']) {
    assert(battleCandidatesEl.innerHTML.includes(description), `${description} must remain discoverable`);
}

const named = candidate(1, 'q', 1);
renderBattleCandidates({ candidates: [named, candidate(2, 'p', 1)] });
assert(battleCandidatesEl.innerHTML.includes('defeated capture 66%'),
    'Lone royal tooltip must match the new casualty base');
named.contents.push(createUnit(1, 'p', 'escort'));
renderBattleCandidates({ candidates: [named, candidate(2, 'p', 1)] });
assert(battleCandidatesEl.innerHTML.includes('Aq1 · XP +0% · armour +0% · winner casualty 2% · defeated capture 5%'),
    'Escorted royal tooltip must retain normal casualty odds');
named.contents.pop();
named.contents[0].routedStacks = 2;
named.contents[0].routedUntilRound = gameState.round + 3;
renderBattleCandidates({ candidates: [named, candidate(2, 'b', 1)] });
assert(battleCandidatesEl.innerHTML.includes('Routed strength -40%'),
    'Routed stack strength must be visible');
assert(battleCandidatesEl.innerHTML.includes('Routed ×2 · strength -40% · casualty +30pp · 3 rounds remaining'),
    'Unit tooltips must show penalties and remaining cooldown');
gameState.round += 3;
renderBattleCandidates({ candidates: [named, candidate(2, 'b', 1)] });
assert(!battleCandidatesEl.innerHTML.includes('Routed'), 'Expired penalties must disappear from battle cards');
named.contents[0].name = 'Queen "<test>&';
renderBattleCandidates({ candidates: [named, candidate(2, 'b', 1)] });
assert(!battleCandidatesEl.innerHTML.includes('<test>'), 'Unit names must be escaped in tooltips');
assert(battleCandidatesEl.innerHTML.includes('&quot;&lt;test&gt;&amp;'), 'Tooltip escaping must preserve special characters');
renderBattleCandidates({ candidates: [1, 2, 3, 4].map(player => candidate(player, 'p', 12)) });
assert((battleCandidatesEl.innerHTML.match(/class="battle-unit /g) || []).length === 48,
    'Large four-player battles must retain every unit');
renderBattleRolls(['Winner roll 1.57% selected P1 Red', 'Queen <test>: survives']);
assert(battleRollsEl.innerHTML.includes('<details'), 'Roll log must be expandable');
assert(!battleRollsEl.innerHTML.includes(' open'), 'Roll log must start collapsed');
assert(battleRollsEl.innerHTML.includes('Queen &lt;test&gt;: survives'), 'Roll details must be preserved and escaped');
print('Battle UI checks passed');
