/*
 * PSPSS Bayesian engine — genuine JZS Bayes factors for t-tests
 * (Rouder, Speckman, Sun, Morey & Iverson, 2009).
 *
 * The default-Cauchy prior on effect size δ ~ Cauchy(0, r) is represented as
 * δ | g ~ N(0, g), g ~ Inverse-Gamma(1/2, r²/2). BF10 is then a 1-D integral
 * over g, evaluated numerically. The prior width r is the knob Campaign 3 abuses.
 *
 * BF10 = ∫₀^∞ (1+Ng)^{-1/2} (1 + t²/(ν(1+Ng)))^{-(ν+1)/2} π(g) dg
 *        ──────────────────────────────────────────────────────────
 *                       (1 + t²/ν)^{-(ν+1)/2}
 *   N = n (one-sample) or n₁n₂/(n₁+n₂) (two-sample);  ν = df.
 *
 * Works in Node (module.exports) and browser (window.PSPSS_bayes).
 * Verified by src/bayes.test.js (dual integration + the BayesFactor sleep anchor).
 */
(function (root) {
  'use strict';

  const Stats = typeof require !== 'undefined' ? require('./stats') : root.Stats;

  // Inverse-Gamma(1/2, r²/2) density for g (the JZS prior in g-space).
  function priorG(g, r) {
    return (r / Math.sqrt(2 * Math.PI)) * Math.pow(g, -1.5) * Math.exp(-(r * r) / (2 * g));
  }

  // Marginal-likelihood integrand (numerator), in g.
  function numIntegrand(g, t, N, nu, r) {
    const k = 1 + N * g;
    const a = Math.pow(k, -0.5);
    const b = Math.pow(1 + (t * t) / (nu * k), -(nu + 1) / 2);
    return a * b * priorG(g, r);
  }

  function denom(t, nu) {
    return Math.pow(1 + (t * t) / nu, -(nu + 1) / 2);
  }

  // Composite Simpson over u = log g (stable; integrand decays both ends).
  function numIntegral(t, N, nu, r) {
    const lo = -35, hi = 25, n = 4000, h = (hi - lo) / n;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const u = lo + i * h;
      const g = Math.exp(u);
      const w = i === 0 || i === n ? 1 : i % 2 ? 4 : 2;
      s += w * numIntegrand(g, t, N, nu, r) * g; // * dg/du
    }
    return (s * h) / 3;
  }

  // Two-sided BF10 for a t statistic (depends on t², sign irrelevant here).
  function bf10(t, N, nu, r) {
    r = r || 0.707;
    return numIntegral(Math.abs(t), N, nu, r) / denom(Math.abs(t), nu);
  }
  function bf10OneSample(t, n, r) { return bf10(t, n, n - 1, r); }
  function bf10TwoSample(t, n1, n2, r) { return bf10(t, (n1 * n2) / (n1 + n2), n1 + n2 - 2, r); }

  // One-sided ("directional") BF for δ in the hypothesised direction.
  // Exact identity BF_{+0} = BF10 · Pr(δ>0|data)/Pr(δ>0|prior); here Pr(δ>0|data)
  // is taken from the normal posterior approximation Φ(t) (t signed toward H1).
  function bf10OneSided(tSigned, N, nu, r) {
    return 2 * Stats.normalCDF(tSigned) * bf10(tSigned, N, nu, r);
  }

  function bf01(bf) { return 1 / bf; }

  const api = { bf10, bf10OneSample, bf10TwoSample, bf10OneSided, bf01, numIntegrand, denom, priorG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_bayes = api;
})(typeof self !== 'undefined' ? self : this);
