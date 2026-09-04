// dexfilter_test.mjs — Upscale 5 Batch 6b: Pokédex filters. The national list of
// 1,751 had no way to narrow it; now T/R/F cycle type / region / caught-status
// filters (the completionist lens), with an empty-state when nothing matches.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/dexfilter_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8883;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'dexf', friendCode: 'DFDFDF', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const errors = [];
	try {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'dexf');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmander', name: 'CHARMANDER', level: 10, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 30, atk: 18, def: 16, spa: 20, spd: 16, spe: 20 }, maxHP: 30, curHP: 30, exp: 1000, num: 4, sprite: 's128.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.dexList && window.__ow.dexMenu && window.__ow.dexKey && window.__ow.Dex)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, d = ow.dexMenu, o = {};
			const reset = () => { d.typeI = 0; d.regionI = 0; d.caughtI = 0; d.idx = 0; d.detail = false; d.open = true; };
			reset();
			o.fullLen = ow.dexList().length;                 // unfiltered national list

			// TYPE filter: Fire (index 2) → every entry is a Fire type
			reset(); d.typeI = 2;
			const fire = ow.dexList();
			o.fireOk = fire.length > 0 && fire.every(e => e.types.includes('Fire'));

			// REGION filter: KANTO (index 1) → dex numbers 1–151 only
			reset(); d.regionI = 1;
			const kanto = ow.dexList();
			// forms share their base dex number, so >151 entries is fine — just all in range
			o.kantoOk = kanto.length > 0 && kanto.every(e => e.num >= 1 && e.num <= 151);

			// CAUGHT filter: OWNED (index 1) → only what the dex records as caught
			ow.Dex.markCaught('bulbasaur'); ow.Dex.markCaught('charmander'); ow.Dex.markSeen('mewtwo');
			reset(); d.caughtI = 1;
			const owned = ow.dexList();
			o.ownedOk = owned.length >= 2 && owned.every(e => ow.Dex.isCaught(e.id));
			reset(); d.caughtI = 2; // SEEN-not-owned
			const seen = ow.dexList();
			o.seenOk = seen.some(e => e.id === 'mewtwo') && seen.every(e => ow.Dex.isSeen(e.id) && !ow.Dex.isCaught(e.id));
			reset(); d.caughtI = 3; // MISSING
			o.missingExcludesOwned = !ow.dexList().some(e => ow.Dex.isCaught(e.id));

			// COMBINED + empty state: Fairy (13? find index) that no Kanto-owned exists
			reset(); d.typeI = 2; d.regionI = 2; // Fire + JOHTO
			const fireJohto = ow.dexList();
			o.combinedOk = fireJohto.every(e => e.types.includes('Fire') && e.num >= 152 && e.num <= 251);
			// an impossible combo yields an empty list (drawn as an empty-state, no crash)
			reset(); d.typeI = 1; d.regionI = 1; d.caughtI = 1; // Normal + KANTO + OWNED (nothing owned matches)
			o.emptyLen = ow.dexList().length;

			// dexKey cycles filters and resets the cursor
			reset(); d.idx = 40; ow.dexKey('t');
			o.tCycled = d.typeI === 1 && d.idx === 0;
			ow.dexKey('r'); o.rCycled = d.regionI === 1;
			ow.dexKey('f'); o.fCycled = d.caughtI === 1;
			// leave the dex open on an empty filter so the render loop paints the empty state
			reset(); d.typeI = 1; d.regionI = 1; d.caughtI = 1;
			return o;
		});
		await new Promise(r => setTimeout(r, 350)); // let the render loop paint the empty state

		A(out.fullLen > 1000, 'the unfiltered dex lists the whole national roster', out.fullLen);
		A(out.fireOk, 'the TYPE filter keeps only matching-type species');
		A(out.kantoOk, 'the REGION filter keeps only that region’s dex numbers');
		A(out.ownedOk, 'the OWNED filter keeps only caught species');
		A(out.seenOk, 'the SEEN filter keeps seen-but-not-caught species');
		A(out.missingExcludesOwned, 'the MISSING filter excludes caught species');
		A(out.combinedOk, 'filters combine (Fire + Johto)');
		A(out.emptyLen === 0, 'an impossible combo yields an empty list', out.emptyLen);
		A(out.tCycled, 'T cycles the type filter and resets the cursor');
		A(out.rCycled && out.fCycled, 'R and F cycle the region and caught filters');
		A(errors.length === 0, 'no page errors while drawing the empty-filter state', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
