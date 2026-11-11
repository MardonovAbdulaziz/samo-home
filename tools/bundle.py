#!/usr/bin/env python3
"""Bundle the whole Samo-home prototype into ONE self-contained HTML file.

- CSS, JS and image assets are inlined (assets → data: URIs).
- The 5 pages become routes inside the file: index.html#/device.html?id=…
  Navigation (links, UI.go, Back) switches the route and reloads the file,
  so every page runs exactly as in the multi-file version (state lives in localStorage).

Usage:  python3 tools/bundle.py                     → dist/samo-home.html
        python3 tools/bundle.py --edition curtain   → dist/samo-home-curtains.html (curtains only)
        python3 tools/bundle.py --edition relay     → dist/samo-home-relays.html (relays only)
        python3 tools/bundle.py --edition contact   → dist/samo-home-contact.html (door / window sensors only)
        python3 tools/bundle.py --edition light     → dist/samo-home-lights.html (lights only)
        python3 tools/bundle.py --edition climate   → dist/samo-home-climate.html (temperature & humidity sensors only)
        python3 tools/bundle.py --edition motion    → dist/samo-home-motion.html (motion sensors only)
        python3 tools/bundle.py --edition plug      → dist/samo-home-plugs.html (smart plugs and sockets only)
"""
import base64, json, mimetypes, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'dist' / 'samo-home.html'

