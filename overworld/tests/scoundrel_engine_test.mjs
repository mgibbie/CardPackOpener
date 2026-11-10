// scoundrel_engine_test.mjs — the Scoundrel rules engine (scoundrel/js/engine.js), a port of the
// owner's Love2D game (Desktop/Scoundrel src/game.lua): the deck, every rule of a room (potions,
// weapons + degradation, the fight choice, the carry-over card, running, the no-moves rule, death),
// the roguelike run (each cleared dungeon starts the next with 1 less max HP, at full health; the
// run ends at death or when max HP would reach 0), scoring, determinism and resume-by-replay.
//   node overworld/tests/scoundrel_engine_test.mjs
import * as E from '../../scoundrel/js/engine.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra) : '')); } };
let nextId = 1000;
const C = (suit, rank) => ({ id: nextId++, suit, rank, value: E.RANK_VALUES[rank] });
const H = (r) => C('Hearts', r), D = (r) => C('Diamonds', r), CL = (r) => C('Clubs', r), S = (r) => C('Spades', r);
/** a run whose current room / deck are set by hand */
function at({ room, deck = [], hp = 20, maxHp = 20, weapon = null, limit = null, ...rest }) {
	const s = E.newRun('fixture');
	Object.assign(s, { room, deck, hp, maxHp, weapon, weaponLimit: limit, weaponKills: [], resolved: 0, potionUsed: false, ranThisRoom: false, ranLastRoom: false, state: E.STATE.CHOOSING, ...rest });
	return s;
}
const vjson = (s) => JSON.stringify(E.view(s));

// ---------------------------------------------------------------- the deck
{
	const d = E.buildDeck();
	A(d.length === 44, '44-card deck', d.length);
	A(!d.some((c) => (c.suit === 'Hearts' || c.suit === 'Diamonds') && ['J', 'Q', 'K', 'A'].includes(c.rank)), 'no red faces or red aces');
	A(d.filter(E.isMonster).length === 26 && d.filter(E.isPotion).length === 9 && d.filter(E.isWeapon).length === 9, '26 monsters (all clubs + spades), 9 potions (2-10 of hearts), 9 weapons (2-10 of diamonds)');
	A(d.filter(E.isMonster).every((c) => c.value >= 2 && c.value <= 14) && d.find((c) => c.suit === 'Spades' && c.rank === 'A').value === 14, 'monster Ace = 14, faces 11-13');
	A(new Set(d.map((c) => c.id)).size === 44 && d[0].id === 1 && d[43].id === 44, 'ids 1..44 in suit/rank order (deck.lua)');
	const r1 = E.newRun('same'), r2 = E.newRun('same'), r3 = E.newRun('other');
	A(vjson(r1) === vjson(r2), 'same seed -> same deal');
	A(JSON.stringify(r1.deck.map((c) => c.id)) !== JSON.stringify(r3.deck.map((c) => c.id)), 'different seed -> different shuffle');
	A(r1.room.length === 4 && r1.deck.length === 40 && r1.hp === 20 && r1.maxHp === 20 && r1.dungeon === 1, 'dungeon 1: 20/20 HP, a room of 4, 40 left in the deck');
	const sh = E.shuffle(E.buildDeck(), E.makeRng('x'));
	A(sh.map((c) => c.id).sort((a, b) => a - b).join() === E.buildDeck().map((c) => c.id).join(), 'shuffle is a permutation');
}

// ---------------------------------------------------------------- potions
{
	const s = at({ room: [H('5'), H('7'), CL('2'), CL('3')], deck: [S('2'), S('3'), S('4'), S('5'), S('6')], hp: 12 });
	A(E.apply(s, '0') && s.hp === 17, 'a potion heals its value', s.hp);
	A(s.potionUsed && !E.view(s).room[0].enabled, 'the second potion of a room is disabled (main.lua)');
	A(!E.apply(s, '0') && s.hp === 17, 'and refused: only one potion per room (owner rule: it cannot even be wasted)');
	const t = at({ room: [H('9'), CL('2'), CL('3'), CL('4')], deck: [S('2')], hp: 18 });
	E.apply(t, '0');
	A(t.hp === 20 && t.lastAction.text === '+2 HP', 'healing caps at max HP', t.lastAction);
}

