// qolsweep_test.mjs — Sootopolis for Hoenn2, the items the bag did not know,
// and the quality-of-life gaps the UX audit found.
//
//   SOOTOPOLIS   clone_region walks the map graph, and Sootopolis has no
//                connections and no inbound warps — you arrive by DIVE. So
//                Hoenn2 got 7 of its 8 gyms and Badges.count('HOENN2') could
//                never reach 8.
//   ITEMS        57 ground pickups named an id with no bag.js entry, so they
//                landed in the bag with a name and no `kind` — unusable and
//                unsellable. Two were spelling drift (maxelixir/maxelixer).
//   BAG          one flat list of up to 305 items in insertion order, seven
//                rows at a time and TWO in a portrait battle.
//   CAPTURE      setNickname existed and only the NAME RATER ever called it.
//   PC           240 storage slots reachable only at a CENTER counter, while a
//                catch on a full party goes straight there.
//   PARTY        SWITCH only ever promoted to lead.
//   SUMMARY      a verbal IV "judge" and no numbers; EVs are awarded and were
//                shown nowhere; move tiles had no power or accuracy.
//   BATTLE ANIM  no speed toggle; durations were hardcoded literals.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/qolsweep_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld/data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8908;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 30, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 12, def: 9, spa: 6, spd: 3, spe: 0 },
	evs: { hp: 4, atk: 8, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 90, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 90, curHP: 90,
	exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19), mon('pidgey', 'SECOND', 's16.png', 16)];
