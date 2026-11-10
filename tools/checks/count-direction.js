const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage();
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  await pg.goto(root + 'index.html'); await sl(300);
  await pg.evaluate(() => { const r = Devices.relay.create('all', { name: 'R' }); r.id = 'd-r'; r.isNew = false; r.settings.interlock = false; Store.state.devices.push(r); Store.save(); });
  await pg.goto(root + 'device.html?id=d-r'); await sl(400);
  for (const [sel, n] of [['[data-action="relay-toggle"][data-ch="0"]', 'on'], ['[data-action="relay-toggle"][data-ch="1"]', 'on2'], ['[data-action="relay-master"]', 'all off']]) {
    const seq = await pg.evaluate((sel) => new Promise(res => { const out = []; const e = document.querySelector('[data-live="w"]'); document.querySelector(sel).click(); const f = () => { out.push(parseFloat(e.textContent)); out.length < 45 ? requestAnimationFrame(f) : res(out); }; requestAnimationFrame(f); }), sel);
    const up = seq[seq.length - 1] >= seq[0];
    const mono = seq.every((v, i) => !i || (up ? v >= seq[i - 1] : v <= seq[i - 1]));
    console.log(mono ? 'PASS' : 'FAIL', n, 'monotonic', seq[0], '→', seq[seq.length - 1], mono ? '' : seq.slice(0, 6).join(','));
    await sl(300);
  }
  await b.close();
})();
