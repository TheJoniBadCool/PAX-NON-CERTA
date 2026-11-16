# PaxNonCerta

PaxNonCerta is a 4-player simultaneous chess battlefield.

## Run

Open `PaxNonCerta.html` directly in a modern browser. No installation, server, or build step is required.

Click or tap to select pieces and their destinations, or to place pieces in custom setup. Right-click a piece to open its unit list; on mobile, hold it for half a second instead. Clicking your catapult or besieged tower also opens that list, with its siege action alongside.

Each tower has one randomly chosen, in-bounds cardinal gate, shown by an arrow. Merges, transfers, unmerges, and sieges must use that adjacent square. Towers must start at least two squares apart in every direction, including diagonals; older custom setups that violate this rule must be reset before playing.

Each match generates several irregular forests, hill regions and mountain ranges: approximately 50% plains, 20% forests, 20% hills and 10% mountains (rounded to whole squares). Mountains are impassable, including for retreat re-entry; castle squares are plains, castle gates are passable, and starting pieces never occupy mountains. Generation keeps passable squares connected. Crowded custom setups may prevent the requested ratios or require larger patches.

Enemy forces in forests are visually hidden, and a stationary forest defender gains +25% combat strength when attacked. A stationary hill defender gains the same bonus only after at least one of its combat units held that square throughout the previous round. Friendly reinforcements share the defender's bonus; arrivals alone and swap interceptions do not receive it. Terrain strength is applied before the battle odds curve. Hidden forces are revealed in battle; attempting to enter their square follows the normal collision and prisoner rules. Forest concealment is interface-only in multiplayer: the host and guest network snapshots contain the full board.

Choose the board size (10×10, 12×12, 14×14, or 16×16) and each player's name in the Hotseat player-selection screen. Generate a map preview before starting; its seed is shown, can be entered manually, and recreates the generated starting positions, gates, levels, and terrain. Custom setups can preview terrain after placing their pieces. The Multiplayer host has the same preview and seed controls in the lobby. Seeds control map generation only; objectives and combat rolls remain random. Each selected player starts with one castle in their corner province, holding their full 12-unit roster; custom setups can use any square on the selected board. Every other province contains one grey, stationary rebel Tower with a Pawn inside, plus one randomly placed rebel Pawn outside that castle in the same province. Player starting provinces have no outside rebel Pawn. Rebels can be attacked and captured but do not take turns; custom setups remain unchanged. The board is visually divided into 16 provinces by a 4×4 grid; province ownership determines fog-of-war visibility. Use **Names** above the board to edit names during a game; the active map seed is also shown above the board. In Multiplayer, each player can edit only their own name; the updated name is shared with the room. Each player's corner card shows their status and retreating units. Use **Commit Plans** or **Reset Plans** below the board. The compact, two-column private objective checklist above the board replaces the time-of-day clock and shows only the current player's objectives and score.

Provinces are tinted in their castle owner's color, including starting provinces, and change color when their castle is conquered. Rebel provinces have no tint. In custom setups, empty provinces and provinces with castles belonging to different owners remain uncolored until one player owns all their castles. Map previews use the same coloring.

**Fog of war** hides opposing players' and rebels' troops outside your owned provinces and their eight neighboring provinces (including diagonals). Every friendly piece also reveals its square and all eight adjacent squares; a stack containing a non-prisoner Bishop reveals a 5×5 area instead. Sight updates with actual positions and castle ownership, not queued plans, and is not remembered after it is lost. Terrain and province colors stay visible under fog. Towers and their gates remain visible everywhere, but concealed garrisons, their counts, prisoners, and recovery badges do not. Forest concealment still hides enemy troops and garrisons even inside revealed areas; scouting never cancels it. Hotseat planning uses the current player's sight; resolution combines active players' fog sight without lifting forest concealment. Multiplayer always uses your own sight, including during resolution. Battles reveal their participants and game over reveals the whole board; setup previews remain unfogged. Hidden movements are not animated, and the shared log omits non-battle coordinates concealed from any active player. Like forest concealment, fog is interface-only: multiplayer snapshots still contain the full board.

The compact battle panel shows players side by side, with win odds and small unit icons. Hover over units and stat badges for names, casualty chances, and bonus details; zero bonuses are omitted. Tap **ⓘ** for battle rules or expand **Rolls** after fighting to inspect the dice results.

Defeated units either route as before or are captured. The battle winner chooses **Prisoner** or **Execute** for each capture; winner casualties and automatic Tower conquest are unchanged. Prisoners keep their original color and artwork, with captor-colored chains. They move, unmerge, or transfer only on odd rounds and may merge into friendly stacks (including Towers through their gates). They cannot attack, contribute no combat bonuses, and never die or route in battle: an attacking winner captures them, including prisoners held in a defeated mixed stack. Recapturing your own original units restores them to normal service.

The prisoner chain badge appears at the top-right of the board square. Click a prisoner-containing piece (or right-click/long-press) for icon-only **Execute** (skull) and **Release** (white flag) controls; hover for labels. These queue private decisions, including on even rounds, and **Reset Plans** cancels them. Once plans resolve, releases and executions are announced in the combat log and applied **before movement**. The remaining stack may still move that round; the scheduled prisoner cannot also unmerge or transfer. Release returns units to their original player through 3-round re-entry without routed penalties, waiting if no square is free; an eliminated original player's units stay stationary. Prisoners remain alive for death objectives until executed. In multiplayer these decisions are submitted with the owner's committed plan. Choices for newly captured units still belong to the battle winner and resolution waits for their decisions.

## Objectives

