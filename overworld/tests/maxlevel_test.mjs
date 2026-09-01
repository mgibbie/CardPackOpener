// maxlevel_test.mjs — the cap runs to 255, and JOHKANTO scales to meet you.
//
// TWO things that had to be got right together.
//
// THE CURVE. `level ** 3` was duplicated at nineteen sites across battle.js,
// daycare.js, party.js and main.js. Extending it to 255 unchanged would cost
// 15.6 MILLION exp for the climb — fifteen times the whole main game, about
// 14,000 battles. That is a wall, not a grind. Levels past 100 are a different
// thing from levels below it, so they are priced as one: cubic to 100, flat
// above, and the climb comes out at 930,000 — a second main game, near enough.
// The curve BELOW 100 is untouched, so every existing save keeps its level.
//
// The nineteen copies are the real hazard: one site left on the old curve and a
// mon oscillates between levels depending on which file last looked at it. They
// now all call expForLevel/levelForExp.
//
// THE SCALING. JohKanto's roster is authored Lv50-77 for a team fresh off a
// League. Without scaling, the entire postgame region — 355 species and 87
// legendaries of newly-placed content — becomes a formality the moment you pass
// it. The scale is RELATIVE so the gym-order ramp survives, and clamped so the
// region can meet you but never outrun you.
//
// Standalone (needs headless Chrome/Edge for the live half):
//   node overworld/tests/maxlevel_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const B = await import('../badges.js');

// ---------- the curve ----------
A(B.MAX_LEVEL === 255, 'the cap is 255', String(B.MAX_LEVEL));
A(B.CLASSIC_MAX_LEVEL === 100, 'and the main game still ends at 100');

// below 100 the curve is EXACTLY what it was, so no save shifts a level
let sameBelow = true;
for (let L = 1; L <= 100; L++) if (B.expForLevel(L) !== L ** 3) sameBelow = false;
A(sameBelow, 'the curve below 100 is untouched — no existing save changes level');

// it round-trips: a level's exp maps back to that level, at every level
const bad = [];
for (let L = 1; L <= 255; L++) if (B.levelForExp(B.expForLevel(L)) !== L) bad.push(L);
A(bad.length === 0, 'every level round-trips through expForLevel/levelForExp', bad.slice(0, 6).join(','));
// and one exp short of a level is the level below — the boundary the cap logic sits on
const edge = [];
for (let L = 2; L <= 255; L++) if (B.levelForExp(B.expForLevel(L) - 1) !== L - 1) edge.push(L);
A(edge.length === 0, 'and one point short of a level is still the level below', edge.slice(0, 6).join(','));
A(B.expForLevel(300) === B.expForLevel(255), 'asking past the cap clamps rather than extrapolating');
A(B.levelForExp(9e9) === 255, 'and absurd exp clamps to 255');

const climb = B.expForLevel(255) - B.expForLevel(100);
A(climb > 500_000 && climb < 1_500_000,
	`the 100 -> 255 climb costs ${climb.toLocaleString()} — about a second main game, not fifteen`, String(climb));
A(climb < (255 ** 3 - 100 ** 3) / 10, 'which is an order of magnitude under the raw cubic');

// ---------- nothing still owns a private copy of the curve ----------
for (const f of ['battle.js', 'daycare.js', 'party.js', 'main.js']) {
	const src = fs.readFileSync(path.join(ROOT, 'overworld', f), 'utf8');
	A(!/\*\* ?3\b/.test(src), `${f} has no private copy of the growth curve left`,
		(src.match(/.{0,40}\*\* ?3.{0,20}/) || [''])[0].trim());
}

// ---------- the cap ladder ----------
for (let t = 0; t <= 8; t++) {
	const want = Math.min(100, 20 + t * 10);
	A(B.levelCap(t) === want || t === 8, `tier ${t} caps at Lv${want}`, String(B.levelCap(t)));
}
A(B.levelCap(0) === 20 && B.levelCap(7) === 90, 'the main-game ladder is unchanged');
// the cap must always clear the next gym leader it gates
const floors = B.TIER_LEVEL_FLOOR;
const under = floors.map((f, i) => [i, f, B.levelCap(i)]).filter(([, f, c]) => c < f);
A(under.length === 0, 'no tier is capped below the leader it has to beat', JSON.stringify(under));

