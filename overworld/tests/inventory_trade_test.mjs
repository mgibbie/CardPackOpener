// inventory_trade_test.mjs — the site's one Inventory (inventory/) and its trade window, two players in two browsers,
// through the REAL trade, star-wallet and Pocket collection handlers over an in-memory row store.
//   1. the Inventory shows everything a player owns in every game: stars, dust, gold, Battlecards cards and packs,
//      Pocket Enhanced cards, packs and booster packs, MicaSurvivor coins and tickets, and the overworld's money,
//      coins, bag and Pokémon (this device). A guest sees what is on the device and is asked to sign in to trade.
//   2. ann asks bob to trade; bob accepts; the same window opens for both: my offer | a line | theirs
//   3. ann puts up stars, dust, a Battlecards card and a Charizard pack; bob gold and a Pocket card; each sees the
//      other's offer across the line; nothing has moved
//   4. ann locks in: her side shows LOCKED IN on both screens. bob locks in: a four-second countdown on both screens,
//      and still nothing has moved. bob backs out: it stops. Both lock in again
//   5. the countdown runs out: the link-cable scene on both screens, then "Trade complete!" with what each received;
//      the server's rows hold exactly the swap, nothing is left held, and each Inventory shows the new amounts
//   6. a second trade is cancelled by one player: the other is told, and nothing has moved
//   7. on a phone the two offers are still side by side with the line between, and nothing overflows sideways
//   node overworld/tests/inventory_trade_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as C from '../../pocketenhanced/js/collection.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { handleTrade } from '../../server/trade.mjs';
import { handlePkcol } from '../../server/pocket_collection.mjs';
import { handleStars } from '../../server/stars.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9589, SHOTS = process.env.INVENTORY_SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; };
if (!fs.existsSync(path.join(ROOT, 'overworld/data/pokemon'))) { console.log('skip - overworld/data not present'); process.exit(0); }

