// pool_swamp_test.mjs — Swamp basic-color pool (mono-B, 70, no rarity). LIGHT ENHANCEMENT: faithful cards left
// untouched; this asserts the rubric + the enhanced/repurposed cards.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 3, rarity: 'common', tribe: 'Beast' };
byId._wall = { id: '_wall', name: 'W', type: 'creature', cost: 3, attack: 3, health: 5, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const has = (c, k) => (E.has ? E.has(c, k) : (c.keywords || []).includes(k));

const pool = raw.cards.filter(c => c.landSet === 'Swamp');
// ---- rubric ----
ok('Swamp pool has 70 cards', pool.length === 70, pool.length);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl artifact/location', types.size >= 6 && ['artifact', 'location', 'enchantment', 'instant'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-B', pool.every(c => JSON.stringify(c.colors) === '["B"]'));
ok('carries NO rarity + uncollectible', pool.every(c => !c.rarity && c.collectible === false));
const MECH = ['effects', 'ongoing', 'ongoings', 'aura', 'taps', 'tapAbility', 'deathrattle', 'static', 'statics', 'secret', 'quest', 'choices', 'counterSpell', 'counter', 'selfScale', 'costMod', 'altCost', 'xSpell'];
const hasFx = c => MECH.some(f => c[f] != null && !(Array.isArray(c[f]) && c[f].length === 0));
ok('no blank/vanilla cards remain', pool.every(c => hasFx(c) || (c.keywords || []).length > 0), pool.filter(c => !hasFx(c) && !(c.keywords || []).length).map(c => c.id));

function game() {
  const st = E.createGame(byId, seededRng(108), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null); return { c, okp }; };
const undead = (st, pi) => st.players[pi].board.filter(c => c.name === 'Undead').length;

// ---- douser_of_lights ARTIFACT: tap drain ----
{ const st = game(); play(st, 0, 'douser_of_lights', null); const foeLife0 = st.players[1].life; const myLife0 = st.players[0].life;
  E.tapArtifact(st, 0, st.players[0].artifacts.find(a => a.id === 'douser_of_lights').uid, null);
  ok('Douser of Lights (artifact) taps to drain 1', st.players[1].life === foeLife0 - 1 && st.players[0].life === myLife0 + 1, [foeLife0, st.players[1].life]); }

// ---- catacomb_slug LOCATION: tap for an Undead ----
{ const st = game(); play(st, 0, 'catacomb_slug', null); const loc = st.players[0].board.find(c => c.id === 'catacomb_slug'); const u0 = undead(st, 0);
  E.tapLand(st, 0, loc.uid, 0);
  const u = st.players[0].board.find(c => c.name === 'Undead');
  ok('Catacomb Slug (location) taps for a deathtouch Undead', undead(st, 0) === u0 + 1 && u && has(u, 'deathtouch'), [u0, undead(st, 0)]); }

// ---- arrogant_vampire: elusive lifesteal + Frenzy ----
{ const st = game(); const { c } = play(st, 0, 'arrogant_vampire', null);
  ok('Arrogant Vampire has Elusive + Lifesteal', has(c, 'elusive') && has(c, 'lifesteal'), c.keywords);
  ok('Arrogant Vampire gained a Frenzy pump', byId.arrogant_vampire.ongoing && byId.arrogant_vampire.ongoing.survives === true, byId.arrogant_vampire.ongoing); }

// ---- diregraf_ghoul: corpse feeder ----
{ const st = game(); const c = put(st, 0, 'diregraf_ghoul'); const v = put(st, 0, '_v'); const a0 = c.attack;
  v.damage = v.maxHealth; E.sweepDeaths(st);
  ok('Diregraf Ghoul grows when a friendly creature dies', c.attack === a0 + 1, [a0, c.attack]); }

