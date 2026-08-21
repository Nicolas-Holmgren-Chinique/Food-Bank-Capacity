import { normalizeDetections } from './vision/adapter.js';
import { normalizeGeminiDetections } from './vision/geminiAdapter.js';
import { stepById } from './captureSteps.js';

const MAX_DIMENSION = 1920;

/** Downscales an image file/blob to at most MAX_DIMENSION px on its longest side, client-side, before upload. */
export function downscaleImage(file, maxDimension = MAX_DIMENSION) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const width = Math.round(img.width * scale);
      const height = Math.round(img.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) return reject(new Error('Could not process this image.'));
          resolve({ blob, dataUrl: canvas.toDataURL('image/jpeg', 0.85), width, height });
        },
        'image/jpeg',
        0.85,
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not load this image.'));
    };
    img.src = objectUrl;
  });
}

const ADAPTERS = {
  eyepop: (prediction) => normalizeDetections(prediction),
  gemini: (prediction, step) => normalizeGeminiDetections(prediction, step),
};

/**
 * Uploads an (already downscaled) image blob for one capture step to the
 * thin server proxy at /api/scan and returns { detections, isMock,
 * rawDetections, provider }. Throws with a user-facing message on any
 * failure — callers must show it and let the user fall back to manual
 * entry rather than getting stuck. Never returns synthetic data silently: a
 * failed/unconfigured real call throws, it does not fall back to mock
 * detections.
 *
 * @param {Blob} blob
 * @param {string} stepId - see src/engine/captureSteps.js
 * @param {string} [visionBackend] - 'gemini'|'eyepop'; overrides the server's default VISION_PROVIDER for this request. Omit to use the server default. ('demo' never reaches this function — see demoBackend.js.)
 */
export async function requestScan(blob, stepId, visionBackend) {
  const step = stepById(stepId);
  if (!step) throw new Error(`Unknown capture step "${stepId}".`);

  const formData = new FormData();
  formData.append('image', blob, 'scan.jpg');
  formData.append('stepId', stepId);
  if (visionBackend) formData.append('visionBackend', visionBackend);

  let response;
  try {
    response = await fetch('/api/scan', { method: 'POST', body: formData });
  } catch {
    throw new Error('Could not reach the scan service. Check your connection and try again, or enter capacity manually.');
  }

  if (!response.ok) {
    let message = `Scan failed (${response.status}).`;
    try {
      const body = await response.json();
      if (body?.message) message = body.message;
    } catch {
      // response body wasn't JSON; keep the generic message
    }
    throw new Error(message);
  }

  const body = await response.json();
  const adapt = ADAPTERS[body.provider] || ADAPTERS.gemini;

  return {
    detections: adapt(body.prediction, step),
    isMock: Boolean(body.mock),
    rawDetections: body.debug?.rawDetections ?? body.prediction ?? null,
    provider: body.provider,
  };
}
