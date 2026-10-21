// gen_designwiki_mods.mjs — builds the design wiki's Micatro MOD sections straight from the mod
// modules (the same registerMod() content the game loads) and the engine's own describe():
//   designwiki/data/micatro_mods.json        index: every mod's credits / options / systems /
//                                            intended-design fixes / counts, every mod atlas (with its
//                                            pixel size), and the big-number / deck-editor / replay pages
//   designwiki/data/micatro_mods/<id>.json   one mod's content: sections of items (art layers, text, badges)
// Mods are loaded headlessly like micatro/tests do (all of them, every option at its default), so
// the wiki is exactly what the game registers. Mod art is NOT copied: items point at the mods' own
// atlases (/micatro/mods/<id>/assets/2x/..., redirected to the mod-art Pages project in production).
// The "fixed as the author intended" notes are read from the mods' source comments (the
// "INTENDED-DESIGN FIXES" header lists and the inline "FIX (intended design)" notes).
//   node tools/micatro/gen_designwiki_mods.mjs      (also run by tools/micatro/gen_designwiki.mjs)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() { }, removeItem() { } };
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const DATA = (await imp('micatro/data/balatro_data.js')).default;
const core = await imp('micatro/js/engine/core.js');
const { init_game_object } = await imp('micatro/js/engine/run.js');
const { describeCenter, describeBlind, describeTag } = await imp('micatro/js/engine/describe.js');
const IDX = await imp('micatro/js/mods/index.js');
const REG = await imp('micatro/js/mods/registry.js');
const B = await imp('micatro/js/engine/bignum.js');
const CD = await imp('micatro/js/engine/customdeck.js');
const RP = await imp('micatro/js/replays.js');
const SLV = await imp('micatro/js/engine/sleeve.js');
const { challengeItem } = await import('./gen_designwiki_challenges.mjs');
const { G, P_CENTERS, P_TAGS, P_BLINDS, P_SEALS, P_STAKES } = core;

// ------------------------------------------------------------------ load every mod
const ALL = IDX.AVAILABLE.map((m) => m.id);
await IDX.loadMods(ALL);
REG.activateMods(ALL);
let ASPECTS = {};
try { ASPECTS = (await imp('micatro/mods/autumnmood/api.js')).ASPECTS || {}; } catch (e) { /* no AMM */ }
for (const k of Object.keys(G)) delete G[k];
G.GAME = init_game_object();
G.GAME.current_round.most_played_poker_hand = DATA.loc.misc.dictionary.ph_most_played || '(most played hand)';

