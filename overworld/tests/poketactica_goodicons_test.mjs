// poketactica_goodicons_test.mjs — every Poketactica item has a PICTURE of its own (owner, 2026-11-24: the items are
// figurine versions, named apart from the main game's, and "don't have the same image as what they used to be").
// poketactica/js/goodicons.js draws them in code: never the overworld's item icons. The Inventory side (the Poketactica
// section: figurines, held items, evolution items, polish, the Mystery Maze storage) is inventory_trade_test.mjs.
//   node overworld/tests/poketactica_goodicons_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HELD, EVO, CANDY, KIT } from '../../poketactica/js/goods.js';
import { GEM_STATS } from '../../poketactica/js/gear.js';
import { ITEMS as MM_ITEMS, PELLET_COLOURS } from '../../poketactica/js/mm/items.js';
import { GOOD_ICONS, ICON_SHAPES, SAME_AS, goodIconSvg, goodIconSrc, goodIconImg } from '../../poketactica/js/goodicons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 500) : '')); } };

// (the Stitching Kit and the six plush gemstones are the Item World's: a gemstone is asked for as 'gem-<stat>')
const ids = [...Object.keys(HELD), ...Object.keys(EVO), ...Object.keys(CANDY), ...Object.keys(MM_ITEMS).filter((id) => MM_ITEMS[id].group !== 'good'), ...PELLET_COLOURS.map((c) => 'pellet-' + c.toLowerCase()), ...Object.keys(KIT), ...GEM_STATS.map((s) => 'gem-' + s)];
A(ids.length === new Set(ids).size && ids.length > 100, 'the items: held, evolution, polish and the Mystery Maze\'s (' + ids.length + '), no id twice');
A(ids.every((id) => goodIconSvg(id)), 'every item has a picture', ids.filter((id) => !goodIconSvg(id)));
A(Object.keys(GOOD_ICONS).every((id) => ids.includes(id)), 'no picture without an item', Object.keys(GOOD_ICONS).filter((id) => !ids.includes(id)));
A(Object.values(GOOD_ICONS).every(([shape, color]) => ICON_SHAPES.includes(shape) && /^#[0-9a-f]{6}$/.test(color)), 'each is a known shape in a colour');
// a picture of its own: no two items share a shape AND a colour (a Mystery Maze bead IS the held bead, and looks it)
{
	const seen = {}, same = [];
	for (const id of ids) { const k = GOOD_ICONS[id].join(), o = seen[k]; if (o && SAME_AS[id] !== o && SAME_AS[o] !== id) same.push(id + ' = ' + o); seen[k] = seen[k] || id; }
	A(!same.length, 'no two items look the same', same);
	A(Object.entries(SAME_AS).every(([a, b]) => MM_ITEMS[a] && HELD[b] && MM_ITEMS[a].name === HELD[b].name && goodIconSvg(a) === goodIconSvg(b)), 'a Mystery Maze bead is the held bead: same name, same picture');
	A(new Set(ids.map(goodIconSvg)).size === ids.length - Object.keys(SAME_AS).length, 'so the pictures are all different');
}
// drawn here: an SVG, no file behind it; never the main game's item icons
{
	const svgs = ids.map(goodIconSvg);
	A(svgs.every((s) => s.startsWith("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>") && s.endsWith('</svg>')), 'each is an SVG');
	A(svgs.every((s) => !/href|<image|url\(|item_icons|\.png/.test(s)), 'with no image file behind it: not the overworld\'s item icons');
	A(svgs.every((s) => !/undefined|NaN/.test(s)), 'and nothing left undrawn');
	A(/^data:image\/svg\+xml,%3Csvg/.test(goodIconSrc('leftovers')) && !/["<>]/.test(goodIconSrc('leftovers')), 'as an image source it is safe inside an attribute');
	A(/^<img class="pt-good-ico is-big" data-good="firestone" src="data:image\/svg\+xml,[^"]+" alt="" draggable="false">$/.test(goodIconImg('firestone', 'is-big')), 'the picture\'s markup');
	A(goodIconSvg('nope') === '' && goodIconSrc('nope') === '' && goodIconImg('nope') === '', 'an unknown item: no picture');
	A(goodIconSvg('lifeorb') === goodIconSvg('lifeorb'), 'the same each time');
}
// a kind looks its kind: beads, paints, marbles, pellets
A(Object.keys(HELD).filter((id) => /berry$/.test(id)).every((id) => GOOD_ICONS[id][0] === 'bead') && Object.keys(EVO).filter((id) => /stone$/.test(id) && id !== 'ovalstone').every((id) => GOOD_ICONS[id][0] === 'paint'), 'beads look like beads, paints like paint pots');
A(Object.keys(MM_ITEMS).filter((id) => MM_ITEMS[id].group === 'orb').every((id) => GOOD_ICONS[id][0] === 'marble') && Object.keys(MM_ITEMS).filter((id) => MM_ITEMS[id].group === 'seed').every((id) => GOOD_ICONS[id][0] === 'pellet'), 'marbles like marbles, pellets like pellets');
// the pages use them: the camp's shop and held screens, Mystery Maze's bag, the site's Inventory
{
	const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
	A(/goodIconImg\(gid\)/.test(src('poketactica/js/hub.js')) && /goodIconImg\(hid\)/.test(src('poketactica/js/hub.js')) && /goodIconImg\(item\)/.test(src('poketactica/js/hub.js')), 'the camp shows them: the shop, a figurine\'s held item, the Mystery Maze storage');
	A(src('poketactica/js/mmmode.js').includes('goodIconImg(iconIn(S, it))'), 'Mystery Maze\'s bag shows them (an unknown pellet by its colour: mm/items.js iconIn)');
	A(/goodIconImg\(r\.id\)/.test(src('inventory/inventory.js')) && /ptThings/.test(src('inventory/inventory.js')), 'the Inventory shows them, in its Poketactica section');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
