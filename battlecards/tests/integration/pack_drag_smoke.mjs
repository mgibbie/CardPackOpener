// pack_drag_smoke.mjs — opening a pack is a DRAG into the slot, Hearthstone-style.
//
// It used to open on any tap anywhere on the idle screen, which meant a stray
// click spent 100 gold. Now the sealed pack rests to the left, a ring sits in
// the middle, and the DROP is what tears it. A drag that misses springs back
// and spends nothing — that is the assertion that matters most here.
//
// Standalone (needs headless Chrome/Edge):
//   node battlecards/tests/integration/pack_drag_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8905;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1100, height: 760 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument(() => { localStorage.setItem('magepunk_cardgold_v1', '500'); });
		await page.goto(`http://localhost:${PORT}/battlecards/packs.html`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__packs && window.__packs.pack)), 30000);
		A(ready, 'the pack screen boots with a sealed pack');
		if (!ready) throw new Error('boot failed');

		// world -> screen, so the test drags the real thing rather than guessing
		await page.evaluate(() => {
			window.__screenOf = (v) => {
				const p = new (window.__packs.pack.position.constructor)(v.x, v.y, v.z);
				p.project(window.__packs.camera);
				return { x: (p.x * 0.5 + 0.5) * innerWidth, y: (-p.y * 0.5 + 0.5) * innerHeight };
			};
		});

		const layout = await page.evaluate(() => {
			const P = window.__packs;
			return {
				packAt: P.pack.position.toArray().map(n => +n.toFixed(2)),
				rest: P.PACK_REST.toArray(),
				slot: P.SLOT_POS.toArray(),
				gold: P.Col.getGold(),
				phase: P.phase,
			};
		});
		A(layout.packAt[0] < -2, 'the sealed pack rests off to the side, not centre stage', JSON.stringify(layout.packAt));
		A(layout.slot[0] === 0, 'and the slot is centre, where the cards will burst from', JSON.stringify(layout.slot));
		A(layout.gold === 500, 'starting gold seeded', String(layout.gold));

		const drag = async (toWorld, drop = true) => {
			const from = await page.evaluate(() => window.__screenOf(window.__packs.pack.position));
			const to = await page.evaluate(w => window.__screenOf(w), toWorld);
			await page.mouse.move(from.x, from.y);
			await page.mouse.down();
			for (let i = 1; i <= 8; i++) {
				await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
				await new Promise(r => setTimeout(r, 20));
			}
			const armed = await page.evaluate(() => ({ dragging: window.__packs.dragging, armed: window.__packs.slotArmed }));
			if (drop) await page.mouse.up();
			return armed;
		};

		// ---- a drag that MISSES: springs back, spends nothing ----
		const miss = await drag({ x: 4.2, y: -2.2, z: 0.6 });
		A(miss.dragging === true, 'pressing the pack picks it up');
		A(miss.armed === false, 'and dropping far from the ring does not arm it', JSON.stringify(miss));
		await new Promise(r => setTimeout(r, 900));
		const afterMiss = await page.evaluate(() => ({
			phase: window.__packs.phase, gold: window.__packs.Col.getGold(),
			backNearRest: window.__packs.pack
				? window.__packs.pack.position.distanceTo(window.__packs.PACK_REST) < 0.6 : null,
		}));
		A(afterMiss.phase === 'idle', 'a missed drop does NOT open the pack', afterMiss.phase);
		A(afterMiss.gold === 500, 'and spends no gold — a stray click used to cost 100', String(afterMiss.gold));
		A(afterMiss.backNearRest === true, 'the pack springs back to its rest spot');

		// ---- a drag INTO the ring: arms, then opens ----
		const hit = await drag({ x: 0, y: 0.1, z: 0.6 }, false);
		A(hit.armed === true, 'holding the pack over the ring arms it', JSON.stringify(hit));
		const litUp = await page.evaluate(() => new Promise(r => setTimeout(() => r({
			armed: window.__packs.slotArmed,
		}), 300)));
		A(litUp.armed === true, 'and it stays armed while held there');
		await page.mouse.up();
		const opened = await waitFor(() => page.evaluate(() => window.__packs.phase !== 'idle'), 8000);
		A(opened, 'dropping it in the ring tears the pack open');
		const after = await page.evaluate(() => ({ phase: window.__packs.phase, gold: window.__packs.Col.getGold() }));
		A(after.gold === 400, 'and this time the gold is spent', String(after.gold));

		// ---- five cards arrive ----
		const dealt = await waitFor(() => page.evaluate(() => window.__packs.cardMeshes.length === 5), 12000);
		A(dealt, 'five cards come out of the pack',
			String(await page.evaluate(() => window.__packs.cardMeshes.length)));
		A(await page.evaluate(() => window.__packs.cardMeshes.every(c => !c.flipped)),
			'face down, waiting to be turned over');

		// ---- and the keyboard route still works (drag-only would be a trap) ----
		A(await page.evaluate(() => typeof window.__packs.startOpen === 'function'),
			'a non-drag route to open still exists (button / Z key)');

		// ---- rarity glow on a FACE-DOWN card ----
		const glow = await page.evaluate(async () => {
			const P = window.__packs, cards = P.cardMeshes;
			const target = cards[2];
			const scr = (m) => { const v = m.position.clone(); v.project(P.camera);
				return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight }; };
			window.__hoverAt = scr(target.mesh);
			return { rarity: target.def.rarity, want: P.RARITY_COLORS[target.def.rarity] };
		});
		await page.mouse.move(glow.want ? (await page.evaluate(() => window.__hoverAt)).x : 0,
			(await page.evaluate(() => window.__hoverAt)).y);
		await new Promise(r => setTimeout(r, 250));
		const lit = await page.evaluate(() => {
			const c = window.__packs.cardMeshes;
			const hovered = c.filter(x => x.backMat.emissiveIntensity > 0);
			return {
				count: hovered.length,
				colour: hovered[0] ? '#' + hovered[0].backMat.emissive.getHexString() : null,
				rarity: hovered[0] ? hovered[0].def.rarity : null,
				othersDark: c.filter(x => x !== hovered[0]).every(x => x.backMat.emissiveIntensity === 0),
			};
		});
		A(lit.count === 1, 'hovering a face-down card lights exactly one', JSON.stringify(lit));
		A(lit.othersDark, 'and leaves the rest dark');
		A(lit.colour && lit.colour.toLowerCase() === (await page.evaluate(r => window.__packs.RARITY_COLORS[r], lit.rarity)).toLowerCase(),
			"in that card's rarity colour", `${lit.rarity} -> ${lit.colour}`);

		// ---- SPACE flips one card at a time ----
		const before = await page.evaluate(() => window.__packs.cardMeshes.filter(c => c.flipped).length);
		await page.keyboard.press('Space');
		await new Promise(r => setTimeout(r, 350));
		const afterOne = await page.evaluate(() => window.__packs.cardMeshes.filter(c => c.flipped).length);
		A(afterOne === before + 1, 'Space turns over exactly one card', `${before} -> ${afterOne}`);

		for (let i = 0; i < 6; i++) { await page.keyboard.press('Space'); await new Promise(r => setTimeout(r, 300)); }
		const allUp = await page.evaluate(() => ({
			flipped: window.__packs.cardMeshes.filter(c => c.flipped).length,
			phase: window.__packs.phase,
			gold: window.__packs.Col.getGold(),
		}));
		A(allUp.flipped === 5 || allUp.phase === 'tearing' || allUp.phase === 'revealing',
			'repeated Space walks the whole pack', JSON.stringify(allUp));
		A(allUp.gold === 300, 'and one more Space after the last card opens the NEXT pack',
			`gold ${allUp.gold} (400 would mean it never opened)`);

		// ---- a big pull gets a shockwave ----
		// the Space run above opened a fresh pack; wait for its cards to land, or
		// this silently skips and proves nothing
		await waitFor(() => page.evaluate(() =>
			window.__packs.phase === 'revealing' && window.__packs.cardMeshes.some(c => !c.flipped)), 12000);
		const wave = await page.evaluate(async () => {
			const P = window.__packs;
			const i = P.cardMeshes.findIndex(c => !c.flipped);
			if (i < 0) return { skip: true };
			// force the rarity so the test doesn't depend on a lucky roll
			P.cardMeshes[i].def = { ...P.cardMeshes[i].def, rarity: 'legendary' };
			const before = P.flashRings.length;
			P.flip(i);
            await new Promise(r => setTimeout(r, 60));
			return { before, after: P.flashRings.length };
		});
		A(!wave.skip, 'a face-down card was available for the shockwave check', JSON.stringify(wave));
		A(wave.after > wave.before, 'a legendary reveal throws a shockwave ring', JSON.stringify(wave));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));

	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
