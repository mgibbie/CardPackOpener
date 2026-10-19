// Every mod Micatro ships, loaded on demand (a mod's code and data only
// download when a run enables it). Order = default display order.
import { MODS, ATLASES, CONSUMABLE_TYPES, RARITIES, MOD_LOC, resolveMods } from './registry.js';
import { P_CENTERS, P_STAKES, P_SEALS } from '../engine/core.js';

export const AVAILABLE = [
  // { id, name, by, requires: [ids], description?, size?, load: () => import('./<id>/index.js') }
  {
    id: 'pokermon', name: 'Pokermon', size: '~30 MB art', by: 'InertSteak & contributors (rebuilt for Micatro)', requires: [],
    description: 'Pokémon jokers that evolve, Energy and Item cards, Tera types, Megas and shinies.',
    load: () => import('../../mods/pokermon/index.js'),
  },
  {
    id: 'nacho', name: "Nacho's Pokermon Dip", size: '~0.3 MB art', by: 'Eternalnacho (rebuilt for Micatro)', requires: ['pokermon'],
    description: 'More Pokémon for Pokermon (Sinnoh starters, Ralts, Bagon, Goomy, Terapagos...), the Stellar type and the Elite Four stake.',
    load: () => import('../../mods/nacho/index.js'),
  },
  {
    id: 'pokermonplus', name: "Sonfive's Pokermon+", size: '~0.1 MB art', by: 'Sonfive, with marcavis, Kek & MyDude (rebuilt for Micatro)', requires: ['pokermon'],
    description: 'Pokémon add-on: Nincada, Darkrai, Meltan, Garganacl and more, the Timer Ball, five new decks, negative Energy and the Lilac stake.',
    load: () => import('../../mods/pokermonplus/index.js'),
  },
  {
    id: 'riskofjesters', name: 'Risk of Jesters', by: 'DVRP (rebuilt for Micatro)', requires: [],
    description: 'Risk of Rain-themed jokers, vouchers (3D/Mili-Tech Printers) and blinds, in a vanilla style.',
    load: () => import('../../mods/riskofjesters/index.js'),
  },
  {
    id: 'sylviesilly', name: "Sylvie's Silliness", by: 'NewtTheFish (rebuilt for Micatro)', requires: [],
    description: 'Decks, blinds, themed packs, moon planets that buff a suit, and the Bloom spectral.',
    load: () => import('../../mods/sylviesilly/index.js'),
  },
  {
    id: 'milatro', name: 'Milatro', by: 'Milan, Emilia & Emma (rebuilt for Micatro)', requires: [],
    description: '30 new jokers.',
    load: () => import('../../mods/milatro/index.js'),
  },
  {
    id: 'mikas', name: "Mika's Mod Collection", by: 'Mikadoe (rebuilt for Micatro)', requires: [],
    description: '60 jokers, 7 decks, and new Tarot/Spectral cards; playing cards can gain permanent Mult.',
    load: () => import('../../mods/mikas/index.js'),
  },
  {
    id: 'olympus', name: 'Olympus', by: 'AbhinavR314 (rebuilt for Micatro)', requires: [],
    description: 'Jokers based on Greek myth.',
    load: () => import('../../mods/olympus/index.js'),
  },
  {
    id: 'inscrybed', name: 'Inscrybed Jokers', by: 'LunaAstraCassiopeia (rebuilt for Micatro)', requires: [],
    description: 'Jokers inspired by Inscryption.',
    load: () => import('../../mods/inscrybed/index.js'),
  },
  {
    id: 'tagteam', name: 'Tag Team', by: 'Snoresville (rebuilt for Micatro)', requires: [],
    description: 'A joker that prints Double Tags.',
    load: () => import('../../mods/tagteam/index.js'),
  },
  {
    id: 'smirkeo', name: 'Smirkeo', by: 'Mica (rebuilt for Micatro)', requires: [],
    description: 'A joker that prints Negative Tags.',
    load: () => import('../../mods/smirkeo/index.js'),
  },
  {
    id: 'altavista', name: 'AltaVista', by: 'Mica (rebuilt for Micatro)', requires: [],
    description: 'A joker that gives a Tarot card for each Pair played.',
    load: () => import('../../mods/altavista/index.js'),
  },
  {
    id: 'omertadeck', name: 'Omerta Deck', by: 'Mica (rebuilt for Micatro)', requires: [],
    description: 'A deck with extra joker slots and extra Negative jokers.',
    load: () => import('../../mods/omertadeck/index.js'),
  },
  {
    id: 'morefluff', name: 'More Fluff', size: '~3 MB art + music', by: 'notmario & contributors (rebuilt for Micatro)', requires: [],
    description: '83 jokers, Colour cards that charge up over rounds, Rotarot cards, new enhancements and decks, and DX Superboss blinds for after you win.',
    load: () => import('../../mods/morefluff/index.js'),
  },
  {
    id: 'betmma', name: 'Betmma Vouchers', size: '~1 MB art', by: 'Betmma (rebuilt for Micatro)', requires: [],
    description: '58 new vouchers and 24 fusion vouchers (with voucher rarities), voucher packs, 11 jokers, 2 editions and 5 challenges.',
    load: () => import('../../mods/betmma/index.js'),
  },
  {
    id: 'bunco', name: 'Bunco', size: '~6 MB art + music', by: 'Firch, RENREN, Peas, minichibis, J.D., Guwahavel, Ciirulean & ejwu (rebuilt for Micatro)', requires: [],
    description: '80 jokers, two exotic suits (Fleurons, Halberds), Spectrum hands, Polymino cards that link cards together, Blind and Virtual packs, 25 blinds, 16 tags and more.',
    load: () => import('../../mods/bunco/index.js'),
  },
  {
    id: 'reverie', name: 'Reverie', size: '~0.3 MB art', by: 'DVRP (rebuilt for Micatro)', requires: [],
    description: 'A movie-themed expansion: Cine cards and quests that turn the next shop into a special shop (tags, packs, food jokers...).',
    load: () => import('../../mods/reverie/index.js'),
  },
  {
    id: 'autumnmood', name: 'AutumnMoodMechanics', size: '~0.2 MB art', by: 'AutumnMood (rebuilt for Micatro)', requires: [],
    description: 'Mechanics library: Oddity cards and packs, joker Stamps, card Aspects, a graveyard for destroyed cards, suit levels.',
    load: () => import('../../mods/autumnmood/index.js'),
  },
  {
    id: 'autumncircus', name: 'Þe Autumn Circus', size: '~2 MB art', by: 'AutumnMood (rebuilt for Micatro)', requires: ['autumnmood'],
    description: 'Welcome to Þe Autumn Circus! 70 jokers, 28 Oddities, new tarots, planets and spectrals, 9 decks, joker Stamps, card Aspects and the Gilded edition (more with More Fluff on).',
    load: () => import('../../mods/autumncircus/index.js'),
  },
];

