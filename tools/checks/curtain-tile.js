/* Curtain tile on Home: two buttons side by side (open + close; roller: up + down) instead of power.
   Tap starts the move, the % runs in the status ("Closing 53 %"), tap the same button again → stops where it is.
   node tools/checks/curtain-tile.js     (PUPPETEER=tools/checks/webkit-shim.js for Safari's engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 390, height: 844 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const R = 'file://' + require('path').resolve(__dirname, '../..') + '/'; const ev = (f, ...a) => pg.evaluate(f, ...a);
  await pg.goto(R + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(R + 'index.html'); await sl(300);
  for (const style of ['left', 'roller']) {
    await ev((st) => { const d = Store.state.devices.find((x) => x.type === 'curtain'); d.curtains.forEach((c) => { c.calibrated = true; c.ctime = 20; c.q = 70; c.move = null; }); d.settings.openingStyle = st; Store.save(); }, style);
    await pg.goto(R + 'index.html'); await sl(400);
    const info = () => ev(() => { const d = Store.state.devices.find((x) => x.type === 'curtain'), t = document.querySelector(`.tile[data-id="${d.id}"][data-ch="0"]`);
      return { power: !!t.querySelector('[data-action="tile-power"]'), btns: [...t.querySelectorAll('[data-action="tile-cmd"]')].map((x) => x.dataset.c + (x.classList.contains('active') ? '*' : '')).join(','),
        labels: [...t.querySelectorAll('[data-action="tile-cmd"]')].map((x) => x.getAttribute('aria-label')).join(' | '), status: t.querySelector('.tile-status').textContent.trim(), moving: !!d.curtains[0].move, q: Math.round(d.curtains[0].q), id: d.id }; });
    let s = await info();
    ok(`${style}: two buttons (open + close), no power button`, s.btns === 'open,close' && !s.power, JSON.stringify(s));
    ok(`${style}: words fit the type`, style === 'roller' ? /^Raise .* \| Lower /.test(s.labels) : /^Open .* \| Close /.test(s.labels), s.labels);
    await ev((id) => document.querySelector(`.tile[data-id="${id}"][data-ch="0"] [data-c="close"]`).click(), s.id); await sl(1600);
    s = await info();
    ok(`${style}: tap close → moves, close button active (stop), % runs in the status`, s.moving && s.btns === 'open,close*' && /^(Closing|Lowering) \d+ %$/.test(s.status), JSON.stringify(s));
    await ev((id) => document.querySelector(`.tile[data-id="${id}"][data-ch="0"] [data-c="close"]`).click(), s.id); await sl(500);
    s = await info();
    ok(`${style}: tap it again → stops where it is`, !s.moving && s.q > 0 && s.q < 70 && s.btns === 'open,close' && /^Open \d+ %$/.test(s.status), JSON.stringify(s));
  }
  ok('no page errors', !errs.length, errs.join(' | '));
  await b.close();
  console.log(results.join('\n')); console.log(results.some((r) => r.startsWith('FAIL')) ? 'SOME FAILED' : 'ALL PASS');
})();
