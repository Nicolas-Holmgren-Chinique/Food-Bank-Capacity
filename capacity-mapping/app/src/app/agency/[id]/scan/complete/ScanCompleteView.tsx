"use client";

import Link from "next/link";
import {
  getAgency,
  usableCuft,
  ZONE_STYLE,
  ZONE_EMPTY_COPY,
  ZONE_ADJ,
  zones,
} from "@/lib/data";
import { useAgencyWithScan } from "@/lib/scanSession";
import { TopBar, SectionLabel } from "@/components/Chrome";

/**
 * The after.
 *
 * Three things, in this order: what the scan saw, whether it squares with the
 * inventory already on record, and how many people that comes to.
 *
 * Reads the scan session when there is one and the fixture when there is not,
 * so this screen works whether or not anyone uploaded a photo.
 */
export function ScanCompleteView({ agencyId }: { agencyId: string }) {
  const { agency: merged, session, loaded } = useAgencyWithScan(agencyId);
  const agency = merged ?? getAgency(agencyId)!;

  const found = agency.storage_units;
  const scanned = session?.units.length ?? 0;

  // How many photos each scanned unit was pieced together from. Ids match the
  // ones detectedToStorageUnit assigns, so this is a lookup, not a guess.
  const photoCount: Record<string, number> = Object.fromEntries(
    (session?.units ?? []).map((u, i) => [
      `scan_${agencyId}_${i}`,
      u.appears_in.length,
    ])
  );

  // Does the food already on the books fit in the space we just measured?
  const check = zones.map((z) => {
    const onHand = agency.inventory
      .filter((r) => r.zone_id === z.id)
      .reduce((s, r) => s + r.total_cuft, 0);
    const items = agency.inventory
      .filter((r) => r.zone_id === z.id)
      .reduce((s, r) => s + r.qty_units, 0);
    // Summed from the same per-unit numbers listed above, so the column adds
    // up to this on screen.
    const capacity = found
      .filter((u) => u.zone_id === z.id)
      .reduce((sum, u) => sum + usableCuft(u), 0);
    return {
      zone: z,
      onHand,
      items,
      capacity,
      over: onHand > capacity,
      pct: capacity ? Math.min(100, (onHand / capacity) * 100) : 0,
    };
  });
  const mismatch = check.filter((c) => c.over);
  const people = agency.people_fed_today;

  return (
    <main className="flex-1 flex flex-col">
      <TopBar back={`/agency/${agency.id}/scan`} title="Scan complete" />

      <div className="px-5 py-4 border-b border-line flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
          <span className="text-accent text-base leading-none">&#10003;</span>
        </div>
        <div>
          <p className="text-[13.5px] leading-snug font-medium">
            {found.length} storage {found.length === 1 ? "unit" : "units"} on
            record
            {scanned > 0 && (
              <span className="text-muted font-normal">
                {" "}
                &middot; {scanned} from this scan
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
            {check.map((c) => (
              <span
                key={c.zone.id}
                className="flex items-baseline gap-1.5 text-[12px]"
              >
                <span
                  className={`w-2 h-2 rounded-full self-center ${
                    ZONE_STYLE[c.zone.id].dot
                  }`}
                />
                <span className="text-muted">{c.zone.label}</span>
                <span className="font-semibold tnum">
                  {c.capacity.toLocaleString()} cu ft
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* What it found, already derated to what you can stack into. */}
      <div className="px-5 py-5 border-b border-line">
        <SectionLabel>Usable space</SectionLabel>
        {zones.map((z) => {
          const units = found.filter((u) => u.zone_id === z.id);
          return (
            <div key={z.id} className="mb-5 last:mb-0">
              <div className="flex items-center gap-1.5 mb-2">
                <span
                  className={`w-2 h-2 rounded-full ${ZONE_STYLE[z.id].dot}`}
                />
                <span className="text-[12.5px] font-medium">{z.label}</span>
              </div>
              {units.length === 0 ? (
                <p className="ml-3.5 text-[12px] text-muted">
                  {ZONE_EMPTY_COPY[z.id]}
                </p>
              ) : (
                <ul className="ml-3.5 space-y-1">
                  {units.map((u) => (
                    <li key={u.id}>
                      <Link
                        href={`/agency/${agency.id}/scan/fix`}
                        className="flex items-baseline justify-between gap-3 text-[12.5px] text-muted
                                   -mx-1.5 px-1.5 py-0.5 rounded hover:bg-accent/[0.06] hover:text-foreground"
                      >
                        <span className="truncate">
                          {u.label}
                          <span className="opacity-70"> &middot; {u.kind_label}</span>
                        </span>
                        {/* Outside the truncating span, or a long label eats
                            the one piece of evidence that the dedupe happened. */}
                        <span className="flex items-baseline gap-2 whitespace-nowrap shrink-0">
                          {photoCount[u.id] > 1 && (
                            <span className="opacity-70 tnum">
                              {photoCount[u.id]} photos
                            </span>
                          )}
                          <span className="tnum">{usableCuft(u)} cu ft</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

      </div>

      {/* Does it square with what is already on the books? */}
      <div className="px-5 py-5 border-b border-line">
        <SectionLabel>Does this match your records?</SectionLabel>

        <div className="space-y-3.5">
          {check.map((c) => (
            <div key={c.zone.id}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      ZONE_STYLE[c.zone.id].dot
                    }`}
                  />
                  <span className="text-[12.5px] font-medium">
                    {c.zone.label}
                  </span>
                </div>
                <span className="text-[11.5px] text-muted tnum">
                  {c.items.toLocaleString()} items using{" "}
                  {c.onHand.toFixed(0)} of {c.capacity.toLocaleString()} cu ft
                </span>
              </div>
              <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
                <div
                  className={`h-full ${
                    c.over ? "bg-[var(--warn)]" : ZONE_STYLE[c.zone.id].bar
                  }`}
                  style={{ width: `${c.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        {mismatch.length > 0 && (
          <div className="mt-3.5 rounded-lg bg-[var(--warn-bg)] border border-[var(--warn-line)] px-3.5 py-3">
            <p className="text-[12.5px] leading-relaxed text-[var(--warn)]">
              <span className="font-semibold">This does not add up.</span> Your
              records list{" "}
              {mismatch
                .map(
                  (c) =>
                    `${c.onHand.toFixed(0)} cu ft of ${
                      ZONE_ADJ[c.zone.id]
                    } goods against ${c.capacity.toLocaleString()} cu ft of space`
                )
                .join(", and ")}
              . Either there is storage we missed, or the inventory is out of
              date.
            </p>
          </div>
        )}

        <Link
          href={`/agency/${agency.id}/inventory`}
          className="block text-[13px] text-accent font-medium mt-4"
        >
          Review the items
        </Link>
      </div>

      {/* The number. */}
      <div className="px-5 py-7 border-b border-line text-center">
        {people === 0 ? (
          <>
            <div className="text-[52px] font-semibold leading-none tracking-tight text-[var(--warn)]">
              0
            </div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted mt-3">
              people you can feed
            </p>
            <p className="text-[13px] mt-3 leading-relaxed">
              This site has no{" "}
              {ZONE_ADJ[agency.zones.find((z) => z.is_binding)!.zone_id]}{" "}
              storage, so it cannot put together a single complete box.
            </p>
          </>
        ) : (
          <>
            <div className="text-[52px] font-semibold leading-none tracking-tight tnum text-accent">
              {people.toLocaleString()}
            </div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-muted mt-3">
              people you can feed
            </p>
          </>
        )}
        <p className="text-[11px] text-muted mt-4 leading-relaxed">
          Counts only space you can actually stack into, not aisles or the shelf
          nobody can reach.
        </p>
      </div>

      <div className="px-5 py-6 mt-auto">
        <Link
          href={`/agency/${agency.id}`}
          className="block w-full text-center bg-accent text-white rounded-xl py-4 text-[16px] font-medium hover:opacity-90 transition-opacity"
        >
          {people === 0
            ? "See what would change that"
            : "See what limits this site"}
        </Link>
        <Link
          href={`/agency/${agency.id}/scan/fix`}
          className="block w-full text-center text-[13px] text-accent mt-3.5 font-medium"
        >
          Something looks wrong, let me fix it
        </Link>
        {/* Keeps the first paint from flashing pre-scan numbers. */}
        {!loaded && <span className="sr-only">Loading scan</span>}
      </div>
    </main>
  );
}
