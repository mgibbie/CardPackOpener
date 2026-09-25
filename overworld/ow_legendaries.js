// ow_legendaries.js — the static legendary encounters and the Hoenn legendary-awakening chain.
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import { META, drawOwMon, getImage } from './engine.js';
import * as Story from './events.js';
import { POSTGAME_LEGENDS } from './legendaries_postgame.js';
import { battle, cutscene, world } from './ow_core.js';
import { S } from './ow_state.js';
import { leadMon } from './party.js';
// main.js's own declarations (a safe cycle: only used inside functions)
import {
	legendariesHere, playerRegion, startCutscene, starterMenu,
} from './main.js';

// ---------- static legendary encounters ----------
// The decomp triggers these through an awakening cutscene + a legendary-battle
// special the web engine doesn't run (and the overworld legendary sprites aren't
// in the build), so a region-picker could never actually catch them. Instead we
// place a catchable wild encounter on the legendary's tile: walk onto it (or
// face it and interact) and a real battle starts — you can throw balls and keep
// it. A caught/defeated flag stops it re-triggering. The plot awakening scenes
// stay seeded off (they assume story state and lead to no catch); this is the
// catch itself, decoupled from them.
const HAND_PLACED_LEGENDS = {
	// Hoenn weather trio (decoupled from the awakening plot)
	MAP_SKY_PILLAR_TOP:  { species: 'rayquaza', dex: 384, level: 70, x: 14, y: 6,  flag: 'legend_caught_rayquaza', intro: 'A colossal POKeMON coils in the air above you...' },
	MAP_MARINE_CAVE_END: { species: 'kyogre',   dex: 382, level: 70, x: 9,  y: 22, flag: 'legend_caught_kyogre',   intro: 'The water heaves — something immense stirs in the depths...' },
	MAP_TERRA_CAVE_END:  { species: 'groudon',  dex: 383, level: 70, x: 17, y: 26, flag: 'legend_caught_groudon',  intro: 'The ground blazes with heat as a huge form rises...' },
	// the three REGI — sealed in their chambers, they stir only for the HOENN CHAMPION
	MAP_DESERT_RUINS: { species: 'regirock', dex: 377, level: 40, x: 8, y: 7, flag: 'legend_caught_regirock',
		requires: () => Badges.isChampion('HOENN'), intro: 'A golem of ancient stone stands sealed here — REGIROCK awakens.' },
	MAP_ISLAND_CAVE: { species: 'regice', dex: 378, level: 40, x: 8, y: 7, flag: 'legend_caught_regice',
		requires: () => Badges.isChampion('HOENN'), intro: 'The cave breathes freezing air — REGICE emerges from the ice.' },
	MAP_ANCIENT_TOMB: { species: 'registeel', dex: 379, level: 40, x: 8, y: 7, flag: 'legend_caught_registeel',
		requires: () => Badges.isChampion('HOENN'), intro: 'A body of tempered steel unseals itself — REGISTEEL awakens.' },
	// event-island legendaries (reached by the post-game EON/SEAGALLOP ferry, champion-gated)
	// The EON DUO, both on their island. Emerald gives you one and roams the other,
	// and we have no roamer — so LATIAS was reachable nowhere at all (the script
	// route is `BattleSetup_StartLatiBattle`, one of the 427 specials with no
	// handler). Two eon dragons on one island is the liberty that makes the pair
	// completable; they take separate flags, so it is still one of each.
	MAP_SOUTHERN_ISLAND_INTERIOR: [
		{ species: 'latios', dex: 381, level: 50, x: 13, y: 12, flag: 'legend_caught_latios',
			requires: () => Badges.isChampion('HOENN'), intro: 'A blue eon POKeMON drifts amid the leaves — LATIOS regards you keenly.' },
		{ species: 'latias', dex: 380, level: 50, x: 11, y: 12, flag: 'legend_caught_latias',
			requires: () => Badges.isChampion('HOENN'), intro: 'A red eon POKeMON watches from the branches — LATIAS reveals herself.' },
	],
	MAP_BIRTH_ISLAND_EXTERIOR: { species: 'deoxys', dex: 386, level: 60, x: 15, y: 3, flag: 'legend_caught_deoxys',
		requires: () => Badges.isChampion('HOENN'), intro: 'The strange triangle pulses — DEOXYS materializes from deep space.' },
	MAP_FARAWAY_ISLAND_INTERIOR: { species: 'mew', dex: 151, level: 30, x: 13, y: 17, flag: 'legend_caught_mew',
		requires: () => Badges.isChampion('HOENN'), intro: 'Something playful darts through the grass... MEW appears!' },
	// Kanto birds — catchable in their lairs (no gate)
	MAP_SEAFOAM_ISLANDS_B4F: { species: 'articuno', dex: 144, level: 50, x: 9, y: 2, flag: 'legend_caught_articuno', intro: 'A freezing gale howls through the cavern — ARTICUNO descends!' },
	MAP_POWER_PLANT:         { species: 'zapdos',   dex: 145, level: 50, x: 5, y: 11, flag: 'legend_caught_zapdos',  intro: 'The air crackles with electricity — ZAPDOS spreads its wings!' },
	MAP_MT_EMBER_SUMMIT:     { species: 'moltres',  dex: 146, level: 50, x: 9, y: 6, flag: 'legend_caught_moltres',  intro: 'The summit blazes — MOLTRES erupts from the flames!' },
	// Mewtwo — only in the depths of Cerulean Cave once you are the KANTO CHAMPION
	MAP_CERULEAN_CAVE_B1F: { species: 'mewtwo', dex: 150, level: 70, x: 7, y: 12, flag: 'legend_caught_mewtwo',
		requires: () => Badges.isChampion('KANTO'), intro: 'A cold, immense psychic presence fills the cave... MEWTWO awaits.' },
	// Johto tower duo — answer to their WINGS (a key-item hunt; wings granted on becoming CHAMPION)
	MAP_TIN_TOWER_ROOF: { species: 'hooh', dex: 250, level: 60, x: 9, y: 5, flag: 'legend_caught_hooh',
		requires: () => Bag.count('rainbowwing') > 0, intro: 'Rainbow light spills across the tower — HO-OH answers the RAINBOW WING!' },
	MAP_WHIRL_ISLAND_LUGIA_CHAMBER: { species: 'lugia', dex: 249, level: 60, x: 9, y: 5, flag: 'legend_caught_lugia',
		requires: () => Bag.count('silverwing') > 0, intro: 'The sea roars in the depths — LUGIA rises, drawn by the SILVER WING!' },
	// NAVEL ROCK — the same duo, reached the KANTO way. Deliberately the SAME
	// flags as the Tin Tower / Whirl Islands entries above, so a save still gets
	// exactly one HO-OH and one LUGIA: this is a second route to them, not a
	// second copy. Johto asks for the WINGS, Kanto asks you to be its Champion.
	MAP_NAVEL_ROCK_TOP: { species: 'hooh', dex: 250, level: 70, x: 12, y: 4, flag: 'legend_caught_hooh',
		requires: () => Badges.isChampion('KANTO'), intro: 'Light floods the peak — HO-OH descends over NAVEL ROCK!' },
	MAP_NAVEL_ROCK_BOTTOM: { species: 'lugia', dex: 249, level: 70, x: 11, y: 13, flag: 'legend_caught_lugia',
		requires: () => Badges.isChampion('KANTO'), intro: 'The cavern floods with sound — LUGIA rises from the deep!' },
	// CELEBI. Johto's signature mascot did not exist ANYWHERE in this codebase —
	// zero hits, despite shipping in the species table with a sprite. Crystal
	// gates it behind the GS Ball, an item this port has no equivalent for, so it
	// waits at the Ilex Forest shrine for the region's CHAMPION instead. That also
	// gives Johto a second post-game beat; it previously had only Mt Silver.
	MAP_ILEX_FOREST: { species: 'celebi', dex: 251, level: 60, x: 4, y: 19, flag: 'legend_caught_celebi',
		requires: () => Badges.isChampion('JOHTO'),
		intro: 'The shrine hums, and the forest folds around a small green shape — CELEBI!' },
	// JOHKANTO had NO legendaries at all, while Hoenn has 9, Johto 5 and Kanto 4.
	// Its Power Plant is the one bird lair the region actually owns (Seafoam and
	// Cerulean Cave are unprefixed border maps). Same flag as Kanto's ZAPDOS, so
	// this is a second route to the bird rather than a second bird.
	MAP_JOHKANTO_POWER_PLANT: { species: 'zapdos', dex: 145, level: 50, x: 16, y: 4, flag: 'legend_caught_zapdos',
		intro: 'The generators scream — ZAPDOS bursts from the machinery!' },
	// The three legendary beasts — once you've woken them at the Burned Tower they can
	// be confronted at the top of Tin Tower (a map can hold several: an array).
	MAP_TIN_TOWER_1F: [
		{ species: 'raikou', dex: 243, level: 40, x: 7, y: 9, flag: 'legend_caught_raikou',
			requires: () => Story.getFlag('EVENT_RELEASED_THE_BEASTS'), intro: 'Thunder cracks — RAIKOU bares its fangs!' },
		{ species: 'suicune', dex: 245, level: 40, x: 9, y: 9, flag: 'legend_caught_suicune',
			requires: () => Story.getFlag('EVENT_RELEASED_THE_BEASTS'), intro: 'The north wind stirs — SUICUNE regards you with clear eyes.' },
		{ species: 'entei', dex: 244, level: 40, x: 12, y: 9, flag: 'legend_caught_entei',
			requires: () => Story.getFlag('EVENT_RELEASED_THE_BEASTS'), intro: 'A volcanic roar — ENTEI blocks your path!' },
	],
};
// ...plus the 87 that had no home anywhere, one at the bottom of each of 87
// dungeons (legendaries_postgame.js, generated). The hand-placed table wins on a
// collision, but the generator skips any map named above so there are none.
export const LEGENDARY_ENCOUNTERS = { ...POSTGAME_LEGENDS, ...HAND_PLACED_LEGENDS };
// a Pokemon's overworld sprite, loaded on demand from data/pokemon_ow/<id>.png
const owMonCache = new Map();
function owMonSprite(id) {
	if (!id) return null;
	if (!owMonCache.has(id)) {
		owMonCache.set(id, null);
		// Fall back to the BATTLE sprite when there is no overworld one. 28 of the
		// placed legendaries are gen-9 Paradox/Ruin species with no pokemon_ow art,
		// and drawLegendary simply skipped them — leaving an invisible tile that
		// starts a legendary battle when you walk onto it, which reads as a bug
		// rather than as a secret.
		getImage(`data/pokemon_ow/${id}.png`)
			.catch(() => {
				const sp = battle.data?.species?.[id]?.sprite;
				return sp ? getImage(`data/pokemon/${sp}`) : Promise.reject(new Error('no sprite'));
			})
			.then(img => owMonCache.set(id, img))
			.catch(() => {});
	}
	return owMonCache.get(id);
}
export function drawLegendary(ctx, camX, camY) {
	for (const e of legendariesHere()) {
		const img = owMonSprite(e.species);
		if (!img) continue;
		const cx = e.x * META + META / 2, by = e.y * META + META; // bottom-centre on the tile
		drawOwMon(ctx, img, cx, by, camX, camY);
	}
}

