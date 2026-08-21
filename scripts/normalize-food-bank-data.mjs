import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const sourcePath = path.join(projectRoot, 'san-diego-food-bank-locations.md');
const outputPath = path.join(projectRoot, 'public', 'food-bank-locations.json');

const sourceText = fs.readFileSync(sourcePath, 'utf8');
const jsonBlock = sourceText.split('```json\n')[1]?.split('\n```')[0];
if (!jsonBlock) throw new Error(`Could not find the JSON export in ${sourcePath}`);

const sourcePayload = JSON.parse(jsonBlock);
const sourceLocations = sourcePayload?.results?.locations;
if (!Array.isArray(sourceLocations)) throw new Error('Storepoint export has no results.locations array');

const sourceUrl = sourceText.match(/^- Source: `([^`]+)`/m)?.[1] ?? '';
const retrievedAt = sourceText.match(/^- Retrieved: `([^`]+)`/m)?.[1] ?? null;

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseCustomFields(value) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function addressParts(address) {
  return text(address).split(',').map((part) => part.trim()).filter(Boolean);
}

function cityFromAddress(address) {
  const parts = addressParts(address);
  return parts.length > 1 ? parts.at(-2) : 'San Diego County';
}

function postalCodeFromAddress(address) {
  return text(address).match(/\b\d{5}(?:-\d{4})?\b/)?.[0] ?? '';
}

const locations = sourceLocations
  .map((location) => {
    const latitude = Number(location.loc_lat);
    const longitude = Number(location.loc_long);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    const fields = parseCustomFields(location.custom_fields);
    const address = text(location.streetaddress);
    const area = cityFromAddress(address);
    const postalCode = postalCodeFromAddress(address);

    return {
      id: `food-bank-${location.id}`,
      sourceId: location.id,
      type: 'food-bank',
      label: text(location.name) || 'Food access site',
      meta: `${area}${postalCode ? ` · ${postalCode}` : ''}`,
      area,
      kind: 'Food bank location',
      address,
      phone: text(location.phone),
      website: text(location.website),
      schedule: text(fields.neci8m1ih2),
      closures: text(fields['6hqa392kmt']),
      services: text(fields.r9lac8vy2c),
      eligibility: text(fields.cooifgou2h),
      access: text(fields.t79gvzzldl),
      tags: text(location.tags),
      location: { latitude, longitude },
      source: 'San Diego Food Bank Food-Locator Storepoint export',
      sourceUrl,
      retrievedAt,
    };
  })
  .filter(Boolean);

const feed = {
  version: '1.0',
  schema: 'carespace.food-bank-locations',
  source: 'San Diego Food Bank Food-Locator Locations',
  sourceUrl,
  retrievedAt,
  scope: {
    type: 'COUNTY',
    geoid: '0500000US06073',
    fips: '06073',
    name: 'San Diego County, California',
    bounds: [[32.53, -117.60], [33.39, -116.08]],
  },
  locations,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(feed, null, 2)}\n`);
console.log(`Normalized ${locations.length} food-bank locations into ${path.relative(projectRoot, outputPath)}`);
