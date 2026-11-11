/* ==========================================================================
   Door lock — device interface (spec: Device Interface 3 / 16. Door_Lock_Interface.html)
   Rule: show a value or setting only if the paired lock has it.
   Page: the lock itself is the control — tap to lock, press and hold to unlock (a lock must never open by a stray
   tap). Under it the big word (Locked = white, Unlocked = orange, Jammed = red) and who did the last action.
   ========================================================================== */
Devices.lock = (() => {
  const { esc, has, when, ago } = Kit;
  const S = (d, k) => d.settings[k];

  const F = {
    lock: { name: 'Lock / unlock', grp: 'Device page', short: 'Locks and unlocks the door from the app, and shows where the bolt really is' },
    doorState: { name: 'Door open / closed', grp: 'Device page', short: 'Also senses whether the door itself is open, and a forced-open door' },
    activity: { name: 'Last action (who & how)', grp: 'Device page', short: 'With every lock / unlock: how it happened and which user' },
    battery: { name: 'Battery', grp: 'Device page', short: 'A dead lock means using the key — the app warns early' },
    jam: { name: 'Jammed / not fully locked', grp: 'Device page', short: 'The bolt could not go all the way — the door is not secure' },
    pinUsers: { name: 'PIN codes (users)', grp: 'Codes & users', short: 'Add, change, disable or delete keypad codes', row: (d) => Kit.row('lo-users', 'users', 'PIN codes', `${d.users.length} people`) },
    guestCodes: { name: 'Guest codes', grp: 'Codes & users', short: 'Codes that work only on certain days, between two dates, or once', row: (d) => Kit.row('lo-guests', 'guests', 'Guest codes', d.guests.length ? `${d.guests.length} active` : 'None') },
    methods: { name: 'Ways to unlock', grp: 'Codes & users', type: 'fields', def: { rfid: true, master: true }, short: 'Turn off RFID cards when one was lost',
      fields: [{ id: 'rfid', kind: 'tog', label: 'Cards and tags may unlock' }, { id: 'master', kind: 'tog', label: 'Master PIN may unlock' }] },
    autoRelock: { name: 'Auto-lock', grp: 'Locking', type: 'number', def: 30, min: 0, max: 600, unit: 's', label: 'Lock again after', short: 'After unlocking, the lock locks itself again', summary: (d, v) => (v ? `after ${Kit.dur(v)}` : 'Off'), foot: '0 = off. It waits while the door is open.' },
    away: { name: 'Lock’s away mode', grp: 'Locking', type: 'toggle', def: false, short: 'Extra security when nobody is home — stored in the lock' },
    privacy: { name: 'Locked from inside', grp: 'Locking', short: 'Someone inside double-locked the door', hidden: true },
    volume: { name: 'Sound', grp: 'Sound', type: 'choice', def: 'low_volume', opts: [['silent_mode', 'Silent'], ['low_volume', 'Low'], ['high_volume', 'High']], short: 'How loud the keypad beeps' },
    wrongCode: { name: 'Wrong codes', grp: 'Notifications', type: 'fields', def: { on: true, n: 3 }, short: 'Several wrong codes in a row → someone is trying codes',
      fields: [{ id: 'on', kind: 'tog', label: 'Notify after wrong codes', noSum: true }, { id: 'n', label: 'Wrong tries in a row', min: 1, max: 10 }] },
    notify: { name: 'Lock notifications', grp: 'Notifications', type: 'fields', def: { unlock: 'always', jam: true, forced: true, left: true, leftMin: 10 }, short: 'Unlocked by whom, not locked, left open',
      fields: [{ id: 'unlock', kind: 'sel', label: 'When it is unlocked', opts: [['off', 'Never'], ['always', 'Always', 'e.g. “Unlocked by Cleaner”']] }, { id: 'jam', kind: 'tog', label: 'Not fully locked / jammed' }, { id: 'forced', kind: 'tog', label: 'Door forced open' }, { id: 'left', kind: 'tog', label: 'Left unlocked' }, { id: 'leftMin', label: 'for longer than', unit: 'min', min: 1, max: 120 }] },
    history: { name: 'Who opened it — log', grp: 'Log', app: true, short: 'Every lock and unlock with who and how' },
  };
  const GROUPS = ['Device page', 'Codes & users', 'Locking', 'Sound', 'Notifications', 'Log'];
  const PRESETS = [
    { id: 'yale', name: 'Yale Assure Lock SL', model: 'YRD256HA20BP', manufacturer: 'Yale', feats: ['lock', 'activity', 'battery', 'pinUsers', 'guestCodes', 'autoRelock', 'volume', 'wrongCode', 'jam', 'notify', 'history'] },
    { id: 'idlock', name: 'ID Lock 202', model: '0402946', manufacturer: 'ID Lock', feats: ['lock', 'doorState', 'activity', 'battery', 'pinUsers', 'guestCodes', 'methods', 'autoRelock', 'away', 'volume', 'wrongCode', 'jam', 'notify', 'history'] },
    { id: 'nimly', name: 'Nimly code touch', model: 'easyCodeTouch_v1', manufacturer: 'Onesti', feats: ['lock', 'activity', 'battery', 'pinUsers', 'autoRelock', 'volume', 'wrongCode', 'jam', 'notify', 'history'], v: { autoRelock: 7 } },
    { id: 'kwik', name: 'Kwikset 910 deadbolt', model: '99100-006', manufacturer: 'Kwikset', feats: ['lock', 'activity', 'battery', 'jam', 'notify', 'history'] },
    { id: 'aqara', name: 'Aqara smart lock S2 (reports only)', model: 'ZNMS12LM', manufacturer: 'Aqara', feats: ['activity', 'battery', 'privacy', 'wrongCode', 'notify', 'history'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', feats: Object.keys(F) },
  ];
  const HOW = { code: 'with a code', card: 'with a card', key: 'with the key', app: 'from the app', auto: 'by auto-lock', inside: 'from inside', scene: 'by the fire scenario', guest: 'with a guest code' };

  function create(presetId, opts = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0], now = Date.now();
    const d = Kit.base('lock', p, Object.assign({ name: 'Front door lock' }, opts), {
      battery: 76,
      st: { bolt: 'locked', door: 'closed', last: { how: 'code', who: 'Mum', t: now - 2.4 * 3600000, locked: true }, privacy: false, wrong: 0, forced: false, lockAt: 0, moveUntil: 0, moveTo: '', unlockedAt: 0, lastSeen: now - 60000 },
      users: [{ slot: 1, name: 'Me', code: '481930', on: true }, { slot: 2, name: 'Mum', code: '205517', on: true }, { slot: 3, name: 'Cleaner', code: '736204', on: true }],
      guests: [],
    });
    d.log = [{ t: now - 2.4 * 3600000, k: 'lock', who: 'Mum', how: 'code' }, { t: now - 9 * 3600000, k: 'unlock', who: 'Mum', how: 'code' }];
    Kit.applyDefaults(F, d); if (p.v) Object.assign(d.settings, Kit.clone(p.v));
    return d;
  }
  const applyDefaults = (d) => { Kit.applyDefaults(F, d); d.users = d.users || []; d.guests = d.guests || []; };
  const control = (d) => has(d, 'lock');
  const locked = (d) => d.st.bolt === 'locked';
  const moving = (d) => d.st.moveUntil > Date.now();
  const battLow = (d) => has(d, 'battery') && d.battery <= 20;

  /* ---------- Behaviour ---------- */
  /** Lock / unlock (who, how). From the app it takes a moment — the bolt moves. */
  function act(d, lock, who, how) {
    if (!d.online) return;
    if (lock && has(d, 'doorState') && d.st.door === 'open') { UI.toast('Close the door first — the bolt can’t lock an open door'); return; }
    if (!lock && d.st.privacy && how !== 'inside' && how !== 'key') { UI.toast('Locked from inside — it opens only from inside'); return; }
    d.st.moveUntil = Date.now() + 1200; d.st.moveTo = lock ? 'locked' : 'unlocked'; d.st.pend = { who, how };
  }
  function settle(d) {
    const st = d.st, now = Date.now(), lock = st.moveTo === 'locked', { who, how } = st.pend || {};
    st.moveUntil = 0; st.pend = null;
    if (lock && d.sim.jamNext) { d.sim.jamNext = false; st.bolt = 'jammed'; Kit.logEv(d, 'jam'); if (has(d, 'notify') && S(d, 'notify').jam) Kit.push(`${d.name}: not locked`, 'The bolt is stuck — lock it by hand', 'danger'); return; }
    st.bolt = st.moveTo; st.last = { how, who, t: now, locked: lock }; st.lastSeen = now;
    if (!lock) { st.unlockedAt = now; st.leftSent = false; } else st.lockAt = 0;
    Kit.logEv(d, lock ? 'lock' : 'unlock', { who, how });
    if (!lock && has(d, 'notify') && S(d, 'notify').unlock === 'always' && how !== 'app') Kit.push(`${d.name}: unlocked`, `${who ? who + ' · ' : ''}${HOW[how] || ''}`);
  }
  function tick(d) {
    const st = d.st, now = Date.now(); let ch = false;
    if (st.moveUntil && now >= st.moveUntil) { settle(d); ch = true; }
    // auto-lock: counts while the door is closed
    const ar = has(d, 'autoRelock') ? S(d, 'autoRelock') : 0;
    if (st.bolt === 'unlocked' && ar && !moving(d) && st.door === 'closed') {
      if (!st.lockAt) { st.lockAt = now + ar * 1000; ch = true; }
      else if (now >= st.lockAt) { st.lockAt = 0; act(d, true, '', 'auto'); ch = true; }
    } else if (st.lockAt && (st.bolt !== 'unlocked' || st.door === 'open')) { st.lockAt = 0; ch = true; }
    const n = S(d, 'notify');
    if (has(d, 'notify') && n.left && st.bolt === 'unlocked' && !st.leftSent && st.unlockedAt && now - st.unlockedAt > n.leftMin * 60000) { st.leftSent = true; Kit.push(`${d.name} left unlocked`, `Unlocked for ${n.leftMin} min`, 'warn'); ch = true; }
    return ch;
  }

  /* ---------- Text ---------- */
  function word(d) {
    if (!d.online) return 'Unknown';
    if (moving(d)) return d.st.moveTo === 'locked' ? 'Locking…' : 'Unlocking…';
    return { locked: 'Locked', unlocked: 'Unlocked', jammed: 'Not locked' }[d.st.bolt];
  }
  const tone = (d) => (!d.online ? '' : d.st.bolt === 'jammed' ? 'alarm' : d.st.bolt === 'unlocked' && !moving(d) ? 'open' : 'closed');
  function subText(d) {
    const st = d.st;
    if (!d.online) return `Last report ${when(st.lastSeen)}`;
    if (moving(d)) return 'The bolt is moving';
    if (st.bolt === 'jammed') return 'The bolt is stuck half-way — lock it by hand';
    const l = st.last;
    if (has(d, 'activity') && l && l.t) return `${l.locked ? 'Locked' : 'Unlocked'} ${l.who ? 'by ' + l.who + ' ' : ''}${HOW[l.how] || ''} · ${when(l.t)}`;
    return `Checked ${ago(Date.now() - st.lastSeen)}`;
  }
  const hint = (d) => (d.st.lockAt && d.st.bolt === 'unlocked' ? `Locks itself in ${Math.max(0, Math.ceil((d.st.lockAt - Date.now()) / 1000))} s` : '');
  function tileStatus(d) {
    if (!d.online) return { text: 'Offline', tone: 'danger' };
    if (d.st.bolt === 'jammed') return { text: 'Not locked', tone: 'danger' };
    if (d.st.forced) return { text: 'Forced open', tone: 'danger' };
    if (battLow(d)) return { text: 'Battery low', tone: 'warn' };
    if (has(d, 'doorState') && d.st.door === 'open') return { text: 'Door open', tone: 'warn' };
    return { text: word(d) };
  }
  const homeTiles = (d) => { const s = tileStatus(d); return [{ ch: 0, name: d.name, icon: 'dev-lock', on: false, status: s.text, tone: s.tone, alert: d.online && (d.st.bolt === 'jammed' || d.st.forced), controllable: false, offline: !d.online }]; };

  /* ---------- Device page ---------- */
  function page(d) {
    const st = d.st;
    let h = '';
    if (!d.online) h += Kit.banner('ban-off', 'danger', 'bolt-crossed', `<b>Offline</b> · No report since ${when(st.lastSeen)}. Check the batteries — the key still works.`);
    if (st.forced) h += Kit.banner('ban-forced', 'danger', 'banner-error', '<b>Door forced open</b> · It opened while locked', 'lo-forced-ok');
    if (st.privacy && st.bolt === 'locked') h += Kit.banner('ban-privacy', 'info', 'round-info', '<b>Locked from inside</b> · Codes and cards from outside won’t open it');
    if (d.sim.wrong >= (S(d, 'wrongCode') || { n: 3 }).n && has(d, 'wrongCode')) h += Kit.banner('ban-wrong', 'warn', 'banner-error', `<b>${d.sim.wrong} wrong codes</b> · at ${UI.fmtTime(d.sim.wrongAt)}`, 'lo-wrong-ok');
    if (battLow(d)) h += Kit.banner('ban-batt', 'warn', 'battery', `<b>Battery low · ${d.battery} %</b> · Replace the AA batteries soon`);
    const state = !d.online ? 'calm' : st.bolt === 'jammed' ? 'alarm' : moving(d) ? 'on' : st.bolt === 'unlocked' ? 'warn' : 'calm';
    if (control(d)) {
      // the lock is the button: tap = lock, hold = unlock
      const lockedNow = locked(d) && !moving(d);
      h += `<div class="pad" data-key="scene"><button class="lk-mark lo-ctl ${state === 'alarm' ? 'is-alarm' : state === 'warn' ? 'is-warn' : state === 'on' ? 'is-on is-moving' : ''} ${!d.online ? 'is-off' : ''}" data-action="lo-tap" ${lockedNow ? 'data-hold="lo-unlock"' : ''} aria-label="${lockedNow ? 'Hold to unlock' : 'Lock'}" ${!d.online ? 'disabled' : ''}>
        <i class="lk-halo"></i><span class="lk-disc">${icon(d.userIcon || 'dev-lock', 'icon', 'style="width:80px;height:80px"')}</span>
        <svg class="lo-ring" viewBox="0 0 124 124" aria-hidden="true"><circle cx="62" cy="62" r="60"/></svg></button></div>`;
    } else h += Kit.mark(d, 'dev-lock', state, `${d.name}: ${word(d)}`);
    h += Kit.readout(word(d), tone(d), subText(d), hint(d));
    if (control(d) && d.online && !moving(d)) h += `<div class="pad lo-hint" data-key="howto"><span>${locked(d) ? 'Press and hold to unlock' : st.bolt === 'jammed' ? 'Tap to try again' : 'Tap to lock'}</span></div>`;
    h += Kit.cards([
      has(d, 'doorState') && ['Door', !d.online ? '—' : st.door === 'open' ? 'Open' : 'Closed'],
      has(d, 'pinUsers') && ['People with a code', `${d.users.filter((u) => u.on).length}`, { count: true }],
      has(d, 'battery') && [battLow(d) ? 'Battery · replace soon' : 'Battery', `${d.battery} %`, { wide: true, icon: 'battery', count: true }],
    ]);
    if (has(d, 'guestCodes')) h += Kit.actionRow('guest-row', 'lo-guests', 'Let a guest in', d.guests.length ? `${d.guests.length} guest code${d.guests.length > 1 ? 's' : ''} active` : 'A code that works only when you choose');
    return h + '<div style="height:28px"></div>';
  }
  function live(d, root) {
    UI.setNum(root.querySelector('[data-live="sub"]'), subText(d));
    const hn = root.querySelector('.cw-hint'); if (hn) UI.setNum(hn, hint(d));
  }
  function bindPage(d, ctx) {
    // press and hold to unlock: the ring fills in 0.7 s; letting go earlier cancels
    const scr = UI.screen;
    if (!scr._loHold) {
      scr._loHold = true;
      let t = null, el = null;
      const stop = () => { clearTimeout(t); t = null; if (el) el.classList.remove('holding'); el = null; };
      scr.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('[data-hold="lo-unlock"]'); if (!b) return;
        el = b; b.classList.add('holding'); b._held = 0;
        t = setTimeout(() => { b._held = Date.now(); stop(); act(d, false, 'You', 'app'); Store.save(); ctx.render(); }, 700);
      });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => scr.addEventListener(ev, stop));
    }
    UI.on({
      'lo-tap': (a, el) => {
        const b = el || document.querySelector('.lo-ctl');
        if (b && b._held && Date.now() - b._held < 800) { b._held = 0; return; }   // the click that ends a hold
        if (moving(d) || !d.online) return;
        if (locked(d)) { UI.toast('Press and hold to unlock'); return; }
        act(d, true, 'You', 'app'); Store.save(); ctx.render();
      },
      'lo-forced-ok': () => { d.st.forced = false; Store.save(); ctx.render(); },
      'lo-wrong-ok': () => { d.sim.wrong = 0; Store.save(); ctx.render(); },
      'lo-guests': () => openGuests(d, ctx),
    });
  }

  /* ---------- Codes ---------- */
  const code6 = () => String(Math.floor(100000 + Math.random() * 900000));
  function openUsers(d, ctx) {
    const s = UI.sheet({
      title: 'PIN codes', sub: 'Each person gets their own code — the log then shows who opened the door',
      render: () => `<div class="list">${d.users.map((u, i) => `<button class="cell" data-action="lo-user" data-i="${i}"><span class="cell-main"><span class="cell-title" style="display:block">${esc(u.name)}</span><span class="cell-sub" style="display:block">${u.on ? 'Code ••••' + u.code.slice(-2) : 'Code turned off'}</span></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>
        <div class="pad" style="margin-top:16px"><button class="btn btn-glass btn-block" data-action="lo-add">${icon('plus')} Add a person</button></div>`,
    });
    UI.on({
      'lo-user': ({ i }) => openUser(d, +i, ctx, () => openUsers(d, ctx)),
      'lo-add': () => UI.prompt({ title: 'Add a person', label: 'Name', okText: 'Create code', onOk: (v) => { const u = { slot: Math.max(0, ...d.users.map((x) => x.slot)) + 1, name: v, code: code6(), on: true }; d.users.push(u); Kit.logEv(d, 'user', { text: `Code added for ${v}` }); Store.save(); ctx.render(); openUser(d, d.users.length - 1, ctx, () => openUsers(d, ctx), true); } }),
    });
    return s;
  }
  function openUser(d, i, ctx, back, fresh) {
    const u = d.users[i]; let show = !!fresh;
    const s = UI.sheet({
      title: u.name, sub: fresh ? 'Share this code with them — it works right away' : `Slot ${u.slot} in the lock`,
      render: () => `<div class="lo-code" data-key="code"><span data-num>${show ? u.code.replace(/(\d{3})(\d{3})/, '$1 $2') : '••• •••'}</span><button class="btn-sm" data-action="lo-show">${show ? 'Hide' : 'Show'}</button></div>
        <div class="list" style="margin-top:24px">${Kit.sw('lo-u-on', 'on', 'Code works', 'Turn off for a while without deleting it', u.on)}
          <button class="cell" data-action="lo-u-new"><span class="cell-main cell-title">Make a new code</span>${icon('chevron-right', 'chev')}</button></div>
        <div class="pad" style="margin-top:24px"><button class="btn btn-danger btn-block" data-action="lo-u-del">Delete ${esc(u.name)}’s code</button></div>`,
      footer: '<button class="btn btn-glass btn-block" data-action="lo-back">Back</button>',
    });
    UI.on({
      'lo-show': () => { show = !show; s.refresh(); },
      'lo-u-on': () => { u.on = !u.on; Store.save(); ctx.render(); s.refresh(); },
      'lo-u-new': () => { u.code = code6(); show = true; Kit.logEv(d, 'user', { text: `New code for ${u.name}` }); Store.save(); s.refresh(); UI.toast('New code — the old one stopped working'); },
      'lo-u-del': () => UI.confirm({ title: `Delete ${u.name}’s code?`, text: 'The code stops working at once.', ok: 'Delete', onOk: () => { d.users.splice(i, 1); Kit.logEv(d, 'user', { text: `Code deleted: ${u.name}` }); Store.save(); ctx.render(); back(); } }),
      'lo-back': back,
    });
  }
  const GUEST = [['once', 'Once', 'Stops working after the first use'], ['today', 'Today only', 'Until midnight'], ['week', 'This week', '7 days from now'], ['work', 'Weekdays 9:00–18:00', 'e.g. a cleaner or a nanny']];
  function openGuests(d, ctx) {
    let kind = 'once';
    const s = UI.sheet({
      title: 'Let a guest in', sub: 'A code that works only when you choose',
      render: () => `${d.guests.length ? UI.group('Active', d.guests.map((g, i) => `<div class="cell"><span class="cell-main"><span class="cell-title" style="display:block">${esc(g.name)} · ${g.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</span><span class="cell-sub" style="display:block">${esc((GUEST.find((x) => x[0] === g.kind) || [])[1])}</span></span><button class="btn-sm" data-action="lo-g-del" data-i="${i}">Delete</button></div>`).join('')) : ''}
        ${UI.group('New guest code', Kit.radio('lo-g-kind', kind, GUEST))}`,
      footer: '<button class="btn btn-primary btn-block" data-action="lo-g-add">Create a guest code</button>',
    });
    UI.on({
      'lo-g-kind': ({ v }) => { kind = v; s.refresh(); },
      'lo-g-del': ({ i }) => { const g = d.guests.splice(+i, 1)[0]; Kit.logEv(d, 'user', { text: `Guest code deleted: ${g.name}` }); Store.save(); ctx.render(); s.refresh(); },
      'lo-g-add': () => UI.prompt({ title: 'Guest name', label: 'Who is it for?', value: 'Guest', okText: 'Create', onOk: (v) => { const g = { name: v, code: code6(), kind, at: Date.now() }; d.guests.push(g); Kit.logEv(d, 'user', { text: `Guest code for ${v}` }); Store.save(); ctx.render(); openGuests(d, ctx); UI.toast(`Code ${g.code.replace(/(\d{3})(\d{3})/, '$1 $2')} — send it to ${v}`); } }),
    });
  }

  /* ---------- Settings ---------- */
  const settings = (d) => Kit.settingsHTML(F, GROUPS, d, { foot: { 'Codes & users': 'Codes are stored in the lock — they work without internet.' } });
  const EV = { lock: (e) => `Locked${e.who ? ' by ' + e.who : ''} ${HOW[e.how] || ''}`, unlock: (e) => `Unlocked${e.who ? ' by ' + e.who : ''} ${HOW[e.how] || ''}`, jam: 'Not fully locked — jammed', forced: 'Door forced open', wrong: 'Wrong code', door: (e) => (e.open ? 'Door opened' : 'Door closed'), offline: 'Stopped answering' };
  function bindSettings(d, ctx) {
    Kit.bindSettings(F, d, ctx);
    UI.on({ 'lo-users': () => openUsers(d, ctx), 'lo-guests': () => openGuests(d, ctx), 'rs-history': () => Kit.historySheet(d, EV, 'Who locked and unlocked the door') });
  }
  const about = (d) => [['Bolt', word(d)], ['Codes', `${d.users.length}`], ['Battery', `${d.battery} %`]];

  /* ---------- Prototype ---------- */
  function protoPanel(d) {
    const st = d.st, u = d.users.filter((x) => x.on);
    return Kit.protoHead('Door lock prototype', '16. Door_Lock_Interface.html', PRESETS, d) + `
      <h3>At the door · <span style="font-weight:400">${word(d).toLowerCase()}${has(d, 'doorState') ? ' · door ' + st.door : ''}</span></h3>
      <div class="pp-row">${u.slice(1, 3).map((x) => Kit.ppBtn('pp-code', `🔢 ${esc(x.name)} types the code`).replace('data-action="pp-code"', `data-action="pp-code" data-n="${esc(x.name)}"`)).join('')}</div>
      <div class="pp-row">${Kit.ppBtn('pp-wrong', '❌ Wrong code', has(d, 'wrongCode'))}${Kit.ppBtn('pp-key', '🔑 Turn the key')}${Kit.ppBtn('pp-guest', '🧳 Guest uses a code', d.guests.length > 0)}</div>
      <div class="pp-row">${Kit.ppBtn('pp-door', st.door === 'open' ? '🚪 Close the door' : '🚪 Open the door', has(d, 'doorState'))}${Kit.ppBtn('pp-inside', st.privacy ? '🔓 Unlock inside lock' : '🔐 Double-lock from inside', has(d, 'privacy') || d.preset === 'all')}</div>
      <h3>Trouble</h3>
      <div class="pp-row">${Kit.ppBtn('pp-jam', '⚙️ Bolt jams next time', has(d, 'jam'))}${Kit.ppBtn('pp-force', '💥 Force the door', has(d, 'doorState'))}${Kit.ppBtn('pp-batt', battLow(d) ? '🔋 New batteries' : '🔋 Batteries low', has(d, 'battery'))}${Kit.ppBtn('pp-online', d.online ? '📴 Stops answering' : '📶 Answers again')}</div>` + Kit.protoFeatures(F, GROUPS, d);
  }
  function bindProto(d, ctx) {
    Kit.bindProto(F, PRESETS, d, ctx, {
      'pp-code': ({ n }) => { if (d.st.privacy) return 'Locked from inside — the code is refused'; d.sim.wrong = 0; d.st.bolt = 'locked'; act(d, false, n, 'code'); },
      'pp-guest': () => { const g = d.guests[0]; act(d, false, g.name, 'guest'); if (g.kind === 'once') { d.guests.shift(); return `${g.name}’s one-time code is used up`; } },
      'pp-wrong': () => { d.sim.wrong = (d.sim.wrong || 0) + 1; d.sim.wrongAt = Date.now(); Kit.logEv(d, 'wrong'); const w = S(d, 'wrongCode'); if (w.on && d.sim.wrong === w.n) Kit.push(`${d.name}: ${w.n} wrong codes`, 'Someone is trying codes', 'warn'); },
      'pp-key': () => { const lock = !locked(d); d.st.bolt = lock ? 'unlocked' : d.st.bolt; act(d, lock, '', 'key'); },
      'pp-door': () => { const open = d.st.door !== 'open'; if (open && locked(d)) return 'Locked — unlock it first (or force it)'; d.st.door = open ? 'open' : 'closed'; Kit.logEv(d, 'door', { open }); },
      'pp-inside': () => { d.st.privacy = !d.st.privacy; if (d.st.privacy) { d.st.bolt = 'locked'; d.st.last = { how: 'inside', who: '', t: Date.now(), locked: true }; Kit.logEv(d, 'lock', { how: 'inside' }); } },
      'pp-jam': () => { d.sim.jamNext = true; return 'Next lock will jam half-way'; },
      'pp-force': () => { d.st.door = 'open'; d.st.forced = true; Kit.logEv(d, 'forced'); if (S(d, 'notify').forced) Kit.push(`${d.name}: forced open`, 'The door opened while locked', 'danger'); },
      'pp-batt': () => { d.battery = battLow(d) ? 100 : 14; },
      'pp-online': () => { d.online = !d.online; if (!d.online) Kit.logEv(d, 'offline'); else d.st.lastSeen = Date.now(); },
    });
  }
  /** Used by other devices' scenarios (e.g. the smoke detector's fire scenario unlocks the front door). */
  function remote(d, lock, who, how) { if (!control(d) || !d.online) return false; if (lock === locked(d)) return false; act(d, lock, who, how); return true; }

  return {
    label: 'Door lock', F, PRESETS, GROUPS, create, applyDefaults, defaultName: 'Front door lock',
    icon: () => 'dev-lock', describe: (p) => `${p.manufacturer} · door lock`,
    historyValue: (d) => (has(d, 'history') ? `${d.log.length} events` : null),
    homeTiles, page, bindPage, live, settings, bindSettings, about, tick, busy: (d) => moving(d) || !!d.st.lockAt,
    protoPanel, bindProto, remote,
  };
})();
