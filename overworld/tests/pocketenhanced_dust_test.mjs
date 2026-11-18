// pocketenhanced_dust_test.mjs — Pocket Enhanced: making printings with dust, and breaking spare copies down.
// Owner, 2026-11-17: dust is "shared with Battlecards"; 2026-11-18 (the improvement list): craft with it.
// The real handlers (server/pocket_collection.mjs handlePkdust, handlePkcol) over an in-memory row store whose writes
// can be made to die, and the page's own sync (pocketenhanced/js/colsync.js) as a pretend device.
//   1. the prices: one table for the page and the server; a quarter back for a spare copy; promos are neither
//   2. making a printing: the account's dust goes down by its price, the printing is in the collection, no note is left
//   3. what is refused: not signed in, not enough dust, a promo, an unknown printing, a nameless action
//   4. breaking down: only copies past the two kept; one at a time, or every spare at once; the dust arrives
//   5. the same action sent twice is done once
//   6. a request that dies after ANY single write: the next call carries on to the same end, nothing made or lost
//   7. the page's own write in the middle keeps the server's note of dust still owed
//   8. a device that has not synced yet: the card it made arrives on it, and what it had pulled meanwhile is kept
//   node overworld/tests/pocketenhanced_dust_test.mjs
import * as C from '../../pocketenhanced/js/collection.js';
import { createSync } from '../../pocketenhanced/js/colsync.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { handlePkcol, handlePkdust } from '../../server/pocket_collection.mjs';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

let rows = new Map(), writes = 0, dieAt = 0;
const wrote = () => { writes++; if (dieAt && writes === dieAt) { const e = new Error('the request died'); e.died = true; throw e; } };
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; wrote(); rows.set(k, JSON.stringify(v)); return true; },
	getWithLength: async k => (rows.has(k) ? { value: JSON.parse(rows.get(k)), n: rows.get(k).length } : { value: null, n: null }),
	setIfLength: async (k, v, n) => { const cur = rows.has(k) ? rows.get(k).length : null; if (cur !== n) return false; wrote(); rows.set(k, JSON.stringify(v)); return true; },
};
const json = (o, status) => ({ ...o, status: status || 200 });
const dust = (u, action, body) => handlePkdust({ action, body: body || {}, store, username: u, json, now: 5 });
const colApi = (u, action, body) => handlePkcol({ action, body: body || {}, store, username: u, json, now: 5 });
const byRar = r => PRINTS.filter(p => p[2] === r).map(p => p[0]);
const D1 = byRar('1D'), D4 = byRar('4D'), S1 = byRar('1S'), PROMO = byRar('N');
const acct = u => JSON.parse(rows.get(u)), crow = u => JSON.parse(rows.get('pkcol:' + u)), col = u => crow(u).col;
function world(dustN, prints) {
	rows = new Map(); writes = 0; dieAt = 0;
	rows.set('ann', JSON.stringify({ username: 'ann', dust: dustN, collection: { fire_imp: 2 }, packs: 1 }));
	rows.set('pkcol:ann', JSON.stringify({ rev: 4, col: { ...C.newCollection(), prints: { ...C.newCollection().prints, ...prints } }, at: 1, ids: ['keepme01'] }));
}
/** Everything of value, wherever it stands: dust on the account, dust owed, dust spent on a printing not yet made (as that printing). */
const worth = () => { const a = acct('ann'), r = crow('ann'); let d = a.dust || 0; for (const n of Object.values(r.owed || {})) d += n; const pr = { ...r.col.prints }; for (const c of Object.values(a.pkCraft || {})) if (!(r.ids || []).includes(Object.keys(a.pkCraft).find(k => a.pkCraft[k] === c))) pr[c.print] = (pr[c.print] || 0) + 1; return { dust: d, prints: pr }; };

// ===== 1. the prices =====
A(C.craftCost(D1[0]) === 40 && C.craftCost(D4[0]) === 1600 && C.craftCost(S1[0]) === 1600 && C.dustValue(D1[0]) === 5 && C.dustValue(D4[0]) === 400 && C.craftCost(PROMO[0]) === null && C.dustValue(PROMO[0]) === null && C.craftCost('nope') === null, 'one table of prices: a ◆ costs 40 dust and gives 5 back, a ◆◆◆◆ 1,600 and 400; a promo can be neither made nor broken down');
A(Object.keys(C.CRAFT).every(r => C.RARITY[r] && C.DUST_FOR[r] > 0 && C.DUST_FOR[r] * 4 <= C.CRAFT[r]) && C.RARITY_ORDER.filter(r => r !== 'N').every(r => C.CRAFT[r]), 'every rarity but the promos has a price, and breaking down never pays more than a quarter of it');

