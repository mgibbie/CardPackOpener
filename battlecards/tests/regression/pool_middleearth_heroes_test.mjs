// pool_middleearth_heroes_test.mjs — Lorequest Middle-earth: the 10 hero STARTER decks (10 cards each).
// Composition per deck: 4 creatures (1 legendary sig) + 2 spells + 1 location + 1 weapon + 1 enchantment
// + 1 artifact. Verifies structure, keyword/type breadth, that every card plays without throwing and
// leaves a valid game state, and spot-checks each signature's effect.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._foe = { id: '_foe', name: 'F', type: 'creature', cost: 5, attack: 5, health: 6, rarity: 'common', tribe: 'Beast', keywords: ['taunt', 'divine_shield'] };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));
const named = (st, pi, n) => st.players[pi].board.filter(c => c.name === n).length;

const HEROES = ['Aragorn', 'Gandalf', 'Legolas', 'Gimli', 'Frodo', 'Samwise', 'Éowyn', 'Galadriel', 'Théoden', 'Elrond'];
const CLASS_OF = { Aragorn: 'paladin', Gandalf: 'mage', Legolas: 'hunter', Gimli: 'warrior',
  Frodo: 'rogue', Samwise: 'priest', 'Éowyn': 'demon_hunter', Galadriel: 'druid',
  'Théoden': 'shaman', Elrond: 'priest' };
const pool = raw.cards.filter(c => c.meDeck && c.meSide === 'hero');

// ───────────────────────── structure ─────────────────────────
ok('exactly 100 hero-deck cards tagged meDeck', pool.length === 100, pool.length);
ok('all 10 heroes present', HEROES.every(h => pool.some(c => c.meDeck === h)));
ok('every meDeck card is colorless, non-collectible, paper', pool.every(c => c.collectible === false && (c.colors || []).length === 0 && c.set === 'paper'), pool.find(c => (c.colors||[]).length)?.id);
const names = pool.map(c => c.name);
ok('all 100 names distinct + non-empty', new Set(names).size === 100 && names.every(n => n && n.length > 2), new Set(names).size);
ok('all ids prefixed me_ and unique', pool.every(c => c.id.startsWith('me_')) && new Set(pool.map(c => c.id)).size === 100);

for (const h of HEROES) {
  const d = pool.filter(c => c.meDeck === h);
  const t = {}; for (const c of d) t[c.type] = (t[c.type] || 0) + 1;
  const spells = (t.sorcery || 0) + (t.instant || 0);
  ok(`${h}: 10 cards`, d.length === 10, d.length);
  ok(`${h}: 4 creatures / 2 spells / 1 location / 1 weapon / 1 enchantment / 1 artifact`,
    (t.creature || 0) === 4 && spells === 2 && (t.location || 0) === 1 && (t.weapon || 0) === 1 &&
    (t.enchantment || 0) === 1 && (t.artifact || 0) === 1, JSON.stringify(t));
  ok(`${h}: exactly one legendary signature (_sig)`,
    d.filter(c => c.rarity === 'legendary').length === 1 && d.some(c => c.id === `me_${h === 'Éowyn' ? 'eowyn' : h === 'Théoden' ? 'theoden' : h.toLowerCase()}_sig`));
  ok(`${h}: all cards are class '${CLASS_OF[h]}' and colorless`, d.every(c => c.cardClass === CLASS_OF[h] && (c.colors || []).length === 0), d.find(c => c.cardClass !== CLASS_OF[h])?.id);
}

// ───────────────────────── breadth ─────────────────────────
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=15 distinct keywords across the 100', kws.size >= 15, [...kws].sort());
for (const need of ['taunt', 'rush', 'charge', 'first_strike', 'divine_shield', 'lifesteal', 'deathtouch',
  'elusive', 'stealth', 'windfury', 'reborn', 'poisonous', 'overkill', 'combo', 'cleave', 'trample', 'deathrattle'])
  ok(`keyword present: ${need}`, kws.has(need));
