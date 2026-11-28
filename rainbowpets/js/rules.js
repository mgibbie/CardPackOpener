// rules.js — RAINBOW PETS, the basic game (game by Daniel Espinoza; the rulebook: "Rainbow Pets, Rulebook and Play
// Guide"). Pure and deterministic: a match is its setup (seed, seats, each seat's pets, the options) and its actions, so
// replays, spectating, resume and the server's referee all rebuild it the same way. No page, no storage.
//
// THE GAME, as the rulebook has it (2-4 players):
//   * each player has a Palette of 3 spots (a Pet in each), Extra Pets beside it, a Deck of Color Cards, a Hand (3 to
//     start, secret) and a Scrap Pile. The Canvas, shared, has 6 spots: R O Y G B P, around a wheel.
//   * a Pet has 2 color symbols; its TRUE COLOR is their mixture. A Color Card laid on a symbol covers it (cards stack).
//   * a turn: draw 1, then up to 3 actions, each once: PAINT 1 of your Pets with a card from your Hand, MOVE 1 of your
//     Pets from your Palette to the Canvas spot of its true color (covering whoever is there), let 1 of your Pets THROW
//     the top card of one of its symbols at another Pet. The turn ends after all 3, or on "pass".
//   * OPPOSITE COLORS (across the wheel: R-G, O-B, Y-P; and white-black) on one Pet's 2 symbols WIPE IT OUT: it leaves
//     play and the cards on it go to their owners' Scrap Piles.
//   * a Pet on the Canvas whose color changes moves to its new color's spot, or back to its Palette if it has none.
//   * a NEWSPAPER (in the deck) is played on any player's turn, onto a Pet about to be splatted: the throw is stopped and
//     the thrown card scrapped (the free throw is used up).
//   * win: 3 of your Pets on the Canvas at once, or every Rival's Pets wiped out.
//
// WHERE THE RULEBOOK IS SILENT, these are this engine's choices (MIX and the rest are exported so a page can say them):
//   * mixing: the same color is itself; two colors two steps apart on the wheel make the one between (R+Y = O, O+G = Y);
//     next to each other (R+O) make an in-between shade that is no Canvas color; white or black with a color makes a
//     tint or shade that is no Canvas color (unless the White = No Color option is on).
//   * a Pet is checked for a wipe-out when its colors CHANGE (a Pet printed with 2 opposites, like Love, plays until then).
//   * a Pet sent back to a full Palette covers the spot with the fewest Pets (leftmost on a tie).
//   * the deck: 4 of each rainbow color, 2 white, 2 black and 2 Newspapers (30 cards).
//   * an empty deck draws nothing (unless the Deck-Out option is on).
//   * the first player is drawn from the seed.
//   * the full game's Pet Powers are not played yet (the sheet gives their effects, not their colors or types).
//
// TAG-TEAM (the rulebook's optional rule: "2v2 match for 4 players. Partners play with 2 Palettes and 2 Decks. Both
// players' Pets work together as a team. Each player can paint 1 Pet and throw 1 Color per turn, but only move 1 Pet per
// team"). setup.tagTeam with 4 seats: seats a + b are one team, c + d the other. This engine's reading of it:
//   * a TEAM TURN is the partners' turns one after the other (a then b, then c then d); each partner draws, paints once
//     and throws once, and the team moves 1 Pet in all (whoever moves it, the partner's turn starts with Move used).
//   * "work together": a player may paint, move and throw with their partner's Pets as their own, and a Pet on either
//     partner's Palette can throw at the other's. Extra Pets go to their own player's Palette.
//   * the team wins with 3 of its Pets on the Canvas (either partner's), or when every Rival Pet is wiped out. A partner
//     who leaves is out; their Pets stay with the team.
//   * a STALEMATE ends it: once every deck is empty, if STALL_ROUNDS rounds in a row pass with nobody doing anything, or
//     LATE_ROUNDS rounds go by whatever is done, the player with the most Pets on the Canvas wins (then the most Pets
//     left); still level, it is a draw. (Without it a match whose decks are spent can go on for ever.)
import { makeRng } from '../../overworld/rules/rng.js';
import { PETS, petById } from './pets.js';

