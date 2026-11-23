// place_figballs.mjs — picks where Poketactica's hand-placed FIGURINE BALLS go (owner, 2026-11-20: "placed figurine
// balls"), with the overworld's own walkability, and prints the table for poketactica/js/figballs.js FIGURINE_BALLS.
// Three routes per region (early, middle, late, among routes with land encounters; HOENN2 is gleep's and left alone).
// On each, the spot is a reachable dead-end nook (one open neighbour, reachable from the map's edges) where a solid ball
// cuts no path, not on a warp, a sign or an object — the farthest such nook from the map's edges (a little hidden). The
// figurine is a species that lives on that route (its rarest land slot) at that route's top wild level.
//   node tools/poketactica/place_figballs.mjs            (needs Chrome + overworld/data; prints JSON)
// overworld/tests/ow_figurine_balls_test.mjs re-checks every placed ball the same way.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8941;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg' };
const REGIONS = ['KANTO', 'JOHTO', 'HOENN', 'SINNOH', 'JOHKANTO'];

const regions = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/map_regions.json'), 'utf8'));
const enc = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/encounters.json'), 'utf8'));
const species = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
function candidates(region) {
	// (the regions spell routes MAP_ROUTE1 / MAP_ROUTE_26 / MAP_SINNOH_ROUTE205_NORTH)
	const routes = (regions[region] || []).filter((m) => /ROUTE_?\d+(_(NORTH|SOUTH|EAST|WEST))?$/.test(m.id) && enc[m.id] && enc[m.id].land && enc[m.id].land.slots.length);
	routes.sort((a, b) => (+a.id.match(/ROUTE_?(\d+)/)[1]) - (+b.id.match(/ROUTE_?(\d+)/)[1]) || a.id.localeCompare(b.id));
	return routes;
}
function figFor(mapId) {
	const slots = enc[mapId].land.slots.filter((s) => species[s.id]);
	const w = {}; for (const s of slots) w[s.id] = (w[s.id] || 0) + (s.w || 1);
	const rarest = Object.entries(w).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))[0][0];
	return { fig: rarest, lv: Math.max(...slots.map((s) => s.max || s.min || 5)) };
}

const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) {} res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox'] });
const page = await browser.newPage();
const mon = { speciesId: 'rattata', name: 'LEAD', level: 50, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 200, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHP: 200, curHP: 200, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 };
await page.evaluateOnNewDocument((st, party) => {
	localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
	localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'KANTO');
	localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
}, STATE, [mon]);
await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current)).catch(() => false)); i++) await new Promise((r) => setTimeout(r, 150));

const out = {};
for (const region of REGIONS) {
	// early, middle and late: when a route has no safe nook, the next route along takes its place
	const all = candidates(region), used = new Set();
	const orders = [all.map((_, i) => i), all.map((_, i) => i).slice(Math.floor(all.length / 2)), all.map((_, i) => all.length - 1 - i)];   // (the late pick searches backwards)
	for (const order of orders) for (const k of order) {
		const m = all[k];
		if (used.has(m.id)) continue;
		used.add(m.id);
		const got = await page.evaluate(async (stem, mapId) => {
			const ow = window.__ow, w = ow.world;
			await ow.moveToMap(stem);
			for (let i = 0; i < 80 && w.current?.map?.id !== mapId; i++) await new Promise((r) => setTimeout(r, 100));
			if (w.current?.map?.id !== mapId) return { error: 'did not load ' + stem };
			const map = w.current.map, W = w.current.layout.width, H = w.current.layout.height;
			const special = new Set([...(map.warp_events || []), ...(map.bg_events || []), ...(map.object_events || []), ...(map.coord_events || [])].map((e) => (+e.x) + ',' + (+e.y)));
			// (on foot only: a water tile counts as blocked, so a ball is never on a sea island like Route 130's Mirage Island)
			const blk = (x, y, skip) => !w.isPassable(x, y) || w.isSurfable(x, y) || ow.npcs.occupied?.(x, y) || ow.items.occupied?.(x, y) || (skip && x === skip[0] && y === skip[1]);
			const flood = (skip) => {
				const seen = new Map(), q = [];
				for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && !blk(x, y, skip)) { seen.set(x + ',' + y, 0); q.push([x, y]); }
				while (q.length) { const [x, y] = q.shift(), d = seen.get(x + ',' + y); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = nx + ',' + ny; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(k) || blk(nx, ny, skip)) continue; seen.set(k, d + 1); q.push([nx, ny]); } }
				return seen;
			};
			// a sea route (more than half water: Hoenn's 130, Sinnoh's 230) is passed over: its "land" is islands
			let water = 0, land = 0; for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) { if (w.isSurfable(x, y)) water++; else if (w.isPassable(x, y)) land++; }
			if (water > land) return { error: 'a sea route' };
			const open = flood(null);
			const nooks = [];
			for (const [k, d] of open) {
				if (special.has(k)) continue;
				const [x, y] = k.split(',').map(Number);
				if (x === 0 || y === 0 || x === W - 1 || y === H - 1) continue;
				const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open.has((x + dx) + ',' + (y + dy))).length;
				if (nb === 1) nooks.push({ x, y, d });
			}
			nooks.sort((a, b) => b.d - a.d || a.y - b.y || a.x - b.x);
			for (const n of nooks.slice(0, 40)) {
				const shut = flood([n.x, n.y]);
				const cut = [...open.keys()].filter((k) => k !== n.x + ',' + n.y && !shut.has(k)).length;
				if (!cut) return { tx: n.x, ty: n.y, nooks: nooks.length };
			}
			return { error: 'no nook', nooks: nooks.length };
		}, m.name, m.id);
		if (got.error) { console.error(region, m.id, got.error); continue; }
		const f = figFor(m.id);
		out[m.id] = [{ tx: got.tx, ty: got.ty, fig: f.fig, lv: f.lv }];
		console.error(region, m.id, JSON.stringify(out[m.id][0]), 'nooks', got.nooks);
		break;
	}
}
console.log(JSON.stringify(out, null, 1));
await browser.close(); server.close();
