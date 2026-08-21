import { createAutoCaptureEngine, DEFAULT_AUTO_CAPTURE_CONFIG, toGrayscale } from '../src/engine/autoCapture.js';

/**
 * Owns the live camera stream, the ≤10fps analysis loop (paused while the
 * tab is hidden), and full-resolution frame extraction. Has no knowledge of
 * sessions or UI — it calls `onStatus(frameResult)` on every analyzed frame
 * (drives the progress ring / hint chip) and `onCapture(blob)` whenever a
 * capture fires, whether from the auto-capture engine or the manual shutter.
 *
 * @param {{ videoEl: HTMLVideoElement, config?: import('./autoCapture.js').AutoCaptureConfig, onStatus?: (r: import('./autoCapture.js').AutoCaptureFrameResult) => void, onCapture: (blob: Blob) => void, onError?: (e: Error) => void }} args
 */
export function createCaptureController({ videoEl, config = DEFAULT_AUTO_CAPTURE_CONFIG, onStatus, onCapture, onError }) {
  const analysisCanvas = document.createElement('canvas');
  const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  const engine = createAutoCaptureEngine(config);

  let stream = null;
  let rafId = null;
  let lastSampleAt = 0;
  let running = false;

  function handleVisibility() {
    // Simply skipping analyzeFrame while hidden is enough — no separate "paused" flag needed
    // since the rAF loop itself keeps ticking (cheap) but does no canvas/pixel work when hidden.
  }

  function loop(now) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (document.hidden) return;
    if (now - lastSampleAt < config.sampleIntervalMs) return;
    lastSampleAt = now;
    analyzeFrame(now);
  }

  function analyzeFrame(now) {
    const videoWidth = videoEl.videoWidth;
    const videoHeight = videoEl.videoHeight;
    if (!videoWidth || !videoHeight) return;

    const scale = config.analysisWidth / videoWidth;
    const width = config.analysisWidth;
    const height = Math.max(1, Math.round(videoHeight * scale));
    analysisCanvas.width = width;
    analysisCanvas.height = height;
    analysisCtx.drawImage(videoEl, 0, 0, width, height);

    let imageData;
    try {
      imageData = analysisCtx.getImageData(0, 0, width, height);
    } catch {
      return; // e.g. tainted canvas — shouldn't happen with a local camera stream, but don't crash the loop
    }

    const gray = toGrayscale(imageData.data);
    const result = engine.ingestFrame(gray, width, height, now);
    onStatus?.(result);
    if (result.shouldCapture) fireCapture();
  }

  function captureFullResFrame() {
    return new Promise((resolve, reject) => {
      const videoWidth = videoEl.videoWidth;
      const videoHeight = videoEl.videoHeight;
      const canvas = document.createElement('canvas');
      canvas.width = videoWidth;
      canvas.height = videoHeight;
      canvas.getContext('2d').drawImage(videoEl, 0, 0, videoWidth, videoHeight);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not capture this frame.'))), 'image/jpeg', 0.92);
    });
  }

  async function fireCapture() {
    try {
      const blob = await captureFullResFrame();
      onCapture(blob);
    } catch (error) {
      onError?.(error);
    }
  }

  /** Starts the rear camera and the analysis loop. Throws if getUserMedia is unavailable/denied — the caller should fall back to demo mode or manual upload. */
  async function start() {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    videoEl.srcObject = stream;
    await videoEl.play();
    running = true;
    document.addEventListener('visibilitychange', handleVisibility);
    lastSampleAt = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('visibilitychange', handleVisibility);
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  /** Manual shutter: captures immediately, completely bypassing the auto-capture engine. Always available, always works. */
  function manualCapture() {
    return fireCapture();
  }

  /** Call when advancing to a new step, or after deleting a capture, so stale stability/motion state doesn't leak across contexts. */
  function resetEngine() {
    engine.reset();
  }

  return { start, stop, manualCapture, resetEngine };
}
