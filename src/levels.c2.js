/*
 * Campaign 2 — "The Methods Section". Harder, fewer clues. The abuse is in the
 * CHOICE and SPECIFICATION of the analysis (wrong test, pseudoreplication,
 * mixed-model mis-specification, median splits, collider control, Simpson's
 * paradox, specification search). Each level carries its own evaluate(state,ctx)
 * that runs a genuine analysis via ctx.Stats / ctx.LMM.
 *
 * Registered onto PSPSS_levels.LEVELS (loaded after levels.js).
 * Every level is proven solvable at par by src/levels.verify.js.
 */
(function (root) {
  'use strict';

  const RNGlib = typeof require !== 'undefined' ? require('./rng') : root.PSPSS_rng;
  const makeRNG = RNGlib.RNG;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const groupArrays = (rows) => { const A = [], B = []; rows.forEach((r) => (r.group === 'A' ? A : B).push(r.vals.primary)); return { A, B }; };

  const LEVELS = [
    // ----------------------------------------------------------- pseudoreplication
    {
      id: 'pseudoreplication', campaign: 'c2', title: 'Count Every Mouse Twice',
      rank: 'Lab PI, grant pending', design: 'clustered', flaw: 'pseudoreplication',
      par: 1, seed: 332, predictedHigher: 'B',
      defaultMethod: 'lmm',
      tests: [
        { id: 'lmm', label: 'Mixed model (random intercept: animal)' },
        { id: 'ols', label: 't-test on all cells (ignore animal)' },
      ],
      allowedTools: ['choose-test'],
      hypothesis: 'The treated animals (B) score higher than controls (A).',
      brief: 'You measured 5 cells from each mouse. That’s 80 numbers! Enormous power... if nobody asks whether cells from the same mouse are, you know, independent.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        let subj = 0;
        for (const g of ['A', 'B']) {
          for (let a = 0; a < 8; a++) {
            const animal = rng.normal(0, 5) + (g === 'B' ? 3.2 : 0); // animal-level effect
            for (let c = 0; c < 5; c++) obs.push({ subject: subj, group: g, y: 50 + animal + rng.normal(0, 4) });
            subj++;
          }
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const A = [], B = [];
        state.observations.forEach((d) => (d.group === 'A' ? A : B).push(d.y));
        const groups = { 'Mean A': mean(A), 'Mean B': mean(B) };
        if (state.method === 'ols') {
          const r = ctx.Stats.tTestIndependent(A, B, false);
          return { testName: 't-test on all cells (ignores animal)', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B };
        }
        const o = ctx.obsArrays(state);
        const fit = ctx.LMM.fit(o.y, [o.group], o.subject);
        return { testName: 'Mixed model (random intercept: animal)', statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: o.y.length, groups, higher: fit.effect >= 0 ? 'B' : 'A', aArr: A, bArr: B };
      },
    },

    // ----------------------------------------------------------- wrong-test
    {
      id: 'wrong-test', campaign: 'c2', title: 'It’s Basically Equal Variances',
      rank: 'Methods-curious Postdoc', design: 'between', flaw: 'wrong-test',
      par: 1, seed: 864, predictedHigher: 'B',
      defaultMethod: 'welch',
      tests: [
        { id: 'welch', label: "Welch's t-test (unequal variances)" },
        { id: 'student', label: "Student's t-test (assume equal variances)" },
      ],
      allowedTools: ['choose-test'],
      dvLabels: { primary: 'Score' },
      hypothesis: 'The (small, scrappy) Group B outperforms the (large) Group A.',
      brief: 'Group B is small and wildly variable; Group A is big and tidy. Welch shrugs. But the equal-variances t-test... the equal-variances t-test believes in you.',
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 26; i++) parts.push({ group: 'A', vals: { primary: rng.normal(50, 4) }, cov: null, sub: null });
        for (let i = 0; i < 9; i++) parts.push({ group: 'B', vals: { primary: rng.normal(53.5, 11) }, cov: null, sub: null });
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const { A, B } = groupArrays(state.participants);
        const welch = state.method !== 'student';
        const r = ctx.Stats.tTestIndependent(A, B, welch);
        return { testName: welch ? "Welch's t-test" : "Student's t-test (equal var)", statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups: { 'Mean A': mean(A), 'Mean B': mean(B) }, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B };
      },
    },

    // ----------------------------------------------------------- random-slopes
    {
      id: 'random-slopes', campaign: 'c2', title: 'Keep It... Minimal',
      rank: 'Psycholinguist (lapsed)', design: 'clustered', flaw: 'random-slopes',
      par: 1, seed: 249, predictedHigher: 'B',
      defaultMethod: 'lmm', defaultLmm: 'max',
      lmm: true,
      allowedTools: ['fit-lmm'],
      hypothesis: 'Scores increase across sessions (a positive slope of Time).',
      brief: 'Everyone has their own learning curve — some steep, some flat, some plummeting. The maximal model knows this and is unimpressed. But a model that pretends all slopes are identical? Very impressed.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        for (let s = 0; s < 16; s++) {
          const b0 = rng.normal(0, 6);
          const b1 = rng.normal(0, 2.6); // large by-subject slope variance
          for (let t = 0; t < 5; t++) obs.push({ subject: s, time: t, y: 50 + b0 + (0.55 + b1) * t + rng.normal(0, 3) });
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const o = ctx.obsArrays(state);
        const time = o.get('time');
        const useSlope = state.lmmStructure === 'max';
        const fit = ctx.LMM.fit(o.y, [time], o.subject, { randomSlope: useSlope ? time : null, testCol: 0 });
        return { testName: useSlope ? 'Mixed model (random slope: Time)' : 'Mixed model (random intercept only)', statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: o.y.length, groups: { 'Time slope': fit.effect }, higher: fit.effect >= 0 ? 'B' : 'A' };
      },
    },

    // ----------------------------------------------------------- two-kinds (median split)
    {
      id: 'two-kinds', campaign: 'c2', title: 'Two Kinds of People',
      rank: 'Personality Researcher', design: 'between', flaw: 'median-split',
      par: 1, seed: 561, predictedHigher: 'B',
      moderator: 'mod',
      extraCols: [{ field: 'mod', label: 'Trait X' }],
      allowedTools: ['median-split'],
      dvLabels: { primary: 'Outcome' },
      hypothesis: 'The treatment (B) works better for people high in Trait X (a treatment × trait interaction).',
      brief: 'As a smooth continuous interaction, your moderation is a damp squib. But Trait X has a median, and a median has two sides, and two sides have a story.',
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 48; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          const modv = rng.normal(50, 10);
          // threshold-style effect: B only helps the clearly-high-trait people
          const lift = group === 'B' && modv > 56 ? 9 : 0;
          parts.push({ group, vals: { primary: 50 + lift + rng.normal(0, 7) }, mod: modv, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const treat = rows.map((r) => (r.group === 'B' ? 1 : 0));
        let mod = rows.map((r) => r.mod);
        if (state.medianSplit) { const md = median(mod); mod = mod.map((v) => (v > md ? 1 : 0)); }
        const mc = mean(mod);
        const modc = mod.map((v) => v - mc);
        const inter = treat.map((t, i) => t * modc[i]);
        const r = ctx.Stats.ols(y, [treat, modc, inter]);
        const c = r.coefs[3];
        const gm = groupArrays(rows);
        return { testName: state.medianSplit ? 'Moderation (median-split)' : 'Moderation (continuous)', statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups: { 'Interaction β': c.coef }, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
      },
    },

    // ----------------------------------------------------------- collider
    {
      id: 'collider', campaign: 'c2', title: 'Adjust Until It Appears',
      rank: 'Observational Epidemiologist', design: 'between', flaw: 'collider',
      par: 1, seed: 1271, predictedHigher: 'B',
      candidateControls: [
        { id: 'age', label: 'Age (measured before treatment)' },
        { id: 'engagement', label: 'Post-test Engagement' },
      ],
      extraCols: [{ field: 'age', label: 'Age' }, { field: 'engagement', label: 'Engagement' }],
      allowedTools: ['add-control'],
      dvLabels: { primary: 'Recovery' },
      hypothesis: 'Treatment B improves Recovery over control A.',
      brief: 'Raw, there’s nothing here. One of your two covariates is a harmless pre-treatment trait. The other was measured AFTER treatment. Adjust for the right “confounder” and an effect blooms from thin air.',
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 44; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          const treat = group === 'B' ? 1 : 0;
          const y = rng.normal(50, 8); // NO real treatment effect
          const age = rng.normal(40, 10); // pre-treatment red herring (unrelated)
          // collider: caused by BOTH treatment and outcome -> controlling it opens a path
          const engagement = 1.4 * treat - 0.16 * (y - 50) + rng.normal(0, 1);
          parts.push({ group, vals: { primary: y }, age, engagement, cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const rows = state.participants;
        const y = rows.map((r) => r.vals.primary);
        const treat = rows.map((r) => (r.group === 'B' ? 1 : 0));
        const groups = { 'Mean A': mean(rows.filter((r) => r.group === 'A').map((r) => r.vals.primary)), 'Mean B': mean(rows.filter((r) => r.group === 'B').map((r) => r.vals.primary)) };
        if (state.controlVar) {
          const cov = rows.map((r) => r[state.controlVar]);
          const r = ctx.Stats.ols(y, [treat, cov]);
          const c = r.coefs[1];
          const lbl = (state.level.candidateControls.find((x) => x.id === state.controlVar) || {}).label;
          const gm = groupArrays(rows);
          return { testName: 'ANCOVA (control: ' + lbl + ')', statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups, higher: c.coef >= 0 ? 'B' : 'A', aArr: gm.A, bArr: gm.B };
        }
        const { A, B } = groupArrays(rows);
        const r = ctx.Stats.tTestIndependent(A, B, false);
        return { testName: 'Independent t-test (unadjusted)', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: y.length, groups, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B };
      },
    },

    // ----------------------------------------------------------- simpson
    {
      id: 'simpson', campaign: 'c2', title: 'Aggregate or Disaggregate?',
      rank: 'Education Data Scientist', design: 'clustered', flaw: 'simpson',
      par: 1, seed: 2483, predictedHigher: 'B',
      aggregable: true,
      allowedTools: ['set-aggregation'],
      hypothesis: 'More Study Hours (x) predicts higher Achievement (y) — a positive relationship.',
      brief: 'Pooled across schools, the trend is a flat, disappointing nothing. But schools differ. Zoom out to school averages and a beautiful line appears. Zoom level is a choice. Choose wisely (for you).',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        const nClusters = 6, per = 10;
        // Between schools: Y rises with X (var(Xc) ~ 46.7, slope 2 -> between cov ~ 93).
        // Within schools: a strong NEGATIVE slope with wide x-spread cancels it in the
        // pooled data (within cov ~ -0.77 * 11^2 ~ -93), so pooled r ~ 0 (Simpson).
        for (let c = 0; c < nClusters; c++) {
          const Xc = 10 + c * 4;
          const Yc = 40 + 2 * Xc;
          for (let k = 0; k < per; k++) {
            const x = Xc + rng.normal(0, 11);
            const y = Yc - 0.77 * (x - Xc) + rng.normal(0, 4);
            obs.push({ subject: c, x, y });
          }
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const obs = state.observations;
        if (state.aggregated) {
          const ids = [...new Set(obs.map((o) => o.subject))];
          const mx = ids.map((id) => mean(obs.filter((o) => o.subject === id).map((o) => o.x)));
          const my = ids.map((id) => mean(obs.filter((o) => o.subject === id).map((o) => o.y)));
          const r = ctx.Stats.pearson(mx, my);
          return { testName: 'Correlation on school means (aggregated)', statLabel: 'r', statistic: r.r, df: r.df, p: r.p, n: ids.length, groups: { 'r (between)': r.r }, higher: r.r >= 0 ? 'B' : 'A' };
        }
        const r = ctx.Stats.pearson(obs.map((o) => o.x), obs.map((o) => o.y));
        return { testName: 'Correlation on all pupils (pooled)', statLabel: 'r', statistic: r.r, df: r.df, p: r.p, n: obs.length, groups: { 'r (pooled)': r.r }, higher: r.r >= 0 ? 'B' : 'A' };
      },
    },

    // ----------------------------------------------------------- spec-curve
    {
      id: 'spec-curve', campaign: 'c2', title: 'The Garden of Specifications',
      rank: 'Open-Science Skeptic', design: 'between', flaw: 'spec-curve',
      par: 1, seed: 476, predictedHigher: 'B',
      specs: [
        { label: 'preregistered (no covariates)', controls: [] },
        { label: 'control Age', controls: ['cov0'] },
        { label: 'control IQ', controls: ['cov1'] },
        { label: 'control Mood', controls: ['cov2'] },
        { label: 'control Sleep', controls: ['cov3'] },
        { label: 'control Age + Mood', controls: ['cov0', 'cov2'] },
      ],
      extraCols: [{ field: 'cov0', label: 'Age' }, { field: 'cov1', label: 'IQ' }, { field: 'cov2', label: 'Mood' }, { field: 'cov3', label: 'Sleep' }],
      allowedTools: ['spec-multiverse'],
      dvLabels: { primary: 'Effect' },
      hypothesis: 'Treatment B raises the Effect over control A.',
      brief: 'Your preregistered analysis is null. But you measured four covariates, and there are many ways to include them. Surely one of them is the “correct” model.',
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 36; i++) {
          const group = i % 2 === 0 ? 'A' : 'B';
          parts.push({ group, vals: { primary: rng.normal(50, 8) }, cov0: rng.normal(40, 10), cov1: rng.normal(100, 15), cov2: rng.normal(0, 1), cov3: rng.normal(7, 1.5), cov: null, sub: null });
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

    // ----------------------------------------------------------- outcome-switch
    {
      id: 'outcome-switch', campaign: 'c2', title: 'The Registered Primary Outcome',
      rank: 'Clinical Trialist', design: 'between', flaw: 'outcome-switch',
      par: 1, seed: 2772, predictedHigher: 'B', winThreshold: 0.001,
      allowedTools: ['pick-outcome'],
      dvLabels: { primary: 'Primary Endpoint', dv2: 'Biomarker A', dv3: 'Biomarker B', dv4: 'Quality of Life', dv5: 'Symptom Scale', dv6: 'Exploratory Index' },
      hypothesis: 'The drug (B) beats placebo (A) on the registered primary endpoint.',
      brief: 'The primary endpoint — the one you swore to the registry you cared about — did nothing. Happily, you measured six things, and the registry is not the boss of you.',
      build(seed) {
        const rng = makeRNG(seed);
        const dvs = { primary: 0, dv2: 0, dv3: 0, dv4: 9.5, dv5: 0, dv6: 0 }; // only QoL moves
        const parts = [];
        for (let i = 0; i < 18; i++) {
          for (const g of ['A', 'B']) {
            const vals = {};
            Object.keys(dvs).forEach((dv) => (vals[dv] = rng.normal(50 + (g === 'B' ? dvs[dv] : 0), 9)));
            parts.push({ group: g, vals, cov: null, sub: null });
          }
        }
        return { participants: parts };
      },
      // no evaluate: uses the default between analyze with activeDV switching
    },

    // ----------------------------------------------------------- honest-lmm (trap)
    {
      id: 'honest-lmm', campaign: 'c2', title: 'The Correctly Specified Model',
      rank: 'Reformed (briefly)', design: 'clustered', flaw: 'honest-lmm',
      par: 0, seed: 307, predictedHigher: 'B',
      defaultMethod: 'lmm',
      tests: [
        { id: 'lmm', label: 'Mixed model (random intercept: site)' },
        { id: 'ols', label: 't-test on all observations' },
      ],
      allowedTools: ['choose-test'],
      hypothesis: 'Group B differs from Group A.',
      brief: 'You specified the model correctly. You even tried the dodgy pooled test, just to look. There is nothing here — not even something to abuse. One button remains.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        let subj = 0;
        for (const g of ['A', 'B']) {
          for (let a = 0; a < 9; a++) {
            const site = rng.normal(0, 5);
            for (let c = 0; c < 4; c++) obs.push({ subject: subj, group: g, y: 50 + site + rng.normal(0, 4) });
            subj++;
          }
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const A = [], B = [];
        state.observations.forEach((d) => (d.group === 'A' ? A : B).push(d.y));
        const groups = { 'Mean A': mean(A), 'Mean B': mean(B) };
        if (state.method === 'ols') {
          const r = ctx.Stats.tTestIndependent(A, B, false);
          return { testName: 't-test on all observations', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B };
        }
        const o = ctx.obsArrays(state);
        const fit = ctx.LMM.fit(o.y, [o.group], o.subject);
        return { testName: 'Mixed model (random intercept: site)', statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: o.y.length, groups, higher: fit.effect >= 0 ? 'B' : 'A', aArr: A, bArr: B };
      },
    },
  ];

  // Campaign 2 design: every level now offers the FULL analysis-choice menu, so
  // the player must DIAGNOSE the flaw and pick the right analysis — not just click
  // the only available button. Only the analysis matching the flaw crosses the
  // threshold; the others are genuine decoys (inert, or the honest non-significant
  // answer). We add the gating flags so the flag-based tools always appear; the
  // field-gated tools (choose-test / add-control / spec-multiverse / pick-outcome)
  // appear only where their data exists. Each level's evaluate() honours just its
  // own flag, so non-matching tools cannot accidentally win (proved by levels.verify).
  const C2_MENU = ['choose-test', 'fit-lmm', 'add-control', 'median-split', 'set-aggregation', 'spec-multiverse', 'pick-outcome', 'robustness-check'];
  // Ground-truth for the debrief reveal (see levels.js). These levels manufacture
  // a FALSE POSITIVE from genuine null structure; the rest have a real effect
  // obtained by an invalid analysis.
  const FALSE_POSITIVE = { 'two-kinds': 1, collider: 1, simpson: 1, 'spec-curve': 1, 'honest-lmm': 1 };
  LEVELS.forEach((l) => {
    if (l.lmm === undefined) l.lmm = true;
    if (l.moderator === undefined) l.moderator = 'mod';
    if (l.aggregable === undefined) l.aggregable = true;
    l.allowedTools = C2_MENU;
    l.truth = FALSE_POSITIVE[l.id] ? { exists: false } : { exists: true, higher: 'B' };
  });

  // register onto the shared LEVELS array
  const levelsApi = typeof require !== 'undefined' ? require('./levels') : root.PSPSS_levels;
  LEVELS.forEach((l) => levelsApi.LEVELS.push(l));

  const api = { C2_LEVELS: LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_levels_c2 = api;
})(typeof self !== 'undefined' ? self : this);
