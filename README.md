# Samo-home — HTML prototype

Clickable smart-home prototype built from the Figma file **Samo-home / HUB Tidied**, with the
design system based on **Hamroh**. Main color: blue `#0A84FF`.

## Live

Open in a browser (best at phone width, or on a phone). Every viewer keeps their own state in their browser.

| What | Link |
|---|---|
| Whole app | https://mardonovabdulaziz.github.io/samo-home/ |
| Relays | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-relays.html |
| Curtains & rollers | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-curtains.html |
| Door / window sensors | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-contact.html |
| Lights | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-lights.html |
| Temperature & humidity sensors | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-climate.html |
| Motion sensors | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-motion.html |
| Smart plugs & sockets | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-plugs.html |
| Water leak sensors | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-leak.html |
| Smoke detectors | https://mardonovabdulaziz.github.io/samo-home/dist/samo-home-smoke.html |
| Light page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-light |
| Curtain page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-curtain |
| Contact sensor page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-contact |
| Temperature sensor page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-climate |
| Motion sensor page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-motion |
| Smart plug page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-plug |
| Leak sensor page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-leak |
| Smoke detector page directly | https://mardonovabdulaziz.github.io/samo-home/device.html?id=d-smoke |
| Design lab · sensor hero (10 variants) | https://mardonovabdulaziz.github.io/samo-home/design/sensor-hero.html |
| Design lab · contact “Other” open / closed (5 ideas) | https://mardonovabdulaziz.github.io/samo-home/design/other-open.html |
| Design lab · 10 pictures of “contact” | https://mardonovabdulaziz.github.io/samo-home/design/contact-ideas.html |
| Design lab · “Other” simple pictures (10 everyday things) | https://mardonovabdulaziz.github.io/samo-home/design/other-simple.html |
| Design lab · backgrounds (10 variants, live app) | https://mardonovabdulaziz.github.io/samo-home/design/backgrounds.html |

The site updates by itself 1–2 minutes after each push to `main` (GitHub Pages).

No build step. Open `index.html` in Chrome or Safari. Data is saved in `localStorage`.
On desktop, device pages show a **Relay prototype** panel next to the phone; it is for testing only and is not part of the app.

## Pages

| Page | File | Figma reference |
|---|---|---|
| Home | `index.html` | 3. Home Page / Home, +button |
| Add device (search → set up → done) | `add-device.html?via=zigbee\|wifi` | New add a device 23.10.2026, Search, Added, Search completed |
| Device view | `device.html?id=…` | 4. Devices / switch plug, light control |
| Device settings (rename, room, features, delete) | `device-settings.html?id=…` | Розетка, Rename, Delete confirm modal |
| About device | `about-device.html?id=…` | Об устройстве |
| Design system | `design-system.html` | Hamroh Colors + Typography, Samo-home components |

## Structure

```
css/tokens.css          design tokens (Hamroh base + Samo-home layer)
css/components.css      every UI component
js/icons.js             GENERATED from assets/icons/figma by tools/build-icons.py
js/ui.js                phone shell, toolbar, sheets, confirm, rename prompt, popover, toast
js/store.js             data (home, rooms, devices) in localStorage + seed data
js/devices/registry.js  device-type interface + hub / sensor placeholders
js/devices/relay.js     RELAY interface (features, presets, behaviour, page, settings, test panel)
js/devices/curtain.js   CURTAIN interface (motor model, live window picture, setup wizard, settings, test panel)
js/devices/contact.js   CONTACT SENSOR interface (door / window picture, notifications, history, test panel)
js/devices/light.js     LIGHT interface (glowing toggle, brightness / white tone / colour, mood effects, dimmer gangs, test panel)
js/pages/*.js           one script per page
assets/icons/           Figma assets: status bar, settings gear, big power icon
assets/icons/figma/     65 icons exported as SVG from Figma (Samo-home + Hamroh icon library) + Zigbee/Wi-Fi avatars
tools/build-icons.py    builds js/icons.js (recolors with currentColor, geometry untouched)
```

