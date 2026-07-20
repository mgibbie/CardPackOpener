const puppeteer = require('puppeteer-core');
const fs = require('fs');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--enable-unsafe-swiftshader'], defaultViewport: { width: 1000, height: 760 } });
  const page = await browser.newPage();
  await page.goto('http://localhost:8766/overworld/?map=Route1&x=10&y=30', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2500));
  await page.evaluate(() => { if (!window.__ow.party) window.__ow.menuTap('starter:0:0'); });
  await new Promise(r => setTimeout(r, 1500));
  console.log('at spawn 10,30 can walk each dir:', await page.evaluate(() => {
    const w = window.__ow.world, p = window.__ow.player;
    const dirs = {down:[0,1],up:[0,-1],left:[-1,0],right:[1,0]};
    const out = {};
    for (const [d,[dx,dy]] of Object.entries(dirs)) {
      const nx=p.tx+dx, ny=p.ty+dy;
      out[d] = `b${w.behaviorAt(nx,ny).toString(16)} pass${w.isPassable(nx,ny)?1:0} surf${w.isSurfable(nx,ny)?1:0}`;
    }
    return out;
  }));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
