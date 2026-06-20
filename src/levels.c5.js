/*
 * Campaign 5 — "Mixed Signals". A (generalized) linear mixed model masterclass.
 * Re-teaches the C2 mixed-model pitfalls harder, then goes deep into the ones the
 * literature stresses most: naive degrees of freedom, within/between conflation,
 * clustering at the wrong level, and (Phase 3) genuinely generalized models —
 * Gaussian-on-binary and ignored overdispersion — capped by a forking-paths boss.
 *
 * Each level carries its own evaluate(state, ctx) running a genuine analysis via
 * ctx.Stats / ctx.LMM / ctx.GLMM. Registered onto PSPSS_levels.LEVELS.
 * Proven solvable at par by src/levels.verify.js; seeds from src/tune-seeds.c5.js.
 */
(function (root) {
  'use strict';

  const RNGlib = typeof require !== 'undefined' ? require('./rng') : root.PSPSS_rng;
  const makeRNG = RNGlib.RNG;
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const groupArrays = (rows) => { const A = [], B = []; rows.forEach((r) => (r.group === 'A' ? A : B).push(r.vals.primary)); return { A, B }; };

  const LEVELS = [
    // ----------------------------------------------------------- pseudoreplication (harder)
    {
      id: 'pseudo-redux', campaign: 'c5', title: 'One Mouse, Eight Pretend Mice',
      rank: 'Returning PI', design: 'clustered', flaw: 'pseudoreplication',
      par: 1, seed: 308, predictedHigher: 'B',
      defaultMethod: 'lmm',
      tests: [
        { id: 'lmm', label: 'Mixed model (random intercept: animal)' },
        { id: 'ols', label: 't-test on every cell (ignore animal)' },
      ],
      hypothesis: 'The treated animals (B) score higher than the controls (A).',
      brief: 'Six mice per group, eight cells measured from each. The mixed model counts six independent mice and shrugs. The t-test counts forty-eight gloriously "independent" cells and believes.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        let subj = 0;
        for (const g of ['A', 'B']) {
          for (let a = 0; a < 6; a++) {
            const animal = rng.normal(0, 5) + (g === 'B' ? 2.1 : 0); // modest animal-level lift
            for (let c = 0; c < 8; c++) obs.push({ subject: subj, group: g, y: 50 + animal + rng.normal(0, 4) });
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
          return { testName: 't-test on every cell (ignores animal)', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: A.length + B.length, groups, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B };
        }
        const o = ctx.obsArrays(state);
        const fit = ctx.LMM.fit(o.y, [o.group], o.subject);
        return { testName: 'Mixed model (random intercept: animal)', statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: o.y.length, groups, higher: fit.effect >= 0 ? 'B' : 'A', aArr: A, bArr: B };
      },
    },

    // ----------------------------------------------------------- random slopes (harder)
    {
      id: 'slopes-redux', campaign: 'c5', title: 'Everyone Learns Identically, Surely',
      rank: 'Relapsed Psycholinguist', design: 'clustered', flaw: 'random-slopes',
      par: 1, seed: 42, predictedHigher: 'B',
      defaultMethod: 'lmm', defaultLmm: 'max', lmm: true,
      hypothesis: 'Scores increase across sessions — a positive average slope of Time.',
      brief: 'Fourteen learners, fourteen different trajectories. The maximal model lets each person have their own slope and finds your average unconvincing. Pretend the slopes are identical and the standard error melts away.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        for (let s = 0; s < 14; s++) {
          const b0 = rng.normal(0, 6);
          const b1 = rng.normal(0, 2.8); // large by-subject slope variance
          for (let t = 0; t < 5; t++) obs.push({ subject: s, time: t, y: 50 + b0 + (0.3 + b1) * t + rng.normal(0, 3) });
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

    // ----------------------------------------------------------- naive degrees of freedom
    {
      id: 'naive-df', campaign: 'c5', title: 'Infinite Degrees of Freedom',
      rank: 'Asymptotically Optimistic', design: 'clustered', flaw: 'naive-df',
      par: 1, seed: 301, predictedHigher: 'B',
      dfTestable: true, defaultDf: 'finite',
      hypothesis: 'Group B clusters score higher than Group A clusters.',
      brief: 'Eight clusters. Eighty rows. lme4 politely declines to print a p-value, because with this few clusters the degrees of freedom are small and uncertain. Override it with the Wald z — infinite df — and the asterisk appears.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        let subj = 0;
        for (const g of ['A', 'B']) {
          for (let a = 0; a < 4; a++) { // 4 clusters per group = 8 clusters
            const clusterEff = rng.normal(0, 6) + (g === 'B' ? 3.0 : 0);
            for (let k = 0; k < 10; k++) obs.push({ subject: subj, group: g, y: 50 + clusterEff + rng.normal(0, 5) });
            subj++;
          }
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const A = [], B = [];
        state.observations.forEach((d) => (d.group === 'A' ? A : B).push(d.y));
        const groups = { 'Mean A': mean(A), 'Mean B': mean(B) };
        const o = ctx.obsArrays(state);
        const fit = ctx.LMM.fit(o.y, [o.group], o.subject);
        const higher = fit.effect >= 0 ? 'B' : 'A';
        if (state.dfMethod === 'z') {
          return { testName: 'Mixed model — Wald z (df = ∞)', statLabel: 'z', statistic: fit.t, df: Infinity, p: ctx.Stats.normalTwoTailedP(fit.t), n: o.y.length, groups, higher, aArr: A, bArr: B };
        }
        return { testName: 'Mixed model — finite df ≈ ' + fit.df, statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: o.y.length, groups, higher, aArr: A, bArr: B };
      },
    },

    // ----------------------------------------------------------- within/between conflation
    {
      id: 'within-between', campaign: 'c5', title: 'Within, Between, Whatever',
      rank: 'Multilevel Opportunist', design: 'clustered', flaw: 'within-between-conflation',
      par: 1, seed: 2483, predictedHigher: 'B',
      aggregable: true,
      hypothesis: 'More practice hours (x) predict higher performance (y) — a positive relationship.',
      brief: 'Pupil by pupil, within each school, more practice predicts slightly LOWER scores. But schools that practice more score higher overall. Conflate the two levels — regress on school means — and the within-pupil truth politely disappears.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        const nClusters = 6, per = 10;
        // Between schools Y rises with X; within schools a negative slope cancels it
        // in the pooled data (Simpson). Aggregating to school means recovers only the
        // confounded between-effect.
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
          return { testName: 'Regression on school means (between only)', statLabel: 'r', statistic: r.r, df: r.df, p: r.p, n: ids.length, groups: { 'r (between)': r.r }, higher: r.r >= 0 ? 'B' : 'A' };
        }
        const r = ctx.Stats.pearson(obs.map((o) => o.x), obs.map((o) => o.y));
        return { testName: 'Regression on all pupils (pooled)', statLabel: 'r', statistic: r.r, df: r.df, p: r.p, n: obs.length, groups: { 'r (pooled)': r.r }, higher: r.r >= 0 ? 'B' : 'A' };
      },
    },

    // ----------------------------------------------------------- wrong clustering level
    {
      id: 'wrong-level', campaign: 'c5', title: 'Cluster at the Convenient Level',
      rank: 'Nesting Enthusiast', design: 'clustered', flaw: 'wrong-random-level',
      par: 1, seed: 246, predictedHigher: 'B',
      defaultMethod: 'lmm-patient',
      tests: [
        { id: 'lmm-patient', label: 'Mixed model (random intercept: patient)' },
        { id: 'lmm-clinic', label: 'Mixed model (random intercept: clinic)' },
        { id: 'ols', label: 't-test on all visits (ignore nesting)' },
      ],
      hypothesis: 'Patients on treatment B improve more than those on A.',
      brief: 'Patients are nested in clinics, with several visits each. The dependence that matters is between VISITS of a patient. Cluster by clinic instead and every repeated visit counts as fresh evidence — the right random effect at the wrong level.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        let pid = 0;
        for (let clinic = 0; clinic < 4; clinic++) {
          for (let pInC = 0; pInC < 4; pInC++) {
            const group = pid % 2 === 0 ? 'A' : 'B';
            const patientEff = rng.normal(0, 7); // strong between-patient variation
            for (let visit = 0; visit < 5; visit++) {
              obs.push({ subject: pid, patient: pid, clinic: clinic, group, y: 50 + patientEff + rng.normal(0, 3) });
            }
            pid++;
          }
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const rows = state.observations;
        const A = [], B = [];
        rows.forEach((d) => (d.group === 'A' ? A : B).push(d.y));
        const groups = { 'Mean A': mean(A), 'Mean B': mean(B) };
        const m = state.method || 'lmm-patient';
        if (m === 'ols') {
          const r = ctx.Stats.tTestIndependent(A, B, false);
          return { testName: 't-test on all visits (ignores nesting)', statLabel: 't', statistic: r.t, df: r.df, p: r.p, n: rows.length, groups, higher: mean(B) >= mean(A) ? 'B' : 'A', aArr: A, bArr: B };
        }
        const o = ctx.obsArrays(state);
        if (m === 'lmm-clinic') {
          const clinic = rows.map((d) => d.clinic);
          const fit = ctx.LMM.fit(o.y, [o.group], clinic);
          return { testName: 'Mixed model (random intercept: clinic)', statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: rows.length, groups, higher: fit.effect >= 0 ? 'B' : 'A', aArr: A, bArr: B };
        }
        const patient = rows.map((d) => d.patient);
        const fit = ctx.LMM.fit(o.y, [o.group], patient);
        return { testName: 'Mixed model (random intercept: patient)', statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: rows.length, groups, higher: fit.effect >= 0 ? 'B' : 'A', aArr: A, bArr: B };
      },
    },

    // ----------------------------------------------------------- clustered binary (logistic GLMM)
    {
      id: 'glmm-binary', campaign: 'c5', title: 'Pool Every Yes and No',
      rank: 'Logistic Enthusiast', design: 'clustered', flaw: 'clustered-binary',
      par: 1, seed: 93, predictedHigher: 'B',
      defaultMethod: 'glmm-logistic',
      tests: [
        { id: 'glmm-logistic', label: 'Logistic GLMM (random intercept: subject)' },
        { id: 'glm-logistic', label: 'Logistic regression (pooled — ignore subject)' },
      ],
      hypothesis: 'Patients on B are more likely to respond (a binary 0/1 outcome) than on A.',
      brief: 'The outcome is yes/no, measured six times per patient — and patients differ wildly in their baseline odds. The logistic mixed model accounts for that and is unconvinced. Pour every trial into one pooled logistic regression, as if each were an independent patient, and the standard error shrinks to fit your hopes.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        let subj = 0;
        for (const g of ['A', 'B']) {
          for (let s = 0; s < 10; s++) {
            const re = rng.normal(0, 1.3); // large between-subject spread (logit scale)
            const base = g === 'B' ? -0.7 : -1.2;
            for (let t = 0; t < 6; t++) {
              const pr = 1 / (1 + Math.exp(-(base + re)));
              obs.push({ subject: subj, group: g, y: rng.next() < pr ? 1 : 0 });
            }
            subj++;
          }
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const o = ctx.obsArrays(state);
        const A = [], B = [];
        state.observations.forEach((d) => (d.group === 'A' ? A : B).push(d.y));
        const groups = { 'P(resp) A': mean(A), 'P(resp) B': mean(B) };
        if (state.method === 'glm-logistic') {
          const r = ctx.GLMM.glm(o.y, [o.group], { family: 'binomial' });
          const z = r.betas.length ? r.betas[1] / r.ses[1] : 0;
          return { testName: 'Logistic regression (pooled, ignores subject)', statLabel: 'z', statistic: z, df: Infinity, p: ctx.Stats.normalTwoTailedP(z), n: o.y.length, groups, higher: z >= 0 ? 'B' : 'A', aArr: A, bArr: B };
        }
        const fit = ctx.GLMM.fit(o.y, [o.group], o.subject, { family: 'binomial' });
        return { testName: 'Logistic GLMM (random intercept: subject)', statLabel: 'z', statistic: fit.z, df: Infinity, p: fit.p, n: o.y.length, groups, higher: fit.effect >= 0 ? 'B' : 'A', aArr: A, bArr: B };
      },
    },

    // ----------------------------------------------------------- ignored overdispersion (GLMM)
    {
      id: 'glmm-overdispersion', campaign: 'c5', title: 'Overdispersed and Overconfident',
      rank: 'Poisson True Believer', design: 'clustered', flaw: 'overdispersion-ignored',
      par: 1, seed: 34, predictedHigher: 'B',
      glmm: true, defaultFamily: 'poisson', defaultOLRE: true,
      hypothesis: 'Higher dose (within subject) predicts higher counts — a positive dose slope.',
      brief: 'Counts, measured across five doses within each subject — and far more variable than a Poisson allows. The honest fix is an observation-level random effect for the overdispersion, which keeps the standard error wide. Drop it, trust the raw Poisson, and the variance you ignored becomes significance you keep.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        let subj = 0;
        for (let s = 0; s < 16; s++) {
          const re = rng.normal(0, 0.4); // subject random intercept
          for (let dose = 0; dose < 5; dose++) {
            const od = rng.normal(0, 0.9); // observation-level overdispersion
            const lam = Math.exp(1.2 + 0.1 * dose + re + od);
            let k = 0, L = Math.exp(-lam), pr = 1;
            do { k++; pr *= rng.next(); } while (pr > L);
            obs.push({ subject: subj, dose: dose, y: k - 1 });
          }
          subj++;
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const o = ctx.obsArrays(state);
        const dose = o.get('dose');
        // QRP = plain Poisson (no OLRE); honest/default = Poisson + OLRE.
        const olre = !(state.glmmFamily === 'poisson' && state.glmmOLRE === false);
        const fit = ctx.GLMM.fit(o.y, [dose], o.subject, { family: 'poisson', olre });
        const lbl = olre ? 'Poisson GLMM + observation-level RE (overdispersion modelled)' : 'Plain Poisson GLMM (overdispersion ignored)';
        return { testName: lbl, statLabel: 'z', statistic: fit.z, df: Infinity, p: fit.p, n: o.y.length, groups: { 'Dose slope (log)': fit.effect }, higher: fit.effect >= 0 ? 'B' : 'A' };
      },
    },

    // ----------------------------------------------------------- forking-paths capstone
    {
      id: 'forking-models', campaign: 'c5', title: 'The Garden of Forking Models',
      rank: 'Tenured, Somehow', design: 'clustered', flaw: 'forking-paths',
      par: 2, seed: 47, predictedHigher: 'B',
      defaultMethod: 'lmm', defaultLmm: 'max', lmm: true, dfTestable: true, defaultDf: 'finite',
      hypothesis: 'Scores increase across sessions — a positive average slope of Time.',
      brief: 'One honest model says nothing. But there is a garden of forking paths, and significance hides at the end of exactly one. No single fork is enough — drop the random slope AND adopt the infinite-df Wald test, and only together do they bloom. Find the path; the arsenal is full of dead ends.',
      build(seed) {
        const rng = makeRNG(seed);
        const obs = [];
        for (let s = 0; s < 9; s++) {
          const b0 = rng.normal(0, 6);
          const b1 = rng.normal(0, 2.4); // by-subject slope variance
          for (let t = 0; t < 5; t++) obs.push({ subject: s, time: t, y: 50 + b0 + (0.55 + b1) * t + rng.normal(0, 3) });
        }
        return { observations: obs };
      },
      evaluate(state, ctx) {
        const o = ctx.obsArrays(state);
        const time = o.get('time');
        const useSlope = state.lmmStructure === 'max';
        const fit = ctx.LMM.fit(o.y, [time], o.subject, { randomSlope: useSlope ? time : null, testCol: 0 });
        const higher = fit.effect >= 0 ? 'B' : 'A';
        const groups = { 'Time slope': fit.effect };
        if (state.dfMethod === 'z') {
          return { testName: 'Mixed model (' + (useSlope ? 'max' : 'RI') + ') — Wald z (df = ∞)', statLabel: 'z', statistic: fit.t, df: Infinity, p: ctx.Stats.normalTwoTailedP(fit.t), n: o.y.length, groups, higher };
        }
        return { testName: 'Mixed model (' + (useSlope ? 'max' : 'RI') + ') — finite df ≈ ' + fit.df, statLabel: 't', statistic: fit.t, df: fit.df, p: fit.p, n: o.y.length, groups, higher };
      },
    },
  ];

  // Campaign 5, like C2/C3, exposes the FULL arsenal on every level: the player must
  // DIAGNOSE the mixed-model flaw and pick the right (wrong) analysis, not click the
  // only button. Generic decoy knobs make every flag-based tool appear; each level's
  // evaluate() honours only its own flag, so non-matching tools are inert. Levels are
  // proven solvable-at-par with the intended option among the winners (levels.verify).
  const ALL_QRP = ['choose-test', 'fit-lmm', 'choose-df', 'fit-glmm', 'add-control', 'median-split', 'set-aggregation', 'spec-multiverse', 'pick-outcome', 'control-covariate', 'explore-subgroups', 'recruit-more', 'robustness-check', 'refine-sample', 'winsorize', 'log-transform'];
  const GENERIC_TESTS = [{ id: 'welch', label: "Welch's t-test (unequal var)" }, { id: 'student', label: "Student's t-test (equal var)" }, { id: 'mann', label: 'Mann-Whitney U (nonparametric)' }];
  const GENERIC_CONTROLS = [{ id: 'covA', label: 'Baseline Covariate' }, { id: 'covB', label: 'Another Covariate' }];
  const GENERIC_SPECS = [{ label: 'Model 1 (no covariates)', controls: [] }, { label: 'Model 2', controls: [] }, { label: 'Model 3', controls: [] }];
  // Levels whose "effect" is a manufactured false positive (no real data-generating effect).
  const FALSE_POSITIVE = { 'pseudo-redux': 1, 'within-between': 1, 'wrong-level': 1 };
  LEVELS.forEach((l) => {
    if (l.lmm === undefined) l.lmm = true;
    if (l.dfTestable === undefined) l.dfTestable = true;
    if (l.glmm === undefined) l.glmm = true;
    if (l.moderator === undefined) l.moderator = 'mod';
    if (l.aggregable === undefined) l.aggregable = true;
    if (l.tests === undefined) l.tests = GENERIC_TESTS;
    if (l.candidateControls === undefined) l.candidateControls = GENERIC_CONTROLS;
    if (l.specs === undefined) l.specs = GENERIC_SPECS;
    l.allowedTools = ALL_QRP;
    l.truth = FALSE_POSITIVE[l.id] ? { exists: false } : { exists: true, higher: 'B' };
  });

  // register onto the shared LEVELS array
  const levelsApi = typeof require !== 'undefined' ? require('./levels') : root.PSPSS_levels;
  LEVELS.forEach((l) => levelsApi.LEVELS.push(l));

  const api = { C5_LEVELS: LEVELS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_levels_c5 = api;
})(typeof self !== 'undefined' ? self : this);
