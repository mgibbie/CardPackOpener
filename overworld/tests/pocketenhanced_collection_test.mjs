// Pocket Enhanced: the collection's rules (pocketenhanced/js/collection.js) — what a pack holds, its odds, what a new
// player owns, the pack-point exchange, and what a deck may be built from.
//   node overworld/tests/pocketenhanced_collection_test.mjs
import * as C from '../../pocketenhanced/js/collection.js';
import { CARDS, card } from '../../pocketenhanced/js/data/cards.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { STARTERS, starterDeck } from '../../pocketenhanced/js/decks.js';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra)); } };
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---- the data
A(PRINTS.length === 793 && PRINTS.every(p => card(p[0]) && card(p[0]).id === p[1]), 'every printing of the source is listed, and plays as its card');
A(CARDS.every(c => c.printings.every(p => C.printInfo(p))), 'the printings of every card are in the pack data');
for (const b of C.BOOSTERS.filter(x => x.set === 'Genetic Apex')) {
	const n = r => PRINTS.filter(p => p[3].includes(b.id) && p[2] === r).length;
	A(n('1D') === 50 && n('2D') === 35 && n('3D') === 14 && n('4D') === 5 && n('1S') === 8 && n('3S') === 1 && n('CR') === 3 && n('2S') >= 9, `the ${b.name} booster has its rarities (50/35/14/5 diamonds, 8 one-star, 1 immersive, 3 crowns)`);
}
{ const n = r => PRINTS.filter(p => p[3] === 'W' && p[2] === r).length;
	A(C.BOOSTERS.length === 8 && n('1D') === 32 && n('2D') === 23 && n('3D') === 8 && n('4D') === 5 && n('1S') === 6 && n('2S') === 10 && n('3S') === 1 && n('CR') === 1 && PRINTS.filter(p => p[0].startsWith('A1a-')).every(p => p[3] === 'W'), 'the Mew booster holds all 86 Mythical Island printings (32/23/8/5 diamonds, 6 one-star, 10 two-star, 1 immersive, 1 crown)'); }
{ const n = (b, r) => PRINTS.filter(p => p[3].includes(b) && p[2] === r).length;
	A(n('D', '1D') === 46 && n('K', '1D') === 44 && ['D', 'K'].every(b => n(b, '4D') === 5 && n(b, '3D') === 14 && n(b, '1S') === 12 && n(b, '2S') === 12 && n(b, '3S') === 1 && n(b, 'CR') === 2) && n('D', '2D') === 34 && n('K', '2D') === 36 && PRINTS.filter(p => p[0].startsWith('A2-')).every(p => /^(D|K|DK)$/.test(p[3]) && p[2] !== 'N'), 'the Dialga and Palkia boosters hold all 207 Space-Time Smackdown printings between them, every one with a rarity'); }
{ const n = r => PRINTS.filter(p => p[3] === 'A' && p[2] === r).length;
	A(n('1D') === 31 && n('2D') === 26 && n('3D') === 13 && n('4D') === 5 && n('1S') === 6 && n('2S') === 13 && n('3S') === 1 && n('CR') === 1 && PRINTS.filter(p => p[0].startsWith('A2a-')).every(p => p[3] === 'A'), 'the Arceus booster holds all 96 Triumphant Light printings'); }
A(PRINTS.filter(p => !p[3]).every(p => p[2] === 'N' || p[0] === C.SECRET) && PRINTS.every(p => p[2] !== 'N' || !p[3]), 'only the promo Trainers and Mew are in no booster, and nothing without a rarity is in one');
A(Object.values(C.SHINY_SLOT_ODDS).every(o => Math.abs(Object.values(o).reduce((a, b) => a + b, 0) - 100) < 0.002) && C.SHINY_SLOT_ODDS[4].CR === 0.04 && C.oddsOf('S') === C.SHINY_SLOT_ODDS && C.oddsOf('C') === C.SLOT_ODDS && C.oddsOf('A') === C.SLOT_ODDS, 'a booster with shiny printings uses the table that includes them (each slot still sums to 100%); the others keep theirs');
{ const n = r => PRINTS.filter(p => p[3] === 'S' && p[2] === r).length; let shiny = 0, bad = 0; const rr = rng(77);
	for (let i = 0; i < 4000; i++) { const ids = C.rollPack('S', rr); if (ids.length !== 5 || ids.some(x => C.printInfo(x).boosters !== 'S') || ids.slice(0, 3).some(x => C.printInfo(x).rarity !== '1D')) bad++; shiny += ids.filter(x => /H$/.test(C.printInfo(x).rarity)).length; }
	A(n('1D') === 32 && n('1H') === 10 && n('2H') === 4 && n('CR') === 1 && PRINTS.filter(p => p[0].startsWith('A2b-')).every(p => p[3] === 'S') && bad === 0 && shiny > 100 && shiny < 320, 'the Shining booster holds all 111 Shining Revelry printings, 14 of them shiny, and its packs do turn up shiny cards (about 1 pack in 19)', { shiny, bad }); }
