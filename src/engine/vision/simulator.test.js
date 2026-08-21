import { describe, expect, it } from 'vitest';
import { computeCapacity } from './capacityEngine.js';
import { bindingConstraint, maxQuantities, recommendMix, validateLoad } from './simulator.js';

function capacityOf({ cold = 0, frozen = 0, dry = 0, floor = 0 } = {}) {
  return {
    refrigerated_storage: { gross: cold, excluded: 0, net: cold, unit: 'ft3' },
    frozen_storage: { gross: frozen, excluded: 0, net: frozen, unit: 'ft3' },
    dry_storage: { gross: dry, excluded: 0, net: dry, unit: 'ft3' },
    floor_staging: { gross: floor, excluded: 0, net: floor, unit: 'ft2', palletSlots: Math.floor(floor / 13.3) },
    mealPrepCapable: false,
  };
}

describe('validateLoad', () => {
  it('passes when a category load fits within net capacity', () => {
    const capacity = capacityOf({ cold: 10 });
    const result = validateLoad({ cold: [{ foodId: 'milk_crate', units: 4 }] }, capacity); // 4 * 1.5 = 6 ft3
    expect(result.byCategory.cold.fits).toBe(true);
    expect(result.byCategory.cold.remainingFt3).toBeCloseTo(4, 5);
    expect(result.overallFits).toBe(true);
  });

  it('fails and reports overflow when a category load exceeds net capacity', () => {
    const capacity = capacityOf({ cold: 5 });
    const result = validateLoad({ cold: [{ foodId: 'milk_crate', units: 10 }] }, capacity); // 15 ft3 requested
    expect(result.byCategory.cold.fits).toBe(false);
    expect(result.byCategory.cold.overflowFt3).toBeCloseTo(10, 5);
    expect(result.overallFits).toBe(false);
  });

  it('validates floor footprint for pallet-unit items independently of volume', () => {
    const capacity = capacityOf({ dry: 1000, floor: 13.3 });
    const result = validateLoad({ dry: [{ foodId: 'dry_pallet', units: 2 }] }, capacity); // 2 pallets need 26.6 ft2 floor
    expect(result.byCategory.dry.fits).toBe(true); // plenty of volume
    expect(result.byCategory.floor.fits).toBe(false); // not enough floor
    expect(result.overallFits).toBe(false);
  });
});

describe('maxQuantities', () => {
  it('computes independent max units per catalog item from net capacity', () => {
    const capacity = capacityOf({ cold: 3 }); // milk_crate volumePerUnit 1.5
    const { maxUnits } = maxQuantities(capacity);
    expect(maxUnits.milk_crate).toBe(2);
  });

  it('caps pallet-unit items by both volume and floor footprint, whichever is tighter', () => {
    const capacity = capacityOf({ dry: 1000, floor: 13.3 }); // only 1 pallet slot of floor
    const { maxUnits } = maxQuantities(capacity);
    expect(maxUnits.dry_pallet).toBe(1);
  });

  it('returns zero total meals-equivalent when there is no capacity at all', () => {
    const capacity = capacityOf();
    const { totalMealsEquivalent } = maxQuantities(capacity);
    expect(totalMealsEquivalent).toBe(0);
  });
});

describe('end-to-end: excluding a fixture drops food-fit numbers, not just capacity totals', () => {
  it('maxQuantities and totalMealsEquivalent fall when a fixture is marked occupied via computeCapacity', () => {
    const fridge = {
      id: 'fixture-1',
      category: 'refrigerator',
      capacityType: 'refrigerated_storage',
      estimatedVolumeFt3: 20,
      freezerCompartmentFt3: 6,
      excluded: false,
      source: 'detected',
    };

    const included = computeCapacity([fridge], {}, {});
    const excluded = computeCapacity([fridge], { fixtureIds: ['fixture-1'] }, {});

    const withFridge = maxQuantities(included);
    const withoutFridge = maxQuantities(excluded);

    expect(withFridge.maxUnits.milk_crate).toBeGreaterThan(0);
    expect(withoutFridge.maxUnits.milk_crate).toBe(0);
    expect(withFridge.totalMealsEquivalent).toBeGreaterThan(withoutFridge.totalMealsEquivalent);

    // gross ("known") capacity is unaffected by exclusion — only net ("available now") is
    expect(included.refrigerated_storage.gross).toBe(excluded.refrigerated_storage.gross);
    expect(excluded.refrigerated_storage.net).toBe(0);
  });
});

describe('bindingConstraint', () => {
  it('identifies the category supporting the fewest meals as the limiting factor', () => {
    // plenty of cold/dry, very little frozen -> frozen should be the binding constraint
    const capacity = capacityOf({ cold: 200, frozen: 2, dry: 200, floor: 200 });
    const result = bindingConstraint(capacity);
    expect(result.capacityType).toBe('frozen_storage');
  });

  it('changes when the underlying capacity changes (e.g. after excluding a fixture)', () => {
    const before = bindingConstraint(capacityOf({ cold: 5, frozen: 200, dry: 200, floor: 200 }));
    expect(before.capacityType).toBe('refrigerated_storage');
    const after = bindingConstraint(capacityOf({ cold: 200, frozen: 5, dry: 200, floor: 200 }));
    expect(after.capacityType).toBe('frozen_storage');
  });
});

describe('recommendMix', () => {
  it('recommends only positive-unit lines when capacity is available', () => {
    const capacity = capacityOf({ cold: 10, frozen: 10, dry: 10, floor: 50 });
    const mix = recommendMix(capacity);
    expect(mix.length).toBeGreaterThan(0);
    for (const line of mix) {
      expect(line.units).toBeGreaterThan(0);
    }
  });

  it('returns an empty mix when there is no capacity', () => {
    const capacity = capacityOf();
    expect(recommendMix(capacity)).toEqual([]);
  });
});
