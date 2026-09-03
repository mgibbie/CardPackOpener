// slidepuzzle.js — the Ruins of Alph sliding-tile puzzle (no DOM, node-testable).
//
// A classic 3×3 slide: eight tiles + the blank, showing the chamber's ancient
// Pokémon sliced into a 3×3 image (the host draws the crops). Shuffling is
// done by walking N random LEGAL moves backward from the solved board, so
// every deal is solvable by construction.

export const SIZE = 3;

// board: array of 9, values 0..7 are tiles, 8 is the blank; index = position
export function solvedBoard() { return [0, 1, 2, 3, 4, 5, 6, 7, 8]; }

export function blankAt(board) { return board.indexOf(SIZE * SIZE - 1); }

// dir is the direction a TILE slides (into the blank): 'up' moves the tile
// below the blank upward, etc. Returns true if a tile moved.
export function move(board, dir) {
	const b = blankAt(board);
	const bx = b % SIZE, by = Math.floor(b / SIZE);
	const from = dir === 'up' ? (by + 1 < SIZE ? b + SIZE : -1)
		: dir === 'down' ? (by - 1 >= 0 ? b - SIZE : -1)
		: dir === 'left' ? (bx + 1 < SIZE ? b + 1 : -1)
		: dir === 'right' ? (bx - 1 >= 0 ? b - 1 : -1)
		: -1;
	if (from < 0) return false;
	[board[b], board[from]] = [board[from], board[b]];
	return true;
}

export function solved(board) { return board.every((v, i) => v === i); }

export function shuffle(rng = Math.random, steps = 80) {
	const board = solvedBoard();
	const dirs = ['up', 'down', 'left', 'right'];
	let last = null;
	for (let i = 0; i < steps; i++) {
		const d = dirs[Math.floor(rng() * 4)];
		// don't immediately undo the previous slide — keeps the mix honest
		const undo = { up: 'down', down: 'up', left: 'right', right: 'left' }[last];
		if (d === undo) { i--; continue; }
		if (move(board, d)) last = d;
	}
	if (solved(board)) return shuffle(rng, steps + 7); // a null shuffle re-deals
	return board;
}
