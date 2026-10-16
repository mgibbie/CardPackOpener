// Micatro — card / blind / tag / back description text with live values.
//
// A port of Card:generate_UIBox_ability_table (card.lua) + generate_card_ui
// (common_events.lua), Tag:get_uibox_table (tag.lua), Back:generate_UI
// (back.lua) and the blind text (Blind:set_text / get_loc_debuff_text), minus
// the UIBox layout. Text keeps Balatro's `{C:mult}` / `{X:mult,C:white}` /
// `{V:1}` markup; the renderer colours it. `{V:n}` colours are returned in
// `colours` (suit names or a hand-level number) for the renderer to resolve.
//
//   describe(card)        -> {name, set, key, lines, badges, info, colours}
//   describeCenter(key)   -> same, for a center with no live card (collection)
//   describeBlind(key)    -> {name, key, lines, chips, chip_text, dollars, boss, ...}
//   describeTag(tagOrKey) -> {name, key, lines, info}
//   describeBack(key)     -> {name, key, lines}

import {
  G, P_CENTERS, P_BLINDS, P_TAGS, LOC, localize, get_blind_amount, number_format,
} from './core.js';
import * as B from './bignum.js';
import { MOD_LOC, MODS, RARITIES, callHook, reduceHook } from '../mods/registry.js';

