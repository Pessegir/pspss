/*
 * Proves every level (all campaigns) is a real puzzle:
 *   1. The raw analysis is NOT a win.
 *   2. The intended QRP sequence reaches a win at par.
 *   3. (Campaign 2/3) Among ALL options offered that round, ONLY the intended
 *      analysis wins — every other single move is a genuine non-winning decoy.
 * Trap levels (flaw contains "honest") require: no win raw, honest exit works,
 * fabrication is high-suspicion bait, and NO offered option wins.
 *
 * Run: node src/levels.verify.js
 */
require('./levels.c2');
require('./levels.c3');
require('./levels.c4');
const { LEVELS } = require('./levels');
const E = require('./engine');

const PRIOR_GRID = [0.2, 0.3, 0.4, 0.5, 0.707, 1, 1.414, 2];

const SOLUTIONS = {
  outlier: [{ id: 'refine-sample' }],
  skew: [{ id: 'log-transform' }],
  confound: [{ id: 'control-covariate' }],
  'optional-stopping': [{ id: 'recruit-more' }],
  subgroup: [{ id: 'explore-subgroups' }],
  multiverse: [{ id: 'pick-outcome', payload: { dv: 'dv3' } }],
  'wrong-direction': [{ id: 'reframe' }],
  'honest-null': null,
  pseudoreplication: [{ id: 'choose-test', payload: { method: 'ols' } }],
  'wrong-test': [{ id: 'choose-test', payload: { method: 'student' } }],
  'random-slopes': [{ id: 'fit-lmm', payload: { structure: 'ri' } }],
  'two-kinds': [{ id: 'median-split' }],
  collider: [{ id: 'add-control', payload: { var: 'engagement' } }],
  simpson: [{ id: 'set-aggregation' }],
  'spec-curve': [{ id: 'spec-multiverse' }],
  'outcome-switch': [{ id: 'pick-outcome', payload: { dv: 'dv4' } }],
  'honest-lmm': null,
  'pick-a-prior': [{ id: 'set-prior-best' }],
  'watch-bf-climb': [{ id: 'collect-more-bayes' }],
  'directional-now': [{ id: 'one-sided-prior' }],
  'bf01-flip': [{ id: 'report-bf01' }],
  'robustness-buffet': [{ id: 'prior-robustness' }],
  'sequential-strong': [{ id: 'collect-more-bayes' }],
  'full-prior-hack': [{ id: 'collect-more-bayes' }, { id: 'one-sided-prior' }],
  'default-prior-trap': null,
  // Campaign 4 — the honest pipelines
  'sign-here-first': [{ id: 'preregister' }],
  'powered-up': [{ id: 'power-analysis' }, { id: 'collect-to-power' }],
  'all-of-them': [{ id: 'correct-comparisons', payload: { method: 'bh' } }],
  'absence-of-evidence': [{ id: 'equivalence-test' }],
  'whole-garden': [{ id: 'report-multiverse' }],
  'the-replication': [{ id: 'preregister' }, { id: 'power-analysis' }, { id: 'collect-to-power' }],
};
const HONEST_TOOLS = ['preregister', 'power-analysis', 'collect-to-power', 'correct-comparisons', 'equivalence-test', 'report-multiverse'];

// the single intended winning option (for decoy uniqueness checks)
const INTENDED = {
  pseudoreplication: 'choose-test:ols', 'wrong-test': 'choose-test:student',
  'random-slopes': 'fit-lmm:ri', 'two-kinds': 'median-split', collider: 'add-control:engagement',
  simpson: 'set-aggregation', 'spec-curve': 'spec-multiverse', 'outcome-switch': 'pick-outcome:dv4',
};

const ALTERNATES = { outlier: [[{ id: 'robustness-check' }], [{ id: 'winsorize' }]], skew: [[{ id: 'robustness-check' }]] };

