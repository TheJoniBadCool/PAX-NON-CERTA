// Shared game constants. These are classic-script globals and load before game.js.
const PIECE_SVGS = {
    'p': `<svg class="piece-svg" viewBox="0 0 45 45"><path d="M19.8 11a5.2 5.2 0 1 1 5.4 0 4.6 4.6 0 0 1-1.3 3.3c.7.8 1.6 2.1 2.1 3.7h.5a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-1c-.5 2.1-1.8 5-4.5 5-2.7 0-4-2.9-4.5-5h-1a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2h.5c.5-1.6 1.4-2.9 2.1-3.7a4.6 4.6 0 0 1-1.3-3.3zM11 36h23v3H11z"/><path d="M13 33h19v3H13z"/></svg>`,
    'r': `<svg class="piece-svg" viewBox="0 0 45 45"><path d="M9 39h27v-3H9v3zm3-3h21v-4H12v4zm2.5-4h16l1-15H13.5l1 15zM12 9v7h4V9h3v7h4V9h3v7h4V9h3"/><path d="M11 16h23v3H11z"/></svg>`,
    'n': `<svg class="piece-svg" viewBox="0 0 45 45"><path d="M13 34c1-3 1-7-1-10-2-3-1-7 2-10 2-2 5-3 8-3l4 4c2 2 4 3 7 4-2 2-4 3-7 3h-3c2 2 5 4 7 7l2 5H13z"/><path d="M18 11c-2-3-1-6 1-8 2 2 4 4 4 7l-2 3z"/><circle cx="24" cy="16" r="1.3"/><path d="M11 39h23v-3H11z"/></svg>`,
    'b': `<svg class="piece-svg" viewBox="0 0 45 45"><path d="M9 36h27v3H9zm3-3h21v3H12zm2-3h17l1-6C32 20 28 12 22.5 10c-5.5 2-9.5 10-9.5 17l1 3z"/><circle cx="22.5" cy="8" r="2.5"/><path d="M22.5 15v5M20 17.5h5"/></svg>`,
    'q': `<svg class="piece-svg" viewBox="0 0 45 45"><path d="M9 36h27v3H9zm3-3h21v3H12zm-1-3l2.5-16.5L22.5 27l9-10.5L34 30H11z"/><circle cx="9" cy="12" r="2"/><circle cx="15.5" cy="9.5" r="2"/><circle cx="22.5" cy="8.5" r="2"/><circle cx="29.5" cy="9.5" r="2"/><circle cx="36" cy="12" r="2"/></svg>`,
    'k': `<svg class="piece-svg" viewBox="0 0 45 45"><path d="M10 36h25v3H10zm3-4h19v4H13zM12 32l2-14 5 5 3.5-9 3.5 9 5-5 2 14H12z"/><path d="M20 14l2.5-5 2.5 5zM22.5 9V5M20 7h5"/></svg>`,
    'catapult': `<svg class="piece-svg" viewBox="0 0 45 45"><path d="M9 37h27v3H9zM15 34h15l-2-17h-3l-1 8-4-8h-3z"/><path d="M19 18c-4-4-5-8-3-12 5 1 8 4 9 8l-2 4zM25 14l12-7-2 8-8 4z"/><circle cx="16" cy="8" r="2"/></svg>`
};

const PLAYERS = [
    { id: 1, name: 'Red', color: '#ef4444', class: 'piece-p1', zone: [0, 0, 3, 3] },
    { id: 2, name: 'Blue', color: '#3b82f6', class: 'piece-p2', zone: [0, 12, 3, 15] },
    { id: 3, name: 'Green', color: '#10b981', class: 'piece-p3', zone: [12, 12, 15, 15] },
    { id: 4, name: 'Yellow', color: '#eab308', class: 'piece-p4', zone: [12, 0, 15, 3] }
];
const PLAYER_CODES = ['A', 'B', 'C', 'D'];

const CASUALTY_WEIGHTS = { k: 0.5, q: 0.1, b: 0.15, n: 0.2, p: 0.25, r: 0 };
const STACK_ADVANTAGE_RATE = 0.20;
const BATTLE_ODDS_CURVE = 1.35;
const WINNER_CASUALTY_FACTOR = 0.5;
const SAVED_SETUP_STORAGE_KEY = 'paxnoncerta-custom-setups';
const LEGACY_SAVED_SETUP_STORAGE_KEY = 'chesssim-custom-setups';
