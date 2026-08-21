# Integration guide (for the CareSpace frontend team)

This is how to mount the vision scan engine inside CareSpace's Scan tab. You will never need to touch `src/engine/`'s internals, and you should not copy anything from `reference-ui/` — that folder is our disposable test harness, not a component library (see its README).

## The boundary

**We own analysis, capacity math, and the result object. You own all UI and UX.** Concretely: `src/engine/` has no DOM access, no styling, and no assumptions about your layout, navigation, or design system — it is one JS module you call methods on and read state from. You decide what the camera screen looks like, how steps are presented, what the review/edit UI looks like, and how the result feeds Analyze/Allocate. If a change you need requires touching anything under `src/engine/`, that's a signal the engine API is missing something — ask us to extend it rather than reaching past it.

## Minimal example

No camera, no reference UI, no server required to read this — just the shape of the calls:

```js
import { createScanEngine } from '<this-package>/src/engine/index.js';

const engine = createScanEngine({ visionBackend: 'gemini', agencyId: 'agency-123' });
engine.subscribe((state) => renderYourScanUI(state)); // called on every capture/edit

await engine.submitCapture(wideRoomPhotoBlob, 'wide');
await engine.submitCapture(fridgeInteriorPhotoBlob, 'fridge_interior');
// state.hasPendingWork is true while analysis is in flight; subscribe fires again on completion

engine.toggleFixture(someFixtureId); // e.g. "mark occupied" checkbox
const handoff = engine.getResult(); // hand this object to Analyze/Allocate
```

That's a complete scan, start to finish. Everything else in this doc is detail.

## The engine API

```js
const engine = createScanEngine({ visionBackend, agencyId });
```

| Option | Type | Meaning |
|---|---|---|
| `visionBackend` | `'gemini'\|'eyepop'\|'demo'` | Which vision backend analyzes captures. `'demo'` never touches the network — resolves from bundled fixtures, useful for your own UI development/testing. Omit to let the server's `VISION_PROVIDER` env decide. |
| `agencyId` | `string` | Your org/agency identifier — you already have this from your own auth/org context. Passed straight through to `getResult().agencyId`. |

Or, in a React host, the equivalent hook (imported separately — see below):

```js
import { useScanEngine } from '<this-package>/src/engine/useScanEngine.js';
const { state, engine } = useScanEngine({ visionBackend: 'gemini', agencyId: 'agency-123' });
```

**Core methods** (the contract; stable):

| Method | Signature | Effect |
|---|---|---|
| `submitCapture` | `(imageBlob, stepId) => Promise<captureId>` | Uploads/queues one capture for analysis. Resolves immediately with the id; analysis runs async — watch `subscribe`/`getState()` for the capture's `status` to move `queued → analyzing → done\|failed`. `stepId` must be one of `CAPTURE_STEPS` (see below). |
| `toggleFixture` | `(fixtureId) => void` | Check/uncheck a detected fixture's "occupied / unusable right now" state. |
| `setVolumeOverride` | `(fixtureId, ft3) => void` | Overrides a fixture's volume. |
| `setPercentFull` | `(fixtureId, pct) => void` | Overrides an interior-shot fixture's fill level. **`pct` is a 0–1 fraction, not 0–100.** Recomputes that fixture's usable volume for you. |
| `setBoxOverride` | `(count, note?) => void` | A rep's manual box-count figure, overriding the computed estimate. Pass `count: null` to clear it. |
| `getState` | `() => ScanEngineState` | Full current state — see below. |
| `subscribe` | `(listener) => unsubscribe` | Called with the new state on every change. Call the returned function to stop listening (e.g. on unmount). |
| `getResult` | `() => HandoffObject` | The object to hand to Analyze/Allocate — see schema below. |

