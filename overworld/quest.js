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
		CinnabarIsland: 5, // reached by SURF (usable at 5 badges); BLAINE's gym stays gym-door-gated at 6
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
		MossdeepCity: 5, // reached by SURF (usable at 5 badges); TATE&LIZA's gym stays gym-door-gated at 6
		SootopolisCity: 7,
		// League approach (needs all 8)
		EverGrandeCity: 5, // reached by SURF; the League/Victory Road DOORS inside stay gated at 8 + the climax
		VictoryRoad_1F: 8, EverGrandeCity_PokemonLeague_1F: 8,
	},
};

// ---------- villain arcs (evil-team beats woven into the quest) ----------
// Each beat is a code-triggered boss confrontation (the decomp villain NPCs are
// all flag-skipped by npcs.js/trainers.js, so nothing spawns from the data — this
// layer supplies its own boss team + flag). A beat with a `gate` is REQUIRED: the
// gated gym/League map stays sealed until the beat's doneFlag is set. Beats without
// a gate are optional flavor, discoverable by visiting the location. Boss teams are
// inline (Kanto/Hoenn mirror data/trainer_teams.json; Johto's are authored here
// since the Crystal villain constants ship no teams). `at` = the entrance map the
// confrontation fires on (reliably reachable at `afterBadges`, so strand-safe).
export const VILLAIN_BEATS = {
	KANTO: [
		{
			id: 'rocket_hideout', afterBadges: 3, at: 'RocketHideout_B4F',
			maps: ['RocketHideout_B1F', 'RocketHideout_B2F', 'RocketHideout_B3F'], boss: 'GIOVANNI',
			team: [{ s: 'onix', l: 25 }, { s: 'rhyhorn', l: 24 }, { s: 'kangaskhan', l: 29 }],
			doneFlag: 'villain_kanto_hideout',
			objective: 'TEAM ROCKET has taken over the CELADON GAME CORNER — storm their HIDEOUT.',
			intro: ['GIOVANNI: So a nosy kid found our hideout.', "GIOVANNI: I am the boss of TEAM ROCKET. Interfere and you'll regret it!"],
			outro: ['GIOVANNI: ...Impressive. But TEAM ROCKET will rise again!', '(TEAM ROCKET flees the CELADON hideout.)'],
		},
		{
			id: 'silph', afterBadges: 5, at: 'SilphCo_11F', boss: 'GIOVANNI', gate: 'SaffronCity_Gym',
			maps: ['SilphCo_2F', 'SilphCo_3F', 'SilphCo_4F', 'SilphCo_5F', 'SilphCo_6F', 'SilphCo_7F', 'SilphCo_8F', 'SilphCo_9F', 'SilphCo_10F'],
			team: [{ s: 'nidorino', l: 37 }, { s: 'kangaskhan', l: 35 }, { s: 'rhyhorn', l: 37 }, { s: 'nidoqueen', l: 41 }],
			doneFlag: 'villain_kanto_silph',
			objective: 'TEAM ROCKET has seized SILPH CO. in SAFFRON — drive them out.',
			intro: ['GIOVANNI: You again! TEAM ROCKET now controls SILPH CO.', 'GIOVANNI: This is your last warning. Leave — or be crushed!'],
			outro: ['GIOVANNI: ...Beaten again. TEAM ROCKET, retreat!', "(SAFFRON is free — SABRINA's GYM has reopened.)"],
		},
	],
	JOHTO: [
		{
			id: 'slowpoke', afterBadges: 1, at: 'SlowpokeWellB2F', maps: ['SlowpokeWellB1F'], boss: 'PROTON', gate: 'AzaleaGym',
			team: [{ s: 'zubat', l: 14 }, { s: 'rattata', l: 14 }, { s: 'koffing', l: 16 }],
			doneFlag: 'villain_johto_slowpoke',
			objective: 'TEAM ROCKET is cutting SLOWPOKE tails in the SLOWPOKE WELL by AZALEA — stop them.',
			intro: ["PROTON: I'm PROTON, an executive of TEAM ROCKET.", 'PROTON: These SLOWPOKE tails sell for a fortune. Out of my way, brat!'],
			outro: ["PROTON: Tch... you'll pay for this.", "(TEAM ROCKET flees — AZALEA's GYM is clear.)"],
		},
		{
			id: 'rocket_hq', afterBadges: 6, at: 'TeamRocketBaseB3F',
			maps: ['TeamRocketBaseB1F', 'TeamRocketBaseB2F'], boss: 'ARIANA', gate: 'MahoganyGym',
			team: [{ s: 'gloom', l: 32 }, { s: 'murkrow', l: 32 }, { s: 'arbok', l: 34 }, { s: 'vileplume', l: 36 }],
			doneFlag: 'villain_johto_hq',
			objective: "TEAM ROCKET's secret base hides beneath MAHOGANY TOWN — shut it down.",
			intro: ['ARIANA: How did a kid get into our secret HQ?!', "ARIANA: I'm ARIANA of TEAM ROCKET. You won't leave here!"],
			outro: ['ARIANA: Impossible... TEAM ROCKET, fall back!', "(The MAHOGANY hideout is shut down — PRYCE's GYM has opened.)"],
		},
	],
	HOENN: [
		{
			id: 'aqua_hideout', afterBadges: 5, at: 'AquaHideout_B2F',
			maps: ['AquaHideout_1F', 'AquaHideout_B1F'], boss: 'MATT',
			team: [{ s: 'mightyena', l: 34 }, { s: 'golbat', l: 34 }, { s: 'carvanha', l: 32 }],
			doneFlag: 'villain_hoenn_hideout',
			objective: 'TEAM AQUA is scheming in their LILYCOVE HIDEOUT — foil their plan.',
			intro: ['MATT: Hehe, you followed us into the AQUA HIDEOUT?', "MATT: I'm MATT! Nobody wrecks TEAM AQUA's plans!"],
			outro: ["MATT: Argh, so strong... this isn't over!", '(TEAM AQUA scatters from the hideout.)'],
		},
		{
			id: 'seafloor', afterBadges: 7, at: 'SeafloorCavern_Room9', boss: 'ARCHIE',
			// grunts + Shelly populate the cavern; the Strength/Rock-Smash boulder maze
			// to Room9 is the faithful (solvable) vanilla layout and resets on every room
			// re-entry (items.js rebuilds field objects per visit), so it can never
			// permanently strand — and the player has Strength/Rock Smash by 7 badges.
			maps: ['SeafloorCavern_Entrance', 'SeafloorCavern_Room1', 'SeafloorCavern_Room2', 'SeafloorCavern_Room3', 'SeafloorCavern_Room4', 'SeafloorCavern_Room5', 'SeafloorCavern_Room6', 'SeafloorCavern_Room7', 'SeafloorCavern_Room8'],
			gate: ['EverGrandeCity', 'VictoryRoad_1F', 'EverGrandeCity_PokemonLeague_1F'],
			team: [{ s: 'mightyena', l: 41 }, { s: 'crobat', l: 41 }, { s: 'sharpedo', l: 43 }],
			doneFlag: 'villain_hoenn_climax',
			objective: 'TEAM AQUA is awakening a legend in the SEAFLOOR CAVERN — stop ARCHIE before the LEAGUE.',
			intro: ["ARCHIE: You're too late! I'll awaken the sea's guardian!", 'ARCHIE: I am ARCHIE, leader of TEAM AQUA. Stand aside!'],
			outro: ['ARCHIE: What have I... the sea rages beyond control. I must go!', '(TEAM AQUA flees — the path to the POKeMON LEAGUE is open.)'],
		},
	],
};

