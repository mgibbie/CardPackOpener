// micasurvivor_account_test.mjs — MicaSurvivor (M3) with Magepunk accounts, end to end: the REAL
// server handler (server/mp.mjs bundled like the dev server, over sqlite) behind a static server,
// headless Chrome, one browser context per device:
//   1. logged in (the site's magepunk_mp_token_v1 + state): no login screen, straight to the
//      personality test / menu as that user; the user pill shows the Magepunk username; Settings >
//      Account says "Magepunk account" with no Log out / Delete account (a link to Magepunk instead);
//      the save reaches micasurvivor:<user> (also via the pagehide flush on a reload)
//   2. a second device opens the same account's progress; both change the save at once: the stale
//      one gets 409, merges and retries — the server ends with BOTH devices' coins and Pokémon
//   3. a guest makes no /api/mp request; logging in afterwards offers the guest progress ONCE:
//      an empty account takes it over (exact coins, no +500), an account with progress merges it
//      (backup first), "No, thanks" leaves the account alone; never asked again
//   4. a finished run lands on the leaderboard; the Leaderboard screen shows the top + your rank
// Screenshots go to MICASURVIVOR_SHOTS=<dir> when set (carry-over offer, leaderboard).
//   node overworld/tests/micasurvivor_account_test.mjs
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
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8793;
const SHOTS = process.env.MICASURVIVOR_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(150); } return false; }

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
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-micasurvivor-e2e-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	return (await handler(req, { MP_DB })).json();
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain' };
const apiLog = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let action = ''; try { action = JSON.parse(raw).action; } catch { }
		apiLog.push({ action, auth: req.headers.authorization || '' });
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.6.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const tokens = {}, states = {};
const reg = async (n) => { const r = await call('register', { username: n, password: 'micasurvivor-e2e-pass' }); tokens[n] = r.token; states[n] = r.state || (await call('state', {}, r.token)).state; };
for (const n of ['alice', 'bob', 'carol', 'dave']) await reg(n);
A(Object.values(tokens).every(Boolean), 'test accounts registered');

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
	const external = [];
	// a device: its own browser context (its own localStorage); `who` = logged in as, or null (guest)
	const device = async (who) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/status of 409/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.setRequestInterception(true);
		page.on('request', r => { const url = r.url(); if (/^(data|blob):/.test(url) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(url)) r.continue(); else { external.push(url); r.abort(); } });
		await page.evaluateOnNewDocument((tok, st) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			if (tok) { localStorage.setItem('magepunk_mp_token_v1', tok); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
		}, who ? tokens[who] : null, who ? states[who] : null);
		const visible = (id) => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		const boot = async () => {
			await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
			await waitFor(() => page.evaluate(() => document.getElementById('boot').classList.contains('hidden')), 30000);
			await sleep(300);
			if (await visible('tap-start')) await page.click('#tap-start');
		};
		const reload = async () => {
			await page.reload({ waitUntil: 'domcontentloaded' });
			await waitFor(() => page.evaluate(() => document.getElementById('boot').classList.contains('hidden')), 30000);
			await sleep(300);
			if (await visible('tap-start')) await page.click('#tap-start');
		};
		const doTest = async () => {
			for (let i = 0; i < 40 && await visible('scr-test'); i++) { await page.evaluate(() => { const b = document.querySelector('#test-a button'); if (b) b.click(); }); await sleep(120); }
			await waitFor(() => visible('scr-result'), 8000);
			await page.click('#res-ok');
			return waitFor(() => visible('scr-menu'), 10000);
		};
		const synced = () => waitFor(() => page.evaluate(() => G.DB.syncState === 'ok'), 15000);
		const shot = async (name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name) }); } };
		return { ctx, page, errors, visible, boot, reload, doTest, synced, shot };
	};

	// ===== 1. logged in: straight in as the Magepunk user =====
	const a1 = await device('alice');
	await a1.boot();
	A(await waitFor(() => a1.visible('scr-test'), 10000) && !(await a1.visible('scr-login')), 'logged in: no login screen, straight to the personality test');
	A(await a1.page.evaluate(() => G.DB.mode === 'magepunk' && G.DB.magepunk === 'alice' && G.DB.user === 'alice'), 'the game plays as the Magepunk user (alice)');
	A(await a1.doTest(), 'partner chosen, main menu');
	A(/alice/.test(await a1.page.evaluate(() => document.getElementById('user-pill').textContent)), 'the user pill shows the Magepunk username');
	const partnerA = await a1.page.evaluate(() => G.DB.save.partner);
	await a1.reload();   // the partner pick is a normal (debounced) save: the pagehide flush must send it
	A(await waitFor(() => a1.visible('scr-menu'), 10000), 'reload: straight back to the menu');
	A(await waitFor(() => (row('micasurvivor:alice') || {}).save?.partner === partnerA, 15000), 'the save reached micasurvivor:alice (partner, via the reload flush / boot merge)', JSON.stringify(row('micasurvivor:alice'))?.slice(0, 120));
	A(await a1.page.evaluate(() => Object.keys(localStorage).includes('micasurvivor_save.mp:alice')), 'a local copy is kept under micasurvivor_save.mp:alice');
	await a1.page.click('#btn-settings');
	await a1.page.click('#set-tabs [data-t=acc]');
	const accTab = await a1.page.evaluate(() => ({ text: document.getElementById('set-body').innerText, out: !!document.getElementById('set-logout'), del: !!document.getElementById('set-delete'), link: !!document.querySelector('#set-body a[href="/"]') }));
	A(/Magepunk account/.test(accTab.text) && /alice/.test(accTab.text) && !accTab.out && !accTab.del && accTab.link, 'Settings > Account: Magepunk account, the username, no Log out / Delete account, a link to Magepunk', JSON.stringify(accTab));
	await a1.page.click('#set-close');

	// ===== 2. two devices, one account =====
	await a1.page.evaluate(() => { G.DB.save.coins += 100; G.DB.commit(true); });
	A(await a1.synced(), 'device A saves (+100 coins)');
	const a2 = await device('alice');
	await a2.boot();
	A(await waitFor(() => a2.visible('scr-menu'), 10000) && await a2.page.evaluate(p => G.DB.save.partner === p, partnerA), "device B opens the account's progress (same partner, straight to the menu)");
	const c0 = await a2.page.evaluate(() => G.DB.save.coins);
	A(c0 === await a1.page.evaluate(() => G.DB.save.coins), 'both devices show the same coins', String(c0));
	// A saves again; B, now one revision behind, saves too
	await a1.page.evaluate(() => { G.DB.save.coins += 100; G.DB.grant(4, 'gacha'); G.DB.commit(true); });
	A(await a1.synced(), 'device A: +100 coins and Charmander');
	const revA = row('micasurvivor:alice').rev;
	await a2.page.evaluate(() => { G.DB.save.coins += 50; G.DB.grant(7, 'gacha'); G.DB.commit(true); });
	A(await a2.synced(), 'device B (stale) saves: +50 coins and Squirtle');
	const after = row('micasurvivor:alice');
	A(after.rev === revA + 1, 'B was refused once (409), merged and wrote the next revision', `${revA} -> ${after.rev}`);
	A(after.save.coins === c0 + 150 && after.save.owned[4] && after.save.owned[7] && after.save.owned[partnerA], "the server holds BOTH devices' progress (coins add up, both Pokémon)", JSON.stringify({ coins: after.save.coins, want: c0 + 150, owned: Object.keys(after.save.owned) }));
	A(await a2.page.evaluate(() => G.DB.save.coins) === c0 + 150 && await a2.page.evaluate(() => !!G.DB.save.owned[4]), "device B now shows A's progress too");
	await a1.page.evaluate(() => { G.DB.save.stats.totalKills += 1; G.DB.commit(true); });
	A(await a1.synced() && await a1.page.evaluate(n => G.DB.save.coins === n && !!G.DB.save.owned[7], c0 + 150), "device A's next save merges B's in (no loss either way)");
	await a2.ctx.close();

	// ===== 3. guest -> account =====
	// 3a. an EMPTY account takes the guest progress over
	const g1 = await device(null);
	const api0 = apiLog.length;
	await g1.boot();
	A(await waitFor(() => g1.visible('scr-login'), 10000), 'guest: the login screen');
	const lg = await g1.page.evaluate(() => { const b = document.getElementById('btn-mp-login'); return { shown: !b.classList.contains('hidden'), text: b.textContent, note: document.getElementById('login-mode').textContent }; });
	A(lg.shown && lg.text === 'Log in with Magepunk' && /Log in to Magepunk/.test(lg.note), 'a guest is offered "Log in with Magepunk"', JSON.stringify(lg));
	await g1.page.click('#btn-guest');
	await waitFor(() => g1.visible('scr-test'), 8000);
	A(await g1.doTest(), 'guest: partner chosen, main menu');
	await g1.page.evaluate(() => { G.DB.save.coins += 1234; G.DB.grant(133, 'gacha'); G.DB.commit(true); });
	const guestSave = await g1.page.evaluate(() => JSON.parse(localStorage.getItem('micasurvivor_save.guest')));
	// (the logged-in pages from sections 1-2 stay open and poll their co-op invites, M5 batch 12b: only
	// requests WITHOUT a token can be the guest's)
	A(apiLog.slice(api0).filter(x => !x.auth).length === 0, 'a guest makes no /api/mp request', JSON.stringify(apiLog.slice(api0).filter(x => !x.auth)));
	A(await g1.page.evaluate(() => { const b = document.getElementById('btn-mp-login'); b.click(); return location.href; }) && await waitFor(() => g1.page.evaluate(() => location.pathname === '/login/'), 5000) === true,
		'"Log in with Magepunk" goes to the site login');
	A(decodeURIComponent(await g1.page.evaluate(() => location.search)) === '?next=/micasurvivor/', '...with next= back to MicaSurvivor', await g1.page.evaluate(() => location.search));
	// (logged in on the site:) the token + state land in localStorage, back to the game
	await g1.page.evaluate((t, s) => { localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(s)); }, tokens.carol, states.carol);
	await g1.boot();
	A(await waitFor(() => g1.visible('scr-carry'), 10000), 'logged in: the guest progress is offered to the account');
	const offer = await g1.page.evaluate(() => ({ text: document.getElementById('scr-carry').innerText, yes: document.getElementById('carry-yes').textContent }));
	A(/no progress yet/.test(offer.text) && offer.yes === 'Bring it into my account' && offer.text.includes(guestSave.coins.toLocaleString('en') + ' coins'),
		"the offer shows the guest's progress and says an empty account takes it over", offer.text.slice(0, 300));
	await g1.shot('account_carry_offer.png');
	await g1.page.click('#carry-yes');
	A(await waitFor(() => g1.visible('scr-menu'), 10000), 'carried: straight to the menu (the guest partner, no personality test)');
	const carol = await g1.page.evaluate(() => ({ partner: G.DB.save.partner, coins: G.DB.save.coins, owned: Object.keys(G.DB.save.owned), user: G.DB.user, marker: JSON.parse(localStorage.getItem('micasurvivor_migrated.guest') || 'null'), backups: Object.keys(localStorage).filter(k => k.startsWith('micasurvivor_backup.mp:carol.')), guestKept: !!localStorage.getItem('micasurvivor_save.guest') }));
	A(carol.user === 'carol' && carol.partner === guestSave.partner && carol.coins === guestSave.coins && carol.owned.includes('133'), 'the account took the guest save over: partner, Pokémon, exact coins (no +500)', JSON.stringify({ carol, guest: { partner: guestSave.partner, coins: guestSave.coins } }));
	A(carol.marker && carol.marker.to === 'carol' && carol.marker.choice === 'carry' && carol.backups.length === 1 && carol.guestKept, 'remembered once, the account backed up first, the guest save left in place', JSON.stringify(carol));
	A(await g1.synced() && row('micasurvivor:carol')?.save?.coins === guestSave.coins && row('micasurvivor:carol').save.partner === guestSave.partner, 'micasurvivor:carol on the server holds the carried progress');
	await g1.reload();
	A(await waitFor(() => g1.visible('scr-menu'), 10000) && !(await g1.visible('scr-carry')), 'reload: never asked again');
	await g1.ctx.close();

	// 3b. an account WITH progress: merged, nothing lost
	const g2 = await device(null);
	await g2.boot();
	await waitFor(() => g2.visible('scr-login'), 10000);
	await g2.page.click('#btn-guest');
	await waitFor(() => g2.visible('scr-test'), 8000);
	await g2.doTest();
	await g2.page.evaluate(() => { G.DB.save.coins += 2000; G.DB.grant(150, 'gacha'); G.DB.save.stats.bestTime = 999; G.DB.commit(true); });
	const guest2 = await g2.page.evaluate(() => JSON.parse(localStorage.getItem('micasurvivor_save.guest')));
	const alice0 = row('micasurvivor:alice').save;
	await g2.page.evaluate((t, s) => { localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(s)); }, tokens.alice, states.alice);
	await g2.reload();
	A(await waitFor(() => g2.visible('scr-carry'), 10000), 'an account with progress: offered too');
	const off2 = await g2.page.evaluate(() => ({ text: document.getElementById('scr-carry').innerText, yes: document.getElementById('carry-yes').textContent }));
	A(/already has progress/.test(off2.text) && /merged/.test(off2.text) && /backup/.test(off2.text) && off2.yes === 'Merge into my account', 'the offer says it MERGES (nothing lost) and backs up first', off2.text.slice(0, 300));
	await g2.page.click('#carry-yes');
	await waitFor(() => g2.visible('scr-menu'), 10000);
	A(await g2.synced(), 'merged save written');
	const merged = row('micasurvivor:alice').save;
	const bk = await g2.page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('micasurvivor_backup.mp:alice.')).map(k => JSON.parse(localStorage.getItem(k))));
	A(merged.partner === alice0.partner && merged.owned[150] && merged.owned[4] && merged.owned[7] && merged.owned[guest2.partner], "merged: the account keeps its partner and gains the guest's Pokémon", JSON.stringify({ partner: merged.partner, owned: Object.keys(merged.owned) }));
	// coins/tickets: every ledger entry of both saves survives (the guest's under 'g.<device>'), so the
	// balances add up; anything above that is achievements the merged records unlocked on the menu
	const ledKept = Object.entries(alice0.led).every(([d, e]) => JSON.stringify(merged.led[d]?.c) === JSON.stringify(e.c))
		&& Object.entries(guest2.led).every(([d, e]) => JSON.stringify(merged.led['g.' + d]?.c) === JSON.stringify(e.c));
	A(ledKept && merged.coins >= alice0.coins + guest2.coins && merged.stats.bestTime === 999, 'merged: both coin ledgers kept (coins add up), records keep the best',
		JSON.stringify({ merged: merged.coins, account: alice0.coins, guest: guest2.coins, led: merged.led }));
	A(bk.length === 1 && bk[0].coins === alice0.coins && !bk[0].owned[150], 'the account save before the merge is in a local backup');
	await g2.ctx.close();

	// 3c. "No, thanks": the account is left alone
	const g3 = await device(null);
	await g3.boot();
	await waitFor(() => g3.visible('scr-login'), 10000);
	await g3.page.click('#btn-guest');
	await waitFor(() => g3.visible('scr-test'), 8000);
	await g3.doTest();
	await g3.page.evaluate((t, s) => { localStorage.setItem('magepunk_mp_token_v1', t); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(s)); }, tokens.dave, states.dave);
	await g3.reload();
	A(await waitFor(() => g3.visible('scr-carry'), 10000), 'dave: offered');
	await g3.page.click('#carry-no');
	A(await waitFor(() => g3.visible('scr-test'), 10000), '"No, thanks": the empty account starts fresh (personality test)');
	const dave = await g3.page.evaluate(() => ({ partner: G.DB.save.partner, coins: G.DB.save.coins, marker: JSON.parse(localStorage.getItem('micasurvivor_migrated.guest') || 'null'), backups: Object.keys(localStorage).filter(k => k.startsWith('micasurvivor_backup.')).length }));
	A(!dave.partner && dave.coins === 500 && dave.marker && dave.marker.choice === 'skip' && dave.backups === 0, 'nothing carried, no backup needed, the answer remembered', JSON.stringify(dave));
	await g3.reload();
	A(await waitFor(() => g3.visible('scr-test'), 10000) && !(await g3.visible('scr-carry')), 'reload: not asked again');
	await g3.ctx.close();

	// ===== 4. the leaderboard =====
	// (DLC D16: the new client sends rules 2 and ranks on the new board, runboard:micasurvivor:r2; an old client's score, no
	//  rules, goes to the legacy board, which the Leaderboard screen shows under "Legacy")
	await call('run-score', { mode: 'micasurvivor', time: 1500, kills: 4200, level: 41, dex: 6, rules: 2 }, tokens.bob);
	await call('run-score', { mode: 'micasurvivor', time: 2, kills: 0, level: 1, dex: 7, shiny: true, rules: 2 }, tokens.dave);
	await call('run-score', { mode: 'micasurvivor', time: 3600, kills: 9000, level: 60, dex: 9 }, tokens.dave);
	await a1.page.evaluate(() => { G.MicaAccount.MIN_T = 0; });   // (a real run must last 120 s to count)
	await a1.page.click('#scr-menu [data-go=play]');
	A(await waitFor(() => a1.page.evaluate(() => G.Game.state === 'playing'), 15000), 'alice starts a run');
	await sleep(6000);
	await a1.page.evaluate(() => { for (const id of ['scr-levelup', 'scr-item', 'scr-bond']) { const c = document.querySelector('#' + id + ':not(.hidden) .cards > *'); if (c) c.click(); } });
	await a1.page.keyboard.press('Escape');
	await waitFor(() => a1.visible('scr-pause'), 5000);
	await a1.page.click('#btn-quit');
	A(await waitFor(() => a1.visible('scr-over'), 8000), 'the run ends (summary)');
	A(await waitFor(() => (row('runboard:micasurvivor:r2') || []).some(e => e.name === 'alice'), 10000) && !(row('runboard:micasurvivor') || []).some(e => e.name === 'alice'), 'the run is on the micasurvivor board of the new rules (runboard:micasurvivor:r2), not the legacy one');
	const mine = (row('runboard:micasurvivor:r2') || []).find(e => e.name === 'alice') || {};
	A(mine.time >= 4 && mine.time <= 20 && mine.dex === partnerA && typeof mine.kills === 'number' && mine.level >= 1, 'with its time, kills, level and partner', JSON.stringify(mine));
	await a1.page.click('#btn-again');
	await waitFor(() => a1.visible('scr-menu'), 8000);
	A(await a1.page.evaluate(() => document.getElementById('menu-rank-sub').textContent) === 'Best survival time', 'the menu item reads "Best survival time" when logged in');
	await a1.page.click('#scr-menu [data-go=rank]');
	A(await waitFor(() => a1.page.evaluate(() => document.querySelectorAll('#rk-list .rk-row').length === 3), 8000), 'the Leaderboard screen lists the board');
	await sleep(500);
	const lb = await a1.page.evaluate(() => ({
		rows: [...document.querySelectorAll('#rk-list .rk-row')].map(r => ({ who: r.querySelector('.who b').textContent, t: r.querySelector('.time').textContent, mine: r.classList.contains('mine'), sprite: !!r.querySelector('.mons canvas') })),
		me: document.getElementById('rk-me').textContent, filters: getComputedStyle(document.getElementById('rk-period')).display,
	}));
	A(lb.rows.map(r => r.who).join(',') === 'bob,alice,dave' && lb.rows[0].t === '25:00' && lb.rows[1].mine && lb.rows.every(r => r.sprite), 'top list in order, times formatted, your row highlighted, partner sprites', JSON.stringify(lb.rows));
	A(/Your best rank: #2/.test(lb.me) && lb.filters === 'none', 'your rank under the list; the Firebase filters are hidden', JSON.stringify(lb));
	await a1.shot('account_leaderboard.png');
	// (DLC D16) the Legacy tab: the board from before the new rules, read-only
	await a1.page.click('#rk-rules [data-rules=legacy]');
	A(await waitFor(() => a1.page.evaluate(() => { const r = [...document.querySelectorAll('#rk-list .rk-row .who b')].map(b => b.textContent); return r.length === 1 && r[0] === 'dave'; }), 8000)
		&& await a1.page.evaluate(() => document.querySelector('#rk-rules [data-rules=legacy]').classList.contains('on') && /before the new rules/.test(document.getElementById('rk-me').textContent)),
		'the "Legacy" tab lists the board from before the new rules (an old client\'s score), and says it is read-only');
	await a1.page.click('#rk-rules [data-rules=current]');
	A(await waitFor(() => a1.page.evaluate(() => document.querySelectorAll('#rk-list .rk-row').length === 3), 8000), '"Current" goes back to the new board');

	A(external.length === 0, 'no request to any non-localhost origin', external.slice(0, 5).join(' | '));
	A(a1.errors.length === 0, 'no console errors', a1.errors.slice(0, 5).join(' | '));
	await a1.ctx.close();
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