Players start at 0 points with randomly targeted rewards: +4 for an enemy's defeat, +3 for an enemy King's death, +2 for a specific enemy Queen's death, and +1 for controlling a specific enemy castle. Penalties are -4 for losing your King and -3 for each starting castle lost. Each castle keeps its original identity and starting-square label through captures. Losing a conquered castle removes its reward; reclaiming your own castle removes its penalty. Objectives do not accumulate points repeatedly. Retreating units count as alive.

Scores are checked after the entire round, including siege casualties and retreat re-entry. Players at -10 or below are permanently defeated together, then enemy-defeat rewards are applied. Reach 10 or more points to win; simultaneous winners share victory. King death alone does not eliminate a player, and the last remaining player must still reach 10. If everyone is defeated, the match is a draw.

Custom setups require exactly one King, at least one Queen, and at least one Tower per selected player. Hotseat objectives are cleared and hidden during device handoffs and resolution. Multiplayer guests receive only their own objective list; the authoritative host holds all lists, just as it holds all plans.

## Game modes

The main menu offers:

- **Hotseat** – one device, pass it between players; each player sees only their own planned moves.
- **Multiplayer** – one browser per player. One player creates a room and shares the 5-letter code; others join, the creator picks 2–4 players and starts. Everyone plans in secret and locks in (a locked plan can be unlocked until the last player locks in); then the round resolves: move, merge, battles. Cancel Siege is a planned action resolved with movement, and a simultaneous Sally Out then fights the cancelling catapult.
  - The creator's browser is the authority (dice, resolution, Start Battle/Proceed buttons) and must stay open. Each winner controls their own capture choices. Others can reload and rejoin with the same code.
  - Uses the Supabase project configured below as a relay. Pending plans are visible to their player and the host, not other guests.
  - For custom starting positions, the host selects **Custom placement → Place Pieces / Load Setup**, places all players' pieces or loads a saved setup, then clicks **Use Placement** to return to the lobby and **Start Game** when everyone is connected. Saved setups must use the same players as the room; changing the player count clears the selected placement. **Back to Lobby** discards unconfirmed edits. Guests receive the host's starting board, including stacks and unit levels; the room stays open during editing.

## Free hosting (GitHub Pages)

Push the repository to GitHub, then **Settings → Pages → Deploy from branch → `main` / root**. Share `https://<user>.github.io/<repo>/` (`index.html` redirects to the game). Netlify Drop or Cloudflare Pages work the same way: upload the folder as-is.

## Supabase multiplayer setup

The Supabase client is included via a pinned CDN script; no npm installation or
build step is needed. Hotseat does not require Supabase.

1. Create a project at [Supabase](https://supabase.com/dashboard) and wait for it
   to finish provisioning.
2. In the project dashboard, enable anonymous sign-ins under **Authentication →
   Sign In / Providers → Anonymous**. Anonymous users do not need an email or
   password.
3. Copy the project URL and **publishable** API key from the project's Connect
   dialog or API settings into `js/supabase-config.js`. A legacy `anon` key also
   works. These values are public in a GitHub Pages app; **never use a secret
   key, `service_role` key, database password, or personal access token** there.
4. Open **SQL Editor → New query** in the project dashboard. Copy the complete
   contents of `supabase/multiplayer.sql` into the editor and click **Run**.
   The script creates the room, connection, mailbox, and turn tables, their
   row-level security policies and functions, and adds the two notification
   tables to the `supabase_realtime` publication. Run it once in a new project;
   it is not an upgrade script for pre-existing tables of the same name.
5. Serve the site over HTTPS (for example via GitHub Pages). Guest sessions are
   stored per browser tab, so reloading the same tab keeps its session while
   clearing tab storage or closing the tab can lose it.
6. Open the hosted game on separate devices or in separate browser sessions.
   The host selects **Multiplayer → Create Room** and shares the code; other
   players use **Join Room**. The host picks the player count and starts the game.

Supabase recommends CAPTCHA and rate limits to mitigate anonymous sign-in abuse.
This application does not yet include a CAPTCHA widget; enabling CAPTCHA
before adding a widget and passing its token to `signInAnonymously` will cause
guest sign-in to fail. See the [anonymous sign-in documentation](https://supabase.com/docs/guides/auth/auth-anonymous)
and [CAPTCHA guide](https://supabase.com/docs/guides/auth/auth-captcha).

The host maintains the authoritative game state, checks the submitted plans,
and resolves the turn when all active players are locked in. The database stores
submitted plans and relays host snapshots; it does not run or recover the game
if the host closes the tab. Realtime notifications trigger mailbox checks, with
polling as a fallback. A connection is marked disconnected after its heartbeat
expires (about 45 seconds); suspended mobile tabs can therefore disconnect.

The room code is an invitation, not a strong password. Anyone who knows it can
try to join an open slot, and the host can inspect pending plans. The host can
also modify game state, so this is not an anti-cheat system. Keep the Supabase
project's security policies and quotas under review before opening it publicly:
anonymous sign-in and database traffic can be abused and can incur costs.
Messages are deleted once delivered; turn records are removed when the room
closes. Abandoned rooms are cleaned up opportunistically when a new room is
created, after 24 hours. Supabase anonymous user accounts are not automatically
deleted; follow Supabase's guidance for cleaning up old anonymous users.

## Structure

- `PaxNonCerta.html` - page structure and game controls
- `styles.css` - all presentation styles
- `js/game-state.js` - centralized mutable game state
- `js/objective-rules.js` - random objectives, reversible scoring, and score-based outcomes
- `js/game.js` - game rules, rendering, input handling, and collision resolution

The project intentionally uses classic scripts instead of a bundler so the existing double-click workflow remains unchanged. New features should add state to `GameState`, keep DOM-independent rules in the corresponding rule scripts, and integrate UI and round flow through `status-ui.js` and `game.js` rather than adding more mutable global variables.
