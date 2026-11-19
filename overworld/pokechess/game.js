// game.js — PokéChess scene for the web. Chess where each piece type is a
// Pokémon from your party; a non-king capture is resolved by a REAL turn-based
// battle (the overworld battle engine) — attacker survives -> capture, defender
// survives -> attacker is lost. Player is White (bottom); the ported minimax AI
// plays Black.
//
// Three modes (live.js has the spectating + replay plumbing):
//   play     (the default) — a signed-in player's game is broadcast to friends and recorded as a replay tape
//   watch    (?spectate=<friend>) — a read-only view of a friend's game, polled from the server
//   replay   (?replay=<id>, or a game from the Replays list) — a tape played back exactly as it was shown
import { ChessBoard, WHITE, BLACK, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING } from './board.js';
import { getBestMove } from './ai.js';
import { Battle, buildMon } from '../battle.js';
import { startInput, actionForKey, isTyping } from '../../site/input.js';
import * as Live from './live.js';

const battle = new Battle();

const QS = new URLSearchParams(location.search);
const SPECTATE = (QS.get('spectate') || '').trim().toLowerCase();
const REPLAY_PARAM = (QS.get('replay') || '').trim();
let mode = SPECTATE ? 'watch' : REPLAY_PARAM ? 'replay' : 'play';

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
	lastBattleJson = '';
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

// ---------- live broadcast + the replay tape (play mode) ----------
let rec = null;             // this game's recorder (live.js createRecorder)
let publisher = null;       // the live broadcast to friends (a no-op for a guest)
let chat = null;            // the chat overlay (signed in only)
let plies = 0;              // moves played this game (a failed capture counts: the turn passed)
let gameToken = 0;          // bumps per game, so a slow end-of-game upload never touches the next game
let ended = false, resigned = false, resignArmed = 0;
let lastReplay = null;      // the game just finished: { code, net (its uploaded id) }
let lastBattleJson = '';
const currentView = () => Live.viewOf({ board, phase, message, battle, pending, WHITE, BLACK });
const liveLabel = () => 'PokéChess · ' + (phase === 'battle' ? 'Battle!' : 'Move ' + (Math.floor(plies / 2) + 1));
function record() { if (rec && board) rec.add(currentView()); }

// ---------- what watch / replay modes draw ----------
let shownView = null, shownBoard = null;
let watchStatus = 'connecting', watchMeta = {};
let rp = null;              // the replay player: { frames, i, playing, speed, t, fromMenu }
const SPEEDS = [0.5, 1, 2, 4];
// (the game's own `message` is left alone: an in-page replay must not change what the player's spectators read)
function showView(v) { shownView = v; shownBoard = v ? Live.boardFromView(v, WHITE, BLACK) : null; }

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
	// a new game: a fresh tape, and (signed in) a fresh broadcast — the last game's publisher already said "over"
	gameToken++; plies = 0; ended = false; resigned = false; resignArmed = 0; lastReplay = null;
	rec = Live.createRecorder();
	record();
	if (publisher) publisher.stop();
	publisher = Live.startPublisher(currentView, liveLabel);
	if (Live.isLoggedIn() && !chat) chat = Live.mountChat(null, { runner: Live.myName() });
	updateBar();
}

// the game ended (mate, stalemate, resign): the tape's last frame, the local Replays list, the account copy
// (signed in), then the broadcast's last push — it carries the replay, so the game's spectators can watch it
async function endGame() {
	if (ended || !board) return;
	ended = true;
	const token = gameToken, pub = publisher;
	publisher = null;
	record();
	const won = board.result === 'white';
	const tape = rec.tape({ result: board.result || 'draw', plies, resigned, by: Live.myName() || '' });
	let code = null;
	try { code = await Live.packTape(tape); } catch (e) { console.warn('[pokechess] replay not packed', e); }
	if (token === gameToken && code) {
		lastReplay = { code, net: null };
		Live.saveLocalReplay({ when: tape.when, result: tape.result, plies, resigned, code, net: null });
	}
	let id = null;
	if (code && Live.isLoggedIn()) {
		const r = await Live.uploadReplay(code);
		if (r.ok) { id = r.id; Live.setLocalReplayNet(tape.when, id); if (token === gameToken && lastReplay) lastReplay.net = id; }
	}
	if (pub) await pub.finish({ won, replay: id });
	updateBar();
}

