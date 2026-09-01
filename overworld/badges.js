// badges.js — the progression spine: gym badges, the Elite Four gate, and the
// champion win condition. Region-agnostic. A defeated Gym Leader awards that
// region's badge (looked up by the leader's battle-script name from
// trainers.json); the Elite Four + Champion are gated behind all 8 of that
// region's badges; beating the Champion crowns you and ends the climb. HM field
// moves are gated by badge count per canonical order.
//
// Badges/champion status live on this device (localStorage via safestore) — the
// same slice as party/box/money; no login or network is needed.
import { safeLoad, safeSave } from './safestore.js';

// ordered badge list per region (index 0..7 = badges 1..8)
export const BADGES = {
	KANTO: [
		{ id: 'boulder', name: 'Boulder Badge', leader: 'Brock' },
		{ id: 'cascade', name: 'Cascade Badge', leader: 'Misty' },
		{ id: 'thunder', name: 'Thunder Badge', leader: 'Lt. Surge' },
		{ id: 'rainbow', name: 'Rainbow Badge', leader: 'Erika' },
		{ id: 'soul', name: 'Soul Badge', leader: 'Koga' },
		{ id: 'marsh', name: 'Marsh Badge', leader: 'Sabrina' },
		{ id: 'volcano', name: 'Volcano Badge', leader: 'Blaine' },
		{ id: 'earth', name: 'Earth Badge', leader: 'Giovanni' },
	],
	JOHTO: [
		{ id: 'zephyr', name: 'Zephyr Badge', leader: 'Falkner' },
		{ id: 'hive', name: 'Hive Badge', leader: 'Bugsy' },
		{ id: 'plain', name: 'Plain Badge', leader: 'Whitney' },
		{ id: 'fog', name: 'Fog Badge', leader: 'Morty' },
		{ id: 'storm', name: 'Storm Badge', leader: 'Chuck' },
		{ id: 'mineral', name: 'Mineral Badge', leader: 'Jasmine' },
		{ id: 'glacier', name: 'Glacier Badge', leader: 'Pryce' },
		{ id: 'rising', name: 'Rising Badge', leader: 'Clair' },
	],
	HOENN: [
		{ id: 'stone', name: 'Stone Badge', leader: 'Roxanne' },
		{ id: 'knuckle', name: 'Knuckle Badge', leader: 'Brawly' },
		{ id: 'dynamo', name: 'Dynamo Badge', leader: 'Wattson' },
		{ id: 'heat', name: 'Heat Badge', leader: 'Flannery' },
		{ id: 'balance', name: 'Balance Badge', leader: 'Norman' },
		{ id: 'feather', name: 'Feather Badge', leader: 'Winona' },
		{ id: 'mind', name: 'Mind Badge', leader: 'Tate & Liza' },
		{ id: 'rain', name: 'Rain Badge', leader: 'Juan' },
	],
	// JOHTO's post-game KANTO (the 8 crystal-Kanto gyms) — a second badge slice a Johto
	// save fills for a 16-badge total, the requirement to face RED at Mt Silver. Not a
	// player region (localStorage 'magepunk_region' is only KANTO/JOHTO/HOENN); it's a
	// virtual slice keyed off the JohKanto gym maps.
	JOHKANTO: [
		{ id: 'boulder', name: 'Boulder Badge', leader: 'Brock' },
		{ id: 'cascade', name: 'Cascade Badge', leader: 'Misty' },
		{ id: 'thunder', name: 'Thunder Badge', leader: 'Lt. Surge' },
		{ id: 'rainbow', name: 'Rainbow Badge', leader: 'Erika' },
		{ id: 'soul', name: 'Soul Badge', leader: 'Janine' },
		{ id: 'marsh', name: 'Marsh Badge', leader: 'Sabrina' },
		{ id: 'volcano', name: 'Volcano Badge', leader: 'Blaine' },
		{ id: 'earth', name: 'Earth Badge', leader: 'Blue' },
	],
};

