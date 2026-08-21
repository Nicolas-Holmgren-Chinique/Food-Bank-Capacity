import referenceVolumes from './referenceVolumes.json' with { type: 'json' };
import { lookupFixtureClass, VOLUME_SCALE_BOUNDS } from './fixtureClasses.js';

/**
 * @typedef {Object} Detection
 * @property {string} id
 * @property {string} rawClass
 * @property {string} category - 'refrigerator'|'freezer'|'cabinet'|'shelving'|'pantry'|'kitchen_fixture'|'floor'|'other'
 * @property {string|null} capacityType - 'refrigerated_storage'|'frozen_storage'|'dry_storage'|'floor_staging'|null
 * @property {number|null} confidence - 0-1, null for manual detections
 * @property {{x:number,y:number,width:number,height:number}} bbox - normalized 0-1
 * @property {number} [estimatedVolumeFt3]
 * @property {number} [estimatedAreaFt2]
 * @property {number} [freezerCompartmentFt3]
 * @property {boolean} [mealPrepFlag]
 * @property {boolean} excluded
 * @property {'detected'|'manual'} source
 * @property {'bbox_scaled'|'default'|'manual'|'floor_heuristic'|'gemini_interior'} volumeSource - how estimatedVolumeFt3/estimatedAreaFt2 was derived; always overridable by the user in the review step
 * @property {number} [interiorVolumeFt3] - Gemini interior-shot only: estimated total interior volume before accounting for current fill level
 * @property {number} [percentFull] - Gemini interior-shot only: 0-1, current fill level; user-editable, recomputes estimatedVolumeFt3 = interiorVolumeFt3 * (1 - percentFull) live
 * @property {string} [captureId] - stamped by scanSession.js: which capture in a multi-capture session this detection came from
 * @property {string} [stepId] - stamped by scanSession.js: which guided step (see captureSteps.js) produced this detection
 */

