// Regenerate netlify/functions/pool-rarity.json — the deck/pack card universe the
// MP backend validates against. Must be rerun whenever battlecards/cards.json grows,
// or newly-imported cards can't be packed, decked, or granted.
//
//   node tools/gen-pool-rarity.mjs
//
// POOL shape: { id: [rarity, cardClass] }. Deck-eligible = the engine's createGame
// "playable" set: no tokens/lands/hero-powers/companions/commanders, no colored
// (land-conjured) cards, minus the hard-coded UNPLAYABLE ids.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cards = JSON.parse(readFileSync(join(root, 'battlecards', 'cards.json'), 'utf8')).cards;
const UNPLAYABLE = new Set(['silencer', 'westward_prosperity']); // mirrors engine.js

const deckEligible = c => !(
	c.token || c.companion || c.commander ||
	c.type === 'land' || c.type === 'heropower' ||
	(c.colors && c.colors.length) || UNPLAYABLE.has(c.id));

const pool = {};
for (const c of cards) {
	if (!deckEligible(c)) continue;
	pool[c.id] = [c.rarity || 'common', c.cardClass || 'neutral'];
}
const out = join(root, 'netlify', 'functions', 'pool-rarity.json');
writeFileSync(out, JSON.stringify(pool, null, 0));
console.log(`wrote ${Object.keys(pool).length} cards to ${out}`);
