// discovery_test.mjs — Upscale 5 Batch 6a: the THINGS TO DO discovery page.
// Whole subsystems shipped reachable but unpointed-at (contests, the Ruins,
// secret bases, the Frontier, Dive, apricorns...). The QUEST menu grew a second
// page — a checklist with where-to-start hints and live [x]/[>]/[ ] state.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/discovery_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8882;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'disco', friendCode: 'DSDSDS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'disco');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'johto');
			localStorage.setItem('magepunk_name', 'GOLD');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'quilava', name: 'QUILAVA', level: 30, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 90, atk: 60, def: 55, spa: 65, spd: 55, spe: 70 }, maxHP: 90, curHP: 90, exp: 27000, num: 156, sprite: 's4992.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.todoRows && window.__ow.questMenu && window.__ow.THINGS_TO_DO)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, o = {};
			// open the QUEST menu — starts on the quest LOG (page 0)
			ow.questMenu.open = true; ow.questMenu.idx = 0; ow.questMenu.page = 0;
			o.startPage = ow.questMenu.page;
			// ◄ ► flips to THINGS TO DO and resets the cursor
			ow.questMenu.idx = 3;
			ow.questKey('ArrowRight');
			o.toPage = ow.questMenu.page; o.idxReset = ow.questMenu.idx;
			// the checklist covers every activity, each a state marker + label + hint
			const rows = ow.todoRows();
			o.rowCount = rows.length; o.defCount = ow.THINGS_TO_DO.length;
			o.allMarked = rows.every(r => /^\[[ x>]\] .+ — .+/.test(r));
			o.hasContests = rows.some(r => /POKeMON CONTESTS/.test(r));
			o.hasFrontier = rows.some(r => /BATTLE FRONTIER/.test(r));
			// UNOWN DEX starts not-done; catching all 28 letters flips it to [x]
			o.unownBefore = rows.find(r => /UNOWN DEX/.test(r)).slice(0, 3);
			for (const L of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ!?'.split('')) ow.Dex.markUnown(L);
			o.unownAfter = ow.todoRows().find(r => /UNOWN DEX/.test(r)).slice(0, 3);
			// SECRET BASE flips to [x] once you own a base
			o.baseBefore = ow.todoRows().find(r => /SECRET BASE/.test(r)).slice(0, 3);
			ow.saveMyBase({ spot: 'test', style: 'tree', deco: [] });
			o.baseAfter = ow.todoRows().find(r => /SECRET BASE/.test(r)).slice(0, 3);
			// scrolling wraps within the page length
			ow.questMenu.idx = 0; ow.questKey('ArrowUp');
			o.wrapIdx = ow.questMenu.idx;
			// ◄ ► flips back to the log
			ow.questKey('ArrowLeft');
			o.backPage = ow.questMenu.page;
			// leave it open on the TO DO page so the render loop draws it
			ow.questMenu.page = 1; ow.questMenu.idx = 0;
			return o;
		});
		// let the real render loop paint the discovery page a few frames
		await new Promise(r => setTimeout(r, 400));

		A(out.startPage === 0, 'the QUEST menu opens on the quest log');
		A(out.toPage === 1 && out.idxReset === 0, '◄ ► switches to THINGS TO DO and resets the cursor');
		A(out.rowCount === out.defCount && out.rowCount >= 12, 'the checklist lists every activity', `${out.rowCount}/${out.defCount}`);
		A(out.allMarked, 'every row has a state marker, a label and a where-to-start hint');
		A(out.hasContests && out.hasFrontier, 'built-but-hidden systems are surfaced (contests, Frontier)');
		A(out.unownBefore === '[ ]' || out.unownBefore === '[>]', 'UNOWN DEX starts incomplete', out.unownBefore);
		A(out.unownAfter === '[x]', 'catching all 28 Unown flips UNOWN DEX to done', out.unownAfter);
		A(out.baseBefore !== '[x]' && out.baseAfter === '[x]', 'owning a SECRET BASE flips it to done', JSON.stringify({ b: out.baseBefore, a: out.baseAfter }));
		A(out.wrapIdx === out.defCount - 1, 'the cursor wraps within the checklist', out.wrapIdx);
		A(out.backPage === 0, '◄ ► flips back to the quest log');
		A(errors.length === 0, 'no page errors while drawing the discovery page', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
