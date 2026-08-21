import { useEffect, useMemo, useState } from 'react';
import { createScanEngine } from './scanEngine.js';

/**
 * Optional React binding for createScanEngine(). Not imported by
 * src/engine/index.js or anything else in this repo — react is not a
 * dependency of this project, so this file is only ever loaded by a host
 * app that has react installed (see docs/INTEGRATION.md). Import it
 * directly: `import { useScanEngine } from '.../engine/useScanEngine.js'`.
 *
 * Creates one engine instance for the lifetime of the calling component —
 * `options` is only read on first render.
 *
 * @param {{ visionBackend?: 'gemini'|'eyepop'|'demo', agencyId?: string }} [options]
 * @returns {{ state: import('./scanEngine.js').ScanEngineState, engine: ReturnType<typeof createScanEngine> }}
 */
export function useScanEngine(options) {
  const engine = useMemo(() => createScanEngine(options), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [state, setState] = useState(() => engine.getState());

  useEffect(() => engine.subscribe(setState), [engine]);

  return { state, engine };
}