A(Object.values(C.SLOT_ODDS).every(o => Math.abs(Object.values(o).reduce((a, b) => a + b, 0) - 100) < 1e-9), 'the odds of each rolled slot sum to 100%');

// ---- a pack
const r = rng(11);
let wrong = 0, rare = 0; const tally = {};
for (let i = 0; i < 6000; i++) {
	const b = C.BOOSTERS.filter(x => x.id !== 'S')[i % 7].id, ids = C.rollPack(b, r);
	if (C.isRarePack(ids)) { rare++; continue; }
	if (ids.length !== 5 || ids.slice(0, 3).some(id => C.printInfo(id).rarity !== '1D') || ids.slice(3).some(id => C.printInfo(id).rarity === '1D') || ids.some(id => !C.printInfo(id).boosters.includes(b))) wrong++;
	tally[C.printInfo(ids[3]).rarity + '@4'] = (tally[C.printInfo(ids[3]).rarity + '@4'] || 0) + 1;
	tally[C.printInfo(ids[4]).rarity + '@5'] = (tally[C.printInfo(ids[4]).rarity + '@5'] || 0) + 1;
}
A(wrong === 0 && rare < 15, 'a pack is 5 cards of its booster: three one-diamond, then two that are never one-diamond (a rare pack aside)', { wrong, rare });
{	// a rare pack: one in 2,000; all five cards from one star up
	const seq = vals => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };
	const rp = C.rollPack('C', seq([0.0001, 0.1, 0.5, 0.45, 0.2, 0.93, 0.7, 0.97, 0.3, 0.2, 0.9])), sp = C.rollPack('S', seq([0.0004, 0.9, 0.5, 0.9, 0.5, 0.9, 0.5, 0.9, 0.5, 0.9, 0.5]));
	A(C.isRarePack(rp) && rp.every(x => C.printInfo(x).boosters.includes('C')) && C.printInfo(rp[0]).rarity === '1S' && C.printInfo(rp[2]).rarity === '3S' && C.printInfo(rp[3]).rarity === 'CR' && !C.isRarePack(C.rollPack('C', seq([0.0006, 0.5]))), 'a roll under 0.05% makes the pack a rare pack: five cards of one star or better from that booster', rp.map(x => C.printInfo(x).rarity));
	A(C.isRarePack(sp) && sp.every(x => C.printInfo(x).rarity === '1H') && Math.abs(Object.values(C.RARE_PACK_ODDS).reduce((a, b) => a + b, 0) - 100) < 1e-9 && Math.abs(Object.values(C.SHINY_RARE_PACK_ODDS).reduce((a, b) => a + b, 0) - 100) < 1e-9, 'a rare Shining pack can hold shiny cards; both rare-pack tables sum to 100%', sp.map(x => C.printInfo(x).rarity));
	const o = C.openPack(C.newCollection(), 'C', seq([0.0001, 0.1, 0.5])); A(o.rare === true && C.openPack(C.newCollection(), 'C', rng(5)).rare === false, 'opening one says so');
}
A(Math.abs(tally['2D@4'] / 6000 - 0.9) < 0.02 && Math.abs(tally['2D@5'] / 6000 - 0.6) < 0.025 && Math.abs(tally['3D@5'] / 6000 - 0.2) < 0.02 && Math.abs(tally['1S@5'] / 6000 - 0.10288) < 0.015, 'the fourth and fifth cards follow the slot odds', tally);
A(C.rollPack('C', () => 0.999999).every(id => C.printInfo(id)) && C.rollPack('M', () => 0).every(id => C.printInfo(id)), 'the ends of the random range still give cards');
let threw = false; try { C.rollPack('X', r); } catch (e) { threw = true; }
A(threw, 'a booster that does not exist is refused');

