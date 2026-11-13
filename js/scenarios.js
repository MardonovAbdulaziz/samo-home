/* Scenarios — catalog, plain-language sentences, ideas and the engine that runs them.
   Loaded on every page (after store.js) so automations fire wherever the user is.

   Scenario = {
     id, name, icon, manual: bool,                 // manual = "Tap to run" (a scene); otherwise automatic
     on: bool,                                     // automatic ones can be paused
     when: [Trigger],                              // automatic: ANY of these starts it
     only: [Condition],                            // ALL must be true, or the run is skipped (and the log says why)
     do:   [Action],                               // run top to bottom
     log:  [{ at, ok, cause, text }],              // last runs, newest first
   }
   Trigger   = { k:'time', at:'07:30', days:[1..7] } | { k:'sun', ev:'sunset'|'sunrise', off:min }
             | { k:'dev', id, ch, ev, v? }         | { k:'leave' } | { k:'arrive' }
   Condition = { k:'between', from:'sunset'|'HH:MM', to:'sunrise'|'HH:MM' } | { k:'days', days:[1..7] } | { k:'state', id, ch, is }
   Action    = { k:'dev', id, ch, to, back? (min) } | { k:'notify', text, critical? } | { k:'wait', min } | { k:'run', sid } | { k:'auto', sid, on }
   Chains: what one scenario does to a device can start another automation (like Home Assistant / HomeKit with
   "dummy switches"). Safe by design: at most 3 steps, each scenario once per chain, loops are flagged in the editor,
   and the log says "Started by …".
   Days are 1 = Monday … 7 = Sunday. */
