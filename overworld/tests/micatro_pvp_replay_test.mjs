// micatro_pvp_replay_test.mjs — Micatro Multiplayer (PvP) matches get REPLAYS (owner 2026-11-19: every mode of every game has
// live spectating and replays). Two real players (the real server handler over sqlite, each in their own browser context) +
// a friend who watches:
//   amy hosts (1 life, the Nemesis from ante 1), ben joins; cora watches amy. Both skip to the Nemesis, amy plays strong,
//   ben weak -> ben loses his only life -> the match is over.
//   * both keep a replay of their side (the local Replays list) with the match's meta (opponent, result, mode, ruleset), and
//     amy's is uploaded (mreplay:<id>, its meta.pvp allow-listed by the server)
//   * cora (spectating amy) gets "Watch the full run" with that id (finishPublishing(won, id))
//   * ?replay=<id> re-simulates amy's run to the SAME final state (checksum, lives, result) with the opponent on the HUD:
//     ben's name, his score in the Nemesis round as amy saw it, his final lives
//   * a rematch ben forfeits: amy's replay of it says "forfeit" and re-simulates too
//   * the Replays screen marks both as Multiplayer, with the opponent
//   * micatro-replay-put validates recipe.pvp / recipe.pvp_match (bad shapes and an oversized timeline refused)
//   node overworld/tests/micatro_pvp_replay_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

process.env.MP_GC_RATE = '0';
process.env.MTPVP_GRACE_MS = '30000';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || (fs.existsSync('/opt/chrome/chrome') ? '/opt/chrome/chrome' : 'C:/Program Files/Google/Chrome/Application/chrome.exe');
const PORT = +process.env.MTPVP_REPLAY_PORT || 9861;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-mtpvp-replay-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const r = await handler(req, { MP_DB });
	return { status: r.status, ...(await r.json()) };
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = '10.8.0.' + (req.socket.remotePort % 250 + 1);
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const tokens = {};
for (const n of ['amy', 'ben', 'cora']) tokens[n] = (await call('register', { username: n, password: 'mtpvp-replay-pass' })).token;
await call('add-friend', { username: 'amy' }, tokens.cora);
A(tokens.amy && tokens.ben && tokens.cora, 'three accounts (cora is amy\'s friend)');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