// the beat located at `map` that is active (badges reached) and not yet done —
// what checkVillainTrigger fires on entry
export function beatAt(region, map) {
	const rk = regionKey(region);
	if (!Story.getFlag('intro_done')) return null;
	const n = Badges.count(rk);
	for (const b of VILLAIN_BEATS[rk] || []) {
		if (b.at === map && n >= b.afterBadges && !Story.getFlag(b.doneFlag)) return b;
	}
	return null;
}
// true when `map` is a grunt-spawn floor of an active, undone beat — the hook that
// un-hides the villain grunts for the crawl (main.js sets trainers.spawnFlagged to it)
export function isDungeonFloor(region, map) {
	const rk = regionKey(region);
	if (!Story.getFlag('intro_done')) return false;
	const n = Badges.count(rk);
	for (const b of VILLAIN_BEATS[rk] || []) {
		if (!b.maps) continue;
		if (n >= b.afterBadges && !Story.getFlag(b.doneFlag) && b.maps.includes(map)) return true;
	}
	return false;
}
// the (required) beat that gates `destMap` and is not yet done, else null
function gateBeat(region, destMap) {
	const rk = regionKey(region);
	for (const b of VILLAIN_BEATS[rk] || []) {
		if (!b.gate) continue;
		const gates = Array.isArray(b.gate) ? b.gate : [b.gate];
		if (gates.includes(destMap) && !Story.getFlag(b.doneFlag)) return b;
	}
	return null;
}

