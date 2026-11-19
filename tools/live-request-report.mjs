// live-request-report.mjs — how many server requests the site's live features make (owner's list 5, item 10,
// 2026-11-19: the Cloudflare plan bills requests). It REPORTS; it changes nothing.
//
// The real server (server/mp.mjs, bundled like the tests do, over node:sqlite in memory) behind a static server, and
// headless Chrome pages playing the situations that matter, one situation at a time. Every page is a real signed-in
// account of its own, so each /api/mp call is put down to the situation and the role that made it (by its token). Each
// situation boots, settles, then is COUNTED for a window (default 60 s), by action, as calls per minute. What the pages
// did while loading is shown apart ("on load"), since it is paid once per visit, not per minute.
//
// Situations (role in brackets):
//   ow-idle-alone        an overworld player standing still, no friend online            [player]
//   ow-walk-alone        ...walking back and forth                                         [player]
//   ow-idle-friend-away  idle, a friend online in the overworld on another map             [player] [friend]
//   ow-idle-friend-here  idle, a friend online on the same map (ghosts walk live)          [player] [friend]
//   ow-walk-followed     walking, a friend following live (/overworld/?follow=)            [player] [follower]
//   ow-battle-unwatched  a long wild battle, a move every 5 s                              [player]
//   ow-battle-watched    ...a friend watching it (/overworld/?watchfactory=)               [player] [spectator]
//   pocket-unwatched     a Pocket Enhanced match vs the computer, published                [player]
//   pocket-watched       ...a friend spectating (/pocketenhanced/?spectate=)               [player] [spectator]
//   micatro-unwatched    a Micatro run, an action every 5 s                                [player]
//   micatro-watched      ...a friend spectating (/micatro/?spectate=)                      [player] [spectator]
//   watch-hub            the Live now hub (battlecards/start.html) with a friend live      [hub]
//
//   node tools/live-request-report.mjs [--seconds=60] [--only=ow-idle-alone,pocket-watched] [--json=<file>] [--quiet] [--no-file]
// Locally it also writes Desktop/playtest-reports/live-requests-<date>.md; in CI (CI set) stdout only.
// Needs Chrome (CHROME, or the usual paths) and overworld/data; the Micatro and Pocket situations need their assets
// (node tools/cloud/fetch-assets.mjs). The test overworld/tests/live_request_report_test.mjs runs a 30 s slice.
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// a git worktree's gitignored asset folders may live in the main checkout only
const MAIN_ROOT = path.basename(path.dirname(ROOT)) === '.worktrees' ? path.resolve(ROOT, '../..') : null;
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : (process.argv.includes('--' + k) ? true : d); };
const SECONDS = Math.max(5, +arg('seconds', 60) || 60);
const ONLY = arg('only', null) ? String(arg('only')).split(',').map((s) => s.trim()).filter(Boolean) : null;
const JSON_OUT = arg('json', null);
const QUIET = !!arg('quiet', false);
const NO_FILE = !!arg('no-file', false);   // (the test: stdout / --json only)
const SETTLE_MS = 6000;   // after a situation is up, before counting starts (the first heartbeat / subscribe land here)
const log = (...a) => { if (!QUIET) console.error(...a); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(200); } return false; }

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql), bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return st.get(...bound) ?? null; }, async run() { return st.run(...bound); }, async all() { return { results: st.all(...bound) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-livereq-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
process.env.MP_GC_RATE = '0';   // (the occasional sweep is not a live feature)
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, ...(await res.json()) };
};

