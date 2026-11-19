/* Home page — Figma: "3. Home Page / Home" (5412:21969) */
(() => {
  UI.mount({ variant: 'ambient' });
  const S = () => Store.state;

  const tileHTML = homeTileHTML;   // js/devices/registry.js

  /* ---------- Top row: the user's own list of chips (edited from the Edit chip at its end) ----------
     Keys: 'all-off', 'dev:<id>' (any sensor — shows its live state), 'scene:<id>'. */
  const SENSOR_TYPES = ['climate', 'contact', 'motion', 'presence', 'leak', 'smoke', 'gas', 'air', 'vibration', 'meter', 'lock', 'valve'];
  const scenesOK = () => typeof Scenarios !== 'undefined';
  function topRow() {
    const st = S();
    if (!st.topRow) st.topRow = ['all-off', 'temp', 'door'];
    // older keys: the first temperature / door sensor
    st.topRow = st.topRow.map((k) => { if (k === 'temp' || k === 'door') { const d = st.devices.find((x) => x.type === (k === 'temp' ? 'climate' : 'contact')); return d ? 'dev:' + d.id : null; } return k; }).filter(Boolean)
      .filter((k, i, a) => a.indexOf(k) === i);
    return st.topRow;
  }
  const chipIcon = (d) => (d.type === 'climate' ? 'chip-temperature' : d.type === 'contact' ? 'chip-door' : DeviceAPI(d).icon(0));
  /* short names in the row: drop the room the device sits in ("Living room motion" → "Motion"),
     unless two chips would then read the same */
  const shortName = (d) => { const r = Store.roomName(d.roomId), n = d.name.replace(new RegExp('^' + r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i'), ''); return n && n !== d.name ? n.charAt(0).toUpperCase() + n.slice(1) : d.name; };
  const chipName = (d) => {
    if (d.type === 'climate' && S().devices.filter((x) => x.type === 'climate').length === 1) return 'Temperature';   // Figma: "Temperature"
    const n = shortName(d);
    return S().devices.some((x) => x.id !== d.id && SENSOR_TYPES.includes(x.type) && shortName(x) === n) ? d.name : n;
  };
  /** A sensor chip: its icon, its name, its live state — coloured like its tile when it needs attention */
  function devChip(d) {
    const t = DeviceAPI(d).homeTiles()[0] || {};
    // minimal: only the state itself ("No motion", not "No motion · yesterday 13:00")
    const text = (d.type === 'climate' ? Devices.climate.chipText(d) : String(t.status || '')).split(' · ')[0];
    return `<button class="quick-chip" data-action="open" data-id="${d.id}" data-ch="0" data-key="qc-${d.id}">${icon(chipIcon(d))}<span><b>${UI.esc(chipName(d))}</b><span class="${t.tone ? 'tone-' + t.tone : ''}"><span data-num>${UI.esc(text || '')}</span></span></span></button>`;
  }
  function sceneChip(x) {
    const busy = Scenarios.isBusy(x.id);
    return `<button class="quick-chip scn-chip" data-action="scene-run" data-id="${x.id}" data-key="qc-${x.id}" aria-label="Run ${UI.esc(x.name)}">
      ${busy ? Scenarios.ringHTML(x.id) : Scenarios.ic(x.icon)}<span><b>${UI.esc(x.name)}</b><span data-num>${UI.esc(busy ? Scenarios.statusText(x) : 'Scene')}</span></span></button>`;
  }
  function chipOf(key, n) {
    if (key === 'all-off') return allOffChip(n);
    if (key.startsWith('dev:')) { const d = Store.device(key.slice(4)); return d ? devChip(d) : ''; }
    if (key.startsWith('scene:') && scenesOK()) { const x = Scenarios.get(key.slice(6)); return x && x.do.length ? sceneChip(x) : ''; }
    return '';
  }
  /** Everything that can sit in the top row: [key, name, icon, sub] */
  function rowChoices() {
    const L = [['all-off', 'Turn off all', 'power', 'Scene']];
    S().devices.filter((d) => SENSOR_TYPES.includes(d.type)).forEach((d) => L.push(['dev:' + d.id, chipName(d), chipIcon(d), `${DeviceAPI(d).label} · ${Store.roomName(d.roomId)}`]));
    if (scenesOK()) Scenarios.list().filter((x) => x.manual && !x.sys).forEach((x) => L.push(['scene:' + x.id, x.name, x.icon || 'tab-scenarios', 'Scene']));
    return L;
  }
  /* Edit sheet, two parts (iOS Control Center style): what is in the row now (− and a grip to reorder),
     and everything else (+). Changes show on Home at once. */
  function openRowEdit() {
    const ic = (n) => (scenesOK() ? Scenarios.ic(n, 'icon') : icon(n, 'icon'));
    const row = ([k, name, i, sub], on) => `<div class="cell tr-row" data-k="${k}" data-key="tr-${k}">
        <button class="tr-btn ${on ? 'minus' : 'plus'}" data-action="${on ? 'tr-remove' : 'tr-add'}" data-k="${k}" aria-label="${on ? 'Remove' : 'Add'} ${UI.esc(name)}">${icon(on ? 'minus' : 'plus-small', 'icon')}</button>
        <span class="cell-icon">${ic(i)}</span>
        <span class="cell-main"><span class="cell-title" style="display:block">${UI.esc(name)}</span>${sub ? `<span class="cell-sub" style="display:block">${UI.esc(sub)}</span>` : ''}</span>
        ${on ? `<span class="tr-grip" role="button" tabindex="0" aria-label="Move ${UI.esc(name)}">${icon('menu', 'icon')}</span>` : ''}</div>`;
    const draw = () => {
      const keys = topRow(), all = rowChoices(), by = Object.fromEntries(all.map((x) => [x[0], x]));
      const on = keys.filter((k) => by[k]), off = all.filter((x) => !keys.includes(x[0]));
      return `<div class="list-header">In the top row</div>
        <div class="list tr-list" data-tr="on">${on.length ? on.map((k) => row(by[k], true)).join('') : '<div class="cell"><span class="cell-main cell-sub">Nothing here — add from below</span></div>'}</div>
        ${off.length ? `<div class="list-header">More</div><div class="list tr-list">${off.map((x) => row(x, false)).join('')}</div>` : ''}`;
    };
    const sh = UI.sheet({ title: 'Top row', render: draw, footer: '<button class="btn btn-primary btn-block" data-action="sheet-close">Done</button>', onMount: bindDrag });
    const change = () => { Store.save(); render(); sh.refresh(); };
    UI.on({
      'tr-remove': ({ k }) => { const r = topRow(); r.splice(r.indexOf(k), 1); change(); },
      'tr-add': ({ k }) => { topRow().push(k); change(); },
    });
    /* drag by the grip: the row follows the finger, the others slide out of its way; drop = new order */
    function bindDrag(el) {
      const list = el.querySelector('[data-tr="on"]'); if (!list) return;
      list.querySelectorAll('.tr-grip').forEach((g) => g.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const rowEl = g.closest('.tr-row'), rows = [...list.querySelectorAll('.tr-row')], from = rows.indexOf(rowEl);
        const boxes = rows.map((r) => r.getBoundingClientRect()), h = boxes[from].height, y0 = e.clientY;
        let to = from;
        g.setPointerCapture(e.pointerId); rowEl.classList.add('dragging');
        const move = (ev) => {
          const dy = Math.max(boxes[0].top - boxes[from].top, Math.min(boxes[rows.length - 1].top - boxes[from].top, ev.clientY - y0));
          rowEl.style.transform = `translateY(${dy}px)`;
          const mid = boxes[from].top + h / 2 + dy;
          to = boxes.reduce((n, b, i) => n + (i !== from && mid > b.top + b.height / 2 ? 1 : 0), 0);   // its new place among the others
          rows.forEach((r, i) => { if (i === from) return; const shift = from < to && i > from && i <= to ? -h : from > to && i < from && i >= to ? h : 0; r.style.transform = shift ? `translateY(${shift}px)` : ''; });
        };
        const up = () => {
          g.removeEventListener('pointermove', move); g.removeEventListener('pointerup', up); g.removeEventListener('pointercancel', up);
          rows.forEach((r) => { r.style.transform = ''; }); rowEl.classList.remove('dragging');
          if (to !== from) { const r = topRow(), keys = rows.map((x) => x.dataset.k).filter((k) => r.includes(k)); const [m] = keys.splice(from, 1); keys.splice(to, 0, m); S().topRow = keys.concat(r.filter((k) => !keys.includes(k))); change(); }
        };
        g.addEventListener('pointermove', move); g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up);
      }));
    }
  }

  /** How many devices of "Turn off all" are on (its list can be edited, so count that list) */
  function onCount() {
    if (typeof Scenarios === 'undefined') { let n = 0; S().devices.forEach((d) => DeviceAPI(d).homeTiles().forEach((t) => { if (t.on) n++; })); return n; }
    const ao = Scenarios.get(Scenarios.ALL_OFF);
    return ao.do.filter((a) => { const d = Store.device(a.id); const t = d && DeviceAPI(d).homeTiles().find((x) => (x.ch || 0) === (a.ch || 0)); return t && t.on; }).length;
  }
  /** "Turn off all" = a system scene: same chip as before, runs with the progress ring */
  function allOffChip(n) {
    const busy = typeof Scenarios !== 'undefined' && Scenarios.isBusy(Scenarios.ALL_OFF);
    const ao = busy ? Scenarios.get(Scenarios.ALL_OFF) : null;
    return `<button class="quick-chip scn-chip" data-action="all-off" data-key="qc-all-off">${busy ? Scenarios.ringHTML(Scenarios.ALL_OFF, 'power') : icon('power')}<span><b>Turn off all</b><span data-num>${busy ? UI.esc(Scenarios.statusText(ao)) : n ? `${n} device${n > 1 ? 's' : ''} on` : 'No devices on'}</span></span></button>`;
  }

  /* ---------- Edit Home (Figma "Edit 1" 5429:44767): tiles jiggle like iOS app icons, drag a tile to reorder it or move it
     to another room, drag a room by its handle, × hides a tile from Home, the pen renames / removes a room, Add room, Done.
     Devices without a room sit under the rooms. */
  let editing = false;
  const jig = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); };   // a steady random per tile (no re-sync on re-render)
  function editHTML() {
    const st = S();
    let h = `<header class="home-header ed-head"><div class="home-name">Editing</div></header>`;
    const rooms = [...st.rooms, { id: null, name: 'No room' }];
    for (const r of rooms) {
      const devs = st.devices.filter((d) => (d.roomId || null) === r.id && d.showOnHome !== false);
      h += `<section class="ed-room ${r.id ? '' : 'is-none'}" data-key="ed-r-${r.id || 'none'}" data-room="${r.id || ''}">
        <div class="section-title ed-title">${r.id ? `<span class="ed-grip" aria-label="Move ${UI.esc(r.name)}">${icon('drag')}</span>` : ''}<span>${UI.esc(r.name)}</span>${r.id ? `<button class="ed-pen" data-action="room-edit" data-room="${r.id}" aria-label="Rename ${UI.esc(r.name)}">${icon('pen', 'icon', 'style="width:18px;height:18px"')}</button>` : ''}</div>
        <div class="tile-grid ed-grid">${devs.map((d) => DeviceAPI(d).homeTiles().map((t) => { const k = `${d.id}-${t.ch}`, j = jig(k);
          return `<div class="ed-cell" data-key="ed-${k}" data-dev="${d.id}" style="--jd:${-(j % 300)}ms;--jt:${250 + (j % 40)}ms;--jr:${j % 2 ? 1 : -1}">${homeTileHTML(d, t)}<button class="ed-x" data-action="ed-hide" data-id="${d.id}" aria-label="Hide ${UI.esc(t.name)} from Home">${icon('cross', 'icon')}</button></div>`; }).join('')).join('')}
          <div class="ed-drop">${devs.length ? '' : r.id ? 'Drag devices here' : 'Devices with no room'}</div></div></section>`;
    }
    h += `<div class="pad" data-key="ed-add" style="margin-top:8px"><button class="btn btn-glass btn-block" data-action="add-room">${icon('plus')} Add room</button></div>
      <div style="height:120px"></div>`;
    return h;
  }
  function render() {
    UI.phone.classList.toggle('is-editing', editing);
    if (editing) { UI.patch(UI.screen, editHTML()); UI.screen.classList.add('with-tabbar'); return; }
    const st = S();
    const n = onCount();
    let h = `<header class="home-header">
        <button class="home-name" data-action="homes">${UI.esc(st.home.name)} ${icon('chevron-down', 'icon icon-sm')}</button>
        <div class="row" style="gap:0">
          <button class="icon-btn" data-action="bell" aria-label="Notifications">${icon('bell')}${Store.unread ? `<span class="badge-count">${Store.unread}</span>` : ''}</button>
          <button class="icon-btn" data-action="plus" aria-label="Add">${icon('plus')}</button>
        </div></header>
      <div class="chips-row">
        ${topRow().map((k) => chipOf(k, n)).join('')}
        <button class="quick-chip row-edit" data-action="row-edit" aria-label="Edit the top row">${icon('pen')}<span><b>Edit</b></span></button>
      </div>`;
    // scenes with "Show on Home Screen": their own untitled group above the rooms
    const homeScenes = scenesOK() ? Scenarios.list().filter((x) => x.manual && !x.sys && Scenarios.homeOf(x) && x.do.length) : [];
    if (homeScenes.length) h += `<div class="tile-grid scn-home-grid" data-key="home-scenes">${homeScenes.map(Scenarios.tileHTML).join('')}</div>`;

    // rooms in their order, then the devices that are in no room (Figma: "No room" list under the rooms)
    const rooms = [...st.rooms, { id: null, name: 'No room' }];
    for (const r of rooms) {
      const devs = st.devices.filter((d) => (d.roomId || null) === r.id && d.showOnHome !== false);
      if (r.id === null && !devs.length) continue;
      // a room's title opens the room (Figma "Room view" 5426:24209)
      h += `<a class="section-title" href="room.html?id=${r.id || 'none'}" data-key="rt-${r.id || 'none'}">${UI.esc(r.name)} ${icon('chevron-right', 'icon icon-sm')}</a><div class="tile-grid" data-key="rg-${r.id || 'none'}">`;
      devs.forEach((d) => DeviceAPI(d).homeTiles().forEach((t) => { h += tileHTML(d, t); }));
      if (!devs.length) h += `<button class="tile add" data-action="add-device" data-room="${r.id}"><span class="plus">${icon('plus', 'icon icon-sm')}</span><span>Add a device</span></button>`;
      h += '</div>';
    }
    h += `<div style="display:flex;justify-content:center;padding:24px 0" data-key="edit-pill"><button class="btn-pill" data-action="edit">${icon('pen', 'icon icon-xs')} Edit</button></div>`;
    UI.patch(UI.screen, h);
    UI.screen.classList.add('with-tabbar');
  }

  // Tab bar (static, outside the scroll area)
  const tb = document.createElement('nav');
  tb.className = 'tabbar';
  tb.innerHTML = `<button class="ai" data-action="soon" aria-label="Assistant">${icon('ai-stars')}</button>
    <div class="tabs"><a class="tab on" href="index.html">${icon('tab-home')}My Home</a>
    <a class="tab" href="scenarios.html">${icon('tab-scenarios')}Scenarios</a>
    <button class="tab" data-action="soon">${icon('tab-more')}More</button></div>`;
  UI.phone.appendChild(tb);
  const done = document.createElement('div');
  done.className = 'ed-done';
  done.innerHTML = '<button class="btn btn-opposite btn-block" data-action="ed-done">Done</button>';
  UI.phone.appendChild(done);

  function openAddDevice(roomId) {
    UI.sheet({
      title: 'Add a device',
      render: () => `<div class="pad">
        <a class="option-card" href="add-device.html?via=zigbee${roomId ? '&room=' + roomId : ''}"><img class="oc-logo" src="assets/icons/figma/avatar-zigbee.png" width="40" height="40" alt="">
          <span class="grow"><b>Zigbee device</b><span>Find nearby Zigbee devices</span></span>${icon('chevron-right', 'chev c-secondary')}</a>
        <a class="option-card" href="add-device.html?via=wifi${roomId ? '&room=' + roomId : ''}"><img class="oc-logo" src="assets/icons/figma/avatar-wifi.png" width="40" height="40" alt="">
          <span class="grow"><b>Wi-Fi device</b><span>Connect Wi-Fi device</span></span>${icon('chevron-right', 'chev c-secondary')}</a></div>`,
    });
  }

  UI.on({
    open: ({ id, ch }) => UI.go(`device.html?id=${id}&ch=${ch}`),
    'tile-cmd': ({ id, ch, c }) => { const d = Store.device(id); DeviceAPI(d).tileCmd(+ch, c); Store.save(); render(); },
    'tile-power': ({ id, ch }) => {
      const d = Store.device(id); DeviceAPI(d).toggle(+ch); Store.save(); render();
      UI.pulse(UI.screen.querySelector(`.tile[data-id="${id}"][data-ch="${ch}"]`), 'just-toggled');
    },
    plus: () => UI.popover(`
      <button data-action="add-device">${icon('menu-device')} Add a device</button>
      <button data-action="add-room">${icon('menu-room')} Add room</button>
      <button data-action="soon">${icon('menu-users')} Invite members</button>`),
    'add-device': ({ room }) => openAddDevice(room && room !== 'null' ? room : null),
    'add-room': () => UI.prompt({
      title: 'Add room', label: 'Room name', okText: 'Create',
      validate: (v) => (!v ? 'Enter a room name' : S().rooms.some((r) => r.name.toLowerCase() === v.toLowerCase()) ? 'A room with this name already exists' : null),
      onOk: (v) => { Store.addRoom(v); render(); UI.toast(`Room “${v}” created`); },
    }),
    'all-off': () => {
      const ao = Scenarios.get(Scenarios.ALL_OFF), n = onCount();
      if (!n) return UI.toast('Nothing is on');
      const on = ao.do.filter((a) => { const d = Store.device(a.id); const t = d && DeviceAPI(d).homeTiles().find((x) => (x.ch || 0) === (a.ch || 0)); return t && t.on; });
      UI.sheet({ title: 'Turn off all?', sub: `${n} device${n > 1 ? 's are' : ' is'} on.`,
        render: () => `<div class="list">${on.map((a) => `<div class="cell"><span class="cell-icon">${icon(Scenarios.iconOf(a.id, a.ch), 'icon')}</span><span class="cell-main cell-title">${UI.esc(Scenarios.nameOf(a.id, a.ch))}</span></div>`).join('')}</div>
          <div class="pad" style="margin-top:16px"><button class="btn btn-glass btn-block" data-action="all-off-edit">Choose devices</button></div>`,
        footer: '<button class="btn btn-primary btn-block" data-action="all-off-go">Turn off</button>' });
    },
    'all-off-go': () => { UI.closeSheet(); Scenarios.tapScene(Scenarios.ALL_OFF, render); },
    'all-off-edit': () => UI.go(`scenario.html?id=${Scenarios.ALL_OFF}`),
    'scn-open': ({ id }) => UI.go(`scenario.html?id=${id}`),
    'scene-run': ({ id }) => Scenarios.tapScene(id, render),
    'row-edit': () => openRowEdit(),
    // a room: rename or remove (user, 2026-11-19 — rooms could be added but never removed). Devices of a removed room move to No room.
    'room-edit': ({ room }) => {
      const r = S().rooms.find((x) => x.id === room); if (!r) return;
      const n = () => S().devices.filter((d) => d.roomId === r.id).length;
      const s = UI.sheet({
        title: r.name, sub: n() ? `${n()} device${n() > 1 ? 's' : ''}` : 'No devices yet',
        render: () => `<div class="list"><button class="cell" data-action="room-rename"><span class="cell-main cell-title">Name</span><span class="cell-value">${UI.esc(r.name)}</span>${icon('chevron-right', 'chev')}</button></div>
          <div class="pad" style="margin-top:24px"><button class="btn btn-danger btn-block" data-action="room-remove">Remove room</button></div>`,
      });
      UI.on({
        'room-rename': () => UI.prompt({ title: 'Rename room', label: 'Room name', value: r.name, okText: 'Save',
          validate: (v) => (!v ? 'Enter a room name' : S().rooms.some((x) => x !== r && x.name.toLowerCase() === v.toLowerCase()) ? 'A room with this name already exists' : null),
          onOk: (v) => { r.name = v; Store.save(); render(); UI.closeSheet(); UI.toast(`Renamed to “${v}”`); } }),
        'room-remove': () => UI.confirm({ title: `Remove ${r.name}?`, text: n() ? `Its ${n()} device${n() > 1 ? 's' : ''} stay${n() > 1 ? '' : 's'} in your home, under No room.` : 'The room is empty.', ok: 'Remove',
          onOk: () => { S().devices.forEach((d) => { if (d.roomId === r.id) d.roomId = null; }); S().rooms.splice(S().rooms.indexOf(r), 1); Store.save(); UI.closeSheet(); render(); UI.toast(`${r.name} removed`); } }),
      });
      return s;
    },
    bell: () => UI.go('notifications.html'),
    homes: () => UI.toast('Switch home — coming soon'),
    edit: () => { editing = true; UI.haptic('medium'); UI.screen.scrollTo({ top: 0, behavior: 'smooth' }); render(); },
    'ed-done': () => { editing = false; render(); },
    'ed-hide': ({ id }) => { const d = Store.device(id); if (!d) return; d.showOnHome = false; Store.save(); render(); UI.toast(`${d.name} is hidden — find it in ${Store.roomName(d.roomId)}`); },
    soon: () => UI.toast('Coming soon'),
  });

  /* ---------- Edit Home: drag ----------
     Touch: hold a tile (or a room's handle) a moment, then move — so a plain swipe still scrolls. Mouse: just drag.
     The lifted tile follows the finger 1:1; the others make room with a glide (FLIP); near the top / bottom edge the page
     scrolls by itself. A tile can go to another room (or to No room). Dropping saves the order. */
  let drag = null;
  const scr = UI.screen;
  const rectsOf = (els) => new Map(els.map((x) => [x, x.getBoundingClientRect()]));
  function glide(before) {   // FLIP the ones that moved
    before.forEach((r0, x) => { if (x === drag.el || !x.isConnected) return; const r1 = x.getBoundingClientRect(), dx = r0.left - r1.left, dy = r0.top - r1.top; if (Math.abs(dx) + Math.abs(dy) < 1) return; x.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); });
  }
  function follow() {   // keep the lifted one under the finger
    const d = drag, el = d.el; el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${d.px - d.ox - r.left}px, ${d.py - d.oy - r.top}px) scale(${d.kind === 'tile' ? 1.06 : 1.02})`;
  }
  function place() {
    const d = drag, el = d.el;
    if (d.kind === 'tile') {
      const hit = document.elementsFromPoint(d.px, d.py).find((x) => x !== el && !el.contains(x) && (x.classList.contains('ed-cell') || x.classList.contains('ed-grid')));
      const target = hit && hit.classList.contains('ed-cell') ? hit : null;
      const grid = target ? target.parentElement : hit && hit.classList.contains('ed-grid') ? hit : null;
      if (!grid) return;
      let ref;
      if (target) { const r = target.getBoundingClientRect(); const after = d.px > r.left + r.width / 2; ref = after ? target.nextElementSibling : target; }
      else ref = grid.querySelector('.ed-drop');
      if (ref === el || (ref && ref.previousElementSibling === el && ref.parentElement === el.parentElement && !target)) return;
      if (el.nextElementSibling === ref && el.parentElement === grid) return;
      const all = [...scr.querySelectorAll('.ed-cell, .ed-drop, .ed-room')], before = rectsOf(all);
      grid.insertBefore(el, ref); UI.haptic('selection');
      follow(); glide(before);
    } else {
      const secs = [...scr.querySelectorAll('.ed-room:not(.is-none)')].filter((x) => x !== el);
      let ref = scr.querySelector('.ed-room.is-none');
      for (const x of secs) { const r = x.getBoundingClientRect(); if (d.py < r.top + r.height / 2) { ref = x; break; } }
      if (el.nextElementSibling === ref) return;
      const before = rectsOf([...scr.querySelectorAll('.ed-room')]);
      el.parentElement.insertBefore(el, ref); UI.haptic('selection');
      follow(); glide(before);
    }
  }
  function autoScroll() {
    if (!drag) return;
    const r = scr.getBoundingClientRect(), edge = 72; let v = 0;
    if (drag.py < r.top + edge + 40) v = -Math.ceil((r.top + edge + 40 - drag.py) / 6);
    else if (drag.py > r.bottom - edge) v = Math.ceil((drag.py - (r.bottom - edge)) / 6);
    if (v) { scr.scrollTop += v; follow(); place(); }
    drag.raf = requestAnimationFrame(autoScroll);
  }
  function lift(d) {
    drag = d; const el = d.el, r = el.getBoundingClientRect();
    d.ox = d.px - r.left; d.oy = d.py - r.top;
    el.classList.add('ed-lift'); scr.classList.add('is-dragging'); UI.haptic('medium');
    follow(); d.raf = requestAnimationFrame(autoScroll);
  }
  function drop() {
    const d = drag; if (!d) return; cancelAnimationFrame(d.raf);
    const el = d.el, from = el.getBoundingClientRect(); el.style.transform = 'none'; const to = el.getBoundingClientRect();
    el.classList.remove('ed-lift'); scr.classList.remove('is-dragging'); drag = null;
    el.animate([{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${d.kind === 'tile' ? 1.06 : 1.02})` }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    el.style.transform = '';
    UI.haptic('light');
    // save: rooms in screen order; devices in screen order, each in the room it was dropped in
    const st = S(), secs = [...scr.querySelectorAll('.ed-room')];
    st.rooms = secs.map((x) => x.dataset.room).filter(Boolean).map((id) => st.rooms.find((r) => r.id === id)).filter(Boolean);
    // a device with several tiles (a 2-gang relay) has one room: the tile you dragged decides it, its other tiles follow
    const order = [], moved = d.kind === 'tile' ? el.dataset.dev : null;
    secs.forEach((sec) => sec.querySelectorAll('.ed-cell').forEach((c) => {
      const dv = Store.device(c.dataset.dev); if (!dv || order.includes(dv)) return;
      if (dv.id === moved && c !== el) return;   // wait for the dragged tile
      dv.roomId = sec.dataset.room || null; order.push(dv);
    }));
    st.devices = order.concat(st.devices.filter((x) => !order.includes(x)));
    Store.save();
    setTimeout(render, 290);
  }
  scr.addEventListener('pointerdown', (e) => {
    if (!editing || drag || e.button > 0 || e.target.closest('.ed-x, .ed-pen, button.btn')) return;
    const grip = e.target.closest('.ed-grip'), cell = e.target.closest('.ed-cell');
    const el = grip ? grip.closest('.ed-room') : cell; if (!el) return;
    const d = { el, kind: grip ? 'room' : 'tile', px: e.clientX, py: e.clientY, x0: e.clientX, y0: e.clientY, live: false };
    const touch = e.pointerType !== 'mouse';
    const hold = touch ? setTimeout(() => { if (!d.gone) lift(d); }, grip ? 120 : 220) : null;
    const move = (ev) => {
      d.px = ev.clientX; d.py = ev.clientY;
      if (drag === d) { follow(); place(); return; }
      if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) > 6) { if (touch) { d.gone = true; clearTimeout(hold); end(); } else lift(d); }
    };
    const end = () => { clearTimeout(hold); document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end); document.removeEventListener('pointercancel', end); if (drag === d) drop(); };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); document.addEventListener('pointercancel', end);
  });
  // while something is lifted, a finger move must not scroll the page
  scr.addEventListener('touchmove', (e) => { if (drag) e.preventDefault(); }, { passive: false });
  scr.addEventListener('contextmenu', (e) => { if (editing) e.preventDefault(); });

  render();
  // Re-render when a device changed, or every second while a countdown is visible
  const hasCountdown = () => S().devices.some((d) => (d.channels || []).some((c) => c.timer) || DeviceAPI(d).busy());
  startDeviceClock((changed) => { if (drag) return; if (changed || hasCountdown()) render(); });
})();
