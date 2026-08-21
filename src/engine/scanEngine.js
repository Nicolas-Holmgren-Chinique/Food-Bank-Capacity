import { createAnalysisQueue } from './analysisQueue.js';
import { computeBoxCapacity } from './boxCapacity.js';
import { CAPTURE_STEPS, stepById } from './captureSteps.js';
import { analyzeDemoCapture } from './demoBackend.js';
import { downscaleImage, requestScan } from './scanApi.js';
import {
  addCapture,
  allDetections,
  createSession,
  hasPendingWork,
  isSessionMock,
  removeCapture,
  sessionCapacity,
  setCaptureFailed,
  setCaptureResult,
  setCaptureStatus,
  setFloorExclusionFt2,
  setOverride,
  toggleExclusion,
} from './scanSession.js';
import { createManualDetection, round1 } from './vision/adapter.js';

/** Domain defaults for a fixture the vision backend missed, keyed by category — see addManualFixture(). */
const MANUAL_FIXTURE_DEFAULTS = {
  refrigerator: { capacityType: 'refrigerated_storage', estimatedVolumeFt3: 20, freezerCompartmentFt3: 6 },
  freezer: { capacityType: 'frozen_storage', estimatedVolumeFt3: 15 },
  cabinet: { capacityType: 'dry_storage', estimatedVolumeFt3: 6 },
  shelving: { capacityType: 'dry_storage', estimatedVolumeFt3: 12 },
  pantry: { capacityType: 'dry_storage', estimatedVolumeFt3: 12 },
  other: { capacityType: 'dry_storage', estimatedVolumeFt3: 6 },
};

/**
 * @typedef {Object} ScanEngineState
 * @property {string} sessionId
 * @property {string} agencyId
 * @property {import('./scanSession.js').Capture[]} captures
 * @property {import('./vision/adapter.js').Detection[]} fixtures - every detection across every capture, flattened
 * @property {{fixtureIds: string[], floorZones: {areaFt2: number}[]}} exclusions
 * @property {Record<string, object>} overrides
 * @property {ReturnType<typeof import('./vision/capacityEngine.js').computeCapacity>} capacity
 * @property {ReturnType<typeof computeBoxCapacity>} boxes
 * @property {boolean} isMock
 * @property {boolean} hasPendingWork
 * @property {string|null} provider - the vision backend that produced the most recent capture result
 */

/**
 * The engine API contract (see docs/INTEGRATION.md). Framework-agnostic:
 * every method is plain data in/out, and `subscribe` is a standard
 * push-based store so any UI layer (vanilla DOM, React, anything else) can
 * drive it. No DOM access, no styling, no rendering — a host UI owns all of
 * that and only ever calls these methods / reads `getState()`.
 *
 * @param {{ visionBackend?: 'gemini'|'eyepop'|'demo', agencyId?: string }} [options]
 */
