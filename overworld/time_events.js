// time_events.js — pokeemerald's clock-driven field state: the once-a-day update
// (src/clock.c UpdatePerDay) and what hangs off it (src/time_events.c), for the
// two places the port's scripts ask about it and nothing answered:
//
//   MIRAGE ISLAND (Route 130)  `specialvar VAR_RESULT, IsMirageIslandPresent`
//       answered 0 for good, so the island (and its LIECHI tree and WYNAUT) never
//       came up. Emerald: a 32-bit value in VAR_MIRAGE_RND_H/L steps through
//       ISO_RANDOMIZE2 once per day passed; the island is up when the low 16 bits of
//       any party POKeMON's personality equal its high half (1 in 65536 a mon a day,
//       as on the cartridge).
//   SHOAL CAVE  `special UpdateShoalTideFlag` (the entrance room's ON_TRANSITION)
//       sets FLAG_SYS_SHOAL_TIDE (HIGH tide) from the hour, but only when you came
//       in from outdoors, so the tide never turns while you are inside; and the day
//       update sets FLAG_SYS_SHOAL_ITEM (SetShoalItemFlag), which the SHELL BELL man
//       reads to put the SHOAL SALT / SHOAL SHELL back.
//
// THE PORT'S CLOCKS. Emerald has one: the cartridge RTC, real time. The port has
// two, and this file uses each where the port already does:
//   * the HOUR is the accelerated in-game clock (clock.js: a day every 24 real
//     minutes) that already drives day/night, encounters and the native tide
//     (ow_features.js shoalTide), so the tide turns every few real minutes, not
//     every few hours;
//   * the DAY is the real local calendar day (the Shuckie loan, BUENA, the LUCKY
//     CHANNEL and the berry trees' 24h all count real days). VAR_DAYS holds the
//     day the update last ran, the decomp's own var.
// The decomp starts VAR_DAYS and the Mirage value at 0 (InitMirageRnd is unused);
// here a save's first update seeds the value instead (InitMirageRnd), since a
// save that predates this has no day count to step from.
import * as Clock from './clock.js';
import * as Story from './events.js';

export const localDay = (now = Date.now()) => Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000);

// include/random.h ISO_RANDOMIZE2, in u32
export const isoRandomize2 = x => (Math.imul(x >>> 0, 1103515245) + 12345) >>> 0;

export function getMirageRnd() {
	return (((Story.getVar('VAR_MIRAGE_RND_H') & 0xFFFF) << 16) | (Story.getVar('VAR_MIRAGE_RND_L') & 0xFFFF)) >>> 0;
}
export function setMirageRnd(rnd) {
	Story.setVar('VAR_MIRAGE_RND_H', (rnd >>> 16) & 0xFFFF);
	Story.setVar('VAR_MIRAGE_RND_L', rnd & 0xFFFF);
}
export function initMirageRnd(rng = Math.random) {
	setMirageRnd(((Math.floor(rng() * 0x10000) << 16) | Math.floor(rng() * 0x10000)) >>> 0);
}
export function updateMirageRnd(days) {
	let rnd = getMirageRnd();
	for (let i = 0; i < days; i++) rnd = isoRandomize2(rnd);
	setMirageRnd(rnd);
}

