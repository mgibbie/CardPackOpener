// matchstats.js — what happened in a match, read from its log (the end screen's "how it went").
// Pure: the log and the players in, numbers out. The engine is not asked to record anything new: an attack's line names
// the Pokémon that made it, the damage and Knock Out entries that follow are that attack's.
//
//   matchStats(log, players) -> { turns, seats: [{ seat, attacks, damage, kos, lost, evolves, plays,
//                                                  cards: [{ name, attacks, damage, kos }] best first, mvp }] }
//     attacks   attacks this player's Pokémon used
//     damage    damage those attacks did (to anyone, as the log has it)
//     kos       opposing Pokémon Knocked Out that this player took the points for (credited to the card that last
//               attacked for them that turn, if one did: a Knock Out between turns is the player's and no card's)
//     lost      this player's own Pokémon Knocked Out
//     mvp       the card that did the most: Knock Outs first, then damage, then attacks (null if it never attacked)
const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function matchStats(log, players) {
	const seats = (players || []).map((p, seat) => ({ seat, name: p.name, attacks: 0, damage: 0, kos: 0, lost: 0, evolves: 0, plays: 0, by: new Map(), last: null }));
	const card = (s, name) => { let c = s.by.get(name); if (!c) { c = { name, attacks: 0, damage: 0, kos: 0 }; s.by.set(name, c); } return c; };
	let turns = 0;
	for (const e of log || []) {
		if (e.turn > turns) turns = e.turn;
		const s = e.seat != null ? seats[e.seat] : null;
		if (e.k === 'attack' && s) {
			// "Active A: Red's Charizard ex uses Slash on ..."  ->  Charizard ex
			const m = new RegExp(esc(s.name) + "'s (.+?) uses ").exec(e.msg || '');
			s.attacks++; s.last = m ? m[1] : null;
			if (s.last) card(s, s.last).attacks++;
		} else if (e.k === 'damage' && s) {
			// an attack's damage reads "<attack> does 60 damage to ..." (recoil, thorns and the like read otherwise, and are not dealt BY this player)
			const d = / does (\d+) damage to /.exec(e.msg || ''), n = d ? +d[1] : 0;
			if (n) { s.damage += n; if (s.last) card(s, s.last).damage += n; }
		} else if (e.k === 'ko') {
			if (s) s.lost++;
			// who took the points is in the line ("... is Knocked Out! Red takes 2 points."): a player's view of the log keeps the words, not the engine's own fields
			const m = /Knocked Out! (.+) takes \d+ points?\./.exec(e.msg || ''), t = m ? seats.find(x => x.name === m[1]) || null : e.to != null ? seats[e.to] : null;
			if (t && t !== s) { t.kos++; if (t.last) card(t, t.last).kos++; }
		} else if (e.k === 'evolve' && s) s.evolves++;
		else if (e.k === 'play' && s) s.plays++;
		else if (e.k === 'turn') { for (const x of seats) x.last = null; }   // (a new turn: an effect's damage is not last turn's attacker's)
	}
	return { turns, seats: seats.map(s => {
		const cards = [...s.by.values()].sort((a, b) => b.kos - a.kos || b.damage - a.damage || b.attacks - a.attacks || a.name.localeCompare(b.name));
		return { seat: s.seat, attacks: s.attacks, damage: s.damage, kos: s.kos, lost: s.lost, evolves: s.evolves, plays: s.plays, cards, mvp: cards.length ? cards[0] : null };
	}) };
}
