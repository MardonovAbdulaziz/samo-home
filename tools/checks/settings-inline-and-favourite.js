const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const R = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const out = []; let ok = true; const check = (n, c, i = '') => { ok = ok && c; out.push(`${c ? 'PASS' : 'FAIL'}  ${n}${i ? '  — ' + i : ''}`); };
  await pg.goto(R + 'index.html'); await sl(300);
  await pg.evaluate(() => {
    const r = Devices.relay.create('all', { name: 'Relay', roomId: 'r-living' }); r.id = 'd-ri'; r.isNew = false; Store.state.devices.push(r);
    const c = Devices.curtain.create('all', { name: 'Curtain', roomId: 'r-living' }); c.id = 'd-ci'; c.isNew = false; c.curtains[0].calibrated = true; c.curtains[0].q = 42; Store.state.devices.push(c); Store.save();
  });
  for (const [id, keys] of [['d-ri', ['childLock', 'interlock', 'nightLed']], ['d-ci', ['invert', 'quiet', 'handPull', 'manualStop', 'childLock']]]) {
    await pg.goto(R + 'device-settings.html?id=' + id); await sl(500);
    for (const k of keys) {
      const before = await pg.evaluate((k) => document.querySelector(`[data-k="${k}"] .switch`)?.getAttribute('aria-checked'), k);
      await pg.evaluate((k) => document.querySelector(`[data-k="${k}"]`).click(), k); await sl(250);
      const after = await pg.evaluate((k) => ({ sw: document.querySelector(`[data-k="${k}"] .switch`)?.getAttribute('aria-checked'), sheet: !!document.querySelector('.sheet.open') }), k);
      check(`${id === 'd-ri' ? 'Relay' : 'Curtain'} ${k}: switches in the row, no sheet`, before && after.sw !== before && !after.sheet, `${before} → ${after.sw}`);
    }
  }
  await pg.goto(R + 'device-settings.html?id=d-ri'); await sl(400);
  await (await pg.$('.screen')).screenshot({ path: 'inline-relay.png' });
  // Motor direction: not a bare switch — a sheet with Normal / Reversed + Open/Stop/Close to try it
  await pg.goto(R + 'device-settings.html?id=d-ci'); await sl(400);
  await pg.evaluate(() => document.querySelector('[data-k="reverse"]').click()); await sl(700);
  const dir = await pg.evaluate(() => ({ opts: [...document.querySelectorAll('.sheet.open [data-action="dir-set"] .option-title')].map((e) => e.textContent), test: document.querySelectorAll('.sheet.open [data-action="dir-cmd"]').length }));
  check('Motor direction sheet: Normal / Reversed + test buttons', dir.opts.join('/') === 'Normal/Reversed' && dir.test === 3, JSON.stringify(dir));
  await pg.evaluate(() => document.querySelector('.sheet.open [data-action="dir-set"][data-v="1"]').click()); await sl(300);
  check('Choosing Reversed saves and resets calibration', await pg.evaluate(() => { const d = Store.device('d-ci'); return d.settings.reverse === true && !d.curtains[0].calibrated; }));
  await pg.evaluate(() => UI.closeSheet()); await sl(400);
  // Favourite position was removed (the 25 / 50 / 75 chips cover it): nowhere in settings or on the page
  await pg.evaluate(() => { const d = Store.device('d-ci'); d.settings.reverse = false; d.curtains[0].calibrated = true; d.curtains[0].q = 80; d.curtains[0].move = null; Store.save(); });
  await pg.goto(R + 'device-settings.html?id=d-ci'); await sl(400);
  check('no Favourite position in curtain settings', await pg.evaluate(() => !document.querySelector('[data-k="favorite"]') && !/Favourite/.test(document.querySelector('.screen').innerText)));
  await pg.goto(R + 'device.html?id=d-ci'); await sl(600);
  const pos = await pg.evaluate(() => ({ chips: [...document.querySelectorAll('.cw-chip')].map((b) => b.textContent.trim()), fav: /Favourite/.test(document.querySelector('.screen').innerText) }));
  check('device page: Position = 25% / 50% / 75%, no favourite', pos.chips.join('/') === '25%/50%/75%' && !pos.fav, JSON.stringify(pos));
  await pg.evaluate(() => document.querySelector('.cw-chip[data-v="50"]').click()); await sl(200);
  check('tap on 50% moves the curtain to 50', await pg.evaluate(() => { const d = Store.device('d-ci'); const t = (d.curtains[0].move || {}).target; return t === (d.settings.invert ? 50 : 50); }));
  console.log(out.join('\n')); console.log(ok && !errs.length ? 'ALL PASS' : 'FAIL', errs);
  await b.close();
})();
