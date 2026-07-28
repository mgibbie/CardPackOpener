import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Dark Gift discover: Creature of Madness -> discovered card carries a gift
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const cm = give(s, 0, 'creature_of_madness'); E.playCard(s, 0, cm.uid, null, null, 0);
  ok('madness opened discover', s.pickQueue.length > 0);
  if (s.pickQueue.length) {
    E.resolvePick(s, s.pickQueue[0].ids[0]);
    const got = s.players[0].hand[s.players[0].hand.length - 1];
    ok('discovered card carries a Dark Gift', !!got._darkGift);
    ok('gift visibly annotated', (got.description || '').includes('[Gift:'));
  }
}
// Shadowflame Stalker: discover + identical copy (same gift)
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const sf = give(s, 0, 'shadowflame_stalker'); E.playCard(s, 0, sf.uid, null, null, 0);
  if (s.pickQueue.length) {
    E.resolvePick(s, s.pickQueue[0].ids[0]);
    const gifted = s.players[0].hand.filter(x => x._darkGift);
    ok('stalker got 2 copies with the SAME gift', gifted.length === 2 && gifted[0].id === gifted[1].id && gifted[0]._darkGift === gifted[1]._darkGift);
  } else ok('stalker discover opened', false);
}
// Frostburn Matriarch: holding a gifted card -> 2 dragons
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const held = give(s, 0, 'bone_baron'); held._darkGift = '+3/+3';
  const fm = give(s, 0, 'frostburn_matriarch'); E.playCard(s, 0, fm.uid, null, null, 0);
  ok('matriarch summoned 2 taunt dragons', s.players[0].board.filter(x => x.id === 'fir_taunt_dragon').length === 2);
}
// Frostburn Matriarch: no gift held -> nothing
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  give(s, 0, 'bone_baron');
  const fm = give(s, 0, 'frostburn_matriarch'); E.playCard(s, 0, fm.uid, null, null, 0);
  ok('matriarch inert without a gifted card', !s.players[0].board.some(x => x.id === 'fir_taunt_dragon'));
}
// Overgrown Horror: reduces gifted hand minions by 2
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const g1 = give(s, 0, 'bone_baron'); g1._darkGift = 'Rush'; const c0 = g1.cost;
  const plain = give(s, 0, 'crypt_lord'); const p0 = plain.cost;
  const oh = give(s, 0, 'overgrown_horror'); E.playCard(s, 0, oh.uid, null, null, 0);
  ok('horror reduced only gifted minion', g1.cost === Math.max(0, c0 - 2) && plain.cost === p0);
}
// Dreambound Raptor: played minion gets a gift
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  summon(s, 0, 'dreambound_raptor');
  const m = give(s, 0, 'bone_baron'); E.playCard(s, 0, m.uid, null, null, 0);
  const onB = s.players[0].board.find(x => x.id === 'bone_baron');
  ok('raptor gifted the played minion', !!onB._darkGift);
}
// Mutating Lifeform: survives damage -> gains a gift
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const ml = summon(s, 0, 'mutating_lifeform');
  byId['t_ping'] = { id: 't_ping', name: 'P', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'creature' }] };
  const p = give(s, 0, 't_ping'); E.playCard(s, 0, p.uid, { type: 'creature', uid: ml.uid, player: 0 }, null, 0);
  ok('lifeform gained a gift on survive', !!s.players[0].board.find(x => x.id === 'mutating_lifeform')._darkGift);
}
// Stranglevine: DR gifts a friendly + propagates its deathrattle
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const ally = summon(s, 0, 'bone_baron');
  const sv = summon(s, 0, 'stranglevine');
  byId['t_k'] = { id: 't_k', name: 'K', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 10, target: 'creature' }] };
  const p = give(s, 0, 't_k'); E.playCard(s, 0, p.uid, { type: 'creature', uid: sv.uid, player: 0 }, null, 0);
  const b = s.players[0].board.find(x => x.uid === ally.uid);
  ok('stranglevine gifted + chained DR', !!b._darkGift && (b.deathrattle || []).some(e => e.type === 'grant-bonus-effect'));
}
// Tyrannogill: 3 murlocs each with own gift
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const ty = summon(s, 0, 'tyrannogill');
  const p = give(s, 0, 't_k'); E.playCard(s, 0, p.uid, { type: 'creature', uid: ty.uid, player: 0 }, null, 0);
  const murlocs = s.players[0].board.filter(x => x.id === 'tlc_murloc_2_1');
  ok('tyrannogill: 3 gifted murlocs', murlocs.length === 3 && murlocs.every(x => x._darkGift));
}
// Ace Wayfinder: 2 gifts on self + next Draenei gains them
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const aw = give(s, 0, 'ace_wayfinder'); E.playCard(s, 0, aw.uid, null, null, 0);
  const onB = s.players[0].board.find(x => x.id === 'ace_wayfinder');
  ok('wayfinder gained gifts', !!onB._darkGift);
  ok('reward stored gift labels', s.players[0].nextTribePlayReward && (s.players[0].nextTribePlayReward.giftLabels || []).length === 2);
  const dr = give(s, 0, 'spacerock_collector'); E.playCard(s, 0, dr.uid, null, null, 0);
  const played = s.players[0].board.find(x => x.id === 'spacerock_collector');
  ok('next draenei received the same gifts', !!played._darkGift);
}
// Violet Punisher: steals keywords + grows
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const e1 = summon(s, 1, 'crypt_lord'); e1.keywords = ['taunt', 'lifesteal']; e1.maxHealth = 20; e1.damage = 0;
  const vp = give(s, 0, 'violet_punisher'); E.playCard(s, 0, vp.uid, { type: 'creature', uid: e1.uid, player: 1 }, null, 0);
  const onB = s.players[0].board.find(x => x.id === 'violet_punisher');
  ok('punisher stole 2 keywords (+2/+2)', onB.keywords.includes('taunt') && onB.keywords.includes('lifesteal') && onB.attack === 4 + 2 && !e1.keywords.includes('taunt'));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
