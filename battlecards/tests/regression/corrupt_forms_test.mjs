// corrupt_forms_test.mjs — every Corrupt card actually corrupts.
//
// Report (2026-09-29): "Day at the Faire corrupt doesn't work". It had no
// `corrupt` link at all, so the engine never upgraded it; an audit found 7 more
// with Corrupt text and no link (Insight, Nitroboost Poison, Shadow Word:
// Forbid, Ring Toss, Auspicious Spirits, Moontouched Amulet, Dunk Tank) and 2
// whose link pointed at a card that did not exist (Don't Feed the Animals,
// Stage Dive). Each now has its corrupted form; this plays every one.
//
//   node battlecards/tests/regression/corrupt_forms_test.mjs
import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId['t_big'] = { id: 't_big', name: 'Big', type: 'sorcery', cost: 9, rarity: 'common', description: 'x', effects: [{ type: 'armor', value: 0 }] };
byId['t_four'] = { id: 't_four', name: 'Four', type: 'creature', cost: 4, attack: 4, health: 9, rarity: 'common', description: 'x' };
byId['t_rush'] = { id: 't_rush', name: 'Rusher', type: 'creature', cost: 5, attack: 3, health: 3, rarity: 'common', description: 'x', keywords: ['rush'] };
byId['t_beast'] = { id: 't_beast', name: 'Beastie', type: 'creature', cost: 2, attack: 1, health: 1, rarity: 'common', description: 'x', tribe: 'Beast' };
let pass = 0, fail = 0; const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

// ---- the whole pool: Corrupt text means a working corrupted form ----
{
	const noLink = raw.cards.filter(c => /(^|\n|\. )Corrupt:/.test(c.description || '') && !c.corrupt && !c.corruptGrow).map(c => c.id);
	const dangling = raw.cards.filter(c => c.corrupt && !byId[c.corrupt]).map(c => `${c.id}->${c.corrupt}`);
	ok('every card with Corrupt text has a corrupt link', noLink.length === 0, JSON.stringify(noLink));
	ok('every corrupt link resolves to a real card', dangling.length === 0, JSON.stringify(dangling));
}

