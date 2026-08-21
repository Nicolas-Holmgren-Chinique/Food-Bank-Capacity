-- CareSpace synthetic database
-- Unit convention:
--   Capacity is measured in CUBIC FEET. It is what a camera can estimate and a
--   person can verify by looking at a room.
--   Inventory is measured in POUNDS, because that is how food banks report.
--   item.unit_volume_cuft is the bridge between the two.
-- See data/README.md for what is real and what is synthetic.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Reference
-- ---------------------------------------------------------------------------

-- The storage zones a food box must be assembled across.
CREATE TABLE storage_zone (
  id          TEXT PRIMARY KEY,          -- shelf_stable | refrigerated
  label       TEXT NOT NULL,
  temp_min_f  INTEGER,
  temp_max_f  INTEGER,
  sort_order  INTEGER NOT NULL
);

-- Physical form factors a scan can recognize. Default volumes let the scan
-- propose a number before anyone measures anything.
CREATE TABLE storage_unit_kind (
  id             TEXT PRIMARY KEY,       -- pallet_rack | reach_in_cooler | ...
  label          TEXT NOT NULL,
  zone_id        TEXT NOT NULL REFERENCES storage_zone(id),
  typical_cuft   REAL NOT NULL,          -- prior used when the scan is unsure
  usable_default REAL NOT NULL,          -- fit factor: how much you can really stack in
  is_fixed       INTEGER NOT NULL DEFAULT 0  -- 1 = built in (walk-in), 0 = movable
);

-- ---------------------------------------------------------------------------
-- Network
-- ---------------------------------------------------------------------------

CREATE TABLE agency (
  id                       TEXT PRIMARY KEY,
  name                     TEXT NOT NULL,
  address                  TEXT,
  city                     TEXT,
  zip                      TEXT,
  service_type             TEXT,         -- real, from source CSV
  food_category            TEXT,         -- real, from source CSV
  eligibility              TEXT,
  distribution_day         TEXT,
  frequency                TEXT,
  start_time               TEXT,
  end_time                 TEXT,
  walkup                   INTEGER DEFAULT 0,
  drivethru                INTEGER DEFAULT 0,
  diapers_period_supplies  INTEGER DEFAULT 0,
  weekend_availability     INTEGER DEFAULT 0,
  is_hub                   INTEGER NOT NULL DEFAULT 0,
  is_demo                  INTEGER NOT NULL DEFAULT 0, -- pinned to the top of the picker
  provenance               TEXT NOT NULL  -- real | synthetic
);

CREATE TABLE operator (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  role       TEXT NOT NULL,             -- agency_rep | logistics_operator
  agency_id  TEXT REFERENCES agency(id) -- null for network-wide logistics roles
);

-- ---------------------------------------------------------------------------
-- Capacity. This is the part the scan writes into.
-- ---------------------------------------------------------------------------

