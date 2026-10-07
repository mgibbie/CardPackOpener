// gen_contest_emerald.mjs — the FAITHFUL Pokémon Contest data, harvested from
// pokeemerald into overworld/contest_emerald.json (tracked; the engine is
// overworld/contest_engine.js):
//
//   * moves: every gContestMoves entry — Emerald move number, category, effect
//     (name + number), combo starter id and the combo ids it finishes
//   * effects: gContestEffects in CONTEST_EFFECT_* order (type/appeal/jam) and
//     gComboStarterLookupTable
//   * opponents: all of gContestOpponents (rank, pools, moves, condition,
//     aiFlags, the postgame filter) — link-only ones stay out
//   * ai: data/contest_ai_scripts.s compiled to an op list + label table, for
//     the contest_ai.c interpreter port
//   * text: the contest strings (data/text/contest_strings.inc), the lobby and
//     hall script texts, and the src/strings.c names the screens use
//
//   node tools/gen_contest_emerald.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const EM = 'C:/Users/guide/Desktop/Magepunk66/Reference/pokeemerald';
const OUT = path.join(ROOT, 'overworld/contest_emerald.json');
const rd = p => fs.readFileSync(path.join(EM, p), 'utf8').replace(/\r/g, '');
const lc = s => s.toLowerCase().replace(/_/g, '');

// ---------- constants ----------
const defines = {};
for (const f of ['include/constants/global.h', 'include/constants/contest.h', 'include/constants/moves.h']) {
	for (const m of rd(f).matchAll(/^#define (\w+)\s+(\(?-?\w+\)?)\s*$/gm)) {
		const v = m[2].replace(/[()]/g, '');
		if (/^-?\d+$/.test(v)) defines[m[1]] = +v;
		else if (/^0x[0-9a-f]+$/i.test(v)) defines[m[1]] = parseInt(v, 16);
		else if (defines[v] != null) defines[m[1]] = defines[v];
	}
}
defines.CONTEST_NUM_APPEALS ??= 5;
defines.CONTEST_LAST_APPEAL = defines.CONTEST_NUM_APPEALS - 1;
Object.assign(defines, { TRUE: 1, FALSE: 0, MON_1: 0, MON_2: 1, MON_3: 2, MON_4: 3 });
const num = s => {
	s = String(s).trim();
	if (/^[-+]?\d+$/.test(s)) return +s;
	if (/^0x[0-9a-f]+$/i.test(s)) return parseInt(s, 16);
	if (defines[s] == null) throw new Error('unknown constant ' + s);
	return defines[s];
};
const CATS = ['cool', 'beauty', 'cute', 'smart', 'tough'];

// ---------- effects ----------
const movesSrc = rd('src/data/contest_moves.h');
const effectNames = Object.entries(defines).filter(([k]) => /^CONTEST_EFFECT_(?!TYPE_)/.test(k))
	.sort((a, b) => a[1] - b[1]).map(([k]) => k.replace('CONTEST_EFFECT_', ''));
const effects = [];
for (const m of movesSrc.matchAll(/\[CONTEST_EFFECT_(\w+)\] =\s*\{\s*\.effectType = (\w+),\s*\.appeal = (\d+),\s*\.jam = (\d+),/g)) {
	effects[num('CONTEST_EFFECT_' + m[1])] = { name: m[1], type: num(m[2]), appeal: +m[3], jam: +m[4] };
}
if (effects.filter(Boolean).length < 48) throw new Error('effects: ' + effects.length);
const lookup = movesSrc.slice(movesSrc.indexOf('gComboStarterLookupTable[]'));
const comboStarterLookup = [...lookup.slice(0, lookup.indexOf('};')).matchAll(/\b(TRUE|FALSE)\b/g)].map(x => x[1] === 'TRUE' ? 1 : 0);

// ---------- moves ----------
const moves = {};
const body = movesSrc.slice(0, movesSrc.indexOf('gContestEffects[]'));
for (const m of body.matchAll(/\[MOVE_(\w+)\] =\s*\{([^{}]*\{[^}]*\}[^{}]*)\}/g)) {
	const id = lc(m[1]), b = m[2];
	if (id === 'none') continue;
	const fx = b.match(/\.effect = (CONTEST_EFFECT_\w+)/)?.[1];
	const cat = b.match(/\.contestCategory = CONTEST_CATEGORY_(\w+)/)?.[1];
	if (!fx || !cat) continue;
	const starter = b.match(/\.comboStarterId = (\w+)/)?.[1] || '0';
	const combos = [...(b.match(/\.comboMoves = \{([^}]*)\}/)?.[1] || '').matchAll(/COMBO_STARTER_\w+/g)].map(x => num(x[0]));
	moves[id] = { num: num('MOVE_' + m[1]), cat: CATS.indexOf(cat.toLowerCase()), fx: num(fx), starter: num(starter), combos };
}
if (Object.keys(moves).length < 300) throw new Error('moves: ' + Object.keys(moves).length);

