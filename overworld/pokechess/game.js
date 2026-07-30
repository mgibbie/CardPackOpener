// game.js — PokéChess scene for the web. Chess where each piece type is a
// Pokémon from your party; a non-king capture is resolved by a REAL turn-based
// battle (the overworld battle engine) — attacker survives -> capture, defender
// survives -> attacker is lost. Player is White (bottom); the ported minimax AI
// plays Black.
import { ChessBoard, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './board.js';
import { getBestMove } from './ai.js';
import { Battle, buildMon } from '../battle.js';

const battle = new Battle();

const PARTY_KEY = 'magepunk_party_v1';
const PIECE_GLYPH = { [PAWN]: '♟', [KNIGHT]: '♞', [BISHOP]: '♝', [ROOK]: '♜', [QUEEN]: '♛', [KING]: '♚' };

// ---------- data ----------
let speciesDB = null;
const imgCache = new Map();
function loadImg(src) {
	if (imgCache.has(src)) return imgCache.get(src);
	const im = new Image(); im.src = src; imgCache.set(src, im); return im;
}
const calcStat = (base, iv, level, isHP) => isHP
	? Math.floor((2 * base + iv) * level / 100) + level + 10
	: Math.floor((2 * base + iv) * level / 100) + 5;

// a valid, sprited, real species id at random (for padding + the AI army)
function randomSpeciesId() {
	const keys = Object.keys(speciesDB).filter(k => speciesDB[k].baseStats && speciesDB[k].sprite && (speciesDB[k].num || 0) > 0);
	return keys[Math.floor(Math.random() * keys.length)];
}
const avgLevel = srcs => (!srcs || !srcs.length) ? 50 : Math.max(5, Math.round(srcs.reduce((s, m) => s + (m.level || 50), 0) / srcs.length));

// choose the 5 species (one per piece type: queen/rook/bishop/knight/pawn) from
// a set of source {speciesId, level} pairs, padded with random species
function pieceTypes(sources, lvl) {
	const pool = sources.slice();
	while (pool.length < 5) pool.push({ speciesId: randomSpeciesId(), level: lvl });
	for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
	return pool.slice(0, 5);
}
// build a FRESH full battle mon per piece (independent HP + moves), keyed by type
function assign(types) {
	const [q, r, b, n, p] = types;
	const mk = t => ({ pokemon: buildMon(t.speciesId, t.level, battle.data) });
	const a = { queen: mk(q), rook1: mk(r), rook2: mk(r), bishop1: mk(b), bishop2: mk(b), knight1: mk(n), knight2: mk(n), king: { pokemon: null } };
	for (let i = 1; i <= 8; i++) a['pawn' + i] = mk(p);
	return a;
}

// ---------- capture battle: a real 1v1 in the overworld battle engine ----------
// The player always controls the WHITE piece's Pokémon (attacking or defending);
// the AI's move plays out as a battle the player fights. HP persists on the
// survivor (the AI's evaluation devalues battle-worn pieces).
function startCaptureBattle(move, attacker, defender) {
	pending = { move, attacker, defender };
	phase = 'battle';
	const playerMon = attacker.side === WHITE ? attacker.pokemon : defender.pokemon;
	const foeMon = attacker.side === WHITE ? defender.pokemon : attacker.pokemon;
	if (playerMon.curHP <= 0) playerMon.curHP = playerMon.maxHP; // a fainted piece rallies to defend/attack
	if (foeMon.curHP <= 0) foeMon.curHP = foeMon.maxHP;
	battle.startTrainer([playerMon], [foeMon], { displayName: 'Rival', money: 0 }, result => onBattleEnd(result));
}
function onBattleEnd(result) {
	const playerWon = result === 'victory';
	const attackerIsPlayer = pending.attacker.side === WHITE;
	const attackerWon = attackerIsPlayer ? playerWon : !playerWon;
	const { move } = pending;
	if (attackerWon) { board.makeMove(move); message = 'Capture!'; }
	else {
		// the defender held: remove the attacker, hand the turn over manually
		const ar = move.fromRow, ac = move.fromCol;
		const lost = board.board[ar][ac];
		board.board[ar][ac] = null;
		if (lost) board.capturedPieces[lost.side === WHITE ? BLACK : WHITE].push(lost);
		board.turn = board.turn === WHITE ? BLACK : WHITE;
		board.checkGameOver();
		message = 'Capture failed!';
	}
	pending = null;
	afterMove(true);
}

// ============================================================================
// Scene
// ============================================================================
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const CELL = 72, BOARD = CELL * 8, PAD = 24, PANEL = 220;
const W = BOARD + PAD * 2 + PANEL, H = BOARD + PAD * 2;
canvas.width = W; canvas.height = H;

let board = null;
let phase = 'loading'; // loading, player, ai, battle, gameover
let cursorR = 2, cursorC = 4, selR = null, selC = null, validMoves = null;
let message = 'Your move.';
let aiTimer = 0;
let pending = null; // { move, attacker, defender } during a capture battle

const BX = x => PAD + (x - 1) * CELL;                 // col 1..8 -> pixel left
const BY = r => PAD + (8 - r) * CELL;                 // row 1..8 -> pixel top (row 8 top)
const pxToCell = (mx, my) => { const c = Math.floor((mx - PAD) / CELL) + 1; const r = 8 - Math.floor((my - PAD) / CELL); return (r >= 1 && r <= 8 && c >= 1 && c <= 8) ? [r, c] : [null, null]; };

let booted = false;
async function boot() {
	if (!booted) { await battle.init(); booted = true; } // loads species/moves/abilities into battle.data
	speciesDB = battle.data.species;
	let party = [];
	try { party = JSON.parse(localStorage.getItem(PARTY_KEY)) || []; } catch (e) { party = []; }
	const sources = party.filter(m => m && m.speciesId && speciesDB[m.speciesId]).map(m => ({ speciesId: m.speciesId, level: m.level || 50 }));
	const lvl = avgLevel(sources);

	board = new ChessBoard();
	board.setupFromAssignments(assign(pieceTypes(sources, lvl)), assign(pieceTypes([], lvl)));
	phase = 'player';
	message = 'Your move — capture a piece to battle!';
}

// ---------- input ----------
function trySelect(r, c) {
	if (phase !== 'player' || board.turn !== WHITE) return;
	const piece = board.getPiece(r, c);
	if (selR) {
		if (r === selR && c === selC) { selR = selC = null; validMoves = null; return; }
		const mv = validMoves && validMoves.find(m => m.toRow === r && m.toCol === c);
		if (mv) { doMove(mv); return; }
		if (piece && piece.side === WHITE) { selR = r; selC = c; validMoves = board.getLegalMovesForPiece(r, c); }
		else { selR = selC = null; validMoves = null; }
	} else if (piece && piece.side === WHITE) {
		selR = r; selC = c; validMoves = board.getLegalMovesForPiece(r, c);
	}
}

function doMove(move) {
	selR = selC = null; validMoves = null;
	if (board.isCaptureMove(move) && !board.involvesKing(move)) {
		const attacker = board.getPiece(move.fromRow, move.fromCol);
		const defender = board.getDefender(move);
		if (attacker && attacker.pokemon && defender && defender.pokemon) {
			startCaptureBattle(move, attacker, defender);
			return;
		}
	}
	applyMove(move);
}

function applyMove(move) {
	board.makeMove(move);
	afterMove();
}

function afterMove(keepMsg) {
	if (board.gameOver) { phase = 'gameover'; return; }
	if (board.turn === BLACK) { phase = 'ai'; aiTimer = 0.4; }
	else { phase = 'player'; if (!keepMsg) message = 'Your move.'; }
}

// ---------- loop ----------
let last = 0;
function loop(ts) {
	const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
	if (!board) { requestAnimationFrame(loop); return; } // still booting
	if (phase === 'battle') { battle.update(dt); draw(); requestAnimationFrame(loop); return; }
	if (phase === 'ai' && board.turn === BLACK) {
		aiTimer -= dt;
		if (aiTimer <= 0) {
			const mv = getBestMove(board, 3);
			if (mv) doMove(mv); else { phase = 'gameover'; board.gameOver = true; }
		}
	}
	draw();
	requestAnimationFrame(loop);
}

// ---------- rendering ----------
function drawSprite(mon, x, y, size, side) {
	if (!mon || !mon.sprite) return;
	const im = loadImg('data/pokemon/' + mon.sprite);
	if (im.complete && im.naturalWidth) {
		const s = Math.min(size / im.naturalWidth, size / im.naturalHeight) * 0.92;
		const w = im.naturalWidth * s, h = im.naturalHeight * s;
		ctx.save();
		if (side === BLACK) { ctx.translate(x + size / 2, y + size / 2); ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); }
		else { ctx.drawImage(im, x + (size - w) / 2, y + (size - h) / 2, w, h); ctx.restore(); }
	}
}

