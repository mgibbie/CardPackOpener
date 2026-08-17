// gen_frem_night.mjs — populate NIGHT wild-grass encounters for the Gen-3 regions
// (FireRed Kanto + Emerald Hoenn), which have no vanilla day/night split. Night lists are
// built from CLEAN fakemon FIRST (unique learnset + type-matched ability), filled with
// later-gen (Gen 4+) Pokemon only when fakemon run short, and biome-matched to each map:
// species must share a type with the map's existing base table (its "biome"), with a bonus
// for nocturnal-flavour types. Levels track the map's own base range. Emits the tracked
// module overworld/encounters_frem_night.js; encounters.js uses it for night+land only, so
// day/morning still use the base table + reweighting. Johto/JohKanto (authentic tables in
// encounters_daynight.js) and JohKanto-namespaced maps are excluded.
//
//   node tools/gen_frem_night.mjs   (from the repo root)
import fs from 'fs';
import path from 'path';

const DATA = path.resolve('overworld/data');
const OUT = path.resolve('overworld/encounters_frem_night.js');
const g = f => { const j = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8')); return j.species || j; };
const S = g('species_battle.json'), AB = g('species_abilities.json');
const enc = JSON.parse(fs.readFileSync(path.join(DATA, 'encounters.json'), 'utf8'));
const dnMaps = new Set(Object.keys((await import('../overworld/encounters_daynight.js')).DAYNIGHT));

const ids = Object.keys(S);
const types = i => S[i].types || [];
const sig = i => (S[i].learnset || []).map(m => m[1]).join(',');
const bySig = {}; for (const i of ids) (bySig[sig(i)] = bySig[sig(i)] || []).push(i);
const badAbility = i => { const t = types(i).map(x => x.toLowerCase()), a = (AB[i] || []).map(x => x.toLowerCase()); return (a.includes('torrent') && !t.includes('water')) || (a.includes('blaze') && !t.includes('fire')) || (a.includes('overgrow') && !t.includes('grass')); };

// CLEAN fakemon (num<=0, unique learnset, type-matched ability) — the priority pool
const cleanFakemon = ids.filter(i => (S[i].num || 0) <= 0 && bySig[sig(i)].length === 1 && !badAbility(i));
// later-gen canonical (Gen 4+), unique learnset — the fill pool
const laterGen = ids.filter(i => (S[i].num || 0) >= 387 && bySig[sig(i)].length === 1);

// region classifier for a base map, by its species (Johto grass already lives in DAYNIGHT;
// this only needs to keep the Gen-3 regions and skip residual Gen-2 maps)
const HOENN_SIG = new Set('poochyena zigzagoon wurmple lotad seedot taillow wingull ralts surskit shroomish slakoth nincada whismur makuhita azurill nosepass skitty sableye mawile aron meditite electrike plusle minun volbeat illumise roselia gulpin carvanha wailmer numel spoink spinda trapinch cacnea swablu zangoose seviper lunatone solrock barboach corphish baltoy lileep anorith feebas castform kecleon shuppet duskull tropius chimecho absol wynaut snorunt spheal clamperl relicanth luvdisc bagon beldum'.split(' '));
const JOHTO_SIG = new Set('sentret hoothoot ledyba spinarak chinchou mareep hoppip sunkern wooper murkrow misdreavus girafarig pineco dunsparce gligar snubbull qwilfish shuckle heracross sneasel teddiursa slugma swinub corsola remoraid delibird mantine skarmory houndour phanpy stantler smeargle larvitar aipom yanma'.split(' '));
function regionOf(mapId) {
	if (dnMaps.has(mapId) || mapId.startsWith('MAP_JOHKANTO_')) return 'SKIP';
	const base = enc[mapId]?.land?.slots || [];
	const sp = new Set(base.map(s => s.id));
	for (const s of sp) if (HOENN_SIG.has(s)) return 'HOENN';
	for (const s of sp) if (JOHTO_SIG.has(s)) return 'SKIP'; // residual Gen-2 map
	return 'KANTO';
}

const NIGHT_TYPES = new Set(['Dark', 'Ghost', 'Poison', 'Psychic', 'Bug']);
const NIGHT_W = [30, 25, 20, 12, 8, 5]; // 6-slot night distribution
// deterministic map-seeded rotation so same-biome maps don't all get the identical top mons
const hash = s => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };

// biome type-profile of a base land table (weighted), returns a Set of its top types
function biomeTypes(slots) {
	const w = {};
	for (const s of slots) for (const t of types(s.id)) w[t] = (w[t] || 0) + s.w;
	return new Set(Object.entries(w).sort((a, b) => b[1] - a[1]).slice(0, 3).map(e => e[0]));
}
const bst = i => Object.values(S[i].baseStats || {}).reduce((a, b) => a + b, 0);
// pick n species for a map, biome-matched: clean fakemon that share a biome type FIRST
// (night-type as a tiebreak), relax to night-type fakemon, then later-gen fill. Ties are
// broken by a per-map hash so same-biome maps pick different subsets (not alphabetical).
function pickNight(mapId, biome, n) {
	const bscore = id => types(id).filter(t => biome.has(t)).length;   // biome overlap
	const nscore = id => types(id).filter(t => NIGHT_TYPES.has(t)).length; // nocturnal flavour
	const tb = id => hash(mapId + ':' + id);
	const rank = (pool, ok) => pool.filter(ok).map(id => ({ id, s: bscore(id) * 3 + nscore(id) }))
		.sort((a, b) => b.s - a.s || tb(a.id) - tb(b.id));
	const chosen = [], seen = new Set();
	const take = arr => { for (const x of arr) { if (chosen.length >= n) break; if (!seen.has(x.id)) { chosen.push(x.id); seen.add(x.id); } } };
	take(rank(cleanFakemon, id => bscore(id) > 0));                         // 1) biome-matched fakemon
	if (chosen.length < n) take(rank(cleanFakemon, id => !seen.has(id) && nscore(id) > 0)); // 2) nocturnal fakemon
	if (chosen.length < n) take(rank(laterGen, id => !seen.has(id) && bscore(id) > 0));     // 3) biome-matched later-gen
	if (chosen.length < n) take(rank(laterGen, id => !seen.has(id) && nscore(id) > 0));     // 4) nocturnal later-gen fill
	// order by BST so the common (low-weight, low-level) slots hold weaker mons and the rare
	// slot holds the strongest — a sensible night ladder
	return chosen.sort((a, b) => bst(a) - bst(b));
}

const out = {};
let stats = { KANTO: 0, HOENN: 0, fakemonSlots: 0, fillSlots: 0, skipped: 0 };
const fakeSet = new Set(cleanFakemon);
for (const mapId of Object.keys(enc)) {
	const land = enc[mapId]?.land; if (!land?.slots?.length) continue;
	const region = regionOf(mapId); if (region === 'SKIP') { stats.skipped++; continue; }
	const biome = biomeTypes(land.slots);
	const lvls = land.slots.flatMap(s => [s.min, s.max]);
	const lo = Math.min(...lvls), hi = Math.max(...lvls);
	const chosen = pickNight(mapId, biome, NIGHT_W.length);
	if (chosen.length < 3) continue; // not enough biome matches -> leave to the reweighting/overlay
	const slots = chosen.map((id, i) => {
		const lvl = Math.round(lo + (chosen.length > 1 ? i / (chosen.length - 1) : 0) * (hi - lo));
		if (fakeSet.has(id)) stats.fakemonSlots++; else stats.fillSlots++;
		return { id, min: lvl, max: Math.min(hi, lvl + 1), w: NIGHT_W[i] ?? 3 };
	});
	out[mapId] = { land: { night: slots } };
	stats[region]++;
}

const body = Object.keys(out).sort().map(k => {
	const tbl = '[' + out[k].land.night.map(s => `{id:'${s.id}',min:${s.min},max:${s.max},w:${s.w}}`).join(',') + ']';
	return `\t'${k}': { land: { night: ${tbl} } },`;
}).join('\n');
const header = `// encounters_frem_night.js — NIGHT wild-grass lists for the Gen-3 regions (FireRed Kanto +
// Emerald Hoenn), which have no vanilla day/night. Built by tools/gen_frem_night.mjs from the
// CLEAN fakemon pool first (then later-gen fill), biome-matched to each map's base table and
// keyed to its level range. encounters.js uses these for NIGHT + LAND only; day/morning keep
// the base owdata table + reweighting. GENERATED — do not edit by hand; re-run the tool.\n`;
fs.writeFileSync(OUT, `${header}export const FREM_NIGHT = {\n${body}\n};\n`);
console.log(`Wrote ${OUT}: ${Object.keys(out).length} maps (KANTO ${stats.KANTO} / HOENN ${stats.HOENN}), ` +
	`${stats.fakemonSlots} fakemon slots + ${stats.fillSlots} later-gen slots; skipped ${stats.skipped} non-Gen3 land maps.`);
console.log(`pools: ${cleanFakemon.length} clean fakemon, ${laterGen.length} later-gen.`);