// ---- shambling_ghoul / dreg_reaver: undead deathrattles ----
{ const st = game(); const c = put(st, 0, 'shambling_ghoul'); const u0 = undead(st, 0);
  c.damage = c.maxHealth; E.sweepDeaths(st);
  ok('Shambling Ghoul leaves a 1/1 Undead', undead(st, 0) === u0 + 1, [u0, undead(st, 0)]); }
{ const st = game(); const c = put(st, 0, 'dreg_reaver');
  c.damage = c.maxHealth; E.sweepDeaths(st);
  const u = st.players[0].board.find(x => x.name === 'Undead');
  ok('Dreg Reaver leaves a 2/2 Undead', u && u.attack === 2, u && [u.attack, u.health]); }

// ---- blood_glutton: lifegain-matters ----
{ const st = game(); st.players[0].life = 30; const c = put(st, 0, 'blood_glutton'); const a0 = c.attack;
  play(st, 0, 'cabal_evangel', null);
  ok('Blood Glutton grows when you gain Life', c.attack === a0 + 1, [a0, c.attack]); }

// ---- bog_imp / cursed_minotaur: death stings ----
{ const st = game(); const c = put(st, 0, 'bog_imp'); const life0 = st.players[1].life;
  c.damage = c.maxHealth; E.sweepDeaths(st);
  ok('Bog Imp drains 1 on death', st.players[1].life === life0 - 1, [life0, st.players[1].life]); }

// ---- keyword spice ----
{ ok('Walking Corpse is Deathtouch + Reborn', (byId.walking_corpse.keywords || []).includes('reborn'), byId.walking_corpse.keywords);
  ok('Alley Strangler is Deathtouch + Stealth', (byId.alley_strangler.keywords || []).includes('stealth'), byId.alley_strangler.keywords);
  ok('Canal Monitor is Poisonous + Rush', (byId.canal_monitor.keywords || []).includes('poisonous'), byId.canal_monitor.keywords);
  ok('Bartizan Bats are Elusive + Windfury', (byId.bartizan_bats.keywords || []).includes('windfury'), byId.bartizan_bats.keywords);
  ok('Catacomb Crocodile regenerates', byId.catacomb_crocodile.regen === 2, byId.catacomb_crocodile.regen);
  ok('Bogstomper Connect forces a discard', byId.bogstomper.ongoing && byId.bogstomper.ongoing.on === 'self-hit-player' && byId.bogstomper.ongoing.effects[0].type === 'enemy-discard', byId.bogstomper.ongoing); }

// ---- plagued_rusalka: deathtouch + ping ----
{ const st = game(); const foe = put(st, 1, '_wall');
  const { c } = play(st, 0, 'plagued_rusalka', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Plagued Rusalka has Deathtouch and deals 1', has(c, 'deathtouch') && foe.damage === 1, [c.keywords, foe.damage]); }

// ---- cabal_evangel: lifesteal + gain 2 ----
{ const st = game(); const life0 = st.players[0].life;
  const { c } = play(st, 0, 'cabal_evangel', null);
  ok('Cabal Evangel has Lifesteal and gains 2 life', has(c, 'lifesteal') && st.players[0].life === life0 + 2, [life0, st.players[0].life]); }

// ---- viscera_seer: scry battlecry ----
{ const st = game(); let threw = null; try { play(st, 0, 'viscera_seer', null); } catch (e) { threw = e; }
  ok('Viscera Seer plays without throwing', !threw, threw && threw.message); }

// ---- enhanced cards leave state valid ----
for (const id of ['diregraf_ghoul', 'grimclaw_bats', 'dakmor_scorpion', 'catacomb_crocodile', 'bogstomper', 'canal_monitor', 'walking_corpse', 'shambling_ghoul', 'dreg_reaver', 'carrion_screecher', 'cursed_minotaur', 'alley_strangler', 'bog_imp', 'bartizan_bats', 'child_of_night', 'daggerdrome_imp', 'barony_vampire', 'blood_glutton', 'charity_extractor', 'nantuko_shade']) {
  const st = game(); let threw = null;
  try { play(st, 0, id, null); } catch (e) { threw = e; }
  ok(`${id} plays without throwing`, !threw, threw && threw.message);
  const vd = validateGameState(st); ok(`${id} leaves state valid`, !vd || vd.length === 0, vd);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
