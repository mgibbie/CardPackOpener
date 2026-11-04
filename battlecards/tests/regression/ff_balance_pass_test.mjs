// ff_balance_pass_test.mjs — Lorequest: Final Fantasy balance pass (2026-10-13).
// From Muse's replay tapes: Garland 0-30, Reno and Rude 1-17, Rufus Shinra 3-32 as
// Henchmen (fights 1-3); Yuna 14% of fights vs Terra/Cloud 26%. And no FF card may be
// flavour text only — 81 were (shared enemy filler + a vanilla weapon in 8 hero decks).
// Fires the changed cards and powers; the invariant guards every future FF card.
import fs from 'fs';
import * as FF from '../../finalfantasy.js';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'B', type: 'creature', cost: 5, attack: 1, health: 9, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function boot(seat = 'Cloud', opp = 'Garland, Royal Kidnapper') {
  const picks = [FF.seatOf(seat), FF.seatOf(opp)];
  const st = E.createGame(byId, seededRng(5), ['_v', '_v', '_v', '_v', '_v', '_v'], 2, picks);
  st.classPicks = picks; st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) p.mana = { cur: 10, max: 10, bonus: 0 };
  return st;
}
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, target ?? null, null); return c; };
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;
const coins = (st, pi) => st.players[pi].hand.filter(c => c.id === 'coin').length;
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const power = (st, name, target) => { const hp = st.players[0].heroPowers.find(h => h.name === name); return E.useHeroPower(st, 0, hp.uid, target ?? null, null); };
const valid = (l, st) => { const v = validateGameState(st); ok(l + ' leaves state valid', !v || v.length === 0, v); };

// ───── invariant: every FF card has an effect ─────
const ff = raw.cards.filter(c => c.ffDeck || c.ffTreasure);
const MECH = ['effects', 'deathrattle', 'combo', 'overkill', 'ongoing', 'ongoings', 'taps', 'tapAbility', 'keywords'];
const bare = ff.filter(c => !MECH.some(k => c[k] && (!Array.isArray(c[k]) || c[k].length)));
ok('no FF card is flavour text only', bare.length === 0, bare.map(c => `${c.id} ${c.name}`).slice(0, 10));
const need = { battlecry: 'effects', deathrattle: 'deathrattle', overkill: 'overkill', combo: 'combo' };
const hollow = ff.filter(c => (c.keywords || []).some(k => need[k] && !(c[need[k]] && c[need[k]].length)));
ok('no FF trigger keyword is hollow', hollow.length === 0, hollow.map(c => c.id));

// ───── the former vanilla cards, fired ─────
{ const st = boot(); const rat = put(st, 1, 'ff_e_garland_12'); const c0 = coins(st, 1); kill(st, rat);
  ok('Undercity Dire Rat: Deathrattle gains a Coin', coins(st, 1) === c0 + 1, [c0, coins(st, 1)]); valid('Dire Rat', st); }
{ const st = boot('Cloud', 'Ultros, Obnoxious Octopus'); const sk = put(st, 1, 'ff_e_ultros_13'); kill(st, sk);
  ok('Chasm Skulker: Deathrattle summons two Squids', named(st, 1, 'Squid') === 2, named(st, 1, 'Squid')); }
{ const st = boot(); const h0 = st.players[0].hand.length; play(st, 0, 'ff_e_garland_9');
  ok('Sepulchral Primordial: Battlecry draws a card', st.players[0].hand.length === h0 + 1, [h0, st.players[0].hand.length]); }
{ const st = boot(); play(st, 0, 'ff_e_garland_11'); valid('Hecteyes (Battlecry: Scry 2)', st); }
{ const st = boot('Cloud', 'Queen Brahne'); const k = play(st, 0, 'ff_e_brahne_5'); ok('Summon: Kujata has Rush', E.has(k, 'rush')); }
ok("Ninja's Blades swing gains a Coin", byId.ff_zidane_8.ongoing?.on === 'hero-attacks' && byId.ff_zidane_8.ongoing.effects[0].type === 'gain-coin');
ok("Red Mage's Rapier: Overkill draws", byId.ff_vivi_8.overkill?.[0]?.type === 'draw');
ok('Buster Sword has Cleave', byId.ff_cloud_8.keywords?.includes('cleave'));

