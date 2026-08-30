// gen_trainer_movesets.mjs — give the game's BOSS fights their authentic
// movesets and held items.
//
// Every roster in overworld/data/trainers.json carries species + level only, so
// each trainer mon fought with buildMon's stand-in moveset (its last four
// level-up moves) and no item — Whitney's Miltank without Rollout, Blue's
// Blastoise without its coverage. The three decomps all ship real per-mon move
// and item data; this joins them onto the rosters by trainer NAME, matching
// party slots by species so a mismatched roster can't be corrupted.
//
// Scope: boss-class rosters (gym leaders, Elite Four, champions, rivals, the
// villain leadership) — the fights players remember. Field trainers keep their
// level-up movesets.
//
//   node tools/gen_trainer_movesets.mjs      (repo root; deploy owdata after)
import fs from 'fs';
import path from 'path';

const REF = path.resolve('../Magepunk66/Reference');
const OUT = 'overworld/data/trainers.json';
const BOSS = new Set(['Gym Leader', 'Elite Four', 'Champion', 'Rival', 'Aqua Leader',
	'Magma Leader', 'Aqua Admin', 'Magma Admin', 'TRAINER_CLASS_BOSS',
	'TRAINER_CLASS_RIVAL_EARLY', 'TRAINER_CLASS_RIVAL_LATE']);

const id = (sym, prefix) => String(sym || '').replace(new RegExp('^' + prefix), '').toLowerCase().replace(/[^a-z0-9]/g, '');
const moveId = m => id(m, 'MOVE_');
const specId = s => id(s, 'SPECIES_');
const itemId = i => id(i, 'ITEM_');

// name -> ALL of that trainer's parties. Rivals and villain admins ship a dozen
// variants each (one per starter choice and story stage), so the join picks the
// variant that best matches the roster's species rather than the first one.
// Keys strip punctuation so "Tate & Liza" meets "TATE&LIZA".
const byName = new Map();
const nameKey = n => String(n || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const add = (name, party) => {
	const k = nameKey(name);
	if (!k || !party?.length) return;
	if (!byName.has(k)) byName.set(k, []);
	byName.get(k).push(party);
};

// ---------- pokeemerald / pokefirered: trainers.h -> trainer_parties.h ----------
for (const repo of ['pokeemerald', 'pokefirered']) {
	const dir = path.join(REF, repo, 'src/data');
	const partiesFile = path.join(dir, 'trainer_parties.h');
	const trainersFile = path.join(dir, 'trainers.h');
	if (!fs.existsSync(partiesFile) || !fs.existsSync(trainersFile)) continue;
	// 1. every sParty_X block -> its mons
	const parties = new Map();
	const psrc = fs.readFileSync(partiesFile, 'utf8').replace(/\r/g, '');
	const blockRe = /static const struct \w+ (sParty_\w+)\[\] = \{([\s\S]*?)\n\};/g;
	let bm;
	while ((bm = blockRe.exec(psrc))) {
		const mons = [];
		for (const monBody of bm[2].split(/\},\s*\{/)) {
			const sp = /\.species\s*=\s*(SPECIES_\w+)/.exec(monBody);
			if (!sp) continue;
			const lvl = /\.lvl\s*=\s*(\d+)/.exec(monBody);
			const item = /\.heldItem\s*=\s*(ITEM_\w+)/.exec(monBody);
			const mv = /\.moves\s*=\s*\{([^}]*)\}/.exec(monBody);
			mons.push({
				species: specId(sp[1]),
				lvl: lvl ? +lvl[1] : 0,
				item: item && item[1] !== 'ITEM_NONE' ? itemId(item[1]) : null,
				moves: mv ? mv[1].split(',').map(s => s.trim()).filter(m => m && m !== 'MOVE_NONE').map(moveId) : [],
			});
		}
		if (mons.length) parties.set(bm[1], mons);
	}
	// 2. trainerName -> party label
	const tsrc = fs.readFileSync(trainersFile, 'utf8').replace(/\r/g, '');
	const entryRe = /\.trainerName = _\("([^"]+)"\)[\s\S]*?\.party = [A-Z_]*\(?(sParty_\w+)\)?/g;
	let em;
	while ((em = entryRe.exec(tsrc))) {
		const mons = parties.get(em[2]);
		// skip the RS placeholder parties FireRed ships (a lone level-5 Ekans)
		if (mons && !(mons.length === 1 && mons[0].species === 'ekans' && mons[0].lvl === 5)) add(em[1], mons);
	}
}

