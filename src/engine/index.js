/**
 * The engine's public entry point. Everything a host UI needs to run a
 * complete scan lives behind this file — see docs/INTEGRATION.md.
 *
 * `useScanEngine` (the optional React binding) is deliberately NOT
 * re-exported here: it imports 'react', which is not a dependency of this
 * project, and re-exporting it would force every consumer of this barrel
 * (including our own demo UI layer) to resolve 'react' at build time. Import
 * it directly from './useScanEngine.js' in a React host.
 */
export { CAPTURE_STEPS, createScanEngine } from './scanEngine.js';
export { stepById } from './captureSteps.js';
export { BOX_VOLUME_FT3, computeBoxCapacity } from './boxCapacity.js';
export { computeCapacity } from './vision/capacityEngine.js';
export { buildCapacityRecords, buildScanDetail, downloadCapacityExport, postCapacityRecords } from './vision/exportBuilder.js';
export { bindingConstraint, maxQuantities, recommendMix, validateLoad } from './vision/simulator.js';
