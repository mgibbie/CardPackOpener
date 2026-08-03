// Kor Hookmaster (W, 3, 2/2): Battlecry: Freeze target creature (any creature).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const K = cardsById['kor_hookmaster'];
ok('card face: Battlecry freeze targeting any creature', K.description === 'Battlecry: Freeze target creature.'
	&& K.effects[0].type === 'freeze' && K.effects[0].target === 'creature', [K.description, K.effects]);

const st = E.createGame(cardsById, seededRng(1), null, 2, [{ id: 'neutral', name: 'N', power: null }, { id: 'neutral', name: 'N', power: null }]);
st.current = 0; st.players[0].hand = []; st.players[1].hand = [];
const mine = E.instantiate({ id: 'mc', name: 'Mine', type: 'creature', cost: 1, rarity: 'basic', attack: 1, health: 3 }, 0);
mine.zone = 'board'; mine.summonedThisTurn = false; st.players[0].board.push(mine);
const foe = E.instantiate({ id: 'fc', name: 'Foe', type: 'creature', cost: 1, rarity: 'basic', attack: 2, health: 3 }, 1);
foe.zone = 'board'; foe.summonedThisTurn = false; st.players[1].board.push(foe);

// "target creature" allows any creature (friendly or enemy)
const legal = E.legalTargets(st, 0, E.targetSpec(st, 0, K)).map(t => t.uid).sort();
ok('any creature is a legal target (friendly + enemy)', legal.includes(mine.uid) && legal.includes(foe.uid), legal);

// play it targeting the enemy -> it's frozen
const h = E.instantiate(K, 0); h.zone = 'hand'; st.players[0].hand.push(h);
st.players[0].mana.max = 10; st.players[0].mana.cur = 10;
E.playCard(st, 0, h.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
ok('Battlecry freezes the targeted creature', !!foe.frozen, foe.frozen);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
