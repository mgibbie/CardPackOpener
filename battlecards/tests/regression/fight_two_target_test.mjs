// fight_two_target_test.mjs — "X fights Y" must actually fight.
//
// Reported from a replay: Garruk's Wrath gave its +3/+3 but the FIGHT half did
// nothing. The fight handler reads TWO targets — the chosen fighter and
// `target.fightTarget` — and the second pick is only collected when the CARD
// carries `fight: true` (game.js gates its follow-up step on pending.card.fight).
// Only prey_upon had the flag, so ten cards silently skipped their fight:
// omen_of_nylea, trial_of_rhonas, gruul_ragebeast, calix_servant_of_klothys,
// garruk_wrath, nissa_defeat, nissa_judgement, vivian_hunt, vorinclex_hostility
// and fight_over_me. The AI never set fightTarget either, so an AI-played fight
// card no-opped on both sides of the table.
import fs from 'fs';
import * as E from '../../engine.js';
import * as AI from '../../ai.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._mine = { id: '_mine', name: 'Mine', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common' };
byId._foe = { id: '_foe', name: 'Foe', type: 'creature', cost: 2, attack: 3, health: 7, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

const effectsOf = c => { const out = []; (function w(v) { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) { v.forEach(w); return; } if (v.type) out.push(v); for (const k in v) if (typeof v[k] === 'object') w(v[k]); })(c); return out; };

function fresh() {
	const st = E.createGame(byId, seededRng(74), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- every two-target fight card carries the flag the second pick depends on ----
{
	const fightCards = raw.cards.filter(c => effectsOf(c).some(e => e.type === 'fight'));
	ok('the set still has fight cards', fightCards.length >= 10, fightCards.length);
	const twoTarget = fightCards.filter(c => !effectsOf(c).filter(e => e.type === 'fight').every(e => e.selfFights));
	const missing = twoTarget.filter(c => !c.fight).map(c => c.id);
	ok('EVERY two-target fight card declares fight:true', missing.length === 0, missing.join(','));
	// self-fighting cards are the exception: the source is the fighter, one pick is enough
	const selfOnly = fightCards.filter(c => effectsOf(c).filter(e => e.type === 'fight').every(e => e.selfFights));
	ok('selfFights cards stay single-target (no flag needed)', selfOnly.every(c => !c.fight), selfOnly.filter(c => c.fight).map(c => c.id).join(','));
	ok('the reported card is covered', byId.garruk_wrath.fight === true);
}

// ---- Garruk's Wrath: the buff AND the fight both land ----
{
	const c = byId.garruk_wrath;
	ok('its first pick is restricted to YOUR creature', effectsOf(c).find(e => e.type === 'buff').target === 'friendly-creature', JSON.stringify(c.effects[0]));
	const st = fresh();
	const mine = put(st, 0, byId._mine);   // 2/6
	const foe = put(st, 1, byId._foe);     // 3/7
	const card = E.instantiate(c, 0); card.zone = 'hand'; card.cost = 0; st.players[0].hand.push(card);
	// the fused target the UI builds after both picks
	E.playCard(st, 0, card.uid, { type: 'creature', uid: mine.uid, player: 0, fightTarget: foe.uid, fightTargetPlayer: 1 }, null, 0);
	ok('the +3/+3 landed (2/6 -> 5/9)', mine.attack === 5 && mine.maxHealth === 9, [mine.attack, mine.maxHealth].join('/'));
	ok('the FIGHT happened: the foe took the buffed 5 damage', foe.damage === 5, foe.damage);
	ok('...and our creature took the foe\'s 3 back', mine.damage === 3, mine.damage);
	ok('the buff resolves BEFORE the fight (5 damage, not 2)', foe.damage === 5 && foe.damage !== 2);
}

// ---- a plain fight card (no buff) still works ----
{
	const st = fresh();
	const mine = put(st, 0, byId._mine);
	const foe = put(st, 1, byId._foe);
	const card = E.instantiate(byId.omen_of_nylea, 0); card.zone = 'hand'; card.cost = 0; st.players[0].hand.push(card);
	E.playCard(st, 0, card.uid, { type: 'creature', uid: mine.uid, player: 0, fightTarget: foe.uid, fightTargetPlayer: 1 }, null, 0);
	ok('Omen of Nylea trades damage both ways', foe.damage === 2 && mine.damage === 3, [foe.damage, mine.damage].join('/'));
}

// ---- without a second target the fight is a no-op (the bug, pinned) ----
{
	const st = fresh();
	const mine = put(st, 0, byId._mine);
	const foe = put(st, 1, byId._foe);
	E.execEffects(st, 0, [{ type: 'fight', target: 'friendly-creature' }], { type: 'creature', uid: mine.uid, player: 0 }, null);
	ok('a fight with no fightTarget harms nobody (why the flag matters)', foe.damage === 0 && mine.damage === 0, [foe.damage, mine.damage].join('/'));
}

// ---- the AI fuses both targets too ----
{
	const st = fresh();
	const mine = put(st, 0, byId._mine);
	const foe = put(st, 1, byId._foe);
	const card = E.instantiate(byId.garruk_wrath, 0); card.zone = 'hand'; st.players[0].hand.push(card);
	const t = AI.pickTarget(st, 0, card);
	ok('the AI picks a fighter AND a foe', !!t && t.uid === mine.uid && t.fightTarget === foe.uid, JSON.stringify(t));
	ok('it names the foe\'s controller', t && t.fightTargetPlayer === 1, t && t.fightTargetPlayer);
	// and playing with that target really fights
	card.cost = 0;
	E.playCard(st, 0, card.uid, t, null, 0);
	ok('an AI-played Wrath deals its buffed damage', foe.damage === 5, foe.damage);
	// with no enemy creature there is nothing to fight — don't offer a broken play
	const st2 = fresh();
	put(st2, 0, byId._mine);
	const card2 = E.instantiate(byId.garruk_wrath, 0); card2.zone = 'hand'; st2.players[0].hand.push(card2);
	ok('with no enemy creature the AI declines the target', AI.pickTarget(st2, 0, card2) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
