// summarymoveswap_test.mjs — reordering move slots from the PARTY SUMMARY.
//
// The battle flow (S / the SWAP button) was the ONLY way to reorder moves, so
// out of battle — where touch players actually live — there was no way at all.
// The summary's four move rows are now tap targets: tap one slot to arm it,
// tap another to swap (PP rides along, the order persists on the mon), tap the
// same slot to cancel. Cycling party members or pressing X drops an armed swap.
//
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/summarymoveswap_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { overworldSource } from './owsource.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8899;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'ms', friendCode: 'MSMSMS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

// ---------- source: the keyboard-path rules live in the summary key handler ----------
{
	const mj = overworldSource();   // main.js + the modules split out of it
	A(/kind === 'summary-move'/.test(mj), 'the summary move rows dispatch through menuTap');
	const summaryBlock = mj.slice(mj.indexOf('if (partyMenu.summary) {'), mj.indexOf('if (partyMenu.summary) {') + 900);
	A((summaryBlock.match(/partyMenu\.moveSwap = null/g) || []).length >= 3, 'cycling members and X all drop an armed swap', summaryBlock.slice(0, 120));
	A(/moveSwap != null\) partyMenu\.moveSwap = null;\s*\n\s*else partyMenu\.summary = false/.test(mj), 'X cancels the armed swap BEFORE closing the summary');
}

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
			localStorage.setItem('magepunk_mp_token_v1', 'ms');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([
				{
					speciesId: 'pikachu', name: 'PIKACHU', level: 20, gender: 'M', ability: 'static', types: ['Electric'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 34, spa: 40, spd: 40, spe: 60 }, maxHP: 60, curHP: 60, exp: 8000, num: 25, sprite: 's800.png',
					moves: [
						{ id: 'thundershock', name: 'ThunderShock', pp: 12, maxPp: 30 },
						{ id: 'growl', name: 'Growl', pp: 40, maxPp: 40 },
						{ id: 'quickattack', name: 'Quick Attack', pp: 30, maxPp: 30 },
						{ id: 'thunderwave', name: 'Thunder Wave', pp: 20, maxPp: 20 },
					],
				},
				{ speciesId: 'eevee', name: 'EEVEE', level: 20, gender: 'F', ability: 'runaway', types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60, exp: 8000, num: 133, sprite: 's4256.png', moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }] },
			]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.menuTap && window.__ow.partyMenu && window.__ow.party?.length === 2)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		// a tap outside the summary is a no-op (guard)
		const guarded = await page.evaluate(() => {
			const ow = window.__ow;
			ow.menuTap('summary-move:1');
			return ow.partyMenu.moveSwap == null && ow.party[0].moves[1].id === 'growl';
		});
		A(guarded, 'summary-move taps are inert while the summary is closed');

		// open the summary; the move rows register as tap zones
		await page.evaluate(() => { const pm = window.__ow.partyMenu; pm.open = true; pm.idx = 0; pm.summary = true; pm.moveSwap = null; });
		await new Promise(r => setTimeout(r, 300)); // let the render loop rebuild menuUi
		const zones = await page.evaluate(() => window.__ow.menuUi.filter(z => z.id.startsWith('summary-move:')).length);
		A(zones === 4, 'all four move rows are tappable zones', zones);

		// arm → cancel on the same slot
		const armCancel = await page.evaluate(() => {
			const ow = window.__ow, out = [];
			ow.menuTap('summary-move:0'); out.push(ow.partyMenu.moveSwap);
			ow.menuTap('summary-move:0'); out.push(ow.partyMenu.moveSwap);
			return out;
		});
		A(armCancel[0] === 0 && armCancel[1] == null, 'tap arms a slot, same-slot tap cancels', JSON.stringify(armCancel));

		// arm slot 0, tap slot 2 → swapped, PP rides along, persisted
		const swapped = await page.evaluate(() => {
			const ow = window.__ow;
			ow.menuTap('summary-move:0');
			ow.menuTap('summary-move:2');
			const m = ow.party[0];
			const saved = JSON.parse(localStorage.getItem('magepunk_party_v1'))[0];
			return {
				armed: ow.partyMenu.moveSwap,
				live: m.moves.map(v => v.id).join(','),
				livePp: `${m.moves[0].pp}/${m.moves[0].maxPp} ${m.moves[2].pp}/${m.moves[2].maxPp}`,
				saved: saved.moves.map(v => v.id).join(','),
			};
		});
		A(swapped.armed == null, 'completing a swap disarms');
		A(swapped.live === 'quickattack,growl,thundershock,thunderwave', 'slots 1 and 3 swapped on the live mon', swapped.live);
		A(swapped.livePp === '30/30 12/30', 'PP travels with its move', swapped.livePp);
		A(swapped.saved === 'quickattack,growl,thundershock,thunderwave', 'the new order persists to the save', swapped.saved);

		// a single-move mon has nothing to swap — tap is inert
		const single = await page.evaluate(() => {
			const ow = window.__ow;
			ow.partyMenu.idx = 1; ow.partyMenu.moveSwap = null;
			ow.menuTap('summary-move:0');
			return ow.partyMenu.moveSwap == null;
		});
		A(single, 'a single-move mon cannot arm a swap');

		A(errors.length === 0, 'no uncaught client errors', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
