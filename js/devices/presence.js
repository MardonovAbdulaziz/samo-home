/* ==========================================================================
   Presence sensor (mmWave radar) — device interface (spec: Device Interface 3 / 9. Presence_Sensor_Interface.html)
   Unlike a motion sensor it sees people who sit still, work or sleep. The page shows the room as a plan from above —
   walls, a door, a window, the sensor on the top wall and the part of the room it watches — and the person as a
   small figure that glides when they walk and breathes softly when they sit still. No metres: “near the sensor”,
   “on the sofa”. Zones are places the user paints on the room grid (the sensor does not see furniture — the FP1
   reports which painted place is occupied).
   ========================================================================== */
Devices.presence = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    presence: { name: 'Someone in the room', grp: 'Device page', short: 'Sees people even when they sit still or sleep' },
    motionState: { name: 'Moving or still', grp: 'Device page', short: 'Large movement, small movement, or still' },
    distance: { name: 'Distance to the person', grp: 'Device page', short: 'How far the nearest person is' },
    zones: { name: 'Places in the room', grp: 'Zones & areas', short: 'You paint where the sofa, desk or door is — the sensor then says which place is occupied', row: (d) => Kit.row('pr-zones', 'z', 'Places in the room', d.zones.length ? d.zones.map((z) => z.name).join(', ') : 'None yet') },
    ignore: { name: 'Parts not to watch', grp: 'Zones & areas', short: 'Strips of the room the radar should ignore — where a fan or a curtain moves', row: (d) => Kit.row('pr-ignore', 'i', 'Parts not to watch', S(d, 'ignore').some(Boolean) ? `${S(d, 'ignore').filter(Boolean).length} of 7 strips` : 'None'), def: Array(7).fill(false) },
    relay: { name: 'Built-in relay', grp: 'Device page', short: 'Switches the light itself: someone here + dark → on' },
    light: { name: 'Light level', grp: 'Device page', short: 'So “someone here + dark → light on” needs one device' },
    climate: { name: 'Temperature & humidity', grp: 'Device page', short: 'Some also measure these' },
    battery: { name: 'Battery', grp: 'Device page', short: 'Battery ones (PIR + radar) report charge' },
    range: { name: 'Detection range', grp: 'Detection', type: 'fields', def: { min: 0.3, max: 4.5 }, short: 'Cut it short so it doesn’t see through a wall',
      fields: [{ id: 'min', label: 'Ignore closer than', unit: 'm', min: 0, max: 3, step: 0.5, hint: 'Shown on the room plan' }, { id: 'max', label: 'Watch up to', unit: 'm', min: 1, max: 7, step: 0.5, hint: '1 m ≈ one strip of the room plan' }] },
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
  /* The room plan: 4 columns × 7 strips seen from the sensor on the top wall (strip 1 = next to the sensor, each
     strip ≈ 1 m) — the FP1's own zone grid. A zone is a set of squares "col,row" the user painted. */
  const COLS = 4, ROWS = 7;
  const NAMES = ['Sofa', 'Desk', 'Bed', 'Door', 'TV', 'Dining', 'Kitchen', 'Play', 'Chair', 'Window', 'Bath', 'Other'];
  const TONES = ['green', 'orange', 'purple', 'teal', 'pink', 'yellow'];
  const ZONES = [{ name: 'Sofa', cells: ['1,4', '1,5', '2,4', '2,5'] }, { name: 'Desk', cells: ['4,3', '4,4'] }, { name: 'Door', cells: ['2,7', '3,7'] }];
  const cellOf = (x, y) => `${Math.min(COLS, Math.floor(x) + 1)},${Math.min(ROWS, Math.floor(y) + 1)}`;
  const AT = { sofa: [1.0, 4.4], desk: [3.5, 3.4], door: [2.4, 6.6], walk: [2.9, 5.8], middle: [2.0, 3.6] };

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const d = Kit.base('presence', p, Object.assign({ name: 'Presence sensor' }, opts), {
      battery: 78, zones: ZONES.map((z) => ({ name: z.name, cells: z.cells.slice() })),
      st: { occ: true, move: 'still', x: AT.sofa[0], y: AT.sofa[1], zone: 'Sofa', since: now - 47 * 60000, lastSeen: now - 20000, emptyAt: 0, lux: 42, t: 22.8, h: 44, relay: true, learnUntil: 0, learned: 0, today: [[now - 9 * 3600000, now - 8.2 * 3600000], [now - 4 * 3600000, now - 3.1 * 3600000], [now - 47 * 60000, 0]] },
      phys: { here: true, move: 'still', x: AT.sofa[0], y: AT.sofa[1], fan: false },
    });
    Kit.applyDefaults(F, d); if (p.v) Object.assign(d.settings, Kit.clone(p.v));
    return d;
  }
  function applyDefaults(d) {
    Kit.applyDefaults(F, d);
    // data saved before the room plan: angle/metre zones → painted squares; 12 distance bands → 7 strips
    if (!d.zones || (d.zones[0] && !d.zones[0].cells)) d.zones = ZONES.map((z) => ({ name: z.name, cells: z.cells.slice() }));
    if (!Array.isArray(d.settings.ignore) || d.settings.ignore.length !== ROWS) d.settings.ignore = Array(ROWS).fill(false);
    if (d.phys && d.phys.x === undefined) Object.assign(d.phys, { x: AT.sofa[0], y: AT.sofa[1] });
    if (d.st && d.st.x === undefined) Object.assign(d.st, { x: AT.sofa[0], y: AT.sofa[1] });
  }
  const zoneOf = (d, x, y) => (has(d, 'zones') ? (d.zones.find((z) => z.cells.includes(cellOf(x, y))) || {}).name || null : null);
  const reach = (d) => (has(d, 'range') ? S(d, 'range') : { min: 0, max: ROWS });
  const where = (y) => (y < 2.4 ? 'near the sensor' : y < 4.8 ? 'in the middle of the room' : 'on the far side');

  /* ---------- Behaviour: what the radar reports from the room ---------- */
  function sees(d) {
    const P = d.phys, R = reach(d);
    if (has(d, 'mode') && S(d, 'mode') === 'off') return false;
    if (P.here) { if (P.y < R.min || P.y > R.max) return false; if (has(d, 'ignore') && S(d, 'ignore')[Math.min(ROWS - 1, Math.floor(P.y))]) return false; return true; }
    // a fan in the corner looks like a person — unless that strip is ignored or the room was learned
    if (P.fan) return !(has(d, 'ignore') && S(d, 'ignore')[1]) && !d.st.learned;
    return false;
  }
  function tick(d) {
    if (!d.online) return false;
    const st = d.st, P = d.phys, now = Date.now(); let ch = false;
    if (st.learnUntil && now >= st.learnUntil) { st.learnUntil = 0; st.learned = now; Kit.logEv(d, 'learned'); ch = true; }
    if (sees(d)) {
      st.emptyAt = 0;
      const ghost = !P.here, x = ghost ? 3.6 : P.x, y = ghost ? 1.4 : P.y, move = ghost ? 'small' : P.move;
      if (!st.occ) { st.occ = true; st.since = now; st.today.push([now, 0]); Kit.logEv(d, 'in', { z: zoneOf(d, x, y) }); ch = true; if (has(d, 'notify') && S(d, 'notify').zone && zoneOf(d, x, y) === 'Door') Kit.push(`${d.name}: someone at the door`, Kit.room(d)); }
      if (st.x !== x || st.y !== y || st.move !== move) { const z = zoneOf(d, x, y); if (z && z !== st.zone) Kit.logEv(d, 'zone', { z }); Object.assign(st, { x, y, move, zone: z }); ch = true; }
      st.lastSeen = now;
    } else if (st.occ) {
      const leave = has(d, 'timing') ? S(d, 'timing').leave : 30;
      if (!st.emptyAt) { st.emptyAt = now + leave * 1000; st.move = 'none'; ch = true; }
      else if (now >= st.emptyAt) { st.occ = false; st.emptyAt = 0; st.zone = null; const last = st.today[st.today.length - 1]; if (last && !last[1]) last[1] = now; Kit.logEv(d, 'out'); ch = true; }
    }
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
    if (st.occ) {
      const place = has(d, 'zones') && st.zone ? `At the ${st.zone.toLowerCase()}` : has(d, 'distance') ? where(st.y).replace(/^./, (c) => c.toUpperCase()) : '';
      const b = [place, has(d, 'motionState') && MOVE[st.move]].filter(Boolean);
      return `${b.length ? b.join(' · ') + ' · ' : ''}for ${Kit.dur((Date.now() - st.since) / 1000)}`;
    }
    return `Empty since ${when(st.today.length ? st.today[st.today.length - 1][1] || st.lastSeen : st.lastSeen)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (has(d, 'battery') && d.battery <= 20) return { text: 'Battery low', tone: 'warn' };
    return { text: d.st.occ ? (has(d, 'zones') && d.st.zone ? `Someone · ${d.st.zone}` : 'Someone here') : 'Empty' };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: 'radar-fill', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }]; };

  /* ---------- The room plan ---------- */
  const W = 320, CW = 76, CH = 40, X0 = 8, Y0 = 18;   // 4 × 76 = 304 wide, 7 × 40 = 280 deep
  const cx = (x) => X0 + x * CW, cy = (y) => Y0 + y * CH;
  function plan(d, o = {}) {
    const st = d.st, R = reach(d), H = Y0 + ROWS * CH + 10;
    const ign = has(d, 'ignore') ? S(d, 'ignore') : [];
    const cells = (z, k) => z.cells.map((c) => { const [a, b] = c.split(',').map(Number); return `<rect x="${cx(a - 1) + 1}" y="${cy(b - 1) + 1}" width="${CW - 2}" height="${CH - 2}" rx="6"/>`; }).join('');
    const label = (z) => { if (!z.cells.length) return ''; const pts = z.cells.map((c) => c.split(',').map(Number)); const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length - 0.5, my = pts.reduce((s, p) => s + p[1], 0) / pts.length - 0.5; return `<text x="${cx(mx).toFixed(0)}" y="${(cy(my) + 4).toFixed(0)}">${esc(z.name)}</text>`; };
    const zones = has(d, 'zones') || o.edit ? d.zones.map((z, i) => `<g class="pr-z t-${TONES[i % TONES.length]} ${st.occ && st.zone === z.name && !o.edit ? 'on' : ''} ${o.sel === i ? 'sel' : ''}">${cells(z)}${label(z)}</g>`).join('') : '';
    const unwatched = [];
    for (let r = 0; r < ROWS; r++) if (ign[r] || r + 1 <= R.min || r >= R.max) unwatched.push(`<rect x="${X0}" y="${cy(r)}" width="${COLS * CW}" height="${CH}" class="pr-off"/>`);
    const grid = o.edit ? Array.from({ length: COLS * ROWS }, (_, i) => { const a = i % COLS + 1, b = Math.floor(i / COLS) + 1; return `<rect x="${cx(a - 1) + 1}" y="${cy(b - 1) + 1}" width="${CW - 2}" height="${CH - 2}" rx="6" class="pr-cell" data-action="pr-cell" data-c="${a},${b}"/>`; }).join('') : '';
    const strips = o.strips ? ign.map((on, r) => `<rect x="${X0}" y="${cy(r) + 1}" width="${COLS * CW}" height="${CH - 2}" rx="6" class="pr-stripbtn ${on ? 'on' : ''}" data-action="pr-band" data-i="${r}"/>`).join('') : '';
    const px = has(d, 'zones') || o.edit ? st.x : COLS / 2, show = !o.edit && !o.strips && d.online && st.occ;
    const fan = `<path d="M${cx(2) - 10} ${Y0} L${cx(0)} ${cy(Math.min(ROWS, R.max))} L${cx(COLS)} ${cy(Math.min(ROWS, R.max))} L${cx(2) + 10} ${Y0} Z" class="pr-fan"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="pr-plan" aria-hidden="true">
      <rect x="${X0}" y="${Y0}" width="${COLS * CW}" height="${ROWS * CH}" class="pr-floor"/>${fan}${unwatched.join('')}${zones}${grid}${strips}
      <path d="M${X0} ${Y0} H${cx(COLS)} V${cy(ROWS)} H${cx(3) - 4} M${cx(1) + 4} ${cy(ROWS)} H${X0} Z" class="pr-wall"/>
      <path d="M${cx(1) + 4} ${cy(ROWS)} A${CW * 2 - 8} 22 0 0 1 ${cx(3) - 4} ${cy(ROWS)}" class="pr-door"/>
      <path d="M${X0} ${cy(2.2)} V${cy(3.8)}" class="pr-win"/>
      <rect x="${cx(2) - 16}" y="${Y0 - 6}" width="32" height="10" rx="5" class="pr-dev"/>
      <g class="pr-dot" style="transform:translate(${cx(px).toFixed(1)}px,${cy(st.y).toFixed(1)}px);opacity:${show ? 1 : 0}"><circle r="17" class="pr-halo"/><circle cy="-6" r="5.5" class="pr-core"/><path d="M-8 9 Q-8 -1 0 -1 Q8 -1 8 9 Z" class="pr-core"/></g></svg>`;
  }
  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (has(d, 'battery') && d.battery <= 20) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    if (has(d, 'mode') && S(d, 'mode') === 'off') h += Kit.banner('ban-mode', 'info', 'round-info', '<b>Radar is off</b> · Only movement is seen — a still person looks like an empty room');
    h += `<div class="pad" data-key="scene"><div class="pr-map ${st.occ && d.online ? 'is-occ' : ''} ${st.move === 'still' ? 'is-still' : ''} ${st.emptyAt ? 'is-leaving' : ''}" role="img" aria-label="${esc(word(d))}">${plan(d)}</div></div>`;
    h += Kit.readout(word(d), tone(d), subText(d), st.autoLight || (has(d, 'relay') && st.relay) ? 'Light on' : '');
    h += Kit.cards([
      has(d, 'light') && ['Light', st.lux < 30 ? 'Dark' : st.lux < 200 ? 'Dim' : 'Bright'],
      has(d, 'relay') && ['Ceiling light', st.relay ? 'On' : 'Off'],
      has(d, 'climate') && ['Temperature', `${st.t.toFixed(1)} °C`, { count: true }],
      has(d, 'climate') && ['Humidity', `${Math.round(st.h)} %`, { count: true }],
      has(d, 'battery') && ['Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    if (has(d, 'zones')) h += Kit.actionRows('rows', [['pr-zones', 'Places in the room', d.zones.length ? `${d.zones.map((z) => z.name).join(', ')} · tap to change` : 'Paint where the sofa or desk is']]);
    if (has(d, 'history')) {
      const t0 = new Date(); t0.setHours(0, 0, 0, 0); const day = 86400000, now = Date.now(), pct = (t) => ((Math.max(t0.getTime(), t) - t0.getTime()) / day) * 100;
      h += `<div class="pad" data-key="strip" style="margin-top:24px"><div class="info-card wide sm-level pr-strip-card"><span>Occupied today · ${Kit.dur(st.today.reduce((s, [a, b]) => s + ((b || now) - Math.max(a, t0.getTime())), 0) / 1000)}</span>
        <div class="ct-strip"><div class="bar">${st.today.map(([a, b]) => `<i style="left:${pct(a).toFixed(2)}%;width:max(3px,${(pct(b || now) - pct(a)).toFixed(2)}%)"></i>`).join('')}<b style="left:${pct(now).toFixed(2)}%"></b></div><div class="axis"><span>0:00</span><span>12:00</span><span>24:00</span></div></div></div></div>`;
    }
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), subText(d)); }

  /* ---------- Places in the room (zone painter) ---------- */
  function openZones(d, ctx) {
    let sel = 0;
    const s = UI.sheet({
      title: 'Places in the room', sub: 'The sensor doesn’t see furniture. Pick a place, then tap the squares where it is — the sensor will tell when someone is there.',
      render: () => {
        const z = d.zones[sel];
        return `<div class="pad pr-chips">${d.zones.map((x, i) => `<button class="pr-chip t-${TONES[i % TONES.length]} ${i === sel ? 'on' : ''}" data-action="pr-zsel" data-i="${i}"><i></i>${esc(x.name)}</button>`).join('')}${d.zones.length < 6 ? '<button class="pr-chip add" data-action="pr-znew">+ New place</button>' : ''}</div>
          ${z ? `<div class="pad"><div class="pr-map edit">${plan(d, { edit: true, sel })}</div><div class="list-footer" style="padding-left:4px;padding-right:4px">Tap squares to add them to <b>${esc(z.name)}</b> — tap again to remove. Top = the wall with the sensor.</div></div>
          ${UI.group('Name', `<div class="pad pr-names">${NAMES.map((n) => `<button class="va-chip ${z.name === n ? 'on' : ''}" data-action="pr-zname" data-n="${n}">${n}</button>`).join('')}</div>`)}
          <div class="pad" style="margin-top:16px"><button class="btn btn-danger btn-block" data-action="pr-zdel">Remove ${esc(z.name)}</button></div>` : '<div class="list-footer">No places yet — tap “+ New place”.</div>'}`;
      },
    });
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    UI.on({
      'pr-zsel': ({ i }) => { sel = +i; s.refresh(); },
      'pr-znew': () => { const used = d.zones.map((z) => z.name); d.zones.push({ name: NAMES.find((n) => !used.includes(n)) || 'Other', cells: [] }); sel = d.zones.length - 1; commit(); },
      'pr-zname': ({ n }) => { d.zones[sel].name = n; commit(); },
      'pr-cell': ({ c }) => { const z = d.zones[sel]; if (!z) return; const had = z.cells.includes(c); d.zones.forEach((x) => { x.cells = x.cells.filter((k) => k !== c); }); if (!had) z.cells.push(c); commit(); },
      'pr-zdel': () => { d.zones.splice(sel, 1); sel = Math.max(0, sel - 1); commit(); },
    });
  }
  function openIgnore(d, ctx) {
    const s = UI.sheet({
      title: 'Parts not to watch', sub: 'Tap a strip of the room where a fan or a curtain moves — the radar will ignore it (a person there won’t be seen either)',
      render: () => `<div class="pad"><div class="pr-map edit">${plan(d, { strips: true })}</div><div class="list-footer" style="padding-left:4px;padding-right:4px">Dark strips are not watched. Top = the wall with the sensor.</div></div>`,
    });
    UI.on({ 'pr-band': ({ i }) => { S(d, 'ignore')[+i] = !S(d, 'ignore')[+i]; Store.save(); ctx.render(); s.refresh(); } });
  }
  function bindPage(d, ctx) { UI.on({ 'pr-zones': () => openZones(d, ctx) }); }
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d, { foot: { Detection: 'Stored in the sensor.', 'Zones & areas': 'Shown on the room plan on the device page.' } });
  const EV = { in: (e) => `Someone came in${e.z ? ' · ' + e.z : ''}`, out: 'Room empty', zone: (e) => `Moved to the ${e.z.toLowerCase()}`, relay: (e) => `Light ${e.on ? 'on' : 'off'}`, learned: 'Learned the empty room', offline: 'Stopped answering' };
  function bindSettings(d, ctx) {
    Kit.bindSettings(F, d, ctx, { learn: () => { d.st.learnUntil = Date.now() + 8000; Store.save(); ctx.render(); UI.toast('Leave the room — learning for a moment'); } });
    UI.on({ 'pr-zones': () => openZones(d, ctx), 'pr-ignore': () => openIgnore(d, ctx), 'rs-history': () => Kit.historySheet(d, EV, 'When the room was occupied') });
  }
  const about = (d) => [['Room', word(d)], ...(has(d, 'zones') && d.st.zone ? [['Place', d.st.zone]] : [])];

  function protoPanel(d) {
    const P = d.phys;
    return Kit.protoHead('Presence sensor prototype', '9. Presence_Sensor_Interface.html', PRESETS, d) + `
      <h3>The room · <span style="font-weight:400">${P.here ? `a person ${({ large: 'walking', small: 'moving a little', still: 'still' })[P.move]}${zoneOf(Object.assign({}, d, { features: d.features.concat('zones') }), P.x, P.y) ? ' at the ' + zoneOf(Object.assign({}, d, { features: d.features.concat('zones') }), P.x, P.y).toLowerCase() : ''}` : 'nobody'}${P.fan ? ' · fan on' : ''}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-walk', '🚶 Someone walks in')}${Kit.ppBtn('pp-sofa', '🛋 Sits on the sofa')}${Kit.ppBtn('pp-desk', '💻 Works at the desk')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-door', '🚪 Stands at the door')}${Kit.ppBtn('pp-leave', '👋 Leaves the room')}${Kit.ppBtn('pp-fan', P.fan ? '🌀 Fan off' : '🌀 Fan on (fools the radar)')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-dark', d.st.lux < 30 ? '☀️ Daylight' : '🌙 Evening (dark)', has(d, 'light') || has(d, 'presenceLight'))}${Kit.ppBtn('pp-batt', d.battery <= 20 ? '🔋 New battery' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    const P = d.phys, go = (k, move) => Object.assign(P, { here: true, x: AT[k][0], y: AT[k][1], move });
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-walk': () => go('walk', 'large'),
      'pp-sofa': () => go('sofa', 'still'),
      'pp-desk': () => go('desk', 'small'),
      'pp-door': () => go('door', 'large'),
      'pp-leave': () => { P.here = false; return `The sensor waits ${has(d, 'timing') ? S(d, 'timing').leave : 30} s before saying “empty”`; },
      'pp-fan': () => { P.fan = !P.fan; if (P.fan && !P.here) return 'An empty room with a fan: the radar may think someone is here — “Parts not to watch” or Learn fixes it'; },
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
