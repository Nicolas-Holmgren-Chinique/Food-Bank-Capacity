import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const feedPath = path.join(projectRoot, 'public', 'food-bank-locations.json');
const migrationPath = path.join(projectRoot, 'migrations', '0001_food_bank_locations.sql');

const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
const locations = Array.isArray(feed.locations) ? feed.locations : [];

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const columns = [
  'id', 'source_id', 'type', 'label', 'meta', 'area', 'kind', 'address',
  'phone', 'website', 'schedule', 'closures', 'services', 'eligibility',
  'access', 'tags', 'latitude', 'longitude', 'source', 'source_url',
  'retrieved_at', 'active',
];

const statements = [
  '-- Generated from public/food-bank-locations.json. Do not edit rows by hand.',
  'CREATE TABLE IF NOT EXISTS food_bank_locations (',
  '  id TEXT PRIMARY KEY,',
  '  source_id INTEGER NOT NULL,',
  "  type TEXT NOT NULL DEFAULT 'food-bank',",
  '  label TEXT NOT NULL,',
  '  meta TEXT NOT NULL,',
  '  area TEXT NOT NULL,',
  '  kind TEXT NOT NULL,',
  '  address TEXT NOT NULL,',
  '  phone TEXT NOT NULL DEFAULT \'\',',
  '  website TEXT NOT NULL DEFAULT \'\',',
  '  schedule TEXT NOT NULL DEFAULT \'\',',
  '  closures TEXT NOT NULL DEFAULT \'\',',
  '  services TEXT NOT NULL DEFAULT \'\',',
  '  eligibility TEXT NOT NULL DEFAULT \'\',',
  '  access TEXT NOT NULL DEFAULT \'\',',
  '  tags TEXT NOT NULL DEFAULT \'\',',
  '  latitude REAL NOT NULL,',
  '  longitude REAL NOT NULL,',
  '  source TEXT NOT NULL,',
  '  source_url TEXT NOT NULL,',
  '  retrieved_at TEXT,',
  '  active INTEGER NOT NULL DEFAULT 1,',
  '  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
  ');',
  'CREATE INDEX IF NOT EXISTS food_bank_locations_geo_idx ON food_bank_locations (latitude, longitude);',
  'CREATE INDEX IF NOT EXISTS food_bank_locations_label_idx ON food_bank_locations (label COLLATE NOCASE);',
];

for (const location of locations) {
  const values = [
    location.id,
    location.sourceId,
    location.type,
    location.label,
    location.meta,
    location.area,
    location.kind,
    location.address,
    location.phone,
    location.website,
    location.schedule,
    location.closures,
    location.services,
    location.eligibility,
    location.access,
    location.tags,
    location.location.latitude,
    location.location.longitude,
    location.source,
    location.sourceUrl,
    location.retrievedAt,
    1,
  ].map(sqlValue);
  statements.push(`INSERT OR REPLACE INTO food_bank_locations (${columns.join(', ')}) VALUES (${values.join(', ')});`);
}

fs.mkdirSync(path.dirname(migrationPath), { recursive: true });
fs.writeFileSync(migrationPath, `${statements.join('\n')}\n`);
console.log(`Generated ${locations.length} seed rows in ${path.relative(projectRoot, migrationPath)}`);
