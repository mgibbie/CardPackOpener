// pool_middleearth_enemies_test.mjs — Lorequest Middle-earth: the 29 ENEMY decks (15 cards each).
// Composition per deck: 8 creatures (1 legendary sig) + 3 spells + 1 location + 1 weapon + 1 enchantment
// + 1 artifact. Verifies structure, colorless/class/enemy tagging, keyword/type breadth, that every card
// plays without throwing and leaves a valid game state, and spot-checks several boss signatures.
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

// enemy -> assigned class (villains lean warlock/death_knight/warrior)
const ENEMY_CLASS = {
  'Bill Ferny': 'rogue', 'Lotho': 'warlock', 'Gríma Wormtongue': 'warlock', 'Grishnákh': 'warrior',
  'Gorbag': 'warlock', 'Shagrat': 'rogue', 'Old Man Willow': 'druid', 'Tom, Bert & William': 'warrior',
  'The Chief Warg': 'hunter', 'Uglúk': 'warrior', 'Mauhúr': 'warrior', 'Gothmog': 'death_knight',
  'The Watcher in the Water': 'mage', 'The Mouth of Sauron': 'warlock', 'King of the Oathbreakers': 'death_knight',
  'Shelob': 'hunter', 'The Great Goblin': 'warlock', 'Bolg': 'death_knight', 'Saruman': 'mage',
  'The Balrog': 'warlock', 'Witch-king of Angmar': 'death_knight', 'Sauron the Necromancer': 'death_knight',
  'Gollum': 'rogue', 'Smaug': 'warrior', 'Azog': 'warrior',
  'Sauron the Dark Lord': 'warlock', 'Sauron the Lidless Eye': 'warlock',
  // Hobbit-set additions
  'The Master of Lake-town': 'warlock', 'Chief of the Wilds': 'hunter',
};
const ENEMIES = Object.keys(ENEMY_CLASS);
const pool = raw.cards.filter(c => c.meDeck && c.meSide === 'enemy');

// ───────────────────────── structure ─────────────────────────
ok('exactly 435 enemy-deck cards (meSide enemy)', pool.length === 435, pool.length);
ok('all 29 enemies present', ENEMIES.every(e => pool.some(c => c.meDeck === e)), ENEMIES.filter(e => !pool.some(c => c.meDeck === e)));
ok('no stray meDeck values beyond the 29 enemies', pool.every(c => ENEMIES.includes(c.meDeck)), [...new Set(pool.map(c => c.meDeck))].filter(m => !ENEMIES.includes(m)));
// colors were Scryfall-backfilled (2026-08-26) to drive the run's color-locked
// basics — assert they're VALID rather than absent
ok('every enemy card is non-collectible, paper, with valid colors', pool.every(c => c.collectible === false && c.set === 'paper' && (c.colors || []).every(x => 'WUBRG'.includes(x))), pool.find(c => (c.colors || []).some(x => !'WUBRG'.includes(x)))?.id);
ok('all ids prefixed me_ and globally unique', pool.every(c => c.id.startsWith('me_')) && new Set(pool.map(c => c.id)).size === 435, new Set(pool.map(c => c.id)).size);
// enemy ids must not collide with the 100 hero ids
const heroIds = new Set(raw.cards.filter(c => c.meSide === 'hero').map(c => c.id));
ok('no enemy id collides with a hero id', pool.every(c => !heroIds.has(c.id)));

