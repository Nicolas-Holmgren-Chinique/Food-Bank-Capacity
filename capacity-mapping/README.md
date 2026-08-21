# Capacity Mapping

The agency-side prototype: let a partner agency map what its space can actually
hold, and turn that into a number of people it can feed.

Self-contained. It does not touch the landing page or anything else at the repo
root, and it is not wired into the site yet.

## Run it

```bash
cd capacity-mapping/app
npm install
npm run dev
```

Then open http://localhost:3000. Phone shaped, so it looks best in a narrow
window or with device emulation on.

## The one idea

A Family Box has to be assembled **at a single site** out of both zones,
shelf-stable and produce. So a site's real capacity is the **minimum across
zones, not the sum**.

```
people = min over zones of floor(usable_cuft / cuft_per_box) x 4
```

Everything above that minimum in the other zone is stranded: the space is
physically there and can never be used.

| Agency | Shelf-stable | Produce | Can feed | Limited by |
|---|---:|---:|---:|---|
| Oceanside Community Resource Center | 600 | 68 | **68** | produce |
| All Saint Episcopal, Vista | 212 | 460 | **212** | shelf-stable |
| Apostolic Assembly, Escondido | 408 | 68 | **68** | produce |
| Iglesia Cristiana Vida Nueva | 160 | 104 | **104** | produce |
| Aguilas del Poderoso Dios | 160 | 0 | **0** | produce |

Oceanside has warehouse-grade racking and one break room fridge, so it can feed
600 people worth of shelf-stable and 68 people in total. Aguilas has no cold
storage at all, so it cannot assemble one complete box no matter how much shelf
space it has.

## Units, and why

**Capacity is in cubic feet, not pounds.** Weight does not predict volume: a
case of size 4 diapers is 40 lb and 3.5 cu ft, a case of canned corn is 11 lb
and 0.45 cu ft. And a camera can estimate the size of a cooler but can never
weigh one, so if the scan is the intake path, capacity has to be in a unit the
scan can produce. `item.unit_volume_cuft` bridges volume to the pounds that
food banks report in.

**Only usable cubic feet are ever displayed.** Each storage unit has a
`gross_cuft` and a `usable_pct` fit factor, which covers aisles, air gaps, and
the shelf nobody can reach. The UI shows `gross x usable_pct` and never gross
on its own, so every number on a screen adds up to the total above it.

## Screens

| Route | What it is |
|---|---|
| `/` | Map Capacity. Pick an agency, start. |
| `/agency/[id]/scan` | Camera handoff. **Not built.** This is where the vision model goes. |
| `/agency/[id]/scan/complete` | Assumes the scan ran. Usable space, a check against inventory, then people. |
| `/agency/[id]/scan/fix` | The rep overrides the scan: size, fit factor, or "that is not there". Recounts live. |
| `/agency/[id]/inventory` | The rep corrects the item counts. |
| `/agency/[id]` | The reveal: per-zone bars, the binding zone, stranded space, what one more unit unlocks. |

Auth is out of scope. The agency picker stands in for it.

## Data

Everything is synthetic. Agency names, addresses, service types and
distribution days come from the public San Diego Food Bank partner list so the
network reads as real. Every capacity, item, volume and count was authored by
hand to make the constraint visible.

```bash
python3 data/seed.py         # -> data/carespace.db and app/src/lib/fixture.json
python3 data/export_xlsx.py  # -> data/CareSpace_Synthetic_DB.xlsx
```

Both are dependency-free apart from `openpyxl` for the spreadsheet.
`data/CareSpace_Synthetic_DB.xlsx` is committed, so you can read the whole
dataset without running anything. Start with its **Capacity by zone** and
**Inventory check** sheets, which are the math the app runs.

The app reads `app/src/lib/fixture.json` rather than the database, so there is
no runtime dependency to wire up. `app/src/lib/data.ts` is the only file that
touches data, and it is the seam to swap in real SQLite.

See [`data/README.md`](data/README.md) for the schema tour and
[`docs/build/architecture.md`](docs/build/architecture.md) for the design
decisions.

## What is deliberately not built

- **The scan.** `scan_session` and `scan_detection` are seeded empty and
  waiting. `/scan/complete` assumes it already ran.
- **The allocator.** The Miramar warehouse is not even in the data. It is the
  mother kitchen and belongs to the allocation problem.
- **Any write path.** The fix and inventory screens recompute live in React
  state and spell out what they would write, but nothing persists.
- **Auth.**

## Known soft spots

- `usable_pct` is a per-form-factor assumption, 0.60 to 0.75. It dominates the
  error budget, well ahead of anything to do with packing geometry. That is why
  the fix screen exposes it as a slider: the rep in the room is the only person
  who knows.
- One box template. A senior box or an infant kit has a different zone mix and
  would move the binding zone at several sites.
- Vida Nueva sits at 160 shelf-stable against 104 produce, only a 1.6x gap. It
  is the one site where a sloppy fit estimate could flip which zone binds.
  Every other site has a wide enough margin to survive being badly wrong.
- Estimates should stay biased low. Overestimating capacity ships boxes a site
  cannot store, and that food gets thrown out. Underestimating just moves
  slightly fewer boxes. The costs are not symmetric.