let idCounter = 0;
function nextId(prefix) {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function round1(value) {
  return Math.round(value * 10) / 10;
}

/** Scales a baseline volume by how much larger/smaller a detection's bbox height is than the class's expected baseline framing, clamped to VOLUME_SCALE_BOUNDS. Shared across vendor adapters (EyePop, Gemini) so both scale volumes the same way. */
export function scaleFactorFor(bboxHeight, baselineHeightFraction) {
  const raw = bboxHeight / baselineHeightFraction;
  return Math.min(VOLUME_SCALE_BOUNDS.max, Math.max(VOLUME_SCALE_BOUNDS.min, raw));
}

function bboxOverlapArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/**
 * Converts a raw EyePop `Prediction` (source_width/source_height + objects[])
 * into our own Detection[] shape, so nothing downstream depends on EyePop's
 * response format. Also appends one synthetic "floor" Detection estimating
 * unoccupied staging space in the lower portion of the image.
 *
 * @param {{source_width?: number, source_height?: number, objects?: Array}} prediction
 * @param {{assumedRoomFloorFt2?: number, floorBandHeightFraction?: number}} [options]
 * @returns {Detection[]}
 */
export function normalizeDetections(prediction, options = {}) {
  const assumedRoomFloorFt2 = options.assumedRoomFloorFt2 ?? referenceVolumes.assumedRoomFloorFt2;
  const floorBandHeightFraction = options.floorBandHeightFraction ?? referenceVolumes.floorBandHeightFraction;

  const sourceWidth = prediction.source_width || 1;
  const sourceHeight = prediction.source_height || 1;
  const rawObjects = prediction.objects || [];

  const fixtures = rawObjects.map((obj) => {
    const match = lookupFixtureClass(obj.classLabel);
    const bbox = {
      x: clamp01(obj.x / sourceWidth),
      y: clamp01(obj.y / sourceHeight),
      width: clamp01(obj.width / sourceWidth),
      height: clamp01(obj.height / sourceHeight),
    };

    const scale = match?.baselineHeightFraction ? scaleFactorFor(bbox.height, match.baselineHeightFraction) : 1;
    const hasVolume = typeof match?.defaultVolumeFt3 === 'number';

    /** @type {Detection} */
    const detection = {
      id: nextId('fixture'),
      rawClass: obj.classLabel,
      category: match?.category ?? 'other',
      capacityType: match?.capacityType ?? null,
      confidence: typeof obj.confidence === 'number' ? obj.confidence : null,
      bbox,
      estimatedVolumeFt3: hasVolume ? round1(match.defaultVolumeFt3 * scale) : 0,
      freezerCompartmentFt3: match?.freezerCompartmentFt3 ? round1(match.freezerCompartmentFt3 * scale) : 0,
      mealPrepFlag: Boolean(match?.mealPrepFlag),
      excluded: false,
      source: 'detected',
      volumeSource: hasVolume ? 'bbox_scaled' : 'default',
    };
    return detection;
  });

  return withFloorDetection(fixtures, { assumedRoomFloorFt2, floorBandHeightFraction });
}

/**
 * Appends one synthetic "floor" Detection to a fixtures array, estimating
 * unoccupied staging space in the lower portion of the frame. Exported so
 * any vendor adapter producing a wide-shot fixtures array (EyePop's
 * normalizeDetections above, Gemini's normalizeGeminiWideDetections) gets
 * the same floor heuristic without duplicating it.
 *
 * @param {Detection[]} fixtures
 * @param {{assumedRoomFloorFt2?: number, floorBandHeightFraction?: number}} [options]
 * @returns {Detection[]}
 */
export function withFloorDetection(fixtures, options = {}) {
  const assumedRoomFloorFt2 = options.assumedRoomFloorFt2 ?? referenceVolumes.assumedRoomFloorFt2;
  const floorBandHeightFraction = options.floorBandHeightFraction ?? referenceVolumes.floorBandHeightFraction;
  const floor = estimateFloorDetection(fixtures, { assumedRoomFloorFt2, floorBandHeightFraction });
  return [...fixtures, floor];
}

/**
 * Rough heuristic: the bottom band of the image is treated as candidate
 * floor/staging space; area covered by fixture bboxes within that band is
 * subtracted. This is intentionally simple — the UI lets a user override
 * estimatedAreaFt2 directly, which always wins over this estimate.
 */
function estimateFloorDetection(fixtures, { assumedRoomFloorFt2, floorBandHeightFraction }) {
  const band = { x: 0, y: 1 - floorBandHeightFraction, width: 1, height: floorBandHeightFraction };
  const bandAreaFraction = band.width * band.height;

  let occupiedFraction = 0;
  for (const fixture of fixtures) {
    occupiedFraction += bboxOverlapArea(fixture.bbox, band);
  }
  occupiedFraction = Math.min(occupiedFraction, bandAreaFraction);

  const freeFraction = Math.max(0, bandAreaFraction - occupiedFraction);
  const estimatedAreaFt2 = Number((assumedRoomFloorFt2 * freeFraction).toFixed(1));

  /** @type {Detection} */
  return {
    id: nextId('floor'),
    rawClass: 'floor',
    category: 'floor',
    capacityType: 'floor_staging',
    confidence: null,
    bbox: band,
    estimatedAreaFt2,
    excluded: false,
    source: 'detected',
    volumeSource: 'floor_heuristic',
  };
}

/** Builds a manual (user-drawn) Detection for fixtures EyePop missed. */
export function createManualDetection({ category, capacityType, estimatedVolumeFt3 = 0, estimatedAreaFt2 = 0, freezerCompartmentFt3 = 0, bbox }) {
  return {
    id: nextId('manual'),
    rawClass: category,
    category,
    capacityType,
    confidence: null,
    bbox: bbox ?? { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
    estimatedVolumeFt3,
    estimatedAreaFt2,
    freezerCompartmentFt3,
    mealPrepFlag: false,
    excluded: false,
    source: 'manual',
    volumeSource: 'manual',
  };
}
