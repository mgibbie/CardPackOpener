// poketactica_figcol_test.mjs — the player's FIGURINE collection (stage 5; owner, 2026-11-20): read defensively, joined
// between devices BY ID (a figurine is a unique object: growth only grows, one let go stays gone, a held one stays
// held), kept on the account by the same sync as Pocket Enhanced's collection (pocketenhanced/js/colsync.js against the
// real server handler, server/pocket_collection.mjs `ptfig`), and what a battle does to it (progress.js applyResults).
// Pure: node only.
//   node overworld/tests/poketactica_figcol_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as FC from '../../poketactica/js/figcol.js';
import * as SV from '../../poketactica/js/figsave.js';
import { makeFigurine, gainExp, gainMoveXp } from '../../poketactica/js/figurine.js';
import { applyResults } from '../../poketactica/js/progress.js';
import { createSync } from '../../pocketenhanced/js/colsync.js';
import { handlePkcol } from '../../server/pocket_collection.mjs';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json') };
let n = 0;
const fig = (sp, lv) => makeFigurine(sp, lv, makeRng(sp + lv + n), data, { id: sp + '-t' + (n++) });

// ---- read defensively
{
	const f = fig('pikachu', 30);
	const c = FC.cleanFigs({ v: 1, figs: { [f.id]: f, bad: { id: 'bad', species: '<x>' }, wrongid: { ...f, id: 'other-id' } } });
	A(c && Object.keys(c.figs).length === 1 && c.figs[f.id].species === 'pikachu', 'a collection is read defensively (a bad entry and a mismatched id are dropped)');
	A(FC.cleanFigs({ figs: {} }) === null && FC.cleanFigs(null) === null, 'something that is not a collection is refused');
	const big = FC.cleanFig({ ...f, level: 5000, pool: [...f.pool, { id: 'thunderbolt', lv: 500, xp: -4 }], equipped: ['nosuchmove', f.equipped[0]] });
	A(big.level === 999 && big.pool.every((p) => p.lv <= 99 && p.xp >= 0) && big.equipped.every((m) => big.pool.some((p) => p.id === m)), 'levels, move levels and the equipped four are kept in range');
}

// ---- the three-way join, by id
{
	const a = fig('machamp', 40), b = fig('gengar', 40), c = fig('onix', 40);
	const base = { v: 1, figs: { [a.id]: a, [b.id]: b } };
	// mine: a grew; found c.  theirs (account): b grew; a's equipped changed... no: mine changed a's equipped
	const aMine = { ...gainExp(a, 50000, data).fig };
	const mine = { v: 1, figs: { [a.id]: aMine, [b.id]: b, [c.id]: c } };
	const bTheirs = gainMoveXp(b, b.equipped[0], 9999);
	const theirs = { v: 1, figs: { [a.id]: a, [b.id]: bTheirs } };
	const m = FC.merge3Figs(base, mine, theirs);
	A(m.figs[a.id].level === aMine.level && m.figs[a.id].level > a.level, 'a figurine that grew on this device keeps its growth');
	A(m.figs[b.id].pool.find((p) => p.id === b.equipped[0]).xp >= 9999, 'move XP earned on the other device is kept too');
	A(!!m.figs[c.id], 'a figurine found on this device joins');
	// let go (traded away) on the account: it stays gone
	const theirs2 = { v: 1, figs: { [b.id]: b } };
	const m2 = FC.merge3Figs(base, { v: 1, figs: { [a.id]: a, [b.id]: b } }, theirs2);
	A(!m2.figs[a.id] && !!m2.figs[b.id], 'one let go on the account (traded away) stays gone: a device can\'t bring it back');
	const m3 = FC.merge3Figs(base, { v: 1, figs: { [b.id]: b } }, { v: 1, figs: { [a.id]: a, [b.id]: b } });
	A(!m3.figs[a.id], '... and one let go on this device stays gone too');
	// the equipped four: the side that changed them
	const aEq = { ...a, equipped: [a.pool[0].id] };
	A(JSON.stringify(FC.merge3Figs(base, { v: 1, figs: { [a.id]: aEq, [b.id]: b } }, base).figs[a.id].equipped) === JSON.stringify(aEq.equipped), 'the equipped four come from the side that changed them');
	// escrow is the account's
	const held = FC.merge3Figs(base, { ...base, escrow: { 'trade:x': { ids: ['zz'], at: 1 } } }, { ...base });
	A(!held.escrow && FC.merge3Figs(base, base, { ...base, escrow: { 'trade:x': { ids: [a.id], at: 1 } } }).escrow['trade:x'].ids[0] === a.id, 'held figurines (escrow) are the account\'s alone');
	A(FC.merge3Figs(null, { v: 1, figs: {}, starters: true }, { v: 1, figs: {} }).starters === true, 'having picked the starters is kept');
	A(FC.sameFigs(m, JSON.parse(JSON.stringify(m))) && !FC.sameFigs(m, base), 'sameFigs');
}

