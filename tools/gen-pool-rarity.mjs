// Regenerate server/pool-rarity.json — the deck/pack card universe the
// MP backend validates against. Must be rerun whenever battlecards/cards.json
// changes (new cards, retirements), or newly-imported cards can't be packed,
// decked, or granted — and retired ones linger in packs. CI enforces the sync:
// battlecards/tests/unit/pool_rarity_sync_test.mjs fails when this script's
// output drifts from the committed JSON.
//
//   node tools/gen-pool-rarity.mjs
//
// POOL shape: { id: [rarity, cardClass] }. Deck-eligible mirrors the engine's
// createGame "playable" set (battlecards/engine/core.js): no tokens, companions,
// or commanders (own zones), no retired cards (collectible: false), no lands or
// land-conjured (colored) cards, minus the engine's UNPLAYABLE ids — plus no
// hero powers (never deck cards, whatever their collectible flag says).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { UNPLAYABLE } from '../battlecards/engine/core.js';

export const poolEligible = c => !(
	UNPLAYABLE.has(c.id) || c.token || c.companion || c.commander ||
	c.collectible === false ||
	c.type === 'land' || c.type === 'heropower' ||
	(c.colors && c.colors.length));

export function buildPool(cards) {
	const pool = {};
	for (const c of cards) {
		if (!poolEligible(c)) continue;
		pool[c.id] = [c.rarity || 'common', c.cardClass || 'neutral'];
	}
	return pool;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
	const root = join(dirname(fileURLToPath(import.meta.url)), '..');
	const cards = JSON.parse(readFileSync(join(root, 'battlecards', 'cards.json'), 'utf8')).cards;
	const pool = buildPool(cards);
	const out = join(root, 'server', 'pool-rarity.json');
	writeFileSync(out, JSON.stringify(pool, null, 0));
	console.log(`wrote ${Object.keys(pool).length} cards to ${out}`);
}