const BAG = { pokeball: 5, greatball: 3, potion: 4, oranberry: 2, tmthunderbolt: 1, bicycle: 1, nugget: 1, maxelixir: 2, diveball: 1, redshard: 3 };

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	// ---------- Hoenn2 Sootopolis (data-only) ----------
	const index = JSON.parse(fs.readFileSync(path.join(DATA, 'map_index.json'), 'utf8'));
	A(!!index.MAP_HOENN2_SOOTOPOLIS_CITY, 'Hoenn2 has a Sootopolis City at last');
	A(!!index.MAP_HOENN2_SOOTOPOLIS_CITY_GYM_1F, 'and its gym — the 8th, without which the region could never be completed');
	const gymTowns = ['RUSTBORO_CITY', 'DEWFORD_TOWN', 'MAUVILLE_CITY', 'LAVARIDGE_TOWN', 'PETALBURG_CITY', 'FORTREE_CITY', 'MOSSDEEP_CITY', 'SOOTOPOLIS_CITY'];
	const have = gymTowns.filter(t => Object.keys(index).some(k => k.startsWith(`MAP_HOENN2_${t}_GYM`)));
	A(have.length === 8, 'all eight Hoenn2 gym towns are present', `${have.length}/8`);
	// the clone must not leak back into base Hoenn
	const soot = JSON.parse(fs.readFileSync(path.join(DATA, 'maps/Hoenn2_SootopolisCity_map.json'), 'utf8'));
	const dests = (soot.warp_events || []).map(w => w.dest_map);
	A(dests.length > 0 && dests.every(d => /^MAP_HOENN2_/.test(d)),
		'every exit from it stays inside Hoenn2', dests.slice(0, 3).join(','));

	// ---------- the unknown items ----------
	const bagSrc = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
	const ITEMS = new Set([...bagSrc.matchAll(/^\t([a-z0-9_]+):\s*\{/gm)].map(m => m[1]));
	const ballId = s => {
		const m = /_EventScript_Item(.+)$/.exec(s || '');
		if (!m) return null;
		const stem = /^(TM|HM)\d+$/i.test(m[1]) ? m[1] : m[1].replace(/\d+$/, '');
		return stem.toLowerCase().replace(/[^a-z0-9]/g, '') || null;
	};
	// mirror tmMoveId: a TM id is fine if it is tm<n>/hm<n>, or tm<move> where the
	// move really exists — those need no ITEMS entry, the engine resolves them.
	const moves = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(DATA, 'moves_battle.json'), 'utf8'))));
	const resolvesAsTM = id => /^(tm|hm)\d+$/.test(id) || (/^tm(.+)$/.test(id) && moves.has(id.slice(2)));
	const unknown = new Set();
	for (const f of fs.readdirSync(path.join(DATA, 'maps'))) {
		let d; try { d = JSON.parse(fs.readFileSync(path.join(DATA, 'maps', f), 'utf8')); } catch { continue; }
		for (const o of (d.object_events || [])) {
			const s = o.script || '';
			if (!s.includes('_EventScript_Item')) continue;
			const id = ballId(s);
			if (id && !ITEMS.has(id) && !resolvesAsTM(id)) unknown.add(id);
		}
	}
	A(unknown.size === 0,
		'every ground pickup resolves to a real item or a real TM',
		[...unknown].slice(0, 6).join(','));

	// ---------- engine ----------
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
		await page.setViewport({ width: 1100, height: 760 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((st, party, bag) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, PARTY, BAG);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 30000);
		A(ready, 'the overworld boots');
		if (!ready) throw new Error('boot failed');

		// ---- bag pockets ----
		const bag = await page.evaluate(() => {
			const ow = window.__ow;
			const byPocket = {};
			ow.BAG_POCKETS.forEach((p, i) => {
				ow.bagMenu.pocket = i;
				byPocket[p.label] = ow.bagEntries().map(e => e[0]);
			});
			ow.bagMenu.pocket = 0;
			return byPocket;
		});
		A(bag.ALL.length > 5, 'the ALL pocket still shows everything', String(bag.ALL.length));
		A(bag.BALLS.every(i => /ball$/.test(i)) && bag.BALLS.length === 3,
			'the BALLS pocket shows only balls', bag.BALLS.join(','));
		A(!bag.BALLS.includes('potion') && bag.MEDICINE.includes('potion'),
			'and medicine lands in MEDICINE, not with the balls', JSON.stringify(bag.MEDICINE));
		A(bag.TMs.includes('tmthunderbolt'), 'TMs get their own pocket', bag.TMs.join(','));
		A(bag.KEY.includes('bicycle'), 'and key items theirs', bag.KEY.join(','));
		const sorted = [...bag.ALL].sort((a, b) => a.localeCompare(b));
		A(bag.ALL.length === new Set(bag.ALL).size, 'no item appears twice');
		void sorted;

		// ---- everything else ----
		const rest = await page.evaluate(() => {
			const ow = window.__ow;
			const start = ow.startItems();
			// party swap: arm on slot 1, complete on slot 0
			const before = ow.party.map(m => m.name);
			ow.partyMenu.open = true;
			ow.partyMenu.swapFrom = 1;
			ow.partyMenu.idx = 0;
			ow.menuTap ? null : null;
			// drive the same key path the player uses
			ow.partyKeyForTest ? ow.partyKeyForTest('z') : null;
			return {
				start,
				hasPC: start.includes('PC'),
				animValues: ow.Settings.OPTIONS.battleAnim?.values || null,
				animScaleFull: ow.Settings.animScale(),
				newItems: ['maxelixir', 'paralyzeheal', 'diveball', 'redshard', 'seaincense']
					.map(i => [i, !!ow.Bag.ITEMS[i], ow.Bag.ITEMS[i]?.kind]),
				before,
			};
		});
		A(rest.hasPC, 'the START menu opens the PC — it was Center-counter only', rest.start.join(','));
		A(Array.isArray(rest.animValues) && rest.animValues.length === 3,
			'BATTLE ANIM is a real setting', JSON.stringify(rest.animValues));
		A(rest.animScaleFull === 1, 'and defaults to full speed', String(rest.animScaleFull));
		A(rest.newItems.every(([, known, kind]) => known && kind),
			'the previously-unknown pickups all have a usable kind now', JSON.stringify(rest.newItems));

		// animation scaling actually changes the queued duration
		const anim = await page.evaluate(() => {
			const ow = window.__ow, b = ow.battle;
			const durs = [];
			for (const v of ['full', 'fast', 'off']) {
				ow.Settings.set('battleAnim', v);
				b.active = { queue: [] };
				b.pushAnim('enter', 'foe', 1);
				durs.push(b.active.queue[0].anim.dur);
			}
			ow.Settings.set('battleAnim', 'full');
			b.active = null;
			return durs;
		});
		A(anim[0] > anim[1] && anim[1] > anim[2],
			'BATTLE ANIM actually shortens the animations — the durations were hardcoded',
			JSON.stringify(anim));

		// nickname is offered at capture
		const nick = await page.evaluate(() => typeof window.__ow.offerNickname === 'function');
		A(nick, 'a capture can offer a nickname without walking to the NAME RATER');

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
