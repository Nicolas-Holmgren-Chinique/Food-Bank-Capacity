/**
 * POST /api/v1/analyze
 *
 * Runs the allocation solver, then asks a model to interpret its output —
 * unmet requirements, where funding should go, what the data cannot support.
 *
 * The solver runs HERE, server-side, on every request. The model never receives
 * raw facility data and never computes capacity: it only ever sees figures the
 * verified solver produced. That is the whole point — the product exists because
 * intuition about capacity is wrong, and a plausible model guess is no better
 * than a wrong human one.
 *
 * Inference is additive. If the model is slow, down, or returns something
 * unparseable, the deterministic allocation is still returned with
 * `analysis: null` and a reason. A caller always gets the numbers.
 */
import { allocate } from '../../../src/lib/allocation.js';
import { ANALYSES, buildPrompt } from '../../../src/lib/analysis-prompts.js';

const OLLAMA_URL = 'https://ollama.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash:0731';
const INFERENCE_TIMEOUT_MS = 60_000;
const MAX_BODY_BYTES = 1_000_000;
const MAX_SITES = 500;

/** One ration box: half produce by volume, so cold storage usually binds. */
const DEFAULT_BOX = [
  { key: 'dry_storage', label: 'Dry storage', volumePerBox: 0.03, unit: 'm3' },
  { key: 'frozen_storage', label: 'Cold storage', volumePerBox: 0.005, unit: 'm3' },
];

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

export const onRequestGet = () =>
  json({
    endpoint: 'POST /api/v1/analyze',
    description: 'Allocate a wave, then interpret the result.',
    analyses: Object.values(ANALYSES).map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      parameters: a.parameters,
    })),
  });

export const onRequestPost = async ({ request, env }) => {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
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

  const {
    supply,
    sites,
    dimensions = DEFAULT_BOX,
    analysis = 'unmet_requirements',
    params = {},
    provenance = {},
  } = payload;

  if (!ANALYSES[analysis]) {
    return fail(400, 'unknown_analysis', `Known analyses: ${Object.keys(ANALYSES).join(', ')}.`);
  }
  if (analysis === 'ask') {
    const question = String(params.question ?? '').trim();
    if (!question) {
      return fail(400, 'missing_question', 'The `ask` analysis needs a `params.question` string.');
    }
    if (question.length > 1000) {
      return fail(400, 'question_too_long', 'Questions are limited to 1000 characters.');
    }
  }
  if (!Array.isArray(sites) || sites.length === 0) {
    return fail(400, 'missing_sites', 'Provide a non-empty `sites` array: {id, people, boxesOnHand, space}.');
  }
  if (sites.length > MAX_SITES) {
    return fail(413, 'too_many_sites', `At most ${MAX_SITES} sites per request.`);
  }
  if (!Number.isFinite(Number(supply)) || Number(supply) < 0) {
    return fail(400, 'invalid_supply', '`supply` must be a non-negative number of boxes.');
  }

  // 1. Deterministic allocation. This is the part that must always succeed.
  let result;
  try {
    result = allocate({ supply: Number(supply), dimensions, sites, recommend: true });
  } catch (error) {
    return fail(400, 'invalid_sites', error instanceof Error ? error.message : 'Could not allocate.');
  }

  const base = {
    schema: 'carespace.analyze',
    version: '1.0',
    computedAt: new Date().toISOString(),
    allocation: result,
  };

  const apiKey = env?.OLLAMA_API_KEY;
  if (!apiKey) {
    return json({
      ...base,
      analysis: null,
      analysisError: {
        code: 'inference_not_configured',
        message: 'OLLAMA_API_KEY is not set. Allocation returned without interpretation.',
      },
    });
  }

  // 2. Interpretation. Optional by construction — never fails the request.
  const model = env.OLLAMA_MODEL || DEFAULT_MODEL;
  const prompt = buildPrompt(analysis, result, { params, provenance, rationBox: dimensions });

  try {
    const inference = await callOllama({ apiKey, model, prompt });
    return json({ ...base, analysis: inference });
  } catch (error) {
    return json({
      ...base,
      analysis: null,
      analysisError: {
        code: error?.code ?? 'inference_failed',
        message: error?.message ?? 'Inference failed.',
      },
    });
  }
};

async function callOllama({ apiKey, model, prompt }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INFERENCE_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        response_format: { type: 'json_object' },
        stream: false,
        max_tokens: 12_000,
      }),
    });
  } catch (error) {
    clearTimeout(timer);
    throw Object.assign(
      new Error(error?.name === 'AbortError' ? `Inference timed out after ${INFERENCE_TIMEOUT_MS / 1000}s.` : 'Could not reach the inference endpoint.'),
      { code: error?.name === 'AbortError' ? 'inference_timeout' : 'inference_unreachable' },
    );
  }
  clearTimeout(timer);

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw Object.assign(new Error(`Inference endpoint returned ${response.status}. ${detail}`), {
      code: response.status === 401 ? 'inference_unauthorized' : 'inference_http_error',
    });
  }

  const body = await response.json().catch(() => null);
  const choice = body?.choices?.[0];
  const content = choice?.message?.content;

  // Reasoning models bill their thinking against max_tokens and return it in a
  // separate field. A truncated run leaves `content` empty with a full
  // reasoning trace — report that distinctly, because the fix is a bigger
  // budget or a tighter prompt, not a retry.
  if (typeof content !== 'string' || !content.trim()) {
    const reasoningChars = (choice?.message?.reasoning ?? '').length;
    if (choice?.finish_reason === 'length') {
      throw Object.assign(
        new Error(
          `Model exhausted its ${12_000}-token budget on reasoning (${reasoningChars} characters) without producing an answer.`,
        ),
        { code: 'inference_truncated' },
      );
    }
    throw Object.assign(new Error('Inference returned an empty response.'), { code: 'inference_empty' });
  }

  let findings;
  try {
    findings = JSON.parse(content);
  } catch {
    // Some models wrap JSON in prose or a fence. Recover the outermost object.
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) {
      throw Object.assign(new Error('Inference did not return JSON.'), { code: 'inference_unparseable' });
    }
    try {
      findings = JSON.parse(match[0]);
    } catch {
      throw Object.assign(new Error('Inference returned malformed JSON.'), { code: 'inference_unparseable' });
    }
  }

  return {
    id: prompt.analysis,
    label: prompt.label,
    parameters: prompt.parameters,
    model: body?.model ?? model,
    usage: body?.usage ?? null,
    findings,
  };
}
