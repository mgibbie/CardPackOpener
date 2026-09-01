// crystal_hms_test.mjs — HMs mean something in Gen-2 Kanto.
//
// TWO bugs, both the shape of a payload nothing reads.
//
// THE GATE. `useFieldMove` and blockers.js both asked `playerRegion()` which
// region's HM rules apply — and `magepunk_region` records the region you STARTED
// in and is only ever KANTO, JOHTO or HOENN. So HM_GATE.JOHKANTO was config
// nothing could reach, Gen-2 Kanto used whichever region you happened to begin in,
// and a Johto starter needed 8 badges for WATERFALL there while a Kanto starter
// needed none.
//
// FLASH. `HM_FIELD.flash` checked `map.requires_flash`, set a `flash_<map>` story
// flag, and NOTHING ANYWHERE READ THAT FLAG — so the cave was never dark, even on
// the two Kanto maps that carried the field. Crystal's thirteen PALETTE_DARK maps
// had no field at all, Rock Tunnel among them, which is the whole reason Gen-2
// Kanto hands you the HM.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/crystal_hms_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const D = path.join(ROOT, 'overworld/data');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const Badges = await import('../badges.js');
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));

// ---------- the gate reads the map, not your origin ----------
A(typeof Badges.regionOfMap === 'function', 'badges.js exposes regionOfMap');
A(Badges.regionOfMap('MAP_JOHKANTO_ROCK_TUNNEL_1F', 'KANTO') === 'JOHKANTO',
	'a Gen-2 Kanto map uses JOHKANTO rules however you started');
A(Badges.regionOfMap('MAP_JOHKANTO_ROUTE_2', 'JOHTO') === 'JOHKANTO', '...for a Johto starter too');
A(Badges.regionOfMap('MAP_ROUTE1', 'KANTO') === 'KANTO', 'and Kanto still uses its own');
A(Badges.regionOfMap('MAP_SILVER_CAVE_ROOM_1', 'JOHTO') === 'JOHTO',
	'unprefixed border maps fall back, since they are Johto ground');
A(Badges.hmReq('JOHKANTO', 'waterfall') === 0 && Badges.hmReq('JOHTO', 'waterfall') === 8,
	'JOHKANTO and JOHTO genuinely differ, which is why reading the wrong one mattered');
const mainSrc = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
const blockSrc = fs.readFileSync(path.join(ROOT, 'overworld/blockers.js'), 'utf8');
A(/regionOfMap\(world\.current\?\.map\?\.id/.test(mainSrc), 'useFieldMove reads the map region');
A(/regionOfMap\(curMapId/.test(blockSrc), 'and so do HM-gated blockers');

// ---------- the dark maps ----------
let dark = 0; const byRegion = {};
for (const [rn, list] of Object.entries(regions)) {
	for (const m of list) {
		const p = path.join(D, 'maps', `${m.name}_map.json`);
		if (!fs.existsSync(p)) continue;
		const d = JSON.parse(fs.readFileSync(p, 'utf8'));
		if (!d.requires_flash) continue;
		dark++; byRegion[rn] = (byRegion[rn] || 0) + 1;
	}
}
A(dark >= 15, `${dark} maps are dark now`, JSON.stringify(byRegion));
for (const stem of ['JohKantoRockTunnel1F', 'JohKantoRockTunnelB1F', 'WhirlIslandLugiaChamber', 'DarkCaveVioletEntrance']) {
	const d = JSON.parse(fs.readFileSync(path.join(D, 'maps', `${stem}_map.json`), 'utf8'));
	A(d.requires_flash === true, `${stem} needs FLASH`);
}
A(/mapIsUnlit\(\)/.test(mainSrc) && /drawCaveDark\(ctx/.test(mainSrc),
	'and the flash_<map> flag drives a real darkness overlay, not just a message');

// ---------- WHIRLPOOL: deliberately absent ----------
// Crystal's HM06 has nothing to gate here. Only three blocks in the whole decomp
// carry a WHIRLPOOL quadrant, and the one in the `johto` tileset is
// WHIRLPOOL/BUOY/WATER/BUOY — a mixed block that became ordinary surfable water.
// Making it blocking would block the buoy and water quadrants it shares. A field
// move with nothing to use it on is the bug this suite exists to catch.
A(!/whirlpool:\s*\{\s*name:/.test(mainSrc), 'WHIRLPOOL is not offered as a field move that would do nothing');

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8929;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 60, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 200, atk: 140, def: 140, spa: 140, spd: 140, spe: 140 }, maxHP: 200, curHP: 200,
		exp: 216000, moves: [{ id: 'flash', name: 'Flash', pp: 20, maxPp: 20 }], sprite: 's608.png', num: 19,
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
		// KANTO on purpose: the gate bug only showed for a starter who was not from
		// the region whose map they were standing on.
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.removeItem('magepunk_story');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots as a KANTO starter');

		const cave = await page.evaluate(async () => {
			const ow = window.__ow;
			await ow.moveToMap('JohKantoRockTunnel1F');
			const before = ow.mapIsUnlit();
			ow.Story.setFlag('flash_' + ow.world.current.map.id);
			return { map: ow.world.current.map.id, requires: !!ow.world.current.map.requires_flash, before, after: ow.mapIsUnlit() };
		});
		A(cave.requires === true, 'ROCK TUNNEL is a dark map', JSON.stringify(cave));
		A(cave.before === true, '...unlit when you walk in', JSON.stringify(cave));
		A(cave.after === false, '...and lit once FLASH is used there', JSON.stringify(cave));

		// The gate itself, both ways. With no JohKanto badges FLASH is refused — and
		// the refusal names JOHKANTO's first badge, which is the whole fix: a KANTO
		// starter used to be judged on Kanto's badges here.
		const refused = await page.evaluate(async () => {
			const ow = window.__ow;
			const B = await import('./badges.js');
			B.reset?.();
			ow.Story.clearFlag('flash_MAP_JOHKANTO_ROCK_TUNNEL_1F');
			ow.cutscene.stop();
			ow.useFieldMove('flash', ow.party[0]);
			return { text: (ow.dialog.pages || []).join(' '), jk: B.count('JOHKANTO'), kanto: B.count('KANTO') };
		});
		A(/LEAGUE rule/i.test(refused.text) && /Boulder Badge/i.test(refused.text),
			"with no JohKanto badges FLASH is refused, naming JOHKANTO's own first badge",
			JSON.stringify(refused));

		// earn that badge and it works
		const lit = await page.evaluate(async () => {
			const ow = window.__ow;
			const B = await import('./badges.js');
			B.earn('JOHKANTO', 'boulder');
			ow.cutscene.stop();
			ow.useFieldMove('flash', ow.party[0]);
			return { text: (ow.dialog.pages || []).join(' '), showing: !!ow.dialog.blocking, unlit: ow.mapIsUnlit() };
		});
		A(lit.showing && /lit up/i.test(lit.text), 'with the badge, FLASH lights the cave', JSON.stringify(lit));
		A(lit.unlit === false, '...and the darkness is actually gone', JSON.stringify(lit));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 2).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
