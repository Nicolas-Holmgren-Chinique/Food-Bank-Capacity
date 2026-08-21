#!/usr/bin/env python3
"""
Export the CareSpace synthetic database to a spreadsheet.

  python3 data/export_xlsx.py   ->  data/CareSpace_Synthetic_DB.xlsx

One sheet per table, plus a README and two derived sheets that show the math
the app runs: capacity by zone, and the reconciliation against inventory.
Regenerate the database first with data/seed.py if you have changed the seed.
"""

import os
import sqlite3

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, "data", "carespace.db")
OUT_PATH = os.path.join(ROOT, "data", "CareSpace_Synthetic_DB.xlsx")

TEAL = "377E7F"
HEAD = Font(bold=True, color="FFFFFF", size=10)
FILL = PatternFill("solid", fgColor=TEAL)

README = [
    ("CareSpace synthetic database", True),
    ("", False),
    ("Everything here is synthetic. Agency names, addresses, service types and", False),
    ("distribution days are drawn from the public San Diego Food Bank partner", False),
    ("list so the demo reads as a real network. Every capacity, item, volume and", False),
    ("count was authored by hand to make the constraint visible.", False),
    ("", False),
    ("Partner agencies only. The Miramar warehouse is the mother kitchen and", False),
    ("belongs to the allocation problem, not to mapping what a pantry can hold.", False),
    ("", False),
    ("UNITS", True),
    ("Capacity is measured in CUBIC FEET, because that is what a camera can", False),
    ("estimate and a person can verify by looking at a room. Inventory is also", False),
    ("carried in pounds, because that is how food banks report, but pounds are", False),
    ("the wrong unit for storage: a case of diapers is 40 lb and 3.5 cu ft, a", False),
    ("case of canned corn is 11 lb and 0.45 cu ft. item.unit_volume_cuft is the", False),
    ("bridge between the two.", False),
    ("", False),
    ("storage_unit.gross_cuft is the outside size of a unit.", False),
    ("storage_unit.usable_pct is the fit factor: how much you can actually stack", False),
    ("into it once aisles, air gaps and unreachable shelves come out.", False),
    ("The app only ever shows gross x usable_pct. Gross is never displayed alone.", False),
    ("", False),
    ("THE MODEL", True),
    ("A Family Box is atomic. It must be assembled at a single site out of both", False),
    ("zones, shelf-stable and produce. So a site's real capacity is the MINIMUM", False),
    ("across zones, not the sum. Everything above that minimum in the other zone", False),
    ("is stranded: physically real, permanently unreachable.", False),
    ("", False),
    ("  people = min over zones of floor(usable_cuft / cuft_per_box) x 4", False),
    ("", False),
    ("See the 'Capacity by zone' sheet for that calculation per site.", False),
    ("", False),
    ("CAPACITY VS REALITY", True),
    ("distribution_event records what actually went out the door. The gap", False),
    ("against capacity has three different causes with three different owners:", False),
    ("full and still turning people away means the site ran out of space, which", False),
    ("is the only one a storage product can fix. Room to spare means the food", False),
    ("never arrived or the families did not come. turned_away is the column", False),
    ("that tells them apart. See the 'What went out' sheet.", False),
    ("", False),
    ("EMPTY TABLES", True),
    ("scan_session and scan_detection are empty. Nothing has been scanned yet;", False),
    ("the vision model fills them. capacity_snapshot has one row per site per", False),
    ("zone and no superseded rows, so there is no history in here yet.", False),
]

DERIVED_CAPACITY = """
SELECT a.name                                        AS "Agency",
       a.city                                        AS "City",
       a.frequency                                   AS "Cadence",
       z.label                                       AS "Zone",
       ROUND(COALESCE(SUM(su.gross_cuft), 0), 1)                 AS "Gross cu ft",
       ROUND(COALESCE(SUM(su.gross_cuft * su.usable_pct), 0), 1) AS "Usable cu ft",
       ROUND(d.cuft_per_box, 3)                                  AS "Cu ft per box",
       CAST(COALESCE(SUM(su.gross_cuft * su.usable_pct), 0) / d.cuft_per_box AS INT)     AS "Boxes if alone",
       CAST(COALESCE(SUM(su.gross_cuft * su.usable_pct), 0) / d.cuft_per_box AS INT) * 4 AS "People if alone"
FROM agency a
JOIN storage_zone z
LEFT JOIN storage_unit su
       ON su.agency_id = a.id AND su.zone_id = z.id AND su.is_active = 1
JOIN v_box_zone_demand d ON d.zone_id = z.id
GROUP BY a.id, z.id
ORDER BY a.name, z.sort_order
"""

