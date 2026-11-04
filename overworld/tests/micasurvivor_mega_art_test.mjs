// micasurvivor_mega_art_test.mjs — every Mega in MicaSurvivor draws ITS OWN picture, never its base species' sheet.
//
// The gap (audit 2026-11-03): 32 Legends Z-A / Mega Dimension Megas (Mega Raichu X/Y, Clefable, Victreebel, Starmie,
// Dragonite... Absol Z, Garchomp Z, Lucario Z... Baxcalibur) had an ALIAS row in sprites-meta.js ("al": <species>): the
// game drew the base species' own sheet with a Mega aura round it, so Mega Clefable looked exactly like Clefable. In the
// Expedition 45 Megas (those 32 + the 13 Z-A ones with SpriteCollab sheets) had `spr: null` in mega-data.js and were
// composed the same way. tools/gen_mega_sprites.py now gives all 49 newer Megas overworld battle sprites (PokeAPI/sprites'
// pixel art; Mega Zygarde composed from the Legends Z-A renders), and the generators use them.
//
// Covers: micasurvivor/js/data/sprites-meta.js, micasurvivor/js/data/mega-data.js, tools/micasurvivor/gen_megas.mjs,
// tools/micasurvivor/gen_forms.mjs, tools/micasurvivor/fetch_form_sprites.py, micasurvivor/assets/pokemon/<id>/front,
// tools/cloud/micasurvivor_manifest.txt.
//   node overworld/tests/micasurvivor_mega_art_test.mjs
// (In a git worktree without the asset junctions add MAGEPUNK_ASSET_ROOT=<main checkout>.)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const ctx = { G: {}, console };
vm.createContext(ctx);
for (const f of ['micasurvivor/js/data/sprites-meta.js', 'micasurvivor/js/data/mega-data.js'])
	vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const { SPRITE_META: M, EXP_MEGA_DATA: MD } = ctx.G;
const ids = MD.map(e => e.id);
A(MD.length === 95, 'the 95 Megas and Primals of mega-data.js', MD.length);

// base Survival modes / Dive / co-op: the sprites-meta.js row
const alias = ids.filter(d => M[d] && M[d].al);
A(ids.every(d => M[d]) && !alias.length, 'no Mega row is an alias of its species\' sheet ("al")', `${alias.length}: ${alias.slice(0, 10).join()}`);
const sheetDir = d => path.join(AROOT, 'micasurvivor/assets/pokemon', String((M[d] && M[d].al) || d), (M[d] && M[d].src) || '');
const missing = ids.filter(d => M[d] && Object.keys(M[d].a).some(a => !fs.existsSync(path.join(sheetDir(d), a + '.png'))));
A(!missing.length, 'every Mega\'s sheets are on disk under its OWN id', missing.slice(0, 10).join());
// its own picture: not byte-identical to its species' Idle sheet
const sameAsBase = ids.filter(d => {
	const sp = MD.find(e => e.id === d).sp, own = path.join(sheetDir(d), 'Idle.png'), base = path.join(AROOT, 'micasurvivor/assets/pokemon', String(sp), (M[sp] && M[sp].src) || '', 'Idle.png');
	return fs.existsSync(own) && fs.existsSync(base) && fs.readFileSync(own).equals(fs.readFileSync(base));
});
A(!sameAsBase.length, 'and none of them is its species\' sheet', sameAsBase.join());
const ZA = [10304, 10305, 10278, 10279, 10280, 10281, 10282, 10283, 10307, 10308, 10309, 10310, 10285, 10311, 10286, 10288, 10291, 10313,
	10292, 10293, 10294, 10295, 10314, 10297, 10298, 10315, 10316, 10317, 10303, 10320, 10321, 10325];
A(ZA.every(d => M[d] && M[d].src === 'front' && M[d].dm && M[d].a.Idle.r === 2), 'the 32 that had no sheet draw their battle front + back (a "front" row, like the 19 Gen 6 ones)',
	JSON.stringify(ZA.filter(d => !(M[d] && M[d].src === 'front'))));

// the Expedition (js/expedition/mega.js): a battle sprite for every Mega, none composed
const noSpr = MD.filter(e => !e.spr), noFile = MD.filter(e => e.spr && !fs.existsSync(path.join(AROOT, 'overworld/data/pokemon', e.spr)));
A(!noSpr.length && !noFile.length, 'the Expedition: every Mega / Primal has its overworld battle sprite (spr), none composed from the member\'s sheet',
	JSON.stringify({ noSpr: noSpr.map(e => e.id).slice(0, 10), noFile: noFile.map(e => e.spr) }));
A(MD.find(e => e.id === 10304).spr === 's834.png' && MD.find(e => e.id === 10307).spr === 's11490.png' && MD.find(e => e.id === 10301).spr === 's22981.png',
	'Mega Raichu X s834, Mega Absol Z s11490, Mega Zygarde s22981');

const man = fs.readFileSync(path.join(ROOT, 'tools/cloud/micasurvivor_manifest.txt'), 'utf8');
const unlisted = ZA.filter(d => !man.includes('pokemon/' + d + '/front/Idle.png'));
A(!unlisted.length, 'the asset manifest lists the new sheets (deployed to magepunk-micasurvivor)', unlisted.join());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
