// Lets the puppeteer-style checks run on Playwright WebKit (Safari's engine)
const { webkit } = require('playwright');
module.exports = {
  launch: async () => {
    const b = await webkit.launch();
    return {
      newPage: async () => {
        const ctx = await b.newContext({ deviceScaleFactor: 2, viewport: { width: 1200, height: 900 } });
        const pg = await ctx.newPage();
        pg.setViewport = (v) => pg.setViewportSize({ width: v.width, height: v.height });
        return pg;
      },
      close: () => b.close(),
    };
  },
};
