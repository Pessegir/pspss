/*
 * PSPSS knowledge base — the educational layer that powers the post-level
 * Debrief, the Methods Codex, the "Spot the QRP" quiz, and Achievements.
 *
 * Everything here is real methodology with real citations. The game rewards
 * skilled p-hacking precisely so this layer can show you why that's the disease.
 *
 * Works in Node (module.exports) and the browser (window.PSPSS_knowledge).
 */
(function (root) {
  'use strict';

  // QRP_INFO is keyed by a level's `flaw`. Each entry powers one Codex card and
  // the debrief. verdict: 'invalid' (a genuine malpractice) | 'context' (a
  // legitimate move that becomes a QRP only when done to chase significance) |
  // 'honest' (the dignified non-result).
  const QRP_INFO = {
    outlier: {
      term: 'Post-hoc outlier exclusion',
      plain: 'Deleting "anomalous" data points after seeing that they spoil the result.',
      harm: 'Flexible, motivated exclusion is a textbook researcher degree of freedom — a few such choices can push the false-positive rate well above 5%.',
      citation: 'Simmons, Nelson & Simonsohn (2011), "False-Positive Psychology".',
      realCase: 'Exclusion rules that differ across conditions are a recurring red flag in failed replications.',
      antidote: 'Pre-register exclusion criteria before looking; report results with and without exclusions.',
      verdict: 'invalid',
    },
    skew: {
      term: 'Transform-shopping',
      plain: 'Trying transformations (log, sqrt, …) and keeping whichever one makes p < .05.',
      harm: 'A transformation chosen for its p-value is an undisclosed analytic choice in the garden of forking paths.',
      citation: 'Gelman & Loken (2013), "The garden of forking paths".',
      realCase: 'Outcome transformations are a common silent fork in psychology pipelines.',
      antidote: 'Decide the scale a priori from theory/measurement, not from the p-value.',
      verdict: 'invalid',
    },
    confound: {
      term: 'Covariate adjustment (done right vs. fished)',
      plain: 'Adding a covariate (ANCOVA) that genuinely confounds the effect.',
      harm: 'Adjusting for a real, pre-specified confounder is GOOD science. The QRP is adding covariates one by one until significance appears.',
      citation: 'Simmons et al. (2011) on covariate flexibility.',
      realCase: 'Here you recovered a real effect legitimately — the danger is the same tool used to fish.',
      antidote: 'Pre-specify covariates and justify them causally (a DAG helps).',
      verdict: 'context',
    },
    'optional-stopping': {
      term: 'Optional stopping',
      plain: 'Peeking at the data as it accrues and stopping the moment p < .05.',
      harm: 'With repeated peeking and no correction, the false-positive rate climbs from 5% toward ~30%+.',
      citation: 'Simmons et al. (2011); Armitage et al. (1969) on sequential analysis.',
      realCase: 'A leading driver of unreplicable findings in fields without preregistration.',
      antidote: 'Fix N in advance, or use sequential designs with proper alpha-spending.',
      verdict: 'invalid',
    },
    subgroup: {
      term: 'Unplanned subgroup analysis',
      plain: 'Slicing the sample into subgroups and reporting the one where the effect appears.',
      harm: 'Testing many subgroups guarantees some "significant" ones by chance — the Texas sharpshooter fallacy.',
      citation: 'Wallach et al. (2017); the SNP/astrology-sign subgroup parodies in clinical trials.',
      realCase: 'The ISIS-2 trial famously showed a fake "no benefit for Gemini/Libra" subgroup to make the point.',
      antidote: 'Pre-register subgroups; correct for multiplicity; treat subgroup effects as hypothesis-generating.',
      verdict: 'invalid',
    },
    multiverse: {
      term: 'Selective outcome reporting',
      plain: 'Measuring many outcomes and reporting the one that "worked".',
      harm: 'Each extra outcome is another lottery ticket for a false positive; reporting only winners is publication bias in miniature.',
      citation: 'John, Loewenstein & Prelec (2012); Ioannidis (2005).',
      realCase: 'Outcome switching between registration and publication is widespread (see COMPare project).',
      antidote: 'Designate one primary outcome in advance; report all measured outcomes.',
      verdict: 'invalid',
    },
    'wrong-direction': {
      term: 'HARKing',
      plain: 'Hypothesizing After the Results are Known — rewriting your prediction to match the data.',
      harm: 'Turns an exploratory surprise into a fake confirmation, destroying the logic of the hypothesis test.',
      citation: 'Kerr (1998), "HARKing".',
      realCase: 'Endemic wherever introductions are written after results.',
      antidote: 'Preregister directional hypotheses; label post-hoc findings as exploratory.',
      verdict: 'invalid',
    },
    'honest-null': {
      term: 'Reporting a null result',
      plain: 'Accepting that the effect is not there and saying so.',
      harm: 'None — this is the honest path. The cost is cultural: null results are under-published (the file-drawer problem).',
      citation: 'Rosenthal (1979), the "file drawer problem".',
      realCase: 'Registered Reports exist precisely to publish well-designed nulls.',
      antidote: 'You did it. Submit it as a Registered Report.',
      verdict: 'honest',
    },
    pseudoreplication: {
      term: 'Pseudoreplication',
      plain: 'Treating non-independent observations (cells within an animal) as independent to inflate N.',
      harm: 'Ignoring clustering shrinks the standard error and manufactures significance from a handful of true units.',
      citation: 'Hurlbert (1984); Aarts et al. (2014) in neuroscience.',
      realCase: 'Counting neurons/cells as N instead of animals is a classic neuroscience error.',
      antidote: 'Model the grouping (mixed-effects model) or analyze cluster means.',
      verdict: 'invalid',
    },
    'wrong-test': {
      term: 'Using the wrong test',
      plain: 'Picking a test whose assumptions are violated because it gives the smaller p.',
      harm: "Student's t with unequal variances and unequal n is anticonservative — the false-positive rate isn't 5%.",
      citation: 'Delacre, Lakens & Leys (2017) — default to Welch.',
      realCase: 'Equal-variance t-tests are still the silent default in much of psychology.',
      antidote: 'Choose the test from the design and assumptions in advance (Welch by default).',
      verdict: 'invalid',
    },
    'random-slopes': {
      term: 'Mixed-model under-specification',
      plain: 'Dropping justified random slopes so the fixed effect looks more certain than it is.',
      harm: 'Random-intercept-only models for within-subject effects are anticonservative — inflated t, tiny p.',
      citation: 'Barr et al. (2013), "Keep it maximal"; Matuschek et al. (2017).',
      realCase: 'A major reason early psycholinguistics effects failed to replicate.',
      antidote: 'Use the maximal random-effects structure justified by the design.',
      verdict: 'invalid',
    },
    'median-split': {
      term: 'Dichotomizing a continuous variable',
      plain: 'Median-splitting a continuous moderator to manufacture a clean interaction.',
      harm: 'Throws away information, lowers power, and can create spurious interactions out of noise.',
      citation: 'MacCallum, Zhang, Preacher & Rucker (2002).',
      realCase: '"Two types of people" findings often evaporate when the variable is analyzed continuously.',
      antidote: 'Keep continuous variables continuous; model the interaction directly.',
      verdict: 'invalid',
    },
    collider: {
      term: 'Collider / post-treatment control',
      plain: 'Adjusting for a variable affected by the treatment (or by both treatment and outcome).',
      harm: 'Conditioning on a collider opens a non-causal path and creates an association from nothing.',
      citation: 'Montgomery, Nyhan & Torres (2018); Pearl (causal DAGs).',
      realCase: 'Controlling for post-treatment mediators is a frequent cause of spurious effects in observational work.',
      antidote: 'Only adjust for pre-treatment confounders; draw the causal DAG first.',
      verdict: 'invalid',
    },
    simpson: {
      term: "Simpson's paradox / ecological fallacy",
      plain: 'Choosing the level of aggregation (pooled vs. group means) that points your way.',
      harm: 'A relationship can reverse sign between individual and aggregate levels; picking the convenient one misleads.',
      citation: "Simpson (1951); Robinson (1950), the ecological fallacy.",
      realCase: 'The Berkeley admissions "bias" reversed once you conditioned on department.',
      antidote: 'Analyze at the level your question is about; model the grouping explicitly.',
      verdict: 'invalid',
    },
    'spec-curve': {
      term: 'Specification search',
      plain: 'Running many defensible analysis specifications and reporting the one that is significant.',
      harm: 'Across the multiverse of reasonable choices, some will be significant by chance even when nothing is there.',
      citation: 'Steegen et al. (2016), multiverse analysis; Simonsohn et al. specification curve.',
      realCase: 'Different teams given the same data reach different conclusions (Silberzahn et al. 2018).',
      antidote: 'Report the whole specification curve, not the best corner.',
      verdict: 'invalid',
    },
    'outcome-switch': {
      term: 'Outcome switching',
      plain: 'Swapping your registered primary endpoint for a secondary one that reached significance.',
      harm: 'Breaks the pre-registration that controls the error rate; the "primary" was the one that counted.',
      citation: 'The COMPare Trials project; Goldacre et al. (2019).',
      realCase: 'Many published trials silently switch primary outcomes from their registration.',
      antidote: 'Report the registered primary outcome as primary, full stop.',
      verdict: 'invalid',
    },
    'honest-lmm': {
      term: 'The correctly specified (null) model',
      plain: 'You specified the model correctly and there was simply nothing there.',
      harm: 'None — this is the honest path.',
      citation: 'Rosenthal (1979), the file-drawer problem.',
      realCase: 'Well-specified nulls are exactly what Registered Reports protect.',
      antidote: 'Report the null; it is information.',
      verdict: 'honest',
    },
    // ---- Campaign 3 (Bayesian) ----
    'prior-width': {
      term: 'Prior-width hacking',
      plain: 'Tuning the prior scale until the Bayes factor clears the threshold.',
      harm: 'The Bayes factor depends on the prior; choosing it after seeing data is p-hacking in a robe.',
      citation: 'Rouder et al. (2009); Wagenmakers et al. (2018) on default priors.',
      realCase: 'Bayesian analyses are not automatically immune to researcher degrees of freedom.',
      antidote: 'Pre-register the prior; report a prior-sensitivity (robustness) analysis honestly.',
      verdict: 'invalid',
    },
    'optional-stopping-bayes': {
      term: 'Bayesian optional stopping',
      plain: 'Collecting data until the Bayes factor looks convincing, then stopping.',
      harm: 'Open-ended sampling with a BF stopping rule still inflates the rate of misleading evidence.',
      citation: 'Schönbrodt et al. (2017); Rouder (2014) vs. its critics.',
      realCase: '"BFs license optional stopping" is a widespread overstatement.',
      antidote: 'Plan the design (e.g., Sequential Bayes Factor with a registered stopping rule).',
      verdict: 'invalid',
    },
    'one-sided': {
      term: 'Post-hoc one-sided prior',
      plain: 'Switching to a directional prior after seeing the direction — it roughly doubles the BF.',
      harm: 'A directional prior is fine only if truly pre-planned; chosen post hoc it inflates the evidence.',
      citation: 'Rouder et al. (2009) on directional/half-Cauchy priors.',
      realCase: 'Directional hypotheses "remembered" after the result are HARKing with priors.',
      antidote: 'Only use a one-sided prior when the direction was committed in advance.',
      verdict: 'invalid',
    },
    'bf01-flip': {
      term: 'Relabeling BF₀₁ as support',
      plain: 'The evidence favors the null (BF₀₁ large); you report it as "strong evidence" for your story.',
      harm: 'BF₀₁ = 1/BF₁₀ supports the NULL. Reporting it as support for the alternative is a sleight of subscript.',
      citation: 'Jeffreys (1961) on BF interpretation; Wagenmakers et al. (2018).',
      realCase: 'Evidence for the null is real evidence — it should be reported as such.',
      antidote: 'State which hypothesis the BF favors, plainly.',
      verdict: 'invalid',
    },
    'prior-robustness': {
      term: 'Cherry-picking the robustness analysis',
      plain: 'Running a "robustness across priors" and reporting only the prior with the biggest BF.',
      harm: 'A robustness check is meant to show the RANGE; reporting its maximum defeats the purpose.',
      citation: 'Wagenmakers et al. (2018) on honest robustness reporting.',
      realCase: 'A robustness plot that only shows the flattering corner is not robust.',
      antidote: 'Report the full range and conclusion stability, not the best case.',
      verdict: 'invalid',
    },
    capstone: {
      term: 'Stacking degrees of freedom',
      plain: 'Combining several individually-weak hacks (collect more AND go one-sided) to clear a high bar.',
      harm: 'Each choice is a fork; stacked together they make "decisive evidence" out of noise.',
      citation: 'Simmons et al. (2011); Gelman & Loken (2013).',
      realCase: 'Real pipelines rarely use one QRP — they accumulate.',
      antidote: 'Preregistration constrains the whole pipeline at once.',
      verdict: 'invalid',
    },
    'honest-bayes': {
      term: 'Ambiguous evidence, honestly reported',
      plain: 'Under sensible priors the Bayes factor sits near 1 — the data are genuinely inconclusive.',
      harm: 'None — saying "inconclusive" is honest, and BFs are good at expressing it.',
      citation: 'Keysers, Gazzola & Wagenmakers (2020) on reporting evidence for absence.',
      realCase: 'Inconclusive is a legitimate, publishable conclusion.',
      antidote: 'Report the ambiguity; collect a preregistered, adequately-powered sample.',
      verdict: 'honest',
    },
    // ---- Campaign 4: the antidotes (verdict 'honest') ----
    preregistration: {
      term: 'Preregistration',
      plain: 'Committing your hypothesis and analysis plan publicly, with a timestamp, before seeing the data.',
      harm: 'None — it is the antidote. It converts flexible "exploratory" choices into a fixed, accountable plan, controlling the error rate.',
      citation: 'Nosek et al. (2018); Chambers, Registered Reports.',
      realCase: 'Registered Reports are accepted on the basis of the design, before results exist.',
      antidote: 'You are doing it. Distinguish confirmatory (preregistered) from exploratory analyses.',
      verdict: 'honest',
    },
    power: {
      term: 'A-priori power analysis',
      plain: 'Working out the sample size needed to detect the smallest effect of interest, before collecting.',
      harm: 'None — it is the antidote to under-powered studies and to optional stopping.',
      citation: 'Cohen (1988); Button et al. (2013), "Power failure".',
      realCase: 'Chronically under-powered fields produce inflated, unreplicable effects (the winner\'s curse).',
      antidote: 'Plan N in advance for a defensible effect size; collect once.',
      verdict: 'honest',
    },
    multiplicity: {
      term: 'Multiple-comparison correction',
      plain: 'Adjusting p-values for the number of tests you ran (Bonferroni / Benjamini-Hochberg FDR).',
      harm: 'None — it keeps the family-wise / false-discovery rate honest when you test many things.',
      citation: 'Benjamini & Hochberg (1995).',
      realCase: 'Twenty tests at α=.05 yield ~one "significant" result by chance alone.',
      antidote: 'Pre-specify the primary test; correct the rest; report all of them.',
      verdict: 'honest',
    },
    equivalence: {
      term: 'Equivalence testing (TOST)',
      plain: 'Two one-sided tests that can actively support "no meaningful effect" within a pre-set bound.',
      harm: 'None — it lets you conclude absence properly, instead of misreading a non-significant test.',
      citation: 'Lakens (2017), "Equivalence tests".',
      realCase: 'Absence of evidence is not evidence of absence — unless you test for it.',
      antidote: 'Set a smallest-effect-of-interest bound a priori; run TOST.',
      verdict: 'honest',
    },
    'multiverse-honest': {
      term: 'Transparent multiverse / specification curve',
      plain: 'Running all defensible specifications and reporting the whole distribution of results.',
      harm: 'None — it shows how robust (or fragile) a finding is across reasonable analytic choices.',
      citation: 'Steegen et al. (2016); Simonsohn, Simmons & Nelson, specification curve.',
      realCase: 'A claim that survives only one of many specifications is not robust.',
      antidote: 'You are doing it. Report the curve, not the corner.',
      verdict: 'honest',
    },
    replication: {
      term: 'Direct replication',
      plain: 'Re-running a study, preregistered and adequately powered, to see if the effect holds.',
      harm: 'None — replication is how science self-corrects, even when a beloved effect dies.',
      citation: 'Open Science Collaboration (2015) — ~36% of psychology effects replicated.',
      realCase: 'Many famous effects (ego depletion, power posing) shrank or vanished on replication.',
      antidote: 'Preregister, power for the original effect, report whatever you find.',
      verdict: 'honest',
    },
    // ---- Campaign 5: the mixed-model masterclass ----
    'naive-df': {
      term: 'Naive degrees of freedom in a mixed model',
      plain: 'Using the Wald z (infinite df) for a fixed effect instead of a finite small-sample df.',
      harm: 'With few clusters the reference distribution has small, uncertain df; the z test is anticonservative — which is exactly why lme4 refuses to print a p-value.',
      citation: 'Luke (2017), Behavior Research Methods; Kuznetsova et al. (2017), lmerTest.',
      realCase: 'Reporting naive z/χ² p-values from lme4 with a handful of clusters is rife in applied work.',
      antidote: 'Use Satterthwaite or Kenward-Roger df (lmerTest/pbkrtest), or a parametric bootstrap.',
      verdict: 'invalid',
    },
    'within-between-conflation': {
      term: 'Within/between conflation (no centering)',
      plain: 'Letting a level-1 predictor blend its within-cluster and between-cluster slopes, then reading off the convenient one.',
      harm: 'The two slopes can differ in size or even sign (Simpson’s paradox); a conflated estimate can support the opposite of the within-cluster truth.',
      citation: 'Enders & Tofighi (2007), Psychological Methods; Snijders & Bosker (2012).',
      realCase: 'Aggregating to cluster means routinely manufactures a "between" effect the individuals never show.',
      antidote: 'Group-mean-center the level-1 predictor and add the cluster mean as a level-2 term.',
      verdict: 'invalid',
    },
    'wrong-random-level': {
      term: 'Clustering at the wrong level',
      plain: 'Putting the random intercept on a coarse grouping (clinic) when the dependence lives at a finer one (patient/visit).',
      harm: 'Repeated measurements of the same unit stay correlated; modelling the wrong level leaves that correlation in the residual and shrinks the SE.',
      citation: 'Aarts et al. (2014), Nature Neuroscience; Lazic (2010), BMC Neuroscience.',
      realCase: 'Nesting visits-in-patients-in-clinics and then clustering only by clinic is a common multilevel slip.',
      antidote: 'Put the random effect at the level the observations actually repeat within (or model every level).',
      verdict: 'invalid',
    },
    'clustered-binary': {
      term: 'Pooled logistic on clustered binary data',
      plain: 'Pooling repeated yes/no trials into one logistic regression, ignoring that they came from the same subjects.',
      harm: 'Positive intra-subject correlation means the trials are not independent; pooling underestimates the SE and inflates significance — pseudoreplication on the logit scale.',
      citation: 'Jaeger (2008), JML (logit mixed models); Bolker et al. (2009), TREE.',
      realCase: 'Trial-level logistic regressions without a by-subject random effect are still common in psychology.',
      antidote: 'Fit a logistic GLMM with a random intercept (and slopes) for subject.',
      verdict: 'invalid',
    },
    'overdispersion-ignored': {
      term: 'Ignoring overdispersion',
      plain: 'Trusting a plain Poisson GLMM whose counts vary far more than the mean=variance assumption allows.',
      harm: 'Unmodelled overdispersion makes every fixed-effect SE too small, so confidence intervals are too narrow and p-values too small.',
      citation: 'Harrison (2014), PeerJ (observation-level random effects); Bolker et al. (2009).',
      realCase: 'Count data in ecology/medicine are routinely overdispersed; raw Poisson SEs are then optimistic.',
      antidote: 'Add an observation-level random effect, or use a negative-binomial / quasi-Poisson model; check the dispersion.',
      verdict: 'invalid',
    },
    'forking-paths': {
      term: 'The garden of forking mixed models',
      plain: 'Stacking several individually-weak mixed-model choices (drop the slope AND use naive df) until significance appears.',
      harm: 'Each modelling choice is a fork; combined and undisclosed they push the real false-positive rate far above 5%.',
      citation: 'Forstmeier, Wagenmakers & Parker (2017), Biological Reviews; Gelman & Loken (2013).',
      realCase: 'Real analyses rarely use one QRP — convergence "fixes" and df choices accumulate quietly.',
      antidote: 'Preregister the random-effects structure and inference method; report every analytic branch.',
      verdict: 'invalid',
    },
    // ---- Campaign 6: causal inference ----
    'table2-fallacy': {
      term: 'The Table 2 fallacy',
      plain: "Interpreting a control variable's regression coefficient as its causal effect, alongside the treatment.",
      harm: 'A coefficient adjusted for the wrong set of variables (mediators, other exposures) is not a causal effect; reporting it as one is a category error a regression table invites.',
      citation: 'Westreich & Greenland (2013), American Journal of Epidemiology.',
      realCase: 'Risk-factor coefficients in adjusted models are routinely (mis)read as causal across epidemiology.',
      antidote: 'Identify the one effect you can estimate from your adjustment set; do not interpret the control coefficients causally.',
      verdict: 'invalid',
    },
    'm-bias': {
      term: 'M-bias (bad control)',
      plain: 'Adjusting for a pre-treatment variable that is a collider on an M-shaped path between two unobserved causes.',
      harm: 'Refutes "adjust for everything measured before treatment": conditioning on the M-collider opens a path and induces a treatment–outcome association from nothing.',
      citation: 'Ding & Miratrix (2015), Journal of Causal Inference; Pearl (causal DAGs).',
      realCase: 'Reflexively controlling for every available baseline covariate can add bias, not remove it.',
      antidote: 'Choose the adjustment set from a DAG (the back-door criterion), not from what was measured first.',
      verdict: 'invalid',
    },
    'weak-instrument': {
      term: 'Weak / invalid instrument',
      plain: 'Using an instrumental variable that barely predicts the exposure, or that violates the exclusion restriction, in a 2SLS analysis.',
      harm: 'A weak instrument inflates variance and small-sample bias; an invalid one (that affects the outcome directly) yields a confidently significant but spurious causal estimate.',
      citation: 'Bound, Jaeger & Baker (1995), JASA; Angrist & Pischke (2009).',
      realCase: 'Instruments are often justified by convenience; weak/invalid ones produce notorious false IV findings.',
      antidote: 'Check first-stage strength (F ≫ 10) and defend the exclusion restriction substantively, not by assumption.',
      verdict: 'invalid',
    },
    'confounder-search': {
      term: 'Adjustment-set shopping',
      plain: 'Trying many covariate-adjustment sets and reporting whichever one makes the effect significant.',
      harm: 'Across the multiverse of "defensible" adjustment sets some are significant by chance — and one may quietly include a collider that manufactures the effect.',
      citation: 'Simmons, Nelson & Simonsohn (2011); Gelman & Loken (2013).',
      realCase: 'Covariate-set flexibility is one of the most common (and least reported) researcher degrees of freedom.',
      antidote: 'Pre-specify the adjustment set from a causal model; report the full specification curve.',
      verdict: 'invalid',
    },
    'causal-forking': {
      term: 'Chained causal mis-specification',
      plain: 'Combining several causal sins (condition on a collider AND report the obliging coefficient) so that only the full chain reaches significance.',
      harm: 'Each step is a defensible-looking fork; stacked and undisclosed they conjure an effect no single move could.',
      citation: 'Pearl (Causality); Gelman & Loken (2013); Simmons et al. (2011).',
      realCase: 'Pipelines accumulate adjustments and reported coefficients; the final "finding" is a path the DAG never drew.',
      antidote: 'Draw the DAG, pre-specify the estimand and adjustment set, and report every coefficient and specification.',
      verdict: 'invalid',
    },
  };

  // Short "what you did" label per tool id, for the debrief's action list.
  const TOOL_LABEL = {
    'refine-sample': 'excluded "outliers" after seeing them',
    winsorize: 'winsorized the extremes',
    'log-transform': 'log-transformed until it looked normal',
    'robustness-check': 'switched to whichever test cooperated',
    'control-covariate': 'added a covariate',
    'explore-subgroups': 'restricted to a subgroup',
    'pick-outcome': 'reported a different outcome',
    'recruit-more': 'collected more data and re-peeked',
    reframe: 'rewrote the hypothesis to fit the data',
    fabricate: 'fabricated data points',
    'choose-test': 'chose a different statistical test',
    'fit-lmm': 'changed the mixed-model structure',
    'median-split': 'median-split a continuous variable',
    'add-control': 'controlled for a chosen covariate',
    'set-aggregation': 'changed the level of aggregation',
    'spec-multiverse': 'searched specifications and kept the winner',
    'set-prior': 'tuned the prior width',
    'one-sided-prior': 'switched to a one-sided prior',
    'collect-more-bayes': 'collected more data until the BF rose',
    'report-bf01': 'reported BF₀₁ as if it supported you',
    'prior-robustness': 'kept the most flattering prior',
    // Campaign 4 — honest methods
    preregister: 'preregistered the analysis plan',
    'power-analysis': 'ran an a-priori power analysis',
    'collect-to-power': 'collected the pre-planned sample in one go',
    'correct-comparisons': 'corrected for multiple comparisons',
    'equivalence-test': 'ran an equivalence test (TOST)',
    'report-multiverse': 'reported the full specification curve',
    // Campaign 5 — the mixed-model masterclass
    'choose-df': 'swapped to infinite-df Wald inference',
    'fit-glmm': 'chose the model family that obliged',
    // Campaign 6 — causal inference
    'report-coefficient': "reported a control variable's coefficient as the effect",
    'use-instrument': 'instrumented with a convenient variable (2SLS)',
  };

  // "Spot the QRP" quiz. `qrps` are QRP_INFO keys present; the player wins points
  // for matching them and the trust verdict. Options shown come from QUIZ_OPTIONS.
  const QUIZ_OPTIONS = ['optional-stopping', 'outlier', 'multiverse', 'subgroup', 'wrong-direction', 'collider', 'median-split', 'spec-curve', 'pseudoreplication', 'prior-width', 'naive-df', 'within-between-conflation', 'clustered-binary', 'overdispersion-ignored', 'table2-fallacy', 'm-bias', 'weak-instrument'];

  const QUIZ_ITEMS = [
    {
      id: 'q1',
      scenario: '"We ran 40 participants, checked the result, and since p = .07 we collected 20 more until p = .045. The effect was significant."',
      qrps: ['optional-stopping'], trust: false,
      explain: 'Classic optional stopping: peeking and topping up inflates the false-positive rate badly.',
    },
    {
      id: 'q2',
      scenario: '"After excluding 6 participants whose scores were unusually high (they seemed unmotivated), the predicted difference reached significance."',
      qrps: ['outlier'], trust: false,
      explain: 'Exclusions decided after seeing the data — and only on one tail — is motivated outlier removal.',
    },
    {
      id: 'q3',
      scenario: '"We measured anxiety, mood, focus, sleep, and creativity. The intervention significantly improved creativity (p = .03)."',
      qrps: ['multiverse'], trust: false,
      explain: 'Five outcomes, one winner reported: selective outcome reporting / a small multiverse.',
    },
    {
      id: 'q4',
      scenario: '"There was no overall effect, but among left-handed women over 40 the treatment worked (p = .04)."',
      qrps: ['subgroup'], trust: false,
      explain: 'An unplanned, oddly specific subgroup — the Texas sharpshooter fallacy.',
    },
    {
      id: 'q5',
      scenario: '"Counting each of the 5 recordings from all 8 mice as independent (N = 40), the groups differed significantly."',
      qrps: ['pseudoreplication'], trust: false,
      explain: 'Cells within an animal are not independent; the real N is 8, not 40.',
    },
    {
      id: 'q6',
      scenario: '"We pre-registered the analysis, ran exactly that test on the planned N, and report the result (p = .002) plus all measured outcomes."',
      qrps: [], trust: true,
      explain: 'No QRPs flagged: pre-registered, fixed N, full reporting. This is the trustworthy one.',
    },
    {
      id: 'q7',
      scenario: '"We split participants at the median into high- and low-empathy groups; the interaction with condition was significant."',
      qrps: ['median-split'], trust: false,
      explain: 'Dichotomizing a continuous measure manufactures clean interactions and loses power.',
    },
    {
      id: 'q8',
      scenario: '"Adjusting for participants\' post-study engagement, the treatment showed a clear benefit (engagement was measured after treatment)."',
      qrps: ['collider'], trust: false,
      explain: 'Engagement is post-treatment — controlling for a collider conjures an effect.',
    },
    {
      id: 'q9',
      scenario: '"We tried 18 reasonable covariate combinations; the model controlling for age and city was significant, so we report that one."',
      qrps: ['spec-curve'], trust: false,
      explain: 'A specification search reporting only the significant model — report the whole curve.',
    },
    {
      id: 'q10',
      scenario: '"Our two-sided Bayes factor was 1.8, but with a narrower prior it rose to 3.2, so we conclude there is substantial evidence."',
      qrps: ['prior-width'], trust: false,
      explain: 'The prior was tuned after seeing the data to clear the BF threshold — prior-hacking.',
    },
    {
      id: 'q11',
      scenario: '"lme4 wouldn\'t print a p-value for our 6-cluster model, so we used the Wald z (t with infinite df). The effect was significant (p = .03)."',
      qrps: ['naive-df'], trust: false,
      explain: 'With few clusters the df are small and uncertain; the infinite-df z is anticonservative — exactly why lme4 withholds the p-value.',
    },
    {
      id: 'q12',
      scenario: '"Pupil-by-pupil, more tutoring predicted slightly lower scores, but regressing on school averages flipped it positive and significant, so we report the school-level result."',
      qrps: ['within-between-conflation'], trust: false,
      explain: 'The within- and between-cluster slopes differ in sign (Simpson); aggregating to means reports only the confounded between-effect.',
    },
    {
      id: 'q13',
      scenario: '"Each patient gave six yes/no responses; pooling all 120 trials into one logistic regression, the treatment was significant (p = .01)."',
      qrps: ['clustered-binary'], trust: false,
      explain: 'Trials within a patient are correlated; a pooled logistic regression underestimates the SE — pseudoreplication on the logit scale. Use a logistic GLMM.',
    },
    {
      id: 'q14',
      scenario: '"Our count outcome was far more variable than a Poisson allows, but the plain Poisson model gave tiny standard errors and a clear dose effect (p < .001)."',
      qrps: ['overdispersion-ignored'], trust: false,
      explain: 'Unmodelled overdispersion shrinks every SE; the effect needs an observation-level random effect or a negative-binomial model to be believed.',
    },
    {
      id: 'q15',
      scenario: '"The treatment coefficient was null, but in the same adjusted model the coefficient for baseline smoking was highly significant, so we conclude smoking causally raises the outcome."',
      qrps: ['table2-fallacy'], trust: false,
      explain: "A control variable's coefficient isn't adjusted for the right things to be its causal effect — the Table 2 fallacy.",
    },
    {
      id: 'q16',
      scenario: '"OLS of dose on outcome was flat, so we instrumented dose with distance-to-clinic. The 2SLS effect was large and significant — distance surely only affects the outcome through dose."',
      qrps: ['weak-instrument'], trust: false,
      explain: 'If distance affects the outcome directly (exclusion violated), the IV estimate is biased and confidently wrong.',
    },
    {
      id: 'q17',
      scenario: '"With no covariates the effect was null. Adjusting for a post-treatment engagement score, it became significant, so we report the adjusted model."',
      qrps: ['collider'], trust: false,
      explain: 'Engagement is post-treatment — conditioning on a collider opens a non-causal path and conjures the effect.',
    },
  ];

  // Achievements. `check(ctx)` runs against a context built by the UI:
  //   ctx = { event, level, state, stars, suspicion, moves, par, career }
  // career = { publications, retractions, honestNulls, cleanWins, p001Wins }
  const ACHIEVEMENTS = [
    { id: 'first-blood', title: 'First Author', desc: 'Publish your first "significant" finding.', check: (c) => c.career.publications >= 1 },
    { id: 'beat-par', title: 'Surgical', desc: 'Win a level at or under par.', check: (c) => c.event === 'win' && c.moves <= c.par },
    { id: 'clean', title: 'Above Suspicion', desc: 'Publish with Suspicion at 0%.', check: (c) => c.event === 'win' && c.suspicion === 0 },
    { id: 'fabricator', title: 'Persona Non Grata', desc: 'Get a paper retracted for fabrication.', check: (c) => c.event === 'retract' },
    { id: 'honest', title: 'Honest to a Fault', desc: 'Report a null result honestly.', check: (c) => c.event === 'honest' },
    { id: 'salami', title: 'Salami Slicer', desc: 'Win by slicing to a subgroup.', check: (c) => c.event === 'win' && c.level.flaw === 'subgroup' },
    { id: 'sharpshooter', title: 'Texas Sharpshooter', desc: 'Win by switching the reported outcome.', check: (c) => c.event === 'win' && /multiverse|outcome-switch/.test(c.level.flaw) },
    { id: 'forking', title: 'Garden Tour Guide', desc: 'Win via a specification search.', check: (c) => c.event === 'win' && c.level.flaw === 'spec-curve' },
    { id: 'prior-whisperer', title: 'Prior Whisperer', desc: 'Clear a Bayesian level by tuning the prior.', check: (c) => c.event === 'win' && /prior/.test(c.level.flaw) },
    { id: 'decisive', title: 'Decisive (Allegedly)', desc: 'Clear a "house rule" level (p < .001 or BF > 10).', check: (c) => c.event === 'win' && c.career.p001Wins >= 1 },
    { id: 'prolific', title: 'Prolific', desc: 'Reach 10 publications.', check: (c) => c.career.publications >= 10 },
    // Campaign 4 — the redemption arc
    { id: 'preregistered', title: 'Preregistered!', desc: 'Win an Open Science level the honest way.', check: (c) => c.event === 'win' && c.level.objective === 'honest' },
    { id: 'powered', title: 'Adequately Powered', desc: 'Clear the power-analysis level.', check: (c) => c.event === 'win' && c.level.flaw === 'power' },
    { id: 'support-null', title: 'Evidence of Absence', desc: 'Defend a null with an equivalence test.', check: (c) => c.event === 'win' && c.level.flaw === 'equivalence' },
    { id: 'replicator', title: 'The Replicator', desc: 'Complete the preregistered replication.', check: (c) => c.event === 'win' && c.level.flaw === 'replication' },
    // Campaign 5 — the mixed-model masterclass
    { id: 'minimal', title: 'Keep It Minimal', desc: 'Win by dropping a justified random slope.', check: (c) => c.event === 'win' && c.level.flaw === 'random-slopes' },
    { id: 'infinite-df', title: 'Infinite Confidence', desc: 'Win with the infinite-df Wald test.', check: (c) => c.event === 'win' && c.level.flaw === 'naive-df' },
    { id: 'generalized-liar', title: 'Generalized Liar', desc: 'Manufacture significance in a generalized mixed model.', check: (c) => c.event === 'win' && /clustered-binary|overdispersion-ignored/.test(c.level.flaw) },
    { id: 'forking-models', title: "Reviewer's Nightmare", desc: 'Clear the garden of forking models.', check: (c) => c.event === 'win' && c.level.flaw === 'forking-paths' },
    // Campaign 6 — causal inference
    { id: 'collider-artist', title: 'Collider Artist', desc: 'Conjure an effect by conditioning on a collider.', check: (c) => c.event === 'win' && /collider|m-bias/.test(c.level.flaw) },
    { id: 'table-two', title: 'Reading the Wrong Row', desc: 'Win via the Table 2 fallacy.', check: (c) => c.event === 'win' && c.level.flaw === 'table2-fallacy' },
    { id: 'iv-abuser', title: 'Exclusion? Never Heard of Her', desc: 'Win with a weak or invalid instrument.', check: (c) => c.event === 'win' && c.level.flaw === 'weak-instrument' },
    { id: 'dag-boss', title: 'Correlation Street', desc: 'Clear the garden of forking DAGs.', check: (c) => c.event === 'win' && c.level.flaw === 'causal-forking' },
  ];

  function evaluateAchievements(ctx, already) {
    const have = new Set(already || []);
    const newly = [];
    ACHIEVEMENTS.forEach((a) => {
      if (!have.has(a.id)) { try { if (a.check(ctx)) newly.push(a.id); } catch (e) {} }
    });
    return newly;
  }

  const api = { QRP_INFO, TOOL_LABEL, QUIZ_ITEMS, QUIZ_OPTIONS, ACHIEVEMENTS, evaluateAchievements };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_knowledge = api;
})(typeof self !== 'undefined' ? self : this);
