// momwater_test.mjs — two live-play reports from the Johto test:
//
//   * "my mom should heal my pokemon if i talk to her" — the heal op never
//     survived the transpile in ANY region. Talking to Mom (post-intro) now
//     heals the party; healthy teams get a warm word instead.
//   * "the water isnt moving" — the map renders once into cached canvases,
//     so water sat frozen everywhere. A GB-style 1px wobble now re-draws
//     visible surfable tiles from the cache; the test PROVES pixels move by
//     diffing a water tile between wobble phases (and that dry land holds
//     perfectly still).
//
//   node overworld/tests/momwater_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/MOM_SCRIPTS = new Set\(\['MomScript', 'PalletTown_PlayersHouse_1F_EventScript_Mom', 'PlayersHouse_1F_EventScript_Mom'\]\)/.test(mn),
		"all three regions' moms are covered");
	A(/MOM_SCRIPTS\.has\(npc\.ev\.script\) && Story\.getFlag\('intro_done'\)/.test(mn),
		'the intercept yields to the intro story beats');
	A(/drawWaterAnim\(ctx, camX, camY\)/.test(mn) && /!editView\.on/.test(mn),
		'the wobble draws each frame (and stays out of the editor)');
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
	const PORT = 8996;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 20, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, maxHP: 60, curHP: 21, status: 'psn',
		exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 12, maxPp: 35 }], sprite: 's608.png', num: 19,
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
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PlayersHouse1F&x=5&y=5`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), "the player's house boots");
		const closeDialog = async (key = 'z') => {
			for (let i = 0; i < 10 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press(key); await new Promise(r => setTimeout(r, 140)); }
		};

		// --- Mom heals a battered party (she wanders — find her, stand beside her) ---
		const mom = await page.evaluate(() => {
			const ow = window.__ow;
			const m = ow.npcs.list.find(n => n.ev?.script === 'MomScript');
			if (!m) return { found: false };
			const spots = [[m.tx, m.ty + 1, 'up'], [m.tx, m.ty - 1, 'down'], [m.tx - 1, m.ty, 'right'], [m.tx + 1, m.ty, 'left']];
			const s = spots.find(([x, y]) => ow.world.isPassable(x, y));
			if (!s) return { found: true, noSpot: true };
			const p = ow.player;
			p.tx = s[0]; p.ty = s[1]; p.px = s[0] * 16; p.py = s[1] * 16; p.facing = s[2];
			ow.interact();
			return { found: true, hpBefore: ow.party[0].curHP, asked: ow.dialog.blocking };
		});
		A(mom.found && !mom.noSpot, 'MOM is home and reachable', JSON.stringify(mom));
		A(mom.asked && mom.hpBefore === 21, 'talking to her opens her care', JSON.stringify(mom));
		await closeDialog('z');
		const healed = await page.evaluate(() => ({
			hp: window.__ow.party[0].curHP,
			status: window.__ow.party[0].status || null,
			pp: window.__ow.party[0].moves[0].pp,
			saved: JSON.parse(localStorage.getItem('magepunk_party_v1'))[0].curHP,
		}));
		A(healed.hp === 60 && healed.status === null && healed.pp === 35, 'the party comes back rested — HP, status, and PP', JSON.stringify(healed));
		A(healed.saved === 60, 'and the heal is saved');
		const momAgain = await page.evaluate(() => { window.__ow.interact(); return window.__ow.dialog.blocking; });
		A(momAgain, 'a healthy team still gets a warm word');
		await closeDialog('z');

		// --- the water moves: diff a surfable tile between wobble phases ---
		const water = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('Route40', 10, 10); // Johto's sea route
			await new Promise(r => setTimeout(r, 600));
			const lay = ow.world.current.layout;
			let wet = null, dry = null;
			for (let y = 1; y < lay.height - 1 && (!wet || !dry); y++) {
				for (let x = 1; x < lay.width - 1 && (!wet || !dry); x++) {
					if (!wet && ow.world.isSurfable(x, y) && ow.world.isSurfable(x + 1, y) && ow.world.isSurfable(x - 1, y)) wet = [x, y];
					if (!dry && !ow.world.isSurfable(x, y) && ow.world.isPassable(x, y)) dry = [x, y];
				}
			}
			if (!wet) return { wet };
			const c = document.createElement('canvas');
			c.width = 64; c.height = 64;
			const ctx = c.getContext('2d');
			const snap = (off) => {
				ctx.clearRect(0, 0, 64, 64);
				// draw the raw cache, then the wobble at the forced phase
				ctx.drawImage(ow.world.current.canvases.bottom, wet[0] * 16 - 16, wet[1] * 16 - 16, 48, 48, 0, 0, 48, 48);
				ow.drawWaterAnim(ctx, wet[0] * 16 - 16, wet[1] * 16 - 16, off);
				return ctx.getImageData(16, 16, 16, 16).data.join();
			};
			const p0 = snap(0), p1 = snap(1), pm1 = snap(-1);
			const drySnap = (off) => {
				if (!dry) return '';
				ctx.clearRect(0, 0, 64, 64);
				ctx.drawImage(ow.world.current.canvases.bottom, dry[0] * 16 - 16, dry[1] * 16 - 16, 48, 48, 0, 0, 48, 48);
				ow.drawWaterAnim(ctx, dry[0] * 16 - 16, dry[1] * 16 - 16, off);
				return ctx.getImageData(16, 16, 16, 16).data.join();
			};
			return { wet, dry, moves: p0 !== p1 && p0 !== pm1 && p1 !== pm1, landStill: drySnap(0) === drySnap(1) };
		});
		A(!!water.wet, 'Route 40 has open sea', JSON.stringify(water.wet));
		A(water.moves === true, 'the water tile PIXELS differ across wobble phases — the sea moves', JSON.stringify(water));
		A(water.landStill === true, 'dry land holds perfectly still');

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