// ===== 2. making a printing =====
world(2000, {});
const had = col('ann').prints[D4[0]] || 0;
let r = await dust('ann', 'pkdust-craft', { print: D4[0], id: 'craft00001' });
A(r.ok && r.dust === 400 && r.made === D4[0] && acct('ann').dust === 400 && col('ann').prints[D4[0]] === had + 1 && !acct('ann').pkCraft && crow('ann').rev === 5 && crow('ann').ids.includes('craft00001') && crow('ann').ids.includes('keepme01'), 'a ◆◆◆◆ printing made: 2,000 dust becomes 400, the printing is in the collection, and no note is left on the account', [r.dust, acct('ann'), crow('ann').ids]);
A(r.col && r.col.prints[D4[0]] === had + 1 && r.rev === 5, 'the answer carries the collection as the account now has it');
A(acct('ann').collection.fire_imp === 2 && acct('ann').packs === 1, "the account's Battlecards cards and packs are untouched");

// ===== 3. what is refused =====
r = await dust(null, 'pkdust-craft', { print: D1[0], id: 'craft00002' });
A(r.status === 401, 'not signed in: refused');
r = await dust('ann', 'pkdust-craft', { print: D4[1], id: 'craft00003' });
A(r.status === 400 && /takes 1600 dust \(you have 400\)/.test(r.error) && acct('ann').dust === 400 && !col('ann').prints[D4[1]] && !acct('ann').pkCraft, 'not enough dust: refused, saying what it takes; nothing is spent or made', r.error);
r = await dust('ann', 'pkdust-craft', { print: PROMO[0], id: 'craft00004' });
const r2 = await dust('ann', 'pkdust-craft', { print: 'ZZ-999', id: 'craft00005' }), r3 = await dust('ann', 'pkdust-craft', { print: D1[0] });
A(r.status === 400 && r2.status === 400 && r3.status === 400 && acct('ann').dust === 400, 'a promo, an unknown printing and an action with no name are refused');

// ===== 4. breaking down =====
world(0, { [D1[0]]: 5, [D4[0]]: 3, [S1[0]]: 2, [D1[1]]: 1 });
r = await dust('ann', 'pkdust-break', { print: S1[0], n: 1, id: 'break00001' });
A(r.status === 400 && /you keep 2 of a card/.test(r.error) && col('ann').prints[S1[0]] === 2, 'a printing she has two of has no spare copy: refused, and she keeps both', r.error);
r = await dust('ann', 'pkdust-break', { print: D1[0], n: 4, id: 'break00002' });
A(r.status === 400 && col('ann').prints[D1[0]] === 5, 'four of a printing she has five of: only three are spare, so refused');
r = await dust('ann', 'pkdust-break', { print: D4[0], n: 1, id: 'break00003' });
A(r.ok && r.gained === 400 && r.broke === 1 && acct('ann').dust === 400 && col('ann').prints[D4[0]] === 2 && !crow('ann').owed, 'one spare ◆◆◆◆ broken down: +400 dust, two are kept, nothing is left owed', [r, acct('ann').dust]);
const sp4 = C.spares(col('ann')), n4 = sp4.list.reduce((a, x) => a + x[1], 0);
r = await dust('ann', 'pkdust-break', { all: true, id: 'break00004' });
A(r.ok && sp4.list.some(x => x[0] === D1[0] && x[1] === 3) && r.broke === n4 && r.gained === sp4.dust && acct('ann').dust === 400 + sp4.dust && !C.spares(col('ann')).list.length && col('ann').prints[D1[0]] === 2 && col('ann').prints[D1[1]] === 1 && col('ann').prints[S1[0]] === 2, 'every spare copy at once (the three spare ◆ among them): each becomes its dust; a single copy and the pairs are kept', [r, col('ann').prints[D1[0]]]);
r = await dust('ann', 'pkdust-break', { all: true, id: 'break00005' });
A(r.status === 400 && /no spare copies/.test(r.error), 'with no spare copies left, there is nothing to break down');

// ===== 5. the same action twice =====
world(100, { [D1[0]]: 4 });
await dust('ann', 'pkdust-craft', { print: D1[2], id: 'twice00001' }); r = await dust('ann', 'pkdust-craft', { print: D1[2], id: 'twice00001' });
A(r.ok && acct('ann').dust === 60 && col('ann').prints[D1[2]] === (C.newCollection().prints[D1[2]] || 0) + 1, 'the same making sent twice (a page that did not hear the answer): 40 dust spent once, one printing', [acct('ann').dust, col('ann').prints[D1[2]]]);
await dust('ann', 'pkdust-break', { print: D1[0], n: 1, id: 'twice00002' }); r = await dust('ann', 'pkdust-break', { print: D1[0], n: 1, id: 'twice00002' });
A(acct('ann').dust === 65 && col('ann').prints[D1[0]] === 3, 'the same breaking-down sent twice: one copy gone, 5 dust once', [acct('ann').dust, col('ann').prints[D1[0]]]);

