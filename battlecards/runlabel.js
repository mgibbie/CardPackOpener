// runlabel.js — how a run's record is written for the player.
//
// Every run overlay used to hard-code "N wins / N losses", which reads wrong at one:
// "1 wins / 1 losses". "loss" is irregular (1 loss, 2 losses), so a naive +"s" gives
// "losss" — hence the explicit singular/plural pair.

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// "0 wins / 0 losses", "1 win / 1 loss", "12 wins / 2 losses"
export const winLossLabel = run => `${plural((run && run.wins) || 0, 'win', 'wins')} / ${plural((run && run.losses) || 0, 'loss', 'losses')}`;
