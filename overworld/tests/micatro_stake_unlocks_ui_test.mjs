// micatro_stake_unlocks_ui_test.mjs — the New Run stake picker with per-deck unlocks (micatro/js/ui/screens.js newRunScreen +
// ui/stakeunlocks.js + ui/stickers.js), in headless Chrome against a stub /api/mp:
//   * signed in, the account's deck stickers decide: a saved Gold preference on a deck with a White win falls back to Red
//     (the highest open stake); the next stake (Green) shows greyed with a lock and "Win on Red Stake with this deck to
//     unlock", and Play is disabled (a click starts nothing); Pokermon's Elite is locked until the deck has a Gold win
//   * per deck: a Gold win on Red Deck opens Elite there; switching to Blue Deck (no wins) drops to White, and back to Red
//     brings the wanted Elite back; Play starts the run on Elite
//   * the controller: on a locked stake the reticle never reaches Play (disabled), the stake arrows are reachable and the
//     info box (aria-live) says "Locked"; arrowing back to an open stake makes Play reachable and starts the run
//   * a REVOKED deck sticker (the account's `revoked`) re-locks: the cached Gold win no longer opens anything
//   * the all-stakes allowance (the account answers allStakes: true): every stake open on a deck with no wins, Elite included
//   * a guest uses its local stickers; a seeded run follows the same unlocks
//   * NOT gated: a run in progress on a now-locked stake resumes (Continue); a challenge starts at its own stake
//   node overworld/tests/micatro_stake_unlocks_ui_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9763;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const B = { cancel: 0, confirm: 1, up: 12, down: 13, left: 14, right: 15 };

