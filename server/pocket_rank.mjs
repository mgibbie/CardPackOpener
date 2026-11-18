// pocket_rank.mjs — Pocket Enhanced's ranked ladder (owner's improvement list, 2026-11-18: "ranked or ladder play
// online ... a simple rating and a season reward in stars", "yes to all").
//
// What counts: an online match of exactly two people and no computer players, played to its end. Winner and loser
// move by Elo (K 32, everyone starts at 1000); a match with no winner (it ran too long) counts as a draw.
// A SEASON is a calendar month (UTC). At the first look in a new season the rating comes halfway back to 1000, and
// a player who played at least SEASON_MIN rated matches in the season before is paid stars by where they finished
// (SEASON_PAY), once, into the star wallet (stars:<user>, under the device name 'ranked0': the wallet's counters only
// grow, as a trade's are counted, server/trade.mjs).
//
// Rows (each written by one guarded write; every step can be run again):
//   pkrank:<user>         { rev, season, rating, games, wins, best, done: [match keys rated], paid: [seasons paid] }
//   pkrankboard:<season>  { rev, rows: [{ name, rating, games }] }  the top BOARD_SIZE of a season
// A match is rated by whoever looks first after it ends (rateMatch: each player's row notes the match's key, so it is
// rated once however often it is asked).
import * as W from '../site/stars.js';
import { profileOf, emblemOf } from './pocket_profile.mjs';

export const RANK = Object.freeze({ START: 1000, K: 32, SEASON_MIN: 5, BOARD_SIZE: 50, SHOWN: 20, DONE_KEEP: 60 });
export const SEASON_PAY = Object.freeze([[1400, 800], [1200, 400], [1000, 200], [0, 100]]);   // [from this rating, stars]
export const seasonOf = now => new Date(now).toISOString().slice(0, 7);   // 'YYYY-MM'
export const payFor = rating => (SEASON_PAY.find(([from]) => rating >= from) || [0, 0])[1];
const expected = (a, b) => 1 / (1 + 10 ** ((b - a) / 400));
/** The new ratings of two players after a match: score 1 = a won, 0 = b won, 0.5 = a draw. */
export function elo(a, b, score) { const ea = expected(a, b); return [Math.round(a + RANK.K * (score - ea)), Math.round(b + RANK.K * ((1 - score) - (1 - ea)))]; }
/** Is this lobby's finished match one that counts? -> { key, players: [name, name], score } or null. */
export function rateable(lb) {
	const m = lb && lb.m; if (!m || !m.over || lb.bots) return null;
	const humans = m.config.players.filter(p => !p.ai); if (humans.length !== 2 || m.config.players.length !== 2) return null;
	const w = m.over.winner, score = w == null ? 0.5 : w === 0 ? 1 : 0;
	return { key: lb.id + ':' + m.startAt, players: [humans[0].name, humans[1].name], score };
}
const blank = (season) => ({ rev: 0, season, rating: RANK.START, games: 0, wins: 0, best: RANK.START, done: [], paid: [] });

