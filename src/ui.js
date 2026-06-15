/* PSPSS UI — builds the whole stats-software-parody interface and wires it to
 * the engine. Browser only. Globals expected (set by the other bundled files):
 *   Stats, RNG, PSPSS_levels, PSPSS_engine, PSPSS_content
 */
(function () {
  'use strict';

  const LEVELS = PSPSS_levels.LEVELS;
  const E = PSPSS_engine;
  const C = PSPSS_content;

  // --- tiny DOM helper ------------------------------------------------------
  function el(tag, props, children) {
    const n = document.createElement(tag);
    if (props) {
      for (const k in props) {
        if (k === 'class') n.className = props[k];
        else if (k === 'html') n.innerHTML = props[k];
        else if (k === 'text') n.textContent = props[k];
        else if (k.startsWith('on')) n.addEventListener(k.slice(2), props[k]);
        else if (props[k] != null) n.setAttribute(k, props[k]);
      }
    }
    (children || []).forEach((c) => n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return n;
  }
  function $(sel) { return document.querySelector(sel); }
  function fmt(x, d) {
    if (x == null || Number.isNaN(x)) return '—';
    if (!Number.isFinite(x)) return x > 0 ? '∞' : '-∞';
    return x.toFixed(d == null ? 1 : d);
  }
  function pfmt(p) { return p < 0.0001 ? '<.0001' : p.toFixed(4); }
  // paradigm-agnostic metric formatting (p-value or Bayes factor)
  function fmtMetric(a) {
    if (a.metricKind === 'bf') return a.metricValue >= 100 ? a.metricValue.toFixed(0) : a.metricValue.toFixed(2);
    return pfmt(a.metricValue);
  }
  function rnd(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  const CAMPAIGNS = PSPSS_campaigns.CAMPAIGNS;
  const PRIOR_OPTS = [
    { r: 0.2, label: 'Ultranarrow (r = 0.2)' }, { r: 0.3, label: 'Narrow (r = 0.3)' },
    { r: 0.5, label: 'Medium-narrow (r = 0.5)' }, { r: 0.707, label: 'Default medium (r = 0.707)' },
    { r: 1, label: 'Wide (r = 1.0)' }, { r: 1.414, label: 'Ultrawide (r = 1.414)' },
  ];
  function levelById(id) { return LEVELS.find((l) => l.id === id); }
  function campaignOf(id) { const c = CAMPAIGNS.find((c) => c.levelIds.indexOf(id) >= 0); return c ? c.id : null; }
  function campaignCleared(cid) { const c = CAMPAIGNS.find((c) => c.id === cid); return c.levelIds.every((id) => App.progress[id] && App.progress[id].done); }

  // --- app state ------------------------------------------------------------
  const App = {
    mode: 'tenure',
    prereg: false,
    levelIndex: 0,
    state: null,
    progress: load(),
  };

  function load() {
    try { return JSON.parse(localStorage.getItem('pspss_progress') || '{}'); }
    catch (e) { return {}; }
  }
  function save() { try { localStorage.setItem('pspss_progress', JSON.stringify(App.progress)); } catch (e) {} }

  // ========================================================================
  // START SCREEN / CAMPAIGN MAP
  // ========================================================================
  function renderStart() {
    const root = $('#app');
    root.innerHTML = '';
    root.appendChild(titlebar());

    const wrap = el('div', { class: 'start' });
    wrap.appendChild(el('h1', { text: 'PSPSS' }));
    wrap.appendChild(el('div', { class: 'tagline', text: 'Probably Significant Statistical Software™  —  Publish or perish. Reach p < .05 in the fewest moves.' }));

    // mode + prereg controls
    const controls = el('div', { class: 'btnrow' });
    controls.appendChild(modePill());
    const pre = el('label', { class: 'hint', style: 'display:flex;align-items:center;gap:6px;cursor:pointer' }, []);
    const cb = el('input', { type: 'checkbox' });
    cb.checked = App.prereg;
    cb.addEventListener('change', () => { App.prereg = cb.checked; });
    pre.appendChild(cb);
    pre.appendChild(document.createTextNode('Preregistration mode (declare ONE analysis up front — honest, brutal)'));
    controls.appendChild(pre);
    wrap.appendChild(controls);

    wrap.appendChild(el('div', { class: 'hint', style: 'margin:12px 0 4px',
      html: 'Each study is rigged to be non-significant. Use the menus to <i>diagnose</i> the flaw (free), then apply the right Questionable Research Practice to torture it into significance. Fewer moves = more stars.' }));

    CAMPAIGNS.forEach((camp, ci) => {
      const campUnlocked = ci === 0 || campaignCleared(CAMPAIGNS[ci - 1].id);
      const head = el('div', { style: 'margin:16px 0 6px' }, [
        el('div', { style: 'font-weight:700;color:#2c5685;font-size:15px', text: camp.name + (campUnlocked ? '' : '  🔒') }),
        el('div', { class: 'hint', text: camp.subtitle }),
      ]);
      wrap.appendChild(head);
      if (!campUnlocked) {
        wrap.appendChild(el('div', { class: 'hint', style: 'font-style:italic', text: `Locked — clear ${CAMPAIGNS[ci - 1].name} to unlock.` }));
        return;
      }
      const grid = el('div', { class: 'levelgrid' });
      camp.levelIds.forEach((id, i) => {
        const lv = levelById(id);
        const prog = App.progress[id];
        const prevDone = i === 0 || (App.progress[camp.levelIds[i - 1]] && App.progress[camp.levelIds[i - 1]].done);
        const card = el('div', { class: 'levelcard' + (prevDone ? '' : ' locked') });
        card.appendChild(el('div', { class: 'lt', text: `${i + 1}. ${lv.title}` }));
        card.appendChild(el('div', { class: 'lr', text: lv.rank }));
        const stars = el('div', { class: 'stars' });
        const s = prog ? prog.stars : 0;
        stars.innerHTML = '★★★'.split('').map((c, k) => k < s ? '★' : '<span class="empty">★</span>').join('');
        if (prog && prog.clean) stars.appendChild(el('span', { class: 'clean-badge', text: 'CLEAN' }));
        if (prog && prog.retracted) stars.appendChild(el('span', { class: 'clean-badge', style: 'background:#b91c1c', text: 'RETRACTED' }));
        card.appendChild(stars);
        if (prevDone) card.addEventListener('click', () => startLevel(LEVELS.indexOf(lv)));
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    });

    const cleared = LEVELS.every((lv) => App.progress[lv.id] && App.progress[lv.id].done);
    if (cleared) {
      wrap.appendChild(el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn', onclick: replicationEpilogue }, ['View your legacy (Replication Crisis)']),
        el('button', { class: 'btn ghost', onclick: () => { App.progress = {}; save(); renderStart(); } }, ['Wipe career & restart']),
      ]));
    }

    const hint = el('div', { class: 'hint', style: 'margin-top:16px' }, [
      'A satire about p-hacking and the replication crisis. The statistics under the hood are real; the ethics are not. ',
      el('a', { class: 'link', onclick: showHow }, ['How is this rigged?']),
    ]);
    wrap.appendChild(hint);
    root.appendChild(wrap);
  }

  function modePill() {
    const pill = el('div', { class: 'mode-pill', title: 'Toggle tone' });
    const t = el('span', { class: App.mode === 'tenure' ? 'on' : '', text: 'Tenure Track' });
    const p = el('span', { class: App.mode === 'pure' ? 'on' : '', text: 'Pure P-Hacker' });
    pill.appendChild(t); pill.appendChild(p);
    pill.addEventListener('click', () => {
      App.mode = App.mode === 'tenure' ? 'pure' : 'tenure';
      if (App.state) { App.state.mode = App.mode; renderGame(); } else renderStart();
    });
    return pill;
  }

  function titlebar() {
    return el('div', { class: 'titlebar' }, [
      el('span', { html: 'PSPSS <small>— Probably Significant Statistical Software</small>' }),
      el('span', { class: 'winbtns', text: '— ▢ ✕' }),
    ]);
  }

  // ========================================================================
  // GAME SCREEN
  // ========================================================================
  function startLevel(idx) {
    App.levelIndex = idx;
    App.state = E.newState(LEVELS[idx], undefined, App.mode);
    App.state._committed = false;
    renderGame();
    showBriefing();
  }

  function renderGame() {
    const root = $('#app');
    root.innerHTML = '';
    root.appendChild(titlebar());
    root.appendChild(menubar());

    const lv = App.state.level;
    const sub = el('div', { class: 'subbar' });
    sub.appendChild(el('div', { class: 'level-info', html: `<b>${lv.title}</b> &nbsp; <span class="rank">${lv.rank}</span>` }));
    sub.appendChild(modePill());
    root.appendChild(sub);

    root.appendChild(statStrip());

    const main = el('div', { class: 'main' });
    const dataPane = el('div', { class: 'pane' }, [el('div', { class: 'pane-title', text: 'Data View' })]);
    const dataBody = el('div', { class: 'pane-body', id: 'data-view' });
    dataPane.appendChild(dataBody);
    const outPane = el('div', { class: 'pane' }, [el('div', { class: 'pane-title', text: 'Output' })]);
    const outBody = el('div', { class: 'pane-body' }, [el('div', { id: 'output' })]);
    outPane.appendChild(outBody);
    main.appendChild(dataPane); main.appendChild(outPane);
    root.appendChild(main);

    renderData();
    renderStatStrip();
    // initial output
    $('#output').innerHTML = '';
    appendOutput(E.analyze(App.state), null, 'initial');
  }

  // ---- menu bar ----
  const MENU_ORDER = ['File', 'Data', 'Transform', 'Analyze', 'Graphs', 'Help'];
  function menubar() {
    const bar = el('div', { class: 'menubar', id: 'menubar' });
    MENU_ORDER.forEach((name) => bar.appendChild(menu(name)));
    return bar;
  }

  function menu(name) {
    const m = el('div', { class: 'menu' });
    m.appendChild(el('div', { class: 'menu-label', text: name }));
    const dd = el('div', { class: 'dropdown' });
    items(name).forEach((it) => {
      if (it.sep) { dd.appendChild(el('div', { class: 'sep' })); return; }
      const cls = 'item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : '');
      const node = el('div', { class: cls, title: it.tip || '' }, [
        el('span', { text: it.label }),
        el('span', { class: 'cost', text: it.cost || '' }),
      ]);
      if (!it.disabled) node.addEventListener('click', (e) => { e.stopPropagation(); closeMenus(); it.run(); });
      dd.appendChild(node);
    });
    m.appendChild(dd);
    m.querySelector('.menu-label').addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = m.classList.contains('open');
      closeMenus();
      if (!wasOpen) m.classList.add('open');
    });
    return m;
  }
  function closeMenus() { document.querySelectorAll('.menu.open').forEach((m) => m.classList.remove('open')); }
  document.addEventListener('click', closeMenus);

  function items(menuName) {
    const st = App.state;
    const locked = App.prereg && st._committed;
    if (menuName === 'File') {
      return [
        { label: 'New Study (restart level)', run: () => startLevel(App.levelIndex) },
        { label: 'Report Null Result…', tip: 'The honest exit. Career-limiting.', run: confirmReportNull },
        { sep: true },
        { label: 'Save (to a USB you will lose)', run: () => toast('Saved. You will never find this file again.') },
        { label: 'Exit to Campaign', run: renderStart },
      ];
    }
    if (menuName === 'Help') {
      return [
        { label: 'About PSPSS', run: showHow },
        { label: 'Cite this software', run: () => toast('Desperate, A. (2026). PSPSS [Software]. Self-published, weeping.') },
        { label: 'Statistical Methods Help (404)', run: () => toast('Page not found. Try p < 0.05.') },
      ];
    }
    // tool menus — only show tools relevant to this level (toolEnabled honours allowedTools)
    return E.TOOLS.filter((t) => t.menu === menuName)
      .filter((t) => t.kind === 'diagnostic' || E.toolEnabled(st, t) || !st.level.allowedTools || t.universal || (st.level.allowedTools.indexOf(t.id) >= 0))
      .map((t) => {
        const enabled = E.toolEnabled(st, t) && !(locked && t.kind === 'intervention');
        const cost = t.kind === 'diagnostic' ? 'free' : '+1 move · +' + (t.suspicion || 0) + '%';
        return {
          label: t.label,
          tip: C.tooltip(t.id, App.mode),
          cost,
          danger: t.danger,
          disabled: !enabled,
          run: () => onTool(t.id),
        };
      });
  }

  // ---- applying tools ----
  function onTool(toolId) {
    const tool = E.TOOLS.find((t) => t.id === toolId);
    if (tool.needsChoice === 'dv') return chooseDV();
    if (tool.needsChoice === 'test') return chooseFromList('Choose Statistical Test', App.state.level.tests, (o) => doTool('choose-test', { method: o.id }));
    if (tool.needsChoice === 'lmm') return chooseFromList('Specify Random-Effects Structure', [{ id: 'max', label: 'Maximal (random intercept + slope)' }, { id: 'ri', label: 'Random intercept only' }], (o) => doTool('fit-lmm', { structure: o.id }));
    if (tool.needsChoice === 'control') return chooseFromList('Add a Covariate', App.state.level.candidateControls.concat([{ id: null, label: 'None (remove covariate)' }]), (o) => doTool('add-control', { var: o.id }));
    if (tool.needsChoice === 'prior') return chooseFromList('Set Cauchy Prior Width (r)', PRIOR_OPTS, (o) => doTool('set-prior', { r: o.r }));
    if (tool.danger) return confirmFabricate();
    doTool(toolId);
  }

  function doTool(toolId, payload) {
    const res = E.applyTool(App.state, toolId, payload);
    if (res.error) { toast(res.error); return; }
    const tool = E.TOOLS.find((t) => t.id === toolId);
    renderData();
    renderStatStrip();
    appendOutput(res.analysis, App.state.log[App.state.log.length - 1], tool.kind);

    if (App.prereg && App.state._committedPending) {
      App.state._committedPending = false;
      App.state._committed = true;
      renderGame();
      // re-render output history is lost; show end based on result
      if (App.state.finished === 'win') return showEnd('win', res.analysis);
      return showEnd('prereg-null', res.analysis);
    }

    if (res.event === 'retract') return showEnd('retract', res.analysis);
    if (res.event === 'win') return showEnd('win', res.analysis);
  }

  // ---- data grid ----
  function renderData() {
    const st = App.state;
    const host = $('#data-view');
    host.innerHTML = '';

    // Clustered (long-format) levels render their observations.
    if (st.design === 'clustered') {
      const obs = st.observations;
      const sample = obs[0] || {};
      const cols = ['subject'];
      if (sample.group !== undefined) cols.push('group');
      if (sample.time !== undefined) cols.push('time');
      if (sample.x !== undefined) cols.push('x');
      cols.push('y');
      const labelOf = { subject: 'Subject', group: 'Group', time: 'Time', x: 'x', y: st.level.dvLabels && st.level.dvLabels.primary ? st.level.dvLabels.primary : 'y' };
      const table = el('table', { class: 'grid' });
      const thead = el('tr');
      thead.appendChild(el('th', { class: 'rownum', text: '#' }));
      cols.forEach((c) => thead.appendChild(el('th', { text: labelOf[c] || c })));
      table.appendChild(thead);
      obs.forEach((o, i) => {
        const tr = el('tr');
        if (o._fab) tr.className = 'fab';
        tr.appendChild(el('td', { class: 'rownum', text: i + 1 }));
        cols.forEach((c) => tr.appendChild(el('td', { class: c === 'group' || c === 'subject' ? 'cat' : '', text: typeof o[c] === 'number' ? fmt(o[c]) : o[c] })));
        table.appendChild(tr);
      });
      host.appendChild(table);
      return;
    }

    const table = el('table', { class: 'grid' });
    const thead = el('tr');
    thead.appendChild(el('th', { class: 'rownum', text: '#' }));
    if (st.design === 'repeated') {
      thead.appendChild(el('th', { text: st.level.dvLabels.pre }));
      thead.appendChild(el('th', { text: st.level.dvLabels.post }));
      thead.appendChild(el('th', { text: 'Δ' }));
    } else {
      thead.appendChild(el('th', { text: 'Group' }));
      st.dvNames.forEach((dv) => {
        const active = dv === st.activeDV;
        thead.appendChild(el('th', { class: active ? 'activecol' : '', text: st.level.dvLabels[dv] + (active ? ' ◀' : '') }));
      });
      if (st.hasCovariate) thead.appendChild(el('th', { text: st.level.covariateLabel || 'Covariate' }));
      (st.level.extraCols || []).forEach((c) => thead.appendChild(el('th', { text: c.label })));
      if (st.subgroupFactor) thead.appendChild(el('th', { text: st.subgroupFactor.label }));
    }
    table.appendChild(thead);

    st.participants.forEach((p, i) => {
      const tr = el('tr');
      if (p._fab) tr.className = 'fab';
      else if (st.subgroupFilter && st.design !== 'repeated' && p.sub !== st.subgroupFilter) tr.className = 'dimmed';
      tr.appendChild(el('td', { class: 'rownum', text: i + 1 }));
      if (st.design === 'repeated') {
        tr.appendChild(el('td', { text: fmt(p.pre) }));
        tr.appendChild(el('td', { text: fmt(p.post) }));
        tr.appendChild(el('td', { text: fmt(p.post - p.pre) }));
      } else {
        tr.appendChild(el('td', { class: 'group', text: p.group }));
        st.dvNames.forEach((dv) => {
          tr.appendChild(el('td', { class: dv === st.activeDV ? 'activecol' : '', text: fmt(p.vals[dv]) }));
        });
        if (st.hasCovariate) tr.appendChild(el('td', { text: fmt(p.cov) }));
        (st.level.extraCols || []).forEach((c) => tr.appendChild(el('td', { text: fmt(p[c.field]) })));
        if (st.subgroupFactor) tr.appendChild(el('td', { class: 'cat', text: p.sub }));
      }
      table.appendChild(tr);
    });
    host.appendChild(table);
  }

  // ---- stat strip ----
  function statStrip() {
    const s = el('div', { class: 'statstrip', id: 'statstrip' });
    return s;
  }
  function renderStatStrip() {
    const st = App.state;
    const a = E.analyze(st);
    const strip = $('#statstrip');
    strip.innerHTML = '';
    const pCard = el('div', { class: 'stat' + (a.win ? ' sig' : ''), id: 'stat-p' }, [
      el('div', { class: 'k', text: a.metricLabel + '  ·  goal: ' + a.goalText }),
      el('div', { class: 'v', text: fmtMetric(a) }),
    ]);
    strip.appendChild(pCard);
    strip.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'k', text: a.testName }),
      el('div', { class: 'v', text: `${a.statLabel}=${fmt(a.statistic, 2)}` }),
    ]));
    const par = st.level.par;
    strip.appendChild(el('div', { class: 'stat' }, [
      el('div', { class: 'k', text: 'Researcher d.f. spent' }),
      el('div', { class: 'v', text: `${st.moves} / ${par} par` }),
    ]));
    const susp = el('div', { class: 'stat' }, [
      el('div', { class: 'k', text: 'Suspicion' }),
      el('div', { class: 'v', text: st.suspicion + '%' }),
    ]);
    const bar = el('div', { class: 'susp-bar' }, [el('div', { class: 'susp-fill' })]);
    susp.appendChild(bar);
    strip.appendChild(susp);
    const fill = bar.querySelector('.susp-fill');
    fill.style.width = Math.min(100, st.suspicion) + '%';
    fill.style.background = st.suspicion > 60 ? '#b91c1c' : st.suspicion > 30 ? '#f59e0b' : '#84cc16';
  }

  // ---- output pane ----
  function appendOutput(a, logEntry, kind) {
    const out = $('#output');
    const block = el('div', { class: 'out-block' });

    if (logEntry && logEntry.move) {
      block.appendChild(el('div', { class: 'out-syntax', text: '>>> ' + logEntry.text }));
    } else if (logEntry) {
      block.appendChild(el('div', { class: 'out-note', text: logEntry.text }));
    } else if (kind === 'initial') {
      block.appendChild(el('div', { class: 'out-syntax', text: '>>> ' + (a.testName).toUpperCase() + ' /INITIAL ANALYSIS.' }));
    }

    // Figure diagnostics render a chart and nothing else.
    if (logEntry && logEntry.chart) {
      try {
        const c = logEntry.chart;
        block.appendChild(PSPSS_charts[c.fn].apply(null, c.args));
      } catch (e) {
        block.appendChild(el('div', { class: 'out-note', text: '(figure unavailable)' }));
      }
      out.appendChild(block);
      out.parentElement.scrollTop = out.parentElement.scrollHeight;
      return;
    }

    block.appendChild(el('div', { class: 'out-h', text: a.testName }));
    const tbl = el('table', { class: 'out' });
    const head = el('tr');
    const cells = [];
    Object.keys(a.groups).forEach((k) => cells.push([k, fmt(a.groups[k], 2)]));
    cells.push(['N', a.n]);
    cells.push([a.statLabel, fmt(a.statistic, 2)]);
    if (a.df != null) cells.push(['df', fmt(a.df, 1)]);
    cells.forEach((c) => head.appendChild(el('th', { text: c[0] })));
    head.appendChild(el('th', { text: 'Sig. (' + a.metricLabel + ')' }));
    tbl.appendChild(head);
    const row = el('tr');
    cells.forEach((c) => row.appendChild(el('td', { text: c[1] })));
    row.appendChild(el('td', { class: 'out-p ' + (a.win ? 'sig' : 'nsig'), text: fmtMetric(a) }));
    tbl.appendChild(row);
    block.appendChild(tbl);

    if (a.significant && !a.win) {
      block.appendChild(el('div', { class: 'out-flag', text: '⚠ Crossed the threshold — but in the WRONG direction. Your hypothesis predicted the other way.' }));
    }
    if (logEntry && logEntry.danger) {
      block.appendChild(el('div', { class: 'out-flag', text: '⚠ DATA INTEGRITY FLAG RAISED.' }));
    }
    // Reviewer 2 occasionally chimes in
    const rev = C.REVIEWER2[App.mode];
    if (kind === 'initial') maybeRev(block, rev.open, 1);
    else if (logEntry && logEntry.move) {
      if (App.state.suspicion > 50) maybeRev(block, rev.suspicious, 0.6);
      else maybeRev(block, rev.move, 0.55);
    }

    out.appendChild(block);
    out.parentElement.scrollTop = out.parentElement.scrollHeight;
  }
  function maybeRev(block, arr, prob) {
    if (Math.random() > prob) return;
    block.appendChild(el('div', { class: 'out-rev', text: rnd(arr) }));
  }

  // ========================================================================
  // MODALS
  // ========================================================================
  function modal(barText, bodyNode, opts) {
    closeModal();
    const back = el('div', { class: 'modal-back', id: 'modal-back' });
    const m = el('div', { class: 'modal' });
    m.appendChild(el('div', { class: 'bar', text: barText }));
    const body = el('div', { class: 'body' });
    body.appendChild(bodyNode);
    m.appendChild(body);
    back.appendChild(m);
    if (opts && opts.dismissable) back.addEventListener('click', (e) => { if (e.target === back) closeModal(); });
    $('#modal-root').appendChild(back);
    return body;
  }
  function closeModal() { $('#modal-root').innerHTML = ''; }

  function showBriefing() {
    const lv = App.state.level;
    const body = el('div');
    body.appendChild(el('h2', { text: lv.title }));
    body.appendChild(el('div', { class: 'rank', style: 'font-style:italic;color:#6b6450;margin-bottom:8px', text: lv.rank }));
    body.appendChild(el('div', { html: lv.brief }));
    body.appendChild(el('div', { class: 'hyp', html: '<b>Your hypothesis:</b> ' + lv.hypothesis }));

    if (App.prereg) {
      body.appendChild(el('div', { class: 'out-flag', style: 'margin:8px 0', text: 'PREREGISTRATION MODE: you must commit to ONE analysis now, before exploring. No take-backs. Good luck. You will need actual data on your side.' }));
      const sel = el('select', { style: 'padding:5px;width:100%;margin-top:6px' });
      sel.appendChild(el('option', { value: '', text: '— Run the default test as-is (no manipulation) —' }));
      E.TOOLS.filter((t) => t.kind === 'intervention' && t.enabled(App.state)).forEach((t) => {
        sel.appendChild(el('option', { value: t.id, text: t.label }));
      });
      body.appendChild(sel);
      const row = el('div', { class: 'btnrow' });
      row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(); commitPrereg(sel.value); } }, ['Commit & Run (final)']));
      body.appendChild(row);
    } else {
      const row = el('div', { class: 'btnrow' });
      row.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Begin Analysis']));
      row.appendChild(el('button', { class: 'btn ghost', onclick: () => { closeModal(); renderStart(); } }, ['Back to Campaign']));
      body.appendChild(row);
    }
    modal('Study Briefing', body);
  }

  function commitPrereg(toolId) {
    if (!toolId) {
      // just evaluate the default analysis
      const a = E.analyze(App.state);
      App.state._committed = true;
      renderGame();
      if (a.win) { App.state.finished = 'win'; return showEnd('win', a); }
      return showEnd('prereg-null', a);
    }
    App.state._committedPending = true;
    doTool(toolId);
  }

  function chooseDV() {
    const st = App.state;
    const body = el('div');
    body.appendChild(el('h2', { text: 'Designate Primary Outcome' }));
    body.appendChild(el('div', { class: 'hint', text: 'Which outcome did you "always care about"? (Tip: run Analyze ▸ Run All Outcomes first to see which one cooperated.)' }));
    const row = el('div', { class: 'btnrow' });
    st.dvNames.forEach((dv) => {
      row.appendChild(el('button', { class: 'btn ghost', onclick: () => { closeModal(); doTool('pick-outcome', { dv }); } }, [st.level.dvLabels[dv]]));
    });
    body.appendChild(row);
    modal('Pick Primary Outcome', body, { dismissable: true });
  }

  // generic chooser: options = [{id,label}], onPick(option)
  function chooseFromList(title, options, onPick) {
    const body = el('div');
    body.appendChild(el('h2', { text: title }));
    body.appendChild(el('div', { class: 'hint', text: 'Choose carefully. Or, you know, conveniently.' }));
    const col = el('div', { class: 'btnrow', style: 'flex-direction:column;align-items:stretch' });
    (options || []).forEach((o) => {
      col.appendChild(el('button', { class: 'btn ghost', style: 'text-align:left', onclick: () => { closeModal(); onPick(o); } }, [o.label]));
    });
    body.appendChild(col);
    modal(title, body, { dismissable: true });
  }

  function confirmFabricate() {
    if (App.mode === 'pure') return doTool('fabricate');
    const body = el('div');
    body.appendChild(el('h2', { class: 'bad', text: 'This is fraud.' }));
    body.appendChild(el('div', { html: 'Fabricating data is not a "questionable" research practice — it is the crime that ends careers and poisons the literature. The higher your <b>Suspicion</b>, the more likely PubPeer catches you. <br><br>(You can do it. The game will let you. That is the point.)' }));
    const row = el('div', { class: 'btnrow' });
    row.appendChild(el('button', { class: 'btn danger', onclick: () => { closeModal(); doTool('fabricate'); } }, ['Fabricate anyway']));
    row.appendChild(el('button', { class: 'btn ghost', onclick: closeModal }, ['Step back from the abyss']));
    body.appendChild(row);
    modal('⚠ Research Integrity Warning', body);
  }

  function confirmReportNull() {
    const body = el('div');
    body.appendChild(el('h2', { text: 'Report the null result?' }));
    body.appendChild(el('div', { text: 'You will report honestly that there was no significant effect. This is good science. It is bad for your career. Proceed?' }));
    const row = el('div', { class: 'btnrow' });
    row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(); const r = E.reportNull(App.state); showEnd('honest', r.analysis); } }, ['Report it honestly']));
    row.appendChild(el('button', { class: 'btn ghost', onclick: closeModal }, ['Keep torturing the data']));
    body.appendChild(row);
    modal('Report Null Result', body);
  }

  // ---- endings ----
  function showEnd(event, a) {
    const st = App.state;
    const lv = st.level;
    const body = el('div');
    let stars = E.stars(st);

    if (event === 'win') {
      const journal = rnd(C.JOURNALS);
      const ctx = { journal, p: fmtMetric(a), metric: a.metricLabel, moves: st.moves, suspicion: st.suspicion,
        doi: 1000 + Math.floor(Math.random() * 8999), year: 2026 };
      body.appendChild(el('h2', { class: 'win', text: '🏆 Significance Secured — Accepted for Publication' }));
      body.appendChild(el('div', { html: C.ENDINGS.win[App.mode](ctx) }));
      body.appendChild(starRow(stars));
      recordResult({ done: true, stars: stars.stars, clean: stars.clean, suspicion: st.suspicion });
    } else if (event === 'retract') {
      body.appendChild(el('h2', { class: 'bad', text: '🚨 PAPER RETRACTED' }));
      body.appendChild(el('div', { html: C.ENDINGS.retract[App.mode]() }));
      recordResult({ done: false, stars: 0, clean: false, retracted: true });
    } else if (event === 'honest') {
      body.appendChild(el('h2', { text: '🕊️ Null Result, Honestly Reported' }));
      body.appendChild(el('div', { html: C.ENDINGS.honest[App.mode]() }));
      // The honest exit "clears" the Honest Null level (its par is 0).
      const cleared = lv.flaw === 'honest-null';
      if (cleared) { recordResult({ done: true, stars: 3, clean: true, honest: true }); body.appendChild(starRow({ stars: 3, clean: true })); }
    } else if (event === 'prereg-null') {
      body.appendChild(el('h2', { text: '📋 Preregistration Honored' }));
      body.appendChild(el('div', { html: 'You ran exactly the analysis you promised, and it was not significant (p = <b>' + pfmt(a.p) + '</b>). You did not p-hack. You did real science.<br><br>It will not be published. But your integrity is <i>spotless</i>, and somewhere a meta-analyst sheds a single grateful tear.' }));
      recordResult({ done: true, stars: 3, clean: true, prereg: true });
      body.appendChild(starRow({ stars: 3, clean: true }));
    }

    const row = el('div', { class: 'btnrow' });
    const next = App.levelIndex + 1;
    const nextSameCampaign = next < LEVELS.length && campaignOf(LEVELS[next].id) === campaignOf(lv.id);
    if ((event === 'win' || event === 'honest' || event === 'prereg-null') && nextSameCampaign) {
      row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(); startLevel(next); } }, ['Next Study ▸']));
    }
    if (event === 'retract' || event === 'prereg-null') {
      row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(); startLevel(App.levelIndex); } }, ['Try Again']));
    }
    row.appendChild(el('button', { class: 'btn ghost', onclick: () => { closeModal(); renderStart(); } }, ['Campaign Map']));
    body.appendChild(row);
    modal(event === 'win' ? 'Manuscript Decision: ACCEPT' : 'Study Concluded', body);
  }

  function starRow(s) {
    const d = el('div', { style: 'font-size:24px;color:#f59e0b;margin-top:10px;letter-spacing:3px' });
    d.innerHTML = '★★★'.split('').map((c, k) => k < s.stars ? '★' : '<span style="color:#d8d3c6">★</span>').join('');
    if (s.clean) d.appendChild(el('span', { class: 'clean-badge', style: 'vertical-align:middle', text: 'CLEAN (low suspicion)' }));
    return d;
  }

  function recordResult(r) {
    const id = App.state.level.id;
    const prev = App.progress[id];
    // keep best stars
    if (!prev || (r.done && (!prev.done || r.stars > prev.stars))) App.progress[id] = r;
    else if (prev && r.retracted && !prev.done) App.progress[id] = Object.assign({}, prev, { retracted: true });
    save();
  }

  function replicationEpilogue() {
    const body = el('div');
    body.appendChild(el('h2', { text: '🔬 Ten Years Later: The Replication Crisis' }));
    body.appendChild(el('div', { html: 'A large-scale replication project revisits your career. High-suspicion findings tend not to survive contact with a second laboratory...' }));
    const list = el('div', { style: 'margin-top:10px' });
    let survived = 0, died = 0;
    LEVELS.forEach((lv) => {
      const p = App.progress[lv.id];
      if (!p || !p.done) return;
      let fate;
      if (p.honest || p.prereg) { fate = '✅ holds up (you were honest)'; survived++; }
      else if ((p.suspicion || 0) > 45) { fate = '❌ FAILED to replicate'; died++; }
      else if ((p.suspicion || 0) > 20) { fate = (Math.random() < 0.5 ? '❌ FAILED to replicate' : '⚠️ "mixed evidence"'); died++; }
      else { fate = '✅ replicates'; survived++; }
      list.appendChild(el('div', { style: 'padding:3px 0;border-bottom:1px solid #e5e1d4', html: `<b>${lv.title}</b> — ${fate}` }));
    });
    body.appendChild(list);
    body.appendChild(el('div', { style: 'margin-top:12px', html:
      `<b>${survived}</b> of your findings survived; <b>${died}</b> evaporated. ` +
      (died > survived ? 'Your h-index was a house of cards. But you got tenure first, so — checkmate, epistemology?' : 'Suspiciously robust. Either you got lucky, or you accidentally did science.') }));
    body.appendChild(el('div', { class: 'hint', style: 'margin-top:10px', text: 'Moral: the fewer degrees of freedom you spent, the better you slept. Preregistration was the real cheat code.' }));
    const row = el('div', { class: 'btnrow' });
    row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(); renderStart(); } }, ['Back to Campaign']));
    body.appendChild(row);
    modal('Career Retrospective', body, { dismissable: true });
  }

  function showHow() {
    const body = el('div');
    body.appendChild(el('h2', { text: 'How is this rigged?' }));
    body.appendChild(el('div', { html:
      'Every dataset is generated to be genuinely non-significant under the honest analysis, but to contain one real, exploitable flaw — an outlier, a skew, a confound, a lucky subgroup, an under-powered n, a multiverse of outcomes, or a wrong-direction effect.<br><br>' +
      'The p-values are computed by a <b>real statistics engine</b> (t-tests, Mann-Whitney, Wilcoxon, ANCOVA, all with proper t- and normal-distribution p-values). Nothing is faked. When you "p-hack," you are doing the exact moves that inflate false positives in the real literature — that\'s the joke, and the lesson.<br><br>' +
      '<b>Tenure Track</b> mode shows the citations behind each trick. <b>Pure P-Hacker</b> mode just lets you cook.' }));
    const row = el('div', { class: 'btnrow' });
    row.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Got it']));
    body.appendChild(row);
    modal('About PSPSS', body, { dismissable: true });
  }

  // ---- toast ----
  function toast(msg) {
    const t = el('div', { style: 'position:fixed;bottom:18px;left:50%;transform:translateX(-50%);background:#1f2937;color:#fff;padding:8px 16px;border-radius:5px;z-index:200;box-shadow:0 4px 14px rgba(0,0,0,.4)', text: msg });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---- boot ----
  document.addEventListener('DOMContentLoaded', renderStart);
})();
