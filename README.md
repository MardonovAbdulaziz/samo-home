# Samo-home — HTML prototype

Clickable smart-home prototype built from the Figma file **Samo-home / HUB Tidied**, with the
design system based on **Hamroh**. Main color: blue `#0A84FF`.

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

## Light (step 4)

Built from `Device Interface 3/1. Light_Interface.html`; the Figma light sketches (6560:50289, older style) redone in the current Samo-home style. Same rule: show a control only if the light has that feature.

- Device page: the relay's big toggle (no glow), or a tile per gang for 2–4-gang dimmers with a gang picker. Brightness: a 50 px pill that fills white from the left (moving it on an off light turns it on, as the spec says). White tone: warm → cold track over the bulb's own kelvin range. Colour (Figma 6560:49941): a column of white + four colour dots and the Figma colour picture — the knob takes the colour under the finger; reset icon = back to white. Widget icons stay yellow when on (like relay lights), they don't take the lamp colour. Effects: mood effects only (Candle, Fireplace, Colour loop, Sunrise, Sunset; tap again to stop) — the signal effects (blink, okay…) are not a menu, "Find this device" uses them. Timer row, Power & energy cards, device temperature
- Colour can't be changed while the light is off unless the bulb has "Change while off" switched on
- Settings: Lights (rename gangs), Power cut (After a power cut, Colour after a power cut), Dimming (Fade time, Change while off, Dimming range, Bulb type), Wall switch type, Button light (mode; colour + brightness on 3-gang switches). Only the options the real device reports are offered
- Simulated: power cut / restore, a bulb's normal wall switch off / on ("No power"), a dimmer's wall buttons (press, hold ▲ / ▼), Sunrise / Sunset run in 10 s
- Presets: IKEA white spectrum, Philips Hue colour, Tuya RGB+CCT, Aqara T1, Tuya 2-gang dimmer, Moes 3-gang, Tuya 2-channel module, All features
- Check: `tools/checks/light.js` · edition: `python3 tools/bundle.py --edition light` → `dist/samo-home-lights.html`

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
