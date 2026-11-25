// goodicons.js — a picture for every Poketactica item (owner, 2026-11-24: the items are a figurine-maker's bits, named
// apart from the main game's, and they "don't have the same image as what they used to be"). Drawn here, as SVG: no
// image file, and never the overworld's item icons. A picture is a SHAPE (a bead, a paint pot, a marble ...) in the
// item's own colour; every item's pair of shape and colour is its own (poketactica_goodicons_test). Read by the camp
// (hub.js), Mystery Maze's bag, and the site's Inventory. Pure: the node tests read it too.
//   ids: goods.js HELD / EVO / CANDY, and mm/items.js ITEMS (the Mystery Maze bead `oran` is the held `oranberry`'s).
const K = '#1c1f24', W = '#ffffff';
const o = `stroke='${K}' stroke-width='1' stroke-linejoin='round'`;
// each shape: (c the item's colour, d a darker shade of it) -> SVG inside a 0 0 16 16 box
/** A cord, a wire: a line with a dark edge. */
const line = (path, c, w = 2) => `<path d='${path}' fill='none' stroke='${K}' stroke-width='${w + 1.6}' stroke-linecap='round' stroke-linejoin='round'/><path d='${path}' fill='none' stroke='${c}' stroke-width='${w}' stroke-linecap='round' stroke-linejoin='round'/>`;
/** A five-pointed star's path. */
const star = (cx, cy, R, r) => 'M' + Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r : R; return (cx + Math.cos(a) * q).toFixed(2) + ' ' + (cy + Math.sin(a) * q).toFixed(2); }).join('L') + 'z';
const APPLE = (c, d) => `<path d='M8 5q-4.500-2-5 2.500Q3 13.500 6 14.500q2 .5 2-.5 0 1 2 .5 3-1 3-7Q12.500 3 8 5z' fill='${c}' ${o}/><path d='M4.800 7.500q.2-1.500 1.500-1.800' fill='none' stroke='${W}' stroke-width='1.100'/><path d='M10 12.500q1.500-1 1.800-3' fill='none' stroke='${d}' stroke-width='1.200'/>`;
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
	apple: (c, d) => `${APPLE(c, d)}<path d='M8 5q0-2.500 1.500-3.500' fill='none' stroke='#6b4a2c' stroke-width='1.300'/><path d='M9.300 2.800q2-1.300 3 .2-1.800 1.300-3-.2z' fill='#4fa860' ${o}/>`,
	drop: (c, d) => `<path d='M8 1.500Q12.500 7 12.500 10a4.500 4.500 0 0 1-9 0Q3.500 7 8 1.500z' fill='${c}' ${o}/><path d='M5.500 10.500a2.600 2.600 0 0 0 2.300 2.400' fill='none' stroke='${W}' stroke-width='1.200'/><path d='M10.800 9.500q.3 2.300-1.500 3.300' fill='none' stroke='${d}' stroke-width='1.200'/>`,
	magnet: (c, d) => `<path d='M3 2.500h3.500V9a1.500 1.500 0 0 0 3 0V2.500H13V9A5 5 0 0 1 3 9z' fill='${c}' ${o}/><rect x='3' y='2.500' width='3.500' height='2.600' fill='${W}' ${o}/><rect x='9.500' y='2.500' width='3.500' height='2.600' fill='${W}' ${o}/><path d='M5 11.500q3 2.500 6 0' fill='none' stroke='${d}' stroke-width='1.200'/>`,
	paper: (c, d) => `<path d='M3.500 1.500h7l2 2V14.500h-9z' fill='${W}' ${o}/><path d='M5.500 5h5M5.500 7.500h5M5.500 10h3' stroke='#8f9aa3' stroke-width='1.100'/><circle cx='10' cy='11.500' r='2' fill='${c}' ${o}/><path d='M9.200 13.200l-.4 2 1.200-.8 1.200.8-.4-2' fill='${d}' ${o}/>`,
	bell: (c, d) => `<path d='M8 2.500Q12 3 12 8.500l1.500 3h-11L4 8.500Q4 3 8 2.500z' fill='${c}' ${o}/><circle cx='8' cy='13.300' r='1.400' fill='${d}' ${o}/><path d='M8 1v1.500' stroke='${K}' stroke-width='1.300'/><path d='M5.500 8q0-2.800 1.800-3.600' fill='none' stroke='${W}' stroke-width='1.100'/>`,
	capsule: (c, d) => `<path d='M2.500 8.500a5.500 6 0 0 1 11 0z' fill='#e9f3f7' ${o}/><path d='M2.500 8.500h11a5.500 5.500 0 0 1-11 0z' fill='${c}' ${o}/><path d='${star(8, 6, 2.400, 1)}' fill='${d}'/><path d='M4.500 6.500q.6-2.200 2.400-2.900' fill='none' stroke='${W}' stroke-width='1.100'/><path d='M4.500 10.500q3.500 2.400 7 0' fill='none' stroke='${d}' stroke-width='1.200'/>`,
	chip: (c, d) => `<path d='M4 3l6-1.500 4 4.500-2.500 7-6.500 1L2 8z' fill='${c}' ${o}/><path d='M10 1.500L8.500 7l5.500-1M8.500 7L5 14M8.500 7L2 8' fill='none' stroke='${d}' stroke-width='1'/><path d='M4.800 4.500l2.500-.7' stroke='${W}' stroke-width='1.100'/>`,
	cap: (c, d) => `<path d='M2.500 11Q2.500 3.500 8 3.500T13.500 11z' fill='${c}' ${o}/><rect x='1.500' y='10.500' width='13' height='2.500' rx='1' fill='${d}' ${o}/><path d='M5 5.500l1 2M8 4.500v2.500M11 5.500l-1 2' stroke='${K}' stroke-width='1'/>`,
	ingot: (c, d) => `<path d='M4.500 5h7l3 7h-13z' fill='${c}' ${o}/><path d='M1.500 12h13v2h-13z' fill='${d}' ${o}/><path d='M5.500 6.500h4' stroke='${W}' stroke-width='1.200'/>`,
	vest: (c, d) => `<path d='M4.500 2l2 1.500h3l2-1.500 2.500 2.500-1.500 2V14h-9V6.500L2 4.500z' fill='${c}' ${o}/><path d='M8 3.500V14' stroke='${K}' stroke-width='1'/><path d='M5 8.500h2M9 8.500h2M5 11h2M9 11h2' stroke='${d}' stroke-width='1.400'/>`,
	mould: (c, d) => `<rect x='2' y='4' width='12' height='9' rx='1.500' fill='#8f9aa3' ${o}/><ellipse cx='8' cy='8.500' rx='3.200' ry='2.600' fill='${c}' ${o}/><path d='M6.300 7.800q.8-1 2-1' fill='none' stroke='${W}' stroke-width='1'/><circle cx='3.800' cy='5.800' r='.7' fill='${d}'/><circle cx='12.200' cy='11.200' r='.7' fill='${d}'/>`,
	// (second pass, owner 2026-11-24: "improve the weaker pictures": a shape for what each of these IS, in place of a stock lump, stick or tag)
	star: (c, d) => `<path d='${star(8, 8.400, 6.600, 2.900)}' fill='${c}' ${o}/><path d='${star(8, 8.400, 3, 1.300)}' fill='${W}' opacity='.7'/><path d='M4.500 12.500l3.500-2 3.500 2' fill='none' stroke='${d}' stroke-width='1'/>`,
	string: (c, d) => `${line('M3 4.500q5-3.500 10 0t-10 4q5 4.500 10 .5', c, 1.800)}${line('M13 9q1.500 2.500-.5 5', d, 1.400)}`,
	wire: (c, d) => `${line('M2.500 13.500l2.500-3-2-1.500 4-2.500-2-1.500 4-2.500 4-.5', c, 1.300)}<circle cx='13.500' cy='2' r='1.300' fill='${d}' ${o}/>`,
	pin: (c, d) => `${line('M6.500 6.500l7 8', '#cfd6dc', 1)}<circle cx='5.200' cy='5.200' r='3.400' fill='${c}' ${o}/><path d='M3.300 6.800a2.600 2.600 0 0 0 3.800 .4' fill='none' stroke='${d}' stroke-width='1.200'/><circle cx='4.200' cy='4.100' r='.9' fill='${W}'/>`,
	tack: (c, d) => `${line('M8 9v5.500', '#cfd6dc', 1)}<path d='M6.300 4.500h3.400l.8 4.500h-5z' fill='${d}' ${o}/><ellipse cx='8' cy='4' rx='5' ry='2.200' fill='${c}' ${o}/><ellipse cx='8' cy='9' rx='3.400' ry='1.300' fill='${c}' ${o}/><path d='M5 3.600q1.500-1 3-1' fill='none' stroke='${W}' stroke-width='1'/>`,
	nib: (c, d) => `<path d='M8 14.800L4.300 7.500 5.800 1.500h4.400l1.500 6z' fill='${c}' ${o}/><path d='M8 14.800V8.500' stroke='${K}' stroke-width='1'/><circle cx='8' cy='7.300' r='1.100' fill='${K}'/><path d='M5.800 4h4.400' stroke='${d}' stroke-width='1.300'/><path d='M5.600 7.500l.8-3' stroke='${W}' stroke-width='.9'/>`,
	bud: (c, d) => `${line('M8 14.500V8.500', '#4f8a3c', 1.400)}<path d='M8 9.500Q2.500 9.500 2.500 3.500 8 3.500 8 9.500z' fill='${c}' ${o}/><path d='M8 9.500q5.500 0 5.500-6-5.500 0-5.500 6z' fill='${d}' ${o}/><path d='M4 5l3 3.500' stroke='${W}' stroke-width='.9' opacity='.8'/><ellipse cx='8' cy='14.300' rx='3.500' ry='1' fill='#6b4a2c' ${o}/>`,
	tuft: (c, d) => `<circle cx='4.800' cy='10' r='3.300' fill='${c}' ${o}/><circle cx='11.200' cy='10' r='3.300' fill='${c}' ${o}/><circle cx='8' cy='6.800' r='3.800' fill='${c}' ${o}/><path d='M3.200 12.500h9.600' stroke='${c}' stroke-width='2.400'/><path d='M3 13.500q5 1.200 10 0' fill='none' stroke='${d}' stroke-width='1.300'/><path d='M6 6.500q.7-1.500 2-1.700M3.600 9.500q.3-.9 1-1.200' fill='none' stroke='${W}' stroke-width='.9'/>`,
	fang: (c, d) => `<path d='M3.500 2.500q6-1.500 9 1 .5 6-5 11.500 0-7-4-12.500z' fill='${c}' ${o}/><path d='M10.800 5q-.3 4-2.300 6.800' fill='none' stroke='${d}' stroke-width='1.300'/><path d='M5.500 3.800q2.200-.6 4 0' fill='none' stroke='${W}' stroke-width='1'/>`,
	claw: (c, d) => `<path d='M2.500 5q6-5 10.500 0 2 5-2.500 9.500 1-6-8-9.500z' fill='${c}' ${o}/><path d='M5 4.500q4-2 6.500 1' fill='none' stroke='${W}' stroke-width='1' opacity='.8'/><path d='M12 8q.4 2.500-1 5' fill='none' stroke='${d}' stroke-width='1.200'/><rect x='1.500' y='4' width='2.600' height='2.600' rx='.6' fill='#8f9aa3' ${o}/>`,
	base: (c, d) => `<path d='M2 9.500v2.500a6 2.600 0 0 0 12 0V9.500z' fill='${d}' ${o}/><ellipse cx='8' cy='9.500' rx='6' ry='2.600' fill='${c}' ${o}/><path d='M5.300 9V4l1.600 1.600L8 3.200l1.100 2.400L10.700 4v5z' fill='#f4d23a' ${o}/><rect x='5.300' y='8' width='5.400' height='1.300' fill='#c9a227' ${o}/>`,
	felt: (c, d) => `<path d='M2 5.500l8-3 4 2v6.500l-8 3-4-2z' fill='${c}' ${o}/><path d='M6 14V7.500l8-3' fill='none' stroke='${K}' stroke-width='1'/><path d='M2 5.500l4 2' stroke='${K}' stroke-width='1'/><path d='M7.500 9l5-1.900M7.500 11.200l5-1.900' stroke='${d}' stroke-width='1' stroke-dasharray='1.200 1'/>`,
	applecharm: (c, d) => `<path d='M8 4.200q0-3-2.800-3' fill='none' stroke='${K}' stroke-width='1.200'/><circle cx='4.600' cy='1.600' r='1.100' fill='none' stroke='${K}' stroke-width='1'/><g transform='translate(1.900 3.500) scale(.76)'>${APPLE(c, d)}<path d='M9.300 3.300q2-1.300 3 .2-1.800 1.300-3-.2z' fill='#4fa860' ${o}/></g>`,
	pouch: (c, d) => `<path d='M5 6.500h6q3.500 4 1.800 7.500H3.200Q1.500 10.500 5 6.500z' fill='${c}' ${o}/><path d='M5.200 6.500L4 3q4-1.500 8 0l-1.200 3.500z' fill='${d}' ${o}/>${line('M4.800 6.600h6.400', '#f4d23a', .9)}<path d='${star(8, 10.600, 2.200, .9)}' fill='${W}' opacity='.85'/>`,
	ring: (c, d) => `<ellipse cx='8' cy='8.500' rx='5.300' ry='4.800' fill='none' stroke='${K}' stroke-width='4.200'/><ellipse cx='8' cy='8.500' rx='5.300' ry='4.800' fill='none' stroke='${c}' stroke-width='2.600'/><path d='M3.500 10.500q4.500 4 9 0' fill='none' stroke='${d}' stroke-width='1.200'/><path d='M8 1.200l2 2.400-2 2.400-2-2.400z' fill='${W}' ${o}/>`,
	garland: (c, d) => `<ellipse cx='8' cy='8.500' rx='5' ry='4.600' fill='none' stroke='${K}' stroke-width='3.800'/><ellipse cx='8' cy='8.500' rx='5' ry='4.600' fill='none' stroke='#4fa860' stroke-width='2.200'/>${[[8, 3.900], [12.700, 7.200], [11, 12.300], [5, 12.300], [3.300, 7.200]].map(([x, y]) => `<circle cx='${x}' cy='${y}' r='1.900' fill='${c}' ${o}/><circle cx='${x}' cy='${y}' r='.7' fill='${W}'/>`).join('')}`,
	swirl: (c, d) => `<path d='M2 13.500q-.3-3 2.600-3.600-.2-2.600 2.600-3.100-.6-2.300 1.200-4.300 2.300 1.800 1.200 4 2.700.4 2.600 3.300 2.400.6 1.800 3.700z' fill='${c}' ${o}/><path d='M4.600 9.900q3.500-1 6.800.2M7.200 6.800q1.600-.5 3.200.1' fill='none' stroke='${d}' stroke-width='1.100'/><path d='M8.300 4.300q.4-.9.2-1.500' fill='none' stroke='${d}' stroke-width='1'/>`,
	tube: (c, d) => `<g transform='rotate(-38 8 8)'><path d='M4.500 4h7l-1 8.500h-5z' fill='${c}' ${o}/><rect x='4.500' y='2.500' width='7' height='2' fill='${d}' ${o}/><rect x='6.700' y='12.500' width='2.600' height='2' fill='#cfd6dc' ${o}/><path d='M6 6.500h4' stroke='${W}' stroke-width='1.200'/></g><circle cx='3.600' cy='14' r='1.300' fill='${c}' ${o}/>`,
	// (the Item World, owner 2026-11-24) a plush gemstone: a faceted stone sewn of cloth, its stitches showing; and what joins two
	gem: (c, d) => `<path d='M5 2.500h6l3.500 4-6.500 8-6.500-8z' fill='${c}' ${o}/><path d='M1.500 6.500h13M5 2.500l1.500 4 1.500 8 1.500-8 1.500-4' fill='none' stroke='${d}' stroke-width='1'/><path d='M3.500 5.500l1.200-1.300M11.300 4.200l1.200 1.300M6.800 10l.7 1.800M9.200 10l-.7 1.800' stroke='${W}' stroke-width='.9' stroke-dasharray='.9 .7'/><path d='M5.800 3.600h2.400' stroke='${W}' stroke-width='1.100'/>`,
	spool: (c, d) => `<rect x='2.500' y='2' width='8' height='2.200' rx='.6' fill='#c98d5e' ${o}/><rect x='2.500' y='11.800' width='8' height='2.200' rx='.6' fill='#c98d5e' ${o}/><rect x='3.500' y='4.200' width='6' height='7.600' fill='${c}' ${o}/><path d='M3.500 6.200h6M3.500 8h6M3.500 9.800h6' stroke='${d}' stroke-width='1'/>${line('M9.500 9q3 .5 3.500-3', c, .8)}<path d='M13.500 1.500l1 9-1 3.500-1-3.500z' fill='#cfd6dc' ${o}/><ellipse cx='13.500' cy='3.600' rx='.4' ry='1' fill='${K}'/>`,
};
export const ICON_SHAPES = Object.freeze(Object.keys(SHAPES));

