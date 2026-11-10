/* Home page — Figma: "3. Home Page / Home" (5412:21969) */
(() => {
  UI.mount({ variant: 'ambient' });
  const S = () => Store.state;

  function tileHTML(d, t) {
    const cls = ['tile', t.on ? 'on' : '', t.offline ? 'offline' : ''].join(' ');
    const newTag = d.isNew ? ' <span class="tag-new">NEW</span>' : '';
    return `<div class="${cls}" role="button" tabindex="0" data-key="t-${d.id}-${t.ch}" data-action="open" data-id="${d.id}" data-ch="${t.ch}">
      <span class="tile-icon" style="${t.on ? 'color:' + (t.accent || 'var(--primary)') : ''}">${icon(t.icon, 'icon', 'style="width:28px;height:28px"')}</span>
      ${t.controllable && !t.offline ? `<button class="tile-power" data-action="tile-power" data-id="${d.id}" data-ch="${t.ch}" aria-label="Turn ${t.on ? 'off' : 'on'} ${UI.esc(t.name)}">${icon('power', 'icon icon-sm')}</button>` : ''}
      <span class="tile-name">${UI.esc(t.name)}</span>
      <span class="tile-status${t.tone ? ' tone-' + t.tone : ''}"><span data-num>${UI.esc(t.status)}</span>${newTag}</span>
    </div>`;
  }

  /** "Front Door" chip (Figma home): the first door / window sensor on home, live. */
  function doorChip() {
    const d = S().devices.find((x) => x.type === 'contact' && x.showOnHome !== false);
    if (!d) return `<button class="quick-chip">${icon('chip-door')}<span><b>Front Door</b><span>Open</span></span></button>`;
    const t = DeviceAPI(d).homeTiles()[0];
    return `<button class="quick-chip" data-action="open" data-id="${d.id}" data-ch="0">${icon('chip-door')}<span><b>${UI.esc(d.name)}</b><span data-num>${UI.esc(t.status)}</span></span></button>`;
  }

  /** "Temperature" chip (Figma home): the first temperature sensor on home, live. */
  function tempChip() {
    const d = S().devices.find((x) => x.type === 'climate' && x.showOnHome !== false);
    if (!d) return `<button class="quick-chip">${icon('chip-temperature')}<span><b>Temperature</b><span>25.5°</span></span></button>`;
    return `<button class="quick-chip" data-action="open" data-id="${d.id}" data-ch="0">${icon('chip-temperature')}<span><b>Temperature</b><span data-num>${UI.esc(Devices.climate.chipText(d))}</span></span></button>`;
  }

  function onCount() {
    let n = 0;
    S().devices.forEach((d) => DeviceAPI(d).homeTiles().forEach((t) => { if (t.on) n++; }));
    return n;
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
        <button class="quick-chip" data-action="all-off">${icon('power')}<span><b>Turn off all</b><span data-num>${n ? `${n} device${n > 1 ? 's' : ''} on` : 'No devices on'}</span></span></button>
        ${tempChip()}
        ${doorChip()}
      </div>`;

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
    <button class="tab" data-action="soon">${icon('tab-scenarios')}Scenarios</button>
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
      const n = onCount();
      if (!n) return UI.toast('Nothing is on');
      UI.confirm({ title: 'Turn off all?', text: `${n} device${n > 1 ? 's are' : ' is'} on. Everything can be switched back on from its tile.`, ok: 'Turn off', danger: true,
        onOk: () => { S().devices.forEach((d) => DeviceAPI(d).homeTiles().forEach((t) => { if (t.on) DeviceAPI(d).toggle(t.ch); })); Store.save(); render(); UI.toast('All devices off'); } });
    },
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
