// correspondence_bans_sync_test.mjs — the play-by-mail format ban list.
// server/correspondence-bans.json is GENERATED from cards.json by
// tools/gen-correspondence-bans.mjs; this pins the sync and the predicate:
// everything that counters spells is banned, and the +1/+1 "counter"
// vocabulary (counter-self / counter-doubler / grow / add-counters) is NOT.
// Fix a drift with:  node tools/gen-correspondence-bans.mjs
import { readFileSync } from 'fs';
import { isCounterCard, correspondenceOffenders, filterCorrespondence } from '../../format.js';
import { buildBans } from '../../../tools/gen-correspondence-bans.mjs';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const cards = JSON.parse(readFileSync(new URL('../../cards.json', import.meta.url))).cards;
const committed = JSON.parse(readFileSync(new URL('../../../server/correspondence-bans.json', import.meta.url)));
const expected = buildBans(cards);

ok('committed ban list matches the generator', JSON.stringify(committed) === JSON.stringify(expected),
	`drift — run: node tools/gen-correspondence-bans.mjs`);
ok('the ban list is a real population', committed.length >= 20 && committed.length < 200, committed.length);

// ---- predicate sanity: countering is banned... ----
const byId = Object.fromEntries(cards.map(c => [c.id, c]));
for (const id of ['counterspell', 'negate', 'cryptic_command', 'remand', 'mana_leak', 'swan_song',
	'grixis_deny_reality', 'castblock', 'mana_bind', 'objection', 'jace_ruse', 'azorius_ploy']) {
	ok(`${id} is banned`, byId[id] && isCounterCard(byId[id]) && committed.includes(id));
}
// ---- ...and the +1/+1 counter vocabulary is NOT ----
for (const id of ['champion_of_the_parish', 'abzan_falconer', 'wastes_everflowing_chalice', 'abzan_charm']) {
	ok(`${id} is legal (+1/+1 counters are not countering)`, byId[id] && !isCounterCard(byId[id]) && !committed.includes(id));
}

// ---- deck pre-flight ----
ok('a counter deck is flagged', correspondenceOffenders(['wisp', 'counterspell', 'negate', 'counterspell'], byId).join(',') === 'counterspell,negate');
ok('a clean deck passes', correspondenceOffenders(['wisp', 'lightning_bolt'], byId).length === 0);

// ---- the filtered card universe: generation can never produce a counter ----
const filtered = filterCorrespondence(byId, new Set());
ok('filtered universe drops exactly the banned ids', Object.keys(byId).length - Object.keys(filtered).length === committed.length,
	[Object.keys(byId).length, Object.keys(filtered).length, committed.length]);
const islandPool = Object.values(filtered).filter(c => c.landSet === 'Island' && !c.token);
ok('the Island conjure pool holds no counters', islandPool.length === 70 - 13 && islandPool.every(c => !isCounterCard(c)), islandPool.length);
ok('grandfathered ids survive the filter', 'counterspell' in filterCorrespondence(byId, new Set(['counterspell'])));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
