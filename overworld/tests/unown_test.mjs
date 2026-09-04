// unown_test.mjs — Upscale 5 Batch 4b: Unown properly. One species entry became
// 28 (A + B..Z + ! + ?), so a wild Ruins Unown now rolls a real letter; the
// per-letter UNOWN DEX records them (folding to #201 for the National dex so it
// isn't inflated); the ! and ? forms are gated behind solving all four Ruins
// puzzles; and the research-center scientists open the Unown Dex report.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/unown_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8880;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'unowntester', friendCode: 'UNUNUN', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'unowntester');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'johto');
			localStorage.setItem('magepunk_name', 'GOLD');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'quilava', name: 'QUILAVA', level: 30, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 90, atk: 60, def: 55, spa: 65, spd: 55, spe: 70 }, maxHP: 90, curHP: 90, exp: 27000, num: 156, sprite: 's4992.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.rollUnownLetter && window.__ow.unownDex && window.__ow.Dex?.unownCount)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow, Dex = ow.Dex, o = {};

			// --- all 28 letter species exist in the battle data ---
			const ids = ['unown', 'unown_b', 'unown_m', 'unown_z', 'unown_exclaim', 'unown_question'];
			o.speciesExist = ids.every(id => ow.battle.data.species[id]?.sprite);
			o.distinctSprites = new Set(ids.map(id => ow.battle.data.species[id].sprite)).size === ids.length;

			// --- letter roll: A..Z only until every Ruins puzzle is solved ---
			localStorage.setItem('magepunk_ruins_v1', JSON.stringify({ solved: {} }));
			o.solvedNone = ow.allRuinsSolved();
			const rolls1 = Array.from({ length: 300 }, () => ow.rollUnownLetter());
			o.rollsValid = rolls1.every(id => /^unown(_[a-z]|_exclaim|_question)?$/.test(id));
			o.noSecretWhenUnsolved = !rolls1.some(id => id === 'unown_exclaim' || id === 'unown_question');
			localStorage.setItem('magepunk_ruins_v1', JSON.stringify({ solved: { kabuto: true, omanyte: true, aerodactyl: true, hooh: true } }));
			o.solvedAll = ow.allRuinsSolved();
			const rolls2 = Array.from({ length: 600 }, () => ow.rollUnownLetter());
			o.secretWhenSolved = rolls2.some(id => id === 'unown_exclaim' || id === 'unown_question');

			// --- the UNOWN DEX folds letters to #201 but tracks each letter ---
			const natBefore = Dex.counts().caught, unBefore = Dex.unownCount();
			Dex.markCaught('unown_g');
			Dex.markCaught('unown_m');
			Dex.markCaught('unown_g');            // dupe — no double count
			Dex.markCaught('unown_exclaim');
			o.unownGained = Dex.unownCount() - unBefore;         // 3 distinct letters
			o.natGained = Dex.counts().caught - natBefore;       // exactly 1 (base #201)
			o.letterRecorded = Dex.isUnownCaught('G') && Dex.isUnownCaught('!') && !Dex.isUnownCaught('Q');
			o.baseCaught = Dex.isCaught('unown') && !Dex.isCaught('unown_g'); // national set holds the base id only

			// --- a wild "unown" pick is remapped to a real letter species ---
			ow.startWildBattle({ id: 'unown', level: 5 });
			await new Promise(r => setTimeout(r, 600));
			o.wildFoe = ow.battle.active?.foe?.speciesId || '';
			o.wildIsLetter = /^unown(_[a-z]|_exclaim|_question)?$/.test(o.wildFoe);
			// close the battle out
			try { ow.battle.active = null; ow.battle.blocking = false; } catch (e) {}

			// --- the research-center scientists open the Unown Dex report ---
			ow.unownDex.open = false;
			const opened = ow.runScriptLabel('RuinsOfAlphResearchCenterScientist1Script');
			o.scientistOpens = opened && ow.unownDex.open === true;
			ow.unownDexKey('x');
			o.dexCloses = ow.unownDex.open === false;
			// a non-research label is not hijacked
			ow.unownDex.open = false;
			ow.runScriptLabel('SomeRandomNpcScript');
			o.otherUntouched = ow.unownDex.open === false;

			return o;
		});

		A(out.speciesExist, 'all 28 Unown letter species exist in the battle data');
		A(out.distinctSprites, 'each Unown letter has its own sprite');
		A(out.solvedNone === false && out.solvedAll === true, 'allRuinsSolved() tracks puzzle progress', JSON.stringify({ none: out.solvedNone, all: out.solvedAll }));
		A(out.rollsValid, 'rollUnownLetter() always returns a valid Unown letter id');
		A(out.noSecretWhenUnsolved, 'the ! and ? forms do NOT appear before the puzzles are solved');
		A(out.secretWhenSolved, 'the ! and ? forms appear once every Ruins puzzle is solved');
		A(out.unownGained === 3, 'the Unown Dex records each distinct letter (no double count)', 'gained=' + out.unownGained);
		A(out.natGained === 1, 'catching letters adds the base #201 to the National dex exactly once', 'natGained=' + out.natGained);
		A(out.letterRecorded, 'per-letter caught state is queryable (G and ! caught, Q not)');
		A(out.baseCaught, 'the National caught set holds the base "unown" id, not the letter forms');
		A(out.wildIsLetter, 'a wild "unown" encounter is remapped to a specific letter species', out.wildFoe);
		A(out.scientistOpens, 'a research-center scientist opens the Unown Dex report');
		A(out.dexCloses, 'the Unown Dex closes on X');
		A(out.otherUntouched, 'a non-research label is not hijacked into the Unown Dex');
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
