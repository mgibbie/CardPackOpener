// Every Duels creature carries its Hearthstone tribe. Bryan (2026-09-28):
// "Brewster, the Brutal is not a beast and it should be". A sweep against
// tools/data/hs_cards_full.json found 32 more Duels creatures missing a tribe
// (or half of a dual one: Gluth and Crimson are Undead AND Beast).
//
//   node battlecards/tests/regression/duels_tribes_test.mjs
import fs from 'fs';
const bc = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url))).cards;
const byId = Object.fromEntries(bc.map(c => [c.id, c]));
const WANT = {
	duels_brewster_the_brutal: 'Beast', duels_frostwolf_cub: 'Beast', duels_moonbeast: 'Beast', duels_bonecrusher: 'Beast', duels_deathstrider: 'Beast',
	duels_tuskarr_raider: 'Pirate', duels_seabreaker_goliath: 'Pirate', duels_deck_swabbie: 'Pirate',
	duels_impish_aid: 'Demon', duels_moarg_outcast: 'Demon', duels_demonizer: 'Demon',
	duels_drocomurchanicas: 'Dragon', duels_herald_scaled_ones: 'Dragon',
	duels_nerubian_peddler: 'Undead', duels_tiny_thimble: 'Undead', duels_regular_size_thimble: 'Undead', duels_joras_thuldoom: 'Undead',
	duels_gluth: 'Undead Beast', duels_gluth_sicle: 'Undead Beast', duels_crimson: 'Undead Beast',
	duels_scrapmetal_demolitionist: 'Mech',
};
let pass = 0, fail = 0; const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
for (const [id, t] of Object.entries(WANT)) {
	ok(`${id} is ${t}`, byId[id]?.tribe === t, byId[id]?.tribe);
	// the three signature-tier copies (_s1.._s3) match their base card
	for (const s of ['_s1', '_s2', '_s3']) if (byId[id + s]) ok(`${id + s} is ${t}`, byId[id + s].tribe === t, byId[id + s].tribe);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
