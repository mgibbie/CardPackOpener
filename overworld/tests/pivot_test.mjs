// pivot_test.mjs — Upscale 5 Batch 2c: pivot moves (U-turn / Volt Switch / Flip
// Turn) deal damage, then the user switches out to a benchmon. Player side in a
// wild battle, foe side in a trainer battle. Standalone (headless Chrome):
//   node overworld/tests/pivot_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8874;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'pv', friendCode: 'PVPVPV', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'pv');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmeleon', name: 'CHARMELEON', level: 40, gender: 'M', ability: 'Blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 120, atk: 90, def: 80, spa: 95, spd: 80, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, num: 5, sprite: 's160.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.startWildBattle && window.__ow.party)), 30000);
		A(ready, 'battle engine ready');
		if (!ready) throw new Error('no engine');

		// --- player pivot in a wild battle ---
		const wild = await page.evaluate(async () => {
			const ow = window.__ow, B = ow.battle;
			const Bmod = await import('/overworld/battle.js');
			ow.party.length = 0; ow.party.push(Bmod.buildMon('scizor', 50, B.data), Bmod.buildMon('blastoise', 50, B.data));
			ow.startWildBattle({ id: 'snorlax', level: 50 });
			await new Promise(r => setTimeout(r, 700));
			const a = () => B.active;
			for (let i = 0; i < 60 && a()?.phase !== 'menu'; i++) { const q = a()?.queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 40)); }
			const foe = a().foe; foe.maxHP = 9999; foe.curHP = 9999; foe.ability = null;
			const before = a().me.speciesId, benchId = ow.party[1].speciesId;
			B.useMove(a().me, a().meBoosts, foe, a().foeBoosts, { id: 'uturn', name: 'U-turn', pp: 30, maxPp: 30 }, false);
			let g = 800, msgs = []; while (a().queue.length && g--) { const e = a().queue.shift(); if (e.text) msgs.push(e.text); e.fn?.(); e.anim?.done?.(); }
			return { before, benchId, afterActive: a().me.speciesId, foeDmg: 9999 - foe.curHP, switched: msgs.some(t => /went back/i.test(t)) };
		});
		A(wild.foeDmg > 0, 'player U-turn deals damage', 'dmg=' + wild.foeDmg);
		A(wild.afterActive === wild.benchId && wild.afterActive !== wild.before, 'player U-turn switches the active mon to the benchmon', JSON.stringify(wild));
		A(wild.switched, 'the switch is announced');

		// --- foe pivot in a trainer battle ---
		const trainer = await page.evaluate(async () => {
			const ow = window.__ow, B = ow.battle;
			const Bmod = await import('/overworld/battle.js');
			const party = [Bmod.buildMon('blastoise', 50, B.data)];
			const foes = [Bmod.buildMon('scizor', 50, B.data), Bmod.buildMon('pidgeot', 50, B.data)];
			await new Promise((res) => { B.startTrainer(party, foes, { displayName: 'ACE TRAINER', boss: true }, () => {}); setTimeout(res, 900); });
			const a = () => B.active;
			for (let i = 0; i < 60 && a()?.phase !== 'menu'; i++) { const q = a()?.queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 40)); }
			const me = a().me; me.maxHP = 9999; me.curHP = 9999; me.ability = null;
			const beforeFoe = a().foe.speciesId;
			// the FOE uses U-turn (isFoe = true)
			B.useMove(a().foe, a().foeBoosts, a().me, a().meBoosts, { id: 'uturn', name: 'U-turn', pp: 30, maxPp: 30 }, true);
			let g = 800, msgs = []; while (a().queue.length && g--) { const e = a().queue.shift(); if (e.text) msgs.push(e.text); e.fn?.(); e.anim?.done?.(); }
			return { beforeFoe, afterFoe: a().foe.speciesId, switched: msgs.some(t => /withdrew/i.test(t)) };
		});
		A(trainer.afterFoe !== trainer.beforeFoe, 'foe U-turn switches the opponent to its benchmon', JSON.stringify(trainer));
		A(trainer.switched, 'the foe switch is announced');
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
