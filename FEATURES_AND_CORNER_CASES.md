# PaxNonCerta

## Purpose

This document is the source of truth for the currently implemented game features
and the corner cases that must be considered before adding or changing features.
It describes the behavior in the current HTML/JavaScript prototype, not standard
chess rules.

## Current Features

### Game setup

- The game uses a 16x16 board.
- A new game starts with a player-selection modal.
- At least two of four players must be selected.
- Players are fixed to board corners:
  - Red / Player 1: top-left 4x4 zone.
  - Blue / Player 2: top-right 4x4 zone.
  - Green / Player 3: bottom-right 4x4 zone.
  - Yellow / Player 4: bottom-left 4x4 zone.
- Each selected player receives 12 randomly placed pieces in their 4x4 zone:
  - 1 King
  - 1 Queen
  - 2 Towers (Rooks)
  - 2 Horses (Knights)
  - 2 Bishops
  - 4 Pawns
- A selected player's 4x4 zone has 16 cells, so four cells remain empty.
- Unselected players have no pieces and are marked eliminated from the start.
- Setup can use either the default random corner positions or custom placement.
- Custom placement is performed by one player before the game starts:
  - The user selects a player and piece type, then clicks or taps board squares to place pieces.
  - Each selected player must have exactly one King.
  - All non-King piece types and quantities are unrestricted.
  - Same-player pieces may intentionally start in stacks.
  - Different players may not share a starting square.
  - Custom pieces may be placed anywhere on the 16x16 board.
  - Reset clears all custom placements; Confirm Placement starts the game.
- A new game resets the board, round, plans, overlays, selections, merge state,
  and combat log.
- Opening the page shows the player-selection modal.

### Board and interface

- The board is rendered as a 16x16 grid with alternating square colors.
- Corner spawn zones are visually highlighted.
- Pieces use inline SVG artwork and player-specific colors.
- On even-numbered rounds, every piece containing a Pawn displays a `zzz` marker
  to indicate that the Pawn is resting.
- Pieces belonging to an eliminated player are rendered gray across the board,
  movement animations, and battle displays.
- The left panel shows the current phase, current player, planning controls,
  player statuses, and a four-part time-of-day clock.
- The center panel shows the board, planned-move arrows, movement animation,
  collision overlay, merge prompt, and piece tooltip.
- A collision overlay shows the involved candidate stacks visually.
- Collision resolution requires **Start Battle** before the weighted roll and
  **Proceed** after the winner is shown.
- The right panel shows the combat log and round number. Hiding the combat log
  removes its entire panel and gives the board more space; showing it again
  preserves all log entries.
- The Rules button opens the in-game rules modal.
- New Game and Play Again reopen player selection.
- A privacy overlay asks players to pass the device between planning turns.
- During gameplay, clicking or tapping a friendly piece selects the whole stack.
- Clicking or tapping an adjacent valid destination performs the selected move,
  merge, transfer, or unmerge action, taking priority over selecting that piece.
- Right-clicking a friendly piece opens its unit list without queuing an action.
  On touchscreens, holding a piece for 500 ms opens the same popup. Selecting a
  movable unit from the list changes the selection to that unit.
- Long presses must not also trigger a tap action; dragging, scrolling, or
  cancelling the pointer cancels the pending long press.
- Custom setup uses click or tap for placement; right-click does not place pieces.

### Turn and planning model

- The game is local hotseat play on one device.
- Players plan moves privately, one player at a time.
- The active player may plan zero, one, or multiple moves.
- A player locks in their plan with **Commit Plans**.
- **Reset Plans** clears only the active player's current plans and
  planning selections.
- The next non-eliminated player receives the device.
- Once every non-eliminated player has planned, all plans resolve simultaneously.
- Planned moves are displayed with arrows:
  - Green: ordinary move.
  - Yellow: merge or same-player destination conflict.
  - Red: enemy collision, stationary enemy target, or enemy swap.
  - Blue: held-piece transfer.
