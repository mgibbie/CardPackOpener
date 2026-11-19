// Pocket Enhanced's economy (owner, 2026-11-17): stars are the currency, a new player starts with four decks.
//   1. the star wallet (site/stars.js): counters that only grow, joined by the larger of each; earning and spending
//   2. the wallet on the account (server/stars.mjs): devices that sync in any order, any number of times, agree;
//      nothing is lost or doubled
//   3. a new player's collection: the Charizard, Blastoise, Venusaur and Pikachu decks, and nothing else
//   4. collections made before that are kept as they are, and still link to their accounts by the old start
//   node overworld/tests/pocketenhanced_stars_test.mjs
import * as W from '../../site/stars.js';
import * as C from '../../pocketenhanced/js/collection.js';
import { STARTERS, starterDeck } from '../../pocketenhanced/js/decks.js';
import { card } from '../../pocketenhanced/js/data/cards.js';
import { handleStars } from '../../server/stars.mjs';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra).slice(0, 600)); } };

// ===== 1. the wallet =====
{
	const D1 = 'devaaaa1', D2 = 'devbbbb2';
	let w = W.cleanWallet(null);
	A(W.balance(w) === 0 && W.STARS_PER_PACK === 100, 'an empty wallet holds nothing; a pack is 100 stars');
	w = W.earned(w, D1, 250); w = W.earned(w, D2, 100);
	const s1 = W.spent(w, D1, 300), s2 = W.spent(w, D1, 351);
	A(W.balance(w) === 350 && W.balance(s1) === 50 && s2 === null && W.balance(W.earned(w, D1, -5)) === 350 && W.balance(W.earned(w, D1, 'x')) === 350, 'stars are earned and spent; more than there is cannot be spent; a negative or unreadable amount is nothing');
	// joining: each device's larger count; any order, any number of times
	const a = W.earned(W.cleanWallet(null), D1, 200), b = W.spent(W.earned(W.cleanWallet(null), D2, 500), D2, 100), ab = W.mergeWallets(a, b);
	A(W.balance(ab) === 600 && W.sameWallet(ab, W.mergeWallets(b, a)) && W.sameWallet(ab, W.mergeWallets(ab, a)) && W.sameWallet(ab, W.mergeWallets(W.mergeWallets(ab, b), ab)) && !W.sameWallet(a, b), 'two wallets join to everything either knows: the same in any order, and joining again changes nothing');
	const older = W.earned(W.cleanWallet(null), D1, 120);
	A(W.sameWallet(W.mergeWallets(a, older), a) && W.balance(W.mergeWallets(older, a)) === 200, "an older copy of a device's count never lowers a newer one");
	A(W.balance({ e: { [D1]: 50 }, s: { [D1]: 80 } }) === 0, 'spent on two devices at once past what there was: the balance shows none, never less');
	const junk = W.cleanWallet({ e: { [D1]: 5, 'BAD KEY': 9, shrt: 1, tour0: 7, [D2]: -4, devcccc3: 'x', devdddd4: 3.9 }, s: 'no', extra: 1 });
	A(JSON.stringify(junk) === JSON.stringify({ e: { [D1]: 5, tour0: 7, devdddd4: 3 }, s: {} }), 'a stored wallet is read defensively (a counter name is 5-24 letters and digits: the tournament prizes are `tour0`)', junk);
	// this device (a storage of its own)
	const mem = new Map(); globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } };
	A(W.stars() === 0 && W.earn(300) === 300 && W.spend(100) === true && W.spend(201) === false && W.stars() === 200 && /^[a-z0-9]{6,24}$/.test(mem.get(W.DEVICE_KEY)), 'a device earns and spends its own wallet, under a name of its own');
	A(await W.sync(null) === 'guest' && await W.sync(async () => null) === 'offline' && await W.sync(async () => { throw new Error('down'); }) === 'offline' && W.stars() === 200, 'a guest syncs nothing; with no answer the wallet carries on as it is');
}

