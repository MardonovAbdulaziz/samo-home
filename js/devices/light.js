/* ==========================================================================
   Light device interface (smart bulbs, LED strips, dimmer switches / modules)
   Source: "Device Interface 3 / 1. Light_Interface.html" (zigbee2mqtt, 1 940 lights)
   Look: Figma light sketches (6560:50289) redone in the current Samo-home style (relay / curtain / contact).
   Rule: show a control only if the paired light has that feature.
   Spec notes followed: brightness 1–100 % (a slider on an off light turns it on); white tone in kelvin within
   the bulb's range; "Effects" lists only mood effects — the signal effects (blink, okay…) are used by
   "Find this device", never shown as a menu.
   ========================================================================== */
Devices.light = (() => {
  const esc = UI.esc;

  /* ---------- Feature catalogue ---------- */
  const F = {
    onoff: { name: 'On / off', grp: 'Device page', type: 'control', perCh: true, short: 'Turns the light on and off' },
    brightness: { name: 'Brightness', grp: 'Device page', type: 'control', perCh: true, short: 'How bright the light is, from 1 % to 100 %' },
    colorTemp: { name: 'White tone', grp: 'Device page', type: 'control', perCh: true, short: 'Warm (yellow) to cold (bluish) white' },
    color: { name: 'Colour', grp: 'Device page', type: 'control', perCh: true, short: 'Any colour, for RGB bulbs and LED strips' },
    effect: { name: 'Effects', grp: 'Device page', type: 'control', short: 'Mood effects that run until you stop them' },
    timer: { name: 'Timer', grp: 'Device page', type: 'control', perCh: true, short: 'Turns off once, after the time you pick' },
    power: { name: 'Power & energy', grp: 'Device page', type: 'reading', short: 'Electricity used' },

    powerOn: { name: 'After a power cut', grp: 'Power cut', type: 'choice', perCh: true, def: 'previous',
      opts: [['off', 'Stay off', 'Safer at night'], ['on', 'Turn on', 'Best for bulbs on a normal wall switch'], ['previous', 'Last state', 'Recommended'], ['toggle', 'Opposite', '']],
      short: 'When power comes back — also after someone flips a normal wall switch' },
    startup: { name: 'Colour after a power cut', grp: 'Power cut', type: 'startup', def: { mode: 'previous', k: 2700, br: 100 },
      opts: [['previous', 'Same as before', ''], ['custom', 'A tone and brightness I choose', ''], ['initial', 'Factory default', '']],
      short: 'How the light looks when it comes back on' },

    fade: { name: 'Fade time', grp: 'Dimming', type: 'choice', def: '1',
      opts: [['0', 'Instant', ''], ['0.5', '0.5 s', ''], ['1', '1 s', 'Feels natural'], ['3', '3 s', 'Nice in bedrooms']],
      short: 'How smoothly it turns on, off or changes brightness' },
    executeIfOff: { name: 'Change while off', grp: 'Dimming', type: 'toggle', def: false, showSub: true,
      short: 'Set the colour while off — it comes on with it' },
    dimRange: { name: 'Dimming range', grp: 'Dimming', type: 'range', perCh: true, def: { min: 10, max: 100 },
      short: 'Lowest and highest level the dimmer really uses — stops LED flicker at the low end' },
    lightType: { name: 'Bulb type', grp: 'Dimming', type: 'choice', perCh: true, def: 'led',
      opts: [['led', 'LED', ''], ['incandescent', 'Filament', 'Incandescent'], ['halogen', 'Halogen', '']],
      short: 'So the dimmer dims it the right way' },

    switchType: { name: 'Wall switch type', grp: 'Wall switch', type: 'choice', perCh: true, def: 'momentary',
      opts: [['momentary', 'Push button', 'Press = on / off, hold = dim'], ['toggle', 'Rocker', 'Every flip changes the light'], ['state', 'Rocker, fixed', 'Up is on, down is off']],
      short: 'The wall switch wired to the dimmer' },

    btnLight: { name: 'Button light', grp: 'Lights on the device', type: 'btnlight', def: { mode: 'on_when_off', color: 'blue', br: 70 },
      opts: [['off', 'Off', ''], ['on_when_on', 'With the light', ''], ['on_when_off', 'In the dark', 'Find the switch at night'], ['always', 'Always on', '']],
      short: 'The small light behind the buttons' },

    identify: { name: 'Find this device', grp: 'Device', type: 'action', short: 'The light blinks' },
    deviceTemp: { name: 'Device temperature', grp: 'Device', type: 'reading', short: 'Temperature inside the light' },
    outageCount: { name: 'Power cuts counted', grp: 'Device', type: 'reading', short: 'How many times it lost power' },
  };
  const SETTINGS_CARDS = [['Power cut', ['Power cut']], ['Dimming', ['Dimming']], ['Wall switch', ['Wall switch']], ['Lights on the device', ['Lights on the device']]];
  const ALL_GROUPS = ['Device page', 'Power cut', 'Dimming', 'Wall switch', 'Lights on the device', 'Device'];

  /* Mood effects only (spec). Signal effects (blink, breathe, okay, channel change) are not a menu. */
  const MOOD = { candle: 'Candle', fireplace: 'Fireplace', colorloop: 'Colour loop', sunrise: 'Sunrise', sunset: 'Sunset' };
  const BASIC = [], HUEFX = ['candle', 'fireplace', 'colorloop', 'sunrise', 'sunset'];

  const PRESETS = [
    { id: 'ikea', name: 'IKEA TRADFRI bulb, white spectrum', model: 'LED2101G4', manufacturer: 'IKEA', kind: 'bulb', ch: 1, names: ['Bedside lamp'], eff: BASIC, kRange: [2200, 4000],
      feats: ['onoff', 'brightness', 'colorTemp', 'fade', 'powerOn', 'startup', 'executeIfOff', 'identify'], opts: { startup: ['previous', 'custom'] } },
    { id: 'hue', name: 'Philips Hue White and Color bulb', model: '9290022166', manufacturer: 'Philips', kind: 'bulb', ch: 1, names: ['Living room lamp'], eff: HUEFX, kRange: [2000, 6500],
      feats: ['onoff', 'brightness', 'colorTemp', 'color', 'effect', 'fade', 'powerOn', 'startup', 'identify'], opts: { startup: ['previous', 'custom'] } },
    { id: 'tuyargb', name: 'Tuya RGB+CCT bulb', model: 'TS0505B_1', manufacturer: 'Tuya', kind: 'bulb', ch: 1, names: ['Kids room'], eff: BASIC, kRange: [2700, 6500],
      feats: ['onoff', 'brightness', 'colorTemp', 'color', 'fade', 'powerOn', 'startup'], opts: { powerOn: ['on', 'previous'], startup: ['initial', 'previous', 'custom'] } },
    { id: 'aqarat1', name: 'Aqara T1 bulb', model: 'ZNLDP13LM', manufacturer: 'Aqara', kind: 'bulb', ch: 1, names: ['Hallway'], kRange: [2700, 6500],
      feats: ['onoff', 'brightness', 'colorTemp', 'fade', 'powerOn', 'deviceTemp', 'outageCount'], opts: { powerOn: ['on', 'previous'] } },
    { id: 'dim2', name: 'Tuya 2-gang dimmer switch', model: 'TS0601_dimmer_2', manufacturer: 'Tuya', kind: 'dimmer', ch: 2, names: ['Ceiling', 'Spots'],
      feats: ['onoff', 'brightness', 'dimRange', 'timer', 'powerOn', 'btnLight'], opts: { btnLight: ['off', 'on_when_on', 'on_when_off'] } },
    { id: 'moes3', name: 'Moes Star Ring dimmer, 3-gang', model: 'ZS-SR-EUD-3', manufacturer: 'Moes', kind: 'dimmer', ch: 3, names: ['Ceiling', 'Spots', 'Wall lamp'], btnExtra: true,
      feats: ['onoff', 'brightness', 'dimRange', 'timer', 'lightType', 'powerOn', 'btnLight', 'power'], opts: { btnLight: ['off', 'on_when_on', 'on_when_off'] } },
    { id: 'ts110e', name: 'Tuya 2-channel dimmer module', model: 'TS110E_2gang_2', manufacturer: 'Tuya', kind: 'dimmer', ch: 2, names: ['Living', 'Hall'],
      feats: ['onoff', 'brightness', 'dimRange', 'powerOn', 'switchType'] },
    { id: 'all', name: 'All features (design)', model: 'every feature on', manufacturer: 'Samo', kind: 'bulb', ch: 1, names: ['Light'], eff: HUEFX, btnExtra: true, kRange: [2000, 6500],
      feats: Object.keys(F) },
  ];
  const CH_COUNTS = [1, 2, 3, 4];
  const BTN_COLORS = { red: '#ff3a3a', orange: '#ff7c0a', yellow: '#ffd60a', green: '#30d158', blue: '#0a84ff', purple: '#9508ec', white: '#fffdf5' };
  /* Colour presets next to the picker — Figma 6560:49942: white, a separator, then four colours */
  // [name, Figma dot colour, knob spot (purple: where Figma draws it), the widget tint's hue / saturation — the same as before the Figma dots]
  const SWATCH = [['white', null], ['blue', '#00adf8', null, [205, 90]], ['mint', '#0efda0', null, [158, 80]], ['red', '#ff2563', null, [350, 85]], ['purple', '#af52de', [0.316, 0.123], [285, 70]]];
  /* The colour field is the Figma picture (6560:49952, assets/light/colour-field.jpg). Picking reads this 48 × 28
     table sampled from the visible part of that picture (canvas pixels can't be read on file:// pages). */
  const PIC = "background-image:url('assets/light/colour-field.jpg')";   // inline: the path is relative to the page (and the bundler inlines it)
  const LUT = 'e201ffe002ffda00fed201fdcd01fecb01fec200fdbb00fdb101fdad00ffa400ff9b00fe9100ff8500ff7900fe6e00ff5e00fd5005f9490bfb4615fc4120fe3928fc302efb303dff2e4bfd2e56fd2962ff226afe1973fe0b7cfd0486fe0292fd029ffe01acfe01b6fd03c1fe00ccfe02d6ff01ddfd01e5fe01edfd02f5fb03fbfd02fcf902fdf400fcec02fee803fce4eb02fee801ffe201ffdd00fed701ffd001ffcb00ffc301fdbc00fdb201fead00ffa201fe9901fe8d00fe8100ff7702fe700efc6e1ffe682bfe6234fd5d3efd5645fe4c4afc4d57fe4e67ff4e70ff4978fd4183fe368afd2c92ff1d98ff109dff05aafc03b3fd02c0fe02cbfe03d5fe05e0ff02e7fe03efff04f7fe02fcfb02fdf602fcf002fdea01fde700fde000fedcf501fff000ffe901fee702ffe101ffdb01fed201fdcd01fec500fdbe00feb600fdae00ffa301fd9701ff9008fd8d16fe8a2afd873bff8145fe7c4efd7958fe7360fe6b65fd6970fe697dfe6587fd6490fe5c99fd539ffc47a6ff38abfe28b3fe15b8fc07c1fd03cbfd02d6fe03dffd04e9fd02f3fd03f9fc01fcf901fdef02fdea02fee801fee100feda01fdd700fcd3fc01fcf701fdf200feed00fee701ffe101fede00fdd400fdce01feca01fec200feb502fdab00fca606fca31cfda12ffe9d41fd9a51ff985dfd9168fc9071fe8976fc827cfb7f86ff7e92fd7c9cfa7ba1ff72a9fd6aaffb5fb4fd51bbfd40c1fd2ecafd18cefe05d6fb00e0fb04e9ff02f5fd02fafb02fdf500fcef00fde701fde500fee000fdd900fdd100fdd000fdcdff01f7ff01fafc01fdf901fdf201ffef00fee700fee401ffdd00fed401fecb01fec202febd08fdb81dffb733ffb546ffb058feb267ffac75fda77effa687fda08ffe9a93fc989afe98a6fd96aeff8fb4fd89bcfe83c1fc77c5fd6acbff5ad0fe47d7fb31ddfc1ce4fd06ecfb02f6fd04fcfb03fdf302fdeb01fde501fddd02fdd901fdd400fdcf01fdcb01fcc601fdc2fe02eefe01f1fe00f6ff01f8fc01fcfa01fdf402feed00fee801fde201ffd801ffd003fcce1affcb30ffc848ffc55affc26dfebc7cfebc88ffba95ffbb9bfeb4a3fcada7feabadffacb8fda9c0fea5c4fc9cc9fb95cdfe8bd2fe7cd7fc6adefd5ce4fc44eaf930f0fd17fbfb06fcf804fdec02fde403fedd01fcd900fdd101fdcb02fdc801fdc302fdc001febe02fdb9fe01e6fd00e7ff01edfe02eefe01f3ff01f8fd01fbfa01fdf402ffee01ffe601fee10ffddd2cffda42fed659fdd46cfdd07efccf8effcc9bffcaa8ffc9aefdc7b4fdc0b9fdbebffebcc6feb9cdffb6d1fcaed7fca8dafe9be0fe8de2fd7ceafd69f1ff59f4fe42fcfa2afdf60dfdeb01fde000fdd702fdd301fdcb01fcc501fdc002fcbd02fdb800feb601fdb401fdb2fe00dcfe00dcff00e1fe00e4fd00e7fe00ecfe01effe00f4fe01f9fa00fbf405fcf01fffe93cfee851fee56affe17cfedd8ffcdd9dfddaacfed9b6ffd8befdd3c4fccfc9fecccdfdcbd2fecad9ffc4ddfdbee2fcb7e5feaaeaff9dedfd8df1fe7af9fb67fcfa50fdf238fce81efee106fdd701fdcb02fec502fdc200fdba02fdb701fdb401fdb101fead01feab02feaafe01d0fe00d1fe00d5fe01d8fe00dcff01defe01e6fe01e9fe01edfe01f0fd11f8fc30fbf94cfef561fef078feed8cffea9dfde8adfee7b9ffe3c4fee5cdffe2d4fdded8fddcdcfedce1ffd9e4fed4e7fecbebfec5edfeb8f2feadf6fd9bf9fb8bfef975fdf161fde848fcdf2efed50efcc901fdba02fdb600fdb401fdaf01ffa901ffa801ffa401fea102fea000fe9cfe01c8fe00c9fe00cbfe01cefc00cfff01d2fd00d7fe00dbfe00ddfe04e3ff1cedff3af4fc56f7fc6bfcf982fef695fdf5a8fff2b7ffefc3feedceffedd7ffebdfffe7e2ffe7e6ffe6e8ffe4ecffdeeefdd6f2fecff5ffc6f8ffb8fdfda5fdf792fdee81fce66bfcde53fed538fccc19fcba03fcb001feac01ffa700fea401fea003fe9e03ff9b03fe9801fe9502ff94fe01beff00befe00bffe00c2fe00c4fe01c6fe01c7ff00ccfc01ccfe0ad4fd25dffe44e7fe5feefe74f5fe8df9fd9ffcfab2fdf9c1fff6cdfef4d7fef3e0fdf3e9fdf1ebfef0eefdeff1feedf4ffe8f6ffe1f8fed9f9fdcdfbfac0fdf6acfeef9dfde88bfcde74fcd55efcc942fdbe24fdaf07fda201fe9c02fe9902fd9402fe9002fe9101fd8d02fe8d03fe8c04ff8cff00b3ff01b2ff00b4ff00b4ff00b6fe00b7ff00b7fe01bdfe00bdff0ec6fe2dd0fe4adafd65e3fd7be6ff93eeffa5f3feb8f7fec8fbfbd5fcfbdffefbe8fef9edfbf9f1fef7f5fff6f6fef5f8ffeefafce8fcfddffcf9d4fdf5c7fbeeb4ffe8a5fce190fdd679fcc963fbbf46fdb529fca30afd9201fd8c00fd8a01fc8701fd8500fc8200fc8300fd7f00fd7e01fe80ff00a6ff00a8fe00a9fd00a9ff00acfd00aafd00abfd00acfd00acff14b8fc33beff4fcdff6bd8fe80dbfe97e4ffaaeafebcf0fecbf6fcd9f7ffe4fcfdebfbfef2fefaf6fdfaf9fefaf9fdf9fcfdf3fcfbebfdfae3fef6d9fcf0cbfce9bafee3aafcda95fdcf80fdc267fdb64cfeab30fd970ffd8502fc7e02fd7a00fd7901fc7702fd7802fd7b01fd7701fd7301fd75ff009efe009efd00a0fc009cff01a0fe00a0fe009fff01a0fd069cff1ca3fe39b2ff55befe6ecbff86d5fd9cdbffaee2fec0e9fecceefedcf4fde5f7ffedf9fef4fbfef9fcfdfdfffefefef9fbfaf3fcf9edfcf7e5fcf1dbfcebcbfbe2bcffdbabfcd199fdc782fdb669fda94dfe9d30fc8910fd7701fd6c00fd6d01fd6b01fd6b01fd6b01fd6900fc6801fd6b01fd69fe0093fe0093fe0095fe0093fe0093fe0093fe0093fe038ffd0888fe2091ff3da4ff5ab4ff76c2ff89cdff9ed4ffafdcfec1e2fecee6fddbebfee5f1ffeef6fff4f9fefbfdfbfbfbfbfbfafbfdfaf5fdf8eefcf3e5fceadbfde5cdfbddbefed3abfcc89afdbc80feac6afd9e4efd8f33fd7c0ffd6802fd5e00fd5c01fd5d02fe5c02fe5e02fd6002fd5e02fd6002fd5eff0089ff0188fe0088fe0086ff0186ff0186fe0084fe037efc0b79fe1c81ff3997ff5baafd74bbff86c9fea0cdfeb1d5fec0dcfecde1fcd8e2fce1e8feecf1fcf3f5fff8f8fefbfafbfcf6fafcf7f4fcf4effbefe5fce7d9fcdecbfcd7bcffc9a9fcbd95fdb17efea266fb8f4cfd8131fe6e0dfc5802fd4f01fb5200fb5201fd5102fe5303fd5403fd5601fc5401fe55fe027dfe007cfe007cfe007aff017afe0177fe0176ff0771fe0c6bfe1b6aff3387ff529cff6fadfe85baff9cc2ffadcbfebdd1ffcbd8fcd5dafee0e2fde9eafff1f1fdf8f4fdfbf6fdfdf5f9fcf3f4fcf1ecfce8e2fcdfd6fbd5c7fdcbb8fec0a3fbaf91fea579fe9364fb8148fc6f28fe590afe4602fd4201fd3e00fc4100fd4200fd4201fc4402fd4601fd4701fd48fe0174fe0174fe0271fd016efe016efd006afd0166fe0761fd0a5cfd1658fe2771ff4885ff639bff7eacff97b8ffa7c1ffb8c9ffc6cffed0d5fdddd7fde6dffff0e9fdf5ebfffcf1fbfbeff9fcebf4fbe8ecfce1e2fddad3fdccc5fdbfb6feb39efca28afc9375fc825afc6d41fc5a22fe4607fe3402fe3002fd3201fd3502fe3702fe3901fd3901fd3e00fd3f00fd41fd016afc0068ff0068ff0164ff005efe005bfe0059fe0456fc084dfe1049ff2056ff3e6eff5989ff759bff8ea8ffa1b4feb2bcffc1c5fcccc8fdd9cdfee2d8feebe2fff3e6fef8e8fcfbe9f8fce5f2fbdeeafdd8e0fdcfd2fcc4c4fbb8b2fda89cfd9387fd846ffc7054fb5c39fd4316fd2e04fc2001fd1c01fe2100fe2401fe2a00fe2d01fe3001fe3302fd3601fd37ff005efe005bfd0059fe0056ff0054ff0050ff004eff0249fe0641fe0d38ff1739ff2e53fd496eff6786fe8397ff99a4ffaaaffebcb7fdc6bafcd4c2fedec9fee9d5fff0dafff8ddfdfbdcf7fbd8f2fdd4e8fdcde0fdc6d0fcb9c3fcadb1fe9c9bfd8885fd776afd604efc4733fd3010fd1804fd0d01fe0f00fe1300fd1702fe1c03ff2101fe2300fe2601fe2802fe2dfe0057ff0055fe0051ff004ffe0049fe0046ff0042fd003dfe0535fb0a2bfd1126fe2233ff3b4dff5869ff777ffe8e8cffa09bfdb2a5fdc2abfdceb2ffdbc1fde4c6fceccbfdf4ccfefbcef7fccaf1fccae7fcc0ddfbb7cffbacc0fba0afff8f98fd7a83fe6869fb504efc392bfc1e0efd0c07fe0704fe0701fd0900fd0f00fb1500fb1501fa1802fe1e01fc1f02fd23ff004cff0049ff0045ff0044ff003cff0039fe0036fe0131fd0127fc0320fa091afb171dfe2e32ff494cfe6964ff8277ff9785ffad90fdbb98fec9a7fed4b2fde0b9feeabefef3bffffabff8fcbaf1fcb9e4fcb1dafca6cbfc9ebcfd90adfd8196fc6a80fe5765fb414efd2b2bfd0d16fd050afc020afd0304fd0101fb0300fe0700fd0c01fe1002fe1300fe1401fe17ff0044fe0040ff003cff0039fe0034fd0030fe002bff0124fe001afe0118fd010efa070afa2119fd3e2dfc5c44fe765bfd8e6cfda37bfeb389ffc598fdd0a1fcdda6fde7abfff0aefff9adf8fdabf0fda4e5fd9dd8fb95cafc8abafd7faafd7095fe5b7dfd4665fd3149fd182ffe081dfd001afe0313fe030cfc0209ff0404fd0302fc0300fd0501fd0b02ff1002fd10fd003afd0035fd0031fe002dff002afe0025fd0020fe0018ff0010fb000afd0305fc0603fd1909fd351cfd5333fd6e47fc8458fd9b6bfeac76febe81fecb8bfed991fce495feec97fdf799fafd95effc91e3fb89d6fd80c6fd75b6fd6aa5fd5b90fc457bfd3360fc1848fd0838ff042cff0326fe031cfb0018ff0311fd030bfd0108fb0106fe0201fd0400fd0401fd07fe0033ff012dff0029fe0024ff011efe001afe0115fe000afe0105fd0304fe0702ff1003fd1c02fe310cff4b21fc6735fe7e45fe9655ffa660ffb76bffc677fed57cfee080fcea7ffef682f9fc82eefc79e2fc74d5fc6bc3fd62b4fd53a4fe468dfd2d75fc1a5ffd094bfd0341ff013afe0230fd0125fc0023fd011afe0117fc0112fd020afc0207fd0207fe0103ff02ff002afe0026ff0020fe001afd0014ff0011fe000afe0205fd0302fd0a02fe1301ff1c03ff2600fd3305fd4609ff5d1afc762cff8b3dff9e49fdaf54ffbe5cfece63fddc68fde768fef46afafa65eefd63e1fd5bd1fc52c1fd46b3fc3a9fff278afd1477fe0962fe0457fc004dfd0242fe013afd0132fd022cfd0125fc0121fc0119fd0217fc0111fd000bfd0107fc03fe0021ff011dfe0117fe0115fe000bfe0107fe0103fd0601fe0c00fe1400ff1c02ff2502ff3002ff3b02ff4603ff5705fc6c14fd8224ff972fffa939ffb843ffca49ffd850fee450fcf14ffbf94beefd49defc42cefc36c1fc2eaefc1c9ffe0e87fe0776fd0169fc0061fd0256fe014afa0145fd013efd0039fb0230fd0228fd0224fe021dfc0118fc0115fc0010fe01fe001afe0015ff000efc010bfc0106ff0404ff0702ff0d01ff1503fe1b02ff2403fd2b01ff3702ff4503fe4e03ff5d03fe6703ff7c0bff8f16fca11cffb527ffc52dfed232fde232fcee32fafa32edfd28dcfd21cdfc18bdfe0fadfb099ffc058bfd007ffc0075fc006cfd0262fd0155fd014dfc0145fc013ffd0038fc0232fd032bfd0325fd021ffd011bfe0115fd01', LW = 48, LH = 28;
  const lutRGB = (i, j) => { const o = (clamp(j, 0, LH - 1) * LW + clamp(i, 0, LW - 1)) * 6; return [0, 2, 4].map((k) => parseInt(LUT.substr(o + k, 2), 16)); };
  function pickRGB(fx, fy) {   // bilinear between table cells
    const x = fx * LW - 0.5, y = fy * LH - 0.5, i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j;
    const a = lutRGB(i, j), b = lutRGB(i + 1, j), c = lutRGB(i, j + 1), e = lutRGB(i + 1, j + 1);
    return a.map((_, k) => Math.round(a[k] * (1 - u) * (1 - v) + b[k] * u * (1 - v) + c[k] * (1 - u) * v + e[k] * u * v));
  }
  function nearestXY(hex) {    // where a preset colour sits in the picture (for the knob)
    const t = [1, 3, 5].map((k) => parseInt(hex.substr(k, 2), 16)); let best = 1e9, at = [0.5, 0.5];
    for (let j = 0; j < LH; j++) for (let i = 0; i < LW; i++) { const q = lutRGB(i, j), dd = (q[0] - t[0]) ** 2 + (q[1] - t[1]) ** 2 + (q[2] - t[2]) ** 2; if (dd < best) { best = dd; at = [(i + 0.5) / LW, (j + 0.5) / LH]; } }
    return at;
  }
  const hslHex = (h, sat) => { const l = 0.5, a = (sat / 100) * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return toHex([f(0), f(8), f(4)]); };
  const toHex = (rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('');
  function hexToHS(hex) {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.substr(k, 2), 16) / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
    let h = 0; if (dl) h = mx === r ? ((g - b) / dl) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
    const l = (mx + mn) / 2, sat = dl ? dl / (1 - Math.abs(2 * l - 1)) : 0;
    return { h: Math.round((h * 60 + 360) % 360), s: Math.round(sat * 100) };
  }
  /** Set a colour (hex) on a channel: knob position from the picture unless given */
  function setColour(c, hex, pos) { const hs = hexToHS(hex); const p = pos || nearestXY(hex); Object.assign(c, { mode: 'hs', rgb: hex, h: hs.h, s: hs.s, px: p[0], py: p[1] }); }
  const ICONS = ['dev-bulb', 'dev-lamp', 'dev-lamp-02', 'dev-wall-lamp', 'dev-study-lamp', 'dev-chandelier-01', 'dev-chandelier-02', 'dev-square-led', 'dev-round-led'];

  /* ---------- Model helpers ---------- */
  const clone = (x) => (typeof x === 'object' ? JSON.parse(JSON.stringify(x)) : x);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const has = (d, k) => d.features.includes(k);
  const multi = (d) => d.channels.length > 1;
  const get = (d, k, c = 0) => (F[k].perCh ? d.settings[k][c] : d.settings[k]);
  const set = (d, k, c, v) => { if (F[k].perCh) d.settings[k][c] = v; else d.settings[k] = v; };
  const presetOf = (d) => PRESETS.find((p) => p.id === d.preset) || PRESETS[0];
  const optsFor = (d, k) => { const lim = (presetOf(d).opts || {})[k]; return lim ? F[k].opts.filter((o) => lim.includes(o[0])) : F[k].opts; };
  const kRange = (d) => presetOf(d).kRange || [2000, 6500];
  const sel = (d) => clamp(d.sel || 0, 0, d.channels.length - 1);
  const canCtl = (d, i) => d.online && d.channels[i].pw !== false;
  const effects = (d) => (has(d, 'effect') ? (presetOf(d).eff && presetOf(d).eff.length ? presetOf(d).eff : HUEFX) : []);

  function applyDefaults(d) {
    // colours saved before the Figma picture (hue + saturation only) get a real colour and a knob position
    (d.channels || []).forEach((c) => { if (c.h != null && !c.rgb) setColour(c, hslHex(c.h, c.s ?? 80)); });
    for (const k in F) {
      const def = F[k].def; if (def === undefined) continue;
      if (F[k].perCh) { const arr = Array.isArray(d.settings[k]) ? d.settings[k] : []; d.settings[k] = d.channels.map((_, i) => (arr[i] !== undefined ? arr[i] : clone(def))); }
      else if (d.settings[k] === undefined) d.settings[k] = clone(def);
      // only options the device has
      const o = F[k].opts && optsFor(d, k); if (!o) continue;
      const fix = (v) => (typeof v === 'string' && !o.some((x) => x[0] === v) ? o[0][0] : v);
      if (F[k].perCh) d.settings[k] = d.settings[k].map((v) => (typeof v === 'object' && v && v.mode ? Object.assign(v, { mode: fix(v.mode) }) : fix(v)));
      else if (typeof d.settings[k] === 'object' && d.settings[k].mode) d.settings[k].mode = fix(d.settings[k].mode); else d.settings[k] = fix(d.settings[k]);
    }
    d.channels.forEach((c) => { if (c.br === undefined) Object.assign(c, { br: 80, mode: 'ct', k: 2700, h: 30, s: 100, timer: null, fx: null, pw: true }); });
    if (!ICONS.includes(d.icon)) d.icon = ICONS[0];
  }
  const newCh = (name) => ({ name, on: false, br: 80, mode: 'ct', k: 2700, h: 30, s: 100, timer: null, fx: null, pw: true });
  function setChannelCount(d, n) { while (d.channels.length < n) d.channels.push(newCh('Light ' + (d.channels.length + 1))); d.channels.length = n; d.sel = 0; applyDefaults(d); }

  function create(presetId, { name, roomId, channelNames } = {}) {
    const p = PRESETS.find((x) => x.id === presetId) || PRESETS[0];
    const names = channelNames && channelNames.length ? channelNames : p.names;
    const d = {
      id: Store.uid('d'), type: 'light', preset: p.id, name: name || p.names[0], roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0', kind: p.kind,
      serial: 'SN' + Math.random().toString().slice(2, 14) + 'LT', mac: Array.from({ length: 8 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':'),
      firmware: '1.2.4_0036', online: true, showOnHome: true, isNew: true, createdAt: Date.now(),
      features: p.feats.slice(), settings: {}, icon: p.kind === 'dimmer' ? 'dev-chandelier-01' : 'dev-bulb', sel: 0,
      channels: Array.from({ length: p.ch }, (_, i) => newCh(names[i] || 'Light ' + (i + 1))),
      energy: 3.27, temp: 41, outages: 0, blinkAt: 0,
    };
    applyDefaults(d);
    return d;
  }

  /* ---------- Colour ---------- */
  function k2rgb(k) {   // kelvin → sRGB (Tanner Helland approximation, same as the spec)
    const t = k / 100; let r, g, b;
    if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
    else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
    const c = (x) => Math.max(0, Math.min(255, Math.round(x))); return `rgb(${c(r)},${c(g)},${c(b)})`;
  }
  const lampColor = (c) => (c.mode === 'hs' ? `hsl(${c.h},${c.s}%,${100 - c.s * 0.45}%)` : k2rgb(c.k));
  const knobColor = (c) => c.rgb || lampColor(c);   // the colour-picture knob: the exact picked colour (Figma)
  // widget icons do NOT take the lamp colour: yellow when on, like the relay's light widgets (user, 2026-11-10)
  /** Brightness the bulb really gets (dimming range maps 1…100 onto min…max) */
  function effBr(d, i) { const c = d.channels[i]; if (!has(d, 'dimRange')) return c.br; const r = get(d, 'dimRange', i); return Math.round(r.min + ((r.max - r.min) * (c.br - 1)) / 99); }

  /* ---------- Behaviour ---------- */
  const label = (d, i) => (multi(d) ? d.channels[i].name : d.name);
  const why = (d, i) => (!d.online ? 'Light is offline' : d.channels[i].pw === false ? 'No power — the wall switch is off' : null);
  function setOn(d, i, on) {
    const w = why(d, i); if (w) return w;
    const c = d.channels[i]; c.on = on; c.timer = null; if (!on) c.fx = null;
    return `${label(d, i)} ${on ? 'on' : 'off'}`;
  }
  const toggle = (d, i) => setOn(d, i, !d.channels[i].on);
  function startTimer(d, i, sec) { const w = why(d, i); if (w) return w; const c = d.channels[i]; c.on = true; c.timer = { end: Date.now() + sec * 1000, total: sec }; return `${label(d, i)} turns off in ${UI.fmtDur(sec)}`; }
  function startFx(d, i, name) {
    const w = why(d, i); if (w) return w;
    const c = d.channels[i];
    if (c.fx && c.fx.name === name) { c.fx = null; return `${MOOD[name]} stopped`; }
    c.on = true; c.fx = { name, t0: Date.now(), from: { br: c.br, k: c.k, mode: c.mode } };
    if (name === 'sunrise') Object.assign(c, { br: 1, mode: 'ct', k: kRange(d)[0] });
    if (name === 'colorloop' && has(d, 'color')) { if (c.rgb) c.mode = 'hs'; else setColour(c, '#af52de'); }
    return `${MOOD[name]} started`;
  }
  /** Power returns (after a cut, or a bulb's normal wall switch is flipped back on) */
  function powerBack(d, i) {
    const c = d.channels[i], mode = has(d, 'powerOn') ? get(d, 'powerOn', i) : 'on';
    const on = mode === 'on' ? true : mode === 'off' ? false : mode === 'previous' ? !!c.before : !c.before;
    c.on = on; c.timer = null; c.fx = null;
    if (on && has(d, 'startup')) { const s = get(d, 'startup'); if (s.mode === 'custom') Object.assign(c, { mode: 'ct', k: s.k, br: s.br }); if (s.mode === 'initial') Object.assign(c, { mode: 'ct', k: 2700, br: 100 }); }
  }
  function powerCut(d) { d.channels.forEach((c) => { c.before = c.on; c.on = false; c.timer = null; c.fx = null; }); d.online = false; d.outages++; }
  function powerRestore(d) { d.online = true; d.channels.forEach((c, i) => { if (c.pw !== false) powerBack(d, i); }); }

  function tick(d) {
    let changed = false; const now = Date.now();
    d.channels.forEach((c) => {
      if (c.timer && c.timer.end <= now) { c.on = false; c.timer = null; c.fx = null; changed = true; }
      if (c.fx && (c.fx.name === 'sunrise' || c.fx.name === 'sunset')) {   // demo: 10 s instead of minutes
        const p = Math.min(1, (now - c.fx.t0) / 10000), [k0, k1] = kRange(d);
        if (c.fx.name === 'sunrise') Object.assign(c, { br: Math.max(1, Math.round(100 * p)), k: Math.round((k0 + (k1 - k0) * p) / 100) * 100 });
        else Object.assign(c, { br: Math.max(1, Math.round(c.fx.from.br * (1 - p))), k: Math.round((c.fx.from.k + (k0 - c.fx.from.k) * p) / 100) * 100 });
        if (p >= 1) { if (c.fx.name === 'sunset') c.on = false; c.fx = null; changed = true; }
      }
    });
    if (has(d, 'power')) d.energy += watts(d) / 3600 / 1000;
    return changed;
  }
  const watts = (d) => (!d.online ? 0 : d.channels.reduce((a, c, i) => a + (c.on && c.pw !== false ? ((d.kind === 'dimmer' ? 40 : 9) * effBr(d, i)) / 100 : 0), 0.3));

  /* ---------- Text ---------- */
  function chStatus(d, i) {
    const c = d.channels[i];
    if (!d.online) return 'Offline';
    if (c.pw === false) return 'No power';
    if (!c.on) return 'Off';
    if (c.timer) { const left = Math.max(0, Math.round((c.timer.end - Date.now()) / 1000)); return `Off in ${left >= 3600 ? `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m` : UI.fmtDur(left)}`; }
    if (c.fx) return MOOD[c.fx.name];
    return has(d, 'brightness') ? `On · ${c.br}%` : 'On';
  }
  function subLine(d, i) {
    const c = d.channels[i];
    if (!d.online || c.pw === false || !c.on) return '';
    if (c.timer) return `Timer · off in ${UI.fmtDur((c.timer.end - Date.now()) / 1000)}`;
    if (c.fx) return MOOD[c.fx.name] + ' · tap the effect again to stop';
    return '';
  }
  function valText(d, k, c = 0) {
    const f = F[k], v = get(d, k, c);
    if (f.type === 'choice') return (f.opts.find((o) => o[0] === v) || ['', ''])[1];
    if (f.type === 'toggle') return v ? 'On' : 'Off';
    if (f.type === 'startup') return v.mode === 'custom' ? `${has(d, 'colorTemp') ? v.k + ' K · ' : ''}${v.br}%` : (f.opts.find((o) => o[0] === v.mode) || ['', ''])[1];
    if (f.type === 'range') return `${v.min}–${v.max}%`;
    if (f.type === 'btnlight') return (f.opts.find((o) => o[0] === v.mode) || ['', ''])[1];
    return '';
  }

  /* ---------- Home tiles ---------- */
  function homeTiles(d) {
    return d.channels.map((c, i) => ({
      ch: i, name: multi(d) ? c.name : d.name, icon: d.icon, accent: 'var(--yellow)', on: canCtl(d, i) && c.on,
      status: chStatus(d, i), controllable: has(d, 'onoff'), offline: !d.online,
    }));
  }

  /* ==========================================================================
     Device page
     ========================================================================== */

  function page(d) {
    const i = sel(d), c = d.channels[i], ok = canCtl(d, i);
    let h = '';
    if (!d.online) h += `<div class="pad" data-key="ban-off" style="margin-top:8px"><div class="banner danger">${icon('bolt-crossed')}<div><b>Offline</b> · Will follow “After a power cut” when power returns.</div></div></div>`;
    else if (d.channels.some((x) => x.pw === false)) h += `<div class="pad" data-key="ban-pw" style="margin-top:8px"><div class="banner warn">${icon('bolt-crossed')}<div><b>No power</b> · The normal wall switch is off. Turn it on to use the ${d.kind === 'bulb' ? 'bulb' : 'light'}.</div></div></div>`;

    // 1. Control — same big toggle as the relay; multi-gang dimmers get a tile per gang
    if (!multi(d)) {
      const fx = c.fx ? ' fx-' + c.fx.name : '';
      h += `<div data-key="power" class="power-area">
        <button class="power-toggle lt-toggle${fx}" aria-pressed="${ok && c.on}" data-action="lt-toggle" data-ch="0" ${ok && has(d, 'onoff') ? '' : 'disabled'} aria-label="Power">
          <span class="label">${ok && c.on ? 'On' : 'Off'}</span><span class="knob"><img class="pwr" src="assets/icons/power.svg" width="36" height="36" alt=""></span></button>
        <div class="t-sm c-secondary power-sub" data-num data-live="sub">${subLine(d, 0)}</div></div>`;
    } else {
      const cols = d.channels.length === 3 ? 'cols-3' : '';
      h += `<div class="pad" data-key="ch-grid" style="padding-top:28px"><div class="channel-grid ${cols}">${d.channels.map((x, j) => `
        <button class="tile ${canCtl(d, j) && x.on ? 'on' : ''} ${!d.online ? 'offline' : ''}" data-action="lt-toggle" data-ch="${j}">
          <span class="tile-icon" style="${canCtl(d, j) && x.on ? 'color:var(--yellow)' : ''}">${icon(d.icon, 'icon', 'style="width:28px;height:28px"')}</span>
          <span class="tile-power">${icon('power', 'icon icon-sm')}</span>
          <span class="tile-name">${esc(x.name)}</span>
          <span class="tile-status" data-num data-live="st${j}">${chStatus(d, j)}</span>
        </button>`).join('')}</div></div>`;
    }

    // 2. Light controls (for the selected gang)
    const showCtl = has(d, 'brightness') || has(d, 'colorTemp') || has(d, 'color') || effects(d).length;
    if (multi(d) && showCtl) h += `<div class="pad" data-key="pick" style="margin-top:24px">${UI.segTabs(d.channels.map((x) => x.name), i, 'lt-sel')}</div>`;
    const offAll = !ok || !c.on, offColour = offAll && !(has(d, 'executeIfOff') && get(d, 'executeIfOff') && ok);
    if (has(d, 'brightness')) {
      h += `<div class="v2-head muted" data-key="br-head"><span>Brightness</span><span data-num data-live="br">${ok && c.on ? c.br + '%' : '–'}</span></div>
        <div class="pad" data-key="br"><div class="lt-bar ${ok && c.on ? '' : 'is-off'}" data-lt="br" role="slider" tabindex="0" aria-label="Brightness" aria-valuemin="1" aria-valuemax="100" aria-valuenow="${c.br}" ${ok ? '' : 'aria-disabled="true"'} style="--v:${c.br / 100}">
          ${icon('sun-low', 'icon lt-lo')}${icon('sun-high', 'icon lt-hi')}<i class="lt-fill"><i class="lt-in">${icon('sun-low', 'icon lt-lo')}${icon('sun-high', 'icon lt-hi')}</i></i></div></div>`;   // dark suns on the track, light suns inside the white fill
    }
    if (has(d, 'colorTemp')) {
      const [k0, k1] = kRange(d), v = (c.k - k0) / (k1 - k0);
      h += `<div class="v2-head muted" data-key="ct-head"><span>White tone</span><span data-num data-live="k">${c.k} K</span></div>
        <div class="pad" data-key="ct"><div class="lt-ct ${c.mode === 'hs' ? 'is-colour' : ''}" data-lt="ct" role="slider" tabindex="0" aria-label="White tone" aria-valuemin="${k0}" aria-valuemax="${k1}" aria-valuenow="${c.k}" ${offColour ? 'aria-disabled="true"' : ''}
          style="--v:${clamp(v, 0, 1)};--from:${k2rgb(k0)};--mid:${k2rgb((k0 + k1) / 2)};--to:${k2rgb(k1)}"><i class="lt-knob"></i></div></div>`;
    }
    if (has(d, 'color')) {
      h += `<div class="v2-head muted" data-key="co-head"><span>Colour</span><button class="lt-reset" data-action="lt-white" aria-label="Back to white" ${offColour ? 'disabled' : ''}>${icon('reset')}</button></div>
        <div class="pad lt-colour ${offColour ? 'is-disabled' : ''}" data-key="co">
          <div class="lt-dots">${SWATCH.map(([n, hex], j) => {
            const on = n === 'white' ? c.mode === 'ct' : c.mode === 'hs' && (c.rgb || '').toLowerCase() === hex;
            return `<button data-action="lt-swatch" data-n="${n}" aria-pressed="${on}" aria-label="${n}" style="background:${hex || '#fffdf5'}"></button>${j === 0 ? '<i class="lt-sep"></i>' : ''}`;
          }).join('')}</div>
          <div class="lt-field" data-lt="hs" role="slider" tabindex="0" aria-label="Colour" ${offColour ? 'aria-disabled="true"' : ''} style="--x:${c.px ?? 0.5};--y:${c.py ?? 0.5}">
            <i class="lt-glow" style="${PIC}"></i><i class="lt-pic" style="${PIC}"></i><i class="lt-ring ${c.mode === 'hs' ? '' : 'hidden'}" style="background:${knobColor(c)}"></i></div>
        </div>`;
    }
    if (offColour && (has(d, 'colorTemp') || has(d, 'color')) && ok) h += `<div class="list-footer" data-key="off-note" style="margin-top:6px">Turn the light on to change its colour.</div>`;
    const fx = effects(d);
    if (fx.length) {
      h += `<div class="v2-head muted" data-key="fx-head"><span>Effects</span></div>
        <div class="pad lt-chips" data-key="fx">${fx.map((n) => `<button class="cw-chip" data-action="lt-fx" data-n="${n}" aria-pressed="${!!(c.fx && c.fx.name === n)}" ${ok ? '' : 'disabled'}>${MOOD[n]}</button>`).join('')}</div>`;
    }

    // 3. Settings you open
    if (has(d, 'timer')) {
      const t = c.timer;
      h += `<div class="list" data-key="controls" style="margin-top:24px"><button class="cell has-icon" data-action="lt-timer"><span class="cell-icon">${icon('clock')}</span>
        <span class="cell-main cell-title">Timer</span><span class="cell-value" data-num data-live="timer">${t ? `Off in ${UI.fmtDur((t.end - Date.now()) / 1000)}` : ''}</span>${icon('chevron-right', 'chev')}</button></div>`;
    }
    // 4. Information
    if (has(d, 'power')) {
      const w = watts(d);
      h += `<div class="v2-head muted" data-key="pw-head"><span>Power & energy</span></div>
        <div class="pad info-grid" data-key="pw">
          <div class="info-card"><span>Power</span><b data-num="count" data-live="w">${w.toFixed(1)}W</b></div>
          <div class="info-card"><span>Voltage</span><b data-num="count">${d.online ? '230V' : '—'}</b></div>
          <div class="info-card"><span>Current</span><b data-num="count" data-live="amp">${(w / 229.6).toFixed(2)}A</b></div>
          <div class="info-card"><span>Energy (total)</span><b data-num="count" data-live="kwh">${d.energy.toFixed(2)}kWh</b></div>
          ${has(d, 'deviceTemp') ? `<div class="info-card wide"><span>Device temperature</span><b data-num="count">${d.online ? d.temp + '°C' : '—'}</b>${icon('sensor-temperature')}</div>` : ''}
        </div>`;
    } else if (has(d, 'deviceTemp')) h += `<div class="pad info-grid" data-key="tmp" style="margin-top:32px"><div class="info-card wide"><span>Device temperature</span><b data-num="count">${d.online ? d.temp + '°C' : '—'}</b>${icon('sensor-temperature')}</div></div>`;
    return h + '<div style="height:28px"></div>';
  }

  /** Per-second update without re-render: countdowns, sunrise / sunset, power numbers */
  function live(d, root) {
    const i = sel(d), c = d.channels[i];
    UI.setNum(root.querySelector('[data-live="sub"]'), subLine(d, 0));
    d.channels.forEach((_, j) => UI.setNum(root.querySelector(`[data-live="st${j}"]`), chStatus(d, j)));
    const t = root.querySelector('[data-live="timer"]'); if (t) UI.setNum(t, c.timer ? `Off in ${UI.fmtDur((c.timer.end - Date.now()) / 1000)}` : '');
    UI.setNum(root.querySelector('[data-live="w"]'), watts(d).toFixed(1) + 'W');
    UI.setNum(root.querySelector('[data-live="amp"]'), (watts(d) / 229.6).toFixed(2) + 'A');
    UI.setNum(root.querySelector('[data-live="kwh"]'), d.energy.toFixed(2) + 'kWh');
    if (c.fx && (c.fx.name === 'sunrise' || c.fx.name === 'sunset')) paint(d, root);
  }
  /** Paint the selected gang's sliders and numbers — used while dragging (no re-render) */
  function paint(d, root) {
    const i = sel(d), c = d.channels[i], [k0, k1] = kRange(d);
    const br = root.querySelector('[data-lt="br"]'); if (br) { br.style.setProperty('--v', c.br / 100); br.setAttribute('aria-valuenow', c.br); }
    UI.setNum(root.querySelector('[data-live="br"]'), canCtl(d, i) && c.on ? c.br + '%' : '–');
    const ct = root.querySelector('[data-lt="ct"]'); if (ct) { ct.style.setProperty('--v', clamp((c.k - k0) / (k1 - k0), 0, 1)); ct.classList.toggle('is-colour', c.mode === 'hs'); ct.setAttribute('aria-valuenow', c.k); }
    UI.setNum(root.querySelector('[data-live="k"]'), c.k + ' K');
    const f = root.querySelector('[data-lt="hs"]'); if (f) { f.style.setProperty('--x', c.px ?? 0.5); f.style.setProperty('--y', c.py ?? 0.5); const r = f.querySelector('.lt-ring'); r.classList.toggle('hidden', c.mode !== 'hs'); r.style.background = knobColor(c); }
  }

  function bindPage(d, ctx) {
    const commit = (msg) => { Store.save(); ctx.render(); if (msg) UI.toast(msg); };
    UI.on({
      'lt-toggle': ({ ch }) => { const w = why(d, +ch); toggle(d, +ch); commit(w); UI.pulse(UI.screen.querySelector(`[data-action="lt-toggle"][data-ch="${ch}"]`), 'just-toggled'); },
      'lt-sel': ({ ch }) => { d.sel = +ch; commit(); },
      'lt-white': () => { const c = d.channels[sel(d)]; c.mode = 'ct'; c.fx = c.fx && c.fx.name === 'colorloop' ? null : c.fx; commit(); },
      'lt-swatch': ({ n }) => {
        const c = d.channels[sel(d)], s = SWATCH.find((x) => x[0] === n);
        if (n === 'white') c.mode = 'ct'; else { setColour(c, s[1], s[2] || undefined); Object.assign(c, { h: s[3][0], s: s[3][1] }); }
        if (c.fx && c.fx.name === 'colorloop') c.fx = null;
        commit();
      },
      'lt-fx': ({ n }) => { const w = why(d, sel(d)); startFx(d, sel(d), n); commit(w); },   // the chip shows the state; toast only when it can't run
      'lt-timer': () => openTimer(d, ctx),
    });
    // sliders and the colour field: follow the finger 1:1, write numbers live, save on release
    if (bindPage.bound) return; bindPage.bound = true;
    UI.screen.addEventListener('pointerdown', (e) => {
      const el = e.target.closest('[data-lt]'); if (!el || el.getAttribute('aria-disabled') === 'true') return;
      e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.classList.add('dragging');
      const kind = el.dataset.lt, i = sel(d), c = d.channels[i], [k0, k1] = kRange(d);
      const apply = (ev) => {
        const r = el.getBoundingClientRect(), fx = clamp((ev.clientX - r.left) / r.width, 0, 1), fy = clamp((ev.clientY - r.top) / r.height, 0, 1);
        if (kind === 'br') { c.br = Math.max(1, Math.round(fx * 100)); if (!c.on) { c.on = true; c.timer = null; } if (c.fx && (c.fx.name === 'sunrise' || c.fx.name === 'sunset')) c.fx = null; }
        if (kind === 'ct') { c.k = Math.round((k0 + (k1 - k0) * fx) / 100) * 100; c.mode = 'ct'; }
        if (kind === 'hs') { setColour(c, toHex(pickRGB(fx, fy)), [fx, fy]); if (c.fx && c.fx.name === 'colorloop') c.fx = null; }
        paint(d, UI.screen);
      };
      apply(e);
      const move = (ev) => apply(ev);
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.classList.remove('dragging'); commit(); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
    UI.screen.addEventListener('keydown', (e) => {   // keyboard: arrows move the focused slider
      const el = e.target.closest && e.target.closest('[data-lt]'); if (!el || el.getAttribute('aria-disabled') === 'true') return;
      const dir = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!dir) return;
      e.preventDefault(); const c = d.channels[sel(d)], [k0, k1] = kRange(d);
      if (el.dataset.lt === 'br') { c.br = clamp(c.br + dir * 5, 1, 100); c.on = true; }
      if (el.dataset.lt === 'ct') { c.k = clamp(c.k + dir * 100, k0, k1); c.mode = 'ct'; }
      if (el.dataset.lt === 'hs') { const px = clamp((c.px ?? 0.5) + dir * 0.04, 0, 1), py = c.py ?? 0.3; setColour(c, toHex(pickRGB(px, py)), [px, py]); }
      paint(d, UI.screen); Store.save();
    });
  }
  function afterRender(d, root) { const tg = root.querySelector('.lt-toggle'); if (tg && d.blinkAt && Date.now() - d.blinkAt < 1500 && tg.dataset.blink !== String(d.blinkAt)) { tg.dataset.blink = d.blinkAt; UI.pulse(tg, 'blink'); } }

  /* ---------- Timer sheet: the shared one (UI.timerSheet — presets + Custom wheel) ---------- */
  function openTimer(d, ctx) {
    const i = sel(d);
    UI.timerSheet({
      sub: esc(F.timer.short),
      running: () => d.channels[i].timer,
      start: (sec) => { const m = startTimer(d, i, sec); Store.save(); ctx.render(); return m; },
      cancel: () => { d.channels[i].timer = null; Store.save(); ctx.render(); },
      lastCustom: () => d.tmCustom, saveCustom: (sec) => { d.tmCustom = sec; },
    });
  }

  /* ==========================================================================
     Settings
     ========================================================================== */
  function summary(d, k) {
    if (!F[k].perCh || !multi(d)) return { value: valText(d, k) };
    const vals = d.channels.map((_, i) => valText(d, k, i));
    if (vals.every((v) => v === vals[0])) return { value: vals[0] };
    const line = d.channels.map((c, i) => `${c.name}: ${vals[i]}`).join(' · ');
    return line.length <= 34 ? { sub: line } : {};
  }
  function settings(d) {
    let h = '';
    if (multi(d)) {
      h += `<div class="list-header">Lights</div><div class="list">${d.channels.map((c, i) => `<button class="cell has-icon ch-row" data-action="ls-rename" data-ch="${i}"><span class="cell-icon">${icon(d.icon)}</span>
        <span class="cell-main"><span class="cell-title" style="display:block">${esc(c.name)}</span><span class="cell-sub" style="display:block">Gang ${i + 1}</span></span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>`;
    }
    for (const [title, grps] of SETTINGS_CARDS) {
      const ks = grps.flatMap((g) => Object.keys(F).filter((k) => F[k].grp === g && has(d, k)));
      if (!ks.length) continue;
      h += `<div class="list-header">${title}</div><div class="list">${ks.map((k) => {
        const f = F[k];
        if (f.type === 'toggle') {
          const on = !!get(d, k);
          return `<button class="cell" data-action="ls-toggle" data-k="${k}" role="switch" aria-checked="${on}"><span class="cell-main"><span class="cell-title" style="display:block">${esc(f.name)}</span>${f.showSub ? `<span class="cell-sub" style="display:block">${esc(f.short)}</span>` : ''}</span><span class="switch" aria-hidden="true" aria-checked="${on}"></span></button>`;
        }
        const sm = summary(d, k);
        return `<button class="cell" data-action="ls-feature" data-k="${k}"><span class="cell-main"><span class="cell-title" style="display:block">${esc(f.name)}</span>${sm.sub ? `<span class="cell-sub" style="display:block">${esc(sm.sub)}</span>` : ''}</span>${sm.value ? `<span class="cell-value">${esc(sm.value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
      }).join('')}</div>`;
    }
    return h;
  }

  const stepper = (act, val, unit, extra = '') => `<div class="stepper"><button data-action="${act}" data-d="-1" ${extra} aria-label="Less">−</button><output data-num>${val} ${unit}</output><button data-action="${act}" data-d="1" ${extra} aria-label="More">+</button></div>`;
  const radio = (act, cur, opts) => opts.map((o) => `<button class="option" role="radio" aria-checked="${cur === o[0]}" data-action="${act}" data-v="${o[0]}"><span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('');

  function openFeature(d, k, ctx) {
    const f = F[k]; let c = 0;
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    const s = UI.sheet({
      title: f.name, sub: esc(f.short),
      tabs: f.perCh && multi(d) ? () => UI.segTabs(d.channels.map((x) => x.name), c, 'lf-ch') : null,
      render: () => {
        const v = get(d, k, c);
        if (f.type === 'choice') return `<div class="list">${radio('lf-opt', v, optsFor(d, k))}</div>`;
        if (f.type === 'range') {
          return UI.group('', `<div class="cell"><span class="cell-main cell-title">Lowest</span>${stepper('lf-rng', v.min, '%', 'data-x="min"')}</div><div class="cell"><span class="cell-main cell-title">Highest</span>${stepper('lf-rng', v.max, '%', 'data-x="max"')}</div>`)
            + '<div class="list-footer">The slider still goes from 1 to 100 %; it is spread over this range.</div>';
        }
        if (f.type === 'startup') {
          return `<div class="list">${radio('lf-st', v.mode, optsFor(d, k))}</div>` + UI.collapse(v.mode === 'custom', UI.group('Comes on with',
            (has(d, 'colorTemp') ? `<div class="cell"><span class="cell-main cell-title">White tone</span>${stepper('lf-stk', v.k, 'K')}</div>` : '')
            + `<div class="cell"><span class="cell-main cell-title">Brightness</span>${stepper('lf-stb', v.br, '%')}</div>`));
        }
        if (f.type === 'btnlight') {
          const extra = presetOf(d).btnExtra && v.mode !== 'off';
          return `<div class="list">${radio('lf-bl', v.mode, optsFor(d, k))}</div>` + UI.collapse(extra,
            UI.group('Colour', `<div class="swatches group-pad sw-card">${Object.keys(BTN_COLORS).map((n) => `<button class="swatch" style="background:${BTN_COLORS[n]}" aria-pressed="${v.color === n}" aria-label="${n}" data-action="lf-blc" data-n="${n}"></button>`).join('')}</div>`)
            + UI.group('', `<div class="cell slider-row"><div class="row"><span class="cell-title grow">Brightness</span><span class="slider-val" data-num id="blVal">${v.br}%</span></div><input type="range" class="range" min="5" max="100" step="5" value="${v.br}" style="--v:${v.br / 100}" id="blRange" aria-label="Button light brightness"></div>`));
        }
        return '';
      },
      onMount: (el) => { const r = el.querySelector('#blRange'); if (r) { r.oninput = () => { get(d, k).br = +r.value; UI.setNum(el.querySelector('#blVal'), r.value + '%'); Store.save(); }; r.onchange = () => ctx.render(); } },
    });
    UI.on({
      'lf-ch': ({ ch }) => { c = +ch; s.refresh(); },
      'lf-opt': ({ v }) => { set(d, k, c, v); commit(); },
      'lf-rng': ({ x, d: dir }) => { const v = get(d, k, c); v[x] = clamp(v[x] + 5 * dir, x === 'min' ? 1 : v.min + 10, x === 'min' ? v.max - 10 : 100); commit(); },
      'lf-st': ({ v }) => { get(d, k).mode = v; commit(); },
      'lf-stk': ({ d: dir }) => { const v = get(d, k), [k0, k1] = kRange(d); v.k = clamp(v.k + 100 * dir, k0, k1); commit(); },
      'lf-stb': ({ d: dir }) => { const v = get(d, k); v.br = clamp(v.br + 5 * dir, 5, 100); commit(); },
      'lf-bl': ({ v }) => { get(d, k).mode = v; commit(); },
      'lf-blc': ({ n }) => { get(d, k).color = n; commit(); },
    });
  }
  function openIconPicker(d, ctx) {
    UI.sheet({
      title: 'Select an icon', render: () => iconPickerHTML([['Lighting', ICONS]], d.icon, 'li-pick'),
      footer: ICON_DONE,
    });
    UI.on({ 'li-pick': ({ n }) => { d.icon = n; Store.save(); UI.closeSheet(); ctx.render(); } });
  }
  function bindSettings(d, ctx) {
    UI.on({
      'ls-feature': ({ k }) => openFeature(d, k, ctx),
      'ls-toggle': ({ k }) => { set(d, k, 0, !get(d, k)); Store.save(); ctx.render(); },
      'ls-rename': ({ ch }) => UI.prompt({ title: 'Rename light', label: 'Light name', value: d.channels[+ch].name, onOk: (v) => { d.channels[+ch].name = v; Store.save(); ctx.render(); UI.toast('Saved'); } }),
      'rs-icon': () => openIconPicker(d, ctx),
      'rs-identify': () => { if (!d.online) return UI.toast('Light is offline'); d.blinkAt = Date.now(); Store.save(); UI.toast('The light blinks — look around the room'); },
    });
  }
  function about(d) {
    const rows = [['Type', d.kind === 'bulb' ? 'Smart bulb' : 'Dimmer'], ['Lights', String(d.channels.length)]];
    if (has(d, 'colorTemp')) rows.push(['White tone range', `${kRange(d)[0]}–${kRange(d)[1]} K`]);
    if (has(d, 'deviceTemp')) rows.push(['Device temperature', d.online ? d.temp + ' °C' : '—']);
    if (has(d, 'outageCount')) rows.push(['Power cuts counted', String(d.outages)]);
    return rows;
  }

  /* ==========================================================================
     Prototype panel — the real world: power, the normal wall switch (bulbs), the dimmer's buttons
     ========================================================================== */
  function protoPanel(d) {
    const g = (grp) => Object.keys(F).filter((k) => F[k].grp === grp);
    const wall = d.kind === 'bulb'
      ? `<h3>Normal wall switch</h3><div class="pp-row">${d.channels.map((c, i) => `<button class="pp-btn" data-action="pp-wall" data-ch="${i}">${c.pw === false ? '🔌 Switch on' : '⭘ Switch off'}${multi(d) ? ' · ' + esc(c.name) : ''}</button>`).join('')}</div>`
      : d.channels.map((c, i) => `<div class="pp-group">Wall button · ${esc(c.name)}</div><div class="pp-row"><button class="pp-btn" data-action="pp-press" data-ch="${i}">press</button><button class="pp-btn" data-action="pp-hold" data-ch="${i}" data-dir="1">hold ▲</button><button class="pp-btn" data-action="pp-hold" data-ch="${i}" data-dir="-1">hold ▼</button></div>`).join('');
    return `<div class="pp-title">Light prototype</div>
      <p class="pp-note">Not part of the app. Change what this light supports and simulate the real world. Spec: <a href="../Device%20Interface%203/1.%20Light_Interface.html" target="_blank">Light_Interface</a></p>
      <h3>Real light</h3><select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
      <h3>Lights (gangs)</h3><div class="pp-seg">${CH_COUNTS.map((n) => `<button class="${n === d.channels.length ? 'on' : ''}" data-action="pp-ch" data-n="${n}">${n}</button>`).join('')}</div>
      <h3>Installed as</h3><div class="pp-seg"><button class="${d.kind === 'bulb' ? 'on' : ''}" data-action="pp-kind" data-k="bulb">Smart bulb</button><button class="${d.kind === 'dimmer' ? 'on' : ''}" data-action="pp-kind" data-k="dimmer">Dimmer</button></div>
      <h3>Simulate</h3><div class="pp-row"><button class="pp-btn" data-action="pp-power">${d.online ? '⚡ Power cut' : '🔌 Restore power'}</button></div>
      ${wall}
      <h3>Features this light has</h3>
      ${ALL_GROUPS.map((grp) => `<div class="pp-group">${grp}</div>${g(grp).map((k) => `<label class="pp-chk"><input type="checkbox" data-pp="feat" value="${k}" ${has(d, k) ? 'checked' : ''}> ${F[k].name}</label>`).join('')}`).join('')}
      <h3>Data</h3><button class="pp-btn" data-action="pp-reset">Reset all prototype data</button>`;
  }
  function bindProto(d, ctx) {
    const panel = document.getElementById('protoPanel'); if (!panel) return;
    const commit = (msg) => { Store.save(); ctx.render(); if (msg) UI.toast(msg); };
    panel.onchange = (e) => {
      const t = e.target;
      if (t.dataset.pp === 'preset') {
        const p = PRESETS.find((x) => x.id === t.value);
        Object.assign(d, { preset: p.id, model: p.model, manufacturer: p.manufacturer, originalName: p.name, features: p.feats.slice(), kind: p.kind, settings: {} });
        d.channels = []; setChannelCount(d, p.ch); d.channels.forEach((c, i) => { c.name = p.names[i]; });
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); applyDefaults(d); }
      commit();
    };
    UI.on({
      'pp-ch': ({ n }) => { setChannelCount(d, +n); commit(); },
      'pp-kind': ({ k }) => { d.kind = k; d.channels.forEach((c) => { c.pw = true; }); commit(); },
      'pp-power': () => { if (d.online) { powerCut(d); commit('Power cut — the light is offline'); } else { powerRestore(d); commit('Power restored — it follows “After a power cut”'); } },
      'pp-wall': ({ ch }) => {
        const c = d.channels[+ch];
        if (c.pw === false) { c.pw = true; powerBack(d, +ch); commit('Wall switch on — the bulb has power again'); } else { c.before = c.on; c.pw = false; c.on = false; c.timer = null; c.fx = null; commit('Wall switch off — the bulb has no power'); }
      },
      'pp-press': ({ ch }) => commit('Wall button → ' + toggle(d, +ch)),
      'pp-hold': ({ ch, dir }) => {
        const c = d.channels[+ch]; if (why(d, +ch)) return commit(why(d, +ch));
        c.on = true; c.br = clamp(c.br + 20 * dir, 1, 100); commit(`Hold → ${c.br}%`);
      },
      'pp-reset': () => { Store.reset(); location.href = 'index.html'; },
    });
  }

  return {
    label: 'Light', F, PRESETS, create, applyDefaults,
    icon: (d) => d.icon, avatarIcon: (d) => d.icon,
    describe: (p) => `${p.manufacturer} · ${p.kind === 'bulb' ? 'smart bulb' : p.ch + '-gang dimmer'}`,
    homeTiles, toggle: (d, i) => toggle(d, i), page, bindPage, live, afterRender, settings, bindSettings, about, tick,
    busy: (d) => d.channels.some((c) => c.timer || (c.fx && (c.fx.name === 'sunrise' || c.fx.name === 'sunset'))),
    protoPanel, bindProto,
    presetName: (id) => (PRESETS.find((p) => p.id === id) || {}).name,
    _k2rgb: k2rgb,
    /* Scenarios: what this light can be set to, and setting it in one go (on + brightness + colour) */
    sceneCaps: (d) => ({ br: has(d, 'brightness'), color: has(d, 'color'), ct: has(d, 'colorTemp'), k: kRange(d), fx: effects(d).map((n) => [n, MOOD[n] || n]) }),
    SWATCH: SWATCH.map(([n, hex]) => ({ n, hex: hex || '#fffdf5' })),
    /** o = { br, mode: 'hs'|'ct', col: '#rrggbb' or a swatch name, k, fx } — anything left out stays as it was */
    applyScene(d, i, o = {}) {
      const w = why(d, i); if (w) return w;
      const c = d.channels[i]; c.on = true; c.timer = null;
      if (!o.fx) c.fx = null;
      if (o.br && has(d, 'brightness')) c.br = clamp(Math.round(o.br), 1, 100);
      if (o.mode === 'ct' || o.col === 'white') { c.mode = 'ct'; if (o.k && has(d, 'colorTemp')) c.k = clamp(Math.round(o.k), ...kRange(d)); }
      else if (o.col && has(d, 'color')) {
        const s = SWATCH.find((x) => x[0] === o.col || (x[1] && x[1].toLowerCase() === String(o.col).toLowerCase()));
        if (s && s[1]) { setColour(c, s[1], s[2] || undefined); Object.assign(c, { h: s[3][0], s: s[3][1] }); }
        else if (/^#[0-9a-f]{6}$/i.test(o.col)) setColour(c, o.col);
      }
      if (o.fx && effects(d).includes(o.fx) && !(c.fx && c.fx.name === o.fx)) startFx(d, i, o.fx);
      return null;
    },
  };
})();
