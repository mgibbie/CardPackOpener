// scoundrel_spectate_e2e_test.mjs — a friend watches a live Scoundrel run, end to end, the way Micatro
// friend spectating works: the REAL server handler (server/mp.mjs, bundled like the dev server, over
// sqlite) behind a static server, two headless browsers:
//   alice plays /scoundrel/ signed in (publisher: publish-scoundrel, presence 'scoundrel:<label>'),
//   bob watches /scoundrel/?spectate=alice (scoundrel-state).
// Asserts bob's table converges on alice's after her moves (the cards on the board, HP, dungeon), the
// watcher badge reaches alice, bob's friends list / Live now hub route Watch to /scoundrel/?spectate=alice,
// a stranger can't watch, and a finished run lands on the 'scoundrel' leaderboard (dungeons, then final).
//   node overworld/tests/scoundrel_spectate_e2e_test.mjs
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
const SHOTS = process.env.SCOUNDREL_SHOTS || null;
const PORT = 8657;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

// ---------- the real handler over sqlite ----------
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-scoundrel-e2e-')), 'mp.bundle.mjs');
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
	const res = await handler(req, { MP_DB });
	return res.json();
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = req.headers['x-test-ip'] || ('10.8.0.' + (req.socket.remotePort % 250 + 1));
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

// ---------- accounts ----------
const tokens = {};
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'scoundrel-e2e-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; alice and bob are friends');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