// ---------- Hoenn legendary-awakening chain ----------
// After the Team Aqua climax (villain_hoenn_climax), the roused weather trio tear
// HOENN apart until RAYQUAZA is woken to calm them. The decomp drives this through
// camera/weather/battle `special` ops + flag-gated story objects, all of which are
// inert or never spawned in this port — so the literal scripts would play as
// invisible state changes. Instead a self-contained director advances its OWN state
// var (keeping the decomp scene vars dormant, so their onFrame scenes never fire)
// and RENDERS the beats: KYOGRE & GROUDON clash over SOOTOPOLIS on their real decomp
// tiles, then RAYQUAZA descends to still them. The catch itself is untouched — it
// stays a real battle on each legendary's lair tile via LEGENDARY_ENCOUNTERS.
const AW_VAR = 'VAR_HOENN_AWAKENING'; // 0 ready -> 6 resolved
export function awState() { return Story.getVar(AW_VAR); }
function awActive() { return Story.getFlag('villain_hoenn_climax') && awState() < 6; }
// a scripted actor's real decomp position, read live from the map's object_events
function awObjPos(re) {
	const o = (world.current.map.object_events || []).find(e => re.test(e.graphics_id || ''));
	return o ? { x: +o.x, y: +o.y } : null;
}
export const AWAKENING_SCENES = [
	{ map: 'Route128', when: aw => aw === 0, next: 1, lines: [
		'The sea churns violently off ROUTE 128. ARCHIE stares into the raging water, the BLUE ORB dark and cold in his fist.',
		'ARCHIE: What have I done...? KYOGRE won’t heed me! The sea itself is rising to swallow everything!',
		'MAXIE: Your precious KYOGRE has doomed us all, ARCHIE!',
		'STEVEN: Enough! The two POKeMON have gone berserk — drought and downpour tearing at each other. We must reach SOOTOPOLIS before HOENN drowns.',
	] },
	{ map: 'SootopolisCity', when: aw => aw < 2, next: 2, lines: [
		'You surface into SOOTOPOLIS to chaos. Above the crater lake, KYOGRE and GROUDON are locked in an ancient fury.',
		'Torrents of rain and searing heat collide over the city — the sky itself is at war.',
		'STEVEN: Their power only feeds on the clash! No trainer can stop them now... only a greater force could.',
		'WALLACE: There is one — the serpent that rules the skies above them both. RAYQUAZA.',
	] },
	{ map: 'SootopolisCity', when: aw => aw === 2, next: 3, lines: [
		'WALLACE: RAYQUAZA slumbers atop the SKY PILLAR, far to the east beyond PACIFIDLOG.',
		'WALLACE: Only it can quell KYOGRE and GROUDON. Go — wake the guardian of the sky, before SOOTOPOLIS is lost!',
	] },
	{ map: 'SkyPillar_Outside', when: aw => aw === 3, next: 4, door: true, lines: [
		'WALLACE stands before the SKY PILLAR’s sealed door, waiting for you.',
		'WALLACE: I’ve opened the way. Climb to the summit — RAYQUAZA waits at the very top. Hurry!',
	] },
	{ map: 'SkyPillar_Top', when: aw => aw === 4, next: 5, lines: [
		'At the pillar’s summit an immense green POKeMON coils in the thin air. RAYQUAZA.',
		'Your presence stirs it. RAYQUAZA’s eyes snap open — it uncoils and hurtles skyward, streaking west toward SOOTOPOLIS!',
	] },
	{ map: 'SootopolisCity', when: aw => aw === 5, next: 6, resolve: true, lines: [
		'RAYQUAZA descends through the storm in a spiral of light.',
		'Its roar shakes the heavens. KYOGRE and GROUDON freeze — then, cowed, sink back into the depths from which they rose.',
		'The rain stills. The blistering heat fades. RAYQUAZA gives a final cry and vanishes into the clouds.',
		'STEVEN: It’s over... HOENN is safe. The three still linger in the wild, though — seek them out, if you dare.',
	] },
];
// map-entry / per-step hook: play the next awakening beat if one is due here
export function checkAwakeningTrigger() {
	if (!S.party || !leadMon(S.party) || cutscene.blocking || battle.blocking || starterMenu.open) return;
	if (!Story.getFlag('villain_hoenn_climax') || playerRegion() !== 'HOENN') return;
	const aw = awState();
	const scene = AWAKENING_SCENES.find(s => s.map === world.current.name && s.when(aw));
	if (!scene) return;
	startCutscene(scene.lines.map(text => ({ op: 'say', text })), () => {
		if (scene.door) { // make the SKY PILLAR door walkable (decomp opens it via an OnLoad the port never runs)
			const lay = world.current?.layout;
			if (lay?.map?.[4]) world.setMetatile(14, 4, lay.map[4][14], false);
			if (lay?.map?.[5]) world.setMetatile(14, 5, lay.map[5][14], false);
		}
		Story.setVar(AW_VAR, scene.next);
		if (scene.resolve) { Story.clearFlag('FLAG_SYS_WEATHER_CTRL'); Story.clearFlag('FLAG_LEGENDARIES_IN_SOOTOPOLIS'); }
	});
}
// render the clashing legendaries over SOOTOPOLIS during the crisis (real decomp tiles)
export function drawAwakening(ctx, camX, camY) {
	if (world.current.name !== 'SootopolisCity' || !awActive()) return;
	const put = (species, pos) => {
		if (!pos) return;
		const img = owMonSprite(species);
		if (!img) return;
		const cx = pos.x * META + META / 2, by = pos.y * META + META;
		drawOwMon(ctx, img, cx, by, camX, camY);
	};
	put('groudon', awObjPos(/GROUDON/));
	put('kyogre', awObjPos(/KYOGRE/));
	if (awState() === 5) put('rayquaza', awObjPos(/RAYQUAZA/)); // descends to calm them
}