# Editions: one device type only, for sending to a client. Own localStorage key and demo data.
EDITIONS = {
    'relay': {
        'out': 'samo-home-relays.html', 'title': 'Samo-home · Relays', 'types': ['relay'],
        'seed': r'''() => {
      const rooms = [{ id: 'r-living', name: 'Living Room' }, { id: 'r-kitchen', name: 'Kitchen' }, { id: 'r-bedroom', name: 'Bedroom' }];
      const R = Devices.relay;
      const devices = [
        { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-living', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: false },
        R.create('tuya2', { name: 'Living room lights', roomId: 'r-living', channelNames: ['Ceiling', 'Hall'] }),
        R.create('touch3', { name: 'Wall switch', roomId: 'r-living', channelNames: ['Light 1', 'Light 2', 'Light 3'] }),
        R.create('aqara', { name: 'Kitchen relay', roomId: 'r-kitchen', channelNames: ['Light', 'Boiler'] }),
        R.create('tuya1', { name: 'Bedroom light', roomId: 'r-bedroom' }),
        R.create('din', { name: 'Water heater', roomId: 'r-bedroom' }),
      ];
      devices.forEach((d) => { d.isNew = false; });
      return { home: { name: 'My Home' }, rooms, devices, notifications: 0 };
    }''',
    },
    'curtain': {
        'out': 'samo-home-curtains.html', 'title': 'Samo-home · Curtains', 'types': ['curtain'],
        'seed': r'''() => {
      const rooms = [{ id: 'r-living', name: 'Living Room' }, { id: 'r-bedroom', name: 'Bedroom' }, { id: 'r-kitchen', name: 'Kitchen' }];
      const C = Devices.curtain;
      const done = (d, q) => { d.curtains.forEach((m, i) => { m.calibrated = true; m.q = Array.isArray(q) ? q[i] : q; m.ctime = 8; }); d.isNew = false; return d; };
      const living = done(C.create('tuya', { name: 'Living room curtain', roomId: 'r-living' }), 40);
      const bedroom = C.create('aqc3', { name: 'Bedroom curtain', roomId: 'r-bedroom' });   // not set up yet → shows the setup flow
      bedroom.features = Object.keys(C.F).filter((k) => !['tilt', 'switchType', 'childLock', 'indicator', 'motorMode', 'step'].includes(k));
      C.applyDefaults(bedroom); bedroom.isNew = false;
      const blind = done(C.create('roller', { name: 'Kitchen blind', roomId: 'r-kitchen' }), 100);
      const dual = done(C.create('dual', { name: 'Bay windows', roomId: 'r-living', channelNames: ['Left window', 'Right window'] }), [0, 75]);
      const hub = { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-living', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: false };
      return { home: { name: 'My Home' }, rooms, devices: [hub, living, dual, bedroom, blind], notifications: 0 };
    }''',
    },
    'contact': {
        'out': 'samo-home-contact.html', 'title': 'Samo-home · Door & window sensors', 'types': ['contact'],
        'seed': r'''() => {
      const rooms = [{ id: 'r-living', name: 'Living Room' }, { id: 'r-kitchen', name: 'Kitchen' }, { id: 'r-bedroom', name: 'Bedroom' }];
      const C = Devices.contact;
      const front = C.create('aqara', { name: 'Front door', roomId: 'r-living' }); front.features.push('tamper');
      const balcony = C.create('bosch', { name: 'Balcony door', roomId: 'r-living' }); balcony.display = 'door'; balcony.icon = 'dev-window-2'; balcony.features.push('climate');
      const fridge = C.create('sonoff', { name: 'Fridge', roomId: 'r-kitchen' }); fridge.display = 'other'; fridge.icon = 'dev-fridge'; fridge.settings.openTooLong = { on: true, min: 2 };
      const win = C.create('handle', { name: 'Bedroom window', roomId: 'r-bedroom' });
      const devs = [front, balcony, fridge, win]; devs.forEach((d) => { C.applyDefaults(d); d.isNew = false; });
      const hub = { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-living', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: false };
      return { home: { name: 'My Home' }, rooms, devices: [hub, ...devs], notifications: 0 };
    }''',
    },
    'light': {
        'out': 'samo-home-lights.html', 'title': 'Samo-home · Lights', 'types': ['light'],
        'seed': r'''() => {
      const rooms = [{ id: 'r-living', name: 'Living Room' }, { id: 'r-bedroom', name: 'Bedroom' }, { id: 'r-hall', name: 'Hallway' }];
      const L = Devices.light;
      const hue = L.create('hue', { name: 'Living room lamp', roomId: 'r-living' }); hue.channels[0].on = true;
      const dim = L.create('moes3', { name: 'Ceiling', roomId: 'r-living' });
      const ikea = L.create('ikea', { name: 'Bedside lamp', roomId: 'r-bedroom' });
      const aqara = L.create('aqarat1', { name: 'Hallway', roomId: 'r-hall' });
      const devs = [hue, dim, ikea, aqara]; devs.forEach((d) => { d.isNew = false; });
      const hub = { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-living', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: false };
      return { home: { name: 'My Home' }, rooms, devices: [hub, ...devs], notifications: 0 };
    }''',
    },
    'climate': {
        'out': 'samo-home-climate.html', 'title': 'Samo-home · Temperature sensors', 'types': ['climate'],
        'seed': r'''() => {
      const rooms = [{ id: 'r-bedroom', name: 'Bedroom' }, { id: 'r-bath', name: 'Bathroom' }, { id: 'r-kitchen', name: 'Kitchen' }, { id: 'r-nursery', name: 'Nursery' }];
      const C = Devices.climate;
      const bed = C.create('sonoffd', { name: 'Bedroom climate', roomId: 'r-bedroom' });
      const bath = C.create('tuyaal', { name: 'Bathroom', roomId: 'r-bath' }); Object.assign(bath.room, { t: 24.6, h: 62 }); Object.assign(bath.st, { t: 24.6, h: 62 });
      const fridge = C.create('probe', { name: 'Kitchen & fridge', roomId: 'r-kitchen' });
      const nursery = C.create('aqara', { name: 'Nursery', roomId: 'r-nursery' }); nursery.settings.alerts = { on: true, tlow: 20, thigh: 24, hlow: 35, hhigh: 65 };
      const devs = [bed, bath, fridge, nursery]; devs.forEach((d) => { C.applyDefaults(d); d.isNew = false; });
      const hub = { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-bedroom', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: false };
      return { home: { name: 'My Home' }, rooms, devices: [hub, ...devs], notifications: 0 };
    }''',
    },
    'motion': {
        'out': 'samo-home-motion.html', 'title': 'Samo-home · Motion sensors', 'types': ['motion', 'light'],
        'seed': r'''() => {
      const rooms = [{ id: 'r-hall', name: 'Hallway' }, { id: 'r-living', name: 'Living Room' }, { id: 'r-bedroom', name: 'Bedroom' }];
      const M = Devices.motion, L = Devices.light;
      const hallLight = L.create('aqarat1', { name: 'Hall light', roomId: 'r-hall' });
      const hall = M.create('hue', { name: 'Hallway motion', roomId: 'r-hall' }); hall.settings.motionLight.target = { id: hallLight.id, ch: 0 };
      const living = M.create('p1', { name: 'Living room motion', roomId: 'r-living' }); living.settings.motionLight.on = false;
      const bed = M.create('sonoff', { name: 'Bedroom motion', roomId: 'r-bedroom' }); bed.settings.motionLight.on = false;
      const garage = M.create('tuyab', { name: 'Back door', roomId: 'r-hall' });
      const devs = [hall, hallLight, living, bed, garage]; devs.forEach((d) => { d.isNew = false; });
      const hub = { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-hall', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: false };
      return { home: { name: 'My Home' }, rooms, devices: [hub, ...devs], notifications: 0 };
    }''',
    },
    'plug': {
        'out': 'samo-home-plugs.html', 'title': 'Samo-home · Smart plugs', 'types': ['plug'],
        'seed': r'''() => {
      const rooms = [{ id: 'r-kitchen', name: 'Kitchen' }, { id: 'r-living', name: 'Living Room' }, { id: 'r-bedroom', name: 'Bedroom' }];
      const P = Devices.plug;
      const washer = P.create('third', { name: 'Washing machine', roomId: 'r-kitchen' }); washer.channels[0].display = 'switch'; washer.channels[0].icon = 'dev-washing';
      const kettle = P.create('double', { name: 'Kitchen socket', roomId: 'r-kitchen', channelNames: ['Kettle', 'Toaster'] });
      const tv = P.create('tuya', { name: 'TV', roomId: 'r-living' });
      const strip = P.create('strip', { name: 'Desk strip', roomId: 'r-living' });
      const heater = P.create('sonoff', { name: 'Heater', roomId: 'r-bedroom' }); heater.channels[0].display = 'heater';
      const phone = P.create('aqara', { name: 'Phone charger', roomId: 'r-bedroom' });
      const devs = [washer, kettle, tv, strip, heater, phone]; devs.forEach((d) => { d.isNew = false; });
      const hub = { id: 'd-hub', type: 'hub', name: 'T-HUB 320', roomId: 'r-kitchen', model: 'T-HUB 320', manufacturer: 'Uztelecom', protocol: 'Ethernet (LAN)', online: true, showOnHome: false };
      return { home: { name: 'My Home' }, rooms, devices: [hub, ...devs], notifications: 0 };
    }''',
    },
}
PAGES = {  # route → page script
    'index.html': 'js/pages/home.js',
    'device.html': 'js/pages/device.js',
    'device-settings.html': 'js/pages/device-settings.js',
    'about-device.html': 'js/pages/about-device.js',
    'add-device.html': 'js/pages/add-device.js',
}
CORE = ['js/icons.js', 'js/ui.js', 'js/devices/registry.js', 'js/devices/relay.js', 'js/devices/plug.js', 'js/devices/curtain.js', 'js/devices/contact.js', 'js/devices/light.js', 'js/devices/climate.js', 'js/devices/motion.js', 'js/store.js']
CSS = ['css/tokens.css', 'css/components.css']


