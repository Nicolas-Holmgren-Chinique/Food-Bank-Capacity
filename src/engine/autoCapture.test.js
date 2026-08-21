import { describe, expect, it } from 'vitest';
import {
  createAutoCaptureEngine,
  DEFAULT_AUTO_CAPTURE_CONFIG,
  meanAbsoluteDifference,
  meanLuminance,
  toGrayscale,
  varianceOfLaplacian,
} from './autoCapture.js';

const CONFIG = DEFAULT_AUTO_CAPTURE_CONFIG;

/** A flat mid-gray frame — stable and bright enough, but zero texture (blurry by design, for gate tests). */
function flatFrame(width, height, value = 150) {
  return new Float32Array(width * height).fill(value);
}

/** A checkerboard frame — stable across identical calls, bright, and textured enough to pass the blur gate. */
function checkerFrame(width, height, low = 60, high = 220) {
  const gray = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      gray[y * width + x] = (x + y) % 2 === 0 ? low : high;
    }
  }
  return gray;
}

function noisyFrame(width, height, seedOffset = 0) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    // deterministic pseudo-noise, not Math.random(), so tests are reproducible
    gray[i] = 128 + (((i * 9301 + seedOffset * 49297) % 233280) / 233280 - 0.5) * 200;
  }
  return gray;
}

describe('pixel-math primitives', () => {
  it('toGrayscale applies standard luma weights to an RGBA buffer', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255]); // one red px, one green px
    const gray = toGrayscale(rgba);
    expect(gray.length).toBe(2);
    expect(gray[0]).toBeCloseTo(0.299 * 255, 1);
    expect(gray[1]).toBeCloseTo(0.587 * 255, 1);
  });

  it('meanAbsoluteDifference is 0 for identical frames and Infinity with no prior frame', () => {
    const a = checkerFrame(10, 10);
    expect(meanAbsoluteDifference(a, a)).toBe(0);
    expect(meanAbsoluteDifference(null, a)).toBe(Infinity);
  });

  it('meanAbsoluteDifference is large between very different frames', () => {
    const a = flatFrame(10, 10, 10);
    const b = flatFrame(10, 10, 245);
    expect(meanAbsoluteDifference(a, b)).toBeCloseTo(235, 0);
  });

  it('meanLuminance reflects brightness', () => {
    expect(meanLuminance(flatFrame(5, 5, 10))).toBeCloseTo(10, 5);
    expect(meanLuminance(flatFrame(5, 5, 200))).toBeCloseTo(200, 5);
  });

  it('varianceOfLaplacian is 0 for a perfectly flat frame and large for a checkerboard', () => {
    expect(varianceOfLaplacian(flatFrame(20, 20), 20, 20)).toBe(0);
    expect(varianceOfLaplacian(checkerFrame(20, 20), 20, 20)).toBeGreaterThan(1000);
  });
});

describe('createAutoCaptureEngine — stability arming and firing', () => {
  it('stays idle on the very first frame (no prior frame to diff against)', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    const result = engine.ingestFrame(checkerFrame(20, 20), 20, 20, 0);
    expect(result.state).toBe('idle');
    expect(result.shouldCapture).toBe(false);
  });

  it('arms progressively and fires after stabilityHoldMs of a held, bright, textured scene', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    const frame = checkerFrame(20, 20);
    let t = 0;
    let last = engine.ingestFrame(frame, 20, 20, t); // first frame: idle
    expect(last.state).toBe('idle');

    t += CONFIG.sampleIntervalMs;
    last = engine.ingestFrame(frame, 20, 20, t); // stability begins this tick — progress starts at 0
    expect(last.state).toBe('arming');
    expect(last.armProgress).toBe(0);

    t += CONFIG.sampleIntervalMs;
    last = engine.ingestFrame(frame, 20, 20, t); // still held one tick later — progress now advancing
    expect(last.state).toBe('arming');
    expect(last.armProgress).toBeGreaterThan(0);
    expect(last.armProgress).toBeLessThan(1);

    // advance in small steps until stabilityHoldMs elapses from when stability began
    while (t < CONFIG.stabilityHoldMs + CONFIG.sampleIntervalMs * 2) {
      t += CONFIG.sampleIntervalMs;
      last = engine.ingestFrame(frame, 20, 20, t);
      if (last.shouldCapture) break;
    }

    expect(last.state).toBe('captured');
    expect(last.shouldCapture).toBe(true);
    expect(last.armProgress).toBe(1);
  });

  it('never fires on a continuously noisy (unstable) scene', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    let t = 0;
    let fired = false;
    for (let i = 0; i < 60; i += 1) {
      t += CONFIG.sampleIntervalMs;
      const result = engine.ingestFrame(noisyFrame(20, 20, i), 20, 20, t);
      if (result.shouldCapture) fired = true;
    }
    expect(fired).toBe(false);
  });

  it('resets stability if motion interrupts an in-progress arm', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    let t = 0;
    engine.ingestFrame(checkerFrame(20, 20), 20, 20, t); // idle (first frame)
    t += CONFIG.sampleIntervalMs;
    let result = engine.ingestFrame(checkerFrame(20, 20), 20, 20, t); // arming
    expect(result.state).toBe('arming');

    // a big jolt of motion — should drop back to idle, not keep arming
    t += CONFIG.sampleIntervalMs;
    result = engine.ingestFrame(noisyFrame(20, 20, 999), 20, 20, t);
    expect(result.state).toBe('idle');
    expect(result.armProgress).toBe(0);
  });
});

