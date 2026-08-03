// Blacksmith's Skill (W instant, 1): give a creature Immune for 3 turns.
// Elite Vanguard (W creature): now a Human Soldier.
import fs from 'fs';
import * as E from '../../engine.js';
import { damageCreature } from '../../engine/damage.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

// --- Elite Vanguard tribe ---
ok('Elite Vanguard is a Human Soldier', cardsById['elite_vanguard'].tribe === 'Human Soldier', cardsById['elite_vanguard'].tribe);

// --- Blacksmith's Skill card face ---
const bs = cardsById['blacksmith_skill'];
ok('Blacksmith\'s Skill grants Immune for 3 turns', bs.description === 'Give a creature Immune for 3 turns.' && bs.effects[0].type === 'grant-immune-turn' && bs.effects[0].turns === 3, [bs.description, bs.effects]);

const game = () => {
	const st = E.createGame(cardsById, seededRng(3), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	st.current = 0; st.players[0].hand = []; st.players[1].hand = [];
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.summonedThisTurn = false; st.players[pi].board.push(c); return c; };
const p0turns = (st, n) => { for (let k = 0; k < n; k++) { E.endTurn(st); E.endTurn(st); } }; // n full round-trips back to player 0's turn start

// cast Blacksmith's Skill on a friendly creature
{
	const st = game();
	const mon = put(st, 0, { id: 'bs_target', name: 'Target', type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 8 });
	const spell = E.instantiate(bs, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	E.playCard(st, 0, spell.uid, { type: 'creature', uid: mon.uid, player: 0 }, null, 0);
	ok('cast: the creature gains Immune', mon.keywords.includes('immune'));
	damageCreature(st, mon, 5, null);
	ok('Immune blocks all damage', mon.damage === 0, mon.damage);

	// still immune on your next 2 turns
	p0turns(st, 1);
	ok('turn 2: still Immune', mon.keywords.includes('immune'), mon.immuneTurnsLeft);
	p0turns(st, 1);
	ok('turn 3: still Immune', mon.keywords.includes('immune'), mon.immuneTurnsLeft);

	// on your 3rd subsequent turn start it wears off
	p0turns(st, 1);
	ok('after 3 of your turns: Immune wears off', !mon.keywords.includes('immune'), mon.immuneTurnsLeft);
	damageCreature(st, mon, 5, null);
	ok('now damage lands again', mon.damage === 5, mon.damage);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
