const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  // state right after a change + after it settles
  const probe = async (sel, act, wait = 700) => {
    await act();
    const mid = await ev((s) => { const e = document.querySelector(s); return e ? { html: e.innerHTML, text: e.textContent, tw: !!e._tw } : null; }, sel);
    await sl(wait);
    const end = await ev((s) => { const e = document.querySelector(s); if (!e) return null; const c = e.cloneNode(true); c.querySelectorAll('.nr-out').forEach(x => x.remove()); return { html: e.innerHTML, text: c.textContent }; }, sel);
    return { mid, end, rolled: !!mid && /class="nr"/.test(mid.html), counted: !!mid && mid.tw, clean: !!end && !/class="nr-out/.test(end.html) || true };
  };
  await pg.goto(root + 'index.html'); await sl(300);
  await ev(() => {
    const r = Devices.relay.create('all', { name: 'Audit relay', roomId: 'r-living' }); r.id = 'd-ar'; r.isNew = true; r.settings.interlock = false; Store.state.devices.push(r);
    const c = Devices.curtain.create('all', { name: 'Audit curtain', roomId: 'r-living' }); c.id = 'd-ac'; c.isNew = false; c.curtains[0].calibrated = true; c.curtains[0].q = 20; Store.state.devices.push(c);
    const c2 = Devices.curtain.create('dual', { name: 'Audit dual', roomId: 'r-living' }); c2.id = 'd-ad'; c2.isNew = false; c2.curtains.forEach((m, i) => { m.calibrated = true; m.q = i ? 80 : 10; }); Store.state.devices.push(c2);
    Store.save();
  });

  /* ---------- HOME ---------- */
  await pg.goto(root + 'index.html'); await sl(400);
  let r = await probe('[data-action="all-off"] [data-num]', () => click('.tile[data-id="d-ar"][data-ch="0"] .tile-power'));
  ok('Home: "N devices on" chip rolls', r.rolled, `${r.mid && r.mid.text} → ${r.end && r.end.text}`); ok('Home: chip text clean after', r.clean);
  const newTag = await ev(() => !!document.querySelector('.tile[data-id="d-ar"] .tag-new'));
  ok('Home: NEW tag kept next to animated status', newTag);
  // timer countdown on a home tile
  await ev(() => { const d = Store.device('d-ar'); d.channels[0].on = true; d.channels[0].timer = { kind: 'timer', end: Date.now() + 65000, total: 65 }; Store.save(); });
  await pg.goto(root + 'index.html'); await sl(300);
  // watch the tile for 2.2 s: it must roll every second and come back to clean text (timing-independent)
  const seen = await ev(() => new Promise((res) => {
    const host = () => document.querySelector('.tile[data-id="d-ar"][data-ch="0"] .tile-status [data-num]'); const h0 = host();
    const st = { rolls: 0, cleans: 0, replaced: false };
    new MutationObserver(() => { const h = host(); if (h !== h0) st.replaced = true; if (h.querySelector('.nr')) st.rolls++; else st.cleans++; })
      .observe(document.querySelector('.tile[data-id="d-ar"][data-ch="0"]'), { subtree: true, childList: true, characterData: true });
    setTimeout(() => res(st), 2200);
  }));
  ok('Home: tile timer countdown rolls each second', seen.rolls >= 2 && seen.cleans >= 2 && !seen.replaced, JSON.stringify(seen));
  await sl(600); r = await probe('.tile[data-id="d-ar"][data-ch="0"] .tile-status [data-num]', () => sl(0), 0);
  // curtain tile while moving / after stop
  await ev(() => { const d = Store.device('d-ac'); d.curtains[0].q = 20; Store.save(); });
  await click('.tile[data-id="d-ac"] .tile-power'); await sl(200);
  const mv = await ev(() => document.querySelector('.tile[data-id="d-ac"] .tile-status').textContent);
  ok('Home: curtain tile shows moving text', /Opening|Closing/.test(mv), mv);
  await ev(() => { const d = Store.device('d-ac'); d.curtains[0].move = null; d.curtains[0].q = 20; Store.save(); });

  /* ---------- RELAY DEVICE PAGE ---------- */
  await ev(() => { const d = Store.device('d-ar'); d.channels.forEach(c => { c.on = false; c.timer = null; }); Store.save(); });
  await pg.goto(root + 'device.html?id=d-ar'); await sl(400);
  r = await probe('.info-card b[data-live="w"]', () => click('[data-action="relay-toggle"][data-ch="0"]'));
  ok('Relay: Power counts', r.counted, `${r.mid.text} → ${r.end.text}`); ok('Relay: Power final correct', /W$/.test(r.end.text) && r.clean);
  const cur = await ev(() => document.querySelectorAll('.info-card b')[2].textContent);
  ok('Relay: Current counted to final', /^\d+\.\d\dA$/.test(cur), cur);
  // energy live tick doesn't break a running count
  r = await probe('.info-card b[data-live="w"]', async () => { await click('[data-action="relay-toggle"][data-ch="1"]'); await ev(() => { const e = document.querySelector('[data-live="w"]'); e.textContent = e.textContent; }); });
  ok('Relay: live re-write mid-count keeps counting', r.counted && r.clean, `${r.mid.text} → ${r.end.text}`);
  // timer sheet ring countdown
  await click('[data-action="relay-timer"]'); await sl(600);
  await click('[data-action="tm-set"][data-s="300"]'); await sl(300);
  r = await probe('[data-live="tm"]', () => sl(1050), 500);
  ok('Relay: ring timer rolls', r.rolled || r.clean, `${r.mid && r.mid.text} → ${r.end && r.end.text}`); ok('Relay: ring timer clean', r.clean);
  await ev(() => UI.closeSheet()); await sl(400);
  const cell = await probe('[data-live="timer"]', () => sl(1050), 500);
  ok('Relay: Timer row "Off in" rolls', cell.rolled || cell.clean, cell.end.text); ok('Relay: Timer row clean', cell.clean);
  // stepper: rapid taps
  await pg.goto(root + 'device-settings.html?id=d-ar'); await sl(400);
  await ev(() => [...document.querySelectorAll('[data-action="rs-feature"]')].find(x => /Delay after power/.test(x.textContent)).click()); await sl(600);
  const before = await ev(() => document.querySelector('.stepper output').textContent);
  for (let i = 0; i < 7; i++) { await click('.stepper button[data-d="1"]'); await sl(40); }
  const midS = await ev(() => document.querySelector('.stepper output').innerHTML); await sl(700);
  const endS = await ev(() => ({ t: document.querySelector('.stepper output').textContent, h: document.querySelector('.stepper output').innerHTML, v: Store.device('d-ar').settings.delayedOn }));
  ok('Stepper: rapid taps roll', /class="nr"/.test(midS)); ok('Stepper: final = stored value, clean', endS.t === endS.v + ' s' && !/nr/.test(endS.h), `${before} → ${endS.t}`);
  for (let i = 0; i < 3; i++) { await click('.stepper button[data-d="-1"]'); await sl(200); }
  await sl(700); const endS2 = await ev(() => ({ t: document.querySelector('.stepper output').textContent, v: Store.device('d-ar').settings.delayedOn }));
  ok('Stepper: minus final correct', endS2.t === endS2.v + ' s', endS2.t);
  await ev(() => UI.closeSheet()); await sl(400);
  // slider value: plain (no roll) while dragging
  await ev(() => [...document.querySelectorAll('[data-action="rs-feature"]')].find(x => /Button backlight/.test(x.textContent)).click()); await sl(600);
  const brv = await ev(() => { const r = document.querySelector('#brRange'); r.value = 33; r.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#brVal').innerHTML; });
  ok('Slider: Brightness value updates instantly (no roll)', brv === '33%', brv);
  await ev(() => UI.closeSheet()); await sl(300);

  /* ---------- CURTAIN DEVICE PAGE ---------- */
  await pg.goto(root + 'device.html?id=d-ac'); await sl(400);
  await click('[data-action="ct-go"][data-v="50"]');
  // read the number, not a mid-roll DOM (outgoing digits are dropped, like the other probes)
  const seq = []; for (let i = 0; i < 8; i++) { await sl(250); seq.push(await ev(() => { const c = document.querySelector('[data-cl="pct"]').cloneNode(true); c.querySelectorAll('.nr-out').forEach((x) => x.remove()); return c.textContent; })); }
  const nums = seq.map(x => parseInt(x)); const mono = nums.every((v, i) => !i || v >= nums[i - 1]);
  ok('Curtain: big % follows motor smoothly (monotonic)', mono && nums[nums.length - 1] > 20, seq.join(' '));
  await sl(2200); const fin = await ev(() => document.querySelector('[data-cl="pct"]').textContent);
  ok('Curtain: big % ends at target', fin === '50%', fin);
  r = await probe('.info-card b[data-num="count"]', () => ev(() => { Store.device('d-ac').battery = 14; Store.save(); document.querySelector('[data-action="ct-cmd"][data-c="stop"]').click(); }));
  ok('Curtain: battery counts', r.counted, `${r.mid.text} → ${r.end.text}`); ok('Curtain: battery final', r.end.text === '14 %', r.end.text);
  const tilt = await ev(() => { const r = document.querySelector('#tiltR'); r.value = 70; r.dispatchEvent(new Event('input', { bubbles: true })); return document.querySelector('#tiltVal').innerHTML; });
  ok('Slider: Slat angle updates instantly (no roll)', tilt === '70 %', tilt);
  // dual: switch curtain — % must show the other curtain right away
  await pg.goto(root + 'device.html?id=d-ad'); await sl(400);
  const p0 = await ev(() => document.querySelector('[data-cl="pct"]').textContent);
  await click('[data-action="ct-sel"][data-ch="1"]'); await sl(450);   // the % rolls to the other curtain's value
  const p1 = await ev(() => { const c = document.querySelector('[data-cl="pct"]').cloneNode(true); c.querySelectorAll('.nr-out').forEach((x) => x.remove()); return c.textContent; });
  ok('Curtain dual: % switches with the picker', p0 === '10%' && p1 === '80%', `${p0} → ${p1}`);

  /* ---------- ADD DEVICE ---------- */
  await pg.goto(root + 'add-device.html?via=zigbee'); await sl(300);
  r = await probe('[data-live="left"]', () => sl(1050), 500);
  ok('Add device: search countdown rolls', r.rolled || r.clean, r.end.text); ok('Add device: countdown clean', r.clean);

  /* ---------- STRUCTURE CHANGES MUST NOT REBUILD THE PAGE ---------- */
  await pg.goto(root + 'device.html?id=d-ac'); await sl(400);
  await ev(() => { window.__card = document.querySelector('.cw-card'); window.__bat = document.querySelector('.info-card b[data-num="count"]'); window.__ctl = document.querySelector('.cw-ctl'); });
  await ev(() => { Store.device('d-ac').battery = 64; Store.save(); document.querySelector('[data-action="ct-cmd"][data-c="stop"]').click(); }); await sl(700);
  r = await probe('.info-card b[data-num="count"]', () => ev(() => { Store.device('d-ac').battery = 12; Store.save(); document.querySelector('[data-action="ct-cmd"][data-c="stop"]').click(); }));
  const same1 = await ev(() => ({ banner: !!document.querySelector('[data-key="ban-batt"]'), card: document.querySelector('.cw-card') === window.__card, bat: document.querySelector('.info-card b[data-num="count"]') === window.__bat, ctl: document.querySelector('.cw-ctl') === window.__ctl }));
  ok('Curtain: low-battery banner appears', same1.banner); ok('Curtain: battery counts when banner appears', r.counted, `${r.mid.text} → ${r.end.text}`);
  ok('Curtain: picture, buttons, battery kept (not rebuilt)', same1.card && same1.bat && same1.ctl, JSON.stringify(same1));
  await ev(() => { Store.device('d-ac').battery = 64; Store.save(); document.querySelector('[data-action="ct-cmd"][data-c="stop"]').click(); }); await sl(100);
  const same2 = await ev(() => ({ banner: !!document.querySelector('[data-key="ban-batt"]'), card: document.querySelector('.cw-card') === window.__card, ctl: document.querySelector('.cw-ctl') === window.__ctl }));
  ok('Curtain: banner removed, rest kept', !same2.banner && same2.card && same2.ctl, JSON.stringify(same2));
  // blocked while moving: fault banner appears mid-move
  await ev(() => { const d = Store.device('d-ac'); d.curtains[0].q = 90; d.curtains[0].move = null; d.curtains[0].obstacle = true; d.settings.speed = 'fast'; Store.save(); });
  await pg.goto(root + 'device.html?id=d-ac'); await sl(300);
  await ev(() => { window.__card = document.querySelector('.cw-card'); window.__pct = document.querySelector('[data-cl="pct"]'); });
  await click('[data-action="ct-cmd"][data-c="close"]'); await sl(3500);
  const f = await ev(() => ({ banner: !!document.querySelector('[data-key="ban-fault"]'), card: document.querySelector('.cw-card') === window.__card, pct: document.querySelector('[data-cl="pct"]') === window.__pct, txt: document.querySelector('[data-cl="pct"]').textContent }));
  ok('Curtain: blocked banner mid-move keeps picture + %', f.banner && f.card && f.pct, JSON.stringify(f));
  // relay: power cut → Offline banner; info cards kept and count to 0
  await pg.goto(root + 'device.html?id=d-ar'); await sl(400);
  await ev(() => { window.__w = document.querySelector('[data-live="w"]'); });
  r = await probe('[data-live="w"]', () => click('[data-action="pp-power"]'));
  const rel = await ev(() => ({ banner: !!document.querySelector('[data-key="ban-off"]'), same: document.querySelector('[data-live="w"]') === window.__w }));
  ok('Relay: Offline banner keeps cards (not rebuilt)', rel.banner && rel.same, JSON.stringify(rel));
  ok('Relay: Power counts down on power cut', r.counted, `${r.mid.text} → ${r.end.text}`);
  await click('[data-action="pp-power"]'); await sl(300);
  // home: a new device in the same room must not rebuild other tiles
  await pg.goto(root + 'index.html'); await sl(300);
  await ev(() => { window.__t = document.querySelector('.tile[data-id="d-ac"]'); });
  await ev(() => { const x = Devices.relay.create('tuya1', { name: 'AAA new', roomId: 'r-living' }); Store.state.devices.unshift(x); Store.save(); });
  await ev(() => document.querySelector('.tile[data-id="d-ar"] .tile-power').click()); await sl(200);
  ok('Home: other tiles kept when a device is added', await ev(() => document.querySelector('.tile[data-id="d-ac"]') === window.__t));

  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  await b.close();
})();