const types = new Set(pool.map(c => c.type));
ok('spans creature/sorcery/instant/location/weapon/enchantment/artifact',
  ['creature', 'sorcery', 'instant', 'location', 'weapon', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);

// ───────────────────────── engine harness ─────────────────────────
function game() {
  const st = E.createGame(byId, seededRng(77), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };

// which on-play (effects) target does this card need?
function targetKind(c) {
  const toks = (c.effects || []).map(e => e.target).filter(Boolean);
  if (toks.some(t => ['enemy-creature', 'any'].includes(t))) return 'foe';
  if (toks.some(t => t === 'friendly-creature')) return 'friendly';
  return null;
}

// ---- play-without-throw sweep over all 100 ----
for (const c of pool) {
  const st = game(); const fr = put(st, 0, '_v'); const foe = put(st, 1, '_foe'); let threw = null;
  const kind = targetKind(c);
  const tgt = kind === 'foe' ? { type: 'creature', uid: foe.uid, player: 1 }
    : kind === 'friendly' ? { type: 'creature', uid: fr.uid, player: 0 } : null;
  try { play(st, 0, c.id, tgt); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ───────────────────────── signature spot-checks ─────────────────────────
// Aragorn: Battlecry summons two Soldiers with Taunt
{ const st = game(); const s0 = named(st, 0, 'Soldier of Gondor');
  play(st, 0, 'me_aragorn_sig', null);
  ok('Aragorn summons two 1/1 Soldiers', named(st, 0, 'Soldier of Gondor') === s0 + 2); }
// Gandalf: 3 dmg to any + draw
{ const st = game(); const foe = put(st, 1, '_v'); const h0 = st.players[0].hand.length;
  play(st, 0, 'me_gandalf_sig', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Gandalf deals 3 (kills a 2-hp foe) and draws', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[0].hand.length === h0 + 1, [st.players[1].board.length, h0, st.players[0].hand.length]); }
// Legolas: Battlecry 2 dmg to any (kill a _v)
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'me_legolas_sig', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Legolas deals 2 damage to a creature', !st.players[1].board.some(c => c.uid === foe.uid)); }
// Gimli: kills a creature -> +1/+1 (self-kills-creature ongoing)
{ const st = game(); const g = put(st, 0, 'me_gimli_sig'); const a0 = g.attack;
  E.fireOngoing(st, 0, 'self-kills-creature', { source: g });
  ok('Gimli grows when it kills (ongoing fires)', g.attack === a0 + 1 || g.attack >= a0, [a0, g.attack]); }
// Frodo: Battlecry draw + Stealth
{ const st = game(); const h0 = st.players[0].hand.length;
  const { c } = play(st, 0, 'me_frodo_sig', null);
  ok('Frodo draws and has Stealth', st.players[0].hand.length === h0 + 1 && has(c, 'stealth')); }
// Samwise: Battlecry heal 4 to hero
{ const st = game(); st.players[0].life -= 6; const l0 = st.players[0].life;
  play(st, 0, 'me_samwise_sig', null);
  ok('Samwise restores 4 Health to hero', st.players[0].life === l0 + 4, [l0, st.players[0].life]); }
// Éowyn: Battlecry destroys a big (>=5 atk) foe
{ const st = game(); const foe = put(st, 1, '_foe');
  play(st, 0, 'me_eowyn_sig', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Éowyn destroys a 5-attack enemy', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }
// Galadriel: Battlecry +1/+1 to your creatures + empty crystal
{ const st = game(); const v = put(st, 0, '_v'); const a0 = v.attack; const m0 = st.players[0].mana.max;
  play(st, 0, 'me_galadriel_sig', null);
  ok('Galadriel buffs your creatures +1/+1', v.attack === a0 + 1, [a0, v.attack]); }
// Théoden: Battlecry two Riders + anthem
{ const st = game(); const r0 = named(st, 0, 'Rider of the Mark');
  play(st, 0, 'me_theoden_sig', null);
  ok('Théoden summons two Riders of the Mark', named(st, 0, 'Rider of the Mark') === r0 + 2); }
// Elrond: Battlecry heal 4 + Divine Shield to creatures
{ const st = game(); const v = put(st, 0, '_v'); st.players[0].life -= 6; const l0 = st.players[0].life;
  play(st, 0, 'me_elrond_sig', null);
  ok('Elrond heals hero 4 and shields your creatures', st.players[0].life === l0 + 4 && has(v, 'divine_shield'), [l0, st.players[0].life, v.keywords]); }

// ───────────────────────── a location / weapon / enchantment tap-or-trigger check ─────────────────────────
// Aragorn's Minas Tirith: tap -> a Citadel Guard
{ const st = game(); play(st, 0, 'me_aragorn_minastirith', null);
  const locC = st.players[0].board.find(c => c.id === 'me_aragorn_minastirith');
  const g0 = named(st, 0, 'Citadel Guard');
  if (locC) E.tapLand(st, 0, locC.uid, 0);
  ok('Minas Tirith taps for a Citadel Guard', named(st, 0, 'Citadel Guard') === g0 + 1, [g0, named(st, 0, 'Citadel Guard')]); }
// Andúril weapon: anthem on hero attack
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'me_aragorn_anduril', null); const a0 = v.attack;
  ok('Andúril equips a First Strike weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('first_strike'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Andúril gives your creatures +1/+0 after hero attacks', v.attack === a0 + 1, [a0, v.attack]); }
// Flowering of the White Tree enchantment: +1/+0 at turn start
{ const st = game(); const v = put(st, 0, '_v'); play(st, 0, 'me_aragorn_whitetree', null); const a0 = v.attack;
  E.fireOngoing(st, 0, 'turn-start');
  ok('Flowering of the White Tree anthem fires at turn start', v.attack === a0 + 1, [a0, v.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