def data_uri(rel):
    p = ROOT / rel
    mime = mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    if mime == 'image/svg+xml':
        return 'data:image/svg+xml;base64,' + base64.b64encode(p.read_bytes()).decode()
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()


def inline_assets(text):
    return re.sub(r'assets/[\w\-/]+\.(?:svg|png|jpg|jpeg|webp)', lambda m: data_uri(m.group(0)), text)


def js(rel):
    src = (ROOT / rel).read_text(encoding='utf-8')
    src = inline_assets(src)
    if rel == 'js/ui.js':
        # routing: query string comes from the hash route; go() switches route
        src = src.replace("const param = (k) => new URLSearchParams(location.search).get(k);",
                          "const param = (k) => new URLSearchParams(window.__ROUTE.search).get(k);", 1)
        src = src.replace("const go = (url) => { location.href = url; };",
                          "const go = (url) => { window.__go(url); };", 1)
        assert '__ROUTE' in src and '__go' in src, 'ui.js routing patch failed'
    if rel in ('js/devices/relay.js', 'js/devices/plug.js', 'js/devices/curtain.js'):
        src = src.replace("location.href = 'index.html';", "window.__go('index.html');")
    return src.replace('</script', '<\\/script')


ROUTER = r"""
/* ---- single-file router: #/page.html?query ---- */
(() => {
  const PAGES = %s;
  // the route lives in the hash (#/device.html?id=…) and, as a backup, in window.name: hosts that run the
  // page in a sandboxed frame may drop a #/path hash on reload, window.name survives it
  const bag = () => { try { const o = JSON.parse(window.name || '{}'); if (o && o.samo) return o; } catch (e) {} return { samo: 1, local: {}, session: {} }; };
  const parse = () => {
    let h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    if (!/\.html/.test(h)) h = bag().route || '';
    const [file, search = ''] = h.split('?');
    const page = PAGES.includes(file) ? file : 'index.html';
    return { page, search: search ? '?' + search : '' };
  };
  window.__ROUTE = parse();
  window.__go = (url) => {
    const route = String(url).replace(/^\.?\//, ''), target = '#/' + route;
    const b = bag(); b.route = route; try { window.name = JSON.stringify(b); } catch (e) {}
    let hashed = false;
    try { if (location.hash !== target) { location.hash = target; hashed = location.hash === target; } } catch (e) {}
    if (!hashed) location.reload();   // hash set → the hashchange listener reloads
  };
  window.addEventListener('hashchange', () => location.reload());
  // relative links to other pages → routes (capture phase, before the app's handlers)
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href]');
    if (!a || a.target === '_blank') return;
    const href = a.getAttribute('href');
    const m = /^(?:\.\/)?([\w-]+\.html)(\?.*)?$/.exec(href || '');
    if (!m || !PAGES.includes(m[1])) return;
    e.preventDefault();
    window.__go(m[1] + (m[2] || ''));
  }, true);
})();
"""


