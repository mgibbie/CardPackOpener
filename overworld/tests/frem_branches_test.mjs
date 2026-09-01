// frem_branches_test.mjs — FireRed/Emerald questions get asked, item gates get checked.
//
// The FireRed/Emerald sibling of crystal_branches_test. NOT the same bug: those
// two decomps name their flags inline (`goto_if_set FLAG, label`), so no pending
// CONDITION register could go stale. Their damage was all on the VAR_RESULT path:
//
//   msgbox TEXT, MSGBOX_YESNO  is a QUESTION — it writes the answer to VAR_RESULT
//   and the next lines are `compare VAR_RESULT, NO` / `goto_if_eq .Refused`. Only
//   the text label survived, so the question was never asked and the branch read
//   whatever the LAST script left in VAR_RESULT. 319 in the decomps.
//
//   checkitemspace also writes VAR_RESULT and emitted nothing, so a bag-full path
//   could fire with an empty bag.
//
//   checkitem was not handled AT ALL — 68 occurrences, sitting in the transpiler's
//   own unhandled report — so every FireRed/Emerald item gate compared a stale var.
//
// Worth stating what is NOT a bug: 58 places have two branches on one flag with
// opposite states. That is an ordinary if/else (`call_if_unset` then `call_if_set`),
// both reachable, and correctly transpiled. An earlier detector called them
// duplicates; they are fine.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/frem_branches_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const script = f => JSON.parse(fs.readFileSync(path.join(D, 'scripts', f + '.json'), 'utf8'));

// ---------- YES/NO must resolve, or every restored question is inert ----------
{
	const src = fs.readFileSync(path.join(ROOT, 'overworld/events.js'), 'utf8');
	A(/v === 'YES'\) return 1/.test(src) && /v === 'NO'\) return 0/.test(src),
		"the engine resolves YES/NO — without it `1 === 'YES'` is false and every prompt branch is dead");
	A(/case 'hasitem'/.test(src), 'and it has a hasitem op for the FireRed/Emerald checkitem gates');
}

// ---------- the shape of the repair, in LIVE (map-backed) scripts only ----------
{
	const frem = new Set();
	for (const f of fs.readdirSync(path.join(D, 'maps'))) {
		if (!f.endsWith('_map.json')) continue;
		const j = JSON.parse(fs.readFileSync(path.join(D, 'maps', f), 'utf8'));
		if (!j._crystal_tileset) frem.add(f.replace('_map.json', ''));
	}
	let prompt = 0, hasitem = 0, gated = 0;
	for (const stem of frem) {
		const p = path.join(D, 'scripts', stem + '.json');
		if (!fs.existsSync(p)) continue;
		const j = JSON.parse(fs.readFileSync(p, 'utf8'));
		for (const body of Object.values(j)) {
			if (!Array.isArray(body)) continue;
			for (let i = 0; i < body.length; i++) {
				if (body[i]?.op === 'prompt') prompt++;
				if (body[i]?.op !== 'hasitem') continue;
				hasitem++;
				// the point of a checkitem is the branch right after it
				if (body.slice(i + 1, i + 3).some(s => s?.op === 'branch' && s.cond?.var === 'VAR_RESULT')) gated++;
			}
		}
	}
	A(prompt >= 400, `${prompt} yes/no questions restored across FireRed/Emerald`, String(prompt));
	A(hasitem >= 50, `${hasitem} checkitem gates restored`, String(hasitem));
	A(gated === hasitem, 'every one of them feeds the VAR_RESULT branch it exists for', `${gated}/${hasitem}`);
}

// ---------- the hand-patched files must be untouched ----------
// The merge only replaces a label when our body matches what the UNFIXED
// transpiler produced, which proves no human edited it. These are the injections.
{
	for (const [f, sp] of [['Route12', 'snorlax'], ['Route16', 'snorlax'], ['NewMauville_Inside', 'voltorb']]) {
		const j = script(f);
		const found = Object.values(j).some(b => Array.isArray(b) && b.some(s => s?.op === 'wildbattle' && s.species === sp));
		A(found, `${f}'s injected ${sp} battle survived the re-emit`);
	}
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
	const PORT = 8933;
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
			localStorage.removeItem('magepunk_bag_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		await page.evaluate(() => {
			window.__drive = (label, answer = 'z') => {
				const ow = window.__ow;
				ow.cutscene.stop();
				ow.dialog.pages = null;
				ow.runScriptLabel(label);
				// update(dt), NOT step — `step?.()` silently no-ops
				for (let i = 0; i < 4000 && ow.cutscene.blocking; i++) {
					ow.cutscene.update(1 / 60);
					if (ow.dialog.blocking) { ow.dialog.revealed = 1e9; ow.dialog.key(answer); }
				}
				return !ow.cutscene.blocking;
			};
		});

		// --- a real FireRed question, answered both ways ---
		// The Pewter museum guide asks "did you check out the museum?" and branches
		// on YES. Reading VAR_RESULT afterwards proves the prompt stored the answer.
		const ask = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('PewterCity');
			window.__drive('PewterCity_EventScript_MuseumGuide', 'z');
			const yes = ow.Story.getVar('VAR_RESULT');
			window.__drive('PewterCity_EventScript_MuseumGuide', 'x');
			const no = ow.Story.getVar('VAR_RESULT');
			return { yes, no };
		});
		A(ask.yes === 1 && ask.no === 0,
			'a MSGBOX_YESNO question actually asks, and stores YES=1 / NO=0 in VAR_RESULT', JSON.stringify(ask));

		// --- a real item gate: the Abandoned Ship storage room door ---
		const door = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('AbandonedShip_Corridors_B1F');
			ow.Story.setVar('VAR_RESULT', 1);           // poison it: the stale value the bug read
            window.__drive('AbandonedShip_Corridors_B1F_EventScript_StorageRoomDoor');
			const without = ow.Story.getVar('VAR_RESULT');
			ow.Bag.addItem('storagekey', 1);
			window.__drive('AbandonedShip_Corridors_B1F_EventScript_StorageRoomDoor');
			const withKey = ow.Story.getVar('VAR_RESULT');
			return { without, withKey, has: ow.Bag.count('storagekey') };
		});
		A(door.without === 0,
			'a checkitem gate answers FALSE with an empty bag — even when VAR_RESULT was left TRUE by an earlier script',
			JSON.stringify(door));
		A(door.withKey === 1, '...and TRUE once the STORAGE KEY is in the bag', JSON.stringify(door));

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
