# PaxNonCerta Implementation TODOs

This document is the implementation handoff for the remaining gameplay work.
The next session agent must read `FEATURES_AND_CORNER_CASES.md` first and treat
the rules below as the required behavior. Do not silently invent alternative
gameplay rules. If a case is not defined, stop and ask for clarification.

## Repository context

- `js/game.js` contains spawning, planning, movement, merging, resolution,
  battle UI, elimination, and rendering.
- `js/game-state.js` contains mutable state.
- `FEATURES_AND_CORNER_CASES.md` is the gameplay source of truth.
- The project is a browser-only classic-script prototype with no build system.
- Validate JavaScript with `node --check .\js\game.js` and run `git diff --check`.

## Already completed

- [x] Stack contents use unique unit records:
      `{ id, player, type, name }`.
- [x] Units have stable names:
      Player A uses `Ap1`-`Ap4`, `Aq1`, `Ar1`-`Ar2`, `An1`-`An2`,
      `Ab1`-`Ab2`, and `Ak1`; Players B-D use their own prefix.
- [x] Unit identity and names survive spawning, merging, movement, unmerge,
      transfer, and battle candidate rendering.
- [x] Combat leagues and weights:
      standard league counts Pawn/Tower/Horse units for stack size, applies the
      existing 20% size advantage, then applies 10% per King and 5% per Queen
      or Bishop. The resulting strength uses a 1.35 odds curve. Elite league
      is used when all candidates contain only King/Queen/Bishop units, counts
      all units, applies the same size advantage and odds curve, and applies
      no morale bonus.

### Battle casualties, retreat, and unit progression

**Status:** Implemented in prototype; needs manual gameplay validation.

- Battles retain the existing winner selection, then resolve casualties
  separately for every candidate.
- Casualty weights are King `0.5`, Queen `0.1`, Bishop `0.15`, Horse `0.2`,
  Pawn `0.25`, and Tower `0`.
- Casualty probability is isolated in `casualtyChance`; defeated candidates
  receive a fixed 10% pursuit penalty, while experience and armour each reduce
  casualty probability by 5% per level. Winner casualty probability is
  additionally reduced by 50%.
- Experience and armour are level 0-3 unit attributes. The game setup offers
  all-zero or random level 1-3 starting attributes. Surviving participants
  gain one experience level after battle.
- Winner casualties disappear. Defeated non-casualties leave the board as one
  same-player retreat stack per candidate and re-enter at the start of the
  fourth round near the battle. Safe squares are preferred; unsafe squares are
  allowed only when no safe square exists, and no free square destroys the
  retreat.
- Defeated defending Towers capture to the winner with a new winner identity;
  other units in that siege candidate are casualties. Captured Tower attributes
  remain unchanged.
- Retreated stacks belonging to eliminated players re-enter gray and
  stationary. The UI shows a compact retreat table for every player.
- A selected held unit can receive a free armour upgrade when its stack
  contains a Tower.
- Battle cards show per-unit battle/casualty modifiers before the roll, then
  mark living units normally, casualties with `X`, and retreating units with
  a white flag.
- Battle results show the winner-selection roll and every casualty roll as
  percentages.
- Retreat rows show regrouping unit icons and each stack's remaining timer.

## Golden simultaneous-resolution rule

Every round must resolve in this conceptual order:

1. **Vacate sources:** remove every valid ordinary-moving stack from its
   initial square. Remove selected unmerged units from their source stacks
   before destination resolution.
2. **Merge by destination and player:** at each destination square, combine all
   stacks belonging to the same player. Different players may temporarily have
   stacks on the same square.
3. **Battle by destination:** every square containing stacks from more than one
   player becomes one battle group. Every opposing stack on that square fights;
   there is no flee choice.
4. **Place results:** a merge produces one same-player stack; a battle produces
   exactly one surviving stack at that square. Preserve the survivor's complete
   contents and unit names.

Two-way opposing swaps remain battles. Same-player swaps and pure movement
cycles pass through without battle. A pure cycle is a closed movement cycle
with no additional attacker or stationary defender.

## Remaining work

### 1. Mixed friendly/enemy target collisions

**Status:** In progress / must be completed before other collision changes.

Implement the golden rule for cases such as:

```text
Player A1 -> X
Player A2 -> X
Player B1 -> X
```

Required behavior:

- A1 and A2 become one Player A stack at X.
- Player B1 remains a separate candidate at X.
- The resulting A stack and B1 fight in one battle group.
- With multiple enemy movers, every enemy stack is included exactly once.
- A stationary enemy at X is included if it did not move away.
- Same-player candidates must never be treated as separate battle candidates.
- A friendly merge must never silently discard an enemy candidate.
- If the merged friendly candidate wins, its complete merged contents occupy X.
- If an enemy wins, the friendly source stacks are removed and the enemy
  survivor occupies X.

Implementation guidance:

- Avoid resolving a friendly `MERGE` group before discovering enemy candidates.
- Build destination groups after source validation and before placement.
- Represent a merged candidate with its member source candidates so all source
  board cells can be cleared when the merged candidate loses or wins.
- Do not write a destination to the board until the destination's merge/battle
  decision is complete.

Validation scenarios:

- Two friendly movers versus one enemy mover.
- Two friendly movers versus two enemy movers.
- One friendly mover versus a stationary enemy.
- Friendly automatic merge plus enemy stationary defender.
- Explicit friendly merge plus an enemy mover.
- Same-player merge with no enemy remains a merge only.

