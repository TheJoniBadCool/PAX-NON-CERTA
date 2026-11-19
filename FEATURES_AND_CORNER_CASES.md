# PaxNonCerta

## Purpose

This document is the source of truth for the currently implemented game features
and the corner cases that must be considered before adding or changing features.
It describes the behavior in the current HTML/JavaScript prototype, not standard
chess rules.

## Current Features

### Game setup

- At game start, the host/player chooses a 12x12 or 16x16 board.
- A new game starts with a player-selection modal.
- At least two of four players must be selected.
- **Corner Position** is the default: Red starts top-left, Blue top-right,
  Green bottom-right, and Yellow bottom-left. Each corner province is 3x3 on
  a 12x12 board or 4x4 on a 16x16 board.
- Each selected player receives one castle stack holding their full 12-unit
  roster: two Towers, two Bishops, four Pawns, two Horses, a Queen, and a King.
- Unselected players have no pieces and are marked eliminated from the start.
- Starting-position options in Hotseat and the Multiplayer lobby are **Corner
  Position**, **Custom placement**, **Random**, and **Gentleman's Agreement**.
- Random assigns each active player a distinct province anywhere on the map;
  the seed reproduces provinces, armies, gates, terrain, and resources.
- Gentleman's Agreement generates an initially all-rebel map. After Start Game,
  players select/deselect unclaimed provinces on the complete, unfogged map.
  Online, each player selects only their own province and locks it with the green
  **Good luck, good Sirs!** button; play starts after all active players confirm.
  The host serializes competing claims and rejects duplicate, stale, invalid,
  or locked changes. Rejoining restores the selection and confirmation state;
  disconnected players are not automatically assigned or skipped.
- In Hotseat agreement, one person switches between active players, assigns
  distinct provinces to everyone, then confirms once for all players.
- Agreement replaces each chosen province's rebel garrison with the normal
  player roster in its existing castle and removes its outside rebel Pawn.
  Castle squares, gates, terrain, resources, and unchosen rebels stay unchanged.
  Resources are generated while all 16 provinces are rebel-owned (12 sites in
  the default resource mode, 16 in the other modes); choosing a resource province
  keeps its resource even when capital resources were disabled. This is disclosed
  in the selection screen. Objectives are initialized for the final armies.
- Normal planning is blocked until agreement completes. Starting a new match
  clears all selections and confirmations; changing mode invalidates previews.
- Custom placement is performed by one player before the game starts:
  - The user selects a player and piece type, then clicks or taps board squares to place pieces.
  - Sandbox piece types and quantities are unrestricted, including multiple or no Kings, Queens, or Towers; rebels may also be placed.
  - Objectives for missing starting units are omitted; some sandbox armies cannot reach the normal winning score.
  - Same-player pieces may intentionally start in stacks.
  - Different players may not share a starting square.
  - Custom pieces may be placed anywhere on the selected board.
  - The placement board keeps square, equally sized cells at either board size; scroll the modal to reach the full board on smaller screens.
  - Generate Map displays biomes, province ownership, and resources directly on the placement grid behind the pieces. Piece edits preserve the map.
  - Editor tools paint any biome, erase pieces, and add/update or erase resource sites anywhere, including mountains. Different resource types can share a square; each site has its own 0–100% production probability and produces independently for its province owner.
  - Seed and generation-setting changes preserve manual edits. Generate Map explicitly replaces terrain/resources after confirmation.
  - Saved sandbox setups retain the complete map, probabilities, seed, and army; multiplayer uses the same edited map.
  - Reset clears pieces without changing terrain/resources; Confirm Placement can start any army composition, including an empty board. Without generation, the editor starts from blank plains.
  - Exit to Menu is available in the placement and player-selection screens.
- A new game resets the board, round, plans, overlays, selections, merge state,
  and combat log.
- Opening the page shows the player-selection modal.

### Alliances and war

- Every pair of selected players starts at war. Each player card publicly shows
  its alliances with a handshake and wars with crossed swords, followed only by
  the other players' colored balls. Unselected and eliminated players are omitted.
