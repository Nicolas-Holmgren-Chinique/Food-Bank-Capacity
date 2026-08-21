import { ZONE_STYLE, toPeople, type Agency } from "@/lib/data";

/**
 * The reveal.
 *
 * Each bar is how many people one zone could feed on its own. The dashed
 * line is the binding zone, which is what the site can actually do. Everything
 * to the right of that line is space that physically exists and can never be
 * used, because a box has to be assembled whole at one site.
 */
export function CapacityChart({ agency }: { agency: Agency }) {
  const max = Math.max(...agency.zones.map((z) => z.boxes_if_alone), 1);
  const holds = agency.boxes_today;
  const linePct = (holds / max) * 100;

  return (
    <div className="relative">
      <div className="space-y-3.5">
        {agency.zones.map((z) => {
          const style = ZONE_STYLE[z.zone_id];
          const totalPct = (z.boxes_if_alone / max) * 100;
          const usablePct = (Math.min(holds, z.boxes_if_alone) / max) * 100;
          return (
            <div key={z.zone_id}>
              <div className="flex items-baseline justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                  <span className="text-[13px] font-medium">{z.label}</span>
                  {z.is_binding && (
                    <span className="text-[11px] font-semibold text-[var(--warn)]">
                      runs out first
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-muted tnum">
                  {toPeople(z.boxes_if_alone).toLocaleString()} people
                </span>
              </div>

              <div className="h-7 rounded-md bg-black/[0.04] overflow-hidden flex">
                <div
                  className={`${style.bar} h-full`}
                  style={{ width: `${usablePct}%` }}
                />
                {z.dead_boxes > 0 && (
                  <div
                    className={`${style.bar} h-full opacity-25`}
                    style={{
                      width: `${totalPct - usablePct}%`,
                      backgroundImage:
                        "repeating-linear-gradient(45deg, rgba(0,0,0,.16) 0 3px, transparent 3px 7px)",
                    }}
                  />
                )}
              </div>

              {z.dead_boxes > 0 && (
                <p className="text-[11px] text-muted mt-1 tnum">
                  room for {toPeople(z.dead_boxes).toLocaleString()} more you cannot reach
                  <span className="opacity-60">
                    {" "}
                    ({z.dead_cuft.toLocaleString()} cu ft)
                  </span>
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* The binding line, drawn across every bar. */}
      {holds > 0 && (
        <div
          className="absolute top-0 bottom-0 border-l-2 border-dashed border-[var(--warn)]/70 pointer-events-none"
          style={{ left: `${linePct}%` }}
        >
          <span className="absolute -top-0.5 left-1.5 text-[10px] font-semibold text-[var(--warn)] whitespace-nowrap bg-surface px-1 rounded">
            {toPeople(holds).toLocaleString()} people
          </span>
        </div>
      )}
    </div>
  );
}
