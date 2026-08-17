// frontier.js — the BATTLE FRONTIER (Battle Tower MVP). A champion-gated post-game
// facility: face generated trainers back-to-back; each win extends your streak and
// earns a Battle Point (BP). A loss ends the run. Pure helpers here (opponent
// generation + BP persistence); main.js drives the battle loop through the engine.
import { safeLoad, safeSave } from './safestore.js';
import { buildMon } from './battle.js';

const BP_KEY = 'magepunk_bp';
const STREAK_KEY = 'magepunk_frontier_best'; // best streak per facility

export function getBP() { return safeLoad(BP_KEY, 0) | 0; }
export function addBP(n) { safeSave(BP_KEY, Math.max(0, getBP() + (n | 0))); return getBP(); }
export function spendBP(n) { if (getBP() < n) return false; safeSave(BP_KEY, getBP() - n); return true; }

export function bestStreak() { return safeLoad(STREAK_KEY, 0) | 0; }
export function recordStreak(s) { if (s > bestStreak()) safeSave(STREAK_KEY, s | 0); }

// a legal-ish opponent pool: species buildMon can actually assemble with a moveset
let _pool = null;
function pool(data) {
	if (_pool) return _pool;
	_pool = Object.keys(data.species || {}).filter(id => {
		const m = buildMon(id, 50, data);
		return m && m.stats && (m.moves || []).length > 0;
	});
	return _pool;
}

// generate a foe party of `size` distinct mons at `level`. `pick` = () => [0,1) for
// deterministic tests; defaults to Math.random.
export function genTeam(data, level, size = 3, pick) {
	const rnd = pick || Math.random;
	const ids = pool(data);
	const team = [], used = new Set();
	let guard = 0;
	while (team.length < size && guard++ < 500 && ids.length) {
		const id = ids[Math.floor(rnd() * ids.length)];
		if (used.has(id)) continue;
		const m = buildMon(id, level, data);
		if (m) { used.add(id); team.push(m); }
	}
	return team;
}