- During planning, the button next to another player's name opens a popup with
  **Declare War** and **Request Allegiance**. The current relationship's option
  is grayed out and disabled; round and commitment locks disable both options.
  Handshakes are gray. Alliance and war lists are separated by a visible `|`.
  Incoming online requests show an amber highlighted, gently pulsing sender card
  and an explicit request label beside the response controls. Reduced-motion
  preferences replace the pulse with a static highlight.
  Requests leave the pair at war until the recipient accepts. Requests are public.
- Accepting immediately releases each new ally's prisoners belonging to the other,
  including captives in retreating armies. Released units enter the usual
  three-round retreat without routed penalties. Their queued prisoner actions,
  splits/transfers, and moves of emptied stacks are cancelled, even if committed.
  Other players' prisoners are unaffected.
- Each pair permits one initiation per round. Declaring war, requesting an
  alliance, accepting, or declining cannot be undone that round. A pending
  request can only be answered by its recipient. Declining leaves the pair at war;
  another request is possible next round. Actions do not propagate to third parties.
- Multiplayer actions are validated and serialized by the host using the sender's
  room slot and current match/round. Committed players must unlock to initiate,
  but may accept or decline while committed. Resolution waits for everyone to
  commit and for every request to be answered; requests do not expire silently.
  The host's Skip Disconnected Players action explicitly declines outstanding
  requests involving those players, including players who already committed.
- In Hotseat, requests are made during planning but answered in a separate private
  handoff stage after all players plan and before movement resolves. Only recipients
  with pending requests are prompted, including an earlier planner receiving a
  request from a later planner. Objectives, resources, and move controls stay hidden
  or unavailable during review. Without requests, resolution starts as before.
- Reset Plans and multiplayer unlocks never undo diplomacy. Snapshots/rejoins retain
  relationships, pending requests, and round locks. New games reset all relationships
  to war and clear pending reviews; diplomacy is unavailable during setup, handoffs,
  resolution, or game over.
- Allies may occupy the same ordinary square without fighting or combining
  ownership. One stack per owner is retained; same-owner arrivals still merge.
  Two to four smaller, staggered icons show each visible army, with one yellow
  badge showing the total number of visible pieces on the square.
  Clicking/right-clicking/long-pressing the square selects only the current
  player's army, regardless of drawing order. Moves, group splits, prisoner
  decisions, and multiplayer plan validation use that owner's stack.
- Allied exchanges do not intercept. Allied Tower squares cannot be entered:
  no visiting garrisons, ownership transfer, or new allied sieges. Existing
  sieges against a newly allied player end at resolution and stale siege actions
  are cancelled. Armies may share a besieger's ordinary square without sharing
  ownership or its siege action.
- Direct allies share province and troop sight, including Bishop and sight-size
  effects. Allied troops are visible in forests; enemy forest concealment stays
  unchanged. Vision is not transitive, and ends when war is declared or an ally
  is eliminated. Private plans, objectives, and resources are not shared.
- Allies on one combat side combine strength against common enemies; each side
  must be mutually allied internally and hostile to every opposing member.
  An ally of both combatants stays out. Remaining hostile pairs fight afterward.
  Own survivors, casualties, experience, and routed retreats retain their owners.
  Joint strength and its normal bonuses are calculated as one combat side;
  stationary terrain defence is shared within that side.
- Declaring war while co-located causes a battle at resolution if both armies
  remain. Moving apart avoids it. Prisoner-only armies cannot fight one another
  and remain separate until a combat-capable enemy is present.
- Joint winners unanimously choose a castle owner, and separately a player to
  handle all captured prisoners through the normal keep/execute controls.
  Only victorious participants vote, not neutral bystanders.
  Online votes belong to the authenticated room slot; Hotseat hands the device
  to each participant. Votes and current negotiation survive guest reconnects.
  Resolution waits, including for disconnected participants to rejoin.
