const { webkit, chromium } = require('playwright'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  for (const [name, bt] of [['wk', webkit], ['cr', chromium]]) {
    const b = name === 'cr' ? await bt.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }) : await bt.launch();
    const pg = await (await b.newContext({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 1 })).newPage();
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const F = 'file://' + require('path').resolve(__dirname, '../../dist/samo-home-relays.html');
    const shot = async (f) => (await pg.$('.phone')).screenshot({ path: require('path').join(require('os').tmpdir(), `samo-${name}-${f}.png`) });
    await pg.goto(F); await sl(600); await shot('home');
    const id = await pg.evaluate(() => Store.state.devices.find(d => d.preset === 'touch3').id);
    await pg.goto(F + '#/device.html?id=' + id); await sl(600); await shot('dev');
    await pg.evaluate(() => document.querySelector('[data-action="relay-timer"]').click()); await sl(800);
    const w = await pg.evaluate(() => [...document.querySelectorAll('.ch-picker button')].map(b => b.getBoundingClientRect().width.toFixed(1)).join(' '));
    await pg.evaluate(() => document.querySelector('.ch-picker button[data-ch="2"]').click()); await sl(120); await shot('tabmid');
    await sl(600); await shot('tab');
    const w2 = await pg.evaluate(() => [...document.querySelectorAll('.ch-picker button')].map(b => b.getBoundingClientRect().width.toFixed(1)).join(' '));
    await pg.evaluate(() => UI.closeSheet()); await sl(400);
    await pg.goto(F + '#/device-settings.html?id=' + id); await sl(600);
    await pg.evaluate(() => [...document.querySelectorAll('[data-action="rs-feature"]')].find(x => /Button backlight/.test(x.textContent)).click()); await sl(800); await shot('sheet');
    console.log(name, 'tabs', w, '→', w2, 'errors', errs.length ? errs : 'none');
    await b.close();
  }
})();
