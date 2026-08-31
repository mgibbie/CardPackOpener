// gen_trades.mjs — build the in-game NPC trade table from the three decomps.
//
// Trades are encoded two completely different ways, which is why nothing worked:
//   FireRed / Emerald  a struct table (ingame_trades.h / trade.h) keyed by
//                      INGAME_TRADE_*, which the map scripts name in a setvar.
//                      Those scripts survived the port.
//   Crystal            a packed `npctrade` macro list keyed by NPC_TRADE_*.
//                      Crystal's `tradenpc` script command has no counterpart
//                      in this port's op set, so the transpiler dropped those
//                      scripts entirely — the NPCs are still on the map with
//                      `[faceplayer, end]` and nothing else.
//
// Output: overworld/trades.json, in the MAIN repo (like map_regions.json), so it
// ships with an ordinary site deploy and needs no owdata push.
//
//   node tools/gen_trades.mjs
import fs from 'fs';

const REF = 'C:/Users/guide/Desktop/Magepunk66/Reference';
const OUT = 'overworld/trades.json';

// SPECIES_MR_MIME -> mrmime, ITEM_GOLD_BERRY -> goldberry (the ids this game uses)
const idOf = s => String(s || '').replace(/^(SPECIES_|ITEM_)/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const NONE = new Set(['none', '']);

const trades = {};

// ---------- FireRed / Emerald struct tables ----------
function parseStructTable(file, tag) {
	let src;
	try { src = fs.readFileSync(file, 'utf8'); } catch { return 0; }
	let n = 0;
	// [INGAME_TRADE_X] = { ...fields... },
	const re = /\[(INGAME_TRADE_[A-Z0-9_]+)\]\s*=\s*\{([\s\S]*?)\n\s*\},/g;
	let m;
	while ((m = re.exec(src))) {
		const [, key, body] = m;
		// the Nidoran entry is #if FIRERED/LEAFGREEN — take the first branch
		const pick = re2 => (re2.exec(body) || [])[1];
		const species = pick(/\.species\s*=\s*(SPECIES_[A-Z0-9_]+)/);
		const want = pick(/\.requestedSpecies\s*=\s*(SPECIES_[A-Z0-9_]+)/);
		if (!species || !want) continue;
		const nickname = (/\.nickname\s*=\s*_\("([^"]*)"\)/.exec(body) || [])[1] || '';
		const otName = (/\.otName\s*=\s*_\("([^"]*)"\)/.exec(body) || [])[1] || '';
		const otId = +((/\.otId\s*=\s*(\d+)/.exec(body) || [])[1] || 0);
		const held = idOf((/\.heldItem\s*=\s*(ITEM_[A-Z0-9_]+)/.exec(body) || [])[1]);
		if (trades[key]) continue; // first source wins (FireRed before Emerald)
		trades[key] = {
			source: tag, want: idOf(want), give: idOf(species),
			nickname, otName, otId, heldItem: NONE.has(held) ? null : held,
		};
		n++;
	}
	return n;
}
const nFR = parseStructTable(`${REF}/pokefirered/src/data/ingame_trades.h`, 'firered');
const nEM = parseStructTable(`${REF}/pokeemerald/src/data/trade.h`, 'emerald');

// ---------- Crystal packed macro list ----------
// npctrade DIALOGSET, requested, offered, "NICK", dvs, item, otId, "OT", gender
// Entry order matches the NPC_TRADE_* constants.
function parseCrystal() {
	let src, consts;
	try {
		src = fs.readFileSync(`${REF}/pokecrystal/data/events/npc_trades.asm`, 'utf8');
		consts = fs.readFileSync(`${REF}/pokecrystal/constants/npc_trade_constants.asm`, 'utf8');
	} catch { return 0; }
	const names = [...consts.matchAll(/const\s+(NPC_TRADE_[A-Z0-9_]+)/g)].map(m => m[1]);
	const rows = [...src.matchAll(/^\tnpctrade\s+(.+)$/gm)].map(m => m[1]);
	let n = 0;
	rows.forEach((row, i) => {
		// split on commas that are not inside quotes
		const f = row.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(s => s.trim());
		// The macro comment calls field 5 "dvs", but `db \5, \6, \7` shows the DVs
		// are TWO bytes ($96, $66) — so item/otId/otName all sit one place later
		// than the comment implies. Getting this wrong hands you an ONIX holding
		// item "66" whose trainer is called "48926".
		const [, want, give, nick, , , item, otId, ot] = f;
		const key = names[i];
		if (!key || !want || !give) return;
		trades[key] = {
			source: 'crystal', want: idOf(want), give: idOf(give),
			nickname: (nick || '').replace(/"/g, ''),
			otName: (ot || '').replace(/"/g, ''),
			otId: +String(otId || 0).replace(/[^0-9]/g, '') || 0,
			heldItem: NONE.has(idOf(item)) ? null : idOf(item),
		};
		n++;
	});
	return n;
}
const nCR = parseCrystal();

// ---------- validate against the game's own species list ----------
let species = {};
try { species = JSON.parse(fs.readFileSync('overworld/data/species_battle.json', 'utf8')); } catch {}
const bad = [];
for (const [k, t] of Object.entries(trades)) {
	if (!species[t.want]) bad.push(`${k}: wants unknown species '${t.want}'`);
	if (!species[t.give]) bad.push(`${k}: gives unknown species '${t.give}'`);
}

// ---------- which NPC runs which trade ----------
// Two sources, because the two dialects broke differently:
//   FireRed/Emerald  the script survived — read the INGAME_TRADE_* it setvars,
//                    so this stays correct if maps are re-transpiled.
//   Crystal          the script was DROPPED, so there is nothing to read; the
//                    five reachable NPCs are named here against the decomp.
//                    (FOREST and KIM live on JohKanto PowerPlant / Route 14,
//                    which this port never ported — so they are left out.)
const npcs = {};
const SD = 'overworld/data/scripts';
for (const f of fs.readdirSync(SD)) {
	if (!f.endsWith('.json')) continue;
	let p; try { p = JSON.parse(fs.readFileSync(`${SD}/${f}`, 'utf8')); } catch { continue; }
	for (const [label, ops] of Object.entries(p)) {
		if (!Array.isArray(ops)) continue;
		if (!ops.some(o => o.op === 'special' && o.name === 'DoInGameTradeScene')) continue;
		const key = ops.find(o => o.op === 'setvar' && /^INGAME_TRADE_/.test(String(o.value)))?.value;
		if (key && trades[key]) npcs[`${f.replace(/\.json$/, '')}:${label}`] = key;
	}
}
const CRYSTAL_NPCS = {
	'VioletKylesHouse:Kyle': 'NPC_TRADE_KYLE',
	'BlackthornEmysHouse:Emy': 'NPC_TRADE_EMY',
	'OlivineTimsHouse:Tim': 'NPC_TRADE_TIM',
	'GoldenrodDeptStore5F:Mike': 'NPC_TRADE_MIKE',
	'PewterPokecenter1F:Chris': 'NPC_TRADE_CHRIS',
};
for (const [k, v] of Object.entries(CRYSTAL_NPCS)) {
	const [stem, label] = k.split(':');
	let p; try { p = JSON.parse(fs.readFileSync(`${SD}/${stem}.json`, 'utf8')); } catch { bad.push(`${k}: map script missing`); continue; }
	if (!p[label]) { bad.push(`${k}: no such script label`); continue; }
	npcs[k] = v;
}

fs.writeFileSync(OUT, JSON.stringify({ trades, npcs }));
console.log(`${OUT}: ${Object.keys(trades).length} trades, ${Object.keys(npcs).length} NPCs  (firered ${nFR}, emerald ${nEM}, crystal ${nCR})`);
for (const [k, v] of Object.entries(npcs)) console.log(`  NPC ${k.padEnd(52)} ${v}`);
for (const [k, t] of Object.entries(trades)) {
	console.log(`  ${k.padEnd(26)} give ${t.want.padEnd(12)} -> get ${t.give.padEnd(12)} "${t.nickname}" OT ${t.otName}${t.heldItem ? ' + ' + t.heldItem : ''}`);
}
if (bad.length) { console.log('\nPROBLEMS:'); for (const b of bad) console.log('  ' + b); process.exitCode = 1; }
else console.log('\nevery traded species resolves against species_battle.json');
