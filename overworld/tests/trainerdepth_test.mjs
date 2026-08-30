// trainerdepth_test.mjs — boss fights use their AUTHENTIC movesets and items.
//
// Every roster carried species + level only, so each trainer mon fought with
// buildMon's stand-in (its last four level-up moves) and no item. The three
// decomps ship real per-mon data; gen_trainer_movesets.mjs joins it onto the
// boss-class rosters. This checks the data landed cleanly AND that the battle
// builder actually honours it.
//   node overworld/tests/trainerdepth_test.mjs
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
const PORT = 8864;

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

// ---------- static: the data is clean and covers the marquee fights ----------
const ROSTERS = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/trainers.json'), 'utf8')).rosters;
const MOVES = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/moves_battle.json'), 'utf8'));
const BAG = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
const BOSS = new Set(['Gym Leader', 'Elite Four', 'Champion', 'Rival', 'Aqua Leader', 'Magma Leader',
	'Aqua Admin', 'Magma Admin', 'TRAINER_CLASS_BOSS', 'TRAINER_CLASS_RIVAL_EARLY', 'TRAINER_CLASS_RIVAL_LATE']);
const bosses = Object.values(ROSTERS).filter(r => BOSS.has(r.class) && r.party?.length);
const withMoves = bosses.filter(r => r.party.some(p => p.moves?.length));
A(withMoves.length >= 65, `boss rosters carry real movesets (${withMoves.length} of ${bosses.length})`);

// every referenced move/item must exist, or a battle would build a blank mon
const badMove = [], badItem = [];
for (const r of Object.values(ROSTERS)) for (const p of (r.party || [])) {
	for (const m of (p.moves || [])) if (!MOVES[m]) badMove.push(`${r.name}:${m}`);
	if (p.item && !new RegExp('\\b' + p.item + ':').test(BAG)) badItem.push(`${r.name}:${p.item}`);
}
A(badMove.length === 0, 'every roster move id exists in the move table', badMove.slice(0, 5).join(', '));
A(badItem.length === 0, 'every roster item id exists in the bag', badItem.slice(0, 5).join(', '));

// the classes players actually remember are fully covered
for (const cls of ['Gym Leader', 'Elite Four', 'Champion']) {
	const all = Object.values(ROSTERS).filter(r => r.class === cls && r.party?.length);
	const cov = all.filter(r => r.party.some(p => p.moves?.length));
	A(cov.length === all.length, `every ${cls} has authentic moves (${cov.length}/${all.length})`);
}
// spot-check across all three regions
const find = n => Object.values(ROSTERS).find(r => new RegExp('^' + n + '$', 'i').test(r.name || ''));
const whitney = find('Whitney'), brock = find('Brock'), roxanne = find('Roxanne');
A(whitney?.party.find(p => p.s === 'miltank')?.moves?.includes('rollout'), "JOHTO: Whitney's Miltank knows Rollout");
A(brock?.party.some(p => p.moves?.length), 'KANTO: Brock has a real moveset');
A(roxanne?.party.some(p => p.moves?.length), 'HOENN: Roxanne has a real moveset');
A(bosses.some(r => r.party.some(p => p.item)), 'some bosses carry authentic held items');

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
				localStorage.setItem('magepunk_region', 'JOHTO');
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=GoldenrodGym`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.trainers?.data)), 30000);
		A(ready, 'boot: Goldenrod Gym');
		if (!ready) throw new Error('boot failed');

		// the battle builder honours the roster's moves + items
		const built = await page.evaluate(() => {
			const ow = window.__ow, tr = ow.trainers;
			const key = Object.keys(tr.data.rosters).find(k => /whitney/i.test(tr.data.rosters[k].name || ''));
			const b = tr.buildBattle({ ev: { local_id: 'T', script: key }, tx: -9, ty: -9 }, ow.battle.data);
			const milt = b.party.find(m => m.speciesId === 'miltank');
			return {
				boss: b.info.boss === true,
				moves: milt ? milt.moves.map(m => m.id) : null,
				item: milt ? milt.heldItem : null,
				pp: milt ? milt.moves.every(m => m.pp > 0 && m.maxPp > 0) : false,
			};
		});
		A(built.boss, 'Whitney builds as a boss fight');
		A(built.moves?.includes('rollout') && built.moves?.includes('milkdrink'),
			'her Miltank walks in with Rollout + Milk Drink', JSON.stringify(built.moves));
		A(built.pp, 'the roster moves come with real PP');
		A(!!built.item, 'the boss still gets a held item', String(built.item));

		// a rank-and-file trainer is untouched — still level-up moves, no item
		const grunt = await page.evaluate(() => {
			const ow = window.__ow;
			const b = ow.trainers.buildBattle({ ev: { local_id: 'G', script: 'no_such_script' }, tx: -9, ty: -9 }, ow.battle.data);
			return { any: b.party.length > 0, item: b.party.every(m => !m.heldItem) };
		});
		A(grunt.any && grunt.item, 'ordinary trainers are unchanged (no items, level-up moves)');

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
