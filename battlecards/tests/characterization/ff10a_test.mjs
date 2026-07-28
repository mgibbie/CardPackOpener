import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 60, target: 'creature' }] };
byId['t_bolt'] = { id: 't_bolt', name: 'B', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'creature' }] };
byId['t_zap'] = { id: 't_zap', name: 'Z', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
function kill(s, pi, c) { c.shield = false; const k = give(s, pi, 't_kill'); E.playCard(s, pi, k.uid, { type: 'creature', uid: c.uid, player: c.controller }, null, 0); }
function fx(s, pi, effects) { const id = 't_fx_' + (fx.n = (fx.n || 0) + 1); byId[id] = { id, name: 'FX', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects }; const c = give(s, pi, id); E.playCard(s, pi, c.uid, null, null, 0); }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Void Ray / paid-cost conds
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const v1 = give(s, 0, 'void_ray'); E.playCard(s, 0, v1.uid, null, null, 0);
  ok('void ray full price: base 3/2', s.players[0].board.find(c => c.uid === v1.uid).attack === 3);
  const v2 = give(s, 0, 'void_ray'); v2.cost = 0; E.playCard(s, 0, v2.uid, null, null, 0);
  ok('void ray at (0): 5/4', s.players[0].board.find(c => c.uid === v2.uid).attack === 5);
}
// Immortal
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const im = give(s, 0, 'immortal'); E.playCard(s, 0, im.uid, null, null, 0);
  const onB = s.players[0].board.find(c => c.id === 'immortal');
  ok('immortal doubled to 10/16', onB.attack === 10 && onB.maxHealth === 16);
  ok('spent 7 + 4 mana', s.players[0].mana.cur === 1);
}
// Templar merge
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  summon(s, 0, 'dark_templar');
  const ht = give(s, 0, 'high_templar'); E.playCard(s, 0, ht.uid, null, null, 0);
  ok('templars merged into archon', s.players[0].board.some(c => c.id === 'sc_archon')
    && !s.players[0].board.some(c => c.id === 'dark_templar' || c.id === 'high_templar'));
}
// Mothership: Protoss pool
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ms = give(s, 0, 'mothership'); E.playCard(s, 0, ms.uid, null, null, 0);
  const got = s.players[0].hand.slice(-2);
  ok('mothership: 2 Protoss minions', got.length === 2 && got.every(c => (byId[c.id].tribe || '').includes('Protoss')));
}
// Grunty
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const tank = summon(s, 1, 'crypt_lord'); tank.keywords = []; tank.shield = false; tank.maxHealth = 30;
  const g = give(s, 0, 'grunty'); E.playCard(s, 0, g.uid, null, null, 0);
  ok('grunty summoned 4 murlocs', s.players[0].board.filter(c => (c.tribe || '').includes('Murloc')).length >= 4);
  ok('murlocs shot the enemy', tank.damage > 0);
}
// Lurker
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = []; s.players[1].life = 40;
  summon(s, 0, 'lurker');
  const att = summon(s, 0, 'bone_baron'); att.sick = false; att.tribe = '';
  E.attack(s, 0, att.uid, { type: 'hero', player: 1 });
  ok('lurker: non-zerg attack -> 1 extra dmg', s.players[1].life === 40 - att.attack - 1);
  s.players[1].life = 40;
  const zerg = summon(s, 0, 'crypt_lord'); zerg.sick = false; zerg.tribe = 'Zerg'; zerg.keywords = [];
  E.attack(s, 0, zerg.uid, { type: 'hero', player: 1 });
  ok('lurker: zerg attack -> 2 extra dmg', s.players[1].life === 40 - zerg.attack - 2);
}
// Exarch Maladaar: corpses instead of mana
{
  const s = fresh(); mana(s, 0, 0); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].corpses = 10;
  const em = give(s, 0, 'exarch_maladaar'); em.cost = 0; E.playCard(s, 0, em.uid, null, null, 0);
  const cl = give(s, 0, 'crypt_lord');
  ok('next card free (corpses cover it)', E.effectiveCost(s, 0, cl) === 0);
  E.playCard(s, 0, cl.uid, null, null, 0);
  ok('corpses paid the cost', s.players[0].corpses === 10 - (byId['crypt_lord'].cost || 0) && s.players[0].board.some(c => c.id === 'crypt_lord'));
}
// Volcoross
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].corpses = 25;
  const vc = give(s, 0, 'volcoross'); E.playCard(s, 0, vc.uid, null, 1, 0); // spend 20
  const onB = s.players[0].board.find(c => c.id === 'volcoross');
  ok('volcoross +20/+20 for 20 corpses', onB.attack === byId['volcoross'].attack + 20 && s.players[0].corpses === 5);
  const vc2 = give(s, 0, 'volcoross'); E.playCard(s, 0, vc2.uid, null, 2, 0); // can't afford 30
  const onB2 = s.players[0].board.find(c => c.uid === vc2.uid);
  ok('unaffordable boon: no buff, corpses kept', onB2.attack === byId['volcoross'].attack && s.players[0].corpses === 5);
}
// Corpse Flower
{
  const s = fresh(); mana(s, 0, 99); s.players[1].mana = { cur: 99, max: 99, bonus: 0 }; s.players[0].board = []; s.players[1].board = []; s.players[1].hand = [];
  summon(s, 0, 'corpse_flower');
  s.players[0].corpses = 2; s.current = 1;
  const em = give(s, 1, 'crypt_lord'); em.cost = 0; E.playCard(s, 1, em.uid, null, null, 0);
  const played = s.players[1].board.find(c => c.id === 'crypt_lord');
  ok('corpse flower: spent 2 corpses, dealt 3', s.players[0].corpses === 0 && played && played.damage === 3);
  const em2 = give(s, 1, 'bone_baron'); em2.cost = 0; E.playCard(s, 1, em2.uid, null, null, 0);
  const p2 = s.players[1].board.find(c => c.id === 'bone_baron');
  ok('no corpses: no damage', p2 && p2.damage === 0);
}
// Hero shield + Lumia + Tichondrius + Doomsday Prepper
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].life = 40;
  fx(s, 0, [{ type: 'hero-shield' }]);
  fx(s, 1, []); // no-op
  s.current = 1; mana(s, 1, 99); s.players[1].hand = [];
  const z1 = give(s, 1, 't_zap'); E.playCard(s, 1, z1.uid, null, null, 0);
  ok('hero shield ate the hit', s.players[0].life === 40);
  const z2 = give(s, 1, 't_zap'); E.playCard(s, 1, z2.uid, null, null, 0);
  ok('shield was one-shot', s.players[0].life === 39);
}
{
  const s = fresh(); s.players[0].board = []; s.players[0].life = 40; s.players[1].life = 40;
  summon(s, 0, 'lumia');
  s.current = 1; mana(s, 1, 99); s.players[1].hand = [];
  const z1 = give(s, 1, 't_zap'); E.playCard(s, 1, z1.uid, null, null, 0);
  ok('first hit landed', s.players[0].life === 39);
  const z2 = give(s, 1, 't_zap'); E.playCard(s, 1, z2.uid, null, null, 0);
  ok('lumia: hero now immune this turn', s.players[0].life === 39);
}
{
  const s = fresh(); s.players[0].board = []; s.players[0].life = 40;
  summon(s, 0, 'tichondrius');
  s.current = 1; mana(s, 1, 99); s.players[1].hand = [];
  const z1 = give(s, 1, 't_zap'); E.playCard(s, 1, z1.uid, null, null, 0);
  ok('tichondrius: hero immune aura', s.players[0].life === 40);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].life = 40;
  const dp = give(s, 0, 'doomsday_prepper'); E.playCard(s, 0, dp.uid, null, null, 0); // lone card = edge = outcast
  E.endTurn(s); mana(s, 1, 99); s.players[1].hand = [];
  const z1 = give(s, 1, 't_zap'); E.playCard(s, 1, z1.uid, null, null, 0);
  ok('doomsday: immune through enemy turn', s.players[0].life === 40);
  E.endTurn(s); E.endTurn(s); mana(s, 1, 99);
  const z2 = give(s, 1, 't_zap'); E.playCard(s, 1, z2.uid, null, null, 0);
  ok('immunity expired after my next turn', s.players[0].life === 39);
}
// Talgath
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  summon(s, 0, 'talgath');
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 30;
  const b1 = give(s, 0, 't_bolt'); E.playCard(s, 0, b1.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('talgath: undamaged foe took double (6)', foe.damage === 6);
  const b2 = give(s, 0, 't_bolt'); E.playCard(s, 0, b2.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('damaged foe takes normal (+3)', foe.damage === 9);
}
// Bralma + Goldrinn
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  summon(s, 0, 'bralma_searstone');
  const ele = summon(s, 0, 'bone_baron'); ele.sick = false; ele.tribe = 'Elemental'; ele.attack = 3;
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 30; foe.attack = 0;
  E.attack(s, 0, ele.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('bralma: elemental hit for 4', foe.damage === 4);
  summon(s, 0, 'goldrinn');
  const beast = summon(s, 0, 'bone_baron'); beast.sick = false; beast.tribe = 'Beast'; beast.attack = 3;
  E.attack(s, 0, beast.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('goldrinn: beast hit for 6', foe.damage === 10);
}
// Verdant Dreamsaber
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 30;
  const v1 = give(s, 0, 'verdant_dreamsaber'); E.playCard(s, 0, v1.uid, null, null, 0);
  ok('full price: no attacks', foe.damage === 0);
  const v2 = give(s, 0, 'verdant_dreamsaber'); v2.cost = 3; E.playCard(s, 0, v2.uid, null, null, 0);
  ok('at (3): attacked twice', foe.damage > 0);
}
// Spelunker + Temporary
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const sp = give(s, 0, 'spelunker'); E.playCard(s, 0, sp.uid, null, null, 0);
  const t = give(s, 0, 'crypt_lord'); t.temporary = true;
  ok('temporary card (2) less', E.effectiveCost(s, 0, t) === Math.max(0, byId['crypt_lord'].cost - 2));
}
// Everburning Phoenix
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ph = summon(s, 0, 'everburning_phoenix');
  kill(s, 0, ph);
  ok('no phoenix yet', !s.players[0].hand.some(c => c.id === 'everburning_phoenix'));
  E.endTurn(s);
  ok('phoenix returned at end of turn', s.players[0].hand.some(c => c.id === 'everburning_phoenix'));
}
// Platysaur
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['crypt_lord'];
  const pl = give(s, 0, 'platysaur'); E.playCard(s, 0, pl.uid, null, null, 0);
  const drawn = s.players[0].hand.find(c => c.id === 'crypt_lord');
  ok('platysaur drew', !!drawn);
  const onB = s.players[0].board.find(c => c.id === 'platysaur');
  kill(s, 0, onB);
  ok('DR discarded THAT card', !s.players[0].hand.some(c => c.uid === drawn.uid));
}
// Merchant of Legend
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = [];
  const ml = give(s, 0, 'merchant_of_legend'); E.playCard(s, 0, ml.uid, null, null, 0);
  const pend = s.pickQueue[0];
  ok('discover open', !!pend && pend.ids.length === 3);
  E.resolvePick(s, pend.ids[1]);
  ok('picked to hand, others in deck', s.players[0].hand.some(c => c.id === pend.ids[1])
    && s.players[0].deck.includes(pend.ids[0]) && s.players[0].deck.includes(pend.ids[2]));
}
// Tricky Satyr
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = [];
  const a = give(s, 1, 'crypt_lord'); a.cost = 9;
  const b = give(s, 1, 'bone_baron'); b.cost = 1;
  const ts = give(s, 0, 'tricky_satyr'); E.playCard(s, 0, ts.uid, null, null, 0);
  ok('satyr copied the cheapest', s.players[0].hand.some(c => c.id === 'bone_baron'));
}
// Skittish Saucier
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const a = give(s, 0, 'crypt_lord');
  const sk = give(s, 0, 'skittish_saucier');
  const b = give(s, 0, 'bone_baron');
  const a0 = a.cost, b0 = b.cost;
  E.playCard(s, 0, sk.uid, null, null, 0);
  ok('adjacent cards discounted', a.cost === a0 - 1 && b.cost === b0 - 1);
}
// Beanstalk Brute
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['t_zap', 'crypt_lord', 'bone_baron']; // top = bone_baron (end)
  const bb = give(s, 0, 'beanstalk_brute'); E.playCard(s, 0, bb.uid, null, null, 0);
  E.drawCards(s, 0, 2);
  const c1 = s.players[0].hand.find(c => c.id === 'bone_baron');
  const c2 = s.players[0].hand.find(c => c.id === 'crypt_lord');
  ok('top deck minions carry +4/+4', c1.attack === byId['bone_baron'].attack + 4 && c2.attack === byId['crypt_lord'].attack + 4);
}
// Dreamwarden + startingDeckIds
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const d1 = give(s, 0, 'dreamwarden'); E.playCard(s, 0, d1.uid, null, null, 0);
  const b1 = s.players[0].board.find(c => c.uid === d1.uid);
  ok('no foreign card: base stats', b1.attack === byId['dreamwarden'].attack);
  s.players[0].deck.push('sc_marine'); // a card that didn't start there
  const d2 = give(s, 0, 'dreamwarden'); E.playCard(s, 0, d2.uid, null, null, 0);
  const b2 = s.players[0].board.find(c => c.uid === d2.uid);
  ok('foreign card drawn + grew', b2.attack === byId['dreamwarden'].attack + 2 && s.players[0].hand.some(c => c.id === 'sc_marine'));
}
// Foreboding Flame + Archimonde
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_dem2'] = { id: 't_dem2', name: 'D2', type: 'creature', cost: 4, attack: 2, health: 2, tribe: 'Demon', rarity: 'common', description: 'x' };
  const ff = give(s, 0, 'foreboding_flame'); E.playCard(s, 0, ff.uid, null, null, 0);
  const fd = give(s, 0, 't_dem2');
  ok('foreign demon (1) less', E.effectiveCost(s, 0, fd) === 3);
  E.playCard(s, 0, fd.uid, null, null, 0);
  s.players[0].board = [];
  const ar = give(s, 0, 'archimonde'); E.playCard(s, 0, ar.uid, null, null, 0);
  ok('archimonde resummoned the foreign demon', s.players[0].board.some(c => c.id === 't_dem2'));
}
// Shadowcloaked Assailant
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = []; s.players[1].deck = [];
  give(s, 0, 'crypt_lord');
  give(s, 1, 'crypt_lord'); give(s, 1, 'bone_baron');
  const sa = give(s, 0, 'shadowcloaked_assailant'); E.playCard(s, 0, sa.uid, null, null, 0);
  ok('matching card shuffled away', !s.players[1].hand.some(c => c.id === 'crypt_lord')
    && s.players[1].deck.includes('crypt_lord') && s.players[1].hand.some(c => c.id === 'bone_baron'));
}
// Sasquawk
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].cardsPlayedLastTurnIds = ['crypt_lord', 't_zap'];
  s.players[1].life = 40;
  const sq = give(s, 0, 'sasquawk'); E.playCard(s, 0, sq.uid, null, null, 0);
  ok('sasquawk resummoned last-turn minion', s.players[0].board.some(c => c.id === 'crypt_lord'));
  ok('sasquawk recast last-turn spell', s.players[1].life === 39);
}
// Sunsapper Lynessa
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  summon(s, 0, 'sunsapper_lynessa');
  const z = give(s, 0, 't_zap'); E.playCard(s, 0, z.uid, null, null, 0);
  ok('cheap spell cast twice (2 dmg)', s.players[1].life === 38);
}
// Aessina
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40; s.players[1].board = [];
  const a1 = give(s, 0, 'aessina'); E.playCard(s, 0, a1.uid, null, null, 0);
  ok('under 20 deaths: nothing', s.players[1].life === 40);
  s.players[0].friendlyDeaths = 20; s.players[0].board = [];
  const a2 = give(s, 0, 'aessina'); E.playCard(s, 0, a2.uid, null, null, 0);
  ok('20 deaths: 20 damage split', s.players[1].life === 20);
}
// Grazing Stegodon growth
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 'grazing_stegodon');
  s.players[0].deck = ['grazing_stegodon'];
  const a0 = held.attack;
  E.endTurn(s); E.endTurn(s); // my end + their end
  ok('hand copy grew', held.attack === a0 + 1);
  E.drawCards(s, 0, 1);
  const drawn = s.players[0].hand.find(c => c.id === 'grazing_stegodon' && c !== held);
  ok('deck copy grew too', drawn.attack === a0 + 1);
}
// Mystified Tocha
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].life = 20; s.players[1].life = 22;
  const t1 = give(s, 0, 'mystified_tocha'); E.playCard(s, 0, t1.uid, null, null, 0);
  ok('20+22=42: mine set to 42', s.players[0].life === 42);
  s.players[0].life = 20; s.players[1].life = 30; s.players[0].board = [];
  const t2 = give(s, 0, 'mystified_tocha'); E.playCard(s, 0, t2.uid, null, null, 0);
  ok('not 42: nothing', s.players[0].life === 20);
}
// Merry Moonkin + Wisps
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].armor = 0;
  summon(s, 0, 'merry_moonkin');
  byId['t_wisp'] = { id: 't_wisp', name: 'Wisp', type: 'creature', cost: 0, attack: 1, health: 1, rarity: 'common', token: true, description: 'x' };
  summon(s, 0, 't_wisp'); summon(s, 0, 't_wisp');
  E.endTurn(s);
  ok('moonkin: 1 + 2 wisps = 3 armor', s.players[0].armor === 3);
}
// Omen
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = []; s.players[1].life = 40;
  const om = summon(s, 0, 'omen'); om.sick = false;
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 60; foe.attack = 0;
  E.attack(s, 0, om.uid, { type: 'creature', uid: foe.uid, player: 1 });
  E.attack(s, 0, om.uid, { type: 'creature', uid: foe.uid, player: 1 }); // windfury second swing
  s.players[1].life = 40;
  kill(s, 0, om);
  ok('omen DR: 1 + 2 attacks = 3 to enemies', s.players[1].life === 37);
}
// Exarch Naielle + Tracking
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['crypt_lord', 'bone_baron', 't_zap', 'sc_marine'];
  const en = give(s, 0, 'exarch_naielle'); E.playCard(s, 0, en.uid, null, null, 0);
  ok('hero power replaced with Tracking', s.players[0].heroPowers.some(h => h.id === 'hp_tracking'));
  const hp0 = s.players[0].heroPowers.find(h => h.id === 'hp_tracking');
  E.useHeroPower(s, 0, hp0.uid, null, null);
  const pend = s.pickQueue[0];
  ok('tracking offers deck cards', !!pend && pend.ids.every(id => ['crypt_lord', 'bone_baron', 't_zap', 'sc_marine'].includes(id)));
  const deckBefore = s.players[0].deck.length;
  E.resolvePick(s, pend.ids[0]);
  ok('pick drawn FROM deck', s.players[0].hand.some(c => c.id === pend.ids[0]) && s.players[0].deck.length === deckBefore - 1);
}
// Questing Assistant
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 30;
  const q1 = give(s, 0, 'questing_assistant'); E.playCard(s, 0, q1.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('no quest: no damage', foe.damage === 0);
  s.players[0].questsPlayedGame = 1;
  const q2 = give(s, 0, 'questing_assistant'); E.playCard(s, 0, q2.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('quest played: 3 damage', foe.damage === 3);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
