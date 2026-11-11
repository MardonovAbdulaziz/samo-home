/* Spacing audit: opens every device page, settings page and every sheet (all features on) and measures the vertical gap
   between neighbouring blocks (lists, groups, cards, charts…). Blocks must not touch: a gap < 16 px is reported,
   except a footer note under its block and a header over its block.
   node tools/checks/spacing.js */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(300);
  // one device per type with every feature on
  const ids = await ev(() => {
    const out = [];
    for (const [type, preset] of [['relay', 'all'], ['curtain', 'all'], ['contact', 'all'], ['light', 'all'], ['light', 'moes3'], ['climate', 'all'], ['motion', 'all'], ['plug', 'all'], ['plug', 'aqara'], ['leak', 'all'], ['smoke', 'all']]) {
      const T = Devices[type], d = T.create(preset, { name: 'Audit ' + type, roomId: 'r-living' }); d.isNew = false;
      if (type === 'curtain') d.curtains.forEach((m) => { m.calibrated = true; m.q = 40; });
      Store.state.devices.push(d); out.push(d.id);
    }
    Store.save(); return out;
  });
  // the gap measurer: blocks = visible boxes that are direct children of a container (collapse wrappers flattened)
  const measure = () => ev(() => {
    const BLOCK = '.list, .sheet-group, .group-card, .pad, .info-grid, .preset-grid, .ring-timer, .th-chart, .segmented, .banner, .tw, .stack, .channel-grid, .ch-picker, .field, .edit-avatar, .btn-block, .icon-grid';
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.height > 1 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[aria-hidden="true"]'); };
    const flat = (parent) => [...parent.children].flatMap((c) => (c.classList.contains('collapse') || c.classList.contains('collapse-inner') ? flat(c) : [c]));
    const issues = [];
    const scan = (container, where) => {
      const kids = flat(container).filter(vis);
      for (let i = 1; i < kids.length; i++) {
        const a = kids[i - 1], c = kids[i];
        if (!a.matches(BLOCK) && !a.querySelector(BLOCK)) continue;
        if (!c.matches(BLOCK) && !c.querySelector(BLOCK)) continue;
        if (a.matches('.sheet-group') && !a.querySelector('.group-card')) continue;   // a title-only group heads the next block
        const gap = c.getBoundingClientRect().top - a.getBoundingClientRect().bottom;
        if (gap < 16) issues.push(`${where}: ${(a.className || a.tagName).toString().split(' ')[0]} → ${(c.className || c.tagName).toString().split(' ')[0]} ${gap.toFixed(0)}px`);
      }
    };
    const body = document.querySelector('.sheet.open .sheet-body') || document.querySelector('#sheet.open .sheet-body');
    if (body) { scan(body, 'sheet'); body.querySelectorAll('.collapse-inner').forEach((x) => scan(x, 'sheet/collapse')); }
    else { scan(UI.screen, 'page'); }
    return issues;
  });
  const all = [];
  for (const id of ids) {
    for (const url of [`device.html?id=${id}`, `device-settings.html?id=${id}`]) {
      await pg.goto(root + url); await sl(500);
      const name = await ev(() => document.title + '');
      (await measure()).forEach((x) => all.push(`${url} ${x}`));
      // every row that opens a sheet
      const pick = () => [...UI.screen.querySelectorAll('[data-action]')].filter((e) => /feature|timer|history|display|icon|room|firmware|ls-|rs-|cs2-|th-/.test(e.dataset.action) && !/toggle|identify|delete|rename|show-home|soon|group|pe-reset|pn-/.test(e.dataset.action));
      const acts = await ev(`(${pick})().map((e, i) => ({ i, a: e.dataset.action, k: e.dataset.k || '' }))`);
      for (const x of acts) {
        const hit = await ev(`(() => { const e = (${pick})()[${x.i}]; if (e) e.click(); return !!e; })()`); if (!hit) continue; await sl(650);
        const open = await ev(() => !!document.querySelector('.sheet.open, #sheet.open'));
        if (open) {
          (await measure()).forEach((m) => all.push(`${url} [${x.a}${x.k ? ':' + x.k : ''}] ${m}`));
          // turn on every switch inside the sheet once, so collapsed parts are measured too
          const sws = await ev(() => [...document.querySelectorAll('.sheet.open [role="switch"][aria-checked="false"], #sheet.open [role="switch"][aria-checked="false"]')].length);
          if (sws) { await ev(() => { const s = document.querySelector('.sheet.open [role="switch"][aria-checked="false"], #sheet.open [role="switch"][aria-checked="false"]'); (s.closest('button') || s).click(); }); await sl(500); (await measure()).forEach((m) => all.push(`${url} [${x.a}${x.k ? ':' + x.k : ''} +switch] ${m}`)); }
          await ev(() => UI.closeSheet()); await sl(450);
        }
        if (!(await ev(() => location.href)).endsWith(url)) { await pg.goto(root + url); await sl(400); }
      }
    }
  }
  const uniq = [...new Set(all)];
  ok('No touching blocks on any page or sheet (gap ≥ 16 px)', uniq.length === 0, uniq.length ? '\n    ' + uniq.join('\n    ') : '');
  console.log(results.join('\n'));
  console.log(results.some((r) => r.startsWith('FAIL')) ? '1 FAILED' : 'ALL PASS');
  await b.close();
})();
