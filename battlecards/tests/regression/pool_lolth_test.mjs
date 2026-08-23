// pool_lolth_test.mjs — Lolth boss pool (B spider tribal: venom + web traps + spiderling swarm + death-births-spiders).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { validateGameState } from '../../engine/validate.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', tribe: 'Beast' };
byId._big = { id: '_big', name: 'G', type: 'creature', cost: 6, attack: 6, health: 6, rarity: 'common', tribe: 'Beast' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const spiders = (st, pi) => st.players[pi].board.filter(c => c.name === 'Spider').length;

const pool = raw.cards.filter(c => c.loreDeck === 'Lolth');
// ---- rubric ----
ok('Lolth pool has 15 cards', pool.length === 15);
const types = new Set(pool.map(c => c.type));
ok('spans >=6 card types incl secret/enchantment/weapon/quest', types.size >= 6 && ['secret', 'enchantment', 'weapon', 'quest'].every(t => types.has(t)), [...types]);
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=6 distinct keywords', kws.size >= 6, [...kws]);
ok('stays mono-Black', pool.every(c => (c.colors || []).join('') === 'B'));
ok('the boss (sig) spins a Spider whenever a creature dies', byId.lolth_sig.type === 'creature' && byId.lolth_sig.ongoing && byId.lolth_sig.ongoing.on === 'friendly-creature-died');

function game() {
  const st = E.createGame(byId, seededRng(36), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
  st.current = 0; st.priority = null; st.stack = [];
  for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.artifacts = []; p.enchantments = []; p.planeswalkers = []; p.emblems = []; p.secrets = []; p.quests = []; p.weapon = null; p.graveyard = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
  return st;
}
const put = (st, pi, id, sick = false) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = sick; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); const okp = E.playCard(st, pi, c.uid, target ?? null, choice); return { c, okp }; };
const cast = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); E.playCard(st, pi, c.uid, null); };

// ---- play-without-throw sweep ----
for (const c of pool) {
  const st = game(); put(st, 0, '_v'); const foe = put(st, 1, '_big'); let threw = null;
  const tgt = (c.id === 'lolth_venom') ? { type: 'creature', uid: foe.uid, player: 1 } : null;
  try { play(st, 0, c.id, tgt, c.id === 'lolth_command' ? 0 : undefined); } catch (e) { threw = e; }
  ok(`${c.id} plays without throwing`, !threw, threw && threw.message);
  const v = validateGameState(st); ok(`${c.id} leaves state valid`, !v || v.length === 0, v);
}

// ---- sig battlecry: two Spiders ----
{ const st = game(); const s0 = spiders(st, 0);
  play(st, 0, 'lolth_sig', null);
  ok('Lolth battlecry summons two 2/1 Spiders', spiders(st, 0) === s0 + 2, [s0, spiders(st, 0)]); }

// ---- sig death-engine: a friendly death spins a Spider ----
{ const st = game(); put(st, 0, 'lolth_sig'); const fodder = put(st, 0, '_v'); const s0 = spiders(st, 0);
  fodder.damage = fodder.maxHealth; E.sweepDeaths(st);
  ok('Lolth spins a Spider when a friendly creature dies', spiders(st, 0) === s0 + 1, [s0, spiders(st, 0)]); }

