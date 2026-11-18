// trade_screen_test.mjs — the overworld game's own trade screen (overworld/ow_pvp.js, ow_screens.js drawTrade).
// Owner, 2026-11-18, of the Inventory's trade window: "upgrade that trade screen to work the same as this one".
// Two players in two running games, through the REAL trade, star-wallet and Pocket collection handlers:
//   1. the screen offers what the Inventory's window does: a MONEY category with stars, dust, gold, overworld money,
//      Game Corner coins and (with a save) MicaSurvivor coins and tickets; and packs of one Pocket booster
//   2. currencies go up by an amount per press that C changes (1, 10, 100, 1,000), never past what I have; X takes back
//   3. LOCK IN: my side is locked on both screens. Both locked in: a four-second countdown on both screens, and
//      nothing has moved. One unlocks: it stops. Both lock in again
//   4. the countdown runs out: the link-cable scene on both screens while the trade is carried out, then
//      "Trade complete" with what each received; the server's rows and both saves hold exactly the swap
//   5. a press closes the screen
//   6. a second trade with ONE kind of control each (owner, 2026-11-18: trading "needs to be playable with every
//      control type"): ann with real key presses only (arrows and WASD, Z, X, C), bob with a controller only (d-pad,
//      the face buttons, the shoulders), and the category names, a row and the amount hint by a tap / click
//   node overworld/tests/trade_screen_test.mjs     (TRADE_SHOTS=<dir> for a screenshot of each view)
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as C from '../../pocketenhanced/js/collection.js';
import { handleTrade } from '../../server/trade.mjs';
import { handlePkcol } from '../../server/pocket_collection.mjs';
import { handleStars } from '../../server/stars.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9251, SHOTS = process.env.TRADE_SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(120); } return false; };
if (!fs.existsSync(path.join(ROOT, 'overworld/data/pokemon'))) { console.log('skip - overworld/data not present'); process.exit(0); }
const MON = (id, name, level) => ({ speciesId: id, name, level, types: ['Normal'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, curHP: 60, maxHP: 60, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], exp: 100, nature: 'hardy', ability: 'runaway' });

