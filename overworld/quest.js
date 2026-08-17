// quest.js — the linear main-quest spine: a per-region, gym-by-gym objective + a
// strict-corridor area gate. Stage is DERIVED from the badge count + the intro/
// champion state (badges.js / Story), so it can never desync — no new storage.
//
// Future: regions will link by portals and gym leaders will give badge-thirds
// (beat gym 1 in all three regions before gym 2). The region-parallel 8-gym shape
// here is built to accept that layer later.
import * as Badges from './badges.js';
import * as Story from './events.js';

// Ordered gyms per region (badge order — NOT map order): drives the objective
// text AND the gym-door gate (gym k requires k prior badges to enter, so you
// can't beat gyms out of order even where the town is reachable early).
export const START = { KANTO: 'PalletTown', JOHTO: 'NewBarkTown', HOENN: 'LittlerootTown' };
export const GYMS = {
	KANTO: [
		{ leader: 'BROCK', town: 'PEWTER CITY', townMap: 'PewterCity', map: 'PewterCity_Gym' },
		{ leader: 'MISTY', town: 'CERULEAN CITY', townMap: 'CeruleanCity', map: 'CeruleanCity_Gym' },
		{ leader: 'LT. SURGE', town: 'VERMILION CITY', townMap: 'VermilionCity', map: 'VermilionCity_Gym' },
		{ leader: 'ERIKA', town: 'CELADON CITY', townMap: 'CeladonCity', map: 'CeladonCity_Gym' },
		{ leader: 'KOGA', town: 'FUCHSIA CITY', townMap: 'FuchsiaCity', map: 'FuchsiaCity_Gym' },
		{ leader: 'SABRINA', town: 'SAFFRON CITY', townMap: 'SaffronCity', map: 'SaffronCity_Gym' },
		{ leader: 'BLAINE', town: 'CINNABAR ISLAND', townMap: 'CinnabarIsland', map: 'CinnabarIsland_Gym' },
		{ leader: 'GIOVANNI', town: 'VIRIDIAN CITY', townMap: 'ViridianCity', map: 'ViridianCity_Gym' },
	],
	JOHTO: [
		{ leader: 'FALKNER', town: 'VIOLET CITY', townMap: 'VioletCity', map: 'VioletGym' },
		{ leader: 'BUGSY', town: 'AZALEA TOWN', townMap: 'AzaleaTown', map: 'AzaleaGym' },
		{ leader: 'WHITNEY', town: 'GOLDENROD CITY', townMap: 'GoldenrodCity', map: 'GoldenrodGym' },
		{ leader: 'MORTY', town: 'ECRUTEAK CITY', townMap: 'EcruteakCity', map: 'EcruteakGym' },
		{ leader: 'CHUCK', town: 'CIANWOOD CITY', townMap: 'CianwoodCity', map: 'CianwoodGym' },
		{ leader: 'JASMINE', town: 'OLIVINE CITY', townMap: 'OlivineCity', map: 'OlivineGym' },
		{ leader: 'PRYCE', town: 'MAHOGANY TOWN', townMap: 'MahoganyTown', map: 'MahoganyGym' },
		{ leader: 'CLAIR', town: 'BLACKTHORN CITY', townMap: 'BlackthornCity', map: 'BlackthornGym1F' },
	],
	HOENN: [
		{ leader: 'ROXANNE', town: 'RUSTBORO CITY', townMap: 'RustboroCity', map: 'RustboroCity_Gym' },
		{ leader: 'BRAWLY', town: 'DEWFORD TOWN', townMap: 'DewfordTown', map: 'DewfordTown_Gym' },
		{ leader: 'WATTSON', town: 'MAUVILLE CITY', townMap: 'MauvilleCity', map: 'MauvilleCity_Gym' },
		{ leader: 'FLANNERY', town: 'LAVARIDGE TOWN', townMap: 'LavaridgeTown', map: 'LavaridgeTown_Gym_1F' },
		{ leader: 'NORMAN', town: 'PETALBURG CITY', townMap: 'PetalburgCity', map: 'PetalburgCity_Gym' },
		{ leader: 'WINONA', town: 'FORTREE CITY', townMap: 'FortreeCity', map: 'FortreeCity_Gym' },
		{ leader: 'TATE & LIZA', town: 'MOSSDEEP CITY', townMap: 'MossdeepCity', map: 'MossdeepCity_Gym' },
		{ leader: 'WALLACE', town: 'SOOTOPOLIS CITY', townMap: 'SootopolisCity', map: 'SootopolisCity_Gym_1F' },
	],
};

