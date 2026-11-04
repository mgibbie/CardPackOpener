// connections_test.mjs — every map connection survives, even two on one side.
//
// Playtest: "Route 111 is fully exhausted now, so Hoenn is hard-blocked on the Rt112
// connection defect." World kept connections in an object keyed by direction, so a
// map with two on one side kept only whichever loaded LAST (they load concurrently):
// Route 111's west edge meets Route 113 (offset 0) and Route 112 (offset 20), and on
// the tester's save Route 113 won, so Route 112 couldn't be entered from 111. The
// same race cut Route 124 off from Route 125 or Mossdeep, and Six Island's Water
// Path kept one of its three west connections.
//
// For every map with 2+ connections on a side: each one is loaded, and the tile just
// past the shared edge resolves to that neighbour. Plus a real walk across both
// Route 111 crossings. The load is repeated to shake out ordering.
//
//   node overworld/tests/connections_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// the maps with 2+ connections on one side, straight from the data
const SIDES = ['up', 'down', 'left', 'right'];
const multi = [];
for (const f of fs.readdirSync(path.join(ROOT, 'overworld/data/maps')).filter(f => f.endsWith('_map.json'))) {
	const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/maps', f), 'utf8'));
	const by = {};
	for (const c of m.connections || []) if (SIDES.includes(c.direction)) (by[c.direction] ||= []).push(c);
	if (Object.values(by).some(l => l.length > 1)) multi.push({ name: f.replace('_map.json', ''), conns: (m.connections || []).filter(c => SIDES.includes(c.direction)) });
}
A(multi.some(m => m.name === 'Route111') && multi.some(m => m.name === 'Route124'), `found the maps with two connections on one side (${multi.map(m => m.name).join(', ')})`);

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9121;
const STATE = { username: 'conns', friendCode: 'CONNS0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(st => {
		localStorage.setItem('magepunk_mp_token_v1', 'conns-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		if (!localStorage.getItem('magepunk_story'))
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'lapras', name: 'LAPRAS', level: 50, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb', ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 190, atk: 105, def: 95, spa: 105, spd: 115, spe: 75 }, maxHP: 190, curHP: 190, exp: 125000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's131.png', num: 131 }]));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route111&x=5&y=60`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 200 && !(await page.evaluate(() => !!window.__ow?.world?.current?.layout).catch(() => false)); i++) await sleep(200);
	await sleep(1500);

	// every multi-connection map: load it a few times; each connection must be there
	for (const m of multi) {
		const got = await page.evaluate(async (name, conns) => {
			const w = window.__ow.world, runs = [];
			for (let i = 0; i < 4; i++) {
				await w.load(name);
				const lay = w.current.layout;
				runs.push(conns.map(c => {
					const dir = { up: 'up', down: 'down', left: 'left', right: 'right' }[c.direction];
					const want = c.map;
					// read either shape, so a regression to the direction-keyed object FAILS rather than crashes
					const list = Array.isArray(w.connections) ? w.connections : Object.entries(w.connections).map(([d, v]) => ({ ...v, dir: d }));
					const entry = list.find(x => x.map?.id === want && x.dir === dir);
					if (!entry) return `${want}: missing`;
					// a tile just past the edge, inside this neighbour's span
					const o = c.offset || 0;
					const along = o >= 0 ? o : 0;
					const t = dir === 'left' ? [-1, along] : dir === 'right' ? [lay.width, along] : dir === 'up' ? [along, -1] : [along, lay.height];
					const at = w.connectionAt(t[0], t[1]);
					return at && at.conn.map.id === want ? 'ok' : `${want}: edge tile resolves to ${at ? at.conn.map.id : 'nothing'}`;
				}));
			}
			return runs;
		}, m.name, m.conns);
		const bad = got.flat().filter(r => r !== 'ok');
		A(!bad.length, `${m.name}: all ${m.conns.length} connections load and own their edge, across 4 loads`, bad.slice(0, 3).join(' | '));
	}

	// the playtester's crossing, walked: Route 111 -> Route 112 on both shared rows
	for (const row of [29, 68]) {
		await page.evaluate(async y => { const W = window.__ow; await W.moveToMap('Route111', 1, y); }, row);
		await sleep(1200);
		for (let i = 0; i < 4; i++) { await page.evaluate(() => { try { window.__ow.pumpPlayer('left', 0.4); } catch (e) {} }); await sleep(450); }
		const at = await page.evaluate(() => window.__ow.world.current.name);
		A(at === 'Route112', `walking west from Route 111 row ${row} reaches Route 112`, at);
	}
	// ...and the other neighbour on the same side
	await page.evaluate(async () => { await window.__ow.moveToMap('Route111', 1, 8); });
	await sleep(1200);
	for (let i = 0; i < 4; i++) { await page.evaluate(() => { try { window.__ow.pumpPlayer('left', 0.4); } catch (e) {} }); await sleep(450); }
	A(await page.evaluate(() => window.__ow.world.current.name) === 'Route113', 'walking west from Route 111 row 8 reaches Route 113');
	A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
