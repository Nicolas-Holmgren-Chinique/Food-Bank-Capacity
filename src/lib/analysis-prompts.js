/**
 * Parametric prompt registry for CareSpace inference.
 *
 * Every analysis is a named template with typed parameters filled from the
 * allocation solver's output. The solver's numbers are the only numbers the
 * model ever sees, and the system prompt forbids recomputing them — the model
 * explains and finds gaps, it does not do arithmetic.
 *
 * That split is deliberate. The product exists because human intuition about
 * capacity is wrong; swapping a wrong human guess for a plausible model guess
 * is not an improvement. Deterministic answers come from src/lib/allocation.js.
 */

/** The atomic-box framework. Stable across every request, so it caches well. */
export const FRAMEWORK_SYSTEM = `You analyse food-bank distribution capacity for CareSpace.

THE MODEL YOU ARE REASONING WITHIN

A "box" is one household's ration and cannot be split across facilities. Because
half of every box is produce, a box consumes dry storage AND cold storage at the
same time. A facility's box capacity is therefore the MINIMUM across storage
dimensions, never the sum and never the average: a site with dry shelving for
40,000 boxes and a freezer for 8,000 holds 8,000 boxes. The dimension that
produces that minimum is the BINDING DIMENSION. Capacity behind every other
dimension is DEAD SPACE — real, paid-for, and unusable, because the box will not
split.

Two states, needing opposite responses:
- CAPACITY-BOUND: the facility is physically full. Sending more food does
  nothing. It needs storage, and the binding dimension says which kind.
- SUPPLY-BOUND: the facility has room. It needs food.

Capacity always means free space measured now, never nameplate or maximum
capacity — allocating against nameplate double-books whatever is already on the
floor.

Whether new storage buys COVERAGE or only EQUITY depends on the regime. When
supply is scarcer than total network capacity, new storage at one site
redistributes boxes away from others rather than feeding more people. When
capacity is the wall, new storage converts directly into people fed.

YOUR ROLE

You receive computed output from a verified deterministic solver. Those figures
are ground truth.

- Never recompute, adjust, re-derive, or second-guess any number you are given.
  Quote them exactly as provided. Do not perform arithmetic of any kind: no
  sums, differences, percentages, or per-person figures. If a question seems to
  require a calculation, answer with the figures you were given instead.
- Reason briefly. The analysis is already done; your job is to read it and
  report. Do not re-verify the solver's work.
- Never invent a figure that is not in the input. If something needed for a
  conclusion is absent, that absence is itself a finding — say so.
- Distinguish what the data shows from what it cannot show. Demo or unverified
  inputs cannot support operational conclusions, and you must say when they
  can't.
- Write for a food-bank operations lead, not an engineer. Plain sentences, no
  jargon, no restating the framework back at them.

Respond only with JSON matching the requested shape. No prose outside the JSON.`;

/** Compact the solver result so the model sees signal, not a wall of JSON. */
export function summariseResult(result, { rationBox = [] } = {}) {
  const dim = (key) => rationBox.find((d) => d.key === key)?.label ?? key;
  return {
    regime: result.regime,
    verdict: result.verdict,
    boxesPlaced: result.totals.shipped,
    boxesAvailable: result.totals.supply,
    residualNeed: result.totals.residualNeed,
    networkCapacity: result.totals.networkCapacity,
    coverage: round(result.totals.coverage),
    worstServedCoverage: round(result.totals.floorCoverage),
    deadSpaceBoxes: result.totals.atomicityLoss,
    facilities: result.sites.map((s) => ({
      name: s.name,
      status: s.status,
      residualNeed: s.residualNeed,
      canHold: s.boxCapacity,
      sending: s.boxes,
      coverage: round(s.coverage),
      limitedBy: s.bindingDimension ? dim(s.bindingDimension) : null,
      capacityByDimension: Object.fromEntries(
        Object.entries(s.capacityByDimension ?? {}).map(([k, v]) => [dim(k), v]),
      ),
    })),
    storageDimensions: (result.dimensions ?? []).map((d) => ({
      name: d.label,
      unit: d.unit,
      availableUnits: round(d.availableUnits),
      utilisation: round(d.utilisation),
      networkBoxes: d.networkBoxes,
    })),
    solverRecommendations: (result.recommendations ?? []).map((r) => ({
      facility: r.name,
      limitedBy: dim(r.bindingDimension),
      sendingToday: r.boxesToday,
      couldSend: r.boxesAtWaterline,
      storageToAdd: r.additions.map((a) => `${a.addUnits} ${a.unit} ${a.label.toLowerCase()}`),
      worstServedBefore: round(r.floorCoverageBefore),
      worstServedAfter: round(r.floorCoverageAfter),
      networkTotalUnchanged: r.shippedAfter === result.totals.shipped,
    })),
  };
}

const round = (n) => (Number.isFinite(n) ? Number(n.toFixed(4)) : n);

/**
 * The analyses. Each declares its parameters, builds a user message from the
 * solver summary, and pins the JSON shape the dashboard renders.
 */
