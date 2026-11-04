// gen_phone_data.mjs — the PHONE's contacts, texts, scripts and rematch teams,
// read from the three decomps (Magepunk66/Reference/{pokecrystal,pokeemerald,pokefirered}).
//
// JOHTO (Crystal): the 28 PHONE_* trainers of data/phone/phone_contacts.asm —
//   their number-ask / rematch / gift continuation (the trainer header's
//   .Script, which the map transpile flattened into stubs: askforphonenumber,
//   checkcellnum, loadmem and every `jumpstd` phone line were dropped) is
//   re-converted from maps/*.asm; every line of data/phone/text/<name>_*.asm;
//   their rematch/gift flags; and the rematch parties (LASS_DANA2..) that the
//   roster import never had.
// HOENN (Emerald): gRematchTable (src/battle_setup.c), Gym Leaders excluded —
//   the Match Call trainers, their tiered teams and their map-script label.
// KANTO (FireRed): sRematches (src/vs_seeker.c) — FireRed has no phone; these
//   are the trainers the VS SEEKER rematches, and they offer their number here.
//
//   node tools/gen_phone_data.mjs  ->  overworld/phone_data.json
import fs from 'fs';
import path from 'path';

const REF = path.resolve('..', 'Magepunk66', 'Reference');
const PC = path.join(REF, 'pokecrystal'), PE = path.join(REF, 'pokeemerald'), PF = path.join(REF, 'pokefirered');
const read = p => fs.readFileSync(p, 'utf8');
const DATA = path.resolve('overworld', 'data');
const species = JSON.parse(read(path.join(DATA, 'species_battle.json')));
const trainerTeams = JSON.parse(read(path.join(DATA, 'trainer_teams.json')));
const scriptsOf = stem => { try { return JSON.parse(read(path.join(DATA, 'scripts', stem + '.json'))); } catch (e) { return null; } };
const mapExists = stem => fs.existsSync(path.join(DATA, 'maps', stem + '_map.json'));
const warn = [];

// "ROUTE_38" / "OLIVINE_LIGHTHOUSE_2F" -> "Route38" / "OlivineLighthouse2F"
const camel = c => c.toLowerCase().split('_').map(w => w ? w[0].toUpperCase() + w.slice(1) : '').join('');
const speciesId = s => {
	const k = s.toLowerCase().replace(/[^a-z0-9]/g, '');
	return species[k] ? k : null;
};
const human = s => s.replace(/_/g, ' ').replace(/\b(\d+)F\b/, '$1F');

// ---------- Crystal text: text/line/cont/para/done -> "\n" / "\n\n" ----------
function crystalTexts(file) {
	const out = {};
	if (!fs.existsSync(file)) return out;
	let label = null, buf = '';
	const flush = () => {
		// Crystal's <PLAYER>/<PLAY_G>/<RIVAL> -> the engine's {PLAYER}/{RIVAL}
		if (label) out[label] = buf.replace(/<PLAY_G>|<PLAYER>/g, '{PLAYER}').replace(/<RIVAL>/g, '{RIVAL}').replace(/\n{3,}/g, '\n\n').trim();
		label = null; buf = '';
	};
	for (const raw of read(file).split(/\r?\n/)) {
		const line = raw.replace(/;.*$/, '');
		const lab = line.match(/^([A-Za-z_]\w*):/);
		if (lab) { flush(); label = lab[1]; continue; }
		const m = line.match(/^\s+(text|line|cont|para|next)\s+"(.*)"\s*$/);
		if (m) {
			const t = m[2].replace(/@$/, '');
			if (m[1] === 'text') buf += t;
			else if (m[1] === 'para') buf += '\n\n' + t;
			else buf += '\n' + t;
			continue;
		}
		const r = line.match(/^\s+text_ram\s+(\w+)/);
		if (r) { buf += r[1] === 'wStringBuffer3' ? '{NAME}' : r[1] === 'wStringBuffer4' ? '{MON}' : r[1] === 'wStringBuffer5' ? '{PLACE}' : r[1] === 'wPlayerName' ? '<PLAYER>' : ''; continue; }
		if (/^\s+text_start/.test(line)) { buf += '\n'; continue; }
	}
	flush();
	return out;
}

