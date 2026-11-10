/* Window sash motion: open ↔ tilt ↔ closed must never jump (the hinge never switches mid-move).
   node tools/checks/contact-window-motion.js */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1300, height: 950, deviceScaleFactor: 2 });
  await pg.goto(root + 'index.html'); await pg.evaluate(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(300);
  await pg.evaluate(() => { const d = Store.device('d-contact'); d.display = 'window'; d.icon = 'dev-window'; d.features.push('windowType'); d.settings.windowType = 'composite_window'; Store.save(); });
  await pg.goto(root + 'device.html?id=d-contact'); await sl(600);
  // sample the sash's on-screen quad every animation frame (getBoxQuads not in Chrome → use 4 probe points via elementFromPoint is fragile; use the glass rect + matrix)
  await pg.evaluate(() => {
    window.__s = []; const el = () => document.querySelector('.ct-sash');
    const tick = () => { const r = el() && el().getBoundingClientRect(); if (r) window.__s.push([performance.now(), r.left, r.top, r.right, r.bottom]); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  });
  const seq = [['1', 'open'], ['tilt', 'tilt'], ['1', 'open'], ['0', 'close'], ['tilt', 'tilt'], ['0', 'close']];
  let i = 0;
  for (const [o, name] of seq) {
    await pg.evaluate((o) => { window.__s.push(['mark']); document.querySelector(`[data-action="pp-move"][data-o="${o}"]`).click(); }, o);
    await sl(1200); i++;
  }
  const s = await pg.evaluate(() => window.__s);
  let worst = 0, at = '', seg = 0;
  for (let k = 1; k < s.length; k++) {
    if (s[k][0] === 'mark') { seg++; continue; } if (s[k - 1][0] === 'mark') continue;
    const d = Math.max(...[1, 2, 3, 4].map((j) => Math.abs(s[k][j] - s[k - 1][j])));
    if (d > worst) { worst = d; at = `step ${seg} (${seq[seg - 1] && seq[seg - 1][1]})`; }
  }
  const ok = worst < 20;
  console.log(`${ok ? 'PASS' : 'FAIL'}  window sash never jumps between frames — largest move ${worst.toFixed(1)} px (${at})`);
  console.log(ok ? 'ALL PASS' : '1 FAILED');
  await b.close();
})();
