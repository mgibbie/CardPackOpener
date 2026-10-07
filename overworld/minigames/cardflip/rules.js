// rules.js — CARD FLIP's win table (pokecrystal CardFlip_CheckWinCondition),
// import-free so node tests can load it. card = (level-1)*4 + mon.
export const MONS = ['PIKACHU', 'JIGGLYPUFF', 'POLIWAG', 'ODDISH'];
export const cardName = c => `${MONS[c & 3]} L${(c >> 2) + 1}`;

// the bet at (y, x) against the face-up card
export function payoutFor(y, x, card) {
	const mon = card & 3, lvl = card >> 2;
	if (y === 0) {
		if (x < 2) return 0;
		return x < 4 ? (card & 2 ? 0 : 6) : (card & 2 ? 6 : 0);        // .PikaJiggly / .PoliOddish
	}
	if (y === 1) return x < 2 ? 0 : (mon === x - 2 ? 12 : 0);           // .Pikachu .. .Oddish
	const level = y - 2;                                                // rows 2..7 = levels 1..6
	if (x === 0) return (card & 0x18) === ((level >> 1) << 3) ? 9 : 0;  // .OneTwo / .ThreeFour / .FiveSix
	if (x === 1) return lvl === level ? 18 : 0;                         // .One .. .Six
	return card === level * 4 + (x - 2) ? 72 : 0;                       // .CheckWin72
}

