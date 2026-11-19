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
      // a strip is watched (filled), switched off by you ("Not watched": empty, dashed) or past the detection range
      // ("Out of range": empty, not tappable) — the words sit in the strip, so it reads without a legend (user, 2026-11-19)
      body = ign.map((on, r) => {
        const out = r + 1 <= R.min || r >= R.max, y = cy(r) + 2, h = CH - 4;
        const rect = `<rect x="${PD}" y="${y}" width="${W - PD * 2}" height="${h}" rx="${SR}" class="pr-stripbtn ${out ? 'out' : on ? 'on' : ''}"${out ? '' : ` data-action="pr-band" data-i="${r}"`}/>`;
        const word = out ? 'Out of range' : on ? 'Not watched' : '';
        return rect + (word ? `<text class="pr-strip-lbl" x="${PD + 14}" y="${(y + h / 2).toFixed(1)}">${word}</text>` : '');
      }).join('');
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

  /* ---------- The room picture (device page): dot matrix ----------
     The room drawn only with dots, like a calm LED panel (user's pick in design/presence-dotmatrix.html, 2026-11-18):
     round dots 11 px apart, the dot field has 12 px corners, no wall line, no sensor mark. A person is a soft patch of
     light — the dots there grow and turn blue with a bright core, breathing slowly when they sit; when they walk the dots
     fade out softly behind them. A slow scan comes down from the top wall. Places = the place's own dots, a little
     brighter and bigger, fading in from a round edge (no box, no border); the busy place turns blue. The name sits
     exactly between two dot rows, so no dot is covered or removed. Every dot eases its own brightness (fast to light,
     slow to fade), so nothing jumps. Canvas is [data-keep]; animation state lives per device. */
  // a square picture, full width: the outer dots sit on the canvas edge, so the field is 16 px from the screen sides (.pad)
  const RW = 343, RH = 343, TAU = Math.PI * 2;
  const RM = { x: 1.5, y: 1.5, w: RW - 3, h: RH - 3 }, PITCH = (RW - 3) / 30, FIELD_R = 12;
  const rpx = (u) => RM.x + u * RM.w, rpy = (v) => RM.y + v * RM.h;
  const ANIM = new Map();   // device id → { people, zk, dots, frozen }
  let raf = 0, lastT = 0;
  const smooth = (cur, to, dt, tau) => cur + (to - cur) * (1 - Math.exp(-dt / tau));
  const FONT = '600 10px -apple-system, "SF Pro Text", Inter, system-ui, sans-serif';
  // the dot grid: centred in the room, the field's corners rounded on its outer dots
  const GRID = (() => {
    const p = PITCH, cols = Math.round(RM.w / p) + 1, rows = Math.round(RM.h / p) + 1;
    const ox = RM.x, oy = RM.y, x1 = ox + (cols - 1) * p, y1 = oy + (rows - 1) * p, R = FIELD_R, pts = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = ox + c * p, y = oy + r * p, cx = Math.min(Math.max(x, ox + R), x1 - R), cy = Math.min(Math.max(y, oy + R), y1 - R);
      if (Math.hypot(x - cx, y - cy) <= R + .5) pts.push({ x, y });
    }
    return { pts, oy };
  })();
  // a painted place → rectangles in room units (0..1); a full rectangle of squares becomes one shape
  function zoneRects(z) {
    const pts = z.cells.map((c) => c.split(',').map(Number)); if (!pts.length) return null;
    const a0 = Math.min(...pts.map((p) => p[0])), a1 = Math.max(...pts.map((p) => p[0])), b0 = Math.min(...pts.map((p) => p[1])), b1 = Math.max(...pts.map((p) => p[1]));
    const full = pts.length === (a1 - a0 + 1) * (b1 - b0 + 1), g = 0.012;
    const box = { u: (a0 - 1) / COLS + g, v: (b0 - 1) / ROWS + g, w: (a1 - a0 + 1) / COLS - 2 * g, h: (b1 - b0 + 1) / ROWS - 2 * g };
    return { box, full, cells: pts.map(([a, b]) => ({ u: (a - 1) / COLS + g, v: (b - 1) / ROWS + g, w: 1 / COLS - 2 * g, h: 1 / ROWS - 2 * g })) };
  }
  // signed distance from a point to a rounded rectangle (px); negative inside
  function sdBox(x, y, b, R) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, qx = Math.abs(x - cx) - (b.w / 2 - R), qy = Math.abs(y - cy) - (b.h / 2 - R);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - R;
  }
  // a place in pixels: one round shape for a full rectangle, round cells for an odd shape; plus how much each dot belongs to it
  function placeShape(r) {
    const px = (q) => ({ x: rpx(q.u) + 3, y: rpy(q.v) + 3, w: q.w * RM.w - 6, h: q.h * RM.h - 6 });
    const parts = r.full ? [px(r.box)] : r.cells.map(px), box = px(r.box);
    const feather = Math.min(30, Math.min(...parts.map((b) => Math.min(b.w, b.h))) * .4);
    const weights = GRID.pts.map((d) => {
      const sd = Math.min(...parts.map((b) => sdBox(d.x, d.y, b, Math.min(b.w, b.h) * .5)));
      const w = Math.min(1, Math.max(0, (6 - sd) / feather)); return w * w * (3 - 2 * w);
    });
    return { box, weights };
  }
  // what the picture should show for this device right now
  function scene(d) {
    const st = d.st, off = !d.online, leaving = !!(st.occ && st.emptyAt), here = !off && st.occ;
    const known = has(d, 'zones') || has(d, 'distance');                   // can the sensor tell where?
    const u = has(d, 'zones') ? st.x / COLS : 0.5, v = known ? st.y / ROWS : 0.5;
    return { off, empty: !off && !st.occ, leaving, here, known, u: Math.min(.95, Math.max(.05, u)), v: Math.min(.95, Math.max(.05, v)),
      act: st.move === 'still' ? 'still' : st.move === 'small' ? 'small' : 'walk', zone: here && !leaving && has(d, 'zones') ? st.zone : null };
  }
  function drawRadar(cv, d, t, dt) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const W2 = Math.round(cv.clientWidth * (window.devicePixelRatio || 1)), H2 = Math.round(W2 * RH / RW);
    if (!W2) return;
    if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; }
    const c = cv.getContext('2d'), k = W2 / RW;
    const A = ANIM.get(d.id) || (ANIM.set(d.id, { people: [], zk: {}, dots: new Float32Array(GRID.pts.length), shapes: new Map(), frozen: t, drawn: false }), ANIM.get(d.id));
    const sc = scene(d);
    if (!sc.off) A.frozen = t; const T = A.frozen;
    // the person (one per device for now; the code keeps a list so FP2-type sensors can show several)
    let p = A.people[0];
    // someone appears: the patch grows from small and one soft ring of light spreads out (not on the first frame of the page)
    if (sc.here && !p) { p = { u: sc.u, v: sc.v, a: 0, sp: 0, still: 0, grow: A.drawn ? 0.45 : 1, loose: 0, born: A.drawn && !reduce ? t : -9, moving: false }; A.people[0] = p; }
    if (p) {
      p.ta = sc.here ? 1 : 0;
      let tu = sc.u, tv = sc.v;
      if (sc.here && sc.act === 'small' && !reduce) { tu += Math.sin(t / 1.6) * 0.008; tv += Math.cos(t / 2.1) * 0.006; }
      if (!sc.off && sc.here && !sc.leaving) {
        // walking: speeds up and slows down smoothly (no jump at the start, no snap at the end)
        const du = tu - p.u, dv = tv - p.v, dist = Math.hypot(du, dv);
        p.sp = smooth(p.sp, 0.16 * Math.min(1, dist / 0.1 + 0.1), dt, 0.4);
        const step = Math.min(dist, p.sp * dt); if (dist > 1e-4) { p.u += du / dist * step; p.v += dv / dist * step; }
        p.moving = dist > 0.012 && sc.act !== 'small';
      } else p.moving = false;
      p.still = smooth(p.still, !p.moving && sc.act === 'still' && !sc.leaving && sc.here ? 1 : 0, dt, 1.2);   // the breath fades in
      p.grow = smooth(p.grow, 1, dt, 0.35);
      p.loose = smooth(p.loose, sc.leaving || !p.ta ? 1 : 0, dt, sc.leaving ? 1.6 : 0.5);                    // unsure: wider and fainter
      p.a = smooth(p.a, p.ta * (sc.leaving ? 0.4 : 1), dt, p.ta ? 0.35 : 0.7);
      if (p.a < 0.01 && !p.ta) { A.people = []; p = null; }
    }
    A.drawn = true;
    // places: shapes are cached per painted layout
    const Z = has(d, 'zones') ? d.zones.map((z) => ({ z, r: zoneRects(z) })).filter((x) => x.r) : [];
    const lit = [];
    const places = Z.map(({ z, r }) => {
      const key = z.cells.slice().sort().join(';'); let s = A.shapes.get(key); if (!s) { s = placeShape(r); A.shapes.set(key, s); }
      const inside = p && p.ta && !sc.leaving && z.cells.includes(cellOf(p.u * COLS, p.v * ROWS));   // lit when the person is really there
      const kz = A.zk[z.name] = smooth(A.zk[z.name] || 0, inside ? 1 : 0, dt, inside ? 0.45 : 0.7);
      if (sc.zone === z.name) lit.push(z.name);
      return { z, s, kz };
    });

    c.setTransform(k, 0, 0, k, 0, 0); c.clearRect(0, 0, RW, RH);
    const off = sc.off, sigma = (sc.known ? PITCH * 2.1 : PITCH * 4.2), P = p && p.a > .01 ? [p] : [];
    // soft light under the person
    if (!off) P.forEach((q) => { const x = rpx(q.u), y = rpy(q.v), r = sigma * 3.2, g = c.createRadialGradient(x, y, 0, x, y, r);
      [[0, .16], [.3, .1], [.55, .045], [.8, .012], [1, 0]].forEach(([s, a]) => g.addColorStop(s, `rgba(10,132,255,${(a * q.a).toFixed(4)})`)); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); });
    const scanY = RM.y + ((T / 7.5) % 1.25) * RM.h, scanOn = !off && !reduce;
    const breath = (q) => (reduce ? 0 : q.still * (1 - Math.cos(T * TAU / 5.5)) / 2);
    const rings = P.filter((q) => t - q.born < 1.8).map((q) => { const e = (t - q.born) / 1.8; return { x: rpx(q.u), y: rpy(q.v), R: 8 + 92 * (1 - Math.pow(1 - e, 3)), a: .42 * Math.pow(1 - e, 1.6) }; });
    c.font = FONT;
    const labels = places.map(({ z, s: sh }) => { const kRow = Math.round((sh.box.y + 14 - GRID.oy) / PITCH - .5), y = GRID.oy + (kRow + .5) * PITCH, x = sh.box.x + 6;
      return { z, x, y, x0: x - 3, x1: x + c.measureText(z.name).width + 3, y0: y - PITCH * .75, y1: y + PITCH * .75 }; });
    GRID.pts.forEach((pt, i) => {
      let target = 0;
      P.forEach((q) => { const br = breath(q), s = sigma * q.grow * (1 + .1 * br + .45 * q.loose), dx = pt.x - rpx(q.u), dy = pt.y - rpy(q.v); target = Math.max(target, q.a * (.9 + .1 * br) * Math.exp(-(dx * dx + dy * dy) / (2 * s * s))); });
      rings.forEach((g) => { const dd = Math.hypot(pt.x - g.x, pt.y - g.y) - g.R; target = Math.max(target, g.a * Math.exp(-(dd * dd) / (2 * 7 * 7))); });
      if (off) target = 0;
      const v = A.dots[i] = target > A.dots[i] ? smooth(A.dots[i], target, dt, .12) : smooth(A.dots[i], target, dt, .55);
      let base = .085;
      if (scanOn) base += .07 * Math.exp(-((pt.y - scanY) ** 2) / (2 * 9 * 9));
      let pw = 0, pk = 0;
      places.forEach((pl) => { const w = pl.s.weights[i]; if (w > pw) { pw = w; pk = pl.kz; } });
      if (pw) base += (off ? .04 : .16 + .22 * pk) * pw;
      const under = labels.some((L) => pt.x > L.x0 && pt.x < L.x1 && pt.y > L.y0 && pt.y < L.y1);
      const I = Math.min(under ? .28 : 1, v), a = off ? base * .55 : Math.min(1, base + .9 * I);   // under a name the light stays soft, so the word reads
      let col;
      if (I < .04 || off) {
        const m = !off && pw ? pw * .95 * pk : 0;   // a place: white, turning blue while someone is in it
        col = `rgba(${Math.round(255 - 245 * m)},${Math.round(255 - 123 * m)},255,${a.toFixed(3)})`;
      } else { const w = Math.max(0, (I - .55) / .45); col = `rgba(${Math.round(10 + 245 * w)},${Math.round(132 + 123 * w)},255,${a.toFixed(3)})`; }
      const r = PITCH * .1 + PITCH * .26 * I, rp = pw && I < .04 ? r * (1 + .6 * pw) : r;
      c.fillStyle = col; c.beginPath(); c.arc(pt.x, pt.y, rp, 0, TAU); c.fill();
    });
    // names: between two dot rows at the top left of the place, never covering a dot
    c.font = FONT; c.textBaseline = 'middle';
    labels.forEach((L, j) => { c.fillStyle = `rgba(255,255,255,${(off ? .35 : .62 + .38 * places[j].kz).toFixed(3)})`; c.fillText(L.z.name, L.x, L.y + .5); });
    // for checks / screen readers: who is shown and which place is lit
    const st = `${p && p.ta ? (sc.leaving ? 'leaving' : 'here') : 'none'}|${lit.join(',')}`;
    if (cv.dataset.state !== st) cv.dataset.state = st;
    const shown = places.filter((q) => q.kz > .5).map((q) => q.z.name).join(',');   // which place looks lit right now
    if (cv.dataset.shown !== shown) cv.dataset.shown = shown;
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
      render: () => `<div class="pad"><div class="pr-room">${plan(d, { strips: true })}</div><div class="list-footer" style="padding-left:4px;padding-right:4px">Tap a strip to stop watching it, tap it again to watch it again.${has(d, 'range') ? ` Strips past ${S(d, 'range').max} m are out of range — change it in Detection range.` : ''}</div></div>`,
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

  /* The prototype's room is the user's own places: one button per place (plus the middle), how the person moves,
     someone coming in through the door, a walk around every place. Out of range / ignored strips say so. */
  const marked = (d) => d.zones.map((z, i) => ({ z, i })).filter(({ z }) => z.cells.length && !z.draft);   // places that have squares
  function spotOf(z) {   // where a person stands for a place: its middle (or, for an odd shape, the square nearest the middle)
    if (!z.cells.length) return MIDDLE;
    const pts = z.cells.map((c) => c.split(',').map(Number).map((n) => n - .5)), mx = pts.reduce((q, p) => q + p[0], 0) / pts.length, my = pts.reduce((q, p) => q + p[1], 0) / pts.length;
    if (z.cells.includes(cellOf(mx, my + .01))) return [mx, my + .01];
    return pts.reduce((m, p) => (Math.hypot(p[0] - mx, p[1] - my) < Math.hypot(m[0] - mx, m[1] - my) ? p : m));
  }
  const placeAt = (d, x, y) => (d.zones.find((z) => z.cells.includes(cellOf(x, y))) || {}).name || null;   // the real room, whatever the sensor knows
  const MIDDLE = [2.0, 3.5];
  const entrance = (d) => { const z = d.zones.find((q) => /door|entr/i.test(q.name)); return z ? spotOf(z) : [2.0, 6.5]; };
  function outOfSight(d, y) {
    const R = reach(d);
    if (y < R.min || y > R.max) return 'is outside the detection range — the sensor can’t see them there';
    if (has(d, 'ignore') && S(d, 'ignore')[Math.min(ROWS - 1, Math.floor(y))]) return 'is in a part the sensor doesn’t watch';
    return '';
  }
  let walkT = 0;
  function protoPanel(d) {
    const P = d.phys, at = P.here ? placeAt(d, P.x, P.y) : null;
    const MV = [['still', 'Sitting still'], ['small', 'A little'], ['large', 'Walking']];
    const status = P.here ? `a person ${({ large: 'walking', small: 'moving a little', still: 'sitting still' })[P.move]} ${at ? 'at the ' + at.toLowerCase() : 'in the room'}` : 'nobody';
    return Kit.protoHead('Presence sensor prototype', '9. Presence_Sensor_Interface.html', PRESETS, d) + `
      <h3>The room · <span style="font-weight:400">${esc(status)}${P.fan ? ' · fan on' : ''}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-in', P.here ? '🚶 Walks around' : '🚶 Someone comes in')}${P.here ? Kit.ppBtn('pp-leave', '👋 Leaves the room') : ''}</div>
      <h3>Goes to</h3>
      <div class="pp-seg pp-wrap">${marked(d).map(({ z, i }) => `<button class="${P.here && at === z.name ? 'on' : ''}" data-action="pp-go" data-i="${i}">${esc(z.name)}</button>`).join('')}<button class="${P.here && !at ? 'on' : ''}" data-action="pp-go" data-i="-1">Middle</button></div>
      ${P.here ? `<h3>Moves</h3><div class="pp-seg">${MV.map(([k, l]) => `<button class="${P.move === k ? 'on' : ''}" data-action="pp-move" data-m="${k}">${l}</button>`).join('')}</div>` : ''}
      <h3>Around the sensor</h3>
      <div class="pp-row">${Kit.ppBtn('pp-fan', P.fan ? '🌀 Fan off' : '🌀 Fan on (fools the radar)')}${Kit.ppBtn('pp-dark', d.st.lux < 30 ? '☀️ Daylight' : '🌙 Evening (dark)', has(d, 'light') || has(d, 'presenceLight'))}</div>
      <div class="pp-row">${Kit.ppBtn('pp-batt', d.battery <= 20 ? '🔋 New battery' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    const P = d.phys;
    // a little script of steps [x, y, move, ms]; the room picture eases between them
    const script = (steps, loop) => {
      clearTimeout(walkT);
      const run = (i) => { const [x, y, move, ms] = steps[i]; Object.assign(P, { here: true, x, y, move }); tick(d); Store.save(); ctx.render();
        const n = i + 1 < steps.length ? i + 1 : loop ? 0 : -1; if (n >= 0) walkT = setTimeout(() => run(n), ms); };
      run(0);
    };
    const travel = (x, y) => Math.round(Math.hypot((x - P.x) / COLS, (y - P.y) / ROWS) / 0.16 * 1000) + 900;   // time the picture needs to get there
    const goTo = ([x, y], settle) => { const first = !P.here; if (first) Object.assign(P, { x, y }); script([[x, y, first ? settle : 'large', first ? 0 : travel(x, y)], [x, y, settle, 0]]); };
    const warn = (name, y) => { const w = outOfSight(d, y); return w ? `${name} ${w}` : ''; };
    const stop = (f) => (a) => { clearTimeout(walkT); return f(a); };
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-in': stop(() => {
        if (!P.here) { const e = entrance(d); Object.assign(P, { x: e[0], y: e[1] }); script([[e[0], e[1], 'large', 2200], [MIDDLE[0], MIDDLE[1], 'large', travel(...MIDDLE) + 600], [MIDDLE[0], MIDDLE[1], 'small', 0]]); return warn('The door', e[1]); }
        const spots = marked(d).map(({ z }) => spotOf(z)).concat([MIDDLE]); let x = P.x, y = P.y;
        script(spots.map((q) => { const ms = Math.round(Math.hypot((q[0] - x) / COLS, (q[1] - y) / ROWS) / 0.16 * 1000) + 1600; x = q[0]; y = q[1]; return [q[0], q[1], 'large', ms]; }), true);
      }),
      'pp-go': stop(({ i }) => {
        const z = d.zones[+i], q = z ? spotOf(z) : MIDDLE, settle = z && /door|entr/i.test(z.name) ? 'small' : 'still';
        goTo(q, settle); return warn(z ? z.name : 'The middle', q[1]);
      }),
      'pp-move': stop(({ m }) => { P.move = m; }),
      'pp-leave': stop(() => { P.here = false; return `The sensor waits ${has(d, 'timing') ? S(d, 'timing').leave : 30} s before saying “empty”`; }),
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
