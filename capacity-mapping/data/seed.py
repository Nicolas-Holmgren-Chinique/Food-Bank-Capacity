#!/usr/bin/env python3
"""
Build the CareSpace synthetic database.

  python3 data/seed.py

Writes:
  data/carespace.db          SQLite, schema from data/schema.sql
  app/src/lib/fixture.json   same data as JSON so the UI runs before the DB is wired

Two zones: shelf-stable and refrigerated. No frozen. Most partner agencies in this
network run out of a fellowship hall or a storage closet, and a cold chain is
the thing they do not have.

Partner agencies only. The Miramar warehouse is the mother kitchen and belongs
to the allocation problem, not to mapping what a pantry can hold.

Everything here is synthetic and authored for the demo. Agency names and
addresses are drawn from the public San Diego Food Bank partner list. Every
capacity, item, volume, and count below was written by hand to make the
constraint visible. See data/README.md.
"""

import json
import os
import sqlite3
import uuid

TODAY = "2026-08-21"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "carespace.db")
SCHEMA_PATH = os.path.join(ROOT, "data", "schema.sql")
FIXTURE_PATH = os.path.join(ROOT, "app", "src", "lib", "fixture.json")


def rid(prefix):
    return f"{prefix}_{uuid.uuid4().hex[:8]}"


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------

ZONES = [
    ("shelf_stable", "Shelf-stable", 50, 80, 1),
    ("refrigerated", "Refrigerated Goods", 33, 40, 2),
]

# typical_cuft is the prior the scan falls back on when it recognizes the form
# factor but cannot size it confidently.
# usable_default is the fit factor: how much of the box you can actually stack
# into once you account for aisles, air gaps, and the shelf nobody can reach.
KINDS = [
    ("pallet_rack",        "Pallet rack bay",    "shelf_stable",  64.0, 0.70, 0),
    ("wire_shelving",      "Wire shelving unit", "shelf_stable",  18.0, 0.75, 0),
    ("pantry_closet",      "Pantry closet",      "shelf_stable",  45.0, 0.70, 1),
    ("floor_stack",        "Floor staging area", "shelf_stable",  30.0, 0.60, 0),
    ("reach_in_cooler",    "Reach-in cooler",    "refrigerated",       24.0, 0.75, 0),
    ("walk_in_cooler",     "Walk-in cooler",     "refrigerated",      120.0, 0.65, 1),
    ("residential_fridge", "Residential fridge", "refrigerated",       20.0, 0.60, 0),
]

# ---------------------------------------------------------------------------
# Item catalog. unit_volume_cuft is the field that makes the whole product work.
# Note how badly weight predicts volume: a case of diapers is 40 lb / 3.5 cuft,
# a case of canned corn is 11 lb / 0.45 cuft.
# ---------------------------------------------------------------------------

