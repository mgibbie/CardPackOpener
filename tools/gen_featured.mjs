// tools/gen_featured.mjs — build battlecards/featured.json, a small curated pool
// of spotlight-worthy cards (legendaries with real art + rules text) for the
// "Card of the Week" on the Battlecards start screen. Keeping it a tiny separate
// file means the start screen never loads the 4MB cards.json (or THREE) just to
// show one card. Re-run after big card imports to refresh the pool (optional — the
// weekly rotation keeps working on the existing pool regardless).
//
//   node tools/gen_featured.mjs
import fs from 'fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'); // win-safe
const cards = JSON.parse(fs.readFileSync(ROOT + 'battlecards/cards.json', 'utf8')).cards;
const artIds = new Set(JSON.parse(fs.readFileSync(ROOT + 'battlecards/art/index.json', 'utf8')));

const CAP = 120; // ~2+ years of weekly rotation; keeps the file tiny
const MINI = c => ({
	id: c.id, name: c.name, cost: c.cost ?? 0, cardClass: c.cardClass || 'neutral',
	type: c.type, rarity: c.rarity || 'common',
	...(c.attack != null ? { attack: c.attack } : {}),
	...(c.health != null ? { health: c.health } : {}),
	...(c.durability != null ? { durability: c.durability } : {}),
	...(c.tribe ? { tribe: c.tribe } : {}),
	description: c.description || '',
	...(c.keywords && c.keywords.length ? { keywords: c.keywords } : {}),
});

// spotlight-worthy: collectible legendaries with a real art crop and rules text
let pool = cards.filter(c =>
	c.rarity === 'legendary' && c.collectible !== false && !c.token
	&& c.type !== 'heropower' && c.type !== 'land'
	&& (c.description || '').trim().length > 0
	&& artIds.has(c.id));

pool.sort((a, b) => a.id.localeCompare(b.id)); // stable order → stable weekly index

// class-diverse sample up to CAP: round-robin across classes so the rotation
// isn't 40 straight neutrals before a class card appears
const byClass = {};
for (const c of pool) (byClass[c.cardClass || 'neutral'] ||= []).push(c);
const classes = Object.keys(byClass).sort();
const picked = [];
let idx = 0;
while (picked.length < Math.min(CAP, pool.length)) {
	let any = false;
	for (const cl of classes) { const arr = byClass[cl]; if (idx < arr.length) { picked.push(arr[idx]); any = true; if (picked.length >= CAP) break; } }
	if (!any) break;
	idx++;
}
picked.sort((a, b) => a.id.localeCompare(b.id)); // final stable order

const out = { generated: 'gen_featured.mjs', count: picked.length, cards: picked.map(MINI) };
fs.writeFileSync(ROOT + 'battlecards/featured.json', JSON.stringify(out));
console.log(`featured.json: ${picked.length} cards from a pool of ${pool.length} legendaries with art`);
console.log('classes represented:', [...new Set(picked.map(c => c.cardClass))].sort().join(', '));
