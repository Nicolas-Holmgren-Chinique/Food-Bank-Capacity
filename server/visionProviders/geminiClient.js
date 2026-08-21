import { GoogleGenAI, Type, createPartFromBase64, createUserContent } from '@google/genai';
import { FIXTURE_CLASSES } from '../../src/engine/vision/fixtureClasses.js';

// gemini-2.5-flash is deprecated for this account/key — the API itself returns a 404 pointing
// to gemini-3.6-flash as the replacement. If this key's available models change again, the error
// message from a real /api/scan call (not docs) is the fastest way to find the current name.
const MODEL = 'gemini-3.6-flash';
const REQUEST_TIMEOUT_MS = 20000;

const WIDE_FIXTURE_VOCAB = FIXTURE_CLASSES.map((entry) => entry.promptClass);

const WIDE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    fixtures: {
      type: Type.ARRAY,
      description: 'Every visible kitchen/storage fixture in the photo, from the class vocabulary given in the prompt.',
      items: {
        type: Type.OBJECT,
        properties: {
          class: { type: Type.STRING, description: 'One of the exact class names given in the prompt.' },
          confidence: { type: Type.NUMBER, description: '0-1, how confident you are this is correctly classified.' },
          bbox: {
            type: Type.OBJECT,
            description: 'Bounding box as a fraction (0-1) of the full frame — NOT pixel coordinates.',
            properties: {
              x: { type: Type.NUMBER },
              y: { type: Type.NUMBER },
              width: { type: Type.NUMBER },
              height: { type: Type.NUMBER },
            },
            required: ['x', 'y', 'width', 'height'],
          },
        },
        required: ['class', 'confidence', 'bbox'],
      },
    },
  },
  required: ['fixtures'],
};

const INTERIOR_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    class: { type: Type.STRING, description: 'What kind of fixture this is the inside of.' },
    confidence: { type: Type.NUMBER, description: '0-1, how confident you are in this read.' },
    interiorVolumeFt3: { type: Type.NUMBER, description: 'Estimated total usable interior volume in cubic feet, as if completely empty.' },
    percentFull: { type: Type.NUMBER, description: 'Current fill level as a fraction from 0 (empty) to 1 (completely full) of that interior volume.' },
  },
  required: ['class', 'confidence', 'interiorVolumeFt3', 'percentFull'],
};

function widePrompt() {
  return (
    `You are analyzing a photo of a room (kitchen, pantry, or storage room) for a food-bank capacity survey. ` +
    `Identify every visible fixture that matches one of these exact classes: ${WIDE_FIXTURE_VOCAB.join(', ')}. ` +
    `Only report fixtures you can actually see — do not guess at fixtures that might be off-frame. ` +
    `For each one, give its class (exactly as listed), your confidence (0-1), and its bounding box as a FRACTION of the frame ` +
    `(x/y = top-left corner, width/height = size, all 0-1, not pixels). If nothing matches, return an empty fixtures array.`
  );
}

function interiorPrompt(step) {
  return (
    `You are looking at a close-up photo of the INSIDE of an opened ${step.detectionCategory} — ` +
    `not the outside of the appliance, the interior compartment itself (shelves, drawers, interior walls visible). ` +
    `Estimate the total usable interior volume of this ${step.detectionCategory} in cubic feet (as if it were completely empty), ` +
    `and estimate what fraction of that volume is currently occupied by contents (percentFull, 0 = empty, 1 = completely full). ` +
    `Base the volume estimate on the visible proportions of the interior (shelf spacing, width, depth) — typical residential/small commercial ` +
    `${step.detectionCategory}s. Report your confidence (0-1) in this read as well.`
  );
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Analyzes one capture with Gemini, returning parsed JSON matching either
 * WIDE_SCHEMA or INTERIOR_SCHEMA depending on `step.kind` — normalized into
 * our Detection[] shape by src/vision/geminiAdapter.js.
 *
 * @param {{ buffer: Buffer, mimeType: string, step: import('../../src/scan/captureSteps.js').CAPTURE_STEPS[number], apiKey: string }} args
 */
export async function analyzeCapture({ buffer, mimeType, step, apiKey }) {
  const ai = new GoogleGenAI({ apiKey });
  const isInterior = step.kind === 'interior';

  const response = await withTimeout(
    ai.models.generateContent({
      model: MODEL,
      contents: createUserContent([isInterior ? interiorPrompt(step) : widePrompt(), createPartFromBase64(buffer.toString('base64'), mimeType)]),
      config: {
        responseMimeType: 'application/json',
        responseSchema: isInterior ? INTERIOR_SCHEMA : WIDE_SCHEMA,
      },
    }),
    REQUEST_TIMEOUT_MS,
    'Gemini request timed out',
  );

  if (!response.text) {
    throw new Error('Gemini returned an empty response for this image');
  }

  try {
    return JSON.parse(response.text);
  } catch {
    throw new Error('Gemini returned a response that was not valid JSON');
  }
}
