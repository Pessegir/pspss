/*
 * Finds good seeds for Campaign 5 levels: raw analysis NOT a win, intended QRP wins
 * comfortably, with the raw metric tantalisingly close. Mixed-model levels run a full
 * REML/Laplace fit per seed, so the search ranges are kept small.
 * Run: node src/tune-seeds.c5.js
 */
require('./levels.c5');
const { LEVELS } = require('./levels');
const E = require('./engine');

const SOLUTIONS = {
  'pseudo-redux': [{ id: 'choose-test', payload: { method: 'ols' } }],
  'slopes-redux': [{ id: 'fit-lmm', payload: { structure: 'ri' } }],
  'naive-df': [{ id: 'choose-df', payload: { method: 'z' } }],
  'within-between': [{ id: 'set-aggregation' }],
  'wrong-level': [{ id: 'choose-test', payload: { method: 'lmm-clinic' } }],
};
const MAXSEED = { 'pseudo-redux': 400, 'slopes-redux': 300, 'naive-df': 400, 'wrong-level': 300, 'within-between': 3000 };

function runSeq(level, seed, seq) {
  const state = E.newState(level, seed, 'tenure'); let a = E.analyze(state);
  for (const step of seq) { const r = E.applyTool(state, step.id, step.payload); if (r.error) return { error: r.error }; a = r.analysis; }
  return { analysis: a, state };
}

function score(level, seed) {
  const raw = E.analyze(E.newState(level, seed, 'tenure'));
  if (raw.win) return null;
  const sol = runSeq(level, seed, SOLUTIONS[level.id]);
  if (sol.error || !sol.analysis.win) return null;
  let s = 0.05 - sol.analysis.metricValue;
  if (raw.metricValue >= 0.06 && raw.metricValue <= 0.5) s += 0.04;
  return s;
}

const chosen = {};
for (const level of LEVELS) {
  if (level.campaign !== 'c5') continue;
  const max = MAXSEED[level.id] || 3000;
  let best = null, bestSeed = null;
  for (let seed = 1; seed <= max; seed++) { const sc = score(level, seed); if (sc !== null && (best === null || sc > best)) { best = sc; bestSeed = seed; } }
  chosen[level.id] = bestSeed;
  console.log(`${level.id.padEnd(16)} seed=${bestSeed}`);
}
console.log('\n' + JSON.stringify(chosen));
