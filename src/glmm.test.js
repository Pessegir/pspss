/*
 * GLMM engine validation. Per the project's "stats are real" rule, every claim is
 * pinned to a trusted reference:
 *   - exact saturated-model anchors (logistic slope == log odds ratio; Poisson
 *     slope == log rate ratio) for the GLM link/likelihood machinery;
 *   - the canonical lme4 `cbpp` glmer Laplace fit for the random-intercept GLMM;
 *   - the OLRE-inflates-SE property for overdispersion.
 */
'use strict';

const glmm = require('./glmm');

let failed = 0;
function ok(name, cond, extra) {
  console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  (' + extra + ')' : ''));
  if (!cond) failed++;
}
function close(a, b, tol) { return Math.abs(a - b) <= tol; }

// --- 1. Exact logistic anchor: slope == log odds ratio (saturated 2-point fit) ---
// group x=0: 10/20 (odds 1, logit 0); x=1: 15/20 (odds 3). slope = log 3.
{
  const r = glmm.glm([10, 15], [[0, 1]], { family: 'binomial', trials: [20, 20] });
  ok('logistic intercept == logit(0.5) == 0', close(r.betas[0], 0, 1e-4), 'b0=' + r.betas[0].toFixed(4));
  ok('logistic slope == log(3) (odds ratio)', close(r.betas[1], Math.log(3), 1e-4), 'b1=' + r.betas[1].toFixed(4));
}

// --- 2. Exact Poisson anchor: slope == log rate ratio (saturated 2-point fit) ---
// counts 4 and 12, one obs each. intercept = log 4, slope = log(12/4) = log 3.
{
  const r = glmm.glm([4, 12], [[0, 1]], { family: 'poisson' });
  ok('poisson intercept == log(4)', close(r.betas[0], Math.log(4), 1e-4), 'b0=' + r.betas[0].toFixed(4));
  ok('poisson slope == log(3) (rate ratio)', close(r.betas[1], Math.log(3), 1e-4), 'b1=' + r.betas[1].toFixed(4));
}

// --- 3. lme4 cbpp glmer anchor (binomial, random intercept by herd) ---------
// glmer(cbind(incidence, size-incidence) ~ period + (1|herd), binomial, cbpp)
// Laplace (nAGQ=1) reference:
//   (Intercept) -1.398, period2 -0.992, period3 -1.129, period4 -1.580;
//   herd SD 0.642.
{
  // herd, incidence, size, period
  const cbpp = [
    [1,2,14,1],[1,3,12,2],[1,4,9,3],[1,0,5,4],[2,3,22,1],[2,1,18,2],[2,1,21,3],
    [3,8,22,1],[3,2,16,2],[3,0,16,3],[3,2,20,4],[4,2,10,1],[4,0,10,2],[4,2,9,3],
    [4,0,6,4],[5,5,18,1],[5,0,25,2],[5,0,24,3],[5,1,4,4],[6,3,17,1],[6,0,17,2],
    [6,0,18,3],[6,1,20,4],[7,8,16,1],[7,1,10,2],[7,3,9,3],[7,0,5,4],[8,12,34,1],
    [9,2,9,1],[9,0,6,2],[9,0,8,3],[9,0,6,4],[10,1,22,1],[10,1,22,2],[10,0,18,3],
    [10,2,22,4],[11,0,25,1],[11,5,27,2],[11,3,22,3],[11,1,22,4],[12,2,10,1],
    [12,1,8,2],[12,0,6,3],[12,0,5,4],[13,1,21,1],[13,2,24,2],[13,0,19,3],[13,0,23,4],
    [14,11,19,1],[14,0,2,2],[14,0,3,3],[14,0,2,4],[15,1,19,1],[15,1,15,2],
    [15,1,15,3],[15,0,15,4],
  ];
  const herd = cbpp.map((r) => r[0]);
  const y = cbpp.map((r) => r[1]);
  const size = cbpp.map((r) => r[2]);
  const period = cbpp.map((r) => r[3]);
  const p2 = period.map((v) => (v === 2 ? 1 : 0));
  const p3 = period.map((v) => (v === 3 ? 1 : 0));
  const p4 = period.map((v) => (v === 4 ? 1 : 0));

  const f = glmm.fit(y, [p2, p3, p4], herd, { family: 'binomial', trials: size });
  ok('cbpp intercept ~ -1.398', close(f.betas[0], -1.398, 0.06), 'b0=' + f.betas[0].toFixed(3));
  ok('cbpp period2 ~ -0.992', close(f.betas[1], -0.992, 0.06), 'p2=' + f.betas[1].toFixed(3));
  ok('cbpp period3 ~ -1.129', close(f.betas[2], -1.129, 0.06), 'p3=' + f.betas[2].toFixed(3));
  ok('cbpp period4 ~ -1.580', close(f.betas[3], -1.580, 0.07), 'p4=' + f.betas[3].toFixed(3));
  ok('cbpp herd SD ~ 0.642', close(f.varComps.groupSD, 0.642, 0.06), 'sd=' + f.varComps.groupSD.toFixed(3));
  // intercept SE ~ 0.231 (looser tolerance for the hand-rolled covariance)
  ok('cbpp intercept SE ~ 0.231', close(f.ses[0], 0.231, 0.05), 'se0=' + f.ses[0].toFixed(3));
}

// --- 4. OLRE inflates the SE of a within-cluster effect on overdispersed counts ---
// Unmodelled observation-level overdispersion makes a Poisson GLMM's fixed-effect
// SEs too small; an observation-level random effect (OLRE) restores them. The
// tested effect is a WITHIN-subject covariate, whose SE the residual overdispersion
// drives (a between-subject effect's SE is set by the subject intercept instead).
{
  let s = 12345;
  const rnd = () => { s = (1103515245 * s + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const yArr = [], xArr = [], subj = [];
  let sid = 0;
  for (let a = 0; a < 10; a++) {
    const re = (rnd() - 0.5) * 1.0; // subject random intercept
    for (let c = 0; c < 6; c++) {
      const x = rnd() - 0.5; // observation-level covariate (varies within subject)
      const lam = Math.exp(1.2 + 0.1 * x + re + (rnd() - 0.5) * 2.0); // heavy overdispersion
      let k = 0, L = Math.exp(-lam), pr = 1;
      do { k++; pr *= rnd(); } while (pr > L);
      yArr.push(k - 1); xArr.push(x); subj.push(sid);
    }
    sid++;
  }
  const plain = glmm.fit(yArr, [xArr], subj, { family: 'poisson' });
  const olre = glmm.fit(yArr, [xArr], subj, { family: 'poisson', olre: true });
  ok('OLRE inflates within-effect SE vs plain Poisson', olre.se > plain.se * 1.1,
    'plain=' + plain.se.toFixed(3) + ' olre=' + olre.se.toFixed(3));
  ok('OLRE variance is positive', olre.varComps.olreSD > 0.1, 'olreSD=' + olre.varComps.olreSD.toFixed(3));
}

console.log(failed === 0 ? '\nAll GLMM tests passed.' : '\n' + failed + ' GLMM test(s) failed.');
process.exit(failed === 0 ? 0 : 1);