// ------------------------------------------------------------------ text helpers
const LOC = DATA.loc;
const MOD_LOC = REG.MOD_LOC;
const clean = (lines) => (lines || []).filter((l) => l !== '' && l != null).map(String);
const desc = (set, key) => ((MOD_LOC.descriptions[set] || {})[key]) || ((LOC.descriptions[set] || {})[key]) || null;
const fill = (text, vars) => clean((Array.isArray(text) ? text : text ? [text] : []).map((l) => String(l).replace(/#(\d+)#/g, (m, n) => (vars && vars[n - 1] !== undefined && vars[n - 1] !== null ? String(vars[n - 1]) : m))));
const label = (k) => (MOD_LOC.misc.labels || {})[k] || (MOD_LOC.misc.dictionary || {})['k_' + k] || (LOC.misc.labels || {})[k] || (LOC.misc.dictionary || {})['k_' + k] || null;
const plainName = (s) => String(s == null ? '' : s).replace(/\{[^}]*\}/g, '').trim();
const css = (c) => {
  if (!c) return null;
  if (Array.isArray(c)) return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3] == null ? 1 : c[3]})`;
  const s = String(c).trim();
  if (/^#?[0-9a-f]{3}([0-9a-f]{3})?([0-9a-f]{2})?$/i.test(s)) return s[0] === '#' ? s : '#' + s;
  return /^(rgb|hsl)a?\(/i.test(s) ? s : null;
};
const infoOf = (d) => (d && d.info || []).filter((i) => i && i.name).map((i) => ({ name: plainName(i.name), lines: clean(i.lines) }));
const safe = (f, dflt) => { try { const r = f(); return r === undefined ? dflt : r; } catch (e) { return dflt; } };

// ------------------------------------------------------------------ art
const pngSize = (file) => { try { const b = fs.readFileSync(file); if (b.readUInt32BE(12) !== 0x49484452) return null; return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; } catch (e) { return null; } };
const ATLASES = {};
for (const [name, a] of Object.entries(REG.ATLASES)) {
  if (!a || !a.src) continue;
  const rel = decodeURIComponent(String(a.src).replace(/^\//, ''));
  const sz = /^https?:/.test(a.src) ? null : pngSize(path.join(ROOT, rel));
  ATLASES[name] = { mod: a.mod, src: a.src, cw: a.px * 2, ch: a.py * 2, ...(sz ? { w: sz.w, h: sz.h } : {}), ...(a.frames ? { frames: a.frames } : {}) };
}
// Tiled atlases (Pokermon's Unown Swarm strips, batch 10b): no src of their own. As the game's sprite lookup
// (micatro/js/ui/assets.js modCellRect) does, a cell x is drawn from tile floor(x / tile_cols) at x - t * tile_cols,
// and only `crop` of the cell, filling a card. The wiki (designwiki/app.js mcSprite) resolves the same: the entry keeps
// the tile list, the cell size, the crop (2x px) and the card it fills (cw / ch). A tile whose PNG isn't on this disk
// (mod art is gitignored) gets its size from the strip: one row of its frames.
for (const [name, a] of Object.entries(REG.ATLASES)) {
  if (!a || a.src || !Array.isArray(a.tiles) || !a.tile_cols) continue;
  const cw = a.px * 2, ch = a.py * 2;
  a.tiles.forEach((t, i) => {
    const T = ATLASES[t];
    if (T && !T.w) { T.w = Math.max(1, Math.min(a.tile_cols, (a.frames || a.tile_cols) - i * a.tile_cols)) * cw; T.h = ch; }
  });
  const crop = a.crop ? { x: a.crop.x * 2, y: a.crop.y * 2, w: a.crop.w * 2, h: a.crop.h * 2 } : { x: 0, y: 0, w: cw, h: ch };
  ATLASES[name] = { mod: a.mod, tiles: a.tiles, tile_cols: a.tile_cols, cell: [cw, ch], crop, cw: 142, ch: 190, ...(a.frames ? { frames: a.frames } : {}) };
}
// deck skins (mods/<id>/skins.js: plain data, cosmetic; micatro/js/ui/skins.js draws them): each palette
// sheet is an atlas of 2x card cells — J / Q / K in a row, or (a whole-deck resprite) the 8BitDeck layout
const SKINS = [];
for (const m of IDX.AVAILABLE) {
  const f = path.join(ROOT, 'micatro/mods', m.id, 'skins.js');
  if (fs.existsSync(f)) SKINS.push(...((await import(pathToFileURL(f).href)).SKINS || []).map((s) => ({ mod: m.id, ...s })));
}
for (const s of SKINS) for (const p of s.palettes) {
  const sz = pngSize(path.join(ROOT, decodeURIComponent(String(p.src).replace(/^\//, ''))));
  ATLASES['skin_' + s.key + '_' + p.key] = { mod: s.mod, src: p.src, cw: 142, ch: 190, ...(sz ? { w: sz.w, h: sz.h } : {}) };
}
const VANILLA = { Joker: 'Joker', Tarot: 'Tarot', Planet: 'Tarot', Spectral: 'Tarot', Voucher: 'Voucher', Booster: 'Booster' };
/** An art layer: ['@<mod atlas>' | '<vanilla atlas>', pos]; null when the item has no drawable art. */
const layer = (atlas, pos, fallback) => {
  if (!pos) return null;
  if (atlas) return ATLASES[atlas] ? ['@' + atlas, { x: pos.x || 0, y: pos.y || 0 }] : null;
  return fallback ? [fallback, { x: pos.x || 0, y: pos.y || 0 }] : null;
};
const centerArt = (c) => {
  const base = layer(c.atlas, c.pos, VANILLA[c.set] || 'centers');
  if (!base) return null;
  // (a tiled strip's soul is its own '<atlas>_soul' strip, as the game's animation draws it: Pokermon ui.js anim)
  const soulAtlas = c.atlas && ATLASES[c.atlas] && ATLASES[c.atlas].tiles && ATLASES[c.atlas + '_soul'] ? c.atlas + '_soul' : c.atlas;
  const soul = c.soul_pos ? layer(soulAtlas, c.soul_pos, VANILLA[c.set] || 'centers') : null;
  return soul ? [soul, base] : [base];
};

// ------------------------------------------------------------------ items
const modOf = (o) => o && o.mod;
// (poke_replaced_by: an add-on duplicate of a Pokermon joker is out of play — Pokermon precedence, PORTING.md "Add-on dedupe" —
// so it gets no entry of its own; the add-on's features line names what Pokermon took over. `legacy`: a card a mod upgrade retired
// but keeps registered for old saves — Nacho 1.7.9's dropped Mega Salamence.)
const ownCenters = (id, set) => Object.values(P_CENTERS).filter((c) => c.mod === id && c.set === set && !c.unported && !c.poke_replaced_by && !c.legacy).sort((a, b) => (a.order || 0) - (b.order || 0));
const RARITY = { 1: ['Common', '#009dff'], 2: ['Uncommon', '#35a97c'], 3: ['Rare', '#fe5f55'], 4: ['Legendary', '#b26cbb'] };
const badgeList = (d, skip) => (d && d.badges || []).filter((b) => b && b.key !== 'mod' && !(skip || []).includes(b.key))
  .map((b) => ({ label: plainName(b.label || b.key), colour: css(b.colour) || null })).filter((b) => b.label);
const optionPill = (c, mod) => {
  const need = c.mod_option || c.poke_option;
  if (!need) return null;
  const o = mod.options && mod.options[need];
  const on = o ? !!o.default : false;
  return { text: (on ? 'Option: ' : 'Off by default · option: ') + ((o && o.label) || need.replace(/_/g, ' ')), off: !on };
};
const depPill = (c) => (c.dependencies && c.dependencies.length ? { text: 'Needs ' + c.dependencies.map((d) => IDX.modName(d)).join(' + ') } : null);

/** A center's text: describeCenter (what the game shows); a mod booster / center whose loc sits under 'Other' falls back to it. */
function centerDesc(c) {
  const d = safe(() => describeCenter(c.key), null) || { name: c.name, lines: [] };
  if (!clean(d.lines).length) {
    const o = desc('Other', c.key);
    if (o) {
      const fake = { ability: { extra: c.config && c.config.extra, ...(c.config || {}) }, config: { center: c }, fake: true };
      const vars = c.loc_vars ? safe(() => (c.loc_vars(c, [], fake) || {}).vars, []) : [];
      return { ...d, name: d.name && d.name !== c.key ? d.name : o.name, lines: fill(o.text, vars) };
    }
  }
  return d;
}
function centerItem(c, mod, extra = {}) {
  const d = centerDesc(c);
  const pills = [optionPill(c, mod), depPill(c), ...(extra.pills || [])].filter(Boolean);
  const it = {
    key: c.key, name: plainName(d.name || c.name || c.key) || '(unnamed)', art: centerArt(c),
    ...(c.cost != null && c.set !== 'Back' && c.set !== 'Enhanced' && c.set !== 'Edition' ? { cost: c.cost } : {}),
    lines: clean(d.lines), ...(infoOf(d).length ? { info: infoOf(d) } : {}), ...(d.colours && d.colours.length ? { colours: d.colours } : {}),
    ...(pills.length ? { pills } : {}),
  };
  delete extra.pills;
  return Object.assign(it, extra);
}

function jokerItem(c, mod) {
  const d = safe(() => describeCenter(c.key), null);
  const rar = REG.RARITIES[c.rarity];
  const rarity = rar ? [rar.name || rar.key, css(rar.badge_colour) || '#6b7793'] : RARITY[c.rarity] || RARITY[1];
  const extraBadges = badgeList(d, ['common', 'uncommon', 'rare', 'legendary', rar && rar.key]).filter((b) => b.label !== rarity[0]);
  return centerItem(c, mod, {
    badges: [{ label: rarity[0], colour: rarity[1] }, ...extraBadges], rarity: rarity[0],
    ...(c.blueprint_compat === false ? { note: 'Not copyable by Blueprint / Brainstorm' } : {}),
  });
}

const setLabel = (set) => label(String(set).toLowerCase()) || set;
function consumableItem(c, mod) {
  const t = REG.CONSUMABLE_TYPES[c.set];
  const colour = (t && (css(t.secondary_colour) || css(t.primary_colour))) || { Tarot: '#a782d1', Planet: '#13afce', Spectral: '#4584fa' }[c.set] || '#6b7793';
  return centerItem(c, mod, { badges: [{ label: setLabel(c.set), colour }], ...(c.hidden ? { note: 'Rare: can replace a card in a pack' } : {}) });
}

/** A rarity's art: its first joker (own mod first, then any mod's), so the rarity rows and the Joker Rarities cover show one. */
function rarityArt(key) {
  const js = Object.values(P_CENTERS).filter((c) => c.set === 'Joker' && c.rarity === key && !c.unported && !c.poke_replaced_by && !c.legacy).sort((a, b) => (a.mod === RAR_MOD(key) ? 0 : 1) - (b.mod === RAR_MOD(key) ? 0 : 1) || (a.order || 0) - (b.order || 0));
  for (const j of js) { const art = centerArt(j); if (art) return art; }
  return null;
}
const RAR_MOD = (key) => (REG.RARITIES[key] || {}).mod;

function sectionsFor(id) {
  const mod = REG.MODS[id];
  const S = [];
  const add = (sid, title, kind, items, blurb) => { if (items.length) S.push({ id: sid, title, kind, ...(blurb ? { blurb } : {}), items }); };

  add('jokers', 'Jokers', 'tile', ownCenters(id, 'Joker').map((c) => jokerItem(c, mod)));
  // consumables: vanilla sets first, then each mod type (this mod's own first)
  const consSets = [...new Set(Object.values(P_CENTERS).filter((c) => c.mod === id && !c.unported && (c.consumeable || ['Tarot', 'Planet', 'Spectral'].includes(c.set) || REG.CONSUMABLE_TYPES[c.set])).map((c) => c.set))];
  const consOrder = (s) => (['Tarot', 'Planet', 'Spectral'].indexOf(s) + 1) || (REG.CONSUMABLE_TYPES[s] && REG.CONSUMABLE_TYPES[s].mod === id ? 10 : 20);
  consSets.sort((a, b) => consOrder(a) - consOrder(b) || a.localeCompare(b));
  for (const set of consSets) {
    const t = REG.CONSUMABLE_TYPES[set];
    const blurb = t ? (t.mod === id ? 'A new consumable type this mod adds' : 'Cards of ' + IDX.modName(t.mod) + '’s ' + setLabel(set) + ' type') + (t.shop_rate ? ' (shop rate ' + t.shop_rate + ')' : '') + '.' : null;
    add('consumables-' + set.toLowerCase(), setLabel(set) + ' cards', 'tile', ownCenters(id, set).map((c) => consumableItem(c, mod)), blurb);
  }
  add('vouchers', 'Vouchers', 'tile', ownCenters(id, 'Voucher').map((c) => {
    const req = (c.requires || []).map((k) => plainName((safe(() => describeCenter(k), null) || {}).name || k));
    return centerItem(c, mod, { badges: [{ label: req.length ? 'Upgrade' : 'Voucher', colour: req.length ? '#c2410c' : '#fd682b' }], ...(req.length ? { note: 'Requires ' + req.join(', ') } : {}) });
  }));
  add('boosters', 'Booster Packs', 'tile', ownCenters(id, 'Booster').map((c) => centerItem(c, mod, {
    badges: [{ label: (c.kind ? c.kind + ' Pack' : 'Booster'), colour: '#646eb7' }],
    note: 'Choose ' + ((c.config && c.config.choose) || 1) + ' of ' + ((c.config && c.config.extra) || '?') + (c.weight != null ? ' · weight ' + c.weight : ''),
  })));
  add('decks', 'Decks', 'tile', ownCenters(id, 'Back').map((c) => centerItem(c, mod, { badges: [{ label: 'Deck', colour: '#4f6367' }] })));
  add('enhancements', 'Enhancements', 'tile', ownCenters(id, 'Enhanced').map((c) => centerItem(c, mod, { badges: [{ label: 'Enhancement', colour: '#8389dd' }] })));
  add('editions', 'Editions', 'tile', ownCenters(id, 'Edition').map((c) => centerItem(c, mod, {
    badges: [{ label: 'Edition', colour: '#4ca893' }], art: c.atlas && ATLASES[c.atlas] ? centerArt(c) : [['Joker', { x: 0, y: 0 }]], edition: true,
  })));
  // anything else the mod registers as a center (a set none of the above covers)
  // ('Shader' centers are Reverie's ticket shaders for Cine cards: art effects, not cards — left out.)
  const known = new Set(['Joker', 'Voucher', 'Booster', 'Back', 'Enhanced', 'Edition', 'Shader', ...consSets]);
  const others = Object.values(P_CENTERS).filter((c) => c.mod === id && !c.unported && !known.has(c.set) && c.set !== 'Other');
  add('other', 'Other cards', 'tile', others.map((c) => centerItem(c, mod, { badges: [{ label: c.set, colour: '#6b7793' }] })));

  add('tags', 'Tags', 'row', Object.values(P_TAGS).filter((t) => t.mod === id).sort((a, b) => a.order - b.order).map((t) => {
    let d = safe(() => describeTag(t.key), null) || {};
    // (a mod tag registered without set 'Tag' describes as its key in game.describeTag; read its loc directly)
    if ((!d.name || d.name === t.key) && desc('Tag', t.key)) {
      const vars = t.loc_vars ? safe(() => (t.loc_vars(t, [], { key: t.key, config: t.config || {}, ability: {} }) || {}).vars, []) : [];
      d = { name: desc('Tag', t.key).name, lines: fill(desc('Tag', t.key).text, vars) };
    }
    return { key: t.key, name: plainName(d.name || t.name), art: [layer(t.atlas, t.pos, 'tags')].filter(Boolean), sq: true, lines: clean(d.lines), ...(infoOf(d).length ? { info: infoOf(d) } : {}), ...(t.min_ante ? { pills: [{ text: 'Ante ' + t.min_ante + '+' }] } : {}) };
  }));
  add('blinds', 'Blinds', 'row', Object.values(P_BLINDS).filter((b) => b.mod === id).sort((a, b) => a.order - b.order).map((b) => {
    const d = safe(() => describeBlind(b.key), null) || {};
    const pills = [];
    if (b.boss) pills.push({ text: b.boss.showdown ? 'Showdown' : 'Boss · Ante ' + (b.boss.min || 1) + '+' });
    else if (b.blind_type) pills.push({ text: b.blind_type + ' Blind' });
    if (b.mult != null) pills.push({ text: '×' + b.mult + ' score', cls: 'x' });
    if (b.dollars != null) pills.push({ text: '$' + b.dollars, cls: 'money' });
    // (the wiki's Blinds page groups them: More Fluff's DX bosses are Superbosses — debuff.superboss)
    const group = b.debuff && b.debuff.superboss ? 'superboss' : b.boss ? (b.boss.showdown ? 'showdown' : 'boss') : 'plain';
    if (group === 'superboss') pills.unshift({ text: 'Superboss' });
    return { key: b.key, name: plainName(d.name || b.name), art: [layer(b.atlas, b.pos, 'blind')].filter(Boolean), sq: true, chip: true, group, lines: clean(d.lines), pills, ...(css(b.boss_colour) ? { colour: css(b.boss_colour) } : {}) };
  }));
  add('stakes', 'Stakes', 'row', Object.values(P_STAKES).filter((s) => s.mod === id).map((s) => {
    const d = desc('Stake', s.key) || {};
    const above = s.above_stake ? plainName((desc('Stake', 'stake_' + s.above_stake) || {}).name || s.above_stake) : null;
    return { key: s.key, name: plainName(d.name || s.name || s.key), art: [layer(s.atlas, s.pos, 'chips')].filter(Boolean), sq: true, lines: fill(d.text, s.loc_vars ? safe(() => (s.loc_vars(s) || {}).vars, []) : []), ...(above ? { pills: [{ text: 'After ' + above }] } : {}) };
  }));
  const sealItems = Object.values(P_SEALS).filter((s) => s.mod === id).sort((a, b) => a.order - b.order).map((s) => {
    const vars = s.loc_vars ? safe(() => (s.loc_vars(s, [], { ability: { seal: s.config || {} }, seal: s.key }) || {}).vars, []) : [];
    const d = desc('Other', s.key.toLowerCase() + '_seal') || desc('Other', s.key + '_seal') || desc('Other', s.key) || desc(s.set || 'Other', s.key) || null;
    const nm = plainName((d && d.name) || s.display_name || label(s.key + '_seal') || label(s.key) || s.name || s.key);
    return { key: s.key, name: nm, art: [layer(s.atlas, s.pos)].filter(Boolean), lines: fill(d ? d.text : s.text, vars || (s.config && s.config.extra && [].concat(s.config.extra))), badges: [{ label: s.set === 'Stamp' ? 'Stamp (on Jokers)' : 'Seal', colour: css(s.badge_colour) || '#6b7793' }] };
  });
  add('seals', 'Seals & Stamps', 'tile', sealItems);
  add('aspects', 'Aspects', 'tile', Object.values(ASPECTS).filter((a) => a.mod === id).map((a) => {
    const d = desc('Aspect', a.key + '_aspect') || desc('Aspect', a.key) || desc('Other', a.key) || {};
    const vars = a.loc_vars ? safe(() => (a.loc_vars(a, [], { ability: {} }) || {}).vars, []) : [];
    return { key: a.key, name: plainName(d.name || a.name || a.key), art: [layer(a.atlas, a.pos)].filter(Boolean), lines: fill(d.text, vars || (a.config && a.config.extra && [].concat(a.config.extra))), badges: [{ label: 'Aspect (on playing cards)', colour: css(a.badge_colour) || '#6b7793' }] };
  }));
  add('stickers', 'Stickers', 'tile', Object.values(REG.STICKERS).filter((s) => s.mod === id).map((s) => {
    const d = desc('Other', s.key) || {};
    const vars = s.loc_vars ? safe(() => (s.loc_vars(s, [], { ability: {} }) || {}).vars, []) : [];
    const nm = plainName(d.name || (s.type ? s.label + ' (' + s.type[0].toUpperCase() + s.type.slice(1) + ')' : s.label) || s.key);
    return { key: s.key, name: nm, art: [layer(s.atlas, s.pos), ['Joker', { x: 0, y: 0 }]].filter(Boolean), lines: fill(d.text, vars), badges: [{ label: 'Sticker', colour: css(s.badge_colour) || '#6b7793' }] };
  }));
  add('suits', 'Suits', 'tile', Object.values(REG.MOD_SUITS).filter((s) => s.mod === id).map((s) => ({
    key: s.key, name: plainName(label(s.key) || label('b_' + String(s.name || '').toLowerCase()) || s.name || s.key),
    art: [layer(s.atlas, { x: 12, y: (s.pos && s.pos.y) || 0 }), ['centers', DATA.centers.c_base.pos]].filter(Boolean),
    lines: ['A whole new suit: 13 ranks, drawn into decks that allow it.'], badges: [{ label: 'Suit', colour: css(s.colour) || '#6b7793' }],
  })));
  const PH = MOD_LOC.misc.poker_hands || {}, PHD = MOD_LOC.misc.poker_hand_descriptions || {};
  add('hands', 'Poker Hands', 'hand', Object.values(REG.MOD_POKER_HANDS).filter((h) => h.mod === id).map((h) => ({
    key: h.key, name: plainName(PH[h.key] || h.key), chips: h.chips, mult: h.mult, lChips: h.l_chips, lMult: h.l_mult,
    ...(h.visible === false ? { secret: true } : {}), lines: clean(PHD[h.key] || []),
  })));
  add('rarities', 'Joker Rarities', 'row', Object.values(REG.RARITIES).filter((r) => r.mod === id).map((r) => ({
    key: r.key, name: plainName(r.name || r.key), ...(rarityArt(r.key) ? { art: rarityArt(r.key) } : {}), lines: [r.weight ? 'Shop weight ' + r.weight + ' (vanilla: Common 0.7, Uncommon 0.25, Rare 0.05).' : 'Never rolled in the shop: these jokers come from their own sources.'],
    badges: [{ label: 'Rarity', colour: css(r.badge_colour) || '#6b7793' }],
  })));
  // challenges: the Challenges screen's own text (engine/challenge.js challengeInfo)
  const challenges = (Array.isArray(mod.challenges) ? mod.challenges : []).filter((c) => c && typeof c === 'object' && (c.key || c.id));
  add('challenges', 'Challenges', 'row', challenges.map((c) => challengeItem(c, id, IDX.modName, (k) => (P_CENTERS[k] ? centerArt(P_CENTERS[k]) : null))), 'Challenge runs this mod ships, played from the Challenges screen (main menu → Challenges) with the mod on.');
  // sleeves (CardSleeves deck variants, engine/sleeve.js): the New Run picker's own text, plus the
  // alternate effect a sleeve plays with its paired deck
  add('sleeves', 'Sleeves', 'tile', (Array.isArray(mod.sleeves) ? mod.sleeves : []).filter((s) => s && s.key && !s.legacy).map((s0) => {
    const s = s0.mod ? s0 : { ...s0, mod: id };
    const d = SLV.sleeveInfo(s, null);
    const info = [];
    if (s.alt && s.alt.deck) {
      const alt = SLV.sleeveInfo(s, s.alt.deck);
      if (alt.alt) info.push({ name: 'With the ' + plainName((safe(() => describeCenter(s.alt.deck), null) || {}).name || s.alt.deck), lines: clean(alt.lines) });
    }
    const pill = optionPill(s, mod);
    return {
      key: s.key, name: plainName(d.name || s.name || s.key), art: [layer(s.atlas, s.pos)].filter(Boolean), lines: clean(d.lines),
      ...(info.length ? { info } : {}), badges: [{ label: 'Sleeve', colour: '#4f6367' }], ...(pill ? { pills: [pill] } : {}),
    };
  }), 'Deck variants (Larswijn’s CardSleeves): New Run → Sleeve puts one on top of any deck.');
  // deck skins: cosmetic face-card art, chosen per suit in Options → Card skins
  const SUITN = { Spades: 'Spades', Hearts: 'Hearts', Clubs: 'Clubs', Diamonds: 'Diamonds' };
  const suitName = (k) => SUITN[k] || plainName(label(k) || (REG.MOD_SUITS[k] && REG.MOD_SUITS[k].name) || String(k).replace(/^[a-z]+_/, ''));
  add('skins', 'Deck Skins', 'tile', SKINS.filter((s) => s.mod === id).map((s) => {
    const p = s.palettes[0];
    const L = { S: 'Spades', H: 'Hearts', C: 'Clubs', D: 'Diamonds' };
    const letter = Object.keys(L).find((k) => L[k] === s.suit);
    const face = s.deck ? (letter && DATA.cards[letter + '_K'] ? DATA.cards[letter + '_K'] : null) : { x: Math.max(0, s.ranks.indexOf('K')), y: 0 };
    return {
      key: 'skin_' + s.key, name: plainName(s.name) + (s.deck ? ' (' + suitName(s.suit) + ')' : ''),
      art: face ? [['@skin_' + s.key + '_' + p.key, face], ['centers', DATA.centers.c_base.pos]] : null,
      lines: [(s.deck ? 'Resprites every card of {C:attention}' : 'New art for the {C:attention}' + s.ranks.join(', ') + '{} of {C:attention}') + suitName(s.suit) + '{}.',
        s.palettes.length > 1 ? 'Palettes: ' + s.palettes.map((x) => x.label || 'Standard').join(', ') + '.' : null].filter(Boolean),
      badges: [{ label: 'Deck skin', colour: '#4f6367' }, { label: suitName(s.suit), colour: '#6b7793' }],
    };
  }), 'Cosmetic face-card art, chosen per suit in Options → Card skins. Never changes a run (each viewer sees their own choice).');
  return S;
}

// ------------------------------------------------------------------ intended-design fixes (from the source)
const HEADER_RE = /intended[- ]design fix|evidently intended|FIX \(intended design\) list|INTENDED-DESIGN FIX/i;
const INLINE_RE = /(?:FIX(?:\s+\d+)?\s*\(intended design[^)]*\)|intended[- ]design fix)\s*:\s*(.*)$/i;
const listJs = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === 'assets' ? [] : listJs(path.join(dir, e.name))) : e.name.endsWith('.js') ? [path.join(dir, e.name)] : []));
const commentBody = (ln) => { const m = ln.match(/^\s*(?:\/\*\*?|\*(?!\/)|\/\/)\s?(.*)$/); return m ? m[1] : null; };
const isEnd = (ln) => /\*\//.test(ln);
const tidy = (s) => s.replace(/\s+/g, ' ').replace(/\*\/\s*$/, '').trim();
function fixesOf(id) {
  const dir = path.join(ROOT, 'micatro/mods', id);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const file of listJs(dir).sort()) {
    const rel = path.relative(dir, file).replace(/\\/g, '/');
    const L = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    let header = false;
    for (let i = 0; i < L.length; i++) {
      const body = commentBody(L[i]);
      if (body == null || !HEADER_RE.test(body)) continue;
      const after = (body.split(/:\s*/).slice(1).join(': ')).trim();
      // a list follows (header) unless the line itself carries the fix text
      if (after && !/^\(?each|^$/.test(after) && !/list:?$/i.test(body.trim()) && INLINE_RE.test(body)) continue; // inline: handled below
      let cur = null, indent = 0, seen = 0;
      for (let j = i + 1; j < L.length && j < i + 80; j++) {
        const b = commentBody(L[j]);
        if (b == null) break;
        if (!b.trim()) { if (cur) break; else continue; }
        const m = b.match(/^(\s*)(\d+\.|[-+•])\s+(.*)$/);
        if (m) { if (cur) out.push(cur); cur = { file: rel, text: tidy(m[3]) }; indent = m[1].length; seen++; }
        else if (cur && b.match(/^\s*/)[0].length > indent) cur.text = tidy(cur.text + ' ' + b);
        else if (!cur && j - i <= 2) continue; // "(each fix tested in ...)"
        else if (/^\s*Engine fix\b/.test(b) && cur) { out.push(cur); cur = { file: rel, text: tidy(b) }; indent = b.match(/^\s*/)[0].length - 1; }
        else break;
        if (isEnd(L[j])) break;
      }
      if (cur) out.push(cur);
      if (seen) header = true;
    }
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(INLINE_RE);
      if (!m || HEADER_RE.test(L[i]) && /list|FIXES/.test(L[i])) continue;
      if (header && /FIX/.test(L[i])) continue; // the file's header list already has it
      const own = commentBody(L[i]) != null;
      let text = m[1];
      if (own) for (let j = i + 1; j < L.length; j++) { const b = commentBody(L[j]); if (b == null || !b.trim() || /^\s*\*\/\s*$/.test(L[j])) break; text += ' ' + b; if (isEnd(L[j])) break; }
      text = tidy(text);
      if (!text || (!own && text.length < 25) || /^\(?see /i.test(text)) continue;
      out.push({ file: rel, text });
    }
  }
  const seen = new Set();
  return out.filter((f) => f.text.length > 12 && !seen.has(f.text) && seen.add(f.text));
}

// "Skipped" / "Not ported" notes from the mod's index.js header
function notPortedOf(id) {
  const f = path.join(ROOT, 'micatro/mods', id, 'index.js');
  if (!fs.existsSync(f)) return null;
  const L = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  for (let i = 0; i < Math.min(L.length, 120); i++) {
    const b = commentBody(L[i]);
    if (b == null || !/^\s*(Skipped|NOT PORTED|Not ported)\b/.test(b)) continue;
    let t = b;
    for (let j = i + 1; j < L.length; j++) { const c = commentBody(L[j]); if (c == null || !c.trim() || /^\s*\*\/\s*$/.test(L[j])) break; t += ' ' + c; if (isEnd(L[j])) break; }
    return tidy(t);
  }
  return null;
}

// What each mod's systems are (curated; the content tables below are generated).
const SYSTEMS = {
  pokermon: ['Pokémon types on every joker, with Tera stickers that change a joker’s type', 'Evolution: jokers evolve by level (rounds held), by scaling, with evolution items or by deck make-up; an Everstone stops it', 'Energy cards energize a joker’s numbers (type-matched; Colorless gives half), up to a per-joker limit', 'Shiny edition (+1 booster slot in the shop while you own one) and Mega evolutions via the Megastone', 'Safari and Mega joker rarities; family-aware pools, a generation filter and a “Pokémon only” option', 'Items (Poké Balls, evolution stones, held items) as a consumable type, and the scry view (the top of your deck scores like held cards)'],
  nacho: ['More Pokémon lines built on Pokermon’s evolution / energy / type machinery (1.7.9: fossils, Applin, Frigibax, Solosis, Palafin and more)', 'The Stellar type', 'Megas for Pokermon’s Gardevoir, Altaria and Gallade (a Mega Stone)', 'The apples, the Ancient Pack and the Fossil Excavator’s Fossil Tag', 'A per-evolution-line toggle for every line', 'Its old Ralts, Swablu and Bagon lines are base Pokermon’s now (Pokermon wins any duplicate); its Elite stake is Pokermon’s'],
  pokermonplus: ['1.2.0: thirteen Pokémon lines on Pokermon’s machinery (Heatran, Mega Darkrai, Minior, Archaludon, Grafaiai’s Nature...); the 1.0.3 lines it dropped stay as legacy cards, and its Nincada line is base Pokermon’s (Pokermon wins any duplicate)', 'Negative Energy (the Void deck), the per-joker Energy limit, Heatran’s forged cards and the Canari Plush / key items', 'The Timer Ball item, five decks (Pearlescent new), the Lilac stake and the Weakened sticker'],
  riskofjesters: ['Risk of Rain jokers in a vanilla style', 'The Temporary sticker (a copied joker breaks at the end of the round)', 'Printers: bigger boosters (+1 card, +1 choice)', 'Boss blinds incl. two showdowns'],
  sylviesilly: ['Moons: Planet cards that give every card of a suit +5 Chips, or buff an enhancement for the rest of the run', 'Themed booster packs (Suits, Bonus, Fortune)', 'Seal vouchers for Standard packs, four decks and six bosses'],
  milatro: ['30 jokers (no new systems)'],
  mikas: ['Permanent Mult on playing cards (shown on the card)', '60 jokers, 7 decks and a few Tarots / a Spectral, each with its own toggle'],
  olympus: ['Jokers of the Greek gods (no new systems)'],
  inscrybed: ['Inscryption-themed jokers (no new systems)'],
  tagteam: ['One joker that prints Double Tags'],
  smirkeo: ['One joker that prints Negative Tags'],
  altavista: ['One joker that gives a Tarot card for each Pair played'],
  omertadeck: ['One deck: extra joker slots and extra Negative jokers'],
  morefluff: ['Version 1.9.9999 (the rewrite): this port has its 69 returning jokers; its new ones follow in later batches', 'Colour cards: a consumable type that charges up one round at a time and grows stronger the longer you hold it', '45° Rotated Tarots (Rotarots): a second tarot-like type, with the Rotarot Merchant / Tycoon vouchers', 'Eight new enhancements; the Token rarity and the hidden "Old Fluff" rarity of retired jokers', 'Six stakes above Gold with the Heavy, Potato and Suspended stickers, and an exile zone for suspended cards', 'Superboss mode: at the winning ante The Ticket lets you pick a DX boss (Final Stake: all three blinds)', 'The Purple Deck and its own music'],
  betmma: ['58 vouchers plus 24 fusion vouchers (two vouchers merged into one)', 'Voucher rarity: rarer vouchers roll less often', 'Voucher packs (normal, uncommon, fusion)', 'The Phantom and Tentacle editions; the Real Random voucher', 'A toggle per voucher and five challenges'],
  bunco: ['Exotic suits — Fleurons and Halberds — and five Spectrum poker hands', 'Polymino cards that LINK playing cards (linked cards are selected, drawn and destroyed together)', 'Blind packs (choose this ante’s boss) and Virtual packs (the whole deck, Polyminoes used at once)', 'New stakes with the Scattering, Hindered and Reactive stickers', 'The Glitter and Fluorescent editions, Cracker and Copper cards', 'Optional gameplay reworks of some vanilla cards'],
  reverie: ['Cine cards: a consumable type that turns the next shop into a special shop (tags, packs, food jokers…)', 'Exchange Coupons: quests that turn into their Cine when completed', 'Tags sold as cards (Tag packs) and Film packs', 'Ticket editions on Cine cards'],
  autumnmood: ['A mechanics library other mods build on (Þe Autumn Circus)', 'Oddity cards (a consumable type with its own rarities) and Oddity packs', 'Stamps (a seal on Jokers) and Aspects (a second seal-like layer on playing cards)', 'A graveyard for destroyed cards, Bottles (a card stays on top of the deck), suit levels, unscored-card bonuses and petting'],
  autumncircus: ['Uses AutumnMoodMechanics: 10 Stamps, 12 Aspects, suit-level planets, Oddities and the graveyard', 'The Gilded edition, two Homestuck joker rarities (Player, God Tier)', 'Tarots, planets, spectrals, 9 decks, 12 vouchers, a stake and blinds', 'Cross-mod cards with More Fluff (Rotarots, a Colour) when both are on'],
};

// ------------------------------------------------------------------ assemble
fs.mkdirSync(path.join(ROOT, 'designwiki/data/micatro_mods'), { recursive: true });
const index = [];
for (const m of IDX.AVAILABLE) {
  const mod = REG.MODS[m.id];
  if (!mod) { console.warn('not registered: ' + m.id); continue; }
  const sections = sectionsFor(m.id);
  const counts = {};
  for (const s of sections) counts[s.id] = s.items.length;
  const unported = Object.values(P_CENTERS).filter((c) => c.mod === m.id && c.unported).map((c) => c.key);
  const options = IDX.modOptionList(m.id).map((o) => ({ ...o, ...(mod.options[o.key] && (mod.options[o.key].desc || mod.options[o.key].description) ? { desc: mod.options[o.key].desc || mod.options[o.key].description } : {}) }));
  const used = new Set();
  for (const s of sections) for (const it of s.items) for (const l of it.art || []) if (l && l[0][0] === '@') used.add(l[0].slice(1));
  const entry = {
    id: m.id, name: m.name, by: m.by || mod.by || '', version: mod.version || null, description: m.description || mod.description || '',
    size: m.size || null, requires: m.requires || [], optional: (mod.optional || []).filter((x) => IDX.manifest(x)),
    badge: css(mod.badge_colour) || null, prefix: mod.prefix, systems: SYSTEMS[m.id] || [], fixes: fixesOf(m.id), notPorted: notPortedOf(m.id),
    options, counts, total: Object.values(counts).reduce((a, b) => a + b, 0), unported: unported.length,
    cover: (sections.find((s) => s.items.some((it) => it.art && it.art.length)) || { items: [] }).items.find((it) => it.art && it.art.length) || null,
  };
  if (entry.cover) entry.cover = { art: entry.cover.art, sq: !!entry.cover.sq };
  index.push(entry);
  fs.writeFileSync(path.join(ROOT, 'designwiki/data/micatro_mods', m.id + '.json'), JSON.stringify({ id: m.id, name: m.name, generated: 'tools/micatro/gen_designwiki_mods.mjs', sections }));
}

// ------------------------------------------------------------------ categories (the wiki's "Micatro Mods" section)
// Every section id of every mod belongs to exactly one category page (#/micatro-mods/<id>), which lists
// that kind of item across ALL mods. `match` takes a section id; order = the overview grid / sidebar order.
const VANILLA_CONS = ['consumables-tarot', 'consumables-planet', 'consumables-spectral'];
const CATS = [
  ['jokers', 'Jokers', (s) => s === 'jokers', 'Every joker the mods add, with its rarity (the mods’ own rarities too).'],
  ['consumables', 'Tarot, Planet & Spectral', (s) => VANILLA_CONS.includes(s), 'The mods’ cards of Balatro’s own three consumable types.'],
  ['new-consumables', 'New consumable types', (s) => s.startsWith('consumables-') && !VANILLA_CONS.includes(s), 'Whole new consumable types: Energy, Items, Colours, Rotarots, Polyminoes, Cines, Oddities.'],
  ['vouchers', 'Vouchers', (s) => s === 'vouchers', 'Mod vouchers — BETMMA alone adds 82, fusions included.'],
  ['boosters', 'Booster Packs', (s) => s === 'boosters', 'The mods’ packs, including packs for their new card types.'],
  ['tags', 'Tags', (s) => s === 'tags', 'Skip Tags (and Reverie’s tags sold as cards).'],
  ['blinds', 'Blinds', (s) => s === 'blinds', 'Small / Big Blind variants, Boss Blinds, Showdowns and More Fluff’s Superbosses.'],
  ['decks', 'Decks', (s) => s === 'decks', 'Decks for the New Run screen, from every mod.'],
  ['sleeves', 'Sleeves', (s) => s === 'sleeves', 'Deck variants put on top of any deck (CardSleeves).'],
  ['stakes', 'Stakes', (s) => s === 'stakes', 'Extra difficulty stakes.'],
  ['modifiers', 'Enhancements, Editions & Seals', (s) => ['enhancements', 'editions', 'seals', 'aspects', 'stickers'].includes(s), 'Enhancements, editions, seals, stamps, aspects and stickers.'],
  ['hands', 'Poker Hands & Suits', (s) => s === 'hands' || s === 'suits', 'Bunco’s exotic suits and the Spectrum hands they make.'],
  ['rarities', 'Joker Rarities', (s) => s === 'rarities', 'New joker rarities and how often the shop rolls them.'],
  ['challenges', 'Challenges', (s) => s === 'challenges', 'Challenge runs the mods ship.'],
  ['skins', 'Deck Skins', (s) => s === 'skins', 'Cosmetic face-card art per suit.'],
  ['other', 'Other cards', () => true, 'Cards of a kind none of the other pages covers.'],
];
const catOf = (sid) => CATS.find((c) => c[2](sid))[0];
const categories = [];
const sectionsOf = {};
for (const m of index) sectionsOf[m.id] = JSON.parse(fs.readFileSync(path.join(ROOT, 'designwiki/data/micatro_mods', m.id + '.json'), 'utf8')).sections;
for (const [cid, title, , blurb] of CATS) {
  const sec = [], perMod = {};
  let count = 0, cover = null;
  for (const m of index) for (const s of sectionsOf[m.id]) {
    if (catOf(s.id) !== cid) continue;
    if (!sec.some((x) => x.id === s.id)) sec.push({ id: s.id, title: s.title.replace(/ cards$/, ''), kind: s.kind, count: 0 });
    sec.find((x) => x.id === s.id).count += s.items.length;
    perMod[m.id] = (perMod[m.id] || 0) + s.items.length;
    count += s.items.length;
    // (Joker Rarities: a joker with a soul layer if any, e.g. a Mega — the plain first one is the Jokers tile's twin)
    const pick = (x) => x.art && x.art.length && (cid !== 'rarities' || x.art.length > 1);
    if (!cover) { const it = s.items.find(pick); if (it) cover = { art: it.art, sq: !!it.sq, name: it.name }; }
  }
  // (no soul-layered rarity joker: any art)
  if (!cover) for (const m of index) for (const s of sectionsOf[m.id]) { const it = !cover && catOf(s.id) === cid && s.items.find((x) => x.art && x.art.length); if (it) cover = { art: it.art, sq: !!it.sq, name: it.name }; }
  if (!count) continue;
  // section order: the CATS-wide canonical one (Tarot, Planet, Spectral first; then the rest by size)
  const ORDER = ['jokers', ...VANILLA_CONS, 'enhancements', 'editions', 'seals', 'aspects', 'stickers', 'suits', 'hands'];
  sec.sort((a, b) => ((ORDER.indexOf(a.id) + 1) || 99) - ((ORDER.indexOf(b.id) + 1) || 99) || b.count - a.count);
  categories.push({ id: cid, title, blurb, count, sections: sec, perMod, cover });
}

// ------------------------------------------------------------------ the header search's index
// designwiki/data/micatro_mods_search.json: every mod item's key, name, mod, category page, kind and
// searchable text (lower-case, markup and accents stripped — the wiki's mmText minus the name), so the
// wiki-wide search needn't fetch all 19 mod files; a result links to its category page, which loads
// the full file. {mods: [[id, name]], cats: [id], kinds: [label], items: [[key, name, mod#, cat#, kind#, text]]}
{
  const fold = (s) => String(s).replace(/\{[^}]*\}/g, '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
  const cats = categories.map((c) => c.id), kinds = [];
  const kindOf = (title) => { const k = title.replace(/ cards$/, '').replace(/s$/, ''); let i = kinds.indexOf(k); if (i < 0) i = kinds.push(k) - 1; return i; };
  const items = [];
  index.forEach((m, mi) => {
    for (const s of sectionsOf[m.id]) {
      const ci = cats.indexOf(catOf(s.id)), ki = kindOf(s.title);
      for (const it of s.items) {
        const text = fold([...(it.lines || []), ...(it.badges || []).map((b) => b.label), ...(it.info || []).flatMap((i) => [i.name, ...i.lines])].join(' '));
        items.push([it.key, it.name, mi, ci, ki, text]);
      }
    }
  });
  const sfile = path.join(ROOT, 'designwiki/data/micatro_mods_search.json');
  fs.writeFileSync(sfile, JSON.stringify({ generated: 'tools/micatro/gen_designwiki_mods.mjs', mods: index.map((m) => [m.id, m.name]), cats, kinds, items }));
  console.log(`wrote ${path.relative(ROOT, sfile)} (${(fs.statSync(sfile).size / 1024).toFixed(1)} KB): ${items.length} search entries`);
}

// ------------------------------------------------------------------ the native-feature pages
const bigExamples = [[123456, '123456'], [1e11, '1e11'], [1.5e308, '1.5 × 10^308 (a double would overflow)'], [B.mul(1e300, 1e150), '10^450'], [B.pow(10, 999.5), '10^999.5']]
  .map(([v, l]) => ({ value: l, shown: core.number_format(v), big: B.isBig(v) }));
bigExamples.push({ value: '10^1000 and above', shown: core.number_format(Infinity), big: false });
const features = {
  bignum: { maxExp: B.MAX_EXP, examples: bigExamples },
  deckeditor: {
    params: CD.PARAM_GROUPS.map(([g, list]) => ({ group: g, items: list.map(([key, lbl, def, min, max, step]) => ({ key, label: lbl, default: def, min, max, ...(step ? { step } : {}) })) })),
    rules: CD.RULE_GROUPS.map(([g, list]) => ({ group: g, items: list.map(([key, lbl, kind, def, min, max]) => ({ key, label: lbl, kind, default: def, ...(min != null ? { min } : {}), ...(max != null ? { max } : {}) })) })),
    skipped: CD.SKIPPED_OPTIONS.map(([k, why]) => ({ key: k, why })), limits: CD.LIMITS,
    presets: CD.CARD_PRESETS.map((p) => p.name),
    examples: CD.EXAMPLE_DECKS.map((e) => ({ id: e.id, by: e.by, name: e.def.name, desc: e.def.desc, mods: e.def.mods || [],
      jokers: (e.def.jokers || []).map((j) => plainName((safe(() => describeCenter(j.key), null) || {}).name || j.key) + (j.edition ? ' (' + j.edition + (j.eternal ? ', Eternal' : '') + ')' : '')),
      vouchers: (e.def.vouchers || []).map((k) => plainName((safe(() => describeCenter(k), null) || {}).name || k)) })),
    fixes: (() => {
      const L = fs.readFileSync(path.join(ROOT, 'micatro/js/engine/customdeck.js'), 'utf8').split(/\r?\n/);
      const i = L.findIndex((l) => /Fixes over Deck Creator/.test(l));
      const out = [];
      if (i >= 0) for (let j = i + 1; j < L.length; j++) { const b = commentBody(L[j]); if (b == null || !b.trim()) break; const m = b.match(/^\s*\*\s+(.*)$/); if (m) out.push(tidy(m[1])); else if (out.length) out[out.length - 1] = tidy(out[out.length - 1] + ' ' + b); }
      return out;
    })(),
  },
  replays: { localMax: RP.LOCAL_MAX, actionsMax: RP.ACTIONS_MAX, packedMax: RP.PACKED_MAX },
};

const out = { generated: 'tools/micatro/gen_designwiki_mods.mjs', mods: index, categories, atlases: ATLASES, features };
const file = path.join(ROOT, 'designwiki/data/micatro_mods.json');
fs.writeFileSync(file, JSON.stringify(out));
const missingDims = Object.values(ATLASES).filter((a) => !a.w).length;
console.log(`wrote ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(1)} KB) + designwiki/data/micatro_mods/*.json: ${index.length} mods, ` +
  `${index.reduce((n, m) => n + m.total, 0)} items, ${index.reduce((n, m) => n + m.fixes.length, 0)} documented fixes` + (missingDims ? ` (${missingDims} atlases without local art: no pixel size)` : ''));
for (const m of index) console.log('  ' + m.id.padEnd(14) + ' ' + Object.entries(m.counts).map(([k, n]) => k + ' ' + n).join(', ') + ' | fixes ' + m.fixes.length + (m.unported ? ' | unported ' + m.unported : ''));
console.log('  categories: ' + categories.map((c) => c.id + ' ' + c.count).join(', '));
