// micasurvivor_server_test.mjs — MicaSurvivor (M3) on the site's account backend, against the
// REAL handler (server/mp.mjs bundled like the dev server) over sqlite:
//   1. the cloud save: micasurvivor-save-get / -put need a login (401), read and write ONLY the
//      exact key micasurvivor:<token's user> (a body username is ignored), validate the shape,
//      cap the size (413), revision compare-and-set (a stale rev gets 409 + the stored save; two
//      puts racing on one rev: exactly one lands), rate-limited (429), never GC'd
//   2. the leaderboard: run-score mode 'micasurvivor' ranks by survival time, then kills; refuses a
//      bad / over-cap time (400) instead of clamping it; keeps only a player's best; the W/L and
//      micatro boards still work; run-leaderboard returns the top + your rank
//   3. wiring (static): the Pewter Museum 1F arcade cabinet (map tiles: open floor, solid wall
//      above, a free play tile, door / triggers / NPCs untouched), its sprite, the interaction
//      launching /micasurvivor/?direct=1 after saving, the landing tile with its credit + art,
//      the sitemap, the client calling the right actions
//   4. DLC D0b, the Expedition modes: micasurvivor-exp-save-get / -put (login, the exact key micasurvivorexp:<user>
//      only and never the base row, the shape refused field by field, the 200 KB cap, compare-and-set (409 + the
//      stored save; a race: one lands), every put MERGED into the stored save so nothing goes backwards: the max of
//      each counter, the union of each set), not GC'd; the micasurvivor_expedition boards (one per map + difficulty,
//      by score then time; an Expedition score refused on the base board and a non-Expedition score on the
//      Expedition board, like micatro_modded; the base board untouched); the co-op lobby's mode + dv (an Expedition
//      lobby refuses a mismatched / missing dv with "your game is out of date: reload", writes nothing; the start
//      carries them; a base lobby is unchanged); the replay meta allow-list and the live beacon taking 'exp-…' + dv
//   node overworld/tests/micasurvivor_server_test.mjs
//   (MSURV_MP_PATH=<file next to server/mp.mjs> runs it against another copy of the handler, e.g. main's, for a
//   before / after: on main, part 4 fails)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- a D1 stand-in that records row writes ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { const r = stmt.run(...bound); if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql) && Number(r.changes) > 0) writes.push(String(bound[0])); return r; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };

const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micasurvivor-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [process.env.MSURV_MP_PATH ? path.resolve(process.env.MSURV_MP_PATH) : path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);

let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.3.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const call = async (action, body, token) => (await raw(action, body, token)).body;
const tokens = {};
const reg = async (name) => { const r = await call('register', { username: name, password: 'micasurvivor-pass-1' }); tokens[name] = r.token; return r.token; };
const SAVE = (extra = {}) => ({ v: 3, name: 'x', created: 1, updated: Date.now(), coins: 500, owned: { 25: { at: 1, from: 'starter' } }, shiny: {}, partner: 25, stats: { runs: 1, bestTime: 61 }, ...extra });

