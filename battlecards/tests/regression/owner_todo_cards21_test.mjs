// Twenty-first batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Balduvian Bears -> add "Battlecry: Target creature gains +1/+1".
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const st = E.createGame(cardsById, seededRng(45), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]);
st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana.max = 10; p.mana.cur = 10; }

const c = cardsById.balduvian_bears;
ok('reads "Rush & Taunt.\\nBattlecry: Target creature gains +1/+1."', c.description === 'Rush & Taunt.\nBattlecry: Target creature gains +1/+1.', JSON.stringify(c.description));
ok('keeps taunt/rush + gains battlecry', ['taunt', 'rush', 'battlecry'].every(k => c.keywords.includes(k)), JSON.stringify(c.keywords));
ok('battlecry buffs a friendly creature +1/+1', c.effects?.[0]?.type === 'buff' && c.effects[0].attack === 1 && c.effects[0].health === 1 && c.effects[0].target === 'friendly-creature', JSON.stringify(c.effects));

// FIRE it: a friendly creature on board, play the Bears targeting it -> +1/+1
const buddy = E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0);
buddy.zone = 'board'; st.players[0].board.push(buddy);
const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
E.playCard(st, 0, sp.uid, { type: 'creature', uid: buddy.uid, player: 0 }, null, 0);
ok('the target gained +1/+1 (2/2 -> 3/3)', buddy.attack === 3 && buddy.maxHealth === 3, [buddy.attack, buddy.maxHealth]);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
