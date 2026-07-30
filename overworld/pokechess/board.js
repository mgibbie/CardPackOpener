// board.js — PokéChess chess engine. A faithful ES-module port of the Love2D
// Core/Modules/pokechess/ChessBoard.lua: full rules (castling, en passant,
// promotion, check/checkmate/stalemate), pure logic, no rendering. Rows/cols
// are 1..8 to mirror the original (row 1 = white back rank at the bottom).

export const EMPTY = 0, PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
export const WHITE = 1, BLACK = 2;
export const PIECE_NAMES = { [PAWN]: 'pawn', [KNIGHT]: 'knight', [BISHOP]: 'bishop', [ROOK]: 'rook', [QUEEN]: 'queen', [KING]: 'king' };

const inBounds = (r, c) => r >= 1 && r <= 8 && c >= 1 && c <= 8;
const opponent = side => (side === WHITE ? BLACK : WHITE);

export class ChessBoard {
	constructor() {
		// board[r][c] = { piece, side, pokemon, isKing, hasMoved } or null
		this.board = [];
		for (let r = 0; r <= 8; r++) { this.board[r] = []; for (let c = 0; c <= 8; c++) this.board[r][c] = null; }
		this.turn = WHITE;
		this.castleRights = { [WHITE]: { kingSide: true, queenSide: true }, [BLACK]: { kingSide: true, queenSide: true } };
		this.enPassantTarget = null; // [row, col] or null
		this.moveHistory = [];
		this.capturedPieces = { [WHITE]: [], [BLACK]: [] };
		this.gameOver = false;
		this.result = null; // 'white' | 'black' | 'draw'
		this.lastMove = null; // [fromRow, fromCol, toRow, toCol]
	}

