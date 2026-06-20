/*
 * Tests the knowledge base is complete & consistent. Run: node src/knowledge.test.js
 */
require('./levels.c2');
require('./levels.c3');
require('./levels.c4');
require('./levels.c5');
const { LEVELS } = require('./levels');
const K = require('./knowledge');
const E = require('./engine');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.error('  FAIL ' + n + (e ? ' — ' + e : '')); } };

console.log('\nEvery level flaw has a Codex/debrief entry:');
const missing = LEVELS.filter((l) => !K.QRP_INFO[l.flaw]).map((l) => l.id + '(' + l.flaw + ')');
check('all flaws covered by QRP_INFO', missing.length === 0, 'missing: ' + missing.join(', '));

console.log('\nEvery QRP_INFO entry is well-formed:');
let bad = [];
Object.keys(K.QRP_INFO).forEach((k) => {
  const e = K.QRP_INFO[k];
  if (!e.term || !e.plain || !e.harm || !e.citation || !e.antidote || !['invalid', 'context', 'honest'].includes(e.verdict)) bad.push(k);
});
check('QRP_INFO entries complete (term/plain/harm/citation/antidote/verdict)', bad.length === 0, 'bad: ' + bad.join(', '));

console.log('\nEvery tool that can be used has a debrief label:');
const toolIds = E.TOOLS.filter((t) => t.kind === 'intervention').map((t) => t.id);
const noLabel = toolIds.filter((id) => !K.TOOL_LABEL[id]);
check('all intervention tools have TOOL_LABEL', noLabel.length === 0, 'missing: ' + noLabel.join(', '));

console.log('\nQuiz items reference known QRPs and have a verdict:');
let qbad = [];
K.QUIZ_ITEMS.forEach((q) => {
  if (typeof q.trust !== 'boolean' || !q.scenario || !q.explain) qbad.push(q.id + ':shape');
  q.qrps.forEach((k) => { if (!K.QRP_INFO[k]) qbad.push(q.id + ':' + k); });
});
check('quiz items well-formed & keys known', qbad.length === 0, 'bad: ' + qbad.join(', '));
check('quiz has a trustworthy item (no QRPs)', K.QUIZ_ITEMS.some((q) => q.qrps.length === 0 && q.trust));
check('quiz options are known QRP keys', K.QUIZ_OPTIONS.every((k) => K.QRP_INFO[k]));

console.log('\nAchievements:');
check('achievement defs well-formed', K.ACHIEVEMENTS.every((a) => a.id && a.title && a.desc && typeof a.check === 'function'));
const career0 = { publications: 0, retractions: 0, honestNulls: 0, cleanWins: 0, p001Wins: 0 };
const won = K.evaluateAchievements({ event: 'win', level: { flaw: 'subgroup' }, stars: 3, suspicion: 0, moves: 1, par: 1, career: Object.assign({}, career0, { publications: 1 }) }, []);
check('winning a subgroup level unlocks salami + first-blood + clean + beat-par', ['salami', 'first-blood', 'clean', 'beat-par'].every((id) => won.includes(id)), won.join(','));
check('already-unlocked are not re-awarded', K.evaluateAchievements({ event: 'honest', level: { flaw: 'honest-null' }, stars: 3, suspicion: 0, moves: 0, par: 0, career: career0 }, ['honest']).indexOf('honest') === -1);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
