// ow_battlecast_test.mjs — every overworld battle can be watched by friends (owner, 2026-11-19: "make sure every single
// mode of every game type has spectation and replays"), not only a Battle Frontier run; and a MAIL battle is not offered
// to watch (its match is the two players' only: the SPECTATE friends were offered failed).
// overworld/ow_frontier.js battleCastTick / factorySnapshot / battleLabel; ow_pvp.js heartbeat; factoryspec.js.
//   1. a wild battle, signed in: its board is published (publish-factory) from its first frames, labelled "Wild <name> ·
//      <map>", and the heartbeat says factory:<label>, so it is on friends' live lists and opens in the Frontier's viewer
//   2. the battle ends: one last push says it is over; nothing more is published until the next battle
//   3. a mail battle open: the heartbeat does not say battling:<id> (nothing a friend can watch)
//   4. the viewer: an ordinary battle shows its label (no streak); when it ends it waits for the next one, and the next
//      one's board comes in
//   5. REPLAYS (ow_battletape.js): the battle is kept as a tape of what the screen showed (on this device; signed in, on
//      the account too, owreplay-put); the friends who watched get its id with one more "over" push, and their viewer
//      offers Z = watch the replay
//   6. START > REPLAYS lists it; Z plays it in the battle viewer (Z pauses, ► steps, X leaves); ?owreplay=<id> plays one
//      kept on the account
//   7. the server: owreplay-put keeps a tape, owreplay-get reads it back for anyone, junk is refused
//   node overworld/tests/ow_battlecast_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import os from 'os';
import { pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 8897;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'caster', friendCode: 'CAST1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }

// ===== 7. the server's own actions (server/mp.mjs, bundled like the dev server, over sqlite) =====
{
	const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql), bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return st.get(...bound) ?? null; }, async run() { return st.run(...bound); }, async all() { return { results: st.all(...bound) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-owcast-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ip = 0;
	const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.0.' + (1 + (ip++ % 250)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
	const { packString } = await import(pathToFileURL(path.join(ROOT, 'battlecards/codec.js')).href);
	const tok = (await call('register', { username: 'tapey', password: 'ow-cast-pass' })).token;
	const good = await packString(JSON.stringify({ v: 1, frames: [{ t: 0, s: { me: { name: 'A' }, foe: { name: 'B' } } }, { t: 250, s: null }] }));
	const put = await call('owreplay-put', { code: good, meta: { label: 'Wild <b>X', kind: 'battle' } }, tok);
	const got = /^[a-f0-9]{8}$/.test(put.id || '') ? await call('owreplay-get', { id: put.id }) : {};
	A(got.code === good && got.by === 'tapey' && got.meta.label === 'Wild bX', 'owreplay-put keeps a battle tape on the account; owreplay-get reads it back for anyone', JSON.stringify({ put, meta: got.meta }));
	const junk = [await call('owreplay-put', { code: 'x' }, tok), await call('owreplay-put', { code: await packString('{"frames":[]}') }, tok), await call('owreplay-put', { code: good }), await call('owreplay-get', { id: 'nope' })];
	A(junk.every(r => r.error), 'junk is refused: not a code, no frames, no account, a bad id', JSON.stringify(junk));
	await call('publish-factory', { snapshot: null, label: 'Battle', seq: 9, over: true, replay: put.id }, tok);
	A(JSON.parse(sqlite.prepare("SELECT value FROM mp_store WHERE key = 'factorystate:tapey'").get().value).replay === put.id, 'a finished battle\'s replay id is kept for the friends who watched (publish-factory)');
}

// /api/mp mock: records what the page publishes and what its heartbeat says
const calls = [], tapes = new Map();
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		if (body.action === 'publish-factory' || body.action === 'heartbeat') calls.push({ ...body, at: Date.now() });
		if (body.action === 'owreplay-put') { const id = 'abcd' + String(1000 + tapes.size); tapes.set(id, body.code); calls.push({ ...body, at: Date.now() }); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, id })); return; }
		if (body.action === 'owreplay-get') { const code = tapes.get(body.id); res.writeHead(code ? 200 : 404, { 'content-type': 'application/json' }); res.end(JSON.stringify(code ? { code, meta: {} } : { error: 'not found' })); return; }
		const extra = body.action === 'publish-factory' ? { watchers: 2, watcherNames: ['pat', 'sam'] } : {};
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, snapshot: null, ...extra })); return;
	}
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push('pageerr: ' + e.message + ' @ ' + String(e.stack || '').split(String.fromCharCode(10)).slice(1, 4).join(' | ')));
	await page.evaluateOnNewDocument((st) => {
		try {
			localStorage.setItem('magepunk_mp_token_v1', 'cast-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{ speciesId: 'metagross', name: 'METAGROSS', level: 60, gender: 'M', ability: 'Clear Body', types: ['Steel', 'Psychic'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 }, stats: { hp: 210, atk: 200, def: 180, spa: 150, spd: 150, spe: 130 }, maxHP: 210, curHP: 210, exp: 300000, moves: [{ id: 'meteormash', name: 'Meteor Mash', pp: 10, maxPp: 10 }], num: 376, sprite: 's376.png' }]));
		} catch { }
	}, STATE);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route101`, { waitUntil: 'domcontentloaded' });
	await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.factorySnapshot && window.__ow.factorySpec && window.__ow.world?.current?.layout)), 45000);
	await sleep(1500);
	A(await page.evaluate(() => window.__ow.factorySnapshot()) === null, '(no battle: nothing to publish)');

	// ===== 1 =====
	const t0 = Date.now();
	await page.evaluate(() => { const d = window.__ow.dialog; for (let i = 0; i < 10 && d.blocking; i++) d.key('x'); window.__ow.startWildBattle({ id: 'zigzagoon', level: 5 }); });
	await waitFor(() => page.evaluate(() => { const a = window.__ow.battle.active; return !!(a && a.me && a.foe); }), 15000);
	const snap = await page.evaluate(() => window.__ow.factorySnapshot());
	A(snap && snap.kind === 'battle' && /^Wild ZIGZAGOON/i.test(snap.facility || '') && snap.me && snap.foe && snap.foe.maxHP > 0, 'a wild battle has a board snapshot: both Pokémon, labelled "Wild ZIGZAGOON · <map>"', snap && { kind: snap.kind, facility: snap.facility });
	A(await waitFor(() => calls.some(c => c.action === 'publish-factory' && c.at >= t0 && c.snapshot && c.snapshot.kind === 'battle' && !c.over), 6000), 'it is published to friends (publish-factory) while it goes on');
	A(await waitFor(() => calls.some(c => c.action === 'heartbeat' && c.at >= t0 && /^factory:Wild ZIGZAGOON/i.test(c.status || '')), 8000), 'the heartbeat says factory:<label>, so it is on friends\' live lists and opens in the battle viewer', calls.filter(c => c.action === 'heartbeat').slice(-2).map(c => c.status));
	A(await waitFor(() => page.evaluate(() => window.__ow.frontierWatchers === 2), 5000), 'the player\'s screen learns how many are watching (the "N watching" badge)');
	// ===== 2 =====
	const t1 = Date.now();
	await page.evaluate(() => { window.__ow.battle.finish('escaped'); });
	await waitFor(() => page.evaluate(() => !window.__ow.battle.active), 8000);
	A(await waitFor(() => calls.some(c => c.action === 'publish-factory' && c.at >= t1 && c.over === true), 6000), 'the battle ends: one last push says it is over');
	await sleep(3000);
	const t2 = Date.now(); await sleep(2600);
	A(!calls.some(c => c.action === 'publish-factory' && c.at >= t2), 'then nothing more is published while exploring');
	// ===== 3 =====
	const hb = await page.evaluate(async () => {
		const core = await import('./ow_core.js'), P = await import('./ow_pvp.js');
		core.pvp.active = { matchId: 'a1b2c3', async: true };
		const sent = P.heartbeat(true); core.pvp.active = null;   // (the status is read before its first await: the game loop never sees the stand-in)
		await sent;
		return true;
	});
	const lastBeat = calls.filter(c => c.action === 'heartbeat').pop();
	A(hb && lastBeat && !/^battling:/.test(lastBeat.status || ''), 'a mail battle open: the heartbeat does not offer it to watch (no battling:<id>)', lastBeat && lastBeat.status);
	// ===== 5. the replay =====
	A(await waitFor(() => calls.some(c => c.action === 'owreplay-put'), 8000), 'the battle is uploaded as a replay (signed in)');
	const kept = await page.evaluate(async () => { const T = await import('./ow_battletape.js'); return T.listTapes().map(t => ({ label: t.label, n: t.frames.length, id: t.id, both: t.frames.filter(f => f.s && f.s.me && f.s.foe).length })); });
	A(kept.length === 1 && /^Wild ZIGZAGOON/i.test(kept[0].label) && kept[0].both >= 1 && /^abcd\d+$/.test(kept[0].id || ''), 'it is kept on this device with its frames, and knows its id on the account', kept);
	A(await waitFor(() => calls.some(c => c.action === 'publish-factory' && c.over === true && c.replay === kept[0].id), 6000), 'the friends who watched are sent its id (one more "over" push)');
	// ===== 6. START > REPLAYS =====
	await page.evaluate(() => { const d = window.__ow.dialog; for (let i = 0; i < 20 && d.blocking; i++) d.key('x'); });   // ("Got away safely!")
	await page.evaluate(async () => { const S = await import('./ow_screens.js'), M = await import('./ow_menustate.js'); M.startMenu.open = true; M.startMenu.idx = S.startItems().indexOf('REPLAYS'); });
	const items = await page.evaluate(async () => (await import('./ow_screens.js')).startItems());
	await page.evaluate(async () => (await import('./ow_screens.js')).startKey('z')); await sleep(150);   // (Route 101's own scene holds the keyboard: the START menu's handler is called as a press would)
	const list = await page.evaluate(async () => { const T = await import('./ow_battletape.js'), M = await import('./ow_menustate.js'); return { open: T.replayMenu.open, start: M.startMenu.open, idx: M.startMenu.idx, dialog: window.__ow.dialog.blocking, battle: !!window.__ow.battle.blocking, gate: window.__ow.gateReport() }; });
	A(items.includes('REPLAYS') && list.open, 'START has REPLAYS, and it opens the list', { items, list });
	await page.evaluate(async () => (await import('./ow_battletape.js')).replayKey('z')); await sleep(300);
	const play = () => page.evaluate(() => { const a = window.__ow.factorySpec.active; return a && a.tape ? { i: a.i, n: a.tape.frames.length, playing: a.playing, foe: a.snap && a.snap.foe && a.snap.foe.name } : null; });
	const p0 = await play();
	A(p0 && p0.n >= 1 && /ZIGZAGOON/i.test(p0.foe || ''), 'Z plays it in the battle viewer', p0);
	const key = k => page.evaluate(k2 => window.__ow.factorySpec.key(k2), k);
	await key('z'); await sleep(100); const i0 = (await play()).i;
	await key('ArrowRight'); await sleep(100); const p1 = await play();
	A(p1 && !p1.playing && p1.i === Math.min(i0 + 1, p1.n - 1), 'Z pauses it; ► steps one frame', { i0, p1 });
	await key('x'); await sleep(250);
	A(await page.evaluate(async () => !window.__ow.factorySpec.blocking && (await import('./ow_battletape.js')).replayMenu.open), 'X leaves, back to the list');
	await page.evaluate(async () => (await import('./ow_battletape.js')).replayKey('x')); await sleep(150);
	// a spectator's viewer offers the replay a finished battle left
	const offer = await page.evaluate(async (id) => { const v = window.__ow.factorySpec; v.start('friendo'); v.active.polling = false; v.ingest({ snapshot: { kind: 'battle', facility: 'Wild X', me: { name: 'A', curHP: 1, maxHP: 2 }, foe: { name: 'B', curHP: 1, maxHP: 2 } }, seq: 1, over: false }); v.ingest({ snapshot: null, seq: 2, over: true, replay: id }); const r = v.active.replay; v.key('z'); for (let i = 0; i < 50 && !(v.active && v.active.tape); i++) await new Promise(r2 => setTimeout(r2, 100)); const t = !!(v.active && v.active.tape); v.quit(); return { r, t }; }, kept[0].id);
	A(offer.r === kept[0].id && offer.t, 'a friend who watched: Z = watch the replay, and it plays', offer);
	// ?owreplay=<id>
	const p2 = await browser.newPage();
	await p2.evaluateOnNewDocument((st) => { localStorage.setItem('magepunk_mp_token_v1', 'cast-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); localStorage.setItem('magepunk_region', 'HOENN'); }, STATE);
	await p2.goto(`http://localhost:${PORT}/overworld/index.html?map=Route101&owreplay=${kept[0].id}`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => p2.evaluate(() => !!(window.__ow && window.__ow.factorySpec.active && window.__ow.factorySpec.active.tape)), 45000), 'a link /overworld/?owreplay=<id> plays it');
	await p2.close();
	// ===== 4. the viewer =====
	const view = await page.evaluate(async (s) => {
		const v = window.__ow.factorySpec;
		v.start('friendo'); v.active.polling = false;
		v.ingest({ snapshot: s, seq: 3, watchers: 1, over: false });
		const a = { msg: v.active.msg, over: v.active.over };
		v.ingest({ snapshot: null, seq: 4, watchers: 1, over: true });
		const b = { msg: v.active.msg, over: v.active.over, still: v.blocking };
		v.key('z');   // (Z does not leave while waiting for the next battle)
		const z = v.blocking;
		v.ingest({ snapshot: { ...s, facility: 'Wild WURMPLE · ROUTE 101' }, seq: 5, watchers: 1, over: false });
		const c = { msg: v.active.msg, over: v.active.over };
		v.quit();
		return { a, b, z, c, closed: !v.blocking };
	}, snap);
	A(!view.a.over && view.b.over && /battle is over\. Waiting for the next one/.test(view.b.msg) && view.b.still && view.z, 'the viewer: when the battle ends it says so and waits for the next one (Z does not leave)', view);
	A(!view.c.over && view.closed, 'the next battle\'s board comes in; X leaves', view.c);
	A(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
