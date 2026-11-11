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

/* ---------- Device icons (Figma "Icons" page, 5:60) — the user can pick any of them for a device ---------- */
const DEVICE_ICONS = [
  ['Sensors', ['dev-drop', 'dev-smoke', 'dev-flame', 'dev-motion', 'dev-temperature']],
  ['Doors & windows', ['dev-door-02', 'dev-door-open', 'dev-window', 'dev-window-2', 'dev-curtains', 'dev-garage', 'dev-gate', 'dev-barrier', 'dev-barrier-2', 'dev-lock']],
  ['Lighting', ['dev-bulb', 'dev-lamp', 'dev-lamp-02', 'dev-study-lamp', 'dev-wall-lamp', 'dev-chandelier-01', 'dev-chandelier-02', 'dev-round-led', 'dev-square-led']],
  ['Climate', ['dev-ac', 'dev-fan', 'dev-air', 'dev-purifier', 'dev-radiator', 'dev-radiator-mini', 'dev-thermostat']],
  ['Appliances', ['dev-socket', 'dev-socket-2', 'dev-kettle', 'dev-washing', 'dev-fridge', 'dev-dishwasher', 'dev-oven', 'dev-microwave', 'dev-vacuum', 'dev-iron']],
  ['Network', ['dev-hub', 'dev-router']],
];
/** Icon picker for device types that don't manage icons themselves: saves d.userIcon (home tile, settings avatar,
    and the sensor mark on the device page). The group of the current icon comes first. */
function openDeviceIconPicker(d, ctx) {
  const cur = DeviceAPI(d).icon(0);
  const groups = DEVICE_ICONS.slice().sort((a, b) => (b[1].includes(cur) ? 1 : 0) - (a[1].includes(cur) ? 1 : 0));
  UI.sheet({
    title: 'Select an icon',
    render: () => groups.map(([g, list]) => `<section class="sheet-group"><div class="list-header group-title">${g}</div></section><div class="pad icon-grid">${list.map((n) => `<button data-action="dv-icon-pick" data-n="${n}" aria-pressed="${DeviceAPI(d).icon(0) === n}" aria-label="${n.replace('dev-', '')}">${icon(n, 'icon', 'style="width:32px;height:32px"')}</button>`).join('')}</div>`).join(''),
    footer: '<button class="btn btn-secondary btn-block" data-action="sheet-close">Done</button>',
  });
  UI.on({ 'dv-icon-pick': ({ n }) => { d.userIcon = n; Store.save(); UI.closeSheet(); ctx.render(); } });
}

/* Fallbacks so pages can call any method safely */
const DeviceAPI = (d) => {
  const t = Devices[d.type] || Devices.sensor;
  // types with their own icon picker (light, relay/plug, contact) keep d.icon; all others use the generic d.userIcon
  // (read on every call: pages keep one DeviceAPI for their whole life while the icon can change)
  const own = () => (d.userIcon && !t.avatarIcon ? d.userIcon : null);
  return {
    label: t.label,
    icon: (ch) => own() || (t.icon ? t.icon(d, ch) : 'info'),
    homeTiles: () => { const ts = t.homeTiles ? t.homeTiles(d) : [], o = own(); return o ? ts.map((x) => Object.assign({}, x, { icon: o })) : ts; },
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