// ---- the server: the real handlers, and just enough of the rest for two signed-in pages
const D1 = PRINTS.filter(p => p[2] === '1D').map(p => p[0]);
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
rows.set('ann', JSON.stringify({ username: 'ann', friendCode: 'ANN001', decks: [], collection: { white_knight: 3, fireball: 1 }, packs: 2, dust: 300, gold: 50, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] }));
rows.set('bob', JSON.stringify({ username: 'bob', friendCode: 'BOB001', decks: [], collection: { fireball: 2 }, packs: 3, dust: 20, gold: 90, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['ann'] }));
rows.set('pkcol:ann', JSON.stringify({ rev: 1, col: { ...C.newCollection(), packs: 2 }, at: 1, ids: [] }));
rows.set('pkcol:bob', JSON.stringify({ rev: 1, col: { ...C.newCollection(), prints: { ...C.newCollection().prints, [D1[40]]: 2 } }, at: 1, ids: [] }));
rows.set('stars:ann', JSON.stringify({ rev: 1, e: { devann01: 700 }, s: { devann01: 100 }, at: 1 }));
rows.set('micasurvivor:ann', JSON.stringify({ rev: 4, save: { v: 3, coins: 1234, tickets: { t1: 7, t10: 2 }, owned: { 25: { at: 1 }, 4: { at: 1 }, 7: { at: 1 } } } }));
const acct = u => JSON.parse(rows.get(u)), pcol = u => JSON.parse(rows.get('pkcol:' + u)).col;
const wal = u => { const r = rows.has('stars:' + u) ? JSON.parse(rows.get('stars:' + u)) : null, t = o => Object.values(o || {}).reduce((x, y) => x + y, 0); return r ? { n: t(r.e) - t(r.s), th: r.th || null } : { n: 0, th: null }; };
const json = (o, status) => ({ ...o, status: status || 200 });
async function api(b) {
	const user = TOK[b.token] || null, action = b.action, now = Date.now();
	if (/^trade-(open|mine|poll|update|lock|cancel|deposit|box|box-ack)$/.test(action)) return handleTrade({ action, body: b, store, username: user, json, now, maxOwned: 999, randCode: () => 'V' + String(++seq).padStart(5, '0'), challengeMs: 60_000 });
	if (action === 'pkcol-get') return handlePkcol({ action, body: b, store, username: user, json, now });
	if (action === 'stars-sync') return handleStars({ action, body: b, store, username: user, json, now });
	if (action === 'micasurvivor-save-get') { const r = await store.get('micasurvivor:' + user); return { rev: (r && r.rev) || 0, save: (r && r.save) || null }; }
	if (action === 'challenge') { const l = (await store.get('challenge:' + b.to)) || []; await store.setJSON('challenge:' + b.to, [...l.filter(c => c.from !== user), { from: user, type: b.battleType, ts: now }]); return { ok: true }; }
	if (action === 'challenges') return { challenges: (await store.get('challenge:' + user)) || [] };
	if (action === 'friends') return { friends: user ? (acct(user).friends || []).map(f => ({ username: f, online: true })) : [] };
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

const MON = { speciesId: 'pikachu', name: 'PIKACHU', level: 20, sprite: 's800.png', num: 25 };
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const open = async (tok, user, vp) => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport(vp || { width: 1280, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((tok2, st, mon) => {
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			if (tok2) { localStorage.setItem('magepunk_mp_token_v1', tok2); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
			localStorage.setItem('magepunk_party_v1', JSON.stringify([mon])); localStorage.setItem('magepunk_bag_v1', JSON.stringify({ potion: 5, pokeball: 3 }));
		}, tok, user ? acct(user) : null, MON);
		await page.goto(`http://localhost:${PORT}/inventory/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__inventory && window.__inventory.ready)), 30000);
		const q = fn => page.evaluate(fn);
		const chips = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.wallet .chip')].map(c => [c.dataset.k, +c.querySelector('b').textContent.replace(/,/g, '')])));
		const click = async sel => { const r = await page.evaluate(s2 => { const e = document.querySelector(s2); if (!e) return 'no ' + s2 + ' on the page of ' + ((window.__inventory.inv() || {}).name || 'guest') + ': ' + ((document.querySelector('.tw') || document.body).innerText || '').slice(0, 300); e.scrollIntoView({ block: 'center' }); e.click(); return null; }, sel); if (r) throw new Error(r); await sleep(250); };
		const win = () => page.evaluate(() => { const side = k => { const hh = document.querySelector(`.tw .half.${k}`); return hh ? { locked: hh.classList.contains('locked'), who: hh.querySelector('.who').childNodes[0].textContent, rows: [...hh.querySelectorAll('.slot')].map(s2 => s2.querySelector('.sn').childNodes[0].textContent + ' ' + s2.querySelector('.sc').textContent) } : null; }; const tw = document.querySelector('.tw'); return { cls: tw ? tw.className : '', title: tw ? tw.querySelector('h2').textContent : '', mine: side('mine'), theirs: side('theirs'), status: (document.getElementById('tstatus') || {}).textContent || '', count: (document.getElementById('tcount') || {}).textContent || null, divider: !!document.querySelector('.tw .divider') }; });
		return { ctx, page, errors, q, chips, click, win };
	};

	// ===== 1. the Inventory =====
	const guest = await open(null, null);
	const g = await guest.chips();
	A(g.stars === 0 && g.money >= 0 && !('dust' in g) && !('bcpacks' in g) && await guest.q(() => /Sign in to trade/.test(document.getElementById('open-trade').textContent) && !!document.querySelector('[data-k="pokemon"]') && /PIKACHU/.test(document.querySelector('[data-k="pokemon"]').textContent) && /not signed in/.test(document.getElementById('content').textContent)), 'a guest sees what is on the device (stars, the overworld Pokémon and bag) and is asked to sign in to see the rest and to trade', g);
	await guest.ctx.close();
	const ann = await open('ta', 'ann'), bob = await open('tb', 'bob');
	const ca = await ann.chips(), cb = await bob.chips(), n0 = C.newCollection();
	A(ca.stars === 600 && ca.dust === 300 && ca.gold === 50 && ca.bcpacks === 2 && ca.pkpacks === 2 + C.ownPacks(n0) && ca.pkpoints === 0 && ca.mscoins === 1234 && ca.mst1 === 7 && ca.mst10 === 2 && 'money' in ca && 'coins' in ca, "ann's wallet row: 600 stars, 300 dust, 50 gold, 2 Battlecards packs, her Pocket packs, MicaSurvivor's 1,234 coins and 7 + 2 tickets, and the overworld's money and coins", ca);
	const secs = await ann.q(() => Object.fromEntries([...document.querySelectorAll('section.sec')].map(s2 => [s2.dataset.k, s2.textContent])));
	A(/2 different cards/.test(secs.battlecards) && /4 copies/.test(secs.battlecards) && /Charizard pack/.test(secs.pocket) && /×5/.test(secs.pocket) && /different cards/.test(secs.pocket) && /7 tickets/.test(secs.micasurvivor) && /3 Pokémon/.test(secs.micasurvivor) && /PIKACHU/.test(secs.pokemon) && /Lv 20/.test(secs.pokemon) && /on your account/.test(secs.battlecards) && /on this device/.test(secs.bag), 'and a section for each game: Battlecards, Pocket Enhanced (with each booster\'s packs), MicaSurvivor, the overworld\'s Pokémon and bag; each says where it is kept', Object.keys(secs));
	A(cb.stars === 0 && cb.gold === 90 && !('mscoins' in cb), 'bob (no stars yet, no MicaSurvivor save) sees his own: 90 gold, and no MicaSurvivor row', cb);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await ann.page.screenshot({ path: path.join(SHOTS, 'inventory_1.png'), fullPage: true }); }

	// ===== 2. the window opens for both =====
	await ann.click('#open-trade'); await bob.click('#open-trade');
	A(await waitFor(() => ann.q(() => !!document.querySelector('[data-k="ask:bob"]')), 8000), 'ann presses Trade with a friend: her friends are listed');
	await ann.click('[data-k="ask:bob"]');
	A(await waitFor(() => bob.q(() => !!document.querySelector('[data-k="accept:ann"]')), 8000), "bob's list shows that ann has asked");
	await bob.click('[data-k="accept:ann"]');
	A(await waitFor(async () => /win/.test((await ann.win()).cls) && /win/.test((await bob.win()).cls), 10000), 'bob accepts: the trade window opens on both screens');
	let wa = await ann.win(), wb = await bob.win();
	A(wa.title === 'Trading with bob' && wb.title === 'Trading with ann' && wa.divider && wa.mine.who === 'ann' && wa.theirs.who === 'bob' && wb.mine.who === 'bob' && wb.theirs.who === 'ann' && !wa.mine.rows.length && !wa.theirs.rows.length, 'each sees their own offer on one side of the line and the other player\'s on the other; both are empty', [wa.mine, wa.theirs]);

	// ===== 3. offers =====
	const amount = async (p, k, n) => { await p.page.evaluate((k2, n2) => { const i = document.querySelector(`[data-amt="${k2}"]`); i.value = String(n2); i.dispatchEvent(new Event('change')); }, k, n); await sleep(200); };
	await amount(ann, 'stars', 250); await amount(ann, 'dust', 120);
	await ann.click('[data-tab="bc"]'); await ann.click('[data-add="bc:white_knight"]');
	await ann.click('[data-tab="packs"]'); await ann.click('[data-add="own:C"]');
	await ann.click('[data-tab="money"]');
	await amount(ann, 'stars', 99999); await sleep(100);   // (more than she has is brought down to what she has... then set back)
	const capped = await ann.q(() => window.__inventory.trade().mine.stars);
	await amount(ann, 'stars', 250);
	await bob.click('[data-tab="money"]'); await amount(bob, 'gold', 40);
	await bob.click('[data-tab="pk"]'); await bob.click(`[data-add="pk:${D1[40]}"]`);
	A(capped === 600, 'an amount above what she has is brought down to what she has (600 stars)', capped);
	A(await waitFor(async () => (await bob.win()).theirs.rows.length === 4 && (await ann.win()).theirs.rows.length === 2, 8000), 'each sees the other\'s offer appear across the line');
	wa = await ann.win(); wb = await bob.win();
	A(wb.theirs.rows.join(' | ') === 'Stars ×250 | Dust ×120 | White Knight ×1 | Charizard pack ×1' && wa.theirs.rows[0] === 'Gold ×40' && /×1$/.test(wa.theirs.rows[1]) && wa.mine.rows.length === 4, "bob sees ann's 250 stars, 120 dust, White Knight and a Charizard pack by name; ann sees bob's 40 gold and his Pocket card", [wb.theirs.rows, wa.theirs.rows]);
	A(acct('ann').dust === 300 && wal('ann').n === 600 && acct('bob').gold === 90 && C.packsOf(pcol('ann'), 'C') === 5, 'nothing has moved on the server while they are talking');
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'inventory_2_window.png') });

	// ===== 4. locking in, and the countdown =====
	await ann.click('#tlock');
	A(await waitFor(async () => (await bob.win()).theirs.locked && (await ann.win()).mine.locked, 6000), 'ann locks in: her side shows LOCKED IN on both screens');
	A(/has locked in/.test((await bob.win()).status) && /Waiting for bob/.test((await ann.win()).status) && await ann.q(() => /Unlock/.test(document.getElementById('tlock').textContent) && /locked in/.test(document.getElementById('tpick').textContent)), 'bob is told she has; ann waits for him, her button now says Unlock, and her things cannot be changed while she is locked in');
	await bob.click('#tlock');
	A(await waitFor(async () => !!(await ann.win()).count && !!(await bob.win()).count, 6000), 'bob locks in: a countdown shows on both screens');
	wa = await ann.win();
	A(/counting/.test(wa.cls) && /^[1-4]$/.test(wa.count) && /Trading in/.test(wa.status) && /back out/.test(wa.status) && acct('ann').dust === 300 && wal('ann').n === 600 && acct('bob').gold === 90, 'it counts down from four, says either can still back out, and nothing has moved yet', wa);
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'inventory_3_countdown.png') });
	await bob.click('#tlock');
	A(await waitFor(async () => !(await ann.win()).count && !(await ann.win()).theirs.locked && (await ann.win()).mine.locked, 6000), 'bob backs out during the countdown: it stops on both screens, and ann is still locked in');
	await sleep(4500);
	A(/win/.test((await ann.win()).cls) && acct('ann').dust === 300 && acct('bob').gold === 90, 'and four seconds later nothing has happened');
	await bob.click('#tlock');
	A(await waitFor(async () => !!(await ann.win()).count, 6000), 'he locks in again: the countdown starts over');

	// ===== 5. the trade =====
	A(await waitFor(async () => /scene/.test((await ann.win()).cls) && /scene/.test((await bob.win()).cls), 9000), 'when it runs out, the link-cable scene plays on both screens');
	A(await ann.q(() => document.querySelectorAll('.cable .unit').length === 2 && !!document.querySelector('.cable .wire .pulse.out') && !!document.querySelector('.cable .wire .pulse.in') && /ann/.test(document.querySelector('.unit.left .screen').textContent) && /bob/.test(document.querySelector('.unit.right .screen').textContent)), 'two handhelds joined by a cable, with each player\'s bundle travelling along it');
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'inventory_4_scene.png') });
	A(await waitFor(async () => /end ok/.test((await ann.win()).cls) && /end ok/.test((await bob.win()).cls), 12000), 'then "Trade complete!" on both');
	const got = await ann.q(() => ({ got: [...document.querySelectorAll('#tgot li')].map(l => l.textContent.replace(/\s+/g, ' ').trim()), gave: [...document.querySelectorAll('#tgave li')].map(l => l.textContent.replace(/\s+/g, ' ').trim()) }));
	A(got.got.length === 2 && /Gold ×40/.test(got.got[0]) && got.gave.length === 4 && /Stars ×250/.test(got.gave[0]), 'ann\'s screen lists what she received (40 gold, the card) and what bob received', got);
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'inventory_5_done.png') });
	A(acct('ann').dust === 180 && acct('bob').dust === 140 && acct('ann').gold === 90 && acct('bob').gold === 50 && acct('ann').collection.white_knight === 2 && acct('bob').collection.white_knight === 1 && wal('ann').n === 350 && wal('bob').n === 250 && C.packsOf(pcol('ann'), 'C') === 4 && C.packsOf(pcol('bob'), 'C') === 6 && pcol('ann').prints[D1[40]] === (n0.prints[D1[40]] || 0) + 1 && pcol('bob').prints[D1[40]] === 1, 'on the server each has exactly what the other gave: stars, dust, gold, the Battlecards card, the Charizard pack and the Pocket card', [acct('ann').gold, acct('bob').gold, acct('ann').collection, acct('bob').collection, C.packsOf(pcol('ann'), 'C'), C.packsOf(pcol('bob'), 'C'), pcol('ann').prints[D1[40]], pcol('bob').prints[D1[40]], n0.prints[D1[40]] || 0]);
	A(!acct('ann').tradeHeld && !acct('bob').tradeHeld && !pcol('ann').escrow && !pcol('bob').escrow && !wal('ann').th && !wal('bob').th, 'and nothing is left held anywhere');
	await ann.click('#tdone'); await bob.click('#tdone');
	A(await waitFor(async () => { const x = await ann.chips(), y = await bob.chips(); return x.stars === 350 && x.dust === 180 && x.gold === 90 && y.stars === 250 && y.dust === 140 && y.gold === 50; }, 10000) && await ann.q(() => document.getElementById('trade').hidden), 'each Inventory then shows the new amounts (ann 350 stars, 180 dust, 90 gold; bob 250, 140, 50)', [await ann.chips(), await bob.chips()]);

	// ===== 6. a cancelled trade =====
	await ann.click('#open-trade'); await bob.click('#open-trade');
	await waitFor(() => ann.q(() => !!document.querySelector('[data-k="ask:bob"]')), 8000); await ann.click('[data-k="ask:bob"]');
	await waitFor(() => bob.q(() => !!document.querySelector('[data-k="accept:ann"]')), 8000); await bob.click('[data-k="accept:ann"]');
	await waitFor(async () => /win/.test((await ann.win()).cls) && /win/.test((await bob.win()).cls), 10000);
	await amount(ann, 'dust', 50); await waitFor(async () => (await bob.win()).theirs.rows.length === 1, 6000);
	await bob.click('#tcancel');
	A(await waitFor(async () => /end off/.test((await ann.win()).cls) && /end off/.test((await bob.win()).cls), 8000) && /bob cancelled/.test(await ann.q(() => document.getElementById('twhy').textContent)) && acct('ann').dust === 180, 'bob cancels a second trade: both are told (ann: "bob cancelled"), and nothing has moved');
	await ann.click('#tdone'); await bob.click('#tdone');
	A(!ann.errors.length && !bob.errors.length, 'no page errors', [...ann.errors, ...bob.errors].slice(0, 3).join(' | '));

	// ===== 7. a phone =====
	await ann.page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true }); await sleep(600);   // (turning the phone emulation on reloads the page)
	await waitFor(() => ann.q(() => !!(window.__inventory && window.__inventory.ready) && !!document.getElementById('open-trade')), 20000);
	await ann.click('#open-trade'); await bob.click('#open-trade');
	await waitFor(() => ann.q(() => !!document.querySelector('[data-k="ask:bob"]')), 8000); await ann.click('[data-k="ask:bob"]');
	await waitFor(() => bob.q(() => !!document.querySelector('[data-k="accept:ann"]')), 8000); await bob.click('[data-k="accept:ann"]');
	await waitFor(async () => /win/.test((await ann.win()).cls), 10000); await amount(ann, 'dust', 5); await sleep(600);
	const ph = await ann.q(() => { const m = document.querySelector('.half.mine').getBoundingClientRect(), t = document.querySelector('.half.theirs').getBoundingClientRect(), d = document.querySelector('.divider').getBoundingClientRect(); return { side: m.right <= d.left + 1 && d.right <= t.left + 1 && Math.abs(m.top - t.top) < 2, over: document.documentElement.scrollWidth <= innerWidth + 1, lock: document.getElementById('tlock').getBoundingClientRect().width > 60 }; });
	A(ph.side && ph.over && ph.lock, 'on a phone the two offers are still side by side with the line between them, and nothing overflows sideways', ph);
	if (SHOTS) await ann.page.screenshot({ path: path.join(SHOTS, 'inventory_6_phone.png') });
	await ann.click('#tcancel');
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
