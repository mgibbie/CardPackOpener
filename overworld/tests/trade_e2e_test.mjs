// trade_e2e_test.mjs — two players trade in the overworld's trade window, end to end, through the REAL trading
// handler (server/trade.mjs) over an in-memory row store: Battlecards cards and packs, Pocket Enhanced cards and packs,
// a POKeMON and bag items, all in one trade.
//   A. the hand-over notes (ow_tradelog.js, pure): what a save can hand over; a page that dies while taking, while
//      waiting, after a cancel; a delivery seen twice is added once
//   B. ann asks, bob accepts, both build an offer with the window's own keys and accept; each ends with exactly what
//      the other offered, in the server's rows and in the two saves; nothing is left held, noted or undelivered
//   C. a second trade is cancelled after ann handed her POKeMON over: it comes back to her PC box
//   D. ann hands over and her page closes before the server hears: on her next visit the POKeMON is back
//   node overworld/tests/trade_e2e_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';
import * as TL from '../ow_tradelog.js';
import * as C from '../../pocketenhanced/js/collection.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { handleTrade } from '../../server/trade.mjs';
import { handlePkcol } from '../../server/pocket_collection.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9247;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(120); } return false; };
const MON = (id, name, level) => ({ speciesId: id, name, level, types: ['Normal'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, stats: { hp: 60, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, maxHP: 60, curHP: 60, exp: level * 400, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 });

// ===== A. the hand-over notes =====
{
	const party = [MON('pidgey', 'PIDGEY', 20), MON('rattata', 'RATTATA', 5)], box = [MON('onix', 'ONIX', 30), MON('rattata', 'RATTATA', 5)], bag = { potion: 5, nugget: 1 };
	const offer = { pokemon: [{ ...party[1], _src: 'party:1' }, { ...box[0], _src: 'box:0' }], items: [{ id: 'potion', count: 3 }] };
	const at = TL.locate(offer.pokemon, party, box), out = TL.takeOut(offer, party, box, bag);
	A(at.party.join() === '1' && at.box.join() === '0' && out.party.length === 1 && out.party[0].name === 'PIDGEY' && out.box.length === 1 && out.box[0].name === 'RATTATA' && out.bag.potion === 2 && out.bag.nugget === 1 && party.length === 2 && bag.potion === 5, 'a save hands over exactly the POKeMON and items offered (the save given is not changed in place)');
	// the party was reordered since the offer was made: the POKeMON is found where it is now; twins answer for one each
	const moved = TL.locate([{ ...party[1], _src: 'party:0' }, { ...box[1], _src: 'box:9' }], [party[1], party[0]], box);
	A(moved && moved.party.join() === '0' && moved.box.join() === '1', 'a POKeMON that moved since it was offered is found where it is now; two alike answer for one each', moved);
	A(/no longer where/.test(TL.whyNotTake({ pokemon: [{ ...party[1], level: 6 }], items: [] }, party, box, bag)) && /whole party/.test(TL.whyNotTake({ pokemon: party.map((m, i) => ({ ...m, _src: 'party:' + i })), items: [] }, party, box, bag)) && /item/.test(TL.whyNotTake({ pokemon: [], items: [{ id: 'nugget', count: 2 }] }, party, box, bag)) && TL.takeOut({ pokemon: [], items: [{ id: 'nugget', count: 2 }] }, party, box, bag) === null, 'what cannot be handed over is refused whole: a POKeMON that changed, the whole party, more items than there are');
	const inn = TL.putIn(offer, out.box, out.bag);
	A(inn.box.length === 3 && inn.box.every(m => !('_src' in m)) && inn.bag.potion === 5, 'what comes in goes to the PC box and the bag');
	// the journal
	let j = TL.noteTaking({}, 'T1', offer, bag, 'A');
	A(j.T1.state === 'taking' && j.T1.bagWas.potion === 5 && TL.wasTaken(j.T1, party, box, bag) === false && TL.resolve(j.T1, { phase: 'wait', depoA: false }, 'A', false) === 'drop', 'a page that died after the note but before taking anything: nothing left the save, the note is dropped');
	A(TL.wasTaken(j.T1, out.party, out.box, out.bag) === true && TL.wasTaken(TL.noteTaking({}, 'T2', { pokemon: [], items: offer.items }, bag, 'A').T2, party, box, out.bag) === true, 'a page that died after taking, before the second note: the POKeMON are gone (or the items are fewer), so they were taken');
	j = TL.noteOut(j, 'T1');
	const R = (t, side) => TL.resolve(j.T1, t, side || 'A', true);
	A(R({ phase: 'wait', depoA: false }) === 'deposit' && R({ phase: 'wait', depoA: true }) === 'keep' && R({ phase: 'deliver', depoA: true }) === 'drop' && R({ phase: 'done', depoA: true }) === 'drop', 'handed over and the trade waits or is carried out: say so again, wait, or forget the note');
	A(R({ phase: 'cancelled', depoA: true }) === 'drop' && R({ phase: 'cancelled', depoA: false }) === 'restore' && R(null) === 'restore' && R({ phase: 'talk' }) === 'restore' && R({ phase: 'cancelled', depoA: true, depoB: false }, 'B') === 'restore', 'cancelled: if the server had them it sends them back itself; if it never heard, the game puts them back');
	A(TL.readMail('{broken').out.length === 0 && TL.readMail(JSON.stringify({ out: [{ oid: 'x' }], acc: 'no' })).out.length === 1 && TL.readMail('{}').acc.length === 0 && /^o[a-z0-9]{8,}$/.test(TL.newOid()) && TL.newOid() !== TL.newOid() && TL.heard({ ok: true }) && TL.heard({ error: 'no' }) && !TL.heard(null) && !TL.heard({}), "the mailbox trade's notes: read defensively; an offer names itself; 'heard' is a yes or a no, never silence");
	A(Object.keys(TL.drop(j, 'T1')).length === 0 && JSON.stringify(TL.readJournal('{broken')) === '{}' && JSON.stringify(TL.readJournal('[1]')) === '{}' && TL.readApplied('nope').length === 0, 'notes that cannot be read are empty ones');
	// deliveries
	const d = [{ id: 'T1', pokemon: [MON('abra', 'ABRA', 9)], items: [{ id: 'nugget', count: 2 }] }, { id: 'T2:back', back: true, pokemon: [], items: [{ id: 'potion', count: 1 }] }];
	const r1 = TL.applyDeliveries(d, [], box, bag), r2 = TL.applyDeliveries(d, r1.applied, r1.box, r1.bag);
	A(r1.fresh.length === 2 && r1.box.length === 3 && r1.bag.nugget === 3 && r1.bag.potion === 6 && r1.ack.join() === 'T1,T2:back' && r2.fresh.length === 0 && r2.box.length === 3 && r2.bag.nugget === 3 && r2.ack.length === 2, 'a delivery is added once: seen again (its acknowledgement was lost) it is acknowledged, not added');
}

// ===== the server: the real trade handler, and just enough of the rest for two signed-in overworld pages =====
const D1 = PRINTS.filter(p => p[2] === '1D').map(p => p[0]);
const rows = new Map(); let seq = 0, dropDeposit = false, dropMail = false;
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setJSON: async (k, v) => { if (v === null) rows.delete(k); else rows.set(k, JSON.stringify(v)); },
	delete: async k => { rows.delete(k); },
	setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; },
	getWithLength: async k => (rows.has(k) ? { value: JSON.parse(rows.get(k)), n: rows.get(k).length } : { value: null, n: null }),
	setIfLength: async (k, v, n) => { const cur = rows.has(k) ? rows.get(k).length : null; if (cur !== n) return false; rows.set(k, JSON.stringify(v)); return true; },
};
const TOK = { ta: 'ann', tb: 'bob' };
rows.set('ann', JSON.stringify({ username: 'ann', friendCode: 'ANN001', decks: [], collection: { fire_imp: 3 }, packs: 2, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] }));
rows.set('bob', JSON.stringify({ username: 'bob', friendCode: 'BOB001', decks: [], collection: { stone_golem: 1 }, packs: 3, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['ann'] }));
rows.set('pkcol:ann', JSON.stringify({ rev: 1, col: { ...C.firstCollection(), prints: { ...C.firstCollection().prints, [D1[0]]: 2 }, packs: 5 }, at: 1, ids: [] }));
rows.set('pkcol:bob', JSON.stringify({ rev: 1, col: { ...C.firstCollection(), packs: 4 }, at: 1, ids: [] }));
const acct = u => JSON.parse(rows.get(u)), pcol = u => JSON.parse(rows.get('pkcol:' + u)).col;
const json = (o, status) => ({ ...o, status: status || 200 });
async function api(b) {
	const user = TOK[b.token] || null, action = b.action, now = Date.now();
	if (/^trade-/.test(action) && !['trade-offer', 'trade-accept', 'trade-decline', 'trade-claim', 'trade-deliveries', 'trade-list'].includes(action)) {
		if (action === 'trade-deposit' && dropDeposit) throw new Error('the page closed before the server heard');
		return handleTrade({ action, body: b, store, username: user, json, now, maxOwned: 999, randCode: () => 'E' + String(++seq).padStart(5, '0'), challengeMs: 60_000 });
	}
	// the older mailbox trade's offer, as the server keeps it: one entry per `oid` (and here it can be made to give no answer)
	if (action === 'trade-offer') { if (dropMail) throw new Error('no answer'); const l = (await store.get('trades:' + b.to)) || []; if (!l.some(t => t.oid === b.oid)) { l.push({ id: 't' + l.length, oid: b.oid, from: user, mon: b.mon, done: false }); await store.setJSON('trades:' + b.to, l); } return { ok: true, id: 't0' }; }
	if (action === 'trade-deliveries') return { deliveries: [] };
	if (action === 'pkcol-get') return handlePkcol({ action, body: b, store, username: user, json, now });
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
		b.token = String(req.headers.authorization || '').replace(/^Bearer /, '');   // (the page signs its calls in a header)
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
	const open = async (who, token, party, box, bag) => {
		const ctx = await browser.createBrowserContext(), page = await ctx.newPage();
		page.on('pageerror', e => errors.push(who + ': ' + e.message));
		await page.evaluateOnNewDocument((token, st, party, box, bag) => {
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			if (!localStorage.getItem('magepunk_party_v1')) {
				localStorage.setItem('magepunk_mp_token_v1', token); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_region', 'hoenn'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_box_v1', JSON.stringify(box)); localStorage.setItem('magepunk_bag_v1', JSON.stringify(bag));
				localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
				localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
			}
		}, token, acct(who), party, box, bag);
		const boot = async () => { await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route114&x=27&y=41`, { waitUntil: 'domcontentloaded' }); return waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'Route114')), 45000); };
		const ok = await boot(); await sleep(800);
		return { who, page, ok, boot,
			save: () => page.evaluate(() => ({ party: JSON.parse(localStorage.getItem('magepunk_party_v1') || '[]').map(m => m.name), box: JSON.parse(localStorage.getItem('magepunk_box_v1') || '[]').map(m => m.name), bag: JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'), journal: JSON.parse(localStorage.getItem('magepunk_trade_journal_v1') || '{}'), applied: JSON.parse(localStorage.getItem('magepunk_trade_applied_v1') || '[]') })),
			win: () => page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'); return { open: trade.open, id: trade.id, phase: trade.phase, done: trade.done, status: trade.status, pk: !!trade.pk, mine: trade.mine, theirs: trade.theirs, myAccept: trade.myAccept, theirAccept: trade.theirAccept }; }),
			// press the window's own keys: go to a category, find a row, add it n times
			add: (cat, want, n = 1) => page.evaluate(async (cat, want, n) => { const { trade, TRADE_CATS } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); for (let g = 0; g < 8 && TRADE_CATS[trade.cat] !== cat; g++) P.tradeKey('ArrowRight'); const i = trade.rows.findIndex(r => r.label.includes(want)); if (i < 0) return 'no row ' + want + ' in ' + trade.rows.map(r => r.label).join(' / '); for (let k = 0; k < n; k++) { trade.idx = trade.rows.findIndex(r => r.label.includes(want)); P.tradeKey('z'); } return 'ok'; }, cat, want, n),
			key: kind => page.evaluate(async kind => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); trade.idx = trade.rows.findIndex(r => r.kind === kind); P.tradeKey('z'); }, kind),
			settle: () => page.evaluate(async () => { const P = await import('./ow_pvp.js'); await P.settleTrades(); }),
		};
	};
	const ann = await open('ann', 'ta', [MON('pidgey', 'PIDGEY', 20), MON('zigzagoon', 'ZIGZAGOON', 8)], [MON('onix', 'ONIX', 30)], { potion: 5, pokeball: 3 });
	const bob = await open('bob', 'tb', [MON('abra', 'ABRA', 9), MON('wurmple', 'WURMPLE', 4)], [], { nugget: 2 });
	A(ann.ok && bob.ok, 'two signed-in players are in the overworld');
	const startTrade = async () => {
		await ann.page.evaluate(async () => { const P = await import('./ow_pvp.js'); window.__ow.dialog.close?.(); P.startTrade({ username: 'bob' }); });
		await waitFor(() => rows.has('challenge:bob') && JSON.parse(rows.get('challenge:bob')).some(c => c.type === 'trade'), 8000);
		await bob.page.evaluate(async () => { const P = await import('./ow_pvp.js'); await P.acceptChallengeFrom('ann'); });
		return waitFor(async () => (await ann.win()).open && (await bob.win()).open && (await ann.win()).pk && (await bob.win()).pk, 15000);
	};

	// ===== B. one trade across every kind =====
	A(await startTrade(), "ann asks bob to trade and he accepts: the window opens for both, with each one's Pocket Enhanced cards read from their account", [await ann.win(), await bob.win()].map(w => [w.open, w.pk]));
	A(await ann.page.evaluate(() => !window.__ow.dialog.blocking), 'the "Trade request sent" message is gone once the window is open');
	const id = (await ann.win()).id;
	const built = [await ann.add('CARDS', 'Fire Imp', 2), await ann.add('PACKS', 'Card Pack', 1), await ann.add('PK CARDS', D1[0], 1), await ann.add('PK PACKS', 'Pocket Pack', 2), await ann.add('POKeMON', 'ZIGZAGOON'), await ann.add('ITEMS', 'x', 0),
		await bob.add('CARDS', 'Stone Golem', 1), await bob.add('PK PACKS', 'Pocket Pack', 1), await bob.add('POKeMON', 'ABRA')];
	await ann.page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); for (let g = 0; g < 8 && trade.rows.every(r => r.kind !== 'item'); g++) P.tradeKey('ArrowRight'); const i = trade.rows.findIndex(r => r.kind === 'item' && r.id === 'potion'); for (let k = 0; k < 3; k++) { trade.idx = i; P.tradeKey('z'); } });
	await bob.page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); for (let g = 0; g < 8 && trade.rows.every(r => r.kind !== 'item'); g++) P.tradeKey('ArrowRight'); const i = trade.rows.findIndex(r => r.kind === 'item' && r.id === 'nugget'); for (let k = 0; k < 2; k++) { trade.idx = i; P.tradeKey('z'); } });
	const seen = await waitFor(async () => { const a = await ann.win(), b = await bob.win(); return a.theirs.cards.stone_golem === 1 && a.theirs.pokemon.length === 1 && a.theirs.items.length === 1 && a.theirs.pk.packs === 1 && b.theirs.cards.fire_imp === 2 && b.theirs.packs === 1 && b.theirs.pk.prints[D1[0]] === 1 && b.theirs.pk.packs === 2 && b.theirs.pokemon[0].name === 'ZIGZAGOON' && b.theirs.items[0].count === 3; }, 12000);
	A(built.filter(x => x !== 'ok').length <= 1 && seen, "each builds an offer with the window's keys, across all six kinds, and sees the other's", { built, a: (await ann.win()).theirs, b: (await bob.win()).theirs });
	if (process.env.TRADE_SHOTS) { await ann.page.evaluate(() => window.__ow.dialog.close?.()); await sleep(300); await ann.page.screenshot({ path: path.join(process.env.TRADE_SHOTS, 'trade_window.png') }); }
	const s0 = [await ann.save(), await bob.save()];
	A(s0[0].party.join() === 'PIDGEY,ZIGZAGOON' && s0[1].party.join() === 'ABRA,WURMPLE' && acct('ann').collection.fire_imp === 3 && !acct('ann').tradeHeld, 'nothing has moved while they are still talking');
	await ann.key('accept'); await waitFor(async () => (await bob.win()).theirAccept, 8000); await bob.key('accept');
	const done = await waitFor(async () => (await ann.win()).done && (await bob.win()).done, 30000);
	A(done, 'both accept: the trade is carried out, and both windows say so', [await ann.win(), await bob.win()].map(w => [w.phase, w.status]));
	await waitFor(async () => (await ann.save()).box.includes('ABRA') && (await bob.save()).box.includes('ZIGZAGOON') && !rows.get('owtrade:ann')?.includes('ABRA') && !rows.get('owtrade:bob')?.includes('ZIGZAGOON'), 15000);
	const A1 = acct('ann'), B1 = acct('bob'), pa = pcol('ann'), pb = pcol('bob'), sa = await ann.save(), sb = await bob.save();
	A(A1.collection.fire_imp === 1 && A1.collection.stone_golem === 1 && A1.packs === 1 && !A1.tradeHeld && B1.collection.fire_imp === 2 && !B1.collection.stone_golem && B1.packs === 4 && !B1.tradeHeld, 'Battlecards: the cards and the pack changed hands on the server', [A1.collection, A1.packs, B1.collection, B1.packs]);
	A(pa.prints[D1[0]] === 1 && pa.packs === 5 - 2 + 1 && !pa.escrow && pb.prints[D1[0]] === 1 && pb.packs === 4 - 1 + 2 && !pb.escrow, 'Pocket Enhanced: the card and the packs changed hands on the server', [pa.packs, pb.packs]);
	A(sa.party.join() === 'PIDGEY' && sa.box.join() === 'ONIX,ABRA' && sa.bag.potion === 2 && sa.bag.nugget === 2 && sb.party.join() === 'WURMPLE' && sb.box.join() === 'ZIGZAGOON' && sb.bag.potion === 3 && !sb.bag.nugget, "the overworld: each save lost what it offered and holds the other's POKeMON (in the PC box) and items", [sa, sb].map(s => [s.party, s.box, s.bag]));
	A(Object.keys(sa.journal).length === 0 && Object.keys(sb.journal).length === 0 && sa.applied.includes(id) && sb.applied.includes(id) && (JSON.parse(rows.get('owtrade:ann') || '{"list":[]}').list.length === 0) && (JSON.parse(rows.get('owtrade:bob') || '{"list":[]}').list.length === 0) && !rows.has('tradeptr:ann') && !rows.has('tradeptr:bob'), 'nothing is left held, noted or undelivered: both delivery boxes are empty and both games have noted the delivery', [sa.journal, sb.journal, sa.applied, sb.applied]);
	await ann.settle(); await bob.settle();
	const sa2 = await ann.save();
	A(JSON.stringify(sa2.box) === JSON.stringify(sa.box) && JSON.stringify(sa2.bag) === JSON.stringify(sa.bag), 'settling again changes nothing');
	for (const p of [ann, bob]) await p.page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); if (trade.open) P.tradeKey('z'); window.__ow.dialog.close?.(); });

	// ===== C. cancelled after ann handed over =====
	rows.delete('challenge:bob');
	A(await startTrade(), 'a second trade opens');
	const id2 = (await ann.win()).id;
	await ann.add('POKeMON', 'ONIX'); await bob.add('POKeMON', 'WURMPLE');   // (bob's would be his whole party: his game will refuse to hand it over)
	await waitFor(async () => (await bob.win()).theirs.pokemon.length === 1 && (await ann.win()).theirs.pokemon.length === 1, 8000);
	await ann.key('accept'); await waitFor(async () => (await bob.win()).theirAccept, 8000); await bob.key('accept');
	const cancelled = await waitFor(() => { const t = rows.get('xtrade:' + id2); return !!t && JSON.parse(t).phase === 'cancelled'; }, 30000);
	await sleep(1500); await ann.settle(); await bob.settle();
	const sc = [await ann.save(), await bob.save()];
	A(cancelled && sc[0].box.includes('ONIX') && sc[0].box.filter(n => n === 'ONIX').length === 1 && sc[1].party.join() === 'WURMPLE' && Object.keys(sc[0].journal).length === 0 && Object.keys(sc[1].journal).length === 0, "bob's game will not hand over his last POKeMON, so the trade is cancelled: ann's ONIX, already handed over, is back in her PC box, once", sc.map(s => [s.party, s.box, s.journal]));
	for (const p of [ann, bob]) await p.page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); if (trade.open) P.tradeKey('z'); window.__ow.dialog.close?.(); });
	await sleep(1800);

	// ===== D. handed over, and the page closes before the server hears =====
	rows.delete('challenge:bob');
	A(await startTrade(), 'a third trade opens');
	const id3 = (await ann.win()).id;
	await ann.add('POKeMON', 'ABRA'); await bob.add('PACKS', 'Card Pack', 1);
	await waitFor(async () => (await bob.win()).theirs.pokemon.length === 1 && (await ann.win()).theirs.packs === 1, 8000);
	dropDeposit = true;
	await ann.key('accept'); await waitFor(async () => (await bob.win()).theirAccept, 8000); await bob.key('accept');
	const taken = await waitFor(async () => !(await ann.save()).box.includes('ABRA') && !!(await ann.save()).journal[id3], 20000);
	A(taken && (await ann.save()).journal[id3].state === 'out' && JSON.parse(rows.get('xtrade:' + id3)).phase === 'wait' && !JSON.parse(rows.get('xtrade:' + id3)).depoA, "ann's game took ABRA out of her save and noted it, but the server never heard");
	// she comes back later: by then the trade has timed out (here: bob cancels), and her game puts ABRA back
	await bob.page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); trade.idx = trade.rows.findIndex(r => r.kind === 'cancel'); P.tradeKey('z'); });
	await waitFor(() => JSON.parse(rows.get('xtrade:' + id3)).phase === 'cancelled', 10000);
	dropDeposit = false;
	await ann.boot(); await sleep(1500); await ann.settle();
	const sd = await ann.save();
	A(sd.box.filter(n => n === 'ABRA').length === 1 && Object.keys(sd.journal).length === 0 && acct('bob').packs === 4 && !acct('bob').tradeHeld && (JSON.parse(rows.get('owtrade:ann') || '{"list":[]}').list.length === 0), 'on her next visit ABRA is back in her PC box, once; bob has his pack back; nothing is left noted', [sd.box, sd.journal]);
	// ===== E. the older mailbox trade: an offer whose request died is sent again, once =====
	{
		for (const p of [ann, bob]) await p.page.evaluate(async () => { const { trade } = await import('./ow_menustate.js'), P = await import('./ow_pvp.js'); if (trade.open) P.tradeKey('z'); });
		const partyBefore = (await ann.save()).party;
		dropMail = true;
		await ann.page.evaluate(async () => { const F = await import('./ow_features.js'); const { S } = await import('./ow_state.js'); if (S.party.length < 2) { const { getBox, setBox } = await import('./ow_menukeys.js'); const b = getBox(); S.party.push(b.pop()); setBox(b); (await import('./party.js')).saveParty(S.party); } window.__mailBefore = S.party.map(m => m.name); await F.sendTradeOffer({ username: 'bob' }, S.party.length - 1); });
		const mid = await ann.page.evaluate(() => ({ before: window.__mailBefore, party: JSON.parse(localStorage.getItem('magepunk_party_v1')).map(m => m.name), note: JSON.parse(localStorage.getItem('magepunk_mailtrade_v1') || '{}'), said: JSON.stringify(window.__ow.dialog.pages || '') }));
		A(mid.party.length === mid.before.length - 1 && mid.note.out && mid.note.out.length === 1 && /kept safe/.test(mid.said) && !rows.has('trades:bob'), 'no answer from the server: the POKeMON is out of the party, noted in the save, and the game says it is kept safe (not "back safe")', mid);
		// the connection returns: the same offer is sent again; and again by mistake: it is in bob's inbox once
		dropMail = false;
		await ann.page.evaluate(async () => { const F = await import('./ow_features.js'); await F.settleMailTrades(); await F.settleMailTrades(); });
		const end = await ann.page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_mailtrade_v1') || '{}'));
		const inbox = JSON.parse(rows.get('trades:bob') || '[]');
		A(inbox.length === 1 && inbox[0].from === 'ann' && inbox[0].mon.name === mid.before[mid.before.length - 1] && end.out.length === 0 && (await ann.save()).party.length === mid.party.length, "when the connection is back the offer is sent, once, and the note is cleared; the POKeMON is with the server, not also back in the party", { inbox: inbox.map(t => t.mon.name), end });
	}
	A(errors.length === 0, 'no page errors', errors.slice(0, 3));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
