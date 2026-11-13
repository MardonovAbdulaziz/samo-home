/* ==========================================================================
   Contact sensor (door / window) device interface
   Source: "Device Interface 3 / 3. Contact_Sensor_Interface.html"
   (features from zigbee2mqtt, 157 door / window contact sensors)
   Rule: show a value or setting only if the paired sensor has it.
   Look: Figma "Relay — Device Interface" (6014:56) — same banners, cards, lists and sheets as relay / curtain.

   What the app knows is only what the sensor REPORTED (d.st). The real door (d.phys) lives in the
   prototype panel: with a report delay the door can be open while the app still says "Closed".
   ========================================================================== */
Devices.contact = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    contact: { name: 'Open / closed', grp: 'Device page', type: 'reading', short: 'Whether the door or window is open, and since when' },
    tamper: { name: 'Tamper', grp: 'Device page', type: 'alert', short: 'Reports when its cover is opened or it is pulled off the wall' },
    battery: { name: 'Battery', grp: 'Device page', type: 'reading', short: 'Coin cell, usually lasts 1–2 years' },
    climate: { name: 'Temperature & humidity', grp: 'Device page', type: 'reading', short: 'Some contact sensors also measure the air' },
    light: { name: 'Light level', grp: 'Device page', type: 'reading', short: 'A few sensors also measure light' },

    delay: { name: 'Report delay', grp: 'Sensor', type: 'choice', def: 0,
      opts: [[0, 'No delay', 'Every opening is reported at once'], [3, '3 s', 'Hides a door that bounces'], [10, '10 s', 'Hides wind and pets'], [30, '30 s', ''], [60, '1 min', '']],
      short: 'Reports “open” only if it stays open for a while — fewer false reports' },
    breakFn: { name: 'Airing break', grp: 'Sensor', type: 'break', def: { on: true, min: 5 },
      short: 'Press the button on the sensor to air the room — no alert while the break lasts' },
    vibration: { name: 'Knock detection', grp: 'Sensor', type: 'knock', def: { on: true, sens: 'medium' },
      opts: [['low', 'Low', ''], ['medium', 'Medium', 'Recommended'], ['high', 'High', ''], ['very_high', 'Very high', 'Passing trucks may set it off']],
      short: 'Feels a knock or a blow on the glass before the window opens' },
    distance: { name: 'Magnet distance', grp: 'Sensor', type: 'choice', def: '20mm',
      opts: [['10mm', '10 mm', 'Notices a door that is only slightly open'], ['20mm', '20 mm', 'Recommended'], ['30mm', '30 mm', 'For uneven doors and wide gaps']],
      short: 'How far the magnet may be and still count as closed' },
    windowType: { name: 'Window type', grp: 'Sensor', type: 'choice', def: 'casement_window',
      opts: [['casement_window', 'Casement', 'Opens sideways'], ['hopper_window', 'Hopper', 'Tilts in at the top'], ['composite_window', 'Tilt-and-turn', 'Can be tilted or fully open'], ['hinged_door', 'Hinged door', '']],
      short: 'How it opens — the sensor then tells tilted from open' },
    counter: { name: 'Operating mode', grp: 'Sensor', type: 'mode', def: 'contact',
      opts: [['contact', 'Door / window', 'Open or closed'], ['counter', 'Pulse counter', 'Each pass of the magnet is one pulse — for a water or gas meter']],
      short: 'Door contact, or a counter on a meter dial' },

    notify: { name: 'Notifications', grp: 'Notifications', type: 'notify', app: true, def: { open: true, close: false, armed: false, tamper: true },
      short: 'When the app sends a push message' },
    openTooLong: { name: 'Left open too long', grp: 'Notifications', type: 'long', app: true, def: { on: true, min: 10 },
      short: 'A push message when it stays open — the fridge, the balcony in winter' },
    history: { name: 'Event history', grp: 'Log', type: 'event', app: true, short: 'Every opening, stored by our server' },

    identify: { name: 'Find this device', grp: 'Device', type: 'action', short: 'Blinks the sensor’s light' },
  };
  const ALL_GROUPS = ['Device page', 'Sensor', 'Notifications', 'Log', 'Device'];

  const PRESETS = [
    { id: 'aqara', name: 'Aqara door & window sensor', model: 'MCCGQ11LM', manufacturer: 'Aqara', ic: 'door', feats: ['contact', 'history', 'battery', 'notify', 'openTooLong', 'identify'] },
    { id: 'sonoff', name: 'SONOFF contact sensor', model: 'SNZB-04P', manufacturer: 'SONOFF', ic: 'door', feats: ['contact', 'history', 'battery', 'notify', 'openTooLong', 'tamper'] },
    { id: 'tuya', name: 'Tuya door / window sensor', model: 'TS0203', manufacturer: 'Tuya', ic: 'door', feats: ['contact', 'history', 'battery', 'notify', 'openTooLong', 'tamper'] },
    { id: 'third', name: 'Third Reality door sensor', model: '3RDS17BZ', manufacturer: 'Third Reality', ic: 'door', feats: ['contact', 'history', 'battery', 'notify', 'openTooLong', 'delay'], v: { delay: 3 } },
    { id: 'bosch', name: 'Bosch door / window contact II plus', model: 'BSEN-CV', manufacturer: 'Bosch', ic: 'window', feats: ['contact', 'history', 'battery', 'notify', 'openTooLong', 'vibration', 'breakFn'] },
    { id: 'handle', name: 'Window handle sensor', model: 'SBDW-103C', manufacturer: 'Tuya', ic: 'window', feats: ['contact', 'history', 'battery', 'notify', 'openTooLong', 'windowType', 'light'], v: { windowType: 'composite_window' } },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', ic: 'door', feats: Object.keys(F) },
  ];

  /* "Display as" — what the sensor is fixed to (the user's call, 2026-11-10; the spec only had name + icon).
     It picks the picture on the device page and the icons the avatar pen offers (Figma exports only). */
  const DISPLAY = [
    { k: 'door', name: 'Door', sub: 'Entrance, room, balcony or garage door', noun: 'The door',
      icons: [['dev-door-02', 'Door'], ['dev-door-open', 'Entrance'], ['dev-window-2', 'Balcony'], ['dev-garage', 'Garage'], ['dev-gate', 'Gate'], ['dev-barrier', 'Barrier']] },
    { k: 'window', name: 'Window', sub: 'Casement or tilt-and-turn', noun: 'The window',
      icons: [['dev-window', 'Window'], ['dev-window-2', 'Double']] },
    { k: 'other', name: 'Other', sub: 'Fridge, cabinet, safe, box — shows the sensor and its magnet', noun: 'The magnet',
      icons: [['dev-fridge', 'Fridge'], ['archive', 'Cabinet'], ['box-fill', 'Box'], ['lock', 'Safe'], ['key', 'Key box'], ['tool', 'Tools']] },
  ];
  // data saved earlier: old icon keys → [icon, display]; old display kinds → one of the three
  const OLD = { door: ['dev-door-02', 'door'], 'door-open': ['dev-door-open', 'door'], window: ['dev-window', 'window'], balcony: ['dev-window-2', 'door'], garage: ['dev-garage', 'door'], gate: ['dev-gate', 'door'],
    fridge: ['dev-fridge', 'other'], cabinet: ['archive', 'other'], box: ['box-fill', 'other'], safe: ['lock', 'other'], toolbox: ['tool', 'other'], keys: ['key', 'other'] };
  const OLD_KIND = { balcony: 'door', garage: 'door', fridge: 'other', cabinet: 'other', safe: 'other' };
  const displayOf = (d) => DISPLAY.find((x) => x.k === d.display) || DISPLAY[0];
  const kind = (d) => displayOf(d).k;
  const iconsOf = (d) => displayOf(d).icons.map((x) => x[0]);
  const iconOf = (d) => (iconsOf(d).includes(d.icon) ? d.icon : iconsOf(d)[0]);
  const isCold = (d) => iconOf(d) === 'dev-fridge';   // smart default: a fridge is checked after 2 min (offered, never hidden)

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x);
  const has = (d, k) => d.features.includes(k);
  const S = (d, k) => d.settings[k];
  const counterMode = (d) => has(d, 'counter') && S(d, 'counter') === 'counter';
  const canTilt = (d) => has(d, 'windowType') && ['composite_window', 'hopper_window'].includes(S(d, 'windowType'));
  const away = () => !!Store.state.away;
  /** Prototype clock: "1 s = 1 min" makes left-open alerts testable without waiting. */
  const speed = (d) => (d.sim && d.sim.fast ? 60 : 1);
  const mins = (d, ms) => Math.floor((ms * speed(d)) / 60000);

  function applyDefaults(d) {
    for (const k in F) { const def = F[k].def; if (def !== undefined && d.settings[k] === undefined) d.settings[k] = clone(def); }
    if (d.settings.pulseL === undefined) d.settings.pulseL = 10;
    if (d.icon && OLD[d.icon]) { const o = OLD[d.icon]; d.icon = o[0]; if (!d.display) d.display = o[1]; }
    if (OLD_KIND[d.display]) d.display = OLD_KIND[d.display];
    if (!DISPLAY.some((x) => x.k === d.display)) d.display = 'door';
    if (!iconsOf(d).includes(d.icon)) d.icon = iconsOf(d)[0];
  }

  /** A believable morning: a few openings today, the door is closed now. */
  function seedLog(now = Date.now()) {
    const day = new Date(now); day.setHours(0, 0, 0, 0); const t0 = day.getTime();
    const at = (h, m) => t0 + (h * 60 + m) * 60000;
    const pairs = [[[7, 39], [7, 40]], [[8, 12], [8, 13]], [[12, 6], [12, 18]], [[17, 30], [17, 31]], [[19, 0], [19, 2]], [[20, 24], [20, 36]]];
    const log = [{ t: t0 - 3 * 3600000, k: 'open' }, { t: t0 - 3 * 3600000 + 60000, k: 'close' }];
    for (const [a, b] of pairs) { if (at(...b) < now - 60000) log.push({ t: at(...a), k: 'open' }, { t: at(...b), k: 'close' }); }
    return log.reverse();   // newest first
  }

  function create(presetId, { name, roomId } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const log = seedLog();
    const d = {
      id: Store.uid('d'), type: 'contact', preset: p.id, name: name || (p.ic === 'window' ? 'Window' : 'Front door'), roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'CS', mac: Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '0.0.0_0028', online: true, showOnHome: true, isNew: true, createdAt: Date.now(),
      features: p.feats.slice(), settings: {}, display: p.ic, icon: null,
      st: { open: false, tilt: false, at: log.length ? log[0].t : Date.now() - 3600000, tamper: false, breakUntil: 0, alerted: false, pulses: 1284, lastSeen: Date.now() },
      phys: { open: false, tilt: false, pending: 0 },
      battery: 88, temp: 21.4, hum: 46, lux: 640, log, sim: { fast: false }, blinkAt: 0, knockAt: 0,
    };
    if (p.v) Object.assign(d.settings, clone(p.v));
    applyDefaults(d);
    return d;
  }

  /* ---------- Behaviour (what the sensor reports → what the app does) ---------- */
  const W = (d) => d.name;
  function logEv(d, k, extra) { d.log.unshift(Object.assign({ t: Date.now(), k }, extra || {})); d.log.length = Math.min(d.log.length, 60); }
  /** Simulated push message on the phone (+ the home bell counter). */
  function notifyPush(d, title, body = '', tone = '') {
    Store.state.notifications = (Store.state.notifications || 0) + 1;
    UI.push({ title, body, tone });
  }
  const breakOn = (d) => d.st.breakUntil > Date.now();

  /** The sensor sends a new open / closed state. */
  function report(d, open, tilt) {
    const st = d.st, now = Date.now();
    st.open = open; st.tilt = !!tilt && open; st.at = now; st.alerted = false; st.lastSeen = now; d.blinkAt = now;
    logEv(d, open ? (st.tilt ? 'tilt' : 'open') : 'close');
    if (!has(d, 'notify')) return;
    const n = S(d, 'notify');
    const want = (open && n.open) || (!open && n.close);
    if (!want || (n.armed && !away()) || (open && breakOn(d))) return;
    const verb = open ? (st.tilt ? 'tilted' : 'opened') : 'closed';
    notifyPush(d, `${W(d)} ${verb}`, open && away() ? 'Nobody should be home' : '', open && away() ? 'danger' : '');
  }

  /** The real door / window moves (prototype panel). Returns a short message for the toast. */
  function move(d, open, tilt = false) {
    if (counterMode(d)) {
      if (open && !d.phys.open) { d.st.pulses++; d.st.lastSeen = Date.now(); d.blinkAt = Date.now(); }
      d.phys.open = open;
      return open ? 'Magnet passed — one pulse' : 'Magnet back';
    }
    if (open === d.phys.open && !!tilt === !!d.phys.tilt) return '';
    d.phys.open = open; d.phys.tilt = open && tilt;
    if (!d.online) return 'The sensor is offline — nothing reported';
    const delay = has(d, 'delay') ? S(d, 'delay') : 0;
    if (open && delay > 0 && !d.st.open) { d.phys.pending = Date.now() + delay * 1000; return `Opened — the sensor waits ${delay} s before reporting`; }
    if (!open && d.phys.pending) { d.phys.pending = 0; return 'Closed again before the delay ended — nothing reported'; }
    d.phys.pending = 0;
    report(d, open, tilt);
    return '';
  }

  function tick(d) {
    let changed = false; const now = Date.now(), st = d.st;
    if (d.phys.pending && now >= d.phys.pending) { d.phys.pending = 0; if (d.phys.open) report(d, true, d.phys.tilt); changed = true; }
    if (st.breakUntil && now >= st.breakUntil) {
      st.breakUntil = 0; logEv(d, 'breakEnd'); changed = true;
      if (st.open) notifyPush(d, 'Airing break over', `${W(d)} is still open`);
    }
    if (st.open && !counterMode(d) && has(d, 'openTooLong')) {
      const o = S(d, 'openTooLong');
      if (o.on && !st.alerted && !breakOn(d) && mins(d, now - st.at) >= o.min) {
        st.alerted = true; logEv(d, 'long', { min: o.min }); changed = true;
        notifyPush(d, `${W(d)} still open`, `Open for ${o.min} min`, 'warn');
      }
    }
    return changed;
  }

  /* ---------- Text ---------- */
  function durText(d, ms) {
    const m = mins(d, ms);
    if (m < 1) return 'just now';
    if (m < 60) return `for ${m} min`;
    const h = Math.floor(m / 60);
    return `for ${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  }
  const stateWord = (d) => (d.st.open ? (d.st.tilt ? 'Tilted' : 'Open') : 'Closed');
  function sinceText(d) {
    if (d.st.open) { const t = durText(d, Date.now() - d.st.at); return t === 'just now' ? 'Just now' : t[0].toUpperCase() + t.slice(1); }
    const day = new Date(); day.setHours(0, 0, 0, 0);
    return d.st.at >= day.getTime() ? `Since ${UI.fmtTime(d.st.at)}` : `Since yesterday ${UI.fmtTime(d.st.at)}`;
  }
  const startOfDay = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };
  const opensToday = (d) => d.log.filter((e) => (e.k === 'open' || e.k === 'tilt') && e.t >= startOfDay()).length;
  const timesText = (n) => (n === 0 ? 'Not opened today' : n === 1 ? 'Opened once today' : `Opened ${n} times today`);
  const m3 = (d) => ((d.st.pulses * S(d, 'pulseL')) / 1000).toFixed(2);
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;

  function tileStatus(d) {
    if (!d.online) return { text: 'Offline' };
    if (d.st.tamper) return { text: 'Cover removed', tone: 'danger' };
    if (counterMode(d)) return { text: `${d.st.pulses} pulses` };
    if (d.st.open) { const t = durText(d, Date.now() - d.st.at); return { text: `${stateWord(d)} · ${t === 'just now' ? 'now' : t.replace('for ', '')}`, tone: 'warn' }; }
    return { text: 'Closed' };
  }

  /* ---------- Home tile ---------- */
  function homeTiles(d) {
    const s = tileStatus(d);
    // Like Apple Home / Home Assistant: an open door shows the open-door glyph (Figma "Door window/door-open")
    const ic = kind(d) === 'door' && iconOf(d) === 'dev-door-02' && d.online && d.st.open && !counterMode(d) ? 'dev-door-open' : iconOf(d);
    return [{ ch: 0, name: d.name, icon: ic, on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }];
  }

  /* ==========================================================================
     Device page (device.html)
     ========================================================================== */
  /** The picture: a door or a window with the sensor on the frame and the magnet on the moving part.
      HTML + CSS 3D (perspective), so the leaf really swings — in Chrome and in Safari. */
  const SENSOR = '<div class="ct-sensor"><i class="ct-base"></i><i class="ct-cover"><i class="ct-led"></i></i><i class="ct-wave"></i><i class="ct-wave w2"></i></div>';
  /** One picture per "Display as" — minimal on purpose: only enough to see open / closed at a glance. */
  function sceneBody(k) {
    switch (k) {
      case 'window': return `<i class="ct-ground"></i><i class="ct-bloom"></i><i class="ct-sill"></i><div class="ct-frame"><div class="ct-hole"></div><div class="ct-pane"><i class="ct-glass"></i></div><i class="ct-mull"></i>
          <div class="ct-turn"><div class="ct-sash"><i class="ct-glass"></i><i class="ct-shade"></i><i class="ct-magnet"></i><i class="ct-whandle"></i></div></div></div>`;
      case 'other': return '<i class="cto-shadow"></i><i class="cto-spill"></i><div class="cto-cab"><i class="cto-in"></i><div class="cto-door"><i class="cto-h"></i><i class="ct-magnet"></i></div></div>';   // a cabinet: the door swings from right to left (hinge on the left); the sensor sits on the frame like on the door / window
      default: return '<i class="ct-ground"></i><i class="ct-bloom"></i><i class="ct-beam"></i><div class="ct-frame"><div class="ct-hole"></div><div class="ct-leaf"><i class="ct-lever"></i><i class="ct-magnet"></i></div></div>';
    }
  }
  function scene(d) {
    const st = d.st, k = kind(d);
    const cls = ['ct-card', k === 'window' ? 'win' : k, st.open && !st.tilt ? 'is-open' : '', st.tilt && k === 'window' ? 'is-tilt' : '', st.tamper ? 'is-tamper' : '', !d.online ? 'is-off' : ''].join(' ');
    return `<div class="${cls}" data-cl="scene" role="img" aria-label="${esc(W(d))}: ${stateWord(d).toLowerCase()}"><div class="ct-stage">${sceneBody(k)}${SENSOR}</div></div>`;
  }

  function page(d) {
    const st = d.st;
    let h = '';
    // Alerts first: they explain the state (Figma alert-banner: icon + one line)
    if (!d.online) h += `<div class="pad cw-gap" data-key="ban-off"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · No report for ${durText(d, Date.now() - st.lastSeen).replace('for ', '')}. Check the battery.</div></div></div>`;
    if (st.tamper) h += `<div class="pad cw-gap" data-key="ban-tamper"><div class="banner danger">${icon('banner-error')}<div><b>Cover removed.</b> Someone opened the sensor or pulled it off the wall</div></div></div>`;
    if (breakOn(d)) h += `<div class="pad cw-gap" data-key="ban-break"><div class="banner info">${icon('round-info')}<div><b>Airing break</b> · The window may stay open <span data-num data-live="break">${UI.fmtDur((st.breakUntil - Date.now()) / 1000)}</span> more</div></div></div>`;
    if (battLow(d)) h += `<div class="pad cw-gap" data-key="ban-batt"><div class="banner warn">${icon('battery')}<div><b>Battery low · ${d.battery} %</b></div></div></div>`;

    if (counterMode(d)) {
      // Pulse counter: the number is the page
      h += `<div class="ct-count" data-key="count"><div class="cw-pct"><span data-num="count" data-live="pulses">${st.pulses}</span><small>pulses</small></div>
        <div class="cw-state">= <span data-num="count" data-live="m3">${m3(d)}</span> m³ water · ${S(d, 'pulseL')} L per pulse</div></div>`;
    } else {
      h += `<div class="pad" data-key="scene">${scene(d)}</div>`;
      const tone = !d.online ? '' : st.open ? 'open' : 'closed';
      h += `<div class="cw-readout ct-readout" data-key="readout"><div><div class="ct-word ${tone}" data-cl="word" data-swap>${d.online ? stateWord(d) : 'Unknown'}</div>
          <div class="cw-state" data-num data-live="since">${d.online ? sinceText(d) : `Last: ${stateWord(d).toLowerCase()}`}</div></div>
          ${has(d, 'history') ? `<span class="cw-hint" data-num data-live="times">${timesText(opensToday(d))}</span>` : ''}</div>`;
    }

    // Readings (flat information cards, Figma info-card; wide ones carry an icon on the right)
    const cards = [];
    if (has(d, 'climate')) {
      cards.push(`<div class="info-card"><span>Temperature</span><b data-num="count">${d.temp.toFixed(1)} °C</b></div>`);
      cards.push(`<div class="info-card"><span>Humidity</span><b data-num="count">${d.hum} %</b></div>`);
    }
    if (has(d, 'light')) cards.push(`<div class="info-card wide"><span>Light level</span><b data-num="count">${d.lux < 30 ? 'Dark' : d.lux < 200 ? 'Twilight' : 'Bright'} · ${d.lux} lx</b>${icon('sun')}</div>`);
    if (has(d, 'battery')) cards.push(`<div class="info-card wide"><span>${battLow(d) ? 'Battery · replace the coin cell' : 'Battery'}</span><b data-num="count">${d.battery} %</b>${icon('battery')}</div>`);
    if (cards.length) h += `<div class="pad info-grid" data-key="info" style="margin-top:24px">${cards.join('')}</div>`;
    return h + '<div style="height:28px"></div>';
  }

  /** Cheap per-second update (no re-render): durations, countdowns. */
  function live(d, root) {
    UI.setNum(root.querySelector('[data-live="since"]'), d.online ? sinceText(d) : `Last: ${stateWord(d).toLowerCase()}`);
    UI.setNum(root.querySelector('[data-live="times"]'), timesText(opensToday(d)));
    const b = root.querySelector('[data-live="break"]'); if (b && breakOn(d)) UI.setNum(b, UI.fmtDur((d.st.breakUntil - Date.now()) / 1000));
    afterRender(d, root);
  }
  /** One-shot animations that follow a report: the LED blinks, the leaf shakes on a knock. */
  const seen = { blink: 0, knock: 0 };
  function afterRender(d, root) {
    const card = root.querySelector('.ct-card'); if (!card) return;
    if (d.blinkAt > seen.blink) { seen.blink = d.blinkAt; if (Date.now() - d.blinkAt < 1500) UI.pulse(card, 'blink'); }
    if (d.knockAt > seen.knock) { seen.knock = d.knockAt; if (Date.now() - d.knockAt < 1500) UI.pulse(card, 'knock'); }
  }
  function bindPage(d) { seen.blink = d.blinkAt; seen.knock = d.knockAt; }   // don't replay old blinks on page load

  /* ==========================================================================
     Settings (device-settings.html)
     ========================================================================== */
  function summary(d, k) {
    const f = F[k], v = S(d, k);
    if (f.type === 'choice' || f.type === 'mode') return (f.opts.find((o) => o[0] === v) || ['', ''])[1];
    if (f.type === 'break') return v.on ? `${v.min} min` : 'Off';
    if (f.type === 'knock') return v.on ? (f.opts.find((o) => o[0] === v.sens) || ['', ''])[1] : 'Off';
    if (f.type === 'long') return v.on ? `After ${v.min} min` : 'Off';
    return '';
  }
  const row = (k, title, sub, value) => `<button class="cell" data-action="cs2-feature" data-k="${k}">
      <span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>
      ${value ? `<span class="cell-value">${esc(value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
  const sw = (key, title, sub, on, dis) => `<button class="cell" data-action="cn-toggle" data-n="${key}" role="switch" aria-checked="${on}" ${dis ? 'aria-disabled="true"' : ''}>
      <span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>
      <span class="switch" aria-hidden="true" aria-checked="${on}" ${dis ? 'style="opacity:.4"' : ''}></span></button>`;

  function settings(d) {
    let h = '';
    const ks = Object.keys(F).filter((k) => F[k].grp === 'Sensor' && has(d, k));
    if (ks.length) h += `<div class="list-header">Sensor</div><div class="list">${ks.map((k) => row(k, F[k].name, '', summary(d, k))).join('')}</div>`;
    if (has(d, 'notify') || has(d, 'openTooLong')) {
      // On/off notification rules switch right in the row (no sheet); "Left open too long" needs a time → sheet
      let r = '';
      if (has(d, 'notify')) {
        const n = S(d, 'notify');
        r += sw('open', 'When it opens', '', n.open) + sw('close', 'When it closes', '', n.close)
          + sw('armed', 'Only when nobody is home', 'Uses the home’s Away mode', n.armed, !n.open && !n.close);
        if (has(d, 'tamper')) r += sw('tamper', 'When the cover is removed', '', n.tamper);
      }
      if (has(d, 'openTooLong')) r += row('openTooLong', F.openTooLong.name, '', summary(d, 'openTooLong'));
      h += `<div class="list-header">Notifications</div><div class="list">${r}</div><div class="list-footer">Battery low and offline messages are always on.</div>`;
    }
    return h;
  }

  const stepper = (act, val, unit) => `<div class="stepper"><button data-action="${act}" data-d="-1" aria-label="Less">−</button><output data-num>${val} ${unit}</output><button data-action="${act}" data-d="1" aria-label="More">+</button></div>`;
  const radio = (act, cur, opts) => opts.map((o) => `<button class="option" role="radio" aria-checked="${cur === o[0]}" data-action="${act}" data-v="${o[0]}">
      <span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('');

  function openFeature(d, k, ctx) {
    const f = F[k];
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    const s = UI.sheet({
      title: f.name, sub: esc(f.short),
      render: () => {
        const v = S(d, k);
        if (f.type === 'choice') return `<div class="list">${radio('cf2-opt', v, f.opts)}</div>`;
        if (f.type === 'mode') {
          return `<div class="list">${radio('cf2-opt', v, f.opts)}</div>`
            + UI.collapse(v === 'counter', UI.group('Meter', `<div class="cell"><span class="cell-main cell-title">Litres per pulse</span>${stepper('cf2-pl', S(d, 'pulseL'), 'L')}</div>`)
              + '<div class="list-footer">Our app turns pulses into litres. The sensor only counts.</div>');
        }
        if (f.type === 'break') {
          return `<div class="list"><button class="cell" data-action="cf2-toggle"><span class="cell-main cell-title">Allow airing break</span><span class="switch" role="switch" aria-checked="${v.on}"></span></button>
            ${UI.collapse(v.on, `<div class="cell"><span class="cell-main cell-title">Break length</span>${stepper('cf2-min', v.min, 'min')}</div>`)}</div>
            <div class="list-footer">When the time is up, an open window counts again.</div>`;
        }
        if (f.type === 'knock') {
          return `<div class="list"><button class="cell" data-action="cf2-toggle"><span class="cell-main cell-title">Detect knocks</span><span class="switch" role="switch" aria-checked="${v.on}"></span></button></div>`
            + UI.collapse(v.on, UI.group('Sensitivity', radio('cf2-sens', v.sens, f.opts)) + '<div class="list-footer">Too sensitive: slammed doors and passing trucks count too. Start at Medium.</div>');
        }
        if (f.type === 'long') {
          const suggest = isCold(d) && v.min !== 2;
          return `<div class="list"><button class="cell" data-action="cf2-toggle"><span class="cell-main cell-title">Notify when left open</span><span class="switch" role="switch" aria-checked="${v.on}"></span></button>
            ${UI.collapse(v.on, `<div class="cell"><span class="cell-main cell-title">After</span>${stepper('cf2-min', v.min, 'min')}</div>`)}</div>
            ${UI.collapse(v.on && suggest, `<div class="pad" style="margin-top:12px"><button class="btn btn-secondary btn-block" data-action="cf2-two">Fridge: notify after 2 min</button></div>`)}
            <div class="list-footer">Our server counts the minutes. The sensor itself does nothing special.</div>`;
        }
        return '';
      },
    });
    const STEPS = { breakFn: [1, 15], openTooLong: [1, 240] };
    UI.on({
      'cf2-opt': ({ v }) => {
        d.settings[k] = typeof f.def === 'number' ? +v : v;
        if (k === 'counter' && v === 'counter') { d.st.open = false; d.st.tilt = false; d.phys.open = false; d.phys.pending = 0; }
        commit();
      },
      'cf2-toggle': () => { S(d, k).on = !S(d, k).on; commit(); },
      'cf2-sens': ({ v }) => { S(d, k).sens = v; commit(); },
      'cf2-min': ({ d: dir }) => {
        const v = S(d, k), [a, z] = STEPS[k];
        const st = k === 'openTooLong' ? (v.min < 10 ? 1 : v.min < 60 ? 5 : 30) : 1;
        v.min = Math.min(z, Math.max(a, v.min + st * dir)); commit();
      },
      'cf2-two': () => { S(d, k).min = 2; S(d, k).on = true; commit(); },
      'cf2-pl': ({ d: dir }) => { d.settings.pulseL = Math.min(100, Math.max(1, S(d, 'pulseL') + (S(d, 'pulseL') < 10 ? 1 : 5) * dir)); commit(); },
    });
  }

  /* ---------- Display as (what it is fixed to) + icon (avatar pen) — same sheets as the relay ---------- */
  function displayRow(d) {
    return `<button class="cell" data-action="rs-display"><span class="cell-main cell-title">Display As</span><span class="cell-value">${esc(displayOf(d).name)}</span>${icon('chevron-right', 'chev')}</button>`;
  }
  function openDisplayPicker(d, ctx) {
    UI.sheet({
      title: 'Display as', sub: 'What the sensor is fixed to — sets the picture and the icon',
      render: () => `<div class="list">${DISPLAY.map((x) => `<button class="option" role="radio" aria-checked="${kind(d) === x.k}" data-action="cd-pick" data-v="${x.k}">
        <span class="cell-icon" style="color:var(--label-secondary)">${icon(x.icons[0][0])}</span><span class="option-main"><span class="option-title" style="display:block">${esc(x.name)}</span><span class="option-sub" style="display:block">${esc(x.sub)}</span></span><span class="radio">${icon('radio-on')}</span></button>`).join('')}</div>`,
    });
    UI.on({
      'cd-pick': ({ v }) => {
        d.display = v; if (!iconsOf(d).includes(d.icon)) d.icon = iconsOf(d)[0];
        Store.save(); UI.closeSheet(); ctx.render();
      },
    });
  }
  function openIconPicker(d, ctx) {
    UI.sheet({
      title: 'Select an icon', sub: 'Only a picture — the sensor works the same everywhere',
      render: () => `<div class="ip-list"><section class="ip-group"><div class="ip-title">${esc(displayOf(d).name)}</div>
        <div class="ip-grid labeled">${displayOf(d).icons.map(([n, l]) => `<button data-action="ci-pick" data-k="${n}" aria-pressed="${iconOf(d) === n}">${icon(n, 'icon', 'style="width:32px;height:32px"')}<span>${esc(l)}</span></button>`).join('')}</div></section></div>`,
      footer: ICON_DONE,
    });
    UI.on({
      'ci-pick': ({ k }) => {
        d.icon = k; Store.save(); UI.closeSheet(); ctx.render();
        if (isCold(d) && has(d, 'openTooLong') && S(d, 'openTooLong').min !== 2) UI.toast('Tip: a fridge is usually checked after 2 min — see Notifications');
      },
    });
  }

  /* ---------- Event history (Settings → Event History) ---------- */
  const EV = { open: 'Opened', tilt: 'Tilted', close: 'Closed', tamper: 'Cover removed', cover: 'Cover back on', knock: 'Knock on the glass', long: 'Still open', battery: 'Battery low', break: 'Airing break started', breakEnd: 'Airing break over' };
  function strip(d) {
    const t0 = startOfDay(), now = Date.now(), span = 86400000;
    const evs = d.log.filter((e) => e.t >= t0 && ['open', 'tilt', 'close'].includes(e.k)).slice().reverse();
    // was it open at midnight?
    const before = d.log.find((e) => e.t < t0 && ['open', 'tilt', 'close'].includes(e.k));
    let openAt = before && before.k !== 'close' ? t0 : null; const segs = [];
    for (const e of evs) { if (e.k !== 'close') { if (openAt === null) openAt = e.t; } else if (openAt !== null) { segs.push([openAt, e.t]); openAt = null; } }
    if (openAt !== null) segs.push([openAt, now]);
    const pct = (t) => ((t - t0) / span) * 100;
    return `<div class="ct-strip"><div class="bar">${segs.map(([a, z]) => `<i style="left:${pct(a).toFixed(2)}%;width:max(3px,${(pct(z) - pct(a)).toFixed(2)}%)"></i>`).join('')}<b style="left:${pct(now).toFixed(2)}%"></b></div>
      <div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>${Kit.stripLegend('Open')}</div>`;
  }
  function openHistory(d) {
    const day = startOfDay();
    UI.sheet({
      title: 'Event History',
      render: () => {
        const rows = d.log.slice(0, 20).map((e) => {
          const when = e.t >= day ? UI.fmtTime(e.t) : e.t >= day - 86400000 ? 'Yesterday ' + UI.fmtTime(e.t) : new Date(e.t).toLocaleDateString();
          const title = e.k === 'long' ? `Still open after ${e.min} min` : EV[e.k] || e.k;
          return `<div class="cell"><span class="cell-main cell-title">${esc(title)}</span><span class="cell-value">${when}</span></div>`;
        }).join('');
        return UI.group('Today', `<div class="group-pad">${strip(d)}</div>`) + UI.group('', rows || '<div class="cell"><span class="cell-main cell-sub">Nothing yet</span></div>')
          + '<div class="list-footer">Stored by our server. The sensor itself keeps no history.</div>';
      },
    });
  }

  function bindSettings(d, ctx) {
    UI.on({
      'cs2-feature': ({ k }) => openFeature(d, k, ctx),
      'cn-toggle': ({ n }) => {
        const v = S(d, 'notify');
        if (n === 'armed' && !v.open && !v.close) { UI.toast('Turn on “When it opens” or “When it closes” first'); return; }
        v[n] = !v[n]; Store.save(); ctx.render();
      },
      'rs-icon': () => openIconPicker(d, ctx),
      'rs-display': () => openDisplayPicker(d, ctx),
      'rs-history': () => openHistory(d),
      'rs-identify': () => {
        if (!d.online) return UI.toast('The sensor is offline');
        d.blinkAt = Date.now(); Store.save();
        UI.toast('The sensor blinks. Asleep? Press its button first');
      },
    });
  }

  function about(d) {
    const rows = [];
    if (counterMode(d)) rows.push(['Mode', 'Pulse counter'], ['Pulses counted', String(d.st.pulses)]);
    else rows.push(['Reported state', stateWord(d)], ['Last change', `${UI.fmtTime(d.st.at)}`]);
    rows.push(['Last report', d.online ? 'Just now' : UI.fmtTime(d.st.lastSeen)]);
    if (has(d, 'battery')) rows.push(['Battery', `${d.battery} % · ${(2.6 + d.battery / 250).toFixed(2)} V`]);
    if (has(d, 'tamper')) rows.push(['Cover', d.st.tamper ? 'Removed' : 'Closed']);
    return rows;
  }

  /* ==========================================================================
     Prototype panel (desktop only) — the real world: the door, the sensor, the home.
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    const ph = d.phys, wait = ph.pending ? Math.ceil((ph.pending - Date.now()) / 1000) : 0;
    const where = counterMode(d) ? 'Meter dial' : displayOf(d).noun;
    return `<div class="pp-title">Contact sensor prototype</div>
      <p class="pp-note">Not part of the app. Change what this sensor supports and play the real world. Spec: <a href="../Device%20Interface%203/3.%20Contact_Sensor_Interface.html" target="_blank">Contact_Sensor_Interface</a></p>
      <h3>Real sensor</h3>
      <select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      <h3>${where}${counterMode(d) ? '' : ` · <span style="font-weight:400">${ph.open ? (ph.tilt ? 'tilted' : 'open') : 'closed'}${wait ? ` · reports in ${wait} s` : ''}</span>`}</h3>
      <div class="pp-row">${counterMode(d)
        ? '<button class="pp-btn" data-action="pp-pulse">🔢 Magnet passes</button>'
        : `<button class="pp-btn" data-action="pp-move" data-o="1">🟠 Open</button>${canTilt(d) && kind(d) === 'window' ? '<button class="pp-btn" data-action="pp-move" data-o="tilt">↘ Tilt</button>' : ''}<button class="pp-btn" data-action="pp-move" data-o="0">✅ Close</button>`}</div>
      <h3>The sensor</h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-button">🔘 Press its button</button>
        ${has(d, 'tamper') ? `<button class="pp-btn" data-action="pp-tamper">${d.st.tamper ? '🔧 Put the cover back' : '🪛 Remove the cover'}</button>` : ''}
        ${has(d, 'vibration') ? '<button class="pp-btn" data-action="pp-knock">🔨 Knock on the glass</button>' : ''}</div>
      <div class="pp-row">${has(d, 'battery') ? `<button class="pp-btn" data-action="pp-batt">🔋 ${battLow(d) ? 'New battery' : 'Battery low'}</button>` : ''}
        <button class="pp-btn" data-action="pp-online">${d.online ? '📴 Stops reporting' : '📶 Reports again'}</button></div>
      <h3>Home</h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-away">${away() ? '🛡 Away (nobody home)' : '🏠 Someone is home'}</button>
        <button class="pp-btn" data-action="pp-fast">${d.sim.fast ? '⏩ 1 s = 1 min' : '⏱ Real time'}</button></div>
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
        Object.assign(d, { preset: p.id, model: p.model, manufacturer: p.manufacturer, originalName: p.name, features: p.feats.slice(), settings: {}, display: p.ic, icon: null });
        if (p.v) Object.assign(d.settings, clone(p.v));
        applyDefaults(d);
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); applyDefaults(d); }
      commit();
    };
    UI.on({
      'pp-move': ({ o }) => commit(move(d, o !== '0', o === 'tilt')),
      'pp-pulse': () => { move(d, true); move(d, false); commit(); },
      'pp-button': () => {
        d.blinkAt = Date.now();
        if (has(d, 'breakFn') && S(d, 'breakFn').on && d.online) {
          d.st.breakUntil = Date.now() + (S(d, 'breakFn').min * 60000) / speed(d); logEv(d, 'break');
          return commit(`Airing break for ${S(d, 'breakFn').min} min — open the window, no alert`);
        }
        commit('The button wakes the sensor — it sends a report');
      },
      'pp-tamper': () => {
        d.st.tamper = !d.st.tamper; d.blinkAt = Date.now(); logEv(d, d.st.tamper ? 'tamper' : 'cover');
        if (d.st.tamper && has(d, 'notify') && S(d, 'notify').tamper) notifyPush(d, 'Sensor tampered', `${W(d)}: the cover was opened`, 'danger');
        commit();
      },
      'pp-knock': () => {
        if (!S(d, 'vibration').on) return commit('Knock detection is off in Settings');
        d.knockAt = Date.now(); d.blinkAt = Date.now(); logEv(d, 'knock');
        notifyPush(d, 'Knock detected', `${W(d)}: a blow on the glass`, away() ? 'danger' : 'warn');
        commit();
      },
      'pp-batt': () => {
        d.battery = battLow(d) ? 100 : 14;
        if (battLow(d)) { logEv(d, 'battery'); notifyPush(d, 'Battery low', `${W(d)} sensor · ${d.battery} %`, 'warn'); }
        commit();
      },
      'pp-online': () => {
        d.online = !d.online;
        if (!d.online) return commit();
        d.st.lastSeen = Date.now(); d.blinkAt = Date.now();
        // back online: it reports what the door is doing now
        if (!counterMode(d) && (d.phys.open !== d.st.open || !!d.phys.tilt !== !!d.st.tilt)) report(d, d.phys.open, d.phys.tilt);
        commit();
      },
      'pp-away': () => { Store.state.away = !away(); commit(away() ? 'Home set to Away (an app setting for the whole home)' : 'Someone is home'); },
      'pp-fast': () => { d.sim.fast = !d.sim.fast; commit(); },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Contact sensor', F, PRESETS, DISPLAY, create, applyDefaults,
    icon: (d) => iconOf(d),
    avatarIcon: (d) => iconOf(d),
    displayRow,
    describe: (p) => `${p.manufacturer} · ${p.ic === 'window' ? 'window' : 'door / window'} sensor`,
    historyValue: (d) => (has(d, 'history') ? `${opensToday(d)} today` : null),
    homeTiles, page, bindPage, live, afterRender, settings, bindSettings, about, tick,
    busy: (d) => d.st.open || !!d.phys.pending || breakOn(d),
    protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
    _move: move,   // used by tools/checks
  };
})();
