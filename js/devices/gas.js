/* ==========================================================================
   Gas & CO detector — device interface (spec: Device Interface 3 / 17. Gas_CO_Detector_Interface.html)
   Like the smoke detector: the sensor mark (gray clear · orange a little · red alarm), the big word, and while it
   rings Silence + Call 104 (gas emergency service). With gas the first rule is "don't switch anything" — a spark
   can ignite it — so the page shows three plain steps instead of a banner that repeats the word.
   ========================================================================== */
Devices.gas = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    gas: { name: 'Gas leak alarm', grp: 'Device page', short: 'Sounds its siren when it smells natural gas or propane' },
    co: { name: 'Carbon monoxide alarm', grp: 'Device page', short: 'CO from a boiler, gas water heater or stove burning badly' },
    level: { name: 'Gas / CO level', grp: 'Device page', short: 'How much gas (%LEL) or CO (ppm), and an early warning' },
    preheat: { name: 'Warming up', grp: 'Device page', short: 'After power-on the sensor needs a few minutes to heat up' },
    test: { name: 'Test the alarm', grp: 'Device page', short: 'Siren, light, and that the app receives it — once a month' },
    silence: { name: 'Silence the siren', grp: 'Device page', short: 'Stops the siren; the alarm stays until the air is clean' },
    battery: { name: 'Battery / power', grp: 'Device page', short: 'Gas detectors plug in; CO alarms often run on batteries' },
    fault: { name: 'Fault', grp: 'Device page', short: 'Sensor, probe or power failed' },
    endOfLife: { name: 'End of sensor life', grp: 'Device page', short: 'Gas and CO sensors wear out after about 5 years' },
    tamper: { name: 'Tamper', grp: 'Device page', short: 'Opened or taken off the wall' },
    mount: { name: 'Where to mount it', grp: 'Setup', type: 'choice', app: true, def: 'natural', short: 'Natural gas rises, propane sinks, CO mixes with the air',
      opts: [['natural', 'Natural gas (methane)', 'High — 10–30 cm below the ceiling'], ['lpg', 'Propane / LPG (balloon)', 'Low — 10–30 cm above the floor'], ['co', 'Carbon monoxide', 'At breathing height or on the ceiling']],
      sheet: (d, v) => `${mountPic(v)}<div class="list">${Kit.radio('kt-opt', v, F.mount.opts)}</div><div class="list-footer">1–4 m from the stove or boiler — not right above it, not next to a window.</div>` },
    sensitivity: { name: 'Alarm level', grp: 'Setup', type: 'choice', def: '10', opts: [['10', '10 %LEL / 50 ppm', 'Earlier — more sensitive'], ['15', '15 %LEL / 100 ppm', 'Later — fewer false alarms']], short: 'At how much gas or CO the alarm sounds' },
    sound: { name: 'Siren', grp: 'Detector', type: 'fields', def: { tone: 'melody_1', time: 60, auto: true }, short: 'Ringtone, how long it sounds, home siren',
      fields: [{ id: 'time', label: 'Sounds for', unit: 's', min: 10, max: 180, step: 10 }, { id: 'auto', kind: 'tog', label: 'Use as a siren for other home alarms' }, { id: 'tone', kind: 'sel', label: 'Ringtone', opts: [['melody_1', 'Melody 1'], ['melody_2', 'Melody 2'], ['melody_3', 'Melody 3']] }] },
    extra: { name: 'Temperature & heartbeat light', grp: 'Detector', short: 'Room temperature and a blink that shows it is alive', hidden: true },
    notify: { name: 'Gas & CO notifications', grp: 'Notifications', type: 'fields', app: true, def: { all: true, critical: true, family: true, pre: true, service: true }, short: 'Gas / CO always notifies at least the owner',
      fields: [{ id: 'all', kind: 'tog', label: 'Everyone in this home' }, { id: 'critical', kind: 'tog', label: 'Critical alert', hint: 'Rings even on silent phones' }, { id: 'family', kind: 'tog', label: 'Family outside the home' }, { id: 'pre', kind: 'tog', label: 'Early warning (a little gas)' }, { id: 'service', kind: 'tog', label: 'Fault, end of life, battery' }], foot: 'Gas and CO always notify the owner — these only add people and loudness.' },
    actions: { name: 'When gas or CO is detected', grp: 'Automation', type: 'fields', app: true, def: { valve: true, boiler: true, sirens: true, noSwitch: true }, short: 'Close the gas valve, boiler off, sirens — and don’t switch lights',
      fields: [{ id: 'valve', kind: 'tog', label: 'Close the gas valve' }, { id: 'boiler', kind: 'tog', label: 'Switch the boiler off (CO)' }, { id: 'sirens', kind: 'tog', label: 'Sound the other sirens' }, { id: 'noSwitch', kind: 'tog', label: 'Don’t switch any lights', hint: 'A spark in a switch can ignite gas' }] },
    interconnect: { name: 'Interconnected alarms', grp: 'Automation', type: 'toggle', app: true, def: true, short: 'When one detector alarms, the others sound too' },
    history: { name: 'Alarm & test history', grp: 'Log', app: true, short: 'Every alarm, pre-alarm and test' },
  };
  const GROUPS = ['Device page', 'Setup', 'Detector', 'Notifications', 'Automation', 'Log'];
  const PRESETS = [
    { id: 'aqara', name: 'Aqara natural gas detector', model: 'JT-BZ-01AQ/A', manufacturer: 'Aqara', feats: ['gas', 'level', 'preheat', 'test', 'silence', 'mount', 'sensitivity', 'notify', 'actions', 'history', 'interconnect'], v: { mount: 'natural' } },
    { id: 'heiman', name: 'Heiman combustible gas sensor', model: 'HS1CG', manufacturer: 'Heiman', feats: ['gas', 'tamper', 'mount', 'notify', 'actions', 'history'] },
    { id: 'tuya', name: 'Tuya gas sensor with level', model: 'TS0601_gas_sensor_2', manufacturer: 'Tuya', feats: ['gas', 'level', 'preheat', 'test', 'silence', 'mount', 'notify', 'actions', 'history', 'sound'] },
    { id: 'combo', name: 'Tuya gas + CO detector', model: 'JKD-816COM-Z', manufacturer: 'Tuya', feats: ['gas', 'co', 'level', 'test', 'silence', 'fault', 'mount', 'notify', 'actions', 'history'] },
    { id: 'heimanco', name: 'Heiman CO alarm', model: 'HS1CA-E-PLUS', manufacturer: 'Heiman', feats: ['co', 'level', 'preheat', 'test', 'silence', 'battery', 'fault', 'endOfLife', 'mount', 'notify', 'actions', 'history', 'sound', 'interconnect', 'extra'], v: { mount: 'co' } },
    { id: 'nous', name: 'Nous CO alarm', model: 'E12', manufacturer: 'Nous', feats: ['co', 'level', 'preheat', 'test', 'battery', 'fault', 'endOfLife', 'mount', 'notify', 'actions', 'history'], v: { mount: 'co' } },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];
  const isCO = (d) => has(d, 'co') && !has(d, 'gas');

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const d = Kit.base('gas', p, Object.assign({ name: 'Gas detector' }, opts), {
      battery: 90, temp: 23,
      st: { state: 'clear', lel: 0, ppm: 0, at: now - 4 * 86400000, lastSeen: now - 180000, hushUntil: 0, testUntil: 0, testOkUntil: 0, lastTest: now - 12 * 86400000, heatUntil: 0, fault: false, eol: false, tamper: false },
      phys: { lel: 0, ppm: 0, fading: false }, life: new Date(now + 4.2 * 365 * 86400000).getFullYear(),
    });
    d.log = [{ t: d.st.lastTest, k: 'test' }];
    Kit.applyDefaults(F, d); if (p.v) Object.assign(d.settings, Kit.clone(p.v));
    return d;
  }
  const applyDefaults = (d) => Kit.applyDefaults(F, d);
  const lim = (d) => (has(d, 'sensitivity') && S(d, 'sensitivity') === '15' ? { lel: 15, ppm: 100 } : { lel: 10, ppm: 50 });
  const heating = (d) => d.st.heatUntil > Date.now();
  const testing = (d) => d.st.testUntil > Date.now();
  const hushed = (d) => d.st.hushUntil > Date.now();
  const alarm = (d) => ['gas', 'co'].includes(d.st.state);
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;

  function evaluate(d) {
    const st = d.st, P = d.phys, L = lim(d);
    if (!d.online || heating(d)) return false;
    st.lel = has(d, 'gas') ? Math.round(P.lel * 10) / 10 : 0; st.ppm = has(d, 'co') ? Math.round(P.ppm) : 0;
    const next = st.lel >= L.lel ? 'gas' : st.ppm >= L.ppm ? 'co' : has(d, 'level') && (st.lel >= L.lel / 2 || st.ppm >= L.ppm * 0.6) ? 'pre' : 'clear';
    if (next === st.state) return false;
    st.state = next; st.at = Date.now(); st.lastSeen = Date.now();
    Kit.logEv(d, next);
    if (next === 'pre' && S(d, 'notify').pre) Kit.push(`A little ${st.lel ? 'gas' : 'CO'} · ${d.name}`, `${Kit.room(d)} — open a window`, 'warn');
    if (next === 'gas' || next === 'co') {
      st.hushUntil = 0;
      Kit.push(`${next === 'gas' ? 'Gas leak' : 'Carbon monoxide'}! · ${d.name}`, `${Kit.room(d)} — don’t switch lights, open windows, leave, call 104`, 'danger');
      if (has(d, 'actions')) {
        const a = S(d, 'actions'), done = [];
        if (a.valve) { const vs = Store.state.devices.filter((x) => x.type === 'valve' && Devices.valve && Devices.valve.linkable(x, 'gas')); vs.forEach((v) => Devices.valve.alarmClose(v, `gas alarm · ${d.name}`)); if (vs.length) done.push('gas valve closed'); }
        if (a.boiler && next === 'co') done.push('boiler off');
        if (a.sirens) done.push('sirens on');
        if (done.length) Kit.logEv(d, 'scene', { text: 'Safety scenario: ' + done.join(', ') });
      }
      if (has(d, 'interconnect') && S(d, 'interconnect')) Kit.logEv(d, 'linked');
    }
    return true;
  }
  function tick(d) {
    const now = Date.now(), P = d.phys; let ch = false;
    if (P.fading && (P.lel > 0 || P.ppm > 0)) { P.lel = Math.max(0, P.lel * 0.8 - 0.2); P.ppm = Math.max(0, P.ppm * 0.82 - 2); ch = true; }
    if (d.st.heatUntil && now >= d.st.heatUntil) { d.st.heatUntil = 0; Kit.logEv(d, 'ready'); ch = true; }
    if (d.st.testUntil && now >= d.st.testUntil) { d.st.testUntil = 0; d.st.testOkUntil = now + 5000; d.st.lastTest = now; Kit.logEv(d, 'test'); ch = true; }
    if (d.st.testOkUntil && now >= d.st.testOkUntil) { d.st.testOkUntil = 0; ch = true; }
    if (evaluate(d)) ch = true;
    return ch;
  }

  /* ---------- Text ---------- */
  function word(d) {
    if (!d.online) return 'Unknown';
    if (heating(d)) return 'Warming up';
    if (testing(d)) return 'Testing…';
    return { gas: 'Gas!', co: 'CO!', pre: d.st.lel ? 'A little gas' : 'A little CO', clear: 'Clear' }[d.st.state];
  }
  const tone = (d) => (!d.online ? '' : alarm(d) ? 'alarm' : d.st.state === 'pre' || testing(d) ? 'open' : heating(d) ? 'on' : 'closed');
  function subText(d) {
    const st = d.st;
    if (!d.online) return `Last report ${when(st.lastSeen)}`;
    if (heating(d)) return `Ready in ${Math.ceil((st.heatUntil - Date.now()) / 1000)} s — it can’t smell anything yet`;
    if (testing(d)) return 'The siren sounds for a few seconds';
    if (alarm(d)) return `${Kit.room(d)} · since ${when(st.at)} · ${hushed(d) ? 'siren silenced' : 'the siren is sounding'}`;
    if (st.state === 'pre') return `${Kit.room(d)} · open a window — not an alarm yet`;
    return `Checked ${ago(Date.now() - st.lastSeen)}`;
  }
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (alarm(d)) return { text: word(d), tone: 'danger' };
    if (d.st.state === 'pre') return { text: word(d), tone: 'warn' };
    if (d.st.fault) return { text: 'Fault', tone: 'warn' };
    if (d.st.eol) return { text: 'Replace it', tone: 'warn' };
    if (battLow(d)) return { text: 'Battery low', tone: 'warn' };
    return { text: heating(d) ? 'Warming up' : 'Clear' };
  }
  const icon0 = (d) => (isCO(d) ? 'dev-air' : 'dev-flame');
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: icon0(d), on: false, status: s.text, tone: s.tone, alert: d.online && alarm(d), controllable: false, offline: !d.online }]; };

  /* ---------- Device page ---------- */
  function mountPic(v) {
    const y = v === 'natural' ? 26 : v === 'lpg' ? 112 : 68;
    return `<div class="gs-mount" aria-hidden="true"><svg viewBox="0 0 200 140"><rect x="24" y="10" width="152" height="120" rx="6" class="w"/><line x1="24" y1="10" x2="176" y2="10" class="c"/><line x1="24" y1="130" x2="176" y2="130" class="c"/>
      <rect x="132" y="98" width="34" height="32" rx="3" class="s"/><circle cx="141" cy="96" r="3" class="s"/><circle cx="157" cy="96" r="3" class="s"/>
      <rect x="40" y="${y - 7}" width="26" height="14" rx="4" class="dt"/><line x1="72" y1="${y}" x2="110" y2="${y}" class="ar"/><text x="114" y="${y + 4}">${v === 'natural' ? 'high' : v === 'lpg' ? 'low' : 'middle'}</text></svg></div>`;
  }
  function page(d) {
    const st = d.st, L = lim(d);
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}. A silent detector protects nobody.`);
    if (st.testOkUntil) h += Kit.banner('ban-test', 'info', 'check', '<b>Test OK</b> · The app received the alarm', 'gs-test-ok');
    if (st.tamper) h += Kit.banner('ban-tamper', 'danger', 'banner-error', '<b>Taken off the wall</b> · Put it back');
    if (st.fault) h += Kit.banner('ban-fault', 'warn', 'banner-error', '<b>Sensor fault</b> · It may not smell gas — replace it');
    if (st.eol) h += Kit.banner('ban-eol', 'warn', 'banner-error', '<b>Sensor worn out</b> · Replace the detector — it is about 5 years old');
    if (battLow(d)) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b>`);
    const state = !d.online ? 'calm' : alarm(d) ? 'alarm' : st.state === 'pre' || testing(d) ? 'warn' : heating(d) ? 'on' : 'calm';
    h += Kit.mark(d, icon0(d), state, `${d.name}: ${word(d)}`);
    h += Kit.readout(word(d), tone(d), subText(d), has(d, 'test') && !alarm(d) && !heating(d) ? `Last test ${when(st.lastTest)}` : '');
    if (d.online && alarm(d)) {
      h += `<div class="pad sm-acts" data-key="acts">${has(d, 'silence') && !hushed(d) ? `<button class="btn btn-opposite" data-action="gs-hush">${icon('bell')}Silence</button>` : ''}<a class="btn btn-opposite" href="tel:104">${icon('phone')}Call 104</a></div>`;
      // what to do — plain steps, not a banner repeating the word
      const steps = st.state === 'gas' ? ['Don’t switch lights or appliances — on or off', 'Open the windows and doors', 'Leave the home and call 104 from outside'] : ['Open the windows', 'Take everyone outside — CO has no smell', 'Call 104 or 103 if someone feels dizzy'];
      h += `<div class="pad" data-key="steps" style="margin-top:16px"><div class="gs-steps">${steps.map((s, i) => `<div><i>${i + 1}</i><span>${esc(s)}</span></div>`).join('')}</div></div>`;
    }
    const cards = [];
    if (has(d, 'level')) {
      const g = has(d, 'gas') && (!has(d, 'co') || st.lel >= st.ppm / 5);
      const v = g ? st.lel : st.ppm, mx = g ? 25 : 200, l = g ? L.lel : L.ppm, z = v >= l ? 'z2' : v >= (g ? l / 2 : l * 0.6) ? 'z1' : '';
      cards.push([g ? 'Gas in the air' : 'Carbon monoxide', d.online && !heating(d) ? (g ? `${v} %LEL` : `${v} ppm`) : '—', { wide: true, count: true, cls: 'sm-level', html: Kit.bar(v / mx, z, [(g ? l / 2 : l * 0.6) / mx, l / mx]) }]);
    }
    if (has(d, 'extra')) cards.push(['Temperature', `${d.temp.toFixed(1)} °C`, { count: true }]);
    if (has(d, 'endOfLife')) cards.push(['Sensor life', st.eol ? 'Replace now' : `until ${d.life}`]);
    if (has(d, 'battery')) cards.push([battLow(d) ? 'Battery · replace soon' : 'Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }]);
    h += Kit.cards(cards);
    h += Kit.actionRows('rows', [
      has(d, 'test') && ['gs-test', 'Test the alarm', 'Once a month · siren, light and the app', !d.online || alarm(d) || testing(d) || heating(d)],
      has(d, 'mount') && ['gs-mount', 'Where to mount it', (F.mount.opts.find((o) => o[0] === S(d, 'mount')) || [])[2] || ''],
    ]);
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) { UI.setNum(root.querySelector('[data-live="sub"]'), subText(d)); }
  function bindPage(d, ctx) {
    UI.on({
      'gs-hush': () => { d.st.hushUntil = Date.now() + 300000; Kit.logEv(d, 'hush'); Store.save(); ctx.render(); UI.toast('Siren silenced — the alarm stays until the air is clean'); },
      'gs-test': () => { if (!d.online || alarm(d) || testing(d) || heating(d)) return; d.st.testUntil = Date.now() + 4000; Store.save(); ctx.render(); },
      'gs-test-ok': () => { d.st.testOkUntil = 0; Store.save(); ctx.render(); },
      'gs-mount': () => Kit.openFeature(F, d, 'mount', ctx),
    });
  }
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d, { foot: { Automation: 'Our hub runs these, even without internet.' } });
  const EV = { gas: 'Gas alarm', co: 'CO alarm', pre: 'Early warning', clear: 'Air clean again', hush: 'Siren silenced', test: 'Test OK', linked: 'Other detectors sounded', ready: 'Warmed up — ready', fault: 'Sensor fault', eol: 'End of sensor life', tamper: 'Taken off the wall', offline: 'Stopped answering' };
  function bindSettings(d, ctx) { Kit.bindSettings(F, d, ctx); UI.on({ 'rs-history': () => Kit.historySheet(d, EV, `Last test ${when(d.st.lastTest)}`) }); }
  const about = (d) => [['Reported state', word(d)], ['Last test', when(d.st.lastTest)], ...(has(d, 'endOfLife') ? [['Replace by', `${d.life}`]] : [])];

  function protoPanel(d) {
    return Kit.protoHead('Gas & CO detector prototype', '17. Gas_CO_Detector_Interface.html', PRESETS, d) + `
      <h3>The room · <span style="font-weight:400">${has(d, 'gas') ? d.phys.lel.toFixed(1) + ' %LEL' : ''}${has(d, 'gas') && has(d, 'co') ? ' · ' : ''}${has(d, 'co') ? Math.round(d.phys.ppm) + ' ppm CO' : ''}</span></h3>
      <div class="pp-row">${Kit.ppBtn('pp-little', '🔥 Burner left on a moment', has(d, 'gas'))}${Kit.ppBtn('pp-leak', '💨 Gas pipe leaks', has(d, 'gas'))}${Kit.ppBtn('pp-co', '🏭 Boiler makes CO', has(d, 'co'))}</div>
      <div class="pp-row">${Kit.ppBtn('pp-air', '🪟 Open the windows (air clears)')}${Kit.ppBtn('pp-power', '🔌 Plug it in again (warm-up)', has(d, 'preheat'))}</div>
      <h3>The detector</h3>
      <div class="pp-row">${Kit.ppBtn('pp-tamper', d.st.tamper ? '📍 Put it back' : '🪜 Take it off', has(d, 'tamper'))}${Kit.ppBtn('pp-fault', d.st.fault ? '🛠 Fixed' : '⚠️ Sensor fault', has(d, 'fault'))}${Kit.ppBtn('pp-eol', d.st.eol ? '🆕 New detector' : '⌛ 5 years later', has(d, 'endOfLife'))}${Kit.ppBtn('pp-batt', battLow(d) ? '🔋 New battery' : '🔋 Battery low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    const svc = (t, b) => { if (S(d, 'notify').service) Kit.push(t, b, 'warn'); };
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-little': () => { Object.assign(d.phys, { lel: 6, fading: false }); },
      'pp-leak': () => { Object.assign(d.phys, { lel: 19, fading: false }); },
      'pp-co': () => { Object.assign(d.phys, { ppm: 140, fading: false }); },
      'pp-air': () => { d.phys.fading = true; return 'The air clears slowly — the detector reports when it is clean'; },
      'pp-power': () => { d.st.heatUntil = Date.now() + 20000; d.st.state = 'clear'; return 'Warming up (20 s here, ~3 min for real)'; },
      'pp-tamper': () => { d.st.tamper = !d.st.tamper; if (d.st.tamper) { Kit.logEv(d, 'tamper'); svc(`${d.name} taken off the wall`, 'Put it back'); } },
      'pp-fault': () => { d.st.fault = !d.st.fault; if (d.st.fault) { Kit.logEv(d, 'fault'); svc(`${d.name}: sensor fault`, 'Replace the detector'); } },
      'pp-eol': () => { d.st.eol = !d.st.eol; if (d.st.eol) { Kit.logEv(d, 'eol'); svc(`${d.name}: replace it`, 'The sensor is worn out'); } else d.life = new Date().getFullYear() + 5; },
      'pp-batt': () => { d.battery = battLow(d) ? 100 : 12; },
      'pp-online': () => { d.online = !d.online; if (!d.online) Kit.logEv(d, 'offline'); else d.st.lastSeen = Date.now(); },
    }, null, evaluate);
  }

  return {
    label: 'Gas & CO detector', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'Gas detector',
    icon: icon0, describe: (p) => `${p.manufacturer} · ${p.feats.includes('gas') ? 'gas' : 'CO'} detector`,
    historyValue: (d) => (has(d, 'history') ? `Last test ${when(d.st.lastTest)}` : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick, busy: (d) => d.phys.fading || testing(d) || heating(d),
    protoPanel, bindProto, _evaluate: evaluate,
  };
})();
