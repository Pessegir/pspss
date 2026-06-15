/*
 * Tests for the LMM engine. Run: node src/lmm.test.js
 * Anchor: for balanced random-intercept data with a between-cluster treatment,
 * the LMM fixed-effect test equals a two-sample t-test on the cluster means.
 */
const S = require('./stats');
const LMM = require('./lmm');

let pass = 0, fail = 0;
function approx(name, got, want, tol) { tol = tol == null ? 1e-2 : tol; const ok = Math.abs(got - want) <= tol; ok ? pass++ : fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}  (got ${num(got)}, want ~${num(want)})`); }
function assert(name, cond, extra) { cond ? pass++ : fail++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  — ' + extra : ''}`); }
function num(x) { return Number.isFinite(x) ? x.toPrecision(5) : String(x); }

function rngFactory(seed) {
  let s = seed >>> 0, spare = null;
  const u = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return (mu, sd) => { if (spare !== null) { const v = spare; spare = null; return mu + sd * v; } let u1 = 0; while (u1 === 0) u1 = u(); const u2 = u(); const mag = Math.sqrt(-2 * Math.log(u1)); spare = mag * Math.sin(2 * Math.PI * u2); return mu + sd * (mag * Math.cos(2 * Math.PI * u2)); };
}
function buildBalanced(seed, nGroups, perGroup, treatEffect, tau, sigma) {
  const y = [], treat = [], groups = [], norm = rngFactory(seed);
  for (let g = 0; g < nGroups; g++) { const t = g < nGroups / 2 ? 0 : 1; const b = norm(0, tau); for (let k = 0; k < perGroup; k++) { groups.push(g); treat.push(t); y.push(50 + treatEffect * t + b + norm(0, sigma)); } }
  return { y, treat, groups, nGroups };
}

console.log('\nLMM random-intercept == cluster-means t-test (balanced):');
{
  const { y, treat, groups, nGroups } = buildBalanced(7, 10, 6, 4, 6, 5);
  const lmm = LMM.fit(y, [treat], groups);
  const means = [], tr = [];
  for (let g = 0; g < nGroups; g++) { const idx = groups.map((v, i) => (v === g ? i : -1)).filter((i) => i >= 0); means.push(S.mean(idx.map((i) => y[i]))); tr.push(treat[idx[0]]); }
  const cm = S.tTestIndependent(means.filter((_, i) => tr[i] === 0), means.filter((_, i) => tr[i] === 1), false);
  approx('df == #clusters - 2', lmm.df, nGroups - 2, 1e-6);
  approx('LMM |t| ~ cluster-means |t|', Math.abs(lmm.t), Math.abs(cm.t), 2e-2);
  approx('LMM p ~ cluster-means p', lmm.p, cm.p, 5e-3);
}

console.log('\nPseudoreplication inflates significance (OLS p < LMM p):');
{
  const { y, treat, groups } = buildBalanced(7, 10, 6, 4, 6, 5);
  const lmm = LMM.fit(y, [treat], groups);
  const ols = S.tTestIndependent(y.filter((_, i) => treat[i] === 0), y.filter((_, i) => treat[i] === 1), false);
  assert('OLS p < LMM p (anticonservative)', ols.p < lmm.p, `OLS=${ols.p.toExponential(2)}, LMM=${lmm.p.toFixed(4)}`);
}

console.log('\nVariance-component recovery (loose):');
{
  const { y, treat, groups } = buildBalanced(7, 40, 5, 0, 8, 4);
  const lmm = LMM.fit(y, [treat], groups);
  assert('recovered tau ~8', Math.sqrt(lmm.varComps.g00) > 4 && Math.sqrt(lmm.varComps.g00) < 14);
  assert('recovered sigma ~4', Math.sqrt(lmm.varComps.sigma2) > 2.5 && Math.sqrt(lmm.varComps.sigma2) < 5.5);
}

console.log('\nRandom-slope model: dropping the slope is anticonservative:');
{
  const norm = rngFactory(21);
  const y = [], treat = [], groups = [], time = [];
  for (let s = 0; s < 16; s++) { const t = s < 8 ? 0 : 1; const b0 = norm(0, 5), b1 = norm(0, 3); for (let k = 0; k < 5; k++) { groups.push(s); treat.push(t); time.push(k); y.push(50 + 1.2 * t + (0.6 + b1) * k + b0 + norm(0, 3)); } }
  const maximal = LMM.fit(y, [time, treat], groups, { randomSlope: time, testCol: 0 });
  const interceptOnly = LMM.fit(y, [time, treat], groups, { testCol: 0 });
  assert('maximal model fits (finite SE)', Number.isFinite(maximal.se) && maximal.se > 0);
  assert('maximal SE > intercept-only SE for time', maximal.se > interceptOnly.se);
  assert('intercept-only p < maximal p (the abuse)', interceptOnly.p < maximal.p, `intOnly=${interceptOnly.p.toFixed(4)}, maximal=${maximal.p.toFixed(4)}`);
}

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
