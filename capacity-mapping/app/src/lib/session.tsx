"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  agencies,
  getAgency,
  usableCuft,
  zoneDemand,
  zones,
  toPeople,
  type Agency,
  type EditableUnit,
  type InventoryRow,
  type ZoneId,
} from "./data";

/**
 * Demo-session state, with no database anywhere.
 *
 * The fixture is the baseline and never changes. Anything a rep edits during a
 * demo is layered on top and kept in sessionStorage, so it survives moving
 * between screens and disappears when the tab closes. That is exactly the
 * lifetime a demo wants: edits stick while you are presenting, and the next
 * person gets a clean slate without anyone having to remember to reset.
 *
 * Because it is all client side, the app has no server dependency and can be
 * deployed as a static export.
 */

const KEY = "carespace.session.v1";

type Override = {
  units?: EditableUnit[];
  inventory?: InventoryRow[];
};

type Overrides = Record<string, Override>;

type Ctx = {
  overrides: Overrides;
  saveUnits: (agencyId: string, units: EditableUnit[]) => void;
  saveInventory: (agencyId: string, inventory: InventoryRow[]) => void;
  resetAgency: (agencyId: string) => void;
  resetAll: () => void;
  editedIds: string[];
  ready: boolean;
};

const SessionContext = createContext<Ctx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});
  // Guards the first paint: server-rendered HTML has no session, so we hold
  // the baseline until the browser has read sessionStorage.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) setOverrides(JSON.parse(raw));
    } catch {
      // private mode, disabled storage: fall back to in-memory only
    }
    setReady(true);
  }, []);

  const persist = useCallback((next: Overrides) => {
    setOverrides(next);
    try {
      sessionStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* in-memory only */
    }
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      overrides,
      ready,
      editedIds: Object.keys(overrides),
      saveUnits: (id, units) =>
        persist({ ...overrides, [id]: { ...overrides[id], units } }),
      saveInventory: (id, inventory) =>
        persist({ ...overrides, [id]: { ...overrides[id], inventory } }),
      resetAgency: (id) => {
        const next = { ...overrides };
        delete next[id];
        persist(next);
      },
      resetAll: () => persist({}),
    }),
    [overrides, ready, persist]
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}

/** Storage units in the editable shape, which is what overrides are stored in. */
export function toEditable(a: Agency): EditableUnit[] {
  return a.storage_units.map((u) => ({
    id: u.id,
    zone_id: u.zone_id,
    kind_id: u.kind_id,
    kind_label: u.kind_label,
    label: u.label,
    gross_cuft: u.gross_cuft,
    usable_pct: u.usable_pct,
    confidence: u.confidence,
    present: true,
    added: false,
  }));
}

/**
 * Rebuild every derived number from a set of storage units.
 *
 * Matches the seed exactly: round each unit, then sum. If this drifted from
 * data/seed.py the on-screen columns would stop adding up after an edit.
 */
export function deriveAgency(base: Agency, ov: Override | undefined): Agency {
  if (!ov?.units && !ov?.inventory) return base;

  const units = ov.units ?? toEditable(base);
  const live = units.filter((u) => u.present);

  const perZone = {} as Record<ZoneId, number>;
  for (const z of zones) {
    perZone[z.id] = live
      .filter((u) => u.zone_id === z.id)
      .reduce((s, u) => s + usableCuft(u), 0);
  }

  const zoneRows = base.zones.map((z) => ({
    ...z,
    usable_cuft: perZone[z.zone_id],
    boxes_if_alone: Math.floor(perZone[z.zone_id] / zoneDemand[z.zone_id]),
  }));
  const boxes = Math.min(...zoneRows.map((z) => z.boxes_if_alone));
  const bindingId = zoneRows.find((z) => z.boxes_if_alone === boxes)!.zone_id;

  return {
    ...base,
    zones: zoneRows.map((z) => ({
      ...z,
      is_binding: z.zone_id === bindingId,
      dead_boxes: z.boxes_if_alone - boxes,
      dead_cuft:
        Math.round((z.boxes_if_alone - boxes) * z.cuft_per_box * 10) / 10,
    })),
    binding_zone: bindingId,
    boxes_today: boxes,
    people_fed_today: toPeople(boxes),
    storage_units: live.map((u) => ({
      id: u.id,
      zone_id: u.zone_id,
      kind_id: u.kind_id,
      kind_label: u.kind_label,
      label: u.label,
      gross_cuft: u.gross_cuft,
      usable_pct: u.usable_pct,
      source: u.added ? ("manual" as const) : ("scan" as const),
      confidence: u.confidence,
      notes: null,
      measured_at: base.storage_units[0]?.measured_at ?? "",
    })),
    inventory: ov.inventory ?? base.inventory,
  };
}

/** The agency as this session sees it. Edited if anything was saved for it. */
export function useAgency(id: string): { agency?: Agency; edited: boolean } {
  const { overrides, ready } = useSession();
  const base = getAgency(id);
  return useMemo(() => {
    if (!base) return { agency: undefined, edited: false };
    if (!ready) return { agency: base, edited: false };
    return { agency: deriveAgency(base, overrides[id]), edited: !!overrides[id] };
  }, [base, overrides, id, ready]);
}

export function useAgencyList(): Agency[] {
  const { overrides, ready } = useSession();
  return useMemo(
    () =>
      ready
        ? agencies.map((a) => deriveAgency(a, overrides[a.id]))
        : agencies,
    [overrides, ready]
  );
}