export const RP_RULES_REV = 1;
export const WHEEL = Object.freeze(['R', 'O', 'Y', 'G', 'B', 'P']);
export const COLORS = Object.freeze([...WHEEL, 'W', 'K']);
export const COLOR_NAME = Object.freeze({ R: 'red', O: 'orange', Y: 'yellow', G: 'green', B: 'blue', P: 'purple', W: 'white', K: 'black' });
export const COLOR_HEX = Object.freeze({ R: '#e8403a', O: '#f28c28', Y: '#f5d02f', G: '#3fb55a', B: '#2f7fe0', P: '#8e4fc9', W: '#f4f1ea', K: '#2a2530' });
export const OPPOSITE = Object.freeze({ R: 'G', G: 'R', O: 'B', B: 'O', Y: 'P', P: 'Y', W: 'K', K: 'W' });
export const SEATS = Object.freeze(['a', 'b', 'c', 'd']);
export const PALETTE = 3, HAND_START = 3, ACTIONS = Object.freeze(['paint', 'move', 'throw']);
export const TEAM_MIN = 3, TEAM_MAX = 5, STALL_ROUNDS = 2, LATE_ROUNDS = 10;
export const DECK = Object.freeze({ R: 4, O: 4, Y: 4, G: 4, B: 4, P: 4, W: 2, K: 2, N: 2 });   // N: a Newspaper
export const OPTIONS = Object.freeze({
	whiteClear: { name: 'White = No Color', say: 'Any color + white is that color (black + white is still a wipe-out).' },
	whiteHeal: { name: 'White Card Healing', say: 'On your turn, a white card from your Hand heals 1 of your wiped-out Pets (to your Extra Pets). Free.' },
	deckOut: { name: 'Deck-Out', say: 'If you cannot draw at the start of your turn, you lose.' },
	tempWipe: { name: 'Wipe-Outs are Temporary', say: 'Your wiped-out Pets heal at the start of your turn. Wipe out all of a Rival\'s Pets in 1 turn to beat them.' },
});
export const OPTION_KEYS = Object.freeze(Object.keys(OPTIONS));

// ---------------------------------------------------------------- colors
const wheelAt = (c) => WHEEL.indexOf(c);
/**
 * Two colors mixed. -> { c: a Canvas color, or null; wipe: are they opposites; name: what to call it; hex }
 * opts.whiteClear: any color + white is that color (black + white still wipes).
 */
