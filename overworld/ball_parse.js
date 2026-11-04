// ball_parse.js — which item ball is a plain pickup, and what it holds.
//
// Pure (no DOM, no imports) so the game (items.js) and the build tool that lists
// pickup-ball flags (tools/gen_ball_flags.mjs) read balls the SAME way.

// "<Map>_EventScript_ItemRareCandy2" -> ["rarecandy", "Rare Candy"]
export function parseBallScript(script) {
	const m = /_EventScript_Item(.+)$/.exec(script || '');
	if (!m) return null;
	// The trailing-digit strip disambiguates repeats ("ItemRareCandy2" -> rarecandy).
	// For a TM or HM the digits ARE the identity, so stripping them produced the id
	// "tm" — an unsellable junk item that teaches nothing (tmMoveId needs tm<n>).
	// 29 balls were affected, including HM07 WATERFALL in Icefall Cave.
	const camel = /^(TM|HM)\d+$/i.test(m[1]) ? m[1] : m[1].replace(/\d+$/, '');
	const id = camel.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (!id) return null;
	const pretty = camel.replace(/([a-z])([A-Z])/g, '$1 $2');
	return [id, pretty];
}

// Crystal writes an item ball's script as <Map><Item> — "RockTunnel1FElixer",
// "Route12Nugget" — with no _EventScript_Item marker for parseBallScript to find.
// The map stem is the only thing that says where the map name ends, so it is
// passed in; a JohKanto map carries Crystal's own (unprefixed) name in the script,
// so both spellings are tried.
//
// The three starter balls in Elm's lab are POKE_BALLs too and must NOT become
// items: picking up a "Cyndaquil" would put a junk id in the bag.
const STARTER_BALLS = /^(Cyndaquil|Totodile|Chikorita)PokeBallScript$/;
export function parseCrystalBall(script, stem) {
	if (!script || STARTER_BALLS.test(script)) return null;
	let tail = script;
	for (const pre of [stem, String(stem).replace(/^JohKanto/, '')]) {
		if (pre && tail.startsWith(pre)) { tail = tail.slice(pre.length); break; }
	}
	tail = tail.replace(/Script$/, '');
	if (!tail || tail === script) return null;       // nothing stripped: not this form
	const id = tail.toLowerCase().replace(/[^a-z0-9]/g, '');
	if (!id) return null;
	return [id, tail.replace(/([a-z])([A-Z])/g, '$1 $2')];
}

// "ITEM_RARE_CANDY" -> ["rarecandy", "Rare Candy"]
export function parseItemConst(c) {
	if (!c || c === 'ITEM_NONE') return null;
	const body = c.replace(/^ITEM_/, '');
	const id = body.toLowerCase().replace(/[^a-z0-9]/g, '');
	const pretty = body.split('_').map(w => w[0] + w.slice(1).toLowerCase()).join(' ');
	return [id, pretty];
}

// a plain pickup ball (not a scripted one) — the same test items.js loadForMap uses
export function pickupBall(o, crystal, stem) {
	return parseBallScript(o.script) || (crystal ? parseCrystalBall(o.script, stem) : null);
}
