// "Swing: Freeze an enemy creature" (Elrond's Barrow-Blade, me_elrond_asfaloth) never froze
// anything — bug:1793963479981 + follow-ups 1793970698141 / 1793984754880.
// CAUSE: the weapon's ongoing fires on 'hero-attacks' with an empty context; the trigger path
// (runSecretEffects) delegated {type:'freeze', target:'enemy-creature'} to execEffects with
// NO target, so the handler's chosenCreature() was null and the freeze silently no-oped.
// Same for every single-creature effect on a trigger (Saruman's Staff "Swing: Deal 2 damage to
// an enemy creature", Young Priestess "target creature gains +1 Health", ...).
// FIX: exec.js autoTriggerTarget — a trigger resolves its single creature itself: the creature
// the hero just struck (ctx.swingTarget) when it qualifies, otherwise a random legal one
// (hostile → enemy creature, helpful → friendly creature). Plural targets are unchanged.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._ogre = { id: '_ogre', name: 'Ogre', type: 'creature', cost: 4, attack: 1, health: 9, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL: ' + l + (x != null ? '  ' + x : '')); } };

function fresh(seed = 5) {
	const st = E.createGame(byId, seededRng(seed), null, 2,
		[{ id: 'priest', name: 'Elrond', power: null }, { id: 'warrior', name: 'Foe', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 10, max: 10, bonus: 0 }; }
	return st;
}
function put(st, pi, id) { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; }
function equip(st, pi, id) { const w = E.instantiate(byId[id], pi); w.zone = 'weapon'; st.players[pi].weapon = w; return w; }
function swing(st, target) {
	const r = E.heroAttack(st, 0, target);
	for (let i = 0; i < 6 && st.stack.length && !st.over; i++) E.resolveResponse(st, st.priority ?? 1, 'pass');
	return r;
}

// 1) swing at a creature: THAT creature is frozen, once, with a 'freeze' event naming it
{
	const st = fresh();
	equip(st, 0, 'me_elrond_asfaloth');
	const a = put(st, 1, '_ogre'), b = put(st, 1, '_ogre');
	const ev0 = st.events.length;
	const r = swing(st, { type: 'creature', uid: b.uid, player: 1 });
	ok('the swing happened', r !== false && b.damage === 2, `r=${r} dmg=${b.damage}`);
	ok('the struck creature is Frozen', b.frozen === st.turnNumber, b.frozen);
	ok('only that one', !a.frozen, a.frozen);
	const fz = st.events.slice(ev0).filter(e => e.type === 'freeze');
	ok('exactly one freeze event, naming the creature (log line)', fz.length === 1 && fz[0].name === 'Ogre', JSON.stringify(fz));
}

// 2) swing face with enemy creatures in play: one enemy creature is frozen
{
	const st = fresh();
	equip(st, 0, 'me_elrond_asfaloth');
	const a = put(st, 1, '_ogre'), b = put(st, 1, '_ogre');
	const life0 = st.players[1].life;
	swing(st, { type: 'hero', player: 1 });
	ok('face swing hit the hero', st.players[1].life === life0 - 2, st.players[1].life);
	ok('face swing froze exactly one enemy creature', [a, b].filter(c => c.frozen).length === 1, [a.frozen, b.frozen]);
	// a frozen creature can't attack while frozen
	st.current = 1; st.turnNumber++;
	const frozenOne = [a, b].find(c => c.frozen);
	const r = frozenOne ? E.attack(st, 1, frozenOne.uid, { type: 'hero', player: 0 }) : null;
	ok('the frozen creature cannot attack on its next turn', frozenOne && !r, r);
}

// 3) swing with NO enemy creatures: no crash, no pending prompt, swing resolves
{
	const st = fresh();
	equip(st, 0, 'me_elrond_asfaloth');
	const life0 = st.players[1].life;
	let threw = null;
	try { swing(st, { type: 'hero', player: 1 }); } catch (e) { threw = e; }
	ok('no enemy creatures: no crash and the swing lands', !threw && st.players[1].life === life0 - 2, threw?.message);
	ok('no pending decision left behind', !E.hasPendingDecision || !E.hasPendingDecision(st, 0));
}

// 4) Saruman's Staff "Swing: Deal 2 damage to an enemy creature" now lands too
{
	const st = fresh();
	equip(st, 0, 'me_sa_wep');
	const a = put(st, 1, '_ogre');
	swing(st, { type: 'hero', player: 1 });
	ok('Saruman\'s Staff swing damages an enemy creature', a.damage === 2, a.damage);
}

// 5) plural freeze unchanged: "Freeze all enemy creatures"
{
	const st = fresh();
	const a = put(st, 1, '_ogre'), b = put(st, 1, '_ogre');
	E.execEffects(st, 0, [{ type: 'freeze', target: 'enemy-creatures' }], null, null);
	ok('plural freeze still freezes the whole enemy board', a.frozen && b.frozen);
}

// 6) a helpful single target on a trigger picks a FRIENDLY creature (Young Priestess end of turn)
{
	const st = fresh();
	const yp = put(st, 0, 'young_priestess');
	const mine = put(st, 0, '_ogre');
	const theirs = put(st, 1, '_ogre');
	const h0 = mine.maxHealth;
	E.fireOngoing(st, 0, 'turn-end', {});
	ok('Young Priestess gives +1 Health to another friendly creature', mine.maxHealth === h0 + 1 && theirs.maxHealth === 9 && yp.maxHealth === 1, [mine.maxHealth, theirs.maxHealth, yp.maxHealth]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
