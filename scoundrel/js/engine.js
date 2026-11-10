// Scoundrel — the rules engine. A line-for-line port of the owner's Love2D game
// (Desktop/Scoundrel: src/game.lua, src/deck.lua, src/card.lua), made deterministic
// and synchronous, plus the web build's ROGUELIKE RUN: a run is a chain of dungeons,
// each one starting with 1 less MAX HP (20, 19, 18 ...).
//
// Pure: no DOM, no Math.random, no clock. A run is (seed, actions) — the same pair
// always reaches the same state, so save/resume and replays are just the action log
// (the "recipe"), and a spectator draws the same view() the runner does.
//
// The Love2D timers (DEALING / RESOLVING / ROOM_DONE) only animated; here every
// action settles at once and the UI animates the change. The rules they gated run in
// the same order: a card resolves -> the state is CHOOSING -> _checkRoomEnd.
//
// Actions (one character each in the recipe):
//   '0'..'3'  pick room card i      (a monster with a usable weapon opens the fight choice)
//   'w' / 'b' fight the picked monster with the weapon / bare-handed
//   'c'       cancel the fight choice
//   'r'       run from the room (Space in the original)
//   'd'       descend: start the next dungeon after clearing one
export const ENGINE_VERSION = 1;
export const START_HP = 20;
export const SUITS = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const RANK_VALUES = { A: 14, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };
export const STATE = { CHOOSING: 'choosing', FIGHT_CHOICE: 'fight_choice', CLEARED: 'cleared', OVER: 'over' };

// ------------------------------------------------------------------ RNG
// xmur3 string hash -> sfc32. Each dungeon shuffles from its own stream
// (seed + ':' + dungeon), so a dungeon's deck never depends on how the last one went.
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; };
}
export function makeRng(seedStr) {
  const s = xmur3(String(seedStr));
  let a = s(), b = s(), c = s(), d = s();
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b) | 0;
    a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0; t = (t + d) | 0; c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next();
  // love.math.random(lo, hi): an integer in [lo, hi]
  return { next, int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)) };
}

// ------------------------------------------------------------------ cards (card.lua / deck.lua)
export const isMonster = (c) => c.suit === 'Clubs' || c.suit === 'Spades';
export const isPotion = (c) => c.suit === 'Hearts';
export const isWeapon = (c) => c.suit === 'Diamonds';
export const kindOf = (c) => (isPotion(c) ? 'potion' : isWeapon(c) ? 'weapon' : 'monster');
// getDisplayValue: a potion Ace would heal 1 — but red aces are not in the deck, so every card is its value
export const displayValue = (c) => (c.suit === 'Hearts' && c.rank === 'A' ? 1 : c.value);

/** Deck.buildScoundrelDeck: 52 minus the red faces AND red aces = 44 cards, ids 1..44 in suit/rank order. */
export function buildDeck() {
  const cards = [];
  let id = 1;
  for (const suit of SUITS) for (const rank of RANKS) {
    const red = suit === 'Hearts' || suit === 'Diamonds';
    const faceOrAce = rank === 'J' || rank === 'Q' || rank === 'K' || rank === 'A';
    if (!(red && faceOrAce)) cards.push({ id: id++, rank, suit, value: RANK_VALUES[rank] });
  }
  return cards;
}
/** Deck.shuffle: Fisher-Yates from the top index down, j = random(1, i) (1-based, as in Lua). */
export function shuffle(cards, rng) {
  for (let i = cards.length; i >= 2; i--) {
    const j = rng.int(1, i);
    const t = cards[i - 1]; cards[i - 1] = cards[j - 1]; cards[j - 1] = t;
  }
  return cards;
}

