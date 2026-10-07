// gen_crystal_decorations.mjs — the player's-room DECORATIONS of pokecrystal
// (engine/overworld/decorations.asm), as data for overworld/decorations.js.
//
// Crystal keeps one decoration per slot (wDecoBed, wDecoCarpet, wDecoPlant,
// wDecoPoster, wDecoConsole, wDecoLeft/RightOrnament, wDecoBigDoll); a new game
// starts with InitDecorations' FEATHERY BED and TOWN MAP. The player's PC in
// PlayersHouse2F has a DECORATION menu (_PlayerDecorationMenu) that lists the
// categories you own something in, and per category your decorations (an
// EVENT_DECO_* flag each) + PUT IT AWAY + CANCEL. PlayersHouse2F's TILES callback
// (ToggleMaptileDecorations) stamps the bed / plant / poster / carpet blocks into
// the room; its NEWMAP callback (ToggleDecorationsVisibility) shows the console,
// doll and big-doll objects with the decoration's sprite.
//
// This reads, all from the decomp:
//   data/decorations/attributes.asm   type, name, action, flag, block or sprite
//   data/decorations/names.asm        DecorationNames (GetDecoName builds each name)
//   data/pokemon/names.asm            the POKeMON half of poster / doll names
//   engine/overworld/decorations.asm  InitDecorations, the category lists
//                                     (FindOwned*), coordinates, descriptions
//   data/text/common_1.asm, _2.asm    the menu and description text
// and computes each block's grid cells for PlayersHouse2F with the converter's
// own code (tools/crystal_block_cells.py), confirmed against the harvest the way
// tools/gen_crystal_block_cells.mjs does. The object sprites are converted by
// tools/gen_crystal_deco_sprites.py.
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

// a `const_def N` run of consts starting after `marker` (until the next const_def)
function constRun(src, marker) {
	const tail = src.slice(src.indexOf(marker));
	const out = {};
	let n = Number(/const_def\s*(\d*)/.exec(tail)[1] || 0);
	const body = tail.slice(tail.indexOf('const_def') + 9);
	const stop = body.search(/\n\s*const_def/);
	for (const m of (stop >= 0 ? body.slice(0, stop) : body).matchAll(/^\s*const\s+(\w+)/gm)) out[m[1]] = n++;
	return out;
}
const constSrc = read('constants/deco_constants.asm');
const DECO_NUM = constRun(constSrc, '; decorations:');            // BEDS = 1, DECO_FEATHERY_BED = 2, ...
const DECO_OF = Object.fromEntries(Object.entries(DECO_NUM).map(([k, v]) => [v, k]));
const NAME_IDX = constRun(constSrc, '; DecorationNames indexes');   // CANCEL_DECO = 0, PUT_IT_AWAY = 1, ...
const TYPE_IDX = constRun(constSrc, '; decoration types');          // DECO_PLANT = 1, ...
const TYPE_OF = Object.fromEntries(Object.entries(TYPE_IDX).map(([k, v]) => [v, k]));

// DecorationNames (names.asm `li "..."`, by index)
const decoNames = [...read('data/decorations/names.asm').matchAll(/^\s*li\s+"([^"]*)"/gm)].map(m => m[1]);
// PokemonNames (dex order) and the species constants
const monNames = [...read('data/pokemon/names.asm').matchAll(/^\s*dname\s+"([^"]*)"/gm)].map(m => m[1]);
const MON_IDX = constRun(read('constants/pokemon_constants.asm'), 'const_def 1');

