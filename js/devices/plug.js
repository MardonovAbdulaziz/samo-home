/* ==========================================================================
   Smart plug — device interface
   Source: "Device Interface 3 / 5. Smart_Plug_Interface.html" (features from zigbee2mqtt, 328 plugs, sockets and strips)
   Rule: show a control only if the paired plug has it.
   The plug works like a relay (big switch, a tile per socket, timer, power cards), so it uses makeSwitch() from
   relay.js with its own catalogue. Plug-only behaviour (what is plugged in, overload, finished-charging, power
   alerts, metering-only, energy history) lives in makeSwitch behind has(d, …), so a relay never shows it.
   ========================================================================== */
const PLUG_K = (() => {
  const F = {
    onoff: { name: 'On / off', grp: 'Device page', ic: 'power', type: 'control', perCh: true, short: 'Switches the power to what is plugged in' },
    timer: { name: 'Timer', grp: 'Device page', ic: 'clock', type: 'control', perCh: true, short: 'Switches the socket once, after the time you pick' },
    power: { name: 'Power & energy', grp: 'Device page', ic: 'bolt', type: 'reading', short: 'Electricity used now and in total' },
    allOnOff: { name: 'All on / all off', grp: 'Device page', ic: 'double-check', type: 'control', short: 'All sockets at once' },
    consumer: { name: 'Something plugged in', grp: 'Device page', ic: 'socket', type: 'reading', short: 'Whether a plug is pushed into the socket' },
    quality: { name: 'Frequency & power factor', grp: 'Device page', ic: 'bolt', type: 'reading', short: 'Mains frequency and how efficiently the appliance uses power' },

    powerOn: { name: 'After a power cut', grp: 'Power cut', ic: 'bolt-crossed', type: 'choice', perCh: true, def: 'previous',
      opts: [['off', 'Stay off', 'Safest for heaters, irons, kettles'], ['on', 'Turn on', 'Fridge, router, aquarium'], ['previous', 'Remember last state', 'Recommended'], ['toggle', 'Opposite of before', 'Rarely useful']],
      short: 'What the socket does when electricity comes back' },

    overload: { name: 'Overload protection', grp: 'Safety', ic: 'shield-check', type: 'overload', def: { on: true, maxW: 2300, maxA: 16, maxV: 250, minV: 180 },
      short: 'Turns the socket off if the appliance pulls too much, or the voltage goes too high or too low' },
    autoOff: { name: 'Turn off when finished', grp: 'Safety', ic: 'battery', type: 'autooff', def: { on: false, w: 2, min: 20 },
      short: 'Switches off by itself when the appliance is done — a phone or e-bike fully charged' },

    inching: { name: 'Auto-off (inching)', grp: 'Output', ic: 'refresh', type: 'inch', perCh: true, modes: true, def: { on: false, sec: 5, mode: 'off' },
      short: 'After every switch, the socket switches back by itself after a few seconds' },
    meterOnly: { name: 'Metering only', grp: 'Output', ic: 'bolt', type: 'toggle', perCh: true, def: false, showSub: true,
      short: 'Always on — only measures; nobody can switch it off by mistake' },

    childLock: { name: 'Child lock', grp: 'Button & lights', ic: 'lock', type: 'toggle', def: false, showSub: true, short: 'The button on the plug does nothing' },
    buttonAct: { name: 'Button reacts on', grp: 'Button & lights', ic: 'hand-stop', type: 'choice', def: 'release',
      opts: [['release', 'When released', 'Avoids switching by a light touch'], ['press', 'When pressed', 'Feels faster']], short: 'Switch when the button goes down, or when you let go' },
    buttonScope: { name: 'Button controls', grp: 'Button & lights', ic: 'arrow-fork', type: 'choice', def: 'relay',
      opts: [['relay', 'Only the socket', ''], ['relay_and_usb', 'The socket and the USB ports', 'Everything off with one press']], short: 'For sockets with USB ports' },
    indicator: { name: 'Status light', grp: 'Button & lights', ic: 'eye', type: 'choice', def: 'on_when_on',
      opts: [['off', 'Off', 'For bedrooms'], ['on_when_on', 'On when the socket is on', ''], ['on_when_off', 'On when the socket is off', 'Find it in a dark room'], ['always', 'Always on', '']], short: 'The small light on the plug' },
    ledBrightness: { name: 'Light brightness', grp: 'Button & lights', ic: 'sun', type: 'number', label: 'Brightness', unit: '%', def: 60, min: 0, max: 100, step: 10, short: 'How bright the light on the plug is' },
    nightLed: { name: 'Light off at night', grp: 'Button & lights', ic: 'moon', type: 'toggle', def: true, showSub: true, short: 'Its light goes dark from 21:00 to 09:00' },
    networkLed: { name: 'Network light', grp: 'Button & lights', ic: 'eye', type: 'toggle', def: true, showSub: true, short: 'The blue light that shows it is connected' },
    backlight: { name: 'Button backlight', grp: 'Button & lights', ic: 'sun', type: 'choice', def: 'medium',
      opts: [['off', 'Off', ''], ['low', 'Low', ''], ['medium', 'Medium', ''], ['high', 'High', '']], short: 'Lights up the touch buttons of a wall socket' },

    notify: { name: 'Safety notifications', grp: 'Notifications', ic: 'bell', type: 'notify', app: true, def: { safety: true, hot: true, offline: false }, short: 'Which plug events send a push message' },
    powerAlerts: { name: 'Appliance started / finished', grp: 'Notifications', ic: 'bell', type: 'alerts', app: true, def: { rise: true, riseW: 500, drop: false, dropW: 500 },
      short: 'A push message when the power jumps up or drops — “the washing machine has finished”' },
    pressEvents: { name: 'Button presses as a trigger', grp: 'Automation', ic: 'hand-stop', type: 'event', app: true, short: 'Single, double or hold on the plug can start a scenario' },
    history: { name: 'Energy history', grp: 'Log', ic: 'bolt', type: 'reading', app: true, short: 'Energy per day, built by our server from the plug’s total' },

    identify: { name: 'Find this device', grp: 'Device', ic: 'my-location', type: 'action', short: 'Blinks the plug’s light' },
    resetEnergy: { name: 'Reset energy counter', grp: 'Device', ic: 'reset', type: 'action', short: 'Sets the total kWh back to 0' },
    deviceTemp: { name: 'Plug temperature', grp: 'Device', ic: 'temperature', type: 'reading', short: 'Too hot means overload or a loose wall socket' },
    outageCount: { name: 'Power cuts counted', grp: 'Device', ic: 'bolt-crossed', type: 'reading', short: 'How many times the plug lost power' },
  };
  const PRESETS = [
    { id: 'tuya', name: 'Tuya smart plug with metering', model: 'TS011F_plug_1', manufacturer: 'Tuya', ch: 1, names: ['Plug'], app: ['tv'],
      feats: ['onoff', 'timer', 'power', 'powerOn', 'childLock', 'buttonAct', 'indicator', 'identify', 'notify', 'powerAlerts', 'history'] },
    { id: 'aqara', name: 'Aqara smart plug EU', model: 'SP-EUC01', manufacturer: 'Aqara', ch: 1, names: ['Plug'], app: ['charger'], ovFields: ['maxW'], autoOffFixed: true,
      feats: ['onoff', 'power', 'consumer', 'powerOn', 'overload', 'autoOff', 'deviceTemp', 'childLock', 'nightLed', 'notify', 'powerAlerts', 'history', 'outageCount'] },
    { id: 'sonoff', name: 'SONOFF S60 smart plug', model: 'S60ZBTPF', manufacturer: 'SONOFF', ch: 1, names: ['Plug'], app: ['heater'],
      feats: ['onoff', 'power', 'powerOn', 'overload', 'networkLed', 'inching', 'notify', 'powerAlerts', 'history'] },
    { id: 'third', name: 'Third Reality smart plug', model: '3RSP0186Z', manufacturer: 'Third Reality', ch: 1, names: ['Plug'], app: ['washer'],
      feats: ['onoff', 'timer', 'power', 'quality', 'powerOn', 'ledBrightness', 'meterOnly', 'resetEnergy', 'notify', 'powerAlerts', 'history'] },
    { id: 'double', name: 'Double socket with metering', model: 'TS011F_2_gang_power', manufacturer: 'Tuya', ch: 2, names: ['Left', 'Right'], app: ['kettle', 'none'],
      feats: ['onoff', 'power', 'allOnOff', 'identify', 'notify', 'powerAlerts', 'history'] },
    { id: 'strip', name: 'Power strip, 4 sockets + USB', model: 'TS0115', manufacturer: 'Tuya', ch: 5, names: ['Socket 1', 'Socket 2', 'Socket 3', 'Socket 4', 'USB'], app: ['tv', 'none', 'none', 'none', 'charger'],
      feats: ['onoff', 'powerOn', 'allOnOff', 'notify'] },
    { id: 'wall', name: 'Wall socket, 2 sockets + USB', model: 'TS011F_2_gang_2_usb_wall', manufacturer: 'Tuya', ch: 4, names: ['Left', 'Right', 'USB 1', 'USB 2'], app: ['kettle', 'none', 'charger', 'none'],
      feats: ['onoff', 'powerOn', 'backlight', 'childLock', 'buttonScope', 'allOnOff', 'notify'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', ch: 2, names: ['Left', 'USB'], app: ['heater', 'charger'], feats: Object.keys(F) },
  ];
  return {
    type: 'plug', label: 'Smart plug', noun: 'Plug', suffix: ' s', F, PRESETS, CH_COUNTS: [1, 2, 3, 4, 5, 6],
    SETTINGS_CARDS: [['Power cut', ['Power cut']], ['Safety', ['Safety']], ['Output', ['Output']], ['Button & lights', ['Button & lights']]],
    ALL_GROUPS: ['Device page', 'Power cut', 'Safety', 'Output', 'Button & lights', 'Notifications', 'Automation', 'Log', 'Device'],
    chName: (i) => 'Socket ' + (i + 1), chDisplay: () => 'socket',
    spec: '5.%20Smart_Plug_Interface.html', specName: 'Smart_Plug_Interface',
    appliances: true, timerFlips: true, allWord: 'sockets',
  };
})();
Devices.plug = makeSwitch(PLUG_K);
