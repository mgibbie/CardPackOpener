// Forty-second batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Bellows Lizard  -> tribe "Beast"
//   Bontu's Cartouche -> "Target creature gains +1/+1 & Lifesteal." (text reword;
//     the buff+grant-lifesteal effect already backs it)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 101) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

ok('Bellows Lizard is a Beast', cardsById.bellows_lizard.tribe === 'Beast', cardsById.bellows_lizard.tribe);

// ---------- Bontu's Cartouche: +1/+1 & Lifesteal ----------
{
	const c = cardsById.bontus_cartouche;
	ok('reads "Target creature gains +1/+1 & Lifesteal."', c.description === 'Target creature gains +1/+1 & Lifesteal.', JSON.stringify(c.description));
	ok('buffs +1/+1 and grants Lifesteal', c.effects?.[0]?.type === 'buff' && c.effects[0].attack === 1 && c.effects[0].health === 1 && c.effects[0].grant === 'lifesteal', JSON.stringify(c.effects));
	const st = game();
	const tgt = put(st, 0, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0));
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: tgt.uid, player: 0 }, null, 0);
	ok('the target got +1/+1 (2/2 -> 3/3)', tgt.attack === 3 && tgt.maxHealth === 3, [tgt.attack, tgt.maxHealth]);
	ok('the target gained Lifesteal', (tgt.keywords || []).includes('lifesteal'), JSON.stringify(tgt.keywords));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
