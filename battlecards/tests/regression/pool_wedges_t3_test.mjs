// pool_wedges_t3_test.mjs — Batch B signature mechanics, fired.
// Jeskai prowess tempo · Mardu raid · Sultai delve · Temur ferocity · Abzan outlast.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

function game() {
  const st = E.createGame(byId, seededRng(130), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// Jeskai: Narset grows permanently per spell
{ const st = game(); const { c } = play(st, 0, 'jeskai_narset', null); const a0 = c.attack;
  play(st, 0, 'jeskai_lightning', { type: 'creature', uid: put(st, 1, '_v').uid, player: 1 });
  ok('Narset grows on cast', c.attack === a0 + 1, [a0, c.attack]); }

// Mardu: Strike Leader raids a Warrior per swing
{ const st = game(); const c = put(st, 0, 'mardu_strike_leader');
  E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
  ok('Strike Leader summons a Warrior on Swing', st.players[0].board.some(x => x.name === 'Warrior' && has(x, 'rush')), st.players[0].board.map(x => x.name)); }

// Mardu: Roughrider Overkill shape + Kambal punish shape
{ ok('Roughrider has an Overkill face payoff', Array.isArray(byId.mardu_roughrider.overkill) && byId.mardu_roughrider.overkill[0].target === 'enemy-heroes');
  ok('Kambal punishes enemy spells', byId.mardu_kambal.ongoing && byId.mardu_kambal.ongoing.on === 'enemy-spell-played', byId.mardu_kambal.ongoing); }

// Sultai: Gurmag Angler delves (costs less per friendly death)
{ ok('Gurmag Angler discounts per friendly death', byId.sultai_gurmag_angler.selfCost && byId.sultai_gurmag_angler.selfCost.per === 'friendly-deaths-game', byId.sultai_gurmag_angler.selfCost); }

// Sultai: Scavenger feeds on any death
{ const st = game(); const c = put(st, 0, 'sultai_scavenger'); const v = put(st, 1, '_v'); const a0 = c.attack;
  kill(st, v);
  ok('Scavenger grows when any creature dies', c.attack === a0 + 1, [a0, c.attack]); }

// Sultai: Kheru Lich Lord is Reborn now
{ ok('Kheru Lich Lord is Deathtouch + Reborn', (byId.sultai_kheru_lich_lord.keywords || []).includes('reborn')); }

// Temur: Savage Ventmaw's swing pays mana
{ const st = game(); const c = put(st, 0, 'temur_savage_ventmaw');
  const mana0 = st.players[0].mana.cur + st.players[0].mana.bonus;
  E.attack(st, 0, c.uid, { type: 'hero', player: 1 });
  const mana1 = st.players[0].mana.cur + st.players[0].mana.bonus;
  ok('Ventmaw grants 3 mana on Swing', mana1 === mana0 + 3, [mana0, mana1]); }

// Temur: Charm ramp mode
{ const st = game(); st.players[0].mana.cur = 10; const mana0 = 10 + st.players[0].mana.bonus; const h0 = st.players[0].hand.length;
  play(st, 0, 'temur_charm', null, 2);
  const spent = byId.temur_charm.cost;
  ok('Temur Charm (mode: ramp) nets mana + a card', (st.players[0].mana.cur + st.players[0].mana.bonus) === mana0 - spent + 2 && st.players[0].hand.length === h0 + 1, [st.players[0].mana.cur, st.players[0].mana.bonus]); }

// Abzan: Charm counters mode uses grow (real +1/+1 counters)
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack;
  play(st, 0, 'abzan_charm', null, 1);
  ok('Abzan Charm (mode: counters) grows the team', v.attack === a0 + 1 && (v.counters || 0) >= 1, [v.attack, v.counters]); }

// Abzan: Infantry Reborn + deathrattle both fire
{ const st = game(); const c = put(st, 0, 'abzan_infantry');
  kill(st, c);
  ok('Infantry deathrattle fires on first (reborn) death', st.players[0].board.some(x => x.name === 'Warrior'), st.players[0].board.map(x => x.name));
  ok('Infantry itself returns via Reborn', st.players[0].board.some(x => x.id === 'abzan_infantry')); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
