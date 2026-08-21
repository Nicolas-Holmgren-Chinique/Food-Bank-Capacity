/**
 * A fixed set of photos to scan when there is no pantry to walk.
 *
 * These are real photos of a real office break room, taken in one pass the way
 * a rep would take them: two wide shots of the wall, a burst of four around
 * one pair of fridges, one cabinet, and one room with no storage in it at all.
 *
 * They run through the same upload path and the same model call as anything a
 * person drags in. Nothing about the result is canned. What is fixed is the
 * input, which is the part you want fixed when you are presenting.
 *
 * The set is chosen to exercise the three things that are hard:
 *   overlap    the same fridges appear in five of the eight frames
 *   scale      a single wall cabinet is nothing like the 45 cu ft prior
 *   restraint  photo 8 is tables and chairs, and should yield nothing
 */

export type DemoPhoto = { file: string; caption: string };

export const DEMO_PHOTOS: DemoPhoto[] = [
  { file: "01-breakroom-wide.jpg", caption: "Break room, wide" },
  { file: "02-fridge-open.jpg", caption: "Same wall, one fridge open" },
  { file: "03-fridge-door.jpg", caption: "Fridge door, close" },
  { file: "04-fridge-pair.jpg", caption: "Both fridges open" },
  { file: "05-fridge-interiors.jpg", caption: "Both interiors" },
  { file: "06-fridge-counter.jpg", caption: "Right fridge and counter" },
  { file: "07-wall-cabinet.jpg", caption: "Wall cabinet" },
  { file: "08-dining-area.jpg", caption: "Dining area" },
];

export const DEMO_DIR = "/demo-scan";
