// fix_form_sprites.mjs — give alternate forms their own artwork.
//
// Every form in species_battle.json carries the BASE species' sprite: Alolan
// Vulpix is `s1184.png`, which is plain Vulpix, and so is Rotom-Wash's, and
// Castform-Sunny's. The sprite id was derived from the dex number alone, and a
// form shares its base's number — so an ice Vulpix draws as a fire one in battle,
// in the party, in the Pokedex and on the design wiki.
//
// The art was there the whole time. `data/pokemon/` holds 1979 front sprites, of
// which 331 are NOT a multiple of 32 and NO species referenced any of them. The
// encoding is
//
//     sprite number = dex number * 32 + index in Showdown's formeOrder
//
// verified against the files: 3*32+1 = 97 is Mega Venusaur, 19*32+1 = 609 is
// Alolan Rattata, and Rotom's five appliances land exactly on 15329-15333.
//
// Only writes a sprite when the PNG actually exists, so a form Showdown knows
// about but this port has no art for keeps its base sprite rather than pointing
// at a 404.
//
//   node tools/fix_form_sprites.mjs            (report)
//   node tools/fix_form_sprites.mjs --write    (apply)
import fs from 'fs';
import path from 'path';

const WRITE = process.argv.includes('--write');
const D = 'overworld/data';
const DEX = path.resolve('../Magepunk66/Reference/pokemon-showdown-master/data/pokedex.ts');
const SPRITES = path.join(D, 'pokemon');
const batPath = path.join(D, 'species_battle.json');
const bat = JSON.parse(fs.readFileSync(batPath, 'utf8'));

// ---------- Showdown's forme order, which is what the sprite numbering follows ----------
const src = fs.readFileSync(DEX, 'utf8');
// pokedex.ts stores names with literal backslash-u escapes (Farfetch'd is written
// with one), so decode before normalising or it flattens to `farfetchu2019d` and
// matches nothing.
const norm = s => String(s)
	.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
	.toLowerCase().replace(/[^a-z0-9]/g, '');
// Where our id and Showdown's forme name genuinely differ. Minior's formeOrder
// lists Minior-Meteor seven times (the colour variants PS does not model) and
// then "Minior" at index 7 for the core — which is exactly where the art sits:
// s24775 exists and 24769-24774 do not.
const ALIAS = { minior_core: 'minior' };
const formeIndex = new Map();          // normalised form name -> index within its base
for (const m of src.matchAll(/formeOrder:\s*\[([^\]]*)\]/g)) {
	const names = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
	names.forEach((n, i) => { if (!formeIndex.has(norm(n))) formeIndex.set(norm(n), i); });
}

const has = n => fs.existsSync(path.join(SPRITES, `s${n}.png`));
const ALL = Object.keys(bat).filter(k => !k.startsWith('_'));

// a form is an id that shares its dex number with a different, underscore-free id
const baseByNum = new Map();
for (const id of ALL) { const n = bat[id].num; if (n > 0 && !/_/.test(id) && !baseByNum.has(n)) baseByNum.set(n, id); }
const forms = ALL.filter(id => /_/.test(id) && bat[id].num > 0 && baseByNum.has(bat[id].num) && baseByNum.get(bat[id].num) !== id);

const fixed = [], noIndex = [], noArt = [], already = [];
for (const id of forms) {
	const num = bat[id].num;
	const idx = formeIndex.get(norm(ALIAS[id] || id));
	if (idx == null) { noIndex.push(id); continue; }
	if (idx === 0) { noIndex.push(id); continue; }        // that is the base, not a form
	const want = num * 32 + idx;
	if (!has(want)) { noArt.push(`${id} -> s${want}.png`); continue; }
	const file = `s${want}.png`;
	if (bat[id].sprite === file) { already.push(id); continue; }
	fixed.push({ id, from: bat[id].sprite, to: file, back: has(`${want}-b`) });
	if (WRITE) bat[id].sprite = file;
}

console.log(`alternate forms in the dex: ${forms.length}`);
console.log(`  sprite corrected      ${fixed.length}`);
console.log(`  already correct       ${already.length}`);
console.log(`  no art shipped        ${noArt.length}   (left on the base sprite rather than a 404)`);
console.log(`  no forme index        ${noIndex.length}`);
console.log('');
console.log('a sample of what changed:');
for (const f of fixed.slice(0, 14)) console.log(`   ${f.id.padEnd(26)} ${f.from} -> ${f.to}`);
if (noArt.length) { console.log('\nno art for:'); for (const n of noArt.slice(0, 10)) console.log('   ' + n); }
if (noIndex.length) { console.log('\nno forme index for:'); console.log('   ' + noIndex.slice(0, 12).join(', ')); }

// back sprites matter too — the player's own mon is drawn from behind
const missingBack = fixed.filter(f => !f.back);
console.log(`\nof the corrected, ${fixed.length - missingBack.length} also have a back sprite; ${missingBack.length} do not`);

if (WRITE) {
	fs.writeFileSync(batPath, JSON.stringify(bat));
	console.log('\nWRITTEN to species_battle.json');
	console.log('owdata is gitignored — deploy with:');
	console.log('  npx wrangler pages deploy overworld/data --project-name=magepunk-owdata --branch=main --commit-dirty=true');
} else {
	console.log('\n(dry run — pass --write to apply)');
}