DERIVED_SERVED = """
SELECT a.name                                   AS "Agency",
       a.frequency                              AS "Cadence",
       de.distributed_on                        AS "Date",
       de.boxes_out                             AS "Boxes out",
       de.people_served                         AS "People served",
       de.turned_away                           AS "Turned away",
       de.notes                                 AS "Notes"
FROM distribution_event de
JOIN agency a ON a.id = de.agency_id
ORDER BY a.name, de.distributed_on DESC
"""

DERIVED_CHECK = """
SELECT a.name AS "Agency",
       z.label AS "Zone",
       ROUND(COALESCE(inv.cases, 0), 0)   AS "Cases on hand",
       ROUND(COALESCE(inv.lb, 0), 0)      AS "Lb on hand",
       ROUND(COALESCE(inv.cuft, 0), 1)    AS "Cu ft on hand",
       ROUND(COALESCE(cap.usable, 0), 1)  AS "Usable cu ft",
       CASE WHEN COALESCE(inv.cuft, 0) > COALESCE(cap.usable, 0)
            THEN 'OVER' ELSE 'fits' END   AS "Verdict"
FROM agency a
JOIN storage_zone z
LEFT JOIN (SELECT i2.agency_id, it.zone_id,
                  SUM(i2.qty_units)                        AS cases,
                  SUM(i2.qty_units * it.unit_weight_lb)    AS lb,
                  SUM(i2.qty_units * it.unit_volume_cuft)  AS cuft
           FROM inventory i2 JOIN item it ON it.id = i2.item_id
           GROUP BY i2.agency_id, it.zone_id) inv
       ON inv.agency_id = a.id AND inv.zone_id = z.id
LEFT JOIN (SELECT agency_id, zone_id, SUM(gross_cuft * usable_pct) AS usable
           FROM storage_unit WHERE is_active = 1
           GROUP BY agency_id, zone_id) cap
       ON cap.agency_id = a.id AND cap.zone_id = z.id
GROUP BY a.id, z.id
ORDER BY a.name, z.sort_order
"""


def write_sheet(wb, title, headers, rows, widths=None):
    ws = wb.create_sheet(title[:31])
    ws.append(headers)
    for c in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=c)
        cell.font = HEAD
        cell.fill = FILL
        cell.alignment = Alignment(vertical="center")
    for r in rows:
        ws.append(list(r))
    ws.freeze_panes = "A2"
    for i, h in enumerate(headers, start=1):
        longest = max([len(str(h))] + [len(str(r[i - 1])) for r in rows[:400]] or [0])
        ws.column_dimensions[get_column_letter(i)].width = min(
            max(10, longest + 2), (widths or {}).get(h, 46)
        )
    return ws


def main():
    con = sqlite3.connect(DB_PATH)
    wb = Workbook()
    wb.remove(wb.active)

    ws = wb.create_sheet("README")
    for text, bold in README:
        ws.append([text])
        if bold:
            ws.cell(row=ws.max_row, column=1).font = Font(bold=True, color=TEAL)
    ws.column_dimensions["A"].width = 82

    # Derived sheets first: this is the math the app runs.
    for title, sql in [
        ("Capacity by zone", DERIVED_CAPACITY),
        ("Inventory check", DERIVED_CHECK),
        ("What went out", DERIVED_SERVED),
    ]:
        cur = con.execute(sql)
        write_sheet(wb, title, [d[0] for d in cur.description], cur.fetchall())

    # Then one sheet per table, in dependency order.
    order = [
        "storage_zone", "storage_unit_kind", "agency", "operator",
        "storage_unit", "capacity_snapshot", "item", "inventory",
        "box_template", "box_line", "distribution_event",
        "scan_session", "scan_detection",
    ]
    for t in order:
        cur = con.execute(f"SELECT * FROM {t}")
        rows = cur.fetchall()
        write_sheet(wb, t, [d[0] for d in cur.description], rows)

    wb.save(OUT_PATH)
    con.close()

    print(f"wrote {OUT_PATH}")
    for s in wb.sheetnames:
        print(f"  {s}")


if __name__ == "__main__":
    main()
