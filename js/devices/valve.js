/* ==========================================================================
   Valve & irrigation — device interface (spec: Device Interface 3 / 21. Valve_Irrigation_Interface.html)
   One device covers three real things: the main water valve, a gas valve and garden watering timers (1–5 zones).
   Page: the valve is the button (tap to open / close); while a timer runs, a ring around it empties. Under it the
   big word (Closed = white, Open = blue, Stuck / No water = red) and what happened last. Leak sensors and gas
   detectors close it through our hub (Automation → Close on leak or gas).
   ========================================================================== */
Devices.valve = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    valve: { name: 'Open / close', grp: 'Device page', short: 'Opens or closes the water (or gas)' },
    position: { name: 'Partly open', grp: 'Device page', short: 'Stops part-way: 30 % open = less water' },
    timer: { name: 'Water for… (timer)', grp: 'Device page', short: 'Opens and closes by itself after a set time' },
    amount: { name: 'Water a set amount', grp: 'Device page', short: 'Waters until so many litres have flowed' },
    flow: { name: 'Water flow now', grp: 'Device page', short: 'Flow right now and how much the last watering used' },
    soil: { name: 'Soil moisture', grp: 'Device page', short: 'Water only when the bed is dry' },
    waterTemp: { name: 'Water temperature', grp: 'Device page', short: 'Too hot, or near freezing' },
    battery: { name: 'Battery', grp: 'Device page', short: 'Garden timers run on batteries' },
    fault: { name: 'Fault / stuck', grp: 'Device page', short: 'The motor couldn’t turn the valve' },
    zoneNames: { name: 'Zone names & icons', grp: 'General', app: true, short: 'Lawn, Vegetables, Roses — the valve only knows 1, 2, 3', row: (d) => d.ch.map((c, i) => Kit.row('va-zone', i, `Zone ${i + 1}`, c.name)).join('') },
    shortage: { name: 'No water / leak protection', grp: 'Safety', type: 'fields', def: { short: true, shortMin: 3, autoClose: true, leak: true, leakMin: 2 }, short: 'Open but nothing flows · closed but water flows',
      fields: [{ id: 'short', kind: 'tog', label: 'Alarm when open but no water flows' }, { id: 'shortMin', label: 'after', unit: 'min', min: 1, max: 10 }, { id: 'autoClose', kind: 'tog', label: 'Close the valve when water runs out' }, { id: 'leak', kind: 'tog', label: 'Alarm when water flows while closed' }, { id: 'leakMin', label: 'after', unit: 'min', min: 1, max: 10 }] },
    failSafe: { name: 'Safety close', grp: 'Safety', type: 'number', def: 120, min: 0, max: 600, unit: 'min', label: 'Close a forgotten valve after', short: 'Closes a valve opened by hand and forgotten', summary: (d, v) => (v ? `after ${Kit.dur(v * 60)}` : 'Off') },
    powerOn: { name: 'After a power cut', grp: 'Valve', type: 'choice', def: 'off', opts: [['off', 'Stay closed'], ['on', 'Open'], ['previous', 'Remember last state'], ['maintain', 'Keep as it is']], short: 'What a mains valve does when power returns' },
    childLock: { name: 'Child lock', grp: 'Valve', type: 'toggle', def: false, short: 'The button on the valve does nothing' },
    motor: { name: 'Motor settings', grp: 'Valve', type: 'fields', def: { stall: 20, inv: false }, short: 'When to report “stuck”, and which way is open',
      fields: [{ id: 'stall', label: 'Give up if not moved in', unit: 's', min: 0, max: 60, step: 5 }, { id: 'inv', kind: 'tog', label: 'Motor turns the other way' }] },
    indicator: { name: 'Status light', grp: 'Valve', type: 'choice', def: 'on_when_on', opts: [['off', 'Off'], ['on_when_on', 'On when open'], ['on_when_off', 'On when closed'], ['always', 'Always on']], short: 'The small light on the valve' },
    units: { name: 'Units', grp: 'Valve', type: 'choice', def: 'liter', opts: [['liter', 'Litres'], ['us_gallon', 'US gallons'], ['imperial_gallon', 'Imperial gallons']], short: 'Units for flow and amounts' },
    notify: { name: 'Valve notifications', grp: 'Notifications', type: 'fields', def: { done: false, dry: true, stuck: true, closedBy: true }, short: 'Which valve events send a push message',
      fields: [{ id: 'done', kind: 'tog', label: 'Watering finished' }, { id: 'dry', kind: 'tog', label: 'No water / water flows while closed' }, { id: 'stuck', kind: 'tog', label: 'Valve stuck / fault' }, { id: 'closedBy', kind: 'tog', label: 'Closed by a leak or gas alarm' }] },
    schedule: { name: 'Watering schedule', grp: 'Automation', short: 'e.g. 06:00 every 2 days, 15 min', row: (d) => Kit.row('va-sched', 's', 'Watering schedule', d.plans.filter((p) => p.on).length ? `${d.plans.filter((p) => p.on).length} on` : 'Off') },
    weather: { name: 'Rain delay & season', grp: 'Automation', type: 'fields', def: { delay: 'off', season: 100 }, short: 'Pause after rain; more water in summer',
      fields: [{ id: 'season', label: 'Water this month', unit: '%', min: 10, max: 200, hint: 'Summer 150 %, autumn 60 %' }, { id: 'delay', kind: 'sel', label: 'Skip watering after rain', opts: [['off', 'Off'], ['24h', '24 h'], ['48h', '48 h'], ['72h', '72 h']] }] },
    linkAlarms: { name: 'Close on leak or gas', grp: 'Automation', type: 'fields', app: true, def: { leak: true, gas: true }, short: 'Our hub closes this valve the moment a leak sensor or gas detector alarms',
      fields: [{ id: 'leak', kind: 'tog', label: 'Close when a leak sensor alarms' }, { id: 'gas', kind: 'tog', label: 'Close when a gas detector alarms' }] },
    exercise: { name: 'Monthly exercise', grp: 'Automation', type: 'toggle', def: true, short: 'Closes and reopens once a month at night, so it doesn’t seize up' },
    identify: { name: 'Find this device', grp: 'Valve', type: 'action', short: 'Blinks the valve', done: 'The valve is blinking' },
    history: { name: 'Water history', grp: 'Log', app: true, short: 'Litres per day and every watering' },
  };
  const GROUPS = ['Device page', 'General', 'Safety', 'Valve', 'Notifications', 'Automation', 'Log'];
  const PRESETS = [
    { id: 'actuator', name: 'Tuya valve actuator (main water)', model: 'TS0601_water_valve_1', manufacturer: 'Tuya', kind: 'pipe', names: ['Main water'], feats: ['valve', 'position', 'linkAlarms', 'exercise', 'notify', 'history'] },
    { id: 'gas', name: 'Tuya gas valve', model: 'TS0111_valve', manufacturer: 'Tuya', kind: 'gas', names: ['Gas'], feats: ['valve', 'linkAlarms', 'exercise', 'powerOn', 'indicator', 'notify', 'history'] },
    { id: 'sonoff', name: 'SONOFF smart water valve (2 zones)', model: 'SWV-ZF2', manufacturer: 'SONOFF', kind: 'garden', names: ['Lawn', 'Vegetables'], feats: ['valve', 'zoneNames', 'timer', 'amount', 'flow', 'schedule', 'weather', 'battery', 'shortage', 'failSafe', 'childLock', 'units', 'notify', 'history'] },
    { id: 'neo', name: 'NEO sprinkler timer with flow meter', model: 'NAS-WV03B', manufacturer: 'NEO', kind: 'garden', names: ['Garden'], feats: ['valve', 'timer', 'amount', 'flow', 'battery', 'shortage', 'fault', 'childLock', 'notify', 'history'] },
    { id: 'dual', name: 'Tuya dual garden valve', model: 'TS0601_water_switch', manufacturer: 'Tuya', kind: 'garden', names: ['Front lawn', 'Tomatoes'], feats: ['valve', 'zoneNames', 'timer', 'flow', 'battery', 'notify', 'history'] },
    { id: 'frank', name: 'Valve with flow & water temperature', model: 'FK-BV05', manufacturer: 'FrankEver', kind: 'pipe', names: ['Main water'], feats: ['valve', 'position', 'timer', 'flow', 'weather', 'waterTemp', 'shortage', 'fault', 'powerOn', 'linkAlarms', 'exercise', 'notify', 'history'] },
    { id: 'zones', name: '5-zone irrigation controller', model: 'AUT000069', manufacturer: 'AutomatOn', kind: 'garden', names: ['Lawn', 'Roses', 'Fruit trees', 'Vegetables', 'Hedge'], feats: ['valve', 'zoneNames', 'timer', 'powerOn', 'childLock', 'notify', 'history'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', kind: 'garden', names: ['Lawn', 'Vegetables'], feats: Object.keys(F) },
  ];
  const ICON = { pipe: 'dev-drop', gas: 'dev-flame', garden: 'seedling-fill' };
  const kindOf = (d) => (PRESETS.find((p) => p.id === d.preset) || PRESETS[0]).kind;
  const zone = (name) => ({ name, open: false, pos: 100, end: 0, total: 0, target: 0, used: 0, startedAt: 0, by: '', closedAt: 0, last: null });

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const d = Kit.base('valve', p, Object.assign({ name: p.names[0] }, opts), {
      battery: 64, ch: p.names.map(zone), cur: 0, plans: p.kind === 'garden' ? [{ at: '06:00', every: 2, min: 15, zone: 0, on: true }] : [],
      st: { fault: false, dry: false, leaking: false, rainUntil: 0, lastSeen: now - 120000, todayL: p.kind === 'garden' ? 86 : 214, days: [180, 240, 160, 210, 300, 190, 214] },
      phys: { supply: true, through: false, soil: 38, temp: 14 },
    });
    if (p.kind !== 'gas') d.ch[0].last = { t: now - 5 * 3600000, min: 15, L: 120, by: 'schedule' };
    Kit.applyDefaults(F, d);
    return d;
  }
  const applyDefaults = (d) => { Kit.applyDefaults(F, d); d.plans = d.plans || []; };
  const flowNow = (d, c) => (d.online && c.open && d.phys.supply ? +(9.2 * (c.pos / 100)).toFixed(1) : d.phys.through && !c.open ? 0.6 : 0);
  const anyOpen = (d) => d.ch.some((c) => c.open);
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;
  const unitL = (d) => ({ liter: 'L', us_gallon: 'gal', imperial_gallon: 'gal' })[has(d, 'units') ? S(d, 'units') : 'liter'];
  const vol = (d, L) => (unitL(d) === 'L' ? `${Math.round(L)} L` : `${(L / (S(d, 'units') === 'us_gallon' ? 3.785 : 4.546)).toFixed(1)} gal`);

  /* ---------- Behaviour ---------- */
  function setOpen(d, i, open, by, cfg = {}) {
    const c = d.ch[i], now = Date.now();
    if (!d.online) return false;
    if (open && d.sim.stuckNext) { d.sim.stuckNext = false; d.st.fault = true; Kit.logEv(d, 'stuck', { z: c.name }); if (has(d, 'notify') && S(d, 'notify').stuck) Kit.push(`${d.name}: valve stuck`, 'The motor couldn’t turn it', 'danger'); return false; }
    if (open === c.open && !cfg.min && !cfg.L) return false;
    if (open) {
      Object.assign(c, { open: true, startedAt: now, used: 0, by, end: cfg.min ? now + cfg.min * 60000 : 0, total: cfg.min ? cfg.min * 60000 : 0, target: cfg.L || 0 });
      Kit.logEv(d, 'open', { z: c.name, by, min: cfg.min, L: cfg.L });
    } else {
      const min = Math.max(1, Math.round((now - c.startedAt) / 60000));
      c.last = { t: c.startedAt, min, L: c.used, by: c.by };
      Object.assign(c, { open: false, end: 0, total: 0, target: 0, closedAt: now });
      Kit.logEv(d, 'close', { z: c.name, by, min, L: c.used });
      if (cfg.done && has(d, 'notify') && S(d, 'notify').done) Kit.push(`${c.name}: watering finished`, `${min} min · ${vol(d, c.last.L)}`);
    }
    d.st.lastSeen = now; d.st.dry = false;
    return true;
  }
  /** Close by an alarm elsewhere (leak sensor, gas detector). Returns true if it closed something. */
  function alarmClose(d, why, opts = {}) {
    let did = false; d.ch.forEach((c, i) => { if (c.open && setOpen(d, i, false, why)) did = true; });
    if (!d.ch.some((c) => c.open)) d.st.closedBy = { why, t: Date.now() };
    Kit.logEv(d, 'alarmClose', { why });
    if (!opts.quiet && has(d, 'notify') && S(d, 'notify').closedBy) Kit.push(`${d.name} closed`, why, 'warn');   // quiet: the alarm's own push already says it
    return did || true;
  }
  const linkable = (d, what) => d.online && has(d, 'linkAlarms') && S(d, 'linkAlarms')[what] && (what === 'gas' ? kindOf(d) === 'gas' : kindOf(d) !== 'gas');

  function tick(d) {
    const now = Date.now(); let ch = false;
    d.ch.forEach((c, i) => {
      if (!c.open) return;
      const f = flowNow(d, c); c.used += f / 60; d.st.todayL += f / 60; ch = true;
      if (c.end && now >= c.end) setOpen(d, i, false, 'timer', { done: true });
      else if (c.target && c.used >= c.target) setOpen(d, i, false, 'amount', { done: true });
      else if (has(d, 'failSafe') && S(d, 'failSafe') && !c.end && !c.target && now - c.startedAt > S(d, 'failSafe') * 60000) { setOpen(d, i, false, 'safety close'); Kit.logEv(d, 'failsafe', { z: c.name }); }
      // open but nothing flows (supply off, hose kinked)
      if (c.open && has(d, 'shortage') && S(d, 'shortage').short && !d.phys.supply && now - c.startedAt > S(d, 'shortage').shortMin * 60000 / (d.sim.fast ? 60 : 1) && !d.st.dry) {
        d.st.dry = true; Kit.logEv(d, 'dry'); if (has(d, 'notify') && S(d, 'notify').dry) Kit.push(`${d.name}: no water`, 'The valve is open but nothing flows', 'warn');
        if (S(d, 'shortage').autoClose) setOpen(d, i, false, 'no water');
      }
    });
    // closed but water flows (the valve leaks)
    if (has(d, 'shortage') && S(d, 'shortage').leak && d.phys.through && !anyOpen(d) && !d.st.leaking) { d.st.leaking = true; Kit.logEv(d, 'leakthrough'); if (has(d, 'notify') && S(d, 'notify').dry) Kit.push(`${d.name}: water flows while closed`, 'The valve is not sealing', 'danger'); ch = true; }
    return ch;
  }

  /* ---------- Text ---------- */
  const cur = (d) => d.ch[Math.min(d.cur || 0, d.ch.length - 1)];
  const left = (c) => Math.max(0, (c.end - Date.now()) / 1000);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  function word(d) {
    const c = cur(d);
    if (!d.online) return 'Unknown';
    if (d.st.fault) return 'Stuck';
    if (c.open) return kindOf(d) === 'garden' ? 'Watering' : c.pos < 100 && has(d, 'position') ? `Open ${c.pos} %` : 'Open';
    return 'Closed';
  }
  const tone = (d) => (!d.online ? '' : d.st.fault || d.st.leaking ? 'alarm' : cur(d).open ? 'on' : 'closed');
  function subText(d) {
    const c = cur(d), k = kindOf(d);
    if (!d.online) return `Last report ${when(d.st.lastSeen)}`;
    if (d.st.fault) return 'The motor couldn’t turn the valve';
    if (c.open) {
      const bits = [];
      if (c.end) bits.push(`${mmss(left(c))} left`);
      if (c.target) bits.push(`${vol(d, c.used)} of ${vol(d, c.target)}`);
      if (has(d, 'flow')) bits.push(`${flowNow(d, c)} ${unitL(d)}/min`);
      if (!bits.length) bits.push(`since ${when(c.startedAt)}`);
      return bits.join(' · ');
    }
    if (d.st.closedBy && Date.now() - d.st.closedBy.t < 12 * 3600000) return `Closed by ${d.st.closedBy.why}`;
    if (k === 'gas') return 'Gas is off';
    if (c.last) return `Last ${k === 'garden' ? 'watering' : 'opened'} ${when(c.last.t)} · ${c.last.min} min${has(d, 'flow') ? ' · ' + vol(d, c.last.L) : ''}`;
    return `Checked ${ago(Date.now() - d.st.lastSeen)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (d.st.fault) return { text: 'Stuck', tone: 'danger' };
    if (d.st.leaking) return { text: 'Leaking', tone: 'danger' };
    if (d.st.dry) return { text: 'No water', tone: 'warn' };
    const open = d.ch.filter((c) => c.open);
    if (open.length) return { text: d.ch.length > 1 ? `${open.map((c) => c.name).join(', ')} on` : kindOf(d) === 'garden' ? 'Watering' : 'Open' };
    if (battLow(d)) return { text: 'Battery low', tone: 'warn' };
    return { text: 'Closed' };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: ICON[kindOf(d)], on: anyOpen(d) && d.online, accent: 'var(--primary)', status: s.text, tone: s.tone, alert: d.online && (d.st.fault || d.st.leaking), controllable: has(d, 'valve') && d.online && !d.st.fault, offline: !d.online }]; };
  function toggle(d) { if (d.st.fault) return; const open = !anyOpen(d); if (open) setOpen(d, 0, true, 'app'); else d.ch.forEach((c, i) => setOpen(d, i, false, 'app')); }

  /* ---------- Device page ---------- */
  function page(d) {
    const st = d.st, c = cur(d), k = kindOf(d), R = 60, L = 2 * Math.PI * R;
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (st.leaking) h += Kit.banner('ban-leak', 'danger', 'dev-drop', '<b>Water flows while closed</b> · The valve is not sealing — call a plumber');
    if (st.dry) h += Kit.banner('ban-dry', 'warn', 'banner-error', '<b>No water came</b> · Is the supply tap open? Is the hose kinked?', 'va-dry-ok');
    if (st.rainUntil > Date.now()) h += Kit.banner('ban-rain', 'info', 'round-info', `<b>Rain delay</b> · Watering skipped until ${when(st.rainUntil)}`);
    if (battLow(d)) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    if (d.ch.length > 1) h += `<div class="pad" data-key="zones" style="margin-top:8px">${UI.segTabs(d.ch.map((x) => x.name), d.cur || 0, 'va-zone-pick')}</div>`;
    // open / close first, right under the zone tabs — the same big toggle as relay and light (user, 2026-11-19);
    // its label is the state, so there is no big status word and no picture; the line under it tells the rest
    const garden = kindOf(d) === 'garden', lab = !d.online ? 'Offline' : st.fault ? 'Stuck' : c.open ? (garden ? 'Watering' : 'Open') : 'Closed';
    if (has(d, 'valve')) h += `<div class="power-area va-power" data-key="toggle"><button class="power-toggle va-toggle" aria-pressed="${d.online && c.open}" data-action="va-tap" ${!d.online || st.fault ? 'disabled' : ''} aria-label="${c.open ? 'Close' : 'Open'} ${esc(c.name)}">
        <span class="label">${lab}</span><span class="knob">${icon(k === 'gas' ? 'dev-flame' : 'dev-drop', 'icon', 'style="width:40px;height:40px"')}</span></button>
        <div class="t-sm c-secondary power-sub ${tone(d) === 'alarm' ? 'is-alarm' : ''}" data-num data-live="sub">${esc(subText(d))}</div></div>`;
    else h += Kit.readout(word(d), tone(d), subText(d), '');
    // part-way (pipe valves)
    if (has(d, 'position') && c.open) h += `<div class="pad" data-key="pos" style="margin-top:16px"><div class="segmented">${[25, 50, 75, 100].map((p) => `<button class="${c.pos === p ? 'on' : ''}" data-action="va-pos" data-v="${p}">${p} %</button>`).join('')}</div></div>`;
    // timer / amount: tap-in rows like the Timer on light and relay (user, 2026-11-19 — not two buttons side by side)
    const dis = !d.online || st.fault ? 'aria-disabled="true"' : '', rows = [];
    if (has(d, 'timer')) rows.push(`<button class="cell has-icon" data-action="va-timer" ${dis}><span class="cell-icon">${icon('clock')}</span>
        <span class="cell-main cell-title">${k === 'garden' ? 'Water for' : 'Open for'}</span><span class="cell-value" data-num data-live="va-left">${c.open && c.end ? `${mmss(left(c))} left` : ''}</span>${icon('chevron-right', 'chev')}</button>`);
    if (has(d, 'amount')) rows.push(`<button class="cell has-icon" data-action="va-amount" ${dis}><span class="cell-icon">${icon('dev-drop')}</span>
        <span class="cell-main cell-title">Water ${unitL(d) === 'L' ? 'litres' : 'gallons'}</span><span class="cell-value" data-num data-live="va-vol">${c.open && c.target ? `${vol(d, c.used)} of ${vol(d, c.target)}` : ''}</span>${icon('chevron-right', 'chev')}</button>`);
    if (rows.length) h += `<div class="list" data-key="controls" style="margin-top:24px">${rows.join('')}</div>`;
    h += Kit.cards([
      has(d, 'flow') && ['Flow now', `${flowNow(d, c)} ${unitL(d)}/min`, { count: true }],
      has(d, 'flow') && ['Used today', vol(d, st.todayL), { count: true }],
      has(d, 'soil') && ['Soil moisture', `${d.phys.soil} %`, { count: true }],
      has(d, 'waterTemp') && ['Water', `${d.phys.temp.toFixed(1)} °C`, { count: true }],
      has(d, 'battery') && [battLow(d) ? 'Battery · replace soon' : 'Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    if (has(d, 'schedule')) { const p = d.plans.filter((x) => x.on); h += Kit.actionRow('sched-row', 'va-sched', 'Watering schedule', p.length ? p.map((x) => `${x.at} · ${d.ch[x.zone] ? d.ch[x.zone].name : ''} · ${x.min} min`).join(', ') : 'No schedule yet'); }
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) {
    const c = cur(d); UI.setNum(root.querySelector('[data-live="sub"]'), subText(d));
    const lv = root.querySelector('[data-live="va-left"]'); if (lv) UI.setNum(lv, c.open && c.end ? `${mmss(left(c))} left` : '');
    const vv = root.querySelector('[data-live="va-vol"]'); if (vv) UI.setNum(vv, c.open && c.target ? `${vol(d, c.used)} of ${vol(d, c.target)}` : '');
    const r = root.querySelector('[data-live="ring"]'); if (r) { const L = 2 * Math.PI * 60, frac = c.open && c.total ? left(c) * 1000 / c.total : c.open && c.target ? 1 - c.used / c.target : 0; r.style.strokeDashoffset = (L * (1 - frac)).toFixed(1); }
  }
  function openTimer(d, ctx, amount) {
    const c = cur(d), u = unitL(d), garden = kindOf(d) === 'garden';
    Kit.pickSheet({
      title: amount ? `Water ${c.name}` : `${garden ? 'Water' : 'Open'} ${c.name} for`, sub: amount ? 'Closes by itself when this much has flowed' : 'Closes by itself when the time is up',
      presets: amount ? [[10, `10 ${u}`], [20, `20 ${u}`], [50, `50 ${u}`], [100, `100 ${u}`], [200, `200 ${u}`]] : [[5, '5 min'], [10, '10 min'], [15, '15 min'], [30, '30 min'], [60, '1 h']],
      value: amount ? (d.sim.lastL || 20) : (d.sim.lastMin || 15),
      time: amount ? { max: 1000, step: 5, unit: u } : true,
      endText: amount ? null : (m) => `Closes at ${UI.fmtTime(Date.now() + m * 60000)}`,
      go: (v) => `Start · ${amount ? `${v} ${u}` : Kit.dur(v * 60)}`,
      onGo: (pick) => { if (amount) d.sim.lastL = pick; else d.sim.lastMin = pick; if (c.open) setOpen(d, d.cur || 0, false, 'app'); setOpen(d, d.cur || 0, true, 'app', amount ? { L: pick } : { min: pick }); Store.save(); UI.closeSheet(); ctx.render(); },
    });
  }
  function bindPage(d, ctx) {
    UI.on({
      'va-tap': () => { if (!d.online || d.st.fault) return; const c = cur(d); if (!c.open && d.st.rainUntil > Date.now() && kindOf(d) === 'garden') UI.toast('Rain delay is on — opening anyway'); setOpen(d, d.cur || 0, !c.open, 'app'); Store.save(); ctx.render(); },
      'va-zone-pick': ({ ch }) => { d.cur = +ch; Store.save(); ctx.render(); },
      'va-pos': ({ v }) => { cur(d).pos = +v; Kit.logEv(d, 'pos', { text: `${cur(d).name} opened ${v} %` }); Store.save(); ctx.render(); },
      'va-timer': () => { if (d.online && !d.st.fault) openTimer(d, ctx, false); },
      'va-amount': () => { if (d.online && !d.st.fault) openTimer(d, ctx, true); },
      'va-dry-ok': () => { d.st.dry = false; Store.save(); ctx.render(); },
      'va-sched': () => openSchedule(d, ctx),
    });
  }

  /* ---------- Schedule ---------- */
  function openSchedule(d, ctx) {
    // a plan row opens the plan (edit / turn off / delete) — like the lock's PIN codes (user, 2026-11-19: no way to delete a plan)
    const planSub = (p) => (p.on ? (p.every === 1 ? 'Every day' : p.every === 7 ? 'Once a week' : `Every ${p.every} days`) : 'Turned off');
    const s = UI.sheet({
      title: 'Watering schedule', sub: 'Runs on our hub — works without internet',
      render: () => `${d.plans.length ? `<div class="list">${d.plans.map((p, i) => `<button class="cell" data-action="va-plan" data-i="${i}"><span class="cell-main"><span class="cell-title" style="display:block">${p.at} · ${esc(d.ch[p.zone] ? d.ch[p.zone].name : 'Zone')} · ${p.min} min</span><span class="cell-sub" style="display:block">${planSub(p)}</span></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>` : '<div class="pad"><p class="t-sm c-secondary">No plans yet — add one and the hub waters by itself.</p></div>'}
        <div class="pad" style="margin-top:16px"><button class="btn btn-glass btn-block" data-action="va-plan-add">${icon('plus')} Add a plan</button></div>
        ${has(d, 'weather') && S(d, 'weather').season !== 100 ? `<div class="list-footer">This month every plan waters ${S(d, 'weather').season} % of its time.</div>` : ''}`,
    });
    UI.on({
      'va-plan': ({ i }) => openPlan(d, ctx, +i),
      'va-plan-add': () => openPlan(d, ctx, -1),
    });
    return s;
  }
  /* one plan: works on/off, start time (the app's clock wheel), how long, zone, repeat; Delete last.
     i = -1 → a new plan (a draft until 'Add plan') */
  function openPlan(d, ctx, i) {
    const fresh = i < 0, p = fresh ? { at: '06:00', every: 1, min: 10, zone: d.cur || 0, on: true } : d.plans[i];
    const back = () => openSchedule(d, ctx), keep = () => { if (!fresh) { Store.save(); ctx.render(); } };
    const s = UI.sheet({
      title: fresh ? 'New plan' : 'Watering plan', sub: fresh ? 'When the hub should water by itself' : '',
      render: () => `${fresh ? '' : `<div class="list">${Kit.sw('va-p-on', 'on', 'Plan works', 'Turn off for a while without deleting it', p.on)}</div>`}
        ${UI.group('Starts at', `<div class="tw tw-clock">${UI.wheelHTML('ph', 23, +p.at.split(':')[0], '', true)}<span class="tw-colon">:</span>${UI.wheelHTML('pm', 59, +p.at.split(':')[1], '', true)}</div>`)}
        ${UI.group('', `<div class="cell"><span class="cell-main cell-title">How long</span>${Kit.stepper('va-p-min', 'min', `${p.min} min`, p.min <= 5, p.min >= 120)}</div>`)}
        ${d.ch.length > 1 ? UI.group('Zone', Kit.radio('va-p-zone', p.zone, d.ch.map((c, z) => [z, c.name]))) : ''}
        ${UI.group('Repeat', Kit.radio('va-p-every', p.every, [[1, 'Every day'], [2, 'Every 2 days'], [3, 'Every 3 days'], [7, 'Once a week']]))}
        ${fresh ? '' : '<div class="pad" style="margin-top:24px"><button class="btn btn-danger btn-block" data-action="va-p-del">Delete this plan</button></div>'}`,
      footer: fresh ? '<div class="tw-btns"><button class="btn btn-secondary" data-action="va-p-back">Back</button><button class="btn btn-primary" data-action="va-p-save">Add plan</button></div>'
        : '<button class="btn btn-glass btn-block" data-action="va-p-back">Back</button>',
      onMount: (el) => UI.bindWheels(el, (k) => +p.at.split(':')[k === 'ph' ? 0 : 1], (k, v) => { const t = p.at.split(':'); t[k === 'ph' ? 0 : 1] = String(v).padStart(2, '0'); p.at = t.join(':'); keep(); }),
    });
    UI.on({
      'va-p-on': () => { p.on = !p.on; keep(); s.refresh(); },
      'va-p-min': ({ d: dir }) => { p.min = Math.max(5, Math.min(120, p.min + 5 * +dir)); keep(); s.refresh(); },
      'va-p-zone': ({ v }) => { p.zone = +v; keep(); s.refresh(); },
      'va-p-every': ({ v }) => { p.every = +v; keep(); s.refresh(); },
      'va-p-save': () => { d.plans.push(p); Store.save(); ctx.render(); back(); UI.toast('Plan added'); },
      'va-p-del': () => UI.confirm({ title: 'Delete this plan?', text: `${p.at} · ${p.min} min — the hub stops watering at this time.`, ok: 'Delete', onOk: () => { d.plans.splice(i, 1); Store.save(); ctx.render(); back(); UI.toast('Plan deleted'); } }),
      'va-p-back': back,
    });
  }


  /* ---------- Settings ---------- */
  /* a gas valve's settings speak about gas, not water (user, 2026-11-19) */
  const FG = Object.assign({}, F, {
    valve: Object.assign({}, F.valve, { short: 'Opens or closes the gas' }),
    history: Object.assign({}, F.history, { name: 'History', short: 'Every time it opened and closed' }),
    notify: Object.assign({}, F.notify, { fields: F.notify.fields.filter((f) => f.id === 'stuck' || f.id === 'closedBy').map((f) => (f.id === 'closedBy' ? Object.assign({}, f, { label: 'Closed by a gas alarm' }) : f)) }),
    linkAlarms: Object.assign({}, F.linkAlarms, { name: 'Close on gas', short: 'Our hub closes this valve the moment a gas detector alarms', fields: F.linkAlarms.fields.filter((f) => f.id === 'gas') }),
  });
  const FK = (d) => (kindOf(d) === 'gas' ? FG : F);
  function settings(d) { return Kit.settingsHTML(FK(d), GROUPS, d, { foot: { Automation: 'Our hub runs these, even without internet.', Safety: 'Stored in the valve — it works without our hub.' } }); }
  const EV = {
    open: (e) => `${e.z} opened${e.min ? ` for ${e.min} min` : e.L ? ` for ${e.L} L` : ''}${e.by && e.by !== 'app' ? ' · ' + e.by : ''}`,
    close: (e) => `${e.z} closed · ${e.min} min${e.L ? ` · ${Math.round(e.L)} L` : ''}${e.by && !['app', 'timer', 'amount'].includes(e.by) ? ' · ' + e.by : ''}`,
    alarmClose: (e) => `Closed: ${e.why}`, stuck: 'Valve stuck', dry: 'No water came', leakthrough: 'Water flowed while closed', failsafe: 'Safety close — open too long', offline: 'Stopped answering', rain: 'Rain — watering skipped',
  };
  function chart(d) {
    const mx = Math.max(...d.st.days, d.st.todayL, 1), labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    return `<div class="pad"><div class="info-card wide sm-level"><span>Last 7 days</span><b>${vol(d, d.st.todayL)} today</b><div class="pl-bars">${d.st.days.map((v, i) => `<i style="height:${Math.max(6, v / mx * 100).toFixed(0)}%" title="${Math.round(v)} L"><s>${labels[i]}</s></i>`).join('')}</div></div></div><div style="height:24px"></div>`;
  }
  function bindSettings(d, ctx) {
    Kit.bindSettings(FK(d), d, ctx);
    UI.on({
      'va-zone': ({ k }) => UI.prompt({ title: `Zone ${+k + 1}`, label: 'Name', value: d.ch[+k].name, onOk: (v) => { d.ch[+k].name = v; Store.save(); ctx.render(); } }),
      'va-sched': () => openSchedule(d, ctx),
      'rs-history': () => Kit.historySheet(d, EV, 'Every opening and how much water flowed', has(d, 'flow') ? () => chart(d) : null),
    });
  }
  const about = (d) => [['State', word(d)], ['Zones', `${d.ch.length}`], ...(has(d, 'battery') ? [['Battery', `${d.battery} %`]] : [])];

  /* ---------- Prototype ---------- */
  function protoPanel(d) {
    const k = kindOf(d);
    return Kit.protoHead('Valve prototype', '21. Valve_Irrigation_Interface.html', PRESETS, d) + `
      <h3>The water · <span style="font-weight:400">${d.phys.supply ? 'supply on' : 'supply off'}${d.phys.through ? ' · seat leaking' : ''}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-button', '👆 Press the button on the valve')}${Kit.ppBtn('pp-supply', d.phys.supply ? '🚱 Supply off (no water)' : '🚰 Supply back', k !== 'gas')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-through', d.phys.through ? '🔧 Seat fixed' : '💧 Valve leaks when closed', has(d, 'shortage'))}${Kit.ppBtn('pp-rain', '🌧 It rained', has(d, 'weather'))}${Kit.ppBtn('pp-soil', d.phys.soil < 30 ? '💦 Soil wet' : '🏜 Soil dry', has(d, 'soil'))}</div>
      <h3>The valve</h3>
      <div class="pp-row">${Kit.ppBtn('pp-stuck', d.st.fault ? '🛠 Freed' : '⚙️ Stuck next time')}${Kit.ppBtn('pp-batt', battLow(d) ? '🔋 New battery' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-button': () => { if (has(d, 'childLock') && S(d, 'childLock')) return 'Child lock — the button does nothing'; const c = cur(d); setOpen(d, d.cur || 0, !c.open, 'button'); },
      'pp-supply': () => { d.phys.supply = !d.phys.supply; d.sim.fast = !d.phys.supply; if (d.phys.supply) d.st.dry = false; return d.phys.supply ? '' : 'Open the valve — after a moment the valve says “no water” (sped up)'; },
      'pp-through': () => { d.phys.through = !d.phys.through; if (!d.phys.through) d.st.leaking = false; },
      'pp-rain': () => { const h = { off: 0, '24h': 24, '48h': 48, '72h': 72 }[S(d, 'weather').delay]; if (!h) return 'Rain delay is Off in Settings → Automation'; d.st.rainUntil = Date.now() + h * 3600000; Kit.logEv(d, 'rain'); },
      'pp-soil': () => { d.phys.soil = d.phys.soil < 30 ? 62 : 18; },
      'pp-stuck': () => { if (d.st.fault) { d.st.fault = false; return; } d.sim.stuckNext = true; return 'Next time it opens, the motor will stick'; },
      'pp-batt': () => { d.battery = battLow(d) ? 100 : 12; },
      'pp-online': () => { d.online = !d.online; if (!d.online) Kit.logEv(d, 'offline'); else d.st.lastSeen = Date.now(); },
    }, (dd, p) => { dd.ch = p.names.map(zone); dd.cur = 0; dd.plans = p.kind === 'garden' ? [{ at: '06:00', every: 2, min: 15, zone: 0, on: true }] : []; });
  }

  return {
    label: 'Valve', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'Water valve',
    icon: (d) => ICON[kindOf(d)] || 'dev-drop', describe: (p) => `${p.manufacturer} · ${p.kind === 'garden' ? 'watering timer' : p.kind === 'gas' ? 'gas valve' : 'water valve'}`,
    historyValue: (d) => (has(d, 'history') ? vol(d, d.st.todayL) + ' today' : null),
    homeTiles, toggle, page, bindPage, live, settings, bindSettings, about, tick, busy: (d) => anyOpen(d),
    protoPanel, bindProto, alarmClose, linkable, kindOf,
  };
})();
