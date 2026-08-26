// sprite-audit.cjs — measure every battle sprite's opaque bounding box vs its
// canvas, and regenerate the auto section of overworld/sprite_tuning.json.
//
// The battle renderer "contain"-fits each sprite into a 96px box using the
// image's CANVAS dimensions; a sprite exported with big transparent margins
// therefore draws too small (worst offenders ~1/3 of intended size), floats
// above its platform (bottom padding), or sits off-centre (asymmetric
// padding). This tool computes per-sprite corrections through the same
// SPRITE_TUNING mechanism the ?spritetune=1 overlay writes:
//   s = 1/coverage      (restores the intended 96-box size)
//   y = bottom gap      (feet back on the platform, in scene units)
//   x = centre offset   (visible pixels centred over the platform)
// Hand-made entries win: any species already in sprite_tuning.json is left
// untouched. Full measurements land in tools/data/sprite_audit.json.
//
//   node tools/sprite-audit.cjs          (writes sprite_tuning.json)
//   node tools/sprite-audit.cjs --dry    (report only)
const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8919;
(async () => {
	const spb = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
	const species = spb.species || spb;
	const jobs = [];
	for (const [id, sp] of Object.entries(species)) {
		if (!sp.sprite) continue;
		const back = sp.sprite.replace(/\.(png|gif)$/, '-b.$1');
		jobs.push({ id, side: 'front', file: sp.sprite, bScale: sp.battleScale || 1 });
		if (fs.existsSync(path.join(ROOT, 'overworld/data/pokemon', back))) {
			jobs.push({ id, side: 'back', file: back, bScale: sp.battleScale || 1 });
		}
	}
	console.log('sprites to measure:', jobs.length);

	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/__audit') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<canvas id=c></canvas>'); return; }
		fs.readFile(path.join(ROOT, u), (e, d) => {
			if (e) { res.writeHead(404); res.end(); return; }
			res.writeHead(200, { 'content-type': u.endsWith('.png') ? 'image/png' : 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'] });
	const page = await browser.newPage();
	await page.goto(`http://localhost:${PORT}/__audit`, { waitUntil: 'domcontentloaded' });

	const results = [];
	const CHUNK = 200;
	for (let i = 0; i < jobs.length; i += CHUNK) {
		const chunk = jobs.slice(i, i + CHUNK);
		const out = await page.evaluate(async (base, files) => {
			const cv = document.getElementById('c');
			const ctx = cv.getContext('2d', { willReadFrequently: true });
			const res = [];
			for (const f of files) {
				try {
					const img = new Image();
					img.src = '/overworld/data/pokemon/' + f.file;
					await img.decode();
					const w = img.naturalWidth, h = img.naturalHeight;
					cv.width = w; cv.height = h;
					ctx.clearRect(0, 0, w, h);
					ctx.drawImage(img, 0, 0);
					const d = ctx.getImageData(0, 0, w, h).data;
					let minX = w, minY = h, maxX = -1, maxY = -1;
					for (let y = 0; y < h; y++) {
						for (let x = 0; x < w; x++) {
							if (d[(y * w + x) * 4 + 3] > 16) {
								if (x < minX) minX = x;
								if (x > maxX) maxX = x;
								if (y < minY) minY = y;
								if (y > maxY) maxY = y;
							}
						}
					}
					if (maxX < 0) { res.push({ ...f, empty: true }); continue; }
					res.push({ ...f, w, h, bw: maxX - minX + 1, bh: maxY - minY + 1, bottomGap: h - 1 - maxY, cxOff: (minX + maxX + 1) / 2 - w / 2 });
				} catch (e) { res.push({ ...f, error: String(e).slice(0, 60) }); }
			}
			return res;
		}, `http://localhost:${PORT}`, chunk);
		results.push(...out);
		if ((i / CHUNK) % 5 === 0) console.log('…', i + chunk.length, '/', jobs.length);
	}
	await browser.close();
	server.close();

	// ---------- analysis + tuning generation ----------
	// Emit a `crop` box ([x,y,w,h] as canvas fractions) for every sprite whose
	// visible pixels deviate enough to matter. The renderer normalizes and
	// anchors by the crop, which is EXACT in every layout/pose — unlike s/x/y
	// offsets, which are reserved for hand tweaks on top.
	const proposals = {};
	let empty = 0, small = 0, floaty = 0, offcentre = 0;
	const r4 = v => Math.round(v * 1000) / 1000;
	for (const r of results) {
		if (r.empty || r.error) { if (r.empty) { empty++; console.log('  EMPTY sprite:', r.id, r.side, r.file); } continue; }
		const coverage = Math.max(r.bw, r.bh) / Math.max(r.w, r.h);
		const gapFrac = r.bottomGap / r.h;
		const cxFrac = Math.abs(r.cxOff) / r.w;
		if (coverage < 0.9) small++;
		if (gapFrac > 0.03) floaty++;
		if (cxFrac > 0.05) offcentre++;
		if (coverage >= 0.9 && gapFrac <= 0.03 && cxFrac <= 0.05) continue; // close enough — leave it alone
		const bx = r.cxOff + r.w / 2 - r.bw / 2; // reconstruct bbox left from centre offset
		(proposals[r.id] = proposals[r.id] || {})[r.side] = {
			crop: [r4(bx / r.w), r4((r.h - r.bottomGap - r.bh) / r.h), r4(r.bw / r.w), r4(r.bh / r.h)],
		};
	}
	fs.writeFileSync(path.join(ROOT, 'tools/data/sprite_audit.json'), JSON.stringify({ results, proposals }, null, 1));
	console.log(`measured ${results.length} | empty ${empty} | undersized(<0.9) ${small} | floating(gap>3%) ${floaty} | off-centre(>5%) ${offcentre}`);
	console.log('species with crop proposals:', Object.keys(proposals).length);

	if (!DRY) {
		// merge: keep hand-made s/x/y from the existing file, refresh crops
		const tuningPath = path.join(ROOT, 'overworld/sprite_tuning.json');
		let existing = {};
		try { existing = JSON.parse(fs.readFileSync(tuningPath, 'utf8')); } catch (e) {}
		const ids = [...new Set([...Object.keys(proposals), ...Object.keys(existing)])].sort();
		const out = {};
		for (const id of ids) {
			const e = {};
			for (const side of ['front', 'back']) {
				const hand = existing[id]?.[side] || {};
				const auto = proposals[id]?.[side] || {};
				const merged = { ...hand, ...(auto.crop ? { crop: auto.crop } : {}) };
				if (Object.keys(merged).length) e[side] = merged;
			}
			if (Object.keys(e).length) out[id] = e;
		}
		fs.writeFileSync(tuningPath, JSON.stringify(out) + '\n');
		console.log(`wrote ${tuningPath}: ${Object.keys(out).length} species, ${(fs.statSync(tuningPath).size / 1024).toFixed(0)} KB`);
	}
	const worst = results.filter(r => r.w).sort((a, b) => (Math.max(a.bw, a.bh) / Math.max(a.w, a.h)) - (Math.max(b.bw, b.bh) / Math.max(b.w, b.h))).slice(0, 8);
	for (const r of worst) console.log('  worst:', r.id, r.side, 'coverage', (Math.max(r.bw, r.bh) / Math.max(r.w, r.h)).toFixed(2), `${r.w}x${r.h}`, 'gap', r.bottomGap);
})();