// ---- the server: the real handlers, and just enough of the rest for two signed-in games
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
rows.set('ann', JSON.stringify({ username: 'ann', friendCode: 'ANN001', decks: [], collection: { fire_imp: 3 }, packs: 2, dust: 300, gold: 10, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] }));
rows.set('bob', JSON.stringify({ username: 'bob', friendCode: 'BOB001', decks: [], collection: {}, packs: 0, dust: 0, gold: 90, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['ann'] }));
rows.set('pkcol:ann', JSON.stringify({ rev: 1, col: { ...C.newCollection(), own: { ...(C.newCollection().own || {}), C: 3 } }, at: 1, ids: [] }));
rows.set('pkcol:bob', JSON.stringify({ rev: 1, col: C.newCollection(), at: 1, ids: [] }));
rows.set('stars:ann', JSON.stringify({ rev: 1, e: { devann01: 450 }, s: {}, at: 1 }));
rows.set('micasurvivor:ann', JSON.stringify({ rev: 2, save: { v: 3, coins: 800, tickets: { t1: 5, t10: 1 }, owned: { 25: { at: 1 } } } }));
rows.set('micasurvivor:bob', JSON.stringify({ rev: 1, save: { v: 3, coins: 10, tickets: { t1: 0, t10: 0 }, owned: {} } }));
const acct = u => JSON.parse(rows.get(u)), pcol = u => JSON.parse(rows.get('pkcol:' + u)).col, ms = u => JSON.parse(rows.get('micasurvivor:' + u)).save;
const wal = u => { const r = rows.has('stars:' + u) ? JSON.parse(rows.get('stars:' + u)) : null, t = o => Object.values(o || {}).reduce((x, y) => x + y, 0); return r ? t(r.e) - t(r.s) : 0; };
const json = (o, status) => ({ ...o, status: status || 200 });
async function api(b) {
	const user = TOK[b.token] || null, action = b.action, now = Date.now();
	if (/^trade-(open|mine|poll|update|lock|cancel|deposit|box|box-ack)$/.test(action)) return handleTrade({ action, body: b, store, username: user, json, now, maxOwned: 999, randCode: () => 'S' + String(++seq).padStart(5, '0'), challengeMs: 60_000 });
	if (action === 'trade-deliveries') return { deliveries: [] };
	if (action === 'pkcol-get') return handlePkcol({ action, body: b, store, username: user, json, now });
	if (action === 'stars-sync') return handleStars({ action, body: b, store, username: user, json, now });
	if (action === 'micasurvivor-save-get') { const r = await store.get('micasurvivor:' + user); return { rev: (r && r.rev) || 0, save: (r && r.save) || null }; }
	if (action === 'challenge') { const l = (await store.get('challenge:' + b.to)) || []; await store.setJSON('challenge:' + b.to, [...l.filter(c => c.from !== user), { from: user, type: b.battleType, ts: now }]); return { ok: true }; }
	if (action === 'challenges') return { challenges: (await store.get('challenge:' + user)) || [] };
	if (action === 'ow-load') return { ow: null };
	if (action === 'ow-save') return { ok: true };
	return { ok: true, state: user ? acct(user) : null, friends: [], challenges: [], live: [] };
}
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) { /* not JSON */ }
		b.token = String(req.headers.authorization || '').replace(/^Bearer /, '');
		try { const r = await api(b); res.writeHead(r.status || 200, { 'content-type': 'application/json' }); res.end(JSON.stringify(r)); } catch (e) { res.destroy(); }
		return;
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const errors = [];
	const open = async (who, token, party, bag, money, coins) => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1100, height: 760 });
		page.on('pageerror', e => errors.push(who + ': ' + e.message));
		await page.evaluateOnNewDocument((token2, st, party2, bag2, money2, coins2) => {
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', token2); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'hoenn'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party2)); localStorage.setItem('magepunk_box_v1', '[]'); localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag2));
			localStorage.setItem('magepunk_money', String(money2)); localStorage.setItem('magepunk_coins_v1', String(coins2));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, token, acct(who), party, bag, money, coins);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route114&x=27&y=41`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'Route114')), 45000); await sleep(800);
		return { who, page, ok,
			purse: () => page.evaluate(() => ({ money: +localStorage.getItem('magepunk_money'), coins: +localStorage.getItem('magepunk_coins_v1') })),
			win: () => page.evaluate(async () => { const { trade, TRADE_CATS, TRADE_STEPS } = await import('./ow_menustate.js'), Sc = await import('./ow_screens.js'); return { open: trade.open, id: trade.id, phase: trade.phase, done: trade.done, status: trade.status, view: trade.open ? Sc.tradeView() : null, idx: trade.idx, at: trade.rows[trade.idx] ? (trade.rows[trade.idx].key || trade.rows[trade.idx].id || trade.rows[trade.idx].kind) : null, cat: TRADE_CATS[trade.cat], step: TRADE_STEPS[trade.step], rows: trade.rows.map(r => r.kind + ':' + (r.key || r.id || '') + ':' + (r.owned == null ? '' : r.owned) + ':' + (r.off || 0)), labels: trade.rows.map(r => r.label), mine: trade.mine, theirs: trade.theirs, myAccept: trade.myAccept, theirAccept: trade.theirAccept, counting: trade.goAt > 0, ms: trade.ms, stars: trade.stars, pk: !!trade.pk, pkc: !!trade.pkc, lines: trade.final ? [Sc.offerLines(trade.final.offerA), Sc.offerLines(trade.final.offerB)] : null }; }),
			// the screen's own keys: go to a category, put the cursor on a row, press
			go: cat => page.evaluate(async cat2 => { const { trade, TRADE_CATS } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); for (let g = 0; g < 9 && TRADE_CATS[trade.cat] !== cat2; g++) P.tradeKey('ArrowRight'); }, cat),
			on: (find, key, n = 1) => page.evaluate(async (find2, key2, n2) => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); for (let k = 0; k < n2; k++) { const i = trade.rows.findIndex(r => (r.key || r.id || r.kind) === find2); if (i < 0) return 'no row ' + find2; trade.idx = i; P.tradeKey(key2); } return 'ok'; }, find, key, n),
			key: k => page.evaluate(async k2 => { const P = await import('./ow_pvp.js'); P.tradeKey(k2); }, k),
			// one real control at a time: a key press, a controller button, a click on the canvas where a control is drawn
			real: async code => { await page.bringToFront(); await page.keyboard.press(code); await sleep(90); },
			btn: async b => { await page.evaluate(b2 => { window.__pad.buttons[b2] = { pressed: true, value: 1 }; }, b); await sleep(90); await page.evaluate(b2 => { window.__pad.buttons[b2] = { pressed: false, value: 0 }; }, b); await sleep(130); },
			tapUi: async id => { await page.bringToFront(); const p = await page.evaluate(async id2 => { const { S } = await import('./ow_state.js'), { sctx } = await import('./ow_core.js'); const b = (S.menuUi || []).find(x => x.id === id2); if (!b) return null; const c = sctx.canvas, r = c.getBoundingClientRect(); return [r.left + (b.x + b.w / 2) * r.width / c.width, r.top + (b.y + b.h / 2) * r.height / c.height]; }, id); if (!p) return false; await page.mouse.click(p[0], p[1]); await sleep(200); return true; },
		};
	};
	const ann = await open('ann', 'ta', [MON('pidgey', 'PIDGEY', 20), MON('zigzagoon', 'ZIGZAGOON', 8)], { potion: 5 }, 3000, 120);
	const bob = await open('bob', 'tb', [MON('abra', 'ABRA', 9)], { nugget: 2 }, 500, 40);
	A(ann.ok && bob.ok, 'two signed-in players are in the overworld');
	const shot = async (p, name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); await p.page.evaluate(() => window.__ow.dialog.close?.()); await sleep(250); await p.page.screenshot({ path: path.join(SHOTS, name + '.png') }); };

	await ann.page.evaluate(async () => { const P = await import('./ow_pvp.js'); window.__ow.dialog.close?.(); P.startTrade({ username: 'bob' }); });
	await waitFor(() => rows.has('challenge:bob') && JSON.parse(rows.get('challenge:bob')).some(c => c.type === 'trade'), 8000);
	await bob.page.evaluate(async () => { const P = await import('./ow_pvp.js'); await P.acceptChallengeFrom('ann'); });
	A(await waitFor(async () => { const a = await ann.win(), b = await bob.win(); return a.open && b.open && a.pk && b.pk && a.pkc && a.ms && b.ms && a.stars === 450; }, 20000), 'ann asks, bob accepts: the trade screen opens for both, with what each holds on the account', [await ann.win(), await bob.win()].map(w => [w.open, w.pk, w.ms, w.stars]));

	// ===== 1. what can be offered =====
	const w0 = await ann.win();
	A(w0.cat === 'MONEY' && w0.rows.join(' ') === 'amt:stars:450:0 amt:dust:300:0 amt:gold:10:0 amt:money:3000:0 amt:coins:120:0 amt:mscoins:800:0 amt:mst1:5:0 amt:mst10:1:0 accept:::0 cancel:::0' && w0.labels[8] === 'LOCK IN', 'the screen opens on MONEY: stars 450, dust 300, gold 10, money 3,000, Game Corner coins 120, MicaSurvivor coins 800, tickets 5 and 10-pull tickets 1; then LOCK IN and CANCEL', w0.rows);
	await ann.go('PK PACKS');
	A((await ann.win()).rows.some(r => r === 'pkown:C:3:0') && (await ann.win()).labels.some(l => / Pack$/.test(l) && l !== 'Pocket Pack'), 'PK PACKS lists her three packs of one booster, by the booster\'s name', [(await ann.win()).rows, (await ann.win()).labels]);
	await ann.on('C', 'z');
	await ann.go('MONEY');

	// ===== 2. currencies =====
	await ann.on('mst1', 'z', 2);
	await ann.key('c'); await ann.key('c');
	const step = (await ann.win()).step;
	await ann.on('money', 'z', 3);
	await ann.key('c');
	await ann.on('stars', 'z', 1);   // (1,000 a press, with 450: stops at what she has)
	const w2 = await ann.win();
	A(step === 100 && w2.step === 1000 && w2.mine.ms.t1 === 2 && w2.mine.money === 300 && w2.mine.stars === 450, 'C changes the amount per press (1, 10, 100, 1,000): 2 tickets one at a time, 300 money in three presses of 100, and a press of 1,000 stars stops at the 450 she has', [step, w2.step, w2.mine.ms, w2.mine.money, w2.mine.stars]);
	await ann.key('c'); await ann.key('c'); await ann.key('c');   // back round to 100
	await ann.on('stars', 'x', 2);
	A((await ann.win()).mine.stars === 250 && (await ann.win()).step === 100, 'X takes back by the same amount: 450 - 200 = 250 stars');
	await bob.key('c');
	await bob.on('gold', 'z', 4); await bob.on('coins', 'z', 1); await bob.key('c'); await bob.key('c'); await bob.key('c'); await bob.on('coins', 'z', 5);
	A(await waitFor(async () => { const a = await ann.win(), b = await bob.win(); return a.theirs.gold === 40 && a.theirs.coins === 15 && b.theirs.stars === 250 && b.theirs.money === 300 && b.theirs.ms.t1 === 2 && b.theirs.pk.own.C === 1; }, 10000), "each sees the other's offer: bob 40 gold and 15 coins; ann 250 stars, 300 money, 2 MicaSurvivor tickets and a booster pack", [(await ann.win()).theirs, (await bob.win()).theirs]);
	await shot(bob, 'trade_screen_1_offers');

	// ===== 3. lock in, the countdown =====
	await ann.on('accept', 'z');
	A(await waitFor(async () => (await bob.win()).theirAccept && (await ann.win()).myAccept && /LOCKED IN/.test((await ann.win()).labels.join()), 8000) && (await bob.win()).view === 'offers' && /ann has locked in/.test((await bob.win()).status), 'ann locks in: her side is locked on both screens, and bob is told to check her side', [(await ann.win()).labels, (await bob.win()).status]);
	await shot(bob, 'trade_screen_2_locked');
	await bob.on('accept', 'z');
	A(await waitFor(async () => (await ann.win()).view === 'countdown' && (await bob.win()).view === 'countdown', 6000), 'bob locks in: a countdown on both screens');
	await shot(ann, 'trade_screen_3_countdown');
	A(wal('ann') === 450 && acct('bob').gold === 90 && (await ann.purse()).money === 3000 && ms('ann').tickets.t1 === 5 && (await ann.win()).phase === 'talk', 'nothing has moved while it counts down');
	await bob.on('accept', 'z');
	A(await waitFor(async () => (await ann.win()).view === 'offers' && (await bob.win()).view === 'offers' && !(await ann.win()).theirAccept, 6000), 'bob unlocks: the countdown stops on both screens');
	await sleep(4500);
	A((await ann.win()).phase === 'talk' && wal('ann') === 450, 'and four seconds later nothing has happened');
	await bob.on('accept', 'z');
	await waitFor(async () => (await ann.win()).view === 'countdown', 6000);
	const t0 = Date.now();

	// ===== 4. the cable scene, then what each received =====
	A(await waitFor(async () => (await ann.win()).view === 'scene' && (await bob.win()).view === 'scene', 9000), 'the countdown runs out: the link-cable scene on both screens', [(await ann.win()).view, (await bob.win()).view]);
	const waited = Date.now() - t0;
	A(waited > 2500, `(the trade began about four seconds after both locked in: ${waited} ms)`);
	await sleep(700); await shot(ann, 'trade_screen_4_cable');
	A(await waitFor(async () => (await ann.win()).view === 'end' && (await bob.win()).view === 'end', 20000), 'then "Trade complete" on both screens', [(await ann.win()).view, (await bob.win()).view, (await ann.win()).status]);
	await shot(ann, 'trade_screen_5_end');
	const e = await ann.win();
	A(e.lines && e.lines[1].join(' | ') === 'Gold x40 | Game Corner coins x15' && /Stars x250/.test(e.lines[0].join()) && /Money \$300/.test(e.lines[0].join()) && /MicaSurvivor tickets x2/.test(e.lines[0].join()) && e.lines[0].some(l => / Pack x1 \(Pocket\)$/.test(l)), 'the end screen lists what each received: ann 40 gold and 15 coins; bob 250 stars, $300, 2 MicaSurvivor tickets and the booster pack', e.lines);
	A(wal('ann') === 200 && wal('bob') === 250 && acct('ann').gold === 50 && acct('bob').gold === 50 && ms('ann').tickets.t1 === 3 && ms('bob').tickets.t1 === 2 && pcol('ann').own.C === 2 && pcol('bob').own.C === ((C.newCollection().own || {}).C || 0) + 1, 'on the server: 250 stars, 40 gold, 2 tickets and the booster pack have changed hands', [wal('ann'), wal('bob'), acct('ann').gold, ms('ann').tickets, ms('bob').tickets]);
	A(await waitFor(async () => { const a = await ann.purse(), b = await bob.purse(); return a.money === 2700 && a.coins === 135 && b.money === 800 && b.coins === 25; }, 15000), 'in the saves: ann has $2,700 and 135 coins, bob $800 and 25 coins', [await ann.purse(), await bob.purse()]);
	A(!acct('ann').tradeHeld && !acct('bob').tradeHeld && !JSON.parse(rows.get('stars:ann')).th && !JSON.parse(rows.get('micasurvivor:ann')).th && !pcol('ann').escrow, 'nothing is left held');

	// ===== 5. a press closes it =====
	await ann.key('z'); await bob.key('z');
	A(!(await ann.win()).open && !(await bob.win()).open, 'a press closes the screen');
	const tst = p => p.page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'); return { state: window.__states()['overworld.trade'].state, left: [trade.done, trade.applied, trade.scene, trade.goAt, trade.myAccept, trade.phase].join() }; });
	A((await tst(ann)).state === 'closed' && (await tst(ann)).left === 'false,false,0,0,false,talk' && (await tst(bob)).left === 'false,false,0,0,false,talk', '[states] the closed screen keeps nothing of the trade it showed (it used to keep done, applied, the scene and the locks until the next one opened)', [await tst(ann), await tst(bob)]);

	// ===== 6. one kind of control each =====
	rows.delete('challenge:bob');
	await ann.page.evaluate(async () => { const P = await import('./ow_pvp.js'); window.__ow.dialog.close?.(); P.startTrade({ username: 'bob' }); });
	await waitFor(() => rows.has('challenge:bob') && JSON.parse(rows.get('challenge:bob')).some(c => c.type === 'trade'), 8000);
	await bob.page.evaluate(async () => { const P = await import('./ow_pvp.js'); await P.acceptChallengeFrom('ann'); });
	A(await waitFor(async () => (await ann.win()).open && (await bob.win()).open && (await ann.win()).ms && (await bob.win()).pk, 20000), '(a second trade screen is open for both)');
	for (const p of [ann, bob]) await p.page.evaluate(() => window.__ow.dialog.close?.());
	// ---- ann: a keyboard
	await ann.real('ArrowDown'); const k1 = (await ann.win()).at; await ann.real('KeyS'); const k2 = (await ann.win()).at; await ann.real('KeyW'); const k3 = (await ann.win()).at;
	A(k1 === 'dust' && k2 === 'gold' && k3 === 'dust', '[keyboard] Down arrow, then S, then W move the cursor: dust, gold, dust', [k1, k2, k3]);
	await ann.real('KeyC'); await ann.real('KeyZ'); await ann.real('KeyZ'); await ann.real('KeyZ'); await ann.real('KeyX');
	A((await ann.win()).step === 10 && (await ann.win()).mine.dust === 20, '[keyboard] C makes it 10 a press, Z three times puts up 30 dust, X takes 10 back: 20', [(await ann.win()).step, (await ann.win()).mine.dust]);
	await ann.real('ArrowRight'); const c1 = (await ann.win()).cat; await ann.real('KeyD'); const c2 = (await ann.win()).cat; await ann.real('KeyA'); await ann.real('ArrowLeft');
	A(c1 === 'CARDS' && c2 === 'PACKS' && (await ann.win()).cat === 'MONEY', '[keyboard] Right arrow and D go on a category, A and Left arrow come back', [c1, c2, (await ann.win()).cat]);
	// ---- bob: a controller (the owner's standard layout: the right face button confirms, the bottom one backs out)
	await bob.btn(13); await bob.btn(13);
	A((await bob.win()).at === 'gold', '[controller] the d-pad moves the cursor down to gold', (await bob.win()).at);
	await bob.btn(3); await bob.btn(1); await bob.btn(1); await bob.btn(0);
	A((await bob.win()).step === 10 && (await bob.win()).mine.gold === 10, '[controller] the top face button makes it 10 a press, confirm twice puts up 20 gold, the back button takes 10 back: 10', [(await bob.win()).step, (await bob.win()).mine.gold]);
	await bob.btn(5); const s1 = (await bob.win()).cat; await bob.btn(4);
	A(s1 === 'CARDS' && (await bob.win()).cat === 'MONEY', '[controller] the shoulder buttons change category and come back', [s1, (await bob.win()).cat]);
	const hint = await bob.page.evaluate(async () => (await import('./ow_gamepad.js')).padHints());
	A(/add \/ lock in/.test(hint) && /take back/.test(hint) && /amount per press/.test(hint) && /category/.test(hint), '[controller] the hint line says what each button does on this screen', hint);
	// ---- a tap / click on what is drawn
	const iItems = await ann.page.evaluate(async () => (await import('./ow_menustate.js')).TRADE_CATS.indexOf('ITEMS'));
	A(await ann.tapUi('tradecat:' + iItems) && (await ann.win()).cat === 'ITEMS', '[touch / mouse] a tap on the ITEMS category name goes to it', (await ann.win()).cat);
	const iPotion = (await ann.win()).rows.findIndex(r => /^item:potion/.test(r));
	A(iPotion >= 0 && await ann.tapUi('trade:' + iPotion) && (await ann.win()).mine.items.length === 1, '[touch / mouse] a tap on the Potion row puts one up', (await ann.win()).mine.items);
	await ann.tapUi('tradecat:0'); const stepWas = (await ann.win()).step;
	A(await ann.tapUi('tradestep:0') && (await ann.win()).step !== stepWas, '[touch / mouse] a tap on the amount hint changes the amount per press', [stepWas, (await ann.win()).step]);
	await waitFor(async () => (await bob.win()).theirs.dust === 20 && (await bob.win()).theirs.items.length === 1 && (await ann.win()).theirs.gold === 10, 10000);
	// ---- lock in: ann with the keyboard, bob with the controller
	for (let n = 0; n < 14 && (await ann.win()).at !== 'accept'; n++) await ann.real(n % 2 ? 'KeyS' : 'ArrowDown');
	await ann.real('KeyZ');
	A(await waitFor(async () => (await bob.win()).theirAccept, 8000), "[keyboard] ann moves down to LOCK IN and presses Z: locked on bob's screen");
	for (let n = 0; n < 14 && (await bob.win()).at !== 'accept'; n++) await bob.btn(13);
	await bob.btn(1);
	A(await waitFor(async () => (await ann.win()).view === 'end' && (await bob.win()).view === 'end', 30000), '[controller] bob locks in with the confirm button: countdown, cable scene, and "Trade complete" on both', [(await ann.win()).view, (await bob.win()).view]);
	A(acct('ann').dust === 280 && acct('bob').dust === 20 && acct('ann').gold === 60 && acct('bob').gold === 40, 'on the server: 20 dust for 10 gold', [acct('ann').dust, acct('bob').dust, acct('ann').gold, acct('bob').gold]);
	await ann.real('KeyZ'); await bob.btn(1);
	A(await waitFor(async () => !(await ann.win()).open && !(await bob.win()).open, 5000), 'Z closes it for ann, the confirm button for bob');
	const probs = [...await ann.page.evaluate(() => window.__states.problems()), ...await bob.page.evaluate(() => window.__states.problems())];
	A(probs.length === 0 && (await tst(ann)).state === 'closed', '[states] through two whole trades the watcher noted nothing on either game: no illegal state, no move that is not declared', probs);
	A(errors.length === 0, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
