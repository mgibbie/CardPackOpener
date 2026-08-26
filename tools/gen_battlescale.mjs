// gen_battlescale.mjs — assign each species a per-mon `battleScale` so battle sprites are
// drawn at authentic RELATIVE sizes (a Diglett smaller than a Charizard, Wailord huge),
// instead of every mon flattened into the same 96px box.
//
// The battle/pvp/evolution renderers fit each sprite into a 96px reference box (contain),
// then multiply by `battleScale`. So battleScale is a size MULTIPLIER on the standard box:
//   1.0  = fills the box like an "average" mon   (the default when the field is absent)
//   <1.0 = smaller (Pikachu 0.74, Diglett 0.60)
//   >1.0 = larger  (Snorlax 1.28, Onix/Wailord 1.90)
//
// Values are derived from canonical Pokedex height (Showdown pokedex.ts `heightm`) via a
// gentle power curve: scale = clamp((heightm / REF)^K, MIN, MAX). REF=1.0m is the median
// Pokemon height, so a 1-meter mon renders at the standard box size. Fakemon (num<=0) and
// species with no height data default to 1.0 (box-filling) and can be hand-tuned via OVERRIDES.
//
// Writes `battleScale` into overworld/data/species_battle.json only where it deviates from 1.0
// (absent => 1.0), and strips stale values on re-run (idempotent). Backup once at
// *.pre_battlescale.bak. Deploy the data to owdata after running.
//   node tools/gen_battlescale.mjs   (from the repo root)
import fs from 'fs';
import path from 'path';

const DATA = path.resolve('overworld/data');
const DEX = path.resolve('../Magepunk66/Reference/pokemon-showdown-master/data/pokedex.ts');
const SPB = path.join(DATA, 'species_battle.json');

// curve params
const REF = 1.0;   // median Pokemon height (m) -> renders at the standard 96 box
const K = 0.33;    // compression exponent (cube-root-ish; keeps giants/tinies on-screen)
const MIN = 0.6, MAX = 1.9;
const scaleFor = h => +Math.max(MIN, Math.min(MAX, Math.pow(h / REF, K))).toFixed(2);

// hand overrides (id -> scale), for mons with no/odd height data or a deliberate look
const OVERRIDES = {};

// ---- parse Showdown heights + weights: each top-level "\n\tid: { ... heightm: X," block ----
const dex = fs.readFileSync(DEX, 'utf8');
const H = {}, W = {};
const re = /\n\t([a-z0-9]+): \{[\s\S]*?heightm: ([\d.]+),/g;
let m; while ((m = re.exec(dex))) H[m[1]] = parseFloat(m[2]);
const rw = /\n\t([a-z0-9]+): \{[\s\S]*?weightkg: ([\d.]+),/g;
while ((m = rw.exec(dex))) W[m[1]] = parseFloat(m[2]);

// ---- apply to species_battle.json ----
const S = JSON.parse(fs.readFileSync(SPB, 'utf8'));
if (!fs.existsSync(SPB + '.pre_battlescale.bak')) fs.writeFileSync(SPB + '.pre_battlescale.bak', fs.readFileSync(SPB));

let written = 0, cleared = 0, fromHeight = 0, fromOverride = 0, weights = 0;
for (const id in S) {
	const sp = S[id];
	let scale = null;
	if (OVERRIDES[id] != null) { scale = OVERRIDES[id]; fromOverride++; }
	else if ((sp.num || 0) > 0 && H[id] != null) { scale = scaleFor(H[id]); fromHeight++; }
	// write only when it meaningfully deviates from the 1.0 default; strip otherwise (idempotent)
	if (scale != null && Math.abs(scale - 1) >= 0.03) { sp.battleScale = scale; written++; }
	else if ('battleScale' in sp) { delete sp.battleScale; cleared++; }
	// canonical weight for the weight-based moves (Low Kick / Heavy Slam ...);
	// fakemon and unknowns stay absent — the engine defaults to 50kg
	if ((sp.num || 0) > 0 && W[id] != null) { sp.weightkg = W[id]; weights++; }
	else if ('weightkg' in sp) { delete sp.weightkg; }
}

fs.writeFileSync(SPB, JSON.stringify(S));
console.log(`battleScale: wrote ${written} species (${fromHeight} height-derived candidates, ${fromOverride} overrides), cleared ${cleared} stale.`);
console.log(`weightkg: wrote ${weights} species (absent => engine default 50kg).`);
console.log(`Heights parsed: ${Object.keys(H).length}, weights ${Object.keys(W).length}. Absent battleScale => 1.0. Deploy species_battle.json to owdata.`);
