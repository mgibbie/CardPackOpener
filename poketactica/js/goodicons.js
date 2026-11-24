// goodicons.js — a picture for every Poketactica item (owner, 2026-11-24: the items are a figurine-maker's bits, named
// apart from the main game's, and they "don't have the same image as what they used to be"). Drawn here, as SVG: no
// image file, and never the overworld's item icons. A picture is a SHAPE (a bead, a paint pot, a marble ...) in the
// item's own colour; every item's pair of shape and colour is its own (poketactica_goodicons_test). Read by the camp
// (hub.js), Mystery Maze's bag, and the site's Inventory. Pure: the node tests read it too.
//   ids: goods.js HELD / EVO / CANDY, and mm/items.js ITEMS (the Mystery Maze bead `oran` is the held `oranberry`'s).
const K = '#1c1f24', W = '#ffffff';
const o = `stroke='${K}' stroke-width='1' stroke-linejoin='round'`;
// each shape: (c the item's colour, d a darker shade of it) -> SVG inside a 0 0 16 16 box
const SHAPES = {
	bead: (c, d) => `<circle cx='8' cy='8.5' r='5.5' fill='${c}' ${o}/><path d='M4.5 10.5a5 5 0 0 0 7 0' fill='none' stroke='${d}' stroke-width='1.5'/><circle cx='8' cy='8.5' r='1.6' fill='${K}'/><circle cx='5.8' cy='6.2' r='1.1' fill='${W}'/>`,
	paint: (c, d) => `<rect x='3' y='6' width='10' height='8' rx='1' fill='#cfd6dc' ${o}/><rect x='2.5' y='4.5' width='11' height='2.5' rx='1' fill='#8f9aa3' ${o}/><path d='M4 7h8v3.5q-1 1.6-2 0t-2 0-2 0-2 0z' fill='${c}'/><rect x='4' y='11.5' width='8' height='1' fill='${d}'/>`,
	marble: (c, d) => `<circle cx='8' cy='8' r='6' fill='${c}' ${o}/><path d='M4 9q2-5 5-2t3-2' fill='none' stroke='${W}' stroke-width='1.4' opacity='.85'/><path d='M4.5 11q3 2 6.5 0' fill='none' stroke='${d}' stroke-width='1.4'/><circle cx='5.6' cy='5.4' r='1' fill='${W}'/>`,
	pellet: (c, d) => `<g transform='rotate(-35 8 8)'><rect x='2.5' y='5.5' width='11' height='5' rx='2.5' fill='${W}' ${o}/><path d='M8 5.5h3a2.5 2.5 0 0 1 0 5H8z' fill='${c}' ${o}/><rect x='8.5' y='9' width='3' height='1' fill='${d}'/></g>`,
	bottle: (c, d) => `<rect x='6.5' y='1.5' width='3' height='3' fill='#8f9aa3' ${o}/><path d='M5 5h6l1.5 2.5V14h-9V7.5z' fill='${c}' ${o}/><rect x='4.5' y='9' width='7' height='3' fill='${W}'/><rect x='4.5' y='12.5' width='7' height='1' fill='${d}'/>`,
	ribbon: (c, d) => `<path d='M8 8L2.5 4.5v7zM8 8l5.5-3.5v7z' fill='${c}' ${o}/><path d='M6.5 9.5L5 14.5l2-1.5M9.5 9.5l1.5 5-2-1.5' fill='${d}' ${o}/><rect x='6.5' y='6.5' width='3' height='3' rx='.8' fill='${d}' ${o}/>`,
	lens: (c, d) => `<circle cx='7' cy='7' r='4.8' fill='#bfe6f5' stroke='${c}' stroke-width='2'/><circle cx='7' cy='7' r='5.8' fill='none' ${o}/><path d='M10.5 10.5l3.5 3.5' stroke='${d}' stroke-width='2.4' stroke-linecap='round'/><path d='M4.8 6a2.6 2.6 0 0 1 2-1.8' fill='none' stroke='${W}' stroke-width='1.1'/>`,
	charm: (c, d) => `<path d='M8 1.5q-3 0-3 3' fill='none' stroke='${K}' stroke-width='1.2'/><path d='M8 4l4.5 3v5L8 15l-4.5-3V7z' fill='${c}' ${o}/><path d='M8 7l2.2 1.5v2.6L8 12.6l-2.2-1.5V8.5z' fill='${d}'/><circle cx='8' cy='5.6' r='.8' fill='${K}'/>`,
	sticker: (c, d) => `<path d='M3 2.5h10v7L9.5 13.5H3z' fill='${c}' ${o}/><path d='M13 9.5H9.5v4z' fill='${W}' ${o}/><path d='M5 5.5h6M5 8h3.5' stroke='${d}' stroke-width='1.4' stroke-linecap='round'/>`,
	kit: (c, d) => `<rect x='2' y='5' width='12' height='9' rx='1' fill='${c}' ${o}/><path d='M2 5l2-3h8l2 3z' fill='${d}' ${o}/><rect x='7' y='5' width='2' height='9' fill='${W}'/><rect x='5.5' y='8' width='5' height='3' fill='${W}' ${o}/>`,
	part: (c, d) => `<path d='M7 1.5h2v2.2l1.6.7 1.6-1.6 1.4 1.4-1.6 1.6.7 1.6h2.2v2h-2.2l-.7 1.6 1.6 1.6-1.4 1.4-1.6-1.6-1.6.7v2.2H7v-2.2l-1.6-.7-1.6 1.6-1.4-1.4 1.6-1.6-.7-1.6H1.1v-2h2.2l.7-1.6-1.6-1.6 1.4-1.4 1.6 1.6 1.6-.7z' fill='${c}' ${o}/><circle cx='8' cy='8.4' r='2.2' fill='${d}' ${o}/>`,
	plate: (c, d) => `<path d='M8 1.5l5.5 2v4.5q0 4-5.5 6.5Q2.500 12 2.500 8V3.500z' fill='${c}' ${o}/><path d='M8 3.500v9q3.500-2 3.500-4.800V4.800z' fill='${d}'/><circle cx='5.500' cy='5.500' r='.7' fill='${W}'/>`,
	lump: (c, d) => `<path d='M2.500 12q-1-3 1.500-4 0-3.500 3.500-3 2-2.500 4 0 3 1 2 4 1.500 2-.5 3z' fill='${c}' ${o}/><path d='M4 12.500q4 1.200 9-.2' fill='none' stroke='${d}' stroke-width='1.400'/><circle cx='6' cy='7.500' r='1' fill='${W}' opacity='.8'/>`,
	jar: (c, d) => `<rect x='4.500' y='1.500' width='7' height='2.500' rx='.6' fill='#8f9aa3' ${o}/><path d='M4 4h8l1 2v8H3V6z' fill='#e9f3f7' ${o}/><path d='M3.500 8.500h9V13.500h-9z' fill='${c}'/><circle cx='6' cy='10' r='.8' fill='${W}'/><circle cx='9.500' cy='11.500' r='.8' fill='${W}'/><circle cx='10' cy='9.300' r='.6' fill='${d}'/>`,
	stick: (c, d) => `<path d='M3 13.500L11.500 2.500l2 1.500L5 15z' fill='${c}' ${o}/><path d='M3 13.500l2 1.500-2.500.6z' fill='${K}'/><path d='M10.300 4.100l2 1.500' stroke='${d}' stroke-width='1.300'/>`,
	cup: (c, d) => `<path d='M3 5h8.500l-1 8h-6.500z' fill='${c}' ${o}/><path d='M11.300 6.500q3 0 2.500 2.500t-3 2' fill='none' stroke='${K}' stroke-width='1.300'/><rect x='3' y='4' width='8.500' height='1.800' rx='.6' fill='${d}' ${o}/><path d='M4.500 10.500h6' stroke='${W}' stroke-width='1' opacity='.8'/>`,
	apple: (c, d) => `<path d='M8 5q-4.500-2-5 2.500Q3 13.500 6 14.500q2 .5 2-.5 0 1 2 .5 3-1 3-7Q12.500 3 8 5z' fill='${c}' ${o}/><path d='M8 5q0-2.500 1.500-3.500' fill='none' stroke='#6b4a2c' stroke-width='1.300'/><path d='M9.300 2.800q2-1.300 3 .2-1.800 1.300-3-.2z' fill='#4fa860' ${o}/><path d='M4.800 7.500q.2-1.500 1.500-1.800' fill='none' stroke='${W}' stroke-width='1.100'/><path d='M10 12.500q1.500-1 1.800-3' fill='none' stroke='${d}' stroke-width='1.200'/>`,
	drop: (c, d) => `<path d='M8 1.500Q12.500 7 12.500 10a4.500 4.500 0 0 1-9 0Q3.500 7 8 1.500z' fill='${c}' ${o}/><path d='M5.500 10.500a2.600 2.600 0 0 0 2.300 2.400' fill='none' stroke='${W}' stroke-width='1.200'/><path d='M10.800 9.500q.3 2.300-1.500 3.300' fill='none' stroke='${d}' stroke-width='1.200'/>`,
	magnet: (c, d) => `<path d='M3 2.500h3.500V9a1.500 1.500 0 0 0 3 0V2.500H13V9A5 5 0 0 1 3 9z' fill='${c}' ${o}/><rect x='3' y='2.500' width='3.500' height='2.600' fill='${W}' ${o}/><rect x='9.500' y='2.500' width='3.500' height='2.600' fill='${W}' ${o}/><path d='M5 11.500q3 2.500 6 0' fill='none' stroke='${d}' stroke-width='1.200'/>`,
	paper: (c, d) => `<path d='M3.500 1.500h7l2 2V14.500h-9z' fill='${W}' ${o}/><path d='M5.500 5h5M5.500 7.500h5M5.500 10h3' stroke='#8f9aa3' stroke-width='1.100'/><circle cx='10' cy='11.500' r='2' fill='${c}' ${o}/><path d='M9.200 13.200l-.4 2 1.200-.8 1.200.8-.4-2' fill='${d}' ${o}/>`,
	bell: (c, d) => `<path d='M8 2.500Q12 3 12 8.500l1.500 3h-11L4 8.500Q4 3 8 2.500z' fill='${c}' ${o}/><circle cx='8' cy='13.300' r='1.400' fill='${d}' ${o}/><path d='M8 1v1.500' stroke='${K}' stroke-width='1.300'/><path d='M5.500 8q0-2.800 1.800-3.600' fill='none' stroke='${W}' stroke-width='1.100'/>`,
	capsule: (c, d) => `<circle cx='8' cy='8' r='6' fill='${W}' ${o}/><path d='M2 8a6 6 0 0 1 12 0z' fill='${c}' ${o}/><rect x='2' y='7.300' width='12' height='1.400' fill='${K}'/><path d='M6 11l1.500 1.500 3-3' fill='none' stroke='${K}' stroke-width='1.200'/><path d='M4.300 5.500q1-2 3-2.300' fill='none' stroke='${W}' stroke-width='1.100'/><path d='M4.500 11.500q3.500 2.500 7 0' fill='none' stroke='${d}' stroke-width='1' opacity='.5'/>`,
	chip: (c, d) => `<path d='M4 3l6-1.500 4 4.500-2.500 7-6.500 1L2 8z' fill='${c}' ${o}/><path d='M10 1.500L8.500 7l5.500-1M8.500 7L5 14M8.500 7L2 8' fill='none' stroke='${d}' stroke-width='1'/><path d='M4.800 4.500l2.500-.7' stroke='${W}' stroke-width='1.100'/>`,
	cap: (c, d) => `<path d='M2.500 11Q2.500 3.500 8 3.500T13.500 11z' fill='${c}' ${o}/><rect x='1.500' y='10.500' width='13' height='2.500' rx='1' fill='${d}' ${o}/><path d='M5 5.500l1 2M8 4.500v2.500M11 5.500l-1 2' stroke='${K}' stroke-width='1'/>`,
	ingot: (c, d) => `<path d='M4.500 5h7l3 7h-13z' fill='${c}' ${o}/><path d='M1.500 12h13v2h-13z' fill='${d}' ${o}/><path d='M5.500 6.500h4' stroke='${W}' stroke-width='1.200'/>`,
	vest: (c, d) => `<path d='M4.500 2l2 1.500h3l2-1.500 2.500 2.500-1.500 2V14h-9V6.500L2 4.500z' fill='${c}' ${o}/><path d='M8 3.500V14' stroke='${K}' stroke-width='1'/><path d='M5 8.500h2M9 8.500h2M5 11h2M9 11h2' stroke='${d}' stroke-width='1.400'/>`,
	mould: (c, d) => `<rect x='2' y='4' width='12' height='9' rx='1.500' fill='#8f9aa3' ${o}/><ellipse cx='8' cy='8.500' rx='3.200' ry='2.600' fill='${c}' ${o}/><path d='M6.300 7.800q.8-1 2-1' fill='none' stroke='${W}' stroke-width='1'/><circle cx='3.800' cy='5.800' r='.7' fill='${d}'/><circle cx='12.200' cy='11.200' r='.7' fill='${d}'/>`,
};
export const ICON_SHAPES = Object.freeze(Object.keys(SHAPES));

