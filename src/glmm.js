/*
 * PSPSS generalized linear mixed model engine — a genuine Laplace-approximation GLMM.
 *
 * Supports the binomial (logit) and Poisson (log) families with one or more scalar
 * random-intercept grouping factors. The second factor is typically an
 * observation-level random effect (OLRE) used to model overdispersion. Fixed-effect
 * inference uses the Wald z statistic. Variance components are estimated by
 * minimising the Laplace-approximated deviance with the LMM module's Nelder-Mead.
 *
 * This is Campaign 5's "generalized" engine: fitting a Gaussian LMM where a logistic
 * GLMM is required, or ignoring overdispersion, is the QRP — so this must be correct.
 * Verified by src/glmm.test.js against the lme4 `cbpp` glmer anchor, exact
 * saturated-model log-odds / log-rate anchors, and the OLRE SE-inflation property.
 *
 * Method: for given variance components theta, a penalised IRLS (PIRLS) inner loop
 * finds the joint conditional modes of the fixed effects beta and the spherical
 * random effects u; the Laplace approximation to the marginal deviance is then
 *   d(theta) = deviance(mu) + ||u||^2 + log|U'WU + I|
 * minimised over theta. The fixed-effect covariance is the beta-block of the inverse
 * joint penalised Hessian (X_a' W X_a + P)^-1.
 *
 * Works in Node (module.exports) and the browser (window.PSPSS_glmm).
 */
