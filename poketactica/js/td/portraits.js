// td/portraits.js — Maze Builder's heroes, drawn here (owner, 2026-11-24: "big pixel portraits drawn in code", in place of
// the tiny overworld walking sprites). Each hero is a 20 × 20 grid of letters and a palette; the page shows it as an SVG
// (crisp at any size, no image file, no canvas: the node tests read it too).
//   '.' the backdrop · k outline · s skin · d skin in shade · h hair · H hair in shade · e eye · w white of the eye ·
//   E brow · m mouth · c clothes · x the second colour (a shirt, a headband, dog tags, a cape's lining)
export const PORTRAIT_SIZE = 20;
const P = (bg, skin, shade, hair, hair2, c, x, eye = '#1c1f24') => ({ '.': bg, k: '#1c1f24', s: skin, d: shade, h: hair, H: hair2, e: eye, w: '#ffffff', E: '#3a2a22', m: '#a8483e', c, x });
export const PORTRAITS = Object.freeze({
	brock: { pal: P('#8d7a5c', '#c98d5e', '#a86f45', '#6b4526', '#4f3119', '#5d8a4a', '#e8862e'), rows: [
		'......h..hh..h......',
		'.....hhhhhhhhhh.....',
		'....hhhhhhhhhhhh....',
		'...khhhhhhhhhhhhk...',
		'...khhHhhhhhhHhhk...',
		'...khhhsshhsshhhk...',
		'....khsssssssshk....',
		'....kssssssssssk....',
		'....ksEEssssEEsk....',
		'....kssssssssssk....',
		'....kssssddssssk....',
		'....kssssssssssk....',
		'.....kssmmmmssk.....',
		'......kssssssk......',
		'.......kddddk.......',
		'....kkkcddddckkk....',
		'..kkxxcccddcccxxkk..',
		'.kxxxxccccccccxxxxk.',
		'.kxxxxccccccccxxxxk.',
		'.kxxxxccccccccxxxxk.',
	] },
	misty: { pal: P('#4f8fd0', '#f6cfa6', '#dfa97c', '#f08a2c', '#c9661a', '#f4d23a', '#d8463a', '#2f8f8a'), rows: [
		'..............hh....',
		'......hhhhhh.hhhh...',
		'.....hhhhhhhhhhhhh..',
		'....khhhhhhhhhhkhh..',
		'...khhhhhhhhhhhhk...',
		'...khhHhhhhhhhHhk...',
		'...khhhssshhssshk...',
		'...khsssssssssshk...',
		'...khswessssewshk...',
		'...khswessssewshk...',
		'....kssssssssssk....',
		'....kssssssssssk....',
		'.....kssmmmmssk.....',
		'......kssssssk......',
		'.......kddddk.......',
		'....kkkxddddxkkk....',
		'..kkssxccccccxsskk..',
		'.kssssxccccccxssssk.',
		'.kssssxccccccxssssk.',
		'.kssssxccccccxssssk.',
	] },
	surge: { pal: P('#3d5578', '#eab98c', '#c9905f', '#f2d24a', '#c9a227', '#4f6b3a', '#cfd6dc'), rows: [
		'....................',
		'.....h.h.h.h.h.h....',
		'....khhhhhhhhhhk....',
		'....khhHhhhhHhhk....',
		'....khhhhhhhhhhk....',
		'....khsssssssshk....',
		'....kssssssssssk....',
		'....ksEEssssEEsk....',
		'....kssessssessk....',
		'....kssssssssssk....',
		'....kssssddssssk....',
		'....kssssssssssk....',
		'....kdssmmmmssdk....',
		'.....kddssssddk.....',
		'......kkddddkk......',
		'...kkkccdxxdcckkk...',
		'.kkccccccxxcccccckk.',
		'kcccccccccccccccccck',
		'kcccccccccccccccccck',
		'kcccccccccccccccccck',
	] },
	erika: { pal: P('#5aa05a', '#f8dcc0', '#e2b592', '#2a2f3a', '#1c1f24', '#e9c94a', '#c8413a'), rows: [
		'....................',
		'......kkkkkkkk......',
		'....kkhhhhhhhhkk....',
		'...khhhhhhhhhhhhk...',
		'...kxxxxxxxxxxxxk...',
		'..khhhhhhhhhhhhhhk..',
		'..khhhsssssssshhhk..',
		'..khhsssssssssshhk..',
		'..khhsEEssssEEshhk..',
		'..khhsssssssssshhk..',
		'..khhsssssssssshhk..',
		'..khhsssssssssshhk..',
		'..khhksssmmssskhhk..',
		'...kk.kssssssk.kk...',
		'.......kddddk.......',
		'....kkkxddddxkkk....',
		'..kkcccxxddxxccckk..',
		'.kccccccxxxxcccccck.',
		'.kcccccccxxccccccck.',
		'.kcccccccccccccccck.',
	] },
	lance: { pal: P('#5b4a9c', '#f0c8a0', '#d19f72', '#d8402e', '#a82a1e', '#232a44', '#c8413a'), rows: [
		'....h..h...h..h.....',
		'....hh.hh.hhh.hh....',
		'....hhhhhhhhhhhhh...',
		'...khhhhhhhhhhhhk...',
		'...khhhHhhhhHhhhk...',
		'...khhsshhhhsshhk...',
		'....khsssssssshk....',
		'....ksEEssssEEsk....',
		'....kssessssessk....',
		'....kssssssssssk....',
		'....kssssddssssk....',
		'....kssssssssssk....',
		'.....kssmmmmssk.....',
		'..x...kssssssk...x..',
		'..xx...kddddk...xx..',
		'..xcxkkkddddkkkxcx..',
		'.kcccxccccccccxccck.',
		'kcccccxccccccxccccck',
		'kccccccxccccxcccccck',
		'kcccccccxccxccccccck',
	] },
	koga: { pal: P('#5a4a78', '#e2b58c', '#bd8c62', '#2b2f3a', '#454b5c', '#3c3550', '#c0392b'), rows: [
		'....................',
		'......hhhhhhhh......',
		'.....hhhhhhhhhh.....',
		'....khhhhhhhhhhk....',
		'....khHhhhhhhHhk....',
		'....khhhhhhhhhhk....',
		'....kxxxxxxxxxxk....',
		'....kssssssssssk....',
		'....ksEEssssEEsk....',
		'....kssssssssssk....',
		'....kssssddssssk....',
		'....kssssmmssssk....',
		'.....kcccccccck.....',
		'......kcccccck......',
		'.......kddddk.......',
		'....kkkcddddckkk....',
		'..kkccccxddxcccckk..',
		'.kccccccxxxxcccccck.',
		'.kcccccccccccccccck.',
		'.kcccccccccccccccck.',
	] },
	sabrina: { pal: P('#7a3f6b', '#f3d2b4', '#d9a985', '#2a2238', '#4a3d63', '#b03a5b', '#f2f2f2'), rows: [
		'......hhhhhhhh......',
		'....hhhhhhhhhhhh....',
		'...hhhhhhhhhhhhhh...',
		'...khhhhhhhhhhhhk...',
		'...khHHhhhhhhHHhk...',
		'...khhhhhhhhhhhhk...',
		'...khhsssssssshhk...',
		'...khsssssssssshk...',
		'...khswessssewshk...',
		'...khsssssssssshk...',
		'...khssssddsssshk...',
		'...khsssssssssshk...',
		'...khhssmmmmsshhk...',
		'...khhhsssssshhhk...',
		'...khhhkddddkhhhk...',
		'...khkkcddddckkhk...',
		'..khkccccddcccckhk..',
		'.khkccccxccxcccckhk.',
		'.kkcccccxccxccccckk.',
		'.kcccccccccccccccck.',
	] },
});