export function createScanEngine({ visionBackend, agencyId = '' } = {}) {
  const session = createSession();
  session.facilityId = agencyId;
  const captureBlobs = new Map(); // captureId -> downscaled Blob, kept out of state (not serializable/not needed by a host UI)
  const listeners = new Set();
  let boxOverride = { count: null, note: null };
  let lastProvider = null;

  const analysisQueue = createAnalysisQueue({ concurrency: 2, run: analyzeOneCapture });

  function snapshot() {
    const capacity = sessionCapacity(session);
    return {
      sessionId: session.sessionId,
      agencyId: session.facilityId,
      captures: session.captures.map((capture) => ({ ...capture })),
      fixtures: allDetections(session),
      exclusions: session.exclusions,
      overrides: session.overrides,
      capacity,
      boxes: computeBoxCapacity(capacity, boxOverride),
      isMock: isSessionMock(session),
      hasPendingWork: hasPendingWork(session),
      provider: lastProvider,
    };
  }

  function notify() {
    const state = snapshot();
    listeners.forEach((listener) => listener(state));
  }

  /**
   * Uploads one capture for analysis. Returns the capture id immediately;
   * analysis (downscale -> vision backend -> normalize) runs async and is
   * reflected in `getState()`/`subscribe()` as the capture's `status`
   * transitions queued -> analyzing -> done|failed.
   *
   * @param {Blob} imageBlob
   * @param {string} stepId - see CAPTURE_STEPS
   * @returns {Promise<string>} captureId
   */
  async function submitCapture(imageBlob, stepId) {
    const step = stepById(stepId);
    if (!step) throw new Error(`Unknown capture step "${stepId}". See CAPTURE_STEPS.`);

    let downscaled;
    let imageDataUrl;
    try {
      ({ blob: downscaled, dataUrl: imageDataUrl } = await downscaleImage(imageBlob, 1920));
    } catch {
      downscaled = imageBlob;
      imageDataUrl = URL.createObjectURL(imageBlob);
    }

    const capture = addCapture(session, { stepId, imageDataUrl });
    captureBlobs.set(capture.captureId, downscaled);
    notify();
    analysisQueue.enqueue(capture.captureId);
    return capture.captureId;
  }

  async function analyzeOneCapture(captureId) {
    setCaptureStatus(session, captureId, 'analyzing');
    notify();
    const blob = captureBlobs.get(captureId);
    const capture = session.captures.find((c) => c.captureId === captureId);
    if (!blob || !capture) return;
    try {
      const result = visionBackend === 'demo' ? await analyzeDemoCapture(capture.stepId) : await requestScan(blob, capture.stepId, visionBackend);
      lastProvider = result.provider;
      setCaptureResult(session, captureId, result);
    } catch (error) {
      setCaptureFailed(session, captureId, error.message || 'Vision service unavailable — check backend credentials.');
    }
    notify();
  }

  /** Removes a capture (and its now-orphaned exclusions/overrides) from the session — e.g. a filmstrip delete/retake. */
  function deleteCapture(captureId) {
    removeCapture(session, captureId);
    captureBlobs.delete(captureId);
    notify();
  }

  /** Check/uncheck a fixture's "occupied / unusable right now" state, toggling whether it counts toward net capacity. */
  function toggleFixture(fixtureId) {
    toggleExclusion(session, fixtureId);
    notify();
  }

  /** Overrides a fixture's volume (ft3), e.g. a rep correcting a bbox-scaled estimate. Marks the fixture's volumeSource as 'manual'. */
  function setVolumeOverride(fixtureId, ft3) {
    setOverride(session, fixtureId, { estimatedVolumeFt3: Number(ft3) || 0 });
    notify();
  }

  /** Reclassifies a fixture's capacity type ('refrigerated_storage'|'frozen_storage'|'dry_storage') — e.g. a rep correcting a misclassified cabinet. */
  function setCapacityTypeOverride(fixtureId, capacityType) {
    setOverride(session, fixtureId, { capacityType });
    notify();
  }

  /**
   * Overrides a fixture's current fill level as a 0-1 fraction (not 0-100) —
   * only meaningful for interior-shot fixtures (ones with `interiorVolumeFt3`
   * set). Also recomputes and stores `estimatedVolumeFt3` on the same
   * override, since computeCapacity() only ever reads that field, never
   * `percentFull` directly — this is the one place that formula
   * (interiorVolumeFt3 * (1 - percentFull), see docs/CAPACITY.md) needs to
   * be applied for an edit to actually affect capacity totals.
   */
  function setPercentFull(fixtureId, pct) {
    const clamped = Math.min(1, Math.max(0, Number(pct) || 0));
    const detection = allDetections(session).find((d) => d.id === fixtureId);
    const interiorVolumeFt3 = detection?.interiorVolumeFt3 ?? 0;
    setOverride(session, fixtureId, { percentFull: clamped, estimatedVolumeFt3: round1(interiorVolumeFt3 * (1 - clamped)) });
    notify();
  }

  /** A rep's manual box-count figure, overriding `boxes.computedBoxes` in getState()/getResult(). Pass `count: null` to clear it back to the computed estimate. */
  function setBoxOverride(count, note = null) {
    boxOverride = { count: count === null ? null : Number(count) || 0, note };
    notify();
  }

  /** Fixture the vision backend missed. `category` is one of 'refrigerator'|'freezer'|'cabinet'|'shelving'|'pantry' (falls back to dry_storage defaults for anything else). capacityType/estimatedVolumeFt3/freezerCompartmentFt3 default from MANUAL_FIXTURE_DEFAULTS if omitted. */
  function addManualFixture({ category, capacityType, estimatedVolumeFt3, freezerCompartmentFt3 } = {}) {
    const defaults = MANUAL_FIXTURE_DEFAULTS[category] || MANUAL_FIXTURE_DEFAULTS.other;
    const detection = createManualDetection({
      category,
      capacityType: capacityType ?? defaults.capacityType,
      estimatedVolumeFt3: estimatedVolumeFt3 ?? defaults.estimatedVolumeFt3,
      freezerCompartmentFt3: freezerCompartmentFt3 ?? defaults.freezerCompartmentFt3 ?? 0,
    });
    let target = session.captures.find((c) => c.status === 'done');
    if (!target) {
      target = addCapture(session, { stepId: 'wide', imageDataUrl: '' });
      setCaptureResult(session, target.captureId, { detections: [], isMock: false, rawDetections: null });
    }
    target.detections.push({ ...detection, captureId: target.captureId, stepId: target.stepId });
    notify();
    return detection.id;
  }

  /** Overrides the wide-shot floor-heuristic's estimated free floor area (ft2). */
  function setFloorArea(areaFt2) {
    const floor = allDetections(session).find((d) => d.category === 'floor');
    if (floor) setOverride(session, floor.id, { estimatedAreaFt2: Number(areaFt2) || 0 });
    notify();
  }

  /** How much floor area is already reserved/occupied (ft2) — excluded from floor_staging net capacity. */
  function setFloorExcluded(areaFt2) {
    setFloorExclusionFt2(session, Number(areaFt2) || 0);
    notify();
  }

  /** Sets the agency/facility id after construction — most host UIs will pass `agencyId` up front in createScanEngine() and never need this; it exists for flows (like the reference UI) that collect it mid-session. */
  function setAgencyId(id) {
    session.facilityId = id;
    notify();
  }

  function getState() {
    return snapshot();
  }

  /** @param {(state: ScanEngineState) => void} listener @returns {() => void} unsubscribe */
  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * The handoff object — see docs/INTEGRATION.md for field-by-field docs.
   * This is the one thing Analyze/Allocate need to consume; everything else
   * in this file exists to produce it.
   */
  function getResult() {
    const capacity = sessionCapacity(session);
    return {
      scanId: session.sessionId,
      agencyId: session.facilityId,
      timestamp: new Date().toISOString(),
      capacity: {
        dryFt3: { gross: capacity.dry_storage.gross, net: capacity.dry_storage.net },
        refrigeratedFt3: { gross: capacity.refrigerated_storage.gross, net: capacity.refrigerated_storage.net },
        frozenFt3: { gross: capacity.frozen_storage.gross, net: capacity.frozen_storage.net },
      },
      boxCapacity: computeBoxCapacity(capacity, boxOverride),
      captures: session.captures.map((capture) => ({ captureId: capture.captureId, stepId: capture.stepId, fixtures: capture.detections })),
      source: isSessionMock(session) ? 'demo' : lastProvider || visionBackend || 'gemini',
      verifiedBy: 'agency_rep',
    };
  }

  return {
    submitCapture,
    toggleFixture,
    setVolumeOverride,
    setCapacityTypeOverride,
    setPercentFull,
    setBoxOverride,
    getState,
    subscribe,
    getResult,
    // Extensions beyond the core 7-method contract — needed by the reference UI, optional for a host UI.
    deleteCapture,
    addManualFixture,
    setFloorArea,
    setFloorExcluded,
    setAgencyId,
  };
}

export { CAPTURE_STEPS };
