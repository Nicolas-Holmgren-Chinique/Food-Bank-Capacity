# CareSpace synthetic data

Partner agencies only. The Miramar warehouse is the mother kitchen and belongs
to the allocation problem, not to mapping what a pantry can hold.

Everything in here is synthetic. There is no real inventory, no real capacity
measurement, and no real agency contact behind any number. Agency names,
addresses, service types and distribution days are drawn from the public San
Diego Food Bank partner list so the demo reads as a real network. Every
capacity, item, volume, and count was authored by hand to make the constraint
visible.

## Regenerate

```
python3 data/seed.py
```

Writes `data/carespace.db` (SQLite, no dependencies) and
`app/src/lib/fixture.json` so the UI runs before the database is wired in.

## The one decision everything rests on

**Capacity is measured in cubic feet. Inventory is measured in pounds.**

Food banks report in pounds, so that is how inventory is tracked. But pounds
are the wrong unit for storage, in two ways:

1. Weight does not predict volume. A case of size 4 diapers is 40 lb and
   3.5 cu ft. A case of canned corn is 11 lb and 0.45 cu ft. Nearly a 7x
   density difference for a third of the weight.
2. A camera can estimate the size of a cooler. It cannot estimate weight.
   Since the scan is the intake path, capacity has to be in a unit the scan
   can produce.

`item.unit_volume_cuft` is the bridge between the two. It is the field the
source workbook did not have and the product cannot work without.

## The second decision

**A box is atomic.** A Family Box must be assembled at a single site out of
shelf-stable and produce items. So a site's real capacity is the minimum
across the two zones, not the sum.

There is no frozen zone. Most partner agencies here run out of a fellowship
hall or a storage closet, and a cold chain is the thing they do not have.
Protein in the box is canned for the same reason.

This is the whole product. Every site in the seed data is authored to show a
different version of it:

| Site | Shelf-stable | Produce | Holds | Stranded | Limited by |
|---|---:|---:|---:|---:|---|
| Oceanside Community Resource Center | 150 | 17 | **17** | 133 | produce |
| Apostolic Assembly, Escondido | 102 | 17 | **17** | 85 | produce |
| All Saint Episcopal, Vista | 53 | 115 | **53** | 62 | shelf-stable |
| Iglesia Cristiana Vida Nueva | 40 | 26 | **26** | 14 | produce |
| Aguilas del Poderoso Dios | 40 | 0 | **0** | 40 | produce |

Oceanside has warehouse-grade shelving and one break room fridge, so 133 box
slots are stranded behind a $600 appliance. All Saint runs the other way: it
inherited a walk-in cooler and ran out of shelving. Aguilas has no cold storage
at all, so it cannot hold one complete box regardless of shelf space, which is
the most important row in the table.

## Tables

| Table | What it is |
|---|---|
| `storage_zone` | shelf_stable, produce |
| `storage_unit_kind` | form factors the scan can recognize, with a size prior and a fit factor |
| `agency` | partner agency sites |
| `operator` | agency reps and logistics operators, stands in for auth |
| `storage_unit` | one row per physical thing that holds food. **The scan writes here.** |
| `capacity_snapshot` | dated per site per zone. History, not a mutable column. |
| `item` | catalog with weight and volume per unit |
| `inventory` | what is on hand now |
| `box_template`, `box_line` | the atomic box, defined in fractional cases |
| `scan_session`, `scan_detection` | empty at seed. The AI piece fills these. |

Three views do the arithmetic: `v_current_capacity`, `v_box_zone_demand`,
`v_zone_box_capacity`.

### Why capacity is a snapshot table

Capacity is perishable. A freezer dies, a rack gets loaned out, the fellowship
hall is borrowed for a funeral. The rep standing in the room knows things the
floor plan does not. So `capacity_snapshot` keeps history, the newest
non-superseded row wins, and `source` records whether a number came from a
`scan`, a `manual` entry, or a human `override`. An override always beats a
scan, and `reason` records why the human disagreed.

That column is also the eval fixture. Override rate per zone is the honest read
on whether the scan is any good.

### Why zones with no storage still get a row

A site with no freezer gets a `capacity_snapshot` at zero rather than no row at
all. Zero is a real answer and the most important one in the dataset. Missing
data would let the UI quietly skip it.

## Known gaps

- `scan_session` and `scan_detection` are empty. Nothing has been scanned yet.
- `usable_pct` is a flat assumption per form factor, seeded from
  `storage_unit_kind.usable_default` (0.60 for a walk-in or a household fridge,
  0.75 for wire shelving). Real fit depends on aisle width, stacking rules, and
  how much of the top shelf anyone can actually reach. This is the largest
  source of error in the whole model, larger than any packing geometry.
- Expiration dates are null. Fine for a capacity demo, wrong for allocation,
  because you cannot send two weeks of produce to a site that opens monthly.
- One box template. Real networks run several, and senior boxes and infant kits
  have very different zone mixes.
