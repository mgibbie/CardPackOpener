// rainbowpets_rules_test.mjs — RAINBOW PETS, the rules engine (rainbowpets/js/rules.js) and the computer players
// (rainbowpets/js/ai.js). Every rule of the rulebook's basic game is played here with the engine's own actions, the
// choices the engine makes where the rulebook is silent are pinned, and a match is rebuilt from its recipe.
// Pure: node only.   node overworld/tests/rainbowpets_rules_test.mjs
import * as R from '../../rainbowpets/js/rules.js';
import { choose, runCpus, score } from '../../rainbowpets/js/ai.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 500) : '')); } };
const J = JSON.stringify;
const id = (name) => R.PETS.find((p) => p.name === name).id;
/** A 2-player match with set Pets; then the test arranges the hands. */
const match = (a, b, opts = {}, seed = 't') => R.newMatch({ seed, seats: [{ name: 'Ann', pets: a.map(id) }, { name: 'Bo', pets: b.map(id) }], opts });
/** Make seat `s` the one to act, with these cards in hand (colors), and nothing used. */
function turnOf(S, s, hand = []) {
	S.cur = S.players.findIndex((p) => p.seat === s); S.used = {}; S.pending = null; S.phase = 'play';
	const P = R.playerOf(S, s);
	for (const c of P.hand) P.deck.push(c);
	P.hand = [];
	for (const col of hand) { const k = P.deck.findIndex((x) => S.cards[x].c === col); if (k < 0) throw new Error('no ' + col + ' in deck'); P.hand.push(P.deck.splice(k, 1)[0]); }
	return P;
}
const card = (S, s, col) => R.playerOf(S, s).hand.find((c) => S.cards[c].c === col);
const act = (S, s, a) => R.act(S, s, a);

