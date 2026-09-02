// johkanto_league_test.mjs — JOHKANTO finally has a league, and beating it is
// what opens the last of the level cap.
//
// The region's spine ended at Blue, its eighth gym. LEAGUE_SCRIPT had NO JohKanto
// entries at all, so `Badges.crown('JOHKANTO')` was called by nothing — and the
// postgame cap's final step to 255 is gated on exactly that crown, so the ladder
// stopped at 240 forever. Red made it worse: `onTrainerDefeated` special-cased him
// and RETURNED before the league path that does the crowning.
//
// The venue is Mt Silver because Crystal already gates the mountain on all sixteen
// badges — Red is spawn-gated on `count('JOHKANTO') >= 8` today. Its three cave
// rooms were fully mapped and held nothing but item balls.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/johkanto_league_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const bat = JSON.parse(fs.readFileSync(path.join(D, 'species_battle.json'), 'utf8'));
const rosters = JSON.parse(fs.readFileSync(path.join(D, 'trainers.json'), 'utf8')).rosters;
const Badges = await import('../badges.js');

const ELITES = [
	['SilverCaveEliteLorelei', 'LORELEI', 'Ice', 'SilverCaveOutside'],
	['SilverCaveEliteAgatha', 'AGATHA', 'Ghost', 'SilverCaveRoom1'],
	['SilverCaveEliteBruno', 'BRUNO', 'Fighting', 'SilverCaveRoom2'],
	['SilverCaveEliteKaren', 'KAREN', 'Dark', 'SilverCaveRoom3'],
];

// ---------- the rosters ----------
A(ELITES.every(([k]) => rosters[k]), 'all four elites have a roster',
	ELITES.filter(([k]) => !rosters[k]).map(([, n]) => n).join(','));
A(ELITES.every(([k]) => rosters[k]?.class === 'Elite Four'), 'and are Elite Four class, so boss AI and equipment apply');
A(rosters.Red?.class === 'Champion', 'RED is Champion class', rosters.Red?.class);
A(ELITES.every(([k]) => (rosters[k]?.party || []).length === 6), 'each elite fields six',
	ELITES.map(([k]) => (rosters[k]?.party || []).length).join(','));
A((rosters.Red?.party || []).length === 6, 'and so does RED');
for (const [k, name, type] of ELITES) {
	const off = (rosters[k]?.party || []).filter(p => !(bat[p.s]?.types || []).includes(type));
	A(off.length === 0, `${name}'s team is all ${type}`, off.map(p => p.s).join(','));
}
// four distinct specialisms, none of them a JohKanto gym leader's
const types = ELITES.map(([, , t]) => t);
A(new Set(types).size === 4, 'the four specialise in four different types', types.join('/'));
const unknown = [...ELITES.flatMap(([k]) => rosters[k]?.party || []), ...(rosters.Red?.party || [])]
	.map(p => p.s).filter(s => !bat[s]);
A(unknown.length === 0, 'every league POKeMON is a real species', unknown.join(','));

// ---------- routing ----------
for (const [k, name] of ELITES) {
	const info = Badges.scriptInfo(k);
	A(info?.region === 'JOHKANTO' && info.kind === 'elite', `${name} routes to the JOHKANTO league`, JSON.stringify(info));
}
const red = Badges.scriptInfo('Red');
A(red?.region === 'JOHKANTO' && red.kind === 'champion', 'RED is JOHKANTO\'s champion', JSON.stringify(red));
// the collision that made the gyms award Kanto badges must not repeat
A(Badges.scriptInfo('WillScript_Battle')?.region === 'JOHTO', 'and Johto\'s own league is untouched');
A(ELITES.every(([k]) => !/Script_Battle$/.test(k)), 'the new ids do not reuse another region\'s script names');

// ---------- Red no longer returns before the crown ----------
const mainSrc = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
// (window widened when RED gained his capstone reward block — the silence flag
// moved further from the branch head, but the assertions' intent is unchanged)
const redBlock = mainSrc.slice(mainSrc.indexOf("if (script === 'Red')"), mainSrc.indexOf("if (script === 'Red')") + 1600);
A(!/^\s*return;/m.test(redBlock.split('}')[0] + '}'), 'the Red handler no longer returns before the league path crowns the region');
A(/opts = \{ \.\.\.\(opts \|\| \{\}\), silent: true \}/.test(redBlock), '...and keeps his silence instead of a synthetic toast');

