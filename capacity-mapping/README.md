# Capacity Mapping

The agency-side prototype: let a partner agency map what its space can actually
hold, and turn that into a number of people it can feed.

Self-contained. It does not touch the landing page or anything else at the repo
root, and it is not wired into the site yet.

## Run it

```bash
cd capacity-mapping/app
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

Then open http://localhost:3000. Phone shaped, so it looks best in a narrow
window or with device emulation on.

The key is only needed for the scan. Everything else runs without it.

**Start with "Demo Agency."** It is pinned to the top of the picker with a Demo
badge and exists purely to walk someone through a scan end to end.

## The one idea

A Family Box has to be assembled **at a single site** out of both zones,
shelf-stable and refrigerated. So a site's real capacity is the **minimum
across zones, not the sum**.

```
people = min over zones of floor(usable_cuft / cuft_per_box) x 4
```

Everything above that minimum in the other zone is stranded: the space is
physically there and can never be used.

The box is **80% refrigerated by volume**, because this network is
produce-forward. Two of these agencies are literally "Neighborhood Produce
(25-30lb)" in the source data. One box is 1.45 cu ft refrigerated against
0.37 cu ft shelf-stable.

| Agency | Shelf-stable | Refrigerated | Can feed | Limited by |
|---|---:|---:|---:|---|
| Oceanside Community Resource Center | 1,636 | 32 | **32** | refrigerated |
| Apostolic Assembly, Escondido | 1,112 | 32 | **32** | refrigerated |
| Demo Agency | 780 | 80 | **80** | refrigerated |
| All Saint Episcopal, Vista | 596 | 856 | **596** | shelf-stable |
| Iglesia Cristiana Vida Nueva | 448 | 48 | **48** | refrigerated |
| Aguilas del Poderoso Dios | 448 | 0 | **0** | refrigerated |

Oceanside has warehouse-grade racking and one break room fridge. All Saint runs
the other way: it inherited a restaurant walk-in cooler and ran out of shelving,
so it is the one site in the network where shelf-stable binds. Aguilas has no
cold storage at all, so it cannot assemble one complete box no matter how much
shelf space it has.

## Capacity against what actually went out

`distribution_event` records what each site handed out. The gap against
capacity has three causes with three different owners, and only one of them is
a storage problem:

- **Full and still turning people away.** Ran out of space. The only case
  CareSpace can fix, and the only one the app comments on.
- **Room to spare.** The food did not arrive, or the families did not come.
  Not a storage problem, so the app stays quiet.

`turned_away` is the column that tells them apart.

| Agency | Can feed | Last fed | Turned away |
|---|---:|---:|---:|
| Oceanside | 32 | 32 | **40** |
| Apostolic | 32 | 28 | 12 |
| Demo Agency | 80 | 64 | 0 |
| All Saint | 596 | 412 | 0 |
| Aguilas | 0 | 120 | 0 |

Aguilas is the honest edge case: it fed 120 people while holding zero complete
boxes, because produce arrives the morning of and goes straight out. A naive
utilization metric divides by zero there.

## Units, and why

**Capacity is in cubic feet, not pounds.** Weight does not predict volume: a
case of size 4 diapers is 40 lb and 3.5 cu ft, a case of canned corn is 11 lb
and 0.45 cu ft. And a camera can estimate the size of a cooler but can never
weigh one, so if the scan is the intake path, capacity has to be in a unit the
scan can produce.

Weight is also the wrong lens on the box itself. Oil is 4,010 cal/lb and mixed
produce is 140, a 29x spread, so any ratio computed in pounds is really a ratio
of water content. Item counts fail the other way: one produce box is a single
item at 1.2 cu ft, while six shelf-stable items together are 0.37. Volume is
the only unit the capacity model needs and the only one that behaves.

**Only usable cubic feet are ever displayed.** Each storage unit has a
`gross_cuft` and a `usable_pct` fit factor, covering aisles, air gaps, and the
shelf nobody can reach. The UI shows `gross x usable_pct`, rounded per unit and
then summed, so every column adds up to the total above it.

## Screens

| Route | What it is |
|---|---|
| `/` | Map Capacity. Pick an agency, start. Demo Agency is pinned. |
| `/agency/[id]/scan` | Upload photos of a room, or run the built-in demo set. Calls Claude. |
| `/agency/[id]/scan/complete` | Assumes the scan ran. Usable space, a check against inventory, then people. |
| `/agency/[id]/scan/fix` | The rep overrides the scan: size, fit factor, or "that is not there". Recounts live. |
| `/agency/[id]/inventory` | The rep corrects the item counts. |
| `/agency/[id]` | The reveal: people, last distribution, per-zone bars, what one more unit unlocks. |
| `/data` | The synthetic dataset, downloadable. |

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
dataset without running anything. Start with its **Capacity by zone**,
**Inventory check** and **What went out** sheets, which are the math the app
runs.

The app reads `app/src/lib/fixture.json` rather than the database, so there is
no runtime dependency to wire up. `app/src/lib/data.ts` is the only file that
touches data, and it is the seam to swap in real SQLite.

See [`data/README.md`](data/README.md) for the schema tour and
[`docs/build/architecture.md`](docs/build/architecture.md) for the design
decisions.

## The scan

`/api/detect` sends the photos to Claude in **one call**, because deduplicating
a burst of frames is only possible side by side: the same pair of fridges shows
up in five of the eight demo photos and has to come back as two fridges. The
response is forced through a tool schema, so nothing is parsed defensively.

Photos can be dragged in, or you can run the built-in set in
`public/demo-scan/`. Those are real photos of a real office break room, taken in
one pass the way a rep would: two wide shots, a burst around one pair of
fridges, a wall cabinet, and one frame of tables and chairs that should yield
nothing. The input is fixed; the result is not canned.

Needs `ANTHROPIC_API_KEY`. This is the only part of the app that needs a server.

## No database, anywhere

Capacity, inventory and scan results all live in **sessionStorage**, keyed per
agency. Edits survive moving between screens and vanish when the tab closes,
which is the right lifetime for a demo: it sticks while you present and the
next person gets a clean slate. `data/seed.py` bakes `carespace.db` into
`app/src/lib/fixture.json` at author time, and the app reads the fixture.

`app/src/lib/session.tsx` recomputes every derived number from edited units
using the same round-then-sum the seed does, so the on-screen columns keep
adding up after a correction.

## What is deliberately not built

- **The allocator.** The Miramar warehouse is not even in the data. It is the
  mother kitchen and belongs to the allocation problem.
- **A backend.** The fix and inventory screens name the exact rows a real
  database would write, then write to sessionStorage instead.
- **Auth.**

## Known soft spots

- `usable_pct` is a per-form-factor assumption, 0.60 to 0.75. It dominates the
  error budget, well ahead of anything to do with packing geometry. That is why
  the fix screen exposes it as a slider: the rep in the room is the only person
  who knows.
- Oceanside is 1,636 against 32, a 51x gap. That is the honest output of a
  produce-forward box meeting three pallet racks and one break room fridge, but
  it is a big number to defend. All Saint and Demo Agency are the moderate ones
  to lead with.
- One box template, and its recipe was authored rather than derived from a
  nutrition standard. "80 people" currently has no stated standard behind it.
  A senior box or an infant kit would have a different zone mix and move
  binding zones.
- Estimates should stay biased low. Overestimating capacity ships boxes a site
  cannot store, and that food gets thrown out. Underestimating just moves
  slightly fewer boxes. The costs are not symmetric.
