/**
 * POST /api/v1/matches/search
 *
 * Makes real the endpoint that `capabilities.json` already advertises to
 * agents. Runs the same allocation module the dashboard uses, so a person
 * and an agent asking the same question get the same answer.
 *
 * Cloudflare Pages Function — no server, no container, deploys with the
 * existing `wrangler pages deploy` step.
 */
import { allocate } from '../../../../src/lib/allocation.js';

/** One recipient ration: 3 bags rice + 2 cans beans (dry), 1 pack peas (frozen). */
const DEFAULT_BOX = [
  { key: 'dry_storage', label: 'Dry storage', volumePerBox: 0.03, unit: 'm3' },
  { key: 'frozen_storage', label: 'Frozen storage', volumePerBox: 0.005, unit: 'm3' },
];

const MAX_BODY_BYTES = 1_000_000;
const MAX_SITES = 5_000;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, authorization',
  'access-control-max-age': '86400',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS },
  });

const fail = (status, error, detail) => json({ error, detail }, status);

export const onRequestOptions = () => new Response(null, { status: 204, headers: CORS });

export const onRequestPost = async ({ request }) => {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return fail(413, 'request_too_large', `Body exceeds ${MAX_BODY_BYTES} bytes.`);
  }

  let payload;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return fail(413, 'request_too_large', `Body exceeds ${MAX_BODY_BYTES} bytes.`);
    }
    payload = JSON.parse(text);
  } catch {
    return fail(400, 'invalid_json', 'Body must be a JSON object.');
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return fail(400, 'invalid_body', 'Body must be a JSON object.');
  }

  // `recommend` is opt-in, not opt-out: each recommendation costs a full extra
  // solve, so defaulting it on lets one anonymous request buy a lot of CPU.
  const { supply, sites, dimensions = DEFAULT_BOX, recommend = false } = payload;
  const maxRecommendations = Math.min(10, Math.max(0, Math.floor(Number(payload.maxRecommendations) || 5)));

  if (!Array.isArray(sites) || sites.length === 0) {
    return fail(400, 'missing_sites', 'Provide a non-empty `sites` array: {id, people, boxesOnHand, space}.');
  }
  if (sites.length > MAX_SITES) {
    return fail(413, 'too_many_sites', `At most ${MAX_SITES} sites per request.`);
  }
  if (!Number.isFinite(Number(supply)) || Number(supply) < 0) {
    return fail(400, 'invalid_supply', '`supply` must be a non-negative number of boxes.');
  }
  if (!Array.isArray(dimensions) || dimensions.length === 0) {
    return fail(400, 'invalid_dimensions', '`dimensions` must be a non-empty array of {key, volumePerBox}.');
  }
  for (const dim of dimensions) {
    if (!dim || typeof dim.key !== 'string' || !(Number(dim.volumePerBox) >= 0)) {
      return fail(400, 'invalid_dimensions', 'Each dimension needs a string `key` and a numeric `volumePerBox`.');
    }
  }

  let result;
  try {
    result = allocate({
      supply: Number(supply),
      dimensions,
      sites,
      recommend: recommend === true,
      maxRecommendations,
    });
  } catch (error) {
    return fail(400, 'invalid_sites', error instanceof Error ? error.message : 'Could not allocate.');
  }

  return json({
    schema: 'carespace.matches.search',
    version: '1.0',
    computedAt: new Date().toISOString(),
    boxDefinition: dimensions,
    ...result,
    notes: [
      'Capacity is the minimum across storage dimensions — a ration box cannot be split across facilities.',
      'Allocation maximises the worst-served facility’s coverage, then total boxes placed.',
      'Capacity figures must be free space now (PRD `available_capacity`), not `maximum_capacity`.',
    ],
  });
};

/** Anything other than POST/OPTIONS on this path. */
export const onRequest = ({ request }) =>
  fail(405, 'method_not_allowed', `${request.method} is not supported. Use POST.`);
