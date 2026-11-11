/* Smart plug (makeSwitch with the plug catalogue): what is plugged in drives the watts, the timer flips the state,
   metering-only, overload / voltage trip + turn back on, finished-charging auto-off, power alerts (server),
   auto-on inching, strips, energy history + reset, settings per plug. The relay must be unaffected (relay checks).
   node tools/checks/plug.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/plug.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  const make = (preset, id) => ev(([preset, id]) => { const d = Devices.plug.create(preset, { name: 'Test ' + preset, roomId: 'r-living' }); d.id = id; d.isNew = false; Store.state.devices.push(d); Store.save(); }, [preset, id]);
  const D = (id) => ev((id) => JSON.parse(JSON.stringify(Store.device(id))), id);
  const check = (id) => ev((id) => { const d = Store.device(id); Devices.plug._plugChecks(d); Store.save(); }, id);
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(400);

  let s = await ev(() => document.querySelector('.tile[data-id="d-plug"] .tile-status').textContent.trim());
  ok('Home: the washing machine plug, "Off"', s === 'Off', s);
  const n0 = await ev(() => Store.state.notifications);
  await pg.goto(root + 'device.html?id=d-plug'); await sl(400);
  await click('[data-action="relay-toggle"]'); await sl(1600);
  s = await ev(() => ({ w: document.querySelector('[data-live="w"]').textContent, n: Store.state.notifications, cards: [...document.querySelectorAll('.info-card span')].map((x) => x.textContent).join(',') }));
  ok('On: the washer draws 2000 W; Third Reality shows frequency + power factor', /^2000W$/.test(s.w) && /Frequency/.test(s.cards) && /Power factor/.test(s.cards), JSON.stringify(s));
  ok('Power alert (server): "something started" push when it jumps by 500 W+', s.n === n0 + 1, `${n0} → ${s.n}`);

  // timer flips the state: on → "Turn off in", off → "Turn on in"
  await click('[data-action="relay-toggle"]'); await sl(300);
  await click('[data-action="relay-timer"]'); await sl(500);
  s = await ev(() => document.querySelector('.sheet.open .list-header, #sheet.open .list-header').textContent);
  ok('Timer on an OFF plug offers "Turn on in…"', s === 'Turn on in', s);
  await click('[data-action="tm-set"][data-s="300"]'); await sl(400);
  s = await ev(() => document.querySelector('.ring-timer .t span').textContent);
  await ev(() => UI.closeSheet()); await sl(300);
  const row = await ev(() => document.querySelector('[data-live="timer"]').textContent);
  ok('Timer started: ring says "until on", the row "On in 5:00"', s === 'until on' && /^On in (4:5\d|5:00)$/.test(row), `${s} | ${row}`);
  await ev(() => { const d = Store.device('d-plug'); d.channels[0].timer.end = Date.now() - 1; Devices.plug.tick(d); Store.save(); });
  ok('When it fires, the plug turns ON', (await D('d-plug')).channels[0].on === true);

  // metering only
  await ev(() => { const d = Store.device('d-plug'); d.settings.meterOnly[0] = true; Store.save(); });
  await pg.goto(root + 'device.html?id=d-plug'); await sl(300);
  await click('[data-action="relay-toggle"]'); await sl(300);
  s = await ev(() => ({ on: Store.device('d-plug').channels[0].on, toast: (document.querySelector('.toast') || {}).textContent || '', sub: document.querySelector('[data-live="ch0"]').textContent }));
  ok('Metering only: cannot be switched off, says so', s.on && /Metering only/.test(s.toast) && /always on/.test(s.sub), JSON.stringify(s));
  await ev(() => { const d = Store.device('d-plug'); d.settings.meterOnly[0] = false; d.channels[0].on = false; Store.save(); });

  // overload: a 2500 W heater on a 2300 W limit
  await make('all', 'd-pa'); const n1 = await ev(() => Store.state.notifications);
  await pg.goto(root + 'device.html?id=d-pa'); await sl(300);
  await click('[data-action="relay-toggle"][data-ch="0"]'); await check('d-pa'); await pg.goto(root + 'device.html?id=d-pa'); await sl(300);
  s = await ev(() => ({ ban: (document.querySelector('[data-key="ban-trip"]') || {}).textContent || '', tile: document.querySelector('[data-live="ch0"]').textContent, n: Store.state.notifications }));
  ok('Overload: off for safety, banner with the reason, tile "Safety off", push', /2500 W is above the 2300 W limit/.test(s.ban) && s.tile === 'Safety off' && s.n > n1, JSON.stringify(s));
  await ev(() => { Store.device('d-pa').app[0] = 'tv'; Store.save(); });
  await click('[data-action="plug-reon"]'); await sl(300);
  s = await ev(() => ({ trip: Store.device('d-pa').trip, on: Store.device('d-pa').channels[0].on, ban: !!document.querySelector('[data-key="ban-trip"]') }));
  ok('"Turn back on" clears the trip (a smaller load now)', !s.trip && s.on && !s.ban, JSON.stringify(s));
  // too hot banner
  await ev(() => { const d = Store.device('d-pa'); d.temp = 76; Store.save(); });   // the plug reports 76 °C
  await pg.goto(root + 'device.html?id=d-pa'); await sl(300);
  ok('Plug above 70 °C: red banner', await ev(() => !!document.querySelector('[data-key="ban-hot"]')));

  // SONOFF: voltage spike trips; auto-on inching
  await make('sonoff', 'd-ps'); await ev(() => { Store.device('d-ps').app[0] = 'tv'; Store.save(); });
  await pg.goto(root + 'device.html?id=d-ps'); await sl(300);
  await click('[data-action="relay-toggle"]'); await click('[data-action="pp-volt"]'); await check('d-ps');
  s = await D('d-ps');
  ok('SONOFF: voltage 262 V > 250 V → off for safety', /Voltage 262 V is above 250 V/.test(s.trip) && !s.channels[0].on, s.trip);
  await ev(() => { const d = Store.device('d-ps'); d.volt = 230; d.trip = ''; d.settings.inching[0] = { on: true, sec: 5, mode: 'on' }; Store.save(); });
  s = await ev(() => { const d = Store.device('d-ps'), P = Devices.plug; P.toggle(d, 0); P.toggle(d, 0); const t = d.channels[0].timer; d.channels[0].timer.end = Date.now() - 1; P.tick(d); return { to: t && t.to, on: d.channels[0].on }; });
  ok('Auto-on (inching mode "turn on again"): off → on by itself', s.to === true && s.on === true, JSON.stringify(s));
  await pg.goto(root + 'device-settings.html?id=d-ps'); await sl(300);
  await click('[data-action="rs-feature"][data-k="overload"]'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('[data-action="rf-ov"][data-d="1"]')].map((x) => x.dataset.x).join(','));
  ok('SONOFF overload sheet: power, current, voltage max / min', s === 'maxW,maxA,maxV,minV', s);
  await ev(() => UI.closeSheet()); await sl(300);

  // Aqara: only max power; fixed auto-off; finished charging turns it off
  await make('aqara', 'd-pq');
  await pg.goto(root + 'device-settings.html?id=d-pq'); await sl(300);
  await click('[data-action="rs-feature"][data-k="overload"]'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('[data-action="rf-ov"][data-d="1"]')].map((x) => x.dataset.x).join(','));
  ok('Aqara overload sheet: only max power', s === 'maxW', s);
  await ev(() => UI.closeSheet()); await sl(300);
  await click('[data-action="rs-feature"][data-k="autoOff"]'); await sl(400);
  s = await ev(() => document.querySelector('.sheet.open, #sheet.open').textContent);
  ok('Aqara auto-off: fixed 2 W / 20 min note', /below 2 W for 20 minutes \(fixed\)/.test(s));
  await ev(() => UI.closeSheet()); await sl(300);
  s = await ev(() => { const d = Store.device('d-pq'), P = Devices.plug; d.settings.autoOff.on = true; P.toggle(d, 0); d.channels[0].since = Date.now() - 600000; d.lowSince = [Date.now() - 21 * 60000]; P._plugChecks(d); Store.save(); return { on: d.channels[0].on, log: (d.log[0] || {}).text }; });
  ok('Charger finished (below 2 W for 20 min) → turns off by itself', s.on === false && /finished/.test(s.log), JSON.stringify(s));
  await pg.goto(root + 'device.html?id=d-pq'); await sl(300);
  s = await ev(() => [...document.querySelectorAll('.info-card')].map((x) => x.textContent.trim()).find((t) => /plugged in/.test(t)) || '');
  ok('Aqara: "Something plugged in · Yes"', /Something plugged in\s*Yes/.test(s), s);

  // power strip
  await make('strip', 'd-pr');
  await pg.goto(root + 'device.html?id=d-pr'); await sl(300);
  s = await ev(() => ({ tiles: document.querySelectorAll('.channel-grid .tile').length, all: (document.querySelector('.all-action') || {}).textContent || '' }));
  ok('Strip: 5 socket tiles and "Turn on all sockets"', s.tiles === 5 && /Turn on all sockets/.test(s.all), JSON.stringify(s));

  // history + reset (all-features plug)
  await pg.goto(root + 'device-settings.html?id=d-pa'); await sl(300);
  s = await ev(() => [...document.querySelectorAll('.list-header')].map((x) => x.textContent).join(','));
  ok('All-features settings: … Safety, Output, Button & lights, Notifications, Energy', /Power cut,Safety,Output,Button & lights,Notifications,Energy/.test(s), s);
  await click('[data-action="rs-history"]'); await sl(500);
  s = await ev(() => ({ bars: document.querySelectorAll('.pl-bar').length, ev: [...document.querySelectorAll('.sheet.open .cell-title, #sheet.open .cell-title')].map((x) => x.textContent).join(' | ') }));
  ok('Event History: 8 day bars (7 + today) and the safety trip in events', s.bars === 8 && /Turned off for safety/.test(s.ev), JSON.stringify(s).slice(0, 160));
  await ev(() => UI.closeSheet()); await sl(300);
  await click('[data-action="pe-reset"]'); await sl(300);
  await ev(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Reset'); b && b.click(); }); await sl(300);
  ok('Reset energy counter (with a confirm): 0 kWh', (await D('d-pa')).energy === 0);

  for (const u of ['index.html', 'about-device.html?id=d-plug', 'add-device.html?via=zigbee', 'device.html?id=d-light']) { await pg.goto(root + u); await sl(400); }
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
