// Thirty-fourth batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Armored Wolf-Rider -> ability becomes "Your Beasts cost (1) less."
//   (Beast-tribe cost aura, your side only; keeps Taunt.)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 79) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };
const hand = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };

// ---------- card data ----------
{
	const c = cardsById.armored_wolf_rider;
	ok('reads "Taunt. Your Beasts cost (1) less."', c.description === 'Taunt. Your Beasts cost (1) less.', JSON.stringify(c.description));
	ok('keeps Taunt', (c.keywords || []).includes('taunt'), JSON.stringify(c.keywords));
	ok('carries a Beast cost aura (own creatures, -1)', c.costMod && c.costMod.tribe === 'Beast' && c.costMod.amount === -1 && c.costMod.cardType === 'creature' && c.costMod.scope === 'own', JSON.stringify(c.costMod));
}

// ---------- FIRE the aura ----------
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.armored_wolf_rider, 0));
	const beast = hand(st, 0, { id: 'b', name: 'B', type: 'creature', cost: 4, attack: 3, health: 3, tribe: 'Beast' });
	const compound = hand(st, 0, { id: 'cb', name: 'CB', type: 'creature', cost: 4, attack: 2, health: 2, tribe: 'Dinosaur Beast' });
	const plain = hand(st, 0, { id: 'p', name: 'P', type: 'creature', cost: 4, attack: 2, health: 2, tribe: 'Elf' });
	const beastSpell = hand(st, 0, { id: 'bs', name: 'BS', type: 'sorcery', cost: 4, tribe: 'Beast' });
	ok('a Beast costs 1 less (4 -> 3)', E.effectiveCost(st, 0, beast) === 3, E.effectiveCost(st, 0, beast));
	ok('a compound-tribe Beast also benefits (Dinosaur Beast, 4 -> 3)', E.effectiveCost(st, 0, compound) === 3, E.effectiveCost(st, 0, compound));
	ok('a non-Beast creature is unaffected (4)', E.effectiveCost(st, 0, plain) === 4, E.effectiveCost(st, 0, plain));
	ok('a Beast SPELL is unaffected (creature-only aura, 4)', E.effectiveCost(st, 0, beastSpell) === 4, E.effectiveCost(st, 0, beastSpell));
}

// ---------- scope: own — the OPPONENT's Beasts are NOT discounted ----------
{
	const st = game();
	put(st, 0, E.instantiate(cardsById.armored_wolf_rider, 0)); // on player 0's board
	const enemyBeast = hand(st, 1, { id: 'eb', name: 'EB', type: 'creature', cost: 4, attack: 3, health: 3, tribe: 'Beast' });
	ok('the opponent\'s Beast is NOT discounted (still 4)', E.effectiveCost(st, 1, enemyBeast) === 4, E.effectiveCost(st, 1, enemyBeast));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
