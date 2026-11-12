/* Smoke detector: clear (white) → pre-alarm (orange) → smoke (red, push, white Silence + white Call 101 with a phone icon — static black icon and title, safety scenario,
   interconnect), silence and ringing again, thick smoke refuses silence, air clears, monthly test, cooking pause,
   sensitivity, detectors without a level / with CO, tamper / dust / battery / offline, settings, history.
   node tools/checks/smoke.js            (Chrome)
   PUPPETEER=tools/checks/webkit-shim.js NODE_PATH=… node tools/checks/smoke.js   (Safari engine) */
const p = require(process.env.PUPPETEER || 'puppeteer-core'); const sl = (ms) => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, cond, info = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`);
(async () => {
  const b = await p.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  const pg = await b.newPage(); await pg.setViewport({ width: 1200, height: 900 });
  const errs = []; pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errs.push(m.text()));
  const root = 'file://' + require('path').resolve(__dirname, '../..') + '/';
  const ev = (f, a) => pg.evaluate(f, a);
  const click = (sel) => ev((s) => document.querySelector(s).click(), sel);
  const word = () => ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, cls: document.querySelector('[data-cl="word"]').className, sub: document.querySelector('[data-live="sub"]').textContent, color: getComputedStyle(document.querySelector('[data-cl="word"]')).color }));
  const setPreset = (id) => ev((id) => { const d = Store.device('d-smoke'), S = Devices.smoke, p = S.PRESETS.find((x) => x.id === id); Object.assign(d, { preset: id, features: p.feats.slice(), settings: {} }); Object.assign(d.phys, { level: 0.3, temp: 22, co: false, fading: false }); S.applyDefaults(d); S._evaluate(d); Store.save(); }, id);
  const air = (o) => ev((o) => { const d = Store.device('d-smoke'); Object.assign(d.phys, o); Devices.smoke._evaluate(d); Store.save(); }, o);
  const tile = () => ev(() => { const t = document.querySelector('.tile[data-id="d-smoke"] .tile-status'); return t.className + ' | ' + t.textContent.trim(); });
  await pg.goto(root + 'index.html'); await ev(() => localStorage.clear()); await pg.goto(root + 'index.html'); await sl(400);

  ok('Home tile: "Clear"', /\| Clear$/.test(await tile()), await tile());
  await pg.goto(root + 'device.html?id=d-smoke'); await sl(400);
  let s = await word();
  ok('Page: "Clear" in white, "Checked … ago", last test shown', s.w === 'Clear' && s.color === 'rgb(255, 255, 255)' && /^Checked /.test(s.sub) && await ev(() => /Last test/.test(document.querySelector('.cw-hint').textContent)), JSON.stringify(s));

  // burnt toast → pre-alarm (Heiman measures the level)
  const n0 = await ev(() => Store.state.notifications);
  await click('[data-action="pp-toast"]'); await sl(300);
  s = await word();
  ok('Burnt toast: "A little smoke" in orange + a pre-alarm push', s.w === 'A little smoke' && /open/.test(s.cls) && (await ev(() => Store.state.notifications)) === n0 + 1, JSON.stringify(s));
  // real fire
  await click('[data-action="pp-fire"]'); await sl(300);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, ban: (document.querySelector('[data-key="ban-alarm"]') || {}).textContent || '', hush: !!document.querySelector('[data-action="sm-hush"]'), call: (() => { const c = document.querySelector('a[href="tel:101"]'), h = document.querySelector('[data-action="sm-hush"]'); if (!c || !h) return ''; const cs = getComputedStyle(c), hs = getComputedStyle(h); return [c.textContent.trim(), !!c.querySelector('svg'), cs.backgroundColor, cs.color, hs.backgroundColor, hs.color].join('|'); })(), push: (document.querySelector('.push') || {}).textContent || '', log: Store.device('d-smoke').log.slice(0, 3).map((e) => e.k).join(',') }));
  s = await ev(() => { const c = document.querySelector('.sm-level').getBoundingClientRect(), b = document.querySelector('.sm-bar').getBoundingClientRect(); return [Math.round(b.left - c.left), Math.round(c.right - b.right)].join(','); });
  ok('Smoke level bar fills the card: 16 px on both sides', s === '16,16', s);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, ban: (document.querySelector('[data-key="ban-alarm"]') || {}).textContent || '', hush: !!document.querySelector('[data-action="sm-hush"]'), call: (() => { const c = document.querySelector('a[href="tel:101"]'), h = document.querySelector('[data-action="sm-hush"]'); if (!c || !h) return ''; const cs = getComputedStyle(c), hs = getComputedStyle(h); return [c.textContent.trim(), !!c.querySelector('svg'), cs.backgroundColor, cs.color, hs.backgroundColor, hs.color].join('|'); })(), push: (document.querySelector('.push') || {}).textContent || '', log: Store.device('d-smoke').log.slice(0, 3).map((e) => e.k).join(',') }));
  ok('Real fire: "Smoke!" (no duplicate banner), push, Silence + Call 101 both static white with the same static-black icon and title (user, 2026-11-12), safety scenario + other detectors', s.w === 'Smoke!' && s.ban === '' && s.hush && s.call === 'Call 101|true|rgb(255, 255, 255)|rgb(51, 51, 51)|rgb(255, 255, 255)|rgb(51, 51, 51)' && /Smoke! · Kitchen smoke/.test(s.push) && s.log === 'linked,scene,smoke', JSON.stringify(s).slice(0, 260));
  await pg.goto(root + 'index.html'); await sl(300);
  s = await ev(() => { const t = document.querySelector('.tile[data-id="d-smoke"]'), cs = getComputedStyle(t); return [t.classList.contains('alert'), cs.backgroundColor, getComputedStyle(t.querySelector('.tile-name')).color, getComputedStyle(t.querySelector('.tile-icon')).color, !!t.querySelector('svg mask[id^="mask0_3895_50009"]')].join('|'); });
  ok('Home tile: "Smoke!" alert card (Figma 5429:45566: white, red icon + status, Sensors/Smoke icon)', /tone-danger \| Smoke!$/.test(await tile()) && s === 'true|rgb(255, 255, 255)|rgb(51, 51, 51)|rgb(255, 69, 58)|true', (await tile()) + ' ' + s);
  await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  // silence (17 dB/m: allowed), then the smoke rises → rings again
  await click('[data-action="sm-hush"]'); await sl(300);
  s = await ev(() => ({ sub: document.querySelector('[data-live="sub"]').textContent, hush: !!document.querySelector('[data-action="sm-hush"]') }));
  ok('Silence: "siren silenced", the button goes away', /siren silenced/.test(s.sub) && !s.hush, JSON.stringify(s));
  await air({ level: 22 });
  s = await ev(() => ({ hushed: Store.device('d-smoke').st.hushUntil > Date.now(), log: Store.device('d-smoke').log[0].k }));
  ok('Smoke keeps rising: it rings again', !s.hushed && s.log === 'rering', JSON.stringify(s));
  await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  await click('[data-action="sm-hush"]'); await sl(200);
  s = await ev(() => ({ toast: (document.querySelector('.toast') || {}).textContent || '', hushed: Store.device('d-smoke').st.hushUntil > Date.now() }));
  ok('Very thick smoke (22 dB/m): the detector refuses to silence', /Too much smoke/.test(s.toast) && !s.hushed, JSON.stringify(s));
  // the air clears
  await air({ level: 0.3, temp: 22 }); await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  ok('Air clears: "Clear" again', (await word()).w === 'Clear');

  // monthly test
  await click('[data-action="sm-test"]'); await sl(200);
  s = (await word()).w;
  await ev(() => { const d = Store.device('d-smoke'); d.st.testUntil = Date.now() - 1; Devices.smoke.tick(d); Store.save(); });
  await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  const t = await ev(() => ({ ban: (document.querySelector('[data-key="ban-test"]') || {}).textContent || '', hint: document.querySelector('.cw-hint').textContent }));
  ok('Test: "Testing…", then "Test OK — the app received the alarm", last test today', s === 'Testing…' && /Test OK/.test(t.ban) && /Last test \d+:\d\d/.test(t.hint), JSON.stringify({ s, ...t }));
  await click('[data-action="sm-test-ok"]'); await sl(200);
  const x = await ev(() => !document.querySelector('[data-key="ban-test"]'));
  await ev(() => { const d = Store.device('d-smoke'); d.st.testUntil = Date.now() - 1; Devices.smoke.tick(d); Store.save(); });
  await pg.goto(root + 'device.html?id=d-smoke'); await sl(5600);
  const auto = await ev(() => !document.querySelector('[data-key="ban-test"]'));
  ok('Test OK banner closes: × right away, or by itself after 5 s', x && auto, JSON.stringify({ x, auto }));

  // cooking pause: burnt toast does nothing
  await pg.goto(root + 'device-settings.html?id=d-smoke'); await sl(300);
  s = await ev(() => [...document.querySelectorAll('.list-header')].map((x) => x.textContent).join(','));
  ok('Heiman settings: Detector, Notifications, Automation', s === 'Detector,Notifications,Automation', s);
  await click('[data-action="sm-feature"][data-k="pause"]'); await sl(400);
  s = await ev(() => ({ x: !!document.querySelector('.sheet.open .sheet-x, #sheet.open .sheet-x'), done: [...document.querySelectorAll('.sheet.open .sheet-footer button, #sheet.open .sheet-footer button')].map((b) => b.textContent.trim()).join(',') }));
  ok('Sheets with a close × have no extra Done button', s.x && s.done === '', JSON.stringify(s));
  await click('[data-action="sm-pause-go"]'); await sl(300); await ev(() => UI.closeSheet()); await sl(300);
  await air({ level: 6.5 }); await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  s = await ev(() => ({ w: document.querySelector('[data-cl="word"]').textContent, ban: !!document.querySelector('[data-key="ban-pause"]') }));
  ok('Cooking pause: banner, burnt toast does not alarm', s.w === 'Clear' && s.ban, JSON.stringify(s));
  await ev(() => { const d = Store.device('d-smoke'); d.st.pauseUntil = 0; d.phys.level = 0.3; Devices.smoke._evaluate(d); Store.save(); });

  // sensitivity low: 12 dB/m is only a pre-alarm
  await setPreset('xiaomi');   // Heiman has no sensitivity setting; the Xiaomi does
  await ev(() => { Store.device('d-smoke').settings.sensitivity = 'low'; Store.save(); }); await air({ level: 12 });
  s = await ev(() => { const d = Store.device('d-smoke'); return { state: d.st.state, level: d.st.level, sens: d.settings.sensitivity, feats: d.features.includes('sensitivity'), pause: d.st.pauseUntil, temp: d.temp }; });
  ok('Xiaomi, sensitivity Low: 12 dB/m is a pre-alarm, not an alarm', s.state === 'pre', JSON.stringify(s));
  await air({ level: 0.3 });

  // Tuya (no level, no silence): toast nothing, fire alarm with Call 101 only
  await setPreset('tuya'); await air({ level: 6.5 });
  ok('Tuya (no level): burnt toast stays "Clear"', (await ev(() => Store.device('d-smoke').st.state)) === 'clear');
  await air({ level: 17 }); await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  s = await ev(() => ({ hush: !!document.querySelector('[data-action="sm-hush"]'), call: !!document.querySelector('a[href="tel:101"]'), lvl: !!document.querySelector('[data-key="level"]') }));
  ok('Tuya fire: Call 101, no Silence (it can’t), no level bar', !s.hush && s.call && !s.lvl, JSON.stringify(s));
  // combo: carbon monoxide
  await setPreset('combo'); await pg.goto(root + 'device.html?id=d-smoke'); await sl(300); await click('[data-action="pp-co"]'); await sl(300);
  ok('Combo: CO from the stove → "CO!"', (await word()).w === 'CO!');
  // all features: tamper, dust, battery, offline
  await setPreset('all'); await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  await click('[data-action="pp-tamper"]'); await click('[data-action="pp-dust"]'); await click('[data-action="pp-batt"]'); await sl(300);
  s = await ev(() => ['ban-tamper', 'ban-fault', 'ban-batt'].map((k) => !!document.querySelector(`[data-key="${k}"]`)).join(','));
  ok('Taken down, dusty chamber, battery low: three banners', s === 'true,true,true', s);
  await click('[data-action="pp-online"]'); await pg.goto(root + 'index.html'); await sl(300);
  ok('Offline: home tile "Offline" in red', /tone-danger \| Offline$/.test(await tile()), await tile());
  await ev(() => { Store.device('d-smoke').online = true; Store.save(); });
  await pg.goto(root + 'device-settings.html?id=d-smoke'); await sl(300);
  await click('[data-action="rs-history"]'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.sheet.open .cell-title, #sheet.open .cell-title')].map((x) => x.textContent).join(' | '));
  ok('Event History: alarms, silence, test …', /Smoke alarm/.test(s) && /Siren silenced/.test(s) && /Test OK/.test(s), s.slice(0, 160));
  await ev(() => UI.closeSheet()); await sl(300);

  // change the icon (generic picker for device types without their own): settings avatar, home tile, page mark
  await pg.goto(root + 'device-settings.html?id=d-smoke'); await sl(300);
  await click('.edit-avatar .pen'); await sl(400);
  s = await ev(() => [...document.querySelectorAll('.sheet.open .ip-title, #sheet.open .ip-title')].map((x) => x.textContent).join(','));
  await click('[data-action="dv-icon-pick"][data-n="dev-flame"]'); await sl(400);
  const fl = 'svg mask[id^="mask0_3895_50012"]';
  const av = await ev((fl) => !!document.querySelector('.edit-avatar ' + fl), fl);
  await pg.goto(root + 'index.html'); await sl(300);
  const ti = await ev((fl) => !!document.querySelector('.tile[data-id="d-smoke"] ' + fl), fl);
  await pg.goto(root + 'device.html?id=d-smoke'); await sl(300);
  const mk = await ev((fl) => !!document.querySelector('.lk-mark ' + fl), fl);
  ok('Change icon (Figma 5303:19456 groups, fixed order): the flame shows in settings, on the home tile and the page mark', s === 'Hubs and Network,Lighting,Sockets and Switches,Climate and Air,Windows and Doors,Security,Home Appliances,Multimedia,Sensors' && av && ti && mk, JSON.stringify({ s, av, ti, mk }));

  for (const u of ['index.html', 'about-device.html?id=d-smoke', 'add-device.html?via=zigbee']) { await pg.goto(root + u); await sl(400); }
  ok('No console errors', errs.length === 0, errs.join(' | '));
  console.log(results.join('\n'));
  const fails = results.filter((r) => r.startsWith('FAIL')).length;
  console.log(fails ? `${fails} FAILED` : 'ALL PASS');
  await b.close();
})();
