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
    achievements: loadAch(),
    career: loadCareer(),
    unlocked: loadUnlock(),
    sound: loadSound(),
  };

  function load() {
    try { return JSON.parse(localStorage.getItem('pspss_progress') || '{}'); }
    catch (e) { return {}; }
  }
  function loadUnlock() { try { return localStorage.getItem('pspss_unlock') === '1'; } catch (e) { return false; } }
  function saveUnlock() { try { localStorage.setItem('pspss_unlock', App.unlocked ? '1' : '0'); } catch (e) {} }
  function loadSound() { try { return localStorage.getItem('pspss_sound') === '1'; } catch (e) { return false; } }
  // optional WebAudio sfx (off by default; no-op in headless/Node)
  let _actx = null;
  function beep(freq, dur, type) {
    if (!App.sound) return;
    try {
      const AC = (typeof window !== 'undefined') && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      _actx = _actx || new AC();
      const o = _actx.createOscillator(), g = _actx.createGain();
      o.type = type || 'sine'; o.frequency.value = freq; o.connect(g); g.connect(_actx.destination);
      g.gain.setValueAtTime(0.07, _actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, _actx.currentTime + dur);
      o.start(); o.stop(_actx.currentTime + dur);
    } catch (e) {}
  }
  function sfx(kind) {
    if (kind === 'move') beep(washTone(), 0.05);
    else if (kind === 'win') { beep(523, 0.12); setTimeout(() => beep(784, 0.18), 90); }
    else if (kind === 'bad') beep(130, 0.32, 'sawtooth');
  }
  function washTone() { return 380 + Math.random() * 120; }
  function loadAch() { try { return JSON.parse(localStorage.getItem('pspss_ach') || '[]'); } catch (e) { return []; } }
  function loadCareer() {
    const d = { publications: 0, retractions: 0, honestNulls: 0, cleanWins: 0, p001Wins: 0 };
    try { return Object.assign(d, JSON.parse(localStorage.getItem('pspss_career') || '{}')); } catch (e) { return d; }
  }
  function save() { try { localStorage.setItem('pspss_progress', JSON.stringify(App.progress)); } catch (e) {} }
  function saveAch() { try { localStorage.setItem('pspss_ach', JSON.stringify(App.achievements)); localStorage.setItem('pspss_career', JSON.stringify(App.career)); } catch (e) {} }
  const K = (typeof PSPSS_knowledge !== 'undefined') ? PSPSS_knowledge : null;

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
    const snd = el('label', { class: 'snd-toggle' });
    const scb = el('input', { type: 'checkbox' });
    scb.checked = App.sound;
    scb.addEventListener('change', () => { App.sound = scb.checked; try { localStorage.setItem('pspss_sound', App.sound ? '1' : '0'); } catch (e) {} if (App.sound) beep(660, 0.08); });
    snd.appendChild(scb); snd.appendChild(document.createTextNode('🔊 Sound'));
    controls.appendChild(snd);
    wrap.appendChild(controls);

    // learn / play / profile entry points
    const tools = el('div', { class: 'btnrow', style: 'margin-top:8px' }, [
      el('button', { class: 'btn ghost', onclick: showCodex }, ['📖 Methods Codex']),
      el('button', { class: 'btn ghost', onclick: showSandbox }, ['🧪 Sandbox Lab']),
      el('button', { class: 'btn ghost', onclick: showMetaLab }, ['🔬 Meta-Science Lab']),
      el('button', { class: 'btn ghost', onclick: showQuiz }, ['🔍 Spot the QRP']),
      el('button', { class: 'btn ghost', onclick: showDashboard }, ['🎓 Career Dashboard']),
    ]);
    wrap.appendChild(tools);

    wrap.appendChild(el('div', { class: 'hint', style: 'margin:12px 0 4px',
      html: 'Each study is rigged to be non-significant. Use the menus to <i>diagnose</i> the flaw (free), then apply the right Questionable Research Practice to torture it into significance. Fewer moves = more stars.' }));

    CAMPAIGNS.forEach((camp, ci) => {
      const campUnlocked = App.unlocked || ci === 0 || campaignCleared(CAMPAIGNS[ci - 1].id);
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
        const prevDone = App.unlocked || i === 0 || (App.progress[camp.levelIds[i - 1]] && App.progress[camp.levelIds[i - 1]].done);
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
      document.createTextNode('  ·  '),
      el('a', { class: 'link', onclick: showUnlock }, [App.unlocked ? '🔒 Re-lock campaigns' : '🔓 Reviewer 2 backdoor']),
    ]);
    wrap.appendChild(hint);
    root.appendChild(wrap);
  }

  // ---- the "Reviewer 2 backdoor": unlock all campaigns with the magic phrase ----
  const UNLOCK_WORDS = [
    'trendingtowardsignificance', 'marginallysignificant', 'p<0.05', 'p<.05',
    'p=0.051', 'p=.051', 'reviewer2', 'justonemoreparticipant', 'pleasereviewer2',
  ];
  function showUnlock() {
    if (App.unlocked) { // toggle off
      App.unlocked = false; saveUnlock(); toast('🔒 Campaigns re-locked. Integrity restored (for now).'); renderStart(); return;
    }
    const body = el('div');
    body.appendChild(el('h2', { text: '🔓 Reviewer 2 Backdoor' }));
    body.appendChild(el('div', { class: 'hint', html: 'Unlock every campaign without earning it — for lecturers, playtesters, and the impatient. Whisper the magic, marginally-significant words.' }));
    const inp = el('input', { type: 'text', placeholder: 'the magic phrase…', style: 'padding:7px;width:100%;margin-top:8px;border:1px solid #9a958a;border-radius:4px' });
    body.appendChild(inp);
    const tryUnlock = () => {
      const norm = String(inp.value || '').toLowerCase().replace(/\s+/g, '');
      if (UNLOCK_WORDS.indexOf(norm) >= 0) {
        App.unlocked = true; saveUnlock(); closeModal();
        toast('🔓 Access granted. Reviewer 2 looks the other way.');
        renderStart();
      } else {
        toast('❌ "' + (inp.value || '') + '"? Reject. Major revisions. (Hint: what does a researcher call p = 0.06?)');
      }
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
    const row = el('div', { class: 'btnrow' });
    row.appendChild(el('button', { class: 'btn', onclick: tryUnlock }, ['Unlock']));
    row.appendChild(el('button', { class: 'btn ghost', onclick: closeModal }, ['Cancel']));
    body.appendChild(row);
    modal('Reviewer 2 Backdoor', body, { dismissable: true });
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
    const label = el('div', { class: 'menu-label', text: name, tabindex: '0', role: 'button', 'aria-haspopup': 'true' });
    m.appendChild(label);
    const dd = el('div', { class: 'dropdown', role: 'menu' });
    items(name).forEach((it) => {
      if (it.sep) { dd.appendChild(el('div', { class: 'sep' })); return; }
      const cls = 'item' + (it.disabled ? ' disabled' : '') + (it.danger ? ' danger' : '');
      const node = el('div', { class: cls, title: it.tip || '', role: 'menuitem', tabindex: it.disabled ? '-1' : '0', 'aria-label': it.label + (it.cost ? ', ' + it.cost : '') }, [
        el('span', { text: it.label }),
        el('span', { class: 'cost', text: it.cost || '' }),
      ]);
      if (!it.disabled) {
        const act = (e) => { e.stopPropagation(); closeMenus(); it.run(); };
        node.addEventListener('click', act);
        node.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault && e.preventDefault(); act(e); } });
      }
      dd.appendChild(node);
    });
    m.appendChild(dd);
    const toggle = (e) => {
      e.stopPropagation();
      const wasOpen = m.classList.contains('open');
      closeMenus();
      if (!wasOpen) m.classList.add('open');
    };
    label.addEventListener('click', toggle);
    label.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault && e.preventDefault(); toggle(e); } });
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
        { label: '📖 Methods Codex', tip: 'What each trick really is, and how to do it right.', run: () => showCodex() },
        { label: 'Cite this software', run: () => toast('Desperate, A. (2026). PSPSS [Software]. Self-published, weeping.') },
      ];
    }
    // tool menus — only show tools relevant to this level (toolEnabled honours allowedTools)
    // Show only tools you can actually use here (enabled diagnostics + applicable
    // interventions). No greyed clutter — irrelevant tools for this level/paradigm
    // simply don't appear.
    return E.TOOLS.filter((t) => t.menu === menuName)
      .map((t) => ({ t, enabled: E.toolEnabled(st, t) && !(locked && t.kind === 'intervention') }))
      .filter((x) => x.enabled)
      .map(({ t }) => ({
        label: t.label,
        tip: C.tooltip(t.id, App.mode),
        cost: t.kind === 'diagnostic' ? 'free' : '+1 move' + (t.suspicion ? ' · +' + t.suspicion + '%' : ''),
        danger: t.danger,
        disabled: false,
        run: () => onTool(t.id),
      }));
  }

  // ---- applying tools ----
  function onTool(toolId) {
    const tool = E.TOOLS.find((t) => t.id === toolId);
    if (tool.needsChoice === 'dv') return chooseDV();
    if (tool.needsChoice === 'test') return chooseFromList('Choose Statistical Test', App.state.level.tests, (o) => doTool('choose-test', { method: o.id }));
    if (tool.needsChoice === 'lmm') return chooseFromList('Specify Random-Effects Structure', [{ id: 'max', label: 'Maximal (random intercept + slope)' }, { id: 'ri', label: 'Random intercept only' }], (o) => doTool('fit-lmm', { structure: o.id }));
    if (tool.needsChoice === 'control') return chooseFromList('Add a Covariate', App.state.level.candidateControls.concat([{ id: null, label: 'None (remove covariate)' }]), (o) => doTool('add-control', { var: o.id }));
    if (tool.needsChoice === 'prior') return chooseFromList('Set Cauchy Prior Width (r)', PRIOR_OPTS, (o) => doTool('set-prior', { r: o.r }));
    if (tool.needsChoice === 'correction') return chooseFromList('Correct for Multiple Comparisons', [{ id: 'bh', label: 'Benjamini-Hochberg (FDR)' }, { id: 'bonferroni', label: 'Bonferroni (family-wise)' }], (o) => doTool('correct-comparisons', { method: o.id }));
    if (tool.needsChoice === 'df') return chooseFromList('Choose Degrees of Freedom', [{ id: 'finite', label: 'Finite (Satterthwaite / between-within)' }, { id: 'z', label: 'Wald z (infinite df)' }], (o) => doTool('choose-df', { method: o.id }));
    if (tool.needsChoice === 'glmm') return chooseFromList('Choose the Model Family', [{ id: 'gaussian', label: 'Gaussian LMM (normal errors)' }, { id: 'binomial', label: 'Logistic GLMM (binomial)' }, { id: 'poisson', label: 'Poisson GLMM' }, { id: 'poisson-olre', label: 'Poisson GLMM + observation-level RE' }], (o) => doTool('fit-glmm', o.id === 'poisson-olre' ? { family: 'poisson', olre: true } : { family: o.id }));
    if (tool.danger) return confirmFabricate();
    doTool(toolId);
  }

  function doTool(toolId, payload) {
    const res = E.applyTool(App.state, toolId, payload);
    if (res.error) { toast(res.error); return; }
    sfx('move');
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
      el('div', { class: 'statusbadge', text: a.win ? '✓ goal met' : '✗ goal not met' }),
    ]);
    pCard.setAttribute('role', 'status');
    pCard.setAttribute('aria-label', a.metricLabel + ' ' + fmtMetric(a) + ', goal ' + a.goalText + ', ' + (a.win ? 'met' : 'not met'));
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
    row.appendChild(el('td', { class: 'out-p ' + (a.win ? 'sig' : 'nsig'), text: (a.win ? '✓ ' : '✗ ') + fmtMetric(a) }));
    tbl.appendChild(row);
    block.appendChild(tbl);

    // effect size + 95% CI — significance is not importance
    if (a.effect !== undefined && a.effect !== null && Number.isFinite(a.effect)) {
      const ciTxt = a.ci ? `, 95% CI [${fmt(a.ci.lo, 2)}, ${fmt(a.ci.hi, 2)}]` : '';
      const spansZero = a.ci && a.ci.lo < 0 && a.ci.hi > 0;
      block.appendChild(el('div', { class: 'out-note out-effect', html: `Effect size: Cohen's <i>d</i> = <b>${fmt(a.effect, 2)}</b>${ciTxt}` + (spansZero ? ' <span class="out-flag">— CI spans zero</span>' : '') }));
    }

    if (a.significant && !a.win && App.state.level.objective !== 'honest') {
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
    const m = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': barText });
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
  function modalOpen() { const r = $('#modal-root'); return r && r.children && r.children.length > 0; }
  // Keyboard: Esc closes a modal; Enter triggers its primary button (unless typing).
  document.addEventListener('keydown', (e) => {
    if (!modalOpen()) return;
    if (e.key === 'Escape') { closeModal(); }
    else if (e.key === 'Enter') {
      const tag = ((e.target && e.target.tagName) || '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      const b = $('#modal-root').querySelector('.btn');
      if (b) { e.preventDefault && e.preventDefault(); b.click(); }
    }
  });

  function showBriefing() {
    const lv = App.state.level;
    const body = el('div');
    body.appendChild(el('h2', { text: lv.title }));
    body.appendChild(el('div', { class: 'rank', style: 'font-style:italic;color:#6b6450;margin-bottom:8px', text: lv.rank }));
    body.appendChild(el('div', { html: lv.brief }));
    body.appendChild(el('div', { class: 'hyp', html: '<b>Your hypothesis:</b> ' + lv.hypothesis }));

    // HOUSE RULE banner when the bar is stricter than the usual .05 / BF>3
    const a0 = E.analyze(App.state);
    const strict = lv.winThreshold != null && (a0.metricKind === 'bf' ? lv.winThreshold > 3 : lv.winThreshold < 0.05);
    if (strict) {
      const bar = a0.metricKind === 'bf' ? 'BF₁₀ > ' + lv.winThreshold : 'p < ' + lv.winThreshold;
      body.appendChild(el('div', { class: 'house-rule', html: `🏛️ <b>HOUSE RULE.</b> The reviewers here smell a rat at the usual threshold. Nothing counts unless you clear <b>${bar}</b>. (Yes, that's a real thing — some fields now demand p &lt; .005 to call a result "significant". Benjamin et al., 2018.)` }));
    }

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
    sfx(event === 'retract' ? 'bad' : 'win');

    if (event === 'win' && lv.objective === 'honest') {
      // Campaign 4: you reached a defensible conclusion the right way.
      body.appendChild(el('h2', { class: 'win', text: '🪪 Defensible Conclusion — Credibly Published' }));
      body.appendChild(el('div', { html: `Your finding is one a reviewer can <i>trust</i> and a replicator can <i>reproduce</i> — reached in <b>${st.moves}</b> move(s) with <b>0%</b> suspicion. No torture required.<br><br>This is what good science feels like: less glamorous, far more durable.` }));
      body.appendChild(starRow({ stars: stars.stars, clean: true }));
      recordResult({ done: true, stars: stars.stars, clean: true, honest: true });
    } else if (event === 'win') {
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

    const newly = updateCareer(event, a, stars);

    // The debrief is the lesson — make it the natural next step.
    const row = el('div', { class: 'btnrow' });
    row.appendChild(el('button', { class: 'btn', onclick: () => showDebrief(event, a, newly) }, ['📋 What really happened →']));
    row.appendChild(el('button', { class: 'btn ghost', onclick: () => { closeModal(); renderStart(); } }, ['Skip to Map']));
    body.appendChild(row);
    modal(event === 'win' ? 'Manuscript Decision: ACCEPT' : 'Study Concluded', body);
  }

  // update persistent career stats + unlock achievements; returns newly unlocked ids
  function updateCareer(event, a, stars) {
    const lv = App.state.level;
    const strict = lv.winThreshold != null && (a.metricKind === 'bf' ? lv.winThreshold >= 10 : lv.winThreshold <= 0.01);
    if (event === 'win') { App.career.publications++; if (stars.clean) App.career.cleanWins++; if (strict) App.career.p001Wins++; }
    else if (event === 'retract') App.career.retractions++;
    else if (event === 'honest' || event === 'prereg-null') App.career.honestNulls++;
    let newly = [];
    if (K) {
      const ctx = { event, level: lv, state: App.state, stars: stars.stars, suspicion: App.state.suspicion, moves: App.state.moves, par: lv.par, career: App.career };
      newly = K.evaluateAchievements(ctx, App.achievements);
      App.achievements = App.achievements.concat(newly);
    }
    saveAch();
    return newly;
  }

  function navButtons(event) {
    const row = el('div', { class: 'btnrow' });
    const next = App.levelIndex + 1;
    const lv = App.state.level;
    const nextSameCampaign = next < LEVELS.length && campaignOf(LEVELS[next].id) === campaignOf(lv.id);
    if ((event === 'win' || event === 'honest' || event === 'prereg-null') && nextSameCampaign) {
      row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(); startLevel(next); } }, ['Next Study ▸']));
    }
    if (event === 'retract' || event === 'prereg-null') {
      row.appendChild(el('button', { class: 'btn', onclick: () => { closeModal(); startLevel(App.levelIndex); } }, ['Try Again']));
    }
    row.appendChild(el('button', { class: 'btn ghost', onclick: () => { closeModal(); renderStart(); } }, ['Campaign Map']));
    return row;
  }

  // ---- the post-level DEBRIEF: the educational payoff ----
  function showDebrief(event, a, newly) {
    const lv = App.state.level;
    const info = K && K.QRP_INFO[lv.flaw];
    const tenure = App.mode === 'tenure';
    const body = el('div');
    body.appendChild(el('h2', { text: '📋 Debrief: ' + lv.title }));

    // what you did (mapped from the move log)
    const used = [];
    App.state.log.forEach((e) => { if (e.move && e.toolId && K && K.TOOL_LABEL[e.toolId]) used.push(K.TOOL_LABEL[e.toolId]); });
    if (used.length) body.appendChild(el('div', { class: 'dbf', html: '<b>What you did:</b> you ' + used.join('; then ') + '.' }));

    // the truth reveal
    const reveal = el('div', { class: 'reveal' });
    if (event === 'win' && lv.objective === 'honest') {
      reveal.className = 'reveal good';
      reveal.innerHTML = lv.truth && lv.truth.exists
        ? '✅ <b>Done right.</b> A real effect, established by a method a reviewer can trust and a replicator can reproduce. This is the antidote to everything in Campaigns 1–3.'
        : '✅ <b>Done right.</b> You reached the correct, defensible conclusion — which here was that there is no (meaningful) effect. Reporting that credibly is real science, not a failure.';
    } else if (event === 'retract') {
      reveal.className = 'reveal bad';
      reveal.innerHTML = '🚨 <b>Caught.</b> You fabricated data and PubPeer noticed. This is the one move that is not a "questionable" practice — it is fraud.';
    } else if (event === 'honest' || event === 'prereg-null') {
      reveal.className = 'reveal good';
      reveal.innerHTML = lv.truth && lv.truth.exists
        ? '🕊️ <b>You walked away from a real (but unprovable-here) effect.</b> Honest, if costly — exactly the trade-off that makes good science hard.'
        : '🕊️ <b>You were right to walk away — there was nothing here.</b> A null, honestly reported, is real knowledge.';
    } else if (lv.truth && lv.truth.exists === false) {
      reveal.className = 'reveal bad';
      reveal.innerHTML = '🎭 <b>That was a FALSE POSITIVE.</b> There was no real effect in the data-generating process — you manufactured the result. This is precisely how false findings enter the literature.';
    } else if (lv.flaw === 'wrong-direction') {
      reveal.className = 'reveal warn';
      reveal.innerHTML = '🔁 <b>A real effect existed — but OPPOSITE to your hypothesis.</b> You rewrote the prediction to match it (HARKing). The finding is "true", the inference is theatre.';
    } else {
      reveal.className = 'reveal warn';
      reveal.innerHTML = '⚠️ <b>The effect was real — but your route to it was invalid.</b> A reviewer can\'t distinguish your "significant" result from luck, and it may not replicate.';
    }
    body.appendChild(reveal);

    // effect size honesty
    if (a && a.effect !== undefined && Number.isFinite(a.effect)) {
      const ciTxt = a.ci ? ` (95% CI of the difference [${fmt(a.ci.lo, 2)}, ${fmt(a.ci.hi, 2)}]${a.ci.lo < 0 && a.ci.hi > 0 ? ', which spans zero' : ''})` : '';
      body.appendChild(el('div', { class: 'dbf', html: `<b>Effect size:</b> Cohen's <i>d</i> = ${fmt(a.effect, 2)}${ciTxt}. Remember: a small p-value is not a large or certain effect.` }));
    }

    // the QRP lesson
    if (info) {
      const verdictTag = info.verdict === 'context' ? '<span class="vtag ctx">context-dependent</span>' : info.verdict === 'honest' ? '<span class="vtag ok">the honest path</span>' : '<span class="vtag bad">questionable practice</span>';
      const lesson = el('div', { class: 'lesson' });
      lesson.innerHTML = `<div class="lesson-h">${info.term} ${verdictTag}</div>` +
        `<div>${info.plain}</div>` +
        `<div class="lesson-harm"><b>Why it matters:</b> ${info.harm}</div>` +
        `<div><b>Do instead:</b> ${info.antidote}</div>` +
        (tenure ? `<div class="lesson-cite">${info.realCase}<br><i>${info.citation}</i></div>` : '');
      body.appendChild(lesson);
      const link = el('a', { class: 'link', onclick: () => showCodex(lv.flaw) }, ['Open in Methods Codex →']);
      body.appendChild(el('div', { style: 'margin-top:6px' }, [link]));
    }

    if (newly && newly.length && K) {
      const names = newly.map((id) => (K.ACHIEVEMENTS.find((x) => x.id === id) || {}).title).filter(Boolean);
      if (names.length) body.appendChild(el('div', { class: 'ach-pop', html: '🏅 <b>Achievement unlocked:</b> ' + names.join(', ') }));
    }

    body.appendChild(navButtons(event));
    modal('Debrief', body);
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

  // ======================= METHODS CODEX =======================
  function showCodex(focusFlaw) {
    const body = el('div');
    body.appendChild(el('h2', { text: '📖 Methods Codex' }));
    body.appendChild(el('div', { class: 'hint', text: 'Every trick in the game is a real Questionable Research Practice. Here is what each one is, why it misleads, and how to do it right.' }));
    const keys = Object.keys(K.QRP_INFO);
    keys.sort((a, b) => (a === focusFlaw ? -1 : b === focusFlaw ? 1 : 0));
    keys.forEach((k) => {
      const e = K.QRP_INFO[k];
      const vt = e.verdict === 'context' ? '<span class="vtag ctx">context-dependent</span>' : e.verdict === 'honest' ? '<span class="vtag ok">the honest path</span>' : '<span class="vtag bad">questionable practice</span>';
      const card = el('div', { class: 'codex-card' + (k === focusFlaw ? ' focus' : '') });
      card.innerHTML = `<div class="lesson-h">${e.term} ${vt}</div><div>${e.plain}</div>` +
        `<div class="lesson-harm"><b>Harm:</b> ${e.harm}</div>` +
        `<div><b>Antidote:</b> ${e.antidote}</div>` +
        `<div class="lesson-cite">${e.realCase}<br><i>${e.citation}</i></div>`;
      body.appendChild(card);
    });
    body.appendChild(el('div', { class: 'btnrow' }, [el('button', { class: 'btn', onclick: closeModal }, ['Close'])]));
    modal('Methods Codex', body, { dismissable: true });
  }

  // ======================= CAREER DASHBOARD =======================
  function replicationRate() {
    let survived = 0, total = 0;
    LEVELS.forEach((lv) => {
      const p = App.progress[lv.id];
      if (!p || !p.done) return;
      total++;
      if (p.honest || p.prereg || (p.suspicion || 0) <= 20) survived++;
    });
    return total ? Math.round((survived / total) * 100) : 0;
  }
  function showDashboard() {
    const c = App.career;
    const body = el('div');
    body.appendChild(el('h2', { text: '🎓 Career Dashboard' }));
    const cleared = LEVELS.filter((l) => App.progress[l.id] && App.progress[l.id].done).length;
    const stats = [
      ['Publications', c.publications], ['Retractions', c.retractions], ['Honest nulls', c.honestNulls],
      ['Clean wins', c.cleanWins], ['"Decisive" wins', c.p001Wins], ['Levels cleared', cleared + ' / ' + LEVELS.length],
      ['Est. replication rate', replicationRate() + '%'],
    ];
    const grid = el('div', { class: 'dash-grid' });
    stats.forEach(([k, v]) => grid.appendChild(el('div', { class: 'dash-stat' }, [el('div', { class: 'k', text: k }), el('div', { class: 'v', text: String(v) })])));
    body.appendChild(grid);

    body.appendChild(el('div', { class: 'lesson-h', style: 'margin-top:12px', text: 'Achievements' }));
    const ach = el('div', { class: 'ach-list' });
    K.ACHIEVEMENTS.forEach((a) => {
      const got = App.achievements.indexOf(a.id) >= 0;
      ach.appendChild(el('div', { class: 'ach-item' + (got ? ' got' : ''), html: `${got ? '🏅' : '🔒'} <b>${a.title}</b> — ${got ? a.desc : '???'}` }));
    });
    body.appendChild(ach);

    const row = el('div', { class: 'btnrow' });
    if (cleared > 0) row.appendChild(el('button', { class: 'btn', onclick: replicationEpilogue }, ['Run Replication Crisis']));
    row.appendChild(el('button', { class: 'btn ghost', onclick: () => { if (App.confirmWipe) { App.progress = {}; App.achievements = []; App.career = loadCareer(); save(); saveAch(); showDashboard(); } else { App.confirmWipe = true; toast('Tap "Wipe career" again to confirm.'); } } }, ['Wipe career']));
    row.appendChild(el('button', { class: 'btn ghost', onclick: closeModal }, ['Close']));
    body.appendChild(row);
    modal('Career Dashboard', body, { dismissable: true });
  }

  // ======================= SANDBOX LAB =======================
  function showSandbox() {
    const p = { n: 20, d: 0.5, sd: 10, mode: 't', r: 0.707 };
    const body = el('div');
    body.appendChild(el('h2', { text: '🧪 Sandbox Lab' }));
    body.appendChild(el('div', { class: 'hint', html: 'No game, no stakes — build intuition. Drag the sliders and watch the evidence react. Try: shrink <i>n</i> and watch <i>p</i> lurch; switch to Bayes and widen the prior to watch BF sink.' }));
    const fig = el('div', {});
    const out = el('div', { style: 'font-family:Consolas,monospace;font-size:13px;margin:8px 0;min-height:40px' });
    const controls = el('div', {});

    function mkSlider(label, key, min, max, step, fmtv) {
      const wrap = el('div', { style: 'display:flex;align-items:center;gap:8px;margin:4px 0' });
      const lab = el('div', { style: 'width:170px;font-size:12px' });
      const val = el('span');
      const inp = el('input', { type: 'range', min: min, max: max, step: step, value: p[key], style: 'flex:1' });
      const setLab = () => { val.textContent = fmtv ? fmtv(p[key]) : p[key]; lab.innerHTML = label + ': <b>' + val.textContent + '</b>'; };
      inp.addEventListener('input', () => { p[key] = parseFloat(inp.value); setLab(); recompute(); });
      setLab();
      wrap.appendChild(lab); wrap.appendChild(inp);
      return wrap;
    }
    function recompute() {
      const rng = RNG(20260617);
      const A = [], B = [];
      for (let i = 0; i < p.n; i++) A.push(rng.normal(50, p.sd));
      for (let i = 0; i < p.n; i++) B.push(rng.normal(50 + p.d * p.sd, p.sd));
      const tt = Stats.tTestIndependent(B, A, false);
      const d = Stats.cohenD(A, B);
      const ci = Stats.meanDiffCI(A, B);
      out.innerHTML = '';
      if (p.mode === 't') {
        const sig = tt.p < 0.05;
        out.innerHTML = `t(${fmt(tt.df, 0)}) = ${fmt(tt.t, 2)},  <b style="color:${sig ? '#15803d' : '#b91c1c'}">p = ${pfmt(tt.p)}</b>` +
          `   ·   d = ${fmt(d, 2)}, 95% CI [${fmt(ci.lo, 2)}, ${fmt(ci.hi, 2)}]`;
      } else {
        const bf = PSPSS_bayes ? PSPSS_bayes.bf10TwoSample(tt.t, p.n, p.n, p.r) : NaN;
        out.innerHTML = `<b style="color:${bf > 3 ? '#15803d' : '#b91c1c'}">BF₁₀ = ${bf >= 100 ? bf.toFixed(0) : bf.toFixed(2)}</b> (prior r=${p.r})   ·   d = ${fmt(d, 2)}`;
      }
      fig.innerHTML = '';
      try { fig.appendChild(PSPSS_charts.boxplotByGroup([{ label: 'A', values: A }, { label: 'B', values: B }], { title: 'Sandbox data', ylabel: 'outcome' })); } catch (e) {}
    }

    const modeRow = el('div', { class: 'btnrow', style: 'margin:6px 0' });
    const tBtn = el('button', { class: 'btn', onclick: () => { p.mode = 't'; tBtn.className = 'btn'; bBtn.className = 'btn ghost'; rWrap.style.display = 'none'; recompute(); } }, ['Frequentist (p)']);
    const bBtn = el('button', { class: 'btn ghost', onclick: () => { p.mode = 'b'; bBtn.className = 'btn'; tBtn.className = 'btn ghost'; rWrap.style.display = ''; recompute(); } }, ['Bayesian (BF)']);
    modeRow.appendChild(tBtn); modeRow.appendChild(bBtn);
    controls.appendChild(modeRow);
    controls.appendChild(mkSlider('n per group', 'n', 4, 200, 1));
    controls.appendChild(mkSlider('true effect (d)', 'd', 0, 1.5, 0.05, (v) => v.toFixed(2)));
    controls.appendChild(mkSlider('SD', 'sd', 2, 30, 1));
    const rWrap = mkSlider('prior width r', 'r', 0.1, 2, 0.05, (v) => v.toFixed(2));
    rWrap.style.display = 'none';
    controls.appendChild(rWrap);

    body.appendChild(controls);
    body.appendChild(out);
    body.appendChild(fig);
    body.appendChild(el('div', { class: 'btnrow' }, [el('button', { class: 'btn', onclick: closeModal }, ['Close'])]));
    modal('Sandbox Lab', body, { dismissable: true });
    recompute();
  }

  // ======================= META-SCIENCE LAB =======================
  // The reviewer's view: detect p-hacking & publication bias, and plan studies.
  function metaSlider(p, key, label, min, max, step, fmtv, on) {
    const wrap = el('div', { style: 'display:flex;align-items:center;gap:8px;margin:4px 0' });
    const lab = el('div', { style: 'width:190px;font-size:12px' });
    const inp = el('input', { type: 'range', min: min, max: max, step: step, value: p[key], style: 'flex:1' });
    const setLab = () => { lab.innerHTML = label + ': <b>' + (fmtv ? fmtv(p[key]) : p[key]) + '</b>'; };
    inp.addEventListener('input', () => { p[key] = parseFloat(inp.value); setLab(); on(); });
    setLab(); wrap.appendChild(lab); wrap.appendChild(inp);
    return wrap;
  }
  function showMetaLab() {
    let tab = 'pcurve';
    const body = el('div');
    body.appendChild(el('h2', { text: '🔬 Meta-Science Lab' }));
    body.appendChild(el('div', { class: 'hint', text: 'Flip from perpetrator to reviewer. Detect p-hacking and publication bias in a simulated literature — and plan an honest study.' }));
    const tabs = el('div', { class: 'btnrow', style: 'margin:6px 0' });
    const content = el('div');
    const TABS = [['pcurve', 'p-curve'], ['funnel', 'Funnel / bias'], ['power', 'Power'], ['tost', 'Equivalence']];
    function render() {
      tabs.innerHTML = '';
      TABS.forEach(([id, name]) => tabs.appendChild(el('button', { class: 'btn' + (id === tab ? '' : ' ghost'), onclick: () => { tab = id; render(); } }, [name])));
      content.innerHTML = '';
      const fig = el('div'); const out = el('div', { style: 'font-family:Consolas,monospace;font-size:13px;margin:6px 0;min-height:34px' });
      if (tab === 'pcurve') {
        const p = { d: 0.0, hack: 0 };
        const go = () => {
          const rng = RNG(7); const ps = [];
          for (let k = 0; k < 600; k++) {
            if (rng.next() < p.hack / 100) { ps.push(0.05 * Math.pow(rng.next(), 0.25)); } // p-hacked: piled near .05
            else { const A = [], B = []; for (let i = 0; i < 20; i++) { A.push(rng.normal(0, 1)); B.push(rng.normal(p.d, 1)); } const pv = Stats.tTestIndependent(A, B, false).p; if (pv < 0.05) ps.push(pv); }
          }
          out.innerHTML = `${ps.length} "significant" studies. <b>Right-skew → real effect; flat → null; left-skew (piled near .05) → p-hacked.</b>`;
          fig.innerHTML = ''; try { fig.appendChild(PSPSS_charts.pcurve(ps, {})); } catch (e) {}
        };
        content.appendChild(metaSlider(p, 'd', 'true effect (d)', 0, 1, 0.05, (v) => v.toFixed(2), go));
        content.appendChild(metaSlider(p, 'hack', '% of studies p-hacked', 0, 100, 5, null, go));
        content.appendChild(out); content.appendChild(fig); go();
      } else if (tab === 'funnel') {
        const p = { d: 0.3, bias: 0 };
        const go = () => {
          const rng = RNG(11); const pts = [];
          for (let k = 0; k < 120; k++) {
            const n = 8 + Math.floor(rng.next() * 120); const se = 1 / Math.sqrt(n / 2);
            const est = rng.normal(p.d, se);
            const sig = Math.abs(est / se) > 1.96;
            if (!sig && rng.next() < p.bias / 100) continue; // file-drawer the null small studies
            pts.push({ effect: est, se: se });
          }
          out.innerHTML = `${pts.length} published studies. <b>A symmetric funnel is healthy; a missing bottom-corner = publication bias.</b>`;
          fig.innerHTML = ''; try { fig.appendChild(PSPSS_charts.funnel(pts, { center: p.d })); } catch (e) {}
        };
        content.appendChild(metaSlider(p, 'd', 'true effect (d)', 0, 1, 0.05, (v) => v.toFixed(2), go));
        content.appendChild(metaSlider(p, 'bias', 'publication bias', 0, 100, 5, null, go));
        content.appendChild(out); content.appendChild(fig); go();
      } else if (tab === 'power') {
        const p = { d: 0.5, alpha: 0.05, power: 0.8 };
        const go = () => {
          const N = Stats.requiredN(p.d, p.alpha, p.power);
          const za = Stats.probit(1 - p.alpha / 2);
          const xs = [], ys = [];
          for (let n = 5; n <= Math.max(120, N + 20); n += 5) { xs.push(n); ys.push(100 * Stats.normalCDF(p.d * Math.sqrt(n / 2) - za)); }
          out.innerHTML = `For d=${p.d.toFixed(2)}, α=${p.alpha}, power=${(p.power * 100).toFixed(0)}% you need <b>N ≈ ${N} per group</b>.`;
          fig.innerHTML = ''; try { fig.appendChild(PSPSS_charts.line(xs, ys, { title: 'Power vs N (per group)', xlabel: 'N per group', ylabel: 'power (%)', rule: p.power * 100 })); } catch (e) {}
        };
        content.appendChild(metaSlider(p, 'd', 'effect (d)', 0.1, 1.2, 0.05, (v) => v.toFixed(2), go));
        content.appendChild(metaSlider(p, 'alpha', 'α', 0.001, 0.1, 0.001, (v) => v.toFixed(3), go));
        content.appendChild(metaSlider(p, 'power', 'target power', 0.5, 0.99, 0.01, (v) => v.toFixed(2), go));
        content.appendChild(out); content.appendChild(fig); go();
      } else if (tab === 'tost') {
        const p = { d: 0.0, n: 50, bound: 0.4 };
        const go = () => {
          const rng = RNG(13); const A = [], B = [];
          for (let i = 0; i < p.n; i++) { A.push(rng.normal(0, 1)); B.push(rng.normal(p.d, 1)); }
          const r = Stats.tost(A, B, p.bound);
          out.innerHTML = `Observed d≈${p.d.toFixed(2)}, n=${p.n}/group, bound ±${p.bound.toFixed(2)} SD → <b style="color:${r.equivalent ? '#15803d' : '#b91c1c'}">${r.equivalent ? 'EQUIVALENT (can claim "no meaningful effect")' : 'NOT equivalent (inconclusive)'}</b>`;
          fig.innerHTML = ''; try { fig.appendChild(PSPSS_charts.boxplotByGroup([{ label: 'A', values: A }, { label: 'B', values: B }], { title: 'Equivalence (TOST)', ylabel: 'value' })); } catch (e) {}
        };
        content.appendChild(metaSlider(p, 'd', 'true effect (d)', 0, 1, 0.05, (v) => v.toFixed(2), go));
        content.appendChild(metaSlider(p, 'n', 'n per group', 10, 300, 5, null, go));
        content.appendChild(metaSlider(p, 'bound', 'equivalence bound (SD)', 0.1, 1, 0.05, (v) => v.toFixed(2), go));
        content.appendChild(out); content.appendChild(fig); go();
      }
    }
    body.appendChild(tabs); body.appendChild(content);
    body.appendChild(el('div', { class: 'btnrow' }, [el('button', { class: 'btn', onclick: closeModal }, ['Close'])]));
    modal('Meta-Science Lab', body, { dismissable: true });
    render();
  }

  // ======================= SPOT-THE-QRP QUIZ =======================
  function showQuiz() {
    let idx = 0, score = 0;
    function render() {
      const item = K.QUIZ_ITEMS[idx];
      const picks = new Set();
      let trustPick = null;
      const body = el('div');
      body.appendChild(el('h2', { text: `🔍 Spot the QRP  (${idx + 1}/${K.QUIZ_ITEMS.length})` }));
      body.appendChild(el('div', { class: 'quiz-scenario', text: item.scenario }));
      body.appendChild(el('div', { class: 'hint', text: 'Tick every questionable practice you can spot:' }));
      const opts = el('div', { class: 'quiz-opts' });
      K.QUIZ_OPTIONS.forEach((qk) => {
        const lab = el('label', { class: 'quiz-opt' });
        const cb = el('input', { type: 'checkbox' });
        cb.addEventListener('change', () => { cb.checked ? picks.add(qk) : picks.delete(qk); });
        lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + K.QRP_INFO[qk].term));
        opts.appendChild(lab);
      });
      body.appendChild(opts);
      const trustRow = el('div', { class: 'btnrow', style: 'margin-top:8px' });
      const ty = el('button', { class: 'btn ghost', onclick: () => { trustPick = true; ty.className = 'btn'; tn.className = 'btn ghost'; } }, ['Trust it ✅']);
      const tn = el('button', { class: 'btn ghost', onclick: () => { trustPick = false; tn.className = 'btn'; ty.className = 'btn ghost'; } }, ["Don't trust ❌"]);
      trustRow.appendChild(el('span', { class: 'hint', style: 'align-self:center;margin-right:6px', text: 'Verdict:' }));
      trustRow.appendChild(ty); trustRow.appendChild(tn);
      body.appendChild(trustRow);

      const fb = el('div', {});
      body.appendChild(fb);
      const actions = el('div', { class: 'btnrow' });
      const submit = el('button', { class: 'btn', onclick: () => {
        const correctSet = new Set(item.qrps);
        const hits = [...picks].filter((x) => correctSet.has(x)).length;
        const wrong = [...picks].filter((x) => !correctSet.has(x)).length;
        const found = hits === correctSet.size && wrong === 0;
        const trustOK = trustPick === item.trust;
        if (found && trustOK) score++;
        fb.innerHTML = '';
        fb.appendChild(el('div', { class: 'reveal ' + (found && trustOK ? 'good' : 'warn'),
          html: (found && trustOK ? '✅ Correct.' : '❌ Not quite.') + ' ' + item.explain +
            (correctSet.size ? '<br><b>QRPs present:</b> ' + item.qrps.map((k) => K.QRP_INFO[k].term).join(', ') : '<br>This one is trustworthy — no QRPs.') }));
        submit.remove();
        actions.appendChild(el('button', { class: 'btn', onclick: () => { idx++; if (idx < K.QUIZ_ITEMS.length) render(); else finish(); } }, [idx + 1 < K.QUIZ_ITEMS.length ? 'Next ▸' : 'See score']));
      } }, ['Submit']);
      actions.appendChild(submit);
      actions.appendChild(el('button', { class: 'btn ghost', onclick: closeModal }, ['Quit']));
      body.appendChild(actions);
      modal('Spot the QRP', body, { dismissable: true });
    }
    function finish() {
      const body = el('div');
      body.appendChild(el('h2', { text: '🔍 Quiz Complete' }));
      body.appendChild(el('div', { html: `You correctly assessed <b>${score}/${K.QUIZ_ITEMS.length}</b> studies. ` + (score === K.QUIZ_ITEMS.length ? 'A natural-born Reviewer 2.' : 'The Methods Codex awaits.') }));
      body.appendChild(el('div', { class: 'btnrow' }, [
        el('button', { class: 'btn', onclick: showQuiz }, ['Again']),
        el('button', { class: 'btn ghost', onclick: showCodex }, ['Open Codex']),
        el('button', { class: 'btn ghost', onclick: closeModal }, ['Close']),
      ]));
      modal('Spot the QRP', body, { dismissable: true });
    }
    render();
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
