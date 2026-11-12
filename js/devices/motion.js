/* ==========================================================================
   Motion sensor (PIR) — device interface
   Source: "Device Interface 3 / 6. Motion_Sensor_Interface.html"
   (features from zigbee2mqtt, 181 motion sensors)
   Rule: show a value or setting only if the paired sensor has it.
   Look: Figma "Relay — Device Interface" (6014:56) — same banners, cards, lists and sheets; the picture and the
   readout follow the contact sensor's (ct-card / ct-readout) so the sensors look like one family.

   A PIR sees warm bodies MOVING. It reports "motion" at once and "no motion" after the no-motion time (or,
   on Aqara, after its rest time). It can't see someone sitting still — that is what a presence sensor is for.
   The real room (d.phys) lives in the prototype panel; the app only knows the sensor's reports (d.st).
   ========================================================================== */
Devices.motion = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    motion: { name: 'Motion detected', grp: 'Device page', short: 'Whether someone is moving in the room now, and when the last motion was' },
    light: { name: 'Light level', grp: 'Device page', short: 'How bright the room is — so motion turns the light on only when it is dark' },
    climate: { name: 'Temperature & humidity', grp: 'Device page', short: 'Many motion sensors also measure the air' },
    tamper: { name: 'Tamper', grp: 'Device page', short: 'Reports when its cover is opened or it is taken off the wall' },
    battery: { name: 'Battery', grp: 'Device page', short: 'Usually 1–2 years; busy rooms drain it faster' },

    pirEnable: { name: 'Motion detection', grp: 'Detection', type: 'toggle', def: true, short: 'Switch detection off without removing the sensor — light and temperature keep working' },
    clearTime: { name: 'No-motion time', grp: 'Detection', type: 'choice', def: 60,
      opts: [[10, '10 s', 'Lights go off soon after you leave — and while you sit still'], [30, '30 s', ''], [60, '1 min', 'Recommended'], [120, '2 min', ''], [300, '5 min', 'Fewer “empty room” moments, lights stay on longer']],
      short: 'How long “motion” stays on after the last movement' },
    restTime: { name: 'Rest time', grp: 'Detection', type: 'choice', def: 60,
      opts: [[5, '5 s', 'Reacts fast in busy rooms, shorter battery life'], [30, '30 s', ''], [60, '1 min', 'Recommended'], [120, '2 min', 'Longest battery life']],
      short: 'After a detection the sensor sleeps to save battery — movement in that time is not reported' },
    sensitivity: { name: 'Sensitivity', grp: 'Detection', type: 'choice', def: 'medium',
      opts: [['low', 'Low', 'Big movements only — ignores pets'], ['medium', 'Medium', 'Recommended'], ['high', 'High', 'Small movements, further away — more false alarms']],
      short: 'How small a movement is enough' },

    led: { name: 'Light on the sensor', grp: 'Sensor', type: 'toggle', def: true, short: 'Blinks on motion. Turn off for bedrooms and for security' },
    output: { name: 'Built-in light', grp: 'Sensor', type: 'toggle', def: false, short: 'The sensor’s own lamp, switched by the sensor itself — works when the hub is offline' },
    direct: { name: 'Switches lights directly', grp: 'Sensor', type: 'info', short: 'This sensor can turn on bound bulbs by itself, without the hub' },

    notify: { name: 'Notifications', grp: 'Notifications', app: true, def: { on: true, armed: true, tamper: true }, short: 'When the app sends a push message' },
    motionLight: { name: 'Lights on motion', grp: 'Automation', app: true, def: { on: true, lux: 40, off: 2, target: null },
      short: 'Motion + dark → a light turns on; no motion for a while → it turns off' },
    history: { name: 'Motion history', grp: 'Log', app: true, short: 'When there was motion today — stored by our server' },
    identify: { name: 'Find this device', grp: 'Device', short: 'Blinks the sensor’s light' },
  };
  const ALL_GROUPS = ['Device page', 'Detection', 'Sensor', 'Notifications', 'Automation', 'Log', 'Device'];

  const PRESETS = [
    { id: 'p1', name: 'Aqara motion sensor P1', model: 'RTCGQ14LM', manufacturer: 'Aqara', feats: ['motion', 'restTime', 'sensitivity', 'light', 'battery', 'motionLight', 'notify', 'history', 'led'], v: { restTime: 30 } },
    { id: 'aqara', name: 'Aqara motion sensor (classic)', model: 'RTCGQ11LM', manufacturer: 'Aqara', feats: ['motion', 'restTime', 'light', 'battery', 'motionLight', 'notify', 'history'], v: { restTime: 60 }, fixed: ['restTime'] },
    { id: 'sonoff', name: 'SONOFF PIR sensor', model: 'SNZB-03P', manufacturer: 'SONOFF', feats: ['motion', 'clearTime', 'light', 'battery', 'motionLight', 'notify', 'history'], v: { clearTime: 30 }, dimBright: true },
    { id: 'hue', name: 'Philips Hue motion sensor', model: '9290030675', manufacturer: 'Philips', feats: ['motion', 'clearTime', 'sensitivity', 'light', 'climate', 'battery', 'motionLight', 'notify', 'history', 'led', 'identify'] },
    { id: 'tuya', name: 'Tuya PIR with light sensor', model: 'ZG-204ZL', manufacturer: 'Tuya', feats: ['motion', 'clearTime', 'sensitivity', 'light', 'battery', 'motionLight', 'notify', 'history'], v: { clearTime: 30 }, steps: [10, 30, 60, 120] },
    { id: 'tuyab', name: 'Tuya basic PIR', model: 'TS0202', manufacturer: 'Tuya', feats: ['motion', 'battery', 'tamper', 'notify', 'history'] },
    { id: 'ikea', name: 'IKEA VALLHORN', model: 'E2134', manufacturer: 'IKEA', feats: ['motion', 'clearTime', 'light', 'battery', 'motionLight', 'notify', 'history', 'identify'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' && x !== null ? JSON.parse(JSON.stringify(x)) : x);
  const has = (d, k) => d.features.includes(k);
  const S = (d, k) => d.settings[k];
  const preset = (d) => PRESETS.find((p) => p.id === d.preset) || PRESETS[0];
  const away = () => !!Store.state.away;
  const speed = (d) => (d.sim && d.sim.fast ? 10 : 1);   // prototype: "demo ×10" makes waits short
  const ms = (d, sec) => (sec * 1000) / speed(d);
  const detectionOn = (d) => !has(d, 'pirEnable') || S(d, 'pirEnable');
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;
  const W = (d) => d.name;
  const optsOf = (d, k) => { const p = preset(d); return k === 'clearTime' && p.steps ? F.clearTime.opts.filter((o) => p.steps.includes(o[0])) : F[k].opts; };
  const fixed = (d, k) => (preset(d).fixed || []).includes(k);
  const secText = (s) => (s >= 60 ? `${s / 60} min` : `${s} s`);

  function applyDefaults(d) {
    for (const k in F) { const def = F[k].def; if (def !== undefined && d.settings[k] === undefined) d.settings[k] = clone(def); }
  }

  /** A believable day so far: a few walks through the hallway. */
  function seedLog(now = Date.now()) {
    const day = new Date(now); day.setHours(0, 0, 0, 0); const t0 = day.getTime();
    const at = (h, m) => t0 + (h * 60 + m) * 60000;
    const walks = [[[6, 52], [6, 55]], [[7, 41], [7, 46]], [[7, 58], [8, 3]], [[13, 0], [13, 4]], [[18, 12], [18, 30]], [[21, 2], [21, 20]]];
    const log = [{ t: t0 - 2 * 3600000, k: 'motion' }, { t: t0 - 2 * 3600000 + 90000, k: 'clear' }];
    for (const [a, b] of walks) { if (at(...b) < now - 60000) log.push({ t: at(...a), k: 'motion' }, { t: at(...b), k: 'clear' }); }
    return log.reverse();   // newest first
  }

  function create(presetId, { name, roomId } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const log = seedLog(), last = log.find((e) => e.k === 'motion');
    const d = {
      id: Store.uid('d'), type: 'motion', preset: p.id, name: name || 'Motion sensor', roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'MS', mac: Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '0.0.0_0034', online: true, showOnHome: true, isNew: true, createdAt: Date.now(),
      features: p.feats.slice(), settings: {},
      st: { occ: false, at: last ? last.t : Date.now() - 3600000, clearAt: 0, restUntil: 0, tamper: false, lastSeen: Date.now(), lit: false, offAt: 0, lux: 8 },
      phys: { person: 'none', day: false },
      battery: 91, temp: 22.6, hum: 44, log, sim: { fast: false }, blinkAt: 0,
    };
    if (p.v) Object.assign(d.settings, clone(p.v));
    applyDefaults(d);
    return d;
  }

  /* ---------- Lights on motion: the light it switches (any controllable light / relay channel in the home) ---------- */
  function targets() {
    const out = [];
    Store.state.devices.forEach((x) => {
      if (x.type !== 'light' && x.type !== 'relay') return;
      // lights, and relay channels shown as a light (yellow) — not boilers or heaters
      DeviceAPI(x).homeTiles().forEach((t) => { if (t.controllable && t.ch >= 0 && (x.type === 'light' || t.accent === 'var(--yellow)')) out.push({ id: x.id, ch: t.ch, name: t.name, room: Store.roomName(x.roomId), on: t.on, icon: t.icon }); });
    });
    return out;
  }
  const targetOf = (d) => { const t = S(d, 'motionLight').target; return t && targets().find((x) => x.id === t.id && x.ch === t.ch); };
  function setTarget(d, on) {
    const t = targetOf(d); if (!t || t.on === on) return false;
    DeviceAPI(Store.device(t.id)).toggle(t.ch); return true;
  }
  const roomLux = (d) => { const t = has(d, 'motionLight') ? targetOf(d) : null; return d.phys.day ? 320 : t && t.on ? 180 : 8; };
  const luxText = (d) => (preset(d).dimBright ? (d.st.lux < 50 ? 'Dim' : 'Bright') : `${d.st.lux} lx`);

  /* ---------- Behaviour ---------- */
  function logEv(d, k, extra) { d.log.unshift(Object.assign({ t: Date.now(), k }, extra || {})); d.log.length = Math.min(d.log.length, 80); }
  function notifyPush(d, title, body = '', tone = '') { Store.state.notifications = (Store.state.notifications || 0) + 1; UI.push({ title, body, tone }); }

  /** Something moves in front of the sensor. Returns a short message for the prototype toast ('' = reported). */
  function detect(d, cat = false) {
    const st = d.st, now = Date.now();
    if (!d.online) return 'The sensor is offline — nothing reported';
    if (!detectionOn(d)) return 'Motion detection is off — nothing reported';
    if (cat && (!has(d, 'sensitivity') || S(d, 'sensitivity') !== 'high')) return has(d, 'sensitivity') ? `The cat walks by — sensitivity ${S(d, 'sensitivity')} ignores small, low movements` : 'The cat walks by — too small for this sensor';
    if (st.restUntil > now) return `Movement — but the sensor is resting ${Math.ceil((st.restUntil - now) / 1000)} s more. Not reported (saves battery)`;
    const was = st.occ;
    st.occ = true; st.at = now; st.lastSeen = now; d.blinkAt = now;
    if (has(d, 'restTime')) st.restUntil = now + ms(d, S(d, 'restTime'));
    // "no motion" comes after the no-motion time; Aqara (rest time only): right after the rest time
    st.clearAt = has(d, 'clearTime') ? now + ms(d, S(d, 'clearTime')) : has(d, 'restTime') ? st.restUntil : now + ms(d, 60);
    if (has(d, 'light')) st.lux = roomLux(d);
    st.offAt = 0;
    if (!was) {
      logEv(d, cat ? 'cat' : 'motion');
      // the app's scenario: dark + motion → the chosen light on
      if (has(d, 'motionLight') && S(d, 'motionLight').on && targetOf(d) && !targetOf(d).on && roomLux(d) < S(d, 'motionLight').lux) {
        if (setTarget(d, true)) { st.lit = true; logEv(d, 'lightOn', { name: targetOf(d).name }); }
      }
      if (has(d, 'notify')) {
        const n = S(d, 'notify');
        if (n.on && (!n.armed || away())) notifyPush(d, `Motion · ${W(d)}`, away() ? 'Nobody should be home' : '', away() ? 'danger' : '');
      }
    }
    return '';
  }

  function tick(d) {
    const st = d.st, now = Date.now();
    let changed = false;
    // someone keeps walking: the sensor reports again as soon as it may
    if (d.phys.person === 'walking' && d.online && detectionOn(d) && st.restUntil <= now && (!st.occ || now - st.at > 2000)) { detect(d); changed = true; }
    if (st.occ && st.clearAt && now >= st.clearAt && st.restUntil <= now) {
      st.occ = false; st.clearAt = 0; logEv(d, 'clear'); changed = true;
      if (st.lit && has(d, 'motionLight') && S(d, 'motionLight').on) st.offAt = now + ms(d, S(d, 'motionLight').off * 60);
    }
    if (st.offAt && now >= st.offAt) {
      st.offAt = 0;
      if (!st.occ && st.lit) { const t = targetOf(d); if (setTarget(d, false)) logEv(d, 'lightOff', { name: t.name }); st.lit = false; changed = true; }
    }
    if (has(d, 'light') && !preset(d).dimBright) { const l = roomLux(d); if (l !== st.lux) { st.lux = l; changed = true; } }
    return changed;
  }

  /* ---------- Text ---------- */
  const startOfDay = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };
  const when = (t) => (t >= startOfDay() ? UI.fmtTime(t) : t >= startOfDay() - 86400000 ? 'yesterday ' + UI.fmtTime(t) : new Date(t).toLocaleDateString());
  const countToday = (d) => d.log.filter((e) => (e.k === 'motion' || e.k === 'cat') && e.t >= startOfDay()).length;
  const timesText = (n) => (n === 0 ? 'No motion today' : n === 1 ? 'Once today' : `${n} times today`);
  function subText(d) {
    const st = d.st, now = Date.now();
    if (!detectionOn(d)) return 'Detection is off';
    if (st.occ) {
      const left = Math.max(0, Math.ceil((st.clearAt - now) / 1000 * speed(d)));
      return has(d, 'clearTime') || !has(d, 'restTime') ? `Now · clears in ${UI.fmtDur(left)}` : 'Now';
    }
    return `Last motion ${when(st.at)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline' };
    if (d.st.tamper) return { text: 'Cover opened', tone: 'danger' };
    if (!detectionOn(d)) return { text: 'Detection off' };
    if (d.st.occ) return { text: 'Motion · now', tone: 'warn' };
    return { text: `No motion · ${when(d.st.at)}` };
  }
  function homeTiles(d) {
    const s = tileStatus(d);
    return [{ ch: 0, name: d.name, icon: 'dev-motion', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }];
  }

  /* ==========================================================================
     Device page
     ========================================================================== */
  /** The picture — "Fresnel dots": a PIR lens splits the room into a fan of zones; we draw them as dots on 9 rays ×
      6 rings. Idle: cool dots in the app's blue. Motion: the dots turn warm amber in a wave from the lens outwards,
      and on each report the warm dots breathe once, ring by ring (Apple-style: light colours, soft ease-out, no rings). Only opacity / transform animate (Safari-safe, no blur). */
  const BREATH = 1300;   // ms: the outer ring starts 350 ms late and breathes for 900 ms
  const RAYS = 9, RINGS = [40, 60, 82, 106, 132, 160], LX = 120, LY = 30;
  const DOTS = (() => {
    const out = [];
    RINGS.forEach((R, j) => { for (let i = 0; i < RAYS; i++) { const a = ((90 - 52 + (104 / (RAYS - 1)) * i) * Math.PI) / 180; out.push({ x: +(LX + R * Math.cos(a)).toFixed(1), y: +(LY + R * Math.sin(a)).toFixed(1), r: +(1.6 + j * 0.42).toFixed(2), j }); } });
    return out;
  })();
  /** A soft glow: an eased fall-off (many stops) — two stops draw a hard disc edge and band on dark screens. */
  const halo = (id, c, a) => `<radialGradient id="${id}">${[[0, 1], [0.12, 0.9], [0.25, 0.72], [0.4, 0.5], [0.55, 0.3], [0.7, 0.15], [0.84, 0.05], [0.94, 0.012], [1, 0]].map(([o, k]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${(a * k).toFixed(3)}"/>`).join('')}</radialGradient>`;
  function scene(d) {
    const st = d.st, rest = st.restUntil > Date.now();
    // 'blink' stays in the markup for the whole breath, so a re-render (the clock ticks every second) doesn't cut it short
    const cls = ['ct-card', 'mo-card', st.occ ? 'is-occ' : '', rest ? 'is-rest' : '', !detectionOn(d) ? 'is-disabled' : '', !d.online ? 'is-off' : '', st.tamper ? 'is-tamper' : '',
      Date.now() - d.blinkAt < BREATH ? 'blink' : '', has(d, 'led') && !S(d, 'led') ? 'led-off' : ''].join(' ');
    const dots = (c) => DOTS.map((o) => `<circle class="${c} j${o.j}" cx="${o.x}" cy="${o.y}" r="${o.r}"/>`).join('');
    return `<div class="${cls}" data-cl="scene" role="img" aria-label="${esc(W(d))}: ${st.occ ? 'motion' : 'no motion'}">
      <svg class="mo-svg" viewBox="0 0 240 210" aria-hidden="true">
        <defs>${halo('mo-halo-c', '#6fb3ff', 0.11)}${halo('mo-halo-w', '#ffd59a', 0.16)}
          <radialGradient id="mo-pearl" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#e3e8ee"/><stop offset="1" stop-color="#b9c2cd"/></radialGradient></defs>
        <circle class="mo-halo cool" cx="${LX}" cy="${LY}" r="104" fill="url(#mo-halo-c)"/><circle class="mo-halo warm" cx="${LX}" cy="${LY}" r="118" fill="url(#mo-halo-w)"/>
        <g class="mo-dots">${dots('mo-d')}</g><g class="mo-hot">${dots('mo-h')}</g>
        <circle class="mo-lens" cx="${LX}" cy="${LY}" r="15" fill="url(#mo-pearl)"/><circle class="mo-led" cx="${LX}" cy="${LY + 9}" r="1.8"/>
      </svg></div>`;
  }

  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += `<div class="pad cw-gap" data-key="ban-off"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · No report since ${when(st.lastSeen)}. Check the battery.</div></div></div>`;
    if (st.tamper) h += `<div class="pad cw-gap" data-key="ban-tamper"><div class="banner danger">${icon('banner-error')}<div><b>Cover opened.</b> Someone opened the sensor or took it off the wall</div></div></div>`;
    if (!detectionOn(d)) h += `<div class="pad cw-gap" data-key="ban-pir"><div class="banner info">${icon('round-info')}<div><b>Motion detection is off</b> · Light and temperature still work</div></div></div>`;
    if (battLow(d)) h += `<div class="pad cw-gap" data-key="ban-batt"><div class="banner warn">${icon('battery')}<div><b>Battery low · ${d.battery} %</b></div></div></div>`;

    h += `<div class="pad" data-key="scene">${scene(d)}</div>`;
    const tone = !d.online || !detectionOn(d) ? '' : st.occ ? 'open' : 'closed';
    h += `<div class="cw-readout ct-readout" data-key="readout"><div><div class="ct-word ${tone}" data-cl="word" data-swap>${!d.online ? 'Unknown' : st.occ ? 'Motion' : 'No motion'}</div>
        <div class="cw-state" data-num data-live="sub">${subText(d)}</div></div>
        ${has(d, 'history') ? `<span class="cw-hint" data-num data-live="times">${timesText(countToday(d))}</span>` : ''}</div>`;

    const cards = [];
    if (has(d, 'climate')) cards.push(`<div class="info-card"><span>Temperature</span><b data-num="count">${d.temp.toFixed(1)} °C</b></div>`, `<div class="info-card"><span>Humidity</span><b data-num="count">${d.hum} %</b></div>`);
    if (has(d, 'light')) cards.push(`<div class="info-card wide"><span>Light level${preset(d).dimBright ? ' · at the last motion' : ''}</span><b data-num="count">${luxText(d)}</b>${icon('sun')}</div>`);
    // "Lights on motion" is a scenario of our app, not a sensor reading — it stays in Settings → Automation (spec)
    if (has(d, 'battery')) cards.push(`<div class="info-card wide"><span>${battLow(d) ? 'Battery · replace it soon' : 'Battery'}</span><b data-num="count">${d.battery} %</b>${icon('battery')}</div>`);
    if (cards.length) h += `<div class="pad info-grid" data-key="info" style="margin-top:24px">${cards.join('')}</div>`;
    return h + '<div style="height:28px"></div>';
  }

  function live(d, root) {
    UI.setNum(root.querySelector('[data-live="sub"]'), subText(d));
    UI.setNum(root.querySelector('[data-live="times"]'), timesText(countToday(d)));
    const card = root.querySelector('.mo-card'); if (card) card.classList.toggle('is-rest', d.st.restUntil > Date.now());
    afterRender(d, root);
  }
  const seen = { blink: 0, t: 0 };
  function afterRender(d, root) {
    const card = root.querySelector('.mo-card'); if (!card) return;
    if (d.blinkAt > seen.blink) {
      seen.blink = d.blinkAt;
      if (Date.now() - d.blinkAt < BREATH) {   // restart the breath (not UI.pulse: the first ring's animationend would stop the outer rings)
        card.classList.remove('blink'); void card.getBoundingClientRect(); card.classList.add('blink');
        clearTimeout(seen.t); seen.t = setTimeout(() => card.classList.remove('blink'), BREATH);
      }
    }
  }
  function bindPage(d) { seen.blink = d.blinkAt; }

  /* ==========================================================================
     Settings
     ========================================================================== */
  const row = (k, title, value, act = 'mo-feature') => `<button class="cell" data-action="${act}" data-k="${k}"><span class="cell-main cell-title">${esc(title)}</span>${value ? `<span class="cell-value">${esc(value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
  const sw = (act, key, title, sub, on, dis) => `<button class="cell" data-action="${act}" data-n="${key}" role="switch" aria-checked="${on}" ${dis ? 'aria-disabled="true"' : ''}>
      <span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>
      <span class="switch" aria-hidden="true" aria-checked="${on}" ${dis ? 'style="opacity:.4"' : ''}></span></button>`;
  function summary(d, k) {
    const v = S(d, k);
    if (k === 'clearTime' || k === 'restTime') return secText(v);
    if (k === 'sensitivity') return F.sensitivity.opts.find((o) => o[0] === v)[1];
    if (k === 'motionLight') { const t = targetOf(d); return !v.on ? 'Off' : t ? t.name : 'Choose a light'; }
    if (k === 'direct') return 'Bound bulbs';
    return '';
  }

  function settings(d) {
    let h = '';
    const det = [];
    if (has(d, 'pirEnable')) det.push(sw('mo-sw', 'pirEnable', 'Motion detection', 'Off: light and temperature keep working', S(d, 'pirEnable')));
    ['clearTime', 'restTime', 'sensitivity'].forEach((k) => { if (has(d, k)) det.push(row(k, F[k].name, summary(d, k))); });
    if (det.length) h += `<div class="list-header">Detection</div><div class="list">${det.join('')}</div>`;
    const sen = [];
    if (has(d, 'led')) sen.push(sw('mo-sw', 'led', 'Light on the sensor', 'Blinks on motion', S(d, 'led')));
    if (has(d, 'output')) sen.push(sw('mo-sw', 'output', 'Built-in light', 'Switched by the sensor itself', S(d, 'output')));
    if (has(d, 'direct')) sen.push(row('direct', F.direct.name, summary(d, 'direct')));
    if (sen.length) h += `<div class="list-header">Sensor</div><div class="list">${sen.join('')}</div>`;
    if (has(d, 'notify')) {
      const n = S(d, 'notify');
      h += `<div class="list-header">Notifications</div><div class="list">${sw('mo-nt', 'on', 'When there is motion', '', n.on)}${sw('mo-nt', 'armed', 'Only when nobody is home', 'Uses the home’s Away mode', n.armed, !n.on)}${has(d, 'tamper') ? sw('mo-nt', 'tamper', 'When the cover is opened', '', n.tamper) : ''}</div>
        <div class="list-footer">A hallway sees about 100 movements a day — that is why “only when nobody is home” is on.</div>`;
    }
    if (has(d, 'motionLight')) h += `<div class="list-header">Automation</div><div class="list">${row('motionLight', F.motionLight.name, summary(d, 'motionLight'))}</div><div class="list-footer">A scenario in our app — the hub runs it with this sensor’s motion and light level.</div>`;
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
        if (k === 'clearTime' || k === 'sensitivity') return `<div class="list">${radio('mo-opt', v, optsOf(d, k))}</div>${k === 'clearTime' && preset(d).steps ? '<div class="list-footer">This sensor only offers these steps.</div>' : ''}`;
        if (k === 'restTime') {
          if (fixed(d, k)) return `<div class="list"><div class="cell"><span class="cell-main cell-title">Rest time</span><span class="cell-value">${secText(v)}</span></div></div><div class="list-footer">Fixed on this model. The newer Aqara P1 lets you change it.</div>`;
          return `<div class="list">${radio('mo-opt', v, f.opts)}</div><div class="list-footer">On Aqara sensors “no motion” is reported when the rest time ends.</div>`;
        }
        if (k === 'direct') return `<div class="list"><div class="cell"><span class="cell-main cell-title">Bound bulbs</span><span class="cell-value">Set in the sensor</span></div></div><div class="list-footer">The sensor sends on / off to bulbs bound to it, even when the hub is offline. In our app, use “Lights on motion” instead — it can check the light level and pick any light.</div>`;
        if (k === 'motionLight') {
          const ts = targets(), cur = v.target ? `${v.target.id}:${v.target.ch}` : '';
          const list = ts.length ? ts.map((t) => `<button class="option" role="radio" aria-checked="${cur === `${t.id}:${t.ch}`}" data-action="mo-target" data-v="${t.id}:${t.ch}"><span class="cell-icon" style="color:var(--label-secondary)">${icon(t.icon)}</span><span class="option-main"><span class="option-title" style="display:block">${esc(t.name)}</span><span class="option-sub" style="display:block">${esc(t.room)}</span></span><span class="radio">${icon('radio-on')}</span></button>`).join('')
            : '<div class="cell"><span class="cell-main cell-sub">No lights or relays in this home yet</span></div>';
          return `<div class="list"><button class="cell" data-action="mo-ml-tog"><span class="cell-main cell-title">Turn a light on with motion</span><span class="switch" role="switch" aria-checked="${v.on}"></span></button></div>`
            + UI.collapse(v.on, UI.group('Light', list)
              + UI.group('When', `<div class="cell"><span class="cell-main cell-title">Only when darker than</span>${stepper('mo-lux', v.lux, 'lx', 0, 1000)}</div><div class="cell"><span class="cell-main cell-title">Off after no motion for</span>${stepper('mo-off', v.off, 'min', 1, 60)}</div>`))
            + '<div class="list-footer">Night is about 10 lx, a lit room about 200 lx, daylight 300 lx and more.</div>';
        }
        return '';
      },
    });
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    UI.on({
      'mo-opt': ({ v }) => { d.settings[k] = k === 'sensitivity' ? v : +v; commit(); },
      'mo-ml-tog': () => { S(d, k).on = !S(d, k).on; commit(); },
      'mo-target': ({ v }) => { const [id, ch] = v.split(':'); S(d, k).target = { id, ch: +ch }; commit(); },
      'mo-lux': ({ d: dir }) => { const v = S(d, k), st = v.lux < 100 ? 10 : 50; v.lux = Math.max(0, Math.min(1000, v.lux + st * dir)); commit(); },
      'mo-off': ({ d: dir }) => { const v = S(d, k); v.off = Math.max(1, Math.min(60, v.off + (v.off < 5 ? 1 : 5) * dir)); commit(); },
    });
  }

  /* ---------- Event history (Settings → Event History) ---------- */
  const EV = { motion: 'Motion', cat: 'Motion (small)', clear: 'No motion', lightOn: 'Light on', lightOff: 'Light off', tamper: 'Cover opened', cover: 'Cover closed', battery: 'Battery low' };
  function strip(d) {
    const t0 = startOfDay(), now = Date.now(), span = 86400000;
    const evs = d.log.filter((e) => e.t >= t0 && ['motion', 'cat', 'clear'].includes(e.k)).slice().reverse();
    const before = d.log.find((e) => e.t < t0 && ['motion', 'cat', 'clear'].includes(e.k));
    let a = before && before.k !== 'clear' ? t0 : null; const segs = [];
    for (const e of evs) { if (e.k !== 'clear') { if (a === null) a = e.t; } else if (a !== null) { segs.push([a, e.t]); a = null; } }
    if (a !== null) segs.push([a, now]);
    const pct = (t) => ((t - t0) / span) * 100;
    return `<div class="ct-strip mo-strip"><div class="bar">${segs.map(([x, z]) => `<i style="left:${pct(x).toFixed(2)}%;width:max(3px,${(pct(z) - pct(x)).toFixed(2)}%)"></i>`).join('')}<b style="left:${pct(now).toFixed(2)}%"></b></div>
      <div class="axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>${Kit.stripLegend('Motion')}</div>`;
  }
  function openHistory(d) {
    UI.sheet({
      title: 'Event History',
      render: () => {
        const rows = d.log.slice(0, 24).map((e) => `<div class="cell"><span class="cell-main cell-title">${esc(EV[e.k] || e.k)}${e.name ? ` · ${esc(e.name)}` : ''}</span><span class="cell-value">${when(e.t)}</span></div>`).join('');
        return UI.group('Today', `<div class="group-pad">${strip(d)}</div>`) + UI.group('Events', rows || '<div class="cell"><span class="cell-main cell-sub">Nothing yet</span></div>')
          + '<div class="list-footer">Stored by our server. The sensor itself only knows “motion” or “no motion” right now.</div>';
      },
    });
  }

  function bindSettings(d, ctx) {
    UI.on({
      'mo-feature': ({ k }) => openFeature(d, k, ctx),
      'mo-sw': ({ n }) => { d.settings[n] = !S(d, n); if (n === 'pirEnable' && !S(d, n)) { d.st.occ = false; d.st.clearAt = 0; } Store.save(); ctx.render(); },
      'mo-nt': ({ n }) => {
        const v = S(d, 'notify');
        if (n === 'armed' && !v.on) { UI.toast('Turn on “When there is motion” first'); return; }
        v[n] = !v[n]; Store.save(); ctx.render();
      },
      'rs-history': () => openHistory(d),
      'rs-identify': () => {
        if (!d.online) return UI.toast('The sensor is offline');
        d.blinkAt = Date.now(); Store.save();
        UI.toast('The sensor blinks. Asleep? Press its button first');
      },
    });
  }

  function about(d) {
    const rows = [['Reported state', d.st.occ ? 'Motion' : 'No motion'], ['Last motion', when(d.st.at)]];
    if (has(d, 'battery')) rows.push(['Battery', `${d.battery} % · ${(2.6 + d.battery / 250).toFixed(2)} V`]);
    if (has(d, 'tamper')) rows.push(['Cover', d.st.tamper ? 'Opened' : 'Closed']);
    return rows;
  }

  /* ==========================================================================
     Prototype panel — the real room
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    const ph = d.phys, rest = Math.max(0, Math.ceil((d.st.restUntil - Date.now()) / 1000));
    const who = { none: 'nobody', walking: 'someone walking', sitting: 'someone sitting still' }[ph.person];
    return `<div class="pp-title">Motion sensor prototype</div>
      <p class="pp-note">Not part of the app. Change what this sensor supports and play the room. Spec: <a href="../Device%20Interface%203/6.%20Motion_Sensor_Interface.html" target="_blank">Motion_Sensor_Interface</a></p>
      <h3>Real sensor</h3>
      <select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      <h3>The room · <span style="font-weight:400">${who}${rest ? ` · sensor resting ${rest} s` : ''}</span></h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-walk">🚶 Walk in</button><button class="pp-btn" data-action="pp-sit">🪑 Sit still</button><button class="pp-btn" data-action="pp-leave">🚪 Leave</button></div>
      <div class="pp-row"><button class="pp-btn" data-action="pp-cat">🐈 Cat walks by</button><button class="pp-btn" data-action="pp-day">${ph.day ? '☀️ Day · 320 lx' : '🌙 Night · 8 lx'}</button></div>
      <h3>The sensor</h3>
      <div class="pp-row">${has(d, 'tamper') ? `<button class="pp-btn" data-action="pp-tamper">${d.st.tamper ? '🔧 Close the cover' : '🪛 Open the cover'}</button>` : ''}
        ${has(d, 'battery') ? `<button class="pp-btn" data-action="pp-batt">🔋 ${battLow(d) ? 'New battery' : 'Battery low'}</button>` : ''}
        <button class="pp-btn" data-action="pp-online">${d.online ? '📴 Stops reporting' : '📶 Reports again'}</button></div>
      <h3>Home</h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-away">${away() ? '🛡 Away (nobody home)' : '🏠 Someone is home'}</button>
        <button class="pp-btn" data-action="pp-fast">${d.sim.fast ? '⏩ Demo ×10' : '⏱ Real time'}</button></div>
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
        const p = PRESETS.find((x) => x.id === t.value), target = S(d, 'motionLight') && S(d, 'motionLight').target;
        Object.assign(d, { preset: p.id, model: p.model, manufacturer: p.manufacturer, originalName: p.name, features: p.feats.slice(), settings: {} });
        if (p.v) Object.assign(d.settings, clone(p.v));
        applyDefaults(d); if (target) d.settings.motionLight.target = target;
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); applyDefaults(d); }
      commit();
    };
    UI.on({
      'pp-walk': () => { d.phys.person = 'walking'; commit(detect(d)); },
      'pp-sit': () => {
        d.phys.person = 'sitting'; const m = detect(d);
        commit(m || 'Sitting still — the PIR will report “no motion” soon, although someone is there. A presence sensor would see them');
      },
      'pp-leave': () => { d.phys.person = 'none'; commit('Gone — the sensor waits for its no-motion time'); },
      'pp-cat': () => { const m = detect(d, true); commit(m || 'The cat crossed the beams — high sensitivity reports it'); },
      'pp-day': () => { d.phys.day = !d.phys.day; if (has(d, 'light') && !preset(d).dimBright) d.st.lux = roomLux(d); commit(); },
      'pp-tamper': () => {
        d.st.tamper = !d.st.tamper; d.blinkAt = Date.now(); logEv(d, d.st.tamper ? 'tamper' : 'cover');
        if (d.st.tamper && has(d, 'notify') && S(d, 'notify').tamper) notifyPush(d, 'Sensor tampered', `${W(d)}: the cover was opened`, 'danger');
        commit();
      },
      'pp-batt': () => {
        d.battery = battLow(d) ? 100 : 12;
        if (battLow(d)) { logEv(d, 'battery'); notifyPush(d, 'Battery low', `${W(d)} · ${d.battery} %`, 'warn'); }
        commit();
      },
      'pp-online': () => { d.online = !d.online; if (d.online) d.st.lastSeen = Date.now(); commit(); },
      'pp-away': () => { Store.state.away = !away(); commit(away() ? 'Home set to Away — motion now sends a notification' : 'Someone is home'); },
      'pp-fast': () => { d.sim.fast = !d.sim.fast; commit(); },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Motion sensor', F, PRESETS, create, applyDefaults,
    icon: () => 'dev-motion',
    describe: (p) => `${p.manufacturer} · motion sensor`,
    historyValue: (d) => (has(d, 'history') ? `${countToday(d)} today` : null),
    homeTiles, page, bindPage, live, afterRender, settings, bindSettings, about, tick,
    busy: (d) => d.st.occ || d.st.restUntil > Date.now() || !!d.st.offAt,
    protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
    _detect: detect,   // used by tools/checks
  };
})();
