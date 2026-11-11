/* IR remote press shade: pressing a D-pad direction / a rocker half must darken THAT side (not somewhere else),
   and the shade must be a soft patch over the whole disc (not cut to the wedge). Measured from pixels: the disc is
   split into four zones (top / bottom / left / right) and the pressed zone must get the darkest.
   node tools/checks/ir-press.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/ir-press.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const b64 = (x) => (typeof x === 'string' ? x : Buffer.from(x).toString('base64'));   // Playwright returns a Buffer
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  await pg.goto(root + 'index.html'); await pg.evaluate(() => localStorage.clear()); await pg.goto(root + 'device.html?id=d-ir&r=0'); await sl(600);

  // geometry: every shade layer covers the whole disc and is not clipped
  let s = await pg.evaluate(() => { const D = document.querySelector('.ir-dpad').getBoundingClientRect(); return [...document.querySelectorAll('.ir-dpad .sh')].map((x) => { const r = x.getBoundingClientRect(); return [x.className.split(' ')[1], Math.round(r.left - D.left), Math.round(r.top - D.top), Math.round(r.width), Math.round(r.height), getComputedStyle(x).clipPath]; }); });
  ok('Each D-pad shade covers the whole 228 px disc, not clipped', s.length === 4 && s.every((x) => x[1] === 0 && x[2] === 0 && x[3] === 228 && x[4] === 228 && x[5] === 'none'), JSON.stringify(s));

  // pixels: mean brightness of four zones of the disc while a direction is held
  async function zones(sel) {
    const D = await (await pg.$('.ir-dpad')).boundingBox();
    if (sel) { const r = await (await pg.$(sel)).boundingBox(); const fx = { u: [0.5, 0.25], d: [0.5, 0.75], l: [0.25, 0.5], r: [0.75, 0.5] }[sel.slice(-1)]; await pg.mouse.move(D.x + D.width * fx[0], D.y + D.height * fx[1]); await pg.mouse.down(); await sl(250); }
    const shot = await pg.screenshot({ clip: { x: D.x, y: D.y, width: D.width, height: D.height }, encoding: 'base64' }).then(b64);
    if (sel) { await pg.mouse.up(); await sl(500); }
    const page2 = await b.newPage();
    const z = await page2.evaluate((src) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const W = im.width, H = im.height;
      const mean = (x0, y0, x1, y1) => { const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; return s / (d.length / 4); };
      const q = W * 0.12; res({ u: mean(W * 0.35, q * 0.3, W * 0.65, q * 1.8), d: mean(W * 0.35, H - q * 1.8, W * 0.65, H - q * 0.3), l: mean(q * 0.3, H * 0.35, q * 1.8, H * 0.65), r: mean(W - q * 1.8, H * 0.35, W - q * 0.3, H * 0.65) }); }; im.src = 'data:image/png;base64,' + src; }), shot);
    await page2.close();
    return z;
  }
  const base = await zones(null);
  for (const d of ['u', 'd', 'l', 'r']) {
    const z = await zones('.ir-dpad button.' + d);
    const drop = Object.fromEntries(Object.keys(z).map((k) => [k, +(base[k] - z[k]).toFixed(1)]));
    const max = Object.keys(drop).reduce((a, k) => (drop[k] > drop[a] ? k : a), 'u');
    ok(`Press ${({ u: 'up', d: 'down', l: 'left', r: 'right' })[d]}: that side gets the darkest`, max === d && drop[d] > 3, JSON.stringify(drop));
  }
  // rockers: the pressed half darkens near its own end
  for (const [sel, name] of [['.ir-rk button.up', 'Volume +'], ['.ir-rk button.dn', 'Volume −']]) {
    const R = await (await pg.$('.ir-rk')).boundingBox();
    const sample = async () => { const shot = b64(await pg.screenshot({ clip: { x: R.x, y: R.y, width: R.width, height: R.height }, encoding: 'base64' })); const pg2 = await b.newPage();
      const v = await pg2.evaluate((src) => new Promise((res) => { const im = new Image(); im.onload = () => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const W = im.width, H = im.height; const mean = (y0, y1) => { const d = g.getImageData(W * 0.1, y0, W * 0.8, y1 - y0).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; return s / (d.length / 4); }; res({ top: mean(H * 0.02, H * 0.16), bot: mean(H * 0.84, H * 0.98) }); }; im.src = 'data:image/png;base64,' + src; }), shot); await pg2.close(); return v; };
    const b0 = await sample(); const r = await (await pg.$(sel)).boundingBox(); await pg.mouse.move(r.x + r.width / 2, r.y + r.height / 2); await pg.mouse.down(); await sl(250); const b1 = await sample(); await pg.mouse.up(); await sl(500);
    const top = b0.top - b1.top, bot = b0.bot - b1.bot, up = sel.endsWith('up');
    ok(`${name}: its own end darkens`, up ? top > 3 && top > bot * 2 : bot > 3 && bot > top * 2, JSON.stringify({ top: +top.toFixed(1), bot: +bot.toFixed(1) }));
  }
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
