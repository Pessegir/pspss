/*
 * Game engine: derives the live analysis from a working copy of a level's data,
 * applies QRP "tools", tracks moves / suspicion, and decides win / lose /
 * retraction. The real maths lives in stats.js; this just orchestrates.
 */
(function (root) {
  'use strict';

  const Stats = typeof require !== 'undefined' ? require('./stats') : root.Stats;
  const LMM = typeof require !== 'undefined' ? require('./lmm') : root.PSPSS_lmm;
  const GLMM = typeof require !== 'undefined' ? require('./glmm') : root.PSPSS_glmm;
  const Bayes = typeof require !== 'undefined' ? require('./bayes') : root.PSPSS_bayes;
  const RNGmod = typeof require !== 'undefined' ? require('./rng') : root.PSPSS_rng;

  // Context handed to a level's custom evaluate(state, ctx) — keeps each puzzle's
  // statistical logic self-contained while reusing the real engines.
  const CTX = { Stats, LMM, GLMM, Bayes, getArrays, obsArrays };

  // --- state ----------------------------------------------------------------

  function newState(level, seed, mode) {
    const effectiveSeed =
      seed !== undefined ? seed : level.seed !== undefined ? level.seed : hashId(level.id);
    const data = level.build(effectiveSeed);
    const participants = (data.participants || []).map(clone);
    const isClustered = level.design === 'clustered';
    return {
      level,
      seed: effectiveSeed,
      // Event rolls (fabrication retraction) draw from their own seeded stream —
      // decorrelated from the data stream — so a pipeline replays identically.
      eventRng: RNGmod.RNG((effectiveSeed ^ 0x9e3779b9) >>> 0),
      mode: mode || 'tenure', // 'tenure' (default) | 'pure'
      design: level.design,
      paradigm: level.paradigm || 'frequentist',
      participants,
      observations: (data.observations || []).map(clone), // long format (clustered levels)
      reserve: (data.reserve || []).map(clone),
      activeDV: level.design === 'repeated' || isClustered ? null : 'primary',
      originalDV: 'primary',
      testType: 'parametric', // | 'nonparametric'  (C1 levels)
      controlCovariate: false,
      subgroupFilter: null, // a value of the subgroup factor, or null
      predictedHigher: level.predictedHigher,
      hasCovariate: !!level.hasCovariate,
      subgroupFactor: level.subgroupFactor || null,
      dvNames: level.design === 'repeated' || isClustered ? [] : Object.keys(data.participants[0].vals),
      // --- Campaign 2 generic flags (read by a level's evaluate()) ---
      method: level.defaultMethod || null, // chosen analysis method (choose-test / fit-lmm)
      lmmStructure: level.defaultLmm || 'ri', // 'ri' | 'max'
      medianSplit: false,
      controlVar: null, // a candidate covariate id (add-control)
      aggregated: false, // analyze at aggregated level (set-aggregation)
      specIndex: null, // chosen specification (spec-multiverse)
      // --- Campaign 3 (Bayesian) flags ---
      priorScale: level.defaultPrior || 0.707, // Cauchy width r
      oneSided: false,
      reportBF01: false,
      // --- Campaign 4 (Open Science) flags ---
      preregistered: false,
      powerN: null, // required N per group, once power-analysis is run
      adequatePower: false, // collected to the pre-planned N
      corrected: null, // 'bonferroni' | 'bh'
      tostResult: null, // equivalence-test result
      multivReported: false, // honest specification-curve report
      // --- Campaign 5 (mixed-model masterclass) flags ---
      dfMethod: level.defaultDf || 'finite', // 'finite' (Satterthwaite/BW) | 'z' (naive Wald)
      glmmFamily: level.defaultFamily || 'gaussian', // 'gaussian' | 'binomial' | 'poisson'
      glmmOLRE: level.defaultOLRE || false, // observation-level random effect (overdispersion)
      // --- Campaign 6 (causal inference) flags ---
      reportCoef: level.defaultCoef || null, // which predictor's coefficient to report (Table 2 fallacy)
      instrument: null, // chosen instrumental variable id (use-instrument -> 2SLS)
      moves: 0,
      suspicion: 0,
      log: [],
      finished: null, // 'win' | 'retract' | 'honest'
    };
  }

  // Long-format helpers for clustered levels.
  function obsArrays(state) {
    const obs = state.observations;
    return {
      y: obs.map((o) => o.y),
      group: obs.map((o) => (o.group === 'B' ? 1 : o.group === 'A' ? 0 : o.group)),
      subject: obs.map((o) => o.subject),
      get(field) { return obs.map((o) => o[field]); },
    };
  }

  function clone(p) {
    return JSON.parse(JSON.stringify(p));
  }

  function hashId(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  // --- deriving arrays from the working data --------------------------------

  function passesFilter(state, p) {
    if (!state.subgroupFilter || state.design === 'repeated') return true;
    return p.sub === state.subgroupFilter;
  }

  function getArrays(state) {
    if (state.design === 'repeated') {
      const pre = state.participants.map((p) => p.pre);
      const post = state.participants.map((p) => p.post);
      return { pre, post };
    }
    const dv = state.activeDV || 'primary';
    const A = [];
    const B = [];
    const covA = [];
    const covB = [];
    for (const p of state.participants) {
      if (!passesFilter(state, p)) continue;
      if (p.group === 'A') {
        A.push(p.vals[dv]);
        covA.push(p.cov);
      } else {
        B.push(p.vals[dv]);
        covB.push(p.cov);
      }
    }
    return { A, B, covA, covB };
  }

  // --- the live analysis ----------------------------------------------------

  // Wraps a raw test result into the paradigm-agnostic shape the UI consumes.
  // raw must provide: testName, statLabel, statistic, df, n, groups, higher, and
  // either p (frequentist) or bf (Bayesian, metricKind:'bf').
  function finalize(state, raw) {
    const isBF = raw.metricKind === 'bf' || (raw.metricKind == null && raw.bf !== undefined);
    const value = isBF ? raw.bf : raw.p;
    const dflt = isBF ? 3 : 0.05;
    const thr = state.level.winThreshold != null ? state.level.winThreshold : dflt;
    const label = raw.metricLabel || (isBF ? 'BF₁₀' : 'p');
    const crossed = isBF ? value > thr : value < thr;
    const dirOK = raw.higher === state.predictedHigher;
    // Effect size + 95% CI: provided directly, else derived from raw aArr/bArr
    // (the standardized group difference). Teaches "significant ≠ important".
    let effect = raw.effect;
    let ci = raw.ci;
    if (effect === undefined && raw.aArr && raw.bArr && raw.aArr.length > 1 && raw.bArr.length > 1) {
      effect = Stats.cohenD(raw.aArr, raw.bArr);
      ci = Stats.meanDiffCI(raw.aArr, raw.bArr);
    }
    // Campaign 4 "Open Science" levels decide the win by a defensible-conclusion
    // predicate (decisionWin), not by crossing the metric threshold.
    const out = Object.assign({}, raw, {
      metricKind: isBF ? 'bf' : 'p',
      metricLabel: label,
      metricValue: value,
      goalText: raw.goalText || (isBF ? label + ' > ' + thr : label + ' < ' + thr),
      significant: crossed,
      win: raw.decisionWin !== undefined ? raw.decisionWin : crossed && dirOK,
      effect,
      ci,
    });
    delete out.aArr;
    delete out.bArr;
    return out;
  }

  function analyze(state) {
    // Campaign 2/3 levels carry their own honest statistical logic.
    if (typeof state.level.evaluate === 'function') {
      return finalize(state, state.level.evaluate(state, CTX));
    }

    if (state.design === 'repeated') {
      const { pre, post } = getArrays(state);
      const res =
        state.testType === 'nonparametric'
          ? Stats.wilcoxonSignedRank(post, pre)
          : Stats.tTestPaired(post, pre);
      const mPre = Stats.mean(pre);
      const mPost = Stats.mean(post);
      // paired effect (d_z) + CI on the mean change
      const diffs = post.map((v, i) => v - pre[i]);
      const sdd = Stats.sd(diffs);
      const md = Stats.mean(diffs);
      const tc = Stats.tCritical(diffs.length - 1, 0.95);
      const se = sdd / Math.sqrt(diffs.length);
      return finalize(state, {
        testName: state.testType === 'nonparametric' ? 'Wilcoxon signed-rank' : 'Paired t-test',
        statLabel: state.testType === 'nonparametric' ? 'W' : 't',
        statistic: res.W !== undefined ? res.W : res.t,
        df: res.df,
        p: res.p,
        n: pre.length * 2,
        groups: { pre: mPre, post: mPost },
        higher: mPost >= mPre ? 'post' : 'pre',
        effect: md / sdd,
        ci: { diff: md, lo: md - tc * se, hi: md + tc * se },
      });
    }

    const { A, B, covA, covB } = getArrays(state);
    let res, testName, statLabel, statistic, df;
    const mA = Stats.mean(A);
    const mB = Stats.mean(B);
    let higher = mB >= mA ? 'B' : 'A';

    if (state.controlCovariate) {
      const y = A.concat(B);
      const cov = covA.concat(covB);
      const group = A.map(() => 0).concat(B.map(() => 1)); // B = 1
      res = Stats.ancova(y, group, cov);
      testName = 'ANCOVA (covariate-adjusted)';
      statLabel = 't';
      statistic = res.t;
      df = res.df;
      higher = res.effect >= 0 ? 'B' : 'A'; // direction from the ADJUSTED effect
    } else if (state.testType === 'nonparametric') {
      res = Stats.mannWhitneyU(A, B);
      testName = 'Mann-Whitney U';
      statLabel = 'U';
      statistic = res.U;
      df = null;
    } else {
      res = Stats.tTestIndependent(A, B, false);
      testName = 'Independent t-test';
      statLabel = 't';
      statistic = res.t;
      df = res.df;
    }

    return finalize(state, {
      testName, statLabel, statistic, df, p: res.p,
      n: A.length + B.length, groups: { A: mA, B: mB }, higher,
      aArr: A, bArr: B,
    });
  }

  // --- helpers used by tools ------------------------------------------------

  function zClip(state, arr, getter, setter, threshold) {
    const m = Stats.mean(arr.map(getter));
    const s = Stats.sd(arr.map(getter));
    let removed = 0;
    const kept = arr.filter((item) => {
      const ok = Math.abs((getter(item) - m) / s) <= threshold;
      if (!ok) removed++;
      return ok;
    });
    return { kept, removed };
  }

  function dvValuesByGroup(state, dv, group) {
    return state.participants
      .filter((p) => p.group === group && passesFilter(state, p))
      .map((p) => p.vals[dv]);
  }

  // --- figure data extraction (used by the chart diagnostics) ---------------

  function mainOutcome(state) {
    if (state.design === 'clustered') return state.observations.map((o) => o.y);
    if (state.design === 'repeated') return getArrays(state).post;
    const { A, B } = getArrays(state);
    return A.concat(B);
  }

  function boxGroups(state) {
    if (state.design === 'clustered') {
      if (!state.observations.length || state.observations[0].group === undefined) return null;
      const A = state.observations.filter((o) => o.group === 'A').map((o) => o.y);
      const B = state.observations.filter((o) => o.group === 'B').map((o) => o.y);
      return [{ label: 'A', values: A }, { label: 'B', values: B }];
    }
    if (state.design === 'between') {
      const { A, B } = getArrays(state);
      return [{ label: 'A', values: A }, { label: 'B', values: B }];
    }
    return null;
  }

  function scatterXY(state) {
    if (state.design === 'clustered' && state.observations.length && state.observations[0].x !== undefined) {
      return { xs: state.observations.map((o) => o.x), ys: state.observations.map((o) => o.y), xlabel: 'x', ylabel: 'y', title: 'Outcome × predictor' };
    }
    if (state.design === 'between') {
      const rows = state.participants;
      const ys = rows.map((p) => p.vals[state.activeDV || 'primary']);
      if (state.level.moderator) return { xs: rows.map((p) => p[state.level.moderator]), ys, xlabel: 'moderator', ylabel: 'outcome', title: 'Outcome × moderator' };
      if (state.hasCovariate) return { xs: rows.map((p) => p.cov), ys, xlabel: state.level.covariateLabel || 'covariate', ylabel: 'outcome', title: 'Outcome × covariate' };
      if (state.level.candidateControls && state.level.candidateControls.length) {
        const cid = state.level.candidateControls[0].id;
        return { xs: rows.map((p) => p[cid]), ys, xlabel: state.level.candidateControls[0].label, ylabel: 'outcome', title: 'Outcome × candidate covariate' };
      }
    }
    return null;
  }

  function spaghetti(state) {
    if (state.design === 'clustered' && state.observations.length && state.observations[0].time !== undefined) {
      const ids = [];
      const byId = {};
      state.observations.forEach((o) => { if (!byId[o.subject]) { byId[o.subject] = { x: [], y: [] }; ids.push(o.subject); } byId[o.subject].x.push(o.time); byId[o.subject].y.push(o.y); });
      return ids.map((id) => byId[id]);
    }
    if (state.design === 'repeated') return state.participants.map((p) => ({ x: [0, 1], y: [p.pre, p.post] }));
    return null;
  }

  // --- the QRP tool registry ------------------------------------------------
  // Each tool: { id, label, kind:'diagnostic'|'intervention', menu, suspicion,
  //              enabled(state), run(state, payload) -> { message, free? } }

  const TOOLS = [
    // ---- diagnostics (free, never a "move") ----
    {
      id: 'descriptives',
      label: 'Descriptive Statistics…',
      kind: 'diagnostic',
      menu: 'Analyze',
      enabled: () => true,
      run(state) {
        if (state.design === 'repeated') {
          const { pre, post } = getArrays(state);
          return {
            message: `Descriptives — Before: M=${f(Stats.mean(pre))}, SD=${f(Stats.sd(pre))}; After: M=${f(Stats.mean(post))}, SD=${f(Stats.sd(post))}`,
          };
        }
        const { A, B } = getArrays(state);
        return {
          message: `Descriptives — A: M=${f(Stats.mean(A))}, SD=${f(Stats.sd(A))}, n=${A.length}; B: M=${f(Stats.mean(B))}, SD=${f(Stats.sd(B))}, n=${B.length}`,
        };
      },
    },
    {
      id: 'check-outliers',
      label: 'Boxplot / Outlier Scan',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => s.design === 'between',
      run(state) {
        const { A, B } = getArrays(state);
        const worst = (arr, name) => {
          const m = Stats.mean(arr);
          const s = Stats.sd(arr);
          let max = 0;
          let val = null;
          arr.forEach((v) => {
            const z = Math.abs((v - m) / s);
            if (z > max) {
              max = z;
              val = v;
            }
          });
          return `${name}: most extreme = ${f(val)} (z=${f(max)})`;
        };
        return { message: `Outlier scan — ${worst(A, 'A')}; ${worst(B, 'B')}` };
      },
    },
    {
      id: 'check-normality',
      label: 'Distribution / Normality Check',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: () => true,
      run(state) {
        if (state.design === 'repeated') {
          const { pre, post } = getArrays(state);
          return { message: `Skew — Before: ${f(Stats.describe(pre).skew)}, After: ${f(Stats.describe(post).skew)}` };
        }
        const { A, B } = getArrays(state);
        return { message: `Skew — A: ${f(Stats.describe(A).skew)}, B: ${f(Stats.describe(B).skew)} (|skew|>1 = lumpy)` };
      },
    },
    {
      id: 'check-covariate',
      label: 'Scatter: Outcome × Covariate',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => s.hasCovariate,
      run(state) {
        const { A, B, covA, covB } = getArrays(state);
        const r = Stats.pearson(A.concat(B), covA.concat(covB)).r;
        return { message: `Covariate correlation with outcome: r=${f(r)}. (Suspiciously strong, isn't it.)` };
      },
    },
    {
      id: 'check-subgroups',
      label: 'Split File by Subgroup',
      kind: 'diagnostic',
      menu: 'Data',
      enabled: (s) => !!s.subgroupFactor,
      run(state) {
        const factor = state.subgroupFactor;
        const lines = factor.levels.map((lv) => {
          const a = state.participants.filter((p) => p.group === 'A' && p.sub === lv).map((p) => p.vals.primary);
          const b = state.participants.filter((p) => p.group === 'B' && p.sub === lv).map((p) => p.vals.primary);
          const pp = a.length > 1 && b.length > 1 ? f(Stats.tTestIndependent(a, b, false).p) : 'n/a';
          return `${lv}: A=${f(Stats.mean(a))} B=${f(Stats.mean(b))} (p=${pp})`;
        });
        return { message: `By ${factor.label} — ${lines.join('  |  ')}` };
      },
    },
    {
      id: 'peek-all-dvs',
      label: 'Run All Outcomes (exploratory)',
      kind: 'diagnostic',
      menu: 'Analyze',
      enabled: (s) => s.dvNames.length > 1,
      run(state) {
        const lines = state.dvNames.map((dv) => {
          const a = dvValuesByGroup(state, dv, 'A');
          const b = dvValuesByGroup(state, dv, 'B');
          const p = Stats.tTestIndependent(a, b, false).p;
          const star = p < 0.05 ? ' *' : '';
          return `${state.level.dvLabels[dv]}: p=${f(p)}${star}`;
        });
        return { message: `All outcomes — ${lines.join('  |  ')}` };
      },
    },

    // ---- figure diagnostics (free; return a chart descriptor for the UI) ----
    {
      id: 'plot-distribution',
      label: 'Histogram of Outcome',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: () => true,
      run(state) {
        return { message: 'Histogram rendered.', chart: { fn: 'histogram', args: [mainOutcome(state), { title: 'Distribution of outcome', xlabel: 'value' }] } };
      },
    },
    {
      id: 'plot-by-group',
      label: 'Boxplot by Group',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => !!boxGroups(s),
      run(state) {
        return { message: 'Boxplot rendered.', chart: { fn: 'boxplotByGroup', args: [boxGroups(state), { title: 'Outcome by group', ylabel: 'value' }] } };
      },
    },
    {
      id: 'plot-scatter',
      label: 'Scatterplot (outcome × covariate)',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => !!scatterXY(s),
      run(state) {
        const xy = scatterXY(state);
        return { message: 'Scatterplot rendered.', chart: { fn: 'scatter', args: [xy.xs, xy.ys, { title: xy.title, xlabel: xy.xlabel, ylabel: xy.ylabel }] } };
      },
    },
    {
      id: 'plot-spaghetti',
      label: 'Per-subject Trajectories',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => !!spaghetti(s),
      run(state) {
        return { message: 'Spaghetti plot rendered.', chart: { fn: 'spaghetti', args: [spaghetti(state), { title: 'Per-subject trajectories', xlabel: 'time', ylabel: 'value' }] } };
      },
    },
    {
      id: 'plot-random-effects',
      label: 'Random-Effects Caterpillar',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => s.design === 'clustered' && Array.isArray(s.observations) && s.observations.length > 0,
      run(state) {
        const o = obsArrays(state);
        const fit = LMM.fit(o.y, [], o.subject); // intercept-only random intercept
        const pts = (fit.blups || []).map((b) => ({ est: b.est, err: b.err }));
        const icc = fit.icc != null ? fit.icc.toFixed(2) : '—';
        return {
          message: `Random-effects caterpillar rendered. Each cluster's estimate is shrunk toward 0 (partial pooling); an ICC of ≈ ${icc} of the variance sits between clusters — which is exactly why the rows aren't independent.`,
          chart: { fn: 'caterpillar', args: [pts, { title: 'Cluster random intercepts (BLUP ± SD)', xlabel: 'cluster (sorted)' }] },
        };
      },
    },
    {
      id: 'plot-dag',
      label: 'Show the Causal DAG',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => !!s.level.dag,
      run(state) {
        const d = state.level.dag;
        const highlight = state.controlVar ? [state.controlVar] : [];
        return {
          message: 'Causal diagram rendered. Arrows are assumed causes; a node with two arrows into it is a collider — box it (condition on it) and a non-causal path opens.',
          chart: { fn: 'dag', args: [d.nodes, d.edges, { title: d.title || 'Causal DAG', highlight }] },
        };
      },
    },
    {
      id: 'plot-bf-robustness',
      label: 'Bayes-Factor Robustness Curve',
      kind: 'diagnostic',
      menu: 'Graphs',
      enabled: (s) => s.paradigm === 'bayesian',
      run(state) {
        const grid = [0.2, 0.3, 0.4, 0.5, 0.707, 1, 1.414, 2];
        const prev = state.priorScale;
        const ys = grid.map((r) => { state.priorScale = r; return analyze(state).metricValue; });
        state.priorScale = prev;
        return { message: 'BF vs prior width rendered. Note which width flatters you most.', chart: { fn: 'line', args: [grid, ys, { title: 'BF by prior width (the "robustness" buffet)', xlabel: 'Cauchy prior width r', ylabel: 'BF', rule: 3 }] } };
      },
    },

    // ---- interventions (cost a move) ----
    {
      id: 'refine-sample',
      label: 'Refine Sample (exclude anomalies)',
      kind: 'intervention',
      menu: 'Data',
      suspicion: 15,
      enabled: () => true,
      run(state) {
        let removed = 0;
        if (state.design === 'repeated') {
          const r = zClip(state, state.participants, (p) => p.post - p.pre, null, 2.5);
          removed = r.removed;
          state.participants = r.kept;
        } else {
          ['A', 'B'].forEach((g) => {
            const grp = state.participants.filter((p) => p.group === g);
            const r = zClip(state, grp, (p) => p.vals[state.activeDV], null, 2.5);
            removed += r.removed;
          });
          const m = {};
          ['A', 'B'].forEach((g) => {
            const grp = state.participants.filter((p) => p.group === g);
            const dv = state.activeDV;
            const mean = Stats.mean(grp.map((p) => p.vals[dv]));
            const sd = Stats.sd(grp.map((p) => p.vals[dv]));
            grp.forEach((p) => (m[id(p)] = Math.abs((p.vals[dv] - mean) / sd) <= 2.5));
          });
          state.participants = state.participants.filter((p) => m[id(p)]);
        }
        return { message: `Excluded ${removed} "anomalous" participant(s). They were probably tired.` };
      },
    },
    {
      id: 'winsorize',
      label: 'Winsorize (tame the extremes)',
      kind: 'intervention',
      menu: 'Transform',
      suspicion: 12,
      enabled: (s) => s.design === 'between',
      run(state) {
        ['A', 'B'].forEach((g) => {
          const grp = state.participants.filter((p) => p.group === g);
          const dv = state.activeDV;
          const sorted = grp.map((p) => p.vals[dv]).sort((x, y) => x - y);
          const lo = Stats.quantile(sorted, 0.05);
          const hi = Stats.quantile(sorted, 0.95);
          grp.forEach((p) => {
            p.vals[dv] = Math.min(hi, Math.max(lo, p.vals[dv]));
          });
        });
        return { message: 'Extreme values gently clamped to the 5th/95th percentile. Shhh.' };
      },
    },
    {
      id: 'log-transform',
      label: 'Normalize (log transform)',
      kind: 'intervention',
      menu: 'Transform',
      suspicion: 8,
      enabled(state) {
        const arrs = getArrays(state);
        const all = state.design === 'repeated' ? arrs.pre.concat(arrs.post) : arrs.A.concat(arrs.B);
        return all.every((v) => v > 0);
      },
      run(state) {
        if (state.design === 'repeated') {
          state.participants.forEach((p) => {
            p.pre = Math.log10(p.pre);
            p.post = Math.log10(p.post);
          });
        } else {
          state.participants.forEach((p) => {
            const dv = state.activeDV;
            p.vals[dv] = Math.log10(p.vals[dv]);
          });
        }
        return { message: 'Reality reshaped onto a log scale until it agreed to be bell-shaped.' };
      },
    },
    {
      id: 'robustness-check',
      label: 'Robustness Check (switch test)',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 10,
      enabled: () => true,
      run(state) {
        state.testType = state.testType === 'parametric' ? 'nonparametric' : 'parametric';
        const name = state.testType === 'nonparametric' ? 'a non-parametric rank test' : 'the parametric test';
        return { message: `Switched to ${name}. For rigour. Obviously.` };
      },
    },
    {
      id: 'control-covariate',
      label: 'Control for Confounds (ANCOVA)',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 6,
      enabled: (s) => s.hasCovariate && s.design === 'between',
      run(state) {
        state.controlCovariate = !state.controlCovariate;
        return {
          message: state.controlCovariate
            ? 'Added the covariate to the model. The confound was the friend we adjusted away.'
            : 'Removed the covariate.',
        };
      },
    },
    {
      id: 'explore-subgroups',
      label: 'Explore Subgroups (restrict sample)',
      kind: 'intervention',
      menu: 'Data',
      suspicion: 18,
      enabled: (s) => !!s.subgroupFactor && !s.subgroupFilter,
      run(state) {
        // The p-hacker move: pick whichever subgroup gives the best result.
        let best = null;
        let bestP = Infinity;
        state.subgroupFactor.levels.forEach((lv) => {
          state.subgroupFilter = lv;
          const r = analyze(state);
          if (r.higher === state.predictedHigher && r.p < bestP) {
            bestP = r.p;
            best = lv;
          }
        });
        state.subgroupFilter = best || state.subgroupFactor.levels[0];
        return { message: `Restricted analysis to the "${state.subgroupFilter}" subgroup. We always meant to.` };
      },
    },
    {
      id: 'pick-outcome',
      label: 'Pick Primary Outcome…',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 14,
      needsChoice: 'dv',
      enabled: (s) => s.dvNames.length > 1,
      run(state, payload) {
        const dv = payload && payload.dv ? payload.dv : state.activeDV;
        if (dv === state.activeDV) return { message: 'Outcome unchanged.', free: true };
        state.activeDV = dv;
        return { message: `Designated "${state.level.dvLabels[dv]}" as the primary outcome. It was always the point.` };
      },
    },
    {
      id: 'recruit-more',
      label: 'Recruit More Participants',
      kind: 'intervention',
      menu: 'Data',
      suspicion: 20,
      enabled: (s) => s.reserve && s.reserve.length > 0,
      run(state) {
        const n = state.reserve.length;
        state.participants = state.participants.concat(state.reserve);
        state.reserve = [];
        return { message: `Collected ${n} more participants and re-ran the test. Just peeking. Again.` };
      },
    },
    {
      id: 'reframe',
      label: 'Reframe Hypothesis (HARK)',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 16,
      universal: true,
      enabled: () => true,
      run(state) {
        if (state.design === 'repeated') {
          state.predictedHigher = state.predictedHigher === 'post' ? 'pre' : 'post';
        } else {
          state.predictedHigher = state.predictedHigher === 'B' ? 'A' : 'B';
        }
        return { message: 'Hypothesis updated to match the data. You predicted this all along.' };
      },
    },
    {
      id: 'fabricate',
      label: '⚠ Fabricate Data Points',
      kind: 'intervention',
      menu: 'Transform',
      suspicion: 45,
      danger: true,
      universal: true,
      enabled: () => true,
      run(state) {
        // Add fabricated points favouring the predicted direction.
        if (state.design === 'repeated') {
          for (let i = 0; i < 3; i++) {
            const pre = 50;
            state.participants.push({ pre, post: pre + (state.predictedHigher === 'post' ? 18 : -18), _fab: true });
          }
        } else {
          // Push the predicted-higher group up with three enthusiastic "participants".
          const boostGroup = state.predictedHigher; // 'A' or 'B'
          const sub = state.subgroupFilter || (state.subgroupFactor ? state.subgroupFactor.levels[0] : null);
          for (let i = 0; i < 3; i++) {
            const p = { group: boostGroup, vals: {}, cov: 5, sub, _fab: true };
            state.dvNames.forEach((dv) => (p.vals[dv] = 85));
            state.participants.push(p);
          }
        }
        return { message: '🎲 Three "participants" who strongly agree with you have been added. Integrity flag raised.' };
      },
    },

    // ====================== Campaign 2 tools ======================
    // These set generic flags on the state; each level's evaluate() reads them.
    {
      id: 'choose-test',
      label: 'Choose Statistical Test…',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 12,
      needsChoice: 'test',
      enabled: (s) => Array.isArray(s.level.tests) && s.level.tests.length > 0,
      run(state, payload) {
        const m = payload && payload.method;
        if (!m || m === state.method) return { message: 'Test unchanged.', free: true };
        state.method = m;
        const lbl = (state.level.tests.find((t) => t.id === m) || {}).label || m;
        return { message: `Switched the analysis to: ${lbl}. For rigour, naturally.` };
      },
    },
    {
      id: 'fit-lmm',
      label: 'Specify Mixed Model…',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 10,
      needsChoice: 'lmm',
      enabled: (s) => !!s.level.lmm,
      run(state, payload) {
        const st = (payload && payload.structure) || 'ri';
        state.method = 'lmm';
        state.lmmStructure = st;
        return { message: st === 'max'
          ? 'Fitted the maximal model: random intercepts AND slopes. The honest one.'
          : 'Fitted a random-intercepts-only model. Slopes? Never heard of them.' };
      },
    },
    {
      id: 'median-split',
      label: 'Median-Split the Moderator',
      kind: 'intervention',
      menu: 'Transform',
      suspicion: 16,
      enabled: (s) => !!s.level.moderator && !s.medianSplit,
      run(state) {
        state.medianSplit = true;
        return { message: 'Carved a perfectly continuous variable into two tidy halves. Two kinds of people now exist.' };
      },
    },
    {
      id: 'add-control',
      label: 'Add a Covariate…',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 12,
      needsChoice: 'control',
      enabled: (s) => Array.isArray(s.level.candidateControls) && s.level.candidateControls.length > 0,
      run(state, payload) {
        const v = payload && payload.var;
        if (v === state.controlVar) return { message: 'Covariate unchanged.', free: true };
        state.controlVar = v || null;
        const lbl = v ? (state.level.candidateControls.find((c) => c.id === v) || {}).label || v : 'none';
        return { message: `Now controlling for: ${lbl}. Surely that one's a confounder.` };
      },
    },
    {
      id: 'set-aggregation',
      label: 'Toggle Aggregation Level',
      kind: 'intervention',
      menu: 'Data',
      suspicion: 14,
      enabled: (s) => !!s.level.aggregable,
      run(state) {
        state.aggregated = !state.aggregated;
        return { message: state.aggregated
          ? 'Aggregated to group level. Zoom out until the inconvenient pattern disappears.'
          : 'Disaggregated to the individual level.' };
      },
    },
    {
      id: 'spec-multiverse',
      label: 'Run Specification Multiverse',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 18,
      enabled: (s) => Array.isArray(s.level.specs) && s.specIndex == null,
      run(state) {
        // Adopt whichever specification gives the best result in the predicted direction.
        let best = 0, bestP = Infinity;
        state.level.specs.forEach((sp, i) => {
          state.specIndex = i;
          const r = analyze(state);
          if (r.higher === state.predictedHigher && r.metricValue < bestP) { bestP = r.metricValue; best = i; }
        });
        state.specIndex = best;
        return { message: `Explored ${state.level.specs.length} specifications and, after careful thought, adopted #${best + 1}.` };
      },
    },

    // ====================== Campaign 3 (Bayesian) tools ======================
    {
      id: 'set-prior',
      label: 'Set Prior Width…',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 12,
      needsChoice: 'prior',
      enabled: (s) => s.paradigm === 'bayesian',
      run(state, payload) {
        const r = payload && payload.r;
        if (r == null || r === state.priorScale) return { message: 'Prior unchanged.', free: true };
        state.priorScale = r;
        return { message: `Set the Cauchy prior width to r = ${r}. A principled choice, arrived at by trying them all.` };
      },
    },
    {
      id: 'one-sided-prior',
      label: 'Use One-Sided Prior',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 14,
      enabled: (s) => s.paradigm === 'bayesian' && !s.oneSided,
      run(state) {
        state.oneSided = true;
        return { message: 'Switched to a directional (half-Cauchy) prior. You always had a one-sided hypothesis. Always.' };
      },
    },
    {
      id: 'collect-more-bayes',
      label: 'Collect More Data (watch the BF)',
      kind: 'intervention',
      menu: 'Data',
      suspicion: 18,
      enabled: (s) => s.paradigm === 'bayesian' && s.reserve && s.reserve.length > 0,
      run(state) {
        const n = state.reserve.length;
        state.participants = state.participants.concat(state.reserve);
        state.reserve = [];
        return { message: `Added ${n} more participants and watched the Bayes factor obligingly climb. Sequential testing: it’s fine when WE do it.` };
      },
    },
    {
      id: 'report-bf01',
      label: 'Report BF₀₁ Instead',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 16,
      enabled: (s) => s.paradigm === 'bayesian' && !s.reportBF01,
      run(state) {
        state.reportBF01 = true;
        return { message: 'Reporting BF₀₁ now. "Strong evidence" sounds the same to a press office regardless of which hypothesis it favours.' };
      },
    },
    {
      id: 'prior-robustness',
      label: 'Prior Robustness Analysis',
      kind: 'intervention',
      menu: 'Analyze',
      suspicion: 18,
      enabled: (s) => s.paradigm === 'bayesian',
      run(state) {
        // Scan a grid of prior widths; adopt whichever maximises the BF.
        const grid = [0.2, 0.3, 0.5, 0.707, 1, 1.414, 2];
        let best = state.priorScale, bestBF = -Infinity;
        const prev = state.priorScale;
        grid.forEach((r) => { state.priorScale = r; const a = analyze(state); if (a.metricValue > bestBF) { bestBF = a.metricValue; best = r; } });
        state.priorScale = best;
        return { message: `Ran a "robustness" check across seven priors and, reassuringly, adopted the most robust one (r = ${best}).` };
      },
    },

    // ====================== Campaign 4 (Open Science) — honest tools ======================
    // These are GOOD practice, so they cost a move but add ZERO suspicion. Each level's
    // evaluate() decides the win from these flags + "no QRP used" (suspicion === 0).
    {
      id: 'preregister',
      label: 'Preregister the Analysis Plan',
      kind: 'intervention', menu: 'Analyze', suspicion: 0,
      enabled: (s) => s.level.objective === 'honest' && !s.preregistered,
      run(state) { state.preregistered = true; return { message: 'Analysis plan timestamped and registered (OSF). You are now accountable to your past self — the honest constraint.' }; },
    },
    {
      id: 'power-analysis',
      label: 'Run an A-Priori Power Analysis',
      kind: 'intervention', menu: 'Analyze', suspicion: 0,
      enabled: (s) => s.level.objective === 'honest' && s.powerN == null,
      run(state) {
        const d = state.level.expectedD || 0.5;
        state.powerN = Stats.requiredN(d, 0.05, 0.8);
        return { message: `For the smallest effect worth detecting (d = ${d}), 80% power at α=.05 needs N ≈ ${state.powerN} per group. Plan the sample BEFORE collecting.` };
      },
    },
    {
      id: 'collect-to-power',
      label: 'Collect the Pre-Planned Sample',
      kind: 'intervention', menu: 'Data', suspicion: 0,
      enabled: (s) => s.level.objective === 'honest' && s.powerN != null && !s.adequatePower && s.reserve && s.reserve.length > 0,
      run(state) {
        const n = state.reserve.length;
        state.participants = state.participants.concat(state.reserve);
        state.reserve = [];
        state.adequatePower = true;
        return { message: `Collected the full pre-registered sample (+${n}) in one go — no peeking, no stopping early. This is how you avoid optional stopping.` };
      },
    },
    {
      id: 'correct-comparisons',
      label: 'Correct for Multiple Comparisons…',
      kind: 'intervention', menu: 'Analyze', suspicion: 0,
      needsChoice: 'correction',
      enabled: (s) => s.level.objective === 'honest' && s.dvNames.length > 1 && !s.corrected,
      run(state, payload) {
        state.corrected = (payload && payload.method) || 'bh';
        return { message: `Adjusted every outcome's p-value for the ${state.dvNames.length} tests you ran (${state.corrected === 'bonferroni' ? 'Bonferroni' : 'Benjamini-Hochberg FDR'}). The honest family-wise picture, not the cherry.` };
      },
    },
    {
      id: 'equivalence-test',
      label: 'Run an Equivalence Test (TOST)',
      kind: 'intervention', menu: 'Analyze', suspicion: 0,
      enabled: (s) => s.level.objective === 'honest' && s.design === 'between' && !s.tostResult,
      run(state) {
        const { A, B } = getArrays(state);
        const bound = state.level.equivBound || (0.5 * Stats.sd(A.concat(B)));
        state.tostResult = Stats.tost(A, B, bound);
        return { message: state.tostResult.equivalent
          ? `TOST: the difference is statistically within ±${bound.toFixed(1)} of zero — you can defensibly conclude PRACTICAL EQUIVALENCE. "Absence of evidence" became "evidence of absence".`
          : `TOST: cannot conclude equivalence within ±${bound.toFixed(1)} — the data are genuinely inconclusive.` };
      },
    },
    {
      id: 'report-multiverse',
      label: 'Report the Full Specification Curve',
      kind: 'intervention', menu: 'Analyze', suspicion: 0,
      enabled: (s) => s.level.objective === 'honest' && Array.isArray(s.level.specs) && !s.multivReported,
      run(state) {
        // count how many specifications are significant; honest summary is the whole picture
        let sig = 0;
        state.level.specs.forEach((sp, i) => { state.specIndex = i; if (analyze(state).significant) sig++; });
        state.specIndex = null;
        state.multivReported = true;
        return { message: `Reported all ${state.level.specs.length} specifications: ${sig} significant. You let the reader see the whole garden of forking paths, not just the prettiest flower.` };
      },
    },

    // ====================== Campaign 5 (mixed-model masterclass) tools ======================
    // QRPs specific to (generalized) linear mixed models. Each sets a generic flag
    // the level's evaluate() reads; honoured only where the level wires that flaw.
    {
      id: 'choose-df',
      label: 'Choose Degrees of Freedom…',
      kind: 'intervention', menu: 'Analyze', suspicion: 12,
      needsChoice: 'df',
      enabled: (s) => !!s.level.dfTestable,
      run(state, payload) {
        const m = (payload && payload.method) || 'finite';
        if (m === state.dfMethod) return { message: 'Degrees of freedom unchanged.', free: true };
        state.dfMethod = m;
        return { message: m === 'z'
          ? 'Switched to the naive Wald z test — infinite degrees of freedom. With this many rows, who needs Satterthwaite?'
          : 'Back to the finite-sample (between-within) df. The honest, smaller number that knows you only have a handful of clusters.' };
      },
    },
    {
      id: 'fit-glmm',
      label: 'Choose the Model Family…',
      kind: 'intervention', menu: 'Analyze', suspicion: 12,
      needsChoice: 'glmm',
      enabled: (s) => !!s.level.glmm,
      run(state, payload) {
        const fam = (payload && payload.family) || 'gaussian';
        state.glmmFamily = fam;
        state.glmmOLRE = !!(payload && payload.olre);
        const labels = {
          gaussian: 'a Gaussian LMM (normal errors)',
          binomial: 'a logistic (binomial) GLMM',
          poisson: 'a Poisson GLMM' + (state.glmmOLRE ? ' with an observation-level random effect' : ''),
        };
        return { message: 'Fitted ' + (labels[fam] || fam) + '.' +
          (fam === 'gaussian' ? ' Normal errors on this outcome — brave.' : state.glmmOLRE ? ' Overdispersion, honestly modelled.' : '') };
      },
    },

    // ====================== Campaign 6 (causal inference) tools ======================
    // QRPs of causal mis-specification. Each sets a flag the level's evaluate() reads.
    {
      id: 'report-coefficient',
      label: 'Report a Coefficient…',
      kind: 'intervention', menu: 'Analyze', suspicion: 14,
      needsChoice: 'coefficient',
      enabled: (s) => Array.isArray(s.level.coefficients) && s.level.coefficients.length > 0,
      run(state, payload) {
        const cid = payload && payload.coef;
        if (cid === state.reportCoef) return { message: 'Reported coefficient unchanged.', free: true };
        state.reportCoef = cid || null;
        const lbl = cid ? (state.level.coefficients.find((c) => c.id === cid) || {}).label || cid : 'the treatment';
        return { message: `Now reporting the coefficient for: ${lbl}. A regression coefficient is a regression coefficient — who's to say which one is "the effect"?` };
      },
    },
    {
      id: 'use-instrument',
      label: 'Use an Instrumental Variable…',
      kind: 'intervention', menu: 'Analyze', suspicion: 14,
      needsChoice: 'instrument',
      enabled: (s) => Array.isArray(s.level.instruments) && s.level.instruments.length > 0,
      run(state, payload) {
        const iid = payload && payload.instrument;
        if (iid === state.instrument) return { message: 'Instrument unchanged.', free: true };
        state.instrument = iid || null;
        const lbl = iid ? (state.level.instruments.find((c) => c.id === iid) || {}).label || iid : 'none (back to OLS)';
        return { message: `Instrumenting with: ${lbl}. Two-stage least squares makes the confounding vanish — assuming the instrument is valid, which we will simply assume.` };
      },
    },
  ];

  function id(p) {
    return JSON.stringify(p);
  }

  // A tool is offered only if enabled, not blocked by the study being over, and —
  // for curated levels — in the level's allowedTools (diagnostics & universal QRPs
  // are always offered).
  function toolEnabled(state, tool) {
    if (state.finished) return false;
    if (!tool.enabled(state)) return false;
    const allow = state.level.allowedTools;
    if (allow && tool.kind === 'intervention' && !tool.universal && allow.indexOf(tool.id) === -1) return false;
    return true;
  }

  function f(x) {
    if (x === null || x === undefined || Number.isNaN(x)) return '—';
    if (!Number.isFinite(x)) return x > 0 ? '∞' : '-∞';
    return Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(2);
  }

  // --- applying a tool ------------------------------------------------------

  function applyTool(state, toolId, payload) {
    if (state.finished) return { error: 'The study is over.' };
    const tool = TOOLS.find((t) => t.id === toolId);
    if (!tool) return { error: 'Unknown tool.' };
    if (!toolEnabled(state, tool)) return { error: 'That option is greyed out right now.' };

    const result = tool.run(state, payload) || {};
    const isMove = tool.kind === 'intervention' && !result.free;
    if (isMove) {
      state.moves += 1;
      state.suspicion = Math.min(100, state.suspicion + (tool.suspicion || 0));
    }

    state.log.push({
      kind: tool.kind,
      danger: tool.danger,
      text: result.message || tool.label,
      move: isMove,
      chart: result.chart || null,
      toolId: tool.id,
      payload: payload || null, // kept so the pipeline can be replayed (stress-test)
    });

    // Fabrication can get you caught immediately.
    if (toolId === 'fabricate') {
      const risk = Math.min(0.92, state.suspicion / 100);
      if (state.eventRng.next() < risk) {
        state.finished = 'retract';
        return { state, analysis: analyze(state), event: 'retract' };
      }
    }

    const analysis = analyze(state);
    if (analysis.win) state.finished = 'win';
    return { state, analysis, event: state.finished };
  }

  function reportNull(state) {
    state.finished = 'honest';
    state.log.push({ kind: 'intervention', text: 'You reported the null result honestly. A hush falls over the field.', move: false });
    return { state, analysis: analyze(state), event: 'honest' };
  }

  // --- replication stress-test ----------------------------------------------
  // Replays a recorded pipeline (the player's exact intervention sequence) across
  // `nReps` FRESH samples from the same data-generating process and reports how
  // often that pipeline "wins". This is the only view in the game that shows a
  // QRP's true cost: a false-positive *rate*, not a single rigged draw. For a
  // manufactured-null level the honest pipeline sits near α; a QRP pipeline runs
  // hotter. `actions` = [{toolId, payload}] (payload optional).
  function simulateReplications(level, actions, opts) {
    opts = opts || {};
    const nReps = opts.nReps || 200;
    const mode = opts.mode || 'tenure';
    // Walk a fresh seed range well away from the level's pinned (rigged) seed so
    // we sample the generator honestly. A prime stride decorrelates the streams.
    const base = opts.baseSeed != null ? opts.baseSeed : ((level.seed || 1) + 500000);
    const step = opts.step || 7919;
    const pvals = [];
    let sig = 0, wins = 0, errors = 0;
    for (let i = 0; i < nReps; i++) {
      const seed = (base + i * step) >>> 0;
      try {
        const st = newState(level, seed, mode);
        for (const a of actions || []) {
          st.finished = null; // replay the whole pipeline even past an early win
          applyTool(st, a.toolId, a.payload);
        }
        st.finished = null;
        const an = analyze(st);
        if (an.metricKind === 'p' && Number.isFinite(an.metricValue)) pvals.push(an.metricValue);
        if (an.significant) sig++;
        if (an.win) wins++;
      } catch (e) {
        errors++;
      }
    }
    const n = nReps - errors;
    return {
      n, nReps, errors,
      sigRate: n ? sig / n : 0, // significant in either direction
      winRate: n ? wins / n : 0, // significant AND in the predicted direction
      pvals,
      truth: level.truth || null,
    };
  }

  function stars(state) {
    const par = state.level.par;
    let s;
    if (state.moves <= par) s = 3;
    else if (state.moves <= par + 1) s = 2;
    else s = 1;
    const clean = state.suspicion <= 20;
    return { stars: s, clean };
  }

  const api = { newState, analyze, applyTool, reportNull, getArrays, obsArrays, stars, TOOLS, toolEnabled, finalize, simulateReplications };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PSPSS_engine = api;
  }
})(typeof self !== 'undefined' ? self : this);
