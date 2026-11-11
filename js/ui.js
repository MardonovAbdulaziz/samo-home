/* Samo-home UI kit: phone shell, sheets, toast, popover, helpers.
   Pages call UI.mount() once, then render into UI.screen. */
/* Storage that never breaks the app: the browser's localStorage / sessionStorage when allowed; otherwise
   (e.g. a sandboxed frame where they are missing or throw) memory kept in window.name, which survives
   reloads of the same tab. Same getItem / setItem / removeItem interface. */
const SafeStorage = (() => {
  const bag = () => { try { const o = JSON.parse(window.name || '{}'); if (o && o.samo) return o; } catch (e) { /* not ours */ } return { samo: 1, local: {}, session: {} }; };
  const put = (b) => { try { window.name = JSON.stringify(b); } catch (e) { /* ignore */ } };
  const make = (kind, key) => {
    try { const s = window[kind]; s.setItem('__samo', '1'); s.removeItem('__samo'); return s; } catch (e) { /* fall back */ }
    return {
      getItem: (k) => { const v = (bag()[key] || {})[k]; return v === undefined ? null : v; },
      setItem: (k, v) => { const b = bag(); (b[key] = b[key] || {})[k] = String(v); put(b); },
      removeItem: (k) => { const b = bag(); if (b[key]) delete b[key][k]; put(b); },
    };
  };
  return { local: make('localStorage', 'local'), session: make('sessionStorage', 'session') };
})();

