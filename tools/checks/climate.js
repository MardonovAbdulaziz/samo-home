/* Temperature & humidity sensor: what the app shows is the last REPORT (step / interval), sensor alarm vs our
   push limits, correction, built-in relay control, settings per sensor, history sheet, offline.
   node tools/checks/climate.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/climate.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(400);

  let s = await ev(() => ({ tile: document.querySelector('.tile[data-id="d-climate"] .tile-status').textContent.trim(), chip: [...document.querySelectorAll('.quick-chip')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()).find((t) => /Temperature/.test(t)) }));
  ok('Home: tile "23.4 °C · 46 %", Temperature chip shows the sensor', s.tile === '23.4 °C · 46 %' && /23\.4°/.test(s.chip), JSON.stringify(s));

  await pg.goto(root + 'device.html?id=d-climate'); await sl(500);
  s = await ev(() => ({ t: document.querySelector('[data-live="t"]').textContent, h: document.querySelector('[data-live="h"]').textContent, rep: document.querySelector('[data-live="rep"]').textContent, cards: [...document.querySelectorAll('.info-card span')].map((x) => x.textContent).join(',') }));
  ok('Page: the reported values + "Reported 2 min ago"; SONOFF 02D has only Battery as a card', s.t === '23.4' && s.h === '46' && s.rep === 'Reported 2 min ago' && s.cards === 'Battery', JSON.stringify(s));

  // the app follows REPORTS, not the room: heater on, measure-by-measure
  const run = (n) => ev((n) => { const d = Store.device('d-climate'), C = Devices.climate, out = []; for (let i = 0; i < n; i++) { d.st.measuredAt = 0; C.tick(d); out.push([+d.room.t.toFixed(2), d.st.t]); } Store.save(); return out; }, n);
  await click('[data-action="pp-room"][data-k="heater"]'); await sl(200);
  const steps = await run(40);
  const lagOk = steps.every(([room, app]) => Math.abs(room - app) < 0.5 + 0.2);   // never more than one step (+ one tick of drift) behind
  const jumps = steps.map((x) => x[1]).filter((v, i, a) => i && v !== a[i - 1]).length;
  ok('Heater: the room warms; the app moves in reported steps of ≥ 0.5 °C', steps[39][0] > 27 && jumps >= 5 && jumps < 40 && lagOk, `room ${steps[39][0]}, app ${steps[39][1]}, ${jumps} reports`);
  // the real device clock: the next measurement sees a 1 °C change → reports → the page re-renders
  await ev(() => { const d = Store.device('d-climate'); d.st.measuredAt = 0; d.room.heater = false; d.room.t = d.st.t + 1; Store.save(); });
  await sl(1900);
  s = await ev(() => ({ shown: document.querySelector('[data-live="t"]').textContent, st: Store.device('d-climate').st.t }));
  ok('Page follows the next report by itself (number rolls to it)', +s.shown === s.st, JSON.stringify(s));

  // correction (SONOFF has it): +0.5 → shows at once
  await ev(() => { const d = Store.device('d-climate'); d.room.t = 22; d.room.h = 45; Devices.climate._report(d); Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-climate'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.list-header')].map((x) => x.textContent).join(','));
  ok('SONOFF 02D settings: Sensor, Screen, Notifications', s === 'Sensor,Screen,Notifications', s);
  await click('[data-action="th-feature"][data-k="calibration"]'); await sl(400);
  for (let i = 0; i < 5; i++) { await click('[data-action="th-step"][data-f="t"][data-d="1"]'); await sl(60); }
  await sl(700);   // let the number finish rolling
  s = await ev(() => ({ out: document.querySelector('.stepper output').textContent, t: Store.device('d-climate').st.t }));
  ok('Correction +0.5 °C: stepper "+0.5 °C", reported value 22.5 at once', s.out === '+0.5 °C' && s.t === 22.5, JSON.stringify(s));
  await click('[data-action="sheet-close"]'); await sl(400);
  s = await ev(() => document.querySelector('[data-action="th-feature"][data-k="calibration"] .cell-value').textContent);
  ok('Row summary', s === '+0.5 °C · 0 %', s);

  // our push limits: pair guard, one push per crossing
  await click('[data-action="th-feature"][data-k="alerts"]'); await sl(400);
  for (let i = 0; i < 16; i++) { await click('[data-action="th-step"][data-f="tlow"][data-d="1"]'); await sl(30); }
  s = await ev(() => Store.device('d-climate').settings.alerts.tlow);
  ok('"Colder than" cannot pass "Hotter than"', s === 29, String(s));
  await ev(() => { Store.device('d-climate').settings.alerts.tlow = 16; Store.save(); }); await click('[data-action="sheet-close"]'); await sl(300);
  const n0 = await ev(() => Store.state.notifications);
  await ev(() => { const d = Store.device('d-climate'); d.room.t = 31; Devices.climate._report(d); d.room.t = 31.4; Devices.climate._report(d); Store.save(); });
  s = await ev(() => ({ n: Store.state.notifications, push: (document.querySelector('.push') || {}).textContent || '' }));
  ok('Too hot (31.5 °C > 30): one push message, not one per report', s.n === n0 + 1, JSON.stringify(s));

  // sensor's own alarm (Tuya TH05Z): banner + red tile
  await ev(() => { const d = Store.device('d-climate'), C = Devices.climate, p = C.PRESETS.find((x) => x.id === 'tuyaal'); d.features = p.feats.slice(); d.settings = {}; C.applyDefaults(d); d.room.t = 32; C._report(d); Store.save(); });
  await pg.goto(root + 'device.html?id=d-climate'); await sl(400);
  s = await ev(() => (document.querySelector('[data-key="ban-alarm"]') || {}).textContent || '');
  ok('Built-in limit alarm: banner "Sensor alarm · Too hot · 32.0 °C"', /Sensor alarm · Too hot · 32\.0 °C/.test(s), s.trim());
  await pg.goto(root + 'device-settings.html?id=d-climate'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('[data-action="th-feature"]')].map((x) => x.dataset.k).join(','));
  ok('Tuya TH05Z settings: reporting, alarm, screen, notifications', s === 'reporting,alarmLimits,display,alerts', s);
  // reporting step 1.0 °C → a 0.6 °C change is not reported
  await click('[data-action="th-feature"][data-k="reporting"]'); await sl(400);
  for (let i = 0; i < 5; i++) { await click('[data-action="th-step"][data-f="tstep"][data-d="1"]'); await sl(40); }
  await click('[data-action="sheet-close"]'); await sl(300);
  s = await ev(() => { const d = Store.device('d-climate'); d.room.t = 22; d.room.heater = false; d.room.ac = false; Devices.climate._report(d); const a = d.st.t; d.room.t = 22.6; d.st.measuredAt = 0; d.room.h = d.st.h; const g = { ...d.room }; Devices.climate.tick(d); return { step: d.settings.reporting.tstep, before: a, after: d.st.t }; });
  ok('Step 1.0 °C: +0.6 °C is not reported (saves battery)', s.step === 1 && s.after === s.before, JSON.stringify(s));

  // built-in control (EFEKTA)
  await ev(() => { const d = Store.device('d-climate'), C = Devices.climate, p = C.PRESETS.find((x) => x.id === 'efekta'); d.features = p.feats.slice(); d.settings = {}; C.applyDefaults(d); d.settings.control.on = true; d.room.t = 18; C._report(d); Store.save(); });
  s = await ev(() => { const d = Store.device('d-climate'); Devices.climate.tick(d); Store.save(); return d.st.relay; });
  await pg.goto(root + 'device.html?id=d-climate'); await sl(400);
  const card = await ev(() => [...document.querySelectorAll('.info-card')].map((x) => x.textContent.trim()).find((t) => /Bound relay/.test(t)) || '');
  ok('Switch a heater directly: 18 °C < 20 → the sensor turns its relay on (card "On")', s === true && /heats 20–22 °C\s*On/.test(card), card);

  // history sheet
  await ev(() => { const d = Store.device('d-climate'), C = Devices.climate, p = C.PRESETS.find((x) => x.id === 'all'); d.features = p.feats.slice(); d.settings = {}; C.applyDefaults(d); Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-climate'); await sl(400);
  await click('[data-action="rs-history"]'); await sl(600);
  s = await ev(() => ({ tabs: [...document.querySelectorAll('.segmented button')].map((x) => x.textContent).join(','), path: !!document.querySelector('.th-plot svg path'), rows: [...document.querySelectorAll('.sheet .cell-title')].map((x) => x.textContent).slice(0, 2).join(',') }));
  ok('History: Temperature / Humidity / Pressure tabs, 24-h chart, Warmest / Coldest', s.tabs === 'Temperature,Humidity,Pressure' && s.path && s.rows === 'Warmest,Coldest', JSON.stringify(s));
  await click('.segmented [data-ch="1"]'); await sl(300);
  s = await ev(() => [...document.querySelectorAll('.sheet .cell-title')].map((x) => x.textContent).slice(0, 2).join(','));
  ok('Humidity tab: Most humid / Driest', s === 'Most humid,Driest', s);
  await ev(() => UI.closeSheet()); await sl(300);

  // offline
  await pg.goto(root + 'device.html?id=d-climate'); await sl(300);
  await click('[data-action="pp-online"]'); await sl(300);
  s = await ev(() => ({ ban: !!document.querySelector('[data-key="ban-off"]'), dim: document.querySelector('.th-hero').classList.contains('is-off'), rep: document.querySelector('[data-live="rep"]').textContent }));
  ok('Offline: banner, values dimmed, "Offline · last report …"', s.ban && s.dim && /^Offline · last report/.test(s.rep), JSON.stringify(s));

  for (const u of ['index.html', 'about-device.html?id=d-climate', 'add-device.html?via=zigbee', 'device.html?id=d-light']) { await pg.goto(root + u); await sl(400); }
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