- Disagreement offers re-decision or unilateral war against another participant.
  This exceptional declaration bypasses the normal round lock and immediately
  starts another battle; castle/prisoner agreements are reconsidered afterward.
  Castles keep their identities; the eventual owner alone receives ownership.
  Other victorious armies stay on their original adjacent siege squares. An enemy
  occupying that square triggers an immediate battle, including any prisoners
  already assigned to the returning army. Sally Out keeps the castle in place
  and returns surviving besiegers to their original squares.
- Shared cells, per-owner hill history, and pending negotiations are included in
  multiplayer state. New games clear pending prisoner recipients and negotiations.
  Resources, objectives, and victory conditions remain per-player and unchanged.

### Terrain

- Each match generates multiple irregular terrain patches aiming for 10%
  mountains, 20% hills, 20% forest, and the remaining plains, rounded to whole
  squares. Patches aim to stay within six mountain or ten hill/forest squares,
  measured with eight-direction adjacency; crowded custom setups can exceed
  those limits. Hills tend to form near mountains. Castles start on plains; starting pieces and castle
  gates are never mountains. Non-mountain, non-castle squares stay connected
  using eight-direction movement. Crowded custom setups can reduce the ratios.
- Mountains cannot be entered by whole stacks, unmerged units, or retreating
  units. The host rejects multiplayer plans targeting mountains.
- Enemy forest forces are hidden in the interface except in combat panels and
  at game over.
  Their planned destinations look empty; movement animations and log entries
  do not reveal forest coordinates. Forest defenders who remain in place gain
  25% strength when attacked. Hidden prisoner encounters use the normal
  prisoner rules. Concealment is visual, not network secrecy.
- A hill defender gains 25% strength if at least one of its combat units
  remained on the hill throughout the previous round and stays to defend.
  Reinforcements share the defender's bonus; arrivals alone and swap
  interceptions do not. Terrain strength applies before the odds curve.
- The authoritative multiplayer snapshot includes terrain and hill occupancy
  history, including when a guest rejoins.

### Resources

- Hotseat and Multiplayer hosts choose **8 resources** (default),
  **12 resources**, or **16 resources** before previewing their map. Changing this choice invalidates
  the preview; the seed and mode reproduce the same resource assignments.
- With 12 rebel provinces, the default mode covers eight randomly selected
  provinces with 1 horse, 3 food, 2 wood, 1 metal, and 1 gold.
- By default full mode covers all 12 rebel provinces with 2 horses, 4 food, 3 wood, 2 metal,
  and 1 gold.
- The 16-resource mode places one resource in every province, regardless of
  ownership, with 3 horses, 5 food, 4 wood, 3 metal, and 1 gold.
- Every board size has 16 provinces. If the rebel count differs, default mode
  places rebels minus four resources (minimum zero), full mode places the rebel count, and
  16-resource mode always covers all provinces. Resource counts use proportional
  largest-remainder rounding with random ties.
- The optional **Allow resources in player capitals** checkbox adds exclusively
  player-owned provinces to the random placement pool without increasing the
  resource count or guaranteeing resources in capitals. It defaults off for
  8/12 resources and is checked and locked for 16 resources. It works with
  quadrant balancing and is included in seeded previews and multiplayer state.
- Custom setups use their actual exclusively rebel-owned provinces to calculate
  the 8/12 resource count; no rebels are added. Capitals can join the pool when
  enabled, but empty and contested provinces cannot. The 16-resource mode still places
  one resource in every province, including empty and mixed-ownership provinces.
- By default each province's resource independently receives a uniformly random whole-number
  production chance from 5% through 95%, inclusive, at map generation. Optional
  balanced mode assigns whole-number chances of at least 5% that sum to exactly
  25% within each populated 2x2 corner quadrant. Empty quadrants are either
  allowed (and total 0%) or prohibited, according to the host's selection.
  When prohibited, eligible provinces are selected to cover all quadrants;
  an impossible custom map or resource count produces a preview error instead.
  Counts need not be equal across quadrants. Changing balance invalidates previews.
  Resource icons are public even in fog and forests; tooltips show their chance.
  Resource types and chances are fixed to provinces, not castles, persist through
  conquest, and are reproduced by the map seed. There are no production numbers.
