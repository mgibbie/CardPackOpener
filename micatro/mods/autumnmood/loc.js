// AutumnMoodMechanics — its English text (amm.lua process_loc_text, api/Oddity.lua loc_txt, api/Graveyard.lua,
// api/Bottle.lua, api/Petting.lua), unchanged. {C:...} markup and #n# placeholders are filled by describe().
const normalPack = { name: 'Oddity Pack', text: ['Choose {C:attention}#1#{} of up to', '{C:attention}#2#{C:oddity} Oddities{} to add', 'to your consumables'] };
const jumboPack = { name: 'Jumbo Oddity Pack', text: normalPack.text };
const megaPack = { name: 'Mega Oddity Pack', text: normalPack.text };
const Booster = {};
for (const k of ['oddity_normal_1', 'oddity_normal_2', 'oddity_normal_3', 'oddity_normal_4']) Booster['p_amm_' + k] = normalPack;
for (const k of ['oddity_jumbo_1', 'oddity_jumbo_2']) Booster['p_amm_' + k] = jumboPack;
for (const k of ['oddity_mega_1', 'oddity_mega_2']) Booster['p_amm_' + k] = megaPack;

export default {
  descriptions: {
    Booster,
    Tag: {
      tag_amm_oddity: { name: 'Oddity Tag', text: ['Gives a free', '{C:oddity}Mega Oddity Pack'] },
      tag_amm_heirloom: { name: 'Heirloom Tag', text: ['Create a', '{C:legendary,E:1}Legendary{} {C:oddity}Oddity{}', '{C:inactive}(Must have room)'] },
    },
    Other: {
      card_amm_suit_bonus: { text: ['{s:0.8,C:inactive}({s:0.8,V:2}#4# {s:0.8,V:1}lvl.#1#{s:0.8,C:inactive}) {s:0.8,C:white,X:chips}+#2#{s:0.4} {s:0.8}X{s:0.4} {C:white,X:mult,s:0.8}+#3#{s:0.8}'] },
      card_extra_u_chips: { text: ['{C:chips}#1#{} chips when unscoring'] },
      card_extra_u_mult: { text: ['{C:mult}#1#{} Mult when unscoring'] },
      card_u_x_chips: { text: ['{C:white,X:chips}X#1#{} chips when unscoring'] },
      card_u_x_mult: { text: ['{C:white,X:mult}X#1#{} Mult when unscoring'] },
      graveyard: { name: 'Graveyard', text: ['Each {C:attention}destroyed{} playing card', 'is put into your {C:attention}graveyard{}', '{C:inactive}(Viewable from deck)'] },
      bottle: { name: 'Bottled', text: ['This card will', 'always be on top', 'after shuffling'] },
      petting: {
        name: 'Petting',
        text: ['To {C:green}pet{} a card, rotate your', 'cursor over it in a circular motion', 'Some effects {C:attention}may{} differ if a card',
          'is {C:green}pet{C:attention} clockwise{} or {C:attention}counter-', '{C:attention}-clockwise{}, or may factor in {C:attention}speed{}', '{s:0.15} ',
          '{C:inactive}Oh yeah we got dexterity', '{C:inactive}challenges in Balatro'],
      },
      undiscovered_oddity: { name: 'Not Discovered', text: ['Purchase or use', 'this oddity in an', 'unseeded run to', 'learn what it does'] },
    },
  },
  misc: {
    labels: { bottle: 'Bottled', oddity: 'Oddity' },
    dictionary: {
      k_oddity: 'Oddity', b_oddity_cards: 'Oddities',
      b_suits: 'Suits', b_stamps: 'Stamps', b_aspects: 'Aspects', b_graveyard: 'Graveyard', k_empty_graveyard: 'Graveyard is empty!',
      k_amm_oddity_pack: 'Oddity Pack', k_plus_oddity: '+1 Oddity',
      cq_face: 'face', Cq_face: 'Face', cq_nonface: 'non-face', Cq_nonface: 'Non-Face', cq_numbered: 'numbered', Cq_numbered: 'Numbered',
      cq_odd: 'odd', Cq_odd: 'Odd', cq_even: 'even', Cq_even: 'Even', cq_prime: 'prime', Cq_prime: 'Prime',
      cq_suitless: 'suitless', Cq_suitless: 'Suitless', cq_rankless: 'rankless', Cq_rankless: 'Rankless',
      cq_unenhanced: 'unenhanced', Cq_unenhanced: 'Unenhanced', cq_enhanced: 'enhanced', Cq_enhanced: 'Enhanced',
      cq_rock: 'rock-enhanced', Cq_rock: 'Rock-Enhanced', cq_metal: 'metal-enhanced', Cq_metal: 'Metal-Enhanced',
      cq_materialenh: 'material-enhanced', Cq_materialenh: 'Material-Enhanced', cq_nonmaterialenh: 'nonmaterial-enhanced', Cq_nonmaterialenh: 'Nonmaterial-Enhanced',
      cq_unsealed: 'unsealed', Cq_unsealed: 'Unsealed', cq_sealed: 'sealed', Cq_sealed: 'Sealed',
      cq_baseedition: 'base edition', Cq_baseedition: 'Base Edition', cq_editioned: 'editioned', Cq_editioned: 'Editioned',
      cq_hexed: 'hexed', Cq_hexed: 'Hexed', cq_unhexed: 'unhexed', Cq_unhexed: 'Unhexed', cq_clipped: 'paperclipped', Cq_clipped: 'Paperclipped',
      cq_unclipped: 'unclipped', Cq_unclipped: 'Unclipped', cq_cursed: 'cursed', Cq_cursed: 'Cursed', cq_uncursed: 'uncursed', Cq_uncursed: 'Uncursed',
      cq_vowel: 'vowel', Cq_vowel: 'Vowel', cq_consonant: 'consonant', Cq_consonant: 'Consonant', cq_ccd: 'CCD', Cq_ccd: 'CCD',
      cq_temporary: 'temporary', Cq_temporary: 'Temporary',
      ml_stamp_explanation: ['Jokers may each have one', 'Edition and Stamp'],
    },
    v_dictionary: {
      a_blind: 'Blind +#1#', a_blind_percent: 'Blind +#1#%', a_blind_minus: 'Blind -#1#', a_blind_minus_percent: 'Blind -#1#%',
      a_amm_plusmult: '+#1# +Mult', a_amm_plusmult_minus: '-#1# +Mult', a_amm_xplusmult: 'X#1# +Mult', a_amm_xplusmult_minus: 'X#1# +Mult',
      a_plus_oddity: '+#1# Oddity',
    },
  },
};
