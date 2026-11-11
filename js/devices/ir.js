/* ==========================================================================
   IR remote (blaster) — device interface (spec: Device Interface 3 / 19. IR_Remote_Interface.html)
   The phone becomes the remote of an old TV or air conditioner. Each appliance gets its own remote layout (TV, AC,
   fan, LED strip …); a tiny light at the top blinks when a code is sent. IR is one-way: the app shows what it
   last sent — it can’t know if someone used the original remote.
   ========================================================================== */
Devices.ir = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    tvRemote: { name: 'TV remote', grp: 'Device page', app: true, short: 'Power, source, volume, channels, arrows, numbers' },
    acRemote: { name: 'Air conditioner remote', grp: 'Device page', app: true, short: 'On/off, temperature, mode, fan, swing' },
    appliances: { name: 'More appliance remotes', grp: 'Device page', app: true, short: 'TV box, projector, soundbar, fan, heater, purifier, LED strip…' },
    custom: { name: 'Custom buttons', grp: 'Device page', app: true, short: 'Learn any button and give it a name' },
    learn: { name: 'Learn a button', grp: 'Device page', short: 'Press a button on the original remote — the code is saved' },
    brandSetup: { name: 'Brand setup', grp: 'Setup', type: 'action', short: 'Pick the brand, then “Press Power — did it react?”' },
    acBuiltIn: { name: 'AC control built in', grp: 'Device page', short: 'The blaster turns a thermostat control into IR itself' },
    irSwitches: { name: 'IR switches', grp: 'Device page', short: 'Six on/off switches, each with a learned on and off code' },
    lastSent: { name: 'Last sent state', grp: 'Device page', app: true, short: 'IR is one-way: the app shows what it last sent' },
    climateSensor: { name: 'Room temperature & humidity', grp: 'Sensors', short: 'Useful for “cool when above 27 °C”', hidden: true },
    calibration: { name: 'Sensor correction', grp: 'Sensors', type: 'fields', def: { t: 0, h: 0, unit: 'celsius' }, short: 'If it reads a bit high (next to a lamp)',
      fields: [{ id: 't', label: 'Temperature offset', unit: '°C', min: -5, max: 5, step: 0.5 }, { id: 'h', label: 'Humidity offset', unit: '%', min: -20, max: 20 }, { id: 'unit', kind: 'sel', label: 'Unit on the device', opts: [['celsius', '°C'], ['fahrenheit', '°F']] }] },
    battery: { name: 'Battery', grp: 'Device', short: 'Battery blasters report charge', hidden: true },
    identify: { name: 'Find this device', grp: 'Device', type: 'action', short: 'Blinks the blaster’s light', done: 'The blaster is blinking' },
  };
  const GROUPS = ['Device page', 'Setup', 'Sensors', 'Device', 'Automation'];
  const PRESETS = [
    { id: 'zs06', name: 'Tuya IR remote (USB)', model: 'ZS06', manufacturer: 'Tuya', feats: ['tvRemote', 'acRemote', 'appliances', 'custom', 'learn', 'lastSent', 'brandSetup'] },
    { id: 'ufo', name: 'Moes IR remote (battery)', model: 'UFO-R11', manufacturer: 'Moes', feats: ['tvRemote', 'acRemote', 'appliances', 'custom', 'learn', 'lastSent', 'brandSetup', 'battery'] },
    { id: 'zgir', name: 'IR + temperature sensor', model: 'ZG-IR01', manufacturer: 'HOBEIAN', feats: ['irSwitches', 'learn', 'climateSensor', 'calibration', 'battery'] },
    { id: 'zbir', name: 'IR with AC library', model: 'ZB-IR01', manufacturer: 'easyiot', feats: ['acBuiltIn', 'brandSetup', 'lastSent'] },
    { id: 'nodon', name: 'NodOn IR blaster (AC control)', model: 'IRB-4-1-00', manufacturer: 'NodOn', feats: ['acBuiltIn', 'climateSensor', 'calibration', 'identify'] },
    { id: 'owon', name: 'OWON AC controller', model: 'AC221', manufacturer: 'OWON', feats: ['acBuiltIn', 'brandSetup', 'climateSensor'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];
  // appliance kinds: [id, name, icon, needs feature]
  const KINDS = [['tv', 'TV', 'dev-tv-1', 'tvRemote'], ['ac', 'Air conditioner', 'dev-ac', 'acRemote'], ['box', 'TV box', 'dev-tv-2', 'appliances'], ['projector', 'Projector', 'dev-projector', 'appliances'], ['soundbar', 'Soundbar', 'dev-speaker-2', 'appliances'],
    ['fan', 'Fan', 'dev-fan', 'appliances'], ['heater', 'Heater', 'dev-radiator-mini', 'appliances'], ['purifier', 'Air purifier', 'dev-purifier', 'appliances'], ['strip', 'LED strip', 'dev-square-led', 'appliances'], ['vacuum', 'Robot vacuum', 'dev-robot', 'appliances'], ['custom', 'Custom', 'dev-remote', 'custom']];
  const BRANDS = { tv: ['Samsung', 'LG', 'Artel', 'Hisense', 'Shivaki', 'Sony'], ac: ['Artel', 'Midea', 'Samsung', 'LG', 'Gree', 'Shivaki'], other: ['Xiaomi', 'Artel', 'Philips', 'LG', 'Other'] };
  const MODES = [['cool', 'Cool'], ['heat', 'Heat'], ['dry', 'Dry'], ['fan', 'Fan'], ['auto', 'Auto']];
  const FANS = [['auto', 'Auto'], ['low', 'Low'], ['mid', 'Mid'], ['high', 'High']];
  const kindOf = (k) => KINDS.find((x) => x[0] === k) || KINDS[10];
  const acState = () => ({ on: false, t: 24, mode: 'cool', fan: 'auto', swing: false });

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const d = Kit.base('ir', p, Object.assign({ name: 'IR remote' }, opts), { battery: 66, cur: 0, remotes: [], sw: [], st: { last: null, lastSeen: now - 30000, blink: 0, t: 26.4, h: 38 }, phys: { blocked: false } });
    seedRemotes(d, p);
    Kit.applyDefaults(F, d);
    return d;
  }
  function seedRemotes(d, p) {
    d.remotes = []; d.cur = 0; d.sw = [];
    if (p.feats.includes('acBuiltIn')) d.remotes.push({ kind: 'ac', brand: 'Midea', name: 'Air conditioner', ac: acState(), builtin: true });
    else {
      if (p.feats.includes('tvRemote')) d.remotes.push({ kind: 'tv', brand: 'Samsung', name: 'TV' });
      if (p.feats.includes('acRemote')) d.remotes.push({ kind: 'ac', brand: 'Artel', name: 'Air conditioner' });   // an old AC: buttons only
      if (p.feats.includes('appliances')) d.remotes.push({ kind: 'fan', brand: 'Xiaomi', name: 'Ceiling fan' });
    }
    if (p.feats.includes('irSwitches')) d.sw = ['Heater', 'Fan', 'Lamp', '', '', ''].map((n, i) => ({ name: n || `Switch ${i + 1}`, learned: !!n, on: false }));
  }
  const applyDefaults = (d) => { Kit.applyDefaults(F, d); d.remotes = d.remotes || []; d.sw = d.sw || []; };
  const fmtT = (d, c) => (has(d, 'calibration') && S(d, 'calibration').unit === 'fahrenheit' ? `${(c * 9 / 5 + 32).toFixed(0)} °F` : `${c.toFixed(1)} °C`);
  const roomT = (d) => d.st.t + (has(d, 'calibration') ? S(d, 'calibration').t : 0);

  /* ---------- Sending ---------- */
  function send(d, r, label) {
    if (!d.online) { UI.toast('The blaster is offline'); return false; }
    d.st.last = { r: r ? r.name : '', label, t: Date.now() }; if (r) r.last = { label, t: Date.now() }; d.st.blink = Date.now(); d.st.lastSeen = Date.now();
    Kit.logEv(d, 'sent', { text: `${r ? r.name + ' · ' : ''}${label}` });
    return true;
  }
  function tick(d) {
    let ch = false; const b = d.st.blink && Date.now() - d.st.blink < 1200; if (!b && d.st.blink) { d.st.blink = 0; ch = true; }
    d.remotes.forEach((r) => { if (r._reading && Date.now() - r._readAt > 1400) { r.trained = r.trained || {}; r.trained[r._reading] = true; r._flash = r._reading; r._reading = null; Kit.logEv(d, 'learned', { text: `${r.name}: learned “${r._flash}”` }); ch = true; } });
    return ch;
  }

  /* ---------- Text ---------- */
  function lastLine(d) { const l = d.st.last; return l ? `Sent “${l.label}”${l.r ? ' to ' + l.r : ''} · ${when(l.t)}` : 'Nothing sent yet'; }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (has(d, 'battery') && d.battery <= 20) return { text: 'Battery low', tone: 'warn' };
    const ac = d.remotes.find((r) => r.kind === 'ac' && r.builtin && r.ac);
    if (ac && ac.ac.on) return { text: `AC · ${ac.ac.t}° ${MODES.find((m) => m[0] === ac.ac.mode)[1].toLowerCase()}` };
    if (has(d, 'climateSensor')) return { text: fmtT(d, roomT(d)) };
    return { text: d.remotes.length ? `${d.remotes.length} remote${d.remotes.length > 1 ? 's' : ''}` : 'No remotes yet' };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: 'dev-remote', on: false, status: s.text, tone: s.tone, controllable: false, offline: !d.online }]; };

  /* ---------- Remote layouts (Figma 5433:50373 “TV - Remote - Default”) ----------
     The blaster's page lists its remotes (Figma 5433:46901 “Device list”); each remote opens as its own page
     (device.html?id=…&r=N, title = the appliance, Edit on the right). Every remote uses the same grammar as a real
     one: a 3-column grid of keys (fills/tertiary, radius 24, 4 px apart), 76 px rows, a 156 px row for the rockers,
     power always top-right in color/red. A key is an icon with a printed label under it, like on a real remote. */
  const view = () => { const r = UI.param('r'); return r === null || r === '' || r === undefined ? -1 : +r; };
  const checking = () => UI.param('check') === '1';
  const rem = (d) => d.remotes[view()] || null;
  const trained = (r, l) => !r || !r.trained || !!r.trained[l];
  let curR = null;   // the remote being drawn (for trained / reading marks)
  const mk = (l) => { const r = curR; if (!r || !checking()) return ''; return `${trained(r, l) ? ' tr' : ' untr'}${r._reading === l ? ' reading' : ''}${r._sel === l ? ' sel' : ''}`; };
  const K = (l, o = {}) => `<button class="ir-k ${o.cls || ''}${o.ic && o.text ? ' lab' : ''}${mk(l)}" data-action="${o.act || 'ir-send'}" data-l="${esc(l)}" aria-label="${esc(o.aria || l)}">${o.ic ? icon(o.ic, 'icon', `style="width:${o.s || (o.text ? 24 : 32)}px;height:${o.s || (o.text ? 24 : 32)}px"`) : ''}${o.text ? `<span>${esc(o.text)}</span>` : ''}</button>`;
  const rocker = (label, up, down, upIc = 'ir-plus', downIc = 'ir-minus') => `<div class="ir-k ir-rk"><button class="up${mk(up)}" data-action="ir-send" data-l="${esc(up)}" aria-label="${esc(up)}">${icon(upIc, 'icon', 'style="width:24px;height:24px"')}</button><span>${esc(label)}</span><button class="dn${mk(down)}" data-action="ir-send" data-l="${esc(down)}" aria-label="${esc(down)}">${icon(downIc, 'icon', 'style="width:24px;height:24px"')}</button></div>`;
  const pair = (a, b) => `<div class="ir-pair">${a}${b}</div>`;
  const row = (...k) => `<div class="ir-r">${k.join('')}</div>`;
  const tall = (...k) => `<div class="ir-r tall">${k.join('')}</div>`;
  const gap = '<i></i>';
  const POWER = K('Power', { ic: 'ir-power', cls: 'pw' });
  const nums = (d) => (d.sim.nums ? row(...[1, 2, 3].map((x) => K(`Number ${x}`, { text: String(x) }))) + row(...[4, 5, 6].map((x) => K(`Number ${x}`, { text: String(x) }))) + row(...[7, 8, 9].map((x) => K(`Number ${x}`, { text: String(x) }))) + row(gap, K('Number 0', { text: '0' }), gap) : '');
  function tvPad(d) {
    // the D-pad: four wedges of one 228 px disc; a pressed wedge sinks into the surface (gradient), OK is white
    const dp = (c, l, ic) => `<button class="${c}${mk(l)}" data-action="ir-send" data-l="${l}" aria-label="${l}"><span>${icon(ic, 'icon', 'style="width:24px;height:24px"')}</span></button>`;
    return `<div class="ir-dpad">${dp('u', 'Up', 'ir-chev-up')}${dp('d', 'Down', 'ir-chev-down')}${dp('l', 'Left', 'ir-chev-left')}${dp('r', 'Right', 'ir-chev-right')}<button class="ok${mk('OK')}" data-action="ir-send" data-l="OK">OK</button></div>
      <div class="ir-keys">
        ${row(K('Source', { ic: 'ir-source' }), gap, POWER)}
        ${tall(rocker('Volume', 'Volume up', 'Volume down'), pair(K('Mute', { ic: 'ir-mute', s: 24 }), K('Settings', { ic: 'ir-setting', s: 24 })), rocker('Channel', 'Channel up', 'Channel down', 'ir-chev-up', 'ir-chev-down'))}
        ${row(K('Back', { ic: 'ir-back', cls: 'flip' }), K('Numbers', { ic: 'ir-numpad', act: 'ir-num', cls: d.sim.nums ? 'on' : '' }), K('Home', { ic: 'ir-home' }))}
        ${nums(d)}</div>`;
  }
  /** Universal remote for old air conditioners: buttons only. The AC answers nothing — Swing starts or stops the flap,
      Mode goes to the next mode — so no temperature or state is shown, only what was sent. */
  function acKeys() {
    return `<div class="ir-keys">
      ${row(K('Mode', { ic: 'dev-thermostat', text: 'Mode' }), K('Timer', { ic: 'clock', text: 'Timer' }), POWER)}
      ${tall(rocker('Temp', 'Warmer', 'Cooler'), pair(K('Swing', { ic: 'arrows-down-up', text: 'Swing' }), K('Air direction', { ic: 'arrow-fork', text: 'Direction' })), rocker('Fan', 'Fan faster', 'Fan slower'))}
      ${row(K('Sleep', { ic: 'moon', text: 'Sleep' }), K('Turbo', { ic: 'bolt', text: 'Turbo' }), K('Eco', { ic: 'seedling-fill', text: 'Eco' }))}
      ${row(K('Display light', { ic: 'sun', text: 'Light' }), K('Self-clean', { ic: 'dev-air', text: 'Clean' }), K('Quiet', { ic: 'bell', text: 'Quiet' }))}</div>
      <p class="ir-note">Old air conditioners don’t answer back — each button only sends its signal. Look at the AC to see what changed.</p>`;
  }
  function fanKeys(d, r) {
    return `<div class="ir-keys">
      ${row(K('Timer', { ic: 'clock', text: 'Timer' }), gap, POWER)}
      ${tall(rocker('Speed', 'Faster', 'Slower'), pair(K('Swing', { ic: 'arrows-down-up', text: 'Swing' }), K('Wind mode', { ic: 'dev-fan', text: 'Mode' })), pair(K('Light', { ic: 'sun', text: 'Light' }), K('Sleep', { ic: 'moon', text: 'Sleep' })))}
      ${extraRows(d, r)}</div>`;
  }
  /** The blaster that speaks AC itself (NodOn, OWON…): it keeps the state, so the app can show 24 ° Cool. */
  function acPanel(d, r) {
    const a = r.ac;
    return `<div class="ir-ac ${a.on ? 'on' : ''}">
      <div class="ir-ac-top"><button class="ir-step" data-action="ir-ac-t" data-v="-1" ${!a.on || a.t <= 16 ? 'disabled' : ''} aria-label="Cooler">−</button>
        <div class="ir-temp"><b data-num>${a.on ? a.t + '°' : 'Off'}</b><span>${a.on ? MODES.find((m) => m[0] === a.mode)[1] + ' · fan ' + FANS.find((f) => f[0] === a.fan)[1].toLowerCase() : (has(d, 'climateSensor') ? `Room ${fmtT(d, roomT(d))}` : 'Tap power to turn on')}</span></div>
        <button class="ir-step" data-action="ir-ac-t" data-v="1" ${!a.on || a.t >= 30 ? 'disabled' : ''} aria-label="Warmer">+</button></div>
      <button class="btn ${a.on ? 'btn-glass' : 'btn-primary'} btn-block" data-action="ir-ac-pw">${icon('power')}${a.on ? 'Turn off' : 'Turn on'}</button>
      <div class="ir-lbl">Mode</div><div class="segmented">${MODES.map(([k, l]) => `<button class="${a.mode === k ? 'on' : ''}" data-action="ir-ac-mode" data-v="${k}" ${!a.on ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      <div class="ir-lbl">Fan</div><div class="segmented">${FANS.map(([k, l]) => `<button class="${a.fan === k ? 'on' : ''}" data-action="ir-ac-fan" data-v="${k}" ${!a.on ? 'disabled' : ''}>${l}</button>`).join('')}</div>
      <div class="list" style="margin:16px 0 0">${Kit.sw('ir-ac-swing', 's', 'Swing', 'The flap moves up and down', a.swing, !a.on)}</div></div>`;
  }
  const OTHER = { box: ['Home', 'Back', 'OK', 'Play / Pause', 'Volume +', 'Volume −'], projector: ['Source', 'Focus +', 'Focus −', 'Volume +', 'Volume −'], soundbar: ['Volume +', 'Volume −', 'Mute', 'Bass', 'Input'], heater: ['Warmer', 'Cooler', 'Timer'], purifier: ['Speed', 'Auto', 'Night'], strip: ['Brighter', 'Dimmer', 'Red', 'Green', 'Blue', 'White'], vacuum: ['Start', 'Pause', 'Go home', 'Spot clean'] };
  const learnKey = (d, r) => (has(d, 'learn') || r.kind === 'custom' ? `<button class="ir-k lab ir-learnk" data-action="ir-learn">${icon('plus', 'icon', 'style="width:24px;height:24px"')}<span>Learn</span></button>` : '');
  function extraRows(d, r) {
    const keys = (r.kind === 'custom' ? (r.buttons || []) : (r.extra || [])).map((l) => K(l, { text: l })).concat(learnKey(d, r) ? [learnKey(d, r)] : []);
    let h = ''; for (let i = 0; i < keys.length; i += 3) h += row(keys[i], keys[i + 1] || gap, keys[i + 2] || gap);
    return h;
  }
  function keysPad(d, r) {
    const base = (OTHER[r.kind] || []).map((l) => K(l, { text: l }));
    const first = r.kind === 'custom' ? [] : [r.kind === 'vacuum' ? gap : POWER];
    const keys = first.concat(base);
    let h = ''; for (let i = 0; i < keys.length; i += 3) h += row(keys[i], keys[i + 1] || gap, keys[i + 2] || gap);
    return `<div class="ir-keys">${h}${extraRows(d, r)}</div>${r.kind === 'custom' && !(r.buttons || []).length ? '<p class="ir-note">No buttons yet — tap “Learn” and press the button on the original remote.</p>' : ''}`;
  }
  function padOf(d, r) { curR = r; const h = r.kind === 'tv' ? tvPad(d) : r.kind === 'ac' ? (r.builtin ? acPanel(d, r) : acKeys()) : r.kind === 'fan' ? fanKeys(d, r) : keysPad(d, r); curR = null; return h; }

  /* ---------- Device page ---------- */
  function headText(d) {
    const r = rem(d);
    if (r && checking()) return r._reading ? 'Reading…' : r._sel ? '' : 'Tap a button, then press it on your physical remote';
    if (!has(d, 'lastSent') && !has(d, 'acBuiltIn')) return 'Ready';
    if (!r) return lastLine(d);
    return r.last ? `Sent “${r.last.label}” · ${when(r.last.t)}` : 'Nothing sent yet';
  }
  function head(d) {
    const r = rem(d), blink = d.st.blink && Date.now() - d.st.blink < 1200;
    if (r && checking() && r._sel) return `<div class="pad ir-trained" data-key="head"><span>This button has already been trained</span><button class="btn-sm" data-action="ir-retrain">${icon('refresh', 'icon icon-sm')}Retrain</button><button class="ir-del" data-action="ir-untrain" aria-label="Delete this button">${icon('cross', 'icon', 'style="width:18px;height:18px"')}</button></div>`;
    return `<div class="pad ir-head ${r && checking() && r._reading ? 'is-reading' : ''}" data-key="head"><span class="ir-led ${blink || (r && r._reading) ? 'on' : ''}" aria-hidden="true"></span><span class="cw-state" data-num data-live="sub">${esc(headText(d))}</span></div>`;
  }
  function page(d) {
    const st = d.st, r = rem(d);
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (has(d, 'battery') && d.battery <= 20) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    if (r) { h += head(d) + `<div class="pad ir-remote ${checking() ? 'checking' : ''}" data-key="pad-${view()}-${r.kind}">${padOf(d, r)}</div>`; return h + '<div style="height:28px"></div>'; }
    const canAdd = has(d, 'brandSetup') || has(d, 'appliances') || has(d, 'tvRemote');
    // empty (Figma 5433:46868 “Remote control”)
    if (!d.remotes.length && !has(d, 'irSwitches')) return h + `<div class="ir-empty" data-key="empty"><h2>No devices yet</h2><p>Tap “Add a device” to add a device for remote control use</p><button class="btn btn-opposite btn-block" data-action="ir-add">${icon('plus')}Add a device</button></div>`;
    // the list (Figma 5433:46901 “Device list”): tiles with the appliance icon and name; ⋮ = Rename / Remove
    if (d.remotes.length) h += `<div class="pad ir-tiles" data-key="remotes">${d.remotes.map((x, i) => `<div class="ir-tile" role="link" tabindex="0" data-action="ir-open" data-i="${i}">${icon(kindOf(x.kind)[2], 'icon', 'style="width:28px;height:28px"')}<span class="nm">${esc(x.name)}</span><button class="ir-more" data-action="ir-more" data-i="${i}" aria-label="More for ${esc(x.name)}"><i></i><i></i><i></i></button></div>`).join('')}</div>`;
    if (has(d, 'irSwitches')) h += `<div class="list-header" data-key="sw-h">Switches</div><div class="list" data-key="sw">${d.sw.map((x, i) => x.learned ? Kit.sw('ir-sw', i, x.name, x.on ? 'Sent “on”' : 'Sent “off”', x.on) : `<button class="cell" data-action="ir-sw-learn" data-i="${i}"><span class="cell-main"><span class="cell-title" style="display:block">${esc(x.name)}</span><span class="cell-sub" style="display:block">Not learned yet</span></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`;
    h += Kit.cards([
      has(d, 'climateSensor') && ['Room temperature', fmtT(d, roomT(d)), { count: true }],
      has(d, 'climateSensor') && ['Humidity', `${Math.round(st.h + (has(d, 'calibration') ? S(d, 'calibration').h : 0))} %`, { count: true }],
      has(d, 'battery') && ['Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    if (canAdd) h += `<div class="ir-push" data-key="push"></div><div class="ir-addbar" data-key="add"><button class="btn btn-opposite btn-block" data-action="ir-add">${icon('plus')}Add a device</button></div>`;
    return h;
  }
  function toolbar(d) {
    const r = rem(d); if (!r) return null;
    return { title: r.name, subtitle: Store.roomName(d.roomId), back: `device.html?id=${d.id}`, right: checking() ? `<button class="ir-ok" data-action="ir-done" aria-label="Save the remote">${icon('check', 'icon', 'style="width:24px;height:24px"')}</button>` : '<button class="glass-btn txt" data-action="ir-edit">Edit</button>' };
  }
  function afterRender(d, screen) {
    const bar = screen.querySelector('.ir-addbar'), sp = screen.querySelector('.ir-push'); if (!bar || !sp) return;
    sp.style.height = '0px';
    const free = screen.clientHeight - (bar.offsetTop + bar.offsetHeight);
    sp.style.height = Math.max(0, free) + 'px';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), headText(d)); const led = root.querySelector('.ir-led'); if (led) led.classList.toggle('on', !!(d.st.blink && Date.now() - d.st.blink < 1200)); }

  /* ---------- Learn & setup ---------- */
  function openLearn(d, ctx, onDone) {
    let phase = 'wait';
    const s = UI.sheet({
      title: 'Learn a button', sub: 'Point the original remote at the blaster, about 10 cm away',
      render: () => `<div class="ir-learn ${phase}"><span class="ir-led big ${phase === 'wait' ? 'pulse' : 'on'}"></span><b>${phase === 'wait' ? 'Press the button on the original remote' : 'Got it!'}</b><span>${phase === 'wait' ? 'The light on the blaster is waiting…' : 'The code is saved in the blaster'}</span></div>`,
      footer: () => (phase === 'wait' ? '<button class="btn btn-glass btn-block" data-action="ir-learn-sim">Press it (prototype)</button>' : '<button class="btn btn-primary btn-block" data-action="ir-learn-name">Name this button</button>'),
    });
    const got = () => { phase = 'got'; s.refresh(); };
    d.sim.learnHook = got;
    UI.on({ 'ir-learn-sim': got, 'ir-learn-name': () => UI.prompt({ title: 'Button name', label: 'e.g. Light, Speed, Timer', value: 'Light', okText: 'Save', onOk: (v) => { onDone(v); Kit.logEv(d, 'learned', { text: `Learned “${v}”` }); Store.save(); ctx.render(); } }) });
  }
  // brands with logos (Figma 5433:47261 TV / 5433:47322 AC “Choose brand”)
  const LOGO = { Samsung: [14.21, 4.16, 43.24, 92.47], LG: [38.42, 8.96, 30.37, 83.77], Artel: [49.79, 6.44, 24.84, 86.59], TCL: [53.72, 5, 23.14, 90], Hisense: [13.5, 7.5, 43.25, 85], Skyworth: [15.05, 5, 42.48, 90], Sony: [14.08, 10, 42.96, 80], Philips: [100, 0, 0, 100], Sharp: [12.13, 7.5, 43.93, 85], Daikin: [18.33, 7.5, 40.84, 85], Midea: [37.22, 5, 31.39, 90], Gree: [18.38, 5, 40.81, 90], Hitachi: [12.5, 10.91, 45, 78.18] };
  // tile backgrounds from Figma (TCL red, Artel green gradient); Panasonic has no logo yet (Figma shows GREE's there)
  const LOGO_BG = { TCL: '#ed1c24', Artel: 'linear-gradient(to left, #0d7a46, #0b4e2c)' };
  const BRAND_LIST = { tv: ['Samsung', 'LG', 'Artel', 'TCL', 'Hisense', 'Skyworth', 'Sony', 'Philips', 'Sharp'], ac: ['Samsung', 'LG', 'Artel', 'Daikin', 'Midea', 'Gree', 'Panasonic', 'Hitachi'] };
  const logo = (b) => { const p = LOGO[b]; return p ? `<span class="ir-logo" ${LOGO_BG[b] ? `style="background:${LOGO_BG[b]}"` : ''}><img src="assets/brands/${b.toLowerCase()}.png" alt="" style="height:${p[0]}%;left:${p[1]}%;top:${p[2]}%;width:${p[3]}%"></span>` : `<span class="ir-logo txt">${esc(b.slice(0, 2))}</span>`; };
  function openAdd(d, ctx) {
    let step = 'kind', kind = null, q = '';
    const kinds = () => KINDS.filter((k) => has(d, k[3]) || (k[0] === 'ac' && has(d, 'acBuiltIn')));
    const brands = () => (BRAND_LIST[kind] || ['Xiaomi', 'Artel', 'Philips', 'LG', 'Samsung']).filter((b) => !q || b.toLowerCase().includes(q.toLowerCase()));
    const cfg = {
      title: 'Select device type',
      render: () => {
        if (step === 'kind') return `<div class="list">${kinds().map(([k, l, ic]) => `<button class="cell has-icon" data-action="ir-k" data-k="${k}"><span class="cell-icon">${icon(ic)}</span><span class="cell-main cell-title">${esc(l === 'Air conditioner' ? 'Air Conditioner' : l)}</span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`;
        return `<div class="pad"><button class="ir-back-link" data-action="ir-k-back">${icon('chevron-m-left', 'icon', 'style="width:20px;height:20px"')}${esc(kindOf(kind)[1] === 'Air conditioner' ? 'Air Conditioner' : kindOf(kind)[1])}</button></div>
          <div class="pad" style="margin-top:8px"><label class="ir-search">${icon('ir-search', 'icon', 'style="width:20px;height:20px"')}<input id="irSearch" placeholder="Search by names" value="${esc(q)}" autocomplete="off"></label></div>
          <div class="list ir-brands" style="margin-top:12px">${brands().map((b) => `<button class="cell" data-action="ir-brand" data-b="${b}">${logo(b)}<span class="cell-main cell-title">${b}</span>${icon('chevron-right', 'chev')}</button>`).join('') || '<div class="cell"><span class="cell-main cell-sub">No brand found — try “Learn” instead</span></div>'}</div>`;
      },
    };
    const s = UI.sheet(cfg);
    const bindSearch = () => { const i = document.getElementById('irSearch'); if (i && !i._b) { i._b = true; i.addEventListener('input', () => { q = i.value; const pos = i.selectionStart; s.refresh(); const j = document.getElementById('irSearch'); if (j) { j.focus(); j.setSelectionRange(pos, pos); } bindSearch(); }); } };
    UI.on({
      'ir-k': ({ k }) => { kind = k; if (k === 'custom') { d.remotes.push({ kind: 'custom', brand: '', name: 'Custom', buttons: [] }); Store.save(); UI.closeSheet(); location.href = `device.html?id=${d.id}&r=${d.remotes.length - 1}`; return; } step = 'brand'; q = ''; cfg.title = 'Choose brand'; s.refresh(); bindSearch(); },
      'ir-k-back': () => { step = 'kind'; cfg.title = 'Select device type'; s.refresh(); },
      'ir-brand': ({ b }) => openSetup(d, ctx, kind, b),
    });
  }
  /** Figma 5433:50022 “RC connected – Success”: how teaching works, then Start → the remote in check mode. */
  function openSetup(d, ctx, kind, brand, retry) {
    if (d.sim.failNext && !retry) return openError(d, ctx, kind, brand);
    UI.sheet({
      title: '', closeBtn: true,
      render: () => `<div class="ir-setup"><span class="ir-setup-ic">${icon('dev-remote', 'icon', 'style="width:56px;height:56px"')}</span><h2>Set Up Your Remote</h2><p>Teach your remote the buttons from your physical remote</p>
        <ol><li><b>Select a Button</b><span>Choose a button on the remote layout to start</span></li><li><b>Press the Remote Button</b><span>Point your physical remote at the device and press the matching button. A colour change confirms the signal was detected</span></li><li><b>Save Your Remote</b><span>Repeat for each button you want to add. When finished, tap Save to keep your setup</span></li></ol></div>`,
      footer: '<button class="btn btn-opposite btn-block" data-action="ir-start">Start</button>',
    });
    UI.on({ 'ir-start': () => { const k = kindOf(kind); const r = { kind, brand, name: kind === 'ac' ? 'Air Conditioner' : k[1], trained: {} }; if (kind === 'ac' && has(d, 'acBuiltIn')) { r.ac = acState(); r.builtin = true; delete r.trained; } d.remotes.push(r); Kit.logEv(d, 'added', { text: `Added ${brand} ${k[1]}` }); Store.save(); UI.closeSheet(); location.href = `device.html?id=${d.id}&r=${d.remotes.length - 1}${r.trained ? '&check=1' : ''}`; } });
  }
  /** Figma 5433:50104 “RC – Error”. */
  function openError(d, ctx, kind, brand) {
    d.sim.failNext = false;
    UI.sheet({
      title: '', render: () => `<div class="ir-setup err"><span class="ir-err-ic">${icon('cross', 'icon', 'style="width:36px;height:36px"')}</span><h2>Something went wrong</h2><p>The remote couldn’t connect with your ${esc(kindOf(kind)[1].toLowerCase())}, please try again</p></div>`,
      footer: '<button class="btn btn-opposite btn-block" data-action="ir-again">Start again</button>',
    });
    UI.on({ 'ir-again': () => openSetup(d, ctx, kind, brand, true) });
  }
  function openMore(d, ctx, i) {
    const r = d.remotes[i];
    UI.sheet({
      title: r.name, render: () => `<div class="list"><button class="cell" data-action="ir-rename" data-i="${i}"><span class="cell-main cell-title">Rename</span>${icon('chevron-right', 'chev')}</button><button class="cell" data-action="ir-teach" data-i="${i}"><span class="cell-main cell-title">Teach buttons again</span>${icon('chevron-right', 'chev')}</button><button class="cell" data-action="ir-remove" data-i="${i}"><span class="cell-main cell-title" style="color:var(--red)">Remove</span></button></div>`,
    });
  }
  const renameR = (d, ctx, i) => UI.prompt({ title: 'Rename', label: 'Device name', value: d.remotes[i].name, okText: 'Save', onOk: (v) => { d.remotes[i].name = v; Store.save(); ctx.render(); } });
  const removeR = (d, ctx, i, after) => UI.confirm({ title: 'Remove device?', text: 'Are you sure you want to remove this device? It will be unlinked from your home.', ok: 'Remove', onOk: () => { const n = d.remotes[i].name; d.remotes.splice(i, 1); Store.save(); if (after) after(n); else { ctx.render(); UI.toast(`${n} removed`); } } });
  function openEdit(d, ctx) {
    const r = rem(d), i = view();
    UI.sheet({
      title: `Edit ${r.name}`, sub: r.brand ? `${r.brand}` : 'Learned buttons',
      render: () => `<div class="list"><button class="cell" data-action="ir-rename" data-i="${i}"><span class="cell-main cell-title">Name</span><span class="cell-value">${esc(r.name)}</span>${icon('chevron-right', 'chev')}</button>
        ${r.builtin ? '' : `<button class="cell" data-action="ir-teach" data-i="${i}"><span class="cell-main cell-title">Teach buttons</span>${icon('chevron-right', 'chev')}</button>`}
        ${has(d, 'learn') && r.kind !== 'ac' && r.kind !== 'tv' ? `<button class="cell" data-action="ir-learn"><span class="cell-main cell-title">Learn a new button</span>${icon('chevron-right', 'chev')}</button>` : ''}</div>
        <div class="pad" style="margin-top:24px"><button class="btn btn-danger btn-block" data-action="ir-remove" data-i="${i}">Remove this remote</button></div>`,
    });
  }
  function bindPage(d, ctx) {
    const commit = () => { Store.save(); ctx.render(); };
    const go = (u) => { location.href = u; };
    UI.on({
      'ir-add': () => openAdd(d, ctx),
      'ir-open': ({ i }, el, e) => { if (e && e.target.closest('.ir-more')) return; go(`device.html?id=${d.id}&r=${i}`); },
      'ir-more': ({ i }) => openMore(d, ctx, +i),
      'ir-rename': ({ i }) => { UI.closeSheet(); renameR(d, ctx, +i); },
      'ir-remove': ({ i }) => { UI.closeSheet(); removeR(d, ctx, +i, view() >= 0 ? (n) => { UI.flash(`${n} removed`); go(`device.html?id=${d.id}`); } : null); },
      'ir-teach': ({ i }) => { UI.closeSheet(); go(`device.html?id=${d.id}&r=${i}&check=1`); },
      'ir-edit': () => openEdit(d, ctx),
      'ir-send': ({ l }) => {
        const r = rem(d);
        if (r && checking()) {   // teaching: select a button, then press it on the physical remote
          if (r._reading) return;
          if (trained(r, l)) { r._sel = r._sel === l ? null : l; commit(); return; }
          r._sel = null; r._reading = l; r._readAt = Date.now(); d.sim.readHook = true; commit(); return;
        }
        if (send(d, r, l)) commit();
      },
      'ir-retrain': () => { const r = rem(d); r._reading = r._sel; r._readAt = Date.now(); r._sel = null; commit(); },
      'ir-untrain': () => { const r = rem(d); delete r.trained[r._sel]; r._sel = null; commit(); },
      'ir-done': () => { const r = rem(d); const n = Object.keys(r.trained || {}).length; r._sel = null; r._reading = null; Store.save(); UI.flash(n ? `${r.name} saved · ${n} button${n > 1 ? 's' : ''}` : `${r.name} saved — teach buttons any time in Edit`); go(`device.html?id=${d.id}&r=${view()}`); },
      'ir-num': () => { d.sim.nums = !d.sim.nums; commit(); },
      'ir-learn': () => { UI.closeSheet(); openLearn(d, ctx, (v) => { const r = rem(d); if (r.kind === 'custom') (r.buttons = r.buttons || []).push(v); else (r.extra = r.extra || []).push(v); }); },
      'ir-ac-pw': () => { const a = rem(d).ac; a.on = !a.on; if (send(d, rem(d), a.on ? `On · ${a.t}°` : 'Off')) commit(); },
      'ir-ac-t': ({ v }) => { const a = rem(d).ac; a.t = Math.max(16, Math.min(30, a.t + +v)); if (send(d, rem(d), `${a.t}°`)) commit(); },
      'ir-ac-mode': ({ v }) => { const a = rem(d).ac; a.mode = v; if (send(d, rem(d), MODES.find((m) => m[0] === v)[1])) commit(); },
      'ir-ac-fan': ({ v }) => { const a = rem(d).ac; a.fan = v; if (send(d, rem(d), `Fan ${v}`)) commit(); },
      'ir-ac-swing': () => { const a = rem(d).ac; a.swing = !a.swing; if (send(d, rem(d), a.swing ? 'Swing on' : 'Swing off')) commit(); },
      'ir-sw': ({ n }) => { const x = d.sw[+n]; x.on = !x.on; if (send(d, null, `${x.name} ${x.on ? 'on' : 'off'}`)) commit(); },
      'ir-sw-learn': ({ i }) => openLearn(d, ctx, (v) => { Object.assign(d.sw[+i], { name: v, learned: true }); }),
    });
  }

  /* ---------- Settings ---------- */
  function settings(d) {
    const rows = d.remotes.map((r, i) => `<div class="cell"><span class="cell-icon">${icon(kindOf(r.kind)[2])}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(r.name)}</span><span class="cell-sub" style="display:block">${esc(r.brand || 'Learned buttons')}</span></span><button class="btn-sm" data-action="ir-del" data-i="${i}">Remove</button></div>`).join('');
    return (d.remotes.length ? `<div class="list-header">Remotes</div><div class="list">${rows}</div>` : '') + Kit.settingsHTML(F, GROUPS, d);
  }
  function bindSettings(d, ctx) {
    Kit.bindSettings(F, d, ctx, { brandSetup: () => openAdd(d, ctx) });
    UI.on({ 'rs-history': () => Kit.historySheet(d, { sent: 'Code sent', learned: 'Learned a button', added: 'Remote added' }, 'Every code the blaster sent') });
    UI.on({ 'ir-del': ({ i }) => UI.confirm({ title: `Remove ${d.remotes[+i].name}?`, text: 'Its buttons are deleted from the app.', ok: 'Remove', onOk: () => { d.remotes.splice(+i, 1); d.cur = 0; Store.save(); ctx.render(); } }) });
  }
  const about = (d) => [['Remotes', `${d.remotes.length}`], ...(d.st.last ? [['Last sent', lastLine(d)]] : [])];

  function protoPanel(d) {
    return Kit.protoHead('IR remote prototype', '19. IR_Remote_Interface.html', PRESETS, d) + `
      <h3>The room</h3>
      <div class="pp-row">${Kit.ppBtn('pp-fail', d.sim.failNext ? '✅ Next setup works' : '⚠️ Next setup fails (error screen)')}${Kit.ppBtn('pp-orig', '📺 Someone uses the original remote')}${Kit.ppBtn('pp-learnkey', '🔴 Press a key on the original remote', has(d, 'learn'))}</div>
      <div class="pp-row">${Kit.ppBtn('pp-hot', '🌡 Room 29 °C', has(d, 'climateSensor'))}${Kit.ppBtn('pp-batt', d.battery <= 20 ? '🔋 New batteries' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-fail': () => { d.sim.failNext = !d.sim.failNext; },
      'pp-orig': () => 'The TV changed — but IR is one-way, so the app still shows what IT last sent. That is normal.',
      'pp-learnkey': () => { const r = d.remotes.find((x) => x._reading); if (r) { r._readAt = 0; tick(d); return; } if (d.sim.learnHook && UI.sheetOpen) { d.sim.learnHook(); return; } return 'Open “Learn a button” or tap a button while teaching first'; },
      'pp-hot': () => { d.st.t = d.st.t > 28 ? 24.5 : 29.2; },
      'pp-batt': () => { d.battery = d.battery <= 20 ? 100 : 12; },
      'pp-online': () => { d.online = !d.online; if (d.online) d.st.lastSeen = Date.now(); },
    }, (dd, p) => seedRemotes(dd, p));
  }

  return {
    label: 'IR remote', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'IR remote',
    icon: () => 'dev-remote', describe: (p) => `${p.manufacturer} · IR blaster`,
    historyValue: (d) => `${d.log.length} codes sent`,
    homeTiles, page, toolbar, afterRender, bindPage, live, settings, bindSettings, about, tick, busy: (d) => !!d.st.blink,
    protoPanel, bindProto,
  };
})();
