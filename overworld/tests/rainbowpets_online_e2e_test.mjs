// rainbowpets_online_e2e_test.mjs — RAINBOW PETS with accounts, end to end: the REAL server handler (server/mp.mjs,
// bundled like the dev server, over sqlite) behind a static server, headless browsers.
//   1. Watching: alice plays the computer signed in; bob (her friend) sees her live, opens /rainbowpets/?spectate=alice
//      and his table follows hers (named "alice", never "You", with no buttons to play); her win reaches him with its
//      replay, and she drops off the live list.
//   2. Online: alice makes a match in the page (Play Online, Make a match, a team), bob joins with its code and is
//      ready, alice starts it: both pages show the table the SERVER plays, each with only their own hand; a Pass on one
//      page moves the turn on the other; carol (alice's friend) watches alice's online match; bob gives up and alice's
//      page pays the online win in stars.
//   node overworld/tests/rainbowpets_online_e2e_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';
import { RPVP_PROTOCOL } from '../../server/rpets_pvp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8673;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-rpets-e2e-')), 'mp.bundle.mjs');
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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.wasm': 'application/wasm' };
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
await new Promise((r) => server.listen(PORT, r));

const tokens = {};
for (const n of ['alice', 'bob', 'carol']) tokens[n] = (await call('register', { username: n, password: 'rpets-e2e-pass' })).token;
for (const [a, b] of [['alice', 'bob'], ['bob', 'alice'], ['alice', 'carol'], ['carol', 'alice']]) await call('add-friend', { username: b }, tokens[a]);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; alice is friends with bob and with carol');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--mute-audio', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
	const open = async (who, url) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tok, st) => {
			try { localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0'); localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); } catch { /* ignore */ }
		}, tokens[who], st);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		const t = { ctx, page, errors };
		t.ready = () => waitFor(() => page.evaluate(() => !!(window.__rpets && window.__rpets.ready)), 30000);
		t.V = () => page.evaluate(() => { const V = window.__rpets.view(); return V && { seed: V.seed, me: V.me, cur: V.cur, n: V.n, turn: V.turn, over: V.over, hands: V.players.map((p) => (p.hand ? p.hand.length : null)), names: V.players.map((p) => p.name) }; });
		t.has = (sel) => page.evaluate((s) => !!document.querySelector(s), sel);
		t.text = () => page.evaluate(() => document.body.innerText);
		t.click = async (sel) => { const ok = await waitFor(() => page.evaluate((s) => { const e = document.querySelector(s); return !!e && !e.disabled; }, sel), 8000); if (!ok) return false; await page.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel); const c = await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; }, sel); await page.mouse.click(c[0], c[1]); await sleep(300); return true; };
		return t;
	};

	// ---------------- 1. a friend watches a match against the computer
	{
		const alice = await open('alice', '/rainbowpets/');
		A(await alice.ready(), 'alice: the page is ready (signed in)');
		await alice.page.evaluate(() => window.__rpets.startLocal({ seed: 'e2e-watch', seats: [{ name: 'alice', pets: ['p10', 'p3', 'p5', 'p4'] }, { name: 'Pip', pets: ['p2', 'p6', 'p11'], cpu: 'easy' }] }, { mode: 'quick' }));
		const listed = await waitFor(async () => ((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice' && f.kind === 'rpets'), 12000);
		A(listed, "bob's live list shows alice playing Rainbow Pets (kind 'rpets')");
		const fr = (await call('friends', {}, tokens.bob)).friends.find((f) => f.username === 'alice');
		A(fr && /^rpets:Turn \d+ · alice 0\/3 · Pip 0\/3$/.test(fr.status), "alice's presence says what she is doing: 'rpets:Turn 1 · alice 0/3 · Pip 0/3'", fr && fr.status);
		const bob = await open('bob', '/rainbowpets/?spectate=alice');
		A(await bob.ready(), 'bob: the spectate page is ready');
		A(await waitFor(async () => { const v = await bob.V(); return v && v.seed === 'e2e-watch'; }, 12000), "bob's table shows alice's match");
		const heads = await bob.page.evaluate(() => [...document.querySelectorAll('.rp-board-head b')].map((b) => b.textContent));
		A(heads.includes('alice') && !heads.includes('You') && !(await bob.has('.b-pass')) && !(await bob.has('.b-menu')), 'bob reads "alice", never "You", and has no buttons to play her match', heads);
		// alice plays: Sunset to the Canvas, then pass; bob follows
		await alice.page.evaluate(() => window.__rpets.act({ t: 'move', pet: 'a0' }));
		const n1 = (await alice.V()).n;
		A(await waitFor(async () => { const v = await bob.V(); return v && v.n >= n1; }, 12000), "bob's table follows alice's moves", [n1, (await bob.V()).n]);
		// alice wins (two of hers already on the Canvas, a third moves)
		await alice.page.evaluate(() => {
			const { M, R } = window.__rpets, S = M.S, me = R.playerOf(S, 'a');
			S.cur = 0; S.used = {}; S.pending = null; S.phase = 'play';
			S.canvas.O = ['a0']; S.canvas.P = ['a2']; me.palette = [[], ['a1'], []];
			const g = me.deck.findIndex((c) => S.cards[c].c === 'G'); S.pets.a1.slots[1].push(me.deck.splice(g, 1)[0]);
			window.__rpets.refresh();
		});
		await alice.page.evaluate(() => window.__rpets.act({ t: 'move', pet: 'a1' }));
		A(await waitFor(() => alice.has('.b-watch'), 5000), 'alice wins');
		A(await waitFor(async () => /alice wins/.test(await bob.text()) && await bob.has('.b-watch'), 15000), 'the win reaches bob ("alice wins") with its replay to watch');
		const href = await bob.page.evaluate(() => { const b = document.querySelector('.b-watch'); return b && b.textContent; });
		A(!!href, 'bob is offered the replay');
		A(await waitFor(async () => !((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice'), 12000), 'alice drops off the live list when the match is over');
		A(!alice.errors.length && !bob.errors.length, 'no page errors (watching)', [...alice.errors, ...bob.errors].slice(0, 3));
		await alice.ctx.close(); await bob.ctx.close();
	}

	// ---------------- 2. an online match the server plays
	{
		const alice = await open('alice', '/rainbowpets/');
		const bob = await open('bob', '/rainbowpets/');
		await alice.ready(); await bob.ready();
		await alice.click('.b-online');
		A(await alice.click('.b-create'), 'alice: Play Online, Make a match');
		await alice.click('.b-random');
		await alice.click('.b-start');
		A(await waitFor(() => alice.page.evaluate(() => /Code: [A-Z2-9]{5}/.test(document.body.innerText)), 8000), 'her lobby shows its code');
		const code = await alice.page.evaluate(() => document.body.innerText.match(/Code: ([A-Z2-9]{5})/)[1]);
		const j = await call('rpvp-join', { pv: RPVP_PROTOCOL, code, team: ['p20', 'p21', 'p22'] }, tokens.bob);
		A(j.lobby && j.lobby.players.length === 2, 'bob joins with the code', j);
		await bob.click('.b-online');
		A(await bob.click('.b-ready'), "bob's page finds his lobby again, and he is ready");
		A(await alice.click('.b-start-online'), 'alice starts the match');
		const both = await waitFor(async () => { const a = await alice.V(), b = await bob.V(); return a && b && a.seed === b.seed && a.me === 'a' && b.me === 'b'; }, 15000);
		A(both, 'both pages show the same match, alice in seat a and bob in seat b');
		const a0 = await alice.V(), b0 = await bob.V();
		A(a0.hands[0] > 0 && a0.hands[1] === null && b0.hands[1] > 0 && b0.hands[0] === null, 'each sees only their own hand', [a0.hands, b0.hands]);
		const mover = a0.cur === 'a' ? alice : bob, other = a0.cur === 'a' ? bob : alice;
		A(await mover.click('.b-pass'), 'whoever is first presses Pass');
		A(await waitFor(async () => { const v = await other.V(); return v && v.cur !== a0.cur; }, 10000), 'the turn moves on the other page too');
		// carol watches alice's online match
		const carol = await open('carol', '/rainbowpets/?spectate=alice');
		await carol.ready();
		A(await waitFor(async () => { const v = await carol.V(); return v && v.seed === a0.seed; }, 15000), "carol (alice's friend) watches alice's online match");
		// bob gives up: alice wins online, and is paid stars
		A(await waitFor(() => alice.page.evaluate(() => window.__rpets.wallet() === 8 && document.getElementById('rp-stars') && document.getElementById('rp-stars').textContent === '8'), 10000), 'a signed-in page opens with the account wallet (the 8 stars alice won on her other device)');
		const before = await alice.page.evaluate(() => window.__rpets.wallet());
		await bob.click('.b-menu');
		await bob.click('.b-giveup');
		A(await waitFor(() => alice.has('.b-lobby'), 15000) && /You win!/.test(await alice.text()), 'bob leaves: alice wins, and is offered the lobby again');
		const after = await alice.page.evaluate(() => window.__rpets.wallet());
		const { ONLINE_WIN } = await alice.page.evaluate(async () => ({ ONLINE_WIN: (await import('/rainbowpets/js/main.js')).ONLINE_WIN }));
		A(after === before + ONLINE_WIN && ONLINE_WIN > 0, `an online win pays ${ONLINE_WIN} stars (${before} to ${after})`, [before, after]);
		// (regression: Back to the lobby went straight back into the finished match, its end screen again)
		await alice.click('.b-lobby');
		A(await waitFor(() => alice.has('.b-start-online'), 6000) && (await sleep(3500), !(await alice.has('.rp-modal'))) && !(await alice.has('.rp-canvas')) && /Code: [A-Z2-9]{5}/.test(await alice.text()), 'Back to the lobby: the lobby, and it stays there (the finished match is not shown again)');
		A(!alice.errors.length && !bob.errors.length && !carol.errors.length, 'no page errors (online)', [...alice.errors, ...bob.errors, ...carol.errors].slice(0, 3));
		await alice.ctx.close(); await bob.ctx.close(); await carol.ctx.close();
	}
	// ---------------- 3. Tag-Team online: alice and bob on opposite teams, each with a computer partner
	{
		const alice = await open('alice', '/rainbowpets/');
		const bob = await open('bob', '/rainbowpets/');
		await alice.ready(); await bob.ready();
		await alice.click('.b-online');
		if (await waitFor(() => alice.has('.b-leave'), 4000)) { await alice.click('.b-leave'); await alice.click('.b-online'); }   // (her last lobby first: she leaves it)
		await waitFor(() => alice.has('.b-tag'), 6000);
		await alice.click('.b-tag');
		A(await alice.has('.b-split-apart') && await alice.has('.b-split-together'), 'Play Online: Tag-Team 2v2, and where the friends sit');
		await alice.click('.b-split-apart'); await alice.click('.b-cpus-2');
		await alice.click('.b-create'); await alice.click('.b-random'); await alice.click('.b-start');
		A(await waitFor(() => alice.page.evaluate(() => /Tag-Team 2v2 \(friends against each other\)/.test(document.body.innerText) && /Team 1: alice & a computer · Team 2: an open seat & a computer/.test(document.body.innerText)), 8000), 'her lobby: Tag-Team, and who partners whom', await alice.text());
		const code = await alice.page.evaluate(() => document.body.innerText.match(/Code: ([A-Z2-9]{5})/)[1]);
		const j = await call('rpvp-join', { pv: RPVP_PROTOCOL, code, team: ['p30', 'p31', 'p32'] }, tokens.bob);
		A(j.lobby && j.lobby.tag && j.lobby.players.length === 2, 'bob joins with the code', j);
		await bob.click('.b-online');
		await bob.click('.b-ready');
		A(await waitFor(() => alice.page.evaluate(() => /Team 2: bob & a computer/.test(document.body.innerText)), 8000), "alice's lobby seats bob on the other team");
		await alice.click('.b-start-online');
		A(await waitFor(async () => { const a = await alice.V(), b = await bob.V(); return a && b && a.seed === b.seed && a.me === 'a' && b.me === 'c'; }, 15000), 'the match: alice in seat a, bob in seat c');
		A(await alice.page.evaluate(() => { const V = window.__rpets.view(); return JSON.stringify(V.teams) === '[["a","b"],["c","d"]]' && V.players[1].cpu && V.players[3].cpu && /your partner/.test(document.querySelector('.rp-board.is-partner').textContent) && document.querySelector('.rp-board.is-partner').dataset.seat === 'b'; }), "alice's computer partner (seat b) is marked as her partner");
		await bob.click('.b-menu'); await bob.click('.b-giveup');
		A(await waitFor(() => alice.page.evaluate(() => { const V = window.__rpets.view(); return V && V.players[2].out && !V.over; }), 15000), 'bob leaves: he is out, and the match goes on (his computer partner plays on)');
		A(!alice.errors.length && !bob.errors.length, 'no page errors (Tag-Team online)', [...alice.errors, ...bob.errors].slice(0, 3));
		await alice.ctx.close(); await bob.ctx.close();
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
