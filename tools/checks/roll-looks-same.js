// For EVERY [data-num] on every screen: force a roll and check the rolling digit looks like the host
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const res = [];
  const checkAll = (where) => pg.evaluate((where) => {
    const out = [];
    document.querySelectorAll('[data-num]').forEach((el, idx) => {
      if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;   // hidden
      const t = el.textContent; if (!/\d/.test(t)) return;
      const next = t.replace(/\d(?!.*\d)/, (c) => String((+c + 1) % 10));         // change the last digit
      el.textContent = next;
      out.push([where, el, t]);
    });
    return new Promise((r) => setTimeout(() => r(out.map(([w, el, t]) => {
      const nr = el.querySelector('.nr-in'); if (!nr) return `NOROLL ${w} "${t}" (${el.dataset.num === 'count' ? 'count' : 'roll'})`;
      const a = getComputedStyle(el), c = getComputedStyle(nr), hb = el.getBoundingClientRect().height, hn = nr.closest('.nr').getBoundingClientRect().height;
      const same = a.fontSize === c.fontSize && a.fontWeight === c.fontWeight && a.color === c.color && Math.abs(hn - parseFloat(a.lineHeight || hb)) < 2;
      return `${same ? 'PASS' : 'FAIL'} ${w} "${t}" host ${a.fontSize}/${a.fontWeight}/${a.lineHeight} digit ${c.fontSize}/${c.fontWeight} h=${hn.toFixed(0)}`;
    })), 40));
  }, where);
  await pg.goto(root + 'index.html'); await sl(300);
  await pg.evaluate(() => { const r = Devices.relay.create('all', { name: 'R', roomId: 'r-living' }); r.id = 'd-r'; r.isNew = false; r.settings.interlock = false; r.channels[0].on = true; r.channels[0].timer = { kind: 'timer', end: Date.now() + 299000, total: 300 }; r.wait = null; Store.state.devices.push(r);
    const c = Devices.curtain.create('all', { name: 'C', roomId: 'r-living' }); c.id = 'd-c'; c.isNew = false; c.curtains[0].calibrated = true; Store.state.devices.push(c); Store.save(); });
  await pg.goto(root + 'index.html'); await sl(400); res.push(...await checkAll('home'));
  await pg.goto(root + 'device.html?id=d-r'); await sl(400); res.push(...await checkAll('relay page'));
  await pg.evaluate(() => document.querySelector('[data-action="relay-timer"]').click()); await sl(600); res.push(...await checkAll('timer sheet'));
  await pg.evaluate(() => UI.closeSheet()); await sl(400);
  await pg.evaluate(() => { const d = Store.device('d-r'); d.wait = { until: Date.now() + 9000 }; Store.save(); }); await pg.goto(root + 'device.html?id=d-r'); await sl(400); res.push(...await checkAll('relay wait banner'));
  await pg.evaluate(() => { Store.device('d-r').wait = null; Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-r'); await sl(400);
  for (const f of ['Delay after power returns', 'Auto-off', 'Protection']) {
    await pg.evaluate((f) => [...document.querySelectorAll('[data-action="rs-feature"]')].find(x => x.querySelector('.cell-title').textContent === f).click(), f); await sl(600);
    if (f === 'Auto-off') { await pg.evaluate(() => document.querySelector('[data-action="rf-toggle"]').click()); await sl(500); }
    res.push(...await checkAll('sheet ' + f)); await pg.evaluate(() => UI.closeSheet()); await sl(400);
  }
  await pg.goto(root + 'device.html?id=d-c'); await sl(400); res.push(...await checkAll('curtain page'));
  await pg.goto(root + 'add-device.html'); await sl(400); res.push(...await checkAll('add device'));
  console.log(res.join('\n')); console.log('errors', errs);
  await b.close();
})();
