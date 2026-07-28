import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 60, target: 'creature' }] };
function kill(s, pi, c) { c.shield = false; const k = give(s, pi, 't_kill'); E.playCard(s, pi, k.uid, { type: 'creature', uid: c.uid, player: c.controller }, null, 0); }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// 1. Prepare: spend leftover mana, discount = spend + 1, locked this turn
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = [];
  mana(s, 0, 3);
  const sb = give(s, 0, 'sawbones'); // cost 6
  ok('canPrepare on a prepare card', E.canPrepare(s, 0, sb));
  ok('prepare succeeds', E.prepareCard(s, 0, sb.uid));
  ok('spent all 3 mana', s.players[0].mana.cur === 0);
  ok('cost 6 -> 2 (3 spent + 1 bonus)', sb.cost === 2);
  ok('locked this turn', !E.canPlay(s, 0, sb));
  mana(s, 0, 10);
  ok('still locked with mana this turn', !E.canPlay(s, 0, sb));
  E.endTurn(s); E.endTurn(s); // back to my turn
  mana(s, 0, 10);
  ok('playable next turn at (2)', E.canPlay(s, 0, sb));
  ok('cannot prepare twice', !E.canPrepare(s, 0, sb));
}
// 2. Overspend cap: only spend what reaches 0
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = [];
  mana(s, 0, 10);
  const ds = give(s, 0, 'defias_smuggler'); // cost 3
  E.prepareCard(s, 0, ds.uid);
  ok('spent only 2 of 10 mana', s.players[0].mana.cur === 8);
  ok('cost reached exactly 0', ds.cost === 0);
}
// 3. Jailbird: discounts by the same amount on every Prepare
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = [];
  mana(s, 0, 2);
  const jb = give(s, 0, 'jailbird'); // cost 5
  const sw = give(s, 0, 'sewer_swimmer');
  E.prepareCard(s, 0, sw.uid); // spend 2 -> discount 3
  ok('jailbird dropped by the same amount (5 -> 2)', jb.cost === 2);
  ok('sewer swimmer discounted too (5 -> 2)', sw.cost === 2);
}
// 4. Captive Nathrezim: ALL minions cost (2) more (both players)
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = []; s.players[1].hand = [];
  mana(s, 0, 10);
  const m0 = give(s, 0, 'crypt_lord');
  const base = E.effectiveCost(s, 0, m0);
  summon(s, 1, 'captive_nathrezim'); // on the ENEMY board
  ok('my minion +2 with enemy nathrezim', E.effectiveCost(s, 0, m0) === base + 2);
  const m1 = give(s, 1, 'crypt_lord');
  ok('their own minion +2 as well', E.effectiveCost(s, 1, m1) === base + 2);
}
// 5. Moragg chain: demon from deck gets "Deathrattle: Summon Moragg"
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_demon'] = { id: 't_demon', name: 'D', type: 'creature', cost: 3, attack: 3, health: 3, tribe: 'Demon', rarity: 'common', description: 'x' };
  s.players[0].deck = ['t_demon'];
  const mo = summon(s, 0, 'moragg');
  kill(s, 0, mo);
  const dem = s.players[0].board.find(c => c.id === 't_demon');
  ok('moragg DR summoned the deck demon', !!dem);
  ok('demon carries the chained DR', !!dem && dem.deathrattle.some(e => e.summonId === 'moragg'));
  kill(s, 0, dem);
  ok('demon death re-summoned Moragg', s.players[0].board.some(c => c.id === 'moragg'));
}
// 6. Rampaging Hound: enemies genuinely attack IT
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = []; s.players[1].life = 40;
  const e1 = summon(s, 1, 'crypt_lord'); e1.keywords = []; e1.shield = false; e1.attack = 2; e1.sick = false;
  const e2 = summon(s, 1, 'bone_baron'); e2.keywords = []; e2.shield = false; e2.attack = 2; e2.sick = false;
  const rh = give(s, 0, 'rampaging_hound'); E.playCard(s, 0, rh.uid, null, null, 0);
  const hound = s.players[0].board.find(c => c.id === 'rampaging_hound');
  ok('hound took both hits (4 damage)', hound.damage === 4);
  ok('attackers took hound damage back', e1.damage >= 3 || !s.players[1].board.includes(e1));
  ok('enemy hero untouched', s.players[1].life === 40);
}
// 7. Prepared card keeps working: locked flag doesn't survive into a fresh copy
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = [];
  mana(s, 0, 0);
  const tg = give(s, 0, 'tunneling_geomancer'); // cost 3, 0 mana left
  ok('can prepare with 0 mana (min +1 bonus)', E.canPrepare(s, 0, tg));
  E.prepareCard(s, 0, tg.uid);
  ok('0 spend still gives the +1 (3 -> 2)', tg.cost === 2 && s.players[0].mana.cur === 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
