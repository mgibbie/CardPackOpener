import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Tradeable: canTrade works for a newly flagged card
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const lc = give(s, 0, 'line_cook');
  ok('line_cook is tradeable', E.canTrade(s, 0, lc) === true);
}
// Colossal: Leviathan enters with its Claw
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = [];
  const lv = give(s, 0, 'the_leviathan'); E.playCard(s, 0, lv.uid, null, null, 0);
  const claw = s.players[0].board.find(x => x.id === 'tsc_leviathan_claw');
  ok('leviathan summoned its claw', !!claw && claw.keywords.includes('rush') && claw.shield);
}
// Colossal: Gigafin enters with its Maw
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = [];
  const gf = give(s, 0, 'gigafin'); E.playCard(s, 0, gf.uid, null, null, 0);
  ok('gigafin summoned its maw', s.players[0].board.some(x => x.id === 'tsc_gigafin_maw'));
}
// Colossal: Magmaw enters with 6 Bodies
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].board = [];
  const mg = give(s, 0, 'magmaw'); E.playCard(s, 0, mg.uid, null, null, 0);
  const bodies = s.players[0].board.filter(x => x.id === 'cata_magmaw_body');
  ok('magmaw summoned 6 bodies', bodies.length === 6);
  // kill a body -> +2 attack to a random friendly
  const b = bodies[0]; b.damage = b.maxHealth;
  byId['t_k'] = { id: 't_k', name: 'K', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 5, target: 'creature' }] };
  const p = give(s, 0, 't_k'); E.playCard(s, 0, p.uid, { type: 'creature', uid: b.uid, player: 0 }, null, 0);
  ok('body DR buffed a friendly +2 atk', s.players[0].board.some(x => x.id !== 'cata_magmaw_body' ? x.attack > (byId[x.id]?.attack ?? 0) : x.attack > 2));
}
// Runi: discover a location
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  const ru = give(s, 0, 'runi_time_explorer'); E.playCard(s, 0, ru.uid, null, null, 0);
  ok('runi opened a location discover', s.pickQueue.length > 0 && s.pickQueue[0].ids.every(id => byId[id].type === 'location'));
  if (s.pickQueue.length) {
    E.resolvePick(s, s.pickQueue[0].ids[0]);
    ok('runi got a location in hand', s.players[0].hand.some(x => x.type === 'location'));
  }
}
// Cruise Captain Lora: 2 locations in play
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  const lo = give(s, 0, 'cruise_captain_lora'); E.playCard(s, 0, lo.uid, null, null, 0);
  ok('lora put 2 locations in play', s.players[0].board.filter(x => x.type === 'location').length === 2);
}
// Scrapbooking Student: copies a friendly location
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = []; s.players[0].board = [];
  // put a location in play first via lora
  mana(s, 0, 20);
  const lo = give(s, 0, 'cruise_captain_lora'); E.playCard(s, 0, lo.uid, null, null, 0);
  const before = s.players[0].board.filter(x => x.type === 'location').length;
  const sc = give(s, 0, 'scrapbooking_student'); E.playCard(s, 0, sc.uid, null, null, 0);
  ok('scrapbooking copied a location', s.players[0].board.filter(x => x.type === 'location').length === before + 1);
}
// Elise: 10 distinct costs -> discover location
{
  const s = fresh(); mana(s, 0, 12); s.players[0].hand = [];
  s.players[0].deck = [];
  for (let i = 0; i <= 10; i++) { const id = 't_cost' + i; byId[id] = { id, name: 'C' + i, type: 'creature', cost: i, attack: 1, health: 1, rarity: 'common' }; s.players[0].deck.push(id); }
  const el = give(s, 0, 'elise_the_navigator'); E.playCard(s, 0, el.uid, null, null, 0);
  ok('elise discovered with 10 distinct costs', s.pickQueue.length > 0);
  let g = 0; while (s.pickQueue.length && g++ < 4) E.resolvePick(s, s.pickQueue[0].ids[0]);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