// GetDecoName: plant = the name; bed / carpet = name + " BED" / " CARPET";
// poster / doll = the POKeMON's name + " POSTER" / " DOLL"; big doll = "BIG " + POKeMON
function decoName(type, name) {
	const n = NAME_IDX[name] != null ? decoNames[NAME_IDX[name]] : null;
	const mon = MON_IDX[name] != null ? monNames[MON_IDX[name] - 1] : null;
	switch (TYPE_OF[type]) {
		case 'DECO_PLANT': return n;
		case 'DECO_BED': return n + decoNames[NAME_IDX._BED];
		case 'DECO_CARPET': return n + decoNames[NAME_IDX._CARPET];
		case 'DECO_POSTER': return mon + decoNames[NAME_IDX._POSTER];
		case 'DECO_DOLL': return mon + decoNames[NAME_IDX._DOLL];
		case 'DECO_BIGDOLL': return decoNames[NAME_IDX.BIG_] + mon;
	}
	return null;
}

// data/decorations/attributes.asm: one row per number from 0 (0 = CANCEL)
const ACTION_SLOT = {
	SET_UP_BED: 'bed', PUT_AWAY_BED: 'bed', SET_UP_CARPET: 'carpet', PUT_AWAY_CARPET: 'carpet',
	SET_UP_PLANT: 'plant', PUT_AWAY_PLANT: 'plant', SET_UP_POSTER: 'poster', PUT_AWAY_POSTER: 'poster',
	SET_UP_CONSOLE: 'console', PUT_AWAY_CONSOLE: 'console', SET_UP_BIG_DOLL: 'bigDoll', PUT_AWAY_BIG_DOLL: 'bigDoll',
	SET_UP_DOLL: 'ornament', PUT_AWAY_DOLL: 'ornament',
};
const rows = [...read('data/decorations/attributes.asm').matchAll(/^\s*decoration\s+(\w+),\s*(\w+),\s*(\w+),\s*(\w+),\s*(\$?\w+)/gm)];
const decos = {};
const entries = [];   // by number: { kind: 'cancel' | 'putaway' | 'deco', ... }
rows.forEach((m, i) => {
	const [, type, name, action, flag, gfx] = m;
	if (i === 0) { entries[i] = { kind: 'cancel', name: decoNames[NAME_IDX.CANCEL_DECO] }; return; }
	const slot = ACTION_SLOT[action];
	if (/^PUT_AWAY_/.test(action)) { entries[i] = { kind: 'putaway', slot, name: decoNames[NAME_IDX[name]] }; return; }
	const id = DECO_OF[i];
	if (!id || !slot) throw new Error(`attributes row ${i} (${name}) has no decoration`);
	const d = { num: i, slot, name: decoName(TYPE_IDX[type], name), flag };
	if (/^SPRITE_/.test(gfx)) d.sprite = gfx;
	else d.block = parseInt(gfx.replace('$', ''), 16);
	decos[id] = d;
	entries[i] = { kind: 'deco', id };
});

const asm = read('engine/overworld/decorations.asm');
// InitDecorations: `ld a, DECO_X` / `ld [wDecoY], a`
const init = {};
{
	const body = asm.slice(asm.indexOf('InitDecorations:'), asm.indexOf('_PlayerDecorationMenu:'));
	for (const m of body.matchAll(/ld a, (DECO_\w+)\s*\n\s*ld \[wDeco(\w+)\], a/g)) init[m[2][0].toLowerCase() + m[2].slice(1)] = m[1];
}
// the category menu (.category_pointers strings, in order) and each category's
// FindOwned* list: `ld hl, .list` / `ld c, CATEGORY` then `db DECO_X` ... `db -1`
const catLabels = [...asm.slice(asm.indexOf('.category_pointers:'), asm.indexOf('.FindCategoriesWithOwnedDecos:')).matchAll(/^\.(\w+):\s+db "([^@]*)@"/gm)].map(m => m[2]);
const categories = [];
for (const m of asm.matchAll(/^(FindOwned\w+):\s*\n\s*ld hl, (\.\w+)\s*\n\s*ld c, (\w+)/gm)) {
	const at = asm.indexOf('\n' + m[2] + ':', m.index);
	const list = asm.slice(at, asm.indexOf('db -1', at));
	const decoIds = [...list.matchAll(/db (DECO_\w+)/g)].map(x => x[1]);
	categories.push({ fn: m[1], put: DECO_NUM[m[3]], decos: decoIds });
}
const order = [...asm.slice(asm.indexOf('.owned_pointers:'), asm.indexOf('Deco_FillTempWithMinusOne:')).matchAll(/dwb (FindOwned\w+),\s*(\d+)/g)].map(m => m[1]);
const cats = order.map((fn, i) => {
	const c = categories.find(x => x.fn === fn);
	if (!c) throw new Error('no list for ' + fn);
	return { name: catLabels[i], slot: entries[c.put].slot, decos: c.decos };
});
if (catLabels.length !== cats.length + 1) throw new Error('category labels ' + catLabels.join());
const exitLabel = catLabels[cats.length];

