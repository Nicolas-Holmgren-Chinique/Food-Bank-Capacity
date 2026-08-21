/**
 * Document-scanner-style auto-capture mechanics: pure pixel math + a small
 * state machine, no DOM/camera APIs. Everything here operates on plain
 * grayscale arrays so it's testable without a browser — captureController.js
 * is the only place that touches <video>/<canvas>/getUserMedia and feeds
 * frames into this module.
 *
 * TUNING: these defaults have not been tuned on a real phone (no camera
 * access in this environment). Expect to adjust stabilityThreshold,
 * motionBurstThreshold, and blurVarianceThreshold against real sensor noise
 * — see the comment on each field.
 *
 * @typedef {Object} AutoCaptureConfig
 * @property {number} analysisWidth - width (px) frames are downscaled to before analysis; height follows the video's aspect ratio. Small on purpose — this runs ~8x/sec.
 * @property {number} sampleIntervalMs - how often captureController samples a frame for analysis (ms). ~120ms ≈ 8/sec, within the "5-10 times/sec" spec range.
 * @property {number} stabilityThreshold - max mean-absolute grayscale difference (0-255 scale) between consecutive analysis frames to count as "holding still." Real camera sensor noise on a stationary phone is usually 1-4; start conservative and lower if it never arms, raise if it arms during small hand tremor.
 * @property {number} stabilityHoldMs - how long stability must hold continuously before a capture fires (spec: ~700-1000ms).
 * @property {number} motionBurstThreshold - min mean-absolute difference to count as "high motion" for the scene-change gate. Should sit clearly above stabilityThreshold with margin, or ordinary hand tremor while "stable" could accidentally satisfy it.
 * @property {number} motionBurstMinMs - how long high motion must hold continuously before the engine re-arms after a capture. Short on purpose — this only needs to distinguish "user is moving to the next spot" from "phone twitched."
 * @property {number} darkLuminanceThreshold - min mean luminance (0-255) required to fire; below this, frames are gated with a "too dark" hint.
 * @property {number} blurVarianceThreshold - min variance-of-Laplacian required to fire; below this, frames are gated with a "hold steady" hint. Needs the most on-device tuning — this is highly sensor/lens dependent.
 * @property {number} cooldownMs - minimum time after a capture before the engine will arm again, even if a motion burst + stability both happen fast (spec: ~2s).
 */

/** @type {AutoCaptureConfig} */
export const DEFAULT_AUTO_CAPTURE_CONFIG = {
  analysisWidth: 160,
  sampleIntervalMs: 120,
  stabilityThreshold: 6,
  stabilityHoldMs: 800,
  motionBurstThreshold: 18,
  motionBurstMinMs: 250,
  darkLuminanceThreshold: 35,
  blurVarianceThreshold: 12,
  cooldownMs: 2000,
};

/** Converts an RGBA pixel buffer (e.g. ImageData.data) to a grayscale Float32Array using standard luma weights. */
export function toGrayscale(rgba) {
  const gray = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 1) {
    gray[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return gray;
}

/** Mean absolute per-pixel difference between two same-sized grayscale frames. Infinity if there's no prior frame or sizes differ (treated as "definitely not stable"). */
export function meanAbsoluteDifference(grayA, grayB) {
  if (!grayA || !grayB || grayA.length !== grayB.length || grayA.length === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < grayA.length; i += 1) sum += Math.abs(grayA[i] - grayB[i]);
  return sum / grayA.length;
}

/** Mean pixel value (0-255) — used as the "too dark" quality gate. */
export function meanLuminance(gray) {
  if (gray.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) sum += gray[i];
  return sum / gray.length;
}

/**
 * Variance of a simple 4-neighbor Laplacian — a standard, cheap sharpness
 * proxy: in-focus images have high-frequency edges (high variance), blurry
 * ones don't. ~15 lines, no library, operates on the same small grayscale
 * frame used for stability.
 */
export function varianceOfLaplacian(gray, width, height) {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += lap;
      sumSq += lap * lap;
      count += 1;
    }
  }
  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/**
 * @typedef {Object} AutoCaptureFrameResult
 * @property {'idle'|'waiting_for_motion'|'arming'|'gated_dark'|'gated_blur'|'cooldown'|'captured'} state
 * @property {number} armProgress - 0-1, drives the progress-ring UI
 * @property {string|null} hint - user-facing reason a ready-looking frame didn't fire
 * @property {boolean} shouldCapture - true exactly once, on the frame that fires
 * @property {number} diff - mean-absolute difference from the previous frame (for debugging/tuning)
 * @property {number} luminance
 * @property {number} sharpness
 */

