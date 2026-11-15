// gen_fakemon_evos.mjs — evolution data for the URANIUM and RADICAL RANSEI fakemon, which the imports left out
// (species_extra.json has evolutions for the official species and 38 CAP ones only).
// The owner, 2026-11-15: "look online for evolution data for the uranium fakemon as well".
//
// Sources (both on the owner's machine; this tool only runs there, its output is committed):
//   Uranium  the Pokémon Uranium wiki's species pages, as cached by Magepunk66/tools/source_uranium_moves.py
//            (Desktop/Magepunk66/wiki/uranium_cache/<id>.json: the page's wikitext; "It evolves into [[X]] starting at level N.")
//   Ransei   Radical Ransei's own PBS/pokemon.txt (Evolutions=TARGET,Method,Param,…)
// Writes overworld/fakemon_evos.js: FAKEMON_EVOS = { <species>: [{ type, param, target, time?, was? }] } in the game's
// own shape (evolution.js: 'level' | 'item' | 'friendship', optional time 'day' | 'night').
//
// The game has three ways to evolve; the sources have more. What becomes what (as the official species were done):
//   at a level (also: only by day/night -> time; only if female, in rain, …)       -> level
//   a stone or other item the game has                                             -> item
//   high friendship                                                                -> friendship 220
//   traded                                                                         -> item linkingcord   (as Kadabra)
//   traded holding an item / levelled holding an item at night                     -> that item          (as Onix)
//   levelled while knowing a move                                                  -> level: when it learns that move
//   an item the game does not have, a place, a party member                        -> level: FALLBACK below
// Everything that is not the source's own method carries  was: '<the source's words>'  so the owner's page can show it.
//   node tools/gen_fakemon_evos.mjs      (URANIUM_CACHE=<dir> ESSENTIALS_ROOT=<dir> to point elsewhere)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UR = process.env.URANIUM_CACHE || 'C:/Users/guide/Desktop/Magepunk66/wiki/uranium_cache';
const RANSEI = path.join(process.env.ESSENTIALS_ROOT || 'C:/Users/guide/Desktop/Projects/Programming', 'RPGMaker Archive from Old Comp', 'Radical Ransei', 'PBS', 'pokemon.txt');
const FALLBACK = 36;   // (the level for a method the game cannot do and that names no level)
const SP = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
const EX = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_extra.json'), 'utf8'));
const bag = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
const hasItem = (id) => new RegExp('\\b' + id + '\\b').test(bag);
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const byName = {}; for (const [id, s] of Object.entries(SP)) { byName[norm(s.name)] = byName[norm(s.name)] || id; byName[norm(id)] = byName[norm(id)] || id; }
const learnsAt = (id, move) => { const m = (SP[id].learnset || []).find((l) => norm(l[1]) === norm(move)); return m ? Math.max(2, m[0]) : null; };
const out = {}, notes = [], chain = [];
const put = (id, e) => { if (!SP[e.target]) { notes.push(`${id}: its evolution "${e.target}" is not in the game — left out`); return; } (out[id] = out[id] || []).push(e); };

