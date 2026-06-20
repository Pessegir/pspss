/*
 * All flavor text, keyed by mode. The engine and stats stay deadpan; the comedy
 * lives here. Two modes:
 *   tenure : satire + real citations (the conscience is switched on)
 *   pure   : pure comedy, citations hidden, Reviewer 2 cranked up
 */
(function (root) {
  'use strict';

  // Honest tooltips per tool. `cite` only shows in Tenure Track mode.
  const TOOLTIPS = {
    descriptives: { tip: 'Look before you leap. Or leap, then look. Your call.' },
    'check-outliers': { tip: 'Find the participant who is "ruining everything."' },
    'check-normality': { tip: 'Is the distribution lumpy? Lumpy is bad for t-tests.' },
    'check-covariate': { tip: 'See whether something else explains your outcome.' },
    'check-subgroups': { tip: 'Slice the sample and peek at each slice.' },
    'peek-all-dvs': { tip: 'Run every outcome and see which one "worked."' },

    'refine-sample': {
      tip: "You'll define 'anomalous' AFTER seeing who's in the way.",
      cite: 'Outlier exclusion is a classic researcher degree of freedom (Simmons, Nelson & Simonsohn, 2011).',
    },
    winsorize: {
      tip: 'Quietly clamp the extremes toward the middle. No one will notice.',
      cite: 'Flexible data cleaning inflates false positives (Simmons et al., 2011).',
    },
    'log-transform': {
      tip: 'Reshape reality until it agrees to be bell-shaped.',
      cite: 'Transformations are legitimate — but choosing one because it gives p<.05 is not.',
    },
    'robustness-check': {
      tip: "If the t-test won't cooperate, the rank test might.",
      cite: "Trying multiple tests and reporting the friendliest is the 'garden of forking paths' (Gelman & Loken, 2013).",
    },
    'control-covariate': {
      tip: 'Add covariates until significance emerges. This is called science.',
      cite: 'Covariate selection contingent on results is a known QRP (Simmons et al., 2011).',
    },
    'explore-subgroups': {
      tip: "It didn't work for everyone — but it worked for left-handed Capricorns.",
      cite: 'Unplanned subgroup analysis = the Texas sharpshooter fallacy.',
    },
    'pick-outcome': {
      tip: 'You measured 17 things. Only one needs to be "primary."',
      cite: 'Selective outcome reporting is a leading cause of irreproducibility (Ioannidis, 2005).',
    },
    'recruit-more': {
      tip: 'Keep peeking, keep collecting, stop the moment it goes significant.',
      cite: 'Optional stopping drives the Type-I error rate well above 5% (Simmons et al., 2011).',
    },
    reframe: {
      tip: 'Update the hypothesis to fit the data. You knew it all along.',
      cite: 'Hypothesizing After Results are Known — HARKing (Kerr, 1998).',
    },
    fabricate: {
      tip: 'The nuclear option. Invent participants. Pray.',
      cite: 'This is fraud. It ends careers. (It is in the game to be refused.)',
    },

    // ---- Campaign 2 ----
    'plot-distribution': { tip: 'Look at the shape before you assume the shape.' },
    'plot-by-group': { tip: 'Box-and-whiskers per group. Spot the spread.' },
    'plot-scatter': { tip: 'Is a third variable doing the heavy lifting?' },
    'plot-spaghetti': { tip: 'One line per subject. See how much they differ.' },
    'choose-test': {
      tip: 'Different tests, different p-values. Audition them until one performs.',
      cite: "Analytic flexibility = the garden of forking paths (Gelman & Loken, 2013).",
    },
    'fit-lmm': {
      tip: 'Random slopes are honest and inconvenient. Random intercepts are friendly.',
      cite: 'Dropping justified random slopes inflates false positives — "keep it maximal" (Barr et al., 2013; Matuschek et al., 2017).',
    },
    'median-split': {
      tip: 'Two tidy groups out of one messy continuum. So much cleaner.',
      cite: 'Dichotomising continuous predictors loses power and manufactures spurious effects (MacCallum et al., 2002).',
    },
    'add-control': {
      tip: 'Adjust for things until the effect you want appears.',
      cite: 'Controlling for a post-treatment variable (a collider) induces bias (Montgomery, Nyhan & Torres, 2018).',
    },
    'set-aggregation': {
      tip: 'Zoom in or out until the trend points your way.',
      cite: "Simpson's paradox / the ecological fallacy: the level of analysis flips the sign.",
    },
    'spec-multiverse': {
      tip: 'Try every reasonable model; report the reasonable one that worked.',
      cite: 'The multiverse exists to be reported transparently — not cherry-picked (Steegen et al., 2016; Simonsohn et al., specification curve).',
    },

    // ---- Campaign 5 (mixed-model masterclass) ----
    'choose-df': {
      tip: 'The finite df is small and shy. The Wald z has infinite df and no shame.',
      cite: 'With few clusters, naive z/χ² p-values are anticonservative — use Satterthwaite/Kenward-Roger (Luke, 2017; lmerTest).',
    },
    'fit-glmm': {
      tip: 'Pick the family that fits your outcome — or the one that fits your hopes.',
      cite: 'Wrong family / ignored overdispersion gives optimistic SEs (Bolker et al., 2009; Harrison, 2014).',
    },

    // ---- Campaign 3 (Bayesian) ----
    'plot-bf-robustness': { tip: 'BF as a function of the prior. Find the flattering corner.' },
    'set-prior': {
      tip: 'A narrower prior likes small effects; pick the width that likes yours.',
      cite: 'The Bayes factor depends on the prior; choosing it after seeing data is just p-hacking in a robe (Rouder et al., 2009).',
    },
    'one-sided-prior': {
      tip: 'A directional prior roughly doubles the BF — if you guess the sign right.',
      cite: 'One-sided priors are fine when truly pre-planned; chosen post hoc they inflate evidence.',
    },
    'collect-more-bayes': {
      tip: 'Keep sampling and stop when the BF looks good.',
      cite: 'Bayes factors are NOT immune to optional stopping with open-ended sampling (Schönbrodt et al., 2017; Rouder, 2014).',
    },
    'report-bf01': {
      tip: 'Evidence for the null? Just relabel it as "strong evidence".',
      cite: 'BF₀₁ = 1/BF₁₀ supports the NULL — reporting it as support for your hypothesis is a sleight of subscript.',
    },
    'prior-robustness': {
      tip: 'A "robustness analysis" across priors — keep the biggest BF.',
      cite: 'A robustness check reports the RANGE honestly; cherry-picking its maximum defeats the point.',
    },
    // ---- Campaign 4 — the honest methods (the win condition here) ----
    preregister: { tip: 'Commit the plan before you see the data. The honest constraint.', cite: 'Nosek et al. (2018); Registered Reports (Chambers).' },
    'power-analysis': { tip: 'Compute the N you need BEFORE collecting.', cite: 'Cohen (1988); Button et al. (2013).' },
    'collect-to-power': { tip: 'Collect the pre-planned sample once — no peeking.', cite: 'The antidote to optional stopping.' },
    'correct-comparisons': { tip: 'Adjust p-values for the family of tests you ran.', cite: 'Benjamini & Hochberg (1995).' },
    'equivalence-test': { tip: 'Actively show "no meaningful effect" (TOST).', cite: 'Lakens (2017).' },
    'report-multiverse': { tip: 'Report the whole specification curve, not the best corner.', cite: 'Steegen et al. (2016).' },
  };

  const PURE_TIPS = {
    'refine-sample': 'Yeet the inconvenient data point. 🗑️',
    winsorize: 'Smush the spiky bits. 🔨',
    'log-transform': 'Apply math cologne until it smells normal. 🪵',
    'robustness-check': 'Roll the test dice again. 🎲',
    'control-covariate': 'Blame a third variable. 🧬',
    'explore-subgroups': 'Find your people. They exist. Somewhere. 🔎',
    'pick-outcome': 'Promote the outcome that loves you. 🏆',
    'recruit-more': 'MORE. PARTICIPANTS. 👥',
    reframe: 'Rewrite history. 🕰️',
    fabricate: 'Become legend. Become retracted. 🎲',
    'choose-test': 'Roll the test dice until you win. 🎰',
    'fit-lmm': 'Slopes? In THIS economy? 📉',
    'choose-df': 'Infinite degrees of freedom, baby. ♾️',
    'fit-glmm': 'Pick the distribution that vibes. 🎲',
    'median-split': 'Snap the variable in half. 🔪',
    'add-control': 'Blame a different variable. 🧮',
    'set-aggregation': 'Zoom until it works. 🔭',
    'spec-multiverse': 'Try everything. Keep the win. ♾️',
    preregister: 'Pinky-promise, notarized. ✍️',
    'power-analysis': 'Do the math first. 🔢',
    'collect-to-power': 'Collect once, no peeking. 📦',
    'correct-comparisons': 'Tax every test. 🧾',
    'equivalence-test': 'Prove the nothing. 🟰',
    'report-multiverse': 'Show the whole garden. 🌳',
    'set-prior': 'Pick the prior that vibes. 🔮',
    'one-sided-prior': 'You called it. (You didn’t.) ➡️',
    'collect-more-bayes': 'Feed the Bayes factor. 📈',
    'report-bf01': 'Flip the subscript, flip the narrative. 🔁',
    'prior-robustness': 'Seven priors. Keep the loudest. 📣',
  };

  function tooltip(toolId, mode) {
    const base = TOOLTIPS[toolId];
    if (!base) return '';
    if (mode === 'pure') return PURE_TIPS[toolId] || base.tip;
    return base.cite ? base.tip + '  —  ' + base.cite : base.tip;
  }

  // Reviewer 2 reacts to events.
  const REVIEWER2 = {
    tenure: {
      open: [
        'Reviewer 2: "I did not request to review this, yet here I am, displeased."',
        'Reviewer 2: "The introduction cites the authors\' own work 14 times."',
        'Reviewer 2: "Major revisions. Possibly to your career choice."',
      ],
      move: [
        'Reviewer 2: "Was this analysis pre-registered? It was not, was it."',
        'Reviewer 2: "Interesting. By \'interesting\' I mean \'suspicious.\'"',
        'Reviewer 2: "Please justify this in the (now mandatory) limitations section."',
        'Reviewer 2: "The p-value moved. So did my eyebrow."',
      ],
      win: [
        'Reviewer 2: "Accept. I am too tired to fight you."',
        'Reviewer 2: "Fine. FINE. But I\'m watching the replication."',
      ],
      suspicious: [
        'Reviewer 2: "I am forwarding this to a group chat."',
        'Reviewer 2: "PubPeer is going to love you."',
      ],
    },
    pure: {
      open: ['Reviewer 2: "let him cook 🍳"', 'Reviewer 2: "no notes (i didn\'t read it)"'],
      move: [
        'Reviewer 2: "absolutely diabolical. keep going 😈"',
        'Reviewer 2: "the p-value is shrinking and so is my faith in science"',
        'Reviewer 2: "chef\'s kiss of statistical crimes 💋"',
      ],
      win: ['Reviewer 2: "W paper. ship it 🚀"'],
      suspicious: ['Reviewer 2: "bro 💀"', 'Reviewer 2: "you\'re so cooked but I respect it"'],
    },
  };

  const JOURNALS = [
    'Journal of Findings We Wanted',
    'Annual Review of Suspiciously Round Numbers',
    'Proceedings of the Academy of Almost',
    'Nature: Subsidiary Subsidiary',
    'The Lancet of Least Resistance',
    'Frontiers in Whatever Gets Cited',
    'Journal of Irreproducible Triumphs',
  ];

  const ENDINGS = {
    win: {
      tenure: (ctx) =>
        `Published in <i>${ctx.journal}</i>. DOI: 10.${ctx.doi}/desperation.${ctx.year}. ` +
        `You reached ${ctx.metric} = <b>${ctx.p}</b> in <b>${ctx.moves}</b> move(s). ` +
        (ctx.suspicion > 50
          ? 'Suspicion is high. Sleep lightly.'
          : 'A clean-ish result. Your advisor weeps with relief.'),
      pure: (ctx) =>
        `🏆 PUBLISHED in <i>${ctx.journal}</i>! ${ctx.metric}=<b>${ctx.p}</b> in <b>${ctx.moves}</b> move(s). ` +
        'h-index +1. Dopamine +1000.',
    },
    retract: {
      tenure: () =>
        'An anonymous whistleblower on PubPeer reproduced your "analysis pipeline." ' +
        'Your paper is retracted, your lab dissolved, your office now a supply closet. ' +
        '<br><br>The data never lied. You did.',
      pure: () => '🚨 RETRACTED 🚨 PubPeer caught you. The group chat has screenshots. GG.',
    },
    honest: {
      tenure: () =>
        'You reported the null result honestly. It will not be published — null results rarely are ' +
        '(the file-drawer problem; Rosenthal, 1979). But you can look at yourself in the mirror. ' +
        'The mirror is in a smaller office now.',
      pure: () =>
        'You told the truth. 0 papers. 0 citations. 1 (one) intact soul. Achievement unlocked: "Coward (Honest)".',
    },
  };

  function pick(arr, n) {
    return arr[Math.floor((n || Math.random() * 1e6) % arr.length)];
  }

  const api = { TOOLTIPS, tooltip, REVIEWER2, JOURNALS, ENDINGS, pick };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PSPSS_content = api;
  }
})(typeof self !== 'undefined' ? self : this);
