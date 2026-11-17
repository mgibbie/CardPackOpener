// artconfig.js — where a card's picture comes from.
//
// By default every card draws the site's own art (a Pokémon's sprite, a Trainer's sprite or item icon) on a
// background painted in code. To use your own pictures instead, put one image per card in a folder and name the
// folder here: a card looks for `<base><card id>.<ext>` (for example `/pocketenhanced/art/A1-036.webp`) and shows
// it in its art window; a card with no picture there keeps the default art. See pocketenhanced/art/README.md.
//
//   base: ''                      -> off (the default): no picture is requested at all
//   base: '/pocketenhanced/art/'  -> pictures committed to this site, in pocketenhanced/art/
//   base: 'https://…/'            -> pictures on a host of your own
export const CARD_ART = Object.freeze({ base: '', ext: 'webp' });

/** The folder in use: the setting above, or one a page set before the game loaded (window.POCKET_ART = { base, ext }: for trying a folder out). */
export function cardArt() {
	const w = typeof window !== 'undefined' && window.POCKET_ART && typeof window.POCKET_ART.base === 'string' ? window.POCKET_ART : null, c = w || CARD_ART;
	const base = String(c.base || ''), ext = /^[a-z0-9]{2,5}$/.test(String(c.ext || '')) ? String(c.ext) : 'webp';
	return base ? { base: base.endsWith('/') ? base : base + '/', ext } : null;
}

/** The Trainers drawn as a person: the overworld's walking sheet (/overworld/data/people/<file>.png) and how many 16x32
 *  frames it holds side by side. The card shows the first frame (facing us), so the frame count must be the sheet's own:
 *  most sheets are 3 frames, two are 9 (a test checks each against its file). */
export const PEOPLE = Object.freeze({ Erika: ['erika', 3], Misty: ['misty', 3], Blaine: ['blaine', 3], Koga: ['koga', 3], Giovanni: ['giovanni', 9], Brock: ['brock', 3], Sabrina: ['sabrina', 3], 'Lt. Surge': ['lt_surge', 3], "Professor's Research": ['prof_oak', 9] });

/** The Trainers drawn as an item: the card's name -> its icon in /overworld/item_icons/<file>.png. Every Item, Tool and
 *  Fossil card that the site has an icon for is listed (a test checks both ways: each file exists, and no card whose
 *  name is an icon's own is left out). */
export const ITEMS = Object.freeze({ 'Rocky Helmet': 'rocky_helmet', 'Lum Berry': 'lum_berry', Potion: 'potion', 'X Speed': 'x_speed', 'Hand Scope': 'scope_lens', 'Poké Ball': 'poke_ball', 'Helix Fossil': 'helix_fossil', 'Dome Fossil': 'dome_fossil', 'Old Amber': 'old_amber',
	Leftovers: 'leftovers', 'Sitrus Berry': 'sitrus_berry', Eviolite: 'eviolite', 'Lucky Egg': 'lucky_egg', 'Poison Barb': 'poison_barb', 'Rare Candy': 'rare_candy', 'Full Heal': 'full_heal', Repel: 'repel', 'Claw Fossil': 'claw_fossil', 'Root Fossil': 'root_fossil', 'Pokémon Flute': 'poke_flute' });