// ---------- the server actions on their own ----------
{
	const pub = await call('publish-scoundrel', { seq: 1, label: 'Dungeon 1 · 20/20 HP', snapshot: { room: [], dungeon: 1 } }, tokens.carol);
	A(pub.ok, 'publish-scoundrel accepts a signed-in runner');
	const pres = await call('state', {}, tokens.carol);
	void pres;
	const strangers = await call('scoundrel-state', { username: 'carol' }, tokens.alice);
	A(strangers.error && /friend/.test(strangers.error), "a stranger can't read the run (friends only)", JSON.stringify(strangers));
	const anon = await call('publish-scoundrel', { seq: 1, label: 'x' });
	A(!!anon.error, 'publishing needs an account', JSON.stringify(anon));
	A((await call('micatro-state', { username: 'carol' }, tokens.carol)).snapshot == null, "a Scoundrel run is not a Micatro run (its own row)");
	await call('publish-scoundrel', { seq: 2, label: 'x', over: true }, tokens.carol);
	// the board: dungeons first, then the final dungeon's score
	A((await call('run-score', { mode: 'scoundrel', dungeons: 21, final: 0 }, tokens.carol)).error, 'run-score refuses more than 20 dungeons');
	A((await call('run-score', { mode: 'scoundrel', dungeons: 2, final: -500 }, tokens.carol)).error, 'run-score refuses an impossible final score');
	const c1 = await call('run-score', { mode: 'scoundrel', dungeons: 2, final: -30, seed: 'C1' }, tokens.carol);
	const c2 = await call('run-score', { mode: 'scoundrel', dungeons: 1, final: 20, seed: 'C2' }, tokens.carol);
	const c3 = await call('run-score', { mode: 'scoundrel', dungeons: 2, final: -5, seed: 'C3' }, tokens.carol);
	A(c1.better && !c2.better && c3.better && c3.best.final === -5 && c3.best.dungeons === 2, 'a best run: more dungeons beats a better final score; the same dungeons rank by the final score', JSON.stringify([c1.better, c2.better, c3.best]));
}

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async (who, url, vp = { width: 1600, height: 900, deviceScaleFactor: 1 }) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tok, st) => {
			try {
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { /* ignore */ }
		}, tokens[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		return { page, errors };
	};
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__scoundrel && window.__scoundrel.ready)), 30000);
	const sig = (page) => page.evaluate(() => {
		const v = window.__scoundrel.view();
		if (!v || !v.room) return null;
		return JSON.stringify({ s: v.state, d: v.dungeon, hp: v.hp, max: v.maxHp, n: v.n, room: v.room.map((c) => c.id), w: v.weapon && v.weapon.id, k: v.weaponKills.map((c) => c.id), deck: v.deckCount });
	});
	const drawn = (page) => page.evaluate(() => [...document.querySelectorAll('.cards-layer .card')].filter((e) => getComputedStyle(e).pointerEvents !== 'none').map((e) => +e.dataset.id).sort((a, b) => a - b).join(','));

	// alice starts a seeded run
	const alice = await open('alice', '/scoundrel/?seed=seed3');
	A(await ready(alice.page), 'alice: game ready (signed in)');
	await waitFor(() => alice.page.evaluate(() => !!window.__scoundrel.view()), 5000);
	const live = await waitFor(async () => {
		const r = await call('live-friends', {}, tokens.bob);
		return (r.live || []).some((f) => f.username === 'alice' && f.kind === 'scoundrel' && /Dungeon 1/.test(f.label));
	}, 10000);
	A(live, "bob's live-friends lists alice with kind 'scoundrel' and her progress label");
	const fr = await call('friends', {}, tokens.bob);
	const af = (fr.friends || []).find((f) => f.username === 'alice');
	A(af && /^scoundrel:Dungeon 1/.test(af.status || ''), "alice's presence status is 'scoundrel:<label>' (the top bar's Friends tab)", JSON.stringify(af));

	// bob watches
	const bob = await open('bob', '/scoundrel/?spectate=alice');
	A(await ready(bob.page), 'bob: spectator ready');
	const conv = async (label) => {
		const target = await sig(alice.page);
		const ok = await waitFor(async () => (await sig(bob.page)) === target, 15000);
		A(ok, `bob converges on alice's table: ${label}`, ok ? '' : `\n   alice ${target}\n   bob   ${await sig(bob.page)}`);
		const cardsOk = await waitFor(async () => (await drawn(bob.page)) === (await drawn(alice.page)), 6000);
		A(cardsOk, `bob's board draws the same cards as alice's: ${label}`, cardsOk ? '' : (await drawn(alice.page)) + ' vs ' + (await drawn(bob.page)));
	};
	await conv('the first room');
	A(await bob.page.evaluate(() => /watching/i.test(document.body.innerText) && !document.querySelector('.menu-modal')), 'the spectator shows a "Watching alice" banner, no menu');
	A(await bob.page.evaluate(() => document.querySelector('.b-run').disabled || getComputedStyle(document.querySelector('.b-run')).pointerEvents === 'none'), "the spectator can't press Run!");
	if (SHOTS) await bob.page.screenshot({ path: path.join(SHOTS, 'spectator_desktop.png') });

	const RECIPE = '10br2w111w0r0w0w1wr1w1w1r010w320w1r1r1w1w1w0r1w01w2wr20w00w1w0r30w0w20w1w00w0w';
	const play = (acts) => alice.page.evaluate((acts) => { for (const a of acts) window.__scoundrel.act(a); }, acts);
	await play(RECIPE.slice(0, 3));
	await conv('after equipping a weapon and a bare-handed fight');
	await play(RECIPE.slice(3, 4));   // Run!
	await conv('after running from a room');
	await play(RECIPE.slice(4, 5));   // picks a monster the weapon can fight: the fight choice opens
	A(await alice.page.evaluate(() => window.__scoundrel.view().state === 'fight_choice'), 'alice: a fight choice is open');
	await conv('mid fight choice');
	A(await bob.page.evaluate(() => getComputedStyle(document.querySelector('.sc-fight')).display === 'flex'), "bob sees alice's open fight choice");

	const badge = await waitFor(() => alice.page.evaluate(() => /\b1\b/.test((document.querySelector('.sc-watch') || {}).textContent || '')), 15000);
	A(badge, "alice's watcher badge shows 1 watcher");

	await play(RECIPE.slice(5));
	await conv('dungeon 1 cleared');
	A(await bob.page.evaluate(() => /Dungeon 1 cleared/.test(document.body.innerText) && /Waiting for alice/.test(document.body.innerText)), 'bob sees the "dungeon cleared" panel, waiting for alice to descend');
	await play('d');
	await conv('dungeon 2 (max HP 19)');
	A(await bob.page.evaluate(() => document.querySelector('.sc-hp-v').textContent === '19 / 19'), "bob's HUD shows alice at 19 / 19 in dungeon 2");

	// the hub's Live now list routes Watch to the Scoundrel spectator
	const hub = await open('bob', '/battlecards/start.html');
	const link = await waitFor(() => hub.page.evaluate(() => [...document.querySelectorAll('a,button')].some((el) => (el.getAttribute('href') || el.dataset.href || '').includes('/scoundrel/?spectate=alice'))), 15000);
	A(link, "bob's Live now hub has a Watch link to /scoundrel/?spectate=alice");
	A(await hub.page.evaluate(() => /Playing Scoundrel/.test(document.body.innerText)), 'the hub says "Playing Scoundrel"');

	// a phone spectator sees the board too
	const bobPhone = await open('bob', '/scoundrel/?spectate=alice', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await ready(bobPhone.page);
	A(await waitFor(async () => (await sig(bobPhone.page)) === (await sig(alice.page)), 15000), 'a phone spectator converges too');
	A(await waitFor(async () => (await drawn(bobPhone.page)) === (await drawn(alice.page)), 6000), "the phone spectator's board draws alice's cards");
	if (SHOTS) await bobPhone.page.screenshot({ path: path.join(SHOTS, 'spectator_phone.png') });

	// alice dies: the run is over for everyone, and her best run is on the board
	await alice.page.evaluate(() => {
		for (let g = 0; g < 300; g++) {
			const v = window.__scoundrel.view();
			if (v.over) break;
			if (v.state === 'fight_choice') { window.__scoundrel.act('b'); continue; }
			const i = v.room.findIndex((c) => c.enabled && c.kind === 'monster');
			window.__scoundrel.act(String(i >= 0 ? i : v.room.findIndex((c) => c.enabled)));
		}
	});
	const res = await alice.page.evaluate(() => window.__scoundrel.view().result);
	A(res && res.reason === 'dead' && res.dungeons === 1, 'alice: the run is over after 1 cleared dungeon', JSON.stringify(res));
	const onBoard = await waitFor(async () => {
		const r = await call('run-leaderboard', { mode: 'scoundrel' }, tokens.bob);
		return (r.top || []).some((x) => x.name === 'alice' && x.dungeons === 1 && x.final === res.final);
	}, 15000);
	A(onBoard, "alice's run is on the scoundrel leaderboard (1 dungeon, her final score)");
	const lb = await call('run-leaderboard', { mode: 'scoundrel' }, tokens.bob);
	A(lb.top[0].name === 'carol' && lb.top[1].name === 'alice', 'the board ranks carol (2 dungeons) above alice (1)', JSON.stringify(lb.top.map((e) => e.name + ':' + e.dungeons)));
	const bobOver = await waitFor(() => bob.page.evaluate(() => /DEFEATED/.test(document.body.innerText)), 15000);
	A(bobOver, 'bob sees the run end (DEFEATED)');
	const gone = await waitFor(async () => !((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice'), 10000);
	A(gone, "a finished run drops off bob's live list");
	for (const [n, p] of [['alice', alice], ['bob', bob], ['bob phone', bobPhone]]) A(!p.errors.length, `${n}: no page errors`, p.errors.slice(0, 3).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