function resign() {
	if (mode !== 'play' || !board || board.gameOver || phase === 'battle' || phase === 'loading') return false;
	board.gameOver = true; board.result = 'black';
	resigned = true; selR = selC = null; validMoves = null;
	message = 'You resigned.';
	phase = 'gameover';
	endGame();
	return true;
}
// V (or the Resign button) twice within 3 seconds resigns
function armResign() {
	if (mode !== 'play' || !board || board.gameOver || phase === 'battle') return;
	if (resignArmed && performance.now() - resignArmed < 3000) { resignArmed = 0; resign(); return; }
	resignArmed = performance.now();
	message = 'Resign? Press V (or Resign) again to confirm.';
	updateBar();
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
	plies++; resignArmed = 0;
	if (board.gameOver) { phase = 'gameover'; endGame(); return; }
	if (board.turn === BLACK) { phase = 'ai'; aiTimer = 0.4; }
	else { phase = 'player'; if (!keepMsg) message = 'Your move.'; }
	record();
}

// ---------- loop ----------
let last = 0;
function loop(ts) {
	const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
	if (mode === 'watch' || mode === 'replay') {
		if (mode === 'replay') replayTick(dt);
		if (!shownBoard) drawLoading(ts); else draw();
		requestAnimationFrame(loop); return;
	}
	if (!board) { drawLoading(ts); requestAnimationFrame(loop); return; } // still booting — show a loading screen
	if (phase === 'battle') {
		battle.update(dt);
		// every step of the battle that changes what is on screen (HP, the message) goes on the tape
		const bj = JSON.stringify(Live.battleView(battle, pending, WHITE));
		if (bj !== lastBattleJson) { lastBattleJson = bj; record(); }
		draw(); requestAnimationFrame(loop); return;
	}
	if (phase === 'ai' && board.turn === BLACK) {
		aiTimer -= dt;
		if (aiTimer <= 0) {
			const mv = getBestMove(board, 3);
			if (mv) doMove(mv); else { phase = 'gameover'; board.gameOver = true; board.result = board.result || 'draw'; endGame(); }
		}
	}
	draw();
	requestAnimationFrame(loop);
}

