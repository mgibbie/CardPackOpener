// tier0_test.mjs — the "built but unreachable" batch.
//
// An audit found that this game's problem was not missing content but built
// content the code could not reach. Each fix below restores something that
// already existed:
//
//   1. BLUE and WALLACE shipped with script "0x0", so Trainers.claims() never
//      spawned them. Two of three regions were uncompletable, which sealed the
//      Battle Frontier, 9 legendaries, 4 ferry islands and the Grand Champion
//      finale. NOTE the shape of the old postgame test: it crowned the player
//      with Badges.crown() and never checked the champion could be ENGAGED.
//      A test that seeds the end state cannot see a sealed entrance — so these
//      assertions walk to the room and look for a trainer.
//   2. Land encounters required MB_TALL_GRASS, which no cave tile has, so 222
//      maps carried a table that could never fire and 25 species were
//      uncatchable.
//   3. In doubles, protectedTurn was only cleared for [a.me, a.foe] — a
//      Protecting ALLY became permanently untargetable and the fight unwinnable.
//   4. An unresolvable warp left the player standing on the warp tile; six
//      elevators had no other exit.
//   5. "ItemTM37" parsed to the id "tm" (the trailing-digit strip meant for
//      "ItemRareCandy2"), so 29 TM/HM balls handed out an unusable junk item.
//
// Plus the data repairs: Kanto's re-keyed encounter tables, the nidoran-m/-f
// class-pool typo that could start a battle with zero Pokemon, the species_extra
// key mismatch that dangled 42 evolutions, and Johto/JohKanto's missing water
// and fishing tables.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/tier0_test.mjs
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
const PORT = 8898;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 50, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 140, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 140, curHP: 140,
	exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19), mon('pidgey', 'BENCH', 's16.png', 16)];
const readData = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
	return false;
}