// ---------------------------------------------------------------- weapons, the fight choice, degradation
{
	const s = at({ room: [D('5'), CL('10'), CL('J'), H('2')], deck: [S('2'), S('3'), S('4'), S('5'), S('6'), S('7')] });
	E.apply(s, '0');
	A(s.weapon && s.weapon.value === 5 && s.weaponLimit == null, 'equipping a diamond: weapon 5, no limit yet');
	A(E.apply(s, '0') && s.state === E.STATE.FIGHT_CHOICE && s.pending === 0, 'picking a monster with a usable weapon opens the fight choice');
	A(E.apply(s, 'c') && s.state === E.STATE.CHOOSING && s.hp === 20 && s.room.length === 3, 'cancel: nothing happens');
	E.apply(s, '0'); E.apply(s, 'w');
	A(s.hp === 15 && s.weaponLimit === 10, 'weapon fight: damage = monster - weapon (10-5 = 5); the weapon now only fights <= 10', { hp: s.hp, lim: s.weaponLimit });
	A(s.weaponKills.length === 1, 'the slain monster stacks on the weapon');
	E.apply(s, '1');          // the potion: the 3rd card of the room
	A(s.hp === 17 && s.room.length === 4 && s.room[0].rank === 'J' && s.roomsCleared === 1, 'after 3 cards the 4th (J of clubs) carries over to the next room, which fills back to 4', s.room.map((c) => c.rank));
	A(E.apply(s, '0') && s.state === E.STATE.CHOOSING && s.hp === 6, 'a monster above the weapon limit (11 > 10) is fought bare-handed, no choice', s.hp);
	const eq = at({ room: [CL('7'), S('7'), CL('8'), H('2')], deck: [S('2'), S('3'), S('4')], weapon: D('2'), limit: 7 });
	A(E.canUseWeapon(eq, 7), 'degradation is <= (owner rule): a weapon that killed a 7 still fights a 7');
	A(!E.canUseWeapon(eq, 8), '... but not an 8');
	E.apply(eq, '0'); E.apply(eq, 'b');
	A(eq.hp === 13 && eq.weaponLimit === 7, 'bare-handed: full damage, the weapon limit is untouched', { hp: eq.hp, lim: eq.weaponLimit });
	A(!E.apply(eq, 'w'), 'w/b/c are refused outside the fight choice');
	const big = at({ room: [D('3'), CL('2'), CL('3'), CL('4')], deck: [S('2')], weapon: D('9'), limit: 4 });
	E.apply(big, '0');
	A(big.weapon.value === 3 && big.weaponLimit == null && big.discard.some((c) => c.rank === '9'), 'a new weapon replaces the old one (discarded) and resets the limit');
	const zero = at({ room: [CL('2'), CL('3'), CL('4'), CL('5')], deck: [S('2')], weapon: D('8') });
	E.apply(zero, '0'); E.apply(zero, 'w');
	A(zero.hp === 20, 'a weapon stronger than the monster takes no damage');
}