// the stub account: token -> {user, wins, revoked, allStakes}
const ACCTS = {};
const stateOf = (user) => ({ username: user, friendCode: 'STU000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: [] });
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw || '{}'); } catch { }
		const tok = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || body.token || '';
		const acct = ACCTS[tok];
		let out;
		if (body.action === 'micatro-stickers-get' && acct) out = { v: 2, wins: acct.wins, rev: 1, revoked: acct.revoked || {}, earned: {}, ...(acct.allStakes ? { allStakes: true } : {}) };
		else if (body.action === 'micatro-stickers-put' && acct) out = { ok: true, wins: { ...acct.wins, ...(body.wins || {}) }, rev: 2, changed: false, revoked: acct.revoked || {}, earned: {}, ...(acct.allStakes ? { allStakes: true } : {}) };
		else out = { ok: true, state: acct ? stateOf(acct.user) : null, top: [], messages: [] };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
	/** A fresh page: `token` (an ACCTS key) signs in, null = a guest; `ls` = extra localStorage; `pad` = a fake controller. */
	const open = async ({ token = null, ls = {}, url = '/micatro/' } = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: 1600, height: 900 });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		await page.evaluateOnNewDocument((token, st, ls) => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			// (a poll of site/gamepad.js reads p.connected once: count them, so a press is held until the game has SEEN it — a fixed
			// 70 ms press fell between two slow CI frames and was never read — and released only once a poll has seen that too)
			let polls = 0;
			Object.defineProperty(pad, 'connected', { get() { polls++; return true; }, enumerable: true });
			const until = (f, ms = 10000) => new Promise((r) => { const t0 = performance.now(); const k = () => (f() || performance.now() - t0 > ms ? r() : setTimeout(k, 4)); k(); });
			const set = (b, on) => { pad.buttons[b] = on ? { pressed: true, value: 1 } : { pressed: false, value: 0 }; };
			window.__padSet = async (b, on) => { set(b, on); const n = polls; await until(() => polls > n); };
			// (two polls after the release: the frame that acted on it, then one more so its requestAnimationFrame follow-ups have run)
			window.__padTap = async (b, hold = 70) => { const t0 = performance.now(); set(b, true); const n = polls; await until(() => polls > n && performance.now() - t0 >= hold); set(b, false); const m = polls; await until(() => polls > m + 1); };
			try {
				if (sessionStorage.getItem('su_init')) return;
				sessionStorage.setItem('su_init', '1');
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				localStorage.setItem('micatro_joker_wins_guest_carried', '1');
				if (token) { localStorage.setItem('magepunk_mp_token_v1', token); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v);
			} catch { }
		}, token, token ? stateOf(ACCTS[token].user) : null, ls);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready && document.querySelector('.b-menu-play'))), 30000);
		const tap = async (b) => { await page.evaluate(b => window.__padTap(b, 70), b); await sleep(160); };
		return { page, ctx, errors, tap };
	};
	const synced = (page) => waitFor(() => page.evaluate(async () => { const s = (await import('/micatro/js/ui/stickers.js')).stickerSyncState(); return !s || s.synced; }), 10000);
	const openNewRun = async (page) => {
		// the saved-on mods load as New Run opens, and their arrival re-applies the wanted stake (screens.js refreshStakes ->
		// snapStake): on a slow runner that landed mid-test (the picker jumped off a locked stake). Load them first.
		await page.evaluate(async () => { let ids = []; try { ids = JSON.parse(localStorage.getItem('micatro_mods') || '{}').ids || []; } catch { } if (ids.length) await window.__micatro.loadMods(ids); });
		await page.evaluate(() => document.querySelector('.b-menu-play').click()); await waitFor(() => page.evaluate(() => !!document.querySelector('.new-run .nr-stake')), 8000); await sleep(150); };
	const picker = (page) => page.evaluate(() => {
		const r = document.querySelector('.nr-stake');
		return { stake: r.dataset.stake, locked: r.dataset.locked === '1', name: r.querySelector('.nr-name').textContent.replace(/\s+/g, ' ').trim(), desc: r.querySelector('.nr-desc').textContent.trim(), lockIcon: !!r.querySelector('.nr-lock'), play: !document.querySelector('.b-start').disabled, deck: document.querySelector('.nr-deck .nr-name').textContent.trim(), live: r.querySelector('.nr-info').getAttribute('aria-live') };
	});
	const press = (page, sel) => page.evaluate((s) => document.querySelector(s).click(), sel);
	const stakeTo = async (page, want, max = 40) => { for (let i = 0; i < max; i++) { if ((await picker(page)).stake === String(want)) return true; await press(page, '.b-stake-next'); } return false; };
	const deckTo = async (page, name, max = 40) => { for (let i = 0; i < max; i++) { if ((await picker(page)).deck === name) return true; await press(page, '.nr-deck .arrow:last-child'); } return false; };

	// ---------------- 1. signed in: White win on Red Deck; saved preference Gold
	ACCTS.tok_un = { user: 'unlocker', wins: { b_red: { win: 1 } } };
	{
		const { page, ctx, errors, tap } = await open({ token: 'tok_un', ls: { micatro_newrun: JSON.stringify({ back: 'b_red', stake: 8 }), micatro_mods: JSON.stringify({ ids: ['pokermon'], options: {} }) } });
		await synced(page);
		await openNewRun(page);
		await waitFor(async () => (await picker(page)).stake === '2', 8000);
		let p = await picker(page);
		A(p.deck === 'Red Deck' && p.stake === '2' && !p.locked && p.play, 'a saved Gold preference on Red Deck (a White win) falls back to Red, the highest open stake', JSON.stringify(p));
		await press(page, '.b-stake-next');
		p = await picker(page);
		A(p.stake === '3' && p.locked && p.lockIcon && !p.play, 'Green is locked: greyed with a lock, Play disabled', JSON.stringify(p));
		A(/Win on Red Stake with this deck to unlock/.test(p.desc), '... "Win on Red Stake with this deck to unlock"', p.desc);
		await page.evaluate(() => { const b = document.querySelector('.b-start'); b.disabled = false; b.click(); });   // (even forced: the handler refuses)
		await sleep(400);
		A(await page.evaluate(() => !!document.querySelector('.new-run') && !window.__micatro.session), 'a locked stake can\'t be started (even a forced click starts nothing)');
		// the controller on a locked stake
		await tap(B.right);   // (the first press shows the reticle)
		const seen = new Set();
		for (let i = 0; i < 12; i++) { await tap(i < 6 ? B.down : B.up); seen.add(await page.evaluate(() => String(window.__micatroPad.focus && window.__micatroPad.focus.cls))); }
		A(![...seen].some((c) => /b-start/.test(c)), 'the controller never lands on Play while the stake is locked', [...seen].join(' | '));
		A(await page.evaluate(() => { const r = window.__micatroPad.ensure(); return r.list.some((s) => s.el && s.el.matches('.b-stake-prev')) && !r.list.some((s) => s.el && s.el.matches('.b-start')); }), '... the stake arrows stay reachable');
		A(p.live === 'polite' && /^🔒/.test(p.name) && /Locked\./.test(p.desc), '... and the info box (aria-live) announces the lock', JSON.stringify([p.live, p.name, p.desc]));
		// back to Red by pad: Play is reachable again and starts the run
		for (let i = 0; i < 20; i++) { const c = await page.evaluate(() => String(window.__micatroPad.focus && window.__micatroPad.focus.cls)); if (/b-stake-prev/.test(c)) break; await tap(/b-stake-next/.test(c) ? B.left : B.down); }
		const onPrev = await page.evaluate(() => /b-stake-prev/.test(String(window.__micatroPad.focus && window.__micatroPad.focus.cls)));
		if (!onPrev) await page.evaluate(() => document.querySelector('.b-stake-prev').click()); else await tap(B.confirm);
		p = await picker(page);
		A(onPrev && p.stake === '2' && !p.locked && p.play, 'the pad\'s stake arrow goes back to Red: open, Play enabled', JSON.stringify([onPrev, p]));
		A(await page.evaluate(() => window.__micatroPad.ensure().list.some((s) => s.el && s.el.matches('.b-start'))), '... and Play is reachable by the controller again');
		// Elite (Pokermon on): locked on Red Deck until a Gold win
		await waitFor(() => page.evaluate(() => [...document.querySelectorAll('.nr-mods-sum')].some((x) => /Pokermon/i.test(x.textContent))), 8000);
		A(await stakeTo(page, 'stake_poke_elite'), 'Pokermon\'s Elite is on the picker');
		p = await picker(page);
		A(p.locked && !p.play && /Win on Gold Stake with this deck to unlock/.test(p.desc), 'Elite is locked on Red Deck (no Gold win): "Win on Gold Stake with this deck to unlock"', JSON.stringify(p));
		A(!errors.length, 'no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---------------- 2. a Gold win on Red Deck: Elite open there, per deck
	ACCTS.tok_gold = { user: 'goldwinner', wins: { b_red: { win: 8, poke: 8 } } };
	{
		const { page, ctx, errors } = await open({ token: 'tok_gold', ls: { micatro_newrun: JSON.stringify({ back: 'b_red', stake: 'stake_poke_elite' }), micatro_mods: JSON.stringify({ ids: ['pokermon'], options: {} }) } });
		await synced(page);
		await openNewRun(page);
		await waitFor(async () => (await picker(page)).stake === 'stake_poke_elite', 10000);
		let p = await picker(page);
		A(p.deck === 'Red Deck' && p.stake === 'stake_poke_elite' && !p.locked && p.play, 'after a Gold win on Red Deck, Elite is open there (the saved Elite preference holds)', JSON.stringify(p));
		await deckTo(page, 'Blue Deck');
		p = await picker(page);
		A(p.deck === 'Blue Deck' && p.stake === '1' && !p.locked, 'Blue Deck (no wins): only White — the selection drops to it', JSON.stringify(p));
		await deckTo(page, 'Red Deck');
		p = await picker(page);
		A(p.stake === 'stake_poke_elite' && !p.locked, 'back on Red Deck the wanted Elite comes back', JSON.stringify(p));
		await deckTo(page, 'Blue Deck');
		await press(page, '.b-stake-next');
		A((await picker(page)).locked, '... and Red is locked on Blue Deck');
		await deckTo(page, 'Red Deck');
		await stakeTo(page, 'stake_poke_elite');
		await press(page, '.b-start');
		await waitFor(() => page.evaluate(() => !!window.__micatro.session && !!window.__micatro.view()), 20000);
		const rec = await page.evaluate(() => window.__micatro.session.recipe);
		A(rec && rec.stake === 'stake_poke_elite' && rec.back === 'b_red', 'Play starts the run on Elite with Red Deck', JSON.stringify(rec && { s: rec.stake, b: rec.back }));
		A(!errors.length, 'no page errors', errors.join(' | '));
		await ctx.close();
	}

	// ---------------- 3. revoked: the cached Gold win on Red Deck no longer opens anything
	ACCTS.tok_rev = { user: 'revokee', wins: {}, revoked: { b_red: { cats: true, at: null } } };
	{
		const { page, ctx } = await open({ token: 'tok_rev', ls: { 'micatro_joker_wins_v1:revokee': JSON.stringify({ b_red: { win: 8 } }), micatro_newrun: JSON.stringify({ back: 'b_red', stake: 8 }) } });
		await synced(page);
		await openNewRun(page);
		let p = await picker(page);
		A(p.deck === 'Red Deck' && p.stake === '1', 'a revoked Red Deck sticker re-locks: the Gold preference falls back to White', JSON.stringify(p));
		await press(page, '.b-stake-next');
		p = await picker(page);
		A(p.locked && !p.play, '... and Red is locked again', JSON.stringify(p));
		await ctx.close();
	}

	// ---------------- 4. the all-stakes allowance (kgib): every stake open on a deck with no wins
	ACCTS.tok_kgib = { user: 'kgib', wins: {}, allStakes: true };
	{
		const { page, ctx } = await open({ token: 'tok_kgib', ls: { micatro_newrun: JSON.stringify({ back: 'b_blue', stake: 8 }), micatro_mods: JSON.stringify({ ids: ['pokermon'], options: {} }) } });
		await synced(page);
		await openNewRun(page);
		await waitFor(async () => (await picker(page)).stake === '8', 8000);
		let p = await picker(page);
		A(p.deck === 'Blue Deck' && p.stake === '8' && !p.locked && p.play, 'allowance: Gold open on Blue Deck with no wins', JSON.stringify(p));
		const seen = [];
		for (let i = 0; i < 12; i++) { await press(page, '.b-stake-next'); const q = await picker(page); seen.push(q.stake + (q.locked ? ':locked' : '')); }
		A(seen.includes('stake_poke_elite') && !seen.some((s) => /locked/.test(s)), 'allowance: every stake open, Elite included', seen.join(' '));
		await ctx.close();
	}

	// ---------------- 5. a guest: local stickers; a seeded run follows the same unlocks; a locked run still resumes; challenges
	{
		const { page, ctx, errors } = await open({ ls: { 'micatro_joker_wins_v1:guest': JSON.stringify({ b_red: { win: 3 } }), micatro_newrun: JSON.stringify({ back: 'b_red', stake: 1 }) }, url: '/micatro/?seed=UNLOCK1' });
		await openNewRun(page);
		A(await page.evaluate(() => document.querySelector('.seed-on').checked), 'a seeded New Run');
		await stakeTo(page, 4);
		let p = await picker(page);
		A(p.stake === '4' && !p.locked, 'a guest\'s local Green win on Red Deck opens Black (seeded too)', JSON.stringify(p));
		await press(page, '.b-stake-next');
		p = await picker(page);
		A(p.stake === '5' && p.locked && !p.play, '... and Blue stays locked on a seeded run', JSON.stringify(p));
		// a run already in progress on a locked stake (started before unlocks, e.g. a tester's) resumes
		await page.evaluate(() => document.querySelector('.nr-modal .b-back').click());
		await page.evaluate(() => window.__micatro.newRun({ back: 'b_blue', stake: 7 }));
		await waitFor(() => page.evaluate(() => !!window.__micatro.view() && window.__micatro.idle()), 20000);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await waitFor(() => page.evaluate(() => window.__micatro.idle()), 20000);
		await sleep(600);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready && document.querySelector('.b-continue'))), 30000);
		await page.evaluate(() => document.querySelector('.b-continue').click());
		await waitFor(() => page.evaluate(() => !!window.__micatro.view() && window.__micatro.view().state === 'SELECTING_HAND'), 20000);
		const v = await page.evaluate(() => { const v = window.__micatro.view(); return { stake: v.stake, back: v.back, state: v.state }; });
		A(v.stake === 7 && v.back === 'b_blue' && v.state === 'SELECTING_HAND', 'a run in progress on a stake that\'s locked for its deck (Orange, Blue Deck) still resumes', JSON.stringify(v));
		// a challenge sets its own stake: never gated
		await ctx.close();
		const g2 = await open({ ls: { micatro_newrun: JSON.stringify({ back: 'b_red', stake: 8 }) } });
		await g2.page.evaluate(() => document.querySelector('.b-challenges').click());
		await waitFor(() => g2.page.evaluate(() => document.querySelectorAll('.ch-item').length > 0), 15000);
		await g2.page.evaluate(() => { document.querySelector('[data-ch="c_luxury_1"]').click(); });
		await sleep(150);
		await g2.page.evaluate(() => document.querySelector('.b-ch-start').click());
		await waitFor(() => g2.page.evaluate(() => !!window.__micatro.session && !!window.__micatro.view()), 20000);
		const rec = await g2.page.evaluate(() => window.__micatro.session.recipe);
		A(rec && rec.challenge === 'c_luxury_1' && rec.stake === 1, 'a challenge starts at its own stake (a guest with no wins), untouched by unlocks', JSON.stringify(rec && { c: rec.challenge, s: rec.stake }));
		A(!errors.length && !g2.errors.length, 'no page errors', [...errors, ...g2.errors].join(' | '));
		await g2.ctx.close();
	}
} catch (e) {
	fail++;
	console.log('FAIL: threw ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
