/* Curtain performance guards (weak Android phones):
   1. at rest the cloth loop sleeps (no simulation / drawing after 3 s without movement), and wakes on a command;
   2. "lite" mode (auto when frames come late, or ?lite=1) drops the cloth blur, soft shadows and fabric textures.
   node tools/checks/curtain-perf.js */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(300);
  await ev(() => { const c = Store.device('d-curtain'); c.curtains.forEach((m) => { m.calibrated = true; m.q = 0; }); Store.save(); });
  await pg.goto(root + 'device.html?id=d-curtain'); await sl(4200);
  let s = await ev(() => { const V = Devices.curtain._sim(); return { idle: performance.now() - V.lastActive, html: V.html.length }; });
  ok('At rest the cloth loop sleeps after 3 s', s.idle > 3000 && s.html > 0, `idle ${s.idle.toFixed(0)} ms`);
  const h0 = await ev(() => Devices.curtain._sim().html);
  await ev(() => document.querySelector('[data-action="ct-cmd"][data-c="open"]').click()); await sl(600);
  s = await ev(() => ({ idle: performance.now() - Devices.curtain._sim().lastActive, changed: Devices.curtain._sim().html }));
  ok('A command wakes it and the cloth moves', s.idle < 200 && s.changed !== h0, `idle ${s.idle.toFixed(0)} ms`);
  ok('Full mode keeps the soft blur and textures', /filter="url\(#cscloth\)"/.test(s.changed) && /url\(#csweave\)/.test(s.changed));
  await pg.goto(root + 'device.html?id=d-curtain&lite=1'); await sl(400);
  await ev(() => document.querySelector('[data-action="ct-cmd"][data-c="close"]').click()); await sl(600);
  const lite = await ev(() => Devices.curtain._sim().html);
  ok('Lite mode: no cloth blur, soft shadows or fabric textures', lite.length > 0 && !/filter="url\(#cs(cloth|soft)\)"/.test(lite) && !/url\(#(csweave|cw-noise)\)/.test(lite), `${lite.length} chars`);
  ok('No page errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