// ---------- rendering ----------
// booting the battle engine (species/moves/abilities) takes a beat; show a
// spinner + title instead of a blank canvas until the board is ready.
function drawLoading(ts) {
	const t = (ts || 0) / 1000;
	ctx.fillStyle = '#1a1626'; ctx.fillRect(0, 0, W, H);
	const cx = W / 2, cy = H / 2;
	ctx.save();
	ctx.strokeStyle = '#f8d84a'; ctx.lineWidth = 5; ctx.lineCap = 'round';
	if (stuck || watchStatus === 'forbidden' || watchStatus === 'login') ctx.strokeStyle = 'rgba(0,0,0,0)';
	const a0 = (t * 4) % (Math.PI * 2);
	ctx.beginPath(); ctx.arc(cx, cy - 26, 26, a0, a0 + Math.PI * 1.4); ctx.stroke();
	ctx.restore();
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	ctx.fillStyle = '#e8e0d0'; ctx.font = 'bold 26px system-ui, sans-serif';
	ctx.fillText('POKÉCHESS', cx, cy + 30);
	ctx.fillStyle = '#b8aee0'; ctx.font = '14px system-ui, sans-serif';
	// (watch / replay: what it is waiting on — "Connecting to alice…", "alice isn't playing right now", ...)
	ctx.fillText(mode !== 'play' && message ? message : 'Loading' + '.'.repeat(1 + (Math.floor(t * 2) % 3)), cx, cy + 58);
	ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; // leave defaults for draw()
}

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
	const viewing = mode !== 'play';
	if (!viewing && phase === 'battle' && battle.blocking) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); battle.draw(ctx, W, H); return; }
	if (viewing && shownView && shownView.phase === 'battle' && shownView.bt) { drawBattleView(shownView.bt); return; }
	const board = viewing ? shownBoard : liveBoard(); // (watch / replay draw the view's board; play draws the game)
	const selR = viewing ? null : selRow(), selC = viewing ? null : selCol(), validMoves = viewing ? null : curValidMoves();
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
	if (!viewing && phase === 'player') { ctx.strokeStyle = '#f8d84a'; ctx.lineWidth = 3; ctx.strokeRect(BX(cursorC) + 2, BY(cursorR) + 2, CELL - 4, CELL - 4); }

	drawPanel(board);
	if (viewing ? board.gameOver : phase === 'gameover') drawGameOver(board);
}
// (draw() shadows these names with the board it is drawing)
const liveBoard = () => board, selRow = () => selR, selCol = () => selC, curValidMoves = () => validMoves;

