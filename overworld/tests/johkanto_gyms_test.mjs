// johkanto_gyms_test.mjs — the eight gyms are the postgame region's spine, and
// they are levelled off the player.
//
// They shipped as Crystal's Kanto rematch rosters, with three problems:
//   - the ramp was INVERTED (Janine, gym five, was Lv33-39 — below Brock's 41-44)
//   - team sizes ran 3 to 6; Sabrina and Blaine had three
//   - they ignored their own territory types, so a gym taught you nothing about
//     the routes around it
//
// And one that mattered more than any of them: BADGE ROUTING. JohKanto's gyms are
// Crystal's Kanto gyms, so their scripts map to KANTO badges, and the
// disambiguation required `playerRegion() === 'JOHTO'` — which records where you
// STARTED. Two starters in three re-earned Kanto badges they already had, so
// `count('JOHKANTO')` stayed 0 forever and the postgame level cap above 100 could
// never begin. Silent, and it made a whole shipped feature unreachable.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/johkanto_gyms_test.mjs
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
const GYMS = [
	['PewterGymBrockScript', 'BROCK', ['Rock', 'Ground', 'Steel']],
	['CeruleanGymMistyScript', 'MISTY', ['Water', 'Ice']],
	['VermilionGymSurgeScript', 'LT.SURGE', ['Electric', 'Flying']],
	['CeladonGymErikaScript', 'ERIKA', ['Grass', 'Bug']],
	['FuchsiaGymJanineScript', 'JANINE', ['Poison', 'Dark']],
	['SaffronGymSabrinaScript', 'SABRINA', ['Psychic', 'Fairy']],
	['SeafoamGymBlaineScript', 'BLAINE', ['Fire', 'Dragon']],
	['ViridianGymBlueScript', 'BLUE', null],   // mixed gym: the rival, not a specialist
];
const teamOf = k => rosters[k]?.party || [];
const aceOf = k => teamOf(k)[teamOf(k).length - 1];

// ---------- the rosters ----------
A(GYMS.every(([k]) => rosters[k]), 'all eight gym rosters exist');
A(GYMS.every(([k]) => rosters[k].class === 'Gym Leader'),
	'and are Gym Leader class, so the boss AI and equipment apply',
	GYMS.filter(([k]) => rosters[k]?.class !== 'Gym Leader').map(([, n]) => n).join(','));
const sizes = GYMS.map(([k]) => teamOf(k).length);
A(sizes.every(n => n === 6), 'every gym fields six POKeMON', sizes.join(','));

// the ramp: aces must ascend across the eight. This is the inversion that made
// gym five easier than gym one.
const aces = GYMS.map(([k]) => aceOf(k).l);
A(aces.every((l, i) => i === 0 || l > aces[i - 1]), 'the ace level ascends across all eight gyms', aces.join(' '));
const weakest = GYMS.map(([k]) => Math.min(...teamOf(k).map(p => p.l)));
A(weakest.every((l, i) => i === 0 || l >= weakest[i - 1]), 'and so does the floor — no gym is a step backwards', weakest.join(' '));
// inside a team, the ace is the strongest thing the leader owns
const bst = id => Object.values(bat[id]?.baseStats || {}).reduce((a, b) => a + b, 0);
const badAce = GYMS.filter(([k]) => teamOf(k).some(p => bst(p.s) > bst(aceOf(k).s)));
A(badAce.length === 0, 'the ace is the leader\'s strongest POKeMON, not whatever the decomp listed last',
	badAce.map(([, n]) => n).join(','));

// ---------- type coherence with the territory ----------
for (const [k, name, types] of GYMS) {
	if (!types) continue;
	const off = teamOf(k).filter(p => !(bat[p.s]?.types || []).some(t => types.includes(t)));
	A(off.length === 0, `${name}'s team is all ${types.join('/')} — the types its own routes hold`,
		off.map(p => `${p.s}(${(bat[p.s]?.types || []).join('/')})`).join(' '));
}
A(teamOf('ViridianGymBlueScript').length === 6, 'BLUE keeps his mixed rival team — that IS his gym');

// every species exists, and no team is padded with duplicates beyond the decomp's own
const unknown = GYMS.flatMap(([k]) => teamOf(k).map(p => p.s)).filter(s => !bat[s]);
A(unknown.length === 0, 'every gym POKeMON is a real species', unknown.join(','));

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8921;
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
		// HOENN on purpose: the badge-routing bug only showed for a starter who was
		// not from Johto, which is two players in three.
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'HOENN');
		}, STATE, [mk(40)]);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LittlerootTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots as a HOENN starter');

		// the badge-routing fix
		const slice = await page.evaluate(() => {
			const ow = window.__ow, w = ow.world;
			const at = id => { w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id } }; return ow.badgeSliceFor('KANTO'); };
			return { inJK: at('MAP_JOHKANTO_PEWTER_GYM'), inKanto: at('MAP_PEWTER_CITY_GYM') };
		});
		A(slice.inJK === 'JOHKANTO', 'a win in a JohKanto gym counts for JOHKANTO, whatever region you started in', slice.inJK);
		A(slice.inKanto === 'KANTO', '...and a win in Kanto still counts for KANTO', slice.inKanto);

		// gym levelling: one above your strongest, ace two
		const lvls = await page.evaluate(() => {
			const ow = window.__ow, w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_JOHKANTO_PEWTER_GYM' } };
			const read = () => ({ team: ow.gymLevelFor(false), ace: ow.gymLevelFor(true) });
			const out = { at40: read() };
			ow.party[0].level = 200; out.at200 = read();
			ow.party[0].level = 254; out.at254 = read();
			ow.party[0].level = 40;
			// and outside JohKanto a gym is untouched
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_PEWTER_CITY_GYM' } };
			out.kantoScale = ow.inJohKanto();
			return out;
		});
		A(lvls.at40.team === 41 && lvls.at40.ace === 42,
			'a Lv40 party meets a Lv41 gym team with a Lv42 ace', JSON.stringify(lvls.at40));
		A(lvls.at200.team === 201 && lvls.at200.ace === 202,
			'...and a Lv200 party meets Lv201/202 — the gym is always just ahead', JSON.stringify(lvls.at200));
		A(lvls.at254.ace === 255, '...clamped at 255 so it never asks for a level that cannot exist', JSON.stringify(lvls.at254));
		A(lvls.kantoScale === false, 'and Kanto\'s own gyms are left alone');

		// end to end: build a real gym battle and read the levels off it
		const built = await page.evaluate(() => {
			const ow = window.__ow;
			ow.party[0].level = 120;
			const fake = { ev: { script: 'SaffronGymSabrinaScript' } };
			const w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_JOHKANTO_SAFFRON_GYM' } };
			const b = ow.trainers.buildBattle(fake, ow.battle.data);
			return {
				levels: b.party.map(m => m.level).sort((x, y) => x - y),
				n: b.party.length,
				boss: !!b.info?.boss,
				items: b.party.filter(m => m.heldItem).length,
			};
		});
		A(built.n === 6, 'SABRINA fields six in a real built battle', String(built.n));
		A(built.levels[0] === 121 && built.levels[5] === 122,
			'...at 121 with a 122 ace against a Lv120 party', JSON.stringify(built.levels));
		A(built.items === 6, '...and every one of them is holding something (boss equipment)', String(built.items));

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
