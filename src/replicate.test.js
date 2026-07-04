/*
 * Tests for the replication stress-test (engine.simulateReplications).
 * Run: node src/replicate.test.js
 *
 * The claim under test is the whole point of the feature: replaying a pipeline
 * across fresh samples recovers its true operating characteristic —
 *   - an honest pipeline on a TRUE-NULL outcome rejects at roughly α, and
 *   - a QRP / signal-recovering pipeline rejects much more often.
 */
const { LEVELS } = require('./levels');
const E = require('./engine');

let passed = 0, failed = 0;
function assert(name, cond, extra) {
  cond ? passed++ : failed++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  (' + extra + ')' : ''}`);
}
const byId = (id) => LEVELS.find((l) => l.id === id);
const pct = (x) => (100 * x).toFixed(1) + '%';

// --- 1. Manufactured null: the honest primary analysis rejects near α --------
// `multiverse` has primary effect = 0 (only a non-primary outcome moves), so the
// honest pipeline (no QRP) is a true null and must reject around 5%, not always.
{
  const lv = byId('multiverse');
  const honest = E.simulateReplications(lv, [], { nReps: 400 });
  assert('multiverse honest pipeline runs all reps', honest.n >= 390, `n=${honest.n}`);
  assert('honest primary ≈ α (sigRate < 12%)', honest.sigRate < 0.12, pct(honest.sigRate));

  // The QRP — promote the outcome that "worked" (dv3 carries the real signal) —
  // rejects far more often. That contrast is the lesson.
  const qrp = E.simulateReplications(lv, [{ toolId: 'pick-outcome', payload: { dv: 'dv3' } }], { nReps: 400 });
  assert('pick-outcome rejects far more than honest', qrp.sigRate > honest.sigRate + 0.4,
    `honest ${pct(honest.sigRate)} vs QRP ${pct(qrp.sigRate)}`);
}

// --- 2. The pipeline changes the operating characteristic --------------------
// `skew` is lognormal: a raw t-test is under-powered against the long tail, but a
// log-transform (a real effect exists on the log scale) recovers power. So the
// transform pipeline must reject more often than the raw one.
{
  const lv = byId('skew');
  const raw = E.simulateReplications(lv, [], { nReps: 400 });
  const logged = E.simulateReplications(lv, [{ toolId: 'log-transform' }], { nReps: 400 });
  assert('log-transform pipeline rejects more than raw', logged.sigRate > raw.sigRate,
    `raw ${pct(raw.sigRate)} vs log ${pct(logged.sigRate)}`);
}

// --- 3. Determinism & shape --------------------------------------------------
{
  const lv = byId('outlier');
  const a = E.simulateReplications(lv, [], { nReps: 50, baseSeed: 1234 });
  const b = E.simulateReplications(lv, [], { nReps: 50, baseSeed: 1234 });
  assert('same baseSeed ⇒ identical sigRate (deterministic)', a.sigRate === b.sigRate);
  assert('returns a p-value per rep', a.pvals.length === a.n, `${a.pvals.length}/${a.n}`);
  assert('exposes the level ground-truth', a.truth && typeof a.truth.exists === 'boolean');
}

// --- 4. Fabrication retraction is seeded, not Math.random() ------------------
// The retraction roll must come from the state's seeded event stream so a
// pipeline containing `fabricate` replays identically (same seed ⇒ same fate),
// and different seeds actually vary the outcome.
{
  const lv = byId('outlier');
  const run = (seed) => {
    const st = E.newState(lv, seed, 'tenure');
    E.applyTool(st, 'fabricate');
    return st.finished === 'retract';
  };
  const seeds = Array.from({ length: 40 }, (_, i) => 777 + i * 13);
  const first = seeds.map(run);
  const second = seeds.map(run);
  assert('fabricate outcome reproduces per seed', first.every((v, i) => v === second[i]));
  assert('fabricate outcome varies across seeds', first.some(Boolean) && !first.every(Boolean),
    `${first.filter(Boolean).length}/${seeds.length} retracted`);
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
