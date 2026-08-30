// brokenevents_test.mjs — the game-wide broken-event scour.
//
// tools/audit_events.mjs walks every ported map in all three regions looking for
// the damage the decomp->JSON transpile leaves behind. This locks in the fixes
// for what it found, so a re-transpile can't quietly bring any of it back:
//
//   • a goto/branch to a label the map doesn't define used to spin the
//     interpreter for 100,000 iterations and leave the cutscene BLOCKING —
//     a hard freeze that swallowed every key press.
//   • ~500 of those jumps point at the decomp's shared Common_EventScript_*
//     library, which the transpile never emitted at all.
//   • a msg naming a missing string fell through to the label itself, so the
//     NPC said "RadioTower1FLuckyNumberManDotDotDotText" out loud.
//   • 15 warps lost their MAP_ prefix or had map and warp-id SWAPPED, stranding
//     the Fast Ship gangways, Lance's room and the Bug Contest gates.
//   • give/givemon through a VAR_ (every Game Corner prize, the Saffron Dojo)
//     resolved to nothing, so the counter took your coins and handed over air.
//   • 152 HM obstacles used the FireRed/Emerald graphics spellings that
//     items.js didn't match — Celadon Gym's cut-tree puzzle and the whole of
//     Cerulean Cave were inert scenery.
//
//   node overworld/tests/brokenevents_test.mjs
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
const PORT = 8871;

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

// ---------- static: the HM obstacles items.js has to recognise ----------
// The three decomps spell the same object three ways. Count what actually ships
// and assert the matcher covers every spelling, because the miss was silent —
// an unmatched rock is just scenery you walk past.
const MAPS = path.join(ROOT, 'overworld/data/maps');
const itemsSrc = fs.readFileSync(path.join(ROOT, 'overworld/items.js'), 'utf8');
const gfxCount = {};
for (const f of fs.readdirSync(MAPS)) {
	if (!f.endsWith('_map.json')) continue;
	let m; try { m = JSON.parse(fs.readFileSync(path.join(MAPS, f), 'utf8')); } catch { continue; }
	for (const o of (m.object_events || [])) {
		const g = String(o.graphics_id || '');
		if (/CUT_TREE|CUTTABLE_TREE|ROCK_SMASH|BREAKABLE_ROCK|BOULDER/.test(g)) gfxCount[g] = (gfxCount[g] || 0) + 1;
	}
}
A((gfxCount.OBJ_EVENT_GFX_CUT_TREE || 0) > 40, `FireRed-spelled cut trees ship (${gfxCount.OBJ_EVENT_GFX_CUT_TREE || 0})`);
A((gfxCount.OBJ_EVENT_GFX_ROCK_SMASH_ROCK || 0) > 80, `Emerald-spelled smash rocks ship (${gfxCount.OBJ_EVENT_GFX_ROCK_SMASH_ROCK || 0})`);
A(/ROCK_SMASH/.test(itemsSrc) && /BREAKABLE_ROCK/.test(itemsSrc), 'items.js matches BOTH smash-rock spellings');
A(/'CUT_TREE'/.test(itemsSrc) && /CUTTABLE_TREE/.test(itemsSrc), 'items.js matches BOTH cut-tree spellings');
// every obstacle spelling in the data is one the matcher will see
const unmatched = Object.keys(gfxCount).filter(g =>
	!(g.includes('BREAKABLE_ROCK') || g.includes('ROCK_SMASH') || g.includes('CUTTABLE_TREE')
		|| g.includes('CUT_TREE') || g.includes('BOULDER')));
A(unmatched.length === 0, 'no obstacle graphic is left unhandled', unmatched.join(', '));