for (const e of ENEMIES) {
  const d = pool.filter(c => c.meDeck === e);
  const t = {}; for (const c of d) t[c.type] = (t[c.type] || 0) + 1;
  const spells = (t.sorcery || 0) + (t.instant || 0);
  ok(`${e}: 15 cards`, d.length === 15, d.length);
  ok(`${e}: 8 creatures / 3 spells / 1 location / 1 weapon / 1 enchantment / 1 artifact`,
    (t.creature || 0) === 8 && spells === 3 && (t.location || 0) === 1 && (t.weapon || 0) === 1 &&
    (t.enchantment || 0) === 1 && (t.artifact || 0) === 1, JSON.stringify(t));
  ok(`${e}: exactly one legendary signature (_sig)`,
    d.filter(c => c.rarity === 'legendary').length === 1 && d.some(c => c.id.endsWith('_sig') && c.rarity === 'legendary'));
  ok(`${e}: all cards are class '${ENEMY_CLASS[e]}'`,
    d.every(c => c.cardClass === ENEMY_CLASS[e]), d.find(c => c.cardClass !== ENEMY_CLASS[e])?.id);
  ok(`${e}: 15 distinct card names within the deck`, new Set(d.map(c => c.name)).size === 15, new Set(d.map(c => c.name)).size);
  ok(`${e}: spans >=6 distinct types`, new Set(d.map(c => c.type)).size >= 6, [...new Set(d.map(c => c.type))]);
}

// ───────────────────────── breadth (across all 435) ─────────────────────────
const kws = new Set(pool.flatMap(c => c.keywords || []));
ok('uses >=15 distinct keywords across the 435', kws.size >= 15, [...kws].sort());
for (const need of ['taunt', 'rush', 'charge', 'first_strike', 'divine_shield', 'lifesteal', 'deathtouch',
  'elusive', 'stealth', 'windfury', 'reborn', 'poisonous', 'overkill', 'combo', 'cleave', 'trample', 'deathrattle'])
  ok(`keyword present: ${need}`, kws.has(need));
const types = new Set(pool.map(c => c.type));
ok('spans creature/sorcery/instant/location/weapon/enchantment/artifact',
  ['creature', 'sorcery', 'instant', 'location', 'weapon', 'enchantment', 'artifact'].every(t => types.has(t)), [...types]);
// class coverage: all seven enemy classes represented
const classes = new Set(pool.map(c => c.cardClass));
ok('spans warlock/death_knight/warrior/rogue/hunter/mage/druid',
  ['warlock', 'death_knight', 'warrior', 'rogue', 'hunter', 'mage', 'druid'].every(cl => classes.has(cl)), [...classes]);

// ───────────────────────── engine harness ─────────────────────────
function game() {
  const st = E.createGame(byId, seededRng(91), null, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
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
  // mind-control effects target an enemy creature explicitly
  if ((c.effects || []).some(e => e.type === 'mind-control')) return 'foe';
  return null;
}

// ---- play-without-throw sweep over all 435 ----
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
// Bill Ferny: Battlecry gain a Coin + opponent discards
{ const st = game(); st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)]; const oh = st.players[1].hand.length;
  play(st, 0, 'me_bf_sig', null);
  ok('Bill Ferny makes opponent discard', st.players[1].hand.length === oh - 1, [oh, st.players[1].hand.length]); }
// Grishnákh: Charge signature has charge keyword
{ const st = game(); const { c } = play(st, 0, 'me_gr_sig', null);
  ok('Grishnákh has Charge + Overkill', has(c, 'charge') && has(c, 'overkill')); }
// Chief Warg: Battlecry summons two Wargs
{ const st = game(); const w0 = named(st, 0, 'Warg');
  play(st, 0, 'me_cw_sig', null);
  ok('Chief Warg summons two Wargs', named(st, 0, 'Warg') === w0 + 2, named(st, 0, 'Warg')); }
