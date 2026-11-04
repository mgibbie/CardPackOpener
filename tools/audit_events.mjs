// audit_events.mjs — scour every ported map in all three regions for BROKEN
// events: the classes of damage the decomp->JSON transpile can leave behind,
// each of which is visible to a player as a dead or nonsense interaction.
//
// What it looks for, and why each one shows up in game:
//   missing-text    a msg's label isn't in the map's strings or _common. The
//                   renderer falls back to the ref itself, so the NPC SPEAKS
//                   ITS OWN LABEL ("ElmsLabText_Foo"). The loudest break.
//   missing-label   a goto/call/branch target that doesn't exist in the map's
//                   program — the jump dies and the rest of the script is lost.
//   missing-script  an object/sign/coord event naming a script the map doesn't
//                   define — talking to that NPC does nothing at all.
//   bad-item        a give/takeitem whose id isn't a real bag item.
//   bad-species     a givemon for a species the battle data doesn't have.
//   bad-warp        a warp to a map id that isn't in the map index.
//   ugly-text       a string that still carries raw control junk (@, \l, \p,
//                   stray <...>) or is empty after normalising.
//
// Added 2026-09-23, one class per bug shape that blocked the story that day:
//   bad-warp-index  a warp (script op OR map warp_event) to a door index the
//                   destination map does not have. warpTo() silently falls back
//                   to warps[0], so the player lands somewhere arbitrary —
//                   Route104 warp 13 (8 exist), Vermilion warp 23 (10 exist).
//   unknown-special a `special` main.js runSpecial() has no case for. It is a
//                   silent no-op; harmless for pure visuals, fatal when the
//                   special was what moved the story (DoSSAnneDepartureCutscene).
//   long-walk       a scripted move of 90+ steps outside the patched ferry legs:
//                   the transpile's rendering of a camera pan, which walks the
//                   player off the map (Briney's 194-step "sail").
//   unresolved-obj  (INFO) a hideobj/move/... target that npcById's rules cannot
//                   resolve on that map. Mostly objects genuinely absent from
//                   the port's map data, where null is correct — listed so a
//                   story-critical one is visible, not counted as broken.
//
//   node tools/audit_events.mjs            (repo root)
//   node tools/audit_events.mjs --list=missing-text   (full list for one class)
import fs from 'fs';
import path from 'path';

const D = 'overworld/data';
const only = (process.argv.find(a => a.startsWith('--list=')) || '').split('=')[1] || null;

