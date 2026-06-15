/*
 * Campaign grouping + gated unlock metadata. The flat level registry stays in
 * PSPSS_levels.LEVELS; this just declares the order and grouping. A campaign is
 * locked until the previous campaign is fully cleared (enforced in ui.js).
 */
(function (root) {
  'use strict';

  const CAMPAIGNS = [
    {
      id: 'c1',
      name: 'Campaign 1 — Publish or Perish',
      subtitle: 'The fundamentals of statistical desperation.',
      levelIds: ['outlier', 'skew', 'confound', 'optional-stopping', 'subgroup', 'multiverse', 'wrong-direction', 'honest-null'],
    },
    {
      id: 'c2',
      name: 'Campaign 2 — The Methods Section',
      subtitle: 'Stop torturing the data. Start torturing the analysis. (Fewer hints.)',
      levelIds: ['pseudoreplication', 'wrong-test', 'random-slopes', 'two-kinds', 'collider', 'simpson', 'spec-curve', 'outcome-switch', 'honest-lmm'],
    },
    {
      id: 'c3',
      name: 'Campaign 3 — In Bayes We Trust',
      subtitle: 'No more p-values. Now you have priors, and priors can be... persuaded.',
      levelIds: ['pick-a-prior', 'watch-bf-climb', 'directional-now', 'bf01-flip', 'robustness-buffet', 'sequential-strong', 'full-prior-hack', 'default-prior-trap'],
    },
  ];

  const api = { CAMPAIGNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_campaigns = api;
})(typeof self !== 'undefined' ? self : this);
