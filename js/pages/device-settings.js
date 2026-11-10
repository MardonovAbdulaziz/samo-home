/* Device settings — Figma: "Розетка" (5433:48171), Rename (5433:47027), Delete confirm modal (5433:48504) */
(() => {
  const d = Store.device(UI.param('id'));
  UI.mount({ variant: 'elevated', panel: !!(d && Devices[d.type] && Devices[d.type].protoPanel) });
  if (!d) { UI.go('index.html'); return; }
  const api = DeviceAPI(d);
  const T = Devices[d.type] || {};

  const ctx = {
    render() {
      const roomName = Store.roomName(d.roomId);
      let h = UI.toolbar({ title: 'Device Settings', back: `device.html?id=${d.id}`, plain: true });
      // Multi-channel relays have no single device icon — each channel has its own (see Channels list)
      const av = T.avatarIcon ? T.avatarIcon(d) : api.icon(0);
      // Always rendered; opens/closes smoothly when channels get grouped / ungrouped (no layout jump)
      h += '<div style="height:12px"></div>' + UI.collapse(!!av, `<div class="edit-avatar" style="margin:0 auto 24px"><div class="ring">${icon(av || api.icon(0), 'icon', 'style="width:48px;height:48px"')}</div>
          <button class="pen" data-action="${T.avatarIcon ? 'rs-icon' : 'soon'}" aria-label="Change icon">${icon('pen', 'icon', 'style="width:20px;height:20px"')}</button></div>`);
      h += `<div class="field static" role="button" tabindex="0" data-action="rename"><span class="field-label">Device Name</span><div class="t-lg">${UI.esc(d.name)}</div></div>
        <div class="list" style="margin-top:24px">
          <button class="cell" data-action="room"><span class="cell-main cell-title">Room</span><span class="cell-value">${UI.esc(roomName)}</span>${icon('chevron-right', 'chev')}</button>
          ${T.displayRow ? T.displayRow(d) : ''}
          <button class="cell" data-action="show-home"><span class="cell-main cell-title">Show on Home Screen</span><span class="switch" role="switch" aria-checked="${d.showOnHome !== false}"></span></button>
        </div>`;
      h += api.settings(ctx);
      const identify = d.features && d.features.includes('identify');
      h += `<div class="list-gap"></div><div class="list">
          ${identify ? `<button class="cell" data-action="rs-identify"><span class="cell-main cell-title">Find this device</span></button>` : ''}
          ${histRow()}
          <a class="cell" href="about-device.html?id=${d.id}"><span class="cell-main cell-title">About Device</span>${icon('chevron-right', 'chev')}</a>
          <button class="cell" data-action="firmware"><span class="cell-main cell-title">Firmware Update</span><span class="cell-value">${UI.esc(d.firmware || '')}</span>${icon('chevron-right', 'chev')}</button>
        </div>
        <div class="pad" style="margin-top:24px"><button class="btn btn-danger btn-block" data-action="delete">Remove Device</button></div>
        <div style="height:24px"></div>`;
      UI.patch(UI.screen, h);
      const panel = document.getElementById('protoPanel');
      if (panel) UI.patch(panel, api.protoPanel(ctx));
    },
  };

  /** Event History: device types with their own log (contact sensor) open it; others are not built yet. */
  function histRow() {
    const v = T.historyValue ? T.historyValue(d) : null;
    return `<button class="cell" data-action="${v !== null ? 'rs-history' : 'soon'}"><span class="cell-main cell-title">Event History</span>${v ? `<span class="cell-value">${UI.esc(v)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
  }

  function openRoom() {
    const s = UI.sheet({
      title: 'Select a room',
      render: () => `<div class="list">${Store.state.rooms.map((r) => `<button class="option" role="radio" aria-checked="${d.roomId === r.id}" data-action="room-set" data-r="${r.id}"><span class="option-main option-title">${UI.esc(r.name)}</span><span class="radio">${icon('radio-on')}</span></button>`).join('')}
        <button class="option" role="radio" aria-checked="${!d.roomId}" data-action="room-set" data-r=""><span class="option-main option-title">No room</span><span class="radio">${icon('radio-on')}</span></button></div>
`,
      footer: `<button class="btn btn-glass btn-block" data-action="room-new">${icon('plus')} Add a room</button>`,
    });
    UI.on({
      'room-set': ({ r }) => { d.roomId = r || null; Store.save(); ctx.render(); UI.closeSheet(); },
      'room-new': () => UI.prompt({ title: 'Add room', label: 'Room name', okText: 'Create', onOk: (v) => { d.roomId = Store.addRoom(v).id; Store.save(); ctx.render(); UI.toast(`Moved to ${v}`); } }),
    });
  }

  UI.on({
    rename: () => UI.prompt({ title: 'Rename', label: 'Device name', value: d.name, onOk: (v) => { d.name = v; Store.save(); ctx.render(); UI.toast('Saved'); } }),
    room: openRoom,
    'show-home': () => { d.showOnHome = d.showOnHome === false; Store.save(); ctx.render(); },
    firmware: () => UI.sheet({ title: 'Firmware Update', render: () => `<div class="hero" style="padding-top:8px"><div class="hero-icon" style="color:var(--green)">${icon('check', 'icon', 'style="width:56px;height:56px"')}</div><h1>Up to date</h1><p>Version ${UI.esc(d.firmware || '—')}</p></div>` }),
    delete: () => UI.confirm({
      title: 'Remove device?', text: 'Are you sure you want to remove this device? It will be unlinked from your home.', ok: 'Remove',
      onOk: () => { Store.removeDevice(d.id); UI.flash(`“${d.name}” removed`); UI.go('index.html'); },
    }),
    soon: () => UI.toast('Coming soon'),
  });
  api.bindSettings(ctx);
  api.bindProto(ctx);
  ctx.render();
  startDeviceClock((changed) => { if (changed) ctx.render(); }); // patch() only touches the screen — safe while a sheet is open
})();
