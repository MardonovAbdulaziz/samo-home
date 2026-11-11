/* ==========================================================================
   Air quality monitor — device interface (spec: Device Interface 3 / 18. Air_Quality_Sensor_Interface.html)
   One word for the air (Excellent / Good = white, Moderate = yellow, Poor = orange, Unhealthy = red), the reason
   and ONE clear thing to do (“CO2 1 450 — open a window for 10 minutes”). Each measured value gets a card with its
   own level. Values move smoothly (the room changes slowly), never jump.
   ========================================================================== */
Devices.air = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    quality: { name: 'Overall air quality', grp: 'Device page', short: 'One word and one colour for the air' },
    co2: { name: 'CO2', grp: 'Device page', short: 'Stuffy air from breathing — fix: fresh air' },
    pm: { name: 'Particles (PM2.5, PM10)', grp: 'Device page', short: 'Dust and smoke — cooking, smoking, smog' },
    voc: { name: 'VOC (chemicals in the air)', grp: 'Device page', short: 'Cooking, cleaning products, perfume, paint' },
    hcho: { name: 'Formaldehyde', grp: 'Device page', short: 'From new furniture, laminate and glue' },
    climate: { name: 'Temperature & humidity', grp: 'Device page', short: 'Most monitors also measure these' },
    battery: { name: 'Battery', grp: 'Device page', short: 'A few run on batteries' },
    beep: { name: 'Built-in CO2 alarm', grp: 'Sensor', type: 'fields', def: { on: true, co2: 1500, tone: 'ring1' }, short: 'The monitor beeps by itself above a CO2 value',
      fields: [{ id: 'on', kind: 'tog', label: 'Beep when CO2 is high', noSum: true }, { id: 'co2', label: 'Beep above', unit: 'ppm', min: 1000, max: 5000, step: 100 }, { id: 'tone', kind: 'sel', label: 'Sound', opts: [['ring1', 'Sound 1'], ['ring2', 'Sound 2'], ['ring3', 'Sound 3']] }] },
    fan: { name: 'Switch a fan directly', grp: 'Sensor', type: 'fields', def: { on: false, high: 1000, low: 700 }, short: 'Turns a bound fan on when CO2 is high',
      fields: [{ id: 'on', kind: 'tog', label: 'Control a bound fan', noSum: true }, { id: 'high', label: 'Fan on above', unit: 'ppm', min: 600, max: 3000, step: 50 }, { id: 'low', label: 'Fan off below', unit: 'ppm', min: 400, max: 2500, step: 50 }] },
    calibration: { name: 'CO2 calibration', grp: 'Sensor', type: 'fields', def: { auto: true, alt: 455 }, short: 'CO2 sensors drift — they correct themselves weekly',
      fields: [{ id: 'auto', kind: 'tog', label: 'Automatic self-calibration', hint: 'Needs fresh air (≈420 ppm) once a week' }, { id: 'alt', label: 'Altitude', unit: 'm', min: 0, max: 3000, step: 5, hint: 'Tashkent ≈ 455 m' }] },
    display: { name: 'Screen & light', grp: 'Sensor', type: 'fields', def: { night: true, from: 22, to: 7, auto: true, unit: 'celsius' }, short: 'Brightness, night mode and units',
      fields: [{ id: 'night', kind: 'tog', label: 'Screen off at night' }, { id: 'from', label: 'Night from', unit: 'h', min: 0, max: 23 }, { id: 'to', label: 'until', unit: 'h', min: 0, max: 23 }, { id: 'auto', kind: 'tog', label: 'Auto brightness' }, { id: 'unit', kind: 'sel', label: 'Temperature unit', opts: [['celsius', '°C'], ['fahrenheit', '°F']] }] },
    pmClean: { name: 'Particle sensor cleaning', grp: 'Sensor', type: 'fields', def: { days: 7 }, short: 'Blows the fan hard now and then to clear dust',
      fields: [{ id: 'days', label: 'Clean the fan every', unit: 'days', min: 0, max: 10 }] },
    reporting: { name: 'How often it reports', grp: 'Sensor', type: 'number', def: 60, min: 10, max: 600, unit: 's', label: 'Every', short: 'More often = fresher numbers, shorter battery' },
    identify: { name: 'Find this device', grp: 'Sensor', type: 'action', short: 'Blinks the monitor', done: 'The monitor is blinking' },
    alerts: { name: 'Bad-air notifications', grp: 'Notifications', type: 'fields', app: true, def: { on: true, co2: 1200, pm: 35, voc: 250 }, short: 'A push with one clear tip when the air gets bad',
      fields: [{ id: 'on', kind: 'tog', label: 'Notify when the air gets bad', noSum: true }, { id: 'co2', label: 'CO2 above', unit: 'ppm', min: 600, max: 3000, step: 50 }, { id: 'pm', label: 'PM2.5 above', unit: 'µg/m³', min: 5, max: 150, step: 5 }, { id: 'voc', label: 'VOC index above', min: 100, max: 500, step: 10 }] },
    history: { name: 'Air history', grp: 'Log', app: true, short: 'CO2, particles and VOC over the day' },
  };
  const GROUPS = ['Device page', 'Sensor', 'Notifications', 'Automation', 'Log'];
  const PRESETS = [
    { id: 'aqara', name: 'Aqara TVOC air quality monitor', model: 'VOCKQJK11LM', manufacturer: 'Aqara', feats: ['quality', 'voc', 'climate', 'battery', 'alerts', 'history', 'display'] },
    { id: 'ikea', name: 'IKEA VINDSTYRKA', model: 'E2112', manufacturer: 'IKEA', feats: ['quality', 'pm', 'voc', 'climate', 'alerts', 'history', 'identify'] },
    { id: 'tuyabox', name: 'Tuya air box (CO2, VOC, formaldehyde)', model: 'TS0601_air_quality_sensor', manufacturer: 'Tuya', feats: ['quality', 'co2', 'voc', 'hcho', 'climate', 'alerts', 'history'] },
    { id: 'tuyaco2', name: 'Tuya NDIR CO2 sensor', model: 'TS0601_co2_sensor', manufacturer: 'Tuya', feats: ['co2', 'alerts', 'history'] },
    { id: 'lin', name: 'CO2 monitor with alarm', model: 'EZC04', manufacturer: 'Lincukoo', feats: ['co2', 'climate', 'battery', 'beep', 'alerts', 'history', 'calibration', 'display'] },
    { id: 'third', name: 'Third Reality air quality sensor', model: '3RAQ1096Z', manufacturer: 'Third Reality', feats: ['quality', 'co2', 'voc', 'climate', 'alerts', 'history'] },
    { id: 'efekta', name: 'EFEKTA Air Quality Station 2', model: 'EFEKTA_AQS2', manufacturer: 'EFEKTA', feats: ['quality', 'co2', 'pm', 'voc', 'climate', 'alerts', 'history', 'fan', 'calibration', 'display', 'pmClean', 'reporting', 'identify'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];
  // level 0 excellent · 1 good · 2 moderate · 3 poor · 4 unhealthy
  const LV = ['Excellent', 'Good', 'Moderate', 'Poor', 'Unhealthy'];
  const STEPS = { co2: [800, 1000, 1400, 2000], pm: [10, 25, 50, 75], voc: [100, 150, 250, 400], hcho: [0.03, 0.08, 0.1, 0.3] };
  const lv = (k, v) => STEPS[k].filter((x) => v >= x).length;
  const TIP = {
    co2: 'open a window for 10 minutes', pm: 'turn on the kitchen hood or the purifier', voc: 'air the room — cleaning products and paint add VOC', hcho: 'air the room every day — new furniture adds formaldehyde',
  };
  const NAME = { co2: 'CO2', pm: 'Particles', voc: 'VOC', hcho: 'Formaldehyde' };

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const v = { co2: 690, pm: 8, voc: 85, hcho: 0.02, t: 23.4, h: 41, };
    const d = Kit.base('air', p, Object.assign({ name: 'Air quality' }, opts), {
      battery: 81, v: Object.assign({}, v), phys: Object.assign({}, v),
      st: { lastSeen: now - 60000, sent: {}, beeping: false, fanOn: false, cleanUntil: 0, hourly: Array.from({ length: 24 }, (_, i) => Math.round(520 + 420 * Math.max(0, Math.sin((i - 5) / 24 * Math.PI * 2)) + (i > 21 || i < 7 ? 380 : 0))) },
    });
    Kit.applyDefaults(F, d);
    return d;
  }
  const applyDefaults = (d) => Kit.applyDefaults(F, d);
  const keys = (d) => ['co2', 'pm', 'voc', 'hcho'].filter((k) => has(d, k));
  function worst(d) { let w = { k: null, l: 0 }; keys(d).forEach((k) => { const l = lv(k, d.v[k]); if (l > w.l) w = { k, l }; }); return w; }

  function tick(d) {
    if (!d.online) return false;
    const P = d.phys, V = d.v; let ch = false;
    // the room changes slowly: values drift toward the real air
    for (const k of ['co2', 'pm', 'voc', 'hcho', 't', 'h']) {
      const diff = P[k] - V[k]; if (Math.abs(diff) < (k === 'hcho' ? 0.002 : 0.4)) { if (V[k] !== P[k]) { V[k] = P[k]; ch = true; } continue; }
      V[k] = +(V[k] + diff * 0.18).toFixed(k === 'hcho' ? 3 : 1); ch = true;
    }
    if (d.sim.people && P.co2 < 2400) { P.co2 += 9; ch = true; }
    const st = d.st, a = S(d, 'alerts');
    if (has(d, 'alerts') && a.on) {
      const lim = { co2: a.co2, pm: a.pm, voc: a.voc };
      Object.keys(lim).forEach((k) => {
        if (!has(d, k)) return; const over = V[k] >= lim[k];
        if (over && !st.sent[k]) { st.sent[k] = true; Kit.logEv(d, 'bad', { text: `${NAME[k]} high · ${fmt(k, V[k])}` }); Kit.push(`${d.name}: ${NAME[k]} high`, `${fmt(k, V[k])} — ${TIP[k]}`, 'warn'); }
        if (!over && st.sent[k] && V[k] < lim[k] * 0.9) { st.sent[k] = false; Kit.logEv(d, 'good', { text: `${NAME[k]} back to normal` }); }
      });
    }
    if (has(d, 'beep')) { const b = S(d, 'beep'), on = b.on && V.co2 >= b.co2; if (on !== st.beeping) { st.beeping = on; if (on) Kit.logEv(d, 'beep'); } }
    if (has(d, 'fan')) { const f = S(d, 'fan'); if (f.on && !st.fanOn && V.co2 >= f.high) { st.fanOn = true; Kit.logEv(d, 'fan', { text: 'Fan on — CO2 high' }); } else if (st.fanOn && (!f.on || V.co2 <= f.low)) { st.fanOn = false; Kit.logEv(d, 'fan', { text: 'Fan off — air fresh' }); } }
    if (st.cleanUntil && Date.now() >= st.cleanUntil) { st.cleanUntil = 0; ch = true; }
    if (ch) st.lastSeen = Date.now();
    return ch;
  }

  /* ---------- Text ---------- */
  const fmt = (k, v) => (k === 'co2' ? `${Math.round(v)} ppm` : k === 'pm' ? `${Math.round(v)} µg/m³` : k === 'voc' ? `${Math.round(v)}` : `${v.toFixed(2)} mg/m³`);
  const word = (d) => (!d.online ? 'Unknown' : LV[worst(d).l]);
  const tone = (d) => { const l = worst(d).l; return !d.online ? '' : l >= 4 ? 'alarm' : l === 3 ? 'open' : l === 2 ? 'mid' : 'closed'; };
  function subText(d) {
    if (!d.online) return `Last report ${when(d.st.lastSeen)}`;
    const w = worst(d);
    if (w.l >= 2) return `${NAME[w.k]} ${fmt(w.k, d.v[w.k])} — ${TIP[w.k]}`;
    if (d.st.cleanUntil) return 'Cleaning the particle sensor';
    return keys(d).length ? 'Fresh air — nothing to do' : `Checked ${ago(Date.now() - d.st.lastSeen)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    const w = worst(d);
    if (w.l >= 3) return { text: `${LV[w.l]} · ${NAME[w.k]}`, tone: w.l >= 4 ? 'danger' : 'warn' };
    return { text: has(d, 'co2') ? `${LV[w.l]} · ${Math.round(d.v.co2)} ppm` : has(d, 'climate') ? `${LV[w.l]} · ${d.v.t.toFixed(1)}°` : LV[w.l] };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: 'dev-air', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }]; };

  /* ---------- Device page ---------- */
  /** Dust when the air gets bad: a few slow specks drift around the mark — more of them the worse it is.
      Positions come from the index (not Math.random), so a re-render keeps every speck where it is. */
  function dust(l) {
    if (l < 2) return '';
    const n = l === 2 ? 9 : l === 3 ? 15 : 22, f = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
    let h = '';
    for (let i = 0; i < n; i++) h += `<span style="--x:${(8 + f(i, 1) * 84).toFixed(1)}%;--y:${(10 + f(i, 2) * 80).toFixed(1)}%;--s:${(2 + f(i, 3) * 2.6).toFixed(1)}px;--t:${(7 + f(i, 4) * 6).toFixed(1)}s;--dl:-${(f(i, 5) * 12).toFixed(1)}s;--dx:${(f(i, 6) * 28 - 14).toFixed(0)}px"></span>`;
    return `<i class="aq-dust lv${l}" aria-hidden="true">${h}</i>`;
  }
  const lvTone = (l) => (l >= 4 ? 'z2' : l === 3 ? 'z1' : l === 2 ? 'zy' : '');
  function page(d) {
    const st = d.st, V = d.v, w = worst(d);
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (st.beeping) h += Kit.banner('ban-beep', 'warn', 'bell', `<b>The monitor is beeping</b> · CO2 is above ${S(d, 'beep').co2} ppm`);
    if (has(d, 'battery') && d.battery <= 20) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    h += Kit.mark(d, 'dev-air', !d.online ? 'calm' : w.l >= 4 ? 'alarm' : w.l === 3 ? 'warn' : w.l === 2 ? 'mid' : 'calm', `${d.name}: ${word(d)}`, d.online ? dust(w.l) : '');
    h += Kit.readout(word(d), tone(d), subText(d), st.fanOn ? 'Fan on' : '');
    const card = (k, label, max) => { const l = lv(k, V[k]); return [`${label} · ${LV[l].toLowerCase()}`, d.online ? fmt(k, V[k]) : '—', { wide: true, count: true, cls: 'sm-level', html: Kit.bar(V[k] / max, lvTone(l), STEPS[k].slice(1, 3).map((x) => x / max)) }]; };
    h += Kit.cards([
      has(d, 'co2') && card('co2', 'CO2', 2500),
      has(d, 'pm') && card('pm', 'Particles PM2.5', 100),
      has(d, 'voc') && card('voc', 'VOC index', 500),
      has(d, 'hcho') && card('hcho', 'Formaldehyde', 0.4),
      has(d, 'climate') && ['Temperature', `${V.t.toFixed(1)} °C`, { count: true }],
      has(d, 'climate') && ['Humidity', `${Math.round(V.h)} %`, { count: true }],
      has(d, 'battery') && ['Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    h += Kit.actionRows('rows', [
      has(d, 'history') && ['aq-hist', 'Air today', has(d, 'co2') ? `CO2 was highest at night — ${Math.max(...st.hourly)} ppm` : 'How the air changed over the day'],
      has(d, 'pmClean') && ['aq-clean', 'Clean the particle sensor', st.cleanUntil ? 'Cleaning — the fan is loud for a few seconds' : 'Blows the dust out now', !!st.cleanUntil],
    ]);
    return h + '<div style="height:28px"></div>';
  }
  function chart(d) {
    const H = d.st.hourly, mx = Math.max(...H, 1200);
    return `<div class="pad"><div class="info-card wide sm-level"><span>CO2 · last 24 hours</span><b>${Math.round(d.v.co2)} ppm now</b><div class="pl-bars aq-bars">${H.map((v, i) => `<i class="${lvTone(lv('co2', v))}" style="height:${Math.max(4, v / mx * 100).toFixed(0)}%">${i % 6 === 0 ? `<s>${i}:00</s>` : ''}</i>`).join('')}</div></div></div><div class="list-footer">High at night = the bedroom needs air before sleep (a window ajar, or the door open).</div><div style="height:24px"></div>`;
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), subText(d)); }
  const EV = { bad: 'Air got bad', good: 'Air back to normal', beep: 'The monitor beeped (CO2)', fan: 'Fan', offline: 'Stopped answering' };
  function bindPage(d, ctx) {
    UI.on({
      'aq-hist': () => Kit.historySheet(d, EV, 'The air in this room', has(d, 'co2') ? () => chart(d) : null),
      'aq-clean': () => { if (d.st.cleanUntil) return; d.st.cleanUntil = Date.now() + 8000; Store.save(); ctx.render(); },
    });
  }
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d);
  function bindSettings(d, ctx) { Kit.bindSettings(F, d, ctx); UI.on({ 'rs-history': () => Kit.historySheet(d, EV, 'The air in this room', has(d, 'co2') ? () => chart(d) : null) }); }
  const about = (d) => [['Air', word(d)], ...keys(d).map((k) => [NAME[k], fmt(k, d.v[k])])];

  function protoPanel(d) {
    return Kit.protoHead('Air quality prototype', '18. Air_Quality_Sensor_Interface.html', PRESETS, d) + `
      <h3>The room · <span style="font-weight:400">${keys(d).map((k) => `${NAME[k]} ${fmt(k, d.phys[k])}`).join(' · ')}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-people', d.sim.people ? '🚪 People left' : '👨‍👩‍👧 Family in a closed room', has(d, 'co2'))}${Kit.ppBtn('pp-window', '🪟 Open a window')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-cook', '🍳 Frying', has(d, 'pm') || has(d, 'voc'))}${Kit.ppBtn('pp-smog', '🌫 Smog outside', has(d, 'pm'))}${Kit.ppBtn('pp-clean', '🧴 Cleaning spray', has(d, 'voc'))}${Kit.ppBtn('pp-sofa', '🛋 New furniture', has(d, 'hcho'))}</div>
      <h3>The monitor</h3>
      <div class="pp-row">${Kit.ppBtn('pp-batt', d.battery <= 20 ? '🔋 Charged' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    const P = d.phys;
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-people': () => { d.sim.people = !d.sim.people; return d.sim.people ? 'CO2 climbs while everyone breathes in a closed room' : ''; },
      'pp-window': () => { d.sim.people = false; Object.assign(P, { co2: 460, voc: Math.min(P.voc, 90), hcho: Math.min(P.hcho, 0.03), pm: d.sim.smog ? 68 : Math.min(P.pm, 9), t: P.t - 1.5 }); },
      'pp-cook': () => { Object.assign(P, { pm: 62, voc: 290 }); },
      'pp-smog': () => { d.sim.smog = !d.sim.smog; P.pm = d.sim.smog ? 70 : 8; },
      'pp-clean': () => { P.voc = 330; },
      'pp-sofa': () => { P.hcho = 0.19; },
      'pp-batt': () => { d.battery = d.battery <= 20 ? 100 : 11; },
      'pp-online': () => { d.online = !d.online; if (!d.online) Kit.logEv(d, 'offline'); else d.st.lastSeen = Date.now(); },
    });
  }

  return {
    label: 'Air quality', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'Air quality',
    icon: () => 'dev-air', describe: (p) => `${p.manufacturer} · air quality monitor`,
    historyValue: (d) => (has(d, 'history') ? word(d) : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick, busy: (d) => Object.keys(d.phys).some((k) => Math.abs(d.phys[k] - d.v[k]) > 0.01) || !!d.sim.people,
    protoPanel, bindProto,
  };
})();
