import { test } from 'vitest';
import assert from 'node:assert/strict';
import { allocate, leximinWaterfill, unitCapacity, spaceFromCapacityRecords } from './allocation.js';

// A box: 3 bags rice + 2 cans beans (dry) + 1 pack frozen peas (frozen).
const DIMENSIONS = [
  { key: 'dry_storage', label: 'Dry storage', volumePerBox: 0.03, unit: 'm3' },
  { key: 'frozen_storage', label: 'Frozen storage', volumePerBox: 0.005, unit: 'm3' },
];

const SITES = [
  { id: 'A', name: 'North County Food Hub', people: 30000, boxesOnHand: 2000, space: { dry_storage: 900, frozen_storage: 60 } },
  { id: 'B', name: 'Central Care Food Bank', people: 25000, boxesOnHand: 0, space: { dry_storage: 1200, frozen_storage: 40 } },
  { id: 'C', name: 'South Bay Community Pantry', people: 20000, boxesOnHand: 3000, space: { dry_storage: 300, frozen_storage: 90 } },
  { id: 'D', name: 'East County Community Table', people: 15000, boxesOnHand: 1000, space: { dry_storage: 750, frozen_storage: 15 } },
  { id: 'E', name: 'Harbor House', people: 10000, boxesOnHand: 500, space: { dry_storage: 450, frozen_storage: 30 } },
];

const byId = (r) => Object.fromEntries(r.sites.map((s) => [s.id, s.boxes]));

test('reproduces the reference allocation exactly', () => {
  const r = allocate({ supply: 30000, dimensions: DIMENSIONS, sites: SITES });
  assert.deepEqual(byId(r), { A: 9761, B: 8000, C: 5927, D: 3000, E: 3312 });
  assert.equal(r.lambda.toFixed(5), '0.34862');
  assert.equal(r.totals.shipped, 30000);
  assert.equal(r.regime, 'supply_bound');
});

test('capacity is the minimum across dimensions, not the sum', () => {
  // 1200 m3 dry = 40,000 boxes, but 40 m3 frozen = only 8,000.
  const u = unitCapacity({ dry_storage: 1200, frozen_storage: 40 }, DIMENSIONS);
  assert.equal(u.capacity, 8000);
  assert.equal(u.binding, 'frozen_storage');
  assert.deepEqual(u.perDimension, { dry_storage: 40000, frozen_storage: 8000 });
});

test('nets residual need against inventory already on hand', () => {
  const r = allocate({ supply: 30000, dimensions: DIMENSIONS, sites: SITES });
  const a = r.sites.find((s) => s.id === 'A');
  assert.equal(a.residualNeed, 28000); // 30,000 people less 2,000 boxes in stock
});

test('never ships more boxes than a facility has people to feed', () => {
  // The clamp bug: abundant space, tiny need, abundant supply.
  const r = allocate({
    supply: 50000,
    dimensions: DIMENSIONS,
    sites: [{ id: 'P', name: 'Tiny pantry', people: 100, boxesOnHand: 0, space: { dry_storage: 1000, frozen_storage: 1000 } }],
  });
  assert.equal(r.sites[0].boxes, 100);
  assert.equal(r.sites[0].status, 'met');
});

test('a fully stocked facility absorbs nothing', () => {
  const r = allocate({
    supply: 1000,
    dimensions: DIMENSIONS,
    sites: [
      { id: 'Z', people: 500, boxesOnHand: 500, space: { dry_storage: 9, frozen_storage: 9 } },
      { id: 'Y', people: 400, boxesOnHand: 0, space: { dry_storage: 99, frozen_storage: 99 } },
    ],
  });
  assert.equal(byId(r).Z, 0);
  assert.equal(byId(r).Y, 400);
  assert.equal(r.sites.find((s) => s.id === 'Z').status, 'stocked');
});

test('identifies the regime and refuses to overfill when space is the wall', () => {
  const r = allocate({ supply: 200000, dimensions: DIMENSIONS, sites: SITES });
  assert.equal(r.regime, 'capacity_bound');
  assert.equal(r.totals.shipped, 39000);
  assert.deepEqual(byId(r), { A: 12000, B: 8000, C: 10000, D: 3000, E: 6000 });
});

test('reports capacity stranded by indivisibility', () => {
  const r = allocate({ supply: 30000, dimensions: DIMENSIONS, sites: SITES });
  // Network holds frozen for 47,000 boxes and dry for 120,000, but can only
  // take 39,000 — because a box cannot be split across facilities.
  assert.equal(r.totals.atomicityLoss, 8000);
});

test('recommends storage for space-bound facilities, ranked by network effect', () => {
  const r = allocate({ supply: 30000, dimensions: DIMENSIONS, sites: SITES });
  const blocked = r.sites.filter((s) => s.status === 'capacity_bound').map((s) => s.id);
  assert.deepEqual(blocked.sort(), ['B', 'D']);

  const forD = r.recommendations.find((x) => x.siteId === 'D');
  assert.equal(forD.bindingDimension, 'frozen_storage');
  assert.ok(forD.floorCoverageAfter > forD.floorCoverageBefore);
  // Equity, not volume: the wave still places exactly the same box count.
  assert.equal(forD.shippedAfter, 30000);
});

