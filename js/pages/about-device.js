/* About device — Figma: "Об устройстве" (5433:47689) */
(() => {
  UI.mount({ variant: 'base' });
  const d = Store.device(UI.param('id'));
  if (!d) { UI.go('index.html'); return; }
  const hub = Store.state.devices.find((x) => x.type === 'hub');

  const rows = [
    ['Manufacturer', d.manufacturer],
    ['Original name', d.originalName || d.name],
    ['Model', d.model],
    ['Connection protocol', d.protocol],
    ...DeviceAPI(d).about(),
    ['Serial number (S/N)', d.serial, true],
    ['MAC address', d.mac, true],
    ['Device ID', d.id.toUpperCase(), true],
    ['Firmware version', d.firmware, true],
  ].filter((r) => r[1]);

  let h = UI.toolbar({ title: 'About device', desc: 'Model, connection and identifiers.', back: `device-settings.html?id=${d.id}`, plain: true, large: true });
  if (hub && d.type !== 'hub') {
    h += `<a class="list" style="display:block;margin-bottom:16px" href="device.html?id=${hub.id}"><span class="cell has-icon"><span class="cell-icon">${icon('dev-hub')}</span>
      <span class="cell-main"><span class="cell-sub" style="display:block;margin:0">Connected via (Gateway)</span><span class="t-lg-accent" style="display:block">${UI.esc(hub.name)}</span></span>${icon('chevron-right', 'chev')}</span></a>`;
  }
  h += rows.map(([k, v, copy]) => `<div class="info-row"><div class="grow"><div class="k">${UI.esc(k)}</div><div class="v">${UI.esc(v)}</div></div>
    ${copy ? `<button class="icon-btn c-secondary" data-action="copy" data-v="${UI.esc(v)}" aria-label="Copy ${UI.esc(k)}">${icon('copy', 'icon icon-sm')}</button>` : ''}</div>`).join('');
  UI.screen.innerHTML = h + '<div style="height:24px"></div>';

  UI.on({ copy: ({ v }) => { navigator.clipboard?.writeText(v); UI.toast('Copied'); } });
})();
