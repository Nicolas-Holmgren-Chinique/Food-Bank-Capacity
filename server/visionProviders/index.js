import * as eyepopClient from './eyepopClient.js';
import * as geminiClient from './geminiClient.js';

/**
 * Vision-backend selection. Gemini is primary (see README); EyePop is kept
 * as a pluggable alternative behind the exact same `analyzeCapture()`
 * signature, selected via VISION_PROVIDER — no other code needs to know
 * which one is active.
 */
const PROVIDERS = {
  gemini: {
    name: 'gemini',
    analyzeCapture: geminiClient.analyzeCapture,
    requiredEnvVar: 'GEMINI_API_KEY',
    credentialArgs: (env) => ({ apiKey: env.GEMINI_API_KEY }),
  },
  eyepop: {
    name: 'eyepop',
    analyzeCapture: eyepopClient.analyzeCapture,
    requiredEnvVar: 'EYEPOP_API_KEY',
    credentialArgs: (env) => ({ apiKey: env.EYEPOP_API_KEY, popId: env.EYEPOP_POP_ID || undefined }),
  },
};

export function getProvider(name = process.env.VISION_PROVIDER) {
  return PROVIDERS[name] || PROVIDERS.gemini;
}
