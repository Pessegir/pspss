/*
 * Tests the BUILT index.html exactly as a browser runs it: the inlined script
 * with `require` undefined, all modules wiring through a shared global. Exercises
 * the global-assignment code path ui.smoke.js does not. Run: node src/bundle.smoke.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const check = (n, c, e) => { if (c) { pass++; console.log('  ok   ' + n); } else { fail++; console.error('  FAIL ' + n + (e ? ' — ' + e : '')); } };

function matches(node, sel) { return (sel.match(/[#.]?[\w-]+/g) || []).every((t) => t[0] === '#' ? node.id === t.slice(1) : t[0] === '.' ? node._cls.has(t.slice(1)) : (node.tagName || '').toLowerCase() === t.toLowerCase()); }
function walk(node, sel, all, acc) { for (const c of node.children) { if (matches(c, sel)) { if (all) acc.push(c); else return c; } const r = walk(c, sel, all, acc); if (!all && r) return r; } return all ? acc : null; }
class N {
  constructor(tag) { this.tagName = tag; this.children = []; this.parentElement = null; this._cls = new Set(); this.attrs = {}; this.style = {}; this._listeners = {}; this._text = ''; this._html = ''; this.value = ''; this.checked = false; this.scrollTop = 0; this.id = ''; }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); } get className() { return [...this._cls].join(' '); }
  get classList() { const s = this._cls; return { add: (c) => s.add(c), remove: (c) => s.delete(c), contains: (c) => s.has(c) }; }
  set textContent(v) { this._text = String(v); this.children = []; } get textContent() { return this._text || this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this._html = String(v); this.children = []; } get innerHTML() { return this._html; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; if (k === 'class') this.className = v; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; } removeChild(c) { this.children = this.children.filter((x) => x !== c); } remove() { if (this.parentElement) this.parentElement.removeChild(this); }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); } fire(t, ev) { (this._listeners[t] || []).slice().forEach((fn) => fn(ev || ev0(this))); } click() { this.fire('click', ev0(this)); }
  querySelector(sel) { return walk(this, sel, false); } querySelectorAll(sel) { return walk(this, sel, true, []); }
}
const ev0 = (t) => ({ target: t, stopPropagation() {}, preventDefault() {} });

const body = new N('body');
const app = new N('div'); app.setAttribute('id', 'app');
const modalRoot = new N('div'); modalRoot.setAttribute('id', 'modal-root');
body.appendChild(app); body.appendChild(modalRoot);
const document = { body, _l: {}, createElement: (t) => new N(t), createElementNS: (ns, t) => new N(t), createTextNode: (t) => { const n = new N('#text'); n._text = t; return n; }, addEventListener(t, fn) { (this._l[t] = this._l[t] || []).push(fn); }, fire(t) { (this._l[t] || []).forEach((fn) => fn(ev0(document))); }, querySelector: (s) => (matches(body, s) ? body : walk(body, s, false)), querySelectorAll: (s) => walk(body, s, true, []) };
const store = {};
const localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };

const sandbox = { document, localStorage, console, Math, JSON, Date, setTimeout: (fn) => fn, Buffer, parseInt, parseFloat, isNaN, String, Number, Object, Array, Boolean, Error };
sandbox.self = sandbox; sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const ALL = ['outlier', 'skew', 'confound', 'optional-stopping', 'subgroup', 'multiverse', 'wrong-direction', 'honest-null', 'pseudoreplication', 'wrong-test', 'random-slopes', 'two-kinds', 'collider', 'simpson', 'spec-curve', 'outcome-switch', 'honest-lmm'];
store['pspss_progress'] = JSON.stringify(ALL.reduce((o, id) => ((o[id] = { done: true, stars: 3 }), o), {}));

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
check('require is undefined in sandbox (browser-like)', typeof sandbox.require === 'undefined');
vm.runInContext(script, sandbox, { filename: 'index.html#script' });

check('global: Stats', typeof sandbox.Stats === 'object');
check('global: PSPSS_lmm', typeof sandbox.PSPSS_lmm === 'object');
check('global: PSPSS_bayes', typeof sandbox.PSPSS_bayes === 'object');
check('global: PSPSS_charts', typeof sandbox.PSPSS_charts === 'object');
check('global: PSPSS_campaigns', !!(sandbox.PSPSS_campaigns && sandbox.PSPSS_campaigns.CAMPAIGNS));
check('C2 levels registered', sandbox.PSPSS_levels.LEVELS.some((l) => l.id === 'pseudoreplication'));
check('C3 levels registered', sandbox.PSPSS_levels.LEVELS.some((l) => l.id === 'pick-a-prior'));

const q = (s) => document.querySelectorAll(s);
const byText = (s, t) => q(s).filter((n) => n.textContent.includes(t))[0];
document.fire('DOMContentLoaded');
check('app booted from bundle', app.textContent.includes('PSPSS'));

byText('.levelcard', 'The One Bad Apple').fire('click');
byText('button', 'Begin Analysis').fire('click');
const before = document.querySelector('#stat-p')._cls.has('sig');
byText('.item', 'Refine Sample').fire('click');
check('C1 not significant before, significant after', !before && document.querySelector('#stat-p')._cls.has('sig'));
check('win modal from bundle', modalRoot.textContent.includes('Significance Secured') || modalRoot.textContent.includes('ACCEPT'));
check('effect size rendered in output', q('.out-effect').length > 0);

// debrief (the lesson)
byText('button', 'What really happened').fire('click');
check('debrief opens from bundle', modalRoot.textContent.includes('Debrief') && q('.reveal').length > 0);
byText('button', 'Campaign Map').fire('click');

byText('.levelcard', 'Count Every Mouse Twice').fire('click');
byText('button', 'Begin Analysis').fire('click');
check('C2 full menu (>=4 move options)', q('.item').filter((n) => /move/.test(n.textContent)).length >= 4);
check('C2 not significant under default', !document.querySelector('#stat-p')._cls.has('sig'));
byText('.item', 'Choose Statistical Test').fire('click');
byText('button', 't-test on all cells').fire('click');
check('C2 solved via wrong test (bundle)', document.querySelector('#stat-p')._cls.has('sig'));
byText('button', 'Skip to Map').fire('click');

// house rule banner
byText('.levelcard', 'The Registered Primary Outcome').fire('click');
check('HOUSE RULE banner from bundle', q('.house-rule').length > 0);
byText('.item', 'Exit to Campaign').fire('click');

byText('.levelcard', 'Pick a Prior').fire('click');
byText('button', 'Begin Analysis').fire('click');
check('C3 stat strip shows BF', document.querySelector('#stat-p').textContent.includes('BF'));
byText('.item', 'Set Prior Width').fire('click');
byText('button', 'Ultranarrow').fire('click');
check('C3 solved via prior-hacking (bundle)', document.querySelector('#stat-p')._cls.has('sig'));
byText('button', 'Skip to Map').fire('click');

// new screens render from the bundle
byText('button', 'Methods Codex').fire('click');
check('Codex renders cards', q('.codex-card').length >= 5);
byText('button', 'Close').fire('click');
byText('button', 'Spot the QRP').fire('click');
check('Quiz renders a scenario', q('.quiz-scenario').length > 0);
byText('button', 'Quit').fire('click');
byText('button', 'Career Dashboard').fire('click');
check('Dashboard renders', q('.dash-grid').length > 0);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