function fresh() {
	const s = E.createGame(byId, () => 0.4, null, 2);
	for (const p of s.players) { p.board = []; p.hand = []; p.mana = { cur: 99, max: 99, bonus: 0 }; p.life = 40; p.armor = 0; }
	return s;
}
const give = (s, pi, id) => { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; };
const summon = (s, pi, id) => { const c = give(s, pi, id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; c.sick = false; s.players[pi].board.push(c); return c; };
// hold `id`, play a 9-cost card, and return the (hopefully corrupted) hand card
function corrupted(s, id) {
	give(s, 0, id);
	const big = give(s, 0, 't_big');
	E.playCard(s, 0, big.uid, null, null, 0);
	return s.players[0].hand.find(c => c.name === byId[id].name);
}
const cast = (s, card, target) => E.playCard(s, 0, card.uid, target || null, null, 0);

// Day at the Faire: 5 recruits
{
	const s = fresh(); const c = corrupted(s, 'day_at_the_faire');
	ok('Day at the Faire corrupts', c && c.id === 'day_at_the_faire_corrupted', c && c.id);
	cast(s, c);
	ok('...and creates 5 Silver Hand Recruits', s.players[0].board.filter(x => x.name === 'Silver Hand Recruit').length === 5, s.players[0].board.length);
	const s2 = fresh(); const u = give(s2, 0, 'day_at_the_faire'); cast(s2, u);
	ok('uncorrupted it still creates 3', s2.players[0].board.filter(x => x.name === 'Silver Hand Recruit').length === 3);
}
// Don't Feed the Animals: +2/+2 to hand Beasts
{
	const s = fresh(); const c = corrupted(s, 'dont_feed_the_animals');
	const b = give(s, 0, 't_beast');
	ok("Don't Feed the Animals corrupts", c && c.id === 'dont_feed_the_animals_corrupted', c && c.id);
	cast(s, c);
	ok('...and gives hand Beasts +2/+2', b.attack === 3 && b.maxHealth === 3, `${b.attack}/${b.maxHealth}`);
}
// Stage Dive: draw a Rush creature, +2/+1
{
	const s = fresh(); const c = corrupted(s, 'stage_dive');
	s.players[0].deck = ['t_rush'];
	ok('Stage Dive corrupts', c && c.id === 'stage_dive_corrupted', c && c.id);
	cast(s, c);
	const r = s.players[0].hand.find(x => x.id === 't_rush');
	ok('...and the drawn Rush creature has +2/+1', r && r.attack === 5 && r.maxHealth === 4, r && `${r.attack}/${r.maxHealth}`);
}
// Insight: the drawn creature costs 2 less
{
	const s = fresh(); const c = corrupted(s, 'insight');
	s.players[0].deck = ['t_four'];
	ok('Insight corrupts', c && c.id === 'insight_corrupted', c && c.id);
	cast(s, c);
	const r = s.players[0].hand.find(x => x.id === 't_four');
	ok('...and the drawn creature costs (2) less', r && r.cost === 2, r && r.cost);
}
// Nitroboost Poison: creature AND weapon +2 Attack
{
	const s = fresh(); const c = corrupted(s, 'nitroboost_poison');
	const m = summon(s, 0, 't_four');
	s.players[0].weapon = E.instantiate({ id: 't_axe', name: 'Axe', type: 'weapon', cost: 1, attack: 1, durability: 2, rarity: 'common', description: '' }, 0); s.players[0].weapon.zone = 'weapon';
	ok('Nitroboost Poison corrupts', c && c.id === 'nitroboost_poison_corrupted', c && c.id);
	cast(s, c, { type: 'creature', uid: m.uid, player: 0 });
	ok('...and both the creature and the weapon gain +2 Attack', m.attack === 6 && s.players[0].weapon.attack === 3, `${m.attack} / ${s.players[0].weapon.attack}`);
}
// Shadow Word: Forbid: every 4-Attack creature, and only those
{
	const s = fresh(); const c = corrupted(s, 'shadow_word_forbid');
	const a = summon(s, 1, 't_four'), b = summon(s, 1, 't_four'), mine = summon(s, 0, 't_four');
	const other = summon(s, 1, 't_rush');   // 3 Attack: survives
	ok('Shadow Word: Forbid corrupts', c && c.id === 'shadow_word_forbid_corrupted', c && c.id);
	cast(s, c);
	const alive = x => s.players[x.controller].board.includes(x) && !E.isDead(x);
	ok('...and destroys ALL 4-Attack creatures (both sides)', !alive(a) && !alive(b) && !alive(mine), JSON.stringify([alive(a), alive(b), alive(mine)]));
	ok('...and spares the rest', alive(other));
}
// Ring Toss: two Secrets
{
	const s = fresh(); const c = corrupted(s, 'ring_toss');
	ok('Ring Toss corrupts', c && c.id === 'ring_toss_corrupted', c && c.id);
	cast(s, c);
	ok('...and puts TWO Secrets into play', s.players[0].secrets.length === 2, s.players[0].secrets.length);
}
// Auspicious Spirits: a 7-Cost creature
{
	const s = fresh(); const c = corrupted(s, 'auspicious_spirits');
	ok('Auspicious Spirits corrupts', c && c.id === 'auspicious_spirits_corrupted', c && c.id);
	cast(s, c);
	const made = s.players[0].board[0];
	ok('...and creates a 7-Cost creature', made && made.cost === 7, made && `${made.name} (${made.cost})`);
}
// Moontouched Amulet: +4 Attack and 6 Armor
{
	const s = fresh(); const c = corrupted(s, 'moontouched_amulet');
	ok('Moontouched Amulet corrupts', c && c.id === 'moontouched_amulet_corrupted', c && c.id);
	cast(s, c);
	ok('...and gives +4 Attack and 6 Armor', s.players[0].heroTempAttack === 4 && s.players[0].armor === 6, `${s.players[0].heroTempAttack} / ${s.players[0].armor}`);
}
// Dunk Tank: 4 damage, then 2 to every enemy creature
{
	const s = fresh(); const c = corrupted(s, 'dunk_tank');
	const a = summon(s, 1, 't_four'), b = summon(s, 1, 't_four');
	ok('Dunk Tank corrupts', c && c.id === 'dunk_tank_corrupted', c && c.id);
	cast(s, c, { type: 'hero', player: 1 });
	ok('...and deals 4 to the target, then 2 to all enemy creatures', s.players[1].life === 36 && a.damage === 2 && b.damage === 2, `${s.players[1].life} ${a.damage} ${b.damage}`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