// ---------- the static server, counting /api/mp by account ----------
const byToken = new Map();   // token -> username
const hits = [];             // { user, action, at }
const ipOf = (user) => { let h = 7; for (const c of String(user)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return '10.20.' + (1 + (h >> 8) % 250) + '.' + (1 + h % 250); };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
		const user = byToken.get(tok) || (tok ? 'unknown' : 'guest');
		let action = '?'; try { action = String(JSON.parse(raw).action || '?'); } catch { /* counted as '?' */ }
		hits.push({ user, action, at: Date.now() });
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ipOf(user), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	fs.readFile(path.join(ROOT, f), (e, d) => (e && MAIN_ROOT ? fs.readFile(path.join(MAIN_ROOT, f), send) : send(e, d)));
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

// ---------- accounts ----------
let acct = 0;
async function account(tag) {
	const username = ('lr' + (++acct) + '_' + tag).slice(0, 20);
	const r = await call('register', { username, password: 'live-report-pass' });
	if (!r.token) throw new Error('register ' + username + ': ' + JSON.stringify(r));
	byToken.set(r.token, username);
	return { username, token: r.token };
}
async function befriend(a, b) { await call('add-friend', { username: a.username }, b.token); await call('add-friend', { username: b.username }, a.token); }

// ---------- the browser ----------
const puppeteer = (await import('puppeteer-core')).default;
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const PARTY = [{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }];
const STORY = JSON.stringify({ flags: { intro_done: true, intro_started: true, intro_greeted: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} });
const OW_SAVE = { magepunk_region: 'HOENN', magepunk_story: STORY, magepunk_party_v1: JSON.stringify(PARTY), magepunk_pos_v1: JSON.stringify({ map: 'Route101', x: 10, y: 10 }), magepunk_repel_v1: '99999' };
const QUIET_LS = { micatro_sfx: '0', micatro_music: '0', micatro_speed: '2', magepunk_pocket_prefs_v1: JSON.stringify({ tutored: true }) };

let browser;
const pageErrors = [];
async function open(who, url, ls = {}) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
	page.on('pageerror', (e) => pageErrors.push(who.username + ': ' + e.message));
	const st = (await call('state', {}, who.token)).state || { username: who.username };
	await page.evaluateOnNewDocument((tok, st, ls) => {
		try {
			// the save once per context (a reload keeps what the game wrote); the account on every load
			if (!sessionStorage.getItem('lr_seeded')) { sessionStorage.setItem('lr_seeded', '1'); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); }
			localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		} catch { /* ignore */ }
	}, who.token, st, { ...QUIET_LS, ...ls });
	await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
	return { ctx, page, who };
}
const owUp = (p) => waitFor(() => p.page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.world.current.layout)), 60000);
const clearOw = (p) => p.page.evaluate(() => { const o = window.__ow; if (!o) return; for (let i = 0; i < 30 && o.dialog.blocking; i++) o.dialog.key('x'); });

