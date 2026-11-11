# Regression checks (run after every change)

Headless Chrome checks for things that break silently: rolling / counting numbers everywhere,
page sections not being rebuilt when a banner appears, counts never going backwards.

    npm i puppeteer-core            # once, anywhere; or set PUPPETEER=/path/to/node_modules/puppeteer-core
    node tools/checks/audit-numbers.js
    node tools/checks/count-direction.js
    node tools/checks/cloth-release.js     # curtain cloth: no pendulum bounce after letting go
    node tools/checks/cloth-smooth.js      # curtain cloth: smooth motion while dragging and after release
    node tools/checks/cloth-sync.js        # curtain opening from the middle: both halves mirror each other
    node tools/checks/cloth-still-and-lag.js  # cloth is still at rest; the rod end trails the hand while dragging
    node tools/checks/cloth-seam-grab.js   # closed curtain grabbed at the middle seam opens toward the pull, halves never cross
    node tools/checks/roll-looks-same.js   # every [data-num]: rolling digit = same size/weight/colour as its number
    node tools/checks/settings-inline-and-favourite.js  # switch-only settings flip in the row (no sheet); motor direction sheet; curtain Position chips 25/50/75 (no favourite)
    node tools/checks/light.js             # light: toggle, brightness drag (turns on, number rolls), white tone, colour, mood effects, power cut, wall switch, dimmer gangs, settings
    node tools/checks/climate.js           # temperature & humidity sensor: reported vs real (step / interval), correction, sensor alarm vs push limits, relay control, settings per sensor, history, offline
    node tools/checks/motion.js            # motion sensor: motion / no motion, lights on motion (dark only), rest time, cat vs sensitivity, sitting still, push only when away, detection off, tamper, per-sensor settings, history
    node tools/checks/plug.js              # smart plug: appliance watts + power alerts, flip timer, metering only, overload / voltage trip + turn back on, too hot, auto-on inching, finished-charging auto-off, strips, history + reset
    node tools/checks/leak.js              # water leak sensor: dry / leak (red, push, picture), wipe dry, water-disappears mode, test mode, frost, moved, offline, settings per sensor, history; relay " r" / plug " s" names
    node tools/checks/smoke.js             # smoke detector: clear / pre-alarm / smoke (push, Silence + Call 101, scenario, interconnect), silence & ring again, thick smoke, test, cooking pause, sensitivity, no-level / CO presets, banners, history
    node tools/checks/spacing.js           # every page and every sheet (all features, switches on): neighbouring blocks never touch (gap ≥ 16 px)
    node tools/checks/timer.js             # shared timer sheet on the relay: 5 presets + Custom wheel (mouse drag, flick, Start lock, remembered), channel tabs, ring + row countdown
    node tools/checks/curtain-perf.js      # curtain loop sleeps at rest, wakes on a command; lite mode drops blur/textures
    node tools/checks/contact-window-motion.js  # window open ↔ tilt ↔ closed: no frame-to-frame jump
    node tools/checks/contact-sensor.js    # door / window sensor: report delay, notifications (Away), left-open alert, tamper, offline, counter, settings, history
    node tools/checks/live-numbers-roll.js # fast-changing numbers (curtain %, slider value) roll, are never rebuilt, end exact

Every line must say PASS. They use the system Google Chrome and the local files (no server).

## Safari (WebKit)

    npm i playwright && npx playwright install webkit
    python3 tools/bundle.py --edition relay && node tools/checks/safari-compare.js

Opens the relay build in WebKit (Safari's engine) and Chrome, prints tab widths + errors for both and saves
screenshots (home, device, tab animation, sheet) to the temp folder as samo-wk-*.png / samo-cr-*.png.
Known Safari traps already handled: large `filter: blur()` is not painted (ambient light uses gradients),
`flex-basis` is ignored when sizing a `<button>` (give real widths).

## Run the same checks in Safari's engine

    npm i playwright && npx playwright install webkit
    PUPPETEER=$PWD/tools/checks/webkit-shim.js NODE_PATH=<dir with node_modules> node tools/checks/audit-numbers.js

`webkit-shim.js` gives the puppeteer-style checks a Playwright WebKit browser, so audit-numbers,
count-direction and roll-looks-same run unchanged in Safari's engine.