export function makeRank({ store, now }) {
	const season = seasonOf(now);
	/** A player's row, brought into this season (the halfway reset, and last season's stars, once). -> the row, and what was paid. */
	async function rowOf(user, write = true) {
		for (let i = 0; i < 6; i++) {
			const cur = await store.get('pkrank:' + user), r = cur ? { ...blank(season), ...cur, done: [...(cur.done || [])], paid: [...(cur.paid || [])] } : blank(season);
			if (r.season === season) return { r, paid: null };
			// a new season: last season's reward (once), then the halfway reset
			const was = r.season, pay = r.games >= RANK.SEASON_MIN && !r.paid.includes(was) ? payFor(r.rating) : 0;
			if (pay && !(await payStars(user, pay, was))) return { r, paid: null };   // (the wallet is busy: next time)
			const next = { ...r, season, rating: Math.round(RANK.START + (r.rating - RANK.START) / 2), games: 0, wins: 0, best: Math.round(RANK.START + (r.rating - RANK.START) / 2), paid: pay ? [...r.paid, was].slice(-24) : r.paid, last: { season: was, rating: r.rating, games: r.games, wins: r.wins, stars: pay } };
			if (!write) return { r: next, paid: pay ? { season: was, stars: pay } : null };
			next.rev = (cur ? cur.rev | 0 : 0) + 1;
			if (await store.setIfRev('pkrank:' + user, next, cur ? cur.rev | 0 : 0)) return { r: next, paid: pay ? { season: was, stars: pay } : null };
		}
		return { r: blank(season), paid: null };
	}
	/** Stars into the wallet, once per season (the wallet row notes it: `rk` = seasons paid). */
	async function payStars(user, n, was) {
		for (let i = 0; i < 6; i++) {
			const cur = await store.get('stars:' + user), rev = cur && Number.isInteger(cur.rev) && cur.rev > 0 ? cur.rev : 0, w = W.cleanWallet(cur), rk = [...((cur && cur.rk) || [])];
			if (rk.includes(was)) return true;
			w.e.ranked0 = (w.e.ranked0 || 0) + n;
			const keep = W.walletNotes(cur); delete keep.rk;
			if (await store.setIfRev('stars:' + user, { rev: rev + 1, e: w.e, s: w.s, at: now, ...keep, rk: [...rk, was].slice(-24) }, rev)) return true;
		}
		return false;
	}
	/** The season's board, with this player's row put in its place. */
	async function board(row, name) {
		for (let i = 0; i < 6; i++) {
			const cur = await store.get('pkrankboard:' + season), rows = ((cur && cur.rows) || []).filter(x => x.name !== name);
			rows.push({ name, rating: row.rating, games: row.games });
			rows.sort((a, b) => b.rating - a.rating || b.games - a.games || a.name.localeCompare(b.name));
			const next = { rev: (cur ? cur.rev | 0 : 0) + 1, rows: rows.slice(0, RANK.BOARD_SIZE) };
			if (await store.setIfRev('pkrankboard:' + season, next, cur ? cur.rev | 0 : 0)) return;
		}
	}
	/** Rate a finished match, once. Both rows are read for their ratings, then each is written with the match noted. */
	async function rateMatch(lb) {
		const g = rateable(lb); if (!g) return false;
		const [a, b] = g.players, ra = (await rowOf(a)).r, rb = (await rowOf(b)).r;
		if (ra.done.includes(g.key) && rb.done.includes(g.key)) return true;
		const [na, nb] = elo(ra.rating, rb.rating, g.score);
		for (const [user, to, won] of [[a, na, g.score === 1], [b, nb, g.score === 0]]) {
			for (let i = 0; i < 6; i++) {
				const cur = await store.get('pkrank:' + user); const r = cur && cur.season === season ? cur : (await rowOf(user)).r;
				if ((r.done || []).includes(g.key)) break;
				const next = { ...r, rating: to, games: (r.games | 0) + 1, wins: (r.wins | 0) + (won ? 1 : 0), best: Math.max(r.best | 0, to), done: [...(r.done || []), g.key].slice(-RANK.DONE_KEEP), rev: (r.rev | 0) + 1 };
				if (await store.setIfRev('pkrank:' + user, next, r.rev | 0)) { await board(next, user); break; }
			}
		}
		return true;
	}
	/** pkrank-get: my rating this season, the board, and anything just paid. */
	async function get(user) {
		const { r, paid } = await rowOf(user);
		const b = await store.get('pkrankboard:' + season), rows = ((b && b.rows) || []);
		const place = rows.findIndex(x => x.name === user);
		return { season, rating: r.rating, games: r.games, wins: r.wins, best: r.best, min: RANK.SEASON_MIN, payNow: r.games >= RANK.SEASON_MIN ? payFor(r.rating) : 0,
			place: place >= 0 ? place + 1 : null, last: r.last || null, paid, pay: SEASON_PAY,
			// (each shown player's emblem, from their profile: server/pocket_profile.mjs)
			board: await Promise.all(rows.slice(0, RANK.SHOWN).map(async x => ({ ...x, emblem: emblemOf(await profileOf(store, x.name)) }))) };
	}
	return { rowOf, rateMatch, get, season };
}