/** Load (register) the given mods and everything they require. */
export async function loadMods(ids) {
  const want = new Set();
  const add = (id) => {
    const m = AVAILABLE.find((x) => x.id === id);
    if (!m || want.has(id)) return;
    want.add(id);
    for (const r of m.requires || []) add(r);
  };
  for (const id of ids || []) add(id);
  for (const m of AVAILABLE) if (want.has(m.id) && !MODS[m.id]) await m.load();
  return resolveMods([...want]);
}

// ------------------------------------------------------------------------
// UI-facing helpers (the Mods panel, card art, badges). Read-only views of
// the registry plus dependency bookkeeping over AVAILABLE (which is known
// before any mod module has downloaded).

export { MODS, ATLASES, CONSUMABLE_TYPES, RARITIES, MOD_LOC };

/** A registered center (mod or base) by key — e.g. a mod deck's art. */
export const centerByKey = (key) => P_CENTERS[key] || null;
/** A registered seal by key (a mod's seal: its badge colour for a playing card's tooltip). */
export const sealByKey = (key) => P_SEALS[key] || null;
/**
 * Decks the given (loaded) mods add, for the New Run picker — honouring a deck's required mod
 * option (`mod_option` / Pokermon's `poke_option`, e.g. its legacy decks).
 */
/** Stakes the given (loaded) mods add, for the New Run picker (shown after the 8 base stakes). */
export function modStakes(ids) {
  const on = new Set(withRequirements(ids || []));
  return Object.values(P_STAKES).filter((s) => s.mod && on.has(s.mod))
    .map((s) => ({ ...s, text: (MOD_LOC.descriptions.Stake || {})[s.key] || null }));
}
export function modBacks(ids, options = {}) {
  const on = new Set(withRequirements(ids || []));
  return Object.values(P_CENTERS)
    .filter((c) => c.set === 'Back' && c.mod && on.has(c.mod) && !c.unported)
    .filter((c) => {
      const need = c.mod_option || c.poke_option;
      if (!need) return true;
      const o = options[c.mod] || {};
      const def = (MODS[c.mod] && MODS[c.mod].options && MODS[c.mod].options[need]) ? MODS[c.mod].options[need].default : false;
      return !!(o[need] !== undefined ? o[need] : def);
    })
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

/** The manifest entry for a mod id (or null). */
export const manifest = (id) => AVAILABLE.find((m) => m.id === id) || null;

/** Display name of a mod id: registered name, manifest name, or the id itself. */
export function modName(id) {
  return (MODS[id] && MODS[id].name) || (manifest(id) && manifest(id).name) || String(id);
}

/** `ids` plus everything they (transitively) require — manifest order. Unknown ids are dropped. */
export function withRequirements(ids) {
  const want = new Set();
  const add = (id) => {
    const m = manifest(id);
    if (!m || want.has(id)) return;
    want.add(id);
    for (const r of m.requires || []) add(r);
  };
  for (const id of ids || []) add(id);
  return AVAILABLE.filter((m) => want.has(m.id)).map((m) => m.id);
}

/** Mods (among `ids`) that need `id`, directly or through another mod. */
export function dependentsOf(id, ids) {
  const out = [];
  for (const other of ids || []) {
    if (other === id) continue;
    if (withRequirements([other]).includes(id)) out.push(other);
  }
  return out;
}

/** Declared options of a REGISTERED mod: [{key, default, label, type, choices}]. */
export function modOptionList(id) {
  const m = MODS[id];
  if (!m || !m.options) return [];
  return Object.entries(m.options).map(([key, o]) => {
    o = o || {};
    const type = o.type || (Array.isArray(o.choices) ? 'choice' : typeof o.default === 'boolean' ? 'bool' : 'value');
    return { key, default: o.default, label: o.label || key.replace(/_/g, ' '), type, choices: Array.isArray(o.choices) ? o.choices : null };
  });
}
