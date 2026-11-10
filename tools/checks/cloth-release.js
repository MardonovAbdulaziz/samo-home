// Drag the left panel, release, and record the leading hem x every frame for 2.5 s: count swings + overshoot
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  await pg.goto(root + 'index.html'); await sl(300);
  await pg.evaluate(() => { const c = Devices.curtain.create('tuya', { name: 'R', roomId: 'r-living' }); c.id = 'd-r'; c.isNew = false; c.settings.openingStyle = 'center'; c.curtains[0].calibrated = true; c.curtains[0].q = 60; Store.state.devices.push(c); Store.save(); });
  await pg.goto(root + 'device.html?id=d-r'); await sl(1000);
  const box = await (await pg.$('.cw-stage')).boundingBox();
  await pg.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.6); await pg.mouse.down();
  for (let i = 1; i <= 15; i++) { await pg.mouse.move(box.x + box.width * (0.2 + i * 0.01), box.y + box.height * 0.6); await sl(16); }
  const rec = pg.evaluate(() => new Promise(res => { const out = []; const t0 = performance.now(); const f = () => { const V = Devices.curtain._sim(); const P = V.cloth.panels[0]; const c = P.ch[P.n]; out.push([Math.round(performance.now() - t0), +(c[c.length - 1].x - P.g[P.n]).toFixed(2)]); if (performance.now() - t0 < 2500) requestAnimationFrame(f); else res(out); }; requestAnimationFrame(f); }));
  await sl(30); await pg.mouse.up();
  const out = await rec;
  // hem offset relative to its glider: sign changes = swings
  const xs = out.map(o => o[1]); let swings = 0; for (let i = 1; i < xs.length; i++) if (Math.sign(xs[i]) !== Math.sign(xs[i - 1]) && Math.abs(xs[i]) > 0.5) swings++;
  const peak = Math.max(...xs.map(Math.abs));
  console.log('hem offset samples (ms:offset):', out.filter((_, i) => i % 10 === 0).map(o => o.join(':')).join('  '));
  const first = xs[0], over = Math.max(0, ...xs.map((x) => -Math.sign(first) * x));   // how far it swings past rest
  console.log('swings:', swings, '| peak offset:', peak.toFixed(1), '| overshoot:', over.toFixed(1), '| final:', xs[xs.length - 1]);
  console.log(over <= peak * 0.15 && Math.abs(xs[xs.length - 1]) < 5 ? 'PASS  no bounce after release' : 'FAIL  cloth bounces after release');
  await b.close();
})();