ITEMS = [
    # id, name, category, zone, unit_description, lb, cuft
    ("rice_white",    "White Rice",             "Grains/Staples",  "shelf_stable", "25 lb bag",           25.0, 0.55),
    ("beans_pinto",   "Dried Pinto Beans",      "Grains/Staples",  "shelf_stable", "20 lb bag",           20.0, 0.45),
    ("oats",          "Rolled Oats",            "Grains/Staples",  "shelf_stable", "10 lb bag",           10.0, 0.35),
    ("pasta_spag",    "Spaghetti Pasta",        "Grains/Staples",  "shelf_stable", "case of 24 (16oz)",   24.0, 0.90),
    ("cereal",        "Cereal (Assorted)",      "Grains/Staples",  "shelf_stable", "case of 12",          15.0, 1.60),
    ("cn_blackbean",  "Canned Black Beans",     "Canned Goods",    "shelf_stable", "case of 12 (15oz)",   11.3, 0.45),
    ("cn_corn",       "Canned Corn",            "Canned Goods",    "shelf_stable", "case of 12 (15oz)",   11.3, 0.45),
    ("cn_tomato",     "Canned Diced Tomatoes",  "Canned Goods",    "shelf_stable", "case of 12 (14.5oz)", 11.0, 0.45),
    ("cn_tuna",       "Canned Tuna",            "Canned Goods",    "shelf_stable", "case of 24 (5oz)",     8.0, 0.35),
    ("cn_chicken",    "Canned Chicken",         "Canned Goods",    "shelf_stable", "case of 12 (12.5oz)", 10.5, 0.42),
    ("peanut_butter", "Peanut Butter",          "Canned Goods",    "shelf_stable", "case of 12 (18oz)",   14.0, 0.55),
    ("veg_oil",       "Vegetable Oil",          "Canned Goods",    "shelf_stable", "case of 6 (48oz)",    20.0, 0.55),
    ("water",         "Bottled Water",          "Beverages",       "shelf_stable", "case of 24 (16.9oz)", 28.0, 0.75),
    ("diapers_4",     "Diapers (Size 4)",       "Household/Other", "shelf_stable", "case of 132",         40.0, 3.50),
    ("pads",          "Period Supplies (Pads)", "Household/Other", "shelf_stable", "case of 250",         18.0, 1.50),

    ("produce_box",   "Mixed Produce Box",      "Produce", "refrigerated", "25-30 lb box", 27.0, 1.20),
    ("apples",        "Fresh Apples",           "Produce", "refrigerated", "30 lb case",   30.0, 1.15),
    ("oranges",       "Fresh Oranges",          "Produce", "refrigerated", "30 lb case",   30.0, 1.15),
    ("carrots",       "Fresh Carrots",          "Produce", "refrigerated", "25 lb bag",    25.0, 0.95),
    ("potatoes",      "Fresh Potatoes",         "Produce", "refrigerated", "30 lb bag",    30.0, 1.05),
    ("onions",        "Fresh Onions",           "Produce", "refrigerated", "25 lb bag",    25.0, 0.90),
    ("salad",         "Bagged Salad Mix",       "Produce", "refrigerated", "case of 4 lb",  4.0, 0.60),
]

# ---------------------------------------------------------------------------
# The box. Quantities are fractions of a case, because a family gets consumer
# units out of a bulk case. consumer_qty is what the label says.
# Protein is canned, since there is no cold chain for meat.
# ---------------------------------------------------------------------------

BOX = {
    "id": "family_box",
    "name": "Family Box",
    "feeds_people": 4,
    "feeds_days": 7,
    "description": "One week of balanced meals for a household of four. Must be assembled at a single site.",
}

BOX_LINES = [
    # item, qty_units (fraction of a bulk unit), consumer_qty
    # Refrigerated first, because this network is produce-forward: two of these
    # agencies are literally "Neighborhood Produce (25-30lb)" in the source
    # data. Comes to 80% produce by volume, which is the only ratio the
    # capacity model cares about.
    ("produce_box",   1.000, "1 produce box, 25-30 lb"),
    ("potatoes",      0.100, "3 lb potatoes"),
    ("carrots",       0.080, "2 lb carrots"),
    ("onions",        0.080, "2 lb onions"),

    ("rice_white",    0.200, "5 lb rice"),
    ("cn_blackbean",  0.170, "2 cans black beans"),
    ("cn_chicken",    0.170, "2 cans chicken"),
    ("cn_corn",       0.080, "1 can corn"),
    ("peanut_butter", 0.080, "1 jar peanut butter"),
    ("pasta_spag",    0.040, "1 lb pasta"),
]

# ---------------------------------------------------------------------------
# Sites. Storage units are authored so the binding zone differs by site.
# (kind_id, label, gross_cuft, source, confidence, measured_at)
# usable_pct comes from the kind's default.
# ---------------------------------------------------------------------------

