// mega.js — the rules of MEGA EVOLUTION and PRIMAL REVERSION, shared by the
// battle engine (battle.js), the bag (bag.js) and the overworld (ow_mega.js).
//
// A Mega is a BATTLE FORM, never a species (mega_data.js, generated from Showdown):
// it changes a mon's stats, types, ability and sprite for the rest of one battle and
// reverts when the battle ends. It is never written to the party save (party.js
// saveParty writes the base form), never in the Pokedex or the species-coverage
// count, and the RIFT PRISM's form cycle never offers one (ow_scaling.js formsOf).
//
// Deliberately imports nothing from the game: bag.js builds its ITEMS from this
// module, so an import back into bag.js would be a cycle.
import { MEGA_FORMS, MEGA_STONES, PRIMAL_ORBS } from './mega_data.js';

export { MEGA_FORMS, MEGA_STONES, PRIMAL_ORBS };

// WAVE 1 = X/Y + ORAS + the Primals (art: overworld/mega_sprites); WAVE 2 = the 49
// Legends Z-A / Mega Dimension Megas (art: overworld/data/pokemon, PR #960). The one
// switch: false takes every wave-2 stone out of the bag and the marts, stops trainers
// arming one, and no battle path can reach a wave-2 form.
export const MEGA_WAVE2_ENABLED = true;
export const megaEnabled = id => {
	const f = MEGA_FORMS[id];
	return !!f && (f.wave === 1 || MEGA_WAVE2_ENABLED);
};
export const stoneEnabled = id => {
	const s = MEGA_STONES[id];
	return !!s && (s.wave === 1 || MEGA_WAVE2_ENABLED);
};
export const ENABLED_STONES = Object.keys(MEGA_STONES).filter(stoneEnabled);

export const KEY_STONE = 'keystone';
export const isMegaId = id => !!MEGA_FORMS[id];

// the Mega a mon could become right now from what it holds/knows, or null.
// (No Key Stone / once-per-battle check here — battle.js owns those.)
export function megaFormFor(mon) {
	if (!mon || mon.megaForm) return null;
	const st = MEGA_STONES[mon.heldItem];
	if (st && stoneEnabled(mon.heldItem)) {
		const id = st.forms[mon.speciesId];
		if (id && megaEnabled(id)) return id;
	}
	// MEGA RAYQUAZA needs no stone: it Mega Evolves knowing DRAGON ASCENT
	for (const [id, f] of Object.entries(MEGA_FORMS)) {
		if (f.move && f.base === mon.speciesId && megaEnabled(id)
			&& (mon.moves || []).some(m => m && m.id === f.move)) return id;
	}
	return null;
}
// Kyogre holding the BLUE ORB / Groudon holding the RED ORB, or null
export function primalFormFor(mon) {
	if (!mon || mon.megaForm) return null;
	const o = PRIMAL_ORBS[mon.heldItem];
	return o && o.species === mon.speciesId && megaEnabled(o.form) ? o.form : null;
}

// a Mega Stone held by a POKeMON it belongs to, or its own ORB, cannot be knocked
// off, stolen, swapped or melted (as in the games)
export function itemLocked(mon) {
	if (!mon?.heldItem) return false;
	return !!MEGA_STONES[mon.heldItem]?.forms[mon.speciesId] || PRIMAL_ORBS[mon.heldItem]?.species === mon.speciesId;
}

// names for the abilities only Megas and Primals have (species_abilities.json has
// no entry for them)
export const MEGA_ABILITY_NAMES = Object.fromEntries(Object.values(MEGA_FORMS).map(f => [f.ability, f.abilityName]));

