import express from 'express';
import multer from 'multer';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getProvider } from './visionProviders/index.js';
import { stepById } from '../src/engine/captureSteps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MOCK_VISION = process.env.MOCK_VISION === 'true';
const PORT = process.env.SCAN_SERVER_PORT || 8787;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
// Dev-only: exposes the complete raw vision-provider response back to the client so a capture
// can be inspected/verified end to end. Never enable in a real deployment (NODE_ENV=production).
const EXPOSE_DEBUG = process.env.NODE_ENV !== 'production';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

// CORS for local dev when the Vite dev server proxy isn't in front of this (e.g. hitting :8787 directly).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/scan/health', (_req, res) => {
  res.json({ ok: true, mock: MOCK_VISION, provider: getProvider().name });
});

async function loadMockData(providerName, stepId) {
  const mockPath = path.join(__dirname, 'mockData', providerName, `${stepId}.json`);
  try {
    return JSON.parse(await readFile(mockPath, 'utf-8'));
  } catch {
    return null;
  }
}

app.post('/api/scan', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'missing_image', message: 'Upload an image under the "image" field.' });
  }

  const stepId = req.body?.stepId;
  const step = stepById(stepId);
  if (!step) {
    return res.status(400).json({ error: 'invalid_step', message: `stepId "${stepId}" is not a recognized capture step. See src/scan/captureSteps.js.` });
  }

  // A client can request a specific backend per-scan (e.g. createScanEngine({ visionBackend })); falls
  // back to the server's VISION_PROVIDER env default when unset or unrecognized. "demo" is handled
  // entirely client-side (src/engine/demoBackend.js) and should never reach this endpoint.
  const requestedBackend = req.body?.visionBackend;
  const provider = getProvider(requestedBackend && requestedBackend !== 'demo' ? requestedBackend : undefined);

  if (MOCK_VISION) {
    console.log(`[scan] MOCK_VISION=true — returning canned ${provider.name}/${stepId} detections instead of calling ${provider.name}.`);
    const mockPrediction = await loadMockData(provider.name, stepId);
    if (!mockPrediction) {
      return res.status(500).json({ error: 'missing_mock_data', message: `No mock fixture for provider "${provider.name}" step "${stepId}" (server/mockData/${provider.name}/${stepId}.json).` });
    }
    return res.json({
      provider: provider.name,
      mock: true,
      stepId,
      prediction: mockPrediction,
      ...(EXPOSE_DEBUG ? { debug: { rawDetections: mockPrediction } } : {}),
    });
  }

  const credentials = provider.credentialArgs(process.env);
  if (!process.env[provider.requiredEnvVar]) {
    return res.status(500).json({
      error: 'missing_credentials',
      message: `Set ${provider.requiredEnvVar} in the server environment for VISION_PROVIDER=${provider.name}, or run with MOCK_VISION=true.`,
    });
  }

  try {
    const prediction = await provider.analyzeCapture({ buffer: req.file.buffer, mimeType: req.file.mimetype, step, ...credentials });
    console.log(`[scan] raw ${provider.name} response for step "${stepId}":`, JSON.stringify(prediction));
    res.json({
      provider: provider.name,
      mock: false,
      stepId,
      prediction,
      ...(EXPOSE_DEBUG ? { debug: { rawDetections: prediction } } : {}),
    });
  } catch (error) {
    console.error(`[scan] ${provider.name} inference failed for step "${stepId}":`, error);
    res.status(502).json({ error: 'inference_failed', message: error?.message || 'Vision inference failed.' });
  }
});

app.listen(PORT, () => {
  console.log(`[scan-server] listening on http://localhost:${PORT} (provider=${getProvider().name}, MOCK_VISION=${MOCK_VISION})`);
});