describe('createAutoCaptureEngine — quality gates', () => {
  it('gates a dark-but-stable scene with a "too dark" hint and does not fire', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    // dark checkerboard: stable + textured, but below darkLuminanceThreshold
    const dark = checkerFrame(20, 20, 5, 25);
    let t = 0;
    engine.ingestFrame(dark, 20, 20, t);
    let result;
    while (t < CONFIG.stabilityHoldMs + CONFIG.sampleIntervalMs * 3) {
      t += CONFIG.sampleIntervalMs;
      result = engine.ingestFrame(dark, 20, 20, t);
      if (result.state !== 'arming' && result.state !== 'idle') break;
    }
    expect(result.state).toBe('gated_dark');
    expect(result.hint).toMatch(/dark/i);
    expect(result.shouldCapture).toBe(false);
  });

  it('gates a bright-but-flat (blurry) scene with a "hold steady" hint and does not fire', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    const blurry = flatFrame(20, 20, 150); // stable + bright, but zero texture
    let t = 0;
    engine.ingestFrame(blurry, 20, 20, t);
    let result;
    while (t < CONFIG.stabilityHoldMs + CONFIG.sampleIntervalMs * 3) {
      t += CONFIG.sampleIntervalMs;
      result = engine.ingestFrame(blurry, 20, 20, t);
      if (result.state !== 'arming' && result.state !== 'idle') break;
    }
    expect(result.state).toBe('gated_blur');
    expect(result.hint).toMatch(/steady/i);
    expect(result.shouldCapture).toBe(false);
  });
});

describe('createAutoCaptureEngine — scene-change gate and cooldown (prevents re-capturing the same held shot)', () => {
  function fireOnce(engine, frame, tStart) {
    let t = tStart;
    engine.ingestFrame(frame, 20, 20, t);
    let result;
    for (let i = 0; i < 40; i += 1) {
      t += CONFIG.sampleIntervalMs;
      result = engine.ingestFrame(frame, 20, 20, t);
      if (result.shouldCapture) return { t, result };
    }
    throw new Error('expected a capture to fire in fireOnce()');
  }

  it('does not fire again while the same scene is held after a capture (cooldown + motion gate)', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    const frame = checkerFrame(20, 20);
    const { t: firedAt } = fireOnce(engine, frame, 0);

    let t = firedAt;
    let firedAgain = false;
    // keep holding the exact same steady scene well past cooldown
    for (let i = 0; i < 60; i += 1) {
      t += CONFIG.sampleIntervalMs;
      const result = engine.ingestFrame(frame, 20, 20, t);
      if (result.shouldCapture) firedAgain = true;
      expect(result.state).not.toBe('arming'); // should be stuck waiting_for_motion, never re-arm on held scene
    }
    expect(firedAgain).toBe(false);
  });

  it('re-arms and fires again after a motion burst followed by a new steady scene', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    const sceneA = checkerFrame(20, 20, 40, 200);
    const { t: firedAt } = fireOnce(engine, sceneA, 0);

    let t = firedAt + CONFIG.cooldownMs; // clear cooldown
    // motion burst: alternate wildly different frames to guarantee a large diff each step
    for (let i = 0; i < 10; i += 1) {
      t += CONFIG.sampleIntervalMs;
      engine.ingestFrame(i % 2 === 0 ? flatFrame(20, 20, 0) : flatFrame(20, 20, 255), 20, 20, t);
    }

    // settle on a new steady, textured, bright scene
    const sceneB = checkerFrame(20, 20, 60, 230);
    let result;
    for (let i = 0; i < 40; i += 1) {
      t += CONFIG.sampleIntervalMs;
      result = engine.ingestFrame(sceneB, 20, 20, t);
      if (result.shouldCapture) break;
    }
    expect(result.shouldCapture).toBe(true);
  });

  it('reset() clears stability/motion state so a fresh scene can arm immediately from idle', () => {
    const engine = createAutoCaptureEngine(CONFIG);
    fireOnce(engine, checkerFrame(20, 20), 0);
    engine.reset();
    const result = engine.ingestFrame(checkerFrame(20, 20, 30, 210), 20, 20, 0);
    expect(result.state).toBe('idle'); // first frame after reset, no prior frame yet — not stuck waiting_for_motion
  });
});
