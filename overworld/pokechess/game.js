// game.js — PokéChess scene for the web. Chess where each piece type is a
// Pokémon from your party; a non-king capture resolves as a quick auto-battle
// (attacker survives -> capture; defender survives -> attacker is lost). Player
// is White (bottom); the ported minimax AI plays Black.
import { ChessBoard, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './board.js';
import { getBestMove } from './ai.js';

const PARTY_KEY = 'magepunk_party_v1';
const PIECE_GLYPH = { [PAWN]: '♟', [KNIGHT]: '♞', [BISHOP]: '♝', [ROOK]: '♜', [QUEEN]: '♛', [KING]: '♚' };
const TYPE_COLOR = { Normal: '#9099a1', Fire: '#ff9d55', Water: '#4d90d5', Electric: '#f4d23c', Grass: '#63bc5a', Ice: '#73cec0', Fighting: '#ce4069', Poison: '#ab6ac8', Ground: '#d97845', Flying: '#8fa8dd', Psychic: '#f97176', Bug: '#90c12c', Rock: '#c7b78b', Ghost: '#5269ac', Dragon: '#0b6dc3', Dark: '#5a5366', Steel: '#5a8ea1', Fairy: '#ec8fe6' };

// standard type chart — only multipliers != 1 listed (attacker -> {defender: mult})
const CHART = {
	Normal: { Rock: .5, Ghost: 0, Steel: .5 },
	Fire: { Fire: .5, Water: .5, Grass: 2, Ice: 2, Bug: 2, Rock: .5, Dragon: .5, Steel: 2 },
	Water: { Fire: 2, Water: .5, Grass: .5, Ground: 2, Rock: 2, Dragon: .5 },
	Electric: { Water: 2, Electric: .5, Grass: .5, Ground: 0, Flying: 2, Dragon: .5 },
	Grass: { Fire: .5, Water: 2, Grass: .5, Poison: .5, Ground: 2, Flying: .5, Bug: .5, Rock: 2, Dragon: .5, Steel: .5 },
	Ice: { Fire: .5, Water: .5, Grass: 2, Ice: .5, Ground: 2, Flying: 2, Dragon: 2, Steel: .5 },
	Fighting: { Normal: 2, Ice: 2, Poison: .5, Flying: .5, Psychic: .5, Bug: .5, Rock: 2, Ghost: 0, Dark: 2, Steel: 2, Fairy: .5 },
	Poison: { Grass: 2, Poison: .5, Ground: .5, Rock: .5, Ghost: .5, Steel: 0, Fairy: 2 },
	Ground: { Fire: 2, Electric: 2, Grass: .5, Poison: 2, Flying: 0, Bug: .5, Rock: 2, Steel: 2 },
	Flying: { Electric: .5, Grass: 2, Fighting: 2, Bug: 2, Rock: .5, Steel: .5 },
	Psychic: { Fighting: 2, Poison: 2, Psychic: .5, Dark: 0, Steel: .5 },
	Bug: { Fire: .5, Grass: 2, Fighting: .5, Poison: .5, Flying: .5, Psychic: 2, Ghost: .5, Dark: 2, Steel: .5, Fairy: .5 },
	Rock: { Fire: 2, Ice: 2, Fighting: .5, Ground: .5, Flying: 2, Bug: 2, Steel: .5 },
	Ghost: { Normal: 0, Psychic: 2, Ghost: 2, Dark: .5 },
	Dragon: { Dragon: 2, Steel: .5, Fairy: 0 },
	Dark: { Fighting: .5, Psychic: 2, Ghost: 2, Dark: .5, Fairy: .5 },
	Steel: { Fire: .5, Water: .5, Electric: .5, Ice: 2, Rock: 2, Steel: .5, Fairy: 2 },
	Fairy: { Fire: .5, Fighting: 2, Poison: .5, Dragon: 2, Dark: 2, Steel: .5 },
};
const typeMult = (atkType, defTypes) => defTypes.reduce((m, d) => m * ((CHART[atkType] || {})[d] ?? 1), 1);

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

// build a lightweight mon (sprite + stats + types) from a species id
function monFromSpecies(speciesId, level) {
	const sp = speciesDB[speciesId];
	if (!sp) return null;
	const b = sp.baseStats;
	const iv = () => 16;
	const stats = { hp: calcStat(b.hp || 50, iv(), level, true), atk: calcStat(b.atk || 50, iv(), level), def: calcStat(b.def || 50, iv(), level), spa: calcStat(b.spa || 50, iv(), level), spd: calcStat(b.spd || 50, iv(), level), spe: calcStat(b.spe || 50, iv(), level) };
	return { speciesId, name: (sp.name || speciesId).toUpperCase(), level, types: [...sp.types], stats, maxHP: stats.hp, curHP: stats.hp, sprite: sp.sprite, num: sp.num };
}
// normalize a party mon (from localStorage) into the pokechess shape, cloned so HP is per-piece
function monFromParty(m) {
	const sp = speciesDB[m.speciesId];
	const sprite = m.sprite || (sp && sp.sprite);
	const types = m.types || (sp ? sp.types : ['Normal']);
	const stats = m.stats || (sp ? monFromSpecies(m.speciesId, m.level || 50).stats : { hp: 100, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 });
	const maxHP = m.maxHP || stats.hp;
	return { speciesId: m.speciesId, name: (m.name || m.speciesId).toUpperCase(), level: m.level || 50, types: [...types], stats: { ...stats }, maxHP, curHP: maxHP, sprite, num: m.num || (sp && sp.num) };
}

function randomSpeciesIds(n, level) {
	const keys = Object.keys(speciesDB).filter(k => speciesDB[k].baseStats && speciesDB[k].sprite && (speciesDB[k].num || 0) > 0);
	const out = [];
	for (let i = 0; i < n; i++) out.push(keys[Math.floor(Math.random() * keys.length)]);
	return out.map(id => monFromSpecies(id, level));
}

// assign one mon per piece type (queen/rook/bishop/knight/pawn); king has none
function assignPieces(mons) {
	const pool = mons.slice();
	while (pool.length < 5) pool.push(randomSpeciesIds(1, avgLevel(mons))[0]);
	for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
	const [q, r, b, n, p] = pool;
	const clone = m => ({ ...m, stats: { ...m.stats }, types: [...m.types], curHP: m.maxHP });
	const a = {};
	a.queen = { pokemon: clone(q) };
	a.rook1 = { pokemon: clone(r) }; a.rook2 = { pokemon: clone(r) };
	a.bishop1 = { pokemon: clone(b) }; a.bishop2 = { pokemon: clone(b) };
	a.knight1 = { pokemon: clone(n) }; a.knight2 = { pokemon: clone(n) };
	for (let i = 1; i <= 8; i++) a['pawn' + i] = { pokemon: clone(p) };
	a.king = { pokemon: null };
	return a;
}
const avgLevel = mons => (!mons || !mons.length) ? 50 : Math.max(5, Math.round(mons.reduce((s, m) => s + (m.level || 50), 0) / mons.length));

// ---------- capture battle (v1: quick auto-resolve damage exchange) ----------
// returns 'attacker' | 'defender'; mutates curHP of both mons so damage persists
function resolveBattle(attacker, defender) {
	const dmg = (A, D) => {
		const atkType = A.types[0];
		const physical = A.stats.atk >= A.stats.spa;
		const atkStat = physical ? A.stats.atk : A.stats.spa;
		const defStat = physical ? D.stats.def : D.stats.spd;
		const stab = A.types.includes(atkType) ? 1.5 : 1;
		const tm = Math.max(...A.types.map(t => typeMult(t, D.types)), typeMult(atkType, D.types));
		const base = Math.floor(((2 * A.level / 5 + 2) * 60 * atkStat / Math.max(1, defStat)) / 50) + 2;
		const rand = 0.85 + Math.random() * 0.15;
		return Math.max(1, Math.floor(base * stab * tm * rand));
	};
	// speed order; ties -> attacker first
	let first = attacker, second = defender;
	if (defender.stats.spe > attacker.stats.spe) { first = defender; second = attacker; }
	for (let turn = 0; turn < 40; turn++) {
		second.curHP -= dmg(first, second);
		if (second.curHP <= 0) { second.curHP = 0; return first === attacker ? 'attacker' : 'defender'; }
		first.curHP -= dmg(second, first);
		if (first.curHP <= 0) { first.curHP = 0; return second === attacker ? 'attacker' : 'defender'; }
	}
	// timeout: higher remaining HP% wins
	return (attacker.curHP / attacker.maxHP) >= (defender.curHP / defender.maxHP) ? 'attacker' : 'defender';
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
let battleAnim = null; // { attacker, defender, atkPos, defPos, move, result, t }
let pending = null;

const BX = x => PAD + (x - 1) * CELL;                 // col 1..8 -> pixel left
const BY = r => PAD + (8 - r) * CELL;                 // row 1..8 -> pixel top (row 8 top)
const pxToCell = (mx, my) => { const c = Math.floor((mx - PAD) / CELL) + 1; const r = 8 - Math.floor((my - PAD) / CELL); return (r >= 1 && r <= 8 && c >= 1 && c <= 8) ? [r, c] : [null, null]; };

async function boot() {
	speciesDB = await fetch('data/species_battle.json').then(r => r.json());
	let party = [];
	try { party = JSON.parse(localStorage.getItem(PARTY_KEY)) || []; } catch (e) { party = []; }
	const playerMons = (party.length ? party : randomSpeciesIds(6, 50)).map(m => m.speciesId ? monFromParty(m) : m).filter(Boolean);
	const lvl = avgLevel(playerMons);
	const aiMons = randomSpeciesIds(6, lvl);

	board = new ChessBoard();
	board.setupFromAssignments(assignPieces(playerMons), assignPieces(aiMons));
	phase = 'player';
	message = 'Your move — capture a piece to battle!';
	requestAnimationFrame(loop);
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
			const result = resolveBattle(attacker.pokemon, defender.pokemon);
			pending = { move, attacker, defender, result };
			battleAnim = { attacker: attacker.pokemon, defender: defender.pokemon, playerAttacking: attacker.side === WHITE, result, t: 0 };
			phase = 'battle';
			return;
		}
	}
	applyMove(move);
}