// ---------------------------------------------------------------- running
{
	const s = at({ room: [CL('2'), CL('3'), CL('4'), CL('5')], deck: [S('2'), S('3'), S('4'), S('5'), S('6'), S('7'), S('8'), S('9')] });
	const before = s.room.map((c) => c.id);
	A(E.view(s).canRun && E.apply(s, 'r'), 'run from a fresh room');
	A(JSON.stringify(s.deck.slice(-4).map((c) => c.id)) === JSON.stringify(before), 'the room goes to the bottom of the deck, in order');
	A(s.room.length === 4 && s.room[0].rank === '2' && s.room[0].suit === 'Spades', 'the next room is dealt from the top');
	A(!E.view(s).canRun && !E.apply(s, 'r'), 'cannot run two rooms in a row');
	E.apply(s, '0'); E.apply(s, '0'); E.apply(s, '0');
	A(E.view(s).canRun, 'the room after next can be run from again');
	const mid = at({ room: [CL('2'), CL('3'), CL('4'), CL('5')], deck: [S('2'), S('3'), S('4'), S('5')] });
	E.apply(mid, '0');
	A(E.view(mid).canRun && E.apply(mid, 'r') && mid.resolved === 0, 'owner rule: you may still run after resolving cards in the room');
	A(mid.deck.map((c) => c.rank).join() === '3,4,5' && mid.room.every((c) => c.suit === 'Spades'), '... the 3 cards left go to the bottom, the next room is dealt', mid.deck.map((c) => c.rank));
}

// ---------------------------------------------------------------- no legal moves (only disabled potions, can't run)
{
	const s = at({ room: [H('2'), H('3'), H('4'), CL('2')], deck: [S('9'), S('10'), S('J')], ranLastRoom: true });
	E.apply(s, '0');          // drink one -> 2 potions left (disabled) + the club
	E.apply(s, '2');          // fight the club bare-handed -> resolved 2, only disabled potions left, cannot run
	A(s.lastAction.text === 'No moves left!', 'stuck room detected (only disabled potions, cannot run)', s.lastAction);
	A(s.roomsCleared === 1 && s.room.map((c) => c.suit[0] + c.rank).join() === 'S9,S10,SJ,H3' && s.deck.map((c) => c.suit[0] + c.rank).join() === 'H4', 'the stuck room goes to the bottom of the deck (in order) and counts as cleared', { deck: s.deck.map((c) => c.rank), room: s.room.map((c) => c.rank) });
}

// ---------------------------------------------------------------- death + score
{
	const s = at({ room: [S('K'), CL('2'), CL('3'), CL('4')], deck: [S('9'), H('5')], hp: 13 });
	E.apply(s, '0');
	A(s.state === E.STATE.OVER && s.hp === 0 && s.result.reason === 'dead', 'a lethal monster ends the run');
	A(s.result.final === -(2 + 3 + 4 + 9) && s.result.dungeons === 0, 'standard score on death: minus the monsters left', s.result);
	A(!E.apply(s, '1'), 'nothing is accepted after the run is over');
}

