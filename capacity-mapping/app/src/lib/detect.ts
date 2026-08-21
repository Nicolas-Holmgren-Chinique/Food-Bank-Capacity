import { storageUnitKinds, zones, type ZoneId } from "./data";

/**
 * The scan, as one call.
 *
 * Uploaded photos overlap: a wide shot of a room contains units that later
 * close-ups show again, and a burst of four frames is one appliance. So the
 * unit of work is not the photo, it is the physical thing. Every image goes
 * into a single request, because seeing them side by side is the only way to
 * tell that photo 4 and photo 5 are the same fridge.
 */

export type DetectedUnit = {
  kind_id: string;
  zone_id: ZoneId;
  /** Human readable and distinctive, so a rep can tell two fridges apart. */
  label: string;
  gross_cuft: number;
  usable_pct: number;
  confidence: number;
  /** 1-based photo numbers this unit appears in. The dedupe, made visible. */
  appears_in: number[];
  /** false = could not size it and fell back on the form factor's prior. */
  sized_from_image: boolean;
  note: string;
};

export type DetectResult = {
  units: DetectedUnit[];
  /** Photos with no food storage in them at all. */
  empty_photos: number[];
  notes: string;
};

const kindTable = storageUnitKinds
  .map(
    (k) =>
      `  ${k.id} | ${k.label} | zone: ${k.zone_id} | typical ${k.typical_cuft} cu ft | fit ${k.usable_default}`
  )
  .join("\n");

const zoneTable = zones
  .map((z) => `  ${z.id} | ${z.label} | ${z.temp_min_f}-${z.temp_max_f}F`)
  .join("\n");

export const SYSTEM_PROMPT = `You size food storage for a food bank's partner agency sites. A rep walks a room, takes photos, and you turn those photos into a list of the physical things that can hold food, each with a cubic foot estimate.

ZONES. There are exactly two. There is no frozen zone.
${zoneTable}

FORM FACTORS. Every unit must be assigned one of these kind_ids.
${kindTable}

The "typical" column is a fallback prior, not an answer. The "fit" column is a default fit factor.

WHAT COUNTS
Anything enclosed that food can be stacked into or onto: shelving, racking, cabinets, closets, pantries, coolers, fridges, cold rooms, and designated floor staging areas.

Office and breakroom cabinetry counts. A run of kitchen wall or base cabinets is real shelf-stable storage; map it to pantry_closet. A household or breakroom refrigerator maps to residential_fridge.

WHAT DOES NOT COUNT
Countertops, sinks, dishwashers, microwaves, coffee makers, tables, chairs, desks, trash cans, and open floor with nothing designated on it. If a photo contains none of the things that do count, put its number in empty_photos and create no units for it.

THE PHOTOS OVERLAP. THIS IS THE HARD PART.
The photos are from one walk through one site. They will show the same things more than once:
  - A burst of frames seconds apart is usually one subject from slightly different angles.
  - A wide shot of a wall contains units that a later close-up shows again.
  - A closed appliance in one photo and the same appliance open in another is ONE unit.
Produce ONE entry per physical thing, with every photo number it appears in listed in appears_in. Never emit the same physical unit twice. When two photos might be the same unit, look for shared context: the same adjacent cabinetry, the same wall, the same floor, the same signage, the same handle style. If you genuinely cannot tell whether two photos show the same unit or two identical units, treat them as ONE and say so in the note. Counting a fridge twice ships food to a site that cannot hold it.

GROUPING
Group a contiguous run of identical cabinetry or shelving into one unit and put the combined volume in gross_cuft. Ten matching wall cabinets along one wall is one unit labeled for that wall, not ten units. Two separate appliances standing side by side are two units, because they can fail and be replaced independently.

SIZING
gross_cuft is the interior volume of the storage itself, never the volume of the room.
Estimate from the image using what you can see for scale: a ceiling tile is 2 ft, an interior door is about 80 in, a counter is 36 in high, a standard residential fridge is 30 to 36 in wide and about 20 to 25 cu ft, a wall cabinet is about 12 in deep and a base cabinet about 24 in.
Only fall back on the form factor's typical value when you truly cannot size it, and set sized_from_image to false when you do. A single wall cabinet is not 45 cu ft just because pantry_closet says so.

usable_pct is what can actually be stacked in once you take out aisles, air gaps, and the shelf nobody can reach. Start from the fit default for the form factor and adjust down for what you can see: a unit already full of other people's food, or one with deep unreachable corners, holds less than an empty one. Range 0.3 to 0.95.

BIAS LOW. Overestimating capacity ships boxes a site cannot store and that food is thrown out. Underestimating moves slightly fewer boxes. The costs are not symmetric, so neither is the estimate.

confidence is your own certainty about the identification and the size, 0 to 1. Be honest. A partly visible unit in the background of a wide shot deserves a low number.

label must be SHORT. Four words at most, about 30 characters. It is read in a
narrow list on a phone, so anything longer is cut off and helps nobody. Say the
thing and where it is, nothing else: "Fridge, left of pair", "Upper cabinets,
counter run", "Tall cabinet, by door". Not "French-door refrigerator, left of
two (kitchen wall, near tall cabinets)".

note is one short sentence: what you saw, and why you are unsure if you are.`;

export const DETECT_TOOL = {
  name: "report_storage",
  description:
    "Report every distinct physical storage unit found across all the photos, deduplicated.",
  strict: true,
  input_schema: {
    type: "object" as const,
    properties: {
      units: {
        type: "array",
        description:
          "One entry per physical storage unit. Never two entries for the same thing.",
        items: {
          type: "object",
          properties: {
            kind_id: {
              type: "string",
              enum: storageUnitKinds.map((k) => k.id),
            },
            zone_id: { type: "string", enum: zones.map((z) => z.id) },
            label: {
              type: "string",
              description:
                "Four words max, ~30 characters. Distinctive and locating: 'Fridge, left of pair'. Read in a narrow phone list, so longer gets cut off.",
              maxLength: 40,
            },
            gross_cuft: { type: "number" },
            usable_pct: { type: "number" },
            confidence: { type: "number" },
            appears_in: {
              type: "array",
              items: { type: "integer" },
              description: "Every 1-based photo number showing this unit.",
            },
            sized_from_image: { type: "boolean" },
            note: { type: "string" },
          },
          required: [
            "kind_id",
            "zone_id",
            "label",
            "gross_cuft",
            "usable_pct",
            "confidence",
            "appears_in",
            "sized_from_image",
            "note",
          ],
          additionalProperties: false,
        },
      },
      empty_photos: {
        type: "array",
        items: { type: "integer" },
        description: "1-based numbers of photos containing no food storage.",
      },
      notes: {
        type: "string",
        description:
          "One or two sentences on what overlapped and what you merged.",
      },
    },
    required: ["units", "empty_photos", "notes"],
    additionalProperties: false,
  },
};

/** Usable cubic feet a detection contributes, the only number the UI shows. */
export const detectedUsable = (u: DetectedUnit) =>
  Math.round(u.gross_cuft * u.usable_pct);