export function mix(a, b, opts = {}) {
	if (OPPOSITE[a] === b) return { c: null, wipe: true, name: 'a muddy mess', hex: '#6b5a4a' };
	if (a === b) return { c: WHEEL.includes(a) ? a : null, wipe: false, name: COLOR_NAME[a], hex: COLOR_HEX[a] };
	if (opts.whiteClear && (a === 'W' || b === 'W')) { const o = a === 'W' ? b : a; return { c: WHEEL.includes(o) ? o : null, wipe: false, name: COLOR_NAME[o], hex: COLOR_HEX[o] }; }
	const blend = (x, y, t = 0.5) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(COLOR_HEX[x].slice(i, i + 2), 16) * (1 - t) + parseInt(COLOR_HEX[y].slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
	if (a === 'W' || b === 'W') { const o = a === 'W' ? b : a; return { c: null, wipe: false, name: 'light ' + COLOR_NAME[o], hex: blend(o, 'W', 0.45) }; }
	if (a === 'K' || b === 'K') { const o = a === 'K' ? b : a; return { c: null, wipe: false, name: 'dark ' + COLOR_NAME[o], hex: blend(o, 'K', 0.45) }; }
	const i = wheelAt(a), j = wheelAt(b), d = Math.min((i - j + 6) % 6, (j - i + 6) % 6);
	if (d === 2) { const mid = (i + 1) % 6 === (j + 5) % 6 ? (i + 1) % 6 : (i + 5) % 6; return { c: WHEEL[mid], wipe: false, name: COLOR_NAME[WHEEL[mid]], hex: COLOR_HEX[WHEEL[mid]] }; }
	return { c: null, wipe: false, name: COLOR_NAME[a] + '-' + COLOR_NAME[b], hex: blend(a, b) };   // (next to each other: an in-between shade)
}

// ---------------------------------------------------------------- a match
/**
 * setup: { seed, seats: [{ name, pets: [pet id] (3 to 5; the first 3 start on the Palette), cpu?: 'easy' | 'normal' }]
 *          (2 to 4), opts?: { whiteClear, whiteHeal, deckOut, tempWipe } }
 * -> the state. A setup that cannot be played -> null (setupProblems says why).
 */
export function setupProblems(setup) {
	const out = [];
	if (!setup || typeof setup !== 'object') return ['no setup'];
	if (!Array.isArray(setup.seats) || setup.seats.length < 2 || setup.seats.length > 4) out.push('2 to 4 players');
	else if (setup.tagTeam && setup.seats.length !== 4) out.push('Tag-Team is 4 players');
	for (const [i, s] of (setup.seats || []).entries()) {
		if (!s || !Array.isArray(s.pets) || s.pets.length < TEAM_MIN || s.pets.length > TEAM_MAX) { out.push(`player ${i + 1}: ${TEAM_MIN} to ${TEAM_MAX} pets`); continue; }
		if (!s.pets.every((id) => petById(id))) out.push(`player ${i + 1}: a pet that does not exist`);
		if (new Set(s.pets).size !== s.pets.length) out.push(`player ${i + 1}: the same pet twice`);
	}
	return out;
}
export function newMatch(setup) {
	if (setupProblems(setup).length) return null;
	const seed = String(setup.seed || 'rp');
	const opts = {}; for (const k of OPTION_KEYS) if (setup.opts && setup.opts[k] === true) opts[k] = true;
	const S = { v: 1, rev: RP_RULES_REV, seed, opts, rng: 0, players: [], pets: {}, cards: {}, canvas: {}, turn: 1, cur: 0, used: {}, phase: 'play', pending: null, over: null, n: 0, log: [] };
	const rng = makeRng(seed + ':deal');
	for (const c of WHEEL) S.canvas[c] = [];
	setup.seats.forEach((s, i) => {
		const seat = SEATS[i], P = { seat, name: String(s.name || 'Player ' + (i + 1)).slice(0, 24), cpu: s.cpu === 'easy' || s.cpu === 'normal' ? s.cpu : null,
			deck: [], hand: [], scrap: [], palette: [[], [], []], extra: [], wiped: [], out: false };
		s.pets.forEach((id, k) => { const uid = seat + k; S.pets[uid] = { uid, id, owner: seat, slots: [[], []] }; if (k < PALETTE) P.palette[k].push(uid); else P.extra.push(uid); });
		let n = 0;
		for (const [c, k] of Object.entries(DECK)) for (let j = 0; j < k; j++) { const cid = seat + (n++); S.cards[cid] = { id: cid, c, owner: seat }; P.deck.push(cid); }
		for (let j = P.deck.length - 1; j > 0; j--) { const r = Math.floor(rng() * (j + 1)); [P.deck[j], P.deck[r]] = [P.deck[r], P.deck[j]]; }
		for (let j = 0; j < HAND_START; j++) P.hand.push(P.deck.pop());
		S.players.push(P);
	});
	S.cur = Math.floor(rng() * S.players.length);   // ("the player with the most colorful socks on goes first")
	if (setup.tagTeam) { S.teams = [['a', 'b'], ['c', 'd']]; S.tmove = false; S.cur = S.cur < 2 ? 0 : 2; }   // (a team's turn starts with its first player)
	S.rng = rng.state();
	startTurn(S);
	return S;
}

// ---------------------------------------------------------------- where things are
const P_ = (S, seat) => S.players.find((p) => p.seat === seat) || null;
export const playerOf = P_;
export const curPlayer = (S) => S.players[S.cur];
/** The seats playing together with `seat` (itself included): its team in Tag-Team, else just itself. */
export const sideOf = (S, seat) => (S.teams && S.teams.find((t) => t.includes(seat))) || [seat];
/** Are these two seats on the same side. */
export const allies = (S, x, y) => x === y || sideOf(S, x).includes(y);
/** The sides of the match: [[seat]] each player alone, or the 2 teams. */
const sides = (S) => S.teams || S.players.map((p) => [p.seat]);
/** Did `seat` win this finished match (alone, or with its team). */
export const wonBy = (over, seat) => !!over && !!seat && (Array.isArray(over.winners) ? over.winners.includes(seat) : over.winner === seat);
const topOf = (stack) => (stack.length ? stack[stack.length - 1] : null);
const slotColor = (S, pet, k) => { const st = pet.slots[k]; return st.length ? S.cards[st[st.length - 1]].c : petById(pet.id).c[k]; };
/** The two colors a Pet shows now (the top card on each symbol, or the printed symbol). */
export const colorsOf = (S, uid) => { const p = S.pets[uid]; return [slotColor(S, p, 0), slotColor(S, p, 1)]; };
/** A Pet's true color now: mix() of its two. */
export const trueColor = (S, uid) => { const [a, b] = colorsOf(S, uid); return mix(a, b, S.opts); };
/** Where a Pet is: { zone: 'palette' | 'canvas' | 'extra' | 'wiped', spot (palette index or canvas color), top: is it the one showing } */
export function whereIs(S, uid) {
	const pet = S.pets[uid], P = P_(S, pet.owner);
	for (let i = 0; i < PALETTE; i++) { const k = P.palette[i].indexOf(uid); if (k >= 0) return { zone: 'palette', spot: i, top: k === P.palette[i].length - 1 }; }
	for (const c of WHEEL) { const k = S.canvas[c].indexOf(uid); if (k >= 0) return { zone: 'canvas', spot: c, top: k === S.canvas[c].length - 1 }; }
	if (P.extra.includes(uid)) return { zone: 'extra', spot: null, top: false };
	return { zone: 'wiped', spot: null, top: false };
}
/** Is the Pet "in play": the one showing on a Palette spot or a Canvas spot. */
export const inPlay = (S, uid) => { const w = whereIs(S, uid); return (w.zone === 'palette' || w.zone === 'canvas') && w.top; };
/** A player's Pets on the Canvas (the ones showing). */
export const onCanvas = (S, seat) => WHEEL.map((c) => topOf(S.canvas[c])).filter((u) => u && S.pets[u].owner === seat);
/** Every Pet of a player not wiped out. */
export const alivePets = (S, seat) => Object.values(S.pets).filter((p) => p.owner === seat && whereIs(S, p.uid).zone !== 'wiped').map((p) => p.uid);
/** A side's Pets on the Canvas / not wiped out (a seat's own, or its whole team's). */
export const sideOnCanvas = (S, seat) => sideOf(S, seat).flatMap((s) => onCanvas(S, s));
export const sideAlive = (S, seat) => sideOf(S, seat).flatMap((s) => alivePets(S, s));
const sideLive = (S, side) => side.some((s) => !P_(S, s).out);

// ---------------------------------------------------------------- the turn
const ev = (S, e) => { S.log.push({ ...e, n: S.n }); if (S.log.length > 200) S.log.shift(); };
function startTurn(S) {
	const P = curPlayer(S);
	S.used = {};
	if (S.teams && S.tmove) S.used.move = true;   // (Tag-Team: the team has moved its 1 Pet this team turn)
	if (S.opts.tempWipe && P.wiped.length) { for (const u of P.wiped) P.extra.push(u); ev(S, { t: 'healall', seat: P.seat, n: P.wiped.length }); P.wiped = []; }
	if (P.deck.length) { P.hand.push(P.deck.pop()); ev(S, { t: 'draw', seat: P.seat }); }
	else if (S.opts.deckOut) { knockOut(S, P, 'deck'); return; }
	ev(S, { t: 'turn', seat: P.seat, turn: S.turn });
}
function endTurn(S) {
	if (S.over) return;
	const live = S.players.filter((p) => !p.out);
	if (!live.length) return;
	if (!live.some((p) => p.deck.length)) { S.late = (S.late || 0) + 1; if (S.late >= LATE_ROUNDS * live.length) { stalemate(S); return; } }
	let i = S.cur;
	do { i = (i + 1) % S.players.length; } while (S.players[i].out);
	S.turn++;   // (every player's turn counts: turn 1 is the first player's)
	if (S.teams && !allies(S, S.players[S.cur].seat, S.players[i].seat)) S.tmove = false;   // (a new team turn: its move is back)
	S.cur = i;
	startTurn(S);
}
function knockOut(S, P, why) {
	if (P.out) return;
	P.out = true;
	ev(S, { t: 'out', seat: P.seat, why });
	const live = sides(S).filter((sd) => sideLive(S, sd));
	if (live.length === 1) finish(S, live[0].find((s) => !P_(S, s).out), why === 'deck' ? 'deck' : 'wipe');
	else if (!S.over && curPlayer(S) === P) endTurn(S);
}
/** A turn passed with nothing done: once every deck is empty, STALL_ROUNDS rounds of that end the match. */
function stallTick(S) {
	const live = S.players.filter((p) => !p.out);
	if (live.some((p) => p.deck.length)) { S.idle = 0; return; }
	S.idle = (S.idle || 0) + 1;
	if (S.idle >= STALL_ROUNDS * live.length) stalemate(S);
}
function stalemate(S) {
	const live = sides(S).filter((sd) => sideLive(S, sd)).map((sd) => sd.find((s) => !P_(S, s).out));
	const key = (s) => [sideOnCanvas(S, s).length, sideAlive(S, s).length];
	const ranked = live.map((s) => ({ s, k: key(s) })).sort((x, y) => y.k[0] - x.k[0] || y.k[1] - x.k[1]);
	const tie = ranked.length > 1 && ranked[0].k[0] === ranked[1].k[0] && ranked[0].k[1] === ranked[1].k[1];
	ev(S, { t: 'stalemate' });
	finish(S, tie ? null : ranked[0].s, 'stalemate');
}
function finish(S, seat, how) {
	S.over = { winner: seat, how, turn: S.turn };
	if (S.teams) S.over.winners = seat ? sideOf(S, seat).slice() : [];
	S.phase = 'over'; S.pending = null;
	ev(S, { t: 'over', seat, how, ...(S.teams ? { team: seat ? sideOf(S, seat).slice() : [] } : {}) });
}
/** Has anyone won: 3 on the Canvas (the side whose turn it is first), or the last side with Pets. */
function checkWin(S) {
	if (S.over) return;
	const order = [...S.players.slice(S.cur), ...S.players.slice(0, S.cur)].filter((p) => !p.out);
	for (const P of order) if (sideOnCanvas(S, P.seat).length >= 3) return finish(S, P.seat, 'canvas');
	if (S.teams) {   // (a team with no Pets left is out together: its partners leave at once, not turn by turn)
		for (const sd of S.teams) if (sideLive(S, sd) && !sideAlive(S, sd[0]).length) for (const s of sd) { const P = P_(S, s); if (!P.out) { P.out = true; ev(S, { t: 'out', seat: s, why: 'wipe' }); } }
		const live = S.teams.filter((sd) => sideLive(S, sd));
		if (live.length === 1) finish(S, live[0].find((s) => !P_(S, s).out), 'wipe');
		else if (curPlayer(S).out) endTurn(S);
		return;
	}
	for (const P of S.players) if (!P.out && !alivePets(S, P.seat).length) knockOut(S, P, 'wipe');
}

// ---------------------------------------------------------------- moving Pets about
function takeOut(S, uid) {
	const pet = S.pets[uid], P = P_(S, pet.owner);
	for (const st of [...P.palette, ...Object.values(S.canvas)]) { const k = st.indexOf(uid); if (k >= 0) { st.splice(k, 1); return; } }
	const k = P.extra.indexOf(uid); if (k >= 0) P.extra.splice(k, 1);
}
/** Back to its own Palette: an open spot, else covering the spot with the fewest Pets. */
function toPalette(S, uid) {
	const P = P_(S, S.pets[uid].owner);
	takeOut(S, uid);
	let i = P.palette.findIndex((st) => !st.length);
	if (i < 0) i = P.palette.reduce((b, st, j) => (st.length < P.palette[b].length ? j : b), 0);
	P.palette[i].push(uid);
	ev(S, { t: 'back', uid, spot: i });
}
function wipe(S, uid, why) {
	const pet = S.pets[uid], P = P_(S, pet.owner);
	takeOut(S, uid);
	for (const st of pet.slots) { for (const cid of st) P_(S, S.cards[cid].owner).scrap.push(cid); st.length = 0; }
	P.wiped.push(uid);
	ev(S, { t: 'wipe', uid, why });
}
/** A Pet's colors changed: is it wiped out, and if it is on the Canvas, where does it go now. */
function settle(S, uid) {
	const m = trueColor(S, uid), w = whereIs(S, uid);
	if (m.wipe) { wipe(S, uid, 'opposites'); return; }
	if (w.zone !== 'canvas') return;
	if (m.c === w.spot) return;
	if (m.c) { takeOut(S, uid); S.canvas[m.c].push(uid); ev(S, { t: 'shift', uid, from: w.spot, to: m.c }); }
	else toPalette(S, uid);
}

// ---------------------------------------------------------------- what may be done
/** Who must answer now: the seat to act ('play'), or the seat asked about a Newspaper ('react'). */
export const toAct = (S) => (S.over ? null : S.pending ? S.pending.ask[0] : curPlayer(S).seat);
const isMine = (S, seat, uid) => !!S.pets[uid] && allies(S, seat, S.pets[uid].owner);   // (Tag-Team: a partner's Pets too)
const handCard = (P, cid) => P.hand.includes(cid);
/**
 * Why this action can't be taken by `seat` now (a string), or null.
 *   { t: 'paint', pet, slot (0|1), card }        a card from your Hand onto 1 of your Pets in play
 *   { t: 'move', pet }                            1 of your Palette Pets to its color's Canvas spot
 *   { t: 'throw', from, slot, to, toSlot }        the top card of one of your Pet's symbols onto another Pet
 *   { t: 'extra', pet, spot }                     an Extra Pet onto an open Palette spot (free)
 *   { t: 'heal', pet, card }                      (White Card Healing) a white card heals 1 of your wiped-out Pets (free)
 *   { t: 'pass' }                                 end your turn
 *   { t: 'paper', card } | { t: 'let' }           asked about a Newspaper: use it, or let the throw land
 *   { t: 'concede' }                              leave the match (any time)
 */
export function why(S, seat, a) {
	if (!a || typeof a.t !== 'string') return 'not an action';
	if (S.over) return 'the game is over';
	const P = P_(S, seat);
	if (!P) return 'no such player';
	if (a.t === 'concede') return P.out ? 'you are out' : null;
	if (P.out) return 'you are out';
	if (S.pending) {
		if (S.pending.ask[0] !== seat) return 'waiting on another player';
		if (a.t === 'let') return null;
		if (a.t === 'paper') return handCard(P, a.card) && S.cards[a.card].c === 'N' ? null : 'that is not a Newspaper in your hand';
		return 'answer the throw first';
	}
	if (curPlayer(S).seat !== seat) return 'it is not your turn';
	if (a.t === 'pass') return null;
	if (a.t === 'paint') {
		if (S.used.paint) return 'you have painted this turn';
		if (!handCard(P, a.card)) return 'that card is not in your hand';
		if (S.cards[a.card].c === 'N') return 'a Newspaper is not a color';
		if (!isMine(S, seat, a.pet)) return 'you can only paint your own Pets';
		if (!inPlay(S, a.pet)) return 'that Pet is not in play';
		if (a.slot !== 0 && a.slot !== 1) return 'choose a color symbol';
		return null;
	}
	if (a.t === 'move') {
		if (S.used.move) return 'you have moved this turn';
		if (!isMine(S, seat, a.pet)) return 'that is not your Pet';
		const w = whereIs(S, a.pet);
		if (w.zone !== 'palette' || !w.top) return 'only a Pet on your Palette can move to the Canvas';
		const m = trueColor(S, a.pet);
		if (!m.c) return `its true color (${m.name}) is not on the Canvas`;
		return null;
	}
	if (a.t === 'throw') {
		if (S.used.throw) return 'a Pet has thrown this turn';
		if (!isMine(S, seat, a.from) || !inPlay(S, a.from)) return 'choose 1 of your Pets in play';
		if (a.slot !== 0 && a.slot !== 1) return 'choose a color symbol';
		if (!S.pets[a.from].slots[a.slot].length) return 'there is no Color Card on that symbol to throw';
		if (!S.pets[a.to] || !inPlay(S, a.to)) return 'choose a Pet in play to throw at';
		if (a.to === a.from) return 'a Pet cannot throw at itself';
		if (a.toSlot !== 0 && a.toSlot !== 1) return 'choose which symbol it lands on';
		const fw = whereIs(S, a.from), tw = whereIs(S, a.to);
		if (fw.zone === 'palette' && !(tw.zone === 'canvas' || (tw.zone === 'palette' && allies(S, seat, S.pets[a.to].owner)))) return 'from your Palette a Pet can only throw at the Canvas or your own Palette';
		return null;
	}
	if (a.t === 'extra') {
		if (!isMine(S, seat, a.pet) || whereIs(S, a.pet).zone !== 'extra') return 'that is not 1 of your Extra Pets';
		if (!Number.isInteger(a.spot) || a.spot < 0 || a.spot >= PALETTE || P_(S, S.pets[a.pet].owner).palette[a.spot].length) return 'choose an open spot on your Palette';
		return null;
	}
	if (a.t === 'heal') {
		if (!S.opts.whiteHeal) return 'not with these rules';
		if (!isMine(S, seat, a.pet) || whereIs(S, a.pet).zone !== 'wiped') return 'choose 1 of your wiped-out Pets';
		if (!handCard(P, a.card) || S.cards[a.card].c !== 'W') return 'it takes a white card from your hand';
		return null;
	}
	return 'no such action';
}
/**
 * Take an action. -> the reason it was refused (a string, and nothing changed), or null.
 * A refused action changes nothing, so every device and the server agree.
 */
export function act(S, seat, a) {
	const no = why(S, seat, a);
	if (no) return no;
	S.n++;
	if (a.t !== 'pass' && a.t !== 'let') S.idle = 0;
	const P = P_(S, seat);
	if (a.t === 'concede') { ev(S, { t: 'concede', seat }); knockOut(S, P, 'concede'); return null; }
	if (a.t === 'let' || a.t === 'paper') { answer(S, seat, a); return null; }
	if (a.t === 'pass') { ev(S, { t: 'pass', seat }); if (!Object.keys(S.used).length) stallTick(S); else S.idle = 0; if (!S.over) endTurn(S); return null; }
	if (a.t === 'extra') { takeOut(S, a.pet); P_(S, S.pets[a.pet].owner).palette[a.spot].push(a.pet); ev(S, { t: 'extra', uid: a.pet, spot: a.spot }); return null; }
	if (a.t === 'heal') { P.hand.splice(P.hand.indexOf(a.card), 1); P.scrap.push(a.card); const O = P_(S, S.pets[a.pet].owner); O.wiped.splice(O.wiped.indexOf(a.pet), 1); O.extra.push(a.pet); ev(S, { t: 'heal', uid: a.pet }); return null; }
	if (a.t === 'paint') {
		S.used.paint = true;
		P.hand.splice(P.hand.indexOf(a.card), 1);
		S.pets[a.pet].slots[a.slot].push(a.card);
		ev(S, { t: 'paint', seat, uid: a.pet, slot: a.slot, c: S.cards[a.card].c });
		settle(S, a.pet);
	} else if (a.t === 'move') {
		S.used.move = true; if (S.teams) S.tmove = true;
		const c = trueColor(S, a.pet).c, under = topOf(S.canvas[c]);
		takeOut(S, a.pet); S.canvas[c].push(a.pet);
		ev(S, { t: 'move', seat, uid: a.pet, to: c, ...(under ? { covers: under } : {}) });
	} else if (a.t === 'throw') {
		S.used.throw = true;
		const cid = S.pets[a.from].slots[a.slot].pop();
		ev(S, { t: 'throw', seat, uid: a.from, to: a.to, toSlot: a.toSlot, c: S.cards[cid].c });
		settle(S, a.from);   // (throwing happens first: the thrower's own colors change)
		checkWin(S);
		if (S.over) { P_(S, S.cards[cid].owner).scrap.push(cid); return null; }
		// a Newspaper can stop it: everyone else holding one is asked, in turn order from the thrower
		const ask = [];
		for (let k = 1; k <= S.players.length; k++) { const Q = S.players[(S.cur + k) % S.players.length]; if (!Q.out && Q.seat !== seat && Q.hand.some((x) => S.cards[x].c === 'N')) ask.push(Q.seat); }
		if (ask.length && inPlay(S, a.to)) { S.pending = { by: seat, card: cid, to: a.to, toSlot: a.toSlot, ask }; S.phase = 'react'; return null; }
		land(S, cid, a.to, a.toSlot);
	}
	checkWin(S);
	afterAction(S);
	return null;
}
function land(S, cid, to, toSlot) {
	if (!inPlay(S, to)) { P_(S, S.cards[cid].owner).scrap.push(cid); ev(S, { t: 'miss', c: S.cards[cid].c }); return; }   // (the target left play meanwhile)
	S.pets[to].slots[toSlot].push(cid);
	ev(S, { t: 'splat', uid: to, slot: toSlot, c: S.cards[cid].c });
	settle(S, to);
}
function answer(S, seat, a) {
	const pd = S.pending, P = P_(S, seat);
	if (a.t === 'paper') {
		P.hand.splice(P.hand.indexOf(a.card), 1); P.scrap.push(a.card);
		P_(S, S.cards[pd.card].owner).scrap.push(pd.card);
		ev(S, { t: 'paper', seat, uid: pd.to });
		S.pending = null; S.phase = 'play';
	} else {
		pd.ask.shift();
		if (pd.ask.length) return;
		S.pending = null; S.phase = 'play';
		land(S, pd.card, pd.to, pd.toSlot);
	}
	checkWin(S);
	afterAction(S);
}
function afterAction(S) {
	if (S.over || S.pending) return;
	if (curPlayer(S).out) return;
	if (ACTIONS.every((k) => S.used[k])) { ev(S, { t: 'pass', seat: curPlayer(S).seat, auto: true }); endTurn(S); }
}

// ---------------------------------------------------------------- every legal action (the computer players and tests)
export function legal(S, seat) {
	if (S.over) return [];
	const P = P_(S, seat), out = [];
	if (!P || P.out) return out;
	const add = (a) => { if (!why(S, seat, a)) out.push(a); };
	if (S.pending) { if (S.pending.ask[0] === seat) { add({ t: 'let' }); for (const c of P.hand) if (S.cards[c].c === 'N') { add({ t: 'paper', card: c }); break; } } return out; }
	if (curPlayer(S).seat !== seat) return out;
	const mine = Object.values(S.pets).filter((p) => allies(S, seat, p.owner)).map((p) => p.uid);
	const playing = Object.keys(S.pets).filter((u) => inPlay(S, u));
	const seen = new Set();
	for (const cid of P.hand) { const c = S.cards[cid].c; if (seen.has(c)) continue; seen.add(c); for (const u of mine) for (const slot of [0, 1]) add({ t: 'paint', pet: u, slot, card: cid }); }
	for (const u of mine) add({ t: 'move', pet: u });
	for (const u of mine) for (const slot of [0, 1]) for (const to of playing) for (const toSlot of [0, 1]) add({ t: 'throw', from: u, slot, to, toSlot });
	for (const s of sideOf(S, seat)) for (const u of P_(S, s).extra) for (let i = 0; i < PALETTE; i++) add({ t: 'extra', pet: u, spot: i });
	if (S.opts.whiteHeal) { const w = P.hand.find((c) => S.cards[c].c === 'W'); if (w) for (const s of sideOf(S, seat)) for (const u of P_(S, s).wiped) add({ t: 'heal', pet: u, card: w }); }
	add({ t: 'pass' });
	return out;
}

// ---------------------------------------------------------------- the view (a player sees their own hand; nobody else's)
/**
 * What a seat sees (null: a spectator of nobody in particular sees no hand). Every Pet shows its colors and where it is;
 * hands are counts except your own; decks are counts. A page draws ONLY from this.
 */
export function view(S, seat = null) {
	const petView = (u) => { const p = S.pets[u], d = petById(p.id), m = trueColor(S, u); return { uid: u, id: p.id, name: d.name, by: d.by, owner: p.owner, printed: d.c.slice(), colors: colorsOf(S, u), stacks: p.slots.map((st) => st.length), color: m.c, wipeRisk: m.wipe, hue: m.hex, shade: m.name }; };
	return {
		game: 'rpets', rev: S.rev, seed: S.seed, opts: { ...S.opts }, turn: S.turn, cur: curPlayer(S).seat, used: { ...S.used }, phase: S.phase, over: S.over ? JSON.parse(JSON.stringify(S.over)) : null, n: S.n, me: seat,
		teams: S.teams ? S.teams.map((t) => t.slice()) : null,
		toAct: toAct(S), pending: S.pending ? { by: S.pending.by, to: S.pending.to, toSlot: S.pending.toSlot, c: S.cards[S.pending.card].c, ask: S.pending.ask[0] } : null,
		canvas: Object.fromEntries(WHEEL.map((c) => [c, S.canvas[c].slice()])),
		players: S.players.map((P) => ({ seat: P.seat, name: P.name, cpu: P.cpu, out: P.out, deck: P.deck.length, scrap: P.scrap.map((c) => S.cards[c].c), handN: P.hand.length,
			hand: P.seat === seat ? P.hand.map((c) => ({ id: c, c: S.cards[c].c })) : null, palette: P.palette.map((st) => st.slice()), extra: P.extra.slice(), wiped: P.wiped.slice(), onCanvas: onCanvas(S, P.seat).length,
			sideOnCanvas: sideOnCanvas(S, P.seat).length })),
		pets: Object.fromEntries(Object.keys(S.pets).map((u) => [u, petView(u)])),
		log: S.log.slice(-30),
	};
}
/**
 * A match good enough to ask why() / legal() about, rebuilt from a seat's VIEW (an online page holds only its view): the
 * Pets where they are, each symbol's stack (its top card's color; what lies under it is not needed), the seat's own hand,
 * the turn and what is used. Other hands and every deck are empty: no rule of the seat's own actions reads them.
 */
export function fromView(V) {
	const S = { v: 1, rev: V.rev, seed: V.seed, opts: { ...V.opts }, players: [], pets: {}, cards: {}, canvas: {}, turn: V.turn, cur: 0, used: { ...V.used }, phase: V.phase,
		...(V.teams ? { teams: V.teams.map((t) => t.slice()), tmove: !!V.used.move } : {}),
		pending: V.pending ? { by: V.pending.by, to: V.pending.to, toSlot: V.pending.toSlot, card: 'pend', ask: [V.pending.ask] } : null, over: V.over, n: V.n, log: [] };
	if (V.pending) S.cards.pend = { id: 'pend', c: V.pending.c, owner: V.pending.by };
	let k = 0;
	for (const pv of Object.values(V.pets)) {
		const slots = [0, 1].map((j) => { const st = []; for (let i = 0; i < pv.stacks[j]; i++) { const cid = 'v' + (k++); S.cards[cid] = { id: cid, c: pv.colors[j], owner: pv.owner }; st.push(cid); } return st; });
		S.pets[pv.uid] = { uid: pv.uid, id: pv.id, owner: pv.owner, slots };
	}
	for (const c of WHEEL) S.canvas[c] = (V.canvas[c] || []).slice();
	V.players.forEach((p, i) => {
		const hand = (p.hand || []).map((h) => { S.cards[h.id] = { id: h.id, c: h.c, owner: p.seat }; return h.id; });
		S.players.push({ seat: p.seat, name: p.name, cpu: p.cpu, deck: [], hand, scrap: [], palette: p.palette.map((st) => st.slice()), extra: p.extra.slice(), wiped: p.wiped.slice(), out: p.out });
		if (p.seat === V.cur) S.cur = i;
	});
	return S;
}
/** A line for the live list: whose turn, and how many on the Canvas. */
export function label(S) {
	if (S.over) { if (S.teams && S.over.winners && S.over.winners.length) return S.over.winners.map((s) => P_(S, s).name).join(' & ') + ' won'; const w = P_(S, S.over.winner); return (w ? w.name : 'Nobody') + ' won'; }
	if (S.teams) return `Turn ${S.turn} · ` + S.teams.filter((t) => sideLive(S, t)).map((t) => t.map((s) => P_(S, s).name).join(' & ') + ` ${sideOnCanvas(S, t[0]).length}/3`).join(' · ');
	return `Turn ${S.turn} · ` + S.players.filter((p) => !p.out).map((p) => `${p.name} ${onCanvas(S, p.seat).length}/3`).join(' · ');
}

// ---------------------------------------------------------------- replays: a match is its setup + its actions
/** A match rebuilt from its recipe, k actions in (all by default): { setup, actions: [[seat, action]] }. */
export function replay(recipe, k = Infinity) {
	const S = newMatch(recipe.setup);
	if (!S) return null;
	const list = recipe.actions || [];
	for (let i = 0; i < list.length && i < k; i++) act(S, list[i][0], list[i][1]);
	return S;
}
export const clone = (S) => JSON.parse(JSON.stringify(S));
export { PETS, petById };
