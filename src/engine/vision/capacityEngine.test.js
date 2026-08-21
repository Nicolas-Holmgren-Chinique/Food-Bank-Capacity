import { describe, expect, it } from 'vitest';
import { computeCapacity } from './capacityEngine.js';

function fixture(overrides = {}) {
  return {
    id: 'fixture-1',
    rawClass: 'refrigerator',
    category: 'refrigerator',
    capacityType: 'refrigerated_storage',
    confidence: 0.9,
    bbox: { x: 0, y: 0, width: 0.2, height: 0.5 },
    estimatedVolumeFt3: 20,
    freezerCompartmentFt3: 6,
    mealPrepFlag: false,
    excluded: false,
    source: 'detected',
    ...overrides,
  };
}

describe('computeCapacity', () => {
  it('sums gross volume by capacity type, including a refrigerator freezer compartment', () => {
    const result = computeCapacity([fixture()]);
    expect(result.refrigerated_storage.gross).toBe(20);
    expect(result.refrigerated_storage.net).toBe(20);
    expect(result.frozen_storage.gross).toBe(6);
    expect(result.frozen_storage.net).toBe(6);
  });

  it('excludes a fixture-level exclusion from net but keeps it in gross (KNOWN vs CURRENTLY AVAILABLE)', () => {
    const result = computeCapacity([fixture()], { fixtureIds: ['fixture-1'] });
    expect(result.refrigerated_storage.gross).toBe(20);
    expect(result.refrigerated_storage.net).toBe(0);
    expect(result.frozen_storage.gross).toBe(6);
    expect(result.frozen_storage.net).toBe(0);
  });

  it('honors a detection excluded flag set directly on the detection', () => {
    const result = computeCapacity([fixture({ excluded: true })]);
    expect(result.dry_storage.net).toBe(0);
    expect(result.refrigerated_storage.net).toBe(0);
  });

  it('applies user overrides for reclassification and volume edits', () => {
    const result = computeCapacity(
      [fixture({ id: 'shelf-1', category: 'shelving', capacityType: 'dry_storage', estimatedVolumeFt3: 12, freezerCompartmentFt3: 0 })],
      {},
      { 'shelf-1': { capacityType: 'dry_storage', estimatedVolumeFt3: 8 } },
    );
    expect(result.dry_storage.gross).toBe(8);
  });

  it('computes floor staging net area, pallet slots, and floor-zone exclusions', () => {
    const floor = {
      id: 'floor-1',
      rawClass: 'floor',
      category: 'floor',
      capacityType: 'floor_staging',
      confidence: null,
      bbox: { x: 0, y: 0.6, width: 1, height: 0.4 },
      estimatedAreaFt2: 100,
      excluded: false,
      source: 'detected',
    };
    const result = computeCapacity([floor], { floorZones: [{ areaFt2: 26.6 }] });
    expect(result.floor_staging.gross).toBe(100);
    expect(result.floor_staging.net).toBe(73.4);
    expect(result.floor_staging.palletSlots).toBe(5); // floor(73.4 / 13.3)
  });

  it('flags meal-prep capability from non-excluded kitchen fixtures without counting them as storage', () => {
    const stove = fixture({ id: 'stove-1', category: 'kitchen_fixture', capacityType: null, mealPrepFlag: true, estimatedVolumeFt3: 0, freezerCompartmentFt3: 0 });
    const result = computeCapacity([stove]);
    expect(result.mealPrepCapable).toBe(true);
    expect(result.dry_storage.gross).toBe(0);
  });

  it('does not flag meal-prep capability when the only stove is excluded', () => {
    const stove = fixture({ id: 'stove-1', category: 'kitchen_fixture', capacityType: null, mealPrepFlag: true, excluded: true, estimatedVolumeFt3: 0, freezerCompartmentFt3: 0 });
    const result = computeCapacity([stove]);
    expect(result.mealPrepCapable).toBe(false);
  });

  it('never returns negative net capacity even if exclusions exceed gross', () => {
    const result = computeCapacity([fixture({ estimatedVolumeFt3: 5, freezerCompartmentFt3: 0 })], { fixtureIds: ['fixture-1'] });
    expect(result.refrigerated_storage.net).toBeGreaterThanOrEqual(0);
  });
});