## Relay interface (step 1)

Built from `Device Interface 3/2. Relay_Interface.html`. The rule from the spec: **show a control only if the paired relay has that feature.**

- Device page: on/off (big toggle for 1 channel, tiles for 2–6 channels), all on/off, timer (5 presets + Custom hours / minutes wheel — shared with the light, UI.timerSheet), auto-off, power & energy, button presses
- Settings: after a power cut, delay after power returns, wall switch type, what the wall switch does, button response, child lock, output type, interlock, auto-off, status light, button backlight, light colours, lights off at night, bulb flicker fix, protection, find this device
- About: device temperature, power cuts counted
- Per-channel settings use channel chips at the top of the sheet
- **Group channels** (2+ channels, in Settings): the relay works and looks like one device. It has one home tile and one On/Off button for all channels, and per-channel settings apply to every channel. This is blocked while Interlock is on, because Interlock allows only one channel on at a time.
- Behaviour that is simulated: interlock, auto-off, a one-time timer, a power cut with recovery and start-up delay, decoupled wall switch, child lock, button response
- Presets: Tuya 1-ch, Tuya 2-ch, Aqara T2, Touch 3-gang, DIN breaker, All features

## Curtain interface (step 2)

Built from `Device Interface 3/10. Curtain_Interface.html`. Same rule: show a control only if the device has that feature.

- Device page: sheer white curtains hanging from a slim track on the dark page (SVG scene in `curtain.js`). The fabric is a **real cloth simulation** (Verlet): gliders on the rail (the leading one pulled by the motor or your finger; fabric between gliders bunches but never stretches, so a pull travels glider by glider like an accordion), and from each glider a chain of points with gravity, inertia and damping — the hem trails a fast pull, a wave runs down the cloth and it swings back to rest. Pleat shading comes from how compressed each pleat really is; pleats hang slightly uneven like real fabric. **Grab the fabric and pull** it left/right (roller: up/down): rubber resistance past the ends, a quick flick goes all the way, letting go sends the motor there (not calibrated yet: a pull opens / closes fully). Below: a big %, Open / Stop / Close, quick positions, small steps, slat angle, battery
- Setup wizard (sheet): opening style → direction test ("Did it open?" → No flips Motor direction) → calibration → 50 % test
- Calibration, four kinds: learns by itself (track motors), one-tap auto, travel time (wired modules), set end points (roller blinds)
- Settings: opening style (picture picker), favourite position (slider + "use current position"; also press and hold ☀ on the device page), motor direction, swap %, calibration, reset limits, speed, quiet, button behaviour, pull to start / stop, wall switch type, child lock, status light
- Dual module: one device with 2 curtains (picker on top of the page, a tile per curtain on home)
- Simulated in the test panel: wall switch ▲ ■ ▼, pull by hand, motor installed the other way round, obstacle on the track (blocked alert), power cut, low battery
- Presets: Tuya track motor, Aqara B1, Aqara C3, TS130F module, dual module, roller blind, All features

The Open / Close / Stop glyphs are simple line drawings (no matching icons in the Figma set yet). Replace them with Figma exports when they exist.

Settings that are only an on/off switch (child lock, interlock, quiet mode, pull to start…) are switched right in the settings row, without a sheet.

## Contact sensor (step 3)

Built from `Device Interface 3/3. Contact_Sensor_Interface.html`, in the look of the Figma page **Relay — Device Interface** (6014:56). Same rule: show a value or setting only if the sensor has it.