export const ANALYSES = {
  unmet_requirements: {
    id: 'unmet_requirements',
    label: 'Unmet requirements',
    description: 'What this network cannot currently meet, and the reason for each gap.',
    parameters: {
      audience: { type: 'string', default: 'operations lead', description: 'Who reads the output' },
      maxFindings: { type: 'number', default: 5, description: 'Cap on findings returned' },
    },
    build: (summary, p, provenance) => ({
      user: [
        'Identify what this distribution network cannot currently meet.',
        '',
        'For each unmet requirement: name it, say which facilities it affects, state',
        'whether it is unmet because of storage or because of supply, and give the',
        'single action that would change it.',
        '',
        'Do not calculate anything — no totals, no percentages, no differences.',
        'Where you cite a figure, quote one from the input verbatim. Order findings',
        'by severity using the residual-need figures already present in the input.',
        '',
        `Return at most ${p.maxFindings} findings, written for a ${p.audience}.`,
        '',
        provenanceNote(provenance),
        '',
        'SOLVER OUTPUT (ground truth):',
        JSON.stringify(summary, null, 2),
      ].join('\n'),
      schema: {
        headline: 'one sentence naming the network\'s single biggest unmet requirement',
        findings: [
          {
            requirement: 'what is not being met',
            facilities: ['facility names affected'],
            cause: 'storage | supply | data',
            scale: 'quote the relevant residual-need or capacity figure from the input verbatim',
            action: 'the one thing that would change this',
            severity: 'high | medium | low',
          },
        ],
        confidence: 'high | medium | low — based on how trustworthy the input data is',
        confidenceReason: 'one sentence on what limits confidence',
      },
    }),
  },

  capital_recommendation: {
    id: 'capital_recommendation',
    label: 'Where funding should go',
    description: 'Turns the binding-constraint analysis into a fundable case.',
    parameters: {
      budget: { type: 'string', default: 'unspecified', description: 'Available funding, if known' },
present: { type: 'string', default: 'board', description: 'Who the case is being made to' },
    },
    build: (summary, p, provenance) => ({
      user: [
        'Make the case for where storage funding should go.',
        '',
        'Do not calculate anything. Quote figures from the input verbatim.',
        'Ground every claim in the solver output. Be explicit about whether added',
        'storage increases total people fed or only redistributes between',
        'facilities — the regime field tells you which, and overstating this is the',
        'fastest way to lose credibility with funders.',
        '',
        `Budget available: ${p.budget}. Audience: ${p.present}.`,
        '',
        provenanceNote(provenance),
        '',
        'SOLVER OUTPUT (ground truth):',
        JSON.stringify(summary, null, 2),
      ].join('\n'),
      schema: {
        recommendation: 'one sentence: what to buy, where',
        rationale: 'two or three sentences a funder would find persuasive',
        effect: 'what measurably changes, quoting solver figures exactly',
        buysCoverageOrEquity: 'coverage | equity — and one clause saying why',
        deadSpaceUnlocked: 'boxes of stranded capacity this would make usable, or null',
        caveats: ['anything that would make this recommendation wrong'],
      },
    }),
  },

  data_gaps: {
    id: 'data_gaps',
    label: 'Data gaps',
    description: 'What is missing or stale in the inputs, and what it invalidates.',
    parameters: {
      strictness: { type: 'string', default: 'operational', description: 'operational | exploratory' },
    },
    build: (summary, p, provenance) => ({
      user: [
        'Assess whether this analysis can support operational decisions.',
        '',
        'Identify what is missing, stale, or assumed in the inputs, and state',
        'precisely which conclusions each gap invalidates. Do not soften this: a',
        'confident answer built on demo figures is worse than no answer.',
        '',
        `Strictness: ${p.strictness}.`,
        '',
        provenanceNote(provenance),
        '',
        'SOLVER OUTPUT (ground truth):',
        JSON.stringify(summary, null, 2),
      ].join('\n'),
      schema: {
        safeToActOn: 'yes | no | partially',
        gaps: [
          {
            missing: 'what is absent, stale, or assumed',
            invalidates: 'which specific conclusion this undermines',
            fix: 'what someone would have to collect or verify',
          },
        ],
        strongestConclusion: 'the one thing this data does support, stated plainly',
      },
    }),
  },
};

function provenanceNote(provenance = {}) {
  const notes = [];
  if (provenance.demoData) {
    notes.push('The capacity and demand figures are DEMO values, not reported by facilities.');
  }
  if (provenance.droppedRecords) {
    notes.push(`${provenance.droppedRecords} capacity record(s) were excluded as expired or unreadable.`);
  }
  if (provenance.unverifiedRecords) {
    notes.push(`${provenance.unverifiedRecords} capacity record(s) carry no verification timestamp.`);
  }
  if (provenance.facilitiesWithoutCapacity) {
    notes.push(`${provenance.facilitiesWithoutCapacity} facility(ies) reported no capacity and are excluded entirely.`);
  }
  return notes.length ? `INPUT PROVENANCE:\n- ${notes.join('\n- ')}` : 'INPUT PROVENANCE: none reported.';
}

/** Build the full request payload for one analysis. */
export function buildPrompt(analysisId, result, { params = {}, provenance = {}, rationBox = [] } = {}) {
  const analysis = ANALYSES[analysisId];
  if (!analysis) {
    throw new Error(`unknown analysis: ${analysisId}. Known: ${Object.keys(ANALYSES).join(', ')}`);
  }
  const resolved = {};
  for (const [name, spec] of Object.entries(analysis.parameters)) {
    resolved[name] = params[name] ?? spec.default;
  }
  const summary = summariseResult(result, { rationBox });
  const { user, schema } = analysis.build(summary, resolved, provenance);

  return {
    analysis: analysis.id,
    label: analysis.label,
    parameters: resolved,
    system: FRAMEWORK_SYSTEM,
    user: `${user}\n\nRespond with JSON in exactly this shape:\n${JSON.stringify(schema, null, 2)}`,
  };
}