function draw() {
	if (phase === 'battle' && battle.blocking) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); battle.draw(ctx, W, H); return; }
	ctx.fillStyle = '#1a1626'; ctx.fillRect(0, 0, W, H);
	// board squares
	for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) {
		const dark = (r + c) % 2 === 0;
		ctx.fillStyle = dark ? '#6a5f8a' : '#d8cff0';
		ctx.fillRect(BX(c), BY(r), CELL, CELL);
	}
	// last move highlight
	if (board && board.lastMove) {
		const [fr, fc, tr, tc] = board.lastMove;
		ctx.fillStyle = 'rgba(240,220,90,0.35)';
		ctx.fillRect(BX(fc), BY(fr), CELL, CELL); ctx.fillRect(BX(tc), BY(tr), CELL, CELL);
	}
	// selection + valid moves
	if (selR) { ctx.fillStyle = 'rgba(90,200,120,0.45)'; ctx.fillRect(BX(selC), BY(selR), CELL, CELL); }
	if (validMoves) for (const m of validMoves) {
		const cap = board.getPiece(m.toRow, m.toCol);
		ctx.fillStyle = cap ? 'rgba(230,80,80,0.5)' : 'rgba(90,200,120,0.35)';
		ctx.beginPath(); ctx.arc(BX(m.toCol) + CELL / 2, BY(m.toRow) + CELL / 2, cap ? CELL / 2 - 3 : 12, 0, Math.PI * 2); ctx.fill();
	}
	// pieces
	if (board) for (let r = 1; r <= 8; r++) for (let c = 1; c <= 8; c++) {
		const p = board.board[r][c];
		if (!p) continue;
		drawPiece(p, BX(c), BY(r));
	}
	// cursor
	if (phase === 'player') { ctx.strokeStyle = '#f8d84a'; ctx.lineWidth = 3; ctx.strokeRect(BX(cursorC) + 2, BY(cursorR) + 2, CELL - 4, CELL - 4); }

	drawPanel();
	if (phase === 'gameover') drawGameOver();
}