// ---------- Crystal parties: class groups by constant index ----------
function crystalParties() {
	const consts = {};   // CLASS -> [ids in order]
	let cls = null;
	for (const raw of read(path.join(PC, 'constants', 'trainer_constants.asm')).split(/\r?\n/)) {
		const line = raw.replace(/;.*$/, '');
		const tc = line.match(/^\s*trainerclass\s+(\w+)/);
		if (tc) { cls = tc[1]; consts[cls] = []; continue; }
		const c = line.match(/^\s*const\s+(\w+)/);
		if (c && cls) consts[cls].push(c[1]);
	}
	const parties = {};  // CLASS -> [ [ {l, s} ] ]
	let group = null, cur = null;
	// TrainerGroups lists one group per trainer class, in class order (class 0,
	// TRAINER_NONE, has no entry)
	const classes = Object.keys(consts).filter(c => c !== 'TRAINER_NONE');
	const groupClass = {};
	let gi = 0;
	for (const raw of read(path.join(PC, 'data', 'trainers', 'party_pointers.asm')).split(/\r?\n/)) {
		const m = raw.match(/^\s*dw\s+(\w+Group)/);
		if (m) groupClass[m[1]] = classes[gi++];
	}
	for (const raw of read(path.join(PC, 'data', 'trainers', 'parties.asm')).split(/\r?\n/)) {
		const line = raw.replace(/;.*$/, '');
		const g = line.match(/^(\w+Group):/);
		if (g) { group = groupClass[g[1]] || null; if (group) parties[group] = []; continue; }
		if (!group) continue;
		if (/^\s*db\s+"/.test(line)) { cur = []; parties[group].push(cur); continue; }
		if (/^\s*db\s+-1/.test(line)) { cur = null; continue; }
		const mon = line.match(/^\s*db\s+(\d+),\s*(\w+)/);
		if (mon && cur) cur.push({ l: +mon[1], s: mon[2] });
	}
	return { consts, parties };
}

// ---------- Crystal script (a trainer header's .Script) -> engine ops ----------
const STD_ASK = /^(AskNumber1|AskNumber2|NumberAccepted|NumberDeclined|PhoneFull|RematchGift|Rematch|Gift|PackFull)[MF]Script$/;
function convertScript(lines, parent, ctx) {
	const blocks = {};   // label -> ops
	let cur = parent, ops = (blocks[parent] = []);
	let pending = null;
	const lab = l => l.startsWith('.') ? `${parent}${l}` : l;
	const cond = (state) => {
		if (!pending) return null;
		if (pending.flag) return { flag: pending.flag, state };
		return { var: pending.var, cmp: 'eq', value: state ? 1 : 0 };
	};
	for (const raw of lines) {
		const line = raw.replace(/;.*$/, '').trimEnd();
		if (!line.trim()) continue;
		const local = line.match(/^(\.\w+):?\s*$/);
		if (local) { cur = lab(local[1]); ops = blocks[cur] = blocks[cur] || []; continue; }
		const [cmd, ...rest] = line.trim().split(/\s+/);
		const args = rest.join(' ').split(',').map(s => s.trim()).filter(Boolean);
		switch (cmd) {
			case 'loadvar': case 'endifjustbattled': case 'opentext': case 'closetext': case 'waitbutton': case 'promptbutton':
			case 'gettrainername': case 'winlosstext': case 'reloadmapafterbattle': case 'startbattle':
				break;
			case 'checkflag': case 'checkevent': pending = { flag: args[0] }; break;
			case 'checkcellnum': ops.push({ op: 'special', name: 'PhoneHasContact', contact: ctx.id, store: 'VAR_RESULT' }); pending = { var: 'VAR_RESULT' }; break;
			case 'checkpoke': ops.push({ op: 'special', name: 'PhoneHasMon', species: (speciesId(args[0]) || args[0]), store: 'VAR_RESULT' }); pending = { var: 'VAR_RESULT' }; break;
			case 'checktime': ops.push({ op: 'setvar', var: 'VAR_RESULT', value: 0 }); pending = { var: 'VAR_RESULT' }; break;
			case 'readmem': pending = { mem: args[0] }; break;
			case 'readvar': pending = { mem: args[0] }; break;
			case 'iftrue': case 'iffalse': {
				const c = cond(cmd === 'iftrue');
				if (c) ops.push({ op: 'branch', kind: 'goto', cond: c, label: lab(args[0]) });
				break;
			}
			case 'ifequal': case 'ifnotequal': {
				if (!pending) break;
				const v = args[0];
				const val = v === 'PHONE_CONTACTS_FULL' ? 1 : v === 'PHONE_CONTACT_REFUSED' ? 2 : /^\d+$/.test(v) ? +v : v;
				const variable = pending.mem || pending.var || 'VAR_RESULT';
				ops.push({ op: 'branch', kind: 'goto', cond: { var: variable, cmp: cmd === 'ifequal' ? 'eq' : 'ne', value: val }, label: lab(args[1]) });
				break;
			}
			case 'askforphonenumber': ops.push({ op: 'special', name: 'PhoneAskNumber', contact: ctx.id, store: 'VAR_RESULT' }); pending = { var: 'VAR_RESULT' }; break;
			case 'writetext': ops.push({ op: 'msg', text: args[0] }); break;
			case 'jumpstd': {
				const m = args[0].match(STD_ASK);
				if (m) { const t = ctx.texts[`${ctx.Name}${m[1]}Text`]; if (t) ops.push({ op: 'msg', text: ctx.fill(t) }); else warn.push(`${ctx.id}: no ${ctx.Name}${m[1]}Text`); }
				else if (/^RegisteredNumber[MF]Script$/.test(args[0])) ops.push({ op: 'msg', text: ctx.fill(ctx.registered) });
				else warn.push(`${ctx.id}: jumpstd ${args[0]}`);
				break;
			}
			case 'scall': ops.push({ op: 'call', label: lab(args[0]) }); break;
			case 'sjump': ops.push({ op: 'goto', label: lab(args[0]) }); break;
			case 'loadtrainer': ops.push({ op: 'trainerbattle', args: [`${args[0]}_${args[1]}`] }); ctx.teams.add(`${args[0]}|${args[1]}`); break;
			case 'loadmem': ops.push({ op: 'setvar', var: args[0], value: +args[1] }); break;
			case 'setevent': case 'setflag': ops.push({ op: 'setflag', flag: args[0] }); break;
			case 'clearevent': case 'clearflag': ops.push({ op: 'clearflag', flag: args[0] }); break;
			case 'verbosegiveitem': ops.push({ op: 'special', name: 'PhoneGiveItem', item: args[0], store: 'VAR_RESULT' }); pending = { var: 'VAR_RESULT' }; ctx.giftItem = args[0]; break;
			case 'special': ops.push({ op: 'special', name: args[0] }); break;
			case 'end': ops.push({ op: 'end' }); break;
			default: warn.push(`${ctx.id}: unhandled ${cmd}`);
		}
	}
	// Crystal's `end` inside an `scall`ed label RETURNS to the caller (the stack
	// is not empty); this engine's `end` finishes the whole script. `.AskNumber1F`
	// (a line, then end) must hand back to the yes/no that follows it.
	const called = new Set(Object.values(blocks).flat().filter(o => o.op === 'call').map(o => o.label));
	for (const l of called) if (blocks[l]) blocks[l] = blocks[l].map(o => o.op === 'end' ? { op: 'return' } : o);
	// asm FALLS THROUGH from one local label into the next (.Fight1's flypoint
	// check drops into .LoadFight0); separate blocks must say so explicitly
	const order = Object.keys(blocks);
	order.forEach((l, i) => {
		const last = blocks[l][blocks[l].length - 1];
		if (i + 1 < order.length && !(last && (last.op === 'end' || last.op === 'goto' || last.op === 'return'))) blocks[l].push({ op: 'goto', label: order[i + 1] });
	});
	return blocks;
}

// ================= JOHTO =================
const johto = [];
const scriptOverrides = {};   // map stem -> { label: ops }
const teams = {};
{
	const { consts, parties } = crystalParties();
	const registered = crystalTexts(path.join(PC, 'data', 'text', 'std_text.asm')).RegisteredNumber1Text || '<PLAYER> registered\n{NAME}\'s number.';
	const rows = [...read(path.join(PC, 'data', 'phone', 'phone_contacts.asm')).matchAll(/^\tphone (\w+),\s*(\w+),\s*(\w+),/mg)]
		.filter(m => m[1] !== 'TRAINER_NONE').map(m => ({ cls: m[1], tid: m[2], mapConst: m[3] }));
	const mapFiles = fs.readdirSync(path.join(PC, 'maps')).filter(f => f.endsWith('.asm'));
	for (const row of rows) {
		const Name = camel(row.tid.replace(/\d+$/, ''));
		const low = Name.toLowerCase();
		const texts = { ...crystalTexts(path.join(PC, 'data', 'phone', 'text', `${low}_overworld.asm`)), ...crystalTexts(path.join(PC, 'data', 'phone', 'text', `${low}_callee.asm`)), ...crystalTexts(path.join(PC, 'data', 'phone', 'text', `${low}_caller.asm`)) };
		// the trainer header + its .Script, from whichever map defines it
		let label = null, stem = null, body = null;
		for (const f of mapFiles) {
			const lines = read(path.join(PC, 'maps', f)).split(/\r?\n/);
			// match on the NAME: the phone table says PARRY1, his header is PARRY3
			const i = lines.findIndex(l => new RegExp(`^\\ttrainer ${row.cls}, ${row.tid.replace(/\d+$/, '')}\\d*,`).test(l));
			if (i < 0) continue;
			label = lines[i - 1].replace(/:.*$/, '').trim();
			stem = f.replace(/\.asm$/, '');
			const start = lines.findIndex((l, j) => j > i && /^\.Script:?\s*$/.test(l));
			let end = lines.findIndex((l, j) => j > start && /^[A-Za-z]\w*:/.test(l));
			if (end < 0) end = lines.length;
			body = lines.slice(start + 1, end);
			break;
		}
		if (!label) { warn.push(`JOHTO ${row.cls} ${row.tid}: no trainer header`); continue; }
		const ourStem = mapExists(stem) ? stem : mapExists('JohKanto' + stem) ? 'JohKanto' + stem : null;
		if (!ourStem) { warn.push(`${label}: no map ${stem}`); continue; }
		// landmark + flags from the phone engine script
		const ps = fs.existsSync(path.join(PC, 'engine', 'phone', 'scripts', `${low}.asm`)) ? read(path.join(PC, 'engine', 'phone', 'scripts', `${low}.asm`)) : '';
		const landmark = (ps.match(/getlandmarkname STRING_BUFFER_5, LANDMARK_(\w+)/) || [])[1];
		const place = landmark ? human(landmark) : human(row.mapConst);
		const readyFlag = (ps.match(/ENGINE_\w+_READY_FOR_REMATCH/) || body.join('\n').match(/ENGINE_\w+_READY_FOR_REMATCH/) || [])[0] || null;
		const giftFlag = (body.join('\n').match(/checkflag (ENGINE_\w+_HAS_\w+)/) || [])[1] || null;
		const gender = /AskNumber1FScript/.test(body.join('\n')) ? 'F' : 'M';
		const firstTeam = (parties[row.cls] || [])[(consts[row.cls] || []).indexOf(row.tid)] || [];
		const monName = firstTeam[0] ? (species[speciesId(firstTeam[0].s)]?.name || firstTeam[0].s).toUpperCase() : 'POKeMON';
		const NAME = row.tid.replace(/\d+$/, '');
		const fill = t => t.replace(/\{NAME\}/g, NAME).replace(/\{PLACE\}/g, place).replace(/\{MON\}/g, monName);
		const ctx = { id: 'JOHTO:' + NAME, Name, texts, fill, registered, teams: new Set(), giftItem: null };
		const blocks = convertScript(body, label, ctx);
		(scriptOverrides[ourStem] = scriptOverrides[ourStem] || {});
		Object.assign(scriptOverrides[ourStem], blocks);
		// the rematch parties the script loads
		for (const key of ctx.teams) {
			const [cls, tid] = key.split('|');
			const idx = (consts[cls] || []).indexOf(tid);
			const party = (parties[cls] || [])[idx];
			if (!party) { warn.push(`${cls} ${tid}: no party`); continue; }
			const mapped = party.map(m => ({ s: speciesId(m.s), l: m.l })).filter(m => m.s);
			if (mapped.length !== party.length) warn.push(`${cls}_${tid}: unmapped species ${party.map(m => m.s).join(',')}`);
			teams[`${cls}_${tid}`] = { class: camel(cls).replace(/([a-z])([A-Z])/g, '$1 $2'), party: mapped };
		}
		const pick = re => Object.keys(texts).filter(k => re.test(k)).map(k => fill(texts[k]));
		johto.push({
			id: NAME, region: 'JOHTO', name: NAME, cls: camel(row.cls).replace(/([a-z])([A-Z])/g, '$1 $2').toUpperCase(), gender,
			map: ourStem, label, place, readyFlag, giftFlag, giftItem: ctx.giftItem,
			texts: {
				answer: fill(texts[`${Name}AnswerPhoneText`] || ''), greet: fill(texts[`${Name}GreetText`] || ''),
				generic: fill(texts[`${Name}GenericText`] || ''),
				wantsBattle: fill(texts[`${Name}BattleRematchText`] || texts[`${Name}WantsBattleText`] || ''),
				reminder: fill(texts[`${Name}ReminderText`] || ''), foundItem: fill(texts[`${Name}FoundItemText`] || ''),
				comePickUp: fill(texts[`${Name}ComePickUpText`] || ''), hangUp: fill(texts[`${Name}HangUpText`] || ''),
				chat: pick(new RegExp(`^${Name}(Defeated|Lost|Taking|Found(?!Item)|Bragging|Gossip)\\w*Text$`)),
			},
		});
	}
}

// label -> trainer id from a decomp's scripts, and map id -> stem from map.json
function decompIndex(root) {
	const byTrainer = {}, stemOf = {}, registerLabels = {};
	const files = [path.join(root, 'data', 'scripts', 'trainers.inc')];
	for (const d of fs.readdirSync(path.join(root, 'data', 'maps'))) {
		const mj = path.join(root, 'data', 'maps', d, 'map.json');
		if (fs.existsSync(mj)) { try { stemOf[JSON.parse(read(mj)).id.replace(/^MAP_/, '')] = d; } catch (e) {} }
		files.push(path.join(root, 'data', 'maps', d, 'scripts.inc'));
	}
	for (const f of files) {
		if (!fs.existsSync(f)) continue;
		let label = null;
		for (const line of read(f).split(/\r?\n/)) {
			const l = line.match(/^(\w+)::/);
			if (l) { label = l[1]; continue; }
			const t = line.match(/^\s*trainerbattle_(\w+)\s+(TRAINER_\w+)/);
			if (t && label && t[1] !== 'rematch' && t[1] !== 'rematch_double' && !byTrainer[t[2]]) byTrainer[t[2]] = label;
			// Emerald's `register_matchcall TRAINER_X` — the transpile dropped it
			const r = line.match(/^\s*register_matchcall\s+(TRAINER_\w+)/);
			if (r && label) (registerLabels[r[1]] = registerLabels[r[1]] || []).push(label);
		}
	}
	return { byTrainer, stemOf, registerLabels };
}
// a trainer's label on our map(s): the stem and its Hoenn2_ copy, where that
// map really has an object running the label
let _objIndex = null;   // label -> [stems], every map (the fallback)
function objectsWith(stem, label) {
	const out = {};
	for (const s of [stem, 'Hoenn2_' + stem]) {
		if (!mapExists(s)) continue;
		const m = JSON.parse(read(path.join(DATA, 'maps', s + '_map.json')));
		if ((m.object_events || []).some(o => o.script === label)) out[s] = label;
	}
	if (Object.keys(out).length) return out;
	// the rematch table names a neighbouring section (Route21_North for the
	// Route21_South swimmers): find the map that really holds the object
	if (!_objIndex) {
		_objIndex = {};
		for (const f of fs.readdirSync(path.join(DATA, 'maps')).filter(f => f.endsWith('_map.json'))) {
			try { for (const o of JSON.parse(read(path.join(DATA, 'maps', f))).object_events || []) (_objIndex[o.script] = _objIndex[o.script] || []).push(f.replace(/_map\.json$/, '')); } catch (e) {}
		}
	}
	for (const s of _objIndex[label] || []) out[s] = label;
	return out;
}

// ================= HOENN =================
const hoenn = [];
{
	const LEADERS = /^(ROXANNE|BRAWLY|WATTSON|FLANNERY|NORMAN|WINONA|TATE_AND_LIZA|JUAN|SIDNEY|PHOEBE|GLACIA|DRAKE|WALLACE|WALLY_VR)$/;
	const { byTrainer, stemOf, registerLabels } = decompIndex(PE);
	const src = read(path.join(PE, 'src', 'battle_setup.c'));
	const table = src.slice(src.indexOf('gRematchTable[REMATCH_TABLE_ENTRIES] ='));
	for (const m of table.matchAll(/\[REMATCH_(\w+)\]\s*=\s*REMATCH\(([^)]*)\)/g)) {
		if (LEADERS.test(m[1])) continue;
		const parts = m[2].split(',').map(s => s.trim());
		const mapConst = parts.pop().replace(/^MAP_/, '');
		const ids = parts.map(p => p.replace(/^TRAINER_/, ''));
		const label = byTrainer['TRAINER_' + ids[0]];
		const stem = stemOf[mapConst];
		const labels = label && stem ? objectsWith(stem, label) : {};
		if (!Object.keys(labels).length) { warn.push(`HOENN ${m[1]}: no object for ${label} on ${stem || mapConst}`); continue; }
		const team = trainerTeams[ids[0]];
		hoenn.push({
			id: m[1], region: 'HOENN', name: m[1].replace(/_/g, ' '), cls: (team?.class || 'TRAINER').toUpperCase(),
			maps: Object.keys(labels), labels, textBase: label.replace('_EventScript_', '_Text_'),
			place: human(mapConst.replace(/(\D)(\d)/, '$1 $2')),
			// every tier after the first battle's team, in order
			rematchTeams: ids.slice(1).filter(id => trainerTeams[id]),
		});
		// put the dropped register_matchcall back: a PhoneRegister special right
		// before the label's release/end, on every copy of the map
		const key = 'HOENN:' + m[1];
		for (const regLabel of registerLabels['TRAINER_' + ids[0]] || []) {
			for (const s2 of Object.keys(labels)) {
				const ops = (scriptsOf(s2) || {})[regLabel];
				if (!Array.isArray(ops)) { warn.push(`HOENN ${m[1]}: no ${regLabel} on ${s2}`); continue; }
				const copy = JSON.parse(JSON.stringify(ops));
				const at = copy.findIndex(o => o.op === 'release' || o.op === 'end');
				copy.splice(at < 0 ? copy.length : at, 0, { op: 'special', name: 'PhoneRegister', contact: key });
				(scriptOverrides[s2] = scriptOverrides[s2] || {})[regLabel] = copy;
			}
		}
	}
}

