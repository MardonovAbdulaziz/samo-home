/* Home page — Figma: "3. Home Page / Home" (5412:21969) */
(() => {
  UI.mount({ variant: 'ambient' });
  const S = () => Store.state;

  function tileHTML(d, t) {
    const cls = ['tile', t.on ? 'on' : '', t.offline ? 'offline' : '', t.alert ? 'alert' : ''].join(' ');   // alert: Figma 5429:45566
    const newTag = d.isNew ? ' <span class="tag-new">NEW</span>' : '';
    return `<div class="${cls}" role="button" tabindex="0" data-key="t-${d.id}-${t.ch}" data-action="open" data-id="${d.id}" data-ch="${t.ch}">
      <span class="tile-icon" style="${t.on ? 'color:' + (t.accent || 'var(--primary)') : ''}">${icon(t.icon, 'icon', 'style="width:28px;height:28px"')}</span>
      ${t.controllable && !t.offline ? `<button class="tile-power" data-action="tile-power" data-id="${d.id}" data-ch="${t.ch}" aria-label="Turn ${t.on ? 'off' : 'on'} ${UI.esc(t.name)}">${icon('power', 'icon icon-sm')}</button>` : ''}
      <span class="tile-name">${UI.esc(t.name)}</span>
      <span class="tile-status${t.tone ? ' tone-' + t.tone : ''}"><span data-num>${UI.esc(t.status)}</span>${newTag}</span>
    </div>`;
  }

  /* ---------- Top row: the user's own list of chips (edited from the Edit chip at its end) ----------
     Keys: 'all-off', 'dev:<id>' (any sensor — shows its live state), 'scene:<id>'. */
  const SENSOR_TYPES = ['climate', 'contact', 'motion', 'presence', 'leak', 'smoke', 'gas', 'air', 'vibration', 'meter', 'lock', 'valve'];
  const scenesOK = () => typeof Scenarios !== 'undefined';
  function topRow() {
    const st = S();
    if (!st.topRow) st.topRow = ['all-off', 'temp', 'door'];
    // older keys: the first temperature / door sensor
    st.topRow = st.topRow.map((k) => { if (k === 'temp' || k === 'door') { const d = st.devices.find((x) => x.type === (k === 'temp' ? 'climate' : 'contact')); return d ? 'dev:' + d.id : null; } return k; }).filter(Boolean)
      .filter((k, i, a) => a.indexOf(k) === i);
    return st.topRow;
  }
  const chipIcon = (d) => (d.type === 'climate' ? 'chip-temperature' : d.type === 'contact' ? 'chip-door' : DeviceAPI(d).icon(0));
  const chipName = (d) => (d.type === 'climate' && S().devices.filter((x) => x.type === 'climate').length === 1 ? 'Temperature' : d.name);   // Figma: "Temperature"
  /** A sensor chip: its icon, its name, its live state — coloured like its tile when it needs attention */
  function devChip(d) {
    const t = DeviceAPI(d).homeTiles()[0] || {};
    const text = d.type === 'climate' ? Devices.climate.chipText(d) : t.status;
    return `<button class="quick-chip" data-action="open" data-id="${d.id}" data-ch="0" data-key="qc-${d.id}">${icon(chipIcon(d))}<span><b>${UI.esc(chipName(d))}</b><span class="${t.tone ? 'tone-' + t.tone : ''}"><span data-num>${UI.esc(text || '')}</span></span></span></button>`;
  }
  function sceneChip(x) {
    const busy = Scenarios.isBusy(x.id);
    return `<button class="quick-chip scn-chip" data-action="scene-run" data-id="${x.id}" data-key="qc-${x.id}" aria-label="Run ${UI.esc(x.name)}">
      ${busy ? Scenarios.ringHTML(x.id) : Scenarios.ic(x.icon)}<span><b>${UI.esc(x.name)}</b><span data-num>${UI.esc(busy ? Scenarios.statusText(x) : 'Scene')}</span></span></button>`;
  }
  function chipOf(key, n) {
    if (key === 'all-off') return allOffChip(n);
    if (key.startsWith('dev:')) { const d = Store.device(key.slice(4)); return d ? devChip(d) : ''; }
    if (key.startsWith('scene:') && scenesOK()) { const x = Scenarios.get(key.slice(6)); return x && x.do.length ? sceneChip(x) : ''; }
    return '';
  }
  /** Everything that can sit in the top row: [key, name, icon, sub] */
  function rowChoices() {
    const L = [['all-off', 'Turn off all', 'power', 'Scene']];
    S().devices.filter((d) => SENSOR_TYPES.includes(d.type)).forEach((d) => L.push(['dev:' + d.id, chipName(d), chipIcon(d), `${DeviceAPI(d).label} · ${Store.roomName(d.roomId)}`]));
    if (scenesOK()) Scenarios.list().filter((x) => x.manual && !x.sys).forEach((x) => L.push(['scene:' + x.id, x.name, x.icon || 'tab-scenarios', 'Scene']));
    return L;
  }
  /* Edit sheet, two parts (iOS Control Center style): what is in the row now (− and a grip to reorder),
     and everything else (+). Changes show on Home at once. */
  function openRowEdit() {
    const ic = (n) => (scenesOK() ? Scenarios.ic(n, 'icon') : icon(n, 'icon'));
    const row = ([k, name, i, sub], on) => `<div class="cell tr-row" data-k="${k}" data-key="tr-${k}">
        <button class="tr-btn ${on ? 'minus' : 'plus'}" data-action="${on ? 'tr-remove' : 'tr-add'}" data-k="${k}" aria-label="${on ? 'Remove' : 'Add'} ${UI.esc(name)}">${icon(on ? 'minus' : 'plus-small', 'icon')}</button>
        <span class="cell-icon">${ic(i)}</span>
        <span class="cell-main"><span class="cell-title" style="display:block">${UI.esc(name)}</span>${sub ? `<span class="cell-sub" style="display:block">${UI.esc(sub)}</span>` : ''}</span>
        ${on ? `<span class="tr-grip" role="button" tabindex="0" aria-label="Move ${UI.esc(name)}">${icon('menu', 'icon')}</span>` : ''}</div>`;
    const draw = () => {
      const keys = topRow(), all = rowChoices(), by = Object.fromEntries(all.map((x) => [x[0], x]));
      const on = keys.filter((k) => by[k]), off = all.filter((x) => !keys.includes(x[0]));
      return `<div class="list-header">In the top row</div>
        <div class="list tr-list" data-tr="on">${on.length ? on.map((k) => row(by[k], true)).join('') : '<div class="cell"><span class="cell-main cell-sub">Nothing here — add from below</span></div>'}</div>
        ${off.length ? `<div class="list-header">More</div><div class="list tr-list">${off.map((x) => row(x, false)).join('')}</div>` : ''}`;
    };
    const sh = UI.sheet({ title: 'Top row', render: draw, footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>', onMount: bindDrag });
    const change = () => { Store.save(); render(); sh.refresh(); };
    UI.on({
      'tr-remove': ({ k }) => { const r = topRow(); r.splice(r.indexOf(k), 1); change(); },
      'tr-add': ({ k }) => { topRow().push(k); change(); },
    });
    /* drag by the grip: the row follows the finger, the others slide out of its way; drop = new order */
    function bindDrag(el) {
      const list = el.querySelector('[data-tr="on"]'); if (!list) return;
      list.querySelectorAll('.tr-grip').forEach((g) => g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const rowEl = g.closest('.tr-row'), rows = [...list.querySelectorAll('.tr-row')], from = rows.indexOf(rowEl);
        const boxes = rows.map((r) => r.getBoundingClientRect()), h = boxes[from].height, y0 = e.clientY;
        let to = from;
        g.setPointerCapture(e.pointerId); rowEl.classList.add('dragging');
        const move = (ev) => {
          const dy = Math.max(boxes[0].top - boxes[from].top, Math.min(boxes[rows.length - 1].top - boxes[from].top, ev.clientY - y0));
          rowEl.style.transform = `translateY(${dy}px)`;
          const mid = boxes[from].top + h / 2 + dy;
          to = boxes.reduce((n, b, i) => n + (i !== from && mid > b.top + b.height / 2 ? 1 : 0), 0);   // its new place among the others
          rows.forEach((r, i) => { if (i === from) return; const shift = from < to && i > from && i <= to ? -h : from > to && i < from && i >= to ? h : 0; r.style.transform = shift ? `translateY(${shift}px)` : ''; });
        };
        const up = () => {
          g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
          rows.forEach((r) => { r.style.transform = ''; }); rowEl.classList.remove('dragging');
          if (to !== from) { const r = topRow(), keys = rows.map((x) => x.dataset.k).filter((k) => r.includes(k)); const [m] = keys.splice(from, 1); keys.splice(to, 0, m); S().topRow = keys.concat(r.filter((k) => !keys.includes(k))); change(); }
        };
        g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
      }));
    }
  }

  /** How many devices of "Turn off all" are on (its list can be edited, so count that list) */
  function onCount() {
    if (typeof Scenarios === 'undefined') { let n = 0; S().devices.forEach((d) => DeviceAPI(d).homeTiles().forEach((t) => { if (t.on) n++; })); return n; }
    const ao = Scenarios.get(Scenarios.ALL_OFF);
    return ao.do.filter((a) => { const d = Store.device(a.id); const t = d && DeviceAPI(d).homeTiles().find((x) => (x.ch || 0) === (a.ch || 0)); return t && t.on; }).length;
  }
  /** "Turn off all" = a system scene: same chip as before, runs with the progress ring */
  function allOffChip(n) {
    const busy = typeof Scenarios !== 'undefined' && Scenarios.isBusy(Scenarios.ALL_OFF);
    const ao = busy ? Scenarios.get(Scenarios.ALL_OFF) : null;
    return `<button class="quick-chip scn-chip" data-action="all-off" data-key="qc-all-off">${busy ? Scenarios.ringHTML(Scenarios.ALL_OFF, 'power') : icon('power')}<span><b>Turn off all</b><span data-num>${busy ? UI.esc(Scenarios.statusText(ao)) : n ? `${n} device${n > 1 ? 's' : ''} on` : 'No devices on'}</span></span></button>`;
  }

  function render() {
    const st = S();
    const n = onCount();
    let h = `<header class="home-header">
        <button class="home-name" data-action="homes">${UI.esc(st.home.name)} ${icon('chevron-down', 'icon icon-sm')}</button>
        <div class="row" style="gap:0">
          <button class="icon-btn" data-action="bell" aria-label="Notifications">${icon('bell')}${st.notifications ? `<span class="badge-count">${st.notifications}</span>` : ''}</button>
          <button class="icon-btn" data-action="plus" aria-label="Add">${icon('plus')}</button>
        </div></header>
      <div class="chips-row">
        ${topRow().map((k) => chipOf(k, n)).join('')}
        <button class="quick-chip row-edit" data-action="row-edit" aria-label="Edit the top row">${icon('pen')}<span><b>Edit</b></span></button>
      </div>`;
    // scenes with "Show on Home Screen": their own untitled group above the rooms
    const homeScenes = scenesOK() ? Scenarios.list().filter((x) => x.manual && !x.sys && Scenarios.homeOf(x) && x.do.length) : [];
    if (homeScenes.length) h += `<div class="tile-grid scn-home-grid" data-key="home-scenes">${homeScenes.map(Scenarios.tileHTML).join('')}</div>`;

    const rooms = [...st.rooms, { id: null, name: 'No room' }];
    for (const r of rooms) {
      const devs = st.devices.filter((d) => (d.roomId || null) === r.id && d.showOnHome !== false);
      if (r.id === null && !devs.length) continue;
      h += `<div class="section-title">${UI.esc(r.name)} ${icon('chevron-right', 'icon icon-sm')}</div><div class="tile-grid">`;
      devs.forEach((d) => DeviceAPI(d).homeTiles().forEach((t) => { h += tileHTML(d, t); }));
      if (!devs.length) h += `<button class="tile add" data-action="add-device" data-room="${r.id}"><span class="plus">${icon('plus', 'icon icon-sm')}</span><span>Add a device</span></button>`;
      h += '</div>';
    }
    h += `<div style="display:flex;justify-content:center;padding:24px 0"><button class="btn-pill" data-action="edit">${icon('pen', 'icon icon-xs')} Edit</button></div>`;
    UI.patch(UI.screen, h);
    UI.screen.classList.add('with-tabbar');
  }

  // Tab bar (static, outside the scroll area)
  const tb = document.createElement('nav');
  tb.className = 'tabbar';
  tb.innerHTML = `<button class="ai" data-action="soon" aria-label="Assistant">${icon('ai-stars')}</button>
    <div class="tabs"><a class="tab on" href="index.html">${icon('tab-home')}My Home</a>
    <a class="tab" href="scenarios.html">${icon('tab-scenarios')}Scenarios</a>
    <button class="tab" data-action="soon">${icon('tab-more')}More</button></div>`;
  UI.phone.appendChild(tb);

  function openAddDevice(roomId) {
    UI.sheet({
      title: 'Add a device',
      render: () => `<div class="pad">
        <a class="option-card" href="add-device.html?via=zigbee${roomId ? '&room=' + roomId : ''}"><img class="oc-logo" src="assets/icons/figma/avatar-zigbee.png" width="40" height="40" alt="">
          <span class="grow"><b>Zigbee device</b><span>Find nearby Zigbee devices</span></span>${icon('chevron-right', 'chev c-secondary')}</a>
        <a class="option-card" href="add-device.html?via=wifi${roomId ? '&room=' + roomId : ''}"><img class="oc-logo" src="assets/icons/figma/avatar-wifi.png" width="40" height="40" alt="">
          <span class="grow"><b>Wi-Fi device</b><span>Connect Wi-Fi device</span></span>${icon('chevron-right', 'chev c-secondary')}</a></div>`,
    });
  }

  UI.on({
    open: ({ id, ch }) => UI.go(`device.html?id=${id}&ch=${ch}`),
    'tile-power': ({ id, ch }) => {
      const d = Store.device(id); DeviceAPI(d).toggle(+ch); Store.save(); render();
      UI.pulse(UI.screen.querySelector(`.tile[data-id="${id}"][data-ch="${ch}"]`), 'just-toggled');
    },
    plus: () => UI.popover(`
      <button data-action="add-device">${icon('menu-device')} Add a device</button>
      <button data-action="add-room">${icon('menu-room')} Add room</button>
      <button data-action="soon">${icon('menu-users')} Invite members</button>`),
    'add-device': ({ room }) => openAddDevice(room && room !== 'null' ? room : null),
    'add-room': () => UI.prompt({
      title: 'Add room', label: 'Room name', okText: 'Create',
      validate: (v) => (!v ? 'Enter a room name' : S().rooms.some((r) => r.name.toLowerCase() === v.toLowerCase()) ? 'A room with this name already exists' : null),
      onOk: (v) => { Store.addRoom(v); render(); UI.toast(`Room “${v}” created`); },
    }),
    'all-off': () => {
      const ao = Scenarios.get(Scenarios.ALL_OFF), n = onCount();
      if (!n) return UI.toast('Nothing is on');
      const on = ao.do.filter((a) => { const d = Store.device(a.id); const t = d && DeviceAPI(d).homeTiles().find((x) => (x.ch || 0) === (a.ch || 0)); return t && t.on; });
      UI.sheet({ title: 'Turn off all?', sub: `${n} device${n > 1 ? 's are' : ' is'} on.`,
        render: () => `<div class="list">${on.map((a) => `<div class="cell"><span class="cell-icon">${icon(Scenarios.iconOf(a.id, a.ch), 'icon')}</span><span class="cell-main cell-title">${UI.esc(Scenarios.nameOf(a.id, a.ch))}</span></div>`).join('')}</div>
          <div class="pad" style="margin-top:16px"><button class="btn btn-glass btn-block" data-action="all-off-edit">Choose devices</button></div>`,
        footer: '<button class="btn btn-primary btn-block" data-action="all-off-go">Turn off</button>' });
    },
    'all-off-go': () => { UI.closeSheet(); Scenarios.tapScene(Scenarios.ALL_OFF, render); },
    'all-off-edit': () => UI.go(`scenario.html?id=${Scenarios.ALL_OFF}`),
    'scn-open': ({ id }) => UI.go(`scenario.html?id=${id}`),
    'scene-run': ({ id }) => Scenarios.tapScene(id, render),
    'row-edit': () => openRowEdit(),
    bell: () => UI.toast('Notifications — coming soon'),
    homes: () => UI.toast('Switch home — coming soon'),
    edit: () => UI.toast('Edit home — coming soon'),
    soon: () => UI.toast('Coming soon'),
  });

  render();
  // Re-render when a device changed, or every second while a countdown is visible
  const hasCountdown = () => S().devices.some((d) => (d.channels || []).some((c) => c.timer) || DeviceAPI(d).busy());
  startDeviceClock((changed) => { if (changed || hasCountdown()) render(); });
})();