// ===== 2. on the account =====
{
	const rows = new Map();
	const store = { get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null), setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; } };
	const server = (username, body) => handleStars({ action: 'stars-sync', body: body || {}, store, username, json: (o, status) => ({ ...o, status: status || 200 }), now: 1 });
	A((await server(null, {})).status === 401 && (await handleStars({ action: 'stars-nope', body: {}, store, username: 'ann', json: (o, s) => ({ ...o, status: s || 200 }), now: 1 })).status === 400, 'the wallet on the account needs an account');
	// two devices of one player, each a storage of its own
	const dev = () => { const mem = new Map(), use = () => { globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } }; }; return { use, sync: async () => { use(); return W.sync((a, b) => server('ann', JSON.parse(JSON.stringify(b)))); }, earn: n => { use(); return W.earn(n); }, spend: n => { use(); return W.spend(n); }, stars: () => { use(); return W.stars(); } }; };
	const phone = dev(), laptop = dev();
	phone.earn(300); A(await phone.sync() === 'saved' && (await server('ann', {})).stars === 300, "a signed-in player's stars go to the account");
	A(await laptop.sync() === 'saved' && laptop.stars() === 300, 'a second device has them');
	laptop.spend(100); phone.earn(50);
	await laptop.sync(); await phone.sync(); await laptop.sync(); await phone.sync(); await phone.sync();
	A(phone.stars() === 250 && laptop.stars() === 250 && (await server('ann', {})).stars === 250, 'one device spends, the other earns: both end with the same balance, however often they sync');
	// a sync whose answer is lost, then sent again
	phone.earn(40); phone.use(); await W.sync(async (a, b) => { await server('ann', JSON.parse(JSON.stringify(b))); return null; });
	await phone.sync(); await laptop.sync();
	A(phone.stars() === 290 && laptop.stars() === 290, 'a sync whose answer was lost and is sent again counts the stars once');
	// two syncs at the same moment
	phone.earn(10); laptop.earn(7);
	await Promise.all([phone.sync(), laptop.sync()]); await phone.sync(); await laptop.sync();
	A(phone.stars() === 307 && laptop.stars() === 307 && (await server('ann', {})).stars === 307 && (await server('bob', {})).stars === 0, "two devices syncing at once both land; another player's wallet is their own");
	A((await server('ann', { wallet: { e: { junkjunk: 1e12 }, s: 'x' } })).stars === 307 + 1e9, '(a count is bounded, whatever is sent)');
}

// ===== 3. a new player =====
{
	const c = C.newCollection(), total = Object.values(c.prints).reduce((a, b) => a + b, 0), names = new Set(Object.keys(c.prints).map(id => card(id).name));
	A(C.START_DECKS.join() === 'charizard,blastoise,venusaur,pikachu' && total === 80 && c.packs === 0 && c.points === 0 && c.opened === 0 && c.st === C.START, 'a new player has the cards of four decks (80 cards) and no packs');
	A(C.START_DECKS.every(id => C.missingFor(c, starterDeck(id).deck).length === 0) && ['Charizard ex', 'Blastoise ex', 'Venusaur ex', 'Pikachu ex'].every(n => names.has(n)), 'each of the four is a whole deck they own: Charizard, Blastoise, Venusaur, Pikachu');
	const others = STARTERS.filter(s => !C.START_DECKS.includes(s.id));
	A(others.length > 40 && others.every(s => C.missingFor(c, starterDeck(s.id).deck).length > 0), `none of the other ${others.length} ready-made decks is theirs yet`);
	const kept = C.cleanCollection(JSON.parse(JSON.stringify(c)));
	A(kept.st === C.START && C.sameCollection(kept, c) && C.cleanCollection({ ...c, st: 7 }).st === undefined, 'the collection remembers which start it began from');
	// signing in
	const NEW = ['A1-150', 'A1-151', 'A1-152', 'A1-200'].find(id => C.printInfo(id) && !c.prints[id]);
	const pulled = { ...c, prints: { ...c.prints, [NEW]: 1 }, packs: 0 }, acct = C.newCollection();
	const linked = C.linkFirst(pulled, acct);
	A(linked.prints[NEW] === 1 && Object.values(linked.prints).reduce((a, b) => a + b, 0) === 81 && linked.st === C.START && C.sameCollection(C.linkFirst(c, acct), acct), 'a new guest who then signs in adds what they pulled to the account, and the four decks are not given twice');
}

