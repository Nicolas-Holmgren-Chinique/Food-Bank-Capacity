# Mobile testing

The scanner is phone-first and camera access requires HTTPS (browsers refuse `getUserMedia` over plain HTTP/LAN-IP, `localhost` excepted). This gets a real phone talking to your local dev server over HTTPS via a throwaway Cloudflare Quick Tunnel.

**Honesty check on this doc**: everything below through "Zero to phone" was verified in this environment — `cloudflared` installs cleanly, the exact command is correct, and `vite.config.js` is already configured (see below). The live tunnel connection itself could **not** be verified from this sandbox: Cloudflare tunnels require outbound access on port 7844 (both the QUIC/UDP and HTTP2/TCP fallback), which this sandboxed dev environment's network blocks (confirmed via `cloudflared`'s own connectivity pre-check — DNS and HTTPS to `api.cloudflare.com` both pass, port 7844 both protocols fail). That's a restriction of this particular sandbox, not of the setup — run this from a normal laptop/dev machine and it should connect in seconds. **The test matrix below is a template for you or a teammate to fill in on real hardware**, not something I was able to complete myself.

## Setup (one-time)

Install `cloudflared`:

```powershell
winget install --id Cloudflare.cloudflared -e
```

If `cloudflared` isn't recognized in your current terminal right after installing, open a new terminal (PATH needs to refresh), or call it by its installed path directly: `& "C:\Program Files (x86)\cloudflared\cloudflared.exe"`.

`vite.config.js` already has the required dev-server config (`server.host: true`, `server.allowedHosts: true`) — binds beyond `localhost` and accepts the unpredictable `*.trycloudflare.com` hostname a Quick Tunnel generates each run. Nothing to change there.

## Zero to phone (every session — the tunnel URL is throwaway and changes each run)

```bash
# terminal 1
npm run server

# terminal 2
npm run dev

# terminal 3
cloudflared tunnel --url http://localhost:5173
```

`cloudflared` prints a URL like `https://random-three-words.trycloudflare.com` within a few seconds — open that on the phone (any browser). Camera access will prompt normally since the tunnel serves real HTTPS.

That's the whole flow — no Cloudflare account, no config file, no DNS setup. Kill and rerun `cloudflared tunnel --url ...` any time; you'll get a new random URL.

**Gotchas**:

- The URL is different every run — don't bookmark it, don't hardcode it anywhere.
- If the phone can't reach the tunnel URL at all (not even an error page), check the terminal 3 log for a `CONNECTIVITY PRE-CHECKS` table — if UDP/TCP to `region1/2.v2.argotunnel.com` both fail, your network is blocking outbound port 7844 (some corporate/school networks do this) and you'll need a different network, a VPN, or `cloudflared tunnel --protocol http2 --url ...` (TCP-only fallback — still needs port 7844, just over TCP instead of QUIC).
- `/api/*` calls proxy through Vite exactly like in plain local dev — no separate tunnel needed for the server, since the Vite dev server proxies to it (see `vite.config.js`).
- To test the fully-offline demo backend instead of live Gemini (test #11 below): set `VITE_VISION_BACKEND=demo` in `.env.local` and restart `npm run dev` before opening the tunnel URL.

## Test matrix

Run on one real iOS device (Safari) and one real Android device (Chrome). Fill in Pass/Fail + notes per row — this table is intentionally blank; only someone with the physical devices in hand can complete it honestly.

| # | Test | Pass condition | iOS Safari | Android Chrome | Notes |
|---|---|---|---|---|---|
| 1 | Camera opens | Rear camera, permission prompt, live preview | | | |
| 2 | Auto-capture | Steady ~1s → ring fills → capture fires; motion re-arms next capture | | | |
| 3 | Quality gates | Dark/blurry frames rejected with hint chip, no capture | | | |
| 4 | Manual shutter | Always visible, always works | | | |
| 5 | Upload path | Photo-library image accepted; HEIC converted | | | |
| 6 | EXIF rotation | Portrait photos upright; overlays aligned after rotate/resize | | | |
| 7 | Multi-capture | Wide + fridge interior + cabinet aggregate; filmstrip review/delete works | | | |
| 8 | Gemini real path | Two different rooms → different fixtures and box counts | | | |
| 9 | Live recompute | Unchecking a fixture / editing percentFull updates boxes instantly | | | |
| 10 | Touch ergonomics | Targets ≥44px; pinch-zoom never toggles a checkmark | | | |
| 11 | Demo mode | `VITE_VISION_BACKEND=demo` full flow offline on the phone | | | |
| 12 | Perf | Analysis loop ≤10fps, pauses on hidden tab, no heat/battery spike in 2 min | | | |

### Notes on specific rows, from reading the code (not device-verified)

- **#1**: `reference-ui/captureController.js` requests `facingMode: { ideal: 'environment' }` — rear camera is a preference, not a hard constraint; a device without a rear camera (or with a locked-down camera permission model) will silently get whichever camera is available, or fall back to demo mode on outright failure. Watch for this on iPads/desktop-class devices.
- **#3**: gates live in `src/engine/autoCapture.js` (`darkLuminanceThreshold`, `blurVarianceThreshold`) — thresholds are best-guess, un-tuned against a real phone sensor. If gates never trigger, or trigger constantly, that's the first place to adjust (see `docs/HANDOFF.md` open item #1).
- **#5/#6**: HEIC handling and EXIF orientation aren't handled by any code in this repo — `downscaleImage()` (`src/engine/scanApi.js`) draws through `<img>`/`<canvas>`, which both iOS Safari and Android Chrome are expected to auto-orient and auto-transcode HEIC for (`<img>` decode, not raw byte handling), but this is a browser-behavior assumption, not something tested here. If row 6 fails, it's almost certainly upstream of this repo's code, in whatever the browser handed to `<img onload>`.
- **#9**: this recompute path had a real bug (percentFull edits didn't propagate to computed capacity) found and fixed during this integration pass — see `src/engine/scanEngine.js`'s `setPercentFull()`. Should now work; this is exactly the kind of thing this row exists to catch.
- **#12**: `captureController.js`'s analysis loop samples at `config.sampleIntervalMs` (120ms ≈ 8fps default) and explicitly skips work when `document.hidden` — both by design, not by device-specific tuning, so this should hold on any device, but hasn't been measured for actual battery/heat impact on real hardware.

## Bugs found + fixed during setup (not device-specific, found by reading code for this task)

- **`public/_headers` blocked camera site-wide.** `Permissions-Policy: camera=()` on every route would have silently killed `getUserMedia` on the deployed Cloudflare Pages site regardless of HTTPS — the whole point of this doc. Fixed to `camera=(self)`.
- **`engine.setPercentFull()` didn't affect computed capacity** (see #9 above) — the override was recorded but `computeCapacity()` never read it. Fixed in the engine so this is guaranteed correct now, independent of device testing.

Neither of these needed a physical phone to find or fix — they're mentioned here because they were surfaced while preparing for this exact test pass, and because #9 directly affects row 9 above.
