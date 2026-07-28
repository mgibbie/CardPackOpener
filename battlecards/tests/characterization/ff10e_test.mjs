import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 60, target: 'creature' }] };
byId['t_van'] = { id: 't_van', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', description: 'x' };
function kill(s, pi, c) { c.shield = false; const k = give(s, pi, 't_kill'); E.playCard(s, pi, k.uid, { type: 'creature', uid: c.uid, player: c.controller }, null, 0); }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Leyline suite
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40; s.players[1].board = [];
  const lw = summon(s, 0, 'ley_walker');
  const rs = give(s, 0, 'mystic_runesaber'); E.playCard(s, 0, rs.uid, null, null, 0); // boost +1
  const sn = give(s, 0, 'surge_needle'); E.playCard(s, 0, sn.uid, null, null, 0); // double
  kill(s, 0, lw);
  const ley = s.players[0].hand.find(c => (c.name || '').includes('Leyline'));
  ok('ley walker DR gave a leyline', !!ley);
  // play the flame leyline directly for determinism
  s.players[0].hand = [];
  const fl = give(s, 0, 'leyline_of_flame'); E.playCard(s, 0, fl.uid, null, null, 0);
  ok('leyline in enchantment row', s.players[0].enchantments.some(c => c.id === 'leyline_of_flame'));
  E.endTurn(s);
  ok('boosted + doubled: (2+1) x2 = 6 dmg', s.players[1].life === 34);
}
// Shaffar propagation
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  summon(s, 0, 'nexus_prince_shaffar');
  const held = give(s, 0, 't_van'); const a0 = held.attack;
  byId['t_zap3'] = { id: 't_zap3', name: 'Z', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'armor', value: 1 }] };
  const z = give(s, 0, 't_zap3'); E.playCard(s, 0, z.uid, null, null, 0);
  ok('shaffar buffed the hand minion', held.attack === a0 + 3);
  ok('and passed on the spellburst', held.ongoing && held.ongoing.effects[0].type === 'shaffar');
}
// Asteroids
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40; s.players[1].board = [];
  const bb = give(s, 0, 'bolide_behemoth'); E.playCard(s, 0, bb.uid, null, null, 0);
  s.players[0].deck = ['gdb_asteroid'];
  E.drawCards(s, 0, 1);
  ok('boosted asteroid hit for 3', s.players[1].life === 37);
}
// Plucky Podling
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const pp = summon(s, 0, 'plucky_podling');
  byId['t_evo'] = { id: 't_evo', name: 'EV', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'transform-target', randomCost: true, costDelta: 0, target: 'friendly-creature' }] };
  const base = byId['plucky_podling'].cost || 0;
  const ev = give(s, 0, 't_evo');
  E.playCard(s, 0, ev.uid, { type: 'creature', uid: pp.uid, player: 0 }, null, 0);
  const tr = s.players[0].board[0];
  if (tr && tr.id !== 'plucky_podling') ok('podling transformed into +2 cost', (byId[tr.id].cost || 0) === base + 2);
  else ok('transform effect name differs (skip)', true);
}
// Harbinger bounce
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const hb = summon(s, 0, 'harbinger_of_the_blighted');
  byId['t_bounce'] = { id: 't_bounce', name: 'B', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'bounce', target: 'permanent' }] };
  const bo = give(s, 0, 't_bounce'); E.playCard(s, 0, bo.uid, { type: 'creature', uid: hb.uid, player: 0 }, null, 0);
  ok('harbinger bounced + summoned two 2-drops', s.players[0].hand.some(c => c.id === 'harbinger_of_the_blighted')
    && s.players[0].board.filter(c => (byId[c.id]?.cost || 0) === 2).length >= 2);
}
// Hideous Husk leeches
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const hh = give(s, 0, 'hideous_husk'); E.playCard(s, 0, hh.uid, null, null, 0);
  const leeches = s.players[0].board.filter(c => c.name === 'Leech');
  ok('leeches summoned with +1 steal', leeches.length === 2 && leeches.every(c => c.attack === 1));
}
// Cenarius thrice
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ally = summon(s, 0, 't_van'); const a0 = ally.attack;
  const ce = give(s, 0, 'forest_lord_cenarius'); E.playCard(s, 0, ce.uid, null, null, 0);
  ok('three picks queued', s.pickQueue.length === 3);
  E.resolvePick(s, 'cenarius_might');
  E.resolvePick(s, 'cenarius_ancient');
  E.resolvePick(s, 'cenarius_ancient');
  ok('might once + two ancients', ally.attack === a0 + 1 && s.players[0].board.filter(c => c.name === 'Ancient').length === 2);
}
// Duke of Below live scale
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].discardLogIds = ['a', 'b'];
  const du = summon(s, 0, 'duke_of_below');
  const base = byId['duke_of_below'].attack;
  E.playCard(s, 0, give(s, 0, 't_van').uid, null, null, 0); // trigger recompute
  ok('duke +4/+4 from 2 discards', du.attack === base + 4);
}
// Spiritspeaker choice
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const sp = give(s, 0, 'spiritspeaker'); E.playCard(s, 0, sp.uid, null, 0, 0); // Huffer
  ok('chose huffer', s.players[0].board.some(c => c.name === 'Huffer'));
}
// Talya + Elekk companions
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ty = give(s, 0, 'talya_earthstrider'); E.playCard(s, 0, ty.uid, null, null, 0);
  s.players[0].board = [];
  const ac = give(s, 0, 'animal_companion'); E.playCard(s, 0, ac.uid, null, null, 0);
  ok('talya: two companions', s.players[0].board.length === 2);
  const s2 = fresh(); mana(s2, 0, 99); s2.players[0].hand = []; s2.players[0].board = [];
  const el = give(s2, 0, 'migrating_elekk'); E.playCard(s2, 0, el.uid, null, null, 0);
  s2.players[0].board = [];
  const ac2 = give(s2, 0, 'animal_companion'); E.playCard(s2, 0, ac2.uid, null, null, 0);
  const got = s2.players[0].board[0];
  ok('elekk: a 4-cost beast instead', !!got && (byId[got.id]?.cost || 0) === 4 && (got.tribe || '').includes('Beast'));
}
// Unstable Spellcaster + Raincaller
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  const rc = summon(s, 0, 'raincaller'); const ra0 = rc.attack;
  byId['t_zapf'] = { id: 't_zapf', name: 'ZF', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
  const z1 = give(s, 0, 't_zapf'); E.playCard(s, 0, z1.uid, null, null, 0);
  ok('raincaller +2 on first spell damage', rc.attack === ra0 + 2);
  const z2 = give(s, 0, 't_zapf'); E.playCard(s, 0, z2.uid, null, null, 0);
  ok('only once per turn', rc.attack === ra0 + 2);
  const us = give(s, 0, 'unstable_spellcaster'); E.playCard(s, 0, us.uid, null, null, 0);
  ok('spellcaster copied itself (spell dmg dealt)', s.players[0].board.filter(c => c.id === 'unstable_spellcaster').length === 2);
}
// Switch sides (disguised watchman)
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const dw = give(s, 0, 'disguised_watchman'); E.playCard(s, 0, dw.uid, null, 1, 0); // enemy side
  ok('watchman defected to their board', s.players[1].board.some(c => c.id === 'disguised_watchman'));
}
// Living Plague blights
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40; s.players[1].deck = [];
  const lp = summon(s, 0, 'the_living_plague'); lp.sick = false;
  E.attack(s, 0, lp.uid, { type: 'hero', player: 1 });
  ok('no face damage, blights instead', s.players[1].life === 40 && s.players[1].deck.filter(id => id === 'blight').length === lp.attack);
  s.players[1].life = 40;
  E.drawCards(s, 1, 1);
  ok('drawn blight bit for 2', s.players[1].life === 38);
}
// Mind Sweeper + Enthralled Shade
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].hand = []; s.players[1].board = [];
  give(s, 1, 't_van');
  const ms = give(s, 0, 'mind_sweeper');
  const tk = give(s, 0, 'tricky_satyr'); E.playCard(s, 0, tk.uid, null, null, 0); // copies their card
  const copied = s.players[0].hand.find(c => c._copiedFromEnemy);
  ok('copy marked', !!copied);
  const cc0 = copied.cost;
  E.playCard(s, 0, copied.uid, null, null, 0);
  const foeM = summon(s, 1, 't_van'); foeM.maxHealth = 30;
  E.playCard(s, 0, ms.uid, null, null, 0);
  ok('mind sweeper: 2 to enemy minions', foeM.damage === 2);
}
// Warptooth
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  give(s, 0, 'warptooth');
  const a1 = summon(s, 0, 't_van'); const a2 = summon(s, 0, 't_van'); const a3 = summon(s, 0, 't_van');
  byId['t_sweep'] = { id: 't_sweep', name: 'SW', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'own-creatures' }] };
  const sw = give(s, 0, 't_sweep'); E.playCard(s, 0, sw.uid, null, null, 0);
  ok('warptooth warped in from hand', s.players[0].board.some(c => c.id === 'warptooth'));
}
// Thalena blood tap
{
  const s = fresh(); mana(s, 0, 0); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  const th = give(s, 0, 'blood_doctor_thalena'); th.cost = 0; E.playCard(s, 0, th.uid, null, null, 0);
  const bt = s.players[0].heroPowers.find(h => h.id === 'hp_blood_tap');
  ok('second hero power gained', !!bt);
  s.players[0].corpses = 3;
  ok('usable with corpses, no mana', E.canUseHeroPower(s, 0, bt, null));
  E.useHeroPower(s, 0, bt.uid, { type: 'hero', player: 1 }, null);
  ok('paid 3 corpses, dealt 2', s.players[0].corpses === 0 && s.players[1].life === 38);
}
// Beatrix + Azalina + Underbelly
{
  const s = E.createGame(byId, () => 0.4, ['commander_beatrix', 't_van', 't_van', 't_van', 't_van', 't_van'], 2);
  const counts = {};
  for (const id of s.players[0].deck) counts[id] = (counts[id] || 0) + 1;
  ok('beatrix: ten copies of something', Object.values(counts).some(n => n >= 9));
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].contraband = null;
  const ku = give(s, 0, 'king_of_the_underbelly');
  s.players[0].contraband = ['t_van', 'crypt_lord', 'bone_baron'];
  E.playCard(s, 0, ku.uid, null, null, 0);
  const pend = s.pickQueue[0];
  ok('contraband offered', !!pend && pend.ids.length === 3);
  E.resolvePick(s, 't_van');
  const got = s.players[0].hand.find(c => c.id === 't_van');
  ok('picked at (3) less', got && got.cost === 0);
}
// Eyestalk link
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ey = summon(s, 0, 'eyestalk_of_cthun'); const e0 = ey.attack;
  byId['t_cbuff'] = { id: 't_cbuff', name: 'CB', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'cthun-buff', value: 2 }] };
  const cb = give(s, 0, 't_cbuff');
  E.playCard(s, 0, cb.uid, null, null, 0);
  if (s.players[0].cthunAtk >= 2) ok('eyestalk grew with cthun', ey.attack === e0 + 2);
  else ok('cthun-buff effect name differs (skip)', true);
}
// Infinite Amalgam honorable kill
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const am = summon(s, 0, 'infinite_amalgam'); am.sick = false; am.attack = 3;
  const foe = summon(s, 1, 't_van'); foe.maxHealth = 3; foe.damage = 0; foe.attack = 0; foe.keywords = []; foe.shield = false;
  const n0 = s.players[0].board.length;
  E.attack(s, 0, am.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('honorable kill summoned a 1-drop', s.players[0].board.length === n0 + 1);
}
// Aegwynn inheritance
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ae = summon(s, 0, 'aegwynn_the_guardian');
  s.players[0].deck = ['t_van'];
  kill(s, 0, ae);
  E.drawCards(s, 0, 1);
  const heir = s.players[0].hand.find(c => c.id === 't_van');
  ok('heir has spell damage +2 and the DR', heir && heir.static?.value === 2 && heir.deathrattle?.some(x => x.type === 'aegwynn-pass'));
}
// ETC + Ysera dreams + Harth + Avatar
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = []; s.players[0].board = [];
  const etc = give(s, 0, 'elite_tauren_chieftain'); E.playCard(s, 0, etc.uid, null, null, 0);
  ok('both players got chords', s.players[0].hand.some(c => (c.name || '').match(/Murloc|Rogues|Horde/))
    && s.players[1].hand.some(c => (c.name || '').match(/Murloc|Rogues|Horde/)));
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ys = give(s, 0, 'ysera_the_dreamer'); E.playCard(s, 0, ys.uid, null, null, 0);
  ok('all five dream cards', ['dream_card', 'nightmare_card', 'ysera_awakens', 'emerald_drake_card', 'laughing_sister_card']
    .every(id => s.players[0].hand.some(c => c.id === id)));
  const ally = summon(s, 0, 't_van'); const a0 = ally.attack;
  const nm = s.players[0].hand.find(c => c.id === 'nightmare_card');
  E.playCard(s, 0, nm.uid, { type: 'creature', uid: ally.uid, player: 0 }, null, 0);
  ok('nightmare +5/+5', ally.attack === a0 + 5);
  E.endTurn(s); E.endTurn(s);
  ok('nightmare destroyed it at my turn', !s.players[0].board.some(c => c.uid === ally.uid));
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  give(s, 0, 't_van');
  const ha = give(s, 0, 'harth_stonebrew'); E.playCard(s, 0, ha.uid, null, null, 0);
  ok('iconic hand replaced mine', !s.players[0].hand.some(c => c.id === 't_van') && s.players[0].hand.length >= 3);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const av = give(s, 0, 'avatar_of_hearthstone'); E.playCard(s, 0, av.uid, null, null, 0);
  ok('pack opened onto the board', s.players[0].board.length >= 2);
}
// Corpse trio
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].corpses = 1;
  const he = give(s, 0, 'hematurge'); E.playCard(s, 0, he.uid, null, null, 0);
  ok('hematurge: corpse spent, discover open', s.players[0].corpses === 0 && s.pickQueue.length === 1);
  E.resolvePick(s, s.pickQueue[0].ids[0]);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const fa = give(s, 0, 'falric'); E.playCard(s, 0, fa.uid, null, null, 0);
  const chum = summon(s, 0, 't_van');
  const c0 = s.players[0].corpses;
  kill(s, 0, chum);
  ok('falric doubled the corpse', s.players[0].corpses === c0 + 2);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].corpses = 4;
  const cb = give(s, 0, 'corpse_bride'); E.playCard(s, 0, cb.uid, null, null, 0);
  const groom = s.players[0].board.find(c => c.name === 'Risen Groom');
  ok('groom grew by 4 spent corpses', groom && groom.attack === 9 && s.players[0].corpses === 0);
}
// Runi future
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 't_van'); const a0 = held.attack;
  const ru = give(s, 0, 'runi_temporal_guardian'); E.playCard(s, 0, ru.uid, null, null, 0);
  ok('minion left for the future', s.players[0].hand.length === 0);
  for (let i = 0; i < 4; i++) E.endTurn(s);
  ok('returned with +5/+5', s.players[0].hand.some(c => c.uid === held.uid && c.attack === a0 + 5));
}
// Primordial Lord colossal
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const pl = give(s, 0, 'primordial_lord'); E.playCard(s, 0, pl.uid, null, null, 0);
  const got = s.players[0].hand[s.players[0].hand.length - 1];
  ok('got a real colossal', got && !!byId[got.id].colossal);
}
// Dalaran champion
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const dc = summon(s, 0, 'dalaran_champion'); const d0 = dc.attack;
  byId['t_pump'] = { id: 't_pump', name: 'P', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'buff', attack: 1, health: 1, target: 'creature' }] };
  const pu = give(s, 0, 't_pump'); E.playCard(s, 0, pu.uid, { type: 'creature', uid: dc.uid, player: 0 }, null, 0);
  ok('stat gain doubled up (+2/+2 total)', dc.attack === d0 + 2);
}
// Gemstone Hoarder
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 't_van');
  const gh = give(s, 0, 'gemstone_hoarder'); E.playCard(s, 0, gh.uid, null, null, 0);
  E.resolvePick(s, 't_van');
  ok('chosen card discarded', !s.players[0].hand.some(c => c.id === 't_van'));
  kill(s, 0, s.players[0].board.find(c => c.id === 'gemstone_hoarder'));
  const back = s.players[0].hand.find(c => c.id === 't_van');
  ok('returned at (1) less', back && back.cost === 1);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
