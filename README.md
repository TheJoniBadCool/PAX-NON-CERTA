# PaxNonCerta

PaxNonCerta is a 4-player simultaneous chess battlefield.

## Run

Open `PaxNonCerta.html` directly in a modern browser. No installation, server, or build step is required.

Click or tap to select pieces and their destinations, or to place pieces in custom setup. Right-click a piece to open its unit list; on mobile, hold it for half a second instead.

## Game modes

The main menu offers:

- **Hotseat** – one device, pass it between players (unchanged).
- **Multiplayer** – one browser per player. One player creates a room and shares the 5-letter code; others join, the creator picks 2–4 players and starts. Everyone plans in secret and locks in (a locked plan can be unlocked until the last player locks in); then the round resolves: move, merge, battles. Cancel Siege is a planned action resolved with movement, and a simultaneous Sally Out then fights the cancelling catapult.
  - The creator's browser is the authority (dice, resolution, battle buttons) and must stay open. Others can reload and rejoin with the same code.
  - Uses PeerJS (WebRTC) with the free public PeerJS signalling server; no backend to run. Very strict corporate networks may block WebRTC.

## Free hosting (GitHub Pages)

Push the repository to GitHub, then **Settings → Pages → Deploy from branch → `main` / root**. Share `https://<user>.github.io/<repo>/` (`index.html` redirects to the game). Netlify Drop or Cloudflare Pages work the same way: upload the folder as-is.

## Structure

- `PaxNonCerta.html` - page structure and game controls
- `styles.css` - all presentation styles
- `js/game-state.js` - centralized mutable game state
- `js/game.js` - game rules, rendering, input handling, and collision resolution

The project intentionally uses classic scripts instead of a bundler so the existing double-click workflow remains unchanged. New features should add state to `GameState` and keep UI or rule logic in `game.js` rather than adding more global variables.
