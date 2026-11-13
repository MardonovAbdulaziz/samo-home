/* Scenarios page — the second tab. Three things, in the order people use them:
   1. Tap to run — big tiles, one tap runs the scene (like a device tile).
   2. Automatic — cards that say in one sentence what happens, with a switch and what happened last time.
   3. Ideas — ready-made scenarios already filled in with this home's devices.
   Then "Built into your devices": automations that live in a device's own settings, so nothing is hidden. */
(() => {
  UI.mount({ variant: 'ambient', panel: true });
  const esc = UI.esc;
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    const d = new Date(t), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
    return new Date().toDateString() === d.toDateString() ? `today ${hm}` : `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}, ${hm}`;
  };

  /* Scene tile = a device tile: tap the tile to open it, the round button runs it (Home: tile opens, power toggles) */
  function sceneTile(s) {
    const busy = Scenarios.isBusy(s.id);
    return `<div class="tile scn-tile ${busy ? 'on' : ''}" role="button" tabindex="0" data-key="sc-${s.id}" data-action="edit" data-id="${s.id}">
      <span class="tile-icon" style="${busy ? 'color:var(--primary)' : ''}">${icon(s.icon || 'tab-scenarios', 'icon', 'style="width:28px;height:28px"')}</span>
      <button class="tile-power scn-play" data-action="run" data-id="${s.id}" aria-label="Run ${esc(s.name)}">${Scenarios.ringHTML(s.id)}</button>
      <span class="tile-name">${esc(s.name)}</span>
      <span class="tile-status"><span data-num>${esc(Scenarios.statusText(s))}</span></span></div>`;
  }
  function lastLine(s) {
    const l = (s.log || [])[0];
    if (s.on === false) return '<span class="scn-last">Paused</span>';
    if (!l) return '<span class="scn-last">Hasn’t run yet</span>';
    if (!l.ok) return `<span class="scn-last warn">${icon('round-info', 'icon')}${esc(l.text || 'Didn’t finish')} · ${ago(l.at)}</span>`;
    return `<span class="scn-last">${icon('check', 'icon')}Ran ${ago(l.at)}${l.cause ? ` · ${esc(l.cause)}` : ''}</span>`;
  }
  function autoCard(s) {
    return `<div class="scn-card ${s.on === false ? 'paused' : ''}" data-key="sa-${s.id}">
      <button class="scn-card-main" data-action="edit" data-id="${s.id}">
        <span class="scn-ic">${icon(s.icon || 'tab-scenarios', 'icon')}</span>
        <span class="scn-txt"><b>${esc(s.name)}</b><span class="scn-sent">${esc(Scenarios.sentence(s))}</span>${lastLine(s)}</span>
      </button>
      <button class="switch" role="switch" aria-checked="${s.on !== false}" data-action="toggle" data-id="${s.id}" aria-label="${s.on === false ? 'Turn on' : 'Pause'} ${esc(s.name)}"></button>
    </div>`;
  }
  function ideaCard(i) {
    return `<button class="scn-idea" data-key="si-${i.key}" data-action="idea" data-k="${i.key}">
      <span class="scn-ic">${icon(i.icon, 'icon')}</span><b>${esc(i.title)}</b><span>${esc(i.sub)}</span>
      <span class="scn-idea-add">${icon('plus-small', 'icon')}Add</span></button>`;
  }

  function render() {
    const L = Scenarios.list(), scenes = L.filter((s) => s.manual), autos = L.filter((s) => !s.manual), ideas = Scenarios.ideas(), built = Scenarios.builtIn();
    let h = `<header class="home-header"><h1 class="scn-h1">Scenarios</h1>
        <button class="icon-btn" data-action="plus" aria-label="New scenario">${icon('plus')}</button></header>`;
    if (!L.length) h += `<div class="scn-empty"><b>Make your home work on its own</b><span>A scenario does several things at once — with one tap, at a set time, or when a sensor notices something. Start from an idea below, or tap +.</span></div>`;
    // no "add" tiles: like Home, the + in the header opens a menu (Figma 3. Home Page, "+button")
    if (scenes.length) h += `<div class="section-title">Tap to run</div><div class="tile-grid">${scenes.map(sceneTile).join('')}</div>`;
    if (autos.length) h += `<div class="section-title">Automatic</div><div class="scn-cards">${autos.map(autoCard).join('')}</div>`;
    if (ideas.length) h += `<div class="section-title">Ideas for your home</div><div class="scn-ideas">${ideas.map(ideaCard).join('')}</div>`;
    if (built.length) h += `<div class="section-title">Built into your devices</div>
      <div class="list scn-built"><button class="cell" data-action="built"><span class="cell-icon">${icon('shield-check', 'icon')}</span><span class="cell-main"><span class="cell-title" style="display:block">${built.length} automation${built.length > 1 ? 's' : ''} in device settings</span><span class="cell-sub" style="display:block">${UI.esc([...new Set(built.map((x) => x.name))].slice(0, 2).join(', '))}${built.length > 2 ? '…' : ''}</span></span>${icon('chevron-right', 'chev')}</button></div>`;
    UI.patch(UI.screen, h);
    UI.screen.classList.add('with-tabbar');
    const panel = document.getElementById('protoPanel');
    if (panel) UI.patch(panel, protoPanel());
  }

  /* Desktop test panel: things a phone would report (location) + quick time checks */
  function protoPanel() {
    return `<div class="pp-title">Scenarios prototype</div>
      <p class="pp-note">Not part of the app. Play what the phones would report.</p>
      <h3>Phone location</h3>
      <button class="pp-btn" data-action="pp-leave">Everyone leaves home</button>
      <button class="pp-btn" data-action="pp-arrive">Someone comes home</button>
      <h3>Sensors</h3>
      <p class="pp-note">Sensor events (door opens, motion, leak…) are on each device page’s test panel — automations run there too. Sunrise ${Scenarios.SUN.sunrise} · sunset ${Scenarios.SUN.sunset} (Tashkent).</p>`;
  }

  // Tab bar (same as home)
  const tb = document.createElement('nav');
  tb.className = 'tabbar';
  tb.innerHTML = `<button class="ai" data-action="soon" aria-label="Assistant">${icon('ai-stars')}</button>
    <div class="tabs"><a class="tab" href="index.html">${icon('tab-home')}My Home</a>
    <a class="tab on" href="scenarios.html" aria-current="page">${icon('tab-scenarios')}Scenarios</a>
    <button class="tab" data-action="soon">${icon('tab-more')}More</button></div>`;
  UI.phone.appendChild(tb);

  UI.on({
    run: ({ id }) => { const s = Scenarios.get(id); if (!s) return; if (!s.do.length) { UI.go(`scenario.html?id=${id}`); return; } Scenarios.tapScene(id, render); },
    edit: ({ id }) => UI.go(`scenario.html?id=${id}`),
    new: ({ manual }) => UI.go(`scenario.html?new=${manual ? 'scene' : 'auto'}`),
    plus: () => UI.popover(`
      <button data-action="new" data-manual="1">${icon('tab-scenarios')} New scene</button>
      <button data-action="new">${icon('clock')} New automation</button>`),
    idea: ({ k }) => UI.go(`scenario.html?idea=${k}`),
    toggle: ({ id }) => { const s = Scenarios.get(id); if (!s) return; s.on = s.on === false; Store.save(); render(); UI.toast(s.on ? `${s.name} is on` : `${s.name} is paused`); },
    'pp-leave': () => { Scenarios.presence('leave'); render(); UI.toast('Location: everyone left'); },
    'pp-arrive': () => { Scenarios.presence('arrive'); render(); UI.toast('Location: someone is home'); },
    built: () => {
      const L = Scenarios.builtIn(), devs = [...new Set(L.map((x) => x.id))];
      UI.sheet({ title: 'Built into your devices', sub: 'Each device has its own automations — they are set up in the device’s settings.',
        render: () => devs.map((id) => { const rows = L.filter((x) => x.id === id); return UI.group(rows[0].device, rows.map((b) => `<a class="cell" href="device-settings.html?id=${b.id}"><span class="cell-icon">${icon(b.icon, 'icon')}</span><span class="cell-main cell-title">${esc(b.name)}</span>${icon('chevron-right', 'chev')}</a>`).join('')); }).join('') });
    },
    soon: () => UI.toast('Coming soon'),
  });

  render();
  Store.subscribe(() => render());
  startDeviceClock(() => {});
  setInterval(render, 30000);   // "5 min ago" stays true
})();
