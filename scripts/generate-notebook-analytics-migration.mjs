import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const csvPath = path.join(projectRoot, 'google_maps_cleaned_data.csv');
const feedPath = path.join(projectRoot, 'public', 'food-bank-locations.json');
const sourcePath = path.join(projectRoot, 'san-diego-food-bank-locations.md');
const publicPath = path.join(projectRoot, 'public', 'food-bank-analytics.json');
const migrationPath = path.join(projectRoot, 'migrations', '0003_notebook_food_bank_analytics.sql');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (quoted && character === '"' && next === '"') {
      value += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (!quoted && character === ',') {
      row.push(value);
      value = '';
    } else if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && next === '\n') index += 1;
      row.push(value);
      if (row.some((cell) => cell !== '')) rows.push(row);
      row = [];
      value = '';
    } else {
      value += character;
    }
  }

  row.push(value);
  if (row.some((cell) => cell !== '')) rows.push(row);
  return rows;
}

function asBoolean(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function asNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function coordinateKey(name, latitude, longitude) {
  return `${String(name ?? '').trim().toLowerCase()}|${asNumber(latitude)?.toFixed(6)}|${asNumber(longitude)?.toFixed(6)}`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
const sourceText = fs.readFileSync(sourcePath, 'utf8');
const retrievedAt = sourceText.match(/^- Retrieved: `([^`]+)`/m)?.[1] ?? new Date().toISOString();
const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
const headers = rows.shift().map((header) => header.trim());
const csvRecords = rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
const rowsBySourceIndex = new Map(csvRecords.map((row) => [Number(row['']), row]));

function recordFromRow(location, row, sourceGap = false) {
  const normalized = row ?? {};
  return {
    sourceId: Number(location.sourceId),
    locationId: location.id,
    name: normalized.name || location.label,
    address: normalized.address || location.address,
    city: normalized.city || location.area,
    county: normalized.county || 'San Diego County',
    zip: normalized.zip || null,
    latitude: asNumber(normalized.latitude) ?? location.location.latitude,
    longitude: asNumber(normalized.longitude) ?? location.location.longitude,
    isChurch: asBoolean(normalized.is_church),
    isYmca: asBoolean(normalized.is_YMCA),
    hasPhone: row ? !asBoolean(normalized.No_Phone_Number) : Boolean(location.phone),
    hasWebsite: row ? !asBoolean(normalized.No_Website) : Boolean(location.website),
    day: normalized.day || null,
    serviceType: normalized.service_type || null,
    foodCategory: normalized.food_category || null,
    eligibility: normalized.eligibility_clean || null,
    walkup: asBoolean(normalized.walkup),
    drivethru: asBoolean(normalized.drivethru),
    idCardAvailable: asBoolean(normalized.id_card_available),
    bringCart: asBoolean(normalized.bring_cart),
    diapersPeriodSupplies: asBoolean(normalized.diapers_period_supplies),
    appointmentRequired: asBoolean(normalized.appointment_required),
    lineNumberSystem: asBoolean(normalized.line_number_system),
    militaryAccessRequired: asBoolean(normalized.military_access_required),
    rescheduleStatus: normalized.reschedule_status || 'Unknown',
    hasSpecificDates: asBoolean(normalized.has_specific_dates),
    frequency: normalized.frequency || null,
    daysOfWeek: normalized.days_of_week || null,
    startTime: normalized.start_time || null,
    endTime: normalized.end_time || null,
    scheduleNeedsReview: row ? asBoolean(normalized.schedule_needs_review) : true,
    weekendAvailability: asBoolean(normalized.Weekend_Availablity),
    sourceGap,
  };
}

const records = feed.locations.map((location, sourceIndex) => recordFromRow(location, rowsBySourceIndex.get(sourceIndex), !rowsBySourceIndex.has(sourceIndex)));

const dataset = {
  version: '1.0',
  schema: 'carespace.food-bank-analytics',
  source: 'Google Maps Data Ingestation.ipynb',
  sourceFile: 'google_maps_cleaned_data.csv',
  retrievedAt,
  scope: feed.scope,
  records,
};

fs.writeFileSync(publicPath, `${JSON.stringify(dataset, null, 2)}\n`);

const columns = ['source_id', 'location_id', 'name', 'city', 'county', 'latitude', 'longitude', 'service_type', 'payload_json', 'source', 'retrieved_at', 'active'];
const statements = [
  '-- Generated from Google Maps Data Ingestation.ipynb and google_maps_cleaned_data.csv.',
  'CREATE TABLE IF NOT EXISTS food_bank_analytics (',
  '  source_id INTEGER PRIMARY KEY,',
  '  location_id TEXT NOT NULL,',
  '  name TEXT NOT NULL,',
  '  city TEXT NOT NULL,',
  '  county TEXT NOT NULL,',
  '  latitude REAL NOT NULL,',
  '  longitude REAL NOT NULL,',
  '  service_type TEXT,',
  '  payload_json TEXT NOT NULL,',
  '  source TEXT NOT NULL,',
  '  retrieved_at TEXT,',
  '  active INTEGER NOT NULL DEFAULT 1,',
  '  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,',
  '  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP',
  ');',
  'CREATE INDEX IF NOT EXISTS food_bank_analytics_city_idx ON food_bank_analytics (city COLLATE NOCASE);',
  'CREATE INDEX IF NOT EXISTS food_bank_analytics_service_idx ON food_bank_analytics (service_type);',
];

for (const record of records) {
  const values = [
    record.sourceId,
    record.locationId,
    record.name,
    record.city,
    record.county,
    record.latitude,
    record.longitude,
    record.serviceType,
    JSON.stringify(record),
    dataset.source,
    retrievedAt,
    1,
  ].map(sqlValue);
  statements.push(`INSERT OR REPLACE INTO food_bank_analytics (${columns.join(', ')}) VALUES (${values.join(', ')});`);
}

fs.writeFileSync(migrationPath, `${statements.join('\n')}\n`);
console.log(`Generated ${records.length} notebook analytics records in ${path.relative(projectRoot, migrationPath)}`);
