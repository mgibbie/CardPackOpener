// inventory_controls_test.mjs — a whole trade in the Inventory's trade window with ONE kind of control each.
// Owner, 2026-11-18: "Trading & Pocket Enhanced especially needs to be playable with every control type."
//   ann   a KEYBOARD only: arrows and WASD move the ring, Z confirms, X backs out, digits type an amount
//   bob   a CONTROLLER only: the d-pad, the two face buttons, and the on-screen keyboard for an amount
// No click, tap or pointer event is sent by either. (A mouse and a finger: inventory_trade_test.mjs, which runs the
// window by its buttons, at desktop and phone size.)
//   1. each opens "Trade with a friend" and the window: ask / accept
//   2. an amount: ann types 120 dust in the field and leaves it; bob enters 40 gold on the on-screen keyboard
//   3. a tab and a card: ann goes to Battlecards cards and puts one up; takes it back from her side; puts it up again
//   4. the window is asked about once a second: the ring stays where it was, and typing is not cut off, while the
//      other player changes their offer
//   5. Back never cancels a trade by itself; it does close the list of friends and the end screen
//   6. both lock in with confirm; after the countdown and the scene, both close the end screen; the swap happened
//   node overworld/tests/inventory_controls_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import { handleTrade } from '../../server/trade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9596;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; };
if (!fs.existsSync(path.join(ROOT, 'overworld/data/pokemon'))) { console.log('skip - overworld/data not present'); process.exit(0); }

