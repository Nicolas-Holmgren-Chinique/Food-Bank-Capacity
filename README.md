# CareSpace vision scanner

This repo owns the **vision layer** of CareSpace's Scan step: a guided, document-scanner-style camera flow that auto-captures a room (and each opened fridge/freezer/cabinet) and turns the results into a capacity handoff object for CareSpace's Analyze/Allocate steps. See [`docs/CareSpace-Product-Requirements-Document-Revision-0.1.md`](docs/CareSpace-Product-Requirements-Document-Revision-0.1.md) for the product concept.

**This repo is split into two independent halves** (see `docs/INTEGRATION.md`):

- **`src/engine/`** — the permanent, UI-independent scan engine: vision backends (Gemini primary, EyePop pluggable, demo/offline), capacity + box math, session/aggregation logic, export builder. No DOM, no styling, no framework assumptions beyond an optional React hook. This is what the CareSpace frontend team mounts.
- **`reference-ui/`** — a disposable reference implementation (our own test harness/demo fallback) that drives the engine through its public API. Zero business logic — it only renders `engine.getState()` and calls engine methods.

The public brand and demo deployment target are:

**https://carespace.pages.dev**

**If you're integrating this into the CareSpace frontend, start at [`docs/INTEGRATION.md`](docs/INTEGRATION.md)**, not here.

**Vision provider is Google Gemini** (primary, time-crunch decision — see `docs/HANDOFF.md`), with EyePop.ai kept pluggable behind the same interface (`server/visionProviders/`), and a fully-offline `demo` backend for testing without any credentials or network. See `docs/CAPACITY.md` for the multi-capture aggregation rules and `docs/HANDOFF.md` for what's real vs. demoed vs. blocked.

## Stack

