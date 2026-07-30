// perft.test.mjs — correctness guard for the PokéChess chess engine. Perft
// (move-path enumeration) from the standard start position must match the
// known reference counts; plus checkmate detection and a legal AI move.
// Run: node overworld/pokechess/perft.test.mjs
import { ChessBoard, WHITE, BLACK, PAWN, ROOK, KNIGHT, BISHOP, QUEEN, KING } from './board.js';
import { getBestMove } from './ai.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function startBoard() {
	const b = new ChessBoard();
	const back = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
	for (let c = 1; c <= 8; c++) {
		b.setPiece(1, c, back[c - 1], WHITE, null, back[c - 1] === KING);
		b.setPiece(2, c, PAWN, WHITE, null, false);
		b.setPiece(8, c, back[c - 1], BLACK, null, back[c - 1] === KING);
		b.setPiece(7, c, PAWN, BLACK, null, false);
	}
	return b;
}
function perft(b, depth) {
	if (depth === 0) return 1;
	const moves = b.getLegalMoves(b.turn);
	if (depth === 1) return moves.length;
	let n = 0;
	for (const m of moves) { const c = b.clone(); c.makeMove(m); n += perft(c, depth - 1); }
	return n;
}

const b = startBoard();
ok('start position has 20 legal moves', b.getLegalMoves(WHITE).length === 20);
ok('perft(1) = 20', perft(b, 1) === 20);
ok('perft(2) = 400', perft(b, 2) === 400);
ok('perft(3) = 8902', perft(b, 3) === 8902);
ok('perft(4) = 197281', perft(b, 4) === 197281);

// Fool's mate — 1.f3 e5 2.g4 Qh4#
{
	const g = startBoard();
	g.makeMove({ fromRow: 2, fromCol: 6, toRow: 3, toCol: 6 });
	g.makeMove({ fromRow: 7, fromCol: 5, toRow: 5, toCol: 5 });
	g.makeMove({ fromRow: 2, fromCol: 7, toRow: 4, toCol: 7, special: 'double_push' });
	g.makeMove({ fromRow: 8, fromCol: 4, toRow: 4, toCol: 8 });
	ok("fool's mate: game over, Black wins", g.gameOver && g.result === 'black');
}
// AI returns a legal move
{
	const g = startBoard();
	const mv = getBestMove(g, 2);
	ok('AI returns a legal move', !!mv && g.getLegalMoves(WHITE).some(m => m.fromRow === mv.fromRow && m.fromCol === mv.fromCol && m.toRow === mv.toRow && m.toCol === mv.toCol));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
