import fs from 'fs';
import * as E from '../../engine.js';
const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
function fresh() { return E.createGame(byId, () => 0.4, null, 2); }
function give(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const h = s.players[pi].hand; return h[h.length - 1]; }
function summon(s, pi, id) { s.players[pi].deck.push(id); E.drawCards(s, pi, 1); const c = s.players[pi].hand.find(x => x.id === id); s.players[pi].hand = s.players[pi].hand.filter(x => x !== c); c.zone = 'board'; s.players[pi].board.push(c); return c; }
function mana(s, pi, n) { s.players[pi].mana = { cur: n, max: n, bonus: 0 }; }
let pass = 0, fail = 0; const ok = (l, c) => { if (c) pass++; else { fail++; console.log('FAIL:', l); } };

// Rewind 1: a copy returns to deck once
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].deck = [];
  const cc = give(s, 0, 'conflux_crasher'); E.playCard(s, 0, cc.uid, null, null, 0);
  ok('rewind: copy returned to deck', s.players[0].deck.includes('conflux_crasher'));
  ok('rewind charge spent', s.players[0].rewindSpent['conflux_crasher'] === 1);
  // draw the RETURNED copy + replay: no second return
  E.drawCards(s, 0, 1);
  const cc2 = s.players[0].hand.find(x => x.id === 'conflux_crasher');
  E.playCard(s, 0, cc2.uid, null, null, 0);
  ok('rewind exhausted: no second return', !s.players[0].deck.includes('conflux_crasher'));
}
// Clocksworth x3: four total plays
{
  const s = fresh(); mana(s, 0, 99); s.players[0].hand = []; s.players[0].deck = [];
  let plays = 0;
  { const c = give(s, 0, 'mister_clocksworth'); E.playCard(s, 0, c.uid, null, null, 0); plays++; }
  for (let i = 0; i < 5 && s.players[0].deck.includes('mister_clocksworth'); i++) {
    s.players[0].board = []; // room for the legendaries
    E.drawCards(s, 0, 1); // draw the returned copy
    const c = s.players[0].hand.find(x => x.id === 'mister_clocksworth');
    E.playCard(s, 0, c.uid, null, null, 0); plays++;
  }
  ok('clocksworth played 4 times total', plays === 4);
  ok('clocksworth spent all 3 charges', s.players[0].rewindSpent['mister_clocksworth'] === 3 && !s.players[0].deck.includes('mister_clocksworth'));
}
// Morchie: Rewind battlecry fires twice
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  s.players[1].life = 40;
  summon(s, 0, 'morchie');
  const cc = give(s, 0, 'conflux_crasher'); E.playCard(s, 0, cc.uid, null, null, 0);
  ok('morchie doubled conflux (14 dmg)', s.players[1].life === 26);
}
// No morchie: single fire
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].board = []; s.players[1].board = [];
  s.players[1].life = 40;
  const cc = give(s, 0, 'conflux_crasher'); E.playCard(s, 0, cc.uid, null, null, 0);
  ok('no morchie: single fire (7 dmg)', s.players[1].life === 33);
}
// Morchie battlecry: discover options are all Rewind cards
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].board = [];
  const m = give(s, 0, 'morchie'); E.playCard(s, 0, m.uid, null, null, 0);
  ok('morchie discover opened', s.pickQueue.length > 0);
  if (s.pickQueue.length) {
    const opts = s.pickQueue[0].ids.map(id => byId[id]);
    ok('all options are Rewind cards', opts.length > 0 && opts.every(d => d && d.rewind > 0));
  }
}
// Time Machine deathrattle: get a random Rewind card
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].board = [];
  const tm = summon(s, 0, 'time_machine'); tm.keywords = tm.keywords.filter(k => k !== 'divine_shield');
  byId['t_kill'] = { id: 't_kill', name: 'K', type: 'sorcery', cost: 1, rarity: 'common', description: 'x', effects: [{ type: 'damage', value: 30, target: 'creature' }] };
  const k = give(s, 0, 't_kill'); E.playCard(s, 0, k.uid, { type: 'creature', uid: tm.uid, player: 0 }, null, 0);
  const got = s.players[0].hand[s.players[0].hand.length - 1];
  ok('time machine DR conjured a Rewind card', !!got && byId[got.id] && byId[got.id].rewind > 0);
}
// Stadium Announcer: both equip; yours is +1/+1 over the base def
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].board = [];
  const sa = give(s, 0, 'stadium_announcer'); E.playCard(s, 0, sa.uid, null, null, 0);
  const w0 = s.players[0].weapon, w1 = s.players[1].weapon;
  ok('both players equipped', !!w0 && !!w1);
  ok('announcer returned to deck (rewind)', s.players[0].rewindSpent['stadium_announcer'] === 1);
  ok('own weapon +1/+1 over enemy roll', !!w0 && !!w1 && w0.attack === w1.attack + 1 && w0.durability === w1.durability + 1);
}
// Bygone Doomspeaker: BOTH players discard
{
  const s = fresh(); mana(s, 0, 20); s.players[0].board = []; s.players[1].hand = [];
  give(s, 1, 'bone_baron');
  s.players[0].hand = [];
  give(s, 0, 'bone_baron');
  const bd = give(s, 0, 'bygone_doomspeaker'); E.playCard(s, 0, bd.uid, null, null, 0);
  ok('own hand discarded', s.players[0].hand.length === 0);
  ok('enemy hand discarded', s.players[1].hand.length === 0);
}
// Raptor Herald: rewind + kindred still work together
{
  const s = fresh(); mana(s, 0, 20); s.players[0].hand = []; s.players[0].board = []; s.players[0].deck = [];
  const b = summon(s, 0, 'bone_baron'); b.tribe = 'Beast';
  const rh = give(s, 0, 'raptor_herald'); E.playCard(s, 0, rh.uid, null, null, 0);
  ok('herald rewound', s.players[0].deck.includes('raptor_herald'));
  ok('herald discover opened', s.pickQueue.length > 0);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