AGENCIES = [
    {
        # Obvious placeholder name so it is unmistakable in the picker.
        "id": "demo_agency",
        "name": "Demo Agency",
        "address": "100 Example Street", "city": "San Diego", "zip": "92101",
        "service_type": "Neighborhood Distribution",
        "food_category": "Nonperishable Dry Goods + Produce",
        "eligibility": "Open to All", "distribution_day": "Friday", "frequency": "Weekly",
        "start_time": "10:00 am", "end_time": "2:00 pm",
        "walkup": 1, "drivethru": 1, "diapers_period_supplies": 0,
        "weekend_availability": 0, "is_hub": 0, "is_demo": 1,
        "story": "Stand-in site for walking through a scan end to end.",
        "units": [
            ("pallet_rack",        "Pallet rack, bay 1",      64.0, "scan", 0.93, TODAY),
            ("wire_shelving",      "Shelving, back room",     18.0, "scan", 0.90, TODAY),
            ("wire_shelving",      "Shelving, front room",    18.0, "scan", 0.86, TODAY),
            ("reach_in_cooler",    "Reach-in cooler",         24.0, "scan", 0.91, TODAY),
            ("residential_fridge", "Kitchen fridge",          20.0, "scan", 0.84, TODAY),
        ],
        "inventory": [
            ("rice_white", 20), ("beans_pinto", 12), ("pasta_spag", 8),
            ("cn_corn", 20), ("cn_blackbean", 16), ("cn_chicken", 12),
            ("peanut_butter", 6),
            ("produce_box", 12), ("carrots", 4), ("potatoes", 2),
        ],
    },
    {
        "id": "oceanside_crc",
        "name": "Oceanside Community Resource Center",
        "address": "605 South Coast Highway", "city": "Oceanside", "zip": "92054",
        "service_type": "Food To Nonprofit",
        "food_category": "Nonperishable Dry Goods + Produce",
        "eligibility": "Open to All", "distribution_day": "Tuesday", "frequency": "Weekly",
        "start_time": "9:00 am", "end_time": "1:00 pm",
        "walkup": 1, "drivethru": 1, "diapers_period_supplies": 1,
        "weekend_availability": 0, "is_hub": 0, "is_demo": 0,
        "story": "Warehouse-grade shelving, one break room fridge. The cheapest fix in the network is here.",
        "units": [
            ("pallet_rack",        "Pallet rack, bay 1",  64.0, "scan", 0.92, TODAY),
            ("pallet_rack",        "Pallet rack, bay 2",  64.0, "scan", 0.92, TODAY),
            ("pallet_rack",        "Pallet rack, bay 3",  64.0, "scan", 0.90, TODAY),
            ("floor_stack",        "Floor staging, dock", 30.0, "scan", 0.68, TODAY),
            ("residential_fridge", "Break room fridge",   20.0, "scan", 0.81, TODAY),
        ],
        "inventory": [
            ("rice_white", 24), ("beans_pinto", 20), ("pasta_spag", 14),
            ("cn_corn", 30), ("cn_tuna", 18), ("cn_chicken", 16), ("water", 28),
            ("diapers_4", 6),
            ("produce_box", 5), ("potatoes", 1),
        ],
    },
    {
        "id": "apostolic_escondido",
        "name": "Apostolic Assembly Church",
        "address": "1717 East Lincoln Avenue", "city": "Escondido", "zip": "92027",
        "service_type": "Neighborhood Distribution",
        "food_category": "Neighborhood Produce (25-30lb)",
        "eligibility": None, "distribution_day": "Saturday", "frequency": "Monthly",
        "start_time": "9:30 am", "end_time": "10:30 am",
        "walkup": 0, "drivethru": 1, "diapers_period_supplies": 1,
        "weekend_availability": 1, "is_hub": 0, "is_demo": 0,
        "story": "A full pallet rack held back by the kitchen fridge.",
        "units": [
            ("pallet_rack",        "Pallet rack, bay 1",      64.0, "scan", 0.91, TODAY),
            ("pallet_rack",        "Pallet rack, bay 2",      64.0, "scan", 0.91, TODAY),
            ("wire_shelving",      "Shelving, supply closet", 18.0, "scan", 0.77, TODAY),
            ("residential_fridge", "Kitchen fridge",          20.0, "scan", 0.85, TODAY),
        ],
        "inventory": [
            ("rice_white", 10), ("cn_corn", 16), ("cn_tomato", 12),
            ("pasta_spag", 8), ("cn_chicken", 10), ("cereal", 6),
            ("diapers_4", 18), ("pads", 8),
            ("produce_box", 8),
        ],
    },
    {
        "id": "all_saint_vista",
        "name": "All Saint Episcopal Church",
        "address": "651 Eucalyptus Avenue", "city": "Vista", "zip": "92084",
        "service_type": "Food To Nonprofit",
        "food_category": "Nonperishable Dry Goods + Produce",
        "eligibility": "Open to All", "distribution_day": "Saturday", "frequency": "Monthly",
        "start_time": "11:00 am", "end_time": "12:00 pm",
        "walkup": 0, "drivethru": 0, "diapers_period_supplies": 0,
        "weekend_availability": 1, "is_hub": 0, "is_demo": 0,
        "story": "Inherited a walk-in cooler from a closed restaurant. Most of it sits empty, because the box also needs shelf space.",
        "units": [
            ("wire_shelving",  "Shelving, fellowship hall north wall",  18.0, "scan", 0.88, TODAY),
            ("wire_shelving",  "Shelving, fellowship hall south wall",  18.0, "scan", 0.88, TODAY),
            ("wire_shelving",  "Shelving, hallway",                     18.0, "scan", 0.81, TODAY),
            ("wire_shelving",  "Shelving, kitchen pantry",              18.0, "scan", 0.79, TODAY),
            ("walk_in_cooler", "Walk-in cooler, kitchen",              480.0, "scan", 0.92, TODAY),
        ],
        "inventory": [
            ("rice_white", 14), ("beans_pinto", 10), ("pasta_spag", 8),
            ("cereal", 4), ("cn_blackbean", 12), ("cn_corn", 10),
            ("cn_chicken", 6), ("peanut_butter", 4),
            ("produce_box", 22), ("carrots", 6), ("apples", 5),
        ],
    },
    {
        "id": "vida_nueva_cv",
        "name": "Iglesia Cristiana Vida Nueva",
        "address": "1240 Third Avenue", "city": "Chula Vista", "zip": "91911",
        "service_type": "Neighborhood Distribution",
        "food_category": "Nonperishable Dry Goods + Produce",
        "eligibility": "Open to All", "distribution_day": "Wednesday", "frequency": "Weekly",
        "start_time": "4:00 pm", "end_time": "6:00 pm",
        "walkup": 1, "drivethru": 0, "diapers_period_supplies": 0,
        "weekend_availability": 0, "is_hub": 0, "is_demo": 0,
        "story": "The most balanced site in the network. Little stranded space either way.",
        "units": [
            ("wire_shelving",   "Shelving, pantry room", 18.0, "scan", 0.93, TODAY),
            ("wire_shelving",   "Shelving, pantry room", 18.0, "scan", 0.93, TODAY),
            ("wire_shelving",   "Shelving, pantry room", 18.0, "scan", 0.88, TODAY),
            ("reach_in_cooler", "Reach-in cooler",       24.0, "scan", 0.90, TODAY),
        ],
        "inventory": [
            ("rice_white", 8), ("beans_pinto", 6), ("cn_blackbean", 10),
            ("cereal", 3), ("cn_chicken", 5), ("pasta_spag", 5),
            ("peanut_butter", 4), ("veg_oil", 3),
            ("produce_box", 8), ("apples", 2),
        ],
    },
    {
        "id": "aguilas_sd",
        "name": "Aguilas del Poderoso Dios",
        "address": "5901 Rancho Hills Drive", "city": "San Diego", "zip": "92139",
        "service_type": "Neighborhood Distribution",
        "food_category": "Neighborhood Produce (25-30lb)",
        "eligibility": "Open to All", "distribution_day": "Thursday", "frequency": "Monthly",
        "start_time": "10:00 am", "end_time": "until food runs out",
        "walkup": 1, "drivethru": 1, "diapers_period_supplies": 0,
        "weekend_availability": 0, "is_hub": 0, "is_demo": 0,
        "story": "No cold storage at all. Produce arrives the morning of and is handed out the same day, so nothing can be held.",
        "units": [
            ("wire_shelving", "Shelving, storage room", 18.0, "scan", 0.90, TODAY),
            ("wire_shelving", "Shelving, storage room", 18.0, "scan", 0.90, TODAY),
            ("wire_shelving", "Shelving, back office",  18.0, "scan", 0.72, TODAY),
        ],
        "inventory": [
            ("rice_white", 6), ("cn_corn", 12), ("cn_blackbean", 10),
            ("cn_chicken", 8), ("pasta_spag", 4), ("oats", 4),
        ],
    },
]

