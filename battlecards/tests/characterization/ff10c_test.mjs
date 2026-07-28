import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 60, target: 'creature' }] };
byId['t_spell2'] = { id: 't_spell2', name: 'S2', type: 'sorcery', cost: 2, rarity: 'common', description: 'x', effects: [{ type: 'draw', count: 1, value: 1 }] };
function kill(s, pi, c) { c.shield = false; const k = give(s, pi, 't_kill'); E.playCard(s, pi, k.uid, { type: 'creature', uid: c.uid, player: c.controller }, null, 0); }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Hand-pick: spell damage / split / absorb / coin / shuffle-draw / plus5 / phoenix / attack
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const sp = give(s, 0, 't_spell2');
  const bb = give(s, 0, 'battlefield_blaster'); E.playCard(s, 0, bb.uid, null, null, 0);
  E.resolvePick(s, 't_spell2');
  ok('blaster: hand spell +1 spell damage', sp.bonusSpellDamage === 1);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  give(s, 0, 't_spell2');
  const cs = give(s, 0, 'conjuration_specialist'); E.playCard(s, 0, cs.uid, null, null, 0);
  E.resolvePick(s, 't_spell2');
  const spells = s.players[0].hand.filter(c => c.type === 'sorcery' || c.type === 'instant');
  ok('specialist: split into 2 same-cost spells', spells.length === 2 && spells.every(c => (c.cost || 0) === 2) && !spells.some(c => c.id === 't_spell2'));
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].hand = [];
  give(s, 0, 't_spell2');
  const cc = give(s, 0, 'crackling_cloudstrider'); E.playCard(s, 0, cc.uid, null, null, 0);
  E.resolvePick(s, 't_spell2');
  const onB = s.players[0].board.find(c => c.id === 'crackling_cloudstrider');
  ok('cloudstrider absorbed the spell', onB._absorbedId === 't_spell2' && !s.players[0].hand.some(c => c.id === 't_spell2'));
  s.players[0].deck = ['crypt_lord'];
  const h0 = s.players[0].hand.length;
  kill(s, 0, onB);
  ok('DR cast it (drew a card)', s.players[0].hand.length === h0 + 1);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  give(s, 0, 't_spell2');
  const ag = give(s, 0, 'agent_of_the_old_ones'); E.playCard(s, 0, ag.uid, null, null, 0);
  E.resolvePick(s, 't_spell2');
  ok('agent: card became a coin', s.players[0].hand.some(c => c.id === 'coin') && !s.players[0].hand.some(c => c.id === 't_spell2'));
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = ['crypt_lord'];
  give(s, 0, 't_spell2');
  const sv = give(s, 0, 'sheltered_survivor'); E.playCard(s, 0, sv.uid, null, null, 0);
  E.resolvePick(s, 't_spell2');
  ok('survivor: shuffled + drew', s.players[0].deck.includes('t_spell2') || s.players[0].hand.some(c => c.id === 't_spell2') === false);
  ok('drew a card', s.players[0].hand.length === 1);
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  give(s, 0, 't_spell2');
  const ba = give(s, 0, 'bootleg_alchemist'); E.playCard(s, 0, ba.uid, null, null, 0);
  E.resolvePick(s, 't_spell2');
  const tr = s.players[0].hand[0];
  ok('alchemist: became a 7-cost spell', tr && (tr.cost || 0) === 7 && (tr.type === 'sorcery' || tr.type === 'instant'));
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 'crypt_lord');
  const dp = give(s, 0, 'destructive_phoenix'); E.playCard(s, 0, dp.uid, null, null, 0);
  E.resolvePick(s, 'crypt_lord');
  ok('phoenix branded the card', held._doomSummonId === 'destructive_phoenix');
  s.players[0].board = [];
  for (let i = 0; i < 6; i++) E.endTurn(s);
  ok('brand: discarded + phoenix summoned', !s.players[0].hand.some(c => c.uid === held.uid)
    && s.players[0].board.some(c => c.id === 'destructive_phoenix'));
}
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const held = give(s, 0, 'crypt_lord'); const a0 = held.attack;
  const vb = give(s, 0, 'vicious_bloodworm'); E.playCard(s, 0, vb.uid, null, null, 0);
  E.resolvePick(s, 'crypt_lord');
  ok('bloodworm: +3 attack to held minion', held.attack === a0 + 3);
}
// Kil'jaeden
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const kj = give(s, 0, 'kiljaeden'); E.playCard(s, 0, kj.uid, null, null, 0);
  ok('deck replaced by the portal', s.players[0].deck.length === 0 && !!s.players[0].kiljaeden);
  E.drawCards(s, 0, 1);
  const d1 = s.players[0].hand[s.players[0].hand.length - 1];
  ok('portal demon at +0', (d1.tribe || '').includes('Demon') && d1.attack === (byId[d1.id].attack || 0));
  E.endTurn(s); E.endTurn(s); // my next turn: +2
  const before = s.players[0].hand.length;
  E.drawCards(s, 0, 1);
  const d2 = s.players[0].hand[s.players[0].hand.length - 1];
  ok('portal demon grew +2/+2', d2.attack === (byId[d2.id].attack || 0) + 2);
}
// Nythendra
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ny = summon(s, 0, 'nythendra');
  kill(s, 0, ny);
  const beetles = s.players[0].board.filter(c => c.id === 'nythendra_beetle');
  ok('split into 4 beetles', beetles.length === 4);
  kill(s, 0, beetles[0]); // one dies
  E.endTurn(s); E.endTurn(s); // my next turn start -> reform
  const re = s.players[0].board.find(c => c.id === 'nythendra');
  ok('reformed from 3 beetles (3 health)', !!re && (re.maxHealth - re.damage) === 3
    && !s.players[0].board.some(c => c.id === 'nythendra_beetle'));
}
// Aviana
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const av = give(s, 0, 'aviana_elunes_chosen'); E.playCard(s, 0, av.uid, null, null, 0);
  const big = give(s, 0, 'crypt_lord');
  ok('before full moon: normal cost', E.effectiveCost(s, 0, big) === byId['crypt_lord'].cost);
  for (let i = 0; i < 6; i++) E.endTurn(s);
  ok('full moon: everything costs (1)', E.effectiveCost(s, 0, big) === 1);
}
// Ursoc
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const weak = summon(s, 1, 'nythendra_beetle');
  const strong = summon(s, 1, 'crypt_lord'); strong.keywords = []; strong.shield = false; strong.maxHealth = 40; strong.attack = 0;
  const ur = give(s, 0, 'ursoc'); E.playCard(s, 0, ur.uid, null, null, 0);
  const uB = s.players[0].board.find(c => c.id === 'ursoc');
  ok('ursoc attacked all: beetle died, big damaged', !s.players[1].board.some(c => c.uid === weak.uid) && strong.damage > 0);
  s.players[0].board = [uB];
  kill(s, 0, uB);
  ok('DR resurrected his kill (beetle)', s.players[0].board.some(c => c.id === 'nythendra_beetle'));
}
// Marin
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = [];
  const ma = give(s, 0, 'marin_the_manager'); E.playCard(s, 0, ma.uid, null, 1, 0); // Wondrous Wand
  ok('got the wand, 3 in deck', s.players[0].hand.some(c => c.id === 'wondrous_wand') && s.players[0].deck.length === 3);
  s.players[0].deck = ['crypt_lord', 'bone_baron', 't_spell2'];
  const wand = s.players[0].hand.find(c => c.id === 'wondrous_wand');
  E.playCard(s, 0, wand.uid, null, null, 0);
  ok('wand: drew 3 at (0)', s.players[0].hand.filter(c => c.cost === 0 && c.id !== 'wondrous_wand').length >= 3);
}
// Dirdra crewmates
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = [];
  const dr = give(s, 0, 'dirdra_rebel_captain'); E.playCard(s, 0, dr.uid, null, null, 0);
  ok('8 distinct crewmates in deck', new Set(s.players[0].deck).size === 8);
  // stack two crewmates on top, play a third: adjoin summons the run
  const cm = give(s, 0, 'crewmate_gunner');
  E.playCard(s, 0, cm.uid, null, null, 0);
  ok('adjoined crewmates summoned from deck top', s.players[0].board.filter(c => (c.name || '').includes('Crewmate')).length >= 2);
  const dB = s.players[0].board.find(c => c.id === 'dirdra_rebel_captain');
  s.players[0].deck.push('crewmate_helm', 'crewmate_recon');
  kill(s, 0, dB);
  ok('DR drew crewmates', s.players[0].hand.filter(c => (c.name || '').includes('Crewmate')).length >= 1);
}
// Toru jars
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  give(s, 0, 'crypt_lord');
  const to = give(s, 0, 'entomologist_toru'); E.playCard(s, 0, to.uid, null, null, 0);
  const jar = s.players[0].hand.find(c => c.id === 'toru_jar');
  ok('minion jarred', !!jar && jar._heldId === 'crypt_lord' && !s.players[0].hand.some(c => c.id === 'crypt_lord'));
  E.playCard(s, 0, jar.uid, null, null, 0);
  const jb = s.players[0].board.find(c => c.id === 'toru_jar');
  kill(s, 0, jb);
  ok('breaking the jar released it', s.players[0].board.some(c => c.id === 'crypt_lord'));
}
// Murmur
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  summon(s, 0, 'murmur');
  const bc = give(s, 0, 'sharp_eyed_lookout'); // a battlecry minion
  ok('battlecry minion costs (1)', E.effectiveCost(s, 0, bc) === 1);
  E.playCard(s, 0, bc.uid, null, null, 0);
  ok('it died immediately after the battlecry', !s.players[0].board.some(c => c.id === 'sharp_eyed_lookout'));
}
// Incindius eruptions
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = []; s.players[1].life = 40; s.players[1].board = [];
  const inc = give(s, 0, 'incindius'); E.playCard(s, 0, inc.uid, null, null, 0);
  ok('5 eruptions shuffled', s.players[0].deck.filter(id => id === 'eruption').length === 5);
  E.endTurn(s); E.endTurn(s); // one upgrade
  ok('eruptions upgraded', s.players[0].eruptionBonus === 1);
  s.players[0].deck = [];
  const er = give(s, 0, 'eruption'); E.playCard(s, 0, er.uid, null, null, 0);
  ok('eruption hit for 5 (4+1)', s.players[1].life === 35);
}
// Uluu
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ul = give(s, 0, 'uluu_the_everdrifter');
  E.endTurn(s); E.endTurn(s);
  ok('uluu gained 2 choices in hand', (ul.choices || []).length === 2);
  E.endTurn(s); E.endTurn(s);
  ok('4 choices after two turns', (ul.choices || []).length === 4);
}
// Hataaru
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ha = give(s, 0, 'exarch_hataaru'); E.playCard(s, 0, ha.uid, null, null, 0);
  const pend = s.pickQueue[0];
  E.resolvePick(s, pend.ids[0]);
  const got = s.players[0].hand[s.players[0].hand.length - 1];
  ok('discovered spell at -1', got.cost === Math.max(0, (byId[got.id].cost || 0) - 1));
  if (E.canPlay(s, 0, got)) {
    E.playCard(s, 0, got.uid, null, null, 0);
    ok('playing it repeated the discover', s.pickQueue.length > 0);
  } else { ok('skip (unplayable pick)', true); }
}
// Xortoth stars
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40; s.players[1].board = [];
  give(s, 0, 't_spell2'); // one card between the stars after xortoth is played
  const xo = give(s, 0, 'xortoth_breaker_of_stars'); E.playCard(s, 0, xo.uid, null, null, 0);
  ok('stars at both ends', s.players[0].hand[0].id === 'xortoth_star' && s.players[0].hand[s.players[0].hand.length - 1].id === 'xortoth_star');
  const mid = s.players[0].hand.find(c => c.id === 't_spell2');
  E.playCard(s, 0, mid.uid, null, null, 0); // removing it makes stars adjacent
  ok('stars collided: 5 to all enemies', s.players[1].life === 35 && !s.players[0].hand.some(c => c.id === 'xortoth_star'));
}
// Saruun
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_ele2'] = { id: 't_ele2', name: 'E2', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Elemental', rarity: 'common', description: 'x' };
  const sa = give(s, 0, 'saruun'); E.playCard(s, 0, sa.uid, null, null, 0);
  s.players[0].deck = ['t_ele2'];
  E.drawCards(s, 0, 1);
  const el = s.players[0].hand.find(c => c.id === 't_ele2');
  ok('drawn elemental has spell damage', el.static && el.static.type === 'spell-damage' && el.static.value === 1);
}
// Grove Shaper
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  summon(s, 0, 'grove_shaper');
  byId['t_nat'] = { id: 't_nat', name: 'N', type: 'sorcery', cost: 1, tribe: 'Nature', rarity: 'common', description: 'x', effects: [{ type: 'draw', count: 1 }] };
  const n = give(s, 0, 't_nat'); E.playCard(s, 0, n.uid, null, null, 0);
  const tr = s.players[0].board.find(c => c.id === 'token_grove_treant');
  ok('treant summoned carrying the spell', !!tr && tr.deathrattle && tr.deathrattle[0].id === 't_nat');
  kill(s, 0, tr);
  ok('treant DR: spell copy in hand', s.players[0].hand.some(c => c.id === 't_nat'));
}
// Hungering Ancient
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  s.players[0].deck = ['crypt_lord'];
  const hu = summon(s, 0, 'hungering_ancient');
  const a0 = hu.attack;
  E.endTurn(s);
  ok('ate the deck minion', hu.attack === a0 + byId['crypt_lord'].attack && s.players[0].deck.length === 0);
  E.endTurn(s);
  kill(s, 0, hu);
  ok('DR returned the eaten', s.players[0].hand.some(c => c.id === 'crypt_lord'));
}
// Fyrakk immune to fire
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const fy = summon(s, 1, 'fyrakk_the_blazing'); fy.shield = false;
  byId['t_fire'] = { id: 't_fire', name: 'F', type: 'sorcery', cost: 1, tribe: 'Fire', rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 5, target: 'creature' }] };
  const f = give(s, 0, 't_fire'); E.playCard(s, 0, f.uid, { type: 'creature', uid: fy.uid, player: 1 }, null, 0);
  ok('fyrakk immune to fire spells', fy.damage === 0);
  kill(s, 0, fy); // t_kill has no school
  ok('but not to plain removal', !s.players[1].board.some(c => c.uid === fy.uid));
}
// Ooze bones
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const ally = summon(s, 0, 'nythendra_beetle'); ally.attack = 4; ally.maxHealth = 6; ally.damage = 1;
  const oz = give(s, 0, 'dissolving_ooze'); E.playCard(s, 0, oz.uid, { type: 'creature', uid: ally.uid, player: 0 }, null, 0);
  const ab = s.players[0].hand.find(c => c.id === 'token_attack_bone');
  const hb = s.players[0].hand.find(c => c.id === 'token_health_bone');
  ok('bones carry its stats', ab && ab.effects[0].attack === 4 && hb && hb.effects[0].health === 5);
}
// Petrified Ogre
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const og = give(s, 0, 'petrified_ogre'); E.playCard(s, 0, og.uid, null, null, 0);
  const ob = s.players[0].board.find(c => c.id === 'petrified_ogre');
  const a0 = ob.attack;
  E.endTurn(s); E.endTurn(s);
  ok('ogre grew while dormant', ob.attack === a0 + 2);
  ok('rng 0.4 < 0.5: woke up', ob.dormantLeft === 0);
}
// K'helos chain
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  let cur = summon(s, 0, 'the_egg_of_khelos');
  const chain = ['khelos_egg_1', 'khelos_egg_2', 'khelos_egg_3', 'khelos_egg_4', 'khelos_hatched'];
  for (const next of chain) {
    kill(s, 0, cur);
    cur = s.players[0].board.find(c => c.id === next);
    if (!cur) break;
  }
  ok('the egg hatched K\'helos after 5 breaks', !!cur && cur.id === 'khelos_hatched');
}
// Ido blessing
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  summon(s, 0, 'ido_of_the_threshfleet');
  E.endTurn(s);
  ok('got the blessing', s.players[0].hand.filter(c => c.id === 'threshfleet_blessing').length === 1);
  E.endTurn(s); E.endTurn(s);
  ok('no duplicate while holding one', s.players[0].hand.filter(c => c.id === 'threshfleet_blessing').length === 1);
}
// Wilted Shadow
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const ws = summon(s, 0, 'wilted_shadow');
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 30; foe.damage = 5; foe.attack = 1;
  byId['t_healc'] = { id: 't_healc', name: 'HC', type: 'sorcery', cost: 0, rarity: 'common', description: 'x', effects: [{ type: 'heal', value: 3, target: 'creature' }] };
  const h = give(s, 0, 't_healc'); E.playCard(s, 0, h.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('healing the enemy provoked an attack', foe.damage >= ws.attack);
}
// Slumbering Sprite
{
  const s = E.createGame(byId, () => 0.4, null, 2, [{ id: 'druid' }, null]);
  mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const sp = give(s, 0, 'slumbering_sprite'); E.playCard(s, 0, sp.uid, null, null, 0);
  const sb = s.players[0].board.find(c => c.id === 'slumbering_sprite');
  ok('sprite starts dormant', sb.dormantLeft > 0);
  const hp0 = s.players[0].heroPowers[0];
  if (hp0) { E.useHeroPower(s, 0, hp0.uid, null, null); ok('hero power woke it', sb.dormantLeft === 0); }
  else ok('skip: no hero power', true);
}
// Planetary Navigator overload rider
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const pn = give(s, 0, 'planetary_navigator'); E.playCard(s, 0, pn.uid, null, null, 0);
  byId['t_dra'] = { id: 't_dra', name: 'D', type: 'creature', cost: 4, attack: 3, health: 3, tribe: 'Draenei', rarity: 'common', description: 'x' };
  const dr = give(s, 0, 't_dra');
  ok('draenei (2) less', E.effectiveCost(s, 0, dr) === 2);
  E.playCard(s, 0, dr.uid, null, null, 0);
  ok('but overloaded (2)', s.players[0].overloadPending === 2);
}
// Winged Aberration + Pebbly Page
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const w0 = give(s, 0, 't_spell2'); E.playCard(s, 0, w0.uid, null, null, 0); // combo enabler
  const wa = give(s, 0, 'winged_aberration'); E.playCard(s, 0, wa.uid, null, null, 0);
  const wb = s.players[0].board.find(c => c.id === 'winged_aberration');
  ok('combo: windfury + overload 2', wb.keywords.includes('windfury') && s.players[0].overloadPending === 2);
}
// Scarlet Subjugator
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.attack = 5;
  const sc = give(s, 0, 'scarlet_subjugator'); E.playCard(s, 0, sc.uid, { type: 'creature', uid: foe.uid, player: 1 }, null, 0);
  ok('-2 attack now', foe.attack === 3);
  E.endTurn(s); E.endTurn(s); // my next turn
  ok('restored at my next turn', foe.attack === 5);
}
// Night Elf Huntress distinct
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = []; s.players[1].life = 40;
  const f1 = summon(s, 1, 'crypt_lord'); f1.keywords = []; f1.shield = false; f1.maxHealth = 30;
  const ne = give(s, 0, 'night_elf_huntress'); E.playCard(s, 0, ne.uid, null, null, 0);
  ok('3 different targets: minion once + face once', f1.damage === 3 && s.players[1].life === 37);
}
// Taelan highest
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  byId['t_c9'] = { id: 't_c9', name: 'C9', type: 'creature', cost: 9, attack: 9, health: 9, rarity: 'common', description: 'x' };
  s.players[0].deck = ['t_c9', 'nythendra_beetle', 't_spell2'];
  const ta = summon(s, 0, 'taelan_fordring');
  kill(s, 0, ta);
  ok('drew the highest-cost MINION', s.players[0].hand.some(c => c.id === 't_c9'));
}
// Rehgar adjacency
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].life = 40;
  const a = summon(s, 0, 'nythendra_beetle'); a.sick = false;
  const rg = summon(s, 0, 'rehgar_earthfury');
  const far = summon(s, 0, 'nythendra_beetle'); far.sick = false;
  s.players[0].board = [a, rg, s.players[0].board[2], far][0] === a ? [a, rg, far] : s.players[0].board;
  s.players[0].hand = [];
  E.attack(s, 0, a.uid, { type: 'hero', player: 1 }); // adjacent to rehgar
  ok('adjacent attack: got a bolt', s.players[0].hand.length === 1);
  s.players[0].hand = [];
  s.players[0].board = [a, rg, far];
  const lone = summon(s, 0, 'nythendra_beetle'); lone.sick = false; // far right, not adjacent
  E.attack(s, 0, lone.uid, { type: 'hero', player: 1 });
  ok('non-adjacent attack: nothing', s.players[0].hand.length === 0);
}
// Magma Hound target gating
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = []; s.players[1].life = 60;
  const mh = summon(s, 0, 'magma_hound'); mh.sick = false; mh.maxHealth = 30;
  const foe = summon(s, 1, 'crypt_lord'); foe.keywords = []; foe.shield = false; foe.maxHealth = 30; foe.attack = 0;
  const l0 = s.players[1].life;
  E.attack(s, 0, mh.uid, { type: 'creature', uid: foe.uid, player: 1 });
  ok('splash after minion attack', s.players[1].life < l0 || foe.damage > mh.attack);
  const l1 = s.players[1].life; const fd = foe.damage;
  mh.attacksUsed = 0;
  E.attack(s, 0, mh.uid, { type: 'hero', player: 1 });
  ok('no splash after face attack', s.players[1].life === l1 - mh.attack && foe.damage === fd);
}
// Herald pair
{
  const s = E.createGame(byId, () => 0.4, null, 2, [{ id: 'warrior' }, null]);
  mana(s, 0, 99); s.players[0].hand = []; s.players[0].board = [];
  const sd = give(s, 0, 'shadowsworn_disciple'); E.playCard(s, 0, sd.uid, null, null, 0);
  ok('herald counted + soldier summoned', s.players[0].heraldCount === 1 && s.players[0].board.length >= 1);
  const held = give(s, 0, 'deathwing_the_destroyer'); const c0 = held.cost;
  const ux = give(s, 0, 'ultraxion'); E.playCard(s, 0, ux.uid, null, null, 0);
  ok('ultraxion: herald 2 + deathwing cheaper', s.players[0].heraldCount === 2 && held.cost === c0 - 2);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
