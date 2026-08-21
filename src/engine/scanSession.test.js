import { describe, expect, it } from 'vitest';
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
  setOverride,
  toggleExclusion,
} from './scanSession.js';

function fridgeDetection(overrides = {}) {
  return {
    id: `det-${Math.random()}`,
    rawClass: 'refrigerator',
    category: 'refrigerator',
    capacityType: 'refrigerated_storage',
    confidence: 0.9,
    bbox: { x: 0, y: 0, width: 0.2, height: 0.5 },
    estimatedVolumeFt3: 20,
    freezerCompartmentFt3: 6,
    excluded: false,
    source: 'detected',
    volumeSource: 'bbox_scaled',
    ...overrides,
  };
}

describe('acceptance: 1 wide + 3 close-up captures -> aggregated capacity from close-ups only', () => {
  it('excludes wide-shot fixtures from net capacity by default while keeping them visible in the session', () => {
    const session = createSession();

    const wide = addCapture(session, { stepId: 'wide', imageDataUrl: 'data:wide' });
    setCaptureResult(session, wide.captureId, { detections: [fridgeDetection({ id: 'wide-fridge' })], isMock: false, rawDetections: {} });

    const fridgeInterior = addCapture(session, { stepId: 'fridge_interior', imageDataUrl: 'data:fridge' });
    setCaptureResult(session, fridgeInterior.captureId, {
      detections: [fridgeDetection({ id: 'closeup-fridge', estimatedVolumeFt3: 11, freezerCompartmentFt3: 0, volumeSource: 'gemini_interior' })],
      isMock: false,
      rawDetections: {},
    });

    const cabinet1 = addCapture(session, { stepId: 'cabinet_interior', imageDataUrl: 'data:cab1' });
    setCaptureResult(session, cabinet1.captureId, {
      detections: [fridgeDetection({ id: 'cab1', category: 'cabinet', capacityType: 'dry_storage', estimatedVolumeFt3: 4, freezerCompartmentFt3: 0 })],
      isMock: false,
      rawDetections: {},
    });

    const cabinet2 = addCapture(session, { stepId: 'cabinet_interior', imageDataUrl: 'data:cab2' });
    setCaptureResult(session, cabinet2.captureId, {
      detections: [fridgeDetection({ id: 'cab2', category: 'cabinet', capacityType: 'dry_storage', estimatedVolumeFt3: 5, freezerCompartmentFt3: 0 })],
      isMock: false,
      rawDetections: {},
    });

    // All 4 captures' detections are visible for context...
    expect(allDetections(session)).toHaveLength(4);
    const wideFridge = allDetections(session).find((d) => d.id === 'wide-fridge');
    // exclusion lives in the toggleable exclusions set, not baked into the detection itself,
    // so the user can later re-include it via the same mechanism as any manual exclusion
    expect(session.exclusions.fixtureIds).toContain('wide-fridge');
    expect(wideFridge.excluded).toBe(false);
    expect(wideFridge.stepId).toBe('wide');
    expect(wideFridge.captureId).toBe(wide.captureId);

    // ...and net capacity reflects ONLY the close-up captures, not the wide shot's duplicate fridge.
    const capacity = sessionCapacity(session);
    expect(capacity.refrigerated_storage.net).toBe(11); // close-up fridge only, not 20 (wide) + 11
    expect(capacity.dry_storage.net).toBe(9); // 4 + 5 from the two cabinets

    // gross ("known") capacity does include the wide shot's contribution — this is intentional
    // (we don't attempt cross-photo dedup), not a bug: gross = 20 (wide) + 11 (close-up) = 31.
    expect(capacity.refrigerated_storage.gross).toBe(31);
  });

  it('does NOT default-exclude the wide shot\'s floor estimate, since there is no dedicated close-up step for floor space', () => {
    const session = createSession();
    const wide = addCapture(session, { stepId: 'wide', imageDataUrl: 'data:wide' });
    setCaptureResult(session, wide.captureId, {
      detections: [
        fridgeDetection({ id: 'wide-fridge' }),
        { id: 'wide-floor', category: 'floor', capacityType: 'floor_staging', estimatedAreaFt2: 80, excluded: false, source: 'detected', volumeSource: 'floor_heuristic', bbox: { x: 0, y: 0.6, width: 1, height: 0.4 }, confidence: null },
      ],
      isMock: false,
      rawDetections: {},
    });
    expect(session.exclusions.fixtureIds).toContain('wide-fridge');
    expect(session.exclusions.fixtureIds).not.toContain('wide-floor');
    expect(sessionCapacity(session).floor_staging.net).toBe(80);
  });

  it('a user can re-include a wide-shot fixture by toggling its exclusion off', () => {
    const session = createSession();
    const wide = addCapture(session, { stepId: 'wide', imageDataUrl: 'data:wide' });
    setCaptureResult(session, wide.captureId, { detections: [fridgeDetection({ id: 'wide-fridge' })], isMock: false, rawDetections: {} });

    expect(sessionCapacity(session).refrigerated_storage.net).toBe(0);
    toggleExclusion(session, 'wide-fridge');
    expect(sessionCapacity(session).refrigerated_storage.net).toBe(20);
  });
});

