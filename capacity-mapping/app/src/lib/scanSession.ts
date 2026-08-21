"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DetectedUnit } from "./detect";
import {
  getAgency,
  storageUnitKinds,
  PEOPLE_PER_BOX,
  type Agency,
  type EditableUnit,
  type StorageUnit,
} from "./data";

/**
 * A scan lives in the tab, not in the database.
 *
 * The prototype is read-only by design, so a scan has to survive a couple of
 * route changes and nothing more. sessionStorage does that, keyed per agency,
 * and it means All Saints keeps rendering straight off the fixture no matter
 * what happens over here.
 */

export type ScanSession = {
  units: DetectedUnit[];
  /** Small jpegs, one per uploaded photo, for the source strip on each card. */
  thumbs: string[];
  empty_photos: number[];
  notes: string;
  at: string;
};

const key = (agencyId: string) => `carespace:scan:${agencyId}`;

export function readSession(agencyId: string): ScanSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(key(agencyId));
    return raw ? (JSON.parse(raw) as ScanSession) : null;
  } catch {
    // Private windows and blocked site data both land here. A scan that
    // cannot be stored is not worth failing the page over.
    return null;
  }
}

export function writeSession(agencyId: string, s: ScanSession) {
  try {
    window.sessionStorage.setItem(key(agencyId), JSON.stringify(s));
  } catch {
    /* quota or blocked storage. The current screen still has it in state. */
  }
}

export function clearSession(agencyId: string) {
  try {
    window.sessionStorage.removeItem(key(agencyId));
  } catch {
    /* nothing to do */
  }
}

/**
 * The site with the scan folded in, and a stable identity while the scan
 * itself does not change.
 *
 * agencyWithScan builds a fresh object every call. Handing that straight to a
 * component means a new object on every render, which silently poisons any
 * downstream useMemo or useEffect that depends on it: the dependency looks
 * different each time, so the effect refires, sets state, renders again, and
 * never settles. Memoising on the session is what stops that, so every caller
 * should use this rather than calling agencyWithScan during render.
 */
export function useAgencyWithScan(agencyId: string) {
  const { session, loaded } = useScanSession(agencyId);
  const agency = useMemo(
    () => agencyWithScan(agencyId, session) ?? getAgency(agencyId),
    [agencyId, session]
  );
  return { agency, session, loaded };
}

/** Reads once on mount, so a server-rendered page and the client agree. */
export function useScanSession(agencyId: string) {
  const [session, setSession] = useState<ScanSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setSession(readSession(agencyId));
    setLoaded(true);
  }, [agencyId]);

  const save = useCallback(
    (s: ScanSession) => {
      writeSession(agencyId, s);
      setSession(s);
    },
    [agencyId]
  );

  const clear = useCallback(() => {
    clearSession(agencyId);
    setSession(null);
  }, [agencyId]);

  return { session, loaded, save, clear };
}

/**
 * A detection, in the shape the rest of the app already speaks.
 *
 * `source` is 'scan' and confidence is kept, so the fix screen can say how
 * sure the model was and the override still supersedes it.
 */
export function detectedToStorageUnit(
  u: DetectedUnit,
  agencyId: string,
  i: number
): StorageUnit {
  const kind = storageUnitKinds.find((k) => k.id === u.kind_id);
  return {
    id: `scan_${agencyId}_${i}`,
    zone_id: u.zone_id,
    kind_id: u.kind_id,
    kind_label: kind?.label ?? u.kind_id,
    label: u.label,
    gross_cuft: u.gross_cuft,
    usable_pct: u.usable_pct,
    source: "scan",
    confidence: u.confidence,
    notes: u.note,
    measured_at: new Date().toISOString().slice(0, 10),
  };
}

export function detectedToEditable(
  u: DetectedUnit,
  agencyId: string,
  i: number
): EditableUnit {
  const kind = storageUnitKinds.find((k) => k.id === u.kind_id);
  return {
    id: `scan_${agencyId}_${i}`,
    zone_id: u.zone_id,
    kind_id: u.kind_id,
    kind_label: kind?.label ?? u.kind_id,
    label: u.label,
    gross_cuft: u.gross_cuft,
    usable_pct: u.usable_pct,
    confidence: u.confidence,
    present: true,
    added: false,
  };
}

/**
 * The site, with the scan folded in.
 *
 * The scan adds to what is already on record rather than replacing it, so the
 * numbers a rep saw before the walk still mean something afterwards. Every
 * derived figure is recomputed here rather than patched, because the binding
 * zone can change and a half-updated agency would lie about which one it is.
 *
 * With no session this returns the fixture object untouched, which is how
 * every site nobody has scanned keeps rendering exactly as before.
 */
export function agencyWithScan(
  agencyId: string,
  session: ScanSession | null
): Agency | undefined {
  const agency = getAgency(agencyId);
  if (!agency || !session || session.units.length === 0) return agency;

  const storage_units: StorageUnit[] = [
    ...agency.storage_units,
    ...session.units.map((u, i) => detectedToStorageUnit(u, agencyId, i)),
  ];

  const perZone = agency.zones.map((z) => {
    const usable_cuft = storage_units
      .filter((u) => u.zone_id === z.zone_id)
      .reduce((s, u) => s + u.gross_cuft * u.usable_pct, 0);
    return {
      ...z,
      usable_cuft,
      boxes_if_alone: Math.floor(usable_cuft / z.cuft_per_box),
    };
  });

  const boxes_today = Math.min(...perZone.map((z) => z.boxes_if_alone));

  return {
    ...agency,
    storage_units,
    boxes_today,
    people_fed_today: boxes_today * PEOPLE_PER_BOX,
    binding_zone: perZone.find((z) => z.boxes_if_alone === boxes_today)!.zone_id,
    zones: perZone.map((z) => ({
      ...z,
      source: "scan" as const,
      is_binding: z.boxes_if_alone === boxes_today,
      dead_boxes: z.boxes_if_alone - boxes_today,
      dead_cuft:
        Math.round((z.boxes_if_alone - boxes_today) * z.cuft_per_box * 10) / 10,
    })),
  };
}