// Badges.regionKey ACCEPTS 'JOHKANTO' (and would accept a future HOENN2), but
// this file's GYMS / VILLAIN_BEATS tables only cover the three spine regions —
// so objective() and log() would throw on GYMS[rk] for anything else. Nothing
// sets magepunk_region to JOHKANTO today, which is exactly why this sat here
// unnoticed: it is a crash waiting for whoever wires that region up. Fall back
// to KANTO's spine, which is the one JohKanto's gyms mirror.
export function regionKey(r) {
	const k = Badges.regionKey(r);
	return GYMS[k] ? k : 'KANTO';
}
// the region as the SPINE knows it, vs the raw region for badge counting
export function hasSpine(r) { return !!GYMS[Badges.regionKey(r)]; }

// ---------- cross-region badge-thirds ----------
// The three shared regions advance in lockstep: each gym gives a "third" of that
// tier's badge, so you may enter gym N+1's zone in ANY region only once gym N is
// cleared in ALL THREE. `globalTier` is that shared floor = min gyms cleared across
// the three. It is monotonic non-decreasing and a region can lead it by at most 1
// (clearing gym k+1 already required globalTier >= k), which makes the gate below
// both strand-safe and order-preserving. JohKanto (the Gen-2 Kanto 16-badge path) is
// deliberately EXCLUDED — it is not one of the shared regions.
export const SHARED = ['KANTO', 'JOHTO', 'HOENN'];
export function globalTier() { return Math.min(...SHARED.map(r => Badges.count(r))); }
// the shared regions still short of the current tier (they hold the world back)
export function laggingRegions() { const g = globalTier(); return SHARED.filter(r => Badges.count(r) === g); }

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

// map used to detect a villain beat gating the League approach, per region
const LEAGUE_MAP = { KANTO: 'IndigoPlateau', JOHTO: 'VictoryRoad', HOENN: 'EverGrandeCity' };

// post-game "NEXT:" line once you're CHAMPION — points at each region's real post-game
const DONE_OBJECTIVE = {
	KANTO: 'CHAMPION of KANTO! MEWTWO now stirs deep in CERULEAN CAVE — and the legendary birds await.',
	JOHTO: 'CHAMPION of JOHTO! A silent trainer is said to wait at the summit of MT SILVER...',
	HOENN: 'CHAMPION of HOENN! The three REGI slumber in their sealed chambers — seek them out.',
};

// cross-region "waiting" objective: if this region has cleared more gyms than the
// shared tier, it's a gym ahead and can't advance until the LAGGING regions catch up.
// Returns the where-to-go line (naming the same-tier gym in each lagging region + the
// portal), or null when the region is at the floor and should just beat its next gym.
function crossRegionWait(rk) {
	const g = globalTier();
	if (Badges.count(rk) <= g) return null;             // at the floor — advance normally
	const laggers = laggingRegions().filter(r => r !== rk);
	const where = laggers.map(r => `${GYMS[r][g].leader} in ${GYMS[r][g].town}`);
	const lead = where.length ? where.join(' and ') : 'the other regions';
	return `${rk} is ahead! Beat GYM ${g + 1} in the other regions — ${lead} — to advance. Take the PORTAL by the POKeMON CENTER.`;
}