// ===== 6. a request that dies after any single write =====
for (const [name, action, body, setup] of [['making a printing', 'pkdust-craft', { print: D4[0], id: 'die0000001' }, () => world(2000, {})], ['breaking down every spare', 'pkdust-break', { all: true, id: 'die0000002' }, () => world(7, { [D1[0]]: 5, [D4[0]]: 3 })]]) {
	setup(); const clean = await dust('ann', action, body), endDust = acct('ann').dust, endPrints = JSON.stringify(col('ann').prints), total = writes;
	let ok = total >= 3, seen = [];
	for (let k = 1; k <= total; k++) {
		setup(); const before = JSON.stringify(worth()); dieAt = k;
		let died = false; try { await dust('ann', action, body); } catch (e) { died = !!e.died; }
		dieAt = 0;
		const mid = JSON.stringify(worth());
		await dust('ann', action, body);   // (the page did not hear: it sends the same action again)
		const fine = died && acct('ann').dust === endDust && JSON.stringify(col('ann').prints) === endPrints && !acct('ann').pkCraft && !crow('ann').owed;
		if (!fine) { ok = false; seen.push({ k, died, dust: acct('ann').dust, note: acct('ann').pkCraft, owed: crow('ann').owed }); }
		// (between the steps nothing of value exists twice or nowhere: dust spent is a printing owed, cards gone are dust owed)
		if (action === 'pkdust-craft' && k > 1 && JSON.parse(mid).dust + 1600 !== JSON.parse(before).dust) { ok = false; seen.push({ k, mid, before }); }
	}
	A(ok && clean.ok, `${name}: killed at each of its ${total} writes in turn, the same action sent again reaches the same end (the same dust, the same cards, no note left)`, seen.slice(0, 3));
}

// ===== 7. the page writes in the middle =====
world(0, { [D4[0]]: 3 }); dieAt = 2;
try { await dust('ann', 'pkdust-break', { print: D4[0], n: 1, id: 'mid0000001' }); } catch (e) { /* died owing the dust */ }
dieAt = 0;
A(crow('ann').owed && crow('ann').owed.mid0000001 === 400 && acct('ann').dust === 0, '(a breaking-down that died after the copy left: 400 dust is noted as owed on the collection row)', crow('ann').owed);
const g = await colApi('ann', 'pkcol-get');
r = await colApi('ann', 'pkcol-put', { col: { ...g.col, packs: g.col.packs + 1 }, rev: g.rev, id: 'pageput001' });
A(r.ok && crow('ann').owed && crow('ann').owed.mid0000001 === 400, "the page then saves its own change to the collection: the server's note of dust owed is still on the row", [r, crow('ann').owed]);
r = await dust('ann', 'pkdust-settle');
A(r.ok && r.dust === 400 && !crow('ann').owed && col('ann').packs === g.col.packs + 1, 'and the dust is paid the next time the collection is opened (once), with the page\'s change kept', [r.dust, crow('ann').owed]);
r = await dust('ann', 'pkdust-settle');
A(r.dust === 400, 'opening it again pays nothing more');

// ===== 8. a device that has not synced =====
{
	world(500, {});
	const mem = new Map(), d = { col: C.newCollection() };
	d.sync = createSync({ storage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } }, delay: 0, user: () => 'ann', getLocal: () => d.col, setLocal: c2 => { d.col = c2; }, onStatus: () => {}, call: async (action, body) => colApi('ann', action, JSON.parse(JSON.stringify(body))) });
	await d.sync.now();
	// she pulls a card on this device (not sent yet), then makes a printing: as the page does, the device syncs, asks, syncs
	d.col = { ...d.col, prints: { ...d.col.prints, [D1[7]]: (d.col.prints[D1[7]] || 0) + 1 } };
	await d.sync.now(); r = await dust('ann', 'pkdust-craft', { print: S1[0], id: 'device0001' }); await d.sync.now();
	A(r.status === 400 && !d.col.prints[S1[0]] && d.col.prints[D1[7]] === (C.newCollection().prints[D1[7]] || 0) + 1 && C.sameCollection(d.col, col('ann')) && acct('ann').dust === 500, 'a device with 500 dust asks for a ★ (1,600): refused; the card it had just pulled is kept and is on the account', [r.error, d.col.prints[S1[0]]]);
	world(2000, {});
	const mem2 = new Map(), e = { col: C.newCollection() };
	e.sync = createSync({ storage: { getItem: k => (mem2.has(k) ? mem2.get(k) : null), setItem: (k, v) => { mem2.set(k, String(v)); } }, delay: 0, user: () => 'ann', getLocal: () => e.col, setLocal: c2 => { e.col = c2; }, onStatus: () => {}, call: async (action, body) => colApi('ann', action, JSON.parse(JSON.stringify(body))) });
	await e.sync.now();
	e.col = { ...e.col, prints: { ...e.col.prints, [D1[7]]: (e.col.prints[D1[7]] || 0) + 1 } };
	await e.sync.now(); r = await dust('ann', 'pkdust-craft', { print: S1[0], id: 'device0002' }); await e.sync.now();
	A(r.ok && e.col.prints[S1[0]] === 1 && e.col.prints[D1[7]] === (C.newCollection().prints[D1[7]] || 0) + 1 && C.sameCollection(e.col, col('ann')) && acct('ann').dust === 400, 'with 2,000 dust: the ★ printing she made is on the device after its sync, beside the card it had pulled; 400 dust is left', [r.error, e.col.prints[S1[0]], acct('ann').dust]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
