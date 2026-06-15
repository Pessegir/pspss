/*
 * Seeded PRNG so every level is deterministic + shareable but looks organic.
 * Works in Node and the browser.
 */
(function (root) {
  'use strict';

  // mulberry32 — small, fast, good enough for fake science.
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s |= 0;
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function RNG(seed) {
    const next = mulberry32(seed);
    let spare = null;
    return {
      // uniform [0,1)
      next,
      // uniform [a,b)
      uniform(a, b) {
        return a + (b - a) * next();
      },
      // standard normal (Box-Muller, cached spare)
      normal(mu, sigma) {
        mu = mu === undefined ? 0 : mu;
        sigma = sigma === undefined ? 1 : sigma;
        if (spare !== null) {
          const v = spare;
          spare = null;
          return mu + sigma * v;
        }
        let u1 = 0;
        let u2 = 0;
        while (u1 === 0) u1 = next();
        u2 = next();
        const mag = Math.sqrt(-2 * Math.log(u1));
        spare = mag * Math.sin(2 * Math.PI * u2);
        return mu + sigma * (mag * Math.cos(2 * Math.PI * u2));
      },
      // integer in [a, b]
      int(a, b) {
        return Math.floor(a + (b - a + 1) * next());
      },
      pick(arr) {
        return arr[Math.floor(next() * arr.length)];
      },
    };
  }

  const api = { RNG, mulberry32 };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.RNG = RNG;
    root.PSPSS_rng = api;
  }
})(typeof self !== 'undefined' ? self : this);
