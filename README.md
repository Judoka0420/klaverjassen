# Klaverjassen Online (Rotterdam rules)

Play Klaverjassen with friends across the internet. You (and up to 3 friends) join a
table by code; any empty seats are played by the AI, so a game can start with 1–4 humans.

## Files
- `server.js`   — authoritative Node game server (Express + Socket.IO). Runs the rules engine so nobody can cheat.
- `engine.js`   — pure Rotterdam rules engine (deal, legal moves, roem, scoring, bot AI). Verified by simulation.
- `public/index.html` — the browser client (lobby + table). Reuses the offline UI; renders each player at the bottom.
- `start.ps1` / `stop.ps1` — launch/stop the server + public Cloudflare tunnel.
- `cloudflared.exe` — Cloudflare tunnel client (gives a public HTTPS URL, no port-forwarding, no account).
- `klaverjassen.html` — the original **offline single-player** game (you vs 3 bots). Just double-click it.

## Run it (host a game)
```
powershell -ExecutionPolicy Bypass -File start.ps1
```
It prints a public link like `https://<random>.trycloudflare.com`. Share that with friends.
Everyone opens it in a browser, enters a name, and one person creates a table; the others
join with the 4-letter code (or the invite link). The host presses **Start match**.

Stop everything with:
```
powershell -ExecutionPolicy Bypass -File stop.ps1
```

### Notes
- The tunnel URL is **ephemeral** — it changes every time you restart. Re-share the new link.
- Your machine must stay on with the server + tunnel running for friends to connect.
- Seats: North & South are partners; East & West are partners. Claim seats in the lobby.
- Reconnection: if someone drops, a bot covers their seat; when they reopen the link they
  resume their seat automatically (within a 60s grace window).

## Configuration (env vars)
- `PORT` — server port (default 8787).
- `KJ_BOT_MS`, `KJ_TRUMP_MS`, `KJ_TRICK_MS`, `KJ_DEAL_MS` — pacing delays in ms
  (bot think time, bot trump-choice delay, completed-trick linger, auto-advance between deals).
- `KJ_GRACE_MS` — how long an all-disconnected table is kept alive for reconnection (default 60000).

## Rules
Rotterdam Klaverjassen: follow suit; if void you must trump; you must overtrump an existing
trump if you can — **even over your partner**. Declaring team must score more than the
opponents (points + roem) or go *nat*. 16 deals; highest cumulative total wins. Full
reference is in the in-game **Rules** panel.
