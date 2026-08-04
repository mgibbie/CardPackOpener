// Wave 31: Emboldening Blade — Battlecry: give your Silver Hand Recruits +1/+1
// this game (existing on board AND all future ones summoned).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 4) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'paladin', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = 'paladin'; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const putRecruit = (st) => { const m = E.instantiate({ id: 'shr', name: 'Silver Hand Recruit', type: 'creature', cost: 1, attack: 1, health: 1 }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const putOther = (st) => { const m = E.instantiate({ id: 'oth', name: 'Footman', type: 'creature', cost: 1, attack: 1, health: 1 }, 0); m.zone = 'board'; m.sick = false; st.players[0].board.push(m); return m; };
const summonRecruit = (st) => E.summon(st, 0, { id: 'shr2', name: 'Silver Hand Recruit', type: 'creature', cost: 1, token: true, attack: 1, health: 1 });

ok('emboldening_blade exists', cardsById.emboldening_blade);

// Existing Recruits get +1/+1; a non-Recruit is untouched
{
	const st = game();
	const r1 = putRecruit(st);
	const other = putOther(st);
	equip(st, 'emboldening_blade');
	ok('existing Silver Hand Recruit became 2/2', r1.attack === 2 && E.hp(r1) === 2, [r1.attack, E.hp(r1)]);
	ok('a non-Recruit minion is unaffected', other.attack === 1 && E.hp(other) === 1, [other.attack, E.hp(other)]);
	ok('the weapon equipped as a 3/2', st.players[0].weapon && st.players[0].weapon.attack === 3 && st.players[0].weapon.durability === 2, st.players[0].weapon && [st.players[0].weapon.attack, st.players[0].weapon.durability]);
}

// FUTURE Recruits summoned this game are also +1/+1 (persistent)
{
	const st = game();
	equip(st, 'emboldening_blade');
	const fresh = summonRecruit(st);
	ok('a Recruit summoned AFTER equip is 2/2', fresh && fresh.attack === 2 && E.hp(fresh) === 2, fresh && [fresh.attack, E.hp(fresh)]);
	// persists across turns
	E.endTurn(st); E.endTurn(st);
	const later = summonRecruit(st);
	ok('the buff persists on a later turn (still 2/2)', later && later.attack === 2 && E.hp(later) === 2, later && [later.attack, E.hp(later)]);
}

// Two Emboldening Blades stack (+2/+2 to future Recruits)
{
	const st = game();
	equip(st, 'emboldening_blade');
	// break the first weapon and equip a second copy
	E.breakWeapon(st, 0, true);
	equip(st, 'emboldening_blade');
	const fresh = summonRecruit(st);
	ok('two Emboldening Blades stack: future Recruit is 3/3', fresh && fresh.attack === 3 && E.hp(fresh) === 3, fresh && [fresh.attack, E.hp(fresh)]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