def build(edition=None):
    E = EDITIONS[edition] if edition else None
    out = (ROOT / 'dist' / E['out']) if E else OUT
    title = E['title'] if E else 'Samo-home · Prototype'
    pre = (f"window.SAMO_EDITION = {{ id: {json.dumps(edition)}, types: {json.dumps(E['types'])}, seed: {E['seed']} }};") if E else ''
    css = '\n'.join(inline_assets((ROOT / c).read_text(encoding='utf-8')) for c in CSS)
    core = '\n;\n'.join(f'/* ===== {r} ===== */\n' + js(r) for r in CORE)
    pages = ',\n'.join(f'{json.dumps(k)}: function () {{\n{js(v)}\n}}' for k, v in PAGES.items())
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
{css}
</style>
</head>
<body>
<noscript>This prototype needs JavaScript.</noscript>
<script>
{ROUTER % json.dumps(list(PAGES))}
</script>
<script>
{pre}
{core}
</script>
<script>
(() => {{
  const PAGE_SCRIPTS = {{
{pages}
  }};
  PAGE_SCRIPTS[window.__ROUTE.page]();
}})();
</script>
</body>
</html>
"""
    out.parent.mkdir(exist_ok=True)
    out.write_text(html, encoding='utf-8')
    left = re.findall(r'(?<![\w/])assets/[\w\-/]+\.\w+', html)
    print(f'{out}  {out.stat().st_size / 1024:.0f} KB  (unresolved asset refs: {len(left)})')


if __name__ == '__main__':
    import sys
    args = sys.argv[1:]
    if '--edition' in args:
        build(args[args.index('--edition') + 1])
    else:
        build()
