// Missing HS weapons — wave 14: Grotesque Runeblade (last-card rune) + Spectral Cutlass (other-class).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const game = (heroClass = 'rogue', seed = 61) => {
	const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: heroClass, name: 'M', power: null }, { id: 'mage', name: 'N', power: null }]);
	st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; }
	st.players[0].heroClass = heroClass; st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	return st;
};
const play = (st, def) => { cardsById[def.id] = def; const c = E.instantiate(def, 0); c.zone = 'hand'; st.players[0].hand.push(c); st.players[0].mana.cur = 10; E.playCard(st, 0, c.uid, null, null, 0); return c; };

for (const id of ['grotesque_runeblade', 'spectral_cutlass']) ok(`${id} exists`, cardsById[id]?.type === 'weapon', id);

// Grotesque Runeblade: +1 Attack if last card had an Unholy rune; +1 Durability if Blood
{
	const st = game('death_knight');
	play(st, { id: 'ub_card', name: 'UB', type: 'creature', cost: 1, attack: 1, health: 1, runes: { unholy: 1, blood: 1, frost: 0 } });
	play(st, cardsById.grotesque_runeblade); // battlecry checks the UB card's runes
	const w = st.players[0].weapon;
	ok('Grotesque Runeblade: +1 Attack (Unholy) and +1 Durability (Blood)', w.attack === cardsById.grotesque_runeblade.attack + 1 && w.durability === cardsById.grotesque_runeblade.durability + 1, [w.attack, w.durability]);
}
// Grotesque Runeblade with a runeless last card → no bonus
{
	const st = game('death_knight');
	play(st, { id: 'plain', name: 'P', type: 'creature', cost: 1, attack: 1, health: 1 }); // no runes
	play(st, cardsById.grotesque_runeblade);
	const w = st.players[0].weapon;
	ok('Grotesque Runeblade: no bonus with a runeless last card', w.attack === cardsById.grotesque_runeblade.attack && w.durability === cardsById.grotesque_runeblade.durability, [w.attack, w.durability]);
}
// Spectral Cutlass: Lifesteal + gain Durability when you play a card from another class
{
	const st = game('rogue');
	const w = E.instantiate(cardsById.spectral_cutlass, 0); w.zone = 'hand'; st.players[0].hand.push(w); st.players[0].mana.cur = 10;
	E.playCard(st, 0, w.uid, null, null, 0);
	const d0 = st.players[0].weapon.durability;
	ok('Spectral Cutlass has Lifesteal', (st.players[0].weapon.keywords || []).includes('lifesteal'));
	play(st, { id: 'mage_card', name: 'Mg', type: 'creature', cost: 1, attack: 1, health: 1, cardClass: 'mage' }); // other class
	ok('Spectral Cutlass gained +1 Durability from an off-class card', st.players[0].weapon.durability === d0 + 1, [d0, st.players[0].weapon?.durability]);
	const d1 = st.players[0].weapon.durability;
	play(st, { id: 'rogue_card', name: 'Rg', type: 'creature', cost: 1, attack: 1, health: 1, cardClass: 'rogue' }); // same class
	ok('Spectral Cutlass ignores same-class cards', st.players[0].weapon.durability === d1, st.players[0].weapon?.durability);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
