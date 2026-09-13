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
// a spell with a school shows a "<Type> - <School>" type line
ok('a Frost sorcery reads "Sorcery - Frost"', plateLabelFor({ type: 'sorcery', tribe: 'Frost' }) === 'Sorcery - Frost');
ok('a Frost instant reads "Instant - Frost"', plateLabelFor({ type: 'instant', tribe: 'Frost' }) === 'Instant - Frost');
ok('a Fire sorcery reads "Sorcery - Fire"', plateLabelFor({ type: 'sorcery', tribe: 'Fire' }) === 'Sorcery - Fire');
ok('a school secret reads "Secret - Shadow"', plateLabelFor({ type: 'secret', tribe: 'Shadow' }) === 'Secret - Shadow');
ok('a school-less instant names its type', plateLabelFor({ type: 'instant' }) === 'Instant');
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

// ---- every real school spell reads "<Type> - <School>" ----
const SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];
const SPELL = new Set(['sorcery', 'instant', 'secret', 'trap']);
const schoolSpells = raw.cards.filter(c => SPELL.has(c.type) && SCHOOLS.includes(c.tribe));
ok('there are school spells to check', schoolSpells.length > 0, schoolSpells.length);
let badSpell = null;
for (const c of schoolSpells) {
	const want = `${c.type.charAt(0).toUpperCase() + c.type.slice(1)} - ${c.tribe}`;
	if (plateLabelFor(c) !== want) { badSpell = { id: c.id, got: plateLabelFor(c), want }; break; }
}
ok('every school spell reads "<Type> - <School>"', badSpell === null, badSpell);
// no school spell shows the old "<School> Spell" form anymore
ok('no school spell still reads "<School> Spell"', !schoolSpells.some(c => / Spell$/.test(plateLabelFor(c) || '')));
// spot-check a real Frost sorcery and a real Fire spell
ok('Fireball reads "Instant - Fire"', plateLabelFor(raw.cards.find(c => c.id === 'fireball')) === 'Instant - Fire');
ok('Flamestrike reads "Sorcery - Fire"', plateLabelFor(raw.cards.find(c => c.id === 'flamestrike')) === 'Sorcery - Fire');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
