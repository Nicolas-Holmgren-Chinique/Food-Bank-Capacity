# Handoff: guided auto-capture scan

Status, demo script, and open items for the "VisionSoft" guided auto-capture feature — a document-scanner-style flow that walks the user through a room and auto-captures frames when the shot is good, instead of a single manual photo upload.

**Update**: this repo has since been split into `src/engine/` (permanent, UI-independent) and `reference-ui/` (disposable reference implementation) — see `docs/INTEGRATION.md`. File paths below are current as of that split; everything described still holds, just relocated.

## What's real vs. demoed vs. blocked

- **Real, unit-tested**: the auto-capture stability/quality-gating state machine (`src/engine/autoCapture.js`), the multi-capture session model and its wide-shot-exclusion-by-default aggregation rule (`src/engine/scanSession.js`, see `docs/CAPACITY.md`), the Gemini response adapter including the `percentFull` volume math (`src/engine/vision/geminiAdapter.js`), the concurrency-limited analysis queue (`src/engine/analysisQueue.js`), and the box-capacity math (`src/engine/boxCapacity.js`). `npm test`.
- **Real, verified against the live Gemini API**: both the wide-shot (bbox array) and interior-shot (volume + fill level) JSON schemas were tested against `gemini-3.6-flash` with real API calls during development — see `server/visionProviders/geminiClient.js`. Bounding boxes came back accurate to within a couple percentage points of ground truth on a test image.
- **Demoed, not phone-tested**: the entire guided-capture UI (`reference-ui/guidedCaptureUI.js`) — full-screen camera view, progress ring, filmstrip, step flow, review/simulate/export. Verified end-to-end in a **desktop headless browser**, which has no camera, so it exercised the automatic demo-mode fallback (bundled sample images auto-"captured" on a simulated stability ramp) rather than `getUserMedia`. The camera code path (`reference-ui/captureController.js`) is written directly against the same tested `autoCapture.js` engine, but its actual behavior against a real phone camera — sensor noise levels, real motion patterns, real lighting — needs the test matrix in `docs/MOBILE_TESTING.md`, run on physical hardware. The tunables in `autoCapture.js`'s `DEFAULT_AUTO_CAPTURE_CONFIG` are best-guess starting points, explicitly commented as needing on-device tuning.
- **Not implemented**: Tier 2 (TensorFlow.js COCO-SSD content-aware gating) — out of scope per the timebox in the original spec ("implement Tier 1 fully before touching Tier 2"). Rectangular floor-zone drawing, a live bbox overlay on the camera feed, and `placementLayout()`'s 2D output are also not wired to any UI.

## Demo script (works today, no camera or credentials required)

```bash
npm install
cp .env.example .env.local   # leave MOCK_VISION=false if you have a real GEMINI_API_KEY, else set it to true
npm run server                 # terminal 1
npm run dev                    # terminal 2
```

Open the site, click **I have capacity**. On a laptop (no camera, or camera permission denied) it automatically falls back to demo mode — a visible "Demo mode — no camera" badge appears, and it starts auto-"capturing" the bundled sample images on the same simulated stability ramp a real camera would use:

> open app → click "I have capacity" → it auto-captures the wide shot by itself → advances → opens the fridge interior sample, captures → freezer → cabinets (captures 2, since that step allows repeats) → shelving/floor → tap "Done with this step" → review screen shows fixtures grouped by capture, wide-shot ones unchecked by default → capacity totals and the binding-constraint callout update live → simulate a delivery → export → N capacity records, downloadable as JSON.

On a real phone with camera permission granted, the same flow runs against the live camera instead — point at the room, hold steady ~1s, the progress ring fills and it captures itself; move to the next spot, hold steady again for the next one. The manual shutter button (bottom of the capture screen) always works regardless of auto-capture state, and "Or upload a photo instead" is available at every step as a fallback.

## Open items for whoever picks this up next

1. **On-device tuning is the biggest unknown.** `autoCapture.js`'s thresholds (`stabilityThreshold`, `motionBurstThreshold`, `blurVarianceThreshold`) were chosen from first principles, not measured against a real phone camera's sensor noise. First thing to do with a phone in hand: log `frameStatus.diff`/`luminance`/`sharpness` from `captureController.js`'s `onStatus` callback while holding a phone steady vs. moving it, and adjust the config in `DEFAULT_AUTO_CAPTURE_CONFIG` accordingly.
2. **Gemini model name may drift again.** It's already been bumped once mid-build (`gemini-2.5-flash` → `gemini-3.6-flash`, discovered via a live 404 telling us the replacement, not docs). If scans start failing with a 404 "model no longer available," check `server/visionProviders/geminiClient.js`'s `MODEL` constant against the error message first.
3. **EyePop is still wired up but untested against this feature.** `server/visionProviders/eyepopClient.js` implements the same `analyzeCapture()` interface Gemini does, selectable via `VISION_PROVIDER=eyepop`, but it has no notion of "interior shot" (it'll just run object detection on whatever image it's given regardless of step) and hasn't been exercised against the new per-step contract. If EyePop credentials get fixed later (see the main README's "Blocked: EyePop account setup"), this needs its own verification pass.
4. **Review screen simplification**: tapping a filmstrip thumbnail highlights (outlines) that capture's fixture group rather than filtering the list down to just that capture. Fine for a handful of captures; reconsider if sessions regularly have many more.
5. **Manual shutter and thumbnail delete/retake** are implemented and unit-testable at the controller level, but weren't clickable in the headless-browser verification pass (no camera = no live video frame to manually capture from in that environment). Worth a quick manual check on first real device use.
