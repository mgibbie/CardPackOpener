// inventory_overworld_trade_test.mjs — the overworld's things in the Inventory's trade window (inventory/inventory.js,
// overworld/ow_handover.js, overworld/ow_tradelog.js, server/trade.mjs). Owner, 2026-11-17: the Inventory is to hold
// "every collectible item or currency from every game mode so we can have a unified inventory/trading system".
// Two players in two browsers, each with an overworld save on the device, through the REAL trade handler.
//   0. the journal's sums with money and coins (pure)
//   1. the Overworld tab lists my money, Game Corner coins, Pokémon and items
//   2. a whole trade: money, coins, items, a boxed Pokémon and a party Pokémon one way; money and items the other.
//      Each save ends with exactly what the other put up, the account has each save at a higher revision, the delivery
//      boxes are empty, the journals are clear, and nothing was made or lost
//   3. my whole party cannot be put up
//   4. what stops a hand-over, each leaving the save untouched:
//        the game has been played on another device since (the account's save is ahead of this one)
//        the overworld game is running in another tab (when the window opens, and when it starts only after I locked in)
//   5. I hand over, the other player cannot: the trade is cancelled and what I handed over comes back to my save
//   node overworld/tests/inventory_overworld_trade_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as TL from '../ow_tradelog.js';
import { handleTrade } from '../../server/trade.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9594, SHOTS = process.env.INVENTORY_SHOTS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 800) : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; };
if (!fs.existsSync(path.join(ROOT, 'overworld/data/pokemon'))) { console.log('skip - overworld/data not present'); process.exit(0); }

// ===== 0. the journal's sums (pure) =====
{
	const MONX = n => ({ speciesId: n.toLowerCase(), name: n, level: 5 });
	const party = [MONX('A'), MONX('B')], box = [MONX('C')], bag = { potion: 3 }, purse = { money: 900, coins: 40 };
	const offer = { pokemon: [{ ...MONX('C'), _src: 'box:0' }], items: [{ id: 'potion', count: 2 }], money: 300, coins: 15 };
	const after = TL.takeOut(offer, party, box, bag, purse);
	A(after && after.money === 600 && after.coins === 25 && after.bag.potion === 1 && after.box.length === 0 && after.party.length === 2, 'taking an offer out of a save: 900 - 300 money, 40 - 15 coins, with the items and the Pokémon', after);
	A(TL.takeOut({ ...offer, money: 901 }, party, box, bag, purse) === null && /money/.test(TL.whyNotTake({ ...offer, money: 901 }, party, box, bag, purse)) && /coins/.test(TL.whyNotTake({ ...offer, coins: 41 }, party, box, bag, purse)), 'more money or coins than the save holds cannot be taken, and it says which');
	const back = TL.putIn(offer, after.box, after.bag, after);
	A(back.money === 900 && back.coins === 40 && back.bag.potion === 3 && back.box.length === 1, 'putting it back in restores the purse, the bag and the box');
	A(TL.putIn({ coins: 500 }, [], {}, { money: 0, coins: 9900 }).coins === 10400, 'coins from a trade are all kept, past the 9,999 the Coin Case takes in winnings (none are lost)');
	const j = TL.noteTaking({}, 't1', { pokemon: [], items: [], money: 300, coins: 0 }, bag, 'A', purse);
	A(TL.wasTaken(j.t1, party, box, bag, { money: 600, coins: 40 }) === true && TL.wasTaken(j.t1, party, box, bag, { money: 900, coins: 40 }) === false, 'a page that died while taking money: the journal can tell whether the money had left');
	const ap = TL.applyDeliveries([{ id: 'd1', money: 50, coins: 5, items: [{ id: 'nugget', count: 1 }] }, { id: 'd1', money: 50 }], [], [], {}, { money: 10, coins: 0 });
	A(ap.money === 60 && ap.coins === 5 && ap.bag.nugget === 1 && ap.fresh.length === 1, 'a delivery with money in it is taken in once, however often it is seen', [ap.money, ap.coins]);
	const old = TL.takeOut({ pokemon: [], items: [{ id: 'potion', count: 1 }] }, party, box, bag);
	A(old && old.bag.potion === 2, 'a caller with no purse (the game before this) trades items as before');
}