// a capture battle as a spectator / a replay shows it: both Pokémon, their HP, the battle's message
function drawBattleView(bt) {
	const g = ctx.createLinearGradient(0, 0, 0, H);
	g.addColorStop(0, '#2a3a5a'); g.addColorStop(1, '#16273f');
	ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
	ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#f8d84a'; ctx.font = 'bold 18px system-ui, sans-serif';
	ctx.fillText((mode === 'watch' ? '👁 Watching ' + SPECTATE + ' — ' : '') + 'Capture battle! ' + (bt.atk === 'w' ? 'White attacks' : 'Black attacks'), 20, 34);
	const box = (m, side, x, y) => {
		if (!m) return;
		drawSprite(m, x, y, 200, side);
		const bx = side === BLACK ? x - 250 : x + 220, by = y + 60;
		ctx.fillStyle = 'rgba(12,10,24,0.8)'; ctx.fillRect(bx, by, 230, 74);
		ctx.strokeStyle = side === WHITE ? '#5aa0f0' : '#f05a5a'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, 230, 74);
		ctx.fillStyle = '#e8e0d0'; ctx.font = 'bold 16px system-ui, sans-serif'; ctx.textAlign = 'left';
		ctx.fillText(`${m.name}  Lv${m.level}`, bx + 10, by + 24);
		const ratio = Math.max(0, Math.min(1, m.curHP / (m.maxHP || 1)));
		ctx.fillStyle = '#000'; ctx.fillRect(bx + 10, by + 34, 210, 10);
		ctx.fillStyle = ratio > 0.5 ? '#63bc5a' : ratio > 0.2 ? '#f4d23c' : '#e05050';
		ctx.fillRect(bx + 10, by + 34, 210 * ratio, 10);
		ctx.fillStyle = '#b8aee0'; ctx.font = '13px system-ui, sans-serif';
		ctx.fillText(`HP ${m.curHP}/${m.maxHP} · ${side === WHITE ? 'White' : 'Black'}`, bx + 10, by + 64);
	};
	box(bt.b, BLACK, W - 300, 60);
	box(bt.w, WHITE, 60, H - 330);
	ctx.fillStyle = 'rgba(12,10,24,0.88)'; ctx.fillRect(20, H - 100, W - 40, 80);
	ctx.strokeStyle = '#6a5f8a'; ctx.lineWidth = 2; ctx.strokeRect(20, H - 100, W - 40, 80);
	ctx.fillStyle = '#e8e0d0'; ctx.font = '18px system-ui, sans-serif';
	wrapText(bt.msg || '…', 36, H - 72, W - 72, 24);
	if (mode === 'replay') drawReplayStrip();
}
// the replay's position + speed, bottom right
function drawReplayStrip() {
	if (!rp) return;
	ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
	ctx.fillStyle = '#b8aee0'; ctx.font = '13px system-ui, sans-serif';
	ctx.fillText(`Replay ${rp.i + 1}/${rp.frames.length} · ${rp.speed}× ${rp.playing ? '▶' : '⏸'}`, W - 16, H - 6);
	ctx.textAlign = 'left';
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

function drawPanel(board) {
	const px = PAD * 2 + BOARD;
	ctx.fillStyle = '#241d38'; ctx.fillRect(px, PAD, PANEL - PAD, BOARD);
	ctx.textAlign = 'center'; ctx.textBaseline = 'top';
	ctx.fillStyle = '#e8e0d0'; ctx.font = 'bold 20px system-ui, sans-serif';
	ctx.fillText('PokéChess', px + (PANEL - PAD) / 2, PAD + 12);
	ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = '#b8aee0';
	const turnTxt = mode === 'watch' ? '👁 Watching ' + SPECTATE + (watchMeta.watchers ? ` · ${watchMeta.watchers} watching` : '')
		: mode === 'replay' ? (rp ? `Replay · ${rp.speed}× ${rp.playing ? '▶' : '⏸'}` : 'Replay')
		: phase === 'gameover' ? '' : (board && board.turn === WHITE ? 'Your turn (White)' : 'Rival thinking… (Black)');
	ctx.fillText(turnTxt, px + (PANEL - PAD) / 2, PAD + 42);
	if (mode === 'play' && publisher && publisher.watchers) ctx.fillText(`👁 ${publisher.watchers} watching`, px + (PANEL - PAD) / 2, PAD + 58);
	if (mode === 'replay' && rp) ctx.fillText(`Step ${rp.i + 1} / ${rp.frames.length}`, px + (PANEL - PAD) / 2, PAD + 58);
	// message
	ctx.fillStyle = '#f8d84a'; ctx.font = '14px system-ui, sans-serif';
	wrapText(mode !== 'play' && shownView ? shownView.msg : message, px + 12, PAD + 74, PANEL - PAD - 24, 18);
	// captured counts
	ctx.fillStyle = '#e8e0d0'; ctx.font = '12px system-ui, sans-serif';
	if (board) {
		ctx.fillText(`You captured: ${board.capturedPieces[WHITE].length}`, px + (PANEL - PAD) / 2, PAD + BOARD - 60);
		ctx.fillText(`Rival captured: ${board.capturedPieces[BLACK].length}`, px + (PANEL - PAD) / 2, PAD + BOARD - 42);
	}
	ctx.fillStyle = '#8f88b0'; ctx.font = '11px system-ui, sans-serif';
	ctx.fillText(mode === 'replay' ? 'Z play/pause · ←→ step · ↑↓ speed · X close' : mode === 'play' ? 'C replays · V resign · Backspace leave' : 'Backspace / Select — leave', px + (PANEL - PAD) / 2, PAD + BOARD - 20);
}


function drawGameOver(board) {
	ctx.fillStyle = 'rgba(10,8,20,0.85)'; ctx.fillRect(0, 0, W, H);
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	const won = board.result === 'white';
	const who = mode === 'watch' ? SPECTATE : mode === 'replay' ? 'White' : 'you';
	const quit = /resign/i.test(mode === 'play' ? message : (shownView && shownView.msg) || '');
	ctx.fillStyle = won ? '#63e08a' : board.result === 'draw' ? '#e8e0d0' : '#e06868';
	ctx.font = 'bold 40px system-ui, sans-serif';
	const title = quit ? (mode === 'play' ? 'You resigned.' : who + ' resigned.')
		: won ? (mode === 'play' ? 'Checkmate — you win!' : 'Checkmate — ' + who + ' wins!')
		: board.result === 'draw' ? 'Stalemate — draw.' : (mode === 'play' ? 'Checkmate — you lose.' : 'Checkmate — ' + who + ' loses.');
	ctx.fillText(title, W / 2, H / 2 - 20);
	ctx.fillStyle = '#e8e0d0'; ctx.font = '18px system-ui, sans-serif';
	const sub = mode === 'play' ? 'Press Z / Enter to play again · C replays · Backspace to leave'
		: mode === 'replay' ? 'End of the replay · Z watch again · ← step back · X close'
		: watchMeta.replay ? 'The game is over · Z watch the replay' : 'The game is over.';
	ctx.fillText(sub, W / 2, H / 2 + 30);
	if (mode === 'replay') drawReplayStrip();
}

// ---------- spectating (?spectate=<friend>) ----------
function startWatching() {
	phase = 'watch';
	message = `Connecting to ${SPECTATE}…`;
	Live.startSpectate(SPECTATE, {
		onSnapshot(snap, meta) { watchMeta = meta || {}; if (snap && Array.isArray(snap.board)) showView(snap); updateBar(); },
		onStatus(st, info) {
			watchStatus = st; watchMeta = { ...watchMeta, ...(info || {}) };
			if (!shownBoard) message = st === 'login' ? 'Sign in to watch a friend.' : st === 'forbidden' ? 'You can only watch a friend.'
				: st === 'not-live' ? `${SPECTATE} isn't playing PokéChess right now.` : st === 'full' ? 'Too many watchers right now — retrying…'
				: st === 'offline' ? 'Offline — retrying…' : `Connecting to ${SPECTATE}…`;
			updateBar();
		},
	});
	if (Live.isLoggedIn()) chat = Live.mountChat(null, { runner: SPECTATE, spectator: true });
	updateBar();
}

// ---------- replays ----------
function openTape(tape, fromMenu) {
	const frames = Live.expandTape(tape);
	if (!frames) { message = "That replay can't be read."; return false; }
	if (fromMenu) { selR = selC = null; validMoves = null; }
	rp = { frames, i: 0, playing: true, speed: 1, t: 0, fromMenu: !!fromMenu, tape };
	mode = 'replay';
	showView(frames[0]);
	closeList();
	updateBar();
	return true;
}
async function openCode(code, fromMenu) {
	const tape = await Live.unpackTape(code);
	return openTape(tape, fromMenu);
}
async function openReplayParam() {
	message = 'Loading the replay…';
	const r = Live.REPLAY_ID_RE.test(REPLAY_PARAM) ? await Live.fetchReplay(REPLAY_PARAM) : { error: 'bad id' };
	if (r.code && await openCode(r.code, false)) return;
	message = r.error === 'not found' ? 'That replay has expired or was never saved.' : "That replay can't be opened.";
	stuck = true; // (the loading screen shows the message, without its spinner)
}
let stuck = false;
// how long a frame stays up at 1×: a board move a beat, a battle step long enough to read its message
const frameSecs = (f) => f.phase === 'battle' ? 1.1 : 0.9;
function replayTick(dt) {
	if (!rp || !rp.playing) return;
	rp.t += dt * rp.speed;
	if (rp.t < frameSecs(rp.frames[rp.i])) return;
	rp.t = 0;
	if (rp.i < rp.frames.length - 1) { rp.i++; showView(rp.frames[rp.i]); }
	if (rp.i >= rp.frames.length - 1) rp.playing = false;
	updateBar();
}
function replayStep(d) {
	if (!rp) return;
	rp.playing = false; rp.t = 0;
	rp.i = Math.max(0, Math.min(rp.frames.length - 1, rp.i + d));
	showView(rp.frames[rp.i]);
	updateBar();
}
function replayToggle() {
	if (!rp) return;
	if (!rp.playing && rp.i >= rp.frames.length - 1) { rp.i = 0; showView(rp.frames[0]); }
	rp.playing = !rp.playing; rp.t = 0;
	updateBar();
}
function replaySpeed(d) {
	if (!rp) return;
	const i = SPEEDS.indexOf(rp.speed);
	rp.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, (i < 0 ? 1 : i) + d))];
	updateBar();
}
function closeReplay() {
	if (!rp) return;
	if (!rp.fromMenu) { location.href = './pokechess.html'; return; } // a shared link: on to a game of your own
	rp = null; mode = 'play'; shownView = shownBoard = null;
	updateBar();
}
function replayKey(k) {
	if (k === 'z' || k === 'Enter' || k === ' ') replayToggle();
	else if (k === 'ArrowRight') replayStep(1);
	else if (k === 'ArrowLeft') replayStep(-1);
	else if (k === 'ArrowUp') replaySpeed(1);
	else if (k === 'ArrowDown') replaySpeed(-1);
	else if (k === 'x' || k === 'Escape') closeReplay();
}

