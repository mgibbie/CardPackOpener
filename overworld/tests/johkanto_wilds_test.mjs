// johkanto_wilds_test.mjs — JohKanto's wild encounters keep their territory ramp
// at every player level.
//
// The old relative multiply had two faults. It CLAMPED AT YOUR LEAD, so once you
// were strong every territory from Erika's up pinned flat to the same number and
// the eight-territory ramp — the thing the entire postgame roster is organised
// around — disappeared exactly when the region was meant to be at its hardest. And
// a wild mon at precisely your lead, on every step through the grass, is
// relentless in a way a route trainer every few screens is not.
//
// The authored band now maps onto a band under your lead, the same technique as
// the route trainers, aimed lower — so the region stacks into a readable ladder:
//
//   wild  lead-20..-5   ·   route trainer  lead-12..-2
//   gym   lead+1/+2     ·   elite  +2/+3   ·   champion  +3/+5
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/johkanto_wilds_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const { POSTGAME } = await import('../encounters_postgame.js');
const PHASES = ['morning', 'day', 'night'];

// ---------- the band the scaler maps FROM is measured, not guessed ----------
const lv = [];
for (const n of Object.values(POSTGAME)) {
	for (const ph of PHASES) for (const s of (n.land?.[ph] || [])) lv.push(s.min, s.max);
	for (const k of ['water', 'fishing']) for (const s of (n[k] || [])) lv.push(s.min, s.max);
}
const lo = Math.min(...lv), hi = Math.max(...lv);
A(lo === 50 && hi === 78, 'the postgame roster still spans Lv50-78, which is what the scaler maps from', `${lo}-${hi}`);
const mainSrc = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
const band = /WILD_BAND = \{ lo: (\d+), hi: (\d+) \}/.exec(mainSrc);
A(band && +band[1] === lo && +band[2] === hi,
	'and WILD_BAND matches it — a re-import that shifts the span cannot silently un-cover it', band ? band[0] : 'not found');
A(/wildEncounterLevel\(pick\.level\)/.test(mainSrc), 'the wild roll reads as going through the scaler (the live check below is the proof)');
A(!/scalePostgameLevel/.test(mainSrc), 'and the old relative scaler is gone, not left beside it');

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8925;
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
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, [mk(150)]);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots with a Lv150 party');

		const r = await page.evaluate(() => {
			const ow = window.__ow, w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_JOHKANTO_ROUTE_2' } };
			const f = ow.wildEncounterLevel;
			return {
				inJK: ow.inJohKanto(),
				brock: f(50), erika: f(64), blue: f(78), stray: f(2),
				route: [ow.routeTrainerLevel(23), ow.routeTrainerLevel(38)],
				gym: [ow.gymLevelFor(false), ow.gymLevelFor(true)],
			};
		});
		A(r.inJK === true, 'standing in JohKanto');
		// the bug: these used to pin flat at the lead
		A(r.brock < r.erika && r.erika < r.blue,
			"the eight-territory ramp survives — Brock's routes are still weaker than Blue's",
			JSON.stringify({ brock: r.brock, erika: r.erika, blue: r.blue }));
		A(r.brock >= 128 && r.blue <= 146, 'and all of it lands 5-20 under a Lv150 party', JSON.stringify(r));
		A(r.blue < 150, 'nothing wild reaches your lead — the grass is not relentless', String(r.blue));
		// Celadon/Pallet/Route 12 keep authentic Crystal water tables down at Lv2
		A(r.stray >= 128, 'a Lv2 leftover from an unrostered map is lifted into the region, not left as a Lv2', String(r.stray));

		// the ladder: wilds sit under route trainers, which sit under the gyms
		A(Math.max(r.brock, r.blue) <= Math.max(...r.route),
			'wilds sit below the route trainers', JSON.stringify({ wild: [r.brock, r.blue], route: r.route }));
		A(Math.max(...r.route) < r.gym[0], 'and the route trainers below the gym leaders', JSON.stringify({ route: r.route, gym: r.gym }));

		// a real roll through the encounter module comes back in band
		const rolled = await page.evaluate(() => {
			const ow = window.__ow;
			const got = [];
			for (let i = 0; i < 300; i++) {
				const p = ow.encounters.pick('MAP_JOHKANTO_ROUTE_2', 'land', 'day');
				if (p) got.push(ow.wildEncounterLevel(p.level));
			}
			return { n: got.length, min: Math.min(...got), max: Math.max(...got) };
		});
		A(rolled.n > 0, 'the route still rolls encounters', JSON.stringify(rolled));
		A(rolled.min >= 130 && rolled.max <= 145, '...and every one of them is in band', JSON.stringify(rolled));

		// END TO END: the hook, not the function.
		// This is the assertion that matters. The scaler existed, was exported and was
		// unit-tested for a whole PR while startWildBattle NEVER CALLED IT — the patch
		// that was supposed to add the hook aborted on an unrelated assertion and
		// silently wrote nothing. A source-text grep would have passed too. So: force a
		// known encounter, start the real battle, and read the level off the foe.
		const endToEnd = await page.evaluate(async () => {
			const ow = window.__ow, w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_JOHKANTO_ROUTE_2' } };
			ow.startWildBattle({ id: 'rattata', level: 50 });   // authored Brock-territory level
			const t0 = Date.now();
			while (!ow.battle.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 50));
			return { foe: ow.battle.active?.foe?.level ?? null };
		});
		A(endToEnd.foe !== 50 && endToEnd.foe >= 128 && endToEnd.foe <= 135,
			'a real wild battle on a JohKanto route comes out scaled, not at the authored Lv50',
			JSON.stringify(endToEnd));

		// other regions untouched
		const kanto = await page.evaluate(() => {
			const ow = window.__ow, w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_ROUTE1' } };
			return { inJK: ow.inJohKanto(), lvl: ow.wildEncounterLevel(4) };
		});
		A(kanto.inJK === false && kanto.lvl === 4, 'a Kanto route keeps its own levels exactly', JSON.stringify(kanto));

		// on arrival, before you have outgrown it, the region plays as authored
		const fresh = await page.evaluate(() => {
			const ow = window.__ow, w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_JOHKANTO_ROUTE_2' } };
			ow.party[0].level = 60;
			const out = { brock: ow.wildEncounterLevel(50), blue: ow.wildEncounterLevel(78) };
			ow.party[0].level = 150;
			return out;
		});
		A(fresh.brock === 50 && fresh.blue === 78,
			'a fresh League winner meets the roster exactly as authored — the scaler only ever lifts',
			JSON.stringify(fresh));

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
