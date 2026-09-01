// fruit_trees_test.mjs — Crystal's fruit trees actually bear fruit.
//
// Unlike the item balls, the DATA here was fine: all 30 fruit trees across Gen-2
// Kanto (7) and Johto (23) resolve through berry_trees.json, and Hoenn's 88 berry
// trees resolve too. So this is a "check whether anything is broken" pass, and the
// answer is mostly no — which is worth pinning down rather than assuming, because
// the same map data looked fine for the item balls right up until nothing could
// see them.
//
// The one real gap: LEPPA BERRY is what two Johto trees (Route 35, Route 45) bear,
// and it had no bag.js entry, so harvesting one put an id in the bag with no name,
// no price and no effect.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/fruit_trees_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
const fruitMap = JSON.parse(fs.readFileSync(path.join(D, 'berry_trees.json'), 'utf8'));
const bagSrc = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
const bagIds = new Set([...bagSrc.matchAll(/^\t([a-z0-9]+):\s*\{/gm)].map(m => m[1]));

// ---------- every tree names a fruit, and every fruit is a real item ----------
const trees = { JOHKANTO: [], JOHTO: [] };
for (const rn of Object.keys(trees)) {
	for (const m of regions[rn]) {
		const p = path.join(D, 'maps', `${m.name}_map.json`);
		if (!fs.existsSync(p)) continue;
		for (const o of (JSON.parse(fs.readFileSync(p, 'utf8')).object_events || [])) {
			if (String(o.graphics_id || '').includes('FRUIT_TREE')) trees[rn].push({ map: m.name, script: o.script, fruit: fruitMap[o.script || ''] });
		}
	}
}
A(trees.JOHKANTO.length === 7, `Gen-2 Kanto has ${trees.JOHKANTO.length} fruit trees`, String(trees.JOHKANTO.length));
A(trees.JOHTO.length === 23, `and Johto ${trees.JOHTO.length}`, String(trees.JOHTO.length));
const nameless = [...trees.JOHKANTO, ...trees.JOHTO].filter(t => !t.fruit);
A(nameless.length === 0, 'every tree resolves to a fruit through berry_trees.json', nameless.map(t => t.script).join(','));
const fruits = [...new Set([...trees.JOHKANTO, ...trees.JOHTO].map(t => t.fruit))];
const unknown = fruits.filter(f => !bagIds.has(f));
A(unknown.length === 0, `and all ${fruits.length} fruits are real bag items — a tree cannot bear something the bag has no name for`,
	unknown.join(','));
// LEPPA BERRY is the one that was missing; make sure it stayed fixed AND does something
A(bagIds.has('leppaberry'), 'LEPPA BERRY exists');
A(/leppaberry:[^\n]*held:/.test(bagSrc), '...and is a HELD item with an effect, not an inert entry',
	(/leppaberry:[^\n]*/.exec(bagSrc) || [''])[0]);

// Hoenn's berry trees use a different mechanism (a berry-tree id, not a script)
let hoenn = 0, hoennBad = 0;
for (const m of regions.HOENN) {
	const p = path.join(D, 'maps', `${m.name}_map.json`);
	if (!fs.existsSync(p)) continue;
	for (const o of (JSON.parse(fs.readFileSync(p, 'utf8')).object_events || [])) {
		if (!String(o.graphics_id || '').includes('BERRY_TREE')) continue;
		hoenn++;
		if (!o.trainer_sight_or_berry_tree_id || o.trainer_sight_or_berry_tree_id === '0') hoennBad++;
	}
}
A(hoenn > 80 && hoennBad === 0, `Hoenn's ${hoenn} berry trees still carry a tree id`, `${hoennBad} without`);

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8927;
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
			localStorage.removeItem('magepunk_berrytimes_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// a Gen-2 Kanto tree, harvested for real
		const picked = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoPewterCity');
			ow.items.loadForMap();
			const t = ow.items.trees[0];
			if (!t) return { n: 0 };
			const before = ow.Bag.count(t.item);
			const msg = ow.items.interactAt(t.tx, t.ty);
			const after = ow.Bag.count(t.item);
			const again = ow.items.interactAt(t.tx, t.ty);   // immediately: should be bare
			return { n: ow.items.trees.length, item: t.item, msg, before, after, again };
		});
		A(picked.n > 0, `Gen-2 Kanto Pewter City loads ${picked.n} fruit tree(s)`, JSON.stringify(picked));
		A(picked.after > picked.before, 'harvesting one puts the berry in the bag', JSON.stringify(picked));
		A(/bare/i.test(String(picked.again)), '...and it is bare immediately afterwards, not farmable', String(picked.again));

		// regrowth is a 24h timestamp, not the permanent collected set
		const regrew = await page.evaluate(() => {
			const ow = window.__ow;
			const t = ow.items.trees[0];
			// rewind the harvest stamp past the regrowth window
			ow.items.berryTimes[t.key] = Date.now() - 25 * 60 * 60 * 1000;
			ow.items.loadForMap();
			const fresh = ow.items.trees.find(x => x.key === t.key);
			return { harvested: fresh?.harvested };
		});
		A(regrew.harvested === false, 'and it bears fruit again a day later', JSON.stringify(regrew));

		// the LEPPA BERRY tree gives a real, named item
		const leppa = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('Route35');
			ow.items.loadForMap();
			const t = ow.items.trees.find(x => x.item === 'leppaberry');
			if (!t) return { found: false };
			const before = ow.Bag.count('leppaberry');
			ow.items.interactAt(t.tx, t.ty);
			return { found: true, name: ow.Bag.ITEMS.leppaberry?.name, before, after: ow.Bag.count('leppaberry') };
		});
		A(leppa.found, 'Johto Route 35 has its LEPPA BERRY tree');
		// HARVEST_AMOUNT is 2 — a tree gives a pair, not one
		A(leppa.after === leppa.before + 2 && !!leppa.name,
			'...and it yields a pair of berries the bag can actually name', JSON.stringify(leppa));

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
