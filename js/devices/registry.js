/* Device type registry.
   Each device type implements the same interface so pages stay generic:

   Devices[type] = {
     label,                          // human name of the type
     icon(dev, ch)                   // icon name for tiles / settings avatar
     homeTiles(dev) -> [{ ch, name, icon, on, status, controllable, offline }]
     toggle(dev, ch)                 // quick power from the home tile
     page(dev, ctx) -> html          // device view (device.html)
     bindPage(dev, ctx)              // register UI.on() handlers for the page
     settings(dev, ctx) -> html      // type-specific sections on device-settings.html
     bindSettings(dev, ctx)
     about(dev) -> [[label, value, copyable]]   // extra rows on about-device.html
     tick(dev) -> boolean            // called every second, return true if state changed
     busy(dev) -> boolean            // something is in motion (home re-renders every second while true)
     protoPanel(dev, ctx) -> html    // desktop-only test panel (optional)
   }

   To add a new device type: create js/devices/<type>.js, assign Devices.<type> = {...},
   and include the script on each page before js/store.js. */
const Devices = {};

/* ---------- Generic: Hub ---------- */
Devices.hub = {
  label: 'Hub',
  icon: () => 'dev-hub',
  homeTiles: (d) => [{ ch: 0, name: d.name, icon: 'dev-hub', on: false, status: d.online ? 'Online' : 'Offline', controllable: false, offline: !d.online }],
  page: (d) => {
    const n = Store.state.devices.filter((x) => x.type !== 'hub').length;
    return `<div class="hero"><div class="hero-icon">${icon('dev-hub', 'icon', 'style="width:64px;height:64px"')}</div>
      <h1>${UI.esc(d.name)}</h1><p>${d.online ? 'Online' : 'Offline'} · ${n} connected devices</p></div>
      <div class="list-header">Connection</div>
      <div class="list"><div class="cell"><div class="cell-main"><div class="cell-title">${UI.esc(d.protocol)}</div><div class="cell-sub">Connection method</div></div></div></div>`;
  },
  about: (d) => [['Connection', d.protocol]],
};

/* ---------- Generic: Sensor (read-only) ---------- */
Devices.sensor = {
  label: 'Sensor',
  icon: () => 'dev-drop',
  homeTiles: (d) => [{ ch: 0, name: d.name, icon: 'dev-drop', on: false, status: d.online ? d.status : 'Offline', controllable: false, offline: !d.online }],
  page: (d) => `<div class="hero"><div class="hero-icon">${icon('dev-drop', 'icon', 'style="width:64px;height:64px"')}</div>
      <h1>${UI.esc(d.status)}</h1><p>Last update 2 min ago</p></div>
      <div class="pad"><div class="banner info">${icon('round-info')}<div><b>Coming soon</b> · This device type is not built yet. Relay is the first device interface.</div></div></div>`,
  about: () => [],
};

/* Fallbacks so pages can call any method safely */
const DeviceAPI = (d) => {
  const t = Devices[d.type] || Devices.sensor;
  return {
    label: t.label,
    icon: (ch) => (t.icon ? t.icon(d, ch) : 'info'),
    homeTiles: () => (t.homeTiles ? t.homeTiles(d) : []),
    toggle: (ch) => t.toggle && t.toggle(d, ch),
    page: (ctx) => (t.page ? t.page(d, ctx) : ''),
    bindPage: (ctx) => t.bindPage && t.bindPage(d, ctx),
    settings: (ctx) => (t.settings ? t.settings(d, ctx) : ''),
    bindSettings: (ctx) => t.bindSettings && t.bindSettings(d, ctx),
    about: () => (t.about ? t.about(d) : []),
    tick: () => (t.tick ? t.tick(d) : false),
    busy: () => (t.busy ? t.busy(d) : false),
    protoPanel: (ctx) => (t.protoPanel ? t.protoPanel(d, ctx) : ''),
    bindProto: (ctx) => t.bindProto && t.bindProto(d, ctx),
  };
};

/** Run every device's tick() once per second; save + callback if anything changed. */
function startDeviceClock(onChange) {
  UI.tick(() => {
    let changed = false;
    for (const d of Store.state.devices) if (DeviceAPI(d).tick()) changed = true;
    if (changed) Store.save();
    onChange && onChange(changed);
  });
}
