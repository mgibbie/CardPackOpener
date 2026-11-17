// art_drawn.js — this game's own drawings for the Trainer cards the site has no sprite or icon for.
//
// Nothing here is Pokémon TCG Pocket's artwork: every picture is drawn in code below, as plain SVG. Three kinds:
//   DRAWN_ITEMS    an Item, Tool or Fossil card: an icon on a 32x32 canvas
//   DRAWN_SCENES   a Stadium card: a small landscape on a 48x32 canvas that fills the art window
//   DRAWN_PEOPLE   a Supporter with no walking sheet on the site: a 16x32 pixel figure in the manner of those sheets,
//                  built from a short description (hair, clothes, colours)
// drawnArt(card) returns the markup for a card's art window, or '' if the card is not drawn here.

const O = '#2a2d3d';   // the outline every icon shares
const P = (d, f, o = O, w = 1.3) => `<path d="${d}" fill="${f}" stroke="${o}" stroke-width="${w}"/>`;
const C = (x, y, r, f, o = O, w = 1.3) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" stroke="${o}" stroke-width="${w}"/>`;
const E = (x, y, rx, ry, f, o = O, w = 1.3) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${f}" stroke="${o}" stroke-width="${w}"/>`;
const R = (x, y, w, h, rx, f, o = O, sw = 1.3) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${f}" stroke="${o}" stroke-width="${sw}"/>`;
const L = (d, o = O, w = 1.3) => `<path d="${d}" fill="none" stroke="${o}" stroke-width="${w}"/>`;
const N = 'none';
const shine = (x, y, r = 1.6) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity=".8"/>`;
const bolt = (x, y, s = 1, f = '#ffd43b') => P(`M${x + 2 * s} ${y}l-${4 * s} ${6 * s}h${3 * s}l-${1.5 * s} ${5 * s} ${5 * s}-${7 * s}h-${3 * s}z`, f, O, 1);
const star = (x, y, r, f = '#ffd43b', o = O) => { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.45 : r; d += (i ? 'L' : 'M') + (x + Math.cos(a) * q).toFixed(1) + ' ' + (y + Math.sin(a) * q).toFixed(1); } return P(d + 'z', f, o, 1); };
const rock = f => P('M6 24c-2-5 0-12 5-15 5-4 12-3 15 2 3 5 2 10-1 13-5 3-14 3-19 0z', f);
const cape = (f, trim, extra = '') => P('M10 6c4 2 8 2 12 0l5 20c-7 3-15 3-22 0z', f) + L('M10 6c4 2 8 2 12 0', trim, 2.2) + L('M12 11l-2 14M20 11l2 14M16 11v15', 'rgba(0,0,0,.18)', 1) + C(16, 8, 1.8, '#ffd43b') + extra;
const balloon = (x, y, r, f) => E(x, y, r, r * 1.15, f) + P(`M${x - 1.2} ${y + r * 1.15}h2.4l-1.2 2z`, f, O, 1) + shine(x - r * 0.4, y - r * 0.45, r * 0.22);
const capsule = (a, b, mark) => `<g transform="rotate(-35 16 16)">` + R(5, 11, 22, 10, 5, a) + P('M16 11h6a5 5 0 0 1 0 10h-6z', b) + L('M16 11v10') + `</g>` + mark;

export const DRAWN_ITEMS = Object.freeze({
	// ---- Fossils: a rock, and what is in it ----
	'Armor Fossil': rock('#b9a58a') + P('M10 12h12l-1 9c-3 3-7 3-10 0z', '#5f6672') + L('M13 15h6M13 18h6', '#c9d0d8', 1.2),
	'Cover Fossil': rock('#b9a58a') + P('M9 20c0-6 3-9 7-9s7 3 7 9z', '#4f7fa6') + L('M12 20c0-4 2-6 4-6s4 2 4 6M16 11v9', '#cfe3f1', 1.1),
	'Jaw Fossil': rock('#b9a58a') + P('M8 14h16l-2 7H10z', '#8a5a3a') + P('M10 14l1.5 3 1.5-3 1.5 3 1.5-3 1.5 3 1.5-3 1.5 3 1.5-3z', '#fff', O, .8),
	'Plume Fossil': rock('#b9a58a') + P('M10 23c1-8 5-12 12-13-1 7-5 11-12 13z', '#d9534f') + L('M10 23c4-4 8-8 12-13M14 19l4 0M16 16l4-1', '#ffd9d6', 1),
	'Sail Fossil': rock('#b9a58a') + P('M9 22c1-7 4-11 8-12 3 3 5 7 6 12z', '#7fc4f4') + L('M13 22l3-11M17 22l1-10M21 22l-2-9', '#fff', 1),
	'Skull Fossil': rock('#b9a58a') + P('M10 16c0-4 3-6 6-6s6 2 6 6c0 2-1 3-2 4v2h-8v-2c-1-1-2-2-2-4z', '#e9e4d6') + C(13.5, 16, 1.4, O, N, 0) + C(18.5, 16, 1.4, O, N, 0) + L('M15 21v1.5M17 21v1.5', O, 1),
	// ---- Items ----
	'Beast Wall': P('M5 9h22v15H5z', '#6c5ce7') + L('M5 14h22M5 19h22M11 9v5M21 9v5M8 14v5M16 14v5M24 14v5M11 19v5M21 19v5', '#c7bfff', 1) + star(16, 16.5, 4.2, '#7ef0ff'),
	'Big Malasada': E(16, 18, 11, 8, '#d98b3a') + E(16, 15.5, 9, 4.5, '#f4c57a', N, 0) + L('M10 15l1 1M14 13l1 1M19 14l1 1M22 16l-1 1M16 16l1 1', '#fff', 1.2),
	"Clemont's Backpack": R(8, 9, 16, 18, 4, '#f0f3f7') + R(11, 16, 10, 8, 2, '#3f7fd6') + L('M12 9c0-5 8-5 8 0', O, 1.6) + bolt(15, 10, .55) + L('M11 20h10', '#cfe0ff', 1),
	'Eevee Bag': P('M7 13h18l2 13H5z', '#b98654') + L('M11 13c0-7 10-7 10 0', O, 1.6) + P('M7 13h18l-1 5c-5 3-11 3-16 0z', '#f1dfb8') + C(16, 18, 1.6, '#7a4f2a'),
	'Electric Generator': R(6, 10, 20, 15, 2, '#f2c230') + R(9, 13, 8, 8, 1, '#3a3f52') + bolt(12, 13.6, .6) + C(21, 15, 1.5, '#e5484d') + C(21, 20, 1.5, '#37b24d') + L('M9 25v2M23 25v2M11 10V7h10v3', O, 1.5),
	'Elemental Switch': R(7, 9, 18, 15, 3, '#cfd6de') + C(12, 16.5, 3.4, '#ff7a3c') + C(20, 16.5, 3.4, '#3f9be8') + L('M12 8V5M20 8V5M14.5 13.5l3 0M17.5 19.5l-3 0', O, 1.4) + C(16, 26, 1.2, '#ffd43b'),
	'Field Blower': P('M5 14l12-3v11L5 19z', '#8f9aa6') + R(17, 10, 6, 13, 2, '#e5484d') + R(21, 22, 4, 6, 1.5, '#3a3f52') + L('M26 13h3M26 16.5h4M26 20h3', '#7fc4f4', 1.6),
	'Fishing Net': L('M21 11L7 27', '#8a5a3a', 2.4) + P('M14 9c0-4 12-4 12 2s-4 9-8 9-4-7-4-11z', 'rgba(127,196,244,.35)') + L('M16 8l8 8M20 6l6 6M15 12l6 6M25 8l-9 9M22 6l-7 7', '#3f7fd6', .9),
	'Flame Patch': R(7, 8, 18, 17, 3, '#f4e3c1') + L('M9.5 10.5h13v12h-13z', '#b98654', 1) + P('M16 10c1 3 5 4 5 8a5 5 0 0 1-10 0c0-2 1.5-3 1.5-5 1.5 1 2 2 2.3 3 .8-2 .4-4 1.2-6z', '#ff6b2c') + P('M16 17c1 1 2 2 2 3a2 2 0 0 1-4 0c0-1 1-2 2-3z', '#ffd43b', N, 0),
	'Genome Converter Y': R(9, 5, 14, 22, 4, '#dfe6ea') + R(11.5, 8, 9, 8, 1.5, '#9be7c4') + L('M13.5 9.5l2.5 3 2.5-3M16 12.5v2.5', '#1f7a55', 1.5) + C(13, 21, 1.6, '#e5484d') + C(19, 21, 1.6, '#3f9be8') + L('M16 5V2.5', O, 1.6),
	'Hitting Hammer': P('M14 14l3 3-9 10-3-3z', '#b98654') + `<g transform="rotate(45 20 11)">` + R(13, 6, 14, 10, 2, '#e5484d') + L('M17 6v10M23 6v10', '#ffb3b3', 1.2) + `</g>` + star(8, 9, 2.6),
	'Lucky Ice Pop': R(14.6, 20, 2.8, 9, 1.2, '#e8cfa0') + P('M10 21V11a6 6 0 0 1 12 0v10z', '#7fd6f4') + L('M13.5 12v6M18.5 12v6', '#fff', 1.6) + star(24, 8, 2.6),
	Maintenance: P('M22 5a6 6 0 0 0-6 8L6 23l3 3 10-10a6 6 0 0 0 8-6l-4 3-3-3 4-4a6 6 0 0 0-2-1z', '#aab4bf') + C(8, 24, 1, O, N, 0) + P('M6 8l4-3 9 11-3 2z', '#f2c230'),
	'Max Repel': R(10, 11, 12, 17, 2.5, '#f2c230') + R(12.5, 6, 7, 5, 1, '#3a3f52') + R(17, 4, 6, 3, 1, '#e5484d') + L('M24 5.5h3M24 3l2.5-1M24 8l2.5 1', '#7fc4f4', 1.3) + L('M12 17h8M12 21h8', '#fff', 1.6),
	'Mythical Slab': P('M8 5h16l2 4v18H6V9z', '#9a8f80') + L('M10 12h12M10 16h8M10 20h12M10 24h6', '#5f574d', 1.2) + C(22, 22, 2.4, '#f08fd0') + L('M8 5l3 3M24 5l-3 3', '#c9c0b2', 1),
	'Nasty Notice': R(7, 5, 18, 22, 1.5, '#fbf3d6') + L('M10 10h12M10 14h12M10 18h7', '#8a7f66', 1.2) + C(20, 22, 4, '#e5484d') + L('M20 19.6v3M20 24.2v.4', '#fff', 1.5) + C(16, 5, 1.6, '#3f7fd6'),
	'Order Pad': R(8, 6, 16, 21, 1.5, '#fff') + R(8, 6, 16, 4, 1, '#3f9be8') + L('M11 14l1.2 1.2 2-2.4M11 19l1.2 1.2 2-2.4M11 24l1.2 1.2 2-2.4', '#37b24d', 1.3) + L('M16.5 14.5h5M16.5 19.5h5M16.5 24.5h5', '#8a8f9c', 1.2),
	'Pokédex': R(7, 6, 18, 21, 2.5, '#e5484d') + R(10, 12, 12, 9, 1, '#bfeaf7') + C(11, 9, 1.8, '#7fc4f4') + C(15.5, 8.6, .9, '#ffd43b', O, .7) + C(18.5, 8.6, .9, '#37b24d', O, .7) + L('M10 24h5M19 23v2M18 24h2', O, 1.2),
	'Pokémon Communication': R(5, 9, 10, 15, 2, '#3f9be8') + R(17, 9, 10, 15, 2, '#f08a3c') + R(7, 11.5, 6, 7, .8, '#e8f6ff', O, .9) + R(19, 11.5, 6, 7, .8, '#fff3e3', O, .9) + L('M11 5c3-2 7-2 10 0M21 5l-2.6.2M21 5l-.6 2.4M21 28c-3 2-7 2-10 0M11 28l2.6-.2M11 28l.6-2.4', O, 1.3),
	'Prank Spinner': C(16, 16, 11, '#fff') + P('M16 16L16 5A11 11 0 0 1 25.5 21.5z', '#e5484d', O, 1) + P('M16 16L25.5 21.5A11 11 0 0 1 6.5 21.5z', '#ffd43b', O, 1) + P('M16 16L6.5 21.5A11 11 0 0 1 16 5z', '#3f9be8', O, 1) + C(16, 16, 2, '#fff') + P('M16 1.5l2.4 4h-4.8z', O, N, 0),
	'Quick-Grow Extract': P('M13 5h6v6l5 12a3 3 0 0 1-3 4H11a3 3 0 0 1-3-4l5-12z', '#dff4e4') + P('M10.4 19h11.2l2 4.6a2 2 0 0 1-2 2.6H10.4a2 2 0 0 1-2-2.6z', '#37b24d', N, 0) + L('M12 5h8', O, 1.8) + P('M16 17c0-4 3-6 6-6 0 4-2 6-6 6z', '#8fd06f', O, 1) + shine(12.5, 22, 1),
	'Red Card': `<g transform="rotate(12 16 16)">` + R(9, 4, 14, 23, 2, '#e5484d') + L('M12 9h8', '#ffb3b3', 1.4) + P('M16 13l4 4.5h-2.5V22h-3v-4.5H12z', '#fff', N, 0) + `</g>`,
	'Rotom Dex': P('M8 8l3-4 2 4h6l2-4 3 4v17a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2z', '#e5484d') + R(11, 12, 10, 9, 1.2, '#9be7ff') + C(14, 15.5, 1.1, O, N, 0) + C(18, 15.5, 1.1, O, N, 0) + L('M14 18.5c1.3 1 2.7 1 4 0', O, 1) + bolt(26, 14, .45) + bolt(3, 14, .45),
	'Squirt Bottle': P('M11 14h10v11a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2z', '#7fd6f4') + P('M13 14v-4h-3V7h9l3 3h-5v4z', '#3f7fd6') + L('M6 7h2M5 4.5l2 1M5 9.5l2-1', '#7fc4f4', 1.4) + L('M13 19h6', '#fff', 1.6),
	'Super Potion': P('M11 13h10l2 12a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z', '#f08a3c') + R(13, 8, 6, 5, 1, '#fff') + P('M12 5h9v3h-9zM21 6h4', '#e5484d') + L('M12.5 18h7', '#fff', 2) + L('M16 15v6.5', '#fff', 2),
	'Sweet Honey': P('M10 12h12v12a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z', '#f2b430') + R(9, 8, 14, 4, 1.2, '#b98654') + P('M10 16c2 1.5 4-1 6 0s4 1.5 6 0v8a3 3 0 0 1-3 3h-6a3 3 0 0 1-3-3z', '#e08a14', N, 0) + shine(13, 20, 1.2) + P('M14 4c2 0 3 1 4 4h-4c-1 0-1-1 0-4z', '#ffd43b', O, 1),
	"Team Rocket's Goo-zooka": `<g transform="rotate(-18 16 16)">` + R(5, 11, 20, 9, 2, '#4a4f63') + P('M25 9l4 2v9l-4 2z', '#8f9aa6') + R(11, 20, 4, 7, 1, '#3a3f52') + L('M9 11v9', '#8f9aa6', 1.2) + `<text x="15" y="18.4" font-size="7" font-weight="900" fill="#e5484d" font-family="sans-serif">R</text></g>` + C(28, 7, 2.6, '#b05fd6') + C(24, 3.6, 1.4, '#b05fd6', O, 1),
	"Team Rocket's Thieving Machine": R(7, 12, 18, 13, 3, '#4a4f63') + C(12, 25.5, 2.4, '#2a2d3d') + C(20, 25.5, 2.4, '#2a2d3d') + L('M16 12V7', O, 2) + P('M10 4c0 5 12 5 12 0', N, '#c0c7cf', 2.4) + `<text x="13" y="21.4" font-size="8" font-weight="900" fill="#e5484d" font-family="sans-serif">R</text>`,
	// ---- Pokémon Tools ----
	'Ancient Booster Energy Capsule': capsule('#e08a3c', '#f4e3c1', L('M22 6l3 3M25 5l1.5 1.5M6 22l3 3', '#8a5a3a', 1.4) + P('M14 14l2-3 2 3-2 5z', '#7a4f2a', O, .8)),
	'Future Booster Energy Capsule': capsule('#7f6bf0', '#d7f4ff', L('M22 6l3 3M25 5l1.5 1.5M6 22l3 3', '#3f9be8', 1.4) + C(16, 16, 2, '#7ef0ff', O, .8)),
	Beastite: P('M16 4l9 7-3 13-6 4-6-4-3-13z', '#7ef0ff') + L('M16 4v24M7 11l9 5 9-5M10 24l6-8 6 8', '#2f9fb8', 1) + shine(12, 10, 1.4),
	'Big Air Balloon': balloon(16, 13, 9.5, '#e5484d') + L('M16 25.5v4', O, 1) + L('M8 10c5 3 11 3 16 0M7.5 15c6 3 11 3 17 0', '#ffd43b', 1.5),
	'Clear Veil': P('M6 8c6-3 14-3 20 0-1 7-1 12 1 18-3-2-5 1-7-1s-4 2-7 0-5 2-8 0c2-6 2-11 1-17z', 'rgba(215,244,255,.75)') + L('M11 10c-1 5-1 10 0 14M16 9v16M21 10c1 5 1 10 0 14', '#9fd3ea', 1) + star(22, 9, 2.4, '#fff', '#9fd3ea'),
	'Dark Pendant': L('M7 5c2 8 5 11 9 13 4-2 7-5 9-13', '#aab4bf', 1.5) + P('M16 15l5 6-5 8-5-8z', '#3b2f5c') + P('M16 18l2.4 3-2.4 4-2.4-4z', '#8f5fd6', N, 0) + shine(14.5, 20, .9),
	'Deceptive Needle': P('M27 5L11 19l2 2z', '#cfd6de') + P('M11 19l2 2-6 5-1-1z', '#8f5fd6') + C(24.5, 7.5, .9, O, N, 0) + L('M24 8c-6 2-12 0-14-4', '#b05fd6', 1.2) + C(6, 26.4, 1.5, '#b05fd6', O, 1),
	'Electrical Cord': L('M9 9c-5 6 3 9 7 7s12 1 7 8', '#3a3f52', 3) + L('M9 9c-5 6 3 9 7 7s12 1 7 8', '#f2c230', 1.3) + R(6, 3, 7, 7, 1.5, '#dfe6ea') + L('M8 3V1M11 3V1', O, 1.4) + R(20, 23, 7, 6, 1.5, '#dfe6ea') + bolt(15, 11, .5),
	'Elegant Cape': cape('#8f5fd6', '#ffd43b', star(16, 19, 3)),
	'Giant Cape': cape('#e5484d', '#ffd43b', L('M16 14v9M12.5 18.5h7', '#fff', 2)),
	'Leaf Cape': cape('#37b24d', '#8fd06f', P('M16 14c3 1 4 4 3 8-4 0-6-3-3-8z', '#b7f0a0', O, .9) + L('M16.5 15.5l1 5.5', '#2b8a3e', .9)),
	'Heavy Helmet': P('M5 20c0-8 5-13 11-13s11 5 11 13z', '#6d7f8a') + R(4, 19, 24, 4, 1.5, '#4a5560') + L('M16 7v12M10 9l-1 10M22 9l1 10', '#aab4bf', 1.3) + P('M14 4h4v4h-4z', '#aab4bf'),
	'Inflatable Boat': E(16, 19, 13, 7, '#f08a3c') + E(16, 18.5, 8.5, 3.6, '#7fc4f4') + L('M5 22c7 3 15 3 22 0', '#ffd43b', 1.4) + L('M2 27c3-2 5 2 8 0s5 2 8 0 5 2 8 0 3 0 4 0', '#3f9be8', 1.4),
	'Light Ball': C(16, 16, 9, '#ffe680') + C(16, 16, 5, '#fff7cf', N, 0) + L('M16 3v3M16 26v3M3 16h3M26 16h3M7 7l2 2M23 23l2 2M25 7l-2 2M9 23l-2 2', '#f2b430', 1.5),
	'Lucky Mittens': P('M9 12c0-5 9-5 9 0v3c3-2 6 0 4 3l-4 5v3H9z', '#e5484d') + R(8, 24, 11, 4, 1.2, '#fff') + L('M11 15h5', '#ffb3b3', 1.3) + star(23, 8, 3),
	'Memory Light': P('M11 14a5 5 0 0 1 10 0v2H11z', '#fff7cf') + R(11, 16, 10, 11, 1.5, '#3f7fd6') + R(13.5, 19, 5, 3, .8, '#9be7ff', O, .9) + L('M16 5V2M9 7L7 5M23 7l2-2M6 12H3M26 12h3', '#f2b430', 1.5),
	'Metal Core Barrier': P('M16 3l10 4v8c0 7-4 11-10 14C10 26 6 22 6 15V7z', '#aab4bf') + P('M16 7l6 2.5v6c0 4.5-2.4 7.2-6 9.2z', '#dfe6ea', N, 0) + C(16, 15, 3.2, '#7ef0ff') + shine(15, 14, .9),
	'Protective Poncho': P('M16 5l12 13c-2 4-5 6-8 7H12c-3-1-6-3-8-7z', '#f2c230') + P('M12 8c0-5 8-5 8 0l-4 4z', '#e0a714') + L('M16 12v13M9 17l-2 4M23 17l2 4', '#b98206', 1),
	'Rescue Scarf': P('M7 9c5-3 13-3 18 0v6c-5 3-13 3-18 0z', '#e5484d') + P('M17 15l6 1 1 11-4-2-3 3z', '#e5484d') + L('M7 12c5 3 13 3 18 0', '#ffb3b3', 1.2) + L('M19 20h4M19 23.5h4.5', '#fff', 1.4),
	'Small Balloon': balloon(16, 14, 6.5, '#3f9be8') + L('M16 23.5c-1 2 1 3 0 5', O, 1),
	'Steel Apron': P('M11 4h10v5l5 3v15H6V12l5-3z', '#aab4bf') + L('M11 4c0 4 10 4 10 0', O, 1.3) + R(11, 16, 10, 6, 1, '#6d7f8a') + C(8.5, 14, .8, '#fff', O, .6) + C(23.5, 14, .8, '#fff', O, .6) + L('M9 25h14', '#dfe6ea', 1.3),
});

// ---- Stadiums: a landscape that fills the art window (48x32) ----
const sky = (a, b) => `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="48" height="32" fill="url(#g)"/>`;
const F = (d, f) => `<path d="${d}" fill="${f}"/>`;
const tree = (x, y, s, f = '#2f8f46') => F(`M${x} ${y - 9 * s}l${4 * s} ${6 * s}h-${2 * s}l${3 * s} ${4 * s}h-${10 * s}l${3 * s}-${4 * s}h-${2 * s}z`, f) + `<rect x="${x - .7 * s}" y="${y + s}" width="${1.4 * s}" height="${3 * s}" fill="#7a4f2a"/>`;
const cloud = (x, y, s = 1) => `<g fill="#fff" opacity=".9"><ellipse cx="${x}" cy="${y}" rx="${5 * s}" ry="${2 * s}"/><ellipse cx="${x - 2 * s}" cy="${y - 1.4 * s}" rx="${2.4 * s}" ry="${1.8 * s}"/><ellipse cx="${x + 1.6 * s}" cy="${y - 1.8 * s}" rx="${2.8 * s}" ry="${2.2 * s}"/></g>`;
export const DRAWN_SCENES = Object.freeze({
	'Abandoned Station': sky('#3a4660', '#8b93a6') + F('M0 20h48v12H0z', '#55596a') + F('M4 8h40v12H4z', '#70788c') + F('M2 6h44v3H2z', '#3a3f52') + F('M9 12h6v8H9zM21 12h6v8h-6zM33 12h6v8h-6z', '#262a38') + F('M0 26h48v1.2H0zM0 29h48v1.2H0z', '#2a2d3d') + F('M6 25h2v6H6zM16 25h2v6h-2zM26 25h2v6h-2zM36 25h2v6h-2z', '#7a5a3a') + F('M22 4h4v3h-4z', '#c9b458'),
	Arcade: sky('#2a1f5c', '#7a3fb0') + F('M0 23h48v9H0z', '#3b2f7a') + F('M6 9h10v15H6zM19 7h10v17H19zM32 9h10v15H32z', '#20264a') + F('M7.5 11h7v5h-7z', '#7ef0ff') + F('M20.5 9h7v6h-7z', '#ffd43b') + F('M33.5 11h7v5h-7z', '#ff7ad1') + F('M9 18h4v1.5H9zM22 17h4v1.5h-4zM35 18h4v1.5h-4z', '#e5484d') + `<g fill="#fff"><circle cx="4" cy="4" r=".7"/><circle cx="17" cy="3" r=".7"/><circle cx="31" cy="4" r=".7"/><circle cx="45" cy="5" r=".7"/></g>`,
	'Area Zero': sky('#7fb6e8', '#e9f6ff') + F('M0 14l8-6 6 5 7-8 8 9 7-5 12 7v16H0z', '#7f9a8a') + F('M0 20c8-4 16 2 24-1s16-3 24 1v12H0z', '#5fae6a') + F('M18 22c3-1 9-1 12 0l-2 10h-8z', '#7fd6f4') + `<g fill="#fff" opacity=".85"><path d="M12 22l1 2 2 1-2 1-1 2-1-2-2-1 2-1z"/><path d="M36 19l.8 1.6 1.6.8-1.6.8-.8 1.6-.8-1.6-1.6-.8 1.6-.8z"/><path d="M27 12l.6 1.2 1.2.6-1.2.6-.6 1.2-.6-1.2-1.2-.6 1.2-.6z"/></g>` + cloud(9, 6, .8),
	'Arena of Antiquity': sky('#f6d7a8', '#f3ead2') + F('M0 22h48v10H0z', '#d9b47a') + F('M5 8h3v15H5zM13 8h3v15h-3zM32 8h3v15h-3zM40 8h3v15h-3z', '#efe6d2') + F('M3 6h42v3H3zM4 22h40v2H4z', '#cfc2a4') + F('M20 12h8v11h-8z', '#b99a66') + F('M22 15h4v8h-4z', '#6b5333') + `<ellipse cx="24" cy="28" rx="10" ry="2.4" fill="#c79a5c"/>`,
	'Bounded Field': sky('#cfeffd', '#f2fbe6') + F('M0 19h48v13H0z', '#7ccf6a') + F('M0 19h48v2H0z', '#5fae52') + `<g fill="none" stroke="#fff" stroke-width="1"><rect x="8" y="22" width="32" height="8"/><path d="M24 22v8"/><circle cx="24" cy="26" r="2.4"/></g>` + F('M3 13h1.4v9H3zM43.6 13H45v9h-1.4zM3 14h42v1H3zM3 17h42v1H3z', '#b98654') + cloud(12, 7) + cloud(36, 5, .8),
	'Fragrant Forest': sky('#bfeaf7', '#e9f9d6') + F('M0 22h48v10H0z', '#5fae52') + tree(7, 22, 1.5, '#2f8f46') + tree(18, 21, 1.9, '#37a04f') + tree(31, 22, 1.6, '#2f8f46') + tree(42, 21, 1.8, '#37a04f') + `<g fill="#ff9ecf"><circle cx="12" cy="27" r="1"/><circle cx="25" cy="29" r="1"/><circle cx="37" cy="27" r="1"/></g><g fill="#ffe680"><circle cx="5" cy="29" r=".9"/><circle cx="20" cy="26" r=".9"/><circle cx="44" cy="29" r=".9"/></g>`,
	'Hiking Trail': sky('#9fd3f4', '#e9f6ff') + F('M0 22l10-13 7 8 8-12 10 14 6-6 7 9v10H0z', '#8a9aa6') + F('M25 5l3 4.2-3-1-2.4 1.6zM10 9l2.2 3-2.2-.6-2 1.2z', '#fff') + F('M0 23c10-3 20-3 48 0v9H0z', '#6fbf5f') + F('M20 32c0-4 6-3 5-6s-4-2-3-4l2-.4c-1 2 4 1.5 4 4.6S24 28 26 32z', '#e3c898') + tree(6, 25, 1) + tree(40, 26, 1.1),
	"Kid's Room": `<rect width="48" height="32" fill="#ffe9c9"/>` + F('M0 22h48v10H0z', '#d9a86a') + F('M4 5h12v9H4z', '#bfeaf7') + F('M9.5 5h1v9h-1zM4 9h12v1H4z', '#fff') + F('M26 14h18v8H26z', '#7fb6e8') + F('M26 11h5v4h-5z', '#fff') + F('M26 20h18v3H26z', '#3f7fd6') + `<circle cx="10" cy="26" r="3" fill="#e5484d"/><path d="M7 26h6" stroke="#fff" stroke-width="1"/><circle cx="10" cy="26" r="1" fill="#fff"/>` + F('M17 24h4v4h-4z', '#37b24d') + F('M19 20h4v4h-4z', '#ffd43b'),
	Mesagoza: sky('#9fd3f4', '#fdf3d6') + F('M0 24h48v8H0z', '#e3c898') + F('M3 14h9v10H3zM14 11h8v13h-8zM33 12h9v12h-9z', '#f6e7c8') + F('M2 12l5.5-4 5.5 4zM13 9l5-4 5 4zM32 10l5.5-4 5.5 4z', '#d9653a') + F('M24 3h6v21h-6z', '#f3ead2') + F('M23 3l4-3 4 3z', '#3f7fd6') + `<circle cx="27" cy="8" r="1.8" fill="#fff" stroke="#2a2d3d" stroke-width=".6"/>` + F('M5 17h2v3H5zM16 14h2v3h-2zM36 15h2v3h-2zM26 18h2v6h-2z', '#7a5a3a'),
	'Peculiar Plaza': sky('#f3c4f7', '#fdeeff') + F('M0 22h48v10H0z', '#c9a8e0') + `<g fill="#e9d6f7"><path d="M0 22h6v5H0zM12 22h6v5h-6zM24 22h6v5h-6zM36 22h6v5h-6zM6 27h6v5H6zM18 27h6v5h-6zM30 27h6v5h-6zM42 27h6v5h-6z"/></g>` + F('M20 20h8v3h-8z', '#8f9aa6') + F('M22 12h4v8h-4z', '#aab4bf') + `<path d="M24 12c-4-3-6 1-7 4M24 12c4-3 6 1 7 4M24 11v-3" stroke="#7fc4f4" stroke-width="1.2" fill="none"/>` + F('M5 9h2v13H5zM41 9h2v13h-2z', '#6d5a8a') + `<circle cx="6" cy="8" r="2" fill="#ffe680"/><circle cx="42" cy="8" r="2" fill="#ffe680"/>`,
	'Rainbow Cave': `<rect width="48" height="32" fill="#2b2440"/>` + F('M0 32V8c6-6 14-8 24-8s18 2 24 8v24h-8c0-12-6-18-16-18S8 20 8 32z', '#4a3f66') + `<g fill="none" stroke-width="2"><path d="M11 32c0-9 5-15 13-15s13 6 13 15" stroke="#e5484d"/><path d="M13.5 32c0-8 4-12.6 10.5-12.6S34.500 24 34.500 32" stroke="#ffd43b"/><path d="M16 32c0-6.500 3-10.200 8-10.200s8 3.700 8 10.200" stroke="#37b24d"/><path d="M18.500 32c0-5 2-7.800 5.500-7.800s5.500 2.800 5.500 7.800" stroke="#3f9be8"/></g>` + F('M6 0l2 6 2-6zM20 0l1.500 5 1.500-5zM36 0l2 7 2-7z', '#6d5f8f') + `<g fill="#fff"><circle cx="5" cy="14" r=".7"/><circle cx="43" cy="12" r=".7"/><circle cx="40" cy="22" r=".6"/></g>`,
	'Soothing Shore': sky('#9fe0f4', '#fdf3d6') + F('M0 15h48v8H0z', '#4aa3e3') + F('M0 17h48v.8H0zM4 20h40v.7H4z', '#bfe6ff') + F('M0 22c12-3 24 2 48-1v11H0z', '#f3ddb0') + `<circle cx="38" cy="7" r="3.600" fill="#fff3b0"/>` + F('M9 28c0-7 1-10 3-12l1 .6c-1.600 2-2.200 5-2 11.400z', '#8a5a3a') + F('M12 16c-4-2-7-1-9 2 3-1 6-1 9-2zM12 16c3-3 7-3 10-1-4 0-7 0-10 1zM12 16c-1-4 1-7 4-8-1 3-2 5-4 8z', '#37a04f') + F('M30 25l3-5 3 5z', '#e5484d'),
	'Starting Plains': sky('#9fd3f4', '#eafbe0') + F('M0 20c10-5 18 1 28-2s14-2 20 1v13H0z', '#7ccf6a') + F('M0 25c12-3 26 2 48-1v8H0z', '#5fae52') + F('M22 32c-1-5 5-5 3-9s3-4 2-6l1.600.2c1 3-2 3-.4 6.400S26 28 28 32z', '#e3c898') + cloud(10, 7) + cloud(34, 5, 1.1) + `<g stroke="#2f8f46" stroke-width=".8"><path d="M6 27v-2M8 28v-2.400M38 27v-2M41 28v-2.400M14 23v-1.600"/></g>`,
	'Training Area': `<rect width="48" height="32" fill="#e7dcc6"/>` + F('M0 21h48v11H0z', '#b98654') + F('M0 21h48v1.400H0z', '#8a5a3a') + F('M8 6h1.600v15H8zM7 6h12v1.600H7z', '#6d7f8a') + F('M14 7.600h1v4h-1z', '#3a3f52') + `<ellipse cx="14.500" cy="15" rx="3" ry="4.400" fill="#e5484d" stroke="#2a2d3d" stroke-width=".7"/>` + F('M27 17h14v2H27z', '#3a3f52') + F('M27 14h2v8h-2zM39 14h2v8h-2zM24.500 15h2v6h-2zM41.500 15h2v6h-2z', '#6d7f8a') + F('M28 25h16v3H28z', '#3f7fd6') + F('M28 25h16v.8H28z', '#7fb6e8'),
});

// ---- Supporters with no walking sheet on the site: a 16x32 pixel figure ----
// [hair style, hair colour, skin, top, bottom, extras]; styles: short spiky long pony twin bob bun big mohawk bald
// extras: hat:<colour>  coat (the top reaches the knees)  dress (a skirt to the knees)  shorts  glasses  band:<colour>  streak:<colour>
//   and what tells one person from another: clip bow flower headphones (hair), shades goggles star (on the head), domino beard (face),
//   scarf tie chain stripe vest bag gloves (clothes), camera balls (in the hands)
const SK = { l: '#f8d0a8', m: '#e0a878', d: '#9a6238' };
const FIG = {
	Acerola: ['bob', '#8a5fd0', SK.l, '#4b4f8f', '#4b4f8f', 'dress clip:#f2c230 stripe:#8a8fd0'],
	Adaman: ['pony', '#3b5fa8', SK.l, '#2fa7a0', '#33405c', 'band:#f2c230 scarf:#f4f4f4'],
	Arven: ['long', '#c9a070', SK.l, '#f2f0e8', '#3a3f52', 'streak:#6b4a2a vest:#c96a2a bag:#e8c070'],
	'Budding Expeditioner': ['short', '#7a4f2a', SK.l, '#c9b070', '#8a7a4a', 'hat:#e3d3a0 bag:#7a5a3a shorts scarf:#e5484d'],
	Cabbie: ['short', '#7a4f2a', SK.l, '#a8703c', '#5a4a3a', 'hat:#3a3f52 coat goggles:#bfeaf7 gloves:#3a3f52'],
	Calem: ['short', '#2a2d3d', SK.l, '#3f6fd0', '#33405c', 'hat:#e5484d shades bag:#2a2d3d'],
	Cheren: ['short', '#2a2d3d', SK.l, '#3f6fd0', '#2a2d3d', 'glasses tie:#e5484d'],
	Clemont: ['short', '#f2d24a', SK.l, '#4a8fe0', '#4a8fe0', 'glasses stripe:#f2d24a'],
	Copycat: ['twin', '#7a4f2a', SK.l, '#f4f4f4', '#f08fb0', 'dress bow:#e5484d'],
	Dawn: ['long', '#33405c', SK.l, '#2a2d3d', '#f08fb0', 'hat:#f4f4f4 dress scarf:#f08fb0 clip:#f2d24a'],
	Diantha: ['short', '#5a4030', SK.l, '#f4f4f4', '#f4f4f4', 'coat chain:#f2c230'],
	Drayden: ['short', '#e8e8e8', SK.m, '#33405c', '#2a2d3d', 'beard:#e8e8e8 stripe:#e5484d'],
	Elesa: ['short', '#f2d24a', SK.l, '#f2d24a', '#2a2d3d', 'headphones:#e5484d stripe:#2a2d3d'],
	Gladion: ['spiky', '#f0dc8a', SK.l, '#2a2d3d', '#2a2d3d', 'stripe:#e5484d bag:#e5484d'],
	Guzma: ['spiky', '#f0f0f0', SK.l, '#2a2d3d', '#d8d8d8', 'shades chain:#f2c230'],
	Hala: ['bun', '#f0f0f0', SK.d, '#f2c230', '#f4f4f4', 'coat beard:#f0f0f0 stripe:#3f6fd0'],
	Hau: ['bun', '#3f5f4a', SK.d, '#2a2d3d', '#f08a3c', 'shorts bag:#f08a3c'],
	Ilima: ['short', '#f0a0b8', SK.m, '#f3ead2', '#c9a070', 'shorts tie:#f08fb0'],
	Iono: ['twin', '#f08fd0', SK.l, '#f2d24a', '#5a5f8f', 'streak:#7fd6f4 clip:#f2d24a stripe:#8a5fd0'],
	Irida: ['bob', '#f2e6b0', SK.l, '#f4f4f4', '#e8708a', 'band:#f4f4f4 dress stripe:#e8708a'],
	Iris: ['big', '#6a3fa0', SK.d, '#f3ead2', '#f08fb0', 'bow:#f08fb0 stripe:#f08fb0'],
	Jasmine: ['twin', '#9a6a3a', SK.l, '#f4f4f4', '#7fd6c4', 'dress clip:#f08a3c bow:#f08a3c'],
	Juggler: ['short', '#6a3fa0', SK.l, '#8a5fd0', '#f4f4f4', 'balls stripe:#f2d24a'],
	Juliana: ['pony', '#7a4f2a', SK.l, '#f4f4f4', '#33405c', 'hat:#f08a3c tie:#f08a3c shorts bag:#8a5a3a'],
	Kiawe: ['mohawk', '#e5484d', SK.d, '#9a6238', '#e5484d', 'streak:#2a2d3d shorts chain:#f2c230'],
	Korrina: ['pony', '#f2d24a', SK.l, '#f4f4f4', '#e5484d', 'hat:#f4f4f4 dress gloves:#e5484d stripe:#e5484d'],
	Lana: ['bob', '#3f7fd6', SK.l, '#f4f4f4', '#3f6fd0', 'band:#f2d24a stripe:#3f6fd0'],
	Lillie: ['long', '#f2e6b0', SK.l, '#f4f4f4', '#f4f4f4', 'hat:#f4f4f4 dress bag:#f0b0c0 stripe:#bfe6ff'],
	Lisia: ['pony', '#3fc0b0', SK.l, '#7fd6f4', '#f4f4f4', 'dress band:#f08fd0 bow:#f08fd0'],
	Lusamine: ['long', '#f2e6b0', SK.l, '#f4f4f4', '#2a2d3d', 'coat chain:#37b24d'],
	Lyra: ['twin', '#7a4f2a', SK.l, '#e5484d', '#3f6fd0', 'hat:#f4f4f4 bow:#e5484d vest:#3f6fd0 shorts'],
	Mallow: ['twin', '#4fae52', SK.m, '#f08fb0', '#4fae52', 'flower:#f08fb0 vest:#4fae52 shorts'],
	Marlon: ['spiky', '#33509a', SK.d, '#9a6238', '#3f9be8', 'shorts chain:#f4f4f4'],
	Morty: ['short', '#f2d24a', SK.l, '#4a3f7a', '#f4f4f4', 'band:#8a5fd0 scarf:#8a5fd0'],
	Nemona: ['pony', '#2a2d3d', SK.m, '#f4f4f4', '#33405c', 'streak:#37b24d tie:#f08a3c shorts gloves:#2a2d3d'],
	Penny: ['bob', '#e5484d', SK.l, '#8f9aa6', '#3a3f52', 'glasses streak:#3f7fd6 bag:#b98654 shorts'],
	Piers: ['big', '#2a2d3d', SK.l, '#2a2d3d', '#2a2d3d', 'streak:#f4f4f4 band:#f08fd0 chain:#f08fd0'],
	'Professor Sada': ['long', '#7a4f2a', SK.m, '#f4f4f4', '#8a5a3a', 'coat scarf:#b98654'],
	'Professor Turo': ['short', '#7a4f2a', SK.m, '#f4f4f4', '#6a3fa0', 'coat stripe:#7ef0ff'],
	Rika: ['pony', '#5a4030', SK.l, '#7a5a3a', '#2a2d3d', 'tie:#2a2d3d gloves:#2a2d3d'],
	Serena: ['long', '#e0b070', SK.l, '#2a2d3d', '#e5484d', 'hat:#f08fb0 dress shades'],
	"Serena's Choice": ['long', '#e0b070', SK.l, '#2a2d3d', '#e5484d', 'hat:#f08fb0 dress shades bag:#f08fb0'],
	Sightseer: ['short', '#5a4030', SK.l, '#f08a3c', '#f3ead2', 'hat:#f4f4f4 camera shorts'],
	Silver: ['long', '#d0303a', SK.l, '#2a2d3d', '#4a4f8f', 'stripe:#e5484d gloves:#2a2d3d'],
	Skyla: ['bun', '#d0503a', SK.l, '#4a9be8', '#4a9be8', 'flower:#7fd6f4 gloves:#3f6fd0 stripe:#f4f4f4 shorts'],
	Sophocles: ['bun', '#f08a3c', SK.l, '#f4f4f4', '#8a5a3a', 'shorts stripe:#f2d24a'],
	'Team Star Grunt': ['short', '#33405c', SK.l, '#f4f4f4', '#33405c', 'hat:#f2c230 goggles:#3f6fd0 star:#f4f4f4 shorts tie:#33405c'],
	Wallace: ['short', '#3fc0b0', SK.l, '#f4f4f4', '#8a5fd0', 'hat:#f4f4f4 coat scarf:#3fc0b0'],
	Wally: ['short', '#7fcf8a', SK.l, '#f4f4f4', '#6a8a5a', 'stripe:#7fcf8a'],
	Whitney: ['twin', '#f08fb0', SK.l, '#f4f4f4', '#3f6fd0', 'clip:#f4f4f4 shorts stripe:#e5484d'],
	Will: ['short', '#8a5fd0', SK.l, '#7a2f4a', '#2a2d3d', 'domino tie:#f4f4f4'],
};
const shade = (hex, k) => '#' + [1, 3, 5].map(i => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k))).toString(16).padStart(2, '0')).join('');
function figure([style, hair, skin, top, bottom, extras]) {
	const x = Object.fromEntries(String(extras || '').split(' ').filter(Boolean).map(s => { const [k, v] = s.split(':'); return [k, v || true]; }));
	const px = [], r = (X, Y, W, H, f) => px.push(`<rect x="${X}" y="${Y}" width="${W}" height="${H}" fill="${f}"/>`), hd = shade(hair, .72), ink = '#2a2d3d';
	// hair behind the head
	if (style === 'long') r(3, 10, 10, 11, hd);
	if (style === 'big') r(2, 6, 12, 9, hair);
	if (style === 'twin') { r(2, 11, 2, 8, hair); r(12, 11, 2, 8, hair); r(2, 18, 2, 1, hd); r(12, 18, 2, 1, hd); }
	if (style === 'pony') { r(11, 9, 3, 2, hair); r(12, 11, 2, 7, hair); r(12, 17, 2, 1, hd); }
	if (style === 'bob') r(3, 10, 10, 7, hd);
	// legs and shoes
	r(5, 24, 2, 6, bottom); r(9, 24, 2, 6, bottom); r(4, 30, 3, 1, ink); r(9, 30, 3, 1, ink);
	if (x.dress || x.coat) { r(5, 26, 2, 4, skin); r(9, 26, 2, 4, skin); }
	if (x.shorts) { r(5, 27, 2, 3, skin); r(9, 27, 2, 3, skin); }
	// body, arms, hands
	r(4, 17, 8, 7, top); r(3, 17, 1, 5, top); r(12, 17, 1, 5, top); r(3, 22, 1, 1, skin); r(12, 22, 1, 1, skin);
	r(4, 23, 8, 1, shade(top, .8)); r(7, 17, 2, 1, shade(top, .8));
	if (x.dress) { r(4, 23, 8, 3, bottom); r(3, 25, 10, 1, bottom); }
	else if (x.coat) { r(4, 23, 8, 4, top); r(7, 19, 2, 8, shade(top, .86)); }
	else r(5, 23, 6, 1, bottom);
	// what is worn over the clothes
	if (x.vest) { r(4, 17, 3, 6, x.vest); r(9, 17, 3, 6, x.vest); }
	if (x.stripe) r(4, 20, 8, 1, x.stripe);
	if (x.tie) { r(7, 17, 2, 4, x.tie); r(7, 17, 2, 1, shade(x.tie, .8)); }
	if (x.chain) { r(6, 18, 4, 1, x.chain); r(7, 19, 2, 1, x.chain); }
	if (x.bag) { r(5, 17, 1, 1, shade(x.bag, .75)); r(6, 18, 1, 1, shade(x.bag, .75)); r(7, 19, 1, 1, shade(x.bag, .75)); r(8, 20, 1, 1, shade(x.bag, .75)); r(9, 21, 1, 1, shade(x.bag, .75)); r(10, 21, 3, 4, x.bag); r(10, 21, 3, 1, shade(x.bag, .8)); }
	if (x.gloves) { r(3, 21, 1, 2, x.gloves); r(12, 21, 1, 2, x.gloves); }
	if (x.camera) { r(6, 17, 1, 3, ink); r(9, 17, 1, 3, ink); r(5, 20, 6, 3, '#3a3f52'); r(7, 21, 2, 1, '#bfeaf7'); r(3, 21, 2, 1, skin); r(11, 21, 2, 1, skin); }
	if (x.balls) { r(1, 14, 2, 2, '#e5484d'); r(13, 12, 2, 2, '#f2d24a'); r(7, 3, 2, 2, '#3f9be8'); r(2, 20, 2, 1, skin); r(12, 19, 2, 1, skin); }
	if (x.scarf) { r(4, 16, 8, 2, x.scarf); r(10, 18, 2, 3, x.scarf); r(4, 17, 8, 1, shade(x.scarf, .82)); }
	// head
	r(5, 10, 6, 7, skin); r(4, 12, 1, 3, skin); r(11, 12, 1, 3, skin); r(6, 16, 4, 1, shade(skin, .86));
	r(6, 13, 1, 2, ink); r(9, 13, 1, 2, ink);
	if (x.glasses) { r(5, 13, 3, 1, ink); r(8, 13, 3, 1, ink); r(5, 14, 1, 1, '#bfeaf7'); r(10, 14, 1, 1, '#bfeaf7'); }
	if (x.domino) { r(5, 13, 6, 2, ink); r(6, 13, 1, 1, '#fff'); r(9, 13, 1, 1, '#fff'); }
	if (x.beard) { r(5, 15, 6, 2, x.beard); r(6, 17, 4, 1, x.beard); r(7, 15, 2, 1, shade(skin, .8)); }
	// hair on the head
	if (style !== 'bald') { r(4, 8, 8, 3, hair); r(4, 11, 1, 2, hair); r(11, 11, 1, 2, hair); r(5, 11, 2, 1, hair); r(9, 11, 2, 1, hair); r(4, 8, 8, 1, hd); }
	if (style === 'spiky') { r(4, 7, 1, 1, hair); r(6, 6, 2, 2, hair); r(9, 6, 1, 2, hair); r(11, 7, 1, 1, hair); }
	if (style === 'mohawk') { r(7, 4, 2, 4, hair); r(6, 6, 4, 2, hair); }
	if (style === 'bun') { r(6, 5, 4, 3, hair); r(6, 5, 4, 1, hd); }
	if (style === 'big') { r(3, 5, 10, 2, hair); r(3, 5, 10, 1, hd); }
	if (x.streak) { r(8, 8, 2, 3, x.streak); if (style === 'twin') r(12, 11, 2, 7, x.streak); if (style === 'big') r(3, 6, 3, 4, x.streak); if (style === 'mohawk') r(7, 4, 2, 2, x.streak); }
	if (x.band) r(4, 10, 8, 1, x.band);
	if (x.hat) { r(4, 7, 8, 3, x.hat); r(3, 10, 10, 1, shade(x.hat, .82)); r(5, 6, 6, 1, x.hat); }
	if (x.clip) { r(4, 9, 1, 2, x.clip); r(11, 9, 1, 2, x.clip); }
	if (x.flower) { r(10, 7, 2, 2, x.flower); r(11, 8, 1, 1, '#f2d24a'); }
	if (x.bow) { r(5, 5, 2, 2, x.bow); r(9, 5, 2, 2, x.bow); r(7, 6, 2, 1, shade(x.bow, .8)); }
	if (x.headphones) { r(4, 7, 8, 1, x.headphones); r(3, 10, 1, 4, x.headphones); r(12, 10, 1, 4, x.headphones); }
	if (x.shades) { r(5, 9, 6, 1, ink); r(5, 9, 2, 2, '#3a3f52'); r(9, 9, 2, 2, '#3a3f52'); }
	if (x.goggles) { r(4, 9, 8, 2, ink); r(5, 9, 2, 1, x.goggles); r(9, 9, 2, 1, x.goggles); }
	if (x.star) { r(7, 7, 2, 2, x.star); r(6, 8, 4, 1, x.star); }
	// (a one-pixel dark outline, as the walking sheets have: the same shapes, drawn first with a stroke)
	return `<svg viewBox="0 0 16 32" shape-rendering="crispEdges" aria-hidden="true"><g stroke="${ink}" stroke-width="2">${px.join('').replace(/fill="[^"]*"/g, `fill="${ink}"`)}</g>${px.join('')}</svg>`;
}
export const DRAWN_PEOPLE = Object.freeze(Object.fromEntries(Object.entries(FIG).map(([n, f]) => [n, figure(f)])));

const icon = inner => `<svg viewBox="0 0 32 32" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${inner}</svg>`;
const scene = inner => `<svg viewBox="0 0 48 32" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${inner}</svg>`;
/** The art window's markup for a Trainer card drawn here, or '' (the caller falls back to its own default). */
export function drawnArt(c) {
	if (!c || c.kind === 'pokemon') return '';
	if (DRAWN_SCENES[c.name]) return `<span class="drawn scene">${scene(DRAWN_SCENES[c.name])}</span>`;
	if (DRAWN_PEOPLE[c.name]) return `<span class="drawn fig">${DRAWN_PEOPLE[c.name]}</span>`;
	if (DRAWN_ITEMS[c.name]) return `<span class="drawn">${icon(DRAWN_ITEMS[c.name])}</span>`;
	return '';
}