const Scenarios = (() => {
  const esc = (s) => UI.esc(s);
  const S = () => Store.state;
  const SUN = { sunrise: '07:12', sunset: '17:04' };   // Tashkent, mid-November (the hub would compute it from the home's location)
  const DAY = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const ALL = [1, 2, 3, 4, 5, 6, 7];

  /* ---------- Devices: what each type can start, check and do ---------- */
  const tilesOf = (d) => { try { return DeviceAPI(d).homeTiles(); } catch (e) { return []; } };
  const tileOf = (d, ch) => tilesOf(d).find((t) => t.ch === ch) || tilesOf(d)[0] || {};
  const dev = (id) => Store.device(id);
  /** Name of one controllable channel: "Ceiling" for a 2-gang relay, the device name otherwise. */
  const nameOf = (id, ch = 0) => { const d = dev(id); if (!d) return 'a removed device'; const t = tileOf(d, ch); return t.name || d.name; };
  const iconOf = (id, ch = 0) => { const d = dev(id); return d ? tileOf(d, ch).icon || DeviceAPI(d).icon(ch) : 'round-info'; };
  const kwOf = (s) => { const m = String(s || '').match(/([\d.]+)\s*(k?W)\b/); return m ? (+m[1]) / (m[2] === 'W' ? 1000 : 1) : 0; };

  // Words for on/off-like devices: [event on, event off, state on, state off, do on, do off]
  const WORDS = {
    curtain: ['Opens', 'Closes', 'is open', 'is closed', 'Open', 'Close'],
    valve: ['Opens', 'Closes', 'is open', 'is closed', 'Open', 'Close'],
    _: ['Turns on', 'Turns off', 'is on', 'is off', 'Turn on', 'Turn off'],
  };
  const words = (d) => WORDS[d.type] || WORDS._;
  const COLOUR_WORD = { white: 'white light', blue: 'blue', mint: 'mint', red: 'red', purple: 'purple' };
  /** "red", "orange", "pink"… — a hex colour in one everyday word */
  function colourWord(c) {
    if (COLOUR_WORD[c]) return COLOUR_WORD[c];
    const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c || ''); if (!m) return c;
    const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), dd = mx - mn;
    if (dd < 0.12) return 'white light';
    let h = mx === r ? ((g - b) / dd) % 6 : mx === g ? (b - r) / dd + 2 : (r - g) / dd + 4; h = (h * 60 + 360) % 360;
    const sat = dd / mx; const pale = sat < 0.35 ? 'soft ' : '';
    return pale + (h < 15 || h >= 345 ? 'red' : h < 40 ? 'orange' : h < 65 ? 'yellow' : h < 160 ? 'green' : h < 195 ? 'turquoise' : h < 250 ? 'blue' : h < 290 ? 'purple' : 'pink');
  }
  const kWord = (k) => (!k ? 'white light' : k < 3300 ? 'warm white' : k < 5000 ? 'neutral white' : 'cool white');
  const fxWord = (id, fx) => { const d = dev(id); const f = d && d.type === 'light' ? (Devices.light.sceneCaps(d).fx.find((x) => x[0] === fx) || [])[1] : ''; return (f || fx).toLowerCase(); };
  const backWord = (m) => (m >= 60 ? `${m / 60} h` : `${m} min`);

  /** Current signals of one device channel (read from the live device model). */
  function sig(d, ch = 0) {
    const t = tileOf(d, ch), st = d.st || {}, live = d.online !== false;
    switch (d.type) {
      case 'contact': return { open: !!st.open };
      case 'motion': return { motion: live && !!st.occ };
      case 'presence': return { someone: live && !!st.occ };
      case 'leak': return { leak: live && t.tone === 'danger' && t.status !== 'Offline' };
      case 'smoke': case 'gas': return { alarm: live && t.tone === 'danger' && t.status !== 'Offline' };
      case 'lock': return { locked: st.bolt === 'locked' };
      case 'climate': return { t: typeof st.t === 'number' ? st.t : null };
      case 'air': return { bad: /^(Moderate|Poor|Unhealthy)/.test(t.status || '') };
      case 'vibration': return { running: !!st.shaking, shaken: !!st.alarmAt };
      case 'meter': return { kw: kwOf(t.status) };
      default: return t.controllable ? { on: !!t.on } : {};
    }
  }
  const rise = (k) => (a, b) => !a[k] && !!b[k];
  const fall = (k) => (a, b) => !!a[k] && !b[k];
  /** Per type: ev = triggers, st = conditions, act = actions. label = what the user picks, s = how the sentence says it. */
  const CAP = {
    contact: {
      ev: [{ k: 'open', label: 'Opens', s: 'opens', test: rise('open') }, { k: 'close', label: 'Closes', s: 'closes', test: fall('open') },
        { k: 'openFor', label: 'Stays open', s: (v) => `stays open for ${v} min`, num: { def: 5, min: 1, max: 60, step: 1, unit: 'min', hint: 'Starts once, when the time is up' }, hold: 'open' }],
      st: [{ k: 'open', label: 'Is open', s: 'is open', test: (c) => c.open }, { k: 'closed', label: 'Is closed', s: 'is closed', test: (c) => !c.open }],
    },
    motion: {
      ev: [{ k: 'motion', label: 'Detects motion', s: 'detects motion', test: rise('motion') }, { k: 'clear', label: 'Motion stops', s: 'stops seeing motion', test: fall('motion') }],
      st: [{ k: 'motion', label: 'Sees motion', s: 'sees motion', test: (c) => c.motion }, { k: 'clear', label: 'Sees no motion', s: 'sees no motion', test: (c) => !c.motion }],
    },
    presence: {
      ev: [{ k: 'someone', label: 'Someone comes in', s: 'sees someone come in', test: rise('someone') }, { k: 'empty', label: 'Room becomes empty', s: 'sees the room empty', test: fall('someone') }],
      st: [{ k: 'someone', label: 'Someone is here', s: 'sees someone', test: (c) => c.someone }, { k: 'empty', label: 'Nobody is here', s: 'sees nobody', test: (c) => !c.someone }],
    },
    leak: { ev: [{ k: 'leak', label: 'Detects water', s: 'detects water', test: rise('leak') }], st: [{ k: 'dry', label: 'Is dry', s: 'is dry', test: (c) => !c.leak }] },
    smoke: { ev: [{ k: 'alarm', label: 'Smoke or fire alarm', s: 'sounds the smoke alarm', test: rise('alarm') }], st: [] },
    gas: { ev: [{ k: 'alarm', label: 'Gas or CO alarm', s: 'sounds the gas alarm', test: rise('alarm') }], st: [] },
    lock: {
      ev: [{ k: 'unlock', label: 'Unlocks', s: 'unlocks', test: fall('locked') }, { k: 'lock', label: 'Locks', s: 'locks', test: rise('locked') }],
      st: [{ k: 'locked', label: 'Is locked', s: 'is locked', test: (c) => c.locked }, { k: 'unlocked', label: 'Is unlocked', s: 'is unlocked', test: (c) => !c.locked }],
      act: [{ k: 'lock', label: 'Lock', s: 'lock' }, { k: 'unlock', label: 'Unlock', s: 'unlock', manualOnly: true }],
    },
    climate: {
      ev: [{ k: 'above', label: 'Gets warmer than', s: (v) => `gets warmer than ${v} °C`, num: { def: 27, min: 10, max: 40, step: 1, unit: '°C' }, test: (a, b, v) => a.t != null && b.t != null && a.t <= v && b.t > v },
        { k: 'below', label: 'Gets colder than', s: (v) => `gets colder than ${v} °C`, num: { def: 18, min: 0, max: 30, step: 1, unit: '°C' }, test: (a, b, v) => a.t != null && b.t != null && a.t >= v && b.t < v }],
      st: [{ k: 'warm', label: 'Warmer than 25 °C', s: 'shows more than 25 °C', test: (c) => c.t > 25 }, { k: 'cold', label: 'Colder than 18 °C', s: 'shows less than 18 °C', test: (c) => c.t < 18 }],
    },
    air: { ev: [{ k: 'bad', label: 'Air gets worse', s: 'says the air got worse', test: rise('bad') }, { k: 'good', label: 'Air is good again', s: 'says the air is good again', test: fall('bad') }],
      st: [{ k: 'good', label: 'Air is good', s: 'says the air is good', test: (c) => !c.bad }, { k: 'bad', label: 'Air is not good', s: 'says the air is not good', test: (c) => c.bad }] },
    vibration: {
      ev: [{ k: 'running', label: 'Starts running', s: 'starts running', test: rise('running') }, { k: 'finished', label: 'Finishes', s: 'finishes', test: fall('running') },
        { k: 'shaken', label: 'Is shaken or hit', s: 'is shaken', test: rise('shaken') }],
      st: [{ k: 'running', label: 'Is running', s: 'is running', test: (c) => c.running }, { k: 'idle', label: 'Is not running', s: 'is not running', test: (c) => !c.running }],
    },
    meter: { ev: [{ k: 'above', label: 'Uses more than', s: (v) => `uses more than ${v} kW`, num: { def: 3, min: 0.5, max: 15, step: 0.5, unit: 'kW' }, test: (a, b, v) => a.kw <= v && b.kw > v }], st: [] },
  };
  /** Capabilities of one device channel, with the on/off family filled in from its words. */
  function cap(d) {
    if (!d) return { ev: [], st: [], act: [] };
    const c = CAP[d.type] || {};
    const t = tilesOf(d)[0] || {};
    const switchable = !CAP[d.type] && t.controllable;
    const w = words(d);
    const onoff = switchable ? {
      ev: [{ k: 'on', label: w[0], s: w[0].toLowerCase(), test: rise('on') }, { k: 'off', label: w[1], s: w[1].toLowerCase(), test: fall('on') }],
      st: [{ k: 'on', label: w[2][0].toUpperCase() + w[2].slice(1), s: w[2], test: (x) => x.on }, { k: 'off', label: w[3][0].toUpperCase() + w[3].slice(1), s: w[3], test: (x) => !x.on }],
      act: [{ k: 'on', label: w[4], s: w[4].toLowerCase(), back: true, light: d.type === 'light' }, { k: 'off', label: w[5], s: w[5].toLowerCase() },
        ...(d.type === 'curtain' ? [{ k: 'pos', label: 'Set a position', s: 'set', pos: true }] : [])],
    } : {};
    return { ev: c.ev || onoff.ev || [], st: c.st || onoff.st || [], act: c.act || onoff.act || [] };
  }
  /** Every device channel the user can pick for a role: 'ev' | 'st' | 'act'. */
  function pickable(role) {
    const out = [];
    for (const d of S().devices) {
      if (d.type === 'hub') continue;
      const c = cap(d); if (!c[role].length) continue;
      const tiles = tilesOf(d);
      const chs = !CAP[d.type] && tiles.length > 1 ? tiles : [tiles[0] || { ch: 0 }];
      chs.forEach((t) => out.push({ id: d.id, ch: t.ch || 0, name: chs.length > 1 ? t.name : d.name, sub: chs.length > 1 ? d.name.replace(/ [rs]$/, '') : '', room: Store.roomName(d.roomId), icon: t.icon || DeviceAPI(d).icon(0), offline: d.online === false }));
    }
    return out;
  }
  const findIn = (list, k) => list.find((x) => x.k === k);

  /* ---------- Plain-language sentences ---------- */
  const listJoin = (a, last = 'and') => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} ${last} ${a[a.length - 1]}`);
  function daysText(days) {
    const s = [...(days || ALL)].sort().join('');
    if (s === '1234567') return 'every day';
    if (s === '12345') return 'on weekdays';
    if (s === '67') return 'on weekends';
    return 'on ' + listJoin(days.slice().sort().map((x) => DAY[x]));
  }
  const timeWord = (x) => (x === 'sunset' || x === 'sunrise' ? x : x);
  function sunText(t) { const o = +t.off || 0; return o === 0 ? `at ${t.ev}` : `${Math.abs(o)} min ${o < 0 ? 'before' : 'after'} ${t.ev}`; }
  function evOf(t) { const d = dev(t.id); return findIn(cap(d).ev, t.ev); }
  function triggerText(t) {
    if (t.k === 'time') return `at ${t.at} ${daysText(t.days)}`;
    if (t.k === 'sun') return sunText(t);
    if (t.k === 'leave') return 'when everyone leaves home';
    if (t.k === 'arrive') return 'when someone comes home';
    if (t.k === 'dev') { const e = evOf(t); const s = e ? (typeof e.s === 'function' ? e.s(t.v) : e.s) : 'changes'; return `when ${nameOf(t.id, t.ch)} ${s}`; }
    return '';
  }
  function condText(c) {
    if (c.k === 'between') {
      if (c.from === 'sunset' && c.to === 'sunrise') return 'only at night';
      if (c.from === 'sunrise' && c.to === 'sunset') return 'only in the daytime';
      return `only between ${timeWord(c.from)} and ${timeWord(c.to)}`;
    }
    if (c.k === 'days') return 'only ' + daysText(c.days);
    if (c.k === 'state') { const d = dev(c.id); const s = findIn(cap(d).st, c.is); return `only if ${nameOf(c.id, c.ch)} ${s ? s.s : 'is as set'}`; }
    return '';
  }
  function actionText(a) {
    if (a.k === 'dev') {
      const d = dev(a.id); const x = findIn(cap(d).act, a.to);
      if (a.to === 'pos') return `set ${nameOf(a.id, a.ch)} to ${a.pos} % open`;
      const look = a.set === false ? [] : [a.br ? `${a.br} %` : '', a.mode === 'ct' ? kWord(a.kel) : a.col ? colourWord(a.col) : ''].filter(Boolean);
      const fx = a.set !== false && a.fx ? ` with the ${fxWord(a.id, a.fx)} effect` : '';
      return `${x ? x.s : a.to} ${nameOf(a.id, a.ch)}${look.length ? ` at ${look.join(', ')}` : ''}${fx}${a.back ? `, off after ${backWord(a.back)}` : ''}`;
    }
    if (a.k === 'notify') return a.critical ? 'send everyone an urgent alert' : 'send you a notification';
    if (a.k === 'wait') return `wait ${a.min} min`;
    if (a.k === 'run') { const s = get(a.sid); return `run “${s ? s.name : 'a removed scenario'}”`; }
    if (a.k === 'auto') { const s = get(a.sid); return `${a.on ? 'turn on' : 'pause'} “${s ? s.name : 'a removed automation'}”`; }
    return '';
  }
  /** The whole scenario as one sentence — shown on the card and live at the top of the editor. */
  function sentence(s) {
    const acts = s.do.map(actionText).filter(Boolean);
    if (s.manual) return acts.length ? cap1(`${listJoin(acts)}.`) : 'Add what it should do — one tap will do all of it.';
    if (!s.when.length && !acts.length) return 'Choose when it starts and what it does.';
    const doPart = acts.length ? listJoin(acts) : '… (add what it should do)';
    const whenPart = s.when.length ? listJoin(s.when.map(triggerText), 'or') : 'when … (add a start)';
    const onlyPart = s.only.length ? ', ' + listJoin(s.only.map(condText)) : '';
    return cap1(`${whenPart}${onlyPart}, ${doPart}.`);
  }
  const cap1 = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  /* ---------- Storage ---------- */
  function seedList() {
    const out = [];
    const ideaById = (k) => ideas(true).find((x) => x.key === k);
    ['goodnight', 'nightdoor'].forEach((k) => { const i = ideaById(k); if (i) out.push(Object.assign(i.make(), { id: Store.uid('s'), log: [], idea: k })); });
    return out;
  }
  function list() {
    const st = S();
    if (!st.scenarios) { st.scenarios = seedList(); Store.save(); }
    return st.scenarios;
  }
  const get = (id) => list().find((s) => s.id === id);
  function upsert(s) { const l = list(); const i = l.findIndex((x) => x.id === s.id); if (i >= 0) l[i] = s; else l.push(s); Store.save(); return s; }
  function remove(id) { S().scenarios = list().filter((s) => s.id !== id); Store.save(); }

  /* ---------- Ideas (templates filled with the user's own devices) ---------- */
  const firstOf = (pred) => S().devices.find(pred);
  const lightsAll = () => S().devices.filter((d) => ['light', 'relay'].includes(d.type) && d.online !== false)
    .flatMap((d) => tilesOf(d).filter((t) => t.controllable && /bulb|lamp|led|chandelier/.test(t.icon || '')).map((t) => ({ id: d.id, ch: t.ch })));
  function ideas(all = false) {
    const door = firstOf((d) => d.type === 'contact'), lock = firstOf((d) => d.type === 'lock'), curtain = firstOf((d) => d.type === 'curtain');
    const lights = lightsAll(), lamp = lights.find((l) => (dev(l.id) || {}).type === 'light') || lights[0], dryer = firstOf((d) => d.type === 'vibration'), climate = firstOf((d) => d.type === 'climate');
    const motion = firstOf((d) => d.type === 'motion'), heater = S().devices.find((d) => d.type === 'relay' && /heater/i.test(d.name)), air = firstOf((d) => d.type === 'air');
    const hall = lights.find((l) => /hall/i.test(nameOf(l.id, l.ch))) || lamp;
    const lampIsLight = (l) => { const d = dev(l.id); return d && d.type === 'light' && Devices.light.sceneCaps(d).color; };
    const base = (o) => Object.assign({ manual: false, on: true, when: [], only: [], do: [] }, o);
    const L = [
      lights.length && { key: 'goodnight', title: 'Good night', sub: 'One tap: lights off, door locked, curtains closed', icon: 'moon',
        make: () => base({ name: 'Good night', icon: 'moon', manual: true, do: [...lights.map((l) => ({ k: 'dev', id: l.id, ch: l.ch, to: 'off' })), lock && { k: 'dev', id: lock.id, ch: 0, to: 'lock' }, curtain && { k: 'dev', id: curtain.id, ch: 0, to: 'off' }].filter(Boolean) }) },
      lights.length && { key: 'leaving', title: 'I’m leaving', sub: 'Everything off and the door locked as you go', icon: 'tab-home',
        make: () => base({ name: 'I’m leaving', icon: 'tab-home', manual: true, do: [...lights.map((l) => ({ k: 'dev', id: l.id, ch: l.ch, to: 'off' })), lock && { k: 'dev', id: lock.id, ch: 0, to: 'lock' }].filter(Boolean) }) },
      door && hall && { key: 'nightdoor', title: 'Light when I come in at night', sub: `${door.name} opens after dark → ${nameOf(hall.id, hall.ch)} on for 5 min`, icon: 'dev-door-02',
        make: () => base({ name: 'Light when I come in', icon: 'dev-door-02', when: [{ k: 'dev', id: door.id, ch: 0, ev: 'open' }], only: [{ k: 'between', from: 'sunset', to: 'sunrise' }], do: [{ k: 'dev', id: hall.id, ch: hall.ch, to: 'on', back: 5 }] }) },
      curtain && { key: 'morning', title: 'Curtains open in the morning', sub: 'Weekdays at 07:30', icon: 'sunrise',
        make: () => base({ name: 'Morning curtains', icon: 'sunrise', when: [{ k: 'time', at: '07:30', days: [1, 2, 3, 4, 5] }], do: [{ k: 'dev', id: curtain.id, ch: 0, to: 'on' }] }) },
      curtain && lamp && { key: 'movie', title: 'Movie time', sub: `Curtains 90 % closed, ${nameOf(lamp.id, lamp.ch)} red at 20 %, other lights off`, icon: 'dev-tv-1',
        make: () => base({ name: 'Movie time', icon: 'dev-tv-1', manual: true, do: [{ k: 'dev', id: curtain.id, ch: 0, to: 'pos', pos: 10 },
          lampIsLight(lamp) ? { k: 'dev', id: lamp.id, ch: lamp.ch, to: 'on', br: 20, col: 'red' } : { k: 'dev', id: lamp.id, ch: lamp.ch, to: 'on' },
          ...lights.filter((l) => l.id !== lamp.id || l.ch !== lamp.ch).map((l) => ({ k: 'dev', id: l.id, ch: l.ch, to: 'off' }))] }) },
      lamp && { key: 'sunset', title: 'Lamp on at sunset', sub: `${nameOf(lamp.id, lamp.ch)} turns on when it gets dark`, icon: 'sun',
        make: () => base({ name: 'Lamp at sunset', icon: 'sun', when: [{ k: 'sun', ev: 'sunset', off: 0 }], do: [{ k: 'dev', id: lamp.id, ch: lamp.ch, to: 'on' }] }) },
      door && { key: 'leftopen', title: 'Door left open', sub: `Tell me if ${door.name} stays open for 5 min`, icon: 'bell',
        make: () => base({ name: 'Door left open', icon: 'bell', when: [{ k: 'dev', id: door.id, ch: 0, ev: 'openFor', v: 5 }], do: [{ k: 'notify', text: `${door.name} has been open for 5 min` }] }) },
      dryer && { key: 'laundry', title: 'Laundry is done', sub: `A notification when ${dryer.name} finishes`, icon: 'dev-washing',
        make: () => base({ name: 'Laundry is done', icon: 'dev-washing', when: [{ k: 'dev', id: dryer.id, ch: 0, ev: 'finished' }], do: [{ k: 'notify', text: `${dryer.name} has finished` }] }) },
      climate && { key: 'hot', title: 'Too warm in the bedroom', sub: `Tell me when ${climate.name} goes above 27 °C`, icon: 'temperature',
        make: () => base({ name: 'Too warm', icon: 'temperature', when: [{ k: 'dev', id: climate.id, ch: 0, ev: 'above', v: 27 }], do: [{ k: 'notify', text: `${climate.name}: above 27 °C` }] }) },
      heater && { key: 'heater', title: 'Hot water by morning', sub: `${heater.name} on at 05:30 for 90 min`, icon: 'dev-radiator',
        make: () => base({ name: 'Hot water by morning', icon: 'dev-radiator', when: [{ k: 'time', at: '05:30', days: ALL }], do: [{ k: 'dev', id: heater.id, ch: 0, to: 'on', back: 90 }] }) },
      motion && lamp && { key: 'nightwalk', title: 'Soft light for night walks', sub: `${motion.name} sees motion at night → light for 2 min`, icon: 'dev-motion',
        make: () => base({ name: 'Night walk', icon: 'dev-motion', when: [{ k: 'dev', id: motion.id, ch: 0, ev: 'motion' }], only: [{ k: 'between', from: '23:00', to: '06:00' }], do: [{ k: 'dev', id: lamp.id, ch: lamp.ch, to: 'on', back: 2 }] }) },
      air && { key: 'air', title: 'Stuffy air', sub: `Tell me when ${air.name} says the air got worse`, icon: 'dev-air',
        make: () => base({ name: 'Stuffy air', icon: 'dev-air', when: [{ k: 'dev', id: air.id, ch: 0, ev: 'bad' }], do: [{ k: 'notify', text: `${air.name}: open a window` }] }) },
    ].filter(Boolean);
    if (all) return L;
    const used = new Set(list().map((s) => s.idea).filter(Boolean));
    return L.filter((i) => !used.has(i.key));
  }

  /* ---------- Built into devices (their own automations, shown here so everything is in one place) ---------- */
  function builtIn() {
    const out = [];
    for (const d of S().devices) {
      const T = Devices[d.type]; if (!T || !T.F || !d.settings) continue;
      for (const [k, f] of Object.entries(T.F)) {
        if (f.grp !== 'Automation' || f.type === 'event' || (d.features && !d.features.includes(k))) continue;
        const v = d.settings[k];
        const on = v === true || (v && typeof v === 'object' && v.on !== false && (k !== 'motionLight' || v.target)) || (Array.isArray(v) && v.length);
        if (!on) continue;
        out.push({ id: d.id, name: f.name, device: d.name, icon: DeviceAPI(d).icon(0) });
      }
    }
    return out;
  }

  /* ---------- Conditions ---------- */
  const toMin = (x) => { const v = SUN[x] || x; const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  const nowMin = (d = new Date()) => d.getHours() * 60 + d.getMinutes();
  const weekday = (d = new Date()) => ((d.getDay() + 6) % 7) + 1;
  function condOk(c, at = new Date()) {
    if (c.k === 'between') { const a = toMin(c.from), b = toMin(c.to), n = nowMin(at); return a <= b ? n >= a && n < b : n >= a || n < b; }
    if (c.k === 'days') return (c.days || ALL).includes(weekday(at));
    if (c.k === 'state') { const d = dev(c.id); if (!d) return false; const s = findIn(cap(d).st, c.is); return !!(s && s.test(sig(d, c.ch || 0))); }
    return true;
  }
  /** Why a run was skipped, in words ("not at night", "Front door lock is unlocked"). */
  function whyNot(c) {
    if (c.k === 'between') return condText(c).replace(/^only /, 'not ');
    if (c.k === 'days') return 'not ' + daysText(c.days);
    if (c.k === 'state') { const d = dev(c.id); const s = findIn(cap(d).st, c.is); return `${nameOf(c.id, c.ch)} ${s ? s.s.replace(/^is /, 'is not ').replace(/^sees /, 'does not see ').replace(/^says /, 'does not say ').replace(/^shows /, 'does not show ') : 'is different'}`; }
    return 'a condition was not met';
  }

  /* ---------- Running ---------- */
  function applyDev(a) {
    const d = dev(a.id); if (!d || d.online === false) return `${nameOf(a.id, a.ch)} is offline`;
    if (d.type === 'lock') { Devices.lock.remote(d, a.to === 'lock', 'Scenario', 'scenario'); return null; }
    if (a.to === 'pos') return Devices.curtain.goToOpen(d, a.ch || 0, a.pos) === false ? `${nameOf(a.id, a.ch)} isn’t set up yet` : null;
    if (d.type === 'light' && a.to === 'on' && a.set !== false && (a.br || a.col || a.mode || a.fx)) return Devices.light.applyScene(d, a.ch || 0, { br: a.br, col: a.col, mode: a.mode, k: a.kel, fx: a.fx });
    const t = tileOf(d, a.ch || 0);
    if (!t.controllable) return `${nameOf(a.id, a.ch)} can’t be switched`;
    const want = a.to === 'on';
    if (!!t.on !== want) DeviceAPI(d).toggle(a.ch || 0);
    return null;
  }
  const pending = () => (S().scnPending = S().scnPending || []);
  /** Run the actions. Waits and "for X min" are kept in the store, so they still happen after a page change. */
  /** One action. Returns a problem in words, or null. */
  function runOne(a, s, depth) {
    if (a.k === 'dev') {
      const p = applyDev(a); if (p) return p;
      if (a.back) pending().push({ at: Date.now() + a.back * 60000, id: a.id, ch: a.ch || 0, to: a.to === 'on' ? 'off' : 'on' });
    }
    if (a.k === 'notify') UI.push({ title: s.name, body: a.text || sentence(s), tone: a.critical ? 'danger' : '' });
    if (a.k === 'auto') { const o = get(a.sid); if (o && !o.manual) o.on = !!a.on; else return 'the automation was removed'; }
    if (a.k === 'run' && depth < 3) { const o = get(a.sid); if (o && o.id !== s.id) { runActions(o, 0, depth + 1); log(o, { ok: true, cause: `Started by “${s.name}”` }); } }
    return null;
  }
  function runActions(s, from = 0, depth = 0) {
    const problems = [];
    for (let i = from; i < s.do.length; i++) {
      const a = s.do[i];
      if (a.k === 'wait') { pending().push({ at: Date.now() + a.min * 60000, sid: s.id, from: i + 1 }); break; }
      const p = runOne(a, s, depth); if (p) problems.push(p);
    }
    return problems;
  }
  /** Run a scene step by step, the way the hub sends its commands — one device after another — and report
      progress: onStep(done, total, problem). Resolves with { problems }. A scene can't be started twice at once. */
  const running = new Set();
  function runScene(s, onStep = () => {}, cause = 'Tapped') {
    if (running.has(s.id)) return Promise.resolve({ busy: true });
    running.add(s.id);
    const steps = s.do, problems = [];
    const until = steps.findIndex((a) => a.k === 'wait'), now = until < 0 ? steps : steps.slice(0, until);
    const total = Math.max(1, now.length);
    return new Promise((resolve) => {
      let i = 0;
      const next = () => {
        if (i >= now.length) {
          if (until >= 0) pending().push({ at: Date.now() + steps[until].min * 60000, sid: s.id, from: until + 1 });
          log(s, { ok: !problems.length, cause, text: problems.join(' · ') }); Store.save();
          running.delete(s.id); resolve({ problems }); return;
        }
        const a = now[i++], p = runOne(a, s, 0); if (p) problems.push(p);
        Store.save(); onStep(i, total, p);
        setTimeout(next, a.k === 'dev' ? 280 : 80);
      };
      setTimeout(next, 120);
    });
  }
  const isRunning = (id) => running.has(id);

  /* ---------- Running a scene from a tile or a Home chip: progress ring + words, shared by both pages ---------- */
  const prog = {};   // id → { done, total, phase: 'run' | 'done' | 'warn', msg }
  const RING_R = 13, RING_C = 2 * Math.PI * RING_R;
  /** The round button: ▶ when idle, a filling ring while the hub sends commands, ✓ (or !) when finished. */
  function ringHTML(id, idleIcon = 'play-fill') {
    const p = prog[id], f = p ? (p.phase === 'run' ? p.done / p.total : 1) : 0;
    const ic = !p ? idleIcon : p.phase === 'done' ? 'check' : p.phase === 'warn' ? 'round-info' : idleIcon;
    return `<span class="scn-ring ${p ? 'is-' + p.phase : ''}"><svg class="scn-ring-svg" viewBox="0 0 32 32" aria-hidden="true"><circle class="trk" cx="16" cy="16" r="${RING_R}"/><circle class="prg" cx="16" cy="16" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${(RING_C * (1 - f)).toFixed(2)}"/></svg>${icon(ic, 'icon')}</span>`;
  }
  function statusText(s) {
    const p = prog[s.id], n = s.do.length;
    if (!p) return n ? `${n} action${n > 1 ? 's' : ''}` : 'Nothing to do yet';
    if (p.phase === 'run') return `${p.done} of ${p.total}…`;
    return p.phase === 'done' ? 'Done' : p.msg;
  }
  function tapScene(id, redraw) {
    const s = get(id); if (!s || isRunning(id) || !s.do.length) return false;
    const total = Math.max(1, (s.do.findIndex((a) => a.k === 'wait') + 1 || s.do.length + 1) - 1);
    prog[id] = { done: 0, total, phase: 'run' }; redraw();
    runScene(s, (d, t) => { prog[id] = { done: d, total: t, phase: 'run' }; redraw(); }).then((r) => {
      prog[id] = r.problems && r.problems.length ? { phase: 'warn', msg: r.problems.length > 1 ? `${r.problems.length} problems` : 'Not all done' } : { phase: 'done' };
      redraw();
      if (r.problems && r.problems.length) UI.toast(`${s.name} · ${r.problems[0]}`);
      setTimeout(() => { delete prog[id]; redraw(); }, 1800);
    });
    return true;
  }
  const isBusy = (id) => !!prog[id];
  function log(s, e) { s.log = [Object.assign({ at: Date.now() }, e), ...(s.log || [])].slice(0, 20); }
  /** Start a scenario. cause = what started it (words). test = "Try it now" (conditions are shown but not enforced). */
  function fire(s, cause, { test = false } = {}) {
    const failed = s.only.find((c) => !condOk(c));
    if (failed && !test) { log(s, { ok: false, cause, text: 'Skipped — ' + whyNot(failed) }); Store.save(); return { skipped: whyNot(failed) }; }
    const problems = runActions(s);
    log(s, { ok: !problems.length, cause, text: problems.length ? problems.join(' · ') : (test ? 'Tried now' : '') });
    Store.save();
    return { problems, note: failed && test ? whyNot(failed) : '' };
  }

  /* ---------- The engine: watch devices and the clock ---------- */
  let prev = null, since = {}, busy = false, last = {};
  const keyOf = (d, ch) => d.id + ':' + ch;
  function snapshot() {
    const m = {};
    for (const d of S().devices) { if (d.type === 'hub') continue; const n = Math.max(1, tilesOf(d).length); for (let ch = 0; ch < n; ch++) m[keyOf(d, ch)] = sig(d, ch); }
    return m;
  }
  function autos() { return (S().scenarios || []).filter((s) => !s.manual && s.on !== false); }
  function scan() {
    if (busy) return;
    const cur = snapshot();
    if (!prev) { prev = cur; return; }
    const was = prev; prev = cur;
    if (document.hidden) return;                       // another tab: just follow the state, don't run twice
    busy = true;
    try {
      // round 0 = what happened in the home; rounds 1–3 = what the scenarios of the previous round changed
      let a = was, b = cur, by = null;
      const ran = new Set();
      for (let round = 0; round <= MAX_CHAIN; round++) {
        const now = Date.now();
        for (const [k, v] of Object.entries(b)) { if (v.open && !(a[k] || {}).open) since[k] = now; if (!v.open) delete since[k]; }
        const fired = [];
        for (const s of autos()) {
          if (ran.has(s.id)) continue;                    // each scenario once per chain: A → B → A stops here
          const t = s.when.find((t) => { if (t.k !== 'dev') return false; const d = dev(t.id); if (!d) return false;
            const k = keyOf(d, t.ch || 0), e = evOf(t); return !!(e && e.test && a[k] && b[k] && e.test(a[k], b[k], t.v)); });
          if (!t || !guard(s, !!by)) continue;
          ran.add(s.id);
          const r = fire(s, by ? `Started by “${by.map((x) => x.name).join('”, “')}”` : cap1(triggerText(t)).replace(/^When /, ''));
          if (!r.skipped) fired.push(s);                  // a skipped run changes nothing, so it starts nothing
        }
        if (!fired.length) break;
        const c = snapshot(); a = b; b = c; by = fired;
      }
    } finally { busy = false; prev = snapshot(); }
  }
  const MAX_CHAIN = 3;
  // a scenario started by the home can't run again within 3 s (a flickering sensor); inside a chain the once-per-chain rule applies
  const guard = (s, chained) => { const n = Date.now(); if (!chained && last[s.id] && n - last[s.id] < 3000) return false; last[s.id] = n; return true; };
  function clock() {
    const st = S(); if (!st.scenarios || document.hidden) return;
    const now = new Date(), n = nowMin(now), key = now.toDateString() + ' ' + n;
    // waits and "for X min" that are due
    const due = pending().filter((p) => p.at <= Date.now());
    if (due.length) {
      st.scnPending = pending().filter((p) => p.at > Date.now());
      due.forEach((p) => { if (p.sid) { const s = get(p.sid); if (s) runActions(s, p.from); } else applyDev({ k: 'dev', id: p.id, ch: p.ch, to: p.to }); });
      Store.save();
    }
    for (const s of autos()) {
      for (const t of s.when) {
        let hit = false;
        if (t.k === 'time') hit = toMin(t.at) === n && (t.days || ALL).includes(weekday(now));
        if (t.k === 'sun') hit = toMin(t.ev) + (+t.off || 0) === n;
        if (t.k === 'dev' && t.ev === 'openFor') { const d = dev(t.id); const k = d && keyOf(d, t.ch || 0); hit = !!(k && since[k] && Date.now() - since[k] >= t.v * 60000); if (hit) delete since[k]; }
        if (!hit) continue;
        const fk = s.id + '|' + key + '|' + JSON.stringify(t);
        if (t.k !== 'dev' && (st.scnFired || {})[s.id] === fk) continue;
        st.scnFired = Object.assign({}, st.scnFired, { [s.id]: fk });
        fire(s, cap1(triggerText(t)));
      }
    }
  }
  /** "I'm leaving / I'm back" — the phone's location in the real app; a test button in the prototype. */
  function presence(k) { autos().filter((s) => s.when.some((t) => t.k === k)).forEach((s) => fire(s, k === 'leave' ? 'Everyone left home' : 'Someone came home')); }

  function start() {
    list();
    prev = snapshot();
    Store.subscribe(() => scan());
    setInterval(() => { scan(); clock(); }, 5000);   // also catches device changes made by ticks on pages that don't save
    clock();
  }

  /* ---------- Checks for the editor ---------- */
  /** Problems a person would not see coming: two scenarios fighting, a scenario that undoes itself. */
  function warnings(s) {
    const out = [];
    const sameStart = (a, b) => a.k === b.k && (a.k === 'dev' ? a.id === b.id && (a.ch || 0) === (b.ch || 0) && a.ev === b.ev : a.k === 'time' ? a.at === b.at : a.k === 'sun' ? a.ev === b.ev && (+a.off || 0) === (+b.off || 0) : true);
    for (const o of list()) {
      if (o.id === s.id || o.manual || o.on === false || s.manual) continue;
      if (!o.when.some((a) => s.when.some((b) => sameStart(a, b)))) continue;
      for (const a of s.do) for (const b of o.do) {
        if (a.k === 'dev' && b.k === 'dev' && a.id === b.id && (a.ch || 0) === (b.ch || 0) && a.to !== b.to) out.push(`“${o.name}” starts at the same moment and does the opposite with ${nameOf(a.id, a.ch)}.`);
      }
    }
    if (!s.manual && s.on !== false) {
      if (starts(s, s)) out.push(`It changes ${nameOf(...selfDev(s))}, which starts it again — it will run only once per start, but check this is what you want.`);
      const loop = cycle(s);
      if (loop) out.push(`It and ${loop.map((x) => `“${x.name}”`).join(', ')} start each other in a circle. The hub stops after one round each time — check this is what you want.`);
    }
    return [...new Set(out)];
  }
  /* Chains: which device events an action makes, and which automations they start */
  const EV_OF = { on: 'on', off: 'off', lock: 'lock', unlock: 'unlock' };
  const evOfAct = (x) => (x.to === 'pos' ? (x.pos > 2 ? 'on' : 'off') : EV_OF[x.to]);
  /** Does scenario a (by its device actions or "run a scene") start automation b? */
  function starts(a, b) {
    if (b.manual || b.on === false) return false;
    return a.do.some((x) => (x.k === 'dev' && b.when.some((t) => t.k === 'dev' && t.id === x.id && (t.ch || 0) === (x.ch || 0) && t.ev === evOfAct(x)))
      || (x.k === 'run' && x.sid !== a.id && (() => { const o = get(x.sid); return o && starts(o, b); })()));
  }
  function selfDev(s) { const x = s.do.find((x) => x.k === 'dev' && s.when.some((t) => t.k === 'dev' && t.id === x.id && (t.ch || 0) === (x.ch || 0) && t.ev === evOfAct(x))); return [x.id, x.ch]; }
  /** Automations this one starts right after it runs (shown under "Do" in the editor). */
  function next(s) { return autos().filter((o) => o.id !== s.id && starts(s, o)); }
  /** A path s → … → s through other automations, or null. */
  function cycle(s) {
    const L = autos().map((o) => (o.id === s.id ? s : o)); if (!L.some((o) => o.id === s.id)) L.push(s);
    const seen = new Set();
    const walk = (cur, path) => {
      for (const o of L) {
        if (!starts(cur, o)) continue;
        if (o.id === s.id && path.length) return path;
        if (o.id === s.id || seen.has(o.id)) continue;
        seen.add(o.id);
        const r = walk(o, [...path, o]); if (r) return r;
      }
      return null;
    };
    return walk(s, []);
  }

  return { SUN, DAY, ALL, CAP, cap, pickable, sig, nameOf, iconOf, evOf, findIn,
    triggerText, condText, actionText, sentence, daysText, list, get, upsert, remove, ideas, builtIn, fire, runScene, isRunning, tapScene, ringHTML, statusText, isBusy, presence, warnings, next, start, condOk, whyNot };
})();
if (typeof Store !== 'undefined') Scenarios.start();