// ------------------------------------------------------------------ the run
export function newRun(seed) {
  const s = {
    v: ENGINE_VERSION,
    seed: String(seed),
    actions: '',
    dungeon: 0,
    maxHp: START_HP + 1,   // dungeon 1 lowers it to 20
    hp: 0,
    state: STATE.CHOOSING,
    cleared: 0,            // dungeons cleared this run
    history: [],           // [{dungeon, maxHp, hp, score, rooms, slain, potions}] one per cleared dungeon
    totals: { rooms: 0, slain: 0, potions: 0 },
    result: null,          // when OVER: {reason: 'dead' | 'complete', dungeons, final, score}
    lastAction: null,      // {n, text, kind}: HUD feedback (Game:_setAction)
    actN: 0,
  };
  startDungeon(s);
  return s;
}

function startDungeon(s) {
  s.dungeon++;
  s.maxHp--;
  s.hp = s.maxHp;
  s.weapon = null;           // a fresh dungeon is a fresh deck: the old weapon (a card of the old deck) is gone
  s.weaponLimit = null;
  s.weaponKills = [];        // display only: the monsters slain with the current weapon
  s.deck = shuffle(buildDeck(), makeRng(s.seed + ':' + s.dungeon));
  s.room = [];
  s.resolved = 0;
  s.potionUsed = false;
  s.discard = [];
  s.carryOver = null;
  s.ranThisRoom = false;
  s.ranLastRoom = false;
  s.pending = null;
  s.roomsCleared = 0;
  s.monstersSlain = 0;
  s.potionsDrunk = 0;
  s.lastResolved = null;
  s.state = STATE.CHOOSING;
  deal(s);
}

// _updateDealing (instant): fill the room to 4 from the top of the deck
function deal(s) {
  const n = Math.min(4 - s.room.length, s.deck.length);
  if (n === 0) {
    if (s.room.length === 0) dungeonWon(s);
    else s.state = STATE.CHOOSING;
    return;
  }
  for (let i = 0; i < n; i++) s.room.push(s.deck.shift());
  s.state = STATE.CHOOSING;
}

function setAction(s, text, kind) { s.lastAction = { n: ++s.actN, text, kind }; }

export const canUseWeapon = (s, monsterValue) => !!s.weapon && (s.weaponLimit == null || monsterValue <= s.weaponLimit);
export const canRun = (s) => s.state === STATE.CHOOSING && !s.ranThisRoom && !s.ranLastRoom && s.room.length > 0;
/** Can room card i be picked? (main.lua disables a potion once one was drunk this room) */
export const cardEnabled = (s, c) => !(isPotion(c) && s.potionUsed);

function hasLegalMoves(s) {
  if (canRun(s)) return true;
  for (const c of s.room) {
    if (isMonster(c) || isWeapon(c)) return true;
    if (isPotion(c) && !s.potionUsed) return true;
  }
  return false;
}

function removeFromRoom(s, index) {
  const [card] = s.room.splice(index, 1);
  s.discard.push(card);
  s.resolved++;
  s.lastResolved = card;
  return card;
}

// _updateResolving: back to CHOOSING, then _checkRoomEnd
function afterResolve(s) {
  s.state = STATE.CHOOSING;
  if (s.resolved >= 3 || s.room.length === 0) endRoom(s);
  else if (!hasLegalMoves(s)) {
    setAction(s, 'No moves left!', 'stuck');
    // the remaining cards go to the bottom of the deck (like running), the room counts as cleared
    for (const c of s.room) s.deck.push(c);
    s.room = [];
    s.roomsCleared++; s.totals.rooms++;
    if (s.deck.length === 0) dungeonWon(s);
    else startNewRoom(s);
  }
}

function endRoom(s) {
  s.roomsCleared++; s.totals.rooms++;
  // the 4th, unplayed card carries over into the next room
  s.carryOver = s.room.length > 0 ? s.room[0] : null;
  s.room = [];
  if (s.deck.length === 0 && s.carryOver == null) dungeonWon(s);
  else startNewRoom(s);
}

function startNewRoom(s) {
  s.room = [];
  s.resolved = 0;
  s.potionUsed = false;
  s.ranLastRoom = s.ranThisRoom;
  s.ranThisRoom = false;
  if (s.carryOver) { s.room.push(s.carryOver); s.carryOver = null; }
  deal(s);
}

