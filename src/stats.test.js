/*
 * Self-tests for the stats engine. Run: node src/stats.test.js
 * Reference values are hand-derivable or anchored to known constants.
 */
const S = require('./stats');

let passed = 0, failed = 0;
function approx(name, got, want, tol) {
  tol = tol === undefined ? 1e-3 : tol;
  const ok = Math.abs(got - want) <= tol;
  ok ? passed++ : failed++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}  (got ${fmt(got)}, want ~${fmt(want)})`);
}
function assert(name, cond) { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); }
function fmt(x) { return Number.isFinite(x) ? x.toPrecision(6) : String(x); }

console.log('\nDistribution CDFs:');
approx('normalCDF(0)', S.normalCDF(0), 0.5);
approx('normalCDF(1.96)', S.normalCDF(1.96), 0.975, 2e-3);
approx('normalCDF(-1.96)', S.normalCDF(-1.96), 0.025, 2e-3);
approx('normalTwoTailedP(1.96)', S.normalTwoTailedP(1.96), 0.05, 4e-3);
approx('tDistTwoTailedP(1.96, 1e7)', S.tDistTwoTailedP(1.96, 1e7), 0.05, 4e-3);
approx('tDistTwoTailedP(5, 8)', S.tDistTwoTailedP(5, 8), 0.001053, 1e-4);
approx('tDistTwoTailedP(2.262, 9)', S.tDistTwoTailedP(2.262, 9), 0.05, 2e-3);

console.log('\nDescriptives:');
approx('mean', S.mean([1, 2, 3, 4, 5]), 3);
approx('variance (n-1)', S.variance([1, 2, 3, 4, 5]), 2.5);
approx('sd', S.sd([1, 2, 3, 4, 5]), Math.sqrt(2.5));
const d = S.describe([1, 2, 3, 4, 5, 6, 7, 8, 9]);
approx('median', d.median, 5); approx('q1', d.q1, 3); approx('q3', d.q3, 7);

console.log('\nIndependent t-test (Student):');
const A = [1, 2, 3, 4, 5], B = [6, 7, 8, 9, 10];
const stt = S.tTestIndependent(A, B, false);
approx('t', stt.t, -5); approx('df', stt.df, 8); approx('p', stt.p, 0.001053, 1e-4);

console.log('\nIndependent t-test (Welch):');
const wtt = S.tTestIndependent(A, B, true);
approx('t', wtt.t, -5); approx('df', wtt.df, 8, 1e-6); approx('p', wtt.p, 0.001053, 1e-4);
const wtt2 = S.tTestIndependent([1, 2, 3, 4, 5], [1, 3, 5, 7, 30], true);
approx('welch unequal t', wtt2.t, -1.1605, 5e-3);
approx('welch unequal df', wtt2.df, 4.143, 5e-2);
approx('welch unequal p', wtt2.p, 0.30830, 5e-3);

console.log('\nPaired t-test:');
const pt = S.tTestPaired([2, 3, 4, 5, 6], [1, 2, 3, 4, 5]);
approx('meanDiff', pt.meanDiff, 1);
const pt2 = S.tTestPaired([1, 2, 3, 4, 5], [2, 4, 3, 7, 6]);
approx('paired t', pt2.t, -2.7456, 5e-3); approx('paired p', pt2.p, 0.05161, 5e-3);

console.log('\nMann-Whitney U:');
const mw = S.mannWhitneyU([1, 2, 3, 4], [5, 6, 7, 8]);
approx('U', mw.U, 0); assert('p < 0.05 for full separation', mw.p < 0.05);
const mw2 = S.mannWhitneyU([1, 2, 3, 4], [1, 2, 3, 4]);
assert('p ~ 1 (>0.8) for identical groups', mw2.p > 0.8);

console.log('\nWilcoxon signed-rank:');
const wsr = S.wilcoxonSignedRank([10, 12, 14, 16, 18], [1, 2, 3, 4, 5]);
assert('W = 0 for all-positive diffs', wsr.W === 0);
assert('p < 0.1 for consistent diffs', wsr.p < 0.1);

console.log('\nPearson correlation:');
const pc = S.pearson([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
approx('r perfect', pc.r, 1);
const pc2 = S.pearson([1, 2, 3, 4, 5], [2, 1, 4, 3, 6]);
approx('r', pc2.r, 0.82199, 1e-5); approx('p', pc2.p, 0.08771, 5e-3);

console.log('\nANCOVA (OLS):');
const cov = [], grp = [], y = [];
for (let i = 0; i < 20; i++) { cov.push(i); grp.push(i % 2); y.push(2 * i + (i % 2) * 5); }
const an = S.ancova(y, grp, cov);
approx('ancova adjusted effect ~ 5', an.effect, 5, 1e-6);
assert('ancova effect highly significant', an.p < 1e-6);
const g0 = y.filter((_, i) => grp[i] === 0), g1 = y.filter((_, i) => grp[i] === 1);
assert('raw effect not significant (covariate masks it)', S.tTestIndependent(g0, g1, true).p > 0.05);
const olsRes = S.ols([7, 10, 13, 16, 19], [[0, 1, 2, 3, 4]]);
approx('ols intercept', olsRes.beta[0], 7, 1e-6); approx('ols slope', olsRes.beta[1], 3, 1e-6);

// 2SLS, just-identified: the IV estimate equals the Wald ratio cov(z,y)/cov(z,x).
{
  const z = [0, 1, 0, 1, 0, 1, 0, 1, 1, 0];
  const x = [2.0, 3.1, 1.7, 4.2, 2.3, 3.6, 1.9, 4.8, 3.9, 2.1]; // endogenous
  const y = [5.1, 7.0, 4.4, 9.1, 5.5, 7.9, 4.0, 9.8, 8.3, 4.9];
  const cov = (a, b) => { const ma = S.mean(a), mb = S.mean(b); let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - ma) * (b[i] - mb); return s / (a.length - 1); };
  const wald = cov(z, y) / cov(z, x);
  const iv = S.tsls(y, x, [z]);
  approx('2SLS == Wald ratio cov(z,y)/cov(z,x)', iv.effect, wald, 1e-6);
  assert('2SLS returns a finite SE', Number.isFinite(iv.se) && iv.se > 0);
}

console.log('\nEffect size & confidence intervals:');
// d: groups offset by exactly 1 pooled SD -> d = 1
approx('cohenD ~ 1', S.cohenD([1, 2, 3, 4, 5], [1, 2, 3, 4, 5].map((x) => x + Math.sqrt(2.5))), 1, 1e-6);
approx('cohenD sign (b>a positive)', Math.sign(S.cohenD([1, 2, 3], [10, 11, 12])), 1);
// tCritical round-trips through the two-tailed p
approx('tCritical(9,0.95) ~ 2.262', S.tCritical(9, 0.95), 2.262, 5e-3);
approx('tCritical(inf,0.95) ~ 1.96', S.tCritical(1e7, 0.95), 1.96, 5e-3);
approx('tCritical round-trips p', S.tDistTwoTailedP(S.tCritical(20, 0.95), 20), 0.05, 1e-4);
// CI brackets the true difference (+5) on clean data
const ci = S.meanDiffCI([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
approx('meanDiffCI diff', ci.diff, 5);
assert('meanDiffCI brackets the difference', ci.lo < 5 && ci.hi > 5);
// near-null data: CI should span zero
const ciNull = S.meanDiffCI([4, 5, 6, 5, 4, 6], [5, 4, 6, 5, 6, 4]);
assert('near-null CI spans zero', ciNull.lo < 0 && ciNull.hi > 0);

console.log('\nOpen-science antidotes:');
// probit round-trips the normal CDF
approx('probit(0.975) ~ 1.96', S.probit(0.975), 1.96, 2e-3);
approx('probit round-trips normalCDF', S.normalCDF(S.probit(0.83)), 0.83, 1e-3);
// required N per group (Cohen): d=0.5, alpha=.05, power=.8 -> ~63-64/group
approx('requiredN d=0.5 ~ 63', S.requiredN(0.5, 0.05, 0.8), 63, 2);
assert('requiredN grows as d shrinks', S.requiredN(0.2, 0.05, 0.8) > S.requiredN(0.8, 0.05, 0.8));
// Bonferroni & BH
const adjB = S.adjustP([0.01, 0.02, 0.04], 'bonferroni');
approx('bonferroni 0.01*3', adjB[0], 0.03, 1e-9);
assert('bonferroni caps at 1', S.adjustP([0.5, 0.6], 'bonferroni').every((p) => p <= 1));
const bh = S.adjustP([0.001, 0.01, 0.02, 0.5], 'bh');
assert('BH is monotone & <= 1', bh.every((p) => p <= 1) && bh[3] >= bh[0]);
assert('BH less conservative than Bonferroni', S.adjustP([0.01, 0.02, 0.03], 'bh')[0] <= S.adjustP([0.01, 0.02, 0.03], 'bonferroni')[0]);
// TOST: tight null around 0 is equivalent within a generous bound; a real effect is not
const tightA = [9, 10, 11, 10, 9, 11, 10, 10, 9, 11], tightB = [10, 11, 9, 10, 10, 11, 9, 10, 11, 10];
assert('TOST: tight null is equivalent (bound 3)', S.tost(tightA, tightB, 3).equivalent);
assert('TOST: real 5-unit effect is NOT equivalent (bound 2)', !S.tost([1, 2, 3, 4, 5], [6, 7, 8, 9, 10], 2).equivalent);

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