// ---------- the pets and colors
{
	A(R.PETS.length === 42 && R.PETS[0].name === 'Beeza' && R.PETS[0].by === 'Kai' && R.PETS.every((p) => p.c.length === 2 && p.c.every((c) => R.COLORS.includes(c)) && p.by && p.name), '42 Pets from the sheet, each with its artist and 2 colors of the 8');
	const m = (a, b, o) => R.mix(a, b, o || {});
	A(m('R', 'Y').c === 'O' && m('Y', 'B').c === 'G' && m('R', 'B').c === 'P' && m('R', 'R').c === 'R', 'the rulebook\'s mixes: red + yellow = orange, yellow + blue = green, red + red = red');
	A(m('O', 'G').c === 'Y' && m('G', 'P').c === 'B' && m('O', 'P').c === 'R', 'two steps apart on the wheel: the color between them');
	A(['RG', 'OB', 'YP', 'WK'].every((x) => m(x[0], x[1]).wipe && m(x[1], x[0]).wipe), 'Opposite Colors (R-G, O-B, Y-P, white-black) mix to a wipe-out');
	A(m('R', 'O').c === null && !m('R', 'O').wipe && /red-orange/.test(m('R', 'O').name) && m('R', 'W').c === null && m('W', 'W').c === null && m('K', 'K').c === null, 'next to each other, or with white or black: no Canvas color');
	A(m('R', 'W', { whiteClear: true }).c === 'R' && m('W', 'K', { whiteClear: true }).wipe, 'White = No Color: red + white = red; black + white still wipes');
}
// ---------- set-up
{
	A(R.setupProblems({ seats: [{ pets: ['p1', 'p2', 'p3'] }] }).length && R.setupProblems({ seats: [{ pets: ['p1', 'p2'] }, { pets: ['p3', 'p4', 'p5'] }] }).length && R.setupProblems({ seats: [{ pets: ['p1', 'p1', 'p2'] }, { pets: ['p3', 'p4', 'p5'] }] }).length && R.newMatch({ seats: [] }) === null, '2 to 4 players, 3 to 5 Pets each, no Pet twice');
	const S = match(['Beeza', 'Furball', 'Mia', 'Poppy'], ['Chicky', 'Perica', 'Fuki']);
	const [a, b] = S.players, first = R.curPlayer(S);
	A(a.palette.every((st) => st.length === 1) && a.extra.length === 1 && b.extra.length === 0, '3 Pets on the Palette, the rest Extra Pets');
	A(a.deck.length + a.hand.length === 30 && Object.values(S.cards).filter((c) => c.owner === 'a' && c.c === 'N').length === 2, 'a deck of 30: 4 of each rainbow color, 2 white, 2 black, 2 Newspapers');
	A(first.hand.length === 4 && S.players.find((p) => p !== first).hand.length === 3, '3 cards each to start; the first player draws 1 more for their turn');
	A(J(R.newMatch({ seed: 's', seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }] })) === J(R.newMatch({ seed: 's', seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }] })), 'the same seed deals the same match');
	const firsts = new Set(); for (let i = 0; i < 20; i++) firsts.add(R.newMatch({ seed: 'f' + i, seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }] }).cur);
	A(firsts.size === 2, 'who goes first is drawn from the seed');
}
// ---------- painting
{
	const S = match(['Mia', 'Furball', 'Poppy'], ['Chicky', 'Perica', 'Fuki']);   // Mia: yellow + white
	turnOf(S, 'a', ['B', 'Y', 'N']);
	const mia = 'a0';
	A(R.trueColor(S, mia).c === null && /light yellow/.test(R.trueColor(S, mia).name), 'Mia (yellow + white) is light yellow: no Canvas color');
	A(act(S, 'a', { t: 'paint', pet: 'b0', slot: 0, card: card(S, 'a', 'B') }) === 'you can only paint your own Pets', 'you can only paint your own Pets');
	A(act(S, 'a', { t: 'paint', pet: mia, slot: 0, card: card(S, 'a', 'N') }) === 'a Newspaper is not a color', 'a Newspaper is not a color');
	A(act(S, 'b', { t: 'paint', pet: 'b0', slot: 0, card: R.playerOf(S, 'b').hand[0] }) === 'it is not your turn', 'not on another player\'s turn');
	A(act(S, 'a', { t: 'paint', pet: mia, slot: 1, card: card(S, 'a', 'B') }) === null && R.colorsOf(S, mia).join() === 'Y,B' && R.trueColor(S, mia).c === 'G' && R.playerOf(S, 'a').hand.length === 2, 'blue over the white: yellow + blue, a green Pet');
	A(act(S, 'a', { t: 'paint', pet: mia, slot: 0, card: card(S, 'a', 'Y') }) === 'you have painted this turn', 'one Paint a turn');
}
// ---------- moving to the Canvas, and covering
{
	const S = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);   // Sunset and Fluffy: red + yellow = orange
	turnOf(S, 'a', []);
	A(act(S, 'a', { t: 'move', pet: 'a1' }) && /not on the Canvas/.test(act(S, 'a', { t: 'move', pet: 'a1' })), 'Furball (green + blue) has no Canvas spot');
	A(act(S, 'a', { t: 'move', pet: 'a0' }) === null && R.whereIs(S, 'a0').zone === 'canvas' && R.whereIs(S, 'a0').spot === 'O' && R.playerOf(S, 'a').palette[0].length === 0, 'Sunset moves to the orange spot; its Palette spot is open');
	A(act(S, 'a', { t: 'move', pet: 'a1' }) === 'you have moved this turn', 'one Move a turn');
	turnOf(S, 'b', []);
	act(S, 'b', { t: 'move', pet: 'b0' });
	A(S.canvas.O.join() === 'a0,b0' && !R.inPlay(S, 'a0') && R.inPlay(S, 'b0') && R.onCanvas(S, 'a').length === 0, 'Fluffy covers Sunset: a covered Pet is not on the Canvas');
	// an Extra Pet to the open spot
	const T = match(['Sunset', 'Furball', 'Poppy', 'Mia'], ['Fluffy', 'Perica', 'Fuki']);
	turnOf(T, 'a', []);
	A(act(T, 'a', { t: 'extra', pet: 'a3', spot: 0 }) === 'choose an open spot on your Palette', 'an Extra Pet needs an open spot');
	act(T, 'a', { t: 'move', pet: 'a0' });
	A(act(T, 'a', { t: 'extra', pet: 'a3', spot: 0 }) === null && R.playerOf(T, 'a').palette[0].join() === 'a3' && T.used.move && !T.used.extra, 'once Sunset has moved, Mia comes off the Extra Pets into its spot (free)');
}
// ---------- throwing
{
	const S = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);
	turnOf(S, 'a', ['R']);
	act(S, 'a', { t: 'paint', pet: 'a2', slot: 0, card: card(S, 'a', 'R') });   // Poppy: red + blue, a red card on red
	A(R.trueColor(S, 'a2').c === 'P', 'Poppy (red + blue) is purple, a red card on her red keeps her purple');
	A(act(S, 'a', { t: 'throw', from: 'a1', slot: 0, to: 'a0', toSlot: 0 }) === 'there is no Color Card on that symbol to throw', 'a Pet throws only a Color Card it has on it');
	A(act(S, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'b0', toSlot: 0 }) === 'from your Palette a Pet can only throw at the Canvas or your own Palette', 'from the Palette: never at a Rival\'s Palette');
	A(act(S, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'a2', toSlot: 0 }) && act(S, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'a2', toSlot: 0 }) !== null, 'never at itself');
	// a rival's Pet on the Canvas: thrown at from the Palette, and knocked off
	turnOf(S, 'b', []); act(S, 'b', { t: 'move', pet: 'b0' });   // Fluffy to orange
	turnOf(S, 'a', []);
	A(act(S, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'b0', toSlot: 1 }) === null, 'Poppy throws her red at Fluffy on the Canvas (over Fluffy\'s yellow)');
	A(R.colorsOf(S, 'b0').join() === 'R,R' && R.whereIs(S, 'b0').spot === 'R' && S.canvas.O.length === 0, 'Fluffy is now red + red: she moves to the red spot');
	A(R.trueColor(S, 'a2').c === 'P' && S.pets.a2.slots[0].length === 0, 'and Poppy, her card thrown, is red + blue again');
	A(act(S, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'b0', toSlot: 0 }) === 'a Pet has thrown this turn', 'one Throw a turn');
}
// ---------- off the Canvas, back to a full Palette
{
	const S = match(['Sunset', 'Furball', 'Poppy', 'Mia'], ['Fluffy', 'Perica', 'Fuki']);
	turnOf(S, 'a', []); act(S, 'a', { t: 'move', pet: 'a0' }); act(S, 'a', { t: 'extra', pet: 'a3', spot: 0 });
	turnOf(S, 'b', ['B']); act(S, 'b', { t: 'paint', pet: 'b1', slot: 0, card: card(S, 'b', 'B') });   // Perica: green + blue, a blue card
	turnOf(S, 'b', []); act(S, 'b', { t: 'move', pet: 'b0' });
	turnOf(S, 'a', []); S.canvas.O = ['a0'];   // (Sunset back on top for this)
	R.playerOf(S, 'b').palette[0] = [];
	S.canvas.O = ['a0'];
	turnOf(S, 'b', []);
	// Perica (on b's Palette) throws blue at Sunset on the Canvas: red + blue = purple: Sunset moves to purple
	A(act(S, 'b', { t: 'throw', from: 'b1', slot: 0, to: 'a0', toSlot: 1 }) === null && R.whereIs(S, 'a0').spot === 'P', 'Sunset splatted blue over her yellow: purple, she moves to the purple spot');
	// knocked to a non-Canvas color with a full Palette: she covers a spot (the fewest, leftmost)
	const T = match(['Sunset', 'Furball', 'Poppy', 'Mia'], ['Fluffy', 'Perica', 'Fuki']);
	turnOf(T, 'a', []); act(T, 'a', { t: 'move', pet: 'a0' }); act(T, 'a', { t: 'extra', pet: 'a3', spot: 0 });
	turnOf(T, 'b', ['O']); act(T, 'b', { t: 'paint', pet: 'b1', slot: 0, card: card(T, 'b', 'O') });   // Perica: an orange card on her green: orange + blue... (a wipe for her?)
	A(R.whereIs(T, 'b1').zone === 'wiped' && R.playerOf(T, 'b').scrap.length === 1, 'painting orange over Perica\'s green makes her orange + blue: Opposite Colors, she is wiped out and the card is scrapped');
	turnOf(T, 'b', ['W']); act(T, 'b', { t: 'paint', pet: 'b2', slot: 0, card: card(T, 'b', 'W') });   // Fuki: blue + white, white on blue: white + white
	turnOf(T, 'b', []);
	A(act(T, 'b', { t: 'throw', from: 'b2', slot: 0, to: 'a0', toSlot: 0 }) === null && R.whereIs(T, 'a0').zone === 'palette' && T.players[0].palette.map((s) => s.length).join() === '2,1,1' && T.players[0].palette[0].join() === 'a3,a0', 'Sunset splatted white (light orange: no spot) goes back to a full Palette and covers a spot (all level: the leftmost)', T.players[0].palette);
}
// ---------- wipe-outs: whose scrap pile
{
	// Perica (green + blue) with an orange thrown over her green: orange + blue, opposites
	const S = match(['Sunset', 'Furball', 'Poppy'], ['Perica', 'Fluffy', 'Fuki']);
	turnOf(S, 'a', ['O']); act(S, 'a', { t: 'paint', pet: 'a1', slot: 1, card: card(S, 'a', 'O') });   // Furball: green + orange
	turnOf(S, 'b', []); act(S, 'b', { t: 'move', pet: 'b1' });   // Fluffy to orange (so a Canvas Pet exists)
	turnOf(S, 'a', []);
	// Furball from the Palette may throw at the Canvas only: Fluffy (red + yellow), orange over her yellow: red + orange (no spot): back to b's Palette
	A(act(S, 'a', { t: 'throw', from: 'a1', slot: 1, to: 'b1', toSlot: 1 }) === null && R.whereIs(S, 'b1').zone === 'palette' && S.pets.b1.slots[1].length === 1, 'a Rival\'s Pet knocked to an in-between shade leaves the Canvas, still holding the thrown card');
	turnOf(S, 'a', ['O']); act(S, 'a', { t: 'paint', pet: 'a1', slot: 1, card: card(S, 'a', 'O') });
	turnOf(S, 'b', ['B']); act(S, 'b', { t: 'paint', pet: 'b0', slot: 0, card: card(S, 'b', 'B') });   // Perica: blue + blue = blue
	turnOf(S, 'b', []); act(S, 'b', { t: 'move', pet: 'b0' });
	turnOf(S, 'a', []);
	const aScrap = R.playerOf(S, 'a').scrap.length, bScrap = R.playerOf(S, 'b').scrap.length;
	A(act(S, 'a', { t: 'throw', from: 'a1', slot: 1, to: 'b0', toSlot: 1 }) === null && R.whereIs(S, 'b0').zone === 'wiped', 'orange thrown at blue Perica: orange + blue, Opposite Colors: wiped out');
	A(R.playerOf(S, 'a').scrap.length === aScrap + 1 && R.playerOf(S, 'b').scrap.length === bScrap + 1 && S.canvas.B.length === 0, 'the cards on her go to their OWNERS\' Scrap Piles (the orange to a, the blue to b); the blue spot is empty');
}
// ---------- a Newspaper stops a throw
{
	const S = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);
	turnOf(S, 'b', []); act(S, 'b', { t: 'move', pet: 'b0' });
	turnOf(S, 'a', ['R']); act(S, 'a', { t: 'paint', pet: 'a2', slot: 0, card: card(S, 'a', 'R') });
	const bp = R.playerOf(S, 'b'); bp.hand.push(bp.deck.splice(bp.deck.findIndex((c) => S.cards[c].c === 'N'), 1)[0]);
	A(act(S, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'b0', toSlot: 1 }) === null && S.phase === 'react' && R.toAct(S) === 'b' && R.colorsOf(S, 'b0').join() === 'R,Y', 'a throw at Fluffy: b holds a Newspaper, so b is asked before it lands');
	A(act(S, 'a', { t: 'pass' }) === 'waiting on another player' && act(S, 'b', { t: 'move', pet: 'b1' }) === 'answer the throw first', 'nobody else acts while b is asked');
	const v = R.view(S, 'a');
	A(v.pending && v.pending.ask === 'b' && v.players[1].hand === null, 'the view says who is asked (not what they hold)');
	act(S, 'b', { t: 'paper', card: bp.hand.find((c) => S.cards[c].c === 'N') });
	A(S.phase === 'play' && R.colorsOf(S, 'b0').join() === 'R,Y' && R.whereIs(S, 'b0').spot === 'O' && S.used.throw && R.playerOf(S, 'a').scrap.length === 1 && bp.scrap.length === 1, '"Not so fast!": Fluffy is not splatted, the red is scrapped (a\'s), the Newspaper too (b\'s), and a\'s throw is used up');
	// let it land
	const T = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);
	turnOf(T, 'b', []); act(T, 'b', { t: 'move', pet: 'b0' });
	turnOf(T, 'a', ['R']); act(T, 'a', { t: 'paint', pet: 'a2', slot: 0, card: card(T, 'a', 'R') });
	const tp = R.playerOf(T, 'b'); tp.hand.push(tp.deck.splice(tp.deck.findIndex((c) => T.cards[c].c === 'N'), 1)[0]);
	act(T, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'b0', toSlot: 1 });
	A(act(T, 'b', { t: 'let' }) === null && R.whereIs(T, 'b0').spot === 'R', 'or let it land: Fluffy is splatted red and moves');
	// nobody holds one: it lands at once
	const U = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);
	turnOf(U, 'b', []); act(U, 'b', { t: 'move', pet: 'b0' });
	turnOf(U, 'a', ['R']); act(U, 'a', { t: 'paint', pet: 'a2', slot: 0, card: card(U, 'a', 'R') });
	for (const c of [...R.playerOf(U, 'b').hand]) if (U.cards[c].c === 'N') { R.playerOf(U, 'b').hand.splice(R.playerOf(U, 'b').hand.indexOf(c), 1); R.playerOf(U, 'b').deck.unshift(c); }
	act(U, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'b0', toSlot: 1 });
	A(U.phase === 'play' && R.whereIs(U, 'b0').spot === 'R', 'nobody else holds a Newspaper: the throw lands at once');
}
// ---------- the turn
{
	const S = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);
	const P = turnOf(S, 'a', ['R', 'Y']); const t0 = S.turn, bHand = R.playerOf(S, 'b').hand.length;
	act(S, 'a', { t: 'pass' });
	A(R.curPlayer(S).seat === 'b' && S.turn === t0 + 1 && R.playerOf(S, 'b').hand.length === bHand + 1, '"pass": the next player\'s turn, and they draw 1');
	turnOf(S, 'a', ['R']);
	act(S, 'a', { t: 'paint', pet: 'a2', slot: 0, card: card(S, 'a', 'R') }); act(S, 'a', { t: 'move', pet: 'a0' });
	A(R.curPlayer(S).seat === 'a', 'two of three actions: still a\'s turn');
	act(S, 'a', { t: 'throw', from: 'a2', slot: 0, to: 'a0', toSlot: 1 });
	A(R.curPlayer(S).seat === 'b', 'all 3 actions taken: the turn ends by itself');
	void P;
}
// ---------- winning
{
	const S = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);
	S.canvas.O = ['a0']; S.canvas.P = ['a2']; R.playerOf(S, 'a').palette[0] = []; R.playerOf(S, 'a').palette[2] = [];
	turnOf(S, 'a', ['G']);
	act(S, 'a', { t: 'paint', pet: 'a1', slot: 1, card: card(S, 'a', 'G') });   // Furball: green + green
	act(S, 'a', { t: 'move', pet: 'a1' });
	A(S.over && S.over.winner === 'a' && S.over.how === 'canvas' && S.phase === 'over' && /Ann won/.test(R.label(S)), '3 Pets on the Canvas at once: Ann wins');
	A(R.act(S, 'b', { t: 'pass' }) === 'the game is over' && R.legal(S, 'b').length === 0, 'nothing more after the end');
	// every rival Pet wiped out
	const T = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']);
	for (const u of ['b0', 'b1']) { R.playerOf(T, 'b').palette[+u[1]] = []; R.playerOf(T, 'b').wiped.push(u); }
	T.canvas.B = ['b2']; R.playerOf(T, 'b').palette[2] = [];   // (Fuki on the blue spot: blue + white is no Canvas color, but placed here for the test)
	T.pets.b2.slots[1].push(Object.keys(T.cards).find((c) => T.cards[c].owner === 'b' && T.cards[c].c === 'B' && !R.playerOf(T, 'b').hand.includes(c)));
	turnOf(T, 'a', ['O']); act(T, 'a', { t: 'paint', pet: 'a1', slot: 1, card: card(T, 'a', 'O') });
	turnOf(T, 'a', []);
	act(T, 'a', { t: 'throw', from: 'a1', slot: 1, to: 'b2', toSlot: 0 });   // orange over Fuki's blue... blue card on top of white: orange + blue
	A(T.over && T.over.winner === 'a' && T.over.how === 'wipe' && R.playerOf(T, 'b').out, 'the last of Bo\'s Pets wiped out: Ann wins', [T.over, R.colorsOf(T, 'b2')]);
}
// ---------- the optional rules
{
	const S = R.newMatch({ seed: 'o', seats: [{ name: 'A', pets: [id('Mia'), id('Furball'), id('Poppy')] }, { name: 'B', pets: [id('Chicky'), id('Perica'), id('Fuki')] }], opts: { whiteClear: true, nonsense: true } });
	A(J(S.opts) === '{"whiteClear":true}' && R.trueColor(S, 'a0').c === 'Y', 'White = No Color: Mia (yellow + white) is a yellow Pet; an unknown option is dropped');
	turnOf(S, 'a', []);
	A(act(S, 'a', { t: 'move', pet: 'a0' }) === null && R.whereIs(S, 'a0').spot === 'Y', '... and she can move to yellow');
	const H = R.newMatch({ seed: 'h', seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }], opts: { whiteHeal: true } });
	R.playerOf(H, 'a').palette[0] = []; R.playerOf(H, 'a').wiped.push('a0');
	turnOf(H, 'a', ['W']);
	A(act(H, 'a', { t: 'heal', pet: 'a0', card: card(H, 'a', 'W') }) === null && R.playerOf(H, 'a').extra.includes('a0') && !H.used.paint, 'White Card Healing: a white card heals a wiped-out Pet to the Extra Pets, and is not the turn\'s Paint');
	{ const Z = match(['Sunset', 'Furball', 'Poppy'], ['Fluffy', 'Perica', 'Fuki']); turnOf(Z, 'a', ['W']); A(act(Z, 'a', { t: 'heal', pet: 'a0', card: card(Z, 'a', 'W') }) === 'not with these rules', 'not without the option'); }
	const D = R.newMatch({ seed: 'd', seats: [{ name: 'A', pets: ['p1', 'p2', 'p3'] }, { name: 'B', pets: ['p4', 'p5', 'p6'] }], opts: { deckOut: true } });
	const nxt = D.players[(D.cur + 1) % 2]; nxt.deck = [];
	act(D, R.curPlayer(D).seat, { t: 'pass' });
	A(D.over && D.over.winner === R.curPlayer(D).seat === false || (D.over && D.over.how === 'deck' && D.over.winner !== nxt.seat), 'Deck-Out: a player who cannot draw loses', D.over);
	const N = R.newMatch({ seed: 'd', seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }] });
	const nx = N.players[(N.cur + 1) % 2]; nx.deck = []; const hn = nx.hand.length;
	act(N, R.curPlayer(N).seat, { t: 'pass' });
	A(!N.over && nx.hand.length === hn, 'without it, an empty deck draws nothing');
	const W = R.newMatch({ seed: 'w', seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }], opts: { tempWipe: true } });
	const me = R.curPlayer(W), other = W.players.find((p) => p !== me);
	other.palette[0] = []; other.wiped.push(other.seat + '0');
	act(W, me.seat, { t: 'pass' });
	A(other.extra.includes(other.seat + '0') && !other.wiped.length, 'Wipe-Outs are Temporary: wiped-out Pets heal at the start of your turn');
}
// ---------- the stalemate, when the decks are spent
{
	const S = R.newMatch({ seed: 'st', seats: [{ name: 'A', pets: ['p1', 'p2', 'p3'] }, { name: 'B', pets: ['p4', 'p5', 'p6'] }] });
	for (const P of S.players) P.deck = [];
	S.canvas.R = ['a0']; R.playerOf(S, 'a').palette[0] = [];
	let k = 0; while (!S.over && k++ < 20) act(S, R.curPlayer(S).seat, { t: 'pass' });
	A(S.over && S.over.how === 'stalemate' && S.over.winner === 'a' && k === R.STALL_ROUNDS * 2, `decks spent and ${R.STALL_ROUNDS} rounds of nothing: the one with the most Pets on the Canvas wins`, [S.over, k]);
	const T = R.newMatch({ seed: 'st', seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }] });
	for (const P of T.players) P.deck = [];
	let j = 0; while (!T.over && j++ < 20) act(T, R.curPlayer(T).seat, { t: 'pass' });
	A(T.over && T.over.winner === null && T.over.how === 'stalemate', 'level: a draw');
}
// ---------- the view: nobody sees another hand
{
	const S = match(['Sunset', 'Furball', 'Poppy', 'Mia'], ['Fluffy', 'Perica', 'Fuki']);
	const va = R.view(S, 'a'), vs = R.view(S, null);
	A(va.players[0].hand.length === R.playerOf(S, 'a').hand.length && va.players[1].hand === null && typeof va.players[1].handN === 'number' && vs.players.every((p) => p.hand === null), 'a seat sees its own hand, only a count of the others\'; a spectator of nobody sees none');
	A(!JSON.stringify(va).includes('"deck":[') && va.pets.a0.name === 'Sunset' && va.pets.a0.by === 'Martin' && va.pets.a0.color === 'O', 'decks are counts; every Pet says its name, its artist and its color');
}
// ---------- replays and the computer players
{
	const setup = { seed: 'rp1', seats: [{ name: 'A', pets: ['p1', 'p2', 'p3', 'p4'], cpu: 'normal' }, { name: 'B', pets: ['p10', 'p11', 'p12'], cpu: 'easy' }, { name: 'C', pets: ['p20', 'p21', 'p22'], cpu: 'normal' }] };
	const S = R.newMatch(setup), actions = [];
	runCpus(S, undefined, (seat, a) => actions.push([seat, a]), 5000);
	A(S.over && actions.length > 10, `three computer painters play a match to its end (${S.over && S.over.how}, turn ${S.turn}, ${actions.length} actions)`);
	const again = R.replay({ setup, actions });
	A(JSON.stringify(again) === JSON.stringify(S), 'rebuilt from its setup and actions it is the same match, card for card');
	const mid = R.replay({ setup, actions }, 20);
	A(mid.n <= 20 && !mid.over, 'and it can be stopped part way (a replay\'s scrubber)');
	A(R.legal(R.newMatch(setup), 'b').length === 0 || R.curPlayer(R.newMatch(setup)).seat === 'b', 'legal() is empty for a seat whose turn it is not');
	// every action the computer took was legal when taken
	const L = R.newMatch(setup); let bad = 0;
	for (const [seat, a] of actions) if (R.act(L, seat, a)) bad++;
	A(bad === 0, 'every action the computer took was legal');
	// the normal painter beats the easy one more often than not (2-player, 20 seeds each way)
	let normalWins = 0, games = 0;
	for (let g = 0; g < 20; g++) {
		const M = R.newMatch({ seed: 'vs' + g, seats: [{ pets: ['p1', 'p5', 'p9', 'p13'], cpu: g % 2 ? 'normal' : 'easy' }, { pets: ['p2', 'p6', 'p10', 'p14'], cpu: g % 2 ? 'easy' : 'normal' }] });
		runCpus(M, undefined, null, 5000);
		if (M.over && M.over.winner) { games++; if (R.playerOf(M, M.over.winner).cpu === 'normal') normalWins++; }
	}
	A(games >= 15 && normalWins > games / 2, `the normal computer beats the easy one more often than not (${normalWins} of ${games})`);
	const T = R.newMatch(setup);
	A(typeof score(T, 'a') === 'number' && choose(T, R.curPlayer(T).seat, 'normal') && R.why(T, R.curPlayer(T).seat, choose(T, R.curPlayer(T).seat, 'normal')) === null, 'its choice is always a legal action');
}

