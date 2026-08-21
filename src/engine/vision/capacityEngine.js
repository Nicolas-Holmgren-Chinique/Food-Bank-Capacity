import referenceVolumes from './referenceVolumes.json' with { type: 'json' };

const STORAGE_CAPACITY_TYPES = ['refrigerated_storage', 'frozen_storage', 'dry_storage'];

function emptyBucket(unit) {
  return { gross: 0, excluded: 0, net: 0, unit };
}

/**
 * @typedef {Object} CapacityExclusions
 * @property {string[]} [fixtureIds] - detection ids marked occupied/unusable right now
 * @property {{areaFt2: number}[]} [floorZones] - rectangular (or simple area) floor exclusions
 *
 * @typedef {Object} CapacityOverride
 * @property {string} [capacityType] - user reclassification
 * @property {number} [estimatedVolumeFt3]
 * @property {number} [estimatedAreaFt2]
 * @property {number} [freezerCompartmentFt3]
 */

/**
 * Pure, synchronous, deterministic: detections + exclusions/overrides -> net
 * capacity by CareSpace capacity type. Implements the PRD's KNOWN vs
 * CURRENTLY AVAILABLE distinction — `gross` is what exists, `net` is what's
 * usable right now after the user excludes occupied/unusable space.
 *
 * @param {import('./adapter.js').Detection[]} detections
 * @param {CapacityExclusions} [exclusions]
 * @param {Record<string, CapacityOverride>} [overrides] - keyed by detection id
 */
export function computeCapacity(detections, exclusions = {}, overrides = {}) {
  const excludedIds = new Set(exclusions.fixtureIds || []);
  const floorZones = exclusions.floorZones || [];
  const excludedFloorAreaFt2 = floorZones.reduce((sum, zone) => sum + (zone.areaFt2 || 0), 0);

  const buckets = {
    refrigerated_storage: emptyBucket('ft3'),
    frozen_storage: emptyBucket('ft3'),
    dry_storage: emptyBucket('ft3'),
    floor_staging: { ...emptyBucket('ft2'), palletSlots: 0 },
  };

  let mealPrepCapable = false;

  for (const detection of detections) {
    const override = overrides[detection.id] || {};
    const isExcluded = excludedIds.has(detection.id) || Boolean(detection.excluded);

    if (detection.category === 'kitchen_fixture') {
      if (!isExcluded && (override.mealPrepFlag ?? detection.mealPrepFlag)) mealPrepCapable = true;
      continue;
    }

    if (detection.category === 'floor') {
      const area = override.estimatedAreaFt2 ?? detection.estimatedAreaFt2 ?? 0;
      buckets.floor_staging.gross += area;
      buckets.floor_staging.excluded += isExcluded ? area : Math.min(area, excludedFloorAreaFt2);
      continue;
    }

    const capacityType = override.capacityType ?? detection.capacityType;
    if (!capacityType || !STORAGE_CAPACITY_TYPES.includes(capacityType)) continue;

    const volume = override.estimatedVolumeFt3 ?? detection.estimatedVolumeFt3 ?? 0;
    buckets[capacityType].gross += volume;
    if (isExcluded) buckets[capacityType].excluded += volume;

    if (detection.category === 'refrigerator' && capacityType === 'refrigerated_storage') {
      const freezerVolume = override.freezerCompartmentFt3 ?? detection.freezerCompartmentFt3 ?? 0;
      buckets.frozen_storage.gross += freezerVolume;
      if (isExcluded) buckets.frozen_storage.excluded += freezerVolume;
    }
  }

  for (const type of STORAGE_CAPACITY_TYPES) {
    buckets[type].net = round2(Math.max(0, buckets[type].gross - buckets[type].excluded));
    buckets[type].gross = round2(buckets[type].gross);
    buckets[type].excluded = round2(buckets[type].excluded);
  }
  buckets.floor_staging.net = round2(Math.max(0, buckets.floor_staging.gross - buckets.floor_staging.excluded));
  buckets.floor_staging.gross = round2(buckets.floor_staging.gross);
  buckets.floor_staging.excluded = round2(buckets.floor_staging.excluded);
  buckets.floor_staging.palletSlots = Math.floor(buckets.floor_staging.net / referenceVolumes.palletSlotFt2);

  return { ...buckets, mealPrepCapable };
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
