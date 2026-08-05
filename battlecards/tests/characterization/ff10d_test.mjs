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

// Sanc'Azel flips into a location
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  const sa = summon(s, 0, 'sanc_azel'); sa.sick = false;
  E.attack(s, 0, sa.uid, { type: 'hero', player: 1 });
  ok('sanc azel became a location', s.players[0].board.some(c => c.id === 'sanc_azel_loc' && c.type === 'location')
    && !s.players[0].board.some(c => c.id === 'sanc_azel'));
}
// Vona threshold
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const v1 = give(s, 0, 'party_planner_vona'); E.playCard(s, 0, v1.uid, null, null, 0);
  ok('under 8: no ourobos', !s.players[0].board.some(c => c.id === 'ourobos'));
  s.players[0].ownTurnsDamage = 8; s.players[0].board = [];
  const v2 = give(s, 0, 'party_planner_vona'); E.playCard(s, 0, v2.uid, null, null, 0);
  ok('8+ own-turn damage: ourobos', s.players[0].board.some(c => c.id === 'ourobos'));
}
// Dungar
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_setA'] = { id: 't_setA', name: 'A', type: 'creature', cost: 1, attack: 1, health: 1, set: 'SETA', rarity: 'common', description: 'x' };
  byId['t_setB'] = { id: 't_setB', name: 'B', type: 'creature', cost: 1, attack: 1, health: 1, set: 'SETB', rarity: 'common', description: 'x' };
  byId['t_setC'] = { id: 't_setC', name: 'C', type: 'creature', cost: 1, attack: 1, health: 1, set: 'SETC', rarity: 'common', description: 'x' };
  s.players[0].deck = ['t_setA', 't_setA', 't_setB', 't_setC'];
  const du = give(s, 0, 'travelmaster_dungar'); E.playCard(s, 0, du.uid, null, null, 0);
  const setsOnBoard = new Set(s.players[0].board.filter(c => c.id.startsWith('t_set')).map(c => byId[c.id].set));
  ok('three minions from three different sets', setsOnBoard.size === 3);
}
// Anchorite overheal
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  summon(s, 0, 'anchorite');
  const ally = summon(s, 0, 't_van'); ally.damage = 1;
  byId['t_bigheal'] = { id: 't_bigheal', name: 'BH', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'heal', value: 5, target: 'creature' }] };
  const h = give(s, 0, 't_bigheal'); E.playCard(s, 0, h.uid, { type: 'creature', uid: ally.uid, player: 0 }, null, 0);
  ok('overheal 4 became max health', ally.maxHealth === 3 + 4);
}
// Doommaiden put-back
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].deck = ['t_van'];
  const dm = give(s, 0, 'doommaiden'); E.playCard(s, 0, dm.uid, null, null, 0);
  ok('stole from enemy deck', s.players[0].hand.some(c => c.id === 't_van') && s.players[1].deck.length === 0);
  E.endTurn(s);
  ok('unplayed: went back to them', !s.players[0].hand.some(c => c.id === 't_van') && (s.players[1].deck.includes('t_van') || s.players[1].hand.some(c => c.id === 't_van')));
}
// Galaxy Lens
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const nb = summon(s, 0, 'farseer_nobundo');
  kill(s, 0, nb);
  byId['t_sp1'] = { id: 't_sp1', name: 'S1', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'armor', value: 1 }] };
  const sp = give(s, 0, 't_sp1'); E.playCard(s, 0, sp.uid, null, null, 0);
  ok('lens returned a copy of the spell', s.players[0].hand.some(c => c.id === 't_sp1'));
  const sp2 = s.players[0].hand.find(c => c.id === 't_sp1');
  E.playCard(s, 0, sp2.uid, null, null, 0);
  ok('lens was one-shot', !s.players[0].hand.some(c => c.id === 't_sp1'));
}
// Illusionist
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const bi = give(s, 0, 'bloodthistle_illusionist'); E.playCard(s, 0, bi.uid, null, null, 0);
  const copies = s.players[0].board.filter(c => c.id === 'bloodthistle_illusionist');
  ok('copy summoned', copies.length === 2);
  const fake = copies.find(c => c.illusion);
  ok('one is secretly an illusion', !!fake);
  byId['t_ping2'] = { id: 't_ping2', name: 'P', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 1, target: 'creature' }] };
  const pg = give(s, 0, 't_ping2'); E.playCard(s, 0, pg.uid, { type: 'creature', uid: fake.uid, player: 0 }, null, 0);
  ok('illusion died to a poke', !s.players[0].board.some(c => c.uid === fake.uid));
}
// Emberscarred temp crystal
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = []; mana(s, 0, 5); s.players[0].mana.max = 5;
  const ew = give(s, 0, 'emberscarred_whelp'); ew.cost = 0; E.playCard(s, 0, ew.uid, null, null, 0);
  if (s.pickQueue.length) E.resolvePick(s, s.pickQueue[0].ids[0]);
  E.endTurn(s); E.endTurn(s);
  ok('crystal granted next turn', s.players[0].mana.max === 7); // 5 +1 ramp +1 temp
  E.endTurn(s); E.endTurn(s);
  ok('temp crystal expired', s.players[0].mana.max === 7); // 6 base +1 ramp, temp gone
}
// Qonzu
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].deck = [];
  const q = give(s, 0, 'qonzu'); E.playCard(s, 0, q.uid, null, null, 0);
  E.resolvePick(s, s.pickQueue[0].ids[0]);
  ok('ask queued', s.askQueue.length === 1);
  const picked = s.players[0].hand[s.players[0].hand.length - 1];
  E.resolveAsk(s, true);
  ok('gave it to the enemy deck top', !s.players[0].hand.some(c => c.uid === picked.uid) && s.players[1].deck[s.players[1].deck.length - 1] === picked.id);
}
// Alarashi
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 't_van'); held.attack = 9; held.cost = 3;
  const al = give(s, 0, 'alarashi'); E.playCard(s, 0, al.uid, null, null, 0);
  const tr = s.players[0].hand[0];
  ok('hand minion became a demon keeping stats', (byId[tr.id].tribe || '').includes('Demon') && tr.attack === 9 && tr.cost === 3);
}
// Flux Revenant redirect
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const fx = summon(s, 1, 'flux_revenant'); fx.shield = false;
  const a0 = fx.attack;
  byId['t_natdmg'] = { id: 't_natdmg', name: 'ND', type: 'sorcery', cost: 1, tribe: 'Nature', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 3, target: 'creature' }] };
  const nd = give(s, 0, 't_natdmg'); E.playCard(s, 0, nd.uid, { type: 'creature', uid: fx.uid, player: 1 }, null, 0);
  ok('nature damage became +2/+1', fx.damage === 0 && fx.attack === a0 + 2);
}
// Fins swap
{
  const s = fresh(); mana(s, 0, 99);
  const startIds = [...s.players[0].startingHandIds || []];
  s.players[0].hand = []; s.players[0].board = [];
  give(s, 0, 't_van');
  const fn = give(s, 0, 'the_fins_beyond_time'); E.playCard(s, 0, fn.uid, null, null, 0);
  ok('hand became the starting hand', startIds.length === 0 || s.players[0].hand.every(c => startIds.includes(c.id)));
  E.endTurn(s);
  ok('swapped back at end of turn', s.players[0].hand.some(c => c.id === 't_van'));
}
// Toki
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const tk = give(s, 0, 'timelooper_toki'); E.playCard(s, 0, tk.uid, null, null, 0);
  const gifts = s.players[0].hand.filter(c => c._tokiGroup != null);
  ok('3 toki spells', gifts.length === 3);
  // give both sides a couple of minions so any targeted random gift spell can resolve
  for (const pl of [0, 1]) for (let i = 0; i < 2; i++) { const m = E.instantiate({ id: 'toki_dummy', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 6 }, pl); m.zone = 'board'; m.sick = false; s.players[pl].board.push(m); }
  for (const g of [...gifts]) { g.cost = 0; const spec = E.targetSpec(s, 0, g, g.choices ? 0 : null); let tgt = null; if (spec) { const lg = E.legalTargets(s, 0, spec); tgt = lg.length ? lg[0] : null; } E.playCard(s, 0, g.uid, tgt, g.choices ? 0 : null, 0); }
  ok('playing all 3: another toki', s.players[0].hand.some(c => c.id === 'timelooper_toki'));
}
// Husk hero deathrattle
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].life = 5; s.players[0].armor = 0;
  const hu = give(s, 0, 'husk_eternal_reaper'); E.playCard(s, 0, hu.uid, null, null, 0);
  s.players[0].corpses = 12;
  s.current = 1; mana(s, 1, 99); s.players[1].hand = [];
  byId['t_nuke'] = { id: 't_nuke', name: 'N', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 30, target: 'enemy-hero' }] };
  const nk = give(s, 1, 't_nuke'); E.playCard(s, 1, nk.uid, null, null, 0);
  ok('hero resurrected with corpse health', s.players[0].life === 12 && s.players[0].corpses === 0 && !s.players[0].eliminated);
}
// Timeway Warden
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 't_van');
  const tw = give(s, 0, 'timeway_warden'); E.playCard(s, 0, tw.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('imprisoned', foe.dormantLeft > 9000);
  const twB = s.players[0].board.find(c => c.id === 'timeway_warden');
  kill(s, 0, twB);
  ok('freed on death', foe.dormantLeft === 0);
}
// Hooktail chest
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = []; s.players[1].hand = [];
  const ht = give(s, 0, 'time_admral_hooktail'); E.playCard(s, 0, ht.uid, null, null, 0);
  const chest = s.players[1].board.find(c => c.id === 'hooktail_chest');
  ok('chest on THEIR side', !!chest);
  kill(s, 0, chest);
  ok('breaking it paid ME 3 coins', s.players[0].hand.filter(c => c.id === 'coin').length === 3);
}
// Deios doubles
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  summon(s, 0, 'chrono_lord_deios');
  byId['t_bc1'] = { id: 't_bc1', name: 'BC', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common', keywords: ['battlecry'], description: 'x', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
  const bc = give(s, 0, 't_bc1'); E.playCard(s, 0, bc.uid, null, null, 0);
  ok('deios doubled the battlecry', s.players[1].life === 38);
}
// Endtime skip turn
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const em = give(s, 0, 'endtime_murozond'); E.playCard(s, 0, em.uid, null, null, 0);
  E.endTurn(s);
  ok('opponent turn 1', s.current === 1);
  E.endTurn(s);
  ok('opponent AGAIN (my turn skipped)', s.current === 1);
  E.endTurn(s);
  ok('now my turn', s.current === 0);
}
// Ash Worm
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const aw = give(s, 0, 'ash_worm'); E.playCard(s, 0, aw.uid, null, null, 0);
  const awB = s.players[0].board.find(c => c.id === 'ash_worm');
  ok('worm dormant', awB.dormantLeft > 0);
  byId['t_fill'] = { id: 't_fill', name: 'F', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'summon', count: 6, summonId: 't_van' }] };
  const fl = give(s, 0, 't_fill'); E.playCard(s, 0, fl.uid, null, null, 0);
  ok('full board woke it', awB.dormantLeft === 0);
}
// Crystalspine Cub
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = [];
  const cub = summon(s, 0, 'crystalspine_cub'); const a0 = cub.attack;
  mana(s, 0, 2);
  const v = give(s, 0, 't_van'); E.playCard(s, 0, v.uid, null, null, 0); // spends last 2 mana
  ok('cub grew on last mana', cub.attack === a0 + 1);
}
// Felwood / held-mana conds
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = [];
  mana(s, 0, 6); s.players[0].mana.max = 6;
  const fw = give(s, 0, 'felwood_treant');
  const v = give(s, 0, 't_van'); E.playCard(s, 0, v.uid, null, null, 0); // spend 2 while holding
  ok('held-mana tracked', fw._manaWhileHeld === 2);
  fw.cost = 0;
  E.playCard(s, 0, fw.uid, null, null, 0);
  ok('under 4: temporary crystal armed', (s.players[0].tempCrystalNext || 0) === 1 && s.players[0].mana.max === 6);
  const fw2 = give(s, 0, 'felwood_treant'); fw2.cost = 0; fw2._manaWhileHeld = 5;
  E.playCard(s, 0, fw2.uid, null, null, 0);
  ok('4+: permanent crystal', s.players[0].mana.max === 7);
}
// Wildspeaker
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0]._minionLastTurn = true;
  s.players[0].mana.cur = 3;
  const w1 = give(s, 0, 'wizened_wildspeaker'); w1.cost = 0; E.playCard(s, 0, w1.uid, null, null, 0);
  ok('played minion last turn: no refresh', s.players[0].mana.cur === 3);
  s.players[0]._minionLastTurn = false; s.players[0].board = [];
  const w2 = give(s, 0, 'wizened_wildspeaker'); w2.cost = 0; E.playCard(s, 0, w2.uid, null, null, 0);
  ok('no minion last turn: +3 mana', s.players[0].mana.cur === 6);
}
// Ebyssian
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const eb = give(s, 0, 'ebyssian'); E.playCard(s, 0, eb.uid, null, null, 0);
  byId['t_drag'] = { id: 't_drag', name: 'D', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Dragon', rarity: 'common', description: 'x' };
  const dr = give(s, 0, 't_drag'); E.playCard(s, 0, dr.uid, null, null, 0);
  ok('dragon has rush this game', s.players[0].board.find(c => c.id === 't_drag').keywords.includes('rush'));
}
// Morchok
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_c3'] = { id: 't_c3', name: 'C3', type: 'creature', cost: 3, attack: 1, health: 1, rarity: 'common', description: 'x' };
  s.players[0].deck = ['t_van', 't_c3']; // top = t_c3 (cost 3), then t_van (cost 2)
  const mo = give(s, 0, 'morchok'); E.playCard(s, 0, mo.uid, null, null, 0);
  const c3 = s.players[0].hand.find(c => c.id === 't_c3');
  const van = s.players[0].hand.find(c => c.id === 't_van');
  ok('morchok: both drawn free (3 then 7 excess)', c3 && c3.cost === 0 && van && van.cost === 0);
}
// Picklock
{
  const s = fresh(); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 't_van'); foe.maxHealth = 30;
  mana(s, 0, 7);
  const pk = give(s, 0, 'picklock'); pk.cost = 0; E.playCard(s, 0, pk.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  const pb = s.players[0].board.find(c => c.id === 'picklock');
  ok('picklock stats = remaining mana (7)', pb.attack === 7 && pb.maxHealth === 7);
  ok('damage = remaining mana', foe.damage === 7);
}
// Captured Archmage
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40; s.players[1].board = [];
  s.players[0].diedCountById = { captured_archmage: 4 };
  const ca = summon(s, 0, 'captured_archmage');
  kill(s, 0, ca);
  ok('5th copy death: fireball', s.players[1].life === 34);
}
// Irida void
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['t_van', 't_c3', 't_drag'];
  const ir = give(s, 0, 'irida_sinseeker'); E.playCard(s, 0, ir.uid, null, null, 0);
  ok('deck voided', s.players[0].deck.length === 0 && s.players[0].voidPile.length === 3);
  E.endTurn(s); E.endTurn(s);
  ok('2 returned from the void', s.players[0].voidPile.length === 1 && s.players[0].hand.length >= 2);
}
// R4T + Spire
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_sp5'] = { id: 't_sp5', name: 'S5', type: 'sorcery', cost: 5, rarity: 'common', description: 'x', effects: [{ type: 'armor', value: 1 }] };
  s.players[0].deck = ['t_sp5', 't_van'];
  const r4 = give(s, 0, 'r4t_c4tch3r'); E.playCard(s, 0, r4.uid, null, null, 0);
  ok('deck spells copied', s.players[0].deck.filter(id => id === 't_sp5').length === 2);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 't_van'); foe.maxHealth = 30;
  s.players[0].deck = ['t_sp5'];
  const sp = give(s, 0, 'spire_security'); E.playCard(s, 0, sp.uid, null, null, 0);
  ok('revealed 5-cost: volley fired', foe.damage === 5);
}
// Sightless Watcher
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['t_van', 't_c3', 't_drag', 't_sp5'];
  const sw = give(s, 0, 'sightless_watcher'); E.playCard(s, 0, sw.uid, null, null, 0);
  const pend = s.pickQueue[0];
  E.resolvePick(s, pend.ids[0]);
  ok('pick moved to MY deck top', s.players[0].deck[s.players[0].deck.length - 1] === pend.ids[0]);
}
// Felsoul Jailer
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].hand = [];
  give(s, 1, 't_van');
  const fj = give(s, 0, 'felsoul_jailer'); E.playCard(s, 0, fj.uid, null, null, 0);
  ok('enemy minion jailed', s.players[1].hand.length === 0);
  const fjB = s.players[0].board.find(c => c.id === 'felsoul_jailer');
  kill(s, 0, fjB);
  ok('returned on death', s.players[1].hand.some(c => c.id === 't_van'));
}
// Togwaggle mixer
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[1].hand = [];
  give(s, 0, 't_van'); give(s, 0, 't_c3');
  give(s, 1, 't_drag');
  const tg = give(s, 0, 'togwaggle_smuggler_king'); E.playCard(s, 0, tg.uid, null, null, 0);
  ok('hand counts preserved after mix', s.players[0].hand.length === 2 && s.players[1].hand.length === 1);
}
// Witch of the Arch-Thief
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  for (let i = 0; i < 3; i++) summon(s, 1, 't_van');
  const wt = give(s, 0, 'witch_of_the_arch_thief'); E.playCard(s, 0, wt.uid, null, null, 0);
  ok('voidwalkers until parity', s.players[0].board.filter(c => c.id === 'token_voidwalker').length >= 2);
}
// Deathwing
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  summon(s, 1, 't_van'); summon(s, 1, 't_van');
  give(s, 0, 't_c3'); give(s, 0, 't_c3'); give(s, 0, 't_c3');
  const dw = give(s, 0, 'deathwing_the_destroyer'); E.playCard(s, 0, dw.uid, null, null, 0);
  ok('destroyed 2, discarded 2', s.players[1].board.length === 0 && s.players[0].hand.length === 1);
}
// Hexmarshal
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['t_van'];
  const hx = give(s, 0, 'hexmarshal'); E.playCard(s, 0, hx.uid, null, null, 0);
  const got = s.players[0].hand[s.players[0].hand.length - 1];
  ok('no-spell deck: the big spell is free', got.cost === 0 && (byId[got.id].cost || 0) >= 5);
}
// Breakout Architect
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const br = give(s, 0, 'breakout_architect'); E.playCard(s, 0, br.uid, null, null, 0);
  E.resolvePick(s, s.pickQueue[0].ids[0]);
  const got = s.players[0].hand[s.players[0].hand.length - 1];
  ok('discovered spell casts twice', got.castTwice === true);
}
// Gnomelia cleave
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const l = summon(s, 1, 't_van'); l.maxHealth = 30;
  const m = summon(s, 1, 't_van'); m.maxHealth = 30; m.attack = 0;
  const r = summon(s, 1, 't_van'); r.maxHealth = 30;
  const gn = summon(s, 0, 'gnomelia_safe_pilot'); gn.sick = false;
  E.attack(s, 0, gn.uid, { type: 'creature', uid: m.uid, player: 1 });
  ok('cleave hit both neighbors', l.damage === gn.attack && r.damage === gn.attack && m.damage === gn.attack);
}
// Soridormi awaken
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const so = give(s, 0, 'soridormi'); E.playCard(s, 0, so.uid, null, null, 0);
  const held = give(s, 0, 't_drag'); held.cost = 6;
  for (let i = 0; i < 4; i++) E.endTurn(s); // 2 own turn starts -> awake
  ok('awakening cut dragon costs by 4', held.cost === 2);
}
// Alexstrasza payoff
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].life = 30; s.players[1].life = 40;
  const ax = give(s, 0, 'alexstrasza_guardian_of_life'); E.playCard(s, 0, ax.uid, null, null, 0);
  ok('health set to 15', s.players[0].life === 15);
  byId['t_megaheal'] = { id: 't_megaheal', name: 'MH', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'heal', value: 40, target: 'self' }] };
  const mh = give(s, 0, 't_megaheal'); E.playCard(s, 0, mh.uid, null, null, 0);
  ok('full health: 15 to the enemy', s.players[1].life === 25);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
