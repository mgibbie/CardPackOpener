// Portrait replay: a real ten-ante run must expose and seek to later antes.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const chrome = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(fs.existsSync);
globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
const { playRun } = await import(pathToFileURL(path.join(root, 'micatro/tests/replay_bot.mjs')));
const RP = await import(pathToFileURL(path.join(root, 'micatro/js/replays.js')));
const { Session } = await import(pathToFileURL(path.join(root, 'micatro/js/engine/session.js')));
const run = playRun({ seed: 'MOBILE2', back: 'b_blue', stake: 1, customDeck: { name: 'Easy', params: { blind_scaling: 0.01, win_ante: 50 } } }, { seed: 2, endless: true, maxSteps: 1200 });
const scan = Session.stepper(run.recipe).scan();
const ante8 = scan.antes.find(a => a.ante === 8);
if (!ante8) throw new Error('fixture does not reach ante 8');
const code = await RP.packRecipe(run.recipe);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = http.createServer(async (req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u === '/api/mp') {
    let raw = ''; for await (const c of req) raw += c;
    const body = JSON.parse(raw || '{}');
    const out = body.action === 'micatro-replay-get' ? { code, meta: {}, by: 'test' } : { ok: true, friends: [], challenges: [] };
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
  }
  const f = u.endsWith('/') ? u + 'index.html' : u;
  fs.readFile(path.join(root, f), (err, data) => { if (err) { res.writeHead(404); res.end(); } else { res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); res.end(data); } });
});
await new Promise(resolve => server.listen(8753, resolve));
let browser, failed = 0;
const check = (ok, msg) => { console.log((ok ? 'ok  - ' : 'FAIL: ') + msg); if (!ok) failed++; };
try {
  browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await page.goto('http://localhost:8753/micatro/?replay=feed0002', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__micatro?.replay?.ready, { timeout: 30000 });
  await page.evaluate(() => window.__micatro.replay.pause());
  const more = await page.$('.rb-ante-more');
  check(!!more, 'portrait replay exposes an ante expansion button');
  if (more) {
    await page.tap('.rb-ante-more');
    check(await page.evaluate(() => document.querySelector('.rb-ante-more').getAttribute('aria-expanded') === 'true' && getComputedStyle(document.querySelector('.rb-antes')).flexWrap === 'wrap'), 'ante list expands and wraps');
    await page.tap('.rb-ante[data-ante="8"]');
    // (waited for, not read at once: the seek and the collapse can land a frame or two after the tap on a loaded runner, 4 of main's 14 gate runs to 2026-11-14)
    check(await page.waitForFunction(index => window.__micatro.replay.index === index && document.querySelector('.rb-ante-more').getAttribute('aria-expanded') === 'false', { timeout: 5000 }, ante8.index).then(() => true, () => false), 'tapping Ante 8 seeks and collapses the list');
    await page.tap('.rb-ante-more');
    check(await page.evaluate(() => { const b = document.querySelector('.replay-bar').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight && document.documentElement.scrollWidth <= innerWidth; }), 'expanded controls fit the phone screen without horizontal page overflow');
    await page.tap('.rb-ante-more');
    check(await page.evaluate(() => document.querySelector('.rb-ante-more').getAttribute('aria-expanded') === 'false'), 'the list can also be collapsed without seeking');
    await page.tap('.rb-ante-more');
    await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    // The rotation reaches the page through matchMedia's 'change' event, which the browser
    // dispatches on its next rendering step — never inside setViewport — so the collapse is
    // waited for (bounded). Checking it in the same tick raced on loaded CI shards.
    const closed = () => getComputedStyle(document.querySelector('.rb-ante-more')).display === 'none' && document.querySelector('.rb-ante-more').getAttribute('aria-expanded') === 'false';
    // polled on a timer, not 'raf': the wait must not itself depend on the frame it waits for
    const ok = await page.waitForFunction(closed, { timeout: 5000, polling: 100 }).then(() => true, () => false);
    const seen = ok ? '' : '  ' + await page.evaluate(() => { const m = document.querySelector('.rb-ante-more'); return JSON.stringify({ display: getComputedStyle(m).display, expanded: m.getAttribute('aria-expanded'), portrait: matchMedia('(orientation: portrait)').matches, w: innerWidth, h: innerHeight }); });
    check(ok, 'landscape closes the expansion and retains the existing ante row' + seen);
  }
} catch (err) { failed++; console.error(err); }
finally { if (browser) await browser.close(); server.close(); }
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