// Gym-leader battle script -> [region, badgeId]. Keys are the roster script names
// in trainers.json: FireRed/Emerald `<Place>_Gym_EventScript_<Leader>` and
// pokecrystal `<Place>Gym<Leader>Script`. Both the Emerald and RS variants of a
// leader (and the JohKanto crystal Kanto gyms) point at the same badge.
export const GYM_SCRIPT = {
	// --- Kanto (FireRed) ---
	'PewterCity_Gym_EventScript_Brock': ['KANTO', 'boulder'],
	'CeruleanCity_Gym_EventScript_Misty': ['KANTO', 'cascade'],
	'VermilionCity_Gym_EventScript_LtSurge': ['KANTO', 'thunder'],
	'CeladonCity_Gym_EventScript_Erika': ['KANTO', 'rainbow'],
	'FuchsiaCity_Gym_EventScript_Koga': ['KANTO', 'soul'],
	'SaffronCity_Gym_EventScript_Sabrina': ['KANTO', 'marsh'],
	'CinnabarIsland_Gym_EventScript_Blaine': ['KANTO', 'volcano'],
	'ViridianCity_Gym_EventScript_Giovanni': ['KANTO', 'earth'],
	// --- Kanto (pokecrystal / JohKanto rematch gyms) ---
	'PewterGymBrockScript': ['KANTO', 'boulder'],
	'CeruleanGymMistyScript': ['KANTO', 'cascade'],
	'VermilionGymSurgeScript': ['KANTO', 'thunder'],
	'CeladonGymErikaScript': ['KANTO', 'rainbow'],
	'FuchsiaGymJanineScript': ['KANTO', 'soul'],
	'SaffronGymSabrinaScript': ['KANTO', 'marsh'],
	'SeafoamGymBlaineScript': ['KANTO', 'volcano'],
	'ViridianGymBlueScript': ['KANTO', 'earth'],
	// --- Johto (pokecrystal) ---
	'VioletGymFalknerScript': ['JOHTO', 'zephyr'],
	'AzaleaGymBugsyScript': ['JOHTO', 'hive'],
	'GoldenrodGymWhitneyScript': ['JOHTO', 'plain'],
	'EcruteakGymMortyScript': ['JOHTO', 'fog'],
	'CianwoodGymChuckScript': ['JOHTO', 'storm'],
	'OlivineGymJasmineScript': ['JOHTO', 'mineral'],
	'MahoganyGymPryceScript': ['JOHTO', 'glacier'],
	'BlackthornGymClairScript': ['JOHTO', 'rising'],
	// --- Hoenn (Emerald; RS variants included) ---
	'RustboroCity_Gym_EventScript_Roxanne': ['HOENN', 'stone'],
	'DewfordTown_Gym_EventScript_Brawly': ['HOENN', 'knuckle'],
	'MauvilleCity_Gym_EventScript_Wattson': ['HOENN', 'dynamo'],
	'LavaridgeTown_Gym_1F_EventScript_Flannery': ['HOENN', 'heat'],
	'LavaridgeTown_Gym_EventScript_Flannery': ['HOENN', 'heat'],
	'PetalburgCity_Gym_EventScript_NormanBattle': ['HOENN', 'balance'],
	'PetalburgCity_Gym_EventScript_Norman': ['HOENN', 'balance'],
	'FortreeCity_Gym_EventScript_Winona': ['HOENN', 'feather'],
	'MossdeepCity_Gym_EventScript_TateAndLiza': ['HOENN', 'mind'],
	'MossdeepCity_Gym_EventScript_TateLiza': ['HOENN', 'mind'],
	'SootopolisCity_Gym_1F_EventScript_Juan': ['HOENN', 'rain'],
	'SootopolisCity_Gym_EventScript_Wallace': ['HOENN', 'rain'],
};

// Elite Four / Champion battle script -> [region, role]. role: 'elite' (a League
// member — gated but awards nothing on its own) or 'champion' (beating them wins
// the region). All entries are gated behind that region's 8 badges.
export const LEAGUE_SCRIPT = {
	// --- Kanto (Indigo Plateau / PokemonLeague) ---
	'PokemonLeague_LoreleisRoom_EventScript_Battle': ['KANTO', 'elite'],
	'PokemonLeague_BrunosRoom_EventScript_Battle': ['KANTO', 'elite'],
	'PokemonLeague_AgathasRoom_EventScript_Battle': ['KANTO', 'elite'],
	'PokemonLeague_LancesRoom_EventScript_Battle': ['KANTO', 'elite'],
	'PokemonLeague_ChampionsRoom_EventScript_BattleBulbasaur': ['KANTO', 'champion'],
	'PokemonLeague_ChampionsRoom_EventScript_BattleCharmander': ['KANTO', 'champion'],
	'PokemonLeague_ChampionsRoom_EventScript_BattleSquirtle': ['KANTO', 'champion'],
	// --- Johto (Indigo Plateau, crystal) ---
	'WillScript_Battle': ['JOHTO', 'elite'],
	'KogaScript_Battle': ['JOHTO', 'elite'],
	'BrunoScript_Battle': ['JOHTO', 'elite'],
	'KarenScript_Battle': ['JOHTO', 'elite'],
	'LancesRoomLanceScript': ['JOHTO', 'champion'],
	// --- Hoenn (Ever Grande City) ---
	'EverGrandeCity_SidneysRoom_EventScript_Sidney': ['HOENN', 'elite'],
	'EverGrandeCity_PhoebesRoom_EventScript_Phoebe': ['HOENN', 'elite'],
	'EverGrandeCity_GlaciasRoom_EventScript_Glacia': ['HOENN', 'elite'],
	'EverGrandeCity_DrakesRoom_EventScript_Drake': ['HOENN', 'elite'],
	'EverGrandeCity_ChampionsRoom_EventScript_Wallace': ['HOENN', 'champion'],
};

