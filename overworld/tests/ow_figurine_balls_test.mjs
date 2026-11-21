// ow_figurine_balls_test.mjs — Poketactica's hand-placed FIGURINE BALLS (owner, 2026-11-20): three routes per region
// (HOENN2 is gleep's: none there), each ball on its route, reachable ON FOOT from the route's edges (no surfing, no sea
// routes), cutting no path, not on a warp / sign / object, holding a species that lives on that route; picking it up puts
// that figurine (at the ball's level) into the Poketactica collection, nothing in the bag, and it stays picked up.
// Needs headless Chrome/Edge + local overworld/data.
//   node overworld/tests/ow_figurine_balls_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { FIGURINE_BALLS } from '../ow_figurine.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8942;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
const enc = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/encounters.json'), 'utf8'));
const stemOf = (id) => { for (const [r, l] of Object.entries(regions)) if (Array.isArray(l)) { const m = l.find((x) => x.id === id); if (m) return { stem: m.name, region: r }; } return null; };

// ---- the table itself
const ids = Object.keys(FIGURINE_BALLS);
const perRegion = {}; for (const id of ids) { const s = stemOf(id); if (s) perRegion[s.region] = (perRegion[s.region] || 0) + FIGURINE_BALLS[id].length; }
A(['KANTO', 'JOHTO', 'HOENN', 'SINNOH', 'JOHKANTO'].every((r) => perRegion[r] === 3), 'three figurine balls in each region', JSON.stringify(perRegion));
A(!perRegion.HOENN2, 'none in HOENN2 (gleep\'s region)');
A(ids.every((id) => FIGURINE_BALLS[id].every((b) => (enc[id]?.land?.slots || []).some((s) => s.id === b.fig))), 'each holds a species that lives on that route');

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	const mon = { speciesId: 'rattata', name: 'LEAD', level: 50, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHP: 200, curHP: 200, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 };
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
	}, STATE, [mon]);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current)).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 150));
	A(await page.evaluate(() => !!window.__ow.world.current), 'the overworld boots');

	for (const id of ids) for (const b of FIGURINE_BALLS[id]) {
		const { stem } = stemOf(id);
		const got = await page.evaluate(async (stem, mapId, b) => {
			const ow = window.__ow, w = ow.world;
			await ow.moveToMap(stem);
			for (let i = 0; i < 80 && w.current?.map?.id !== mapId; i++) await new Promise((r) => setTimeout(r, 100));
			if (w.current?.map?.id !== mapId) return { error: 'did not load' };
			const ball = ow.items.balls.find((x) => x.fig && x.tx === b.tx && x.ty === b.ty);
			if (!ball) return { error: 'no ball' };
			const map = w.current.map, W = w.current.layout.width, H = w.current.layout.height;
			const special = [...(map.warp_events || []), ...(map.bg_events || []), ...(map.object_events || []), ...(map.coord_events || [])].some((e) => +e.x === b.tx && +e.y === b.ty);
			const blk = (x, y, skip) => !w.isPassable(x, y) || w.isSurfable(x, y) || ow.npcs.occupied?.(x, y) || ow.items.balls.some((o) => !o.hidden && o !== ball && o.tx === x && o.ty === y) || (skip && x === b.tx && y === b.ty);
			const flood = (skip) => { const seen = new Set(), q = []; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !blk(x, y, skip)) { seen.add(x + ',' + y); q.push([x, y]); } while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k) || blk(nx, ny, skip)) continue; seen.add(k); q.push([nx, ny]); } } return seen; };
			const open = flood(false), shut = flood(true);
			const reachable = open.has(b.tx + ',' + b.ty), cut = [...open].filter((k) => k !== b.tx + ',' + b.ty && !shut.has(k)).length;
			const solid = ow.items.occupied(b.tx, b.ty);
			const bagBefore = JSON.stringify(ow.Bag.getBag());
			const msg = ow.items.interactAt(b.tx, b.ty);
			let fig = null;
			for (let i = 0; i < 60 && !fig; i++) { await new Promise((r) => setTimeout(r, 100)); const c = JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1') || '{"figs":{}}'); fig = Object.values(c.figs).find((f) => f.from === 'ball' && f.species === b.fig && f.level === b.lv) || null; }
			const bagSame = JSON.stringify(ow.Bag.getBag()) === bagBefore;
			const gone = !ow.items.balls.some((x) => x === ball);
			const kept = JSON.parse(localStorage.getItem('magepunk_collected_v1') || '[]').includes(`fig_${mapId}_${b.tx}_${b.ty}`);
			return { reachable, cut, special, solid, msg, fig: fig && { species: fig.species, level: fig.level }, bagSame, gone, kept };
		}, stem, id, b);
		if (got.error) { A(false, `${id}: ${got.error}`); continue; }
		A(got.reachable && got.cut === 0 && !got.special && got.solid, `${id}: the ${b.fig} ball is reachable on foot, solid, blocks no path, not on a warp / sign / object`, JSON.stringify(got));
		A(/figurine/i.test(got.msg || '') && got.fig && got.bagSame && got.gone && got.kept, `${id}: picking it up gives a ${b.fig} figurine (Lv ${b.lv}), nothing in the bag, and it stays picked up`, JSON.stringify(got));
	}
	// revisit one: it stays gone
	const back = await page.evaluate(async (stem, mapId) => { const ow = window.__ow, w = ow.world; await ow.moveToMap('PalletTown'); await new Promise((r) => setTimeout(r, 600)); await ow.moveToMap(stem); for (let i = 0; i < 80 && w.current?.map?.id !== mapId; i++) await new Promise((r) => setTimeout(r, 100)); return ow.items.balls.some((x) => x.fig); }, stemOf('MAP_ROUTE2').stem, 'MAP_ROUTE2');
	A(back === false, 'a picked-up figurine ball is not there on the next visit');
	A(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
