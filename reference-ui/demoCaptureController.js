/**
 * Camera-free stand-in for captureController.js, used when getUserMedia is
 * unavailable/denied (no camera, non-HTTPS, or explicitly requested) so the
 * guided-capture UX is still demoable on a laptop. Simulates the same
 * "hold steady -> ring fills -> fires" rhythm against bundled sample images
 * instead of a live video frame, then hands the resulting blob to the exact
 * same onCapture callback a real capture would — everything downstream
 * (upload, analysis, aggregation) is identical either way.
 *
 * @param {{ onStatus?: (r: import('./autoCapture.js').AutoCaptureFrameResult) => void, onCapture: (blob: Blob) => void, onError?: (e: Error) => void }} args
 */
export function createDemoCaptureController({ onStatus, onCapture, onError }) {
  const SIMULATED_HOLD_MS = 1400;
  const TICK_MS = 100;

  let timerId = null;
  let pendingSampleUrl = null;

  function clearTimer() {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  async function fetchAsBlob(sampleUrl) {
    const response = await fetch(sampleUrl);
    if (!response.ok) throw new Error(`Could not load sample image: ${sampleUrl}`);
    return response.blob();
  }

  async function fire(sampleUrl) {
    try {
      const blob = await fetchAsBlob(sampleUrl);
      onCapture(blob);
    } catch (error) {
      onError?.(error);
    }
  }

  /** Starts a simulated stability ramp against `sampleUrl`; fires onCapture when it completes. */
  function armForStep(sampleUrl) {
    clearTimer();
    pendingSampleUrl = sampleUrl;
    const startedAt = Date.now();

    function tick() {
      const elapsed = Date.now() - startedAt;
      const armProgress = Math.min(1, elapsed / SIMULATED_HOLD_MS);
      onStatus?.({ state: armProgress < 1 ? 'arming' : 'captured', armProgress, hint: null, shouldCapture: false, diff: 0, luminance: 150, sharpness: 100 });

      if (armProgress >= 1) {
        pendingSampleUrl = null;
        fire(sampleUrl);
        return;
      }
      timerId = setTimeout(tick, TICK_MS);
    }
    tick();
  }

  // Interface parity with captureController.js — no real stream to start/stop.
  async function start() {}
  function stop() {
    clearTimer();
  }
  function resetEngine() {
    clearTimer();
  }

  /** Manual shutter: fires the currently-armed sample immediately, skipping the rest of the simulated ramp. */
  function manualCapture() {
    if (!pendingSampleUrl) return Promise.resolve();
    clearTimer();
    const sampleUrl = pendingSampleUrl;
    pendingSampleUrl = null;
    return fire(sampleUrl);
  }

  return { start, stop, manualCapture, resetEngine, armForStep };
}