// ---------- placed on the mountain, on tiles a player can actually stand on ----------
// The first placement pass guessed ("next to an item ball, one tile up") and put
// two of the four BEHIND A WALL — passable, and unreachable, which is an Elite
// Four member nobody can ever fight. They stand on flood-verified tiles now, and
// this asserts each one is still the surveyed tile rather than drift.
const dungeons = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/data/dungeon_tiles.json'), 'utf8'));
const mapKey = m => 'MAP_' + m.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Za-z])(\d)/g, '$1_$2').toUpperCase();
for (const [k, name, , map] of ELITES) {
	const m = JSON.parse(fs.readFileSync(path.join(D, 'maps', `${map}_map.json`), 'utf8'));
	const obj = (m.object_events || []).find(o => o.script === k);
	A(!!obj, `${name} is placed on ${map}`, obj ? '' : 'no object event');
	const site = dungeons[mapKey(map)];
	A(obj && site && +obj.x === site.x && +obj.y === site.y,
		`...on the flood-verified reachable tile (${site?.x},${site?.y})`,
		obj ? `at ${obj.x},${obj.y}` : '');
}
// and no two of them share a tile with each other or with RED
const occupied = ELITES.map(([k, , , map]) => {
	const m = JSON.parse(fs.readFileSync(path.join(D, 'maps', `${map}_map.json`), 'utf8'));
	const o = (m.object_events || []).find(x => x.script === k);
	return `${map}:${o?.x},${o?.y}`;
});
{
	const m = JSON.parse(fs.readFileSync(path.join(D, 'maps', 'SilverCaveRoom3_map.json'), 'utf8'));
	const r = (m.object_events || []).find(x => x.script === 'Red');
	occupied.push(`SilverCaveRoom3:${r?.x},${r?.y}`);
}
A(new Set(occupied).size === occupied.length, 'nobody is standing on anybody else', occupied.join(' '));

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8922;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const mk = lvl => ({
		speciesId: 'rattata', name: 'LEAD', level: lvl, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 300, curHP: 300,
		exp: lvl ** 3, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	});
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
			localStorage.setItem('magepunk_region', 'HOENN');
		}, STATE, [mk(150)]);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// a league fight is levelled off you even though Mt Silver is a JOHTO map
		const built = await page.evaluate(() => {
			const ow = window.__ow;
			const w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_SILVER_CAVE_ROOM_3' } };
			const jkHere = ow.inJohKanto();      // false — this is Johto ground
			const karen = ow.trainers.buildBattle({ ev: { script: 'SilverCaveEliteKaren' } }, ow.battle.data);
			const red = ow.trainers.buildBattle({ ev: { script: 'Red' } }, ow.battle.data);
			return {
				jkHere,
				karen: karen.party.map(m => m.level).sort((a, b) => a - b),
				red: red.party.map(m => m.level).sort((a, b) => a - b),
				karenItems: karen.party.filter(m => m.heldItem).length,
				redBoss: !!red.info?.boss,
			};
		});
		A(built.jkHere === false, 'Mt Silver is JOHTO ground, so the map test alone would miss it', String(built.jkHere));
		A(built.karen[0] === 152 && built.karen[5] === 153,
			'KAREN meets a Lv150 party at 152 with a 153 ace — a step above a gym', JSON.stringify(built.karen));
		A(built.red[0] === 153 && built.red[5] === 155,
			'and RED at 153 with a 155 ace', JSON.stringify(built.red));
		A(built.karenItems === 6, 'the elites fight with boss equipment', String(built.karenItems));
		A(built.redBoss === true, 'and RED gets the boss AI');

		// beating Red crowns JOHKANTO, which is the last step of the cap
		const crown = await page.evaluate(async () => {
			const B = await import('./badges.js');
			const ow = window.__ow;
			B.crown('KANTO'); B.crown('JOHTO'); B.crown('HOENN');
			for (const b of ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']) B.earn('JOHKANTO', b);
			const before = { champ: B.isChampion('JOHKANTO'), cap: B.levelCap(8) };
			ow.onTrainerDefeated('Red', { silent: true });
			return { before, after: { champ: B.isChampion('JOHKANTO'), cap: B.levelCap(8) } };
		});
		A(crown.before.champ === false && crown.before.cap === 240,
			'with all eight JohKanto badges the cap is 240 and the region is uncrowned', JSON.stringify(crown.before));
		A(crown.after.champ === true, 'beating RED crowns JOHKANTO', JSON.stringify(crown.after));
		A(crown.after.cap === 255, '...which is what opens the last of the level cap', String(crown.after.cap));

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
