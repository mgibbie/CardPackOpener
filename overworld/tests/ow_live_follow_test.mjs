// ow_live_follow_test.mjs — overworld EXPLORATION spectating and replays (owner, 2026-11-19: "Live follow + replay: a
// friend can watch you walk around live (camera follows you, read-only, with your battles and minigames shown as they
// happen). Each play session is also recorded as a position/scene tape you can scrub through later.").
// overworld/ow_scenes.js (scene registry), ow_worldcast.js (publish-world + journeys), ow_follow.js (the viewer),
// ow_readonly.js (the viewer's write wall), server/mp.mjs publish-world / world-state / live-friends kind 'world'.
// The REAL server handler (bundled, over node:sqlite) behind a static server; headless Chrome, one context per player:
//   1. the server alone: no watcher -> nothing written; a stranger is refused; a friend gets presence, then the stream
//      (unchanged by seq); live-friends lists a roaming friend as kind 'world' (not for a stranger); SPEC_CAP
//   2. alice plays (signed in); bob follows /overworld/?follow=alice: bob's view converges on her map and tile, follows
//      her to a second map and along her steps, and shows her wild battle as it happens (the battle scene); alice's
//      page learns she is watched
//   3. bob's OWN save: every magepunk_* key in his localStorage, and his server save row (ow:bob) and presence, are
//      byte-identical before and after following her across two maps and through a battle
//   4. carol (not her friend) is refused
//   5. alice's session tape (journey): it lists the map change, the steps and the battle; START > REPLAYS lists it;
//      it plays in the same viewer (?journey=local:<key>: C jumps to the battle); shared (owreplay-put) it plays for
//      anyone at /overworld/?journey=<id>
//   node overworld/tests/ow_live_follow_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8921;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(200); } return false; }

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql), bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return st.get(...bound) ?? null; }, async run() { return st.run(...bound); }, async all() { return { results: st.all(...bound) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-owfollow-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
process.env.MP_GC_RATE = '0';
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, ...(await res.json()) };
};
const row = (k) => { const r = sqlite.prepare('SELECT value, updated_at FROM mp_store WHERE key = ?').get(k); return r ? { value: r.value, updated_at: r.updated_at } : null; };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const apiLog = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		try { const b = JSON.parse(raw); apiLog.push({ action: b.action, auth: String(req.headers.authorization || '').slice(-12), at: Date.now() }); } catch { }
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); } catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	if (u === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>blank</title>'); return; }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

// ---------- accounts ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carol', 'dave', 'erin']) tokens[n] = (await call('register', { username: n, password: 'follow-e2e-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'erin' }, tokens.dave);
A(tokens.alice && tokens.bob && tokens.carol, 'real accounts; alice and bob are friends (dave and erin too, for the server checks)');

// ===== 1. the server alone (dave plays, erin follows) =====
{
	const lone = await call('publish-world', {}, tokens.carol);
	A(lone.ok && lone.watchers === 0 && !lone.wrote, 'publish-world with no friends: nothing to do', lone);
	const check = await call('publish-world', { snapshot: { map: 'Route101', x: 1, y: 2, f: 'down' }, seq: 1 }, tokens.dave);
	A(check.ok && check.watchers === 0 && !check.wrote && !row('worldstate:dave'), 'nobody following: the snapshot is not written (a watcher check costs no write)', check);
	A((await call('world-state', { username: 'dave' }, tokens.carol)).status === 403, 'a stranger cannot follow (world-state 403)');
	A((await call('world-state', { username: 'dave' }, tokens.erin)).online === false, 'dave has no presence yet: not playing');
	await call('heartbeat', { map: 'Route101', x: 4, y: 7, facing: 'left', status: 'roaming', region: 'ROUTE 101' }, tokens.dave);
	const w0 = await call('world-state', { username: 'dave' }, tokens.erin);
	A(w0.online && w0.waiting && w0.presence && w0.presence.map === 'Route101' && w0.presence.x === 4 && w0.watchers === 1, 'erin follows: before the stream, where his heartbeat put him', w0);
	const pub = await call('publish-world', { snapshot: { map: 'Route101', x: 5, y: 7, f: 'right' }, seq: 3 }, tokens.dave);
	A(pub.watchers === 1 && pub.watcherNames[0] === 'erin' && pub.wrote && row('worldstate:dave'), 'his page learns erin follows, and its snapshot is written', pub);
	const w1 = await call('world-state', { username: 'dave', seq: -1 }, tokens.erin);
	const w2 = await call('world-state', { username: 'dave', seq: 3 }, tokens.erin);
	A(w1.snapshot && w1.snapshot.x === 5 && w1.seq === 3 && w2.unchanged && !w2.snapshot, 'erin gets the snapshot; the same seq again: unchanged (no body)', { w1, w2 });
	const lf = await call('live-friends', {}, tokens.erin);
	const ld = (lf.live || []).find((x) => x.username === 'dave');
	A(ld && ld.kind === 'world' && ld.label === 'ROUTE 101' && ld.watchers === 1, 'live-friends lists a roaming friend as watchable (kind world)', lf);
	A(!((await call('live-friends', {}, tokens.carol)).live || []).some((x) => x.username === 'dave'), '...a stranger\'s list does not');
	const big = await call('publish-world', { snapshot: { map: 'Route101', pad: 'x'.repeat(20000) } }, tokens.dave);
	A(big.status === 413, 'an oversized world snapshot is refused', big.status);
	const LW = await import(pathToFileURL(path.join(ROOT, 'site/livewatch.js')).href);
	A(LW.watchHref({ username: 'dave', kind: 'world' }) === '/overworld/?follow=dave' && LW.activityFromStatus('roaming', 'ROUTE 101').kind === 'world' && LW.watchHref({ username: 'dave', status: 'visiting:erin' }) === '/overworld/?follow=dave', 'site/livewatch.js: a roaming friend is watchable, Watch opens /overworld/?follow=<user>');
}

const PARTY = [{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }];
const STORY = JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} });
const BOB_POS = JSON.stringify({ map: 'LittlerootTown', x: 6, y: 9 });
const BOB_SAVE = {
	magepunk_region: 'HOENN', magepunk_story: STORY, magepunk_party_v1: JSON.stringify(PARTY), magepunk_pos_v1: JSON.stringify({ map: 'LittlerootTown', x: 6, y: 9 }),
	magepunk_money: '4321', magepunk_playtime: '777', magepunk_badges_v1: JSON.stringify({ HOENN: ['stone'] }), magepunk_ow_rev: '12',
};
// (the device's owner tag, site/account_silo.js: every page of the site writes it for the signed-in account, so a real
// device of bob's already has it; it is not part of the save)
const DEVICE = { magepunk_local_owner_v1: JSON.stringify({ user: 'bob', at: '2026-11-01T00:00:00.000Z', why: 'login' }) };
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };
const gameKeys = () => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^magepunk_/.test(k) && !/^magepunk_mp_/.test(k)) o[k] = localStorage.getItem(k); } return Object.fromEntries(Object.keys(o).sort().map(k => [k, o[k]])); };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const errors = [];
	const ctxFor = async (who) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 960, height: 640, deviceScaleFactor: 1 });
		page.on('pageerror', (e) => errors.push(who + ' pageerr: ' + e.message));
		const st = await stateOf(who);
		// the account only (not a save): set before any page script on every load
		await page.evaluateOnNewDocument((tok, st) => { try { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { } }, tokens[who], st);
		return { ctx, page };
	};

	// ===== 2. alice plays =====
	const { page: pa } = await ctxFor('alice');
	await pa.goto(`http://localhost:${PORT}/blank.html`);
	await pa.evaluate((party, story) => { localStorage.setItem('magepunk_region', 'HOENN'); localStorage.setItem('magepunk_story', story); localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_pos_v1', JSON.stringify({ map: 'Route101', x: 10, y: 10 })); }, PARTY, STORY);
	await pa.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
	const booted = await waitFor(() => pa.evaluate(() => !!(window.__ow && window.__ow.world?.current?.layout && window.__ow.friends && window.__ow.friends.some(f => f.username === 'bob'))), 60000);
	A(booted, 'alice\'s game boots signed in, bob on her friends list');
	const clearA = () => pa.evaluate(() => { const o = window.__ow; for (let i = 0; i < 30 && (o.dialog.blocking); i++) o.dialog.key('x'); if (o.cutscene.blocking) o.cutscene.stop(); });
	await clearA();
	const posA = () => pa.evaluate(() => ({ map: window.__ow.world.current.name, x: window.__ow.player.tx, y: window.__ow.player.ty }));
	const stepA = async (dx, dy) => { await pa.evaluate((dx, dy) => { const p = window.__ow.player; p.setTile(p.tx + dx, p.ty + dy); p.facing = dx > 0 ? 'right' : dx < 0 ? 'left' : dy > 0 ? 'down' : 'up'; }, dx, dy); await sleep(400); };
	await stepA(1, 0); await stepA(1, 0); await stepA(0, 1);
	const a1 = await posA();

	// bob's own save, on the device and on the server, before he follows anyone
	const { page: pb } = await ctxFor('bob');
	await pb.goto(`http://localhost:${PORT}/blank.html`);
	await pb.evaluate((save) => { for (const [k, v] of Object.entries(save)) localStorage.setItem(k, v); }, { ...BOB_SAVE, ...DEVICE });
	const okSave = await call('ow-save', { ow: BOB_SAVE }, tokens.bob);
	A(okSave.ok !== false && !okSave.error && row('ow:bob'), 'bob has a save on the device and on the server', okSave);
	const bobLocal0 = await pb.evaluate(gameKeys);
	const bobRow0 = row('ow:bob'), bobPres0 = row('presence:bob');

	await pb.goto(`http://localhost:${PORT}/overworld/index.html?follow=alice`, { waitUntil: 'domcontentloaded' });
	const view = () => pb.evaluate(() => { const f = window.__owFollow, v = f && f.view; if (!v) return null; const g = f.ghosts.get(v.name); const last = g && (g.path.length ? g.path[g.path.length - 1] : { x: Math.round(g.px / 16), y: Math.round(g.py / 16) }); return { map: v.map, worldMap: f.world.current && f.world.current.name, x: last && last.x, y: last && last.y, scene: v.scene && v.scene.id, foe: v.scene && v.scene.snap && v.scene.snap.foe && v.scene.snap.foe.name, msg: v.msg, watchers: v.watchers, refused: f.refused }; });
	const at = (p) => async () => { const v = await view(); return v && v.map === p.map && v.worldMap === p.map && v.x === p.x && v.y === p.y; };
	A(await waitFor(at(a1), 30000), 'bob\'s view converges on alice\'s map and tile', { bob: await view(), alice: a1 });
	A(await waitFor(() => pa.evaluate(async () => (await import('./ow_worldcast.js')).worldCast.watchers >= 1), 20000), 'alice\'s page learns she is being followed (the "N watching" badge)');
	A(!(await pb.evaluate(() => !!(window.__ow && window.__ow.party))), 'bob\'s page never booted his game (no party loaded, no game hook)');
	// her steps on the same map
	await stepA(0, 1); await stepA(-1, 0);
	const a2 = await posA();
	A(await waitFor(at(a2), 15000), 'her steps reach bob\'s view', { bob: await view(), alice: a2 });
	// a second map
	await pa.evaluate(() => window.__ow.moveToMap('OldaleTown', 10, 12));
	await waitFor(() => pa.evaluate(() => window.__ow.world.current.name === 'OldaleTown'), 15000);
	await clearA();
	await stepA(1, 0); await stepA(0, -1);
	const a3 = await posA();
	A(a3.map === 'OldaleTown' && await waitFor(at(a3), 25000), 'she walks on to a second map: bob\'s view loads it and finds her there', { bob: await view(), alice: a3 });
	// a wild battle
	await clearA();
	await pa.evaluate(() => window.__ow.startWildBattle({ id: 'zigzagoon', level: 5 }));
	await waitFor(() => pa.evaluate(() => { const a = window.__ow.battle.active; return !!(a && a.me && a.foe); }), 15000);
	A(await waitFor(async () => { const v = await view(); return v && v.scene === 'battle' && /ZIGZAGOON/i.test(v.foe || ''); }, 20000), 'her wild battle shows on bob\'s screen as it happens (the battle scene)', await view());
	// keys on bob's page do nothing but watch (arrows, A, START): his view stays on her
	for (const k of ['ArrowUp', 'z', 'Enter', 'ArrowLeft']) await pb.keyboard.press(k);
	// the wall itself (ow_readonly.js): a game write on this page, from anywhere, is dropped; a save call never leaves
	const wall = await pb.evaluate(async () => {
		localStorage.setItem('magepunk_pos_v1', '{"map":"Nowhere"}'); localStorage.removeItem('magepunk_party_v1'); localStorage.setItem('follow_test_scratch', '1');
		const MP = await import('/battlecards/mpmode.js');
		const r = await MP.call('ow-save', { ow: { magepunk_region: 'KANTO' } }), h = await MP.call('heartbeat', { map: 'Nowhere' });
		return { pos: localStorage.getItem('magepunk_pos_v1'), party: !!localStorage.getItem('magepunk_party_v1'), other: localStorage.getItem('follow_test_scratch'), r, h };
	});
	A(wall.pos === BOB_POS && wall.party && wall.other === '1' && wall.r.error && wall.h.error, 'the viewer page drops every write to the game keys and refuses save / presence calls (other keys still work)', wall);
	await pa.evaluate(() => window.__ow.battle.finish('escaped'));
	await waitFor(() => pa.evaluate(() => !window.__ow.battle.active), 10000);
	A(await waitFor(async () => { const v = await view(); return v && v.scene !== 'battle'; }, 20000), 'the battle ends on bob\'s screen too', await view());
	await clearA();
	const vEnd = await view();

	// ===== 3. bob's own save is untouched =====
	await pb.keyboard.press('x');   // X leaves
	await sleep(1500);
	await pb.goto(`http://localhost:${PORT}/blank.html`);
	const bobLocal1 = await pb.evaluate(gameKeys);
	A(JSON.stringify(bobLocal1) === JSON.stringify(bobLocal0), 'bob\'s own save on the device: every magepunk_* key byte-identical after following her across two maps and a battle', { before: Object.keys(bobLocal0).length, after: Object.keys(bobLocal1).length, diff: Object.keys({ ...bobLocal0, ...bobLocal1 }).filter(k => bobLocal0[k] !== bobLocal1[k]) });
	const bobRow1 = row('ow:bob'), bobPres1 = row('presence:bob');
	A(JSON.stringify(bobRow1) === JSON.stringify(bobRow0), 'bob\'s server save row (ow:bob) byte-identical, updated_at too');
	A(JSON.stringify(bobPres1) === JSON.stringify(bobPres0), 'bob\'s presence untouched (the viewer never sends a heartbeat)', { bobPres0, bobPres1 });
	A(!apiLog.some(c => c.auth === tokens.bob.slice(-12) && /^(ow-save|heartbeat|publish-|run-)/.test(c.action || '')), 'no save, heartbeat or publish ever left bob\'s page', apiLog.filter(c => c.auth === tokens.bob.slice(-12)).map(c => c.action).filter((a, i, l) => l.indexOf(a) === i));
	A(vEnd && Array.isArray(vEnd.refused.keys), '(the write wall reports what it turned away: ' + JSON.stringify(vEnd && vEnd.refused) + ')');

	// ===== 4. a stranger =====
	const { page: pc } = await ctxFor('carol');
	await pc.goto(`http://localhost:${PORT}/overworld/index.html?follow=alice`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => pc.evaluate(() => { const v = window.__owFollow && window.__owFollow.view; return !!(v && /only watch a friend/.test(v.msg) && !v.map); }), 20000), 'carol (not her friend) is refused: "You can only watch a friend."');

	// ===== 5. alice's session tape =====
	await pa.evaluate(async () => (await import('./ow_worldcast.js')).saveJourney());
	const jt = await pa.evaluate(async () => {
		const W = await import('./ow_worldcast.js'), l = W.listJourneys(), t = l[0];
		if (!t) return null;
		const st = W.foldFrames(t.frames);
		const maps = [...new Set(st.map(s => s.map))];
		const steps = t.frames.filter(f => f.s && (f.s.x != null || f.s.y != null)).length;
		const battle = st.some(s => s.scene && s.scene.id === 'battle' && s.scene.snap && s.scene.snap.foe && /ZIGZAGOON/i.test(s.scene.snap.foe.name));
		return { key: t.key, n: t.frames.length, maps, steps, battle, label: t.label, chars: JSON.stringify(l).length };
	});
	A(jt && jt.maps.includes('Route101') && jt.maps.includes('OldaleTown'), 'her journey has the map change (Route 101 -> Oldale Town)', jt);
	A(jt && jt.steps >= 5, 'its steps', jt && jt.steps);
	A(jt && jt.battle, 'and the battle (its board, as a scene)', jt);
	A(jt && jt.chars < 400_000, 'kept on the device under the size cap', jt && jt.chars);
	const menu = await pa.evaluate(async () => { const T = await import('./ow_battletape.js'); return T.replayEntries().map(e => ({ j: !!e.journey, label: e.label })); });
	A(menu.some(e => e.j && /^Journey/.test(e.label)) && menu.some(e => !e.j), 'START > REPLAYS lists the journey beside the battle replay', menu);
	A(fs.readFileSync(path.join(ROOT, 'overworld/party.js'), 'utf8').includes("'magepunk_ow_journeys_v1'") && fs.readFileSync(path.join(ROOT, 'site/owreset.js'), 'utf8').includes('magepunk_ow_journeys_v1:'), 'journeys are expendable when the store is full (party.js) and kept by a new journey (owreset.js)');
	// it plays in the viewer
	const share = await pa.evaluate(async (k) => (await import('./ow_worldcast.js')).shareJourney(k), jt && jt.key);
	await pa.goto(`http://localhost:${PORT}/overworld/index.html?journey=local:${jt && jt.key}`, { waitUntil: 'domcontentloaded' });
	const tv = () => pa.evaluate(() => { const v = window.__owFollow && window.__owFollow.view; return v && v.tape ? { i: v.i, n: v.tape.frames.length, map: v.map, scene: v.scene && v.scene.id, playing: v.playing } : null; });
	A(await waitFor(async () => { const t = await tv(); return t && t.map === 'Route101'; }, 30000), 'the journey plays in the same read-only viewer, from its first map', await tv());
	await pa.evaluate(() => window.__owFollow.key('c'));
	A(await waitFor(async () => { const t = await tv(); return t && t.scene === 'battle' && t.map === 'OldaleTown' && !t.playing; }, 15000), 'C jumps to the next scene: the battle, on the second map', await tv());
	const iB = (await tv()).i;
	await pa.evaluate(() => window.__owFollow.key('ArrowRight')); await sleep(200);
	A((await tv()).i === iB + 1, '► steps a frame', await tv());
	A(/^http:\/\/localhost:\d+\/overworld\/\?journey=[a-f0-9]{8,20}$/.test(share || ''), 'signed in, a journey is shared as a short link', share);
	const { page: pd } = await ctxFor('carol');
	await pd.goto(share.replace(/^http:\/\/localhost:\d+/, `http://localhost:${PORT}`), { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => pd.evaluate(() => { const v = window.__owFollow && window.__owFollow.view; return !!(v && v.tape && v.tape.frames.length === v.states.length && v.map); }), 30000), 'the link plays it for anyone (owreplay-get), alice\'s name on it', await pd.evaluate(() => { const v = window.__owFollow && window.__owFollow.view; return v && { name: v.name, msg: v.msg }; }));
	A(!errors.length, 'no page errors', errors.slice(0, 4).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
