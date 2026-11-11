/* ==========================================================================
   Energy meter — device interface (spec: Device Interface 3 / 13. Energy_Meter_Interface.html)
   The question people ask is “how much am I using right now, and how close am I to the limit?” — so the page
   opens with a half-ring gauge: the power now in the middle, the ring filling toward the meter's limit (calm →
   orange near the limit → red when it trips). Below: phases, today / month, prepaid balance, the main switch.
   ========================================================================== */
Devices.meter = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    power: { name: 'Power now', grp: 'Device page', short: 'How much the house uses right now' },
    energy: { name: 'Energy total', grp: 'Device page', short: 'The kWh your bill is based on' },
    solar: { name: 'Solar / sent to the grid', grp: 'Device page', short: 'Energy your panels send back' },
    phases: { name: 'Phases', grp: 'Device page', short: 'L1, L2, L3 measured separately' },
    quality: { name: 'Frequency & power factor', grp: 'Device page', short: 'Technical details of the supply' },
    tariffs: { name: 'Tariff zones', grp: 'Device page', short: 'Day and night counted separately' },
    relayState: { name: 'Main switch', grp: 'Device page', short: 'Switches the whole circuit on and off' },
    prepay: { name: 'Prepaid balance', grp: 'Device page', type: 'fields', def: { on: true, low: 5, trip: true }, short: 'Load kWh; the meter counts down and switches off when used up',
      fields: [{ id: 'on', kind: 'tog', label: 'Prepayment on', noSum: true }, { id: 'low', label: 'Warn when below', unit: 'kWh', min: 0, max: 100 }, { id: 'trip', kind: 'tog', label: 'Switch off when it runs out' }] },
    leakage: { name: 'Leakage current (RCD)', grp: 'Safety', type: 'fields', def: { limit: 30, trip: true, auto: false, days: 30 }, short: 'Current leaking to earth — through damaged wires or a person',
      fields: [{ id: 'limit', label: 'Trip above', unit: 'mA', min: 10, max: 300, step: 10 }, { id: 'trip', kind: 'tog', label: 'Switch off (not only report)' }, { id: 'auto', kind: 'tog', label: 'Self-test automatically' }, { id: 'days', label: 'every', unit: 'days', min: 1, max: 90 }] },
    protection: { name: 'Protection limits', grp: 'Safety', type: 'fields', def: { maxV: 253, minV: 180, maxA: 63, maxW: 13000, maxT: 80, act: 'trip' }, short: 'Voltage, current, power and temperature limits stored in the meter',
      fields: [{ id: 'maxV', label: 'Voltage too high', unit: 'V', min: 230, max: 280 }, { id: 'minV', label: 'Voltage too low', unit: 'V', min: 150, max: 220 }, { id: 'maxA', label: 'Current too high', unit: 'A', min: 10, max: 100, step: 1 }, { id: 'maxW', label: 'Power too high', unit: 'W', min: 1000, max: 25000, step: 500 }, { id: 'maxT', label: 'Meter too hot', unit: '°C', min: 50, max: 100 }, { id: 'act', kind: 'sel', label: 'Above a limit', opts: [['trip', 'Cut the power', 'Safest'], ['alarm', 'Only tell me']] }] },
    phaseAlarms: { name: 'Phase loss & unbalance', grp: 'Safety', type: 'fields', def: { loss: true, unb: false, unbT: 15, neg: false }, short: 'A phase is gone, phases very unequal, power flows back',
      fields: [{ id: 'loss', kind: 'tog', label: 'Alarm when a phase is missing' }, { id: 'unb', kind: 'tog', label: 'Alarm on unbalanced load' }, { id: 'unbT', label: 'Unbalance limit', unit: '%', min: 5, max: 50 }, { id: 'neg', kind: 'tog', label: 'Alarm when power flows back' }] },
    reclose: { name: 'Turn back on after a trip', grp: 'Safety', type: 'fields', def: { on: true, delay: 60, count: 3 }, short: 'After bad voltage, switch back on when it is normal again',
      fields: [{ id: 'on', kind: 'tog', label: 'Auto-reclose', noSum: true }, { id: 'delay', label: 'Wait', unit: 's', min: 5, max: 600 }, { id: 'count', label: 'Try at most', unit: 'times', min: 1, max: 10 }] },
    faults: { name: 'Faults & events', grp: 'Safety', short: 'Over-voltage, over-current, overheating, leakage', hidden: true },
    timer: { name: 'Timer', grp: 'Main switch', type: 'action', short: 'Switch off once after a time — “water heater off in 2 hours”' },
    powerOn: { name: 'After a power cut', grp: 'Main switch', type: 'choice', def: 'previous', opts: [['off', 'Stay off'], ['on', 'Turn on'], ['previous', 'Remember last state'], ['toggle', 'Opposite of before']], short: 'What the switch does when the grid comes back' },
    inching: { name: 'Auto-off', grp: 'Main switch', type: 'fields', def: { on: false, min: 0, sec: 30 }, short: 'After every turn-on, turns off again after a time',
      fields: [{ id: 'on', kind: 'tog', label: 'Auto-off on', noSum: true }, { id: 'min', label: 'Minutes', unit: 'min', min: 0, max: 59 }, { id: 'sec', label: 'Seconds', unit: 's', min: 0, max: 55, step: 5 }] },
    updateFreq: { name: 'How often it reports', grp: 'Reporting', type: 'number', def: 10, min: 1, max: 300, unit: 's', label: 'Every', short: 'How often new values are sent' },
    clamp: { name: 'Clamp direction & calibration', grp: 'Reporting', type: 'fields', def: { rev: false, v: 100, a: 100, w: 100 }, short: 'A clamp on backwards, or readings a few % off',
      fields: [{ id: 'rev', kind: 'tog', label: 'Clamp is on the other way round' }, { id: 'v', label: 'Voltage correction', unit: '%', min: 80, max: 120 }, { id: 'a', label: 'Current correction', unit: '%', min: 80, max: 120 }, { id: 'w', label: 'Power correction', unit: '%', min: 80, max: 120 }] },
    deviceTemp: { name: 'Meter temperature', grp: 'Device', short: 'Too hot = overload or a loose screw', hidden: true },
    meterInfo: { name: 'Meter ID & serial', grp: 'Device', short: 'For matching with the utility bill', hidden: true },
    battery: { name: 'Battery', grp: 'Device', short: 'Optical readers report battery', hidden: true },
    resetEnergy: { name: 'Reset energy counters', grp: 'Device', type: 'action', short: 'Sets the kWh totals back to zero' },
    identify: { name: 'Find this device', grp: 'Device', type: 'action', short: 'Blinks the meter in a full panel', done: 'The meter is blinking' },
    notify: { name: 'Meter notifications', grp: 'Notifications', type: 'fields', app: true, def: { fault: true, grid: true, lowBal: true, high: false, highKW: 6 }, short: 'Trip, grid lost, balance low, high use',
      fields: [{ id: 'fault', kind: 'tog', label: 'Tripped / fault' }, { id: 'grid', kind: 'tog', label: 'Grid power lost / back' }, { id: 'lowBal', kind: 'tog', label: 'Prepaid balance low', hint: 'Prepaid meters only' }, { id: 'high', kind: 'tog', label: 'High use' }, { id: 'highKW', label: 'above', unit: 'kW', min: 1, max: 20 }] },
    history: { name: 'Energy history', grp: 'Log', app: true, short: 'Today, 7 days and the month' },
  };
  const GROUPS = ['Device page', 'Safety', 'Main switch', 'Reporting', 'Device', 'Notifications', 'Automation', 'Log'];
  const PRESETS = [
    { id: 'din', name: 'Tuya DIN meter with relay', model: 'TS0601_din_2', manufacturer: 'MatSee', names: ['L'], feats: ['power', 'energy', 'relayState', 'protection', 'faults', 'meterInfo', 'history', 'notify'] },
    { id: 'd5z', name: 'Nous D5Z — relay, RCD, prepaid', model: 'D5Z', manufacturer: 'Nous', names: ['L'], feats: ['power', 'energy', 'solar', 'relayState', 'prepay', 'leakage', 'protection', 'reclose', 'faults', 'timer', 'powerOn', 'inching', 'deviceTemp', 'history', 'notify'] },
    { id: 'clamp2', name: 'Bidirectional 2-clamp meter', model: 'PC311-Z-TY', manufacturer: 'Tuya', names: ['Grid', 'Solar'], feats: ['power', 'energy', 'solar', 'phases', 'quality', 'updateFreq', 'clamp', 'history', 'notify'] },
    { id: 'pc321', name: 'OWON 3-phase clamp meter', model: 'PC321', manufacturer: 'OWON', names: ['L1', 'L2', 'L3'], feats: ['power', 'energy', 'phases', 'quality', 'history', 'updateFreq', 'resetEnergy', 'notify'] },
    { id: 'd4z', name: 'Nous D4Z 3-phase DIN monitor', model: 'D4Z', manufacturer: 'Nous', names: ['L1', 'L2', 'L3'], feats: ['power', 'energy', 'solar', 'phases', 'quality', 'protection', 'phaseAlarms', 'faults', 'updateFreq', 'resetEnergy', 'identify', 'history', 'notify'], v: { protection: { maxV: 253, minV: 180, maxA: 100, maxW: 25000, maxT: 80, act: 'alarm' } } },
    { id: 'tongou', name: 'Tongou clamp meter with limits', model: 'TO-Q-SA1', manufacturer: 'Tongou', names: ['L'], feats: ['power', 'energy', 'quality', 'protection', 'faults', 'deviceTemp', 'history', 'notify'], v: { protection: { maxV: 253, minV: 180, maxA: 63, maxW: 13000, maxT: 80, act: 'alarm' } } },
    { id: 'optical', name: 'Optical reader on a tariff meter', model: 'TLSR8258', manufacturer: 'Slacky-DIY', names: ['L'], feats: ['power', 'energy', 'tariffs', 'meterInfo', 'battery', 'deviceTemp', 'history', 'notify'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', names: ['L1', 'L2', 'L3'], feats: Object.keys(F) },
  ];
  const presetOf = (d) => PRESETS.find((p) => p.id === d.preset) || PRESETS[0];

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const d = Kit.base('meter', p, Object.assign({ name: 'Energy meter' }, opts), {
      battery: 70, names: p.names.slice(), utilityId: 'UZ-' + Math.floor(10000000 + Math.random() * 89999999),
      st: { relay: true, grid: true, trip: null, tripAt: 0, recl: 0, timerEnd: 0, balance: 42.6, kWh: 18432.7, exp: 812.4, day: 12611.2, night: 5821.5, today: 6.4, month: 214, days: [11.2, 9.8, 14.1, 12.6, 8.9, 10.4, 13.3], leak: 4, temp: 36, lastSeen: now - 8000, hz: 50.01, inchEnd: 0 },
      phys: { load: 1850, v: 229, solar: has0(p, 'solar') ? 640 : 0, leak: 4, lost: -1 },
    });
    Kit.applyDefaults(F, d); if (p.v) Object.assign(d.settings, Kit.clone(p.v));
    return d;
  }
  function has0(p, k) { return p.feats.includes(k); }
  const applyDefaults = (d) => { Kit.applyDefaults(F, d); d.names = d.names || presetOf(d).names.slice(); };
  const n = (d) => d.names.length;
  const on = (d) => d.online && d.st.grid && (!has(d, 'relayState') || d.st.relay);
  const solarOn = (d) => has(d, 'solar') && d.phys.solar > 0;
  /** Power per phase (W). Clamp 2: A = grid (house use − solar), B = solar production. */
  function phaseW(d) {
    if (!on(d)) return d.names.map(() => 0);
    const L = d.phys.load;
    if (d.preset === 'clamp2') return [Math.round(L - d.phys.solar), Math.round(d.phys.solar)];
    const w = n(d) === 3 ? [0.46, 0.31, 0.23] : [1]; return w.map((x, i) => (d.phys.lost === i ? 0 : Math.round(L * x)));
  }
  const totalW = (d) => (d.preset === 'clamp2' ? Math.max(0, phaseW(d)[0]) : phaseW(d).reduce((a, b) => a + b, 0));
  const limitW = (d) => (has(d, 'protection') ? S(d, 'protection').maxW : n(d) === 3 ? 25000 : 13000);
  const kw = (w) => `${(w / 1000).toFixed(w >= 10000 ? 1 : 2)} kW`;

  /* ---------- Behaviour ---------- */
  function trip(d, why) {
    const st = d.st; if (!st.relay && st.trip) return;
    st.relay = has(d, 'relayState') ? false : st.relay; st.trip = why; st.tripAt = Date.now();
    Kit.logEv(d, 'trip', { why });
    if (S(d, 'notify').fault) Kit.push(`${d.name}: ${has(d, 'relayState') ? 'power cut for safety' : 'alarm'}`, why, 'danger');
  }
  function setRelay(d, v, why) {
    const st = d.st; st.relay = v; st.trip = v ? null : st.trip; Kit.logEv(d, v ? 'on' : 'off', { why });
    if (v && has(d, 'inching') && S(d, 'inching').on) st.inchEnd = Date.now() + (S(d, 'inching').min * 60 + S(d, 'inching').sec) * 1000;
    if (!v) { st.timerEnd = 0; st.inchEnd = 0; }
  }
  function tick(d) {
    if (!d.online) return false;
    const st = d.st, P = d.phys, now = Date.now();
    const W = totalW(d), kWh = W / 3600000 * (d.sim.fast ? 600 : 1);
    st.kWh += kWh; st.today += kWh; st.month += kWh; if (new Date().getHours() >= 23 || new Date().getHours() < 7) st.night += kWh; else st.day += kWh;
    if (solarOn(d) && on(d)) st.exp += Math.max(0, P.solar - P.load) / 3600000;
    // prepaid countdown
    if (has(d, 'prepay') && S(d, 'prepay').on && on(d)) {
      const b0 = st.balance; st.balance = Math.max(0, st.balance - kWh);
      if (b0 > S(d, 'prepay').low && st.balance <= S(d, 'prepay').low) { Kit.logEv(d, 'low'); if (S(d, 'notify').lowBal) Kit.push(`${d.name}: balance low`, `${st.balance.toFixed(1)} kWh left — top up`, 'warn'); }
      if (st.balance <= 0 && S(d, 'prepay').trip && st.relay) { setRelay(d, false, 'balance used up'); Kit.push(`${d.name}: balance used up`, 'The power is off until you top up', 'danger'); }
    }
    // protection
    if (has(d, 'protection') && on(d)) {
      const pr = S(d, 'protection'), A = W / P.v;
      const why = P.v > pr.maxV ? `Voltage too high · ${P.v} V` : P.v < pr.minV ? `Voltage too low · ${P.v} V` : W > pr.maxW ? `Power too high · ${kw(W)}` : A > pr.maxA ? `Current too high · ${A.toFixed(0)} A` : st.temp > pr.maxT ? `Meter too hot · ${st.temp} °C` : '';
      if (why && !st.trip) { if (pr.act === 'trip' && has(d, 'relayState')) trip(d, why); else { st.trip = why; st.tripAt = now; Kit.logEv(d, 'alarm', { why }); if (S(d, 'notify').fault) Kit.push(`${d.name}: ${why}`, 'Above the limit', 'warn'); } }
      if (!why && st.trip && pr.act !== 'trip') st.trip = null;
    }
    if (has(d, 'leakage') && P.leak > S(d, 'leakage').limit && on(d) && S(d, 'leakage').trip) trip(d, `Leakage ${P.leak} mA — check for damaged wires`);
    // reclose after a voltage trip
    if (st.trip && /Voltage/.test(st.trip) && has(d, 'reclose') && S(d, 'reclose').on && !st.relay && P.v <= S(d, 'protection').maxV && P.v >= S(d, 'protection').minV && st.recl < S(d, 'reclose').count && now - st.tripAt > S(d, 'reclose').delay * 1000 / (d.sim.fast ? 30 : 1)) { st.recl++; setRelay(d, true, 'auto-reclose'); }
    if (st.timerEnd && now >= st.timerEnd) { setRelay(d, false, 'timer'); }
    if (st.inchEnd && now >= st.inchEnd) { setRelay(d, false, 'auto-off'); }
    if (has(d, 'notify') && S(d, 'notify').high && on(d)) { const hi = W > S(d, 'notify').highKW * 1000; if (hi && !st.highSent) { st.highSent = true; Kit.push(`${d.name}: high use`, kw(W)); } if (!hi) st.highSent = false; }
    st.hz = +(50 + (Math.random() - 0.5) * 0.04).toFixed(2); st.lastSeen = now;
    return true;
  }

  /* ---------- Text ---------- */
  function word(d) {
    if (!d.online) return 'Unknown';
    if (!d.st.grid) return 'No power';
    if (has(d, 'relayState') && !d.st.relay) return d.st.trip ? 'Cut for safety' : 'Switched off';
    return kw(totalW(d));
  }
  function subText(d) {
    const st = d.st;
    if (!d.online) return `Last report ${when(st.lastSeen)}`;
    if (!st.grid) return 'The grid is off — nothing to measure';
    if (has(d, 'relayState') && !st.relay) return st.trip || (st.balance <= 0 ? 'Prepaid balance used up' : 'Main switch is off');
    const bits = ['Using now'];
    if (solarOn(d)) { const ex = d.phys.solar - d.phys.load; bits.push(ex > 0 ? `solar sends ${kw(ex)} to the grid` : `solar covers ${kw(d.phys.solar)}`); }
    if (st.timerEnd) bits.push(`off in ${Kit.dur((st.timerEnd - Date.now()) / 1000)}`);
    return bits.join(' · ');
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (!d.st.grid) return { text: 'No power', tone: 'danger' };
    if (d.st.trip) return { text: has(d, 'relayState') && !d.st.relay ? 'Cut for safety' : 'Above a limit', tone: 'danger' };
    if (has(d, 'prepay') && S(d, 'prepay').on && d.st.balance <= S(d, 'prepay').low) return { text: `${d.st.balance.toFixed(1)} kWh left`, tone: 'warn' };
    return { text: on(d) ? kw(totalW(d)) : 'Off' };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: 'dashboard-3-fill', on: false, status: s.text, tone: s.tone, alert: d.online && !!d.st.trip && has(d, 'relayState') && !d.st.relay, controllable: false, offline: !d.online }]; };

  /* ---------- Device page ---------- */
  function gauge(d) {
    const W = totalW(d), lim = limitW(d), f = Math.min(1, W / lim), z = !on(d) ? 'off' : f >= 0.9 || d.st.trip ? 'z2' : f >= 0.7 ? 'z1' : '';
    return `<div class="pad" data-key="scene"><div class="em-gauge ${z}" role="img" aria-label="${esc(word(d))}">
      <svg viewBox="0 0 240 132"><path d="M20 120 A100 100 0 0 1 220 120" class="em-track" pathLength="100"/><path d="M20 120 A100 100 0 0 1 220 120" class="em-fill" pathLength="100" style="stroke-dashoffset:${(100 - f * 100).toFixed(1)}" data-live="arc"/></svg>
      <div class="em-mid"><div class="ct-word ${!on(d) ? (d.st.trip || !d.st.grid ? 'alarm' : 'closed') : 'closed'}" data-cl="word" data-num="count" data-live="kw">${esc(word(d))}</div>
        <div class="em-lim">${on(d) ? `of ${kw(lim)} limit` : ''}</div></div></div><div class="em-sub"><div class="cw-state" data-num data-live="sub">${esc(subText(d))}</div></div></div>`;
  }
  function page(d) {
    const st = d.st, pw = phaseW(d);
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (d.online && !st.grid) h += Kit.banner('ban-grid', 'danger', 'bolt-crossed', '<b>Power cut</b> · The grid is off. It comes back on by itself.');
    if (has(d, 'phaseAlarms') && S(d, 'phaseAlarms').loss && d.phys.lost >= 0 && on(d)) h += Kit.banner('ban-phase', 'danger', 'banner-error', `<b>Phase ${d.names[d.phys.lost]} is missing</b> · Some sockets have no power`);
    if (st.trip && st.relay) h += Kit.banner('ban-limit', 'warn', 'banner-error', `<b>Above a limit</b> · ${esc(st.trip)}`);
    if (has(d, 'prepay') && S(d, 'prepay').on && st.balance <= S(d, 'prepay').low && st.balance > 0) h += Kit.banner('ban-bal', 'warn', 'round-info', `<b>${st.balance.toFixed(1)} kWh left</b> · Top up before it runs out`);
    h += gauge(d);
    // main switch
    if (has(d, 'relayState') && d.online && st.grid) h += `<div class="list" data-key="relay" style="margin-top:20px">${Kit.sw('em-relay', 'r', 'Main switch', st.trip && !st.relay ? 'Fix the cause, then switch back on' : st.timerEnd ? `Turns off in ${Kit.dur((st.timerEnd - Date.now()) / 1000)}` : 'Everything on this circuit', st.relay)}</div>`;
    const pre = has(d, 'prepay') && S(d, 'prepay').on;
    h += Kit.cards([
      pre && ['Prepaid balance', `${st.balance.toFixed(1)} kWh`, { wide: true, count: true, cls: 'sm-level', html: Kit.bar(st.balance / 100, st.balance <= S(d, 'prepay').low ? 'z1' : '') + '<button class="btn-sm em-top" data-action="em-top">Top up</button>' }],
      has(d, 'energy') && ['Today', `${st.today.toFixed(1)} kWh`, { count: true }],
      has(d, 'energy') && ['This month', `${Math.round(st.month)} kWh`, { count: true }],
      has(d, 'solar') && ['Sent to the grid', `${st.exp.toFixed(1)} kWh`, { count: true }],
      has(d, 'tariffs') && ['Day tariff', `${Math.round(st.day)} kWh`, { count: true }],
      has(d, 'tariffs') && ['Night tariff', `${Math.round(st.night)} kWh`, { count: true }],
      has(d, 'quality') && ['Frequency', `${st.hz.toFixed(2)} Hz`, { count: true }],
      has(d, 'quality') && ['Power factor', on(d) ? '0.96' : '—'],
      has(d, 'leakage') && ['Leakage', `${d.phys.leak} mA`, { count: true }],
      has(d, 'deviceTemp') && ['Meter temperature', `${st.temp} °C`, { count: true }],
      has(d, 'energy') && ['Meter total', `${st.kWh.toFixed(1)} kWh`, { wide: true, count: true }],
    ]);
    if (has(d, 'phases') && n(d) > 1) h += `<div class="list-header" data-key="ph-h">${d.preset === 'clamp2' ? 'Clamps' : 'Phases'}</div><div class="pad info-grid em-ph" data-key="phases">${d.names.map((nm, i) => `<div class="info-card ${n(d) === 3 ? 'em-third' : ''}"><span>${esc(nm)}</span><b data-num="count">${kw(Math.abs(pw[i]))}</b><small>${d.phys.lost === i ? 'missing' : `${d.phys.v} V`}</small></div>`).join('')}</div>`;
    h += Kit.actionRows('rows', [
      has(d, 'history') && ['em-hist', 'Last 7 days', `${st.days.reduce((a, b) => a + b, 0).toFixed(0)} kWh · average ${(st.days.reduce((a, b) => a + b, 0) / 7).toFixed(1)} kWh a day`],
      has(d, 'timer') && has(d, 'relayState') && st.relay && d.online && ['em-timer', st.timerEnd ? 'Change the timer' : 'Turn off later', st.timerEnd ? `Off at ${UI.fmtTime(st.timerEnd)}` : 'e.g. the water heater off in 2 hours'],
    ]);
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) {
    UI.setNum(root.querySelector('[data-live="sub"]'), subText(d));
    if (on(d)) { UI.setNum(root.querySelector('[data-live="kw"]'), word(d)); const a = root.querySelector('[data-live="arc"]'); if (a) a.style.strokeDashoffset = (100 - Math.min(1, totalW(d) / limitW(d)) * 100).toFixed(1); }
  }
  function chart(d) {
    const v = d.st.days.concat([d.st.today]), mx = Math.max(...v, 1), lab = ['M', 'T', 'W', 'T', 'F', 'S', 'S', 'Today'];
    return `<div class="pad"><div class="info-card wide sm-level"><span>kWh per day</span><b>${d.st.today.toFixed(1)} kWh today</b><div class="pl-bars">${v.map((x, i) => `<i class="${i === 7 ? 'now' : ''}" style="height:${Math.max(4, x / mx * 100).toFixed(0)}%"><s>${lab[i].slice(0, i === 7 ? 5 : 1)}</s></i>`).join('')}</div></div></div><div style="height:24px"></div>`;
  }
  function openTimer(d, ctx) {
    let pick = 120;
    const s = UI.sheet({
      title: 'Turn off later', sub: 'The main switch turns off once, after this time',
      render: () => `<div class="va-chips">${[[30, '30 min'], [60, '1 h'], [120, '2 h'], [180, '3 h'], [240, '4 h'], [480, '8 h']].map(([v, l]) => `<button class="va-chip ${pick === v ? 'on' : ''}" data-action="em-pick" data-v="${v}">${l}</button>`).join('')}</div>`,
      footer: `<div class="wz-row" style="margin:0">${d.st.timerEnd ? '<button class="btn btn-glass" data-action="em-tclear">Cancel timer</button>' : ''}<button class="btn btn-primary" data-action="em-tgo">Start</button></div>`,
    });
    UI.on({ 'em-pick': ({ v }) => { pick = +v; s.refresh(); }, 'em-tgo': () => { d.st.timerEnd = Date.now() + pick * 60000; Kit.logEv(d, 'timer', { text: `Timer: off at ${UI.fmtTime(d.st.timerEnd)}` }); Store.save(); UI.closeSheet(); ctx.render(); }, 'em-tclear': () => { d.st.timerEnd = 0; Store.save(); UI.closeSheet(); ctx.render(); } });
  }
  const EV = { trip: (e) => `Cut for safety · ${e.why}`, alarm: (e) => `Above a limit · ${e.why}`, on: (e) => `Switched on${e.why ? ' · ' + e.why : ''}`, off: (e) => `Switched off${e.why ? ' · ' + e.why : ''}`, grid: (e) => (e.back ? 'Grid power back' : 'Grid power lost'), low: 'Prepaid balance low', top: (e) => `Topped up ${e.kwh} kWh`, reset: 'Counters reset', offline: 'Stopped answering' };
  function bindPage(d, ctx) {
    UI.on({
      'em-relay': () => {
        const st = d.st;
        if (st.relay) UI.confirm({ title: 'Switch the power off?', text: 'Everything on this circuit turns off — the fridge too.', ok: 'Switch off', onOk: () => { setRelay(d, false, 'app'); Store.save(); ctx.render(); } });
        else { if (has(d, 'prepay') && S(d, 'prepay').on && st.balance <= 0) return UI.toast('Top up first — the balance is empty'); if (has(d, 'leakage') && d.phys.leak > S(d, 'leakage').limit) return UI.toast('Leakage is still too high — call an electrician'); st.recl = 0; setRelay(d, true, 'app'); Store.save(); ctx.render(); }
      },
      'em-top': () => UI.prompt({ title: 'Top up', label: 'kWh to add', value: '50', okText: 'Add', onOk: (v) => { const k = Math.max(0, +v || 0); d.st.balance += k; Kit.logEv(d, 'top', { kwh: k }); if (!d.st.relay && S(d, 'prepay').trip && d.st.balance > 0 && !d.st.trip) setRelay(d, true, 'topped up'); Store.save(); ctx.render(); UI.toast(`${k} kWh added`); } }),
      'em-hist': () => Kit.historySheet(d, EV, 'Energy and events', () => chart(d)),
      'em-timer': () => openTimer(d, ctx),
    });
  }
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d, { foot: { Safety: 'Stored in the meter — it protects even without internet.' } });
  function bindSettings(d, ctx) {
    Kit.bindSettings(F, d, ctx, {
      timer: () => openTimer(d, ctx),
      resetEnergy: () => UI.confirm({ title: 'Reset the counters?', text: 'Total, today and month go back to 0. The history stays.', ok: 'Reset', onOk: () => { Object.assign(d.st, { kWh: 0, today: 0, month: 0, exp: 0, day: 0, night: 0 }); Kit.logEv(d, 'reset'); Store.save(); ctx.render(); } }),
    });
    UI.on({ 'rs-history': () => Kit.historySheet(d, EV, 'Energy and events', () => chart(d)) });
  }
  const about = (d) => [...(has(d, 'meterInfo') ? [['Utility meter ID', d.utilityId, true]] : []), ['Phases', `${n(d)}`], ['Total', `${d.st.kWh.toFixed(1)} kWh`]];

  function protoPanel(d) {
    const P = d.phys;
    return Kit.protoHead('Energy meter prototype', '13. Energy_Meter_Interface.html', PRESETS, d) + `
      <h3>The house · <span style="font-weight:400">${(P.load / 1000).toFixed(1)} kW · ${P.v} V${solarOn(d) ? ` · solar ${(P.solar / 1000).toFixed(1)} kW` : ''}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-kettle', '☕ Kettle on (+2 kW)')}${Kit.ppBtn('pp-ac', '❄️ AC on (+1.2 kW)')}${Kit.ppBtn('pp-quiet', '🌙 Night (0.3 kW)')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-heavy', '🔥 Everything at once (14 kW)')}${Kit.ppBtn('pp-sun', solarOn(d) ? '☁️ Clouds (no solar)' : '☀️ Sunny (solar 3 kW)', has(d, 'solar'))}${Kit.ppBtn('pp-fast', d.sim.fast ? '⏱ Normal time' : '⏩ Fast time (×600)')}</div>
      <h3>The grid</h3>
      <div class="pp-row">${Kit.ppBtn('pp-high', P.v > 240 ? '⚡ Voltage normal' : '⚡ Voltage 262 V')}${Kit.ppBtn('pp-cut', d.st.grid ? '🔌 Power cut' : '🔌 Power back')}${Kit.ppBtn('pp-phase', P.lost >= 0 ? '🔧 Phase back' : '✂️ Lose a phase', n(d) === 3)}${Kit.ppBtn('pp-leak', P.leak > 20 ? '🔧 Wires fixed' : '💧 Wet wiring (35 mA)', has(d, 'leakage'))}</div>
      <div class="pp-row">${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    const P = d.phys;
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-kettle': () => { P.load += 2000; }, 'pp-ac': () => { P.load += 1200; }, 'pp-quiet': () => { P.load = 300; }, 'pp-heavy': () => { P.load = 14000; },
      'pp-sun': () => { P.solar = solarOn(d) ? 0 : 3000; },
      'pp-fast': () => { d.sim.fast = !d.sim.fast; return d.sim.fast ? 'Energy counts 600× faster — watch the balance go down' : ''; },
      'pp-high': () => { P.v = P.v > 240 ? 229 : 262; },
      'pp-cut': () => {
        const st = d.st; st.grid = !st.grid; Kit.logEv(d, 'grid', { back: st.grid }); if (S(d, 'notify').grid) Kit.push(`${d.name}: ${st.grid ? 'power back' : 'power cut'}`, Kit.room(d), st.grid ? '' : 'warn');
        if (st.grid && has(d, 'relayState')) { const m = has(d, 'powerOn') ? S(d, 'powerOn') : 'previous'; st.relay = m === 'on' ? true : m === 'off' ? false : m === 'toggle' ? !st.relay : st.relay; }
      },
      'pp-phase': () => { P.lost = P.lost >= 0 ? -1 : 1; if (P.lost >= 0 && has(d, 'phaseAlarms') && S(d, 'phaseAlarms').loss && S(d, 'notify').fault) Kit.push(`${d.name}: phase ${d.names[1]} missing`, 'Some sockets have no power', 'danger'); },
      'pp-leak': () => { P.leak = P.leak > 20 ? 4 : 35; },
      'pp-online': () => { d.online = !d.online; if (!d.online) Kit.logEv(d, 'offline'); else d.st.lastSeen = Date.now(); },
    }, (dd, p) => { dd.names = p.names.slice(); dd.phys.solar = p.feats.includes('solar') ? 640 : 0; dd.phys.lost = -1; dd.st.trip = null; dd.st.relay = true; });
  }

  return {
    label: 'Energy meter', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'Energy meter',
    icon: () => 'dashboard-3-fill', describe: (p) => `${p.manufacturer} · energy meter`,
    historyValue: (d) => (has(d, 'history') ? `${d.st.today.toFixed(1)} kWh today` : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick, busy: () => true,
    protoPanel, bindProto,
  };
})();