// ---- the server's check of a PvP recipe (packed raw: 'R1.' + base64url(JSON))
const packRaw = (o) => 'R1.' + Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const baseRecipe = { v: 1, seed: 'ABCD1234', back: 'b_red', stake: 1, mods: [], modOptions: {}, actions: [{ type: 'skip_blind' }], started: 1, pvp: { v: 1, lives: 2, pvpStart: 1, deathOnLoss: true, comeback: true } };
const putR = (recipe, meta = {}) => call('micatro-replay-put', { code: packRaw(recipe), meta }, tokens.amy);
const okPut = await putR({ ...baseRecipe, pvp_match: { v: 1, me: 'amy', opp: 'ben', result: 'win', tl: [{ i: 0, l: 2, loc: 'select', a: 1 }], hist: [] } }, { pvp: { opp: 'ben', result: 'win', mode: 'attrition', ruleset: 'vanilla', why: 'lives', junk: 'x<script>' } });
A(okPut.ok && okPut.id, 'micatro-replay-put accepts a PvP recipe (recipe.pvp + recipe.pvp_match)', JSON.stringify(okPut));
const okRow = okPut.id && row('mreplay:' + okPut.id);
A(okRow && okRow.meta.pvp && okRow.meta.pvp.opp === 'ben' && okRow.meta.pvp.result === 'win' && !('junk' in okRow.meta.pvp), 'its meta.pvp is allow-listed (opponent, result, mode, ruleset, why)', JSON.stringify(okRow && okRow.meta.pvp));
const bad1 = await putR({ ...baseRecipe, pvp: { ...baseRecipe.pvp, lives: 'four' } });
A(bad1.status === 400, 'a malformed recipe.pvp is refused', JSON.stringify(bad1));
const bad2 = await putR({ ...baseRecipe, pvp: [1, 2] });
A(bad2.status === 400, 'recipe.pvp that is not an object is refused');
const bad3 = await putR({ ...baseRecipe, pvp_match: { tl: Array.from({ length: 3001 }, (_, i) => ({ i, l: 1 })) } });
A(bad3.status === 400, 'an over-long opponent timeline is refused (cap 3000)', JSON.stringify(bad3).slice(0, 80));
const bad4 = await putR({ ...baseRecipe, pvp: undefined, pvp_match: { tl: [] } });
A(bad4.status === 400, 'pvp_match without a match config is refused');
const bad5 = await putR({ ...baseRecipe, pvp_match: { big: 'x'.repeat(130000) } });
A(bad5.status === 400, 'an oversized pvp_match is refused');

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url, ctx0) => {
		const ctx = ctx0 || await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1400, height: 860, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { }
		}, tokens[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors, ctx };
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 40000);
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	// (the final-state fingerprint compared between the live match and its replay)
	const view = (page) => page.evaluate(() => { const v = window.__micatro.view(); return v && { state: v.state, ante: v.ante, round: v.round, seed: v.seed, dollars: v.dollars, chips: String(v.chips), pvp: v.pvp, opp: v.pvp_opp, hands: v.hands_left, blind: v.blind && v.blind.key, onDeck: v.blind_on_deck, over: v.over, won: v.won, jokers: ((v.areas && v.areas.jokers) || []).map((c) => c.center).join(','), deck: v.deck_total }; });
	const click = (page, sel) => page.evaluate((s) => { const b = document.querySelector(s); if (!b || b.disabled) return false; b.click(); return true; }, sel);
	const act = (page, a) => page.evaluate((a) => window.__micatro.act(a), a);
	const replays = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('micatro_replays_v1') || '[]'); } catch { return []; } });

	// ---- amy hosts: 1 life, the Nemesis from ante 1
	const amy = await open('amy', '/micatro/');
	A(await ready(amy.page), 'amy: game ready');
	await waitFor(() => click(amy.page, '.b-multiplayer'), 10000);
	await click(amy.page, '.b-pvp-create');
	await waitFor(() => amy.page.evaluate(() => { const b = document.querySelector('.b-start'); return b && /Create lobby/.test(b.textContent); }), 8000);
	await click(amy.page, '.b-start');
	A(await waitFor(() => amy.page.evaluate(() => /^[A-Z2-9]{5}$/.test((document.querySelector('.pvp-code-v') || {}).textContent || '')), 10000), 'amy\'s lobby is up');
	const code = await amy.page.evaluate(() => document.querySelector('.pvp-code-v').textContent);
	const optV = (k) => amy.page.evaluate((k) => (document.querySelector('.pvp-' + k) || {}).textContent, k);
	await click(amy.page, '.b-pvp-dec-pvpStart');
	await waitFor(async () => (await optV('pvpStart')) === '1', 6000);
	for (const want of ['3', '2', '1']) { await click(amy.page, '.b-pvp-dec-lives'); await waitFor(async () => (await optV('lives')) === want, 6000); }
	A((await optV('pvpStart')) === '1' && (await optV('lives')) === '1', 'host options: 1 life, the Nemesis from ante 1');

	const ben = await open('ben', '/micatro/?join=' + code);
	A(await ready(ben.page), 'ben: game ready');
	A(await waitFor(() => click(ben.page, '.b-pvp-ready-lobby'), 15000), 'ben joined and readied');
	await waitFor(() => amy.page.evaluate(() => { const b = document.querySelector('.b-pvp-start'); return b && !b.disabled; }), 10000);
	await click(amy.page, '.b-pvp-start');
	A(await waitFor(async () => (await view(amy.page))?.pvp && (await view(ben.page))?.pvp, 20000), 'Start: both in the match');
	await idle(amy.page); await idle(ben.page);

	// ---- cora watches amy
	const cora = await open('cora', '/micatro/?spectate=amy');
	A(await waitFor(() => cora.page.evaluate(() => { const e = document.querySelector('#pvp-hud'); return e && !e.hidden && /ben/.test(e.textContent); }), 20000), 'cora watches amy live (the PvP HUD with ben)');

	// ---- to the Nemesis; amy strong, ben weak -> ben is out of lives
	const skipTwo = async (p) => { for (let k = 0; k < 2; k++) { await act(p, { type: 'skip_blind' }); await idle(p); if (/PACK/.test((await view(p)).state)) { await act(p, { type: 'skip_booster' }); await idle(p); } } };
	for (const p of [amy.page, ben.page]) await skipTwo(p);
	await click(amy.page, '.b-pvp-ready');
	await sleep(400);
	await click(ben.page, '.b-pvp-ready');
	A(await waitFor(async () => (await view(amy.page)).blind === 'bl_mp_nemesis' && (await view(ben.page)).blind === 'bl_mp_nemesis', 15000), 'both READY -> both in the Nemesis');
	await idle(amy.page); await idle(ben.page);
	const playWeak = async (p) => { await p.evaluate(() => { const v = window.__micatro.view(); const h = v.areas.hand; window.__micatro.act({ type: 'highlight', ids: [h[h.length - 1].id] }); }); await act(p, { type: 'play' }); await idle(p); };
	const playStrong = async (p) => { await p.evaluate(() => { const v = window.__micatro.view(); window.__micatro.act({ type: 'highlight', ids: v.areas.hand.slice(0, 5).map((c) => c.id) }); }); await act(p, { type: 'play' }); await idle(p); };
	// ben plays one hand first, so amy's HUD (and so her replay's timeline) shows his score mid-round
	await playWeak(ben.page);
	const benChips1 = String((await view(ben.page)).chips);
	A(await waitFor(async () => String((await view(amy.page)).opp?.score) === benChips1, 8000), "ben's live score reaches amy's HUD", benChips1);
	for (let i = 0; i < 6 && (await view(ben.page)).state === 'SELECTING_HAND'; i++) await playWeak(ben.page);
	for (let i = 0; i < 6 && (await view(amy.page)).state === 'SELECTING_HAND'; i++) await playStrong(amy.page);
	const lid = await amy.page.evaluate(() => window.__micatro.pvp.lobbyId);
	A(await waitFor(() => { const m = (row('mtpvp:' + lid) || {}).m; return m && m.over; }, 25000), 'the referee ends the match (a life lost at 1 life)', JSON.stringify(((row('mtpvp:' + lid) || {}).m || {}).round || {}).slice(0, 300));
	const m1 = row('mtpvp:' + lid).m;
	const amyWon = m1.over.winner === 'amy';
	A(await waitFor(() => amy.page.evaluate(() => !!document.querySelector('.pvp-end-title')), 20000), 'amy: the end screen');
	A(await waitFor(() => ben.page.evaluate(() => !!document.querySelector('.pvp-end-title')), 20000), 'ben: the end screen');
	const finalAmy = await view(amy.page);
	A(finalAmy.over && finalAmy.pvp.result === (m1.over.draw ? 'draw' : amyWon ? 'win' : 'lose'), "amy's run ends on the recorded pvp_end", JSON.stringify([finalAmy.over, finalAmy.pvp.result, m1.over]));

	// ---- both keep a replay of their side; amy's is uploaded
	A(await waitFor(async () => (await replays(amy.page)).some((e) => e.recipe && e.recipe.pvp && e.serverId), 15000), 'amy: the match is in her Replays (kept locally and uploaded)', JSON.stringify((await replays(amy.page)).map((e) => [e.id, !!e.recipe.pvp, e.serverId])));
	const eA = (await replays(amy.page)).find((e) => e.recipe && e.recipe.pvp);
	const rid = eA && eA.serverId;
	A(eA && eA.recipe.pvp_match && eA.recipe.pvp_match.opp === 'ben' && eA.recipe.pvp_match.me === 'amy' && eA.recipe.pvp_match.result === (amyWon ? 'win' : 'lose') && eA.recipe.pvp_match.why === 'lives', 'the recipe carries the match: amy vs ben, the result, why it ended', JSON.stringify(eA && { ...eA.recipe.pvp_match, tl: undefined }));
	A(eA && eA.meta.pvp && eA.meta.pvp.opp === 'ben' && eA.meta.pvp.mode === 'attrition' && eA.meta.pvp.ruleset, 'the replay meta names the opponent, mode and ruleset', JSON.stringify(eA && eA.meta.pvp));
	A(eA && eA.recipe.actions[eA.recipe.actions.length - 1].type === 'pvp_end', "the replay's last move is the referee's recorded pvp_end");
	const tl = (eA && eA.recipe.pvp_match.tl) || [];
	A(tl.length >= 2 && tl.some((e) => e.s === benChips1), "the opponent's timeline holds ben's mid-round score", JSON.stringify(tl.slice(0, 12)));
	const srvRow = rid && row('mreplay:' + rid);
	A(srvRow && srvRow.by === 'amy' && srvRow.meta.pvp && srvRow.meta.pvp.opp === 'ben', 'the server row mreplay:<id> is amy\'s, its meta marked Multiplayer', JSON.stringify(srvRow && srvRow.meta));
	A(await waitFor(async () => (await replays(ben.page)).some((e) => e.recipe && e.recipe.pvp && e.recipe.pvp_match && e.recipe.pvp_match.opp === 'amy' && e.recipe.pvp_match.result === (amyWon ? 'lose' : 'win')), 15000), 'ben keeps his side too (vs amy, the other result)');

	// ---- cora: "Watch the full run" with amy's replay id
	A(await waitFor(() => cora.page.evaluate((id) => { const a = document.querySelector('.b-watch-full'); return !!a && a.getAttribute('href') === '/micatro/?replay=' + id; }, rid), 20000), 'the spectator gets "Watch the full run" -> the match replay', await cora.page.evaluate(() => (document.querySelector('.b-watch-full') || {}).outerHTML || document.body.innerText.slice(0, 200)));

	// ---- the replay re-simulates to the same final state, the opponent on the HUD
	const rv = await open('cora', '/micatro/?replay=' + rid, cora.ctx);
	A(await waitFor(() => rv.page.evaluate(() => !!(window.__micatro.replay && (window.__micatro.replay.ready || window.__micatro.replay.error))), 30000), 'the replay viewer loads the match');
	const rinfo = await rv.page.evaluate(() => ({ ready: window.__micatro.replay.ready, error: window.__micatro.replay.error, total: window.__micatro.replay.total, banner: document.body.innerText.slice(0, 400) }));
	A(rinfo.ready && rinfo.total === eA.recipe.actions.length, 'it plays all of amy\'s moves', JSON.stringify(rinfo));
	A(/amy/.test(rinfo.banner) && /ben/.test(rinfo.banner) && /Multiplayer/.test(rinfo.banner), 'the banner says amy vs ben · Multiplayer', rinfo.banner.slice(0, 200));
	await rv.page.evaluate(() => window.__micatro.replay.pause());
	A(await waitFor(() => rv.page.evaluate(() => { const e = document.querySelector('#pvp-hud'); return e && !e.hidden && /ben/.test(e.textContent) && /amy/.test(e.textContent); }), 10000), 'the replay draws the PvP HUD: amy vs ben');
	// the moment ben's score first reached amy, in the Nemesis: the HUD shows it
	const sAt = tl.find((e) => e.s === benChips1);
	await rv.page.evaluate((i) => window.__micatro.replay.seekTo(i, { keepPlaying: false }), Math.max(sAt.i, 1));
	await idle(rv.page);
	const mid = await view(rv.page);
	A(mid.pvp.nemesis && String(mid.opp.score) === benChips1 && await rv.page.evaluate((s) => /Their score/.test(document.querySelector('#pvp-hud').textContent) && document.querySelector('#pvp-hud').textContent.includes(s), benChips1), "mid-Nemesis the replay HUD shows ben's score as amy saw it", JSON.stringify({ nem: mid.pvp.nemesis, opp: mid.opp, hud: await rv.page.evaluate(() => document.querySelector('#pvp-hud').textContent) }));
	await rv.page.evaluate(() => window.__micatro.replay.seekTo(window.__micatro.replay.total, { keepPlaying: false }));
	await idle(rv.page);
	const end = await view(rv.page);
	const ctl = await rv.page.evaluate(() => ({ mismatch: window.__micatro.replay.mismatch, notice: window.__micatro.replay.notice, err: window.__micatro.replay.stepper.error }));
	const same = ['state', 'ante', 'round', 'seed', 'dollars', 'chips', 'over', 'won', 'jokers', 'deck'].filter((k) => end[k] !== finalAmy[k]);
	A(!same.length && end.pvp.lives === finalAmy.pvp.lives && end.pvp.result === finalAmy.pvp.result && JSON.stringify(end.pvp.rounds) === JSON.stringify(finalAmy.pvp.rounds), 'the replay re-simulates to the SAME final state as the live match', JSON.stringify({ diff: same, end, finalAmy }).slice(0, 900));
	A(!ctl.mismatch && !ctl.err && /End of the match vs ben/.test(ctl.notice), 'no desync (the checksum matches): "End of the match vs ben"', JSON.stringify(ctl));
	A(end.opp && end.opp.name === 'ben' && end.opp.lives === m1.lives.ben && end.opp.max === 1, "the end of the replay: ben's final lives from the referee", JSON.stringify(end.opp));
	A(await rv.page.evaluate(() => !document.querySelector('.b-pvp-ready, .b-pvp-hurry:not([style*="none"])')), 'the replay HUD is read-only (no READY / Hurry)');

	// ---- a rematch ben forfeits: amy's replay says so
	await click(amy.page, '.b-pvp-rematch');
	await click(ben.page, '.b-pvp-rematch');
	A(await waitFor(async () => { const a = await view(amy.page); return a && !a.over && a.ante === 1 && a.seed !== finalAmy.seed; }, 20000), 'Rematch: match 2');
	await idle(amy.page);
	await act(amy.page, { type: 'skip_blind' });
	await idle(amy.page);
	const fo = await call('mtpvp-forfeit', { id: lid }, tokens.ben);
	A(!fo.error, 'ben forfeits match 2', JSON.stringify(fo).slice(0, 200));
	A(await waitFor(() => amy.page.evaluate(() => !!document.querySelector('.pvp-end-title.won')), 20000), 'amy wins by forfeit');
	A(await waitFor(async () => (await replays(amy.page)).some((e) => e.recipe.pvp_match && e.recipe.pvp_match.why === 'forfeit' && e.serverId), 15000), "amy's replay of match 2 is kept (why: forfeit) and uploaded");
	const eF = (await replays(amy.page)).find((e) => e.recipe.pvp_match && e.recipe.pvp_match.why === 'forfeit');
	const rv2 = await open('amy', '/micatro/?replay=local:' + eF.id, amy.ctx);
	await waitFor(() => rv2.page.evaluate(() => !!(window.__micatro.replay && window.__micatro.replay.ready)), 30000);
	await rv2.page.evaluate(() => window.__micatro.replay.seekTo(window.__micatro.replay.total, { keepPlaying: false }));
	await idle(rv2.page);
	const c2 = await rv2.page.evaluate(() => ({ mismatch: window.__micatro.replay.mismatch, notice: window.__micatro.replay.notice, v: window.__micatro.view() }));
	A(!c2.mismatch && c2.v.over && c2.v.pvp.result === 'win' && /forfeit/.test(c2.notice), 'the forfeit match replays to its end (won, forfeit)', JSON.stringify({ m: c2.mismatch, n: c2.notice, over: c2.v.over, r: c2.v.pvp && c2.v.pvp.result }));

	// ---- the Replays screen marks them Multiplayer
	const menu = await open('amy', '/micatro/', amy.ctx);
	await ready(menu.page);
	A(await waitFor(() => click(menu.page, '.b-replays'), 10000), 'main menu -> Replays');
	const rows = await menu.page.evaluate(() => [...document.querySelectorAll('.rp-row')].map((r) => r.textContent));
	A(rows.filter((t) => /Multiplayer/.test(t) && /ben/.test(t)).length === 2 && rows.some((t) => /forfeit/.test(t)), 'the Replays list marks both matches "Multiplayer vs ben" (one a forfeit)', JSON.stringify(rows));

	const errs = [...amy.errors, ...ben.errors, ...cora.errors, ...rv.errors, ...rv2.errors, ...menu.errors].filter((e) => !/favicon|net::/.test(e));
	A(!errs.length, 'no page errors', errs.join(' | '));
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
