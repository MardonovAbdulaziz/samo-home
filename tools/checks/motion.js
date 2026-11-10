/* Motion sensor (PIR): motion / no motion, "Lights on motion" switches a real light (dark only), rest time,
   sensitivity vs a cat, sitting still, notifications only when away, detection off, tamper, settings per sensor.
   node tools/checks/motion.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/motion.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  const M = () => ev(() => JSON.parse(JSON.stringify(Store.device('d-motion'))));
  const lampOn = () => ev(() => Store.device('d-light').channels[0].on);
  const settle = () => ev(() => { const d = Store.device('d-motion'), now = Date.now(); if (d.st.clearAt) d.st.clearAt = now - 1; d.st.restUntil = Math.min(d.st.restUntil, now - 1); Devices.motion.tick(d); if (d.st.offAt) d.st.offAt = now - 1; Devices.motion.tick(d); Store.save(); });
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(400);

  let s = await ev(() => document.querySelector('.tile[data-id="d-motion"] .tile-status').textContent.trim());
  ok('Home tile: "No motion · <time>"', /^No motion · /.test(s), s);
  await pg.goto(root + 'device.html?id=d-motion'); await sl(500);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, sub: document.querySelector('[data-live="sub"]').textContent, cards: [...document.querySelectorAll('.info-card span')].map((x) => x.textContent).join(',') }));
  ok('Page: "No motion", "Last motion …"; Hue cards: temperature + humidity, light level, the light it switches, battery', s.w === 'No motion' && /^Last motion /.test(s.sub) && s.cards === 'Temperature,Humidity,Light level,Lights on motion · below 40 lx,Battery', JSON.stringify(s));

  // walk in at night: motion → the living room lamp turns on (scenario), the zones light up
  await click('[data-action="pp-walk"]'); await sl(500);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, occ: document.querySelector('.mo-card').classList.contains('is-occ'), sub: document.querySelector('[data-live="sub"]').textContent }));
  ok('Walk in: "Motion", zones lit, "Now · clears in 1:00"', s.w === 'Motion' && s.occ && /^Now · clears in (1:00|0:59)$/.test(s.sub), JSON.stringify(s));
  ok('Dark (8 lx) + motion → "Lights on motion" turns the Living room lamp on', await lampOn());
  await click('[data-action="pp-leave"]'); await settle(); await sl(300);
  s = await M();
  ok('Leave: no motion after the no-motion time, the lamp goes off after 2 min', !s.st.occ && !(await lampOn()) && s.log.some((e) => e.k === 'lightOff'), s.log.slice(0, 3).map((e) => e.k).join(','));

  // daylight: motion leaves the light off
  await click('[data-action="pp-day"]'); await click('[data-action="pp-walk"]'); await sl(300);
  ok('Day (320 lx): motion, but the lamp stays off', (await M()).st.occ && !(await lampOn()));
  await click('[data-action="pp-leave"]'); await settle(); await click('[data-action="pp-day"]');

  // sitting still: the PIR reports "no motion" anyway
  await click('[data-action="pp-sit"]'); await sl(200);
  s = await ev(() => (document.querySelector('.toast') || {}).textContent || '');
  await settle(); s = { toast: s, occ: (await M()).st.occ };
  ok('Sit still: "no motion" while someone sits there (the toast points to a presence sensor)', !s.occ && /presence sensor/.test(s.toast), JSON.stringify(s));
  await click('[data-action="pp-leave"]');

  // a cat: medium ignores it, high reports it
  s = await ev(() => { const d = Store.device('d-motion'); return Devices.motion._detect(d, true); });
  ok('Cat, sensitivity Medium: ignored', /ignores/.test(s), s);
  s = await ev(() => { const d = Store.device('d-motion'); d.settings.sensitivity = 'high'; const m = Devices.motion._detect(d, true); return { m, occ: d.st.occ }; });
  ok('Cat, sensitivity High: reported', s.m === '' && s.occ, JSON.stringify(s));
  await settle();

  // notifications: only when nobody is home (default)
  const n0 = await ev(() => Store.state.notifications);
  await ev(() => { const d = Store.device('d-motion'); d.settings.motionLight.on = false; Devices.motion._detect(d); }); await settle();
  const n1 = await ev(() => Store.state.notifications);
  await ev(() => { Store.state.away = true; const d = Store.device('d-motion'); Devices.motion._detect(d); }); await sl(200);
  s = await ev(() => ({ n: Store.state.notifications, push: (document.querySelector('.push') || {}).textContent || '' }));
  ok('Push only when nobody is home (Away): none at home, one when away', n1 === n0 && s.n === n0 + 1 && /Motion · Living room motion/.test(s.push), JSON.stringify({ n0, n1, ...s }));
  await ev(() => { Store.state.away = false; Store.save(); }); await settle();

  // Aqara P1: rest time — movement while resting is not reported
  await ev(() => { const d = Store.device('d-motion'), C = Devices.motion, p = C.PRESETS.find((x) => x.id === 'p1'); d.preset = 'p1'; d.features = p.feats.slice(); d.settings = { restTime: 30 }; C.applyDefaults(d); d.st.restUntil = 0; d.st.occ = false; Store.save(); });
  s = await ev(() => { const d = Store.device('d-motion'), C = Devices.motion; const a = C._detect(d), n = d.log.length, b2 = C._detect(d); return { a, b2, same: d.log.length === n, clearIsRest: d.st.clearAt === d.st.restUntil }; });
  ok('P1 rest time: a second movement within 30 s is not reported; "no motion" comes when the rest ends', s.a === '' && /resting/.test(s.b2) && s.same && s.clearIsRest, JSON.stringify(s));
  await settle();
  await pg.goto(root + 'device-settings.html?id=d-motion'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.list-header')].map((x) => x.textContent).join(','));
  ok('P1 settings: Detection, Sensor, Notifications, Automation', s === 'Detection,Sensor,Notifications,Automation', s);
  await click('[data-action="mo-feature"][data-k="motionLight"]'); await sl(500);
  s = await ev(() => [...document.querySelectorAll('[data-action="mo-target"] .option-title')].map((x) => x.textContent).join(','));
  ok('Lights on motion offers lights only (no boiler / water heater)', !/Boiler|Water heater/.test(s) && /Living room lamp/.test(s) && /Ceiling/.test(s), s);
  await ev(() => UI.closeSheet()); await sl(300);

  // classic Aqara: fixed rest time; Tuya: only its steps
  await ev(() => { const d = Store.device('d-motion'), C = Devices.motion, p = C.PRESETS.find((x) => x.id === 'aqara'); d.preset = 'aqara'; d.features = p.feats.slice(); d.settings = { restTime: 60 }; C.applyDefaults(d); Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-motion'); await sl(400);
  await click('[data-action="mo-feature"][data-k="restTime"]'); await sl(500);
  s = await ev(() => ({ t: document.querySelector('.sheet.open, #sheet.open').textContent, opts: document.querySelectorAll('[data-action="mo-opt"]').length }));
  ok('Classic Aqara: rest time is fixed (60 s), no choices', /Fixed on this model/.test(s.t) && s.opts === 0, String(s.opts));
  await ev(() => UI.closeSheet()); await sl(300);
  await ev(() => { const d = Store.device('d-motion'), C = Devices.motion, p = C.PRESETS.find((x) => x.id === 'tuya'); d.preset = 'tuya'; d.features = p.feats.slice(); d.settings = { clearTime: 30 }; C.applyDefaults(d); Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-motion'); await sl(400);
  await click('[data-action="mo-feature"][data-k="clearTime"]'); await sl(500);
  s = await ev(() => [...document.querySelectorAll('[data-action="mo-opt"] .option-title')].map((x) => x.textContent).join(','));
  ok('Tuya: no-motion time only 10 s / 30 s / 1 min / 2 min', s === '10 s,30 s,1 min,2 min', s);
  await ev(() => UI.closeSheet()); await sl(300);

  // all features: detection off → banner, nothing reported; tamper → banner, red tile, push
  await ev(() => { const d = Store.device('d-motion'), C = Devices.motion, p = C.PRESETS.find((x) => x.id === 'all'); d.preset = 'all'; d.features = p.feats.slice(); d.settings = {}; C.applyDefaults(d); Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-motion'); await sl(400);
  await click('[data-action="mo-sw"][data-n="pirEnable"]'); await sl(200);
  await pg.goto(root + 'device.html?id=d-motion'); await sl(400);
  s = await ev(() => ({ ban: !!document.querySelector('[data-key="ban-pir"]'), m: Devices.motion._detect(Store.device('d-motion')) }));
  ok('Detection off: info banner, movement not reported', s.ban && /off/.test(s.m), JSON.stringify(s));
  await ev(() => { Store.device('d-motion').settings.pirEnable = true; Store.save(); });
  const n2 = await ev(() => Store.state.notifications);
  await pg.goto(root + 'device.html?id=d-motion'); await sl(300);
  await click('[data-action="pp-tamper"]'); await sl(300);
  s = await ev(() => ({ ban: !!document.querySelector('[data-key="ban-tamper"]'), n: Store.state.notifications }));
  ok('Cover opened: red banner + push', s.ban && s.n === n2 + 1, JSON.stringify(s));
  await pg.goto(root + 'index.html'); await sl(300);
  s = await ev(() => document.querySelector('.tile[data-id="d-motion"] .tile-status').className + ' ' + document.querySelector('.tile[data-id="d-motion"] .tile-status').textContent.trim());
  ok('Home tile: "Cover opened" in red', /tone-danger/.test(s) && /Cover opened/.test(s), s);

  // SONOFF: light level is only dim / bright
  await ev(() => { const d = Store.device('d-motion'), C = Devices.motion, p = C.PRESETS.find((x) => x.id === 'sonoff'); d.preset = 'sonoff'; d.features = p.feats.slice(); d.settings = { clearTime: 30 }; d.st.tamper = false; C.applyDefaults(d); Store.save(); });
  await pg.goto(root + 'device.html?id=d-motion'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.info-card')].map((x) => x.textContent.trim()).find((t) => /Light level/.test(t)) || '');
  ok('SONOFF: light level "Dim" (it only reports dim / bright, at the last motion)', /at the last motion\s*Dim/.test(s), s);

  // history
  await pg.goto(root + 'device-settings.html?id=d-motion'); await sl(400);
  await click('[data-action="rs-history"]'); await sl(500);
  s = await ev(() => ({ segs: document.querySelectorAll('.mo-strip .bar i').length, rows: document.querySelectorAll('.sheet.open .group-card .cell, #sheet.open .group-card .cell').length }));
  ok('Event History: today strip with motion segments + event list', s.segs >= 2 && s.rows >= 5, JSON.stringify(s));
  await ev(() => UI.closeSheet()); await sl(300);

  for (const u of ['index.html', 'about-device.html?id=d-motion', 'add-device.html?via=zigbee']) { await pg.goto(root + u); await sl(400); }
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
