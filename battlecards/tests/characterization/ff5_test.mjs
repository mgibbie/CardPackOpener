import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// dual tribes synced from HS data
ok('firegill is Elemental/Murloc', byId['firegill'].tribe === 'Elemental/Murloc');
ok('diabolus rex is Demon/Beast', byId['diabolus_rex'].tribe === 'Demon/Beast');

// Kindred OFF: no type-mate on board
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const sq = give(s, 0, 'silithid_queen'); E.playCard(s, 0, sq.uid, null, null, 0);
  ok('silithid inert without type-mate', (s.players[0].heroTempAttack || 0) === 0);
}
// Kindred ON: another Beast on board
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const b = summon(s, 0, 'bone_baron'); b.tribe = 'Beast';
  const sq = give(s, 0, 'silithid_queen'); E.playCard(s, 0, sq.uid, null, null, 0);
  ok('silithid kindred: hero +5', (s.players[0].heroTempAttack || 0) === 5);
}
// Dual-tribe activation: Firegill (Ele/Murloc) activates off a Murloc
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const m = summon(s, 0, 'bone_baron'); m.tribe = 'Murloc';
  const fg = give(s, 0, 'firegill'); E.playCard(s, 0, fg.uid, null, null, 0);
  ok('firegill kindred via murloc: others got rush', s.players[0].board.find(x => x.uid === m.uid).keywords.includes('rush'));
}
// 'All' tribe: Crater Experiment activates off anything typed
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const b = summon(s, 0, 'bone_baron'); b.tribe = 'Dragon';
  const ce = give(s, 0, 'crater_experiment'); E.playCard(s, 0, ce.uid, null, null, 0);
  ok('crater experiment (All) copied itself', s.players[0].board.filter(x => x.id === 'crater_experiment').length === 2);
}
// Primalfin: next Kindred fires twice
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const pf = give(s, 0, 'primalfin_challenger'); E.playCard(s, 0, pf.uid, null, null, 0); // Murloc on board now
  const st = give(s, 0, 'steamfin_thief'); E.playCard(s, 0, st.uid, null, null, 0); // kindred via primalfin (Murloc)
  ok('primalfin doubled steamfin (4 murlocs)', s.players[0].board.filter(x => x.id === 'tlc_murloc_rush').length === 4);
  ok('double-fire consumed', s.players[0].nextKindredTwice === false);
}
// Kindred cost reduction: Pterrorwing cheaper with a Beast out
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const pt = give(s, 0, 'pterrorwing_ravager');
  ok('pterrorwing full price alone', E.effectiveCost(s, 0, pt) === 6);
  const b = summon(s, 0, 'bone_baron'); b.tribe = 'Beast';
  ok('pterrorwing -2 with a beast out', E.effectiveCost(s, 0, pt) === 4);
}
// Devilsaur: stats only with kindred
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const e1 = summon(s, 1, 'crypt_lord'); e1.keywords = []; e1.attack = 4; e1.maxHealth = 5; e1.damage = 0;
  const rd = give(s, 0, 'ravenous_devilsaur'); E.playCard(s, 0, rd.uid, { type: 'creature', uid: e1.uid, player: 1 }, null, 0);
  const onB = s.players[0].board.find(x => x.id === 'ravenous_devilsaur');
  ok('devilsaur alone: destroy but NO stats', onB.attack === 3);
}
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const b = summon(s, 0, 'bone_baron'); b.tribe = 'Beast';
  const e1 = summon(s, 1, 'crypt_lord'); e1.keywords = []; e1.attack = 4; e1.maxHealth = 5; e1.damage = 0;
  const rd = give(s, 0, 'ravenous_devilsaur'); E.playCard(s, 0, rd.uid, { type: 'creature', uid: e1.uid, player: 1 }, null, 0);
  const onB = s.players[0].board.find(x => x.id === 'ravenous_devilsaur');
  ok('devilsaur kindred: gained stats', onB.attack === 3 + 4 && onB.maxHealth === 3 + 5);
}
// Scalehide Kodo: lowest alone, highest with kindred
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const b = summon(s, 0, 'bone_baron'); b.tribe = 'Beast';
  const low = summon(s, 1, 'crypt_lord'); low.keywords = []; low.attack = 1;
  const high = summon(s, 1, 'bone_baron'); high.attack = 9; high.tribe = '';
  const sk = give(s, 0, 'scalehide_kodo'); E.playCard(s, 0, sk.uid, null, null, 0);
  ok('kodo kindred destroyed the HIGHEST', !s.players[1].board.some(x => x.uid === high.uid && x.damage < x.maxHealth) && s.players[1].board.some(x => x.uid === low.uid));
}
// Razidir: kindred -> enemy discards
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = []; s.players[1].hand = [];
  give(s, 1, 'bone_baron');
  const b = summon(s, 0, 'bone_baron'); b.tribe = 'Demon';
  const rz = give(s, 0, 'razidir'); E.playCard(s, 0, rz.uid, null, null, 0);
  ok('razidir kindred: enemy discarded', s.players[1].hand.length === 0);
}
// Torga: draws a kindred card + an activator
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  byId['t_beast2'] = { id: 't_beast2', name: 'B2', type: 'creature', tribe: 'Beast', cost: 2, attack: 2, health: 2, rarity: 'common' };
  s.players[0].deck = ['silithid_queen', 't_beast2', 'bone_baron'];
  const tg = give(s, 0, 'torga'); E.playCard(s, 0, tg.uid, null, null, 0);
  ok('torga drew the kindred card + a type-mate', s.players[0].hand.some(x => x.id === 'silithid_queen') && s.players[0].hand.some(x => x.id === 't_beast2'));
}
// City Chief Esho: all-Beast deck -> +2/+2 everywhere
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  s.players[0].deck = ['t_beast2', 't_beast2'];
  const ally = summon(s, 0, 'bone_baron'); ally.tribe = 'Beast'; const a0 = ally.attack;
  const held = give(s, 0, 't_beast2'); const ha0 = held.attack;
  const es = give(s, 0, 'city_chief_esho'); E.playCard(s, 0, es.uid, null, null, 0);
  ok('esho buffed board + hand', s.players[0].board.find(x => x.uid === ally.uid).attack === a0 + 2 && held.attack === ha0 + 2);
}
// Esho negative: mixed deck
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  s.players[0].deck = ['t_beast2', 'crypt_lord']; // crypt_lord untyped or different
  const ally = summon(s, 0, 'bone_baron'); ally.tribe = 'Beast'; const a0 = ally.attack;
  const es = give(s, 0, 'city_chief_esho'); E.playCard(s, 0, es.uid, null, null, 0);
  ok('esho inert on mixed deck', s.players[0].board.find(x => x.uid === ally.uid).attack === a0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
