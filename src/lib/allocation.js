/**
 * CareSpace allocation engine.
 *
 * Answers PRD §8 question 8 — "How many people can this transaction serve?" —
 * across the whole network at once, rather than one candidate match at a time.
 *
 * The unit of allocation is a BOX: one recipient's ration, which cannot be
 * split across facilities. A box consumes several PRD `capacity_type`
 * dimensions simultaneously (dry_storage AND frozen_storage AND ...), so a
 * facility's box-capacity is the MINIMUM across dimensions, never the sum.
 *
 * Pure: no I/O, no globals, no dependencies. Runs unchanged in the browser
 * (dashboard) and in the Cloudflare Pages Function (agent API).
 */

/** A dimension whose per-box volume is 0 or missing cannot bind. */
const binds = (dim) => Number(dim?.volumePerBox) > 0;

/**
 * Whole boxes a facility can physically accept, and which dimension stops it.
 * @returns {{capacity:number, perDimension:Record<string,number>, binding:string|null}}
 */
export function unitCapacity(space, dimensions, fallback = 0) {
  const perDimension = {};
  let capacity = Infinity;
  let binding = null;

  for (const dim of dimensions) {
    if (!binds(dim)) continue;
    const available = Number(space?.[dim.key]);
    const boxes = Number.isFinite(available)
      ? Math.max(0, Math.floor(available / dim.volumePerBox))
      : 0;
    perDimension[dim.key] = boxes;
    if (boxes < capacity) {
      capacity = boxes;
      binding = dim.key;
    }
  }

  if (capacity === Infinity) return { capacity: fallback, perDimension, binding: null };
  return { capacity, perDimension, binding };
}

/**
 * Maximise the minimum coverage ratio x_j / need_j, subject to
 * x_j <= cap_j, sum(x_j) <= supply, x_j integer.
 *
 * Raise a single dial lambda uniformly; each facility takes lambda * need.
 * A facility that hits its cap freezes there and leaves the pool, and the
 * remaining supply re-spreads across the rest. lambda only ever increases.
 *
 * PRECONDITION: cap must already be clamped to need by the caller. Without
 * that clamp a facility with abundant space absorbs more boxes than it has
 * people to feed.
 *
 * @returns {{x:Record<string,number>, lambda:number}}
 */
export function leximinWaterfill(need, cap, supply) {
  const ids = Object.keys(need);
  const free = new Set(ids.filter((j) => need[j] > 0));
  const x = {};
  for (const j of ids) if (!(need[j] > 0)) x[j] = 0;

  let remaining = Math.max(0, supply);
  let lambda = 0;

  while (free.size) {
    let totalNeed = 0;
    for (const j of free) totalNeed += need[j];
    lambda = remaining / totalNeed;

    let pick = null;
    let pickRatio = Infinity;
    for (const j of free) {
      const ratio = cap[j] / need[j];
      if (ratio <= lambda && ratio < pickRatio) {
        pickRatio = ratio;
        pick = j;
      }
    }
    if (pick === null) break;

    x[pick] = cap[pick];
    remaining -= cap[pick];
    free.delete(pick);
  }

  // Integerise by largest remainder. Safe: a still-free facility satisfies
  // lambda * need < cap, so rounding one box up can never breach its cap.
  const remainder = {};
  for (const j of free) {
    const raw = lambda * need[j];
    x[j] = Math.min(cap[j], Math.floor(raw));
    remainder[j] = raw - Math.floor(raw);
  }

  let placed = 0;
  for (const j of ids) placed += x[j];
  let leftover = Math.max(0, supply - placed);

  for (const j of Object.keys(remainder).sort((a, b) => remainder[b] - remainder[a])) {
    if (leftover <= 0) break;
    if (x[j] < cap[j]) {
      x[j] += 1;
      leftover -= 1;
    }
  }

  return { x, lambda };
}

function solveCore(supply, dimensions, sites) {
  const need = {};
  const cap = {};
  const rawCap = {};
  const detail = {};

  for (const site of sites) {
    const residual = Math.max(0, Math.round(site.people ?? 0) - Math.round(site.boxesOnHand ?? 0));
    const u = unitCapacity(site.space, dimensions, residual);
    need[site.id] = residual;
    rawCap[site.id] = u.capacity;
    cap[site.id] = Math.min(u.capacity, residual); // never ship more than there are people
    detail[site.id] = u;
  }

  const { x, lambda } = leximinWaterfill(need, cap, supply);
  return { x, lambda, need, cap, rawCap, detail };
}

