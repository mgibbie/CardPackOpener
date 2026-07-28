import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Quickdraw: Glowstone drawn this turn -> deals 5; NOT drawn -> nothing
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const e1 = summon(s, 1, 'crypt_lord'); e1.keywords = []; e1.maxHealth = 20; e1.damage = 0;
  const gg = give(s, 0, 'glowstone_gyreworm'); // drawnThisTurn = true via drawCards
  ok('glowstone drawnThisTurn set', gg.drawnThisTurn === true);
  const spec = E.targetSpec(s, 0, gg, undefined);
  ok('glowstone quickdraw prompts a target', !!spec);
  E.playCard(s, 0, gg.uid, { type: 'creature', uid: e1.uid, player: 1 }, null, 0);
  ok('glowstone quickdraw dealt 5', e1.damage === 5);
}
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const e1 = summon(s, 1, 'crypt_lord'); e1.keywords = []; e1.maxHealth = 20; e1.damage = 0;
  const gg = give(s, 0, 'glowstone_gyreworm'); gg.drawnThisTurn = false; // held from a previous turn
  E.playCard(s, 0, gg.uid, null, null, 0);
  ok('glowstone held: no quickdraw damage', e1.damage === 0);
}
// Azerite Chain Gang: drawn this turn -> BC + QD = 2 extra copies (3 total)
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const acg = give(s, 0, 'azerite_chain_gang');
  E.playCard(s, 0, acg.uid, null, null, 0);
  ok('chain gang drawn: 3 on board (BC+QD copies)', s.players[0].board.filter(x => x.id === 'azerite_chain_gang').length === 3);
}
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const acg = give(s, 0, 'azerite_chain_gang'); acg.drawnThisTurn = false;
  E.playCard(s, 0, acg.uid, null, null, 0);
  ok('chain gang held: 2 on board (BC only)', s.players[0].board.filter(x => x.id === 'azerite_chain_gang').length === 2);
}
// Farm Hand: drawn -> discover Undead at -2
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const fh = give(s, 0, 'farm_hand');
  E.playCard(s, 0, fh.uid, null, null, 0);
  ok('farm hand opened discover', s.pickQueue.length > 0);
  if (s.pickQueue.length) {
    const pickedId = s.pickQueue[0].ids[0]; const base = byId[pickedId].cost || 0;
    E.resolvePick(s, pickedId);
    const got = s.players[0].hand[s.players[0].hand.length - 1];
    ok('farm hand quickdraw: -2 cost', got.cost === Math.max(0, base - 2));
  }
}
// Silver Serpent: quickdraw immune
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const ss = give(s, 0, 'silver_serpent');
  E.playCard(s, 0, ss.uid, null, null, 0);
  const onB = s.players[0].board.find(x => x.id === 'silver_serpent');
  ok('silver serpent quickdraw immune', onB.immune || onB.immuneTurn || (onB.keywords||[]).includes('immune'));
}
// Temporary: Hologram Operator draenei vanish at end of turn
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const ho = give(s, 0, 'hologram_operator'); E.playCard(s, 0, ho.uid, null, null, 0);
  const temps = s.players[0].hand.filter(x => x.temporary);
  ok('hologram gave 3 temporary draenei', temps.length === 3);
  E.endTurn(s);
  ok('temporary cards vanished at end of turn', s.players[0].hand.filter(x => x.temporary).length === 0);
}
// Health-cost: Whispering Stone Fel spells have altCost life
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const ws = summon(s, 0, 'whispering_stone');
  byId['t_k'] = { id: 't_k', name: 'K', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 20, target: 'creature' }] };
  const p = give(s, 0, 't_k'); E.playCard(s, 0, p.uid, { type: 'creature', uid: ws.uid, player: 0 }, null, 0);
  const fels = s.players[0].hand.filter(x => x.altCost && x.altCost.life != null);
  ok('whispering stone spells carry life altCost', fels.length === 2);
}
// Start of Game: Chainbreaker Hogger duplicates legendaries (playerDeckIds sets P0's deck)
{
  const deck = ['chainbreaker_hogger', 'the_lich_king', 'malorne']; for (let i = 0; i < 40; i++) deck.push('bone_baron');
  const s0 = E.createGame(byId, () => 0.4, deck, 2);
  const all0 = [...s0.players[0].deck, ...s0.players[0].hand.map(c => c.id)];
  const lichs = all0.filter(id => id === 'the_lich_king').length;
  const hoggers = all0.filter(id => id === 'chainbreaker_hogger').length;
  ok('hogger duplicated other legendaries (not itself)', lichs === 2 && hoggers === 1); // malorne is rarity 'rare' in our DB, correctly not duplicated
}
// Start of Game: Ysera Emerald Aspect +5 max mana both players
{
  const deck = ['ysera_emerald_aspect']; for (let i = 0; i < 40; i++) deck.push('bone_baron');
  const s0 = E.createGame(byId, () => 0.4, deck, 2);
  ok('ysera gave both players +5 max mana', s0.players[0].mana.max >= 6 && s0.players[1].mana.max >= 6);
}
// In-hand transform: Imposter morphs at turn start
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const im = give(s, 0, 'black_morass_imposter');
  E.endTurn(s); E.endTurn(s); // back to my turn -> morph
  const morph = s.players[0].hand.find(x => x.uid === im.uid);
  ok('imposter morphed to a 2-cost minion', morph && morph.id !== 'black_morass_imposter' && (byId[morph.id]?.cost || 0) === 2);
  ok('imposter morph has spell damage +1', morph && morph.static && morph.static.type === 'spell-damage');
  ok('imposter keeps morphing (field persists)', morph && !!morph.handTransform);
}
// Shapeshifter: morphs into enemy hand minion
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[1].hand = [];
  s.players[1].deck.push('the_lich_king'); E.drawCards(s, 1, 1);
  const sh = give(s, 0, 'shapeshifter');
  E.endTurn(s); E.endTurn(s);
  const morph = s.players[0].hand.find(x => x.uid === sh.uid);
  ok('shapeshifter became enemy hand minion', morph && morph.id === 'the_lich_king');
}
// Genn: all-even rest of hand -> Worgen King
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  byId['t_even'] = { id: 't_even', name: 'E', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
  give(s, 0, 't_even'); give(s, 0, 't_even');
  const genn = give(s, 0, 'genn_cursed_king');
  E.endTurn(s); E.endTurn(s);
  const morph = s.players[0].hand.find(x => x.uid === genn.uid);
  ok('genn became the worgen king', morph && morph.id === 'won_worgen_king');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
