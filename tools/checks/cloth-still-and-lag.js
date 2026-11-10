// 1) at rest the cloth must not move at all; 2) while dragging, the rod end trails behind the held cloth
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  await pg.goto(root + 'index.html'); await sl(300);
  await pg.evaluate(() => { const c = Devices.curtain.create('tuya', { name: 'L', roomId: 'r-living' }); c.id = 'd-l'; c.isNew = false; c.settings.openingStyle = 'center'; c.curtains[0].calibrated = true; c.curtains[0].q = 60; Store.state.devices.push(c); Store.save(); });
  await pg.goto(root + 'device.html?id=d-l'); await sl(2500);
  const still = await pg.evaluate(() => new Promise(res => { const V = Devices.curtain._sim(); const snap = () => V.cloth.panels.flatMap(P => P.ch.flatMap(c => c.map(q => [q.x, q.y]))); const a = snap(); setTimeout(() => { const b = snap(); res(Math.max(...a.map((v, i) => Math.max(Math.abs(v[0] - b[i][0]), Math.abs(v[1] - b[i][1]))))); }, 2000); }));
  console.log('movement at rest over 2 s (max, viewBox units):', still.toFixed(3), still < 0.05 ? 'PASS' : 'FAIL');
  // drag the left half toward the middle, holding it low; compare rod end vs. held cloth every frame
  const box = await (await pg.$('.cw-stage')).boundingBox();
  await pg.mouse.move(box.x + box.width * 0.22, box.y + box.height * 0.65); await pg.mouse.down();
  const rec = pg.evaluate(() => new Promise(res => { const out = []; const t0 = performance.now(); const f = () => { const V = Devices.curtain._sim(); const P = V.cloth.panels[0]; out.push([P.g[P.n], P.ch[P.n][6].x]); if (performance.now() - t0 < 500) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
  for (let i = 1; i <= 25; i++) { await pg.mouse.move(box.x + box.width * (0.22 + i * 0.008), box.y + box.height * 0.65); await sl(16); }
  const out = await rec;
  const mid = out.slice(5, -3), lag = mid.filter(([rod, cloth]) => cloth > rod + 0.5).length / mid.length;
  console.log('frames where the held cloth is ahead of the rod end:', Math.round(lag * 100) + '%', lag > 0.8 ? 'PASS' : 'FAIL');
  await (await pg.$('.cw-card')).screenshot({ path: 'lag-drag.png' });
  await pg.mouse.up(); await sl(200);
  console.log('errors', errs);
  await b.close();
})();
