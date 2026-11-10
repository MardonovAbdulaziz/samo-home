/* Device view — Figma: "4. Devices / switch plug" (5433:46542), "light control" */
(() => {
  const d = Store.device(UI.param('id'));
  UI.mount({ variant: 'ambient', panel: !!(d && Devices[d.type] && Devices[d.type].protoPanel) });

  if (!d) {
    UI.screen.innerHTML = UI.toolbar({ title: '' }) + `<div class="hero"><h1>Device not found</h1><p>It may have been deleted.</p></div>
      <div class="pad"><a class="btn btn-primary btn-block" href="index.html">Go to home</a></div>`;
    return;
  }
  if (d.isNew) { d.isNew = false; Store.save(); }
  const api = DeviceAPI(d);

  const ctx = {
    render() {
      const sub = Store.roomName(d.roomId) + (d.online === false ? ' · Offline' : '');
      UI.patch(UI.screen, UI.toolbar({
        title: d.name, subtitle: sub, back: 'index.html',
        right: `<a class="glass-btn" href="device-settings.html?id=${d.id}" aria-label="Settings"><img class="icon" src="assets/icons/setting.svg" width="24" height="24" alt=""></a>`,
      }) + api.page(ctx));
      const panel = document.getElementById('protoPanel');
      if (panel) UI.patch(panel, api.protoPanel(ctx));
      if (Devices[d.type].afterRender) Devices[d.type].afterRender(d, UI.screen);
    },
  };
  api.bindPage(ctx);
  api.bindProto(ctx);
  ctx.render();

  startDeviceClock((changed) => {
    if (changed) ctx.render(); // patch() only touches the screen, so it is safe while a sheet is open
    else if (Devices[d.type].live) Devices[d.type].live(d, UI.screen);
  });
})();