# What actually went out. Authored so the network shows all three reasons a
# site can come in under capacity, because they have different owners.
#   (date, boxes_out, people_served, turned_away, notes)
DISTRIBUTIONS = {
    "demo_agency": [
        ("2026-08-14", 16, 64, 0, None),
        ("2026-08-07", 18, 72, 0, None),
        ("2026-07-31", 15, 60, 0, None),
        ("2026-07-24", 17, 68, 0, None),
    ],
    # Capped. Full every week and still turning families away: the site ran out
    # of cold space, which is the one case CareSpace can actually fix.
    "oceanside_crc": [
        ("2026-08-18", 8, 32, 40, "Ran out of boxes 50 minutes in."),
        ("2026-08-11", 8, 32, 26, None),
        ("2026-08-04", 8, 32, 31, None),
    ],
    "apostolic_escondido": [
        ("2026-07-25", 7, 28, 12, None),
        ("2026-06-27", 8, 32, 9, None),
    ],
    # Room to spare every month. The cooler is idle 29 days out of 30, so the
    # limit here is cadence and volunteers, not storage.
    "all_saint_vista": [
        ("2026-07-25", 103, 412, 0, None),
        ("2026-06-27", 96, 384, 0, None),
        ("2026-05-23", 88, 352, 0, None),
    ],
    "vida_nueva_cv": [
        ("2026-08-19", 11, 44, 0, None),
        ("2026-08-12", 12, 48, 3, None),
    ],
    # Fed people without holding a single complete box: produce arrives the
    # morning of and goes straight out.
    "aguilas_sd": [
        ("2026-07-23", 0, 120, 0,
         "Produce only, no complete boxes. Received and handed out the same morning."),
    ],
}