Vite + vanilla JS, no framework, no TypeScript. `reference-ui/` builds to a static site (see [Deployment](#deployment)). The scan flow adds a small Node/Express server (`server/`) that keeps vision-provider API keys off the client.

## Run locally

Two processes: the Vite dev server (frontend) and the scan server (vision-provider proxy). The dev server proxies `/api/*` to the scan server (see `vite.config.js`), so you don't need CORS config for local dev.

```bash
npm install
cp .env.example .env.local   # then fill in GEMINI_API_KEY (see https://aistudio.google.com/apikey)
npm run server                # terminal 1 — scan server on :8787
npm run dev                   # terminal 2 — Vite on :5173
```

Open the site, click **I have capacity** (via "Share a resource" or the community section), and either point the camera at a room or upload a photo.

For testing on a real phone over HTTPS (camera access requires it), see **[`docs/MOBILE_TESTING.md`](docs/MOBILE_TESTING.md)**.

### Mock / demo mode (no credentials needed)

Two independent ways to run without a real vision API:

- **`VITE_VISION_BACKEND=demo`** (frontend, client-side): the engine never calls the server at all — it resolves every capture from bundled fixture JSON (`src/engine/demoFixtures/`). True offline operation, works with no network reachable.
- **`MOCK_VISION=true`** (server, dev convenience): `/api/scan` returns canned per-step detections from `server/mockData/<provider>/<stepId>.json` instead of calling Gemini/EyePop — useful for exercising the real gemini/eyepop request/response code paths without live credentials.

**The UI always shows a visible "Demo data" badge whenever a scan came back from either mode**, and `isMock`/`is_demo_data` is threaded through every downstream shape (engine state, `getResult().source`, exported records) — demo data can never look like a real self-reported scan. With real credentials and neither flag set, `/api/scan` returns a real error on failure (visible to the user) — it never silently falls back to canned data.

Every scan response also carries the complete raw vision-provider prediction back to the client (gated on `NODE_ENV !== 'production'`, i.e. on by default in dev).

### Env vars

See `.env.example` for the full list and comments. Summary:

| Var | Where | Purpose |
|---|---|---|
| `VISION_PROVIDER` | server only | `"gemini"` (default) or `"eyepop"`. Selects the implementation in `server/visionProviders/index.js`; a client can override it per-scan via `createScanEngine({ visionBackend })`. |
| `GEMINI_API_KEY` | server only | Gemini auth. Required unless `MOCK_VISION=true`. Never sent to the browser. |
| `EYEPOP_API_KEY` / `EYEPOP_POP_ID` | server only | Only used when `VISION_PROVIDER=eyepop`. See "Blocked: EyePop account setup" below — currently broken. |
| `MOCK_VISION` | server only | `"true"` to skip the real vision API entirely and return canned per-step detections. |
| `SCAN_SERVER_PORT` | server + `vite.config.js` | Port for `server/index.js` (default `8787`). |
| `VITE_VISION_BACKEND` | frontend (build-time) | Forces the reference UI's engine onto `"demo"` (fully offline) or a specific backend. Unset lets the server's `VISION_PROVIDER` decide. |

`.env.local` is gitignored.

## Architecture

```
src/engine/             THE ENGINE — no DOM, no styling, no UI-layer imports (enforced, see below)
  index.js                 public entry point: createScanEngine, CAPTURE_STEPS, capacity/export helpers
  scanEngine.js             createScanEngine() — the one API surface a host UI drives everything through
  useScanEngine.js          optional React binding (not re-exported by index.js — see file header)
  boxCapacity.js            "box" capacity math (computedBoxes/overrideBoxes/bindingConstraint/deadSpace)
  demoBackend.js            fully offline vision backend, resolves from demoFixtures/
  captureSteps.js           the 5-step guided sequence (configurable array) — see docs/CAPACITY.md
  autoCapture.js            pure stability/blur/darkness state machine — no DOM, see docs/HANDOFF.md
  scanSession.js            multi-capture session model + the wide-shot-exclusion aggregation rule
  analysisQueue.js          concurrency-limited (2) queue so captures analyze as they arrive
  scanApi.js                client-side downscale (<=1920px) + POST /api/scan, dispatches to the right adapter by provider
  vision/
    fixtureClasses.js         class -> capacityType mapping (single editable config, shared by both providers)
    referenceVolumes.json     default fixture volumes + pallet/floor constants
    adapter.js                 raw EyePop Prediction -> our own Detection[] shape; exports scaleFactorFor/withFloorDetection for reuse
    geminiAdapter.js           raw Gemini JSON (wide fixtures[] or one interior volume+fill reading) -> Detection[]
    capacityEngine.js          computeCapacity(detections, exclusions, overrides) -> net capacity by type
    foods.json                 ~18-item delivery catalog (cold/frozen/dry, meals-equivalent)
    simulator.js                validateLoad / maxQuantities / recommendMix / bindingConstraint / placementLayout
    exportBuilder.js             buildCapacityRecords / buildScanDetail / postCapacityRecords (legacy per-type export; getResult() is primary)

reference-ui/            DISPOSABLE — replaced by the real CareSpace frontend, see docs/INTEGRATION.md
  main.js                   the whole current demo site (nav, map, modals) — not part of the deliverable
  guidedCaptureUI.js         the full-screen flow: capture -> review -> simulate -> export, driven entirely by createScanEngine()
  captureController.js       owns the live camera + rAF analysis loop, feeds src/engine/autoCapture.js
  demoCaptureController.js   same interface, simulates the capture rhythm against bundled sample images
  icons.js, styles.css       UI-only

server/                 Node/Express, the only place vision-provider keys are read
  index.js                 POST /api/scan (multipart image + stepId + optional visionBackend), MOCK_VISION switch
  visionProviders/
    index.js                 provider selection (VISION_PROVIDER, or a per-request override)
    geminiClient.js           @google/genai, structured JSON output per step kind
    eyepopClient.js            wraps @eyepop.ai/eyepop's workerEndpoint (pluggable, currently blocked — see below)
  mockData/<provider>/<stepId>.json   canned per-step detections for MOCK_VISION

scripts/
  check-engine-boundary.js   enforces that src/engine never imports from the UI layer — npm run check:boundary
```

Everything in `src/engine/` is pure and unit-tested (`npm test`) except `scanApi.js`'s `fetch`/`downscaleImage` calls and `scanEngine.js`'s orchestration of them — no camera, no DOM rendering, no vision-provider SDK. `reference-ui/captureController.js`, `demoCaptureController.js`, and `guidedCaptureUI.js` are the only files that touch `getUserMedia`/`<video>`/`<canvas>`/`document`.

The boundary is enforced two ways: `npm run check:boundary` (portable Node script) and the literal `grep -r "reference-ui" src/engine` a reviewer would run — both must return clean.

### Why a Node server instead of a Cloudflare Pages Function

The reference site deploys to Cloudflare Pages, which supports serverless "Pages Functions" (a `functions/` dir would be auto-picked up by the existing `wrangler pages deploy` step, no CI changes needed). We didn't use that here because Cloudflare Pages Functions run on the Workers runtime, not Node, and neither `@google/genai` nor `@eyepop.ai/eyepop`'s docs confirm Workers/edge compatibility. Rather than gamble on that in a Workers sandbox, `server/` is a plain Express app. **This is not wired into the production Cloudflare deploy** — whichever team deploys the real CareSpace frontend needs an equivalent proxy route (see `docs/INTEGRATION.md`).

### Reliable classes (Gemini, primary provider)

Gemini is prompted per step (see `server/visionProviders/geminiClient.js`): for the wide/shelving steps, it's given the exact class vocabulary from `src/engine/vision/fixtureClasses.js` and asked for bounding boxes as frame fractions; for interior steps, it's told explicitly it's looking at the *inside* of an opened fixture and asked for interior volume + fill level. Verified against a real (schematic, not photographic) test image during development — bounding boxes came back accurate to within ~1% of ground truth. **Not yet verified against real phone photos taken through the live camera path** — see `docs/MOBILE_TESTING.md`.

### Reliable EyePop classes (secondary/pluggable provider)

Stock EyePop detection abilities (COCO-style) reliably return `refrigerator`, `oven`, `microwave`, `sink` — but not `cabinet`, `shelving unit`, `pantry shelf`, `freezer`, or `dishwasher`, which aren't COCO classes. To get those, `server/visionProviders/eyepopClient.js` defaults to the `eyepop.localize-objects:latest` ability (open-vocabulary object localization) prompted with exactly the class list in `src/engine/vision/fixtureClasses.js`.

**This has not been verified against real photos, and is currently blocked** — the real EyePop call fails for *both* paths (with `EYEPOP_POP_ID` set, and with the inline `eyepop.localize-objects` fallback) with `404 "resource \"pop not found\" not found"` (error code `RES_001`). The API key authenticates (it's not a 401), so this is an EyePop-account/Pop-configuration issue, not a bug in this code — confirmed by calling `server/visionProviders/eyepopClient.js` directly against the real API. See "Blocked: EyePop account setup" below for exactly what needs to happen in the EyePop dashboard before this can be verified against real photos.

### Blocked: EyePop account setup

The credentials currently in `.env.local` (`EYEPOP_POP_ID`, `EYEPOP_API_KEY`) return `404 pop not found` for every inference call — this needs to be resolved in the EyePop dashboard, not in code:

1. Log in at **https://dashboard.eyepop.ai/auth/sign-in** with the account these credentials belong to (or create a new account/API key if that account no longer exists).
2. Confirm the account has at least one **Pop** created, and that the API key being used is scoped to that account. A `RES_001 "pop not found"` on an *inline* pop definition (no `EYEPOP_POP_ID` at all — see `buildInlinePop()` in `server/visionProviders/eyepopClient.js`) suggests the key/account itself may not be able to create compute sessions, not just that one Pop UUID being stale.
3. If existing Pops are COCO/stock-model based, either create a new Pop configured with the `eyepop.localize-objects:latest` ability (open-vocabulary localization — this is what lets it detect classes like "cabinet" or "pantry shelf" that aren't in COCO), or leave `EYEPOP_POP_ID` unset so `server/visionProviders/eyepopClient.js`'s inline fallback is used instead.
4. Copy the working Pop's UUID into `EYEPOP_POP_ID` in `.env.local` (or leave it unset to use the inline fallback), and copy a valid API key into `EYEPOP_API_KEY`.
5. Verify with: `node --env-file-if-exists=.env.local server/index.js`, then `MOCK_VISION=false` and a real `POST /api/scan` (`visionBackend=eyepop`) with a photo — a `200` with populated `objects[]` confirms it's fixed.

Until this is resolved, requesting the `eyepop` backend will show a real, visible error in the UI on every scan attempt — which is the correct/required behavior, not a separate bug.

### Floor space estimate

The "how much open floor space is there" heuristic (`estimateFloorDetection` in `adapter.js`) is intentionally rough: it treats the bottom 40% of the image as a candidate floor band, assumes the room is `assumedRoomFloorFt2` (default 200 ft², see `referenceVolumes.json`) at full-image scale, and subtracts whatever fraction of that band is covered by fixture bboxes. It is *not* real floor-plan geometry. The review step always lets the user directly overwrite the estimated ft² and set an "already reserved" ft² via `engine.setFloorArea()`/`engine.setFloorExcluded()` — those overrides are authoritative.

### Bounding-box-scaled volumes

`estimatedVolumeFt3` is **not** a constant per class. `src/engine/vision/adapter.js` scales each fixture's baseline volume (`fixtureClasses.js`) by how tall its detected bbox is relative to `baselineHeightFraction` — the fraction of frame height an average instance of that fixture is assumed to occupy when photographed to show it. A fridge filling 55% of frame height reports close to its 20 ft³ baseline; one filling 15% reports proportionally less, clamped to `VOLUME_SCALE_BOUNDS` (0.4x–2.2x) so a barely-visible or frame-filling detection doesn't produce an absurd number. There's no camera calibration behind this — it's a deliberately rough heuristic (see `adapter.test.js` for the exact behavior), not a real measurement, and `engine.setVolumeOverride()` always lets the user override it.

Every `Detection` carries a `volumeSource` (`'bbox_scaled' | 'gemini_interior' | 'default' | 'floor_heuristic' | 'manual'`) so it's traceable in a host UI (see `docs/CAPACITY.md`).

### Meals-equivalent estimates

`exportBuilder.js`'s `meals_equivalent_estimate` and the simulator's `maxQuantities().totalMealsEquivalent` are both **best-case, single-food estimates** — they assume the entire net capacity for a bucket is filled with whichever catalog item in `foods.json` has the best meals-per-ft³ (or per-ft² for floor) ratio. That tends to run optimistic. It's a deliberately simple placeholder.

### Box capacity

Alongside the ft³ breakdown, `engine.getState().boxes` / `engine.getResult().boxCapacity` report a "box"-unit estimate (`src/engine/boxCapacity.js`) for reps who think in standard produce/commodity boxes rather than cubic feet: `computedBoxes` (net ft³ across all three storage types ÷ 1.5 ft³/box, a standard "banana box"), `overrideBoxes` (a rep's manual figure via `engine.setBoxOverride()`), `bindingConstraint` (`dry`/`refrigerated`/`frozen` — whichever type has the least net capacity), and `deadSpace` (excluded/occupied volume per type). This is a labeled estimate, not a measured constant.

## Testing

```bash
npm test
npm run check:boundary
```

See `docs/HANDOFF.md` for exact test counts and what each suite proves. All engine tests are pure functions/state machines — no browser/camera/vision-API needed.

## What's real vs. demoed vs. stubbed vs. blocked

See `docs/HANDOFF.md` for the full breakdown. Short version: the engine (session model, capacity/box math, Gemini integration, demo backend) is real and unit-tested. The reference UI's guided-capture flow was verified in a browser (necessarily via its automatic demo-mode fallback, since headless Chrome has no camera) plus direct calls to the live Gemini API. EyePop inference is blocked on an account-side `404` (see above) — not fabricated as a fallback. Real on-phone camera behavior (sensor noise, real motion, real lighting) requires the test matrix in `docs/MOBILE_TESTING.md`, run on physical hardware.

## Integrating this into the CareSpace frontend

See **[`docs/INTEGRATION.md`](docs/INTEGRATION.md)** — the engine API, the handoff object schema, required server-side setup, and the ownership boundary between this repo and the host UI.

## Deployment

The reference site deploys only from `master` to the Cloudflare Pages project `carespace` via `.github/workflows/deploy.yml` (static `dist/` upload, no server) — this is the disposable demo, not the integration target. The vision scan server (`server/`) is **not** part of that deploy — see "Why a Node server instead of a Cloudflare Pages Function" above.

Add these repository Actions secrets before the first production deployment:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` — an account-scoped token with Cloudflare Pages edit permission

## Product surface (reference site only)

- Role-aware dashboard prototype for people in need and food-bank operators
- Report-food, report-need entry points; report-capacity now runs a real vision-assisted scan flow (see above)
- Match flow: report → match → move → confirm
- Privacy/trust framing for community-level signals
- Public machine-readable declarations at `/capabilities.json` and `/.well-known/capabilities.json`
- No PII anywhere in scan data or exports — CareSpace maps facilities and capacity, never individuals

## Live map data

The network card loads [`public/network-data.json`](public/network-data.json) at runtime and renders latitude/longitude signals on a live Leaflet map using OpenStreetMap/CARTO tiles. The demo is scoped to San Diego County, California (`geoid` `0500000US06073`, FIPS `06073`); the map is locked to the county envelope and ignores signals outside it. It also requests the official 2020 Census TIGERweb county boundary when available. The data shape includes `location`, freshness fields, provenance, and a PUMA-compatible `geography` object nested under the county scope. PUMAs are Census geographic areas, so replace the demo `puma_geoid`, county bounds, and optional boundary data with authoritative sources before using production data.

To point the static site at a live JSON feed, set `VITE_NETWORK_DATA_URL` during the build. The demo intentionally uses fictional organization names and approximate locations.

The dashboard loads [`public/dashboard-data.json`](public/dashboard-data.json) and can be pointed at a live feed with `VITE_DASHBOARD_DATA_URL`. The current sign-in is a non-transmitting demo gate; connect the dashboard form to the selected production identity provider before accepting real credentials or user-specific data.

Google Maps can be used as a provider-specific follow-up by supplying a Google Maps JavaScript API key and map ID; the default map does not require a key or billing account.
