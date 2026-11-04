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

// THE DAILY FLAGS. Each decomp keeps a block of flags that one real day wipes:
//   EMERALD  event_data.c ClearDailyFlags memsets DAILY_FLAGS_START..DAILY_FLAGS_END
//            (0x920-0x95F; the named ones below, the rest FLAG_UNUSED_0x9xx), run
//            by UpdatePerDay. The berry gifts, the Lilycove LOTTERY ticket, the
//            Secret Base owner battles, the Apprentice leaving.
//   CRYSTAL  engine/overworld/time.asm CheckDailyResetTimer zeroes wDailyFlags1/2,
//            wSwarmFlags, wDailyRematchFlags, wDailyPhoneItemFlags and
//            wDailyPhoneTimeOfDayFlags once a day has passed (wDailyResetTimer).
//            The port names them as the engine_flags.asm constants that live there.
//   FIRERED  none: no RTC (DoTimeBasedEvents is commented out in scrcmd.c).
// The port never cleared any of them, so every daily gift ran once per save.
export const EMERALD_DAILY_FLAGS = [
	'FLAG_DAILY_CONTEST_LOBBY_RECEIVED_BERRY', 'FLAG_DAILY_SECRET_BASE', 'FLAG_DAILY_PICKED_LOTO_TICKET',
	'FLAG_DAILY_ROUTE_114_RECEIVED_BERRY', 'FLAG_DAILY_ROUTE_111_RECEIVED_BERRY', 'FLAG_DAILY_BERRY_MASTER_RECEIVED_BERRY',
	'FLAG_DAILY_ROUTE_120_RECEIVED_BERRY', 'FLAG_DAILY_LILYCOVE_RECEIVED_BERRY', 'FLAG_DAILY_FLOWER_SHOP_RECEIVED_BERRY',
	'FLAG_DAILY_BERRY_MASTERS_WIFE', 'FLAG_DAILY_SOOTOPOLIS_RECEIVED_BERRY', 'FLAG_DAILY_APPRENTICE_LEAVES',
];
const WEEKDAY_CALLS = ['JACK_MONDAY_MORNING', 'HUEY_WEDNESDAY_NIGHT', 'GAVEN_THURSDAY_MORNING', 'BETH_FRIDAY_AFTERNOON',
	'JOSE_SATURDAY_NIGHT', 'REENA_SUNDAY_MORNING', 'JOEY_MONDAY_AFTERNOON', 'WADE_TUESDAY_NIGHT', 'RALPH_WEDNESDAY_MORNING',
	'LIZ_THURSDAY_AFTERNOON', 'ANTHONY_FRIDAY_NIGHT', 'TODD_SATURDAY_MORNING', 'GINA_SUNDAY_AFTERNOON', 'ARNIE_TUESDAY_MORNING',
	'ALAN_WEDNESDAY_AFTERNOON', 'DANA_THURSDAY_NIGHT', 'CHAD_FRIDAY_MORNING', 'TULLY_SUNDAY_NIGHT', 'BRENT_MONDAY_MORNING',
	'TIFFANY_TUESDAY_AFTERNOON', 'VANCE_WEDNESDAY_NIGHT', 'WILTON_THURSDAY_MORNING', 'PARRY_FRIDAY_AFTERNOON', 'ERIN_SATURDAY_NIGHT'];
