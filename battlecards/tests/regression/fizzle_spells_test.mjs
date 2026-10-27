// Fizzle sweep 2026-10-27 — Battlecards spells that paid their mana and did nothing
// (or only their first half). PR #813 left eight that each needed a new mechanism:
//   Soul Searching, Blood Clone, Paleomancy   "Spend 5 Corpses to copy it / keep all 3" —
//                                              the rider had only a TRIGGER handler
//   Story of Umbra                             "...and trigger its Deathrattle" (same)
//   Lunar Visions, Fast Forward                "creatures drawn / pick one drawn cost (2) less"
//   Shadow of Demise                           transform in hand into each spell you cast
//   Chemical Spill                             "...then deal 5 damage to it"
// Re-running the audit by FIRING every collectible spell (not just reading its effect
// types) found the rest of the class:
//   - "Destroy all enemy creatures" (Fell the Mighty, Vanquish the Horde; Thanos's
//     battlecry): `destroy` read only a chosen creature, and these never ask for one
//   - 25 single-target spells whose handler acts on the chosen creature but whose
//     effect kind had no target prompt (Piercing Shot, Death Roll, Funhouse Mirror,
//     Earthen Scales, Purify, ...): they resolved on a null target
//   - Soul Mirror only ever copied one (unchosen) creature; Cursed Campaign gave the
//     Deathrattle to the whole board; Unstable Shadow Blast's excess hit the enemy
// Plus two guards so the class can't come back: every collectible spell's effects
// resolve through a real handler, and every single-target one asks for its target.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { getEffectHandler, getTriggerHandler } from '../../engine/effects/registry.js';
import { damageCreature } from '../../engine/damage.js';

