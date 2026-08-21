import { describe, expect, it, vi } from 'vitest';
import { buildCapacityRecords, buildScanDetail, postCapacityRecords } from './exportBuilder.js';

function makeScan(overrides = {}) {
  return {
    detections: [
      { id: 'fixture-1', rawClass: 'refrigerator', category: 'refrigerator', capacityType: 'refrigerated_storage', confidence: 0.9, bbox: { x: 0, y: 0, width: 0.2, height: 0.5 }, estimatedVolumeFt3: 20, excluded: false, source: 'detected' },
    ],
    capacity: {
      refrigerated_storage: { gross: 20, excluded: 0, net: 20, unit: 'ft3' },
      frozen_storage: { gross: 6, excluded: 0, net: 6, unit: 'ft3' },
      dry_storage: { gross: 0, excluded: 0, net: 0, unit: 'ft3' },
      floor_staging: { gross: 0, excluded: 0, net: 0, unit: 'ft2', palletSlots: 0 },
      mealPrepCapable: false,
    },
    scannedAt: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

describe('buildCapacityRecords', () => {
  it('emits one record per capacity type with nonzero gross, skipping empty ones', () => {
    const records = buildCapacityRecords(makeScan(), 'facility-123');
    const types = records.map((record) => record.capacity_type);
    expect(types).toEqual(['refrigerated_storage', 'frozen_storage']);
    expect(types).not.toContain('dry_storage');
    expect(types).not.toContain('floor_staging');
  });

  it('sets maximum_capacity to gross and available_capacity to net (KNOWN vs CURRENTLY AVAILABLE)', () => {
    const scan = makeScan();
    scan.capacity.refrigerated_storage = { gross: 20, excluded: 12, net: 8, unit: 'ft3' };
    const [record] = buildCapacityRecords(scan, 'facility-123');
    expect(record.maximum_capacity).toBe(20);
    expect(record.available_capacity).toBe(8);
  });

  it('stamps every record with facility_id, freshness fields, and provenance', () => {
    const [record] = buildCapacityRecords(makeScan(), 'facility-123');
    expect(record.facility_id).toBe('facility-123');
    expect(record.valid_from).toBe('2026-08-20T12:00:00.000Z');
    expect(new Date(record.valid_until).getTime()).toBeGreaterThan(new Date(record.valid_from).getTime());
    expect(record.last_verified).toBe(record.valid_from);
    expect(record.provenance).toMatchObject({ source: 'organization_user', method: 'vision_scan', model: 'eyepop', verification_status: 'self_reported' });
  });

  it('respects a custom validityHours for valid_until', () => {
    const [record] = buildCapacityRecords(makeScan({ validityHours: 2 }), 'facility-123');
    const hours = (new Date(record.valid_until) - new Date(record.valid_from)) / (1000 * 60 * 60);
    expect(hours).toBeCloseTo(2, 5);
  });

  it('averages confidence only across non-excluded, detected fixtures', () => {
    const scan = makeScan();
    scan.detections.push({ id: 'fixture-2', category: 'shelving', capacityType: 'dry_storage', confidence: 0.5, excluded: true, source: 'detected', bbox: {}, estimatedVolumeFt3: 12 });
    scan.detections.push({ id: 'fixture-3', category: 'shelving', capacityType: 'dry_storage', confidence: null, excluded: false, source: 'manual', bbox: {}, estimatedVolumeFt3: 12 });
    const [record] = buildCapacityRecords(scan, 'facility-123');
    expect(record.provenance.confidence_summary).toBe(0.9);
  });
});

describe('buildScanDetail', () => {
  it('includes fixtures, meal-prep flag, and simulated load for the audit trail', () => {
    const scan = makeScan({ simulatedLoad: { cold: [{ foodId: 'milk_crate', units: 2 }] } });
    scan.capacity.mealPrepCapable = true;
    const detail = buildScanDetail(scan, 'facility-123');
    expect(detail.facility_id).toBe('facility-123');
    expect(detail.meal_prep_capable).toBe(true);
    expect(detail.fixtures).toHaveLength(1);
    expect(detail.fixtures[0]).toMatchObject({ id: 'fixture-1', capacity_type: 'refrigerated_storage' });
    expect(detail.simulated_load).toEqual({ cold: [{ foodId: 'milk_crate', units: 2 }] });
  });

  it('marks a fixture excluded via exclusions.fixtureIds, not just detection.excluded', () => {
    const scan = makeScan({ exclusions: { fixtureIds: ['fixture-1'] } });
    const detail = buildScanDetail(scan, 'facility-123');
    expect(detail.fixtures[0].excluded).toBe(true);
  });

  it('reflects capacityType/volume overrides in the audit trail and flags them as manual', () => {
    const scan = makeScan({ overrides: { 'fixture-1': { capacityType: 'dry_storage', estimatedVolumeFt3: 9 } } });
    const detail = buildScanDetail(scan, 'facility-123');
    expect(detail.fixtures[0]).toMatchObject({ capacity_type: 'dry_storage', estimated_volume_ft3: 9, volume_source: 'manual' });
  });

  it('carries the detection volumeSource through when not overridden', () => {
    const scan = makeScan();
    scan.detections[0].volumeSource = 'bbox_scaled';
    const detail = buildScanDetail(scan, 'facility-123');
    expect(detail.fixtures[0].volume_source).toBe('bbox_scaled');
  });
});

describe('postCapacityRecords', () => {
  it('falls back to logging the payload when no baseUrl is configured', async () => {
    const records = buildCapacityRecords(makeScan(), 'facility-123');
    const detail = buildScanDetail(makeScan(), 'facility-123');
    const result = await postCapacityRecords(records, detail, {});
    expect(result.posted).toBe(false);
    expect(result.reason).toBe('no_base_url');
    expect(result.payload.records).toEqual(records);
  });

  it('posts each record to {baseUrl}/api/v1/capacity when a baseUrl is configured', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201 });
    const records = buildCapacityRecords(makeScan(), 'facility-123');
    const detail = buildScanDetail(makeScan(), 'facility-123');
    const result = await postCapacityRecords(records, detail, { baseUrl: 'https://api.example.org', fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(records.length);
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.org/api/v1/capacity', expect.objectContaining({ method: 'POST' }));
    expect(result.posted).toBe(true);
  });

  it('reports partial failure without throwing when the backend rejects a record', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const records = buildCapacityRecords(makeScan(), 'facility-123');
    const detail = buildScanDetail(makeScan(), 'facility-123');
    const result = await postCapacityRecords(records, detail, { baseUrl: 'https://api.example.org', fetchImpl });
    expect(result.posted).toBe(false);
    expect(result.reason).toBe('partial_or_failed');
  });

  it('reports failure without throwing when fetch itself rejects (network error)', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const records = buildCapacityRecords(makeScan(), 'facility-123');
    const detail = buildScanDetail(makeScan(), 'facility-123');
    const result = await postCapacityRecords(records, detail, { baseUrl: 'https://api.example.org', fetchImpl });
    expect(result.posted).toBe(false);
    expect(result.results[0].error).toBe('network down');
  });
});
