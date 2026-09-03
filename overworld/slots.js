// slots.js — the Game Corner's classic three-reel slots (no DOM, node-testable).
//
// Skill-stop, the way the GBA corners played: the reels are fixed symbol
// strips whose positions advance every tick; each press freezes the NEXT reel
// exactly where it stands. The payout reads the middle row: three of a kind
// pays the table, two cherries pays a consolation 2. The host multiplies by
// the bet (1-3 coins).

export const STRIP = [
	'cherry', 'berry', 'psy', 'bar', 'cherry', 'pika', 'berry', 'seven',
	'psy', 'cherry', 'berry', 'pika', 'bar', 'psy', 'cherry', 'berry',
	'pika', 'psy', 'berry', 'cherry', 'bar',
];
export const PAYOUT = { seven: 100, bar: 50, pika: 20, psy: 10, berry: 8, cherry: 6 };

export function newGame(rng = Math.random) {
	return { pos: [0, 1, 2].map(() => Math.floor(rng() * STRIP.length)), stopped: [false, false, false], done: false };
}
export function tick(st) {
	for (let i = 0; i < 3; i++) if (!st.stopped[i]) st.pos[i] = (st.pos[i] + 1) % STRIP.length;
}
// freeze the next spinning reel; returns which one stopped (-1 if all were down)
export function stopNext(st) {
	const i = st.stopped.indexOf(false);
	if (i < 0) return -1;
	st.stopped[i] = true;
	st.done = st.stopped.every(Boolean);
	return i;
}
// the visible symbols at a row offset (-1 above, 0 the payline, +1 below)
export function row(st, off = 0) {
	return st.pos.map(p => STRIP[(p + off + STRIP.length) % STRIP.length]);
}
export function payout(st) {
	if (!st.done) return 0;
	const [a, b, c] = row(st);
	if (a === b && b === c) return PAYOUT[a] || 0;
	return [a, b, c].filter(s => s === 'cherry').length >= 2 ? 2 : 0;
}
