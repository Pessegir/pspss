/*
 * Tests for the seeded PRNG. Run: node src/rng.test.js
 *
 * Every level's data is a deterministic function of its pinned seed, so the
 * generator itself is load-bearing: an accidental change to mulberry32 or the
 * Box-Muller path would silently retune every puzzle. The sequence pins below
 * freeze the current stream; the moment tests are distribution sanity checks.
 */
const { RNG, mulberry32 } = require('./rng');

let passed = 0, failed = 0;
function assert(name, cond, extra) { cond ? passed++ : failed++; console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${extra ? '  (' + extra + ')' : ''}`); }
function approx(name, got, want, tol) { assert(name, Math.abs(got - want) <= tol, `got ${got.toPrecision(6)}, want ~${want}`); }

console.log('\nSequence pins (seed 42 — changing these retunes every level):');
{
  const m = mulberry32(42);
  const want = [0.6011037519, 0.4482905590, 0.8524657935, 0.6697340414];
  want.forEach((w, i) => approx(`mulberry32(42) draw ${i + 1}`, m(), w, 1e-9));
  const r = RNG(42);
  const wantN = [-0.9561622294, 0.3220702493, -0.2730261049];
  wantN.forEach((w, i) => approx(`RNG(42).normal() draw ${i + 1}`, r.normal(), w, 1e-9));
}

console.log('\nDeterminism:');
{
  const a = RNG(1234), b = RNG(1234), c = RNG(1235);
  const sa = [a.next(), a.next(), a.next()];
  const sb = [b.next(), b.next(), b.next()];
  const sc = [c.next(), c.next(), c.next()];
  assert('same seed ⇒ identical stream', sa.every((v, i) => v === sb[i]));
  assert('different seed ⇒ different stream', sa.some((v, i) => v !== sc[i]));
}

console.log('\nBox-Muller spare cache:');
{
  // One normal() consumes exactly two uniforms and caches the sine spare, so
  // after one OR two normals the underlying stream sits at the same position.
  const m = mulberry32(7);
  m(); m();
  const third = m();
  const r1 = RNG(7);
  r1.normal();
  assert('normal() consumes exactly 2 uniforms', r1.next() === third);
  const r2 = RNG(7);
  r2.normal(); r2.normal(); // second draw comes from the spare, consumes nothing
  assert('2nd normal() uses the cached spare', r2.next() === third);
  // mu/sigma is a pure affine transform of the same standard draw
  const z = RNG(9).normal();
  approx('normal(mu,sigma) = mu + sigma·z', RNG(9).normal(10, 2), 10 + 2 * z, 1e-12);
}

console.log('\nDistribution sanity (n = 20000):');
{
  const r = RNG(2026);
  const n = 20000;
  let s = 0, s2 = 0, lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { const v = r.normal(); s += v; s2 += v * v; }
  const meanN = s / n, sdN = Math.sqrt(s2 / n - meanN * meanN);
  approx('normal mean ~ 0', meanN, 0, 0.03);
  approx('normal sd ~ 1', sdN, 1, 0.03);
  const u = RNG(99);
  let su = 0;
  for (let i = 0; i < n; i++) { const v = u.next(); su += v; lo = Math.min(lo, v); hi = Math.max(hi, v); }
  approx('uniform mean ~ 0.5', su / n, 0.5, 0.01);
  assert('uniform stays in [0,1)', lo >= 0 && hi < 1);
}

console.log('\nint / uniform / pick:');
{
  const r = RNG(5);
  const seen = new Set();
  let inBounds = true;
  for (let i = 0; i < 2000; i++) { const v = r.int(1, 6); seen.add(v); if (v < 1 || v > 6 || v !== Math.floor(v)) inBounds = false; }
  assert('int(1,6) is an integer in bounds', inBounds);
  assert('int(1,6) hits every face', [1, 2, 3, 4, 5, 6].every((v) => seen.has(v)));
  let uniOk = true;
  for (let i = 0; i < 1000; i++) { const v = r.uniform(10, 20); if (v < 10 || v >= 20) uniOk = false; }
  assert('uniform(10,20) stays in [10,20)', uniOk);
  const arr = ['a', 'b', 'c'];
  let pickOk = true;
  for (let i = 0; i < 200; i++) if (arr.indexOf(r.pick(arr)) === -1) pickOk = false;
  assert('pick() returns array members', pickOk);
}

console.log(`\n${passed} passed, ${failed} failed.`);
process.exit(failed ? 1 : 0);