- Planned movement is animated before resolution.
- The round number increments after resolution.
- The clock is decorative and advances once per completed round, cycling through
  Dawn, Day, Dusk, and Night. Round 1 starts at Dawn; starting a new game resets
  the clock. Multiplayer clients display the host's current round.

### Movement rules

- Every movable piece moves exactly one square.
- Movement is allowed in all eight directions.
- Movement is bounded by the 16x16 board.
- Current piece types are:
  - Pawn (`p`)
  - Tower/Rook (`r`)
  - Horse/Knight (`n`)
  - Bishop (`b`)
  - Queen (`q`)
  - King (`k`)
- Piece-specific chess movement, check, checkmate, castling, en passant, and
  promotion are not implemented.
- Pawns may move on odd-numbered rounds only, beginning with round 1.
  On even-numbered rounds, a Pawn cannot move, merge, unmerge, transfer, or
  initiate an attack, except that a ready siege attacker may launch its
  previously deployed assault.
- A stack containing any Pawn may move as a whole only on odd-numbered rounds.
  On even-numbered rounds, its non-Pawn units may still be unmerged and moved
  individually, including by transfer or attack; its Pawn units cannot be
  moved separately. Such a stack may receive non-Pawn units and remains a
  valid target for enemy attacks. A whole stack may also Sally Out from a
  besieged Tower on an even-numbered round.
- Starting a new siege is allowed only on odd-numbered rounds. This restriction
  does not prevent launching a ready siege assault or performing a Sally Out.
- This rule applies to both hotseat and multiplayer games. Other non-Pawn
  pieces and stacks retain their normal movement on every round.
- Every unit has a stable human-readable name based on its player and type:
  - Player A: `Ap1`-`Ap4`, `Aq1`, `Ar1`-`Ar2`, `An1`-`An2`, `Ab1`-`Ab2`, `Ak1`.
  - Players B, C, and D use the same numbering with their player prefix.
- Unit names are preserved when pieces merge, unmerge, transfer, move, or
  participate in a battle.
- Towers are stationary obstacles/defenses:
  - They cannot be selected for ordinary movement.
  - At the start of each game, each Tower receives one random in-bounds cardinal
    gate, indicated by an arrow on the Tower. It keeps this gate when captured.
  - Enemy sieges and friendly merges, transfers, and unmerges must use the
    adjacent gate square. Diagonal and other adjacent squares cannot be used.
  - Towers start with at least two intervening squares in every direction,
    including diagonals; custom placement and saved setups must obey this rule.
  - They cannot be selected as held pieces for unmerge or transfer.
- A friendly occupied adjacent square may be selected as a merge destination.
- A friendly piece that is already committed to a merge cannot be selected again
  during the same planning turn.
- A planned ordinary move from a piece can be replaced by selecting that piece
  and choosing another destination.
- On even-numbered rounds, reject a whole-stack action if the source stack
  contains a Pawn. Reject any unmerge or transfer of a Pawn unit, but allow a
  non-Pawn unit inside a Pawn-containing stack to move independently.
- On even-numbered rounds, a Pawn or Pawn-containing stack may still be a
  stationary friendly merge/transfer target or an enemy attack target.
- On even-numbered rounds, allow an existing siege attacker to assault only
  when its timer is 0 and it targets the besieged Tower. Allow a valid Sally
  Out from a besieged Tower regardless of round parity.
- Reject any new siege deployment on an even-numbered round.
- The multiplayer host must reject plans that violate the even-round pawn
  restrictions, while accepting only valid ready siege assaults and Sally Outs
  as exceptions, even if a client submits them directly.
- Same-player pieces may pass through or otherwise plan around each other; paths
  are not blocked by friendly planned movement.
- A move into an enemy piece is allowed and becomes a collision/capture decision
  during simultaneous resolution.

### Merging and stacks

- A player may explicitly move onto a friendly adjacent piece and choose Merge.
- An accepted merge commits both involved pieces for the current planning turn.
- Two or more same-player moves targeting the same square merge automatically.
- Same-player moves may also merge with a stationary friendly target when an
  explicit merge/transfer is accepted.
- A merged stack stores all underlying unit records in `contents`, including
  each unit's stable ID, player, type, and human-readable name.
