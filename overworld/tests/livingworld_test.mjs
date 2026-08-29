// livingworld_test.mjs — the living-world batch: shinies roll + persist on the
// mon, the VS Seeker re-arms beaten trainers at badge-scaled levels, boss-tier
// trainers carry real equipment (canonical ability, Sitrus ace, type items),
// and berry trees regrow 24h after a pick. Boots the real game headless
// (depth_test pattern) and pokes the live modules in-page.
//   node overworld/tests/livingworld_test.mjs
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
const PORT = 8877;

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
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.trainers?.data && window.__ow.items)), 30000);
		A(ready, 'boot: battle + trainer data loaded');
		if (!ready) throw new Error('boot failed');

		const out = await page.evaluate(async () => {
			const B = await import('/overworld/battle.js');
			const Bag = await import('/overworld/bag.js');
			const ow = window.__ow, data = ow.battle.data;
			const out = {};

			// ---- shinies: the roll exists at forced odds, off at long odds ----
			const R = Math.random;
			Math.random = () => 0.0001;
			out.shinyRolled = B.buildMon('pidgey', 5, data).shiny === true;
			Math.random = () => 0.9;
			out.shinyOff = B.buildMon('pidgey', 5, data).shiny === false;
			Math.random = R;

			// ---- VS Seeker: stocked, re-arms, tiers scale rematches ----
			out.seekerItem = Bag.ITEMS.vsseeker?.kind === 'seeker';
			out.seekerStocked = Bag.SHOP_STOCK.includes('vsseeker');
			const tr = ow.trainers;
			const stub = { ev: { local_id: 'TEST_REMATCH', script: 'no_such_script' }, tx: -9, ty: -9 };
			tr.list.push(stub);
			const key = tr.keyOf(stub);
			tr.defeated.add(key);
			const armed = tr.rearmMap(3);
			out.rearmCount = armed >= 1;
			out.rearmCleared = !tr.defeated.has(key);
			out.rearmTier = tr.rematch[key] === 3;
			const built = tr.buildBattle(stub, data);
			const base = tr.data.mapLevel[ow.world.current.map.id] || 20;
			out.rematchLevels = built.party.length > 0 && built.party.every(m => m.level >= Math.min(100, base + 3));
			out.rematchLabel = built.info.displayName.includes('(rematch)');
			tr.list.pop();
			delete tr.rematch[key];

			// ---- boss equipment: canonical ability, Sitrus ace, type items ----
			const bossScript = Object.keys(tr.data.rosters).find(s => {
				const r = tr.data.rosters[s];
				return r.class === 'Gym Leader' && r.party?.length >= 2 && r.party.every(e => data.species[e.s]);
			});
			out.bossFound = !!bossScript;
			if (bossScript) {
				const boss = tr.buildBattle({ ev: { local_id: 'TEST_BOSS', script: bossScript }, tx: -9, ty: -9 }, data);
				out.bossItems = boss.party.every(m => !!m.heldItem);
				const ace = boss.party.reduce((a, m) => (m.level > (a?.level ?? -1) ? m : a), null);
				out.bossAce = ace?.heldItem === 'sitrusberry';
				out.bossAbility = boss.party.every(m => {
					const opts = data.abilities?.[m.speciesId];
					return !opts?.length || m.ability === opts[0];
				});
				// a rank-and-file trainer stays unequipped
				const grunt = tr.buildBattle({ ev: { local_id: 'TEST_GRUNT', script: 'no_such_script' }, tx: -9, ty: -9 }, data);
				out.gruntBare = grunt.party.every(m => !m.heldItem);
			}

			// ---- berries: bare for 24h, then fruit again ----
			const it = ow.items;
			out.berryFresh = !it.berryHarvested('test_tree');
			it.markHarvested('test_tree');
			out.berryBare = it.berryHarvested('test_tree') === true;
			it.berryTimes.test_tree = Date.now() - 25 * 3600 * 1000;
			out.berryRegrown = !it.berryHarvested('test_tree');
			delete it.berryTimes.test_tree;

			return out;
		});

		A(out.shinyRolled, 'shiny: forced odds roll shiny');
		A(out.shinyOff, 'shiny: long odds stay plain');
		A(out.seekerItem, 'VS Seeker exists as a seeker-kind item');
		A(out.seekerStocked, 'VS Seeker is in the mart stock');
		A(out.rearmCount, 'rearmMap re-arms a defeated trainer');
		A(out.rearmCleared, 'the re-armed trainer is battleable again');
		A(out.rearmTier, 'the rematch tier records the badge count');
		A(out.rematchLevels, 'rematch parties come back at boosted levels');
		A(out.rematchLabel, 'rematch trainers are labeled');
		A(out.bossFound, 'a gym-leader roster exists to equip');
		A(out.bossItems, 'boss mons all hold items');
		A(out.bossAce, "the boss's ace holds a Sitrus Berry");
		A(out.bossAbility, 'boss mons run their canonical ability');
		A(out.gruntBare, 'rank-and-file trainers stay unequipped');
		A(out.berryFresh, 'an unharvested berry tree bears fruit');
		A(out.berryBare, 'a picked tree is bare');
		A(out.berryRegrown, 'the tree regrows after 24h');
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
