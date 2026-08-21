/**
 * GET /api/v1/food-banks
 *
 * Public, county-scoped read API for the food-bank map layer. The browser
 * receives only published location fields; D1 remains behind the Pages
 * Function binding.
 */

const SCOPE = {
  type: 'COUNTY',
  geoid: '0500000US06073',
  fips: '06073',
  name: 'San Diego County, California',
  bounds: [[32.53, -117.60], [33.39, -116.08]],
};

const SOURCE = 'San Diego Food Bank Food-Locator Locations';
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 500;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const json = (body, status = 200, extraHeaders = {}) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': status >= 400 ? 'no-store' : 'public, max-age=60, s-maxage=300',
    ...CORS,
    ...extraHeaders,
  },
});

function rowToLocation(row) {
  let analytics = null;
  if (row.analytics_json) {
    try {
      analytics = JSON.parse(row.analytics_json);
    } catch {
      analytics = null;
    }
  }
  const area = analytics?.city || row.area;
  return {
    id: row.id,
    sourceId: row.source_id,
    type: row.type,
    label: row.label,
    meta: analytics?.zip ? `${area} · ${analytics.zip}` : row.meta,
    area,
    kind: row.kind,
    address: row.address,
    phone: row.phone,
    website: row.website,
    schedule: row.schedule,
    closures: row.closures,
    services: row.services,
    eligibility: row.eligibility,
    access: row.access,
    tags: row.tags,
    location: { latitude: row.latitude, longitude: row.longitude },
    source: row.source,
    sourceUrl: row.source_url,
    retrievedAt: row.retrieved_at,
    analytics,
  };
}

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export const onRequestGet = async ({ request, env }) => {
  if (!env.CARES_DB) {
    return json({ error: 'database_unavailable', detail: 'The CARES_DB Pages binding is not configured.' }, 503);
  }

  const url = new URL(request.url);
  const search = (url.searchParams.get('search') ?? '').trim().slice(0, 120);
  const requestedLimit = Number(url.searchParams.get('limit') ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.floor(requestedLimit), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  const where = [
    'food_bank_locations.active = 1',
    'food_bank_locations.latitude BETWEEN ? AND ?',
    'food_bank_locations.longitude BETWEEN ? AND ?',
  ];
  const binds = [SCOPE.bounds[0][0], SCOPE.bounds[1][0], SCOPE.bounds[0][1], SCOPE.bounds[1][1]];

  if (search) {
    where.push('(food_bank_locations.label LIKE ? OR food_bank_locations.area LIKE ? OR food_bank_locations.address LIKE ? OR food_bank_locations.tags LIKE ?)');
    const searchTerm = `%${search}%`;
    binds.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  const query = `
    SELECT
      food_bank_locations.id, food_bank_locations.source_id, food_bank_locations.type,
      food_bank_locations.label, food_bank_locations.meta, food_bank_locations.area,
      food_bank_locations.kind, food_bank_locations.address, food_bank_locations.phone,
      food_bank_locations.website, food_bank_locations.schedule, food_bank_locations.closures,
      food_bank_locations.services, food_bank_locations.eligibility, food_bank_locations.access,
      food_bank_locations.tags, food_bank_locations.latitude, food_bank_locations.longitude,
      food_bank_locations.source, food_bank_locations.source_url, food_bank_locations.retrieved_at,
      analytics.payload_json AS analytics_json
    FROM food_bank_locations
    LEFT JOIN food_bank_analytics analytics
      ON analytics.source_id = food_bank_locations.source_id
    WHERE ${where.join(' AND ')}
    ORDER BY label COLLATE NOCASE
    LIMIT ?
  `;

  try {
    const result = await env.CARES_DB.prepare(query).bind(...binds, limit).all();
    const locations = (result.results ?? []).map(rowToLocation);
    return json({
      version: '1.0',
      schema: 'carespace.food-bank-locations',
      source: SOURCE,
      sourceUrl: locations[0]?.sourceUrl ?? null,
      retrievedAt: locations[0]?.retrievedAt ?? null,
      scope: SCOPE,
      query: { search: search || null, limit },
      locations,
    });
  } catch (error) {
    return json({
      error: 'database_query_failed',
      detail: error instanceof Error ? error.message : 'Could not read food-bank locations.',
    }, 500);
  }
};

export const onRequest = ({ request }) => json({
  error: 'method_not_allowed',
  detail: `${request.method} is not supported. Use GET.`,
}, 405, { Allow: 'GET, OPTIONS' });