function applyMove(move) {
	board.makeMove(move);
	afterMove();
}

function finishBattle() {
	const { move, attacker, result } = pending;
	if (result === 'attacker') { board.makeMove(move); message = 'Capture!'; }
	else {
		// defender held: remove the attacker, switch turn manually
		const ar = move.fromRow, ac = move.fromCol;
		const lost = board.board[ar][ac];
		board.board[ar][ac] = null;
		if (lost) board.capturedPieces[lost.side === WHITE ? BLACK : WHITE].push(lost);
		board.turn = board.turn === WHITE ? BLACK : WHITE;
		board.checkGameOver();
		message = 'Capture failed!';
	}
	pending = null; battleAnim = null;
	afterMove(true);
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
	if (phase === 'ai' && board.turn === BLACK) {
		aiTimer -= dt;
		if (aiTimer <= 0) {
			const mv = getBestMove(board, 3);
			if (mv) doMove(mv); else { phase = 'gameover'; board.gameOver = true; }
		}
	}
	if (phase === 'battle' && battleAnim) {
		battleAnim.t += dt;
		if (battleAnim.t >= 1.6) finishBattle();
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
		if (battleAnim && pending && ((r === pending.move.fromRow && c === pending.move.fromCol))) continue; // attacker drawn in overlay
		drawPiece(p, BX(c), BY(r));
	}
	// cursor
	if (phase === 'player') { ctx.strokeStyle = '#f8d84a'; ctx.lineWidth = 3; ctx.strokeRect(BX(cursorC) + 2, BY(cursorR) + 2, CELL - 4, CELL - 4); }

	drawPanel();
	if (phase === 'battle' && battleAnim) drawBattle();
	if (phase === 'gameover') drawGameOver();
}

