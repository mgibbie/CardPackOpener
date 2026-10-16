// Pokermon 3.2.1 — its deck skins (pokesprites.lua SMODS.DeckSkin): GAME FREAK's RBY and GSC sprites for
// the face cards, arranged by Catzzadilla. Cosmetic only (micatro/js/ui/skins.js draws them; nothing here
// touches a run), so this file is plain data and loads without the mod. Each skin replaces the J / Q / K
// of one suit; a palette is one sheet of 3 cells (J, Q, K — SMODS pos_style 'collab').
const ART = ((typeof globalThis !== 'undefined' && globalThis.MICATRO_MOD_ART_BASE) || '/micatro/mods/pokermon/assets/2x') + '/DeckSkins/';
const skin = (key, suit, name, palettes) => ({ key: 'poke_' + key, mod: 'pokermon', suit, name, ranks: ['J', 'Q', 'K'], palettes });
const lchc = (file) => [{ key: 'lc', label: '', src: ART + file + '.png' }, { key: 'hc', label: 'High Contrast', src: ART + file + 'HC.png' }];

export const SKINS = [
  skin('rby_spades', 'Spades', 'RBY Sprites: Ghost Trio', lchc('Gen01RBYSpades')),
  skin('rby_clubs', 'Clubs', 'RBY Sprites: Fossil Trio', lchc('Gen01RBYClubs')),
  skin('rby_hearts', 'Hearts', 'RBY Sprites: Eeveelution Trio', lchc('Gen01RBYHearts')),
  skin('rby_diamonds', 'Diamonds', 'RBY Sprites: Dragon Trio', lchc('Gen01RBYDiamonds')),
  skin('gsc_spades', 'Spades', 'GSC Sprites: Day and Night', [
    { key: 'morninglc', label: 'Morning', src: ART + 'Gen02GSCSpadesMorning.png' },
    { key: 'eveninglc', label: 'Evening', src: ART + 'Gen02GSCSpadesEvening.png' },
    { key: 'morninghc', label: 'Morning (High Contrast)', src: ART + 'Gen02GSCSpadesMorningHC.png' },
    { key: 'eveninghc', label: 'Evening (High Contrast)', src: ART + 'Gen02GSCSpadesEveningHC.png' },
  ]),
  skin('gsc_clubs', 'Clubs', 'GSC Sprites: Mystic Mons', lchc('Gen02GSCClubs')),
  skin('gsc_hearts', 'Hearts', 'GSC Sprites: Allies of Ash', lchc('Gen02GSCHearts')),
  skin('gsc_diamonds', 'Diamonds', 'GSC Sprites: Johto Giants', lchc('Gen02GSCDiamonds')),
];