describe('ScanSession capture lifecycle', () => {
  it('tracks capture status through queued -> analyzing -> done', () => {
    const session = createSession();
    const capture = addCapture(session, { stepId: 'fridge_interior', imageDataUrl: 'data:x' });
    expect(capture.status).toBe('queued');
    setCaptureStatus(session, capture.captureId, 'analyzing');
    expect(session.captures[0].status).toBe('analyzing');
    setCaptureResult(session, capture.captureId, { detections: [], isMock: false, rawDetections: {} });
    expect(session.captures[0].status).toBe('done');
  });

  it('records a failed capture with its error message without touching other captures', () => {
    const session = createSession();
    const a = addCapture(session, { stepId: 'fridge_interior', imageDataUrl: 'data:a' });
    const b = addCapture(session, { stepId: 'freezer_interior', imageDataUrl: 'data:b' });
    setCaptureResult(session, a.captureId, { detections: [], isMock: false, rawDetections: {} });
    setCaptureFailed(session, b.captureId, 'Vision service unavailable');
    expect(session.captures.find((c) => c.captureId === b.captureId)).toMatchObject({ status: 'failed', errorMessage: 'Vision service unavailable' });
    expect(session.captures.find((c) => c.captureId === a.captureId).status).toBe('done');
  });

  it('hasPendingWork is true while any capture is queued/analyzing and false once all settle', () => {
    const session = createSession();
    const a = addCapture(session, { stepId: 'fridge_interior', imageDataUrl: 'data:a' });
    expect(hasPendingWork(session)).toBe(true);
    setCaptureResult(session, a.captureId, { detections: [], isMock: false, rawDetections: {} });
    expect(hasPendingWork(session)).toBe(false);
  });

  it('removeCapture drops its detections and any exclusions/overrides that pointed at them', () => {
    const session = createSession();
    const capture = addCapture(session, { stepId: 'cabinet_interior', imageDataUrl: 'data:x' });
    setCaptureResult(session, capture.captureId, { detections: [fridgeDetection({ id: 'to-remove' })], isMock: false, rawDetections: {} });
    toggleExclusion(session, 'to-remove');
    setOverride(session, 'to-remove', { estimatedVolumeFt3: 99 });

    removeCapture(session, capture.captureId);

    expect(allDetections(session)).toHaveLength(0);
    expect(session.exclusions.fixtureIds).not.toContain('to-remove');
    expect(session.overrides['to-remove']).toBeUndefined();
  });

  it('isSessionMock is true if any capture came from mock data', () => {
    const session = createSession();
    const a = addCapture(session, { stepId: 'fridge_interior', imageDataUrl: 'data:a' });
    const b = addCapture(session, { stepId: 'freezer_interior', imageDataUrl: 'data:b' });
    setCaptureResult(session, a.captureId, { detections: [], isMock: false, rawDetections: {} });
    setCaptureResult(session, b.captureId, { detections: [], isMock: true, rawDetections: {} });
    expect(isSessionMock(session)).toBe(true);
  });
});
