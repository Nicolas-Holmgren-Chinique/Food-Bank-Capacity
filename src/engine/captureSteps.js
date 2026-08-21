/**
 * Guided auto-capture step sequence. Configurable per the feature spec —
 * edit this array to change the flow; nothing else hardcodes step order.
 *
 * `kind`:
 *  - 'wide': general fixture detection over the whole frame (bbox-style,
 *     like the original single-shot scan) — used for the room-wide shot
 *     and the shelving/floor step.
 *  - 'interior': the camera is inside an opened fixture (fridge/freezer/
 *     cabinet). Gemini is told this explicitly and returns ONE fixture
 *     entry with an interior-volume + fill-level estimate instead of a
 *     bbox list — see src/vision/geminiAdapter.js.
 *
 * `excludeFromTotalsByDefault`: per docs/CAPACITY.md's aggregation rule,
 * fixtures detected in the wide room shot are shown for context but start
 * excluded from capacity totals, since the close-up interior/shelving
 * captures are the source of truth for volume and we deliberately do not
 * attempt cross-photo deduplication.
 */
export const CAPTURE_STEPS = [
  {
    id: 'wide',
    label: 'Step back and frame the whole room',
    hint: 'Get the fridge, cabinets, and shelving in frame if you can.',
    icon: 'room',
    kind: 'wide',
    multiCapture: false,
    excludeFromTotalsByDefault: true,
  },
  {
    id: 'fridge_interior',
    label: 'Open your refrigerator and point at the inside',
    hint: 'Hold steady on the shelves — we estimate how full it is.',
    icon: 'fridge',
    kind: 'interior',
    capacityType: 'refrigerated_storage',
    detectionCategory: 'refrigerator',
    multiCapture: false,
    excludeFromTotalsByDefault: false,
  },
  {
    id: 'freezer_interior',
    label: 'Open your freezer and point at the inside',
    hint: 'Same idea — hold steady on the shelves or drawers.',
    icon: 'freezer',
    kind: 'interior',
    capacityType: 'frozen_storage',
    detectionCategory: 'freezer',
    multiCapture: false,
    excludeFromTotalsByDefault: false,
  },
  {
    id: 'cabinet_interior',
    label: 'Open each cabinet and scan it',
    hint: 'Repeat for as many cabinets as you have, then tap Done.',
    icon: 'cabinet',
    kind: 'interior',
    capacityType: 'dry_storage',
    detectionCategory: 'cabinet',
    multiCapture: true,
    excludeFromTotalsByDefault: false,
  },
  {
    id: 'shelving_floor',
    label: 'Point at any shelving or floor storage space',
    hint: 'Open shelving units and clear floor/staging area both count.',
    icon: 'shelving',
    kind: 'wide',
    multiCapture: true,
    excludeFromTotalsByDefault: false,
  },
];

export function stepById(stepId) {
  return CAPTURE_STEPS.find((step) => step.id === stepId) || null;
}
