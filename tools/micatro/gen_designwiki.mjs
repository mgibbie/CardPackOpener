// gen_designwiki.mjs — builds designwiki/data/micatro.json (the Micatro section of the
// design wiki) straight from the game engine: balatro_data.js for the protos and
// describe.js for the en-us text (Balatro {C:mult} markup, #n# vars filled with the
// BASE values a fresh run shows — the collection view, not a live card).
// Sprites aren't copied: the wiki points at ../micatro/assets/textures/* (same deploy).
//   node tools/micatro/gen_designwiki.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
globalThis.localStorage = globalThis.localStorage || { getItem() { return null; }, setItem() { }, removeItem() { } };
const eng = (p) => import(pathToFileURL(path.join(ROOT, 'micatro/js/engine', p)).href);

const DATA = (await import(pathToFileURL(path.join(ROOT, 'micatro/data/balatro_data.js')).href)).default;
const core = await eng('core.js');
const { init_game_object } = await eng('run.js');
const { describeCenter, describeBlind, describeTag, describeBack } = await eng('describe.js');
const { G, get_blind_amount } = core;

// A bare game object (no deck, no jokers): every describe() reads its defaults —
// probabilities 1, Idol = Ace of Spades, level-1 hands, ante 1.
for (const k of Object.keys(G)) delete G[k];
G.GAME = init_game_object();
const MISC = DATA.loc.misc;
// The Ox: the collection shows the placeholder, not "High Card"
G.GAME.current_round.most_played_poker_hand = MISC.dictionary.ph_most_played || '(most played hand)';

const C = DATA.centers;
const byOrder = (a, b) => (a.order || 0) - (b.order || 0);
const centersOf = (set) => Object.entries(C).filter(([, v]) => v.set === set).map(([key, v]) => ({ key, ...v })).sort(byOrder);
const RARITY = [null, 'Common', 'Uncommon', 'Rare', 'Legendary'];
const clean = (lines) => (lines || []).filter((l) => l !== '');
const infoOf = (d) => (d.info || []).filter((i) => i && i.name).map((i) => ({ name: i.name, lines: clean(i.lines) }));
const colsOf = (d) => (d.colours && d.colours.length ? d.colours : undefined);

const centerEntry = (c, extra = {}) => {
  const d = describeCenter(c.key) || { name: c.name, lines: [] };
  return {
    key: c.key, name: d.name || c.name, pos: c.pos, ...(c.soul_pos ? { soul: c.soul_pos } : {}),
    cost: c.cost, lines: clean(d.lines), ...(infoOf(d).length ? { info: infoOf(d) } : {}),
    ...(colsOf(d) ? { colours: colsOf(d) } : {}), ...extra,
  };
};

const jokers = centersOf('Joker').map((c) => centerEntry(c, {
  rarity: RARITY[c.rarity] || 'Common',
  bp: !!c.blueprint_compat, et: c.eternal_compat !== false, pe: c.perishable_compat !== false,
}));
// describeCenter drops joker main_start lines; Misprint's whole text is one (card.lua)
for (const j of jokers) {
  const e = C[j.key].config.extra;
  if (C[j.key].name === 'Misprint' && !j.lines.length) j.lines = ['{C:mult}+' + e.min + '-' + e.max + '{} ' + (MISC.dictionary.k_mult || 'Mult')];
}
const tarots = centersOf('Tarot').map((c) => centerEntry(c));
const planets = centersOf('Planet').map((c) => centerEntry(c, {
  hand: c.config.hand_type, dwarf: ['Pluto', 'Ceres', 'Eris', 'Planet X'].includes(c.name) || undefined,
}));
const spectrals = centersOf('Spectral').map((c) => centerEntry(c, c.hidden ? { hidden: true } : {}));
const vouchers = centersOf('Voucher').map((c) => centerEntry(c, c.requires ? { requires: c.requires } : {}));
const boosters = centersOf('Booster').map((c) => centerEntry(c, {
  kind: c.kind, choose: c.config.choose, size: c.config.extra, weight: c.weight,
}));

const tags = Object.entries(DATA.tags).map(([key, t]) => ({ key, ...t })).sort(byOrder).map((t) => {
  const d = describeTag(t.key);
  return {
    key: t.key, name: d.name || t.name, pos: t.pos, lines: clean(d.lines),
    ...(t.min_ante ? { minAnte: t.min_ante } : {}), ...(t.requires ? { requires: t.requires } : {}),
    ...(infoOf(d).length ? { info: infoOf(d) } : {}),
  };
});