const UI = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const param = (k) => new URLSearchParams(location.search).get(k);
  const go = (url) => { location.href = url; };

  let phone, screen, sheetEl, backdrop, toastEl, toastT;

  /* ---------- DOM morph ----------
     Re-rendering with innerHTML replaces every element, so CSS transitions never run and
     one-shot animations restart. patch() keeps existing elements and only updates what changed
     (attributes, text, added/removed nodes) — state changes animate naturally. */
  const stripIds = (h) => h.replace(/_\d+(?=[")])/g, '');   // icon() makes unique mask ids per render
  function sameNode(a, b) {
    if (a.nodeType !== b.nodeType) return false;
    if (a.nodeType !== 1) return true;
    return a.tagName === b.tagName && (a.getAttribute('data-key') || '') === (b.getAttribute('data-key') || '');
  }
  function morphAttrs(from, to) {
    for (const { name, value } of [...to.attributes]) {
      if (name === 'value' && from === document.activeElement) continue;     // never fight the caret
      if (from.getAttribute(name) !== value) from.setAttribute(name, value);
    }
    for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
    if (from.tagName === 'INPUT' && from !== document.activeElement && from.value !== (to.getAttribute('value') || '')) from.value = to.getAttribute('value') || '';
  }
  const keyOf = (n) => (n && n.nodeType === 1 ? n.getAttribute('data-key') : null);
  function morphChildren(from, to) {
    const next = [...to.childNodes];
    const newKeys = new Set(next.map(keyOf).filter(Boolean));
    next.forEach((n, i) => {
      let cur = from.childNodes[i];
      // Keyed node (data-key): find the same element even if something was inserted/removed before it
      // (a banner appearing must not shift and rebuild the rest of the page — that kills its animations)
      const k = keyOf(n);
      if (k && keyOf(cur) !== k) {
        for (let j = i + 1; j < from.childNodes.length; j++) {
          if (keyOf(from.childNodes[j]) === k) { from.insertBefore(from.childNodes[j], cur || null); cur = from.childNodes[i]; break; }
        }
      }
      if (!cur) { from.appendChild(n); return; }
      if (!sameNode(cur, n)) {
        if (newKeys.has(keyOf(cur))) from.insertBefore(n, cur);   // keep the keyed node for its own turn
        else from.replaceChild(n, cur);
        return;
      }
      if (cur.nodeType !== 1) { if (cur.nodeValue !== n.nodeValue) cur.nodeValue = n.nodeValue; return; }
      if (cur.tagName.toLowerCase() === 'svg') {                            // icons: swap only if the drawing changed
        if (stripIds(cur.outerHTML) !== stripIds(n.outerHTML)) from.replaceChild(n, cur);
        return;
      }
      if (cur.hasAttribute('data-keep') && n.hasAttribute('data-keep')) return;   // drawn by JS every frame (e.g. curtain scene): leave it alone
      morphAttrs(cur, n);
      if (cur.hasAttribute('data-num')) {                                   // rolling number: compare the value, not the spans
        if ((numVal.get(cur) ?? cur.textContent) !== n.textContent) cur.textContent = n.textContent;
        return;
      }
      morphChildren(cur, n);
    });
    while (from.childNodes.length > next.length) from.removeChild(from.lastChild);
  }
  function patch(target, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    morphChildren(target, tpl.content);
  }
  /* ---------- Rolling numbers (iOS numericText) ----------
     Any element with [data-num]: when its text changes (patch, live update, textContent = …), only the
     characters that changed roll: the new one drops in from above inside its slot, the old one drops
     out below (CSS .nr). Text without digits just swaps.
     [data-num="count"] (readings like 0.4 W → 60.4 W): the value counts smoothly from old to new
     instead — rolling single digits looks broken when a reading jumps by a lot. */
  const numVal = new WeakMap();
  const NUM_RE = /^(\D*?)(-?\d+(?:\.\d+)?)(.*)$/s;
  function count(el, prev, next) {
    const a = prev.match(NUM_RE), b = next.match(NUM_RE);
    if (!a || !b || a[1] !== b[1] || a[3] !== b[3]) { numVal.set(el, next); return; }   // different shape: just swap
    const dec = (b[2].split('.')[1] || '').length, from = el._tw ? el._tw.now : +a[2], to = +b[2], t0 = performance.now(), D = 520;
    const fmt = (v) => b[1] + v.toFixed(dec) + b[3];
    el._tw = { target: next, now: from, text: fmt(from) };
    const step = (t) => {
      const tw = el._tw; if (!tw || tw.target !== next) return;
      const k = Math.max(0, Math.min(1, (t - t0) / D)), e = 1 - Math.pow(1 - k, 3);   // ease-out cubic; rAF time can be < t0 → clamp (no backwards jump)
      tw.now = from + (to - from) * e; tw.text = k < 1 ? fmt(tw.now) : next;
      numVal.set(el, tw.text); el.textContent = tw.text;
      if (k < 1) requestAnimationFrame(step); else el._tw = null;
    };
    numVal.set(el, el._tw.text); el.textContent = el._tw.text;
    requestAnimationFrame(step);
  }
  function roll(el, prev, next) {
    if (el._tw && next === el._tw.target) { numVal.set(el, el._tw.text); el.textContent = el._tw.text; return; } // a re-render wrote the end value mid-count: keep counting
    if (!/\d/.test(prev) || !/\d/.test(next) || matchMedia('(prefers-reduced-motion: reduce)').matches) { el._tw = null; numVal.set(el, next); return; }
    if (el.dataset.num === 'count') return count(el, prev, next);
    numVal.set(el, next);
    // Pair characters by meaning, not by string end: integer digits right-aligned, decimals and the
    // rest (unit, ":59") left-aligned — so 5 s → 5.5 s keeps "5" still and only ".5" drops in.
    const split = (t) => { const m = t.match(/^(\D*)(\d+)([.,]\d+)?(.*)$/s); return m ? [m[1], m[2], m[3] || '', m[4]] : [t, '', '', '']; };
    // [newChar, oldChar] for every character of the new text; oldChar is ' ' where nothing was there
    const pairs = (o, c, right) => {
      const n = Math.max(o.length, c.length), O = right ? o.padStart(n) : o.padEnd(n), from = right ? n - c.length : 0;
      return [...c].map((ch, k) => [ch, O[from + k]]);
    };
    const A = split(prev), B = split(next);
    const list = [0, 1, 2, 3].flatMap((k) => pairs(A[k], B[k], k < 2));
    // Speed follows how often this number changes: a value updated many times a second (curtain %,
    // a slider being dragged) rolls fast and continuously like an odometer; a value that changes now and
    // then rolls at the full 320 ms. Only digits roll — changed words swap at once.
    const now = performance.now(), gap = el._nrLast ? now - el._nrLast : 1e9; el._nrLast = now;
    const dur = Math.round(Math.max(110, Math.min(320, gap * 0.85)));
    el.style.setProperty('--nr-dur', dur + 'ms');
    let h = '';
    for (const [c, o] of list) {
      if (c === o || (!/\d/.test(c) && !/\d/.test(o || ''))) { h += esc(c); continue; }
      h += `<span class="nr"><span class="nr-in">${esc(c)}</span>${o.trim() ? `<span class="nr-out" aria-hidden="true">${esc(o)}</span>` : ''}</span>`;
    }
    el.innerHTML = h;
    clearTimeout(el._nrT);
    // back to plain text the moment the roll ends (the slot mask would otherwise soften the digit edges)
    const clean = () => { clearTimeout(el._nrT); if (numVal.get(el) === next && el.isConnected && el.querySelector('.nr')) el.textContent = next; };
    const last = el.querySelectorAll('.nr-in'); if (last.length) last[last.length - 1].addEventListener('animationend', clean, { once: true });
    el._nrT = setTimeout(clean, dur + 130);
  }
  const numObs = new MutationObserver((recs) => {
    const changed = new Set();
    for (const r of recs) {
      const t = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const host = t && t.closest('[data-num]');
      if (host) changed.add(host);
      r.addedNodes.forEach((x) => {
        if (x.nodeType !== 1) return;
        [x, ...x.querySelectorAll('[data-num]')].forEach((e) => { if (e.matches('[data-num]') && !numVal.has(e)) numVal.set(e, e.textContent); });
      });
    }
    changed.forEach((el) => {
      const next = el.textContent, prev = numVal.get(el);
      if (prev === undefined) numVal.set(el, next);
      else if (prev !== next) roll(el, prev, next);
    });
    numObs.takeRecords();                                 // ignore our own span writes
  });
  numObs.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
  /** Set the text of a [data-num] element. Compares with its value, not its DOM (which holds the rolling
      digits mid-animation), so writing the same value again never cuts a roll short. Use this for every
      live number update. */
  const setNum = (el, text) => { if (!el) return; text = String(text); if ((numVal.get(el) ?? el.textContent) !== text) el.textContent = text; };

  /** Sheet section (Figma "Access rights"): optional H3 title + card; rows inside the card are divided. */
  const group = (title, inner) => `<section class="sheet-group">${title ? `<div class="list-header group-title">${esc(title)}</div>` : ''}<div class="group-card">${inner}</div></section>`;

  /** Section that opens/closes smoothly instead of popping in (content stays in the DOM, inert while closed). */
  const collapse = (open, html) => `<div class="collapse" aria-hidden="${!open}" ${open ? '' : 'inert'}><div class="collapse-inner">${html}</div></div>`;

  /** Restart a one-shot CSS animation class on an element that persists between renders. */
  function pulse(el, cls) {
    if (!el) return;
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
  }
  const actions = {};
  // Range sliders (Figma 6142:73760): the blue fill follows the thumb — keep --v (0…1) in step with the value
  document.addEventListener('input', (e) => {
    const r = e.target; if (!(r instanceof HTMLInputElement) || !r.classList.contains('range')) return;
    const min = +r.min || 0, max = +r.max || 100;
    r.style.setProperty('--v', String((+r.value - min) / (max - min || 1)));
  }, true);

  function statusBar() {
    return `<div class="statusbar" aria-hidden="true">
      <div class="time">9:41</div>
      <div class="levels">
        <img src="assets/icons/cellular.svg" width="19.2" height="12.226" alt="">
        <img src="assets/icons/wifi-status.svg" width="17.142" height="12.328" alt="">
        <img src="assets/icons/battery.svg" width="27.328" height="13" alt="">
      </div></div>`;
  }

  /** Mount the phone frame. opts: { variant: 'ambient'|'elevated'|'base', panel: bool } */
  function mount(opts = {}) {
    document.body.innerHTML = '';
    phone = document.createElement('div');
    phone.className = 'phone ' + (opts.variant || 'ambient');
    { const bg = param('bg'); if (bg) document.documentElement.dataset.bg = bg; }   // design lab: ?bg=N tries a background variant (design/backgrounds.html)
    phone.innerHTML = `${statusBar()}<main class="screen" id="screen"></main>
      <div class="home-indicator"></div>
      <div class="popover-backdrop" id="popBg"></div>
      <div class="sheet-backdrop" id="sheetBg"></div>
      <section class="sheet" id="sheet" role="dialog" aria-modal="true"></section>
      <div class="toast" id="toast" role="status"></div>`;
    document.body.appendChild(phone);
    if (opts.panel) {
      const p = document.createElement('aside');
      p.className = 'proto-panel'; p.id = 'protoPanel';
      document.body.appendChild(p);
    }
    screen = phone.querySelector('#screen');
    screen.classList.add('first'); setTimeout(() => screen.classList.remove('first'), 800); // content fades up once
    sheetEl = phone.querySelector('#sheet');
    backdrop = phone.querySelector('#sheetBg');
    toastEl = phone.querySelector('#toast');
    backdrop.addEventListener('click', closeSheet);
    // Scroll: bar background fades in (Figma "top": blur 10 + base 80%); large title → centered nav title
    const SCROLL_TL = CSS.supports('animation-timeline: scroll()');
    let ticking = false;   // one layout read per frame, never per scroll event
    screen.addEventListener('scroll', () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const y = screen.scrollTop;
        phone.classList.toggle('scrolled', y > 2);
        // bar material follows the scroll position itself (0 → 1 over the first 24 px), like UIKit's
        // scrollEdge → standard appearance: no timed fade that trails behind the finger
        const a = Math.min(1, Math.max(0, y / 24)).toFixed(3);
        if (!SCROLL_TL) phone.querySelectorAll('.toolbar, .statusbar').forEach((b) => b.style.setProperty('--bar-a', a));
        const h1 = screen.querySelector('.large-head h1'), bar = screen.querySelector('.toolbar');
        phone.classList.toggle('collapsed', !!(h1 && bar && h1.getBoundingClientRect().bottom < bar.getBoundingClientRect().bottom + 2));
      });
    }, { passive: true });
    const f = SafeStorage.session.getItem('samo-flash');
    if (f) { SafeStorage.session.removeItem('samo-flash'); setTimeout(() => toast(f), 300); }
    // One delegated click handler for the whole app: elements use data-action="name"
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el || !document.body.contains(el)) return;
      const fn = actions[el.dataset.action];
      if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
    });
    return { phone, screen };
  }

  /** Register click handlers: UI.on({ name: (data, el) => {} }) */
  const on = (map) => Object.assign(actions, map);

  /* ---------- Toolbar ---------- */
  /** large: Apple-style large title (+ optional desc) at the top of the page; the centered nav title fades in once it scrolls under the bar. */
  function toolbar({ title = '', subtitle = '', back = 'index.html', right = '', plain = false, large = false, desc = '' } = {}) {
    const backBtn = back ? `<a class="${plain ? 'icon-btn' : 'glass-btn'}" href="${back}" aria-label="Back">${icon('back')}</a>` : '<span class="spacer"></span>';
    const head = large ? `<div class="large-head"><h1>${esc(title)}</h1>${desc ? `<p>${esc(desc)}</p>` : ''}</div>` : '';
    return `<header class="toolbar ${plain ? 'plain' : ''} ${large ? 'has-large' : ''}">
      ${backBtn}
      <div class="title-wrap"><div class="title">${esc(title)}</div>${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}</div>
      ${right || '<span class="spacer"></span>'}
    </header>${head}`;
  }

  /* ---------- Bottom sheet ---------- */
  let sheetState = null;
  /** sheet({ title, sub, tabs: () => html, render: () => html, footer, full, onClose, closeBtn: true }) — tabs stay fixed above the scrolling body; render is re-run by sheet.refresh() */
  function sheet(cfg) {
    const opening = !sheetEl.classList.contains('open');
    sheetState = cfg;
    drawSheet();
    if (opening) { sheetEl.classList.add('entering'); setTimeout(() => sheetEl.classList.remove('entering'), 700); }
    requestAnimationFrame(() => { sheetEl.classList.add('open'); backdrop.classList.add('open'); });
    const first = sheetEl.querySelector('input');
    if (first && cfg.focus) setTimeout(() => first.focus(), 300);
    return { close: closeSheet, refresh: drawSheet };
  }
  const footerHTML = (c) => (typeof c.footer === 'function' ? c.footer() : c.footer) || '';
  function drawSheet() {
    const c = sheetState; if (!c) return;
    const scroll = sheetEl.querySelector('.sheet-body')?.scrollTop || 0;
    // remember the active tab so the indicator can slide from it
    const oldTabs = sheetEl.querySelector('.ch-picker');
    const oldActive = oldTabs?.querySelector('[aria-selected="true"]');
    const prevTab = oldActive ? { i: +oldActive.dataset.ch, scroll: oldTabs.scrollLeft, boxes: [...oldTabs.querySelectorAll('button')].map((b) => ({ x: b.offsetLeft, w: b.offsetWidth })) } : null;
    const x = c.closeBtn === false ? '' : `<button class="icon-btn sheet-x" data-action="sheet-close" aria-label="Close">${icon('close-circle')}</button>`;
    sheetEl.classList.toggle('sheet-full', !!c.full);
    // full: Figma "Edit" layout — close top-right, large title + description, pinned footer
    const sheetHTML = c.full
      ? `<div class="grabber"></div><div class="sheet-top">${x}</div>
        <div class="sheet-big-title">${esc(c.title)}</div>${c.sub ? `<div class="sheet-sub">${c.sub}</div>` : ''}
        <div class="sheet-body">${c.render ? c.render() : ''}</div>${footerHTML(c) ? `<div class="sheet-footer">${footerHTML(c)}</div>` : ''}`
      : `<div class="grabber"></div>
      <div class="sheet-head"><div class="sheet-title">${esc(c.title)}</div>${x}</div>
      ${c.sub ? `<div class="sheet-sub">${c.sub}</div>` : ''}
      ${c.tabs ? `<div class="sheet-tabs">${c.tabs()}</div>` : ''}
      <div class="sheet-body">${c.render ? c.render() : ''}</div>${footerHTML(c) ? `<div class="sheet-footer">${footerHTML(c)}</div>` : ''}`;
    const wasOpen = sheetEl.classList.contains('open');
    const h0 = wasOpen ? sheetEl.getBoundingClientRect().height : 0;
    patch(sheetEl, sheetHTML);
    // Content changed height (tab switch, timer → ring, toggle opening a row): glide instead of jumping
    if (wasOpen && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const h1 = sheetEl.getBoundingClientRect().height;
      if (Math.abs(h1 - h0) > 2) {
        sheetEl.getAnimations().forEach((a) => { if (a.id === 'sheet-h') a.cancel(); });
        const a = sheetEl.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 340, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' });
        a.id = 'sheet-h';
      }
    }
    sheetEl.querySelector('.sheet-body').scrollTop = scroll;
    placeTabs(prevTab);
    c.onMount && c.onMount(sheetEl);
  }
  /** Channel picker transition — compositor-only FLIP.
      The row jumps to its final layout at once (one layout, not one per frame). What you see moving is
      drawn with transform (buttons slide) and clip-path (the pill background grows/shrinks), so the
      motion stays smooth even while the blurred sheet is on screen. Width, colour and the name all
      share ONE duration and ONE curve, start on the same frame and land together. */
  const TAB_MS = 340, TAB_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';   // gentle start, soft landing: no jump, no crawl
  function placeTabs(prev) {
    const pick = sheetEl.querySelector('.ch-picker'); if (!pick) return;
    const btns = [...pick.querySelectorAll('button')];
    const active = pick.querySelector('[aria-selected="true"]'); if (!active) return;
    if (prev) pick.scrollLeft = prev.scroll;
    const changed = prev && prev.i !== +active.dataset.ch && prev.boxes.length === btns.length;
    if (changed && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const opt = { duration: TAB_MS, easing: TAB_EASE };
      btns.forEach((b, i) => {
        const { x: x0, w: w0 } = prev.boxes[i], x1 = b.offsetLeft, w1 = b.offsetWidth;
        b.getAnimations({ subtree: true }).forEach((a) => a.cancel());
        if (Math.abs(x0 - x1) > 0.5) b.animate([{ transform: `translateX(${x0 - x1}px)` }, { transform: 'none' }], opt);
        if (Math.abs(w0 - w1) > 0.5) {
          const pill = b.querySelector('.pill'), wm = Math.max(w0, w1);
          pill.style.width = wm + 'px';
          const an = pill.animate([{ clipPath: `inset(0 ${wm - w0}px 0 0 round 20px)` }, { clipPath: `inset(0 ${wm - w1}px 0 0 round 20px)` }], opt);
          an.onfinish = an.oncancel = () => { pill.style.width = ''; };
        }
      });
      const nm = active.querySelector('.nm');
      if (nm) nm.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: 0.2 }, { opacity: 1, offset: 1 }], opt);
    }
    // keep the active tab in view once it has its final size (scroll the row only, never the page)
    setTimeout(() => {
      const l = active.offsetLeft - 16, r = active.offsetLeft + active.offsetWidth + 16;
      if (l < pick.scrollLeft) pick.scrollTo({ left: l, behavior: 'smooth' });
      else if (r > pick.scrollLeft + pick.clientWidth) pick.scrollTo({ left: r - pick.clientWidth, behavior: 'smooth' });
    }, changed ? TAB_MS : 0);
  }

  function closeSheet() {
    if (!sheetState) return;
    const c = sheetState; sheetState = null;
    sheetEl.classList.remove('open'); backdrop.classList.remove('open');
    c.onClose && c.onClose();
  }
  on({ 'sheet-close': closeSheet });

  /** Confirm sheet (Figma: Delete confirm modal) */
  function confirm({ title, text, ok = 'Delete', cancel = 'Cancel', danger = true, onOk }) {
    on({ 'confirm-ok': () => { closeSheet(); onOk && onOk(); } });
    sheet({
      title, closeBtn: false, sub: esc(text),
      render: () => `<div class="sheet-actions">
        <button class="btn btn-secondary" data-action="sheet-close">${esc(cancel)}</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-ok">${esc(ok)}</button></div>`,
    });
  }

  /** Text input sheet (Figma: Rename) */
  function prompt({ title, label, value = '', okText = 'Save', onOk, validate }) {
    on({
      'prompt-ok': () => {
        const v = sheetEl.querySelector('#promptInput').value.trim();
        const err = validate ? validate(v) : (!v ? 'Name cannot be empty' : null);
        if (err) { sheetEl.querySelector('#promptErr').textContent = err; return; }
        closeSheet(); onOk(v);
      },
      'prompt-clear': () => { const i = sheetEl.querySelector('#promptInput'); i.value = ''; i.focus(); },
    });
    sheet({
      title, focus: true,
      render: () => `<label class="field"><span class="field-label">${esc(label)}</span>
          <input id="promptInput" value="${esc(value)}" maxlength="40" autocomplete="off">
          <button class="field-clear" data-action="prompt-clear" aria-label="Clear">${icon('close-circle', 'icon icon-sm')}</button></label>
        <div class="field-error" id="promptErr"></div>`,
      footer: `<button class="btn btn-primary btn-block" data-action="prompt-ok">${esc(okText)}</button>`,
      onMount: (el) => {
        const i = el.querySelector('#promptInput');
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') actions['prompt-ok'](); });
      },
    });
  }

  /* ---------- Popover ---------- */
  function popover(html, top = 110) {
    let pop = phone.querySelector('.popover');
    if (!pop) { pop = document.createElement('div'); pop.className = 'popover'; phone.appendChild(pop); }
    pop.style.top = top + 'px';
    pop.innerHTML = html;
    const bg = phone.querySelector('#popBg');
    const close = () => { pop.classList.remove('open'); bg.classList.remove('open'); };
    bg.onclick = close;
    pop.onclick = () => setTimeout(close, 0);
    requestAnimationFrame(() => { pop.classList.add('open'); bg.classList.add('open'); });
    return close;
  }

  /* ---------- Toast ---------- */
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.toggle('top', !!sheetState); // don't cover the open sheet
    toastEl.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  /* ---------- Push notification (simulated phone push from our server) ----------
     Slides in at the top of the phone like an iOS notification; tap or wait 4 s to dismiss. */
  let pushT;
  function push({ title, body = '', tone = '' }) {
    let el = phone.querySelector('.push');
    if (!el) { el = document.createElement('div'); el.className = 'push'; el.setAttribute('role', 'status'); el.onclick = () => el.classList.remove('show'); phone.appendChild(el); }
    el.innerHTML = `<span class="push-app">${icon('tab-home', 'icon', 'style="width:20px;height:20px"')}</span>
      <span class="push-txt"><span class="push-top"><span>SAMO HOME</span><span>now</span></span><b>${esc(title)}</b>${body ? `<span class="push-body">${esc(body)}</span>` : ''}</span>`;
    el.className = 'push' + (tone ? ' ' + tone : '');
    void el.offsetWidth; el.classList.add('show');
    clearTimeout(pushT); pushT = setTimeout(() => el.classList.remove('show'), 4000);
  }

  /** Channel tabs — Hamroh SegmentedControl. items: [label], active index, action name. */
  /** Channel picker: round numbered buttons; the selected one widens to show its name ("1 · Ceiling").
      Scales to 6 channels without truncating, no label needed. */
  const segTabs = (items, active, action) => `<div class="ch-picker" role="tablist" aria-label="Channel">${items.map((t, i) =>
    `<button role="tab" aria-selected="${i === active}" aria-label="Channel ${i + 1}: ${esc(t)}" data-action="${action}" data-ch="${i}"><i class="pill" aria-hidden="true"></i><b>${i + 1}</b><span class="nm">${esc(t)}</span></button>`).join('')}</div>`;

  /** Show a toast on the next page (after navigation). */
  const flash = (msg) => SafeStorage.session.setItem('samo-flash', msg);

  /* ---------- Helpers ---------- */
  const fmtDur = (s) => {
    s = Math.max(0, Math.round(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
  };
  const fmtTime = (t) => { const d = new Date(t); return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

  /* ---------- Timer sheet (relay + light) ----------
     The five most used countdowns + Custom: an iOS-style hours / minutes wheel (up to 23 h 59 min — the device
     limit is 24 h). A running timer shows the ring countdown.
     cfg: { sub, tabs?, running(): timer | null, start(sec) → toast text, cancel(), lastCustom(), saveCustom(sec), extra?: actions } */
  const TM_PRE = [[300, '5', 'min'], [900, '15', 'min'], [1800, '30', 'min'], [3600, '1', 'hour'], [7200, '2', 'hours']];
  const TW_ROW = 40;   // wheel row height
  function timerSheet(cfg) {
    const R = 84, LEN = 2 * Math.PI * R;
    const ring = (t) => { const left = Math.max(0, (t.end - Date.now()) / 1000); return { left, off: LEN * (1 - left / (t.total || left || 1)) }; };
    const last = cfg.lastCustom() || 2700;   // first time: 45 min
    const st = { custom: false, h: Math.floor(last / 3600), m: Math.floor((last % 3600) / 60) };
    const secs = () => st.h * 3600 + st.m * 60;
    const endsAt = () => `Turns off at ${fmtTime(Date.now() + secs() * 1000)}`;
    const wheel = (k, max, v, unit) => `<div class="tw-col"><div class="tw-wheel" data-wheel="${k}" tabindex="0" role="spinbutton" aria-label="${unit}" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${v}">${
      Array.from({ length: max + 1 }, (_, n) => `<span data-v="${n}" class="${n === v ? 'on' : ''}">${n}</span>`).join('')}</div><span class="tw-unit">${unit}</span></div>`;
    const s = sheet({
      title: 'Timer', sub: cfg.sub, tabs: cfg.tabs,
      render: () => {
        const t = cfg.running();
        if (t) { const r = ring(t); return `<div class="ring-timer"><svg viewBox="0 0 196 196"><circle class="track" cx="98" cy="98" r="${R}" fill="none" stroke-width="8"/><circle class="prog" data-live="ring" cx="98" cy="98" r="${R}" fill="none" stroke-width="8" stroke-dasharray="${LEN}" stroke-dashoffset="${r.off}"/></svg><div class="t"><b data-num data-live="tm">${fmtDur(r.left)}</b><span>until off</span></div></div>`; }
        if (st.custom) return `<div class="pad"><div class="tw">${wheel('h', 23, st.h, 'hours')}${wheel('m', 59, st.m, 'min')}</div><p class="tw-end" data-live="tw-end">${endsAt()}</p></div>`;
        return `<div class="pad preset-grid">${TM_PRE.map(([sec, n, u]) => `<button data-action="tm-set" data-s="${sec}"><b>${n}</b><span>${u}</span></button>`).join('')}
          <button data-action="tm-custom" aria-label="Custom time">${icon('pen', 'icon', 'style="width:24px;height:24px"')}<span>Custom</span></button></div>`;
      },
      footer: () => (cfg.running() ? '<button class="btn btn-secondary btn-block" data-action="tm-cancel">Cancel timer</button>'
        : st.custom ? `<div class="tw-btns"><button class="btn btn-secondary" data-action="tm-back">Back</button><button class="btn btn-primary" data-action="tm-go" ${secs() ? '' : 'disabled'}>Start</button></div>` : ''),
      onClose: () => { clearInterval(iv); document.removeEventListener('scroll', onScroll, true); },
    });
    // wheels: the row under the centre band is the value (scroll-snap does the settling)
    const place = () => document.querySelectorAll('.tw-wheel').forEach((w) => { w.scrollTop = st[w.dataset.wheel] * TW_ROW; });
    function onScroll(e) {
      const w = e.target; if (!w.classList || !w.classList.contains('tw-wheel')) return;
      const k = w.dataset.wheel, v = Math.max(0, Math.min(w.children.length - 1, Math.round(w.scrollTop / TW_ROW)));
      if (v === st[k]) return;
      st[k] = v; w.setAttribute('aria-valuenow', v);
      w.querySelector('.on')?.classList.remove('on'); w.children[v].classList.add('on');
      const end = document.querySelector('[data-live="tw-end"]'); if (end) end.textContent = endsAt();
      const go = document.querySelector('[data-action="tm-go"]'); if (go) go.disabled = !secs();
    }
    document.addEventListener('scroll', onScroll, true);
    const iv = setInterval(() => {
      const t = cfg.running(), e = document.querySelector('[data-live="tm"]');
      if (e && t) { const r = ring(t); setNum(e, fmtDur(r.left)); document.querySelector('[data-live="ring"]')?.setAttribute('stroke-dashoffset', r.off); }
      else if (e) s.refresh();
      else if (st.custom) { const end = document.querySelector('[data-live="tw-end"]'); if (end) end.textContent = endsAt(); }   // the clock moves on
    }, 1000);
    const start = (sec) => { const m = cfg.start(sec); st.custom = false; s.refresh(); toast(m); };
    on({
      'tm-set': ({ s: sec }) => start(+sec),
      'tm-custom': () => { st.custom = true; s.refresh(); place(); },
      'tm-back': () => { st.custom = false; s.refresh(); },
      'tm-go': () => { if (!secs()) return; cfg.saveCustom(secs()); start(secs()); },
      'tm-cancel': () => { cfg.cancel(); s.refresh(); toast('Timer cancelled'); },
      ...(cfg.extra ? cfg.extra(s) : {}),
    });
    return s;
  }
  /* wheel: tap a number to move it to the centre; arrow keys step by one */
  document.addEventListener('click', (e) => { const n = e.target.closest && e.target.closest('.tw-wheel span'); if (n && !n.parentElement._dragged) n.parentElement.scrollTo({ top: +n.dataset.v * TW_ROW, behavior: 'smooth' }); });
  document.addEventListener('keydown', (e) => {
    const w = e.target.closest && e.target.closest('.tw-wheel'); if (!w || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault(); w.scrollBy({ top: e.key === 'ArrowDown' ? TW_ROW : -TW_ROW, behavior: 'smooth' });
  });
  /* mouse drag (a finger scrolls the wheel natively; a mouse doesn't): follow the pointer 1:1 with snapping off,
     then on release carry on a little with the drag's speed and settle on the nearest number */
  document.addEventListener('pointerdown', (e) => {
    const w = e.target.closest && e.target.closest('.tw-wheel'); if (!w || e.pointerType !== 'mouse' || e.button !== 0) return;
    e.preventDefault(); w.setPointerCapture(e.pointerId); w.classList.add('drag'); w._dragged = false;
    const y0 = e.clientY, top0 = w.scrollTop; let pts = [[e.timeStamp, e.clientY]];
    const move = (ev) => { if (Math.abs(ev.clientY - y0) > 3) w._dragged = true; w.scrollTop = top0 - (ev.clientY - y0); pts.push([ev.timeStamp, ev.clientY]); pts = pts.filter((q) => ev.timeStamp - q[0] < 100); };
    const up = (ev) => {
      w.removeEventListener('pointermove', move); w.removeEventListener('pointerup', up); w.removeEventListener('pointercancel', up);
      const [t1, y1] = pts[0], v = ev.timeStamp > t1 ? (ev.clientY - y1) / (ev.timeStamp - t1) : 0;   // px per ms
      const n = Math.max(0, Math.min(w.children.length - 1, Math.round((w.scrollTop - v * 160) / TW_ROW)));
      w.classList.remove('drag'); w.scrollTo({ top: n * TW_ROW, behavior: 'smooth' });
      setTimeout(() => { w._dragged = false; }, 0);
    };
    w.addEventListener('pointermove', move); w.addEventListener('pointerup', up); w.addEventListener('pointercancel', up);
  });

  /** Re-run fn every second (timers, countdowns). */
  const tick = (fn) => setInterval(fn, 1000);

  return { esc, param, go, flash, segTabs, patch, setNum, pulse, collapse, group, mount, on, toolbar, sheet, closeSheet, confirm, prompt, popover, toast, push, fmtDur, fmtTime, tick, timerSheet, get screen() { return screen; }, get phone() { return phone; }, get sheetOpen() { return !!sheetState; } };
})();
