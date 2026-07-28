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
function fx(s, pi, effects) { const id = 't_fx_' + (fx.n = (fx.n || 0) + 1); byId[id] = { id, name: 'FX', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects }; const c = give(s, pi, id); E.playCard(s, pi, c.uid, null, null, 0); }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// 1. Broxigar portal chain
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  s.players[0].deck = ['broxigar', 'crypt_lord'];
  fx(s, 0, [{ type: 'argus-start' }]);
  ok('broxigar left the deck for a portal', !s.players[0].deck.includes('broxigar') && s.players[0].deck.includes('first_portal_to_argus'));
  // walk the chain
  let portal = 'first_portal_to_argus';
  const demons = ['fleeing_urzul', 'fleeing_incubus', 'fleeing_wrathguard', 'fleeing_terrorguard'];
  for (let step = 0; step < 4; step++) {
    const idx = s.players[0].deck.indexOf(portal);
    s.players[0].deck.splice(idx, 1);
    const pc = give(s, 0, portal);
    E.playCard(s, 0, pc.uid, null, null, 0);
    const dem = s.players[1].board.find(c => c.id === demons[step]);
    if (step === 0) ok('portal summoned the demon for the ENEMY', !!dem);
    if (!dem) break;
    kill(s, 0, dem); // my removal — the demon still dies on THEIR side
    portal = ['second_portal_to_argus', 'third_portal_to_argus', 'final_portal_to_argus', null][step];
    if (portal) {
      if (step === 0) ok('next portal shuffled into MY deck', s.players[0].deck.includes(portal));
      if (!s.players[0].deck.includes(portal)) { ok('chain broke at ' + portal, false); break; }
    }
  }
  ok('broxigar reappeared in my hand', s.players[0].hand.some(c => c.id === 'broxigar'));
}
// 2. Timelord Nozdormu awakens on set play
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const tn = give(s, 0, 'timelord_nozdormu'); E.playCard(s, 0, tn.uid, null, null, 0);
  const onB = s.players[0].board.find(c => c.id === 'timelord_nozdormu');
  ok('nozdormu dormant 5', onB.dormantLeft === 5);
  const tc = give(s, 0, 'aeon_wizard'); E.playCard(s, 0, tc.uid, null, null, 0); // TIME_TRAVEL set
  ok('TIME card woke him 1 sooner', onB.dormantLeft === 4);
  const nc = give(s, 0, 'crypt_lord'); E.playCard(s, 0, nc.uid, null, null, 0); // not TIME
  ok('other set: no change', onB.dormantLeft === 4);
}
// 3. Garona & King Llane
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = []; s.players[1].life = 40;
  fx(s, 0, [{ type: 'shuffle-ids-into-deck', ids: ['king_llane'], forEnemy: true }]);
  ok('llane hid in the enemy deck', s.players[1].deck.includes('king_llane'));
  const ll = give(s, 1, 'king_llane');
  const g = give(s, 0, 'garona_halforcen'); E.playCard(s, 0, g.uid, null, null, 0);
  ok('garona killed llane + halved health', !s.players[1].hand.some(c => c.id === 'king_llane') && s.players[1].life === 20);
  // llane battlecry: draw + shuffle back
  mana(s, 1, 99); const ll2 = give(s, 1, 'king_llane'); const d0 = s.players[1].deck.length;
  E.playCard(s, 1, ll2.uid, null, null, 0);
  ok('llane drew + returned to deck', s.players[1].deck.includes('king_llane'));
}
// 4. Talanji & Bwonsamdi boons
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const t1 = give(s, 0, 'talanji_of_the_graves'); E.playCard(s, 0, t1.uid, null, 0, 0); // Boon of Power
  const bw = s.players[0].hand.find(c => c.id === 'time_bwonsamdi');
  ok('bwonsamdi drawn with taunt boon', !!bw && bw.keywords.includes('taunt'));
  s.players[0].hand = s.players[0].hand.filter(c => c !== bw);
  bw.zone = 'board'; s.players[0].board.push(bw);
  s.players[0].board = [bw];
  kill(s, 0, bw);
  const summoned = s.players[0].board.find(c => c.id !== 'time_bwonsamdi' && c.type === 'creature');
  ok('boon DR: summoned a 6-cost (4+2)', !!summoned && (byId[summoned.id].cost || 0) === 6);
  ok('bwonsamdi death remembered', s.players[0].bwonsamdiDied === true);
  const t2 = give(s, 0, 'talanji_of_the_graves'); E.playCard(s, 0, t2.uid, null, 1, 0); // Boon of Longevity
  const rez = s.players[0].board.find(c => c.id === 'time_bwonsamdi');
  ok('second talanji resurrected him with BOTH boons', !!rez && rez.keywords.includes('taunt') && rez.keywords.includes('lifesteal'));
}
// 5. Sindragosa arcane discount
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_arc'] = { id: 't_arc', name: 'A', type: 'sorcery', cost: 5, tribe: 'Arcane', rarity: 'common', description: 'x', effects: [{ type: 'draw', count: 1 }] };
  const sp = give(s, 0, 't_arc');
  summon(s, 0, 'azure_queen_sindragosa');
  ok('no other dragon: full price', E.effectiveCost(s, 0, sp) === 5);
  const dr = summon(s, 0, 'bone_baron'); dr.tribe = 'Dragon';
  ok('with another dragon: (2) less', E.effectiveCost(s, 0, sp) === 3);
}
// 6. Lady Azshara locations
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const la = give(s, 0, 'lady_azshara'); E.playCard(s, 0, la.uid, null, 0, 0); // Zin-Azshari
  const zin = s.players[0].board.find(c => c.id === 'zin_azshari');
  ok('zin-azshari entered the battlefield', !!zin && zin.type === 'location');
  fx(s, 0, [{ type: 'zin-copy' }]);
  const copies = s.players[0].board.filter(c => c.id === 'lady_azshara');
  ok('zin copied azshara with doubled stats', copies.length === 2 && copies.some(c => c.attack === 10));
  // Well: fill hand with temporary cast-twice spells
  const s2 = fresh(); mana(s2, 0, 99); s2.players[0].hand = []; s2.players[0].board = [];
  fx(s2, 0, [{ type: 'conjure-random', cardType: 'spell', makeTemporary: true, fillHand: true, castTwice: true }]);
  ok('well filled the hand', s2.players[0].hand.length === 15);
  ok('spells are temporary + cast twice', s2.players[0].hand.every(c => c.temporary && c.castTwice));
}
// 7. Muradin & the Hammer
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = [];
  const mu = give(s, 0, 'muradin_high_king'); E.playCard(s, 0, mu.uid, null, null, 0);
  ok('hammer equipped 3/4 windfury', s.players[0].weapon && s.players[0].weapon.id === 'high_kings_hammer' && s.players[0].weapon.attack === 3);
  // break it -> +2 grows, returns to deck
  fx(s, 0, [{ type: 'hammer-grow-return' }]); // simulate break growth
  s.players[0].weapon = null;
  ok('hammer grew and went to deck', s.players[0].hammerBonus === 2 && s.players[0].deck.includes('high_kings_hammer'));
  // muradin dies -> hammer to hand at 5 attack
  const onB = s.players[0].board.find(c => c.id === 'muradin_high_king');
  kill(s, 0, onB);
  const hh = s.players[0].hand.find(c => c.id === 'high_kings_hammer');
  ok('muradin DR: hammer in hand at +2', !!hh && hh.attack === 5);
}
// 8. Blood Fighter chain
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const lg = summon(s, 0, 'logosh_blood_fighter');
  const br = give(s, 0, 'broll_blood_fighter');
  kill(s, 0, lg);
  const brB = s.players[0].board.find(c => c.id === 'broll_blood_fighter');
  ok('logosh DR: broll from hand at 12/12', !!brB && brB.attack === 12 && brB.maxHealth === 12);
  const va = give(s, 0, 'valeera_blood_fighter');
  kill(s, 0, brB);
  const vaB = s.players[0].board.find(c => c.id === 'valeera_blood_fighter');
  ok('broll DR: valeera at 12/12 with elusive', !!vaB && vaB.attack === 12 && vaB.keywords.includes('elusive'));
}
// 9. Gelbin auras: fire at end of turn, expire after 3
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ally = summon(s, 0, 'crypt_lord'); ally.keywords = []; ally.shield = false; const a0 = ally.attack;
  const ge = give(s, 0, 'gelbin_of_tomorrow'); E.playCard(s, 0, ge.uid, null, null, 0);
  ok('two auras in play', s.players[0].enchantments.length === 2);
  E.endTurn(s); // owner's turn ends -> auras fire + tick
  const buffed = s.players[0].board.some(c => c.keywords.includes('divine_shield'));
  ok('mekkatorque aura buffed a friendly', buffed);
  ok('auras ticked to 2', s.players[0].enchantments.every(en => en.turnsLeft === 2));
  E.endTurn(s); E.endTurn(s); E.endTurn(s); E.endTurn(s); // two more of MY turns end
  ok('auras expired after 3 of my turns', s.players[0].enchantments.length === 0);
}
// 10. Medivh: silence + destroy all others; free with Karazhan
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const dm = summon(s, 1, 'bone_baron'); // deathrattle minion
  const me = give(s, 0, 'medivh_the_hallowed');
  ok('medivh full price without karazhan', E.effectiveCost(s, 0, me) === 10);
  const kz = give(s, 0, 'karazhan_the_sanctum'); s.players[0].hand = s.players[0].hand.filter(x => x !== kz); kz.zone = 'board'; s.players[0].board.push(kz);
  ok('medivh free with karazhan', E.effectiveCost(s, 0, me) === 0);
  E.playCard(s, 0, me.uid, null, null, 0);
  ok('all other minions silenced+destroyed', !s.players[1].board.some(c => c.type === 'creature'));
  ok('no skeletons: deathrattle was silenced', !s.players[1].board.length && !s.players[1].graveyard.some(c => c.name === 'Skeleton'));
  ok('medivh survived his own wrath', s.players[0].board.some(c => c.id === 'medivh_the_hallowed'));
}
// 11. Timethief Rafaam win-con
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  const t1 = give(s, 0, 'timethief_rafaam'); E.playCard(s, 0, t1.uid, null, null, 0);
  ok('rest unplayed: enemy lives', s.players[1].life === 40 && !s.players[1].eliminated);
  const nine = ['tiny_rafaam', 'green_rafaam', 'explorer_rafaam', 'warchief_rafaam', 'mindflayer_rfaam', 'calamitous_rafaam', 'giant_rafaam', 'murloc_rafaam', 'archmage_rafaam'];
  s.players[0].playedCountById = s.players[0].playedCountById || {};
  for (const id of nine) s.players[0].playedCountById[id] = 1;
  s.players[0].board = [];
  const t2 = give(s, 0, 'timethief_rafaam'); E.playCard(s, 0, t2.uid, null, null, 0);
  ok('all 9 played: enemy hero destroyed', s.players[1].life <= 0 || s.players[1].eliminated);
}
// 12. Rafaam token kit
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 'giant_rafaam');
  ok('giant full price unplayed', E.effectiveCost(s, 0, held) === 8);
  s.players[0].playedCountById = { tiny_rafaam: 2, murloc_rafaam: 1 };
  ok('giant -3 after 3 rafaam plays', E.effectiveCost(s, 0, held) === 5);
  const gr = give(s, 0, 'green_rafaam'); E.playCard(s, 0, gr.uid, null, null, 0);
  ok('green buffed held giant', held.attack === 10 && held.maxHealth === 10);
  const mr = give(s, 0, 'murloc_rafaam'); E.playCard(s, 0, mr.uid, null, null, 0);
  ok('murloc: next rafaam (3) less (2 played since -> base 3, -3 -> 0)', E.effectiveCost(s, 0, held) === 0);
  const wc = give(s, 0, 'warchief_rafaam'); const arm0 = s.players[0].armor || 0;
  E.playCard(s, 0, wc.uid, null, null, 0); // holding giant -> +10
  ok('warchief: 10 armor while holding a rafaam', (s.players[0].armor || 0) === arm0 + 10);
}
// 13. Chef Neth'rek mana surge
{
  const s = E.createGame(byId, () => 0.4, ['time_sheep', 'time_sheep', 'time_sheep', 'time_sheep', 'time_sheep', 'chef_nethrek'], 2);
  ok('cheap deck armed the surge', s.players[0].manaSurgeIn === 5);
  for (let t = 0; t < 10 && s.players[0].mana.max < 10; t++) E.endTurn(s);
  ok('mana surged to 10 by my fifth turn', s.players[0].mana.max === 10);
}
// 14. Godfrey overdraw return
{
  const s = fresh(); mana(s, 0, 99); s.players[0].board = [];
  fx(s, 0, [{ type: 'godfrey-start' }]);
  s.players[0].hand = [];
  for (let i = 0; i < 17; i++) give(s, 0, 'time_sheep');
  const over = s.players[0].hand.slice(15).map(c => c.uid);
  E.endTurn(s);
  ok('cleanup discard queued', s.discardQueue.length === 1 && s.discardQueue[0].cleanup === true);
  E.resolveDiscard(s, over);
  ok('overdrawn set aside at -1 cost', (s.players[0].godfreyHeld || []).length === 2 && s.players[0].godfreyHeld.every(c => c.cost === 0));
  s.players[0].hand = s.players[0].hand.slice(0, 5);
  E.endTurn(s); // back to my turn -> they return
  ok('cards returned when space opened', (s.players[0].godfreyHeld || []).length === 0 && s.players[0].hand.filter(c => c.id === 'time_sheep').length >= 7);
}
// 15. Mug'Zee
{
  const s = E.createGame(byId, () => 0.4, ['mugzee'].concat(Array(12).fill('t_arc')), 2);
  ok('all-spell deck: mug magic on', s.players[0].mugMagic === true && !s.players[0].zeeMight);
  mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].creaturesPlayedThisTurn = 0;
  const m1 = give(s, 0, 'crypt_lord');
  ok('first minion (2) less', E.effectiveCost(s, 0, m1) === (byId['crypt_lord'].cost - 2));
  E.playCard(s, 0, m1.uid, null, null, 0);
  const m2 = give(s, 0, 'crypt_lord');
  ok('second minion full price', E.effectiveCost(s, 0, m2) === byId['crypt_lord'].cost);
  const s2 = E.createGame(byId, () => 0.4, ['mugzee'].concat(Array(12).fill('crypt_lord')), 2);
  ok('all-minion deck: zee might on', s2.players[0].zeeMight === true && !s2.players[0].mugMagic);
  mana(s2, 0, 99); s2.players[0].hand = []; s2.players[0].board = []; s2.players[0].minionsPlayedGame = 0; s2.players[1].life = 40;
  byId['t_ping'] = { id: 't_ping', name: 'P', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', keywords: ['battlecry'], description: 'x', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
  for (let i = 0; i < 5; i++) { const c = give(s2, 0, 't_ping'); E.playCard(s2, 0, c.uid, null, null, 0); if (s2.players[0].board.length > 6) s2.players[0].board = s2.players[0].board.slice(0, 3); }
  ok('zee: fifth battlecry fired twice (6 dmg)', s2.players[1].life === 34);
}
// 16. Nozdormu the Eternal short turns
{
  const s = E.createGame(byId, () => 0.4, ['nozdormu_the_eternal', 'crypt_lord', 'crypt_lord'], 2);
  ok('one-sided nozdormu: normal turns', !s.shortTurns);
  s.players[1].deck.push('nozdormu_the_eternal');
  fx(s, 0, [{ type: 'short-turns' }]);
  ok('both decks: short turns flagged', s.shortTurns === true);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