const blinds = Object.entries(DATA.blinds).map(([key, b]) => ({ key, ...b })).sort(byOrder).map((b) => {
  const d = describeBlind(b.key);
  return {
    key: b.key, name: d.name, pos: b.pos, mult: b.mult, dollars: b.dollars, lines: clean(d.lines),
    ...(b.boss ? { boss: true, minAnte: b.boss.min, ...(b.boss.showdown ? { showdown: true } : {}), colour: b.boss_colour } : {}),
  };
});
// base chip target per ante (×1 small, ×1.5 big, ×boss mult) for each scaling tier
const anteChips = {};
for (const sc of [1, 2, 3]) {
  G.GAME.modifiers.scaling = sc;
  anteChips[sc] = [];
  for (let a = 1; a <= 8; a++) anteChips[sc].push(get_blind_amount(a));
}
G.GAME.modifiers.scaling = 1;

const decks = centersOf('Back').filter((b) => b.key !== 'b_challenge').map((b) => {
  const d = describeBack(b.key);
  return { key: b.key, name: d.name, pos: b.pos, lines: clean(d.lines) };
});

const stakes = Object.entries(DATA.stakes).map(([key, s]) => ({ key, ...s })).sort((a, b) => a.stake_level - b.stake_level).map((s) => {
  const d = (DATA.loc.descriptions.Stake || {})[s.key] || {};
  return { key: s.key, name: d.name || s.name, chip: s.name, level: s.stake_level, pos: s.pos, lines: clean(d.text) };
});

const planetFor = {};
for (const p of planets) planetFor[p.hand] = p.name;
const hands = Object.entries(DATA.hands).map(([name, h]) => ({ name, ...h })).sort((a, b) => a.order - b.order).map((h) => ({
  name: MISC.poker_hands[h.name] || h.name, chips: h.s_chips, mult: h.s_mult, lChips: h.l_chips, lMult: h.l_mult,
  secret: !h.visible || undefined, planet: planetFor[h.name], example: h.example,
  lines: clean(MISC.poker_hand_descriptions[h.name] || []),
}));

const descOf = (set, key, vars) => {
  const d = (DATA.loc.descriptions[set] || {})[key] || {};
  const lines = (Array.isArray(d.text) ? d.text : []).map((l) => l.replace(/#(\d+)#/g, (m, n) => (vars && vars[n - 1] !== undefined ? String(vars[n - 1]) : m)));
  return { name: d.name || key, lines: clean(lines) };
};
const enhancements = centersOf('Enhanced').map((c) => {
  const d = describeCenter(c.key);
  return { key: c.key, name: d.name || c.name, pos: c.pos, lines: clean(d.lines) };
});
const editions = centersOf('Edition').filter((e) => e.key !== 'e_base').map((e) => {
  const d = describeCenter(e.key);
  return { key: e.key, name: d.name || e.name, lines: clean(d.lines) };
});
const SEAL_POS = { Gold: { x: 2, y: 0 }, Red: { x: 5, y: 4 }, Blue: { x: 6, y: 4 }, Purple: { x: 4, y: 4 } };
const seals = Object.entries(DATA.seals).sort((a, b) => a[1].order - b[1].order).map(([k]) => {
  const d = descOf('Other', k.toLowerCase() + '_seal');
  return { key: k, name: d.name, pos: SEAL_POS[k], lines: d.lines };
});
const stickers = [
  ['eternal', { x: 0, y: 0 }, []], ['perishable', { x: 0, y: 2 }, [5, 5]], ['rental', { x: 1, y: 2 }, [3]],
].map(([k, pos, vars]) => ({ key: k, pos, ...descOf('Other', k, vars) }));

const cards = {};
for (const [k, v] of Object.entries(DATA.cards)) cards[k] = v.pos;

const out = {
  generated: 'tools/micatro/gen_designwiki.mjs',
  jokers, tarots, planets, spectrals, vouchers, boosters, tags, blinds, anteChips, decks, stakes, hands,
  enhancements, editions, seals, stickers, cards,
  soulPos: (C.soul && C.soul.pos) || { x: 0, y: 1 }, basePos: C.c_base.pos,
};
const file = path.join(ROOT, 'designwiki/data/micatro.json');
fs.writeFileSync(file, JSON.stringify(out));
console.log(`wrote ${path.relative(ROOT, file)} (${(fs.statSync(file).size / 1024).toFixed(1)} KB): ` +
  `${jokers.length} jokers, ${tarots.length} tarots, ${planets.length} planets, ${spectrals.length} spectrals, ` +
  `${vouchers.length} vouchers, ${boosters.length} boosters, ${tags.length} tags, ${blinds.length} blinds, ` +
  `${decks.length} decks, ${stakes.length} stakes, ${hands.length} hands`);

// The mods' sections (designwiki/data/micatro_mods*.json), from the mod modules themselves.
await import('./gen_designwiki_mods.mjs');
