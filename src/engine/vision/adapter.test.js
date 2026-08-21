import { describe, expect, it } from 'vitest';
import { normalizeDetections } from './adapter.js';

const prediction = {
  source_width: 1000,
  source_height: 1000,
  objects: [
    // height 550/1000 = 0.55 matches refrigerator's baselineHeightFraction exactly -> scale 1, volume == baseline
    { classLabel: 'refrigerator', confidence: 0.9, x: 0, y: 0, width: 200, height: 550 },
    { classLabel: 'Chest Freezer', confidence: 0.8, x: 200, y: 0, width: 200, height: 200 },
    { classLabel: 'unknown widget', confidence: 0.4, x: 400, y: 0, width: 100, height: 100 },
  ],
};

describe('normalizeDetections', () => {
  it('maps known class labels to category/capacityType/defaultVolume via fixtureClasses.js', () => {
    const detections = normalizeDetections(prediction);
    const fridge = detections.find((d) => d.rawClass === 'refrigerator');
    expect(fridge.category).toBe('refrigerator');
    expect(fridge.capacityType).toBe('refrigerated_storage');
    expect(fridge.estimatedVolumeFt3).toBe(20);
    expect(fridge.freezerCompartmentFt3).toBe(6);
    expect(fridge.volumeSource).toBe('bbox_scaled');
  });

  it('normalizes class label matching case-insensitively', () => {
    const detections = normalizeDetections(prediction);
    const freezer = detections.find((d) => d.rawClass === 'Chest Freezer');
    expect(freezer.category).toBe('freezer');
    expect(freezer.capacityType).toBe('frozen_storage');
  });

  it('falls back to category "other" with no capacityType for unrecognized classes', () => {
    const detections = normalizeDetections(prediction);
    const other = detections.find((d) => d.rawClass === 'unknown widget');
    expect(other.category).toBe('other');
    expect(other.capacityType).toBeNull();
  });

  it('normalizes pixel bboxes into 0-1 coordinates using source_width/source_height', () => {
    const detections = normalizeDetections(prediction);
    const fridge = detections.find((d) => d.rawClass === 'refrigerator');
    expect(fridge.bbox).toEqual({ x: 0, y: 0, width: 0.2, height: 0.55 });
  });

  it('appends exactly one synthetic floor detection', () => {
    const detections = normalizeDetections(prediction);
    const floors = detections.filter((d) => d.category === 'floor');
    expect(floors).toHaveLength(1);
    expect(floors[0].capacityType).toBe('floor_staging');
    expect(floors[0].estimatedAreaFt2).toBeGreaterThan(0);
  });

  it('reduces estimated floor area when fixtures occupy the bottom band', () => {
    const emptyRoom = normalizeDetections({ source_width: 1000, source_height: 1000, objects: [] });
    const crowded = normalizeDetections({
      source_width: 1000,
      source_height: 1000,
      objects: [{ classLabel: 'shelving unit', confidence: 0.9, x: 0, y: 800, width: 1000, height: 200 }],
    });
    const emptyFloor = emptyRoom.find((d) => d.category === 'floor');
    const crowdedFloor = crowded.find((d) => d.category === 'floor');
    expect(crowdedFloor.estimatedAreaFt2).toBeLessThan(emptyFloor.estimatedAreaFt2);
  });

  it('assigns every detection a unique id', () => {
    const detections = normalizeDetections(prediction);
    const ids = new Set(detections.map((d) => d.id));
    expect(ids.size).toBe(detections.length);
  });

  describe('bbox-scaled volume (Detection.estimatedVolumeFt3 is not a constant per class)', () => {
    function fridgeAtHeight(heightPx) {
      const [detection] = normalizeDetections({
        source_width: 1000,
        source_height: 1000,
        objects: [{ classLabel: 'refrigerator', confidence: 0.9, x: 0, y: 0, width: 300, height: heightPx }],
      });
      return detection;
    }

    it('reports a larger volume for a fridge that fills more of the frame', () => {
      const small = fridgeAtHeight(150); // 15% of frame height
      const large = fridgeAtHeight(700); // 70% of frame height
      expect(large.estimatedVolumeFt3).toBeGreaterThan(small.estimatedVolumeFt3);
      expect(large.freezerCompartmentFt3).toBeGreaterThan(small.freezerCompartmentFt3);
    });

    it('is deterministic: the same bbox always produces the same volume', () => {
      expect(fridgeAtHeight(400).estimatedVolumeFt3).toBe(fridgeAtHeight(400).estimatedVolumeFt3);
    });

    it('clamps the scale factor so a barely-visible or frame-filling detection stays in a sane range', () => {
      const tiny = fridgeAtHeight(1); // effectively 0% of frame height
      const huge = fridgeAtHeight(1000); // fills the entire frame
      expect(tiny.estimatedVolumeFt3).toBeGreaterThan(0);
      expect(huge.estimatedVolumeFt3).toBeLessThan(20 * 3); // bounded, not unbounded growth
    });

    it('two different photos of different-sized fixtures produce different fixture volumes', () => {
      const roomA = normalizeDetections({ source_width: 1000, source_height: 1000, objects: [{ classLabel: 'refrigerator', confidence: 0.9, x: 0, y: 0, width: 300, height: 300 }] });
      const roomB = normalizeDetections({ source_width: 1000, source_height: 1000, objects: [{ classLabel: 'refrigerator', confidence: 0.9, x: 0, y: 0, width: 300, height: 600 }] });
      const fridgeA = roomA.find((d) => d.category === 'refrigerator');
      const fridgeB = roomB.find((d) => d.category === 'refrigerator');
      expect(fridgeA.estimatedVolumeFt3).not.toBe(fridgeB.estimatedVolumeFt3);
    });
  });

  it('a photo with no refrigerator produces no refrigerator-category detection', () => {
    const detections = normalizeDetections({
      source_width: 1000,
      source_height: 1000,
      objects: [{ classLabel: 'shelving unit', confidence: 0.9, x: 0, y: 0, width: 400, height: 500 }],
    });
    expect(detections.some((d) => d.category === 'refrigerator')).toBe(false);
  });
});
