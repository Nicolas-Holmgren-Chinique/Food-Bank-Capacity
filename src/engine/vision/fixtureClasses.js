import referenceVolumes from './referenceVolumes.json' with { type: 'json' };

const { unitVolumes } = referenceVolumes;

/**
 * Single editable source of truth mapping a EyePop class label (the exact
 * prompt string sent to the `eyepop.localize-objects:latest` ability) to a
 * CareSpace capacity type and default volume.
 *
 * `defaultVolumeFt3` is a *baseline* volume, not the volume reported for
 * every detection of that class — src/vision/adapter.js scales it by how
 * large the detection's bounding box is relative to `baselineHeightFraction`
 * (the fraction of frame height we'd expect an average instance of that
 * fixture to occupy in a photo framed to show it). A fridge filling 55% of
 * frame height reports close to baseline; one filling 15% (small, or far
 * from camera) reports proportionally less. This has no camera calibration
 * behind it — it's a deliberately rough heuristic, not a real measurement.
 *
 * `promptClass` values double as the VLM prompts in server/eyepopClient.js —
 * edit this list to change both what EyePop looks for and how it's scored.
 *
 * See README.md "Reliable EyePop classes" for which of these were verified
 * against real photos vs. still assumed.
 */
export const FIXTURE_CLASSES = [
  {
    promptClass: 'refrigerator',
    category: 'refrigerator',
    capacityType: 'refrigerated_storage',
    defaultVolumeFt3: unitVolumes.refrigerator_cold,
    freezerCompartmentFt3: unitVolumes.refrigerator_freezer_compartment,
    baselineHeightFraction: 0.55,
  },
  { promptClass: 'chest freezer', category: 'freezer', capacityType: 'frozen_storage', defaultVolumeFt3: unitVolumes.chest_freezer, baselineHeightFraction: 0.3 },
  { promptClass: 'upright freezer', category: 'freezer', capacityType: 'frozen_storage', defaultVolumeFt3: unitVolumes.upright_freezer, baselineHeightFraction: 0.55 },
  { promptClass: 'freezer', category: 'freezer', capacityType: 'frozen_storage', defaultVolumeFt3: unitVolumes.chest_freezer, baselineHeightFraction: 0.4 },
  { promptClass: 'base cabinet', category: 'cabinet', capacityType: 'dry_storage', defaultVolumeFt3: unitVolumes.base_cabinet, baselineHeightFraction: 0.25 },
  { promptClass: 'wall cabinet', category: 'cabinet', capacityType: 'dry_storage', defaultVolumeFt3: unitVolumes.wall_cabinet, baselineHeightFraction: 0.2 },
  { promptClass: 'cabinet', category: 'cabinet', capacityType: 'dry_storage', defaultVolumeFt3: unitVolumes.base_cabinet, baselineHeightFraction: 0.25 },
  { promptClass: 'shelving unit', category: 'shelving', capacityType: 'dry_storage', defaultVolumeFt3: unitVolumes.shelving_unit, baselineHeightFraction: 0.55 },
  { promptClass: 'pantry shelf', category: 'pantry', capacityType: 'dry_storage', defaultVolumeFt3: unitVolumes.pantry_shelf, baselineHeightFraction: 0.5 },
  { promptClass: 'pantry', category: 'pantry', capacityType: 'dry_storage', defaultVolumeFt3: unitVolumes.pantry_shelf, baselineHeightFraction: 0.5 },
  { promptClass: 'stove', category: 'kitchen_fixture', capacityType: null, mealPrepFlag: true },
  { promptClass: 'oven', category: 'kitchen_fixture', capacityType: null, mealPrepFlag: true },
  { promptClass: 'microwave', category: 'kitchen_fixture', capacityType: null, mealPrepFlag: true },
  { promptClass: 'sink', category: 'kitchen_fixture', capacityType: null, mealPrepFlag: false },
  { promptClass: 'dishwasher', category: 'kitchen_fixture', capacityType: null, mealPrepFlag: false },
];

/** Clamp bounds for the bbox-height scale factor, so a barely-visible or frame-filling detection doesn't produce an absurd volume. */
export const VOLUME_SCALE_BOUNDS = { min: 0.4, max: 2.2 };

export function lookupFixtureClass(rawClass) {
  const normalized = (rawClass || '').trim().toLowerCase();
  return FIXTURE_CLASSES.find((entry) => entry.promptClass === normalized) || null;
}

export function fixturePrompts() {
  return FIXTURE_CLASSES.map((entry) => ({ prompt: entry.promptClass }));
}