-- One row per physical thing that holds food at a site.
-- A scan creates these; a person can correct or add them by hand.
CREATE TABLE storage_unit (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agency(id),
  zone_id       TEXT NOT NULL REFERENCES storage_zone(id),
  kind_id       TEXT NOT NULL REFERENCES storage_unit_kind(id),
  label         TEXT NOT NULL,          -- "Chest freezer by the back door"
  gross_cuft    REAL NOT NULL,          -- outside measurement of the unit
  usable_pct    REAL NOT NULL DEFAULT 0.75, -- aisles, air gaps, unreachable top shelf
  source        TEXT NOT NULL,          -- scan | manual | override
  confidence    REAL,                   -- 0..1, null when a human entered it
  photo_path    TEXT,
  notes         TEXT,
  is_active     INTEGER NOT NULL DEFAULT 1,
  measured_at   TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX idx_storage_unit_agency ON storage_unit(agency_id, zone_id, is_active);

-- A dated statement of "this is the capacity at this site, in this zone, today".
-- Kept as history rather than a mutable column because capacity is perishable:
-- a freezer dies, a rack gets loaned out, a room is borrowed for a funeral.
-- The newest non-superseded row wins, and a human override always beats a scan.
CREATE TABLE capacity_snapshot (
  id             TEXT PRIMARY KEY,
  agency_id      TEXT NOT NULL REFERENCES agency(id),
  zone_id        TEXT NOT NULL REFERENCES storage_zone(id),
  usable_cuft    REAL NOT NULL,
  source         TEXT NOT NULL,         -- scan | manual | override
  reason         TEXT,                  -- why a human disagreed with the scan
  measured_at    TEXT NOT NULL,
  measured_by    TEXT REFERENCES operator(id),
  superseded_by  TEXT REFERENCES capacity_snapshot(id)
);
CREATE INDEX idx_capacity_current ON capacity_snapshot(agency_id, zone_id, superseded_by);

-- ---------------------------------------------------------------------------
-- Food
-- ---------------------------------------------------------------------------

CREATE TABLE item (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  category          TEXT NOT NULL,      -- Grains/Staples | Canned Goods | Produce | ...
  zone_id           TEXT NOT NULL REFERENCES storage_zone(id),
  unit_description  TEXT NOT NULL,      -- "case of 12 (15oz)"
  unit_weight_lb    REAL NOT NULL,
  unit_volume_cuft  REAL NOT NULL,      -- added for CareSpace, not in the source workbook
  provenance        TEXT NOT NULL       -- synthetic
);

CREATE TABLE inventory (
  id               TEXT PRIMARY KEY,
  agency_id        TEXT NOT NULL REFERENCES agency(id),
  item_id          TEXT NOT NULL REFERENCES item(id),
  qty_units        REAL NOT NULL,
  date_received    TEXT,
  expiration_date  TEXT
);
CREATE INDEX idx_inventory_agency ON inventory(agency_id);

-- ---------------------------------------------------------------------------
-- The box. The atomic unit of account.
-- A box must be assembled at ONE site, so a site's real capacity is the
-- minimum across zones, not the sum.
-- ---------------------------------------------------------------------------

CREATE TABLE box_template (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  feeds_people  INTEGER NOT NULL,
  feeds_days    INTEGER NOT NULL,
  description   TEXT
);

CREATE TABLE box_line (
  id           TEXT PRIMARY KEY,
  template_id  TEXT NOT NULL REFERENCES box_template(id),
  item_id      TEXT NOT NULL REFERENCES item(id),
  qty_units    REAL NOT NULL,           -- fractional: 0.083 of a case = one can
  consumer_qty TEXT                     -- "4 cans", for display
);
CREATE INDEX idx_box_line_template ON box_line(template_id);

-- ---------------------------------------------------------------------------
-- What actually went out the door.
--
-- Capacity says what a site COULD hold. This says what it DID hand out. The
-- gap between them is the whole underutilization question, and turned_away is
-- the column that tells you whose problem the gap is: people turned away at
-- full capacity means the site ran out of space, which is CareSpace's problem.
-- Room to spare means the food never arrived or nobody came, which is not.
-- ---------------------------------------------------------------------------

CREATE TABLE distribution_event (
  id              TEXT PRIMARY KEY,
  agency_id       TEXT NOT NULL REFERENCES agency(id),
  distributed_on  TEXT NOT NULL,
  boxes_out       INTEGER NOT NULL,
  people_served   INTEGER NOT NULL,
  turned_away     INTEGER NOT NULL DEFAULT 0,
  notes           TEXT
);
CREATE INDEX idx_dist_agency ON distribution_event(agency_id, distributed_on DESC);

-- ---------------------------------------------------------------------------
-- Scan sessions. Empty at seed time. The AI piece fills these.
-- Also the eval fixture: detected value vs what the human accepted.
-- ---------------------------------------------------------------------------

CREATE TABLE scan_session (
  id            TEXT PRIMARY KEY,
  agency_id     TEXT NOT NULL REFERENCES agency(id),
  operator_id   TEXT REFERENCES operator(id),
  room_label    TEXT,
  status        TEXT NOT NULL,          -- in_progress | complete | abandoned
  started_at    TEXT NOT NULL,
  completed_at  TEXT
);

CREATE TABLE scan_detection (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES scan_session(id),
  storage_unit_id  TEXT REFERENCES storage_unit(id), -- set once accepted
  detected_kind_id TEXT REFERENCES storage_unit_kind(id),
  detected_cuft    REAL,
  confidence       REAL,
  photo_path       TEXT,
  accepted         INTEGER,             -- null = not reviewed yet
  corrected_kind_id TEXT REFERENCES storage_unit_kind(id),
  corrected_cuft   REAL,
  detected_at      TEXT NOT NULL
);
CREATE INDEX idx_detection_session ON scan_detection(session_id);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------

-- Current capacity per agency per zone: the newest snapshot that has not been
-- superseded.
CREATE VIEW v_current_capacity AS
SELECT c.agency_id, c.zone_id, c.usable_cuft, c.source, c.measured_at
FROM capacity_snapshot c
WHERE c.superseded_by IS NULL;

-- Cubic feet of each zone consumed by one box of each template.
CREATE VIEW v_box_zone_demand AS
SELECT b.template_id,
       i.zone_id,
       SUM(b.qty_units * i.unit_volume_cuft) AS cuft_per_box,
       SUM(b.qty_units * i.unit_weight_lb)   AS lb_per_box
FROM box_line b
JOIN item i ON i.id = b.item_id
GROUP BY b.template_id, i.zone_id;

-- The reveal. Boxes each zone could hold on its own, so the binding zone and
-- the dead capacity in every other zone are both readable.
CREATE VIEW v_zone_box_capacity AS
SELECT cap.agency_id,
       d.template_id,
       d.zone_id,
       cap.usable_cuft,
       d.cuft_per_box,
       CAST(cap.usable_cuft / d.cuft_per_box AS INTEGER) AS boxes_if_alone
FROM v_current_capacity cap
JOIN v_box_zone_demand d ON d.zone_id = cap.zone_id;