### 2. Gray eliminated-player pieces

**Status:** Complete.

When a player loses its last King after complete round resolution:

- Mark the player eliminated.
- Render every remaining stack owned by that player as gray while preserving its
  original player ownership and unit records.
- Gray stacks are stationary: they cannot be selected, moved, unmerged, or
  transferred.
- Gray stacks can be attacked and can participate as stationary battle
  candidates.
- Gray styling is also applied in movement animations and battle displays.
- If a gray stack wins a battle, it remains gray; if it loses, it is removed
  normally.
- Gray units must not count as alive Kings for player victory/elimination.
- Eliminated players must still be skipped during future planning.

Recommended representation:

- Add a neutral/gray ownership marker without changing each unit's original
  `player` identity. For example, keep `piece.player` as the original owner and
  add `piece.isGray = true`, or use the repository's existing state pattern if
  one is introduced.
- Update rendering, movement selection, tooltip access, battle colors, and
  elimination checks consistently.
- Never index `PLAYERS[piece.player - 1]` for a gray display without a safe
  gray color/class path.

Validation scenarios:

- Player loses King but has multiple separate stacks.
- King is lost inside a merged stack while non-King units remain.
- Gray stack is attacked and loses.
- Gray stack is attacked and wins.
- Gray stack is targeted by multiple players.
- Gray stack is right-clicked or clicked during planning.
- Gray stack contains a King record but must not revive its eliminated owner.


### 4. Conflicting ordinary move and unmerge plans

**Status:** Complete.

The approved behavior is **unmerge first, then move the remainder**.

For a stack with contents `{Ap1, Aq1}` where Aq1 is unmerged and the source
stack also has an ordinary move:

- Remove Aq1 from the source stack first.
- Recalculate the remaining source stack's displayed type.
- Move the remaining source stack using its updated contents.
- If no contents remain, do not create an ordinary move.
- The unmerged Aq1 is an independent movement intent.
- Both intents preserve unique IDs and names.
- Multiple unmerges must remove the intended units, not the wrong array entries.
- Prefer unit ID matching; use held index only as a UI selection position.

Reject stale plans when the source ID or unit ID no longer exists. Never
duplicate a unit or leave a stale empty stack.

Validation scenarios:

- One unmerge plus an ordinary stack move.
- Multiple unmerges plus an ordinary remainder move.
- Unmerge all units.
- Unmerge a Tower must remain forbidden.
- Unmerge destination is contested.
- Source stack disappears before resolution.

### 5. Overlapping collision paths and destination ownership

**Status:** Not started.

Ensure one resolution result cannot overwrite another result from the same
round.

- A piece or unit intent may belong to only one resolution group.
- A source is cleared once.
- A destination is finalized once per resolution stage.
- A merged candidate's member sources are not processed again as independent
  moves.
- A battle survivor must not overwrite a later-resolved battle survivor at the
  same square.
- Stationary occupants must be included only if their source was not vacated.
- Stale or invalid intents must be excluded explicitly, not treated as
  successful moves.

Validation scenarios:

- Three movers to one square.
- Friendly merge plus two enemy attackers.
- Two swaps sharing a square.
- A moving source targeted by another move.
- A stationary defender also listed as an explicit merge target.
- Multiple collision groups in one round.

### 6. Transfers into moving stacks

**Status:** Not started.

Transfers are unmerge intents that move one uniquely identified unit into a
friendly stack.

- Confirming a transfer must remove the unit from its source exactly once.
- If the friendly target also moves, treat the target as a moving destination,
  not as a stationary merge.
- The transferred unit joins the target's destination stack only after source
  removal and destination grouping.
- If the target is destroyed in battle, the transferred unit participates in
  that resulting stack and is destroyed or survives with it.
- Canceling a transfer changes neither board nor plans.
- A transfer cannot target an enemy as a friendly merge.

Validation scenarios:

- Transfer into a stationary friendly stack.
- Transfer into a friendly stack that moves away.
- Transfer source and target both involved in enemy battles.
- Multiple transfers into one moving stack.
- Transfer of a Tower must remain forbidden.

### 7. Three-way and longer movement cycles

**Status:** Not started.

Pure same-player or opposing movement cycles pass through without battle only
when every source is vacated and there is no additional attacker or stationary
defender.

Examples:

```text
A1 -> B1, B1 -> C1, C1 -> A1
```

Required behavior:

- Detect cycles longer than two moves.
- Clear all cycle sources before placing destinations.
- Preserve each moving stack and its contents.
- Same-player cycles are never battles.
- Opposing two-way swaps remain battles as an explicit exception.
- If any extra move targets a cycle square, or a stationary defender remains,
  resolve that square as a battle instead of pass-through.

Validation scenarios:

- Three-way opposing cycle.
- Four-way cycle.
- Same-player cycle.
- Cycle with an extra attacker.
- Cycle with a stationary Tower defender.

## Cross-cutting completion checklist

- Preserve unit `{ id, player, type, name }` records in every new board object.
- Recalculate displayed stack type after every contents change.
- Never create an empty stack.
- Keep King detection based on unit contents and gray status.
- Keep battle overlays dismissible and resolution able to continue.
- Keep all player and gray rendering paths safe.
- Update `FEATURES_AND_CORNER_CASES.md` when each feature is approved.
- Run:
  - `node --check .\js\game.js`
  - `node --check .\js\game-state.js`
  - `git diff --check`
- Manually test the validation scenarios listed for the changed feature.
