"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { agencies } from "@/lib/data";

/**
 * Map Capacity.
 *
 * One screen: pick a site, start mapping. Auth is out of scope. Everything
 * else waits until after the scan.
 */
export default function MapCapacity() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = agencies.find((a) => a.id === selectedId) ?? null;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return agencies;
    return agencies.filter((a) =>
      `${a.name} ${a.city} ${a.zip}`.toLowerCase().includes(q)
    );
  }, [query]);

  function choose(id: string) {
    const a = agencies.find((x) => x.id === id)!;
    setSelectedId(id);
    setQuery(a.name);
    setOpen(false);
    inputRef.current?.blur();
  }

  function start() {
    if (selected) router.push(`/agency/${selected.id}/scan`);
  }

  return (
    <main className="flex-1 flex flex-col px-6 py-10">
      <div className="w-10 h-10 rounded-xl bg-accent flex items-center justify-center mb-8">
        <span className="text-white text-base font-bold">C</span>
      </div>

      <h1 className="text-[28px] font-semibold tracking-tight leading-tight">
        Map Capacity
      </h1>
      <p className="text-[14px] text-muted mt-2 leading-relaxed">
        Find out what your site can actually hold.
      </p>

      <div className="mt-8 relative">
        <label
          htmlFor="agency"
          className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted mb-2"
        >
          Agency
        </label>

        <div className="relative">
          <input
            id="agency"
            ref={inputRef}
            value={query}
            placeholder="Select or start typing"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedId(null);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            className="w-full border border-line rounded-xl px-4 py-3.5 pr-10 text-[15px] bg-surface
                       focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15
                       placeholder:text-muted/60"
          />
          <button
            type="button"
            aria-label="Show all agencies"
            onMouseDown={(e) => {
              e.preventDefault();
              setOpen((v) => !v);
              inputRef.current?.focus();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted text-[11px] p-1"
          >
            &#9662;
          </button>
        </div>

        {open && (
          <ul
            className="absolute z-20 left-0 right-0 mt-1.5 bg-surface border border-line rounded-xl
                       shadow-lg max-h-64 overflow-y-auto py-1"
          >
            {matches.length === 0 ? (
              <li className="px-4 py-3 text-[13px] text-muted">
                No site matches that. Adding a new site is not wired up yet.
              </li>
            ) : (
              matches.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(a.id);
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-accent/[0.06] transition-colors"
                  >
                    <div className="text-[14px]">{a.name}</div>
                    <div className="text-[12px] text-muted mt-0.5">
                      {a.city} {a.zip}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        )}

        {selected && (
          <p className="text-[12.5px] text-muted mt-2.5">
            {selected.address}, {selected.city} {selected.zip}
          </p>
        )}
      </div>

      <button
        onClick={start}
        disabled={!selected}
        className="mt-6 w-full rounded-xl py-3.5 text-[15px] font-medium transition-opacity
                   bg-accent text-white hover:opacity-90
                   disabled:bg-black/[0.06] disabled:text-muted disabled:cursor-not-allowed disabled:hover:opacity-100"
      >
        Start mapping
      </button>

      <div className="mt-auto pt-10">
        <p className="text-[11px] text-muted leading-relaxed">
          Prototype. Every site and measurement is synthetic.
        </p>
      </div>
    </main>
  );
}
