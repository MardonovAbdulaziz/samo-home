/* Shared timer sheet (UI.timerSheet) on the relay: 5 presets + Custom wheel (drag, flick, Start lock, remembered),
   channel tabs on a split relay, the countdown row.
   node tools/checks/timer.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/timer.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(300);
  await ev(() => { const r = Devices.relay.create('all', { name: 'Timer relay', roomId: 'r-living' }); r.id = 'd-tr'; r.isNew = false; r.settings.interlock = false; Store.state.devices.push(r); Store.save(); });
  await pg.goto(root + 'device.html?id=d-tr'); await sl(500);
  await click('[data-action="relay-timer"]'); await sl(600);
  let s = await ev(() => ({ pre: [...document.querySelectorAll('.preset-grid button')].map((x) => x.textContent.trim()).join(','), tabs: document.querySelectorAll('.sheet-tabs [role="tab"]').length }));
  ok('Relay timer: the 5 most used times + Custom', s.pre === '5min,15min,30min,1hour,2hours,Custom', s.pre);
  const split = s.tabs > 1;
  if (split) { await click('.sheet-tabs [data-ch="1"]'); await sl(300); }
  await click('[data-action="tm-custom"]'); await sl(500);
  s = await ev(() => ({ h: document.querySelector('[data-wheel="h"]').getAttribute('aria-valuenow'), m: document.querySelector('[data-wheel="m"]').getAttribute('aria-valuenow'), end: document.querySelector('[data-live="tw-end"]').textContent, back: !!document.querySelector('[data-action="tm-back"]') }));
  ok('Custom: wheels at 0 h 45 min, "Turns off at …", Back + Start', s.h === '0' && s.m === '45' && /Turns off at \d+:\d\d/.test(s.end) && s.back, JSON.stringify(s));
  // mouse: drag the hours wheel up 1 row → 1 h, the minutes down 45 rows is long — drag minutes up 2 rows → 47
  const hw = await (await pg.$('[data-wheel="h"]')).boundingBox(), mw = await (await pg.$('[data-wheel="m"]')).boundingBox();
  const drag = async (box, dy) => { await pg.mouse.move(box.x + box.width / 2, box.y + 100); await pg.mouse.down(); const n = 10; for (let k = 1; k <= n; k++) { await pg.mouse.move(box.x + box.width / 2, box.y + 100 + dy * k / n); await sl(30); } await sl(150); await pg.mouse.up(); await sl(700); };
  await drag(hw, -40); await drag(mw, -80);
  s = await ev(() => document.querySelector('[data-wheel="h"]').getAttribute('aria-valuenow') + ':' + document.querySelector('[data-wheel="m"]').getAttribute('aria-valuenow'));
  ok('Custom: mouse drag turns both wheels (1 h 47 min)', s === '1:47', s);
  await click('[data-action="tm-back"]'); await sl(300);
  ok('Back: presets again', await ev(() => !!document.querySelector('[data-action="tm-set"]')));
  await click('[data-action="tm-custom"]'); await sl(500);
  s = await ev(() => document.querySelector('[data-wheel="h"]').getAttribute('aria-valuenow') + ':' + document.querySelector('[data-wheel="m"]').getAttribute('aria-valuenow'));
  ok('Custom again in the same sheet keeps the turned wheels', s === '1:47', s);
  await ev(() => { document.querySelector('[data-wheel="h"]').scrollTop = 0; document.querySelector('[data-wheel="m"]').scrollTop = 0; }); await sl(400);
  ok('0 h 0 min: Start is locked', await ev(() => document.querySelector('[data-action="tm-go"]').disabled));
  await ev(() => { document.querySelector('[data-wheel="m"]').scrollTop = 120; }); await sl(400);
  await click('[data-action="tm-go"]'); await sl(400);
  s = await ev(() => ({ ring: !!document.querySelector('[data-live="tm"]'), t: (document.querySelector('[data-live="tm"]') || {}).textContent, cancel: !!document.querySelector('[data-action="tm-cancel"]') }));
  ok('Start 3 min: the ring counts down, Cancel shows', s.ring && /^(2:5\d|3:00)$/.test(s.t) && s.cancel, JSON.stringify(s));
  const ch = split ? 1 : 0;
  s = await ev((c) => { const d = Store.device('d-tr'); return { timer: d.channels[c].timer && d.channels[c].timer.kind, mem: d.tmCustom }; }, ch);
  ok(`The timer is on channel ${ch + 1}${split ? ' (the tab picked)' : ''}, custom time remembered`, s.timer === 'timer' && s.mem === 180, JSON.stringify(s));
  await click('[data-action="tm-cancel"]'); await sl(300);
  ok('Cancel: back to presets, timer gone', await ev((c) => !Store.device('d-tr').channels[c].timer && !!document.querySelector('[data-action="tm-set"]'), ch));
  await click('[data-action="tm-set"][data-s="300"]'); await sl(300); await click('[data-action="sheet-close"]'); await sl(400);
  s = await ev(() => (document.querySelector('[data-live="timer"]') || {}).textContent || '');
  ok('Preset 5 min: the Timer row counts down', /Off in (4:5\d|5:00)/.test(s), s);
  await click('[data-action="relay-timer"]'); await sl(500);
  if (split) { await click('.sheet-tabs [data-ch="1"]'); await sl(300); }
  await click('[data-action="tm-cancel"]'); await sl(300);
  await click('[data-action="tm-custom"]'); await sl(500);
  s = await ev(() => document.querySelector('[data-wheel="m"]').getAttribute('aria-valuenow'));
  ok('Next time Custom opens at the last custom time (3 min)', s === '3', s);
  await ev(() => UI.closeSheet()); await sl(300);
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