	clone() {
		const copy = new ChessBoard();
		for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) { const p = this.board[r][c]; copy.board[r][c] = p ? { ...p } : null; }
		copy.turn = this.turn;
		copy.castleRights = { [WHITE]: { ...this.castleRights[WHITE] }, [BLACK]: { ...this.castleRights[BLACK] } };
		copy.enPassantTarget = this.enPassantTarget ? [...this.enPassantTarget] : null;
		copy.gameOver = this.gameOver; copy.result = this.result;
		copy.lastMove = this.lastMove ? [...this.lastMove] : null;
		return copy;
	}

	setPiece(row, col, piece, side, pokemon, isKing) {
		this.board[row][col] = { piece, side, pokemon: pokemon || null, isKing: !!isKing, hasMoved: false };
	}
	getPiece(row, col) { if (!inBounds(row, col)) return null; return this.board[row][col]; }
	isEmpty(row, col) { return this.getPiece(row, col) == null; }
	isEnemy(row, col, side) { const p = this.getPiece(row, col); return p != null && p.side !== side; }
	isAlly(row, col, side) { const p = this.getPiece(row, col); return p != null && p.side === side; }

	// setup from per-type assignments: { rook1, knight1, bishop1, queen, king, bishop2, knight2, rook2, pawn1..pawn8 }
	// each entry is { pokemon } (king's pokemon may be null)
	setupFromAssignments(whiteAssign, blackAssign) {
		const backRank = [ROOK, KNIGHT, BISHOP, QUEEN, KING, BISHOP, KNIGHT, ROOK];
		const keys = ['rook1', 'knight1', 'bishop1', 'queen', 'king', 'bishop2', 'knight2', 'rook2'];
		for (let col = 1; col <= 8; col++) {
			const a = whiteAssign[keys[col - 1]] || {};
			this.setPiece(1, col, backRank[col - 1], WHITE, a.pokemon, backRank[col - 1] === KING);
		}
		for (let col = 1; col <= 8; col++) { const a = whiteAssign['pawn' + col] || {}; this.setPiece(2, col, PAWN, WHITE, a.pokemon, false); }
		for (let col = 1; col <= 8; col++) {
			const a = blackAssign[keys[col - 1]] || {};
			this.setPiece(8, col, backRank[col - 1], BLACK, a.pokemon, backRank[col - 1] === KING);
		}
		for (let col = 1; col <= 8; col++) { const a = blackAssign['pawn' + col] || {}; this.setPiece(7, col, PAWN, BLACK, a.pokemon, false); }
	}

	findKing(side) {
		for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) { const p = this.board[r][c]; if (p && p.piece === KING && p.side === side) return [r, c]; }
		return [null, null];
	}

	isSquareAttacked(row, col, bySide) {
		const pawnDir = bySide === WHITE ? 1 : -1;
		for (const dc of [-1, 1]) { const pr = row - pawnDir, pc = col + dc; if (inBounds(pr, pc)) { const p = this.board[pr][pc]; if (p && p.piece === PAWN && p.side === bySide) return true; } }
		const knightMoves = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
		for (const m of knightMoves) { const nr = row + m[0], nc = col + m[1]; if (inBounds(nr, nc)) { const p = this.board[nr][nc]; if (p && p.piece === KNIGHT && p.side === bySide) return true; } }
		const diags = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
		for (const d of diags) { let r = row + d[0], c = col + d[1]; while (inBounds(r, c)) { const p = this.board[r][c]; if (p) { if (p.side === bySide && (p.piece === BISHOP || p.piece === QUEEN)) return true; break; } r += d[0]; c += d[1]; } }
		const straights = [[-1, 0], [1, 0], [0, -1], [0, 1]];
		for (const d of straights) { let r = row + d[0], c = col + d[1]; while (inBounds(r, c)) { const p = this.board[r][c]; if (p) { if (p.side === bySide && (p.piece === ROOK || p.piece === QUEEN)) return true; break; } r += d[0]; c += d[1]; } }
		for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { if (dr === 0 && dc === 0) continue; const nr = row + dr, nc = col + dc; if (inBounds(nr, nc)) { const p = this.board[nr][nc]; if (p && p.piece === KING && p.side === bySide) return true; } }
		return false;
	}

	isInCheck(side) { const [kr, kc] = this.findKing(side); if (!kr) return false; return this.isSquareAttacked(kr, kc, opponent(side)); }

	pseudoLegalMoves(row, col) {
		const p = this.getPiece(row, col);
		if (!p) return [];
		const moves = [];
		const side = p.side;
		const addMove = (tr, tc, special) => { if (inBounds(tr, tc) && !this.isAlly(tr, tc, side)) moves.push({ fromRow: row, fromCol: col, toRow: tr, toCol: tc, special }); };
		const addSlide = (dr, dc) => { let r = row + dr, c = col + dc; while (inBounds(r, c)) { if (this.isAlly(r, c, side)) break; moves.push({ fromRow: row, fromCol: col, toRow: r, toCol: c }); if (this.isEnemy(r, c, side)) break; r += dr; c += dc; } };

		if (p.piece === PAWN) {
			const dir = side === WHITE ? 1 : -1;
			const startRow = side === WHITE ? 2 : 7;
			const promoRow = side === WHITE ? 8 : 1;
			if (inBounds(row + dir, col) && this.isEmpty(row + dir, col)) {
				if (row + dir === promoRow) addMove(row + dir, col, 'promote'); else addMove(row + dir, col);
				if (row === startRow && this.isEmpty(row + 2 * dir, col)) addMove(row + 2 * dir, col, 'double_push');
			}
			for (const dc of [-1, 1]) {
				const tr = row + dir, tc = col + dc;
				if (inBounds(tr, tc)) {
					if (this.isEnemy(tr, tc, side)) { if (tr === promoRow) addMove(tr, tc, 'promote_capture'); else addMove(tr, tc); }
					if (this.enPassantTarget && this.enPassantTarget[0] === tr && this.enPassantTarget[1] === tc) moves.push({ fromRow: row, fromCol: col, toRow: tr, toCol: tc, special: 'en_passant' });
				}
			}
		} else if (p.piece === KNIGHT) {
			for (const o of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) addMove(row + o[0], col + o[1]);
		} else if (p.piece === BISHOP) {
			addSlide(-1, -1); addSlide(-1, 1); addSlide(1, -1); addSlide(1, 1);
		} else if (p.piece === ROOK) {
			addSlide(-1, 0); addSlide(1, 0); addSlide(0, -1); addSlide(0, 1);
		} else if (p.piece === QUEEN) {
			addSlide(-1, -1); addSlide(-1, 1); addSlide(1, -1); addSlide(1, 1); addSlide(-1, 0); addSlide(1, 0); addSlide(0, -1); addSlide(0, 1);
		} else if (p.piece === KING) {
			for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr !== 0 || dc !== 0) addMove(row + dr, col + dc);
			const cr = this.castleRights[side];
			const homeRow = side === WHITE ? 1 : 8;
			if (row === homeRow && col === 5 && !p.hasMoved) {
				if (cr.kingSide) {
					const rook = this.getPiece(homeRow, 8);
					if (rook && rook.piece === ROOK && !rook.hasMoved && this.isEmpty(homeRow, 6) && this.isEmpty(homeRow, 7)
						&& !this.isSquareAttacked(homeRow, 5, opponent(side)) && !this.isSquareAttacked(homeRow, 6, opponent(side)) && !this.isSquareAttacked(homeRow, 7, opponent(side)))
						moves.push({ fromRow: homeRow, fromCol: 5, toRow: homeRow, toCol: 7, special: 'castle_king' });
				}
				if (cr.queenSide) {
					const rook = this.getPiece(homeRow, 1);
					if (rook && rook.piece === ROOK && !rook.hasMoved && this.isEmpty(homeRow, 2) && this.isEmpty(homeRow, 3) && this.isEmpty(homeRow, 4)
						&& !this.isSquareAttacked(homeRow, 5, opponent(side)) && !this.isSquareAttacked(homeRow, 4, opponent(side)) && !this.isSquareAttacked(homeRow, 3, opponent(side)))
						moves.push({ fromRow: homeRow, fromCol: 5, toRow: homeRow, toCol: 3, special: 'castle_queen' });
				}
			}
		}
		return moves;
	}

	isMoveLegal(move) {
		const saved = this.simulateMove(move);
		const inChk = this.isInCheck(this.board[move.toRow][move.toCol].side);
		this.undoSimulation(saved);
		return !inChk;
	}

	simulateMove(move) {
		const saved = {
			from: this.board[move.fromRow][move.fromCol], to: this.board[move.toRow][move.toCol],
			fromRow: move.fromRow, fromCol: move.fromCol, toRow: move.toRow, toCol: move.toCol,
			enPassant: this.enPassantTarget, special: move.special,
			castleRights: { [WHITE]: { ...this.castleRights[WHITE] }, [BLACK]: { ...this.castleRights[BLACK] } },
			extraUndo: {},
		};
		const piece = this.board[move.fromRow][move.fromCol];
		this.board[move.toRow][move.toCol] = piece;
		this.board[move.fromRow][move.fromCol] = null;
		if (move.special === 'en_passant') {
			const capturedRow = move.fromRow;
			saved.extraUndo.epRow = capturedRow; saved.extraUndo.epCol = move.toCol; saved.extraUndo.epPiece = this.board[capturedRow][move.toCol];
			this.board[capturedRow][move.toCol] = null;
		}
		if (move.special === 'castle_king') {
			const r = move.fromRow;
			saved.extraUndo.rookFrom = [r, 8]; saved.extraUndo.rookTo = [r, 6]; saved.extraUndo.rookPiece = this.board[r][8];
			this.board[r][6] = this.board[r][8]; this.board[r][8] = null;
		} else if (move.special === 'castle_queen') {
			const r = move.fromRow;
			saved.extraUndo.rookFrom = [r, 1]; saved.extraUndo.rookTo = [r, 4]; saved.extraUndo.rookPiece = this.board[r][1];
			this.board[r][4] = this.board[r][1]; this.board[r][1] = null;
		}
		if (move.special === 'promote' || move.special === 'promote_capture') { piece.piece = QUEEN; saved.extraUndo.wasPromotion = true; saved.extraUndo.originalPiece = PAWN; }
		if (move.special === 'double_push') { const epRow = piece.side === WHITE ? 3 : 6; this.enPassantTarget = [epRow, move.toCol]; }
		else this.enPassantTarget = null;
		if (piece.piece === KING) { this.castleRights[piece.side].kingSide = false; this.castleRights[piece.side].queenSide = false; }
		if (piece.piece === ROOK || piece.piece === KING) {
			if (move.fromRow === 1 && move.fromCol === 1) this.castleRights[WHITE].queenSide = false;
			if (move.fromRow === 1 && move.fromCol === 8) this.castleRights[WHITE].kingSide = false;
			if (move.fromRow === 8 && move.fromCol === 1) this.castleRights[BLACK].queenSide = false;
			if (move.fromRow === 8 && move.fromCol === 8) this.castleRights[BLACK].kingSide = false;
		}
		return saved;
	}

	undoSimulation(saved) {
		this.board[saved.fromRow][saved.fromCol] = saved.from;
		this.board[saved.toRow][saved.toCol] = saved.to;
		if (saved.extraUndo.wasPromotion && saved.from) saved.from.piece = saved.extraUndo.originalPiece;
		if (saved.special === 'en_passant' && saved.extraUndo.epRow) this.board[saved.extraUndo.epRow][saved.extraUndo.epCol] = saved.extraUndo.epPiece;
		if (saved.extraUndo.rookFrom) { const rf = saved.extraUndo.rookFrom, rt = saved.extraUndo.rookTo; this.board[rf[0]][rf[1]] = saved.extraUndo.rookPiece; this.board[rt[0]][rt[1]] = null; }
		this.enPassantTarget = saved.enPassant;
		this.castleRights = saved.castleRights;
	}

	getLegalMoves(side) {
		side = side || this.turn;
		const all = [];
		for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) { const p = this.board[r][c]; if (p && p.side === side) for (const m of this.pseudoLegalMoves(r, c)) if (this.isMoveLegal(m)) all.push(m); }
		return all;
	}

	getLegalMovesForPiece(row, col) {
		const p = this.getPiece(row, col);
		if (!p || p.side !== this.turn) return [];
		return this.pseudoLegalMoves(row, col).filter(m => this.isMoveLegal(m));
	}

	// execute a move permanently; returns the captured piece (or null)
	makeMove(move) {
		const piece = this.board[move.fromRow][move.fromCol];
		if (!piece) return null;
		let captured = null;
		const target = this.board[move.toRow][move.toCol];
		if (target) { captured = target; this.capturedPieces[piece.side].push(target); }
		if (move.special === 'en_passant') { captured = this.board[move.fromRow][move.toCol]; if (captured) this.capturedPieces[piece.side].push(captured); this.board[move.fromRow][move.toCol] = null; }
		this.board[move.toRow][move.toCol] = piece;
		this.board[move.fromRow][move.fromCol] = null;
		piece.hasMoved = true;
		if (move.special === 'castle_king') { const r = move.fromRow; const rook = this.board[r][8]; this.board[r][6] = rook; this.board[r][8] = null; if (rook) rook.hasMoved = true; }
		else if (move.special === 'castle_queen') { const r = move.fromRow; const rook = this.board[r][1]; this.board[r][4] = rook; this.board[r][1] = null; if (rook) rook.hasMoved = true; }
		if (move.special === 'promote' || move.special === 'promote_capture') piece.piece = QUEEN;
		if (move.special === 'double_push') { const epRow = piece.side === WHITE ? 3 : 6; this.enPassantTarget = [epRow, move.toCol]; }
		else this.enPassantTarget = null;
		if (piece.piece === KING) { this.castleRights[piece.side].kingSide = false; this.castleRights[piece.side].queenSide = false; }
		if (move.fromRow === 1 && move.fromCol === 1) this.castleRights[WHITE].queenSide = false;
		if (move.fromRow === 1 && move.fromCol === 8) this.castleRights[WHITE].kingSide = false;
		if (move.fromRow === 8 && move.fromCol === 1) this.castleRights[BLACK].queenSide = false;
		if (move.fromRow === 8 && move.fromCol === 8) this.castleRights[BLACK].kingSide = false;
		if (move.toRow === 1 && move.toCol === 1) this.castleRights[WHITE].queenSide = false;
		if (move.toRow === 1 && move.toCol === 8) this.castleRights[WHITE].kingSide = false;
		if (move.toRow === 8 && move.toCol === 1) this.castleRights[BLACK].queenSide = false;
		if (move.toRow === 8 && move.toCol === 8) this.castleRights[BLACK].kingSide = false;
		this.lastMove = [move.fromRow, move.fromCol, move.toRow, move.toCol];
		this.moveHistory.push(move);
		this.turn = opponent(this.turn);
		this.checkGameOver();
		return captured;
	}

	checkGameOver() {
		const legal = this.getLegalMoves(this.turn);
		if (legal.length === 0) {
			this.gameOver = true;
			if (this.isInCheck(this.turn)) this.result = this.turn === WHITE ? 'black' : 'white';
			else this.result = 'draw';
		}
	}

	isCaptureMove(move) {
		if (move.special === 'en_passant') return true;
		const target = this.getPiece(move.toRow, move.toCol);
		return target != null && target.side !== this.getPiece(move.fromRow, move.fromCol).side;
	}

	involvesKing(move) {
		const attacker = this.getPiece(move.fromRow, move.fromCol);
		let defender = this.getPiece(move.toRow, move.toCol);
		if (move.special === 'en_passant') defender = this.getPiece(move.fromRow, move.toCol);
		if (attacker && attacker.piece === KING) return true;
		if (defender && defender.piece === KING) return true;
		return false;
	}

	getDefender(move) {
		if (move.special === 'en_passant') return this.getPiece(move.fromRow, move.toCol);
		return this.getPiece(move.toRow, move.toCol);
	}

	countPieces(side) { let n = 0; for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) { const p = this.board[r][c]; if (p && p.side === side) n++; } return n; }
}
