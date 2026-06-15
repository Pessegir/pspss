/*
 * PSPSS linear mixed model engine — a genuine REML fit.
 *
 * Supports a single random grouping factor with either:
 *   - random intercept only, or
 *   - random intercept + random slope on one covariate.
 *
 * Variance components are estimated by minimising the REML objective with a
 * small Nelder-Mead optimiser; fixed-effect inference uses GLS with the
 * between-within (BW) df approximation (as in SAS ddfm=BW). The whole point of
 * Campaign 2 is that ignoring the grouping (OLS / pseudoreplication) inflates
 * significance relative to this honest model — so this must be correct.
 *
 * Works in Node (module.exports) and the browser (window.PSPSS_lmm).
 * Verified by src/lmm.test.js (cluster-means equivalence for balanced data).
 */
(function (root) {
  'use strict';

  const Stats = typeof require !== 'undefined' ? require('./stats') : root.Stats;

  // ---- small dense linear algebra -----------------------------------------

  // Cholesky of SPD matrix A -> lower L with A = L L'. Returns null if not PD.
  function cholesky(A) {
    const n = A.length;
    const L = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let s = A[i][j];
        for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
        if (i === j) {
          if (s <= 0) return null; // not positive-definite
          L[i][j] = Math.sqrt(s);
        } else {
          L[i][j] = s / L[j][j];
        }
      }
    }
    return L;
  }

  // Solve L L' x = b given lower L.
  function cholSolve(L, b) {
    const n = L.length;
    const y = new Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = b[i];
      for (let k = 0; k < i; k++) s -= L[i][k] * y[k];
      y[i] = s / L[i][i];
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = y[i];
      for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k];
      x[i] = s / L[i][i];
    }
    return x;
  }

  function logDet(L) {
    let s = 0;
    for (let i = 0; i < L.length; i++) s += Math.log(L[i][i]);
    return 2 * s;
  }

  // Generic small-matrix inverse + log|det| (Gauss-Jordan with partial pivot).
  function invAndLogDet(A) {
    const n = A.length;
    const M = A.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    let logdet = 0;
    let sign = 1;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
      if (piv !== col) { [M[col], M[piv]] = [M[piv], M[col]]; sign = -sign; }
      const pv = M[col][col];
      logdet += Math.log(Math.abs(pv));
      for (let j = 0; j < 2 * n; j++) M[col][j] /= pv;
      for (let r = 0; r < n; r++) {
        if (r === col) continue;
        const f = M[r][col];
        for (let j = 0; j < 2 * n; j++) M[r][j] -= f * M[col][j];
      }
    }
    return { inv: M.map((row) => row.slice(n)), logdet, sign };
  }

  function matVec(M, v) { return M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0)); }
  function dot(a, b) { return a.reduce((s, x, i) => s + x * b[i], 0); }

  // ---- model assembly ------------------------------------------------------

  // Build the marginal covariance V = Z G Z' + sigma2 I from variance params.
  // groups: integer cluster id per row. slopeCol: covariate for random slope, or null.
  // params: random-intercept -> {sigma2, g00}; with slope -> {sigma2, G=[[g00,g01],[g01,g11]]}.
  function buildV(n, groups, slopeCol, params) {
    const V = Array.from({ length: n }, () => new Array(n).fill(0));
    const slope = !!slopeCol;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let v = 0;
        if (groups[i] === groups[j]) {
          if (!slope) {
            v = params.g00;
          } else {
            const xi = slopeCol[i];
            const xj = slopeCol[j];
            const G = params.G;
            v = G[0][0] + G[0][1] * xi + G[0][1] * xj + G[1][1] * xi * xj;
          }
        }
        if (i === j) v += params.sigma2;
        V[i][j] = v;
      }
    }
    return V;
  }

  // params vector -> structured variance components (kept positive / PD).
  function unpack(theta, slope) {
    if (!slope) {
      return { sigma2: Math.exp(theta[0]), g00: Math.exp(theta[1]) };
    }
    const sigma2 = Math.exp(theta[0]);
    const a = Math.exp(theta[1]);
    const b = theta[2];
    const c = Math.exp(theta[3]);
    // G = L L', L = [[a,0],[b,c]]
    const G = [
      [a * a, a * b],
      [a * b, b * b + c * c],
    ];
    return { sigma2, G };
  }

  // GLS fixed-effect solve + REML objective for given V.
  function gls(y, X, V) {
    const L = cholesky(V);
    if (!L) return null;
    const n = y.length;
    const p = X[0].length;
    const ldV = logDet(L);
    // Vinv X (column-wise) and Vinv y
    const VinvY = cholSolve(L, y);
    const VinvX = [];
    for (let c = 0; c < p; c++) {
      const col = X.map((row) => row[c]);
      VinvX.push(cholSolve(L, col));
    }
    // XtVinvX (p x p) and XtVinvY (p)
    const XtVinvX = Array.from({ length: p }, () => new Array(p).fill(0));
    const XtVinvY = new Array(p).fill(0);
    for (let a = 0; a < p; a++) {
      for (let i = 0; i < n; i++) XtVinvY[a] += X[i][a] * VinvY[i];
      for (let b = 0; b < p; b++) {
        let s = 0;
        for (let i = 0; i < n; i++) s += X[i][a] * VinvX[b][i];
        XtVinvX[a][b] = s;
      }
    }
    const { inv: XtVinvXinv, logdet: ldXtVinvX } = invAndLogDet(XtVinvX);
    const beta = matVec(XtVinvXinv, XtVinvY);
    // residual quadratic form r' Vinv r
    const fitted = X.map((row) => dot(row, beta));
    const r = y.map((v, i) => v - fitted[i]);
    const Vinvr = cholSolve(L, r);
    const rVr = dot(r, Vinvr);
    // REML objective (-2 logLik_REML up to constant): ldV + ld|XtVinvX| + rVr
    const reml = ldV + ldXtVinvX + rVr;
    return { beta, vcov: XtVinvXinv, reml, rVr, n, p };
  }

  // ---- Nelder-Mead (minimisation) -----------------------------------------
  function nelderMead(f, x0, opts) {
    opts = opts || {};
    const n = x0.length;
    const alpha = 1, gamma = 2, rho = 0.5, sigma = 0.5;
    const maxIter = opts.maxIter || 400;
    const tol = opts.tol || 1e-8;
    let simplex = [x0.slice()];
    for (let i = 0; i < n; i++) {
      const x = x0.slice();
      x[i] += (x[i] !== 0 ? 0.5 : 0.5);
      simplex.push(x);
    }
    let fv = simplex.map(f);
    for (let iter = 0; iter < maxIter; iter++) {
      const order = fv.map((v, i) => i).sort((a, b) => fv[a] - fv[b]);
      simplex = order.map((i) => simplex[i]);
      fv = order.map((i) => fv[i]);
      if (Math.abs(fv[n] - fv[0]) < tol) break;
      // centroid of all but worst
      const cen = new Array(n).fill(0);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += simplex[i][j] / n;
      const worst = simplex[n];
      const xr = cen.map((c, j) => c + alpha * (c - worst[j]));
      const fr = f(xr);
      if (fr < fv[0]) {
        const xe = cen.map((c, j) => c + gamma * (xr[j] - c));
        const fe = f(xe);
        if (fe < fr) { simplex[n] = xe; fv[n] = fe; } else { simplex[n] = xr; fv[n] = fr; }
      } else if (fr < fv[n - 1]) {
        simplex[n] = xr; fv[n] = fr;
      } else {
        const xc = cen.map((c, j) => c + rho * (worst[j] - c));
        const fc = f(xc);
        if (fc < fv[n]) { simplex[n] = xc; fv[n] = fc; }
        else {
          for (let i = 1; i <= n; i++) {
            simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
            fv[i] = f(simplex[i]);
          }
        }
      }
    }
    let best = 0;
    for (let i = 1; i <= n; i++) if (fv[i] < fv[best]) best = i;
    return { x: simplex[best], f: fv[best] };
  }

  // ---- public fit ----------------------------------------------------------

  // fit(y, predictors, groups, opts)
  //   y          : number[]
  //   predictors : array of columns (NOT incl intercept); intercept added automatically
  //   groups     : integer cluster id per row (the random grouping factor)
  //   opts.randomSlope : a covariate column for a by-group random slope (or undefined)
  //   opts.testCol     : index into predictors of the fixed effect to test (default last)
  // returns { beta, se, t, df, p, effect, varComps, testCol }
  function fit(y, predictors, groups, opts) {
    opts = opts || {};
    const n = y.length;
    const X = [];
    for (let i = 0; i < n; i++) X.push([1].concat(predictors.map((col) => col[i])));
    const p = X[0].length;
    const slopeCol = opts.randomSlope || null;
    const slope = !!slopeCol;

    // OLS start for a sane scale of sigma2
    const ols = Stats.ols(y, predictors);
    const sse = (function () {
      let s = 0;
      for (let i = 0; i < n; i++) {
        let yh = 0;
        for (let a = 0; a < p; a++) yh += X[i][a] * ols.beta[a];
        s += (y[i] - yh) * (y[i] - yh);
      }
      return s;
    })();
    const s2start = Math.log(Math.max(1e-3, sse / Math.max(1, n - p)));

    const objective = (theta) => {
      const params = unpack(theta, slope);
      const V = buildV(n, groups, slopeCol, params);
      const g = gls(y, X, V);
      if (!g) return 1e18;
      return g.reml;
    };

    const theta0 = slope ? [s2start, s2start - 1, 0, s2start - 1] : [s2start, s2start - 1];
    const res = nelderMead(objective, theta0, { maxIter: 600, tol: 1e-9 });
    const params = unpack(res.x, slope);
    const V = buildV(n, groups, slopeCol, params);
    const g = gls(y, X, V);

    const testCol = (opts.testCol != null ? opts.testCol : predictors.length - 1) + 1; // +1 for intercept
    const beta = g.beta[testCol];
    const se = Math.sqrt(g.vcov[testCol][testCol]);
    const t = beta / se;

    // between-within df for the tested effect
    const nGroups = new Set(groups).size;
    const isBetween = (colIdx) => {
      const byGroup = {};
      for (let i = 0; i < n; i++) {
        const gid = groups[i];
        const val = X[i][colIdx];
        if (byGroup[gid] === undefined) byGroup[gid] = val;
        else if (Math.abs(byGroup[gid] - val) > 1e-9) return false;
      }
      return true;
    };
    let pBetween = 0;
    let pWithin = 0;
    for (let c = 0; c < p; c++) (isBetween(c) ? pBetween++ : pWithin++);
    let df;
    if (isBetween(testCol)) df = Math.max(1, nGroups - pBetween);
    else df = Math.max(1, n - nGroups - pWithin);

    return {
      beta,
      se,
      t,
      df,
      p: Stats.tDistTwoTailedP(t, df),
      effect: beta,
      varComps: params,
      reml: g.reml,
      testCol: testCol - 1,
      nGroups,
    };
  }

  const api = { fit, cholesky, cholSolve, buildV, gls, nelderMead, unpack };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_lmm = api;
})(typeof self !== 'undefined' ? self : this);