// --------------------------------------------------------------- helpers
const MISC = LOC.misc;
/** localize(key, set) for the misc tables (ranks, suits_plural, poker_hands, ...). */
function loc(key, set) {
  if (key === undefined || key === null) return '';
  if (set && MISC[set] && MISC[set][key] !== undefined) return MISC[set][key];
  if (!set && MISC.dictionary[key] !== undefined) return MISC.dictionary[key];
  return String(key);
}
function name_text(set, key) {
  const d = desc(set, key);
  return (d && d.name) || key;
}
/** Lua tostring(number) prints %.14g. */
function fmt(v) {
  if (B.isBig(v)) return B.formatBig(v);
  if (typeof v === 'number') {
    if (!isFinite(v)) return v > 0 ? 'inf' : '-inf';
    return String(Number(v.toPrecision(14)));
  }
  if (v === undefined || v === null) return '';
  if (v === true) return 'true';
  if (v === false) return 'false';
  return String(v);
}
/** Fill `#n#` placeholders like Balatro's localize{type='descriptions', vars=...}. */
function fill(lines, vars) {
  vars = vars || [];
  // (SMODS multi-box text — {{...}, {...}} — reads as one list of lines here)
  return (Array.isArray(lines) ? lines.flat(Infinity).filter((l) => typeof l === 'string') : []).map((line) => line.replace(/#(\d+)#/g, (m, n) => (vars[n - 1] !== undefined ? fmt(vars[n - 1]) : m)));
}
function desc(set, key) {
  return (LOC.descriptions[set] && LOC.descriptions[set][key]) || (MOD_LOC.descriptions[set] && MOD_LOC.descriptions[set][key]);
}
function desc_lines(set, key, vars) { const d = desc(set, key); return d ? fill(d.text, vars) : []; }
const SEAL_KEY = (seal) => String(seal).toLowerCase() + '_seal';
const RARITY_KEY = [null, 'common', 'uncommon', 'rare', 'legendary'];

function badge(key) {
  const ML = MOD_LOC.misc;
  const label = (MISC.labels && MISC.labels[key]) || MISC.dictionary['k_' + key] ||
    (ML.labels && ML.labels[key]) || (ML.dictionary && ML.dictionary['k_' + key]) || key;
  return { key, label };
}

// ------------------------------------------------- joker loc_vars (card.lua)
const prob = () => '' + ((G.GAME && G.GAME.probabilities.normal) || 1);
const J = {
  'Joker': (a) => [a.mult],
  'Half Joker': (a) => [a.extra.mult, a.extra.size],
  'Fortune Teller': (a) => [a.extra, (G.GAME.consumeable_usage_total && G.GAME.consumeable_usage_total.tarot) || 0],
  'Steel Joker': (a) => [a.extra, 1 + a.extra * (a.steel_tally || 0)],
  'Chaos the Clown': (a) => [a.extra],
  'Space Joker': (a) => [prob(), a.extra],
  'Stone Joker': (a) => [a.extra, a.extra * (a.stone_tally || 0)],
  'Drunkard': (a) => [a.d_size],
  'Green Joker': (a) => [a.extra.hand_add, a.extra.discard_sub, a.mult],
  'Credit Card': (a) => [a.extra],
  'Blue Joker': (a) => [a.extra, a.extra * ((G.deck && G.deck.cards) ? G.deck.cards.length : 52)],
  'Sixth Sense': () => [],
  'Hack': (a) => [a.extra + 1],
  'Faceless Joker': (a) => [a.extra.dollars, a.extra.faces],
  'Juggler': (a) => [a.h_size],
  'Golden Joker': (a) => [a.extra],
  'Joker Stencil': (a) => [a.x_mult],
  'Ceremonial Dagger': (a) => [a.mult],
  'Banner': (a) => [a.extra],
  'Mystic Summit': (a) => [a.extra.mult, a.extra.d_remaining],
  'Loyalty Card': (a) => [a.extra.Xmult, a.extra.every + 1, localize({ type: 'variable', key: a.loyalty_remaining === 0 ? 'loyalty_active' : 'loyalty_inactive', vars: [a.loyalty_remaining] })],
  '8 Ball': (a) => [prob(), a.extra],
  'Dusk': (a) => [a.extra + 1],
  'Fibonacci': (a) => [a.extra],
  'Scary Face': (a) => [a.extra],
  'Abstract Joker': (a) => [a.extra, ((G.jokers && G.jokers.cards) ? G.jokers.cards.length : 0) * a.extra],
  'Delayed Gratification': (a) => [a.extra],
  'Gros Michel': (a) => [a.extra.mult, prob(), a.extra.odds],
  'Even Steven': (a) => [a.extra],
  'Odd Todd': (a) => [a.extra],
  'Scholar': (a) => [a.extra.mult, a.extra.chips],
  'Business Card': (a) => [prob(), a.extra],
  'Spare Trousers': (a) => [a.extra, loc('Two Pair', 'poker_hands'), a.mult],
  'Superposition': (a) => [a.extra],
  'Ride the Bus': (a) => [a.extra, a.mult],
  'Egg': (a) => [a.extra],
  'Burglar': (a) => [a.extra],
  'Blackboard': (a) => [a.extra, loc('Spades', 'suits_plural'), loc('Clubs', 'suits_plural')],
  'Runner': (a) => [a.extra.chips, a.extra.chip_mod],
  'Ice Cream': (a) => [a.extra.chips, a.extra.chip_mod],
  'DNA': (a) => [a.extra],
  'Constellation': (a) => [a.extra, a.x_mult],
  'Hiker': (a) => [a.extra],
  'To Do List': (a) => [a.extra.dollars, loc(a.to_do_poker_hand, 'poker_hands')],
  'Astronomer': (a) => [a.extra],
  'Golden Ticket': (a) => [a.extra],
  'Acrobat': (a) => [a.extra],
  'Sock and Buskin': (a) => [a.extra + 1],
  'Swashbuckler': (a) => [a.mult],
  'Troubadour': (a) => [a.extra.h_size, -a.extra.h_plays],
  'Certificate': (a) => [a.extra],
  'Throwback': (a) => [a.extra, a.x_mult],
  'Hanging Chad': (a) => [a.extra],
  'Rough Gem': (a) => [a.extra],
  'Bloodstone': (a) => [prob(), a.extra.odds, a.extra.Xmult],
  'Arrowhead': (a) => [a.extra],
  'Onyx Agate': (a) => [a.extra],
  'Glass Joker': (a) => [a.extra, a.x_mult],
  'Flower Pot': (a) => [a.extra],
  'Wee Joker': (a) => [a.extra.chips, a.extra.chip_mod],
  'Merry Andy': (a) => [a.d_size, a.h_size],
  'The Idol': (a) => withColours([a.extra, loc(G.GAME.current_round.idol_card.rank, 'ranks'), loc(G.GAME.current_round.idol_card.suit, 'suits_plural')], [G.GAME.current_round.idol_card.suit]),
  'Seeing Double': (a) => [a.extra],
  'Matador': (a) => [a.extra],
  'Hit the Road': (a) => [a.extra, a.x_mult],
  'Cavendish': (a) => [a.extra.Xmult, prob(), a.extra.odds],
  'Card Sharp': (a) => [a.extra.Xmult],
  'Red Card': (a) => [a.extra, a.mult],
  'Madness': (a) => [a.extra, a.x_mult],
  'Square Joker': (a) => [a.extra.chips, a.extra.chip_mod],
  'Seance': (a) => [loc(a.extra.poker_hand, 'poker_hands')],
  'Riff-raff': (a) => [a.extra],
  'Vampire': (a) => [a.extra, a.x_mult],
  'Hologram': (a) => [a.extra, a.x_mult],
  'Vagabond': (a) => [a.extra],
  'Baron': (a) => [a.extra],
  'Cloud 9': (a) => [a.extra, a.extra * (a.nine_tally || 0)],
  'Rocket': (a) => [a.extra.dollars, a.extra.increase],
  'Obelisk': (a) => [a.extra, a.x_mult],
  'Photograph': (a) => [a.extra],
  'Gift Card': (a) => [a.extra],
  'Turtle Bean': (a) => [a.extra.h_size, a.extra.h_mod],
  'Erosion': (a) => [a.extra, Math.max(0, a.extra * (G.playing_cards ? (G.GAME.starting_deck_size - G.playing_cards.length) : 0)), G.GAME.starting_deck_size],
  'Reserved Parking': (a) => [a.extra.dollars, prob(), a.extra.odds],
  'Mail-In Rebate': (a) => [a.extra, loc(G.GAME.current_round.mail_card.rank, 'ranks')],
  'To the Moon': (a) => [a.extra],
  'Hallucination': (a) => [G.GAME.probabilities.normal, a.extra],
  'Lucky Cat': (a) => [a.extra, a.x_mult],
  'Baseball Card': (a) => [a.extra],
  'Bull': (a) => [a.extra, a.extra * Math.max(0, G.GAME.dollars) || 0],
  'Diet Cola': () => [name_text('Tag', 'tag_double')],
  'Trading Card': (a) => [a.extra],
  'Flash Card': (a) => [a.extra, a.mult],
  'Popcorn': (a) => [a.mult, a.extra],
  'Ramen': (a) => [a.x_mult, a.extra],
  'Ancient Joker': (a) => withColours([a.extra, loc(G.GAME.current_round.ancient_card.suit, 'suits_singular')], [G.GAME.current_round.ancient_card.suit]),
  'Walkie Talkie': (a) => [a.extra.chips, a.extra.mult],
  'Seltzer': (a) => [a.extra],
  'Castle': (a) => withColours([a.extra.chip_mod, loc(G.GAME.current_round.castle_card.suit, 'suits_singular'), a.extra.chips], [G.GAME.current_round.castle_card.suit]),
  'Smiley Face': (a) => [a.extra],
  'Campfire': (a) => [a.extra, a.x_mult],
  'Stuntman': (a) => [a.extra.chip_mod, a.extra.h_size],
  'Invisible Joker': (a) => [a.extra, a.invis_rounds],
  'Satellite': (a) => {
    let planets_used = 0;
    for (const v of Object.values(G.GAME.consumeable_usage)) if (v.set === 'Planet') planets_used++;
    return [a.extra, planets_used * a.extra];
  },
  'Shoot the Moon': (a) => [a.extra],
  "Driver's License": (a) => [a.extra, a.driver_tally !== undefined ? a.driver_tally : '0'],
  'Bootstraps': (a) => [a.extra.mult, a.extra.dollars, a.extra.mult * Math.floor((G.GAME.dollars + (G.GAME.dollar_buffer || 0)) / a.extra.dollars)],
  'Caino': (a) => [a.extra, a.caino_xmult],
  'Triboulet': (a) => [a.extra],
  'Yorick': (a) => [a.extra.xmult, a.extra.discards, a.yorick_discards, a.x_mult],
  'Perkeo': (a) => [a.extra],
};
for (const n of ['Jolly Joker', 'Zany Joker', 'Mad Joker', 'Crazy Joker', 'Droll Joker']) J[n] = (a) => [a.t_mult, loc(a.type, 'poker_hands')];
for (const n of ['Sly Joker', 'Wily Joker', 'Clever Joker', 'Devious Joker', 'Crafty Joker']) J[n] = (a) => [a.t_chips, loc(a.type, 'poker_hands')];
for (const n of ['Greedy Joker', 'Lusty Joker', 'Wrathful Joker', 'Gluttonous Joker']) J[n] = (a) => [a.extra.s_mult, loc(a.extra.suit, 'suits_singular')];
for (const n of ['The Duo', 'The Trio', 'The Family', 'The Order', 'The Tribe']) J[n] = (a) => [a.x_mult, loc(a.type, 'poker_hands')];
function withColours(arr, colours) { arr.colours = colours; return arr; }

/** Card:update's blueprint_compat check (drives the main_end badge). */
function blueprint_compat(card) {
  let other_joker;
  if (card.ability.name === 'Brainstorm') other_joker = G.jokers.cards[0];
  else {
    const i = G.jokers.cards.indexOf(card);
    if (i >= 0) other_joker = G.jokers.cards[i + 1];
  }
  return (other_joker && other_joker !== card && other_joker.config.center.blueprint_compat) ? 'compatible' : 'incompatible';
}

function joker_specifics(card) {
  const a = card.ability;
  let loc_vars, main_start, main_end;
  const f = J[a.name];
  if (f) loc_vars = f(a);
  if (a.name === 'Misprint') {
    main_start = ['{C:mult}+' + a.extra.min + '-' + a.extra.max + '{} ' + loc('k_mult')];
  } else if ((a.name === 'Blueprint' || a.name === 'Brainstorm') && card.area && card.area === G.jokers) {
    const c = blueprint_compat(card);
    a.blueprint_compat = c;
    main_end = [(c === 'compatible' ? '{C:green}' : '{C:red}') + ' ' + loc('k_' + c) + ' {}'];
  } else if (a.name === 'Luchador' && G.GAME && card.area && card.area === G.jokers) {
    const disableable = G.GAME.blind && (!G.GAME.blind.disabled && G.GAME.blind.get_type() === 'Boss');
    main_end = [(disableable ? '{C:green}' : '{C:red}') + ' ' + loc(disableable ? 'k_active' : 'ph_no_boss_active') + ' {}'];
  }
  return { loc_vars, main_start, main_end };
}

// ------------------------------------------------ generate_card_ui (no UI)
/**
 * generate_card_ui(_c, nil, specific_vars, card_type, badges, hide_desc, main_start, main_end)
 * -> {name, lines, info:[{key, name, lines}], colours}
 */
function generate_card_ui(_c, specific_vars, card_type, badges, main_start, main_end, _info_only) {
  let name;
  let lines = [];
  let colours;
  const info_queue = [];
  let loc_vars = [];

  // ---- name
  if (specific_vars && (card_type === 'Default' || card_type === 'Enhanced')) {
    if (_c.name === 'Stone Card') name = name_text('Enhanced', 'm_stone');
    if (specific_vars.playing_card && _c.name !== 'Stone Card') {
      const t = desc('Other', 'playing_card');
      name = fill(t.text, [loc(specific_vars.value, 'ranks'), loc(specific_vars.suit, 'suits_plural')])[0].trim();
      colours = [specific_vars.suit];
    }
  } else if (card_type === 'Booster') {
    // set below from desc_override
  } else {
    name = name_text(_c.set, _c.key);
  }

  if (main_start) lines.push(...main_start);

  if (_c.set === 'Other') {
    lines.push(...desc_lines('Other', _c.key, specific_vars || _c.vars));
    name = name_text('Other', _c.key);
  } else if (specific_vars && specific_vars.debuffed) {
    lines.push(...desc_lines('Other', 'debuffed_' + (specific_vars.playing_card ? 'playing_card' : 'default')));
  } else if (_c.set === 'Joker') {
    const n = _c.name;
    if (n === 'Stone Joker' || n === 'Marble Joker') info_queue.push(P_CENTERS.m_stone);
    else if (n === 'Steel Joker') info_queue.push(P_CENTERS.m_steel);
    else if (n === 'Glass Joker') info_queue.push(P_CENTERS.m_glass);
    else if (n === 'Golden Ticket') info_queue.push(P_CENTERS.m_gold);
    else if (n === 'Lucky Cat') info_queue.push(P_CENTERS.m_lucky);
    else if (n === 'Midas Mask') info_queue.push(P_CENTERS.m_gold);
    else if (n === 'Invisible Joker') {
      if (G.jokers && G.jokers.cards) {
        for (const v of G.jokers.cards) {
          if (v.edition && v.edition.negative && desc('Other', 'remove_negative')) { main_end = desc_lines('Other', 'remove_negative'); break; }
        }
      }
    } else if (n === 'Diet Cola') info_queue.push({ key: 'tag_double', set: 'Tag' });
    else if (n === 'Perkeo') info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
    if (specific_vars && specific_vars.pinned) info_queue.push({ key: 'pinned_left', set: 'Other' });
    lines.push(...desc_lines('Joker', _c.key, specific_vars || []));
    if (specific_vars && specific_vars.colours) colours = specific_vars.colours;
  } else if (_c.set === 'Tag') {
    const n = _c.name;
    if (n === 'Negative Tag') info_queue.push(P_CENTERS.e_negative);
    else if (n === 'Foil Tag') info_queue.push(P_CENTERS.e_foil);
    else if (n === 'Holographic Tag') info_queue.push(P_CENTERS.e_holo);
    else if (n === 'Polychrome Tag') info_queue.push(P_CENTERS.e_polychrome);
    else if (n === 'Charm Tag') info_queue.push(P_CENTERS.p_arcana_mega_1);
    else if (n === 'Meteor Tag') info_queue.push(P_CENTERS.p_celestial_mega_1);
    else if (n === 'Ethereal Tag') info_queue.push(P_CENTERS.p_spectral_normal_1);
    else if (n === 'Standard Tag') info_queue.push(P_CENTERS.p_standard_mega_1);
    else if (n === 'Buffoon Tag') info_queue.push(P_CENTERS.p_buffoon_mega_1);
    lines.push(...desc_lines('Tag', _c.key, specific_vars || []));
  } else if (_c.set === 'Voucher') {
    const n = _c.name, cfg = _c.config;
    if (n === 'Tarot Merchant' || n === 'Tarot Tycoon' || n === 'Planet Merchant' || n === 'Planet Tycoon') loc_vars = [cfg.extra_disp];
    else if (n === 'Seed Money' || n === 'Money Tree') loc_vars = [cfg.extra / 5];
    else if (['Hone', 'Glow Up', 'Reroll Surplus', 'Reroll Glut', 'Grabber', 'Nacho Tong', 'Wasteful', 'Recyclomancy',
      'Hieroglyph', 'Petroglyph', "Director's Cut", 'Retcon', 'Paint Brush', 'Palette', 'Telescope', 'Observatory',
      'Clearance Sale', 'Liquidation'].includes(n)) loc_vars = [cfg.extra];
    lines.push(...desc_lines('Voucher', _c.key, loc_vars));
  } else if (_c.set === 'Edition') {
    loc_vars = [_c.config.extra];
    lines.push(...desc_lines('Edition', _c.key, loc_vars));
    name = name_text('Edition', _c.key);
  } else if (_c.set === 'Default' && specific_vars) {
    if (specific_vars.nominal_chips) lines.push(...desc_lines('Other', 'card_chips', [specific_vars.nominal_chips]));
    if (specific_vars.bonus_chips) lines.push(...desc_lines('Other', 'card_extra_chips', [specific_vars.bonus_chips]));
  } else if (_c.set === 'Enhanced') {
    if (specific_vars && _c.name !== 'Stone Card' && specific_vars.nominal_chips) {
      lines.push(...desc_lines('Other', 'card_chips', [specific_vars.nominal_chips]));
    }
    const e = _c.effect, cfg = _c.config;
    if (e === 'Mult Card') loc_vars = [cfg.mult];
    else if (e === 'Glass Card') loc_vars = [cfg.Xmult, G.GAME.probabilities.normal, cfg.extra];
    else if (e === 'Steel Card') loc_vars = [cfg.h_x_mult];
    else if (e === 'Stone Card') loc_vars = [(specific_vars && specific_vars.bonus_chips) || cfg.bonus];
    else if (e === 'Gold Card') loc_vars = [cfg.h_dollars];
    else if (e === 'Lucky Card') loc_vars = [G.GAME.probabilities.normal, cfg.mult, 5, cfg.p_dollars, 15];
    lines.push(...desc_lines('Enhanced', _c.key, loc_vars));
    if (_c.name !== 'Stone Card' && ((specific_vars && specific_vars.bonus_chips) || cfg.bonus)) {
      lines.push(...desc_lines('Other', 'card_extra_chips', [(specific_vars && specific_vars.bonus_chips) || cfg.bonus]));
    }
  } else if (_c.set === 'Booster') {
    const kinds = { Arcana: 'arcana', Celestial: 'celestial', Spectral: 'spectral', Standard: 'standard', Buffoon: 'buffoon' };
    const size = /^Mega /.test(_c.name) ? 'mega' : /^Jumbo /.test(_c.name) ? 'jumbo' : 'normal';
    let desc_override = 'p_arcana_normal';
    for (const [k, v] of Object.entries(kinds)) if (_c.name.includes(k)) desc_override = 'p_' + v + '_' + size;
    loc_vars = [_c.config.choose, _c.config.extra];
    // Mods may show bigger packs (Risk of Jesters' 3D / Mili-Tech Printers).
    loc_vars = reduceHook('booster_loc_vars', loc_vars, _c);
    name = name_text('Other', desc_override);
    lines.push(...desc_lines('Other', desc_override, loc_vars));
  } else if (_c.set === 'Spectral') {
    const n = _c.name;
    if (n === 'Familiar' || n === 'Grim' || n === 'Incantation') loc_vars = [_c.config.extra];
    else if (n === 'Immolate') loc_vars = [_c.config.extra.destroy, _c.config.extra.dollars];
    else if (n === 'Hex') info_queue.push(P_CENTERS.e_polychrome);
    else if (n === 'Talisman') info_queue.push({ key: 'gold_seal', set: 'Other' });
    else if (n === 'Deja Vu') info_queue.push({ key: 'red_seal', set: 'Other' });
    else if (n === 'Trance') info_queue.push({ key: 'blue_seal', set: 'Other' });
    else if (n === 'Medium') info_queue.push({ key: 'purple_seal', set: 'Other' });
    else if (n === 'Ankh') {
      if (G.jokers && G.jokers.cards) {
        for (const v of G.jokers.cards) {
          if (v.edition && v.edition.negative && desc('Other', 'remove_negative')) {
            info_queue.push(P_CENTERS.e_negative);
            main_end = desc_lines('Other', 'remove_negative');
            break;
          }
        }
      }
    } else if (n === 'Cryptid') loc_vars = [_c.config.extra];
    if (n === 'Ectoplasm') { info_queue.push(P_CENTERS.e_negative); loc_vars = [G.GAME.ecto_minus || 1]; }
    if (n === 'Aura') info_queue.push(P_CENTERS.e_foil, P_CENTERS.e_holo, P_CENTERS.e_polychrome);
    lines.push(...desc_lines('Spectral', _c.key, loc_vars));
  } else if (_c.set === 'Planet') {
    const h = G.GAME.hands[_c.config.hand_type];
    loc_vars = [h.level, loc(_c.config.hand_type, 'poker_hands'), h.l_mult, h.l_chips];
    colours = [{ hand_level: Math.min(7, h.level) }];
    lines.push(...desc_lines('Planet', _c.key, loc_vars));
  } else if (_c.set === 'Tarot') {
    const n = _c.name, cfg = _c.config;
    const enh = () => { info_queue.push(P_CENTERS[cfg.mod_conv]); return [cfg.max_highlighted, name_text('Enhanced', cfg.mod_conv)]; };
    if (n === 'The Fool') {
      const fool_c = G.GAME.last_tarot_planet ? P_CENTERS[G.GAME.last_tarot_planet] : undefined;
      const last_tarot_planet = fool_c ? name_text(fool_c.set, fool_c.key) : loc('k_none');
      const bad = !fool_c || fool_c.name === 'The Fool';
      main_end = [(bad ? '{C:red}' : '{C:green}') + ' ' + last_tarot_planet + ' {}'];
      loc_vars = [last_tarot_planet];
      if (!bad) info_queue.push(fool_c);
    } else if (['The Magician', 'The Empress', 'The Hierophant', 'The Lovers', 'The Chariot', 'Justice', 'The Devil', 'The Tower'].includes(n)) loc_vars = enh();
    else if (n === 'The High Priestess') loc_vars = [cfg.planets];
    else if (n === 'The Emperor') loc_vars = [cfg.tarots];
    else if (n === 'The Hermit') loc_vars = [cfg.extra];
    else if (n === 'The Wheel of Fortune') { loc_vars = [G.GAME.probabilities.normal, cfg.extra]; info_queue.push(P_CENTERS.e_foil, P_CENTERS.e_holo, P_CENTERS.e_polychrome); }
    else if (n === 'Strength' || n === 'The Hanged Man' || n === 'Death') loc_vars = [cfg.max_highlighted];
    else if (n === 'Temperance') {
      let _money = 0;
      if (G.jokers) for (const j of G.jokers.cards) if (j.ability.set === 'Joker') _money += j.sell_cost;
      loc_vars = [cfg.extra, Math.min(cfg.extra, _money)];
    } else if (['The Star', 'The Moon', 'The Sun', 'The World'].includes(n)) {
      loc_vars = [cfg.max_highlighted, loc(cfg.suit_conv, 'suits_plural')];
      colours = [cfg.suit_conv];
    }
    lines.push(...desc_lines('Tarot', _c.key, loc_vars));
  } else if (_c.set === 'Back') {
    lines.push(...desc_lines('Back', _c.key, specific_vars || []));
  }

  if (main_end) lines.push(...main_end);
  lines = lines.filter((l) => l !== '');

  if (badges && _c.set !== 'Edition') {
    for (const v of badges) {
      if (v === 'foil') info_queue.push(P_CENTERS.e_foil);
      if (v === 'holographic') info_queue.push(P_CENTERS.e_holo);
      if (v === 'polychrome') info_queue.push(P_CENTERS.e_polychrome);
      if (v === 'negative') info_queue.push(P_CENTERS.e_negative);
      if (v === 'negative_consumable') info_queue.push({ key: 'e_negative_consumable', set: 'Edition', config: { extra: 1 } });
      if (v === 'gold_seal' || v === 'blue_seal' || v === 'red_seal' || v === 'purple_seal' || v === 'eternal' || v === 'pinned_left') info_queue.push({ key: v, set: 'Other' });
      if (v === 'perishable') info_queue.push({ key: 'perishable', set: 'Other', vars: [G.GAME.perishable_rounds || 1, (specific_vars && specific_vars.perish_tally !== undefined) ? specific_vars.perish_tally : G.GAME.perishable_rounds] });
      if (v === 'rental') info_queue.push({ key: 'rental', set: 'Other', vars: [G.GAME.rental_rate || 1] });
    }
  }

  const info = [];
  if (!_info_only) {
    for (const v of info_queue) {
      if (!v) continue;
      if (v.set === 'Other') info.push({ key: v.key, name: name_text('Other', v.key), lines: desc_lines('Other', v.key, v.vars) });
      else if (v.set === 'Tag') info.push({ key: v.key, name: name_text('Tag', v.key), lines: desc_lines('Tag', v.key, []) });
      else if (v.set === 'Edition' && !P_CENTERS[v.key]) info.push({ key: v.key, name: name_text('Edition', v.key), lines: desc_lines('Edition', v.key, [v.config.extra]) });
      else {
        const sub = generate_card_ui(v, undefined, v.set, undefined, undefined, undefined, true);
        info.push({ key: v.key, name: sub.name, lines: sub.lines });
      }
    }
  }
  return { name, lines, info, colours };
}

// ------------------------------------------- generate_UIBox_ability_table
/** Live description of a Card (joker, consumable, voucher, booster, playing card). */
export function describe(card) {
  const out = describe0(card);
  // Mods may add badges / info to any live card (Pokermon: Tera type badge on base jokers).
  callHook('describe', card, out);
  return out;
}
function describe0(card) {
  const a = card.ability;
  const center = card.config.center;
  if (center.mod) return describe_mod(card, center);
  const card_type = a.set || 'None';
  let loc_vars, main_start, main_end;
  const playing_card = !!card.base && !!card.base.suit;

  if (card.debuff) {
    loc_vars = { debuffed: true, playing_card, value: card.base.value, suit: card.base.suit };
  } else if (card_type === 'Default' || card_type === 'Enhanced') {
    const bonus = a.bonus + (a.perma_bonus || 0);
    loc_vars = {
      playing_card, value: card.base.value, suit: card.base.suit,
      nominal_chips: card.base.nominal > 0 ? card.base.nominal : undefined,
      bonus_chips: bonus > 0 ? bonus : undefined,
    };
  } else if (a.set === 'Joker') {
    ({ loc_vars, main_start, main_end } = joker_specifics(card));
  }

  const badges = [];
  if (card.edition) {
    if (card.edition.type === 'negative' && a.consumeable) badges.push('negative_consumable');
    else badges.push(card.edition.type === 'holo' ? 'holographic' : card.edition.type);
  }
  if (card.seal) badges.push(SEAL_KEY(card.seal));
  if (a.eternal) badges.push('eternal');
  if (a.perishable) {
    if (!loc_vars) loc_vars = [];
    loc_vars.perish_tally = a.perish_tally;
    badges.push('perishable');
  }
  if (a.rental) badges.push('rental');
  if (card.pinned) badges.push('pinned_left');

  const ui = generate_card_ui(center, loc_vars, card_type, badges, main_start, main_end);

  // Badge list for the renderer: card-type (rarity for jokers) first, like Balatro.
  const out_badges = [];
  if (card.debuff) out_badges.push({ key: 'debuffed', label: (desc('Other', 'debuffed_default') || {}).name || 'Debuffed' });
  if (card_type === 'Joker') out_badges.push(badge(RARITY_KEY[center.rarity] || 'common'));
  else if (card_type !== 'Default' && card_type !== 'None') out_badges.push(set_badge(center));
  for (const b of badges) out_badges.push(badge(b === 'negative_consumable' ? 'negative' : b));
  for (const b of out_badges) if (b.key === 'perishable') b.tally = a.perish_tally;

  return {
    name: ui.name, set: card_type, key: center.key, lines: ui.lines, badges: out_badges, info: ui.info,
    colours: ui.colours || (loc_vars && loc_vars.colours) || undefined,
    sort_id: card.sort_id,
  };
}

function set_badge(center) {
  const set = center.set;
  if (set === 'Planet') {
    // Dwarf planets get their own badge in Balatro's card UI.
    if (['Pluto', 'Ceres', 'Eris', 'Planet X'].includes(center.name)) return badge('pluto_planet');
    return badge('planet');
  }
  const key = set.toLowerCase();
  const label = (MISC.labels && MISC.labels[key]) || MISC.dictionary['k_' + key] || set;
  return { key, label };
}

/** Description of a center with no live card (collection / shop preview). */
export function describeCenter(key) {
  const c = P_CENTERS[key];
  if (!c) return undefined;
  if (c.mod) return describe_mod({ ability: { ...ability_from_center(c), ...JSON.parse(JSON.stringify(c.config || {})), extra: c.config && c.config.extra !== undefined ? JSON.parse(JSON.stringify(c.config.extra)) : undefined }, area: null, config: { center: c }, fake: true }, c);
  if (c.set === 'Back') return describeBack(key);
  const card_type = c.set;
  let loc_vars;
  if (c.set === 'Joker') {
    // generate_card_ui with the center's own config (what the collection shows).
    const fake = { ability: ability_from_center(c), area: null, config: { center: c } };
    ({ loc_vars } = joker_specifics(fake));
  }
  const ui = generate_card_ui(c, loc_vars, card_type);
  const badges = [];
  if (c.set === 'Joker') badges.push(badge(RARITY_KEY[c.rarity] || 'common'));
  else if (c.set !== 'Default') badges.push(set_badge(c));
  return { name: ui.name, set: c.set, key, lines: ui.lines, badges, info: ui.info, colours: ui.colours || (loc_vars && loc_vars.colours) };
}
function ability_from_center(center) {
  const c = center.config || {};
  const a = {
    name: center.name, set: center.set, mult: c.mult || 0, t_mult: c.t_mult || 0, t_chips: c.t_chips || 0,
    x_mult: c.Xmult || 1, h_size: c.h_size || 0, d_size: c.d_size || 0, extra: c.extra !== undefined ? JSON.parse(JSON.stringify(c.extra)) : undefined,
    type: c.type || '',
  };
  if (a.name === 'Invisible Joker') a.invis_rounds = 0;
  if (a.name === 'Caino') a.caino_xmult = 1;
  if (a.name === 'Yorick') a.yorick_discards = a.extra.discards;
  if (a.name === 'Loyalty Card') a.loyalty_remaining = a.extra.every;
  if (a.name === 'To Do List') a.to_do_poker_hand = 'High Card';
  return a;
}

// ------------------------------------------------------------------ blinds
/**
 * Blind text as the blind-select screen / HUD shows it. If `blindKey` is the
 * blind currently being fought, live state is used (disabled, The Mouth's
 * locked hand, The Eye's used hands, chips after The Wall/Violet Vessel halve).
 */
export function describeBlind(blindKey) {
  const proto = P_BLINDS[blindKey];
  if (!proto) return undefined;
  const live = G.GAME && G.GAME.blind && G.GAME.blind.config && G.GAME.blind.config.blind === proto && G.GAME.blind.name ? G.GAME.blind : null;
  let vars = [loc(G.GAME.current_round.most_played_poker_hand, 'poker_hands')];
  // A mod blind's own loc_vars(self) -> {vars} (Bunco's The Tine / The Mask / The Blade).
  if (proto.mod && proto.loc_vars) { try { vars = (proto.loc_vars(proto) || {}).vars || vars; } catch (e) { /* cosmetic */ } }
  const d = desc('Blind', blindKey) || { name: proto.name, text: [] };
  let lines = fill(d.text, vars);
  if (proto.name === 'The Wheel' && lines.length) lines[0] = fmt(G.GAME.probabilities.normal) + lines[0];
  if (live && live.disabled) lines = [];
  if (live && proto.name === 'The Mouth' && live.only_hand) lines.push('[' + loc(live.only_hand, 'poker_hands') + ']');
  lines = lines.filter((l) => l !== '');
  const ante = G.GAME.round_resets.blind_ante || G.GAME.round_resets.ante;
  const chips = live ? live.chips : B.mul(B.mul(get_blind_amount(ante), proto.mult), G.GAME.starting_params.ante_scaling);
  let type = proto.blind_type || (proto.name === 'Small Blind' ? 'Small' : proto.name === 'Big Blind' ? 'Big' : 'Boss');
  let dollars = live ? live.dollars : proto.dollars;
  if (!live && G.GAME.modifiers.no_blind_reward && G.GAME.modifiers.no_blind_reward[type]) dollars = 0;
  const out = {
    name: d.name || proto.name, key: blindKey, set: 'Blind', type, lines,
    chips, chip_text: number_format(chips), mult: proto.mult, dollars,
    boss: !!proto.boss, showdown: !!(proto.boss && proto.boss.showdown), min_ante: proto.boss ? proto.boss.min : undefined,
    colour: proto.boss_colour, active: !!live, disabled: !!(live && live.disabled),
  };
  if (live && proto.name === 'The Eye' && live.hands) out.used_hands = Object.keys(live.hands).filter((k) => live.hands[k]);
  if (live && proto.name === 'The Mouth') out.only_hand = live.only_hand || undefined;
  if (proto.name === 'The Ox') out.hand = G.GAME.current_round.most_played_poker_hand;
  return out;
}

// -------------------------------------------------------------------- tags
/** Tag:get_uibox_table loc_vars. Accepts a Tag instance or a tag key. */
export function describeTag(tag) {
  if (typeof tag === 'string') tag = { key: tag, name: P_TAGS[tag].name, config: P_TAGS[tag].config, ability: { orbital_hand: '[' + loc('k_poker_hand') + ']' } };
  const n = tag.name, cfg = tag.config;
  let loc_vars = [];
  if (n === 'Investment Tag') loc_vars = [cfg.dollars];
  else if (n === 'Handy Tag') loc_vars = [cfg.dollars_per_hand, cfg.dollars_per_hand * (G.GAME.hands_played || 0)];
  else if (n === 'Garbage Tag') loc_vars = [cfg.dollars_per_discard, cfg.dollars_per_discard * (G.GAME.unused_discards || 0)];
  else if (n === 'Juggle Tag') loc_vars = [cfg.h_size];
  else if (n === 'Top-up Tag') loc_vars = [cfg.spawn_jokers];
  else if (n === 'Skip Tag') loc_vars = [cfg.skip_bonus, cfg.skip_bonus * ((G.GAME.skips || 0) + 1)];
  else if (n === 'Orbital Tag') {
    const placeholder = '[' + loc('k_poker_hand') + ']';
    loc_vars = [tag.ability.orbital_hand === placeholder ? tag.ability.orbital_hand : loc(tag.ability.orbital_hand, 'poker_hands'), cfg.levels];
  } else if (n === 'Economy Tag') loc_vars = [cfg.max];
  // A mod tag's own loc_vars(self, info_queue, tag) -> {vars} (MoreFluff's Clutch Tag: X#1# Mult).
  const mt = P_TAGS[tag.key];
  if (mt && mt.mod && mt.loc_vars) { try { loc_vars = ((mt.loc_vars(mt, [], tag) || {}).vars) || []; } catch (e) { /* cosmetic */ } }
  const ui = generate_card_ui(P_TAGS[tag.key], loc_vars, 'Tag');
  return { name: ui.name, key: tag.key, set: 'Tag', lines: ui.lines, info: ui.info, id: tag.ID };
}

// ------------------------------------------------------------------- backs
/** Back:generate_UI loc_args. */
export function describeBack(key) {
  { const mc = P_CENTERS[key]; if (mc && mc.mod) { const d = describe_mod({ ability: ability_from_center(mc), area: null, config: { center: mc }, fake: true }, mc); return { name: d.name, key, set: 'Back', lines: d.lines, mod: mc.mod }; } }
  const c = P_CENTERS[key];
  if (!c || c.set !== 'Back') return undefined;
  const cfg = c.config || {};
  const n = c.name;
  let loc_args = [];
  if (n === 'Blue Deck') loc_args = [cfg.hands];
  else if (n === 'Red Deck') loc_args = [cfg.discards];
  else if (n === 'Yellow Deck') loc_args = [cfg.dollars];
  else if (n === 'Green Deck') loc_args = [cfg.extra_hand_bonus, cfg.extra_discard_bonus];
  else if (n === 'Black Deck') loc_args = [cfg.joker_slot, -cfg.hands];
  else if (n === 'Magic Deck') loc_args = [name_text('Voucher', 'v_crystal_ball'), name_text('Tarot', 'c_fool')];
  else if (n === 'Nebula Deck') loc_args = [name_text('Voucher', 'v_telescope'), -1];
  else if (n === 'Zodiac Deck') loc_args = [name_text('Voucher', 'v_tarot_merchant'), name_text('Voucher', 'v_planet_merchant'), name_text('Voucher', 'v_overstock_norm')];
  else if (n === 'Painted Deck') loc_args = [cfg.hand_size, cfg.joker_slot];
  else if (n === 'Anaglyph Deck') loc_args = [name_text('Tag', 'tag_double')];
  else if (n === 'Plasma Deck') loc_args = [cfg.ante_scaling];
  return { name: name_text('Back', key), key, set: 'Back', lines: desc_lines('Back', key, loc_args).filter((l) => l !== '') };
}

// ---------------------------------------------------------------- mod cards
/**
 * Mod centers describe themselves: `loc_vars(center, info_queue, card)` returns
 * {vars, key?, set?, main_start?, main_end?, colours?} (Steamodded-style), text
 * comes from the mod's localization (MOD_LOC, merged at registration), and
 * `set_badges(center, card, badges)` may add badges (e.g. Pokémon types).
 */
let _info_depth = 0;
function describe_mod(card, center) {
  const info_queue = [];
  let r = {};
  try { r = (center.loc_vars && center.loc_vars(center, info_queue, card)) || {}; } catch (e) { r = {}; }
  const set = r.set || center.set;
  const key = r.key || center.key;
  const d = desc(set, key) || (center.loc_txt) || { name: center.name || key, text: [] };
  const lines = [...(r.main_start || []), ...fill(d.text, r.vars), ...(r.main_end || [])];
  const info = [];
  for (const q of info_queue) {
    const k = typeof q === 'string' ? q : q.key;
    // A center pushed without its own vars (Steamodded: G.P_CENTERS.m_mf_yucky / G.P_CENTERS.m_steel) is described
    // like the collection shows it — its own loc_vars / config fill the #n# (not just config.extra).
    if (P_CENTERS[k] && !(typeof q === 'object' && q.vars) && P_CENTERS[k].set !== 'Other' && _info_depth < 2) {
      _info_depth++;
      let sub;
      try { sub = describeCenter(k); } finally { _info_depth--; }
      if (sub) { info.push({ key: k, name: sub.name, lines: sub.lines }); continue; }
    }
    const qset = (typeof q === 'object' && q.set) || (P_CENTERS[k] ? P_CENTERS[k].set : 'Other');
    const qd = desc(qset, k) || desc('Other', k);
    if (qd) info.push({ key: k, name: qd.name, lines: fill(qd.text, (typeof q === 'object' && q.vars) || (q.config && q.config.extra) || []) });
  }
  const badges = [];
  if (center.set === 'Joker') {
    const rar = RARITIES[center.rarity];
    badges.push(rar ? { key: rar.key, label: rar.name || rar.key, colour: rar.badge_colour } : badge(RARITY_KEY[center.rarity] || 'common'));
  } else if (center.set !== 'Default') badges.push(set_badge(center));
  if (card.edition && card.edition.type) badges.push(badge(card.edition.type === 'holo' ? 'holographic' : card.edition.type));
  if (card.seal) badges.push(badge(SEAL_KEY(card.seal)));
  const a = card.ability || {};
  if (a.eternal) badges.push(badge('eternal'));
  if (a.perishable) badges.push({ ...badge('perishable'), tally: a.perish_tally });
  if (a.rental) badges.push(badge('rental'));
  if (center.set_badges) { try { center.set_badges(center, card, badges); } catch (e) { /* cosmetic */ } }
  const mod = MODS[center.mod];
  if (mod) badges.push({ key: 'mod', label: mod.name, colour: mod.badge_colour, mod: mod.id });
  return { name: d.name, set: center.set, key: center.key, lines, badges, info, colours: r.colours, sort_id: card.sort_id, mod: center.mod };
}
