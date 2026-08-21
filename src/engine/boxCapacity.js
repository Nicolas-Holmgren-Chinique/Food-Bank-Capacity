/**
 * "Box" capacity — a second, simpler unit alongside raw ft3, for reps who
 * think in terms of standard produce/commodity boxes rather than cubic feet.
 *
 * BOX_VOLUME_FT3 models a standard food-bank "banana box" (~18in x 12in x
 * 9in, a common produce/commodity box size across food-bank networks). This
 * is a labeled estimate, not a measured constant — a host UI showing
 * computedBoxes should make clear it's derived from ft3, not counted.
 */
export const BOX_VOLUME_FT3 = 1.5;

function round2(value) {
  return Math.round(value * 100) / 100;
}

const NET_KEY_BY_TYPE = {
  dry: 'dry_storage',
  refrigerated: 'refrigerated_storage',
  frozen: 'frozen_storage',
};

/** Whichever of dry/refrigerated/frozen has the least net capacity — the type that will run out first. */
function tightestType(capacity) {
  const entries = Object.entries(NET_KEY_BY_TYPE).map(([shortType, bucketKey]) => [shortType, capacity[bucketKey]?.net || 0]);
  return entries.reduce((tightest, candidate) => (candidate[1] < tightest[1] ? candidate : tightest))[0];
}

/**
 * @typedef {Object} BoxOverride
 * @property {number|null} count - a rep's manual box-count figure, overriding the computed estimate
 * @property {string|null} [note] - why the rep overrode it (kept in engine state, not part of the handoff schema)
 *
 * @param {ReturnType<typeof import('./vision/capacityEngine.js').computeCapacity>} capacity
 * @param {BoxOverride} [override]
 */
export function computeBoxCapacity(capacity, override = { count: null, note: null }) {
  const totalNetFt3 = (capacity.dry_storage?.net || 0) + (capacity.refrigerated_storage?.net || 0) + (capacity.frozen_storage?.net || 0);

  return {
    computedBoxes: Math.floor(totalNetFt3 / BOX_VOLUME_FT3),
    overrideBoxes: typeof override.count === 'number' ? override.count : null,
    bindingConstraint: tightestType(capacity),
    deadSpace: {
      dry: round2(capacity.dry_storage?.excluded || 0),
      refrigerated: round2(capacity.refrigerated_storage?.excluded || 0),
      frozen: round2(capacity.frozen_storage?.excluded || 0),
    },
  };
}
