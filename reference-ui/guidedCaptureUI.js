import { icon } from './icons.js';
import foods from '../src/engine/vision/foods.json' with { type: 'json' };
import { CAPTURE_STEPS, bindingConstraint, createScanEngine, maxQuantities, recommendMix, stepById, validateLoad } from '../src/engine/index.js';
import { createCaptureController } from './captureController.js';
import { createDemoCaptureController } from './demoCaptureController.js';

const CAPACITY_TYPE_LABEL = { refrigerated_storage: 'Refrigerated', frozen_storage: 'Frozen', dry_storage: 'Dry storage', floor_staging: 'Floor / staging' };
const CATEGORY_LABEL = { cold: 'Refrigerated', frozen: 'Frozen', dry: 'Dry storage' };
const VOLUME_SOURCE_LABEL = {
  bbox_scaled: 'Volume scaled from detected size',
  default: 'Class default (no size signal)',
  manual: 'Manually entered',
  floor_heuristic: 'Estimated from floor heuristic',
  gemini_interior: 'Estimated from interior + fill level',
};
const BOX_CONSTRAINT_LABEL = { dry: 'Dry storage', refrigerated: 'Refrigerated', frozen: 'Frozen' };

// Demo mode (no camera / getUserMedia denied): bundled sample images per step, auto-"captured"
// on a simulated stability ramp so the guided flow is demoable on a laptop. Steps not listed
// here (there are none currently) would just show nothing to auto-capture.
const DEMO_SAMPLES = {
  wide: ['/samples/sample-1.svg'],
  fridge_interior: ['/samples/interior-fridge.svg'],
  freezer_interior: ['/samples/interior-freezer.svg'],
  cabinet_interior: ['/samples/interior-cabinet.svg', '/samples/interior-cabinet.svg'],
  shelving_floor: ['/samples/sample-2.svg'],
};