// ToggleMaptileDecorations: `lb de, X, Y ; <slot> coordinates` (changeblock coords)
const coords = {};
for (const m of asm.matchAll(/lb de, (\d+), (\d+) ; (bed|plant|poster|carpet top-left|carpet bottom-left) coordinates/g))
	coords[{ 'carpet top-left': 'carpetTop', 'carpet bottom-left': 'carpetBottom' }[m[3]] || m[3]] = [+m[1], +m[2]];
for (const k of ['bed', 'plant', 'poster', 'carpetTop', 'carpetBottom']) if (!coords[k]) throw new Error('no coordinates for ' + k);

// text: `text` / `line` / `cont` / `para`, `text_ram wStringBuffer3/4` -> {3} / {4}
// (paragraphs as a blank line, as the port's dialog shows them)
const textSrc = read('data/text/common_1.asm') + '\n' + read('data/text/common_2.asm');
function textOf(label) {
	const at = textSrc.search(new RegExp('^' + label + '::', 'm'));
	if (at < 0) throw new Error('no text ' + label);
	let out = '';
	for (const line of textSrc.slice(at).split('\n').slice(1)) {
		const t = line.trim();
		let m;
		if ((m = /^(text|line|cont|para)\s+"([^"]*)"/.exec(t))) {
			const s = m[2].replace(/@$/, '');
			if (m[1] === 'line' || m[1] === 'cont') out += '\n';
			if (m[1] === 'para') out += '\n\n';
			out += s;
		} else if ((m = /^text_ram wStringBuffer(\d)/.exec(t))) out += `{${m[1]}}`;
		else if (/^(text_start|text_end)$/.test(t) || t === '') continue;
		else if (/^(done|prompt)$/.test(t)) break;
		else throw new Error(`${label}: unhandled text command ${t}`);
	}
	return out.replace(/<PLAYER>/g, '{player}');
}
const farOf = label => /text_far (_\w+)/.exec(asm.slice(asm.indexOf(label + ':')))[1];
const text = {
	nothingToChoose: textOf(farOf('.NothingToChooseText')),
	whichSidePutOn: textOf(farOf('WhichSidePutOnText')),
	whichSidePutAway: textOf(farOf('WhichSidePutAwayText')),
	putAway: textOf(farOf('PutAwayTheDecoText')),
	nothingToPutAway: textOf(farOf('NothingToPutAwayText')),
	setUp: textOf(farOf('SetUpTheDecoText')),
	putAwayAndSetUp: textOf(farOf('PutAwayAndSetUpText')),
	alreadySetUp: textOf(farOf('AlreadySetUpText')),
	adorable: textOf(farOf('.LookAdorableDecoText')),
	giant: textOf(farOf('.LookGiantDecoText')),
};
// the side menu (DecoSideMenuHeader) and the player's PC (engine/events/pokecenter_pc.asm)
const sides = [...asm.slice(asm.indexOf('DecoSideMenuHeader:')).matchAll(/^\s*db "([^@]*)@"/gm)].slice(0, 3).map(m => m[1]);
const pcAsm = read('engine/events/pokecenter_pc.asm');
const pcFar = label => textOf(/text_far (_\w+)/.exec(pcAsm.slice(pcAsm.indexOf(label + ':')))[1]);
const pc = {
	turnOn: pcFar('PlayersPCTurnOnText'), askWhatDo: pcFar('PlayersPCAskWhatDoText'),
	decoration: /\.Decoration:\s+db "([^@]*)@"/.exec(pcAsm)[1], turnOff: /\.TurnOff:\s+db "([^@]*)@"/.exec(pcAsm)[1],
};

