// looseends_test.mjs — the loose-ends batch from the fourth audit.
//
//   * HEADBUTT: Crystal's treemon tables harvested (the last missing
//     encounter modality) — face a tree, slam it, something drops out
//   * ESCAPE ROPE actually escapes (it was inert, per the engine's own
//     comment); ITEMFINDER pings buried items; TOWN MAP opens the map
//   * the Pokédex plays cries (1,366 files shipped, never a note)
//   * three synthesized fanfares land the big moments (badge, evolution,
//     capture) instead of single blips
//
//   node overworld/tests/looseends_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source + data ----------
{
	const hb = fs.readFileSync(path.join(ROOT, 'overworld/headbutt_data.js'), 'utf8');
	A(/heracross/.test(hb) && /aipom/.test(hb) && /IlexForest/.test(hb), 'the treemon harvest carries the classics');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/headbutt: \{ name: 'HEADBUTT'/.test(mn), 'HEADBUTT is a field move');
	A(/function useGadget/.test(mn) && /escaperope/.test(mn) && /itemfinder/.test(mn), 'the gadget key-items route through useGadget');
	A(/hear its cry/.test(mn), 'the dex detail page advertises the cry');
	for (const f of ['fanfare_badge', 'fanfare_evolve', 'fanfare_capture'])
		A(fs.existsSync(path.join(ROOT, `overworld/data/sounds/sfx/${f}.ogg`)), `${f}.ogg is rendered`);
	A(/sfx\('fanfare_badge'\)/.test(mn), 'the badge moment plays its fanfare');
	A(/sfx\('fanfare_evolve'\)/.test(fs.readFileSync(path.join(ROOT, 'overworld/evolution.js'), 'utf8')), 'evolution bursts with its fanfare');
	A(/sfx\('fanfare_capture'\)/.test(fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8')), 'Gotcha! plays the capture roll');
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
	const PORT = 8994;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 30, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 90, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 90, curHP: 90,
		exp: 27000, moves: [{ id: 'headbutt', name: 'Headbutt', pp: 15, maxPp: 15 }], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			// spy every sound the game makes (sfx and cries build Audio objects)
			window.__played = [];
			const RealAudio = window.Audio;
			window.Audio = function (src) { window.__played.push(String(src || '')); return new RealAudio(); };
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route29`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'Route 29 boots');
		const closeDialog = async (key = 'x') => {
			for (let i = 0; i < 8 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press(key); await new Promise(r => setTimeout(r, 130)); }
		};

		// --- HEADBUTT drops a treemon out of a tree ---
		const hb = await page.evaluate(() => {
			const ow = window.__ow;
			const o = { set: ow.HEADBUTT_MAPS.Route29 };
			// find a passable tile with an impassable neighbor (the "tree")
			const lay = ow.world.current.layout;
			outer: for (let y = 2; y < lay.height - 2; y++) for (let x = 2; x < lay.width - 2; x++) {
				if (ow.world.isPassable(x, y) && !ow.world.isPassable(x, y - 1) && !ow.world.warpAt(x, y - 1)) {
					const p = ow.player;
					p.tx = x; p.ty = y; p.px = x * 16; p.py = y * 16; p.facing = 'up';
					break outer;
				}
			}
			const rand = Math.random;
			Math.random = () => 0.5; // deterministic: common table, something drops
			ow.HM_FIELD.headbutt.use();
			Math.random = rand;
			return { ...o, asked: ow.dialog.blocking };
		});
		A(hb.set === 'route', 'Route 29 carries its Crystal treemon set', hb.set);
		A(hb.asked, 'the slam raises its dialog');
		await closeDialog('z');
		for (let i = 0; i < 40 && !(await page.evaluate(() => window.__ow.battle.blocking)); i++) await new Promise(r => setTimeout(r, 200));
		const dropped = await page.evaluate(() => ({
			foe: window.__ow.battle.active?.foe?.speciesId,
			ok: ['hoothoot', 'spearow', 'aipom', 'pineco', 'ekans', 'exeggcute', 'ledyba', 'spinarak', 'heracross'].includes(window.__ow.battle.active?.foe?.speciesId),
		}));
		A(dropped.ok, 'a treemon drops out and attacks', String(dropped.foe));
		await page.evaluate(async () => {
			const b = window.__ow.battle;
			for (let i = 0; i < 100; i++) { const a = b.active; if (a && a.phase === 'menu') break; await new Promise(r => setTimeout(r, 100)); }
			if (b.active) { b.startQueue(() => b.tryRun()); for (let i = 0; i < 150 && b.active; i++) await new Promise(r => setTimeout(r, 100)); }
		});

		// --- the gadgets ---
		const gadget = await page.evaluate(async () => {
			const ow = window.__ow;
			const o = {};
			ow.Bag.addItem('escaperope', 2);
			o.refused = ow.useGadget('escaperope');           // outdoors: nothing to escape
			o.refusedFlash = ow.bagMenu.flash;
			await ow.moveToMap('UnionCaveB1F', 5, 5);
			o.deep = ow.world.current.name;
			ow.useGadget('escaperope');
			await new Promise(r => setTimeout(r, 300));
			return o;
		});
		A(gadget.refused === true && /Nothing to escape/.test(gadget.refusedFlash || ''), 'outdoors, the rope refuses');
		A(gadget.deep === 'UnionCaveB1F', 'the cave loads');
		await closeDialog('z');
		await new Promise(r => setTimeout(r, 1200));
		const escaped = await page.evaluate(() => ({
			map: window.__ow.world.current.name,
			left: window.__ow.Bag.count('escaperope'),
		}));
		A(escaped.map === 'Route29' && escaped.left === 1, 'the rope climbs back to the open air and is spent', JSON.stringify(escaped));

		const finder = await page.evaluate(() => {
			const ow = window.__ow;
			const o = {};
			ow.items.balls = ow.items.balls.filter(b => !b.hidden);
			ow.useGadget('itemfinder');
			o.silent = ow.bagMenu.flash;
			ow.items.balls.push({ tx: ow.player.tx + 4, ty: ow.player.ty - 2, id: 'nugget', pretty: 'Nugget', key: 'test_h', hidden: true });
			ow.useGadget('itemfinder');
			o.ping = ow.bagMenu.flash;
			ow.items.balls = ow.items.balls.filter(b => b.key !== 'test_h');
			ow.useGadget('townmap');
			o.map = ow.townMap.open;
			ow.townMap.open = false;
			return o;
		});
		A(/stays silent/.test(finder.silent || ''), 'the ITEMFINDER is honest about empty ground');
		A(/north-east/.test(finder.ping || ''), 'and points at buried treasure', finder.ping);
		A(finder.map === true, 'the TOWN MAP item opens the town map');

		// --- the dex speaks ---
		const dex = await page.evaluate(() => {
			const ow = window.__ow;
			ow.Dex.markSeen('pikachu');
			const list = ow.dexList();
			const idx = list.findIndex(e => e.id === 'pikachu');
			if (idx < 0) return { idx };
			ow.dexMenu.open = true; ow.dexMenu.detail = true; ow.dexMenu.idx = idx;
			window.__played.length = 0;
			ow.dexKey('z');
			const played = window.__played.slice();
			ow.dexMenu.open = false; ow.dexMenu.detail = false;
			return { idx, played };
		});
		A(dex.idx >= 0 && dex.played.some(s => /cries\/pikachu/.test(s)), "Z on the dex page plays PIKACHU's cry", JSON.stringify(dex.played));

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