const floorCoverage = (x, need) => {
  const active = Object.keys(need).filter((j) => need[j] > 0);
  if (!active.length) return 1;
  return Math.min(...active.map((j) => x[j] / need[j]));
};

/**
 * Full network allocation plus the diagnosis of what to do about it.
 *
 * @param {object} input
 * @param {number} input.supply       Boxes deliverable in this wave.
 * @param {Array}  input.dimensions   [{key, label, volumePerBox, unit}]
 * @param {Array}  input.sites        [{id, name, people, boxesOnHand, space:{[key]:number}}]
 * @param {boolean} [input.recommend] Compute space recommendations (extra solves).
 */
export function allocate({ supply, dimensions, sites, recommend = true }) {
  if (!Array.isArray(dimensions) || !Array.isArray(sites)) {
    throw new TypeError('allocate() requires `dimensions` and `sites` arrays');
  }

  const seen = new Set();
  for (const site of sites) {
    if (!site || typeof site.id !== 'string' || !site.id) {
      throw new TypeError('every site needs a non-empty string `id`');
    }
    if (seen.has(site.id)) throw new TypeError(`duplicate site id: ${site.id}`);
    seen.add(site.id);
  }

  const wave = Math.max(0, Math.floor(Number(supply) || 0));
  const { x, lambda, need, cap, rawCap, detail } = solveCore(wave, dimensions, sites);

  const totalNeed = Object.values(need).reduce((a, b) => a + b, 0);
  const totalCapacity = Object.values(cap).reduce((a, b) => a + b, 0);
  const totalShipped = Object.values(x).reduce((a, b) => a + b, 0);
  const baseFloor = floorCoverage(x, need);

  const rows = sites.map((site) => {
    const id = site.id;
    const shipped = x[id];
    const capacity = rawCap[id];
    let status;
    if (shipped >= need[id] && need[id] > 0) status = 'met';
    else if (need[id] === 0) status = 'stocked';
    else if (shipped >= capacity) status = 'capacity_bound';
    else status = 'supply_bound';

    return {
      id,
      name: site.name ?? id,
      people: Math.round(site.people ?? 0),
      boxesOnHand: Math.round(site.boxesOnHand ?? 0),
      residualNeed: need[id],
      boxCapacity: capacity,
      capacityByDimension: detail[id].perDimension,
      bindingDimension: detail[id].binding,
      boxes: shipped,
      coverage: need[id] > 0 ? shipped / need[id] : 1,
      spaceUtilisation: capacity > 0 ? shipped / capacity : 0,
      status,
      action:
        status === 'capacity_bound'
          ? 'Send storage, not food — this facility is physically full.'
          : status === 'supply_bound'
            ? 'Send food — this facility has room for more.'
            : status === 'met'
              ? 'Fully covered this wave.'
              : 'Already stocked from inventory on hand.',
    };
  });

  // Per-dimension utilisation, and the capacity stranded by indivisibility.
  const dimensionReport = dimensions.filter(binds).map((dim) => {
    const availableUnits = sites.reduce((a, s) => a + (Number(s.space?.[dim.key]) || 0), 0);
    const networkBoxes = sites.reduce((a, s) => a + (detail[s.id].perDimension[dim.key] ?? 0), 0);
    const usedUnits = totalShipped * dim.volumePerBox;
    return {
      key: dim.key,
      label: dim.label ?? dim.key,
      unit: dim.unit ?? 'units',
      availableUnits,
      usedUnits,
      utilisation: availableUnits > 0 ? usedUnits / availableUnits : 0,
      networkBoxes,
    };
  });

  // Sum-of-minimums vs minimum-of-sums: capacity that exists but is unreachable
  // because a box cannot be split across facilities.
  const sumOfMinimums = sites.reduce((a, s) => a + rawCap[s.id], 0);
  const minimumOfSums = dimensionReport.length
    ? Math.min(...dimensionReport.map((d) => d.networkBoxes))
    : sumOfMinimums;
  const atomicityLoss = Math.max(0, minimumOfSums - sumOfMinimums);

  const regime =
    totalCapacity === 0 ? 'no_capacity' : wave >= totalCapacity ? 'capacity_bound' : 'supply_bound';

  const result = {
    lambda,
    regime,
    verdict:
      regime === 'capacity_bound'
        ? 'Space is the wall. More food cannot be placed — add storage or split the wave across time.'
        : regime === 'no_capacity'
          ? 'No facility reported usable capacity. Nothing can be placed.'
          : 'Supply is the wall. Every facility with room could take more food.',
    totals: {
      residualNeed: totalNeed,
      networkCapacity: totalCapacity,
      supply: wave,
      shipped: totalShipped,
      coverage: totalNeed > 0 ? totalShipped / totalNeed : 1,
      floorCoverage: baseFloor,
      atomicityLoss,
    },
    sites: rows,
    dimensions: dimensionReport,
    recommendations: [],
  };

  if (!recommend) return result;

  // For each space-bound facility: how much extra storage lifts it to the
  // waterline, and what that does to the network's worst-served facility.
  for (const row of rows) {
    if (row.status !== 'capacity_bound') continue;

    const target = Math.min(row.residualNeed, Math.ceil(lambda * row.residualNeed));
    if (target <= row.boxCapacity) continue;

    const additions = [];
    for (const dim of dimensions.filter(binds)) {
      const site = sites.find((s) => s.id === row.id);
      const have = Number(site.space?.[dim.key]) || 0;
      const required = target * dim.volumePerBox;
      if (required > have) {
        additions.push({
          dimension: dim.key,
          label: dim.label ?? dim.key,
          unit: dim.unit ?? 'units',
          addUnits: Number((required - have).toFixed(4)),
        });
      }
    }
    if (!additions.length) continue;

    const patched = sites.map((s) =>
      s.id !== row.id
        ? s
        : {
            ...s,
            space: additions.reduce(
              (acc, a) => ({ ...acc, [a.dimension]: (Number(s.space?.[a.dimension]) || 0) + a.addUnits }),
              { ...s.space },
            ),
          },
    );
    const after = solveCore(wave, dimensions, patched);

    result.recommendations.push({
      siteId: row.id,
      name: row.name,
      bindingDimension: row.bindingDimension,
      boxesToday: row.boxes,
      boxesAtWaterline: target,
      additions,
      floorCoverageBefore: baseFloor,
      floorCoverageAfter: floorCoverage(after.x, after.need),
      shippedAfter: Object.values(after.x).reduce((a, b) => a + b, 0),
    });
  }

  result.recommendations.sort((a, b) => b.floorCoverageAfter - a.floorCoverageAfter);
  return result;
}

