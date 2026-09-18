// runlabel.js — how a run's record is written for the player.
//
// Every run overlay used to hard-code "N wins / N losses", which reads wrong at one:
// "1 wins / 1 losses". "loss" is irregular (1 loss, 2 losses), so a naive +"s" gives
// "losss" — hence the explicit singular/plural pair.

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "0 wins / 0 losses", "1 win / 1 loss", "12 wins / 2 losses"
export const winLossLabel = run => `${plural((run && run.wins) || 0, 'win', 'wins')} / ${plural((run && run.losses) || 0, 'loss', 'losses')}`;

// who a run belongs to, across the differently-named hero fields the modes use
export const runHero = run => (run && (run.characterId || run.heroId || run.explorerId || run.classId)) || '';

// One-line record for a run, e.g. "Garruk — 1 win / 1 loss, 33 cards" or
// "warrior — floor 4". The start-page tile and the in-game Resume overlay both
// build their text from this module, so the two surfaces cannot drift apart.
export function runSummary(run) {
	if (!run) return '';
	const hero = runHero(run);
	const body = (run.wins != null || run.losses != null) ? winLossLabel(run)
		: run.level ? `floor ${run.level}` : '';
	const deck = (body && Array.isArray(run.deck) && run.deck.length) ? `, ${run.deck.length} cards` : '';
	return [hero, body].filter(Boolean).join(' — ') + deck;
}