- All resource icons use the first non-mountain square in their province, both
  on the board and in map previews; resources are never displayed on mountains.
- After each fourth completed round (4, 8, 12, ...), after combat, sieges,
  re-entry, and eliminations, each eligible province rolls independently against
  its fixed chance to produce one resource for its current active,
  non-eliminated owner. Every resource can succeed or fail.
  Rebel, empty, and contested provinces produce nothing. The public log announces
  production checks without revealing private results. Duplicate production is prevented.
- Players start with zero resources; stockpiles have no cap and no spending
  mechanic. Cards use icon-and-count rows visible only to their own player.
  Hotseat handoff and resolution clear and hide all stockpile rows. Multiplayer
  snapshots/rejoins carry public assignments, chances, and the last production round but only the
  recipient's stockpile. The authoritative host retains all stockpiles.
- New games reset assignments, stockpiles, and production history.

### Fog of war

- Fog sight is selected before the match in Hotseat or by the Multiplayer host;
  Medium is the default, and snapshots and reconnects carry the selection.
- Medium and Large reveal owned provinces and all eight neighboring provinces,
  including diagonally touching ones. Small reveals owned provinces and only
  squares up to two steps from them in any direction, including diagonals.
  Sight does not chain through neighbors. Ownership uses the same castle-based
  rules as province coloring; empty, rebel, and contested provinces grant no
  ownership sight.
- On Small and Medium, every friendly piece reveals its square and the eight
  surrounding squares; a stack with a non-prisoner Bishop reveals a 5x5 area.
  On Large these areas become 5x5 and 7x7, respectively. All sight is clipped
  at the board edge.
- Fog hides enemy and rebel troops, but terrain, province ownership, Towers,
  and Tower gates remain visible. A concealed castle exposes only its Tower
  units, not its garrison, garrison count, prisoners, or recovery badges.
- Forest concealment remains independent: revealing a forest square does not
  reveal enemy troops or castle garrisons there. The existing rebel exception
  to forest concealment applies only when their square is outside fog.
- Sight follows actual positions and castle ownership, not queued plans.
  Moving, merging, unmerging, captures, casualties, and re-entry recalculate
  sight; there is no remembered exploration.
- Hotseat planning follows the current player. Hotseat resolution combines
  active, non-eliminated players' fog sight without removing forest hiding.
  Multiplayer keeps the local player's sight during planning and resolution.
- Animations require both endpoints to be visible without forest concealment.
  Siege markers require a friendly Tower or a visible besieger; hidden
  besiegers and garrisons are not exposed through siege announcements.
  The shared log omits non-battle coordinates concealed from any active player,
  so later hotseat turns and multiplayer guests cannot read hidden locations.
- Battles still reveal their participants, game over reveals the whole board,
  and setup previews remain unfogged. Movement and combat rules are unchanged.
- Fog is visual, not network secrecy; snapshots and reconnects carry the full
  authoritative board and each client derives its own view.

### Board and interface

- The board and custom placement grid use a uniform square color.
- Corner spawn zones are visually highlighted.
- Pieces use inline SVG artwork and player-specific colors.
- On even-numbered rounds, every piece containing a Pawn displays a `zzz` marker
  to indicate that the Pawn is resting.
- Pieces containing Routed units display a red health cross and a recovery
  round counter in the bottom-left corner. Mixed stacks show the longest active
  cooldown; tooltips list affected units, their penalties, and individual timers.
  The badge disappears when all units recover and does not intercept clicks.
- Pieces belonging to an eliminated player are rendered gray across the board,
  movement animations, and battle displays.
