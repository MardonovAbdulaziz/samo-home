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
  const aIcon = (a) => (a.k === 'dev' ? SC.iconOf(a.id, a.ch) : a.k === 'notify' ? 'bell' : a.k === 'wait' ? 'hourglass' : 'tab-scenarios');
  const row = (act, i, ic, text, sub = '') => `<button class="cell scn-row" data-action="${act}" data-i="${i}">
      <span class="cell-icon">${icon(ic, 'icon')}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(text)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button>`;
  const addRow = (act, text) => `<button class="cell scn-add-row" data-action="${act}"><span class="cell-icon"><span class="scn-plus">${icon('plus-small', 'icon')}</span></span><span class="cell-main cell-title">${esc(text)}</span></button>`;
  const condLabel = (c) => cap1(SC.condText(c).replace(/^only (if )?/, (m, f) => (f ? 'if ' : '')));
  const actSub = (a) => (a.k === 'notify' ? `“${a.text}”` : '');

  function render() {
    const auto = !s.manual, warn = SC.warnings(s);
    const title = isNew ? (s.manual ? 'New scene' : 'New automation') : 'Edit scenario';
    let h = UI.toolbar({ title, back: '', plain: true, right: `<button class="tb-text" data-action="save">${isNew ? 'Add' : 'Save'}</button>` })
      .replace('<span class="spacer"></span>', `<button class="tb-text muted" data-action="cancel">Cancel</button>`);
    h += `<div class="scn-head">
        <button class="scn-avatar" data-action="pick-icon" aria-label="Change icon">${icon(s.icon || 'tab-scenarios', 'icon')}<span class="pen">${icon('pen', 'icon')}</span></button>
        <button class="scn-name" data-action="rename"><span class="field-label">Name</span><b>${esc(s.name)}</b></button>
      </div>
      <div class="scn-plain" data-key="plain"><span class="scn-plain-k">In plain words</span><p>${esc(SC.sentence(s))}</p></div>
      <div class="pad"><div class="segmented scn-mode" role="tablist">
        <button class="${s.manual ? 'on' : ''}" data-action="mode" data-v="scene" role="tab" aria-selected="${s.manual}">Tap to run</button>
        <button class="${auto ? 'on' : ''}" data-action="mode" data-v="auto" role="tab" aria-selected="${auto}">Automatic</button></div>
        <div class="scn-mode-note">${s.manual ? 'Runs when you tap it on the Scenarios page.' : 'Runs on its own — the hub keeps working even when your phone is off.'}</div></div>`;
    if (auto) {
      h += `<div class="list-header scn-lh" data-key="h-when">Starts when</div>
        <div class="list" data-key="l-when">${s.when.map((t, i) => row('trig', i, tIcon(t), cap1(SC.triggerText(t).replace(/^when /, '')))).join('')}${addRow('trig-add', s.when.length ? 'Or when…' : 'Add a start')}</div>
        ${s.when.length > 1 ? '<div class="list-footer" data-key="f-when">Any one of these starts it.</div>' : ''}
        <div class="list-header scn-lh" data-key="h-only">Only if <span class="scn-opt">optional</span></div>
        <div class="list" data-key="l-only">${s.only.map((c, i) => row('cond', i, cIcon(c), condLabel(c))).join('')}${addRow('cond-add', s.only.length ? 'And only if…' : 'Add a condition')}</div>
        <div class="list-footer" data-key="f-only">${s.only.length ? 'All of these must be true — otherwise it skips this time, and says why.' : 'For example: only at night, only on weekdays, only if the door is locked.'}</div>`;
    }
    h += `<div class="list-header scn-lh" data-key="h-do">Do</div>
      <div class="list" data-key="l-do">${s.do.map((a, i) => row('act', i, aIcon(a), cap1(SC.actionText(a)), actSub(a))).join('')}${addRow('act-add', s.do.length ? 'Then…' : 'Add an action')}</div>
      ${s.do.length > 1 ? '<div class="list-footer" data-key="f-do">Done from top to bottom.</div>' : ''}`;
    if (warn.length) h += `<div class="pad" data-key="warn" style="margin-top:20px">${warn.map((w) => `<div class="banner warn" style="margin-top:8px">${icon('round-info')}<div>${esc(w)}</div></div>`).join('')}</div>`;
    h += `<div class="pad scn-foot" data-key="foot"><button class="btn btn-glass btn-block" data-action="try" ${s.do.length ? '' : 'disabled'}>Try it now</button>
      ${isNew ? '' : '<button class="btn btn-danger btn-block" data-action="delete">Delete scenario</button>'}</div>`;
    if (!isNew && (s.log || []).length) {
      h += `<div class="list-header" data-key="h-log">What happened</div><div class="list scn-log" data-key="l-log">${s.log.slice(0, 6).map((l) => `<div class="cell"><span class="cell-icon ${l.ok ? 'ok' : 'warn'}">${icon(l.ok ? 'check' : 'round-info', 'icon')}</span>
        <span class="cell-main"><span class="cell-title" style="display:block">${esc(l.ok ? (l.text || 'Ran') : l.text)}</span><span class="cell-sub" style="display:block">${esc(when(l.at))}${l.cause ? ' · ' + esc(l.cause) : ''}</span></span></div>`).join('')}</div>`;
    }
    h += '<div style="height:40px"></div>';
    UI.patch(UI.screen, h);
  }
  function when(t) { const d = new Date(t), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; return new Date().toDateString() === d.toDateString() ? `Today ${hm}` : `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })} ${hm}`; }

  /* ---------- sheet helpers ---------- */
  const card = (inner) => `<div class="sheet-group"><div class="group-card">${inner}</div></div>`;
  const choice = (act, ic, title, sub, data = '') => `<button class="cell" data-action="${act}" ${data}><span class="cell-icon">${icon(ic, 'icon')}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button>`;
  const done = (act, removable, needDone = true) => (!removable && !needDone ? '' : `<div class="scn-sheet-foot">${removable ? `<button class="btn btn-danger" data-action="${act}-remove">Remove</button>` : ''}${needDone ? `<button class="btn btn-primary" data-action="${act}-done">Done</button>` : ''}</div>`);
  const deviceList = (role, act) => {
    const L = SC.pickable(role);
    if (!L.length) return '<div class="pad scn-none">No devices for this yet.</div>';
    const rooms = [...new Set(L.map((x) => x.room))];
    return rooms.map((r) => UI.group(r, L.filter((x) => x.room === r).map((x) => `<button class="cell" data-action="${act}" data-id="${x.id}" data-ch="${x.ch}"><span class="cell-icon">${icon(x.icon, 'icon')}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(x.name)}${x.offline ? ' <span class="cell-tag">Offline</span>' : ''}</span>${x.sub ? `<span class="cell-sub" style="display:block">${esc(x.sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button>`).join(''))).join('');
  };
  const daysChips = (days) => `<div class="scn-days" role="group" aria-label="Days">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<button class="chip" data-action="day" data-d="${d}" aria-pressed="${days.includes(d)}">${SC.DAY[d].slice(0, 2)}</button>`).join('')}</div>
    <div class="scn-presets">${[['Every day', '1234567'], ['Weekdays', '12345'], ['Weekends', '67']].map(([l, v]) => `<button class="btn-sm" data-action="days-preset" data-v="${v}" aria-pressed="${[...days].sort().join('') === v}">${l}</button>`).join('')}</div>`;
  let sh = null;   // the open sheet's draft: { kind, i, x }
  const reopen = () => sh && sh.open && sh.open();

  /* ---------- Starts when ---------- */
  function trigChooser() {
    UI.sheet({ title: 'Starts when', render: () => UI.group('', 
      choice('t-time', 'clock', 'At a time', 'e.g. 07:30 on weekdays') +
      choice('t-sun', 'sunrise', 'At sunrise or sunset', 'Moves with the seasons by itself') +
      choice('t-people', 'my-location', 'People come or go', 'Uses your phone’s location')) + `<div class="scn-sheet-k">Or when a device notices something</div>` + deviceList('ev', 't-dev-pick') });
  }
  function trigTime(i) {
    const t = i != null ? clone(s.when[i]) : { k: 'time', at: '07:30', days: [1, 2, 3, 4, 5] };
    sh = { kind: 'trig', i, x: t, open: () => UI.sheet({ title: 'At a time', render: () => `<div class="pad"><label class="scn-time-wrap"><input type="time" class="scn-time" value="${t.at}" data-f="at" aria-label="Time"></label>${daysChips(t.days)}</div>`, footer: done('trig', i != null), onMount: bindTime }) };
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
      <div class="list-footer">Works with the Samo Home app on your family’s phones, with location turned on.</div>`, footer: done('trig', i != null, false) }) };
    reopen();
  }
  function openTrig(i) { const t = s.when[i]; if (t.k === 'time') trigTime(i); else if (t.k === 'sun') trigSun(i); else if (t.k === 'dev') trigDeviceEvent(t.id, t.ch, i); else trigPeople(i); }

  /* ---------- Only if ---------- */
  function condChooser() {
    UI.sheet({ title: 'Only if', render: () => UI.group('',
      choice('c-time', 'moon', 'Time of day', 'At night, in the daytime, or between two times') +
      choice('c-days', 'clock', 'Days of the week', 'e.g. only on weekdays')) + `<div class="scn-sheet-k">Or only if a device…</div>` + deviceList('st', 'c-dev-pick') });
  }
  function condTime(i) {
    const c = i != null ? clone(s.only[i]) : { k: 'between', from: 'sunset', to: 'sunrise' };
    const mode = () => (c.from === 'sunset' && c.to === 'sunrise' ? 'night' : c.from === 'sunrise' && c.to === 'sunset' ? 'day' : 'custom');
    sh = { kind: 'cond', i, x: c, open: () => UI.sheet({ title: 'Time of day', render: () => `<div class="list">${Kit.radio('ct-mode', mode(), [['night', 'At night', `From sunset to sunrise · ${SC.SUN.sunset}–${SC.SUN.sunrise} today`], ['day', 'In the daytime', `From sunrise to sunset · ${SC.SUN.sunrise}–${SC.SUN.sunset} today`], ['custom', 'Between two times', '']])}</div>
      ${mode() === 'custom' ? `<div class="pad scn-between"><label>From<input type="time" class="scn-time sm" data-f="from" value="${c.from}"></label><label>To<input type="time" class="scn-time sm" data-f="to" value="${c.to}"></label></div>` : ''}`, footer: () => done('cond', i != null, mode() === 'custom'), onMount: bindTime }) };
    reopen();
  }
  function condDays(i) {
    const c = i != null ? clone(s.only[i]) : { k: 'days', days: [1, 2, 3, 4, 5] };
    sh = { kind: 'cond', i, x: c, open: () => UI.sheet({ title: 'Days of the week', render: () => `<div class="pad">${daysChips(c.days)}</div>`, footer: done('cond', i != null) }) };
    reopen();
  }
  function condDevice() { UI.sheet({ title: 'Which device?', render: () => deviceList('st', 'c-dev-pick') }); }
  function condDeviceState(id, ch, i) {
    const sts = SC.cap(Store.device(id)).st;
    const c = i != null ? clone(s.only[i]) : { k: 'state', id, ch, is: sts[0].k };
    sh = { kind: 'cond', i, x: c, open: () => UI.sheet({ title: SC.nameOf(id, ch), render: () => `<div class="list">${Kit.radio('st-pick', c.is, sts.map((x) => [x.k, x.label, '']))}</div>`, footer: done('cond', i != null, false) }) };
    reopen();
  }
  function openCond(i) { const c = s.only[i]; if (c.k === 'between') condTime(i); else if (c.k === 'days') condDays(i); else condDeviceState(c.id, c.ch, i); }

  /* ---------- Do ---------- */
  function actChooser() {
    const scenes = SC.list().filter((x) => x.manual && x.id !== s.id);
    UI.sheet({ title: 'Do', render: () => UI.group('',
      choice('a-notify', 'bell', 'Send a notification', 'To your phone or the whole family') +
      choice('a-wait', 'hourglass', 'Wait', 'Pause before the next action') +
      (scenes.length ? choice('a-run', 'tab-scenarios', 'Run a scene', scenes.map((x) => x.name).slice(0, 3).join(', ')) : '')) + `<div class="scn-sheet-k">Or control a device</div>` + deviceList('act', 'a-dev-pick') });
  }
  function actDevice() { UI.sheet({ title: 'Which device?', render: () => deviceList('act', 'a-dev-pick') }); }
  const BACKS = [0, 1, 2, 5, 10, 30, 60, 90];
  function actDeviceDo(id, ch, i) {
    const acts = SC.cap(Store.device(id)).act;
    const a = i != null ? clone(s.do[i]) : { k: 'dev', id, ch, to: acts[0].k };
    sh = { kind: 'act', i, x: a, open: () => UI.sheet({ title: SC.nameOf(id, ch), render: () => {
      const cur = SC.findIn(acts, a.to);
      const blocked = acts.filter((x) => x.manualOnly && !s.manual);
      return `<div class="list">${Kit.radio('do-pick', a.to, acts.filter((x) => !(x.manualOnly && !s.manual)).map((x) => [x.k, x.label, '']))}</div>
        ${blocked.length ? `<div class="list-footer">${esc(blocked.map((x) => x.label).join(', '))} is only for “Tap to run” scenes — a door should never open on its own.</div>` : ''}
        ${cur && cur.back ? `<div class="list-header">Then ${esc(cur.label === 'Open' ? 'close it' : 'turn it off')}</div><div class="scn-backs">${BACKS.map((b) => `<button class="chip" data-action="do-back" data-v="${b}" aria-pressed="${(a.back || 0) === b}">${b ? (b >= 60 ? `${b / 60 === 1.5 ? '1.5' : b / 60} h` : `${b} min`) : 'Never'}</button>`).join('')}</div>
          <div class="list-footer">${a.back ? `Goes back after ${a.back} min — no second scenario needed.` : 'Stays as it is until someone changes it.'}</div>` : ''}`;
    }, footer: () => done('act', i != null, !!(SC.findIn(acts, a.to) || {}).back) }) };
    reopen();
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
    sh = { kind: 'act', i, x: a, open: () => UI.sheet({ title: 'Run a scene', render: () => `<div class="list">${Kit.radio('run-pick', a.sid, scenes.map((x) => [x.id, x.name, `${x.do.length} actions`]))}</div>`, footer: done('act', i != null, false) }) };
    reopen();
  }
  function openAct(i) { const a = s.do[i]; if (a.k === 'dev') actDeviceDo(a.id, a.ch, i); else if (a.k === 'notify') actNotify(i); else if (a.k === 'wait') actWait(i); else actRun(i); }

  function bindTime(el) {
    el.querySelectorAll('input[type="time"]').forEach((inp) => inp.addEventListener('change', () => { if (inp.value) { sh.x[inp.dataset.f] = inp.value; } }));
  }
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
    'ev-pick': ({ v }) => { sh.x.ev = v; const e = SC.evOf(sh.x); if (e && e.num) { sh.x.v = sh.x.v != null && sh.x.v >= e.num.min && sh.x.v <= e.num.max ? sh.x.v : e.num.def; reopen(); } else { delete sh.x.v; commit('trig'); } },
    'ev-v': ({ d }) => { const n = SC.evOf(sh.x).num; sh.x.v = Math.round(Math.max(n.min, Math.min(n.max, sh.x.v + n.step * +d)) * 10) / 10; reopen(); },
    people: ({ v }) => { sh.x.k = v; commit('trig'); },
    'trig-done': () => commit('trig'), 'trig-remove': () => removeItem('trig'),

    'cond-add': condChooser, cond: ({ i }) => openCond(+i),
    'c-time': () => condTime(), 'c-days': () => condDays(), 'c-dev': condDevice,
    'c-dev-pick': ({ id, ch }) => condDeviceState(id, +ch),
    'ct-mode': ({ v }) => { const c = sh.x; if (v === 'night') { c.from = 'sunset'; c.to = 'sunrise'; } else if (v === 'day') { c.from = 'sunrise'; c.to = 'sunset'; } else { if (/sun/.test(c.from)) { c.from = '22:00'; c.to = '07:00'; } return reopen(); } commit('cond'); },
    'st-pick': ({ v }) => { sh.x.is = v; commit('cond'); },
    'cond-done': () => commit('cond'), 'cond-remove': () => removeItem('cond'),

    day: ({ d }) => { const L = sh.x.days; const n = +d; const i = L.indexOf(n); if (i >= 0) { if (L.length > 1) L.splice(i, 1); } else L.push(n); reopen(); },
    'days-preset': ({ v }) => { sh.x.days = v.split('').map(Number); reopen(); },

    'act-add': actChooser, act: ({ i }) => openAct(+i),
    'a-dev': actDevice, 'a-notify': () => actNotify(), 'a-wait': () => actWait(), 'a-run': () => actRun(),
    'a-dev-pick': ({ id, ch }) => actDeviceDo(id, +ch),
    'do-pick': ({ v }) => { sh.x.to = v; const c = SC.findIn(SC.cap(Store.device(sh.x.id)).act, v); if (!c || !c.back) { delete sh.x.back; commit('act'); } else reopen(); },
    'do-back': ({ v }) => { if (+v) sh.x.back = +v; else delete sh.x.back; reopen(); },
    'nt-crit': () => { sh.x.critical = !sh.x.critical; reopen(); },
    'wait-v': ({ d }) => { const m = sh.x.min; const st = m < 5 || (m === 5 && +d < 0) ? 1 : m < 30 || (m === 30 && +d < 0) ? 5 : 15; sh.x.min = Math.max(1, Math.min(120, m + st * +d)); reopen(); },
    'run-pick': ({ v }) => { sh.x.sid = v; commit('act'); },
    'act-done': () => { if (sh.x.k === 'notify' && !String(sh.x.text || '').trim()) { UI.toast('Write the message'); return; } commit('act'); },
    'act-remove': () => removeItem('act'),
  });

  render();
  // a device can change while the editor is open (its name, offline) — keep the words true
  Store.subscribe(() => { if (!UI.sheetOpen) render(); });
})();