(async () => {
	// ---------------- data-only assertions (no browser needed) ----------------
	const enc = readData('encounters.json');
	A(!!enc.MAP_KANTO_VICTORY_ROAD_1F?.land && !!enc.MAP_KANTO_VICTORY_ROAD_2F?.land && !!enc.MAP_KANTO_VICTORY_ROAD_3F?.land,
		'Kanto Victory Road has encounter tables on all three floors');
	A(!!enc.MAP_KANTO_SAFARI_ZONE_NORTH?.land,
		'and Kanto Safari Zone North — the largest grass area in the game — is no longer empty');
	A(!enc.MAP_VICTORY_ROAD_2F && !enc.MAP_VICTORY_ROAD_3F,
		'the two orphan keys that matched no map at all are gone');

	const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
	const idRegion = {};
	for (const [r, list] of Object.entries(regions)) for (const m of list) idRegion[m.id] = r;
	const count = (region, kind) => Object.entries(enc)
		.filter(([k, v]) => idRegion[k] === region && v[kind]).length;
	A(count('JOHTO', 'water') > 30, 'Johto has water tables — Surf finally does something there', String(count('JOHTO', 'water')));
	A(count('JOHTO', 'fishing') > 30, 'and fishing tables, so the three rods work', String(count('JOHTO', 'fishing')));
	A(count('JOHKANTO', 'water') > 10, 'JohKanto has water tables too', String(count('JOHKANTO', 'water')));
	// authentic content, not filler: the Lake of Rage is a Gyarados lake
	const lake = (enc.MAP_LAKE_OF_RAGE?.water?.slots || []).map(s => s.id);
	A(lake.includes('gyarados'), 'and the tables are the real Gen-2 ones (Lake of Rage has GYARADOS)', lake.join(','));

	// Hoenn's Victory Road and Safari Zone North were serving FireRed's roster,
	// because BOTH decomps define those map names. Emerald is one game, so it is
	// authoritative for Hoenn — no version split to adjudicate.
	const vr = (enc.MAP_VICTORY_ROAD_1F?.land?.slots || []).map(s => s.id);
	A(vr.includes('lairon') || vr.includes('hariyama'),
		"Hoenn's Victory Road runs Emerald's roster, not FireRed's", vr.slice(0, 5).join(','));
	A(!vr.includes('machop') && !vr.includes('onix'),
		'and no longer has Kanto species in it', vr.slice(0, 5).join(','));
	const sz = (enc.MAP_SAFARI_ZONE_NORTH?.land?.slots || []).map(s => s.id);
	A(sz.includes('phanpy') || sz.includes('natu'),
		'same for Hoenn Safari Zone North', sz.slice(0, 5).join(','));
	// the Kanto copies keep the FireRed roster, which is correct for those maps
	const kvr = (enc.MAP_KANTO_VICTORY_ROAD_1F?.land?.slots || []).map(s => s.id);
	A(kvr.includes('machop') || kvr.includes('onix'),
		"while KANTO's Victory Road keeps the FireRed roster", kvr.slice(0, 5).join(','));

	const trainers = readData('trainers.json');
	const pools = Object.values(trainers.classPools || {}).flat();
	A(!pools.some(id => /-/.test(id)),
		'no class pool holds a hyphenated species id — one could start a battle with ZERO POKeMON',
		pools.filter(id => /-/.test(id)).join(','));
	const bat = readData('species_battle.json');
	A(pools.every(id => bat[id]), 'and every pool species resolves in the species table');

	const ext = readData('species_extra.json');
	let dangling = 0;
	for (const v of Object.values(ext)) for (const e of (v.evos || [])) if (e.target && !bat[e.target]) dangling++;
	A(dangling <= 9, 'evolution targets resolve (only the handful of genuinely absent forms remain)', String(dangling));
	A(!!ext.raichu_alola || !ext.raichualola,
		'species_extra uses the species_battle key shape, so regional forms can evolve');

	// ---------------- engine assertions ----------------
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
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_starter', 'squirtle');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 30000);
		A(ready, 'the overworld boots');
		if (!ready) throw new Error('boot failed');

		// ---- 1. the champions can actually be engaged ----
		const champs = await page.evaluate(async () => {
			const out = {};
			for (const m of ['PokemonLeague_ChampionsRoom', 'EverGrandeCity_ChampionsRoom', 'LancesRoom']) {
				await window.__ow.moveToMap(m);
				await new Promise(r => setTimeout(r, 600));
				out[m] = window.__ow.trainers.list.map(t => t.ev.script);
			}
			return out;
		});
		A(champs.PokemonLeague_ChampionsRoom.length === 1,
			"KANTO's champion stands in the Champion's Room as a battleable trainer",
			JSON.stringify(champs.PokemonLeague_ChampionsRoom));
		A(champs.PokemonLeague_ChampionsRoom[0] === 'PokemonLeague_ChampionsRoom_EventScript_BattleSquirtle',
			'and his roster is the variant matching the starter this save chose',
			champs.PokemonLeague_ChampionsRoom[0]);
		A(champs.EverGrandeCity_ChampionsRoom.includes('EverGrandeCity_ChampionsRoom_EventScript_Wallace'),
			"HOENN's champion likewise", JSON.stringify(champs.EverGrandeCity_ChampionsRoom));
		A(champs.LancesRoom.includes('LancesRoomLanceScript'),
			'and JOHTO, which already worked, still does (control)', JSON.stringify(champs.LancesRoom));

		// every champion script must own a real roster, or the fight is empty
		const rosters = await page.evaluate(scripts =>
			scripts.map(s => !!window.__ow.trainers.data?.rosters?.[s]),
		['PokemonLeague_ChampionsRoom_EventScript_BattleSquirtle', 'EverGrandeCity_ChampionsRoom_EventScript_Wallace']);
		A(rosters.every(Boolean), 'both champion scripts resolve to a real party', JSON.stringify(rosters));

		// ---- 2. caves roll encounters; routes still only roll in grass ----
		const caves = await page.evaluate(async () => {
			const ow = window.__ow, out = {};
			// a cave with a land table and no grass at all
			await ow.moveToMap('MtMoon_1F');
			await new Promise(r => setTimeout(r, 600));
			const id = ow.world.current.map.id;
			out.cave = { id, hasGrass: ow.world.hasTallGrass(), table: !!ow.encounters.data?.[id]?.land };
			// force the rate so the roll is deterministic, then sample the player's tile
			let got = 0;
            const t = ow.encounters.data?.[id]?.land;
			if (t) { const save = t.rate; t.rate = 100;
				for (let i = 0; i < 20 && !got; i++) got = ow.encounters.roll(id, ow.world, ow.player.tx, ow.player.ty, false) ? 1 : 0;
				t.rate = save; }
			out.cave.rolled = !!got;
			return out;
		});
		A(caves.cave.table, 'Mt. Moon has a land encounter table', JSON.stringify(caves.cave));
		A(caves.cave.hasGrass === false, 'and no grass tile anywhere on it', JSON.stringify(caves.cave));
		A(caves.cave.rolled, 'yet a wild encounter now rolls there — it never could before', JSON.stringify(caves.cave));

		const route = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('Route1');
			await new Promise(r => setTimeout(r, 600));
			const id = ow.world.current.map.id;
			// stand on a NON-grass walkable tile and confirm the route still needs grass
			const t = ow.encounters.data?.[id]?.land;
			const save = t ? t.rate : null; if (t) t.rate = 100;
			let onPath = null;
			for (let y = 0; y < ow.world.current.layout.height && onPath === null; y++) {
				for (let x = 0; x < ow.world.current.layout.width; x++) {
					if (ow.world.walkable?.(x, y) === false) continue;
					if (ow.world.isTallGrass(x, y)) continue;
					if (ow.world.gridAt(x, y) === 0) continue;
					onPath = !!ow.encounters.roll(id, ow.world, x, y, false);
					break;
				}
			}
			if (t) t.rate = save;
			return { id, hasGrass: ow.world.hasTallGrass(), onPath };
		});
		A(route.hasGrass === true, 'Route 1 does have grass', JSON.stringify(route));
		A(route.onPath === false,
			'so walking its PATH still triggers nothing — the cave rule must not leak onto routes',
			JSON.stringify(route));

		// ---- 3. a Protecting ally stops being invincible ----
		const prot = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const party = ow.party.map(m => ({ ...m, curHP: m.maxHP }));
			const foe = [{ ...party[0], name: 'F1' }, { ...party[1], name: 'F2' }];
			b.startTrainer(party, foe, { displayName: 'TWINS GINA & MIA', defeatText: '', money: 10 }, () => {});
			const t0 = Date.now();
			while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
			const a = b.active;
			if (!a.double) return { skipped: 'not a double battle', double: false };
			// every actor Protects, then the turn ends
			const actors = b.actorMons();
			for (const m of actors) m.protectedTurn = true;
			b.endOfTurn();
			const still = actors.filter(m => m.protectedTurn).map(m => m.name);
			const names = actors.map(m => m.name);
			b.active = null;
			return { double: true, actors: names, stillProtected: still };
		});
		A(prot.double === true, 'a TWINS trainer starts a real double battle', JSON.stringify(prot));
		A(prot.actors?.length === 4, 'with four actors on the field', JSON.stringify(prot.actors));
		A(prot.stillProtected?.length === 0,
			'and end-of-turn clears Protect for ALL of them, allies included',
			JSON.stringify(prot.stillProtected));

		// ---- 4. an unresolvable warp returns you instead of stranding you ----
		const stranded = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('PewterCity_Mart');
			await new Promise(r => setTimeout(r, 500));
			const before = ow.world.current.name;
			await ow.warpTo('MAP_A_MAP_THAT_DOES_NOT_EXIST', 0);
			await new Promise(r => setTimeout(r, 900));
			return { before, after: ow.world.current.name };
		});
		A(stranded.after !== stranded.before || stranded.after != null,
			'a warp to a missing map does not throw', JSON.stringify(stranded));
		A(stranded.after !== 'PewterCity_Mart',
			'it moves the player somewhere real rather than leaving them on the warp tile',
			JSON.stringify(stranded));

		// ---- 5. TM balls hand over a real TM ----
		const tm = await page.evaluate(() => ({
			tm37: window.__ow.tmMoveId('tm37'),
			hm07: window.__ow.tmMoveId('hm07'),
			junk: window.__ow.tmMoveId('tm'),
		}));
		A(tm.tm37 && tm.hm07, 'a numeric TM/HM id resolves to a real move', JSON.stringify(tm));
		A(tm.junk === null, 'while the old stripped id "tm" resolves to nothing — which is what balls used to give', JSON.stringify(tm));

		// ---- 6. the Battle Tents are wired ----
		const tents = await page.evaluate(() => {
			const L = window.__ow.FACILITY_LOBBIES, F = window.__ow.Frontier.FACILITIES;
			const ids = ['MAP_SLATEPORT_CITY_BATTLE_TENT_LOBBY', 'MAP_VERDANTURF_TOWN_BATTLE_TENT_LOBBY', 'MAP_FALLARBOR_TOWN_BATTLE_TENT_LOBBY'];
			return ids.map(i => ({ lobby: !!L[i], facility: !!F[L[i]?.facility], rounds: F[L[i]?.facility]?.rounds }));
		});
		A(tents.every(t => t.lobby && t.facility), 'all three Battle Tent lobbies now start a challenge', JSON.stringify(tents));
		A(tents.every(t => t.rounds === 3), 'over three rounds, like the real tents', JSON.stringify(tents));

		// ---- 7. Navel Rock is reachable and pays out ----
		const navel = await page.evaluate(() => {
			const ow = window.__ow;
			const ferry = ow.FERRY_DESTS?.find(d => /Navel Rock/.test(d.label));
			const top = ow.LEGENDARY_ENCOUNTERS?.MAP_NAVEL_ROCK_TOP;
			const bottom = ow.LEGENDARY_ENCOUNTERS?.MAP_NAVEL_ROCK_BOTTOM;
			const johtoHooh = ow.LEGENDARY_ENCOUNTERS?.MAP_TIN_TOWER_ROOF;
			return {
				ferry: ferry?.file, gated: !!ferry?.requires,
				top: top?.species, bottom: bottom?.species,
				sameFlag: top?.flag === johtoHooh?.flag,
			};
		});
		A(navel.ferry === 'NavelRock_Harbor' && navel.gated,
			'a champion-gated ferry reaches Navel Rock — it had NO inbound edge at all', JSON.stringify(navel));
		A(navel.top === 'hooh' && navel.bottom === 'lugia',
			'with HO-OH at the top of the climb and LUGIA at the bottom', JSON.stringify(navel));
		A(navel.sameFlag === true,
			'sharing Johto\'s catch flag, so it is a second ROUTE to them, not a second copy',
			JSON.stringify(navel));

		// and the island is actually walkable from the harbour
		const walk = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('NavelRock_Harbor');
			await new Promise(r => setTimeout(r, 700));
			return { id: ow.world.current.map.id, warps: (ow.world.warps || []).length };
		});
		A(walk.id === 'MAP_NAVEL_ROCK_HARBOR' && walk.warps > 0,
			'the harbour loads and has a way inland', JSON.stringify(walk));

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