// ---------- AI trainers who Mega Evolve their ace ----------
// Chosen from canon where the games give one (ORAS's Elite Four and Steven, the
// leaders whose ace has a Mega in X/Y/ORAS or Masters), otherwise the trainer's own
// ace that HAS a wave-1 Mega. `name` is matched against the battle's displayName
// (its last word); `cls` against the class part when the name is player-given (the
// FireRed champion is your rival). The first listed species the party holds is the
// one that gets the stone.
export const TRAINER_MEGAS = [
	// Hoenn
	{ name: 'WATTSON', species: ['manectric'] },
	{ name: 'WINONA', species: ['altaria'] },
	{ name: 'SIDNEY', species: ['absol'] },
	{ name: 'PHOEBE', species: ['banette'] },
	{ name: 'GLACIA', species: ['glalie'] },
	{ name: 'DRAKE', species: ['salamence'] },
	{ name: 'WALLACE', cls: /CHAMPION/i, species: ['gyarados'] },
	{ name: 'STEVEN', species: ['metagross'] },          // the Space Center partner, Meteor Falls
	// Kanto (FireRed)
	{ name: 'SABRINA', species: ['alakazam'] },
	{ name: 'LORELEI', species: ['slowbro', 'glalie'] },
	{ name: 'AGATHA', species: ['gengar'] },
	{ name: 'LANCE', species: ['charizard', 'dragonite', 'aerodactyl', 'gyarados'] }, // Crystal's champion: Charizard X; FireRed's E4: Dragonite (wave 2)
	{ name: 'RED', species: ['charizard'] },
	{ cls: /^CHAMPION\b/i, species: ['venusaur', 'charizard', 'blastoise'] }, // the FireRed rival: his starter
	// Johto / JohKanto
	{ name: 'MISTY', species: ['starmie'] },               // wave 2 (Legends Z-A)
	{ name: 'ERIKA', species: ['victreebel'] },            // wave 2
	{ name: 'MORTY', species: ['gengar'] },
	{ name: 'JASMINE', species: ['steelix'] },
	{ name: 'KAREN', species: ['houndoom'] },
	{ name: 'BRUNO', species: ['heracross'] },            // the Silver Cave rematch team
	{ name: 'BLUE', species: ['pidgeot'] },
	{ name: 'BROCK', species: ['steelix'] },
];
const lastWord = s => String(s || '').replace(/\(rematch\)/i, '').trim().split(/\s+/).pop().toUpperCase();
// the ace to arm for a trainer named `displayName`, or null
export function trainerMegaPick(displayName, party) {
	const nm = lastWord(displayName);
	for (const r of TRAINER_MEGAS) {
		if (r.name && r.name !== nm) continue;
		if (r.cls && !r.cls.test(String(displayName || ''))) continue;
		for (const sp of r.species) {
			const mon = [...(party || [])].reverse().find(m => m && m.speciesId === sp);
			if (!mon) continue;
			const stone = Object.keys(MEGA_STONES).find(k => stoneEnabled(k) && MEGA_STONES[k].forms[sp]
				&& megaEnabled(MEGA_STONES[k].forms[sp]) && (sp !== 'charizard' || k === (r.name === 'RED' ? 'charizarditey' : 'charizarditex')));
			if (stone) return { mon, stone };
		}
		if (r.name) return null;   // the named trainer, without a Mega-capable ace
	}
	return null;
}
// hand the ace its stone; returns the armed mon or null
export function armTrainerMega(displayName, party) {
	const pick = trainerMegaPick(displayName, party);
	if (!pick) return null;
	pick.mon.heldItem = pick.stone;
	return pick.mon;
}

// ---------- the Mega marts: the League counters, once you are that region's champion ----------
export const MEGA_MART_MAPS = {
	MAP_INDIGO_PLATEAU_POKEMON_CENTER_1F: 'KANTO',     // FireRed's League clerk
	MAP_INDIGO_PLATEAU_POKECENTER_1F: 'JOHTO',         // Crystal's League clerk
	MAP_EVER_GRANDE_CITY_POKEMON_LEAGUE_1F: 'HOENN',   // Emerald's League clerk
};
export const MEGA_STONE_PRICE = 10000;
