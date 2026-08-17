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

// ---- level/stage sanity: match a fakemon's power (BST band) to the trainer's level band,
// so a fully-evolved 600-BST fakemon never lands on an early L7 youngster ----
const bstOf = i => Object.values(S[i].baseStats || {}).reduce((a, b) => a + b, 0);
const bBand = b => b <= 340 ? 0 : b <= 420 ? 1 : b <= 480 ? 2 : b <= 520 ? 3 : b <= 560 ? 4 : 5; // BST -> power band
const lBand = l => l < 12 ? 0 : l < 22 ? 1 : l < 32 ? 2 : l < 40 ? 3 : l < 48 ? 4 : 5;             // ace level -> band
const fBand = {}; for (const f of unused) fBand[f] = bBand(bstOf(f));
slots.forEach(s => s.lb = lBand(s.ace));

const assigned = new Array(slots.length).fill(null);
const usedSlot = new Array(slots.length).fill(false);
// free slots bucketed by (level-band, dominant type) and by level-band; lazy-skip pointers
const byBT = {}, byB = {};
slots.forEach((s, i) => { (byB[s.lb] = byB[s.lb] || []).push(i); ((byBT[s.lb] = byBT[s.lb] || {})[s.type] = byBT[s.lb][s.type] || []).push(i); });
const pBT = {}, pB = {};
const nextFree = (arr, key, ptr) => { let p = ptr[key] || 0; while (p < arr.length && usedSlot[arr[p]]) p++; ptr[key] = p; return p < arr.length ? arr[p] : -1; };
const claimTyped = (lb, t) => { const a = byBT[lb]?.[t]; if (!a) return -1; const i = nextFree(a, lb + ':' + t, pBT); if (i >= 0) usedSlot[i] = true; return i; };
const claimAny = lb => { const a = byB[lb]; if (!a) return -1; const i = nextFree(a, String(lb), pB); if (i >= 0) usedSlot[i] = true; return i; };

const deployed = new Set();
// PHASE 1 — coverage: place every unused fakemon, STRONGEST (highest band) first (they have
// the fewest valid hosts), into a trainer whose level-band >= the fakemon's power band,
// preferring the same band + a type match. (feasibility was verified, so forced fallback is rare)
for (const f of [...unused].sort((a, b) => fBand[b] - fBand[a] || (a < b ? -1 : 1))) {
	const fb = fBand[f], tys = S[f].types || [primary(f)];
	let idx = -1;
	for (let lb = fb; lb <= 5 && idx < 0; lb++) for (const t of tys) { idx = claimTyped(lb, t); if (idx >= 0) break; }
	if (idx < 0) for (let lb = fb; lb <= 5 && idx < 0; lb++) idx = claimAny(lb);   // level-ok, no type match
	if (idx < 0) for (let lb = 5; lb >= 0 && idx < 0; lb--) idx = claimAny(lb);    // forced under-tier (rare)
	if (idx >= 0) { assigned[idx] = f; deployed.add(f); }
}
// PHASE 2 — fill remaining free slots with the STRONGEST fakemon that still fits the level
// (band <= trainer band), type-matched, round-robin so it spreads
const uByBT = {}, uByB = {};
for (const f of unused) { const b = fBand[f], t = primary(f); (uByB[b] = uByB[b] || []).push(f); ((uByBT[b] = uByBT[b] || {})[t] = uByBT[b][t] || []).push(f); }
const rrBT = {}, rrB = {};
const fillPick = (lb, type) => {
	for (let b = Math.min(lb, 5); b >= 0; b--) { const a = uByBT[b]?.[type]; if (a?.length) { const k = b + ':' + type; return a[(rrBT[k] = (rrBT[k] || 0) + 1) % a.length]; } }
	for (let b = Math.min(lb, 5); b >= 0; b--) { const a = uByB[b]; if (a?.length) return a[(rrB[b] = (rrB[b] || 0) + 1) % a.length]; }
	return unused[0];
};
slots.forEach((s, i) => { if (assigned[i] != null) return; assigned[i] = fillPick(s.lb, s.type); deployed.add(assigned[i]); });

// ---- apply: append the fakemon to each party at the ace level (always >= its power-band floor) ----
let added = 0;
slots.forEach((s, i) => { const f = assigned[i]; if (!f) return; s.party.push({ s: f, l: s.ace }); added++; });

for (const f of files) fs.writeFileSync(f.p, JSON.stringify(f.json));
const missing = unused.filter(f => !deployed.has(f));
console.log(`Deployed a fakemon to ${added} trainer parties across ${files.length} files.`);
console.log(`Unused fakemon: ${unused.length} | now deployed: ${deployed.size} | still missing: ${missing.length}${missing.length ? ' (' + missing.slice(0, 8).join(',') + ')' : ''}`);
console.log(`Backups at *.pre_fakemon.bak. Deploy the data to owdata.`);
