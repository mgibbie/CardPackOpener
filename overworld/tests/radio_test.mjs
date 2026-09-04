// radio_test.mjs — Upscale 5 Batch 4a: the Johto RADIO speaks. Every radio object
// used to print one static march line; now tuning in opens a real channel menu —
// POKeMON MUSIC (BGM swap), OAK'S PKMN TALK (roaming-legendary sightings), BUENA'S
// PASSWORD (daily Blue Points + prize ladder) and the LUCKY CHANNEL (daily lottery
// vs your Trainer ID). Also verifies the new stable Trainer ID.
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/radio_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8879;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'radiotester', friendCode: 'RDRDRD', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
			localStorage.setItem('magepunk_mp_token_v1', 'radiotester');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'johto');
			localStorage.setItem('magepunk_name', 'GOLD');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'quilava', name: 'QUILAVA', level: 30, gender: 'M', ability: 'blaze', types: ['Fire'], ivs: { hp: 20, atk: 20, def: 20, spa: 20, spd: 20, spe: 20 }, stats: { hp: 90, atk: 60, def: 55, spa: 65, spd: 55, spe: 70 }, maxHP: 90, curHP: 90, exp: 27000, num: 156, sprite: 's4992.png', moves: [{ id: 'ember', name: 'Ember', pp: 25, maxPp: 25 }] }]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.runScriptLabel && window.__ow.radioMenu && window.__ow.oakTalkText)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		const out = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

			// --- a std radio label opens the tune-in menu; a non-radio label does not ---
			ow.radioMenu.open = false;
			const openedByRadio = ow.runScriptLabel('KurtsHouseRadio');
			o.radioOpens = openedByRadio && ow.radioMenu.open === true;
			ow.radioMenu.open = false;
			const introRadio = ow.runScriptLabel('PlayersHouseRadioScript'); // ends in "Script" — must be left alone
			o.introRadioUntouched = ow.radioMenu.open === false;

			// --- POKeMON MUSIC swaps the BGM, TURN IT OFF restores it ---
			ow.openRadio(); ow.radioMenu.idx = 0;
			ow.radioKey('z');                             // pick POKeMON MUSIC
			o.tuneSet = /^crystal_MUSIC_/.test(ow.radioTune || '');
			let g = 8; while (ow.dialog.blocking && g--) ow.dialog.key('z'); // close the "now playing" dialog
			o.reopenedAfterDialog = ow.radioMenu.open === true;   // dialog onClose reopens the menu
			ow.radioMenu.idx = 4; ow.radioKey('z');       // TURN IT OFF
			o.tuneCleared = ow.radioTune === null && ow.radioMenu.open === false;

			// --- OAK'S PKMN TALK reports roamer sightings ---
			localStorage.setItem('magepunk_roamers_v1', JSON.stringify({ raikou: { map: 'Route38', hp: null, seen: false } }));
			o.oakWithRoamer = ow.oakTalkText();
			localStorage.setItem('magepunk_roamers_v1', JSON.stringify({}));
			o.oakNoRoamer = ow.oakTalkText();

			// --- Trainer ID is a stable 5-digit id ---
			o.tid1 = ow.playerTID(); o.tid2 = ow.playerTID(); o.tidStr = ow.tidStr();

			// --- BUENA'S PASSWORD: one point per day, "already tuned in" on repeat ---
			localStorage.removeItem('magepunk_buena_v1');
			o.buena1 = ow.buenaText();
			o.buena2 = ow.buenaText();                    // same day → no second point
			o.buenaState1 = JSON.parse(localStorage.getItem('magepunk_buena_v1'));
			// prize ladder: seed 2 points (claimed 0) as of yesterday → next tune-in hits 3 → prize
			const ballsBefore = ow.Bag.count('pokeball');
			localStorage.setItem('magepunk_buena_v1', JSON.stringify({ date: 'Thu Jan 01 1970', points: 2, claimed: 0 }));
			o.buenaPrizeMsg = ow.buenaText();
			o.buenaBallsGained = ow.Bag.count('pokeball') - ballsBefore;

			// --- LUCKY CHANNEL: daily draw, idempotent, and a crafted jackpot ---
			localStorage.removeItem('magepunk_lottery_v1');
			o.lucky1 = ow.luckyText();
			o.lucky2 = ow.luckyText();                    // same day → "come back tomorrow"
			// craft a guaranteed jackpot: blank the account so the TID falls to the
			// local key, then set that key equal to today's drawn number.
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({}));
			localStorage.removeItem('magepunk_name');
			localStorage.removeItem('magepunk_lottery_v1');
			const today = new Date().toDateString();
			const draw = String(hashStr('lotto:' + today) % 100000).padStart(5, '0');
			localStorage.setItem('magepunk_tid', String(parseInt(draw, 10)));
			const mbBefore = ow.Bag.count('masterball');
			o.jackpotMsg = ow.luckyText();
			o.jackpotTid = ow.tidStr();
			o.jackpotMbGained = ow.Bag.count('masterball') - mbBefore;
			return o;
		});

		A(out.radioOpens, 'a std radio label (KurtsHouseRadio) opens the tune-in menu');
		A(out.introRadioUntouched, 'the intro tutorial radio (…RadioScript) is NOT hijacked');
		A(out.tuneSet, 'POKeMON MUSIC swaps the BGM to a station track', out.tuneSet);
		A(out.reopenedAfterDialog, 'the menu reopens after the channel dialog closes');
		A(out.tuneCleared, 'TURN IT OFF clears the radio tune and closes the menu');
		A(/RAIKOU/.test(out.oakWithRoamer) && /ROUTE 38/.test(out.oakWithRoamer), "OAK'S PKMN TALK reports the roamer's location", out.oakWithRoamer);
		A(/OAK/.test(out.oakNoRoamer) && !/spotted|near ROUTE/i.test(out.oakNoRoamer), "OAK'S PKMN TALK falls back to a tip with no roamers", out.oakNoRoamer);
		A(Number.isInteger(out.tid1) && out.tid1 >= 0 && out.tid1 < 100000, 'Trainer ID is an integer 0–99999', out.tid1);
		A(out.tid1 === out.tid2 && out.tidStr.length === 5, 'Trainer ID is stable and zero-padded to 5 digits', JSON.stringify({ a: out.tid1, s: out.tidStr }));
		A(/\+1 Blue Point/.test(out.buena1), "BUENA'S PASSWORD awards a Blue Point on tune-in", out.buena1);
		A(/already tuned in/i.test(out.buena2), "BUENA'S PASSWORD is once-per-day", out.buena2);
		A(out.buenaState1 && out.buenaState1.points === 1, 'Buena banked exactly one point for the day', JSON.stringify(out.buenaState1));
		A(/★/.test(out.buenaPrizeMsg) && out.buenaBallsGained === 5, 'Buena hands a ladder prize when the balance crosses a threshold', JSON.stringify({ msg: out.buenaPrizeMsg, gained: out.buenaBallsGained }));
		A(/Lucky Number is \d{5}/.test(out.lucky1), 'LUCKY CHANNEL draws a 5-digit number', out.lucky1);
		A(/come back tomorrow/i.test(out.lucky2), 'LUCKY CHANNEL is once-per-day', out.lucky2);
		A(/GRAND PRIZE/.test(out.jackpotMsg) && out.jackpotMbGained === 1, 'LUCKY CHANNEL pays the jackpot on a full ID match', JSON.stringify({ tid: out.jackpotTid, gained: out.jackpotMbGained }));
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
