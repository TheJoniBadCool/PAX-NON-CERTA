# PaxNonCerta

PaxNonCerta is a 4-player simultaneous chess battlefield.

## Run

Open `PaxNonCerta.html` directly in a modern browser. No installation, server, or build step is required.

Click or tap to select pieces and their destinations, or to place pieces in custom setup. Right-click a piece to open its unit list; on mobile, hold it for half a second instead. Clicking your catapult or besieged tower also opens that list, with its siege action alongside.

Each tower has one randomly chosen, in-bounds cardinal gate, shown by an arrow. Merges, transfers, unmerges, and sieges must use that adjacent square. Towers must start at least two squares apart in every direction, including diagonals; older custom setups that violate this rule must be reset before playing.

Each player's corner card shows their status and retreating units. Use **Commit Plans** or **Reset Plans** below the board. The time-of-day clock above the board advances once per completed round, cycling through dawn, day, dusk, and night. It is decorative and does not affect gameplay.

## Game modes

The main menu offers:

- **Hotseat** – one device, pass it between players; each player sees only their own planned moves.
- **Multiplayer** – one browser per player. One player creates a room and shares the 5-letter code; others join, the creator picks 2–4 players and starts. Everyone plans in secret and locks in (a locked plan can be unlocked until the last player locks in); then the round resolves: move, merge, battles. Cancel Siege is a planned action resolved with movement, and a simultaneous Sally Out then fights the cancelling catapult.
  - The creator's browser is the authority (dice, resolution, battle buttons) and must stay open. Others can reload and rejoin with the same code.
  - Uses the Supabase project configured below as a relay. Pending plans are visible to their player and the host, not other guests.

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
- `js/game.js` - game rules, rendering, input handling, and collision resolution

The project intentionally uses classic scripts instead of a bundler so the existing double-click workflow remains unchanged. New features should add state to `GameState` and keep UI or rule logic in `game.js` rather than adding more global variables.