- The displayed stack type follows this precedence:
  1. Tower
  2. Pawn
  3. Horse
  4. Bishop
  5. King
  6. Queen
- A stack displays a count badge.
- A stack can contain multiple units, including multiple units of the same type.
- Towers retain precedence in the displayed type even though they remain
  unmovable.
- All pieces belonging to an eliminated player become stationary. They cannot
  be selected, moved, unmerged, or transferred, but they remain on the board
  and can participate in battles as stationary targets.

### Unmerge and held-piece transfer

- Right-clicking a friendly stack exposes its held pieces individually.
- A held Tower cannot be unmerged or transferred.
- A movable held piece can be selected and sent to an adjacent square.
- A selected held piece can be transferred into an adjacent friendly stack after
  confirmation.
- Unmerge and transfer plans are resolved as separate movement intents.
- The selected held unit is removed from its source stack before destinations
  resolve.
- If an unmerge destination is contested, it participates in collision handling.

### Simultaneous resolution

- All active players' plans are collected and resolved in one simultaneous phase.
- Resolution follows this order:
  1. Moving pieces leave their original squares and are considered at their planned destinations.
  2. Two-way opposing interceptions are resolved first. The loser disappears and the winner is placed at its own planned destination.
  3. All candidates belonging to the same player on each square merge into one stack.
  4. Every remaining opposing-player stack on the same square fights.
- Ordinary non-conflicting moves remove all sources before placing destinations,
  allowing safe same-player movement interactions.
- Three collision categories are recognized:
  - Target collision: multiple moves target one square, or one move targets a
    stationary occupant.
  - Swap interception: opposing pieces exchange source and destination squares.
  - Merge: same-player pieces combine at a destination.
- Same-player candidates merge before any battle, including when a destination
  contains both friendly and enemy candidates.
- An interception winner can be joined by other planned arrivals at its
  destination; those candidates merge by player before the resulting stacks
  battle.
- Enemy collision groups show every involved candidate after same-player
  consolidation.
- Every involved candidate always fights; there is no flee choice.
- Fighting candidates are selected by weighted random survival.
- If any candidate contains a Pawn, Tower, or Horse, the battle uses the
  standard league:
  - Base stack size counts only Pawns, Towers, and Horses.
  - A candidate receives a 20% bonus for every counted unit it has above the
    strongest opposing candidate's counted stack size. The resulting strength
    is raised to the 1.35 power before weighted random selection, making stack
    size more influential while preserving a chance for an underdog.
  - The base weight receives a 10% bonus per King, a 5% bonus per Queen, and a
    5% bonus per Bishop.
- If every candidate contains only Kings, Queens, and Bishops, the battle uses
  the elite league:
  - All units count toward stack size, including Kings.
  - The 20% stack-size advantage and 1.35 odds curve apply.
  - No King, Queen, or Bishop morale bonuses apply.
- A King, Queen, or Bishop does not count toward standard-league stack size.
- The survivor is placed at its intended destination.
- Collision results and ordinary moves are written to the combat log.
- Battle cards show the source of each percentage bonus, raw and effective
  strength, and winner/defeated casualty percentages. The result panel shows
  the winner-selection roll and every casualty roll as percentages.

### Elimination and victory

- A player is eliminated when no stack containing that player's King remains.
- A King inside a stack counts as alive.
- Eliminated players are skipped during future planning.
- Remaining pieces owned by eliminated players are gray and stationary, but may
  still be attacked and included in collision battles.
- When one or fewer non-eliminated players remain, the game enters `GAME_OVER`.
- The remaining player is shown as the winner.
- If no active player remains, the UI shows a draw.
- The game-over modal can start another game through player selection.

### Main menu and online multiplayer

- The page opens on a main menu with **Hotseat** (all behavior above, unchanged)
  and **Multiplayer**.
- Multiplayer uses PeerJS/WebRTC with the host-as-authority model. The room
  creator's browser runs all rules, dice, and resolution; other browsers plan
  their own colour and mirror the host's board, combat log, and battle window.
  The app is static and can be hosted on GitHub Pages.