// the poster descriptions: DecorationDesc_PosterPointers -> its text (TOWN MAP: + the map)
for (const m of asm.matchAll(/dbw (DECO_\w+), (DecorationDesc_\w+)/g)) {
	const at = asm.indexOf(m[2] + ':');
	const body = asm.slice(at, asm.indexOf('\n\n', at + m[2].length + 2) + 200);
	const far = /text_far (_\w+)/.exec(asm.slice(at))?.[1];
	if (!decos[m[1]] || !far) continue;
	decos[m[1]].text = textOf(far);
	if (/special OverworldTownMap/.test(body)) decos[m[1]].townMap = true;
}

// the cells, from the decomp; the harvest confirms any block a shipped map shows.
// Carpets: the block at the top-left, then block+1, +2, +1 along the bottom row.
const blocksOf = d => d.slot === 'carpet' ? [d.block, d.block + 1, d.block + 2] : [d.block];
const req = [];
for (const d of Object.values(decos)) if (d.block != null) for (const b of blocksOf(d)) req.push({ name: ROOM, block: b });
const py = process.platform === 'win32' ? 'python' : 'python3';
const out = JSON.parse(execFileSync(py, [path.join('tools', 'crystal_block_cells.py')], { input: JSON.stringify(req), env: { ...process.env, MAGEPUNK66: MP66 }, maxBuffer: 1e8, stdio: ['pipe', 'pipe', 'ignore'] }).toString());
const maps = loadCrystalMaps(ROOT, CR);
const ts = (maps.find(m => m.name === ROOM) || {}).ts;
const harvest = makeHarvester(maps);
const ids = a => a.map(v => v & 0x3ff).join();
let confirmed = 0;
const cellsOf = (id, b) => {
	const c = out[ROOM + ':' + b];
	if (!c) throw new Error(`${id}: no cells computed for block ${b}`);
	const h = ts ? harvest(ts, b) : null;
	if (h && ids(h) !== ids(c.cells)) throw new Error(`${id}: harvest ${h} contradicts decomp ${c.cells}`);
	if (h) confirmed++;
	return h || c.cells;
};
for (const [id, d] of Object.entries(decos)) {
	if (d.block == null) continue;
	if (d.slot === 'carpet') d.carpet = blocksOf(d).map(b => cellsOf(id, b));
	else d.cells = cellsOf(id, d.block);
}

// the object sprites (tools/gen_crystal_deco_sprites.py writes the sheet)
const SPRITES = path.join('overworld', 'deco_gfx', 'sprites.json');
const sprites = fs.existsSync(SPRITES) ? JSON.parse(fs.readFileSync(SPRITES, 'utf8')) : {};
for (const [id, d] of Object.entries(decos)) if (d.sprite && !sprites[d.sprite]) throw new Error(`${id}: sprite ${d.sprite} not converted (run tools/gen_crystal_deco_sprites.py)`);

const OUT = path.join('overworld', 'crystal_decorations.json');
fs.writeFileSync(OUT, JSON.stringify({ generated: 'tools/gen_crystal_decorations.mjs', room: ROOM, init, coords, categories: cats, exit: exitLabel,
	putAway: decoNames[NAME_IDX.PUT_IT_AWAY], cancel: decoNames[NAME_IDX.CANCEL_DECO], sides, pc, text, decos }, null, 1) + '\n');
console.log(`${Object.keys(decos).length} decorations in ${cats.length} categories (${confirmed} blocks confirmed against the harvest); init ${JSON.stringify(init)}`);
console.log('wrote ' + OUT);
