// gen_designwiki.mjs — rebuild the design-wiki data (designwiki/data/*.json) from the LIVE
// web-game data (overworld/data/*), so the wiki reflects the current game: repaired fakemon
// movesets/abilities, day/night wild encounters, and the fakemon now on trainers.
//
// Regenerates pokemon.json, moves.json, abilities.json in full, and REFRESHES regions.json in
// place — reusing the existing region/map/trainer skeleton but pulling every encounter table
// and trainer team from the current data. Ability descriptions are carried over from the
// existing abilities.json (the game data has none).
//   node tools/gen_designwiki.mjs   (from the repo root)
import fs from 'fs';
import path from 'path';

const DATA = path.resolve('overworld/data');
const WIKI = path.resolve('designwiki/data');
const rd = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const S = rd('species_battle.json'), AB = rd('species_abilities.json'), EX = rd('species_extra.json');
const MV = rd('moves_battle.json'), ENC = rd('encounters.json'), ROST = rd('trainers.json').rosters;
const DN = (await import('../overworld/encounters_daynight.js')).DAYNIGHT;
const FREM = (await import('../overworld/encounters_frem_night.js')).FREM_NIGHT;
const abName = id => (AB._names && AB._names[id]) || id.replace(/(^|[-_])(\w)/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());
const speciesIds = Object.keys(S);

// ---------- pokemon.json ----------
const pokemon = {};
for (const id of speciesIds) {
	const s = S[id];
	pokemon[id] = {
		id, num: s.num || 0, name: s.name || abName(id), sprite: s.sprite || '',
		types: s.types || [], baseStats: s.baseStats || {}, battleScale: s.battleScale || 1,
		abilities: (Array.isArray(AB[id]) ? AB[id] : []).map(abName),
		levelUpLearnset: s.learnset || [],
		learnset: (EX[id] && EX[id].learn) || [],
	};
}

// ---------- moves.json (with a reverse learnedBy index) ----------
const moves = {};
for (const id of Object.keys(MV)) {
	if (id.startsWith('_')) continue;
	const m = MV[id];
	moves[id] = { name: m.name || id, category: m.category || 'Status', basePower: m.power || 0, accuracy: typeof m.acc === 'number' ? m.acc : 100, type: m.type || 'Normal', pp: m.pp || 0, priority: m.priority || 0, learnedBy: [] };
}
for (const id of speciesIds) {
	const num = S[id].num || 0;
	for (const [lv, mv] of (S[id].learnset || [])) if (moves[mv]) moves[mv].learnedBy.push({ pokemon: id, how: 'Lv ' + lv, num });
	for (const mv of ((EX[id] && EX[id].learn) || [])) if (moves[mv] && !moves[mv].learnedBy.some(e => e.pokemon === id)) moves[mv].learnedBy.push({ pokemon: id, how: 'TM/Egg', num });
}

// ---------- abilities.json (carry descriptions over; rebuild the pokemon index) ----------
const oldAb = JSON.parse(fs.readFileSync(path.join(WIKI, 'abilities.json'), 'utf8'));
const desc = {}; for (const k in oldAb) if (oldAb[k] && oldAb[k].description) desc[k] = oldAb[k].description;
const abIndex = {};
for (const id of speciesIds) for (const a of (Array.isArray(AB[id]) ? AB[id] : [])) (abIndex[a] = abIndex[a] || []).push(id);
const abilities = {};
for (const a of Object.keys(abIndex).sort()) abilities[a] = { id: a, name: abName(a), description: desc[a] || '', pokemon: abIndex[a] };

// ---------- regions.json (refresh encounters + trainer teams in the existing skeleton) ----------
const regions = JSON.parse(fs.readFileSync(path.join(WIKI, 'regions.json'), 'utf8'));
const slotMap = arr => (arr || []).map(s => ({ species: s.id, minLevel: s.min, maxLevel: s.max, weight: s.w }));
function encountersFor(mapId) {
	const out = [];
	const base = ENC[mapId] || {};
	for (const method of ['land', 'water', 'fishing', 'rock_smash']) if (base[method]?.slots?.length) out.push({ method, rate: base[method].rate || 0, slots: slotMap(base[method].slots) });
	const landRate = base.land?.rate || 10;
	// authentic Johto/JohKanto per-time grass tables
	if (DN[mapId]?.land) for (const ph of ['morning', 'day', 'night']) if (DN[mapId].land[ph]?.length) out.push({ method: 'grass (' + ph + ')', rate: landRate, slots: slotMap(DN[mapId].land[ph]) });
	// FireRed/Emerald fakemon night list
	if (FREM[mapId]?.land?.night?.length) out.push({ method: 'grass (night)', rate: landRate, slots: slotMap(FREM[mapId].land.night) });
	return out;
}
for (const r in regions) for (const mapId in regions[r].maps) {
	const m = regions[r].maps[mapId];
	m.encounters = encountersFor(mapId);
	m.trainers = (m.trainers || []).map(t => {
		const ro = ROST[t.script];
		return ro ? { script: t.script, name: ro.name || t.name, class: ro.class || t.class, party: (ro.party || []).map(p => ({ species: p.s, level: p.l })) } : t;
	});
}

// match the repo's existing formatting: pokemon/moves/abilities minified, regions pretty
fs.writeFileSync(path.join(WIKI, 'pokemon.json'), JSON.stringify(pokemon));
fs.writeFileSync(path.join(WIKI, 'moves.json'), JSON.stringify(moves));
fs.writeFileSync(path.join(WIKI, 'abilities.json'), JSON.stringify(abilities));
fs.writeFileSync(path.join(WIKI, 'regions.json'), JSON.stringify(regions, null, 1));
console.log(`Wrote designwiki/data: ${speciesIds.length} pokemon, ${Object.keys(moves).length} moves, ${Object.keys(abilities).length} abilities, ${Object.keys(regions).length} regions.`);