const warns = [];
console.warn = (...a) => { warns.push(a.join(' ')); };

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
const D = (id, o) => { byId[id] = { id, name: id, rarity: 'common', cardClass: 'neutral', description: 'test', ...o }; };
D('_bear', { type: 'creature', cost: 2, attack: 2, health: 2 });
D('_ogre', { type: 'creature', cost: 6, attack: 1, health: 9 });
D('_five', { type: 'creature', cost: 5, attack: 5, health: 5 });
D('_ghoul', { type: 'creature', cost: 1, attack: 1, health: 1, tribe: 'Undead' });
D('_brute', { type: 'creature', cost: 4, attack: 4, health: 4 });
D('_rattle', { type: 'creature', cost: 6, attack: 3, health: 3, keywords: ['deathrattle'], deathrattle: [{ type: 'armor', value: 7 }] });
D('_beastA', { type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Beast' });
D('_axe', { type: 'weapon', cost: 2, attack: 3, durability: 2 });
D('_bolt', { type: 'sorcery', cost: 1, effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] });
D('_mend', { type: 'sorcery', cost: 1, effects: [{ type: 'armor', value: 1 }] });
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL', l, x ?? ''); } };
// a block that throws on the old engine counts as one failure, never a crash
const block = (name, fn) => { try { fn(); } catch (e) { fail++; console.log('FAIL', name, 'threw:', e.message); } };

function fresh(seed = 1027) {
	const st = E.createGame(byId, seededRng(seed), null, 2, [{ id: 'warrior', name: 'A', power: null }, { id: 'warrior', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.board = []; p.artifacts = []; p.enchantments = []; p.secrets = []; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; p.life = 30; p.armor = 0; p.corpses = 0; p.deck = Array(20).fill('_bear'); }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const tc = c => ({ type: 'creature', uid: c.uid, player: c.controller });
const play = (st, pi, id, target) => { const c = give(st, pi, id); const r = E.playCard(st, pi, c.uid, target || null, null, null); E.sweepDeaths(st); return { r, c }; };
const alive = (st, pi, id) => st.players[pi].board.filter(c => c.id === id && !E.isDead(c));
const handIds = (st, pi) => st.players[pi].hand.map(c => c.id);
const toNextTurnOf = (st, pi) => { do { E.endTurn(st); } while (st.current !== pi); };

// ---------- Soul Searching: Discover from your deck; 5 Corpses copy it ----------
block('Soul Searching', () => {
	const st = fresh(); const p = st.players[0];
	p.deck = ['_mend', '_ogre']; p.corpses = 5;
	play(st, 0, 'soul_searching');
	const pend = st.pickQueue[0];
	ok('Soul Searching offers cards from your deck (spells too: "a card")', pend && pend.ids.includes('_ogre') && pend.ids.includes('_mend'), pend && pend.ids);
	ok('...and spends the 5 Corpses', p.corpses === 0, p.corpses);
	E.resolvePick(st, '_ogre');
	ok('...the pick AND a copy of it reach your hand', handIds(st, 0).filter(x => x === '_ogre').length === 2, handIds(st, 0));
	const st2 = fresh(); st2.players[0].deck = ['_ogre']; st2.players[0].corpses = 4;
	play(st2, 0, 'soul_searching'); E.resolvePick(st2, '_ogre');
	ok('...with 4 Corpses: only the pick, no copy, Corpses kept', handIds(st2, 0).filter(x => x === '_ogre').length === 1 && st2.players[0].corpses === 4, handIds(st2, 0));
});

// ---------- Blood Clone: Discover a 5-Cost creature; 5 Corpses create a token copy ----------
block('Blood Clone', () => {
	const st = fresh(); const p = st.players[0]; p.corpses = 6;
	play(st, 0, 'blood_clone');
	const pend = st.pickQueue[0];
	ok('Blood Clone offers 5-Cost creatures', pend && pend.ids.every(id => byId[id].type === 'creature' && byId[id].cost === 5), pend && pend.ids);
	const pick = pend.ids[0];
	E.resolvePick(st, pick);
	const copies = p.board.filter(c => c.id === pick);
	ok('...the pick goes to hand', handIds(st, 0).includes(pick));
	ok('...and a TOKEN copy of it is created on the battlefield', copies.length === 1 && copies[0].token === true, copies.map(c => [c.id, c.token]));
	ok('...for 5 Corpses', p.corpses === 1, p.corpses);
	const st2 = fresh(); st2.players[0].corpses = 0;
	play(st2, 0, 'blood_clone'); E.resolvePick(st2, st2.pickQueue[0].ids[0]);
	ok('...without the Corpses: no token', st2.players[0].board.length === 0);
});

// ---------- Paleomancy: Discover an Undead; 5 Corpses keep all 3 ----------
block('Paleomancy', () => {
	const st = fresh(); const p = st.players[0]; p.corpses = 5;
	play(st, 0, 'paleomancy');
	const ids = [...st.pickQueue[0].ids];
	ok('Paleomancy offers three Undead', ids.length === 3 && ids.every(id => (byId[id].tribe || '').includes('Undead')), ids);
	E.resolvePick(st, ids[1]);
	ok('...with 5 Corpses you keep all three', ids.every(id => handIds(st, 0).includes(id)) && p.hand.length === 3, handIds(st, 0));
	const st2 = fresh();
	play(st2, 0, 'paleomancy'); const ids2 = [...st2.pickQueue[0].ids]; E.resolvePick(st2, ids2[0]);
	ok('...without them, just the one', st2.players[0].hand.length === 1 && handIds(st2, 0)[0] === ids2[0]);
});

// ---------- Story of Umbra: summon the Discovered Deathrattle creature, trigger its Deathrattle ----------
block('Story of Umbra', () => {
	const st = fresh(); const p = st.players[0];
	play(st, 0, 'story_of_umbra');
	const pend = st.pickQueue[0];
	ok('Story of Umbra offers Deathrattle creatures costing 5+', pend && pend.ids.every(id => byId[id].cost >= 5 && (byId[id].keywords || []).includes('deathrattle')), pend && pend.ids);
	pend.ids[0] = '_rattle'; // pin the offer to a known Deathrattle (Deathrattle: gain 7 Armor)
	E.resolvePick(st, '_rattle');
	ok('...it goes onto the battlefield', alive(st, 0, '_rattle').length === 1);
	ok('...and its Deathrattle fires (gain 7 Armor) while it lives', p.armor === 7, p.armor);
});

// ---------- Lunar Visions: draw 2; creatures drawn cost (2) less ----------
block('Lunar Visions', () => {
	const st = fresh(); const p = st.players[0];
	p.deck = ['_bear', '_mend', '_ogre']; // draws pop from the end: _ogre, then _mend
	play(st, 0, 'lunar_visions');
	const ogre = p.hand.find(c => c.id === '_ogre'), mend = p.hand.find(c => c.id === '_mend');
	ok('Lunar Visions draws 2', p.hand.length === 2 && ogre && mend, handIds(st, 0));
	ok('...the drawn creature costs (2) less', ogre && ogre.cost === 4, ogre && ogre.cost);
	ok('...the drawn spell does not', mend && mend.cost === 1, mend && mend.cost);
	const held = give(st, 0, '_five');
	ok('...cards already in hand are untouched', held.cost === 5);
});

// ---------- Fast Forward: draw 2; pick one to cost (2) less ----------
block('Fast Forward', () => {
	const st = fresh(); const p = st.players[0];
	p.deck = ['_bear', '_five', '_ogre'];
	play(st, 0, 'fast_forward');
	const pend = st.pickQueue[0];
	ok('Fast Forward draws 2 and asks which one gets cheaper', p.hand.length === 2 && pend && pend.ids.length === 2 && pend.ids.includes('_ogre') && pend.ids.includes('_five'), pend && pend.ids);
	E.resolvePick(st, '_five');
	const five = p.hand.find(c => c.id === '_five'), ogre = p.hand.find(c => c.id === '_ogre');
	ok('...the picked card costs (2) less, the other is unchanged', five.cost === 3 && ogre.cost === 6, `${five.cost} ${ogre.cost}`);
	const st2 = fresh(); st2.players[0].deck = ['_ogre', '_ogre'];
	play(st2, 0, 'fast_forward'); E.resolvePick(st2, '_ogre');
	ok('...two copies of one card: exactly one is reduced', st2.players[0].hand.map(c => c.cost).sort().join() === '4,6', st2.players[0].hand.map(c => c.cost));
});

// ---------- Shadow of Demise: while held, becomes a copy of each spell you cast ----------
block('Shadow of Demise', () => {
	const st = fresh(); const p = st.players[0];
	const sh = give(st, 0, 'shadow_of_demise');
	play(st, 0, '_bolt');
	const now = p.hand.find(c => c.uid === sh.uid);
	ok('Shadow of Demise: casting a spell transforms it into a copy of that spell', now && now.id === '_bolt', now && now.id);
	play(st, 0, '_mend');
	const again = p.hand.find(c => c.uid === sh.uid);
	ok('...and it keeps transforming with the next spell', again && again.id === '_mend', again && again.id);
	const life = st.players[1].life;
	play(st, 0, '_bolt');
	const third = p.hand.find(c => c.uid === sh.uid);
	E.playCard(st, 0, third.uid, null, null, null);
	ok('...the copy plays as that spell', st.players[1].life === life - 4, `${life} -> ${st.players[1].life}`);
	const st2 = fresh(); const s2 = give(st2, 0, 'shadow_of_demise'); put(st2, 0, '_bear');
	E.playCard(st2, 0, s2.uid, null, null, null);
	ok('...casting the Shadow itself does nothing', st2.players[0].board.length === 1 && st2.players[1].life === 30);
});

// ---------- Chemical Spill: the highest Cost creature from hand comes in, then takes 5 ----------
block('Chemical Spill', () => {
	const st = fresh(); const p = st.players[0];
	give(st, 0, '_bear'); give(st, 0, '_ogre'); give(st, 0, '_five');
	play(st, 0, 'chemical_spill');
	const ogre = alive(st, 0, '_ogre')[0];
	ok('Chemical Spill puts the HIGHEST Cost creature from your hand onto the battlefield', ogre && p.board.length === 1, p.board.map(c => c.id));
	ok('...then deals 5 damage to it', ogre && ogre.damage === 5, ogre && ogre.damage);
	ok('...the rest stay in hand', handIds(st, 0).sort().join() === '_bear,_five', handIds(st, 0));
});

// ---------- mass destroy: Fell the Mighty / Vanquish the Horde / Thanos ----------
block('mass destroy', () => {
	for (const id of ['ltc_fell_the_mighty', 'mv_treasure_vanquish_the_horde']) {
		const st = fresh(); put(st, 1, '_ogre'); put(st, 1, '_bear'); const mine = put(st, 0, '_bear');
		play(st, 0, id);
		ok(`${byId[id].name} destroys all enemy creatures`, st.players[1].board.length === 0, st.players[1].board.map(c => c.id));
		ok('...and spares yours', st.players[0].board.includes(mine) && !E.isDead(mine));
	}
	const st = fresh(); const big = put(st, 1, '_brute'); put(st, 1, '_bear'); put(st, 0, '_bear');
	play(st, 0, 'mv_e_thanos_1');
	ok('Thanos: destroys every creature with 3 or less Attack, both sides', st.players[1].board.length === 1 && st.players[1].board[0] === big && alive(st, 0, '_bear').length === 0 && alive(st, 0, 'mv_e_thanos_1').length === 1, st.players.map(pl => pl.board.map(c => c.id)));
});

// ---------- single-target spells that never asked for their target ----------
// each: the target the prompt must offer, and what firing it on that target must do
const fired = (id, setup, check, want) => block(id, () => {
	const st = fresh();
	const t = setup(st);
	const c = give(st, 0, id);
	const spec = E.targetSpec(st, 0, c);
	const legal = spec ? E.legalTargets(st, 0, spec) : [];
	ok(`${byId[id].name}: asks for ${want}`, !!spec && legal.some(x => x.uid === t.uid), spec && spec.targets);
	E.playCard(st, 0, c.uid, tc(t), null, null);
	E.sweepDeaths(st);
	ok(`${byId[id].name}: fires on it`, check(st, t), `damage=${t.damage} atk=${t.attack} hp=${t.maxHealth}`);
});
const foe = id => st => put(st, 1, id || '_ogre');
const mine = id => st => put(st, 0, id || '_bear');
fired('piercing_shot', foe('_bear'), (st, t) => E.isDead(t) && st.players[1].life === 26, 'a creature (excess to the enemy)');
fired('unstable_shadow_blast', foe('_bear'), (st, t) => E.isDead(t) && st.players[0].life === 26 && st.players[1].life === 30, 'a creature (excess to YOUR hero)');
fired('death_roll', st => { put(st, 1, '_ogre'); return put(st, 1, '_brute'); }, (st, t) => E.isDead(t) && st.players[1].board[0].damage === 4, 'an enemy creature');
fired('invasive_shadeleaf', foe('_bear'), (st, t) => E.isDead(t) && st.players[0].hand.some(c => c.name === 'Bottle'), 'an enemy creature');
fired('funhouse_mirror', foe('_brute'), (st, t) => E.isDead(t) && alive(st, 0, '_brute').length === 0, 'an enemy creature');
fired('embrace_darkness', foe('_bear'), (st, t) => { toNextTurnOf(st, 0); return st.players[0].board.includes(t); }, 'an enemy creature');
fired('earthen_scales', mine('_bear'), (st, t) => t.attack === 3 && st.players[0].armor === 3, 'a friendly creature');
fired('shadow_of_death', foe('_ogre'), (st) => st.players[0].deck.filter(x => x === 'shadow_of__ogre').length === 3, 'a creature');
fired('smoldering_strength', mine('_bear'), (st, t) => t.attack === 3 && t.maxHealth === 3, 'a friendly creature');
fired('ready_the_fleet', st => { put(st, 0, '_beastA'); return put(st, 0, '_beastA'); }, (st, t) => st.players[0].board.every(c => c.attack === 3 && c.maxHealth === 4), 'a friendly creature');
fired('forbidden_words', foe('_ogre'), (st, t) => E.isDead(t) && E.availableMana(st.players[0]) === 0, 'a creature');
fired('doomerang', st => { const w = E.instantiate(byId._axe, 0); w.zone = 'weapon'; st.players[0].weapon = w; return put(st, 1, '_ogre'); }, (st, t) => t.damage === 3 && st.players[0].hand.some(c => c.id === '_axe'), 'a creature');
fired('conjurers_calling', foe('_ogre'), (st, t) => E.isDead(t) && st.players[1].board.filter(c => !E.isDead(c)).length === 2, 'a creature');
fired('imp_losion', foe('_ogre'), (st, t) => t.damage >= 2 && st.players[0].board.length === t.damage, 'a creature');
fired('synchronized_spark', foe('_ogre'), (st, t) => t.damage === 3, 'an enemy creature');
fired('ysnc_shattering_finale', foe('_brute'), (st, t) => t.maxHealth === 1, 'an enemy creature');
fired('power_word_glory', mine('_bear'), (st, t) => !!t.ongoing && t.ongoing.on === 'self-attacks', 'a creature');
fired('sinful_brand', foe('_ogre'), (st, t) => { damageCreature(st, t, 1, null); return st.players[1].life === 29; }, 'an enemy creature');
fired('shattered_reflections', foe('_brute'), (st) => st.players[0].hand.some(c => c.id === '_brute') && st.players[0].deck.includes('_brute') && alive(st, 0, '_brute').length === 1, 'a creature');
fired('adaptation', mine('_bear'), (st) => st.pickQueue.some(q => q.mode === 'adapt'), 'a creature');
fired('purify', st => { const b = put(st, 0, '_rattle'); return b; }, (st, t) => !t.deathrattle || !t.deathrattle.length, 'a friendly creature');
fired('whispers_of_the_deep', st => { put(st, 1, '_ogre'); return put(st, 0, '_brute'); }, (st) => st.players[1].board[0].damage === 4, 'a friendly creature');
fired('lightning_rod', st => { put(st, 1, '_ogre'); return put(st, 0, '_ogre'); }, (st, t) => t.damage === 2 && st.players[1].board[0].damage === 4, 'a friendly creature');
fired('dark_possession', mine('_ogre'), (st, t) => t.damage === 2, 'a friendly character');
fired('cursed_campaign', st => { put(st, 0, '_bear'); return put(st, 0, '_ogre'); }, (st, t) => (t.deathrattle || []).length === 1 && !(st.players[0].board[0].deathrattle || []).length, 'a friendly creature (only that one)');

// a creature battlecry that shared one of the new prompts: Crackling Razormaw "Adapt a friendly Beast"
block('Crackling Razormaw', () => {
	const st = fresh(); const beast = put(st, 0, '_beastA'); put(st, 0, '_bear'); put(st, 1, '_beastA');
	const r = give(st, 0, 'crackling_razormaw');
	const spec = E.targetSpec(st, 0, r);
	const legal = spec ? E.legalTargets(st, 0, spec).map(t => t.uid) : [];
	ok('Crackling Razormaw offers only your other Beasts', legal.length === 1 && legal[0] === beast.uid, legal);
	E.playCard(st, 0, r.uid, tc(beast), null, null);
	ok('...and Adapts the chosen one', st.pickQueue.some(q => q.mode === 'adapt' && (q.adaptUids || []).includes(beast.uid)), JSON.stringify(st.pickQueue.map(q => q.adaptUids)));
});
// Soul Mirror: EVERY enemy creature gets a copy, which attacks its original
block('Soul Mirror', () => {
	const st = fresh(); const a = put(st, 1, '_brute'), b = put(st, 1, '_bear');
	play(st, 0, 'soul_mirror');
	ok('Soul Mirror: every enemy creature is copied and the copies attack their originals', E.isDead(a) && E.isDead(b) || (!st.players[1].board.includes(a) && !st.players[1].board.includes(b)), st.players.map(pl => pl.board.map(c => c.id + ':' + c.damage)));
});

// ---------- the "Lasts 3 turns" spells that were only an `ongoing` (a cast spell never installs one) ----------
block('timed auras', () => {
	const turns = (st, n, each) => { for (let k = 0; k < n; k++) { toNextTurnOf(st, 0); each && each(k); } };
	{
		const st = fresh(); play(st, 0, 'crafters_aura');
		ok("Crafter's Aura is in play after casting", st.players[0].enchantments.some(en => en.name === "Crafter's Aura"));
		E.endTurn(st);
		const made = st.players[0].board.filter(c => c.cost === 6);
		ok('...at the end of your turn: a random 6-Cost creature', made.length === 1, st.players[0].board.map(c => c.id));
		turns(st, 2, () => E.endTurn(st));
		ok('...three turns, then it is gone', st.players[0].board.filter(c => c.cost === 6).length === 3 && !st.players[0].enchantments.some(en => en.name === "Crafter's Aura"), st.players[0].board.length);
	}
	{
		const st = fresh(); st.players[0].deck = ['_bolt', '_bear', '_bear', '_bear'];
		play(st, 0, 'iceblood_tower'); E.endTurn(st);
		ok('Iceblood Tower: at the end of your turn, casts a spell from your deck', st.players[1].life === 28 && !st.players[0].deck.includes('_bolt'), st.players[1].life);
	}
	{
		const st = fresh(); play(st, 0, 'lifesaving_aura'); E.endTurn(st);
		ok('Lifesaving Aura: at the end of your turn, get a Sunscreen', handIds(st, 0).includes('sunscreen'), handIds(st, 0));
	}
	{
		const st = fresh(); const lo = put(st, 0, '_ghoul'); put(st, 0, '_brute');
		play(st, 0, 'desecrated_graveyard'); E.endTurn(st);
		ok('Desecrated Graveyard: destroys your lowest-Attack creature for a 4/4 Shade', E.isDead(lo) || !st.players[0].board.includes(lo), st.players[0].board.map(c => c.name));
		ok('...the Shade arrives, the other creature stays', st.players[0].board.some(c => c.name === 'Shade' && c.attack === 4) && alive(st, 0, '_brute').length === 1);
		const st2 = fresh(); play(st2, 0, 'desecrated_graveyard'); E.endTurn(st2);
		ok('...with no creature to destroy, no Shade', st2.players[0].board.length === 0);
	}
});

// ---------- guard 1: every collectible spell's effects resolve through a real handler ----------
// (the 8 above had trigger-only types; a spell type with NO handler at all is a silent no-op
// in production). Nested `ongoing` lists run on the trigger path, so either handler counts.
const collectible = d => d.type !== 'land' && !(d.colors && d.colors.length) && !d.companion && !d.commander && !d.token;
const isSpell = d => d.type === 'sorcery' || d.type === 'instant';
const CARD_TYPES = new Set(['creature', 'sorcery', 'instant', 'weapon', 'land', 'artifact', 'enchantment', 'secret', 'trap', 'location', 'heropower', 'hero', 'quest', 'planeswalker', 'spell', 'token', 'any', 'all']);
{
	const dead = [];
	const walk = (node, trig, where, id) => {
		if (Array.isArray(node)) { for (const x of node) walk(x, trig, where, id); return; }
		if (!node || typeof node !== 'object') return;
		if (typeof node.type === 'string' && !CARD_TYPES.has(node.type) && !(getEffectHandler(node.type) || (trig && getTriggerHandler(node.type)))) dead.push(`${id}: ${where} ${node.type}`);
		for (const [k, v] of Object.entries(node)) if (v && typeof v === 'object') walk(v, trig || k === 'ongoing' || k === 'ongoings' || k === 'aura', where, id);
	};
	let n = 0;
	for (const d of raw.cards) {
		if (!isSpell(d) || !collectible(d)) continue;
		n++;
		for (const k of ['effects', 'choices', 'combo', 'kicker', 'outcast', 'ongoing']) if (d[k] && typeof d[k] === 'object') walk(d[k], k === 'ongoing', k, d.id);
	}
	ok(`guard: all ${n} collectible spells resolve through real handlers (no no-op effect types)`, n > 1500 && dead.length === 0, dead.slice(0, 12).join(' | '));
	// and every one does SOMETHING when cast or held: effects, modes, a combo line, or a hand mechanic
	const HAND_MECHANICS = ['transformInHand', 'transformOnSpellCast', 'handTransform', 'handTransformOnSchool', 'handTransformOnTwoSchools', 'castOnDiscard'];
	const LEGACY = new Set(['wandering_merchant', 'legion_commander', 'pack_wolf', 'contract_killer', 'tumbleweed_tactician', 'natures_blessing', 'fortify', 'rallying_cry', 'wild_growth', 'mark_target', 'regroup']); // core.js LEGACY_SCRIPTED: hand-coded by id
	const inert = raw.cards.filter(d => isSpell(d) && collectible(d) && !LEGACY.has(d.id)
		&& !(d.effects && d.effects.length) && !(d.choices && d.choices.length) && !d.combo && !d.counterSpell // a spell's own `ongoing` is never installed
		&& !HAND_MECHANICS.some(k => d[k])).map(d => d.id);
	ok('guard: no collectible spell is inert (nothing on cast, nothing while held)', inert.length === 0, inert.join(' '));
}

// ---------- guard 2: a single-target effect on a spell must ask for its target ----------
// (Piercing Shot & co.: the handler acts on the chosen creature, the prompt never came)
{
	const SINGLE = new Set(['creature', 'enemy-creature', 'friendly-creature', 'any', 'enemy-any', 'friendly-any']);
	// heal 'friendly-any' falls back to your own hero ("Gain 4 Life") — it never fizzles
	const FALLBACK_OK = new Set(['holy_embrace']);
	const st = fresh(); put(st, 0, '_bear').damage = 1; put(st, 1, '_bear').damage = 1;
	const silent = [];
	for (const d of raw.cards) {
		if (!isSpell(d) || !collectible(d) || FALLBACK_OK.has(d.id)) continue;
		const lists = d.choices ? d.choices.map((c, i) => [i, c.effects || []]) : [[null, d.effects || []]];
		for (const [ch, effs] of lists) {
			const reads = effs.filter(e => SINGLE.has(e.target) && getEffectHandler(e.type) && /chosenCreature\(\)/.test(getEffectHandler(e.type).toString()));
			if (reads.length && !E.targetSpec(st, 0, E.instantiate(d, 0), ch)) silent.push(`${d.id}(${reads.map(e => e.type + ':' + e.target).join(',')})`);
		}
	}
	ok('guard: every collectible spell with a single-target effect asks for its target', silent.length === 0, silent.slice(0, 15).join(' '));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
