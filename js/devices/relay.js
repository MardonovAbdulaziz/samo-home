/* ==========================================================================
   Relay device interface
   Source: "Device Interface 3 / 2. Relay_Interface.html"
   (features from zigbee2mqtt, 796 switch & relay devices)
   Rule: show a control only if the paired relay has that feature.
   ========================================================================== */
Devices.relay = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    onoff: { name: 'On / off', grp: 'Device page', ic: 'power', type: 'control', perCh: true, short: 'Turn it on or off.' },
    timer: { name: 'Timer', grp: 'Device page', ic: 'clock', type: 'control', perCh: true, short: 'Turns off once, after the time you pick.' },
    power: { name: 'Power & energy', grp: 'Device page', ic: 'bolt', type: 'reading', short: 'Electricity used.' },
    allOnOff: { name: 'All on / all off', grp: 'Device page', ic: 'double-check', type: 'control', short: 'All channels at once.' },
    events: { name: 'Button presses', grp: 'Device page', ic: 'hand-stop', type: 'event', short: 'Presses on the wall button.' },

    powerOn: { name: 'After a power cut', grp: 'Power cut', ic: 'bolt-crossed', type: 'choice', perCh: true, def: 'previous',
      opts: [['off', 'Stay off', 'Safer for heaters'], ['on', 'Turn on', ''], ['previous', 'Last state', 'Recommended'], ['toggle', 'Opposite', '']],
      short: 'When power comes back.' },
    delayedOn: { name: 'Delay after power returns', grp: 'Power cut', ic: 'hourglass', type: 'number', unit: 's', def: 5, min: 0, max: 3599.5, step: 0.5,
      short: 'Wait before switching on after a power cut.' },

    switchType: { name: 'Wall switch type', grp: 'Wall switch', ic: 'filter', type: 'choice', perCh: true, def: 'toggle',
      opts: [['toggle', 'Rocker', 'Every flip switches'], ['state', 'Rocker, fixed', 'Up is on, down is off'], ['momentary', 'Push button', 'Springs back'], ['none', 'None', 'App only']],
      short: 'The wall switch wired to the relay.' },
    decoupled: { name: 'What the wall switch does', grp: 'Wall switch', ic: 'external-link', type: 'choice', perCh: true, def: 'control_relay',
      opts: [['control_relay', 'Switch power', ''], ['decoupled', 'Signal only', 'For smart bulbs']],
      short: 'Cut the power, or only tell the app.' },
    clickMode: { name: 'Button response', grp: 'Wall switch', ic: 'double-check', type: 'choice', def: 'fast',
      opts: [['fast', 'Fast', 'Single press only'], ['multi', 'Single, double, hold', 'A little slower']],
      short: 'Speed or more press types.' },
    childLock: { name: 'Child lock', grp: 'Wall switch', ic: 'lock', type: 'toggle', def: false,
      short: 'Device buttons stop working.' },

    outputMode: { name: 'Output type', grp: 'Output', ic: 'arrow-fork', type: 'choice', def: 'power',
      opts: [['power', '230 V power', ''], ['dry', 'Dry contact', 'Boiler, gate, intercom'], ['pulse', 'Short pulse', 'Like a button press']],
      short: 'Power, or just close a contact.' },
    inching: { name: 'Auto-off', grp: 'Output', ic: 'refresh', type: 'inch', perCh: true, def: { on: false, sec: 3 },
      short: 'Turns off by itself every time.' },
    interlock: { name: 'Interlock', grp: 'Output', ic: 'arrows-down-up', type: 'toggle', def: true, showSub: true,
      short: 'Only one channel on at a time.' },

    indicator: { name: 'Status light', grp: 'Lights on the device', ic: 'eye', type: 'choice', def: 'on_when_on',
      opts: [['off', 'Off', ''], ['on_when_on', 'With the light', ''], ['on_when_off', 'In the dark', 'Find the switch at night'], ['always', 'Always on', '']],
      short: 'The small light on the device.' },
    backlight: { name: 'Button backlight', grp: 'Lights on the device', ic: 'sun', type: 'backlight', def: { on: true, br: 70 },
      short: 'Lights up the buttons.' },
    ledColor: { name: 'Light colours', grp: 'Lights on the device', ic: 'sun-fill', type: 'color', def: { on: 'green', off: 'blue' },
      short: 'Button colour when on and off.' },
    nightLed: { name: 'Lights off at night', grp: 'Lights on the device', ic: 'moon', type: 'toggle', def: true,
      short: 'Device lights go dark at night.' },

    antiFlicker: { name: 'Bulb flicker fix', grp: 'Bulb', ic: 'sunrise', type: 'choice', def: 'anti_flicker',
      opts: [['anti_flicker', 'Anti-flicker', ''], ['quick', 'Fast response', '']],
      short: 'Stops LED bulbs flickering.' },

    protection: { name: 'Protection', grp: 'Safety', ic: 'shield-check', type: 'protect', def: { overV: 250, underV: 180, overI: 16, overP: 3500, temp: 80, act: 'trip', reclose: true },
      short: 'Cuts power when something is unsafe.' },

    identify: { name: 'Find this device', grp: 'Device', ic: 'my-location', type: 'action', short: 'Blinks the device.' },
    deviceTemp: { name: 'Device temperature', grp: 'Device', ic: 'temperature', type: 'reading', short: 'Temperature inside the relay. Too hot means overload or bad wiring.' },
    outageCount: { name: 'Power cuts counted', grp: 'Device', ic: 'bolt-crossed', type: 'reading', short: 'How many times the device has lost power.' },
  };
  for (const k in F) F[k].short = F[k].short.replace(/\.$/, '');
  const SETTINGS_GROUPS = ['Power cut', 'Wall switch', 'Output', 'Lights on the device', 'Bulb', 'Safety'];
  /** Settings page cards (Figma 6142:74752): [heading, groups]. Empty heading = card without a title. */
  const SETTINGS_CARDS = [['Power cut', ['Power cut']], ['Wall switch', ['Wall switch']], ['Output', ['Output']], ['Lights on the device', ['Lights on the device']], ['', ['Bulb', 'Safety']]];
  const ALL_GROUPS = ['Device page', ...SETTINGS_GROUPS, 'Device'];

  const PRESETS = [
    { id: 'tuya1', name: 'Tuya 1-channel relay', model: 'TS0001_switch_module', manufacturer: 'Tuya', ch: 1, names: ['Ceiling light'], feats: ['onoff', 'timer', 'powerOn', 'switchType', 'indicator'] },
    { id: 'tuya2', name: 'Tuya 2-channel relay', model: 'TS0002', manufacturer: 'Tuya', ch: 2, names: ['Ceiling', 'Hall'], feats: ['onoff', 'timer', 'inching', 'powerOn', 'switchType', 'indicator', 'childLock'] },
    { id: 'aqara', name: 'Aqara T2 dual relay', model: 'LLKZMK12LM', manufacturer: 'Aqara', ch: 2, names: ['Light', 'Boiler'], feats: ['onoff', 'power', 'events', 'powerOn', 'switchType', 'decoupled', 'outputMode', 'interlock', 'nightLed', 'deviceTemp'] },
    { id: 'touch3', name: 'Touch wall switch, 3-gang', model: 'TS0003', manufacturer: 'Tuya', ch: 3, names: ['Left', 'Center', 'Right'], feats: ['onoff', 'timer', 'powerOn', 'backlight', 'indicator', 'ledColor', 'childLock', 'events', 'allOnOff', 'identify'] },
    { id: 'din', name: 'DIN breaker with protection', model: 'TS011F_din_smart_relay', manufacturer: 'Tuya', ch: 1, names: ['Water heater'], feats: ['onoff', 'timer', 'power', 'powerOn', 'delayedOn', 'indicator', 'childLock', 'protection', 'deviceTemp', 'outageCount'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', ch: 2, names: ['Light 1', 'Light 2'], feats: Object.keys(F) },
  ];
  const COLORS = { red: '#ff3a3a', orange: '#ff7c0a', yellow: '#ffd60a', green: '#30d158', blue: '#0a84ff', purple: '#9508ec', pink: '#ff37ac', white: '#fffdf5' };
  const OLD_COLOR = { cyan: 'blue', magenta: 'pink', cold_white: 'white', warm_yellow: 'yellow' };   // saved before the Figma palette
  const DISPLAY = [['light', 'Light', 'dev-bulb', 60, 'Lighting'], ['socket', 'Socket', 'dev-socket', 120, 'Sockets'], ['heater', 'Heater / boiler', 'dev-radiator', 1800, 'Heating'], ['fan', 'Fan', 'dev-fan', 40, 'Air'], ['pump', 'Water pump', 'dev-drop', 750, 'Water'], ['gate', 'Gate / door', 'dev-gate', 15, 'Gates & doors'], ['switch', 'Other device', 'dev-socket', 25, 'Appliances']];
  const PICK_DISPLAY = DISPLAY.filter((x) => x[0] !== 'pump');   // Figma "Display as" list (old pump channels still show)
  const displayOf = (k) => DISPLAY.find((x) => x[0] === k) || DISPLAY[0];
  /* Icons the user can pick for each "Display as" type (Figma Icons page). First = default. */
  const ICON_SETS = {
    light: ['dev-bulb', 'dev-lamp', 'dev-lamp-02', 'dev-wall-lamp', 'dev-study-lamp', 'dev-chandelier-01', 'dev-chandelier-02', 'dev-square-led', 'dev-round-led'],
    socket: ['dev-socket', 'dev-socket-2'],
    heater: ['dev-radiator', 'dev-radiator-mini', 'dev-thermostat', 'dev-kettle', 'dev-iron', 'dev-oven'],
    fan: ['dev-fan', 'dev-air', 'dev-purifier', 'dev-ac'],
    pump: ['dev-drop'],
    gate: ['dev-gate', 'dev-garage', 'dev-door-02', 'dev-door-open', 'dev-barrier', 'dev-barrier-2', 'dev-curtains'],
    switch: ['dev-socket', 'dev-socket-2', 'dev-fridge', 'dev-microwave', 'dev-kettle', 'dev-washing', 'dev-dishwasher', 'dev-vacuum', 'dev-oven', 'dev-iron'],
  };
  const iconSet = (display) => ICON_SETS[display] || ICON_SETS.light;
  /** On-state icon color: lights glow yellow, every other device type is blue. */
  const accent = (display) => (display === 'light' ? 'var(--yellow)' : 'var(--primary)');
  /** A channel's icon: the one the user picked (if it belongs to its Display-as type), else the type default. */
  const chIcon = (c) => (c.icon && iconSet(c.display).includes(c.icon) ? c.icon : iconSet(c.display)[0]);
  const CH_COUNTS = [1, 2, 3, 4, 6];

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x);
  const has = (d, k) => d.features.includes(k);
  const multi = (d) => d.channels.length > 1;
  /* Grouped channels: a multi-channel relay that works and looks like ONE device (one tile, one button). */
  const grouped = (d) => multi(d) && !!d.grouped;
  /** Channels shown separately (tiles, channel chips, per-channel summaries). */
  const split = (d) => multi(d) && !d.grouped;
  const interlockOn = (d) => has(d, 'interlock') && !!d.settings.interlock;
  const get = (d, k, c = 0) => (F[k].perCh ? d.settings[k][c] : d.settings[k]);
  const set = (d, k, c, v) => { if (F[k].perCh) d.settings[k][c] = v; else d.settings[k] = v; };

  function applyDefaults(d) {
    for (const k in F) {
      const def = F[k].def; if (def === undefined) continue;
      if (F[k].perCh) {
        const arr = Array.isArray(d.settings[k]) ? d.settings[k] : [];
        d.settings[k] = d.channels.map((_, i) => (arr[i] !== undefined ? arr[i] : clone(def)));
      } else if (d.settings[k] === undefined) d.settings[k] = clone(def);
    }
    const lc = d.settings.ledColor; if (lc) ['on', 'off'].forEach((w) => { if (!COLORS[lc[w]]) lc[w] = OLD_COLOR[lc[w]] || (w === 'on' ? 'green' : 'blue'); });
  }
  function setChannelCount(d, n) {
    while (d.channels.length < n) d.channels.push({ name: 'Light ' + (d.channels.length + 1), on: false, display: 'light', timer: null });
    d.channels.length = n;
    applyDefaults(d);
  }

  function create(presetId, { name, roomId, channelNames } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const names = channelNames || p.names;
    const d = {
      id: Store.uid('d'), type: 'relay', preset: p.id, name: name || p.name, roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'LX', mac: Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '1.0.8_0012', online: true, showOnHome: true, isNew: true, createdAt: Date.now(),
      features: p.feats.slice(),
      channels: Array.from({ length: p.ch }, (_, i) => ({ name: names[i] || 'Light ' + (i + 1), on: false, display: /boiler|heater/i.test(names[i] || '') ? 'heater' : 'light', timer: null })),
      settings: {}, events: [], energy: 12.48, outages: 0, temp: 38, wait: null,
    };
    applyDefaults(d);
    return d;
  }

  /* ---------- Behaviour ---------- */
  const chLabel = (d, i) => (split(d) ? d.channels[i].name : d.name);
  /** Icon/Display-as holder: the group (grouped), else channel 0 (1-channel relay). */
  function groupTarget(d) {
    if (!grouped(d)) return d.channels[0];
    if (!d.group) d.group = { display: d.channels[0].display, icon: chIcon(d.channels[0]) };
    return d.group;
  }
  const anyOn = (d) => d.channels.some((c) => c.on);
  /** Grouped: one press switches every channel. Any channel on → all off; all off → all on. */
  function setAll(d, on) {
    if (!d.online) return 'Relay is offline';
    d.channels.forEach((_, i) => setChannel(d, i, on));
    return `${d.name} ${on ? 'on' : 'off'}`;
  }
  function groupStatus(d) {
    if (!d.online) return 'Offline';
    const n = d.channels.filter((c) => c.on).length, t = d.channels.find((c) => c.timer);
    if (t) return `${n ? 'On' : 'Off'} · off in ${UI.fmtDur((t.timer.end - Date.now()) / 1000)}`;
    if (n === 0) return 'Off';
    return n === d.channels.length ? 'On' : `${n} of ${d.channels.length} on`;
  }
  function logEvent(d, action, ch) { d.events.unshift({ action, ch, t: Date.now() }); d.events.length = Math.min(d.events.length, 20); }

  /** Turn one channel on/off. Applies interlock and auto-off. Returns a short message or null. */
  function setChannel(d, i, on) {
    if (!d.online) return 'Relay is offline';
    const c = d.channels[i];
    let note = '';
    if (on && has(d, 'interlock') && get(d, 'interlock') && multi(d)) {
      d.channels.forEach((o, j) => { if (j !== i && o.on) { o.on = false; o.timer = null; note = ' · interlock turned the other channel off'; } });
    }
    c.on = on; c.timer = null;
    if (on && has(d, 'inching') && get(d, 'inching', i).on) c.timer = { end: Date.now() + get(d, 'inching', i).sec * 1000, kind: 'inch' };
    if (on && has(d, 'outputMode') && get(d, 'outputMode') === 'pulse') c.timer = { end: Date.now() + 1000, kind: 'inch' };
    return `${chLabel(d, i)} ${on ? 'on' : 'off'}${note}`;
  }
  const toggle = (d, i) => (i < 0 ? setAll(d, !anyOn(d)) : setChannel(d, i, !d.channels[i].on));

  function startTimer(d, i, sec) {
    if (!d.online) return 'Relay is offline';
    const idx = grouped(d) ? d.channels.map((_, j) => j) : [i];
    idx.forEach((j) => { setChannel(d, j, true); d.channels[j].timer = { end: Date.now() + sec * 1000, kind: 'timer', total: sec }; });
    return `${chLabel(d, i)} turns off in ${UI.fmtDur(sec)}`;
  }

  function powerCut(d) {
    d.channels.forEach((c) => { c.before = c.on; c.on = false; c.timer = null; });
    d.online = false; d.wait = null; d.outages++;
  }
  function powerRestore(d) {
    d.online = true;
    const delay = has(d, 'delayedOn') ? get(d, 'delayedOn') : 0;
    if (delay > 0) d.wait = { until: Date.now() + delay * 1000 };
    else applyPowerOn(d);
  }
  function applyPowerOn(d) {
    d.wait = null;
    d.channels.forEach((c, i) => {
      const mode = has(d, 'powerOn') ? get(d, 'powerOn', i) : 'off';
      const on = mode === 'on' ? true : mode === 'off' ? false : mode === 'previous' ? !!c.before : !c.before;
      if (on) setChannel(d, i, true); else c.on = false;
    });
  }

  /** Simulated press on the physical wall switch / device button. */
  function wallPress(d, i, action = 'single') {
    if (!d.online) return 'No power — the relay is offline';
    if (has(d, 'childLock') && get(d, 'childLock')) return 'Child lock is on — button ignored';
    if (has(d, 'switchType') && get(d, 'switchType', i) === 'none') return 'No wall switch is connected';
    if (action !== 'single' && has(d, 'clickMode') && get(d, 'clickMode') === 'fast') action = 'single';
    if (has(d, 'events')) logEvent(d, action, i);
    const decoupled = has(d, 'decoupled') && get(d, 'decoupled', i) === 'decoupled';
    if (decoupled) return `Press sent to the app (${action}) — power stays on`;
    if (action === 'single') return 'Wall switch → ' + toggle(d, i);
    return `${action[0].toUpperCase() + action.slice(1)} press → can start a scene`;
  }

  function tick(d) {
    let changed = false; const now = Date.now();
    d.channels.forEach((c) => { if (c.timer && c.timer.end <= now) { c.on = false; c.timer = null; changed = true; } });
    if (d.wait && d.wait.until <= now) { applyPowerOn(d); changed = true; }
    if (has(d, 'power')) d.energy += watts(d) / 3600 / 1000;
    return changed;
  }

  const watts = (d) => {
    if (!d.online) return 0;
    const dry = has(d, 'outputMode') && get(d, 'outputMode') !== 'power';
    return d.channels.reduce((a, c) => a + (c.on && !dry ? displayOf(c.display)[3] : 0), 0.4);
  };

  /* ---------- Text helpers ---------- */
  function valText(d, k, c = 0) {
    const f = F[k], v = get(d, k, c);
    if (f.type === 'choice') return (f.opts.find((o) => o[0] === v) || ['', ''])[1];
    if (f.type === 'toggle') return v ? 'On' : 'Off';
    if (f.type === 'number') return v + ' ' + f.unit;
    if (f.type === 'inch') return v.on ? `${v.sec} s` : 'Off';
    if (f.type === 'backlight') return v.on ? `${v.br}%` : 'Off';
    if (f.type === 'color') return `${v.on.replace('_', ' ')} / ${v.off.replace('_', ' ')}`;
    if (f.type === 'protect') return { trip: 'Cut power', alarm: 'Alert only', ignore: 'Ignore' }[v.act];
    return '';
  }
  /** One-line summary of a per-channel setting for list rows.
      Not per channel → value next to the chevron. Per channel → no value; only a short subtitle when channels differ. */
  function summary(d, k) {
    if (!F[k].perCh || !split(d)) return { value: valText(d, k) };
    const vals = d.channels.map((_, i) => valText(d, k, i));
    // Per-channel settings: nothing next to the chevron — values live inside the sheet, per channel tab.
    if (vals.every((v) => v === vals[0])) return {};
    const line = d.channels.map((c, i) => `${c.name}: ${vals[i]}`).join(' · ');
    return line.length <= 34 ? { sub: line } : {};
  }
  function chStatus(d, i) {
    const c = d.channels[i];
    if (!d.online) return 'Offline';
    if (c.timer) { // short: the white tile already says it's on; ≥1 h shown as "1h 5m" so it fits a 3-column tile
      const left = Math.max(0, Math.round((c.timer.end - Date.now()) / 1000));
      return `Off in ${left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` : UI.fmtDur(left)}`;
    }
    let s = c.on ? 'On' : 'Off';
    if (c.on && has(d, 'power') && !multi(d)) s += ` · ${Math.round(watts(d))} W`;
    return s;
  }

  /* ---------- Home tiles ---------- */
  function homeTiles(d) {
    if (grouped(d)) {
      return [{ ch: -1, name: d.name, icon: chIcon(groupTarget(d)), accent: accent(groupTarget(d).display), on: d.online && anyOn(d), status: groupStatus(d), controllable: true, offline: !d.online }];
    }
    return d.channels.map((c, i) => ({
      ch: i, name: split(d) ? c.name : d.name, icon: chIcon(c), accent: accent(c.display), on: d.online && c.on,
      status: chStatus(d, i), controllable: true, offline: !d.online,
    }));
  }

  /* ==========================================================================
     Device page (device.html)
     ========================================================================== */
  /* Tappable things look tappable (glass, chevron, blue text, press feedback);
     read-only information is flat (no card, no border). Order: control → settings → information. */
  function page(d) {
    let h = '';
    if (!d.online) h += `<div class="pad" data-key="ban-off" style="margin-top:8px"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · Will follow “After a power cut” when power returns.</div></div></div>`;
    else if (d.wait) h += `<div class="pad" data-key="ban-wait" style="margin-top:8px"><div class="banner warn">${icon('hourglass')}<div><b>Power is back</b> · Waiting <span data-num data-live="wait">${Math.ceil((d.wait.until - Date.now()) / 1000)}</span> s</div></div></div>`;

    // 1. Control
    if (!split(d)) {
      const on = grouped(d) ? anyOn(d) : d.channels[0].on;
      h += `<div data-key="power" class="power-area">
        <button class="power-toggle" aria-pressed="${on}" data-action="relay-toggle" data-ch="${grouped(d) ? -1 : 0}" ${!d.online ? 'disabled' : ''} aria-label="Power">
          <span class="label">${on ? 'On' : 'Off'}</span><span class="knob"><img class="pwr" src="assets/icons/power.svg" width="36" height="36" alt=""></span></button>
        <div class="t-sm c-secondary power-sub" data-num data-live="${grouped(d) ? 'group' : 'ch0'}">${grouped(d) ? groupLine(d) : subLine(d, 0)}</div></div>`;
    } else {
      const cols = d.channels.length === 3 || d.channels.length === 6 ? 'cols-3' : '';
      h += `<div class="pad" data-key="ch-grid" style="padding-top:32px"><div class="channel-grid ${cols}">${d.channels.map((c, i) => `
        <button class="tile ${d.online && c.on ? 'on' : ''} ${!d.online ? 'offline' : ''}" data-action="relay-toggle" data-ch="${i}">
          <span class="tile-icon" style="${d.online && c.on ? 'color:' + accent(c.display) : ''}">${icon(chIcon(c), 'icon', 'style="width:28px;height:28px"')}</span>
          <span class="tile-power">${icon('power', 'icon icon-sm')}</span>
          <span class="tile-name">${esc(c.name)}</span>
          <span class="tile-status" data-num data-live="ch${i}">${chStatus(d, i)}</span>
        </button>`).join('')}</div></div>`;
      // One plain-language action instead of "All on / All off": it says exactly what it will do
      if (has(d, 'allOnOff')) {
        const any = anyOn(d), what = 'devices';
        h += `<div class="pad" data-key="all" style="margin-top:16px"><button class="all-action ${any ? 'turn-off' : 'turn-on'}" data-action="relay-master" ${!d.online ? 'disabled' : ''}>
          ${icon('power', 'icon', 'style="width:20px;height:20px"')}<span>${any ? `Turn off all ${what}` : `Turn on all ${what}`}</span></button></div>`;
      }
    }

    // 2. Settings you can open (tappable rows with chevrons)
    const controls = [];
    if (has(d, 'timer')) {
      let running = d.channels.map((c, i) => (c.timer && c.timer.kind === 'timer' ? i : -1)).filter((i) => i >= 0);
      if (grouped(d)) running = running.slice(0, 1);
      controls.push(`<button class="cell has-icon" data-action="relay-timer"><span class="cell-icon">${icon('clock')}</span>
        <span class="cell-main cell-title">Timer</span><span class="cell-value" data-num data-live="timer">${running.length ? `Off in ${UI.fmtDur((d.channels[running[0]].timer.end - Date.now()) / 1000)}` : ''}</span>${icon('chevron-right', 'chev')}</button>`);
    }
    if (has(d, 'inching')) {
      const on = d.channels.some((_, i) => get(d, 'inching', i).on);
      controls.push(`<button class="cell has-icon" data-action="relay-feature" data-k="inching"><span class="cell-icon">${icon('refresh')}</span>
        <span class="cell-main cell-title">Auto-off</span><span class="cell-value">${on ? 'On' : 'Off'}</span>${icon('chevron-right', 'chev')}</button>`);
    }
    if (controls.length) h += `<div class="list" data-key="controls" style="margin-top:20px">${controls.join('')}</div>`;

    // 3. Information (flat, not tappable)
    if (has(d, 'power')) {
      const w = watts(d);
      h += `<div class="v2-head muted" data-key="pw-head"><span>Power & energy</span></div>
        <div class="pad info-grid" data-key="pw">
          <div class="info-card"><span>Power</span><b data-num="count" data-live="w">${Math.round(w)}W</b></div>
          <div class="info-card"><span>Voltage</span><b data-num="count">${d.online ? '230V' : '—'}</b></div>
          <div class="info-card"><span>Current</span><b data-num="count" data-live="amp">${(w / 229.6).toFixed(2)}A</b></div>
          <div class="info-card"><span>Energy (total)</span><b data-num="count" data-live="kwh">${d.energy.toFixed(2)}kWh</b></div>
          ${tempCard(d)}
        </div>`;
    } else if (has(d, 'deviceTemp')) h += `<div class="pad info-grid" data-key="tmp" style="margin-top:32px">${tempCard(d)}</div>`;
    if (has(d, 'events')) {
      const ev = d.events.slice(0, 4);
      h += `<div class="v2-head muted" data-key="ev-head"><span>Button presses</span></div><div class="pad" data-key="ev">${ev.length
        ? `<div class="flat-list">${ev.map((e) => `<div class="event-row"><span><b>${esc(e.action)}</b> press${split(d) ? ' · ' + esc(d.channels[e.ch]?.name || '') : ''}</span><span>${UI.fmtTime(e.t)}</span></div>`).join('')}</div>`
        : '<p class="t-md c-tertiary" style="padding:2px 4px">No presses yet</p>'}</div>`;
    }
    return h + '<div style="height:28px"></div>';
  }

  /** Figma "Device temperature": full-width card with the thermometer on the right (under Power & energy). */
  const tempCard = (d) => (has(d, 'deviceTemp') ? `<div class="info-card wide"><span>Device temperature</span><b data-num="count">${d.online ? d.temp + '°C' : '—'}</b>${icon('sensor-temperature')}</div>` : '');
  function groupLine(d) {
    const st = groupStatus(d);
    return `${d.channels.length} channels together${st === 'On' || st === 'Off' ? '' : ' · ' + st}`;
  }
  function subLine(d, i) {
    const c = d.channels[i];
    if (!d.online) return 'Offline';
    if (c.timer) return `${c.timer.kind === 'inch' ? 'Auto-off' : 'Timer'} · off in ${UI.fmtDur((c.timer.end - Date.now()) / 1000)}`;
    if (has(d, 'inching') && get(d, 'inching', i).on) return `Auto-off after ${get(d, 'inching', i).sec} s`;
    return '';   // Figma: nothing under the button — the power cards show the watts
  }
  /** Cheap per-second update of countdown texts without full re-render. */
  function live(d, root) {
    d.channels.forEach((_, i) => UI.setNum(root.querySelector(`[data-live="ch${i}"]`), split(d) ? chStatus(d, i) : subLine(d, i)));
    UI.setNum(root.querySelector('[data-live="group"]'), groupLine(d));
    UI.setNum(root.querySelector('[data-live="w"]'), Math.round(watts(d)) + 'W');
    UI.setNum(root.querySelector('[data-live="amp"]'), (watts(d) / 229.6).toFixed(2) + 'A');
    UI.setNum(root.querySelector('[data-live="kwh"]'), d.energy.toFixed(2) + 'kWh');
    const wt = root.querySelector('[data-live="wait"]'); if (wt && d.wait) UI.setNum(wt, Math.ceil((d.wait.until - Date.now()) / 1000));
    const t = root.querySelector('[data-live="timer"]');
    if (t) { const c = d.channels.find((x) => x.timer && x.timer.kind === 'timer'); UI.setNum(t, c ? `Off in ${UI.fmtDur((c.timer.end - Date.now()) / 1000)}` : ''); }
  }

  function bindPage(d, ctx) {
    const commit = (msg) => { Store.save(); ctx.render(); if (msg) UI.toast(msg); };
    UI.on({
      'relay-toggle': ({ ch }) => {
        const m = toggle(d, +ch); commit(m && m.includes('interlock') ? m : null);
        UI.pulse(UI.screen.querySelector(`[data-action="relay-toggle"][data-ch="${ch}"]`), 'just-toggled');
      },
      'relay-master': () => {
        const on = !anyOn(d);
        const what = 'devices';
        d.channels.forEach((_, i) => setChannel(d, i, on)); commit(on ? `All ${what} on` : `All ${what} off`);
        UI.pulse(UI.screen.querySelector('.all-action'), 'just-toggled');
        UI.screen.querySelectorAll('.channel-grid .tile').forEach((t, i) => setTimeout(() => UI.pulse(t, 'just-toggled'), 40 * i)); // ripple across channels
      },
      'relay-timer': () => openTimer(d, 0, ctx),
      'relay-feature': ({ k }) => openFeature(d, k, 0, ctx),
    });
  }

  /* ---------- Timer sheet: the shared one (UI.timerSheet — presets + Custom wheel) ---------- */
  function openTimer(d, ch, ctx) {
    let c = ch;
    UI.timerSheet({
      sub: esc(F.timer.short),
      tabs: split(d) ? () => UI.segTabs(d.channels.map((x) => x.name), c, 'tm-ch') : null,
      running: () => { const t = d.channels[c].timer; return t && t.kind === 'timer' ? t : null; },
      start: (sec) => { const m = startTimer(d, c, sec); Store.save(); ctx.render(); return m; },
      cancel: () => { (grouped(d) ? d.channels : [d.channels[c]]).forEach((x) => { x.timer = null; }); Store.save(); ctx.render(); },
      lastCustom: () => d.tmCustom, saveCustom: (sec) => { d.tmCustom = sec; },
      extra: (s) => ({ 'tm-ch': ({ ch: x }) => { c = +x; s.refresh(); } }),
    });
  }

  /* ---------- Feature setting sheet (any type) ---------- */
  function openFeature(d, k, ch, ctx) {
    const f = F[k]; let c = ch;
    const commit = () => {
      // grouped: per-channel settings are one setting → copy channel 1's value to every channel
      if (f.perCh && grouped(d)) d.settings[k] = d.channels.map(() => clone(d.settings[k][0]));
      Store.save(); ctx.render(); s.refresh();
    };
    const stepper = (act, val, unit, extra = '') => `<div class="stepper"><button data-action="${act}" data-d="-1" ${extra} aria-label="Less">−</button><output data-num>${val} ${unit}</output><button data-action="${act}" data-d="1" ${extra} aria-label="More">+</button></div>`;
    const s = UI.sheet({
      title: f.name, sub: esc(f.short),
      tabs: f.perCh && split(d) ? () => UI.segTabs(d.channels.map((x) => x.name), c, 'rf-ch') : null,
      render: () => {
        let h = '';
        const v = get(d, k, c);
        if (f.type === 'choice') {
          h += `<div class="list">${f.opts.map((o) => `<button class="option" role="radio" aria-checked="${v === o[0]}" data-action="rf-opt" data-v="${o[0]}">
            <span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('')}</div>`;
        } else if (f.type === 'toggle') {
          h += `<div class="list"><button class="cell" data-action="rf-toggle"><span class="cell-main cell-title">${esc(f.name)}</span><span class="switch" role="switch" aria-checked="${!!v}"></span></button></div>`;
        } else if (f.type === 'number') {
          h += `<div class="list"><div class="cell"><span class="cell-main cell-title">Delay</span>${stepper('rf-num', v, f.unit)}</div></div>`;
        } else if (f.type === 'inch') {
          h += `<div class="list"><button class="cell" data-action="rf-toggle"><span class="cell-main cell-title">Auto-off</span><span class="switch" role="switch" aria-checked="${v.on}"></span></button>
            ${UI.collapse(v.on, `<div class="cell"><span class="cell-main cell-title">Turn off after</span>${stepper('rf-num', v.sec, 's')}</div>`)}</div>`;
        } else if (f.type === 'backlight') {
          h += `<div class="list"><button class="cell" data-action="rf-toggle"><span class="cell-main cell-title">Backlight</span><span class="switch" role="switch" aria-checked="${v.on}"></span></button>
            ${UI.collapse(v.on, `<div class="cell slider-row"><div class="row"><span class="cell-title grow">Brightness</span><span class="slider-val" data-num id="brVal">${v.br}%</span></div><input type="range" class="range" min="0" max="100" value="${v.br}" style="--v:${v.br / 100}" id="brRange" aria-label="Brightness"></div>`)}</div>`;
        } else if (f.type === 'color') {
          h += ['on', 'off'].map((w) => UI.group(`When ${w}`, `<div class="swatches group-pad sw-card">${Object.keys(COLORS).map((n) => `<button class="swatch" style="background:${COLORS[n]}" aria-pressed="${v[w] === n}" aria-label="${n}" data-action="rf-color" data-w="${w}" data-n="${n}"></button>`).join('')}</div>`)).join('');
        } else if (f.type === 'protect') {
          const L = [['overV', 'Voltage too high', 'V', 200, 265, 1], ['underV', 'Voltage too low', 'V', 75, 240, 1], ['overI', 'Current too high', 'A', 1, 65, 1], ['overP', 'Power too high', 'W', 100, 25000, 100], ['temp', 'Too hot', '°C', 40, 100, 1]];
          h += UI.group('Limits', L.map(([x, l, u]) => `<div class="cell"><span class="cell-main cell-title">${l}</span>${stepper('rf-prot', v[x], u, `data-x="${x}"`)}</div>`).join(''))
            + UI.group('When a limit is passed', [['trip', 'Cut the power'], ['alarm', 'Only alert me'], ['ignore', 'Ignore']].map(([a, l]) => `<button class="option" role="radio" aria-checked="${v.act === a}" data-action="rf-prot-act" data-v="${a}"><span class="option-main option-title">${l}</span><span class="radio">${icon('radio-on')}</span></button>`).join(''))
            + UI.group('', `<button class="cell" data-action="rf-reclose"><span class="cell-main"><span class="cell-title" style="display:block">Auto-reclose</span><span class="cell-sub" style="display:block">Turn back on when values are normal</span></span><span class="switch" role="switch" aria-checked="${v.reclose}"></span></button>`);
        }
        return h;
      },
      footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>',
      onMount: (el) => {
        const r = el.querySelector('#brRange');
        if (r) r.oninput = () => { get(d, k, c).br = +r.value; UI.setNum(el.querySelector('#brVal'), r.value + '%'); Store.save(); };
        if (r) r.onchange = () => ctx.render();
      },
    });
    const L = { overV: [200, 265, 1], underV: [75, 240, 1], overI: [1, 65, 1], overP: [100, 25000, 100], temp: [40, 100, 1] };
    UI.on({
      'rf-ch': ({ ch: x }) => { c = +x; s.refresh(); },
      'rf-opt': ({ v }) => { set(d, k, c, v); commit(); },
      'rf-toggle': () => {
        if (k === 'interlock' && !get(d, k) && grouped(d)) { UI.toast('Ungroup channels first — interlock allows only one channel on'); return; }
        const v = get(d, k, c); if (typeof v === 'object') v.on = !v.on; else set(d, k, c, !v); commit(); },
      'rf-num': ({ d: dir }) => {
        const v = get(d, k, c);
        if (f.type === 'inch') { const st = v.sec < 10 ? 1 : v.sec < 60 ? 5 : 30; v.sec = Math.min(3600, Math.max(1, v.sec + st * dir)); }
        else set(d, k, c, Math.min(f.max, Math.max(f.min, +(v + f.step * dir).toFixed(1))));
        commit();
      },
      'rf-color': ({ w, n }) => { get(d, k, c)[w] = n; commit(); },
      'rf-prot': ({ x, d: dir }) => { const v = get(d, k, c); const [a, z, st] = L[x]; v[x] = Math.min(z, Math.max(a, v[x] + st * dir)); commit(); },
      'rf-prot-act': ({ v: a }) => { get(d, k, c).act = a; commit(); },
      'rf-reclose': () => { const v = get(d, k, c); v.reclose = !v.reclose; commit(); },
    });
  }

  /* ==========================================================================
     Settings page sections (device-settings.html)
     ========================================================================== */
  function settings(d) {
    let h = '';
    if (multi(d)) {
      const lock = interlockOn(d) && !grouped(d);
      h += `<div class="list-header">Channels</div><div class="list">
        <button class="cell" data-action="rs-group" ${lock ? 'aria-disabled="true"' : ''}><span class="cell-main"><span class="cell-title" style="display:block">Group channels</span>
          <span class="cell-sub" style="display:block">One button for all channels</span></span>
          <span class="switch" role="switch" aria-checked="${grouped(d)}" style="${lock ? 'opacity:.4' : ''}"></span></button></div>
        ${UI.collapse(lock, '<div class="list-footer">Turn off Interlock to group channels.</div>')}
        ${UI.collapse(split(d), `<div class="list" style="margin-top:12px">` + d.channels.map((c, i) => `
        <button class="cell has-icon ch-row" data-action="rs-channel" data-ch="${i}"><span class="cell-icon">${icon(chIcon(c))}</span>
          <span class="cell-main"><span class="cell-title" style="display:block">${esc(c.name)}</span><span class="cell-sub" style="display:block">Channel ${i + 1} · ${displayOf(c.display)[1]}</span></span>${icon('chevron-right', 'chev')}</button>`).join('') + '</div>')}`;
    }
    for (const [title, grps] of SETTINGS_CARDS) {
      const ks = grps.flatMap((g) => Object.keys(F).filter((k) => F[k].grp === g && has(d, k)));
      if (!ks.length) continue;
      h += `${title ? `<div class="list-header">${title}</div>` : '<div class="list-gap"></div>'}<div class="list">${ks.map((k) => {
        const f = F[k];
        if (f.type === 'toggle') {   // only an on/off switch → switch it right here, no sheet
          const on = !!get(d, k);
          return `<button class="cell" data-action="rs-toggle" data-k="${k}" role="switch" aria-checked="${on}">
            <span class="cell-main"><span class="cell-title" style="display:block">${esc(f.name)}</span>${f.showSub ? `<span class="cell-sub" style="display:block">${esc(f.short)}</span>` : ''}</span>
            <span class="switch" aria-hidden="true" aria-checked="${on}"></span></button>`;
        }
        const sm = summary(d, k);
        return `<button class="cell" data-action="rs-feature" data-k="${k}">
          <span class="cell-main"><span class="cell-title" style="display:block">${esc(f.name)}</span>${sm.sub ? `<span class="cell-sub" style="display:block">${esc(sm.sub)}</span>` : ''}</span>
          ${sm.value ? `<span class="cell-value">${esc(sm.value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
      }).join('')}</div>`;
    }
    return h;
  }
  function displayRow(d) {
    const row = `<button class="cell" data-action="rs-display" data-ch="0"><span class="cell-main cell-title">Display As</span><span class="cell-value">${displayOf(split(d) ? d.channels[0].display : groupTarget(d).display)[1]}</span>${icon('chevron-right', 'chev')}</button>`;
    return multi(d) ? UI.collapse(!split(d), row) : row;   // multi-channel: appears smoothly when channels get grouped
  }
  /* ---------- Channel Edit (Figma 5990:67634) ----------
     Full sheet: icon (pen → icon picker) · name · Display as (→ picker) · Save.
     Changes are kept in a draft and applied only on Save. */
  function openEdit(d, i, ctx, draft) {
    const c = d.channels[i];
    const dr = draft || { name: multi(d) ? c.name : d.name, display: c.display, icon: chIcon(c) };
    const keepName = () => { const el = document.getElementById('ceName'); if (el) dr.name = el.value; };
    UI.sheet({
      full: true, title: 'Edit', sub: 'Configure device settings for easy control.',
      render: () => `<div class="edit-avatar"><div class="ring">${icon(dr.icon, 'icon', 'style="width:48px;height:48px"')}</div>
          <button class="pen" data-action="ce-icon" aria-label="Change icon">${icon('pen', 'icon', 'style="width:20px;height:20px"')}</button></div>
        <div class="pad">
          <label class="input-box"><span class="lbl">${multi(d) ? 'Channel name' : 'Device name'}</span><input id="ceName" value="${esc(dr.name)}" maxlength="30" autocomplete="off"></label>
          <button class="input-box" data-action="ce-display"><span class="lbl">Display as</span><span class="val">${displayOf(dr.display)[1]}</span><span class="trail">${icon('chevron-down', 'icon')}</span></button>

        </div>`,
      footer: `<button class="btn btn-primary btn-block" data-action="ce-save">Save</button>`,
    });
    UI.on({
      'ce-icon': () => { keepName(); openIconPicker(dr, () => openEdit(d, i, ctx, dr)); },
      'ce-display': () => { keepName(); openDisplayPicker(dr, () => openEdit(d, i, ctx, dr)); },
      'ce-save': () => {
        keepName();
        const name = dr.name.trim();
        if (!name) { UI.toast('Name cannot be empty'); return; }
        if (multi(d)) c.name = name; else d.name = name;
        c.display = dr.display; c.icon = dr.icon;
        Store.save(); UI.closeSheet(); ctx.render(); UI.toast('Saved');
      },
    });
  }
  /** Bottom sheet with the icons of the current Display-as type. */
  function openIconPicker(dr, back) {
    UI.sheet({
      title: 'Select an icon', onClose: null,
      render: () => `<section class="sheet-group"><div class="list-header group-title">${displayOf(dr.display)[4]}</div></section><div class="pad icon-grid">${iconSet(dr.display).map((n) => `<button data-action="ip-pick" data-n="${n}" aria-pressed="${dr.icon === n}" aria-label="${n.replace('dev-', '')}">${icon(n, 'icon', 'style="width:32px;height:32px"')}</button>`).join('')}</div>
`,
      footer: '<button class="btn btn-secondary btn-block" data-action="ip-back">Done</button>',
    });
    UI.on({ 'ip-pick': ({ n }) => { dr.icon = n; back(); }, 'ip-back': () => back() });
  }
  /** Display-as list. Switching type resets the icon to that type's default unless it already fits. */
  function openDisplayPicker(dr, back) {
    UI.sheet({
      title: 'Display as', sub: 'Sets the icon and power estimate',
      render: () => `<div class="list">${PICK_DISPLAY.map(([k, l]) => `<button class="option" role="radio" aria-checked="${dr.display === k}" data-action="dp-pick" data-v="${k}">
        <span class="cell-icon" style="color:var(--label-secondary)">${icon(iconSet(k)[0])}</span><span class="option-main option-title">${l}</span><span class="radio">${icon('radio-on')}</span></button>`).join('')}</div>`,
    });
    UI.on({ 'dp-pick': ({ v }) => { dr.display = v; if (!iconSet(v).includes(dr.icon)) dr.icon = iconSet(v)[0]; back(); } });
  }
  /** Single-channel relay: settings rows save immediately (no Edit sheet). */
  function quickIcon(d, ctx) {
    const c = groupTarget(d); const dr = { display: c.display, icon: chIcon(c) };
    openIconPicker(dr, () => { c.icon = dr.icon; Store.save(); UI.closeSheet(); ctx.render(); });
  }
  function quickDisplay(d, ctx) {
    const c = groupTarget(d); const dr = { display: c.display, icon: chIcon(c) };
    openDisplayPicker(dr, () => {
      c.display = dr.display; c.icon = dr.icon;
      if (grouped(d)) d.channels.forEach((x) => { x.display = dr.display; }); // power estimate follows the group
      Store.save(); UI.closeSheet(); ctx.render();
    });
  }
  function bindSettings(d, ctx) {
    UI.on({
      'rs-feature': ({ k }) => openFeature(d, k, 0, ctx),
      'rs-toggle': ({ k }) => {
        if (k === 'interlock' && !get(d, k) && grouped(d)) { UI.toast('Ungroup channels first — interlock allows only one channel on'); return; }
        set(d, k, 0, !get(d, k));
        Store.save(); ctx.render();
      },
      'rs-channel': ({ ch }) => openEdit(d, +ch, ctx),
      'rs-display': () => quickDisplay(d, ctx),
      'rs-icon': () => quickIcon(d, ctx),
      'rs-group': () => {
        if (!grouped(d) && interlockOn(d)) { UI.toast('Turn off Interlock first'); return; }
        d.grouped = !d.grouped;
        if (d.grouped) {
          groupTarget(d);
          // one device = one set of settings: use channel 1's values for every channel
          for (const k in F) if (F[k].perCh && Array.isArray(d.settings[k])) d.settings[k] = d.channels.map(() => clone(d.settings[k][0]));
        }
        Store.save(); ctx.render(); UI.toast(d.grouped ? 'Channels grouped — one button for all' : 'Channels shown separately');
      },
      'rs-identify': () => UI.toast(d.online ? 'The device is blinking for 10 s' : 'Relay is offline'),
    });
  }

  function about(d) {
    const rows = [['Channels', String(d.channels.length)]];
    if (has(d, 'deviceTemp')) rows.push(['Device temperature', d.online ? d.temp + ' °C' : '—']);
    if (has(d, 'outageCount')) rows.push(['Power cuts counted', String(d.outages)]);
    return rows;
  }

  /* ==========================================================================
     Prototype panel (desktop only) — mirrors the spec's left column.
     Lets you change the relay's capabilities and simulate the real world.
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    return `<div class="pp-title">Relay prototype</div>
      <p class="pp-note">Not part of the app. Change what this relay supports and simulate real-world events. Spec: <a href="../Device%20Interface%203/2.%20Relay_Interface.html" target="_blank">Relay_Interface</a></p>
      <h3>Real relay</h3>
      <select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      <h3>Channels</h3><div class="pp-seg">${CH_COUNTS.map((n) => `<button class="${n === d.channels.length ? 'on' : ''}" data-action="pp-ch" data-n="${n}">${n}</button>`).join('')}</div>
      <h3>Simulate</h3>
      <div class="pp-row"><button class="pp-btn" data-action="pp-power">${d.online ? '⚡ Power cut' : '🔌 Restore power'}</button></div>
      ${d.channels.map((c, i) => `<div class="pp-group">Wall switch · ${esc(c.name)}</div><div class="pp-row">${['single', 'double', 'hold'].map((a) => `<button class="pp-btn" data-action="pp-press" data-ch="${i}" data-a="${a}">${a}</button>`).join('')}</div>`).join('')}
      <h3>Features this relay has</h3>
      ${ALL_GROUPS.map((grp) => `<div class="pp-group">${grp}</div>${g(grp).map((k) => `<label class="pp-chk"><input type="checkbox" data-pp="feat" value="${k}" ${has(d, k) ? 'checked' : ''}> ${F[k].name}</label>`).join('')}`).join('')}
      <h3>Data</h3><button class="pp-btn" data-action="pp-reset">Reset all prototype data</button>`;
  }
  function bindProto(d, ctx) {
    const panel = document.getElementById('protoPanel'); if (!panel) return;
    panel.onchange = (e) => {
      const t = e.target;
      if (t.dataset.pp === 'preset') {
        const p = PRESETS.find((x) => x.id === t.value);
        d.preset = p.id; d.model = p.model; d.manufacturer = p.manufacturer; d.originalName = p.name; d.features = p.feats.slice();
        d.channels = []; setChannelCount(d, p.ch); d.channels.forEach((c, i) => { c.name = p.names[i]; });
        d.settings = {}; applyDefaults(d);
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); }
      Store.save(); ctx.render();
    };
    UI.on({
      'pp-ch': ({ n }) => { setChannelCount(d, +n); Store.save(); ctx.render(); },
      'pp-power': () => { if (d.online) { powerCut(d); UI.toast('Power cut — relay offline'); } else { powerRestore(d); UI.toast('Power restored'); } Store.save(); ctx.render(); },
      'pp-press': ({ ch, a }) => { const m = wallPress(d, +ch, a); Store.save(); ctx.render(); UI.toast(m); },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Relay', F, PRESETS, create, applyDefaults,
    icon: (d, ch = 0) => (split(d) ? 'menu-device' : chIcon(groupTarget(d))),
    /** Settings header avatar: only for 1-channel relays — multi-channel relays show an icon per channel instead. */
    avatarIcon: (d) => (split(d) ? null : chIcon(groupTarget(d))),
    homeTiles, toggle: (d, i) => toggle(d, i), page, bindPage, live, settings, displayRow, bindSettings, about, tick, protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
  };
})();
