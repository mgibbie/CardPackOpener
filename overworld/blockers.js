// blockers.js — authentic per-spot progression obstacles, placed programmatically
// per map id (the arcade.js / services.js pattern; map data is read-only so this
// must live in code). Each blocker is a solid sprite on a chokepoint — a guard who
// turns you back, a sleeping SNORLAX, a TEAM ROCKET grunt, SUDOWOODO — present only
// while its AUTHENTIC condition is unmet (a key item not yet held, a story flag
// unset, a badge not earned). Meeting the condition drops the blocker and the road
// opens. GIVERS are talk-to NPCs that hand a key item once (gated by a prereq).
//
// Terrain obstacles (cut trees / Rock Smash rocks / Strength boulders) are NOT here —
// they are seeded via items.js CODE_FIELD_OBJS so they reuse the existing HM clear
// pipeline. Quest.blocked stays as a silent strand-safety backstop behind all this.
import { getImage, META, drawOwMon } from './engine.js';
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as Story from './events.js';
import { globalTier } from './quest.js';

function region() { return Badges.regionKey(localStorage.getItem('magepunk_region')); }

// does a condition currently HOLD — i.e. should the obstacle be GONE?
function condMet(cond) {
	if (!cond) return false;
	if (cond.all) return cond.all.every(condMet);
	if (cond.any) return cond.any.some(condMet);
	// a tier guard drops only when gym `badge` is cleared in EVERY shared region
	// (globalTier), matching Quest.blocked — otherwise the sprite would vanish while
	// the quest gate still bounced you (the old invisible-wall bug).
	if (cond.badge != null) return globalTier() >= cond.badge;
	if (cond.item) return Bag.count(cond.item) > 0;
	if (cond.flag) return Story.getFlag(cond.flag);
	// HM field-move availability stays region-local (an ability, not a tier gate)
	if (cond.hm) return Badges.count(region()) >= Badges.hmReq(region(), cond.hm);
	return false;
}

