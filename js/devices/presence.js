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
  const tone = (d) => (!d.online ? '' : 'closed');   // “Someone here” stays white like every neutral state word (user, 2026-11-18)
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
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: 'dev-presence', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }]; };

  /* ---------- The room plan (only in the zone-painting sheets; the device page shows the radar below) ---------- */
  // one look for every room drawing (radar on the device page, Places pages, Parts not to watch):
  // the wall = one hairline; places = a soft fill, no border; the chosen / occupied place = blue; squares = hairlines
  const W = 343, PD = 6, CW = (W - PD * 2) / COLS, CH = 40, H = PD * 2 + ROWS * CH;
  const cx = (x) => PD + x * CW, cy = (y) => PD + y * CH;
  // radii: room 16 · place tile 8 · square 6 (one scale everywhere — radar, Places pages, Parts not to watch)
  const RR = 16, TR = 8, SR = 6;
  function plan(d, o = {}) {
    const R = reach(d), ign = has(d, 'ignore') ? S(d, 'ignore') : [], uid = `pr${Math.random().toString(36).slice(2, 7)}`;
    const room = `x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="${RR}"`;
    const owner = {}; d.zones.forEach((z, k) => z.cells.forEach((c) => { owner[c] = k; }));
    let body = '';
    if (o.edit) {
      // every square is its own tile: empty · another place · this place (blue). Squares never merge, so each one
      // lights up on its own when you tap it and the gaps between squares always stay.
      for (let b = 1; b <= ROWS; b++) for (let a = 1; a <= COLS; a++) {
        const k = owner[`${a},${b}`], cls = k == null ? '' : k === o.sel ? 'sel' : 'other';
        body += `<rect x="${(cx(a - 1) + 2).toFixed(1)}" y="${cy(b - 1) + 2}" width="${(CW - 4).toFixed(1)}" height="${CH - 4}" rx="${SR}" class="pr-sq ${cls}" data-action="pr-cell" data-c="${a},${b}"/>`;
      }
      d.zones.forEach((z, k) => { if (!z.cells.length) return; const first = z.cells.map((c) => c.split(',').map(Number)).sort((p, q) => p[1] - q[1] || p[0] - q[0])[0];
        body += `<text class="pr-lbl ${k === o.sel ? 'sel' : ''}" x="${(cx(first[0] - 1) + 12).toFixed(1)}" y="${cy(first[1] - 1) + 24}">${esc(z.name)}</text>`; });
    } else if (o.strips) {
      body = ign.map((on, r) => `<rect x="${PD}" y="${cy(r) + 2}" width="${W - PD * 2}" height="${CH - 4}" rx="${SR}" class="pr-stripbtn ${on || r + 1 <= R.min || r >= R.max ? 'on' : ''}" data-action="pr-band" data-i="${r}"/>`).join('');
    } else {
      // a full rectangle of squares = one tile; any other shape = its squares
      d.zones.forEach((z, i) => {
        const r = zoneRects(z); if (!r) return;
        let shapes;
        if (r.full) { const a0 = Math.round(r.box.u * COLS), b0 = Math.round(r.box.v * ROWS), w = Math.round(r.box.w * COLS), h = Math.round(r.box.h * ROWS); shapes = `<rect x="${(cx(a0) + 2).toFixed(1)}" y="${cy(b0) + 2}" width="${(CW * w - 4).toFixed(1)}" height="${CH * h - 4}" rx="${TR}"/>`; }
        else shapes = z.cells.map((c) => { const [a, b] = c.split(',').map(Number); return `<rect x="${(cx(a - 1) + 2).toFixed(1)}" y="${cy(b - 1) + 2}" width="${(CW - 4).toFixed(1)}" height="${CH - 4}" rx="${SR}"/>`; }).join('');
        const first = z.cells.map((c) => c.split(',').map(Number)).sort((p, q) => p[1] - q[1] || p[0] - q[0])[0];
        body += `<g class="pr-z ${o.sel === i ? 'sel' : ''}">${shapes}<text x="${(cx(first[0] - 1) + 12).toFixed(1)}" y="${cy(first[1] - 1) + 24}">${esc(z.name)}</text></g>`;
      });
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="pr-plan" aria-hidden="true"><defs><clipPath id="${uid}"><rect ${room}/></clipPath></defs>
      <rect ${room} class="pr-floor"/><g clip-path="url(#${uid})">${body}</g><rect ${room} class="pr-wall"/>
      <rect x="${W / 2 - 14}" y="-2.5" width="28" height="6" rx="3" class="pr-sensor"/></svg>`;   // the sensor on the top wall (instead of a “Top = …” note)
  }

  /* ---------- The radar (device page) ----------
     Just the room from above: one unbroken hairline wall, the areas the user painted as quiet glass tiles, a very
     soft blue light turning slowly around the room (barely there), and each person as a soft “roughly here” glow
     with a clear dot. Drawn on a canvas every frame; the canvas is [data-keep] so the 1-second re-render never
     touches it, and the animation state lives per device (no jumps when the page re-renders).
     Design page: design/presence-radar.html (user picked the dot, 2026-11-16). */
  const RW = 343, RH = 300, TAU = Math.PI * 2;
  const RM = { x: 8, y: 8, w: 327, h: 284, r: 16 }, CXR = RM.x + RM.w / 2, CYR = RM.y + RM.h / 2;
  const rpx = (u) => RM.x + u * RM.w, rpy = (v) => RM.y + v * RM.h;
  const ANIM = new Map();   // device id → { people, zk, sweepA, frozen }
  let raf = 0, lastT = 0;
  const smooth = (cur, to, dt, tau) => cur + (to - cur) * (1 - Math.exp(-dt / tau));
  const mix = (a, b, k) => a + (b - a) * k;
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function glow(c, x, y, r, rgb, a) {   // eased radial stops — no hard edge, no banding
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    [[0, 1], [.18, .82], [.36, .56], [.54, .32], [.72, .14], [.88, .04], [1, 0]].forEach(([o, k]) => g.addColorStop(o, `rgba(${rgb},${(a * k).toFixed(4)})`));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  }
  // a painted place → rectangles in room units (0..1); a full rectangle of squares becomes one tile
  function zoneRects(z) {
    const pts = z.cells.map((c) => c.split(',').map(Number)); if (!pts.length) return null;
    const a0 = Math.min(...pts.map((p) => p[0])), a1 = Math.max(...pts.map((p) => p[0])), b0 = Math.min(...pts.map((p) => p[1])), b1 = Math.max(...pts.map((p) => p[1]));
    const full = pts.length === (a1 - a0 + 1) * (b1 - b0 + 1), g = 0.012;
    const box = { u: (a0 - 1) / COLS + g, v: (b0 - 1) / ROWS + g, w: (a1 - a0 + 1) / COLS - 2 * g, h: (b1 - b0 + 1) / ROWS - 2 * g };
    return { box, full, cells: pts.map(([a, b]) => ({ u: (a - 1) / COLS + g, v: (b - 1) / ROWS + g, w: 1 / COLS - 2 * g, h: 1 / ROWS - 2 * g })) };
  }
  // what the radar should show for this device right now
  function scene(d) {
    const st = d.st, off = !d.online, leaving = !!(st.occ && st.emptyAt), here = !off && st.occ;
    const known = has(d, 'zones') || has(d, 'distance');                   // can the sensor tell where?
    const u = has(d, 'zones') ? st.x / COLS : 0.5, v = known ? st.y / ROWS : 0.5;
    return { off, empty: !off && !st.occ, leaving, here, known, u: Math.min(.95, Math.max(.05, u)), v: Math.min(.95, Math.max(.05, v)),
      act: st.move === 'still' ? 'still' : st.move === 'small' ? 'small' : 'walk', zone: here && !leaving && has(d, 'zones') ? st.zone : null };
  }
  function streak(c, p) {   // walking: one soft tapered streak of light (a single filled shape — no dots)
    const pts = p.hist, n = pts.length; if (n < 3) return;
    const L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], m = Math.hypot(dx, dy) || 1, w = 5.5 * Math.pow(i / (n - 1), 0.8);
      L.push([pts[i][0] - dy / m * w, pts[i][1] + dx / m * w]); R.push([pts[i][0] + dy / m * w, pts[i][1] - dx / m * w]);
    }
    c.beginPath(); c.moveTo(L[0][0], L[0][1]); L.forEach((q) => c.lineTo(q[0], q[1])); for (let i = n - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]); c.closePath();
    const g = c.createLinearGradient(pts[0][0], pts[0][1], pts[n - 1][0], pts[n - 1][1]);
    g.addColorStop(0, 'rgba(10,132,255,0)'); g.addColorStop(.5, `rgba(10,132,255,${(.07 * p.a).toFixed(3)})`); g.addColorStop(1, `rgba(64,156,255,${(.26 * p.a).toFixed(3)})`);
    c.fillStyle = g; c.fill();
  }
  function drawRadar(cv, d, t, dt) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const W2 = Math.round(cv.clientWidth * (window.devicePixelRatio || 1)), H2 = Math.round(W2 * RH / RW);
    if (!W2) return;
    if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; cv._off = null; }
    const c = cv.getContext('2d'), k = W2 / RW;
    const A = ANIM.get(d.id) || (ANIM.set(d.id, { people: [], zk: {}, sweepA: 1, frozen: t }), ANIM.get(d.id));
    const sc = scene(d);
    if (!sc.off) A.frozen = t; const T = A.frozen;
    // the person (one per device for now; the code draws a list so FP2-type sensors can show several)
    let p = A.people[0];
    if (sc.here && !p) { p = { u: sc.u, v: sc.v, a: 0, flare: 0, hist: [] }; A.people[0] = p; }
    if (p) {
      p.ta = sc.here ? 1 : 0;
      let tu = sc.u, tv = sc.v;
      if (sc.here && sc.act === 'small' && !reduce) { tu += Math.sin(t / 1.6) * 0.008; tv += Math.cos(t / 2.1) * 0.006; }
      if (!sc.off && sc.here) {
        const du = tu - p.u, dv = tv - p.v, dist = Math.hypot(du, dv), sp = Math.min(dist, 0.16 * dt * Math.min(1, dist / 0.08 + .2));
        if (dist > 1e-4) { p.u += du / dist * sp; p.v += dv / dist * sp; }
        const walking = dist > 0.01 && sc.act !== 'small', xy = [rpx(p.u), rpy(p.v)], lp = p.hist[p.hist.length - 1];
        if (walking && (!lp || Math.hypot(xy[0] - lp[0], xy[1] - lp[1]) > 1.5)) p.hist.push(xy);
        if (p.hist.length > (walking ? 26 : 0)) p.hist.shift();
        if (!walking && p.hist.length) { p.hist.shift(); if (p.hist.length) p.hist[p.hist.length - 1] = xy; }
      }
      p.a = smooth(p.a, p.ta, dt, 0.45);
      if (p.a < 0.01 && !p.ta) { A.people = []; p = null; }
    }

    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, RW, RH);
    c.globalAlpha = sc.off ? 0.5 : 1;
    c.save(); rr(c, RM.x, RM.y, RM.w, RM.h, RM.r); c.clip();
    c.fillStyle = 'rgba(255,255,255,.055)'; c.fillRect(RM.x, RM.y, RM.w, RM.h);
    glow(c, CXR, CYR, 210, '10,132,255', sc.off ? 0.03 : 0.07);
    // areas
    const Z = has(d, 'zones') ? d.zones.map((z) => ({ z, r: zoneRects(z) })).filter((x) => x.r) : [];
    const inZone = (x, y) => Z.some(({ r }) => x > rpx(r.box.u) - 4 && x < rpx(r.box.u + r.box.w) + 4 && y > rpy(r.box.v) - 4 && y < rpy(r.box.v + r.box.h) + 4);
    [[34, .12], [72, .095], [110, .07], [148, .045]].forEach(([r, a]) => {   // distance rings: fine dots fading outwards
      c.fillStyle = `rgba(255,255,255,${a})`; const n = Math.round(TAU * r / 8);
      for (let i = 0; i < n; i++) { const an = TAU * i / n, x = CXR + Math.cos(an) * r, y = CYR + Math.sin(an) * r; if (x < RM.x + 12 || x > RM.x + RM.w - 12 || y < RM.y + 12 || y > RM.y + RM.h - 12 || inZone(x, y)) continue; c.beginPath(); c.arc(x, y, .85, 0, TAU); c.fill(); }
    });
    const lit = [];
    Z.forEach(({ z, r }) => {
      const kz = A.zk[z.name] = smooth(A.zk[z.name] || 0, sc.zone === z.name ? 1 : 0, dt, 0.28);
      if (sc.zone === z.name) lit.push(z.name);
      const fill = `rgba(${Math.round(mix(255, 10, kz))},${Math.round(mix(255, 132, kz))},255,${mix(.06, .22, kz).toFixed(3)})`;
      const box = r.box, x = rpx(box.u), y = rpy(box.v), w = box.w * RM.w, h = box.h * RM.h;
      if (r.full) { rr(c, x, y, w, h, 8); c.fillStyle = fill; c.fill(); }
      else { c.fillStyle = fill; r.cells.forEach((q) => { rr(c, rpx(q.u), rpy(q.v), q.w * RM.w, q.h * RM.h, 6); c.fill(); }); }
      c.font = '600 12px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif'; c.textBaseline = 'top';
      c.fillStyle = `rgba(255,255,255,${mix(.5, .95, kz).toFixed(3)})`; c.fillText(z.name, x + 10, y + 9);
    });
    // the radar light: one very soft glow turning once every 16 s, no edges, faded at the middle
    A.sweepA = smooth(A.sweepA, sc.off ? 0 : sc.empty ? 0.6 : 1, dt, 0.8);
    const beam = (T / 16) * TAU % TAU;
    if (!reduce && A.sweepA > 0.01) {
      const o = cv._off || (cv._off = Object.assign(document.createElement('canvas'), { width: W2, height: H2 })), oc = o.getContext('2d');
      oc.setTransform(k, 0, 0, k, 0, 0); oc.globalCompositeOperation = 'source-over'; oc.clearRect(0, 0, RW, RH);
      const tail = 1.9, f = tail / TAU, a = 0.075 * A.sweepA, g = oc.createConicGradient(beam - tail, CXR, CYR);
      [[0, 0], [.35, .06], [.6, .2], [.8, .48], [.93, .8], [1, 1]].forEach(([q, m]) => g.addColorStop(q * f, `rgba(10,132,255,${(a * m).toFixed(4)})`));
      [[.012, .55], [.03, .15], [.05, 0]].forEach(([q, m]) => g.addColorStop(f + q, `rgba(10,132,255,${(a * m).toFixed(4)})`));
      g.addColorStop(1, 'rgba(10,132,255,0)');
      oc.fillStyle = g; oc.fillRect(0, 0, RW, RH);
      oc.globalCompositeOperation = 'destination-in';
      const m = oc.createRadialGradient(CXR, CYR, 0, CXR, CYR, 230);
      [[0, 0], [.08, .05], [.18, .35], [.3, .8], [.42, 1], [.75, .85], [1, .5]].forEach(([q, v]) => m.addColorStop(q, `rgba(0,0,0,${v})`));
      oc.fillStyle = m; oc.fillRect(0, 0, RW, RH);
      c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(o, 0, 0); c.setTransform(k, 0, 0, k, 0, 0);
    }
    // the person: a soft “roughly here” glow + a clear dot (sensors that can't tell where: a wide glow in the middle)
    if (p) {
      const x = rpx(p.u), y = rpy(p.v), ang = (Math.atan2(y - CYR, x - CXR) + TAU) % TAU;
      const dd = Math.min(Math.abs(beam - ang), TAU - Math.abs(beam - ang)), hit = A.sweepA > .3 && !reduce ? Math.exp(-((dd / 0.35) ** 2)) : 0;
      p.flare = smooth(p.flare, hit, dt, 0.6);
      const breathe = sc.act === 'still' && !reduce ? (1 - Math.cos(T * TAU / 5.5)) / 2 : 0;
      if (!sc.leaving) streak(c, p);
      glow(c, x, y, (sc.known ? 42 : 90) + 4 * breathe, '10,132,255', (sc.leaving ? 0.08 : (sc.known ? 0.24 : 0.2) + 0.07 * p.flare + 0.05 * breathe) * p.a);
      glow(c, x, y + 2, 13, '0,0,0', 0.3 * p.a);
      c.globalAlpha = (sc.off ? .5 : 1) * p.a * (sc.leaving ? 0.6 : 1);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, 8, 0, TAU); c.fill();
      c.fillStyle = sc.leaving ? '#8e8e93' : '#0A84FF'; c.beginPath(); c.arc(x, y, 5.75, 0, TAU); c.fill();
      c.globalAlpha = sc.off ? 0.5 : 1;
    }
    c.restore();
    rr(c, RM.x + .5, RM.y + .5, RM.w - 1, RM.h - 1, RM.r); c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 1; c.stroke();
    c.globalAlpha = 1;
    // for checks / screen readers: who is shown and which area is lit
    const st = `${p && p.ta ? (sc.leaving ? 'leaving' : 'here') : 'none'}|${lit.join(',')}`;
    if (cv.dataset.state !== st) cv.dataset.state = st;
  }
  function frame(now) {
    const t = now / 1000, dt = Math.min(0.05, lastT ? t - lastT : 0.016); lastT = t;
    const cvs = [...document.querySelectorAll('.pr-radar canvas[data-id]')];
    if (!cvs.length) { raf = 0; lastT = 0; return; }   // nothing on screen: sleep
    cvs.forEach((cv) => { const d = Store.device(cv.dataset.id); if (d) drawRadar(cv, d, t, dt); });
    raf = requestAnimationFrame(frame);
  }
  function afterRender() { if (!raf) raf = requestAnimationFrame(frame); }

  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (has(d, 'battery') && d.battery <= 20) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    if (has(d, 'mode') && S(d, 'mode') === 'off') h += Kit.banner('ban-mode', 'info', 'round-info', '<b>Radar is off</b> · Only movement is seen — a still person looks like an empty room');
    h += `<div class="pad" data-key="scene"><div class="pr-radar" role="img" aria-label="${esc(word(d) + (subText(d) ? ' · ' + subText(d) : ''))}"><canvas data-keep data-id="${esc(d.id)}"></canvas></div></div>`;
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

  /* ---------- Places in the room: its own pages (places.html) — list + one page per place ---------- */
  const MAX_PLACES = 10;   // FP1 keeps up to 10 regions
  const openPlaces = (d, from) => UI.go(`places.html?id=${encodeURIComponent(d.id)}&from=${from}`);
  function openIgnore(d, ctx) {
    const s = UI.sheet({
      title: 'Parts not to watch', sub: 'Tap a strip of the room where a fan or a curtain moves — the radar will ignore it (a person there won’t be seen either)',
      render: () => `<div class="pad"><div class="pr-room">${plan(d, { strips: true })}</div><div class="list-footer" style="padding-left:4px;padding-right:4px">Dark strips are not watched.</div></div>`,
    });
    UI.on({ 'pr-band': ({ i }) => { S(d, 'ignore')[+i] = !S(d, 'ignore')[+i]; Store.save(); ctx.render(); s.refresh(); } });
  }
  function bindPage(d) { UI.on({ 'pr-zones': () => openPlaces(d, 'device') }); }
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d, { foot: { Detection: 'Stored in the sensor.', 'Zones & areas': 'Shown on the room on the device page.' } });
  const EV = { in: (e) => `Someone came in${e.z ? ' · ' + e.z : ''}`, out: 'Room empty', zone: (e) => `Moved to the ${e.z.toLowerCase()}`, relay: (e) => `Light ${e.on ? 'on' : 'off'}`, learned: 'Learned the empty room', offline: 'Stopped answering' };
  function bindSettings(d, ctx) {
    Kit.bindSettings(F, d, ctx, { learn: () => { d.st.learnUntil = Date.now() + 8000; Store.save(); ctx.render(); UI.toast('Leave the room — learning for a moment'); } });
    UI.on({ 'pr-zones': () => openPlaces(d, 'settings'), 'pr-ignore': () => openIgnore(d, ctx), 'rs-history': () => Kit.historySheet(d, EV, 'When the room was occupied') });
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
    icon: () => 'dev-presence', describe: (p) => `${p.manufacturer} · presence radar`,
    historyValue: (d) => (has(d, 'history') ? word(d) : null),
    homeTiles, page, bindPage, live, afterRender, settings, bindSettings, about, tick, busy: (d) => d.st.occ || !!d.st.learnUntil,
    protoPanel, bindProto,
    places: { plan, NAMES, MAX: MAX_PLACES },
  };
})();