OPERATORS = [
    ("op_maria",  "Maria Delgado",  "agency_rep",         "all_saint_vista"),
    ("op_javier", "Javier Ruiz",    "agency_rep",         "aguilas_sd"),
    ("op_grace",  "Grace Okonkwo",  "agency_rep",         "apostolic_escondido"),
    ("op_dan",    "Dan Whitmore",   "logistics_operator", None),
]


def build():
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    con = sqlite3.connect(DB_PATH)
    con.executescript(open(SCHEMA_PATH).read())

    con.executemany("INSERT INTO storage_zone VALUES (?,?,?,?,?)", ZONES)
    con.executemany("INSERT INTO storage_unit_kind VALUES (?,?,?,?,?,?)", KINDS)
    con.executemany("INSERT INTO item VALUES (?,?,?,?,?,?,?,'synthetic')", ITEMS)
    con.execute(
        "INSERT INTO box_template VALUES (?,?,?,?,?)",
        (BOX["id"], BOX["name"], BOX["feeds_people"], BOX["feeds_days"], BOX["description"]),
    )
    con.executemany(
        "INSERT INTO box_line VALUES (?,?,?,?,?)",
        [(rid("bl"), BOX["id"], it, q, cq) for it, q, cq in BOX_LINES],
    )

    kind_zone = {k[0]: k[2] for k in KINDS}
    kind_usable = {k[0]: k[4] for k in KINDS}

    for a in AGENCIES:
        con.execute(
            "INSERT INTO agency VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'synthetic')",
            (a["id"], a["name"], a["address"], a["city"], a["zip"], a["service_type"],
             a["food_category"], a["eligibility"], a["distribution_day"], a["frequency"],
             a["start_time"], a["end_time"], a["walkup"], a["drivethru"],
             a["diapers_period_supplies"], a["weekend_availability"], a["is_hub"],
             a.get("is_demo", 0)),
        )

        zone_totals, zone_source = {}, {}
        for kind, label, gross, source, conf, measured in a["units"]:
            zone = kind_zone[kind]
            usable = kind_usable[kind]
            con.execute(
                "INSERT INTO storage_unit VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
                (rid("su"), a["id"], zone, kind, label, gross, usable, source, conf,
                 None, None, measured, TODAY),
            )
            # Round per unit, then sum. The UI lists each unit's usable cu ft,
            # so the zone total has to be the sum of those displayed numbers,
            # not the sum of the unrounded floats behind them.
            zone_totals[zone] = zone_totals.get(zone, 0.0) + round(gross * usable)
            zone_source[zone] = source if zone not in zone_source else (
                zone_source[zone] if zone_source[zone] == source else "manual"
            )

        # A zone with no storage unit still gets a snapshot, at zero. That is a
        # real answer, not missing data, and the UI has to say so out loud.
        for zid, *_ in ZONES:
            con.execute(
                "INSERT INTO capacity_snapshot VALUES (?,?,?,?,?,?,?,?,NULL)",
                (rid("cap"), a["id"], zid, round(zone_totals.get(zid, 0.0), 2),
                 zone_source.get(zid, "manual"), None, TODAY, None),
            )

        for item_id, qty in a["inventory"]:
            con.execute("INSERT INTO inventory VALUES (?,?,?,?,?,?)",
                        (rid("inv"), a["id"], item_id, qty, None, None))

    for aid, events in DISTRIBUTIONS.items():
        for on, boxes, people, away, note in events:
            con.execute("INSERT INTO distribution_event VALUES (?,?,?,?,?,?,?)",
                        (rid("de"), aid, on, boxes, people, away, note))

    con.executemany("INSERT INTO operator VALUES (?,?,?,?)", OPERATORS)
    con.commit()

    fixture = export_fixture(con)
    os.makedirs(os.path.dirname(FIXTURE_PATH), exist_ok=True)
    with open(FIXTURE_PATH, "w") as f:
        json.dump(fixture, f, indent=2)
    con.close()
    return fixture