// ---- the server: the real trade handler, and the account's copy of each overworld save
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
for (const u of ['ann', 'bob']) rows.set(u, JSON.stringify({ username: u, friendCode: u.toUpperCase() + '001', decks: [], collection: {}, packs: 0, dust: 0, gold: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: [u === 'ann' ? 'bob' : 'ann'] }));
const acct = u => JSON.parse(rows.get(u));
const revOf = snap => Math.max(0, parseInt(snap && snap.magepunk_ow_rev, 10) || 0);
const json = (o, status) => ({ ...o, status: status || 200 });
async function api(b) {
	const user = TOK[b.token] || null, action = b.action, now = Date.now();
	if (/^trade-(open|mine|poll|update|lock|cancel|deposit|box|box-ack)$/.test(action)) return handleTrade({ action, body: b, store, username: user, json, now, maxOwned: 999, randCode: () => 'W' + String(++seq).padStart(5, '0'), challengeMs: 60_000 });
	if (action === 'ow-load') return { ow: (await store.get('ow:' + user)) || null };
	if (action === 'ow-save') { const cur = await store.get('ow:' + user); if (cur && revOf(cur.ow) > revOf(b.ow)) return { ok: false, conflict: true, rev: revOf(cur.ow), error: 'stale revision' }; await store.setJSON('ow:' + user, { ow: b.ow, updated_at: now }); return { ok: true, rev: revOf(b.ow) }; }
	if (action === 'challenge') { const l = (await store.get('challenge:' + b.to)) || []; await store.setJSON('challenge:' + b.to, [...l.filter(c => c.from !== user), { from: user, type: b.battleType, ts: now }]); return { ok: true }; }
	if (action === 'challenges') return { challenges: (await store.get('challenge:' + user)) || [] };
	if (action === 'friends') return { friends: user ? (acct(user).friends || []).map(f => ({ username: f, online: true })) : [] };
	if (action === 'micasurvivor-save-get') return { rev: 0, save: null };
	if (action === 'pkcol-get') return { rev: 0, col: null };
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
	if (u === '/blank.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>game</title>'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(f)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const MON = (name, level) => ({ speciesId: name.toLowerCase(), name: name.toUpperCase(), level, curHP: 20, maxHP: 20, moves: [{ id: 'tackle', pp: 35, maxPp: 35 }], sprite: 's800.png', num: 25 });
const SAVES = {
	ann: { magepunk_party_v1: JSON.stringify([MON('Pikachu', 20), MON('Eevee', 9)]), magepunk_box_v1: JSON.stringify([MON('Onix', 14)]), magepunk_bag_v1: JSON.stringify({ potion: 5, nugget: 2 }), magepunk_money: '3000', magepunk_coins_v1: '120', magepunk_ow_rev: '7', magepunk_region: 'KANTO' },
	bob: { magepunk_party_v1: JSON.stringify([MON('Abra', 7)]), magepunk_box_v1: '[]', magepunk_bag_v1: JSON.stringify({ pokeball: 3 }), magepunk_money: '500', magepunk_coins_v1: '9990', magepunk_ow_rev: '2', magepunk_region: 'KANTO' },
};
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
	const open = async (tok, user) => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage(); await page.setViewport({ width: 1280, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((tok2, st, sv) => {
			if (localStorage.getItem('seeded')) return; localStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', tok2); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			for (const [k, v] of Object.entries(sv)) localStorage.setItem(k, v);
		}, tok, acct(user), SAVES[user]);
		rows.set('ow:' + user, JSON.stringify({ ow: SAVES[user], updated_at: 1 }));
		await page.goto(`http://localhost:${PORT}/inventory/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__inventory && window.__inventory.ready)), 30000);
		const q = (fn, ...a) => page.evaluate(fn, ...a);
		const click = async sel => { const r = await page.evaluate(s2 => { const e = document.querySelector(s2); if (!e) return 'no ' + s2 + ': ' + ((document.querySelector('.tw') || document.body).innerText || '').slice(0, 300); e.scrollIntoView({ block: 'center' }); e.click(); return null; }, sel); if (r) throw new Error(`${user}: ${r}`); await sleep(250); };
		const amount = async (k, n) => { await page.evaluate((k2, n2) => { const i = document.querySelector(`[data-amt="${k2}"]`); i.value = String(n2); i.dispatchEvent(new Event('change')); }, k, n); await sleep(250); };
		const cls = () => page.evaluate(() => (document.querySelector('.tw') || {}).className || '');
		const save = () => page.evaluate(() => { const J = k => JSON.parse(localStorage.getItem(k) || 'null'); return { party: (J('magepunk_party_v1') || []).map(m => m.name), box: (J('magepunk_box_v1') || []).map(m => m.name), bag: J('magepunk_bag_v1') || {}, money: +localStorage.getItem('magepunk_money'), coins: +localStorage.getItem('magepunk_coins_v1'), rev: +localStorage.getItem('magepunk_ow_rev'), journal: Object.keys(J('magepunk_trade_journal_v1') || {}).length }; });
		const rowsMine = () => page.evaluate(() => [...document.querySelectorAll('.tw .half.mine .slot')].map(s2 => s2.querySelector('.sn').childNodes[0].textContent + ' ' + s2.querySelector('.sc').textContent));
		const rowsTheirs = () => page.evaluate(() => [...document.querySelectorAll('.tw .half.theirs .slot')].map(s2 => s2.querySelector('.sn').childNodes[0].textContent + ' ' + s2.querySelector('.sc').textContent));
		return { ctx, page, errors, q, click, amount, cls, save, rowsMine, rowsTheirs, user };
	};
	const ann = await open('ta', 'ann'), bob = await open('tb', 'bob');
	const meet = async () => {
		await ann.click('#open-trade'); await bob.click('#open-trade');
		await waitFor(() => ann.q(() => !!document.querySelector('[data-k="ask:bob"]')), 8000); await ann.click('[data-k="ask:bob"]');
		await waitFor(() => bob.q(() => !!document.querySelector('[data-k="accept:ann"]')), 8000); await bob.click('[data-k="accept:ann"]');
		return waitFor(async () => /win/.test(await ann.cls()) && /win/.test(await bob.cls()), 10000);
	};
	const owTab = async p => { await p.click('[data-tab="ow"]'); await waitFor(() => p.q(() => !!document.querySelector('[data-amt="owmoney"]') || (!!document.getElementById('owwhy') && !/Checking/.test(document.getElementById('owwhy').textContent))), 8000); };
	const finish = async ok => waitFor(async () => new RegExp(ok ? 'end ok' : 'end off').test(await ann.cls()) && new RegExp(ok ? 'end ok' : 'end off').test(await bob.cls()), 25000);
	const settled = p => waitFor(async () => (await p.save()).journal === 0, 8000);
	const census = async () => { const a = await ann.save(), b = await bob.save(), box = u => (rows.has('owtrade:' + u) ? JSON.parse(rows.get('owtrade:' + u)).list : []); const m = {}; const add = (k, n) => { if (n) m[k] = (m[k] || 0) + n; };
		for (const s of [a, b]) { add('money', s.money); add('coins', s.coins); for (const n of [...s.party, ...s.box]) add('mon:' + n, 1); for (const [id, n] of Object.entries(s.bag)) add('item:' + id, n); }
		for (const u of ['ann', 'bob']) for (const e of box(u)) { add('money', e.money || 0); add('coins', e.coins || 0); for (const mon of e.pokemon || []) add('mon:' + mon.name, 1); for (const it of e.items || []) add('item:' + it.id, it.count); }
		return JSON.stringify(Object.entries(m).sort()); };
	const before = await census();

	// ===== 1. the Overworld tab =====
	A(await meet(), 'ann asks, bob accepts: the trade window opens for both');
	await owTab(ann);
	const tab = await ann.q(() => ({ amts: [...document.querySelectorAll('[data-amt]')].map(i => i.dataset.amt + '≤' + i.max), rows: [...document.querySelectorAll('[data-add]')].map(b => b.dataset.add) }));
	A(tab.amts.join() === 'owmoney≤3000,owcoins≤120' && tab.rows.join() === 'mon:party:0,mon:party:1,mon:box:0,item:potion,item:nugget', "the Overworld tab lists ann's money (3,000), coins (120), her party, her boxed Pokémon and her items", tab);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await ann.page.screenshot({ path: path.join(SHOTS, 'inventory_ow_1_tab.png') }); }

	// ===== 2. a whole trade =====
	await ann.amount('owmoney', 1000); await ann.amount('owcoins', 50);
	await ann.click('[data-add="item:potion"]'); await ann.click('[data-add="item:potion"]');
	await ann.click('[data-add="mon:box:0"]'); await ann.click('[data-add="mon:party:1"]');
	await owTab(bob); await bob.amount('owmoney', 200);
	await bob.click('[data-add="item:pokeball"]'); await bob.click('[data-add="item:pokeball"]'); await bob.click('[data-add="item:pokeball"]');
	// ===== 3. my whole party cannot be put up =====
	await bob.click('[data-add="mon:party:0"]');
	const whole = await bob.q(() => ({ toast: document.getElementById('toast').textContent, n: window.__inventory.trade().mine.pokemon.length }));
	A(/whole party/.test(whole.toast) && whole.n === 0, "bob's only Pokémon cannot be put up: he is told he cannot trade away his whole party", whole);
	await waitFor(async () => (await bob.rowsTheirs()).length === 5 && (await ann.rowsTheirs()).length === 2, 8000);
	A((await bob.rowsTheirs()).join(' | ') === 'Overworld money ×1,000 | Game Corner coins ×50 | ONIX Lv 14 ×1 | EEVEE Lv 9 ×1 | POTION ×2' && /^Overworld money ×200 \| POK. BALL ×3$/.test((await ann.rowsTheirs()).join(' | ')), "bob sees ann's offer across the line: 1,000 money, 50 coins, Onix, Eevee and 2 Potions", await bob.rowsTheirs());
	const untouched = await ann.save();
	A(untouched.money === 3000 && untouched.bag.potion === 5 && untouched.box.length === 1 && untouched.rev === 7, 'nothing has left her save yet');
	if (SHOTS) await bob.page.screenshot({ path: path.join(SHOTS, 'inventory_ow_2_offers.png') });
	await ann.click('#tlock'); await sleep(300); await bob.click('#tlock');
	A(await finish(true), 'both lock in: after the countdown and the cable scene, "Trade complete!" on both screens', [await ann.cls(), await bob.cls()]);
	await settled(ann); await settled(bob); await waitFor(async () => (await ann.save()).bag.pokeball === 3 && (await bob.save()).box.length === 2, 8000);
	const sa = await ann.save(), sb = await bob.save();
	A(sa.money === 3000 - 1000 + 200 && sa.coins === 70 && sa.bag.potion === 3 && sa.bag.pokeball === 3 && sa.bag.nugget === 2 && sa.party.join() === 'PIKACHU' && sa.box.length === 0, "ann's save: 2,200 money, 70 coins, 3 Potions, bob's 3 Poké Balls; Eevee and Onix are gone", sa);
	A(sb.money === 500 - 200 + 1000 && sb.coins === 10040 && sb.bag.potion === 2 && !sb.bag.pokeball && sb.party.join() === 'ABRA' && sb.box.join() === 'ONIX,EEVEE', "bob's save: 1,300 money, 10,040 coins (none lost to the Coin Case limit), 2 Potions; Onix and Eevee are in his PC box", sb);
	const oa = JSON.parse(rows.get('ow:ann')).ow, ob = JSON.parse(rows.get('ow:bob')).ow;
	A(sa.rev > 7 && revOf(oa) === sa.rev && oa.magepunk_money === '2200' && JSON.parse(oa.magepunk_box_v1).length === 0 && sb.rev > 2 && revOf(ob) === sb.rev && ob.magepunk_money === '1300' && JSON.parse(ob.magepunk_box_v1).length === 2, 'each save went to the account at a higher revision, so every other device takes this copy', [sa.rev, revOf(oa), sb.rev, revOf(ob)]);
	A(sa.journal === 0 && sb.journal === 0 && !(JSON.parse(rows.get('owtrade:ann') || '{"list":[]}').list.length) && !(JSON.parse(rows.get('owtrade:bob') || '{"list":[]}').list.length), 'the journals are clear and both delivery boxes are empty');
	A(await census() === before, 'nothing was made or lost: the money, coins, Pokémon and items of both together are what they were', [before, await census()]);
	A(await ann.q(() => /put in your overworld game/.test((document.getElementById('towsay') || {}).textContent || '')), 'the end screen says what came from the overworld is in the overworld game');
	await ann.click('#tdone'); await bob.click('#tdone');
	A(await waitFor(async () => (await ann.q(() => window.__inventory.inv().ow.money)) === 2200 && (await bob.q(() => window.__inventory.inv().ow.box.length)) === 2, 8000), 'and each Inventory shows it');

	// ===== 4a. the game has been played on another device since =====
	{ const r = JSON.parse(rows.get('ow:ann')); r.ow = { ...r.ow, magepunk_ow_rev: String(sa.rev + 5) }; rows.set('ow:ann', JSON.stringify(r)); }
	A(await meet(), '(a new window)');
	await owTab(ann);
	const behind = await ann.q(() => ({ why: (document.getElementById('owwhy') || {}).textContent || '', rows: document.querySelectorAll('[data-add], [data-amt]').length }));
	A(/played somewhere else/.test(behind.why) && /Open the overworld on this device first/.test(behind.why) && behind.rows === 0, "the account's copy of ann's save is ahead of this device's: the Overworld tab says to open the game here first, and offers nothing", behind);
	await ann.click('#tcancel'); await finish(false); await ann.click('#tdone'); await bob.click('#tdone');
	{ const r = JSON.parse(rows.get('ow:ann')); r.ow = { ...r.ow, magepunk_ow_rev: String(sa.rev) }; rows.set('ow:ann', JSON.stringify(r)); }

	// ===== 4b. the overworld game is running in another tab =====
	const game = await ann.ctx.newPage(); await game.goto(`http://localhost:${PORT}/blank.html`);
	const run = on => game.evaluate(v => { if (v && !window.ch) { window.ch = new BroadcastChannel('magepunk-ow'); window.ch.onmessage = e => { if (e.data && e.data.type === 'who') window.ch.postMessage({ type: 'here', id: 'game1' }); }; } if (!v && window.ch) { window.ch.close(); window.ch = null; } }, on);
	await run(true);
	A(await meet(), '(a new window)');
	await owTab(ann);
	const running = await ann.q(() => ({ why: (document.getElementById('owwhy') || {}).textContent || '', rows: document.querySelectorAll('[data-add], [data-amt]').length }));
	A(/open in another tab/.test(running.why) && running.rows === 0, 'the overworld game is running in another tab (it answers on the tab lock): the tab says so and offers nothing', running);
	await ann.click('#tcancel'); await finish(false); await ann.click('#tdone'); await bob.click('#tdone');
	// ...and one that starts only after she has put her things up and locked in
	await run(false);
	A(await meet(), '(a new window)');
	await owTab(ann); await ann.amount('owmoney', 700); await ann.click('[data-add="item:nugget"]');
	const s4 = await ann.save();
	await run(true);
	await ann.click('#tlock'); await sleep(300); await bob.click('#tlock');
	A(await finish(false), 'the game starts in another tab after she put up money and a Nugget; both lock in: the hand-over is refused and the trade is cancelled', [await ann.cls(), await bob.cls()]);
	const s4b = await ann.save();
	A(s4b.money === s4.money && s4b.bag.nugget === 2 && s4b.rev === s4.rev && s4b.journal === 0, 'nothing left her save, and its revision did not move', [s4, s4b]);
	await ann.click('#tdone'); await bob.click('#tdone');
	await run(false);

	// ===== 5. I hand over, the other player cannot =====
	const gameB = await bob.ctx.newPage(); await gameB.goto(`http://localhost:${PORT}/blank.html`);
	A(await meet(), '(a new window)');
	await owTab(ann); await ann.amount('owmoney', 500); await ann.click('[data-add="item:nugget"]');
	await owTab(bob); await bob.click('[data-add="mon:box:0"]');
	await waitFor(async () => (await ann.rowsTheirs()).length === 1 && (await bob.rowsTheirs()).length === 2, 8000);
	await gameB.evaluate(() => { window.ch = new BroadcastChannel('magepunk-ow'); window.ch.onmessage = e => { if (e.data && e.data.type === 'who') window.ch.postMessage({ type: 'here', id: 'game2' }); }; });
	const t5 = await census();
	await ann.click('#tlock'); await sleep(300); await bob.click('#tlock');
	A(await finish(false), "bob's game starts in another tab; both lock in: ann hands over, bob cannot, and the trade is cancelled");
	await gameB.close();
	A(await waitFor(async () => { const s = await ann.save(); return s.money === s4.money && s.bag.nugget === 2 && s.journal === 0; }, 12000), "what ann handed over comes back: her money and her Nugget are in her save again, and her journal is clear", await ann.save());
	A((await bob.save()).box.join() === 'ONIX,EEVEE' && await census() === t5, "bob's Onix never left, and nothing was made or lost");
	A(!ann.errors.length && !bob.errors.length, 'no page errors', [...ann.errors, ...bob.errors].slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
