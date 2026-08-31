// johkanto_signs_test.mjs — the region that could not speak, and the signs that
// said nothing.
//
//   JOHKANTO  All 135 maps shipped with ZERO script files, so 283 NPC and coord
//             events were inert: the region was walkable but nobody in it said
//             anything, not even a wrong line. Johto's scripts were transpiled
//             from pokecrystal; Crystal's Kanto half never was. The wiring
//             problem was naming — the engine loads scripts by MAP FILE STEM,
//             and the Crystal name (CeruleanCity.json) is already taken by
//             FireRed's Kanto, a different game's labels entirely.
//
//   SIGNS     interact() only opened a dialog when sign_texts.json had the
//             label, and otherwise fell straight through in silence: 381
//             scripted bg_events across 84 maps, including every department
//             store elevator button and every Game Corner machine.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/johkanto_signs_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8904;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 30, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 90, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 90, curHP: 90,
	exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19)];

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	// ---------- data-only ----------
	const maps = fs.readdirSync(path.join(DATA, 'maps')).filter(f => /^JohKanto.*_map\.json$/.test(f));
	const withScripts = maps.filter(f =>
		fs.existsSync(path.join(DATA, 'scripts', f.replace(/_map\.json$/, '.json'))));
	A(maps.length > 100, 'JohKanto has its full map set', String(maps.length));
	A(withScripts.length > 120,
		'and almost all of them now carry a script file — it was ZERO',
		`${withScripts.length}/${maps.length}`);

	// the labels its objects name must actually resolve
	let events = 0, resolved = 0;
	for (const f of maps) {
		const doc = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', f), 'utf8'));
		const sp = path.join(DATA, 'scripts', f.replace(/_map\.json$/, '.json'));
		const labels = fs.existsSync(sp) ? new Set(Object.keys(JSON.parse(fs.readFileSync(sp, 'utf8')))) : new Set();
		for (const ev of (doc.object_events || [])) {
			if (!ev.script || ev.script === '0x0') continue;
			events++;
			if (labels.has(ev.script)) resolved++;
		}
	}
	A(resolved > events * 0.6, 'most JohKanto NPCs now resolve to a real script', `${resolved}/${events}`);

	// the scripts must be CRYSTAL's, not FireRed's — those share map names, and
	// picking the wrong one is the mistake this whole fix is about
	const cerulean = JSON.parse(fs.readFileSync(path.join(DATA, 'scripts', 'JohKantoCeruleanCity.json'), 'utf8'));
	const keys = Object.keys(cerulean);
	A(keys.some(k => /^CeruleanCity[A-Z]/.test(k)) && !keys.some(k => /_EventScript_/.test(k)),
		'JohKanto runs CRYSTAL labels, not FireRed ones', keys.slice(0, 3).join(','));

	// ---------- engine ----------
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
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=JohKantoCeruleanCity`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.world?.current)), 30000);
		A(ready, 'a JohKanto map boots');
		if (!ready) throw new Error('boot failed');

		const loaded = await page.evaluate(() => ({
			map: window.__ow.world.current.map.id,
			labels: Object.keys(window.__ow.mapScripts || {}).length,
		}));
		A(loaded.map === 'MAP_JOHKANTO_CERULEAN_CITY', 'on the right map', JSON.stringify(loaded));
		A(loaded.labels > 5, 'with its scripts actually loaded — this was 0 for the whole region', JSON.stringify(loaded));

		// A map whose signs have NO sign_texts entry — so only the new fallback can
		// make them talk. Cerulean's signs all have text, which made the first
		// version of this check pass even with the fix reverted.
		const signs = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoCeladonGameCorner');
			await new Promise(r => setTimeout(r, 800));
			const bg = (ow.world.current.map.bg_events || []).filter(b => b.script && b.script !== '0x0');
			if (!bg.length) return { none: true };
			const out = [];
			for (const b of bg.slice(0, 4)) {
				ow.dialog.close?.();
				await new Promise(r => setTimeout(r, 60));
				ow.player.setTile(+b.x, +b.y + 1);   // stand below it, face up
				ow.player.facing = 'up';
				ow.interact();
				await new Promise(r => setTimeout(r, 250));
				out.push({ script: b.script, said: !!ow.dialog.blocking, text: (ow.dialog.text || '').slice(0, 30) });
				ow.dialog.close?.();
			}
			return { out };
		});
		A(!signs.none, 'the Game Corner has scripted machines with no sign text at all');
		A((signs.out || []).every(s => s.said),
			'every one of them now says something when you press A', JSON.stringify(signs.out));

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
