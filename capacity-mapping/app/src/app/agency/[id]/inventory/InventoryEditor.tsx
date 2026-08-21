"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  getAgency,
  usableCuft,
  zones,
  ZONE_STYLE,
  type InventoryRow,
} from "@/lib/data";
import { TopBar, SectionLabel } from "@/components/Chrome";

/**
 * Correct the food, the way /scan/fix corrects the space.
 *
 * Note what this does NOT change: people you can feed. That number comes from
 * capacity, not from what happens to be on the shelf today. What it does
 * change is whether the records and the room agree.
 *
 * Nothing is written. The save panel says what it would write instead.
 */
export function InventoryEditor({ agencyId }: { agencyId: string }) {
  const agency = getAgency(agencyId)!;

  const original = useMemo(() => agency.inventory, [agency]);
  const [rows, setRows] = useState<InventoryRow[]>(original);

  function patch(name: string, qty: number) {
    setRows((rs) =>
      rs.map((r) =>
        r.name === name
          ? {
              ...r,
              qty_units: qty,
              total_lb: Math.round(qty * r.unit_weight_lb * 10) / 10,
              total_cuft: Math.round(qty * r.unit_volume_cuft * 100) / 100,
            }
          : r
      )
    );
  }

  const perZone = zones.map((z) => {
    const zoneRows = rows.filter((r) => r.zone_id === z.id);
    const onHand = zoneRows.reduce((s, r) => s + r.qty_units * r.unit_volume_cuft, 0);
    const capacity = agency.storage_units
      .filter((u) => u.zone_id === z.id)
      .reduce((s, u) => s + usableCuft(u), 0);
    return {
      zone: z,
      rows: zoneRows,
      items: zoneRows.reduce((s, r) => s + r.qty_units, 0),
      lb: zoneRows.reduce((s, r) => s + r.qty_units * r.unit_weight_lb, 0),
      onHand,
      capacity,
      over: onHand > capacity,
      pct: capacity ? Math.min(100, (onHand / capacity) * 100) : 0,
    };
  });

  const changed = rows.filter((r) => {
    const o = original.find((x) => x.name === r.name);
    return o && o.qty_units !== r.qty_units;
  });
  const stillOver = perZone.filter((p) => p.over);

  return (
    <main className="flex-1 flex flex-col">
      <TopBar
        back={`/agency/${agency.id}/scan/complete`}
        title="Inventory"
      />

      <div className="px-5 py-4 border-b border-line">
        <p className="text-[13px] leading-relaxed text-muted">
          What this site has on the books right now. Counts are items, and an
          item is a bag or a case, so they are not all the same size.
        </p>
      </div>

      {perZone.map((p) => (
        <div key={p.zone.id} className="px-5 py-5 border-b border-line">
          <div className="flex items-baseline justify-between mb-3">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${ZONE_STYLE[p.zone.id].dot}`}
              />
              <SectionLabel>{p.zone.label}</SectionLabel>
            </div>
            <span
              className={`text-[11.5px] tnum ${
                p.over ? "text-[var(--warn)] font-medium" : "text-muted"
              }`}
            >
              {p.items.toLocaleString()} items &middot; {p.onHand.toFixed(0)} of{" "}
              {p.capacity.toLocaleString()} cu ft
            </span>
          </div>

          <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden mb-4">
            <div
              className={`h-full ${
                p.over ? "bg-[var(--warn)]" : ZONE_STYLE[p.zone.id].bar
              }`}
              style={{ width: `${p.pct}%` }}
            />
          </div>

          {p.rows.length === 0 ? (
            <p className="text-[12.5px] text-muted">
              Nothing on the books for this zone.
            </p>
          ) : (
            <div className="space-y-2.5">
              {p.rows.map((r) => {
                const o = original.find((x) => x.name === r.name)!;
                const edited = o.qty_units !== r.qty_units;
                return (
                  <div
                    key={r.name}
                    className="flex items-center gap-3 text-[12.5px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="text-[11px] text-muted mt-0.5 tnum">
                        {r.unit_description} &middot;{" "}
                        {(r.qty_units * r.unit_volume_cuft).toFixed(1)} cu ft
                        {edited && (
                          <span className="text-accent"> &middot; edited</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() =>
                          patch(r.name, Math.max(0, r.qty_units - 1))
                        }
                        className="w-7 h-7 rounded-lg border border-line text-muted hover:border-accent hover:text-accent leading-none"
                      >
                        &minus;
                      </button>
                      <span className="text-[13px] tnum w-8 text-center">
                        {r.qty_units}
                      </span>
                      <button
                        onClick={() => patch(r.name, r.qty_units + 1)}
                        className="w-7 h-7 rounded-lg border border-line text-muted hover:border-accent hover:text-accent leading-none"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}

      <div className="px-5 py-5 border-b border-line">
        <SectionLabel>What saving does</SectionLabel>
        {changed.length === 0 ? (
          <p className="text-[12.5px] text-muted leading-relaxed">
            Nothing changed yet, so there is nothing to write.
          </p>
        ) : (
          <ul className="text-[12.5px] leading-relaxed space-y-1.5">
            <li>
              Updates <span className="tnum">{changed.length}</span>{" "}
              <code className="text-muted">inventory</code>{" "}
              {changed.length === 1 ? "row" : "rows"}:{" "}
              {changed.map((r) => r.name).join(", ")}.
            </li>
            <li className="text-muted">
              Does not touch capacity. How many people you can feed comes from
              the space, not from what is on the shelf today.
            </li>
          </ul>
        )}
      </div>

      <div className="sticky bottom-0 bg-surface border-t border-line px-5 py-4 mt-auto">
        {stillOver.length > 0 && (
          <p className="text-[12px] text-[var(--warn)] leading-relaxed mb-3">
            {stillOver.map((p) => p.zone.label).join(" and ")} still lists more
            than fits in the space on record.
          </p>
        )}
        <button
          disabled={changed.length === 0}
          className="block w-full text-center rounded-xl py-3.5 text-[15px] font-medium transition-opacity
                     bg-accent text-white hover:opacity-90
                     disabled:bg-black/[0.06] disabled:text-muted disabled:hover:opacity-100"
        >
          Save the counts
        </button>
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setRows(original)}
            className="text-[12.5px] text-muted"
          >
            Reset
          </button>
          <Link
            href={`/agency/${agency.id}/scan/fix`}
            className="text-[12.5px] text-accent font-medium"
          >
            The space is wrong, not the food
          </Link>
        </div>
        <p className="text-[10.5px] text-muted mt-2.5 leading-relaxed">
          Nothing is written. This prototype is read-only.
        </p>
      </div>
    </main>
  );
}
