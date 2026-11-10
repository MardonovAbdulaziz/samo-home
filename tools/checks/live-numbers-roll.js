// Curtain % while the motor runs + slider value while dragging: must roll (not jump), never be rebuilt per frame, end exact
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const R = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const out = []; let ok = true; const check = (name, cond, info) => { ok = ok && cond; out.push(`${cond ? 'PASS' : 'FAIL'}  ${name}  — ${info}`); };
  await pg.goto(R + 'index.html'); await sl(300);
  await pg.evaluate(() => { const c = Devices.curtain.create('all', { name: 'P', roomId: 'r-living' }); c.id = 'd-p'; c.isNew = false; c.curtains[0].calibrated = true; c.curtains[0].q = 10; Store.state.devices.push(c); Store.save(); });
  await pg.goto(R + 'device.html?id=d-p'); await sl(800);
  // 1) curtain % while moving 10 → 50
  const rec = pg.evaluate(() => new Promise(res => {
    const host = () => document.querySelector('[data-cl="pct"] [data-num]'); const h0 = host();
    let frames = 0, rolling = 0, replaced = 0; const t0 = performance.now();
    const f = () => { const h = host(); frames++; if (h !== h0) replaced++; if (h && h.querySelector('.nr')) rolling++; if (performance.now() - t0 < 2600) requestAnimationFrame(f); else res({ frames, rolling, replaced, end: h.textContent }); };
    requestAnimationFrame(f);
  }));
  await pg.evaluate(() => document.querySelector('[data-action="ct-go"][data-v="50"]').click());
  await sl(700);
  await pg.evaluate(() => document.querySelectorAll('[data-cl="pct"] .nr-in, [data-cl="pct"] .nr-out').forEach(e => e.getAnimations().forEach(a => a.pause())));
  await (await pg.$('.cw-readout')).screenshot({ path: 'pct-mid.png' });
  await pg.evaluate(() => document.querySelectorAll('[data-cl="pct"] .nr-in, [data-cl="pct"] .nr-out').forEach(e => e.getAnimations().forEach(a => a.play())));
  const r1 = await rec; await sl(1500);
  const fin = await pg.evaluate(() => document.querySelector('[data-cl="pct"]').textContent);
  check('curtain % rolls while the motor moves', r1.rolling > r1.frames * 0.4, `${r1.rolling}/${r1.frames} frames rolling`);
  check('curtain % element never rebuilt', r1.replaced === 0, `${r1.replaced} rebuilds`);
  check('curtain % ends exact', fin === '50%', fin);
  // 2) slat-angle slider: drag and watch the value
  await pg.evaluate(() => document.querySelector('.slider-row').scrollIntoView({ block: 'center' })); await sl(200);
  const rb = await (await pg.$('#tiltR')).boundingBox();
  const rec2 = pg.evaluate(() => new Promise(res => { let rolls = 0, n = 0; const e = document.querySelector('#tiltVal'); const t0 = performance.now(); const f = () => { n++; if (e.querySelector('.nr')) rolls++; if (performance.now() - t0 < 900) requestAnimationFrame(f); else res({ rolls, n }); }; requestAnimationFrame(f); }));
  await pg.mouse.move(rb.x + rb.width * 0.5, rb.y + rb.height / 2); await pg.mouse.down();
  for (let i = 1; i <= 12; i++) { await pg.mouse.move(rb.x + rb.width * (0.5 - i * 0.03), rb.y + rb.height / 2); await sl(30); }
  await pg.mouse.up();
  const r2 = await rec2; await sl(500);
  const tv = await pg.evaluate(() => ({ text: document.querySelector('#tiltVal').textContent, val: document.querySelector('#tiltR').value }));
  check('slider value rolls while dragging', r2.rolls > 3, `${r2.rolls}/${r2.n} frames rolling`);
  check('slider value ends exact', tv.text === tv.val + ' %', `${tv.text} (input ${tv.val})`);
  console.log(out.join('\n')); console.log(ok && !errs.length ? 'PASS  live numbers roll' : 'FAIL', errs);
  await b.close();
})();