// ---------- a seat's view is enough to say what it may do (an online page holds only its view)
{
	const setup = { seed: 'fv', seats: [{ name: 'A', pets: ['p1', 'p2', 'p3', 'p4'], cpu: 'normal' }, { name: 'B', pets: ['p10', 'p11', 'p12'], cpu: 'normal' }] };
	const S = R.newMatch(setup); let checked = 0, bad = [];
	for (let k = 0; k < 120 && !S.over; k++) {
		const seat = R.toAct(S), F = R.fromView(R.view(S, seat));
		const a = J(R.legal(S, seat).map((x) => J(x)).sort()), b = J(R.legal(F, seat).map((x) => J(x)).sort());
		if (a !== b) bad.push(k); checked++;
		const c = choose(S, seat, 'normal'); R.act(S, seat, c);
	}
	A(checked > 30 && bad.length === 0, `over ${checked} positions, the moves a seat may make read from its own view are exactly the engine's`, bad.slice(0, 5));
}
// ---------- TAG-TEAM (the rulebook's optional 2v2): a + b against c + d
{
	const TT = (seed = 'tt', over = {}) => R.newMatch({ seed, tagTeam: true, seats: [
		{ name: 'Ann', pets: ['p10', 'p1', 'p6'] }, { name: 'Bo', pets: ['p11', 'p13', 'p5'] },
		{ name: 'Cy', pets: ['p3', 'p8', 'p15'] }, { name: 'Di', pets: ['p25', 'p2', 'p20'] }], ...over });
	A(R.setupProblems({ tagTeam: true, seats: [{ pets: ['p1', 'p2', 'p3'] }, { pets: ['p4', 'p5', 'p6'] }] }).includes('Tag-Team is 4 players'), 'Tag-Team is 4 players');
	const S = TT();
	A(J(S.teams) === J([['a', 'b'], ['c', 'd']]) && R.allies(S, 'a', 'b') && R.allies(S, 'c', 'd') && !R.allies(S, 'a', 'c') && !R.allies(S, 'b', 'd'), 'two teams: a + b against c + d');
	const firsts = new Set(); for (let i = 0; i < 24; i++) firsts.add(R.curPlayer(TT('first' + i)).seat);
	A(J([...firsts].sort()) === J(['a', 'c']), 'a team turn starts with its first player (which team goes first is drawn)', [...firsts]);
	// the team turn: a then b; the team moves 1 Pet in all, each partner paints 1 and throws 1
	turnOf(S, 'a', ['R', 'B']); S.tmove = false;
	A(act(S, 'a', { t: 'move', pet: 'a0' }) === null && S.canvas.O.includes('a0'), 'Ann moves Sunset (orange) to the Canvas');
	A(act(S, 'a', { t: 'pass' }) === null && R.curPlayer(S).seat === 'b', 'then her partner Bo plays (the partners\' turns one after the other)');
	A(S.used.move === true && act(S, 'b', { t: 'move', pet: 'b0' }) === 'you have moved this turn' && !R.legal(S, 'b').some((a) => a.t === 'move'), 'Bo\'s turn starts with Move used: only 1 Pet moves per team');
	const bCard = R.playerOf(S, 'b').hand.find((c) => S.cards[c].c !== 'N');
	A(act(S, 'b', { t: 'paint', pet: 'a1', slot: 1, card: bCard }) === null && S.pets.a1.slots[1].length === 1, 'each partner still paints: Bo paints his partner Ann\'s Pet (their Pets work together)');
	A(act(S, 'b', { t: 'pass' }) === null && R.curPlayer(S).seat === 'c' && !S.used.move && R.legal(S, 'c').some((a) => a.t === 'move' || a.t === 'pass'), 'the other team\'s turn: its move is its own');
	A(act(S, 'c', { t: 'paint', pet: 'a2', slot: 0, card: R.playerOf(S, 'c').hand.find((c) => S.cards[c].c !== 'N') }) === 'you can only paint your own Pets', 'a Rival team\'s Pets are still not yours to paint');
	// throwing reach: a Palette Pet can throw at the Canvas or either partner's Palette, never a Rival's Palette
	{
		const T = TT('reach'); turnOf(T, 'a', ['G']); T.tmove = false;
		const cid = R.playerOf(T, 'a').deck.find((c) => T.cards[c].c === 'Y'); R.playerOf(T, 'a').deck.splice(R.playerOf(T, 'a').deck.indexOf(cid), 1); T.pets.a1.slots[0].push(cid);
		for (const s of ['b', 'c', 'd']) R.playerOf(T, s).hand = R.playerOf(T, s).hand.filter((c) => T.cards[c].c !== 'N');
		A(R.why(T, 'a', { t: 'throw', from: 'a1', slot: 0, to: 'c0', toSlot: 0 }) === 'from your Palette a Pet can only throw at the Canvas or your own Palette' && R.why(T, 'a', { t: 'throw', from: 'a1', slot: 0, to: 'b2', toSlot: 0 }) === null, 'from the Palette: a partner\'s Palette is in reach, a Rival\'s is not');
	}
	// the team wins with 3 of its Pets on the Canvas, whoever's they are
	{
		const W = TT('win'); turnOf(W, 'a', []); W.tmove = false;
		act(W, 'a', { t: 'move', pet: 'a0' }); act(W, 'a', { t: 'pass' }); act(W, 'b', { t: 'pass' }); act(W, 'c', { t: 'pass' }); act(W, 'd', { t: 'pass' });
		A(R.curPlayer(W).seat === 'a' && !W.used.move && act(W, 'a', { t: 'move', pet: 'b0' }) === null && W.canvas.G.includes('b0'), 'a new team turn: Ann moves her partner Bo\'s Narbubble (green) to the Canvas');
		act(W, 'a', { t: 'pass' }); act(W, 'b', { t: 'pass' }); act(W, 'c', { t: 'pass' }); act(W, 'd', { t: 'pass' });
		A(R.onCanvas(W, 'a').length === 1 && R.sideOnCanvas(W, 'a').length === 2 && !W.over, '1 of Ann\'s and 1 of Bo\'s: the team has 2, no win yet');
		act(W, 'a', { t: 'move', pet: 'a1' });
		A(W.over && W.over.how === 'canvas' && J(W.over.winners) === J(['a', 'b']) && R.wonBy(W.over, 'a') && R.wonBy(W.over, 'b') && !R.wonBy(W.over, 'c'), '3 of the team\'s Pets on the Canvas: Ann and Bo win together', W.over);
		A(R.label(W) === 'Ann & Bo won' && J(W.log[W.log.length - 1].team) === J(['a', 'b']), 'the live line and the log name the team', [R.label(W), W.log.slice(-1)]);
		const V = R.view(W, 'b');
		A(J(V.teams) === J(W.teams) && V.players.find((p) => p.seat === 'b').sideOnCanvas === 3 && J(V.over.winners) === J(['a', 'b']), 'a view carries the teams, each side\'s Canvas count and the winners');
	}
	// a team with no Pets left is out together
	{
		const X = TT('wipe'); turnOf(X, 'a', []); X.tmove = false;
		X.canvas.P.push(...X.players[0].palette[1].splice(0));   // Beeza (purple) onto the Canvas: from there it throws at anyone
		const pc = R.playerOf(X, 'a').deck.find((c) => X.cards[c].c === 'P'); R.playerOf(X, 'a').deck.splice(R.playerOf(X, 'a').deck.indexOf(pc), 1); X.pets.a1.slots[0].push(pc);
		for (const s of ['c', 'd']) { const P = R.playerOf(X, s); P.hand = P.hand.filter((c) => X.cards[c].c !== 'N'); for (const st of P.palette) { const keep = st.filter((u) => u === 'd0'); for (const u of st) if (u !== 'd0') P.wiped.push(u); st.length = 0; st.push(...keep); } }
		const left = R.sideAlive(X, 'c');
		A(J(left) === J(['d0']), 'set up: the Rival team has 1 Pet left (Di\'s Snaboom, red + yellow)', left);
		A(act(X, 'a', { t: 'throw', from: 'a1', slot: 0, to: 'd0', toSlot: 0 }) === null, 'Beeza throws purple onto Snaboom\'s red: purple + yellow are opposites');
		A(X.over && X.over.how === 'wipe' && J(X.over.winners) === J(['a', 'b']) && R.playerOf(X, 'c').out && R.playerOf(X, 'd').out, 'every Rival Pet wiped out: both Rivals are out at once and the team wins', X.over);
	}
	// a partner who leaves is out; their Pets stay with the team
	{
		const Y = TT('leave'); turnOf(Y, 'a', ['R']); Y.tmove = false;
		A(act(Y, 'b', { t: 'concede' }) === null && R.playerOf(Y, 'b').out && !Y.over && R.inPlay(Y, 'b0'), 'Bo leaves: he is out, the match goes on, his Pets stay on his Palette');
		A(act(Y, 'a', { t: 'paint', pet: 'b0', slot: 0, card: card(Y, 'a', 'R') }) === null, 'and Ann plays them');
		act(Y, 'a', { t: 'pass' });
		A(R.curPlayer(Y).seat === 'c', 'Bo\'s turn is skipped');
	}
	// without Tag-Team, 4 players are each on their own (unchanged)
	{
		const F = R.newMatch({ seed: 'ffa4', seats: [{ pets: ['p10', 'p1', 'p6'] }, { pets: ['p11', 'p13', 'p5'] }, { pets: ['p3', 'p8', 'p15'] }, { pets: ['p25', 'p2', 'p20'] }] });
		turnOf(F, 'a', ['R']);
		A(!F.teams && !R.allies(F, 'a', 'b') && act(F, 'a', { t: 'paint', pet: 'b0', slot: 0, card: card(F, 'a', 'R') }) === 'you can only paint your own Pets', 'without Tag-Team a 4-player match is every painter for themselves');
	}
	// the computers play it through: every match ends, every action legal, never 2 moves in one team turn
	{
		let ended = 0, bad = 0, twice = 0, wins = { ab: 0, cd: 0 };
		for (let g = 0; g < 12; g++) {
			const setup = { seed: 'ttai' + g, tagTeam: true, seats: [0, 1, 2, 3].map((k) => ({ name: 'P' + k, pets: ['p' + (k * 4 + 1), 'p' + (k * 4 + 2), 'p' + (k * 4 + 3)], cpu: 'normal' })) };
			const M = R.newMatch(setup), rec = [];
			runCpus(M, undefined, (s, a) => rec.push([s, a]), 6000);
			if (M.over) ended++;
			if (M.over && M.over.winners && M.over.winners.length) wins[M.over.winners.join('')]++;
			const L = R.newMatch(setup); let team = null, moves = 0;
			for (const [s, a] of rec) { const t = R.sideOf(L, R.curPlayer(L).seat).join(''); if (t !== team) { team = t; moves = 0; } if (R.act(L, s, a)) bad++; else if (a.t === 'move') { moves++; if (moves > 1) twice++; } }
		}
		A(ended === 12 && bad === 0 && twice === 0, `12 computer Tag-Team matches: all end, every action legal, 1 move per team turn (a+b won ${wins.ab}, c+d ${wins.cd})`, { ended, bad, twice });
	}
	// a seat's view is enough to say what it may do, in Tag-Team too (an online page holds only its view)
	{
		const S2 = TT('ttfv'); for (const P of S2.players) P.cpu = 'normal';
		let checked = 0; const bad = [];
		for (let k = 0; k < 150 && !S2.over; k++) {
			const seat = R.toAct(S2), F = R.fromView(R.view(S2, seat));
			if (J(R.legal(S2, seat).map((x) => J(x)).sort()) !== J(R.legal(F, seat).map((x) => J(x)).sort())) bad.push(k);
			checked++; R.act(S2, seat, choose(S2, seat, 'normal'));
		}
		A(checked > 30 && bad.length === 0, `Tag-Team: over ${checked} positions, a seat's moves read from its view are exactly the engine's`, bad.slice(0, 5));
	}
	// a replay keeps the Tag-Team setting
	{
		const SVm = await import('../../rainbowpets/js/save.js');
		const rec = { setup: { seed: 'rt', tagTeam: true, seats: [0, 1, 2, 3].map((k) => ({ name: 'P' + k, pets: ['p' + (k * 3 + 1), 'p' + (k * 3 + 2), 'p' + (k * 3 + 3)] })) }, actions: [] };
		const back = SVm.unpackReplay(SVm.packReplay(rec));
		A(back && back.setup.tagTeam === true && R.newMatch(back.setup).teams, 'a packed replay keeps Tag-Team (and rebuilds the teams)');
		const plain = SVm.unpackReplay(SVm.packReplay({ setup: { seed: 'rt', seats: rec.setup.seats.slice(0, 2) }, actions: [] }));
		A(plain && !('tagTeam' in plain.setup), 'an ordinary match packs as before');
	}
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
