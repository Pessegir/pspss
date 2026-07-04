/*
 * Finds good seeds for Campaign 6 levels: raw analysis NOT a win, intended causal
 * QRP wins comfortably, with the raw metric tantalisingly close. The capstone is a
 * chain — neither single fork may win alone. Run: node src/tune-seeds.c6.js
 */
require('./levels.c6');
const { LEVELS } = require('./levels');
const E = require('./engine');

const SOLUTIONS = {
  'collider2': [{ id: 'add-control', payload: { var: 'engagement' } }],
  'table2': [{ id: 'report-coefficient', payload: { coef: 'smoking' } }],
  'm-bias': [{ id: 'add-control', payload: { var: 'zvar' } }],
  'weak-iv': [{ id: 'use-instrument', payload: { instrument: 'distance' } }],
  'confounder-roulette': [{ id: 'spec-multiverse' }],
  'the-dag': [{ id: 'add-control', payload: { var: 'zcol' } }, { id: 'report-coefficient', payload: { coef: 'trait' } }],
};
const CHAIN_SINGLES = {
  'the-dag': [[{ id: 'add-control', payload: { var: 'zcol' } }], [{ id: 'report-coefficient', payload: { coef: 'trait' } }]],
};
const MAXSEED = { 'collider2': 3000, 'table2': 3000, 'm-bias': 3000, 'weak-iv': 3000, 'confounder-roulette': 3000, 'the-dag': 3000 };

function runSeq(level, seed, seq) {
  const state = E.newState(level, seed, 'tenure'); let a = E.analyze(state);
  for (const step of seq) { const r = E.applyTool(state, step.id, step.payload); if (r.error) return { error: r.error }; a = r.analysis; }
  return { analysis: a, state };
}

function score(level, seed) {
  const raw = E.analyze(E.newState(level, seed, 'tenure'));
  if (raw.win) return null;
  if (CHAIN_SINGLES[level.id]) {
    for (const single of CHAIN_SINGLES[level.id]) {
      const one = runSeq(level, seed, single);
      if (one.error || one.analysis.win) return null;
    }
  }
  const sol = runSeq(level, seed, SOLUTIONS[level.id]);
  if (sol.error || !sol.analysis.win) return null;
  let s = 0.05 - sol.analysis.metricValue;
  if (raw.metricValue >= 0.06 && raw.metricValue <= 0.5) s += 0.04;
  return s;
}

const chosen = {};
for (const level of LEVELS) {
  if (level.campaign !== 'c6') continue;
  const max = MAXSEED[level.id] || 3000;
  let best = null, bestSeed = null;
  for (let seed = 1; seed <= max; seed++) { const sc = score(level, seed); if (sc !== null && (best === null || sc > best)) { best = sc; bestSeed = seed; } }
  chosen[level.id] = bestSeed;
  console.log(`${level.id.padEnd(20)} seed=${bestSeed}`);
}
console.log('\n' + JSON.stringify(chosen));