// ------------------------------------------------------------------ scoring
/** Standard Scoundrel score for the dungeon now: dead = minus the monsters left in it;
 *  survived = HP left, plus the last potion's value when that potion was drunk at full HP. */
export function dungeonScore(s) {
  if (s.hp <= 0) {
    let left = 0;
    for (const c of [...s.deck, ...s.room, ...(s.carryOver ? [s.carryOver] : [])]) if (isMonster(c)) left += c.value;
    return -left;
  }
  let sc = s.hp;
  if (s.hp === s.maxHp && s.lastResolved && isPotion(s.lastResolved)) sc += displayValue(s.lastResolved);
  return sc;
}
/** Run ranking: dungeons cleared, then the final dungeon's standard score (higher is better). */
export const compareResults = (a, b) => (a.dungeons - b.dungeons) || (a.final - b.final);

function dungeonWon(s) {
  const score = dungeonScore(s);
  s.cleared++;
  s.history.push({ dungeon: s.dungeon, maxHp: s.maxHp, hp: s.hp, score, rooms: s.roomsCleared, slain: s.monstersSlain, potions: s.potionsDrunk });
  setAction(s, 'Dungeon ' + s.dungeon + ' cleared!', 'cleared');
  if (s.maxHp - 1 <= 0) {
    // the next dungeon would start at 0 max HP: the run is complete
    s.state = STATE.OVER;
    s.result = { reason: 'complete', dungeons: s.cleared, final: score };
  } else s.state = STATE.CLEARED;
}

function die(s) {
  s.hp = 0;
  const final = dungeonScore(s);
  s.state = STATE.OVER;
  s.result = { reason: 'dead', dungeons: s.cleared, final };
}

// ------------------------------------------------------------------ actions
function drinkPotion(s, card, index) {
  const heal = displayValue(card);
  const old = s.hp;
  s.hp = Math.min(s.maxHp, s.hp + heal);
  s.potionsDrunk++; s.totals.potions++;
  s.potionUsed = true;
  setAction(s, '+' + (s.hp - old) + ' HP', 'heal');
  removeFromRoom(s, index);
  afterResolve(s);
}

function equipWeapon(s, card, index) {
  if (s.weapon) s.discard.push(s.weapon, ...s.weaponKills);
  s.weapon = card;
  s.weaponLimit = null;   // a fresh weapon: no limit yet
  s.weaponKills = [];
  setAction(s, 'Equipped ' + card.rank + ' weapon', 'equip');
  const [c] = s.room.splice(index, 1);   // (_removeFromRoom, but the card goes to the weapon slot)
  s.resolved++;
  s.lastResolved = c;
  afterResolve(s);
}

function fightMonster(s, card, index, useWeapon) {
  let damage;
  const armed = useWeapon && canUseWeapon(s, card.value);
  if (armed) {
    damage = Math.max(0, card.value - s.weapon.value);
    s.weaponLimit = card.value;   // the weapon degrades: from now on it only fights monsters <= this one
    setAction(s, '-' + damage + ' HP (weapon)', 'weapon');
  } else {
    damage = card.value;
    setAction(s, '-' + damage + ' HP (unarmed)', 'unarmed');
  }
  s.hp -= damage;
  s.monstersSlain++; s.totals.slain++;
  const [c] = s.room.splice(index, 1);
  s.resolved++;
  s.lastResolved = c;
  if (armed) s.weaponKills.push(c);   // (shown stacked on the weapon, as at the table)
  else s.discard.push(c);
  if (s.hp <= 0) { die(s); return; }
  afterResolve(s);
}