def export_fixture(con):
    con.row_factory = sqlite3.Row
    q = lambda sql, *p: [dict(r) for r in con.execute(sql, p).fetchall()]

    demand = {
        r["zone_id"]: {"cuft_per_box": round(r["cuft_per_box"], 4),
                       "lb_per_box": round(r["lb_per_box"], 2)}
        for r in q("SELECT * FROM v_box_zone_demand WHERE template_id = ?", BOX["id"])
    }

    agencies = []
    for a in q("SELECT * FROM agency ORDER BY is_hub DESC, name"):
        cap = {r["zone_id"]: r for r in q(
            "SELECT * FROM v_current_capacity WHERE agency_id = ?", a["id"])}
        zones = []
        for zid, label, *_ in ZONES:
            usable = cap[zid]["usable_cuft"] if zid in cap else 0.0
            per_box = demand.get(zid, {}).get("cuft_per_box", 0)
            zones.append({
                "zone_id": zid,
                "label": label,
                "usable_cuft": round(usable, 1),
                "cuft_per_box": per_box,
                "boxes_if_alone": int(usable / per_box) if per_box else 0,
                "source": cap[zid]["source"] if zid in cap else "manual",
                "measured_at": cap[zid]["measured_at"] if zid in cap else None,
            })
        binding = min(zones, key=lambda z: z["boxes_if_alone"])
        holds = binding["boxes_if_alone"]
        for z in zones:
            z["is_binding"] = z["zone_id"] == binding["zone_id"]
            z["dead_boxes"] = z["boxes_if_alone"] - holds
            z["dead_cuft"] = round(z["dead_boxes"] * z["cuft_per_box"], 1) if z["cuft_per_box"] else 0

        agencies.append({
            **{k: a[k] for k in a.keys()},
            "story": next(x["story"] for x in AGENCIES if x["id"] == a["id"]),
            "zones": zones,
            "binding_zone": binding["zone_id"],
            "boxes_today": holds,
            "people_fed_today": holds * BOX["feeds_people"],
            "storage_units": q(
                """SELECT su.*, k.label AS kind_label FROM storage_unit su
                   JOIN storage_unit_kind k ON k.id = su.kind_id
                   WHERE su.agency_id = ? AND su.is_active = 1
                   ORDER BY su.zone_id, su.label""", a["id"]),
            "distributions": q(
                """SELECT distributed_on, boxes_out, people_served, turned_away, notes
                   FROM distribution_event WHERE agency_id = ?
                   ORDER BY distributed_on DESC""", a["id"]),
            "inventory": q(
                """SELECT inv.qty_units, i.name, i.category, i.zone_id,
                          i.unit_description, i.unit_weight_lb, i.unit_volume_cuft,
                          ROUND(inv.qty_units * i.unit_weight_lb, 1)   AS total_lb,
                          ROUND(inv.qty_units * i.unit_volume_cuft, 2) AS total_cuft
                   FROM inventory inv JOIN item i ON i.id = inv.item_id
                   WHERE inv.agency_id = ? ORDER BY i.zone_id, i.name""", a["id"]),
        })

    return {
        "generated_for": TODAY,
        "box": {
            **BOX,
            "zone_demand": demand,
            "lines": q(
                """SELECT bl.qty_units, bl.consumer_qty, i.name, i.zone_id,
                          i.unit_description, i.unit_volume_cuft
                   FROM box_line bl JOIN item i ON i.id = bl.item_id
                   WHERE bl.template_id = ? ORDER BY i.zone_id, i.name""", BOX["id"]),
        },
        "zones": [{"id": z[0], "label": z[1], "temp_min_f": z[2],
                   "temp_max_f": z[3], "sort_order": z[4]} for z in ZONES],
        "storage_unit_kinds": q("SELECT * FROM storage_unit_kind"),
        "operators": q("SELECT o.*, a.name AS agency_name FROM operator o "
                       "LEFT JOIN agency a ON a.id = o.agency_id"),
        "agencies": agencies,
    }


if __name__ == "__main__":
    fx = build()
    print(f"wrote {DB_PATH}")
    print(f"wrote {FIXTURE_PATH}\n")
    d = fx["box"]["zone_demand"]
    print(f"One {fx['box']['name']} needs: " + ", ".join(
        f"{v['cuft_per_box']:.2f} cuft {k}" for k, v in d.items()))
    print()
    hdr = f"{'site':<42}{'shelf':>7}{'refr':>7}{'holds':>8}{'strand':>8}  binding"
    print(hdr); print("-" * len(hdr))
    for a in fx["agencies"]:
        b = {z["zone_id"]: z["boxes_if_alone"] for z in a["zones"]}
        strand = sum(z["dead_boxes"] for z in a["zones"])
        print(f"{a['name'][:41]:<42}{b['shelf_stable']:>7}{b['refrigerated']:>7}"
              f"{a['boxes_today']:>8}{strand:>8}  {a['binding_zone']}")
