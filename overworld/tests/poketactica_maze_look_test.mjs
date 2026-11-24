// poketactica_maze_look_test.mjs — Tower Defense's look (owner, 2026-11-24): the heroes' PORTRAITS, drawn in code
// (td/portraits.js), and the SCENERY round each board (td/scenery.js: a plain layout; scenery3d.js draws it). Neither is
// part of play. The page side (the corner HUD, the big numbers, the bursts) is poketactica_maze_page_test.mjs.
//   node overworld/tests/poketactica_maze_look_test.mjs
import { HEROES } from '../../poketactica/js/td/heroes.js';
import { PORTRAITS, PORTRAIT_SIZE, portraitSvg, portraitSrc, portraitImg, portraitProblems } from '../../poketactica/js/td/portraits.js';
import { SCENERY, REACH, sceneryProps, tallOf, maxTall, outside } from '../../poketactica/js/td/scenery.js';
import { TD_MAPS, MAZE_MAPS } from '../../poketactica/js/td/maps.js';
import { buildMap } from '../../poketactica/js/campaign.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 400) : '')); } };

// ---------- portraits
{
	const ids = HEROES.map((h) => h.id);
	A(portraitProblems(ids).length === 0, 'every hero has a portrait: 20 rows of 20 known letters', portraitProblems(ids));
	A(portraitProblems(['nobody']).length === 1 && portraitProblems(['brock']).length === 0, 'a hero with no portrait is caught');
	A(Object.keys(PORTRAITS).every((id) => ids.includes(id)), 'no portrait without a hero', Object.keys(PORTRAITS));
	const svgs = ids.map(portraitSvg);
	A(svgs.every((s) => s.startsWith('<svg') && s.endsWith('</svg>') && s.includes(`viewBox='0 0 ${PORTRAIT_SIZE} ${PORTRAIT_SIZE}'`) && s.includes("shape-rendering='crispEdges'") && (s.match(/<rect /g) || []).length > 60), 'each is an SVG of crisp pixels');
	A(new Set(svgs).size === ids.length, 'no two heroes look alike');
	A(svgs.every((s) => !/href|<image|url\(/.test(s)), 'drawn here: no image file behind it');
	// every pixel is inside the picture, and a face is there: skin, hair, eyes or brows, a mouth, clothes
	A(ids.every((id) => { const t = PORTRAITS[id].rows.join(''); return ['s', 'h', 'm', 'c', 'k'].every((ch) => t.includes(ch)) && (t.includes('e') || t.includes('E')); }), 'each has skin, hair, eyes, a mouth and clothes');
	A(ids.every((id) => { const p = PORTRAITS[id].pal; return p.s !== p.h && p.h !== p.c && p['.'] !== p.h && p['.'] !== p.s; }), 'hair, skin, clothes and the backdrop are told apart');
	A(portraitSvg('nobody') === '' && portraitSrc('nobody') === '', 'nobody: no picture');
	A(/^data:image\/svg\+xml,%3Csvg/.test(portraitSrc('lance')) && !/["<>]/.test(portraitSrc('lance')), 'as an image source it is safe inside an attribute');
	A(/^<img class="pt-hero-pic is-big" data-hero="misty" src="data:image\/svg\+xml,[^"]+" alt="" draggable="false">$/.test(portraitImg('misty', 'is-big')), 'the picture\'s markup');
	A(portraitSvg('erika') === portraitSvg('erika'), 'the same each time');
}

// ---------- scenery
{
	const all = [...TD_MAPS, ...MAZE_MAPS];
	A(all.every((m) => SCENERY[m.scenery]), 'every Tower Defense map names its surround', all.map((m) => m.id + ':' + m.scenery));
	A(['mz-field:woods', 'mz-pincer:crags', 'mz-lake:lake'].every((s) => all.some((m) => m.id + ':' + m.scenery === s)), 'Maze Builder: woods round the field, crags round the pincer, the lake round the ridge');
	for (const m of all) {
		const b = buildMap({ ...m, foes: [] }), props = sceneryProps(b, m.scenery);
		A(props.length > 80, m.id + ': a surround of ' + props.length + ' things');
		A(JSON.stringify(sceneryProps(b, m.scenery)) === JSON.stringify(props), m.id + ': the same each time');
		A(props.every((p) => outside(p.x, p.z, b.w, b.h) >= 1.2 && Math.abs(outside(p.x, p.z, b.w, b.h) - p.d) < 1e-9 && p.d <= REACH), m.id + ': nothing stands on the board or against it');
		// nothing hides a tile: each thing is no taller than its distance allows (the camera looks down at 0.62 rad)
		const tall = props.filter((p) => tallOf(m.scenery, p) > maxTall(m.scenery, p.d) + 1e-9);
		A(tall.length === 0 && props.every((p) => tallOf(m.scenery, p) > 0), m.id + ': everything is low enough for where it stands', tall.slice(0, 3));
		const drop = SCENERY[m.scenery].y < -1 ? 1.6 : 0.62;
		A(props.every((p) => (tallOf(m.scenery, p) - drop) / Math.tan(0.62) <= p.d * 2 + 1e-9), m.id + ': so the ground it hides, seen from the camera, stops short of the board');
	}
	const f = buildMap({ ...MAZE_MAPS[0], foes: [] });
	A(sceneryProps(f, 'nothing').length === 0, 'an unknown surround: nothing');
	A(new Set(sceneryProps(f, 'woods').map((p) => p.k)).has('tree') && new Set(sceneryProps(f, 'crags').map((p) => p.k)).has('crag') && new Set(sceneryProps(f, 'lake').map((p) => p.k)).has('pad'), 'woods have trees, crags have crags, the lake has lily pads');
	// the board itself is untouched: a built map carries no scenery (the page names it), so the sim never sees it
	A(!('scenery' in f), 'the sim\'s map knows nothing of it');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