// ===== 4. collections made before =====
{
	const old = C.firstCollection(), oldTotal = Object.values(old.prints).reduce((a, b) => a + b, 0);
	A(old.st === undefined && old.packs === C.START_PACKS && oldTotal === 14, 'a collection made before has no mark: the seven starter Trainers twice, and ten packs');
	const played = { ...old, prints: { ...old.prints, 'A1-001': 2 }, packs: 4, opened: 6, points: 30 };
	A(C.sameCollection(C.cleanCollection(JSON.parse(JSON.stringify(played))), played) && C.cleanCollection(played).st === undefined, 'it is read back exactly as it was: nothing is added, removed or reset');
	// a new device (the four decks) signing in to an account that has an old collection: the account's is kept whole
	const fresh = C.newCollection(), met = C.linkFirst(fresh, played);
	A(C.sameCollection(met, played) && met.st === undefined && met.packs === 4, "a new device signing in to that account takes the account's collection as it is (the four decks are not poured into it)");
	// an old device that earned a card as a guest, signing in to its old account: the old start is what is not given twice
	const guest = { ...old, prints: { ...old.prints, 'A1-002': 1 }, packs: 9, opened: 1, points: 5 }, m2 = C.linkFirst(guest, played);
	A(m2.prints['A1-002'] === 1 && m2.prints['A1-001'] === 2 && m2.prints['P-A-005'] === 2 && m2.opened === 7 && m2.packs === 4, 'an old guest device signing in adds what it pulled; its own ten packs and starter Trainers are not given again');
	A(C.merge3(played, C.addPacks(played, 1), played).st === undefined && C.merge3(fresh, fresh, fresh).st === C.START, 'syncing keeps the mark as the account has it');
}

// ===== 5. a Pokémon caught in the overworld: 1 in 10 gives that Pokémon's card, any printing =====
{
	const mem = new Map(); globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: k => mem.delete(k) };
	const { pocketCatch, CATCH_CARD_CHANCE, FOUND_KEY } = await import('../ow_pocketcard.js'), SV = await import('../../pocketenhanced/js/save.js');
	const total = () => Object.values(SV.collection().prints).reduce((a, b) => a + b, 0), seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
	const pika = C.printsOfDex(25), base = total();
	A(CATCH_CARD_CHANCE === 0.1 && pika.length > 6 && pika.every(id => card(C.printInfo(id).card).dex === 25) && new Set(pika.map(id => C.printInfo(id).card)).size >= 2 && C.printsOfDex(99999).length === 0, "a Pokémon's cards are every printing of every card of that Pokémon (Pikachu has several, of more than one card)", pika.length);
	// the roll: under 1 in 10 it gives a card, otherwise nothing
	const miss = await pocketCatch({ name: 'PIKACHU', num: 25 }, seq(0.1)), hit = await pocketCatch({ name: 'PIKACHU', num: 25 }, seq(0.0999, 0));
	A(miss === null && hit && hit.id === pika[0] && hit.name === card(C.printInfo(pika[0]).card).name && total() === base + 1 && SV.collection().prints[pika[0]] === (C.newCollection().prints[pika[0]] || 0) + 1 && JSON.parse(mem.get(FOUND_KEY)).join() === pika[0], 'at 1 in 10 the catch gives one card of that Pokémon into the Pocket Enhanced collection on this device, and leaves a note of it', { miss, hit });
	const last = await pocketCatch({ name: 'PIKACHU', num: 25 }, seq(0, 0.9999));
	A(last && last.id === pika[pika.length - 1] && total() === base + 2, 'which printing is chance too: any of them can come up', last && last.id);
	// over many catches: about 1 in 10, and every printing reachable
	let n = 0; const got = new Set(); let a = 12345; const rnd = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
	for (let i = 0; i < 4000; i++) { const r = await pocketCatch({ name: 'PIKACHU', num: 25 }, rnd); if (r) { n++; got.add(r.id); } }
	A(n > 330 && n < 470 && got.size === pika.length, `over 4000 catches about 1 in 10 give a card (${n}), and every printing comes up`, { n, kinds: got.size });
	// a Pokémon with no card, and anything that is not a catch: nothing, and nothing thrown
	const before = total();
	A(await pocketCatch({ name: 'NOCARD', num: 99999 }, seq(0)) === null && await pocketCatch(null, seq(0)) === null && await pocketCatch({ name: 'X' }, seq(0)) === null && total() === before, 'a Pokémon with no card gives nothing');
	A(SV.collection().packs === 0 && SV.collection().st === C.START, '(the collection is otherwise as it was)');
}

