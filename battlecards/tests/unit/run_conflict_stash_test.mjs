// run_conflict_stash_test.mjs — a losing run copy is stashed, and a LATER conflict must
// never replace an earlier, different run's stash. The bug: the stash was one fixed slot
// (`<key>__conflict_v1`); a browser that came back with an old profile reconciled its
// stale Samwise copy at boot and wrote it over the held Gandalf stash (instinctgauntlet,
// 2026-11-08) -- the Gandalf run was gone from the browser.
import { stashRunConflict, listConflictStashes, pickCanonicalRun, CONFLICT_STASH_MAX } from '../../runsync.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
function fakeStorage(init = {}) {
	const m = new Map(Object.entries(init));
	return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}
const KEY = 'magepunk_middleearth_v1';
const run = (runId, rev, extra = {}) => ({ active: true, runId, rev, updatedAt: 1000 + rev, wins: 0, losses: 0, ...extra });
const stashedIds = st => Object.values(listConflictStashes(st, KEY)).map(s => s && s.run && s.run.runId).sort();

// 1. the reported repro: a held Gandalf stash, then a boot conflict stashes a stale Samwise copy
{
	const gandalf = { run: run('rmvzdk84ica0gwg', 315, { characterId: 'Gandalf', wins: 3, losses: 1 }), reason: 'server-ended', at: 1793794377147 };
	const st = fakeStorage({ [KEY + '__conflict_v1']: JSON.stringify(gandalf), [KEY]: JSON.stringify(run('rmw89x13h00d512', 104, { characterId: 'Elrond' })) });
	const samwise = run('rmw5py6mqpfdl85', 127, { characterId: 'Samwise', losses: 2 });
	const elrond = JSON.parse(st.getItem(KEY));
	const v = pickCanonicalRun(samwise, elrond, 1794171318000);
	ok('repro: the server Elrond run is canonical over the stale local Samwise', v.pick === 'server' && v.preserve === 'local', JSON.stringify(v));
	stashRunConflict(st, KEY, samwise, v.reason, 1794171318490);
	ok('1. existing stash A + different-run conflict B: both kept', JSON.stringify(stashedIds(st)) === JSON.stringify(['rmvzdk84ica0gwg', 'rmw5py6mqpfdl85']), JSON.stringify(stashedIds(st)));
	ok('1. ...the held Gandalf stash bytes are untouched', st.getItem(KEY + '__conflict_v1') === JSON.stringify(gandalf));
	ok('1. ...each stash is labelled with run/rev/reason/time', Object.values(listConflictStashes(st, KEY)).every(s => s.run.runId && s.run.rev && s.reason && s.at));
	ok('3. the live main key (Elrond) is untouched by stashing', JSON.parse(st.getItem(KEY)).runId === 'rmw89x13h00d512');
}
// 2. three successive conflicts: all retained
{
	const st = fakeStorage();
	for (const id of ['ra', 'rb', 'rc']) stashRunConflict(st, KEY, run(id, 5), 'different-run-newer-stamp');
	ok('2. three successive conflicts: all three retained', JSON.stringify(stashedIds(st)) === '["ra","rb","rc"]', JSON.stringify(stashedIds(st)));
	ok('2. ...the first lands in the legacy slot', JSON.parse(st.getItem(KEY + '__conflict_v1')).run.runId === 'ra');
}
// 4. same run: a newer copy supersedes its own stash, an older/equal one never replaces it
{
	const st = fakeStorage();
	stashRunConflict(st, KEY, run('rs', 10), 'x');
	stashRunConflict(st, KEY, run('rs', 7), 'y');
	ok('4. same run, OLDER copy: the stash keeps rev 10', JSON.parse(st.getItem(KEY + '__conflict_v1')).run.rev === 10);
	stashRunConflict(st, KEY, run('rs', 12), 'z');
	const all = Object.values(listConflictStashes(st, KEY));
	ok('4. same run, NEWER copy: one slot, now rev 12', all.length === 1 && all[0].run.rev === 12, JSON.stringify(all.map(s => s.run.rev)));
}
// 5. nothing to stash -> nothing written
{
	const st = fakeStorage();
	stashRunConflict(st, KEY, null, 'x');
	ok('5. empty profile: no stash written', st.length === 0);
}
// bounded: past the cap the OLDEST goes, never the newest or a random one
{
	const st = fakeStorage();
	for (let i = 0; i < CONFLICT_STASH_MAX + 1; i++) stashRunConflict(st, KEY, run('r' + i, 1), 'x', 1000 + i);
	const ids = stashedIds(st);
	ok('bounded: the list stays at the cap', ids.length === CONFLICT_STASH_MAX, ids.length);
	ok('bounded: the oldest stash made room, the newest is kept', !ids.includes('r0') && ids.includes('r' + CONFLICT_STASH_MAX), JSON.stringify(ids));
}
// other modes' stashes are not this key's
{
	const st = fakeStorage({ ['magepunk_lorequest_v1__conflict_v1']: JSON.stringify({ run: run('lq', 1), reason: 'x', at: 1 }) });
	stashRunConflict(st, KEY, run('me', 1), 'x');
	ok('another mode\'s stash is left alone', JSON.parse(st.getItem('magepunk_lorequest_v1__conflict_v1')).run.runId === 'lq' && stashedIds(st).join() === 'me');
}

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