const I = (shape, color) => [shape, color];
/** id -> [shape, colour]. */
export const GOOD_ICONS = Object.freeze({
	// held
	leftovers: I('lump', '#c98d5e'), blacksludge: I('tube', '#4a3f5c'),
	oranberry: I('bead', '#4a90d9'), sitrusberry: I('bead', '#f2c230'), lumberry: I('bead', '#6cc04a'), cheriberry: I('bead', '#e0463c'), chestoberry: I('bead', '#5b5fc7'),
	pechaberry: I('bead', '#f29ac0'), rawstberry: I('bead', '#3fb7a0'), aspearberry: I('bead', '#e8e08a'), persimberry: I('bead', '#f0a070'), leppaberry: I('bead', '#c2552a'),
	choiceband: I('ribbon', '#e8862e'), choicespecs: I('lens', '#e8862e'), choicescarf: I('ribbon', '#4a90d9'),
	lifeorb: I('marble', '#b05ad0'), expertbelt: I('ribbon', '#3a3f4a'), muscleband: I('ribbon', '#d8463a'), wiseglasses: I('lens', '#5b5fc7'),
	focussash: I('ribbon', '#f4d23a'), focusband: I('ribbon', '#6cc04a'), rockyhelmet: I('cap', '#9a8f7c'), shellbell: I('bell', '#f6c0d8'),
	brightpowder: I('jar', '#ffe27a'), widelens: I('lens', '#6cc04a'), scopelens: I('lens', '#d8463a'), assaultvest: I('vest', '#b0483c'),
	eviolite: I('chip', '#c59ae8'), weaknesspolicy: I('paper', '#d8463a'), whiteherb: I('tuft', '#e9f3e4'), luckyegg: I('capsule', '#f4d23a'),
	charcoal: I('stick', '#3a3f4a'), mysticwater: I('drop', '#4a90d9'), magnet: I('magnet', '#d8463a'), miracleseed: I('bud', '#6cc04a'), nevermeltice: I('chip', '#9fe0ff'),
	blackbelt: I('ribbon', '#22252b'), poisonbarb: I('pin', '#8a44c2'), softsand: I('jar', '#d9b56a'), sharpbeak: I('nib', '#e8a23a'), twistedspoon: I('wire', '#b9c2c9'),
	silverpowder: I('jar', '#b9c2c9'), hardstone: I('chip', '#8a7f6e'), spelltag: I('sticker', '#8a6fc2'), dragonfang: I('fang', '#5b6fd9'), blackglasses: I('lens', '#22252b'),
	metalcoat: I('bottle', '#9aa7b3'), silkscarf: I('ribbon', '#f3ead6'),
	// evolution
	firestone: I('paint', '#e8502e'), waterstone: I('paint', '#3f8fe0'), thunderstone: I('paint', '#f4d23a'), leafstone: I('paint', '#5cb85a'), icestone: I('paint', '#9fe0ff'),
	moonstone: I('paint', '#5a5f8a'), sunstone: I('paint', '#f08a2c'), shinystone: I('paint', '#fff3b0'), duskstone: I('paint', '#6a3f9a'), dawnstone: I('paint', '#6fd9c8'),
	ovalstone: I('mould', '#e9e2d0'), linkingcord: I('string', '#d99a5e'), kingsrock: I('base', '#9a8f7c'), protector: I('plate', '#a8763a'), dragonscale: I('sticker', '#3f8fe0'),
	electirizer: I('kit', '#f4d23a'), magmarizer: I('kit', '#e8502e'), upgrade: I('kit', '#5b9be0'), dubiousdisc: I('kit', '#8a44c2'), razorfang: I('fang', '#efe8d6'),
	razorclaw: I('claw', '#5a5f6a'), prismscale: I('sticker', '#f29ac0'), reapercloth: I('felt', '#4a3f5c'), deepseatooth: I('fang', '#7fb4d9'), deepseascale: I('sticker', '#3fb7a0'),
	sachet: I('pouch', '#f29ac0'), whippeddream: I('swirl', '#fbe9f1'), tartapple: I('applecharm', '#6cc04a'), sweetapple: I('applecharm', '#e0463c'), syrupyapple: I('applecharm', '#e8a23a'),
	crackedpot: I('cup', '#7a9a6a'), chippedpot: I('cup', '#5a7f9a'), galaricacuff: I('ring', '#c59ae8'), galaricawreath: I('garland', '#f08ab0'),
	auspiciousarmor: I('plate', '#e8502e'), maliciousarmor: I('plate', '#6a3f9a'), unremarkableteacup: I('cup', '#d9d2c0'), masterpieceteacup: I('cup', '#f4d23a'),
	metalalloy: I('ingot', '#9aa7b3'),
	// candy
	rarecandy: I('bottle', '#5b9be0'),
	// Mystery Maze (its beads are the held ones')
	apple: I('apple', '#e0463c'), bigapple: I('apple', '#f4d23a'), grimyfood: I('lump', '#7d7a45'),
	oran: I('bead', '#4a90d9'), sitrus: I('bead', '#f2c230'), pecha: I('bead', '#f29ac0'), cheri: I('bead', '#e0463c'), rawst: I('bead', '#3fb7a0'), chesto: I('bead', '#5b5fc7'),
	blastseed: I('pellet', '#e8502e'), sleepseed: I('pellet', '#5b5fc7'), stunseed: I('pellet', '#f4d23a'), warpseed: I('pellet', '#b05ad0'), quickseed: I('pellet', '#6cc04a'),
	escapeorb: I('marble', '#4a90d9'), luminousorb: I('marble', '#f4d23a'), petrifyorb: I('marble', '#8a7f6e'), slumberorb: I('marble', '#5b5fc7'), trawlorb: I('marble', '#3fb7a0'),
	gravelrock: I('chip', '#6d6558'), ironthorn: I('tack', '#6f7a85'), elixir: I('drop', '#e8a23a'), maxelixir: I('drop', '#f08ab0'),
	stars: I('star', '#ffd23c'),
	// the Item World's own: the kit, and the six plush gemstones (asked for as 'gem-<stat>': a gemstone's level changes no picture)
	stitchingkit: I('spool', '#d8463a'), pullcord: I('string', '#f4d23a'),
	'gem-hp': I('gem', '#3fbf6f'), 'gem-atk': I('gem', '#e0463c'), 'gem-def': I('gem', '#b0483c'), 'gem-spa': I('gem', '#3f8fe0'), 'gem-spd': I('gem', '#9a5fd0'), 'gem-spe': I('gem', '#f4c430'),
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
