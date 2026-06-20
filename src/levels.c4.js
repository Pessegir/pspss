/*
 * Campaign 4 — "Open Science" (the redemption arc). The goal flips: you no longer
 * chase p < .05, you reach a DEFENSIBLE conclusion. Each level's evaluate() sets
 * decisionWin from the honest-method flags AND "no QRP used" (suspicion === 0).
 * The full QRP arsenal is present and tempting — but it raises suspicion and loses.
 *
 * objective:'honest' tells the engine/UI to judge by decisionWin, not the metric.
 * Registered onto PSPSS_levels.LEVELS. Verified by src/levels.verify.js.
 */
(function (root) {
  'use strict';

  const RNGlib = typeof require !== 'undefined' ? require('./rng') : root.PSPSS_rng;
  const makeRNG = RNGlib.RNG;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const groupArrays = (rows, dv) => { const A = [], B = []; rows.forEach((r) => (r.group === 'A' ? A : B).push(r.vals[dv || 'primary'])); return { A, B }; };
  const between = (group, primary, extra) => ({ group, vals: Object.assign({ primary }, extra && extra.vals), cov: null, sub: null });

  function twoGroups(seed, nA, nB, delta, sd) {
    const rng = makeRNG(seed);
    const p = [];
    for (let i = 0; i < nA; i++) p.push(between('A', rng.normal(50, sd)));
    for (let i = 0; i < nB; i++) p.push(between('B', rng.normal(50 + delta, sd)));
    return p;
  }

  // shared honest-conclusion goal text
  const GOAL = 'Reach a defensible conclusion';

  const LEVELS = [
    // 1 -------------------------------------------------- preregistration
    {
      id: 'sign-here-first', campaign: 'c4', objective: 'honest', title: 'Sign Here First',
      rank: 'Reformed PI', design: 'between', flaw: 'preregistration', par: 1, seed: 1,
      predictedHigher: 'B', dvLabels: { primary: 'Outcome' },
      hypothesis: 'A real effect is here — the trick is to claim it the credible way.',
      brief: 'There IS an effect (B beats A). The whole arsenal of shortcuts is on the menu. But a result is only believable if you committed to the analysis before you saw the data. Do the boring, powerful thing.',
      build(seed) { return { participants: twoGroups(seed, 26, 26, 6, 10) }; },
      evaluate(state, ctx) {
        const { A, B } = groupArrays(state.participants);
        const r = ctx.Stats.tTestIndependent(A, B, false);
        return { testName: 'Independent t-test (as preregistered)', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups: { 'Mean A': mean(A), 'Mean B': mean(B) }, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B, goalText: GOAL, decisionWin: state.preregistered && state.suspicion === 0 };
      },
    },

    // 2 -------------------------------------------------- a-priori power
    {
      id: 'powered-up', campaign: 'c4', objective: 'honest', title: 'Powered Up',
      rank: 'Power-User (literally)', design: 'between', flaw: 'power', par: 2, seed: 1,
      predictedHigher: 'B', expectedD: 0.5, dvLabels: { primary: 'Score' },
      hypothesis: 'A small real effect exists. Detect it honestly, not by peeking.',
      brief: 'You start badly under-powered (n=10/group). Tempted to "just collect a few more until p < .05"? That is optional stopping. Instead: work out how many you need IN ADVANCE, then collect exactly that — once.',
      build(seed) {
        const rng = makeRNG(seed);
        const mk = (g, n, off) => { const a = []; for (let i = 0; i < n; i++) a.push(between(g, rng.normal(50 + off, 10))); return a; };
        return { participants: mk('A', 10, 0).concat(mk('B', 10, 5)), reserve: mk('A', 53, 0).concat(mk('B', 53, 5)) };
      },
      evaluate(state, ctx) {
        const { A, B } = groupArrays(state.participants);
        const r = ctx.Stats.tTestIndependent(A, B, false);
        return { testName: 'Independent t-test', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups: { 'Mean A': mean(A), 'Mean B': mean(B) }, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B, goalText: GOAL, decisionWin: state.adequatePower && state.suspicion === 0 };
      },
    },

    // 3 -------------------------------------------------- multiple comparisons
    {
      id: 'all-of-them', campaign: 'c4', objective: 'honest', title: 'All of Them',
      rank: 'Honest Broker', design: 'between', flaw: 'multiplicity', par: 1, seed: 1,
      predictedHigher: 'B', dvLabels: { primary: 'Wellbeing', dv2: 'Focus', dv3: 'Creativity', dv4: 'Vitality', dv5: 'Charisma' },
      hypothesis: 'You measured five outcomes. One looks significant. Is it real?',
      brief: 'Five outcomes, and one squeaked under .05. Reporting just that one is cherry-picking. The honest move is to adjust every p-value for the family of tests you ran — and report what survives (probably nothing).',
      build(seed) {
        const rng = makeRNG(seed);
        const dvs = ['primary', 'dv2', 'dv3', 'dv4', 'dv5'];
        const parts = [];
        for (let i = 0; i < 22; i++) {
          for (const g of ['A', 'B']) {
            const vals = {};
            dvs.forEach((dv) => (vals[dv] = rng.normal(50, 9))); // all genuinely null
            parts.push({ group: g, vals, cov: null, sub: null });
          }
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const dvs = state.dvNames;
        const ps = dvs.map((dv) => { const { A, B } = groupArrays(state.participants, dv); return ctx.Stats.tTestIndependent(A, B, false).p; });
        const minIdx = ps.indexOf(Math.min.apply(null, ps));
        const adj = state.corrected ? ctx.Stats.adjustP(ps, state.corrected) : ps;
        const shown = state.corrected ? Math.min.apply(null, adj) : ps[minIdx];
        const { A, B } = groupArrays(state.participants, dvs[minIdx]);
        const tt = ctx.Stats.tTestIndependent(A, B, false);
        return { testName: state.corrected ? `Best outcome (${state.level.dvLabels[dvs[minIdx]]}), ${state.corrected === 'bonferroni' ? 'Bonferroni' : 'BH'}-adjusted` : `Best of ${dvs.length} outcomes: ${state.level.dvLabels[dvs[minIdx]]} (unadjusted)`, statLabel: 't', statistic: tt.t, df: tt.df, p: shown, n: A.length + B.length, groups: { 'Mean A': mean(A), 'Mean B': mean(B) }, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B, goalText: GOAL, decisionWin: !!state.corrected && state.suspicion === 0 };
      },
    },

    // 4 -------------------------------------------------- equivalence (TOST)
    {
      id: 'absence-of-evidence', campaign: 'c4', objective: 'honest', title: 'Absence of Evidence',
      rank: 'Null Whisperer', design: 'between', flaw: 'equivalence', par: 1, seed: 1,
      predictedHigher: 'B', equivBound: 3, dvLabels: { primary: 'Outcome' },
      hypothesis: 'There is genuinely no effect. Can you say so, credibly?',
      brief: '"p = .42, n.s." proves nothing — absence of evidence is not evidence of absence. With enough data you can do better: an equivalence test can actively show the effect is too small to matter.',
      build(seed) { return { participants: twoGroups(seed, 40, 40, 0, 6) }; },
      evaluate(state, ctx) {
        const { A, B } = groupArrays(state.participants);
        const r = ctx.Stats.tTestIndependent(A, B, false);
        return { testName: state.tostResult ? 'Equivalence test (TOST)' : 'Independent t-test', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups: { 'Mean A': mean(A), 'Mean B': mean(B) }, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B, goalText: GOAL, decisionWin: !!(state.tostResult && state.tostResult.equivalent) && state.suspicion === 0 };
      },
    },

    // 5 -------------------------------------------------- honest multiverse
    {
      id: 'whole-garden', campaign: 'c4', objective: 'honest', title: 'The Whole Garden',
      rank: 'Multiverse Cartographer', design: 'between', flaw: 'multiverse-honest', par: 1, seed: 1,
      predictedHigher: 'B',
      specs: [
        { label: 'no covariates', controls: [] }, { label: 'control Age', controls: ['cov0'] },
        { label: 'control IQ', controls: ['cov1'] }, { label: 'control Mood', controls: ['cov2'] },
        { label: 'control Sleep', controls: ['cov3'] }, { label: 'Age + Mood', controls: ['cov0', 'cov2'] },
      ],
      dvLabels: { primary: 'Effect' },
      hypothesis: 'Across reasonable models, is the effect robust — or did one spec just get lucky?',
      brief: 'One of your six model specifications is significant. Picking it is a specification search. The honest move is to report the entire specification curve and let the reader judge robustness.',
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        for (let i = 0; i < 36; i++) {
          const g = i % 2 === 0 ? 'A' : 'B';
          parts.push({ group: g, vals: { primary: rng.normal(50, 8) }, cov0: rng.normal(40, 10), cov1: rng.normal(100, 15), cov2: rng.normal(0, 1), cov3: rng.normal(7, 1.5), cov: null, sub: null });
        }
        return { participants: parts };
      },
      evaluate(state, ctx) {
        const idx = state.specIndex == null ? 0 : state.specIndex;
        const spec = state.level.specs[idx];
        const y = state.participants.map((r) => r.vals.primary);
        const treat = state.participants.map((r) => (r.group === 'B' ? 1 : 0));
        const cols = [treat].concat(spec.controls.map((c) => state.participants.map((r) => r[c])));
        const r = ctx.Stats.ols(y, cols);
        const c = r.coefs[1];
        const { A, B } = groupArrays(state.participants);
        return { testName: state.multivReported ? 'Full specification curve (reported)' : 'Spec: ' + spec.label, statLabel: 't', statistic: c.t, df: r.dfResid, p: c.p, n: y.length, groups: { 'group β': c.coef }, higher: c.coef >= 0 ? 'B' : 'A', aArr: A, bArr: B, goalText: GOAL, decisionWin: state.multivReported && state.suspicion === 0 };
      },
    },

    // 6 -------------------------------------------------- replication (capstone)
    {
      id: 'the-replication', campaign: 'c4', objective: 'honest', title: 'The Replication',
      rank: 'Replicator', design: 'between', flaw: 'replication', par: 3, seed: 1,
      predictedHigher: 'B', expectedD: 0.5, dvLabels: { primary: 'Effect' },
      hypothesis: 'A famous, flashy finding. Does it hold up?',
      brief: 'You are replicating a celebrated effect (the original claimed d ≈ 0.5). Do it properly: preregister, power for the original effect, collect that sample once, and report what you find — even if the legend dies.',
      build(seed) {
        const rng = makeRNG(seed);
        const mk = (g, n, off) => { const a = []; for (let i = 0; i < n; i++) a.push(between(g, rng.normal(50 + off, 10))); return a; };
        // the original was a false positive: the true effect is ~nil
        return { participants: mk('A', 12, 0).concat(mk('B', 12, 0.6)), reserve: mk('A', 51, 0).concat(mk('B', 51, 0.6)) };
      },
      evaluate(state, ctx) {
        const { A, B } = groupArrays(state.participants);
        const r = ctx.Stats.tTestIndependent(A, B, false);
        return { testName: 'Preregistered direct replication', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups: { 'Mean A': mean(A), 'Mean B': mean(B) }, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B, goalText: GOAL, decisionWin: state.preregistered && state.adequatePower && state.suspicion === 0 };
      },
    },
  ];

  // Honest tools + the full tempting QRP arsenal. The QRPs raise suspicion, so they
  // can never satisfy the "no QRP used" (suspicion===0) part of decisionWin — they're
  // visible temptations that lose. Generic decoy data makes the flag-based QRPs appear.
  const HONEST = ['preregister', 'power-analysis', 'collect-to-power', 'correct-comparisons', 'equivalence-test', 'report-multiverse'];
  const QRP = ['choose-test', 'fit-lmm', 'add-control', 'median-split', 'set-aggregation', 'spec-multiverse', 'pick-outcome', 'control-covariate', 'explore-subgroups', 'recruit-more', 'robustness-check', 'refine-sample', 'winsorize', 'log-transform'];
  const GENERIC_TESTS = [{ id: 'welch', label: "Welch's t-test (unequal var)" }, { id: 'student', label: "Student's t-test (equal var)" }, { id: 'mann', label: 'Mann-Whitney U (nonparametric)' }];
  const GENERIC_CONTROLS = [{ id: 'covA', label: 'Baseline Covariate' }, { id: 'covB', label: 'Another Covariate' }];
  LEVELS.forEach((l) => {
    l.truth = { exists: l.id === 'sign-here-first' || l.id === 'powered-up' };
    if (l.lmm === undefined) l.lmm = true;
    if (l.moderator === undefined) l.moderator = 'mod';
    if (l.aggregable === undefined) l.aggregable = true;
    if (l.tests === undefined) l.tests = GENERIC_TESTS;
    if (l.candidateControls === undefined) l.candidateControls = GENERIC_CONTROLS;
    l.allowedTools = HONEST.concat(QRP);
  });

  const levelsApi = typeof require !== 'undefined' ? require('./levels') : root.PSPSS_levels;
  LEVELS.forEach((l) => levelsApi.LEVELS.push(l));

  const api = { C4_LEVELS: LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_levels_c4 = api;
})(typeof self !== 'undefined' ? self : this);
