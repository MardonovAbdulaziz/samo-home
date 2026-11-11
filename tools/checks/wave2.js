/* Wave 2 devices (Device Interface 3: 9, 13, 15–19, 21) — the key behaviour of each, in one run:
   door lock (tap to lock, hold to unlock, code by Mum, auto-lock, forced door), valve (open for 15 min ring, leak sensor
   closes it), gas (a little → gas! → Call 104 + steps, gas valve closed), air (stuffy → Moderate + tip), presence (sofa
   zone, leaving → empty), vibration (dryer running → finished; window shaken), meter (overload trips the main switch,
   top up), IR remote (TV OK sends, AC on 24°, brand setup adds a remote). Plus home tiles and no console errors.
   node tools/checks/wave2.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/wave2.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => { const e = document.querySelector(s); if (!e) throw new Error('missing ' + s); e.click(); }, sel);
  const word = () => ev(() => (document.querySelector('[data-cl="word"]') || {}).textContent);
  const sub = () => ev(() => (document.querySelector('[data-live="sub"]') || {}).textContent);
  const go = async (u) => { await pg.goto(root + u); await sl(350); };
  const dev = (id) => ev((id) => JSON.parse(JSON.stringify(Store.device(id))), id);
  await go('index.html'); await ev(() => localStorage.clear()); await go('index.html');

  // home: all eight are seeded, no console errors
  let s = await ev(() => ['d-lock', 'd-valve', 'd-gas', 'd-air', 'd-presence', 'd-vibration', 'd-meter', 'd-ir'].map((id) => !!document.querySelector(`.tile[data-id="${id}"]`)).join(','));
  ok('Home: lock, valve, gas, air, presence, vibration, meter and IR tiles', s === 'true,true,true,true,true,true,true,true', s);

  // ---- door lock
  await go('device.html?id=d-lock');
  ok('Lock: “Locked”, white', (await word()) === 'Locked' && (await ev(() => getComputedStyle(document.querySelector('[data-cl="word"]')).color)) === 'rgb(255, 255, 255)');
  await click('[data-action="lo-tap"]'); await sl(250);
  ok('Lock: a tap does not unlock (hold to unlock)', (await word()) === 'Locked' && /hold/i.test(await ev(() => (document.querySelector('.toast') || {}).textContent || '')));
  await ev(() => { const e = document.querySelector('.lo-ctl'); e.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
  await sl(800); await ev(() => document.querySelector('.lo-ctl').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
  await sl(2300);
  ok('Lock: press and hold 0.7 s → Unlocked (orange) by You', (await word()) === 'Unlocked' && /Unlocked by You/.test(await sub()), await sub());
  await click('[data-action="lo-tap"]'); await sl(2300);
  ok('Lock: tap → Locking… → Locked', (await word()) === 'Locked');
  await click('[data-action="pp-code"]'); await sl(2300);
  ok('Lock: Mum types her code → “Unlocked by Mum with a code”', /Unlocked by Mum with a code/.test(await sub()), await sub());
  await ev(() => { const d = Store.device('d-lock'); d.st.lockAt = Date.now() - 1; Store.save(); }); await sl(3600);
  ok('Lock: auto-lock locks it again', (await dev('d-lock')).st.bolt === 'locked');
  await click('[data-action="pp-force"]'); await sl(300);
  ok('Lock: forced door → red banner', await ev(() => !!document.querySelector('[data-key="ban-forced"]')));

  // ---- valve + leak sensor
  await go('device.html?id=d-valve');
  ok('Valve: “Closed”', (await word()) === 'Closed');
  await click('[data-action="va-timer"]'); await sl(300); await click('[data-action="va-go"]'); await sl(400);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, ring: document.querySelector('.va-ring').classList.contains('is-run'), left: Math.round((Store.device('d-valve').ch[0].end - Date.now()) / 60000) }));
  ok('Valve: Open for 15 min → “Open”, the ring runs, 15 min left', s.w === 'Open' && s.ring && s.left === 15, JSON.stringify(s));
  await go('device.html?id=d-leak'); await click('[data-action="pp-wet"]'); await sl(300);
  s = await dev('d-valve');
  ok('Leak sensor wet → our hub closes the main water valve', !s.ch[0].open && /leak/.test((s.st.closedBy || {}).why || ''), JSON.stringify(s.st.closedBy));
  await click('[data-action="pp-wet"]'); await sl(200);

  // ---- gas
  await go('device.html?id=d-gas');
  await click('[data-action="pp-little"]'); await sl(300);
  ok('Gas: burner a moment → “A little gas” (orange)', (await word()) === 'A little gas');
  await click('[data-action="pp-leak"]'); await sl(300);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, call: !!document.querySelector('a[href="tel:104"]'), steps: document.querySelectorAll('.gs-steps > div').length, ban: !!document.querySelector('[data-key="ban-alarm"]') }));
  ok('Gas: pipe leaks → “Gas!”, Call 104, three steps, no duplicate banner', s.w === 'Gas!' && s.call && s.steps === 3 && !s.ban, JSON.stringify(s));
  await click('[data-action="pp-air"]'); await sl(200);

  // ---- air quality
  await go('device.html?id=d-air');
  ok('Air: “Excellent”', (await word()) === 'Excellent');
  await ev(() => { const d = Store.device('d-air'); Object.assign(d.phys, { co2: 1600 }); Object.assign(d.v, { co2: 1600 }); Store.save(); });
  await go('device.html?id=d-air');
  ok('Air: CO2 1600 → “Poor” + “open a window for 10 minutes”', (await word()) === 'Poor' && /open a window/.test(await sub()), await sub());

  // ---- presence
  await go('device.html?id=d-presence');
  ok('Presence: “Someone here”, the dot is on the map', (await word()) === 'Someone here' && await ev(() => getComputedStyle(document.querySelector('.pr-dot')).opacity === '1'));
  await click('[data-action="pp-leave"]'); await sl(1300);
  ok('Presence: leaves → “Leaving…” with a countdown', (await word()) === 'Leaving…' && /Empty in \d+ s/.test(await sub()), await sub());
  await ev(() => { const d = Store.device('d-presence'); d.st.emptyAt = Date.now() - 1; Store.save(); }); await sl(1300);
  ok('Presence: then “Empty”', (await word()) === 'Empty');

  // ---- vibration
  await go('device.html?id=d-vibration');
  await click('[data-action="pp-run"]'); await sl(1300);
  ok('Vibration: dryer starts → “Running”', (await word()) === 'Running');
  await click('[data-action="pp-run"]'); await sl(6800);
  ok('Vibration: calm for 5 “min” → “Finished”', (await word()) === 'Finished');

  // ---- meter
  await go('device.html?id=d-meter');
  await click('[data-action="pp-heavy"]'); await sl(1500);
  s = await dev('d-meter');
  ok('Meter: 14 kW over the 13 kW limit → main switch cut for safety', !s.st.relay && /Power too high/.test(s.st.trip || ''), s.st.trip);
  ok('Meter: home tile is the alert card', await (async () => { await go('index.html'); return ev(() => document.querySelector('.tile[data-id="d-meter"]').classList.contains('alert')); })());

  // ---- IR remote: the blaster lists its remotes; each remote is its own page (Figma 5433:50373)
  await go('device.html?id=d-ir');
  s = await ev(() => [...document.querySelectorAll('[data-key="remotes"] .cell-title')].map((x) => x.textContent).join(','));
  ok('IR: the blaster lists its remotes (TV, Air conditioner, Ceiling fan)', s === 'TV,Air conditioner,Ceiling fan', s);
  await go('device.html?id=d-ir&r=0');
  s = await ev(() => ({ title: document.querySelector('.toolbar .title').textContent, edit: !!document.querySelector('[data-action="ir-edit"]'), dpad: !!document.querySelector('.ir-dpad .ok'), rows: document.querySelectorAll('.ir-keys .ir-r').length }));
  ok('IR: the TV page — title “TV”, Edit, the D-pad with OK and three key rows', s.title === 'TV' && s.edit && s.dpad && s.rows === 3, JSON.stringify(s));
  await click('[data-action="ir-send"][data-l="OK"]'); await sl(200);
  ok('IR: OK → “Sent “OK” · …”, the light blinks', /Sent “OK”/.test(await sub()) && await ev(() => document.querySelector('.ir-led').classList.contains('on')), await sub());
  await go('device.html?id=d-ir&r=1');
  s = await ev(() => ({ temp: !!document.querySelector('.ir-temp'), swing: !!document.querySelector('[data-l="Swing"]'), sub: document.querySelector('[data-live="sub"]').textContent }));
  ok('IR: old AC = buttons only (no temperature, no state); its own last-sent line', !s.temp && s.swing && s.sub === 'Nothing sent yet', JSON.stringify(s));
  await click('[data-action="ir-send"][data-l="Swing"]'); await sl(200);
  ok('IR: Swing → “Sent “Swing””', /Sent “Swing”/.test(await sub()));
  await go('device.html?id=d-ir&r=2');
  s = await ev(() => { const r = document.querySelector('.ir-remote').getBoundingClientRect(), sc = document.querySelector('.screen'); return { w: Math.round(r.width), sx: sc.scrollLeft, over: sc.scrollWidth > sc.clientWidth }; });
  ok('IR: the ceiling fan page does not slide sideways', s.sx === 0 && !s.over, JSON.stringify(s));
  await go('device.html?id=d-ir'); await click('[data-action="ir-add"]'); await sl(300); await click('[data-action="ir-k"][data-k="fan"]'); await sl(250); await click('[data-action="ir-brand"]'); await sl(250); await click('[data-action="ir-yes"]'); await sl(700);
  ok('IR: brand setup adds a Fan remote and opens its page', (await dev('d-ir')).remotes.some((r) => r.kind === 'fan') && /&r=3/.test(pg.url()), pg.url());

  // settings + about of every new device open without errors
  for (const id of ['d-lock', 'd-valve', 'd-gas', 'd-air', 'd-presence', 'd-vibration', 'd-meter', 'd-ir']) { await go('device-settings.html?id=' + id); await go('about-device.html?id=' + id); }
  await go('add-device.html?via=zigbee'); await sl(400);
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
