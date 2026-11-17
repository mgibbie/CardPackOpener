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
export const PEOPLE = Object.freeze({ Erika: ['erika', 3], Misty: ['misty', 3], Blaine: ['blaine', 3], Koga: ['koga', 3], Giovanni: ['giovanni', 9], Brock: ['brock', 3], Sabrina: ['sabrina', 3], 'Lt. Surge': ['lt_surge', 3], "Professor's Research": ['prof_oak', 9],
	Blue: ['blue', 9], "Blue's Provocation": ['blue', 9], Red: ['red_normal', 9], Leaf: ['green_normal', 9], Lorelei: ['lorelei', 9], May: ['rs_may', 9],
	Cynthia: ['sinnoh_cynthia', 9], Cyrus: ['sinnoh_cyrus', 9], Barry: ['sinnoh_barry', 9], Fantina: ['sinnoh_fantina', 9], Looker: ['sinnoh_looker', 9], Mars: ['sinnoh_mars', 9], Volkner: ['sinnoh_volkner', 9],
	Fisher: ['fisher', 10], Hiker: ['hiker', 10], 'Parasol Lady': ['sinnoh_parasol_lady', 9], Psychic: ['sinnoh_psychic_m', 9], 'Rising Star': ['cooltrainer_m', 10],
	'Traveling Merchant': ['sinnoh_collector', 9], 'Puppy-Loving Girl': ['sinnoh_little_girl', 9], 'Celestic Town Elder': ['old_woman', 9],
	'Pokémon Center Lady': ['nurse', 4], 'Poké Mart Guy': ['clerk', 9], 'Team Galactic Grunt': ['sinnoh_galaxy_grunt_m', 9], 'Team Rocket Grunt': ['rocket_m', 9], "Team Rocket's Boss": ['giovanni', 9], "Team Rocket's Master Plan": ['rocket_f', 9], "Team Rocket's Researcher": ['scientist', 10] });

/** The Trainers drawn as an item: the card's name -> its icon in /overworld/item_icons/<file>.png. Every Item, Tool and
 *  Fossil card that the site has an icon for is listed (a test checks both ways: each file exists, and no card whose
 *  name is an icon's own is left out). */
export const ITEMS = Object.freeze({ 'Rocky Helmet': 'rocky_helmet', 'Lum Berry': 'lum_berry', Potion: 'potion', 'X Speed': 'x_speed', 'Hand Scope': 'scope_lens', 'Poké Ball': 'poke_ball', 'Helix Fossil': 'helix_fossil', 'Dome Fossil': 'dome_fossil', 'Old Amber': 'old_amber',
	Leftovers: 'leftovers', 'Sitrus Berry': 'sitrus_berry', Eviolite: 'eviolite', 'Lucky Egg': 'lucky_egg', 'Poison Barb': 'poison_barb', 'Rare Candy': 'rare_candy', 'Full Heal': 'full_heal', Repel: 'repel', 'Claw Fossil': 'claw_fossil', 'Root Fossil': 'root_fossil', 'Pokémon Flute': 'poke_flute' });