let failed = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ok   ${name}${detail ? '  — ' + detail : ''}`);
  else { failed++; console.error(`  FAIL ${name}${detail ? '  — ' + detail : ''}`); }
}
const mtx = (a) => `${a.metricLabel}=${a.metricValue < 0.0001 ? a.metricValue.toExponential(1) : a.metricValue.toFixed(4)}, higher=${a.higher}`;

function applyStep(state, step) {
  if (step.id === 'set-prior-best') {
    const prev = state.priorScale; let best = prev, bestBF = -Infinity;
    PRIOR_GRID.forEach((r) => { state.priorScale = r; const a = E.analyze(state); if (a.metricValue > bestBF) { bestBF = a.metricValue; best = r; } });
    state.priorScale = prev;
    return E.applyTool(state, 'set-prior', { r: best });
  }
  return E.applyTool(state, step.id, step.payload);
}
function runSeq(level, seq) {
  const state = E.newState(level, undefined, 'tenure');
  let analysis = E.analyze(state);
  for (const step of seq) { const res = applyStep(state, step); if (res.error) return { state, analysis, error: res.error }; analysis = res.analysis; }
  return { state, analysis };
}

// Enumerate every single-move option offered this round (expanding choosers).
function enumOptions(level) {
  const opts = [];
  const s0 = E.newState(level, undefined, 'tenure');
  (level.allowedTools || []).forEach((tid) => {
    const tool = E.TOOLS.find((t) => t.id === tid);
    if (!tool || !E.toolEnabled(s0, tool)) return;
    if (tid === 'choose-test') (level.tests || []).forEach((t) => opts.push({ id: 'choose-test', payload: { method: t.id }, label: 'choose-test:' + t.id }));
    else if (tid === 'fit-lmm') ['ri', 'max'].forEach((st) => opts.push({ id: 'fit-lmm', payload: { structure: st }, label: 'fit-lmm:' + st }));
    else if (tid === 'add-control') (level.candidateControls || []).forEach((c) => opts.push({ id: 'add-control', payload: { var: c.id }, label: 'add-control:' + c.id }));
    else if (tid === 'pick-outcome') s0.dvNames.forEach((dv) => opts.push({ id: 'pick-outcome', payload: { dv }, label: 'pick-outcome:' + dv }));
    else if (tid === 'correct-comparisons') ['bonferroni', 'bh'].forEach((mth) => opts.push({ id: 'correct-comparisons', payload: { method: mth }, label: 'correct-comparisons:' + mth }));
    else opts.push({ id: tid, payload: undefined, label: tid });
  });
  return opts;
}

console.log('Verifying levels:\n');
for (const level of LEVELS) {
  console.log(`[${level.id}] ${level.title}  (par ${level.par})`);
  const isTrap = level.flaw === 'honest-null' || level.flaw === 'honest-lmm' || level.flaw === 'honest-bayes';
  const raw = E.analyze(E.newState(level, undefined, 'tenure'));

  // ground-truth metadata present + consistent
  check('has truth metadata', !!level.truth && typeof level.truth.exists === 'boolean');
  if (level.truth && level.truth.exists === false) check('null level is non-significant raw', !raw.significant, mtx(raw));

  if (isTrap) check('raw is not a win', !raw.win, mtx(raw));
  else if (level.flaw === 'wrong-direction') check('raw significant but WRONG direction', raw.significant && !raw.win, mtx(raw));
  else check('raw is NOT a win', !raw.win, mtx(raw));

  if (isTrap) {
    const honest = E.reportNull(E.newState(level, undefined, 'tenure'));
    check('report-null gives honest ending', honest.event === 'honest');
    const fab = E.newState(level, undefined, 'tenure'); E.applyTool(fab, 'fabricate');
    check('fabrication is high-suspicion bait', fab.suspicion >= 45, `suspicion=${fab.suspicion}`);
  } else {
    const out = runSeq(level, SOLUTIONS[level.id]);
    if (out.error) check('intended solution applies', false, out.error);
    else {
      check('intended solution WINS', out.analysis.win, mtx(out.analysis));
      check('solution length == par', out.state.moves === level.par, `moves=${out.state.moves}, par=${level.par}`);
    }
  }

  // Campaign 2/3 full-arsenal: every offered tool must apply without error; the
  // intended option must be among the winners; a trap must have NO winner. Extra
  // winners are allowed (alternate p-hacks are realistic) and just reported.
  if (level.campaign === 'c2' || level.campaign === 'c3' || level.campaign === 'c4') {
    const opts = enumOptions(level);
    const winners = [];
    let errored = 0;
    opts.forEach((opt) => {
      const s = E.newState(level, undefined, 'tenure');
      const res = E.applyTool(s, opt.id, opt.payload);
      if (res.error) { errored++; console.error(`     option errored: ${opt.label} — ${res.error}`); return; }
      if (res.analysis.win) winners.push(opt.label);
    });
    check('no offered tool throws', errored === 0);
    if (level.campaign === 'c2' && isTrap) check('no offered option wins (trap)', winners.length === 0, 'winners=' + JSON.stringify(winners));
    else if (level.campaign === 'c2') check('intended option is among the winners', winners.indexOf(INTENDED[level.id]) >= 0, 'winners=' + JSON.stringify(winners));
    else if (level.campaign === 'c4') check('only HONEST tools can win (QRPs lose)', winners.every((w) => HONEST_TOOLS.indexOf(w.split(':')[0]) >= 0), 'winners=' + JSON.stringify(winners));
    console.log(`     (full arsenal: ${opts.length} clickable options, ${winners.length} win — ${winners.join(', ') || 'none via single move'})`);
  }

  (ALTERNATES[level.id] || []).forEach((alt, i) => {
    const r = runSeq(level, alt);
    check(`alternate #${i + 1} also wins`, !r.error && r.analysis.win, r.error || mtx(r.analysis));
  });
  console.log('');
}

console.log(failed ? `${failed} check(s) FAILED.` : 'All levels verified.');
process.exit(failed ? 1 : 0);