const rows = new Map(); let seq = 0;
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setJSON: async (k, v) => { if (v === null) rows.delete(k); else rows.set(k, JSON.stringify(v)); },
	delete: async k => { rows.delete(k); },
	setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; },
	getWithLength: async k => (rows.has(k) ? { value: JSON.parse(rows.get(k)), n: rows.get(k).length } : { value: null, n: null }),
	setIfLength: async (k, v, n) => { const cur = rows.has(k) ? rows.get(k).length : null; if (cur !== n) return false; rows.set(k, JSON.stringify(v)); return true; },
};
const TOK = { ta: 'ann', tb: 'bob' };
rows.set('ann', JSON.stringify({ username: 'ann', friendCode: 'ANN001', decks: [], collection: { white_knight: 3 }, packs: 2, dust: 300, gold: 50, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] }));
rows.set('bob', JSON.stringify({ username: 'bob', friendCode: 'BOB001', decks: [], collection: {}, packs: 1, dust: 20, gold: 90, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['ann'] }));
const acct = u => JSON.parse(rows.get(u));
const json = (o, status) => ({ ...o, status: status || 200 });
async function api(b) {
	const user = TOK[b.token] || null, action = b.action, now = Date.now();
	if (/^trade-(open|mine|poll|update|lock|cancel|deposit|box|box-ack)$/.test(action)) return handleTrade({ action, body: b, store, username: user, json, now, maxOwned: 999, randCode: () => 'C' + String(++seq).padStart(5, '0'), challengeMs: 60_000 });
	if (action === 'challenge') { const l = (await store.get('challenge:' + b.to)) || []; await store.setJSON('challenge:' + b.to, [...l.filter(c => c.from !== user), { from: user, type: b.battleType, ts: now }]); return { ok: true }; }
	if (action === 'challenges') return { challenges: (await store.get('challenge:' + user)) || [] };
	if (action === 'friends') return { friends: user ? (acct(user).friends || []).map(f => ({ username: f, online: true })) : [] };
	if (action === 'micasurvivor-save-get') return { rev: 0, save: null };
	if (action === 'pkcol-get') return { rev: 0, col: null };
	if (action === 'ow-load') return { ow: null };
	return { ok: true, state: user ? acct(user) : null, friends: [], challenges: [], live: [] };
}
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { /* not JSON */ }
		b.token = String(req.headers.authorization || '').replace(/^Bearer /, '') || b.token;
		try { const r = await api(b); res.writeHead(r.status || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); } catch (e) { res.destroy(); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const open = async (tok, user, kind) => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1280, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((tok2, st) => {
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', tok2); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		}, tok, acct(user));
		await page.goto(`http://localhost:${PORT}/inventory/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__inventory && window.__inventory.ready)), 30000); await sleep(300);
		let wasd = false;
		const KEY = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], confirm: ['KeyZ'], cancel: ['KeyX'] };
		const BTN = { up: 12, down: 13, left: 14, right: 15, confirm: 1, cancel: 0 };
		const act = async a => {
			if (kind === 'keyboard') { const ks = KEY[a]; wasd = !wasd; await page.keyboard.press(ks[wasd && ks.length > 1 ? 1 : 0]); await sleep(70); }
			else { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, BTN[a]); await sleep(80); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, BTN[a]); await sleep(120); }
		};
		const where = (sel, focusSel) => page.evaluate((s, fs2) => { const f = fs2 ? document.querySelector(fs2) : (window.__focusnav && window.__focusnav.ringOn ? window.__focusnav.focused : null), c = e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, t = [...document.querySelectorAll(s)].filter(e => e.offsetWidth > 3 && !e.disabled)[0]; const name = e => e.id || e.dataset.k || e.dataset.amt || e.dataset.add || e.dataset.tab || e.textContent.trim().slice(0, 12); return { f: f && f.isConnected ? c(f) : null, fk: f && f.isConnected ? name(f) : null, t: t ? c(t) : null, at: !!(f && t && f === t) }; }, sel, focusSel || null);
		/** Walk the ring (or, with focusSel, the on-screen keyboard's own marker) to a control with direction presses alone. */
		const ringTo = async (sel, focusSel) => {
			const seen = new Map();
			for (let n = 0; n < 80; n++) {
				const w = await where(sel, focusSel); if (!w.t) return false; if (w.at) return true;
				if (!w.f) { await act('down'); continue; }
				const dx = w.t[0] - w.f[0], dy = w.t[1] - w.f[1], H = dx > 0 ? 'right' : 'left', V = dy > 0 ? 'down' : 'up';
				let order = Math.abs(dx) > Math.abs(dy) ? [H, V] : [V, H]; if (Math.abs(dx) < 6) order = [V]; if (Math.abs(dy) < 6) order = [H];
				const visits = (seen.get(w.fk) || 0) + 1; seen.set(w.fk, visits);
				if (visits > 2) order = [['up', 'down', 'left', 'right'][(n * 7 + visits) % 4], ...order];
				let moved = false;
				for (const d of order) { await act(d); if ((await where(sel, focusSel)).fk !== w.fk) { moved = true; break; } }
				if (!moved) for (const d of ['up', 'down', 'left', 'right']) { await act(d); if ((await where(sel, focusSel)).fk !== w.fk) break; }
			}
			return (await where(sel, focusSel)).at;
		};
		const press = async sel => { const ok = await ringTo(sel); if (ok) { await act('confirm'); await sleep(350); } return ok; };
		const q = (fn, ...a) => page.evaluate(fn, ...a);
		const cls = () => page.evaluate(() => (document.querySelector('.tw') || {}).className || '');
		const mine = () => page.evaluate(() => (window.__inventory.trade() || {}).mine || null);
		return { page, errors, act, where, ringTo, press, q, cls, mine, kind };
	};
	const ann = await open('ta', 'ann', 'keyboard'), bob = await open('tb', 'bob', 'controller');

	// ===== 1. the window =====
	A(await ann.press('#open-trade') && await waitFor(() => ann.q(() => !!document.querySelector('[data-k="ask:bob"]')), 8000), '[keyboard] ann walks the ring to "Trade with a friend" and opens it with Z', await ann.where('#open-trade'));
	// ===== 5a. Back closes the list of friends =====
	await ann.act('cancel'); await sleep(300);
	A(await ann.q(() => document.getElementById('trade').hidden) && (await ann.where('#open-trade')).at, '[keyboard] X backs out of the list of friends, and the ring is on the button again');
	await ann.act('confirm'); await waitFor(() => ann.q(() => !!document.querySelector('[data-k="ask:bob"]')), 8000);
	A(await ann.press('[data-k="ask:bob"]'), '[keyboard] she asks bob');
	A(await bob.press('#open-trade') && await waitFor(() => bob.q(() => !!document.querySelector('[data-k="accept:ann"]')), 8000) && await bob.press('[data-k="accept:ann"]'), '[controller] bob opens it with the d-pad and the confirm button, and accepts');
	A(await waitFor(async () => /win/.test(await ann.cls()) && /win/.test(await bob.cls()), 10000), 'the trade window is open for both');

	// ===== 2. an amount =====
	A(await ann.ringTo('[data-amt="dust"]'), '[keyboard] the Dust amount is a stop on the ring');
	await ann.act('confirm'); await sleep(250);
	A(await ann.q(() => document.activeElement && document.activeElement.dataset.amt === 'dust'), '[keyboard] Z puts the typing in the field');
	await ann.page.keyboard.type('12'); await sleep(200);
	// ===== 4a. the other player changes their offer while she is typing =====
	A(await bob.ringTo('[data-amt="gold"]'), '[controller] the Gold amount is a stop on the ring');
	await bob.act('confirm');
	A(await waitFor(() => bob.q(() => !!document.getElementById('osk')), 5000), '[controller] confirm opens the on-screen keyboard');
	for (const d of ['4', '0']) { await bob.ringTo(`#osk button[data-k="${d}"]`, '#osk button.osk-focus'); await bob.act('confirm'); }
	await bob.ringTo('#osk button[data-k="OK"]', '#osk button.osk-focus'); await bob.act('confirm'); await sleep(500);
	A((await bob.mine()).gold === 40 && !await bob.q(() => !!document.getElementById('osk')), '[controller] 4, 0, OK on it: bob offers 40 gold', await bob.mine());
	A(await waitFor(() => ann.q(() => /Gold/.test((document.querySelector('.half.theirs') || {}).textContent || '')), 6000), "ann's window shows bob's gold arriving");
	const typing = await ann.q(() => ({ amt: document.activeElement && document.activeElement.dataset && document.activeElement.dataset.amt, v: document.activeElement && document.activeElement.value }));
	A(typing.amt === 'dust' && typing.v === '12', '[keyboard] ...and her typing was not cut off: the field still has the 12 she typed, and the typing is still in it', typing);
	await ann.page.keyboard.type('0'); await ann.page.keyboard.press('Tab'); await sleep(500);
	A((await ann.mine()).dust === 120, '[keyboard] she types the 0 and leaves the field: 120 dust is offered', await ann.mine());

	// ===== 3. a tab and a card =====
	A(await ann.press('[data-tab="bc"]') && await ann.press('[data-add="bc:white_knight"]') && (await ann.mine()).cards.white_knight === 1, '[keyboard] the Battlecards cards tab, and a card put up', await ann.mine());
	A(await ann.press('.half.mine .slot[data-k="mine:bc:white_knight"]') && !(await ann.mine()).cards.white_knight, '[keyboard] Z on it on her side of the line takes it back', await ann.mine());
	A(await ann.press('[data-add="bc:white_knight"]') && (await ann.mine()).cards.white_knight === 1, '[keyboard] and she puts it up again');

	// ===== 4b. the ring stays put while the window is asked about =====
	await bob.ringTo('#tlock'); const b0 = await bob.where('#tlock');
	await sleep(2600);   // (two or three polls)
	const b1 = await bob.where('#tlock');
	A(b0.at && b1.at, '[controller] the ring is still on Lock in after the window has been asked about three times', [b0, b1]);

	// ===== 5b. Back never cancels a trade =====
	await ann.act('cancel'); await bob.act('cancel'); await sleep(500);
	A(/win/.test(await ann.cls()) && /win/.test(await bob.cls()) && (await ann.mine()).dust === 120, 'Back (X, and the controller\'s cancel) does not cancel the trade: the window and both offers are as they were');

	// ===== 6. lock in =====
	A(await ann.press('#tlock') && await waitFor(() => bob.q(() => !!document.querySelector('.half.theirs.locked')), 8000), '[keyboard] ann locks in with Z: bob sees her side locked');
	A(await bob.press('#tlock'), '[controller] bob locks in with the confirm button');
	A(await waitFor(async () => /end ok/.test(await ann.cls()) && /end ok/.test(await bob.cls()), 25000), 'the countdown runs, the cable scene plays, and both see "Trade complete!"', [await ann.cls(), await bob.cls()]);
	A(acct('ann').dust === 180 && acct('bob').dust === 140 && acct('ann').gold === 90 && acct('bob').gold === 50 && acct('bob').collection.white_knight === 1, 'the swap happened: 120 dust and a card for 40 gold', [acct('ann').dust, acct('bob').dust, acct('ann').gold, acct('bob').gold]);
	A(await ann.press('#tdone') && await ann.q(() => document.getElementById('trade').hidden), '[keyboard] ann closes the end screen with Z');
	await bob.act('cancel'); await sleep(500);
	A(await bob.q(() => document.getElementById('trade').hidden), '[controller] bob closes it with Back');
	A(!ann.errors.length && !bob.errors.length, 'no page errors', [...ann.errors, ...bob.errors].slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