/** Why an action would be refused right now (null: it is legal). */
export function refusal(s, a) {
  if (s.state === STATE.OVER) return 'the run is over';
  if (a === 'd') return s.state === STATE.CLEARED ? null : 'no dungeon to descend to yet';
  if (s.state === STATE.CLEARED) return 'descend to the next dungeon first';
  if (a === 'w' || a === 'b' || a === 'c') {
    if (s.state !== STATE.FIGHT_CHOICE) return 'no fight to choose';
    if (a === 'w' && !canUseWeapon(s, s.room[s.pending].value)) return 'the weapon cannot fight this monster';
    return null;
  }
  if (s.state !== STATE.CHOOSING) return 'choose how to fight first';
  if (a === 'r') return canRun(s) ? null : (s.ranLastRoom ? 'you ran from the last room' : s.ranThisRoom ? 'already ran' : 'cannot run');
  if (/^[0-3]$/.test(a)) {
    const i = +a;
    if (i >= s.room.length) return 'no such card';
    if (!cardEnabled(s, s.room[i])) return 'already drank a potion this room';
    return null;
  }
  return 'unknown action';
}

/** Apply one action. Returns true when it was legal (and recorded), false when refused. */
export function apply(s, a) {
  a = String(a);
  if (refusal(s, a) != null) return false;
  s.actions += a;
  if (a === 'd') { startDungeon(s); setAction(s, 'Dungeon ' + s.dungeon + ' · Max HP ' + s.maxHp, 'descend'); return true; }
  if (a === 'r') {
    for (const c of s.room) s.deck.push(c);   // to the bottom of the deck, in order
    s.room = [];
    s.ranThisRoom = true;
    setAction(s, 'Ran away!', 'run');
    startNewRoom(s);
    return true;
  }
  if (a === 'c') { s.pending = null; s.state = STATE.CHOOSING; return true; }
  if (a === 'w' || a === 'b') {
    const i = s.pending;
    s.pending = null;
    fightMonster(s, s.room[i], i, a === 'w');
    return true;
  }
  const i = +a, card = s.room[i];
  if (isPotion(card)) drinkPotion(s, card, i);
  else if (isWeapon(card)) equipWeapon(s, card, i);
  else if (canUseWeapon(s, card.value)) { s.pending = i; s.state = STATE.FIGHT_CHOICE; }
  else fightMonster(s, card, i, false);
  return true;
}

/** Rebuild a run from its recipe. Stops at the first refused action (a corrupt tail). */
export function replay(seed, actions, upTo = Infinity) {
  const s = newRun(seed);
  const acts = String(actions || '');
  for (let i = 0; i < acts.length && i < upTo; i++) if (!apply(s, acts[i])) break;
  return s;
}

// ------------------------------------------------------------------ view (what the UI and spectators draw)
const cardView = (c) => c && { id: c.id, rank: c.rank, suit: c.suit, value: c.value, kind: kindOf(c) };
export function view(s) {
  return {
    v: ENGINE_VERSION,
    seed: s.seed,
    n: s.actions.length,
    state: s.state,
    dungeon: s.dungeon,
    maxHp: s.maxHp,
    hp: s.hp,
    room: s.room.map((c) => ({ ...cardView(c), enabled: cardEnabled(s, c) })),
    weapon: cardView(s.weapon),
    weaponLimit: s.weaponLimit,
    weaponKills: s.weaponKills.map(cardView),
    deckCount: s.deck.length,
    discardCount: s.discard.length,
    resolved: s.resolved,
    potionUsed: s.potionUsed,
    canRun: canRun(s),
    ranLastRoom: s.ranLastRoom,
    pending: s.pending,
    roomNo: s.roomsCleared + 1,
    slain: s.monstersSlain,
    potions: s.potionsDrunk,
    cleared: s.cleared,
    totals: { ...s.totals },
    history: s.history.map((h) => ({ ...h })),
    nextMaxHp: s.maxHp - 1,
    lastAction: s.lastAction,
    result: s.result,
    over: s.state === STATE.OVER,
  };
}

/** A short progress line (presence / spectator label). */
export function label(s) {
  if (s.state === STATE.OVER) return 'Run over · ' + s.cleared + ' cleared';
  return 'Dungeon ' + s.dungeon + ' · ' + s.hp + '/' + s.maxHp + ' HP';
}
