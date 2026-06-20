/*
 * PSPSS figures — self-contained SVG renderers for diagnostics.
 *
 * Every function returns an <svg> DOM element. Diagnostics drop these into the
 * Output pane (free moves). The point of Campaign 2 is "read the figure, infer
 * the flaw" — so these show the data honestly without spelling out the answer.
 *
 * Browser only (uses document.createElementNS). window.PSPSS_charts.
 */
(function (root) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const W = 470, H = 250, M = { l: 46, r: 14, t: 26, b: 34 };
  const PAL = ['#3b6ea5', '#b45309', '#15803d', '#7c3aed', '#be123c'];

  function s(tag, attrs, kids) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    (kids || []).forEach((c) => n.appendChild(c));
    return n;
  }
  function txt(x, y, str, attrs) {
    const t = s('text', Object.assign({ x, y, fill: '#33415c', 'font-size': 11, 'font-family': 'Segoe UI, sans-serif' }, attrs));
    t.appendChild(document.createTextNode(str));
    return t;
  }
  function frame(title, xlabel, ylabel) {
    const g = s('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img', 'aria-label': title + (xlabel ? ', x: ' + xlabel : '') + (ylabel ? ', y: ' + ylabel : ''), style: 'background:#fff;border:1px solid #dcd8cb;border-radius:4px' });
    const ttl = s('title'); ttl.appendChild(document.createTextNode(title)); g.appendChild(ttl);
    g.appendChild(txt(W / 2, 16, title, { 'text-anchor': 'middle', 'font-weight': 700, fill: '#111' }));
    // axes
    g.appendChild(s('line', { x1: M.l, y1: H - M.b, x2: W - M.r, y2: H - M.b, stroke: '#444' }));
    g.appendChild(s('line', { x1: M.l, y1: M.t, x2: M.l, y2: H - M.b, stroke: '#444' }));
    if (xlabel) g.appendChild(txt(M.l + (W - M.l - M.r) / 2, H - 6, xlabel, { 'text-anchor': 'middle', fill: '#6b6450' }));
    if (ylabel) {
      const t = txt(14, M.t + (H - M.t - M.b) / 2, ylabel, { 'text-anchor': 'middle', fill: '#6b6450' });
      t.setAttribute('transform', `rotate(-90 14 ${M.t + (H - M.t - M.b) / 2})`);
      g.appendChild(t);
    }
    return g;
  }
  const px = (v, lo, hi) => M.l + ((v - lo) / (hi - lo || 1)) * (W - M.l - M.r);
  const py = (v, lo, hi) => H - M.b - ((v - lo) / (hi - lo || 1)) * (H - M.t - M.b);
  function nice(lo, hi) { const pad = (hi - lo || 1) * 0.08; return [lo - pad, hi + pad]; }
  function ticksY(g, lo, hi) {
    for (let k = 0; k <= 4; k++) {
      const v = lo + (k / 4) * (hi - lo);
      const y = py(v, lo, hi);
      g.appendChild(s('line', { x1: M.l - 3, y1: y, x2: M.l, y2: y, stroke: '#444' }));
      g.appendChild(txt(M.l - 6, y + 3, v.toFixed(0), { 'text-anchor': 'end', fill: '#6b6450', 'font-size': 10 }));
    }
  }

  // ---- histogram -----------------------------------------------------------
  function histogram(values, opts) {
    opts = opts || {};
    const g = frame(opts.title || 'Distribution', opts.xlabel || 'value', 'count');
    const lo = Math.min.apply(null, values), hi = Math.max.apply(null, values);
    const nb = opts.bins || Math.max(6, Math.round(Math.sqrt(values.length)));
    const w = (hi - lo) / nb || 1;
    const counts = new Array(nb).fill(0);
    values.forEach((v) => { let b = Math.floor((v - lo) / w); if (b >= nb) b = nb - 1; if (b < 0) b = 0; counts[b]++; });
    const cmax = Math.max.apply(null, counts);
    ticksY(g, 0, cmax);
    for (let b = 0; b < nb; b++) {
      const x0 = px(lo + b * w, lo, hi), x1 = px(lo + (b + 1) * w, lo, hi);
      const y = py(counts[b], 0, cmax);
      g.appendChild(s('rect', { x: x0 + 1, y, width: Math.max(1, x1 - x0 - 2), height: (H - M.b) - y, fill: PAL[0], opacity: 0.8 }));
    }
    return g;
  }

  // ---- boxplot by group ----------------------------------------------------
  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
    return lo === hi ? sorted[lo] : sorted[lo] + (pos - lo) * (sorted[hi] - sorted[lo]);
  }
  function boxplotByGroup(groups, opts) {
    opts = opts || {};
    const all = [].concat.apply([], groups.map((gr) => gr.values));
    let [lo, hi] = nice(Math.min.apply(null, all), Math.max.apply(null, all));
    const g = frame(opts.title || 'By group', opts.xlabel || '', opts.ylabel || 'value');
    ticksY(g, lo, hi);
    const band = (W - M.l - M.r) / groups.length;
    groups.forEach((gr, i) => {
      const sorted = [...gr.values].sort((a, b) => a - b);
      const q1 = quantile(sorted, 0.25), med = quantile(sorted, 0.5), q3 = quantile(sorted, 0.75);
      const cx = M.l + band * (i + 0.5), bw = Math.min(46, band * 0.5);
      const col = PAL[i % PAL.length];
      g.appendChild(s('line', { x1: cx, y1: py(sorted[0], lo, hi), x2: cx, y2: py(sorted[sorted.length - 1], lo, hi), stroke: col }));
      g.appendChild(s('rect', { x: cx - bw / 2, y: py(q3, lo, hi), width: bw, height: py(q1, lo, hi) - py(q3, lo, hi), fill: col, opacity: 0.25, stroke: col }));
      g.appendChild(s('line', { x1: cx - bw / 2, y1: py(med, lo, hi), x2: cx + bw / 2, y2: py(med, lo, hi), stroke: col, 'stroke-width': 2 }));
      // jittered points
      gr.values.forEach((v) => g.appendChild(s('circle', { cx: cx + (Math.random() - 0.5) * bw * 0.7, cy: py(v, lo, hi), r: 2, fill: col, opacity: 0.55 })));
      g.appendChild(txt(cx, H - M.b + 14, gr.label, { 'text-anchor': 'middle', fill: '#33415c', 'font-size': 11 }));
    });
    return g;
  }

  // ---- scatter (+ optional regression line) --------------------------------
  function scatter(xs, ys, opts) {
    opts = opts || {};
    let [xlo, xhi] = nice(Math.min.apply(null, xs), Math.max.apply(null, xs));
    let [ylo, yhi] = nice(Math.min.apply(null, ys), Math.max.apply(null, ys));
    const g = frame(opts.title || 'Scatter', opts.xlabel || 'x', opts.ylabel || 'y');
    ticksY(g, ylo, yhi);
    xs.forEach((x, i) => g.appendChild(s('circle', { cx: px(x, xlo, xhi), cy: py(ys[i], ylo, yhi), r: 3, fill: PAL[0], opacity: 0.6 })));
    if (opts.line !== false) {
      const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
      let sxy = 0, sxx = 0;
      for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; }
      const b = sxy / sxx, a = my - b * mx;
      g.appendChild(s('line', { x1: px(xlo, xlo, xhi), y1: py(a + b * xlo, ylo, yhi), x2: px(xhi, xlo, xhi), y2: py(a + b * xhi, ylo, yhi), stroke: PAL[4], 'stroke-width': 2 }));
    }
    return g;
  }

  // ---- spaghetti (per-subject trajectories) --------------------------------
  function spaghetti(series, opts) {
    opts = opts || {};
    const allX = [].concat.apply([], series.map((sr) => sr.x));
    const allY = [].concat.apply([], series.map((sr) => sr.y));
    let [xlo, xhi] = nice(Math.min.apply(null, allX), Math.max.apply(null, allX));
    let [ylo, yhi] = nice(Math.min.apply(null, allY), Math.max.apply(null, allY));
    const g = frame(opts.title || 'Per-subject trajectories', opts.xlabel || 'time', opts.ylabel || 'value');
    ticksY(g, ylo, yhi);
    series.forEach((sr, i) => {
      const col = PAL[i % PAL.length];
      let d = '';
      sr.x.forEach((x, k) => { d += (k ? 'L' : 'M') + px(x, xlo, xhi) + ' ' + py(sr.y[k], ylo, yhi) + ' '; });
      g.appendChild(s('path', { d, fill: 'none', stroke: col, opacity: 0.5, 'stroke-width': 1.4 }));
    });
    return g;
  }

  // ---- caterpillar (sorted estimates ± error; e.g. random effects) ---------
  function caterpillar(points, opts) {
    opts = opts || {};
    const sorted = [...points].sort((a, b) => a.est - b.est);
    const ests = sorted.map((p) => p.est);
    const errs = sorted.map((p) => p.err || 0);
    let [lo, hi] = nice(Math.min.apply(null, ests.map((e, i) => e - errs[i])), Math.max.apply(null, ests.map((e, i) => e + errs[i])));
    const g = frame(opts.title || 'Random effects (caterpillar)', opts.xlabel || 'estimate', '');
    ticksY(g, lo, hi);
    g.appendChild(s('line', { x1: M.l, y1: py(0, lo, hi), x2: W - M.r, y2: py(0, lo, hi), stroke: '#bbb', 'stroke-dasharray': '3 3' }));
    const band = (W - M.l - M.r) / sorted.length;
    sorted.forEach((p, i) => {
      const cx = M.l + band * (i + 0.5);
      g.appendChild(s('line', { x1: cx, y1: py(p.est - (p.err || 0), lo, hi), x2: cx, y2: py(p.est + (p.err || 0), lo, hi), stroke: '#94a3b8' }));
      g.appendChild(s('circle', { cx, cy: py(p.est, lo, hi), r: 2.5, fill: PAL[0] }));
    });
    return g;
  }

  // ---- line chart (e.g. BF vs prior width), with an optional reference rule --
  function line(xs, ys, opts) {
    opts = opts || {};
    let [ylo, yhi] = nice(Math.min.apply(null, ys.concat(opts.rule != null ? [opts.rule] : [])), Math.max.apply(null, ys.concat(opts.rule != null ? [opts.rule] : [])));
    const xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs);
    const g = frame(opts.title || 'Line', opts.xlabel || 'x', opts.ylabel || 'y');
    ticksY(g, ylo, yhi);
    if (opts.rule != null) {
      const y = py(opts.rule, ylo, yhi);
      g.appendChild(s('line', { x1: M.l, y1: y, x2: W - M.r, y2: y, stroke: '#15803d', 'stroke-dasharray': '4 3' }));
      g.appendChild(txt(W - M.r - 2, y - 3, 'threshold ' + opts.rule, { 'text-anchor': 'end', fill: '#15803d', 'font-size': 10 }));
    }
    let d = '';
    xs.forEach((x, i) => { d += (i ? 'L' : 'M') + px(x, xlo, xhi) + ' ' + py(ys[i], ylo, yhi) + ' '; });
    g.appendChild(s('path', { d, fill: 'none', stroke: PAL[0], 'stroke-width': 2 }));
    xs.forEach((x, i) => g.appendChild(s('circle', { cx: px(x, xlo, xhi), cy: py(ys[i], ylo, yhi), r: 3, fill: PAL[0] })));
    // x tick labels
    xs.forEach((x) => g.appendChild(txt(px(x, xlo, xhi), H - M.b + 13, String(x), { 'text-anchor': 'middle', fill: '#6b6450', 'font-size': 9 })));
    return g;
  }

  // ---- p-curve: distribution of significant p-values over (0, .05) -----------
  // Right-skew (most mass near 0) = evidential; flat = null; left-skew = p-hacked.
  function pcurve(pvals, opts) {
    opts = opts || {};
    const edges = [0, 0.01, 0.02, 0.03, 0.04, 0.05];
    const counts = new Array(5).fill(0);
    let n = 0;
    pvals.forEach((p) => { if (p < 0.05) { n++; let b = Math.min(4, Math.floor(p / 0.01)); counts[b]++; } });
    const pct = counts.map((c) => (n ? (100 * c) / n : 0));
    const g = frame(opts.title || 'p-curve (significant studies)', 'p-value', '% of significant results');
    const ymax = Math.max(20, Math.max.apply(null, pct));
    ticksY(g, 0, ymax);
    // flat (null) reference at 20%
    const yref = py(20, 0, ymax);
    g.appendChild(s('line', { x1: M.l, y1: yref, x2: W - M.r, y2: yref, stroke: '#b45309', 'stroke-dasharray': '4 3' }));
    g.appendChild(txt(W - M.r - 2, yref - 3, 'flat = null', { 'text-anchor': 'end', fill: '#b45309', 'font-size': 10 }));
    const band = (W - M.l - M.r) / 5;
    for (let b = 0; b < 5; b++) {
      const x0 = M.l + band * b, y = py(pct[b], 0, ymax);
      g.appendChild(s('rect', { x: x0 + 4, y, width: band - 8, height: (H - M.b) - y, fill: PAL[0], opacity: 0.85 }));
      g.appendChild(txt(x0 + band / 2, H - M.b + 13, edges[b].toFixed(2) + '–' + edges[b + 1].toFixed(2), { 'text-anchor': 'middle', fill: '#6b6450', 'font-size': 8 }));
    }
    return g;
  }

  // ---- funnel plot: effect estimate vs standard error (publication bias) ------
  function funnel(points, opts) {
    opts = opts || {};
    const eff = points.map((p) => p.effect);
    let [xlo, xhi] = nice(Math.min.apply(null, eff), Math.max.apply(null, eff));
    const seMax = Math.max.apply(null, points.map((p) => p.se));
    const g = frame(opts.title || 'Funnel plot', opts.xlabel || 'effect estimate', 'standard error');
    // y axis inverted: SE=0 (most precise) at top
    const ftop = M.t, fbot = H - M.b;
    const pyse = (se) => ftop + (se / (seMax || 1)) * (fbot - ftop);
    for (let k = 0; k <= 4; k++) { const se = (k / 4) * seMax; g.appendChild(txt(M.l - 6, pyse(se) + 3, se.toFixed(1), { 'text-anchor': 'end', fill: '#6b6450', 'font-size': 10 })); }
    const center = opts.center != null ? opts.center : eff.reduce((a, b) => a + b, 0) / eff.length;
    // 95% funnel guides: effect = center ± 1.96*se
    const gx = (e) => px(e, xlo, xhi);
    g.appendChild(s('line', { x1: gx(center), y1: pyse(0), x2: gx(center - 1.96 * seMax), y2: pyse(seMax), stroke: '#94a3b8', 'stroke-dasharray': '3 3' }));
    g.appendChild(s('line', { x1: gx(center), y1: pyse(0), x2: gx(center + 1.96 * seMax), y2: pyse(seMax), stroke: '#94a3b8', 'stroke-dasharray': '3 3' }));
    g.appendChild(s('line', { x1: gx(0), y1: ftop, x2: gx(0), y2: fbot, stroke: '#ddd' }));
    points.forEach((p) => g.appendChild(s('circle', { cx: gx(p.effect), cy: pyse(p.se), r: 3, fill: PAL[0], opacity: 0.6 })));
    return g;
  }

  const api = { histogram, boxplotByGroup, scatter, spaghetti, caterpillar, line, pcurve, funnel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PSPSS_charts = api;
})(typeof self !== 'undefined' ? self : this);
