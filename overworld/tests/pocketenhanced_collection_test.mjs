// Pocket Enhanced: the collection's rules (pocketenhanced/js/collection.js) — what a pack holds, its odds, what a new
// player owns, the pack-point exchange, and what a deck may be built from.
//   node overworld/tests/pocketenhanced_collection_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as C from '../../pocketenhanced/js/collection.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
import { CARDS, card } from '../../pocketenhanced/js/data/cards.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { STARTERS, starterDeck } from '../../pocketenhanced/js/decks.js';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra)); } };
const rng = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---- the data
A(PRINTS.length === 4104 && PRINTS.every(p => card(p[0]) && card(p[0]).id === p[1]), 'every printing of the source is listed, and plays as its card');
A(CARDS.every(c => c.printings.every(p => C.printInfo(p))), 'the printings of every card are in the pack data');
for (const b of C.BOOSTERS.filter(x => x.set === 'Genetic Apex')) {
	const n = r => PRINTS.filter(p => p[3].includes(b.id) && p[2] === r).length;
	A(n('1D') === 50 && n('2D') === 35 && n('3D') === 14 && n('4D') === 5 && n('1S') === 8 && n('3S') === 1 && n('CR') === 3 && n('2S') >= 9, `the ${b.name} booster has its rarities (50/35/14/5 diamonds, 8 one-star, 1 immersive, 3 crowns)`);
}
{ const n = r => PRINTS.filter(p => p[3] === 'W' && p[2] === r).length;
	A(C.BOOSTERS.length === 29 && n('1D') === 32 && n('2D') === 23 && n('3D') === 8 && n('4D') === 5 && n('1S') === 6 && n('2S') === 10 && n('3S') === 1 && n('CR') === 1 && PRINTS.filter(p => p[0].startsWith('A1a-')).every(p => p[3] === 'W'), 'the Mew booster holds all 86 Mythical Island printings (32/23/8/5 diamonds, 6 one-star, 10 two-star, 1 immersive, 1 crown)'); }
{ const n = (b, r) => PRINTS.filter(p => p[3].includes(b) && p[2] === r).length;
	A(n('D', '1D') === 46 && n('K', '1D') === 44 && ['D', 'K'].every(b => n(b, '4D') === 5 && n(b, '3D') === 14 && n(b, '1S') === 12 && n(b, '2S') === 12 && n(b, '3S') === 1 && n(b, 'CR') === 2) && n('D', '2D') === 34 && n('K', '2D') === 36 && PRINTS.filter(p => p[0].startsWith('A2-')).every(p => /^(D|K|DK)$/.test(p[3]) && p[2] !== 'N'), 'the Dialga and Palkia boosters hold all 207 Space-Time Smackdown printings between them, every one with a rarity'); }
{ const n = r => PRINTS.filter(p => p[3] === 'A' && p[2] === r).length;
	A(n('1D') === 31 && n('2D') === 26 && n('3D') === 13 && n('4D') === 5 && n('1S') === 6 && n('2S') === 13 && n('3S') === 1 && n('CR') === 1 && PRINTS.filter(p => p[0].startsWith('A2a-')).every(p => p[3] === 'A'), 'the Arceus booster holds all 96 Triumphant Light printings'); }
