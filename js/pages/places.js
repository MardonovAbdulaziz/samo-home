/* Places in the room (presence sensor zones) — its own pages, like Device Settings:
   places.html?id=…            the room with every place + the list of places + Add place
   places.html?id=…&p=2        one place: name (Figma “Add room” 5439:58025: field + chips), its squares, Remove place
   One look for the room everywhere (radar, these pages): one hairline wall, places = soft fill without a border,
   the chosen place blue, squares = hairlines. */
(() => {
  UI.mount({ variant: 'elevated' });
  const d = Store.device(UI.param('id'));
  if (!d || d.type !== 'presence') { UI.go('index.html'); return; }
  const P = Devices.presence.places, esc = UI.esc;
  const from = UI.param('from') === 'settings' ? 'settings' : 'device';
  const back = from === 'settings' ? `device-settings.html?id=${d.id}` : `device.html?id=${d.id}`;
  const listUrl = `places.html?id=${encodeURIComponent(d.id)}&from=${from}`;
  const pi = UI.param('p') == null ? null : +UI.param('p');
  const isNew = UI.param('new') === '1';
  const squares = (n) => (n ? `${n} square${n > 1 ? 's' : ''}` : 'Not marked yet');
  const SUGGEST = ['Sofa', 'Bed', 'Desk', 'Door', 'TV', 'Dining', 'Kitchen', 'Chair'];

  function listPage() {
    // a place that was added but never marked is dropped when you come back to the list
    const before = d.zones.length; d.zones = d.zones.filter((z) => !(z.draft && !z.cells.length)); if (d.zones.length !== before) Store.save();
    let h = UI.toolbar({ title: 'Places in the room', back, plain: true });
    h += `<div style="height:12px"></div><div class="pad pr-room">${P.plan(d, {})}</div>
      <div class="list-footer">Top = the wall with the sensor.</div>
      <div class="list-header">Places</div>
      <div class="list">${d.zones.map((z, i) => `<a class="cell" href="${listUrl}&p=${i}"><span class="cell-main"><span class="cell-title" style="display:block">${esc(z.name)}</span><span class="cell-sub" style="display:block">${squares(z.cells.length)}</span></span>${icon('chevron-right', 'chev')}</a>`).join('')}
        ${d.zones.length < P.MAX ? `<button class="cell scn-add-row" data-action="pl-add"><span class="cell-icon"><span class="scn-plus">${icon('plus-small', 'icon')}</span></span><span class="cell-main cell-title">Add place</span></button>` : ''}</div>
      <div class="list-footer">${d.zones.length >= P.MAX ? `This sensor keeps up to ${P.MAX} places.` : 'The sensor tells which place someone is in.'}</div>
      <div style="height:32px"></div>`;
    return h;
  }
  function placePage(z) {
    const i = d.zones.indexOf(z);
    let h = UI.toolbar({ title: isNew ? 'New place' : z.name, back: listUrl, plain: true });
    h += `<div style="height:12px"></div>
      <label class="field"><span class="field-label">Place name</span>
        <input id="plName" value="${esc(z.name)}" maxlength="24" autocomplete="off">
        <button class="field-clear" data-action="pl-clear" aria-label="Clear">${icon('close-circle', 'icon icon-sm')}</button></label>
      <div class="pad name-chips">${SUGGEST.map((n) => `<button class="name-chip" data-action="pl-name" data-n="${n}">${n}</button>`).join('')}</div>
      <div class="list-header">Where it is</div>
      <div class="pad pr-room">${P.plan(d, { edit: true, sel: i })}</div>
      <div class="list-footer">Tap the squares where ${esc(z.name)} is — tap again to clear. Top = the wall with the sensor.</div>
      <div class="pad" style="margin-top:24px"><button class="btn btn-danger btn-block" data-action="pl-del">Remove place</button></div>
      <div style="height:32px"></div>`;
    return h;
  }
  const zone = () => (pi != null ? d.zones[pi] : null);
  function render() {
    const z = zone();
    if (pi != null && !z) { UI.go(listUrl); return; }
    UI.patch(UI.screen, z ? placePage(z) : listPage());
  }
  render();

  const setName = (v) => { const z = zone(); if (!z) return; const n = v.trim(); if (n) { z.name = n; Store.save(); render(); } };
  const inp = () => document.getElementById('plName');
  UI.screen.addEventListener('input', (e) => { if (e.target.id === 'plName') setName(e.target.value); });
  UI.screen.addEventListener('focusout', (e) => { if (e.target.id === 'plName' && !e.target.value.trim()) e.target.value = zone().name; });
  UI.on({
    'pl-add': () => {
      const used = d.zones.map((z) => z.name.toLowerCase());
      d.zones.push({ name: P.NAMES.find((n) => !used.includes(n.toLowerCase())) || 'Place', cells: [], draft: true });
      Store.save(); UI.go(`${listUrl}&p=${d.zones.length - 1}&new=1`);
    },
    'pl-name': ({ n }) => { const i = inp(); if (i) i.value = n; setName(n); },
    'pl-clear': () => { const i = inp(); if (i) { i.value = ''; i.focus(); } },
    'pr-cell': ({ c }) => {
      const z = zone(); if (!z) return;
      const had = z.cells.includes(c);
      d.zones.forEach((x) => { x.cells = x.cells.filter((k) => k !== c); });   // a square belongs to one place
      if (!had) z.cells.push(c);
      if (z.cells.length) delete z.draft;
      Store.save(); render();
    },
    'pl-del': () => {
      const z = zone(); if (!z) return;
      UI.confirm({ title: `Remove ${z.name}?`, text: 'The sensor will stop telling when someone is there.', ok: 'Remove',
        onOk: () => { d.zones.splice(d.zones.indexOf(z), 1); Store.save(); UI.go(listUrl); } });
    },
  });
})();
