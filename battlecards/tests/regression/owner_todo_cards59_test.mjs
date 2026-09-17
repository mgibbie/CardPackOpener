// Fifty-ninth batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Vulshok Morningstar (wastes_vulshok_morningstar) -> renamed "Void Gear Morningstar"
//   (mechanics unchanged; also resolves a display-name dup with vulshok_morningstar)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const c = cardsById.wastes_vulshok_morningstar;
ok('renamed to "Void Gear Morningstar"', c.name === 'Void Gear Morningstar', c.name);
ok('still a 2/3 weapon', c.type === 'weapon' && c.attack === 2 && c.durability === 3);
ok('keeps the Swing text + hero-attacks trigger (batch 67 appended a Deathrattle)', c.description.startsWith('Swing: Creatures you control gain +1 Attack.') && c.ongoing?.on === 'hero-attacks', JSON.stringify(c.ongoing));
ok('no longer collides with the other Vulshok Morningstar', cardsById.vulshok_morningstar && cardsById.vulshok_morningstar.name === 'Vulshok Morningstar' && cardsById.vulshok_morningstar.name !== c.name);

// FIRE it: equip, swing, friendly creatures gain +1 Attack (mechanic intact)
const st = E.createGame(cardsById, seededRng(59), null, 2, [{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; } st.players[0].mana = { cur: 10, max: 10, bonus: 0 };
const g = E.instantiate({ id: 'grunt', name: 'Grunt', type: 'creature', cost: 1, attack: 2, health: 3 }, 0);
g.zone = 'board'; g.sick = false; st.players[0].board.push(g);
const w = E.instantiate(c, 0); w.zone = 'weapon'; st.players[0].weapon = w;
st.players[0].heroAttacksUsed = 0;
E.heroAttack(st, 0, { type: 'hero', player: 1 });
ok('the swing still buffs your creatures +1 Attack (2 -> 3)', g.attack === 3, g.attack);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
