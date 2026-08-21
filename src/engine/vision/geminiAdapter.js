import { clamp01, round1, scaleFactorFor, withFloorDetection } from './adapter.js';
import { lookupFixtureClass } from './fixtureClasses.js';

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-gemini-${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Normalizes a Gemini 'wide' response (`{ fixtures: [{ class, confidence,
 * bbox:{x,y,width,height} }] }`, all bbox fields already 0-1 frame
 * fractions per the request schema — no source_width/height math needed,
 * unlike EyePop's pixel-coordinate response) into our Detection[] shape.
 * Volume scaling reuses the exact same bbox-height heuristic as the EyePop
 * adapter, via the shared `scaleFactorFor` helper.
 *
 * @param {{fixtures?: Array<{class?: string, confidence?: number, bbox?: {x?:number,y?:number,width?:number,height?:number}}>}} geminiJson
 * @returns {import('./adapter.js').Detection[]}
 */
export function normalizeGeminiWideDetections(geminiJson) {
  const rawFixtures = Array.isArray(geminiJson?.fixtures) ? geminiJson.fixtures : [];

  const fixtures = rawFixtures.map((raw) => {
    const match = lookupFixtureClass(raw.class);
    const bbox = {
      x: clamp01(raw.bbox?.x ?? 0),
      y: clamp01(raw.bbox?.y ?? 0),
      width: clamp01(raw.bbox?.width ?? 0.2),
      height: clamp01(raw.bbox?.height ?? 0.2),
    };
    const scale = match?.baselineHeightFraction ? scaleFactorFor(bbox.height, match.baselineHeightFraction) : 1;
    const hasVolume = typeof match?.defaultVolumeFt3 === 'number';

    /** @type {import('./adapter.js').Detection} */
    return {
      id: nextId('fixture'),
      rawClass: raw.class ?? 'unknown',
      category: match?.category ?? 'other',
      capacityType: match?.capacityType ?? null,
      confidence: typeof raw.confidence === 'number' ? clamp01(raw.confidence) : null,
      bbox,
      estimatedVolumeFt3: hasVolume ? round1(match.defaultVolumeFt3 * scale) : 0,
      freezerCompartmentFt3: match?.freezerCompartmentFt3 ? round1(match.freezerCompartmentFt3 * scale) : 0,
      mealPrepFlag: Boolean(match?.mealPrepFlag),
      excluded: false,
      source: 'detected',
      volumeSource: hasVolume ? 'bbox_scaled' : 'default',
    };
  });

  return withFloorDetection(fixtures);
}

/**
 * Normalizes a Gemini 'interior' response — the camera is inside an opened
 * fixture, so Gemini returns exactly ONE fixture entry with an interior
 * volume + current fill level instead of a bbox list. Net usable volume is
 * `interiorVolumeFt3 * (1 - percentFull)` — this is the "capacity measured
 * today" figure; percentFull stays on the Detection so the review UI can
 * let the user correct it and recompute live.
 *
 * @param {{class?: string, confidence?: number, interiorVolumeFt3?: number, percentFull?: number}} geminiJson
 * @param {import('../scan/captureSteps.js').CAPTURE_STEPS[number]} step
 * @returns {import('./adapter.js').Detection[]} - zero or one entries
 */
export function normalizeGeminiInteriorDetection(geminiJson, step) {
  if (!geminiJson || typeof geminiJson.interiorVolumeFt3 !== 'number') return [];

  const interiorVolumeFt3 = Math.max(0, geminiJson.interiorVolumeFt3);
  const percentFull = clamp01(typeof geminiJson.percentFull === 'number' ? geminiJson.percentFull : 0);
  const netVolumeFt3 = round1(interiorVolumeFt3 * (1 - percentFull));

  /** @type {import('./adapter.js').Detection} */
  const detection = {
    id: nextId('fixture'),
    rawClass: geminiJson.class ?? step.detectionCategory,
    category: step.detectionCategory,
    capacityType: step.capacityType,
    confidence: typeof geminiJson.confidence === 'number' ? clamp01(geminiJson.confidence) : null,
    bbox: { x: 0, y: 0, width: 1, height: 1 }, // interior shot: the whole frame IS the fixture, no spatial bbox to report
    estimatedVolumeFt3: netVolumeFt3,
    interiorVolumeFt3: round1(interiorVolumeFt3),
    percentFull,
    freezerCompartmentFt3: 0,
    mealPrepFlag: false,
    excluded: false,
    source: 'detected',
    volumeSource: 'gemini_interior',
  };
  return [detection];
}

/**
 * @param {unknown} geminiJson - parsed JSON from server/visionProviders/geminiClient.js
 * @param {import('../scan/captureSteps.js').CAPTURE_STEPS[number]} step
 * @returns {import('./adapter.js').Detection[]}
 */
export function normalizeGeminiDetections(geminiJson, step) {
  if (step.kind === 'interior') return normalizeGeminiInteriorDetection(geminiJson, step);
  return normalizeGeminiWideDetections(geminiJson);
}
