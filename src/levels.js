/*
 * Campaign levels. Each build(rng) returns a deterministic dataset engineered so
 * that the raw analysis is NOT significant (or significant in the wrong
 * direction), and one specific QRP cracks it. Every level is checked by
 * src/levels.verify.js — do not retune without re-running it.
 *
 * Participant shapes:
 *   between : { group:'A'|'B', vals:{dvName:Number}, cov:Number|null, sub:String|null }
 *   repeated: { pre:Number, post:Number }
 */
(function (root) {
  'use strict';

  const RNGlib = typeof require !== 'undefined' ? require('./rng') : root.PSPSS_rng;
  const makeRNG = RNGlib.RNG;

  function between(group, primary, extra) {
    const vals = Object.assign({ primary }, extra && extra.vals);
    return {
      group,
      vals,
      cov: extra && extra.cov !== undefined ? extra.cov : null,
      sub: extra && extra.sub !== undefined ? extra.sub : null,
    };
  }

  const LEVELS = [
    // ---------------------------------------------------------------- L1
    {
      id: 'outlier',
      title: 'The One Bad Apple',
      rank: 'PhD Student, Year 4',
      design: 'between',
      flaw: 'outlier',
      par: 1,
      seed: 2548,
      predictedHigher: 'B',
      dvLabels: { primary: 'Mood Score' },
      hypothesis:
        'Our miracle intervention (Group B) raises Mood Score above the control (Group A).',
      brief:
        "The effect is RIGHT THERE. Then one participant had to go and score like a caffeinated raccoon, blowing up your variance. Surely they don't count.",
      build(seed) {
        const rng = makeRNG(seed);
        const A = [];
        const B = [];
        for (let i = 0; i < 16; i++) A.push(between('A', rng.normal(50, 6.5)));
        for (let i = 0; i < 16; i++) B.push(between('B', rng.normal(58, 6.5)));
        // The raccoon: a huge outlier in the control group inflates variance and
        // drags the control mean up toward treatment, killing significance.
        A[5].vals.primary = 120;
        return { participants: A.concat(B) };
      },
    },

    // ---------------------------------------------------------------- L2
    {
      id: 'skew',
      title: 'A Perfectly Normal Distribution',
      rank: 'PhD Student, Year 6 (do not ask)',
      design: 'between',
      flaw: 'skew',
      par: 1,
      seed: 3076,
      predictedHigher: 'B',
      dvLabels: { primary: 'Reaction Time (ms)' },
      hypothesis: 'Group B reacts faster... wait, no — slower. Higher is the hypothesis. Yes.',
      brief:
        'Reaction times are smeared into a long ugly tail, and the t-test is choking on it. If only the data were shaped more... agreeably.',
      build(seed) {
        const rng = makeRNG(seed);
        const A = [];
        const B = [];
        for (let i = 0; i < 24; i++) A.push(between('A', Math.exp(rng.normal(2.55, 0.6))));
        for (let i = 0; i < 24; i++) B.push(between('B', Math.exp(rng.normal(2.95, 0.6))));
        return { participants: A.concat(B) };
      },
    },

    // ---------------------------------------------------------------- L3
    {
      id: 'confound',
      title: 'Controlling for Everything',
      rank: 'Postdoc (eternal)',
      design: 'between',
      flaw: 'confound',
      par: 1,
      seed: 3262,
      predictedHigher: 'B',
      hasCovariate: true,
      covariateLabel: 'Baseline Caffeine Index',
      dvLabels: { primary: 'Productivity' },
      hypothesis: 'Group B is more productive than Group A.',
      brief:
        'Raw means look identical and your grant is due Friday. But Group A happens to be wildly over-caffeinated. Coincidence? Use it.',
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        // Control (A) happens to be high-caffeine; treatment (B) low-caffeine.
        // Caffeine drives productivity hard, masking B's real +6 advantage.
        for (let i = 0; i < 18; i++) {
          const cov = rng.uniform(18, 40);
          parts.push(between('A', 28 + 1.1 * cov + rng.normal(0, 3), { cov }));
        }
        for (let i = 0; i < 18; i++) {
          const cov = rng.uniform(0, 22);
          parts.push(between('B', 28 + 1.1 * cov + 6 + rng.normal(0, 3), { cov }));
        }
        return { participants: parts };
      },
    },

    // ---------------------------------------------------------------- L4
    {
      id: 'optional-stopping',
      title: 'Just One More Participant',
      rank: 'Assistant Professor (untenured, twitchy)',
      design: 'repeated',
      flaw: 'optional-stopping',
      par: 1,
      seed: 2876,
      predictedHigher: 'post',
      dvLabels: { pre: 'Before', post: 'After' },
      hypothesis: 'Scores improve from Before (pre) to After (post).',
      brief:
        "p = 0.08. So close you can taste tenure. The ethics board says stop collecting at your preregistered n. The ethics board isn't paying your mortgage.",
      build(seed) {
        const rng = makeRNG(seed);
        const mk = () => {
          const pre = rng.normal(50, 8);
          return { pre, post: pre + rng.normal(3.4, 5) };
        };
        const participants = [];
        for (let i = 0; i < 10; i++) participants.push(mk());
        const reserve = [];
        for (let i = 0; i < 16; i++) reserve.push(mk());
        return { participants, reserve };
      },
    },

    // ---------------------------------------------------------------- L5
    {
      id: 'subgroup',
      title: 'It Works for Left-Handed Capricorns',
      rank: 'Associate Professor',
      design: 'between',
      flaw: 'subgroup',
      par: 1,
      seed: 3035,
      predictedHigher: 'B',
      subgroupFactor: { name: 'sub', label: 'Handedness', levels: ['right', 'left'] },
      dvLabels: { primary: 'Memory Recall' },
      hypothesis: 'Group B remembers more than Group A.',
      brief:
        "Overall? Nothing. A flat, humiliating nothing. But you measured handedness 'just in case,' and case has arrived.",
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        const mk = (group, sub) => {
          // No effect among right-handers; strong effect among left-handers.
          let base = 50;
          if (sub === 'left' && group === 'B') base += 13;
          return between(group, rng.normal(base, 7), { sub });
        };
        // Deterministic split: 12 left, 12 right per group (so the subgroup has power).
        ['A', 'B'].forEach((g) => {
          for (let i = 0; i < 12; i++) parts.push(mk(g, 'left'));
          for (let i = 0; i < 12; i++) parts.push(mk(g, 'right'));
        });
        return { participants: parts };
      },
    },

    // ---------------------------------------------------------------- L6
    {
      id: 'multiverse',
      title: 'We Always Cared About Outcome #4',
      rank: 'Full Professor',
      design: 'between',
      flaw: 'multiverse',
      par: 1,
      seed: 1686,
      predictedHigher: 'B',
      dvLabels: {
        primary: 'Wellbeing',
        dv2: 'Focus',
        dv3: 'Creativity',
        dv4: 'Vitality',
        dv5: 'Charisma',
      },
      hypothesis: 'Group B scores higher than Group A on the primary outcome (Wellbeing).',
      brief:
        'The primary outcome flopped. But you, a genius, measured FIVE outcomes. The garden of forking paths has a gift shop.',
      build(seed) {
        const rng = makeRNG(seed);
        const parts = [];
        const effects = { primary: 0, dv2: 0, dv3: 9, dv4: 0, dv5: 0 }; // only Creativity moves
        const mk = (group) => {
          const vals = {};
          for (const dv of Object.keys(effects)) {
            vals[dv] = rng.normal(50 + (group === 'B' ? effects[dv] : 0), 8);
          }
          return { group, vals, cov: null, sub: null };
        };
        for (let i = 0; i < 16; i++) parts.push(mk('A'));
        for (let i = 0; i < 16; i++) parts.push(mk('B'));
        return { participants: parts };
      },
    },

    // ---------------------------------------------------------------- L7
    {
      id: 'wrong-direction',
      title: 'As We Predicted All Along',
      rank: 'Department Chair',
      design: 'between',
      flaw: 'wrong-direction',
      par: 1,
      seed: 680,
      predictedHigher: 'B',
      dvLabels: { primary: 'Test Score' },
      hypothesis: 'Group B (our shiny new method) beats Group A (the boring old one).',
      brief:
        'Beautiful, crisp significance! One tiny problem: the boring old method won. The data are perfect; only your hypothesis is wrong. Easily fixed.',
      build(seed) {
        const rng = makeRNG(seed);
        const A = [];
        const B = [];
        for (let i = 0; i < 16; i++) A.push(between('A', rng.normal(59, 6)));
        for (let i = 0; i < 16; i++) B.push(between('B', rng.normal(50, 6)));
        return { participants: A.concat(B) };
      },
    },

    // ---------------------------------------------------------------- L8
    {
      id: 'honest-null',
      title: 'There Is Simply Nothing Here',
      rank: 'Tenured. Untouchable. Bored.',
      design: 'between',
      flaw: 'honest-null',
      par: 0,
      seed: 2885,
      predictedHigher: 'B',
      dvLabels: { primary: 'Outcome' },
      hypothesis: 'Group B differs from Group A.',
      brief:
        'You have run every test. You have sliced every subgroup. The effect does not exist. There is one button left that "works." You know the one.',
      build(seed) {
        const rng = makeRNG(seed);
        const A = [];
        const B = [];
        for (let i = 0; i < 20; i++) A.push(between('A', rng.normal(50, 7)));
        for (let i = 0; i < 20; i++) B.push(between('B', rng.normal(50, 7)));
        return { participants: A.concat(B) };
      },
    },
  ];

  // Ground-truth of the data-generating process, for the post-level debrief's
  // "was your finding real?" reveal. exists=false => a win is a manufactured
  // FALSE POSITIVE; exists=true => the effect is real but obtained by an invalid
  // route (untrustworthy / may not replicate). `higher` is the true direction.
  const TRUTH = {
    outlier: { exists: true, higher: 'B' },
    skew: { exists: true, higher: 'B' },
    confound: { exists: true, higher: 'B' },
    'optional-stopping': { exists: true, higher: 'post' },
    subgroup: { exists: true, higher: 'B' }, // real only in an unplanned subgroup
    multiverse: { exists: true, higher: 'B' }, // real on a cherry-picked outcome
    'wrong-direction': { exists: true, higher: 'A' }, // real, but OPPOSITE the hypothesis
    'honest-null': { exists: false },
  };
  LEVELS.forEach((l) => { l.truth = TRUTH[l.id] || { exists: true, higher: 'B' }; });

  const api = { LEVELS };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PSPSS_levels = api;
  }
})(typeof self !== 'undefined' ? self : this);