/**
 * Stateful stability/quality/scene-change engine. One instance per capture
 * session. Feed it grayscale frames in order via ingestFrame(); it never
 * touches the DOM. The manual shutter button is intentionally NOT part of
 * this engine — it captures unconditionally, bypassing all of this.
 *
 * @param {AutoCaptureConfig} [config]
 */
export function createAutoCaptureEngine(config = DEFAULT_AUTO_CAPTURE_CONFIG) {
  let prevGray = null;
  let stableSinceMs = null;
  let highMotionSinceMs = null;
  let motionSatisfied = true; // false right after a capture: must see a motion burst before re-arming
  let cooldownUntilMs = 0;

  /** Call once when a step changes or a capture is deleted/retaken, so leftover motion/stability state doesn't leak across contexts. */
  function reset() {
    prevGray = null;
    stableSinceMs = null;
    highMotionSinceMs = null;
    motionSatisfied = true;
    cooldownUntilMs = 0;
  }

  /**
   * @param {Float32Array} gray - grayscale analysis frame (see toGrayscale)
   * @param {number} width
   * @param {number} height
   * @param {number} nowMs
   * @returns {AutoCaptureFrameResult}
   */
  function ingestFrame(gray, width, height, nowMs) {
    const diff = prevGray ? meanAbsoluteDifference(prevGray, gray) : Infinity;

    if (nowMs < cooldownUntilMs) {
      prevGray = gray;
      return { state: 'cooldown', armProgress: 0, hint: null, shouldCapture: false, diff, luminance: 0, sharpness: 0 };
    }

    if (!motionSatisfied) {
      if (diff >= config.motionBurstThreshold) {
        highMotionSinceMs = highMotionSinceMs ?? nowMs;
        if (nowMs - highMotionSinceMs >= config.motionBurstMinMs) motionSatisfied = true;
      } else {
        highMotionSinceMs = null;
      }
      stableSinceMs = null;
      prevGray = gray;
      return { state: 'waiting_for_motion', armProgress: 0, hint: null, shouldCapture: false, diff, luminance: 0, sharpness: 0 };
    }

    stableSinceMs = diff <= config.stabilityThreshold ? (stableSinceMs ?? nowMs) : null;
    const heldMs = stableSinceMs ? nowMs - stableSinceMs : 0;
    const armProgress = Math.min(1, heldMs / config.stabilityHoldMs);

    if (!stableSinceMs) {
      prevGray = gray;
      return { state: 'idle', armProgress: 0, hint: null, shouldCapture: false, diff, luminance: 0, sharpness: 0 };
    }

    if (heldMs < config.stabilityHoldMs) {
      prevGray = gray;
      return { state: 'arming', armProgress, hint: null, shouldCapture: false, diff, luminance: 0, sharpness: 0 };
    }

    const luminance = meanLuminance(gray);
    const sharpness = varianceOfLaplacian(gray, width, height);

    if (luminance < config.darkLuminanceThreshold) {
      prevGray = gray;
      return { state: 'gated_dark', armProgress: 1, hint: 'Too dark — turn on a light', shouldCapture: false, diff, luminance, sharpness };
    }
    if (sharpness < config.blurVarianceThreshold) {
      prevGray = gray;
      return { state: 'gated_blur', armProgress: 1, hint: 'Hold steady', shouldCapture: false, diff, luminance, sharpness };
    }

    // Fire: require a fresh motion burst (scene change) before arming again, and hold cooldown.
    stableSinceMs = null;
    motionSatisfied = false;
    highMotionSinceMs = null;
    cooldownUntilMs = nowMs + config.cooldownMs;
    prevGray = gray;
    return { state: 'captured', armProgress: 1, hint: null, shouldCapture: true, diff, luminance, sharpness };
  }

  return { ingestFrame, reset };
}
