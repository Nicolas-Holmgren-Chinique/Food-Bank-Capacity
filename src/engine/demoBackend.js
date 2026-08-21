import { stepById } from './captureSteps.js';
import { normalizeGeminiDetections } from './vision/geminiAdapter.js';
import wide from './demoFixtures/wide.json' with { type: 'json' };
import fridgeInterior from './demoFixtures/fridge_interior.json' with { type: 'json' };
import freezerInterior from './demoFixtures/freezer_interior.json' with { type: 'json' };
import cabinetInterior from './demoFixtures/cabinet_interior.json' with { type: 'json' };
import shelvingFloor from './demoFixtures/shelving_floor.json' with { type: 'json' };

const FIXTURES_BY_STEP = {
  wide,
  fridge_interior: fridgeInterior,
  freezer_interior: freezerInterior,
  cabinet_interior: cabinetInterior,
  shelving_floor: shelvingFloor,
};

/**
 * The `demo` vision backend: canned per-step detections bundled with the
 * client, so `createScanEngine({ visionBackend: 'demo' })` runs a full scan
 * without ever calling the server proxy or a real vision API — true offline
 * operation, not just canned-server-response mocking (see MOCK_VISION for
 * that, a separate server-side dev convenience for exercising the real
 * gemini/eyepop code paths without live credentials).
 *
 * @param {string} stepId - see captureSteps.js
 */
export async function analyzeDemoCapture(stepId) {
  const step = stepById(stepId);
  const fixture = FIXTURES_BY_STEP[stepId];
  if (!step || !fixture) throw new Error(`No demo fixture for capture step "${stepId}".`);

  return {
    detections: normalizeGeminiDetections(fixture, step),
    isMock: true,
    rawDetections: fixture,
    provider: 'demo',
  };
}
