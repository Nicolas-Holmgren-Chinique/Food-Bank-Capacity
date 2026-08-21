"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getAgency, zones, ZONE_STYLE } from "@/lib/data";
import { DEMO_PHOTOS, DEMO_DIR } from "@/lib/demoPhotos";
import { useScanSession } from "@/lib/scanSession";
import { TopBar, SectionLabel } from "@/components/Chrome";

/**
 * The intake path, and only that.
 *
 * Photos go up, the scan session gets written, and the existing complete
 * screen does the reveal. Nothing about what was found is shown here, because
 * /scan/complete already says it and saying it twice in two different layouts
 * is how an app stops looking like one app.
 *
 * Live camera hunting will land here too, writing the same session, so
 * everything downstream never learns which source produced a unit.
 */

const MAX_EDGE = 1024;
const THUMB_EDGE = 240;

/** Downscale in the browser so a 12 megapixel phone photo is not the payload. */
function shrinkUrl(url: string, edge: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext("2d");
      if (!ctx) return reject(new Error("No canvas context"));
      ctx.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Could not read that image"));
    img.src = url;
  });
}

type Photo = { name: string; full: string; thumb: string };

/** Same two sizes whether the bytes came from a file picker or from /public. */
async function toPhoto(name: string, url: string): Promise<Photo> {
  const full = await shrinkUrl(url, MAX_EDGE, 0.75);
  const thumb = await shrinkUrl(url, THUMB_EDGE, 0.6);
  return { name, full, thumb };
}

export function ScanUploader({ agencyId }: { agencyId: string }) {
  const agency = getAgency(agencyId)!;
  const router = useRouter();
  const { save } = useScanSession(agencyId);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    const incoming = Array.from(list).filter((f) => f.type.startsWith("image/"));
    try {
      const next = await Promise.all(
        incoming.map(async (f) => {
          const url = URL.createObjectURL(f);
          try {
            return await toPhoto(f.name, url);
          } finally {
            URL.revokeObjectURL(url);
          }
        })
      );
      setPhotos((p) => [...p, ...next].slice(0, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read those files.");
    }
  }

  /** Loads the bundled set into the same tray an upload lands in. */
  async function loadDemo() {
    setLoadingDemo(true);
    setError(null);
    try {
      setPhotos(
        await Promise.all(
          DEMO_PHOTOS.map((p) => toPhoto(p.caption, `${DEMO_DIR}/${p.file}`))
        )
      );
    } catch {
      setError("Could not load the demo photos.");
    } finally {
      setLoadingDemo(false);
    }
  }

  async function detect() {
    if (photos.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: photos.map((p) => p.full) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
      save({
        units: json.units,
        thumbs: photos.map((p) => p.thumb),
        empty_photos: json.empty_photos ?? [],
        notes: json.notes ?? "",
        at: new Date().toISOString(),
      });
      router.push(`/agency/${agency.id}/scan/complete`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col">
      <TopBar back={`/agency/${agency.id}`} title="Scan a room" />

      <div className="px-5 py-4 border-b border-line">
        <p className="text-[13px] leading-relaxed text-muted">
          Add a photo of every place this site keeps food. Wide shots and
          close-ups both help. If you photograph the same fridge four times,
          CareSpace counts it once.
        </p>
      </div>

      <div className="px-5 pt-4 pb-3 border-b border-line">
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

      <div className="px-5 py-5">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />

        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="w-full rounded-xl border-2 border-dashed border-line hover:border-accent
                     py-8 flex flex-col items-center gap-2 transition-colors disabled:opacity-60"
        >
          <span className="w-10 h-10 rounded-full bg-[var(--accent-wash)] flex items-center justify-center text-accent text-lg leading-none">
            +
          </span>
          <span className="text-[13.5px] font-medium">
            {photos.length === 0 ? "Add photos" : "Add more"}
          </span>
          <span className="text-[11.5px] text-muted">
            Up to 20. On a phone this opens the camera.
          </span>
        </button>

        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5 mt-4">
            {photos.map((p, i) => (
              <div key={p.name + i} className="relative aspect-square">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.thumb}
                  alt=""
                  className="w-full h-full object-cover rounded-lg border border-line"
                />
                <span className="absolute bottom-0.5 left-0.5 text-[9px] font-semibold text-white bg-black/55 rounded px-1 tnum">
                  {i + 1}
                </span>
                {!busy && (
                  <button
                    onClick={() => setPhotos((ps) => ps.filter((_, j) => j !== i))}
                    aria-label={`Remove photo ${i + 1}`}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-surface border border-line
                               text-muted text-[11px] leading-none shadow-sm"
                  >
                    &times;
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* The room you can always walk. Same pipeline, fixed input. */}
        {photos.length === 0 && (
          <>
            <div className="flex items-center gap-3 my-4">
              <span className="h-px bg-line flex-1" />
              <span className="text-[11px] text-muted uppercase tracking-[0.08em]">
                or
              </span>
              <span className="h-px bg-line flex-1" />
            </div>

            <div className="flex gap-1">
              {DEMO_PHOTOS.map((p) => (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={p.file}
                  src={`${DEMO_DIR}/${p.file}`}
                  alt={p.caption}
                  loading="lazy"
                  className="flex-1 min-w-0 aspect-square object-cover rounded border border-line"
                />
              ))}
            </div>
            <button
              onClick={loadDemo}
              disabled={loadingDemo}
              className="mt-2.5 w-full rounded-lg border border-line text-[13px] py-2.5 font-medium
                         hover:border-accent hover:text-accent transition-colors disabled:opacity-60"
            >
              {loadingDemo ? "Loading…" : "Use the demo break room"}
            </button>
            <p className="text-[11px] text-muted mt-2 leading-relaxed">
              Eight photos of one office kitchen. Real photos and a real scan of
              them, so only the input is fixed.
            </p>
          </>
        )}

        {error && (
          <div className="mt-4 rounded-lg bg-[var(--warn-bg)] border border-[var(--warn-line)] px-3.5 py-3">
            <p className="text-[12.5px] leading-relaxed text-[var(--warn)]">
              {error}
            </p>
          </div>
        )}
      </div>

      <div className="px-5 pb-5 mt-auto">
        <button
          onClick={detect}
          disabled={photos.length === 0 || busy}
          className="block w-full text-center rounded-xl py-3.5 text-[15px] font-medium transition-opacity
                     bg-accent text-white hover:opacity-90
                     disabled:bg-black/[0.06] disabled:text-muted disabled:hover:opacity-100"
        >
          {busy
            ? `Reading ${photos.length} photo${photos.length === 1 ? "" : "s"}…`
            : "Start scanning"}
        </button>
        {busy ? (
          <p className="text-[11.5px] text-muted mt-2.5 text-center leading-relaxed">
            Looking at all of them together, so the same fridge in three photos
            is one fridge.
          </p>
        ) : (
          // Lands on the same screen a finished scan does, showing what is
          // already on record. Skipping the scan should not mean skipping the
          // inventory check and the item editor that live there.
          <Link
            href={`/agency/${agency.id}/scan/complete`}
            className="block w-full text-center text-[13px] text-accent mt-3.5 font-medium"
          >
            View results
          </Link>
        )}
      </div>
    </main>
  );
}
