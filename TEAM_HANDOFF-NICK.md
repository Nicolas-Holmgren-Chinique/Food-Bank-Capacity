# TEAM HANDOFF — Vision / Scan Software (CareSpace)

Owner: [your name] · Handed off: Aug 21, ~12:00 PM · I had to leave — everything you need is below. Ping me with questions, but this doc + `docs/INTEGRATION.md` + `docs/MOBILE_TESTING.md` should cover it.

## What this software is

The **Scan** step of CareSpace (Scan → Analyze → Allocate). A rep photographs/scans their storage room; we detect fridges/freezers/cabinets/shelves (Gemini vision), let the rep uncheck spaces they don't want used, and compute **box capacity**: `boxes = MIN(slots across dry / refrigerated / frozen)`, with dead space and the binding constraint surfaced (the Agency C case: 18k freezer + 10k dry = 10k boxes, 8k dead freezer slots). Output is a single handoff JSON object for Analyze/Allocate.

## Current status (honest)

- Vision backend: Gemini is primary (`VISION_BACKEND=gemini`), EyePop code retained but our account is gated (403s) — don't use it. `VISION_BACKEND=demo` runs fully offline on bundled sample images — **use demo mode for any stage demo; it cannot fail.**
- Check `docs/HANDOFF.md` (agent-written) for the precise done/stubbed checklist. Trust that file over assumptions.
- NOT yet verified on real phones — that's the first thing to do (below).

## Setup (5 min)

1. Pull main. `npm install`.
2. Copy `.env.example` → `.env`. Set `GEMINI_API_KEY=` [I shared the key in our chat — do NOT commit it; `.env` is gitignored].
3. `npm run dev` — confirm it runs on desktop first. Try a scan with `VISION_BACKEND=demo` to sanity-check before touching mobile.

## Testing on a phone (10 min)

Camera requires HTTPS, and `localhost` on a phone points at the phone — so use a tunnel:

1. Terminal 1: `npm run dev` (note the port, e.g. 5173)
2. Terminal 2: `cloudflared tunnel --url http://localhost:5173`
   (install first: `brew install cloudflared` / `winget install --id Cloudflare.cloudflared`)
3. Open the printed `https://….trycloudflare.com` URL on your phone. Grant camera permission.

Troubleshooting: blank page → vite config needs `server: { host: true, allowedHosts: true }` + restart dev server. No camera prompt → you're on an http/LAN URL; must be the https tunnel URL. Scan errors → the API proxy port isn't tunneled; use the Vite proxy (see docs/MOBILE_TESTING.md). Tunnel URL changes every restart — leave the tunnel running, restart only the dev server.

**Test checklist (run on one iPhone + one Android if possible):**
- [ ] Camera opens (rear), live preview visible
- [ ] Capture works (auto-capture ring if implemented; manual shutter always)
- [ ] Upload-a-photo path works
- [ ] Scan of a real room returns fixtures (different rooms → different results — if every photo gives identical results, something's wrong, tell me)
- [ ] Unchecking a fixture updates box count live
- [ ] Box summary shows binding constraint + dead space
- [ ] `VISION_BACKEND=demo` full flow works on the phone (our demo fallback)
- [ ] Portrait photos aren't sideways; checkmarks sit on the right fixtures

Log bugs in the team chat with a screenshot + which device/browser.

## Integrating with the real CareSpace frontend

The engine is UI-independent — the frontend team mounts it without touching our logic. **Read `docs/INTEGRATION.md` first**; short version:

- Entry point: `createScanEngine()` / `useScanEngine()` — submitCapture, toggleFixture, setBoxOverride, subscribe, getResult. Our current UI is a disposable reference implementation in `/reference-ui`; copy from it or ignore it.
- The contract is the **handoff object** from `engine.getResult()`: `{ scanId, agencyId, capacity{dry/refrigerated/frozenFt3}, boxCapacity{computedBoxes, overrideBoxes, bindingConstraint, deadSpace}, captures, source, verifiedBy }`. Analyze/Allocate should consume **boxes**, not raw ft³.
- Server side: our Gemini proxy route must be deployed with `GEMINI_API_KEY` set (server-side only — never in client code). If the CareSpace deploy (carespace.pages.dev) is static-only, the proxy needs a home (Pages Functions / small server) — flag this early, it's the most likely integration blocker.
- Host UI provides: the image (Blob/base64) and the `agencyId`. We provide everything else.

## Git flow for integrating (IMPORTANT — deploy is likely wired to main)

carespace.pages.dev probably auto-deploys from main, so a broken push breaks the public site. Please:
1. Branch → PR → merge, not direct pushes to main, for anything nontrivial.
2. Always: commit your work → `git pull origin main` → resolve → **re-test** → push.
3. Never commit `.env` / the Gemini key. If `git status` shows `.env`, stop and fix `.gitignore`.

## Priorities if time is short

1. Demo mode works end-to-end in the real frontend (unbreakable stage path)
2. Gemini live scan works on one phone
3. Box math + binding-constraint callout visible in the UI (this is our wow moment)
4. Everything else is polish — cut auto-capture before cutting correct box math.
