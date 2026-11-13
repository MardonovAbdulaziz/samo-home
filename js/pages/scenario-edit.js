/* Scenario editor — one screen for scenes (tap to run) and automations.
   Reads top to bottom like the sentence it builds: Starts when … · Only if … · Do …
   The sentence itself is always visible at the top, so the user can check the logic in words. */
(() => {
  UI.mount({ variant: 'elevated' });
  const esc = UI.esc, P = UI.param, SC = Scenarios;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  let s, isNew = false, dirty = false, renamed = false;
  if (P('id')) { const o = SC.get(P('id')); if (!o) { UI.go('scenarios.html'); return; } s = clone(o); renamed = true; }
  else if (P('idea')) { const i = SC.ideas(true).find((x) => x.key === P('idea')); s = Object.assign(i ? i.make() : {}, { idea: P('idea') }); isNew = true; renamed = true; }
  else { isNew = true; const scene = P('new') === 'scene'; s = { name: scene ? 'New scene' : 'New automation', icon: scene ? 'tab-scenarios' : 'clock', manual: scene, on: true, when: [], only: [], do: [] }; }
  s = Object.assign({ when: [], only: [], do: [], on: true, log: [] }, s);
  if (isNew) { s.id = Store.uid('s'); s.log = []; }
  const touch = () => { dirty = true; render(); };

  /* ---------- rows ---------- */
  const tIcon = (t) => (t.k === 'time' ? 'clock' : t.k === 'sun' ? (t.ev === 'sunrise' ? 'sunrise' : 'moon') : t.k === 'dev' ? SC.iconOf(t.id, t.ch) : 'my-location');
  const cIcon = (c) => (c.k === 'between' ? (c.from === 'sunrise' ? 'sun' : 'moon') : c.k === 'days' ? 'clock' : SC.iconOf(c.id, c.ch));
  const aIcon = (a) => (a.k === 'dev' ? SC.iconOf(a.id, a.ch) : a.k === 'notify' ? 'bell' : a.k === 'wait' ? 'hourglass' : a.k === 'auto' ? (a.on ? 'power' : 'hand-stop') : 'tab-scenarios');
  const row = (act, i, ic, text, sub = '') => `<button class="cell scn-row" data-action="${act}" data-i="${i}">
      <span class="cell-icon">${icon(ic, 'icon')}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(text)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button>`;
  const addBtn = (act, text, key) => `<div class="pad scn-addbtn" data-key="${key}"><button class="btn btn-glass btn-block" data-action="${act}">${icon('plus')} ${esc(text)}</button></div>`;   // = valve “Add a plan”
  const condLabel = (c) => cap1(SC.condText(c).replace(/^only (if )?/, (m, f) => (f ? 'if ' : '')));
  const actSub = (a) => (a.k === 'notify' ? `“${a.text}”` : '');

  function render() {
    const auto = !s.manual, warn = SC.warnings(s);
    const title = isNew ? (s.manual ? 'New scene' : 'New automation') : 'Edit scenario';
    // same top as Device Settings: back, title, the icon with a pen, the name field
    let h = UI.toolbar({ title, back: '', plain: true }).replace('<span class="spacer"></span>', `<button class="icon-btn" data-action="cancel" aria-label="Back">${icon('back')}</button>`);
    h += `<div style="height:12px"></div><div class="edit-avatar" style="margin:0 auto 24px"><div class="ring">${icon(s.icon || 'tab-scenarios', 'icon', 'style="width:48px;height:48px"')}</div>
        <button class="pen" data-action="pick-icon" aria-label="Change icon">${icon('pen', 'icon', 'style="width:20px;height:20px"')}</button></div>
      <div class="field static" role="button" tabindex="0" data-action="rename"><span class="field-label">Scenario Name</span><div class="t-lg">${esc(s.name)}</div></div>
      <div class="scn-plain" data-key="plain"><span class="scn-plain-k">In plain words</span><p>${esc(SC.sentence(s))}</p></div>
      <div class="pad"><div class="segmented scn-mode" role="tablist">
        <button class="${s.manual ? 'on' : ''}" data-action="mode" data-v="scene" role="tab" aria-selected="${s.manual}">Tap to run</button>
        <button class="${auto ? 'on' : ''}" data-action="mode" data-v="auto" role="tab" aria-selected="${auto}">Automatic</button></div>
        <div class="scn-mode-note">${s.manual ? 'Runs when you tap it on the Scenarios page.' : 'Runs on its own — the hub keeps working even when your phone is off.'}</div></div>`;
    if (auto) {
      h += `<div class="list-header scn-lh" data-key="h-when">Starts when</div>
        ${s.when.length ? `<div class="list" data-key="l-when">${s.when.map((t, i) => row('trig', i, tIcon(t), cap1(SC.triggerText(t).replace(/^when /, '')))).join('')}</div>` : ''}${addBtn('trig-add', s.when.length ? 'Or when…' : 'Add a start', 'b-when')}
        ${s.when.length > 1 ? '<div class="list-footer" data-key="f-when">Any one of these starts it.</div>' : ''}
        <div class="list-header scn-lh" data-key="h-only">Only if <span class="scn-opt">optional</span></div>
        ${s.only.length ? `<div class="list" data-key="l-only">${s.only.map((c, i) => row('cond', i, cIcon(c), condLabel(c))).join('')}</div>` : ''}${addBtn('cond-add', s.only.length ? 'And only if…' : 'Add a condition', 'b-only')}
        <div class="list-footer" data-key="f-only">${s.only.length ? 'All of these must be true — otherwise it skips this time, and says why.' : 'For example: only at night, only on weekdays, only if the door is locked.'}</div>`;
    }
    h += `<div class="list-header scn-lh" data-key="h-do">Do</div>
      ${s.do.length ? `<div class="list" data-key="l-do">${s.do.map((a, i) => row('act', i, aIcon(a), cap1(SC.actionText(a)), actSub(a))).join('')}</div>` : ''}${addBtn('act-add', s.do.length ? 'Then…' : 'Add an action', 'b-do')}
      ${s.do.length > 1 ? '<div class="list-footer" data-key="f-do">Done from top to bottom.</div>' : ''}`;
    const nx = SC.next(s);
    if (nx.length) h += `<div class="scn-next" data-key="next">${icon('arrow-fork', 'icon')}<span>When this runs, it also starts ${nx.map((x) => `<b>${esc(x.name)}</b>`).join(', ')}.</span></div>`;
    if (warn.length) h += `<div class="pad" data-key="warn" style="margin-top:20px">${warn.map((w) => `<div class="banner warn" style="margin-top:8px">${icon('round-info')}<div>${esc(w)}</div></div>`).join('')}</div>`;
    h += `<div class="pad scn-foot" data-key="foot"><button class="btn btn-glass btn-block" data-action="try" ${s.do.length ? '' : 'disabled'}>Try it now</button>
      ${isNew ? '' : '<button class="btn btn-danger btn-block" data-action="delete">Delete scenario</button>'}</div>`;
    if (!isNew && (s.log || []).length) {
      h += `<div class="list-header" data-key="h-log">What happened</div><div class="list scn-log" data-key="l-log">${s.log.slice(0, 6).map((l) => `<div class="cell"><span class="cell-icon ${l.ok ? 'ok' : 'warn'}">${icon(l.ok ? 'check' : 'round-info', 'icon')}</span>
        <span class="cell-main"><span class="cell-title" style="display:block">${esc(l.ok ? (l.text || 'Ran') : l.text)}</span><span class="cell-sub" style="display:block">${esc(when(l.at))}${l.cause ? ' · ' + esc(l.cause) : ''}</span></span></div>`).join('')}</div>`;
    }
    h += '<div style="height:24px"></div>';
    UI.patch(UI.screen, h);
    UI.screen.classList.add('with-footer');
    let f = UI.phone.querySelector('.footer-cta');
    if (!f) { f = document.createElement('div'); f.className = 'footer-cta'; UI.phone.appendChild(f); }
    UI.patch(f, `<button class="btn btn-primary btn-block" data-action="save">${isNew ? (s.manual ? 'Add scene' : 'Add automation') : 'Save'}</button>`);
  }
  function when(t) { const d = new Date(t), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return new Date().toDateString() === d.toDateString() ? `Today ${hm}` : `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${hm}`; }

  /* ---------- sheet helpers ---------- */
  const card = (inner) => `<div class="sheet-group"><div class="group-card">${inner}</div></div>`;
  const choice = (act, ic, title, sub, data = '') => `<button class="cell" data-action="${act}" ${data}><span class="cell-icon">${icon(ic, 'icon')}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button>`;
  /* Every item sheet in the editor has Done: a choice here is not applied until Done (a preselected option
     must not look chosen while × throws it away — user, 2026-11-13). Editing an item adds Remove. */
  const done = (act, removable) => `<div class="scn-sheet-foot">${removable ? `<button class="btn btn-danger" data-action="${act}-remove">Remove</button>` : ''}<button class="btn btn-primary" data-action="${act}-done">Done</button></div>`;
  const deviceList = (role, act) => {
    const L = SC.pickable(role);
    if (!L.length) return '<div class="pad scn-none">No devices for this yet.</div>';
    const rooms = [...new Set(L.map((x) => x.room))];
    return rooms.map((r) => UI.group(r, L.filter((x) => x.room === r).map((x) => `<button class="cell" data-action="${act}" data-id="${x.id}" data-ch="${x.ch}"><span class="cell-icon">${icon(x.icon, 'icon')}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(x.name)}${x.offline ? ' <span class="cell-tag">Offline</span>' : ''}</span>${x.sub ? `<span class="cell-sub" style="display:block">${esc(x.sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button>`).join(''))).join('');
  };
  /* clock time on the Timer's wheel (UI.wheelHTML) — 07 : 30 */
  const clockWheels = (at, kh, km) => { const [hh, mm] = at.split(':').map(Number); return `<div class="tw tw-clock">${UI.wheelHTML(kh, 23, hh, '', true)}<span class="tw-colon">:</span>${UI.wheelHTML(km, 59, mm, '', true)}</div>`; };
  const bindClock = (el, x, field, kh, km) => UI.bindWheels(el, (k) => +x[field].split(':')[k === kh ? 0 : 1], (k, v) => { const p = x[field].split(':'); p[k === kh ? 0 : 1] = String(v).padStart(2, '0'); x[field] = p.join(':'); });
  /* Repeat: a radio card (Figma) — Custom opens the seven days with check marks */
  const DAYNAME = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const repKind = (days) => ({ 1234567: 'all', 12345: 'wd', 67: 'we' }[[...days].sort().join('')] || 'custom');
  const repeatCard = (x, title = 'Repeat') => {
    const k = sh && sh.ui && sh.ui.custom ? 'custom' : repKind(x.days);
    return `<div class="list-header">${title}</div><div class="list">${Kit.radio('rep', k, [['all', 'Every day', ''], ['wd', 'Weekdays', ''], ['we', 'Weekends', ''], ['custom', 'Custom', k === 'custom' ? SC.daysText(x.days).replace(/^on /, '') : '']])}</div>
      ${UI.collapse(k === 'custom', `<div class="list scn-daylist" style="margin-top:12px">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button class="scn-inline-opt" data-action="rep-day" data-d="${d}" role="checkbox" aria-checked="${x.days.includes(d)}"><span>${DAYNAME[d]}</span>${icon('check', 'icon')}</button>`).join('')}</div>`)}`;
  };
  let sh = null;   // the open sheet's draft: { kind, i, x }
  const reopen = () => sh && sh.open && sh.open();

  /* ---------- Starts when ---------- */
  function trigChooser() {
    UI.sheet({ title: 'Starts when', render: () => UI.group('', 
      choice('t-time', 'clock', 'At a time', 'e.g. 07:30 on weekdays') +
      choice('t-sun', 'sunrise', 'At sunrise or sunset', 'Moves with the seasons by itself') +
      choice('t-people', 'my-location', 'People come or go', 'Uses your phone’s location')) + deviceList('ev', 't-dev-pick') });
  }
  function trigTime(i) {
    const t = i != null ? clone(s.when[i]) : { k: 'time', at: '07:30', days: [1, 2, 3, 4, 5] };
    sh = { kind: 'trig', i, x: t, ui: { custom: repKind(t.days) === 'custom' }, open: () => UI.sheet({ title: 'At a time', render: () => `<div class="pad">${clockWheels(t.at, 'h', 'm')}</div>${repeatCard(t)}`, footer: done('trig', i != null), onMount: (el) => bindClock(el, t, 'at', 'h', 'm') }) };
    reopen();
  }
  function trigSun(i) {
    const t = i != null ? clone(s.when[i]) : { k: 'sun', ev: 'sunset', off: 0 };
    sh = { kind: 'trig', i, x: t, open: () => UI.sheet({ title: 'Sunrise or sunset', render: () => `<div class="list">${Kit.radio('sun-ev', t.ev, [['sunrise', 'Sunrise', `Today ${SC.SUN.sunrise}`], ['sunset', 'Sunset', `Today ${SC.SUN.sunset}`]])}</div>
        <div class="list" style="margin-top:16px"><div class="cell"><span class="cell-main cell-title">${t.off ? `${Math.abs(t.off)} min ${t.off < 0 ? 'before' : 'after'}` : 'Exactly at it'}</span>${Kit.stepper('sun-off', 'off', t.off ? `${t.off > 0 ? '+' : '−'}${Math.abs(t.off)}` : '0', t.off <= -60, t.off >= 60)}</div></div>`, footer: done('trig', i != null) }) };
    reopen();
  }
  function trigDevice() { UI.sheet({ title: 'Which device?', render: () => deviceList('ev', 't-dev-pick') }); }
  function trigDeviceEvent(id, ch, i) {
    const d = Store.device(id), evs = SC.cap(d).ev;
    const t = i != null ? clone(s.when[i]) : { k: 'dev', id, ch, ev: evs[0].k };
    const e = () => SC.findIn(evs, t.ev);
    if (e() && e().num && t.v == null) t.v = e().num.def;
    sh = { kind: 'trig', i, x: t, open: () => UI.sheet({ title: SC.nameOf(id, ch), render: () => {
      const n = e() && e().num;
      return `<div class="list">${Kit.radio('ev-pick', t.ev, evs.map((x) => [x.k, x.label + (x.num ? '…' : ''), '']))}</div>
        ${n ? `<div class="list" style="margin-top:16px"><div class="cell"><span class="cell-main"><span class="cell-title" style="display:block">${esc(e().label)}</span>${n.hint ? `<span class="cell-sub" style="display:block">${esc(n.hint)}</span>` : ''}</span>${Kit.stepper('ev-v', 'v', `${t.v} ${n.unit}`, t.v <= n.min, t.v >= n.max)}</div></div>` : ''}`;
    }, footer: () => done('trig', i != null, !!(e() && e().num)) }) };
    reopen();
  }
  function trigPeople(i) {
    const t = i != null ? clone(s.when[i]) : { k: 'leave' };
    sh = { kind: 'trig', i, x: t, open: () => UI.sheet({ title: 'People come or go', render: () => `<div class="list">${Kit.radio('people', t.k, [['leave', 'Everyone leaves home', 'The last phone leaves'], ['arrive', 'Someone comes home', 'The first phone arrives']])}</div>
      <div class="list-footer">Works with the Samo Home app on your family’s phones, with location turned on.</div>`, footer: done('trig', i != null) }) };
    reopen();
  }
  function openTrig(i) { const t = s.when[i]; if (t.k === 'time') trigTime(i); else if (t.k === 'sun') trigSun(i); else if (t.k === 'dev') trigDeviceEvent(t.id, t.ch, i); else trigPeople(i); }

  /* ---------- Only if ---------- */
  function condChooser() {
    UI.sheet({ title: 'Only if', render: () => UI.group('',
      choice('c-time', 'moon', 'Time of day', 'At night, in the daytime, or between two times') +
      choice('c-days', 'clock', 'Days of the week', 'e.g. only on weekdays')) + deviceList('st', 'c-dev-pick') });
  }
  function condTime(i) {
    const c = i != null ? clone(s.only[i]) : { k: 'between', from: 'sunset', to: 'sunrise' };
    const mode = () => (c.from === 'sunset' && c.to === 'sunrise' ? 'night' : c.from === 'sunrise' && c.to === 'sunset' ? 'day' : 'custom');
    sh = { kind: 'cond', i, x: c, open: () => UI.sheet({ title: 'Time of day', render: () => `<div class="list">${Kit.radio('ct-mode', mode(), [['night', 'At night', `From sunset to sunrise · ${SC.SUN.sunset}–${SC.SUN.sunrise} today`], ['day', 'In the daytime', `From sunrise to sunset · ${SC.SUN.sunrise}–${SC.SUN.sunset} today`], ['custom', 'Between two times', '']])}</div>
      ${mode() === 'custom' ? `<div class="scn-gap"></div><div class="list">${['from', 'to'].map((f) => `<button class="cell scn-disclose" data-action="ct-open" data-v="${f}" aria-expanded="${sh.ui.open === f}"><span class="cell-main cell-title">${f === 'from' ? 'From' : 'To'}</span><span class="cell-value">${c[f]}</span>${icon('chevron-down', 'chev')}</button>${UI.collapse(sh.ui.open === f, `<div class="scn-wheel-in">${clockWheels(c[f], f + 'h', f + 'm')}</div>`)}`).join('')}</div>` : ''}`,
      footer: () => done('cond', i != null), onMount: (el) => { if (sh.ui.open) bindClock(el, c, sh.ui.open, sh.ui.open + 'h', sh.ui.open + 'm'); } }), ui: { open: '' } };
    reopen();
  }
  function condDays(i) {
    const c = i != null ? clone(s.only[i]) : { k: 'days', days: [1, 2, 3, 4, 5] };
    sh = { kind: 'cond', i, x: c, ui: { custom: repKind(c.days) === 'custom' }, open: () => UI.sheet({ title: 'Days of the week', render: () => repeatCard(c, 'Only on').replace('<div class="list-header">Only on</div>', ''), footer: done('cond', i != null) }) };
    reopen();
  }
  function condDevice() { UI.sheet({ title: 'Which device?', render: () => deviceList('st', 'c-dev-pick') }); }
  function condDeviceState(id, ch, i) {
    const sts = SC.cap(Store.device(id)).st;
    const c = i != null ? clone(s.only[i]) : { k: 'state', id, ch, is: sts[0].k };
    sh = { kind: 'cond', i, x: c, open: () => UI.sheet({ title: SC.nameOf(id, ch), render: () => `<div class="list">${Kit.radio('st-pick', c.is, sts.map((x) => [x.k, x.label, '']))}</div>`, footer: done('cond', i != null) }) };
    reopen();
  }
  function openCond(i) { const c = s.only[i]; if (c.k === 'between') condTime(i); else if (c.k === 'days') condDays(i); else condDeviceState(c.id, c.ch, i); }

  /* ---------- Do ---------- */
  function actChooser() {
    const scenes = SC.list().filter((x) => x.manual && x.id !== s.id);
    UI.sheet({ title: 'Do', render: () => UI.group('',
      choice('a-notify', 'bell', 'Send a notification', 'To your phone or the whole family') +
      choice('a-wait', 'hourglass', 'Wait', 'Pause before the next action') +
      (scenes.length ? choice('a-run', 'tab-scenarios', 'Run a scene', scenes.map((x) => x.name).slice(0, 3).join(', ')) : '') +
      (autosOther().length ? choice('a-auto', 'hand-stop', 'Pause or turn on an automation', 'e.g. stop the morning curtains while you’re away') : '')) + deviceList('act', 'a-dev-pick') });
  }
  function actDevice() { UI.sheet({ title: 'Which device?', render: () => deviceList('act', 'a-dev-pick') }); }
  const BACKS = [0, 1, 2, 5, 10, 15, 30, 60, 120];
  const backLabel = (m) => (!m ? 'Never' : m >= 60 ? `${m / 60} h` : `${m} min`);
  /* colour wheel helpers (hue = angle, saturation = distance from the centre) */
  const hsHex = (h, sat) => { const l = 0.5, a = (sat / 100) * Math.min(l, 1 - l); const f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, '0'); }; return `#${f(0)}${f(8)}${f(4)}`; };
  const hexHS = (hex) => { const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || ''); if (!m) return { h: 0, s: 0 }; const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255); const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; let h = !d ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; const l = (mx + mn) / 2; const sat = !d ? 0 : d / (1 - Math.abs(2 * l - 1)); return { h, s: Math.min(100, sat * 100) }; };
  const swHex = (n) => ((Devices.light.SWATCH.find((x) => x.n === n) || {}).hex || n);
  const kColour = (k, k0, k1) => { const t = (k - k0) / (k1 - k0 || 1); const warm = [255, 179, 102], cool = [214, 232, 255]; return `rgb(${warm.map((w, j) => Math.round(w + (cool[j] - w) * t)).join(',')})`; };

  /** Device action: what to do + (light) how it should look + "turn off after", Apple Home style:
      everything in cards, rows with a value and a chevron open their choices in place. */
  function actDeviceDo(id, ch, i) {
    const d = Store.device(id), acts = SC.cap(d).act;
    const lc = d.type === 'light' ? Devices.light.sceneCaps(d) : null;
    const a = i != null ? clone(s.do[i]) : { k: 'dev', id, ch, to: acts[0].k };
    if (a.col && !/^#/.test(a.col) && a.col !== 'white') a.col = swHex(a.col);
    if (a.col === 'white') { delete a.col; a.mode = 'ct'; }
    const ui = { open: '' };   // which row is open in place: 'fx' | 'back' | ''
    const isSet = () => a.set !== false && !!(a.br || a.col || a.mode || a.fx);
    const valueRow = (key, title, value) => `<button class="cell scn-disclose" data-action="do-open" data-v="${key}" aria-expanded="${ui.open === key}"><span class="cell-main cell-title">${esc(title)}</span><span class="cell-value">${esc(value)}</span>${icon('chevron-down', 'chev')}</button>`;
    const choices = (key, act, list, cur) => UI.collapse(ui.open === key, `<div class="scn-inline">${list.map(([v, l]) => `<button class="scn-inline-opt" data-action="${act}" data-v="${v}" aria-checked="${String(cur) === String(v)}" role="radio"><span>${esc(l)}</span>${icon('check', 'icon')}</button>`).join('')}</div>`);
    function lightCard() {
      const on = isSet(), mode = a.mode === 'ct' || !lc.color ? 'ct' : 'hs';
      const hs = hexHS(a.col || '#ff2563');
      let h = `<div class="list">${Kit.sw('do-set', 'set', 'Set brightness and colour', on ? 'Comes on exactly like this' : 'Comes on as it was last time', on)}`;
      let body = '';
      if (lc.br) { const br = a.br || 80; body += `<div class="cell slider-row scn-slider"><span class="scn-slider-head"><span class="cell-title">Brightness</span><span class="cell-value" data-out="br">${br} %</span></span><input class="range" type="range" min="1" max="100" value="${br}" data-r="br" style="--v:${(br - 1) / 99}" aria-label="Brightness"></div>`; }
      if (lc.color && lc.ct) body += `<div class="cell scn-seg-row"><div class="segmented"><button class="${mode === 'hs' ? 'on' : ''}" data-action="do-mode" data-v="hs">Colour</button><button class="${mode === 'ct' ? 'on' : ''}" data-action="do-mode" data-v="ct">White</button></div></div>`;
      if (mode === 'hs' && lc.color) {
        const R = 0.5 * Math.min(1, hs.s / 100), ang = (hs.h - 90) * Math.PI / 180;
        body += `<div class="cell scn-wheel-row"><div class="scn-wheel" data-wheel role="slider" aria-label="Colour" tabindex="0"><i class="scn-knob" style="left:${50 + R * 100 * Math.cos(ang)}%;top:${50 + R * 100 * Math.sin(ang)}%;background:${a.col || '#ff2563'}"></i></div>
          <div class="scn-dots">${Devices.light.SWATCH.filter((x) => x.n !== 'white').map((x) => `<button class="scn-dot" data-action="do-col" data-v="${x.hex}" role="radio" aria-checked="${(a.col || '').toLowerCase() === x.hex}" aria-label="${x.n}" style="--dot:${x.hex}"></button>`).join('')}</div></div>`;
      } else if (lc.ct) {
        const [k0, k1] = lc.k, k = a.kel || 2700;
        body += `<div class="cell slider-row scn-slider"><span class="scn-slider-head"><span class="cell-title">White tone</span><span class="cell-value" data-out="kel">${k} K</span></span><input class="range scn-ct" type="range" min="${k0}" max="${k1}" step="100" value="${k}" data-r="kel" style="--v:${(k - k0) / (k1 - k0)};--warm:${kColour(k0, k0, k1)};--cool:${kColour(k1, k0, k1)}" aria-label="White tone"></div>`;
      }
      if (lc.fx.length) body += valueRow('fx', 'Effect', a.fx ? (lc.fx.find((x) => x[0] === a.fx) || [])[1] : 'None') + choices('fx', 'do-fx', [['', 'None'], ...lc.fx], a.fx || '');
      h += UI.collapse(on, body) + '</div>';
      if (on && a.fx) h += `<div class="list-footer">The effect starts after the light comes on.</div>`;
      return h;
    }
    sh = { kind: 'act', i, x: a, open: () => UI.sheet({ title: SC.nameOf(id, ch), render: () => {
      const cur = SC.findIn(acts, a.to) || {};
      const blocked = acts.filter((x) => x.manualOnly && !s.manual);
      let h = `<div class="list">${Kit.radio('do-pick', a.to, acts.filter((x) => !(x.manualOnly && !s.manual)).map((x) => [x.k, x.label, '']))}</div>`;
      if (blocked.length) h += `<div class="list-footer">${esc(blocked.map((x) => x.label).join(', '))} is only for “Tap to run” scenes — a door should never open on its own.</div>`;
      if (cur.light && lc && (lc.br || lc.color || lc.ct || lc.fx.length)) h += `<div class="scn-gap"></div>` + lightCard();
      if (cur.pos) h += `<div class="scn-gap"></div><div class="list"><div class="cell"><span class="cell-main"><span class="cell-title" style="display:block">Open</span><span class="cell-sub" style="display:block">${a.pos === 0 ? 'Fully closed' : a.pos === 100 ? 'Fully open' : `${100 - a.pos} % closed`}</span></span>${Kit.stepper('do-pos', 'pos', `${a.pos} %`, a.pos <= 0, a.pos >= 100)}</div></div>`;
      if (cur.back) h += `<div class="scn-gap"></div><div class="list">${valueRow('back', cur.label === 'Open' ? 'Close after' : 'Turn off after', backLabel(a.back))}${choices('back', 'do-back', BACKS.map((b) => [b, backLabel(b)]), a.back || 0)}</div>
          <div class="list-footer">${a.back ? `Goes back by itself after ${backLabel(a.back)} — no second scenario needed.` : 'Stays as it is until someone changes it.'}</div>`;
      return h;
    }, footer: () => done('act', i != null), onMount: (el) => bindLook(el, a) }) };
    sh.ui = ui;
    reopen();
  }
  /** live sliders and the colour wheel: follow the finger, no re-render while dragging */
  function bindLook(el, a) {
    el.querySelectorAll('input[data-r]').forEach((r) => r.addEventListener('input', () => {
      const k = r.dataset.r, v = +r.value; a[k] = v;
      const out = el.querySelector(`[data-out="${k}"]`); if (out) out.textContent = k === 'kel' ? `${v} K` : `${v} %`;
    }));
    const wh = el.querySelector('[data-wheel]'); if (!wh) return;
    const knob = wh.querySelector('.scn-knob');
    const pick = (e) => {
      const b = wh.getBoundingClientRect(), x = e.clientX - b.left - b.width / 2, y = e.clientY - b.top - b.height / 2;
      const r = Math.min(1, Math.hypot(x, y) / (b.width / 2)), h = (Math.atan2(y, x) * 180 / Math.PI + 90 + 360) % 360;
      a.col = hsHex(h, Math.max(8, r * 100)); a.mode = 'hs';
      knob.style.left = `${50 + 50 * r * Math.sin(h * Math.PI / 180)}%`; knob.style.top = `${50 - 50 * r * Math.cos(h * Math.PI / 180)}%`; knob.style.background = a.col;
      el.querySelectorAll('.scn-dot').forEach((dd) => dd.setAttribute('aria-checked', 'false'));
    };
    wh.addEventListener('pointerdown', (e) => { wh.setPointerCapture(e.pointerId); wh.classList.add('dragging'); pick(e); });
    wh.addEventListener('pointermove', (e) => { if (wh.hasPointerCapture(e.pointerId)) pick(e); });
    wh.addEventListener('pointerup', () => wh.classList.remove('dragging'));
  }
  function actNotify(i) {
    const a = i != null ? clone(s.do[i]) : { k: 'notify', text: s.manual ? `${s.name} is done` : '', critical: false };
    sh = { kind: 'act', i, x: a, open: () => UI.sheet({ title: 'Send a notification', render: () => `<label class="field"><span class="field-label">Message</span><input data-f="text" value="${esc(a.text)}" maxlength="80" placeholder="e.g. The front door is open" autocomplete="off"></label>
      <div class="list" style="margin-top:16px">${Kit.sw('nt-crit', 'c', 'Urgent alert to everyone', 'Rings even on silent phones — for leaks, smoke, break-ins', a.critical)}</div>`, footer: done('act', i != null), onMount: (el) => { const inp = el.querySelector('[data-f="text"]'); inp.addEventListener('input', () => { a.text = inp.value; }); } }) };
    reopen();
  }
  function actWait(i) {
    const a = i != null ? clone(s.do[i]) : { k: 'wait', min: 5 };
    sh = { kind: 'act', i, x: a, open: () => UI.sheet({ title: 'Wait', render: () => `<div class="list"><div class="cell"><span class="cell-main"><span class="cell-title" style="display:block">Wait</span><span class="cell-sub" style="display:block">Then the next action</span></span>${Kit.stepper('wait-v', 'v', `${a.min} min`, a.min <= 1, a.min >= 120)}</div></div>`, footer: done('act', i != null) }) };
    reopen();
  }
  function actRun(i) {
    const scenes = SC.list().filter((x) => x.manual && x.id !== s.id);
    const a = i != null ? clone(s.do[i]) : { k: 'run', sid: (scenes[0] || {}).id };
    sh = { kind: 'act', i, x: a, open: () => UI.sheet({ title: 'Run a scene', render: () => `<div class="list">${Kit.radio('run-pick', a.sid, scenes.map((x) => [x.id, x.name, `${x.do.length} actions`]))}</div>`, footer: done('act', i != null) }) };
    reopen();
  }
  const autosOther = () => SC.list().filter((x) => !x.manual && x.id !== s.id);
  function actAuto(i) {
    const L = autosOther();
    const a = i != null ? clone(s.do[i]) : { k: 'auto', sid: (L[0] || {}).id, on: false };
    sh = { kind: 'act', i, x: a, open: () => UI.sheet({ title: 'Pause or turn on', render: () => `<div class="pad"><div class="segmented scn-mode" style="margin-top:0">
        <button class="${a.on ? '' : 'on'}" data-action="au-on" data-v="0">Pause it</button><button class="${a.on ? 'on' : ''}" data-action="au-on" data-v="1">Turn it on</button></div></div>
      <div class="list" style="margin-top:8px">${Kit.radio('au-pick', a.sid, L.map((x) => [x.id, x.name, Scenarios.sentence(x)]))}</div>
      <div class="list-footer">${a.on ? 'It starts working again.' : 'It stays saved and does nothing until something turns it on again.'}</div>`, footer: done('act', i != null) }) };
    reopen();
  }
  function openAct(i) { const a = s.do[i]; if (a.k === 'dev') actDeviceDo(a.id, a.ch, i); else if (a.k === 'notify') actNotify(i); else if (a.k === 'wait') actWait(i); else if (a.k === 'auto') actAuto(i); else actRun(i); }

  const listOf = (kind) => (kind === 'trig' ? s.when : kind === 'cond' ? s.only : s.do);
  function commit(kind) {
    const L = listOf(kind);
    if (sh.i != null) L[sh.i] = sh.x; else L.push(sh.x);
    sh = null; UI.closeSheet(); touch();
  }
  function removeItem(kind) { listOf(kind).splice(sh.i, 1); sh = null; UI.closeSheet(); touch(); }

  /* ---------- actions ---------- */
  const SCN_ICONS = [
    ['Scenarios', ['tab-scenarios', 'moon', 'sun', 'sunrise', 'tab-home', 'lock', 'bell', 'clock', 'power', 'shield-check', 'temperature', 'my-location']],
    ['Devices', ['dev-bulb', 'dev-lamp', 'dev-curtains', 'dev-door-02', 'dev-tv-1', 'dev-washing', 'dev-radiator', 'dev-drop', 'dev-motion', 'dev-fan', 'dev-ac', 'dev-kettle']],
  ];
  function leave() { UI.go('scenarios.html'); }
  UI.on({
    cancel: () => (dirty ? UI.confirm({ title: 'Discard changes?', text: 'What you changed in this scenario will be lost.', ok: 'Discard', onOk: leave }) : leave()),
    save: () => {
      if (!s.do.length) { UI.toast('Add at least one action'); return; }
      if (!s.manual && !s.when.length) { UI.toast('Add when it should start'); return; }
      const out = clone(s);
      if (out.manual) { out.when = []; out.only = []; }
      out.do = out.do.filter((a) => !(a.k === 'dev' && a.to === 'unlock' && !out.manual));
      SC.upsert(out);
      SafeStorage.session.setItem('samo-flash', isNew ? `“${out.name}” added` : 'Saved');
      leave();
    },
    delete: () => UI.confirm({ title: `Delete “${s.name}”?`, text: 'The devices stay as they are. This can’t be undone.', onOk: () => { SC.remove(s.id); SafeStorage.session.setItem('samo-flash', 'Scenario deleted'); leave(); } }),
    try: () => {
      const saved = !isNew && !dirty && SC.get(s.id);   // unsaved edits are tried on a copy, the log stays clean
      const r = SC.fire(saved || Object.assign(clone(s), { log: [] }), 'Try it now', { test: true });
      if (saved) s.log = clone(saved.log);
      render();
      UI.toast(r.problems && r.problems.length ? r.problems[0] : r.note ? `Done · normally it would skip now: ${r.note}` : 'Done — check your devices');
    },
    rename: () => UI.prompt({ title: 'Name', label: 'Scenario name', value: s.name, onOk: (v) => { s.name = v; renamed = true; touch(); } }),
    'pick-icon': () => { UI.sheet({ title: 'Select an icon', render: () => iconPickerHTML(SCN_ICONS, s.icon, 'sc-icon'), footer: ICON_DONE }); },
    'sc-icon': ({ n }) => { s.icon = n; dirty = true; UI.closeSheet(); render(); },
    mode: ({ v }) => { const m = v === 'scene'; if (m === s.manual) return; s.manual = m; if (!renamed) s.name = m ? 'New scene' : 'New automation'; touch(); },

    'trig-add': trigChooser, trig: ({ i }) => openTrig(+i),
    't-time': () => trigTime(), 't-sun': () => trigSun(), 't-dev': trigDevice, 't-people': () => trigPeople(),
    't-dev-pick': ({ id, ch }) => trigDeviceEvent(id, +ch),
    'sun-ev': ({ v }) => { sh.x.ev = v; reopen(); },
    'sun-off': ({ d }) => { sh.x.off = Math.max(-60, Math.min(60, (+sh.x.off || 0) + 15 * +d)); reopen(); },
    'ev-pick': ({ v }) => { sh.x.ev = v; const e = SC.evOf(sh.x); if (e && e.num) sh.x.v = sh.x.v != null && sh.x.v >= e.num.min && sh.x.v <= e.num.max ? sh.x.v : e.num.def; else delete sh.x.v; reopen(); },
    'ev-v': ({ d }) => { const n = SC.evOf(sh.x).num; sh.x.v = Math.round(Math.max(n.min, Math.min(n.max, sh.x.v + n.step * +d)) * 10) / 10; reopen(); },
    people: ({ v }) => { sh.x.k = v; reopen(); },
    'trig-done': () => commit('trig'), 'trig-remove': () => removeItem('trig'),

    'cond-add': condChooser, cond: ({ i }) => openCond(+i),
    'c-time': () => condTime(), 'c-days': () => condDays(), 'c-dev': condDevice,
    'c-dev-pick': ({ id, ch }) => condDeviceState(id, +ch),
    'ct-mode': ({ v }) => { const c = sh.x; if (v === 'night') { c.from = 'sunset'; c.to = 'sunrise'; } else if (v === 'day') { c.from = 'sunrise'; c.to = 'sunset'; } else if (/sun/.test(c.from)) { c.from = '22:00'; c.to = '07:00'; } reopen(); },
    'st-pick': ({ v }) => { sh.x.is = v; reopen(); },
    'cond-done': () => commit('cond'), 'cond-remove': () => removeItem('cond'),

    rep: ({ v }) => { sh.ui.custom = v === 'custom'; if (v !== 'custom') sh.x.days = { all: [1, 2, 3, 4, 5, 6, 7], wd: [1, 2, 3, 4, 5], we: [6, 7] }[v]; reopen(); },
    'rep-day': ({ d }) => { const L = sh.x.days, n = +d, i = L.indexOf(n); if (i >= 0) { if (L.length > 1) L.splice(i, 1); } else L.push(n); L.sort(); reopen(); },
    'ct-open': ({ v }) => { sh.ui.open = sh.ui.open === v ? '' : v; reopen(); },

    'act-add': actChooser, act: ({ i }) => openAct(+i),
    'a-dev': actDevice, 'a-notify': () => actNotify(), 'a-wait': () => actWait(), 'a-run': () => actRun(),
    'a-dev-pick': ({ id, ch }) => actDeviceDo(id, +ch),
    'do-pick': ({ v }) => {
      const x = sh.x; x.to = v; const c = SC.findIn(SC.cap(Store.device(x.id)).act, v) || {};
      if (!c.back) delete x.back; if (!c.light) { ['br', 'col', 'mode', 'kel', 'fx', 'set'].forEach((f) => delete x[f]); } if (c.pos) { if (x.pos == null) x.pos = 10; } else delete x.pos;
      reopen();
    },
    'do-set': () => { const x = sh.x; if (x.set === false || !(x.br || x.col || x.mode || x.fx)) { x.set = true; if (!x.br) x.br = 80; if (!x.col && !x.mode) { x.mode = 'ct'; x.kel = 2700; } } else x.set = false; reopen(); },
    'do-mode': ({ v }) => { const x = sh.x; x.mode = v; if (v === 'hs' && !x.col) x.col = '#ff2563'; if (v === 'ct' && !x.kel) x.kel = 2700; reopen(); },
    'do-col': ({ v }) => { sh.x.col = v; sh.x.mode = 'hs'; reopen(); },
    'do-open': ({ v }) => { sh.ui.open = sh.ui.open === v ? '' : v; reopen(); },
    'do-fx': ({ v }) => { if (v) sh.x.fx = v; else delete sh.x.fx; sh.ui.open = ''; reopen(); },
    'do-pos': ({ d }) => { sh.x.pos = Math.max(0, Math.min(100, (sh.x.pos || 0) + 10 * +d)); reopen(); },
    'do-back': ({ v }) => { if (+v) sh.x.back = +v; else delete sh.x.back; sh.ui.open = ''; reopen(); },
    'nt-crit': () => { sh.x.critical = !sh.x.critical; reopen(); },
    'wait-v': ({ d }) => { const m = sh.x.min; const st = m < 5 || (m === 5 && +d < 0) ? 1 : m < 30 || (m === 30 && +d < 0) ? 5 : 15; sh.x.min = Math.max(1, Math.min(120, m + st * +d)); reopen(); },
    'run-pick': ({ v }) => { sh.x.sid = v; reopen(); },
    'a-auto': () => actAuto(),
    'au-on': ({ v }) => { sh.x.on = v === '1'; reopen(); },
    'au-pick': ({ v }) => { sh.x.sid = v; reopen(); },
    'act-done': () => { if (sh.x.k === 'notify' && !String(sh.x.text || '').trim()) { UI.toast('Write the message'); return; } commit('act'); },
    'act-remove': () => removeItem('act'),
  });

  render();
  // a device can change while the editor is open (its name, offline) — keep the words true
  Store.subscribe(() => { if (!UI.sheetOpen) render(); });
})();