- The left panel shows the current phase, current player, planning controls,
  player statuses, and a private objective checklist above the board.
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
  On touchscreens, holding a piece for 500 ms opens the same popup. Clicking
  movable units toggles their selection, with highlights and a selected count.
  **Choose destination** closes the popup and selects that group for one order.
  Clicking outside, closing the popup, or pressing Escape dismisses it without
  issuing an order or retaining an unconfirmed selection.
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
- The clock is disabled. The objective checklist shows only the current player's
  objectives and score, clearing its contents during hotseat handoff and resolution.

### Movement rules

- Every movable piece moves exactly one square.
- Movement is allowed in all eight directions.
- Movement is bounded by the selected board.
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
  - Generated Towers start with at least two intervening squares in every direction,
    including diagonals; sandbox placement and sandbox saves have no spacing restriction.
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

- Right-clicking or long-pressing a friendly stack exposes its held pieces.
- Toggle one or more units, press **Choose destination**, then click an adjacent
  square to move, transfer, or attack with that group. Unselected units remain.
- Towers, resting Pawns/prisoners, units with existing split/prisoner orders, and
  garrisons under siege cannot be selected; disabled buttons explain why.
- A selected group can be transferred into an adjacent friendly stack after
  one confirmation. Gate, terrain, and prisoner targeting rules still apply.
- Each selected group is one movement intent and one combat participant,
  including during opposing swaps; it is not split into individual attacks.
- Selected units are removed atomically from their source before destinations
  resolve. Empty sources disappear; remaining stacks retain their units.
- Split groups cannot initiate Tower attacks; use a whole Pawn-containing stack.
- If an unmerge destination is contested, it participates in collision handling.

### Simultaneous resolution

- All active players' plans are collected and resolved in one simultaneous phase.
- Resolution follows this order:
  - Queued releases/executions of existing prisoners are announced and resolved
    before the movement steps below.
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
- Every involved fighting candidate participates; there is no flee choice.
  Prisoners do not fight or contribute to league/bonus calculations.
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
  strength, and winner casualty/defeated capture percentages. The result panel shows
  the winner-selection roll and every casualty roll as percentages.
- Defeated lone Queens/Kings use 60%/75% base casualty weights, before the usual
  win-probability, pursuit, experience, and siege modifiers. Winners and royals
  sharing their candidate with any other unit retain their normal base weights.
- Every fleeing survivor gains one Routed stack, capped at 3. Each stack gives
  -20% battle strength and +25 percentage points casualty risk, for winners and
  losers alike. A candidate's strength penalty is the average of its units'
  penalties, applied to raw strength before the 1.35 odds curve. The casualty
  penalty is added after other modifiers and capped at 100%; Towers stay immune.
- Routed persists throughout retreat and for 6 playable rounds after re-entry:
  the return round and the next five rounds. Another retreat before expiry adds
  a stack and refreshes this cooldown after the new return. A retreat after
  expiry starts again at one stack.
- Routed stacks and expiry rounds belong to individual units, surviving merges,
  splits, transfers, and multiplayer snapshots. Unaffected allies do not inherit
  casualty penalties. Battle cards, unit lists, and retreat tooltips show the
  penalties and cooldown. Survivor experience gains are unchanged.

### Captures and prisoners

- Defeated non-Tower casualty rolls produce captures, not deaths; routing odds
  and routed penalties are unchanged. Winner casualties still die.
- Siege defenders previously forced to die are now captured. Tower conquest
  remains automatic and Towers remain ordinary stationary defenses.
- The battle winner chooses Execute or Prisoner per captured unit before Proceed.
  Choices in multiplayer belong to that player's authenticated connection; the
  host still controls Start Battle and Proceed. Pending choices survive reconnect.
- Prisoners preserve unit IDs, names, artwork, and original colors, with chains
  in their current captor's color. The owning stack belongs to the captor.
- Prisoners only move, unmerge, and transfer on odd rounds. Mixed stacks carrying
  prisoners also rest on even rounds, with existing ready-assault/Sally exceptions.
  They can merge into friendly Towers through gates.
- Prisoners cannot initiate attacks, count toward any combat strength, bonus,
  league, royal escort protection, or experience gain. Mixed stacks can fight
  using only their normal units. Prisoners never suffer battle/siege casualties
  or route, and all prisoners from defeated stacks are captured by the winner.
