import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function freshClass(cls) { return E.createGame(byId, () => 0.4, null, 2, [{ id: cls }, null]); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Imbue as druid: hero power becomes Blessing of the Golem; scales with count
{
  const s = freshClass('druid'); mana(s, 0, 12); s.players[0].hand = [];
  const bk = give(s, 0, 'bitterbloom_knight'); E.playCard(s, 0, bk.uid, null, null, 0);
  ok('imbue count 1', s.players[0].imbueCount === 1);
  ok('druid got Blessing of the Golem', s.players[0].heroPowers.some(h => h.id === 'hp_blessing_golem'));
  const bk2 = give(s, 0, 'flutterwing_guardian'); E.playCard(s, 0, bk2.uid, null, null, 0);
  ok('imbue count 2', s.players[0].imbueCount === 2);
  // use the power -> 2/2 Plant Golem
  const hp0 = s.players[0].heroPowers[0];
  E.useHeroPower(s, 0, hp0.uid, null, null);
  const golem = s.players[0].board.find(x => x.name === 'Plant Golem');
  ok('golem scales with imbue (2/2)', golem && golem.attack === 2 && golem.maxHealth === 2);
}
// Imbue as hunter: Blessing of the Wolf buffs a hand Beast
{
  const s = freshClass('hunter'); mana(s, 0, 12); s.players[0].hand = [];
  byId['t_beast'] = { id: 't_beast', name: 'B', type: 'creature', tribe: 'Beast', cost: 4, attack: 3, health: 3, rarity: 'common' };
  const b = give(s, 0, 't_beast');
  const um = summon(s, 0, 'umbraclaw');
  byId['t_k'] = { id: 't_k', name: 'K', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 10, target: 'creature' }] };
  const p = give(s, 0, 't_k'); E.playCard(s, 0, p.uid, { type: 'creature', uid: um.uid, player: 0 }, null, 0); // DR imbues
  ok('hunter imbued via umbraclaw DR', s.players[0].imbueCount === 1 && s.players[0].heroPowers.some(h => h.id === 'hp_blessing_wolf'));
  E.useHeroPower(s, 0, s.players[0].heroPowers[0].uid, null, null);
  ok('wolf blessing buffed hand beast +1/-1cost', b.attack === 4 && b.cost === 3);
}
// Imbue as mage + Wisprider trigger
{
  const s = freshClass('mage'); mana(s, 0, 12); s.players[0].hand = [];
  s.players[1].life = 40;
  const wr = give(s, 0, 'wisprider'); E.playCard(s, 0, wr.uid, null, null, 0);
  ok('wisprider imbued mage', s.players[0].heroPowers.some(h => h.id === 'hp_blessing_wisp'));
  const wisp = s.players[0].board.find(x => x.id === 'edr_wisp');
  ok('wisprider triggered the blessing (wisp summoned)', !!wisp);
}
// Imbue as priest: Blessing of the Moon conjures a discounted priest card
{
  const s = freshClass('priest'); mana(s, 0, 12); s.players[0].hand = [];
  const lm = give(s, 0, 'lunarwing_messenger'); E.playCard(s, 0, lm.uid, null, null, 0);
  E.useHeroPower(s, 0, s.players[0].heroPowers[0].uid, null, null);
  const got = s.players[0].hand.find(x => byId[x.id] && byId[x.id].cardClass === 'priest');
  ok('moon blessing conjured discounted priest card', !!got && got.cost === Math.max(0, (byId[got.id].cost || 0) - 1));
}
// Imbue as shaman: Blessing of the Wind evolves a friendly
{
  const s = freshClass('shaman'); mana(s, 0, 12); s.players[0].hand = [];
  const ally = summon(s, 0, 'bone_baron'); const baseCost = byId['bone_baron'].cost || 0;
  const lg = give(s, 0, 'living_garden'); E.playCard(s, 0, lg.uid, null, null, 0);
  s.players[0].board = s.players[0].board.filter(x => x.uid === ally.uid); // only one evolve candidate
  E.useHeroPower(s, 0, s.players[0].heroPowers[0].uid, null, null);
  const evolved = s.players[0].board[0];
  ok('wind blessing evolved the minion +1 cost', !!evolved && evolved.id !== 'bone_baron' && (byId[evolved.id]?.cost || 0) === baseCost + 1);
}
// Imbue as paladin: Blessing of the Dragon shuffles portals; portal summons on draw
{
  const s = freshClass('paladin'); mana(s, 0, 12); s.players[0].hand = [];
  const gd = give(s, 0, 'goldpetal_drake'); E.playCard(s, 0, gd.uid, null, null, 0);
  E.useHeroPower(s, 0, s.players[0].heroPowers[0].uid, null, null);
  ok('dragon blessing shuffled 2 portals', s.players[0].deck.filter(id => id === 'edr_emerald_portal').length === 2);
  s.players[0].deck = ['edr_emerald_portal'];
  const n0 = s.players[0].board.length;
  E.drawCards(s, 0, 1);
  ok('portal summoned a minion on draw', s.players[0].board.length > n0);
}
// Classless fallback: imbue still upgrades (double-fire proxy)
{
  const s = E.createGame(byId, () => 0.4, null, 2); mana(s, 0, 12); s.players[0].hand = [];
  const bk = give(s, 0, 'bitterbloom_knight'); E.playCard(s, 0, bk.uid, null, null, 0);
  ok('classless imbue falls back to upgrade', s.players[0].heroPowerUpgraded === true && s.players[0].imbueCount === 1);
}
// Petal Picker: needs imbued twice
{
  const s = freshClass('druid'); mana(s, 0, 12); s.players[0].hand = [];
  const b1 = give(s, 0, 'bitterbloom_knight'); E.playCard(s, 0, b1.uid, null, null, 0);
  s.players[0].deck.push('bone_baron', 'malorne', 'crypt_lord');
  const ppA = give(s, 0, 'petal_picker'); const h0 = s.players[0].hand.length;
  E.playCard(s, 0, ppA.uid, null, null, 0);
  ok('petal picker inert at imbue 1', s.players[0].hand.length === h0 - 1);
  const b2 = give(s, 0, 'flutterwing_guardian'); E.playCard(s, 0, b2.uid, null, null, 0);
  const ppB = give(s, 0, 'petal_picker'); const h1 = s.players[0].hand.length;
  E.playCard(s, 0, ppB.uid, null, null, 0);
  ok('petal picker drew 2 at imbue 2', s.players[0].hand.length === h1 - 1 + 2);
}
// Malorne: imbued 4x -> legendary at (1)
{
  const s = freshClass('druid'); mana(s, 0, 20); s.players[0].hand = [];
  s.players[0].imbueCount = 4;
  const ma = give(s, 0, 'malorne_the_waywatcher'); E.playCard(s, 0, ma.uid, null, null, 0);
  if (s.pickQueue.length) {
    E.resolvePick(s, s.pickQueue[0].ids[0]);
    const got = s.players[0].hand[s.players[0].hand.length - 1];
    ok('malorne 4x: legendary costs 1', got.cost === 1);
  } else ok('malorne discover opened', false);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
