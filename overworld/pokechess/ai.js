// ai.js — PokéChess AI. Faithful ES-module port of ChessAI.lua: minimax with
// alpha-beta pruning, piece-square tables, MVV-LVA move ordering, and an HP
// factor that devalues damaged (battle-worn) non-king pieces.
import { PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, WHITE, BLACK } from './board.js';

const PIECE_VALUES = { [PAWN]: 100, [KNIGHT]: 320, [BISHOP]: 330, [ROOK]: 500, [QUEEN]: 900, [KING]: 20000 };

const PST = {
	[PAWN]: [[0, 0, 0, 0, 0, 0, 0, 0], [50, 50, 50, 50, 50, 50, 50, 50], [10, 10, 20, 30, 30, 20, 10, 10], [5, 5, 10, 25, 25, 10, 5, 5], [0, 0, 0, 20, 20, 0, 0, 0], [5, -5, -10, 0, 0, -10, -5, 5], [5, 10, 10, -20, -20, 10, 10, 5], [0, 0, 0, 0, 0, 0, 0, 0]],
	[KNIGHT]: [[-50, -40, -30, -30, -30, -30, -40, -50], [-40, -20, 0, 0, 0, 0, -20, -40], [-30, 0, 10, 15, 15, 10, 0, -30], [-30, 5, 15, 20, 20, 15, 5, -30], [-30, 0, 15, 20, 20, 15, 0, -30], [-30, 5, 10, 15, 15, 10, 5, -30], [-40, -20, 0, 5, 5, 0, -20, -40], [-50, -40, -30, -30, -30, -30, -40, -50]],
	[BISHOP]: [[-20, -10, -10, -10, -10, -10, -10, -20], [-10, 0, 0, 0, 0, 0, 0, -10], [-10, 0, 10, 10, 10, 10, 0, -10], [-10, 5, 5, 10, 10, 5, 5, -10], [-10, 0, 10, 10, 10, 10, 0, -10], [-10, 10, 10, 10, 10, 10, 10, -10], [-10, 5, 0, 0, 0, 0, 5, -10], [-20, -10, -10, -10, -10, -10, -10, -20]],
	[ROOK]: [[0, 0, 0, 0, 0, 0, 0, 0], [5, 10, 10, 10, 10, 10, 10, 5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [-5, 0, 0, 0, 0, 0, 0, -5], [0, 0, 0, 5, 5, 0, 0, 0]],
	[QUEEN]: [[-20, -10, -10, -5, -5, -10, -10, -20], [-10, 0, 0, 0, 0, 0, 0, -10], [-10, 0, 5, 5, 5, 5, 0, -10], [-5, 0, 5, 5, 5, 5, 0, -5], [0, 0, 5, 5, 5, 5, 0, -5], [-10, 5, 5, 5, 5, 5, 0, -10], [-10, 0, 5, 0, 0, 0, 0, -10], [-20, -10, -10, -5, -5, -10, -10, -20]],
	[KING]: [[-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-30, -40, -40, -50, -50, -40, -40, -30], [-20, -30, -30, -40, -40, -30, -30, -20], [-10, -20, -20, -20, -20, -20, -20, -10], [20, 20, 0, 0, 0, 0, 20, 20], [20, 30, 10, 0, 0, 10, 30, 20]],
};

function getPSTValue(pieceType, row, col, side) {
	const pst = PST[pieceType];
	if (!pst) return 0;
	const pstRow = side === WHITE ? (9 - row) : row; // 1-indexed rows -> pst index
	return pst[pstRow - 1][col - 1] || 0;
}

export function evaluate(board) {
	let score = 0;
	for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) {
		const p = board.board[r][c];
		if (!p) continue;
		let value = PIECE_VALUES[p.piece] || 0;
		const pstVal = getPSTValue(p.piece, r, c, p.side);
		if (p.pokemon && !p.isKing && p.pokemon.maxHP && p.pokemon.curHP != null) {
			const hpRatio = p.pokemon.curHP / p.pokemon.maxHP;
			value = Math.floor(value * (0.5 + 0.5 * hpRatio));
		}
		if (p.side === WHITE) score += value + pstVal; else score -= value + pstVal;
	}
	return score;
}

function orderMoves(board, moves) {
	const scored = moves.map(m => {
		let s = 0;
		const target = board.getPiece(m.toRow, m.toCol);
		if (target) s += (PIECE_VALUES[target.piece] || 0) * 10 - (PIECE_VALUES[board.getPiece(m.fromRow, m.fromCol).piece] || 0);
		if (m.special === 'promote' || m.special === 'promote_capture') s += 800;
		if (m.toRow >= 3 && m.toRow <= 6 && m.toCol >= 3 && m.toCol <= 6) s += 10;
		return { move: m, score: s };
	});
	scored.sort((a, b) => b.score - a.score);
	return scored.map(s => s.move);
}

function minimax(board, depth, alpha, beta, maximizing) {
	if (depth === 0 || board.gameOver) return [evaluate(board), null];
	let moves = board.getLegalMoves();
	if (moves.length === 0) {
		if (board.isInCheck(board.turn)) return [maximizing ? -100000 : 100000, null];
		return [0, null];
	}
	moves = orderMoves(board, moves);
	let bestMove = moves[0];
	if (maximizing) {
		let maxEval = -Infinity;
		for (const m of moves) {
			const saved = board.simulateMove(m);
			const prevTurn = board.turn; board.turn = BLACK;
			const [ev] = minimax(board, depth - 1, alpha, beta, false);
			board.turn = prevTurn; board.undoSimulation(saved);
			if (ev > maxEval) { maxEval = ev; bestMove = m; }
			alpha = Math.max(alpha, ev);
			if (beta <= alpha) break;
		}
		return [maxEval, bestMove];
	} else {
		let minEval = Infinity;
		for (const m of moves) {
			const saved = board.simulateMove(m);
			const prevTurn = board.turn; board.turn = WHITE;
			const [ev] = minimax(board, depth - 1, alpha, beta, true);
			board.turn = prevTurn; board.undoSimulation(saved);
			if (ev < minEval) { minEval = ev; bestMove = m; }
			beta = Math.min(beta, ev);
			if (beta <= alpha) break;
		}
		return [minEval, bestMove];
	}
}

export function getBestMove(board, depth = 3) {
	const maximizing = board.turn === WHITE;
	const [, bestMove] = minimax(board, depth, -Infinity, Infinity, maximizing);
	return bestMove;
}
