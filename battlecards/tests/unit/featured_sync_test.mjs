// featured_sync_test.mjs — battlecards/featured.json (the Card of the Week pool)
// is GENERATED from cards.json by tools/gen_featured.mjs and stores a MINI
// snapshot of each card (so the start screen never loads the 4MB cards.json).
// Snapshots drift: a featured card redesigned in cards.json kept showing its OLD
// stats/text on the start screen with nothing to notice. This pins every mini
// field to the live definition — on failure, regenerate:
//   node tools/gen_featured.mjs
import fs from 'fs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
const pool = JSON.parse(fs.readFileSync(new URL('../../featured.json', import.meta.url))).cards;

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

ok('the pool exists and is non-trivial', Array.isArray(pool) && pool.length >= 20, pool?.length);
ok('no duplicate ids', new Set(pool.map(c => c.id)).size === pool.length);

// the exact MINI projection gen_featured writes — any diff means the pool is stale
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

const missing = pool.filter(c => !byId[c.id]).map(c => c.id);
ok('every featured card still exists in cards.json', missing.length === 0, missing.join(','));

const stale = [];
for (const snap of pool) {
	const live = byId[snap.id];
	if (!live) continue;
	if (JSON.stringify(snap) !== JSON.stringify(MINI(live))) stale.push(snap.id);
}
ok('every snapshot matches the live card (regen: node tools/gen_featured.mjs)', stale.length === 0,
	stale.slice(0, 6).join(',') + (stale.length > 6 ? ` (+${stale.length - 6} more)` : ''));

const notLegendary = pool.filter(c => byId[c.id] && (byId[c.id].rarity !== 'legendary' || byId[c.id].collectible === false || byId[c.id].token)).map(c => c.id);
ok('the pool is still collectible legendaries only', notLegendary.length === 0, notLegendary.join(','));

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