function drawPiece(p, x, y) {
	const side = p.side;
	// side backing ring
	ctx.fillStyle = side === WHITE ? 'rgba(90,160,240,0.22)' : 'rgba(240,90,90,0.22)';
	ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
	if (p.pokemon) drawSprite(p.pokemon, x, y, CELL, side);
	else { // the King carries no Pokémon — draw a clear crown so its square isn't empty
		const kx = x + CELL / 2, ky = y + CELL / 2 + 3, glyph = side === WHITE ? '♔' : '♚';
		ctx.font = 'bold 46px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 3;
		if (side === WHITE) { ctx.fillStyle = '#f0d878'; ctx.strokeStyle = '#6e5210'; } // gold crown, white side
		else { ctx.fillStyle = '#241f30'; ctx.strokeStyle = '#cfc6e6'; }               // dark crown, black side
		ctx.strokeText(glyph, kx, ky); ctx.fillText(glyph, kx, ky);
	}
	// piece-type glyph badge (top-left)
	ctx.font = 'bold 18px serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
	ctx.fillStyle = side === WHITE ? '#12305a' : '#5a1212';
	ctx.fillText(PIECE_GLYPH[p.piece], x + 4, y + 2);
	// hp bar for damaged non-king pieces
	if (p.pokemon && !p.isKing && p.pokemon.curHP < p.pokemon.maxHP) {
		const ratio = Math.max(0, p.pokemon.curHP / p.pokemon.maxHP);
		ctx.fillStyle = '#000'; ctx.fillRect(x + 6, y + CELL - 8, CELL - 12, 4);
		ctx.fillStyle = ratio > 0.5 ? '#63bc5a' : ratio > 0.2 ? '#f4d23c' : '#e05050';
		ctx.fillRect(x + 6, y + CELL - 8, (CELL - 12) * ratio, 4);
	}
}

function drawPanel() {
	const px = PAD * 2 + BOARD;
	ctx.fillStyle = '#241d38'; ctx.fillRect(px, PAD, PANEL - PAD, BOARD);
	ctx.textAlign = 'center'; ctx.textBaseline = 'top';
	ctx.fillStyle = '#e8e0d0'; ctx.font = 'bold 20px system-ui, sans-serif';
	ctx.fillText('PokéChess', px + (PANEL - PAD) / 2, PAD + 12);
	ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#b8aee0';
	const turnTxt = phase === 'gameover' ? '' : (board && board.turn === WHITE ? 'Your turn (White)' : 'Rival thinking… (Black)');
	ctx.fillText(turnTxt, px + (PANEL - PAD) / 2, PAD + 42);
	// message
	ctx.fillStyle = '#f8d84a'; ctx.font = '14px system-ui, sans-serif';
	wrapText(message, px + 12, PAD + 74, PANEL - PAD - 24, 18);
	// captured counts
	ctx.fillStyle = '#e8e0d0'; ctx.font = '12px system-ui, sans-serif';
	if (board) {
		ctx.fillText(`You captured: ${board.capturedPieces[WHITE].length}`, px + (PANEL - PAD) / 2, PAD + BOARD - 60);
		ctx.fillText(`Rival captured: ${board.capturedPieces[BLACK].length}`, px + (PANEL - PAD) / 2, PAD + BOARD - 42);
	}
	ctx.fillStyle = '#8f88b0'; ctx.font = '11px system-ui, sans-serif';
	ctx.fillText('Esc / back — leave', px + (PANEL - PAD) / 2, PAD + BOARD - 20);
}