// ---------- pokecrystal: data/trainers/parties.asm ----------
{
	const f = path.join(REF, 'pokecrystal/data/trainers/parties.asm');
	if (fs.existsSync(f)) {
		const lines = fs.readFileSync(f, 'utf8').replace(/\r/g, '').split('\n');
		let name = null, type = '', mons = [];
		const flush = () => { if (name) add(name, mons); name = null; mons = []; };
		for (const raw of lines) {
			const l = raw.trim();
			const head = /^db\s+"([^"@]+)@?",\s*(TRAINERTYPE_\w+)/.exec(l);
			if (head) { flush(); name = head[1]; type = head[2]; continue; }
			if (/^db\s+-1/.test(l)) { flush(); continue; }
			if (!name) continue;
			const m = /^db\s+(\d+),\s*([A-Z0-9_]+)(?:,\s*(.*))?$/.exec(l);
			if (!m) continue;
			const rest = (m[3] || '').split(',').map(s => s.trim()).filter(Boolean);
			let item = null, moves = [];
			if (type === 'TRAINERTYPE_ITEM') item = rest[0];
			else if (type === 'TRAINERTYPE_MOVES') moves = rest;
			else if (type === 'TRAINERTYPE_ITEM_MOVES') { item = rest[0]; moves = rest.slice(1); }
			mons.push({
				species: specId(m[2]),
				lvl: +m[1],
				item: item && item !== 'NO_ITEM' ? itemId(item) : null,
				moves: moves.filter(x => x && x !== 'NO_MOVE').map(moveId),
			});
		}
		flush();
	}
}

// ---------- join onto the rosters ----------
const data = JSON.parse(fs.readFileSync(OUT, 'utf8'));
const MOVES = JSON.parse(fs.readFileSync('overworld/data/moves_battle.json', 'utf8'));
const BAG = fs.readFileSync('overworld/bag.js', 'utf8');
const knownItem = i => new RegExp('\\b' + i + ':').test(BAG);

let touched = 0, monsMoved = 0, monsItemed = 0, unmatched = [];
for (const [key, r] of Object.entries(data.rosters || {})) {
	if (!BOSS.has(r.class) || !r.party?.length) continue;
	const variants = byName.get(nameKey(r.name));
	if (!variants) { unmatched.push(r.name || key); continue; }
	// pick the variant that shares the most species with this roster (ties go to
	// the closer party size, then the closer level) — that's the same fight
	const score = v => {
		const pool = v.map(m => m.species);
		const shared = r.party.filter(p => pool.includes(p.s)).length;
		return shared * 100 - Math.abs(v.length - r.party.length) * 5
			- Math.min(50, Math.abs((v[0]?.lvl || 0) - (r.party[0]?.l || 0)));
	};
	const src = variants.slice().sort((a, b) => score(b) - score(a))[0];
	if (!src || !r.party.some(p => src.some(s => s.species === p.s))) { unmatched.push(r.name || key); continue; }
	let hit = false;
	for (const slot of r.party) {
		const cand = src.find(s => s.species === slot.s) || null;
		if (!cand) continue;
		const mv = (cand.moves || []).filter(m => MOVES[m]);
		if (mv.length) { slot.moves = mv; monsMoved++; hit = true; }
		if (cand.item && knownItem(cand.item)) { slot.item = cand.item; monsItemed++; hit = true; }
	}
	if (hit) touched++;
}
fs.writeFileSync(OUT, JSON.stringify(data));
console.log(`decomp parties indexed: ${byName.size}`);
console.log(`boss rosters enriched:  ${touched}`);
console.log(`  mons given real moves: ${monsMoved}`);
console.log(`  mons given held items: ${monsItemed}`);
console.log(`unmatched boss names (${unmatched.length}): ${[...new Set(unmatched)].slice(0, 12).join(', ')}`);
console.log('Deploy owdata (--branch=main).');
