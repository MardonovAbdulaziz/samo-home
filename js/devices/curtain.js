/* ==========================================================================
   Curtain motor device interface
   Source: "Device Interface 3 / 10. Curtain_Interface.html"
   (features from zigbee2mqtt, 226 curtain devices)
   Rule: show a control only if the paired curtain device has that feature.

   Motor model (per curtain): q = position as the MOTOR counts it, 0 closed … 100 open.
   A move is stored as { from, dir, target, t0 } and the position is worked out from the clock,
   so the curtain keeps moving across pages and re-renders. Physical position = q, or 100 − q when
   the motor turns the wrong way (installed the other way round and "Motor direction" not fixed).
   ========================================================================== */
Devices.curtain = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    openClose: { name: 'Open / Stop / Close', grp: 'Device page', type: 'control', short: 'The three main buttons.' },
    position: { name: 'Position', grp: 'Device page', type: 'control', short: 'Move the curtain to an exact point.' },
    step: { name: 'Small steps', grp: 'Device page', type: 'control', short: 'Nudge the curtain a little.' },
    tilt: { name: 'Slat angle', grp: 'Device page', type: 'control', def: 50, short: 'Turn the slats of a venetian blind.' },
    battery: { name: 'Battery', grp: 'Device page', type: 'reading', short: 'Charge level of a battery motor.' },

    openingStyle: { name: 'Opening style', grp: 'Curtain', type: 'style', def: 'left', app: true,
      opts: [['left', 'Opens to the left', 'Fabric gathers on the left'], ['right', 'Opens to the right', 'Fabric gathers on the right'], ['center', 'Opens from the middle', 'Both halves move to the sides'], ['roller', 'Roller blind', 'Rolls up and down']],
      short: 'How the curtain is installed. Only changes the picture in the app.' },
    reverse: { name: 'Motor direction', grp: 'Curtain', type: 'direction', def: false,
      short: 'Which way the motor turns. Change it only if “Open” closes the curtain.' },
    invert: { name: 'Swap open / closed %', grp: 'Curtain', type: 'toggle', def: false, app: true, label: 'Swap the numbers',
      short: 'Only the number shown: use it if the app says 100 % when the curtain is closed.' },
    calibration: { name: 'Calibration', grp: 'Curtain', type: 'calib', short: 'Teaches the motor where fully open and fully closed are.' },
    resetLimits: { name: 'Reset limits', grp: 'Curtain', type: 'action', short: 'Deletes the learned ends so the curtain can be calibrated again.' },

    speed: { name: 'Motor speed', grp: 'Motor', type: 'choice', def: 'normal',
      opts: [['slow', 'Slow', 'Quieter'], ['normal', 'Normal', ''], ['fast', 'Fast', '']], short: 'How fast the curtain moves.' },
    quiet: { name: 'Quiet mode', grp: 'Motor', type: 'toggle', def: false, label: 'Quiet mode', short: 'Slower and quieter, e.g. for the bedroom in the morning.' },
    motorMode: { name: 'Button behaviour', grp: 'Motor', type: 'choice', def: 'continuous',
      opts: [['continuous', 'Run to the end', 'One press opens or closes fully'], ['inching', 'A little per press', 'Precise, but slow for a big window']],
      short: 'Does one press run the curtain all the way, or only a short step?' },
    handPull: { name: 'Pull to start', grp: 'Motor', type: 'toggle', def: true, label: 'Pull to start',
      short: 'A small pull by hand and the motor finishes opening or closing.' },
    manualStop: { name: 'Pull to stop', grp: 'Motor', type: 'toggle', def: true, label: 'Pull to stop',
      short: 'Holding the moving curtain stops the motor.' },

    switchType: { name: 'Wall switch type', grp: 'Wall switch', type: 'choice', def: 'momentary',
      opts: [['momentary', 'Push buttons', 'One press runs to the end'], ['toggle', 'Rocker switch', 'Moves while held up or down']],
      short: 'The wall switch wired to the curtain module.' },
    childLock: { name: 'Child lock', grp: 'Wall switch', type: 'toggle', def: false, label: 'Child lock', short: 'Buttons on the device stop working. Only the app works.' },
    indicator: { name: 'Status light', grp: 'Wall switch', type: 'choice', def: 'on',
      opts: [['on', 'On', ''], ['off', 'Off', '']], short: 'The small light on the switch module.' },

    motorFault: { name: 'Blocked alert', grp: 'Safety', type: 'alert', short: 'The motor stops when something blocks the curtain, and tells the app.' },
    calStatus: { name: 'Calibration status', grp: 'Device', type: 'reading', short: 'Whether the curtain is calibrated, and the time for a full run.' },
    identify: { name: 'Find this device', grp: 'Device', type: 'action', short: 'The motor jogs a little so you know which curtain it is.' },
  };
  const SETTINGS_GROUPS = ['Curtain', 'Motor', 'Wall switch'];
  const ALL_GROUPS = ['Device page', ...SETTINGS_GROUPS, 'Safety', 'Device'];

  /* How a device learns its ends (never typed in by the user) */
  const CAL = {
    auto: { name: 'Learns by itself', text: 'The curtain closes until it meets resistance at the end of the track, then opens to the other end. It remembers both.' },
    autoCmd: { name: 'One-tap auto', text: 'The device runs to both ends by itself and reports when it is done.' },
    time: { name: 'Travel time', text: 'This module can’t feel the end. You time one full run: it works out every position from that time.' },
    limits: { name: 'Set end points', text: 'This motor can’t feel the end. Move it to the top and save, then to the bottom and save.' },
  };

  const PRESETS = [
    { id: 'tuya', name: 'Tuya track motor', model: 'TS0601_cover_1', manufacturer: 'Tuya', cal: 'auto', style: 'center', names: ['Curtain'],
      feats: ['openClose', 'position', 'openingStyle', 'reverse', 'invert', 'calibration', 'speed', 'resetLimits'] },
    { id: 'aqb1', name: 'Aqara curtain B1', model: 'ZNCLDJ12LM', manufacturer: 'Aqara', cal: 'auto', style: 'left', names: ['Curtain'],
      feats: ['openClose', 'position', 'battery', 'openingStyle', 'reverse', 'invert', 'calibration', 'handPull', 'resetLimits'] },
    { id: 'aqc3', name: 'Aqara curtain C3', model: 'ZNCLDJ01LM', manufacturer: 'Aqara', cal: 'autoCmd', style: 'center', names: ['Curtain'],
      feats: ['openClose', 'position', 'openingStyle', 'reverse', 'invert', 'calibration', 'speed', 'handPull', 'manualStop', 'calStatus', 'identify', 'resetLimits'] },
    { id: 'mod', name: 'Curtain switch module', model: 'TS130F', manufacturer: 'Tuya', cal: 'time', style: 'left', names: ['Curtain'],
      feats: ['openClose', 'position', 'openingStyle', 'reverse', 'invert', 'calibration', 'switchType', 'indicator'] },
    { id: 'dual', name: 'Dual curtain module', model: 'TS130F_dual', manufacturer: 'Lonsonho', cal: 'time', style: 'left', names: ['Left window', 'Right window'],
      feats: ['openClose', 'openingStyle', 'reverse', 'calibration', 'switchType'] },
    { id: 'roller', name: 'Roller blind motor', model: 'TS0601_cover_3', manufacturer: 'Tuya', cal: 'limits', style: 'roller', names: ['Blind'],
      feats: ['openClose', 'position', 'step', 'battery', 'openingStyle', 'reverse', 'invert', 'calibration', 'motorMode', 'motorFault', 'resetLimits'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', cal: 'auto', style: 'center', names: ['Curtain'], feats: Object.keys(F) },
  ];

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x);
  const has = (d, k) => d.features.includes(k);
  const S = (d, k) => d.settings[k];
  const multi = (d) => d.curtains.length > 1;
  const style = (d) => S(d, 'openingStyle') || 'left';
  const roller = (d) => style(d) === 'roller';
  const noun = (d) => (roller(d) ? 'blind' : 'curtain');
  const Noun = (d) => (roller(d) ? 'Blind' : 'Curtain');
  const flip = (d) => !!(d.sim && d.sim.backwards) !== !!S(d, 'reverse');   // motor turns the wrong way physically
  const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
  const MINIT = { q: 35, move: null, calibrated: false, hit0: false, hit100: false, limOpen: false, limClose: false, ctime: null, timing: null, fault: false, obstacle: false };

  function applyDefaults(d) {
    for (const k in F) if (F[k].def !== undefined && d.settings[k] === undefined) d.settings[k] = clone(F[k].def);
    // features that were dropped from the app (saved data from older versions)
    d.features = d.features.filter((k) => F[k]); delete d.settings.favorite;
  }
  function makeCurtain(name, q, calibrated) { return Object.assign(clone(MINIT), { name, q, calibrated }); }
  function setCurtainCount(d, n, names) {
    while (d.curtains.length < n) d.curtains.push(makeCurtain((names && names[d.curtains.length]) || 'Curtain ' + (d.curtains.length + 1), 70, !has(d, 'calibration')));
    d.curtains.length = n;
    d.sel = Math.min(d.sel || 0, n - 1);
  }
  function create(presetId, { name, roomId, channelNames } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const names = channelNames || p.names;
    const d = {
      id: Store.uid('d'), type: 'curtain', preset: p.id, name: name || p.name, roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'CT', mac: Array.from({ length: 6 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '2.1.4_0031', online: true, showOnHome: true, isNew: true, createdAt: Date.now(),
      features: p.feats.slice(), cal: p.cal, settings: { openingStyle: p.style }, curtains: [], sel: 0,
      battery: 64, charging: false, sim: { backwards: false },
    };
    applyDefaults(d);
    setCurtainCount(d, names.length, names);
    return d;
  }

  /* ---------- Motor ---------- */
  const rate = (d) => 12.5 * ({ slow: 0.55, normal: 1, fast: 1.7 }[S(d, 'speed')] || 1) * (has(d, 'quiet') && S(d, 'quiet') ? 0.55 : 1);   // % per second (8 s full run)
  const phys = (d, q) => (flip(d) ? 100 - q : q);
  /** Where the current move will stop, and why. */
  function stopPoint(d, m) {
    const mv = m.move;
    let q = mv.target !== null ? mv.target : mv.dir > 0 ? 100 : 0, why = mv.target !== null ? 'target' : 'end';
    // An obstacle on the track blocks the curtain while it CLOSES physically (at ~45 % open)
    if (m.obstacle && has(d, 'motorFault')) {
      const physDir = flip(d) ? -mv.dir : mv.dir, qb = flip(d) ? 55 : 45;
      if (physDir < 0 && ((mv.dir < 0 && mv.from > qb && q < qb) || (mv.dir > 0 && mv.from < qb && q > qb))) { q = qb; why = 'fault'; }
    }
    return { q, why };
  }
  /** Position right now (motor counting). */
  function cur(d, m, now = Date.now()) {
    if (!m.move) return m.q;
    const { from, dir, t0 } = m.move, sp = stopPoint(d, m).q;
    const q = from + dir * rate(d) * (now - t0) / 1000;
    return dir > 0 ? Math.min(q, sp) : Math.max(q, sp);
  }
  const moving = (m) => !!m.move;
  function begin(d, m, dir, target) {
    const now = Date.now(); m.q = cur(d, m, now); m.fault = false;
    if (target !== null && Math.abs(target - m.q) < 0.5) { m.move = null; return; }
    m.move = { from: m.q, dir, target, t0: now };
  }
  function stop(d, m) {
    m.q = cur(d, m); m.move = null;
    if (m.timing !== null) { m.ctime = (Date.now() - m.timing) / 1000; m.timing = null; m.calibrated = true; }   // travel-time calibration
  }
  /** App / wall switch command: open, close or stop. */
  function cmd(d, i, c) {
    const m = d.curtains[i];
    if (c === 'stop') return stop(d, m);
    const dir = c === 'open' ? 1 : -1;
    if (has(d, 'motorMode') && S(d, 'motorMode') === 'inching') return begin(d, m, dir, clamp(Math.round(cur(d, m)) + dir * 8));
    begin(d, m, dir, m.calibrated ? (dir > 0 ? 100 : 0) : null);   // not calibrated: runs until the end of the track
  }
  function goTo(d, i, q) {
    const m = d.curtains[i]; if (!m.calibrated) return false;
    q = clamp(Math.round(q)); const now = cur(d, m);
    begin(d, m, q > now ? 1 : -1, q); return true;
  }
  /** Finish moves that have reached their stop point. Returns true if anything changed. */
  function settle(d, now = Date.now()) {
    let changed = false;
    d.curtains.forEach((m) => {
      if (!m.move) return;
      const sp = stopPoint(d, m), q = cur(d, m, now);
      if (Math.abs(q - sp.q) > 0.001) return;
      m.q = sp.q; m.move = null; changed = true;
      if (sp.why === 'fault') { m.fault = true; m.obstacle = false; }
      if (sp.why === 'end' && d.cal === 'auto' && !m.calibrated) {   // end of track found by resistance
        if (sp.q === 100) m.hit100 = true; else m.hit0 = true;
        if (m.hit0 && m.hit100) { m.calibrated = true; m.ctime = 100 / rate(d); }
      }
    });
    return changed;
  }
  function resetLimits(m) { Object.assign(m, { calibrated: false, hit0: false, hit100: false, limOpen: false, limClose: false, ctime: null, timing: null }); }

  /* ---------- Text ---------- */
  const shown = (d, q) => Math.round(S(d, 'invert') ? 100 - q : q);          // the % the app shows
  const fromShown = (d, v) => (S(d, 'invert') ? 100 - v : v);
  function movingText(d, m) { return m.move ? (m.move.dir > 0 ? (roller(d) ? 'Rising…' : 'Opening…') : (roller(d) ? 'Lowering…' : 'Closing…')) : ''; }
  function stateText(d, m) {
    if (!d.online) return 'Offline';
    if (m.fault) return 'Blocked';
    if (m.move) return movingText(d, m);
    if (!m.calibrated) return has(d, 'calibration') ? 'Not set up' : 'Stopped';
    const v = shown(d, m.q);
    return v <= 0 ? 'Closed' : v >= 100 ? 'Open' : 'Open ' + v + ' %';
  }
  /** Line under the big % on the device page (the % itself is shown above it). */
  function readoutText(d, m) {
    if (!d.online) return 'Offline';
    if (m.fault) return 'Blocked — stopped';
    if (m.move) return movingText(d, m);
    if (!m.calibrated) return 'Position unknown';
    const v = shown(d, m.q);
    return v <= 0 ? 'Closed' : v >= 100 ? 'Fully open' : 'Partly open';
  }
  const label = (d, i) => (multi(d) ? d.curtains[i].name : d.name);

  /* ---------- Home tiles ---------- */
  function homeTiles(d) {
    return d.curtains.map((m, i) => ({
      ch: i, name: label(d, i), icon: 'dev-curtains', accent: 'var(--primary)',
      on: d.online && phys(d, cur(d, m)) > 2, status: stateText(d, m), controllable: has(d, 'openClose'), offline: !d.online,
    }));
  }
  /** Tile power: stop if moving, else open a closed curtain / close an open one. */
  function toggle(d, i) {
    const m = d.curtains[i];
    if (m.move) return cmd(d, i, 'stop');
    cmd(d, i, phys(d, m.q) > 50 !== flip(d) ? 'close' : 'open');
  }

  /* ==========================================================================
     Curtain scene — sheer fabric on a dark page (SVG, redrawn every frame).
     No cartoon window: a slim ceiling track and white sheer cloth that lets light through.
     Pleats have a soft cosine light profile; the same number of pleats get narrower and deeper as
     the curtain gathers. A weighted hem, a soft shadow on the wall, faint cool light from behind
     when it opens. The hem trails a moving edge and swings back when it stops (spring).
     Coordinates are in a 400 × 300 viewBox.
     ========================================================================== */
  const VB = { w: 400, h: 300 }, ROD = { x0: 22, x1: 378, y: 22 }, FAB = { y0: 21, y1: 284 };
  const SPAN = ROD.x1 - ROD.x0, MINW = 30, ROLL = { x0: 40, x1: 360, y0: 34, min: 6, max: 246 };
  const mixC = (a, b, t) => '#' + [0, 2, 4].map((i) => Math.round(parseInt(a.substr(i + 1, 2), 16) * (1 - t) + parseInt(b.substr(i + 1, 2), 16) * t).toString(16).padStart(2, '0')).join('');
  /** Panel widths (viewBox px) for a physical position p: 0 closed … 100 open. */
  function widths(st, p) {
    const k = 1 - p / 100;
    if (st === 'center') { const w = MINW / 2 + (SPAN / 2 - MINW / 2) * k; return { l: w, r: w }; }
    const w = MINW + (SPAN - MINW) * k;
    return st === 'right' ? { l: 0, r: w } : { l: w, r: 0 };
  }
  const rollH = (p) => ROLL.min + (ROLL.max - ROLL.min) * (1 - p / 100);
  /** Where the leading edge is (for the drag bubble), in viewBox units. */
  function edgePoint(st, p) {
    if (st === 'roller') return { x: 200, y: ROLL.y0 + rollH(p) };
    const w = widths(st, p);
    return st === 'right' ? { x: ROD.x1 - w.r, y: 140 } : st === 'center' ? { x: 200, y: 140 } : { x: ROD.x0 + w.l, y: 140 };
  }
  /** Cosine light profile across one pleat: valley → crest → valley. depth 0…1 */
  function pleatStops(depth, crest) {
    const lo = mixC('#e2e5ea', '#adb3bc', depth), hi = crest;
    return [0, 0.12, 0.25, 0.37, 0.5, 0.63, 0.75, 0.88, 1].map((x) => {
      const t = 0.5 - 0.5 * Math.cos(2 * Math.PI * x);           // 0 at the valleys, 1 at the crest
      return `<stop offset="${x}" stop-color="${mixC(lo, hi, Math.pow(t, 0.8))}"/>`;
    }).join('');
  }

  /* ---------- Cloth motion ----------
     Smooth by construction: every moving part is a critically damped spring (it reaches its target as
     fast as possible and never overshoots — no bounce, no jitter).
     - rail: the leading glider follows the motor / finger; the others follow in proportion, the ones
       near the leading edge faster (the pull travels along the rail like an accordion);
     - cloth: each row of every pleat follows the row above it, lower rows more slowly — the hem trails a
       pull and the lag rolls down the fabric as a soft wave;
     - flutter: soft ripples run through the pleats while the curtain moves and fade out; a barely
       visible "breathing" stays so the fabric never looks frozen;
     - grab: the piece of cloth under the finger and its neighbourhood follow the finger with a soft
       falloff, so the fabric bends where you hold it.
     Shading of every pleat comes from how much that pleat is really compressed. */
  const ROWS = 10, LEN = (FAB.y1 - FAB.y0) / ROWS;
  // real fabric never hangs perfectly even: fixed, slightly different pleat widths (no flicker)
  const PW = [1.08, 0.9, 1.12, 0.96, 0.88, 1.05, 1.1, 0.94, 1.0, 0.9, 1.07, 0.97, 1.03, 0.92, 1.1, 0.95];
  const DV = [0.14, -0.1, 0.2, -0.12, 0.04, -0.16, 0.1, 0, -0.06, 0.16, -0.12, 0.08];   // per-pleat depth
  const BX = [0, 0.6, -0.5, 0.7, -0.7, 0.3, -0.3, 0.6, -0.6, 0.4, -0.4, 0.2, -0.3];     // how each pleat leans when it hangs (sums to 0)
  const cum = (n) => { const out = [0]; for (let k = 0; k < n; k++) out.push(out[k] + PW[k % PW.length]); return out.map((v) => v / out[n]); };
  // Feel (all in one place): spring speeds (rad/s), how much slower the hem is, flutter, breathing
  const FEEL = { lead: 26, rail: 12, row: 22, rowFall: 0.6, flutterAmp: 7, flutterHz: 1.25, flutterFade: 1.3, breathe: 0, grabReach: 1.8, railDrag: 7 };   // breathe 0: still when nothing moves; railDrag: how slowly the rod end follows your hand
  /** one step of a critically damped spring (semi-implicit, stable at 120 Hz) */
  const spring = (o, target, w, dt) => { o.v += (w * w * (target - o.x) - 2 * w * o.v) * dt; o.x += o.v * dt; };

  function clothPanel(x0, dir, n, full, minW, w) {
    const f = cum(n), P = { x0, dir, n, rest: full / n * 1.12, smin: Math.max(1.2, minW / n), f, g: [], gs: [], ch: [], e: 0, t: 0 };
    for (let k = 0; k <= n; k++) {
      const x = x0 + dir * w * f[k];
      P.gs.push({ x, v: 0 }); P.g.push(x);
      P.ch.push(Array.from({ length: ROWS + 1 }, (_, j) => ({ s: { x: x + dir * BX[k % BX.length] * 2.2 * (j / ROWS), v: 0 }, x, y: FAB.y0 + j * LEN })));
    }
    return P;
  }
  function clothFor(st, p) {
    const w = widths(st, p);
    if (st === 'center') return { st, panels: [clothPanel(ROD.x0, 1, 7, SPAN / 2, MINW / 2, w.l), clothPanel(ROD.x1, -1, 7, SPAN / 2, MINW / 2, w.r)] };
    return { st, panels: [st === 'right' ? clothPanel(ROD.x1, -1, 12, SPAN, MINW, w.r) : clothPanel(ROD.x0, 1, 12, SPAN, MINW, w.l)] };
  }
  /** grab: { k, j, x } — a piece of this panel held under the finger (or null) */
  function stepPanel(P, w, dt, grab) {
    const { x0, dir, n, f, gs } = P, lead = x0 + dir * w;
    // rail
    gs[0].x = x0; gs[0].v = 0;
    // your hand leads; the gliders on the rod are dragged along behind it (slower spring while you hold the cloth)
    spring(gs[n], lead, grab ? FEEL.railDrag : FEEL.lead, dt);
    const span = (gs[n].x - x0) * dir;
    for (let k = 1; k < n; k++) spring(gs[k], x0 + dir * span * f[k], FEEL.rail * (0.55 + 0.45 * k / n), dt);
    for (let k = 1; k <= n; k++) if ((gs[k].x - gs[k - 1].x) * dir < P.smin) gs[k].x = gs[k - 1].x + dir * P.smin;   // gliders never pass each other
    gs.forEach((o, k) => { P.g[k] = o.x; });
    // flutter energy: follows the leading edge's speed, then fades
    P.e = Math.max(P.e * Math.exp(-FEEL.flutterFade * dt), Math.min(1, Math.abs(gs[n].v) / 240));
    P.t += dt;
    // cloth rows
    const kg = grab ? grab.k : -1, jg = grab ? grab.j : -1;
    const pull = grab ? grab.x - P.ch[kg][0].s.x : 0;                     // how far the hand pulls that pleat from its glider
    for (let k = 0; k <= n; k++) {
      const c = P.ch[k];
      c[0].s.x = gs[k].x; c[0].s.v = gs[k].v;
      const wk = grab ? Math.exp(-((k - kg) ** 2) / (2 * FEEL.grabReach ** 2)) : 0;
      for (let j = 1; j <= ROWS; j++) {
        const lean = dir * BX[k % BX.length] * 2.2 * (j / ROWS);
        let target = c[j - 1].s.x + dir * BX[k % BX.length] * 2.2 / ROWS;   // follow the row above (+ its natural lean, mirrored per side)
        if (grab) {                                                       // the hand: strongest at the grabbed row, fading up and down
          const wr = j <= jg ? j / jg : Math.max(0, 1 - (j - jg) / (ROWS - jg + 2));
          target = target * (1 - wk * wr) + (gs[k].x + lean + pull * 1) * wk * wr;
        }
        spring(c[j].s, target, FEEL.row * (1 - FEEL.rowFall * j / ROWS), dt);
      }
    }
    // order per row (a crossed pleat looks like a tear) + stay between the walls
    for (let j = 1; j <= ROWS; j++) {
      for (let k = 1; k <= n; k++) {
        const a = P.ch[k - 1][j].s, b = P.ch[k][j].s;
        if ((b.x - a.x) * dir < 0.5) b.x = a.x + dir * 0.5;
      }
      for (let k = 0; k <= n; k++) { const q = P.ch[k][j].s; q.x = Math.max(ROD.x0 - 4, Math.min(ROD.x1 + 4, q.x)); }
    }
    // what is drawn: spring position + flutter ripple; the cloth keeps its length (the hem lifts a little when it swings)
    const amp = FEEL.flutterAmp * P.e + FEEL.breathe;
    for (let k = 0; k <= n; k++) {
      const c = P.ch[k];
      c[0].x = c[0].s.x; c[0].y = FAB.y0;
      for (let j = 1; j <= ROWS; j++) {
        const depth = Math.pow(j / ROWS, 1.4);
        const ripple = dir * amp * depth * Math.sin(2 * Math.PI * FEEL.flutterHz * P.t - j * 0.62 - k * 1.05);
        c[j].x = c[j].s.x + ripple;
        const dx = c[j].x - c[j - 1].x;
        c[j].y = c[j - 1].y + Math.sqrt(Math.max(LEN * LEN * 0.35, LEN * LEN - dx * dx));
      }
    }
  }
  function stepCloth(C, st, p, dt, grab) {
    const w = widths(st, p), ws = st === 'center' ? [w.l, w.r] : [st === 'right' ? w.r : w.l];
    const sub = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / sub;
    // opens from the middle: whatever the hand does to one half happens mirrored to the other half
    const mirror = grab && C.panels.length === 2 ? { pi: 1 - grab.pi, k: grab.k, j: grab.j, x: ROD.x0 + ROD.x1 - grab.x } : null;
    for (let s = 0; s < sub; s++) C.panels.forEach((P, i) => stepPanel(P, ws[i], h, grab && grab.pi === i ? grab : mirror && mirror.pi === i ? mirror : null));
  }

  /** Smooth path through points (quadratic through midpoints). */
  function smooth(pts, move = true) {
    let d = (move ? 'M ' : 'L ') + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      d += ` Q ${a.x.toFixed(1)} ${a.y.toFixed(1)} ${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)}`;
    }
    const z = pts[pts.length - 1];
    return d + ` L ${z.x.toFixed(1)} ${z.y.toFixed(1)}`;
  }
  const LEVELS = 7;
  function renderPanel(u, idx, P) {
    const { dir, n, rest } = P, id = `${u}p${idx}`;
    let defs = '', strips = '';
    for (let l = 0; l < LEVELS; l++) {
      const depth = 0.1 + (l / (LEVELS - 1)) * 0.7;
      const x1 = dir > 0 ? 0 : 1, x2 = 1 - x1;
      defs += `<linearGradient id="${id}a${l}" x1="${x1}" x2="${x2}">${pleatStops(depth, '#fbfcfd')}</linearGradient><linearGradient id="${id}b${l}" x1="${x1}" x2="${x2}">${pleatStops(Math.min(1, depth + 0.06), '#eff1f4')}</linearGradient><linearGradient id="${id}c${l}" x1="${x1}" x2="${x2}">${pleatStops(Math.max(0, depth - 0.05), '#f6f7f9')}</linearGradient>`;
    }
    for (let k = 0; k < n; k++) {
      const L = P.ch[k], R = P.ch[k + 1];
      let s = 0; for (let j = 0; j <= ROWS; j++) s += Math.abs(R[j].x - L[j].x);
      const comp = 1 - Math.min(1, s / (ROWS + 1) / (rest / 1.12));          // 0 flat … 1 bunched
      const lvl = Math.max(0, Math.min(LEVELS - 1, Math.round((comp * 0.85 + 0.1 + DV[k % DV.length]) * (LEVELS - 1))));
      const lb = L[ROWS], rb = R[ROWS], sag = 1 + 4 * comp + (k % 3) * 0.7;
      const d = smooth(L) + ` Q ${((lb.x + rb.x) / 2).toFixed(1)} ${(Math.max(lb.y, rb.y) + sag * 1.8).toFixed(1)} ${rb.x.toFixed(1)} ${rb.y.toFixed(1)} ` + smooth([...R].reverse(), false) + ' Z';
      const v = 'abcbacab'[k % 8];
      strips += `<path d="${d}" fill="url(#${id}${v}${lvl})" stroke="url(#${id}${v}${lvl})" stroke-width=".4"/>`;
    }
    const first = P.ch[0], last = P.ch[n];
    const outline = smooth(first) + ' ' + P.ch.map((c) => `L ${c[ROWS].x.toFixed(1)} ${(c[ROWS].y + 3).toFixed(1)}`).join(' ') + ' ' + smooth([...last].reverse(), false) + ' Z';
    return `<defs>${defs}<clipPath id="${id}k"><path d="${outline}"/></clipPath></defs>
      <path d="${outline}" fill="#000" opacity=".07" transform="translate(${dir * 4} 7)"/><path d="${outline}" fill="#000" opacity=".09" transform="translate(${dir * 2} 4)"/>
      <g opacity=".8" filter="url(#${u}cloth)">${strips}</g>
      <g clip-path="url(#${id}k)">
        <rect x="${WIN.x0 + 14}" y="${WIN.y0 + 12}" width="${WIN.x1 - WIN.x0 - 28}" height="${WIN.y1 - WIN.y0 - 24}" rx="20" fill="url(#${u}back)"/>
        <rect width="${VB.w}" height="${VB.h}" fill="url(#${u}weave)"/>
        <rect width="${VB.w}" height="${VB.h}" fill="url(#cw-noise)" opacity=".5"/>
        <rect width="${VB.w}" height="${VB.h}" fill="url(#${u}sheen)"/><rect y="${FAB.y1 - 18}" width="${VB.w}" height="30" fill="url(#${u}hem)"/>
      </g>`;
  }

  /* Window behind the curtain: a real frame with depth (outer frame, two sashes, centre post with a
     handle, a sill), clear glass lit softly from outside with a couple of reflections. Kept quiet so the
     fabric stays the hero, but it reads as a window at a glance. */
  const WIN = { x0: 74, x1: 326, y0: 44, y1: 262 };
  function windowSVG(u, open) {
    const { x0, x1, y0, y1 } = WIN, F = 7, M = 6, mx = (x0 + x1) / 2;
    const pane = (a, b) => `<rect x="${a}" y="${y0 + F}" width="${b - a}" height="${y1 - y0 - 2 * F}" rx="1.5" fill="url(#${u}glass)"/>
      <rect x="${a}" y="${y0 + F}" width="${b - a}" height="${y1 - y0 - 2 * F}" rx="1.5" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1.2"/>
      <rect x="${a + 0.8}" y="${y0 + F + 0.8}" width="${b - a - 1.6}" height="1" fill="#fff" opacity=".08"/>`;
    const l0 = x0 + F, l1 = mx - M / 2, r0 = mx + M / 2, r1 = x1 - F;
    return `<defs>
        <linearGradient id="${u}glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fbde6" stop-opacity="${(0.2 + open * 0.08).toFixed(3)}"/><stop offset=".6" stop-color="#6f8db8" stop-opacity=".12"/><stop offset="1" stop-color="#4c6488" stop-opacity=".1"/></linearGradient>
        <linearGradient id="${u}frame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b424c"/><stop offset="1" stop-color="#2a3038"/></linearGradient>
        <linearGradient id="${u}refl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <clipPath id="${u}wc"><rect x="${l0}" y="${y0 + F}" width="${r1 - l0}" height="${y1 - y0 - 2 * F}"/></clipPath>
      </defs>
      <g opacity=".42">
      <rect x="${x0 - 3}" y="${y0 - 3}" width="${x1 - x0 + 6}" height="${y1 - y0 + 6}" rx="4" fill="#000" opacity=".25" filter="url(#${u}soft)"/>
      <rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" rx="3" fill="url(#${u}frame)"/>
      <rect x="${x0 + 0.5}" y="${y0 + 0.5}" width="${x1 - x0 - 1}" height="${y1 - y0 - 1}" rx="3" fill="none" stroke="#fff" stroke-opacity=".1"/>
      ${pane(l0, l1)}${pane(r0, r1)}
      <g clip-path="url(#${u}wc)"><path d="M ${l0 + 18} ${y1} L ${l0 + 86} ${y0} L ${l0 + 112} ${y0} L ${l0 + 44} ${y1} Z" fill="url(#${u}refl)"/><path d="M ${r0 + 40} ${y1} L ${r0 + 92} ${y0} L ${r0 + 102} ${y0} L ${r0 + 50} ${y1} Z" fill="url(#${u}refl)"/></g>
      <rect x="${mx - 1.5}" y="${(y0 + y1) / 2 - 9}" width="3" height="18" rx="1.5" fill="#8b939e"/>
      <rect x="${x0 - 10}" y="${y1}" width="${x1 - x0 + 20}" height="5" rx="1.5" fill="#3d444e"/>
      <rect x="${x0 - 10}" y="${y1}" width="${x1 - x0 + 20}" height="1" fill="#fff" opacity=".12"/>
      <rect x="${x0 - 10}" y="${y1 + 5}" width="${x1 - x0 + 20}" height="4" fill="#000" opacity=".3" filter="url(#${u}soft)"/>
      </g>`;
  }
  /* Fabric grain: a small random texture made once and put in a hidden <svg> on the page;
     every scene refers to it (url(#cw-noise)), so the per-frame SVG stays small. */
  function ensureNoise() {
    if (document.getElementById('cw-noise')) return;
    let url = '';
    try {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), im = x.createImageData(64, 64);
      for (let i = 0; i < im.data.length; i += 4) { const v = 120 + Math.random() * 135; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 22 + Math.random() * 26; }
      x.putImageData(im, 0, 0); url = c.toDataURL();
    } catch (e) { return; }
    const holder = document.createElement('div');
    holder.innerHTML = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><pattern id="cw-noise" patternUnits="userSpaceOnUse" width="64" height="64"><image href="${url}" width="64" height="64"/></pattern></defs></svg>`;
    document.body.appendChild(holder.firstChild);
  }
  /* Slim round rod: graphite metal with a soft cylindrical highlight, end caps, two wall brackets */
  function rodSVG(u) {
    const xa = ROD.x0 - 12, xb = ROD.x1 + 12, y = ROD.y;
    const bracket = (x) => `<rect x="${x - 1}" y="${y - 10}" width="2" height="9" rx="1" fill="#3a3f46"/><rect x="${x - 3.5}" y="${y - 11.5}" width="7" height="2.4" rx="1.2" fill="#2a2e34"/>`;
    return `<rect x="${xa}" y="${y + 3}" width="${xb - xa}" height="4" rx="2" fill="#000" opacity=".35" filter="url(#${u}soft)"/>
      ${bracket(ROD.x0 + 10)}${bracket(ROD.x1 - 10)}
      <rect x="${xa}" y="${y - 2.6}" width="${xb - xa}" height="5.2" rx="2.6" fill="url(#${u}rodv)"/>
      <rect x="${xa + 3}" y="${y - 1.7}" width="${xb - xa - 6}" height=".7" rx=".35" fill="#fff" opacity=".35"/>
      <rect x="${xa - 5}" y="${y - 3.6}" width="6" height="7.2" rx="2.2" fill="url(#${u}rodv)"/><rect x="${xb - 1}" y="${y - 3.6}" width="6" height="7.2" rx="2.2" fill="url(#${u}rodv)"/>`;
  }
  /** Whole scene. o: { cloth (live simulation), sway (roller bar), mini, uid } */
  function scene(st, p, o = {}) {
    ensureNoise();
    const u = o.uid || 'cs', open = p / 100, sw = o.sway || { l: 0, r: 0 };
    let body = '';
    if (st === 'roller') {
      const h = rollH(p), yb = ROLL.y0 + h, s = sw.l;
      body = `<defs>
          <linearGradient id="${u}rf" x1="0" x2="1"><stop offset="0" stop-color="#d9dde3"/><stop offset=".12" stop-color="#f3f5f7"/><stop offset=".5" stop-color="#fbfcfd"/><stop offset=".88" stop-color="#f3f5f7"/><stop offset="1" stop-color="#d9dde3"/></linearGradient>
          <pattern id="${u}rw" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M0 3.5H4" stroke="#5c636d" stroke-opacity=".08" stroke-width=".7"/></pattern>
          <clipPath id="${u}rc"><rect x="${ROLL.x0}" y="${ROLL.y0}" width="${ROLL.x1 - ROLL.x0}" height="${h.toFixed(1)}"/></clipPath>
        </defs>
        <rect x="${ROLL.x0 + 4}" y="${ROLL.y0 + 8}" width="${ROLL.x1 - ROLL.x0 - 8}" height="${h.toFixed(1)}" fill="#000" opacity=".45" filter="url(#${u}soft)"/>
        <rect x="${ROLL.x0}" y="${ROLL.y0}" width="${ROLL.x1 - ROLL.x0}" height="${h.toFixed(1)}" fill="url(#${u}rf)" opacity=".86"/>
        <g clip-path="url(#${u}rc)"><rect width="${VB.w}" height="${VB.h}" fill="url(#${u}rw)"/><rect width="${VB.w}" height="${VB.h}" fill="url(#${u}sheen)"/></g>
        <g transform="rotate(${(s * 0.1).toFixed(2)} 200 ${yb.toFixed(1)})">
          <rect x="${ROLL.x0 - 3}" y="${(yb - 3).toFixed(1)}" width="${ROLL.x1 - ROLL.x0 + 6}" height="5" rx="2.5" fill="url(#${u}rodv)"/></g>
        <rect x="${ROLL.x0 - 8}" y="${ROLL.y0 - 4}" width="${ROLL.x1 - ROLL.x0 + 16}" height="5" fill="#000" opacity=".4" filter="url(#${u}soft)"/>
        <rect x="${ROLL.x0 - 8}" y="${ROLL.y0 - 15}" width="${ROLL.x1 - ROLL.x0 + 16}" height="15" rx="7.5" fill="url(#${u}rodv)"/>
        <rect x="${ROLL.x0 - 2}" y="${ROLL.y0 - 12}" width="${ROLL.x1 - ROLL.x0 + 4}" height="1" rx=".5" fill="#fff" opacity=".3"/>
        <rect x="${ROLL.x0 - 11}" y="${ROLL.y0 - 16}" width="8" height="17" rx="3" fill="#2a2e34"/><rect x="${ROLL.x1 + 3}" y="${ROLL.y0 - 16}" width="8" height="17" rx="3" fill="#2a2e34"/>`;
    } else {
      const C = o.cloth && o.cloth.st === st ? o.cloth : clothFor(st, p);   // thumbnails: cloth at rest
      C.panels.forEach((P, i) => { body += renderPanel(u, i, P); });
      body += rodSVG(u);   // the fabric heading is tucked behind the rod (rod pocket) — no rings
    }
    return (o.frontOnly ? '' : sceneBack(st, p, o)) + `<svg class="cs cs-front" viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <filter id="${u}soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${o.mini ? 3 : 7}"/></filter>
        <filter id="${u}cloth" x="-2%" y="-2%" width="104%" height="104%"><feGaussianBlur stdDeviation="${o.mini ? 0.35 : 0.7}"/></filter>
        <radialGradient id="${u}light" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#bcd6ff" stop-opacity=".22"/><stop offset=".6" stop-color="#bcd6ff" stop-opacity=".06"/><stop offset="1" stop-color="#bcd6ff" stop-opacity="0"/></radialGradient>
        <linearGradient id="${u}rodv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9aa1aa"/><stop offset=".35" stop-color="#5d636c"/><stop offset=".7" stop-color="#2f3339"/><stop offset="1" stop-color="#1c1f23"/></linearGradient>
        <linearGradient id="${u}rail" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b616b"/><stop offset=".5" stop-color="#3a3f47"/><stop offset="1" stop-color="#25292f"/></linearGradient>
        <linearGradient id="${u}sheen" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".18"/><stop offset=".06" stop-color="#000" stop-opacity="0"/><stop offset=".45" stop-color="#fff" stop-opacity=".06"/><stop offset=".9" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></linearGradient>
        <linearGradient id="${u}hem" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".55" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#fff" stop-opacity=".1"/></linearGradient>
        <pattern id="${u}weave" patternUnits="userSpaceOnUse" width="2.2" height="2.2"><path d="M0 .4H2.2M.4 0V2.2" stroke="#7a828d" stroke-opacity=".09" stroke-width=".35"/></pattern>
        <radialGradient id="${u}back" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".7" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
        <pattern id="${u}grain" patternUnits="userSpaceOnUse" width="2" height="2"><rect width="1" height="2" fill="#000" opacity=".025"/></pattern>
      </defs>
      ${body}
    </svg>`;
  }
  /** Static back layer: light + window. Redrawn only when the opening changes noticeably (see frame). */
  function sceneBack(st, p, o = {}) {
    const u = (o.uid || 'cs') + 'b', open = p / 100;
    return `<svg class="cs cs-back" viewBox="0 0 ${VB.w} ${VB.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <filter id="${u}soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${o.mini ? 3 : 7}"/></filter>
        <radialGradient id="${u}light" cx=".5" cy=".56" r=".46"><stop offset="0" stop-color="#bcd6ff" stop-opacity=".2"/><stop offset=".55" stop-color="#bcd6ff" stop-opacity=".06"/><stop offset="1" stop-color="#bcd6ff" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="0" y="0" width="${VB.w}" height="${VB.h}" fill="url(#${u}light)" opacity="${(0.55 + open * 0.45).toFixed(3)}"/>
      ${windowSVG(u, open)}
    </svg>`;
  }


  /* Open / Stop / Close glyphs — Figma icons (Relay — Device Interface, curtain frames):
     curtain-open / curtain-close (opens from the middle), chevron-m-left (side curtains; right = mirrored),
     chevron-m-up / -down (roller), curtain-stop. */
  const GLYPH = { stop: 'curtain-stop', up: 'chevron-m-up', down: 'chevron-m-down', out: 'curtain-open', in: 'curtain-close', left: 'chevron-m-left', right: 'chevron-m-left' };
  const glyph = (n, cls = 'cg') => icon(GLYPH[n], cls, n === 'right' ? 'style="transform:scaleX(-1)"' : '');
  const openGlyph = (d) => ({ left: 'left', right: 'right', center: 'out', roller: 'up' }[style(d)]);
  const closeGlyph = (d) => ({ left: 'right', right: 'left', center: 'in', roller: 'down' }[style(d)]);
  const styleThumb = (st) => `<div class="cs-mini">${scene(st, 55, { mini: true, uid: 'thumb-' + st })}</div>`;

  /* ==========================================================================
     Device page (device.html)
     ========================================================================== */
  function page(d) {
    const i = d.sel || 0, m = d.curtains[i], posOK = has(d, 'position') && m.calibrated && d.online;
    // the fabric can always be pulled: with a known position it goes to that point, otherwise a pull opens / closes fully
    const canPull = d.online && (posOK || has(d, 'openClose'));
    let h = '';
    if (multi(d)) h += `<div class="pad cw-pick" data-key="pick">${UI.segTabs(d.curtains.map((c) => c.name), i, 'ct-sel')}</div>`;

    // Alerts first: they explain why something doesn't work
    if (!d.online) h += `<div class="pad cw-gap" data-key="ban-off"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · The motor has no power.</div></div></div>`;
    if (m.fault) h += `<div class="pad cw-gap" data-key="ban-fault"><div class="banner danger">${icon('banner-error')}<div><b>${Noun(d)} blocked.</b> Check for obstacles and try again</div></div></div>`;
    if (has(d, 'battery') && d.battery < 20) h += `<div class="pad cw-gap" data-key="ban-batt"><div class="banner warn">${icon('battery')}<div><b>Battery low · ${d.battery} %</b></div></div></div>`;
    if (!m.calibrated && has(d, 'calibration') && d.online) {
      h += `<div class="pad cw-gap" data-key="ban-setup"><button class="cw-setup" data-action="ct-setup"><span class="cw-setup-ic">${icon('ai-stars')}</span>
        <span class="grow"><b>Finish setup</b><span>Calibrate so the app knows where open and closed are</span></span>${icon('chevron-right', 'chev')}</button></div>`;
    }

    // 1. The curtain — drag it to set where it should stop
    h += `<div class="pad" data-key="card"><div class="cw-card ${canPull ? 'can-drag' : ''}" data-cw="${i}" ${posOK ? `role="slider" tabindex="0" aria-label="Curtain position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${shown(d, m.q)}"` : ''}>
        <div class="cw-stage" data-keep></div><div class="cw-bubble" data-num aria-hidden="true"></div></div></div>`;
    h += `<div class="cw-readout" data-key="readout"><div><div class="cw-pct" data-cl="pct">${pctHTML(d, m)}</div><div class="cw-state ${m.calibrated ? '' : 'big'}" data-cl="state">${esc(readoutText(d, m))}</div></div>
      ${canPull ? `<span class="cw-hint">${posOK ? 'Grab the fabric and pull' : `Pull to ${roller(d) ? 'raise or lower' : 'open or close'} fully`}</span>` : ''}</div>`;

    // 2. Main control
    if (has(d, 'openClose')) {
      const dis = !d.online ? 'disabled' : '';
      h += `<div class="pad" data-key="ctl"><div class="cw-ctl" role="group" aria-label="Curtain">
        <button data-action="ct-cmd" data-c="open" ${dis} aria-pressed="${!!(m.move && m.move.dir > 0)}">${glyph(openGlyph(d))}<span>Open</span></button>
        <button data-action="ct-cmd" data-c="stop" ${dis}>${glyph('stop')}<span>Stop</span></button>
        <button data-action="ct-cmd" data-c="close" ${dis} aria-pressed="${!!(m.move && m.move.dir < 0)}">${glyph(closeGlyph(d))}<span>Close</span></button></div></div>`;
    }

    // 3. Quick positions
    if (has(d, 'position')) {
      const v = m.calibrated && !m.move ? shown(d, m.q) : -1;
      const chip = (val, txt, extra = '') => `<button class="cw-chip" data-action="ct-go" data-v="${val}" aria-pressed="${v === val}" ${posOK ? '' : 'disabled'} ${extra}>${txt}</button>`;
      // 25 / 50 / 75 only: fully open / closed are the Open and Close buttons above; same 3 columns as those buttons
      const right = !m.calibrated && d.online ? '<span class="cw-note">Calibrate first</span>' : '';
      h += `<div class="v2-head muted" data-key="pos-head"><span>Position</span>${right}</div>
        <div class="cw-chips" data-key="pos">${[[25, '25%'], [50, '50%'], [75, '75%']].map(([x, t]) => chip(x, t)).join('')}</div>`;
    }

    // 4. Fine control (tappable rows)
    const rows = [];
    if (has(d, 'step')) {
      rows.push(`<div class="cell"><span class="cell-main cell-title">Small steps</span>
        <div class="stepper cw-step"><button data-action="ct-step" data-d="-1" ${posOK ? '' : 'disabled'} aria-label="${roller(d) ? 'Down' : 'Close'} a little">${glyph(roller(d) ? 'down' : closeGlyph(d), 'cg sm')}</button>
        <button data-action="ct-step" data-d="1" ${posOK ? '' : 'disabled'} aria-label="${roller(d) ? 'Up' : 'Open'} a little">${glyph(roller(d) ? 'up' : openGlyph(d), 'cg sm')}</button></div></div>`);
    }
    if (has(d, 'tilt')) {
      rows.push(`<div class="cell slider-row"><div class="row"><span class="cell-title grow">Slat angle</span><span class="slider-val" data-num id="tiltVal">${S(d, 'tilt')} %</span></div>
        <input type="range" class="range" min="0" max="100" step="5" value="${S(d, 'tilt')}" style="--v:${S(d, 'tilt') / 100}" id="tiltR" aria-label="Slat angle" ${d.online ? '' : 'disabled'}></div>`);
    }
    if (rows.length) h += `<div class="list" data-key="rows" style="margin-top:20px">${rows.join('')}</div>`;

    // 5. Information (flat)
    if (has(d, 'battery')) {
      // Figma "Battery": one full-width card, battery icon on the right
      h += `<div class="pad info-grid" data-key="bat" style="margin-top:32px"><div class="info-card wide"><span>${d.charging ? 'Battery · charging' : 'Battery'}</span><b data-num="count">${d.battery} %</b>${icon('battery')}</div></div>`;
    }
    return h + '<div style="height:28px"></div>';
  }
  function pctHTML(d, m) {
    if (!m.calibrated) return '';
    return `<span data-num>${shown(d, cur(d, m))}</span><small>%</small>`;
  }

  /* ---------- Live frame loop (page + open sheets) ----------
     What the picture shows:
     - while you drag: the fabric is under your finger (1 : 1);
     - after you let go: it stays where you put it while the motor catches up (the % below counts the
       real motor), then follows the motor again;
     - otherwise: exactly the motor.
     The hem lags behind the moving edge and swings back when it stops (damped spring). */
  let loopOn = false, lastKey = '';
  const hooks = new Set();   // sheets that re-render when the motor state changes
  const stateKey = (d) => JSON.stringify(d.curtains.map((m) => [!!m.move, m.move && m.move.dir, m.calibrated, m.fault, m.hit0, m.hit100, m.limOpen, m.limClose, m.timing !== null]));
  const V = { shown: null, hold: null, sel: -1, st: '', t: 0, edge: null, sw: { l: { s: 0, v: 0 }, r: { s: 0, v: 0 } }, html: '', cloth: null,
    lite: SafeStorage.session.getItem('samo-lite') === '1' || /[?&]lite=1/.test(location.search) || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 2) };
  let drag = null;
  function frame(d, ctx) {
    const now = Date.now(), t = performance.now();
    if (settle(d, now)) Store.save();
    const key = stateKey(d);
    if (key !== lastKey) { lastKey = key; ctx.render(); hooks.forEach((fn) => fn()); }
    const i = d.sel || 0, m = d.curtains[i], st = style(d);
    const real = phys(d, cur(d, m, now));
    if (V.sel !== i || V.st !== st) { V.sel = i; V.st = st; V.shown = real; V.hold = null; V.edge = null; V.cloth = st === 'roller' ? null : clothFor(st, real); }
    if (V.hold !== null && !m.move) V.hold = null;                       // motor arrived (or stopped elsewhere)
    const want = drag ? drag.p : V.hold !== null ? V.hold : real;
    const dt = Math.min(0.05, (t - (V.t || t)) / 1000); V.t = t;
    V.shown = drag ? want : V.shown + (want - V.shown) * Math.min(1, dt * 16);   // no jumps when the source changes
    // leading-edge speed (viewBox px/s) → spring that makes the hem trail and swing
    const ep = edgePoint(st, V.shown), ex = st === 'roller' ? ep.y : ep.x;
    const vel = V.edge === null || !dt ? 0 : (ex - V.edge) / dt; V.edge = ex;
    ['l', 'r'].forEach((side) => {
      const sp = V.sw[side], sign = st === 'center' && side === 'r' ? -1 : 1;
      const target = Math.max(-16, Math.min(16, -vel * 0.06 * sign));
      sp.v += (140 * (target - sp.s) - 9 * sp.v) * dt; sp.s += sp.v * dt;
    });
    const card = document.querySelector(`.cw-card[data-cw="${i}"]`);
    const stage = card && card.querySelector('.cw-stage');
    // Rest: nothing moves for 3 s → stop simulating and drawing (saves CPU / battery on phones).
    // Anything that moves (motor, finger, hold, hem swing) wakes it up on the next frame.
    const moving = !!drag || !!m.move || V.hold !== null || Math.abs(want - V.shown) > 0.05 || ['l', 'r'].some((k) => Math.abs(V.sw[k].v) > 0.5 || Math.abs(V.sw[k].s) > 0.05);
    if (moving || !V.lastActive) V.lastActive = t;
    const asleep = t - V.lastActive > 3000 && stage && stage.children.length === 2 && V.html;
    // Weak phones: if frames come late while it moves (median > 24 ms ≈ under 42 fps), switch to "lite" —
    // the cloth blur and soft shadows are dropped (the GPU redraws them every frame), shape and physics stay.
    if (moving && dt) { (V.dts || (V.dts = [])).push(dt); if (V.dts.length > 45) V.dts.shift(); if (!V.lite && V.dts.length === 45 && [...V.dts].sort((a, b) => a - b)[22] > 0.024) { V.lite = true; SafeStorage.session.setItem('samo-lite', '1'); } }
    if (V.cloth && dt && !asleep) stepCloth(V.cloth, st, V.shown, dt, drag && drag.grab);
    if (stage && !asleep) {
      // two layers: the window/light behind only changes with the opening (cheap), the fabric every frame
      if (stage.children.length !== 2) { stage.innerHTML = '<div class="cs-layer"></div><div class="cs-layer"></div>'; V.bk = null; V.html = ''; }
      const [back, front] = stage.children, bk = st + Math.round(V.shown / 10);
      if (V.bk !== bk) { back.innerHTML = sceneBack(st, V.shown, { uid: 'cs' }); V.bk = bk; }
      let html = scene(st, V.shown, { cloth: V.cloth, sway: { l: V.sw.l.s, r: 0 }, uid: 'cs', frontOnly: true });
      if (V.lite) html = html.replace(/ filter="url\(#cscloth\)"/g, '').replace(/<rect[^>]*(filter="url\(#cssoft\)"|fill="url\(#(csweave|cw-noise)\)")[^>]*\/>/g, '');
      if (html !== V.html) { front.innerHTML = html; V.html = html; }
    }
    // big % and the wizard line: only the number is written, and only when it changes (it rolls like the relay numbers)
    document.querySelectorAll('[data-cl="pct"]').forEach((e) => {
      const num = e.querySelector('[data-num]');
      if (!m.calibrated) { if (e.firstChild) e.innerHTML = ''; return; }
      if (!num) { e.innerHTML = pctHTML(d, m); return; }
      UI.setNum(num, shown(d, cur(d, m, now)));
    });
    document.querySelectorAll('[data-cl="wz"]').forEach((e) => UI.setNum(e, wizLine(d, m)));
  }
  function live(d, root) { /* the frame loop already keeps the page live */ }

  /* ---------- Grab the fabric ----------
     Drag it left/right (roller: up/down). It follows the finger; past the ends it resists like
     rubber; a quick flick sends it all the way. Letting go sends the motor there. */
  function bindDrag(d, ctx) {
    const scr = UI.screen;
    const toVB = (card) => VB.w / card.querySelector('.cw-stage').getBoundingClientRect().width;
    const rubber = (p) => (p > 100 ? 100 + (p - 100) * 0.22 : p < 0 ? p * 0.22 : p);
    const showBubble = (card, p) => {
      const b = card.querySelector('.cw-bubble'), v = shown(d, flip(d) ? 100 - Math.max(0, Math.min(100, p)) : Math.max(0, Math.min(100, p)));
      const known = d.curtains[d.sel || 0].calibrated && has(d, 'position');
      UI.setNum(b, !known ? (p >= (drag ? drag.p0 : p) ? (roller(d) ? 'Raise fully' : 'Open fully') : (roller(d) ? 'Lower fully' : 'Close fully')) : v <= 0 ? 'Closed' : v >= 100 ? 'Open' : v + ' %');
      const r = card.getBoundingClientRect(), s = card.querySelector('.cw-stage').getBoundingClientRect(), e = edgePoint(style(d), Math.max(0, Math.min(100, p)));
      const k = s.width / VB.w;
      b.style.left = (s.left - r.left + Math.max(40, Math.min(VB.w - 40, e.x)) * k) + 'px';
      b.style.top = (s.top - r.top + Math.max(30, Math.min(VB.h - 30, style(d) === 'roller' ? e.y - 22 : e.y - 40)) * k) + 'px';
    };
    scr.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.cw-card.can-drag'); if (!card) return;
      e.preventDefault(); card.setPointerCapture(e.pointerId);
      const st = style(d), k = toVB(card), s = card.querySelector('.cw-stage').getBoundingClientRect();
      const span = st === 'roller' ? ROLL.max - ROLL.min : st === 'center' ? SPAN / 2 - MINW / 2 : SPAN - MINW;
      const p0 = V.shown ?? 0, x0 = e.clientX, y0 = e.clientY;
      const hist = [];
      drag = { p: p0, p0, moved: false, grab: null };
      const vx = (e.clientX - s.left) * k, vy = (e.clientY - s.top) * k;
      const row = Math.max(2, Math.min(ROWS, Math.round((vy - FAB.y0) / LEN)));
      // Which half? (opens from the middle) — decided by where the two leading edges really are, not by the
      // centre of the screen. At the seam of a closed curtain both edges overlap: the first move decides
      // (pull right = right half, pull left = left half), like with a real curtain.
      let side = 0;
      if (st === 'center' && V.cloth) {
        const [L, R] = V.cloth.panels, lx = L.ch[L.n][row].x, rx = R.ch[R.n][row].x;
        if (vx < Math.min(lx, rx) - 6) side = -1;
        else if (vx > Math.max(lx, rx) + 6) side = 1;
        else if (rx - lx > 40) side = vx - lx < rx - vx ? -1 : 1;   // in the open gap: the nearer edge
      } else if (st === 'center') side = vx < VB.w / 2 ? -1 : 1;
      // dragging towards the wall side opens; towards the window closes
      const signOf = () => (st === 'roller' ? -1 : st === 'right' ? 1 : st === 'center' ? side : -1);
      // grab the piece of cloth under the finger (in the chosen half): it stays under the finger, the rest gives way
      const pickGrab = () => {
        if (!V.cloth || st === 'roller') return null;
        const only = st === 'center' ? (side < 0 ? 0 : 1) : null;
        let best = null;
        V.cloth.panels.forEach((P, pi) => { if (only !== null && pi !== only) return; P.ch.forEach((c, kk) => { const dx = Math.abs(c[row].x - vx); if (!best || dx < best.dx) best = { pi, k: kk, j: row, dx }; }); });
        if (!best || best.dx > 40) return null;
        const q = V.cloth.panels[best.pi].ch[best.k][best.j];
        return { pi: best.pi, k: best.k, j: best.j, ox: q.x - vx, oy: q.y - vy, x: q.x, y: q.y };
      };
      if (side !== 0 || st !== 'center') drag.grab = pickGrab();
      card.classList.add('dragging');
      const move = (ev) => {
        const delta = (st === 'roller' ? ev.clientY - y0 : ev.clientX - x0) * k;
        if (side === 0 && st === 'center') {                      // grabbed at the seam: wait for a direction
          if (Math.abs(delta) < 3) return;
          side = delta > 0 ? 1 : -1; drag.grab = pickGrab();
        }
        if (Math.abs(delta) > 3) drag.moved = true;
        drag.p = rubber(p0 + (signOf() * delta * 100) / span);
        if (drag.grab) {
          const gx = (ev.clientX - s.left) * k + drag.grab.ox, gy = (ev.clientY - s.top) * k + drag.grab.oy;
          drag.grab.x = Math.max(ROD.x0, Math.min(ROD.x1, gx)); drag.grab.y = Math.max(FAB.y0 + LEN, Math.min(FAB.y1 + 12, gy));
        }
        hist.push([performance.now(), drag.p]); while (hist.length > 8) hist.shift();
        showBubble(card, drag.p);
      };
      showBubble(card, p0);
      card.onpointermove = move;
      card.onpointerup = card.onpointercancel = (ev) => {
        // letting go sets the fabric fluttering softly
        if (drag && drag.grab && V.cloth) V.cloth.panels.forEach((P) => { P.e = Math.max(P.e, 0.55); });   // both halves flutter together
        if (drag && drag.moved && ev.type === 'pointerup') {
          let target = Math.max(0, Math.min(100, drag.p));
          // flick = still moving fast at the moment of release (last ~80 ms), not just a quick drag
          const now = performance.now(), recent = hist.filter((h) => now - h[0] < 80);
          const a = recent[0], b = recent[recent.length - 1];
          const v = a && b && b[0] - a[0] > 16 && now - b[0] < 40 ? ((b[1] - a[1]) / (b[0] - a[0])) * 1000 : 0;   // % per second
          if (Math.abs(v) > 650) target = v > 0 ? 100 : 0;
          target = Math.round(target);
          const i = d.sel || 0, m = d.curtains[i];
          if (m.calibrated && has(d, 'position')) { if (goTo(d, i, flip(d) ? 100 - target : target)) { V.hold = target; Store.save(); } }
          else if (Math.abs(drag.p - p0) > 2) {
            const opening = drag.p > p0;                                   // physical direction of the pull
            cmd(d, i, opening !== flip(d) ? 'open' : 'close');            // the app only knows motor directions
            Store.save();
          }
        }
        drag = null; ctx.render();
      };
    });
    scr.addEventListener('keydown', (e) => {
      const card = e.target.closest && e.target.closest('.cw-card.can-drag'); if (!card) return;
      const k = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10, Home: -100, End: 100 }[e.key]; if (k === undefined) return;
      e.preventDefault(); const m = d.curtains[d.sel || 0];
      goTo(d, d.sel || 0, fromShown(d, clamp(shown(d, cur(d, m)) + k))); Store.save(); ctx.render();
    });
  }

  function bindPage(d, ctx) {
    const sel = +UI.param('ch'); if (sel >= 0 && sel < d.curtains.length) d.sel = sel;
    const commit = () => { Store.save(); ctx.render(); };
    UI.on({
      'ct-sel': ({ ch }) => { d.sel = +ch; commit(); },
      'ct-cmd': ({ c }) => { cmd(d, d.sel || 0, c); commit(); UI.pulse(UI.screen.querySelector(`[data-action="ct-cmd"][data-c="${c}"]`), 'just-toggled'); },
      'ct-go': ({ v }) => { if (goTo(d, d.sel || 0, fromShown(d, +v))) commit(); },
      'ct-step': ({ d: dir }) => { const m = d.curtains[d.sel || 0]; goTo(d, d.sel || 0, fromShown(d, clamp(shown(d, cur(d, m)) + 5 * dir))); commit(); },
      'ct-setup': () => openWizard(d, ctx, d.sel || 0, 'style'),
    });
    UI.screen.addEventListener('input', (e) => { if (e.target.id === 'tiltR') { d.settings.tilt = +e.target.value; UI.setNum(UI.screen.querySelector('#tiltVal'), e.target.value + ' %'); } });
    UI.screen.addEventListener('change', (e) => { if (e.target.id === 'tiltR') commit(); });
    bindDrag(d, ctx);
    startLoop(d, ctx);
  }
  function startLoop(d, ctx) {
    if (loopOn) return; loopOn = true; lastKey = stateKey(d);
    const run = () => { frame(d, ctx); requestAnimationFrame(run); };
    requestAnimationFrame(run);
  }

  /* ==========================================================================
     Setup wizard (sheet): opening style → direction test → calibration → 50 % test
     ========================================================================== */
  const STEPS = ['style', 'dir', 'cal', 'test', 'done'];
  function wizLine(d, m) {
    let t = m.move ? movingText(d, m) : m.fault ? 'Blocked' : 'Stopped';
    if (d.cal === 'auto' && !m.calibrated && (m.hit0 || m.hit100 || m.move)) t += ` · ends found: ${(m.hit0 ? 1 : 0) + (m.hit100 ? 1 : 0)} of 2`;
    if (m.timing !== null) t += ` · timing ${((Date.now() - m.timing) / 1000).toFixed(1)} s`;
    if (m.calibrated) t += ` · ${shown(d, cur(d, m))} %`;
    return t;
  }
  function openWizard(d, ctx, i, from) {
    const w = { step: from, sub: 0, ask: null, auto: null };
    const m = () => d.curtains[i];
    const save = () => { Store.save(); ctx.render(); };
    const dots = () => `<div class="wz-dots" aria-label="Step ${STEPS.indexOf(w.step) + 1} of 4">${STEPS.slice(0, 4).map((x, j) => `<i class="${j <= STEPS.indexOf(w.step) ? 'on' : ''}"></i>`).join('')}</div>`;
    const liveLine = () => `<div class="wz-live" data-num data-cl="wz">${esc(wizLine(d, m()))}</div>`;
    const btn = (a, l, cls = 'btn-secondary', extra = '') => `<button class="btn ${cls} grow" data-action="wz" data-a="${a}" ${extra}>${l}</button>`;
    const TITLE = { style: 'How does it open?', dir: 'Check the direction', cal: 'Calibrate', test: 'Test', done: 'Curtain ready' };
    const SUB = {
      style: 'This only changes the picture in the app.',
      dir: `Tap <b>Open</b> and watch the real ${roller(d) ? 'blind' : 'curtain'}.`,
      cal: () => esc(CAL[d.cal].text),
      test: 'Tap Go to 50 %. It should stop about halfway — if it does, tap Looks right.',
      done: 'Opening style, direction and calibration are saved.',
    };
    function body() {
      const mm = m();
      if (w.step === 'style') return `<div class="cw-styles">${F.openingStyle.opts.map(([k, t]) => `<button class="cw-style" data-action="wz-style" data-v="${k}" aria-pressed="${style(d) === k}">${styleThumb(k)}<span>${t}</span></button>`).join('')}</div>`;
      if (w.step === 'dir') {
        return liveLine() + `<div class="wz-row">${btn('open', `${glyph(openGlyph(d), 'cg sm')} Open`, 'btn-primary')}${btn('stop', `${glyph('stop', 'cg sm')} Stop`)}</div>`
          + (w.ask === 'ask' ? `<div class="wz-q"><b>Did it ${roller(d) ? 'go up' : 'open'}?</b><div class="wz-row">${btn('yes', 'Yes')}${btn('no', roller(d) ? 'No, it went down' : 'No, it closed')}</div></div>` : '')
          + (w.ask === 'fixed' ? `<div class="banner info" style="margin-top:12px">${icon('check')}<div><b>Motor direction switched</b> · Tap Open again to check.</div></div>` : '');
      }
      if (w.step === 'cal') {
        if (mm.calibrated) return liveLine() + `<div class="banner info">${icon('check')}<div><b>Calibrated</b> · ${mm.ctime ? `Full run: ${mm.ctime.toFixed(1)} s.` : 'Both ends are saved.'}</div></div>`;
        const c = d.cal;
        if (c === 'auto' || c === 'autoCmd') {
          return liveLine() + `<ol class="wz-list"><li>Make sure nothing blocks the ${roller(d) ? 'blind' : 'track'}.</li><li>${c === 'auto' ? 'It closes until it finds the end, then opens to the other end.' : 'The device runs to both ends by itself.'}</li></ol>`;
        }
        if (c === 'time') {
          return liveLine() + `<ol class="wz-list">
            <li class="${w.sub > 0 ? 'done' : ''}"><b>Open fully</b>, then Stop.${w.sub === 0 ? `<div class="wz-row">${btn('open', 'Open')}${btn('stop', 'Stop')}</div>` : ''}</li>
            <li class="${w.sub !== 1 ? 'wait' : ''}"><b>Start timing</b> — it closes. Tap Stop exactly when it is fully closed.${w.sub === 1 ? `<div class="wz-row">${mm.timing === null ? btn('tStart', 'Start timing', 'btn-primary') : btn('tStop', 'Stop — it’s closed', 'btn-primary')}</div>` : ''}</li></ol>
            <p class="wz-hint">Stopping early or late makes every position wrong.</p>`;
        }
        return liveLine() + `<div class="wz-row">${btn('up', glyph('up', 'cg sm'), 'btn-secondary', 'aria-label="Up"')}${btn('stop', glyph('stop', 'cg sm'), 'btn-secondary', 'aria-label="Stop"')}${btn('down', glyph('down', 'cg sm'), 'btn-secondary', 'aria-label="Down"')}</div>
          <div style="margin-top:16px">${UI.group('', `
            <button class="cell" data-action="wz" data-a="saveOpen"><span class="cell-main cell-title">Save as fully open</span>${mm.limOpen ? `<span class="cw-ok">${icon('check')}</span>` : ''}</button>
            <button class="cell" data-action="wz" data-a="saveClose"><span class="cell-main cell-title">Save as fully closed</span>${mm.limClose ? `<span class="cw-ok">${icon('check')}</span>` : ''}</button>`)}</div>
          <p class="wz-hint">Without saved ends a roller blind can roll too far and damage the fabric.</p>`;
      }
      if (w.step === 'test') return liveLine() + `<div class="wz-row">${btn('g50', 'Go to 50 %', 'btn-primary')}</div>`;
      return `<div class="hero" style="padding:4px 0 0"><div class="hero-icon" style="width:72px;height:72px;border-radius:50%;background:var(--green-soft);display:flex;align-items:center;justify-content:center;color:var(--green)">${icon('check', 'icon', 'style="width:36px;height:36px"')}</div></div>`;
    }
    function footer() {
      const mm = m();
      if (w.step === 'style') return btn('next-dir', 'Next', 'btn-primary btn-block');
      if (w.step === 'dir') return btn('skip-dir', 'Skip', 'btn-glass btn-block');
      if (w.step === 'cal') {
        if (mm.calibrated) return has(d, 'position') ? btn('next-test', 'Next: test', 'btn-primary btn-block') : btn('finish', 'Finish', 'btn-primary btn-block');
        if (d.cal === 'auto' || d.cal === 'autoCmd') return btn('autoStart', w.auto ? 'Calibrating…' : d.cal === 'auto' ? 'Start' : 'Calibrate', 'btn-primary btn-block', w.auto ? 'disabled' : '');
        if (d.cal === 'time' && w.sub === 0) return btn('s1', 'It’s fully open — next', 'btn-primary btn-block');
        return '';
      }
      if (w.step === 'test') return `<div class="wz-row" style="margin:0">${btn('again', 'Recalibrate')}${btn('finish', 'Looks right', 'btn-primary')}</div>`;
      return '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>';
    }
    const draw = () => UI.sheet({
      title: TITLE[w.step], sub: (typeof SUB[w.step] === 'function' ? SUB[w.step]() : SUB[w.step]),
      tabs: () => dots(), render: body, footer,
      onClose: () => { hooks.delete(onState); },
    });
    let s = draw();
    // Motor state changed (stopped, end found, calibrated…): redraw, and drive the auto-learn run
    const onState = () => {
      const mm = m();
      if (w.auto === 'closing' && !mm.move) { w.auto = 'opening'; cmd(d, i, 'open'); Store.save(); }
      else if (w.auto === 'opening' && !mm.move) {
        w.auto = null;
        if (!mm.calibrated) { mm.calibrated = true; mm.ctime = 100 / rate(d); }   // one-tap auto reports “fully calibrated”
        save();
      }
      if (w.step === 'dir' && w.ask === 'moving' && !mm.move) w.ask = 'ask';
      s.refresh();
    };
    hooks.add(onState);
    const go = (step) => { w.step = step; w.sub = 0; w.ask = null; s = draw(); };
    UI.on({
      'wz-style': ({ v }) => { d.settings.openingStyle = v; save(); s.refresh(); },
      wz: ({ a }) => {
        const mm = m();
        if (a === 'next-dir') return go('dir');
        if (a === 'skip-dir' || a === 'yes') return go('cal');
        if (a === 'no') { d.settings.reverse = !d.settings.reverse; resetLimits(mm); w.ask = 'fixed'; save(); return s.refresh(); }
        if (a === 'open' && w.step === 'dir') { begin(d, mm, 1, clamp(Math.round(mm.q) + 35)); w.ask = 'moving'; save(); return s.refresh(); }
        if (a === 'open' || a === 'up') cmd(d, i, 'open');
        else if (a === 'down') cmd(d, i, 'close');
        else if (a === 'stop') cmd(d, i, 'stop');
        else if (a === 'autoStart') { resetLimits(mm); w.auto = 'closing'; begin(d, mm, -1, null); }
        else if (a === 's1') { stop(d, mm); w.sub = 1; }
        else if (a === 'tStart') { mm.timing = Date.now(); begin(d, mm, -1, null); }
        else if (a === 'tStop') stop(d, mm);
        else if (a === 'saveOpen') { stop(d, mm); mm.limOpen = true; mm.q = 100; }
        else if (a === 'saveClose') { stop(d, mm); mm.limClose = true; mm.q = 0; }
        else if (a === 'next-test') return go('test');
        else if (a === 'g50') goTo(d, i, 50);
        else if (a === 'again') { resetLimits(mm); save(); return go('cal'); }
        else if (a === 'finish') { save(); return go('done'); }
        if (mm.limOpen && mm.limClose && d.cal === 'limits') mm.calibrated = true;
        save(); s.refresh();
      },
    });
  }

  /* ==========================================================================
     Settings page sections (device-settings.html)
     ========================================================================== */
  function summary(d, k) {
    const f = F[k], m = d.curtains[0];
    if (f.type === 'choice' || f.type === 'style') return { value: f.opts.find((o) => o[0] === S(d, k))[1] };
    if (k === 'reverse') return { value: S(d, k) ? 'Reversed' : 'Normal' };
    if (f.type === 'toggle') return { value: S(d, k) ? 'On' : 'Off' };
    if (k === 'calibration') {
      const done = d.curtains.filter((c) => c.calibrated).length;
      return { sub: CAL[d.cal].name, value: done === d.curtains.length ? 'Done' : multi(d) ? `${done} of ${d.curtains.length}` : 'Not done' };
    }
    if (k === 'resetLimits') return { sub: 'Delete the learned ends' };
    return { value: m.calibrated ? 'Done' : '' };
  }
  function settings(d) {
    let h = '';
    if (multi(d)) {
      h += `<div class="list-header">Curtains</div><div class="list">${d.curtains.map((c, i) => `<button class="cell has-icon" data-action="cs-rename" data-ch="${i}"><span class="cell-icon">${icon('dev-curtains')}</span>
        <span class="cell-main"><span class="cell-title" style="display:block">${esc(c.name)}</span><span class="cell-sub" style="display:block">Curtain ${i + 1} · ${c.calibrated ? 'calibrated' : 'not calibrated'}</span></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`;
    }
    if (has(d, 'calibration')) {
      h += `<div class="pad" style="margin-top:20px"><button class="cw-setup" data-action="cs-setup"><span class="cw-setup-ic">${icon('ai-stars')}</span>
        <span class="grow"><b>Curtain setup</b><span>Opening style → direction → calibration → test</span></span>${icon('chevron-right', 'chev')}</button></div>`;
    }
    for (const g of SETTINGS_GROUPS) {
      const ks = Object.keys(F).filter((k) => F[k].grp === g && has(d, k));
      if (!ks.length) continue;
      h += `<div class="list-header">${g}</div><div class="list">${ks.map((k) => {
        if (F[k].type === 'toggle') {
          const sub = k === 'reverse' && has(d, 'calibration') ? 'Changing it deletes the learned ends' : F[k].short;
          return `<button class="cell" data-action="cs-toggle" data-k="${k}" role="switch" aria-checked="${!!S(d, k)}">
            <span class="cell-main"><span class="cell-title" style="display:block">${esc(F[k].name)}</span><span class="cell-sub" style="display:block">${esc(sub)}</span></span>
            <span class="switch" aria-hidden="true" aria-checked="${!!S(d, k)}"></span></button>`;
        }
        const sm = summary(d, k), danger = k === 'resetLimits';
        return `<button class="cell" data-action="cs-feature" data-k="${k}">
          <span class="cell-main"><span class="cell-title" style="display:block;${danger ? 'color:var(--red)' : ''}">${esc(F[k].name)}</span>${sm.sub ? `<span class="cell-sub" style="display:block">${esc(sm.sub)}</span>` : ''}</span>
          ${sm.value ? `<span class="cell-value">${esc(sm.value)}</span>` : ''}${danger ? '' : icon('chevron-right', 'chev')}</button>`;
      }).join('')}</div>`;
    }
    return h;
  }
  function openFeature(d, k, ctx) {
    const f = F[k];
    if (k === 'calibration') return openWizard(d, ctx, d.sel || 0, 'cal');
    if (k === 'resetLimits') {
      return UI.confirm({ title: 'Reset limits?', text: 'The learned open and closed ends will be deleted. Positions stop working until you calibrate again.', ok: 'Reset',
        onOk: () => { d.curtains.forEach(resetLimits); Store.save(); ctx.render(); UI.toast('Limits deleted — calibrate again'); } });
    }
    if (f.type === 'direction') return openDirection(d, ctx);
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    const s = UI.sheet({
      title: f.name, sub: esc(f.short),
      render: () => {
        const v = S(d, k);
        if (f.type === 'style') return `<div class="cw-styles">${f.opts.map(([o, t]) => `<button class="cw-style" data-action="cf-opt" data-v="${o}" aria-pressed="${v === o}">${styleThumb(o)}<span>${t}</span></button>`).join('')}</div>`;
        if (f.type === 'choice') {
          return `<div class="list">${f.opts.map((o) => `<button class="option" role="radio" aria-checked="${v === o[0]}" data-action="cf-opt" data-v="${o[0]}">
            <span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('')}</div>`;
        }
        const warn = k === 'reverse' && has(d, 'calibration') ? '<div class="list-footer">Changing it deletes the learned ends: calibrate again afterwards.</div>' : '';
        return `<div class="list"><button class="cell" data-action="cf-toggle"><span class="cell-main cell-title">${esc(f.label || f.name)}</span><span class="switch" role="switch" aria-checked="${!!v}"></span></button></div>${warn}`;
      },
    });
    UI.on({
      'cf-opt': ({ v }) => { d.settings[k] = v; commit(); },
      'cf-toggle': () => {
        d.settings[k] = !S(d, k);
        if (k === 'reverse' && has(d, 'calibration')) { d.curtains.forEach(resetLimits); UI.toast('Direction changed — calibrate again'); }
        commit();
      },
    });
  }
  /** Motor direction: two plain choices + Open / Stop / Close to test it right here. */
  function openDirection(d, ctx) {
    const i = d.sel || 0, word = roller(d) ? ['up', 'down'] : ['opens', 'closes'];
    const opt = (rev, title, sub) => `<button class="option" role="radio" aria-checked="${!!S(d, 'reverse') === rev}" data-action="dir-set" data-v="${rev ? 1 : 0}">
        <span class="option-main"><span class="option-title" style="display:block">${title}</span><span class="option-sub" style="display:block">${sub}</span></span><span class="radio">${icon('radio-on')}</span></button>`;
    const s = UI.sheet({
      title: F.reverse.name, sub: esc(F.reverse.short),
      render: () => `${UI.group('Try it', `<div class="group-pad"><p class="dir-hint">Tap Open and watch the real ${noun(d)}. Did it ${roller(d) ? 'go up' : 'open'}?</p>
            <div class="dir-test">${[['open', openGlyph(d), 'Open'], ['stop', 'stop', 'Stop'], ['close', closeGlyph(d), 'Close']].map(([c, g, t]) => `<button class="btn btn-secondary" data-action="dir-cmd" data-c="${c}" ${d.online ? '' : 'disabled'}>${glyph(g, 'cg sm')}<span>${t}</span></button>`).join('')}</div></div>`)}
        ${UI.group('Direction', opt(false, 'Normal', `“Open” ${word[0]} the ${noun(d)}`) + opt(true, 'Reversed', `For a motor installed the other way round — use it if “Open” ${word[1]} the ${noun(d)}`))}
        ${has(d, 'calibration') ? '<div class="list-footer">Changing the direction deletes the learned ends: calibrate again afterwards.</div>' : ''}`,
    });
    UI.on({
      'dir-cmd': ({ c }) => { cmd(d, i, c); Store.save(); ctx.render(); },
      'dir-set': ({ v }) => {
        const rev = v === '1'; if (!!S(d, 'reverse') === rev) return;
        d.settings.reverse = rev; stop(d, d.curtains[i]);
        if (has(d, 'calibration')) { d.curtains.forEach(resetLimits); UI.toast('Direction changed — calibrate again'); }
        Store.save(); ctx.render(); s.refresh();
      },
    });
  }

  function bindSettings(d, ctx) {
    UI.on({
      'cs-feature': ({ k }) => openFeature(d, k, ctx),
      'cs-toggle': ({ k }) => {
        d.settings[k] = !S(d, k);
        if (k === 'reverse' && has(d, 'calibration')) { d.curtains.forEach(resetLimits); UI.toast('Direction changed — calibrate again'); }
        Store.save(); ctx.render();
      },
      'cs-setup': () => openWizard(d, ctx, d.sel || 0, 'style'),
      'cs-rename': ({ ch }) => UI.prompt({ title: 'Rename curtain', label: 'Curtain name', value: d.curtains[+ch].name, onOk: (v) => { d.curtains[+ch].name = v; Store.save(); ctx.render(); UI.toast('Saved'); } }),
      'rs-identify': () => {
        if (!d.online) return UI.toast('Curtain is offline');
        const m = d.curtains[d.sel || 0], q = cur(d, m);
        begin(d, m, 1, clamp(q + 4)); setTimeout(() => { begin(d, m, -1, q); Store.save(); }, 450);
        Store.save(); UI.toast('The motor jogs a little — watch the curtain');
      },
    });
    startLoop(d, ctx);
  }

  function about(d) {
    const rows = [];
    if (multi(d)) rows.push(['Curtains', String(d.curtains.length)]);
    rows.push(['Ends learned by', CAL[d.cal].name]);
    if (has(d, 'calStatus')) d.curtains.forEach((m) => rows.push([multi(d) ? `Calibration · ${m.name}` : 'Calibration', m.calibrated ? `Fully calibrated${m.ctime ? ` · full run ${m.ctime.toFixed(1)} s` : ''}` : 'Not calibrated']));
    if (has(d, 'motorFault')) rows.push(['Motor', d.curtains.some((m) => m.fault) ? 'Blocked' : 'No problems']);
    if (has(d, 'battery')) rows.push(['Battery', `${d.battery} %${d.charging ? ' · charging' : ''}`]);
    return rows;
  }
  function tick(d) { return settle(d); }
  const busy = (d) => d.curtains.some(moving);

  /* ==========================================================================
     Prototype panel (desktop only) — the spec's left column: pick a real device,
     change its features and simulate the real world (wall switch, hand pull, obstacle…).
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    const m = d.curtains[d.sel || 0];
    const rocker = has(d, 'switchType') && S(d, 'switchType') === 'toggle';
    return `<div class="pp-title">Curtain prototype</div>
      <p class="pp-note">Not part of the app. Change what this curtain supports and simulate the real world. Spec: <a href="../Device%20Interface%203/10.%20Curtain_Interface.html" target="_blank">Curtain_Interface</a></p>
      <h3>Real curtain device</h3>
      <select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name} · ${p.model}</option>`).join('')}</select>
      <h3>Curtains on this device</h3><div class="pp-seg">${[1, 2].map((n) => `<button class="${n === d.curtains.length ? 'on' : ''}" data-action="pp-n" data-n="${n}">${n}</button>`).join('')}</div>
      <h3>How it learns its ends</h3><div class="pp-seg">${Object.keys(CAL).map((c) => `<button class="${d.cal === c ? 'on' : ''}" data-action="pp-cal" data-c="${c}" title="${esc(CAL[c].text)}">${CAL[c].name}</button>`).join('')}</div>
      <h3>Simulate</h3>
      <div class="pp-group">${multi(d) ? esc(m.name) + ' · ' : ''}${has(d, 'switchType') ? (rocker ? 'Wall rocker' : 'Wall push buttons') : 'Remote'}${has(d, 'childLock') && S(d, 'childLock') ? ' · locked' : ''}</div>
      <div class="pp-row">${[['open', '▲'], ['stop', '■'], ['close', '▼']].map(([a, t]) => `<button class="pp-btn" data-action="pp-wall" data-a="${a}">${t}</button>`).join('')}</div>
      <div class="pp-row"><button class="pp-btn" data-action="pp-pull">🤚 Pull by hand</button></div>
      <label class="pp-chk"><input type="checkbox" data-pp="backwards" ${d.sim.backwards ? 'checked' : ''}> Motor installed the other way round</label>
      <label class="pp-chk"><input type="checkbox" data-pp="obstacle" ${m.obstacle ? 'checked' : ''}> Obstacle on the track</label>
      <div class="pp-row"><button class="pp-btn" data-action="pp-power">${d.online ? '⚡ Power cut' : '🔌 Restore power'}</button>${has(d, 'battery') ? `<button class="pp-btn" data-action="pp-batt">🔋 ${d.battery < 20 ? 'Charge to 64 %' : 'Battery low'}</button>` : ''}</div>
      <h3>Features this curtain has</h3>
      ${ALL_GROUPS.map((grp) => `<div class="pp-group">${grp}</div>${g(grp).map((k) => `<label class="pp-chk"><input type="checkbox" data-pp="feat" value="${k}" ${has(d, k) ? 'checked' : ''}> ${F[k].name}${F[k].app ? ' <span class="c-tertiary">· app</span>' : ''}</label>`).join('')}`).join('')}
      <h3>Data</h3><button class="pp-btn" data-action="pp-reset">Reset all prototype data</button>`;
  }
  function bindProto(d, ctx) {
    const panel = document.getElementById('protoPanel'); if (!panel) return;
    const commit = (msg) => { Store.save(); ctx.render(); if (msg) UI.toast(msg); };
    panel.onchange = (e) => {
      const t = e.target, m = d.curtains[d.sel || 0];
      if (t.dataset.pp === 'preset') {
        const p = PRESETS.find((x) => x.id === t.value);
        Object.assign(d, { preset: p.id, model: p.model, manufacturer: p.manufacturer, originalName: p.name, features: p.feats.slice(), cal: p.cal, settings: { openingStyle: p.style }, curtains: [], sel: 0 });
        applyDefaults(d); setCurtainCount(d, p.names.length, p.names);
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); }
      if (t.dataset.pp === 'backwards') { d.sim.backwards = t.checked; d.curtains.forEach(resetLimits); UI.toast(t.checked ? 'Installed the other way: “Open” now closes it' : 'Installed normally'); }
      if (t.dataset.pp === 'obstacle') { m.obstacle = t.checked; if (t.checked && !has(d, 'motorFault')) d.features.push('motorFault'); }
      commit();
    };
    UI.on({
      'pp-n': ({ n }) => { setCurtainCount(d, +n, PRESETS.find((p) => p.id === 'dual').names); commit(); },
      'pp-cal': ({ c }) => { d.cal = c; d.curtains.forEach(resetLimits); commit(`Calibration: ${CAL[c].name}`); },
      'pp-wall': ({ a }) => {
        if (!d.online) return UI.toast('No power');
        if (has(d, 'childLock') && S(d, 'childLock')) return UI.toast('Child lock is on — the buttons do nothing');
        cmd(d, d.sel || 0, a); commit(a === 'stop' ? null : (!d.curtains[d.sel || 0].calibrated ? 'Not calibrated: it runs to the end of the track' : null));
      },
      'pp-pull': () => {
        const i = d.sel || 0, m = d.curtains[i];
        if (m.move) {
          if (has(d, 'manualStop') && S(d, 'manualStop')) { stop(d, m); return commit('Pull to stop: the motor stopped'); }
          return UI.toast('It keeps going — this motor has no Pull to stop' + (has(d, 'manualStop') ? ' turned on' : ''));
        }
        const p = phys(d, m.q), toOpen = p < 92, dq = (toOpen ? 8 : -8) * (flip(d) ? -1 : 1);
        m.q = clamp(m.q + dq);
        if (has(d, 'handPull') && S(d, 'handPull')) { begin(d, m, dq > 0 ? 1 : -1, m.calibrated ? (dq > 0 ? 100 : 0) : null); return commit(`Pull to start: the motor finishes ${toOpen ? 'opening' : 'closing'}`); }
        commit('Moved a little by hand' + (has(d, 'handPull') ? ' — Pull to start is off' : ''));
      },
      'pp-power': () => { if (d.online) { d.curtains.forEach((m) => stop(d, m)); d.online = false; } else d.online = true; commit(d.online ? 'Power restored' : 'Power cut — motor offline'); },
      'pp-batt': () => { d.battery = d.battery < 20 ? 64 : 14; commit(); },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Curtain', F, PRESETS, create, applyDefaults,
    icon: () => 'dev-curtains',
    describe: (p) => `${p.manufacturer} · ${p.names.length > 1 ? p.names.length + ' curtains' : p.id === 'roller' ? 'roller blind' : 'curtain motor'}`,
    homeTiles, toggle, page, bindPage, live, settings, bindSettings, about, tick, busy, protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
    _sim: () => V,   // read-only view of the live curtain simulation (used by tools/checks)
  };
})();