// ---------- the Replays list (the page's menu: the last 10 games in this browser) ----------
let listOpen = false, listSel = 0, listItems = [];
const canOpenList = () => mode === 'play' && phase !== 'battle' && phase !== 'ai' && phase !== 'loading';
function openList() {
	if (!canOpenList()) return;
	listItems = Live.localReplays();
	listOpen = true; listSel = 0;
	renderList();
}
function closeList() { listOpen = false; renderList(); }
function renderList() {
	const el = document.getElementById('pcList');
	if (!el) return;
	el.hidden = !listOpen;
	if (!listOpen) return;
	const res = (e) => e.resigned ? 'Resigned' : e.result === 'white' ? 'Won' : e.result === 'draw' ? 'Draw' : 'Lost';
	const when = (t) => { try { return new Date(t).toLocaleString(); } catch { return ''; } };
	el.innerHTML = '<h2>Replays</h2>' + (listItems.length ? '' : '<p class="empty">No games yet — finish one and it lands here.</p>')
		+ listItems.map((e, i) => `<button class="pc-item${i === listSel ? ' sel' : ''}" data-i="${i}">${res(e)} · ${Math.ceil((e.plies || 0) / 2)} moves · ${when(e.when)}${e.net ? ' · 🔗' : ''}</button>`).join('')
		+ '<button class="pc-close" data-close="1">Close (X)</button>';
	el.querySelectorAll('.pc-item').forEach((b) => b.addEventListener('click', () => { listSel = +b.dataset.i; pickList(); }));
	el.querySelector('.pc-close').addEventListener('click', closeList);
}
function pickList() { const e = listItems[listSel]; if (e) openCode(e.code, true); }
function listKey(k) {
	if (k === 'ArrowUp') listSel = Math.max(0, listSel - 1);
	else if (k === 'ArrowDown') listSel = Math.min(Math.max(0, listItems.length - 1), listSel + 1);
	else if (k === 'z' || k === 'Enter') { pickList(); return; }
	else if (k === 'x' || k === 'Escape' || k === 'c') { closeList(); return; }
	renderList();
}