const cache = {};
/** The hero's portrait as an SVG (text); '' when there is none. */
export function portraitSvg(id) {
	if (cache[id] != null) return cache[id];
	const p = PORTRAITS[id]; if (!p) return (cache[id] = '');
	const N = PORTRAIT_SIZE, out = [`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${N} ${N}' shape-rendering='crispEdges'><rect width='${N}' height='${N}' fill='${p.pal['.']}'/>`];
	p.rows.forEach((row, y) => {
		for (let x = 0; x < N;) {
			const ch = row[x]; let n = 1;
			while (x + n < N && row[x + n] === ch) n++;
			if (ch !== '.') out.push(`<rect x='${x}' y='${y}' width='${n}' height='1' fill='${p.pal[ch]}'/>`);
			x += n;
		}
	});
	out.push('</svg>');
	return (cache[id] = out.join(''));
}
/** ... as an <img>'s src. */
export const portraitSrc = (id) => { const s = portraitSvg(id); return s ? 'data:image/svg+xml,' + encodeURIComponent(s) : ''; };
/** ... as the picture itself (cls: '' the bar's chip, 'is-big' the hero screen). */
export const portraitImg = (id, cls = '') => `<img class="pt-hero-pic${cls ? ' ' + cls : ''}" data-hero="${id}" src="${portraitSrc(id)}" alt="" draggable="false">`;
/** What is wrong with the portraits (a test's list): every hero has one, 20 rows of 20 known letters. */
export function portraitProblems(ids) {
	const out = [];
	for (const id of ids) {
		const p = PORTRAITS[id];
		if (!p) { out.push(id + ': no portrait'); continue; }
		if (p.rows.length !== PORTRAIT_SIZE) out.push(id + ': ' + p.rows.length + ' rows');
		p.rows.forEach((r, y) => { if (r.length !== PORTRAIT_SIZE) out.push(id + ' row ' + y + ': ' + r.length + ' wide'); for (const ch of r) if (!p.pal[ch]) out.push(id + ' row ' + y + ': unknown letter ' + ch); });
	}
	return out;
}