// ================= KANTO =================
const kanto = [];
{
	const { byTrainer, stemOf } = decompIndex(PF);
	const src = read(path.join(PF, 'src', 'vs_seeker.c'));
	const body = src.slice(src.indexOf('sRematches[] = {') + 'sRematches[] = {'.length);
	for (const m of body.matchAll(/\{\s*\{([^}]*)\},\s*MAP\(MAP_(\w+)\)\s*\}/g)) {
		const ids = [...new Set(m[1].split(',').map(s => s.replace(/[{}\s]/g, '')).filter(s => s && s !== 'SKIP').map(s => s.replace(/^TRAINER_/, '')))];
		const label = byTrainer['TRAINER_' + ids[0]];
		const stem = stemOf[m[2]];
		const labels = label && stem ? objectsWith(stem, label) : {};
		if (!Object.keys(labels).length) { warn.push(`KANTO ${ids[0]}: no object for ${label} on ${stem || m[2]}`); continue; }
		const team = trainerTeams[ids[0]];
		const name = ids[0].split('_').slice(-1)[0].replace(/\d+$/, '') || ids[0];
		kanto.push({
			id: ids[0], region: 'KANTO', name, cls: (team?.class || ids[0].split('_').slice(0, -1).join(' ')).toUpperCase(),
			maps: Object.keys(labels), labels, textBase: label.replace('_EventScript_', '_Text_'),
			place: human(m[2].replace(/(\D)(\d)/, '$1 $2')),
			rematchTeams: ids.slice(1).filter(id => trainerTeams[id]),
		});
	}
}

const out = { generated: 'tools/gen_phone_data.mjs', johto, hoenn, kanto, scriptOverrides, teams };
fs.writeFileSync(path.resolve('overworld', 'phone_data.json'), JSON.stringify(out));
console.log(`JOHTO ${johto.length} contacts, ${Object.keys(teams).length} rematch teams, overrides on ${Object.keys(scriptOverrides).length} maps`);
console.log(`HOENN ${hoenn.length} Match Call trainers; KANTO ${kanto.length} VS Seeker trainers`);
console.log(`${(fs.statSync(path.resolve('overworld', 'phone_data.json')).size / 1024).toFixed(0)} KB`);
if (warn.length) { console.log(`${warn.length} warnings:`); for (const w of warn.slice(0, 40)) console.log('  ' + w); }