// ---- a collection
const c0 = C.newCollection();
A(c0.packs === C.START_PACKS && Object.keys(c0.prints).length === 7 && Object.values(c0.prints).every(n => n === 2) && C.owned(c0, 'P-A-005') === 2, 'a new player has 10 packs and two of each of the 7 promo Trainers');
const o = C.openPack(c0, 'C', rng(3));
A(o.col.packs === 9 && o.col.points === 5 && o.col.opened === 1 && o.pulls.length === 5 && c0.packs === 10 && Object.keys(c0.prints).length === 7, 'opening a pack takes one pack, gives 5 cards and 5 pack points, and leaves the old collection untouched');
A(o.pulls.every(p => C.owned(o.col, p.card) >= 1) && o.pulls.filter(p => p.isNew).length === new Set(o.pulls.map(p => p.card)).size, 'pulled cards are owned; "new" marks only the first copy of a card');
A(C.openPack({ ...c0, packs: 0 }, 'C', r) === null, 'no pack, nothing to open');
const alt = CARDS.find(c => c.printings.length > 1);
A(C.owned({ prints: { [alt.printings[1]]: 1 } }, alt.id) === 1 && C.bestPrint({ prints: { [alt.printings[0]]: 1, [alt.printings[1]]: 1 } }, alt.id) === alt.printings[1], 'an alternate printing counts as its card, and the rarest printing is the one shown');
A(C.addPacks({ ...c0, packs: 998 }, 5).packs === C.MAX_PACKS && C.addPacks(c0, -3).packs === 10, 'packs are capped, and never taken away by a bad number');

// ---- stored collections
A(C.cleanCollection(null) === null && C.cleanCollection({ v: 99, prints: {} }) === null && C.cleanCollection('x') === null, 'an unreadable or newer stored collection is not used');
const cl = C.cleanCollection({ v: 1, prints: { 'A1-001': 3, bogus: 2, 'A1-002': -1, 'A1-003': 1.5, 'A1-004': 500 }, packs: -4, points: 'x', opened: 2 });
A(JSON.stringify(cl.prints) === JSON.stringify({ 'A1-001': 3, 'A1-004': C.MAX_COPIES }) && cl.packs === 0 && cl.points === 0 && cl.opened === 2, 'a stored collection is read defensively (unknown cards and bad numbers dropped)', cl);

// ---- the exchange
A(C.exchangeCost('A1-001') === 35 && C.exchangeCost('A1-036') === 500 && C.exchangeCost('P-A-001') === null && C.exchangeCost(C.SECRET) === null, 'pack points: 35 for a one-diamond card, 500 for an ex; promos and Mew cannot be bought');
A(typeof C.exchange(c0, 'A1-001') === 'string' && /35 pack points/.test(C.exchange(c0, 'A1-001')), 'too few pack points says how many it takes');
const ex = C.exchange({ ...c0, points: 40 }, 'A1-001');
A(ex.points === 5 && C.owned(ex, 'A1-001') === 1 && c0.points === 0, 'an exchange adds the card and takes its points');

// ---- decks
const deck = starterDeck(STARTERS[0].id).deck;
const miss = C.missingFor(c0, deck);
A(miss.length > 0 && miss.every(m => m.have < m.need) && !miss.some(m => card('P-A-005').name === m.name), 'a starter deck needs cards a new player does not own (their promo Trainers are covered)', miss.length);
const full = { ...c0, prints: { ...c0.prints } }; for (const id of deck) full.prints[card(id).id] = (full.prints[card(id).id] || 0) + 1;
A(C.missingFor(full, deck).length === 0, 'owning every card of a deck leaves nothing missing');
const one = { ...c0, prints: { [deck[0]]: 1 } };
A(C.missingFor(one, [deck[0], deck[0]]).some(m => m.need === 2 && m.have === 1), 'two copies in a deck need two copies owned');

// ---- Mew
const kanto = {}; for (const c of CARDS) if (c.dex >= 1 && c.dex <= 150) kanto[c.id] = 1;
A(C.owned(C.claimSecrets({ ...c0, prints: kanto }), C.SECRET) === 1, 'owning every Pokémon from 1 to 150 brings Mew');
const short = { ...kanto }; for (const c of CARDS.filter(x => x.dex === 25)) delete short[c.id];
A(C.owned(C.claimSecrets({ ...c0, prints: short }), C.SECRET) === 0, 'with no Pikachu, no Mew');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
