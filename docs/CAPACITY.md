# Capacity aggregation rules

How `src/engine/scanEngine.js` turns a multi-capture session into `Capacity` numbers (consumed by the reference UI at `reference-ui/guidedCaptureUI.js`, or any host UI — see `docs/INTEGRATION.md`). This is the source of truth for the aggregation behavior — if the code and this doc disagree, that's a bug.

## The core rule: close-up captures are the source of truth for volume

A scan session walks through 5 guided steps (`src/engine/captureSteps.js`):

1. **wide** — step back, frame the whole room
2. **fridge_interior** — open the fridge, point inside
3. **freezer_interior** — open the freezer, point inside
4. **cabinet_interior** — open each cabinet (repeatable)
5. **shelving_floor** — shelving/floor storage (repeatable)

Steps 2-5 are close-up shots of one specific fixture (or one fixture per capture, for the repeatable steps). Step 1 is a wide shot that will very likely *also* detect the fridge, freezer, and cabinets — just from further away, with a rougher bbox-scaled volume estimate instead of an actual interior-volume-and-fill-level read.

**We do not attempt cross-photo deduplication.** There's no reliable way to know "the fridge in the wide shot" and "the fridge in the fridge_interior shot" are the same physical fridge without real-world spatial reasoning this system doesn't have. Instead:

- Every detection from every capture is kept and shown in the review screen, grouped by capture, for full transparency.
- Detections from a step marked `excludeFromTotalsByDefault: true` (currently just `wide`) are added to the session's `exclusions.fixtureIds` set **at capture time** — they start unchecked/excluded from net capacity, with a "(shown for context — counted via close-up scans)" note on that group in the review UI.
- The user can still manually re-include a wide-shot fixture (e.g. if they never did a close-up for it) by toggling its "Occupied / unusable right now" checkbox off — same mechanism as any other exclusion.

**Floor space is the one exception.** The wide shot's floor-area estimate is *not* default-excluded, because there's no dedicated "interior" step for floor space — `shelving_floor` is itself just another wide-style shot, not fundamentally more authoritative than step 1's floor estimate. If the user captures both `wide` and `shelving_floor`, both contribute floor area to gross (again, no dedup) — but neither is excluded by default.

## Known vs. available: gross vs. net

This mirrors the PRD's "KNOWN CAPACITY" vs "CURRENTLY AVAILABLE CAPACITY" distinction (see the PRD, section 13):

- **`gross`** ("known"): the sum of every non-floor detection's volume across every capture, regardless of exclusion. This intentionally double-counts a fixture that appears in both a wide shot and a close-up — it answers "how much storage capacity does this facility have, as far as we've observed."
- **`net`** ("available"): `gross` minus everything currently excluded (default-excluded wide-shot fixtures, user-excluded "occupied" fixtures, and floor-zone exclusions). This is what feeds the fit simulator and the exported `available_capacity`.

Both numbers are computed by `computeCapacity()` in `src/engine/vision/capacityEngine.js` — the multi-capture session flattens every capture's detections into one list (`allDetections()` in `src/engine/scanSession.js`) before handing them to it, with one shared `exclusions`/`overrides` map spanning the whole session (detection ids are unique across captures, so this is safe). `src/engine/boxCapacity.js` derives a second "box"-unit figure from these same net numbers — see the main README's "Box capacity" section and `docs/INTEGRATION.md`'s handoff schema.

## Interior-shot volume: `interiorVolumeFt3 × (1 − percentFull)`

For the four interior steps, Gemini is told explicitly that it's looking at the *inside* of an opened fixture (see the prompt in `server/visionProviders/geminiClient.js`) and returns exactly one fixture entry with:

- `interiorVolumeFt3` — estimated total usable interior volume, as if empty
- `percentFull` — current fill level, 0 (empty) to 1 (full)

`src/engine/vision/geminiAdapter.js`'s `normalizeGeminiInteriorDetection()` computes `estimatedVolumeFt3 = interiorVolumeFt3 × (1 − percentFull)` — that's the number that feeds capacity totals ("capacity measured today"). Both `interiorVolumeFt3` and `percentFull` stay on the `Detection` object; a host UI can call `engine.setPercentFull(fixtureId, pct)` instead of a raw volume input for these, and it recomputes `estimatedVolumeFt3` live and marks `volumeSource: 'manual'`.

## Wide-shot volume: bbox-height scaling

For `wide`/`shelving_floor` captures, volume isn't a flat per-class constant either — `src/engine/vision/adapter.js`'s `scaleFactorFor()` scales each class's baseline volume (`fixtureClasses.js`) by how tall its detected bbox is relative to an assumed "typical framing" height fraction for that class, clamped to `VOLUME_SCALE_BOUNDS`. Both the EyePop and Gemini wide-shot adapters share this exact function, so a "cabinet filling 30% of frame height" scales the same way regardless of which vision provider produced the detection.

## `volumeSource`, for auditability

Every `Detection` carries a `volumeSource` so the review UI and the exported `scan_detail.fixtures[]` can show exactly how a number was derived, never presenting anything as more authoritative than it is:

| `volumeSource` | Meaning |
|---|---|
| `bbox_scaled` | Wide-shot detection, volume scaled by detected bbox height |
| `gemini_interior` | Interior-shot detection, volume = `interiorVolumeFt3 × (1 − percentFull)` |
| `floor_heuristic` | Synthetic floor detection from the bottom-band heuristic |
| `default` | Fixture class recognized but no baseline volume/scaling data (rare) |
| `manual` | User created the fixture from scratch, or edited an existing one's type/volume/area/fill-level |

## Meals-equivalent and the "binding constraint" callout

`maxQuantities()`/`totalMealsEquivalent` (in `src/engine/vision/simulator.js`) are best-case, single-food-type estimates per capacity type (see the caveat in the main README). `bindingConstraint()` (same file, also re-exported from `src/engine/index.js`): for each capacity type, it computes the meals-equivalent if that type alone were filled optimally, then reports whichever type supports the *fewest* meals as the limiting factor — e.g. "Frozen storage is your binding constraint — about 100 meals worth right now." This recomputes live as exclusions/overrides change, since it's just a function of `sessionCapacity()`. Note `src/engine/boxCapacity.js` has its own, simpler `bindingConstraint` field (just `dry`/`refrigerated`/`frozen`, no meals figure) used in the handoff object — same underlying idea, two different shapes for two different audiences.
