/*
 * Headless smoke test for ui.js via a minimal DOM shim. Drives the real ui.js
 * (Node/require path) through Campaigns 1, 2 and 3. Run: node src/ui.smoke.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function check(name, cond, extra) { if (cond) { pass++; console.log(`  ok   ${name}`); } else { fail++; console.error(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); } }

function matches(node, sel) {
  return (sel.match(/[#.]?[\w-]+/g) || []).every((t) => t[0] === '#' ? node.id === t.slice(1) : t[0] === '.' ? node._cls.has(t.slice(1)) : (node.tagName || '').toLowerCase() === t.toLowerCase());
}
function walk(node, sel, all, acc) { for (const c of node.children) { if (matches(c, sel)) { if (all) acc.push(c); else return c; } const r = walk(c, sel, all, acc); if (!all && r) return r; } return all ? acc : null; }
class N {
  constructor(tag) { this.tagName = tag; this.children = []; this.parentElement = null; this._cls = new Set(); this.attrs = {}; this.style = {}; this._listeners = {}; this._text = ''; this._html = ''; this.value = ''; this.checked = false; this.scrollTop = 0; this.id = ''; }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._cls].join(' '); }
  get classList() { const s = this._cls; return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) }; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text || this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; if (k === 'class') this.className = v; }
  getAttribute(k) { return this.attrs[k]; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); }
  remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  fire(t, ev) { (this._listeners[t] || []).slice().forEach((fn) => fn(ev || mkEv(this))); }
  click() { this.fire('click', mkEv(this)); }
  querySelector(sel) { return walk(this, sel, false); }
  querySelectorAll(sel) { return walk(this, sel, true, []); }
}
function mkEv(target) { return { target, stopPropagation() {}, preventDefault() {} }; }

const docBody = new N('body');
const appNode = new N('div'); appNode.setAttribute('id', 'app');
const modalRoot = new N('div'); modalRoot.setAttribute('id', 'modal-root');
docBody.appendChild(appNode); docBody.appendChild(modalRoot);
const document = {
  body: docBody, _listeners: {},
  createElement: (t) => new N(t),
  createElementNS: (ns, t) => new N(t),
  createTextNode: (t) => { const n = new N('#text'); n._text = t; return n; },
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
  fire(t) { (this._listeners[t] || []).forEach((fn) => fn(mkEv(document))); },
  querySelector: (sel) => (matches(docBody, sel) ? docBody : walk(docBody, sel, false)),
  querySelectorAll: (sel) => walk(docBody, sel, true, []),
};
const store = {};
global.window = global; global.document = document;
global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };

const ALL = ['outlier', 'skew', 'confound', 'optional-stopping', 'subgroup', 'multiverse', 'wrong-direction', 'honest-null', 'pseudoreplication', 'wrong-test', 'random-slopes', 'two-kinds', 'collider', 'simpson', 'spec-curve', 'outcome-switch', 'honest-lmm'];
store['pspss_progress'] = JSON.stringify(ALL.reduce((o, id) => ((o[id] = { done: true, stars: 3 }), o), {}));

global.Stats = require('./stats');
global.PSPSS_lmm = require('./lmm');
global.PSPSS_bayes = require('./bayes');
global.PSPSS_rng = require('./rng');
global.RNG = global.PSPSS_rng.RNG;
global.PSPSS_levels = require('./levels');
require('./levels.c2');
require('./levels.c3');
global.PSPSS_campaigns = require('./campaigns');
global.PSPSS_engine = require('./engine');
global.PSPSS_charts = require('./charts');
global.PSPSS_knowledge = require('./knowledge');
global.PSPSS_content = require('./content');

vm.runInThisContext(fs.readFileSync(path.join(__dirname, 'ui.js'), 'utf8'), { filename: 'ui.js' });

const q = (s) => document.querySelectorAll(s);
function clickItem(label) { const it = q('.item').filter((n) => n.textContent.includes(label))[0]; if (!it) throw new Error('item not found: ' + label); it.fire('click'); }
function clickBtn(t) { const b = q('button').filter((n) => n.textContent.includes(t))[0]; if (!b) throw new Error('button not found: ' + t); b.fire('click'); }
function modalText() { return modalRoot.textContent; }
function pIsSig() { const p = document.querySelector('#stat-p'); return p && p._cls.has('sig'); }
function card(t) { return q('.levelcard').filter((n) => n.textContent.includes(t))[0]; }

console.log('\nBoot:');
document.fire('DOMContentLoaded');
check('start screen rendered', appNode.textContent.includes('PSPSS'));
check('campaign 1 listed', appNode.textContent.includes('The One Bad Apple'));

console.log('\nC1 — The Outlier via Refine Sample:');
card('The One Bad Apple').fire('click');
check('briefing shown', modalText().includes('Begin Analysis') && modalText().includes('The One Bad Apple'));
clickBtn('Begin Analysis');
check('p not yet significant', !pIsSig());
clickItem('Refine Sample');
check('outlier solved', pIsSig());
check('win modal', modalText().includes('Significance Secured') || modalText().includes('ACCEPT'));
check('effect size + CI shown in output', q('.out-effect').length > 0);

console.log('\nDebrief: the truth reveal:');
clickBtn('What really happened');
check('debrief opens', modalText().includes('Debrief'));
check('debrief shows a truth reveal panel', q('.reveal').length > 0);
check('debrief cites a method', modalText().includes('Codex') || /20\d\d/.test(modalText()));
clickBtn('Campaign Map');

console.log('\nC2 — full menu, must pick the right analysis (Count Every Mouse Twice):');
check('campaign 2 listed', appNode.textContent.includes('Campaign 2 — The Methods Section'));
card('Count Every Mouse Twice').fire('click');
clickBtn('Begin Analysis');
check('clustered data view', document.querySelector('#data-view').textContent.includes('Subject'));
check('several analysis options offered', q('.item').filter((n) => /move/.test(n.textContent)).length >= 4);
check('not significant under default LMM', !pIsSig());
clickItem('Boxplot by Group');
check('chart diagnostic rendered an <svg>', q('svg').length > 0);
clickItem('Choose Statistical Test');
check('test chooser shown', modalText().includes('t-test on all cells'));
clickBtn('t-test on all cells');
check('solved via the (wrong) pooled test', pIsSig());
clickBtn('Skip to Map');

console.log('\nHouse rule (outcome-switch demands p < .001):');
card('The Registered Primary Outcome').fire('click');
check('HOUSE RULE banner shown', q('.house-rule').length > 0);
clickBtn('Begin Analysis');
check('goal shows the strict bar', document.querySelector('#stat-p').textContent.includes('0.001'));
clickItem('Exit to Campaign');

console.log('\nC3 — Bayes factor metric + prior-hacking (Pick a Prior):');
check('campaign 3 listed', appNode.textContent.includes('Campaign 3 — In Bayes We Trust'));
card('Pick a Prior').fire('click');
clickBtn('Begin Analysis');
check('stat strip shows BF (not p)', document.querySelector('#stat-p').textContent.includes('BF'));
check('BF not yet over threshold', !pIsSig());
clickItem('Bayes-Factor Robustness Curve');
check('BF robustness chart rendered', q('svg').length > 0);
clickItem('Set Prior Width');
check('prior chooser shown', modalText().includes('Ultranarrow'));
clickBtn('Ultranarrow');
check('prior-hacked past BF threshold', pIsSig());
clickBtn('Skip to Map');

console.log('\nNew learning/engagement screens:');
clickBtn('Methods Codex');
check('Codex lists real QRPs', modalText().includes('Methods Codex') && q('.codex-card').length >= 5);
clickBtn('Close');
clickBtn('Sandbox Lab');
check('Sandbox opens', modalText().includes('Sandbox Lab'));
const slider = q('input').filter((n) => n.attrs.type === 'range')[0];
check('sandbox has sliders', !!slider);
if (slider) { slider.value = '8'; slider.fire('input'); }
check('sandbox renders a figure + a p-value', q('svg').length > 0 && /p =|BF/.test(modalText()));
clickBtn('Close');
clickBtn('Spot the QRP');
check('quiz opens with a scenario', modalText().includes('Spot the QRP'));
q('input').filter((n) => n.attrs.type === 'checkbox')[0].fire('change'); // tick one
clickBtn("Don't trust");
clickBtn('Submit');
check('quiz gives feedback', q('.reveal').length > 0);
clickBtn('Quit');
clickBtn('Career Dashboard');
check('dashboard shows publications', modalText().includes('Publications'));
check('dashboard tracked our wins', /Publications/.test(modalText()) && JSON.parse(store['pspss_career'] || '{}').publications >= 1);
check('an achievement was unlocked', JSON.parse(store['pspss_ach'] || '[]').length >= 1);
clickBtn('Close');

console.log('\nReviewer 2 backdoor (unlock password):');
q('a').filter((n) => n.textContent.includes('backdoor'))[0].fire('click');
check('backdoor modal opens', modalText().includes('Backdoor'));
let uinp = q('input').filter((n) => n.attrs.type === 'text')[0];
uinp.value = 'definitely not the password'; clickBtn('Unlock');
check('wrong password does NOT unlock', store['pspss_unlock'] !== '1');
uinp.value = 'trending toward significance'; clickBtn('Unlock');
check('correct password unlocks all campaigns', store['pspss_unlock'] === '1');
check('start screen now offers re-lock', q('a').filter((n) => n.textContent.includes('Re-lock')).length > 0);

console.log('\nMode toggle:');
q('.mode-pill')[0].fire('click');
check('mode pill toggled without error', true);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
