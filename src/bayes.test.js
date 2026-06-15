/*
 * Tests for the Bayesian engine. Run: node src/bayes.test.js
 * Pinned by: (1) dual-integration agreement, (2) the BayesFactor `sleep` anchor
 * (paired, n=10, t=4.0621, r=0.707 -> BF10 ~ 17.26), (3) qualitative invariants.
 */
const B = require('./bayes');

let pass = 0, fail = 0;
function approxRel(name, got, want, rel) { rel = rel == null ? 1e-2 : rel; const ok = Math.abs(got - want) <= rel * Math.abs(want); ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}  (got ${got.toPrecision(6)}, want ~${want.toPrecision(6)})`); }
function assert(name, cond, extra) { cond ? pass++ : fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  — ' + extra : ''}`); }

function bf10_methodB(t, N, nu, r) {
  const n = 40000; let s = 0;
  for (let i = 0; i < n; i++) { const x = (i + 0.5) / n; const g = x / (1 - x); s += B.numIntegrand(g, Math.abs(t), N, nu, r) / ((1 - x) * (1 - x)); }
  return (s / n) / B.denom(Math.abs(t), nu);
}

console.log('\nDual-integration agreement (Simpson/logg vs midpoint/s-subst):');
[[2.0, 20, 0.707], [4.0621, 10, 0.707], [1.0, 30, 1.0], [0.5, 50, 0.5], [3.0, 15, 1.414]].forEach(([t, n, r]) => {
  approxRel(`one-sample t=${t} n=${n} r=${r}`, B.bf10OneSample(t, n, r), bf10_methodB(t, n, n - 1, r), 5e-3);
});

console.log('\nExternal anchor — BayesFactor sleep example (paired):');
approxRel('bf10 sleep paired', B.bf10OneSample(4.0621, 10, 0.707), 17.259, 3e-2);

console.log('\nQualitative invariants:');
assert('t=0 favours the null (BF10 < 1)', B.bf10OneSample(0, 30, 0.707) < 1);
assert('BF increases with |t|', B.bf10OneSample(3, 30, 0.707) > B.bf10OneSample(1.5, 30, 0.707));
assert('BF decreases with n at fixed t (Lindley)', B.bf10OneSample(2.5, 20, 0.707) > B.bf10OneSample(2.5, 60, 0.707));
assert('two-sample BF finite & positive', B.bf10TwoSample(2.2, 25, 25, 0.707) > 0);
assert('BF01 is the reciprocal', Math.abs(B.bf01(B.bf10OneSample(0, 30, 0.707)) - 1 / B.bf10OneSample(0, 30, 0.707)) < 1e-9);

console.log('\nOne-sided (directional) prior:');
const two = B.bf10OneSample(3.0, 30, 0.707);
const oneAligned = B.bf10OneSided(3.0, 30, 29, 0.707);
const oneAgainst = B.bf10OneSided(-3.0, 30, 29, 0.707);
assert('aligned one-sided ~ 2x two-sided', oneAligned > 1.8 * two && oneAligned <= 2.001 * two, `one=${oneAligned.toFixed(2)}, two=${two.toFixed(2)}`);
assert('against-direction one-sided is tiny', oneAgainst < 0.1 * two);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
