// Center curtain: drag ONE half (left, low) and measure how mirror-symmetric the two halves are, every frame
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  await pg.goto(root + 'index.html'); await sl(300);
  await pg.evaluate(() => { const c = Devices.curtain.create('tuya', { name: 'S', roomId: 'r-living' }); c.id = 'd-sy'; c.isNew = false; c.settings.openingStyle = 'center'; c.curtains[0].calibrated = true; c.curtains[0].q = 60; Store.state.devices.push(c); Store.save(); });
  await pg.goto(root + 'device.html?id=d-sy'); await sl(1000);
  const box = await (await pg.$('.cw-stage')).boundingBox();
  const rec = pg.evaluate(() => new Promise(res => { let worst = 0; const t0 = performance.now(); const f = () => { const V = Devices.curtain._sim(); const [L, R] = V.cloth.panels; for (let k = 0; k <= L.n; k++) for (let j = 0; j < L.ch[k].length; j++) worst = Math.max(worst, Math.abs(L.ch[k][j].x + R.ch[k][j].x - 400), Math.abs(L.ch[k][j].y - R.ch[k][j].y)); if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(worst); }; requestAnimationFrame(f); }));
  await pg.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.72); await pg.mouse.down();
  for (let i = 1; i <= 20; i++) { await pg.mouse.move(box.x + box.width * (0.18 + i * 0.01), box.y + box.height * (0.72 - i * 0.004)); await sl(16); }
  await (await pg.$('.cw-card')).screenshot({ path: 'sync-drag.png' });
  await pg.mouse.up(); await sl(250); await (await pg.$('.cw-card')).screenshot({ path: 'sync-release.png' });
  const worst = await rec;
  console.log('max asymmetry between halves (viewBox units):', worst.toFixed(2));
  console.log(worst < 1 && !errs.length ? 'PASS  both halves move in sync' : 'FAIL  halves out of sync', errs);
  await b.close();
})();
