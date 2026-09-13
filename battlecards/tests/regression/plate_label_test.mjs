// plate_label_test.mjs (2026-09-13)
//
// The bottom-center type/tribe plate on a card face. Owner request: Equipment
// (an artifact with an `equip` payload) must read "Artifact - Equipment" in that
// spot (MTG-style type line). plateLabelFor lives in the dependency-free
// plate-label.js so it can be unit-tested without a canvas / three.
//
// Also guards the other plate cases don't regress, and that EVERY real Equipment
// card in cards.json renders the new label.
import fs from 'fs';
import { plateLabelFor } from '../../plate-label.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// ---- the ask: Equipment reads "Artifact - Equipment" ----
ok('an Equipment artifact reads "Artifact - Equipment"', plateLabelFor({ type: 'artifact', equip: { cost: 0, keywords: ['rush'] } }) === 'Artifact - Equipment');
ok('equip label wins over a bare artifact type', plateLabelFor({ type: 'artifact', equip: { cost: 1 } }) === 'Artifact - Equipment');

// ---- other plate cases unchanged ----
ok('a plain artifact (no equip/tribe) shows no plate', plateLabelFor({ type: 'artifact' }) === null);
ok('a passive treasure still says "Passive" (even if it somehow has equip)', plateLabelFor({ type: 'artifact', passive: true, equip: {} }) === 'Passive');
ok('a weapon says "Hero Weapon"', plateLabelFor({ type: 'weapon' }) === 'Hero Weapon');
ok('a location says "Location"', plateLabelFor({ type: 'location' }) === 'Location');
ok('a creature shows its tribe', plateLabelFor({ type: 'creature', tribe: 'Mech' }) === 'Mech');
ok('a school spell says "<School> Spell"', plateLabelFor({ type: 'sorcery', tribe: 'Frost' }) === 'Frost Spell');
ok('a school-less spell names its type', plateLabelFor({ type: 'instant' }) === 'Instant');
ok('a school-less sorcery names its type', plateLabelFor({ type: 'sorcery' }) === 'Sorcery');
ok('null card -> no plate', plateLabelFor(null) === null);

// ---- every real Equipment card in the dex gets the label ----
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const equipment = raw.cards.filter(c => c.equip);
ok('there are Equipment cards to check', equipment.length > 0, equipment.length);
for (const c of equipment) {
	ok(`${c.id} reads "Artifact - Equipment"`, plateLabelFor(c) === 'Artifact - Equipment', plateLabelFor(c));
}
// the two just-converted ones are covered by the loop, but assert explicitly
ok('Lightning Greaves reads the Equipment line', plateLabelFor(raw.cards.find(c => c.id === 'wastes_lightning_greaves')) === 'Artifact - Equipment');
ok('Swiftfoot Boots reads the Equipment line', plateLabelFor(raw.cards.find(c => c.id === 'wastes_swiftfoot_boots')) === 'Artifact - Equipment');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