// ---------- the bar under the board (touch + mouse; every button has a key too) ----------
function updateBar() {
	const show = (id, on) => { const b = document.getElementById(id); if (b) b.hidden = !on; };
	show('pcReplays', mode === 'play');
	show('pcResign', mode === 'play' && !!board && !board.gameOver);
	show('pcWatchLast', mode === 'play' && !!lastReplay);
	show('pcCopy', (mode === 'play' && !!(lastReplay && lastReplay.net)) || (mode === 'replay' && Live.REPLAY_ID_RE.test(REPLAY_PARAM)));
	show('pcWatchReplay', mode === 'watch' && !!watchMeta.over && !!watchMeta.replay);
	const ctl = document.getElementById('pcCtl');
	if (ctl) {
		ctl.hidden = mode !== 'replay';
		const pp = document.getElementById('pcPlay'); if (pp && rp) pp.textContent = rp.playing ? '⏸ Pause' : '▶ Play';
		const sp = document.getElementById('pcSpeed'); if (sp && rp) sp.textContent = rp.speed + '×';
	}
}
async function copyLink(id) {
	const url = Live.replayUrl(id);
	let ok = false;
	try { await navigator.clipboard.writeText(url); ok = true; } catch { /* no clipboard: show the link instead */ }
	if (mode === 'play') message = ok ? 'Replay link copied.' : url;
	const b = document.getElementById('pcCopy');
	if (b) { b.textContent = ok ? '✓ Copied' : url; setTimeout(() => { b.textContent = '🔗 Copy replay link'; }, 2500); }
}
function wireBar() {
	const on = (id, fn) => document.getElementById(id)?.addEventListener('click', (e) => { e.preventDefault(); fn(); });
	on('pcReplays', () => (listOpen ? closeList() : openList()));
	on('pcResign', armResign);
	on('pcWatchLast', () => { if (lastReplay && canOpenList()) openCode(lastReplay.code, true); });
	on('pcCopy', () => copyLink(mode === 'replay' ? REPLAY_PARAM : lastReplay && lastReplay.net));
	on('pcWatchReplay', () => { if (watchMeta.replay) location.href = './pokechess.html?replay=' + encodeURIComponent(watchMeta.replay); });
	on('pcBack', () => replayStep(-1));
	on('pcPlay', replayToggle);
	on('pcFwd', () => replayStep(1));
	on('pcSpeed', () => { const i = SPEEDS.indexOf(rp ? rp.speed : 1); if (rp) { rp.speed = SPEEDS[(i + 1) % SPEEDS.length]; updateBar(); } });
	on('pcClose', closeReplay);
	updateBar();
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
	if (mode !== 'play') return;
	if (phase === 'battle') { battle.hover(mx, my); return; }
	const [r, c] = pxToCell(mx, my);
	if (r) { cursorR = r; cursorC = c; }
});
canvas.addEventListener('click', e => {
	const [mx, my] = toCanvas(e);
	if (mode === 'replay') { replayToggle(); return; }   // a tap on the board plays / pauses
	if (mode === 'watch') { if (watchMeta.over && watchMeta.replay) chessKey('z'); return; }
	if (listOpen) return;
	if (phase === 'battle') { battle.tap(mx, my); return; }
	if (phase === 'gameover') { boot(); return; }
	if (phase !== 'player') return;
	const [r, c] = pxToCell(mx, my);
	if (r) { cursorR = r; cursorC = c; trySelect(r, c); }
});
// every input arrives as one of these key names: the keyboard and a controller both go
// through site/input.js (arrows / WASD move, Z pick, X deselect, Enter = Start, Backspace =
// Select = leave), and a capture battle owns them while it runs
function chessKey(k) {
	if (mode === 'replay') { replayKey(k); return; }
	if (mode === 'watch') { // a spectator changes nothing; at the end, Z opens the game's replay
		if ((k === 'z' || k === 'Enter') && watchMeta.over && watchMeta.replay) location.href = './pokechess.html?replay=' + encodeURIComponent(watchMeta.replay);
		return;
	}
	if (listOpen) { listKey(k); return; }
	if (phase === 'battle') { battle.key(k); return; } // the battle owns input during a clash
	if (k === 'c') { openList(); return; }   // C / the pad's X: the Replays list
	if (k === 'v') { armResign(); return; }  // V / the pad's Y, twice: resign
	if (phase === 'gameover') { if (k === 'z' || k === 'Enter') boot(); return; }
	if (phase !== 'player') return;
	if (k === 'ArrowUp') cursorR = Math.min(8, cursorR + 1);
	else if (k === 'ArrowDown') cursorR = Math.max(1, cursorR - 1);
	else if (k === 'ArrowLeft') cursorC = Math.max(1, cursorC - 1);
	else if (k === 'ArrowRight') cursorC = Math.min(8, cursorC + 1);
	else if (k === 'z' || k === 'Enter') trySelect(cursorR, cursorC);
	else if (k === 'x') { selR = selC = null; validMoves = null; }
}
const ACTION_KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', confirm: 'z', cancel: 'x' };
// Select leaves and Start picks, but only on their RELEASE, and only when pressed alone:
// Start + Select together opens the Games switcher (site/switcher.js), and the game must not
// have left (or moved) by then
let selectAlone = false, startAlone = false, input = null;
function onAction(a, info) {
	if (ACTION_KEY[a]) { chessKey(ACTION_KEY[a]); return true; }
	// (C / V never reached a capture battle before, so they stay out of it)
	if (a === 'secondary' || a === 'context') { if (phase === 'battle' && mode === 'play' && !listOpen) return false; chessKey(a === 'secondary' ? 'c' : 'v'); return true; }
	if (a === 'select') { selectAlone = !(input && input.held('menu')); startAlone = false; return true; }
	if (a === 'menu') {
		if (info.source === 'key') { chessKey('Enter'); return true; }   // the keyboard has no Start + Select chord
		startAlone = !(input && input.held('select')); if (!startAlone) selectAlone = false;
		return true;
	}
	return false;
}
function onRelease(a, info) {
	if (a === 'select') { const go = selectAlone && !info.forced; selectAlone = false; if (go && (phase !== 'battle' || mode !== 'play')) leave(); }
	if (a === 'menu') { const go = startAlone && !info.forced; startAlone = false; if (go) chessKey('Enter'); }
}
input = startInput({ onAction, onRelease, pad: true });
window.__pokechessInput = input;
// the keys the scheme leaves to the game: Esc (a quick tap = back, like X; a held Esc opens the
// Games switcher), and any other letter a capture battle uses (its own shortcuts)
addEventListener('keydown', e => {
	if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target && e.target.tagName ? e.target : undefined)) return;
	if (e.key === 'Escape') { chessKey('x'); return; }
	if (e.key === ' ') { e.preventDefault(); if (mode === 'replay') replayToggle(); return; }   // (no page scroll; Space plays / pauses a replay)
	if (phase === 'battle' && e.isTrusted && !actionForKey(e) && /^[a-z]$/i.test(e.key)) battle.key(e.key.toLowerCase());
});
function leave() {
	// return to the overworld where the arcade box sits
	const mp = new URLSearchParams(location.search).get('mp');
	location.href = './' + (mp ? '?mp=1' : '');
}
document.getElementById('leave')?.addEventListener('click', leave);

// expose a tiny debug hook for headless testing
window.__pokechess = {
	get phase() { return phase; }, get cursor() { return [cursorR, cursorC]; }, get sel() { return selR == null ? null : [selR, selC]; }, get validMoves() { return validMoves; }, get board() { return board; }, get battle() { return battle; },
	boot, trySelect, doMove, getState: () => ({ phase, turn: board && board.turn, over: board && board.gameOver }),
	// spectating + replays
	get mode() { return mode; }, get shown() { return shownView; }, get watch() { return { status: watchStatus, ...watchMeta }; },
	get replay() { return rp ? { i: rp.i, n: rp.frames.length, playing: rp.playing, speed: rp.speed } : null; },
	get lastReplay() { return lastReplay; }, get listOpen() { return listOpen; }, replayFrames: () => (rp ? rp.frames : null),
	live: () => ({ publishing: !!publisher && Live.isLoggedIn(), watchers: publisher ? publisher.watchers : 0, frames: rec ? rec.frames.length : 0 }),
	view: currentView, cells: () => (board ? Live.boardCells(board) : null), resign, key: chessKey, openCode,
};

wireBar();
if (mode === 'watch') startWatching();
else if (mode === 'replay') openReplayParam();
else boot();
requestAnimationFrame(loop);