/**
 * Map PRD §7 `Capacity` records onto solver input.
 *
 * Uses `available_capacity` (live free space), never `maximum_capacity` —
 * allocating against nameplate capacity double-books whatever is already
 * on the floor. Records past `valid_until`, or verified longer ago than
 * `maxAgeHours`, are dropped rather than silently extrapolated.
 *
 * @returns {{space:Record<string,number>, stale:Array, warnings:string[]}}
 */
export function spaceFromCapacityRecords(records, { now = Date.now(), maxAgeHours = 72 } = {}) {
  const space = {};
  const stale = [];
  const warnings = [];
  const cutoff = now - maxAgeHours * 3600 * 1000;

  for (const record of records ?? []) {
    const key = record.capacity_type;
    if (!key) {
      warnings.push('capacity record without capacity_type ignored');
      continue;
    }
    const validUntil = record.valid_until ? Date.parse(record.valid_until) : null;
    const verified = record.last_verified ? Date.parse(record.last_verified) : null;

    if (validUntil !== null && Number.isFinite(validUntil) && validUntil < now) {
      stale.push({ ...record, reason: 'expired' });
      continue;
    }
    if (verified !== null && Number.isFinite(verified) && verified < cutoff) {
      stale.push({ ...record, reason: 'unverified' });
      continue;
    }
    if (verified === null) {
      warnings.push(`${key} at ${record.facility_id ?? 'unknown facility'} has no last_verified`);
    }

    const value = Number(record.available_capacity);
    if (!Number.isFinite(value) || value < 0) {
      warnings.push(`${key} has a non-numeric available_capacity`);
      continue;
    }
    space[key] = (space[key] ?? 0) + value;
  }

  return { space, stale, warnings };
}
