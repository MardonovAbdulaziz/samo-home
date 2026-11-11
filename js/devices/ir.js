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
      if (p.feats.includes('custom')) d.remotes.push({ kind: 'custom', brand: '', name: 'Ceiling fan', buttons: ['Power', 'Speed', 'Light'] });
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
  function tick(d) { const b = d.st.blink && Date.now() - d.st.blink < 1200; if (!b && d.st.blink) { d.st.blink = 0; return true; } return false; }

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
     The blaster's page lists its remotes; each remote opens as its own page (device.html?id=…&r=N, title = the
     appliance, Edit on the right). Keys: fills/tertiary, radius 24, 76 px rows, a 156 px row for the rockers. */
  const view = () => { const r = UI.param('r'); return r === null || r === '' || r === undefined ? -1 : +r; };
  const rem = (d) => d.remotes[view()] || null;
  const K = (l, o = {}) => `<button class="ir-k ${o.cls || ''}" data-action="${o.act || 'ir-send'}" data-l="${esc(l)}" aria-label="${esc(o.aria || l)}">${o.ic ? icon(o.ic, 'icon', `style="width:${o.s || 32}px;height:${o.s || 32}px"`) : ''}${o.text ? `<span>${esc(o.text)}</span>` : ''}</button>`;
  const rocker = (label, up, down, upIc, downIc) => `<div class="ir-k ir-rk"><button data-action="ir-send" data-l="${esc(up)}" aria-label="${esc(up)}">${icon(upIc, 'icon', 'style="width:24px;height:24px"')}</button><span>${esc(label)}</span><button data-action="ir-send" data-l="${esc(down)}" aria-label="${esc(down)}">${icon(downIc, 'icon', 'style="width:24px;height:24px"')}</button></div>`;
  const pair = (a, b) => `<div class="ir-pair">${a}${b}</div>`;
  const nums = (d) => (d.sim.nums ? `<div class="ir-r ir-nums">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, ''].map((x) => (x === '' ? '<i></i>' : K(`Number ${x}`, { text: String(x) }))).join('')}</div>` : '');
  function tvPad(d) {
    const dp = (c, l, ic) => `<button class="${c}" data-action="ir-send" data-l="${l}" aria-label="${l}">${icon(ic, 'icon', 'style="width:24px;height:24px"')}</button>`;
    return `<div class="ir-dpad">${dp('u', 'Up', 'ir-chev-up')}${dp('l', 'Left', 'ir-chev-left')}${dp('r', 'Right', 'ir-chev-right')}${dp('d', 'Down', 'ir-chev-down')}<button class="ok" data-action="ir-send" data-l="OK">OK</button></div>
      <div class="ir-keys">
        <div class="ir-r">${K('Source', { ic: 'ir-source' })}<i></i>${K('Power', { ic: 'ir-power', cls: 'pw' })}</div>
        <div class="ir-r tall">${rocker('Volume', 'Volume up', 'Volume down', 'ir-plus', 'ir-minus')}${pair(K('Mute', { ic: 'ir-mute', s: 24 }), K('Settings', { ic: 'ir-setting', s: 24 }))}${rocker('Channel', 'Channel up', 'Channel down', 'ir-chev-up', 'ir-chev-down')}</div>
        <div class="ir-r">${K('Back', { ic: 'ir-back', cls: 'flip' })}${K('Numbers', { ic: 'ir-numpad', act: 'ir-num', cls: d.sim.nums ? 'on' : '' })}${K('Home', { ic: 'ir-home' })}</div>
        ${nums(d)}</div>`;
  }
  /** A universal AC remote for old air conditioners: buttons only. The AC answers nothing — Swing starts or stops the
      flap, Mode goes to the next mode — so the app shows no temperature or state, only what it sent. */
  function acKeys() {
    return `<div class="ir-keys">
      <div class="ir-r">${K('Power', { ic: 'ir-power', cls: 'pw' })}${K('Mode', { text: 'Mode' })}${K('Fan speed', { text: 'Fan speed' })}</div>
      <div class="ir-r tall">${rocker('Temperature', 'Warmer', 'Cooler', 'ir-plus', 'ir-minus')}${pair(K('Swing', { text: 'Swing' }), K('Air direction', { text: 'Direction' }))}${pair(K('Timer', { text: 'Timer' }), K('Sleep', { text: 'Sleep' }))}</div>
      <div class="ir-r">${K('Turbo', { text: 'Turbo' })}${K('Display light', { text: 'Light' })}${K('Eco', { text: 'Eco' })}</div></div>
      <p class="ir-note">Old air conditioners don’t answer back — each button only sends its signal. Look at the AC to see what changed.</p>`;
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
  const OTHER = { box: ['Home', 'Back', 'OK', 'Play / Pause', 'Volume +', 'Volume −'], projector: ['Source', 'Focus +', 'Focus −', 'Volume +', 'Volume −'], soundbar: ['Volume +', 'Volume −', 'Mute', 'Bass', 'Input'], fan: ['Speed', 'Swing', 'Timer', 'Light'], heater: ['Warmer', 'Cooler', 'Timer'], purifier: ['Speed', 'Auto', 'Night'], strip: ['Brighter', 'Dimmer', 'Red', 'Green', 'Blue', 'White'], vacuum: ['Start', 'Pause', 'Go home', 'Spot clean'] };
  function keysPad(d, r) {
    const btns = r.kind === 'custom' ? (r.buttons || []) : (OTHER[r.kind] || []).concat(r.extra || []);
    const power = r.kind === 'custom' || r.kind === 'vacuum' ? '' : K('Power', { ic: 'ir-power', cls: 'pw' });
    const learn = has(d, 'learn') || r.kind === 'custom' ? `<button class="ir-k ir-learnk" data-action="ir-learn">${icon('plus', 'icon', 'style="width:24px;height:24px"')}<span>Learn a button</span></button>` : '';
    return `<div class="ir-keys"><div class="ir-r ir-flow">${power}${btns.map((l) => K(l, { text: l })).join('')}${learn}</div></div>
      ${r.kind === 'custom' && !btns.length ? '<p class="ir-note">No buttons yet — tap “Learn a button” and press the button on the original remote.</p>' : ''}`;
  }

  /* ---------- Device page ---------- */
  /** On a remote's page: what was last sent to THIS appliance; on the blaster's page: the last code of any remote. */
  function headText(d) {
    if (!has(d, 'lastSent') && !has(d, 'acBuiltIn')) return 'Ready';
    const r = rem(d); if (!r) return lastLine(d);
    return r.last ? `Sent “${r.last.label}” · ${when(r.last.t)}` : 'Nothing sent yet';
  }
  function head(d) {
    const blink = d.st.blink && Date.now() - d.st.blink < 1200;
    return `<div class="pad ir-head" data-key="head"><span class="ir-led ${blink ? 'on' : ''}" aria-hidden="true"></span><span class="cw-state" data-num data-live="sub">${esc(headText(d))}</span></div>`;
  }
  function page(d) {
    const st = d.st, r = rem(d);
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}`);
    if (has(d, 'battery') && d.battery <= 20) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    if (r) {   // one remote
      h += head(d);
      h += `<div class="pad ir-remote" data-key="pad-${view()}-${r.kind}">${r.kind === 'tv' ? tvPad(d) : r.kind === 'ac' ? (r.builtin ? acPanel(d, r) : acKeys()) : keysPad(d, r)}</div>`;
      return h + '<div style="height:28px"></div>';
    }
    // the blaster: its remotes (Figma 5433:46868 “Remote control”)
    if (!d.remotes.length && !has(d, 'irSwitches')) {
      h += `<div class="ir-empty" data-key="empty"><h2>No devices yet</h2><p>Tap “Add a device” to add a device for remote control use</p><button class="btn btn-opposite btn-block" data-action="ir-add">${icon('plus')}Add a device</button></div>`;
      return h;
    }
    h += head(d);
    if (d.remotes.length) h += `<div class="list" data-key="remotes" style="margin-top:16px">${d.remotes.map((x, i) => `<a class="cell has-icon" href="device.html?id=${d.id}&r=${i}"><span class="cell-icon">${icon(kindOf(x.kind)[2])}</span><span class="cell-main"><span class="cell-title" style="display:block">${esc(x.name)}</span><span class="cell-sub" style="display:block">${esc(x.brand ? `${x.brand}${x.kind === 'ac' && !x.builtin ? ' · buttons only' : ''}` : `${(x.buttons || []).length} learned buttons`)}</span></span>${icon('chevron-right', 'chev')}</a>`).join('')}</div>`;
    if (has(d, 'brandSetup') || has(d, 'appliances') || has(d, 'tvRemote')) h += `<div class="pad" data-key="add" style="margin-top:16px"><button class="btn btn-glass btn-block" data-action="ir-add">${icon('plus')}Add a device</button></div>`;
    if (has(d, 'irSwitches')) h += `<div class="list-header" data-key="sw-h">Switches</div><div class="list" data-key="sw">${d.sw.map((x, i) => x.learned ? Kit.sw('ir-sw', i, x.name, x.on ? 'Sent “on”' : 'Sent “off”', x.on) : `<button class="cell" data-action="ir-sw-learn" data-i="${i}"><span class="cell-main"><span class="cell-title" style="display:block">${esc(x.name)}</span><span class="cell-sub" style="display:block">Not learned yet</span></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`;
    h += Kit.cards([
      has(d, 'climateSensor') && ['Room temperature', fmtT(d, roomT(d)), { count: true }],
      has(d, 'climateSensor') && ['Humidity', `${Math.round(st.h + (has(d, 'calibration') ? S(d, 'calibration').h : 0))} %`, { count: true }],
      has(d, 'battery') && ['Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    return h + '<div style="height:28px"></div>';
  }
  function toolbar(d) {
    const r = rem(d); if (!r) return null;
    return { title: r.name, subtitle: Store.roomName(d.roomId), back: `device.html?id=${d.id}`, right: '<button class="glass-btn txt" data-action="ir-edit">Edit</button>' };
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
  function openAdd(d, ctx) {
    let step = 'kind', kind = null, brand = null, code = 1;
    const kinds = () => KINDS.filter((k) => has(d, k[3]) || (k[0] === 'ac' && has(d, 'acBuiltIn')));
    const s = UI.sheet({
      title: 'Add a remote', sub: 'Pick the appliance, then its brand',
      render: () => {
        if (step === 'kind') return `<div class="ip-list" style="padding-top:8px"><section class="ip-group" style="padding-top:0"><div class="ip-grid labeled">${kinds().map(([k, l, ic]) => `<button data-action="ir-k" data-k="${k}">${icon(ic, 'icon', 'style="width:32px;height:32px"')}<span>${esc(l)}</span></button>`).join('')}</div></section></div>`;
        if (step === 'brand') return `<div class="list">${(BRANDS[kind] || BRANDS.other).map((b) => `<button class="cell" data-action="ir-brand" data-b="${b}"><span class="cell-main cell-title">${b}</span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`;
        return `<div class="ir-learn"><span class="ir-led big on"></span><b>Press Power — did the ${esc(kindOf(kind)[1].toLowerCase())} react?</b><span>${esc(brand)} · code set ${code} of 5</span></div>
          <div class="pad"><button class="btn btn-glass btn-block" data-action="ir-try">${icon('power')} Send Power again</button></div>`;
      },
      footer: () => (step === 'test' ? '<div class="wz-row" style="margin:0"><button class="btn btn-glass" data-action="ir-no">No, try next</button><button class="btn btn-primary" data-action="ir-yes">Yes, it reacted</button></div>' : ''),
    });
    UI.on({
      'ir-k': ({ k }) => { kind = k; if (k === 'custom') { d.remotes.push({ kind: 'custom', brand: '', name: 'Custom', buttons: [] }); Store.save(); UI.closeSheet(); location.href = `device.html?id=${d.id}&r=${d.remotes.length - 1}`; return; } step = 'brand'; s.refresh(); },
      'ir-brand': ({ b }) => { brand = b; step = 'test'; send(d, null, 'Power (test)'); s.refresh(); },
      'ir-try': () => { send(d, null, 'Power (test)'); s.refresh(); },
      'ir-no': () => { code = code % 5 + 1; send(d, null, 'Power (test)'); s.refresh(); },
      'ir-yes': () => { const k = kindOf(kind); const r = { kind, brand, name: k[1], code }; if (kind === 'ac' && has(d, 'acBuiltIn')) { r.ac = acState(); r.builtin = true; } d.remotes.push(r); Kit.logEv(d, 'added', { text: `Added ${brand} ${k[1]}` }); Store.save(); UI.closeSheet(); UI.flash(`${brand} ${k[1].toLowerCase()} remote added`); location.href = `device.html?id=${d.id}&r=${d.remotes.length - 1}`; },
    });
  }
  function openEdit(d, ctx) {
    const r = rem(d), i = view();
    UI.sheet({
      title: `Edit ${r.name}`, sub: r.brand ? `${r.brand} codes` : 'Learned buttons',
      render: () => `<div class="list"><button class="cell" data-action="ir-rename"><span class="cell-main cell-title">Name</span><span class="cell-value">${esc(r.name)}</span>${icon('chevron-right', 'chev')}</button>
        ${has(d, 'learn') && r.kind !== 'ac' ? `<button class="cell" data-action="ir-learn"><span class="cell-main cell-title">Learn a button</span>${icon('chevron-right', 'chev')}</button>` : ''}</div>
        <div class="pad" style="margin-top:24px"><button class="btn btn-danger btn-block" data-action="ir-remove">Remove this remote</button></div>`,
    });
    UI.on({
      'ir-rename': () => UI.prompt({ title: 'Name', label: 'e.g. Bedroom TV', value: r.name, onOk: (v) => { r.name = v; Store.save(); UI.closeSheet(); ctx.render(); } }),
      'ir-remove': () => UI.confirm({ title: `Remove ${r.name}?`, text: 'Its buttons are deleted from the app.', ok: 'Remove', onOk: () => { d.remotes.splice(i, 1); Store.save(); UI.flash(`${r.name} removed`); location.href = `device.html?id=${d.id}`; } }),
    });
  }
  function bindPage(d, ctx) {
    const commit = () => { Store.save(); ctx.render(); };
    UI.on({
      'ir-add': () => openAdd(d, ctx),
      'ir-edit': () => openEdit(d, ctx),
      'ir-send': ({ l }) => { if (send(d, rem(d), l)) commit(); },
      'ir-num': () => { d.sim.nums = !d.sim.nums; commit(); },
      'ir-learn': () => openLearn(d, ctx, (v) => { const r = rem(d); if (r.kind === 'custom') (r.buttons = r.buttons || []).push(v); else (r.extra = r.extra || []).push(v); }),
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
      <div class="pp-row">${Kit.ppBtn('pp-orig', '📺 Someone uses the original remote')}${Kit.ppBtn('pp-learnkey', '🔴 Press a key on the original remote', has(d, 'learn'))}</div>
      <div class="pp-row">${Kit.ppBtn('pp-hot', '🌡 Room 29 °C', has(d, 'climateSensor'))}${Kit.ppBtn('pp-batt', d.battery <= 20 ? '🔋 New batteries' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-orig': () => 'The TV changed — but IR is one-way, so the app still shows what IT last sent. That is normal.',
      'pp-learnkey': () => { if (d.sim.learnHook && UI.sheetOpen) { d.sim.learnHook(); return; } return 'Open “Learn a button” first'; },
      'pp-hot': () => { d.st.t = d.st.t > 28 ? 24.5 : 29.2; },
      'pp-batt': () => { d.battery = d.battery <= 20 ? 100 : 12; },
      'pp-online': () => { d.online = !d.online; if (d.online) d.st.lastSeen = Date.now(); },
    }, (dd, p) => seedRemotes(dd, p));
  }

  return {
    label: 'IR remote', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'IR remote',
    icon: () => 'dev-remote', describe: (p) => `${p.manufacturer} · IR blaster`,
    historyValue: (d) => `${d.log.length} codes sent`,
    homeTiles, page, toolbar, bindPage, live, settings, bindSettings, about, tick, busy: (d) => !!d.st.blink,
    protoPanel, bindProto,
  };
})();
