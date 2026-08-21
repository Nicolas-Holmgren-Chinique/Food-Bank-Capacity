/**
 * Copies data/ into public/demo-data/ so the raw material is downloadable
 * from the deployed site.
 *
 * There is no database at runtime: seed.py bakes carespace.db into
 * fixture.json at author time. That is the right call for a demo, but it
 * leaves the actual schema, the workbook, and the source photos with nowhere
 * to be seen. This puts them one URL away instead of on a laptop.
 *
 * Runs on prebuild. Silent no-op when data/ is absent, so a deploy that only
 * carries the app directory still builds.
 */
import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "../../data");
const dest = resolve(here, "../public/demo-data");

try {
  await stat(src);
} catch {
  console.log("sync-demo-data: no ../data, leaving public/demo-data as is");
  process.exit(0);
}

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });
await cp(src, dest, { recursive: true });
console.log(`sync-demo-data: ${src} -> ${dest}`);
