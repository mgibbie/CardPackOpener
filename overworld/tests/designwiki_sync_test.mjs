// designwiki_sync_test.mjs — designwiki/data/{pokemon,moves}.json are GENERATED
// from the live overworld data by tools/gen_designwiki.mjs, and they are what
// the public wiki serves. They drift silently: species rebalanced or moves
// retuned in overworld/data kept their OLD numbers on the wiki. This pins the
// committed wiki data to the local game data (dev-machine gate — overworld/data
// is gitignored, so this can only run where the data lives, like every other
// overworld test). On failure, regenerate:
//   node tools/gen_designwiki.mjs
// Node-only (no Chrome).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const rd = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const S = rd('overworld/data/species_battle.json');
const MV = rd('overworld/data/moves_battle.json');
const wikiP = rd('designwiki/data/pokemon.json');
const wikiM = rd('designwiki/data/moves.json');

// ---------- species parity + core stats ----------
const gameIds = Object.keys(S), wikiIds = Object.keys(wikiP);
A(gameIds.length === wikiIds.length,
	`species count matches (game ${gameIds.length} vs wiki ${wikiIds.length}) — regen: node tools/gen_designwiki.mjs`);
const missingP = gameIds.filter(id => !wikiP[id]);
A(missingP.length === 0, 'every game species is on the wiki', missingP.slice(0, 6).join(','));
const orphansP = wikiIds.filter(id => !S[id]);
A(orphansP.length === 0, 'the wiki carries no species the game dropped', orphansP.slice(0, 6).join(','));

const statDrift = [], typeDrift = [], scaleDrift = [];
for (const id of gameIds) {
	const g = S[id], w = wikiP[id];
	if (!w) continue;
	if (JSON.stringify({ ...g.baseStats }) !== JSON.stringify({ ...w.baseStats })) statDrift.push(id);
	if (JSON.stringify(g.types || []) !== JSON.stringify(w.types || [])) typeDrift.push(id);
	if ((g.battleScale ?? 1) !== (w.battleScale ?? 1)) scaleDrift.push(id);
}
A(statDrift.length === 0, `base stats match the game (${statDrift.length} drifted)`, statDrift.slice(0, 6).join(','));
A(typeDrift.length === 0, `types match the game (${typeDrift.length} drifted)`, typeDrift.slice(0, 6).join(','));
A(scaleDrift.length === 0, `battleScale matches the game (${scaleDrift.length} drifted)`, scaleDrift.slice(0, 6).join(','));

// ---------- move parity + numbers ----------
const gm = Object.keys(MV), wm = Object.keys(wikiM);
A(gm.length === wm.length, `move count matches (game ${gm.length} vs wiki ${wm.length})`);
const missingM = gm.filter(id => !wikiM[id]);
A(missingM.length === 0, 'every game move is on the wiki', missingM.slice(0, 6).join(','));
const moveDrift = [];
for (const id of gm) {
	const g = MV[id], w = wikiM[id];
	if (!w) continue;
	// field mapping: wiki basePower/accuracy = game power/acc
	if (g.name !== w.name || (g.type ?? null) !== (w.type ?? null) || (g.category ?? null) !== (w.category ?? null)
		|| (g.power ?? null) !== (w.basePower ?? null) || (g.acc ?? null) !== (w.accuracy ?? null)
		|| (g.pp ?? null) !== (w.pp ?? null) || (g.priority ?? 0) !== (w.priority ?? 0)) moveDrift.push(id);
}
A(moveDrift.length === 0, `move numbers match the game (${moveDrift.length} drifted)`, moveDrift.slice(0, 6).join(','));

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
