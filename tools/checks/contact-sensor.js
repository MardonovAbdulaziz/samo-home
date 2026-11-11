/* Contact sensor (door / window): behaviour + page checks.
   node tools/checks/contact-sensor.js        (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/contact-sensor.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  await pg.goto(root + 'index.html'); await sl(200); await ev(() => localStorage.clear());
  await pg.goto(root + 'index.html'); await sl(400);

  /* ---------- Home ---------- */
  const tile = await ev(() => { const t = document.querySelector('.tile[data-id="d-contact"]'); return t && { name: t.querySelector('.tile-name').textContent, status: t.querySelector('.tile-status').textContent.trim(), power: !!t.querySelector('.tile-power') }; });
  ok('Home: front door tile, "Closed", no power button', tile && tile.status.startsWith('Closed') && !tile.power, JSON.stringify(tile));
  const chip = await ev(() => [...document.querySelectorAll('.quick-chip')].map((c) => c.textContent.trim()).find((t) => /Front door/.test(t)));
  ok('Home: door chip is live (Front door · Closed)', /Closed/.test(chip || ''), chip);

  /* ---------- Device page: open → push, word, scene, rolling duration ---------- */
  await pg.goto(root + 'device.html?id=d-contact'); await sl(500);
  let s = await ev(() => ({ word: document.querySelector('.ct-word').textContent, cls: document.querySelector('.ct-card').className, since: document.querySelector('[data-live="since"]').textContent }));
  ok('Closed: neutral (white) word, closed picture', s.word === 'Closed' && !/is-open/.test(s.cls), JSON.stringify(s));
  await click('[data-action="pp-move"][data-o="1"]'); await sl(300);
  s = await ev(() => ({ word: document.querySelector('.ct-word').textContent, tone: document.querySelector('.ct-word').className, cls: document.querySelector('.ct-card').className, push: (document.querySelector('.push.show') || {}).textContent || '' }));
  ok('Open: orange "Open", door swings, push "Front door opened"', s.word === 'Open' && /open/.test(s.tone) && /is-open/.test(s.cls) && /Front door opened/.test(s.push), JSON.stringify(s));
  const blink = await ev(() => document.querySelector('.ct-card').classList.contains('blink'));
  ok('Report blinks the sensor LED', blink);
  const kept = await ev(() => { const a = document.querySelector('.ct-card'); window.__card = a; return !!a; });
  await sl(1200);
  const same = await ev(() => document.querySelector('.ct-card') === window.__card);
  ok('Picture element is kept between renders (animations survive)', kept && same);
  const sinceNum = await ev(() => document.querySelector('[data-live="since"]').hasAttribute('data-num'));
  ok('"Since / For N min" text is a rolling number', sinceNum);

  /* ---------- Left open too long (1 s = 1 min) ---------- */
  await click('[data-action="pp-fast"]'); await sl(200);
  await ev(() => { const d = Store.device('d-contact'); d.settings.openTooLong = { on: true, min: 2 }; d.st.at = Date.now(); d.st.alerted = false; Store.save(); });
  await sl(3300);
  s = await ev(() => ({ push: (document.querySelector('.push') || {}).textContent || '', log: Store.device('d-contact').log[0].k, since: document.querySelector('[data-live="since"]').textContent }));
  ok('Left open 2 min → push "Front door still open"', /still open/.test(s.push) && s.log === 'long', JSON.stringify(s));
  ok('Duration text counts up (For N min)', /^For \d+ min/.test(s.since), s.since);

  /* ---------- Only when nobody is home ---------- */
  await click('[data-action="pp-move"][data-o="0"]'); await sl(200);
  await ev(() => { const d = Store.device('d-contact'); d.settings.notify.armed = true; Store.state.away = false; Store.state.notifications = 0; Store.save(); document.querySelector('.push') && document.querySelector('.push').classList.remove('show'); });
  await click('[data-action="pp-move"][data-o="1"]'); await sl(300);
  let n = await ev(() => Store.state.notifications);
  ok('Armed + someone home → no push', n === 0, 'notifications ' + n);
  await click('[data-action="pp-move"][data-o="0"]'); await click('[data-action="pp-away"]'); await sl(100);
  await click('[data-action="pp-move"][data-o="1"]'); await sl(300);
  s = await ev(() => ({ n: Store.state.notifications, push: document.querySelector('.push').className + ' ' + document.querySelector('.push').textContent }));
  ok('Armed + Away → red push "Nobody should be home"', s.n === 1 && /danger/.test(s.push) && /Nobody should be home/.test(s.push), JSON.stringify(s));
  await click('[data-action="pp-move"][data-o="0"]'); await click('[data-action="pp-away"]');

  /* ---------- Report delay ---------- */
  await ev(() => { const d = Store.device('d-contact'); d.features.push('delay'); d.settings.delay = 2; Store.save(); });
  await pg.goto(root + 'device.html?id=d-contact'); await sl(400);
  await click('[data-action="pp-move"][data-o="1"]'); await sl(300);
  let w = await ev(() => document.querySelector('.ct-word').textContent);
  ok('Delay 2 s: app still says Closed right after opening', w === 'Closed', w);
  await click('[data-action="pp-move"][data-o="0"]'); await sl(2600);
  w = await ev(() => ({ word: document.querySelector('.ct-word').textContent, last: Store.device('d-contact').log[0].k }));
  ok('Closed within the delay → nothing reported', w.word === 'Closed' && w.last === 'close', JSON.stringify(w));
  await click('[data-action="pp-move"][data-o="1"]'); await sl(3300);
  w = await ev(() => document.querySelector('.ct-word').textContent);
  ok('Stays open past the delay → reported Open', w === 'Open', w);
  await click('[data-action="pp-move"][data-o="0"]'); await sl(300);

  /* ---------- Tamper, battery, offline ---------- */
  await click('[data-action="pp-tamper"]'); await sl(300);
  s = await ev(() => ({ ban: !!document.querySelector('[data-key="ban-tamper"] .banner.danger'), cls: document.querySelector('.ct-card').className }));
  ok('Tamper → red banner + cover off in the picture', s.ban && /is-tamper/.test(s.cls), JSON.stringify(s));
  await click('[data-action="pp-tamper"]'); await sl(300);
  ok('Cover back → banner gone', await ev(() => !document.querySelector('[data-key="ban-tamper"]')));
  await click('[data-action="pp-batt"]'); await sl(300);
  s = await ev(() => ({ ban: (document.querySelector('[data-key="ban-batt"]') || {}).textContent, card: [...document.querySelectorAll('.info-card.wide')].map((c) => c.textContent.trim()).join('|') }));
  ok('Battery 14 % → yellow banner + card says replace', /Battery low · 14 %/.test(s.ban || '') && /replace/.test(s.card), JSON.stringify(s));
  await click('[data-action="pp-online"]'); await sl(200);
  await click('[data-action="pp-move"][data-o="1"]'); await sl(300);
  w = await ev(() => ({ word: document.querySelector('.ct-word').textContent, off: !!document.querySelector('[data-key="ban-off"]') }));
  ok('Offline: door opens but nothing is reported', w.word === 'Unknown' && w.off, JSON.stringify(w));
  await click('[data-action="pp-online"]'); await sl(300);
  w = await ev(() => document.querySelector('.ct-word').textContent);
  ok('Back online → reports the door as it is now (Open)', w === 'Open', w);
  await click('[data-action="pp-move"][data-o="0"]'); await sl(200);

  /* ---------- Counter mode ---------- */
  await ev(() => { const d = Store.device('d-contact'); d.features.push('counter'); d.settings.counter = 'counter'; Store.save(); });
  await pg.goto(root + 'device.html?id=d-contact'); await sl(400);
  const c0 = await ev(() => Store.device('d-contact').st.pulses);
  await click('[data-action="pp-pulse"]'); await sl(400);
  s = await ev(() => ({ n: Store.device('d-contact').st.pulses, scene: !!document.querySelector('.ct-card'), num: document.querySelector('[data-live="pulses"]').getAttribute('data-num') }));
  ok('Counter mode: pulse counted, big counting number, no door picture', s.n === c0 + 1 && !s.scene && s.num === 'count', JSON.stringify(s));
  await ev(() => { const d = Store.device('d-contact'); d.settings.counter = 'contact'; Store.save(); });

  /* ---------- Light effects: no filter blur (Safari paints it unreliably), they light up fully when open ---------- */
  await ev(() => { const d = Store.device('d-contact'); d.display = 'door'; d.icon = 'dev-door-02'; d.settings.delay = 0; Store.save(); });
  await pg.goto(root + 'device.html?id=d-contact'); await sl(300);
  await click('[data-action="pp-move"][data-o="1"]'); await sl(1200);
  s = await ev(() => ['.ct-beam', '.ct-beam', '.ct-bloom'].map((q) => { const cs = getComputedStyle(document.querySelector(q)); return [cs.filter, cs.opacity]; }));
  ok('Door light: no filter blur, beam and bloom fully lit when open', s.every((x) => x[0] === 'none') && +s[0][1] === 1 && Math.abs(+s[2][1] - 0.45) < 0.01, JSON.stringify(s));   // bloom target is .45 (dimmed on request)
  await click('[data-action="pp-move"][data-o="0"]'); await sl(300);

  /* ---------- Settings ---------- */
  await pg.goto(root + 'device-settings.html?id=d-contact'); await sl(400);
  s = await ev(() => ({ heads: [...document.querySelectorAll('.list-header')].map((h) => h.textContent), hist: (document.querySelector('[data-action="rs-history"]') || {}).textContent }));
  ok('Settings: Sensor + Notifications sections, Event History opens', s.heads.includes('Sensor') && s.heads.includes('Notifications') && /today/.test(s.hist || ''), JSON.stringify(s));
  await click('[data-action="cn-toggle"][data-n="close"]'); await sl(200);
  ok('Notification switch flips in the row (no sheet)', await ev(() => !UI.sheetOpen && Store.device('d-contact').settings.notify.close === true));
  await click('[data-action="rs-history"]'); await sl(500);
  s = await ev(() => ({ strip: document.querySelectorAll('.sheet .ct-strip .bar i').length, rows: document.querySelectorAll('.sheet .group-card .cell').length }));
  ok('Event History: day strip + event rows', s.strip > 0 && s.rows > 3, JSON.stringify(s));
  await click('[data-action="sheet-close"]'); await sl(400);
  await click('[data-action="rs-display"]'); await sl(400);
  await click('[data-action="cd-pick"][data-v="window"]'); await sl(400);
  ok('Display as: Window → window icon', await ev(() => Store.device('d-contact').display === 'window' && Store.device('d-contact').icon === 'dev-window'));
  await click('[data-action="rs-icon"]'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.sheet [data-action="ci-pick"]')].map((b) => b.dataset.k).join(','));
  ok('Icon picker offers only the window icons', s === 'dev-window,dev-window-2', s);
  await click('[data-action="ci-pick"][data-k="dev-window-2"]'); await sl(400);
  await pg.goto(root + 'device.html?id=d-contact'); await sl(400);
  ok('Display as Window → window picture', await ev(() => document.querySelector('.ct-card').classList.contains('win')));
  for (const k of ['door', 'window', 'other']) {
    await ev((k) => { const d = Store.device('d-contact'); d.display = k; d.settings.delay = 0; Devices.contact.applyDefaults(d); Store.save(); }, k);   // no report delay here
    await pg.goto(root + 'device.html?id=d-contact'); await sl(250);
    await click('[data-action="pp-move"][data-o="1"]'); await sl(150);
    const r = await ev((k) => { const c = document.querySelector('.ct-card'); return c && c.classList.contains(k === 'window' ? 'win' : k) && c.classList.contains('is-open'); }, k);
    await click('[data-action="pp-move"][data-o="0"]');
    ok(`Display as ${k} → its own picture, opens`, r);
  }

  /* ---------- Other pages still fine ---------- */
  for (const u of ['index.html', 'about-device.html?id=d-contact', 'add-device.html?via=zigbee', 'device.html?id=d-curtain', 'device-settings.html?id=d-curtain']) { await pg.goto(root + u); await sl(500); }
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
