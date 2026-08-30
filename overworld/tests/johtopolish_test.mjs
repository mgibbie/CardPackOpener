// johtopolish_test.mjs — Johto brought up to Kanto/Hoenn's level.
//   • SIGNS: its 200+ signposts were all blank (the maps shipped with their
//     bg_events but no text). tools/gen_johto_signs.mjs walks pokecrystal's
//     script -> text chain; this asserts the coverage landed and that a sign
//     actually READS in game (walk up, press Z, get the authentic words).
//   node overworld/tests/johtopolish_test.mjs
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
const PORT = 8865;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const seedMon = {
	speciesId: 'rattata', name: 'RATTATA', level: 5, gender: 'M', friend: 70,
	types: ['Normal'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
};

// ---------- static: sign coverage across every Johto map ----------
const MAPS = path.join(ROOT, 'overworld/data/maps');
const SIGNS = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/sign_texts.json'), 'utf8'));
const JOHTO = /^(NewBark|Cherrygrove|Violet|Azalea|Goldenrod|Ecruteak|Olivine|Cianwood|Mahogany|Blackthorn|Route(2[6-9]|3[0-9]|4[0-6])|Union|Ilex|Slowpoke|Ruins|Sprout|Burned|TinTower|Whirl|MountMortar|DarkCave|LakeOfRage|IcePath|Radio)/;
// Interactive furniture rides the same bg_event type as signposts but isn't one
// and legitimately has no text to read: elevators and their floor pickers, game
// machines, Silph Co's card-key doors, Battle Frontier record boards, cave
// puzzle triggers, vending machines, PCs.
const NOT_A_SIGN = /ElevatorButton|ElevatorScript|Elevator|FloorSelect|MachineScript|Radio$|CardFlip|LuckySlots|Slots|Roulette|_EventScript_Door\d*$|Show\w*Results|Rankings|Record|CaveEntrance|Vending|_PC$|^0x0$|Painting/;
let total = 0, withText = 0; const missing = [];
for (const f of fs.readdirSync(MAPS)) {
	if (!f.endsWith('_map.json') || !JOHTO.test(f)) continue;
	const m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8'));
	for (const b of (m.bg_events || [])) {
		if (!/sign/i.test(b.type || '') || !b.script) continue;
		if (NOT_A_SIGN.test(b.script)) continue;
		total++;
		if (SIGNS[b.script]) withText++; else missing.push(f.replace('_map.json', '') + ':' + b.script);
	}
}
A(total > 180, `Johto has a real signpost population (${total})`);
A(missing.length === 0, 'every Johto signpost has text', missing.slice(0, 5).join(', '));
A(withText === total, `coverage is complete (${withText}/${total})`);

// ---------- and the same sweep across EVERY region ----------
// (gen_sign_texts.mjs also reads the FireRed/Emerald .inc dialect, so Kanto,
// JohKanto and Hoenn signs — bookshelves, plaques, town signs — read too)
let allSigns = 0, allText = 0; const allMissing = [];
for (const f of fs.readdirSync(MAPS)) {
	if (!f.endsWith('_map.json')) continue;
	const m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8'));
	for (const b of (m.bg_events || [])) {
		if (!/sign/i.test(b.type || '') || !b.script || NOT_A_SIGN.test(b.script)) continue;
		// Battle Frontier record boards + cave-entrance puzzle triggers are
		// interactive machinery, not signs, and correctly stay silent
		if (/^BattleFrontier_|_EventScript_Show\w*Results|CaveEntrance|^0x0$/.test(b.script)) continue;
		allSigns++;
		if (SIGNS[b.script]) allText++; else allMissing.push(f.replace('_map.json', '') + ':' + b.script);
	}
}
A(allSigns > 1300, `the whole game has a big signpost population (${allSigns})`);
// A hard floor rather than a chase to 100%: the long tail is interactive
// furniture that shares the sign bg_event type (contest-winner portraits, the
// berry blender, link machines) and has nothing to read. 90% catches the thing
// that matters — a re-transpile blanking a region's signs again.
const cov = allText / allSigns;
A(cov > 0.9, `game-wide sign coverage holds (${allText}/${allSigns} = ${Math.round(cov * 100)}%)`,
	allMissing.slice(0, 4).join(', '));
A(/LITTLEROOT TOWN/.test(SIGNS.LittlerootTown_EventScript_TownSign || ''), 'HOENN: Littleroot\'s town sign reads');
A((SIGNS.AcademyBookshelf || '').length > 5, 'JOHKANTO: a bookshelf reads');
// the words are the authentic ones, not placeholders
A(/AZALEA TOWN/.test(SIGNS.AzaleaTownSign || ''), 'Azalea\'s town sign carries its real text');
A(/BUGSY/.test(SIGNS.AzaleaGymSign || ''), 'the gym sign names its leader');
A(/NEW BARK TOWN/.test(SIGNS.NewBarkTownSign || ''), 'New Bark\'s sign is there');
A((SIGNS.SlowpokeWellSign || '').length > 60, 'a long flavour sign kept its paragraphs');

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, mon) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
				localStorage.setItem('magepunk_region', 'JOHTO');
			} catch {}
		}, STATE, seedMon);
		// AzaleaTown's town sign sits at (19,9); stand just below it, facing up
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=AzaleaTown&x=19&y=10`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.signTexts)), 30000);
		A(ready, 'boot: Azalea Town, sign texts loaded');
		if (!ready) throw new Error('boot failed');

		const loaded = await page.evaluate(() => Object.keys(window.__ow.signTexts || {}).length);
		A(loaded > 1000, `the shipped sign table loaded (${loaded} entries)`);

		const read = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.player.facing = 'up';
			ow.interact();
			await new Promise(r => setTimeout(r, 300));
			const d = ow.dialog;
			// the dialog stores its pages; grab whatever text it is showing
			return { blocking: !!d.blocking, text: JSON.stringify(d.pages || d.text || '').slice(0, 200) };
		});
		A(read.blocking, 'reading the sign opens a dialog');
		A(/AZALEA TOWN/.test(read.text), 'and it shows the authentic sign text', read.text);

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
