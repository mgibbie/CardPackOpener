// livingworld_test.mjs — Batch C of the second upscale plan: the living world.
//
//   * Shoal Cave tides on the live Clock: low 3-9/15-21, high otherwise; high
//     tide floods the deep rooms and swaps the Inner Room to its shipped
//     high-tide layout (warps injected into the layout-only shell, arrival
//     re-placed); salt/shell dig spots (once per save), the SHELL BELL hermit
//   * Roaming legendaries: gated on 4 badges, hop routes on map change, take
//     over encounters on their route, flee-prone (Mean Look holds), wounds
//     persist between meetings, fainting one loses it — the classic chase
//   * Apricorns: the Route 37/42 trees restored to Crystal's colors, KURT
//     crafts each color into his handmade ball
//
//   node overworld/tests/livingworld_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source + data ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/roamer: !!opts\?\.roamer/.test(bt), 'a battle can be marked as a roamer encounter');
	A(/this\.lastFoe = a\.foe/.test(bt), 'the fled foe survives into lastFoe (wound persistence reads it)');
	A(/a\.roamer && Math\.random\(\) < 0\.5/.test(bt) && /trappedBy\(a\.foe\)/.test(bt),
		'roamers bolt at end of turn unless trapped (Mean Look holds them)');
	const trees = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/berry_trees.json'), 'utf8'));
	A(trees.Route37FruitTree1 === 'redapricorn' && trees.Route37FruitTree3 === 'blkapricorn'
		&& trees.Route42FruitTree1 === 'pnkapricorn' && trees.Route42FruitTree3 === 'ylwapricorn',
		'the Route 37/42 trees bear Crystal\'s apricorn colors (they were all oranberry)');
	const bag = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
	for (const [apr, ball] of [['redapricorn', 'levelball'], ['whtapricorn', 'fastball'], ['pnkapricorn', 'loveball'], ['blkapricorn', 'heavyball']])
		A(new RegExp(`${apr}.*${ball}`).test(bag), `${apr} maps to ${ball}`);
	A(/shoalsalt/.test(bag) && /shoalshell/.test(bag), 'SHOAL SALT and SHOAL SHELL exist');
	const sv = fs.readFileSync(path.join(ROOT, 'overworld/services.js'), 'utf8');
	A(/shoalspot/.test(sv) && /shoalhermit/.test(sv) && /'kurt'/.test(sv), 'shoal digs, the hermit, and Kurt carry zones');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/kind === 'roamer' && end\.roamer/.test(mn), 'a roamer battle left mid-fight resumes with roamer semantics');
	const rs = fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8');
	for (const k of ['magepunk_roamers_v1', 'magepunk_shoal_v1']) A(rs.includes(`'${k}'`), `${k} joins the canonical save inventory`);
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8981;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 45, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 70, def: 70, spa: 70, spd: 70, spe: 200 }, maxHP: 120, curHP: 120,
		exp: 91125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=ShoalCave_LowTideEntranceRoom&x=20&y=25`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the cave boots');
		const closeDialog = async (key = 'x') => {
			for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press(key); await new Promise(r => setTimeout(r, 120)); }
		};

		// --- tides ---
		const tide = await page.evaluate(() => {
			const ow = window.__ow;
			const o = {};
			ow.Clock.setHour(4); o.at4 = ow.shoalTide();
			ow.Clock.setHour(12); o.at12 = ow.shoalTide();
			ow.Clock.setHour(16); o.at16 = ow.shoalTide();
			ow.Clock.setHour(23); o.at23 = ow.shoalTide();
			ow.Clock.setHour(12); // stay at high for the gate checks
			o.deep = ow.shoalWarp({ dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM', dest_warp_id: '0' });
			o.saysWhy = ow.dialog.blocking;
			return o;
		});
		A(tide.at4 === 'low' && tide.at16 === 'low' && tide.at12 === 'high' && tide.at23 === 'high', 'the tide follows Emerald\'s 3-9/15-21 rhythm', JSON.stringify(tide));
		A(tide.deep === 'blocked' && tide.saysWhy, 'high tide floods the deep rooms with the why');
		await closeDialog();
		const swap = await page.evaluate(async () => {
			const ow = window.__ow;
			const r = ow.shoalWarp({ dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', dest_warp_id: '0' });
			if (!r) return { r };
			await ow.warpTo(r.map, r.warp);
			await new Promise(res => setTimeout(res, 300));
			return { r, name: ow.world.current.name, warps: ow.world.warps.length, at: [ow.player.tx, ow.player.ty] };
		});
		A(swap.r && /HIGH_TIDE_INNER/.test(swap.r.map), 'the entrance door swaps into the high-tide inner room');
		A(swap.name === 'ShoalCave_HighTideInnerRoom' && swap.warps >= 8, 'the layout-only shell gets its warps injected', JSON.stringify(swap));
		A(swap.at[0] === 34 && swap.at[1] === 29, 'arrival is re-placed at the mirrored door', JSON.stringify(swap.at));
		const back = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.Clock.setHour(4); // low tide again
			const r = ow.shoalWarp({ dest_map: 'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM', dest_warp_id: '0' });
			await ow.moveToMap('ShoalCave_LowTideInnerRoom', 31, 9);
			return { lowPass: r === null };
		});
		A(back.lowPass, 'at low tide the inner room stays its dry self');

		// --- digs + the hermit ---
		const dig = await page.evaluate(() => {
			const ow = window.__ow;
			const p = ow.player;
			p.tx = 31; p.ty = 9; p.px = 31 * 16; p.py = 9 * 16; p.facing = 'up';
			const before = ow.Bag.count('shoalsalt');
			ow.interact();
			return { got: ow.Bag.count('shoalsalt') - before, dialog: ow.dialog.blocking };
		});
		A(dig.got === 1 && dig.dialog, 'digging the sparkling spot yields a SHOAL SALT');
		await closeDialog();
		const redig = await page.evaluate(() => {
			const ow = window.__ow;
			const before = ow.Bag.count('shoalsalt');
			ow.interact();
			return { got: ow.Bag.count('shoalsalt') - before };
		});
		A(redig.got === 0, 'a dug spot stays dug (once per save, no timers)');
		await closeDialog();
		const bell = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.Bag.addItem('shoalsalt', 4); ow.Bag.addItem('shoalshell', 4);
			await ow.moveToMap('ShoalCave_LowTideEntranceRoom', 18, 17);
			const p = ow.player;
			p.tx = 18; p.ty = 16; p.px = 18 * 16; p.py = 16 * 16; p.facing = 'up';
			ow.interact();
			return { asked: ow.dialog.blocking };
		});
		A(bell.asked, 'the hermit offers the craft with 4+4 in the bag');
		await closeDialog('z'); // yes -> the crafting speech -> closed
		const bell2 = await page.evaluate(() => ({
			bell: window.__ow.Bag.count('shellbell'),
			salt: window.__ow.Bag.count('shoalsalt'),
			journal: window.__ow.Journal.list()[0]?.text || '',
		}));
		A(bell2.bell >= 1 && bell2.salt <= 1, 'four salt and four shells became a SHELL BELL', JSON.stringify(bell2));
		A(/SHELL BELL/.test(bell2.journal), 'the journal remembers the craft', bell2.journal);

		// --- Kurt ---
		const kurt = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.Bag.addItem('redapricorn', 2);
			await ow.moveToMap('KurtsHouse', 3, 4);
			const p = ow.player;
			p.tx = 3; p.ty = 3; p.px = 3 * 16; p.py = 3 * 16; p.facing = 'up';
			ow.interact();
			return { asked: ow.dialog.blocking };
		});
		A(kurt.asked, 'Kurt offers the craft when you carry an apricorn');
		await closeDialog('z');
		const kurt2 = await page.evaluate(() => ({
			ball: window.__ow.Bag.count('levelball'),
			left: window.__ow.Bag.count('redapricorn'),
		}));
		A(kurt2.ball === 1 && kurt2.left === 1, 'a RED APRICORN became a LEVEL BALL', JSON.stringify(kurt2));

		// --- roamers ---
		const roam = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			// no badges: the world stays quiet
			ow.roamersOnMapChange();
			o.dormant = !localStorage.getItem('magepunk_roamers_v1') || !JSON.parse(localStorage.getItem('magepunk_roamers_v1')).raikou;
			// seed a wounded raikou onto Route 30 (badge gate bypassed by direct seed)
			localStorage.setItem('magepunk_roamers_v1', JSON.stringify({ raikou: { map: 'Route30', hp: 60, seen: false } }));
			await ow.moveToMap('Route30', 5, 5);
			o.here = ow.roamerHere();
			ow.startRoamerBattle('raikou');
			for (let i = 0; i < 100 && !ow.battle.active; i++) await new Promise(r => setTimeout(r, 100));
			const a = ow.battle.active;
			o.roamerFlag = a?.roamer === true;
			o.species = a?.foe?.speciesId;
			o.hp = a?.foe?.curHP;
			o.spec = ow.battle.endSpec?.kind;
			return o;
		});
		A(roam.dormant, 'with no badges the routes stay quiet');
		A(roam.here === 'raikou', 'a seeded raikou is found on its route');
		A(roam.roamerFlag && roam.species === 'raikou' && roam.spec === 'roamer', 'the roamer battle carries its flag and end spec', JSON.stringify(roam));
		A(roam.hp === 60, 'its old wounds carry into the fight', String(roam.hp));
		// run away; the wounds (and the sighting) persist
		const after = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			for (let i = 0; i < 100; i++) { const a = b.active; if (a && (a.phase === 'menu' || a.phase === 'choose')) break; await new Promise(r => setTimeout(r, 100)); }
			b.startQueue(() => b.tryRun());
			for (let i = 0; i < 150 && b.active; i++) await new Promise(r => setTimeout(r, 100));
			await new Promise(r => setTimeout(r, 400));
			const st = JSON.parse(localStorage.getItem('magepunk_roamers_v1'));
			return { hp: st.raikou.hp, seen: st.raikou.seen, down: !!st.raikou.down };
		});
		A(after.hp === 60 && after.seen === true && !after.down, 'after fleeing, the chase continues with its wounds remembered', JSON.stringify(after));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
