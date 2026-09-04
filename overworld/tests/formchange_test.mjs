// formchange_test.mjs — Upscale 5 Batch 3: the mid-battle form-change subsystem.
// Stance Change (Aegislash), Zen Mode (Darmanitan), Schooling (Wishiwashi),
// Power Construct (Zygarde), Forecast (Castform), Hunger Switch (Morpeko). Boots
// the real battle engine and drives changeForm's triggers — HP thresholds via
// checkFormTriggers, weather via Forecast, attack/shield via useMove, the per-turn
// flip via endOfTurn — asserting stats/types/form actually swap.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/formchange_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8878;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'fc', friendCode: 'FCFCFC', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'fc');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'charmeleon', name: 'CHARMELEON', level: 40, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 120, atk: 90, def: 80, spa: 95, spd: 80, spe: 90 }, maxHP: 120, curHP: 120, exp: 64000, num: 5, sprite: 's160.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.startWildBattle && window.__ow.party)), 30000);
		A(ready, 'battle engine ready');
		if (!ready) throw new Error('no engine');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, B = ow.battle, data = B.data;
			const Bmod = await import('/overworld/battle.js');
			// start a throwaway wild battle so a.me/a.foe/boosts exist, then swap in
			// the mon under test as a.me. giant-HP foe so nothing ends the battle.
			ow.party.length = 0; ow.party.push(Bmod.buildMon('charizard', 60, data));
			ow.startWildBattle({ id: 'snorlax', level: 60 });
			await new Promise(r => setTimeout(r, 700));
			const a = () => B.active;
			for (let i = 0; i < 60 && a()?.phase !== 'menu'; i++) { const q = a()?.queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); } await new Promise(r => setTimeout(r, 40)); }
			a().foe.maxHP = 9999; a().foe.curHP = 9999; a().foe.ability = null;
			const drain = () => { let g = 800; const msgs = []; while (a().queue.length && g--) { const e = a().queue.shift(); if (e.text) msgs.push(e.text); e.fn?.(); e.anim?.done?.(); } return msgs; };
			// install a fresh test mon as the player's active
			const put = (speciesId, level, ability) => {
				const mon = Bmod.buildMon(speciesId, level, data);
				mon.ability = ability;
				a().me = mon; a().meBoosts = { atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 };
				return mon;
			};
			const o = {};

			// --- ZEN MODE: Darmanitan below 50% HP flips to Zen (Fire/Psychic, huge Sp.Atk) ---
			{
				const m = put('darmanitan', 50, 'zenmode');
				const baseSpa = m.stats.spa, baseForm = m.form || m.speciesId;
				m.curHP = Math.floor(m.maxHP * 0.4);
				B.checkFormTriggers();
				o.zenBaseForm = baseForm; o.zenForm = m.form; o.zenTypes = [...m.types]; o.zenSpaUp = m.stats.spa > baseSpa;
				// heal back above 50% → reverts to normal (Zen Mode is two-way)
				m.curHP = Math.floor(m.maxHP * 0.7);
				B.checkFormTriggers();
				o.zenReverted = (m.form || m.speciesId);
			}

			// --- SCHOOLING: Wishiwashi (Lv20+) above 25% HP is School; below → Solo; Lv<20 never schools ---
			{
				const m = put('wishiwashi', 30, 'schooling');
				const soloAtk = m.stats.atk;
				B.checkFormTriggers(); // full HP → School
				o.schoolForm = m.form; o.schoolAtkUp = m.stats.atk > soloAtk * 3;
				m.curHP = Math.floor(m.maxHP * 0.2);
				B.checkFormTriggers(); // below 25% → Solo
				o.schoolReverted = (m.form || m.speciesId);
				// a low-level Wishiwashi cannot School even at full HP
				const low = put('wishiwashi', 12, 'schooling');
				B.checkFormTriggers();
				o.lowLevelForm = (low.form || low.speciesId);
			}

			// --- POWER CONSTRUCT: Zygarde below 50% assembles into Complete (one-way, big HP gain) ---
			{
				const m = put('zygarde', 60, 'powerconstruct');
				const baseMax = m.maxHP;
				m.curHP = Math.floor(m.maxHP * 0.4);
				const beforeCur = m.curHP;
				B.checkFormTriggers();
				o.pcForm = m.form; o.pcMaxUp = m.maxHP > baseMax; o.pcCurGained = m.curHP > beforeCur;
				// heal to full — one-way, must STAY Complete
				m.curHP = m.maxHP;
				B.checkFormTriggers();
				o.pcStaysComplete = (m.form === 'zygarde_complete');
			}

			// --- FORECAST: Castform matches the sky ---
			{
				const m = put('castform', 40, 'forecast');
				a().weather = { kind: 'sun', turns: 5 };  B.checkFormTriggers(); o.sunForm = m.form; o.sunTypes = [...m.types];
				a().weather = { kind: 'rain', turns: 5 }; B.checkFormTriggers(); o.rainForm = m.form; o.rainTypes = [...m.types];
				a().weather = null;                        B.checkFormTriggers(); o.clearForm = (m.form || m.speciesId); o.clearTypes = [...m.types];
			}

			// --- STANCE CHANGE: Aegislash draws its blade to attack, sheathes on King's Shield ---
			{
				const m = put('aegislash', 55, 'stancechange');
				const shieldAtk = m.stats.atk, shieldSprite = m.sprite;
				B.useMove(m, a().meBoosts, a().foe, a().foeBoosts, { id: 'tackle', name: 'Tackle', pp: 30, maxPp: 30 }, false); drain();
				o.bladeForm = m.form; o.bladeAtkUp = m.stats.atk > shieldAtk;
				B.useMove(m, a().meBoosts, a().foe, a().foeBoosts, { id: 'kingsshield', name: "King's Shield", pp: 10, maxPp: 10 }, false); drain();
				o.sheathedForm = (m.form || m.speciesId); o.sheathedAtkBack = m.stats.atk === shieldAtk;
			}

			// --- HUNGER SWITCH: Morpeko flips Full Belly ↔ Hangry each end of turn ---
			{
				const m = put('morpeko', 45, 'hungerswitch');
				m.curHP = m.maxHP; a().foe.curHP = 9999;
				const f0 = (m.form || m.speciesId);
				B.endOfTurn(); drain();
				const f1 = (m.form || m.speciesId);
				B.endOfTurn(); drain();
				const f2 = (m.form || m.speciesId);
				o.hungerStart = f0; o.hungerAfter1 = f1; o.hungerAfter2 = f2;
			}
			return o;
		});

		A(out.zenBaseForm === undefined || out.zenBaseForm === 'darmanitan', 'Zen Mode: Darmanitan starts in its normal form', out.zenBaseForm);
		A(out.zenForm === 'darmanitan_zen', 'Zen Mode: below 50% HP → Zen form', out.zenForm);
		A(out.zenTypes.includes('Psychic'), 'Zen Mode: gains the Psychic type', JSON.stringify(out.zenTypes));
		A(out.zenSpaUp, 'Zen Mode: Sp. Atk recomputed higher (30→140 base)');
		A(out.zenReverted === 'darmanitan', 'Zen Mode: healing back above 50% reverts to normal', out.zenReverted);

		A(out.schoolForm === 'wishiwashi_school', 'Schooling: full HP at Lv30 → School form', out.schoolForm);
		A(out.schoolAtkUp, 'Schooling: Attack recomputed far higher (20→140 base)');
		A(out.schoolReverted === 'wishiwashi', 'Schooling: below 25% HP → Solo form', out.schoolReverted);
		A(out.lowLevelForm === 'wishiwashi', 'Schooling: a Lv12 Wishiwashi cannot School', out.lowLevelForm);

		A(out.pcForm === 'zygarde_complete', 'Power Construct: below 50% → Complete Forme', out.pcForm);
		A(out.pcMaxUp, 'Power Construct: max HP jumps (108→216 base)');
		A(out.pcCurGained, 'Power Construct: current HP gains the added max');
		A(out.pcStaysComplete, 'Power Construct: one-way — stays Complete after healing');

		A(out.sunForm === 'castform_sunny' && out.sunTypes.includes('Fire'), 'Forecast: sun → Sunny (Fire)', JSON.stringify({ f: out.sunForm, t: out.sunTypes }));
		A(out.rainForm === 'castform_rainy' && out.rainTypes.includes('Water'), 'Forecast: rain → Rainy (Water)', JSON.stringify({ f: out.rainForm, t: out.rainTypes }));
		A(out.clearForm === 'castform' && out.clearTypes.includes('Normal'), 'Forecast: clear sky → Normal', JSON.stringify({ f: out.clearForm, t: out.clearTypes }));

		A(out.bladeForm === 'aegislash_blade', 'Stance Change: an attack → Blade Forme', out.bladeForm);
		A(out.bladeAtkUp, 'Stance Change: Attack recomputed higher in Blade Forme (50→140 base)');
		A(out.sheathedForm === 'aegislash', "Stance Change: King's Shield → Shield Forme", out.sheathedForm);
		A(out.sheathedAtkBack, 'Stance Change: Attack returns to the Shield value');

		A(out.hungerStart === 'morpeko', 'Hunger Switch: Morpeko begins Full Belly', out.hungerStart);
		A(out.hungerAfter1 === 'morpeko_hangry', 'Hunger Switch: flips to Hangry after a turn', out.hungerAfter1);
		A(out.hungerAfter2 === 'morpeko', 'Hunger Switch: flips back to Full Belly next turn', out.hungerAfter2);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