// ---- the account: the real server handler, pretend devices
{
	const rows = new Map();
	const store = { get: async (k) => (rows.has(k) ? JSON.parse(rows.get(k)) : null), setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; } };
	const server = (username, action, body = {}) => handlePkcol({ action, body, store, username, json: (o, status) => ({ ...o, status: status || 200 }), now: 1 });
	A((await server(null, 'ptfig-get')).status === 401, 'the figurines on the account need an account');
	A((await server('ann', 'ptfig-put', { figs: { nope: 1 }, rev: 0 })).status === 400, 'something that is not a collection is refused');
	const device = (user) => { const mem = new Map(), d = { col: FC.newFigs(), user }; d.storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
		d.sync = createSync({ kind: FC.FIGS, storage: d.storage, delay: 0, user: () => d.user, getLocal: () => d.col, setLocal: (c) => { d.col = c; }, call: async (a, b) => server(d.user, a, JSON.parse(JSON.stringify(b))) }); return d; };
	const d1 = device('ann'), d2 = device('ann');
	const f1 = fig('pikachu', 20), f2 = fig('eevee', 20);
	d1.col = FC.addFig(d1.col, f1); await d1.sync.now();
	d2.col = FC.addFig(d2.col, f2); await d2.sync.now();
	await d1.sync.now();
	const acct = JSON.parse(rows.get('ptfig:ann')).figs;
	A(!!acct.figs[f1.id] && !!acct.figs[f2.id] && !!d1.col.figs[f2.id] && !!d2.col.figs[f1.id], 'figurines found on two devices both end up on the account and on both devices');
	// one grows on device 1; device 2 syncs and gets the growth
	d1.col = FC.putFig(d1.col, gainExp(d1.col.figs[f1.id], 80000, data).fig); await d1.sync.now(); await d2.sync.now();
	A(d2.col.figs[f1.id].level === d1.col.figs[f1.id].level && d2.col.figs[f1.id].level > 20, 'growth on one device reaches the other');
	const guest = device(null); guest.col = FC.addFig(guest.col, fig('mew', 5)); await guest.sync.now();
	A(guest.sync.status() === 'guest' && !rows.has('ptfig:null'), 'a guest\'s figurines stay on the device');
	A(!rows.has('pkcol:ann'), 'the figurines have their own row (ptfig:), apart from Pocket\'s cards');
}

// ---- the device copy and the found note
{
	const mem = new Map(), LS = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
	A(Object.keys(SV.figs(LS).figs).length === 0, 'an empty device has an empty collection');
	const f = fig('squirtle', 9);
	SV.addFound(f, LS);
	A(!!SV.figs(LS).figs[f.id] && JSON.stringify(SV.takeFound(LS)) === JSON.stringify([f.id]) && SV.takeFound(LS).length === 0, 'a figurine found in the overworld is kept, and noted once for Poketactica to show');
	mem.set(SV.FIGS_KEY, '{broken');
	A(Object.keys(SV.figs(LS).figs).length === 0 && mem.get(SV.FIGS_KEY + '_bak') === '{broken', 'a copy that can\'t be read is set aside (never overwritten in place)');
}

// ---- what a battle does to the collection
{
	const a = fig('machamp', 30), b = fig('pikachu', 30);
	let col = FC.addFig(FC.addFig(FC.newFigs(), a), b);
	const res = { exp: { p0: 60000 }, moveXp: { ['p1:' + b.equipped[0]]: 5000 }, captured: [fig('rattata', 25)], bonus: [{ level: 1, kind: 'stars', n: 30 }, { level: 2, kind: 'figurine', rarity: 'common' }, { level: 3, kind: 'pack', game: 'pocket' }, { level: 4, kind: 'exp', n: 1000 }] };
	const { col: c2, report } = applyResults(col, { p0: a.id, p1: b.id }, res, { data, rng: makeRng('r'), wildSpecies: ['rattata', 'spearow'], seed: 'b1' });
	A(c2.figs[a.id].level > a.level && report.levels.some((l) => l.id === a.id && l.to > l.from), 'EXP levels a figurine up (reported)');
	A(c2.figs[b.id].pool.find((p) => p.id === b.equipped[0]).lv > 1, 'move XP levels the move it used');
	A(report.caught.length === 1 && c2.figs[report.caught[0].id] && report.caught[0].id !== res.captured[0].id, 'a caught Pokémon becomes the player\'s figurine (a new id)');
	A(report.stars === 30 && report.figurines.length === 1 && c2.figs[report.figurines[0].id] && ['rattata', 'spearow'].includes(report.figurines[0].species), 'the gauge pays stars and a figurine of this map\'s wild Pokémon');
	A(report.owed.length === 1 && report.owed[0].kind === 'pack', 'items and card packs are listed as owed (stage 5b)');
	A(Object.keys(c2.figs).length === 4, 'nothing else changes');
	// the results screen's per-unit lines (owner, 2026-11-21: "show exp gain/leveling up for each unit after combat")
	const ua = report.units.find((u) => u.id === a.id), ub = report.units.find((u) => u.id === b.id);
	A(report.units.length === 2 && ua.uid === 'p0' && ub.uid === 'p1', 'report.units: one line for every figurine that went in (also one that earned no KO EXP)', report.units);
	A(ua.from === a.level && ua.to === c2.figs[a.id].level && ua.expFrom === a.exp && ua.expTo === c2.figs[a.id].exp && ua.gained === ua.expTo - ua.expFrom && ua.gained > 60000, "its EXP before and after (the KOs' and the gauge's) and its levels", ua);
	A(ub.gained === 500 && ub.to >= ub.from, 'the gauge\'s EXP spread reaches the one with no KOs too', ub);
	A(ub.moves.length >= 1 && ub.moves[0].id === b.equipped[0] && ub.moves[0].xp === 5000 && ub.moves[0].to > ub.moves[0].from, 'and the move XP each move earned, with its move levels', ub.moves);
	A(JSON.stringify(ua.newMoves) === JSON.stringify(report.levels.find((l) => l.id === a.id).newMoves), 'the moves it learned');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
