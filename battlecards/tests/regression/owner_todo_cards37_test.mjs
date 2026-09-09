// Thirty-seventh batch from the wiki's owner inbox (owner_todo), 2026-09-08.
//   Invigorate           -> remove the "If you control a Forest…" altCost clause
//   Blanchwood Treefolk  -> renamed "Folklore Sycamore Ritual" (display only)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 87) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } return st; };
const put = (st, pi, inst) => { inst.zone = 'board'; inst.sick = false; st.players[pi].board.push(inst); return inst; };

// ---------- Invigorate: altCost clause removed ----------
{
	const c = cardsById.invigorate;
	ok('altCost is gone', c.altCost === undefined, JSON.stringify(c.altCost));
	ok('reads "Target creature gets +4/+4 until end of turn. Each player gains 4 Life."', c.description === 'Target creature gets +4/+4 until end of turn. Each player gains 4 Life.', JSON.stringify(c.description));
	ok('no leftover "control a Forest" text', !/control a Forest/.test(c.description));
	// still works: +4 Attack to the target + 4 Life to each hero
	const st = game();
	const tgt = put(st, 0, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0));
	st.players[0].life = 20; st.players[1].life = 20;
	const sp = E.instantiate(c, 0); sp.zone = 'hand'; st.players[0].hand.push(sp); st.players[0].mana.cur = 10;
	E.playCard(st, 0, sp.uid, { type: 'creature', uid: tgt.uid, player: 0 }, null, 0);
	ok('the effect still fires (+4 Attack, both heroes +4 Life)', tgt.attack === 6 && st.players[0].life === 24 && st.players[1].life === 24, [tgt.attack, st.players[0].life, st.players[1].life]);
}

// ---------- Blanchwood Treefolk -> Folklore Sycamore Ritual ----------
{
	const c = cardsById.blanchwood_treefolk;
	ok('renamed to "Folklore Sycamore Ritual"', c.name === 'Folklore Sycamore Ritual', c.name);
	ok('id is unchanged (rename is display-only)', c.id === 'blanchwood_treefolk');
	// the enchantment still bolsters your weakest creature at turn end
	// (batch 38 moved the trigger from turn-start to turn-end)
	const st = game();
	const v = put(st, 0, E.instantiate({ id: 'v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2 }, 0));
	const ench = E.instantiate(c, 0); ench.zone = 'enchantment'; st.players[0].enchantments.push(ench);
	const a0 = v.attack;
	E.fireOngoing(st, 0, 'turn-end', {});
	ok('still bolsters (+1/+1) at turn end after the rename', v.attack === a0 + 1, [a0, v.attack]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
