// repair_fakemon.mjs — repair the incomplete fakemon (Radical Ransei imports, num<=0) in
// the species data. Two defects, two fixes:
//   1) DUPLICATE (copy-paste) learnset  -> give the fakemon a fresh, type-appropriate moveset
//      by MERGING the level-up learnsets of two different Gen 1-5 Pokemon (one per type, or two
//      of the mono-type). Moves dedupe to their earliest level; sorted; capped.
//   2) MISMATCHED starter ability (Torrent on a non-Water mon, Blaze on non-Fire, Overgrow on
//      non-Grass) -> replace that one ability with the primary type's default.
// Edits overworld/data/species_battle.json (learnset) + species_abilities.json (abilities) IN
// PLACE, after backing both up to the scratchpad. Deterministic (hash-seeded) so re-running is
// stable. These data files are deployed to owdata separately.
//
//   node tools/repair_fakemon.mjs   (from the repo root)
import fs from 'fs';
import path from 'path';

const DATA = path.resolve('overworld/data');
const BAK = process.env.TEMP ? path.join(process.env.TEMP, 'claude') : DATA; // fallback next to data
const SB_PATH = path.join(DATA, 'species_battle.json');
const AB_PATH = path.join(DATA, 'species_abilities.json');
const S = JSON.parse(fs.readFileSync(SB_PATH, 'utf8'));
const AB = JSON.parse(fs.readFileSync(AB_PATH, 'utf8'));
const MV = JSON.parse(fs.readFileSync(path.join(DATA, 'moves_battle.json'), 'utf8'));
const mvType = id => (MV[id] && MV[id].type) || '?';
// damaging moves per type (sorted weak->strong), for guaranteeing STAB on a repaired moveset
const stabByType = {};
for (const id in MV) { const m = MV[id]; if (id.startsWith('_') || !m || !(m.power > 0) || m.category === 'Status' || !m.type) continue; (stabByType[m.type] = stabByType[m.type] || []).push([id, m.power]); }
for (const t in stabByType) stabByType[t].sort((a, b) => a[1] - b[1]);

// backup first (only once — never overwrite the pristine pre-repair copy on a re-run)
for (const p of [SB_PATH, AB_PATH]) if (!fs.existsSync(p + '.pre_repair.bak')) try { fs.writeFileSync(p + '.pre_repair.bak', fs.readFileSync(p)); } catch (e) { console.warn('backup failed', e.message); }

const ids = Object.keys(S);
const hash = s => { let h = 2166136261; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };
const learn = id => S[id].learnset || [];
const sig = id => learn(id).map(m => m[1]).join(',');
const abilitiesOf = id => Array.isArray(AB[id]) ? AB[id] : [];

const TYPE_ABILITY = { Grass: 'overgrow', Fire: 'blaze', Water: 'torrent', Electric: 'static', Bug: 'swarm', Normal: 'runaway', Poison: 'poisonpoint', Ground: 'sandveil', Rock: 'rockhead', Flying: 'keeneye', Psychic: 'synchronize', Ghost: 'levitate', Dragon: 'shedskin', Dark: 'intimidate', Steel: 'sturdy', Fighting: 'guts', Ice: 'snowcloak', Fairy: 'cutecharm' };

// duplicate-learnset detection (across ALL species)
const bySig = {}; for (const id of ids) (bySig[sig(id)] = bySig[sig(id)] || []).push(id);
const fakemon = ids.filter(id => (S[id].num || 0) <= 0);
const isDup = id => bySig[sig(id)].length > 1;
const badAbility = id => { const t = (S[id].types || []).map(x => x.toLowerCase()), a = abilitiesOf(id).map(x => x.toLowerCase()); return (a.includes('torrent') && !t.includes('water')) || (a.includes('blaze') && !t.includes('fire')) || (a.includes('overgrow') && !t.includes('grass')); };

// donor pools: Gen 1-5 (National Dex 1-649) with a full learnset, grouped by type
const donors = {};
for (const id of ids) {
	const n = S[id].num || 0;
	if (n < 1 || n > 649 || learn(id).length < 12) continue;
	for (const t of S[id].types || []) (donors[t] = donors[t] || []).push(id);
}
for (const t in donors) donors[t].sort();

// merging two donors piles both their level-1 moves onto L1; spread them into a rising
// ladder so the learnset reads sensibly and low-level mons get a real progression. Keeps
// ~3 starting moves at L1, then steps up (respecting any naturally higher-level move).
function spreadLevels(learnset) {
	const sorted = [...learnset].sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
	const out = []; let next = 4;
	sorted.forEach(([lv, mv], i) => {
		if (i < 3) { out.push([1, mv]); return; }        // starting moves
		const nl = Math.max(lv, next);                    // at least its own level; strictly rising
		out.push([nl, mv]);
		next = nl + 2;
	});
	return out;
}

