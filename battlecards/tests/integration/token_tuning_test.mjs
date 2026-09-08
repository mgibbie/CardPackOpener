// token_tuning_test.mjs — verifies the card face and board token frame the art
// INDEPENDENTLY (ART_TUNING[id].token overrides only the token). Renders through
// the real painters in a headless browser (canvas needed; three is vendored
// locally so this runs offline). Not part of run-all (integration/); run with:
//   node battlecards/tests/integration/token_tuning_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../'); // repo root, so /battlecards/... resolves
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + JSON.stringify(x) : '')); } };

const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const PORT = 8971;
const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
		res.end(d);
	});
});

const PAGE = `<!doctype html><meta charset=utf8>
<script type="importmap">{ "imports": { "three": "/battlecards/vendor/three.module.min.js" } }</script>
<script type="module">
import { drawCardFace, drawBoardToken, setArtOverride, ART_TUNING } from '/battlecards/cardart.js';
window.__run = async () => {
  // a strong horizontal gradient so panning the crop changes what's at center
  const src = document.createElement('canvas'); src.width = 400; src.height = 400;
  const g = src.getContext('2d'); const grd = g.createLinearGradient(0,0,400,0);
  grd.addColorStop(0,'#ff0000'); grd.addColorStop(1,'#0000ff'); g.fillStyle = grd; g.fillRect(0,0,400,400);
  const img = new Image(); img.src = src.toDataURL('image/png'); await img.decode();
  const card = { id: 'tt_probe', type: 'creature', name: 'Probe', attack: 1, health: 1, cost: 1 };
  setArtOverride('tt_probe', img);
  const centerR = cv => { const c = cv.getContext('2d'); return c.getImageData(cv.width>>1, cv.height>>1, 1, 1).data[0]; }; // red channel at center

  // baseline: no token tuning -> token uses the face framing (default centered)
  ART_TUNING['tt_probe'] = { z: 1, fx: 0.5, fy: 0.5 };
  const faceBefore = centerR(drawCardFace(card));
  const tokBaseline = centerR(drawBoardToken(card, { attack: 1, hp: 1, maxHealth: 1 }, 0.625));

  // give the TOKEN its own framing: pan hard left (fx 0.05) -> center shows the red edge
  ART_TUNING['tt_probe'] = { z: 1, fx: 0.5, fy: 0.5, token: { z: 1, fx: 0.05, fy: 0.5 } };
  const faceAfter = centerR(drawCardFace(card));
  const tokPanned = centerR(drawBoardToken(card, { attack: 1, hp: 1, maxHealth: 1 }, 0.625));

  return { faceBefore, faceAfter, tokBaseline, tokPanned };
};
</script>`;

(async () => {
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errs = []; page.on('pageerror', e => errs.push(e.message));
		await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
		await page.setContent(PAGE, { waitUntil: 'networkidle0' });
		const r = await page.evaluate(() => window.__run());
		ok('no page errors', errs.length === 0, errs.slice(0, 3));
		ok('token framing changed when given its own tuning (independent)', r.tokPanned !== r.tokBaseline, r);
		ok('panning the token left shows the red edge (higher red at center)', r.tokPanned > r.tokBaseline, r);
		ok('the card FACE is unaffected by the token tuning', r.faceAfter === r.faceBefore, r);
	} catch (e) {
		ok('harness ran', false, String(e.message || e));
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
