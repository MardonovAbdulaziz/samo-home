/* ==========================================================================
   Temperature & humidity sensor — device interface
   Source: "Device Interface 3 / 4. Temp_Humidity_Sensor_Interface.html"
   (features from zigbee2mqtt, 232 temperature & humidity sensors)
   Rule: show a value or setting only if the paired sensor has it.
   Look: Figma "Relay — Device Interface" (6014:56) — same banners, info cards, lists and sheets.

   The app only knows what the sensor REPORTED (d.st). The real room (d.room) lives in the prototype
   panel: battery sensors measure every N seconds and report only real changes, so the app's number can
   lag behind the room. The 24-hour chart and min / max are built by our server from the reports (Log).
   ========================================================================== */
Devices.climate = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    temperature: { name: 'Temperature', grp: 'Device page', type: 'reading', short: 'The room temperature — the last value the sensor reported' },
    humidity: { name: 'Humidity', grp: 'Device page', type: 'reading', short: 'Relative humidity. Healthy indoor air is about 40–60 %' },
    pressure: { name: 'Air pressure', grp: 'Device page', type: 'reading', short: 'A falling pressure often means bad weather' },
    extras: { name: 'Dew point & VPD', grp: 'Device page', type: 'reading', short: 'Calculated values: when windows sweat, and air dryness for plants' },
    probe: { name: 'External probe', grp: 'Device page', type: 'reading', short: 'A second temperature on a cable — inside a fridge, an aquarium or a floor' },
    battery: { name: 'Battery', grp: 'Device page', type: 'reading', short: 'Coin cell or AAA, usually 1–2 years' },

    calibration: { name: 'Correction', grp: 'Sensor', def: { t: 0, h: 0 },
      short: 'If it reads a little high or low next to a trusted thermometer, correct it here',
      fields: [{ id: 't', label: 'Temperature', unit: '°C', min: -5, max: 5, step: 0.1, signed: true }, { id: 'h', label: 'Humidity', unit: '%', min: -15, max: 15, step: 1, signed: true, hum: true }],
      foot: 'Added to every reading. Typical: ±0.5 °C, ±3 %.' },
    reporting: { name: 'How often it reports', grp: 'Sensor', def: { interval: 30, tstep: 0.5, hstep: 2 },
      short: 'It measures every few seconds and reports only real changes — saves the battery',
      fields: [{ id: 'interval', label: 'Measure every', unit: 's', min: 3, max: 600, steps: [3, 5, 10, 15, 20, 30, 60, 120, 300, 600] },
        { id: 'tstep', label: 'Report a temperature change of', unit: '°C', min: 0.1, max: 5, step: 0.1 },
        { id: 'hstep', label: 'Report a humidity change of', unit: '%', min: 1, max: 20, step: 1, hum: true }],
      foot: 'Smaller steps and shorter times keep the app more up to date but empty the battery sooner.' },
    alarmLimits: { name: 'Built-in limit alarm', grp: 'Sensor', def: { on: true, tlow: 16, thigh: 30, hlow: 25, hhigh: 70 },
      short: 'The sensor checks its own limits and reports an alarm (some also beep or flash)',
      fields: [{ id: 'on', kind: 'tog', label: 'Sensor alarm' },
        { id: 'tlow', label: 'Below', unit: '°C', min: -40, max: 60, step: 1, pair: 'thigh', grp: 'Temperature' }, { id: 'thigh', label: 'Above', unit: '°C', min: -40, max: 60, step: 1, pair: 'tlow', grp: 'Temperature' },
        { id: 'hlow', label: 'Below', unit: '%', min: 0, max: 100, step: 1, pair: 'hhigh', grp: 'Humidity', hum: true }, { id: 'hhigh', label: 'Above', unit: '%', min: 0, max: 100, step: 1, pair: 'hlow', grp: 'Humidity', hum: true }],
      foot: 'The limits are stored in the sensor. A push message about it is a separate setting in Notifications.' },
    control: { name: 'Switch a heater directly', grp: 'Sensor', def: { on: false, mode: 'HEAT', low: 20, high: 22 },
      short: 'The sensor switches a bound relay itself — a simple thermostat that works without the hub',
      fields: [{ id: 'on', kind: 'tog', label: 'Control the bound relay' },
        { id: 'mode', kind: 'sel', label: 'Mode', opts: [['HEAT', 'Heat', 'Relay on when it gets cold'], ['COOL', 'Cool', 'Relay on when it gets hot']] },
        { id: 'low', label: 'On below', unit: '°C', min: -40, max: 90, step: 0.5, pair: 'high' }, { id: 'high', label: 'Off above', unit: '°C', min: -40, max: 90, step: 0.5, pair: 'low' }],
      foot: 'Scenes usually do this; the built-in version keeps working when the hub is offline.' },

    display: { name: 'Screen', grp: 'Screen', def: { unit: 'celsius', on: true },
      short: 'Only the sensor’s own screen — the app keeps your unit',
      fields: [{ id: 'on', kind: 'tog', label: 'Screen on' }, { id: 'unit', kind: 'sel', label: 'Unit on the screen', opts: [['celsius', '°C', ''], ['fahrenheit', '°F', '']] }],
      foot: 'Turning the screen off saves battery.' },
    comfort: { name: 'Smiley on the screen', grp: 'Screen', def: { smile: true, tmin: 20, tmax: 25, hmin: 40, hmax: 60 },
      short: 'The sensor shows 🙂 inside this range and 😟 outside it, on its own screen',
      fields: [{ id: 'smile', kind: 'tog', label: 'Show the smiley' },
        { id: 'tmin', label: 'From', unit: '°C', min: -20, max: 40, step: 1, pair: 'tmax', grp: 'Comfortable temperature' }, { id: 'tmax', label: 'To', unit: '°C', min: -20, max: 40, step: 1, pair: 'tmin', grp: 'Comfortable temperature' },
        { id: 'hmin', label: 'From', unit: '%', min: 0, max: 100, step: 1, pair: 'hmax', grp: 'Comfortable humidity', hum: true }, { id: 'hmax', label: 'To', unit: '%', min: 0, max: 100, step: 1, pair: 'hmin', grp: 'Comfortable humidity', hum: true }],
      foot: 'The sensor does not tell the app whether it is comfortable — this only changes its screen.' },

    alerts: { name: 'Too hot / cold / humid', grp: 'Notifications', app: true, def: { on: true, tlow: 16, thigh: 30, hlow: 25, hhigh: 70 },
      short: 'A push message when it gets too cold, too hot or too humid',
      fields: [{ id: 'on', kind: 'tog', label: 'Notify outside these limits' },
        { id: 'tlow', label: 'Colder than', unit: '°C', min: -40, max: 60, step: 1, pair: 'thigh', grp: 'Temperature' }, { id: 'thigh', label: 'Hotter than', unit: '°C', min: -40, max: 60, step: 1, pair: 'tlow', grp: 'Temperature' },
        { id: 'hlow', label: 'Drier than', unit: '%', min: 0, max: 100, step: 1, pair: 'hhigh', grp: 'Humidity', hum: true }, { id: 'hhigh', label: 'More humid than', unit: '%', min: 0, max: 100, step: 1, pair: 'hlow', grp: 'Humidity', hum: true }],
      foot: 'Our server checks every report against these limits — works for every sensor.' },
    history: { name: 'Temperature history', grp: 'Log', app: true, short: 'The 24-hour chart and today’s warmest / coldest, built by our server' },

    identify: { name: 'Find this device', grp: 'Device', short: 'Blinks the sensor' },
  };
  const ALL_GROUPS = ['Device page', 'Sensor', 'Screen', 'Notifications', 'Log', 'Device'];

  const PRESETS = [
    { id: 'aqara', name: 'Aqara temperature & humidity sensor', model: 'WSDCGQ11LM', manufacturer: 'Aqara', feats: ['temperature', 'humidity', 'pressure', 'battery', 'alerts', 'history'] },
    { id: 'sonoffd', name: 'SONOFF sensor with screen', model: 'SNZB-02D', manufacturer: 'SONOFF', feats: ['temperature', 'humidity', 'battery', 'comfort', 'alerts', 'history', 'calibration', 'display'] },
    { id: 'sonoffp', name: 'SONOFF sensor (no screen)', model: 'SNZB-02P', manufacturer: 'SONOFF', feats: ['temperature', 'humidity', 'battery', 'alerts', 'history', 'calibration'] },
    { id: 'tuya', name: 'Tuya sensor with display', model: 'TS0201', manufacturer: 'Tuya', feats: ['temperature', 'humidity', 'battery', 'alerts', 'history', 'calibration', 'display'] },
    { id: 'tuyaal', name: 'Tuya sensor with built-in alarms', model: 'TH05Z', manufacturer: 'Tuya', feats: ['temperature', 'humidity', 'battery', 'alarmLimits', 'alerts', 'history', 'reporting', 'display'] },
    { id: 'lywsd', name: 'Xiaomi LYWSD03MMC (custom firmware)', model: 'LYWSD03MMC-z', manufacturer: 'Xiaomi', feats: ['temperature', 'humidity', 'battery', 'comfort', 'alerts', 'history', 'calibration', 'display', 'reporting'] },
    { id: 'probe', name: 'Sensor with external probe', model: 'EZ-500FL', manufacturer: 'Excellux', feats: ['temperature', 'humidity', 'probe', 'battery', 'alarmLimits', 'alerts', 'history', 'calibration', 'reporting'], probeName: 'Fridge' },
    { id: 'efekta', name: 'EFEKTA DIY sensor', model: 'EFEKTA_eTH102z', manufacturer: 'EFEKTA', feats: ['temperature', 'humidity', 'battery', 'alerts', 'history', 'reporting', 'control', 'identify'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F), probeName: 'Fridge' },
  ];

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x);
  const has = (d, k) => d.features.includes(k);
  const S = (d, k) => d.settings[k];
  const cal = (d) => (has(d, 'calibration') ? S(d, 'calibration') : { t: 0, h: 0 });
  const rep = (d) => (has(d, 'reporting') ? S(d, 'reporting') : { interval: 10, tstep: 0.5, hstep: 2 });   // without the setting: a typical sensor
  const HEARTBEAT = 600000;   // a sensor reports at least every 10 min even when nothing changes
  const r1 = (v) => Math.round(v * 10) / 10;
  const fmtT = (v) => r1(v).toFixed(1);
  const fmtH = (v) => String(Math.round(v));
  const W = (d) => d.name;
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;

  function applyDefaults(d) {
    for (const k in F) { const def = F[k].def; if (def !== undefined && d.settings[k] === undefined) d.settings[k] = clone(def); }
    if (!d.probeName) d.probeName = 'Probe';
  }

  /** 24 hours of reports, as our server would have stored them: coldest near 06:00, warmest mid-afternoon. */
  function seedHistory(now = Date.now()) {
    const pts = [];
    for (let i = 48; i >= 1; i--) {
      const t = now - i * 1800000, hr = new Date(t).getHours() + new Date(t).getMinutes() / 60;
      const c = Math.cos(((hr - 14.5) / 24) * 2 * Math.PI), n = Math.sin(i * 1.7) * 0.15;
      pts.push({ t, temp: r1(21.85 + 2.25 * c + n), hum: Math.round(46 - 5 * c + Math.sin(i) * 1.5), p: Math.round(1012 + Math.sin(i / 6) * 0.8) });   // a steady day
    }
    return pts;
  }

  function create(presetId, { name, roomId } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const now = Date.now();
    const d = {
      id: Store.uid('d'), type: 'climate', preset: p.id, name: name || 'Temperature sensor', roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'TH', mac: Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '1.0.0_0012', online: true, showOnHome: true, isNew: true, createdAt: now,
      features: p.feats.slice(), settings: {}, probeName: p.probeName || 'Probe',
      // the real room (prototype panel)
      room: { t: 23.4, h: 46, p: 1012, probe: 4.2, heater: false, ac: false, steam: false, win: false },
      // what the app knows (last report)
      st: { t: 23.4, h: 46, p: 1012, probe: 4.2, at: now - 120000, lastSeen: now - 120000, measuredAt: now, relay: false, alarm: '', alert: '' },
      battery: 81, hist: seedHistory(now), log: [], blinkAt: 0,
    };
    applyDefaults(d);
    return d;
  }

  /* ---------- Behaviour ---------- */
  function logEv(d, k, text) { d.log.unshift({ t: Date.now(), k, text }); d.log.length = Math.min(d.log.length, 60); }
  function notifyPush(d, title, body = '', tone = '') {
    Store.state.notifications = (Store.state.notifications || 0) + 1;
    UI.push({ title, body, tone });
  }
  /** Outside a set of limits? → { k: 'cold' | 'hot' | 'dry' | 'humid', text } or null (temperature first) */
  function outside(d, v, t, h) {
    if (t < v.tlow) return { k: 'cold', text: `Too cold · ${fmtT(t)} °C` };
    if (t > v.thigh) return { k: 'hot', text: `Too hot · ${fmtT(t)} °C` };
    if (has(d, 'humidity') && h > v.hhigh) return { k: 'humid', text: `Too humid · ${fmtH(h)} %` };
    if (has(d, 'humidity') && h < v.hlow) return { k: 'dry', text: `Too dry · ${fmtH(h)} %` };
    return null;
  }

  /** The sensor measured (corrected value) and decided to report. */
  function report(d, now = Date.now()) {
    const c = cal(d), R = d.room, st = d.st;
    st.t = r1(R.t + c.t); st.h = Math.max(0, Math.min(100, Math.round(R.h + c.h))); st.p = Math.round(R.p); st.probe = r1(R.probe);
    st.at = now; st.lastSeen = now; d.blinkAt = now;
    // server history: one point per minute is enough for a 24-hour chart
    const last = d.hist[d.hist.length - 1], pt = { t: now, temp: st.t, hum: st.h, p: st.p };
    if (last && now - last.t < 60000) Object.assign(last, pt); else d.hist.push(pt);
    while (d.hist.length && d.hist[0].t < now - 26 * 3600000) d.hist.shift();
    // the sensor's own limit alarm (device): it reports lower / upper alarm
    if (has(d, 'alarmLimits') && S(d, 'alarmLimits').on) {
      const o = outside(d, S(d, 'alarmLimits'), st.t, st.h), k = o ? o.k : '';
      if (k && k !== st.alarm) logEv(d, 'alarm', 'Sensor alarm: ' + o.text);
      st.alarm = k; st.alarmText = o ? o.text : '';
    } else { st.alarm = ''; st.alarmText = ''; }
    // our server's notification limits (app): a push message once per crossing
    if (has(d, 'alerts') && S(d, 'alerts').on) {
      const o = outside(d, S(d, 'alerts'), st.t, st.h), k = o ? o.k : '';
      if (k && k !== st.alert) { logEv(d, 'alert', o.text); notifyPush(d, `${W(d)}: ${o.text.split(' · ')[0].toLowerCase()}`, o.text.split(' · ')[1], k === 'humid' || k === 'dry' ? 'warn' : 'danger'); }
      st.alert = k;
    } else st.alert = '';
  }

  /** The room drifts toward what the heater / AC / shower / open window make of it. */
  function roomTarget(d) {
    const R = d.room; let t = 21.5, h = 45;
    if (R.heater || (d.st.relay && S(d, 'control').mode === 'HEAT')) t += 8;
    if (R.ac || (d.st.relay && S(d, 'control').mode === 'COOL')) t -= 6;
    if (R.win) { t -= 9; h -= 12; }
    if (R.steam) { h += 35; t += 1.5; }
    return { t, h };
  }

  function tick(d) {
    const now = Date.now(), R = d.room, st = d.st;
    const g = roomTarget(d);
    R.t += (g.t - R.t) * 0.06; R.h += (g.h - R.h) * 0.08;
    R.probe += ((R.win ? 2.5 : 4.2) - R.probe) * 0.05;
    R.p += Math.sin(now / 900000) * 0.002;
    if (!d.online) return false;
    let changed = false;
    // built-in control (device side): the sensor switches its bound relay on its own reading
    if (has(d, 'control') && S(d, 'control').on) {
      const v = S(d, 'control'), m = R.t + cal(d).t, heat = v.mode === 'HEAT';
      const want = heat ? (m < v.low ? true : m > v.high ? false : st.relay) : (m > v.high ? true : m < v.low ? false : st.relay);
      if (want !== st.relay) { st.relay = want; logEv(d, 'relay', `Bound relay ${want ? 'on' : 'off'} · ${fmtT(m)} °C`); changed = true; }
    } else if (st.relay) { st.relay = false; changed = true; }
    // the sensor measures every N s and reports only a big enough change (or the 10-min heartbeat)
    const r = rep(d);
    if (now - st.measuredAt >= r.interval * 1000) {
      st.measuredAt = now;
      const c = cal(d), dt = Math.abs(R.t + c.t - st.t), dh = Math.abs(R.h + c.h - st.h);
      if (dt >= r.tstep - 1e-9 || (has(d, 'humidity') && dh >= r.hstep) || now - st.at >= HEARTBEAT) { report(d, now); changed = true; }
    }
    return changed;
  }

  /* ---------- Derived values ---------- */
  function dew(t, h) { const a = 17.27, b = 237.7, g = (a * t) / (b + t) + Math.log(Math.max(1, h) / 100); return (b * g) / (a - g); }
  function vpd(t, h) { const svp = 0.6108 * Math.exp((17.27 * t) / (t + 237.3)); return svp * (1 - h / 100); }
  function trend(d) {
    const ago = d.hist.find((x) => x.t >= Date.now() - 3 * 3600000);
    if (!ago || ago.p == null) return 'steady';
    const dp = d.st.p - ago.p; return dp >= 2 ? 'rising' : dp <= -2 ? 'falling' : 'steady';
  }
  function agoText(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 10) return 'just now';
    if (s < 60) return `${s} s ago`;
    const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
    return `${Math.floor(m / 60)} h ago`;
  }
  const reportedText = (d) => (d.online ? `Reported ${agoText(Date.now() - d.st.at)}` : `Offline · last report ${agoText(Date.now() - d.st.lastSeen)}`);
  const startOfDay = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };
  /** Today's extremes from the server history (falls back to the last 24 h right after midnight). */
  function extremes(d, key) {
    let pts = d.hist.filter((x) => x.t >= startOfDay());
    if (pts.length < 2) pts = d.hist.slice(-48);
    let lo = pts[0], hi = pts[0];
    pts.forEach((x) => { if (x[key] < lo[key]) lo = x; if (x[key] > hi[key]) hi = x; });
    return { lo, hi };
  }

  /* ---------- Home tile ---------- */
  function tileText(d) {
    if (!d.online) return { text: 'Offline' };
    const s = `${fmtT(d.st.t)} °C${has(d, 'humidity') ? ` · ${fmtH(d.st.h)} %` : ''}`;
    if (d.st.alarm) return { text: s, tone: 'danger' };
    return { text: s };
  }
  function homeTiles(d) {
    const s = tileText(d);
    return [{ ch: 0, name: d.name, icon: 'dev-temperature', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }];
  }

  /* ==========================================================================
     Device page
     ========================================================================== */
  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += `<div class="pad cw-gap" data-key="ban-off"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · No report for ${agoText(Date.now() - st.lastSeen).replace(' ago', '')}. Check the battery.</div></div></div>`;
    if (d.online && st.alarm) h += `<div class="pad cw-gap" data-key="ban-alarm"><div class="banner danger">${icon('banner-error')}<div><b>Sensor alarm</b> · ${esc(st.alarmText)}</div></div></div>`;
    if (battLow(d)) h += `<div class="pad cw-gap" data-key="ban-batt"><div class="banner warn">${icon('battery')}<div><b>Battery low · ${d.battery} %</b></div></div></div>`;

    // The two readings are the page (spec: last REPORTED values + when)
    h += `<div class="th-hero ${d.online ? '' : 'is-off'}" data-key="hero">
        <div class="th-val"><div class="th-num"><span data-num data-live="t">${fmtT(st.t)}</span><small>°C</small></div><div class="th-cap">${icon('temperature')}Temperature</div></div>
        ${has(d, 'humidity') ? `<i class="th-sep"></i><div class="th-val"><div class="th-num"><span data-num data-live="h">${fmtH(st.h)}</span><small>%</small></div><div class="th-cap">${icon('dev-drop')}Humidity</div></div>` : ''}
      </div>
      <div class="th-rep" data-num data-live="rep">${reportedText(d)}</div>`;

    const cards = [];
    if (has(d, 'pressure')) cards.push(`<div class="info-card"><span>Pressure · ${trend(d)}</span><b data-num="count">${st.p} hPa</b></div>`);
    if (has(d, 'extras')) {
      cards.push(`<div class="info-card"><span>Dew point</span><b data-num="count">${fmtT(dew(st.t, st.h))} °C</b></div>`);
      cards.push(`<div class="info-card"><span>VPD</span><b data-num="count">${vpd(st.t, st.h).toFixed(2)} kPa</b></div>`);
    }
    if (has(d, 'probe')) cards.push(`<div class="info-card"><span>${esc(d.probeName)} probe</span><b data-num="count">${fmtT(st.probe)} °C</b></div>`);
    if (cards.length % 2) cards[cards.length - 1] = cards[cards.length - 1].replace('class="info-card"', 'class="info-card wide"');   // small cards in pairs
    if (has(d, 'control') && S(d, 'control').on) {
      const v = S(d, 'control');
      cards.push(`<div class="info-card wide"><span>Bound relay · ${v.mode === 'HEAT' ? 'heats' : 'cools'} ${v.low}–${v.high} °C</span><b>${st.relay ? 'On' : 'Off'}</b>${icon('bolt')}</div>`);
    }
    if (has(d, 'battery')) cards.push(`<div class="info-card wide"><span>${battLow(d) ? 'Battery · replace it soon' : 'Battery'}</span><b data-num="count">${d.battery} %</b>${icon('battery')}</div>`);
    if (cards.length) h += `<div class="pad info-grid" data-key="info" style="margin-top:32px">${cards.join('')}</div>`;
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="rep"]'), reportedText(d)); }
  function bindPage() {}

  /* ==========================================================================
     Settings
     ========================================================================== */
  const signed = (v, dec) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(dec);
  const dec = (f) => (f.step && f.step < 1 ? (f.step < 0.5 ? 1 : 1) : 0);
  const fv = (f, v) => (f.signed ? signed(v, dec(f)) : (+v).toFixed(dec(f)));
  function summary(d, k) {
    const v = S(d, k), hum = has(d, 'humidity');
    switch (k) {
      case 'calibration': return !v.t && !v.h ? 'None' : `${signed(v.t, 1)} °C${hum ? ` · ${signed(v.h, 0)} %` : ''}`;
      case 'reporting': return `Every ${v.interval < 60 ? v.interval + ' s' : v.interval / 60 + ' min'} · ±${v.tstep} °C`;
      case 'alarmLimits': case 'alerts': return v.on ? `${v.tlow}–${v.thigh} °C${hum ? ` · ${v.hlow}–${v.hhigh} %` : ''}` : 'Off';
      case 'control': return v.on ? `${v.mode === 'HEAT' ? 'Heat' : 'Cool'} · ${v.low}–${v.high} °C` : 'Off';
      case 'display': return v.on ? (v.unit === 'celsius' ? '°C' : '°F') : 'Off';
      case 'comfort': return v.smile ? `${v.tmin}–${v.tmax} °C` : 'Off';
      default: return '';
    }
  }
  const row = (k, title, value, act = 'th-feature') => `<button class="cell" data-action="${act}" data-k="${k}">
      <span class="cell-main cell-title">${esc(title)}</span>${value ? `<span class="cell-value">${esc(value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;

  function settings(d) {
    let h = '';
    const list = (grp) => Object.keys(F).filter((k) => F[k].grp === grp && F[k].fields && has(d, k));
    const sensor = list('Sensor').map((k) => row(k, F[k].name, summary(d, k)));
    if (has(d, 'probe')) sensor.push(row('probeName', 'Probe name', d.probeName, 'th-probe'));
    if (sensor.length) h += `<div class="list-header">Sensor</div><div class="list">${sensor.join('')}</div>`;
    const screen = list('Screen');
    if (screen.length) h += `<div class="list-header">Screen</div><div class="list">${screen.map((k) => row(k, F[k].name, summary(d, k))).join('')}</div>`;
    if (has(d, 'alerts')) h += `<div class="list-header">Notifications</div><div class="list">${row('alerts', F.alerts.name, summary(d, 'alerts'))}</div><div class="list-footer">Battery low and offline messages are always on.</div>`;
    return h;
  }

  const stepper = (k, f, v) => `<div class="stepper"><button data-action="th-step" data-f="${f.id}" data-d="-1" aria-label="Less" ${v <= f.min ? 'disabled' : ''}>−</button><output data-num>${fv(f, v)} ${f.unit}</output><button data-action="th-step" data-f="${f.id}" data-d="1" aria-label="More" ${v >= f.max ? 'disabled' : ''}>+</button></div>`;
  const radio = (f, cur) => f.opts.map((o) => `<button class="option" role="radio" aria-checked="${cur === o[0]}" data-action="th-sel" data-f="${f.id}" data-v="${o[0]}">
      <span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('');

  /** One sheet for every setting: a switch (when it has one), choices, and steppers in small groups. */
  function openFeature(d, k, ctx) {
    const f = F[k];
    const fields = f.fields.filter((x) => !x.hum || has(d, 'humidity'));
    const tog = fields.find((x) => x.kind === 'tog');
    const s = UI.sheet({
      title: f.name, sub: esc(f.short),
      render: () => {
        const v = S(d, k);
        let body = '', grp = null, open = '';
        const flush = () => { if (open) { body += UI.group(grp || '', open); open = ''; } };
        fields.filter((x) => x !== tog).forEach((x) => {
          if (x.kind === 'sel') { flush(); grp = null; body += UI.group(x.label, radio(x, v[x.id])); return; }
          if ((x.grp || '') !== (grp || '')) { flush(); grp = x.grp || ''; }
          open += `<div class="cell"><span class="cell-main cell-title">${esc(x.label)}</span>${stepper(k, x, v[x.id])}</div>`;
        });
        flush();
        const top = tog ? `<div class="list"><button class="cell" data-action="th-tog"><span class="cell-main cell-title">${esc(tog.label)}</span><span class="switch" role="switch" aria-checked="${!!v[tog.id]}"></span></button></div>` : '';
        return top + (tog ? UI.collapse(!!v[tog.id], body) : body) + (f.foot ? `<div class="list-footer">${esc(f.foot)}</div>` : '');
      },
      footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>',
    });
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    UI.on({
      'th-tog': () => { const v = S(d, k); v[tog.id] = !v[tog.id]; commit(); },
      'th-sel': ({ f: id, v: val }) => { S(d, k)[id] = val; commit(); },
      'th-step': ({ f: id, d: dir }) => {
        const x = fields.find((y) => y.id === id), v = S(d, k);
        let n;
        if (x.steps) { const i = x.steps.findIndex((y) => y >= v[id]); n = x.steps[Math.max(0, Math.min(x.steps.length - 1, (i < 0 ? x.steps.length - 1 : i) + +dir))]; }
        else n = Math.round((v[id] + x.step * dir) * 10) / 10;
        n = Math.max(x.min, Math.min(x.max, n));
        // a "from" stays below its "to" (and the other way round)
        if (x.pair) { const lowSide = /low|min/.test(id); const o = v[x.pair], gap = x.step || 1; if (lowSide && n > o - gap) return UI.toast(`Keep it below ${o} ${x.unit}`); if (!lowSide && n < o + gap) return UI.toast(`Keep it above ${o} ${x.unit}`); }
        v[id] = n;
        if (k === 'calibration') report(d);   // the correction shows on the next reading — here, at once
        commit();
      },
    });
  }

  /* ---------- History (Settings → Event History): built by our server from the reports ---------- */
  const SERIES = { temp: { label: 'Temperature', unit: '°C', fmt: fmtT, hi: 'Warmest', lo: 'Coldest' }, hum: { label: 'Humidity', unit: '%', fmt: fmtH, hi: 'Most humid', lo: 'Driest' }, p: { label: 'Pressure', unit: 'hPa', fmt: (v) => String(Math.round(v)), hi: 'Highest', lo: 'Lowest' } };
  function chart(d, key) {
    const now = Date.now(), t0 = now - 24 * 3600000;
    const pts = d.hist.filter((x) => x.t >= t0 && x[key] != null);
    if (pts.length < 2) return '<div class="cell"><span class="cell-main cell-sub">Not enough reports yet</span></div>';
    const W2 = 320, H = 120, P = 10;
    let lo = Math.min(...pts.map((x) => x[key])), hi = Math.max(...pts.map((x) => x[key]));
    if (hi - lo < 2) { const m = (hi + lo) / 2; lo = m - 1; hi = m + 1; }
    const X = (t) => ((t - t0) / (now - t0)) * W2, Y = (v) => P + (1 - (v - lo) / (hi - lo)) * (H - 2 * P);
    const line = pts.map((x, i) => `${i ? 'L' : 'M'}${X(x.t).toFixed(1)} ${Y(x[key]).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const hours = [24, 18, 12, 6].map((a) => { const t = new Date(now - a * 3600000); return String(t.getHours()).padStart(2, '0') + ':00'; });
    return `<div class="th-chart"><div class="th-plot"><svg viewBox="0 0 ${W2} ${H}" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="thg-${key}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)" stop-opacity=".35"/><stop offset="1" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>
        <path d="${line} L${W2} ${H} L0 ${H} Z" fill="url(#thg-${key})"/><path d="${line}" fill="none" stroke="var(--primary)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      </svg><i class="th-dot" style="left:${(X(last.t) / W2) * 100}%;top:${(Y(last[key]) / H) * 100}%"></i></div>
      <div class="th-axis"><span>${hours.join('</span><span>')}</span><span>Now</span></div></div>`;
  }
  const EVT = { alarm: 'banner-error', alert: 'bell', relay: 'bolt', battery: 'battery', offline: 'bolt-crossed' };
  function openHistory(d) {
    const keys = ['temp'].concat(has(d, 'humidity') ? ['hum'] : [], has(d, 'pressure') ? ['p'] : []);
    let cur = 'temp';
    const s = UI.sheet({
      title: 'Event History', sub: 'Last 24 hours · built by our server from the sensor’s reports',
      tabs: keys.length > 1 ? () => `<div class="segmented" role="tablist">${keys.map((x, i) => `<button role="tab" class="${x === cur ? 'on' : ''}" aria-selected="${x === cur}" data-action="th-ser" data-ch="${i}">${SERIES[x].label}</button>`).join('')}</div>` : null,
      render: () => {
        const sr = SERIES[cur], ex = extremes(d, cur);
        const stat = (label, x) => `<div class="cell"><span class="cell-main cell-title">${label}</span><span class="cell-value">${sr.fmt(x[cur])} ${sr.unit} · ${UI.fmtTime(x.t)}</span></div>`;
        const day = startOfDay();
        const rows = d.log.slice(0, 20).map((e) => `<div class="cell has-icon"><span class="cell-icon">${icon(EVT[e.k] || 'round-info')}</span><span class="cell-main cell-title">${esc(e.text)}</span><span class="cell-value">${e.t >= day ? UI.fmtTime(e.t) : 'Yesterday ' + UI.fmtTime(e.t)}</span></div>`).join('');
        return `<div class="pad">${chart(d, cur)}</div>` + UI.group('Today', stat(sr.hi, ex.hi) + stat(sr.lo, ex.lo))
          + UI.group('Events', rows || '<div class="cell"><span class="cell-main cell-sub">No alarms or alerts today</span></div>')
          + '<div class="list-footer">The sensor only sends its current value. Our server keeps every report and draws this chart.</div>';
      },
      footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>',
    });
    UI.on({ 'th-ser': ({ ch }) => { cur = keys[+ch]; s.refresh(); } });
  }

  function bindSettings(d, ctx) {
    UI.on({
      'th-feature': ({ k }) => openFeature(d, k, ctx),
      'th-probe': () => UI.prompt({ title: 'Probe name', label: 'Where the probe is', value: d.probeName, onOk: (v) => { d.probeName = v; Store.save(); ctx.render(); } }),
      'rs-history': () => openHistory(d),
      'rs-identify': () => {
        if (!d.online) return UI.toast('The sensor is offline');
        d.blinkAt = Date.now(); Store.save();
        UI.toast('The sensor blinks. Asleep? Press its button first');
      },
    });
  }

  function about(d) {
    const r = rep(d), rows = [['Last report', d.online ? agoText(Date.now() - d.st.at) : UI.fmtTime(d.st.lastSeen)],
      ['Reported values', `${fmtT(d.st.t)} °C${has(d, 'humidity') ? ` · ${fmtH(d.st.h)} %` : ''}`]];
    if (has(d, 'reporting')) rows.push(['Measures every', `${r.interval} s`]);
    if (has(d, 'battery')) rows.push(['Battery', `${d.battery} % · ${(2.6 + d.battery / 250).toFixed(2)} V`]);
    return rows;
  }

  /* ==========================================================================
     Prototype panel — the real room
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    const R = d.room, c = cal(d);
    const chip = (k, label) => `<button class="pp-btn" data-action="pp-room" data-k="${k}" aria-pressed="${!!R[k]}">${label}${R[k] ? ' · on' : ''}</button>`;
    return `<div class="pp-title">Temperature sensor prototype</div>
      <p class="pp-note">Not part of the app. Change what this sensor supports and play the room. Spec: <a href="../Device%20Interface%203/4.%20Temp_Humidity_Sensor_Interface.html" target="_blank">Temp_Humidity_Sensor_Interface</a></p>
      <h3>Real sensor</h3>
      <select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      <h3>The room · <span style="font-weight:400" data-pp-live>${fmtT(R.t + c.t)} °C · ${fmtH(R.h + c.h)} % now</span></h3>
      <p class="pp-note" style="margin-top:0">The app shows the last report: ${fmtT(d.st.t)} °C. It changes when the sensor reports.</p>
      <div class="pp-row">${chip('heater', '🔥 Heater')}${chip('ac', '❄️ Air conditioner')}</div>
      <div class="pp-row">${chip('steam', '🚿 Hot shower')}${chip('win', '🪟 Window open (winter)')}</div>
      <h3>The sensor</h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-button">🔘 Press its button (reports now)</button></div>
      <div class="pp-row">${has(d, 'battery') ? `<button class="pp-btn" data-action="pp-batt">🔋 ${battLow(d) ? 'New battery' : 'Battery low'}</button>` : ''}
        <button class="pp-btn" data-action="pp-online">${d.online ? '📴 Stops reporting' : '📶 Reports again'}</button></div>
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
        Object.assign(d, { preset: p.id, model: p.model, manufacturer: p.manufacturer, originalName: p.name, features: p.feats.slice(), settings: {}, probeName: p.probeName || 'Probe' });
        applyDefaults(d); report(d);
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); applyDefaults(d); }
      commit();
    };
    UI.on({
      'pp-room': ({ k }) => {
        const R = d.room; R[k] = !R[k];
        if (k === 'heater' && R.heater) R.ac = false;
        if (k === 'ac' && R.ac) R.heater = false;
        commit({ heater: R.heater ? 'Heater on — the room warms; the app follows when the sensor reports' : 'Heater off', ac: R.ac ? 'AC on — the room cools down' : 'AC off',
          steam: R.steam ? 'Hot shower — humidity shoots up' : 'Shower off', win: R.win ? 'Window open in winter — cold, dry air comes in' : 'Window closed' }[k]);
      },
      'pp-button': () => { if (!d.online) return commit('The sensor is offline'); report(d); commit('The button wakes the sensor — it reports now'); },
      'pp-batt': () => {
        d.battery = battLow(d) ? 100 : 14;
        if (battLow(d)) { logEv(d, 'battery', `Battery low · ${d.battery} %`); notifyPush(d, 'Battery low', `${W(d)} sensor · ${d.battery} %`, 'warn'); }
        commit();
      },
      'pp-online': () => {
        d.online = !d.online;
        if (!d.online) { logEv(d, 'offline', 'Stopped reporting'); return commit(); }
        report(d); commit();
      },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Temperature sensor', F, PRESETS, create, applyDefaults,
    icon: () => 'dev-temperature',
    describe: (p) => `${p.manufacturer} · temperature & humidity sensor`,
    historyValue: (d) => { if (!has(d, 'history')) return null; const e = extremes(d, 'temp'); return `${fmtT(e.lo.temp)}–${fmtT(e.hi.temp)} °C`; },
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick,
    busy: () => false,
    protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
    chipText: (d) => (d.online ? `${fmtT(d.st.t)}°` : 'Offline'),
    _report: report,   // used by tools/checks
  };
})();