// ───── nerfs ─────
{ const st = boot(); play(st, 0, 'ff_e_garland_8');
  ok('Shinra Reinforcements summons ONE Trooper', st.players[0].board.length === 2, st.players[0].board.map(c => c.name)); }
{ const st = boot(); const t = put(st, 1, '_big'); play(st, 0, 'ff_e_garland_15', { type: 'creature', uid: t.uid, player: 1 });
  ok('Lethal Scheme (Garland) deals 3, no longer destroys', st.players[1].board.includes(t) && E.hp(t) === 6, E.hp(t)); }
{ const st = boot(); const t = put(st, 1, '_big'); play(st, 0, 'ff_e_reno_15', { type: 'creature', uid: t.uid, player: 1 });
  ok('Lethal Scheme (Reno and Rude) deals 3', E.hp(t) === 6, E.hp(t)); }
ok('Garland is 4/4', byId.ff_e_garland_1.attack === 4 && byId.ff_e_garland_1.health === 4);
{ const st = boot(); play(st, 0, 'ff_e_rufus_1');
  ok('Rufus Shinra summons ONE Shinra Trooper', named(st, 0, 'Shinra Guard') === 1, named(st, 0, 'Shinra Guard')); }
{ const st = boot(); const t = put(st, 1, '_big'); play(st, 0, 'ff_e_rufus_14');
  ok('Crux of Fate deals 2 to each enemy creature', E.hp(t) === 7, E.hp(t)); }
{ const st = boot('Reno and Rude'); const t = put(st, 1, '_big'); power(st, 'Neo Turk Tactics', { type: 'creature', uid: t.uid, player: 1 });
  ok('Reno and Rude power deals 1', E.hp(t) === 8, E.hp(t)); }
{ const st = boot('Rufus Shinra'); power(st, 'Shinra Command'); const g = st.players[0].board.find(c => c.name === 'Shinra Guard');
  ok('Rufus power summons a 1/1', g && g.attack === 1 && E.hp(g) === 1, g && [g.attack, E.hp(g)]); }
{ const st = boot('Garland, Royal Kidnapper'); const f = put(st, 0, '_v'); power(st, 'Soul of Chaos', { type: 'creature', uid: f.uid, player: 0 });
  ok('Garland power gives +1 Attack only', f.attack === 3 && E.hp(f) === 2, [f.attack, E.hp(f)]); }

// ───── Yuna ─────
{ const st = boot('Yuna'); st.players[0].life -= 5; const l0 = st.players[0].life, b0 = st.players[0].board.length;
  power(st, 'Grand Summon');
  ok('Yuna power Spiritsummons and gains 2 Life', st.players[0].board.length === b0 + 1 && st.players[0].life === l0 + 2, [st.players[0].board.length, l0, st.players[0].life]); }
{ const st = boot('Yuna'); st.players[0].life -= 6; const l0 = st.players[0].life, h0 = st.players[0].hand.length; play(st, 0, 'ff_yuna_6');
  ok('Restoration Magic gains 4 Life and draws', st.players[0].life === l0 + 4 && st.players[0].hand.length === h0 + 1, [l0, st.players[0].life, h0, st.players[0].hand.length]); }
ok('Grateful Apparition is a 2/3 with Lifesteal & Taunt', byId.ff_yuna_4.health === 3 && ['lifesteal', 'taunt'].every(k => byId.ff_yuna_4.keywords.includes(k)));
ok('Cloudbound Moogle is 2/3', byId.ff_yuna_3.health === 3);
ok("White Mage's Staff swing pings and heals", JSON.stringify(byId.ff_yuna_8.ongoing?.effects?.map(e => e.type)) === '["damage","heal"]');

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