(function (root) {
  'use strict';

  const Stats = typeof require !== 'undefined' ? require('./stats') : root.Stats;
  const LMM = typeof require !== 'undefined' ? require('./lmm') : root.PSPSS_lmm;

  const cholesky = LMM.cholesky;
  const cholSolve = LMM.cholSolve;
  const nelderMead = LMM.nelderMead;

  // ---- families ------------------------------------------------------------
  // linkinv(eta) -> mu (success probability for binomial, mean for Poisson);
  // irls(eta, y, n) -> { w, z, mu } working weight / response for the IRLS step
  // (n = binomial trials, ignored by Poisson); dev(y, mu, n) -> unit deviance.
  const FAMILIES = {
    binomial: {
      linkinv: (eta) => 1 / (1 + Math.exp(-eta)),
      irls(eta, y, n) {
        let mu = 1 / (1 + Math.exp(-eta));
        mu = Math.min(1 - 1e-10, Math.max(1e-10, mu));
        const w = n * mu * (1 - mu);
        const z = eta + (y - n * mu) / w;
        return { w, z, mu };
      },
      // 2[ y log(y / n mu) + (n-y) log((n-y) / (n - n mu)) ]
      dev(y, mu, n) {
        const m = n * mu;
        let d = 0;
        if (y > 0) d += y * Math.log(y / m);
        if (y < n) d += (n - y) * Math.log((n - y) / (n - m));
        return 2 * d;
      },
    },
    poisson: {
      linkinv: (eta) => Math.exp(eta),
      irls(eta, y) {
        const mu = Math.max(1e-10, Math.exp(eta));
        return { w: mu, z: eta + (y - mu) / mu, mu };
      },
      // 2[ y log(y/mu) - (y - mu) ]
      dev(y, mu) {
        let d = mu - y;
        if (y > 0) d += y * Math.log(y / mu);
        return 2 * d;
      },
    },
  };

  // ---- small dense linear algebra ------------------------------------------

  function zeros(r, c) {
    return Array.from({ length: r }, () => new Array(c).fill(0));
  }

  // Inverse of a symmetric positive-definite matrix via Cholesky back-substitution.
  function inverseSPD(M) {
    const L = cholesky(M);
    if (!L) return null;
    const m = M.length;
    const inv = zeros(m, m);
    for (let c = 0; c < m; c++) {
      const e = new Array(m).fill(0);
      e[c] = 1;
      const col = cholSolve(L, e);
      for (let r = 0; r < m; r++) inv[r][c] = col[r];
    }
    return inv;
  }

  function logDetSPD(M) {
    const L = cholesky(M);
    if (!L) return null;
    let s = 0;
    for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]);
    return 2 * s;
  }

  // ---- random-effect structure --------------------------------------------

  // Map arbitrary group ids -> 0..k-1 contiguous level indices.
  function makeFactor(ids) {
    const map = new Map();
    const levelOf = new Array(ids.length);
    let k = 0;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      if (!map.has(id)) map.set(id, k++);
      levelOf[i] = map.get(id);
    }
    return { levelOf, nLevels: k };
  }

  // U = Z * Lambda(theta): the n x q design for the spherical random effects, with
  // each factor's columns scaled by its standard deviation tau = exp(theta_f).
  function buildU(n, factors, theta) {
    const offsets = [];
    let q = 0;
    for (const f of factors) { offsets.push(q); q += f.nLevels; }
    const U = Array.from({ length: n }, () => new Array(q).fill(0));
    factors.forEach((f, fi) => {
      const tau = Math.exp(theta[fi]);
      for (let i = 0; i < n; i++) U[i][offsets[fi] + f.levelOf[i]] = tau;
    });
    return U;
  }

  // ---- penalised IRLS (the Laplace inner loop) -----------------------------

  // Jointly solves for the spherical random effects u and the fixed effects beta at
  // fixed variance components (encoded in U). Returns consistent final mu/w/dev.
  function pirls(y, X, U, fam, trials, maxIter) {
    const n = y.length;
    const p = X[0].length;
    const q = U.length && U[0] ? U[0].length : 0;
    const m = q + p;
    const Xa = [];
    for (let i = 0; i < n; i++) {
      const row = new Array(m);
      for (let j = 0; j < q; j++) row[j] = U[i][j];
      for (let j = 0; j < p; j++) row[q + j] = X[i][j];
      Xa.push(row);
    }
    let coef = new Array(m).fill(0);
    const muArr = new Array(n);
    const wArr = new Array(n);
    let prevDev = Infinity;
    const iters = maxIter || 60;
    for (let it = 0; it < iters; it++) {
      const z = new Array(n);
      let dev = 0;
      for (let i = 0; i < n; i++) {
        let e = 0;
        for (let j = 0; j < m; j++) e += Xa[i][j] * coef[j];
        const r = fam.irls(e, y[i], trials ? trials[i] : 1);
        wArr[i] = r.w; muArr[i] = r.mu; z[i] = r.z;
        dev += fam.dev(y[i], r.mu, trials ? trials[i] : 1);
      }
      // M = Xa' W Xa + P (ridge of 1 on the u block); rhs = Xa' W z
      const M = zeros(m, m);
      const rhs = new Array(m).fill(0);
      for (let i = 0; i < n; i++) {
        const wi = wArr[i], zi = z[i], xi = Xa[i];
        for (let a = 0; a < m; a++) {
          const xa = xi[a];
          if (xa === 0) continue;
          rhs[a] += xa * wi * zi;
          for (let b = a; b < m; b++) M[a][b] += xa * wi * xi[b];
        }
      }
      for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) M[b][a] = M[a][b];
      for (let j = 0; j < q; j++) M[j][j] += 1;
      const L = cholesky(M);
      if (!L) return null;
      coef = cholSolve(L, rhs);
      if (it > 0 && Math.abs(prevDev - dev) < 1e-9 * (Math.abs(dev) + 0.1)) { prevDev = dev; break; }
      prevDev = dev;
    }
    // Final consistent recompute at the converged coefficients.
    let dev = 0;
    for (let i = 0; i < n; i++) {
      let e = 0;
      for (let j = 0; j < m; j++) e += Xa[i][j] * coef[j];
      const r = fam.irls(e, y[i], trials ? trials[i] : 1);
      wArr[i] = r.w; muArr[i] = r.mu;
      dev += fam.dev(y[i], r.mu, trials ? trials[i] : 1);
    }
    return { beta: coef.slice(q), u: coef.slice(0, q), mu: muArr, w: wArr, dev, Xa, m, q, p };
  }

  // Laplace-approximated deviance for the current theta (via the fitted PIRLS).
  function laplaceDeviance(fitp, U) {
    const n = fitp.w.length;
    const q = fitp.q;
    if (q === 0) return fitp.dev;
    // B = U' W U + I_q
    const B = zeros(q, q);
    for (let i = 0; i < n; i++) {
      const wi = fitp.w[i], ui = U[i];
      for (let a = 0; a < q; a++) {
        const ua = ui[a];
        if (ua === 0) continue;
        for (let b = a; b < q; b++) B[a][b] += ua * wi * ui[b];
      }
    }
    for (let a = 0; a < q; a++) { for (let b = a + 1; b < q; b++) B[b][a] = B[a][b]; B[a][a] += 1; }
    const ld = logDetSPD(B);
    if (ld == null) return 1e18;
    let uu = 0;
    for (let j = 0; j < q; j++) uu += fitp.u[j] * fitp.u[j];
    return fitp.dev + uu + ld;
  }

  // ---- public fit ----------------------------------------------------------

  // fit(y, predictors, groups, opts)
  //   y          : number[] (successes for binomial, counts for Poisson)
  //   predictors : array of columns (NOT incl intercept); intercept added automatically
  //   groups     : integer/string cluster id per row (the random grouping factor)
  //   opts.family   : 'binomial' (default) | 'poisson'
  //   opts.trials   : binomial denominators per row (default 1 = Bernoulli)
  //   opts.olre     : add an observation-level random effect (overdispersion)
  //   opts.testCol  : index into predictors of the fixed effect to test (default last)
  // returns { beta, se, z, p, effect, betas, ses, varComps, family, nGroups }
  function fit(y, predictors, groups, opts) {
    opts = opts || {};
    const family = opts.family || 'binomial';
    const fam = FAMILIES[family];
    const n = y.length;
    const trials = opts.trials || null;
    const preds = predictors || [];
    const X = [];
    for (let i = 0; i < n; i++) X.push([1].concat(preds.map((c) => c[i])));

    const factors = [makeFactor(groups)];
    if (opts.olre) factors.push(makeFactor(y.map((_, i) => i)));

    const objective = (theta) => {
      const U = buildU(n, factors, theta);
      const fitp = pirls(y, X, U, fam, trials, opts.maxIter);
      if (!fitp) return 1e18;
      return laplaceDeviance(fitp, U);
    };
    const theta0 = factors.map(() => 0); // tau = 1
    const res = factors.length === 1
      ? line1D(objective)
      : nelderMead(objective, theta0, { maxIter: 400, tol: 1e-8 });

    const theta = res.x;
    const U = buildU(n, factors, theta);
    const fitp = pirls(y, X, U, fam, trials, opts.maxIter);

    // Fixed-effect covariance = beta block of (Xa' W Xa + P)^-1.
    const { Xa, w, q, m, p } = fitp;
    const M = zeros(m, m);
    for (let i = 0; i < n; i++) {
      const wi = w[i], xi = Xa[i];
      for (let a = 0; a < m; a++) {
        const xa = xi[a];
        if (xa === 0) continue;
        for (let b = a; b < m; b++) M[a][b] += xa * wi * xi[b];
      }
    }
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) M[b][a] = M[a][b];
    for (let j = 0; j < q; j++) M[j][j] += 1;
    const inv = inverseSPD(M);
    const ses = fitp.beta.map((_, j) => Math.sqrt(Math.max(0, inv[q + j][q + j])));

    const testCol = (opts.testCol != null ? opts.testCol : preds.length - 1) + 1; // +1 intercept
    const beta = fitp.beta[testCol];
    const se = ses[testCol];
    const z = beta / se;
    const sd = factors.map((_, k) => Math.exp(theta[k]));

    return {
      beta,
      se,
      z,
      p: Stats.normalTwoTailedP(z),
      effect: beta,
      betas: fitp.beta,
      ses,
      varComps: { sd, groupSD: sd[0], olreSD: factors.length > 1 ? sd[1] : null },
      family,
      nGroups: factors[0].nLevels,
      testCol: testCol - 1,
    };
  }

  // Plain GLM (no random effects) — exposed for validation against exact anchors.
  function glm(y, predictors, opts) {
    opts = opts || {};
    const fam = FAMILIES[opts.family || 'binomial'];
    const n = y.length;
    const trials = opts.trials || null;
    const preds = predictors || [];
    const X = [];
    for (let i = 0; i < n; i++) X.push([1].concat(preds.map((c) => c[i])));
    const U = Array.from({ length: n }, () => []); // q = 0
    const fitp = pirls(y, X, U, fam, trials, opts.maxIter);
    const { Xa, w, m } = fitp;
    const M = zeros(m, m);
    for (let i = 0; i < n; i++) {
      const wi = w[i], xi = Xa[i];
      for (let a = 0; a < m; a++) for (let b = a; b < m; b++) M[a][b] += xi[a] * wi * xi[b];
    }
    for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) M[b][a] = M[a][b];
    const inv = inverseSPD(M);
    return { betas: fitp.beta, ses: fitp.beta.map((_, j) => Math.sqrt(Math.max(0, inv[j][j]))) };
  }

  // Robust 1-D minimiser for the single-variance case (golden-section on log-tau),
  // more reliable than Nelder-Mead on a degenerate 1-simplex.
  function line1D(f) {
    let lo = -6, hi = 3; // tau in [~0.0025, ~20]
    const gr = (Math.sqrt(5) - 1) / 2;
    let c = hi - gr * (hi - lo);
    let d = lo + gr * (hi - lo);
    let fc = f([c]), fd = f([d]);
    for (let i = 0; i < 80; i++) {
      if (fc < fd) { hi = d; d = c; fd = fc; c = hi - gr * (hi - lo); fc = f([c]); }
      else { lo = c; c = d; fc = fd; d = lo + gr * (hi - lo); fd = f([d]); }
      if (hi - lo < 1e-6) break;
    }
    const x = fc < fd ? c : d;
    return { x: [x], f: Math.min(fc, fd) };
  }

  const api = { fit, glm, FAMILIES, makeFactor, buildU, pirls };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_glmm = api;
})(typeof self !== 'undefined' ? self : this);
