// More Fluff — the bits of the 1.5.6 port this 1.9.9999 port keeps on purpose (each named in index.js's header):
//
//  RETIRED_ART  The 11 jokers 1.9.9999 retires to its hidden "Old Fluff" rarity are drawn there with placeholder
//               sketches (assets/1x/mf_oldfluff.png); they keep their real 1.5.6 art (the 1.5.6 sheet, atlas
//               mf_jokers_156 = the old assets/2x/mf_jokers_refresh.png file, unchanged).
//  KEPT_156     Tall Joker and Triangle keep their 1.5.6 numbers, text and behaviour for now: their 1.9.9999 reworks
//               read Steamodded attributes (Tall Joker: "no other Mult / XMult Joker") and SMODS.scale_card's
//               calc_scaling (Triangle scales every other scaling joker). Both need the engine seams of the
//               `feat/micatro-pokermon-391-seams` branch (micatro/js/engine/smods.js: has_attribute / the 80
//               built-in attributes, scale_card); the reworks land with the joker batch that follows it.
//  SAPLING_ART  1.9.9999 draws Fast-Growing Sapling with a placeholder sketch (mf_jokers 7,8); 1.5.6 gave it no
//               atlas, i.e. the base game's Joker art (Jimbo, Jokers.png 0,0) — kept (the 1.5.6 port pointed it at
//               mf_jokers 0,0, the magenta "missing texture" cell that is Missing Joker's art: fixed here).
export const RETIRED = ['coupon_catalogue', 'fleshprison', 'flintandsteel', 'hallofmirrors', 'impostor', 'mashupalbum',
  'rosetinted', 'sudoku', 'tonersoup', 'virtual', 'wilddrawfour'];
export const RETIRED_ART = {
  j_mf_coupon_catalogue: { x: 2, y: 0 }, j_mf_fleshprison: { x: 5, y: 1 }, j_mf_flintandsteel: { x: 4, y: 6 },
  j_mf_hallofmirrors: { x: 1, y: 4 }, j_mf_impostor: { x: 0, y: 2 }, j_mf_mashupalbum: { x: 8, y: 2 },
  j_mf_rosetinted: { x: 3, y: 1 }, j_mf_sudoku: { x: 8, y: 7 }, j_mf_tonersoup: { x: 0, y: 4 }, j_mf_virtual: { x: 1, y: 3 },
  j_mf_wilddrawfour: { x: 9, y: 6 },
};
/** 1.5.6 data.js entries (numbers / text) for the two jokers kept at 1.5.6. */
export const KEPT_156 = {
  j_mf_talljoker: {
    data: { pos: { x: 3, y: 3 }, atlas: 'mf_jokers', rarity: 2, cost: 9, config: { extra: { mult: 44 } }, blueprint_compat: true, eternal_compat: true, perishable_compat: true },
    loc: { name: 'Tall Joker', text: ['{C:mult,s:1.1}+#1#{} Mult'] },
  },
  j_mf_triangle: {
    data: { pos: { x: 9, y: 4 }, soul_pos: { x: 9, y: 5 }, atlas: 'mf_jokers', rarity: 4, cost: 20, config: { extra: { x_mult: 3 } }, blueprint_compat: true, eternal_compat: true, perishable_compat: true },
    loc: { name: 'Triangle', text: ['Played cards each give', '{X:mult,C:white} X#1# {} Mult when scored', 'if played hand is', 'a {C:attention}Three of a Kind'] },
  },
};
export const SAPLING_ART = { atlas: 'mf_vanilla_jokers', pos: { x: 0, y: 0 } };
/** Cartomancer! is an upright card turned 45 degrees in the engine (mf_rotate_by) in 1.9.9999: like the Rotarot cards
 *  (rotarots.js) it keeps the 1.5.6 pre-turned sprite of the same art (mf_rot_cartomancer, 112px). */
export const CARTOMANCER_ART = { atlas: 'mf_rot_cartomancer', pos: { x: 0, y: 0 }, display_size: { w: 112, h: 112 } };
/** 1.5.6 loc entries the port's code still shows (1.9.9999 dropped them from its localization). */
export const LOC_156 = {
  Other: {
    mf_halted: { name: 'Halted', text: ['Cannot gain any more {C:attention}Rounds{}'] },
    tetr_explainer: { name: 'Explanation', text: ['{X:dark_edition,C:white}^^n{} represents {C:attention}Tetration', 'In this case, {X:dark_edition,C:white}n^^#1#{} can be', 'calculated using {X:dark_edition,C:white}n^^#1# = n^n^#2#{}'] },
    undiscovered_colour: { name: 'Not Discovered', text: ['Purchase or use', 'this card in an', 'unseeded run to', 'learn what it does'] },
  },
  dictionary: { b_take: 'TAKE', k_searched_ex: 'Searched!', k_rotarot: 'Rotarot' },
  labels: { mf_halted: 'Halted' },
};
