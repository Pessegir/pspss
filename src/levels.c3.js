/*
 * Campaign 3 — "In Bayes We Trust". The win metric is the Bayes factor, not p.
 * The abuse moves from the data to the PRIOR: widen/narrow it, go one-sided,
 * peek-and-collect, or just report BF01 and call it "strong evidence".
 *
 * All levels share one honest Bayesian t-test evaluator (bayesEval) and differ
 * only in data, allowed tools, and the BF threshold. Registered onto
 * PSPSS_levels.LEVELS. Verified by src/levels.verify.js.
 */
(function (root) {
  'use strict';

  const RNGlib = typeof require !== 'undefined' ? require('./rng') : root.PSPSS_rng;
  const makeRNG = RNGlib.RNG;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

  // Shared evaluator: a genuine JZS Bayesian t-test honouring the state's prior
  // width, one-sided flag, and BF01 flip.
  function bayesEval(state, ctx) {
    const { A, B } = ctx.getArrays(state);
    const tt = ctx.Stats.tTestIndependent(B, A, false); // t > 0 when B > A
    const t = tt.t;
    const N = (A.length * B.length) / (A.length + B.length);
    const nu = A.length + B.length - 2;
    let bf = state.oneSided ? ctx.Bayes.bf10OneSided(t, N, nu, state.priorScale) : ctx.Bayes.bf10(t, N, nu, state.priorScale);
    let metricLabel = 'BF₁₀';
    let higher = t >= 0 ? 'B' : 'A';
    if (state.reportBF01) {
      bf = 1 / bf;
      metricLabel = 'BF₀₁';
      higher = state.predictedHigher; // the spin: report it as if it supports you
    }
    return {
      testName: 'Bayesian t-test (Cauchy r=' + (+state.priorScale).toFixed(3) + (state.oneSided ? ', one-sided' : '') + ')',
      statLabel: 't', statistic: t, df: nu, bf, metricKind: 'bf', metricLabel,
      n: A.length + B.length, groups: { 'Mean A': mean(A), 'Mean B': mean(B) }, higher,
      aArr: A, bArr: B,
    };
  }

  function twoGroups(seed, nA, nB, delta, sd) {
    const rng = makeRNG(seed);
    const parts = [];
    for (let i = 0; i < nA; i++) parts.push({ group: 'A', vals: { primary: rng.normal(50, sd) }, cov: null, sub: null });
    for (let i = 0; i < nB; i++) parts.push({ group: 'B', vals: { primary: rng.normal(50 + delta, sd) }, cov: null, sub: null });
    return parts;
  }
  function twoGroupsReserve(seed, nA, nB, rA, rB, delta, sd) {
    const rng = makeRNG(seed);
    const mk = (g, n, off) => { const a = []; for (let i = 0; i < n; i++) a.push({ group: g, vals: { primary: rng.normal(50 + off, sd) }, cov: null, sub: null }); return a; };
    return { participants: mk('A', nA, 0).concat(mk('B', nB, delta)), reserve: mk('A', rA, 0).concat(mk('B', rB, delta)) };
  }

  const base = { campaign: 'c3', design: 'between', paradigm: 'bayesian', predictedHigher: 'B', defaultPrior: 0.707, dvLabels: { primary: 'Score' }, evaluate: bayesEval };

  const LEVELS = [
    Object.assign({}, base, {
      id: 'pick-a-prior', title: 'Pick a Prior, Any Prior', rank: 'Bayesian Convert', flaw: 'prior-width',
      par: 1, seed: 3748, winThreshold: 3, allowedTools: ['set-prior'],
      hypothesis: 'Group B scores higher than A — and the evidence is "substantial" (BF₁₀ > 3).',
      brief: 'Under the default prior, your Bayes factor is a limp ~2.6 — just shy of "substantial". But "default" is one choice among infinitely many, and a narrower prior likes your small effect better.',
      build(seed) { return { participants: twoGroups(seed, 50, 50, 4.8, 10) }; },
    }),
    Object.assign({}, base, {
      id: 'watch-bf-climb', title: 'Watch the BF Climb', rank: 'Sequential Analyst', flaw: 'optional-stopping-bayes',
      par: 1, seed: 2856, winThreshold: 3, allowedTools: ['collect-more-bayes'],
      hypothesis: 'Group B beats A (BF₁₀ > 3).',
      brief: 'They told you Bayesian methods are immune to optional stopping. They were being optimistic about your self-control. Keep collecting; stop when the BF looks nice.',
      build(seed) { return twoGroupsReserve(seed, 12, 12, 16, 16, 5.5, 10); },
    }),
    Object.assign({}, base, {
      id: 'directional-now', title: 'A Directional Hypothesis (Now)', rank: 'Theory-Flexible Scholar', flaw: 'one-sided',
      par: 1, seed: 2050, winThreshold: 3, allowedTools: ['one-sided-prior'],
      hypothesis: 'B beats A (BF₁₀ > 3).',
      brief: 'Two-sided, your evidence is merely "anecdotal". But you always expected B to win — surely a one-sided prior just encodes that noble foresight. (It roughly doubles the BF. Coincidence.)',
      build(seed) { return { participants: twoGroups(seed, 18, 18, 5.5, 10) }; },
    }),
    Object.assign({}, base, {
      id: 'bf01-flip', title: 'BF₀₁ for a Friend', rank: 'Spin Doctor (Quant.)', flaw: 'bf01-flip',
      par: 1, seed: 2257, winThreshold: 3, allowedTools: ['report-bf01'],
      hypothesis: 'There is "strong evidence" for our position (BF > 3, whichever way you frame it).',
      brief: 'The data shrug: BF₁₀ is well under 1. That is evidence for the NULL. But "BF₀₁ = 5, strong evidence!" reads beautifully in an abstract, and nobody checks the subscript.',
      build(seed) { return { participants: twoGroups(seed, 22, 22, 0, 10) }; },
    }),
    Object.assign({}, base, {
      id: 'robustness-buffet', title: 'Robustness, but Make It Convenient', rank: 'Reviewer-Proofer', flaw: 'prior-robustness',
      par: 1, seed: 3748, winThreshold: 3, allowedTools: ['prior-robustness'],
      hypothesis: 'B beats A (BF₁₀ > 3).',
      brief: 'A reviewer will demand a "robustness analysis" across priors. Run it across seven priors, then report the most robust result — defined, naturally, as the largest one.',
      build(seed) { return { participants: twoGroups(seed, 50, 50, 4.8, 10) }; },
    }),
    Object.assign({}, base, {
      id: 'sequential-strong', title: 'Sequential to Strong', rank: 'Registered Report Escapee', flaw: 'optional-stopping-bayes',
      par: 1, seed: 3526, winThreshold: 10, allowedTools: ['collect-more-bayes'],
      hypothesis: 'B beats A with STRONG evidence (BF₁₀ > 10).',
      brief: '"Substantial" is for cowards. Keep the data tap running until the Bayes factor clears 10 and you can write the word "decisive".',
      build(seed) { return twoGroupsReserve(seed, 16, 16, 34, 34, 6, 10); },
    }),
    Object.assign({}, base, {
      id: 'full-prior-hack', title: 'The Full Bayesian Hack', rank: 'Methodological Houdini', flaw: 'capstone',
      par: 2, seed: 1694, winThreshold: 10, allowedTools: ['collect-more-bayes', 'one-sided-prior'],
      hypothesis: 'B beats A, DECISIVELY (BF₁₀ > 10).',
      brief: 'Neither "just collect a bit more" NOR a one-sided hypothesis reaches "decisive" alone. But why choose? Peek-and-collect AND go one-sided. This is the final exam.',
      build(seed) { return twoGroupsReserve(seed, 16, 16, 10, 10, 6, 10); },
    }),
    Object.assign({}, base, {
      id: 'default-prior-trap', title: 'The Default-Prior Trap', rank: 'Briefly Honest, Again', flaw: 'honest-bayes',
      par: 0, seed: 3296, winThreshold: 3, allowedTools: ['set-prior'],
      hypothesis: 'B differs from A.',
      brief: 'You tried every prior in the drawer. The Bayes factor sits stubbornly near 1 — the data are genuinely ambiguous. Bayesian honesty means saying exactly that. One button still lies.',
      build(seed) { return { participants: twoGroups(seed, 24, 24, 1, 10) }; },
    }),
  ];

  // Ground-truth for the debrief reveal. bf01-flip and the default-prior trap are
  // genuinely null (a "win" there is spin / a false positive); the rest have a real
  // (if small) effect that prior-hacking merely overstates.
  const FALSE_POSITIVE = { 'bf01-flip': 1, 'default-prior-trap': 1 };
  LEVELS.forEach((l) => { l.truth = FALSE_POSITIVE[l.id] ? { exists: false } : { exists: true, higher: 'B' }; });

  const levelsApi = typeof require !== 'undefined' ? require('./levels') : root.PSPSS_levels;
  LEVELS.forEach((l) => levelsApi.LEVELS.push(l));

  const api = { C3_LEVELS: LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_levels_c3 = api;
})(typeof self !== 'undefined' ? self : this);
