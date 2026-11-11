/* ==========================================================================
   Vibration sensor — device interface (spec: Device Interface 3 / 15. Vibration_Sensor_Interface.html)
   The same little sensor does two everyday jobs, and the page follows what it is stuck on:
   - on a washing machine / dryer: Running → Finished (“Washing machine: finished” after it is calm for a while)
   - on a window, safe or mailbox: Calm → Shaken! (a guard; red only when it should alarm)
   The user says what it is on with one tap (“What is it on?”) — that sets the name, icon and the right messages.
   ========================================================================== */
Devices.vibration = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const USES = [
    ['washer', 'Washing machine', 'dev-washing-2', 'appliance'], ['dryer', 'Dryer', 'dev-washing', 'appliance'], ['dishwasher', 'Dishwasher', 'dev-dishwasher', 'appliance'],
    ['window', 'Window', 'dev-window-2', 'guard'], ['safe', 'Safe', 'dev-lock', 'guard'], ['door', 'Door', 'dev-door-02', 'guard'], ['other', 'Something else', 'pulse-fill', 'guard'],
  ];
  const F = {
    vibration: { name: 'Vibration detected', grp: 'Device page', short: 'Reports when the thing it is stuck on shakes' },
    events: { name: 'Tilt, drop & knocks', grp: 'Device page', short: 'What kind of movement: vibration, tilt, drop, triple knock' },
    angle: { name: 'Angle & strength', grp: 'Device page', short: 'Exact angle and how strong the shake was' },
    installed: { name: 'What is it on?', grp: 'General', app: true, short: 'Sets the name, icon and the right messages', row: (d) => Kit.row('vb-use', 'u', 'What is it on?', (USES.find((u) => u[0] === d.use) || USES[6])[1]) },
    sensitivity: { name: 'Sensitivity', grp: 'Setup', type: 'choice', def: 'medium', opts: [['low', 'Low', 'Only strong hits'], ['medium', 'Medium'], ['high', 'High', 'Small bumps too — and trucks passing by']], short: 'How strong a shake must be' },
    coolDown: { name: 'Quiet time between reports', grp: 'Setup', type: 'number', def: 60, min: 0, max: 600, unit: 's', label: 'Wait', short: 'One report per event, not twenty' },
    doneAlert: { name: 'Finished (stopped shaking)', grp: 'Notifications', type: 'fields', app: true, def: { on: true, min: 5 }, short: '“Washing machine: finished” when it has been still for a while',
      fields: [{ id: 'on', kind: 'tog', label: 'Tell me when it stops shaking', noSum: true }, { id: 'min', label: 'after calm for', unit: 'min', min: 1, max: 30 }] },
    notify: { name: 'Vibration notifications', grp: 'Notifications', type: 'fields', app: true, def: { on: false, armed: true, tamper: true }, short: 'When the window, safe or mailbox is hit or moved',
      fields: [{ id: 'on', kind: 'tog', label: 'Notify on vibration, tilt or drop', noSum: true }, { id: 'armed', kind: 'tog', label: 'Only when nobody is home', hint: 'Uses the home’s Away mode' }, { id: 'tamper', kind: 'tog', label: 'When the cover is opened' }] },
    tamper: { name: 'Tamper', grp: 'Device page', short: 'Cover opened or pulled off' },
    buzzer: { name: 'Built-in buzzer', grp: 'Device page', short: 'Beeps itself on vibration' },
    climate: { name: 'Temperature', grp: 'Device page', short: 'A few also measure temperature' },
    battery: { name: 'Battery', grp: 'Device page', short: 'Coin cell, usually 1–2 years' },
    history: { name: 'Vibration history', grp: 'Log', app: true, short: 'When it shook today' },
  };
  const GROUPS = ['Device page', 'General', 'Setup', 'Notifications', 'Automation', 'Log'];
  const PRESETS = [
    { id: 'aqara', name: 'Aqara vibration sensor', model: 'DJT11LM', manufacturer: 'Aqara', feats: ['vibration', 'events', 'angle', 'installed', 'sensitivity', 'doneAlert', 'notify', 'history', 'battery', 'climate'] },
    { id: 't1', name: 'Aqara vibration sensor T1', model: 'DJT12LM', manufacturer: 'Aqara', feats: ['events', 'installed', 'sensitivity', 'coolDown', 'doneAlert', 'notify', 'history', 'battery'], v: { coolDown: 5 } },
    { id: 'tuya', name: 'Tuya vibration sensor', model: 'TS0210', manufacturer: 'Tuya', feats: ['vibration', 'installed', 'sensitivity', 'doneAlert', 'notify', 'history', 'battery'] },
    { id: 'third', name: 'Third Reality vibration sensor', model: '3RVS01031Z', manufacturer: 'Third Reality', feats: ['vibration', 'angle', 'installed', 'coolDown', 'doneAlert', 'notify', 'history', 'battery'] },
    { id: 'heiman', name: 'Heiman vibration sensor', model: 'HS1VS-N', manufacturer: 'Heiman', feats: ['vibration', 'installed', 'notify', 'history', 'tamper', 'battery'], use: 'window', v: { notify: { on: true, armed: true, tamper: true } } },
    { id: 'glass', name: 'Visonic glass-break detector', model: 'GB-540', manufacturer: 'Visonic', feats: ['vibration', 'installed', 'notify', 'history', 'tamper', 'battery'], use: 'window', v: { notify: { on: true, armed: false, tamper: true } } },
    { id: 'buzz', name: 'Vibration sensor with buzzer', model: 'COZIGVS', manufacturer: 'Conecto', feats: ['vibration', 'installed', 'sensitivity', 'buzzer', 'notify', 'history'], use: 'safe', v: { notify: { on: true, armed: false, tamper: true } } },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];
  const useOf = (d) => USES.find((u) => u[0] === d.use) || USES[6];
  const appliance = (d) => useOf(d)[3] === 'appliance' && has(d, 'doneAlert') && S(d, 'doneAlert').on;
  const calmMs = (d) => S(d, 'doneAlert').min * 60000 / (d.sim.fast ? 60 : 1);   // prototype: 1 min = 1 s

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now(), use = p.use || 'dryer';
    const d = Kit.base('vibration', p, Object.assign({ name: useOf({ use })[1] }, opts), {
      battery: 93, use, userIcon: useOf({ use })[2], temp: 21.5,
      st: { shaking: false, lastShake: now - 3.2 * 3600000, runStart: 0, finishedAt: now - 3.1 * 3600000, alarmAt: 0, ev: null, angle: [2, -1, 88], strength: 0, tamper: false, lastSeen: now - 600000, today: [[now - 4 * 3600000, now - 3.1 * 3600000]] },
      phys: { running: false },
    });
    d.sim.fast = true;
    Kit.applyDefaults(F, d); if (p.v) Object.assign(d.settings, Kit.clone(p.v));
    return d;
  }
  const applyDefaults = (d) => { Kit.applyDefaults(F, d); d.use = d.use || 'other'; };

  function shake(d, kind = 'vibration', strength = 40) {
    const st = d.st, now = Date.now();
    const cool = has(d, 'coolDown') ? S(d, 'coolDown') * 1000 : 0;
    if (!appliance(d) && cool && now - st.lastShake < cool) return false;   // one report per event
    st.lastShake = now; st.lastSeen = now; st.ev = { kind, t: now }; st.strength = strength;
    if (kind === 'tilt') st.angle = [st.angle[0] + 14, st.angle[1], st.angle[2] - 12];
    if (!appliance(d)) {
      Kit.logEv(d, kind);
      const n = S(d, 'notify');
      if (has(d, 'notify') && n.on && (!n.armed || d.sim.away)) { st.alarmAt = now; Kit.push(`${d.name}: ${kind === 'vibration' ? 'shaken' : kind === 'tilt' ? 'tilted' : kind === 'drop' ? 'dropped' : 'knock knock'}`, Kit.room(d), 'danger'); }
    }
    return true;
  }
  function tick(d) {
    if (!d.online) return false;
    const st = d.st, now = Date.now(); let ch = false;
    if (d.phys.running) {
      if (!st.shaking) { st.shaking = true; st.runStart = now; st.finishedAt = 0; st.today.push([now, 0]); Kit.logEv(d, 'start'); ch = true; }
      st.lastShake = now; st.strength = 18 + Math.round(Math.random() * 10);
    } else if (st.shaking && now - st.lastShake > (appliance(d) ? calmMs(d) : 4000)) {
      st.shaking = false; st.finishedAt = now; const last = st.today[st.today.length - 1]; if (last && !last[1]) last[1] = st.lastShake;
      Kit.logEv(d, 'done', { min: Math.max(1, Math.round((st.lastShake - st.runStart) / 60000)) });
      if (appliance(d)) Kit.push(`${d.name}: finished`, `Ran ${Kit.dur((st.lastShake - st.runStart) / 1000)}`);
      ch = true;
    }
    if (st.alarmAt && now - st.alarmAt > 20000) { st.alarmAt = 0; ch = true; }
    if (st.ev && now - st.ev.t < 6000) ch = true;
    return ch;
  }

  /* ---------- Text ---------- */
  const EVW = { vibration: 'Shaken', tilt: 'Tilted', drop: 'Dropped', knock: 'Knocked 3 times' };
  const recent = (d) => d.st.ev && Date.now() - d.st.ev.t < 6000;
  function word(d) {
    const st = d.st;
    if (!d.online) return 'Unknown';
    if (appliance(d)) return st.shaking ? 'Running' : st.finishedAt && Date.now() - st.finishedAt < 2 * 3600000 ? 'Finished' : 'Idle';
    if (st.alarmAt) return `${EVW[st.ev.kind]}!`;
    return recent(d) ? EVW[st.ev.kind] : 'Calm';
  }
  const tone = (d) => (!d.online ? '' : d.st.alarmAt ? 'alarm' : 'closed');   // Running / Shaken are white like the icon; red only for an alarm
  function subText(d) {
    const st = d.st;
    if (!d.online) return `Last report ${when(st.lastSeen)}`;
    if (appliance(d)) {
      if (st.shaking) return `Since ${when(st.runStart)} · ${Kit.dur((Date.now() - st.runStart) / 1000)} so far`;
      if (st.finishedAt) return `Finished ${when(st.finishedAt)}${st.runStart ? ' · ran ' + Kit.dur((st.finishedAt - st.runStart) / 1000) : ''}`;
      return 'Not running';
    }
    if (st.alarmAt || recent(d)) return `${Kit.room(d)} · ${when(st.ev.t)}${has(d, 'angle') && st.strength ? ` · strength ${st.strength}` : ''}`;
    return `Last shaken ${when(st.lastShake)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (d.st.alarmAt) return { text: word(d), tone: 'danger' };
    if (d.st.tamper) return { text: 'Cover open', tone: 'warn' };
    if (has(d, 'battery') && d.battery <= 20) return { text: 'Battery low', tone: 'warn' };
    return { text: appliance(d) && d.st.shaking ? `Running · ${Kit.dur((Date.now() - d.st.runStart) / 1000)}` : word(d) };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: d.userIcon || 'pulse-fill', on: false, status: s.text, tone: s.tone, alert: d.online && !!d.st.alarmAt, controllable: false, offline: !d.online }]; };

  /* ---------- Device page ---------- */
  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (st.tamper) h += Kit.banner('ban-tamper', 'danger', 'banner-error', '<b>Cover opened</b> · Someone opened the sensor or pulled it off');
    if (has(d, 'battery') && d.battery <= 20) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    // one animation for every use (washer, window, safe…): while it shakes the icon (white) trembles and a grey ring —
    // the disc's own colour — fades out from it; an alarm is the same, in red
    const shaking = st.shaking || recent(d);
    const state = !d.online ? 'calm' : st.alarmAt ? 'alarm' : 'calm';
    h += Kit.mark(d, 'pulse-fill', state, `${d.name}: ${word(d)}`).replace('class="lk-mark', `class="lk-mark ${d.online && (shaking || st.alarmAt) ? 'vb-shake' : ''} ${d.online && shaking && !st.alarmAt ? 'is-shake' : ''}`);
    h += Kit.readout(word(d), tone(d), subText(d), '');
    if (!appliance(d) && st.alarmAt) h += `<div class="pad sm-acts" data-key="acts"><button class="btn btn-opposite" data-action="vb-ok">${icon('check')}It’s fine</button></div>`;
    h += Kit.cards([
      has(d, 'events') && ['Last movement', st.ev ? `${EVW[st.ev.kind]} · ${when(st.ev.t)}` : '—'],
      has(d, 'angle') && ['Angle', `${st.angle[0]}° · ${st.angle[1]}° · ${st.angle[2]}°`],
      has(d, 'buzzer') && ['Buzzer', 'Beeps on a shake'],
      has(d, 'climate') && ['Temperature', `${d.temp.toFixed(1)} °C`, { count: true }],
      has(d, 'battery') && ['Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    if (has(d, 'history')) {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = 86400000, now = Date.now(), pct = (t) => ((Math.max(t0.getTime(), t) - t0.getTime()) / day) * 100;
      h += `<div class="pad" data-key="strip" style="margin-top:24px"><div class="info-card wide sm-level pr-strip-card"><span>${appliance(d) ? 'Running today' : 'Shaken today'}</span>
        <div class="ct-strip"><div class="bar">${st.today.map(([a, b]) => `<i style="left:${pct(a).toFixed(2)}%;width:max(3px,${(pct(b || now) - pct(a)).toFixed(2)}%)"></i>`).join('')}${d.log.filter((e) => ['vibration', 'tilt', 'drop', 'knock'].includes(e.k) && e.t > t0.getTime()).map((e) => `<i style="left:${pct(e.t).toFixed(2)}%;width:3px"></i>`).join('')}<b style="left:${pct(now).toFixed(2)}%"></b></div><div class="axis"><span>0:00</span><span>12:00</span><span>24:00</span></div></div></div></div>`;
    }
    if (has(d, 'installed')) h += Kit.actionRow('use-row', 'vb-use', 'What is it on?', `${useOf(d)[1]} · ${useOf(d)[3] === 'appliance' ? 'tells you when it finishes' : 'tells you when it is shaken'}`);
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), subText(d)); }
  function openUse(d, ctx) {
    const s = UI.sheet({
      title: 'What is it on?', sub: 'Sets the name, the icon and the right messages',
      render: () => `<div class="ip-list" style="padding-top:8px"><section class="ip-group" style="padding-top:0"><div class="ip-grid labeled">${USES.map(([k, l, ic]) => `<button data-action="vb-pick" data-k="${k}" aria-pressed="${d.use === k}">${icon(ic, 'icon', 'style="width:32px;height:32px"')}<span>${esc(l)}</span></button>`).join('')}</div></section></div>`,
    });
    UI.on({ 'vb-pick': ({ k }) => {
      const u = USES.find((x) => x[0] === k), oldDefault = useOf(d)[1] === d.name;
      d.use = k; d.userIcon = u[2]; if (oldDefault || !d.name) d.name = u[1];
      if (u[3] === 'appliance') { if (has(d, 'doneAlert')) S(d, 'doneAlert').on = true; if (has(d, 'notify')) S(d, 'notify').on = false; }
      else if (has(d, 'notify')) S(d, 'notify').on = true;
      Store.save(); UI.closeSheet(); ctx.render(); UI.toast(u[3] === 'appliance' ? `You’ll hear when the ${u[1].toLowerCase()} finishes` : `You’ll hear when the ${u[1].toLowerCase()} is shaken`);
    } });
  }
  function bindPage(d, ctx) {
    UI.on({ 'vb-ok': () => { d.st.alarmAt = 0; Store.save(); ctx.render(); }, 'vb-use': () => openUse(d, ctx) });
  }
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d);
  const EV = { vibration: 'Shaken', tilt: 'Tilted', drop: 'Dropped', knock: 'Knocked 3 times', start: 'Started running', done: (e) => `Finished · ran ${e.min} min`, tamper: 'Cover opened', offline: 'Stopped answering' };
  function bindSettings(d, ctx) { Kit.bindSettings(F, d, ctx); UI.on({ 'vb-use': () => openUse(d, ctx), 'rs-history': () => Kit.historySheet(d, EV, appliance(d) ? 'Every run' : 'Every shake') }); }
  const about = (d) => [['On', useOf(d)[1]], ['State', word(d)]];

  function protoPanel(d) {
    return Kit.protoHead('Vibration sensor prototype', '15. Vibration_Sensor_Interface.html', PRESETS, d, 'Change what this sensor supports and play the real world. Here 1 min = 1 s.') + `
      <h3>${esc(useOf(d)[1])} · <span style="font-weight:400">${d.phys.running ? 'running' : 'still'}${d.sim.away ? ' · nobody home' : ''}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-run', d.phys.running ? '⏹ Program ends' : '▶️ Start the machine')}${Kit.ppBtn('pp-hit', '✊ Hit it')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-tilt', '↗️ Tilt / open the lid', has(d, 'events'))}${Kit.ppBtn('pp-drop', '⬇️ Drop', has(d, 'events'))}${Kit.ppBtn('pp-knock', '✊✊✊ Knock 3 times', has(d, 'events'))}</div>
      <div class="pp-row">${Kit.ppBtn('pp-away', d.sim.away ? '🏠 Someone came home' : '🧳 Nobody home (Away)')}${Kit.ppBtn('pp-tamper', d.st.tamper ? '📍 Close the cover' : '🪛 Open the cover', has(d, 'tamper'))}${Kit.ppBtn('pp-batt', d.battery <= 20 ? '🔋 New battery' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-run': () => { d.phys.running = !d.phys.running; if (!d.phys.running && appliance(d)) return `Calm for ${S(d, 'doneAlert').min} min → “finished” (${S(d, 'doneAlert').min} s here)`; },
      'pp-hit': () => { if (!shake(d, 'vibration', 72)) return 'Quiet time — this shake is not reported again'; },
      'pp-tilt': () => { shake(d, 'tilt', 30); },
      'pp-drop': () => { shake(d, 'drop', 90); },
      'pp-knock': () => { shake(d, 'knock', 20); },
      'pp-away': () => { d.sim.away = !d.sim.away; },
      'pp-tamper': () => { d.st.tamper = !d.st.tamper; if (d.st.tamper) { Kit.logEv(d, 'tamper'); if (S(d, 'notify').tamper) Kit.push(`${d.name}: cover opened`, Kit.room(d), 'warn'); } },
      'pp-batt': () => { d.battery = d.battery <= 20 ? 100 : 9; },
      'pp-online': () => { d.online = !d.online; if (!d.online) Kit.logEv(d, 'offline'); else d.st.lastSeen = Date.now(); },
    }, (dd, p) => { if (p.use) { dd.use = p.use; dd.userIcon = useOf(dd)[2]; } });
  }

  return {
    label: 'Vibration sensor', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'Vibration sensor',
    icon: (d) => (d && d.userIcon) || 'pulse-fill', describe: (p) => `${p.manufacturer} · vibration sensor`,
    historyValue: (d) => (has(d, 'history') ? word(d) : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick, busy: (d) => d.st.shaking || recent(d) || !!d.st.alarmAt || d.phys.running,
    protoPanel, bindProto,
  };
})();