// HM field-move -> number of that region's badges required to use it out of
// battle. Canonical badge order: FRLG (flash/cut/fly/strength/surf gated 1..5),
// RSE (cut/flash/rocksmash/strength/surf/fly/dive/waterfall gated 1..8),
// GSC (flash/cut/strength/surf/fly gated 1..5, waterfall 8). 0 = no gate.
export const HM_GATE = {
	KANTO: { flash: 1, cut: 2, fly: 3, strength: 4, surf: 5, rocksmash: 0, waterfall: 0, dive: 0 },
	JOHTO: { flash: 1, cut: 2, strength: 3, surf: 4, fly: 5, rocksmash: 0, waterfall: 8, dive: 0 },
	HOENN: { cut: 1, flash: 2, rocksmash: 3, strength: 4, surf: 5, fly: 6, dive: 7, waterfall: 8 },
	JOHKANTO: { flash: 1, cut: 2, fly: 3, strength: 4, surf: 5, rocksmash: 0, waterfall: 0, dive: 0 },
};

const KEY = 'magepunk_badges_v1';
const REGIONS = ['KANTO', 'JOHTO', 'HOENN', 'JOHKANTO'];

export function regionKey(r) {
	const u = String(r || '').toUpperCase();
	return REGIONS.includes(u) ? u : 'KANTO';
}

// { badges: { KANTO:{boulder:true,...}, ... }, champion: { KANTO:true, ... } }
let _state = null;
function state() {
	if (_state) return _state;
	const raw = safeLoad(KEY, null);
	_state = (raw && typeof raw === 'object') ? raw : {};
	if (!_state.badges || typeof _state.badges !== 'object') _state.badges = {};
	if (!_state.champion || typeof _state.champion !== 'object') _state.champion = {};
	return _state;
}
function persist() { safeSave(KEY, state()); }

// reset the in-memory cache (tests / a fresh account after a wipe)
export function _reset() { _state = null; }

export function has(region, id) {
	return !!state().badges[regionKey(region)]?.[id];
}

// award a badge; returns true only if it was newly earned (for the toast/dialog)
export function earn(region, id) {
	const rk = regionKey(region);
	const b = state().badges;
	if (!b[rk]) b[rk] = {};
	if (b[rk][id]) return false;
	b[rk][id] = true;
	persist();
	return true;
}

export function count(region) {
	const owned = state().badges[regionKey(region)] || {};
	return BADGES[regionKey(region)].reduce((n, b) => n + (owned[b.id] ? 1 : 0), 0);
}

// ordered [{ id, name, leader, earned }] for the trainer card
export function list(region) {
	const rk = regionKey(region);
	const owned = state().badges[rk] || {};
	return BADGES[rk].map(b => ({ ...b, earned: !!owned[b.id] }));
}

// what a battle script means for progression, or null if it's an ordinary trainer
export function scriptInfo(script) {
	if (!script) return null;
	const g = GYM_SCRIPT[script];
	if (g) return { kind: 'gym', region: g[0], id: g[1], name: badgeName(g[0], g[1]) };
	const l = LEAGUE_SCRIPT[script];
	if (l) return { kind: l[1], region: l[0] };
	return null;
}

export function badgeName(region, id) {
	return (BADGES[regionKey(region)].find(b => b.id === id) || {}).name || 'Badge';
}

// badges required to use an HM field move in this region (0 = always allowed)
export function hmReq(region, hmId) {
	return HM_GATE[regionKey(region)]?.[hmId] || 0;
}

