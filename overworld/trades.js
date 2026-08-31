// trades.js — in-game NPC trades ("I'll swap you my ONIX for your BELLSPROUT").
//
// None of these worked, and they were broken two different ways:
//   Kanto / Hoenn   the scripts survived, but they drive the trade through four
//                   `special` ops (GetInGameTradeSpeciesInfo, GetTradeSpecies,
//                   CreateInGameTradePokemon, DoInGameTradeScene) that this port
//                   never implemented, so the NPC talked and nothing happened.
//   Johto           Crystal's `tradenpc` command has no counterpart in the
//                   port's op set, so the transpile DROPPED those scripts —
//                   Kyle is literally [faceplayer, end].
//
// Rather than emulate the gen-3 var plumbing (VAR_0x8004..0x800B shuffling a
// party index through four specials), both dialects are intercepted at the
// SCRIPT LABEL and run through one flow. tools/gen_trades.mjs builds the table
// from all three decomps and maps every reachable NPC onto it.
//
// A traded POKeMON arrives at the level of the one you gave away — that is what
// the decomps do (trade.c reads MON_DATA_LEVEL off the player's mon), and it
// keeps trades honest under the level cap.
let DATA = { trades: {}, npcs: {} };

export async function init() {
	try {
		DATA = await fetch(new URL('./trades.json', import.meta.url)).then(r => r.json());
	} catch (e) { console.warn('trades.json failed to load — NPC trades are off', e); }
}

export const get = key => DATA.trades[key] || null;
export const count = () => Object.keys(DATA.trades).length;
export const npcCount = () => Object.keys(DATA.npcs).length;

// Which trade does this NPC run? Keyed "<mapStem>:<scriptLabel>" — the same
// label the interact path already has in hand.
export function forScript(mapName, label) {
	const key = DATA.npcs[`${mapName}:${label}`];
	return key ? { key, ...DATA.trades[key] } : null;
}

// one trade per save; the flag doubles as "already traded" dialogue
export const flagFor = key => 'trade_done_' + String(key).toLowerCase();

// Build the received POKeMON from the one handed over. Level, and therefore the
// stat line, come from the given mon — you can't launder a high-level trade out
// of a low-level one, and the level cap is respected for free.
export function buildTraded(trade, given, data, buildMon) {
	const mon = buildMon(trade.give, given.level, data);
	if (!mon) return null;
	if (trade.nickname) mon.name = trade.nickname;
	mon.otName = trade.otName || null;
	mon.otId = trade.otId || 0;
	mon.traded = true;                       // a traded mon: boosted EXP in the real games
	if (trade.heldItem) mon.heldItem = trade.heldItem;
	return mon;
}
