# PaxNonCerta

PaxNonCerta is a 4-player simultaneous chess battlefield.

## Run

Open `PaxNonCerta.html` directly in a modern browser. No installation, server, or build step is required.

Click or tap to select pieces and their destinations, or to place pieces in custom setup. Right-click a piece to open its unit list; on mobile, hold it for half a second instead. Clicking your catapult or besieged tower also opens that list, with its siege action alongside. When the catapult's assault timer reaches 0, choose **Storm Castle** in its unit list to queue an assault, including on even-numbered rounds.

**Path tracing:** After a move, group unmerge, castle exit, or **Leave Siege**, keep choosing adjacent destinations to plan later rounds. Green arrows show the route, with small `zzz` markers for automatic Pawn/prisoner rest turns. A route can finish with an attack, merge, castle entry, or siege. Only its next due action queues each round. Routes use what you can currently see, never concealed troops or predicted future sight. A newly blocked step and its dependent suffix turn yellow; committing removes that suffix while keeping the valid prefix. Left-click the routed piece/stack to cancel its route and automatic order before replanning. **Reset Plans** also clears your future routes. Battles and changes to a routed stack's composition cancel its route. Leaving a siege consumes one full round in both Hotseat and Multiplayer. Online routes are private and retained by the host for reconnecting players.

Each tower has one randomly chosen, in-bounds cardinal gate, shown by an arrow. Merges, transfers, unmerges, and sieges must use that adjacent square. Generated towers start at least two squares apart in every direction, including diagonals; sandbox placement has no spacing restriction.

Each match generates several irregular forests, hill regions and mountain ranges: approximately 50% plains, 20% forests, 20% hills and 10% mountains (rounded to whole squares). Mountains are impassable, including for retreat re-entry; castle squares are plains, castle gates are passable, and starting pieces never occupy mountains. Generation keeps passable squares connected. Crowded custom setups may prevent the requested ratios or require larger patches.

Enemy forces in forests are visually hidden, and a stationary forest defender gains +25% combat strength when attacked. A stationary hill defender gains the same bonus only after at least one of its combat units held that square throughout the previous round. Friendly reinforcements share the defender's bonus; arrivals alone and swap interceptions do not receive it. Terrain strength is applied before the battle odds curve. Hidden forces are revealed in battle; attempting to enter their square follows the normal collision and prisoner rules. Forest concealment is interface-only in multiplayer: the host and guest network snapshots contain the full board.

Choose a 12×12 or 16×16 board and each player's name in the Hotseat player-selection screen. Choose the **Default** starting army (a King, Queen, Tower, Bishop, Horse, and two Pawns) or **Current** (a King, Queen, Tower, two Bishops, two Horses, and four Pawns) in Hotseat or the Multiplayer lobby. Generate a map preview before starting; its seed is shown, can be entered manually, and recreates the generated starting positions, army, gates, levels, and terrain. Custom setups can preview terrain after placing their pieces. The Multiplayer host has the same preview and seed controls in the lobby. Seeds control map generation only; objectives and combat rolls remain random. Each selected player starts with one castle in their corner province, holding the chosen army; custom setups can use any square on the selected board. Every other province contains one grey, stationary rebel Tower with a Pawn inside, plus one randomly placed rebel Pawn outside that castle in the same province. Player starting provinces have no outside rebel Pawn. Rebels can be attacked and captured but do not take turns; custom setups remain unchanged. The board is visually divided into 16 provinces by a 4×4 grid; province ownership determines fog-of-war visibility. Use **Names** above the board to edit names during a game; the active map seed is also shown above the board. In Multiplayer, each player can edit only their own name; the updated name is shared with the room. The player cards form a row below the board and show each player's status, retreating units, dead pieces, and prisoners held, including those in retreating armies. Prisoners retain their original player colors. Above the board, the private objective panel sits to the left of the vertically stacked round clock and **Commit Plans** and **Reset Plans** controls. The current player's permanent and temporary objectives appear side by side when space allows.