// ---------- Uranium ----------
const uranium = Object.keys(SP).filter((id) => SP[id].num <= -100 && SP[id].num >= -265);
const seg = (id, text, lastLevel) => {   // one "[[Target]] <how>" piece -> an evo entry
	const t = /\[\[([^\]|]+)/.exec(text); if (!t) return null;
	const target = byName[norm(t[1])] || norm(t[1]), how = text.slice(t.index + t[0].length + 2).trim().replace(/\.$/, '');
	let m;
	// (knowing a move first: its sentence also says "learned at level N")
	if ((m = /knowing \[\[([^\]]+)\]\](?:, learned at level (\d+))?/.exec(how))) { const lv = +m[2] || learnsAt(id, m[1]) || FALLBACK; return { type: 'level', param: lv, target, was: 'levelled up knowing ' + m[1] }; }
	if ((m = /(?:starting (?:at|from)|at) level (\d+)/.exec(how))) return { type: 'level', param: +m[1], target };
	if (/friendship/i.test(how)) return { type: 'friendship', param: 220, target };
	if (/traded|\[\[trade\]\]/i.test(how)) return { type: 'item', param: 'linkingcord', target, was: 'traded' };
	if ((m = /using (?:an? )?\[\[([^\]]+)\]\]/.exec(how))) { const item = norm(m[1]); return hasItem(item) ? { type: 'item', param: item, target } : { type: 'level', param: Math.max(FALLBACK, (lastLevel || 0) + 12), target, was: 'by using ' + m[1] + ' (an item the game does not have)' }; }
	return { type: 'level', param: FALLBACK, target, was: how || 'unknown' };
};
for (const id of uranium) {
	const f = path.join(UR, id + '.json'); if (!fs.existsSync(f)) { notes.push(`${id}: no cached wiki page`); continue; }
	const wt = JSON.parse(fs.readFileSync(f, 'utf8')).wikitext || '';
	// Pufluff: one level, two outcomes by its stats (the tie-break is in evo_pick.js RULES)
	const two = /evolves at level (\d+) into one of two options[^\n]*?\[\[([^\]]+)\]\][^\n]*?\[\[([^\]]+)\]\]/i.exec(wt);
	if (two) { for (const t of [two[2], two[3]]) put(id, { type: 'level', param: +two[1], target: byName[norm(t)] || norm(t) }); continue; }
	const text = wt.replace(/\{\{m\|([^}]+)\}\}/g, '[[$1]]').replace(/Beta version \d+\.?\d*/g, 'a later version');
	const s = /\bevolves? into ([^\n]*?\.)(?=\s|$)/i.exec(text);
	if (!s || /(does not|doesn't|not known to)\s*$/i.test(text.slice(Math.max(0, s.index - 30), s.index))) {
		// no "evolves into" of its own (or "does not evolve into or from…"): a middle stage says "evolves from [[A]] …, and into [[B]] …"
		const mid = s ? null : /\bevolves? from \[\[[^\n]*?(?:,? and|,? then) into ([^\n]*?\.)(?=\s|$)/i.exec(text);
		if (mid) { const e = seg(id, mid[1]); if (e) put(id, e); }
		continue;
	}
	// "[[A]] at 19, which evolves into [[B]] …": the later pieces are A's own (its page says so too); ", or into [[C]]" is this one's
	const parts = s[1].split(/, (?=which evolves|then into|and (?:evolves )?into|or into)/);
	const first = seg(id, parts[0]); if (first) put(id, first);
	let prev = first;
	for (const p of parts.slice(1)) {
		if (/^or into/.test(p)) { const e = seg(id, p, first && first.type === 'level' ? first.param : 0); if (e) put(id, e); }
		else if (prev && SP[prev.target]) { const e = seg(prev.target, p, prev.type === 'level' ? prev.param : 0); if (e) { chain.push([prev.target, e]); prev = e; } }   // (the next stage's own: used if its page gave none)
	}
}
for (const [id, e] of chain) if (!out[id]) put(id, e);

// ---------- Radical Ransei ----------
const ransei = new Set(Object.keys(SP).filter((id) => SP[id].num <= -266));
if (fs.existsSync(RANSEI)) {
	const blocks = fs.readFileSync(RANSEI, 'utf8').replace(/\r/g, '').split(/\n#-+\n/), internal = {};
	const field = (b, k) => { const m = new RegExp('^' + k + '=(.*)$', 'm').exec(b); return m ? m[1].trim() : ''; };
	for (const b of blocks) { const id = byName[norm(field(b, 'Name'))]; if (id) internal[field(b, 'InternalName')] = id; }
	const item = (x) => norm(x);
	for (const b of blocks) {
		const id = byName[norm(field(b, 'Name'))]; if (!id || !ransei.has(id)) continue;
		const ev = field(b, 'Evolutions').split(',').map((x) => x.trim()); if (ev.length < 2 || !ev[0]) continue;
		for (let i = 0; i + 1 < ev.length; i += 3) {
			const target = internal[ev[i]] || norm(ev[i]), how = ev[i + 1], p = ev[i + 2] || '', lv = /^\d+$/.test(p) ? +p : null;
			const was = how + (p ? ' ' + p : '');
			if (how === 'Level') put(id, { type: 'level', param: lv, target });
			else if (how === 'LevelDay' || how === 'LevelNight') put(id, { type: 'level', param: lv, target, time: how === 'LevelDay' ? 'day' : 'night' });
			else if (/^Level/.test(how) || how === 'Silcoon' || how === 'Cascoon' || how === 'Ninjask' || how === 'Shedinja' || /^(Attack|Defense|AtkDef)/.test(how)) put(id, { type: 'level', param: lv || FALLBACK, target, was });
			else if (/^Item/.test(how)) put(id, hasItem(item(p)) ? { type: 'item', param: item(p), target } : { type: 'level', param: FALLBACK, target, was: was + ' (an item the game does not have)' });
			else if (/^Happiness/.test(how)) put(id, { type: 'friendship', param: 220, target, ...(how === 'HappinessDay' ? { time: 'day' } : how === 'HappinessNight' ? { time: 'night' } : {}) });
			else if (how === 'Trade') put(id, { type: 'item', param: 'linkingcord', target, was: 'traded' });
			else if (how === 'TradeItem' || how === 'DayHoldItem' || how === 'NightHoldItem') put(id, hasItem(item(p)) ? { type: 'item', param: item(p), target, was } : { type: 'item', param: 'linkingcord', target, was: was + ' (an item the game does not have)' });
			else if (how === 'HasMove') put(id, { type: 'level', param: learnsAt(id, p) || FALLBACK, target, was: 'levelled up knowing ' + p });
			else put(id, { type: 'level', param: FALLBACK, target, was });
		}
	}
} else notes.push('Radical Ransei PBS not found at ' + RANSEI + ' — Ransei evolutions left out');

// what the game already has wins (CAP, anything hand-fixed): only species with no evolutions of their own are filled
for (const id of Object.keys(out)) if (EX[id] && EX[id].evos && EX[id].evos.length) delete out[id];
const ids = Object.keys(out).sort(), count = (lo, hi) => ids.filter((id) => SP[id].num <= hi && SP[id].num >= lo).length;
const body = ids.map((id) => `\t${JSON.stringify(id)}: ${JSON.stringify(out[id])},`).join('\n');
fs.writeFileSync(path.join(ROOT, 'overworld/fakemon_evos.js'), `// fakemon_evos.js — evolutions for the Uranium and Radical Ransei fakemon (the imports brought stats, moves and abilities,
// not these). GENERATED by tools/gen_fakemon_evos.mjs from the Pokémon Uranium wiki and Radical Ransei's own data — do
// not edit by hand; the tool says how each source's method becomes one of the game's three (level, item, friendship).
// \`was\` is the source's own method where the game's differs. battle.js lays these over species_extra at load, for
// species that have no evolutions of their own there.
export const FAKEMON_EVOS = {
${body}
};

/** (battle.js init, after the data is in) give these species their evolutions. */
export function applyFakemonEvos(data) {
	if (!data || !data.species) return;
	data.extra = data.extra || {};
	for (const [id, evos] of Object.entries(FAKEMON_EVOS)) {
		if (!data.species[id] || (data.extra[id] && data.extra[id].evos && data.extra[id].evos.length)) continue;
		data.extra[id] = { ...(data.extra[id] || {}), evos: evos.filter((e) => data.species[e.target]).map((e) => ({ ...e })) };
	}
}
`);
const changed = ids.flatMap((id) => out[id].filter((e) => e.was).map((e) => `${id} -> ${e.target}: ${e.type} ${e.param}  (source: ${e.was})`));
console.log(`fakemon evolutions: ${ids.length} species (Uranium ${count(-265, -100)}, Ransei ${count(-99999, -266)})`);
console.log(`converted from a method the game does not have: ${changed.length}`); for (const c of changed) console.log('  ' + c);
if (notes.length) { console.log('notes:'); for (const n of notes) console.log('  ' + n); }
