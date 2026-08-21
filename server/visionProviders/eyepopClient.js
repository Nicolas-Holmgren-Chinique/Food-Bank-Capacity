import { Readable } from 'node:stream';
import { EyePop } from '@eyepop.ai/eyepop';
import { fixturePrompts } from '../../src/engine/vision/fixtureClasses.js';

const INFERENCE_TIMEOUT_MS = 20000;

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Falls back to an inline `eyepop.localize-objects:latest` pop prompted with
 * exactly the class vocabulary in src/vision/fixtureClasses.js, since stock
 * detection models don't emit labels like "cabinet" or "pantry shelf" (see
 * README "Reliable EyePop classes"). If EYEPOP_POP_ID is set, that
 * pre-configured Pop is used instead — reconfigure it in the EyePop
 * dashboard with this same class list if it isn't returning fixture classes.
 */
function buildInlinePop() {
  return {
    components: [
      {
        type: 'inference',
        ability: 'eyepop.localize-objects:latest',
        categoryName: 'fixtures',
        params: { prompts: fixturePrompts() },
      },
    ],
  };
}

/**
 * Runs EyePop object localization on an in-memory image buffer and returns
 * the raw Prediction (source_width/source_height + objects[]) — normalized
 * into our own Detection shape by src/vision/adapter.js.
 *
 * Kept as an alternative provider behind server/visionProviders/index.js;
 * `step` is accepted for interface parity with geminiClient.js but unused —
 * EyePop's object-localization ability has no notion of "interior shot."
 *
 * @param {{ buffer: Buffer, mimeType: string, step?: object, popId?: string, apiKey: string }} args
 */
export async function analyzeCapture({ buffer, mimeType, popId, apiKey }) {
  const endpointOptions = { apiKey };
  if (popId) {
    endpointOptions.popId = popId;
  } else {
    endpointOptions.pop = buildInlinePop();
  }

  const endpoint = await withTimeout(
    EyePop.workerEndpoint(endpointOptions).connect(),
    INFERENCE_TIMEOUT_MS,
    'EyePop connection timed out',
  );

  try {
    const results = await withTimeout(
      endpoint.process({ source: { stream: Readable.from(buffer), mimeType } }),
      INFERENCE_TIMEOUT_MS,
      'EyePop inference timed out',
    );

    for await (const prediction of results) {
      return prediction;
    }
    throw new Error('EyePop returned no prediction for this image');
  } finally {
    await endpoint.disconnect();
  }
}
