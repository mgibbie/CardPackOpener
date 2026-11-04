// targeted_conditional_transform_test.mjs (2026-10-12, Instinct's Lorequest reports)
//
// 1. Karn's Touch — "Give a friendly creature +2/+2. If you control an artifact or
//    enchantment, give it +4/+4 and Divine Shield instead." — is a `conditional` with
//    no target of its own; its branches name 'friendly-creature'. targetSpec only read
//    the top-level effect, so the spell asked for nothing and resolved untargeted
//    (mana spent, card gone, no buff). Now a target-less wrapper's branches decide.
//    Same shape: Chandra's Fury (+II), Sylvanas' Triumph, Wicked Stab, Go with the
//    Flow, Sensory Deprivation.
// 2. Tribute Dance — "Choose a creature. Choose a different creature to transform it
//    into." — was a bare `transform` with no `into`, so it fizzled. Now the chosen
//    creature becomes a fresh copy of a second creature the caster picks (a pick
//    among every OTHER living creature; auto when there's exactly one).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; console.log('ok  - ' + l); } else { fail++; console.log('FAIL', l, x ?? ''); } };
const game = (seed = 7) => { const st = E.createGame(cardsById, seededRng(seed), null, 2, [{ id: 'mage', name: 'M', power: null }, { id: 'druid', name: 'N', power: null }]); st.current = 0; for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.mana = { cur: 10, max: 10, bonus: 0 }; } st.pickQueue = []; return st; };
const put = (st, pi, name, atk, hp) => { const c = E.instantiate({ id: name, name, type: 'creature', cost: 1, attack: atk, health: hp }, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); return c; };
const hand = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const tgt = c => ({ type: 'creature', uid: c.uid, player: c.controller });

// ---------- Karn's Touch asks for a friendly creature ----------
{
	const st = game();
	put(st, 0, 'bear', 2, 2);
	const card = hand(st, 0, 'karn_touch');
	const spec = E.targetSpec(st, 0, card);
	ok("Karn's Touch asks for a target", !!spec && spec.targets === 'friendly-creature' && spec.required, JSON.stringify(spec));
}
// no artifact/enchantment: +2/+2
{
	const st = game();
	const bear = put(st, 0, 'bear', 2, 2);
	const card = hand(st, 0, 'karn_touch');
	E.playCard(st, 0, card.uid, tgt(bear));
	ok("Karn's Touch without an artifact gives +2/+2", bear.attack === 4 && bear.maxHealth === 4 && !bear.keywords.includes('divine_shield'), [bear.attack, bear.maxHealth, bear.keywords]);
}
// with an artifact: +4/+4 and Divine Shield
{
	const st = game();
	const bear = put(st, 0, 'bear', 2, 2);
	const artDef = Object.values(cardsById).find(c => c.type === 'artifact' && !c.effects?.length && !c.ongoing);
	const art = E.instantiate(artDef, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art);
	const card = hand(st, 0, 'karn_touch');
	E.playCard(st, 0, card.uid, tgt(bear));
	ok("Karn's Touch with an artifact gives +4/+4 and Divine Shield", bear.attack === 6 && bear.maxHealth === 6 && bear.keywords.includes('divine_shield'), [bear.attack, bear.maxHealth, bear.keywords, artDef?.id]);
}
// the siblings now ask for a target too
for (const id of ['chandra_fury', 'chandra_fury_ii', 'sylvanas_triumph', 'wicked_stab_rank_1', 'go_with_the_flow', 'sensory_deprivation']) {
	const st = game();
	put(st, 0, 'mine', 2, 2); put(st, 1, 'theirs', 2, 2);
	const card = hand(st, 0, id);
	ok(`${id} asks for a target`, !!E.targetSpec(st, 0, card), id);
}

// ---------- Tribute Dance: a second choice, then the transform ----------
{
	const st = game();
	const small = put(st, 0, 'Squire', 1, 1);
	const big = put(st, 1, 'Ogre', 6, 7);
	const other = put(st, 1, 'Gnoll', 2, 2);
	const card = hand(st, 0, 'tribute_dance');
	const spec = E.targetSpec(st, 0, card);
	ok('Tribute Dance asks for its first creature', !!spec && spec.targets === 'creature', JSON.stringify(spec));
	E.playCard(st, 0, card.uid, tgt(small));
	const pick = st.pickQueue[0];
	ok('it then asks for a DIFFERENT creature to become', !!pick && pick.mode === 'transform-into' && pick.ids.length === 2 && !pick.ids.includes(small.uid), JSON.stringify(pick));
	E.resolvePick(st, big.uid);
	const now = st.players[0].board[0];
	ok('the chosen creature becomes a copy of the second', now && now.name === 'Ogre' && now.attack === 6 && now.maxHealth === 7 && now.controller === 0, now && [now.name, now.attack, now.maxHealth, now.controller]);
	ok('the original is gone and the model is untouched', small.zone === 'gone' && st.players[1].board.includes(big) && st.players[1].board.includes(other));
}
// exactly one other creature: no prompt, transforms straight away
{
	const st = game();
	const small = put(st, 0, 'Squire', 1, 1);
	put(st, 1, 'Ogre', 6, 7);
	const card = hand(st, 0, 'tribute_dance');
	E.playCard(st, 0, card.uid, tgt(small));
	ok('with one other creature it transforms without a prompt', st.pickQueue.length === 0 && st.players[0].board[0]?.name === 'Ogre', st.players[0].board[0]?.name);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