Starting positions offer **Corner Position** (the default described above), **Custom placement**, **Random** (distinct randomly assigned provinces anywhere), and **Gentleman's Agreement**. After generating a map and starting an agreement match, online players each select/deselect an unclaimed province and lock their own choice with the green **Good luck, good Sirs!** button. Play begins only when everyone confirms; rejoining retains choices and confirmations. In Hotseat, one person assigns every active player's province and confirms once. Each chosen province's existing castle receives that player's normal army and loses its outside rebel Pawn; gates, terrain, and resources stay unchanged. Agreement maps start with all 16 provinces rebel-owned, so the default resource mode places 12 sites and the other modes place 16. Chosen capitals keep any generated resources regardless of the capital-resource checkbox. The full map is visible while choosing, and normal fog and private objectives apply when play starts.

The clock beside **Commit Plans** has the same size as the button icon. It shows the current round in the four-round purchase cycle, from 1/4 to 4/4, and its pointer advances a quarter-turn each round (not each player's commitment), regardless of the resource-production interval. Its tooltip also reports resource-production timing. New games reset it.

During planning on rounds 4, 8, 12, etc., open an owned Castle's unit list to recruit a Pawn or Horse using the plus beside the Tower, upgrade the Castle with the wall beneath it, or buy armour using the shield beneath a non-Tower unit. The selected Castle receives recruits, subject to the once-per-province limit. Right-click or long-press a resource site in an owned province to upgrade its production once for 2 Stone, 2 Wood, 2 Food, and 1 Gold; its popup shows its chance and current output of 1/2 or 2/2. These purchases are also available in the shopping-cart dropdown beside your player-card diplomacy controls, along with Lucky Cards. Unavailable actions are disabled; hover, focus, or tap their requirements to see colored stockpile/required counts and eligibility conditions. A shopping reminder and highlighted cart appear during your purchase window; online, they disappear when you commit and return if you unlock.

The question-mark card icon immediately left of your shopping cart opens your private **Lucky Cards** hand. The first card-plus icon buys a random card for 1 each of Gold, Horse, Metal, Food, and Wood during purchase rounds. Cards have equal chances, duplicates are possible, and you can keep them indefinitely. Hover or focus a card for its description, then select it and choose a target to use it once during your unlocked planning turn on any round. **Resource burglar** (mask) steals all of your chosen resource from every other player, including allies. **Stop Sign** blocks another player's movement, splits/transfers, retreat re-entry, siege deployment, assaults, and Sally Out for this round and next, cancelling already queued movement/attack orders. Defence and passive siege timers are unchanged. Repeated Stop Signs refresh rather than stack duration. Cards are not yet usable during battles. Reset Plans does not undo cards or purchases.

To prepare a siege, select a Pawn-containing stack at an enemy Castle's gate and click the Castle. The popup shows the cost and disables **Prepare Siege** when resources are missing; joining an existing siege is free. The order can be queued even on an inactive-Pawn round, and resources are spent when the siege starts during resolution.

The planning countdown appears in large digits directly below that clock when enabled.

Enable the optional **planning timer** before starting in Hotseat or the Multiplayer lobby, and enter a whole-number duration in seconds or minutes. Every player receives the same limit each round; the countdown automatically commits queued plans (including an empty plan) at zero. Hotseat timing starts when planning begins or the next player presses **I Am Ready**, never during handoffs, province selection, alliance review, or battles. Online, everyone shares the host's deadline; committing early still allows unlocking before expiry. At expiry, the host commits each player's latest received draft, including disconnected players, and declines unanswered alliance and exchange requests. Reconnecting does not reset the deadline. The host must keep the game open for online timing and resolution.

Provinces are tinted in their castle owner's color, including starting provinces, and change color when their castle is conquered. Rebel provinces have no tint. In custom setups, empty provinces and provinces with castles belonging to different owners remain uncolored until one player owns all their castles. Map previews use the same coloring. Province dividers follow the board's tile edges, including when resized on mobile.

Player-owned provinces have a six-step food meter beside their Towers. It starts full when a province is acquired and loses one step after resource production on rounds 4, 8, 12, and so on. During your unlocked planning turn, click the meter or use the refill button in the Tower's unit list to spend 1 Food and add one step, up to six; a warning appears at two steps or fewer. At zero, all Towers in the province become rebel-owned, their occupants enter their owners' normal retreat queues, and prisoners are released into their owners' queues. One rebel Pawn appears on a random empty passable square in the province, or inside a rebel Tower if none is available. Resources stored in a rebelling Tower stay there. Empty, rebel, contested, inactive, and eliminated-player provinces do not consume food; a newly acquired province starts full.

Each active player's starting castle is their capital. Custom setups with multiple towers choose a random starting capital each game; the tower is marked with a star on the board. If a capital is captured, its former owner gets a random tower they still own as their new capital. Players with no towers are marked as a **🐪 Horde** in their panel; regaining a tower automatically establishes a capital. Horde status is informational for now. Capital choices are random each game and are not determined by the map seed.

The custom-placement editor keeps generated terrain and resources while you add or erase pieces, including rebels. Use **Editor tool** to paint any biome, add/update resources with individual 0–100% production chances, or erase resources on a square. Different resource types can share a square and a province can hold any number of resource sites; each produces independently for the province owner unless raided. Painting may intentionally override terrain connectivity, mountain-placement, resource-count, and balance rules. Resource icons copy their type/chance into the editor when clicked with the piece tool selected; erase and repaint to move them. Save/Load preserves edited maps, probabilities, and armies; **Reset** clears only pieces. **Generate Map** replaces terrain/resources after confirmation. Without generation, editing or starting uses a blank plains map. Generation settings and seed changes leave your current map intact until you regenerate; a seed alone does not recreate manual edits. **Exit to Menu** is available in both setup screens.

Choose **8 resources** (default), **12 resources**, or **16 resources** before generating the map preview in Hotseat or the Multiplayer lobby. With 12 rebel provinces, the smaller mode assigns one resource to eight randomly chosen rebel provinces: 1 horse, 3 food, 2 wood, 1 metal, and 1 gold. The 12-resource mode covers all rebel provinces: 2 horses, 4 food, 3 wood, 2 metal, and 1 gold. The 16-resource mode places one resource in every province, including player-owned provinces, with 3 horses, 5 food, 4 wood, 3 metal, and 1 gold. By default, each province's resource receives a uniformly random whole-number production chance from **5% to 95%**, inclusive, shown in its tooltip. Right-click or long-press a resource icon on the board to open its production details beside the square without selecting a piece or issuing a move. Keyboard users can activate the icon with Enter or Space. In map previews, tap or click the icon to inspect it. Close the popup with its close button, Escape, or a tap outside it. The custom-placement editor retains its resource-copy controls. There are no shared production-number rolls.

The optional **Resource balance** setting can make the production chances in each populated corner quadrant (a 2×2 group of provinces) sum to exactly **25%**, with whole-number chances of at least 5%. A lone resource receives 25%; resource counts and types need not match between quadrants. Choose either **allow empty quadrants**, which leaves empty quadrants at 0%, or **at least one resource per quadrant**, which selects eligible provinces to cover all four. If the latter is impossible, the preview explains that the placement or settings must change. You can instead set every resource to **100%**, or choose **Unbalanced: 3 at 100%, 4 at 50%, rest at 20%**; in the tiered option, sites are assigned the chances randomly from the map seed, with fewer than seven sites filling the tiers in order. Hotseat custom placement also allows changing resource settings in the editor.

Enable **Allow resources in player capitals** to include player-owned provinces in the random placement pool for 8/12 resources, without changing the total resource count or guaranteeing capitals a resource. It defaults off and is always checked and locked for 16 resources. It works with every resource chance option. Custom maps still calculate their resource count from exclusively rebel-owned provinces; enabling capitals expands only the eligible pool, excluding empty and contested provinces.

All board sizes use the same 16-province grid. With a different rebel count, the 8-resource mode places the rebel count minus four resources (minimum zero), and the 12-resource mode places the rebel count; the 16-resource mode always covers every province. Resource proportions scale to the number placed. By default, custom maps use exclusively rebel-owned provinces for the 8- and 12-resource modes, without adding rebels. Generated resources are placed on a random non-mountain square in their province. Resource assignments, positions, and chances are reproduced by the map seed and selected settings, appear in previews, stay fixed through conquest, and remain visible through fog and forests. All resource icons avoid mountains. Choose resource production every turn (default), every 2 turns on even-numbered turns, or every 4 turns. Each eligible resource site independently checks its chance to give its current owner one unit of its resource (two if upgraded) at the selected interval unless raided; every resource can succeed or fail. Empty, rebel, contested, inactive, or eliminated owners receive nothing. Stockpiles start at zero and accumulate without a cap; resources can be spent in the shop or exchanged with other players. Each player's card shows only their own icon-and-count resource row, hidden during Hotseat handoffs and resolution. Multiplayer snapshots send guests only their own stockpile.

**Raiding:** Stand on a resource's exact square with a stack containing at least one non-prisoner **Pawn or Horse** to take its production instead of the province owner. Other units may accompany it. Allies of the owner neither take nor block production. Active, non-eliminated raiders can also collect from rebel, empty, contested, inactive, or eliminated-player provinces; rebels cannot raid. Multiple eligible raiding players share no extra output: each successful check awards the site's output to a randomly chosen raider. An upgraded site produces two resources per successful check for either its owner or a raider, and keeps its upgrade through conquest. Combat resolves first, and current occupancy and alliances determine who collects at each scheduled check. Leaving restores normal production; existing stockpiles, ownership, and production chances never change. All resource types on the occupied square are affected, but other sites in the province are not. Fog and forests do not prevent raiding.

**Fog of war** sight is chosen before starting in Hotseat or by the Multiplayer host. **Medium** (default) reveals your owned provinces and all eight neighboring provinces, including diagonals; friendly pieces reveal a 3×3 area, or 5×5 for a stack containing a non-prisoner Bishop. **Small** limits province sight to two squares beyond owned provinces in every direction, including diagonals, with the same piece sight. **Large** keeps Medium province sight and increases piece sight to 5×5, or 7×7 with a Bishop. Sight updates with actual positions and castle ownership, not queued plans, and is not remembered after it is lost. Terrain and province colors stay visible under fog. Towers and their gates remain visible everywhere, but concealed garrisons, their counts, prisoners, and recovery badges do not. Forest concealment still hides enemy troops and garrisons even inside revealed areas; scouting never cancels it. Hotseat planning uses the current player's sight; resolution combines active players' fog sight without lifting forest concealment. Multiplayer always uses your own sight, including during resolution. Battles reveal their participants and game over reveals the whole board; setup previews remain unfogged. Hidden movements are not animated, and the shared log omits non-battle coordinates concealed from any active player. Like forest concealment, fog is interface-only: multiplayer snapshots still contain the full board.

The compact battle panel shows players side by side, with win odds and small unit icons. Hover over units and stat badges for names, casualty chances, and bonus details; zero bonuses are omitted. Tap **ⓘ** for battle rules or expand **Rolls** after fighting to inspect the dice results.

Defeated units either route as before or are captured. The battle winner chooses **Prisoner** or **Execute** for each capture; winner casualties and automatic Tower conquest are unchanged. Prisoners keep their original color and artwork, with captor-colored chains. They move, unmerge, or transfer only on odd rounds and may merge into friendly stacks (including Towers through their gates). They cannot attack, contribute no combat bonuses, and never die or route in battle: an attacking winner captures them, including prisoners held in a defeated mixed stack. Recapturing your own original units restores them to normal service.

The prisoner chain badge appears at the top-right of the board square. Click a prisoner-containing piece (or right-click/long-press) for icon-only **Execute** (skull) and **Release** (white flag) controls; hover for labels. These queue private decisions, including on even rounds, and **Reset Plans** cancels them. Once plans resolve, releases and executions are announced in the combat log and applied **before movement**. The remaining stack may still move that round; the scheduled prisoner cannot also unmerge or transfer. Release returns units to their original player through 3-round re-entry without routed penalties, waiting if no square is free; an eliminated original player's units stay stationary. Prisoners remain alive for death objectives until executed. In multiplayer these decisions are submitted with the owner's committed plan. Choices for newly captured units still belong to the battle winner and resolution waits for their decisions.

## Alliances and war

Everyone starts at war. Each player card shows public ⚔️ wars and 🤝 alliances
with colored player balls, separated by `|` when wars are present. The gray
handshake remains visible even when there are no allies. During planning,
the button next to another player's name opens **Declare War** / **Request Allegiance**;
the current relationship is grayed out and unselectable. Incoming requests highlight
and gently pulse the sender's card (static highlight with reduced motion). Accept or decline online
requests on the sender's card. Each pair allows only one initiation per round,
including declined requests; Reset Plans and unlocking do not undo diplomacy.

Online, committed players can still answer requests, and resolution waits until
all requests are answered and everyone has committed. The host can skip disconnected
players, declining pending requests involving them. Hotseat instead has private
approval handoffs after everyone plans, before moves resolve. New games reset
relationships; reconnecting preserves them.

Allies can share ordinary squares without fighting or merging across owners.
Their smaller, overlapping icons remain separate armies: click or long-press the
square to control only your own stack. Same-player arrivals still merge normally.
Allies cannot enter each other's Tower squares. Direct allies share fog vision
and can see each other's forest troops; vision does not chain through friends
of friends, and enemy forest concealment is unchanged.

Accepting an alliance immediately releases both players' prisoners belonging to
the other, including captives in retreating armies. They use the normal released
prisoner retreat process and return after three rounds without routed penalties.
Queued actions involving those prisoners are cancelled; other prisoners stay held.

Allies fight together against common enemies, keeping their own survivors and
experience. A player allied with both opponents stays neutral; complex encounters
resolve compatible allied sides and then any remaining hostile pairs. Former allies
still on the same square fight during resolution unless they move apart.

Joint winners unanimously choose the castle owner and separately choose who
handles prisoners. Each ally votes on their own device online, or after a Hotseat
handoff. Disagreement offers **Re-decide** or **Declare War**, which overrides the
round lock and immediately resumes fighting for the spoils. The agreed prisoner
custodian then uses the normal Prisoner/Execute controls. Non-owners of a captured
castle stay on their original siege squares, fighting immediately if an enemy has
taken that square. Votes survive online reconnects; resolution waits for agreement
or war. Resource ownership, objectives, and victory conditions are not shared.

## Resource exchanges

Click the **⇄ Exchange resources** icon to the left of another player's diplomacy
button. Set how many of each resource you give
and request. You may trade with enemies as well as allies, and either side may
give nothing (but the entire proposal cannot be empty).
Each amount is shown beside the owner's available stock, with insufficient amounts
highlighted in red. A private stockpile is shown as `?` instead.

Both players must hold the full outgoing amounts when the proposal is sent and
accepted. Resources stay spendable while waiting; an unaffordable acceptance
transfers nothing and leaves the proposal available to decline. Accepted exchanges
are immediate and cannot be undone by Reset Plans. Received resources go to the
capital Castle, or the player's King then Queen if there is no capital.

Online, recipients accept or decline on the sender's highlighted card, even while
committed. Senders can cancel, but must unlock to propose or cancel. Hotseat uses
the private alliance review after all players finish planning. Unanswered exchanges
block resolution; online timer expiry and skipping disconnected participants decline
them. Each pair can have one pending exchange, with multiple completed deals per
round independently of alliance/war locks. Reconnecting preserves requests; new
games clear them. Terms stay private to participants and the authoritative host.

## Objectives

Each player receives 6–10 independently random objectives, with repetitions possible. Rewards are worth +2 to +6 points and penalties −2 to −6, selected separately for each objective. Available objectives include defeating a particular player, the death of a particular King or Queen, control of a particular enemy castle, death of your own King, loss of a starting castle, and the following:

- **Expansionist**, **Richest king**, **Largest Army**, and **Castle Lord** reward a sole lead in owned provinces, gold stockpile, living combat units, and controlled Towers respectively. Ties and a zero total do not qualify; eliminated players do not compete. Armies include retreating units but exclude Towers and prisoners.
- **Monopolist** requires ownership of every province containing a site for the specified resource, with at least one such site on the map. Raiding and production rolls do not change province ownership.
- **King/Queen’s Bounty** rewards holding the same other player's King or Queen prisoner for eight consecutive full rounds. The capture round does not count; release, rescue, or transfer to a different captor resets the duration. Once earned, the reward remains.
- **Protector** names a randomly assigned player; their elimination incurs the objective's penalty, not automatic defeat.

Scores are checked after the entire round, including siege casualties, retreat re-entry, and resource production. Lead, monopoly, and castle objectives are revoked when their conditions cease to hold. Each castle keeps its original identity and starting-square label through captures; reclaiming your own castle removes its loss penalty. Retreating units and prisoners count as alive for death objectives. Scores do not accumulate repeatedly.

Players at −20 or below are permanently defeated together; defeat rewards and Protector penalties are then applied, with further eliminations resolved until stable. Reach 20 or more points to win; simultaneous winners share victory. King death alone does not eliminate a player, and the last remaining player must still reach 20. If everyone is defeated, the match is a draw. Resource production for the completed round happens before score-based elimination.

Custom setups are unrestricted sandboxes: no King/Queen/Tower requirements or tower-spacing checks apply. Objectives requiring absent units or resource types are omitted, and random assignments may make the normal winning score unattainable. Hotseat objectives are cleared and hidden during device handoffs and resolution. Multiplayer guests receive only their own objective list; the authoritative host holds all lists, just as it holds all plans.

### Temporary missions

Each active player privately receives three random missions at the start of round 1 and again every 16 rounds. Each batch lasts 16 complete rounds, including its final round. A completed mission immediately earns +1 or +2 permanent points at round resolution; if none of the batch succeeds, its expiration instead applies a single permanent −2 point penalty. Completed and failed missions remain visible until the batch expires. Missions may repeat; targets are selected from the current map and can become impossible.

Missions can require fighting a named player or unit, taking a specified Tower, raiding a specified player's resource site, moving selected units or all mobile units into provinces you own, keeping one to three named units in a specified Tower, or holding a named unit in a specified province. Hold missions require 4–8 consecutive completed rounds; leaving resets the streak. Fallback of all units includes units recruited later and requires no mobile combat units to be retreating. Protection missions require avoiding attacks by a named player, attacks on a named unit, or raids on a specified owned site for the entire batch; the relevant attack, raid, unit loss, or loss of the site fails the mission. Hostile battles, simultaneous collisions, and starting a siege count as attacks; an unopposed prisoner capture does not. A raid counts when an eligible hostile Pawn or Horse occupies the site during a production check, even if its roll fails. Resource-gifting missions are not currently offered.

Use the magnifying glass on a mission to highlight its current target square(s) without removing fog or revealing their contents. Unit and Tower targets are tracked as they move; a player-only target points to that player's current capital, if any. Province targets highlight the province, and a fallback-all mission highlights your current mobile units. The highlight disappears on board redraw or a Hotseat handoff.

## Game modes

The main menu offers:

- **Hotseat** – one device, pass it between players; each player sees only their own planned moves.
- **Multiplayer** – one browser per player. One player creates a room and shares the 5-letter code; others join, the creator picks 2–4 players and starts. Everyone plans in secret and locks in (a locked plan can be unlocked until the last player locks in); then the round resolves: move, merge, battles. Cancel Siege is a planned action resolved with movement, and a simultaneous Sally Out then fights the cancelling catapult.
  - The creator's browser is the authority (dice, resolution, Start Battle/Proceed buttons) and must stay open. Each winner controls their own capture choices. Others can reload and rejoin with the same code.
  - Uses the Supabase project configured below as a relay. Pending plans are visible to their player and the host, not other guests.
  - During a match, use the envelope on another player's card to open a private chat. The envelope highlights for unread messages; history is kept only in the current page session and is cleared when returning to the lobby or reloading. Both players must be connected to send.
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
   Then run `supabase/private-messaging.sql` in the SQL Editor. Existing projects
   that already ran `multiplayer.sql` only need to run the private messaging script.
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
Private chat is delivered directly to its recipient rather than through the host's
browser, and its mailbox is readable only by the recipient under the database
policies. It is not end-to-end encrypted; the Supabase project operator can
access stored messages. Pending messages are removed after delivery or when the
room closes.

## Structure

- `PaxNonCerta.html` - page structure and game controls
- `styles.css` - all presentation styles
- `js/game-state.js` - centralized mutable game state
- `js/allied-resolution.js` - allied combat sides and castle/prisoner agreements
- `js/objective-rules.js` - random objectives, reversible scoring, and score-based outcomes
- `js/game.js` - game rules, rendering, input handling, and collision resolution

The project intentionally uses classic scripts instead of a bundler so the existing double-click workflow remains unchanged. New features should add state to `GameState`, keep DOM-independent rules in the corresponding rule scripts, and integrate UI and round flow through `status-ui.js` and `game.js` rather than adding more mutable global variables.
