// Missing HS weapons — wave 15: Reaper's Scythe (Spellburst Cleave) + Val'anyr (buff + reequip).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (seed = 62) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const dummy = (a, h, name, extra = {}) => ({ id: 'dm_' + name, name, type: 'creature', cost: 2, rarity: 'basic', attack: a, health: h, ...extra });
const equip = (st, id) => { const w = E.instantiate(cardsById[id], 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10; E.playCard(st, 0, w.uid, null, null, 0); return st.players[0].weapon; };
const cast = (st, cost = 0) => { const sp = { id: 'sp' + cost, name: 's', type: 'sorcery', cost, effects: [] }; cardsById[sp.id] = sp; const c = E.instantiate(sp, 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); };

for (const id of ['reaper_s_scythe', 'val_anyr']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Reaper's Scythe: Spellburst grants Cleave this turn (attack splashes neighbours)
{
	const st = game();
	const left = put(st, 1, dummy(0, 5, 'L')); const mid = put(st, 1, dummy(0, 5, 'M')); const right = put(st, 1, dummy(0, 5, 'R'));
	const w = equip(st, 'reaper_s_scythe');
	cast(st); // Spellburst → weapon Cleaves this turn
	ok('Reaper\'s Scythe gained Cleave this turn', st.players[0].weapon.cleaveThisTurn === true);
	st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: mid.uid, player: 1 });
	ok('the hero attack splashed both neighbours (Cleave)', mid.damage === w.attack && left.damage === w.attack && right.damage === w.attack, [left.damage, mid.damage, right.damage]);
}
// Val'anyr: Deathrattle give a hand minion +4/+2 and a reequip Deathrattle
{
	const st = game();
	cardsById.dm_Buddy = dummy(2, 2, 'Buddy');
	const buddy = E.instantiate(cardsById.dm_Buddy, 0); buddy.zone = 'hand'; st.players[0].hand.push(buddy);
	equip(st, 'val_anyr'); E.breakWeapon(st, 0);
	ok('Val\'anyr buffed the hand minion +4/+2', buddy.attack === 6 && buddy.maxHealth === 4, [buddy.attack, buddy.maxHealth]);
	ok('the buffed minion got a Deathrattle', (buddy.keywords || []).includes('deathrattle') && buddy.deathrattle.length > 0);
	// play then kill the buddy → it reequips a Val'anyr
	st.players[0].mana.cur = 10; E.playCard(st, 0, buddy.uid, null, null, 0);
	const onBoard = st.players[0].board.find(c => c.id === 'dm_Buddy');
	const wall = put(st, 1, dummy(9, 9, 'Wall')); st.current = 0; onBoard.attacksUsed = 0; onBoard.sick = false;
	E.attack(st, 0, onBoard.uid, { type: 'creature', uid: wall.uid, player: 1 });
	ok('the buffed minion died in combat', E.isDead(onBoard), [onBoard.attack, E.hp(onBoard)]);
	ok('the buffed minion reequipped a Val\'anyr weapon on death', st.players[0].weapon && /val/i.test(st.players[0].weapon.name), st.players[0].weapon?.name);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
