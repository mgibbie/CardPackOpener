// movemechanics_test.mjs — Upscale 5 Batch 2: the canonical mechanics restored
// to ~60 damaging moves that were doing plain damage. Boots the real battle
// engine (depth_test pattern) and drives useMove, asserting each mechanic
// actually fires: burn/para secondaries, self-boost-on-hit, recoil, recharge,
// multi-hit (via the "Hit N time(s)!" message), and a statistical flinch check.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/movemechanics_test.mjs
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
const PORT = 8877;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'mm', friendCode: 'MMMMMM', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'mm');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmeleon', name: 'CHARMELEON', level: 40, gender: 'M', ability: 'Blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 120, atk: 90, def: 80, spa: 95, spd: 80, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, num: 5, sprite: 's160.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.startWildBattle && window.__ow.party)), 30000);
		A(ready, 'battle engine ready');
		if (!ready) throw new Error('no battle engine');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, B = ow.battle, data = B.data;
			const Bmod = await import('/overworld/battle.js'); // buildMon is a module export
			ow.party.length = 0;
			ow.party.push(Bmod.buildMon('charizard', 60, data), Bmod.buildMon('blastoise', 60, data));
			ow.startWildBattle({ id: 'snorlax', level: 60 });
			await new Promise(r => setTimeout(r, 700));
			const a = () => B.active;
			for (let i = 0; i < 60 && a()?.phase !== 'menu'; i++) { const q = a()?.queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 40)); }
			// capture the live combatants + their boost objects ONCE and use these
			// refs consistently (a() can return a transient active between turns whose
			// .me/.meBoosts differ, which staled per-call reads). Giant HP so nothing
			// faints mid-drain and the battle never ends.
			const me = a().me, foe = a().foe, meB = a().meBoosts, foeB = a().foeBoosts;
			me.maxHP = 9999; foe.maxHP = 9999; me.ability = null; foe.ability = null;
			// fire a move, collecting every queued message + returning the result
			const fire = (mv, opts = {}) => {
				me.curHP = 9999; foe.curHP = 9999;
				me.status = null; foe.status = null; foe.sleepTurns = 0; foe.flinched = false; me.rechargeTurn = false;
				me.ability = opts.uAbility || null;
				for (const k of Object.keys(meB)) delete meB[k];
				for (const k of Object.keys(foeB)) delete foeB[k];
				const msgs = [];
				B.useMove(me, meB, foe, foeB, { id: mv, name: mv, pp: 30, maxPp: 30 }, false);
				let g = 800; while (a().queue.length && g--) { const e = a().queue.shift(); if (e.text) msgs.push(e.text); e.fn?.(); e.anim?.done?.(); }
				return { msgs, foeStatus: foe.status, meBoosts: { ...meB }, userHP: me.curHP, foeHP: foe.curHP, foeFlinch: foe.flinched, userRecharge: !!me.rechargeTurn };
			};
			// retry until the move lands — Inferno is 50% acc, several here are 90%,
			// and an accuracy miss must not read as a broken mechanic
			const fireHit = (mv, opts) => { let r; for (let i = 0; i < 12; i++) { r = fire(mv, opts); if (!r.msgs.some(t => /missed|avoided|protected|isn't affected/i.test(t))) return r; } return r; };
			const o = {};
			o.inferno = fireHit('inferno').foeStatus;              // 100% burn on hit
			o.nuzzle = fireHit('nuzzle').foeStatus;                // 100% para
			o.flamecharge = fireHit('flamecharge').meBoosts.spe;   // +1 spe
			o.poweruppunch = fireHit('poweruppunch').meBoosts.atk; // +1 atk
			const ss = fireHit('scaleshot'); o.scaleshotSpe = ss.meBoosts.spe; o.scaleshotDef = ss.meBoosts.def; // +1 spe / -1 def
			const recoiled = r => r.msgs.some(t => /damaged by recoil/i.test(t));
			o.woodhammer = recoiled(fireHit('woodhammer'));        // recoil
			o.volttackle = recoiled(fireHit('volttackle'));        // recoil (+ 10% para secondary)
			o.roaroftimeRecharge = fireHit('roaroftime').userRecharge; // recharge sets rechargeTurn
			o.dragondarts = fireHit('dragondarts').msgs.some(t => /Hit 2 time/.test(t));   // multi-hit ×2
			o.twineedle = fireHit('twineedle').msgs.some(t => /Hit 2 time/.test(t));
			o.tripleaxel = fireHit('tripleaxel').msgs.some(t => /Hit 3 time/.test(t));     // ×3
			// flinch is a 20% secondary — statistical: over 40 waterfalls it must land at least once
			let flinched = 0; for (let i = 0; i < 40; i++) if (fire('waterfall').foeFlinch) flinched++;
			o.waterfallFlinch = flinched;
			// a control: a plain move (tackle) leaves no status / boost / recoil
			const ctrl = fire('tackle'); o.ctrlClean = !ctrl.foeStatus && !Object.keys(ctrl.meBoosts).length && ctrl.userHP === 9999;
			return o;
		});

		A(out.inferno === 'brn', 'Inferno burns (100% secondary)', out.inferno);
		A(out.nuzzle === 'par', 'Nuzzle paralyses (100% secondary)', out.nuzzle);
		A(out.flamecharge === 1, 'Flame Charge raises own Speed +1', 'spe=' + out.flamecharge);
		A(out.poweruppunch === 1, 'Power-Up Punch raises own Attack +1', 'atk=' + out.poweruppunch);
		A(out.scaleshotSpe === 1 && out.scaleshotDef === -1, 'Scale Shot: +1 Speed, −1 Defense', JSON.stringify({ spe: out.scaleshotSpe, def: out.scaleshotDef }));
		A(out.woodhammer, 'Wood Hammer deals recoil to the user');
		A(out.volttackle, 'Volt Tackle deals recoil to the user');
		A(out.roaroftimeRecharge === true, 'Roar of Time forces a recharge turn');
		A(out.dragondarts, 'Dragon Darts hits twice (multi-hit)');
		A(out.twineedle, 'Twineedle hits twice (multi-hit)');
		A(out.tripleaxel, 'Triple Axel hits three times (multi-hit)');
		A(out.waterfallFlinch >= 1, 'Waterfall can flinch (20% over 40 tries)', 'flinches=' + out.waterfallFlinch);
		A(out.ctrlClean, 'control: plain Tackle inflicts no status / boost / recoil');
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
