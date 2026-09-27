// counters_test.mjs — store clerks answer ACROSS their counters.
//
// Playtest 2026-09-26: the Celadon Department Store clerks on 2F, 4F and 5F
// could not be spoken to — each stands behind a counter tile, and from the
// public side no tile touches them. The GBA's field_control_avatar.c looks one
// tile further when the faced tile is a counter (MB_COUNTER, 0x80 in FRLG and
// Emerald); interact() now does the same. Sweeps every department-store floor:
// from the stair landing, every NPC must be talkable (face to face or across a
// counter), and each across-counter clerk must actually answer.
//
//   node overworld/tests/counters_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9134;
const STATE = { username: 'counters', friendCode: 'CNTR00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 },
	maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 };
const B = ids => Object.fromEntries(ids.map(i => [i, true]));

// [map, landing x, landing y] — the landing is a tile beside the floor's stairs
const FLOORS = [
	['CeladonCity_DepartmentStore_2F', 'KANTO'], ['CeladonCity_DepartmentStore_3F', 'KANTO'],
	['CeladonCity_DepartmentStore_4F', 'KANTO'], ['CeladonCity_DepartmentStore_5F', 'KANTO'],
	['GoldenrodDeptStore2F', 'JOHTO'], ['GoldenrodDeptStore3F', 'JOHTO'], ['GoldenrodDeptStore4F', 'JOHTO'],
	['GoldenrodDeptStore5F', 'JOHTO'], ['GoldenrodDeptStore6F', 'JOHTO'],
	['Hoenn2_LilycoveCity_DepartmentStore_2F', 'HOENN'], ['Hoenn2_LilycoveCity_DepartmentStore_3F', 'HOENN'],
	['Hoenn2_LilycoveCity_DepartmentStore_4F', 'HOENN'], ['Hoenn2_LilycoveCity_DepartmentStore_5F', 'HOENN'],
];
// FRLG's move tutors (data/scripts/move_tutors.inc) aren't ported yet: this one is
// silent face to face too, so across the counter he stays silent — not a counter bug
const UNPORTED = new Set(['CeladonCity_DepartmentStore_3F_EventScript_CounterTutor']);
const MUST = {   // the reported clerks, by map object position
	CeladonCity_DepartmentStore_2F: [[1, 8], [1, 6]],
	CeladonCity_DepartmentStore_4F: [[3, 13]],
	CeladonCity_DepartmentStore_5F: [[1, 7], [1, 6]],
};

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	for (const [map, region] of FLOORS) {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, lead, region) => {
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', 'counters-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', region);
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
			localStorage.setItem('magepunk_money', '5000');
			localStorage.setItem('magepunk_repel_v1', '99999');
		}, STATE, LEAD, region);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data)).catch(() => false)); i++) await sleep(200);
		await sleep(1500);
		const r = await page.evaluate(async (must) => {
			const W = window.__ow, w = W.world, cur = w.current;
			const npcAt = (x, y) => W.npcs.list.find(n => n.tx === x && n.ty === y);
			// the landing: a walkable tile next to the first warp that isn't the elevator
			const warps = (cur.map.warp_events || []).filter(e => !/ELEVATOR/.test(e.dest_map || ''));
			const D = [[0, 1], [0, -1], [1, 0], [-1, 0]], FACE = ['down', 'up', 'right', 'left'];
			const ok = (x, y) => w.isPassable(x, y) && !npcAt(x, y);
			let start = null;
			for (const e of warps) { for (const [dx, dy] of D) if (!start && ok(e.x + dx, e.y + dy)) start = [e.x + dx, e.y + dy]; }
			if (!start) return { error: 'no landing' };
			const seen = new Set([start.join()]), q = [start];
			while (q.length) { const [x, y] = q.shift(); for (const [dx, dy] of D) { const k = `${x + dx},${y + dy}`; if (!seen.has(k) && ok(x + dx, y + dy)) { seen.add(k); q.push([x + dx, y + dy]); } } }
			const out = [];
			for (const n of W.npcs.list) {
				if (!n.ev?.script || n.ev.script === '0x0') continue;
				let direct = null, across = null;
				for (const k of seen) {
					const [x, y] = k.split(',').map(Number);
					D.forEach(([dx, dy], i) => {
						if (x + dx === n.tx && y + dy === n.ty) direct ||= [x, y, FACE[i]];
						if (x + 2 * dx === n.tx && y + 2 * dy === n.ty && w.behaviorAt(x + dx, y + dy) === 0x80 && !npcAt(x + dx, y + dy)) across ||= [x, y, FACE[i]];
					});
				}
				let answered = null;
				if (!direct && across) {
					const p = W.player; [p.tx, p.ty, p.facing] = across; p.px = p.tx * 16; p.py = p.ty * 16; p.moving = false;
					W.interact();
					await new Promise(r => setTimeout(r, 400));
					answered = !!(W.dialog.blocking || W.shopMenu.open || W.cutscene.blocking);
					for (let i = 0; i < 40 && (W.dialog.blocking || W.cutscene.blocking || W.shopMenu.open); i++) {
						if (W.shopMenu.open) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
						if (W.dialog.blocking) { W.dialog.revealed = 1e9; W.dialog.key('x'); }
						await new Promise(r => setTimeout(r, 80));
					}
				}
				out.push({ at: [n.tx, n.ty], script: n.ev.script, direct: !!direct, across, answered });
			}
			// through-wall control: a blocked NON-counter tile with an NPC behind it stays a wall
			const walls = [];
			for (const k of seen) {
				const [x, y] = k.split(',').map(Number);
				D.forEach(([dx, dy], i) => {
					if (!w.isPassable(x + dx, y + dy) && w.behaviorAt(x + dx, y + dy) !== 0x80 && !npcAt(x + dx, y + dy) && npcAt(x + 2 * dx, y + 2 * dy)
						&& !(cur.map.bg_events || []).some(b => b.x === x + dx && b.y === y + dy)) walls.push([x, y, FACE[i]]);
				});
			}
			let wallTalk = 0;
			for (const t of walls.slice(0, 4)) {
				const p = W.player; [p.tx, p.ty, p.facing] = t; p.px = p.tx * 16; p.py = p.ty * 16; p.moving = false;
				W.interact();
				await new Promise(r => setTimeout(r, 300));
				if (W.dialog.blocking || W.shopMenu.open || W.cutscene.blocking) wallTalk++;
				for (let i = 0; i < 40 && (W.dialog.blocking || W.cutscene.blocking || W.shopMenu.open); i++) {
					if (W.shopMenu.open) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
					if (W.dialog.blocking) { W.dialog.revealed = 1e9; W.dialog.key('x'); }
					await new Promise(r => setTimeout(r, 80));
				}
			}
			const mustHit = must.map(([x, y]) => out.find(o => o.at[0] === x && o.at[1] === y));
			return { reach: seen.size, out, mustHit, walls: Math.min(4, walls.length), wallTalk };
		}, MUST[map] || []);
		if (r.error) { A(false, `${map}: ${r.error}`); await ctx.close(); continue; }
		const stuck = r.out.filter(o => !o.direct && !o.across);
		A(!stuck.length, `${map}: every NPC is talkable from the public side (${r.out.length} NPCs, ${r.reach} tiles)`, JSON.stringify(stuck.map(o => o.script)));
		const silent = r.out.filter(o => o.across && o.answered === false && !UNPORTED.has(o.script));
		A(!silent.length, `${map}: each across-counter NPC answers interact() (${r.out.filter(o => o.across && !o.direct).length})`, JSON.stringify(silent.map(o => o.script)));
		for (const m of r.mustHit) A(m && (m.direct || m.answered), `${map}: the reported clerk ${m ? m.script : '(missing)'} answers`, JSON.stringify(m));
		if (r.walls) A(r.wallTalk === 0, `${map}: an NPC behind a plain wall stays unreachable (${r.walls} probes)`, String(r.wallTalk));
		A(errors.length === 0, `${map}: no uncaught page error`, JSON.stringify(errors.slice(0, 2)));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