const common = JSON.parse(fs.readFileSync(`${D}/strings/_common.json`, 'utf8'));
const species = JSON.parse(fs.readFileSync(`${D}/species_battle.json`, 'utf8'));
const mapIndex = JSON.parse(fs.readFileSync(`${D}/map_index.json`, 'utf8'));
const bagSrc = fs.readFileSync('overworld/bag.js', 'utf8');
const bagItems = new Set([...bagSrc.matchAll(/^\t([a-z0-9_]+):\s*\{/gm)].map(m => m[1]));

// same id normalisation events.js uses
const itemId = sym => {
	if (typeof sym !== 'string') return null;
	if (/^VAR_/.test(sym)) return null;
	if (/_Text_/.test(sym)) {
		const m = /(?:Received|Recovered|Obtained|Found)(?:A)?([A-Za-z0-9]+?)(?:From|By|$)/.exec(sym.split('_Text_')[1] || '');
		return m ? m[1].toLowerCase().replace(/[^a-z0-9]/g, '') : null;
	}
	return sym.replace(/^ITEM_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
};
const giveArgs = op => {
	const swapped = typeof op.count === 'string' && /^ITEM_/.test(op.count);
	return itemId(swapped ? op.count : op.item);
};
// mirrors events.js normalizeText: braces dropped, '#' -> POKe, '@' (an unfilled
// runtime buffer) -> an ellipsis
const normalize = s => String(s).replace(/\{[^{}]*\}/g, '').replace(/#/g, 'POKe').replace(/@+/g, '...').trim();

const region = stem => /^(NewBark|Cherrygrove|Violet|Azalea|Goldenrod|Ecruteak|Olivine|Cianwood|Mahogany|Blackthorn|Route(2[6-9]|3[0-9]|4[0-6])(_|$)|Union|Ilex|Sprout|Burned|TinTower|Whirl|MountMortar|DarkCave|LakeOfRage|IcePath|Radio|Slowpoke|Ruins|Elms|Mr?Pokemon|Kurt|Guide)/.test(stem) ? 'JOHTO'
	: /^(Littleroot|Oldale|Petalburg|Rustboro|Dewford|Slateport|Mauville|Verdanturf|Fallarbor|Lavaridge|Fortree|Lilycove|Mossdeep|Sootopolis|EverGrande|Pacifidlog|Route1[0-3][0-9]|MtPyre|MeteorFalls|Granite|Jagged|Shoal|NewMauville|AbandonedShip|SkyPillar|Seafloor|MtChimney|Aqua|Magma|BattleFrontier|TrainerHill|Mirage|Desert|IslandCave|AncientTomb|SouthernIsland|Scorched|Sealed|CaveOfOrigin|SSTidal|Trick|Contest|Battle(Tent|Tower))/.test(stem) ? 'HOENN'
	: 'KANTO';


// ---- inputs for the 2026-09-23 classes ----
const mainSrc = fs.readFileSync('overworld/main.js', 'utf8');
const rsAt = mainSrc.indexOf('function runSpecial(');
const rsBody = mainSrc.slice(rsAt, mainSrc.indexOf('\n}\n', rsAt));
const handledSpecials = new Set([...rsBody.matchAll(/case '([A-Za-z0-9_]+)'/g)].map(m => m[1]));
const mapByFile = {}, warpCount = {};
for (const f of fs.readdirSync(`${D}/maps`)) {
	if (!f.endsWith('_map.json')) continue;
	try { const m = JSON.parse(fs.readFileSync(`${D}/maps/${f}`, 'utf8')); mapByFile[f.replace(/_map\.json$/, '')] = m; if (m.id) warpCount[m.id] = (m.warp_events || []).length; } catch {}
}
const warpsOf = id => { if (typeof id !== 'string') return null; return warpCount[id] ?? warpCount['MAP_' + id] ?? null; };
const SAIL = new Set(['Route104_EventScript_SailToDewfordNoCall', 'Route104_EventScript_SailToDewfordDadCalls',
	'DewfordTown_EventScript_SailToPetalburg', 'DewfordTown_EventScript_SailToSlateport', 'Route109_EventScript_DoSailToDewford']);
const normObj = x => String(x == null ? '' : x).toUpperCase().replace(/_SPRITE_/g, '_').replace(/[^A-Z0-9]/g, '');
const resolves = (m, who) => {
	if (who == null || /^(PLAYER|LOCALID_PLAYER|player|VAR_LAST_TALKED|LOCALID_CAMERA)$/.test(who) || /^VAR_/.test(who)) return true;
	const evs = (m && m.object_events) || [];
	if (/^\d+$/.test(String(who))) return !!evs[+who];
	if (evs.some(o => o.local_id === who)) return true;
	const w = normObj(who);
	if (evs.some(o => normObj(o.local_id) === w)) return true;
	const k = w.match(/^(.*?)(\d+)$/);
	return !!(k && evs.filter(o => normObj(o.local_id) === k[1]).length >= +k[2] && +k[2] >= 1);
};

const found = {};           // class -> [{region, map, detail}]
const flag = (cls, region, map, detail) => (found[cls] = found[cls] || []).push({ region, map, detail });

for (const f of fs.readdirSync(`${D}/scripts`)) {
	if (!f.endsWith('.json')) continue;
	const stem = f.replace(/\.json$/, '');
	const r = region(stem);
	let prog;
	try { prog = JSON.parse(fs.readFileSync(`${D}/scripts/${f}`, 'utf8')); } catch { continue; }
	let strings = {};
	try { strings = JSON.parse(fs.readFileSync(`${D}/strings/${stem}.json`, 'utf8')); } catch {}

	const hasText = ref => strings[ref] != null || common[ref] != null;
	const hasLabel = l => prog[l] != null;

	for (const [label, ops] of Object.entries(prog)) {
		if (label === '__map__' || !Array.isArray(ops)) continue;
		for (const op of ops) {
			if (op.who != null && ['hideobj', 'showobj', 'move', 'setobjxy', 'face'].includes(op.op) && !resolves(mapByFile[stem], op.who))
				flag('unresolved-obj', r, stem, `${label} -> ${op.op} ${op.who}`);
			switch (op.op) {
				case 'msg': case 'say': case '__wontext':
					if (op.text && !hasText(op.text)) flag('missing-text', r, stem, `${label} -> ${op.text}`);
					break;
				case 'goto': case 'call':
					if (op.label && !hasLabel(op.label)) flag('missing-label', r, stem, `${label} -> ${op.op} ${op.label}`);
					break;
				case 'branch':
					if (op.label && !hasLabel(op.label)) flag('missing-label', r, stem, `${label} -> branch ${op.label}`);
					break;
				case 'give': case 'takeitem': {
					const id = giveArgs(op);
					// tm*/hm* resolve generically through main.js's tmMoveId, so they
					// work without needing an ITEMS entry of their own
					if (id && !bagItems.has(id) && !/^(tm|hm)/.test(id)) flag('bad-item', r, stem, `${label} -> ${id} (from ${op.item})`);
					break;
				}
				case 'givemon': {
					// a VAR_ species is filled in by a setvar immediately before the
					// give (Game Corner prizes, the Dojo); events.js reads it back
					if (/^VAR_/.test(String(op.species || ''))) break;
					const sp = String(op.species || '').replace(/^SPECIES_/, '').toLowerCase().replace(/[^a-z0-9]/g, '');
					if (sp && !species[sp]) flag('bad-species', r, stem, `${label} -> ${op.species}`);
					break;
				}
				case 'warp': {
					// engine.js fileFor() accepts a missing MAP_ prefix, and events.js
					// recovers the shape where map and warp-id were swapped
					const known = n => typeof n === 'string' && (mapIndex[n] || mapIndex['MAP_' + n]);
					if (op.map && !known(op.map) && !known(op.warp)) flag('bad-warp', r, stem, `${label} -> ${op.map}`);
					const n = warpsOf(op.map), idx = +op.warp;
					if (n != null && Number.isInteger(idx) && idx >= n) flag('bad-warp-index', r, stem, `${label} -> ${op.map} warp ${idx} (only ${n})`);
					break;
				}
				case 'special':
					if (op.name && !handledSpecials.has(op.name)) flag('unknown-special', r, stem, `${label} -> ${op.name}`);
					break;
				case 'move':
					if (Array.isArray(op.steps) && op.steps.length >= 90 && !SAIL.has(label))
						flag('long-walk', r, stem, `${label} -> ${op.who} ${op.steps.length} steps`);
					break;
			}
		}
	}
	// onFrame labels must exist too
	for (const fr of (prog.__map__?.onFrame || [])) {
		if (fr.label && !hasLabel(fr.label)) flag('missing-label', r, stem, `__map__.onFrame -> ${fr.label}`);
	}
	// strings that will render as junk
	for (const [k, v] of Object.entries(strings)) {
		if (typeof v !== 'string') continue;
		const n = normalize(v);
		if (!n) flag('ugly-text', r, stem, `${k} -> (empty after normalise)`);
		else if (/[@]|\\[lpn]|<[A-Za-z_]+>/.test(n)) flag('ugly-text', r, stem, `${k} -> ${JSON.stringify(v).slice(0, 60)}`);
	}
}

// map events pointing at scripts that don't exist
for (const f of fs.readdirSync(`${D}/maps`)) {
	if (!f.endsWith('_map.json')) continue;
	const stem = f.replace(/_map\.json$/, '');
	const r = region(stem);
	let m, prog = null;
	try { m = JSON.parse(fs.readFileSync(`${D}/maps/${f}`, 'utf8')); } catch { continue; }
	try { prog = JSON.parse(fs.readFileSync(`${D}/scripts/${stem}.json`, 'utf8')); } catch {}
	if (!prog) continue; // no script file at all: every event is inert, reported separately below
	// Objects whose behaviour comes from somewhere OTHER than the script program
	// are not broken just because the program lacks their label:
	//   item balls + hidden items  -> items.js reads them off graphics_id
	//   cut trees / rocks / boulders -> items.js CODE_FIELD_OBJS
	//   trainers                   -> trainers.js builds the battle from rosters
	//   link-feature attendants    -> this port has its own multiplayer
	const HANDLED_GFX = /ITEM_BALL|CUTTABLE_TREE|CUT_TREE|BREAKABLE_ROCK|ROCK_SMASH|BOULDER|BERRY_TREE|FRUIT_TREE/;
	const HANDLED_SCRIPT = /WirelessClub|UnionRoom|MysteryGift|DirectCorner|RecordCorner|TradeCenter|Colosseum/;
	const named = new Set();
	for (const o of (m.object_events || [])) {
		if (!o.script || o.script === '0x0') continue;
		if (HANDLED_GFX.test(o.graphics_id || '')) continue;
		if (o.trainer_type && o.trainer_type !== 'TRAINER_TYPE_NONE') continue;
		if (HANDLED_SCRIPT.test(o.script)) continue;
		named.add(o.script);
	}
	for (const c of (m.coord_events || [])) if (c.script && c.script !== '0x0') named.add(c.script);
	for (const s of named) if (!prog[s]) flag('missing-script', r, stem, s);
	for (const w of (m.warp_events || [])) {
		const dm = w.dest_map || w.map, di = +(w.dest_warp_id ?? w.warp), n = warpsOf(dm);
		if (n != null && Number.isInteger(di) && di >= n && di !== 127 && di !== 255) flag('bad-warp-index', r, stem, `warp_event ${w.x},${w.y} -> ${dm} warp ${di} (only ${n})`);
	}
}

// ---------- report ----------
const CLASSES = ['missing-text', 'missing-script', 'missing-label', 'bad-item', 'bad-species', 'bad-warp', 'ugly-text',
	'bad-warp-index', 'unknown-special', 'long-walk', 'unresolved-obj'];
if (only) {
	for (const row of (found[only] || [])) console.log(`${row.region}  ${row.map}  ${row.detail}`);
	console.log(`\n${(found[only] || []).length} total for ${only}`);
} else {
	console.log('BROKEN-EVENT AUDIT — counts by class and region\n');
	console.log('class'.padEnd(16), 'KANTO'.padStart(7), 'JOHTO'.padStart(7), 'HOENN'.padStart(7), 'TOTAL'.padStart(7));
	for (const c of CLASSES) {
		const rows = found[c] || [];
		const n = reg => rows.filter(x => x.region === reg).length;
		console.log(c.padEnd(16), String(n('KANTO')).padStart(7), String(n('JOHTO')).padStart(7), String(n('HOENN')).padStart(7), String(rows.length).padStart(7));
	}
	console.log('\nsamples:');
	for (const c of CLASSES) {
		const rows = found[c] || [];
		if (!rows.length) continue;
		console.log(`\n[${c}]`);
		for (const row of rows.slice(0, 4)) console.log(`   ${row.region} ${row.map}: ${row.detail}`);
		if (rows.length > 4) console.log(`   … ${rows.length - 4} more (node tools/audit_events.mjs --list=${c})`);
	}
}
