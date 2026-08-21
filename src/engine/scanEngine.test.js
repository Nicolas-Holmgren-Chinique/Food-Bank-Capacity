import { describe, expect, it } from 'vitest';
import { createScanEngine } from './scanEngine.js';

// Uses visionBackend: 'demo' throughout — resolves from bundled fixture JSON with no
// network/server dependency, so these tests exercise the real submitCapture -> analysis ->
// state pipeline (not a hand-rolled session fixture) while staying fully offline.

function fakeImageBlob() {
  return new Blob(['fake-image-bytes'], { type: 'image/jpeg' });
}

/** Resolves once the engine has no in-flight analysis — avoids racing the async analysis queue. */
function waitForIdle(engine) {
  return new Promise((resolve) => {
    if (!engine.getState().hasPendingWork) return resolve();
    const unsubscribe = engine.subscribe((state) => {
      if (!state.hasPendingWork) {
        unsubscribe();
        resolve();
      }
    });
  });
}

describe('createScanEngine (demo backend)', () => {
  it('starts with the given agencyId and an empty session', () => {
    const engine = createScanEngine({ visionBackend: 'demo', agencyId: 'agency-1' });
    const state = engine.getState();
    expect(state.agencyId).toBe('agency-1');
    expect(state.captures).toEqual([]);
    expect(state.fixtures).toEqual([]);
    expect(state.hasPendingWork).toBe(false);
  });

  it('submitCapture resolves with a captureId, then streams analysis in via subscribe', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    const captureId = await engine.submitCapture(fakeImageBlob(), 'wide');
    expect(typeof captureId).toBe('string');
    expect(engine.getState().captures).toHaveLength(1);

    await waitForIdle(engine);

    const state = engine.getState();
    expect(state.captures[0].status).toBe('done');
    expect(state.captures[0].isMock).toBe(true);
    expect(state.fixtures.length).toBeGreaterThan(0);
    expect(state.isMock).toBe(true);
    expect(state.provider).toBe('demo');
  });

  it('rejects an unknown stepId without mutating state', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    await expect(engine.submitCapture(fakeImageBlob(), 'not_a_real_step')).rejects.toThrow(/Unknown capture step/);
    expect(engine.getState().captures).toEqual([]);
  });

  it('wide-shot fixtures start excluded from net capacity but count toward gross', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    await engine.submitCapture(fakeImageBlob(), 'wide');
    await waitForIdle(engine);

    const { capacity } = engine.getState();
    expect(capacity.dry_storage.gross).toBeGreaterThan(0);
    expect(capacity.dry_storage.net).toBe(0); // wide-shot cabinets/shelving default-excluded
  });

  it('toggleFixture re-includes a default-excluded wide-shot fixture in net capacity', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    await engine.submitCapture(fakeImageBlob(), 'wide');
    await waitForIdle(engine);

    const fridge = engine.getState().fixtures.find((f) => f.category === 'refrigerator');
    expect(engine.getState().capacity.refrigerated_storage.net).toBe(0);

    engine.toggleFixture(fridge.id);
    expect(engine.getState().capacity.refrigerated_storage.net).toBeGreaterThan(0);
  });

  it('setVolumeOverride replaces a fixture volume and marks it manual', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    await engine.submitCapture(fakeImageBlob(), 'wide');
    await waitForIdle(engine);
    const fridge = engine.getState().fixtures.find((f) => f.category === 'refrigerator');

    engine.setVolumeOverride(fridge.id, 99);
    expect(engine.getState().overrides[fridge.id]).toEqual({ estimatedVolumeFt3: 99 });
  });

  it('setPercentFull recomputes an interior fixture\'s net volume live', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    await engine.submitCapture(fakeImageBlob(), 'fridge_interior');
    await waitForIdle(engine);

    const fixture = engine.getState().fixtures[0];
    expect(fixture.interiorVolumeFt3).toBe(18);
    expect(fixture.estimatedVolumeFt3).toBeCloseTo(18 * (1 - 0.45), 5); // fixture default: 45% full

    engine.setPercentFull(fixture.id, 0); // now empty -> full interior volume usable
    const result = engine.getResult();
    expect(result.capacity.refrigeratedFt3.net).toBeCloseTo(18, 5);
  });

  it('setBoxOverride overrides boxes.overrideBoxes and getResult().boxCapacity.overrideBoxes; null clears it', () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    engine.setBoxOverride(25, 'rep recount');
    expect(engine.getState().boxes.overrideBoxes).toBe(25);
    expect(engine.getResult().boxCapacity.overrideBoxes).toBe(25);

    engine.setBoxOverride(null);
    expect(engine.getState().boxes.overrideBoxes).toBeNull();
  });

  it('deleteCapture removes the capture and its detections from state', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    const captureId = await engine.submitCapture(fakeImageBlob(), 'wide');
    await waitForIdle(engine);
    expect(engine.getState().fixtures.length).toBeGreaterThan(0);

    engine.deleteCapture(captureId);
    expect(engine.getState().captures).toEqual([]);
    expect(engine.getState().fixtures).toEqual([]);
  });

  it('addManualFixture works with no prior captures and applies category defaults', () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    const id = engine.addManualFixture({ category: 'cabinet' });
    const fixture = engine.getState().fixtures.find((f) => f.id === id);
    expect(fixture.capacityType).toBe('dry_storage');
    expect(fixture.estimatedVolumeFt3).toBe(6);
    expect(fixture.source).toBe('manual');
  });

  it('setAgencyId updates state and getResult() immediately', () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    engine.setAgencyId('agency-42');
    expect(engine.getState().agencyId).toBe('agency-42');
    expect(engine.getResult().agencyId).toBe('agency-42');
  });

  it('getResult() matches the documented handoff shape and marks demo scans as source: "demo"', async () => {
    const engine = createScanEngine({ visionBackend: 'demo', agencyId: 'agency-9' });
    await engine.submitCapture(fakeImageBlob(), 'wide');
    await waitForIdle(engine);

    const result = engine.getResult();
    expect(Object.keys(result).sort()).toEqual(['agencyId', 'boxCapacity', 'capacity', 'captures', 'scanId', 'source', 'timestamp', 'verifiedBy'].sort());
    expect(Object.keys(result.capacity).sort()).toEqual(['dryFt3', 'frozenFt3', 'refrigeratedFt3'].sort());
    expect(result.capacity.dryFt3).toEqual(expect.objectContaining({ gross: expect.any(Number), net: expect.any(Number) }));
    expect(result.source).toBe('demo');
    expect(result.verifiedBy).toBe('agency_rep');
    expect(result.captures).toHaveLength(1);
    expect(result.captures[0]).toEqual(expect.objectContaining({ captureId: expect.any(String), stepId: 'wide', fixtures: expect.any(Array) }));
  });

  it('subscribe returns an unsubscribe function that stops further notifications', async () => {
    const engine = createScanEngine({ visionBackend: 'demo' });
    let calls = 0;
    const unsubscribe = engine.subscribe(() => {
      calls += 1;
    });
    engine.setAgencyId('a');
    unsubscribe();
    engine.setAgencyId('b');
    expect(calls).toBe(1);
  });
});
