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
