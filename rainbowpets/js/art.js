// art.js — the Pets drawn in code. The sheet has each Pet's name, artist and colors but no picture, so each is a small
// creature whose body shape, ears, eyes and mouth come from its number (the same Pet always looks the same), filled with
// its TRUE COLOR as it is now: paint it and it changes. When the artists' drawings exist, they replace this.
const SHAPES = [
	'M50 18 C76 18 88 38 88 60 C88 84 72 96 50 96 C28 96 12 84 12 60 C12 38 24 18 50 18 Z',   // round
	'M50 12 C70 12 80 30 80 56 C80 86 68 98 50 98 C32 98 20 86 20 56 C20 30 30 12 50 12 Z',   // tall
	'M50 30 C82 30 94 48 94 66 C94 86 76 96 50 96 C24 96 6 86 6 66 C6 48 18 30 50 30 Z',      // wide
	'M50 14 L62 40 L90 44 L68 62 L76 92 L50 76 L24 92 L32 62 L10 44 L38 40 Z',                // star
	'M50 16 C66 16 72 28 86 34 C96 52 90 90 50 96 C10 90 4 52 14 34 C28 28 34 16 50 16 Z',   // blob
	'M22 30 C22 20 30 16 50 16 C70 16 78 20 78 30 L84 80 C84 92 72 96 50 96 C28 96 16 92 16 80 Z', // jar
];
const EARS = [
	'',
	'<path d="M28 30 L22 6 L42 22 Z M72 30 L78 6 L58 22 Z" />',                                  // cat
	'<ellipse cx="34" cy="10" rx="7" ry="18" /><ellipse cx="66" cy="10" rx="7" ry="18" />',       // bunny
	'<path d="M34 24 Q24 6 38 2 Q34 14 42 22 Z M66 24 Q76 6 62 2 Q66 14 58 22 Z" />',             // horns
	'<circle cx="50" cy="8" r="6" /><path d="M50 14 L50 22" stroke-width="3" />',                // antenna
	'<circle cx="26" cy="22" r="11" /><circle cx="74" cy="22" r="11" />',                        // bear
];
const MOUTHS = ['M40 72 Q50 82 60 72', 'M42 74 L58 74', 'M40 70 Q50 64 60 70 Q50 80 40 70 Z', 'M44 72 Q50 78 56 72 Q50 84 44 72', 'M38 72 Q44 78 50 72 Q56 78 62 72'];
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const darker = (hex, k = 0.72) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
/** An SVG string of the Pet: `n` its number (its shape), `hue` its true color now, `wiped`: drawn grey and crossed. */
export function petSvg(n, hue, { wiped = false, size = 100 } = {}) {
	const h = hash('pet' + n), body = wiped ? '#6d6a72' : hue || '#9a9a9a', edge = darker(body), ink = '#1d1a24';
	const shape = SHAPES[h % SHAPES.length], ears = EARS[(h >>> 4) % EARS.length], mouth = MOUTHS[(h >>> 8) % MOUTHS.length];
	const eyeY = 50 + ((h >>> 12) % 3) * 4, eyeGap = 12 + ((h >>> 14) % 3) * 3, big = (h >>> 16) % 2;
	const eyes = big
		? `<circle cx="${50 - eyeGap}" cy="${eyeY}" r="8" fill="#fff"/><circle cx="${50 + eyeGap}" cy="${eyeY}" r="8" fill="#fff"/><circle cx="${51 - eyeGap}" cy="${eyeY + 1}" r="4" fill="${ink}"/><circle cx="${51 + eyeGap}" cy="${eyeY + 1}" r="4" fill="${ink}"/>`
		: `<circle cx="${50 - eyeGap}" cy="${eyeY}" r="4.5" fill="${ink}"/><circle cx="${50 + eyeGap}" cy="${eyeY}" r="4.5" fill="${ink}"/><circle cx="${49 - eyeGap}" cy="${eyeY - 2}" r="1.5" fill="#fff"/><circle cx="${49 + eyeGap}" cy="${eyeY - 2}" r="1.5" fill="#fff"/>`;
	const cheeks = (h >>> 18) % 2 ? `<circle cx="${50 - eyeGap - 6}" cy="${eyeY + 12}" r="5" fill="#ff8fa8" opacity=".55"/><circle cx="${50 + eyeGap + 6}" cy="${eyeY + 12}" r="5" fill="#ff8fa8" opacity=".55"/>` : '';
	const cross = wiped ? '<path d="M18 18 L82 82 M82 18 L18 82" stroke="#e8403a" stroke-width="8" stroke-linecap="round" opacity=".85"/>' : '';
	return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" class="rp-pet-svg"><g fill="${body}" stroke="${edge}" stroke-width="3" stroke-linejoin="round">${ears}<path d="${shape}"/></g>${eyes}${cheeks}<path d="${mouth}" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round"/>${cross}</svg>`;
}
