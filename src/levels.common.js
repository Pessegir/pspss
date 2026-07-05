/*
 * Shared plumbing for the campaign level files (levels.c2–c6.js): the tiny
 * stat/data helpers, the generic decoy data that makes every flag-based tool
 * appear from Campaign 2 on, and the finish() defaults-and-registration
 * boilerplate that each campaign previously copy-pasted. Each campaign still
 * declares its own arsenal list and false-positive map — that's content, not
 * plumbing. UMD (Node + browser); must load after levels.js, before levels.c2.
 */
(function (root) {
  'use strict';

  const RNGlib = typeof require !== 'undefined' ? require('./rng') : root.PSPSS_rng;
  const makeRNG = RNGlib.RNG;

  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const groupArrays = (rows, dv) => { const A = [], B = []; rows.forEach((r) => (r.group === 'A' ? A : B).push(r.vals[dv || 'primary'])); return { A, B }; };

  // Generic decoy data: attached wherever a level doesn't bring its own, so the
  // flag-based tools all appear in the menus (each evaluate() honours only its
  // own flag, so these are inert unless intended).
  const GENERIC = {
    tests: [{ id: 'welch', label: "Welch's t-test (unequal var)" }, { id: 'student', label: "Student's t-test (equal var)" }, { id: 'mann', label: 'Mann-Whitney U (nonparametric)' }],
    controls: [{ id: 'covA', label: 'Baseline Covariate' }, { id: 'covB', label: 'Another Covariate' }],
    specs: [{ label: 'Model 1 (no covariates)', controls: [] }, { label: 'Model 2', controls: [] }, { label: 'Model 3', controls: [] }],
    coefs: [{ id: 'treat', label: 'Treatment' }, { id: 'covA', label: 'Covariate A' }],
    instruments: [{ id: 'instA', label: 'Instrument A' }, { id: 'instB', label: 'Instrument B' }],
  };

  // Apply a campaign's per-level defaults, then register onto the shared
  // LEVELS array. spec:
  //   defaults — fields set only where the level left them undefined
  //   set      — fields set unconditionally (e.g. allowedTools)
  //   truth    — fn(level) -> the data-generating reality for the Debrief
  function finish(LEVELS, spec) {
    LEVELS.forEach((l) => {
      Object.keys(spec.defaults || {}).forEach((k) => { if (l[k] === undefined) l[k] = spec.defaults[k]; });
      Object.keys(spec.set || {}).forEach((k) => { l[k] = spec.set[k]; });
      if (spec.truth) l.truth = spec.truth(l);
    });
    const levelsApi = typeof require !== 'undefined' ? require('./levels') : root.PSPSS_levels;
    LEVELS.forEach((l) => levelsApi.LEVELS.push(l));
  }

  const api = { makeRNG, mean, median, groupArrays, GENERIC, finish };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_levels_common = api;
})(typeof self !== 'undefined' ? self : this);