// the player-facing "NEXT:" objective for the current stage. A required villain
// beat gating the immediate next gym (or the League) takes precedence over the gym.
export function objective(region) {
	const rk = regionKey(region);
	const s = stage(rk);
	if (s === INTRO) return 'Get your first POKeMON from the LAB.';
	if (s === DONE) return DONE_OBJECTIVE[rk] || `CHAMPION of ${rk}! Legendary POKeMON now stir.`;
	const wait = crossRegionWait(rk);                   // ahead of the shared tier?
	if (wait) return wait;
	if (s === LEAGUE) {
		const lb = gateBeat(rk, LEAGUE_MAP[rk]);
		if (lb) return lb.objective;
		return 'All 8 badges earned! Enter VICTORY ROAD and challenge the POKeMON LEAGUE.';
	}
	const g = GYMS[rk][s];
	const gb = gateBeat(rk, g.map);
	if (gb) return gb.objective;
	return `Head to ${g.town} and defeat ${g.leader} for your ${ordinal(s + 1)} badge.`;
}

function ordinal(n) { return { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th', 7: '7th', 8: '8th' }[n] || n + 'th'; }

// a compact objective for tight surfaces (the Trainer Card)
export function shortObjective(region) {
	const rk = regionKey(region);
	const s = stage(rk);
	if (s === INTRO) return 'Get a starter';
	if (s === DONE) return 'CHAMPION!';
	if (Badges.count(rk) > globalTier()) return `Portal: GYM ${globalTier() + 1} abroad`; // waiting on the other regions
	if (s === LEAGUE) { const lb = gateBeat(rk, LEAGUE_MAP[rk]); return lb ? `Stop ${lb.boss}` : 'POKeMON LEAGUE'; }
	const gb = gateBeat(rk, GYMS[rk][s].map);
	return gb ? `Stop ${gb.boss}` : GYMS[rk][s].town;
}

// ordered quest-log rows for the QUEST menu (done / current / locked), with the
// villain beats interleaved at the point in the badge order where they happen
export function log(region) {
	const rk = regionKey(region);
	const n = Badges.count(rk);
	const champ = Badges.isChampion(rk);
	const team = rk === 'HOENN' ? 'TEAM AQUA' : 'TEAM ROCKET';
	const items = GYMS[rk].map((g, i) => ({
		key: i, label: `${g.leader} — ${g.town}`,
		state: i < n ? 'done' : (i === n && !champ ? 'current' : 'locked'),
	}));
	for (const b of VILLAIN_BEATS[rk] || []) {
		const done = Story.getFlag(b.doneFlag);
		items.push({
			key: b.afterBadges - 0.5, label: `${b.boss} — ${team}`,
			state: done ? 'done' : (n >= b.afterBadges ? 'current' : 'locked'),
		});
	}
	items.sort((a, c) => a.key - c.key);
	const rows = items.map(({ label, state }) => ({ label, state }));
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
	// villain flag-gate: a required beat seals this gym/League until its boss is
	// beaten (takes precedence over the badge gate — you may have the badges but the
	// evil team still bars the way). These gate terminal maps, so no retreat concern.
	const vb = gateBeat(rk, destMap);
	if (vb) return { villain: true, need: 0, msg: `The way is blocked!\n${vb.objective}` };
	const need = gateFor(rk, destMap);
	if (need <= 0) return null;
	// cross-region gate: entry is earned once the shared TIER (min gyms across the
	// three regions) reaches `need` — i.e. gym `need` is cleared in EVERY region. Uses
	// globalTier, not this region's own count, so a region that races ahead must wait
	// for the others to catch up. JohKanto maps aren't gated here (gateFor returns 0).
	if (globalTier() >= need) return null;          // the tier is unlocked everywhere
	if (need <= gateFor(rk, fromMap)) return null;  // retreat / lateral — never blocked
	// name the badge the LAGGING regions still owe (the player's own region may already
	// hold it), so the message points at what actually blocks progress
	const laggers = laggingRegions();
	const towns = laggers.map(r => GYMS[r][need - 1]?.town).filter(Boolean);
	const where = towns.length ? towns.join(' and ') : 'the other regions';
	return { need, msg: `The way ahead is sealed.\nClear GYM ${need} in ${where} first — every region must keep pace.` };
}