test('drops expired and unverified capacity rather than extrapolating', () => {
  const now = Date.parse('2026-08-20T12:00:00Z');
  const { space, stale, warnings } = spaceFromCapacityRecords(
    [
      { facility_id: 'f1', capacity_type: 'dry_storage', available_capacity: 900, last_verified: '2026-08-20T09:00:00Z' },
      { facility_id: 'f1', capacity_type: 'frozen_storage', available_capacity: 60, valid_until: '2026-08-19T00:00:00Z' },
      { facility_id: 'f1', capacity_type: 'refrigerated_storage', available_capacity: 30, last_verified: '2026-08-01T00:00:00Z' },
      { facility_id: 'f1', capacity_type: 'dry_storage', available_capacity: 100 },
    ],
    { now, maxAgeHours: 72 },
  );
  assert.deepEqual(space, { dry_storage: 1000 });
  assert.deepEqual(stale.map((s) => s.reason).sort(), ['expired', 'unverified']);
  assert.ok(warnings.some((w) => w.includes('last_verified')));
});

test('drops records whose timestamps are unreadable', () => {
  // Date.parse('yesterday') is NaN, which is neither missing nor comparable.
  // Left unhandled it slips past the expiry check, the staleness check, and
  // the missing-timestamp warning — provenance-shaped data with no provenance.
  const { space, stale, warnings } = spaceFromCapacityRecords([
    { facility_id: 'f1', capacity_type: 'dry_storage', available_capacity: 900, last_verified: 'yesterday' },
    { facility_id: 'f1', capacity_type: 'frozen_storage', available_capacity: 60, valid_until: 'soon' },
    { facility_id: 'f1', capacity_type: 'dry_storage', available_capacity: 100, last_verified: new Date().toISOString() },
  ]);
  assert.deepEqual(space, { dry_storage: 100 });
  assert.deepEqual(stale.map((s) => s.reason), ['invalid_timestamp', 'invalid_timestamp']);
  assert.ok(warnings.some((w) => w.includes('unreadable last_verified')));
  assert.ok(warnings.some((w) => w.includes('unreadable valid_until')));
});

test('bounds recommendation solves regardless of network size', () => {
  // One full extra solve per recommendation, so an uncapped network of N
  // capacity-bound facilities costs N solves — reachable from one API request.
  const sites = Array.from({ length: 200 }, (_, i) => ({
    id: `s${i}`,
    people: 9000,
    boxesOnHand: 0,
    space: { dry_storage: 5, frozen_storage: 0.2 },
  }));
  const r = allocate({ supply: 1_000_000, dimensions: DIMENSIONS, sites });

  assert.equal(r.sites.filter((s) => s.status === 'capacity_bound').length, 200);
  assert.ok(r.recommendations.length <= 5, 'defaults to at most 5 recommendations');
  assert.equal(r.recommendationsTruncated, 200 - r.recommendations.length);

  const capped = allocate({ supply: 1_000_000, dimensions: DIMENSIONS, sites, maxRecommendations: 2 });
  assert.equal(capped.recommendations.length, 2);

  const none = allocate({ supply: 1_000_000, dimensions: DIMENSIONS, sites, maxRecommendations: 0 });
  assert.equal(none.recommendations.length, 0);
});

test('recommends the worst-covered facilities first', () => {
  const r = allocate({ supply: 30000, dimensions: DIMENSIONS, sites: SITES, maxRecommendations: 1 });
  // D sits at 21.4% coverage, B at 32.0% — D is the one storage helps most.
  assert.equal(r.recommendations.length, 1);
  assert.equal(r.recommendations[0].siteId, 'D');
  assert.equal(r.recommendationsTruncated, 1);
});

test('rejects malformed input loudly', () => {
  assert.throws(() => allocate({ supply: 1, dimensions: DIMENSIONS, sites: [{ people: 5 }] }), /non-empty string/);
  assert.throws(
    () => allocate({ supply: 1, dimensions: DIMENSIONS, sites: [{ id: 'x', people: 1 }, { id: 'x', people: 1 }] }),
    /duplicate site id/,
  );
  assert.throws(() => allocate({ supply: 1, dimensions: DIMENSIONS, sites: 'nope' }), TypeError);
});

test('holds its invariants across randomised networks', () => {
  for (let t = 0; t < 3000; t++) {
    const n = 2 + (t % 9);
    const sites = [];
    for (let i = 0; i < n; i++) {
      sites.push({
        id: `g${i}`,
        people: 1 + Math.floor(Math.random() * 40000),
        boxesOnHand: Math.floor(Math.random() * 5000),
        space: { dry_storage: Math.random() * 1500, frozen_storage: Math.random() * 80 },
      });
    }
    const supply = Math.floor(Math.random() * 120000);
    const r = allocate({ supply, dimensions: DIMENSIONS, sites, recommend: false });

    const need = Object.fromEntries(r.sites.map((s) => [s.id, s.residualNeed]));
    const cap = Object.fromEntries(r.sites.map((s) => [s.id, Math.min(s.boxCapacity, s.residualNeed)]));
    const x = byId(r);

    assert.equal(r.totals.shipped, Math.min(supply, r.totals.networkCapacity), 'conservation');
    for (const s of r.sites) {
      assert.ok(Number.isInteger(s.boxes), 'integral');
      assert.ok(s.boxes <= s.boxCapacity, 'within physical capacity');
      assert.ok(s.boxes <= s.residualNeed, 'never over-ships');
    }

    // Leximin: anything not pinned at its cap sits on the waterline,
    // to within the single box integer rounding can add.
    const unpinned = r.sites.filter((s) => s.residualNeed > 0 && x[s.id] < cap[s.id]);
    if (unpinned.length > 1) {
      for (const s of unpinned) {
        const lo = Math.floor(r.lambda * need[s.id]);
        assert.ok(x[s.id] >= lo && x[s.id] <= lo + 1, `waterline ${s.id}`);
      }
    }
  }
});