**Extensions** (useful, not part of the core 7 above — used by our own reference UI, safe to ignore if you don't need them):

| Method | Signature | Effect |
|---|---|---|
| `deleteCapture` | `(captureId) => void` | Removes a capture and its detections (e.g. a retake). |
| `addManualFixture` | `({ category, capacityType?, estimatedVolumeFt3?, freezerCompartmentFt3? }) => fixtureId` | Adds a fixture the vision backend missed. `category` is one of `'refrigerator'\|'freezer'\|'cabinet'\|'shelving'\|'pantry'`; omitted fields fall back to reasonable per-category defaults. |
| `setCapacityTypeOverride` | `(fixtureId, capacityType) => void` | Reclassifies a fixture (`'refrigerated_storage'\|'frozen_storage'\|'dry_storage'`). |
| `setFloorArea` | `(areaFt2) => void` | Overrides the free-floor-space estimate. |
| `setFloorExcluded` | `(areaFt2) => void` | How much floor area is already reserved/occupied. |
| `setAgencyId` | `(id) => void` | Sets `agencyId` after construction. Most hosts won't need this — you already know the agency and can pass it to `createScanEngine()` up front. |

**`CAPTURE_STEPS`** (also exported from `src/engine/index.js`): the 5-step guided sequence your camera UI should walk the user through — `wide`, `fridge_interior`, `freezer_interior`, `cabinet_interior` (repeatable), `shelving_floor` (repeatable). Each entry has `id`, `label`, `hint`, `kind` (`'wide'|'interior'`), and `multiCapture` (whether the step can be captured more than once, e.g. multiple cabinets). Use these for your own step copy/UI — see `src/engine/captureSteps.js` for the full shape, and `docs/CAPACITY.md` for why the aggregation works the way it does (short version: close-up captures are the source of truth for volume; the wide shot is shown for context but excluded from totals by default).

### `getState()` shape

```ts
{
  sessionId: string,
  agencyId: string,
  captures: Capture[],       // one per submitCapture() call, with .status/.detections
  fixtures: Detection[],     // every detection across every capture, flattened
  exclusions: { fixtureIds: string[], floorZones: {areaFt2:number}[] },
  overrides: Record<string, object>,
  capacity: {                // ft3/ft2 buckets, gross/net/excluded — see docs/CAPACITY.md
    dry_storage, refrigerated_storage, frozen_storage, floor_staging
  },
  boxes: {                   // same shape as getResult().boxCapacity
    computedBoxes, overrideBoxes, bindingConstraint, deadSpace
  },
  isMock: boolean,            // true if any capture came back from a demo/mock backend
  hasPendingWork: boolean,    // true while any capture is queued/analyzing
  provider: string|null,      // vision backend that produced the most recent result
}
```

## Required inputs

- **Image format**: any `Blob`/`File` your camera or file picker produces (JPEG/PNG/WebP — whatever `canvas.toBlob()` or a native camera capture gives you). The engine downscales to ≤1920px on the longest side before upload; you don't need to do this yourself.
- **`stepId`**: must be one of `CAPTURE_STEPS[].id`. Passing anything else rejects the `submitCapture()` promise without mutating state.
- **`agencyId`**: any string that identifies the organization to you. Not validated or looked up by the engine — it's opaque, just carried through to the handoff object.

## The handoff object (`getResult()`)

```json
{
  "scanId": "session-abc123",
  "agencyId": "agency-123",
  "timestamp": "2026-08-21T14:03:00.000Z",
  "capacity": {
    "dryFt3": { "gross": 18, "net": 12 },
    "refrigeratedFt3": { "gross": 20, "net": 9.9 },
    "frozenFt3": { "gross": 6, "net": 6 }
  },
  "boxCapacity": {
    "computedBoxes": 18,
    "overrideBoxes": null,
    "bindingConstraint": "frozen",
    "deadSpace": { "dry": 6, "refrigerated": 10.1, "frozen": 0 }
  },
  "captures": [
    { "captureId": "capture-xyz", "stepId": "wide", "fixtures": [ /* Detection[] */ ] }
  ],
  "source": "gemini",
  "verifiedBy": "agency_rep"
}
```

| Field | Meaning |
|---|---|
| `scanId` | Unique id for this scan session. |
| `agencyId` | Whatever you passed to `createScanEngine()` (or set via `setAgencyId`). |
| `timestamp` | ISO-8601, generated at `getResult()` call time — call it once, when the rep is done, not continuously. |
| `capacity.{dry,refrigerated,frozen}Ft3` | `gross` = everything detected, `net` = gross minus anything excluded/occupied. `net` is what should drive Allocate. See `docs/CAPACITY.md` for the full gross-vs-net rationale. |
| `boxCapacity.computedBoxes` | Total net capacity (all three types combined) expressed in ~1.5 ft³ "boxes" — a labeled estimate, not a measured count (`src/engine/boxCapacity.js`). |
| `boxCapacity.overrideBoxes` | A rep's manual figure, if `setBoxOverride()` was called; `null` if the computed estimate stands. **Prefer this over `computedBoxes` when present** — it means a human corrected the estimate. |
| `boxCapacity.bindingConstraint` | `"dry"\|"refrigerated"\|"frozen"` — whichever type has the least net capacity, i.e. what will run out first. |
| `boxCapacity.deadSpace` | Net ft³ per type currently excluded (occupied/unusable) — how much of the known capacity isn't actually available right now. |
| `captures[]` | One entry per `submitCapture()` call, each with its raw `fixtures` (`Detection[]`, same shape as `getState().fixtures`, filtered to that capture) for audit/detail views. |
| `source` | Which vision backend actually produced this result: `"gemini"`, `"eyepop"`, or `"demo"` if any part of the scan came from mock/demo data — check this before treating a scan as a real analysis. |
| `verifiedBy` | Currently always `"agency_rep"` — a human confirmed this scan (implicit in the flow: they submitted the captures and reviewed the totals). Reserved for future provenance detail if that assumption changes. |

Also available but **not primary** (predates this integration model, kept for any downstream system that wants the older per-type Capacity-record shape over HTTP): `buildCapacityRecords`, `buildScanDetail`, `postCapacityRecords`, `downloadCapacityExport` from `src/engine/index.js`. New integrations should use `getResult()`.

## Server-side setup

You need one proxy route so vision-provider API keys never reach the browser — either run `server/` as-is (Node/Express) behind your own reverse proxy, or port `server/index.js` + `server/visionProviders/` into your own backend (it's ~100 lines, no framework lock-in beyond Express).

**Route**: `POST /api/scan`, multipart form: `image` (file), `stepId` (string), optional `visionBackend` (string — overrides the server default for that one request, matching `createScanEngine({ visionBackend })`). Response: `{ provider, mock, stepId, prediction, debug? }`. The engine's `scanApi.js` already speaks this exact contract — if you use `server/` unmodified, you don't need to know this shape at all.

**Env vars** (server-side only, never exposed to the browser):

| Var | Required? | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes, unless `MOCK_VISION=true` or every request uses `visionBackend: 'demo'` | Gemini auth — get one at https://aistudio.google.com/apikey |
| `VISION_PROVIDER` | No (defaults `gemini`) | `"gemini"` or `"eyepop"` — server-side default backend, overridable per-request |
| `EYEPOP_API_KEY` / `EYEPOP_POP_ID` | Only if using EyePop | See main README — EyePop is currently blocked on an account-side issue, unverified |
| `MOCK_VISION` | No | `"true"` returns canned per-step responses instead of calling a real vision API — dev convenience, distinct from the fully-offline `visionBackend: 'demo'` |
| `SCAN_SERVER_PORT` | No (defaults `8787`) | Port `server/index.js` listens on |

If you'd rather never run a Node process, `visionBackend: 'demo'` (client-only) skips the server entirely for testing/demo purposes — but real scans need the proxy above.

## What we don't handle

Auth, org lookup, multi-tenant access control, and where the scan physically happens in your Scan→Analyze→Allocate flow are entirely yours. We also don't push data anywhere — there's no POST-to-your-backend step on our side; you call `getResult()` in-process and do whatever you want with it (pass to Analyze directly, persist it, etc.).