// ---------- what each page does while it is counted ----------
// (each returns a stop function; they run from setup to the end of the window)
function every(ms, fn) { let on = true; (async () => { while (on) { try { await fn(); } catch { /* the page may be busy */ } await sleep(ms); } })(); return () => { on = false; }; }
const walk = (p) => { let dir = 'ArrowRight'; return every(1300, async () => { await clearOw(p); await p.page.keyboard.down(dir); await sleep(1100); await p.page.keyboard.up(dir); dir = dir === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight'; }); };
// a long wild battle (a level-100 Blissey shrugs off Meteor Mash): a move every 5 s; a new one if it ends
const battle = (p) => every(5000, async () => {
	const active = await p.page.evaluate(() => !!(window.__ow.battle.active && window.__ow.battle.active.foe));
	if (!active) { await clearOw(p); await p.page.evaluate(() => window.__ow.startWildBattle({ id: 'blissey', level: 100 })); return; }
	await p.page.keyboard.press('z'); await sleep(250); await p.page.keyboard.press('z');
});
const pocketPlay = (p) => every(2500, () => p.page.evaluate(async () => {
	const P = window.__pocket, S = P.state();
	if (!S || S.over) { P.start({ players: 2, starter: 'charizard' }); return; }
	const seat = S.pending ? S.pending.seat : S.phase === 'setup' ? (S.players.find((x) => !x.setup) || {}).seat : S.current;
	if (seat !== 0) return;
	const { nextAction } = await import('/pocketenhanced/js/ai.js');
	const banned = new Set();
	for (let k = 0; k < 10; k++) { const a = nextAction(P.engine.view(P.state(), 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; if (await P.act(a) !== false) break; banned.add(JSON.stringify(a)); }
}));
const micatroPlay = (p) => every(5000, () => p.page.evaluate(async () => {
	const M = window.__micatro;
	if (!M.idle()) return;
	const v = M.view(), s = v && v.state;
	if (!s || s === 'GAME_OVER' || s === 'MENU') { await M.newRun({ seed: 'LIVEREQ' + Date.now() }); return; }
	if (s === 'BLIND_SELECT') { await M.selectBlind(); return; }
	if (s === 'SELECTING_HAND') {
		const R = await import('/micatro/js/engine/run.js'), G = R.G, hand = G.hand.cards, n = hand.length;
		let best = null, bestScore = -1;
		const rec = (st, pk) => { if (pk.length) { const cards = pk.map((i) => hand[i]); const info = R.pokerInfo(cards); const h = G.GAME.hands[info.text]; if (h) { let ch = h.chips; for (const c of info.scoring_hand) ch += c.get_chip_bonus(); if (ch * h.mult > bestScore) { bestScore = ch * h.mult; best = cards.map((x) => x.sort_id); } } } if (pk.length === 5) return; for (let i = st; i < n; i++) { pk.push(i); rec(i + 1, pk); pk.pop(); } };
		rec(0, []);
		M.act({ type: 'highlight', ids: best || [] }); M.act({ type: 'play' }); return;
	}
	if (s === 'ROUND_EVAL') { M.act({ type: 'cash_out' }); return; }
	if (s === 'SHOP') { M.act({ type: 'next_round' }); return; }
	M.act({ type: 'skip_booster' });
}));

// ---------- the situations ----------
async function owPlayer(tag, url = '/overworld/index.html') { const who = await account(tag); const p = await open(who, url, OW_SAVE); if (!(await owUp(p))) throw new Error(tag + ': the overworld did not boot'); await sleep(1500); await clearOw(p); return p; }
const SITUATIONS = [
	{ id: 'ow-idle-alone', what: 'Overworld, idle, no friend online', async setup() { const a = await owPlayer('idle'); return { roles: { player: a }, stops: [] }; } },
	{ id: 'ow-walk-alone', what: 'Overworld, walking, no friend online', async setup() { const a = await owPlayer('walk'); return { roles: { player: a }, stops: [walk(a)] }; } },
	{ id: 'ow-idle-friend-away', what: 'Overworld, idle, a friend online on another map', async setup() {
		const a = await account('idla'), b = await account('idla_f'); await befriend(a, b);
		const pb = await open(b, '/overworld/index.html', { ...OW_SAVE, magepunk_pos_v1: JSON.stringify({ map: 'OldaleTown', x: 10, y: 12 }) }); await owUp(pb);
		const pa = await open(a, '/overworld/index.html', OW_SAVE); await owUp(pa); await sleep(1500); await clearOw(pa); await clearOw(pb);
		return { roles: { player: pa, friend: pb }, stops: [] };
	} },
	{ id: 'ow-idle-friend-here', what: 'Overworld, idle, a friend online on the same map (their ghosts walk live)', async setup() {
		const a = await account('idlf'), b = await account('idlf_f'); await befriend(a, b);
		const pb = await open(b, '/overworld/index.html', OW_SAVE); await owUp(pb);
		const pa = await open(a, '/overworld/index.html', OW_SAVE); await owUp(pa); await sleep(1500); await clearOw(pa); await clearOw(pb);
		return { roles: { player: pa, friend: pb }, stops: [] };
	} },
	{ id: 'ow-walk-followed', what: 'Overworld, walking, followed live by a friend', async setup() {
		const a = await account('fol'), b = await account('fol_v'); await befriend(a, b);
		const pa = await open(a, '/overworld/index.html', OW_SAVE); await owUp(pa); await sleep(1500); await clearOw(pa);
		const stop = walk(pa);
		const pb = await open(b, '/overworld/index.html?follow=' + a.username, OW_SAVE);
		await waitFor(() => pb.page.evaluate(() => !!(window.__owFollow && window.__owFollow.view)), 30000);
		return { roles: { player: pa, follower: pb }, stops: [stop] };
	} },
	{ id: 'ow-battle-unwatched', what: 'Overworld wild battle, a move every 5 s, nobody watching', async setup() { const a = await owPlayer('bat'); return { roles: { player: a }, stops: [battle(a)] }; } },
	{ id: 'ow-battle-watched', what: 'Overworld wild battle, a friend watching', async setup() {
		const a = await account('batw'), b = await account('batw_v'); await befriend(a, b);
		const pa = await open(a, '/overworld/index.html', OW_SAVE); await owUp(pa); await sleep(1500); await clearOw(pa);
		const stop = battle(pa);
		await waitFor(() => pa.page.evaluate(() => !!(window.__ow.battle.active && window.__ow.battle.active.foe)), 20000);
		// (the spectator's own game boots under the viewer: on ANOTHER map, or the two would walk as each other's ghosts and
		// this row would measure the same-map poll instead of the watching)
		const pb = await open(b, '/overworld/index.html?watchfactory=' + a.username + '&mp=1', { ...OW_SAVE, magepunk_pos_v1: JSON.stringify({ map: 'OldaleTown', x: 10, y: 12 }) }); await owUp(pb);
		return { roles: { player: pa, spectator: pb }, stops: [stop] };
	} },
	{ id: 'pocket-unwatched', what: 'Pocket Enhanced match vs the computer (published), nobody watching', async setup() {
		const a = await account('poc'); const pa = await open(a, '/pocketenhanced/');
		if (!(await waitFor(() => pa.page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 40000))) throw new Error('pocket did not boot');
		await pa.page.evaluate(() => window.__pocket.start({ players: 2, starter: 'charizard' }));
		return { roles: { player: pa }, stops: [pocketPlay(pa)] };
	} },
	{ id: 'pocket-watched', what: 'Pocket Enhanced match, a friend spectating', async setup() {
		const a = await account('pocw'), b = await account('pocw_v'); await befriend(a, b);
		const pa = await open(a, '/pocketenhanced/');
		if (!(await waitFor(() => pa.page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 40000))) throw new Error('pocket did not boot');
		await pa.page.evaluate(() => window.__pocket.start({ players: 2, starter: 'charizard' }));
		const stop = pocketPlay(pa);
		await sleep(3000);
		const pb = await open(b, '/pocketenhanced/?spectate=' + a.username);
		await waitFor(() => pb.page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 40000);
		return { roles: { player: pa, spectator: pb }, stops: [stop] };
	} },
	{ id: 'micatro-unwatched', what: 'Micatro run, an action every 5 s, nobody watching', async setup() {
		const a = await account('mic'); const pa = await open(a, '/micatro/');
		if (!(await waitFor(() => pa.page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000))) throw new Error('micatro did not boot');
		await pa.page.evaluate(() => window.__micatro.newRun({ seed: 'LIVEREQ1' }));
		return { roles: { player: pa }, stops: [micatroPlay(pa)] };
	} },
	{ id: 'micatro-watched', what: 'Micatro run, a friend spectating', async setup() {
		const a = await account('micw'), b = await account('micw_v'); await befriend(a, b);
		const pa = await open(a, '/micatro/');
		if (!(await waitFor(() => pa.page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000))) throw new Error('micatro did not boot');
		await pa.page.evaluate(() => window.__micatro.newRun({ seed: 'LIVEREQ2' }));
		const stop = micatroPlay(pa);
		await sleep(3000);
		const pb = await open(b, '/micatro/?spectate=' + a.username);
		await waitFor(() => pb.page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000);
		return { roles: { player: pa, spectator: pb }, stops: [stop] };
	} },
	{ id: 'watch-hub', what: 'The Live now hub (battlecards/start.html), a friend live in Micatro', async setup() {
		const a = await account('hub_p'), b = await account('hub'); await befriend(a, b);
		const pa = await open(a, '/micatro/');
		if (!(await waitFor(() => pa.page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000))) throw new Error('micatro did not boot');
		await pa.page.evaluate(() => window.__micatro.newRun({ seed: 'LIVEREQ3' }));
		const stop = micatroPlay(pa);
		const pb = await open(b, '/battlecards/start.html');
		await pb.page.waitForFunction(() => document.readyState === 'complete', { timeout: 30000 }).catch(() => {});
		// (the live friend is only the hub's subject: counted under the hub's row are the hub's own calls)
		return { roles: { hub: pb }, extra: [pa], stops: [stop] };
	} },
];

// ---------- run ----------
const rows = [];   // { situation, what, role, user, load, window: { action: n }, perMin: { action: n/min }, total }
const failed = [];
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
	for (const sit of SITUATIONS) {
		if (ONLY && !ONLY.includes(sit.id)) continue;
		log(`[${sit.id}] setting up…`);
		const t0 = Date.now();
		let s;
		try { s = await sit.setup(); } catch (e) { failed.push({ id: sit.id, why: String(e && e.message || e) }); log(`[${sit.id}] FAILED to set up: ${e && e.message}`); continue; }
		await sleep(SETTLE_MS);
		const w0 = Date.now();
		log(`[${sit.id}] counting for ${SECONDS} s…`);
		await sleep(SECONDS * 1000);
		const w1 = Date.now();
		for (const stop of s.stops) stop();
		for (const [role, p] of Object.entries(s.roles)) {
			const mine = hits.filter((h) => h.user === p.who.username);
			const load = mine.filter((h) => h.at >= t0 && h.at < w0).length;
			const win = {};
			for (const h of mine) if (h.at >= w0 && h.at < w1) win[h.action] = (win[h.action] || 0) + 1;
			const mins = (w1 - w0) / 60000;
			const perMin = Object.fromEntries(Object.entries(win).map(([k, n]) => [k, +(n / mins).toFixed(1)]));
			const total = +(Object.values(win).reduce((a, b) => a + b, 0) / mins).toFixed(1);
			rows.push({ situation: sit.id, what: sit.what, role, load, window: win, perMin, total });
		}
		for (const p of [...Object.values(s.roles), ...(s.extra || [])]) await p.ctx.close().catch(() => {});
		log(`[${sit.id}] done`);
	}
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}

// ---------- the report ----------
const actions = [...new Set(rows.flatMap((r) => Object.keys(r.perMin)))].sort((a, b) => rows.reduce((s, r) => s + (r.perMin[b] || 0), 0) - rows.reduce((s, r) => s + (r.perMin[a] || 0), 0) || a.localeCompare(b));
const grand = +rows.reduce((s, r) => s + r.total, 0).toFixed(1);
const date = new Date().toISOString().slice(0, 10);
const md = [];
md.push(`# Live requests — ${date}`, '');
md.push(`/api/mp calls per minute by situation and action: the real server over sqlite, headless Chrome, a ${SECONDS} s window per situation after it was up (${SETTLE_MS / 1000} s settle). "load" = calls while the page(s) booted, paid once per visit.`, '');
md.push('| situation | role | load | calls/min | ' + actions.join(' | ') + ' |');
md.push('|---|---|---:|---:|' + actions.map(() => '---:').join('|') + '|');
for (const r of rows) md.push(`| ${r.situation} | ${r.role} | ${r.load} | **${r.total}** | ` + actions.map((a) => (r.perMin[a] ? r.perMin[a] : '')).join(' | ') + ' |');
md.push(`| **total** | | ${rows.reduce((s, r) => s + r.load, 0)} | **${grand}** | ` + actions.map((a) => +rows.reduce((s, r) => s + (r.perMin[a] || 0), 0).toFixed(1) || '').join(' | ') + ' |', '');
md.push('Situations:', ...SITUATIONS.filter((s) => !ONLY || ONLY.includes(s.id)).map((s) => `- **${s.id}**: ${s.what}`), '');
const costs = actions.map((a) => ({ a, n: +rows.reduce((s, r) => s + (r.perMin[a] || 0), 0).toFixed(1), where: rows.filter((r) => r.perMin[a]).map((r) => r.situation + '/' + r.role) })).slice(0, 5);
md.push('Top actions (summed over the rows above):', ...costs.map((c) => `- \`${c.a}\` ${c.n}/min — ${c.where.join(', ')}`), '');
if (failed.length) md.push('Not measured:', ...failed.map((f) => `- ${f.id}: ${f.why}`), '');
if (pageErrors.length) md.push(`Page errors seen (${pageErrors.length}):`, ...[...new Set(pageErrors)].slice(0, 8).map((e) => '- ' + e.slice(0, 200)), '');
const text = md.join('\n');
console.log(text);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ seconds: SECONDS, rows, failed, grand, pageErrors }, null, 2));
if (!process.env.CI && !NO_FILE) {
	try {
		const dir = path.join(os.homedir(), 'Desktop', 'playtest-reports');
		fs.mkdirSync(dir, { recursive: true });
		const f = path.join(dir, `live-requests-${date}.md`);
		fs.writeFileSync(f, text + '\n');
		log('wrote ' + f);
	} catch (e) { log('could not write the report file: ' + e.message); }
}
process.exit(0);
