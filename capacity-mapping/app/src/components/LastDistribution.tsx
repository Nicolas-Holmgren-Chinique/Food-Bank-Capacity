import { shortDate, type Agency } from "@/lib/data";

/**
 * Capacity against reality.
 *
 * The gap between what a site can hold and what it handed out has three very
 * different causes, and only one of them is a storage problem:
 *
 *   full and still turning people away  -> ran out of space. Ours to fix,
 *                                          and the only case that speaks up.
 *   room to spare, nobody turned away   -> not enough food arrived, or not
 *                                          enough people came. Not ours, so
 *                                          the app says nothing about it.
 */
export function LastDistribution({ agency }: { agency: Agency }) {
  const last = agency.distributions[0];
  if (!last) return null;

  const capacity = agency.people_fed_today;
  const pct = capacity ? Math.min(100, (last.people_served / capacity) * 100) : 0;
  const capped = last.turned_away > 0 && last.people_served >= capacity;

  return (
    <div className="px-5 py-4 border-b border-line">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Last distribution
        </span>
        <span className="text-[11.5px] text-muted tnum">
          {shortDate(last.distributed_on)}
        </span>
      </div>

      {capacity === 0 ? (
        <p className="text-[13px] leading-relaxed">
          You fed{" "}
          <span className="font-semibold tnum">
            {last.people_served.toLocaleString()} people
          </span>{" "}
          without holding a single complete box.
          {last.notes && (
            <span className="text-muted"> {last.notes}</span>
          )}
        </p>
      ) : (
        <>
          <p className="text-[13px] leading-relaxed mb-2">
            You fed{" "}
            <span className="font-semibold tnum">
              {last.people_served.toLocaleString()}
            </span>{" "}
            of the{" "}
            <span className="tnum">{capacity.toLocaleString()}</span> you have
            room for.
          </p>

          <div className="h-2 rounded-full bg-black/[0.05] overflow-hidden">
            <div
              className={`h-full ${capped ? "bg-[var(--warn)]" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* Only the capacity case gets a line. Coming in under capacity is
              not a storage problem, so the app stays quiet about it. */}
          {capped && (
            <p className="text-[12.5px] leading-relaxed mt-2 text-[var(--warn)]">
              <span className="font-semibold">
                You ran out of space, not food.
              </span>{" "}
              {last.turned_away.toLocaleString()} people were turned away with
              the shelves already full.
            </p>
          )}
        </>
      )}
    </div>
  );
}
