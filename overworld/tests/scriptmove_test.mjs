// scriptmove_test.mjs — a cutscene may never walk an NPC onto the player.
//
// Reported after beating Brock: "his post-battle script moved him onto the
// player's tile. The TM dialogue stopped advancing. Reload preserved the victory
// and shard, but Brock still overlapped the player."
//
// CAUSE. The script `move` op walks an actor with no collision check at all:
//     s.to = [actor.tx + dx, actor.ty + dy];
// The decomp scripts it replays assume the player is standing exactly where the
// scene expects. Ours can be anywhere when a post-battle script fires, so an
// approach or exit walk steps straight onto them — and because the overlap is
// just the NPC's tx/ty, it survives a reload.
//
// FIX: hold the tile instead. The actor keeps its new facing and the script moves
// on, which is what "walk up to the player" meant anyway. Plus a guard so a
// malformed step can never throw mid-scene — a crash there strands the cutscene
// holding `blocking`, which swallows all input.
//
//   node overworld/tests/scriptmove_test.mjs
import { Cutscene } from '../events.js';

let pass = 0, fail = 0;
const A = (c, m, x) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (x != null ? '  ' + x : '')); } };

const mkCtx = (player, talker, npcs = {}) => ({
	player, talker,
	npcById: who => npcs[who] || null,   // how _actor resolves a named actor
	dialog: { blocking: false, open() { this.blocking = true; } },
	playerName: 'RED',
});
// run a cutscene to completion (or until it stops making progress)
function run(cs, ticks = 400) {
	for (let i = 0; i < ticks && cs.blocking; i++) cs.update(1 / 60);
	return !cs.blocking;
}

// ---------- an NPC walking INTO the player stops short ----------
{
	const player = { tx: 5, ty: 5, facing: 'up' };
	const brock = { tx: 5, ty: 8, facing: 'up', px: 80, py: 128, stepParity: 0, moving: false };
	const cs = new Cutscene();
	// walk three tiles up: 5,8 -> 5,7 -> 5,6 -> would be 5,5 = the player
	cs.start([{ op: 'move', who: 'brock', steps: [
		{ dir: 'up', mode: 'walk' }, { dir: 'up', mode: 'walk' }, { dir: 'up', mode: 'walk' },
	] }], mkCtx(player, brock, { brock }));
	// _actor resolves by ctx.actors when the scene names one; fall back to talker
	const done = run(cs);
	A(done, 'the scene finishes');
	A(!(brock.tx === player.tx && brock.ty === player.ty),
		'the NPC never ends up on the player\'s tile', `npc ${brock.tx},${brock.ty} player ${player.tx},${player.ty}`);
	A(brock.ty === 6, 'it stops on the tile in front of them', `ty ${brock.ty}`);
	A(brock.facing === 'up', 'and still turns to face them', brock.facing);
}

// ---------- a walk that does NOT involve the player is untouched ----------
{
	const player = { tx: 1, ty: 1, facing: 'down' };
	const npc = { tx: 5, ty: 8, facing: 'up', px: 80, py: 128, stepParity: 0, moving: false };
	const cs = new Cutscene();
	cs.start([{ op: 'move', who: 'npc', steps: [
		{ dir: 'up', mode: 'walk' }, { dir: 'up', mode: 'walk' },
	] }], mkCtx(player, npc, { npc }));
	A(run(cs), 'the scene finishes');
	A(npc.tx === 5 && npc.ty === 6, 'an ordinary scripted walk still moves the full path', `${npc.tx},${npc.ty}`);
}

// ---------- the player's OWN scripted movement is not blocked by itself ----------
{
	const player = { tx: 5, ty: 5, facing: 'up', px: 80, py: 80, stepParity: 0, moving: false };
	const cs = new Cutscene();
	cs.start([{ op: 'move', who: 'player', steps: [{ dir: 'down', mode: 'walk' }] }], mkCtx(player, null));
	A(run(cs), 'the scene finishes');
	A(player.ty === 6, 'the player can still be walked by a script', `ty ${player.ty}`);
}

// ---------- a malformed step must not throw mid-scene ----------
{
	const player = { tx: 1, ty: 1 };
	const npc = { tx: 5, ty: 8, facing: 'up', px: 80, py: 128, moving: false };
	const cs = new Cutscene();
	cs.start([{ op: 'move', who: 'npc', steps: [{ dir: 'nowhere', mode: 'walk' }, { dir: 'up', mode: 'walk' }] }],
		mkCtx(player, npc, { npc }));
	let threw = null;
	try { run(cs); } catch (e) { threw = e.message; }
	A(!threw, 'an unknown direction does not throw', threw);
	A(!cs.blocking, 'and the scene still releases the player', 'blocking=' + cs.blocking);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
