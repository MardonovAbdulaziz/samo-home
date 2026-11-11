/* Water leak sensor: dry / leak (red page, push, picture), wiping dry, "water disappears" mode, test mode, frost,
   moved / opened, offline, settings per sensor, close-the-water scenario without a valve, history. Also the
   prototype name suffixes: relays end in " r", plugs in " s".
   node tools/checks/leak.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/leak.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  const setPreset = (id) => ev((id) => { const d = Store.device('d-leak'), L = Devices.leak, p = L.PRESETS.find((x) => x.id === id); Object.assign(d, { preset: id, features: p.feats.slice(), settings: {} }); L.applyDefaults(d); Store.save(); }, id);
  const tile = () => ev(() => { const t = document.querySelector('.tile[data-id="d-leak"] .tile-status'); return t.className + ' | ' + t.textContent.trim(); });
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(400);

  let s = await ev(() => ({ type: Store.device('d-leak').type, name: Store.device('d-leak').name, names: [...document.querySelectorAll('.tile .tile-name')].map((x) => x.textContent.trim()) }));
  ok('Kitchen sink is a real leak sensor (the placeholder is gone)', s.type === 'leak' && s.name === 'Kitchen sink' && !s.names.includes('Water Leak Sensor'), JSON.stringify(s.names));
  ok('Prototype names: relays end in " r", plugs in " s"', s.names.includes('Water heater r') && s.names.includes('Washing machine s'), s.names.filter((n) => / [rs]$/.test(n)).join(', '));
  ok('Home tile: "Dry"', /\| Dry$/.test(await tile()), await tile());

  await pg.goto(root + 'device.html?id=d-leak'); await sl(400);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, sub: document.querySelector('[data-live="sub"]').textContent, hint: (document.querySelector('.cw-hint') || {}).textContent }));
  ok('Page: "Dry", "Checked 3 min ago", "Last leak …"', s.w === 'Dry' && s.sub === 'Checked 3 min ago' && /^Last leak /.test(s.hint), JSON.stringify(s));
  const n0 = await ev(() => Store.state.notifications);
  await click('[data-action="pp-wet"]'); await sl(400);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, red: document.querySelector('[data-cl="word"]').classList.contains('alarm'), ban: (document.querySelector('[data-key="ban-leak"]') || {}).textContent || '', wet: document.querySelector('.lk-card').classList.contains('is-wet'), n: Store.state.notifications, push: (document.querySelector('.push') || {}).textContent || '' }));
  ok('Spill water: "Leak!" in red, banner, the puddle shows, one push "Water leak · Kitchen sink"', s.w === 'Leak!' && s.red && /Water detected · Kitchen/.test(s.ban) && s.wet && s.n === n0 + 1 && /Water leak · Kitchen sink/.test(s.push), JSON.stringify(s).slice(0, 220));
  await pg.goto(root + 'index.html'); await sl(300);
  ok('Home tile: "Leak!" in red', /tone-danger \| Leak!$/.test(await tile()), await tile());
  await pg.goto(root + 'device.html?id=d-leak'); await sl(300);
  await click('[data-action="pp-wet"]'); await sl(300);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, log: Store.device('d-leak').log.slice(0, 2).map((e) => e.k).join(',') }));
  ok('Wipe it dry: "Dry" again; wet and dry are in the history', s.w === 'Dry' && s.log === 'dry,wet', JSON.stringify(s));

  // all features: water-disappears mode, test mode, frost, moved
  await setPreset('all');
  await ev(() => { Store.device('d-leak').settings.alarmMode = 'water_absence'; Store.save(); });
  await pg.goto(root + 'device.html?id=d-leak'); await sl(300);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, ban: !!document.querySelector('[data-key="ban-leak"]') }));
  ok('"When water disappears" mode: dry = alarm ("No water")', s.w === 'No water' && s.ban, JSON.stringify(s));
  await ev(() => { Store.device('d-leak').settings.alarmMode = 'water_presence'; Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-leak'); await sl(300);
  s = await ev(() => [...document.querySelectorAll('.list-header')].map((x) => x.textContent).join(','));
  ok('All-features settings: Sensor, Notifications, Automation', s === 'Sensor,Notifications,Automation', s);
  await click('[data-action="lk-test"]'); await sl(200);
  const n1 = await ev(() => Store.state.notifications);
  await pg.goto(root + 'device.html?id=d-leak'); await sl(300);
  await click('[data-action="pp-wet"]'); await sl(300);
  s = await ev(() => ({ test: !!document.querySelector('[data-key="ban-test"]'), leakBan: !!document.querySelector('[data-key="ban-leak"]'), push: (document.querySelector('.push') || {}).textContent || '', n: Store.state.notifications, sub: document.querySelector('[data-live="sub"]').textContent }));
  ok('Test mode: test banner, one "Test alarm" push, no leak banner', s.test && !s.leakBan && /Test alarm/.test(s.push) && s.n === n1 + 1 && /^Test · /.test(s.sub), JSON.stringify(s).slice(0, 200));
  await click('[data-action="pp-wet"]'); await ev(() => { Store.device('d-leak').st.testUntil = 0; Store.save(); });
  await click('[data-action="pp-cold"]'); await sl(300);
  s = await ev(() => ({ ban: !!document.querySelector('[data-key="ban-frost"]'), push: (document.querySelector('.push') || {}).textContent || '' }));
  ok('Winter 1 °C: frost banner + "Frost warning" push', s.ban && /Frost warning/.test(s.push), JSON.stringify(s).slice(0, 160));
  await click('[data-action="pp-cold"]'); await click('[data-action="pp-tamper"]'); await sl(300);
  ok('Picked up: "Moved or opened" banner', await ev(() => !!document.querySelector('[data-key="ban-tamper"]')));
  await click('[data-action="pp-tamper"]'); await click('[data-action="pp-online"]'); await sl(300);
  s = await ev(() => !!document.querySelector('[data-key="ban-off"]'));
  await pg.goto(root + 'index.html'); await sl(300);
  ok('Stops answering: offline banner, home tile "Offline" in red', s && /tone-danger \| Offline$/.test(await tile()), await tile());
  await ev(() => { Store.device('d-leak').online = true; Store.save(); });

  // close-the-water scenario without a valve; buzzer; history
  await pg.goto(root + 'device-settings.html?id=d-leak'); await sl(300);
  await click('[data-action="lk-feature"][data-k="autoClose"]'); await sl(400);
  s = await ev(() => document.querySelector('.sheet.open, #sheet.open').textContent);
  ok('Close the water: says there is no valve yet', /No water valve in this home yet/.test(s));
  await ev(() => UI.closeSheet()); await sl(300);
  await click('[data-action="rs-history"]'); await sl(400);
  s = await ev(() => ({ segs: document.querySelectorAll('.lk-strip .bar i').length, rows: [...document.querySelectorAll('.sheet.open .group-card .cell-title, #sheet.open .group-card .cell-title')].map((x) => x.textContent).join(' | ') }));
  ok('Event History: red wet segments today + the events', s.segs >= 1 && /Water detected/.test(s.rows), JSON.stringify(s));
  await ev(() => UI.closeSheet()); await sl(300);
  await setPreset('third');
  await pg.goto(root + 'device-settings.html?id=d-leak'); await sl(300);
  await click('[data-action="lk-feature"][data-k="buzzer"]'); await sl(400);
  s = await ev(() => ({ t: document.querySelector('.sheet.open, #sheet.open').textContent, tones: document.querySelectorAll('[data-action="lk-tone"]').length }));
  ok('Third Reality buzzer: on / off only', /only lets you turn the sound on or off/.test(s.t) && s.tones === 0, String(s.tones));
  await ev(() => UI.closeSheet()); await sl(300);
  await setPreset('aqara');
  await pg.goto(root + 'device-settings.html?id=d-leak'); await sl(300);
  s = await ev(() => [...document.querySelectorAll('.list-header')].map((x) => x.textContent).join(','));
  ok('Aqara settings: Notifications, Automation (no sensor settings)', s === 'Notifications,Automation', s);

  for (const u of ['index.html', 'about-device.html?id=d-leak', 'add-device.html?via=zigbee']) { await pg.goto(root + u); await sl(400); }
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
