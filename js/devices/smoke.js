/* ==========================================================================
   Smoke detector — device interface
   Source: "Device Interface 3 / 12. Smoke_Detector_Interface.html" (features from zigbee2mqtt, 58 detectors)
   Rule: show a value or setting only if the paired detector has it.
   Look: the sensor mark from Figma (6631:50419 "Sensors/Smoke"), like the leak sensor: label/secondary when clear,
   color/orange on a pre-alarm, color/red with a ring on an alarm; the state word is white when clear (neutral).

   The detector sounds its own siren and reports smoke / its level (d.st). The real room (d.phys) lives in the
   prototype panel. Our server sends the messages, keeps the history and runs the safety scenario.
   ========================================================================== */
Devices.smoke = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    smoke: { name: 'Smoke alarm', grp: 'Device page', short: 'The detector sounds its siren and reports smoke' },
    level: { name: 'Smoke level & pre-alarm', grp: 'Device page', short: 'How much smoke, and an early warning before the full alarm' },
    heat: { name: 'Heat alarm', grp: 'Device page', short: 'Also alarms on high temperature — a fire without much smoke' },
    co: { name: 'Carbon monoxide (combo)', grp: 'Device page', short: 'Also alarms on carbon monoxide, which has no smell' },
    test: { name: 'Test the alarm', grp: 'Device page', short: 'Sounds the siren for a few seconds — do it once a month' },
    silence: { name: 'Silence the siren', grp: 'Device page', short: 'Stops the siren for a few minutes when you know why it rang' },
    battery: { name: 'Battery', grp: 'Device page', short: 'A detector with a flat battery protects nobody' },
    fault: { name: 'Fault & dirty chamber', grp: 'Device page', short: 'Reports a fault, or a dusty chamber that needs cleaning' },
    tamper: { name: 'Tamper (taken down)', grp: 'Device page', short: 'Reports when it is taken off its base on the ceiling' },

    sensitivity: { name: 'Sensitivity', grp: 'Detector', type: 'choice', def: 'medium',
      opts: [['low', 'Low', 'Fewer false alarms near a kitchen'], ['medium', 'Medium', 'Recommended'], ['high', 'High', 'Earliest warning — bedrooms']], short: 'How little smoke is enough to alarm' },
    pause: { name: 'Cooking pause', grp: 'Detector', type: 'pause', def: 10, short: 'Pauses smoke detection while cooking, instead of taking the detector down' },
    siren: { name: 'Siren & light', grp: 'Detector', type: 'siren', def: { vol: 'high', strobe: true, dur: 180 }, short: 'How loud, whether the light flashes, how long it sounds' },
    led: { name: 'Heartbeat light', grp: 'Detector', type: 'toggle', def: true, short: 'A short blink every minute shows it is alive' },

    notify: { name: 'Smoke notifications', grp: 'Notifications', app: true, def: { all: true, critical: true, family: true, pre: true, service: true }, short: 'Who is told about smoke and how loud' },
    fireActions: { name: 'When smoke is detected', grp: 'Automation', app: true, def: { lights: true, ac: true, unlock: false, sirens: true }, short: 'Lights on to find the exit, AC off, door unlocked for rescuers' },
    interconnect: { name: 'Interconnected detectors', grp: 'Automation', app: true, type: 'toggle', def: true, short: 'When one detector smells smoke, all detectors in the home sound' },
    history: { name: 'Alarm & test history', grp: 'Log', app: true, short: 'Every alarm, silence and test — stored by our server' },
  };
  const ALL_GROUPS = ['Device page', 'Detector', 'Notifications', 'Automation', 'Log'];

  const PRESETS = [
    { id: 'xiaomi', name: 'Xiaomi / Honeywell smoke detector', model: 'JTYJ-GD-01LM/BW', manufacturer: 'Xiaomi', feats: ['smoke', 'level', 'test', 'battery', 'tamper', 'notify', 'fireActions', 'history', 'sensitivity', 'interconnect'] },
    { id: 'tuya', name: 'Tuya smoke sensor', model: 'TS0205', manufacturer: 'Tuya', feats: ['smoke', 'battery', 'tamper', 'notify', 'fireActions', 'history', 'interconnect'] },
    { id: 'tuyaalarm', name: 'Tuya smart smoke alarm', model: 'SA12IZL', manufacturer: 'Tuya', feats: ['smoke', 'silence', 'battery', 'notify', 'fireActions', 'history', 'siren', 'interconnect'] },
    { id: 'heiman', name: 'Heiman smoke alarm (pre-alarm)', model: 'HS1SA-E-PLUS', manufacturer: 'Heiman', feats: ['smoke', 'level', 'heat', 'test', 'silence', 'battery', 'fault', 'notify', 'fireActions', 'history', 'pause', 'siren', 'interconnect', 'led'] },
    { id: 'develco', name: 'Develco smoke detector with siren', model: 'SMSZB-120', manufacturer: 'Develco', feats: ['smoke', 'heat', 'test', 'battery', 'fault', 'notify', 'fireActions', 'history', 'siren', 'interconnect'] },
    { id: 'combo', name: 'Smoke + CO combo', model: 'TS0601_smoke_co', manufacturer: 'Tuya', feats: ['smoke', 'co', 'battery', 'notify', 'fireActions', 'history', 'siren'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' && x !== null ? JSON.parse(JSON.stringify(x)) : x);
  const has = (d, k) => d.features.includes(k);
  const S = (d, k) => d.settings[k];
  const W = (d) => d.name;
  const room = (d) => Store.roomName(d.roomId);
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;
  const HEAT_C = 57;   // a typical fixed heat alarm point
  /** Smoke level (dB/m) for the alarm and the pre-alarm, by sensitivity. */
  const limit = (d) => ({ low: 14, medium: 10, high: 7 })[has(d, 'sensitivity') ? S(d, 'sensitivity') : 'medium'];
  const pre = (d) => limit(d) / 2;
  const paused = (d) => d.st.pauseUntil > Date.now();
  const hushed = (d) => d.st.hushUntil > Date.now();
  const testing = (d) => d.st.testUntil > Date.now();

  function applyDefaults(d) {
    for (const k in F) { const def = F[k].def; if (def !== undefined && d.settings[k] === undefined) d.settings[k] = clone(def); }
  }

  function create(presetId, { name, roomId } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const now = Date.now(), lastTest = now - 9 * 86400000;
    const d = {
      id: Store.uid('d'), type: 'smoke', preset: p.id, name: name || 'Smoke detector', roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'SD', mac: Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '1.0.4_0007', online: true, showOnHome: true, isNew: true, createdAt: now,
      features: p.feats.slice(), settings: {},
      // what the app knows (reports)
      st: { state: 'clear', level: 0.3, heat: false, co: false, at: now - 3 * 86400000, lastSeen: now - 240000, tamper: false, fault: '', hushUntil: 0, pauseUntil: 0, testUntil: 0, testOkUntil: 0, lastTest },
      // the real room (prototype panel)
      phys: { level: 0.3, temp: 22, co: false },
      battery: 92, temp: 22, log: [{ t: lastTest, k: 'test' }], blinkAt: 0, sim: {},
    };
    applyDefaults(d);
    return d;
  }

  /* ---------- Behaviour ---------- */
  function logEv(d, k, extra) { d.log.unshift(Object.assign({ t: Date.now(), k }, extra || {})); d.log.length = Math.min(d.log.length, 60); }
  function notifyPush(d, title, body = '', tone = '') { Store.state.notifications = (Store.state.notifications || 0) + 1; UI.push({ title, body, tone }); }
  /** What the detector reports from the real room: clear / pre-alarm / alarm (+ heat, CO). */
  function evaluate(d) {
    const st = d.st, P = d.phys, now = Date.now();
    if (!d.online) return false;
    let changed = false;
    st.level = Math.round(P.level * 10) / 10; d.temp = Math.round(P.temp * 10) / 10;
    const smokeAlarm = !paused(d) && st.level >= limit(d);
    const preAlarm = !paused(d) && has(d, 'level') && !smokeAlarm && st.level >= pre(d);
    const heat = has(d, 'heat') && d.temp >= HEAT_C, co = has(d, 'co') && P.co;
    const next = smokeAlarm ? 'smoke' : heat ? 'heat' : co ? 'co' : preAlarm ? 'pre' : 'clear';
    if (next !== st.state) {
      const was = st.state; st.state = next; st.at = now; st.lastSeen = now; d.blinkAt = now; changed = true;
      if (next === 'clear') { logEv(d, 'clear'); st.hushUntil = 0; return true; }
      if (next === 'pre') { logEv(d, 'pre'); if (has(d, 'notify') && S(d, 'notify').pre) notifyPush(d, `A little smoke · ${W(d)}`, `${room(d)} — check it`, 'warn'); return true; }
      const what = { smoke: 'Smoke', heat: 'Heat', co: 'Carbon monoxide' }[next];
      logEv(d, next);
      // a real alarm always tells at least the owner — critical, rings on silent phones
      notifyPush(d, `${what}! · ${W(d)}`, `${room(d)} — get out, call 101`, 'danger');
      if (has(d, 'fireActions') && next !== 'co') { const a = S(d, 'fireActions'); const done = [a.lights && 'lights on', a.ac && 'AC off', a.unlock && 'door unlocked', a.sirens && 'other sirens on'].filter(Boolean); if (done.length) logEv(d, 'scene', { text: done.join(', ') }); }
      if (has(d, 'interconnect') && S(d, 'interconnect')) logEv(d, 'linked');
      if (was === 'pre' || was === 'clear') st.hushUntil = 0;
    }
    // silenced, but the smoke keeps rising → it rings again
    if (hushed(d) && st.level >= limit(d) + 4) { st.hushUntil = 0; logEv(d, 'rering'); changed = true; }
    return changed;
  }

  function tick(d) {
    let changed = false; const now = Date.now(), P = d.phys;
    // the air clears slowly once the source is gone
    if (P.fading && P.level > 0.3) { P.level = Math.max(0.3, P.level * 0.86); if (P.temp > 22) P.temp = Math.max(22, P.temp - 2.5); changed = true; }
    if (d.st.testUntil && now >= d.st.testUntil) { d.st.testUntil = 0; d.st.testOkUntil = now + 60000; d.st.lastTest = now; logEv(d, 'test'); changed = true; }
    if (d.st.testOkUntil && now >= d.st.testOkUntil) { d.st.testOkUntil = 0; changed = true; }
    if (d.st.pauseUntil && now >= d.st.pauseUntil) { d.st.pauseUntil = 0; logEv(d, 'pauseEnd'); changed = true; }
    if (evaluate(d)) changed = true;
    return changed;
  }

  /* ---------- Text ---------- */
  const startOfDay = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };
  const when = (t) => (t >= startOfDay() ? UI.fmtTime(t) : t >= startOfDay() - 86400000 ? 'yesterday ' + UI.fmtTime(t) : new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }));
  const agoText = (ms) => { const m = Math.floor(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
  const alarm = (d) => ['smoke', 'heat', 'co'].includes(d.st.state);
  function word(d) {
    if (!d.online) return 'Unknown';
    if (testing(d)) return 'Testing…';
    return { smoke: 'Smoke!', heat: 'Heat!', co: 'CO!', pre: 'A little smoke', clear: 'Clear' }[d.st.state];
  }
  function subText(d) {
    const st = d.st;
    if (!d.online) return `Last report ${when(st.lastSeen)}`;
    if (testing(d)) return 'The siren sounds for a few seconds';
    if (alarm(d)) return `${room(d)} · since ${when(st.at)} · ${hushed(d) ? 'siren silenced' : 'the siren is sounding'}`;
    if (st.state === 'pre') return `${room(d)} · check it — it is not an alarm yet`;
    if (paused(d)) return `Detection paused · ${UI.fmtDur((st.pauseUntil - Date.now()) / 1000)} left`;
    return `Checked ${agoText(Date.now() - st.lastSeen)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (alarm(d)) return { text: word(d), tone: 'danger' };
    if (d.st.state === 'pre') return { text: 'A little smoke', tone: 'warn' };
    if (d.st.tamper) return { text: 'Taken down', tone: 'warn' };
    if (d.st.fault) return { text: 'Clean the detector', tone: 'warn' };
    if (battLow(d)) return { text: 'Battery low', tone: 'warn' };
    return { text: paused(d) ? 'Paused' : 'Clear' };
  }
  function homeTiles(d) {
    const s = tileStatus(d);
    // alert card on home (Figma 5429:45566): white card, red icon and status
    return [{ ch: 0, name: d.name, icon: 'dev-smoke', on: false, status: s.text, tone: s.tone, alert: d.online && alarm(d), controllable: false, offline: !d.online }];
  }

  /* ==========================================================================
     Device page
     ========================================================================== */
  function mark(d) {
    const cls = ['lk-mark', alarm(d) ? 'is-alarm' : '', d.st.state === 'pre' || testing(d) ? 'is-warn' : '', !d.online ? 'is-off' : ''].join(' ');
    return `<div class="${cls}" data-cl="scene" role="img" aria-label="${esc(W(d))}: ${esc(word(d))}"><i class="lk-halo"></i><span class="lk-disc">${icon(d.userIcon || 'dev-smoke', 'icon', 'style="width:80px;height:80px"')}</span></div>`;
  }
  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += `<div class="pad cw-gap" data-key="ban-off"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · No report since ${when(st.lastSeen)}. A silent detector protects nobody — check it.</div></div></div>`;
    if (d.online && alarm(d)) h += `<div class="pad cw-gap" data-key="ban-alarm"><div class="banner danger">${icon(d.st.state === 'heat' ? 'dev-flame' : 'dev-smoke')}<div><b>${esc(word(d).replace('!', ''))} detected</b> · ${esc(room(d))} — leave the room, call 101</div></div></div>`;
    if (st.testOkUntil) h += `<div class="pad cw-gap" data-key="ban-test"><div class="banner info">${icon('check')}<div><b>Test OK</b> · The app received the alarm — notifications will arrive</div></div></div>`;
    if (paused(d) && !alarm(d)) h += `<div class="pad cw-gap" data-key="ban-pause"><div class="banner info">${icon('round-info')}<div><b>Cooking pause</b> · Detection comes back by itself</div></div></div>`;
    if (st.tamper) h += `<div class="pad cw-gap" data-key="ban-tamper"><div class="banner danger">${icon('banner-error')}<div><b>Taken down</b> · Put the detector back on its base</div></div></div>`;
    if (st.fault) h += `<div class="pad cw-gap" data-key="ban-fault"><div class="banner warn">${icon('banner-error')}<div><b>${st.fault === 'dust' ? 'Dusty chamber' : 'Fault'}</b> · Clean or replace the detector</div></div></div>`;
    if (battLow(d)) h += `<div class="pad cw-gap" data-key="ban-batt"><div class="banner warn">${icon('battery')}<div><b>Battery low · ${d.battery} %</b> · Replace it today</div></div></div>`;

    h += `<div class="pad" data-key="scene">${mark(d)}</div>`;
    const tone = !d.online ? '' : alarm(d) ? 'alarm' : st.state === 'pre' || testing(d) ? 'open' : 'closed';
    h += `<div class="cw-readout ct-readout" data-key="readout"><div><div class="ct-word ${tone}" data-cl="word">${esc(word(d))}</div>
        <div class="cw-state" data-num data-live="sub">${esc(subText(d))}</div></div>
        ${has(d, 'test') && !alarm(d) ? `<span class="cw-hint">Last test ${when(st.lastTest)}</span>` : ''}</div>`;
    // while it rings: silence (if the detector can) and call the fire service (a phone link our app adds)
    if (d.online && alarm(d)) {
      const canHush = has(d, 'silence') && !hushed(d);
      h += `<div class="pad sm-acts" data-key="acts">${canHush ? `<button class="btn btn-opposite" data-action="sm-hush">${icon('bell')}Silence</button>` : ''}<a class="btn btn-opposite is-red" href="tel:101">${icon('phone')}Call 101</a></div>`;
    }

    const cards = [];
    if (has(d, 'level')) {   // the smoke level is the first card of the same grid (one block, the grid's 10 px gaps)
      const lv = st.level, mx = 20, z = lv >= limit(d) ? 2 : lv >= pre(d) ? 1 : 0;
      cards.push(`<div class="info-card wide sm-level" data-key="level"><span>Smoke level · ${['normal', 'pre-alarm', 'alarm'][z]}</span><b data-num="count">${lv.toFixed(1)} dB/m</b>
        <div class="sm-bar z${z}"><i style="width:${Math.min(100, (lv / mx) * 100).toFixed(1)}%"></i><b style="left:${(pre(d) / mx) * 100}%"></b><b style="left:${(limit(d) / mx) * 100}%"></b></div></div>`);
    }
    const small = [];
    if (has(d, 'heat')) small.push(`<div class="info-card"><span>Temperature</span><b data-num="count">${d.online ? d.temp.toFixed(1) + ' °C' : '—'}</b></div>`);
    if (has(d, 'co')) small.push(`<div class="info-card"><span>Carbon monoxide</span><b>${st.state === 'co' ? 'Detected' : 'None'}</b></div>`);
    if (small.length % 2) small[small.length - 1] = small[small.length - 1].replace('class="info-card"', 'class="info-card wide"');
    cards.push(...small);
    if (has(d, 'battery')) cards.push(`<div class="info-card wide"><span>${battLow(d) ? 'Battery · replace it today' : 'Battery'}</span><b data-num="count">${d.battery} %</b>${icon('battery')}</div>`);
    if (cards.length) h += `<div class="pad info-grid" data-key="info" style="margin-top:24px">${cards.join('')}</div>`;
    if (has(d, 'test')) h += `<div class="list" data-key="test-row" style="margin-top:24px"><button class="cell" data-action="sm-test" ${!d.online || alarm(d) || testing(d) ? 'aria-disabled="true"' : ''}><span class="cell-main"><span class="cell-title" style="display:block">Test the alarm</span><span class="cell-sub" style="display:block">Once a month · sounds the siren for a few seconds</span></span>${icon('chevron-right', 'chev')}</button></div>`;
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), subText(d)); }
  function bindPage(d, ctx) {
    UI.on({
      'sm-hush': () => {
        if (d.st.level >= 18) return UI.toast('Too much smoke — the detector will not silence');
        d.st.hushUntil = Date.now() + 180000; logEv(d, 'hush'); Store.save(); ctx.render(); UI.toast('Siren silenced for 3 min — it rings again if the smoke rises');
      },
      'sm-test': () => {
        if (!d.online || alarm(d) || testing(d)) return;
        d.st.testUntil = Date.now() + 4000; d.blinkAt = Date.now(); Store.save(); ctx.render();
      },
    });
  }

  /* ==========================================================================
     Settings
     ========================================================================== */
  const row = (k, title, value) => `<button class="cell" data-action="sm-feature" data-k="${k}"><span class="cell-main cell-title">${esc(title)}</span>${value ? `<span class="cell-value">${esc(value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
  const sw = (act, key, title, sub, on) => `<button class="cell" data-action="${act}" data-n="${key}" role="switch" aria-checked="${on}">
      <span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>
      <span class="switch" aria-hidden="true" aria-checked="${on}"></span></button>`;
  const VOLS = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']];
  function summary(d, k) {
    const v = S(d, k);
    if (k === 'sensitivity') return F.sensitivity.opts.find((o) => o[0] === v)[1];
    if (k === 'pause') return paused(d) ? `${UI.fmtDur((d.st.pauseUntil - Date.now()) / 1000)} left` : `${v} min`;
    if (k === 'siren') return `${VOLS.find((x) => x[0] === v.vol)[1]}${v.strobe ? ' · light' : ''}`;
    if (k === 'fireActions') { const n = ['lights', 'ac', 'unlock', 'sirens'].filter((x) => v[x]).length; return n ? `${n} actions` : 'Off'; }
    return '';
  }
  function settings(d) {
    let h = '';
    const det = [];
    ['sensitivity', 'pause', 'siren'].forEach((k) => { if (has(d, k)) det.push(row(k, F[k].name, summary(d, k))); });
    if (has(d, 'led')) det.push(sw('sm-sw', 'led', 'Heartbeat light', 'Blinks every minute — off for bedrooms', S(d, 'led')));
    if (det.length) h += `<div class="list-header">Detector</div><div class="list">${det.join('')}</div>`;
    if (has(d, 'notify')) {
      const n = S(d, 'notify');
      h += `<div class="list-header">Notifications</div><div class="list">${sw('sm-nt', 'all', 'Everyone in this home', 'Smoke always tells at least the owner', n.all)}${sw('sm-nt', 'critical', 'Critical alert', 'Rings even on silent phones', n.critical)}${sw('sm-nt', 'family', 'Family outside the home', '', n.family)}${has(d, 'level') ? sw('sm-nt', 'pre', 'Pre-alarm', 'A little smoke', n.pre) : ''}${sw('sm-nt', 'service', 'Battery, dust, taken down', '', n.service)}</div>
        <div class="list-footer">Smoke notifications can’t be turned off — these only add people and loudness.</div>`;
    }
    const auto = [];
    if (has(d, 'fireActions')) auto.push(row('fireActions', F.fireActions.name, summary(d, 'fireActions')));
    if (has(d, 'interconnect')) auto.push(sw('sm-sw', 'interconnect', 'Interconnected detectors', 'All detectors sound when one smells smoke', S(d, 'interconnect')));
    if (auto.length) h += `<div class="list-header">Automation</div><div class="list">${auto.join('')}</div><div class="list-footer">Our hub runs these, even without internet.</div>`;
    return h;
  }
  const radio = (act, cur, opts) => opts.map((o) => `<button class="option" role="radio" aria-checked="${cur === o[0]}" data-action="${act}" data-v="${o[0]}">
      <span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('');
  const stepper = (act, val, unit, lo, hi) => `<div class="stepper"><button data-action="${act}" data-d="-1" aria-label="Less" ${val <= lo ? 'disabled' : ''}>−</button><output data-num>${val} ${unit}</output><button data-action="${act}" data-d="1" aria-label="More" ${val >= hi ? 'disabled' : ''}>+</button></div>`;
  function openFeature(d, k, ctx) {
    const f = F[k];
    const s = UI.sheet({
      title: f.name, sub: esc(f.short),
      render: () => {
        const v = S(d, k);
        if (k === 'sensitivity') return `<div class="list">${radio('sm-opt', v, f.opts)}</div>`;
        if (k === 'pause') {
          return UI.group('Pause for', radio('sm-pause', String(v), [['5', '5 min', ''], ['10', '10 min', 'Recommended'], ['15', '15 min', ''], ['20', '20 min', 'The longest this detector allows']]))
            + `<div class="pad" style="margin-top:16px"><button class="btn btn-${paused(d) ? 'secondary' : 'primary'} btn-block" data-action="sm-pause-go">${paused(d) ? 'Stop the pause' : `Pause now for ${v} min`}</button></div>`
            + '<div class="list-footer">Detection turns back on by itself when the time is up.</div>';
        }
        if (k === 'siren') {
          return UI.group('Alarm volume', radio('sm-vol', v.vol, VOLS))
            + UI.group('', `<button class="cell" data-action="sm-strobe"><span class="cell-main cell-title">Flash the light</span><span class="switch" role="switch" aria-checked="${v.strobe}"></span></button><div class="cell"><span class="cell-main cell-title">Sounds for at most</span>${stepper('sm-dur', v.dur >= 60 ? v.dur / 60 : v.dur, v.dur >= 60 ? 'min' : 's', 1, 15)}</div>`)
            + '<div class="list-footer">The smoke alarm sound itself can’t be switched off.</div>';
        }
        if (k === 'fireActions') {
          const L = [['lights', 'Turn all lights on', 'To find the exit'], ['ac', 'Turn off AC and ventilation', 'So smoke doesn’t spread'], ['unlock', 'Unlock the front door', 'For rescuers'], ['sirens', 'Sound the other sirens', '']];
          return `<div class="list">${L.map(([x, t, sub]) => sw('sm-fa', x, t, sub, v[x])).join('')}</div><div class="list-footer">A scenario in our app, offered when a smoke detector is added.</div>`;
        }
        return '';
      },
      footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>',
    });
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    UI.on({
      'sm-opt': ({ v }) => { d.settings[k] = v; commit(); },
      'sm-pause': ({ v }) => { d.settings.pause = +v; commit(); },
      'sm-pause-go': () => {
        if (paused(d)) { d.st.pauseUntil = 0; logEv(d, 'pauseEnd'); } else { d.st.pauseUntil = Date.now() + S(d, 'pause') * 60000; logEv(d, 'pause'); }
        commit();
      },
      'sm-vol': ({ v }) => { S(d, k).vol = v; commit(); },
      'sm-strobe': () => { S(d, k).strobe = !S(d, k).strobe; commit(); },
      'sm-dur': ({ d: dir }) => { const v = S(d, k), m = Math.round(v.dur / 60); v.dur = Math.max(60, Math.min(900, (m + +dir) * 60)); commit(); },
      'sm-fa': ({ n }) => { S(d, k)[n] = !S(d, k)[n]; commit(); },
    });
  }

  /* ---------- History (Settings → Event History) ---------- */
  const EV = { smoke: 'Smoke alarm', heat: 'Heat alarm', co: 'Carbon monoxide alarm', pre: 'Pre-alarm · a little smoke', clear: 'Clear again', hush: 'Siren silenced', rering: 'Rang again — smoke rising', test: 'Test OK', pause: 'Cooking pause', pauseEnd: 'Pause over', linked: 'Other detectors sounded', tamper: 'Taken down', back: 'Back on its base', fault: 'Dusty chamber', battery: 'Battery low', offline: 'Stopped answering' };
  function openHistory(d) {
    UI.sheet({
      title: 'Event History', sub: `Last test ${when(d.st.lastTest)} · stored by our server`,
      render: () => {
        const rows = d.log.slice(0, 24).map((e) => `<div class="cell"><span class="cell-main cell-title">${esc(e.k === 'scene' ? 'Safety scenario: ' + e.text : EV[e.k] || e.k)}</span><span class="cell-value">${when(e.t)}</span></div>`).join('');
        return UI.group('Events', rows || '<div class="cell"><span class="cell-main cell-sub">Nothing yet</span></div>') + '<div class="list-footer">The detector keeps no history.</div>';
      },
      footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>',
    });
  }
  function bindSettings(d, ctx) {
    UI.on({
      'sm-feature': ({ k }) => openFeature(d, k, ctx),
      'sm-sw': ({ n }) => { d.settings[n] = !S(d, n); Store.save(); ctx.render(); },
      'sm-nt': ({ n }) => { const v = S(d, 'notify'); if (n === 'all' && v.all) UI.toast('Smoke still notifies the owner'); v[n] = !v[n]; Store.save(); ctx.render(); },
      'rs-history': () => openHistory(d),
    });
  }
  function about(d) {
    const rows = [['Reported state', word(d)], ['Last test', when(d.st.lastTest)], ['Last report', when(d.st.lastSeen)]];
    if (has(d, 'battery')) rows.push(['Battery', `${d.battery} %`]);
    return rows;
  }

  /* ==========================================================================
     Prototype panel — the real room
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    const P = d.phys;
    return `<div class="pp-title">Smoke detector prototype</div>
      <p class="pp-note">Not part of the app. Change what this detector supports and play the room. Spec: <a href="../Device%20Interface%203/12.%20Smoke_Detector_Interface.html" target="_blank">Smoke_Detector_Interface</a></p>
      <h3>Real detector</h3>
      <select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      <h3>The room · <span style="font-weight:400">smoke ${P.level.toFixed(1)} dB/m · ${P.temp.toFixed(0)} °C</span></h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-toast">🍞 Burnt toast</button><button class="pp-btn" data-action="pp-fire">🔥 Real fire</button></div>
      <div class="pp-row">${has(d, 'co') ? `<button class="pp-btn" data-action="pp-co">${P.co ? '🪟 CO gone' : '☁️ CO from the stove'}</button>` : ''}<button class="pp-btn" data-action="pp-clear">🪟 Open the window (air clears)</button></div>
      <h3>The detector</h3>
      <div class="pp-row">${has(d, 'tamper') ? `<button class="pp-btn" data-action="pp-tamper">${d.st.tamper ? '📍 Put it back' : '🪜 Take it down'}</button>` : ''}
        ${has(d, 'fault') ? `<button class="pp-btn" data-action="pp-dust">${d.st.fault ? '🧽 Cleaned' : '🌫 Dusty chamber'}</button>` : ''}
        ${has(d, 'battery') ? `<button class="pp-btn" data-action="pp-batt">🔋 ${battLow(d) ? 'New battery' : 'Battery low'}</button>` : ''}
        <button class="pp-btn" data-action="pp-online">${d.online ? '📴 Stops answering' : '📶 Answers again'}</button></div>
      <h3>Features this detector has</h3>
      ${ALL_GROUPS.map((grp) => `<div class="pp-group">${grp}</div>${g(grp).map((k) => `<label class="pp-chk"><input type="checkbox" data-pp="feat" value="${k}" ${has(d, k) ? 'checked' : ''}> ${F[k].name}${F[k].app ? ' <small style="opacity:.6">(our app)</small>' : ''}</label>`).join('')}`).join('')}
      <h3>Data</h3><button class="pp-btn" data-action="pp-reset">Reset all prototype data</button>`;
  }
  function bindProto(d, ctx) {
    const panel = document.getElementById('protoPanel'); if (!panel) return;
    const commit = (msg) => { evaluate(d); Store.save(); ctx.render(); if (msg) UI.toast(msg); };
    panel.onchange = (e) => {
      const t = e.target;
      if (t.dataset.pp === 'preset') {
        const p = PRESETS.find((x) => x.id === t.value);
        Object.assign(d, { preset: p.id, model: p.model, manufacturer: p.manufacturer, originalName: p.name, features: p.feats.slice(), settings: {} });
        applyDefaults(d);
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); applyDefaults(d); }
      commit();
    };
    UI.on({
      'pp-toast': () => { Object.assign(d.phys, { level: 6.5, fading: false }); commit(has(d, 'level') ? 'A little smoke — a pre-alarm on detectors that measure it' : 'A little smoke — below the alarm level'); },
      'pp-fire': () => { Object.assign(d.phys, { level: 17, temp: 64, fading: false }); commit(); },
      'pp-co': () => { d.phys.co = !d.phys.co; commit(); },
      'pp-clear': () => { d.phys.fading = true; d.phys.co = false; commit('The air clears slowly — the detector reports when it is clear'); },
      'pp-tamper': () => { d.st.tamper = !d.st.tamper; logEv(d, d.st.tamper ? 'tamper' : 'back'); if (d.st.tamper && has(d, 'notify') && S(d, 'notify').service) notifyPush(d, `${W(d)} taken down`, 'Put it back on its base', 'warn'); commit(); },
      'pp-dust': () => { d.st.fault = d.st.fault ? '' : 'dust'; if (d.st.fault) { logEv(d, 'fault'); if (has(d, 'notify') && S(d, 'notify').service) notifyPush(d, `${W(d)}: dusty chamber`, 'Clean or replace the detector', 'warn'); } commit(); },
      'pp-batt': () => { d.battery = battLow(d) ? 100 : 12; if (battLow(d)) { logEv(d, 'battery'); if (has(d, 'notify') && S(d, 'notify').service) notifyPush(d, 'Battery low', `${W(d)} · ${d.battery} %`, 'warn'); } commit(); },
      'pp-online': () => { d.online = !d.online; if (!d.online) logEv(d, 'offline'); else d.st.lastSeen = Date.now(); commit(); },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Smoke detector', F, PRESETS, create, applyDefaults,
    icon: () => 'dev-smoke',
    describe: (p) => `${p.manufacturer} · smoke detector`,
    historyValue: (d) => (has(d, 'history') ? `Last test ${when(d.st.lastTest)}` : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick,
    busy: (d) => d.phys.fading || testing(d) || paused(d),
    protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
    _evaluate: evaluate,   // used by tools/checks
  };
})();