try {
	for (const n of ['alice', 'bob', 'carl', 'dora']) await reg(n);
	A(Object.keys(tokens).every(n => tokens[n]), 'test accounts register');

	// ===== 1. the cloud save =====
	const anon = await raw('micasurvivor-save-get', {});
	A(anon.status === 401, 'save-get without a login is refused (401)', JSON.stringify(anon));
	const anonPut = await raw('micasurvivor-save-put', { save: SAVE(), rev: 0 });
	A(anonPut.status === 401 && !row('micasurvivor:undefined') && !row('micasurvivor:'), 'save-put without a login is refused and writes nothing');
	const g0 = await raw('micasurvivor-save-get', {}, tokens.alice);
	A(g0.status === 200 && g0.body.rev === 0 && g0.body.save === null, 'a new player reads {rev:0, save:null}', JSON.stringify(g0.body));

	let w0 = writes.length;
	const p1 = await raw('micasurvivor-save-put', { save: SAVE({ coins: 600 }), rev: 0, username: 'bob' }, tokens.alice);
	A(p1.status === 200 && p1.body.ok && p1.body.rev === 1, 'the first put (rev 0) lands as rev 1', JSON.stringify(p1));
	const r1 = row('micasurvivor:alice');
	A(r1 && r1.rev === 1 && r1.save.coins === 600 && r1.save.partner === 25 && typeof r1.updated_at === 'number', 'row micasurvivor:alice = {rev, save, updated_at}', JSON.stringify(r1).slice(0, 160));
	A(!row('micasurvivor:bob'), "a body 'username' is ignored: nothing written for bob");
	const wrote = writes.slice(w0).filter(k => !k.startsWith('rl:') && !k.startsWith('gc:') && !k.startsWith('presence:'));
	A(wrote.length === 1 && wrote[0] === 'micasurvivor:alice', 'the put writes exactly one row: micasurvivor:alice', wrote.join(','));

	const stale = await raw('micasurvivor-save-put', { save: SAVE({ coins: 1 }), rev: 0 }, tokens.alice);
	A(stale.status === 409 && stale.body.error === 'stale' && stale.body.rev === 1 && stale.body.save && stale.body.save.coins === 600,
		'a stale rev gets 409 + the stored rev and save (the client merges)', JSON.stringify(stale.body).slice(0, 160));
	A(row('micasurvivor:alice').save.coins === 600, '...and the stored save is untouched');
	const ahead = await raw('micasurvivor-save-put', { save: SAVE({ coins: 2 }), rev: 7 }, tokens.alice);
	A(ahead.status === 409 && ahead.body.rev === 1 && row('micasurvivor:alice').save.coins === 600, 'a rev from the future is refused too (409)');
	const p2 = await raw('micasurvivor-save-put', { save: SAVE({ coins: 700 }), rev: 1 }, tokens.alice);
	A(p2.status === 200 && p2.body.rev === 2 && row('micasurvivor:alice').save.coins === 700, 'the current rev writes (rev 2)');
	const g1 = await call('micasurvivor-save-get', {}, tokens.alice);
	A(g1.rev === 2 && g1.save.coins === 700, 'save-get returns the latest rev + save');
	const gb = await call('micasurvivor-save-get', { username: 'alice' }, tokens.bob);
	A(gb.rev === 0 && gb.save === null, "bob reads his OWN (empty) save, never alice's");

	// two devices racing on the same rev: exactly one lands, the other is told to merge
	const race = await Promise.all([
		raw('micasurvivor-save-put', { save: SAVE({ coins: 801 }), rev: 2 }, tokens.alice),
		raw('micasurvivor-save-put', { save: SAVE({ coins: 802 }), rev: 2 }, tokens.alice),
	]);
	const won = race.filter(r => r.status === 200), lost = race.filter(r => r.status === 409);
	A(won.length === 1 && lost.length === 1 && won[0].body.rev === 3 && lost[0].body.rev === 3, 'two puts on one rev: one lands (rev 3), the other gets 409', race.map(r => r.status).join(','));
	A([801, 802].includes(row('micasurvivor:alice').save.coins) && row('micasurvivor:alice').rev === 3, '...and the row holds the winner');

	// shape + caps
	for (const [label, save] of [['no save', undefined], ['an array', []], ['a string', 'x'], ['no version', { owned: {} }], ['owned as a list', { v: 3, owned: [] }]]) {
		const r = await raw('micasurvivor-save-put', { save, rev: 3 }, tokens.alice);
		A(r.status === 400 && row('micasurvivor:alice').rev === 3, `refused (400): ${label}`, JSON.stringify(r));
	}
	for (const rev of [-1, 1.5, '3', null]) {
		const r = await raw('micasurvivor-save-put', { save: SAVE(), rev }, tokens.alice);
		A(r.status === 400 && r.body.error === 'bad rev', `refused (400): rev ${JSON.stringify(rev)}`, JSON.stringify(r));
	}
	const big = await raw('micasurvivor-save-put', { save: SAVE({ pad: 'x'.repeat(400_001) }), rev: 3 }, tokens.alice);
	A(big.status === 413 && big.body.max === 400_000 && row('micasurvivor:alice').rev === 3, 'a save over 400 KB is refused (413)', JSON.stringify(big.body));

	// rate limit (30 puts / minute / player)
	let limited = null;
	for (let i = 0; i < 40 && !limited; i++) {
		const r = await raw('micasurvivor-save-put', { save: SAVE({ coins: 900 + i }), rev: 0 }, tokens.dora);
		if (r.status === 429) limited = i;
	}
	A(limited != null && limited >= 25 && limited <= 31, 'save-put is rate-limited (~30 a minute per player)', String(limited));

	// ===== 2. the leaderboard =====
	const score = (tok, b) => raw('run-score', { mode: 'micasurvivor', ...b }, tok);
	const s1 = await score(tokens.alice, { time: 300, kills: 900, level: 22, dex: 25, shiny: true });
	A(s1.status === 200 && s1.body.ok && s1.body.better && s1.body.rank === 1 && s1.body.best.time === 300 && s1.body.best.shiny === true, 'a first score lands at #1', JSON.stringify(s1.body));
	const s2 = await score(tokens.alice, { time: 200, kills: 5000, level: 30, dex: 4 });
	A(s2.body.ok && !s2.body.better && s2.body.best.time === 300, 'a shorter run does not replace your best (more kills or not)');
	await score(tokens.bob, { time: 300, kills: 1200, level: 20, dex: 7, shiny: 'yes' });
	await score(tokens.carl, { time: 450, kills: 10, level: 9, dex: 1 });
	const bd = row('runboard:micasurvivor');
	A(bd && bd.map(e => e.name).join(',') === 'carl,bob,alice', 'the board ranks by time, then kills (bob beats alice on a tie)', JSON.stringify(bd && bd.map(e => [e.name, e.time, e.kills])));
	A(bd.find(e => e.name === 'bob').shiny === false, "a non-boolean 'shiny' is stored as false");
	const lb = await call('run-leaderboard', { mode: 'micasurvivor' }, tokens.alice);
	A(lb.top && lb.top.length === 3 && lb.top[0].name === 'carl' && lb.you && lb.you.rank === 3 && lb.you.time === 300, 'run-leaderboard: the top + your rank', JSON.stringify(lb).slice(0, 200));
	for (const [label, b] of [['a string time', { time: '300' }], ['a negative time', { time: -5 }], ['over 4 hours', { time: 4 * 3600 + 1 }], ['no time', {}], ['NaN-ish', { time: null }]]) {
		const r = await score(tokens.dora, { kills: 1, level: 1, dex: 25, ...b });
		A(r.status === 400 && r.body.error === 'bad time', `run-score refuses ${label} (400)`, JSON.stringify(r));
	}
	A(!row('runboard:micasurvivor').some(e => e.name === 'dora'), '...and nothing lands on the board');
	const capped = await score(tokens.dora, { time: 4 * 3600, kills: 1e12, level: 1e9, dex: 99999 });
	A(capped.body.ok && capped.body.best.kills === 10_000_000 && capped.body.best.level === 9999 && capped.body.best.dex === 0, 'kills / level / dex are clamped to sane bounds', JSON.stringify(capped.body.best));
	A((await raw('run-score', { mode: 'micasurvivor', time: 10 })).status === 401, 'run-score needs a login');
	const wl = await call('run-score', { mode: 'duels', wins: 7, losses: 2, hero: 'Jaina' }, tokens.alice);
	A(wl.ok && wl.best.wins === 7, 'the W/L boards still work');
	const mc = await call('run-score', { mode: 'micatro', score: 12345, ante: 4 }, tokens.alice);
	A(mc.ok && mc.best.score === 12345, 'the micatro board still works');
	A(row('alice').runBest.micasurvivor.time === 300 && row('alice').runBest.micatro.score === 12345, "each mode's best sits on the user record");

	// ===== 3. wiring =====
	const mp = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	A(/'micasurvivor-save-put': \[30, 60_000\], 'micasurvivor-save-get': \[30, 60_000\]/.test(mp), 'rate limits are registered for both save actions');
	const gc = mp.slice(mp.indexOf('const GC_TABLE'), mp.indexOf('];', mp.indexOf('const GC_TABLE')));
	A(gc.length > 100 && !/micasurvivor/.test(gc), 'micasurvivor:<user> is durable (not in the GC table)');

	const acc = fs.readFileSync(path.join(ROOT, 'micasurvivor/js/mica/account.js'), 'utf8');
	A(/call\('micasurvivor-save-get'\)/.test(acc) && /call\('micasurvivor-save-put', \{ save, rev \}/.test(acc) && /mode: 'micasurvivor'/.test(acc), 'the client calls the save actions + the micasurvivor board');
	A(/magepunk_mp_token_v1/.test(acc) && /magepunk_mp_state_v1/.test(acc), "the client reads the site's Magepunk login");

	const arc = fs.readFileSync(path.join(ROOT, 'overworld/arcade.js'), 'utf8');
	const m = arc.match(/MAP_PEWTER_CITY_MUSEUM_1F: \{ kind: 'micasurvivor', tx: (\d+), ty: (\d+) \}/);
	A(!!m, 'the Pewter Museum 1F has a micasurvivor arcade box');
	A(/micasurvivor: \{ img: 'micasurvivorbox', src: 'fx\/micasurvivorbox\.png', w: 20 \}/.test(arc), 'the box draws its own cabinet sprite');
	const png = fs.readFileSync(path.join(ROOT, 'overworld/fx/micasurvivorbox.png'));
	A(png.readUInt32BE(16) === 20 && png.readUInt32BE(20) === 32, 'fx/micasurvivorbox.png is 20x32 (git-tracked)');
	const inp = fs.readFileSync(path.join(ROOT, 'overworld/ow_input.js'), 'utf8');
	const ib = inp.slice(inp.indexOf("arc === 'micasurvivor'"), inp.indexOf("arc === 'micasurvivor'") + 300);
	A(/MICASURVIVOR cabinet/.test(ib) && /saveParty\(S\.party\); savePos\(\); location\.href = '\/micasurvivor\/\?direct=1'/.test(ib), 'interacting saves party + position, then launches /micasurvivor/?direct=1');
	const mapF = path.join(ROOT, 'overworld/data/maps/PewterCity_Museum_1F_map.json');
	if (m && fs.existsSync(mapF)) {
		const tx = +m[1], ty = +m[2];
		const map = JSON.parse(fs.readFileSync(mapF, 'utf8'));
		const lay = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/layouts', map.layout + '.json'), 'utf8'));
		const coll = (x, y) => (lay.map[y][x] & 0x0C00) !== 0;
		const used = [...map.object_events, ...map.warp_events, ...map.bg_events, ...(map.coord_events || [])];
		const on = (x, y) => used.some(e => e.x === x && e.y === y);
		A(map.id === 'MAP_PEWTER_CITY_MUSEUM_1F', 'the box map id is the real Pewter Museum 1F');
		A(!coll(tx, ty) && !on(tx, ty), 'the cabinet base is open floor (no NPC/warp/sign/trigger)');
		A(coll(tx, ty - 1), 'its top half stands on an already-solid tile');
		A((lay.map[ty][tx] & 0x3ff) === (lay.map[ty][tx - 1] & 0x3ff), 'it stands on plain floor (the same metatile as the play tile — not on a decoration like the potted plant at (16,8))', `${lay.map[ty][tx] & 0x3ff} vs ${lay.map[ty][tx - 1] & 0x3ff}`);
		A(!coll(tx - 1, ty) && !on(tx - 1, ty), 'the play tile beside it (facing right) is walkable and free');
		// the lobby path, door -> receptionist triggers, stays connected without the cabinet tile
		const doors = map.warp_events.filter(w => w.dest_map === 'MAP_PEWTER_CITY' && w.x <= 15).map(w => [w.x, w.y]);
		const seen = new Set(), q = [...doors];
		doors.forEach(([x, y]) => seen.add(x + ',' + y));
		while (q.length) {
			const [x, y] = q.shift();
			for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
				const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
				if (seen.has(k) || ny < 0 || nx < 0 || ny >= lay.map.length || nx >= lay.map[0].length || coll(nx, ny) || (nx === tx && ny === ty)) continue;
				seen.add(k); q.push([nx, ny]);
			}
		}
		A((map.coord_events || []).every(e => seen.has(e.x + ',' + e.y)), 'from the front doors every admission trigger is still reachable');
		A(map.object_events.every(o => Math.abs(o.x - tx) + Math.abs(o.y - ty) > 1), 'no NPC stands next to the cabinet');
	} else console.log('skip - overworld/data not present: Pewter Museum tile checks');

	const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
	const tile = (idx.match(/<a class="tile" href="micasurvivor\/">[^]*?<\/a>/) || [''])[0];
	A(/MicaSurvivor <span class="arrow">→<\/span>/.test(tile), 'the landing page has a MicaSurvivor tile');
	A(/Based on PokéSurvivor by JPTER78/.test(tile), "the tile carries the 'Based on PokéSurvivor by JPTER78' credit");
	A(/<img src="micasurvivor\/icons\/tile\.png" alt="" width="46" height="46"/.test(tile), 'the tile shows its art (git-tracked micasurvivor/icons/tile.png)');
	const tpng = fs.readFileSync(path.join(ROOT, 'micasurvivor/icons/tile.png'));
	A(tpng.readUInt32BE(16) === 96 && tpng.readUInt32BE(20) === 96 && tpng.length < 20_000, 'tile.png is 96x96 and small', String(tpng.length));
	A(idx.indexOf('href="micasurvivor/"') > idx.indexOf('href="micatro/"'), 'the tile sits next to Micatro');
	A(/michaelgibalerio\.com\/micasurvivor\//.test(fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8')), 'the sitemap lists /micasurvivor/');

	// ===== 4. DLC D0b: the Expedition save, boards, lobby version and replay meta =====
	// (each part on its own: against main's handler, MSURV_MP_PATH, every part fails rather than the first one stopping the rest)
	const part = async (name, fn) => { try { await fn(); } catch (e) { fail++; console.log('FAIL: Expedition ' + name + ' threw ' + (e && e.message || e)); } };
	await part('save', async () => {
	const XS = (extra = {}) => ({ v: 1, counters: { runs: 1, 'best.time.viridian.normal': 90 }, sets: { league: ['1', '4'] }, ...extra });
	const xput = (tok, b) => raw('micasurvivor-exp-save-put', b, tok);
	const baseRow = JSON.stringify(row('micasurvivor:alice'));
	A((await raw('micasurvivor-exp-save-get', {})).status === 401, 'Expedition: save-get without a login is refused (401)');
	const xa = await xput(undefined, { save: XS(), rev: 0 });
	A(xa.status === 401 && !row('micasurvivorexp:undefined') && !row('micasurvivorexp:'), 'Expedition: save-put without a login is refused and writes nothing', JSON.stringify(xa));
	const xg0 = await raw('micasurvivor-exp-save-get', {}, tokens.alice);
	A(xg0.status === 200 && xg0.body.rev === 0 && xg0.body.save === null, 'Expedition: a new player reads {rev:0, save:null}', JSON.stringify(xg0.body));
	w0 = writes.length;
	const xp1 = await xput(tokens.alice, { save: XS(), rev: 0, username: 'bob' });
	A(xp1.status === 200 && xp1.body.ok && xp1.body.rev === 1 && xp1.body.save && xp1.body.save.counters.runs === 1, 'Expedition: the first put (rev 0) lands as rev 1 and returns the stored save', JSON.stringify(xp1));
	const xw = writes.slice(w0).filter(k => !k.startsWith('rl:') && !k.startsWith('gc:') && !k.startsWith('presence:'));
	A(xw.length === 1 && xw[0] === 'micasurvivorexp:alice', 'Expedition: the put writes exactly one row, micasurvivorexp:alice', xw.join(','));
	const xr1 = row('micasurvivorexp:alice');
	A(xr1 && xr1.rev === 1 && typeof xr1.updated_at === 'number' && JSON.stringify(xr1.save) === JSON.stringify(XS()), 'Expedition: row micasurvivorexp:alice = {rev, save, updated_at}', JSON.stringify(xr1));
	A(!row('micasurvivorexp:bob') && JSON.stringify(row('micasurvivor:alice')) === baseRow, "Expedition: a body 'username' is ignored, and the BASE row micasurvivor:alice is untouched");
	const xst = await xput(tokens.alice, { save: XS({ counters: { runs: 99 } }), rev: 0 });
	A(xst.status === 409 && xst.body.error === 'stale' && xst.body.rev === 1 && xst.body.save && xst.body.save.counters.runs === 1 && row('micasurvivorexp:alice').save.counters.runs === 1,
		'Expedition: a stale rev gets 409 + the stored rev and save, and writes nothing', JSON.stringify(xst.body));
	A((await xput(tokens.alice, { save: XS(), rev: 5 })).status === 409 && row('micasurvivorexp:alice').rev === 1, 'Expedition: a rev from the future is refused too (409)');
	// on the current rev, a put is merged into the stored save: never backwards
	const xp2 = await xput(tokens.alice, { save: { v: 1, counters: { runs: 0, kills: 5 }, sets: { league: ['7', '1'], lab: ['hp'] } }, rev: 1 });
	const xr2 = row('micasurvivorexp:alice').save;
	A(xp2.status === 200 && xp2.body.rev === 2 && xr2.counters.runs === 1 && xr2.counters['best.time.viridian.normal'] === 90 && xr2.counters.kills === 5,
		'Expedition: a put with a LOWER counter (runs 0) keeps the stored one (max per counter); a missing one stays; a new one is added', JSON.stringify(xr2));
	A(JSON.stringify(xr2.sets.league) === '["1","4","7"]' && JSON.stringify(xr2.sets.lab) === '["hp"]', 'Expedition: sets are united (nothing dropped, no duplicates, the stored order first)', JSON.stringify(xr2.sets));
	A(JSON.stringify(xp2.body.save) === JSON.stringify(xr2), 'Expedition: the reply carries the merged save the client should adopt');
	const xp3 = await xput(tokens.alice, { save: { v: 1 }, rev: 2 });
	A(xp3.status === 200 && JSON.stringify(row('micasurvivorexp:alice').save) === JSON.stringify({ ...xr2 }), 'Expedition: an empty save on the current rev takes nothing away', JSON.stringify(row('micasurvivorexp:alice').save));
	const xrace = await Promise.all([
		xput(tokens.alice, { save: { v: 1, counters: { a: 1 } }, rev: 3 }),
		xput(tokens.alice, { save: { v: 1, counters: { b: 2 } }, rev: 3 }),
	]);
	const xwon = xrace.filter(r => r.status === 200), xlost = xrace.filter(r => r.status === 409);
	A(xwon.length === 1 && xlost.length === 1 && xlost[0].body.rev === 4, 'Expedition: two puts on one rev: one lands (rev 4), the other gets 409', xrace.map(r => r.status).join(','));
	const loserSave = xlost[0] === xrace[0] ? { v: 1, counters: { a: 1 } } : { v: 1, counters: { b: 2 } };
	const xretry = await xput(tokens.alice, { save: loserSave, rev: 4 });
	const xr5 = row('micasurvivorexp:alice').save;
	A(xretry.status === 200 && xr5.counters.a === 1 && xr5.counters.b === 2 && xr5.counters.runs === 1 && xr5.counters.kills === 5, "Expedition: the loser's retry on the new rev keeps both devices' progress", JSON.stringify(xr5.counters));
	const xg1 = await call('micasurvivor-exp-save-get', {}, tokens.alice);
	A(xg1.rev === 5 && xg1.save.counters.a === 1, 'Expedition: save-get returns the latest rev + save');
	A((await call('micasurvivor-exp-save-get', {}, tokens.bob)).save === null, "Expedition: bob reads his OWN (empty) Expedition save, never alice's");
	// the shape, refused field by field (and nothing written)
	const badSaves = [['no save', undefined], ['an array', []], ['a string', 'x'], ['no version', { counters: {} }], ['a string version', { v: '1' }],
		['an unknown field (coins: Pokémonedas stay in the base save)', { v: 1, coins: 5 }], ['counters as a list', { v: 1, counters: [1] }],
		['a negative counter', { v: 1, counters: { runs: -1 } }], ['a fractional counter', { v: 1, counters: { runs: 1.5 } }], ['a string counter', { v: 1, counters: { runs: '3' } }],
		['an upper-case counter name', { v: 1, counters: { Runs: 1 } }], ['a counter past 1e15', { v: 1, counters: { runs: 2e15 } }],
		['a set that is not a list', { v: 1, sets: { league: 'x' } }], ['a set id with a space', { v: 1, sets: { league: ['a b'] } }], ['an object in a set', { v: 1, sets: { league: [{}] } }],
		['2001 counters', { v: 1, counters: Object.fromEntries(Array.from({ length: 2001 }, (_, i) => ['c' + i, 1])) }],
		['a set of 5001', { v: 1, sets: { league: Array.from({ length: 5001 }, (_, i) => 'x' + i) } }]];
	for (const [label, save] of badSaves) {
		const r = await xput(tokens.alice, { save, rev: 5 });
		A(r.status === 400 && row('micasurvivorexp:alice').rev === 5, `Expedition: refused (400): ${label}`, JSON.stringify(r).slice(0, 160));
	}
	for (const rev of [-1, 1.5, '5', null]) {
		const r = await xput(tokens.alice, { save: XS(), rev });
		A(r.status === 400 && r.body.error === 'bad rev', `Expedition: refused (400): rev ${JSON.stringify(rev)}`, JSON.stringify(r));
	}
	const xbig = await xput(tokens.alice, { save: { v: 1, sets: Object.fromEntries(Array.from({ length: 5 }, (_, k) => ['s' + k, Array.from({ length: 1000 }, (_, i) => 'x'.repeat(58) + String(i).padStart(4, '0'))])) }, rev: 5 });
	A(xbig.status === 413 && xbig.body.max === 200_000 && row('micasurvivorexp:alice').rev === 5, 'Expedition: a save over 200 KB is refused (413)', JSON.stringify(xbig.body));
	A(/'micasurvivor-exp-save-put': \[30, 60_000\], 'micasurvivor-exp-save-get': \[30, 60_000\]/.test(mp), 'Expedition: rate limits are registered for both save actions');
	A(!/micasurvivorexp/.test(gc), 'Expedition: micasurvivorexp:<user> is durable (not in the GC table)');
	});

	// the boards: one per map + difficulty, never the base board
	await part('boards', async () => {
	const xscore = (tok, b) => raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 1, map: 'viridian', diff: 'normal', ...b }, tok);
	const baseBoard = JSON.stringify(row('runboard:micasurvivor')), aliceBase = JSON.stringify(row('alice').runBest.micasurvivor);
	for (const f of [{ expMode: 'exp-classic' }, { dv: 1 }, { map: 'viridian' }, { diff: 'normal' }, { expMode: 'exp-classic', dv: 1, map: 'viridian', diff: 'normal' }]) {
		const r = await raw('run-score', { mode: 'micasurvivor', time: 9999 % 3600, kills: 1, level: 1, dex: 25, ...f }, tokens.dora);
		A(r.status === 400 && /micasurvivor_expedition/.test(r.body.error), `the base board refuses an Expedition score (${Object.keys(f).join(', ')}) (400)`, JSON.stringify(r));
	}
	A(JSON.stringify(row('runboard:micasurvivor')) === baseBoard, '...and the base board stays pure');
	const xs1 = await xscore(tokens.alice, { score: 500, time: 400, kills: 90, level: 12, dex: 25 });
	A(xs1.status === 200 && xs1.body.ok && xs1.body.better && xs1.body.rank === 1 && xs1.body.board === 'micasurvivor_expedition:viridian:normal', 'Expedition board: a first score lands at #1 on micasurvivor_expedition:viridian:normal', JSON.stringify(xs1.body));
	const xb = row('runboard:micasurvivor_expedition:viridian:normal');
	A(xb && xb.length === 1 && xb[0].name === 'alice' && xb[0].score === 500 && xb[0].expMode === 'exp-classic' && xb[0].dv === 1, 'Expedition board: the row runboard:micasurvivor_expedition:viridian:normal holds it (with its mode and dv)', JSON.stringify(xb));
	await xscore(tokens.bob, { score: 500, time: 450, kills: 1, level: 3, dex: 4 });
	await xscore(tokens.carl, { score: 300, time: 900, kills: 1, level: 3, dex: 1 });
	A(row('runboard:micasurvivor_expedition:viridian:normal').map(e => e.name).join(',') === 'bob,alice,carl', 'Expedition board: ranked by score, then time (bob beats alice on a tie)');
	await xscore(tokens.alice, { score: 10, time: 10, map: 'mtmoon', diff: 'hard' });
	A(row('runboard:micasurvivor_expedition:mtmoon:hard').length === 1 && !row('runboard:micasurvivor_expedition:mtmoon:normal') && !row('runboard:micasurvivor_expedition'),
		'Expedition board: another map / difficulty is its own board (no catch-all board)');
	A(row('alice').runBest['micasurvivor_expedition:viridian:normal'].score === 500 && row('alice').runBest['micasurvivor_expedition:mtmoon:hard'].score === 10, 'Expedition board: your best per map + difficulty on your record');
	A(JSON.stringify(row('runboard:micasurvivor')) === baseBoard && JSON.stringify(row('alice').runBest.micasurvivor) === aliceBase, 'Expedition board: the BASE board and your base best are untouched');
	const xbad = [['no map', { map: undefined }], ['an unknown map', { map: 'atlantis' }], ['no difficulty', { diff: undefined }], ['an unknown difficulty', { diff: 'easy' }],
		['no mode', { expMode: undefined }], ['a base mode', { expMode: 'normal' }], ['no dv', { dv: undefined }], ['dv 0', { dv: 0 }], ['a string dv', { dv: '1' }],
		['a string time', { time: '30', score: 1 }], ['no score', { score: undefined, time: 30 }], ['over 4 hours', { time: 4 * 3600 + 1, score: 1 }]];
	await reg('xena');   // (a fresh account: dora's run-score allowance is spent above)
	for (const [label, b] of xbad) {
		const r = await xscore(tokens.xena, { score: 1, time: 30, ...b });
		A(r.status === 400, `Expedition board refuses ${label} (400)`, JSON.stringify(r));
	}
	A(!row('runboard:micasurvivor_expedition:viridian:normal').some(e => e.name === 'xena') && !row('runboard:micasurvivor_expedition:atlantis:normal'), '...and nothing lands on any board');
	const xlb = await call('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'viridian', diff: 'normal' }, tokens.alice);
	A(xlb.top && xlb.top.length === 3 && xlb.top[0].name === 'bob' && xlb.you && xlb.you.rank === 2 && xlb.you.score === 500, 'Expedition run-leaderboard: the top + your rank for that map + difficulty', JSON.stringify(xlb).slice(0, 200));
	A((await raw('run-leaderboard', { mode: 'micasurvivor_expedition' }, tokens.alice)).status === 400, 'Expedition run-leaderboard needs its map and difficulty (400)');
	A((await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 1, map: 'viridian', diff: 'normal', score: 1, time: 1 })).status === 401, 'an Expedition score needs a login');

	});

	// the co-op lobby: mode + dv on an Expedition lobby; the version gate on joining
	await part('lobby', async () => {
	await call('add-friend', { username: 'carl' }, tokens.bob);
	await call('add-friend', { username: 'carl' }, tokens.dora);
	const lbBase = await raw('msurv-lobby-create', { dex: 25 }, tokens.carl);
	const baseId = lbBase.body.lobby.id;
	A(lbBase.status === 200 && !('dv' in lbBase.body.lobby) && !('mode' in lbBase.body.lobby) && !('dv' in row('msurvlobby:' + baseId)) && !('mode' in row('msurvlobby:' + baseId)), 'lobby: a base lobby has no mode / dv (row and view unchanged)', JSON.stringify(lbBase.body));
	const jb = await raw('msurv-lobby-join', { id: baseId, dex: 4, dv: 7 }, tokens.bob);
	A(jb.status === 200 && jb.body.lobby.members.length === 2, 'lobby: any client joins a base lobby (its dv is ignored)', JSON.stringify(jb.body).slice(0, 120));
	await raw('msurv-lobby-leave', { id: baseId }, tokens.carl);
	for (const [label, b] of [['a mode without dv', { mode: 'exp-classic' }], ['a dv without mode', { dv: 1 }], ['dv 0', { mode: 'exp-classic', dv: 0 }], ['a base mode', { mode: 'normal', dv: 1 }], ['a string dv', { mode: 'exp-classic', dv: '1' }]]) {
		const r = await raw('msurv-lobby-create', { dex: 25, ...b }, tokens.carl);
		A(r.status === 400, `lobby: refused (400): ${label}`, JSON.stringify(r));
	}
	const lbx = await raw('msurv-lobby-create', { dex: 25, mode: 'exp-classic', dv: 1 }, tokens.carl);
	const xid = lbx.body.lobby && lbx.body.lobby.id;
	A(lbx.status === 200 && lbx.body.lobby.mode === 'exp-classic' && lbx.body.lobby.dv === 1 && row('msurvlobby:' + xid).dv === 1 && row('msurvlobby:' + xid).mode === 'exp-classic', 'lobby: an Expedition lobby stores and shows its mode + dv', JSON.stringify(lbx.body));
	for (const [label, dv] of [['a newer dv', 2], ['no dv (an old client)', undefined], ['a string dv', '1']]) {
		const wl0 = writes.filter(k => k.startsWith('msurv')).length;
		const r = await raw('msurv-lobby-join', { id: xid, dex: 4, ...(dv !== undefined ? { dv } : {}) }, tokens.bob);
		A(r.status === 409 && r.body.error === 'your game is out of date: reload' && r.body.dv === 1 && writes.filter(k => k.startsWith('msurv')).length === wl0 && row('msurvlobby:' + xid).members.length === 1,
			`lobby: joining an Expedition lobby with ${label} is refused: "your game is out of date: reload" (409), nothing written`, JSON.stringify(r));
	}
	const jx = await raw('msurv-lobby-join', { id: xid, dex: 4, dv: 1 }, tokens.bob);
	A(jx.status === 200 && jx.body.lobby.members.length === 2 && jx.body.lobby.dv === 1, 'lobby: the same dv joins', JSON.stringify(jx.body).slice(0, 160));
	await raw('msurv-lobby-update', { id: xid, ready: true }, tokens.bob);
	const sx = await raw('msurv-lobby-update', { id: xid, start: { seed: 1234 } }, tokens.carl);
	A(sx.status === 200 && sx.body.lobby.start && sx.body.lobby.start.mode === 'exp-classic' && sx.body.lobby.start.dv === 1 && sx.body.lobby.start.seed === 1234, "lobby: the start carries the lobby's mode + dv", JSON.stringify(sx.body.lobby && sx.body.lobby.start));
	await raw('msurv-lobby-leave', { id: xid }, tokens.carl);

	});

	// the replay meta allow-list and the live beacon take an Expedition run's mode + dv
	await part('replay meta', async () => {
	const packR = o => 'R1.' + Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
	const rp = await raw('micasurvivor-replay-put', { code: packR({ v: 1, h: { m: 'exp-classic', dv: 1 }, f: [[0]] }), meta: { mode: 'exp-classic', dv: 1, map: 'viridian', diff: 'normal', time: 30 } }, tokens.carl);
	const rpm = rp.body.id && row('msurvreplay:' + rp.body.id).meta;
	A(rp.status === 200 && rpm && rpm.mode === 'exp-classic' && rpm.dv === 1 && rpm.map === 'viridian' && rpm.diff === 'normal', 'replay meta: an Expedition replay keeps its mode, dv, map and difficulty', JSON.stringify(rpm));
	const rb = await raw('micasurvivor-replay-put', { code: packR({ v: 1, h: { m: 'normal' }, f: [[0]] }), meta: { mode: 'normal', dv: 'x', map: 'viridian' } }, tokens.carl);
	const rbm = rb.body.id && row('msurvreplay:' + rb.body.id).meta;
	A(rb.status === 200 && rbm && rbm.mode === 'normal' && !('dv' in rbm) && !('map' in rbm), 'replay meta: a base replay (or a bad dv) has no dv / map', JSON.stringify(rbm));
	const pub = await raw('publish-micasurvivor', { run: 'abcdef12', label: 'Pikachu', mode: 'exp-classic', dex: 25 }, tokens.carl);
	A(pub.status === 200 && row('msurvlive:carl') && row('msurvlive:carl').mode === 'exp-classic', "live beacon: an Expedition run's mode is kept (not turned into 'normal')", JSON.stringify(row('msurvlive:carl')));
	const pubBad = await raw('publish-micasurvivor', { run: 'abcdef13', label: 'Pikachu', mode: 'exp-<b>', dex: 25 }, tokens.carl);
	A(pubBad.status === 200 && row('msurvlive:carl').mode === 'normal', "live beacon: a bad mode still becomes 'normal'");
	});
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
