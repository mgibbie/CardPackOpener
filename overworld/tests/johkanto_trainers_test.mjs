// johkanto_trainers_test.mjs — the 94 route trainers are a fight again.
//
// They were never inert: all 102 trainer objects across JohKanto's 28 maps carry a
// script with a roster behind it. The problem was subtler and worse for it — the
// relative postgame scale PRESERVES WEAKNESS. These are Crystal-era rosters
// authored Lv23-38, so multiplying by lead/60 put them at Lv58-95 against a Lv150
// party. Half your level, in the region that is supposed to be the hardest in the
// game, and nothing about the data looks wrong.
//
// Their authored band is now mapped onto a band just under your lead, which keeps
// the ordering (a Youngster stays easier than an Ace Trainer) instead of flattening
// everyone to one number.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/johkanto_trainers_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
const rosters = JSON.parse(fs.readFileSync(path.join(D, 'trainers.json'), 'utf8')).rosters;

// ---------- the data ----------
const seen = new Set(); const route = []; let objs = 0, maps = 0, orphans = [];
for (const m of regions.JOHKANTO) {
	const p = path.join(D, 'maps', `${m.name}_map.json`);
	if (!fs.existsSync(p)) continue;
	const d = JSON.parse(fs.readFileSync(p, 'utf8'));
	const tr = (d.object_events || []).filter(o => o.trainer_type && o.trainer_type !== 'TRAINER_TYPE_NONE');
	if (tr.length) maps++;
	for (const o of tr) {
		objs++;
		if (!rosters[o.script]) { orphans.push(o.script || '(none)'); continue; }
		if (seen.has(o.script)) continue;
		seen.add(o.script);
		const r = rosters[o.script];
		if (r.class !== 'Gym Leader') route.push({ script: o.script, cls: r.class, ace: Math.max(...(r.party || []).map(x => x.l)) });
	}
}
A(objs >= 100 && maps >= 25, `${objs} trainer objects across ${maps} JohKanto maps`, `${objs}/${maps}`);
A(orphans.length === 0, 'every one of them has a roster — none is a script pointing at nothing', orphans.slice(0, 4).join(','));
A(route.length >= 90, `${route.length} of them are route trainers rather than gym leaders`, String(route.length));

// The band the scaler maps FROM is measured, not guessed. If a re-import shifts
// these, the mapping silently stops covering the real spread — so pin them.
const aces = route.map(r => r.ace);
const lo = Math.min(...aces), hi = Math.max(...aces);
A(lo === 23 && hi === 38, 'their authored ace levels still span 23-38, which is what the scaler maps from', `${lo}-${hi}`);

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8924;
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

		// THEY SPAWN. Data existing is not the same as a trainer standing on a route,
		// which is the failure this codebase keeps producing.
		const spawned = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoRoute11');
			return { map: ow.world.current.map.id, n: (ow.trainers.list || []).length };
		});
		A(/JOHKANTO_ROUTE_?11/i.test(spawned.map), 'walked onto a JohKanto route', spawned.map);
		A(spawned.n > 0, `and ${spawned.n} trainers actually spawned on it`, JSON.stringify(spawned));

		// levelled into a band just under the player, ordering intact
		const built = await page.evaluate(() => {
			const ow = window.__ow;
			const rs = ow.trainers.data.rosters;
			// the weakest and strongest authored route trainers in the region
			let weak = null, strong = null;
			for (const [k, r] of Object.entries(rs)) {
				if (r.class === 'Gym Leader' || !(r.party || []).length) continue;
				const ace = Math.max(...r.party.map(p => p.l));
				if (ace === 23 && !weak) weak = k;
				if (ace === 38 && !strong) strong = k;
			}
			const lv = k => ow.trainers.buildBattle({ ev: { script: k } }, ow.battle.data).party.map(m => m.level);
			return { weak, strong, weakLv: weak ? lv(weak) : null, strongLv: strong ? lv(strong) : null };
		});
		A(built.weak && built.strong, 'found the weakest and strongest authored route trainers', JSON.stringify({ w: built.weak, s: built.strong }));
		const allLv = [...(built.weakLv || []), ...(built.strongLv || [])];
		A(allLv.every(l => l >= 138 && l <= 148),
			'every route trainer lands within twelve levels of a Lv150 party', JSON.stringify(built));
		A(Math.max(...built.strongLv) > Math.max(...built.weakLv),
			'and the strongest is still stronger than the weakest — the ordering survives',
			`${Math.max(...built.weakLv)} vs ${Math.max(...built.strongLv)}`);

		// a gym leader still uses the BOSS rule, not the route band
		const gym = await page.evaluate(() => {
			const ow = window.__ow, w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_JOHKANTO_PEWTER_GYM' } };
			return ow.trainers.buildBattle({ ev: { script: 'PewterGymBrockScript' } }, ow.battle.data).party.map(m => m.level).sort((a, b) => a - b);
		});
		A(gym[0] === 151 && gym[5] === 152, 'a gym leader is still levelled off you, not into the route band', JSON.stringify(gym));

		// outside JohKanto nothing changes
		const kanto = await page.evaluate(() => {
			const ow = window.__ow, w = ow.world;
			w.current = { ...(w.current || {}), map: { ...(w.current?.map || {}), id: 'MAP_ROUTE1' } };
			const k = Object.entries(ow.trainers.data.rosters).find(([, r]) => r.class !== 'Gym Leader' && (r.party || []).length);
			const built = ow.trainers.buildBattle({ ev: { script: k[0] } }, ow.battle.data);
			return { authored: k[1].party.map(p => p.l), got: built.party.map(m => m.level) };
		});
		A(JSON.stringify(kanto.authored) === JSON.stringify(kanto.got),
			'a Kanto route trainer keeps its authored levels exactly', JSON.stringify(kanto));

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