const I = (shape, color) => [shape, color];
/** id -> [shape, colour]. */
export const GOOD_ICONS = Object.freeze({
	// held
	leftovers: I('lump', '#c98d5e'), blacksludge: I('lump', '#4a3f5c'),
	oranberry: I('bead', '#4a90d9'), sitrusberry: I('bead', '#f2c230'), lumberry: I('bead', '#6cc04a'), cheriberry: I('bead', '#e0463c'), chestoberry: I('bead', '#5b5fc7'),
	pechaberry: I('bead', '#f29ac0'), rawstberry: I('bead', '#3fb7a0'), aspearberry: I('bead', '#e8e08a'), persimberry: I('bead', '#f0a070'), leppaberry: I('bead', '#c2552a'),
	choiceband: I('ribbon', '#e8862e'), choicespecs: I('lens', '#e8862e'), choicescarf: I('ribbon', '#4a90d9'),
	lifeorb: I('marble', '#b05ad0'), expertbelt: I('ribbon', '#3a3f4a'), muscleband: I('ribbon', '#d8463a'), wiseglasses: I('lens', '#5b5fc7'),
	focussash: I('ribbon', '#f4d23a'), focusband: I('ribbon', '#6cc04a'), rockyhelmet: I('cap', '#9a8f7c'), shellbell: I('bell', '#f6c0d8'),
	brightpowder: I('jar', '#ffe27a'), widelens: I('lens', '#6cc04a'), scopelens: I('lens', '#d8463a'), assaultvest: I('vest', '#b0483c'),
	eviolite: I('chip', '#c59ae8'), weaknesspolicy: I('paper', '#d8463a'), whiteherb: I('lump', '#e9f3e4'), luckyegg: I('capsule', '#f4d23a'),
	charcoal: I('stick', '#3a3f4a'), mysticwater: I('drop', '#4a90d9'), magnet: I('magnet', '#d8463a'), miracleseed: I('lump', '#6cc04a'), nevermeltice: I('chip', '#9fe0ff'),
	blackbelt: I('ribbon', '#22252b'), poisonbarb: I('stick', '#8a44c2'), softsand: I('jar', '#d9b56a'), sharpbeak: I('stick', '#e8a23a'), twistedspoon: I('stick', '#b9c2c9'),
	silverpowder: I('jar', '#b9c2c9'), hardstone: I('chip', '#8a7f6e'), spelltag: I('sticker', '#8a6fc2'), dragonfang: I('charm', '#5b6fd9'), blackglasses: I('lens', '#22252b'),
	metalcoat: I('bottle', '#9aa7b3'), silkscarf: I('ribbon', '#f3ead6'),
	// evolution
	firestone: I('paint', '#e8502e'), waterstone: I('paint', '#3f8fe0'), thunderstone: I('paint', '#f4d23a'), leafstone: I('paint', '#5cb85a'), icestone: I('paint', '#9fe0ff'),
	moonstone: I('paint', '#5a5f8a'), sunstone: I('paint', '#f08a2c'), shinystone: I('paint', '#fff3b0'), duskstone: I('paint', '#6a3f9a'), dawnstone: I('paint', '#6fd9c8'),
	ovalstone: I('mould', '#e9e2d0'), linkingcord: I('charm', '#7a8f6a'), kingsrock: I('ingot', '#f4d23a'), protector: I('plate', '#a8763a'), dragonscale: I('sticker', '#3f8fe0'),
	electirizer: I('kit', '#f4d23a'), magmarizer: I('kit', '#e8502e'), upgrade: I('kit', '#5b9be0'), dubiousdisc: I('kit', '#8a44c2'), razorfang: I('part', '#d9d2c0'),
	razorclaw: I('part', '#5a5f6a'), prismscale: I('sticker', '#f29ac0'), reapercloth: I('vest', '#4a3f5c'), deepseatooth: I('part', '#7fb4d9'), deepseascale: I('sticker', '#3fb7a0'),
	sachet: I('charm', '#f29ac0'), whippeddream: I('lump', '#fbe9f1'), tartapple: I('charm', '#6cc04a'), sweetapple: I('charm', '#e0463c'), syrupyapple: I('charm', '#e8a23a'),
	crackedpot: I('cup', '#7a9a6a'), chippedpot: I('cup', '#5a7f9a'), galaricacuff: I('charm', '#c59ae8'), galaricawreath: I('charm', '#f08ab0'),
	auspiciousarmor: I('plate', '#e8502e'), maliciousarmor: I('plate', '#6a3f9a'), unremarkableteacup: I('cup', '#d9d2c0'), masterpieceteacup: I('cup', '#f4d23a'),
	metalalloy: I('ingot', '#9aa7b3'),
	// candy
	rarecandy: I('bottle', '#5b9be0'),
	// Mystery Maze (its beads are the held ones')
	apple: I('apple', '#e0463c'), bigapple: I('apple', '#f4d23a'), grimyfood: I('lump', '#7d7a45'),
	oran: I('bead', '#4a90d9'), sitrus: I('bead', '#f2c230'), pecha: I('bead', '#f29ac0'), cheri: I('bead', '#e0463c'), rawst: I('bead', '#3fb7a0'), chesto: I('bead', '#5b5fc7'),
	blastseed: I('pellet', '#e8502e'), sleepseed: I('pellet', '#5b5fc7'), stunseed: I('pellet', '#f4d23a'), warpseed: I('pellet', '#b05ad0'), quickseed: I('pellet', '#6cc04a'),
	escapeorb: I('marble', '#4a90d9'), luminousorb: I('marble', '#f4d23a'), petrifyorb: I('marble', '#8a7f6e'), slumberorb: I('marble', '#5b5fc7'), trawlorb: I('marble', '#3fb7a0'),
	gravelrock: I('chip', '#6d6558'), ironthorn: I('stick', '#6f7a85'), elixir: I('drop', '#e8a23a'), maxelixir: I('drop', '#f08ab0'),
	stars: I('capsule', '#ffd23c'),
});
// the Mystery Maze bead that is the held one under another id
export const SAME_AS = Object.freeze({ oran: 'oranberry', sitrus: 'sitrusberry', pecha: 'pechaberry', cheri: 'cheriberry', rawst: 'rawstberry', chesto: 'chestoberry' });

const shade = (hex) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * 0.68).toString(16).padStart(2, '0')).join('');
const cache = {};
/** The item's picture as an SVG (text); '' when it has none. */
export function goodIconSvg(id) {
	if (cache[id] != null) return cache[id];
	const g = GOOD_ICONS[id]; if (!g || !SHAPES[g[0]]) return (cache[id] = '');
	return (cache[id] = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'>${SHAPES[g[0]](g[1], shade(g[1]))}</svg>`);
}
export const goodIconSrc = (id) => { const s = goodIconSvg(id); return s ? 'data:image/svg+xml,' + encodeURIComponent(s) : ''; };
/** ... as an <img> (cls: extra classes). */
export const goodIconImg = (id, cls = '') => (goodIconSvg(id) ? `<img class="pt-good-ico${cls ? ' ' + cls : ''}" data-good="${id}" src="${goodIconSrc(id)}" alt="" draggable="false">` : '');
