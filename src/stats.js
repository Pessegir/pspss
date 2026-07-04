/*
 * PSPSS stats engine — genuine (lightweight) statistical tests.
 *
 * This is the load-bearing wall of the game: every puzzle's p-value comes from here.
 * If these are wrong, every level is silently broken. Hence src/stats.test.js.
 *
 * Works in Node (module.exports) and the browser (window.Stats).
 *
 * p-values returned are TWO-TAILED unless noted.
 */
(function (root) {
  'use strict';

  // ---- Special functions ---------------------------------------------------

  // Log-gamma (Lanczos approximation).
  function logGamma(x) {
    const c = [
      76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5,
    ];
    let y = x;
    let tmp = x + 5.5;
    tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) {
      y++;
      ser += c[j] / y;
    }
    return -tmp + Math.log((2.5066282746310005 * ser) / x);
  }

  // Continued fraction for the incomplete beta function (Numerical Recipes).
  function betacf(a, b, x) {
    const MAXIT = 200;
    const EPS = 3e-12;
    const FPMIN = 1e-300;
    const qab = a + b;
    const qap = a + 1;
    const qam = a - 1;
    let c = 1;
    let d = 1 - (qab * x) / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      h *= d * c;
      aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c;
      if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  // Regularized incomplete beta function I_x(a, b).
  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    const bt = Math.exp(
      logGamma(a + b) - logGamma(a) - logGamma(b) +
        a * Math.log(x) + b * Math.log(1 - x)
    );
    if (x < (a + 1) / (a + b + 2)) {
      return (bt * betacf(a, b, x)) / a;
    }
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }

  // Error function (Abramowitz & Stegun 7.1.26).
  function erf(x) {
    const sign = x >= 0 ? 1 : -1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y =
      1 -
      ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
        0.284496736) *
        t +
        0.254829592) *
        t *
        Math.exp(-ax * ax);
    return sign * y;
  }

  // ---- Distribution CDFs ---------------------------------------------------

  function normalCDF(z) {
    return 0.5 * (1 + erf(z / Math.SQRT2));
  }

  // Two-tailed p-value for a t statistic with df degrees of freedom.
  function tDistTwoTailedP(t, df) {
    if (df <= 0) return NaN;
    const x = df / (df + t * t);
    return betai(0.5 * df, 0.5, x);
  }

  // Two-tailed p-value for a standard-normal z statistic. The erf
  // approximation's absolute error (~1e-7) swamps the true tail beyond |z|≈5,
  // eventually returning a literal 0; switch to the asymptotic Mills-ratio
  // expansion there so extreme z's report a real (tiny) p, never 0.
  function normalTwoTailedP(z) {
    const az = Math.abs(z);
    if (az < 5) return 2 * (1 - normalCDF(az));
    const inv2 = 1 / (az * az);
    const tail =
      (Math.exp(-0.5 * az * az) / (az * Math.sqrt(2 * Math.PI))) *
      (1 - inv2 + 3 * inv2 * inv2);
    return Math.max(2 * tail, Number.MIN_VALUE);
  }

  // ---- Descriptives --------------------------------------------------------

  function mean(a) {
    return a.reduce((s, v) => s + v, 0) / a.length;
  }

  // Sample variance (n - 1 denominator).
  function variance(a) {
    const m = mean(a);
    return a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1);
  }

  function sd(a) {
    return Math.sqrt(variance(a));
  }

  function quantile(sorted, q) {
    // `sorted` must already be ascending. Linear interpolation (type 7).
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
  }

  function describe(a) {
    const sorted = [...a].sort((x, y) => x - y);
    const m = mean(a);
    const s = sd(a);
    const skew =
      a.reduce((acc, v) => acc + Math.pow((v - m) / s, 3), 0) / a.length;
    return {
      n: a.length,
      mean: m,
      sd: s,
      min: sorted[0],
      q1: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      q3: quantile(sorted, 0.75),
      max: sorted[sorted.length - 1],
      skew,
    };
  }

  // ---- Tests ---------------------------------------------------------------

  // Independent two-sample t-test.
  //   welch=false -> Student's (pooled variance, assumes equal variances)
  //   welch=true  -> Welch's (does not assume equal variances)
  function tTestIndependent(a, b, welch) {
    const na = a.length;
    const nb = b.length;
    const ma = mean(a);
    const mb = mean(b);
    const va = variance(a);
    const vb = variance(b);
    let t;
    let df;
    if (welch) {
      const sea = va / na;
      const seb = vb / nb;
      t = (ma - mb) / Math.sqrt(sea + seb);
      df =
        Math.pow(sea + seb, 2) /
        (Math.pow(sea, 2) / (na - 1) + Math.pow(seb, 2) / (nb - 1));
    } else {
      const pooled = ((na - 1) * va + (nb - 1) * vb) / (na + nb - 2);
      t = (ma - mb) / Math.sqrt(pooled * (1 / na + 1 / nb));
      df = na + nb - 2;
    }
    return { t, df, p: tDistTwoTailedP(t, df), meanA: ma, meanB: mb };
  }

  // Paired-samples t-test (for repeated-measures designs). a[i] paired with b[i].
  function tTestPaired(a, b) {
    if (a.length !== b.length) throw new Error('paired t-test needs equal lengths');
    const diffs = a.map((v, i) => v - b[i]);
    const n = diffs.length;
    const md = mean(diffs);
    const sdd = sd(diffs);
    const t = md / (sdd / Math.sqrt(n));
    const df = n - 1;
    return { t, df, p: tDistTwoTailedP(t, df), meanDiff: md };
  }

  // Average ranks with ties shared.
  function rankWithTies(values) {
    const indexed = values.map((v, i) => ({ v, i }));
    indexed.sort((p, q) => p.v - q.v);
    const ranks = new Array(values.length);
    let i = 0;
    while (i < indexed.length) {
      let j = i;
      while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j++;
      const avg = (i + j) / 2 + 1; // ranks are 1-based
      for (let k = i; k <= j; k++) ranks[indexed[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  }

  // Mann-Whitney U (independent, nonparametric). Normal approximation with
  // tie correction and continuity correction. Two-tailed.
  function mannWhitneyU(a, b) {
    const na = a.length;
    const nb = b.length;
    const all = a.concat(b);
    const ranks = rankWithTies(all);
    const rankSumA = ranks.slice(0, na).reduce((s, r) => s + r, 0);
    const Ua = rankSumA - (na * (na + 1)) / 2;
    const Ub = na * nb - Ua;
    const U = Math.min(Ua, Ub);
    const muU = (na * nb) / 2;

    // Tie correction term.
    const counts = {};
    all.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
    const N = na + nb;
    let tieSum = 0;
    Object.values(counts).forEach((c) => {
      tieSum += c * c * c - c;
    });
    // The tie correction can drive the variance to 0 (all values identical);
    // guard like wilcoxonSignedRank below so p is 1 instead of NaN.
    const varU = ((na * nb) / 12) * (N + 1 - tieSum / (N * (N - 1)));
    const sigmaU = Math.sqrt(Math.max(0, varU));
    const z = sigmaU > 0 ? (U - muU + 0.5) / sigmaU : 0; // continuity correction toward the mean
    return { U, z, p: sigmaU > 0 ? normalTwoTailedP(z) : 1 };
  }

  // Wilcoxon signed-rank (paired, nonparametric). Normal approximation. Two-tailed.
  function wilcoxonSignedRank(a, b) {
    if (a.length !== b.length) throw new Error('wilcoxon needs equal lengths');
    const diffs = a
      .map((v, i) => v - b[i])
      .filter((d) => d !== 0);
    const n = diffs.length;
    const absRanks = rankWithTies(diffs.map(Math.abs));
    let wPlus = 0;
    let wMinus = 0;
    diffs.forEach((d, i) => {
      if (d > 0) wPlus += absRanks[i];
      else wMinus += absRanks[i];
    });
    const W = Math.min(wPlus, wMinus);
    const muW = (n * (n + 1)) / 4;
    // Tie correction: subtract Σ(tⱼ³ − tⱼ)/48 from the variance for groups of
    // tied absolute differences (the MWU path above already corrects for ties;
    // this keeps the two non-parametric tests consistent).
    const absCounts = {};
    diffs.forEach((d, i) => {
      const key = absRanks[i];
      absCounts[key] = (absCounts[key] || 0) + 1;
    });
    let tieTerm = 0;
    Object.values(absCounts).forEach((c) => {
      if (c > 1) tieTerm += c * c * c - c;
    });
    const varW = (n * (n + 1) * (2 * n + 1)) / 24 - tieTerm / 48;
    const sigmaW = Math.sqrt(Math.max(0, varW));
    const z = sigmaW > 0 ? (W - muW + 0.5) / sigmaW : 0;
    return { W, z, p: sigmaW > 0 ? normalTwoTailedP(z) : 1 };
  }

  // Pearson correlation with t-based two-tailed p-value.
  function pearson(x, y) {
    if (x.length !== y.length) throw new Error('pearson needs equal lengths');
    const n = x.length;
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < n; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    const r = sxy / Math.sqrt(sxx * syy);
    const df = n - 2;
    const t = r * Math.sqrt(df / (1 - r * r));
    return { r, t, df, p: tDistTwoTailedP(t, df) };
  }

  // Ordinary least squares: y ~ 1 + X (X is array of predictor columns).
  // Returns coefficients (intercept first) and the t/p for each slope.
  // Used for simple ANCOVA: predictors = [groupDummy, covariate].
  function ols(y, columns) {
    const n = y.length;
    const k = columns.length;
    // Design matrix with intercept.
    const X = [];
    for (let i = 0; i < n; i++) {
      const row = [1];
      for (let c = 0; c < k; c++) row.push(columns[c][i]);
      X.push(row);
    }
    const p = k + 1;
    // Normal equations: (X'X) beta = X'y. Solve via Gaussian elimination.
    const XtX = matZeros(p, p);
    const Xty = new Array(p).fill(0);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < p; a++) {
        Xty[a] += X[i][a] * y[i];
        for (let b = 0; b < p; b++) XtX[a][b] += X[i][a] * X[i][b];
      }
    }
    const XtXinv = matInverse(XtX);
    const beta = matVec(XtXinv, Xty);
    // Residual variance.
    let sse = 0;
    for (let i = 0; i < n; i++) {
      let yhat = 0;
      for (let a = 0; a < p; a++) yhat += X[i][a] * beta[a];
      sse += (y[i] - yhat) * (y[i] - yhat);
    }
    const dfResid = n - p;
    const mse = sse / dfResid;
    const coefs = beta.map((b, a) => {
      const se = Math.sqrt(mse * XtXinv[a][a]);
      const t = b / se;
      return { coef: b, se, t, p: tDistTwoTailedP(t, dfResid) };
    });
    return { beta, coefs, dfResid };
  }

  // ANCOVA: test the group effect on `y` while controlling for `covariate`.
  // group is a 0/1 array. Returns the adjusted group effect's t and p.
  function ancova(y, group, covariate) {
    const res = ols(y, [group, covariate]);
    const g = res.coefs[1]; // coef[0]=intercept, coef[1]=group, coef[2]=covariate
    return { effect: g.coef, t: g.t, df: res.dfResid, p: g.p };
  }

  // Two-stage least squares (instrumental variables). One endogenous regressor `x`,
  // one or more `instruments`, optional exogenous `controls`. Returns the IV estimate
  // of x's effect with its proper 2SLS standard error (residuals use the ACTUAL x,
  // not the fitted x̂). Just-identified, this equals the Wald ratio cov(z,y)/cov(z,x).
  function tsls(y, x, instruments, controls) {
    instruments = instruments || [];
    controls = controls || [];
    const n = y.length;
    // Stage 1: x on [instruments, controls] -> fitted x̂
    const s1 = ols(x, instruments.concat(controls));
    const xhat = new Array(n);
    for (let i = 0; i < n; i++) {
      let xh = s1.beta[0], col = 1;
      for (const z of instruments) xh += s1.beta[col++] * z[i];
      for (const c of controls) xh += s1.beta[col++] * c[i];
      xhat[i] = xh;
    }
    // Stage 2: y on [x̂, controls] (+intercept)
    const p = 2 + controls.length;
    const Xhat = [];
    for (let i = 0; i < n; i++) {
      const row = [1, xhat[i]];
      for (const c of controls) row.push(c[i]);
      Xhat.push(row);
    }
    const XtX = matZeros(p, p), Xty = new Array(p).fill(0);
    for (let i = 0; i < n; i++) for (let a = 0; a < p; a++) { Xty[a] += Xhat[i][a] * y[i]; for (let b = 0; b < p; b++) XtX[a][b] += Xhat[i][a] * Xhat[i][b]; }
    const XtXinv = matInverse(XtX);
    const beta = matVec(XtXinv, Xty);
    // 2SLS residual variance uses the ACTUAL x (the structural equation), not x̂.
    let sse = 0;
    for (let i = 0; i < n; i++) {
      let yh = beta[0] + beta[1] * x[i], col = 2;
      for (const c of controls) yh += beta[col++] * c[i];
      sse += (y[i] - yh) * (y[i] - yh);
    }
    const dfResid = n - p;
    const sigma2 = sse / dfResid;
    const se = Math.sqrt(Math.max(0, sigma2 * XtXinv[1][1]));
    const t = beta[1] / se;
    // First-stage F for the EXCLUDED instruments (the weak-instrument diagnostic;
    // rule of thumb F < 10 ⇒ weak ⇒ 2SLS is biased and over-confident). Compares
    // the stage-1 fit with instruments against the controls-only restricted fit.
    const firstStageF = (function () {
      const q = instruments.length;
      if (q === 0) return null;
      const rssOf = (cols) => {
        const fit = ols(x, cols);
        let rss = 0;
        for (let i = 0; i < n; i++) {
          let xh = fit.beta[0];
          for (let c = 0; c < cols.length; c++) xh += fit.beta[c + 1] * cols[c][i];
          rss += (x[i] - xh) * (x[i] - xh);
        }
        return rss;
      };
      const rssFull = rssOf(instruments.concat(controls));
      const rssRestr = controls.length ? rssOf(controls) : (function () {
        const mx = x.reduce((s, v) => s + v, 0) / n;
        return x.reduce((s, v) => s + (v - mx) * (v - mx), 0);
      })();
      const kFull = 1 + q + controls.length;
      const dfF = n - kFull;
      if (dfF <= 0 || rssFull <= 0) return null;
      return ((rssRestr - rssFull) / q) / (rssFull / dfF);
    })();
    return { effect: beta[1], se, t, df: dfResid, p: tDistTwoTailedP(t, dfResid), firstStageF };
  }

  // ---- tiny matrix helpers (for ols) --------------------------------------

  function matZeros(r, c) {
    return Array.from({ length: r }, () => new Array(c).fill(0));
  }

  function matVec(M, v) {
    return M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
  }

  function matInverse(A) {
    const n = A.length;
    // Scale-relative singularity threshold: a pivot this small means the
    // design is (numerically) collinear — fail loudly rather than emit NaN/Inf
    // coefficients that would masquerade as a real fit downstream.
    let scale = 0;
    for (const row of A) for (const v of row) scale = Math.max(scale, Math.abs(v));
    const tiny = 1e-12 * Math.max(1, scale);
    const M = A.map((row, i) =>
      row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
    );
    for (let col = 0; col < n; col++) {
      // Partial pivot.
      let pivot = col;
      for (let r = col + 1; r < n; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
      }
      [M[col], M[pivot]] = [M[pivot], M[col]];
      const pv = M[col][col];
      if (!(Math.abs(pv) > tiny)) {
        throw new Error('singular design matrix — model could not be estimated');
      }
      for (let j = 0; j < 2 * n; j++) M[col][j] /= pv;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const factor = M[r][col];
        for (let j = 0; j < 2 * n; j++) M[r][j] -= factor * M[col][j];
      }
    }
    return M.map((row) => row.slice(n));
  }

  // ---- effect size & confidence intervals ---------------------------------

  // Cohen's d for two independent samples (pooled SD).
  function cohenD(a, b) {
    const na = a.length;
    const nb = b.length;
    const va = variance(a);
    const vb = variance(b);
    const pooled = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
    return (mean(b) - mean(a)) / pooled; // positive when b > a
  }

  // Critical t for a two-tailed CI at confidence `conf` (e.g. 0.95), via
  // bisection on the already-trusted tDistTwoTailedP. Returns t such that the
  // two-tailed p == 1 - conf.
  function tCritical(df, conf) {
    const target = 1 - (conf == null ? 0.95 : conf); // tail mass (e.g. 0.05)
    let lo = 0;
    let hi = 1000;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      // tDistTwoTailedP decreases as t increases
      if (tDistTwoTailedP(mid, df) > target) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // 95% (or `conf`) CI for the difference in means (meanB - meanA), Welch SE.
  function meanDiffCI(a, b, conf) {
    const na = a.length;
    const nb = b.length;
    const va = variance(a);
    const vb = variance(b);
    const diff = mean(b) - mean(a);
    const se = Math.sqrt(va / na + vb / nb);
    const df = Math.pow(va / na + vb / nb, 2) /
      (Math.pow(va / na, 2) / (na - 1) + Math.pow(vb / nb, 2) / (nb - 1));
    const tc = tCritical(df, conf);
    return { diff, lo: diff - tc * se, hi: diff + tc * se, se, df };
  }

  // ---- "open science" antidotes (real) ------------------------------------

  // Inverse standard-normal CDF (probit), Acklam's rational approximation.
  function probit(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425;
    let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p <= 1 - pl) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
    q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }

  // A-priori sample size PER GROUP for a two-sample t-test (normal approximation).
  function requiredN(d, alpha, power) {
    alpha = alpha == null ? 0.05 : alpha;
    power = power == null ? 0.8 : power;
    const za = probit(1 - alpha / 2);
    const zb = probit(power);
    return Math.ceil(2 * Math.pow((za + zb) / Math.abs(d), 2));
  }

  // Multiple-comparison adjustment. method: 'bonferroni' | 'bh' (Benjamini-Hochberg FDR).
  function adjustP(pvals, method) {
    const m = pvals.length;
    if (method === 'bonferroni') return pvals.map((p) => Math.min(1, p * m));
    // Benjamini-Hochberg
    const order = pvals.map((p, i) => ({ p, i })).sort((a, b) => a.p - b.p);
    const adj = new Array(m);
    let prev = 1;
    for (let k = m - 1; k >= 0; k--) {
      const val = Math.min(prev, (order[k].p * m) / (k + 1));
      adj[order[k].i] = val;
      prev = val;
    }
    return adj;
  }

  // Two One-Sided Tests for equivalence to ±bound (raw units of the mean diff).
  // Equivalent if BOTH one-sided tests reject at alpha (⇔ the (1-2α) CI ⊂ [-bound, bound]).
  function tost(a, b, bound, alpha) {
    alpha = alpha == null ? 0.05 : alpha;
    const na = a.length, nb = b.length;
    const diff = mean(b) - mean(a);
    const se = Math.sqrt(variance(a) / na + variance(b) / nb);
    const df = Math.pow(variance(a) / na + variance(b) / nb, 2) /
      (Math.pow(variance(a) / na, 2) / (na - 1) + Math.pow(variance(b) / nb, 2) / (nb - 1));
    // one-sided p that the statistic lies in the rejecting tail (dir = +1 upper, -1 lower)
    const oneSided = (t, dir) => { const half = tDistTwoTailedP(Math.abs(t), df) / 2; return dir * t > 0 ? half : 1 - half; };
    const tUpper = (diff + bound) / se; // H0: diff <= -bound  -> reject if t large positive
    const tLower = (diff - bound) / se; // H0: diff >= +bound  -> reject if t large negative
    const p1 = oneSided(tUpper, +1); // evidence diff > -bound
    const p2 = oneSided(tLower, -1); // evidence diff < +bound
    const equivalent = p1 < alpha && p2 < alpha;
    return { diff, bound, p1, p2, equivalent, df };
  }

  const Stats = {
    // special functions / cdfs (exported for testing)
    logGamma,
    betai,
    erf,
    normalCDF,
    tDistTwoTailedP,
    normalTwoTailedP,
    // descriptives
    mean,
    variance,
    sd,
    quantile,
    describe,
    // tests
    tTestIndependent,
    tTestPaired,
    mannWhitneyU,
    wilcoxonSignedRank,
    pearson,
    ols,
    ancova,
    tsls,
    // effect size & CIs
    cohenD,
    tCritical,
    meanDiffCI,
    // open-science antidotes
    probit,
    requiredN,
    adjustP,
    tost,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Stats;
  } else {
    root.Stats = Stats;
  }
})(typeof self !== 'undefined' ? self : this);
