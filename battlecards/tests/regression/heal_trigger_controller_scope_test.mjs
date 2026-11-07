// "Whenever you gain Life" / "Whenever you restore Health" trigger only for their
// CONTROLLER's healing (bug:1793819722112 + follow-up 1793820461550: the enemy's
// Sorin's Sorrowbringer grew off the player's lifesteal; bug:1793987150475:
// Sauron's Sanguine Bond (me_sn_ench) pinged the player when the PLAYER healed).
// The 'healed' event is broadcast to every player's ongoings on purpose
// (Lightwarden: "a character is healed"), so the "you" cards carry a scoping
// condition: heroHealed (your hero gained Life) or friendlyHealed (your hero or
// one of your creatures was restored).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { healHero } from '../../engine/damage.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._grunt = { id: '_grunt', name: 'Grunt', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(77), null, 2,
		[{ id: 'priest', name: 'A', power: null }, { id: 'priest', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.enchantments = []; p.armor = 0; p.life = 20; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
function put(st, pi, id) {
	const c = E.instantiate(st.cardsById[id], pi); c.zone = 'board'; c.sick = false;
	st.players[pi].board.push(c); return c;
}
function ench(st, pi, id) {
	const c = E.instantiate(st.cardsById[id], pi); c.zone = 'enchantment';
	st.players[pi].enchantments.push(c); return c;
}

// 1) Sorrowbringer: the OPPONENT gaining life does nothing; its controller gaining life buffs once
{
	const st = fresh();
	const sb = put(st, 1, 'sorin_sorrowbringer');
	const a0 = sb.attack;
	healHero(st, 0, 2); // the player (seat 0) heals — e.g. Darkwood Alpha lifesteal
	ok('enemy Sorrowbringer ignores the player\'s lifegain', sb.attack === a0, sb.attack);
	healHero(st, 1, 3);
	ok('Sorrowbringer grows exactly +1/+1 on its controller\'s lifegain', sb.attack === a0 + 1, sb.attack);
}

// 2) every "Whenever you gain Life" card is scoped to its controller's hero
{
	const ids = raw.cards.filter(c => /whenever you gain life|every other time you gain life/i.test(c.description || '')
		&& [c.ongoing, ...(c.ongoings || [])].some(t => t && t.on === 'healed')).map(c => c.id);
	ok('found the "you gain Life" family (>=24)', ids.length >= 24, ids.length);
	const bad = ids.filter(id => {
		const t = [byId[id].ongoing, ...(byId[id].ongoings || [])].find(t => t && t.on === 'healed');
		return !(t.if && t.if.heroHealed);
	});
	ok('each carries if.heroHealed', bad.length === 0, bad.join(','));
	// behavioural sweep: the opponent's heal never fires them
	const fired = [];
	for (const id of ids) {
		const st = fresh();
		const c = byId[id].type === 'creature' ? put(st, 1, id) : ench(st, 1, id);
		let n = 0; const before = st.events.length;
		healHero(st, 0, 4);
		for (const ev of st.events.slice(before)) if (ev.type === 'ongoingTriggered' && ev.card === c) n++;
		if (n) fired.push(id);
	}
	ok('none fire on the opponent\'s lifegain', fired.length === 0, fired.join(','));
}

// 3) Sanguine Bond (me_sn_ench): the opponent restoring Health does NOT hurt the opponent; its controller's does
{
	const st = fresh();
	ench(st, 1, 'me_sn_ench');
	healHero(st, 0, 2);
	ok('Sanguine Bond ignores the opponent\'s heal (player keeps the +2)', st.players[0].life === 22, st.players[0].life);
	healHero(st, 1, 2);
	ok('Sanguine Bond fires on its controller\'s heal (2 to each opponent)', st.players[0].life === 20, st.players[0].life);
}

// 4) Fealty to the Realm (me_elrond_council2, "Whenever you restore Health"): own creature heals count, enemy ones don't
{
	const st = fresh();
	ench(st, 0, 'me_elrond_council2');
	const mine = put(st, 0, '_grunt');
	const theirs = put(st, 1, '_grunt'); theirs.damage = 2;
	E.execEffects(st, 1, [{ type: 'heal', target: 'any', value: 2 }], { type: 'creature', uid: theirs.uid }, null);
	ok('Fealty ignores the opponent restoring their own creature', mine.attack === 2, mine.attack);
	healHero(st, 1, 2);
	ok('Fealty ignores the opponent\'s hero heal', mine.attack === 2, mine.attack);
	healHero(st, 0, 2);
	ok('Fealty fires on your own hero heal', mine.attack === 3, mine.attack);
}

// 5) any-source cards still fire on BOTH players' heals (Lightwarden, Northshire Cleric)
{
	const st = fresh();
	const lw = put(st, 0, 'lightwarden');
	const a0 = lw.attack;
	healHero(st, 1, 2);
	ok('Lightwarden still grows when the OPPONENT heals', lw.attack === a0 + 2, lw.attack);
	const nc = put(st, 0, 'northshire_cleric');
	const theirs = put(st, 1, '_grunt'); theirs.damage = 2;
	const h0 = st.players[0].hand.length;
	st.players[0].deck = ['_grunt'];
	E.execEffects(st, 1, [{ type: 'heal', target: 'any', value: 2 }], { type: 'creature', uid: theirs.uid }, null);
	ok('Northshire Cleric still draws on an enemy creature heal', st.players[0].hand.length === h0 + 1, st.players[0].hand.length);
	void nc;
}

// 6) Screaming Banshee ("After your hero gains Health") only on its controller's hero
{
	const st = fresh();
	put(st, 1, 'screaming_banshee');
	healHero(st, 0, 3);
	ok('Banshee makes no Soul off the opponent\'s heal', st.players[1].board.length === 1, st.players[1].board.length);
	healHero(st, 1, 3);
	ok('Banshee makes a Soul off its controller\'s heal', st.players[1].board.length === 2, st.players[1].board.length);
}

// 7) a creature heal is not "gaining Life"
{
	const st = fresh();
	const pm = put(st, 0, 'ajani_pridemate'); const a0 = pm.attack;
	const g = put(st, 0, '_grunt'); g.damage = 2;
	E.execEffects(st, 0, [{ type: 'heal', target: 'any', value: 2 }], { type: 'creature', uid: g.uid }, null);
	ok('healing your creature does not count as gaining Life', pm.attack === a0, pm.attack);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
