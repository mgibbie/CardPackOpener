// solo.js — Rainbow Pets on your own: a Quick Match against 1 to 3 computer painters, and the PAINTER'S PATH, eight
// matches against named painters, each a little harder (stronger computers, more Rivals, a rule from the rulebook's
// optional rules). Stars are paid for a win: a Path stage's first win pays its own amount, any later win QUICK_WIN.
// The painters are this game's own (made up here); the Pets are the sheet's.
export const QUICK_WIN = Object.freeze({ easy: 8, normal: 15 });   // (stars for a Quick Match win: each Rival's level, summed, capped)
export const QUICK_CAP = 40, PATH_REPEAT = 10;
const P = (name, cpu, pets) => Object.freeze({ name, cpu, pets: Object.freeze(pets) });
export const PATH = Object.freeze([
	{ id: 'p1', name: 'Doodle Lane', say: 'Pip paints slowly. A good place to learn.', stars: 30, foes: [P('Pip', 'easy', ['p3', 'p5', 'p8'])], opts: {} },
	{ id: 'p2', name: 'Splash Corner', say: 'Wren likes to throw. Keep an eye on painted Pets.', stars: 40, foes: [P('Wren', 'normal', ['p10', 'p14', 'p20'])], opts: {} },
	{ id: 'p3', name: 'The White Studio', say: 'White = No Color is on: white mixes away.', stars: 50, foes: [P('Ivy', 'normal', ['p4', 'p7', 'p9', 'p40'])], opts: { whiteClear: true } },
	{ id: 'p4', name: 'Two Easels', say: 'Two Rivals at once.', stars: 60, foes: [P('Pip', 'easy', ['p11', 'p13', 'p18']), P('Wren', 'normal', ['p16', 'p24', 'p25'])], opts: {} },
	{ id: 'p5', name: 'Mending Room', say: 'White Card Healing is on: a white card brings a wiped-out Pet back.', stars: 70, foes: [P('Moss', 'normal', ['p1', 'p21', 'p29', 'p41'])], opts: { whiteHeal: true } },
	{ id: 'p6', name: 'The Last Tube', say: 'Deck-Out is on: run out of cards and you lose.', stars: 80, foes: [P('Ember', 'normal', ['p26', 'p30', 'p33', 'p36'])], opts: { deckOut: true } },
	{ id: 'p7', name: 'Gallery Crowd', say: 'Three Rivals.', stars: 100, foes: [P('Ivy', 'normal', ['p12', 'p23', 'p31']), P('Moss', 'normal', ['p6', 'p22', 'p34']), P('Pip', 'easy', ['p2', 'p15', 'p38'])], opts: {} },
	{ id: 'p8', name: 'The Masterpiece', say: 'Wipe-Outs are Temporary, and three sharp Rivals.', stars: 150, foes: [P('Ember', 'normal', ['p27', 'p28', 'p37', 'p42']), P('Wren', 'normal', ['p17', 'p19', 'p32']), P('Moss', 'normal', ['p35', 'p39', 'p40'])], opts: { tempWipe: true } },
].map((s) => Object.freeze(s)));
export const stageById = (id) => PATH.find((s) => s.id === id) || null;
/** Open: the first, and each one after a cleared one. */
export const stageOpen = (id, cleared) => { const i = PATH.findIndex((s) => s.id === id); return i === 0 || (i > 0 && cleared.includes(PATH[i - 1].id)); };
/** What a win pays. */
export function winStars(mode, levels, stage, cleared) {
	if (mode === 'path' && stage) return cleared.includes(stage.id) ? PATH_REPEAT : stage.stars;
	return Math.min(QUICK_CAP, levels.reduce((a, l) => a + (QUICK_WIN[l] || 0), 0));
}
export const COMPUTER_NAMES = Object.freeze(['Pip', 'Wren', 'Ivy', 'Moss', 'Ember', 'Juniper', 'Basil']);
