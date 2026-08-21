import { describe, expect, it } from 'vitest';
import { stepById } from '../captureSteps.js';
import { normalizeGeminiDetections, normalizeGeminiInteriorDetection, normalizeGeminiWideDetections } from './geminiAdapter.js';

describe('normalizeGeminiInteriorDetection', () => {
  it('a fridge interior shot with percentFull=0.5 contributes exactly half its interior volume', () => {
    const step = stepById('fridge_interior');
    const [detection] = normalizeGeminiInteriorDetection({ class: 'refrigerator', confidence: 0.9, interiorVolumeFt3: 20, percentFull: 0.5 }, step);
    expect(detection.interiorVolumeFt3).toBe(20);
    expect(detection.percentFull).toBe(0.5);
    expect(detection.estimatedVolumeFt3).toBe(10);
    expect(detection.capacityType).toBe('refrigerated_storage');
    expect(detection.volumeSource).toBe('gemini_interior');
  });

  it('a fully empty fixture (percentFull=0) contributes its whole interior volume', () => {
    const step = stepById('freezer_interior');
    const [detection] = normalizeGeminiInteriorDetection({ class: 'freezer', interiorVolumeFt3: 15, percentFull: 0 }, step);
    expect(detection.estimatedVolumeFt3).toBe(15);
  });

  it('a completely full fixture (percentFull=1) contributes zero usable volume', () => {
    const step = stepById('fridge_interior');
    const [detection] = normalizeGeminiInteriorDetection({ class: 'refrigerator', interiorVolumeFt3: 20, percentFull: 1 }, step);
    expect(detection.estimatedVolumeFt3).toBe(0);
  });

  it('clamps an out-of-range percentFull instead of producing a negative or >1x volume', () => {
    const step = stepById('cabinet_interior');
    const overFull = normalizeGeminiInteriorDetection({ class: 'cabinet', interiorVolumeFt3: 6, percentFull: 1.4 }, step)[0];
    const negative = normalizeGeminiInteriorDetection({ class: 'cabinet', interiorVolumeFt3: 6, percentFull: -0.3 }, step)[0];
    expect(overFull.estimatedVolumeFt3).toBe(0);
    expect(negative.estimatedVolumeFt3).toBe(6);
  });

  it('assigns the category/capacityType from the step, not from Gemini\'s free-text class', () => {
    const step = stepById('cabinet_interior');
    const [detection] = normalizeGeminiInteriorDetection({ class: 'pantry cupboard', interiorVolumeFt3: 5, percentFull: 0.2 }, step);
    expect(detection.category).toBe('cabinet');
    expect(detection.capacityType).toBe('dry_storage');
  });

  it('returns an empty array when Gemini reports no interior volume at all', () => {
    expect(normalizeGeminiInteriorDetection({ class: 'refrigerator' }, stepById('fridge_interior'))).toEqual([]);
    expect(normalizeGeminiInteriorDetection(null, stepById('fridge_interior'))).toEqual([]);
  });
});

describe('normalizeGeminiWideDetections', () => {
  const baseFridge = { class: 'refrigerator', confidence: 0.88, bbox: { x: 0.05, y: 0.1, width: 0.2, height: 0.55 } };

  it('maps a known class to category/capacityType and scales volume by bbox height, same as the EyePop adapter', () => {
    const [fridge] = normalizeGeminiWideDetections({ fixtures: [baseFridge] });
    expect(fridge.category).toBe('refrigerator');
    expect(fridge.capacityType).toBe('refrigerated_storage');
    expect(fridge.estimatedVolumeFt3).toBe(20); // bbox.height 0.55 == refrigerator baselineHeightFraction -> scale 1
    expect(fridge.freezerCompartmentFt3).toBe(6);
    expect(fridge.volumeSource).toBe('bbox_scaled');
  });

  it('produces different volumes for the same class at different bbox sizes', () => {
    const small = normalizeGeminiWideDetections({ fixtures: [{ ...baseFridge, bbox: { ...baseFridge.bbox, height: 0.15 } }] })[0];
    const large = normalizeGeminiWideDetections({ fixtures: [{ ...baseFridge, bbox: { ...baseFridge.bbox, height: 0.9 } }] })[0];
    expect(large.estimatedVolumeFt3).toBeGreaterThan(small.estimatedVolumeFt3);
  });

  it('falls back to category "other" for a class Gemini invents that is not in fixtureClasses.js', () => {
    const [other] = normalizeGeminiWideDetections({ fixtures: [{ class: 'ice cream freezer chest thing', confidence: 0.5, bbox: { x: 0, y: 0, width: 0.3, height: 0.3 } }] });
    expect(other.category).toBe('other');
    expect(other.capacityType).toBeNull();
  });

  it('for a missing/malformed fixtures field, returns just the synthetic floor detection rather than throwing', () => {
    expect(normalizeGeminiWideDetections({}).every((d) => d.category === 'floor')).toBe(true);
    expect(normalizeGeminiWideDetections(null).every((d) => d.category === 'floor')).toBe(true);
  });

  it('always appends exactly one synthetic floor detection, same as the EyePop adapter', () => {
    const detections = normalizeGeminiWideDetections({ fixtures: [baseFridge] });
    const floors = detections.filter((d) => d.category === 'floor');
    expect(floors).toHaveLength(1);
    expect(floors[0].capacityType).toBe('floor_staging');
  });
});

describe('normalizeGeminiDetections (dispatch by step.kind)', () => {
  it('routes interior steps through the single-fixture path', () => {
    const detections = normalizeGeminiDetections({ class: 'refrigerator', interiorVolumeFt3: 20, percentFull: 0.25 }, stepById('fridge_interior'));
    expect(detections).toHaveLength(1);
    expect(detections[0].volumeSource).toBe('gemini_interior');
  });

  it('routes wide steps through the fixtures-array path', () => {
    const detections = normalizeGeminiDetections({ fixtures: [{ class: 'shelving unit', confidence: 0.7, bbox: { x: 0, y: 0, width: 0.3, height: 0.5 } }] }, stepById('shelving_floor'));
    expect(detections.find((d) => d.category === 'shelving')).toBeTruthy();
    expect(detections.find((d) => d.category === 'floor')).toBeTruthy();
  });
});
