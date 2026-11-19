/* A room — Figma "Room view" 5426:24209 and "Edit/view page" (Room Settings) 5426:24259.
   room.html?id=r-…            the room's tiles (same tiles and taps as Home) + Hidden devices
   room.html?id=r-…&settings=1 Room Settings: name, its devices (→ each device's settings), Select devices, Remove room
   room.html?id=none           devices that are in no room (no settings) */
(() => {
  const id = UI.param('id'), none = id === 'none', settings = UI.param('settings') === '1' && !none;
  const room = none ? { id: null, name: 'No room' } : Store.room(id);
  UI.mount({ variant: settings ? 'elevated' : 'ambient' });
  if (!room) { UI.go('index.html'); return; }
  const esc = UI.esc, st = () => Store.state;
  const inRoom = () => st().devices.filter((d) => (d.roomId || null) === room.id);
  const viewUrl = `room.html?id=${none ? 'none' : room.id}`;

  /* ---------- the room ---------- */
  function viewPage() {
    const devs = inRoom(), shown = devs.filter((d) => d.showOnHome !== false), hidden = devs.filter((d) => d.showOnHome === false);
    const right = none ? '' : `<a class="glass-btn" href="${viewUrl}&settings=1" aria-label="Room settings"><img class="icon" src="assets/icons/setting.svg" width="24" height="24" alt=""></a>`;
    let h = UI.toolbar({ title: room.name, back: 'index.html', right });
    h += `<div class="tile-grid" data-key="tiles" style="padding-top:8px">${shown.map((d) => DeviceAPI(d).homeTiles().map((t) => homeTileHTML(d, t)).join('')).join('')}
      ${shown.length ? '' : `<button class="tile add" data-action="add-device" data-room="${room.id}"><span class="plus">${icon('plus', 'icon icon-sm')}</span><span>Add a device</span></button>`}</div>`;
    if (hidden.length) h += `<div class="section-title" data-key="hidden-h">Hidden devices</div>
      <div class="tile-grid is-hidden-tiles" data-key="hidden">${hidden.map((d) => DeviceAPI(d).homeTiles().map((t) => homeTileHTML(d, t)).join('')).join('')}</div>
      <div class="list-footer" data-key="hidden-f">Not on the Home screen. Turn on “Show on Home Screen” in a device’s settings to bring it back.</div>`;
    h += '<div style="height:40px"></div>';
    UI.patch(UI.screen, h);
  }

  /* ---------- Room Settings ---------- */
  function settingsPage() {
    const devs = inRoom();
    let h = UI.toolbar({ title: 'Room Settings', back: viewUrl, plain: true });
    h += `<div style="height:12px"></div>
      <div class="field static" role="button" tabindex="0" data-action="rm-rename" data-key="name"><span class="field-label">Room Name</span><div class="t-lg">${esc(room.name)}</div></div>
      <div class="list-header" data-key="devs-h">Devices in this room${devs.length ? ` (${devs.length})` : ''}</div>
      ${devs.length ? `<div class="list" data-key="devs">${devs.map((d) => {
        const t = DeviceAPI(d).homeTiles()[0] || {}, warn = t.tone === 'danger' || t.tone === 'warn' ? t.status : '';
        return `<a class="cell has-icon" href="device-settings.html?id=${d.id}"><span class="cell-icon">${icon(t.icon || DeviceAPI(d).icon(0))}</span>
          <span class="cell-main"><span class="cell-title" style="display:block">${esc(d.name)}</span>${warn ? `<span class="cell-sub is-${t.tone}" style="display:block">${esc(warn)}</span>` : ''}</span>${icon('pen', 'icon rm-pen')}</a>`;
      }).join('')}</div>` : '<div class="list-footer" data-key="devs-none">No devices yet.</div>'}
      <div class="pad" data-key="select" style="margin-top:16px;display:flex;justify-content:center"><button class="btn-pill" data-action="rm-select">${icon('plus', 'icon icon-xs')} Select devices</button></div>
      <div class="pad" data-key="del" style="margin-top:32px"><button class="btn btn-danger btn-block" data-action="rm-delete">Remove room</button></div>
      <div style="height:24px"></div>`;
    UI.patch(UI.screen, h);
  }

  const render = () => (settings ? settingsPage() : viewPage());

  /* Select devices: every device, ticked = in this room. Unticking sends it to No room. */
  function openSelect() {
    const pick = new Set(inRoom().map((d) => d.id));
    const s = UI.sheet({
      title: 'Devices in ' + room.name,
      render: () => `<div class="list">${st().devices.map((d) => `<button class="option" role="checkbox" aria-checked="${pick.has(d.id)}" data-action="rm-pick" data-v="${d.id}">
          <span class="option-main"><span class="option-title" style="display:block">${esc(d.name)}</span><span class="option-sub" style="display:block">${esc(Store.roomName(d.roomId))}</span></span><span class="radio">${icon('radio-on')}</span></button>`).join('')}</div>`,
      footer: '<button class="btn btn-primary btn-block" data-action="rm-apply">Done</button>',
    });
    UI.on({
      'rm-pick': ({ v }) => { if (pick.has(v)) pick.delete(v); else pick.add(v); s.refresh(); },
      'rm-apply': () => { st().devices.forEach((d) => { if (pick.has(d.id)) d.roomId = room.id; else if (d.roomId === room.id) d.roomId = null; }); Store.save(); UI.closeSheet(); render(); },
    });
  }

  UI.on({
    // the same tile taps as on Home
    open: ({ id: did, ch }) => UI.go(`device.html?id=${did}&ch=${ch}`),
    'tile-cmd': ({ id: did, ch, c }) => { const d = Store.device(did); DeviceAPI(d).tileCmd(+ch, c); Store.save(); render(); },
    'tile-power': ({ id: did, ch }) => { const d = Store.device(did); DeviceAPI(d).toggle(+ch); Store.save(); render(); UI.pulse(UI.screen.querySelector(`.tile[data-id="${did}"][data-ch="${ch}"]`), 'just-toggled'); },
    'add-device': () => UI.go(`add-device.html?via=zigbee${room.id ? '&room=' + room.id : ''}`),
    'rm-rename': () => UI.prompt({ title: 'Rename room', label: 'Room Name', value: room.name, okText: 'Save',
      validate: (v) => (!v ? 'Enter a room name' : st().rooms.some((x) => x !== room && x.name.toLowerCase() === v.toLowerCase()) ? 'A room with this name already exists' : null),
      onOk: (v) => { room.name = v; Store.save(); render(); } }),
    'rm-select': openSelect,
    'rm-delete': () => UI.confirm({ title: `Remove ${room.name}?`, text: 'All devices in this room move to the “No room” list.', ok: 'Remove',
      onOk: () => { Store.removeRoom(room.id); SafeStorage.session.setItem('samo-flash', `${room.name} removed`); UI.go('index.html'); } }),
  });
  render();
  // live tiles (curtains moving, sensors changing) — like Home
  if (!settings) { const busy = () => inRoom().some((d) => (d.channels || []).some((c) => c.timer) || DeviceAPI(d).busy()); startDeviceClock((changed) => { if (changed || busy()) viewPage(); }); }
})();
