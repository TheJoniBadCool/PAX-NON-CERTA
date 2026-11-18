class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = [];
        this.biomes = [];
        this.mapSeed = '';
        this.hillHeld = [];
        this.boardSize = 16;
        this.eliminated = [false, false, false, false];
        this.turnIndex = 0;
        this.round = 1;
        this.phase = 'PLANNING';
        this.activePlayers = [true, true, true, true];
        this.plans = [[], [], [], []];
        this.selectedSquare = null;
        this.validMoves = [];
        this.lockedPieceIds = new Set();
        this.pendingMerge = null;
        this.selectedHeldPiece = null;
        this.pendingTransfer = null;
        this.retreating = [[], [], [], []];
        this.deadPieces = [[], [], [], []];
        this.sieges = [];
        this.progressionMode = 'zero';
        this.nextUnitSequence = [1, 1, 1, 1];
        this.customSetupBoard = null;
        this.customSetupPlayer = 0;
        this.customSetupType = 'p';
        this.multiplayer = false;
        this.committed = [false, false, false, false];
        this.objectives = [[], [], [], []];
        this.scores = [0, 0, 0, 0];
        this.pendingCapture = null;
        this.resourceMode = '8';
        this.resourceBalance = 'off';
        this.resourceCapitals = false;
        this.provinceResources = Array(16).fill(null);
        this.resources = createResourceStockpiles();
        this.lastResourceProductionRound = null;
    }
}

function recordDeadPieces(gameState, units) {
    units.forEach(unit => {
        const player = unit.originalPlayer || unit.player;
        if (player >= 1 && player <= gameState.deadPieces.length) {
            gameState.deadPieces[player - 1].push({ ...unit });
        }
    });
}
