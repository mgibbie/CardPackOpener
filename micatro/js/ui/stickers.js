// Per-joker win stickers (Balatro's set_joker_win / get_joker_win_sticker): winning a run marks every joker
// in it — and, with Pokermon's previous_evo_stickers, a Pokémon's earlier stages (the engine's `win` event
// lists the keys: run.js joker_win_keys) — with the highest stake it has won on. The joker then wears that
// stake's sticker (stickers.png: White, Red, Green, Black, Blue, Purple, Orange, Gold) and its tooltip says so.
//   * Stored per player in localStorage ('micatro_joker_wins_v1:<user>' = {jokerKey: highest stake level}),
//     try/catch — private mode just forgets. A viewer's own record (spectators / replays draw theirs, and a
//     replay or a spectated win records nothing).
//   * Like Balatro, seeded and challenge runs earn no stickers (win_game skips set_joker_win).
//   * Collection-style screens (the Pokédex, the Challenges screen) always show them; on the table they show
//     while Options > "Stake stickers" is on (Balatro's "Display stickers"; on by default here, since Micatro
//     has no collection screen to see them in otherwise).
export const STICKER_NAMES = ['White', 'Red', 'Green', 'Black', 'Blue', 'Purple', 'Orange', 'Gold'];
/** stickers.png cells (game.lua G.shared_stickers). */
export const STICKER_POS = {
  White: { x: 1, y: 0 }, Red: { x: 2, y: 0 }, Green: { x: 3, y: 0 }, Black: { x: 0, y: 1 },
  Blue: { x: 4, y: 0 }, Purple: { x: 1, y: 1 }, Orange: { x: 2, y: 1 }, Gold: { x: 3, y: 1 },
};
const SHOW_KEY = 'micatro_stake_stickers';
let user = 'guest';
let wins = {};
let show = true;
export let stickerVer = 0;
const listeners = new Set();
const key = () => 'micatro_joker_wins_v1:' + user;
const bump = () => { stickerVer++; for (const cb of listeners) { try { cb(); } catch (e) { /* ignore */ } } };

export function initWinStickers(username) {
  user = (username && String(username)) || 'guest';
  try { const w = JSON.parse(localStorage.getItem(key()) || '{}'); wins = w && typeof w === 'object' && !Array.isArray(w) ? w : {}; } catch (e) { wins = {}; }
  try { const s = localStorage.getItem(SHOW_KEY); show = s == null ? true : s === '1'; } catch (e) { show = true; }
  bump();
}
export function onWinStickers(cb) { listeners.add(cb); return () => listeners.delete(cb); }
/** A stake level (1..8; a mod stake's higher level counts as Gold) -> its sticker name. */
export const stickerName = (level) => (level > 0 ? STICKER_NAMES[Math.min(8, Math.max(1, Math.floor(level))) - 1] : null);
/** The win event ({jokers: [keys], stake}) -> stored. Returns how many jokers improved. */
export function recordWin(ev) {
  if (!ev || !Array.isArray(ev.jokers)) return 0;
  const lv = Math.min(8, Math.max(1, Math.floor(Number(ev.stake) || 1)));
  let n = 0;
  for (const k of ev.jokers) {
    if (typeof k !== 'string' || !/^[A-Za-z0-9_]{1,64}$/.test(k)) continue;
    if ((wins[k] || 0) < lv) { wins[k] = lv; n++; }
  }
  if (n) { try { localStorage.setItem(key(), JSON.stringify(wins)); } catch (e) { /* not remembered */ } bump(); }
  return n;
}
/** The highest stake level this joker has won on (0 = none). */
export const winLevel = (centerKey) => (centerKey && wins[centerKey]) || 0;
/** The sticker name to draw on this joker, or null. `collection`: always (else only with the option on). */
export function winSticker(centerKey, collection) {
  if (!collection && !show) return null;
  return stickerName(winLevel(centerKey));
}
export const stickersShown = () => show;
export function setStickersShown(on) {
  show = !!on;
  try { localStorage.setItem(SHOW_KEY, show ? '1' : '0'); } catch (e) { /* ignore */ }
  bump();
}