// Strict-corridor gates: a MAP -> the badge count required to ENTER it. Blocking
// only ever applies to forward/deeper maps (backtracking toward the start is never
// gated), so a blocked player can always retreat — verified strand-free by the
// reachability test. Gym-door gates (gym k -> k) are generated from GYMS above and
// merged in `gateFor`; the entries here are the town/route corridor boundaries +
// the league approach. Early-pass gym towns (Viridian/Saffron, Hoenn Petalburg,
// Johto Olivine) are intentionally NOT town-gated — their gym-door gate keeps the
// badge order strict without walling an area you must cross early.
export const GATED_MAPS = {
	KANTO: {
		Route3: 1, CeruleanCity: 1, Route4: 1, Route24: 1, Route25: 1,
		VermilionCity: 2,
		CeladonCity: 3,
		FuchsiaCity: 4,
		CinnabarIsland: 6,
		// League approach (needs all 8)
		Route23: 8, KantoVictoryRoad_1F: 8, KantoVictoryRoad_2F: 8, KantoVictoryRoad_3F: 8,
		IndigoPlateau_Exterior: 8, IndigoPlateau: 8,
	},
	JOHTO: {
		AzaleaTown: 1,
		GoldenrodCity: 2,
		EcruteakCity: 3,
		CianwoodCity: 4,
		MahoganyTown: 6,
		BlackthornCity: 7,
		// League approach (Johto routes through Kanto's edge to the plateau)
		VictoryRoad: 8, IndigoPlateauPokecenter1F: 8,
	},
	HOENN: {
		DewfordTown: 1,
		MauvilleCity: 2,
		LavaridgeTown: 3,
		FortreeCity: 5,
		MossdeepCity: 6,
		SootopolisCity: 7,
		// League approach (needs all 8)
		EverGrandeCity: 8, VictoryRoad_1F: 8, EverGrandeCity_PokemonLeague_1F: 8,
	},
};

export function regionKey(r) { return Badges.regionKey(r); }

export const INTRO = -1, LEAGUE = 8, DONE = 9;

// current stage: INTRO (no starter yet) -> 0..7 (working toward gym stage+1) ->
// LEAGUE (all 8 badges, go to the E4) -> DONE (champion).
export function stage(region) {
	const rk = regionKey(region);
	if (!Story.getFlag('intro_done')) return INTRO;
	if (Badges.isChampion(rk)) return DONE;
	const n = Badges.count(rk);
	return n >= 8 ? LEAGUE : n;
}

// the player-facing "NEXT:" objective for the current stage
export function objective(region) {
	const rk = regionKey(region);
	const s = stage(rk);
	if (s === INTRO) return 'Get your first POKeMON from the LAB.';
	if (s === DONE) return `You are the CHAMPION of ${rk}! The region is yours to explore.`;
	if (s === LEAGUE) return 'All 8 badges earned! Enter VICTORY ROAD and challenge the POKeMON LEAGUE.';
	const g = GYMS[rk][s];
	return `Head to ${g.town} and defeat ${g.leader} for your ${ordinal(s + 1)} badge.`;
}

function ordinal(n) { return { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th' }[n] || n + 'th'; }

// a compact objective for tight surfaces (the Trainer Card)
export function shortObjective(region) {
	const rk = regionKey(region);
	const s = stage(rk);
	if (s === INTRO) return 'Get a starter';
	if (s === DONE) return 'CHAMPION!';
	if (s === LEAGUE) return 'POKeMON LEAGUE';
	return GYMS[rk][s].town;
}

// ordered quest-log rows for the QUEST menu (done / current / locked)
export function log(region) {
	const rk = regionKey(region);
	const n = Badges.count(rk);
	const champ = Badges.isChampion(rk);
	const rows = GYMS[rk].map((g, i) => ({
		label: `${g.leader} — ${g.town}`,
		state: i < n ? 'done' : (i === n && !champ ? 'current' : 'locked'),
	}));
	rows.push({ label: 'POKeMON LEAGUE', state: champ ? 'done' : (n >= 8 ? 'current' : 'locked') });
	rows.push({ label: 'CHAMPION', state: champ ? 'done' : 'locked' });
	return rows;
}

// the badge count required to ENTER destMap (gym-door OR corridor), else 0
export function gateFor(region, destMap) {
	const rk = regionKey(region);
	if (!destMap) return 0;
	const gymIdx = GYMS[rk].findIndex(g => g.map === destMap);
	if (gymIdx >= 0) return gymIdx; // gym k needs k prior badges
	return GATED_MAPS[rk]?.[destMap] ?? 0;
}

// if entering destMap is locked at the current badge count, return {need, msg};
// else null. `fromMap` (where you're coming from) makes this strand-proof: you
// may always RETREAT or move laterally — a move is only blocked when it advances
// into an area DEEPER than where you already stand (and deeper than your badges).
// So a save left mid-region past its badges can still walk back to a gym.
export function blocked(region, destMap, fromMap) {
	const rk = regionKey(region);
	const need = gateFor(rk, destMap);
	if (need <= 0) return null;
	if (Badges.count(rk) >= need) return null;      // you've earned entry
	if (need <= gateFor(rk, fromMap)) return null;  // retreat / lateral — never blocked
	const badge = Badges.list(rk)[need - 1];
	const bn = badge ? badge.name : 'next badge';
	return { need, msg: `The way ahead is sealed.\nYou need the ${bn} to proceed.` };
}
