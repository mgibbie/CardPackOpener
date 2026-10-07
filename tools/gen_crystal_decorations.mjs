// gen_crystal_decorations.mjs — the player's-room DECORATIONS slice of pokecrystal
// (engine/overworld/decorations.asm), as data for overworld/decorations.js.
//
// Crystal keeps one decoration per slot (wDecoBed, wDecoPoster, ...); a new game
// starts with InitDecorations' FEATHERY BED and TOWN MAP. PlayersHouse2F's TILES
// callback (ToggleMaptileDecorations) stamps each slot's block into the room and
// sets EVENT_PLAYERS_ROOM_POSTER while a poster hangs, which is what makes the
// poster's BGEVENT_IFSET sign readable; describedecoration DECODESC_POSTER reads
// the hung poster's line (the TOWN MAP one opens the map).
//
// This reads data/decorations/attributes.asm (block per decoration), the
// InitDecorations defaults, the poster descriptions and their text, and computes
// each single-block decoration's grid cells for PlayersHouse2F with the
// converter's own code (tools/crystal_block_cells.py), confirmed against the
// harvest the way tools/gen_crystal_block_cells.mjs does.
//
// Writes tracked overworld/crystal_decorations.json
//   node tools/gen_crystal_decorations.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { loadCrystalMaps, makeHarvester } from './crystal_blocks.mjs';

const ROOT = path.resolve('.');
let MP66 = process.env.MAGEPUNK66;
for (let d = ROOT; !MP66 && d !== path.dirname(d); d = path.dirname(d)) if (fs.existsSync(path.join(d, 'Magepunk66', 'Reference', 'pokecrystal'))) MP66 = path.join(d, 'Magepunk66');
if (!MP66) throw new Error('Magepunk66 not found (set MAGEPUNK66)');
const CR = path.join(MP66, 'Reference', 'pokecrystal');
const read = f => fs.readFileSync(path.join(CR, f), 'utf8');
const ROOM = 'PlayersHouse2F';

// DECO_* ids: constants/deco_constants.asm, the `const_def 1` run after "; decorations:"
const constSrc = read('constants/deco_constants.asm');
const decoIds = [];
{
	const tail = constSrc.slice(constSrc.indexOf('; decorations:'));
	let n = Number(/const_def\s+(\d+)/.exec(tail)[1]);
	for (const m of tail.matchAll(/^\s*const\s+(\w+)/gm)) decoIds[n++] = m[1];
}
// data/decorations/attributes.asm: one row per id from 0
const rows = [...read('data/decorations/attributes.asm').matchAll(/^\s*decoration\s+(\w+),\s*(\w+),\s*(\w+),\s*(\w+),\s*(\$?\w+)/gm)];
const SLOT = { SET_UP_BED: 'bed', SET_UP_PLANT: 'plant', SET_UP_POSTER: 'poster' };   // single-block slots
const decos = {};
rows.forEach((m, i) => {
	const slot = SLOT[m[3]];
	if (!slot || !decoIds[i]) return;
	decos[decoIds[i]] = { slot, block: parseInt(m[5].replace('$', ''), 16), flag: m[4] };
});

// InitDecorations: `ld a, DECO_X` / `ld [wDecoY], a`
const asm = read('engine/overworld/decorations.asm');
const init = {};
{
	const body = asm.slice(asm.indexOf('InitDecorations:'), asm.indexOf('_PlayerDecorationMenu:'));
	for (const m of body.matchAll(/ld a, (DECO_\w+)\s*\n\s*ld \[wDeco(\w+)\], a/g)) init[m[2].toLowerCase()] = m[1];
}
// ToggleMaptileDecorations: `lb de, X, Y ; <slot> coordinates` (changeblock coords)
const coords = {};
for (const m of asm.matchAll(/lb de, (\d+), (\d+) ; (bed|plant|poster) coordinates/g)) coords[m[3]] = [+m[1], +m[2]];

// the poster descriptions: DecorationDesc_PosterPointers -> its text (TOWN MAP: + the map)
const common = read('data/text/common_1.asm');
const textOf = label => {
	const m = new RegExp('^' + label + '::\\s*\\n([\\s\\S]*?)\\n\\s*done', 'm').exec(common);
	if (!m) return null;
	return [...m[1].matchAll(/^\s*(?:text|line|cont|para)\s+"([^"]*)"/gm)].map(x => x[1]).join('\n');
};
for (const m of asm.matchAll(/dbw (DECO_\w+), (DecorationDesc_\w+)/g)) {
	const body = asm.slice(asm.indexOf(m[2] + ':'), asm.indexOf('\n\n', asm.indexOf(m[2] + ':') + m[2].length + 2) + 200);
	const far = /text_far (_\w+)/.exec(asm.slice(asm.indexOf(m[2] + ':')))?.[1];
	if (!decos[m[1]] || !far) continue;
	decos[m[1]].text = textOf(far);
	if (/special OverworldTownMap/.test(body)) decos[m[1]].townMap = true;
}

// the cells, from the decomp; the harvest confirms any block a shipped map shows
const req = Object.values(decos).map(d => ({ name: ROOM, block: d.block }));
const py = process.platform === 'win32' ? 'python' : 'python3';
const out = JSON.parse(execFileSync(py, [path.join('tools', 'crystal_block_cells.py')], { input: JSON.stringify(req), env: { ...process.env, MAGEPUNK66: MP66 }, maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] }).toString());
const maps = loadCrystalMaps(ROOT, CR);
const ts = (maps.find(m => m.name === ROOM) || {}).ts;
const harvest = makeHarvester(maps);
const ids = a => a.map(v => v & 0x3ff).join();
let confirmed = 0;
for (const [id, d] of Object.entries(decos)) {
	const c = out[ROOM + ':' + d.block];
	if (!c) throw new Error(`${id}: no cells computed for block ${d.block}`);
	const h = ts ? harvest(ts, d.block) : null;
	if (h && ids(h) !== ids(c.cells)) throw new Error(`${id}: harvest ${h} contradicts decomp ${c.cells}`);
	if (h) confirmed++;
	d.cells = h || c.cells;
}
const OUT = path.join('overworld', 'crystal_decorations.json');
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_crystal_decorations.mjs', room: ROOM, init, coords, decos }, null, 1) + '\n');
console.log(`${Object.keys(decos).length} decorations (${confirmed} confirmed against the harvest); init ${JSON.stringify(init)}; coords ${JSON.stringify(coords)}`);
console.log('wrote ' + OUT);