A(PRINTS.filter(p => !p[3]).every(p => p[2] === 'N' || p[0] === C.SECRET) && PRINTS.every(p => p[2] !== 'N' || !p[3]), 'only the promo Trainers and Mew are in no booster, and nothing without a rarity is in one');
A(Object.values(C.SHINY_SLOT_ODDS).every(o => Math.abs(Object.values(o).reduce((a, b) => a + b, 0) - 100) < 0.002) && C.SHINY_SLOT_ODDS[4].CR === 0.04 && C.oddsOf('S') === C.SHINY_SLOT_ODDS && C.oddsOf('C') === C.SLOT_ODDS && C.oddsOf('A') === C.SLOT_ODDS, 'a booster with shiny printings uses the table that includes them (each slot still sums to 100%); the others keep theirs');
{ const n = r => PRINTS.filter(p => p[3] === 'S' && p[2] === r).length; let shiny = 0, bad = 0; const rr = rng(77);
	for (let i = 0; i < 4000; i++) { const ids = C.rollPack('S', rr); if (ids.length !== 5 || ids.some(x => C.printInfo(x).boosters !== 'S') || ids.slice(0, 3).some(x => C.printInfo(x).rarity !== '1D')) bad++; shiny += ids.filter(x => /H$/.test(C.printInfo(x).rarity)).length; }
	A(n('1D') === 32 && n('1H') === 10 && n('2H') === 4 && n('CR') === 1 && PRINTS.filter(p => p[0].startsWith('A2b-')).every(p => p[3] === 'S') && bad === 0 && shiny > 100 && shiny < 320, 'the Shining booster holds all 111 Shining Revelry printings, 14 of them shiny, and its packs do turn up shiny cards (about 1 pack in 19)', { shiny, bad }); }
{ const n = (b, r) => PRINTS.filter(p => p[3].includes(b) && p[2] === r).length;
	A(['O', 'U'].every(b => n(b, '1D') === 44 && n(b, '2D') === 34 && n(b, '3D') === 14 && n(b, '4D') === 5 && n(b, '1S') === 12 && n(b, '2S') === 14 && n(b, '3S') === 1 && n(b, '1H') === 10 && n(b, '2H') === 4 && n(b, 'CR') === 2 && C.oddsOf(b) === C.SHINY_SLOT_ODDS) && PRINTS.filter(p => p[0].startsWith('A3-')).every(p => /^(O|U|OU)$/.test(p[3]) && p[2] !== 'N'), 'the Solgaleo and Lunala boosters hold all 239 Celestial Guardians printings between them, shiny ones included, and roll on the shiny table'); }