// a party POKeMON's personality value. The port never rolled one, so a mon gets
// its 32 random bits the first time anything asks, and keeps them (the caller
// saves the party when this returns true).
export function ensurePersonality(mon, rng = Math.random) {
	if (!mon || Number.isInteger(mon.personality)) return false;
	mon.personality = ((Math.floor(rng() * 0x10000) << 16) | Math.floor(rng() * 0x10000)) >>> 0;
	return true;
}
// the Mirage value as of `today` WITHOUT writing anything: the stored value
// stepped once per day since VAR_DAYS. ISO_RANDOMIZE2 steps compose, so this is
// exactly what updatePerDay would store if it ran now — which lets a LOAD (boot,
// a setup re-run) answer the question while the save stays byte-identical, and
// the next real map entry folds the same steps in for good. An unseeded save
// (VAR_DAYS 0, from before this existed) reads its stored value (0) as is.
export function mirageRndAsOf(today = localDay()) {
	let rnd = getMirageRnd();
	const days = Story.getVar('VAR_DAYS') | 0;
	if (!days || today <= days) return rnd;
	for (let i = 0; i < today - days; i++) rnd = isoRandomize2(rnd);
	return rnd;
}
// time_events.c IsMirageIslandPresent: any occupied party slot counts (the GBA
// reads MON_DATA_SPECIES, so an egg would too). `value` defaults to the stored one.
export function isMirageIslandPresent(party, value = getMirageRnd()) {
	const rnd = value >>> 16;
	return (party || []).some(m => m && Number.isInteger(m.personality) && (m.personality & 0xFFFF) === rnd);
}

// clock.c UpdatePerDay: once per new day. Returns the days that passed (0: none).
export function updatePerDay(today = localDay()) {
	const days = Story.getVar('VAR_DAYS') | 0;
	if (!days) {
		Story.setVar('VAR_DAYS', today);
		if (!getMirageRnd()) initMirageRnd();
		return 0;
	}
	if (days === today || days > today) return 0;   // the clock went back: nothing (as the GBA)
	const since = today - days;
	updateMirageRnd(since);
	Story.setFlag('FLAG_SYS_SHOAL_ITEM');            // SetShoalItemFlag
	Story.setVar('VAR_DAYS', today);
	return since;
}

// time_events.c UpdateShoalTideFlag: 1 = HIGH tide, by the hour
export const SHOAL_TIDE = [1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1];
// overworld.c IsMapTypeOutdoors
const OUTDOOR_TYPES = new Set(['MAP_TYPE_ROUTE', 'MAP_TYPE_TOWN', 'MAP_TYPE_UNKNOWN', 'MAP_TYPE_CITY', 'MAP_TYPE_OCEAN_ROUTE']);
export const isMapTypeOutdoors = t => OUTDOOR_TYPES.has(t);
// lastWarpMapType: the map type you warped in from (GetLastUsedWarpMapType).
// Returns true when it latched the tide.
export function updateShoalTideFlag(lastWarpMapType, hour = Clock.hour()) {
	if (!isMapTypeOutdoors(lastWarpMapType)) return false;
	if (SHOAL_TIDE[((hour % 24) + 24) % 24]) Story.setFlag('FLAG_SYS_SHOAL_TIDE');
	else Story.clearFlag('FLAG_SYS_SHOAL_TIDE');
	return true;
}

// the eight SHOAL items' spots and their decomp flags (ShoalSalt1-4 / ShoalShell1-4)
export const SHOAL_ITEM_FLAGS = {
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:31,8': 'FLAG_RECEIVED_SHOAL_SALT_1',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:14,26': 'FLAG_RECEIVED_SHOAL_SALT_2',
	'MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM:11,11': 'FLAG_RECEIVED_SHOAL_SALT_3',
	'MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM:18,2': 'FLAG_RECEIVED_SHOAL_SALT_4',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:41,20': 'FLAG_RECEIVED_SHOAL_SHELL_1',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:41,10': 'FLAG_RECEIVED_SHOAL_SHELL_2',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:6,9': 'FLAG_RECEIVED_SHOAL_SHELL_3',
	'MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM:16,13': 'FLAG_RECEIVED_SHOAL_SHELL_4',
};
// ShoalCave_LowTideEntranceRoom_EventScript_ResetShoalItems: run by the SHELL BELL
// man when a day has passed since (FLAG_SYS_SHOAL_ITEM). Returns true if it reset.
export function resetShoalItemsIfDue() {
	if (!Story.getFlag('FLAG_SYS_SHOAL_ITEM')) return false;
	for (const f of Object.values(SHOAL_ITEM_FLAGS)) Story.clearFlag(f);
	Story.clearFlag('FLAG_SYS_SHOAL_ITEM');
	return true;
}
