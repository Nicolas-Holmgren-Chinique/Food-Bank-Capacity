import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAgency,
  kindsForZone,
  boxesUnlockedBy,
  ZONE_ADJ,
  toPeople,
} from "@/lib/data";
import { TopBar, Badge, SectionLabel } from "@/components/Chrome";
import { CapacityChart } from "@/components/CapacityChart";
import { LastDistribution } from "@/components/LastDistribution";

export default async function AgencyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agency = getAgency(id);
  if (!agency) notFound();

  const binding = agency.zones.find((z) => z.is_binding)!;

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
              This site has no {ZONE_ADJ[binding.zone_id]} storage at all, so
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

      <LastDistribution agency={agency} />

      {/* The chart. */}
      <div className="px-5 py-5 border-b border-line">
        <SectionLabel>What each zone could feed alone</SectionLabel>
        <CapacityChart agency={agency} />
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
