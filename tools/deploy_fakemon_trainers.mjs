// deploy_fakemon_trainers.mjs — give every trainer one extra fakemon, to place the fakemon
// that never landed in a wild encounter (day or night). For each trainer party with < 6 mons
// (in both data/trainers.json .rosters and data/trainer_teams.json), append one UNUSED fakemon
// (num<=0, not present in any wild list) at the party's ace level, type-matched to the team.
// A two-phase assignment guarantees EVERY unused fakemon is deployed at least once.
//
// Edits both trainer files IN PLACE (backups at *.pre_fakemon.bak). Deterministic. The data is
// deployed to owdata separately.
//   node tools/deploy_fakemon_trainers.mjs   (from the repo root)
import fs from 'fs';
import path from 'path';

const DATA = path.resolve('overworld/data');
const S = JSON.parse(fs.readFileSync(path.join(DATA, 'species_battle.json'), 'utf8'));
const enc = JSON.parse(fs.readFileSync(path.join(DATA, 'encounters.json'), 'utf8'));
const FREM = (await import('../overworld/encounters_frem_night.js')).FREM_NIGHT;
const DN = (await import('../overworld/encounters_daynight.js')).DAYNIGHT;

// ---- the UNUSED fakemon (num<=0, absent from every wild list) ----
const used = new Set();
for (const k in enc) for (const cat in enc[k]) for (const s of (enc[k][cat].slots || [])) used.add(s.id);
for (const k in FREM) for (const s of FREM[k].land.night) used.add(s.id);
for (const k in DN) for (const ph of ['morning', 'day', 'night']) for (const s of DN[k].land[ph]) used.add(s.id);
const unused = Object.keys(S).filter(i => (S[i].num || 0) <= 0 && !used.has(i)).sort();
const primary = i => (S[i].types || ['Normal'])[0] || 'Normal';

// ---- collect trainer party slots from both files (party.length in 1..5) ----
const files = [];
for (const [name, key] of [['trainers.json', 'rosters'], ['trainer_teams.json', null]]) {
	const p = path.join(DATA, name);
	if (!fs.existsSync(p)) continue;
	if (!fs.existsSync(p + '.pre_fakemon.bak')) fs.writeFileSync(p + '.pre_fakemon.bak', fs.readFileSync(p)); // backup once
	const json = JSON.parse(fs.readFileSync(p, 'utf8'));
	const map = key ? json[key] : (json.trainers || json);
	files.push({ p, json, map });
}
const slots = [];
for (const f of files) for (const tk of Object.keys(f.map)) {
	const party = f.map[tk] && f.map[tk].party;
	if (!Array.isArray(party) || party.length < 1 || party.length >= 6) continue;
	// team dominant type (most common across members) + ace level
	const cnt = {}; for (const m of party) for (const t of (S[m.s]?.types || [])) cnt[t] = (cnt[t] || 0) + 1;
	const type = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Normal';
	const ace = Math.max(...party.map(m => m.l | 0), 2);
	slots.push({ party, type, ace });
}

// ---- assign: phase 1 guarantees coverage of all unused fakemon, phase 2 fills the rest ----
const slotsByType = {}; slots.forEach((s, i) => (slotsByType[s.type] = slotsByType[s.type] || []).push(i));
const assigned = new Array(slots.length).fill(null);
const tptr = {}; let anyPtr = 0;
const claim = type => {
	const list = slotsByType[type] || [];
	let p = tptr[type] || 0;
	while (p < list.length) { const idx = list[p++]; if (assigned[idx] === null) { tptr[type] = p; return idx; } }
	tptr[type] = p;
	return null;
};
const claimAny = () => { while (anyPtr < slots.length) { const i = anyPtr++; if (assigned[i] === null) return i; } return null; };
// phase 1: each unused fakemon -> a free type-fitting slot (else any free slot)
for (const f of unused) {
	let idx = null; for (const t of (S[f].types || [primary(f)])) { idx = claim(t); if (idx != null) break; }
	if (idx == null) idx = claimAny();
	if (idx != null) assigned[idx] = f;
}
// phase 2: remaining free slots -> a type-matched unused fakemon (round-robin, reuse allowed)
const poolByType = {}; for (const f of unused) (poolByType[primary(f)] = poolByType[primary(f)] || []).push(f);
const pptr = {};
slots.forEach((s, i) => { if (assigned[i] !== null) return; const pool = (poolByType[s.type] && poolByType[s.type].length) ? poolByType[s.type] : unused; assigned[i] = pool[(pptr[s.type] = (pptr[s.type] || 0) + 1) % pool.length]; });

// ---- apply: append the fakemon to each party at the ace level ----
let added = 0; const deployed = new Set();
slots.forEach((s, i) => { const f = assigned[i]; if (!f) return; s.party.push({ s: f, l: s.ace }); deployed.add(f); added++; });

for (const f of files) fs.writeFileSync(f.p, JSON.stringify(f.json));
const missing = unused.filter(f => !deployed.has(f));
console.log(`Deployed a fakemon to ${added} trainer parties across ${files.length} files.`);
console.log(`Unused fakemon: ${unused.length} | now deployed: ${deployed.size} | still missing: ${missing.length}${missing.length ? ' (' + missing.slice(0, 8).join(',') + ')' : ''}`);
console.log(`Backups at *.pre_fakemon.bak. Deploy the data to owdata.`);
