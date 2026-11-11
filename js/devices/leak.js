/* ==========================================================================
   Water leak sensor — device interface
   Source: "Device Interface 3 / 8. Water_Leak_Sensor_Interface.html" (features from zigbee2mqtt, 89 leak sensors)
   Rule: show a value or setting only if the paired sensor has it.
   Look: the same readout as the contact and motion sensors; instead of a picture, one minimal mark (a drop in a
   circle) that turns red on a leak.

   The sensor reports "wet" at once and "dry" when the floor is dry again (d.st); the real floor (d.phys) lives in the
   prototype panel. Our server sends the messages, keeps the history and runs "close the water" (a scenario).
   ========================================================================== */
Devices.leak = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    leak: { name: 'Water leak alarm', grp: 'Device page', short: 'Alarms when water touches the contacts under the sensor' },
    temperature: { name: 'Temperature & frost warning', grp: 'Device page', short: 'Some leak sensors also measure the temperature' },
    battery: { name: 'Battery', grp: 'Device page', short: 'Leak sensors sleep for years — a dead one gives no warning at all' },
    tamper: { name: 'Tamper / moved', grp: 'Device page', short: 'Reports when it is opened or picked up and moved' },

    buzzer: { name: 'Sound on leak', grp: 'Sensor', type: 'buzzer', def: { on: true, tone: 'tone_1', vol: 'high' }, short: 'The sensor beeps itself, so someone at home hears it at once' },
    alarmMode: { name: 'Alarm on', grp: 'Sensor', type: 'choice', def: 'water_presence',
      opts: [['water_presence', 'When water appears', 'A leak on the floor'], ['water_absence', 'When water disappears', 'A water tank or a pet’s bowl is empty']],
      short: 'Normally a leak; turned around, it warns when the water is gone' },
    testMode: { name: 'Test mode', grp: 'Sensor', type: 'action', short: 'Wet it to check the alarm — no valve closes, nobody is alarmed' },
    identify: { name: 'Find this device', grp: 'Sensor', type: 'action', short: 'Blinks the sensor' },

    notify: { name: 'Leak notifications', grp: 'Notifications', app: true, def: { all: true, critical: true, family: true, frost: true, service: true },
      short: 'Who is told about a leak, how loud, and which other events notify' },
    autoClose: { name: 'Close the water on a leak', grp: 'Automation', app: true, def: { on: true, lost: false },
      short: 'Our hub closes a water valve the moment this sensor gets wet' },
    history: { name: 'Leak history', grp: 'Log', app: true, short: 'When it got wet and dry again — stored by our server' },
  };
  const ALL_GROUPS = ['Device page', 'Sensor', 'Notifications', 'Automation', 'Log'];

  const PRESETS = [
    { id: 'aqara', name: 'Aqara water leak sensor', model: 'SJCGQ11LM', manufacturer: 'Aqara', feats: ['leak', 'battery', 'autoClose', 'notify', 'history'] },
    { id: 'sonoff', name: 'SONOFF water sensor', model: 'SNZB-05P', manufacturer: 'SONOFF', feats: ['leak', 'battery', 'autoClose', 'notify', 'history'] },
    { id: 'tuya', name: 'Tuya water leak detector', model: 'TS0207', manufacturer: 'Tuya', feats: ['leak', 'battery', 'tamper', 'autoClose', 'notify', 'history'] },
    { id: 'third', name: 'Third Reality water sensor (beeps)', model: '3RWS18BZ', manufacturer: 'Third Reality', feats: ['leak', 'battery', 'buzzer', 'autoClose', 'notify', 'history'], buzzerOnOff: true },
    { id: 'ikea', name: 'IKEA BADRING', model: 'E2202', manufacturer: 'IKEA', feats: ['leak', 'battery', 'identify', 'autoClose', 'notify', 'history'] },
    { id: 'frient', name: 'frient leak sensor', model: 'FLSZB-110', manufacturer: 'frient', feats: ['leak', 'temperature', 'battery', 'tamper', 'autoClose', 'notify', 'history'] },
    { id: 'bosch', name: 'Bosch water leak detector', model: 'BSEN-W', manufacturer: 'Bosch', feats: ['leak', 'battery', 'tamper', 'buzzer', 'testMode', 'autoClose', 'notify', 'history'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' && x !== null ? JSON.parse(JSON.stringify(x)) : x);
  const has = (d, k) => d.features.includes(k);
  const S = (d, k) => d.settings[k];
  const preset = (d) => PRESETS.find((p) => p.id === d.preset) || PRESETS[0];
  const W = (d) => d.name;
  const room = (d) => Store.roomName(d.roomId);
  const absence = (d) => has(d, 'alarmMode') && S(d, 'alarmMode') === 'water_absence';
  const testing = (d) => d.st.testUntil > Date.now();
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;
  const frost = (d) => has(d, 'temperature') && d.online && d.temp < 3;
  const valves = () => Store.state.devices.filter((x) => x.type === 'valve');   // the valve device comes later (spec 21)

  function applyDefaults(d) {
    for (const k in F) { const def = F[k].def; if (def !== undefined && d.settings[k] === undefined) d.settings[k] = clone(def); }
  }

  /** History so far: one small leak last week (wet → dry), nothing today. */
  function seedLog(now = Date.now()) {
    const t = now - 6 * 86400000 + 7 * 3600000;
    return [{ t: t + 14 * 60000, k: 'dry' }, { t, k: 'wet' }];
  }

  function create(presetId, { name, roomId } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const log = seedLog();
    const d = {
      id: Store.uid('d'), type: 'leak', preset: p.id, name: name || 'Leak sensor', roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'WL', mac: Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '0.0.0_0019', online: true, showOnHome: true, isNew: true, createdAt: Date.now(),
      features: p.feats.slice(), settings: {},
      st: { wet: false, at: log[0].t, lastSeen: Date.now() - 180000, tamper: false, testUntil: 0, frostSent: false, valveClosed: false },
      phys: { wet: false },
      battery: 86, temp: 18.5, log, blinkAt: 0,
    };
    applyDefaults(d);
    return d;
  }

  /* ---------- Behaviour ---------- */
  function logEv(d, k, extra) { d.log.unshift(Object.assign({ t: Date.now(), k }, extra || {})); d.log.length = Math.min(d.log.length, 60); }
  function notifyPush(d, title, body = '', tone = '') { Store.state.notifications = (Store.state.notifications || 0) + 1; UI.push({ title, body, tone }); }
  /** The alarm state: a leak normally; in "water disappears" mode, the alarm is when it is dry. */
  const alarm = (d) => (absence(d) ? !d.st.wet : d.st.wet);

  /** The sensor reports what its contacts feel now. */
  function report(d) {
    const st = d.st, now = Date.now();
    if (st.wet === d.phys.wet) return '';
    st.wet = d.phys.wet; st.at = now; st.lastSeen = now; d.blinkAt = now;
    const test = testing(d);
    logEv(d, st.wet ? 'wet' : 'dry', test ? { test: true } : null);
    if (!alarm(d)) return '';
    if (test) { notifyPush(d, `Test alarm · ${W(d)}`, 'Test mode — no valve closed, nobody else alarmed'); return 'Test mode: the alarm path works'; }
    const what = absence(d) ? 'No water' : 'Water leak';
    notifyPush(d, `${what} · ${W(d)}`, absence(d) ? `${room(d)}: the water is gone` : `${room(d)} — check it now`, 'danger');
    // a safety scenario (our hub): close the valve
    if (!absence(d) && has(d, 'autoClose') && S(d, 'autoClose').on && valves().length) { st.valveClosed = true; logEv(d, 'valve'); }
    return '';
  }

  function tick(d) {
    let changed = false;
    if (frost(d) && !d.st.frostSent) {
      d.st.frostSent = true; logEv(d, 'frost'); changed = true;
      if (has(d, 'notify') && S(d, 'notify').frost) notifyPush(d, `Frost warning · ${W(d)}`, `${d.temp.toFixed(1)} °C — pipes may freeze`, 'warn');
    }
    if (d.st.frostSent && (!has(d, 'temperature') || d.temp >= 5)) { d.st.frostSent = false; changed = true; }
    if (d.st.testUntil && Date.now() >= d.st.testUntil) { d.st.testUntil = 0; changed = true; }
    return changed;
  }

  /* ---------- Text ---------- */
  const agoText = (ms) => { const m = Math.floor(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
  const startOfDay = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };
  const when = (t) => (t >= startOfDay() ? UI.fmtTime(t) : t >= startOfDay() - 86400000 ? 'yesterday ' + UI.fmtTime(t) : new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }));
  const lastLeak = (d) => d.log.find((e) => e.k === (absence(d) ? 'dry' : 'wet') && !e.test);
  const word = (d) => (!d.online ? 'Unknown' : absence(d) ? (d.st.wet ? 'Water' : 'No water') : d.st.wet ? 'Leak!' : 'Dry');
  function subText(d) {
    if (!d.online) return `Last report ${when(d.st.lastSeen)}`;
    if (alarm(d)) return `${testing(d) ? 'Test · ' : ''}Since ${when(d.st.at)} · ${room(d)}`;
    // dry: when the sensor last answered — a leak sensor that has gone quiet is the real risk
    return `Checked ${agoText(Date.now() - d.st.lastSeen)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };   // a silent leak sensor protects nothing
    if (alarm(d)) return { text: absence(d) ? 'No water' : 'Leak!', tone: 'danger' };
    if (d.st.tamper) return { text: 'Moved / opened', tone: 'warn' };
    return { text: absence(d) ? 'Water' : 'Dry' };
  }
  function homeTiles(d) {
    const s = tileStatus(d);
    return [{ ch: 0, name: d.name, icon: 'dev-drop', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }];
  }

  /* ==========================================================================
     Device page
     ========================================================================== */
  /** No illustration (user, 2026-11-11): one minimal mark — a water drop in a circle. Dry: quiet grey. Leak: red, and one
      soft ring breathes out slowly. Offline: dimmed. */
  function scene(d) {
    const cls = ['lk-mark', alarm(d) ? 'is-alarm' : '', !d.online ? 'is-off' : ''].join(' ');
    return `<div class="${cls}" data-cl="scene" role="img" aria-label="${esc(W(d))}: ${esc(word(d))}"><i class="lk-halo"></i><span class="lk-disc">${icon('dev-drop', 'icon', 'style="width:44px;height:44px"')}</span></div>`;
  }

  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += `<div class="pad cw-gap" data-key="ban-off"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · No report since ${when(st.lastSeen)}. A silent leak sensor gives no warning — check the battery.</div></div></div>`;
    if (d.online && alarm(d) && !testing(d)) h += `<div class="pad cw-gap" data-key="ban-leak"><div class="banner danger">${icon('dev-drop')}<div><b>${absence(d) ? 'No water' : 'Water detected'}</b> · ${esc(room(d))}${st.valveClosed ? ' · the water valve was closed' : ''}</div></div></div>`;
    if (testing(d)) h += `<div class="pad cw-gap" data-key="ban-test"><div class="banner info">${icon('round-info')}<div><b>Test mode</b> · Wet the sensor — no valve closes, nobody else is alarmed</div></div></div>`;
    if (st.tamper) h += `<div class="pad cw-gap" data-key="ban-tamper"><div class="banner warn">${icon('banner-error')}<div><b>Moved or opened</b> · A sensor away from its spot protects nothing</div></div></div>`;
    if (frost(d)) h += `<div class="pad cw-gap" data-key="ban-frost"><div class="banner warn">${icon('temperature')}<div><b>Frost risk · ${d.temp.toFixed(1)} °C</b> · Pipes may freeze</div></div></div>`;
    if (battLow(d)) h += `<div class="pad cw-gap" data-key="ban-batt"><div class="banner warn">${icon('battery')}<div><b>Battery low · ${d.battery} %</b></div></div></div>`;

    h += `<div class="pad" data-key="scene">${scene(d)}</div>`;
    const tone = !d.online ? '' : alarm(d) ? 'alarm' : 'closed';
    const last = lastLeak(d);
    h += `<div class="cw-readout ct-readout" data-key="readout"><div><div class="ct-word ${tone}" data-cl="word">${esc(word(d))}</div>
        <div class="cw-state" data-num data-live="sub">${esc(subText(d))}</div></div>
        ${has(d, 'history') && !alarm(d) ? `<span class="cw-hint">${last ? `Last leak ${when(last.t)}` : 'No leaks yet'}</span>` : ''}</div>`;

    const cards = [];
    if (has(d, 'temperature')) cards.push(`<div class="info-card wide"><span>${frost(d) ? 'Temperature · frost risk' : 'Temperature'}</span><b data-num="count">${d.online ? d.temp.toFixed(1) + ' °C' : '—'}</b>${icon('temperature')}</div>`);
    if (has(d, 'battery')) cards.push(`<div class="info-card wide"><span>${battLow(d) ? 'Battery · replace it now' : 'Battery'}</span><b data-num="count">${d.battery} %</b>${icon('battery')}</div>`);
    if (cards.length) h += `<div class="pad info-grid" data-key="info" style="margin-top:24px">${cards.join('')}</div>`;
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), subText(d)); }
  function bindPage() {}

  /* ==========================================================================
     Settings
     ========================================================================== */
  const row = (k, title, value) => `<button class="cell" data-action="lk-feature" data-k="${k}"><span class="cell-main cell-title">${esc(title)}</span>${value ? `<span class="cell-value">${esc(value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
  const sw = (key, title, sub, on, dis) => `<button class="cell" data-action="lk-nt" data-n="${key}" role="switch" aria-checked="${on}" ${dis ? 'aria-disabled="true"' : ''}>
      <span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>
      <span class="switch" aria-hidden="true" aria-checked="${on}" ${dis ? 'style="opacity:.4"' : ''}></span></button>`;
  const TONES = [['tone_1', 'Tone 1'], ['tone_2', 'Tone 2'], ['tone_3', 'Tone 3']], VOLS = [['low', 'Low'], ['middle', 'Middle'], ['high', 'High']];
  function summary(d, k) {
    const v = S(d, k);
    if (k === 'buzzer') return !v.on ? 'Off' : preset(d).buzzerOnOff ? 'On' : `${TONES.find((t) => t[0] === v.tone)[1]} · ${VOLS.find((t) => t[0] === v.vol)[1]}`;
    if (k === 'alarmMode') return F.alarmMode.opts.find((o) => o[0] === v)[1];
    if (k === 'autoClose') return v.on ? (valves().length ? valves()[0].name : 'No valve yet') : 'Off';
    return '';
  }
  function settings(d) {
    let h = '';
    const sen = [];
    if (has(d, 'buzzer')) sen.push(row('buzzer', F.buzzer.name, summary(d, 'buzzer')));
    if (has(d, 'alarmMode')) sen.push(row('alarmMode', F.alarmMode.name, summary(d, 'alarmMode')));
    if (has(d, 'testMode')) sen.push(`<button class="cell" data-action="lk-test"><span class="cell-main"><span class="cell-title" style="display:block">Test mode</span><span class="cell-sub" style="display:block">${testing(d) ? 'On — ends by itself in 10 min' : 'Check the alarm without closing the water'}</span></span><span class="cell-value">${testing(d) ? 'Stop' : 'Start'}</span></button>`);
    if (sen.length) h += `<div class="list-header">Sensor</div><div class="list">${sen.join('')}</div>`;
    if (has(d, 'notify')) {
      const n = S(d, 'notify');
      h += `<div class="list-header">Notifications</div><div class="list">${sw('all', 'Everyone in this home', 'A leak always tells at least the owner', n.all)}${sw('critical', 'Critical alert', 'Rings even on silent phones', n.critical)}${sw('family', 'Family or a neighbour with a key', '', n.family)}${has(d, 'temperature') ? sw('frost', 'Frost warning below 3 °C', '', n.frost) : ''}${sw('service', 'Battery low, moved or opened', '', n.service)}</div>`;
    }
    if (has(d, 'autoClose')) h += `<div class="list-header">Automation</div><div class="list">${row('autoClose', F.autoClose.name, summary(d, 'autoClose'))}</div><div class="list-footer">A scenario in our app: the hub closes the valve even without internet.</div>`;
    return h;
  }
  const radio = (act, cur, opts) => opts.map((o) => `<button class="option" role="radio" aria-checked="${cur === o[0]}" data-action="${act}" data-v="${o[0]}">
      <span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('');
  function openFeature(d, k, ctx) {
    const f = F[k];
    const s = UI.sheet({
      title: f.name, sub: esc(f.short),
      render: () => {
        const v = S(d, k);
        if (k === 'alarmMode') return `<div class="list">${radio('lk-opt', v, f.opts)}</div>`;
        if (k === 'buzzer') {
          return `<div class="list"><button class="cell" data-action="lk-tog" data-x="on"><span class="cell-main cell-title">Beep when it gets wet</span><span class="switch" role="switch" aria-checked="${v.on}"></span></button></div>`
            + (preset(d).buzzerOnOff ? '<div class="list-footer">This sensor only lets you turn the sound on or off.</div>' : UI.collapse(v.on, UI.group('Ringtone', radio('lk-tone', v.tone, TONES)) + UI.group('Volume', radio('lk-vol', v.vol, VOLS))));
        }
        if (k === 'autoClose') {
          const vs = valves();
          return `<div class="list"><button class="cell" data-action="lk-tog" data-x="on"><span class="cell-main"><span class="cell-title" style="display:block">Close a water valve when it gets wet</span></span><span class="switch" role="switch" aria-checked="${v.on}"></span></button>
              <button class="cell" data-action="lk-tog" data-x="lost"><span class="cell-main"><span class="cell-title" style="display:block">Also when this sensor stops answering</span></span><span class="switch" role="switch" aria-checked="${v.lost}"></span></button></div>`
            + UI.group('Valve', vs.length ? vs.map((x) => `<div class="cell"><span class="cell-main cell-title">${esc(x.name)}</span></div>`).join('') : '<div class="cell"><span class="cell-main cell-sub">No water valve in this home yet — add one, and it will close here</span></div>')
            + '<div class="list-footer">The valve is a device of its own. Reopen it on its page once the leak is fixed.</div>';
        }
        return '';
      },
      footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>',
    });
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    UI.on({
      'lk-opt': ({ v }) => { d.settings[k] = v; commit(); },
      'lk-tog': ({ x }) => { S(d, k)[x] = !S(d, k)[x]; commit(); },
      'lk-tone': ({ v }) => { S(d, k).tone = v; commit(); },
      'lk-vol': ({ v }) => { S(d, k).vol = v; commit(); },
    });
  }

  /* ---------- Event history (Settings → Event History) ---------- */
  const EV = { wet: 'Water detected', dry: 'Dry again', valve: 'Water valve closed', frost: 'Frost warning', tamper: 'Moved or opened', cover: 'Back in place', battery: 'Battery low', offline: 'Stopped answering' };
  function strip(d) {
    const t0 = startOfDay(), now = Date.now(), span = 86400000;
    const evs = d.log.filter((e) => e.t >= t0 && (e.k === 'wet' || e.k === 'dry')).slice().reverse();
    const before = d.log.find((e) => e.t < t0 && (e.k === 'wet' || e.k === 'dry'));
    let a = before && before.k === 'wet' ? t0 : null; const segs = [];
    for (const e of evs) { if (e.k === 'wet') { if (a === null) a = e.t; } else if (a !== null) { segs.push([a, e.t]); a = null; } }
    if (a !== null) segs.push([a, now]);
    const pct = (t) => ((t - t0) / span) * 100;
    return `<div class="ct-strip lk-strip"><div class="bar">${segs.map(([x, z]) => `<i style="left:${pct(x).toFixed(2)}%;width:max(3px,${(pct(z) - pct(x)).toFixed(2)}%)"></i>`).join('')}<b style="left:${pct(now).toFixed(2)}%"></b></div>
      <div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div></div>`;
  }
  function openHistory(d) {
    UI.sheet({
      title: 'Event History', sub: 'Today · red = wet',
      render: () => {
        const rows = d.log.slice(0, 20).map((e) => `<div class="cell"><span class="cell-main cell-title">${esc(EV[e.k] || e.k)}${e.test ? ' · test' : ''}</span><span class="cell-value">${when(e.t)}</span></div>`).join('');
        return UI.group('Today', `<div class="group-pad">${strip(d)}</div>`) + UI.group('Events', rows || '<div class="cell"><span class="cell-main cell-sub">Nothing yet</span></div>')
          + '<div class="list-footer">Stored by our server. The sensor itself keeps no history.</div>';
      },
      footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>',
    });
  }

  function bindSettings(d, ctx) {
    UI.on({
      'lk-feature': ({ k }) => openFeature(d, k, ctx),
      'lk-nt': ({ n }) => {
        const v = S(d, 'notify');
        if (n === 'all' && v.all) { UI.toast('A leak always notifies at least the owner'); }
        v[n] = !v[n]; Store.save(); ctx.render();
      },
      'lk-test': () => {
        if (!d.online) return UI.toast('The sensor is offline');
        d.st.testUntil = testing(d) ? 0 : Date.now() + 600000; Store.save(); ctx.render();
        UI.toast(testing(d) ? 'Test mode on — wet the sensor' : 'Test mode off');
      },
      'rs-history': () => openHistory(d),
      'rs-identify': () => { if (!d.online) return UI.toast('The sensor is offline'); d.blinkAt = Date.now(); Store.save(); UI.toast('The sensor blinks. Asleep? Press its button first'); },
    });
  }

  function about(d) {
    const rows = [['Reported state', word(d)], ['Last report', when(d.st.lastSeen)]];
    if (has(d, 'battery')) rows.push(['Battery', `${d.battery} % · ${(2.6 + d.battery / 250).toFixed(2)} V`]);
    if (has(d, 'temperature')) rows.push(['Temperature', `${d.temp.toFixed(1)} °C`]);
    return rows;
  }

  /* ==========================================================================
     Prototype panel — the real floor
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    return `<div class="pp-title">Leak sensor prototype</div>
      <p class="pp-note">Not part of the app. Change what this sensor supports and play the floor. Spec: <a href="../Device%20Interface%203/8.%20Water_Leak_Sensor_Interface.html" target="_blank">Water_Leak_Sensor_Interface</a></p>
      <h3>Real sensor</h3>
      <select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      <h3>The floor · <span style="font-weight:400">${d.phys.wet ? 'wet' : 'dry'}</span></h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-wet">${d.phys.wet ? '🧽 Wipe it dry' : '💧 Spill water'}</button>
        ${has(d, 'temperature') ? `<button class="pp-btn" data-action="pp-cold">${d.temp < 3 ? '🌤 Normal 18 °C' : '❄️ Winter 1 °C'}</button>` : ''}</div>
      <h3>The sensor</h3>
      <div class="pp-row">${has(d, 'tamper') ? `<button class="pp-btn" data-action="pp-tamper">${d.st.tamper ? '📍 Put it back' : '✋ Pick it up'}</button>` : ''}
        ${has(d, 'battery') ? `<button class="pp-btn" data-action="pp-batt">🔋 ${battLow(d) ? 'New battery' : 'Battery low'}</button>` : ''}
        <button class="pp-btn" data-action="pp-online">${d.online ? '📴 Stops answering' : '📶 Answers again'}</button></div>
      <h3>Features this sensor has</h3>
      ${ALL_GROUPS.map((grp) => `<div class="pp-group">${grp}</div>${g(grp).map((k) => `<label class="pp-chk"><input type="checkbox" data-pp="feat" value="${k}" ${has(d, k) ? 'checked' : ''}> ${F[k].name}${F[k].app ? ' <small style="opacity:.6">(our app)</small>' : ''}</label>`).join('')}`).join('')}
      <h3>Data</h3><button class="pp-btn" data-action="pp-reset">Reset all prototype data</button>`;
  }
  function bindProto(d, ctx) {
    const panel = document.getElementById('protoPanel'); if (!panel) return;
    const commit = (msg) => { Store.save(); ctx.render(); if (msg) UI.toast(msg); };
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
      'pp-wet': () => { d.phys.wet = !d.phys.wet; if (!d.online) return commit('The sensor is offline — nothing reported'); commit(report(d)); },
      'pp-cold': () => { d.temp = d.temp < 3 ? 18.5 : 1.2; tick(d); commit(); },
      'pp-tamper': () => {
        d.st.tamper = !d.st.tamper; logEv(d, d.st.tamper ? 'tamper' : 'cover');
        if (d.st.tamper && has(d, 'notify') && S(d, 'notify').service) notifyPush(d, `${W(d)} moved or opened`, 'A sensor away from its spot protects nothing', 'warn');
        commit();
      },
      'pp-batt': () => {
        d.battery = battLow(d) ? 100 : 11;
        if (battLow(d)) { logEv(d, 'battery'); if (has(d, 'notify') && S(d, 'notify').service) notifyPush(d, 'Battery low', `${W(d)} · ${d.battery} %`, 'warn'); }
        commit();
      },
      'pp-online': () => {
        d.online = !d.online;
        if (!d.online) {
          logEv(d, 'offline');
          if (has(d, 'autoClose') && S(d, 'autoClose').lost && valves().length) { d.st.valveClosed = true; logEv(d, 'valve'); }
          return commit();
        }
        d.st.lastSeen = Date.now(); report(d); commit();
      },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Leak sensor', F, PRESETS, create, applyDefaults,
    icon: () => 'dev-drop',
    describe: (p) => `${p.manufacturer} · water leak sensor`,
    historyValue: (d) => (has(d, 'history') ? (lastLeak(d) ? `Last leak ${when(lastLeak(d).t)}` : 'No leaks') : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick,
    busy: () => false,
    protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
    _report: report,   // used by tools/checks
  };
})();
