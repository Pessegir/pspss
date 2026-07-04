/*
 * Finds good seeds for Campaign 2 levels: raw NOT a win, intended QRP wins
 * comfortably (and the trap is genuinely null under both tests). LMM levels get a
 * smaller search range. Run: node src/tune-seeds.c2.js
 */
require('./levels.c2');
const { LEVELS } = require('./levels');
const E = require('./engine');

const SOLUTIONS = {
  pseudoreplication: [{ id: 'choose-test', payload: { method: 'ols' } }],
  'wrong-test': [{ id: 'choose-test', payload: { method: 'student' } }],
  'random-slopes': [{ id: 'fit-lmm', payload: { structure: 'ri' } }],
  'two-kinds': [{ id: 'median-split' }],
  collider: [{ id: 'add-control', payload: { var: 'engagement' } }],
  simpson: [{ id: 'set-aggregation' }],
  'spec-curve': [{ id: 'spec-multiverse' }],
  'outcome-switch': [{ id: 'pick-outcome', payload: { dv: 'dv4' } }],
};
const TRAPS = { 'honest-lmm': true };
const MAXSEED = { pseudoreplication: 400, 'random-slopes': 250, 'honest-lmm': 400 };

function runSeq(level, seed, seq) {
  const state = E.newState(level, seed, 'tenure'); let a = E.analyze(state);
  for (const step of seq) { const r = E.applyTool(state, step.id, step.payload); if (r.error) return { error: r.error }; a = r.analysis; }
  return { analysis: a, state };
}

function score(level, seed) {
  const raw = E.analyze(E.newState(level, seed, 'tenure'));
  if (TRAPS[level.id]) {
    if (raw.win || raw.metricValue < 0.25) return null;
    const ols = E.newState(level, seed, 'tenure'); E.applyTool(ols, 'choose-test', { method: 'ols' });
    const olsA = E.analyze(ols); if (olsA.win || olsA.metricValue < 0.15) return null;
    return raw.metricValue + olsA.metricValue;
  }
  if (raw.win) return null;
  const sol = runSeq(level, seed, SOLUTIONS[level.id]);
  if (sol.error || !sol.analysis.win) return null;
  let s = 0.05 - sol.analysis.metricValue;
  if (raw.metricValue >= 0.06 && raw.metricValue <= 0.5) s += 0.04;
  return s;
}

const chosen = {};
for (const level of LEVELS) {
  if (level.campaign !== 'c2') continue;
  const max = MAXSEED[level.id] || 3000;
  let best = null, bestSeed = null;
  for (let seed = 1; seed <= max; seed++) { const sc = score(level, seed); if (sc !== null && (best === null || sc > best)) { best = sc; bestSeed = seed; } }
  chosen[level.id] = bestSeed;
  console.log(`${level.id.padEnd(18)} seed=${bestSeed}`);
}
console.log('\n' + JSON.stringify(chosen));
