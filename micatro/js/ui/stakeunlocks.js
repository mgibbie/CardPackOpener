// Per-deck stake unlocking (Balatro: G.PROFILES[..].deck_usage[back].wins_by_key -> get_deck_win_stake): for each deck,
// White Stake is always open, and a win on the deck at stake N opens stake N+1 for THAT deck. Pure logic (no DOM, no
// storage): the New Run picker (ui/screens.js) feeds it the deck's win-sticker record and the stake list it shows.
//   * The source of truth is the deck's WIN STICKER (ui/stickers.js winRecord(backKey): {win, poke, nuz, mono, both}, each the
//     highest stake level 1..9 won at; 9 = Elite). Nothing new is stored: the deck's best level is the max across its
//     categories, so a sticker anyone already won keeps its unlocks (grandfathered), and a REVOKED deck sticker (stickers.js
//     applyRevoked deletes it; the superseded-key merge is winRecord's own) revokes its unlocks with it.
//   * Every stake has two levels:
//       records  — the sticker level a win on it records (run.js win_sticker_level): a base stake its own level 1..8; a mod
//                  stake the level it plays at (the highest of its applied_stakes chain, mod_stake_chain), raised to the
//                  highest `sticker_level` its chain declares (Pokermon's / Nacho's Elite: 9).
//       requires — the deck level that opens it: a base stake N needs N-1 (White needs 0: always open); a mod stake needs
//                  what a win on its `above_stake` records (Balatro / Steamodded place a mod stake by above_stake).
//     A stake is open when the deck's best level >= requires. So Pokermon's Elite (above Gold) opens after a Gold win.
//   * A mod stake that records a level other than its own position: the record can't tell its win apart from a win at
//     that level, so its successors open on that level. MoreFluff's six stakes all play (and record) at Gold's 8, so a
//     Gold win opens all six; Bunco's Cyan / Pink / Magenta play at Orange's 7, so an Orange win opens all three; Lilac,
//     The Culmination and Nacho's Elite (above Gold or Lilac) open after a Gold win. The lock text names the above stake
//     and, for such a chain, says which plain stake's win counts.
//   * allStakes (the account's server-side allowance, server/mp.mjs MICATRO_ALL_STAKES, read from micatro-stickers-get):
//     every stake is open on every deck.
// Only the New Run picker gates. A run already in progress, a resume, a replay, a spectated run, a challenge (its own
// stake) and Hold-R restart (the same recipe) never ask.

/** The highest stake level a deck's record holds, across its categories (0 = never won with it). */
export function deckBest(record) {
  if (!record || typeof record !== 'object') return 0;
  let best = 0;
  for (const v of Object.values(record)) if (Number.isInteger(v) && v > best) best = v;
  return best;
}

/**
 * The picker's stake list (base stakes {key, level}, then mod stakes {key, mod, applied_stakes, above_stake, sticker_level?,
 * stake_level?}) -> the same order as [{stake, records, requires, above}] (`above`: the stake whose win opens it, or null).
 */
export function stakeLadder(stakes) {
  const list = Array.isArray(stakes) ? stakes.filter(Boolean) : [];
  const byKey = new Map(list.map((s) => [s.key, s]));
  const find = (k) => (typeof k !== 'string' ? null : byKey.get(k) || byKey.get('stake_' + k) || null);
  const isMod = (s) => !!(s && s.mod);
  const baseLevel = (s) => (Number.isInteger(s.level) ? s.level : Number.isInteger(s.stake_level) ? s.stake_level : 1);
  // run.js mod_stake_chain, over the listed stakes: {play, chain}
  const chainOf = (s, depth = 0) => {
    if (!isMod(s)) return { play: baseLevel(s), chain: [] };
    let play = typeof s.stake_level === 'number' ? s.stake_level : 1;
    const chain = [];
    if (depth <= 10) {
      for (const a of s.applied_stakes || []) {
        const sub = find(a);
        if (!sub) continue;
        const c = chainOf(sub, depth + 1);
        play = Math.max(play, c.play);
        for (const x of c.chain) if (!chain.includes(x)) chain.push(x);
      }
    }
    chain.push(s);
    return { play, chain };
  };
  const recordsOf = (s) => {
    const { play, chain } = chainOf(s);
    let lv = isMod(s) ? Math.min(8, play) : play;   // (stickers.js winEventLevel: a stake level never reaches Elite by itself)
    for (const c of chain) if (Number.isInteger(c.sticker_level) && c.sticker_level > lv) lv = c.sticker_level;
    return lv;
  };
  return list.map((s) => {
    if (!isMod(s)) {
      const level = baseLevel(s);
      return { stake: s, records: level, requires: Math.max(0, level - 1), above: level > 1 ? list.find((x) => !isMod(x) && baseLevel(x) === level - 1) || null : null };
    }
    const above = find(s.above_stake);
    // (an above stake not in the list — its mod is off: a win at the level this stake plays at opens it)
    const requires = above && above !== s ? recordsOf(above) : chainOf(s).play;
    return { stake: s, records: recordsOf(s), requires, above: above && above !== s ? above : null };
  });
}

/** Is this ladder entry open for a deck whose best level is `best`? (`allStakes`: the account's allowance: always.) */
export const stakeOpen = (entry, best, allStakes = false) => !!entry && (allStakes || (best || 0) >= entry.requires);

/**
 * Which ladder index to select: `wanted` when it's open, else the highest open BASE stake (White at worst) — a saved
 * preference / the stake kept across a deck change that points at a locked stake falls back to it.
 */
export function fallbackIndex(ladder, wanted, best, allStakes = false) {
  if (ladder[wanted] && stakeOpen(ladder[wanted], best, allStakes)) return wanted;
  let pick = 0;
  ladder.forEach((e, i) => { if (!e.stake.mod && stakeOpen(e, best, allStakes) && e.records >= ladder[pick].records) pick = i; });
  return pick;
}

/** The STICKER_NAMES level names (ui/stickers.js), for the lock text. */
const LEVEL_NAMES = ['White', 'Red', 'Green', 'Black', 'Blue', 'Purple', 'Orange', 'Gold', 'Elite'];
/**
 * The lock text for a closed stake: "Win on <above stake> with this deck to unlock". `nameOf(stake)` -> its display name.
 * A mod stake above another mod stake whose win records a plain stake's level adds which win counts ("a Gold Stake win
 * counts"), since the record can't tell those wins apart.
 */
export function lockText(entry, nameOf = (s) => s.name || s.key) {
  if (!entry) return '';
  const above = entry.above;
  const prev = above ? nameOf(above) : (LEVEL_NAMES[entry.requires - 1] || 'the previous') + ' Stake';
  let t = 'Win on ' + prev + ' with this deck to unlock';
  if (above && above.mod && entry.requires >= 1 && entry.requires <= 8) t += ' (a ' + LEVEL_NAMES[entry.requires - 1] + ' Stake win counts)';
  return t;
}
