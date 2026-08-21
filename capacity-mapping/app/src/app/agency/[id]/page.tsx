import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAgency,
  box,
  kindsForZone,
  boxesUnlockedBy,
  ZONE_STYLE,
  ZONE_EMPTY_COPY,
  toPeople,
  usableCuft,
} from "@/lib/data";
import { TopBar, Badge, SectionLabel } from "@/components/Chrome";
import { CapacityChart } from "@/components/CapacityChart";

export default async function AgencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agency = getAgency(id);
  if (!agency) notFound();

  const binding = agency.zones.find((z) => z.is_binding)!;
  const stranded = agency.zones.reduce((s, z) => s + z.dead_boxes, 0);

  // Cheapest addition to the zone that is actually holding the site back.
  const suggestion = kindsForZone(binding.zone_id)
    .map((k) => ({ kind: k, unlocks: boxesUnlockedBy(agency, k.id) }))
    .filter((s) => s.unlocks > 0 && !s.kind.is_fixed)
    .sort((a, b) => a.kind.typical_cuft - b.kind.typical_cuft)[0];

  return (
    <main className="flex-1 flex flex-col">
      <TopBar back="/" title={agency.name} />

      <div className="px-5 py-4 border-b border-line">
        <div className="text-[12.5px] text-muted">
          {agency.address}, {agency.city} {agency.zip}
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <Badge>{agency.service_type}</Badge>
          {agency.distribution_day && (
            <Badge>
              {agency.frequency}, {agency.distribution_day}
            </Badge>
          )}
        </div>
      </div>

      {/* The headline number. */}
      <div className="px-5 py-6 border-b border-line">
        {agency.boxes_today === 0 ? (
          <>
            <div className="text-[40px] font-semibold leading-none tracking-tight text-[var(--warn)]">
              0
            </div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mt-2.5">
              people you can feed
            </p>
            <p className="text-[13.5px] mt-2.5 leading-relaxed">
              This site has no {binding.label.toLowerCase()} storage at all, so
              it cannot put together a single complete box no matter how much
              shelf space it has.
            </p>
          </>
        ) : (
          <>
            <div className="text-[40px] font-semibold leading-none tracking-tight tnum text-accent">
              {agency.people_fed_today.toLocaleString()}
            </div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted mt-2.5">
              people you can feed
            </p>
          </>
        )}
      </div>

      {/* The chart. */}
      <div className="px-5 py-5 border-b border-line">
        <SectionLabel>What each zone could feed alone</SectionLabel>
        <CapacityChart agency={agency} />
        {stranded > 0 && (
          <div className="mt-4 rounded-lg bg-[var(--warn-bg)] border border-[var(--warn-line)] px-3.5 py-3">
            <p className="text-[13px] leading-relaxed text-[var(--warn)]">
              <span className="font-semibold">
                You have room for {toPeople(stranded).toLocaleString()} more
                people you will never reach.
              </span>{" "}
              The space is there. It cannot be used, because{" "}
              {binding.label.toLowerCase()} runs out first and a box has to be
              assembled whole at one site.
            </p>
          </div>
        )}
        {suggestion && (
          <div className="mt-2.5 rounded-lg bg-[var(--accent-wash)] border border-[var(--accent-tint)] px-3.5 py-3">
            <p className="text-[13px] leading-relaxed text-accent">
              One more {suggestion.kind.label.toLowerCase()} (
              {suggestion.kind.typical_cuft} cu ft) would feed{" "}
              <span className="font-semibold">
                {toPeople(suggestion.unlocks).toLocaleString()} more people
              </span>{" "}
              every week.
            </p>
          </div>
        )}
      </div>

      {/* What the scan found. */}
      <div className="px-5 py-5 border-b border-line">
        <div className="flex items-center justify-between mb-2.5">
          <SectionLabel>Storage on site</SectionLabel>
          <span className="text-[11px] text-muted">
            measured {agency.zones[0].measured_at}
          </span>
        </div>

        {agency.zones.map((z) => {
          const units = agency.storage_units.filter(
            (u) => u.zone_id === z.zone_id
          );
          const zoneCuft = units.reduce((s, u) => s + usableCuft(u), 0);
          return (
            <div key={z.zone_id} className="mb-3.5 last:mb-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className={`w-2 h-2 rounded-full ${ZONE_STYLE[z.zone_id].dot}`}
                />
                <span className="text-[12.5px] font-medium">{z.label}</span>
                <span className="text-[11.5px] text-muted tnum">
                  {zoneCuft > 0 ? `${zoneCuft.toLocaleString()} cu ft` : "none"}
                </span>
              </div>

              {units.length === 0 ? (
                <div className="text-[12.5px] text-[var(--warn)] pl-3.5 py-1">
                  {ZONE_EMPTY_COPY[z.zone_id]}
                </div>
              ) : (
                <ul className="pl-3.5 space-y-1">
                  {units.map((u) => (
                    <li
                      key={u.id}
                      className="flex items-baseline justify-between gap-2 text-[12.5px]"
                    >
                      <span className="truncate">{u.label}</span>
                      <span className="text-muted tnum whitespace-nowrap">
                        {usableCuft(u)} cu ft
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Handoff to the scan. */}
      <div className="px-5 py-5 mt-auto">
        <Link
          href={`/agency/${agency.id}/scan`}
          className="block w-full text-center bg-accent text-white rounded-xl py-3.5 text-[15px] font-medium hover:opacity-90 transition-opacity"
        >
          Scan a room
        </Link>
        <p className="text-[11.5px] text-muted mt-2.5 text-center leading-relaxed">
          Walk the room with your camera. CareSpace finds the storage and sizes
          it.
        </p>
      </div>
    </main>
  );
}
