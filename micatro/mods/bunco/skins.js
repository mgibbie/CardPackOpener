// Bunco 5.1 — its deck skins (Bunco.lua "Skins and deck resprites"): Duck Game and LISA: The Painful for
// its Fleurons, Fiend Folio and LISA: The Pointless for its Halberds (J / Q / K, SMODS pos_style 'ranks'),
// and the Recast Contrast palette for the four base suits (a whole resprited deck, pos_style 'deck':
// the 8BitDeck layout). Cosmetic only (micatro/js/ui/skins.js draws them), so this is plain data that
// loads without the mod; names from localization/default.lua (misc.collabs / collab_palettes).
const ART = '/micatro/mods/bunco/assets/2x/';
const ranks = (key, suit, name, file) => ({
  key: 'bunc_' + key, mod: 'bunco', suit, name, ranks: ['J', 'Q', 'K'],
  palettes: [{ key: 'lc', label: '', src: ART + 'Skins/' + file + 'LC.png' }, { key: 'hc', label: 'High Contrast', src: ART + 'Skins/' + file + 'HC.png' }],
});
const recast = (suit) => ({
  key: 'bunc_recast_' + suit.toLowerCase(), mod: 'bunco', suit, name: 'Recast Contrast', ranks: 'all', deck: true,
  palettes: [{ key: 'recast_contrast', label: '', src: ART + 'Resprites/EnhancedContrast.png' }],
});

export const SKINS = [
  ranks('duck_game', 'bunc_Fleurons', 'Duck Game', 'SkinDuckGame'),
  ranks('lisa_the_painful', 'bunc_Fleurons', 'LISA: The Painful', 'SkinLISAThePainful'),
  ranks('fiend_folio', 'bunc_Halberds', 'Fiend Folio', 'SkinFiendFolio'),
  ranks('lisa_the_pointless', 'bunc_Halberds', 'LISA: The Pointless', 'SkinLISAThePointless'),
  recast('Spades'), recast('Hearts'), recast('Clubs'), recast('Diamonds'),
];