- Prisoner-only stacks have zero win odds. A single fighting player captures
  them automatically without battle/casualty rolls or experience gains.
  Opposing prisoner-only destination
  conflicts without fighting units, and prisoner-only swaps, cancel their moves.
- Recapturing original friendly units automatically restores normal service.
- The owner can execute or release prisoners from the piece popup during
  planning, including on even rounds. These actions are private queued plans,
  not immediate changes. Reset Plans cancels them; changing the selected fate
  replaces the previous decision for that unit. Multiplayer locked-in players
  must unlock before editing their decisions.
- Existing prisoner releases/executions resolve first, before movement, sieges,
  or battles, with a combat-log announcement naming each player and unit.
  The remaining stack can also move that round; movement uses its updated
  contents and type. A prisoner cannot both leave custody and unmerge/transfer.
  Odd/even movement restrictions consider the remaining planned stack.
- Multiplayer submits prisoner actions with committed plans. The host checks
  ownership, unit identity, valid fate, duplicate actions, and conflicts with
  unmerge/transfer. No immediate prisoner-action messages are accepted.
- Release returns units through 3-round re-entry to the original owner without
  routed penalties. Blocked releases wait another round rather than dying.
  Released units of eliminated players remain stationary.
- Prisoners and released units awaiting re-entry count as alive for objectives;
  only execution or actual winner/siege casualties award death objectives.

### Elimination and victory

- Each player starts at 0 with random enemy targets for +4 defeat, +3 King death,
  +2 specific Queen death, and +1 control of a specific starting castle.
- Penalties are -4 for the player's King death and -3 per starting castle lost.
- Castle identity survives capture. Castle reward and penalty checkmarks reflect
  current ownership, so loss and recapture reverse the associated points.
- Kings and Queens in stacks, prisoner custody, or retreat queues count as alive.
- Scores are recomputed after the entire round, including siege casualties and
  retreat re-entry. All players at -10 or below are permanently eliminated
  together, then enemy-defeat rewards are applied.
- King death alone does not eliminate a player.
- Eliminated players are skipped during future planning.
- Remaining pieces owned by eliminated players are gray and stationary, but may
  still be attacked and included in collision battles.
- The game enters `GAME_OVER` when a non-eliminated player reaches 10 or more
  points. Simultaneous winners share victory; a lone survivor must still reach 10.
- If no active player remains, the UI shows a draw.
- The game-over modal can start another game through player selection.

### Main menu and online multiplayer

- The page opens on a main menu with **Hotseat** (all behavior above, unchanged)
  and **Multiplayer**.
- Multiplayer uses Supabase with the host-as-authority model. The room
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
- Only the room creator can press Start Battle and Proceed; the battle winner
  can decide captured units' fates from their own battle window.
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
- Random generation must create exactly two castle stacks and 12 units per
  selected player, with one Queen castle and one King castle as specified above.
- Every generated unit must have exactly one stable name, and names must be
  unique within each player and piece type.
- Custom setup must allow any army composition, including empty armies, duplicate Kings,
  rebels, and adjacent Towers, while preserving stable unit names.
- Custom setup must allow same-player stacks, reject cross-player overlap, and
  allow placements outside the default corner zones.
- Custom setup Reset must clear piece placements without changing the map. Confirm Placement
  must preserve edited terrain and resource sites/probabilities without requiring objective units.
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
- A King inside a stack or retreat queue must not trigger a King-death objective.
- A player must be eliminated only after the complete resolution phase.
- Removing the last non-King unit from a stack must not eliminate its player.
- Losing the King checks King-death objectives but must not eliminate the player
  unless the end-of-round score reaches -10.
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
- The game has no dedicated game server, permanent accounts, or AI opponents.
  Hotseat is client-only; multiplayer uses anonymous Supabase sessions and a
  database relay, while gameplay remains authoritative in the host browser.
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
