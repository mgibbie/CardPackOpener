// pool_rarity_sync_test.mjs — server/pool-rarity.json is the pack/deck universe
// the MP backend validates against, and it is GENERATED from cards.json by
// tools/gen-pool-rarity.mjs. Nothing regenerated it automatically, so card
// imports/retirements silently drifted (new cards unpackable, retired cards
// still rolling in packs). This suite pins the sync: it rebuilds the pool with
// the generator's own buildPool() and fails on any drift.
// Fix a failure with:  node tools/gen-pool-rarity.mjs   (then commit the JSON)
import { readFileSync } from 'fs';
import { buildPool } from '../../../tools/gen-pool-rarity.mjs';

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const cards = JSON.parse(readFileSync(new URL('../../cards.json', import.meta.url))).cards;
const committed = JSON.parse(readFileSync(new URL('../../../server/pool-rarity.json', import.meta.url)));
const expected = buildPool(cards);

const missing = Object.keys(expected).filter(id => !(id in committed));
const stale = Object.keys(committed).filter(id => !(id in expected));
const changed = Object.keys(expected).filter(id => id in committed
	&& (expected[id][0] !== committed[id][0] || expected[id][1] !== committed[id][1]));

ok('every eligible card is in the committed pool', missing.length === 0,
	`${missing.length} missing (e.g. ${missing.slice(0, 5).join(', ')}) — run: node tools/gen-pool-rarity.mjs`);
ok('no retired/ineligible cards linger in the pool', stale.length === 0,
	`${stale.length} stale (e.g. ${stale.slice(0, 5).join(', ')}) — run: node tools/gen-pool-rarity.mjs`);
ok('rarity/class entries match cards.json', changed.length === 0,
	`${changed.length} changed (e.g. ${changed.slice(0, 5).join(', ')}) — run: node tools/gen-pool-rarity.mjs`);

// belt-and-suspenders against the engine's deck rules, checked on the COMMITTED
// file directly so a future buildPool bug can't hide an illegal pool entry
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
const offenders = Object.keys(committed).filter(id => {
	const c = byId[id];
	return !c || c.token || c.companion || c.commander || c.collectible === false
		|| c.type === 'land' || c.type === 'heropower' || (c.colors && c.colors.length);
});
ok('no committed pool entry violates engine deck rules', offenders.length === 0, offenders.slice(0, 5).join(', '));

// shape sanity: the pool stays a real universe with every rarity the pack
// roller's weight tables expect
ok('pool is non-trivial', Object.keys(committed).length > 5000, Object.keys(committed).length);
for (const r of ['common', 'uncommon', 'rare', 'epic', 'legendary'])
	ok(`pool has ${r} cards`, Object.values(committed).some(([rar]) => rar === r));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
