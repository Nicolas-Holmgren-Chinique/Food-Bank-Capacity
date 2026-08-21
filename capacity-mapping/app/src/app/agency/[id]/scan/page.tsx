import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgency, ZONE_STYLE, zones } from "@/lib/data";
import { TopBar, SectionLabel } from "@/components/Chrome";

/**
 * Handoff point for the AI piece. Not built yet, on purpose.
 *
 * The intended interaction is Google's document scanner: hold the camera up,
 * the app hunts for storage in the live frame, and it captures on its own when
 * it is confident. The person walks the room instead of filling in a form.
 *
 * When this is built it writes to scan_session and scan_detection, and an
 * accepted detection becomes a storage_unit plus a new capacity_snapshot.
 */
export default async function ScanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const agency = getAgency(id);
  if (!agency) notFound();

  return (
    <main className="flex-1 flex flex-col">
      <TopBar back="/" title={agency.name} />

      {/* Viewfinder placeholder. Grows to fill whatever height is left, the way
          a camera screen would. */}
      <div className="relative bg-[#15171a] flex-1 min-h-[380px] flex items-center justify-center">
        <div className="absolute inset-6 border-2 border-white/25 rounded-lg" />
        <div className="absolute inset-6 border-t-2 border-l-2 border-white rounded-tl-lg w-12 h-12" />
        <div className="text-center px-8">
          <p className="text-white/85 text-[14px] font-medium">
            Camera goes here
          </p>
          <p className="text-white/45 text-[12px] mt-1.5 leading-relaxed">
            Point at the room. CareSpace looks for storage and captures each one
            when it is sure.
          </p>
        </div>
        <div className="absolute bottom-5 left-0 right-0 flex justify-center">
          <div className="w-14 h-14 rounded-full border-4 border-white/80" />
        </div>
      </div>

      <div className="px-5 pt-4 pb-3">
        <SectionLabel>What it is looking for</SectionLabel>
        <div className="flex items-center gap-5">
          {zones.map((z) => (
            <div key={z.id} className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${ZONE_STYLE[z.id].dot}`}
              />
              <span className="text-[13px]">{z.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 pb-5">
        <Link
          href={`/agency/${agency.id}/scan/complete`}
          className="block w-full text-center bg-accent text-white rounded-xl py-3.5 text-[15px] font-medium hover:opacity-90 transition-opacity"
        >
          Start scanning
        </Link>
        {/* For anyone who just wants to look, not remeasure. */}
        <Link
          href={`/agency/${agency.id}`}
          className="block w-full text-center text-[13px] text-accent mt-3.5 font-medium"
        >
          View results
        </Link>
      </div>
    </main>
  );
}
