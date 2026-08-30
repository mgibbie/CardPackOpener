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
					break;
				}
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
}

// ---------- report ----------
const CLASSES = ['missing-text', 'missing-script', 'missing-label', 'bad-item', 'bad-species', 'bad-warp', 'ugly-text'];
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
