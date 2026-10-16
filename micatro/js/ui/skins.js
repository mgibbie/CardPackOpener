// Deck skins (Steamodded's SMODS.DeckSkin, Balatro's "Customize Deck"): per-suit face-card art from the
// mods that ship skins — Pokermon (RBY / GSC sprites) and Bunco (Duck Game, LISA, Fiend Folio for its
// exotic suits; the Recast Contrast resprite for the base suits). COSMETIC ONLY: a skin never reaches the
// engine, the run recipe or a spectator's screen (each viewer sees their own choice); chosen in Options,
// remembered per player in localStorage ('micatro_skins_v1:<user>', try/catch: private mode just forgets).
// The skin data files are plain data in each mod's folder (mods/<id>/skins.js), loaded without the mod.

const LOADERS = [
  () => import('../../mods/pokermon/skins.js'),
  () => import('../../mods/bunco/skins.js'),
];
export const BASE_SUITS = [['Spades', 'S'], ['Hearts', 'H'], ['Clubs', 'C'], ['Diamonds', 'D']];
const SUIT_NAMES = { Spades: 'Spades', Hearts: 'Hearts', Clubs: 'Clubs', Diamonds: 'Diamonds', bunc_Fleurons: 'Fleurons', bunc_Halberds: 'Halberds' };
const LETTER = Object.fromEntries(BASE_SUITS.map(([s, l]) => [l, s]));
const RANK_OF_FRONT = (k) => String(k || '').slice(String(k || '').lastIndexOf('_') + 1);

let SKINS = [];
let sel = {};            // suit -> {skin, palette}
let user = 'guest';
let loading = null;
export let skinVer = 0;  // bumps whenever what a card face shows may have changed (choice made / art arrived)
const listeners = new Set();
const imgs = new Map();  // src -> {img, state}

const prefKey = () => 'micatro_skins_v1:' + user;
function readPrefs() {
  try { const p = JSON.parse(localStorage.getItem(prefKey()) || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : {}; } catch (e) { return {}; }
}
function savePrefs() { try { localStorage.setItem(prefKey(), JSON.stringify(sel)); } catch (e) { /* private mode: not remembered */ } }
const bump = () => { skinVer++; for (const cb of listeners) { try { cb(); } catch (e) { /* ignore */ } } };

/** Load the skin lists (once) and this player's choices. Never throws. */
export function initSkins(username) {
  user = (username && String(username)) || 'guest';
  sel = readPrefs();
  if (!loading) {
    loading = Promise.all(LOADERS.map((f) => f().then((m) => m.SKINS || []).catch(() => []))).then((lists) => { SKINS = lists.flat(); });
  }
  return loading.then(() => {
    // drop choices whose skin is gone
    for (const [suit, c] of Object.entries(sel)) if (!c || !findSkin(c.skin)) delete sel[suit];
    bump();
  });
}
/** cb() whenever the skins change (a choice, or a sheet finished loading). Returns an unsubscribe. */
export function onSkins(cb) { listeners.add(cb); return () => listeners.delete(cb); }
export const findSkin = (key) => SKINS.find((s) => s.key === key) || null;
/** [{suit, name, skins: [...]}] for the Options screen (base suits first, then the mods' suits). */
export function skinSuits() {
  const suits = [...new Set([...BASE_SUITS.map(([s]) => s), ...SKINS.map((s) => s.suit)])];
  return suits.map((suit) => ({ suit, name: SUIT_NAMES[suit] || suit, skins: SKINS.filter((s) => s.suit === suit) })).filter((x) => x.skins.length);
}
export const choiceFor = (suit) => sel[suit] || null;
/** Choose a skin (null = the default art) for a suit. */
export function setSkin(suit, skinKey, paletteKey) {
  const s = skinKey ? findSkin(skinKey) : null;
  if (!s) delete sel[suit];
  else sel[suit] = { skin: s.key, palette: (s.palettes.find((p) => p.key === paletteKey) || s.palettes[0]).key };
  savePrefs();
  bump();
}
/** Every choice for a suit, flattened: [{skin, palette, label}] (palettes as separate entries). */
export function choicesFor(suit) {
  const out = [{ skin: null, palette: null, label: 'Default' }];
  for (const s of SKINS.filter((x) => x.suit === suit)) for (const p of s.palettes) out.push({ skin: s.key, palette: p.key, label: s.name + (p.label ? ' — ' + p.label : '') });
  return out;
}

function sheet(src) {
  let e = imgs.get(src);
  if (!e) {
    e = { img: new Image(), state: 'loading' };
    imgs.set(src, e);
    e.img.crossOrigin = 'anonymous'; // (mod art is served cross-origin in production; card faces feed WebGL)
    e.img.onload = () => { e.state = 'ok'; bump(); };
    e.img.onerror = () => { e.state = 'error'; console.warn('micatro: deck skin failed to load: ' + src); };
    e.img.src = src;
  }
  return e.state === 'ok' ? e.img : null;
}
/** A playing card's suit + rank (base or mod suit) from its view. */
function suitRank(d) {
  if (!d || !d.front) return null;
  if (d.front_suit) return { suit: d.front_suit, rank: RANK_OF_FRONT(d.front) };
  const i = d.front.indexOf('_');
  return { suit: LETTER[d.front.slice(0, i)], rank: d.front.slice(i + 1) };
}
/**
 * Draw the chosen skin's art for this playing card's front (over the card base). False when the suit
 * keeps its default art, the rank isn't covered, or the sheet isn't loaded yet (then the default draws).
 * `cardsPos` = the card's cell in the base 8BitDeck (a 'deck'-style skin uses the same layout).
 */
export function drawSkinFront(ctx, d, cardsPos, W, H) {
  const sr = suitRank(d);
  if (!sr) return false;
  const c = sel[sr.suit];
  if (!c) return false;
  const s = findSkin(c.skin);
  if (!s) return false;
  const p = s.palettes.find((x) => x.key === c.palette) || s.palettes[0];
  let pos;
  if (s.deck) { if (!cardsPos) return false; pos = cardsPos; }
  else { const i = s.ranks.indexOf(sr.rank); if (i < 0) return false; pos = { x: i, y: 0 }; }
  const img = sheet(p.src);
  if (!img) return false;
  const sw = 142, sh = 190; // (2x art: 71x95 cells)
  try { ctx.drawImage(img, pos.x * sw, pos.y * sh, sw, sh, 0, 0, W, H); } catch (e) { return false; }
  return true;
}
/** Test / tooling access. */
export const _skins = () => SKINS;