// ---------- static: the item table the events hand out ----------
const bagSrc = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
const bagItems = new Set([...bagSrc.matchAll(/^\t([a-z0-9_]+):\s*\{/gm)].map(m => m[1]));
A(bagItems.size > 290, `the bag defines a full item table (${bagItems.size})`);
for (const id of ['fullheal', 'antidote', 'parlyzheal', 'awakening', 'burnheal', 'iceheal'])
	A(bagItems.has(id), `status cure exists: ${id}`);
for (const id of ['nugget', 'masterball', 'elixer', 'maxether', 'sodapop', 'oaksparcel', 'coincase'])
	A(bagItems.has(id), `common event reward exists: ${id}`);
A(/kind: 'cure'/.test(bagSrc), "bag.js declares the 'cure' kind");
A(/item\?\.kind === 'cure'/.test(fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8')),
	'main.js implements using a status cure');

// ---------- static: no map event still points at a broken destination ----------
const mapIndex = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/map_index.json'), 'utf8'));
const knownMap = n => typeof n === 'string' && !!(mapIndex[n] || mapIndex['MAP_' + n]);
let badWarps = 0; const badWarpEg = [];
for (const f of fs.readdirSync(path.join(ROOT, 'overworld/data/scripts'))) {
	if (!f.endsWith('.json')) continue;
	let prog; try { prog = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/scripts', f), 'utf8')); } catch { continue; }
	for (const ops of Object.values(prog)) {
		if (!Array.isArray(ops)) continue;
		for (const op of ops) {
			if (op.op !== 'warp' || !op.map) continue;
			// NONE is the transpile's "nowhere", and is correctly a no-op
			if (op.map === 'NONE') continue;
			if (!knownMap(op.map) && !knownMap(op.warp)) { badWarps++; if (badWarpEg.length < 4) badWarpEg.push(`${f}: ${op.map}`); }
		}
	}
}
A(badWarps === 0, 'every scripted warp resolves to a real map', badWarpEg.join(', '));

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
				localStorage.setItem('magepunk_region', 'KANTO');
			} catch {}
		}, STATE, seedMon);
		// Celadon's gym is the cut-tree puzzle map — the clearest case of the
		// obstacle-matching bug, and a fine place to run the interpreter tests.
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=CeladonCity_Gym`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.cutscene)), 30000);
		A(ready, 'boot: Celadon City Gym');
		if (!ready) throw new Error('boot failed');

		// ---- the HM obstacles are live objects again ----
		const obstacles = await page.evaluate(() => {
			const objs = window.__ow.items.fieldObjs || [];
			return { total: objs.length, cut: objs.filter(o => o.kind === 'cut').length };
		});
		A(obstacles.cut > 0, `Celadon Gym's cut trees are interactable again (${obstacles.cut})`, JSON.stringify(obstacles));

		// ---- a dangling jump must not freeze the game ----
		// This was the real breakage: _goto returned false and the op never
		// advanced, so the interpreter burned its whole 100k budget and left
		// cutscene.blocking true forever, eating all input.
		const dangling = await page.evaluate(async () => {
			const ow = window.__ow;
			const out = {};
			const runProg = (program, entry) => new Promise(res => {
				let done = false;
				ow.cutscene.run(program, entry, ow.cutsceneCtx(), () => { done = true; });
				setTimeout(() => res({ done, blocking: !!ow.cutscene.blocking }), 250);
			});
			const shown = () => JSON.stringify(ow.dialog.pages || ow.dialog.text || '');

			// goto nowhere, then a line the player must still see
			const t0 = Date.now();
			await runProg({ __e__: [{ op: 'goto', label: 'NoSuchLabel_ZZZ' }, { op: 'msg', text: 'the script kept going' }] }, '__e__');
			out.gotoMs = Date.now() - t0;
			out.gotoReached = /the script kept going/.test(shown());
			ow.dialog.close?.(); ow.cutscene.stop();

			// a taken branch to nowhere behaves the same way
			await runProg({ __e__: [{ op: 'branch', kind: 'goto', cond: { var: 'VAR_UNSET_XYZ', cmp: 'eq', value: 0 }, label: 'AlsoMissing_ZZZ' }, { op: 'msg', text: 'branch fell through' }] }, '__e__');
			out.branchReached = /branch fell through/.test(shown());
			ow.dialog.close?.(); ow.cutscene.stop();

			// one of the decomp's shared library labels now has a body
			await runProg({ __e__: [{ op: 'goto', label: 'Common_EventScript_ShowBagIsFull' }] }, '__e__');
			out.stubText = shown();
			ow.dialog.close?.(); ow.cutscene.stop();

			// a genuinely infinite loop is caught by the op budget rather than
			// hanging the player forever
			await runProg({ L: [{ op: 'goto', label: 'L' }] }, 'L');
			out.loopBlocking = !!ow.cutscene.blocking;
			ow.cutscene.stop();

			// a msg naming a string that doesn't exist must NOT speak its label
			await runProg({ __e__: [{ op: 'msg', text: 'TotallyMissingTextLabel' }] }, '__e__');
			out.missingText = shown();
			ow.dialog.close?.(); ow.cutscene.stop();
			return out;
		});
		A(dangling.gotoReached, 'a goto to a missing label falls through to the next op', JSON.stringify(dangling));
		A(dangling.branchReached, 'a taken branch to a missing label does the same');
		A(/no room left in your BAG/.test(dangling.stubText), 'a shared Common_EventScript_ label has a body', dangling.stubText);
		A(dangling.loopBlocking === false, 'a runaway script releases the player instead of freezing');
		A(!/TotallyMissingTextLabel/.test(dangling.missingText), 'an NPC never speaks its own label aloud', dangling.missingText);
		A(/\.\.\./.test(dangling.missingText), 'it says "..." instead', dangling.missingText);

		// ---- warps, items and gift Pokemon resolved through their real values ----
		const resolved = await page.evaluate(async () => {
			const ow = window.__ow;
			const out = {};
			// run against a ctx whose effects we capture, so nothing really moves
			const spyRun = (ops) => new Promise(res => {
				const ctx = ow.cutsceneCtx();
				const got = {};
				ctx.warp = (map, id) => { got.warp = { map, id }; };
				ctx.giveItem = (id, n) => { got.item = { id, n }; };
				ctx.giveMon = (sp, lv) => { got.mon = { sp, lv }; };
				ow.cutscene.run({ __e__: ops }, '__e__', ctx, () => {});
				setTimeout(() => { ow.cutscene.stop(); res(got); }, 200);
			});

			// a bare map name (the MAP_ prefix was lost in transpile)
			out.bareIndex = !!ow.world.fileFor('VERMILION_PORT');
			out.prefixed = !!ow.world.fileFor('MAP_VERMILION_PORT');
			// map and warp-id swapped: a direction constant sits where the map goes
			out.swapped = await spyRun([{ op: 'warp', map: 'UP', warp: 'MAP_HALL_OF_FAME' }]);
			// NONE really is nowhere, and must stay a no-op
			out.none = await spyRun([{ op: 'warp', map: 'NONE', warp: 0 }]);

			// the Game Corner counter sets the prize into a var, then gives the var
			ow.Story.setVar('VAR_TEMP_1', 'ITEM_NUGGET');
			out.varItem = await spyRun([{ op: 'give', item: 'VAR_TEMP_1', count: 1 }]);
			ow.Story.setVar('VAR_TEMP_1', 'SPECIES_ABRA');
			out.varMon = await spyRun([{ op: 'givemon', species: 'VAR_TEMP_1', level: 9 }]);
			// a runtime placeholder has no item behind it and must give nothing
			out.placeholder = await spyRun([{ op: 'give', item: 'REWARD_ITEM', count: 1 }]);
			return out;
		});
		A(resolved.bareIndex && resolved.prefixed, 'a warp map resolves with or without its MAP_ prefix');
		A(resolved.swapped.warp?.map === 'MAP_HALL_OF_FAME', 'a swapped map/warp-id pair still finds its destination', JSON.stringify(resolved.swapped));
		A(!resolved.none.warp, 'a NONE warp stays a no-op');
		A(resolved.varItem.item?.id === 'nugget', 'a prize held in a var is handed over for real', JSON.stringify(resolved.varItem));
		A(resolved.varMon.mon?.sp === 'abra' && resolved.varMon.mon?.lv === 9, 'so is a prize POKeMON', JSON.stringify(resolved.varMon));
		A(!resolved.placeholder.item, 'a runtime placeholder gives nothing rather than a junk item');

		// ---- text rendering ----
		const text = await page.evaluate(async () => {
			const S = await import('/overworld/events.js');
			return {
				at: S.normalizeText('Ah, so that is\n@?', {}),
				hash: S.normalizeText('Throw # BALLS at wild #MON.', {}),
				plain: S.normalizeText('Nothing to fix here.', {}),
				name: window.__ow.Bag.nameOf('tmsteelwing'),
				name2: window.__ow.Bag.nameOf('bigmushroom'),
				known: window.__ow.Bag.nameOf('fullheal'),
				cure: window.__ow.Bag.ITEMS.antidote?.cures,
			};
		});
		A(!/@/.test(text.at), 'an unfilled runtime buffer never renders as a bare "@"', text.at);
		A(text.hash === 'Throw POKe BALLS at wild POKeMON.', '"#" still expands to POKe', text.hash);
		A(text.plain === 'Nothing to fix here.', 'ordinary lines are untouched');
		A(text.name === 'TM STEEL WING', 'an undefined TM still reads as words', text.name);
		A(text.name2 === 'BIG MUSHROOM', 'so does an undefined pickup', text.name2);
		A(text.known === 'FULL HEAL', 'a defined item uses its real name', text.known);
		A(text.cure === 'psn', 'ANTIDOTE treats poison');

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
