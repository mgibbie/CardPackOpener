// Windswept Heresy (paper, Fel sorcery, 4): Flip a coin —
//   Heads: each creature (both boards) gains Windfury.
//   Tails: each Demon or Spirit (both boards) gains +2/+2 & Lifesteal.
// Coin flip is modeled with the `random-effects` handler (2 options = 50/50);
// the branches use the all-creatures targets added to grant/buff.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const CARD = cardsById['windswept_heresy'];
ok('card exists with the right face', CARD && CARD.type === 'sorcery' && CARD.tribe === 'Fel' && CARD.cost === 4 && CARD.cardClass === 'neutral' && CARD.rarity === 'uncommon', CARD && [CARD.type, CARD.cost]);
ok('effect is a single random-effects coin flip (2 branches)', CARD.effects.length === 1 && CARD.effects[0].type === 'random-effects' && CARD.effects[0].options.length === 2, CARD.effects);

function board() {
	const st = E.createGame(cardsById, seededRng(3), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	const put = (pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.summonedThisTurn = false; st.players[pi].board.push(c); return c; };
	return {
		st,
		plainF: put(0, { id: 'p_plain', name: 'Footman', type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 3 }),
		plainE: put(1, { id: 'e_plain', name: 'Grunt', type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 3 }),
		demonF: put(0, { id: 'p_demon', name: 'Imp', type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 1, tribe: 'Demon' }),
		spiritE: put(1, { id: 'e_spirit', name: 'Wisp Spirit', type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 1, tribe: 'Spirit' }),
		beastF: put(0, { id: 'p_beast', name: 'Wolf', type: 'creature', cost: 1, rarity: 'basic', attack: 2, health: 2, tribe: 'Beast' }),
	};
}
const cast = (st) => E.execEffects(st, 0, JSON.parse(JSON.stringify(CARD.effects)), null, null);

// HEADS (rng -> option 0): every creature on both boards gains Windfury
{
	const b = board(); b.st.rng = () => 0;
	cast(b.st);
	const all = [b.plainF, b.plainE, b.demonF, b.spiritE, b.beastF];
	ok('heads: every creature (both boards) has Windfury', all.every(c => c.keywords.includes('windfury')), all.map(c => c.keywords));
	ok('heads: no stats changed', b.plainF.attack === 1 && E.hp(b.plainF) === 3 && b.beastF.attack === 2, [b.plainF.attack, b.beastF.attack]);
}

// TAILS (rng -> option 1): only Demons/Spirits get +2/+2 & Lifesteal
{
	const b = board(); b.st.rng = () => 0.99;
	cast(b.st);
	ok('tails: friendly Demon is +2/+2 with Lifesteal', b.demonF.attack === 3 && E.hp(b.demonF) === 3 && b.demonF.keywords.includes('lifesteal'), [b.demonF.attack, E.hp(b.demonF), b.demonF.keywords]);
	ok('tails: enemy Spirit is +2/+2 with Lifesteal (hits both boards)', b.spiritE.attack === 3 && E.hp(b.spiritE) === 3 && b.spiritE.keywords.includes('lifesteal'), [b.spiritE.attack, E.hp(b.spiritE)]);
	ok('tails: non-Demon/Spirit creatures untouched', b.plainF.attack === 1 && E.hp(b.plainF) === 3 && b.beastF.attack === 2 && !b.beastF.keywords.includes('lifesteal') && !b.plainE.keywords.includes('lifesteal'), [b.beastF.attack, b.plainF.attack]);
	ok('tails: nobody gained Windfury', ![b.plainF, b.demonF, b.spiritE, b.beastF].some(c => c.keywords.includes('windfury')), 'windfury leaked');
}

// the card plays through the real engine end-to-end (mana, hand, cast) and stays legal
{
	const st = E.createGame(cardsById, seededRng(5), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
	const dem = E.instantiate({ id: 'p_demon2', name: 'Felhound', type: 'creature', cost: 1, rarity: 'basic', attack: 2, health: 2, tribe: 'Demon' }, 0);
	dem.zone = 'board'; dem.summonedThisTurn = false; st.players[0].board.push(dem);
	const spell = E.instantiate(CARD, 0); spell.zone = 'hand'; st.players[0].hand.push(spell);
	st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
	st.rng = () => 0.99; // force tails so the Demon buff is observable
	const before = dem.attack;
	E.playCard(st, 0, spell.uid, null, null, 0);
	ok('end-to-end: casting the spell buffs the friendly Demon', dem.attack === before + 2 && dem.keywords.includes('lifesteal'), [dem.attack, before]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
