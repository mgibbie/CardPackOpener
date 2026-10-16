// Reverie's English localization (localizations.lua, the first table), keyed for Micatro's prefixed
// content (c_ive_no_shape -> c_rev_ive_no_shape, ...). The Cine / quest texts are the mod's; the
// Booster pack texts sit under 'Other' like the Lua's desc_override keys.
export const LOC = {
  descriptions: {
    Cine: {
      c_rev_ive_no_shape_quest: { name: 'Exchange Coupon', text: ["Converts to {C:cine}I Sing, I've No Shape", 'after scoring more than {C:attention}X#1#{} of', 'required Chips in {C:attention}#2# Blinds', '{C:inactive}(Currently {C:attention}#3#{C:inactive}/#2#)'] },
      c_rev_ive_no_shape: { name: "I Sing, I've No Shape", text: ['During this shop,', 'only owned {C:attention}Jokers{} appear', '{C:red}+$#1#{} reroll cost'] },
      c_rev_unseen_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}The Unseen{}', 'after having {C:attention}#1#{} empty', '{C:attention}Joker{} slot for {C:attention}#2#{} rounds', '{C:inactive}(Currently {C:attention}#3#{C:inactive}/#2#)'] },
      c_rev_unseen: { name: 'The Unseen', text: ['During this shop,', 'all {C:attention}Jokers{} and {C:attention}consumables', 'become {C:dark_edition}Negative', '{C:red}X#1#{} reroll cost', '{s:0.8}Rerolls cards'] },
      c_rev_gem_heist_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Gem Heist{}', 'after selling', '{C:attention}#1# Editioned Jokers{}', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_gem_heist: { name: 'Gem Heist', text: ['During this shop,', 'all cards become', '{C:dark_edition}Polychrome{} and {C:attention}25%{} off', '{s:0.8}Rerolls cards'] },
      c_rev_crazy_lucky_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Crazy Lucky{}', 'after opening {C:attention}#1# Booster Packs', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_crazy_lucky: { name: 'Crazy Lucky', text: ['During this shop,', 'everything becomes {C:attention}Pack', '{s:0.8}Rerolls {s:0.8,C:attention}Booster Packs'] },
      c_rev_tag_or_die_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Tag or Die{}', 'after skipping {C:attention}#1# Blinds', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_tag_or_die: { name: 'Tag or Die', text: ['During this shop,', 'only {C:attention}Tags{} that', 'cost {C:money}$#1#{} appear', '{s:0.8}Rerolls {s:0.8,C:attention}Booster Packs'] },
      c_rev_let_it_moon_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Let It Moon{}', 'after using {C:attention}#1# {C:planet}Planet', 'or {C:tarot}Tarot{} cards', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_let_it_moon: { name: 'Let It Moon', text: ['During this shop,', 'only {C:planet}Planet{} and', '{C:tarot}Tarot{} cards appear', '{s:0.8}Rerolls {s:0.8,C:attention}Booster Packs'] },
      c_rev_poker_face_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Poker Face{}', 'after enhancing {C:attention}#1#', '{C:attention}Playing cards', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_poker_face: { name: 'Poker Face', text: ['During this shop,', 'only {C:attention}Playing cards', 'from your deck appear', '{s:0.8}Rerolls {s:0.8,C:attention}Booster Packs'] },
      c_rev_eerie_inn_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Eerie Inn{}', 'after destroying {C:attention}#1#{} cards', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_eerie_inn: { name: 'Eerie Inn', text: ['During this shop,', 'only {C:spectral}Spectral Packs', 'appear', '{C:red}X#1#{} reroll cost', '{s:0.8}Rerolls {s:0.8,C:attention}Booster Packs'] },
      c_rev_adrifting_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Adrifting{}', 'after playing {C:attention}#1# debuffed{}', 'or {C:attention}faced down{} cards', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_adrifting: { name: 'Adrifting', text: ['During this shop,', 'everything is {C:attention}faced', '{C:attention}down{} and costs {C:money}$#1#', '{s:0.8}Rerolls cards and {s:0.8,C:attention}Booster Packs'] },
      c_rev_morsel_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Morsel{}', 'after getting {C:attention}#1#', '{C:attention}Food Jokers{}', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_morsel: { name: 'Morsel', text: ['During this shop,', 'only {C:attention}Food Jokers', 'with {C:attention}doubled{} ability', 'values appear', '{s:0.8}Rerolls {s:0.8,C:attention}Booster Packs'] },
      c_rev_every_hue_quest: { name: 'Exchange Coupon', text: ['Converts to {C:cine}Every Hue', 'after using {C:attention}#1# {C:colourcard}Colour{} cards', '{C:inactive}(Currently {C:attention}#2#{C:inactive}/#1#)'] },
      c_rev_every_hue: { name: 'Every Hue', text: ['During this shop,', 'only {C:colourcard}Colour{} cards that', 'already have {C:attention}#1# rounds{}', 'appear', '{s:0.8}Rerolls {s:0.8,C:attention}Booster Packs'] },
    },
    Joker: {
      j_rev_dynamic_film: { name: 'Dynamic Film', text: ['This Joker gains {C:chips}+#2#{} Chips', 'every time an {C:cine}Exchange Coupon', 'progresses', '{C:inactive}(Currently +{C:chips}#1#{C:inactive} Chips)'] },
    },
    Back: {
      b_rev_filmstrip: { name: 'Filmstrip Deck', text: ['{C:cine}Cine{} cards can stack', '{C:attention}+#1#{} Cine slot'] },
      b_rev_stamp: { name: 'Stamp Deck', text: ['Skipping {C:attention}Blind{} gives', '{C:attention,T:p_rev_tag_jumbo_1}#1#{} instead'] },
    },
    Tag: {
      tag_rev_cine: { name: 'Stub Tag', text: ['Gives a free', '{C:cine}Film Pack'] },
      tag_rev_mega_tag: { name: 'Stamp Tag', text: ['Gives a free', '{C:attention}Jumbo Tag Pack'] },
    },
    Spectral: {
      c_rev_reverie: { name: 'Reverie', text: ['Applies every', '{C:cine,E:1}Cine cards', 'to this shop'] },
    },
    Voucher: {
      v_rev_script: { name: 'Script', text: ['{C:attention}+#1#{} card slot', 'available in shop', 'while {C:cine}Cine{} card is', 'active'] },
      v_rev_megaphone: { name: 'Megaphone', text: ['Requirements of', '{C:cine}Exchange Coupons{} are', 'halved'] },
    },
    Edition: {
      e_negative_cine: { name: 'Negative', text: ['{C:dark_edition}+#1#{} Cine slot'] },
    },
    Other: {
      p_tag_normal: { name: 'Tag Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2# Tags'] },
      p_tag_jumbo: { name: 'Jumbo Tag Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2# Tags'] },
      p_tag_mega: { name: 'Mega Tag Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2# Tags'] },
      p_crazy_lucky: { name: 'Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2# {C:attention,E:1}anything{} to add', 'to your possession'] },
      p_film_normal: { name: 'Film Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2#{} {C:cine}Exchange Coupon{} cards', 'to add to your possession'] },
      p_film_jumbo: { name: 'Jumbo Film Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2# {C:cine}Exchange Coupon{} cards', 'to add to your possession'] },
      p_film_mega: { name: 'Mega Film Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2# {C:cine}Cine{} cards to add', 'to your possession'] },
      morseled: { name: 'Morsel', text: ['Ability is {C:attention}doubled'] },
    },
  },
  misc: {
    dictionary: { k_cine: 'Cine', k_tag: 'Tag', k_tag_pack: 'Tag Pack', k_crazy_pack: 'Pack', k_film_pack: 'Film Pack', b_cine_cards: 'Cine Cards' },
    labels: { cine: 'Cine' },
  },
};

/** "Morsel" alternative lines (a '.' keeps the base line): Joker key -> lines by index. */
export const MORSEL_ALT = {
  j_diet_cola: ['.', 'create two free'],
  j_mf_tonersoup: ['Create two {C:tarot}Tarot{} cards'],
};
