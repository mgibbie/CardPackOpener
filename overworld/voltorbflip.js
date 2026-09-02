// voltorbflip.js — HGSS Voltorb Flip, the logic half (upscale plan item 26).
//
// The Game Corners shipped as furniture: slot machines nobody could pull,
// clerks with mute decomp scripts. This is the game they now host — pure
// logic, no DOM, so tests can import it straight into node. main.js owns the
// drawing and the coin bank (bag.js).
//
// Rules: 5x5 board of 1/2/3/VOLTORB. Row and column hints give the value sum
// and the Voltorb count. Flip cards to multiply your round score; flip every
// 2 and 3 to clear the round and bank the score. Flip a Voltorb and the round
// score is gone — and you demote to a level no higher than the number of
// cards you'd flipped (the HGSS rule that makes early Voltorbs cheap and late
// ones cruel).

// per-level board mix: twos/threes/volts (the rest of the 25 are 1s).
// Max clean win: L1 pays 2^3*3 = 24 coins ... L8 pays 2^2*3^9 = 78,732 (the
// coin case caps at 9,999, so an L8 clear simply fills it).
export const LEVELS = {
	1: { twos: 3, threes: 1, volts: 6 },
	2: { twos: 4, threes: 2, volts: 7 },
	3: { twos: 4, threes: 3, volts: 8 },
	4: { twos: 5, threes: 3, volts: 8 },
	5: { twos: 5, threes: 4, volts: 10 },
	6: { twos: 4, threes: 6, volts: 10 },
	7: { twos: 3, threes: 7, volts: 10 },
	8: { twos: 2, threes: 9, volts: 13 },
};

export function newBoard(level) {
	const cfg = LEVELS[Math.max(1, Math.min(8, level))];
	const vals = [];
	for (let i = 0; i < cfg.twos; i++) vals.push(2);
	for (let i = 0; i < cfg.threes; i++) vals.push(3);
	for (let i = 0; i < cfg.volts; i++) vals.push(0);
	while (vals.length < 25) vals.push(1);
	for (let i = vals.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[vals[i], vals[j]] = [vals[j], vals[i]];
	}
	return vals.map(v => ({ v, flipped: false, memo: false }));
}

// the row/column hint chips: value sum + Voltorb count
export function hints(board) {
	const rows = [], cols = [];
	for (let i = 0; i < 5; i++) {
		let rs = 0, rv = 0, cs = 0, cv = 0;
		for (let j = 0; j < 5; j++) {
			const r = board[i * 5 + j], c = board[j * 5 + i];
			rs += r.v; if (r.v === 0) rv++;
			cs += c.v; if (c.v === 0) cv++;
		}
		rows.push({ sum: rs, volts: rv });
		cols.push({ sum: cs, volts: cv });
	}
	return { rows, cols };
}

export function newGame(level = 1) {
	const lv = Math.max(1, Math.min(8, level));
	return { level: lv, board: newBoard(lv), coins: 0, flips: 0, phase: 'play', nextLevel: lv };
}

// flip a card. Returns 'volt' | 'clear' | 'ok' | null (already flipped / round over).
export function flip(g, idx) {
	const t = g.board[idx];
	if (g.phase !== 'play' || !t || t.flipped) return null;
	t.flipped = true;
	if (t.v === 0) {
		g.phase = 'lost';
		// demote to the number of safe flips this round, floor 1 (the HGSS rule)
		g.nextLevel = Math.max(1, Math.min(g.level, g.flips));
		g.board.forEach(x => { x.flipped = true; });
		return 'volt';
	}
	g.flips++;
	g.coins = g.coins === 0 ? t.v : g.coins * t.v;   // a 1 keeps the score flat
	if (g.board.every(x => x.flipped || x.v === 1 || x.v === 0)) {
		g.phase = 'won';
		g.nextLevel = Math.min(8, g.level + 1);
		g.board.forEach(x => { x.flipped = true; });
		return 'clear';
	}
	return 'ok';
}

// start the next round, carrying the level the last round earned
export function nextRound(g) {
	return newGame(g.nextLevel);
}
