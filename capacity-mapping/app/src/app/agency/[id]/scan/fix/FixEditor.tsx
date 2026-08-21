"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  getAgency,
  peopleFromUnits,
  usableCuft,
  storageUnitKinds,
  zones,
  ZONE_STYLE,
  type EditableUnit,
  type ZoneId,
} from "@/lib/data";
import { TopBar, SectionLabel } from "@/components/Chrome";

/**
 * The correction pass.
 *
 * The scan proposes, the rep decides. Three things can change here: how big a
 * unit is, how much of it can actually be stacked into, and whether it exists
 * at all. Plus anything the scan walked past.
 *
 * Nothing is written. This prototype is read-only, so the save panel spells
 * out what it would write instead of pretending to write it.
 */
export function FixEditor({ agencyId }: { agencyId: string }) {
  const agency = getAgency(agencyId)!;

  const original = useMemo<EditableUnit[]>(
    () =>
      agency.storage_units.map((u) => ({
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
      })),
    [agency]
  );

  const [units, setUnits] = useState<EditableUnit[]>(original);
  const [addingZone, setAddingZone] = useState<ZoneId | null>(null);

  const before = agency.people_fed_today;
  const { people, perZone } = peopleFromUnits(units);
  const delta = people - before;

  function patch(id: string, next: Partial<EditableUnit>) {
    setUnits((us) => us.map((u) => (u.id === id ? { ...u, ...next } : u)));
  }

  function addUnit(kindId: string) {
    const k = storageUnitKinds.find((x) => x.id === kindId)!;
    setUnits((us) => [
      ...us,
      {
        id: `new_${us.length}_${kindId}`,
        zone_id: k.zone_id,
        kind_id: k.id,
        kind_label: k.label,
        label: k.label,
        gross_cuft: k.typical_cuft,
        usable_pct: k.usable_default,
        confidence: null,
        present: true,
        added: true,
      },
    ]);
    setAddingZone(null);
  }

  // What a save would actually write.
  const resized = units.filter((u) => {
    const o = original.find((x) => x.id === u.id);
    return o && u.present && (o.gross_cuft !== u.gross_cuft || o.usable_pct !== u.usable_pct);
  });
  const removed = units.filter((u) => !u.present && !u.added);
  const added = units.filter((u) => u.added && u.present);
  const touchedZones = new Set(
    [...resized, ...removed, ...added].map((u) => u.zone_id)
  );
  const dirty = touchedZones.size > 0;

  return (
    <main className="flex-1 flex flex-col">
      <TopBar
        back={`/agency/${agency.id}/scan/complete`}
        title="Fix what the scan got wrong"
      />

      <div className="px-5 py-4 border-b border-line">
        <p className="text-[13px] leading-relaxed text-muted">
          You were standing in the room. The scan was not. Anything you change
          here becomes the number of record.
        </p>
      </div>

      {zones.map((z) => {
        const zoneUnits = units.filter((u) => u.zone_id === z.id);
        const kinds = storageUnitKinds.filter((k) => k.zone_id === z.id);
        return (
          <div key={z.id} className="px-5 py-5 border-b border-line">
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-center gap-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${ZONE_STYLE[z.id].dot}`}
                />
                <SectionLabel>{z.label}</SectionLabel>
              </div>
              <span className="text-[11.5px] text-muted tnum">
                {perZone[z.id].usable_cuft.toFixed(0)} cu ft usable &middot;{" "}
                {perZone[z.id].people} people
              </span>
            </div>

            {zoneUnits.length === 0 && (
              <p className="text-[12.5px] text-muted mb-3">
                The scan found nothing here.
              </p>
            )}

            <div className="space-y-3">
              {zoneUnits.map((u) => (
                <div
                  key={u.id}
                  className={`rounded-xl border px-3.5 py-3 ${
                    u.present
                      ? "border-line"
                      : "border-line opacity-45 bg-black/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium truncate">
                        {u.label}
                      </div>
                      <div className="text-[11.5px] text-muted mt-0.5">
                        {u.kind_label}
                        {u.added && " · added by you"}
                        {u.confidence !== null &&
                          ` · scan was ${Math.round(u.confidence * 100)}% sure`}
                      </div>
                    </div>
                    <button
                      onClick={() => patch(u.id, { present: !u.present })}
                      className="text-[11.5px] text-muted hover:text-[var(--warn)] shrink-0 underline underline-offset-2"
                    >
                      {u.present ? "not there" : "put back"}
                    </button>
                  </div>

                  {u.present && (
                    <>
                      <div className="flex items-center gap-2 mt-3">
                        <span className="text-[11.5px] text-muted w-14 shrink-0">
                          Size
                        </span>
                        <button
                          onClick={() =>
                            patch(u.id, {
                              gross_cuft: Math.max(2, u.gross_cuft - 2),
                            })
                          }
                          className="w-7 h-7 rounded-lg border border-line text-muted hover:border-accent hover:text-accent leading-none"
                        >
                          &minus;
                        </button>
                        <span className="text-[13px] tnum w-20 text-center">
                          {u.gross_cuft.toFixed(0)} cu ft
                        </span>
                        <button
                          onClick={() =>
                            patch(u.id, { gross_cuft: u.gross_cuft + 2 })
                          }
                          className="w-7 h-7 rounded-lg border border-line text-muted hover:border-accent hover:text-accent leading-none"
                        >
                          +
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-2.5">
                        <span className="text-[11.5px] text-muted w-14 shrink-0">
                          Fit
                        </span>
                        <input
                          type="range"
                          min={30}
                          max={95}
                          step={5}
                          value={Math.round(u.usable_pct * 100)}
                          onChange={(e) =>
                            patch(u.id, {
                              usable_pct: Number(e.target.value) / 100,
                            })
                          }
                          style={{ accentColor: "var(--accent)" }}
                          className="flex-1 h-1"
                        />
                        <span className="text-[13px] tnum w-12 text-right">
                          {Math.round(u.usable_pct * 100)}%
                        </span>
                      </div>
                      <p className="text-[11px] text-muted mt-2 leading-relaxed">
                        How much you can really stack into it, once you take out
                        aisles, air gaps, and the shelf nobody can reach. Comes
                        to{" "}
                        <span className="font-medium text-foreground tnum">
                          {usableCuft(u)} cu ft
                        </span>
                        , which is the number everywhere else.
                      </p>
                    </>
                  )}
                </div>
              ))}
            </div>

            {addingZone === z.id ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {kinds.map((k) => (
                  <button
                    key={k.id}
                    onClick={() => addUnit(k.id)}
                    className="text-[12px] px-2.5 py-1.5 rounded-full border border-line hover:border-accent hover:text-accent"
                  >
                    {k.label}
                    <span className="text-muted"> {k.typical_cuft} cu ft</span>
                  </button>
                ))}
                <button
                  onClick={() => setAddingZone(null)}
                  className="text-[12px] px-2.5 py-1.5 text-muted"
                >
                  cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingZone(z.id)}
                className="mt-3 text-[12.5px] text-accent font-medium"
              >
                + Add {z.label.toLowerCase()} storage the scan missed
              </button>
            )}
          </div>
        );
      })}

      {/* What saving would actually do. */}
      <div className="px-5 py-5 border-b border-line">
        <SectionLabel>What saving does</SectionLabel>
        {!dirty ? (
          <p className="text-[12.5px] text-muted leading-relaxed">
            Nothing changed yet, so there is nothing to write.
          </p>
        ) : (
          <ul className="text-[12.5px] leading-relaxed space-y-1.5">
            {resized.length > 0 && (
              <li>
                Updates <span className="tnum">{resized.length}</span>{" "}
                <code className="text-muted">storage_unit</code>{" "}
                {resized.length === 1 ? "row" : "rows"} where you changed the
                size or the fit.
              </li>
            )}
            {removed.length > 0 && (
              <li>
                Marks <span className="tnum">{removed.length}</span>{" "}
                <code className="text-muted">storage_unit</code>{" "}
                {removed.length === 1 ? "row" : "rows"} inactive. The scan saw
                something that is not there.
              </li>
            )}
            {added.length > 0 && (
              <li>
                Inserts <span className="tnum">{added.length}</span> new{" "}
                <code className="text-muted">storage_unit</code>{" "}
                {added.length === 1 ? "row" : "rows"} that the scan walked past.
              </li>
            )}
            <li>
              Writes <span className="tnum">{touchedZones.size}</span> new{" "}
              <code className="text-muted">capacity_snapshot</code>{" "}
              {touchedZones.size === 1 ? "row" : "rows"} with{" "}
              <code className="text-muted">source = override</code>, superseding
              today&apos;s scan. Your number wins from here on.
            </li>
            <li className="text-muted">
              Keeps the scan&apos;s original guess in{" "}
              <code>scan_detection</code>, so we can measure how far off it was
              instead of quietly forgetting.
            </li>
          </ul>
        )}
      </div>

      {/* Live result. */}
      <div className="sticky bottom-0 bg-surface border-t border-line px-5 py-4 mt-auto">
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-[32px] font-semibold leading-none tnum text-accent">
                {people.toLocaleString()}
              </span>
              {delta !== 0 && (
                <span
                  className={`text-[13px] font-medium tnum ${
                    delta > 0 ? "text-accent" : "text-[var(--warn)]"
                  }`}
                >
                  {delta > 0 ? "+" : ""}
                  {delta}
                </span>
              )}
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mt-1.5">
              people you can feed
            </p>
          </div>
          {delta !== 0 && (
            <p className="text-[11.5px] text-muted text-right leading-relaxed max-w-[45%]">
              was {before.toLocaleString()} before you corrected it
            </p>
          )}
        </div>

        <button
          disabled={!dirty}
          className="block w-full text-center rounded-xl py-3.5 text-[15px] font-medium transition-opacity
                     bg-accent text-white hover:opacity-90
                     disabled:bg-black/[0.06] disabled:text-muted disabled:hover:opacity-100"
        >
          Save my corrections
        </button>
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => setUnits(original)}
            className="text-[12.5px] text-muted"
          >
            Reset
          </button>
          <Link
            href={`/agency/${agency.id}`}
            className="text-[12.5px] text-accent font-medium"
          >
            Skip, this looks right
          </Link>
        </div>
        <p className="text-[10.5px] text-muted mt-2.5 leading-relaxed">
          Nothing is written. This prototype is read-only.
        </p>
      </div>
    </main>
  );
}