// ---------- opponents ----------
const knownSpecies = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_index.json'), 'utf8'))));
const oppSrc = rd('src/data/contest_opponents.h');
const aiSets = {};
const bit = Object.fromEntries(Object.entries(defines).filter(([k]) => /^CONTEST_AI_(CHECK|ERRATIC|DUMMY)/.test(k)));
// contest.h defines the bits as (1 << n): re-read them literally
for (const m of rd('include/constants/contest.h').matchAll(/^#define (CONTEST_AI_\w+)\s+\(1 << (\d+)\)/gm)) bit[m[1]] = 2 ** +m[2];
const orBits = s => s.replace(/\\\n/g, ' ').replace(/[()]/g, '').split('|').map(x => x.trim()).filter(Boolean)
	.reduce((a, x) => a + (bit[x] ?? aiSets[x] ?? (() => { throw new Error('ai bit ' + x); })()), 0);
const commonDef = rd('include/constants/contest.h').match(/#define CONTEST_AI_COMMON\s+([\s\S]*?)\n\n/)[1];
const aiCommon = orBits(commonDef);
aiSets.CONTEST_AI_COMMON = aiCommon;
for (const m of oppSrc.matchAll(/^#define (CONTEST_AI_SET_\w+)\s+\((.*)\)\s*$/gm)) aiSets[m[1]] = orBits(m[2]);
const filterSrc = oppSrc.slice(oppSrc.indexOf('gPostgameContestOpponentFilter[]'));
const filters = {};
for (const m of filterSrc.matchAll(/\[CONTEST_OPPONENT_(\w+)\] = CONTEST_FILTER_(\w+)/g)) filters[m[1]] = m[2];
const opponents = [];
const oppTable = oppSrc.slice(oppSrc.indexOf('gContestOpponents['), oppSrc.indexOf('gPostgameContestOpponentFilter[]'));
for (const m of oppTable.matchAll(/\[CONTEST_OPPONENT_(\w+)\] = \{(.*?)\.otId =/gs)) {
	const b = m[2];
	const rankName = b.match(/\.whichRank = CONTEST_RANK_(\w+)/)?.[1];
	if (!rankName || rankName === 'LINK') continue;
	const species = lc(b.match(/\.species = SPECIES_(\w+)/)[1]);
	if (!knownSpecies.has(species)) throw new Error('unknown species ' + species);
	opponents.push({
		key: m[1], species,
		nick: b.match(/\.nickname = _\("([^"]*)"\)/)[1],
		trainer: b.match(/\.trainerName = _\("([^"]*)"\)/)[1],
		gfx: b.match(/\.trainerGfxId = (\w+)/)?.[1] || null,
		ai: aiSets[b.match(/\.aiFlags = (\w+)/)[1]],
		rank: ['NORMAL', 'SUPER', 'HYPER', 'MASTER'].indexOf(rankName),
		pools: CATS.filter(c => new RegExp(`\\.aiPool_${c[0].toUpperCase() + c.slice(1)} = TRUE`).test(b)).map(c => CATS.indexOf(c)),
		moves: [...(b.match(/\.moves =\s*\{([^}]*)\}/s)[1]).matchAll(/MOVE_(\w+)/g)].map(x => lc(x[1])).map(x => x === 'none' ? null : x),
		cool: +b.match(/\.cool = (\d+)/)[1], beauty: +b.match(/\.beauty = (\d+)/)[1], cute: +b.match(/\.cute = (\d+)/)[1],
		smart: +b.match(/\.smart = (\d+)/)[1], tough: +b.match(/\.tough = (\d+)/)[1], sheen: +b.match(/\.sheen = (\d+)/)[1],
		filter: filters[m[1]] || 'NONE',
	});
}
if (opponents.length < 80) throw new Error('opponents: ' + opponents.length);
for (const o of opponents) for (const mv of o.moves) if (mv && !moves[mv]) throw new Error(`${o.key}: move ${mv} has no contest data`);

// ---------- AI scripts ----------
// macro -> [opcode name, arg kinds]; aliases resolve to their base command
const macros = {};
const macroSrc = rd('asm/macros/contest_ai_script.inc');
for (const m of macroSrc.matchAll(/\.macro (\w+)([^\n]*)\n([\s\S]*?)\.endm/g)) macros[m[1]] = { params: m[2].split(',').map(s => s.trim().replace(/:req$/, '')).filter(Boolean), body: m[3].trim() };
const aiSrc = rd('data/contest_ai_scripts.s');
const code = [];
const labels = {};
const tableStart = aiSrc.indexOf('gContestAI_ScriptsTable::');
const table = [...aiSrc.slice(tableStart, aiSrc.indexOf('\n\n', tableStart)).matchAll(/\.4byte (\w+)/g)].map(x => x[1]);
function emit(name, args) {
	const mac = macros[name];
	if (!mac) throw new Error('unknown ai macro ' + name);
	const firstLine = mac.body.split('\n')[0].trim();
	if (!firstLine.startsWith('.byte')) {
		// an alias: `if_last_appeal dest` -> `if_appeal_num_eq CONTEST_LAST_APPEAL, dest`
		const sub = mac.params.reduce((s, p, i) => s.split('\\' + p).join(args[i]), firstLine);
		const [n2, ...rest] = sub.split(/\s+/);
		return emit(n2, rest.join(' ').split(',').map(s => s.trim()).filter(Boolean));
	}
	code.push([name, ...args.map(a => /^AI_/.test(a) ? '@' + a : num(a))]);
}
const aiBody = aiSrc.slice(aiSrc.indexOf('\n', aiSrc.indexOf('.4byte AI_Nothing', tableStart) + 1));
// the retail build: BUGFIX is not defined, so #ifdef BUGFIX keeps its #else side
let skipping = false;
for (let line of aiBody.split('\n')) {
	line = line.replace(/@.*$/, '').trim();
	if (line.startsWith('#ifdef BUGFIX')) { skipping = true; continue; }
	if (line.startsWith('#else')) { skipping = false; continue; }
	if (line.startsWith('#endif')) { skipping = false; continue; }
	if (skipping) continue;
	if (!line || line.startsWith('.') || line.startsWith('enum')) continue;
	const lab = line.match(/^(\w+)::?$/);
	if (lab) { labels[lab[1]] = code.length; continue; }
	const [name, ...rest] = line.split(/\s+/);
	emit(name, rest.join(' ').split(',').map(s => s.trim()).filter(Boolean));
}
for (const op of code) for (const a of op.slice(1)) if (typeof a === 'string' && labels[a.slice(1)] == null) throw new Error('ai label ' + a);
const ai = { table: table.map(l => labels[l]), code: code.map(op => op.map((a, i) => (i && typeof a === 'string') ? labels[a.slice(1)] : a)) };

// ---------- text ----------
function parseStrings(src) {
	const out = {};
	const re = /^(\w+)::?\s*\n((?:\s*\.string\s+"(?:[^"\\]|\\.)*"\s*\n?)+)/gm;
	for (const m of src.matchAll(re)) {
		let s = [...m[2].matchAll(/\.string\s+"((?:[^"\\]|\\.)*)"/g)].map(x => x[1]).join('');
		out[m[1]] = cleanText(s);
	}
	return out;
}
function cleanText(s) {
	return s.replace(/\$$/, '')
		.replace(/\\p/g, '\f').replace(/\\[nl]/g, '\n')
		.replace(/\{(PAUSE|COLOR|SHADOW|FONT|PAUSE_UNTIL_PRESS|PLAY_SE|HIGHLIGHT|COLOR_HIGHLIGHT_SHADOW|CLEAR|CLEAR_TO|SKIP|MIN_LETTER_SPACING|TEXT_COLORS|RESET_FONT|SIZE)[^}]*\}/g, '')
		.replace(/\{POKEBLOCK\}/g, 'POKéBLOCK').replace(/\{PKMN\}/g, 'PKMN').replace(/\{LV\}/g, 'Lv');
}
const text = {
	...parseStrings(rd('data/text/contest_strings.inc')),
	...parseStrings(rd('data/scripts/contest_hall.inc')),
	...parseStrings(rd('data/maps/LilycoveCity_ContestLobby/scripts.inc')),
};
const stringsC = rd('src/strings.c');
const WANT = /^gText_(Contest_\w+|CoolMove|BeautyMove|CuteMove|SmartMove|ToughMove|3QuestionMarks|Enter2|Info2|Exit|WhatsAContest|TypesOfContests|Ranks|Cancel2|CoolnessContest|BeautyContest|CutenessContest|SmartnessContest|ToughnessContest|NormalRank|SuperRank|HyperRank|MasterRank|AppealNumWhichMoveWillBeUsed|AppealNumButItCantParticipate|Coolness|Beauty|Cuteness|Smartness|Toughness)$/;
for (const m of stringsC.matchAll(/^const u8 (gText_\w+)\[\] = _\("((?:[^"\\]|\\.)*)"\);/gm)) if (WANT.test(m[1])) text[m[1]] = cleanText(m[2]);
// the numbered string tables the engine indexes
const tables = rd('src/data/contest_text_tables.h');
const tableOf = name => {
	const i = tables.indexOf(`${name}[] =`);
	const blk = tables.slice(i, tables.indexOf('};', i));
	return [...blk.matchAll(/(?:\[(\w+)\]\s*=\s*)?(gText_\w+)/g)].map(x => x[2]);
};
const appealResults = {};
{
	const i = tables.indexOf('sAppealResultTexts[] =');
	const blk = tables.slice(i, tables.indexOf('};', i));
	for (const m of blk.matchAll(/\[CONTEST_STRING_(\w+)\]\s*=\s*(gText_\w+)/g)) appealResults[m[1]] = m[2];
}
const effectDescs = tableOf('gContestEffectDescriptionPointers');
const roundResults = tableOf('sRoundResultTexts');
const used = [...Object.values(appealResults), ...effectDescs, ...roundResults];
for (const n of used) if (text[n] == null) throw new Error('missing text ' + n);

const out = {
	generated: 'tools/gen_contest_emerald.mjs',
	categories: CATS,
	effects, effectNames, comboStarterLookup, moves, opponents, ai,
	text, appealResults, effectDescs, roundResults,
};
fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`contest_emerald.json: ${Object.keys(moves).length} moves, ${effects.length} effects, ${opponents.length} opponents, ${code.length} ai ops, ${Object.keys(text).length} texts`);
