/*
 * Campaign 6 — "Correlation Street". Causal-inference QRPs: conjure (or kill) an
 * effect by mis-specifying the causal model. Conditioning on colliders (post- and
 * pre-treatment), the Table 2 fallacy, weak/invalid instruments, adjustment-set
 * shopping, and a DAG capstone. Each level's evaluate(state, ctx) runs a genuine
 * OLS / 2SLS via ctx.Stats. Registered onto PSPSS_levels.LEVELS.
 * Proven solvable at par by src/levels.verify.js; seeds from src/tune-seeds.c6.js.
 */
(function (root) {
  'use strict';

  const common = typeof require !== 'undefined' ? require('./levels.common') : root.PSPSS_levels_common;
  const { makeRNG, mean, groupArrays } = common;

  const LEVELS = [
    // ----------------------------------------------------------- collider (post-treatment)
    {
      id: 'collider2', campaign: 'c6', title: 'Adjust Until It Appears (Reprise)',
      rank: 'Observational Epidemiologist II', design: 'between', flaw: 'collider',
      par: 1, seed: 1271, predictedHigher: 'B',
      candidateControls: [
        { id: 'age', label: 'Age (measured before treatment)' },
        { id: 'engagement', label: 'Post-study Engagement' },
      ],
      extraCols: [{ field: 'age', label: 'Age' }, { field: 'engagement', label: 'Engagement' }],
      hypothesis: 'Treatment B improves Recovery over control A.',
      brief: 'Raw, there is nothing. Age was measured before treatment; engagement was measured after. Adjust for the one your gut calls a "confounder" and an effect blooms from a door that was closed.',
      dag: { title: 'Recovery trial', nodes: [{ id: 'T', label: 'T', x: 0.08, y: 0.5, kind: 'treatment' }, { id: 'Y', label: 'Y', x: 0.92, y: 0.5, kind: 'outcome' }, { id: 'engagement', label: 'Eng', x: 0.5, y: 0.82, kind: 'covariate' }, { id: 'age', label: 'Age', x: 0.5, y: 0.18, kind: 'covariate' }], edges: [{ from: 'T', to: 'engagement' }, { from: 'Y', to: 'engagement' }] },
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 44; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          const treat = group === 'B' ? 1 : 0;
          const y = rng.normal(50, 8); // NO treatment effect
          const age = rng.normal(40, 10); // inert pre-treatment red herring
          const engagement = 1.4 * treat - 0.16 * (y - 50) + rng.normal(0, 1); // collider
          parts.push({ group, vals: { primary: y }, age, engagement, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const treat = rows.map((r) => (r.group === 'B' ? 1 : 0));
        const gm = groupArrays(rows);
        const groups = { 'Mean A': mean(gm.A), 'Mean B': mean(gm.B) };
        if (state.controlVar) {
          const cov = rows.map((r) => r[state.controlVar]);
          const r = ctx.Stats.ols(y, [treat, cov]);
          const c = r.coefs[1];
          const lbl = (state.level.candidateControls.find((x) => x.id === state.controlVar) || {}).label;
          return { testName: 'OLS (control: ' + lbl + ')', statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
        }
        const r = ctx.Stats.tTestIndependent(gm.A, gm.B, false);
        return { testName: 'Independent t-test (unadjusted)', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: y.length, groups, higher: mean(gm.B) >= mean(gm.A) ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
      },
    },

    // ----------------------------------------------------------- Table 2 fallacy
    {
      id: 'table2', campaign: 'c6', title: 'The Table 2 Fallacy',
      rank: 'Coefficient Connoisseur', design: 'between', flaw: 'table2-fallacy',
      par: 1, seed: 1931, predictedHigher: 'B',
      defaultCoef: 'treat',
      coefficients: [
        { id: 'treat', label: 'Treatment (your hypothesis)' },
        { id: 'smoking', label: 'Smoking (a "control" variable)' },
      ],
      extraCols: [{ field: 'smoking', label: 'Smoking' }],
      hypothesis: 'Treatment B raises the outcome over control A.',
      brief: 'Your treatment does nothing. But the model also "controls for" smoking, and smoking is wildly significant. Report THAT row of the regression table as your effect — the table never labels which coefficient is causal.',
      dag: { title: 'Adjusted model', nodes: [{ id: 'T', label: 'T', x: 0.08, y: 0.62, kind: 'treatment' }, { id: 'Y', label: 'Y', x: 0.92, y: 0.5, kind: 'outcome' }, { id: 'smoking', label: 'Smk', x: 0.5, y: 0.18, kind: 'covariate' }], edges: [{ from: 'smoking', to: 'Y' }] },
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 40; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          const smoking = rng.normal(0, 1);
          const y = 50 + 4.0 * smoking + rng.normal(0, 6); // smoking predicts Y; treatment does not
          parts.push({ group, vals: { primary: y }, smoking, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const treat = rows.map((r) => (r.group === 'B' ? 1 : 0));
        const smoking = rows.map((r) => r.smoking);
        const r = ctx.Stats.ols(y, [treat, smoking]);
        const which = state.reportCoef || 'treat';
        const idx = which === 'smoking' ? 2 : 1; // coefs[1]=treat, coefs[2]=smoking
        const c = r.coefs[idx];
        const gm = groupArrays(rows);
        const lbl = which === 'smoking' ? 'Smoking' : 'Treatment';
        return { testName: 'OLS — reporting: ' + lbl, statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups: { ['β (' + lbl + ')']: c.coef }, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
      },
    },

    // ----------------------------------------------------------- M-bias (pre-treatment collider)
    {
      id: 'm-bias', campaign: 'c6', title: 'The Pre-Treatment Trap',
      rank: 'DAG Skeptic', design: 'between', flaw: 'm-bias',
      par: 1, seed: 2006, predictedHigher: 'B',
      candidateControls: [
        { id: 'confounder', label: 'Baseline Covariate (inert)' },
        { id: 'zvar', label: 'Baseline Trait Z (pre-treatment)' },
      ],
      extraCols: [{ field: 'zvar', label: 'Trait Z' }],
      hypothesis: 'Treatment B raises the outcome over control A.',
      brief: '"Adjust for everything measured before treatment," they said. Trait Z was measured at baseline — surely safe. But Z sits at the centre of an M: condition on it and a path opens between treatment and outcome that was never there.',
      dag: { title: 'An M-structure', nodes: [{ id: 'U1', label: 'U1', x: 0.28, y: 0.16, kind: 'unobserved' }, { id: 'U2', label: 'U2', x: 0.72, y: 0.16, kind: 'unobserved' }, { id: 'zvar', label: 'Z', x: 0.5, y: 0.5, kind: 'covariate' }, { id: 'T', label: 'T', x: 0.08, y: 0.85, kind: 'treatment' }, { id: 'Y', label: 'Y', x: 0.92, y: 0.85, kind: 'outcome' }], edges: [{ from: 'U1', to: 'T' }, { from: 'U1', to: 'zvar' }, { from: 'U2', to: 'zvar' }, { from: 'U2', to: 'Y' }] },
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 52; i++) {
          const u1 = rng.normal(0, 1); // drives treatment propensity and Z
          const u2 = rng.normal(0, 1); // drives outcome and Z
          const group = rng.next() < 1 / (1 + Math.exp(-u1)) ? 'B' : 'A';
          const treat = group === 'B' ? 1 : 0;
          const zvar = u1 - u2 + rng.normal(0, 0.4); // M-collider of u1 and u2
          const y = 50 + 5 * u2 + rng.normal(0, 4); // outcome depends on u2 only — NOT on treatment
          const confounder = rng.normal(0, 1); // genuinely inert baseline covariate
          parts.push({ group, vals: { primary: y }, zvar, confounder, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const treat = rows.map((r) => (r.group === 'B' ? 1 : 0));
        const gm = groupArrays(rows);
        const groups = { 'Mean A': mean(gm.A), 'Mean B': mean(gm.B) };
        if (state.controlVar) {
          const cov = rows.map((r) => r[state.controlVar]);
          const r = ctx.Stats.ols(y, [treat, cov]);
          const c = r.coefs[1];
          const lbl = (state.level.candidateControls.find((x) => x.id === state.controlVar) || {}).label;
          return { testName: 'OLS (control: ' + lbl + ')', statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
        }
        const r = ctx.Stats.tTestIndependent(gm.A, gm.B, false);
        return { testName: 'Independent t-test (unadjusted)', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: y.length, groups, higher: mean(gm.B) >= mean(gm.A) ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
      },
    },

    // ----------------------------------------------------------- weak / invalid instrument
    {
      id: 'weak-iv', campaign: 'c6', title: 'A Convenient Instrument',
      rank: 'Econometrician (lapsed)', design: 'between', flaw: 'weak-instrument',
      par: 1, seed: 305, predictedHigher: 'B',
      instruments: [
        { id: 'distance', label: 'Distance to clinic (affects outcome too)' },
        { id: 'lottery', label: 'Lottery number (barely affects dose)' },
      ],
      extraCols: [{ field: 'xendo', label: 'Dose taken' }, { field: 'distance', label: 'Distance' }],
      hypothesis: 'Taking more of the drug (dose) raises the outcome.',
      brief: 'OLS of dose on outcome is confounded into a flat nothing. But you have an instrument — distance to the clinic — and two-stage least squares makes confounding vanish. Never mind that distance also affects the outcome directly; the exclusion restriction is a detail.',
      dag: { title: 'Instrument (exclusion violated)', nodes: [{ id: 'distance', label: 'Dist', x: 0.08, y: 0.38, kind: 'instrument' }, { id: 'lottery', label: 'Lot', x: 0.08, y: 0.85, kind: 'instrument' }, { id: 'dose', label: 'Dose', x: 0.45, y: 0.5, kind: 'treatment' }, { id: 'Y', label: 'Y', x: 0.92, y: 0.5, kind: 'outcome' }, { id: 'U', label: 'U', x: 0.45, y: 0.12, kind: 'unobserved' }], edges: [{ from: 'distance', to: 'dose' }, { from: 'distance', to: 'Y', kind: 'biasing' }, { from: 'lottery', to: 'dose' }, { from: 'U', to: 'dose' }, { from: 'U', to: 'Y' }] },
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 60; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          const u = rng.normal(0, 1); // confounder of dose and outcome
          const distance = rng.normal(0, 1); // STRONG but INVALID instrument (affects Y directly)
          const lottery = rng.normal(0, 1); // weak instrument (barely affects dose)
          const xendo = 1.0 * distance + 1.0 * u + 0.05 * lottery + rng.normal(0, 1); // dose
          const y = 50 + 0 * xendo + 2 * distance - 2 * u + rng.normal(0, 4); // dose has NO effect; OLS confounding cancels
          parts.push({ group, vals: { primary: y }, xendo, distance, lottery, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const x = rows.map((r) => r.xendo);
        const gm = groupArrays(rows);
        if (state.instrument) {
          const z = rows.map((r) => r[state.instrument]);
          const r = ctx.Stats.tsls(y, x, [z]);
          const lbl = (state.level.instruments.find((c) => c.id === state.instrument) || {}).label;
          const F = r.firstStageF;
          const weakNote = F != null
            ? '  [first-stage F = ' + F.toFixed(1) + (F < 10 ? ' — WEAK instrument: 2SLS is biased and over-confident]' : ']')
            : '';
          return { testName: '2SLS (instrument: ' + lbl + ')' + weakNote, statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: y.length, groups: { 'IV β (dose)': r.effect }, higher: r.effect >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
        }
        const r = ctx.Stats.ols(y, [x]);
        const c = r.coefs[1];
        return { testName: 'OLS (dose on outcome)', statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups: { 'OLS β (dose)': c.coef }, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
      },
    },

    // ----------------------------------------------------------- confounder/adjustment-set search
    {
      id: 'confounder-roulette', campaign: 'c6', title: 'Confounder Roulette',
      rank: 'Adjustment Enthusiast', design: 'between', flaw: 'confounder-search',
      par: 1, seed: 427, predictedHigher: 'B',
      specs: [
        { label: 'unadjusted', controls: [] },
        { label: 'control Age', controls: ['age'] },
        { label: 'control Income', controls: ['income'] },
        { label: 'control Mood (measured after treatment)', controls: ['mood'] },
        { label: 'control Age + Income', controls: ['age', 'income'] },
      ],
      extraCols: [{ field: 'age', label: 'Age' }, { field: 'income', label: 'Income' }, { field: 'mood', label: 'Mood' }],
      hypothesis: 'Treatment B raises the outcome over control A.',
      brief: 'Five defensible adjustment sets, exactly one of them significant. (One of your "covariates" was measured after treatment — but a specification search will not hold that against you.)',
      dag: { title: 'Which to adjust for?', nodes: [{ id: 'T', label: 'T', x: 0.08, y: 0.5, kind: 'treatment' }, { id: 'Y', label: 'Y', x: 0.92, y: 0.5, kind: 'outcome' }, { id: 'mood', label: 'Mood', x: 0.5, y: 0.82, kind: 'covariate' }, { id: 'age', label: 'Age', x: 0.32, y: 0.16, kind: 'covariate' }, { id: 'income', label: 'Inc', x: 0.68, y: 0.16, kind: 'covariate' }], edges: [{ from: 'T', to: 'mood' }, { from: 'Y', to: 'mood' }] },
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 40; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          const treat = group === 'B' ? 1 : 0;
          const y = rng.normal(50, 8); // NO effect
          const age = rng.normal(40, 10);
          const income = rng.normal(0, 1);
          const mood = 1.3 * treat - 0.18 * (y - 50) + rng.normal(0, 1); // post-treatment collider
          parts.push({ group, vals: { primary: y }, age, income, mood, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const idx = state.specIndex == null ? 0 : state.specIndex;
        const spec = state.level.specs[idx];
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const treat = rows.map((r) => (r.group === 'B' ? 1 : 0));
        const cols = [treat].concat(spec.controls.map((cid) => rows.map((r) => r[cid])));
        const r = ctx.Stats.ols(y, cols);
        const c = r.coefs[1];
        const gm = groupArrays(rows);
        return { testName: 'Spec: ' + spec.label, statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups: { 'Group β': c.coef }, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
      },
    },

    // ----------------------------------------------------------- DAG capstone (chain)
    {
      id: 'the-dag', campaign: 'c6', title: 'The Whole Garden of Forking DAGs',
      rank: 'Tenured Causal Skeptic', design: 'between', flaw: 'causal-forking',
      par: 2, seed: 3, predictedHigher: 'B',
      defaultCoef: 'treat',
      coefficients: [
        { id: 'treat', label: 'Treatment' },
        { id: 'trait', label: 'Trait W' },
      ],
      candidateControls: [
        { id: 'zcol', label: 'Latent Score Z' },
        { id: 'agec', label: 'Age (inert)' },
      ],
      extraCols: [{ field: 'trait', label: 'Trait W' }, { field: 'zcol', label: 'Score Z' }],
      hypothesis: 'Treatment B raises the outcome — or, failing that, SOMETHING does.',
      brief: 'No single move works. The treatment is null, Trait W predicts nothing on its own, and Age is a red herring. But condition on the Latent Score AND report Trait W — only together — and a path the DAG never drew lights up.',
      dag: { title: 'The garden of forking DAGs', nodes: [{ id: 'T', label: 'T', x: 0.08, y: 0.82, kind: 'treatment' }, { id: 'Y', label: 'Y', x: 0.92, y: 0.5, kind: 'outcome' }, { id: 'trait', label: 'W', x: 0.5, y: 0.16, kind: 'covariate' }, { id: 'zcol', label: 'Z', x: 0.5, y: 0.55, kind: 'covariate' }, { id: 'agec', label: 'Age', x: 0.22, y: 0.16, kind: 'covariate' }], edges: [{ from: 'trait', to: 'zcol' }, { from: 'Y', to: 'zcol' }] },
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 48; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          const W = rng.normal(0, 1);
          const y = rng.normal(50, 6); // no treatment effect, no W effect
          const zcol = W - 0.8 * (y - 50) + rng.normal(0, 0.4); // collider of W and Y
          const agec = rng.normal(40, 10); // inert
          parts.push({ group, vals: { primary: y }, trait: W, zcol, agec, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const treat = rows.map((r) => (r.group === 'B' ? 1 : 0));
        const W = rows.map((r) => r.trait);
        const cols = [treat, W];
        const colIds = ['treat', 'trait'];
        if (state.controlVar) { cols.push(rows.map((r) => r[state.controlVar])); colIds.push(state.controlVar); }
        const r = ctx.Stats.ols(y, cols);
        const which = state.reportCoef || 'treat';
        let idx = colIds.indexOf(which);
        if (idx < 0) idx = 0;
        const c = r.coefs[idx + 1];
        const gm = groupArrays(rows);
        const lbl = which === 'trait' ? 'Trait W' : which === 'treat' ? 'Treatment' : which;
        return { testName: 'OLS — report ' + lbl + (state.controlVar ? ' | control ' + state.controlVar : ''), statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups: { ['β (' + lbl + ')']: c.coef }, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
      },
    },
  ];

  // Campaign 6, like C2/C5, exposes the FULL arsenal on every level: the player must
  // DIAGNOSE the causal mis-specification and pick the right move, not click the only
  // button. Generic decoy knobs make every flag-based tool appear; each level's
  // evaluate() honours only its own flag, so non-matching tools are inert. All C6
  // "effects" are manufactured — no level has a real causal effect.
  const ALL_QRP = ['add-control', 'report-coefficient', 'use-instrument', 'spec-multiverse', 'choose-test', 'median-split', 'set-aggregation', 'control-covariate', 'explore-subgroups', 'recruit-more', 'robustness-check', 'refine-sample', 'winsorize', 'log-transform'];
  common.finish(LEVELS, {
    defaults: { moderator: 'mod', aggregable: true, tests: common.GENERIC.tests, candidateControls: common.GENERIC.controls, specs: common.GENERIC.specs, coefficients: common.GENERIC.coefs, instruments: common.GENERIC.instruments },
    set: { allowedTools: ALL_QRP },
    truth: () => ({ exists: false }), // every C6 effect is a manufactured artefact
  });

  const api = { C6_LEVELS: LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_levels_c6 = api;
})(typeof self !== 'undefined' ? self : this);