// merge two donors' learnsets -> a fresh moveset (min level per move, capped 20, then spread
// across levels). `offset` rotates the donor pair so a colliding result can be nudged distinct.
function combinedMoveset(fakeId, offset = 0) {
	const ty = S[fakeId].types || ['Normal'];
	const t1 = ty[0] || 'Normal', t2 = ty[1] || ty[0] || 'Normal';
	const A = donors[t1] || donors.Normal, B = donors[t2] || donors.Normal;
	const a = A[(hash(fakeId) + offset) % A.length];
	let b = B[(hash(fakeId + '#') + offset * 7) % B.length];
	if (b === a && B.length > 1) b = B[(hash(fakeId + '#') + offset * 7 + 1) % B.length];
	const min = new Map();
	for (const [lv, mv] of [...learn(a), ...learn(b)]) if (!min.has(mv) || min.get(mv) > lv) min.set(mv, lv);
	let list = [...min.entries()].map(([mv, lv]) => [lv, mv]).sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
	if (!list.some(([lv]) => lv <= 1)) list.unshift([1, list[0][1]]); // guarantee a level-1 move
	return spreadLevels(list.slice(0, 20));
}
// guarantee a repaired moveset has 2-3 STAB moves. If the two donors gave <2 moves of the
// fakemon's own type(s) (common for Fairy — Gen 1-5 donors carry almost no Fairy moves),
// inject a weak/mid/strong spread of real STAB moves at sensible levels, without dropping any
// STAB when re-capping to 20.
function ensureStab(id, learnset) {
	const ty = S[id].types || [];
	const isStab = mv => ty.includes(mvType(mv));
	const stab = learnset.filter(m => isStab(m[1])).length;
	if (stab >= 2) return learnset;
	const have = new Set(learnset.map(m => m[1]));
	const cands = [];
	for (const t of ty) for (const [mid, pow] of (stabByType[t] || [])) if (!have.has(mid) && !cands.some(c => c[0] === mid)) cands.push([mid, pow]);
	if (!cands.length) return learnset;
	cands.sort((a, b) => a[1] - b[1]);
	const idxs = [...new Set([0, cands.length >> 1, cands.length - 1])].slice(0, 3 - stab); // weak / mid / strong
	const lvl = pow => pow < 55 ? 8 : pow < 85 ? 22 : 40;
	const inj = idxs.map(ix => [lvl(cands[ix][1]), cands[ix][0]]);
	const min = new Map();
	for (const [lv, mv] of [...learnset, ...inj]) if (!min.has(mv) || min.get(mv) > lv) min.set(mv, lv);
	let out = [...min.entries()].map(([mv, lv]) => [lv, mv]).sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
	while (out.length > 20) { let di = -1; for (let i = out.length - 1; i >= 0; i--) if (!isStab(out[i][1])) { di = i; break; } if (di < 0) break; out.splice(di, 1); }
	return out;
}
// replace the mismatched starter ability with the primary type's default (keep the rest)
function fixedAbilities(id) {
	const t = (S[id].types || []).map(x => x.toLowerCase());
	const rep = TYPE_ABILITY[(S[id].types || [])[0]] || 'runaway';
	let abs = abilitiesOf(id).map(a => {
		const al = a.toLowerCase();
		return (al === 'torrent' && !t.includes('water')) || (al === 'blaze' && !t.includes('fire')) || (al === 'overgrow' && !t.includes('grass')) ? rep : a;
	});
	abs = [...new Set(abs)];
	return abs.length ? abs : [rep];
}

// signatures already in use — seed with everything we WON'T change (real mons + non-dup
// fakemon) so a fresh moveset never collides with a real learnset or another fakemon's
const used = new Set();
for (const id of ids) if (!((S[id].num || 0) <= 0 && isDup(id))) used.add(sig(id));

let moveFixed = 0, abFixed = 0, collisionRetries = 0;
for (const id of fakemon) {
	if (isDup(id)) {
		let ls, s, off = 0;
		do { ls = combinedMoveset(id, off); s = ls.map(m => m[1]).join(','); off++; } while (used.has(s) && off < 40);
		if (off > 1) collisionRetries++;
		ls = ensureStab(id, ls); // top up to 2-3 STAB moves if the donors came up short
		S[id].learnset = ls; used.add(ls.map(m => m[1]).join(',')); moveFixed++;
	}
	if (badAbility(id)) { AB[id] = fixedAbilities(id); abFixed++; }
}

fs.writeFileSync(SB_PATH, JSON.stringify(S));
fs.writeFileSync(AB_PATH, JSON.stringify(AB));
console.log(`Repaired fakemon: ${moveFixed} combined movesets (dup learnsets, ${collisionRetries} needed a distinct donor pair) + ${abFixed} ability fixes.`);
console.log(`Wrote ${SB_PATH} and ${AB_PATH} (backups at *.pre_repair.bak). Deploy the data to owdata.`);