A(PRINTS.filter(p => p[0].startsWith('A3a-')).length === 103 && PRINTS.filter(p => p[0].startsWith('A3a-')).every(p => p[3] === 'X') && C.oddsOf('X') === C.SHINY_SLOT_ODDS && C.rollPack('X', () => 0.5).every(id => id.startsWith('A3a-')), 'the Extradimensional Crisis booster holds all 103 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('A3b-')).length === 107 && PRINTS.filter(p => p[0].startsWith('A3b-')).every(p => p[3] === 'E') && C.oddsOf('E') === C.SHINY_SLOT_ODDS && C.rollPack('E', () => 0.5).every(id => id.startsWith('A3b-')), 'the Eevee Grove booster holds all 107 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('A4-')).length === 241 && PRINTS.filter(p => p[0].startsWith('A4-')).every(p => /^(L|H|HL)$/.test(p[3])) && ['L', 'H'].every(b => PRINTS.filter(p => p[3].includes(b)).length === 136 && C.oddsOf(b) === C.SHINY_SLOT_ODDS), 'the Lugia and Ho-Oh boosters hold all 241 Wisdom of Sea and Sky printings between them (136 each) and roll on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('A4a-')).length === 105 && PRINTS.filter(p => p[0].startsWith('A4a-')).every(p => p[3] === 'G') && C.oddsOf('G') === C.SHINY_SLOT_ODDS && C.rollPack('G', () => 0.5).every(id => id.startsWith('A4a-')), 'the Secluded Springs booster holds all 105 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B1-')).length === 331 && PRINTS.filter(p => p[0].startsWith('B1-')).every(p => /^[BTY]+$/.test(p[3])) && ['Y', 'B', 'T'].every(b => PRINTS.filter(p => p[0].startsWith('B1-') && p[3].includes(b)).length === 139 && C.oddsOf(b) === C.SHINY_SLOT_ODDS), 'the three Mega Rising boosters hold all 331 of its printings between them (139 each) and roll on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B1a-')).length === 103 && PRINTS.filter(p => p[0].startsWith('B1a-')).every(p => p[3] === 'R') && C.oddsOf('R') === C.SHINY_SLOT_ODDS && C.rollPack('R', () => 0.5).every(id => id.startsWith('B1a-')), 'the Crimson Blaze booster holds all 103 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B2-')).length === 234 && PRINTS.filter(p => p[0].startsWith('B2-')).every(p => p[3] === 'F') && C.oddsOf('F') === C.SHINY_SLOT_ODDS && C.rollPack('F', () => 0.5).every(id => id.startsWith('B2-')), 'the Fantastical Parade booster holds all 234 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B2a-')).length === 131 && PRINTS.filter(p => p[0].startsWith('B2a-')).every(p => p[3] === 'N') && C.oddsOf('N') === C.SHINY_SLOT_ODDS && C.rollPack('N', () => 0.5).every(id => id.startsWith('B2a-')), 'the Paldean Wonders booster holds all 131 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B2b-')).length === 117 && PRINTS.filter(p => p[0].startsWith('B2b-')).every(p => p[3] === 'I') && C.oddsOf('I') === C.SHINY_SLOT_ODDS && C.rollPack('I', () => 0.5).every(id => id.startsWith('B2b-')), 'the Mega Shine booster holds all 117 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B3-')).length === 234 && PRINTS.filter(p => p[0].startsWith('B3-')).every(p => p[3] === 'V') && C.oddsOf('V') === C.SHINY_SLOT_ODDS && C.rollPack('V', () => 0.5).every(id => id.startsWith('B3-')), 'the Pulsing Aura booster holds all 234 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B3a-')).length === 109 && PRINTS.filter(p => p[0].startsWith('B3a-')).every(p => p[3] === 'Z') && C.oddsOf('Z') === C.SHINY_SLOT_ODDS && C.rollPack('Z', () => 0.5).every(id => id.startsWith('B3a-')), 'the Paradox Drive booster holds all 109 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B3b-')).length === 106 && PRINTS.filter(p => p[0].startsWith('B3b-')).every(p => p[3] === 'J') && C.oddsOf('J') === C.SHINY_SLOT_ODDS && C.rollPack('J', () => 0.5).every(id => id.startsWith('B3b-')), 'the Everyday Wonders booster holds all 106 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B4-')).length === 233 && PRINTS.filter(p => p[0].startsWith('B4-')).every(p => p[3] === '1') && C.oddsOf('1') === C.SHINY_SLOT_ODDS && C.rollPack('1', () => 0.5).every(id => id.startsWith('B4-')), 'the Ruler of the Skies booster holds all 233 of its printings and rolls on the shiny table');
A(PRINTS.filter(p => p[0].startsWith('B4a-')).length === 110 && PRINTS.filter(p => p[0].startsWith('B4a-')).every(p => p[3] === '2') && C.oddsOf('2') === C.SHINY_SLOT_ODDS && C.rollPack('2', () => 0.5).every(id => id.startsWith('B4a-')), 'the Team Rocket booster holds all 110 of its printings and rolls on the shiny table');
{	// Deluxe Pack: Mega: Deluxe Pack ex's shape, on its own published rates (kept in the set's source file)
	const q = PRINTS.filter(p => p[0].startsWith('B4b-')), n = r => q.filter(p => p[2] === r).length, sp = C.SPECIAL_PACKS['3'];
	A(q.length === 429 && q.every(p => p[3] === '3') && n('1D') === 71 && n('1F') === 71 && n('2D') === 65 && n('2F') === 65 && n('3D') === 30 && n('3F') === 30 && n('4D') === 70 && n('1S') === 6 && n('2S') === 16 && n('3S') === 1 && n('2H') === 2 && n('CR') === 2, 'Deluxe Pack: Mega holds its 429 printings: each card of one to three diamonds twice, plain and foil');
	const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_b4b.json'), 'utf8')).set.pullRates, CODE = { C: '1D', U: '2D', R: '3D', RR: '4D', CF: '1F', UF: '2F', RF: '3F', AR: '1S', SR: '2S', IM: '3S', SSR: '2H', UR: 'CR' };
	const same = (mine, theirs) => Object.keys(theirs).length === Object.keys(mine).length && Object.entries(theirs).every(([k, v]) => Math.abs(mine[CODE[k]] - v) < 0.002);
	A(C.packSize('3') === 4 && [1, 2, 3, 4].every(i => same(sp.slots[i - 1], src['Regular Pack'].slots[i])) && same(sp.rare, src['Rare Pack'].slots[1]) && same(sp.rareLast, src['Rare Pack'].slots[4]) && same(sp.plus.slot, src['Regular Pack +1'].slots[5]) && Math.abs(sp.plus.chance * 100 - src['Regular Pack +1'].appearance_rate) < 0.001,
		'its pack is 4 cards on the published rates, with the rare pack\'s own fourth card, and 1.666% of packs hold a fifth, shiny card');
	let s3 = 11; const r3 = () => (s3 = (s3 * 16807) % 2147483647) / 2147483647; let bad = 0, five = 0;
	for (let i = 0; i < 6000; i++) { const ids = C.rollPack('3', r3); if (!ids.every(id => id.startsWith('B4b-')) || (ids.length !== 4 && ids.length !== 5)) bad++; if (ids.length === 5) { five++; if (C.printInfo(ids[4]).rarity !== '2H') bad++; } }
	A(bad === 0 && five > 60 && five < 150, 'opened 6,000 times: every pack is 4 cards, or 5 with a shiny fifth about 1 time in 60', five);
}
{	// Deluxe Pack ex: a pack of its own shape (published rates, kept in the set's source file)
	const q = PRINTS.filter(p => p[0].startsWith('A4b-')), n = r => q.filter(p => p[2] === r).length, sp = C.SPECIAL_PACKS.Q;
	A(q.length === 379 && q.every(p => p[3] === 'Q') && n('1D') === 64 && n('1F') === 64 && n('2D') === 50 && n('2F') === 50 && n('3D') === 25 && n('3F') === 25 && n('4D') === 75 && n('1S') === 6 && n('2S') === 16 && n('3S') === 1 && n('2H') === 2 && n('CR') === 1, 'Deluxe Pack ex holds its 379 printings: each diamond card of one to three diamonds twice, plain and foil');
	const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'pocketenhanced/data/source/alt_a4b.json'), 'utf8')).set.pullRates, CODE = { C: '1D', U: '2D', R: '3D', RR: '4D', CF: '1F', UF: '2F', RF: '3F', AR: '1S', SR: '2S', IM: '3S', SSR: '2H', UR: 'CR' };
	const same = (mine, theirs) => Object.keys(theirs).length === Object.keys(mine).length && Object.entries(theirs).every(([k, v]) => mine[CODE[k]] === v);
	A(C.packSize('Q') === 4 && C.packSize('C') === 5 && [1, 2, 3, 4].every(i => same(sp.slots[i - 1], src['Regular Pack'].slots[i])) && same(sp.rare, src['Rare Pack'].slots[1]) && src['Rare Pack'].appearance_rate === C.RARE_PACK_CHANCE * 100 && sp.slots.every(s => Math.abs(Object.values(s).reduce((a, b) => a + b, 0) - 100) < 0.01),
		'its pack is 4 cards on the published rates: a one-diamond card, then one or two diamonds, then a table with foils and the rare cards, then always a four-diamond Pokémon ex');
	let s2 = 7; const r2 = () => (s2 = (s2 * 16807) % 2147483647) / 2147483647, seen = {}; let bad = 0;
	for (let i = 0; i < 4000; i++) { const ids = C.rollPack('Q', r2); if (ids.length !== 4 || !ids.every(id => id.startsWith('A4b-'))) bad++; const rr = ids.map(id => C.printInfo(id).rarity); if (!C.isRarePack(ids) && (rr[0] !== '1D' || !/^(1D|2D)$/.test(rr[1]) || rr[3] !== '4D')) bad++; seen[rr[2]] = (seen[rr[2]] || 0) + 1; }
	A(bad === 0 && seen['1F'] > 700 && seen['2F'] > 500 && seen['3F'] > 200 && seen['3D'] > 1000 && seen['1S'] > 350, 'opened 4,000 times: every pack has that shape, and the third card is a foil about half the time', seen);
}
A(Object.values(C.SLOT_ODDS).every(o => Math.abs(Object.values(o).reduce((a, b) => a + b, 0) - 100) < 1e-9), 'the odds of each rolled slot sum to 100%');

// ---- a pack
const r = rng(11);
let wrong = 0, rare = 0; const tally = {};
for (let i = 0; i < 6000; i++) {
	const b = C.BOOSTERS.filter(x => C.oddsOf(x.id) === C.SLOT_ODDS)[i % 7].id, ids = C.rollPack(b, r);
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
let threw = false; try { C.rollPack('no-such-booster', r); } catch (e) { threw = true; }
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