function drawGameOver() {
	ctx.fillStyle = 'rgba(10,8,20,0.85)'; ctx.fillRect(0, 0, W, H);
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	const won = board.result === 'white';
	ctx.fillStyle = won ? '#63e08a' : board.result === 'draw' ? '#e8e0d0' : '#e06868';
	ctx.font = 'bold 40px system-ui, sans-serif';
	ctx.fillText(won ? 'Checkmate — you win!' : board.result === 'draw' ? 'Stalemate — draw.' : 'Checkmate — you lose.', W / 2, H / 2 - 20);
	ctx.fillStyle = '#e8e0d0'; ctx.font = '18px system-ui, sans-serif';
	ctx.fillText('Press Z / Enter to play again · Esc to leave', W / 2, H / 2 + 30);
}

function wrapText(text, x, y, maxW, lh) {
	const words = String(text).split(' '); let line = '', yy = y;
	ctx.textAlign = 'left';
	for (const w of words) {
		if (ctx.measureText(line + w + ' ').width > maxW && line) { ctx.fillText(line, x, yy); line = w + ' '; yy += lh; }
		else line += w + ' ';
	}
	ctx.fillText(line, x, yy);
	ctx.textAlign = 'center';
}

// ---------- events ----------
const toCanvas = e => { const rect = canvas.getBoundingClientRect(); return [(e.clientX - rect.left) * (W / rect.width), (e.clientY - rect.top) * (H / rect.height)]; };
canvas.addEventListener('mousemove', e => {
	const [mx, my] = toCanvas(e);
	if (phase === 'battle') { battle.hover(mx, my); return; }
	const [r, c] = pxToCell(mx, my);
	if (r) { cursorR = r; cursorC = c; }
});
canvas.addEventListener('click', e => {
	const [mx, my] = toCanvas(e);
	if (phase === 'battle') { battle.tap(mx, my); return; }
	if (phase === 'gameover') { boot(); return; }
	if (phase !== 'player') return;
	const [r, c] = pxToCell(mx, my);
	if (r) { cursorR = r; cursorC = c; trySelect(r, c); }
});
addEventListener('keydown', e => {
	// stop the browser from scrolling the page on the keys the game uses
	if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'z', 'x', 'Enter'].includes(e.key)) e.preventDefault();
	if (phase === 'battle') { battle.key(e.key); return; } // the battle owns input during a clash
	if (e.key === 'Escape') { leave(); return; }
	if (phase === 'gameover') { if (e.key === 'z' || e.key === 'Enter') boot(); return; }
	if (phase !== 'player') return;
	if (e.key === 'ArrowUp' || e.key === 'w') cursorR = Math.min(8, cursorR + 1);
	else if (e.key === 'ArrowDown' || e.key === 's') cursorR = Math.max(1, cursorR - 1);
	else if (e.key === 'ArrowLeft' || e.key === 'a') cursorC = Math.max(1, cursorC - 1);
	else if (e.key === 'ArrowRight' || e.key === 'd') cursorC = Math.min(8, cursorC + 1);
	else if (e.key === 'z' || e.key === 'Enter') trySelect(cursorR, cursorC);
	else if (e.key === 'x') { selR = selC = null; validMoves = null; }
});
function leave() {
	// return to the overworld where the arcade box sits
	const mp = new URLSearchParams(location.search).get('mp');
	location.href = './' + (mp ? '?mp=1' : '');
}
document.getElementById('leave')?.addEventListener('click', leave);

// expose a tiny debug hook for headless testing
window.__pokechess = { get phase() { return phase; }, get board() { return board; }, get battle() { return battle; }, boot, trySelect, doMove, getState: () => ({ phase, turn: board && board.turn, over: board && board.gameOver }) };

boot();
requestAnimationFrame(loop);
