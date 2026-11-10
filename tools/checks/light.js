/* Light: behaviour + page checks.
   node tools/checks/light.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/light.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  const L = () => ev(() => JSON.parse(JSON.stringify(Store.device('d-light'))));
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(400);

  let s = await ev(() => { const t = document.querySelector('.tile[data-id="d-light"]'); return t && t.querySelector('.tile-status').textContent.trim(); });
  ok('Home: the light has a tile ("Off")', s === 'Off', s);
  await click('.tile[data-id="d-light"] .tile-power'); await sl(300);
  s = await ev(() => document.querySelector('.tile[data-id="d-light"]').className + ' | ' + document.querySelector('.tile[data-id="d-light"] .tile-status').textContent.trim());
  ok('Home: tile power turns it on (white tile, "On · 80%")', /\bon\b/.test(s) && /On · 80%/.test(s), s);
  await click('.tile[data-id="d-light"] .tile-power');

  await pg.goto(root + 'device.html?id=d-light'); await sl(500);
  s = await ev(() => ({ br: document.querySelector('[data-live="br"]').textContent, dis: document.querySelector('[data-lt="hs"]').getAttribute('aria-disabled'), pressed: document.querySelector('.lt-toggle').getAttribute('aria-pressed') }));
  ok('Off: brightness shows "–", colour is locked', s.br === '–' && s.dis === 'true' && s.pressed === 'false', JSON.stringify(s));
  // dragging brightness on an off light turns it on (spec)
  const bb = await (await pg.$('[data-lt="br"]')).boundingBox();
  await pg.mouse.move(bb.x + bb.width * 0.3, bb.y + bb.height / 2); await pg.mouse.down(); await sl(500);
  await pg.mouse.move(bb.x + bb.width * 0.4, bb.y + bb.height / 2); await sl(60);   // 30 → 40: the digits roll
  const mid = await ev(() => ({ html: document.querySelector('[data-live="br"]').innerHTML, rolled: /class="nr/.test(document.querySelector('[data-live="br"]').innerHTML) }));
  await pg.mouse.move(bb.x + bb.width * 0.55, bb.y + bb.height / 2, { steps: 6 }); await pg.mouse.up(); await sl(500);
  let d = await L();
  ok('Brightness drag on an off light turns it on', d.channels[0].on === true && Math.abs(d.channels[0].br - 55) <= 2, `on ${d.channels[0].on}, ${d.channels[0].br}%`);
  ok('Brightness number rolls while dragging', mid.rolled, mid.html.slice(0, 60));
  await sl(1200);
  s = await ev(() => getComputedStyle(document.querySelector('.lt-toggle .knob'), '::after').content);
  ok('On: no glow around the toggle (same as the relay)', s === 'none' || s === 'normal', s);
  // white tone
  const kb = await (await pg.$('[data-lt="ct"]')).boundingBox(); await pg.mouse.click(kb.x + kb.width * 0.99, kb.y + 25); await sl(400);
  d = await L(); ok('White tone: right end = the bulb\'s coldest (6500 K)', d.channels[0].k === 6500 && d.channels[0].mode === 'ct', d.channels[0].k + ' K');
  // colour
  // colour: Figma 6560:49941 — dot column (white, separator, 4 colours) + the colour picture
  s = await ev(() => ({ dots: [...document.querySelectorAll('.lt-dots button')].map((x) => getComputedStyle(x).backgroundColor).join(' '), sep: !!document.querySelector('.lt-dots .lt-sep'),
    pic: /colour-field/.test(getComputedStyle(document.querySelector('.lt-pic')).backgroundImage), r: getComputedStyle(document.querySelector('.lt-pic')).borderTopLeftRadius }));
  ok('Colour: Figma dots (white, separator, blue, mint, red, purple) + picture with radius 24', s.sep && s.pic && s.r === '24px' && s.dots === 'rgb(255, 253, 245) rgb(0, 173, 248) rgb(14, 253, 160) rgb(255, 37, 99) rgb(175, 82, 222)', JSON.stringify(s));
  const fb = await (await pg.$('[data-lt="hs"]')).boundingBox(); await pg.mouse.click(fb.x + fb.width * 0.97, fb.y + fb.height * 0.5); await sl(400);
  d = await L(); s = await ev(() => ({ ring: !document.querySelector('.lt-ring').classList.contains('hidden'), ct: document.querySelector('[data-lt="ct"]').classList.contains('is-colour') }));
  ok('Colour picture: right edge picks green (the colour under the finger), knob shows, white tone fades', d.channels[0].mode === 'hs' && d.channels[0].h > 90 && d.channels[0].h < 160 && s.ring && s.ct, `${d.channels[0].rgb} h ${d.channels[0].h}`);
  await click('[data-action="lt-swatch"][data-n="red"]'); await sl(200); d = await L();
  s = await ev(() => ({ ring: getComputedStyle(document.querySelector('[data-n="red"]'), '::after').borderTopColor, x: +document.querySelector('[data-lt="hs"]').style.getPropertyValue('--x') }));
  ok('Colour dot: red — white ring inside the dot, knob jumps to red in the picture', d.channels[0].rgb === '#ff2563' && s.ring === 'rgb(255, 255, 255)' && (s.x < 0.25), JSON.stringify(s));
  s = await ev(() => ({ tile: document.querySelector('.channel-grid .tile .tile-icon, .lt-toggle') && (document.querySelector('.channel-grid .tile .tile-icon') || {}).style?.color || '', knob: document.querySelector('.lt-ring').style.background }));
  await pg.goto(root + 'index.html'); await sl(400);
  const home = await ev(() => { const t = document.querySelector('.tile[data-id="d-light"] .tile-icon'); return t ? t.getAttribute('style') || '' : ''; });
  const yellow = await ev(() => getComputedStyle(document.body).getPropertyValue('--yellow').trim());
  ok('Widget bulb icon does not take the lamp colour (yellow like relay lights); only the picture knob shows the colour', /var\(--yellow\)/.test(home) && /255, 37, 99|ff2563/i.test(s.knob), home + ' || knob ' + s.knob + ' || yellow ' + yellow);
  await pg.goto(root + 'device.html?id=d-light'); await sl(400);
  await click('[data-action="lt-white"]'); await sl(200); d = await L();
  ok('Reset icon: back to white', d.channels[0].mode === 'ct');
  // effects (mood only)
  s = await ev(() => [...document.querySelectorAll('[data-action="lt-fx"]')].map((x) => x.textContent).join(','));
  ok('Effects: only mood effects (no blink / okay / stop effect)', s === 'Candle,Fireplace,Colour loop,Sunrise,Sunset', s);
  await click('[data-action="lt-fx"][data-n="candle"]'); await sl(200);
  s = await ev(() => ({ chip: document.querySelector('[data-n="candle"]').getAttribute('aria-pressed'), cls: document.querySelector('.lt-toggle').className }));
  ok('Candle: chip on', s.chip === 'true', JSON.stringify(s));
  await click('[data-action="lt-fx"][data-n="candle"]'); await sl(200); d = await L();
  ok('Tap the effect again: stops', d.channels[0].fx === null);
  await click('[data-action="lt-fx"][data-n="sunrise"]'); await sl(2300); d = await L();
  ok('Sunrise: brightness and tone climb by themselves', d.channels[0].br > 5 && d.channels[0].br < 60 && d.channels[0].k > 2000, `${d.channels[0].br}% ${d.channels[0].k} K`);
  await click('[data-action="lt-fx"][data-n="sunrise"]');
  // power cut → "After a power cut" = previous
  await ev(() => { const x = Store.device('d-light'); x.channels[0].on = true; x.settings.startup = { mode: 'custom', k: 3000, br: 60 }; Store.save(); });
  await pg.goto(root + 'device.html?id=d-light'); await sl(300);
  await click('[data-action="pp-power"]'); await sl(300);
  s = await ev(() => ({ ban: !!document.querySelector('[data-key="ban-off"]'), dis: document.querySelector('.lt-toggle').disabled }));
  ok('Power cut: offline banner, toggle disabled', s.ban && s.dis, JSON.stringify(s));
  await click('[data-action="pp-power"]'); await sl(300); d = await L();
  ok('Power back: last state = on, with the chosen colour (3000 K, 60 %)', d.channels[0].on && d.channels[0].k === 3000 && d.channels[0].br === 60, `${d.channels[0].on} ${d.channels[0].k} ${d.channels[0].br}`);
  // bulb on a normal wall switch
  await click('[data-action="pp-wall"]'); await sl(300);
  s = await ev(() => ({ ban: (document.querySelector('[data-key="ban-pw"]') || {}).textContent || '', dis: document.querySelector('[data-lt="br"]').getAttribute('aria-disabled') }));
  ok('Wall switch off: "No power" banner, controls locked', /No power/.test(s.ban) && s.dis === 'true', JSON.stringify(s));
  await click('[data-action="pp-wall"]'); await sl(300); d = await L();
  ok('Wall switch on: the bulb comes back (last state)', d.channels[0].on === true && d.channels[0].pw !== false);

  // 3-gang dimmer
  await ev(() => { const x = Devices.light.create('moes3', { name: 'Ceiling', roomId: 'r-living' }); x.id = 'd-dim'; x.isNew = false; Store.state.devices.push(x); Store.save(); });
  await pg.goto(root + 'device.html?id=d-dim'); await sl(400);
  s = await ev(() => ({ tiles: document.querySelectorAll('.channel-grid .tile').length, pick: document.querySelectorAll('.ch-picker [role="tab"]').length, fx: !!document.querySelector('[data-action="lt-fx"]'), timer: !!document.querySelector('[data-action="lt-timer"]'), power: !!document.querySelector('[data-live="w"]') }));
  ok('Dimmer: a tile per gang, gang picker, timer + power, no colour / effects', s.tiles === 3 && s.pick === 3 && !s.fx && s.timer && s.power, JSON.stringify(s));
  await click('.ch-picker [data-ch="1"]'); await sl(200);
  const b2 = await (await pg.$('[data-lt="br"]')).boundingBox(); await pg.mouse.click(b2.x + b2.width * 0.5, b2.y + 25); await sl(400);
  d = await ev(() => JSON.parse(JSON.stringify(Store.device('d-dim'))));
  ok('Picker: the slider drives the chosen gang only', d.channels[1].on && d.channels[1].br === 50 && !d.channels[0].on, `${d.channels.map((c) => c.on + '/' + c.br).join(' ')}`);
  await click('[data-action="lt-timer"]'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.preset-grid button')].map((x) => x.textContent.trim()).join(','));
  ok('Timer: the 5 most used times + Custom', s === '5min,15min,30min,1hour,2hours,Custom', s);
  await click('[data-action="tm-custom"]'); await sl(500);
  s = await ev(() => ({ h: document.querySelector('[data-wheel="h"]').getAttribute('aria-valuenow'), m: document.querySelector('[data-wheel="m"]').getAttribute('aria-valuenow'), end: document.querySelector('[data-live="tw-end"]').textContent, top: document.querySelector('[data-wheel="m"]').scrollTop }));
  ok('Custom: wheels open at 0 h 45 min (scrolled to it), "Turns off at …" shown', s.h === '0' && s.m === '45' && s.top === 1800 && /Turns off at \d+:\d\d/.test(s.end), JSON.stringify(s));
  // turn the wheels: 1 h 0 min → 0 h → Start must lock at 0:00, then 0 h 2 min
  // mouse drag: pull the minutes up by 3 rows, slowly → 48; then a quick flick down carries on further than the drag
  const mw = await (await pg.$('[data-wheel="m"]')).boundingBox();
  await pg.mouse.move(mw.x + mw.width / 2, mw.y + 100); await pg.mouse.down();
  for (let k = 1; k <= 12; k++) { await pg.mouse.move(mw.x + mw.width / 2, mw.y + 100 - k * 10); await sl(30); }
  await sl(150); await pg.mouse.up(); await sl(700);
  s = await ev(() => document.querySelector('[data-wheel="m"]').getAttribute('aria-valuenow') + ' @' + document.querySelector('[data-wheel="m"]').scrollTop);
  ok('Custom: mouse drag turns the wheel (45 → 48) and settles on a number', s === '48 @1920', s);
  await pg.mouse.move(mw.x + mw.width / 2, mw.y + 60); await pg.mouse.down();
  for (let k = 1; k <= 4; k++) { await pg.mouse.move(mw.x + mw.width / 2, mw.y + 60 + k * 15); await sl(8); }
  await pg.mouse.up(); await sl(900);
  s = await ev(() => +document.querySelector('[data-wheel="m"]').getAttribute('aria-valuenow'));
  ok('Custom: a quick flick carries on past the 60 px drag (more than 1–2 steps back)', s < 46 && s >= 0, String(s));
  await ev(() => { document.querySelector('[data-wheel="m"]').scrollTop = 0; }); await sl(400);
  s = await ev(() => document.querySelector('[data-action="tm-go"]').disabled);
  ok('Custom: 0 h 0 min — Start is locked', s === true, String(s));
  await ev(() => { document.querySelector('[data-wheel="m"]').scrollTop = 80; }); await sl(400);
  await click('[data-action="tm-go"]'); await sl(300); await click('[data-action="sheet-close"]'); await sl(400);
  s = await ev(() => document.querySelector('[data-live="timer"]').textContent);
  d = await ev(() => Store.device('d-dim').tmCustom);
  ok('Custom 2 min: counts down on the row and is remembered for next time', /Off in (1:5\d|2:00)/.test(s) && d === 120, s + ' | ' + d);

  // settings
  await pg.goto(root + 'device-settings.html?id=d-dim'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.list-header')].map((h) => h.textContent).join(','));
  ok('Settings: Lights, Power cut, Dimming, Lights on the device', s === 'Lights,Power cut,Dimming,Lights on the device', s);
  await click('[data-action="ls-feature"][data-k="dimRange"]'); await sl(400);
  await click('[data-action="lf-rng"][data-x="min"][data-d="1"]'); await sl(200);
  d = await ev(() => Store.device('d-dim').settings.dimRange[0]); ok('Dimming range: lowest goes 10 → 15 %', d.min === 15, JSON.stringify(d));
  await click('[data-action="sheet-close"]'); await sl(400);
  await pg.goto(root + 'device-settings.html?id=d-light'); await sl(400);
  await click('[data-action="ls-toggle"][data-k="executeIfOff"]').catch(() => {});
  s = await ev(() => Store.device('d-light').features.includes('executeIfOff'));
  ok('Hue bulb has no "Change while off" (only the bulbs that report it)', !s);
  for (const u of ['index.html', 'about-device.html?id=d-light', 'add-device.html?via=zigbee', 'device.html?id=d-contact', 'device.html?id=d-curtain']) { await pg.goto(root + u); await sl(400); }
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