const REMATCH_TRAINERS = WEEKDAY_CALLS.map(s => s.split('_')[0]);
export const CRYSTAL_DAILY_FLAGS = [
	// wDailyFlags1
	'ENGINE_KURT_MAKING_BALLS', 'ENGINE_DAILY_BUG_CONTEST', 'ENGINE_QWILFISH_SWARM', 'ENGINE_TIME_CAPSULE',
	'ENGINE_ALL_FRUIT_TREES', 'ENGINE_GOT_SHUCKIE_TODAY', 'ENGINE_GOLDENROD_UNDERGROUND_MERCHANT_CLOSED', 'ENGINE_FOUGHT_IN_TRAINER_HALL_TODAY',
	// wDailyFlags2
	'ENGINE_MT_MOON_SQUARE_CLEFAIRY', 'ENGINE_UNION_CAVE_LAPRAS', 'ENGINE_GOLDENROD_UNDERGROUND_GOT_HAIRCUT', 'ENGINE_GOLDENROD_DEPT_STORE_TM27_RETURN',
	'ENGINE_DAISYS_GROOMING', 'ENGINE_INDIGO_PLATEAU_RIVAL_FIGHT', 'ENGINE_DAILY_MOVE_TUTOR', 'ENGINE_BUENAS_PASSWORD',
	// wSwarmFlags
	'ENGINE_BUENAS_PASSWORD_2', 'ENGINE_GOLDENROD_DEPT_STORE_SALE_IS_ON', 'ENGINE_DUNSPARCE_SWARM', 'ENGINE_YANMA_SWARM',
	// wDailyRematchFlags
	...REMATCH_TRAINERS.map(n => `ENGINE_${n}_READY_FOR_REMATCH`),
	// wDailyPhoneItemFlags
	'ENGINE_BEVERLY_HAS_NUGGET', 'ENGINE_JOSE_HAS_STAR_PIECE', 'ENGINE_WADE_HAS_ITEM', 'ENGINE_GINA_HAS_LEAF_STONE', 'ENGINE_ALAN_HAS_FIRE_STONE',
	'ENGINE_DANA_HAS_THUNDERSTONE', 'ENGINE_DEREK_HAS_NUGGET', 'ENGINE_TULLY_HAS_WATER_STONE', 'ENGINE_TIFFANY_HAS_PINK_BOW', 'ENGINE_WILTON_HAS_ITEM',
	// wDailyPhoneTimeOfDayFlags
	...WEEKDAY_CALLS.map(s => `ENGINE_${s}`),
];
export const DAILY_FLAGS = [...EMERALD_DAILY_FLAGS, ...CRYSTAL_DAILY_FLAGS];
export function clearDailyFlags() { for (const f of DAILY_FLAGS) Story.clearFlag(f); }
// the day the daily flags were last wiped. Its own var, not VAR_DAYS: a save from
// before this fix may already carry a VAR_DAYS of today (PR #793 seeded it) over
// flags set days ago, and those must lapse on its first trip, not tomorrow. Unset
// (a save from before this) counts as due. Once per day however many days were
// missed (a wipe is a wipe); the clock going back does nothing, as UpdatePerDay.
// Returns true when it wiped.
export const DAILY_RESET_VAR = 'VAR_MP_DAILY_RESET_DAY';
export function updateDailyFlags(today = localDay()) {
	const last = Story.getVar(DAILY_RESET_VAR) | 0;
	if (last && today <= last) return false;
	clearDailyFlags();
	Story.setVar(DAILY_RESET_VAR, today);
	return true;
}

// THE LILYCOVE LOTTERY (lottery_corner.c). The day's number lives in
// VAR_POKELOT_RND1 (low half) / VAR_POKELOT_RND2 (high half); new_game.c's
// ResetLotteryCorner seeds it, UpdatePerDay's SetRandomLotteryNumber re-rolls it
// (Random(), stepped ISO_RANDOMIZE2 once per day passed). The clerk's
// RetrieveLotteryNumber reads it, PickLotteryCornerTicket matches it, trailing
// digit by trailing digit, against the OT ID of every party and PC POKeMON.
//
// ONE DEVIATION, the number's range. The GBA ticket is the u16 low half
// (00000-65535), against GBA Trainer IDs that are u16 too. This port's ID No.
// (ow_features.js playerTID) runs 00000-99999, so a u16 ticket could never
// jackpot an ID of 65536 or more (a third of players) and would skew the
// 4-digit odds. The ticket here is the stored u32 mod 100000: the same space as
// the IDs it is matched against, uniform the way the GBA's is.
export const LOTTERY_PRIZES = ['ITEM_PP_UP', 'ITEM_EXP_SHARE', 'ITEM_MAX_REVIVE', 'ITEM_MASTER_BALL'];   // sLotteryPrizes
export function getLotteryNumber() {
	return (((Story.getVar('VAR_POKELOT_RND2') & 0xFFFF) << 16) | (Story.getVar('VAR_POKELOT_RND1') & 0xFFFF)) >>> 0;
}
export function setLotteryNumber(n) {
	Story.setVar('VAR_POKELOT_RND1', n & 0xFFFF);
	Story.setVar('VAR_POKELOT_RND2', (n >>> 16) & 0xFFFF);
}
const rand16 = rng => Math.floor(rng() * 0x10000) & 0xFFFF;
// ResetLotteryCorner (a new game; here a save's first update, as InitMirageRnd)
export function resetLotteryCorner(rng = Math.random) {
	setLotteryNumber(((rand16(rng) << 16) | rand16(rng)) >>> 0);
	Story.setVar('VAR_POKELOT_PRIZE_ITEM', 0);
}
// SetRandomLotteryNumber(days): var = Random(); ISO_RANDOMIZE2 `days` times
export function setRandomLotteryNumber(days, rng = Math.random) {
	let v = rand16(rng);
	for (let i = 0; i < days; i++) v = isoRandomize2(v);
	setLotteryNumber(v);
}
export const lotteryTicket = (n = getLotteryNumber()) => n % 100000;
// GetMatchingDigits: how many trailing decimal digits agree (0-5)
export function matchingDigits(win, otId) {
	let n = 0;
	for (let i = 0; i < 5; i++) {
		if (win % 10 !== otId % 10) break;
		win = Math.floor(win / 10); otId = Math.floor(otId / 10); n++;
	}
	return n;
}
// A POKeMON's OT ID. The port records one only for a mon someone ELSE trained:
// the in-game trades (trades.js) and the scripted gifts that name their OT
// (MANIA's SHUCKIE, RANDY's KENYA). Every other mon was caught, hatched or given
// to the player as theirs, which on the GBA stamps the player's own ID — so a mon
// with no otId reads as the player's ID, at the moment it is asked, and nothing
// is written to the party or the box (a load never dirties the save, and the
// player's ID is already derived, not stored per mon). A mon that names a foreign
// OT but carries no number can't match anything (null).
export function monOtId(mon, playerId) {
	if (!mon) return null;
	if (Number.isInteger(mon.otId)) return mon.otId;
	if (mon.otName || mon.traded) return null;
	return playerId;
}
// PickLotteryCornerTicket over the port's party and PC box (a flat list). Party
// first, then the box. As on the GBA, the digits are compared with VAR_0x8004
// (which holds digits - 1), so a later mon with as many digits takes over: a tie
// goes to the last one. Eggs don't count.
// -> { tier: 0-4 (VAR_0x8004), prize: ITEM_ (VAR_0x8005), inPC: 0/1 (VAR_0x8006), mon }
export function pickLotteryTicket(ticket, party, box, playerId) {
	let best = { tier: 0, prize: null, inPC: 0, mon: null };
	const look = (list, inPC) => {
		for (const mon of list || []) {
			if (!mon || mon.isEgg || mon.egg) continue;
			const ot = monOtId(mon, playerId);
			if (ot == null) continue;
			const d = matchingDigits(ticket, ot);
			if (d > best.tier && d > 1) best = { tier: d - 1, prize: null, inPC, mon };
		}
	};
	look(party, 0);
	look(box, 1);
	if (best.tier) best.prize = LOTTERY_PRIZES[best.tier - 1];
	return best;
}
// field_specials.c BufferLottoTicketNumber: five digits, zero-padded
export const lottoTicketString = n => String(n).padStart(5, '0');

