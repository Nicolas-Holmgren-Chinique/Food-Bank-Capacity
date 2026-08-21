import { computeCapacity } from './vision/capacityEngine.js';
import { stepById } from './captureSteps.js';

let captureIdCounter = 0;
function nextCaptureId() {
  captureIdCounter += 1;
  return `capture-${Date.now().toString(36)}-${captureIdCounter}`;
}

/**
 * @typedef {Object} Capture
 * @property {string} captureId
 * @property {string} stepId
 * @property {string} imageDataUrl
 * @property {'queued'|'analyzing'|'done'|'failed'} status
 * @property {import('../vision/adapter.js').Detection[]} detections
 * @property {string|null} errorMessage
 * @property {boolean} isMock
 * @property {unknown} rawDetections
 *
 * @typedef {Object} ScanSession
 * @property {string} sessionId
 * @property {Capture[]} captures
 * @property {{fixtureIds: string[], floorZones: {areaFt2: number}[]}} exclusions - spans the whole session; detection ids are unique across captures
 * @property {Record<string, object>} overrides - keyed by detection id, spans the whole session
 * @property {string} facilityId
 */

/** @returns {ScanSession} */
export function createSession() {
  return {
    sessionId: `session-${Date.now().toString(36)}`,
    captures: [],
    exclusions: { fixtureIds: [], floorZones: [] },
    overrides: {},
    facilityId: '',
  };
}

/** @returns {Capture} */
export function addCapture(session, { stepId, imageDataUrl }) {
  const capture = {
    captureId: nextCaptureId(),
    stepId,
    imageDataUrl,
    status: 'queued',
    detections: [],
    errorMessage: null,
    isMock: false,
    rawDetections: null,
  };
  session.captures.push(capture);
  return capture;
}

export function removeCapture(session, captureId) {
  session.captures = session.captures.filter((capture) => capture.captureId !== captureId);
  // Drop any exclusions/overrides that pointed at detections from the removed capture — they're gone.
  const stillPresentIds = new Set(allDetections(session).map((d) => d.id));
  session.exclusions = { ...session.exclusions, fixtureIds: session.exclusions.fixtureIds.filter((id) => stillPresentIds.has(id)) };
  session.overrides = Object.fromEntries(Object.entries(session.overrides).filter(([id]) => stillPresentIds.has(id)));
}

export function setCaptureStatus(session, captureId, status) {
  const capture = session.captures.find((c) => c.captureId === captureId);
  if (capture) capture.status = status;
}

/**
 * Records analysis results for one capture. Stamps every detection with
 * captureId/stepId, and — per the aggregation rule in docs/CAPACITY.md —
 * defaults detections from a step marked `excludeFromTotalsByDefault`
 * (currently just the wide room shot) into `session.exclusions.fixtureIds`,
 * since close-up captures are the source of truth for volume and we
 * deliberately do not attempt cross-photo deduplication.
 *
 * Deliberately does NOT set `detection.excluded` directly — capacityEngine
 * treats that as a sticky, unremovable exclusion (OR'd with the toggleable
 * `exclusions.fixtureIds` set), so a default-excluded wide-shot fixture
 * must go through the same toggleable set as a user-excluded one, or the
 * user could never re-include it.
 */
export function setCaptureResult(session, captureId, { detections, isMock, rawDetections }) {
  const capture = session.captures.find((c) => c.captureId === captureId);
  if (!capture) return;
  const step = stepById(capture.stepId);

  capture.detections = detections.map((detection) => ({ ...detection, captureId, stepId: capture.stepId }));
  capture.status = 'done';
  capture.isMock = isMock;
  capture.rawDetections = rawDetections;
  capture.errorMessage = null;

  if (step?.excludeFromTotalsByDefault) {
    const defaultExcludedIds = capture.detections.filter((d) => d.category !== 'floor').map((d) => d.id);
    const set = new Set([...session.exclusions.fixtureIds, ...defaultExcludedIds]);
    session.exclusions = { ...session.exclusions, fixtureIds: [...set] };
  }
}

export function setCaptureFailed(session, captureId, errorMessage) {
  const capture = session.captures.find((c) => c.captureId === captureId);
  if (capture) {
    capture.status = 'failed';
    capture.errorMessage = errorMessage;
  }
}

export function allDetections(session) {
  return session.captures.flatMap((capture) => capture.detections);
}

/** Net capacity across every capture in the session — same engine as the single-shot flow, just fed a flattened, multi-capture detection list. */
export function sessionCapacity(session) {
  return computeCapacity(allDetections(session), session.exclusions, session.overrides);
}

export function isSessionMock(session) {
  return session.captures.some((capture) => capture.isMock);
}

export function hasPendingWork(session) {
  return session.captures.some((capture) => capture.status === 'queued' || capture.status === 'analyzing');
}

export function toggleExclusion(session, detectionId) {
  const set = new Set(session.exclusions.fixtureIds);
  if (set.has(detectionId)) set.delete(detectionId);
  else set.add(detectionId);
  session.exclusions = { ...session.exclusions, fixtureIds: [...set] };
}

export function setFloorExclusionFt2(session, areaFt2) {
  const zone = areaFt2 > 0 ? [{ areaFt2 }] : [];
  session.exclusions = { ...session.exclusions, floorZones: zone };
}

export function setOverride(session, detectionId, patch) {
  session.overrides = {
    ...session.overrides,
    [detectionId]: { ...session.overrides[detectionId], ...patch },
  };
}
