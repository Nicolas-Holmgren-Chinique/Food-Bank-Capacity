import foods from './foods.json' with { type: 'json' };

const CAPACITY_TYPE_UNIT = {
  refrigerated_storage: 'ft3',
  frozen_storage: 'ft3',
  dry_storage: 'ft3',
  floor_staging: 'ft2',
};

const CAPACITY_TYPE_TO_FOOD_CATEGORY = {
  refrigerated_storage: 'cold',
  frozen_storage: 'frozen',
  dry_storage: 'dry',
};

function round2(value) {
  return Math.round(value * 100) / 100;
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Best meals-per-ft3 (or per-ft2 for floor) food in a category, used as a rough meals-equivalent estimator per bucket. */
function estimateMealsForBucket(capacityType, bucket) {
  if (capacityType === 'floor_staging') {
    const best = foods
      .filter((food) => food.footprintFt2)
      .sort((a, b) => b.mealsEquivalent / b.footprintFt2 - a.mealsEquivalent / a.footprintFt2)[0];
    if (!best) return 0;
    return Math.round((bucket.net / best.footprintFt2) * best.mealsEquivalent);
  }

  const category = CAPACITY_TYPE_TO_FOOD_CATEGORY[capacityType];
  const best = foods
    .filter((food) => food.category === category)
    .sort((a, b) => b.mealsEquivalent / b.volumePerUnit - a.mealsEquivalent / a.volumePerUnit)[0];
  if (!best) return 0;
  return Math.round((bucket.net / best.volumePerUnit) * best.mealsEquivalent);
}

/**
 * @typedef {Object} Scan
 * @property {import('./adapter.js').Detection[]} detections
 * @property {ReturnType<typeof import('./capacityEngine.js').computeCapacity>} capacity
 * @property {import('./simulator.js').SimulatedLoad} [simulatedLoad]
 * @property {string|number|Date} [scannedAt]
 * @property {number} [validityHours]
 * @property {{fixtureIds?: string[], floorZones?: {areaFt2: number}[]}} [exclusions]
 * @property {Record<string, {capacityType?: string, estimatedVolumeFt3?: number, estimatedAreaFt2?: number}>} [overrides]
 * @property {boolean} [isMock] - true only when the server explicitly served canned detections (MOCK_VISION=true) — propagated into provenance so demo scans never look like real self-reported data downstream
 */

/**
 * Converts scan results into PRD-conformant Capacity records — one per
 * capacity type with nonzero gross capacity. Every record carries freshness
 * (valid_from/valid_until/last_verified) and provenance, per PRD section 13
 * ("Critical Requirement: Freshness") and section 15 ("Trust and
 * Verification") — capacity without that metadata is not useful to the
 * matching engine.
 *
 * @param {Scan} scan
 * @param {string} facilityId
 */
export function buildCapacityRecords(scan, facilityId) {
  const now = new Date(scan.scannedAt || Date.now());
  const validUntil = new Date(now.getTime() + (scan.validityHours ?? 24) * 60 * 60 * 1000);

  const confidences = scan.detections
    .filter((detection) => !detection.excluded && detection.source === 'detected' && typeof detection.confidence === 'number')
    .map((detection) => detection.confidence);
  const confidenceSummary = confidences.length
    ? round2(confidences.reduce((sum, value) => sum + value, 0) / confidences.length)
    : null;

  const records = [];
  for (const [capacityType, unit] of Object.entries(CAPACITY_TYPE_UNIT)) {
    const bucket = scan.capacity[capacityType];
    if (!bucket || bucket.gross <= 0) continue;

    records.push({
      capacity_id: uuid(),
      facility_id: facilityId,
      capacity_type: capacityType,
      maximum_capacity: round2(bucket.gross),
      available_capacity: round2(bucket.net),
      unit,
      meals_equivalent_estimate: estimateMealsForBucket(capacityType, bucket),
      valid_from: now.toISOString(),
      valid_until: validUntil.toISOString(),
      last_verified: now.toISOString(),
      provenance: {
        source: 'organization_user',
        method: 'vision_scan',
        model: scan.isMock ? 'eyepop-demo-data' : 'eyepop',
        confidence_summary: confidenceSummary,
        verification_status: 'self_reported',
        is_demo_data: Boolean(scan.isMock),
      },
    });
  }

  return records;
}

/**
 * Audit-trail / map-UI detail object alongside the Capacity records.
 *
 * Applies `scan.exclusions`/`scan.overrides` the same way capacityEngine.js
 * does, so this reflects what the user actually confirmed in the review
 * step (fixture-level "occupied" toggles, reclassification, volume edits) —
 * not just the raw detector output, which would silently show every fixture
 * as included even after the user excluded it.
 */
export function buildScanDetail(scan, facilityId) {
  const excludedIds = new Set(scan.exclusions?.fixtureIds || []);
  const overrides = scan.overrides || {};

  return {
    facility_id: facilityId,
    scanned_at: new Date(scan.scannedAt || Date.now()).toISOString(),
    is_demo_data: Boolean(scan.isMock),
    meal_prep_capable: Boolean(scan.capacity.mealPrepCapable),
    fixtures: scan.detections.map((detection) => {
      const override = overrides[detection.id] || {};
      const isOverridden = Object.keys(override).length > 0;
      return {
        id: detection.id,
        raw_class: detection.rawClass,
        category: detection.category,
        capacity_type: override.capacityType ?? detection.capacityType,
        confidence: detection.confidence,
        bbox: detection.bbox,
        estimated_volume_ft3: override.estimatedVolumeFt3 ?? detection.estimatedVolumeFt3 ?? null,
        estimated_area_ft2: override.estimatedAreaFt2 ?? detection.estimatedAreaFt2 ?? null,
        volume_source: isOverridden ? 'manual' : detection.volumeSource ?? null,
        excluded: excludedIds.has(detection.id) || Boolean(detection.excluded),
        source: detection.source,
      };
    }),
    simulated_load: scan.simulatedLoad || null,
  };
}

/**
 * Posts each Capacity record to `${baseUrl}/api/v1/capacity`. This predates
 * the CareSpace in-process integration (see docs/INTEGRATION.md) — a host
 * UI mounting this engine directly should read `engine.getResult()` instead
 * of expecting us to POST anywhere. Kept for any downstream system that
 * still wants per-type Capacity records over HTTP; if `baseUrl` is unset or
 * the request fails, this falls back to logging the payload and returning
 * it so the caller can offer a JSON download either way.
 *
 * @param {ReturnType<typeof buildCapacityRecords>} records
 * @param {ReturnType<typeof buildScanDetail>} scanDetail
 * @param {{ baseUrl?: string, fetchImpl?: typeof fetch }} [options]
 */
export async function postCapacityRecords(records, scanDetail, options = {}) {
  const baseUrl = options.baseUrl?.replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  const payload = { records, scan_detail: scanDetail };

  if (!baseUrl || !fetchImpl) {
    console.log('[carespace-export] No base URL configured — logging payload instead of posting.', payload);
    return { posted: false, reason: 'no_base_url', payload };
  }

  const results = [];
  for (const record of records) {
    try {
      const response = await fetchImpl(`${baseUrl}/api/v1/capacity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      results.push({ capacity_id: record.capacity_id, ok: response.ok, status: response.status });
      if (!response.ok) console.warn('[carespace-export] Non-OK response posting capacity record', record.capacity_id, response.status);
    } catch (error) {
      results.push({ capacity_id: record.capacity_id, ok: false, error: error?.message || String(error) });
    }
  }

  const allOk = results.every((result) => result.ok);
  if (!allOk) {
    console.warn('[carespace-export] One or more capacity records failed to post — payload logged for manual recovery.', payload);
  }

  return { posted: allOk, reason: allOk ? 'posted' : 'partial_or_failed', results, payload };
}

/** Triggers a browser download of the export payload as JSON — used when the backend isn't reachable. */
export function downloadCapacityExport(records, scanDetail, filename = `carespace-capacity-export-${Date.now()}.json`) {
  const payload = { records, scan_detail: scanDetail };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return payload;
}