// ---------------------------------------------------------------- the roguelike run: max HP drops per dungeon
{
	// a real clear of dungeon 1 (seed3, found by a beam search; tools-free)
	const RECIPE = '10br2w111w0r0w0w1wr1w1w1r010w320w1r1r1w1w1w0r1w01w2wr20w00w1w0r30w0w20w1w00w0w';
	const s = E.replay('seed3', RECIPE);
	A(s.actions === RECIPE, 'every recorded action of the clearing run is legal');
	A(s.state === E.STATE.CLEARED && s.cleared === 1 && s.history.length === 1, 'dungeon 1 cleared: the run waits to descend', { state: s.state });
	A(s.history[0].score === E.dungeonScore(s) && s.history[0].maxHp === 20, 'the cleared dungeon is recorded with its standard score', s.history[0]);
	A(!E.apply(s, '0'), 'room actions are refused between dungeons');
	A(E.apply(s, 'd'), 'descend');
	A(s.dungeon === 2 && s.maxHp === 19 && s.hp === 19, 'dungeon 2 starts at MAX HP 19, full health', { d: s.dungeon, max: s.maxHp, hp: s.hp });
	A(s.weapon == null && s.room.length === 4 && s.deck.length === 40 && !s.ranLastRoom, 'a fresh 44-card dungeon: no weapon, a new room, nothing carried over');
	A(JSON.stringify(s.room.map((c) => c.id)) !== JSON.stringify(E.newRun('seed3').room.map((c) => c.id)), 'dungeon 2 has its own shuffle');
	// clear dungeons quickly by hand: an empty deck and one potion left in the room
	const clearNow = (r) => { r.deck = []; r.room = [H('2')]; r.resolved = 0; r.potionUsed = false; r.state = E.STATE.CHOOSING; E.apply(r, '0'); };
	clearNow(s);
	A(s.state === E.STATE.CLEARED && s.cleared === 2, 'dungeon 2 cleared');
	E.apply(s, 'd');
	A(s.dungeon === 3 && s.maxHp === 18 && s.hp === 18, 'dungeon 3: max HP 18');
	for (let k = 0; k < 30 && s.state !== E.STATE.OVER; k++) { clearNow(s); if (s.state === E.STATE.CLEARED) E.apply(s, 'd'); }
	A(s.state === E.STATE.OVER && s.result.reason === 'complete' && s.cleared === 20 && s.maxHp === 1, 'the run ends after dungeon 20 (max HP would hit 0): 20 dungeons cleared', { c: s.cleared, max: s.maxHp, r: s.result });
	A(s.history.map((h) => h.maxHp).join() === Array.from({ length: 20 }, (_, i) => 20 - i).join(), 'max HP per dungeon: 20, 19, ... 1');
	// a full-health potion finish adds the potion's value (standard Scoundrel)
	const f = at({ room: [H('6')], deck: [], hp: 20 });
	E.apply(f, '0');
	A(f.history[0].score === 26, 'win at full HP on a potion: HP + the potion', f.history[0]);
	A(E.compareResults({ dungeons: 3, final: -50 }, { dungeons: 2, final: 20 }) > 0 && E.compareResults({ dungeons: 2, final: -5 }, { dungeons: 2, final: -20 }) > 0, 'ranking: dungeons cleared, then the final dungeon score');
}

// ---------------------------------------------------------------- determinism + resume (frame-exact)
{
	let ok = true, pendingSeen = 0, clearedSeen = 0;
	for (let k = 0; k < 300; k++) {
		const s = E.newRun('det' + k), rng = E.makeRng('pick' + k), snaps = [];
		for (let g = 0; g < 400 && s.state !== E.STATE.OVER; g++) {
			const opts = ['0', '1', '2', '3', 'w', 'b', 'c', 'r', 'd'].filter((a) => E.refusal(s, a) == null);
			E.apply(s, opts[rng.int(0, opts.length - 1)]);
			snaps.push(vjson(s));
		}
		// resume at EVERY point (mid-room, mid fight choice) = the live state at that point
		for (let i = 0; i < s.actions.length; i++) {
			const r = E.replay(s.seed, s.actions.slice(0, i + 1));
			if (vjson(r) !== snaps[i]) { ok = false; break; }
			if (r.state === E.STATE.FIGHT_CHOICE) pendingSeen++;
			if (r.state === E.STATE.CLEARED) clearedSeen++;
		}
		if (vjson(E.replay(s.seed, s.actions)) !== vjson(s)) ok = false;
	}
	A(ok, '300 random runs: the recipe rebuilds the exact state after every single action');
	A(pendingSeen > 0, 'resume covers a pending fight choice', pendingSeen);
	const s = E.replay('seed3', '10br2w111w0r0w0w1wr1w1w1r010w320w1r1r1w1w1w0r1w01w2wr20w00w1w0r30w0w20w1w00w0w');
	A(vjson(E.replay('seed3', s.actions)) === vjson(s) && s.state === E.STATE.CLEARED, 'resume on the "dungeon cleared" screen');
	const bad = E.replay('seed3', '10b9999');
	A(bad.actions === '10b', 'a corrupt recipe tail stops at the first refused action');
	A(!/Math\.random|Date\.now|performance/.test((await import('fs')).readFileSync(new URL('../../scoundrel/js/engine.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')), 'the engine never reads Math.random or the clock');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