// ===== 6. a new player also starts with five packs of each kind (owner, 2026-11-17) =====
{
	const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; }, rnd = seq(0.11, 0.52, 0.83, 0.27, 0.64, 0.4);
	const n0 = C.newCollection(), ids = C.BOOSTERS.map(b => b.id);
	A(C.START_OF_EACH === 5 && ids.every(id => C.packsOf(n0, id) === 5) && C.ownPacks(n0) === 5 * C.BOOSTERS.length && n0.packs === 0, `a new collection holds 5 packs of each of the ${C.BOOSTERS.length} boosters (and no pack of any kind)`, C.ownPacks(n0));
	A(!C.firstCollection().own && C.ownPacks(C.firstCollection()) === 0 && !C.cleanCollection(C.firstCollection()).own, 'a collection made before is as it was: it is not given them');
	// they open as their own booster only, one at a time, and are used before a pack of any kind
	let c = n0; for (let i = 0; i < 5; i++) { const r = C.openPack(c, 'C', rnd); A(!!r && C.packsOf(r.col, 'C') === 4 - i && C.packsOf(r.col, 'M') === 5 && r.col.packs === 0 && r.col.opened === i + 1 && r.pulls.every(p => C.printInfo(p.id).boosters.includes('C')), `Charizard pack ${i + 1} of 5 opens: ${4 - i} left, the other boosters untouched, Charizard cards`); c = r.col; }
	A(C.openPack(c, 'C', rnd) === null && !('C' in (c.own || {})), 'a sixth Charizard pack: none left (a Mewtwo pack does not open as one)');
	{ const w = C.addPacks(c, 1), r = C.openPack(w, 'C', rnd); A(!!r && r.col.packs === 0 && C.packsOf(r.col, 'M') === 5, 'then a pack of any kind (one bought with stars) opens as Charizard'); }
	{ const w = C.addPacks(n0, 2), r = C.openPack(w, 'M', rnd); A(r.col.packs === 2 && C.packsOf(r.col, 'M') === 4, "with both in hand, the booster's own pack is the one used"); }
	// stored and read back; nonsense dropped
	const back = C.cleanCollection(JSON.parse(JSON.stringify(c)));
	A(C.sameCollection(back, c) && C.packsOf(back, 'M') === 5 && C.packsOf(back, 'C') === 0, 'a collection read back keeps its packs of each booster');
	A(JSON.stringify(C.cleanCollection({ ...n0, own: { C: 3, ZZ: 9, M: -1, P: 1.5, W: 99999 } }).own) === JSON.stringify({ C: 3, W: C.MAX_PACKS }), 'an unknown booster, a negative or a part of a pack is dropped; a count is capped');
	A(!C.sameCollection(n0, c), 'two collections that differ only in their packs of a booster are not the same');
	// two devices: each opens packs; both land, none is counted twice
	{ const base = n0, a = C.openPack(C.openPack(base, 'C', rnd).col, 'C', rnd).col, b = C.openPack(base, 'M', rnd).col, m = C.merge3(base, a, b);
		A(C.packsOf(m, 'C') === 3 && C.packsOf(m, 'M') === 4 && C.packsOf(m, 'P') === 5 && m.opened === 3, 'two devices open packs from the same start: the account has 3 Charizard and 4 Mewtwo packs left, three opened'); }
	// a new guest who opened two, then signs in to an account that already has the new start: the five of each are not given twice
	{ const guest = C.openPack(C.openPack(n0, 'C', rnd).col, 'C', rnd).col, acct = C.openPack(n0, 'M', rnd).col, l = C.linkFirst(guest, acct);
		A(C.packsOf(l, 'C') === 5 && C.packsOf(l, 'M') === 4 && C.packsOf(l, 'P') === 5 && C.ownPacks(l) === C.ownPacks(acct), "a guest who signs in: the account's packs stand as they were (the device's own five of each are not added, and the two it opened are not taken out)", [C.packsOf(l, 'C'), C.packsOf(l, 'M')]); }
	{ const l = C.linkFirst(n0, C.firstCollection()); A(C.ownPacks(l) === 0 && l.packs === C.START_PACKS, 'a new device signing in to an account made before: that account is not given the five of each'); }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
