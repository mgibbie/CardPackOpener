// round2_test.mjs — Upscale 5 Batch 6 follow-up: round-2 rosters. A VS Seeker
// rematch used to only bump levels. Now a re-armed BOSS (gym leader / E4 / etc.)
// also modernises its movesets (higher-level learnset instead of the fixed
// low-level roster moves) and fills its squad out toward six. Ordinary trainers
// are untouched. Drives trainers.buildBattle directly (the trainerdepth pattern).
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/round2_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8885;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'r2', friendCode: 'R2R2R2', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
	try {
		const page = await browser.newPage();
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'r2');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmander', name: 'CHARMANDER', level: 10, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 30, atk: 18, def: 16, spa: 20, spd: 16, spe: 20 }, maxHP: 30, curHP: 30, exp: 1000, num: 4, sprite: 's128.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.trainers?.data && window.__ow.trainers.buildBattle)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, T = ow.trainers, data = ow.battle.data, o = {};
			const t = { ev: { local_id: 'BLAINE_R2', script: 'CinnabarIsland_Gym_EventScript_Blaine', graphics_id: 'zz_no_pool' }, tx: 3, ty: 3 };
			const ace = p => p.reduce((a, m) => (m.level > (a?.level ?? -1) ? m : a), null);
			const moveIds = m => (m?.moves || []).map(x => x.id).sort();

			// BASELINE — no rematch armed
			T.rematch = {};
			const b0 = T.buildBattle(t, data);
			o.baseLen = b0.party.length;
			o.baseMax = Math.max(...b0.party.map(m => m.level));
			o.baseAceMoves = moveIds(ace(b0.party));
			o.baseName = b0.info.displayName;

			// ROUND 2 — arm a tier-2 rematch on this exact trainer key
			T.rematch = {}; T.rematch[T.keyOf(t)] = 2;
			const b1 = T.buildBattle(t, data);
			o.r2Len = b1.party.length;
			o.r2Max = Math.max(...b1.party.map(m => m.level));
			o.r2AceMoves = moveIds(ace(b1.party));
			o.r2Name = b1.info.displayName;

			// CONTROL — an ordinary (non-boss) trainer with a rematch armed is NOT padded
			const plain = { ev: { local_id: 'YOUNGSTER_R2', script: 'no_such_roster', graphics_id: 'zz_no_pool' }, tx: 4, ty: 4 };
			T.rematch = {}; T.rematch[T.keyOf(plain)] = 2;
			const bp = T.buildBattle(plain, data);
			o.plainLen = bp.party.length; // class-pool fallback: 1–2 mons, never padded to 6
			return o;
		});

		A(out.baseLen === 4, 'baseline Blaine fields his authored 4-mon team', out.baseLen);
		A(out.r2Len === 6, 'a round-2 rematch fills the squad out toward six', out.r2Len);
		A(out.r2Max === out.baseMax + 4, 'a tier-2 rematch adds +4 levels (2/tier)', JSON.stringify({ base: out.baseMax, r2: out.r2Max }));
		A(JSON.stringify(out.r2AceMoves) !== JSON.stringify(out.baseAceMoves), 'the rematch ace modernises its moveset (learnset, not the fixed roster moves)', JSON.stringify({ base: out.baseAceMoves, r2: out.r2AceMoves }));
		A(/rematch/.test(out.r2Name) && !/rematch/.test(out.baseName), 'the rematch is labelled', JSON.stringify({ base: out.baseName, r2: out.r2Name }));
		A(out.plainLen < 6, 'an ordinary trainer is not padded on rematch (levels only)', out.plainLen);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
