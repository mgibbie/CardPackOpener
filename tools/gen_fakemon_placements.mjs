// gen_fakemon_placements.mjs — where every FAKEMON (a species with dex num <= 0: CAP, Uranium, Radical Ransei) is
// actually placed in the overworld game, for the owner's /fakemon/ page. Reads the same tables the game does and writes
// fakemon/placements.json (committed; fakemon_page_test fails when it is out of date).
//   node tools/gen_fakemon_placements.mjs            write it
//   node tools/gen_fakemon_placements.mjs --check    exit 1 if the committed file differs
//
// A placement is { k, key?, where, how, lv? }:
//   k      'wild' | 'trainer' | 'gift' | 'code'
//   key    the swap key of this one placement (overworld/species_swaps.js), when it can be swapped by itself
//   where  the map / the trainer / the file, for a person
//   how    grass at night, surfing, Old Rod …; the slot's share of its table
//   lv     its level or level range
// Not listed per species, because they hold for all of them: the Ransei rift (5% of wild battles after a region's
// Champion: any fakemon with a learnset) and the Battle Frontier's random pool. The page says so.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'overworld/data');
const J = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const imp = (f) => import(pathToFileURL(path.join(ROOT, 'overworld', f)).href);

const species = J('species_battle.json');
const fake = new Set(Object.keys(species).filter((id) => (species[id].num || 0) <= 0));
const out = {}; for (const id of [...fake].sort()) out[id] = [];
const add = (id, p) => { if (fake.has(id)) out[id].push(p); };
const mapName = (id) => String(id).replace(/^MAP_/, '').toLowerCase().replace(/_/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
const lv = (s) => (s.min === s.max || s.max == null ? String(s.min) : s.min + '-' + s.max);
const KIND = { land: 'grass', water: 'surfing', fishing: 'fishing', rock_smash: 'Rock Smash' };
const share = (slots, s) => { const t = slots.reduce((a, q) => a + (q.w || 1), 0); return Math.round((s.w || 1) / t * 100) + '%'; };
// a table: [{id,min,max,w}], listed under its swap key  wild:<table>:<MAP>:<kind>:<phase|->:<i>
const table = (tbl, map, kind, phase, slots, how) => { if (!Array.isArray(slots)) return; slots.forEach((s, i) => add(s.id, { k: 'wild', key: ['wild', tbl, map, kind, phase || '-', i].join(':'), where: mapName(map), how: how + ', ' + share(slots, s) + ' of the table', lv: lv(s) })); };

// --- wild tables (encounters.js pick(): postgame, then day/night, then the Gen-3 night list, then the base table)
const base = J('encounters.json');
for (const [map, t] of Object.entries(base)) for (const [kind, g] of Object.entries(t)) table('base', map, kind, null, g && g.slots, KIND[kind] || kind);
const { DAYNIGHT } = await imp('encounters_daynight.js');
for (const [map, t] of Object.entries(DAYNIGHT)) for (const [kind, ph] of Object.entries(t)) for (const [phase, slots] of Object.entries(ph || {})) table('dn', map, kind, phase, slots, (KIND[kind] || kind) + ' (' + phase + ')');
const { FREM_NIGHT } = await imp('encounters_frem_night.js');
for (const [map, t] of Object.entries(FREM_NIGHT)) table('night', map, 'land', 'night', t.land && t.land.night, 'grass at night');
const { POSTGAME } = await imp('encounters_postgame.js');
for (const [map, t] of Object.entries(POSTGAME)) for (const [kind, v] of Object.entries(t)) {
	if (Array.isArray(v)) table('pg', map, kind, null, v, (KIND[kind] || kind) + ' (JohKanto postgame)');
	else for (const [phase, slots] of Object.entries(v || {})) table('pg', map, kind, phase, slots, (KIND[kind] || kind) + ' (JohKanto postgame, ' + phase + ')');
}
const { SINNOH_POSTGAME } = await imp('encounters_sinnoh_postgame.js');
for (const [map, t] of Object.entries(SINNOH_POSTGAME)) for (const [kind, slots] of Object.entries(t)) table('snpg', map, kind, null, slots, (KIND[kind] || kind) + " (Sinnoh, after its Champion)");
const { HEADBUTT_SETS } = await imp('headbutt_data.js');
for (const [set, tiers] of Object.entries(HEADBUTT_SETS)) for (const [tier, rows] of Object.entries(tiers || {})) for (const r of rows || []) if (Array.isArray(r)) add(r[1], { k: 'wild', where: 'Headbutt trees (' + set + ')', how: r[0] + '% of a ' + tier + ' tree', lv: String(r[2]) });

// --- trainers
const tr = J('trainers.json');
for (const [label, r] of Object.entries(tr.rosters || {})) (r.party || []).forEach((m, i) => add(m.s, { k: 'trainer', key: 'trainer:' + label + ':' + i, where: (r.class ? r.class + ' ' : '') + (r.name || label), how: 'party slot ' + (i + 1) + ' of ' + r.party.length + ' (' + label.split('_EventScript_')[0] + ')', lv: String(m.l) }));
for (const [cls, pool] of Object.entries(tr.classPools || {})) for (const s of [].concat(pool || [])) add(typeof s === 'string' ? s : s && s.s, { k: 'trainer', where: 'Any ' + cls + ' with no roster of their own', how: 'the class\'s fallback pool' });
for (const s of [].concat(tr.defaultPool || [])) add(typeof s === 'string' ? s : s && s.s, { k: 'trainer', where: 'Any trainer with no roster or class pool', how: 'the default fallback pool' });
const teams = J('trainer_teams.json');
for (const [id, r] of Object.entries(teams)) (r.party || []).forEach((m, i) => add(m.s, { k: 'trainer', where: (r.class ? r.class + ' ' : '') + id, how: 'story team, slot ' + (i + 1) + ' of ' + r.party.length, lv: String(m.l) }));
const jsonAt = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', f), 'utf8')); } catch { return null; } };
for (const r of [].concat((jsonAt('crystal_trainer_parties.json') || {}).parties || jsonAt('crystal_trainer_parties.json') || [])) (r && r.party || []).forEach((m, i) => add(m.s, { k: 'trainer', where: (r.class ? r.class + ' ' : '') + (r.name || r.key), how: 'Crystal scripted party, slot ' + (i + 1), lv: String(m.l) }));
for (const [id, r] of Object.entries((jsonAt('phone_data.json') || {}).teams || {})) (r && r.party || []).forEach((m, i) => add(m.s, { k: 'trainer', where: 'Phone rematch ' + id, how: 'slot ' + (i + 1), lv: String(m.l) }));

// --- gifts, eggs and scripted battles: the map scripts
const scriptDir = path.join(DATA, 'scripts');
const constOf = new Map([...fake].map((id) => ['SPECIES_' + id.toUpperCase().replace(/[^A-Z0-9]/g, '_'), id]));
const scan = (name, text) => {
	for (const m of text.matchAll(/\{"op":"(givemon|giveegg|wildbattle|setwildbattle)"[^{}]*?"species":"([^"]+)"[^{}]*?\}/g)) {
		const id = fake.has(m[2]) ? m[2] : constOf.get(m[2]); if (!id) continue;
		const l = /"level":(\d+)/.exec(m[0]);
		add(id, { k: 'gift', where: name, how: m[1] === 'givemon' ? 'given to you by a script' : m[1] === 'giveegg' ? 'given as an egg' : 'a scripted battle', ...(l ? { lv: l[1] } : {}) });
	}
};
if (fs.existsSync(scriptDir)) for (const f of fs.readdirSync(scriptDir).sort()) if (f.endsWith('.json')) scan(f.replace(/(_scripts)?\.json$/, ''), fs.readFileSync(path.join(scriptDir, f), 'utf8'));
if (fs.existsSync(path.join(DATA, 'shared_scripts.json'))) scan('shared scripts', fs.readFileSync(path.join(DATA, 'shared_scripts.json'), 'utf8'));

// --- hand-written lists in the game's code (starters, legendaries, roamers, prizes, rival and villain teams, trades…):
//     a fakemon named in one of them, as a quoted id
const CODE = { 'main.js': 'the starters and boot lists', 'rivals.js': 'a rival\'s team', 'quest.js': 'a villain team', 'ow_story.js': 'story gifts and partner teams', 'ow_minigames.js': 'Trainer Hill themes', 'ow_venues.js': 'the Bug-Catching Contest', 'ow_gamecorner.js': 'Game Corner prizes', 'ow_legendaries.js': 'a hand-placed legendary', 'legendaries_postgame.js': 'a postgame legendary', 'ow_features.js': 'the roamers', 'regional_forms.js': 'a regional form or its evolution' };
for (const [f, what] of Object.entries(CODE)) {
	const p = path.join(ROOT, 'overworld', f); if (!fs.existsSync(p)) continue;
	const seen = new Set(); for (const m of fs.readFileSync(p, 'utf8').matchAll(/['"]([a-z][a-z0-9\-]{2,})['"]/g)) if (fake.has(m[1]) && !seen.has(m[1])) { seen.add(m[1]); add(m[1], { k: 'code', where: 'overworld/' + f, how: what }); }
}
const trades = jsonAt('trades.json');
for (const [key, t] of Object.entries(trades && trades.trades || {})) { add(t.give, { k: 'gift', where: 'NPC trade ' + key, how: 'what the NPC gives you' }); add(t.want, { k: 'gift', where: 'NPC trade ' + key, how: 'what the NPC asks for' }); }

const placed = Object.values(out).filter((a) => a.length).length;
const text = JSON.stringify({ note: 'generated by tools/gen_fakemon_placements.mjs — do not edit', count: fake.size, placed, placements: out }) + '\n';
const file = path.join(ROOT, 'fakemon/placements.json');
if (process.argv.includes('--check')) {
	const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
	if (have !== text) { console.error('fakemon/placements.json is out of date: node tools/gen_fakemon_placements.mjs'); process.exit(1); }
	console.log('fakemon placements up to date');
} else {
	fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text);
	const by = {}; for (const a of Object.values(out)) for (const p of a) by[p.k] = (by[p.k] || 0) + 1;
	console.log(`fakemon placements: ${fake.size} fakemon, ${placed} placed somewhere of their own`, by);
}