- Device page: a minimal live picture (door, window or the bare sensor — see Display As). On every report the sensor LED blinks and a signal ring goes out; tamper pops the cover off. Home tile switches to the open-door glyph while a door is open (like Apple Home / Home Assistant).
- **Display As** (Settings, under Room): Door, Window or Other. The pictures are minimal on purpose — frame, the part that moves, the sensor and its magnet; graphite, cool greys and the app blue only (no rooms, skies, light effects or warm colours). Window: the sash opens or tilts and its handle shows the mode. Other: just the sensor and its magnet. The avatar pen offers the icons of that kind (Door: door, entrance, balcony, garage, gate, barrier · Window: window, double · Other: fridge, cabinet, box, safe, key box, tools)
- Pulse-counter mode (POK003 / POK010): the page becomes a counting number of pulses and m³
- Settings: **Sensor** (report delay, airing break, knock detection, magnet distance, window type, operating mode) and **Notifications** (when it opens / closes / only when nobody is home / when the cover is removed — switched right in the row — and “Left open too long” with a time). Event History opens a 24-hour strip (orange = open) and the event list. The avatar pen picks an icon with a name (door, entrance, window, balcony, garage, gate, fridge, cabinet, box, safe, tools, key box); a window or balcony icon shows the window picture
- Simulated in the panel: open / tilt / close the real door (with a report delay the app keeps saying Closed until the sensor reports), press the sensor button (airing break), remove the cover, knock on the glass, battery low, stops reporting, home Away mode, and “1 s = 1 min” so the left-open alert can be tested
- Push messages slide in at the top of the phone (`UI.push`) and count on the home bell. The home “Front door” chip shows the first door sensor, live
- Presets: Aqara, SONOFF SNZB-04P, Tuya TS0203, Third Reality (report delay), Bosch II plus (knock + airing break), window handle sensor (tilted), All features
- Icons not in Figma yet (so not offered): drawer, wardrobe, freezer, medicine box, mailbox

Contact sensor “Other” (fridge, cabinet, safe, box…) is a simple cabinet: a white body and one door hinged on the left that swings out from right to left, with the blue lit inside of the door / window pictures; the sensor sits on the frame at the free edge and its magnet on the door, like on the door and window (design lab: `design/other-simple.html`, option 2).

Home page (Figma 6165:77673): device cards, the quick chips, the tab bar and the Edit pill are flat — no inner shadow. The inner highlight stays on device-page controls where Figma has it (the big switch, glass buttons).

## Light (step 4)

Built from `Device Interface 3/1. Light_Interface.html`; the Figma light sketches (6560:50289, older style) redone in the current Samo-home style. Same rule: show a control only if the light has that feature.

- Device page: the relay's big toggle (no glow), or a tile per gang for 2–4-gang dimmers with a gang picker. Brightness: a 50 px pill that fills white from the left (moving it on an off light turns it on, as the spec says). White tone: warm → cold track over the bulb's own kelvin range. Colour (Figma 6560:49941): a column of white + four colour dots and the Figma colour picture — the knob takes the colour under the finger; reset icon = back to white. Widget icons stay yellow when on (like relay lights), they don't take the lamp colour. Effects: mood effects only (Candle, Fireplace, Colour loop, Sunrise, Sunset; tap again to stop) — the signal effects (blink, okay…) are not a menu, "Find this device" uses them. Timer row, Power & energy cards, device temperature
- Colour can't be changed while the light is off unless the bulb has "Change while off" switched on
- Settings: Lights (rename gangs), Power cut (After a power cut, Colour after a power cut), Dimming (Fade time, Change while off, Dimming range, Bulb type), Wall switch type, Button light (mode; colour + brightness on 3-gang switches). Only the options the real device reports are offered
- Simulated: power cut / restore, a bulb's normal wall switch off / on ("No power"), a dimmer's wall buttons (press, hold ▲ / ▼), Sunrise / Sunset run in 10 s
- Presets: IKEA white spectrum, Philips Hue colour, Tuya RGB+CCT, Aqara T1, Tuya 2-gang dimmer, Moes 3-gang, Tuya 2-channel module, All features
- Check: `tools/checks/light.js` · edition: `python3 tools/bundle.py --edition light` → `dist/samo-home-lights.html`

## Temperature & humidity sensor (step 5)

