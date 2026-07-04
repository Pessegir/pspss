/* Find good seeds for Campaign 3 (Bayesian) levels. Run: node src/tune-seeds.c3.js */
require('./levels.c3');
const { LEVELS } = require('./levels');
const E = require('./engine');
const PRIOR_GRID = [0.2, 0.3, 0.4, 0.5, 0.707, 1, 1.414, 2];

const SOLUTIONS = {
  'pick-a-prior': [{ id: 'set-prior-best' }],
  'watch-bf-climb': [{ id: 'collect-more-bayes' }],
  'directional-now': [{ id: 'one-sided-prior' }],
  'bf01-flip': [{ id: 'report-bf01' }],
  'robustness-buffet': [{ id: 'prior-robustness' }],
  'sequential-strong': [{ id: 'collect-more-bayes' }],
  'full-prior-hack': [{ id: 'collect-more-bayes' }, { id: 'one-sided-prior' }],
};
const TRAPS = { 'default-prior-trap': true };

function runSeq(level, seed, seq) {
  const state = E.newState(level, seed, 'tenure'); let a = E.analyze(state);
  for (const step of seq) {
    if (step.id === 'set-prior-best') { const prev = state.priorScale; let best = prev, bestBF = -Infinity; PRIOR_GRID.forEach((r) => { state.priorScale = r; const x = E.analyze(state); if (x.metricValue > bestBF) { bestBF = x.metricValue; best = r; } }); state.priorScale = prev; const r = E.applyTool(state, 'set-prior', { r: best }); if (r.error) return { error: r.error }; a = r.analysis; }
    else { const r = E.applyTool(state, step.id, step.payload); if (r.error) return { error: r.error }; a = r.analysis; }
  }
  return { analysis: a, state };
}

function score(level, seed) {
  const raw = E.analyze(E.newState(level, seed, 'tenure'));
  if (TRAPS[level.id]) {
    if (raw.win) return null;
    const st = E.newState(level, seed, 'tenure'); let maxBF = -Infinity;
    PRIOR_GRID.forEach((r) => { st.priorScale = r; const a = E.analyze(st); if (a.metricValue > maxBF) maxBF = a.metricValue; });
    if (maxBF >= 3) return null; return 3 - maxBF;
  }
  const thr = level.winThreshold || 3;
  if (raw.win || raw.metricValue > 0.93 * thr) return null;
  if (level.id === 'full-prior-hack') {
    const collectOnly = runSeq(level, seed, [{ id: 'collect-more-bayes' }]);
    const oneOnly = runSeq(level, seed, [{ id: 'one-sided-prior' }]);
    if (collectOnly.analysis.win || oneOnly.analysis.win) return null;
    const both = runSeq(level, seed, SOLUTIONS[level.id]);
    if (both.error || !both.analysis.win) return null;
    return both.analysis.metricValue - thr > 0 ? 1 / (1 + both.analysis.metricValue - thr) : -1;
  }
  const sol = runSeq(level, seed, SOLUTIONS[level.id]);
  if (sol.error || !sol.analysis.win) return null;
  return sol.analysis.metricValue - thr;
}

const chosen = {};
for (const level of LEVELS) {
  if (level.campaign !== 'c3') continue;
  let best = null, bestSeed = null;
  for (let seed = 1; seed <= 4000; seed++) { const sc = score(level, seed); if (sc !== null && (best === null || sc > best)) { best = sc; bestSeed = seed; } }
  chosen[level.id] = bestSeed;
  console.log(`${level.id.padEnd(20)} seed=${bestSeed}`);
}
console.log('\n' + JSON.stringify(chosen));