- Lobby: the creator gets a 5-character room code and picks 2-4 players and the
  unit-progression mode. Joiners take the first free colour (creator is Red).
  The creator can start only when every chosen slot is filled and connected.
  Custom placement is not available in multiplayer; corners are random.
- Planning is simultaneous and private. Each player sees only their own plan and
  arrows; other players only see a "Locked in" status. A player can unlock a
  locked plan until the last non-eliminated player locks in, at which point the
  round resolves immediately in the usual order (move, merge, battles).
- Only the room creator can press Start Battle and Proceed; other players see
  the same battle window read-only.
- **Cancel Siege** is a planned action in multiplayer (hotseat still cancels
  immediately). It replaces any other plan for that catapult, so the besieging
  stack does nothing else that round, and is applied during the movement phase.
  If the defender plans **Sally Out** the same round, the sally battle still
  happens against the cancelling catapult.
- Armour upgrades are applied by the host (clients send a request) and are only
  accepted during planning.
- Eliminated players stay in the room as spectators and are not waited on.
- A disconnected player keeps their colour and can rejoin with the same room
  code from the same browser tab session; the round waits for them. The creator
  can use **Skip Disconnected Players** to give them an empty plan.
- If the creator closes the room, the match is lost. Only the creator can
  restart (returns everyone to the lobby); others can only leave.
- The host validates submitted plans (squares, ownership, adjacency) and
  rebuilds stack contents from the authoritative board.

## Corner Cases and Required Invariants

The feature agent must check these cases before implementing any new feature.
If the intended behavior is not already defined here, it must stop and ask for
clarification rather than guessing.

### Setup and player selection

- Fewer than two players selected must be rejected.
- Exactly two or three players must work without waiting for unselected players.
- A player selected after a previous game must receive a fresh random setup.
- An unselected player's corner must remain empty.
- The first active turn must be the lowest-numbered selected player.
- Every selected player's generated piece coordinates must be unique.
- Random generation must still create exactly 12 pieces per selected player.
- Every generated unit must have exactly one stable name, and names must be
  unique within each player and piece type.
- Custom setup must require exactly one King for every selected player, allow
  arbitrary non-King quantities, and preserve unique stable unit names.
- Custom setup must allow same-player stacks, reject cross-player overlap, and
  allow placements outside the default corner zones.
- Custom setup Reset must clear every placement, and Confirm Placement must not
  start until every selected player has a King.
- Restarting during a prior game must not retain old plans, stacks, overlays,
  eliminations, or log entries.

### Turn transitions

- A player may lock in with no moves.
- Eliminated players must be skipped when advancing.
- The final active player must resolve immediately rather than waiting for an
  eliminated player.
- The planning overlay must not allow clicks through to the board.
- Resetting a plan must not clear other players' plans.
- A player must not edit plans while the game is transitioning, resolving, or
  over.
- After resolution, the next planning turn must begin with a still-active player.

### Movement boundaries and occupancy

- A piece on every board edge and corner must expose only in-bounds neighbors.
- Towers must remain immovable through every UI path, including stacks,
  unmerge, transfer, and replacement of plans.
- A stack whose displayed type is Tower must not accidentally become movable.
- A friendly destination may be empty, occupied, already planned from, or a
  stationary target; each case must preserve the documented merge behavior.
- An enemy destination may be stationary, moving away, part of a swap, or also
  targeted by another move.
- Two plans must not silently reference a piece that no longer exists.
- A stale selection must be cleared if the selected source changes or disappears.
- Clicking or tapping a valid destination queues the selected action.
  Right-click and long press only open unit lists, never queue actions.
- A single-piece list must behave like a stack list: if no individual unit is
  selected, the whole piece remains selected.

### Planning conflicts

- Replanning one piece must remove only that piece's previous ordinary plan.
- Explicit merge commitments must remain locked until the plan is reset or
  resolved.
- A piece must not be used simultaneously in an ordinary move and an unmerge.
- A held index must be interpreted against the source stack consistently when
  multiple held units are unmerged in one turn.
