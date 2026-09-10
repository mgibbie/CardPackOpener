// pool_t2_riders_test.mjs — Batch D: the 2-color pools' signature riders, fired.
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
  const st = E.createGame(byId, seededRng(140), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const kill = (st, c) => { c.damage = c.maxHealth; E.sweepDeaths(st); };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };

// every Batch D pool now has zero mechanic-free creatures
const T2 = ['Axgard', 'Bretagard', 'Gnottvold', 'Immersturm', 'Istfell', 'Karfell', 'Littjara', 'Skemfar', 'Starnheim', 'Surtland', 'Azorius', 'Boros', 'Dimir', 'Golgari', 'Gruul', 'Izzet', 'Orzhov', 'Rakdos', 'Selesnya', 'Simic', 'Lorehold', 'Prismari', 'Quandrix', 'Silverquill', 'Witherbloom', 'Atarka', 'Dromoka', 'Kolaghan', 'Ojutai', 'Silumgar'];
const MECHF = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell', 'kicker', 'activated', 'overkill', 'ward', 'medic', 'regen'];
{
  const bare = raw.cards.filter(c => T2.includes(c.landSet) && !c.token && c.type === 'creature'
    && MECHF.every(f => c[f] == null || (Array.isArray(c[f]) && c[f].length === 0))
    && (c.keywords || []).filter(k => k !== 'battlecry' && k !== 'deathrattle').length <= 1);
  ok('no single-keyword vanilla creatures left in the 30 T2 pools', bare.length === 0, bare.slice(0, 8).map(c => c.id));
}

// fired samples of each rider family
{ // Istfell: spirits swarm from beyond (deathrattle summon)
  const withSpirit = raw.cards.filter(c => c.landSet === 'Istfell' && (c.deathrattle || []).some(e => e.type === 'summon' && e.name === 'Spirit'));
  ok('Istfell creatures die into Spirits', withSpirit.length >= 2, withSpirit.length);
  const st = game(); const c = put(st, 0, withSpirit[0].id);
  kill(st, c);
  ok('...and the Spirit arrives Elusive', st.players[0].board.some(x => x.name === 'Spirit' && has(x, 'elusive')), st.players[0].board.map(x => x.name)); }

{ // Skemfar: the clan feeds on deaths
  const grower = raw.cards.find(c => c.landSet === 'Skemfar' && c.ongoing && c.ongoing.on === 'friendly-creature-died');
  ok('Skemfar has an on-death grower', !!grower);
  const st = game(); const g = put(st, 0, grower.id); const v = put(st, 0, '_v'); const a0 = g.attack;
  kill(st, v);
  ok('...that grows when kin die', g.attack === a0 + 1, [a0, g.attack]); }

{ // Izzet/Prismari/Ojutai: prowess tempo
  const prow = raw.cards.find(c => c.landSet === 'Ojutai' && c.ongoing && c.ongoing.on === 'spell-played' && c.ongoing.effects[0].type === 'temp-buff-self');
  ok('Ojutai re-led with Prowess', !!prow);
  const st = game(); const c = put(st, 0, prow.id); const a0 = c.attack;
  play(st, 0, 'obscura_guidance', null);
  ok('...that pumps on cast', c.attack === a0 + 1, [a0, c.attack]); }

{ // Karfell: undead tide
  const tide = raw.cards.find(c => c.landSet === 'Karfell' && (c.deathrattle || []).some(e => e.type === 'summon' && e.name === 'Undead'));
  ok('Karfell creatures die into Undead', !!tide);
  const st = game(); const c = put(st, 0, tide.id);
  kill(st, c);
  ok('...with Deathtouch', st.players[0].board.some(x => x.name === 'Undead' && has(x, 'deathtouch')), st.players[0].board.map(x => x.name)); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
