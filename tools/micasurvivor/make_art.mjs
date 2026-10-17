// make_art.mjs — the two small MicaSurvivor images that live in git (MicaSurvivor M3):
//   micasurvivor/icons/tile.png      96x96  the landing-page tile art (index.html), a sprite composite
//                                           of the game's own PMD SpriteCollab sheets (CC BY-NC 4.0)
//   overworld/fx/micasurvivorbox.png 20x32  the Pewter Museum arcade cabinet (overworld/arcade.js)
// Drawn in headless Chrome from micasurvivor/assets/pokemon/<dex>/Idle.png (the gitignored
// sprite sheets — run with them present). Re-run after changing the look:
//   node tools/micasurvivor/make_art.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
if (!fs.existsSync(path.join(ROOT, 'micasurvivor/assets/pokemon/25/Idle.png'))) { console.error('micasurvivor/assets/pokemon is missing (see micasurvivor/README.md)'); process.exit(1); }

const server = http.createServer((req, res) => {
	const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': f.endsWith('.png') ? 'image/png' : 'text/html' }); res.end(d); });
});
await new Promise(r => server.listen(0, r));
const port = server.address().port;
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
try {
	const page = await browser.newPage();
	await page.goto(`http://localhost:${port}/micasurvivor/icons/icon-32.png`);
	const out = await page.evaluate(async () => {
		const load = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
		// Idle frame 0, facing down (row 0): [dex, w, h]
		const FR = { 25: [40, 56], 19: [32, 32], 41: [32, 56], 74: [32, 24], 4: [32, 40] };
		const img = {};
		for (const d of Object.keys(FR)) img[d] = await load('/micasurvivor/assets/pokemon/' + d + '/Idle.png');
		const frame = (ctx, d, cx, cy, k, row = 0) => {
			const [w, h] = FR[d];
			ctx.drawImage(img[d], 0, row * h, w, h, Math.round(cx - w * k / 2), Math.round(cy - h * k / 2), w * k, h * k);
		};

		// ---- the landing tile: the partner surrounded by the horde, on a dungeon floor
		const t = document.createElement('canvas'); t.width = t.height = 96;
		const c = t.getContext('2d'); c.imageSmoothingEnabled = false;
		const g = c.createRadialGradient(48, 52, 6, 48, 52, 66);
		g.addColorStop(0, '#3d6b45'); g.addColorStop(0.55, '#24402c'); g.addColorStop(1, '#101a22');
		c.fillStyle = g; c.fillRect(0, 0, 96, 96);
		c.fillStyle = 'rgba(255,255,255,0.05)';
		for (let y = 0; y < 96; y += 12) for (let x = (y / 12) % 2 ? 6 : 0; x < 96; x += 12) c.fillRect(x, y, 6, 6);
		frame(c, 41, 18, 20, 1, 7);   // Zubat, up-left
		frame(c, 74, 80, 18, 1, 1);   // Geodude
		frame(c, 19, 14, 78, 1, 1);   // Rattata
		frame(c, 4, 82, 76, 1, 7);    // Charmander
		c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(48, 66, 13, 4, 0, 0, 7); c.fill();
		frame(c, 25, 48, 46, 2);      // Pikachu, the partner, 2x
		c.strokeStyle = '#f5c542'; c.lineWidth = 2; c.strokeRect(1, 1, 94, 94);

		// ---- the arcade cabinet (20x32): navy body, gold marquee, a green screen with Pikachu
		const b = document.createElement('canvas'); b.width = 20; b.height = 32;
		const x = b.getContext('2d'); x.imageSmoothingEnabled = false;
		const px = (col, X, Y, W = 1, H = 1) => { x.fillStyle = col; x.fillRect(X, Y, W, H); };
		px('#0b1020', 1, 0, 18, 32);          // outline
		px('#1f3b73', 2, 1, 16, 30);          // body
		px('#2c55a0', 2, 1, 2, 30);           // left-side highlight
		px('#f5c542', 3, 2, 14, 4);           // marquee
		px('#b8860b', 3, 5, 14, 1);
		px('#7a4b00', 5, 3, 10, 1); px('#7a4b00', 6, 4, 8, 1);   // marquee "lettering"
		px('#0b1020', 3, 7, 14, 12);          // screen bezel
		px('#2e6b3a', 4, 8, 12, 10);          // screen
		const s = document.createElement('canvas'); s.width = 12; s.height = 10;
		const sc = s.getContext('2d'); sc.imageSmoothingEnabled = true;
		sc.drawImage(img[25], 6, 12, 28, 34, 0, -1, 12, 14);   // Pikachu's head + body, shrunk into the screen
		x.drawImage(s, 4, 8);
		px('#13254a', 2, 19, 16, 1);
		px('#2a4a8c', 3, 20, 14, 4);          // control panel
		px('#e74c3c', 5, 21, 2, 2); px('#f5c542', 10, 21, 2, 2); px('#3fbf6f', 13, 21, 2, 2);
		px('#13254a', 3, 25, 14, 5);          // kick plate
		px('#f5c542', 8, 27, 4, 1);           // coin slot
		return { tile: t.toDataURL('image/png'), box: b.toDataURL('image/png') };
	});
	const save = (rel, url) => { fs.writeFileSync(path.join(ROOT, rel), Buffer.from(url.split(',')[1], 'base64')); console.log(rel, fs.statSync(path.join(ROOT, rel)).size, 'bytes'); };
	save('micasurvivor/icons/tile.png', out.tile);
	save('overworld/fx/micasurvivorbox.png', out.box);
} finally {
	await browser.close();
	server.close();
}