// ---- broodmother: a Spider each turn ----
{ const st = game(); play(st, 0, 'lolth_broodmother', null); const s0 = spiders(st, 0);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Broodmother summons a Spider at turn start', spiders(st, 0) === s0 + 1, [s0, spiders(st, 0)]); }

// ---- soulspider deathrattle: two Spiders ----
{ const st = game(); const ss = put(st, 0, 'lolth_soulspider'); const s0 = spiders(st, 0);
  ss.damage = ss.maxHealth; E.sweepDeaths(st);
  ok('Soulspider Deathrattle summons two Spiders', spiders(st, 0) === s0 + 2, [s0, spiders(st, 0)]); }

// ---- spellweaver: a Spider when you cast ----
{ const st = game(); put(st, 0, 'lolth_spellweaver'); const s0 = spiders(st, 0);
  cast(st, 0, 'lolth_dark_bargain');
  ok('Spellweaver summons a Spider when you cast a spell', spiders(st, 0) === s0 + 1, [s0, spiders(st, 0)]); }

// ---- priestess: Spider lord ----
{ const st = game(); put(st, 0, 'lolth_priestess'); const sp = put(st, 0, 'lolth_spiderspawn'); E.recomputeAuras(st);
  ok('Priestess gives other Spiders +1/+0', sp.attack === 2, sp.attack); }

// ---- spiderspawn: Deathtouch kills a big attacker ----
{ const st = game(); const spawn = put(st, 0, 'lolth_spiderspawn'); const big = put(st, 1, '_big');
  E.attack(st, 0, spawn.uid, { type: 'creature', uid: big.uid, player: 1 }); E.sweepDeaths(st);
  ok('Spiderspawn Deathtouch destroys the 6/6 it fought', !st.players[1].board.some(c => c.uid === big.uid), st.players[1].board.length); }

// ---- web secret: destroy an attacking enemy ----
{ const st = game(); play(st, 0, 'lolth_web', null);
  ok('Web installs as a secret', st.players[0].secrets.length === 1, st.players[0].secrets.length);
  const foe = put(st, 1, '_big'); foe.sick = false; st.current = 1;
  E.attack(st, 1, foe.uid, { type: 'hero', player: 0 }); E.sweepDeaths(st);
  ok('Web destroys the attacking enemy creature', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- webcloak enchantment: freeze the enemy board ----
{ const st = game(); const foe = put(st, 1, '_big'); play(st, 0, 'lolth_webcloak', null);
  E.fireOngoing(st, 0, 'turn-start');
  ok('Webcloak freezes all enemy creatures at turn start', !!foe.frozen, foe.frozen); }

// ---- venom: 4 damage removal ----
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'lolth_venom', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Venom deals 4 to a creature (kills the 2/2)', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }

// ---- sting: cantrip + a Spider ----
{ const st = game(); const h0 = st.players[0].hand.length; const s0 = spiders(st, 0);
  play(st, 0, 'lolth_sting', null);
  ok('Sting draws a card and summons a Spider', st.players[0].hand.length === h0 + 1 && spiders(st, 0) === s0 + 1, [h0, st.players[0].hand.length, s0, spiders(st, 0)]); }

// ---- crown weapon: Deathtouch + Spider on hero attack ----
{ const st = game(); play(st, 0, 'lolth_crown', null); const s0 = spiders(st, 0);
  ok('Crown equips a Deathtouch weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('deathtouch'));
  E.fireOngoing(st, 0, 'hero-attacks');
  ok('Crown summons a Spider after the hero attacks', spiders(st, 0) === s0 + 1, [s0, spiders(st, 0)]); }

// ---- command modal: -3/-3 (mode 1) ----
{ const st = game(); const foe = put(st, 1, '_big'); const a0 = foe.attack;
  play(st, 0, 'lolth_command', { type: 'creature', uid: foe.uid, player: 1 }, 1);
  ok('Command (weaken mode) puts -3/-3 on a creature', foe.attack === a0 - 3, [a0, foe.attack]); }

// ---- command modal: three Spiders (mode 0) ----
{ const st = game(); const s0 = spiders(st, 0);
  play(st, 0, 'lolth_command', null, 0);
  ok('Command (swarm mode) summons three Spiders', spiders(st, 0) === s0 + 3, [s0, spiders(st, 0)]); }

// ---- signet quest: summon 6 -> reward ----
{ const st = game(); play(st, 0, 'lolth_signet', null);
  ok('Signet installs as a quest', st.players[0].quests.length === 1, st.players[0].quests.length);
  const pre = put(st, 0, '_v'); const pa0 = pre.attack;
  for (let i = 0; i < 6; i++) play(st, 0, '_v', null);
  ok('Signet reward: a 6/6 Deathtouch Spider appears', st.players[0].board.some(c => c.name === 'Spider' && c.attack >= 6 && (c.keywords || []).includes('deathtouch')), st.players[0].board.map(c => c.name + c.attack));
  ok('Signet reward: your creatures get +1/+1', pre.attack >= pa0 + 1, [pa0, pre.attack]); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
