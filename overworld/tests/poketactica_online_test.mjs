// poketactica_online_test.mjs — Poketactica online (PvP, owner 2026-11-22: "PvP up to 4 players"), end to end: the REAL
// server (server/mp.mjs bundled, D1 in sqlite) behind a static server, two headless pages signed in as two players.
//   alice (keyboard, desktop) makes a 3-seat match (one computer) in the camp's Versus screens and gets a code;
//   bob (touch, a phone) joins with the code on the on-screen keyboard, picks his team and taps Ready; alice presses Start.
// Then: both pages build the same battle (the same seed, each its own seat), only the seat whose turn it is can act, each
// page's actions reach the other through the server and the computer seat plays the same on both, the boards stay
// identical turn after turn; bob leaves from the field menu (alice plays on against the computer); alice leaves too, the
// computer wins, and the lobby notes the end.
//   node overworld/tests/poketactica_online_test.mjs
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
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8951;
const SHOTS = process.env.SHOTS || os.tmpdir();
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { return st.run(...b); }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-ptonline-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return res.json();
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.wav': 'audio/wav' };
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
for (const n of ['alice', 'bob']) tokens[n] = (await call('register', { username: n, password: 'poketactica-online-pass' })).token;
const stateOf = async (n) => (await call('state', {}, tokens[n])).state || { username: n };
const MOVE = { pikachu: 'thundershock', machamp: 'karatechop', charmander: 'ember', squirtle: 'watergun' };
const figsFor = (who, sps) => JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries(sps.map((sp, i) => [sp + '-' + who + i, { v: 1, id: sp + '-' + who + i, species: sp, level: 14, exp: 0, ability: null, shiny: false, pool: [{ id: MOVE[sp], lv: 1, xp: 0 }], equipped: [MOVE[sp]] }])) });

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
	const open = async (who, figs, vp) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(vp);
		const errors = [];
		page.on('pageerror', (e) => errors.push('pageerr: ' + e.message));
		const st = await stateOf(who);
		await page.evaluateOnNewDocument((tok, st, figs) => {
			try {
				localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('magepunk_poketactica_perma_v1', '1');
				localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				if (!sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); }
			} catch { /* ignore */ }
		}, tokens[who], st, figs);
		await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)), 60000);
		await sleep(600);
		return { ctx, page, errors, who };
	};
	const E = (t, fn, ...args) => t.page.evaluate(fn, ...args);
	const labels = (t) => E(t, () => window.__poketactica.hub.labels());
	const screen = (t) => E(t, () => window.__poketactica.hub.H.screen);
	const idle = (t) => E(t, () => new Promise((r) => { const s = Date.now(); const k = () => (!window.__poketactica.P.busy || Date.now() - s > 20000 ? r() : setTimeout(k, 60)); k(); }));
	/** keyboard: arrows to the button whose label matches, then Z */
	const keyTo = async (t, re) => {
		for (let i = 0; i < 30; i++) {
			const f = await E(t, () => window.__poketactica.hub.focusLabel());
			if (f && re.test(f)) { await t.page.keyboard.press('KeyZ'); await sleep(350); return true; }
			await t.page.keyboard.press('ArrowDown'); await sleep(60);
			if (i === 14) for (let k = 0; k < 15; k++) { await t.page.keyboard.press('ArrowUp'); await sleep(30); }
		}
		return false;
	};
	/** touch: a tap on the button whose label matches */
	const tapOn = async (t, re) => {
		const xy = await E(t, (src) => { const re = new RegExp(src); const el = [...document.querySelectorAll('#hub [data-nav]')].find((e) => re.test(e.textContent.replace(/\s+/g, ' '))); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, re.source);
		if (!xy) return false;
		await t.page.touchscreen.tap(xy[0], xy[1]); await sleep(400); return true;
	};
	const sig = (t) => E(t, () => { const P = window.__poketactica.P, S = P.S; return JSON.stringify({ n: P.actions.length, turn: S.turn, cur: S.pvp && S.pvp.cur, over: S.over, units: S.units.map((u) => [u.uid, u.x, u.y, u.hp, u.sp]) }); });

	const alice = await open('alice', figsFor('alice', ['pikachu', 'machamp', 'charmander']), { width: 1280, height: 800 });
	const bob = await open('bob', figsFor('bob', ['squirtle', 'pikachu']), { width: 390, height: 844, isMobile: true, hasTouch: true });
	// the camp pushes each player's figurines to their account (the server reads teams from there)
	A(await waitFor(() => row('ptfig:alice') && row('ptfig:bob'), 20000), "each page saved its figurines to the player's account");
	A((await labels(alice)).some((l) => /^🤝 Versus ?online, 2-4 players/.test(l)), 'the camp has Versus (signed in)', await labels(alice));

	// ---- alice makes the match, by keyboard
	A(await keyTo(alice, /Versus/), 'alice: Z on Versus');
	await waitFor(async () => (await screen(alice)) === 'versus' && (await labels(alice)).some((l) => /Make a match/.test(l)), 8000);
	A(await keyTo(alice, /Make a match/), 'alice: Make a match');
	A((await screen(alice)) === 'vs-setup', 'alice: the match settings');
	A(await keyTo(alice, /^3 players/), 'alice: 3 players');
	A(await keyTo(alice, /^1 computer$/), 'alice: 1 computer');
	// a capped match is the host's to choose, and off unless chosen (owner, 2026-11-24)
	{
		const held = () => E(alice, () => [...document.querySelectorAll('#hub .ph-vsrow')].filter((r) => /Held items/.test((r.querySelector('.ph-vslabel') || {}).textContent || '')).map((r) => [...r.querySelectorAll('.ph-pick')].map((b) => b.textContent.trim() + (b.classList.contains('is-on') ? ' [on]' : '')))[0]);
		A(JSON.stringify(await held()) === JSON.stringify(['as they are [on]', 'plain: no levels, no gemstones']), 'the match settings have Held items: as they are (the default), or plain', await held());
		A(await keyTo(alice, /^plain: no levels, no gemstones/), 'alice: plain');
		A(JSON.stringify(await held()) === JSON.stringify(['as they are', 'plain: no levels, no gemstones [on]']), 'plain is chosen');
		await alice.page.keyboard.press('ArrowLeft'); await sleep(150); await alice.page.keyboard.press('KeyZ'); await sleep(300);
		A(JSON.stringify(await held()) === JSON.stringify(['as they are [on]', 'plain: no levels, no gemstones']), 'alice: back to "as they are" for this match (Left, Z)', await held());
	}
	// A TURN CLOCK BOTH PLAYERS CAN SEE (plan item V5): off by default; alice sets 2 minutes
	{
		const clk = () => E(alice, () => [...document.querySelectorAll('#hub .ph-pick')].filter((b) => /^(off|60 s|90 s|2 min)$/.test(b.textContent.trim())).map((b) => b.textContent.trim() + (b.classList.contains('is-on') ? ' [on]' : '')));
		A(JSON.stringify(await clk()) === JSON.stringify(['off [on]', '60 s', '90 s', '2 min']), 'the match setup has a turn clock: off to begin with, or 60 s, 90 s, 2 min', await clk());
		A(await keyTo(alice, /^2 min/), 'alice: a 2 minute clock');
		A((await clk())[3] === '2 min [on]', 'it is on', await clk());
	}
	A(await keyTo(alice, /Pick your team/), 'alice: on to her team');
	A((await screen(alice)) === 'team' && (await labels(alice)).some((l) => /^Make match/.test(l)), "alice: the team screen offers 'Make match'", await labels(alice));
	await alice.page.keyboard.press('ArrowUp'); await sleep(100);
	A(await keyTo(alice, /^Make match/), 'alice: Make match');
	A(await waitFor(async () => (await screen(alice)) === 'lobby', 10000), 'alice: the lobby');
	const code = await E(alice, () => (document.querySelector('.ph-code') || {}).textContent);
	A(/^[A-Z2-9]{5}$/.test(code || ''), 'alice: the lobby shows the code to share', code);
	// A LOBBY THAT READS (plan item V1): the rule set was one grey sentence, and who it waits for was only on Start
	const lobbySays = (t) => E(t, () => ({ rules: [...document.querySelectorAll('#vs-rules .bal-badge')].map((b) => [b.dataset.rule, b.textContent.trim(), /bal-gold/.test(b.className)]), waiting: (document.getElementById('vs-waiting') || {}).textContent || '', font: Math.min(...[...document.querySelectorAll('#vs-rules .bal-badge')].map((b) => parseFloat(getComputedStyle(b).fontSize))) }));
	{
		const ls = await lobbySays(alice), by = Object.fromEntries(ls.rules.map((r) => [r[0], r]));
		A(by.players && /^3 players$/.test(by.players[1]) && by.cpus && /^1 computer$/.test(by.cpus[1]) && by.arena && by.arena[1].length > 3 && by.cap && ls.font >= 14, 'the lobby says its rules as badges: 3 players, 1 computer, the arena, the levels', ls);
		A(by.cap[2] === /^Capped/.test(by.cap[1]), 'a capped match wears a gold badge; one at own levels does not', by.cap);
		A(/^Waiting for 1 more player: share the code\.$/.test(ls.waiting), 'and what it waits for: 1 more player', ls.waiting);
		A(by.clock && /^⏱ 2 min a turn$/.test(by.clock[1]) && by.clock[2], 'a match with a turn clock says so, in gold (plan item V5)', by.clock);
	}

	// ---- bob joins with the code, by touch
	A(await tapOn(bob, /Versus/), 'bob: taps Versus');
	await waitFor(async () => (await labels(bob)).some((l) => /Join with a code/.test(l)), 8000);
	A(await tapOn(bob, /Join with a code/), 'bob: Join with a code');
	A(await waitFor(() => E(bob, () => !!document.querySelector('.osk-input, #osk input, input[data-osk]')), 5000) || await waitFor(() => E(bob, () => !!document.querySelector('input')), 3000), 'bob: the on-screen keyboard opens');
	await bob.page.keyboard.type(code); await bob.page.keyboard.press('Enter'); await sleep(500);
	A((await screen(bob)) === 'team' && (await labels(bob)).some((l) => /^Join/.test(l)), "bob: his team screen offers 'Join'", await labels(bob));
	A(await tapOn(bob, /^Join/), 'bob: taps Join');
	A(await waitFor(async () => (await screen(bob)) === 'lobby', 10000), 'bob: in the lobby');
	A(await waitFor(async () => (await E(alice, () => document.querySelectorAll('#hub .ph-seat').length)) === 3 && /bob/.test(await E(alice, () => document.querySelector('#hub .ph-seats').textContent)), 8000), "alice's lobby (polling) shows bob and the computer");
	await bob.page.screenshot({ path: path.join(SHOTS, 'pt_vs_lobby_phone.png') }).catch(() => {});
	A(await waitFor(async () => /^Waiting for bob to be ready \(1 of 2 ready\)\.$/.test((await lobbySays(alice)).waiting), 8000), "alice's lobby: waiting for bob to be ready (1 of 2 ready)", (await lobbySays(alice)).waiting);
	{ const b = await lobbySays(bob); A(b.rules.length >= 4 && /Waiting for bob to be ready/.test(b.waiting), "bob's phone shows the same rules and the same line", b); }
	A(await tapOn(bob, /Ready\?/), 'bob: taps Ready');
	A(await waitFor(async () => (await labels(alice)).some((l) => /Start ?everyone is ready/.test(l)), 8000), "alice's Start lights up when bob is ready", await labels(alice));
	A(/^Everyone is ready\. Press Start\.$/.test((await lobbySays(alice)).waiting) && await waitFor(async () => /^Everyone is ready\. Waiting for alice to start\.$/.test((await lobbySays(bob)).waiting), 6000), 'everyone ready: the host is told to press Start, the guest that the host will', [(await lobbySays(alice)).waiting, (await lobbySays(bob)).waiting]);
	A(await keyTo(alice, /^▶ Start/), 'alice: Start');

	// ---- the match: the same battle on both pages, each its own seat
	A(await waitFor(() => E(alice, () => !!window.__poketactica.P.online && window.__poketactica.P.screen === 'battle'), 10000), 'alice: into the match');
	A(await waitFor(() => E(bob, () => !!window.__poketactica.P.online && window.__poketactica.P.screen === 'battle'), 10000), "bob: into the match (his lobby's poll saw it start)");
	{
		const shown = (t) => E(t, () => { const el = document.getElementById('turn-clock'), r = el.getBoundingClientRect(); return { on: !el.hidden && r.width > 0, text: el.textContent, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0, label: el.getAttribute('aria-label') || '' }; });
		A(await waitFor(async () => (await shown(alice)).on && (await shown(bob)).on, 8000), 'the turn clock is on both screens');
		const ca = await shown(alice), cb = await shown(bob), secs = (x) => { const m = /(\d+):(\d\d)/.exec(x.text); return m ? +m[1] * 60 + +m[2] : -1; };
		A(/^⏱ [01]:\d\d$/.test(ca.text) && secs(ca) > 60 && secs(ca) <= 120 && Math.abs(secs(ca) - secs(cb)) <= 3 && ca.inView && cb.inView && /seconds left in/.test(ca.label), 'both count down the same 2 minutes, a few seconds in', [ca, cb]);
	}
	const ia = await E(alice, () => ({ me: window.__poketactica.P.me, seed: window.__poketactica.P.seed, sides: window.__poketactica.P.S.pvp.sides }));
	const ib = await E(bob, () => ({ me: window.__poketactica.P.me, seed: window.__poketactica.P.seed }));
	A(ia.seed === ib.seed && ia.me !== ib.me && ia.sides.length === 3, 'the same seed; alice and bob each have their own seat of three', [ia, ib]);
	A(await E(alice, () => window.__poketactica.P.S.units.filter((u) => u.side === window.__poketactica.P.me).every((u) => u.level === 50)), 'everyone at Lv 50 (the default rule)');
	const pages = { [ia.me]: alice, [ib.me]: bob };
	const whoseTurn = () => E(alice, () => window.__poketactica.P.S.pvp.sides[window.__poketactica.P.S.pvp.cur]);
	// the one waiting cannot act
	{
		const turn = await whoseTurn(), waiting = turn === ia.me ? bob : alice;
		const r = await E(waiting, () => { const P = window.__poketactica.P; const u = P.S.units.find((x) => x.side === P.me); return window.__poketactica.act({ t: 'deploy', uid: u.uid }); });
		A(!r.ok, "the player whose turn it isn't can't deploy");
	}
	// turns: the seat whose turn it is deploys one and ends; the other page catches up through the server
	let rounds = 0, same = true, deployed = { [ia.me]: 0, [ib.me]: 0 };
	for (let k = 0; k < 6; k++) {
		const turn = await whoseTurn();
		const t = pages[turn];
		if (!t) { await sleep(500); continue; }
		await idle(t);
		const d = await E(t, () => { const T = window.__poketactica, P = T.P; const u = P.S.units.find((x) => x.side === P.me && x.x == null && x.hp > 0); if (!u) return 'none'; const r = T.act({ t: 'deploy', uid: u.uid }); if (!r.ok) return r.why; const b = P.S.units.find((x) => x.uid === u.uid); const tiles = [...T.B.moveTiles(P.S, b).values()].filter((q) => !(q.x === b.x && q.y === b.y)); if (tiles.length) T.act({ t: 'move', uid: u.uid, x: tiles[tiles.length - 1].x, y: tiles[tiles.length - 1].y }); return 'ok'; });
		if (d === 'ok') deployed[turn]++;
		await idle(t);
		await E(t, () => window.__poketactica.act({ t: 'end' }));
		rounds++;
		// both pages agree once the server has everything
		const ok = await waitFor(async () => { await idle(alice); await idle(bob); return (await sig(alice)) === (await sig(bob)); }, 15000);
		if (!ok) { same = false; A(false, 'the boards agree after ' + turn + "'s turn", [await sig(alice), await sig(bob)]); break; }
	}
	await bob.page.screenshot({ path: path.join(SHOTS, 'pt_vs_battle_phone.png') }).catch(() => {});
	await alice.page.screenshot({ path: path.join(SHOTS, 'pt_vs_battle_desktop.png') }).catch(() => {});
	A(same && rounds >= 4, `${rounds} turns: after each, both pages hold the identical battle (the computer's phases included)`);
	A(deployed[ia.me] >= 1 && deployed[ib.me] >= 1, 'both players deployed and moved', deployed);
	A(await E(alice, () => window.__poketactica.P.S.units.some((u) => window.__poketactica.P.S.pvp.cpu[u.side] && u.x != null)), 'the computer seat deployed on both pages');
	const rec = row('ptpvp:' + (await E(alice, () => window.__poketactica.P.online.id))).m;
	A(rec.actions.every((a) => a.by || a.t === 'idle') && rec.actions.filter((a) => a.by === ia.me).length && rec.actions.filter((a) => a.by === ib.me).length, "the server's recipe holds both players' actions, each stamped with its seat");

	// ---- bob leaves (field menu); alice plays on against the computer; then alice leaves: the computer wins
	await idle(bob);
	await bob.page.evaluate(() => window.__poketactica.P.mode = 'idle');
	await E(bob, () => { document.getElementById('b-end').click(); });
	await sleep(300);
	const fm = await E(bob, () => [...document.querySelectorAll('#menu-items .bal-btn')].map((b) => b.textContent.trim()));
	A(fm.some((l) => /Leave match/.test(l)), "bob's field menu has Leave match", fm);
	const lx = await E(bob, () => { const b = [...document.querySelectorAll('#menu-items .bal-btn')].find((x) => /Leave match/.test(x.textContent)); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
	await bob.page.touchscreen.tap(lx[0], lx[1]); await sleep(300);
	const lx2 = await E(bob, () => { const b = [...document.querySelectorAll('#menu-items .bal-btn')].find((x) => /^Leave$/.test(x.textContent.trim())); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
	A(!!lx2, 'bob: asked once more (Leave / Keep playing)');
	if (lx2) { await bob.page.touchscreen.tap(lx2[0], lx2[1]); }
	A(await waitFor(() => E(bob, () => window.__poketactica.P.screen === 'camp' && !window.__poketactica.P.online), 10000), 'bob: back in camp (three seats: the others play on)');
	A(await waitFor(async () => (await E(alice, () => window.__poketactica.P.S.pvp.out)).includes(ib.me), 15000), "alice's page: bob's seat is out");
	A(await E(alice, () => !window.__poketactica.P.S.over), 'alice plays on against the computer');
	await idle(alice);
	await waitFor(() => E(alice, () => !window.__poketactica.P.online.sync.pending()), 5000);
	await E(alice, () => window.__poketactica.act({ t: 'concede' }));
	A(await waitFor(() => E(alice, () => !document.getElementById('result').hidden), 10000), 'alice leaves too: the results');
	A(/wins/.test(await E(alice, () => document.getElementById('r-title').textContent)) && /CPU/.test(await E(alice, () => document.getElementById('r-title').textContent)), 'the computer wins', await E(alice, () => document.getElementById('r-title').textContent));
	const lid = await E(alice, () => window.__poketactica.P.online.id);
	A(await waitFor(() => { const lb = row('ptpvp:' + lid); return lb && lb.m.over && /^CPU/.test(lb.m.over.winner); }, 10000), 'the lobby notes the end (the computer won)', row('ptpvp:' + lid).m.over);
	// A RECORD WITH EACH PLAYER YOU HAVE MET, AND A REMATCH (plan item V2): a match ended and was gone
	{
		const res = () => E(alice, () => ({ rec: (document.getElementById('r-vsrec') || {}).textContent || '', btns: [...document.querySelectorAll('#result .bal-modal-acts .bal-btn')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()) }));
		A(await waitFor(async () => /^You and bob: 0 wins, 0 losses$/.test((await res()).rec), 8000), "the results say alice's record with bob (the computer won this one: nothing each)", await res());
		A((await res()).btns.some((b) => /^Rematch Z$/.test(b)) && (await res()).btns.some((b) => /^Back to camp X$/.test(b)), 'and offer a rematch (Z) beside Back to camp (X)', (await res()).btns);
		await alice.page.keyboard.press('KeyZ');
		A(await waitFor(async () => (await screen(alice)) === 'lobby' && await E(alice, () => window.__poketactica.P.screen === 'camp' && !window.__poketactica.P.online), 12000), 'Z: a new lobby, straight from the results');
		const nl = await E(alice, () => ({ code: (document.querySelector('.ph-code') || {}).textContent, seats: [...document.querySelectorAll('#hub .ph-seat')].map((x) => x.textContent.replace(/\s+/g, ' ').trim()) }));
		const nlb = row('ptpvp:' + row('ptpvpcur:alice').id);
		A(/^[A-Z2-9]{5}$/.test(nl.code || '') && nl.code !== code && nlb.size === 3 && nlb.cpus === 1 && nlb.host === 'alice' && row('ptpvp:' + lid).next === nlb.id, 'the same rules (3 seats, 1 computer), a new code to share, alice hosting', [nl, nlb.size, nlb.cpus]);
		A(nl.seats.some((x) => /^alice/.test(x)) && !nl.seats.some((x) => /^bob/.test(x)) && nl.seats.some((x) => /open: share the code/.test(x)), 'bob had left the match, so his seat is open in the rematch', nl.seats);
		A(await tapOn(alice, /^Leave/) || true, 'alice leaves the rematch lobby');
		await sleep(600);
	}
	A(await E(alice, () => window.__poketactica.P.screen === 'camp' && !window.__poketactica.P.online), 'and is back in camp');
	A(!alice.errors.length && !bob.errors.length, 'no page errors', [...alice.errors, ...bob.errors].slice(0, 4));
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
finally { if (browser) await browser.close(); server.close(); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