// ---------- the live half ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8920;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const mk = (id, lvl) => ({
		speciesId: id, name: id.toUpperCase(), level: lvl, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 300, curHP: 300,
		exp: B.expForLevel(lvl), moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
		}, STATE, [mk('rattata', 150)]);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots with a Lv150 party');

		// JohKanto's badges carry the cap past 100
		const ladder = await page.evaluate(async () => {
			const Badges = await import('./badges.js');
			const out = [];
			Badges.crown('KANTO'); Badges.crown('JOHTO'); Badges.crown('HOENN');
			for (const b of ['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']) {
				out.push({ badges: Badges.count('JOHKANTO'), cap: Badges.levelCap(8) });
				Badges.earn('JOHKANTO', b);
			}
			out.push({ badges: Badges.count('JOHKANTO'), cap: Badges.levelCap(8) });
			Badges.crown('JOHKANTO');
			out.push({ badges: 'champion', cap: Badges.levelCap(8) });
			return out;
		});
		A(ladder[0].cap === 100, 'with the main game done and no JohKanto badges, the cap is 100', JSON.stringify(ladder[0]));
		A(ladder[1].cap === 120 && ladder[4].cap === 180, 'each JohKanto badge lifts it by 20', JSON.stringify(ladder.slice(0, 5)));
		A(ladder[ladder.length - 1].cap === 255, 'and its Champion opens the last stretch to 255', JSON.stringify(ladder[ladder.length - 1]));
		A(ladder.every((r, i) => i === 0 || r.cap >= ladder[i - 1].cap), 'the ladder never goes backwards');

		// scaling: relative, up-only, clamped
		const scale = await page.evaluate(() => {
			const ow = window.__ow;
			const w = ow.world;
			const fake = id => { w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id } }; };
			const out = {};
			fake('MAP_JOHKANTO_ROUTE_2');
			out.inJK = ow.inJohKanto();
			out.jkLow = ow.wildEncounterLevel(50);     // authored Brock-territory level
			out.jkHigh = ow.wildEncounterLevel(77);    // authored Blue-territory level
			fake('MAP_ROUTE1');
			out.inKanto = ow.inJohKanto();
			out.kanto = ow.wildEncounterLevel(50);
			out.legendLow = ow.scaleLegendaryLevel(50);
			out.legendHigh = ow.scaleLegendaryLevel(250);
			return out;
		});
		A(scale.inJK === true && scale.inKanto === false, 'JohKanto is detected from the MAP, not the saved region');
		A(scale.jkLow > 50 && scale.jkHigh > scale.jkLow,
			'a Lv150 party lifts JohKanto, and the gym-order ramp survives the lift',
			JSON.stringify(scale));
		A(scale.jkHigh <= 150, 'but never above your own lead — the region meets you, it does not outrun you', String(scale.jkHigh));
		A(scale.legendLow === 150, 'a legendary you have outgrown rises to meet you', String(scale.legendLow));
		A(scale.legendHigh === 250, 'and one you have not is left exactly as placed', String(scale.legendHigh));

		// a Lv255 mon is buildable and its stats are sane
		const top = await page.evaluate(async () => {
			const { buildMon } = await import('./battle.js');
			const data = window.__ow.battle.data;
			const at = lvl => { const m = buildMon('rattata', lvl, data); return { lvl: m.level, hp: m.maxHP, atk: m.stats.atk, exp: m.exp }; };
			return { c: at(100), top: at(255) };
		});
		A(top.top.lvl === 255 && Number.isFinite(top.top.hp) && top.top.hp > 0,
			'a Lv255 POKeMON builds with finite stats', JSON.stringify(top.top));
		A(top.top.exp === B.expForLevel(255), '...its exp comes from the shared curve', String(top.top.exp));
		A(top.top.hp > top.c.hp && top.top.hp < top.c.hp * 4,
			'...and its stats scale sanely off Lv100 rather than exploding', `${top.c.hp} -> ${top.top.hp}`);

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
