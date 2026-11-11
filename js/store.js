/* Samo-home data store (localStorage). One source of truth for every page.
   Shape:
   { home: { name }, rooms: [{ id, name }], devices: [Device], notifications: n }
   Device (common): { id, type, name, roomId, model, manufacturer, protocol, online, showOnHome, isNew, createdAt, ... }
   Type-specific fields are owned by the device module (see js/devices/*.js). */
const Store = (() => {
  // Edition (single-file builds for one device type, see tools/bundle.py --edition): own data + seed
  const ED = window.SAMO_EDITION || null;
  const KEY = ED ? 'samo-home:' + ED.id : 'samo-home:v1';
  const uid = (p = 'id') => p + '-' + Math.random().toString(36).slice(2, 9);
  let state = null;
  const listeners = new Set();

  function seed() {
    if (ED && ED.seed) return ED.seed();
    const rooms = [
      { id: 'r-living', name: 'Living Room' },
      { id: 'r-kitchen', name: 'Kitchen' },
      { id: 'r-bedroom', name: 'Bedroom' },
    ];
    const devices = [
      { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-living', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: true },
      Devices.relay.create('tuya2', { name: 'Living room lights', roomId: 'r-living', channelNames: ['Ceiling', 'Hall'] }),
      Devices.relay.create('aqara', { name: 'Kitchen relay', roomId: 'r-kitchen', channelNames: ['Light', 'Boiler'] }),
      Devices.relay.create('din', { name: 'Water heater', roomId: 'r-bedroom' }),
      curtainSeed(),
      contactSeed(),
      lightSeed(),
      climateSeed(),
      motionSeed(),
      plugSeed(),
      leakSeed(),
      smokeSeed(),
      ...WAVE2.filter((t) => Devices[t[0]]).map(wave2Seed),
    ];
    devices.forEach((d) => { d.isNew = false; });
    return { home: { name: 'My Home' }, rooms, devices, notifications: 8, curtainAdded: true, contactAdded: true, lightAdded: true, climateAdded: true, motionAdded: true, plugAdded: true, leakAdded: true, smokeAdded: true, wave2: Object.fromEntries(WAVE2.filter((t) => Devices[t[0]]).map((t) => [t[0], true])) };
  }
  /** Example curtain: a track motor that is paired but not set up yet (shows the setup flow). */
  function curtainSeed() {
    const c = Devices.curtain.create('aqc3', { name: 'Bedroom curtain', roomId: 'r-bedroom' });
    c.id = 'd-curtain'; c.features = Object.keys(Devices.curtain.F).filter((k) => !['tilt', 'switchType', 'childLock', 'indicator', 'motorMode', 'step'].includes(k));
    Devices.curtain.applyDefaults(c);
    return c;
  }
  /** Example door sensor on the front door (all features of a common Aqara sensor + tamper). */
  function contactSeed() {
    const c = Devices.contact.create('aqara', { name: 'Front door', roomId: 'r-living' });
    c.id = 'd-contact'; c.features.push('tamper'); Devices.contact.applyDefaults(c);
    return c;
  }
  /** Example colour bulb in the living room. */
  function lightSeed() { const l = Devices.light.create('hue', { name: 'Living room lamp', roomId: 'r-living' }); l.id = 'd-light'; return l; }
  /** Example temperature & humidity sensor with a screen in the bedroom. */
  function climateSeed() { const c = Devices.climate.create('sonoffd', { name: 'Bedroom climate', roomId: 'r-bedroom' }); c.id = 'd-climate'; return c; }
  /** Example motion sensor in the living room; "Lights on motion" switches the living room lamp. */
  function motionSeed() { const m = Devices.motion.create('hue', { name: 'Living room motion', roomId: 'r-living' }); m.id = 'd-motion'; m.settings.motionLight.target = { id: 'd-light', ch: 0 }; return m; }
  /** Example smart plug in the kitchen with a washing machine on it. */
  function plugSeed() { const p = Devices.plug.create('third', { name: 'Washing machine', roomId: 'r-kitchen' }); p.id = 'd-plug'; p.channels[0].display = 'switch'; p.channels[0].icon = 'dev-washing'; return p; }
  /** Water leak sensor under the kitchen sink (replaces the old placeholder "Water Leak Sensor"). */
  function leakSeed() { const l = Devices.leak.create('aqara', { name: 'Kitchen sink', roomId: 'r-kitchen' }); l.id = 'd-leak'; return l; }
  /** Smoke detector in the kitchen (Heiman: pre-alarm, heat, silence, cooking pause). */
  function smokeSeed() { const s = Devices.smoke.create('heiman', { name: 'Kitchen smoke', roomId: 'r-kitchen' }); s.id = 'd-smoke'; return s; }
  /** Wave 2 (Device Interface 3: 9, 13, 15–19, 21): one example of each, added once to existing homes too. */
  const WAVE2 = [
    ['lock', 'idlock', 'Front door lock', 'r-living', 'd-lock'],
    ['valve', 'frank', 'Main water', 'r-kitchen', 'd-valve'],
    ['gas', 'aqara', 'Kitchen gas', 'r-kitchen', 'd-gas'],
    ['air', 'efekta', 'Bedroom air', 'r-bedroom', 'd-air'],
    ['presence', 'fp1e', 'Living room presence', 'r-living', 'd-presence'],
    ['vibration', 'aqara', 'Dryer', 'r-kitchen', 'd-vibration'],
    ['meter', 'd5z', 'Home meter', 'r-living', 'd-meter'],
    ['ir', 'zs06', 'Bedroom remote', 'r-bedroom', 'd-ir'],
  ];
  function wave2Seed([type, preset, name, roomId, id]) { const d = Devices[type].create(preset, { name, roomId }); d.id = id; return d; }
  /** Existing data from before curtains existed: add the example curtain once (stays deleted if removed). */
  function ensureCurtain() {
    if (ED || state.curtainAdded) return;
    const c = curtainSeed(); c.isNew = true;
    if (!state.rooms.some((r) => r.id === c.roomId)) c.roomId = (state.rooms[0] || {}).id || null;
    state.devices.push(c); state.curtainAdded = true; save();
  }
  /** Same for the contact sensor (added once; stays deleted if the user removes it). */
  function ensureContact() {
    if (ED || state.contactAdded) return;
    const c = contactSeed(); c.isNew = true;
    if (!state.rooms.some((r) => r.id === c.roomId)) c.roomId = (state.rooms[0] || {}).id || null;
    state.devices.push(c); state.contactAdded = true; save();
  }

  function load() {
    try { state = JSON.parse(SafeStorage.local.getItem(KEY)); } catch { state = null; }
    if (!state || !state.devices) { state = seed(); save(); }
    ensureCurtain();
    ensureContact();
    if (!ED && !state.lightAdded) { const l = lightSeed(); l.isNew = true; if (!state.rooms.some((r) => r.id === l.roomId)) l.roomId = (state.rooms[0] || {}).id || null; state.devices.push(l); state.lightAdded = true; save(); }
    if (!ED && !state.climateAdded) { const c = climateSeed(); c.isNew = true; if (!state.rooms.some((r) => r.id === c.roomId)) c.roomId = (state.rooms[0] || {}).id || null; state.devices.push(c); state.climateAdded = true; save(); }
    if (!ED && !state.motionAdded) { const m = motionSeed(); m.isNew = true; if (!state.devices.some((x) => x.id === 'd-light')) m.settings.motionLight.target = null; if (!state.rooms.some((r) => r.id === m.roomId)) m.roomId = (state.rooms[0] || {}).id || null; state.devices.push(m); state.motionAdded = true; save(); }
    if (!ED && !state.plugAdded) { const p = plugSeed(); p.isNew = true; if (!state.rooms.some((r) => r.id === p.roomId)) p.roomId = (state.rooms[0] || {}).id || null; state.devices.push(p); state.plugAdded = true; save(); }
    if (!ED && !state.leakAdded) {   // the old placeholder sensor becomes a real leak sensor
      const i = state.devices.findIndex((x) => x.id === 'd-leak' && x.type === 'sensor'), l = leakSeed();
      if (i >= 0) { l.roomId = state.devices[i].roomId; l.isNew = false; state.devices[i] = l; } else { l.isNew = true; if (!state.rooms.some((r) => r.id === l.roomId)) l.roomId = (state.rooms[0] || {}).id || null; state.devices.push(l); }
      state.leakAdded = true; save();
    }
    if (!ED && !state.smokeAdded) { const s = smokeSeed(); s.isNew = true; if (!state.rooms.some((r) => r.id === s.roomId)) s.roomId = (state.rooms[0] || {}).id || null; state.devices.push(s); state.smokeAdded = true; save(); }
    if (!ED) WAVE2.forEach((t) => {
      if (!Devices[t[0]] || (state.wave2 || {})[t[0]]) return;
      const d = wave2Seed(t); d.isNew = true; if (!state.rooms.some((r) => r.id === d.roomId)) d.roomId = (state.rooms[0] || {}).id || null;
      state.devices.push(d); state.wave2 = Object.assign({}, state.wave2, { [t[0]]: true }); save();
    });
    // bring saved devices up to the current model (new settings get defaults, renamed values are mapped)
    state.devices.forEach((d) => { const T = Devices[d.type]; if (T && T.applyDefaults && d.settings) T.applyDefaults(d); });
    return state;
  }
  function save() {
    SafeStorage.local.setItem(KEY, JSON.stringify(state));
    listeners.forEach((fn) => fn(state));
  }
  window.addEventListener('storage', (e) => { if (e.key === KEY) { load(); listeners.forEach((fn) => fn(state)); } });

  return {
    uid,
    get state() { return state || load(); },
    save,
    subscribe: (fn) => listeners.add(fn),
    reset() { SafeStorage.local.removeItem(KEY); state = null; load(); },

    device: (id) => (state || load()).devices.find((d) => d.id === id),
    room: (id) => (state || load()).rooms.find((r) => r.id === id),
    roomName: (id) => ((state || load()).rooms.find((r) => r.id === id) || {}).name || 'No room',

    addRoom(name) { const r = { id: uid('r'), name }; this.state.rooms.push(r); save(); return r; },
    addDevice(d) { this.state.devices.push(d); save(); return d; },
    removeDevice(id) { state.devices = state.devices.filter((d) => d.id !== id); save(); },
    updateDevice(id, fn) { const d = this.device(id); if (d) { fn(d); save(); } return d; },
  };
})();