// ---- the authentic gate graph (filled per region) ----
// BLOCKERS[MAP_id] = [{ id, sprite:{kind:'person'|'mon', img}, tx, ty,
//                       solid?:[[x,y]...] (defaults to the sprite tile), cond, msg }]
export const BLOCKERS = {
	// ---------------- KANTO ----------------
	// Pewter -> Route 3: a GYM GUIDE bars the east road until you beat BROCK
	MAP_ROUTE3: [{ id: 'k_route3', gates: 'Route3', cond: { badge: 1 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 0, ty: 11, solid: [[0, 9], [0, 10], [0, 11], [0, 12]],
		msg: 'GYM GUIDE: Whoa there! The road to ROUTE 3 is for trainers who’ve proven themselves.\nCome back with the BOULDER BADGE!' }],
	// the two sleeping SNORLAX (real objects) — need the POKe FLUTE to wake them
	MAP_ROUTE12: [{ id: 'k_snorlax12', gates: 'Route12', cond: { item: 'pokeflute' }, sprite: { kind: 'mon', img: 'snorlax' },
		tx: 14, ty: 70, solid: [[14, 70], [15, 70], [14, 71], [15, 71]],
		msg: 'A colossal SNORLAX sprawls across the road, snoring. It won’t budge without a very particular sound...' }],
	MAP_ROUTE16: [{ id: 'k_snorlax16', gates: 'Route16', cond: { item: 'pokeflute' }, sprite: { kind: 'mon', img: 'snorlax' },
		tx: 31, ty: 13, solid: [[31, 13]],
		msg: 'A SNORLAX blocks the way, fast asleep. Only the POKe FLUTE could rouse it.' }],
	// Saffron: TEAM ROCKET occupies the city — SABRINA’s gym is sealed until SILPH CO. is freed
	MAP_SAFFRON_CITY: [{ id: 'k_saffron', gates: 'SaffronCity_Gym', cond: { flag: 'villain_kanto_silph' }, sprite: { kind: 'person', img: 'rocket_m' },
		tx: 46, ty: 13, solid: [[46, 13]],
		msg: 'ROCKET GRUNT: TEAM ROCKET runs SAFFRON now! The GYM’s closed — boss’s orders. Beat it!' }],
	// Viridian gym stays shut until you’ve earned the VOLCANO BADGE (GIOVANNI’s challenge)
	MAP_VIRIDIAN_CITY: [{ id: 'k_viridian', gates: 'ViridianCity_Gym', cond: { badge: 7 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 36, ty: 11, solid: [[36, 11]],
		msg: 'GYM GUIDE: This GYM’s LEADER hasn’t shown in ages... They say only a 7-badge trainer can draw them out.' }],
	// Cinnabar gym guard (Blaine) — needs the VOLCANO-tier standing (6 badges)
	MAP_CINNABAR_ISLAND: [{ id: 'k_cinnabar', gates: 'CinnabarIsland_Gym', cond: { badge: 6 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 20, ty: 5, solid: [[20, 5]],
		msg: 'GYM GUIDE: BLAINE only battles trainers with 6 badges. Come back when you’re on fire!' }],
	// Route 22 -> the League gate: the guard checks all 8 badges
	MAP_ROUTE22: [{ id: 'k_league', gates: 'Route23', cond: { badge: 8 }, sprite: { kind: 'person', img: 'policeman' },
		tx: 8, ty: 6, solid: [[8, 6], [9, 6]],
		msg: 'OFFICER: Only trainers with all 8 KANTO badges may pass to the POKeMON LEAGUE. Show me your badges!' }],
	// Vermilion approach from the north (Route 6) — the CASCADE-tier road
	MAP_VERMILION_CITY: [{ id: 'k_vermilion', gates: 'VermilionCity', cond: { badge: 2 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 16, ty: 0, solid: [[12, 0], [13, 0], [14, 0], [15, 0], [16, 0], [17, 0], [18, 0], [19, 0], [20, 0], [22, 0], [23, 0], [24, 0]],
		msg: 'GYM GUIDE: VERMILION’s down south. The underground path opens for trainers with the CASCADE BADGE. Beat MISTY first!' }],
	// Celadon approach from Route 7 (east) — the THUNDER-tier road
	MAP_CELADON_CITY: [{ id: 'k_celadon', gates: 'CeladonCity', cond: { badge: 3 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 59, ty: 13, solid: [[59, 12], [59, 13], [59, 14], [59, 15]],
		msg: 'GYM GUIDE: The SAFFRON gates are backed up. Take the CELADON road once you’ve earned the THUNDER BADGE.' }],
	// Fuchsia approach from Route 18 (west, Cycling Road) — the RAINBOW-tier road
	MAP_FUCHSIA_CITY: [{ id: 'k_fuchsia', gates: 'FuchsiaCity', cond: { badge: 4 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 0, ty: 19, solid: [[0, 18], [0, 19], [0, 20]],
		msg: 'GYM GUIDE: FUCHSIA and its SAFARI ZONE are just past here — for trainers with the RAINBOW BADGE. Come back after ERIKA!' }],

	// ---------------- JOHTO ----------------
	// Azalea approach (from Route 33, the EAST edge) — gated by the ZEPHYR BADGE
	MAP_AZALEA_TOWN: [
		{ id: 'j_azalea', gates: 'AzaleaTown', cond: { badge: 1 }, sprite: { kind: 'person', img: 'gym_guy' },
			tx: 39, ty: 14, solid: [[39, 0], [39, 1], [39, 2], [39, 14], [39, 15]],
			msg: 'GYM GUIDE: AZALEA’s just ahead — but the SLOWPOKE trouble has folks on edge. Earn the ZEPHYR BADGE first, kid.' },
		// Team Rocket at the SLOWPOKE WELL seals BUGSY’s gym until PROTON is beaten
		{ id: 'j_azalea_gym', gates: 'AzaleaGym', cond: { flag: 'villain_johto_slowpoke' }, sprite: { kind: 'person', img: 'rocket_m' },
			tx: 10, ty: 16, solid: [[10, 16]],
			msg: 'ROCKET GRUNT: The GYM’s closed while we “harvest” SLOWPOKE tails. Beat it, brat!' },
	],
	// Route 36 SUDOWOODO blocks the road north to Ecruteak until you have the SQUIRTBOTTLE
	MAP_ROUTE_36: [{ id: 'j_sudowoodo', gates: 'EcruteakCity', cond: { item: 'squirtbottle' }, sprite: { kind: 'mon', img: 'sudowoodo' },
		tx: 35, ty: 9, solid: [[35, 9]],
		msg: 'A gnarled tree blocks the path... but something about it looks OFF. Maybe if it were watered?' }],
	// Mahogany approach (west, from Route 42) — the GLACIER-tier road
	MAP_MAHOGANY_TOWN: [
		{ id: 'j_mahogany', gates: 'MahoganyTown', cond: { badge: 6 }, sprite: { kind: 'person', img: 'gym_guy' },
			tx: 0, ty: 9, solid: [[0, 0], [0, 1], [0, 2], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [0, 11], [0, 12], [0, 13], [0, 14], [0, 15], [0, 16], [0, 17]],
			msg: 'GYM GUIDE: MAHOGANY’s a bit... tense right now. Come back once you’ve got 6 badges.' },
		// Rocket HQ under the town seals PRYCE’s gym until ARIANA is beaten
		{ id: 'j_mahogany_gym', gates: 'MahoganyGym', cond: { flag: 'villain_johto_hq' }, sprite: { kind: 'person', img: 'rocket_m' },
			tx: 6, ty: 14, solid: [[6, 14]],
			msg: 'ROCKET GRUNT: Nothing to see here! The GYM’s shut. Now scram!' },
	],
	// Blackthorn approach (west, from Route 44) — the RISING-tier road
	MAP_BLACKTHORN_CITY: [{ id: 'j_blackthorn', gates: 'BlackthornCity', cond: { badge: 7 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 0, ty: 26, solid: [[0, 18], [0, 19], [0, 20], [0, 21], [0, 22], [0, 23], [0, 24], [0, 25], [0, 26], [0, 27], [0, 28], [0, 29], [0, 30], [0, 31], [0, 32], [0, 33], [0, 34], [0, 35]],
		msg: 'GYM GUIDE: BLACKTHORN’s DRAGON GYM only opens to trainers with 7 badges. Not yet, rookie.' }],
	// Olivine gym: JASMINE is away tending AMPHAROS — the gym opens once you’ve 5 badges
	MAP_OLIVINE_CITY: [{ id: 'j_olivine', gates: 'OlivineGym', cond: { badge: 5 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 10, ty: 12, solid: [[10, 12]],
		msg: 'GYM GUIDE: JASMINE’s at the LIGHTHOUSE caring for a sick POKeMON. She won’t battle ’til you’ve 5 badges anyway.' }],
	// Route 26 -> the League gate: 8-badge check
	MAP_ROUTE_26: [{ id: 'j_league', gates: 'VictoryRoad', cond: { badge: 8 }, sprite: { kind: 'person', img: 'policeman' },
		tx: 7, ty: 6, solid: [[7, 6]],
		msg: 'OFFICER: The POKeMON LEAGUE lies ahead. No entry without all 8 JOHTO badges!' }],

	// ---------------- HOENN ----------------
	// Petalburg gym (your father NORMAN) won’t accept the challenge until you hold 4 badges
	MAP_PETALBURG_CITY: [{ id: 'h_petalburg', gates: 'PetalburgCity_Gym', cond: { badge: 4 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 15, ty: 9, solid: [[15, 9]],
		msg: 'GYM GUIDE: NORMAN said he won’t battle his own kid until you’ve earned 4 badges. Go prove yourself!' }],
	// Route 120 KECLEON (invisible) blocks the bridge until the DEVON SCOPE reveals it
	MAP_ROUTE120: [{ id: 'h_kecleon', gates: 'kecleon120', cond: { item: 'devonscope' }, sprite: { kind: 'mon', img: 'kecleon' },
		tx: 12, ty: 16, solid: [[12, 16]],
		msg: 'Something invisible is blocking the bridge! You bump into it, but can’t see a thing...' }],
	// Ever Grande City (reached by SURF): VICTORY ROAD and the LEAGUE doors are sealed
	// until you have 8 badges AND ARCHIE is stopped. Two Victory-Road entrances + the
	// League door each get a guard.
	MAP_EVER_GRANDE_CITY: [
		{ id: 'h_league', gates: 'EverGrandeCity_PokemonLeague_1F', cond: { all: [{ badge: 8 }, { flag: 'villain_hoenn_climax' }] }, sprite: { kind: 'person', img: 'policeman' },
			tx: 18, ty: 6, solid: [[18, 6]],
			msg: 'OFFICER: The POKeMON LEAGUE admits only 8-badge trainers — and not while the sea still rages. Settle things at the SEAFLOOR CAVERN first!' },
		{ id: 'h_victory_a', gates: 'VictoryRoad_1F', cond: { all: [{ badge: 8 }, { flag: 'villain_hoenn_climax' }] }, sprite: { kind: 'person', img: 'cooltrainer_m' },
			tx: 18, ty: 42, solid: [[18, 42]],
			msg: 'OFFICER: VICTORY ROAD is closed. Return with all 8 badges once the SEAFLOOR crisis is over.' },
		{ id: 'h_victory_b', gates: 'VictoryRoad_1Fb', cond: { all: [{ badge: 8 }, { flag: 'villain_hoenn_climax' }] }, sprite: { kind: 'person', img: 'cooltrainer_m' },
			tx: 18, ty: 28, solid: [[18, 28]],
			msg: 'OFFICER: VICTORY ROAD is closed. Return with all 8 badges once the SEAFLOOR crisis is over.' },
	],
	// Mauville approach from the south (Route 110 / Slateport) — the KNUCKLE-tier road
	MAP_MAUVILLE_CITY: [{ id: 'h_mauville', gates: 'MauvilleCity', cond: { badge: 2 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 15, ty: 19, solid: [[12, 19], [13, 19], [14, 19], [15, 19], [16, 19], [17, 19], [18, 19]],
		msg: 'GYM GUIDE: MAUVILLE’s just north. WATTSON only takes on trainers with the KNUCKLE BADGE — go see BRAWLY first!' }],
	// Lavaridge approach from the east (Route 112 / Jagged Pass) — the DYNAMO-tier road
	MAP_LAVARIDGE_TOWN: [{ id: 'h_lavaridge', gates: 'LavaridgeTown', cond: { badge: 3 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 19, ty: 10, solid: [[19, 7], [19, 8], [19, 9], [19, 10], [19, 11], [19, 12], [19, 13]],
		msg: 'GYM GUIDE: The way down to LAVARIDGE is rough. FLANNERY only battles trainers with the DYNAMO BADGE. Beat WATTSON first!' }],
	// Mossdeep gym (TATE & LIZA) — the MIND-tier challenge (town itself is reached by Surf)
	MAP_MOSSDEEP_CITY: [{ id: 'h_mossdeep', gates: 'MossdeepCity_Gym', cond: { badge: 6 }, sprite: { kind: 'person', img: 'gym_guy' },
		tx: 38, ty: 10, solid: [[38, 10]],
		msg: 'GYM GUIDE: TATE and LIZA battle as a pair — and only trainers with 6 badges may face them. Not yet!' }],
	// Route 104: MR. BRINEY won’t sail you to DEWFORD until you’ve earned the STONE BADGE
	MAP_ROUTE104: [{ id: 'h_dewford', gates: 'DewfordTown', cond: { badge: 1 }, sprite: { kind: 'person', img: 'sailor' },
		tx: 12, ty: 53, solid: [[12, 53], [13, 53], [15, 53]],
		msg: 'MR. BRINEY: Ahoy! I’ll not sail to DEWFORD ’til ye’ve proven yerself — come back with the STONE BADGE, sonny!' }],
};

// GIVERS[MAP_id] = [{ id, img, tx, ty, item, name, count?, prereq?, onceFlag,
//                     pre?, give, post? }]  — solid single-tile NPCs (placed on the
// canonical character’s tile) that grant a key item exactly once when talked to.
export const GIVERS = {
	// Kanto: MR. FUJI hands over the POKe FLUTE once TEAM ROCKET’s hideout is cleared
	MAP_LAVENDER_TOWN_VOLUNTEER_POKEMON_HOUSE: [{ id: 'g_flute', tx: 3, ty: 3, img: 'mr_fuji',
		item: 'pokeflute', name: 'POKe FLUTE', prereq: { flag: 'villain_kanto_hideout' }, onceFlag: 'gave_pokeflute',
		pre: 'MR. FUJI: The SNORLAX won’t stir for just anyone... First, deal with those TEAM ROCKET thugs.',
		give: 'MR. FUJI: For your kindness, take this POKe FLUTE. Its song wakes even the sleepiest POKeMON.',
		post: 'MR. FUJI: Play it well, traveler.' }],
	// Johto: the GOLDENROD florist gives the SQUIRTBOTTLE after WHITNEY (3 badges)
	MAP_GOLDENROD_FLOWER_SHOP: [{ id: 'g_squirt', tx: 2, ty: 4, img: 'lass',
		item: 'squirtbottle', name: 'SQUIRTBOTTLE', prereq: { badge: 3 }, onceFlag: 'gave_squirtbottle',
		pre: 'FLORIST: Come back once you’ve beaten WHITNEY — I’ll have something for those funny trees!',
		give: 'FLORIST: Here, take this SQUIRTBOTTLE. Try watering that odd “tree” on ROUTE 36!',
		post: 'FLORIST: Did that tree run off? Hee hee.' }],
	// Hoenn: STEVEN gives the DEVON SCOPE on Route 120 (once you can Surf there, 5 badges)
	MAP_ROUTE120: [{ id: 'g_scope', tx: 13, ty: 15, img: 'cooltrainer_m',
		item: 'devonscope', name: 'DEVON SCOPE', prereq: { badge: 5 }, onceFlag: 'gave_devonscope',
		pre: 'STEVEN: There’s something odd on this bridge... give me a moment to prepare a countermeasure.',
		give: 'STEVEN: This DEVON SCOPE reveals hidden POKeMON. That invisible wall ahead? Now you’ll see it.',
		post: 'STEVEN: Good luck out there.' }],
};

function tilesOf(b) { return b.solid || [[b.tx, b.ty]]; }

// people/mon PNGs the tables reference (preloaded in init)
function neededImages() {
	const people = new Set(), mons = new Set();
	for (const arr of Object.values(BLOCKERS)) for (const b of arr) {
		if (b.sprite?.kind === 'mon') mons.add(b.sprite.img);
		else if (b.sprite?.img) people.add(b.sprite.img);
	}
	for (const arr of Object.values(GIVERS)) for (const g of arr) if (g.img) people.add(g.img);
	return { people: [...people], mons: [...mons] };
}

export class Blockers {
	constructor(world) {
		this.world = world;
		this.list = [];    // active blockers on the current map (condition still unmet)
		this.givers = [];  // givers on the current map
		this.people = {};
		this.mons = {};
	}

	async init() {
		const { people, mons } = neededImages();
		await Promise.all(people.map(async n => { this.people[n] = await getImage(`data/people/${n}.png`).catch(() => null); }));
		await Promise.all(mons.map(async n => { this.mons[n] = await getImage(`data/pokemon_ow/${n}.png`).catch(() => null); }));
	}

	loadForMap() {
		const id = this.world.current.map.id;
		this.list = (BLOCKERS[id] || []).filter(b => !condMet(b.cond)); // present only while unmet
		this.givers = (GIVERS[id] || []).slice();
	}

	// solid if an active blocker (or a giver) covers the tile
	blocks(tx, ty) {
		return this.list.some(b => tilesOf(b).some(([x, y]) => x === tx && y === ty))
			|| this.givers.some(g => g.tx === tx && g.ty === ty);
	}

	// the blocker occupying a tile (for the face+A / bump message)
	kindAt(tx, ty) {
		return this.list.find(b => tilesOf(b).some(([x, y]) => x === tx && y === ty)) || null;
	}

	messageAt(tx, ty) { const b = this.kindAt(tx, ty); return b ? b.msg : null; }

	giverAt(tx, ty) { return this.givers.some(g => g.tx === tx && g.ty === ty); }

	// talk to a giver: grant its item once, gated by prereq. Returns a message or null.
	grantAt(tx, ty) {
		const g = this.givers.find(g => g.tx === tx && g.ty === ty);
		if (!g) return null;
		if (Story.getFlag(g.onceFlag)) return g.post || g.give;
		if (g.prereq && !condMet(g.prereq)) return g.pre || null;
		Bag.addItem(g.item, g.count || 1);
		Bag.registerName(g.item, g.name || String(g.item).toUpperCase());
		Story.setFlag(g.onceFlag);
		return g.give;
	}

	draw(ctx, camX, camY) {
		for (const b of this.list) {
			const s = b.sprite || {};
			if (s.kind === 'mon') {
				const img = this.mons[s.img];
				if (!img) continue; // invisible blocker (e.g. Kecleon) still blocks via solid
				const cx = b.tx * META + META / 2, by = b.ty * META + META;
				drawOwMon(ctx, img, cx, by, camX, camY);
			} else if (s.img) {
				const img = this.people[s.img];
				if (!img) continue;
				ctx.drawImage(img, 0, 0, 16, 32, b.tx * META - camX, b.ty * META - 16 - camY, 16, 32);
			}
		}
		for (const g of this.givers) {
			const img = this.people[g.img];
			if (!img) continue;
			ctx.drawImage(img, 0, 0, 16, 32, g.tx * META - camX, g.ty * META - 16 - camY, 16, 32);
		}
	}
}

// exported for the strand-safety test (blockers_test.mjs)
export { condMet };
