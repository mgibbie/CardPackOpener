const puppeteer = require('puppeteer-core');
const fs = require('fs');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
(async () => {
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new',
    args: ['--enable-unsafe-swiftshader'], defaultViewport: { width: 1000, height: 760 } });
  const page = await browser.newPage();
  const probe = async (map, x0, y0, w, h) => {
    await page.goto('http://localhost:8766/overworld/?map=' + map + '&x=' + x0 + '&y=' + y0, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2500));
    await page.evaluate(() => { if (!window.__ow.party) window.__ow.menuTap('starter:0:0'); });
    await new Promise(r => setTimeout(r, 1500));
    return page.evaluate(([x0, y0, w, h]) => {
      const wd = window.__ow.world;
      const COLL = 0x0C00;
      const rows = [];
      for (let y = y0; y < y0 + h; y++) {
        const line = [];
        for (let x = x0; x < x0 + w; x++) {
          const v = wd.gridAt(x, y);
          const b = wd.behaviorAt(x, y);
          line.push(`${b.toString(16)}/${(v & COLL) ? 'C' : '.'}`);
        }
        rows.push(line.join(' '));
      }
      return rows;
    }, [x0, y0, w, h]);
  };
  console.log('PALLET y16-19 x11-15:');
  console.log((await probe('PalletTown', 12, 10, 0, 0), await page.evaluate(([x0,y0,w,h]) => {
    const wd = window.__ow.world; const COLL=0x0C00; const rows=[];
    for (let y=16;y<20;y++){const l=[];for(let x=11;x<16;x++){const v=wd.gridAt(x,y);l.push(`${wd.behaviorAt(x,y).toString(16)}/${(v&COLL)?'C':'.'}`);}rows.push(l.join(' '));}
    return rows;
  }, [])).join('\n'));
  console.log('\nROUTE1 y29-33 x8-12:');
  await page.goto('http://localhost:8766/overworld/?map=Route1&x=10&y=20', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 2500));
  console.log(await page.evaluate(() => {
    const wd = window.__ow.world; const COLL=0x0C00; const rows=[];
    for (let y=29;y<34;y++){const l=[];for(let x=8;x<13;x++){const v=wd.gridAt(x,y);l.push(`${wd.behaviorAt(x,y).toString(16)}/${(v&COLL)?'C':'.'}`);}rows.push(l.join(' '));}
    return rows.join('\n');
  }));
  // where does the player actually spawn on Route1?
  console.log('spawn:', await page.evaluate(() => [window.__ow.player.tx, window.__ow.player.ty, window.__ow.world.behaviorAt(window.__ow.player.tx, window.__ow.player.ty).toString(16)]));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
