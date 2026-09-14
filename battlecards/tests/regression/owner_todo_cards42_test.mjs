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

// ---------- Bontu's Cartouche ----------
// NOTE: batch 42 first set this to +1/+1 & Lifesteal. It was later (batch 53,
// 2026-09-14) bumped to +3/+3 and broadened to any creature; the deep behavior
// test now lives in owner_todo_cards53_test.mjs. This just confirms it still
// buffs & grants Lifesteal in its current form.
{
	const c = cardsById.bontus_cartouche;
	ok('Cartouche buffs & grants Lifesteal', c.effects?.[0]?.type === 'buff' && c.effects[0].attack === 3 && c.effects[0].health === 3 && c.effects[0].grant === 'lifesteal', JSON.stringify(c.effects));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