Built from `Device Interface 3/4. Temp_Humidity_Sensor_Interface.html` (232 sensors in zigbee2mqtt). Same rule: show a value or setting only if the sensor has it. Type `climate` (`js/devices/climate.js`).

- Device page: the last REPORTED temperature and humidity, big, with "Reported 2 min ago" (battery sensors report only real changes, so the app can lag the room). Cards only for what the sensor has: pressure with its trend, dew point + VPD, an external probe with its own name ("Fridge probe"), the built-in bound relay, battery. A banner while the sensor's own limit alarm is on. No comfort word — the smiley lives on the sensor's screen only (the sensor doesn't report it)
- Settings: Sensor (Correction, How often it reports, Built-in limit alarm, Switch a heater directly, Probe name), Screen (°C / °F + screen on, Smiley range), Notifications (Too hot / cold / humid — our server, one push per crossing). "From" limits can't pass "to" limits
- Event History (Log): the 24-hour chart for temperature / humidity / pressure, today's warmest / coldest with times, alarms and alerts — built by our server from the reports
- Home: tile "23.4 °C · 46 %" (red when the sensor is in alarm); the "Temperature" chip shows the first sensor live
- Simulated (prototype panel): heater, air conditioner, hot shower, window open in winter; the room drifts, the sensor measures every N s and reports changes ≥ the step (or every 10 min); press its button to report now; battery low; stops reporting
- Presets: Aqara (pressure), SONOFF SNZB-02D (screen) / 02P, Tuya TS0201, Tuya TH05Z (built-in alarms), Xiaomi LYWSD03MMC custom firmware, Excellux probe, EFEKTA DIY (relay control), All features
- Check: `tools/checks/climate.js` · edition: `python3 tools/bundle.py --edition climate` → `dist/samo-home-climate.html`

## Motion sensor (step 6)

Built from `Device Interface 3/6. Motion_Sensor_Interface.html` (181 PIR sensors in zigbee2mqtt). Type `motion` (`js/devices/motion.js`). Show only what the sensor has.

- Device page: "Fresnel dots" picture — a pearl PIR lens and its detection zones as dots on 9 rays × 6 rings; cool blue at rest, the dots turn a light peach from the lens outwards on motion and breathe once, ring by ring, on each report (no rings — Apple-like, light colours) (the LED blinks only if "Light on the sensor" is on). "Motion · Now · clears in 1:00" or "No motion · Last motion 13:00", times today. Cards: temperature + humidity, light level (SONOFF: only Dim / Bright, at the last motion), battery — the "Lights on motion" scenario is not on the device page (it comes with scenarios). Banners: cover opened, detection off, battery low, offline. Same picture card / readout as the contact sensor
- Settings: Detection (Motion detection on/off, No-motion time — Tuya offers only its steps, Rest time — fixed on the classic Aqara, Sensitivity), Sensor (Light on the sensor, Built-in light, Switches lights directly), Notifications (inline switches; "only when nobody is home" on by default — a hallway sees ~100 movements a day), Automation: Lights on motion (pick any light or light-relay in the home, darker than N lx, off after N min — runs in our app). Event History: today strip + list
- Behaviour: PIR sees movement only — sitting still clears to "no motion"; movement during the rest time is not reported; a cat is ignored unless sensitivity is High; daylight keeps the light off
- Prototype panel: walk in / sit still / leave / cat, day / night, Away, cover, battery, offline, demo ×10
- Check: `tools/checks/motion.js` · edition: `python3 tools/bundle.py --edition motion` → `dist/samo-home-motion.html`

## Smart plug (step 7)

Built from `Device Interface 3/5. Smart_Plug_Interface.html` (328 plugs, double sockets, strips). Type `plug` (`js/devices/plug.js`). A plug works like a relay, so relay.js is now `makeSwitch(K)` — the relay and the plug share it, each with its own catalogue (`RELAY_K`, `PLUG_K`); plug-only behaviour sits behind `has(d, …)`, so a relay never shows it.

- Device page: the relay's big switch (or a tile per socket + "Turn on all sockets"), Timer, Auto-off (inching), Power & energy (power / voltage / current / kWh, + frequency and power factor), "Something plugged in" (Aqara), plug temperature. Banners: offline, "Turned off for safety · reason" with "Turn back on", "Plug is 76 °C — too hot"
- Timer flips the state (spec): on → "Turn off in…", off → "Turn on in…"; the ring says "until on / until off"
- Settings: Power cut, Safety (Overload protection — only the limits the plug has: Aqara max power, SONOFF power / current / voltage; Turn off when finished — Aqara fixed 2 W / 20 min), Output (Auto-off with "turn off / turn on again" mode, Metering only), Button & lights (child lock, button reacts on, button controls, status light, brightness, night, network light, backlight), Notifications (safety, too hot, offline; Appliance started / finished), Energy (reset counter, with a confirm). Event History: kWh per day for 7 days + today, safety events
- Simulated (prototype panel): what is plugged in per socket (charger fading to 1 W, TV, kettle, heater, washing machine cycle, fridge compressor), power cut, voltage spike 262 V, the plug's button, 1 s = 1 min
- Presets: Tuya with metering, Aqara EU, SONOFF S60, Third Reality, double socket, 4 + USB strip, wall socket 2 + USB, All features
- Check: `tools/checks/plug.js` · edition: `python3 tools/bundle.py --edition plug` → `dist/samo-home-plugs.html`

## Water leak sensor (step 8)

Built from `Device Interface 3/8. Water_Leak_Sensor_Interface.html` (89 sensors). Type `leak` (`js/devices/leak.js`); it replaces the old placeholder "Water Leak Sensor" (`d-leak`, also in saved data).

- Device page: no illustration — one minimal mark (a water drop in a circle): by default a large drop icon in system colours (color/gray when dry, color/red with a soft ring on a leak); the prototype panel's "Look" also shows a blue icon and a grey disc. "Dry · Checked 3 min ago · Last leak Nov 5" or, in red, "Leak! · Since 9:52 · Kitchen" with a red banner (spec: the page turns red). Banners: offline (a silent leak sensor is the real risk — the home tile goes red too), test mode, moved / opened, frost below 3 °C, battery low. Cards: temperature, battery
- Settings: Sensor (Sound on leak — tone and volume, or on/off only on Third Reality; Alarm on water appears / disappears; Test mode), Notifications (everyone, critical, family or a neighbour with a key, frost, battery / moved), Automation: Close the water on a leak (a scenario with a valve device — none paired yet, so it says so). Event History: today strip (red = wet) + events
- Prototype names: relays end in " r", plugs in " s" (user, to tell them apart in the prototype; saved devices are renamed once)
- Check: `tools/checks/leak.js` · edition: `python3 tools/bundle.py --edition leak` → `dist/samo-home-leak.html`

## Smoke detector (step 9)

Built from `Device Interface 3/12. Smoke_Detector_Interface.html` (58 detectors). Type `smoke` (`js/devices/smoke.js`). Icon: Figma "Sensors/Smoke" (`dev-smoke`, Icons page 3895:50009); heat alarms use "Sensors/Flame" (`dev-flame`).

- Device page: the Figma sensor mark (6631:50419 "Sensors/Smoke": a 100 px fills/quaternary ring around an 80 px disc with the glyph cut out; the leak sensor uses 6631:50597 "Sensors/Drop") — label/secondary "Clear" (white word), color/orange "A little smoke" (pre-alarm), color/red "Smoke! / Heat! / CO!" with a soft ring, a red banner and, while it rings, two white Hamroh "Alternative" buttons: Silence (only if the detector can) + Call 101 in color/red with the phone icon (tel: link; 101 = fire service). Cards: smoke level bar with the pre-alarm / alarm marks, temperature, CO, battery; "Test the alarm" row (once a month → "Test OK — the app received the alarm"). Banners: offline, test OK, cooking pause, taken down, dusty chamber, battery low
- Behaviour: thresholds follow Sensitivity; Silence lasts 3 min and the siren rings again if the smoke keeps rising; very thick smoke refuses silence; cooking pause ignores smoke; a real alarm always pushes (critical), runs the safety scenario and sounds the other detectors (interconnect)
- Settings: Detector (Sensitivity, Cooking pause — start now, Siren & light, Heartbeat light), Notifications (owner always; critical, family, pre-alarm, service), Automation (When smoke is detected, Interconnected detectors). Event History: alarms, silence, tests, faults
- Check: `tools/checks/smoke.js` · edition: `python3 tools/bundle.py --edition smoke` → `dist/samo-home-smoke.html`

## Device icons & alert cards

- Every device icon comes from the Figma **Icons** page (5:60) — `assets/icons/figma/dev-*.svg` (Sensors/Smoke → `dev-smoke`, Sensors/Flame → `dev-flame`, Sensors/Drop → `dev-drop` …)
- **Change icon** works on every device: lights, relays / plugs and door sensors keep their own pickers; all other types use the shared picker (`openDeviceIconPicker` in `js/devices/registry.js`, saved as `d.userIcon`) — the choice shows in settings, on the home tile and in the leak / smoke page mark
- **Alert card** on home (Figma 5429:45566): a leak or smoke alarm turns the tile white (background/opposite bg) with a color/red icon and status (`alert: true` from `homeTiles`, `.tile.alert`)

## Performance on weak phones

Measured with Chrome at 6× CPU slowdown: no frame over 33 ms on home, relay, curtain (motor and drag) or the contact pictures.
- Contact pictures: CSS transitions on `transform` / `opacity` only (≈1 % main thread while a door opens).
- Curtain: the cloth loop sleeps 3 s after the last movement (was ~6.5 % CPU forever at rest, now <1 %), and switches to **lite** by itself when frames come late while it moves (median frame > 24 ms) — no cloth blur, soft shadows or fabric textures, same shape and physics (~half the GPU work). `?lite=1` forces it. Check: `tools/checks/curtain-perf.js`.
- CPU slowdown does not model a weak GPU: confirm on a real low-end Android (Chrome remote debugging → Performance).

## Figma style (page 6014:56) — rules used everywhere

- Alert banner: 24 px coloured icon + one 15 px line; the title is a phrase of the sentence (“Offline · Will follow …”), not a bold heading. Icons: `bolt-crossed`, `banner-error` (red triangle), `battery` (yellow)
- Icons in list rows and cards are label/secondary (white 64 %), not blue
- Information cards use fills/tertiary; a full-width card can carry a 24 px icon on the right (`.info-card.wide`: Device temperature, Battery)
- Section labels above cards (“Power & energy”, “Position”) are 15 px label/secondary at the 16 px screen edge
- Curtain Open / Stop / Close use the Figma icons `curtain-open`, `curtain-close`, `curtain-stop`, `chevron-m-left` (side curtains), `chevron-m-up/down` (roller)

## Adding the next device interface

1. Create `js/devices/<type>.js` that sets `Devices.<type> = { ... }`. Use the interface documented at the top of `registry.js`, and copy `relay.js` as a template.
2. Add `<script src="js/devices/<type>.js">` to each page, before `js/store.js`.
3. Add the type's presets to the discovery list in `js/pages/add-device.js`.
4. Reuse the feature types (`choice`, `toggle`, `number`, …) so the settings UI comes for free.

To reset the data, use the "Reset all prototype data" button in the test panel, or run `localStorage.clear()` in the browser console.

## Icons

All icons are exported from Figma as SVG, never redrawn. They come from the Samo-home screens and Icons page, and from the Hamroh icon library for the ones Samo-home lacks.
To add an icon: export it from Figma as SVG into `assets/icons/figma/<name>.svg`, run `python3 tools/build-icons.py`, then use `icon('<name>')`.
Icons take the CSS `color`, so the same icon can be white when off and yellow or blue when on.
