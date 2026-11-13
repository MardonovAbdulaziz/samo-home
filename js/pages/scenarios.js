/* Scenarios page — the second tab (simple version; the full one is tag scenarios-full-v1):
   1. Tap to run — tiles like device tiles: tap opens the scene, the round ▶ runs it.
   2. Automatic — cards that say in one sentence what happens, with a switch and what happened last time.
   Nothing yet → the app's empty state (Figma "No devices yet", IR remote). "Turn off all" lives on Home. */
(() => {
  UI.mount({ variant: 'ambient', panel: true });
  const esc = UI.esc;
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    const d = new Date(t), hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
    return new Date().toDateString() === d.toDateString() ? `today ${hm}` : `${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}, ${hm}`;
  };
  function lastLine(s) {
    const l = (s.log || [])[0];
    if (s.on === false) return '<span class="scn-last">Paused</span>';
    if (!l) return '';   // nothing to say before the first run
    if (!l.ok) return `<span class="scn-last warn">${icon('round-info', 'icon')}${esc(l.text || 'Didn’t finish')} · ${ago(l.at)}</span>`;
    return `<span class="scn-last">${icon('check', 'icon')}Ran ${ago(l.at)}${l.cause ? ` · ${esc(l.cause)}` : ''}</span>`;
  }
  function autoCard(s) {
    return `<div class="scn-card ${s.on === false ? 'paused' : ''}" data-key="sa-${s.id}">
      <button class="scn-card-main" data-action="scn-open" data-id="${s.id}">
        <span class="scn-ic">${icon(s.icon || 'tab-scenarios', 'icon')}</span>
        <span class="scn-txt"><b>${esc(s.name)}</b><span class="scn-sent">${esc(Scenarios.sentence(s))}</span>${lastLine(s)}</span>
      </button>
      <button class="switch" role="switch" aria-checked="${s.on !== false}" data-action="toggle" data-id="${s.id}" aria-label="${s.on === false ? 'Turn on' : 'Pause'} ${esc(s.name)}"></button>
    </div>`;
  }

  function render() {
    const L = Scenarios.list().filter((s) => !s.sys), scenes = L.filter((s) => s.manual), autos = L.filter((s) => !s.manual);
    let h = `<header class="home-header"><h1 class="scn-h1">Scenarios</h1>
        <button class="icon-btn" data-action="plus" aria-label="New scenario">${icon('plus')}</button></header>`;
    if (!L.length) h += `<div class="ir-empty scn-empty-state" data-key="empty"><h2>No scenarios yet</h2><p>Make several devices work together — with one tap, or by themselves at a time or when a sensor notices something.</p>
      <button class="btn btn-opposite btn-block" data-action="new" data-manual="1">${icon('plus')}New scene</button>
      <button class="btn btn-glass btn-block" data-action="new">${icon('plus')}New automation</button></div>`;
    if (scenes.length) h += `<div class="section-title">Tap to run</div><div class="tile-grid">${scenes.map(Scenarios.tileHTML).join('')}</div>`;
    if (autos.length) h += `<div class="section-title">Automatic</div><div class="scn-cards">${autos.map(autoCard).join('')}</div>`;
    UI.patch(UI.screen, h);
    UI.screen.classList.add('with-tabbar');
    const panel = document.getElementById('protoPanel');
    if (panel) UI.patch(panel, protoPanel());
  }

  /* Desktop test panel */
  function protoPanel() {
    return `<div class="pp-title">Scenarios prototype</div>
      <p class="pp-note">Not part of the app. Sensor events (door opens, motion, leak…) are on each device page’s test panel — automations run there too. Sunrise ${Scenarios.SUN.sunrise} · sunset ${Scenarios.SUN.sunset} (Tashkent).</p>`;
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
    'scene-run': ({ id }) => { const s = Scenarios.get(id); if (!s) return; if (!s.do.length) { UI.go(`scenario.html?id=${id}`); return; } Scenarios.tapScene(id, render); },
    'scn-open': ({ id }) => UI.go(`scenario.html?id=${id}`),
    new: ({ manual }) => UI.go(`scenario.html?new=${manual ? 'scene' : 'auto'}`),
    plus: () => UI.popover(`
      <button data-action="new" data-manual="1">${icon('tab-scenarios')} New scene</button>
      <button data-action="new">${icon('clock')} New automation</button>`),
    toggle: ({ id }) => { const s = Scenarios.get(id); if (!s) return; s.on = s.on === false; Store.save(); render(); UI.toast(s.on ? `${s.name} is on` : `${s.name} is paused`); },
    soon: () => UI.toast('Coming soon'),
  });

  render();
  Store.subscribe(() => render());
  startDeviceClock(() => {});
  setInterval(render, 30000);   // "5 min ago" stays true
})();
