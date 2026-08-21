import { describe, expect, it } from 'vitest';
import { BOX_VOLUME_FT3, computeBoxCapacity } from './boxCapacity.js';

function capacity({ dryNet = 0, dryExcluded = 0, refrigeratedNet = 0, refrigeratedExcluded = 0, frozenNet = 0, frozenExcluded = 0 } = {}) {
  return {
    dry_storage: { gross: dryNet + dryExcluded, excluded: dryExcluded, net: dryNet, unit: 'ft3' },
    refrigerated_storage: { gross: refrigeratedNet + refrigeratedExcluded, excluded: refrigeratedExcluded, net: refrigeratedNet, unit: 'ft3' },
    frozen_storage: { gross: frozenNet + frozenExcluded, excluded: frozenExcluded, net: frozenNet, unit: 'ft3' },
  };
}

describe('computeBoxCapacity', () => {
  it('sums net ft3 across all three storage types and floors by BOX_VOLUME_FT3', () => {
    const result = computeBoxCapacity(capacity({ dryNet: 6, refrigeratedNet: 3, frozenNet: 1.5 }));
    expect(result.computedBoxes).toBe(Math.floor(10.5 / BOX_VOLUME_FT3));
  });

  it('excludes floor_staging entirely from the box count', () => {
    const cap = capacity({ dryNet: 3 });
    cap.floor_staging = { gross: 500, excluded: 0, net: 500, unit: 'ft2', palletSlots: 5 };
    const result = computeBoxCapacity(cap);
    expect(result.computedBoxes).toBe(Math.floor(3 / BOX_VOLUME_FT3));
  });

  it('defaults overrideBoxes to null when no override is given', () => {
    const result = computeBoxCapacity(capacity({ dryNet: 6 }));
    expect(result.overrideBoxes).toBeNull();
  });

  it('reports overrideBoxes when a count is provided', () => {
    const result = computeBoxCapacity(capacity({ dryNet: 6 }), { count: 40, note: 'rep recount' });
    expect(result.overrideBoxes).toBe(40);
  });

  it('treats a null override count as "no override" even when explicitly passed', () => {
    const result = computeBoxCapacity(capacity({ dryNet: 6 }), { count: null, note: 'cleared' });
    expect(result.overrideBoxes).toBeNull();
  });

  it('picks the storage type with the least net capacity as bindingConstraint', () => {
    const result = computeBoxCapacity(capacity({ dryNet: 10, refrigeratedNet: 2, frozenNet: 5 }));
    expect(result.bindingConstraint).toBe('refrigerated');
  });

  it('reports deadSpace as the excluded ft3 per type, independent of net', () => {
    const result = computeBoxCapacity(capacity({ dryNet: 6, dryExcluded: 2, refrigeratedNet: 3, refrigeratedExcluded: 1, frozenNet: 1, frozenExcluded: 0 }));
    expect(result.deadSpace).toEqual({ dry: 2, refrigerated: 1, frozen: 0 });
  });

  it('handles an all-empty capacity without throwing', () => {
    const result = computeBoxCapacity(capacity());
    expect(result).toEqual({
      computedBoxes: 0,
      overrideBoxes: null,
      bindingConstraint: 'dry',
      deadSpace: { dry: 0, refrigerated: 0, frozen: 0 },
    });
  });
});