- Multiple unmerge plans from one stack must not remove the wrong held units.
- Transferring a held unit into a friendly target must not duplicate it.
- Canceling a merge or transfer must leave the board and plans unchanged.
- Resetting a plan must clear pending merge/transfer UI state.

### Resolution and collisions

- A no-op move must not create an unintended collision or duplicate a piece.
- Two friendly moves to one destination must merge all candidates exactly once.
- An explicit merge and an automatic same-square merge must not double-count a
  candidate.
- In a mixed friendly/enemy target collision, all same-player candidates must
  merge before opposing stacks battle.
- A two-way interception must resolve before any merge or battle at either
  planned destination.
- An interception winner must be included in any later merge or battle at its
  planned destination, while the loser must not remain on the board.
- An enemy move into a stationary Tower must create a collision.
- A swap must be recognized only for opposing players; same-player swaps should
  not become battles.
- A move participating in a merge must not also participate in an enemy battle.
- A destination with multiple enemy movers and a stationary occupant must include
  all valid candidates exactly once.
- A source that was vacated by another move must not be incorrectly treated as
  stationary.
- Sequential collision groups must not overwrite results from earlier groups.
- If all candidates fight, exactly one candidate must survive when the group has
  at least one candidate.
- A survivor must retain its full `contents`, player, and identity.
- Weighted probabilities must remain valid when candidates have one unit,
  unequal stack sizes, or equal stack sizes.
- Random resolution must not produce an undefined survivor.
- The collision overlay must remain active until Start Battle is pressed, then
  remain active until Proceed is pressed after the result is shown.
- Every candidate in a collision group must participate in the fight, including
  collisions involving an unselected or already eliminated player only if such
  a candidate can actually exist.

### Stacks and King state

- A King can be moved, merged, unmerged, transferred, or survive a battle without
  losing King presence.
- A King inside a stack must keep the owning player alive.
- A player must be eliminated only after the complete resolution phase.
- Removing the last non-King unit from a stack must not eliminate its player.
- Removing or losing the King from a stack must eliminate the player even if other
  units remain in that stack.
- A stack with no contents must never remain on the board.
- Eliminating a player must immediately gray all of that player's remaining
  pieces and prevent all movement, unmerge, and transfer interactions for them.
- The displayed type after unmerge must recalculate from the remaining contents.
- Merging stacks must preserve every underlying unit and the correct player.

### UI and lifecycle

- Modal overlays must not retain stale text, choices, or buttons between groups.
- Rules, privacy, merge, collision, and game-over modals must not overlap in a
  way that makes the game inaccessible.
- Right-click tooltip positioning must remain usable near board edges.
- A rapid restart or repeated confirmation must not start duplicate resolutions.
- Browser reload is not expected to restore an in-progress game.
- Randomness is intentionally non-deterministic; reproducible replays are not
  currently supported.
- The game has no dedicated server, persistence, accounts, or AI opponents.
  Hotseat is client-only; multiplayer is peer-to-peer through the host browser.
- Multiplayer: a locked-in plan cannot be edited; unlock first. A reload of a
  client restores their locked plan from the host; an unlocked plan is lost.
- Multiplayer: a client that unlocks just as the last player locks in loses the
  race; the host ignores unlock once resolution has begun.
- Multiplayer: Cancel Siege against a Sally Out in the same round fights the
  catapult; if the catapult is destroyed earlier in the same round, no sally
  battle occurs.

## Feature-Change Protocol

Before implementing a requested feature, the feature agent must:

1. Read this document and inspect the affected code paths.
2. Enumerate normal behavior and all new interaction, state, resolution, and
   lifecycle corner cases introduced by the feature.
3. Report any corner case or requirement not defined here.
4. Ask the user for the missing decision/input and stop implementation until the
   answer is provided.
5. Implement only after the behavior is sufficiently specified.
6. Validate the implementation and report what was checked.
7. Ask whether this document should be updated with the feature and its new
   corner cases. The documentation update requires user approval.

No feature agent may silently choose behavior for an undocumented rule that can
change gameplay, player interaction, state transitions, or victory outcomes.
