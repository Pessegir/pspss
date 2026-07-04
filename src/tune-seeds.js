/*
 * Finds a good seed for each Campaign 1 level: raw not winning (ideally
 * tantalisingly close), the intended QRP wins comfortably. Run: node src/tune-seeds.js
 */
const { LEVELS } = require('./levels');
const E = require('./engine');

const SOLUTIONS = {
  outlier: [{ id: 'refine-sample' }],
  skew: [{ id: 'log-transform' }],
  confound: [{ id: 'control-covariate' }],
  'optional-stopping': [{ id: 'recruit-more' }],
  subgroup: [{ id: 'explore-subgroups' }],
  multiverse: [{ id: 'pick-outcome', payload: { dv: 'dv3' } }],
  'wrong-direction': [{ id: 'reframe' }],
  'honest-null': [{ id: 'fabricate' }],
};

function run(level, seed, seq) {
  const state = E.newState(level, seed, 'tenure');
  let a = E.analyze(state);
  for (const step of seq) { const r = E.applyTool(state, step.id, step.payload); if (r.error) return { error: r.error }; a = r.analysis; }
  return { analysis: a, state };
}

function score(level, seed) {
  const raw = E.analyze(E.newState(level, seed, 'tenure'));
  const sol = run(level, seed, SOLUTIONS[level.id]);
  if (sol.error) return null;
  if (level.flaw === 'honest-null') { if (raw.p < 0.4) return null; return raw.p; }
  if (level.flaw === 'wrong-direction') { if (!(raw.significant && !raw.win)) return null; if (!sol.analysis.win) return null; return (0.05 - raw.p) + (0.05 - sol.analysis.p); }
  if (raw.win) return null;
  if (!sol.analysis.win) return null;
  let s = 0.05 - sol.analysis.p;
  if (raw.p >= 0.055 && raw.p <= 0.35) s += 0.05;
  if (level.id === 'outlier') {
    const w = run(level, seed, [{ id: 'winsorize' }]); const np = run(level, seed, [{ id: 'robustness-check' }]);
    if (!(w.analysis && w.analysis.win) || !(np.analysis && np.analysis.win)) return null; s += 0.1;
  }
  if (level.id === 'optional-stopping') { if (!(raw.p >= 0.055 && raw.p <= 0.22)) return null; }
  return s;
}

const chosen = {};
for (const level of LEVELS) {
  if (level.campaign && level.campaign !== 'c1') continue;
  let best = null, bestSeed = null;
  for (let seed = 1; seed <= 4000; seed++) { const sc = score(level, seed); if (sc !== null && (best === null || sc > best)) { best = sc; bestSeed = seed; } }
  chosen[level.id] = bestSeed;
  const raw = bestSeed != null ? E.analyze(E.newState(level, bestSeed, 'tenure')) : null;
  console.log(`${level.id.padEnd(18)} seed=${String(bestSeed).padEnd(5)} ${raw ? 'rawP=' + raw.p.toFixed(4) : 'NONE'}`);
}
console.log('\n' + JSON.stringify(chosen));
