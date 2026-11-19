// scoundrel_replay_links_test.mjs — a finished Scoundrel run hands its replay on (owner 2026-11-19: every mode has live
// spectating AND replays). The REAL server handler (server/mp.mjs over sqlite) behind a static server:
//   - publish-scoundrel {over, replay}: the ?replay= param is kept on the state row and relayed to the friend
//     watching (scoundrel-state); a malformed or oversized one is dropped, never stored
//   - run-score {replay}: kept on the board row only when it re-simulates to exactly that score on that seed
//   - alice plays a seeded run to its end while bob watches: bob's end screen offers "Watch the full run" (the right
//     link), the leaderboard row has a Watch link (reachable by keyboard), and that replay ends in alice's exact state
//   node overworld/tests/scoundrel_replay_links_test.mjs
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
const PORT = 9986;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-scoundrel-rl-')), 'mp.bundle.mjs');
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
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'scoundrel-rl-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
await call('add-friend', { username: 'carol' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.carol);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; bob is friends with alice and carol');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };
const E = await import(pathToFileURL(path.join(ROOT, 'scoundrel/js/engine.js')).href);

// a whole run played by a simple policy (potions + weapons first, bare-handed fights) until it ends
function playOut(seed) {
	const s = E.newRun(seed);
	for (let g = 0; g < 2000 && s.state !== E.STATE.OVER; g++) {
		if (s.state === E.STATE.FIGHT_CHOICE) { E.apply(s, 'b'); continue; }
		if (s.state === E.STATE.CLEARED) { E.apply(s, 'd'); continue; }
		const i = s.room.findIndex((c) => E.cardEnabled(s, c) && E.kindOf(c) !== 'monster');
		E.apply(s, String(i >= 0 ? i : s.room.findIndex((c) => E.cardEnabled(s, c))));
	}
	return s;
}

// ---------- the server actions on their own ----------
{
	const run = playOut('rl1');
	A(run.state === E.STATE.OVER && run.actions.length >= 5, 'a reference run on seed rl1 ends', run.actions.length);
	const param = 'rl1.' + run.actions;
	await call('publish-scoundrel', { seq: 1, label: 'Dungeon 1', snapshot: { room: [], dungeon: 1 } }, tokens.carol);
	await call('publish-scoundrel', { seq: 2, label: 'Run over', over: true, replay: param, snapshot: { room: [], dungeon: 1, over: true } }, tokens.carol);
	const seen = await call('scoundrel-state', { username: 'carol' }, tokens.bob);
	A(seen.replay === param, "a finished run's replay param reaches its spectator (scoundrel-state)", JSON.stringify(seen.replay));
	const again = await call('scoundrel-state', { username: 'carol', seq: 2 }, tokens.bob);
	A(again.unchanged && again.replay === param, 'an unchanged poll still carries the replay', JSON.stringify(again));
	let seq = 3;
	for (const [bad, why] of [['rl1.' + 'x'.repeat(10), 'a bad action char'], ['rl1.' + '0'.repeat(4001), 'over the 4000-action cap'], ['<script>.0', 'a bad seed'], [{ seed: 'rl1' }, 'not a string']]) {
		await call('publish-scoundrel', { seq: seq++, label: 'Run over', over: true, replay: bad, snapshot: { room: [], dungeon: 1, over: true } }, tokens.carol);
		const r = await call('scoundrel-state', { username: 'carol' }, tokens.bob);
		A(r.replay == null, 'a malformed replay is dropped: ' + why, JSON.stringify(r.replay ?? null).slice(0, 60));
	}
	await call('publish-scoundrel', { seq: seq++, label: 'Dungeon 1', replay: param, snapshot: { room: [], dungeon: 1 } }, tokens.carol);
	A((await call('scoundrel-state', { username: 'carol' }, tokens.bob)).replay == null, 'a live (not over) push carries no replay');

	// the board: the replay rides on the row only when it re-simulates to the claimed score
	const res = run.result;
	const lie = await call('run-score', { mode: 'scoundrel', dungeons: res.dungeons, final: res.final + 1, seed: 'rl1', replay: param }, tokens.carol);
	A(lie.ok && !lie.best.replay, "a replay that doesn't re-simulate to the claimed score is not kept (the score still counts)", JSON.stringify(lie.best));
	const other = await call('run-score', { mode: 'scoundrel', dungeons: res.dungeons + 1, final: res.final, seed: 'rl2', replay: param }, tokens.carol);
	A(other.ok && !other.best.replay, 'a replay of another seed is not kept', JSON.stringify(other.best));
	const big = await call('run-score', { mode: 'scoundrel', dungeons: res.dungeons + 2, final: res.final, seed: 'rl1', replay: 'rl1.' + '0'.repeat(5000) }, tokens.carol);
	A(big.ok && !big.best.replay, 'an oversized replay is not kept', JSON.stringify(big.best).slice(0, 80));
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
	const finalSig = (page) => page.evaluate(() => { const v = window.__scoundrel.view(); return v && JSON.stringify({ d: v.dungeon, hp: v.hp, max: v.maxHp, n: v.n, cleared: v.cleared, result: v.result, totals: v.totals }); });

	const alice = await open('alice', '/scoundrel/?seed=rl1');
	A(await ready(alice.page), 'alice: game ready (signed in)');
	await waitFor(() => alice.page.evaluate(() => !!window.__scoundrel.view()), 5000);
	const bob = await open('bob', '/scoundrel/?spectate=alice');
	A(await ready(bob.page), 'bob: spectator ready');
	A(await waitFor(() => bob.page.evaluate(() => { const v = window.__scoundrel.view(); return !!(v && v.room && v.seed === 'rl1'); }), 15000), "bob sees alice's run");
	// alice plays her run to the end (the same policy as playOut)
	await alice.page.evaluate(() => {
		for (let g = 0; g < 2000; g++) {
			const v = window.__scoundrel.view();
			if (v.over) break;
			if (v.state === 'fight_choice') { window.__scoundrel.act('b'); continue; }
			if (v.state === 'cleared') { window.__scoundrel.act('d'); continue; }
			const i = v.room.findIndex((c) => c.enabled && c.kind !== 'monster');
			window.__scoundrel.act(String(i >= 0 ? i : v.room.findIndex((c) => c.enabled)));
		}
	});
	const recipe = await alice.page.evaluate(() => window.__scoundrel.recipe());
	const aliceEnd = await finalSig(alice.page);
	A(recipe && JSON.parse(aliceEnd).result, "alice's run is over", aliceEnd);
	const want = '/scoundrel/?replay=' + recipe.seed + '.' + recipe.actions;
	const specBtn = await waitFor(() => bob.page.evaluate(() => !!document.querySelector('.sc-over-modal .b-spec-replay')), 20000);
	A(specBtn, 'bob\'s end screen offers "Watch the full run"');
	if (specBtn) {
		await bob.page.evaluate(() => document.querySelector('.sc-over-modal .b-spec-replay').click());
		A(await waitFor(() => bob.page.evaluate((w) => location.pathname + location.search === w, want), 10000), "bob's button opens alice's replay link", await bob.page.evaluate(() => location.search.slice(0, 40)));
		A(await ready(bob.page), 'the replay viewer loads');
		const total = await bob.page.evaluate(() => window.__scoundrel.replayTotal);
		A(total === recipe.actions.length, 'the replay has every move', total + ' vs ' + recipe.actions.length);
		await bob.page.evaluate(() => window.__scoundrel.replayTo(window.__scoundrel.replayTotal));
		A((await finalSig(bob.page)) === aliceEnd, "the replay ends in alice's exact final state", (await finalSig(bob.page)) + '\n   vs ' + aliceEnd);
	}

	// the leaderboard row links the same replay
	const onBoard = await waitFor(async () => ((await call('run-leaderboard', { mode: 'scoundrel' }, tokens.bob)).top || []).some((x) => x.name === 'alice' && x.replay === recipe.seed + '.' + recipe.actions), 15000);
	A(onBoard, "alice's board row carries her run's replay");
	const lb = await open('bob', '/scoundrel/');
	await ready(lb.page);
	await lb.page.evaluate(() => document.querySelector('.b-leaders').click());
	await waitFor(() => lb.page.evaluate(() => !!document.querySelector('.sc-lb tbody tr td')), 10000);
	await sleep(300);
	const rows = await lb.page.evaluate(() => [...document.querySelectorAll('.sc-lb tbody tr')].map((tr) => { const a = tr.querySelector('.b-lb-watch'); return [tr.children[1] && tr.children[1].textContent, a ? a.getAttribute('href') : null]; }));
	const aliceRow = rows.find((r) => r[0] === 'alice');
	A(aliceRow && aliceRow[1] === want, "the leaderboard's alice row has a Watch link to her replay", JSON.stringify(rows).slice(0, 200));
	const carolRow = rows.find((r) => r[0] === 'carol');
	A(carolRow && carolRow[1] == null, "carol's row (no honest replay) has no Watch link", JSON.stringify(carolRow));
	// the keyboard reaches the Watch link: arrows move the reticle over the modal's stops, Z follows it
	let hit = false;
	// (the ring's focus, window.__scoundrel.focus(): not the reticle's rect, which trails the modal's rise-in animation)
	for (let k = 0; k < 16 && !hit; k++) {
		await lb.page.keyboard.press(k === 0 ? 'ArrowDown' : k % 2 ? 'ArrowUp' : 'ArrowRight');
		await sleep(80);
		hit = await lb.page.evaluate(() => { const f = window.__scoundrel.focus(); return !!(f && f.classList.contains('b-lb-watch')); });
	}
	A(hit, 'the keyboard reticle reaches the Watch link');
	if (hit) {
		await lb.page.keyboard.press('z');
		A(await waitFor(() => lb.page.evaluate((w) => location.pathname + location.search === w, want), 10000), 'Z on the Watch link opens the replay');
	}
	for (const [n, p] of [['alice', alice], ['bob', bob], ['bob board', lb]]) A(!p.errors.length, `${n}: no page errors`, p.errors.slice(0, 3).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
