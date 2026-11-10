// Closed curtain (opens from the middle): grab at the seam and pull right / left.
// Expect: it opens (%, not "Closed"), the half you pull is the one that follows, the halves never cross.
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  let ok = true;
  for (const [name, startDx, dir] of [['seam, a hair left, pull RIGHT', -2, 1], ['seam, a hair right, pull LEFT', 2, -1], ['seam exact, pull RIGHT', 0, 1]]) {
    await pg.goto(root + 'index.html'); await sl(200);
    await pg.evaluate(() => { localStorage.clear(); });
    await pg.goto(root + 'index.html'); await sl(200);
    await pg.evaluate(() => { const c = Devices.curtain.create('tuya', { name: 'Seam', roomId: 'r-living' }); c.id = 'd-seam'; c.isNew = false; c.settings.openingStyle = 'center'; c.curtains[0].calibrated = true; c.curtains[0].q = 0; Store.state.devices.push(c); Store.save(); });
    await pg.goto(root + 'device.html?id=d-seam'); await sl(1000);
    const box = await (await pg.$('.cw-stage')).boundingBox();
    const cx = box.x + box.width / 2 + startDx, y = box.y + box.height * 0.45;
    const base = await pg.evaluate(() => { const V = Devices.curtain._sim(); const [L, R] = V.cloth.panels; let m = 1e9; for (let j = 1; j < L.ch[0].length; j++) m = Math.min(m, R.ch[R.n][j].x - L.ch[L.n][j].x); return m; });
    const rec = pg.evaluate(() => new Promise(res => { let minGap = 1e9; const t0 = performance.now(); const f = () => { const V = Devices.curtain._sim(); const [L, R] = V.cloth.panels; for (let j = 1; j < L.ch[0].length; j++) minGap = Math.min(minGap, R.ch[R.n][j].x - L.ch[L.n][j].x); if (performance.now() - t0 < 900) requestAnimationFrame(f); else res(minGap); }; requestAnimationFrame(f); }));
    await pg.mouse.move(cx, y); await pg.mouse.down();
    for (let i = 1; i <= 20; i++) { await pg.mouse.move(cx + dir * i * box.width * 0.012, y); await sl(16); }
    const bubble = await pg.evaluate(() => document.querySelector('.cw-bubble').textContent);
    if (name.startsWith('seam, a hair left')) await (await pg.$('.cw-card')).screenshot({ path: 'seam-right.png' });
    await sl(120); await pg.mouse.up(); await sl(150);
    const target = await pg.evaluate(() => { const m = Store.device('d-seam').curtains[0]; return m.move ? m.move.target : Math.round(m.q); });
    const gap = await rec;
    const pass = /%|Open/.test(bubble) && target > 10 && gap >= base - 1;   // the halves may overlap at the seam as at rest, never cross further
    ok = ok && pass;
    console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: bubble "${bubble}", motor target ${target}, edges overlap at rest ${base.toFixed(1)}, while pulling ${gap.toFixed(1)}`);
  }
  console.log(ok && !errs.length ? 'PASS  seam grab opens the curtain' : 'FAIL', errs);
  await b.close();
})();
