class GameState {
    constructor() {
        this.reset();
    }

    reset() {
        this.board = [];
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
        this.sieges = [];
        this.progressionMode = 'zero';
        this.nextUnitSequence = [1, 1, 1, 1];
        this.customSetupBoard = null;
        this.customSetupPlayer = 0;
        this.customSetupType = 'p';
        this.multiplayer = false;
        this.committed = [false, false, false, false];
    }
}