// field_specials.c UpdateFrontierManiac: the BATTLE FRONTIER lounge's MANIAC
// (BattleFrontier_Lounge2_EventScript_GiveAdvice) talks about a different
// facility each day: VAR_FRONTIER_MANIAC_FACILITY steps by the days passed, mod
// FRONTIER_MANIAC_FACILITY_COUNT (10).
export const FRONTIER_MANIAC_FACILITY_COUNT = 10;
export function updateFrontierManiac(days) {
	Story.setVar('VAR_FRONTIER_MANIAC_FACILITY', ((Story.getVar('VAR_FRONTIER_MANIAC_FACILITY') | 0) + days) % FRONTIER_MANIAC_FACILITY_COUNT);
}

// clock.c UpdatePerDay: once per new day. Returns the days that passed (0: none).
// (ClearDailyFlags rides along, on its own day marker: updateDailyFlags.)
// Of the rest of UpdatePerDay, the port runs what it has a feature for: the
// Mirage value, the SHOAL items, the LOTTERY number and the Frontier MANIAC.
// Not here, because nothing in the port reads them: UpdateDewfordTrendPerDay
// (no trendy-phrase system; Common_EventScript_BufferTrendyPhrase is a stub),
// UpdateTVShowsPerDay (no TV shows / mass outbreaks), UpdateWeatherPerDay (no
// Route 119/123 weather cycle: map weather is a fixed table), UpdatePartyPokerusTime
// (no POKeRUS), UpdateBirchState (prof_birch.inc's ProfBirch_EventScript_UpdateLocation
// was never transpiled, so the call to it goes nowhere and VAR_BIRCH_STATE is read
// by nothing), UpdateFrontierGambler (VAR_FRONTIER_GAMBLER_CHALLENGE is read only
// by the unported ShowFrontierGambler* specials).
export function updatePerDay(today = localDay(), rng = Math.random) {
	updateDailyFlags(today);
	const days = Story.getVar('VAR_DAYS') | 0;
	// a save from before the lottery was ported has no number yet (new_game.c's
	// ResetLotteryCorner never ran): seed it on its first update, as the Mirage value
	if (!Story.getVar('VAR_POKELOT_RND1') && !Story.getVar('VAR_POKELOT_RND2')) resetLotteryCorner(rng);
	if (!days) {
		Story.setVar('VAR_DAYS', today);
		if (!getMirageRnd()) initMirageRnd(rng);
		return 0;
	}
	if (days === today || days > today) return 0;   // the clock went back: nothing (as the GBA)
	const since = today - days;
	updateMirageRnd(since);
	updateFrontierManiac(since);
	Story.setFlag('FLAG_SYS_SHOAL_ITEM');            // SetShoalItemFlag
	setRandomLotteryNumber(since, rng);
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
