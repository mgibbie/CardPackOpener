// pocketenhanced_spectate_e2e_test.mjs — a friend watches a live Pocket Enhanced match, end to end, the way Micatro /
// Scoundrel / Pair of Pears spectating works: the REAL server handler (server/mp.mjs, bundled like the dev server, over
// sqlite) behind a static server, headless browsers:
//   alice plays /pocketenhanced/ signed in (publisher: publish-pocket, presence 'pocket:<label>'),
//   bob watches /pocketenhanced/?spectate=alice (pocket-state).
// Asserts bob's table converges on alice's after her turns and the computer players', bob is never sent anybody's
// hand or any deck (not in the page, not in the server's row), a spectator can read a card and change nothing, the
// watcher count reaches alice, bob's Live now hub routes Watch here, a stranger can't watch, and the end of the match
// reaches bob and drops alice off the live list.
//   node overworld/tests/pocketenhanced_spectate_e2e_test.mjs      (screenshots: POCKET_SHOTS=<dir>)
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
const SHOTS = process.env.POCKET_SHOTS || null;
const PORT = 8672;
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pocket-e2e-')), 'mp.bundle.mjs');
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
for (const n of ['alice', 'bob', 'carol', 'dave']) tokens[n] = (await call('register', { username: n, password: 'pocket-e2e-pass' })).token;
await call('add-friend', { username: 'alice' }, tokens.bob);
await call('add-friend', { username: 'bob' }, tokens.alice);
A(tokens.alice && tokens.bob && tokens.carol, 'three real accounts; alice and bob are friends');
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };

// ---------- the server actions on their own ----------
{
	const pub = await call('publish-pocket', { seq: 1, label: 'Pocket Enhanced · Turn 1 · 0–0', snapshot: { game: 'pocket', n: 0, you: 0, view: { players: [] } } }, tokens.carol);
	A(pub.ok, 'publish-pocket accepts a signed-in player');
	const strangers = await call('pocket-state', { username: 'carol' }, tokens.alice);
	A(strangers.error && /friend/.test(strangers.error), "a stranger can't read the match (friends only)", JSON.stringify(strangers));
	const anon = await call('publish-pocket', { seq: 1, label: 'x' });
	A(!!anon.error, 'publishing needs an account', JSON.stringify(anon));
	A((await call('micatro-state', { username: 'carol' }, tokens.carol)).snapshot == null && (await call('pears-state', { username: 'carol' }, tokens.carol)).snapshot == null && !!sqlite.prepare("SELECT key FROM mp_store WHERE key = 'pocketstate:carol'").get(), 'a Pocket Enhanced match has its own row (not a Micatro or Pair of Pears run)');
	await call('publish-pocket', { seq: 2, label: 'x', over: true }, tokens.carol);
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
	const ready = (page) => waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
	// what both tables must agree on: every Pokémon in play, the points, whose turn, the counts, the last log line
	const sig = (page) => page.evaluate(() => {
		const v = window.__pocket.view(); if (!v) return null;
		const k = (x) => (x ? [x.id, x.dmg, x.energy.join(''), x.status.join('')] : 0);
		return JSON.stringify({ ph: v.phase, t: v.turn, c: v.current, o: v.over && v.over.winner, p: v.players.map((p) => [p.points, p.eliminated, p.handCount, p.deck, p.discard.length, p.active.map(k), p.bench.map(k)]), l: v.log.length ? v.log[v.log.length - 1].n : -1 });
	});
	const drawn = (page) => page.evaluate(() => [...document.querySelectorAll('.pe-table .pe-poke:not(.empty)')].map((e) => e.dataset.k + '=' + e.querySelector('.hpn').textContent).sort().join(','));

	// alice starts a 3-player match (signed in) and sets up
	const alice = await open('alice', '/pocketenhanced/?seed=live-a');
	A(await ready(alice.page), 'alice: game ready (signed in)');
	await alice.page.evaluate(async () => {
		const P = window.__pocket; P.fast(); P.start({ players: 3, starter: 'charizard' });
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		P.act(nextAction(P.engine.view(P.state(), 0)));
	});
	A(await alice.page.evaluate(() => window.__pocket.live().publishing), 'a signed-in player\'s match is broadcast');
	const live = await waitFor(async () => { const r = await call('live-friends', {}, tokens.bob); return (r.live || []).some((f) => f.username === 'alice' && f.kind === 'pocket' && /^Pocket Enhanced · /.test(f.label)); }, 12000);
	A(live, "bob's live-friends lists alice with kind 'pocket' and her progress label", JSON.stringify(await call('live-friends', {}, tokens.bob)).slice(0, 300));
	const af = ((await call('friends', {}, tokens.bob)).friends || []).find((f) => f.username === 'alice');
	A(af && /^pocket:Pocket Enhanced · /.test(af.status), "alice's presence status is 'pocket:<label>' (the top bar's Friends tab)", JSON.stringify(af));
	A(!((await call('live-friends', {}, tokens.carol)).live || []).some((f) => f.username === 'alice'), "a stranger's live list doesn't show alice");

	// what the server holds for spectators has nobody's hand and no deck
	const raw = await call('pocket-state', { username: 'alice' }, tokens.bob);
	A(raw.snapshot && raw.snapshot.view.players.length === 3 && raw.snapshot.view.players.every((p) => p.hand === null && typeof p.deck === 'number' && p.handCount >= 0), 'the published view has no hand (not even the player\'s own) and only the SIZE of each deck');

	// bob watches
	const bob = await open('bob', '/pocketenhanced/?spectate=alice');
	A(await ready(bob.page), 'bob: spectator ready');
	const conv = async (label) => {
		let target = null;
		const ok = await waitFor(async () => { target = await sig(alice.page); return (await sig(bob.page)) === target; }, 20000);
		A(ok, `bob converges on alice's table: ${label}`, ok ? '' : `\n   alice ${target}\n   bob   ${await sig(bob.page)}`);
		const same = await waitFor(async () => (await drawn(bob.page)) === (await drawn(alice.page)), 8000);
		A(same, `bob's table draws the same Pokémon and HP as alice's: ${label}`, same ? '' : (await drawn(alice.page)) + '\n vs ' + (await drawn(bob.page)));
		A(await bob.page.evaluate(() => window.__pocket.view().players.every((p) => p.hand === null) && !document.querySelector('.pe-hand .pe-card')), `bob has nobody's hand: ${label}`);
	};
	// (alice's turn: the computer players have stopped, so the table is still)
	const aliceTurn = () => waitFor(() => alice.page.evaluate(() => { const S = window.__pocket.state(); return S.over || (window.__pocket.idle() && ((S.pending && S.pending.seat === 0) || (!S.pending && S.current === 0))); }), 20000);
	await aliceTurn();
	await conv('the opening');
	A(await bob.page.evaluate(() => /Watching alice/.test(document.querySelector('.pe-cmd h3').textContent) && !document.querySelector('.modal') && !document.querySelector('[data-k="exec"]') && !document.querySelector('[data-k="ready"]')), 'the spectator shows "Watching alice": no menu, no Execute');
	A(await bob.page.evaluate(() => { const b = document.querySelector('.pe-me .pe-head .nm').textContent; return /alice/.test(b); }), "alice's seat is at the bottom of bob's table, as on hers");
	{
		// a spectator can read a card, and can do nothing else
		const before = await sig(alice.page);
		await bob.page.evaluate(() => { const e = document.querySelector('.pe-table .pe-poke:not(.empty)'); e.click(); });
		const insp = await bob.page.evaluate(() => ({ text: document.querySelector('.pe-insp')?.textContent || '', acts: document.querySelectorAll('.modal .pe-opt').length, acted: window.__pocket.act({ t: 'execute', seat: 0, commands: [null, null] }) }));
		await bob.page.keyboard.press('Escape'); await sleep(800);
		A(/Combat Type/.test(insp.text) && insp.acts === 0 && insp.acted === false && (await sig(alice.page)) === before, 'a spectator can read a card; nothing they press or send changes the match', JSON.stringify(insp).slice(0, 200));
	}
	if (SHOTS) { await sleep(600); await bob.page.screenshot({ path: path.join(SHOTS, 'spectator_desktop.png') }); }

	// alice plays turns (her seat by the computer player's rules, through the page's own action entry)
	const aliceTurns = (n) => alice.page.evaluate(async (turns) => {
		const { nextAction } = await import('/pocketenhanced/js/ai.js');
		const P = window.__pocket, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
		let done = 0;
		for (let i = 0; i < 20000 && done < turns; i++) {
			const S = P.state(); if (!S || S.over) return 'over';
			const mine = (S.pending && S.pending.seat === 0) || (!S.pending && S.phase === 'main' && S.current === 0);
			if (!mine || S.players[0].eliminated) { await sleep(5); continue; }
			const banned = new Set(); let ok = false, a = null;
			for (let t = 0; t < 40 && !ok; t++) { a = nextAction(P.engine.view(P.state(), 0), banned) || { t: 'execute', seat: 0, commands: [null, null] }; ok = P.act(a); if (!ok) banned.add(JSON.stringify(a)); }
			if (!ok) return 'stuck';
			if (a.t === 'execute') done++;
		}
		return done;
	}, n);
	await aliceTurns(1); await aliceTurn();
	await conv('after alice\'s turn and the computer players\' replies');
	A(await bob.page.evaluate(() => /Resolved in order: A, then B/.test(document.querySelector('.pe-log').textContent)), "bob's battle log has the Execute lines");
	const badge = await waitFor(() => alice.page.evaluate(() => /1 watching/.test((document.querySelector('.pe-watch') || {}).textContent || '')), 15000);
	A(badge, "alice's table shows 1 watching");
	await aliceTurns(2); await aliceTurn();
	await conv('two turns later');
	A(await waitFor(async () => ((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice' && /Turn [4-9]|Turn \d\d/.test(f.label)), 12000), "the live list follows alice's progress (the turn number)");

	// the hub's Live now list routes Watch to this game's spectator
	const hub = await open('bob', '/battlecards/start.html');
	const link = await waitFor(() => hub.page.evaluate(() => [...document.querySelectorAll('a,button')].some((el) => (el.getAttribute('href') || el.dataset.href || '').includes('/pocketenhanced/?spectate=alice'))), 15000);
	A(link, "bob's Live now hub has a Watch link to /pocketenhanced/?spectate=alice");
	A(await hub.page.evaluate(() => /Playing Pocket Enhanced/.test(document.body.innerText)), 'the hub says "Playing Pocket Enhanced"');

	// a phone spectator sees the table too
	const bobPhone = await open('bob', '/pocketenhanced/?spectate=alice', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await ready(bobPhone.page);
	A(await waitFor(async () => (await sig(bobPhone.page)) === (await sig(alice.page)), 20000), 'a phone spectator converges too');
	if (SHOTS) { await sleep(900); await bobPhone.page.screenshot({ path: path.join(SHOTS, 'spectator_phone.png') }); }

	// a stranger is told why they see nothing
	const carol = await open('carol', '/pocketenhanced/?spectate=alice');
	await ready(carol.page);
	A(await waitFor(() => carol.page.evaluate(() => /Only friends can watch/.test(document.body.innerText) && !window.__pocket.view()), 10000), 'a stranger opening the link sees "Only friends can watch" and no table');

	// the match ends for everyone
	const end = await aliceTurns(400);
	A(end === 'over' && await alice.page.evaluate(() => !!window.__pocket.state().over), 'alice: the match plays to its end', String(end));
	const bobOver = await waitFor(() => bob.page.evaluate(() => { const v = window.__pocket.view(); return !!(v && v.over) && /wins|No winner/.test(document.querySelector('.pe-cmd .q').textContent); }), 20000);
	A(bobOver, 'bob sees the match end and who won');
	if (SHOTS) await bob.page.screenshot({ path: path.join(SHOTS, 'spectator_desktop_over.png') });
	const gone = await waitFor(async () => !((await call('live-friends', {}, tokens.bob)).live || []).some((f) => f.username === 'alice'), 15000);
	A(gone, "a finished match drops off bob's live list");
	const presOff = await waitFor(async () => { const f = ((await call('friends', {}, tokens.bob)).friends || []).find((x) => x.username === 'alice'); return f && !String(f.status || '').startsWith('pocket:'); }, 10000);
	A(presOff, "alice's presence goes back to plain online");
	// ---------- the collection is on the account: the same cards on every device ----------
	{
		const col = (p) => p.page.evaluate(() => { const c = window.__pocket.collection(); return { packs: c.packs, opened: c.opened, n: Object.values(c.prints).reduce((x, y) => x + y, 0), sync: window.__pocket.sync() }; });
		const acct = (u) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get('pkcol:' + u); return r ? JSON.parse(r.value).col : null; };
		const sum = (c) => (c ? Object.values(c.prints).reduce((x, y) => x + y, 0) : -1);
		// (press a button where it has come to rest and is under the pointer; a press that did nothing is pressed again)
		const press = async (p, sel, done) => {
			for (let i = 0; i < 4; i++) {
				let prev = null, same = 0, b = null;
				for (let k = 0; k < 60; k++) {
					const e = await p.page.$(sel); b = e && await e.boundingBox();
					same = b && prev && Math.abs(b.x - prev.x) < 0.5 && Math.abs(b.y - prev.y) < 0.5 ? same + 1 : 0;
					if (same >= 2 && await p.page.evaluate((q, x, y) => { const el = document.querySelector(q), t = document.elementFromPoint(x, y); return !!el && !!t && (t === el || el.contains(t)); }, sel, b.x + b.width / 2, b.y + b.height / 2)) break;
					prev = b; await sleep(40);
				}
				if (b) await p.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
				if (await waitFor(() => p.page.evaluate(done), 2500)) return true;
			}
			return false;
		};
		const openPack = async (p, k) => {   // through the page's own buttons
			await p.page.evaluate(() => { window.__pocket.menu(); });
			await press(p, '.modal:last-child [data-k="packs"]', () => document.querySelectorAll('.pe-pack').length === 3);
			await press(p, '.modal:last-child [data-k="pack' + k + '"]', () => document.querySelectorAll('.pe-pull.down').length === 5);
			await press(p, '.modal:last-child [data-k="flipall"]', () => !document.querySelector('.pe-pull.down'));
		};
		const dave1 = await open('dave', '/pocketenhanced/?seed=col-1'); await ready(dave1.page);
		A(await waitFor(async () => (await col(dave1)).sync === 'saved' && !!acct('dave'), 10000), "a signed-in player's new collection is saved to the account", await col(dave1));
		await openPack(dave1, 'C');
		A(await waitFor(() => { const a = acct('dave'); return !!a && a.opened === 1 && sum(a) === 19 && a.packs === 9; }, 10000), 'a pack opened on one device reaches the account', acct('dave'));
		const dave2 = await open('dave', '/pocketenhanced/?seed=col-2'); await ready(dave2.page);
		A(await waitFor(async () => { const c = await col(dave2); return c.opened === 1 && c.n === 19 && c.packs === 9 && c.sync === 'saved'; }, 10000), 'a second device signed in as the same player has the same cards and packs (not a second new-player grant)', await col(dave2));
		// both devices open a pack, neither having seen the other's
		await openPack(dave2, 'M'); await openPack(dave1, 'P');
		A(await waitFor(() => { const a = acct('dave'); return !!a && a.opened === 3 && sum(a) === 29 && a.packs === 7; }, 15000), 'a pack opened on each device: the account has both (neither device overwrote the other)', acct('dave'));
		await dave1.page.reload({ waitUntil: 'domcontentloaded' }); await ready(dave1.page);
		A(await waitFor(async () => { const c = await col(dave1); return c.opened === 3 && c.n === 29 && c.packs === 7; }, 10000), 'after a reload the first device shows all three packs', await col(dave1));
		A(await dave1.page.evaluate(() => { window.__pocket.menu(); return true; }) && await press(dave1, '.modal:last-child [data-k="collection"]', () => /Saved to your account/.test(document.querySelector('.pe-sync')?.textContent || '')), 'the Collection says it is saved to the account');
		const guestPage = { page: await (await browser.createBrowserContext()).newPage(), errors: [] };
		guestPage.page.on('pageerror', (e) => guestPage.errors.push('pageerr: ' + e.message));
		await guestPage.page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=col-g`, { waitUntil: 'domcontentloaded' }); await ready(guestPage.page);
		await sleep(1500);
		A((await col(guestPage)).sync === 'guest' && (await col(guestPage)).packs === 10, 'a guest still has a collection, kept on the device', await col(guestPage));
		for (const [n, p] of [['dave', dave1], ['dave 2', dave2], ['guest', guestPage]]) A(!p.errors.length, `${n}: no page errors`, p.errors.slice(0, 3).join(' | '));
	}
	for (const [n, p] of [['alice', alice], ['bob', bob], ['bob phone', bobPhone], ['carol', carol]]) A(!p.errors.length, `${n}: no page errors`, p.errors.slice(0, 3).join(' | '));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
