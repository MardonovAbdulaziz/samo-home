/* ==========================================================================
   Presence sensor (mmWave radar) — device interface (spec: Device Interface 3 / 9. Presence_Sensor_Interface.html)
   Unlike a motion sensor it sees people who sit still, work or sleep. The page shows the room from above: the
   sensor at the top, rings every metre up to its range, and the person as a dot — gliding when they walk,
   breathing softly when they sit still. Zones (FP1) are named places in the room: Sofa, Desk, Door.
   ========================================================================== */
Devices.presence = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    presence: { name: 'Someone in the room', grp: 'Device page', short: 'Sees people even when they sit still or sleep' },
    motionState: { name: 'Moving or still', grp: 'Device page', short: 'Large movement, small movement, or still' },
    distance: { name: 'Distance to the person', grp: 'Device page', short: 'How far the nearest person is' },
    zones: { name: 'Zones', grp: 'Zones & areas', short: 'Named places in the room (sofa, desk, door) — the sensor says which is occupied', row: (d) => Kit.row('pr-zones', 'z', 'Zones', d.zones.map((z) => z.name).join(', ')) },
    ignore: { name: 'Ignore areas', grp: 'Zones & areas', short: 'Distances the radar should not look at — a fan, a curtain', row: (d) => Kit.row('pr-ignore', 'i', 'Ignore areas', S(d, 'ignore').some(Boolean) ? `${S(d, 'ignore').filter(Boolean).length} bands off` : 'None'), def: Array(12).fill(false) },
    relay: { name: 'Built-in relay', grp: 'Device page', short: 'Switches the light itself: someone here + dark → on' },
    light: { name: 'Light level', grp: 'Device page', short: 'So “someone here + dark → light on” needs one device' },
    climate: { name: 'Temperature & humidity', grp: 'Device page', short: 'Some also measure these' },
    battery: { name: 'Battery', grp: 'Device page', short: 'Battery ones (PIR + radar) report charge' },
    range: { name: 'Detection range', grp: 'Detection', type: 'fields', def: { min: 0.3, max: 4.5 }, short: 'Cut it short so it doesn’t see through a wall',
      fields: [{ id: 'min', label: 'Ignore closer than', unit: 'm', min: 0, max: 3, step: 0.1 }, { id: 'max', label: 'Detect up to', unit: 'm', min: 1, max: 9, step: 0.5 }] },
    sensitivity: { name: 'Sensitivity', grp: 'Detection', type: 'fields', def: { move: 7, still: 6 }, short: 'How small a movement counts',
      fields: [{ id: 'move', label: 'Movement', min: 0, max: 10 }, { id: 'still', label: 'Still person', min: 0, max: 10 }] },
    timing: { name: 'Enter & leave delays', grp: 'Detection', type: 'fields', def: { enter: 0, leave: 30 }, short: 'Wait before “someone is here”, longer before “empty”',
      fields: [{ id: 'enter', label: 'Say “someone here” after', unit: 's', min: 0, max: 10, step: 1 }, { id: 'leave', label: 'Say “empty” after', unit: 's', min: 5, max: 1800 }] },
    mode: { name: 'Radar / PIR mode', grp: 'Detection', type: 'choice', def: 'pir_and_radar', opts: [['pir_and_radar', 'PIR and radar', 'Both must agree — fewest false alarms'], ['pir_or_radar', 'PIR or radar', 'Either one — fastest'], ['only_radar', 'Only radar'], ['off', 'Radar off']], short: 'Use both sensors together, alone, or radar off' },
    roomType: { name: 'Room type', grp: 'Detection', type: 'choice', def: 'living_room', opts: [['living_room', 'Living room'], ['bedroom', 'Bedroom'], ['bathroom', 'Bathroom'], ['sleep', 'Sleep']], short: 'Ready-made settings tuned by the maker' },
    learn: { name: 'Learn the empty room', grp: 'Detection', type: 'action', short: 'Studies the empty room so fans and curtains are ignored' },
    presenceLight: { name: 'Lights while someone is here', grp: 'Automation', type: 'fields', app: true, def: { on: true, lux: 60 }, short: 'On when someone is here and it is dark; off when empty',
      fields: [{ id: 'on', kind: 'tog', label: 'Light on while the room is occupied', noSum: true }, { id: 'lux', label: 'Only when darker than', unit: 'lx', min: 0, max: 500, step: 10 }] },
    notify: { name: 'Presence notifications', grp: 'Notifications', type: 'fields', app: true, def: { away: true, zone: false }, short: 'Someone while nobody is home; someone in a zone',
      fields: [{ id: 'away', kind: 'tog', label: 'Someone detected while nobody is home', hint: 'Uses the home’s Away mode' }, { id: 'zone', kind: 'tog', label: 'Someone enters the Door zone', hint: 'Zones only' }] },
    indicator: { name: 'Light on the sensor', grp: 'Sensor', type: 'toggle', def: true, short: 'Turn off in bedrooms' },
    identify: { name: 'Find this device', grp: 'Sensor', type: 'action', short: 'Blinks the sensor', done: 'The sensor is blinking' },
    history: { name: 'Presence history', grp: 'Log', app: true, short: 'When the room was occupied today' },
  };
  const GROUPS = ['Device page', 'Detection', 'Zones & areas', 'Sensor', 'Notifications', 'Automation', 'Log'];
  const PRESETS = [
    { id: 'fp1e', name: 'Aqara presence sensor FP1E', model: 'FP1E', manufacturer: 'Aqara', feats: ['presence', 'motionState', 'distance', 'range', 'sensitivity', 'learn', 'presenceLight', 'notify', 'history', 'identify'] },
    { id: 'fp1', name: 'Aqara presence sensor FP1 (zones)', model: 'RTCZCGQ11LM', manufacturer: 'Aqara', feats: ['presence', 'zones', 'sensitivity', 'learn', 'presenceLight', 'notify', 'history'] },
    { id: 'zy', name: 'Tuya ceiling radar', model: 'ZY-M100', manufacturer: 'Tuya', feats: ['presence', 'distance', 'light', 'range', 'sensitivity', 'timing', 'learn', 'presenceLight', 'notify', 'history'] },
    { id: 'zg', name: 'PIR + radar, battery', model: 'ZG-204ZM', manufacturer: 'HOBEIAN', feats: ['presence', 'motionState', 'light', 'battery', 'range', 'sensitivity', 'timing', 'mode', 'indicator', 'presenceLight', 'notify', 'history'] },
    { id: 'relay', name: 'Ceiling radar with relay', model: 'MTG075-ZB-RL', manufacturer: 'Tuya', feats: ['presence', 'distance', 'light', 'relay', 'range', 'sensitivity', 'timing', 'indicator', 'notify', 'history'] },
    { id: 'zf24', name: 'Wall radar with room types', model: 'ZF24', manufacturer: 'Tuya', feats: ['presence', 'distance', 'light', 'range', 'sensitivity', 'timing', 'mode', 'roomType', 'presenceLight', 'notify', 'history'], v: { mode: 'only_radar' } },
    { id: 'fp300', name: 'Aqara FP300 (battery, PIR + radar)', model: 'PS-S04D', manufacturer: 'Aqara', feats: ['presence', 'distance', 'light', 'climate', 'battery', 'ignore', 'range', 'timing', 'learn', 'indicator', 'presenceLight', 'notify', 'history'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];
  // zones: an angle range (−60…60°) and a distance range (m) on the room map
  const ZONES = [{ name: 'Sofa', a: [-60, -15], r: [1.5, 3] }, { name: 'Desk', a: [20, 60], r: [1, 2.6] }, { name: 'Door', a: [-15, 20], r: [3, 9] }];

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const d = Kit.base('presence', p, Object.assign({ name: 'Presence sensor' }, opts), {
      battery: 78, zones: ZONES.map((z) => Object.assign({}, z)),
      st: { occ: true, move: 'still', dist: 2.2, ang: -35, zone: 'Sofa', since: now - 47 * 60000, lastSeen: now - 20000, emptyAt: 0, lux: 42, t: 22.8, h: 44, relay: true, learnUntil: 0, learned: 0, today: [[now - 9 * 3600000, now - 8.2 * 3600000], [now - 4 * 3600000, now - 3.1 * 3600000], [now - 47 * 60000, 0]] },
      phys: { here: true, move: 'still', dist: 2.2, ang: -35, fan: false },
    });
    Kit.applyDefaults(F, d); if (p.v) Object.assign(d.settings, Kit.clone(p.v));
    return d;
  }
  const applyDefaults = (d) => { Kit.applyDefaults(F, d); d.zones = d.zones || ZONES.map((z) => Object.assign({}, z)); };
  const maxR = (d) => (has(d, 'range') ? S(d, 'range').max : 6);
  const zoneOf = (d, ang, dist) => (has(d, 'zones') ? (d.zones.find((z) => ang >= z.a[0] && ang <= z.a[1] && dist >= z.r[0] && dist <= z.r[1]) || {}).name || null : null);
  const band = (dist) => Math.min(11, Math.floor(dist / 0.75));

  /* ---------- Behaviour: what the radar reports from the room ---------- */
  function sees(d) {
    const P = d.phys;
    if (has(d, 'mode') && S(d, 'mode') === 'off') return false;
    if (P.here) { if (has(d, 'range') && (P.dist < S(d, 'range').min || P.dist > S(d, 'range').max)) return false; if (has(d, 'ignore') && S(d, 'ignore')[band(P.dist)]) return false; return true; }
    // a fan moving 1.5 m away looks like a person — unless that band is ignored or the room was learned
    if (P.fan) return !(has(d, 'ignore') && S(d, 'ignore')[band(1.5)]) && !d.st.learned;
    return false;
  }
  function tick(d) {
    if (!d.online) return false;
    const st = d.st, P = d.phys, now = Date.now(); let ch = false;
    if (st.learnUntil && now >= st.learnUntil) { st.learnUntil = 0; st.learned = now; Kit.logEv(d, 'learned'); ch = true; }
    const see = sees(d);
    if (see) {
      st.emptyAt = 0;
      const ghost = !P.here;
      const dist = ghost ? 1.5 : P.dist, ang = ghost ? 40 : P.ang, move = ghost ? 'small' : P.move;
      if (!st.occ) { st.occ = true; st.since = now; st.today.push([now, 0]); Kit.logEv(d, 'in', { z: zoneOf(d, ang, dist) }); ch = true; if (has(d, 'notify') && S(d, 'notify').zone && zoneOf(d, ang, dist) === 'Door') Kit.push(`${d.name}: someone at the door`, Kit.room(d)); }
      if (st.dist !== dist || st.ang !== ang || st.move !== move) { const z = zoneOf(d, ang, dist); if (z && z !== st.zone) Kit.logEv(d, 'zone', { z }); Object.assign(st, { dist, ang, move, zone: z }); ch = true; }
      st.lastSeen = now;
    } else if (st.occ) {
      const leave = has(d, 'timing') ? S(d, 'timing').leave : 30;
      if (!st.emptyAt) { st.emptyAt = now + leave * 1000; st.move = 'none'; ch = true; }
      else if (now >= st.emptyAt) { st.occ = false; st.emptyAt = 0; st.zone = null; const last = st.today[st.today.length - 1]; if (last && !last[1]) last[1] = now; Kit.logEv(d, 'out'); ch = true; }
    }
    // the light that follows presence (built-in relay or our automation)
    const wantLight = st.occ && st.lux < (has(d, 'presenceLight') ? S(d, 'presenceLight').lux : 60);
    if (has(d, 'relay') && st.relay !== wantLight) { st.relay = wantLight; Kit.logEv(d, 'relay', { on: wantLight }); ch = true; }
    if (has(d, 'presenceLight') && S(d, 'presenceLight').on && st.autoLight !== wantLight) { st.autoLight = wantLight; ch = true; }
    return ch;
  }

  /* ---------- Text ---------- */
  const MOVE = { large: 'walking', small: 'moving a little', still: 'sitting still', none: '' };
  function word(d) { if (!d.online) return 'Unknown'; if (d.st.learnUntil) return 'Learning…'; return d.st.occ ? (d.st.emptyAt ? 'Leaving…' : 'Someone here') : 'Empty'; }
  const tone = (d) => (!d.online ? '' : d.st.occ && !d.st.emptyAt ? 'on' : 'closed');
  function subText(d) {
    const st = d.st;
    if (!d.online) return `Last report ${when(st.lastSeen)}`;
    if (st.learnUntil) return `Keep the room empty · ${Math.ceil((st.learnUntil - Date.now()) / 1000)} s`;
    if (st.occ && st.emptyAt) return `Empty in ${Math.max(0, Math.ceil((st.emptyAt - Date.now()) / 1000))} s if nobody moves`;
    if (st.occ) { const b = [has(d, 'zones') && st.zone ? `On the ${st.zone.toLowerCase()}` : '', has(d, 'motionState') && MOVE[st.move], has(d, 'distance') && `${st.dist.toFixed(1)} m away`].filter(Boolean); return `${b.length ? b.join(' · ') + ' · ' : ''}for ${Kit.dur((Date.now() - st.since) / 1000)}`; }
    return `Empty since ${when(st.today.length ? st.today[st.today.length - 1][1] || st.lastSeen : st.lastSeen)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (has(d, 'battery') && d.battery <= 20) return { text: 'Battery low', tone: 'warn' };
    return { text: d.st.occ ? (has(d, 'zones') && d.st.zone ? `Someone · ${d.st.zone}` : 'Someone here') : 'Empty' };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: 'radar-fill', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }]; };

  /* ---------- The room map ---------- */
  function radar(d) {
    const st = d.st, R = maxR(d), W = 300, H = 178, cx = 150, cy = 14, sc = (H - 24) / R;
    const pt = (ang, dist) => [cx + Math.sin(ang * Math.PI / 180) * dist * sc, cy + Math.cos(ang * Math.PI / 180) * dist * sc];
    const arc = (r) => { const [x1, y1] = pt(-60, r), [x2, y2] = pt(60, r); return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${(r * sc).toFixed(1)} ${(r * sc).toFixed(1)} 0 0 0 ${x2.toFixed(1)} ${y2.toFixed(1)}`; };
    const rings = []; for (let m = 1; m <= Math.floor(R); m++) rings.push(`<path d="${arc(m)}" class="pr-ring"/><text x="${(cx + 4).toFixed(0)}" y="${(cy + m * sc - 3).toFixed(0)}" class="pr-m">${m} m</text>`);
    const ign = has(d, 'ignore') ? S(d, 'ignore').map((on, i) => (on ? `<path d="${arc(Math.min(R, (i + 0.5) * 0.75))}" class="pr-ign" style="stroke-width:${(0.75 * sc).toFixed(1)}"/>` : '')).join('') : '';
    const zones = has(d, 'zones') ? d.zones.map((z) => { const [a, b] = z.a, [r0, r1] = [z.r[0], Math.min(z.r[1], R)]; const p = [pt(a, r0), pt(b, r0), pt(b, r1), pt(a, r1)]; const [lx, ly] = pt((a + b) / 2, (r0 + r1) / 2); return `<path d="M${p[0]} L${p[1]} L${p[2]} L${p[3]} Z" class="pr-zone ${st.occ && st.zone === z.name ? 'on' : ''}"/><text x="${lx.toFixed(0)}" y="${ly.toFixed(0)}" class="pr-zl">${esc(z.name)}</text>`; }).join('') : '';
    const [px, py] = pt(st.ang, Math.min(st.dist, R));
    const show = d.online && st.occ && (has(d, 'distance') || has(d, 'zones'));
    return `<div class="pad" data-key="scene"><div class="pr-map ${st.occ && d.online ? 'is-occ' : ''} ${st.move === 'still' ? 'is-still' : ''} ${st.emptyAt ? 'is-leaving' : ''}" role="img" aria-label="${esc(word(d))}">
      <svg viewBox="0 0 ${W} ${H}"><path d="M${cx} ${cy} L${pt(-60, R).join(' ')} A${(R * sc).toFixed(1)} ${(R * sc).toFixed(1)} 0 0 0 ${pt(60, R).join(' ')} Z" class="pr-fan"/>${ign}${zones}${rings.join('')}
        <rect x="${cx - 14}" y="2" width="28" height="9" rx="4.5" class="pr-dev"/>
        <g class="pr-dot" style="transform:translate(${px.toFixed(1)}px,${py.toFixed(1)}px);opacity:${show ? 1 : 0}"><circle r="15" class="pr-halo"/><circle r="7" class="pr-core"/></g></svg>
      ${!has(d, 'distance') && !has(d, 'zones') ? `<span class="pr-only">${icon(d.userIcon || 'radar-fill', 'icon', 'style="width:40px;height:40px"')}</span>` : ''}</div></div>`;
  }
  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (has(d, 'battery') && d.battery <= 20) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    if (has(d, 'mode') && S(d, 'mode') === 'off') h += Kit.banner('ban-mode', 'info', 'round-info', '<b>Radar is off</b> · Only movement (PIR) is seen — a still person looks like an empty room');
    h += radar(d);
    h += Kit.readout(word(d), tone(d), subText(d), st.autoLight || (has(d, 'relay') && st.relay) ? 'Light on' : '');
    h += Kit.cards([
      has(d, 'light') && ['Light', `${Math.round(st.lux)} lx · ${st.lux < 30 ? 'dark' : st.lux < 200 ? 'dim' : 'bright'}`, { count: true }],
      has(d, 'relay') && ['Ceiling light', st.relay ? 'On' : 'Off'],
      has(d, 'climate') && ['Temperature', `${st.t.toFixed(1)} °C`, { count: true }],
      has(d, 'climate') && ['Humidity', `${Math.round(st.h)} %`, { count: true }],
      has(d, 'battery') && ['Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    if (has(d, 'history')) {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = 86400000, now = Date.now(), pct = (t) => ((Math.max(t0.getTime(), t) - t0.getTime()) / day) * 100;
      h += `<div class="pad" data-key="strip" style="margin-top:24px"><div class="info-card wide sm-level pr-strip-card"><span>Occupied today · ${Kit.dur(st.today.reduce((s, [a, b]) => s + ((b || now) - Math.max(a, t0.getTime())), 0) / 1000)}</span>
        <div class="ct-strip"><div class="bar">${st.today.map(([a, b]) => `<i style="left:${pct(a).toFixed(2)}%;width:max(3px,${(pct(b || now) - pct(a)).toFixed(2)}%)"></i>`).join('')}<b style="left:${pct(now).toFixed(2)}%"></b></div><div class="axis"><span>0:00</span><span>12:00</span><span>24:00</span></div></div></div></div>`;
    }
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), subText(d)); }
  const bindPage = () => {};

  /* ---------- Settings ---------- */
  function openZones(d, ctx) {
    const s = UI.sheet({
      title: 'Zones', sub: 'The sensor says which zone is occupied — e.g. turn on the reading lamp when someone sits on the sofa',
      render: () => `<div class="list">${d.zones.map((z, i) => `<button class="cell" data-action="pr-zone" data-i="${i}"><span class="cell-main cell-title">${esc(z.name)}</span><span class="cell-value">${z.r[0]}–${z.r[1] > 8 ? '…' : z.r[1]} m</span>${icon('chevron-right', 'chev')}</button>`).join('')}</div><div class="list-footer">The map on the device page shows the zones.</div>`,
    });
    UI.on({ 'pr-zone': ({ i }) => UI.prompt({ title: 'Zone name', label: 'Name', value: d.zones[+i].name, onOk: (v) => { d.zones[+i].name = v; Store.save(); ctx.render(); s.refresh(); } }) });
  }
  function openIgnore(d, ctx) {
    const s = UI.sheet({
      title: 'Ignore areas', sub: 'Turn off the distances where a fan or a curtain moves',
      render: () => `<div class="pr-bands">${S(d, 'ignore').map((on, i) => `<button class="va-chip ${on ? 'on' : ''}" data-action="pr-band" data-i="${i}">${(i * 0.75).toFixed(2).replace(/0$/, '')}–${((i + 1) * 0.75).toFixed(2).replace(/0$/, '')} m</button>`).join('')}</div><div class="list-footer">Blue = ignored. A person standing there won’t be seen either.</div>`,
    });
    UI.on({ 'pr-band': ({ i }) => { S(d, 'ignore')[+i] = !S(d, 'ignore')[+i]; Store.save(); ctx.render(); s.refresh(); } });
  }
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d, { foot: { Detection: 'Stored in the sensor.' } });
  const EV = { in: (e) => `Someone came in${e.z ? ' · ' + e.z : ''}`, out: 'Room empty', zone: (e) => `Moved to the ${e.z}`, relay: (e) => `Light ${e.on ? 'on' : 'off'}`, learned: 'Learned the empty room', offline: 'Stopped answering' };
  function bindSettings(d, ctx) {
    Kit.bindSettings(F, d, ctx, { learn: () => { d.st.learnUntil = Date.now() + 8000; Store.save(); ctx.render(); UI.toast('Leave the room — learning for a moment'); } });
    UI.on({ 'pr-zones': () => openZones(d, ctx), 'pr-ignore': () => openIgnore(d, ctx), 'rs-history': () => Kit.historySheet(d, EV, 'When the room was occupied') });
  }
  const about = (d) => [['Room', word(d)], ...(has(d, 'distance') ? [['Distance', `${d.st.dist.toFixed(1)} m`]] : [])];

  function protoPanel(d) {
    const P = d.phys;
    return Kit.protoHead('Presence sensor prototype', '9. Presence_Sensor_Interface.html', PRESETS, d) + `
      <h3>The room · <span style="font-weight:400">${P.here ? `a person ${P.move}, ${P.dist} m` : 'nobody'}${P.fan ? ' · fan on' : ''}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-walk', '🚶 Someone walks in')}${Kit.ppBtn('pp-sofa', '🛋 Sits on the sofa')}${Kit.ppBtn('pp-desk', '💻 Works at the desk')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-door', '🚪 Stands at the door')}${Kit.ppBtn('pp-leave', '👋 Leaves the room')}${Kit.ppBtn('pp-fan', P.fan ? '🌀 Fan off' : '🌀 Fan on (fools the radar)')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-dark', d.st.lux < 30 ? '☀️ Daylight' : '🌙 Evening (dark)', has(d, 'light') || has(d, 'presenceLight'))}${Kit.ppBtn('pp-batt', d.battery <= 20 ? '🔋 New battery' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    const P = d.phys, go = (o) => Object.assign(P, { here: true }, o);
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-walk': () => go({ move: 'large', dist: 3.6, ang: 5 }),
      'pp-sofa': () => go({ move: 'still', dist: 2.2, ang: -38 }),
      'pp-desk': () => go({ move: 'small', dist: 1.8, ang: 40 }),
      'pp-door': () => go({ move: 'large', dist: 4.2, ang: 0 }),
      'pp-leave': () => { P.here = false; return `The sensor waits ${has(d, 'timing') ? S(d, 'timing').leave : 30} s before saying “empty”`; },
      'pp-fan': () => { P.fan = !P.fan; if (P.fan && !P.here) return 'An empty room with a fan: the radar may think someone is here — Ignore areas or Learn fixes it'; },
      'pp-dark': () => { d.st.lux = d.st.lux < 30 ? 320 : 12; },
      'pp-batt': () => { d.battery = d.battery <= 20 ? 100 : 12; },
      'pp-online': () => { d.online = !d.online; if (!d.online) Kit.logEv(d, 'offline'); else d.st.lastSeen = Date.now(); },
    }, null, tick);
  }

  return {
    label: 'Presence sensor', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'Presence sensor',
    icon: () => 'radar-fill', describe: (p) => `${p.manufacturer} · presence radar`,
    historyValue: (d) => (has(d, 'history') ? word(d) : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick, busy: (d) => d.st.occ || !!d.st.learnUntil,
    protoPanel, bindProto,
  };
})();
