import foods from './foods.json' with { type: 'json' };

const CATEGORY_TO_CAPACITY_TYPE = { cold: 'refrigerated_storage', frozen: 'frozen_storage', dry: 'dry_storage' };

function foodById(id) {
  return foods.find((food) => food.id === id) || null;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @typedef {Object} LoadLine
 * @property {string} foodId
 * @property {number} units
 * @typedef {{ cold?: LoadLine[], frozen?: LoadLine[], dry?: LoadLine[] }} SimulatedLoad
 */

/**
 * Validates a simulated delivery against net capacity, per category, plus
 * the floor footprint of any pallet-unit items.
 *
 * @param {SimulatedLoad} load
 * @param {ReturnType<typeof import('./capacityEngine.js').computeCapacity>} capacity
 */
export function validateLoad(load, capacity) {
  const byCategory = {};
  let overallFits = true;
  let requestedFloorFt2 = 0;

  for (const [category, capacityType] of Object.entries(CATEGORY_TO_CAPACITY_TYPE)) {
    const capacityFt3 = capacity[capacityType]?.net || 0;
    const lines = load[category] || [];

    let requestedFt3 = 0;
    for (const line of lines) {
      const food = foodById(line.foodId);
      if (!food) continue;
      requestedFt3 += food.volumePerUnit * line.units;
      if (food.footprintFt2) requestedFloorFt2 += food.footprintFt2 * line.units;
    }

    const fits = requestedFt3 <= capacityFt3;
    if (!fits) overallFits = false;

    byCategory[category] = {
      requestedFt3: round2(requestedFt3),
      capacityFt3: round2(capacityFt3),
      fits,
      remainingFt3: round2(Math.max(0, capacityFt3 - requestedFt3)),
      overflowFt3: round2(Math.max(0, requestedFt3 - capacityFt3)),
    };
  }

  const floorCapacityFt2 = capacity.floor_staging?.net || 0;
  const floorFits = requestedFloorFt2 <= floorCapacityFt2;
  if (!floorFits) overallFits = false;
  byCategory.floor = {
    requestedFt2: round2(requestedFloorFt2),
    capacityFt2: round2(floorCapacityFt2),
    fits: floorFits,
    remainingFt2: round2(Math.max(0, floorCapacityFt2 - requestedFloorFt2)),
    overflowFt2: round2(Math.max(0, requestedFloorFt2 - floorCapacityFt2)),
  };

  return { byCategory, overallFits };
}

/**
 * Max supportable units of every catalog item, independently, given net
 * capacity — plus a total meal-equivalent figure for the whole facility.
 */
export function maxQuantities(capacity) {
  const maxUnits = {};
  let totalMealsEquivalent = 0;

  for (const food of foods) {
    const capacityType = CATEGORY_TO_CAPACITY_TYPE[food.category];
    const capacityFt3 = capacity[capacityType]?.net || 0;
    let units = food.volumePerUnit > 0 ? Math.floor(capacityFt3 / food.volumePerUnit) : 0;

    if (food.footprintFt2) {
      const floorFt2 = capacity.floor_staging?.net || 0;
      units = Math.min(units, Math.floor(floorFt2 / food.footprintFt2));
    }

    units = Math.max(0, units);
    maxUnits[food.id] = units;
    totalMealsEquivalent += units * (food.mealsEquivalent || 0);
  }

  return { maxUnits, totalMealsEquivalent: Math.round(totalMealsEquivalent) };
}

/**
 * Which capacity type is the limiting factor on total deliverable meals —
 * for each type, compute the meal-equivalent if it alone were filled
 * optimally (best meals-per-ft3/ft2 food in that category), then return
 * whichever type supports the fewest meals. Used for the review screen's
 * "binding constraint" callout, e.g. "Frozen storage is your binding
 * constraint — only 100 meals worth."
 */
export function bindingConstraint(capacity) {
  const candidates = Object.entries(CATEGORY_TO_CAPACITY_TYPE).map(([category, capacityType]) => {
    const capacityFt3 = capacity[capacityType]?.net || 0;
    const best = foods.filter((food) => food.category === category).sort((a, b) => b.mealsEquivalent / b.volumePerUnit - a.mealsEquivalent / a.volumePerUnit)[0];
    const mealsEquivalent = best ? Math.round((capacityFt3 / best.volumePerUnit) * best.mealsEquivalent) : 0;
    return { capacityType, mealsEquivalent, amount: round2(capacityFt3), unit: 'ft3' };
  });

  const floorFt2 = capacity.floor_staging?.net || 0;
  const bestFloor = foods.filter((food) => food.footprintFt2).sort((a, b) => b.mealsEquivalent / b.footprintFt2 - a.mealsEquivalent / a.footprintFt2)[0];
  candidates.push({
    capacityType: 'floor_staging',
    mealsEquivalent: bestFloor ? Math.round((floorFt2 / bestFloor.footprintFt2) * bestFloor.mealsEquivalent) : 0,
    amount: round2(floorFt2),
    unit: 'ft2',
  });

  return candidates.reduce((tightest, candidate) => (candidate.mealsEquivalent < tightest.mealsEquivalent ? candidate : tightest));
}

/**
 * Suggested balanced load: greedily fills each storage category with the
 * food that packs the most meal-equivalents per ft3, respecting a shared
 * floor-footprint budget for pallet-unit items.
 */
export function recommendMix(capacity) {
  const mix = [];
  let remainingFloorFt2 = capacity.floor_staging?.net || 0;

  for (const [category, capacityType] of Object.entries(CATEGORY_TO_CAPACITY_TYPE)) {
    let remainingFt3 = capacity[capacityType]?.net || 0;
    const candidates = foods
      .filter((food) => food.category === category)
      .sort((a, b) => b.mealsEquivalent / b.volumePerUnit - a.mealsEquivalent / a.volumePerUnit);

    for (const food of candidates) {
      if (remainingFt3 < food.volumePerUnit) continue;
      let units = Math.floor(remainingFt3 / food.volumePerUnit);
      if (food.footprintFt2 && units > 0) {
        units = Math.min(units, Math.floor(remainingFloorFt2 / food.footprintFt2));
      }
      if (units <= 0) continue;

      mix.push({ foodId: food.id, units });
      remainingFt3 -= units * food.volumePerUnit;
      if (food.footprintFt2) remainingFloorFt2 -= units * food.footprintFt2;
    }
  }

  return mix;
}

/**
 * Simple illustrative 2D placement of a simulated load inside the storage
 * fixture bboxes — not physics, just enough for the map/review UI to sketch
 * where a load would land.
 *
 * @param {SimulatedLoad} load
 * @param {import('./adapter.js').Detection[]} detections
 */
export function placementLayout(load, detections) {
  const storageDetections = detections.filter((detection) => detection.capacityType && !detection.excluded);
  if (storageDetections.length === 0) return [];

  const allItems = Object.keys(CATEGORY_TO_CAPACITY_TYPE).flatMap((category) =>
    (load[category] || []).map((line) => ({ ...line, category })),
  );

  const layout = [];
  allItems.forEach((item, index) => {
    const detection = storageDetections[index % storageDetections.length];
    const stackIndex = Math.floor(index / storageDetections.length);
    layout.push({
      detectionId: detection.id,
      rects: [
        {
          x: detection.bbox.x + 0.05,
          y: Math.min(detection.bbox.y + detection.bbox.height - 0.1, detection.bbox.y + 0.1 * (stackIndex + 1)),
          width: detection.bbox.width * 0.7,
          height: Math.min(0.25, detection.bbox.height * 0.3),
          foodId: item.foodId,
          label: `${item.units}x ${item.foodId}`,
        },
      ],
    });
  });

  return layout;
}
