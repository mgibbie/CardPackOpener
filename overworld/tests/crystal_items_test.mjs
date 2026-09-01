// crystal_items_test.mjs — JohKanto and Johto have overworld items at all.
//
// Not "few" — ZERO item balls and ZERO hidden items across 373 maps, while Kanto
// had 178 and 182 and Hoenn 222 and 113. Two separate causes, both invisible:
//
//   ITEM BALLS were in the map data all along — 180 of them. items.js matched a
//   graphics_id containing `ITEM_BALL`, and Crystal's is `OBJ_EVENT_GFX_POKE_BALL`,
//   so loadForMap walked past every one. Their script form differs too: FireRed
//   writes `<Map>_EventScript_Item<Name>`, Crystal writes `<Map><Name>`.
//
//   HIDDEN ITEMS were dropped in transpile outright — our Crystal maps carried 628
//   bg_events and every single one was a sign.
//
// The test that matters is the last one: stand on the tile and pick the thing up.
// Counting entries in a JSON would have passed before this work too, because the
// entries were there — the engine just could not see them.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/crystal_items_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
const itemsSrc = fs.readFileSync(path.join(ROOT, 'overworld/items.js'), 'utf8');

// ---------- the data ----------
let balls = 0, hidden = 0, crystalMaps = 0;
for (const rn of ['JOHKANTO', 'JOHTO']) {
	for (const m of regions[rn]) {
		const p = path.join(D, 'maps', `${m.name}_map.json`);
		if (!fs.existsSync(p)) continue;
		const d = JSON.parse(fs.readFileSync(p, 'utf8'));
		if (d._crystal_tileset) crystalMaps++;
		for (const o of (d.object_events || [])) if (String(o.graphics_id || '').includes('POKE_BALL')) balls++;
		for (const b of (d.bg_events || [])) if (b.type === 'hidden_item') hidden++;
	}
}
A(balls >= 170, `${balls} Crystal item balls sit in JohKanto and Johto's maps`, String(balls));
A(hidden >= 70, `and ${hidden} hidden items, which had been dropped in transpile entirely`, String(hidden));
A(/POKE_BALL/.test(itemsSrc), 'items.js knows Crystal\'s POKE_BALL spelling');
A(/parseCrystalBall/.test(itemsSrc), 'and can read its <Map><Item> script form');

// the starter balls in Elm's lab are POKE_BALLs and must never become items
A(/STARTER_BALLS/.test(itemsSrc), 'the three starter balls are excluded by name');

// named HMs resolve now — Crystal ships hmwaterfall in an Ice Path ball
const mainSrc = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
A(mainSrc.includes("/^hm([a-z]+)$/"), 'tmMoveId resolves a NAMED hm, not just hm<number>');

// The injector matches by PROVENANCE, not name — Crystal's Route12/CeruleanCity
// and FireRed's share a stem, and a name match put 19 Crystal items into Kanto
// maps that are not Crystal maps at all. Kanto and Hoenn keep exactly the counts
// their own decomps give them.
const countHidden = rn => regions[rn].reduce((n, m) => {
	const p = path.join(D, 'maps', `${m.name}_map.json`);
	if (!fs.existsSync(p)) return n;
	const d = JSON.parse(fs.readFileSync(p, 'utf8'));
	if (d._crystal_tileset) return n;              // a Crystal map filed under another region
	return n + (d.bg_events || []).filter(b => b.type === 'hidden_item').length;
}, 0);
A(countHidden('KANTO') === 182, 'Kanto still has exactly its 182 FireRed hidden items', String(countHidden('KANTO')));
A(countHidden('HOENN') === 113, 'and Hoenn its 113 Emerald ones — nothing leaked across the name collision', String(countHidden('HOENN')));

// ---------- live: can you actually pick them up? ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8926;
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
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.removeItem('magepunk_collected_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// a Crystal map the engine could see nothing on before
		const found = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoRockTunnel1F');
			ow.items.loadForMap();
			return {
				map: ow.world.current.map.id,
				balls: ow.items.balls.filter(b => !b.hidden).map(b => ({ id: b.id, x: b.tx, y: b.ty })),
				hidden: ow.items.balls.filter(b => b.hidden).length,
			};
		});
		A(found.balls.length > 0, `the engine now sees ${found.balls.length} item balls on JohKanto Rock Tunnel 1F`, JSON.stringify(found).slice(0, 160));
		A(found.balls.every(b => b.id && b.id !== 'tm'), 'each with a real item id, not the "tm" junk id', JSON.stringify(found.balls));

		// PICK ONE UP. This is the assertion the JSON count cannot make.
		const picked = await page.evaluate(() => {
			const ow = window.__ow;
			const ball = ow.items.balls.find(b => !b.hidden);
			if (!ball) return { err: 'no ball' };
			const before = ow.Bag.count(ball.id);
			const msg = ow.items.interactAt(ball.tx, ball.ty);
			return { id: ball.id, msg, before, after: ow.Bag.count(ball.id), left: ow.items.balls.length };
		});
		A(!picked.err && /found|received|picked/i.test(String(picked.msg)), 'standing on it picks it up', JSON.stringify(picked));
		A(picked.after === picked.before + 1, '...and the item lands in the bag', JSON.stringify(picked));

		// a hidden item on a Johto map
		const hid = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('Route12');
			ow.items.loadForMap();
			const h = ow.items.balls.filter(b => b.hidden);
			if (!h.length) return { n: 0 };
			const before = ow.Bag.count(h[0].id);
			const msg = ow.items.interactAt(h[0].tx, h[0].ty);
			return { n: h.length, id: h[0].id, msg, before, after: ow.Bag.count(h[0].id) };
		});
		A(hid.n > 0, `Johto Route 12 has ${hid.n} hidden item(s) again`, JSON.stringify(hid));
		A(hid.after === hid.before + 1, '...and one can be picked up', JSON.stringify(hid));

		// the starter balls are not treasure
		const lab = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('ElmsLab');
			ow.items.loadForMap();
			return ow.items.balls.map(b => b.id);
		});
		A(!lab.some(id => /cyndaquil|totodile|chikorita/.test(id)),
			'the three starters in ELM\'s LAB are not pickable as items', JSON.stringify(lab));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 2).join(' | '));
	} catch (e) {
		A(false, 'browser harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