function drawPiece(p, x, y) {
	const side = p.side;
	// side backing ring
	ctx.fillStyle = side === WHITE ? 'rgba(90,160,240,0.22)' : 'rgba(240,90,90,0.22)';
	ctx.fillRect(x + 3, y + 3, CELL - 6, CELL - 6);
	if (p.pokemon) drawSprite(p.pokemon, x, y, CELL, side);
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

function drawBattle() {
	const b = battleAnim;
	ctx.fillStyle = 'rgba(10,8,20,0.82)'; ctx.fillRect(0, 0, W, H);
	const cx = W / 2, cy = H / 2;
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	ctx.fillStyle = '#f8d84a'; ctx.font = 'bold 26px system-ui, sans-serif';
	ctx.fillText('BATTLE!', cx, cy - 130);
	// two combatants clash toward center
	const push = Math.min(1, b.t / 0.5) * 60;
	drawBig(b.attacker, cx - 150 + push, cy - 20, b.playerAttacking ? WHITE : BLACK);
	drawBig(b.defender, cx + 150 - push, cy - 20, b.playerAttacking ? BLACK : WHITE);
	ctx.fillStyle = '#e8e0d0'; ctx.font = 'bold 20px system-ui, sans-serif';
	ctx.fillText('VS', cx, cy - 20);
	if (b.t > 1.0) {
		const youWon = (b.result === 'attacker') === b.playerAttacking;
		ctx.fillStyle = youWon ? '#63e08a' : '#e06868';
		ctx.font = 'bold 22px system-ui, sans-serif';
		ctx.fillText(youWon ? 'You win the clash!' : 'Your piece was beaten!', cx, cy + 110);
	}
}
function drawBig(mon, x, y, side) {
	const im = mon.sprite ? loadImg('data/pokemon/' + mon.sprite) : null;
	ctx.textAlign = 'center';
	if (im && im.complete && im.naturalWidth) {
		const s = 120 / Math.max(im.naturalWidth, im.naturalHeight);
		const w = im.naturalWidth * s, h = im.naturalHeight * s;
		ctx.save();
		if (side === BLACK) { ctx.translate(x, y); ctx.scale(-1, 1); ctx.drawImage(im, -w / 2, -h / 2, w, h); ctx.restore(); }
		else { ctx.drawImage(im, x - w / 2, y - h / 2, w, h); ctx.restore(); }
	}
	ctx.fillStyle = '#e8e0d0'; ctx.font = '13px system-ui, sans-serif';
	ctx.fillText(`${mon.name}  Lv${mon.level}`, x, y + 72);
	// mini hp bar
	const ratio = Math.max(0, mon.curHP / mon.maxHP);
	ctx.fillStyle = '#000'; ctx.fillRect(x - 45, y + 82, 90, 6);
	ctx.fillStyle = ratio > 0.5 ? '#63bc5a' : ratio > 0.2 ? '#f4d23c' : '#e05050';
	ctx.fillRect(x - 45, y + 82, 90 * ratio, 6);
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
canvas.addEventListener('mousemove', e => {
	const rect = canvas.getBoundingClientRect();
	const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
	const [r, c] = pxToCell(mx, my);
	if (r) { cursorR = r; cursorC = c; }
});
canvas.addEventListener('click', e => {
	if (phase === 'gameover') { boot(); return; }
	if (phase !== 'player') return;
	const rect = canvas.getBoundingClientRect();
	const mx = (e.clientX - rect.left) * (W / rect.width), my = (e.clientY - rect.top) * (H / rect.height);
	const [r, c] = pxToCell(mx, my);
	if (r) { cursorR = r; cursorC = c; trySelect(r, c); }
});
addEventListener('keydown', e => {
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
window.__pokechess = { get phase() { return phase; }, get board() { return board; }, boot, trySelect, getState: () => ({ phase, turn: board && board.turn, over: board && board.gameOver }) };

boot();
