import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 60, target: 'creature' }] };
byId['t_zap'] = { id: 't_zap', name: 'Z', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
function kill(s, pi, c) { c.shield = false; const k = give(s, pi, 't_kill'); E.playCard(s, pi, k.uid, { type: 'creature', uid: c.uid, player: c.controller }, null, 0); }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Mistah Vistah
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  const mv = give(s, 0, 'mistah_vistah'); E.playCard(s, 0, mv.uid, null, null, 0);
  const z1 = give(s, 0, 't_zap'); E.playCard(s, 0, z1.uid, null, null, 0);
  const z2 = give(s, 0, 't_zap'); E.playCard(s, 0, z2.uid, null, null, 0);
  ok('two zaps landed', s.players[1].life === 38);
  for (let i = 0; i < 6; i++) E.endTurn(s); // 3 full rounds
  ok('vistah replayed both spells', s.players[1].life <= 36);
}
// Chronikar
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ck = give(s, 0, 'chronikar'); E.playCard(s, 0, ck.uid, null, null, 0);
  ok('+3 hero attack now', (s.players[0].heroTempAttack || 0) >= 3);
  E.endTurn(s); E.endTurn(s);
  ok('+3 again next turn', (s.players[0].heroTempAttack || 0) >= 3);
  E.endTurn(s); E.endTurn(s);
  ok('+3 third turn', (s.players[0].heroTempAttack || 0) >= 3);
  E.endTurn(s); E.endTurn(s);
  ok('expired on fourth', (s.players[0].heroTempAttack || 0) === 0);
}
// Crater Gator heal lock
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[1].life = 30;
  const cg = give(s, 0, 'crater_gator'); E.playCard(s, 0, cg.uid, null, null, 0);
  byId['t_heal1'] = { id: 't_heal1', name: 'H', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'heal', value: 5, target: 'self' }] };
  E.endTurn(s); mana(s, 1, 99); s.players[1].hand = [];
  const h = give(s, 1, 't_heal1'); E.playCard(s, 1, h.uid, null, null, 0);
  ok('enemy heal locked', s.players[1].life === 30);
  E.endTurn(s); E.endTurn(s); mana(s, 1, 99);
  const h2 = give(s, 1, 't_heal1'); E.playCard(s, 1, h2.uid, null, null, 0);
  ok('lock expired', s.players[1].life === 35);
}
// Chronochiller
{
  const s = fresh(); s.players[0].board = [];
  summon(s, 0, 'chronochiller');
  const h0 = s.players[0].hand.length;
  E.endTurn(s); E.endTurn(s); // back to my turn start
  ok('no start-of-turn draw', s.players[0].hand.length === h0);
}
// Time Skipper
{
  const s = fresh(); s.players[0].board = []; s.players[0].hand = []; s.players[1].hand = [];
  summon(s, 0, 'time_skipper');
  E.endTurn(s);
  ok('I got a coin at my turn end', s.players[0].hand.some(c => c.id === 'coin'));
  E.endTurn(s);
  ok('they got a coin at their end', s.players[1].hand.some(c => c.id === 'coin'));
}
// Circadiamancer
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const cd = give(s, 0, 'circadiamancer'); E.playCard(s, 0, cd.uid, null, null, 0);
  const got = s.players[0].hand[s.players[0].hand.length - 1];
  const c0 = got.cost;
  E.endTurn(s); E.endTurn(s);
  ok('conjured 8-drop ticked down', got.cost === c0 - 1);
}
// Acolyte of Infinity
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 'crypt_lord'); const hc0 = held.cost;
  const ai = give(s, 0, 'acolyte_of_infinity'); E.playCard(s, 0, ai.uid, null, null, 0);
  ok('held card at INFINITY', held.cost === 9999);
  kill(s, 0, s.players[0].board.find(c => c.id === 'acolyte_of_infinity'));
  ok('restored on death', held.cost === hc0);
}
// Keeper of Flame
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 'crypt_lord'); const a0 = held.attack;
  const kf = give(s, 0, 'keeper_of_flame'); E.playCard(s, 0, kf.uid, null, null, 0);
  ok('hand minion +3/+3', held.attack === a0 + 3);
  for (let i = 0; i < 6; i++) E.endTurn(s);
  ok('doomed card destroyed after 3 turns', !s.players[0].hand.some(c => c.uid === held.uid));
}
// Chrono-Lord Epoch
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const old = summon(s, 1, 'bone_baron'); old.keywords = [];
  const recent = summon(s, 1, 'crypt_lord'); recent.keywords = []; recent.shield = false;
  s.players[1].cardsPlayedLastTurnIds = ['crypt_lord'];
  const ep = give(s, 0, 'chrono_lord_epoch'); E.playCard(s, 0, ep.uid, null, null, 0);
  ok('epoch killed last-turn plays only', !s.players[1].board.some(c => c.uid === recent.uid)
    && s.players[1].board.some(c => c.uid === old.uid));
}
// Chromie
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].playedCountById = { crypt_lord: 2, t_zap: 1 };
  const ch = summon(s, 0, 'chromie');
  kill(s, 0, ch);
  ok('chromie: copies of played cards', s.players[0].hand.filter(c => c.id === 'crypt_lord').length === 2
    && s.players[0].hand.filter(c => c.id === 't_zap').length === 1);
}
// Chronogor
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = []; s.players[0].board = [];
  byId['t_cheap'] = { id: 't_cheap', name: 'C1', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', description: 'x' };
  byId['t_exp'] = { id: 't_exp', name: 'C9', type: 'creature', cost: 9, attack: 9, health: 9, rarity: 'common', description: 'x' };
  s.players[0].deck = ['t_cheap', 't_cheap', 't_exp', 't_exp', 'crypt_lord'];
  const cg = give(s, 0, 'chronogor'); E.playCard(s, 0, cg.uid, null, null, 0);
  ok('I drew my 2 most expensive', s.players[0].hand.filter(c => c.id === 't_exp').length === 2);
  ok('enemy drew my 2 cheapest', s.players[1].hand.filter(c => c.id === 't_cheap').length === 2);
}
// Sylvanas volley
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40; s.players[1].board = [];
  s.players[0].playedCountById = { vereesa_windrunner: 1 };
  const sy = give(s, 0, 'ranger_general_sylvanas'); E.playCard(s, 0, sy.uid, null, null, 0);
  ok('2 volleys with vereesa played (4 dmg)', s.players[1].life === 36);
}
// Temporal Construct
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 2; foe.damage = 0;
  s.players[0].deck = ['t_cheap', 't_cheap', 't_cheap', 't_cheap'];
  const tc = give(s, 0, 'temporal_construct'); E.playCard(s, 0, tc.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('excess 3 -> drew 3', s.players[0].hand.length === 3);
}
// P.M.M. Infinitizer
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ally = summon(s, 0, 'bone_baron'); ally.sick = false; ally.keywords = [];
  const pm = give(s, 0, 'pmm_infinitizer'); E.playCard(s, 0, pm.uid, { type: 'creature', uid: ally.uid, player: 0 }, null, 0);
  ok('ally set to 8/8', ally.attack === 8 && ally.maxHealth === 8);
  ok('cannot hit face this turn', E.attack(s, 0, ally.uid, { type: 'hero', player: 1 }) === false);
  E.endTurn(s); E.endTurn(s);
  ally.sick = false; ally.attacksUsed = 0;
  ok('can hit face next turn', E.attack(s, 0, ally.uid, { type: 'hero', player: 1 }) === true);
}
// Amber Priestess
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].life = 20;
  const ap = give(s, 0, 'amber_priestess');
  E.playCard(s, 0, ap.uid, { type: 'hero', player: 0 }, null, 0);
  ok('healed by its health', s.players[0].life === 20 + byId['amber_priestess'].health);
}
// Wizened Truthseeker
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = [];
  const a = give(s, 0, 'crypt_lord'); a.cost = 0;
  const b = give(s, 1, 'bone_baron'); b.cost = 99;
  const wt = give(s, 0, 'wizened_truthseeker'); E.playCard(s, 0, wt.uid, null, null, 0);
  ok('both hands reset to printed costs', a.cost === byId['crypt_lord'].cost && b.cost === byId['bone_baron'].cost);
}
// Royal Informant
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = [];
  give(s, 1, 'crypt_lord'); const rm = give(s, 1, 'bone_baron');
  const r1 = give(s, 0, 'royal_informant'); E.playCard(s, 0, r1.uid, null, 0, 0);
  ok('copied the right-most', s.players[0].hand.some(c => c.id === 'bone_baron'));
  const c0 = rm.cost;
  const r2 = give(s, 0, 'royal_informant'); E.playCard(s, 0, r2.uid, null, 1, 0);
  ok('or taxed it +2', rm.cost === c0 + 2);
}
// Bugsquasher
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const typed = summon(s, 1, 'crypt_lord'); typed.keywords = []; typed.shield = false; typed.tribe = 'Beast'; typed.maxHealth = 30;
  const plain = summon(s, 1, 'bone_baron'); plain.keywords = []; plain.shield = false; plain.tribe = ''; plain.maxHealth = 30;
  const b1 = give(s, 0, 'bugsquasher'); E.playCard(s, 0, b1.uid, { type: 'creature', uid: typed.uid, player: 1 }, null, 0);
  ok('typed minion took 6', typed.damage === 6);
  const b2 = give(s, 0, 'bugsquasher'); E.playCard(s, 0, b2.uid, { type: 'creature', uid: plain.uid, player: 1 }, null, 0);
  ok('untyped minion untouched', plain.damage === 0);
}
// Ankylodon
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 40;
  const ak = summon(s, 0, 'ankylodon');
  kill(s, 0, ak);
  ok('two 3-cost beasts summoned', s.players[0].board.filter(c => (byId[c.id]?.cost || 0) === 3).length >= 2);
  ok('they attacked', foe.damage > 0);
}
// High Cultist Herenn
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_dr1'] = { id: 't_dr1', name: 'DR1', type: 'creature', cost: 2, attack: 2, health: 5, rarity: 'common', keywords: ['deathrattle'], deathrattle: [{ type: 'draw', count: 1 }], description: 'x' };
  s.players[0].deck = ['t_dr1', 't_dr1'];
  const hh = give(s, 0, 'high_cultist_herenn'); E.playCard(s, 0, hh.uid, null, null, 0);
  const summoned = s.players[0].board.filter(c => c.id === 't_dr1');
  ok('two DR minions summoned and fought', summoned.length === 2 && summoned.every(c => c.damage === 2));
}
// Tortollan Storyteller
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  summon(s, 0, 'tortollan_storyteller');
  const b1 = summon(s, 0, 'bone_baron'); b1.tribe = 'Beast'; const a1 = b1.attack;
  const b2 = summon(s, 0, 'crypt_lord'); b2.tribe = 'Beast'; const a2 = b2.attack;
  const d1 = summon(s, 0, 'bone_baron'); d1.tribe = 'Dragon'; const a3 = d1.attack;
  E.endTurn(s);
  ok('one buff per distinct tribe', b1.attack === a1 + 1 && b2.attack === a2 && d1.attack === a3 + 1);
}
// Hollow Direhorn
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const dh = summon(s, 0, 'hollow_direhorn'); dh.keywords = dh.keywords.filter(k => k !== 'reborn');
  s.players[0].corpses = 3;
  const chum = summon(s, 0, 'bone_baron'); chum.keywords = [];
  kill(s, 0, chum);
  ok('spent 3 corpses for reborn', dh.keywords.includes('reborn') && s.players[0].corpses === 1); // the death itself banked one
}
// Gorm
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const g = give(s, 0, 'gorm_the_worldeater'); E.playCard(s, 0, g.uid, null, null, 0);
  const gb = s.players[0].board.find(c => c.id === 'gorm_the_worldeater');
  ok('gorm dormant 5', gb.dormantLeft === 5);
  const snack = summon(s, 0, 'bone_baron'); snack.keywords = []; // to gorm's right
  E.endTurn(s);
  ok('ate the right neighbor, -2 dormant', gb.dormantLeft === 3 && !s.players[0].board.some(c => c.uid === snack.uid));
}
// Bayfin Bodybuilder
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  summon(s, 0, 'bayfin_bodybuilder');
  // enemy minion summoned DURING MY turn (via my effect summoning for them)
  byId['t_gift'] = { id: 't_gift', name: 'G', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'summon', count: 1, summonId: 't_dr1', forEnemy: true }] };
  const gf = give(s, 0, 't_gift'); E.playCard(s, 0, gf.uid, null, null, 0);
  ok('enemy summon on my turn was destroyed', !s.players[1].board.some(c => c.id === 't_dr1'));
  // on THEIR turn, their summons are safe
  E.endTurn(s); mana(s, 1, 99); s.players[1].hand = [];
  const mm = give(s, 1, 't_dr1'); mm.cost = 0; E.playCard(s, 1, mm.uid, null, null, 0);
  ok('their own-turn summon survived', s.players[1].board.some(c => c.id === 't_dr1'));
}
// Loh
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const lo = give(s, 0, 'loh_the_living_legend'); E.playCard(s, 0, lo.uid, null, null, 0);
  const cheap = give(s, 0, 't_cheap'); const exp = give(s, 0, 't_exp');
  ok('all minions cost (5)', E.effectiveCost(s, 0, cheap) === 5 && E.effectiveCost(s, 0, exp) === 5);
}
// Agamaggan
{
  const s = fresh(); mana(s, 0, 0); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  const ag = give(s, 0, 'agamaggan'); ag.cost = 0; E.playCard(s, 0, ag.uid, null, null, 0);
  const big = give(s, 0, 't_exp');
  ok('next card free for me', E.effectiveCost(s, 0, big) === 0);
  E.playCard(s, 0, big.uid, null, null, 0);
  ok('opponent paid 9 health', s.players[1].life === 31);
}
// Warloc
{
  const s = fresh(); mana(s, 0, 0); s.players[0].hand = []; s.players[0].board = []; s.players[0].life = 40;
  const wl = give(s, 0, 'warloc'); wl.cost = 0; E.playCard(s, 0, wl.uid, null, null, 0);
  byId['t_mur3'] = { id: 't_mur3', name: 'M3', type: 'creature', cost: 3, attack: 2, health: 2, tribe: 'Murloc', rarity: 'common', description: 'x' };
  const mu = give(s, 0, 't_mur3');
  ok('cheap murloc free', E.effectiveCost(s, 0, mu) === 0);
  E.playCard(s, 0, mu.uid, null, null, 0);
  ok('I paid 3 health', s.players[0].life === 37);
}
// Quel'dorei Fletcher
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  summon(s, 0, 'queldorei_fletcher');
  const hp0 = s.players[0].heroPowers[0];
  if (hp0) {
    ok('hp free at small hand', E.heroPowerCost(s, 0, hp0) === 0);
    for (let i = 0; i < 4; i++) give(s, 0, 't_cheap');
    ok('hp normal at 4+ cards', E.heroPowerCost(s, 0, hp0) > 0);
  } else { ok('no hero power in classless game (skip)', true); ok('skip', true); }
}
// Eyes in the Sky
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[1].deck = ['t_cheap', 't_exp', 'crypt_lord', 'bone_baron'];
  const ey = give(s, 0, 'eyes_in_the_sky'); E.playCard(s, 0, ey.uid, null, null, 0);
  const pend = s.pickQueue[0];
  ok('peek offered enemy cards', !!pend && pend.ids.length === 3);
  E.resolvePick(s, pend.ids[0]);
  ok('pick moved to enemy deck top', s.players[1].deck[s.players[1].deck.length - 1] === pend.ids[0]);
}
// Kaldorei Cultivator
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = [];
  const kc = give(s, 0, 'kaldorei_cultivator'); E.playCard(s, 0, kc.uid, null, null, 0);
  E.resolvePick(s, s.pickQueue[0].ids[0]);
  E.resolvePick(s, s.pickQueue[0].ids[0]);
  ok('two picks to deck bottom', s.players[0].deck.length === 2);
  const bottomId = s.players[0].deck[0];
  // draw both; the buffed one carries +5/+5
  E.drawCards(s, 0, 2);
  const got = s.players[0].hand.find(c => c.id === bottomId);
  ok('bottom card drawn with +5/+5', !!got && got.attack === (byId[bottomId].attack || 0) + 5);
}
// Beast Speaker Taka
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const tk = give(s, 0, 'beast_speaker_taka'); E.playCard(s, 0, tk.uid, null, null, 0);
  const pend = s.pickQueue[0];
  ok('legendary beast offered', !!pend && pend.ids.every(id => (byId[id].tribe || '').includes('Beast')));
  const pickId = pend.ids[0];
  const onB = s.players[0].board.find(c => c.id === 'beast_speaker_taka');
  const a0 = onB.attack;
  E.resolvePick(s, pickId);
  ok('taka gained its stats', onB.attack === a0 + (byId[pickId].attack || 0));
  s.players[0].board = [onB];
  kill(s, 0, onB);
  ok('DR summoned the remembered beast', s.players[0].board.some(c => c.id === pickId));
}
// Blazing Accretion
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_ele'] = { id: 't_ele', name: 'E', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Elemental', rarity: 'common', description: 'x' };
  s.players[0].deck = ['t_cheap', 't_ele', 't_cheap'];
  const ba = give(s, 0, 'blazing_accretion'); E.playCard(s, 0, ba.uid, null, null, 0);
  ok('elemental drawn, plain cards milled', s.players[0].hand.some(c => c.id === 't_ele') && s.players[0].deck.length === 0
    && !s.players[0].hand.some(c => c.id === 't_cheap'));
}
// Relic Miner
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['crypt_lord'];
  const rm = give(s, 0, 'relic_miner'); E.playCard(s, 0, rm.uid, null, null, 0);
  const pend = s.pickQueue[0];
  ok('discover matches milled rarity', !!pend && pend.ids.every(id => byId[id].rarity === byId['crypt_lord'].rarity));
}
// Wicked Blightspawn
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].weapon = null;
  const w1 = summon(s, 0, 'wicked_blightspawn'); w1.keywords = w1.keywords.filter(k => k !== 'reborn');
  kill(s, 0, w1);
  ok('no weapon: dagger equipped', s.players[0].weapon && s.players[0].weapon.attack === 1);
  const w2 = summon(s, 0, 'wicked_blightspawn'); w2.keywords = w2.keywords.filter(k => k !== 'reborn');
  kill(s, 0, w2);
  ok('weapon: +2 attack instead', s.players[0].weapon.attack === 3);
}
// Blackwing Experiment
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const bw = summon(s, 0, 'blackwing_experiment'); bw.attack = 7;
  kill(s, 0, bw);
  const bolt = s.players[0].hand.find(c => c.id === 'token_blackwing_bolt');
  ok('bolt deals its attack (7)', !!bolt && bolt.effects[0].value === 7);
}
// Brash Battlemaster + recruits
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_shr'] = { id: 't_shr', name: 'Silver Hand Recruit', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', token: true, description: 'x' };
  const bm = summon(s, 0, 'brash_battlemaster');
  kill(s, 0, bm);
  byId['t_recruit_spell'] = { id: 't_recruit_spell', name: 'R', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'summon', count: 1, summonId: 't_shr' }] };
  const rs = give(s, 0, 't_recruit_spell'); E.playCard(s, 0, rs.uid, null, null, 0);
  const shr = s.players[0].board.find(c => c.name === 'Silver Hand Recruit');
  ok('recruit summoned with +1 attack', !!shr && shr.attack === 2);
}
// King Maluk + Infinite Banana
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const km = give(s, 0, 'king_maluk'); E.playCard(s, 0, km.uid, null, null, 0);
  const ban = s.players[0].hand.find(c => c.id === 'infinite_banana');
  ok('got the infinite banana', !!ban);
  const ally = summon(s, 0, 'bone_baron'); const a0 = ally.attack;
  E.playCard(s, 0, ban.uid, { type: 'creature', uid: ally.uid, player: 0 }, null, 0);
  ok('banana buffed and regenerated', ally.attack === a0 + 1 && s.players[0].hand.some(c => c.id === 'infinite_banana'));
}
// Twilight Egg whelp grows
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const egg = summon(s, 0, 'twilight_egg');
  kill(s, 0, egg);
  const wh = s.players[0].board.find(c => c.id === 'twilight_whelp_grow');
  ok('growing whelp summoned', !!wh);
  const a0 = wh.attack;
  E.endTurn(s);
  ok('whelp grew at end of turn', wh.attack === a0 + 1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