export function isChampion(region) { return !!state().champion[regionKey(region)]; }
export function crown(region) {
	const rk = regionKey(region);
	if (state().champion[rk]) return false;
	state().champion[rk] = true;
	persist();
	return true;
}

// how many badges are still needed before the League opens (0 = ready)
export function badgesUntilLeague(region) { return Math.max(0, 8 - count(region)); }

// ---------- level cap ----------
// The level each tier's Gym Leader is levelled up to (index = tier, so the
// (tier+1)th gym). applyGymLevelFloors() in main.js evens the three regions out
// against this, and the level cap is read off the same numbers so the two can
// never drift apart.
export const TIER_LEVEL_FLOOR = [14, 20, 26, 29, 40, 42, 46, 48];

export const MAX_LEVEL = 255;
// Where the main game ends. Levels 1-100 are the three shared regions; 101-255
// are JOHKANTO's, earned one gym at a time.
export const CLASSIC_MAX_LEVEL = 100;
// A flat, readable ladder: start at 20 and add 10 per tier, which lands exactly
// on 100 once all 24 gyms are behind you.
export const BASE_LEVEL_CAP = 20;
export const LEVEL_CAP_STEP = 10;
// ...then JohKanto's eight gyms carry it the rest of the way: 120/140/.../240,
// and its Champion opens the last stretch to 255.
export const POST_CAP_STEP = 20;

// ---------- growth curve ----------
// Cubic (medium-fast) to 100, then FLAT per level above it.
//
// Extending `level ** 3` to 255 would cost 15.6 MILLION exp for the climb —
// fifteen times the entire main game, or about 14,000 battles at postgame yields.
// That is not a grind, it is a wall. Levels past 100 are a different thing from
// levels below it: not a species growing into itself, but a postgame ladder. So
// they are priced as one.
//
// POST_CAP_STEP_EXP is chosen so the whole 100 -> 255 climb costs 930,000 — a
// second main game, near enough, rather than fifteen of them. The curve BELOW 100
// is untouched, so every existing save keeps the exact level it had.
export const POST_CAP_STEP_EXP = 6000;
const CLASSIC_MAX_EXP = CLASSIC_MAX_LEVEL ** 3;
export function expForLevel(level) {
	const lv = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level) || 1));
	return lv <= CLASSIC_MAX_LEVEL ? lv ** 3 : CLASSIC_MAX_EXP + (lv - CLASSIC_MAX_LEVEL) * POST_CAP_STEP_EXP;
}
export function levelForExp(exp) {
	const e = Math.max(0, exp || 0);
	if (e < CLASSIC_MAX_EXP) {
		let lv = 1;
		while (lv < CLASSIC_MAX_LEVEL && e >= (lv + 1) ** 3) lv++;
		return lv;
	}
	return Math.min(MAX_LEVEL, CLASSIC_MAX_LEVEL + Math.floor((e - CLASSIC_MAX_EXP) / POST_CAP_STEP_EXP));
}

// The cap is keyed off the tier you have cleared in EVERY region at once
// (Quest.globalTier() = the minimum badge count across Kanto/Johto/Hoenn), so
// racing one region ahead earns you nothing until the other two catch up.
// 20/30/40/50/60/70/80/90/100. It always clears TIER_LEVEL_FLOOR[tier] (the next
// Gym Leader's level), so no tier can ever be capped into being unwinnable —
// levelcap_test asserts that against the floors so a retune can't break it.
export function levelCap(tier) {
	const t = Math.max(0, Math.min(8, tier | 0));
	const main = BASE_LEVEL_CAP + t * LEVEL_CAP_STEP;
	if (main < CLASSIC_MAX_LEVEL) return main;
	// The main game is done. JOHKANTO's own eight badges carry the cap the rest of
	// the way — 120/140/160/180/200/220/240, and beating its Champion lifts the
	// last stop to 255. Keyed on JohKanto alone (not globalTier) because the three
	// shared regions have no more gyms to give.
	const jk = Math.max(0, Math.min(8, count('JOHKANTO')));
	if (jk >= 8) return isChampion('JOHKANTO') ? MAX_LEVEL : CLASSIC_MAX_LEVEL + 7 * POST_CAP_STEP;
	return Math.min(MAX_LEVEL, CLASSIC_MAX_LEVEL + jk * POST_CAP_STEP);
}

// what the cap becomes after one more gym everywhere — for "next: Lv26" UI
export function nextLevelCap(tier) { return levelCap((tier | 0) + 1); }
