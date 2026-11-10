// Smoothness: during a steady drag and after release, record the hem x of the grabbed panel every frame.
// Count direction reversals of its velocity (jitter / bounce show up as many reversals).
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  await pg.goto(root + 'index.html'); await sl(300);
  await pg.evaluate(() => { const c = Devices.curtain.create('tuya', { name: 'R', roomId: 'r-living' }); c.id = 'd-r'; c.isNew = false; c.settings.openingStyle = 'center'; c.curtains[0].calibrated = true; c.curtains[0].q = 60; Store.state.devices.push(c); Store.save(); });
  await pg.goto(root + 'device.html?id=d-r'); await sl(1000);
  const box = await (await pg.$('.cw-stage')).boundingBox();
  const rec = pg.evaluate(() => new Promise(res => { const out = []; const t0 = performance.now(); const f = () => { const V = Devices.curtain._sim(); const P = V.cloth.panels[0]; const c = P.ch[P.n]; out.push(c[c.length - 1].s.x); if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
  await pg.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6); await pg.mouse.down();
  for (let i = 1; i <= 30; i++) { await pg.mouse.move(box.x + box.width * (0.2 + i * 0.006), box.y + box.height * 0.6); await sl(16); }
  await pg.mouse.up();
  const xs = await rec;
  const v = xs.slice(1).map((x, i) => x - xs[i]).filter((d) => Math.abs(d) > 0.02);
  let rev = 0; for (let i = 1; i < v.length; i++) if (Math.sign(v[i]) !== Math.sign(v[i - 1])) rev++;
  console.log('hem (spring) velocity reversals over 3 s:', rev, '| errors', errs);
  console.log(rev <= 4 && !errs.length ? 'PASS  cloth moves smoothly (no jitter / bounce)' : 'FAIL  cloth jitters or bounces');
  await b.close();
})();
