/* ==========================================================================
   Kit — shared building blocks for device modules (wave 2: presence, energy meter, vibration, door lock,
   gas & CO, air quality, IR remote, valve). The look and rules are the same as the hand-built devices:
   - device page: banners (only for something the big word does not say) → the mark / control → the big word
     with one line under it → actions → info cards → rows
   - settings: a section per spec group; "fields" settings open one sheet with switches, choices and steppers
   - prototype panel: the real device (preset), what it supports, and buttons that play the real world
   ========================================================================== */
const Kit = (() => {
  const esc = UI.esc;
  const clone = (x) => (typeof x === 'object' && x !== null ? JSON.parse(JSON.stringify(x)) : x);

  /* ---------- Text ---------- */
  const startOfDay = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t.getTime(); };
  const when = (t) => (!t ? '—' : t >= startOfDay() ? UI.fmtTime(t) : t >= startOfDay() - 86400000 ? 'yesterday ' + UI.fmtTime(t) : new Date(t).toLocaleDateString('en', { day: 'numeric', month: 'short' }));
  const ago = (ms) => { const m = Math.floor(ms / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`; };
  const dur = (s) => (s < 60 ? `${Math.round(s)} s` : s < 3600 ? `${Math.round(s / 60)} min` : `${+(s / 3600).toFixed(s % 3600 ? 1 : 0)} h`);
  const room = (d) => Store.roomName(d.roomId);

  /* ---------- Model ---------- */
  const has = (d, k) => d.features.includes(k);
  function applyDefaults(F, d) { for (const k in F) { const def = F[k].def; if (def !== undefined && d.settings[k] === undefined) d.settings[k] = clone(def); else if (def && typeof def === 'object' && !Array.isArray(def) && typeof d.settings[k] === 'object') for (const x in def) if (d.settings[k][x] === undefined) d.settings[k][x] = clone(def[x]); } }
  const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase()).join(':');
  /** Common device fields (the module adds st / phys / its own). */
  function base(type, p, { name, roomId } = {}, extra = {}) {
    const now = Date.now();
    return Object.assign({
      id: Store.uid('d'), type, preset: p.id, name: name || p.name, roomId: roomId || null,
      model: p.model, manufacturer: p.manufacturer, originalName: p.name, protocol: 'Zigbee 3.0',
      serial: 'SN' + Math.random().toString().slice(2, 14), mac: hex(8), firmware: '1.0.8_0012',
      online: true, showOnHome: true, isNew: true, createdAt: now,
      features: p.feats.slice(), settings: {}, battery: 88, log: [], sim: {},
    }, extra);
  }
  function logEv(d, k, extra) { d.log.unshift(Object.assign({ t: Date.now(), k }, extra || {})); d.log.length = Math.min(d.log.length, 80); }
  function push(title, body = '', tone = '') { Store.state.notifications = (Store.state.notifications || 0) + 1; UI.push({ title, body, tone }); }

  /* ---------- Device page pieces ---------- */
  /** The icon inside the sensor mark: Figma “Sensors/*” icons are a disc with the glyph cut out — they fill the 80 px
      space. Plain glyphs (air, lock, a TV…) would touch the ring at that size, so they sit at 48 px. */
  const DISC = new Set(['dev-drop', 'dev-smoke', 'dev-flame', 'dev-temperature', 'dev-robot']);
  const markIcon = (name) => { const s = DISC.has(name) ? 80 : 48; return icon(name, 'icon', `style="width:${s}px;height:${s}px"`); };
  const banner = (key, tone, ic, html, close) => `<div class="pad cw-gap" data-key="${key}"><div class="banner ${tone}">${icon(ic)}<div>${html}</div>${close ? `<button class="ban-x" data-action="${close}" aria-label="Close">${icon('cross')}</button>` : ''}</div></div>`;
  /** The sensor mark (Figma 6631:50597 style): 100 px fills/quaternary ring, 80 px icon. state: calm | on | warn | alarm. */
  const mark = (d, ic, state, label, extra = '') => `<div class="pad" data-key="scene"><div class="lk-mark ${state === 'alarm' ? 'is-alarm' : state === 'warn' ? 'is-warn' : state === 'mid' ? 'is-mid' : state === 'on' ? 'is-on' : ''} ${!d.online ? 'is-off' : ''}" data-cl="scene" role="img" aria-label="${esc(label)}"><i class="lk-halo"></i><span class="lk-disc">${markIcon(d.userIcon || ic)}</span>${extra}</div></div>`;
  /** The big word (white = neutral, open = orange, alarm = red, on = blue) with one line under it, and a hint on the right. */
  const readout = (word, tone, sub, hint) => `<div class="cw-readout ct-readout" data-key="readout"><div><div class="ct-word ${tone || 'closed'}" data-cl="word" data-swap>${esc(word)}</div>
      <div class="cw-state" data-num data-live="sub">${esc(sub)}</div></div>${hint ? `<span class="cw-hint">${esc(hint)}</span>` : ''}</div>`;
  /** Info cards: [label, value, { wide, icon, count, key }] — an odd last card goes wide. */
  function cards(list, key = 'info', top = 24) {
    const L = list.filter(Boolean); if (!L.length) return '';
    const n = L.filter((c) => !(c[2] || {}).wide).length;
    let small = 0;
    const html = L.map((c) => { const o = c[2] || {}; let wide = o.wide; if (!wide) { small++; if (small === n && n % 2) wide = true; }
      return `<div class="info-card${wide ? ' wide' : ''}${o.cls ? ' ' + o.cls : ''}"${o.key ? ` data-key="${o.key}"` : ''}><span>${esc(c[0])}</span><b${o.count ? ' data-num="count"' : ' data-num'}>${esc(c[1])}</b>${o.icon ? icon(o.icon) : ''}${o.html || ''}</div>`; }).join('');
    return `<div class="pad info-grid" data-key="${key}" style="margin-top:${top}px">${html}</div>`;
  }
  /** A bar inside a wide card: value 0..1 with optional marks (0..1). */
  const bar = (v, tone, marks = []) => `<div class="sm-bar ${tone || ''}"><i style="width:${(Math.max(0, Math.min(1, v)) * 100).toFixed(1)}%"></i>${marks.map((m) => `<b style="left:${(m * 100).toFixed(1)}%"></b>`).join('')}</div>`;
  /** One action row on the device page (chevron). */
  const actionRow = (key, act, title, sub, dis) => `<div class="list" data-key="${key}" style="margin-top:24px"><button class="cell" data-action="${act}" ${dis ? 'aria-disabled="true"' : ''}><span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button></div>`;

  /** Several action rows in one group: [[act, title, sub, disabled], …] */
  const actionRows = (key, rows) => { const R = rows.filter(Boolean); return R.length ? `<div class="list" data-key="${key}" style="margin-top:24px">${R.map(([act, title, sub, dis]) => `<button class="cell" data-action="${act}" ${dis ? 'aria-disabled="true"' : ''}><span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>${icon('chevron-right', 'chev')}</button>`).join('')}</div>` : ''; };

  /* ---------- Settings rows ---------- */
  const row = (act, k, title, value) => `<button class="cell" data-action="${act}" data-k="${k}"><span class="cell-main cell-title">${esc(title)}</span>${value ? `<span class="cell-value">${esc(value)}</span>` : ''}${icon('chevron-right', 'chev')}</button>`;
  const sw = (act, n, title, sub, on, dis) => `<button class="cell" data-action="${act}" data-n="${n}" role="switch" aria-checked="${!!on}" ${dis ? 'aria-disabled="true"' : ''}>
      <span class="cell-main"><span class="cell-title" style="display:block">${esc(title)}</span>${sub ? `<span class="cell-sub" style="display:block">${esc(sub)}</span>` : ''}</span>
      <span class="switch" aria-hidden="true" aria-checked="${!!on}"></span></button>`;
  const radio = (act, cur, opts, n = '') => opts.map((o) => `<button class="option" role="radio" aria-checked="${String(cur) === String(o[0])}" data-action="${act}" data-v="${esc(o[0])}"${n ? ` data-n="${n}"` : ''}>
      <span class="option-main"><span class="option-title" style="display:block">${esc(o[1])}</span>${o[2] ? `<span class="option-sub" style="display:block">${esc(o[2])}</span>` : ''}</span><span class="radio">${icon('radio-on')}</span></button>`).join('');
  const stepper = (act, n, text, lo, hi) => `<div class="stepper"><button data-action="${act}" data-n="${n}" data-d="-1" aria-label="Less" ${lo ? 'disabled' : ''}>−</button><output data-num>${esc(text)}</output><button data-action="${act}" data-n="${n}" data-d="1" aria-label="More" ${hi ? 'disabled' : ''}>+</button></div>`;

  /* ---------- Generic editor for spec "fields" (switches, choices, numbers) ---------- */
  const fmtNum = (f, v) => (f.unit === 's' ? dur(v) : f.unit === 'min' && v >= 60 ? dur(v * 60) : `${v}${f.unit ? (f.unit === '%' ? ' %' : ' ' + f.unit) : ''}`);
  function stepOf(f, v, dir) {
    if (f.step) return f.step;
    if (f.unit === 's') return (dir > 0 ? v : v - 1) < 60 ? 5 : (dir > 0 ? v : v - 1) < 600 ? 30 : (dir > 0 ? v : v - 1) < 3600 ? 300 : 1800;
    const r = f.max - f.min; return r <= 30 ? 1 : r <= 150 ? 5 : r <= 600 ? 10 : r <= 3000 ? 50 : r <= 12000 ? 100 : 500;
  }
  function fieldsHTML(fields, v, act) {
    const master = fields.find((f) => f.kind === 'tog' && f.noSum);
    const on = !master || v[master.id];
    const toggles = fields.filter((f) => f.kind === 'tog' && f !== master), nums = fields.filter((f) => !f.kind), sels = fields.filter((f) => f.kind === 'sel');
    let rest = '';
    if (toggles.length || nums.length) rest += `<div class="list">${toggles.map((f) => sw(act + '-tog', f.id, f.label, f.hint, v[f.id])).join('')}${nums.map((f) => `<div class="cell"><span class="cell-main"><span class="cell-title" style="display:block">${esc(f.label)}</span>${f.hint ? `<span class="cell-sub" style="display:block">${esc(f.hint)}</span>` : ''}</span>${stepper(act + '-num', f.id, fmtNum(f, v[f.id]), v[f.id] <= f.min, v[f.id] >= f.max)}</div>`).join('')}</div>`;
    rest += sels.map((f) => UI.group(f.label, radio(act + '-sel', v[f.id], f.opts, f.id))).join('');
    return (master ? `<div class="list">${sw(act + '-tog', master.id, master.label, master.hint, v[master.id])}</div>` + UI.collapse(on, `<div style="height:24px"></div>${rest}`) : rest);
  }
  function bindFields(fields, getV, act, commit) {
    const F = (id) => fields.find((f) => f.id === id);
    UI.on({
      [act + '-tog']: ({ n }) => { const v = getV(); v[n] = !v[n]; commit(); },
      [act + '-sel']: ({ n, v: val }) => { getV()[n] = val; commit(); },
      [act + '-num']: ({ n, d: dir }) => { const f = F(n), v = getV(), s = stepOf(f, v[n], +dir); v[n] = Math.max(f.min, Math.min(f.max, Math.round((v[n] + s * +dir) / s) * s)); if (f.step && f.step < 1) v[n] = +v[n].toFixed(1); commit(); },
    });
  }
  function fieldsSummary(fields, v) {
    const master = fields.find((f) => f.kind === 'tog' && f.noSum);
    if (master && !v[master.id]) return 'Off';
    const nums = fields.filter((f) => !f.kind).slice(0, 2).map((f) => fmtNum(f, v[f.id]));
    if (nums.length) return nums.join(' · ');
    const t = fields.filter((f) => f.kind === 'tog' && f !== master); if (t.length) { const n = t.filter((f) => v[f.id]).length; return n ? `${n} on` : 'Off'; }
    const s = fields.find((f) => f.kind === 'sel'); return s ? (s.opts.find((o) => o[0] === v[s.id]) || [])[1] : '';
  }

  /* ---------- Feature sheets & settings page (built from the spec) ---------- */
  function summary(F, d, k) {
    const f = F[k], v = d.settings[k];
    if (f.summary) return f.summary(d, v);
    if (f.type === 'choice') return ((f.opts.find((o) => String(o[0]) === String(v)) || [])[1]) || '';
    if (f.type === 'number') return fmtNum(f, v);
    if (f.type === 'fields') return fieldsSummary(f.fields, v);
    return '';
  }
  function openFeature(F, d, k, ctx) {
    const f = F[k];
    const s = UI.sheet({
      title: f.name, sub: esc(f.long || f.short),
      render: () => {
        const v = d.settings[k];
        if (f.sheet) return f.sheet(d, v);
        if (f.type === 'choice') return `<div class="list">${radio('kt-opt', v, f.opts)}</div>${f.foot ? `<div class="list-footer">${esc(f.foot)}</div>` : ''}`;
        if (f.type === 'number') return `<div class="list"><div class="cell"><span class="cell-main cell-title">${esc(f.label || f.name)}</span>${stepper('kt-n', 'v', fmtNum(f, v), v <= f.min, v >= f.max)}</div></div>${f.foot ? `<div class="list-footer">${esc(f.foot)}</div>` : ''}`;
        if (f.type === 'fields') return fieldsHTML(f.fields, v, 'kt-f') + (f.foot ? `<div class="list-footer">${esc(f.foot)}</div>` : '');
        return '';
      },
    });
    const commit = () => { Store.save(); ctx.render(); s.refresh(); };
    UI.on({
      'kt-opt': ({ v }) => { d.settings[k] = isNaN(+v) || typeof f.def !== 'number' ? v : +v; commit(); if (f.after) f.after(d); },
      'kt-n': ({ d: dir }) => { const v = d.settings[k], st = stepOf(f, v, +dir); d.settings[k] = Math.max(f.min, Math.min(f.max, Math.round((v + st * +dir) / st) * st)); commit(); },
    });
    if (f.type === 'fields') bindFields(f.fields, () => d.settings[k], 'kt-f', commit);
    if (f.bindSheet) f.bindSheet(d, commit, s);
  }
  /** Settings page sections from the spec groups. Device page / Log groups are skipped (they live on the page / in
      Event History). opts.extra[group] = extra rows (html) at the end of that section; opts.foot[group] = footer. */
  function settingsHTML(F, groups, d, opts = {}) {
    let h = '';
    groups.filter((g) => !['Device page', 'Log'].includes(g)).forEach((g) => {
      const rows = Object.keys(F).filter((k) => F[k].grp === g && has(d, k) && !F[k].hidden && k !== 'identify').map((k) => {   // identify: the page adds “Find this device” at the bottom — don't list it twice
        const f = F[k];
        if (f.row) return f.row(d);
        if (f.type === 'toggle') return sw('kt-sw', k, f.name, f.short, d.settings[k]);
        if (f.type === 'action') return `<button class="cell" data-action="kt-act" data-k="${k}"><span class="cell-main"><span class="cell-title" style="display:block">${esc(f.name)}</span><span class="cell-sub" style="display:block">${esc(f.short)}</span></span>${icon('chevron-right', 'chev')}</button>`;
        if (['choice', 'number', 'fields'].includes(f.type) || f.sheet) return row('kt-feature', k, f.name, summary(F, d, k));
        return '';
      }).filter(Boolean);
      const extra = (opts.extra || {})[g] || '';
      if (rows.length || extra) h += `<div class="list-header">${esc(g)}</div><div class="list">${rows.join('')}${extra}</div>${(opts.foot || {})[g] ? `<div class="list-footer">${esc(opts.foot[g])}</div>` : ''}`;
    });
    return h;
  }
  function bindSettings(F, d, ctx, actions = {}) {
    UI.on({
      'kt-feature': ({ k }) => openFeature(F, d, k, ctx),
      'kt-sw': ({ n }) => { d.settings[n] = !d.settings[n]; Store.save(); ctx.render(); if (F[n].after) F[n].after(d); },
      'kt-act': ({ k }) => (actions[k] ? actions[k]() : UI.toast(F[k].done || 'Done')),
    });
  }

  /* ---------- Day-strip legend: the coloured dot names the state, the white dot is “now” (user, 2026-11-12) ---------- */
  const stripLegend = (word) => `<div class="ct-legend"><span><i></i>${esc(word)}</span><span><i class="now"></i>Now</span></div>`;

  /* ---------- Event History ---------- */
  function historySheet(d, EV, sub, chart) {
    UI.sheet({
      title: 'Event History',   // no sub-line under the title on log sheets (user, 2026-11-12)
      render: () => {
        const rows = d.log.slice(0, 30).map((e) => `<div class="cell"><span class="cell-main cell-title">${esc(e.text || (typeof EV[e.k] === 'function' ? EV[e.k](e) : EV[e.k]) || e.k)}</span><span class="cell-value">${when(e.t)}</span></div>`).join('');
        return (chart ? chart() : '') + UI.group('', rows || '<div class="cell"><span class="cell-main cell-sub">Nothing yet</span></div>') + '<div class="list-footer">Stored by our server — the device keeps no history.</div>';
      },
    });
  }

  /* ---------- Prototype panel ---------- */
  function protoHead(title, spec, PRESETS, d, note = 'Change what this device supports and play the real world.') {
    return `<div class="pp-title">${esc(title)}</div>
      <p class="pp-note">Not part of the app. ${esc(note)} Spec: <a href="../Device%20Interface%203/${encodeURIComponent(spec)}" target="_blank">${esc(spec.replace(/^\d+\.\s*/, '').replace('.html', ''))}</a></p>
      <h3>Real device</h3><select data-pp="preset">${PRESETS.map((p) => `<option value="${p.id}" ${p.id === d.preset ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>`;
  }
  function protoFeatures(F, groups, d) {
    return `<h3>Features this device has</h3>${groups.map((g) => { const ks = Object.keys(F).filter((k) => F[k].grp === g); return ks.length ? `<div class="pp-group">${esc(g)}</div>${ks.map((k) => `<label class="pp-chk"><input type="checkbox" data-pp="feat" value="${k}" ${has(d, k) ? 'checked' : ''}> ${esc(F[k].name)}${F[k].app ? ' <small style="opacity:.6">(our app)</small>' : ''}</label>`).join('')}` : ''; }).join('')}
      <h3>Data</h3><button class="pp-btn" data-action="pp-reset">Reset all prototype data</button>`;
  }
  /** Preset + feature checkboxes + reset. onPreset(d, p) lets the module rebuild channels etc. */
  function bindProto(F, PRESETS, d, ctx, handlers, onPreset, evaluate) {
    const panel = document.getElementById('protoPanel'); if (!panel) return;
    const commit = (msg) => { if (evaluate) evaluate(d); Store.save(); ctx.render(); if (msg) UI.toast(msg); };
    panel.onchange = (e) => {
      const t = e.target;
      if (t.dataset.pp === 'preset') {
        const p = PRESETS.find((x) => x.id === t.value);
        Object.assign(d, { preset: p.id, model: p.model, manufacturer: p.manufacturer, originalName: p.name, features: p.feats.slice(), settings: {} });
        applyDefaults(F, d); if (p.v) Object.assign(d.settings, clone(p.v)); if (onPreset) onPreset(d, p);
      }
      if (t.dataset.pp === 'feat') { if (t.checked) d.features.push(t.value); else d.features = d.features.filter((k) => k !== t.value); applyDefaults(F, d); }
      commit();
    };
    const wrapped = {}; for (const k in handlers) wrapped[k] = (a) => { const msg = handlers[k](a); commit(typeof msg === 'string' ? msg : ''); };
    UI.on(Object.assign(wrapped, { 'pp-reset': () => { Store.reset(); location.href = 'index.html'; } }));
  }
  const ppBtn = (act, label, on = true) => (on ? `<button class="pp-btn" data-action="${act}">${label}</button>` : '');

  return { markIcon, esc, clone, when, ago, dur, room, has, applyDefaults, base, logEv, push, banner, mark, readout, cards, bar, actionRow, actionRows, row, sw, radio, stepper, fmtNum, fieldsHTML, bindFields, fieldsSummary, summary, openFeature, settingsHTML, bindSettings, historySheet, stripLegend, protoHead, protoFeatures, bindProto, ppBtn };
})();
