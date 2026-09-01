// frem_objectflags_test.mjs — FireRed and Emerald read their object flags too.
//
// npcs.js and trainers.js hid an object that carried an event flag AT ALL,
// whichever way the flag pointed. PR #185 fixed that for Crystal; FireRed and
// Emerald kept the blanket rule because reading a flag honestly needs the right
// STARTING state and theirs had not been checked. It turns out to be the simplest
// possible one: `InitEventData` memsets every flag to zero, so a fresh save has
// them all CLEAR and every object visible. There was no init list to port — the
// Rockets in Silph Co and the Magma grunts at Mt Chimney really are there when you
// walk in, and hiding them was this port's invention. 2,427 objects.
//
// TWO THINGS HAD TO BE TRUE FIRST, and each is asserted here:
//
//   1. npcs.js had to stop keeping its OWN copy of "which objects items.js owns".
//      The copy had drifted — it matched CUTTABLE_TREE and BREAKABLE_ROCK but not
//      the CUT_TREE / ROCK_SMASH_ROCK spellings — so ~400 obstacles were owned by
//      items.js and unclaimed by npcs.js. Invisible only while the blanket flag
//      rule hid them; the moment flags are read honestly each would be drawn
//      TWICE, once as a fake NPC.
//
//   2. FLAG_TEMP_* has to be wiped on map entry, as ClearTempFieldEventData does.
//      Ours persists to localStorage, so a flag a cutscene set to hide someone
//      mid-scene would keep them hidden for the rest of the save.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/frem_objectflags_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- one predicate, not two ----------
{
	const npcs = fs.readFileSync(path.join(ROOT, 'overworld/npcs.js'), 'utf8');
	const items = fs.readFileSync(path.join(ROOT, 'overworld/items.js'), 'utf8');
	A(/export function itemsOwns/.test(items), 'items.js exports the "do I own this object" predicate');
	A(/itemsOwns\(ev\.graphics_id\)/.test(npcs) && !/BREAKABLE_ROCK\|CUTTABLE_TREE/.test(npcs),
		'...and npcs.js asks THROUGH it rather than keeping a copy that can drift');
	const ev = fs.readFileSync(path.join(ROOT, 'overworld/events.js'), 'utf8');
	A(/export function clearTempFlags/.test(ev), 'events.js can wipe the TEMP flag range');
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A((main.match(/Story\.clearTempFlags\(\)/g) || []).length >= 2,
		'...and main.js does it at every map load, as ClearTempFieldEventData does');
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
	const PORT = 8936;
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
			window.__at = async (map) => {
				const ow = window.__ow;
				await ow.moveToMap(map);
				await ow.npcs.loadForMap();
				await ow.trainers.loadForMap();
				ow.items.loadForMap();
				return {
					npcs: ow.npcs.list.map(n => n.ev?.graphics_id || ''),
					trainers: ow.trainers.list.map(t => t.ev?.script || ''),
					fieldObjs: ow.items.fieldObjs.length,
				};
			};
		});

		// the flag-hidden cast really is there now
		const silph = await page.evaluate(() => window.__at('SilphCo_10F'));
		A(silph.npcs.length + silph.trainers.length > 0,
			'SILPH CO has its Rockets and scientists — every one carried FLAG_HIDE_SILPH_ROCKETS and was deleted',
			JSON.stringify(silph).slice(0, 160));

		// NO DOUBLE-DRAWN OBSTACLES. This is the failure the shared predicate exists
		// to prevent: cut trees and Rock Smash rocks carry FLAG_TEMP_*, so relaxing
		// the flag rule releases them, and npcs.js's stale copy would have drawn each
		// one a second time as a fake NPC.
		const owned = /BREAKABLE_ROCK|ROCK_SMASH|_ROCK$|CUTTABLE_TREE|CUT_TREE|BOULDER|ITEM_BALL|POKE_BALL|BERRY_TREE|FRUIT_TREE/;
		for (const map of ['CeladonCity_Gym', 'CeruleanCave_1F', 'FieryPath']) {
			const r = await page.evaluate(m => window.__at(m), map);
			const dupes = r.npcs.filter(g => owned.test(g));
			A(dupes.length === 0, `${map}: its HM obstacles are drawn once, by items.js`, dupes.slice(0, 4).join(', '));
			A(r.fieldObjs > 0, `...and items.js really is drawing them there (${r.fieldObjs})`, JSON.stringify(r.fieldObjs));
		}

		// the two unmodelled systems stay hidden
		const bedroom = await page.evaluate(() => window.__at('LittlerootTown_BrendansHouse_2F'));
		A(!bedroom.npcs.some(g => /GFX_VAR_/.test(g)),
			'the bedroom is not full of furniture nobody owns (FLAG_DECORATION_* stays hidden)',
			bedroom.npcs.filter(g => /GFX_VAR_/.test(g)).join(', '));
		const base = await page.evaluate(() => window.__at('SecretBase_BlueCave1'));
		A(!base.npcs.some(g => /GFX_VAR_/.test(g)),
			'nor is a secret base (FLAG_HIDE_SECRET_BASE_* stays hidden)', base.npcs.filter(g => /GFX_VAR_/.test(g)).join(', '));

		// a set flag still hides, and TEMP flags do not survive a map change
		const temp = await page.evaluate(async () => {
			const ow = window.__ow;
			// Mt Chimney: 22 flagged objects, Archie and Maxie among them. Take the flag
			// off an object npcs.js is ACTUALLY drawing — the first flagged object on a
			// map may well be a trainer, and trainers.js draws those, so hiding it would
			// not move this count at all.
			await window.__at('MtChimney');
			const before = ow.npcs.list.length;
			const someFlag = ow.npcs.list.map(n => n.ev?.flag).find(f => f && f !== '0');
			ow.Story.setFlag(someFlag);
			await ow.npcs.loadForMap();
			const after = ow.npcs.list.length;
			ow.Story.setFlag('FLAG_TEMP_12');
			await window.__at('CeladonCity_Gym');            // a map change must wipe it
			return { someFlag, before, after, tempSurvived: ow.Story.getFlag('FLAG_TEMP_12'),
				stillSet: ow.Story.getFlag(someFlag) };
		});
		A(temp.after < temp.before, `setting ${temp.someFlag} hides its object — the flag is genuinely read`, JSON.stringify(temp));
		A(temp.tempSurvived === false, 'a FLAG_TEMP_* does not survive a map change, as in the real games', JSON.stringify(temp));

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
