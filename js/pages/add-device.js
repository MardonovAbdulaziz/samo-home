/* Add device flow — Figma: "New add a device 23.10.2026" (Zigbee / Wifi) + "Search", "Added", "Search completed"
   Steps: search → setup (name + room) → done */
(() => {
  UI.mount({ variant: 'elevated' });
  const via = UI.param('via') === 'wifi' ? 'wifi' : 'zigbee';
  const presetRoom = UI.param('room');
  const SEARCH_SEC = 120;

  // What the hub "discovers" in this prototype
  const DISCOVERY = [
    { at: 1, type: 'light', preset: 'hue' },
    { at: 2, type: 'relay', preset: 'tuya2' },
    { at: 3, type: 'curtain', preset: 'tuya' },
    { at: 5, type: 'contact', preset: 'aqara' },
    { at: 4, type: 'relay', preset: 'aqara' },
    { at: 6, type: 'curtain', preset: 'roller' },
    { at: 7, type: 'relay', preset: 'touch3' },
    { at: 8, type: 'light', preset: 'dim2' },
    { at: 9, type: 'curtain', preset: 'dual' },
    { at: 11, type: 'contact', preset: 'bosch' },
    { at: 10, type: 'relay', preset: 'tuya1' },
    { at: 13, type: 'relay', preset: 'din' },
    { at: 12, type: 'climate', preset: 'aqara' },
    { at: 14, type: 'climate', preset: 'probe' },
    { at: 15, type: 'motion', preset: 'p1' },
    { at: 17, type: 'motion', preset: 'tuyab' },
  ];
  if (window.SAMO_EDITION && window.SAMO_EDITION.types) {   // edition build: only its device types
    for (let i = DISCOVERY.length - 1; i >= 0; i--) if (!window.SAMO_EDITION.types.includes(DISCOVERY[i].type)) DISCOVERY.splice(i, 1);
  }
  const presetOf = (f) => Devices[f.type].PRESETS.find((x) => x.id === f.preset);
  /** One line under the device name: maker + what it is */
  const describe = (f) => {
    const p = presetOf(f);
    if (Devices[f.type].describe) return Devices[f.type].describe(p);
    return `${p.manufacturer} · ${p.ch} channel${p.ch > 1 ? 's' : ''}`;
  };
  const partName = (f, j) => (f.type === 'curtain' ? `Curtain ${j + 1} name` : f.type === 'light' ? `Light ${j + 1} name` : `Channel ${j + 1} name`);

  const st = { step: 'search', elapsed: 0, done: false, found: [], added: new Set(), setup: [] };

  function searchView() {
    const left = Math.max(0, SEARCH_SEC - st.elapsed);
    const title = st.done ? 'Search completed' : 'Searching for devices...';
    let h = UI.toolbar({ title, back: 'index.html', plain: true, right: st.done ? '' : `<button class="icon-btn" data-action="stop" aria-label="Stop search">${icon('tab-more')}</button>` });
    h += `<div class="pulse ${st.done ? 'stopped' : ''}">${icon('search-phone', 'icon', 'style="width:40px;height:56px;color:var(--primary);stroke-width:1.4"')}</div>`;
    if (!st.done) {
      h += `<div style="text-align:center;padding:0 20px"><div class="t-lg-accent" data-num data-live="left">${UI.fmtDur(left)}</div>
        <div class="t-md c-secondary" style="margin-top:8px">${via === 'zigbee' ? 'Make sure the device is turned on and in pairing mode' : 'Make sure the device is in pairing mode and your phone is on 2.4 GHz Wi-Fi'}</div></div>`;
    } else {
      h += `<div style="text-align:center;padding:0 20px"><div class="t-md c-secondary">Device not found? Check the manual for how to enable discovery mode.</div>
        <button class="btn-pill" style="margin-top:20px;height:44px;padding:0 18px" data-action="retry">${icon('refresh', 'icon icon-sm')} Retry search</button></div>`;
    }
    if (st.found.length) {
      h += `<div class="list-header" style="padding-top:28px">Found devices (${st.found.length})</div><div class="stack pad" style="gap:10px">`;
      st.found.forEach((f) => {
        const p = presetOf(f);
        const on = st.added.has(f.key);
        h += `<div class="list" style="margin:0"><div class="cell has-icon"><span class="cell-icon">${icon(f.type === 'curtain' ? 'dev-curtains' : f.type === 'contact' ? (presetOf(f).ic === 'window' ? 'dev-window' : 'dev-door-02') : f.type === 'light' ? 'dev-bulb' : f.type === 'climate' ? 'dev-temperature' : f.type === 'motion' ? 'dev-motion' : 'menu-device')}</span>
          <span class="cell-main"><span class="cell-title" style="display:block">${UI.esc(p.name)}</span><span class="cell-sub" style="display:block">${UI.esc(describe(f))}</span></span>
          ${on ? `<button class="btn-circle" data-action="remove" data-k="${f.key}" aria-label="Remove">${icon('cross', 'icon icon-xs')}</button>` : `<button class="btn-sm" data-action="add" data-k="${f.key}">Add</button>`}</div></div>`;
      });
      h += '</div>';
    }
    const n = st.added.size;
    const cta = n ? `<button class="btn btn-primary btn-block" data-action="next">Next (${n})</button>`
      : st.done && st.found.length ? `<button class="btn btn-primary btn-block" data-action="add-all">Add all</button>`
        : `<button class="btn btn-primary btn-block" disabled>Next</button>`;
    return { h, cta };
  }

  function setupView() {
    const rooms = Store.state.rooms;
    let h = UI.toolbar({ title: 'Set up devices', back: '', plain: true, right: '' });
    h = h.replace('<span class="spacer"></span>', `<button class="icon-btn" data-action="back-search" aria-label="Back">${icon('back')}</button>`);
    h += `<div class="pad t-md c-secondary" style="padding-top:8px">Give each device a name and choose its room.</div>`;
    st.setup.forEach((s, i) => {
      const p = presetOf(s);
      h += `<div class="list-header">${UI.esc(p.name)}</div>
        <label class="field"><span class="field-label">Device name</span><input data-name="${i}" value="${UI.esc(s.name)}" maxlength="40"></label>
        ${s.channels.length > 1 ? s.channels.map((c, j) => `<label class="field" style="margin-top:8px"><span class="field-label">${partName(s, j)} · shown as a tile on home</span><input data-chname="${i}:${j}" value="${UI.esc(c)}" maxlength="30"></label>`).join('') : ''}
        <div class="pad chips" style="margin-top:12px">${rooms.map((r) => `<button class="chip ${s.roomId === r.id ? 'on' : ''}" data-action="room" data-i="${i}" data-r="${r.id}">${UI.esc(r.name)}</button>`).join('')}
          <button class="chip" data-action="new-room" data-i="${i}">${icon('plus', 'icon icon-xs')} New room</button></div>`;
    });
    return { h, cta: `<button class="btn btn-primary btn-block" data-action="finish">Finish</button>` };
  }

  function doneView() {
    const n = st.setup.length;
    const h = `<div class="hero" style="padding-top:140px"><div class="hero-icon" style="width:88px;height:88px;border-radius:50%;background:var(--green-soft);display:flex;align-items:center;justify-content:center;color:var(--green)">${icon('check', 'icon', 'style="width:44px;height:44px"')}</div>
      <h1 class="t-h2">${n} device${n > 1 ? 's' : ''} added</h1><p>${n > 1 ? 'They are' : 'It is'} now on your home screen.</p></div>`;
    const first = st.created[0];
    return { h, cta: `<div class="stack"><a class="btn btn-primary btn-block" href="index.html">Go to home</a>${n === 1 ? `<a class="btn btn-secondary btn-block" href="device.html?id=${first}">Open device</a>` : ''}</div>` };
  }

  function render() {
    const v = st.step === 'search' ? searchView() : st.step === 'setup' ? setupView() : doneView();
    UI.patch(UI.screen, v.h);
    UI.screen.classList.add('with-footer');
    let f = UI.phone.querySelector('.footer-cta');
    if (!f) { f = document.createElement('div'); f.className = 'footer-cta'; UI.phone.appendChild(f); }
    UI.patch(f, v.cta);
    UI.screen.querySelectorAll('[data-name]').forEach((inp) => { inp.oninput = () => { st.setup[+inp.dataset.name].name = inp.value; }; });
    UI.screen.querySelectorAll('[data-chname]').forEach((inp) => { inp.oninput = () => { const [i, j] = inp.dataset.chname.split(':'); st.setup[+i].channels[+j] = inp.value; }; });
  }

  // Search clock
  let clock;
  function startSearch() {
    st.elapsed = 0; st.done = false;
    clearInterval(clock);
    clock = setInterval(() => {
      if (st.step !== 'search') return;
      st.elapsed++;
      let changed = false;
      DISCOVERY.forEach((x) => { if (x.at === st.elapsed && !st.found.some((f) => f.type === x.type && f.preset === x.preset)) { st.found.push({ key: x.type + '-' + x.preset + '-' + st.elapsed, type: x.type, preset: x.preset }); changed = true; } });
      if (st.elapsed >= SEARCH_SEC) { st.done = true; clearInterval(clock); changed = true; }
      if (changed) {
        const before = st.found.length;
        render();
        const cards = UI.screen.querySelectorAll('.stack.pad > .list');           // newest discovered device slides in
        if (cards.length && before) UI.pulse(cards[cards.length - 1], 'row-in');
      }
      else { UI.setNum(UI.screen.querySelector('[data-live="left"]'), UI.fmtDur(SEARCH_SEC - st.elapsed)); }
    }, 1000);
  }
  const stop = () => { st.done = true; clearInterval(clock); render(); };

  function goSetup() {
    const defaultRoom = presetRoom || (Store.state.rooms[0] || {}).id || null;
    st.setup = st.found.filter((f) => st.added.has(f.key)).map((f) => {
      const keep = st.setup.find((s) => s.key === f.key);
      const p = presetOf(f);
      return keep || { key: f.key, type: f.type, preset: f.preset, name: f.type === 'contact' ? (p.ic === 'window' ? 'Window' : 'Front door') : f.type === 'light' && p.ch === 1 ? p.names[0] : f.type === 'climate' ? (p.id === 'probe' ? 'Fridge sensor' : 'Temperature sensor') : f.type === 'motion' ? 'Motion sensor' : p.name, roomId: defaultRoom, channels: (p.names || []).slice() };
    });
    st.step = 'setup'; render();
  }

  UI.on({
    add: ({ k }) => { st.added.add(k); render(); },
    remove: ({ k }) => { st.added.delete(k); render(); },
    'add-all': () => { st.found.forEach((f) => st.added.add(f.key)); goSetup(); },
    next: () => goSetup(),
    stop: () => stop(),
    retry: () => { startSearch(); render(); },
    'back-search': () => { st.step = 'search'; render(); },
    room: ({ i, r }) => { st.setup[+i].roomId = r; render(); },
    'new-room': ({ i }) => UI.prompt({ title: 'Add room', label: 'Room name', okText: 'Create', onOk: (v) => { const r = Store.addRoom(v); st.setup[+i].roomId = r.id; render(); } }),
    finish: () => {
      if (st.setup.some((s) => !s.name.trim() || s.channels.some((c) => !c.trim()))) { UI.toast('Every device and channel needs a name'); return; }
      st.created = st.setup.map((s) => Store.addDevice(Devices[s.type].create(s.preset, { name: s.name.trim(), roomId: s.roomId, channelNames: s.channels.map((c) => c.trim()) })).id);
      st.step = 'done'; render();
    },
  });

  render();
  startSearch();
})();
