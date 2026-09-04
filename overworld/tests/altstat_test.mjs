// altstat_test.mjs — Upscale 5 Batch 2b: alt-stat damage. Body Press uses the
// USER's Defense as its attacking stat, Foul Play uses the TARGET's Attack, and
// Psyshock (a Special move) is measured against the target's Defense. Verified
// by manipulating the relevant stat and confirming the damage tracks it.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/altstat_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8875;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'as', friendCode: 'ASASAS', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'as');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmeleon', name: 'CHARMELEON', level: 40, gender: 'M', ability: 'Blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 120, atk: 90, def: 80, spa: 95, spd: 80, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, num: 5, sprite: 's160.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.startWildBattle && window.__ow.party)), 30000);
		A(ready, 'battle engine ready');
		if (!ready) throw new Error('no engine');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, B = ow.battle;
			const Bmod = await import('/overworld/battle.js');
			ow.party.length = 0; ow.party.push(Bmod.buildMon('machamp', 60, B.data), Bmod.buildMon('blastoise', 60, B.data));
			ow.startWildBattle({ id: 'snorlax', level: 60 });
			await new Promise(r => setTimeout(r, 700));
			const a = () => B.active;
			for (let i = 0; i < 60 && a()?.phase !== 'menu'; i++) { const q = a()?.queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 40)); }
			const me = a().me, foe = a().foe, meB = a().meBoosts, foeB = a().foeBoosts;
			me.ability = null; foe.ability = null;
			// deal a move once and return the damage dealt to the foe (start at full)
			const dmg = (mv, setup) => {
				me.stats = { hp: 300, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
				foe.stats = { hp: 9999, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 };
				me.maxHP = 300; me.curHP = 300; foe.maxHP = 9999; foe.curHP = 9999;
				me.status = null; foe.status = null;
				// reset boost stages to 0 (keeping the keys — an undefined stage NaNs stageMult)
				for (const st of ['atk', 'def', 'spa', 'spd', 'spe', 'acc', 'eva']) { meB[st] = 0; foeB[st] = 0; }
				if (setup) setup(me, foe);
				B.useMove(me, meB, foe, foeB, { id: mv, name: mv, pp: 30, maxPp: 30 }, false);
				let g = 800; while (a().queue.length && g--) { const e = a().queue.shift(); e.fn?.(); e.anim?.done?.(); }
				return 9999 - foe.curHP;
			};
			// median of a few (crit RNG) — take the min to dodge crits
			const dmgMin = (mv, setup) => Math.min(...Array.from({ length: 5 }, () => dmg(mv, setup)));
			const o = {};
			// Body Press uses the USER's Defense: high def >> low def, holding atk fixed
			o.bpHighDef = dmgMin('bodypress', (m) => { m.stats.atk = 60; m.stats.def = 250; });
			o.bpLowDef = dmgMin('bodypress', (m) => { m.stats.atk = 60; m.stats.def = 60; });
			// control: a normal physical move (Tackle) does NOT scale with the user's Defense
			o.tkHighDef = dmgMin('tackle', (m) => { m.stats.atk = 60; m.stats.def = 250; });
			o.tkLowDef = dmgMin('tackle', (m) => { m.stats.atk = 60; m.stats.def = 60; });
			// Foul Play uses the TARGET's Attack: high foe atk >> low foe atk
			o.fpHighFoeAtk = dmgMin('foulplay', (m, f) => { f.stats.atk = 300; });
			o.fpLowFoeAtk = dmgMin('foulplay', (m, f) => { f.stats.atk = 40; });
			// Psyshock (Special) is measured against the foe's DEFENSE: raising the
			// foe's Defense cuts it, while raising Sp.Def does not
			o.psHighDef = dmgMin('psyshock', (m, f) => { f.stats.def = 400; f.stats.spd = 60; });
			o.psHighSpd = dmgMin('psyshock', (m, f) => { f.stats.def = 60; f.stats.spd = 400; });
			return o;
		});

		A(out.bpHighDef > out.bpLowDef * 1.8, 'Body Press scales with the USER\'s Defense', JSON.stringify({ hi: out.bpHighDef, lo: out.bpLowDef }));
		A(Math.abs(out.tkHighDef - out.tkLowDef) <= Math.max(2, out.tkHighDef * 0.15), 'control: Tackle is unaffected by the user\'s Defense', JSON.stringify({ hi: out.tkHighDef, lo: out.tkLowDef }));
		A(out.fpHighFoeAtk > out.fpLowFoeAtk * 1.8, 'Foul Play scales with the TARGET\'s Attack', JSON.stringify({ hi: out.fpHighFoeAtk, lo: out.fpLowFoeAtk }));
		A(out.psHighSpd > out.psHighDef * 1.8, 'Psyshock is measured against the target\'s Defense (not Sp. Def)', JSON.stringify({ vsDef: out.psHighDef, vsSpd: out.psHighSpd }));
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
