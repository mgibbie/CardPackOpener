// trainerkey_test.mjs — two trainers on one map must not share a defeat key.
//
// Reported from Violet Gym: "beating Abe also marks the still-unfought Rod as
// defeated, so Rod's battle becomes impossible. After the Abe win, both trainer
// flags became true, but the save added only
// `MAP_VIOLET_GYM:VioletGym_SPRITE_YOUNGSTER`. They appear to share one defeat
// key."
//
// Exactly right. keyOf was `${map}:${local_id}`, and local_id in the Crystal
// decomps is a SPRITE constant, not a unique object id — both youngsters in that
// gym are VioletGym_SPRITE_YOUNGSTER. One key, two trainers.
//
// FIX: disambiguate by coordinates ONLY where a collision actually exists on that
// map. Unique trainers keep the exact key their save already holds, so no
// progress is invalidated. Colliding ones get a new key, which means the stale
// shared key stops matching them and BOTH become fightable — the right outcome,
// since it is not knowable which of the two the player really beat.
//
//   node overworld/tests/trainerkey_test.mjs
import { Trainers } from '../trainers.js';

let pass = 0, fail = 0;
const A = (c, m, x) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (x != null ? '  ' + x : '')); } };

// a Trainers instance with a stubbed world — loadForMap needs the network, keyOf does not
function mk(mapId, evs) {
	const tr = new Trainers({ current: { map: { id: mapId } } }, null);
	tr.list = evs.map(ev => ({ ev, tx: ev.x, ty: ev.y }));
	tr.recomputeDupBases();
	return tr;
}
const VIOLET = 'MAP_VIOLET_GYM';

// ---------- the reported collision ----------
{
	const abe = { local_id: 'VioletGym_SPRITE_YOUNGSTER', x: 4, y: 7 };
	const rod = { local_id: 'VioletGym_SPRITE_YOUNGSTER', x: 6, y: 3 };
	const tr = mk(VIOLET, [abe, rod]);
	const kAbe = tr.keyOf(tr.list[0]), kRod = tr.keyOf(tr.list[1]);
	A(kAbe !== kRod, 'Abe and Rod no longer share a defeat key', `${kAbe} vs ${kRod}`);
	tr.markDefeated(tr.list[0]);
	A(tr.isDefeated(tr.list[0]), 'beating Abe marks Abe');
	A(!tr.isDefeated(tr.list[1]), 'and does NOT mark Rod — his battle stays possible');
}

// ---------- a unique trainer keeps the key its save already has ----------
{
	// the guide is unique on this map; the two youngsters collide with each other.
	// (A single youngster would NOT collide, and correctly keeps the plain key —
	// that was the first version of this fixture, and it was wrong.)
	const solo = { local_id: 'VioletGym_SPRITE_GYM_GUIDE', x: 2, y: 9 };
	const other = { local_id: 'VioletGym_SPRITE_YOUNGSTER', x: 4, y: 7 };
	const other2 = { local_id: 'VioletGym_SPRITE_YOUNGSTER', x: 6, y: 3 };
	const tr = mk(VIOLET, [solo, other, other2]);
	A(tr.keyOf(tr.list[0]) === `${VIOLET}:VioletGym_SPRITE_GYM_GUIDE`,
		'a non-colliding trainer keeps the legacy key format (no save is invalidated)', tr.keyOf(tr.list[0]));
	A(tr.keyOf(tr.list[1]).startsWith(`${VIOLET}:VioletGym_SPRITE_YOUNGSTER@`),
		'only the colliding one gains a coordinate suffix', tr.keyOf(tr.list[1]));
}

// ---------- an already-saved shared key must not keep BOTH beaten ----------
{
	const abe = { local_id: 'VioletGym_SPRITE_YOUNGSTER', x: 4, y: 7 };
	const rod = { local_id: 'VioletGym_SPRITE_YOUNGSTER', x: 6, y: 3 };
	const tr = mk(VIOLET, [abe, rod]);
	tr.defeated.add(`${VIOLET}:VioletGym_SPRITE_YOUNGSTER`);   // the stale, ambiguous key
	A(!tr.isDefeated(tr.list[0]) && !tr.isDefeated(tr.list[1]),
		'an existing save with the shared key re-arms BOTH instead of stranding Rod',
		[tr.keyOf(tr.list[0]), tr.keyOf(tr.list[1])].join(' | '));
}

// ---------- three-way collisions work too ----------
{
	const evs = [
		{ local_id: 'SPRITE_SWIMMER', x: 1, y: 1 },
		{ local_id: 'SPRITE_SWIMMER', x: 2, y: 2 },
		{ local_id: 'SPRITE_SWIMMER', x: 3, y: 3 },
	];
	const tr = mk('MAP_CERULEAN_GYM', evs);
	const keys = tr.list.map(t => tr.keyOf(t));
	A(new Set(keys).size === 3, 'three trainers sharing a sprite get three keys', keys.join(' | '));
	tr.markDefeated(tr.list[1]);
	A(!tr.isDefeated(tr.list[0]) && tr.isDefeated(tr.list[1]) && !tr.isDefeated(tr.list[2]),
		'beating the middle one marks only the middle one');
}

// ---------- trainers with no local_id still work (script / coords fallback) ----------
{
	const evs = [{ script: 'TrainerA_Script', x: 1, y: 1 }, { x: 5, y: 5 }];
	const tr = mk('MAP_ROUTE_31', evs);
	A(tr.keyOf(tr.list[0]) === 'MAP_ROUTE_31:TrainerA_Script', 'a script-keyed trainer is unchanged', tr.keyOf(tr.list[0]));
	A(tr.keyOf(tr.list[1]) === 'MAP_ROUTE_31:5,5', 'a coordinate-keyed trainer is unchanged', tr.keyOf(tr.list[1]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