function fmt(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Launches the full-screen guided auto-capture scan flow. This is the
 * REFERENCE implementation — a disposable test harness/demo fallback that
 * drives `createScanEngine()` exactly like any other host UI would (see
 * docs/INTEGRATION.md). It owns zero capacity/vision business logic: every
 * number rendered here comes from `engine.getState()`, and every mutation
 * goes through an engine method. Owns its own root element appended to
 * <body>, and tears itself down completely on close.
 *
 * @param {{ onDone?: () => void, visionBackend?: 'gemini'|'eyepop'|'demo' }} [handlers]
 */
export function initGuidedCaptureFlow({ onDone, visionBackend } = {}) {
  const engine = createScanEngine({ visionBackend });
  let state = engine.getState();
  const demoSampleCursor = {}; // stepId -> next sample index (UI-only concern, not engine state)

  let stepIndex = 0;
  let phase = 'capture'; // capture | review | simulate | export
  let cameraMode = 'checking'; // checking | live | demo
  let cameraErrorMessage = null;
  let frameStatus = { state: 'idle', armProgress: 0, hint: null };
  let controller = null;
  let simulatedLoad = { cold: [], frozen: [], dry: [] };
  let selectedCaptureId = null;

  const root = document.createElement('div');
  root.className = 'guided-capture-root';
  document.body.appendChild(root);
  document.body.classList.add('modal-open');

  const unsubscribe = engine.subscribe((next) => {
    state = next;
    render();
  });

  function currentStep() {
    return CAPTURE_STEPS[stepIndex];
  }

  function render() {
    root.innerHTML = phase === 'capture' ? captureMarkup() : phase === 'review' ? reviewMarkup() : phase === 'simulate' ? simulateMarkup() : exportMarkup();
    wireEvents();
  }

  // ---------------- Capture phase ----------------

  function captureMarkup() {
    const step = currentStep();
    const captures = state.captures.filter((c) => c.stepId === step.id);
    const ringPercent = Math.round((frameStatus.armProgress || 0) * 100);
    const stateLabel = { idle: '', arming: 'Hold steady…', gated_dark: 'Too dark', gated_blur: 'Hold steady', waiting_for_motion: 'Move to the next spot', cooldown: 'Captured', captured: 'Captured' }[frameStatus.state] || '';

    return `
      <div class="gcap-topbar">
        <span class="gcap-step-counter">Step ${stepIndex + 1} of ${CAPTURE_STEPS.length}</span>
        <button class="gcap-close" type="button" data-gcap-close aria-label="Close scan">${icon('close')}</button>
      </div>

      <div class="gcap-viewport">
        <video class="gcap-video ${cameraMode === 'live' ? '' : 'is-hidden'}" playsinline muted autoplay data-gcap-video></video>
        ${cameraMode === 'demo' ? `<div class="gcap-demo-preview"><span class="gcap-demo-badge">${icon('alert')} Demo mode — no camera</span>${currentDemoImageSrc() ? `<img class="gcap-demo-image" src="${currentDemoImageSrc()}" alt="" />` : ''}</div>` : ''}
        ${cameraMode === 'checking' ? '<div class="gcap-demo-preview"><span>Requesting camera…</span></div>' : ''}

        <svg class="gcap-ring" viewBox="0 0 100 100" aria-hidden="true">
          <circle class="gcap-ring-track" cx="50" cy="50" r="44" />
          <circle class="gcap-ring-fill" cx="50" cy="50" r="44" stroke-dasharray="276.5" stroke-dashoffset="${276.5 * (1 - (frameStatus.armProgress || 0))}" />
        </svg>
        ${stateLabel ? `<div class="gcap-state-chip ${frameStatus.state.startsWith('gated') ? 'is-gated' : ''}">${stateLabel}</div>` : ''}
        ${frameStatus.hint ? `<div class="gcap-hint-chip">${frameStatus.hint}</div>` : ''}
      </div>

      <div class="gcap-step-panel">
        <div class="gcap-step-icon">${icon(iconForStep(step.icon))}</div>
        <h2>${step.label}</h2>
        <p>${step.hint}</p>
        ${captures.length > 0 ? `<span class="gcap-capture-count">${captures.length} capture${captures.length === 1 ? '' : 's'} on this step</span>` : ''}
        ${cameraErrorMessage ? `<div class="scan-alert">${icon('alert')}<span>${escapeHtml(cameraErrorMessage)}</span></div>` : ''}
      </div>

      ${state.captures.length > 0 ? filmstripMarkup(state.captures, { deletable: true }) : ''}

      <div class="gcap-controls">
        <button class="gcap-shutter" type="button" data-gcap-shutter aria-label="Capture now">${icon('camera')}</button>
        <div class="gcap-controls-row">
          <button class="chip-button" type="button" data-gcap-skip>Skip this step</button>
          <button class="chip-button" type="button" data-gcap-continue>${step.multiCapture ? 'Done with this step' : 'Continue'} ${icon('arrow')}</button>
        </div>
        <label class="gcap-upload-fallback">
          ${icon('upload')} <span>Or upload a photo instead</span>
          <input type="file" accept="image/*" data-gcap-upload hidden />
        </label>
      </div>
    `;
  }

  function filmstripMarkup(captures, { deletable }) {
    return `
      <div class="gcap-filmstrip">
        ${captures
          .map(
            (capture) => `
          <button class="gcap-thumb gcap-thumb-${capture.status}" type="button" data-gcap-thumb="${capture.captureId}" title="${stepById(capture.stepId)?.label ?? capture.stepId}">
            <img src="${capture.imageDataUrl}" alt="" />
            ${capture.status === 'analyzing' ? '<span class="gcap-thumb-spinner"></span>' : ''}
            ${capture.status === 'failed' ? `<span class="gcap-thumb-badge is-error">${icon('alert')}</span>` : ''}
            ${capture.status === 'done' ? '<span class="gcap-thumb-badge is-ok">✓</span>' : ''}
            ${deletable ? `<span class="gcap-thumb-delete" data-gcap-delete-thumb="${capture.captureId}">${icon('trash')}</span>` : ''}
          </button>
        `,
          )
          .join('')}
      </div>
    `;
  }

  function currentDemoImageSrc() {
    const step = currentStep();
    const samples = DEMO_SAMPLES[step.id] || [];
    const cursor = demoSampleCursor[step.id] || 0;
    return samples[cursor] || samples[samples.length - 1] || null;
  }

  function iconForStep(iconName) {
    return { room: 'pin', fridge: 'spark', freezer: 'spark', cabinet: 'spark', shelving: 'spark' }[iconName] || 'spark';
  }

  // ---------------- Review phase ----------------

  function reviewMarkup() {
    const capacity = state.capacity;
    const constraint = bindingConstraint(capacity);

    const groups = CAPTURE_STEPS.map((step) => {
      const stepCaptures = state.captures.filter((c) => c.stepId === step.id && c.status === 'done');
      if (stepCaptures.length === 0) return '';
      const rows = stepCaptures
        .flatMap((capture) => capture.detections.map((detection) => fixtureRowMarkup(detection, capture)))
        .join('');
      return `
        <div class="gcap-review-group ${selectedCaptureId && stepCaptures.some((c) => c.captureId === selectedCaptureId) ? 'is-highlighted' : ''}">
          <h3>${step.label}${step.excludeFromTotalsByDefault ? ' <small>(shown for context — counted via close-up scans)</small>' : ''}</h3>
          ${rows}
        </div>
      `;
    }).join('');

    return `
      <div class="gcap-topbar">
        <span class="gcap-step-counter">Review</span>
        <button class="gcap-close" type="button" data-gcap-close aria-label="Close scan">${icon('close')}</button>
      </div>
      <div class="gcap-sheet">
        <p class="eyebrow">Review detections</p>
        <h2>What did we find?</h2>
        <p class="modal-intro">Toggle "occupied" for anything that's not usable right now. Wide-shot fixtures start unchecked since the close-up scans are the source of truth for volume.</p>

        ${demoBadgeMarkup()}
        ${filmstripMarkup(state.captures, { deletable: false })}

        <div class="gcap-add-fixture">
          <select data-add-category>
            <option value="refrigerator">Refrigerator</option>
            <option value="freezer">Freezer</option>
            <option value="cabinet">Cabinet</option>
            <option value="shelving">Shelving unit</option>
            <option value="pantry">Pantry</option>
          </select>
          <button class="chip-button" type="button" data-add-fixture>+ Add a fixture we missed</button>
        </div>

        ${groups || '<p class="scan-empty">No fixtures captured yet.</p>'}

        ${floorBlockMarkup()}

        ${capacitySummaryMarkup(capacity)}

        <div class="gcap-binding-constraint">
          <strong>${CAPACITY_TYPE_LABEL[constraint.capacityType] || constraint.capacityType}</strong> is your binding constraint — about <strong>${constraint.mealsEquivalent}</strong> meals worth right now.
        </div>

        ${boxCapacityMarkup()}

        <label class="form-field"><span>Facility name or ID</span><input type="text" id="gcap-facility-id" placeholder="e.g. Oak Street Kitchen" value="${escapeHtml(state.agencyId)}" /></label>

        <button class="button button-dark form-submit" type="button" data-go-simulate>Continue to simulate a delivery ${icon('arrow')}</button>
      </div>
    `;
  }

  function boxCapacityMarkup() {
    const boxes = state.boxes;
    return `
      <div class="gcap-box-capacity">
        <h3>Box capacity</h3>
        <p class="scan-fixture-meta">Estimated from net capacity at ~1.5 ft³/box. Binding constraint: <strong>${BOX_CONSTRAINT_LABEL[boxes.bindingConstraint] || boxes.bindingConstraint}</strong>.</p>
        <div class="scan-fixture-fields">
          <span class="scan-food-max">Computed: ${boxes.computedBoxes} boxes</span>
          <label class="form-field"><span>Override (rep's manual count)</span><input type="number" min="0" step="1" placeholder="e.g. 40" value="${boxes.overrideBoxes ?? ''}" data-box-override /></label>
        </div>
      </div>
    `;
  }

  function fixtureRowMarkup(detection, capture) {
    const excluded = state.exclusions.fixtureIds.includes(detection.id) || detection.excluded;
    const capacityType = overriddenValue(detection.id, 'capacityType', detection.capacityType);
    const volume = overriddenNumber(detection.id, 'estimatedVolumeFt3', detection.estimatedVolumeFt3 ?? 0);
    const confidence = typeof detection.confidence === 'number' ? `${Math.round(detection.confidence * 100)}%` : detection.source === 'manual' ? 'manual' : '—';
    const isKitchenFixture = detection.category === 'kitchen_fixture';
    const isFloor = detection.category === 'floor';
    if (isFloor) return ''; // floor is rendered in floorBlockMarkup instead
    const volumeSource = overriddenVolumeSource(detection);
    const hasPercentFull = typeof detection.percentFull === 'number';
    const percentFull = overriddenNumber(detection.id, 'percentFull', detection.percentFull ?? 0);

    return `
      <div class="scan-fixture-row ${excluded ? 'is-excluded' : ''}" data-fixture-id="${detection.id}" data-capture-id="${capture.captureId}">
        <div class="scan-fixture-head">
          <strong>${labelForCategory(detection.category)}</strong>
          <span class="scan-fixture-meta">${detection.rawClass} · ${confidence}</span>
        </div>
        ${
          isKitchenFixture
            ? `<span class="scan-fixture-note">${detection.mealPrepFlag ? 'Counts toward meal-prep capability' : 'No storage contribution'}</span>`
            : `<div class="scan-fixture-fields">
                <label class="form-field"><span>Capacity type</span>
                  <select data-fixture-field="capacityType">
                    <option value="refrigerated_storage" ${capacityType === 'refrigerated_storage' ? 'selected' : ''}>Refrigerated</option>
                    <option value="frozen_storage" ${capacityType === 'frozen_storage' ? 'selected' : ''}>Frozen</option>
                    <option value="dry_storage" ${capacityType === 'dry_storage' ? 'selected' : ''}>Dry storage</option>
                  </select>
                </label>
                ${
                  hasPercentFull
                    ? `<label class="form-field"><span>Fill level (%)</span><input type="number" min="0" max="100" step="5" value="${Math.round(percentFull * 100)}" data-fixture-field="percentFullPercent" /></label>`
                    : `<label class="form-field"><span>Volume (ft³)</span><input type="number" min="0" step="0.5" value="${volume}" data-fixture-field="estimatedVolumeFt3" /></label>`
                }
              </div>
              ${hasPercentFull ? `<span class="scan-fixture-meta">Net usable: ${fmt(volume)} ft³ of ${fmt(detection.interiorVolumeFt3 ?? 0)} ft³</span>` : ''}
              <span class="scan-volume-source">${VOLUME_SOURCE_LABEL[volumeSource] || volumeSource}</span>`
        }
        <label class="scan-exclude-toggle"><input type="checkbox" data-fixture-exclude ${excluded ? 'checked' : ''} /><span>Occupied / unusable right now</span></label>
      </div>
    `;
  }

  function floorBlockMarkup() {
    const floorDetections = state.fixtures.filter((d) => d.category === 'floor');
    if (floorDetections.length === 0) return '';
    const primary = floorDetections[0];
    const floorArea = overriddenNumber(primary.id, 'estimatedAreaFt2', primary.estimatedAreaFt2 ?? 0);
    const excludedFloor = state.exclusions.floorZones.reduce((sum, zone) => sum + (zone.areaFt2 || 0), 0);
    return `
      <div class="scan-floor-block">
        <h3>Floor / staging space</h3>
        <div class="scan-floor-fields">
          <label class="form-field"><span>Estimated free floor space (ft²)</span><input type="number" min="0" step="1" value="${floorArea}" data-floor-area /></label>
          <label class="form-field"><span>Already reserved/occupied (ft²)</span><input type="number" min="0" step="1" value="${excludedFloor}" data-floor-excluded /></label>
        </div>
      </div>
    `;
  }

  function capacitySummaryMarkup(capacity) {
    return `
      <div class="scan-capacity-summary">
        ${Object.entries(CAPACITY_TYPE_LABEL)
          .filter(([type]) => type !== 'floor_staging')
          .map(([type, label]) => {
            const bucket = capacity[type];
            return `<div class="scan-capacity-chip"><strong>${fmt(bucket.net)}</strong><span>${label} (ft³)</span><small>${fmt(bucket.gross)} known</small></div>`;
          })
          .join('')}
        <div class="scan-capacity-chip"><strong>${fmt(capacity.floor_staging.net)}</strong><span>Floor (ft²)</span><small>${capacity.floor_staging.palletSlots} pallet slots</small></div>
        ${capacity.mealPrepCapable ? '<div class="scan-capacity-chip is-flag"><strong>🍳</strong><span>Meal-prep capable</span></div>' : ''}
      </div>
    `;
  }

  // ---------------- Simulate phase ----------------

  function simulateMarkup() {
    const capacity = state.capacity;
    const validation = validateLoad(simulatedLoad, capacity);
    const { maxUnits, totalMealsEquivalent } = maxQuantities(capacity);

    const byCategoryMarkup = Object.entries(CATEGORY_LABEL)
      .map(([category, label]) => {
        const items = foods.filter((food) => food.category === category);
        const rows = items
          .map((food) => {
            const line = (simulatedLoad[category] || []).find((l) => l.foodId === food.id);
            const units = line?.units ?? 0;
            return `
              <div class="scan-food-row">
                <span class="scan-food-label">${food.icon} ${food.name}</span>
                <span class="scan-food-max">max ${maxUnits[food.id]}</span>
                <input type="number" min="0" step="1" value="${units}" data-food-units data-category="${category}" data-food-id="${food.id}" />
              </div>
            `;
          })
          .join('');
        const catResult = validation.byCategory[category];
        return `
          <div class="scan-sim-category">
            <div class="scan-sim-category-head">
              <h3>${label}</h3>
              <span class="scan-chip ${catResult.fits ? 'is-ok' : 'is-over'}">${fmt(catResult.requestedFt3)} / ${fmt(catResult.capacityFt3)} ft³</span>
            </div>
            ${rows}
          </div>
        `;
      })
      .join('');

    const floorResult = validation.byCategory.floor;

    return `
      <div class="gcap-topbar">
        <span class="gcap-step-counter">Simulate</span>
        <button class="gcap-close" type="button" data-gcap-close aria-label="Close scan">${icon('close')}</button>
      </div>
      <div class="gcap-sheet">
        <p class="eyebrow">Fit simulator</p>
        <h2>Simulate a delivery.</h2>
        <p class="modal-intro">Enter quantities to check whether a delivery fits, or see what this facility can support right now.</p>

        ${demoBadgeMarkup()}

        <div class="scan-sim-summary">
          <div><strong>${totalMealsEquivalent}</strong><span>max meals-equivalent right now</span></div>
          <div><strong>${fmt(floorResult.requestedFt2)} / ${fmt(floorResult.capacityFt2)}</strong><span>ft² floor used</span></div>
          <span class="scan-chip ${validation.overallFits ? 'is-ok' : 'is-over'}">${validation.overallFits ? 'Fits' : 'Over capacity'}</span>
        </div>

        ${byCategoryMarkup}

        <div class="scan-sim-actions">
          <button class="chip-button" type="button" data-recommend-mix>Suggest a balanced load</button>
          <button class="chip-button" type="button" data-clear-load>Clear</button>
        </div>

        <button class="button button-dark form-submit" type="button" data-go-export>Continue to export ${icon('arrow')}</button>
      </div>
    `;
  }

  // ---------------- Export phase ----------------

  function exportMarkup() {
    const result = engine.getResult();
    const rows = [
      ['dryFt3', 'Dry storage'],
      ['refrigeratedFt3', 'Refrigerated'],
      ['frozenFt3', 'Frozen'],
    ].filter(([key]) => result.capacity[key].gross > 0);

    return `
      <div class="gcap-topbar">
        <span class="gcap-step-counter">Export</span>
        <button class="gcap-close" type="button" data-gcap-close aria-label="Close scan">${icon('close')}</button>
      </div>
      <div class="gcap-sheet">
        <p class="eyebrow">Handoff</p>
        <h2>This scan is ready.</h2>
        <p class="modal-intro">${result.captures.length} capture${result.captures.length === 1 ? '' : 's'} for <strong>${escapeHtml(result.agencyId || 'unspecified agency')}</strong>. In a real CareSpace deployment, the host UI reads this directly from <code>engine.getResult()</code> — no network call needed. This reference implementation offers a JSON download instead, since it has no real host.</p>

        ${demoBadgeMarkup()}

        <div class="scan-export-preview">
          ${rows.map(([key, label]) => `<div class="scan-export-row"><span>${label}</span><span>${result.capacity[key].net} / ${result.capacity[key].gross} ft³</span></div>`).join('')}
          <div class="scan-export-row"><span>Boxes</span><span>${result.boxCapacity.overrideBoxes ?? result.boxCapacity.computedBoxes}${result.boxCapacity.overrideBoxes !== null ? ' (override)' : ''}</span></div>
        </div>

        <button class="button button-dark form-submit" type="button" data-download-export>${icon('download')} Download handoff JSON</button>
      </div>
    `;
  }

  function successMarkup(message) {
    return `
      <div class="gcap-topbar"><span></span><button class="gcap-close" type="button" data-gcap-close aria-label="Close scan">${icon('close')}</button></div>
      <div class="gcap-sheet">
        <div class="success-state"><span class="success-icon">${icon('check')}</span><p class="eyebrow">Scan complete</p><h2>${message}</h2><p>Capacity + provenance from ${state.captures.filter((c) => c.status === 'done').length} captures are ready for CareSpace's Allocate step.</p><button class="button button-dark" type="button" data-close-flow>Done</button></div>
      </div>
    `;
  }

  function demoBadgeMarkup() {
    if (!state.isMock && cameraMode !== 'demo') return '';
    const parts = [];
    if (cameraMode === 'demo') parts.push('camera: demo images');
    if (state.isMock) parts.push('analysis: demo data');
    return `<div class="scan-demo-badge">${icon('alert')}<span><strong>Demo data</strong> — ${parts.join(', ')}. Not a real analysis.</span></div>`;
  }

  // ---------------- shared helpers ----------------

  function overriddenValue(id, key, fallback) {
    return state.overrides[id]?.[key] ?? fallback;
  }
  function overriddenNumber(id, key, fallback) {
    const value = overriddenValue(id, key, fallback);
    return typeof value === 'number' ? value : Number(value) || 0;
  }
  function overriddenVolumeSource(detection) {
    const override = state.overrides[detection.id];
    const edited = override && ('capacityType' in override || 'estimatedVolumeFt3' in override || 'estimatedAreaFt2' in override || 'percentFull' in override);
    return edited ? 'manual' : detection.volumeSource || 'default';
  }
  function labelForCategory(category) {
    const labels = { refrigerator: 'Refrigerator', freezer: 'Freezer', cabinet: 'Cabinet', shelving: 'Shelving unit', pantry: 'Pantry', kitchen_fixture: 'Kitchen fixture', other: 'Unrecognized fixture' };
    return labels[category] || category;
  }

  // ---------------- camera / capture lifecycle ----------------

  async function tryStartCamera() {
    const videoEl = root.querySelector('[data-gcap-video]');
    if (!videoEl || !navigator.mediaDevices?.getUserMedia) {
      startDemoMode('Camera not available in this browser — showing a demo instead.');
      return;
    }
    controller = createCaptureController({
      videoEl,
      onStatus: (status) => {
        frameStatus = status;
        updateLiveOverlay();
      },
      onCapture: handleCapturedBlob,
      onError: (error) => {
        cameraErrorMessage = error.message;
        render();
      },
    });
    try {
      await controller.start();
      cameraMode = 'live';
      render();
    } catch (error) {
      startDemoMode(`Could not access the camera (${error.message}) — showing a demo instead.`);
    }
  }

  function startDemoMode(message) {
    cameraErrorMessage = message;
    cameraMode = 'demo';
    controller = createDemoCaptureController({
      onStatus: (status) => {
        frameStatus = status;
        updateLiveOverlay();
      },
      onCapture: handleCapturedBlob,
      onError: (error) => {
        cameraErrorMessage = error.message;
        render();
      },
    });
    render();
    armDemoForCurrentStep();
  }

  function armDemoForCurrentStep() {
    const step = currentStep();
    const samples = DEMO_SAMPLES[step.id] || [];
    const cursor = demoSampleCursor[step.id] || 0;
    if (cursor >= samples.length) return; // nothing left to auto-capture on this step
    controller.armForStep(samples[cursor]);
  }

  /** Cheap DOM patch for the progress ring / hint chip on every analyzed frame, instead of a full re-render (~8x/sec). */
  function updateLiveOverlay() {
    const ringFill = root.querySelector('.gcap-ring-fill');
    if (ringFill) ringFill.setAttribute('stroke-dashoffset', String(276.5 * (1 - (frameStatus.armProgress || 0))));
    const stateChip = root.querySelector('.gcap-state-chip');
    const stateLabel = { idle: '', arming: 'Hold steady…', gated_dark: 'Too dark', gated_blur: 'Hold steady', waiting_for_motion: 'Move to the next spot', cooldown: 'Captured', captured: 'Captured' }[frameStatus.state] || '';
    if (stateChip) {
      stateChip.textContent = stateLabel;
      stateChip.classList.toggle('is-gated', frameStatus.state.startsWith('gated'));
      stateChip.hidden = !stateLabel;
    }
    if (frameStatus.shouldCapture || frameStatus.state === 'captured') render(); // capture just fired — needs a real re-render for the filmstrip
  }

  async function handleCapturedBlob(blob) {
    const step = currentStep();
    await engine.submitCapture(blob, step.id); // engine downscales, adds the capture, and streams analysis in — subscribe() re-renders as status changes
    controller?.resetEngine?.();

    if (cameraMode === 'demo') {
      const cursor = (demoSampleCursor[step.id] || 0) + 1;
      demoSampleCursor[step.id] = cursor;
      const samples = DEMO_SAMPLES[step.id] || [];
      if (cursor < samples.length) {
        setTimeout(armDemoForCurrentStep, 700); // auto-chain the next demo sample on multi-capture steps
      } else if (!step.multiCapture) {
        setTimeout(goToNextStep, 900); // single-capture step, nothing left to auto-capture — advance for a hands-off demo
      }
    }
  }

  function goToNextStep() {
    if (stepIndex >= CAPTURE_STEPS.length - 1) {
      phase = 'review';
      controller?.stop?.();
      render();
      return;
    }
    stepIndex += 1;
    cameraErrorMessage = cameraMode === 'demo' ? cameraErrorMessage : null;
    controller?.resetEngine?.();
    render();
    if (cameraMode === 'demo') armDemoForCurrentStep();
  }

  function wireEvents() {
    root.querySelector('[data-gcap-close]')?.addEventListener('click', teardown);

    root.querySelector('[data-gcap-shutter]')?.addEventListener('click', () => controller?.manualCapture());

    root.querySelector('[data-gcap-skip]')?.addEventListener('click', goToNextStep);
    root.querySelector('[data-gcap-continue]')?.addEventListener('click', goToNextStep);

    root.querySelector('[data-gcap-upload]')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (file) await handleCapturedBlob(file);
    });

    root.querySelectorAll('[data-gcap-delete-thumb]').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        engine.deleteCapture(button.dataset.gcapDeleteThumb);
      });
    });

    root.querySelectorAll('[data-gcap-thumb]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedCaptureId = button.dataset.gcapThumb;
        render();
      });
    });

    // Review step
    root.querySelector('#gcap-facility-id')?.addEventListener('input', (event) => {
      engine.setAgencyId(event.target.value);
    });

    root.querySelectorAll('[data-fixture-exclude]').forEach((checkbox) => {
      checkbox.addEventListener('change', (event) => {
        const row = event.target.closest('[data-fixture-id]');
        engine.toggleFixture(row.dataset.fixtureId);
      });
    });

    root.querySelectorAll('[data-fixture-field]').forEach((field) => {
      field.addEventListener('change', (event) => {
        const row = event.target.closest('[data-fixture-id]');
        const key = event.target.dataset.fixtureField;
        if (key === 'percentFullPercent') {
          engine.setPercentFull(row.dataset.fixtureId, Number(event.target.value) / 100);
        } else if (key === 'estimatedVolumeFt3') {
          engine.setVolumeOverride(row.dataset.fixtureId, Number(event.target.value) || 0);
        } else if (key === 'capacityType') {
          engine.setCapacityTypeOverride(row.dataset.fixtureId, event.target.value);
        }
      });
    });

    root.querySelector('[data-floor-area]')?.addEventListener('change', (event) => {
      engine.setFloorArea(Number(event.target.value) || 0);
    });
    root.querySelector('[data-floor-excluded]')?.addEventListener('change', (event) => {
      engine.setFloorExcluded(Number(event.target.value) || 0);
    });

    root.querySelector('[data-add-fixture]')?.addEventListener('click', () => {
      const category = root.querySelector('[data-add-category]').value;
      engine.addManualFixture({ category });
    });

    root.querySelector('[data-box-override]')?.addEventListener('change', (event) => {
      const raw = event.target.value;
      engine.setBoxOverride(raw === '' ? null : Number(raw) || 0);
    });

    root.querySelector('[data-go-simulate]')?.addEventListener('click', () => {
      phase = 'simulate';
      render();
    });

    // Simulate step
    root.querySelectorAll('[data-food-units]').forEach((input) => {
      input.addEventListener('change', (event) => {
        const category = event.target.dataset.category;
        const foodId = event.target.dataset.foodId;
        const units = Number(event.target.value) || 0;
        const lines = (simulatedLoad[category] || []).filter((line) => line.foodId !== foodId);
        if (units > 0) lines.push({ foodId, units });
        simulatedLoad = { ...simulatedLoad, [category]: lines };
        render();
      });
    });
    root.querySelector('[data-recommend-mix]')?.addEventListener('click', () => {
      const mix = recommendMix(state.capacity);
      const load = { cold: [], frozen: [], dry: [] };
      for (const line of mix) {
        const food = foods.find((f) => f.id === line.foodId);
        if (food) load[food.category].push(line);
      }
      simulatedLoad = load;
      render();
    });
    root.querySelector('[data-clear-load]')?.addEventListener('click', () => {
      simulatedLoad = { cold: [], frozen: [], dry: [] };
      render();
    });
    root.querySelector('[data-go-export]')?.addEventListener('click', () => {
      phase = 'export';
      render();
    });

    // Export step
    root.querySelector('[data-download-export]')?.addEventListener('click', () => {
      const result = engine.getResult();
      downloadJson(result, `carespace-scan-${result.scanId}.json`);
      root.innerHTML = successMarkup('Downloaded the handoff JSON.');
      root.querySelector('[data-close-flow]')?.addEventListener('click', teardown);
      root.querySelector('[data-gcap-close]')?.addEventListener('click', teardown);
    });
  }

  function teardown() {
    controller?.stop?.();
    unsubscribe();
    document.body.classList.remove('modal-open');
    root.remove();
    onDone?.();
  }

  render();
  tryStartCamera();
}
