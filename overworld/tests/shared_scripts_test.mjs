// shared_scripts_test.mjs — the script bodies the decomps keep outside the map files.
//
// transpile_scripts.py only walks data/maps/<Map>/scripts.inc. FireRed and Emerald
// also keep bodies in data/scripts/*.inc (96 files) and data/event_scripts.s (the
// Common_EventScript_* family) — and some maps point at labels defined in ANOTHER
// map's file: every Silph Co floor shares one door script, the Dotted Hole's four
// basements share 1F's, Trainer Tower's floors share one owner.
//
// The engine loads exactly ONE map's script file, so all of that resolved to
// nothing and the object stood there mute. 831 events across the port were in
// that state. This is the FireRed/Emerald counterpart of Crystal's dropped
// `jumpstd`, which crystal_stds.js fixed the same way.
//
// The trap this test exists for: a `msg` whose text label resolves nowhere falls
// through to printing THE LABEL. Shipping bodies without their strings would put
// ~490 NPCs on screen reciting "gText_PokemonCenterSign" — strictly worse than
// leaving them mute. So the bodies and their text must arrive together.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/shared_scripts_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const shared = JSON.parse(fs.readFileSync(path.join(D, 'shared_scripts.json'), 'utf8'));

// ---------- the table ----------
{
	A(shared.scripts && shared.strings, 'shared_scripts.json carries both bodies and their text');
	A(Object.keys(shared.scripts).length > 300, `${Object.keys(shared.scripts).length} shared script bodies recovered`);
	// the families this was written for, each from a different kind of hiding place
	for (const [what, re] of [
		['SILPH CO doors (data/scripts/silphco_doors.inc)', /^SilphCo_\d+F_EventScript_Door$/],
		['move tutors (data/scripts/move_tutors.inc)', /EventScript_\w*Tutor$/],
		['Common_EventScript_* (data/event_scripts.s)', /^Common_EventScript_/],
		// cross-map: the braille panels are named for the basement they sit on but
		// are DEFINED in SixIsland_DottedHole_1F's file, which no basement loads
		['the Dotted Hole braille (defined in another MAP\'s file)', /^SixIsland_DottedHole_B\d+F_EventScript_Braille/],
		['Safari Zone corners (defined in SafariZone_South\'s file)', /^SafariZone_(North|South)east_EventScript_/],
	]) {
		A(Object.keys(shared.scripts).some(k => re.test(k)), `recovered ${what}`);
	}
	// EVERY msg must resolve, or the NPC recites its own label
	const RUNTIME_BUFFER = /^gStringVar|^gSpecialVar/;
	const bad = [];
	let msgs = 0;
	for (const [label, ops] of Object.entries(shared.scripts)) {
		for (const s of ops) {
			if (s?.op !== 'msg' || typeof s.text !== 'string') continue;
			msgs++;
			if (shared.strings[s.text] == null && !RUNTIME_BUFFER.test(s.text)) bad.push(`${label}:${s.text}`);
		}
	}
	A(bad.length === 0, `all ${msgs} msg ops resolve to real text (none would speak its own label)`, bad.slice(0, 5).join(', '));
}

// ---------- the families deliberately left out ----------
// Bodies that fight a system already owning the object are worse than no body —
// the same call crystal_stds.js made about Strength boulders.
{
	const SKIP = /cable_club|UnionRoom_EventScript|TradeCenter|RecordCorner|BattlePike|BattlePyramid|SecretBase_EventScript|Roulette_EventScript|BerryBlender_EventScript/;
	const leaked = Object.keys(shared.scripts).filter(k => SKIP.test(k));
	A(leaked.length === 0, 'no link-play or natively-reimplemented family leaked in', leaked.slice(0, 6).join(', '));
}

// ---------- map labels must still win ----------
{
	const src = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/mapScripts = \{ \.\.\.sharedScripts, \.\.\.\(c\.scr \|\| \{\}\) \}/.test(src),
		"the map's own labels are merged OVER the shared ones, so a map never loses its own version");
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8934;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 200, atk: 140, def: 140, spa: 140, spd: 140, spe: 140 }, maxHP: 200, curHP: 200,
		exp: 216000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
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
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.removeItem('magepunk_story');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		await page.evaluate(() => {
			window.__say = (map, label) => {
				const ow = window.__ow;
				ow.cutscene.stop(); ow.dialog.pages = null;
				const ran = ow.runScriptLabel(label);
				for (let i = 0; i < 600 && ow.cutscene.blocking && !ow.dialog.blocking; i++) ow.cutscene.update(1 / 60);
				return { ran, text: (ow.dialog.pages || []).flat().join(' ') };
			};
		});

		// a Silph Co door — one script shared by every floor, so it lived in
		// data/scripts/silphco_doors.inc and no floor could reach it
		const door = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('SilphCo_10F');
			return window.__say('SilphCo_10F', 'SilphCo_10F_EventScript_Door');
		});
		A(door.ran === true, "a SILPH CO door script runs (it lives in the decomp's shared silphco_doors.inc)", JSON.stringify(door).slice(0, 160));
		A(door.text && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(door.text.trim()),
			'...and says real words, not a raw text label', JSON.stringify(door.text).slice(0, 140));

		// a POKeMON CENTER sign — Common_EventScript_*, from event_scripts.s
		const sign = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('DewfordTown');
			return window.__say('DewfordTown', 'Common_EventScript_ShowPokemonCenterSign');
		});
		A(sign.ran === true && /POK/i.test(sign.text),
			'a Common_EventScript_ sign reads its real text (from event_scripts.s)', JSON.stringify(sign.text).slice(0, 120));

		// a MOVE TUTOR — data/scripts/move_tutors.inc
		const tutor = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('FallarborTown_Mart');
			return window.__say('FallarborTown_Mart', 'FallarborTown_Mart_EventScript_MetronomeTutor');
		});
		A(tutor.ran === true && tutor.text.length > 10,
			'a MOVE TUTOR speaks (its body is in the shared move_tutors.inc)', JSON.stringify(tutor.text).slice(0, 120));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
