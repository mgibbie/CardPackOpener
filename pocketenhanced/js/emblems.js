// emblems.js — emblems: goals across every Pocket Enhanced mode, earned once and kept on the account (owner's second
// improvement list, 2026-11-18, "yes to all": "Emblems and achievements … 'Win with every type', 'Complete Genetic Apex',
// 'Beat all 24 Gym Leaders', 'Reach 1400 ranked'"). Pure. Each emblem is a test over what the game already knows (`ctx`,
// built by main.js emblemCtx); an emblem met is noted in the solo progress (`emblems`, solo.js), which syncs and merges as
// a union, so one earned on any device stays earned everywhere, even where the record that earned it is not.
const TYPES8 = ['Grass', 'Fire', 'Water', 'Lightning', 'Psychic', 'Fighting', 'Darkness', 'Metal'];

/** [id, name, how it is earned, icon, test(ctx)] in the order shown. ctx: { won, onlineWon, typeWins: {type: n},
 *  soloCleared, soloTotal, gymsBeaten, gymsTotal, setsDone, unique, opened, rating } */
export const EMBLEMS = Object.freeze([
	['win1', 'First Win', 'Win a match.', '★', c => c.won >= 1],
	['win10', 'Ten Wins', 'Win 10 matches.', '★', c => c.won >= 10],
	['win50', 'Fifty Wins', 'Win 50 matches.', '★', c => c.won >= 50],
	['win100', 'Hundred Wins', 'Win 100 matches.', '★', c => c.won >= 100],
	['online1', 'Rival', 'Win a match online.', '⚔', c => c.onlineWon >= 1],
	['types', 'Every Type', 'Win with a deck of each of the 8 Energy types.', '◆', c => TYPES8.every(t => (c.typeWins[t] || 0) > 0)],
	['solo10', 'Solo Ten', 'Clear 10 solo battles.', '⚑', c => c.soloCleared >= 10],
	['solo100', 'Solo Hundred', 'Clear 100 solo battles.', '⚑', c => c.soloCleared >= 100],
	['soloall', 'Solo Master', 'Clear every solo battle.', '⚑', c => c.soloTotal > 0 && c.soloCleared >= c.soloTotal],
	['gym8', 'Badge Case', 'Beat 8 different Gym Leaders at cards.', '⬢', c => c.gymsBeaten >= 8],
	['gymall', 'Card Champion', 'Beat all 24 Gym Leaders at cards.', '⬢', c => c.gymsTotal > 0 && c.gymsBeaten >= c.gymsTotal],
	['set1', 'Set Complete', "Own every ◆ card of a set.", '✦', c => c.setsDone >= 1],
	['cards500', 'Collector', 'Own 500 different cards.', '❖', c => c.unique >= 500],
	['cards1000', 'Archivist', 'Own 1,000 different cards.', '❖', c => c.unique >= 1000],
	['packs100', 'Pack Rat', 'Open 100 packs.', '✉', c => c.opened >= 100],
	['rank1200', 'Ranked 1200', 'Reach a ranked rating of 1200.', '♛', c => (c.rating || 0) >= 1200],
	['rank1400', 'Ranked 1400', 'Reach a ranked rating of 1400.', '♛', c => (c.rating || 0) >= 1400],
].map(([id, name, how, icon, test]) => Object.freeze({ id, name, how, icon, test })));
export const emblemById = id => EMBLEMS.find(e => e.id === id) || null;

/** The emblems these numbers meet that the progress does not have yet (ids, in EMBLEMS order). */
export function newEmblems(progress, ctx) {
	const have = (progress && progress.emblems) || {};
	return EMBLEMS.filter(e => !have[e.id] && (() => { try { return !!e.test(ctx); } catch (er) { return false; } })()).map(e => e.id);
}
