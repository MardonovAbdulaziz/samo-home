/* Notifications — Figma "Уведомления" 5412:21693 (list), 5412:21831 (empty), 5412:21857 (one opened), 5448:68060 (delete all).
   Grouped by day, newest first. Unread = a red dot. Swipe a row left → Delete (a long swipe deletes at once).
   Tap → the whole message in a sheet (and it's read). Top right: mark all read, delete all (asks first). */
(() => {
  UI.mount({ variant: 'elevated' });
  const st = () => Store.state, esc = UI.esc;

  const iconOf = (n) => {
    const d = n.dev && Store.device(n.dev);
    if (d) { const t = DeviceAPI(d).homeTiles()[0]; return (t && t.icon) || DeviceAPI(d).icon(0) || 'bell'; }
    return { scene: 'tab-scenarios', home: 'tab-home', news: 'bell' }[n.kind] || 'bell';
  };
  const where = (n) => { const d = n.dev && Store.device(n.dev); return d ? `${st().home.name} · ${Store.roomName(d.roomId)}` : st().home.name; };
  const dayKey = (t) => new Date(t).toDateString();
  const dayName = (t) => {
    const d = new Date(t), today = new Date(), y = new Date(Date.now() - 864e5);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  };

  function row(n) {
    return `<div class="nt-row" data-key="n-${n.id}">
      <button class="nt-del" data-action="nt-del" data-id="${n.id}" aria-label="Delete" tabindex="-1">${icon('trash')}</button>
      <button class="cell has-icon nt-cell" data-action="nt-open" data-id="${n.id}">
        <span class="cell-icon nt-ic ${n.tone ? 'is-' + n.tone : ''}">${icon(iconOf(n))}</span>
        <span class="cell-main"><span class="cell-title" style="display:block">${esc(n.title)}</span><span class="cell-sub" style="display:block">${esc(where(n))}</span></span>
        <span class="nt-meta"><span class="nt-time">${UI.fmtTime(n.t)}</span><i class="nt-dot ${n.read ? '' : 'on'}" aria-label="${n.read ? '' : 'Unread'}"></i></span>
      </button></div>`;
  }

  function render() {
    const notes = st().notes || [], unread = notes.some((n) => !n.read);
    const right = `<div class="row nt-tools" style="gap:0">
        <button class="icon-btn" data-action="nt-read-all" aria-label="Mark all as read" ${unread ? '' : 'disabled'}>${icon('double-check')}</button>
        <button class="icon-btn" data-action="nt-clear" aria-label="Delete all" ${notes.length ? '' : 'disabled'}>${icon('trash')}</button></div>`;
    let h = UI.toolbar({ title: 'Notifications', back: 'index.html', plain: true, large: true, right });
    if (!notes.length) {
      h += `<div class="nt-empty" data-key="empty"><span class="nt-empty-ic">${icon('bell')}</span><p>No notifications</p></div>`;
    } else {
      const days = [];
      notes.slice().sort((a, b) => b.t - a.t).forEach((n) => { const k = dayKey(n.t); let g = days.find((x) => x.k === k); if (!g) days.push(g = { k, t: n.t, items: [] }); g.items.push(n); });
      h += days.map((g) => `<div class="list-header" data-key="h-${g.k}">${dayName(g.t)}</div><div class="list nt-list" data-key="l-${g.k}">${g.items.map(row).join('')}</div>`).join('');
      h += '<div style="height:32px"></div>';
    }
    UI.patch(UI.screen, h);
  }

  function openNote(id) {
    const n = (st().notes || []).find((x) => x.id === id); if (!n) return;
    Store.readNote(id); render();
    const d = n.dev && Store.device(n.dev);
    UI.sheet({
      title: n.title, sub: `${new Date(n.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}, ${UI.fmtTime(n.t)} · ${where(n)}`,
      render: () => `<div class="pad nt-body">${esc(n.body || '')}</div>
        ${d ? `<div class="list" style="margin-top:20px"><a class="cell has-icon" href="device.html?id=${d.id}"><span class="cell-icon">${icon(iconOf(n))}</span><span class="cell-main cell-title">Open ${esc(d.name)}</span>${icon('chevron-right', 'chev')}</a></div>` : ''}`,
      footer: '<button class="btn btn-secondary btn-block" data-action="sheet-close">Done</button>',
    });
  }

  /* swipe left on a row: the row follows the finger and shows Delete; past half the width it deletes at once */
  let open = null;   // the row that sits open
  const OPEN_X = -84;
  const setX = (cell, x, anim) => { cell.style.transition = anim ? 'transform 320ms cubic-bezier(0.23, 1, 0.32, 1)' : 'none'; cell.style.transform = x ? `translateX(${x}px)` : ''; cell.parentElement.classList.toggle('is-open', x < -8); };
  const closeOpen = () => { if (open) { setX(open, 0, true); open = null; } };
  function remove(id, cell) {
    UI.haptic('rigid');
    if (cell) setX(cell, -cell.offsetWidth, true);
    setTimeout(() => { Store.removeNote(id); open = null; render(); }, cell ? 180 : 0);
  }
  UI.screen.addEventListener('pointerdown', (e) => {
    const cell = e.target.closest('.nt-cell'); if (!cell || e.button > 0) return;
    if (open && open !== cell) closeOpen();
    const x0 = e.clientX, y0 = e.clientY, base = cell === open ? OPEN_X : 0; let dx = 0, live = false, dead = false;
    const move = (ev) => {
      if (dead) return;
      const mx = ev.clientX - x0, my = ev.clientY - y0;
      if (!live) { if (Math.abs(my) > 8 && Math.abs(my) > Math.abs(mx)) { dead = true; return; } if (Math.abs(mx) < 8) return; live = true; cell._swiped = true; }
      dx = Math.min(0, base + mx);
      const w = cell.offsetWidth, x = dx < -w * 0.5 ? dx : dx;   // free past the button, so a long swipe reads as "throw it away"
      setX(cell, x, false);
      cell.parentElement.classList.toggle('is-far', dx < -w * 0.5);
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      if (!live) return;
      setTimeout(() => { cell._swiped = false; }, 0);
      if (dx < -cell.offsetWidth * 0.5) return remove(cell.dataset.id, cell);
      if (dx < OPEN_X / 2) { setX(cell, OPEN_X, true); if (open !== cell) UI.haptic('light'); open = cell; } else { setX(cell, 0, true); if (open === cell) open = null; }
      cell.parentElement.classList.remove('is-far');
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  });

  UI.on({
    'nt-open': ({ id }, el) => { const cell = document.querySelector(`.nt-cell[data-id="${id}"]`); if (cell && cell._swiped) return; if (open) { closeOpen(); return; } openNote(id); },
    'nt-del': ({ id }) => remove(id, document.querySelector(`.nt-cell[data-id="${id}"]`)),
    'nt-read-all': () => { Store.readAll(); UI.haptic('success'); render(); },
    'nt-clear': () => UI.confirm({ title: 'Delete all notifications?', text: 'This can’t be undone.', ok: 'Delete all', onOk: () => { Store.clearNotes(); render(); } }),
  });
  render();
})();