// Shelob: Battlecry freezes an enemy creature
{ const st = game(); const foe = put(st, 1, '_v');
  play(st, 0, 'me_sl_sig', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Shelob freezes an enemy creature', !!st.players[1].board.find(c => c.uid === foe.uid)?.frozen, st.players[1].board[0]?.frozen); }
// The Great Goblin: Battlecry summons three Goblins
{ const st = game(); const g0 = named(st, 0, 'Goblin-town Goblin');
  play(st, 0, 'me_gg_sig', null);
  ok('Great Goblin summons three Goblins', named(st, 0, 'Goblin-town Goblin') === g0 + 3, named(st, 0, 'Goblin-town Goblin')); }
// Witch-king: Battlecry destroys a big (>=4 atk) foe
{ const st = game(); const foe = put(st, 1, '_foe');
  play(st, 0, 'me_wk_sig', { type: 'creature', uid: foe.uid, player: 1 }); E.sweepDeaths(st);
  ok('Witch-king destroys a 5-attack enemy', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }
// Balrog: Battlecry deals 3 to all enemy creatures
{ const st = game(); const foe = put(st, 1, '_v'); const foe2 = put(st, 1, '_v');
  play(st, 0, 'me_ba_sig', null); E.sweepDeaths(st);
  ok('Balrog Flame of Udûn clears 2-hp enemies', st.players[1].board.length === 0, st.players[1].board.length); }
// Gollum: Battlecry steals a small enemy creature
{ const st = game(); const foe = put(st, 1, '_v'); const b0 = st.players[0].board.length;
  play(st, 0, 'me_gl_sig', { type: 'creature', uid: foe.uid, player: 1 });
  ok('Gollum steals a small enemy creature', st.players[0].board.some(c => c.uid === foe.uid), [b0, st.players[0].board.length]); }
// Smaug: Battlecry deals 3 to all enemy creatures + gains coins
{ const st = game(); const foe = put(st, 1, '_v'); const coins0 = st.players[0].hand.filter(c => (c.id || '').includes('coin')).length;
  play(st, 0, 'me_sm_sig', null); E.sweepDeaths(st);
  ok('Smaug torches the board (clears a 2-hp enemy)', !st.players[1].board.some(c => c.uid === foe.uid), st.players[1].board.length); }
// Sauron the Dark Lord: Battlecry board-wipe + discard + draw
{ const st = game(); const foe = put(st, 1, '_v'); st.players[1].hand = [E.instantiate(byId._v, 1), E.instantiate(byId._v, 1), E.instantiate(byId._v, 1)]; const oh = st.players[1].hand.length;
  play(st, 0, 'me_sd_sig', null); E.sweepDeaths(st);
  ok('Sauron the Dark Lord wipes small enemies + forces discard', !st.players[1].board.some(c => c.uid === foe.uid) && st.players[1].hand.length <= oh - 2, [st.players[1].board.length, oh, st.players[1].hand.length]); }

// ───────────────────────── a location / weapon / enchantment trigger check ─────────────────────────
// Goblin-town (Great Goblin location): tap -> a Goblin
{ const st = game(); play(st, 0, 'me_gg_loc', null);
  const locC = st.players[0].board.find(c => c.id === 'me_gg_loc');
  const g0 = named(st, 0, 'Goblin-town Goblin');
  if (locC) E.tapLand(st, 0, locC.uid, 0);
  ok('Goblin-town taps for a Goblin', named(st, 0, 'Goblin-town Goblin') === g0 + 1, [g0, named(st, 0, 'Goblin-town Goblin')]); }
// Nazgûl Battle-Mace weapon: equips with deathtouch
{ const st = game(); play(st, 0, 'me_gt_wep', null);
  ok('Nazgûl Battle-Mace equips a Deathtouch weapon', st.players[0].weapon && (st.players[0].weapon.keywords || []).includes('deathtouch')); }
// Storm of Saruman enchantment: spell-played -> 2 dmg to opponent
{ const st = game(); play(st, 0, 'me_sa_ench', null); const l0 = st.players[1].life;
  E.fireOngoing(st, 0, 'spell-played');
  ok('Storm of Saruman pings opponent when you cast a spell', st.players[1].life === l0 - 2, [l0, st.players[1].life]); }
// Old Man Willow: turn-start freezes enemy creatures
{ const st = game(); const foe = put(st, 1, '_v'); put(st, 0, 'me_ow_sig');
  E.fireOngoing(st, 0, 'turn-start');
  ok('Old Man Willow roots enemies at turn start', !!st.players[1].board.find(c => c.uid === foe.uid)?.frozen); }

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
