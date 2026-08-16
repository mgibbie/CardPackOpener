// gen_starter_decks.mjs — build one legal, curve-aware 40-card STARTER DECK per
// class, using ONLY cards a fresh account already owns (2x each common/basic, 1x
// each uncommon per collection.js getCollection). That makes every starter deck
// immediately loadable AND saveable/playable by a brand-new player — the whole
// point of a starter deck. Deterministic (sorted picks) so re-running is stable.
//
//   node tools/gen_starter_decks.mjs   →  writes battlecards/starter-decks.json
import fs from 'fs';

const data = JSON.parse(fs.readFileSync(new URL('../battlecards/cards.json', import.meta.url)));
const classes = JSON.parse(fs.readFileSync(new URL('../battlecards/classes.json', import.meta.url))).classes;
const cards = data.cards;

// mirrors collection.js — kept inline so this tool has no browser-only import chain
const collectible = d => d.type !== 'land' && !(d.colors && d.colors.length) && !d.companion && !d.commander && !d.token;
const fitsClass = (d, cls) => { const cc = d.cardClass || 'neutral'; return cc === 'neutral' || cc === cls || cc.split('__').includes(cls); };
// copies a new account owns: 2x common/basic (or no rarity), 1x uncommon, 0 else
const ownedCopies = d => { const r = d.rarity; if (!r || r === 'common' || r === 'basic') return 2; if (r === 'uncommon') return 1; return 0; };
const PLAYABLE = new Set(['creature', 'sorcery', 'spell', 'weapon']);

// a rough midrange curve summing to 40 (cost bucket → # of cards)
const TARGETS = { 1: 4, 2: 8, 3: 8, 4: 6, 5: 6, 6: 4, 7: 4 };
const bucketOf = c => (c <= 1 ? 1 : c >= 7 ? 7 : c);

function buildDeck(cls) {
	const playable = cards.filter(d => collectible(d) && fitsClass(d, cls) && ownedCopies(d) > 0 && PLAYABLE.has(d.type));
	const byBucket = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
	for (const d of playable) byBucket[bucketOf(d.cost ?? 0)].push(d);
	// deterministic order within a bucket: class cards first, then creatures, then name
	const rank = d => (d.cardClass === cls ? 0 : 1000) + (d.type === 'creature' ? 0 : 10);
	for (const b of Object.keys(byBucket)) byBucket[b].sort((a, z) => rank(a) - rank(z) || a.name.localeCompare(z.name));

	const deck = [], used = new Set();
	const addFrom = (b, need) => {
		for (const d of byBucket[b]) {
			if (deck.length >= 40 || need <= 0) break;
			if (used.has(d.id)) continue;
			const copies = Math.min(ownedCopies(d), need, 40 - deck.length);
			for (let i = 0; i < copies; i++) deck.push(d.id);
			used.add(d.id); need -= copies;
		}
	};
	for (const b of [2, 3, 4, 1, 5, 6, 7]) addFrom(b, TARGETS[b]);      // hit the curve targets
	for (const b of [2, 3, 4, 1, 5, 6, 7]) { if (deck.length >= 40) break; addFrom(b, 40); } // top up to 40 from anywhere
	return deck;
}

// self-check: exactly 40, ≤2 copies (≤1 legendary — excluded anyway), all owned
function validate(cls, ids) {
	if (ids.length !== 40) return `has ${ids.length} cards`;
	const counts = {};
	for (const id of ids) {
		const d = cards.find(c => c.id === id);
		if (!d) return `unknown card ${id}`;
		if (!collectible(d) || !fitsClass(d, cls)) return `${id} not legal for ${cls}`;
		counts[id] = (counts[id] || 0) + 1;
		if (counts[id] > ownedCopies(d)) return `too many copies of ${id}`;
	}
	return null;
}

const cap = s => s.replace(/\b\w/g, m => m.toUpperCase());
const out = [];
for (const c of classes) {
	const ids = buildDeck(c.id);
	const err = validate(c.id, ids);
	if (err) { console.warn(`SKIP ${c.id}: ${err}`); continue; }
	out.push({ id: 'starter_' + c.id, classId: c.id, name: `${c.name} Starter`, cards: ids });
	console.log(`ok  ${c.name.padEnd(14)} 40 cards, ${new Set(ids).size} unique`);
}

fs.writeFileSync(new URL('../battlecards/starter-decks.json', import.meta.url), JSON.stringify({ decks: out }, null, '\t') + '\n');
console.log(`\nwrote ${out.length} starter decks → battlecards/starter-decks.json`);
