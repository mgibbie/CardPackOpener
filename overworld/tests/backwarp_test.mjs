// backwarp_test.mjs — tester got sealed inside a POKeMON CENTER.
//
// A handful of Crystal maps leave by a "-1" warp meaning "put me back where I
// came from": Pokecenter2F (the upstairs of EVERY Johto and JohKanto CENTER),
// the two dept-store elevators, and the Fast Ship. Their exit warp points at
// their OWN map id, so the destination is meaningless — only the remembered
// source matters.
//
// That source lived in memory alone. Reload while standing on one of those maps
// and backWarp() found nothing and silently returned, so the exit did nothing
// and there was no other way out. Reproduced before fixing.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/backwarp_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8901;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MON = {
	speciesId: 'rattata', name: 'R', level: 20, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
	exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
};

// ---------- static: which maps depend on this, and do they have another exit? ----------
const MAPS = path.join(ROOT, 'overworld/data/maps');
const minusOne = [];
for (const f of fs.readdirSync(MAPS)) {
	if (!f.endsWith('_map.json')) continue;
	let m; try { m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8')); } catch { continue; }
	const back = (m.warp_events || []).filter(w => String(w.dest_warp_id) === '-1');
	if (back.length) minusOne.push({ stem: f.replace('_map.json', ''), id: m.id, back: back.length, warps: (m.warp_events || []).length });
}
A(minusOne.length >= 4, `maps that leave by a -1 back-warp (${minusOne.length})`, minusOne.map(x => x.stem).join(', '));
A(minusOne.some(x => x.stem === 'Pokecenter2F'),
	'including Pokecenter2F — the upstairs of every Johto/JohKanto CENTER');
// the whole danger: for these, the -1 warp is the ONLY way back down
const pc2f = minusOne.find(x => x.stem === 'Pokecenter2F');
const pc = JSON.parse(fs.readFileSync(path.join(MAPS, 'Pokecenter2F_map.json'), 'utf8'));
const outs = (pc.warp_events || []).filter(w => String(w.dest_warp_id) !== '-1' && w.dest_map !== pc.id);
A(outs.every(w => /UNION_ROOM|TRADE_CENTER|COLOSSEUM|TIME_CAPSULE|MOBILE/.test(w.dest_map)),
	'whose every OTHER warp only leads deeper into the link rooms',
	outs.map(w => w.dest_map).join(', '));

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	const boot = async (map) => {
		const page = await browser.newPage();
		await page.evaluateOnNewDocument((st, m) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([m]));
			localStorage.setItem('magepunk_region', 'JOHTO');
		}, STATE, MON);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!window.__ow?.world?.current), 30000);
		await new Promise(r => setTimeout(r, 1000));
		return page;
	};
	const takeExit = async (page) => page.evaluate(async () => {
		const ow = window.__ow;
		ow.player.setTile(0, 7);
		ow.player.onArrive();
		const t0 = Date.now();
		while (ow.world.current.name === 'Pokecenter2F' && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 100));
		return ow.world.current.name;
	});

	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

		// ---- the ordinary route: up from a CENTER, then back down ----
		const p1 = await boot('JohKantoFuchsiaPokecenter1F');
		const up = await p1.evaluate(async () => {
			const ow = window.__ow;
			ow.player.setTile(0, 7); ow.player.onArrive();
			const t0 = Date.now();
			while (ow.world.current.name !== 'Pokecenter2F' && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 100));
			return { on: ow.world.current.name, src: ow.world.lastWarpSource?.name || null };
		});
		A(up.on === 'Pokecenter2F', 'the stairs reach the shared 2F', up.on);
		A(up.src === 'JohKantoFuchsiaPokecenter1F', 'and the way back is remembered', String(up.src));
		A(await takeExit(p1) === 'JohKantoFuchsiaPokecenter1F', 'walking out returns you downstairs');
		// the source is now persisted with the position, not just held in memory
		const saved = await p1.evaluate(() => JSON.parse(localStorage.getItem('magepunk_pos_v1') || 'null'));
		A(saved && 'back' in saved, 'the saved position carries the way back', JSON.stringify(saved));
		await p1.close();

		// ---- THE REPORTED BUG: reload while upstairs, then try to leave ----
		// Its own context: sibling pages SHARE localStorage, so scenario 1's
		// persisted `back` would leak in and this would never test the fallback.
		const ctx2 = await browser.createBrowserContext();
		const p2 = await ctx2.newPage();
		await p2.evaluateOnNewDocument((st, m) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([m]));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.removeItem('magepunk_pos_v1');   // no remembered way back
		}, STATE, MON);
		await p2.goto(`http://localhost:${PORT}/overworld/index.html?map=Pokecenter2F`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => p2.evaluate(() => !!window.__ow?.world?.current), 30000);
		await new Promise(r => setTimeout(r, 1000));
		const fresh = await p2.evaluate(() => window.__ow.world.lastWarpSource);
		A(fresh === null, 'a cold boot on the 2F has no in-memory source (the trap)');
		const out = await takeExit(p2);
		A(out !== 'Pokecenter2F', 'the exit still gets you OUT after a reload', `still on ${out}`);
		A(out === 'NewBarkTown', 'falling back to the region start town rather than sealing you in', out);
		await p2.close(); await ctx2.close();

		// ---- and with a persisted source, the reload returns you properly ----
		const ctx3 = await browser.createBrowserContext();
		const p3 = await ctx3.newPage();
		await p3.evaluateOnNewDocument((st, m) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([m]));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_pos_v1', JSON.stringify({
				map: 'Pokecenter2F', x: 4, y: 4,
				back: { name: 'JohKantoFuchsiaPokecenter1F', tx: 0, ty: 7 },
			}));
		}, STATE, MON);
		await p3.goto(`http://localhost:${PORT}/overworld/index.html?map=Pokecenter2F`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => p3.evaluate(() => !!window.__ow?.world?.current), 30000);
		await new Promise(r => setTimeout(r, 1000));
		A(await takeExit(p3) === 'JohKantoFuchsiaPokecenter1F',
			'a reload that kept the saved source returns you to the right CENTER');
		await p3.close(); await ctx3.close();
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
