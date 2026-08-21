/**
 * GET /api/v1/capabilities
 *
 * The machine-readable agent discovery surface for the CareSpace POC.
 */

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

const declaration = {
  service: 'CareSpace',
  brand: 'CareSpace',
  domain: 'carespace.pages.dev',
  version: '1.0',
  description: 'A coordination layer for food, community need, capacity, and logistics.',
  capabilities: ['discover', 'query', 'search_matches'],
  resources: ['food_bank_locations', 'food_bank_analytics', 'matches'],
  endpoints: {
    capabilities: 'GET /api/v1/capabilities',
    foodBanks: 'GET /api/v1/food-banks',
    matches: 'POST /api/v1/matches/search',
  },
  trust: {
    freshness: ['source', 'reported_at', 'verified_at', 'expires_at'],
    privacy: 'Community-level resource signals; no individual case records.',
    highImpactActions: 'Require scoped credentials and human confirmation before production use.',
  },
};

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=300, s-maxage=900',
    ...CORS,
  },
});

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });
export const onRequestGet = () => json(declaration);
export const onRequest = ({ request }) => request.method === 'GET'
  ? onRequestGet()
  : request.method === 'OPTIONS'
    ? onRequestOptions()
    : json({ error: 'method_not_allowed', detail: 'Use GET or OPTIONS.' }, 405);
