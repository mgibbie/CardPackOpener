// mmmode.js — MYSTERY MAZE on the board (owner, 2026-11-23; Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md stage 7). The run is
// mm/turn.js (exact, action by action: everything moves when you do); this file is the page: Poketactica's own board
// drawn from what you have explored (walls as low blocks, water and lava as the terrain draws them), the camera on the
// leader, a bar with the floor, HP, belly, purse and bag, a minimap, and the leader's commands.
//   keyboard / pad: arrows step (two together: the diagonal between them) · Z attack the tile in front / take the stairs /
//                   take a shop's item · C moves · V the bag · X then a direction: turn on the spot · Enter the menu
//                   (wait a turn, tactics, pay, give up) · Q / E turn the board
//   touch (owner, 2026-11-23: "a control scheme similar to what we are navigating the overworld with except instead of a
//          4 directional D pad we want a joystick to go 8 directions"): the overworld's pad. A JOYSTICK bottom left: push
//          it any of 8 ways and the leader steps that way ON SCREEN (up is up), and keeps stepping while it is held. A and
//          B bottom right: A attacks / takes the stairs / takes a shop's item, and picks in a menu; B backs out of a menu
//          or an aim, and HELD it makes the stick only turn the leader. MENU, MOVES, BAG and WAIT top right. In a menu the
//          stick moves the choice; while aiming it moves the aim. Tapping the board still works: a tile next to you to
//          step or strike, one further off to walk there.
//   a controller's LEFT STICK is the same 8-way stick (owner, 2026-11-23): the way it points on screen, repeating while
//          held. Its d-pad stays the four arrows (two together: a diagonal). X, then the stick, turns on the spot.
// Walking into a wild Pokémon turns to face it and attacks. Walking into a wall only turns you.
// A run is its recipe (mm/replay.js): { seed, dungeon, party, bag, stars, acts }, the leader's actions in order. From it:
//   play    the player's run: saved on this device after every action (a reload RESUMES it exactly where it was), and
//           stored as a replay when it ends
//   watch   a replay, re-run action by action: Z play / pause · ← → the floor before / after · C speed · X the start ·
//           V a link to this floor
//   follow  a friend's live run: NOT the recipe. They send only what they see (turn.js view: the explored ground, the
//           Pokémon in sight, the bar), so a spectator knows nothing the player doesn't.
import * as MM from './mm/turn.js';
import { MARK_SAY, abilitySay, STATUS_SHOW, statusShow } from './engine/statusfx.js';
import { DIR8, DIR8_KEYS, cheb, hitTiles8 } from './mm/shapes8.js';
import { ITEMS, nameIn, noteIn, iconIn, pelletAlias, usable, throwable, throwBlock, LOB_RANGE, givable, sellPrice } from './mm/items.js';
import { goodIconImg } from './goodicons.js';
import { TRAPS } from './mm/traps.js';
import { ATTACK_ID, moveFor, aimsOf, moveBlock } from './mm/combat.js';
import { aimsAtFoes, isFoe } from './mm/ai.js';
import { T_SHOP } from './mm/gen.js';
import { dungeonById, WEATHER_NAME, WEATHER_SAY, SPECIAL_NAME, SPECIAL_SAY, BOSS_TRICKS } from './mm/dungeons.js';
import { mmRecipe, mmDriver, mmRunTo, unpackActs, mmFig } from './mm/replay.js';

const STEP_S = 0.13, CHORD_MS = 45, AUTO_S = 0.1;
// how close the camera sits: a phone shows about 7 tiles across, a wide screen about 12 (closer, the bar hid the party)
const zoomNow = () => (typeof innerWidth === 'number' && innerWidth >= 900 ? 3 : 5);
const WATCH_RATE = 5, WATCH_SPEEDS = [1, 2, 4, 8];   // a replay plays 5 actions a second at 1×
// the joystick: its dead centre (px), the wait before a held push repeats and between repeats (ms)
const STICK_DEAD = 16, STICK_FIRST = 260, STICK_REPEAT = 150;
const PAD_DEAD = 0.5;   // how far a controller's stick must be pushed (of its full throw)
const BAR_KEY = 'magepunk_poketactica_mmbar_v1';   // ('small': the bar is folded to one line; remembered on this device)
const COACH_KEY = 'magepunk_poketactica_mmcoach_v1';   // (this device has been shown the ropes)
// the first run's coach: one thing at a time, each ticked off by doing it (key: keyboard / controller words; touch: a phone's)
const COACH = [
	{ key: 'Move with the <b>arrows</b> (two together: a diagonal). Nothing else moves until you do.', touch: 'Push the <b>joystick</b> to walk. Nothing else moves until you do.', done: (S) => S.steps >= 4 },
	{ key: 'A wild Pokémon: <b>walk into it</b> to attack, or press <b>Z</b> to strike the tile in front. <b>C</b> is your moves.', touch: 'A wild Pokémon: <b>walk into it</b> to attack, or press <b>A</b>. <b>MOVES</b> are stronger, and cost PP and SP.', done: (S, M) => S.kills >= 1 || M.acts.some((a) => a.t === 'move') },
	{ key: 'Walk over items to pick them up (the green ◆). <b>V</b> opens the bag: use or throw.', touch: 'Walk over items to pick them up (the green ◆). <b>BAG</b>: use or throw.', done: (S, M) => S.bag.length > 0 || M.acts.some((a) => a.t === 'use' || a.t === 'throw') || S.floorNo > 1 },
	{ key: 'Hurt? <b>Enter → Wait a turn</b> a few times: your party heals as turns pass. Or <b>Enter → Rest</b>. Watch the belly: use a Wax Apple before it empties.', touch: 'Hurt? Press <b>WAIT</b> a few times, or <b>MENU → Rest</b>: your party heals as turns pass. Watch the belly: use a Wax Apple before it empties.', done: (S, M) => M.acts.filter((a) => a.t === 'pass').length >= 2 || S.floorNo > 1 },
	{ key: 'Find the <b>stairs</b> (gold ▼, on the minimap too) and press <b>Z</b> on them to go down.', touch: 'Find the <b>stairs</b> (gold ▼, on the minimap too) and press <b>A</b> on them to go down.', done: (S) => S.floorNo > 1 },
];   // how far a controller's stick must be pushed (of its full throw)
// the 8 ways a stick can point, clockwise from screen-right, as sums of the arrow keys' own screen diagonals
// (the board is seen corner-on: the up arrow is up-right on screen, right is down-right, down is down-left, left is up-left)
const STICK_WAYS = [['up', 'right'], ['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up']];
const TACTIC_NAME = { follow: 'Stay close', hunt: 'Go after foes', away: 'Keep away', wait: 'Wait here' };
const PLAN_NAME = { any: 'Its best move', save: 'Save PP', attack: 'Attack only' };
const PLAN_SAY = { any: 'the move worth most against what it would hit', save: 'the plain Attack while a foe is in reach; its moves for a boss, or from a distance', attack: 'the plain Attack only: no PP is spent' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cap = (s) => s[0].toUpperCase() + s.slice(1);

/** ctx: as tdmode.js's, plus onLost(fallen entry) (a figurine of yours is gone: bury it now) and onOver(run). */
export function createMmMode(ctx) {
	const { P, data, $ } = ctx;
	const M = { S: null, acts: [], seed: null, dungeon: null, party: [], bag: [], stars: 0, bar: null, seenN: -1, floor: 0, turn: false, aim: null, auto: null, tw: {}, pos: {}, msgs: [], chord: null, shownOver: false, buried: 0,
		mode: 'play', drv: null, rec: null, speed: 1, paused: false, acc: 0, ended: false, view: null, say: '' };
	const playing = () => M.mode === 'play';
	const nm = (it) => nameIn(M.S, it);   // (an item's name as this run knows it: an unknown pellet by its colour)
	/** The run so far, as a recipe (a save, a replay). */
	const recipe = () => mmRecipe({ seed: M.seed, dungeonId: M.dungeon.id, party: M.party, bag: M.bag, stars: M.stars, acts: M.acts, S: M.S });
	/** This device's copy of the run in progress (a reload resumes it); cleared when it ends. */
	function save() { if (playing() && ctx.store) ctx.store(M.S.over ? null : { v: 1, recipe: recipe(), ts: Date.now() }); }
	const nameOf = (sp) => (data.species[sp] || {}).name || sp;
	const moveName = (id) => (id === ATTACK_ID ? 'Attack' : (data.moves[id] || {}).name || id);
	const L = () => MM.leaderOf(M.S);
	// (the bar shows the last three; the field menu's "Messages" keeps the last HIST_MAX of the run, floor by floor)
	const HIST_MAX = 120;
	const keep = (t) => { if (!M.hist) M.hist = []; M.hist.push(t); if (M.hist.length > HIST_MAX) M.hist.shift(); };
	const say = (t) => { M.msgs.push(t); if (M.msgs.length > 3) M.msgs.shift(); keep(t); };
	/** The minimap's colours, said (the legend), in the order they are drawn. */
	const MAP_KEY = [['#ffffff', 'You (the leader)'], ['#9be7ff', 'Your partners'], ['#ff5a5a', 'Wild Pokémon'], ['#ffb36b', 'A shopkeeper'], ['#ffd23c', 'The stairs'], ['#5fe08a', 'An item'], ['#c070ff', 'A trap you have found'], ['#c9a227', 'A locked door'],
		['#8f8a7c', 'Floor you have seen'], ['#4a8fe0', 'Water'], ['#e07a3a', 'Lava']];

	// ---- the board: what has been explored. Walls stand one level up; unexplored ground is not there at all.
	function board() {
		const S = M.S, F = S.F, n = F.w * F.h, height = new Array(n).fill(null), ground = new Array(n).fill(null);
		let seen = 0;
		// (plan item M9: a locked door stands as a DOOR, wall-high, where it was a mark on open ground; a vault's floor glints)
		const locks = new Set(F.locks || []), vault = F.vault != null && F.room && F.room.length ? F.vault : null;
		for (let i = 0; i < n; i++) {
			if (!S.seen[i]) continue;
			seen++;
			const k = F.terrain[i] & 3;
			height[i] = k === 0 || locks.has(i) ? 1 : 0;
			if (locks.has(i)) ground[i] = 'door';
			else if (k >= 2) ground[i] = F.water ? 'water' : 'lava';
			else if (k === 1 && vault != null && F.room[i] === vault) ground[i] = 'vault';
		}
		const map = { w: F.w, h: F.h, height, ground, theme: M.dungeon.theme || 'cave', base: { x: 0, y: 0 } };
		// (the page reads the rules' board for everything but the ground it draws)
		P.S = Object.assign(Object.create(S.B), { map });
		if (!P.disp) P.disp = { units: {}, geo: S.B.geo };
		ctx.buildScene(map);
		M.seenN = seen; M.floor = S.floorNo; M.lockN = locks.size;
	}
	const seenCount = () => { let n = 0; for (const v of M.S.seen) if (v) n++; return n; };

	// ---- the units, as the page draws them: your party always, others while in sight; steps glide
	function sync() {
		const S = M.S, D = P.disp, now = performance.now() / 1000, F = S.F, vis = new Set(MM.sightNow(S)), shown = new Set();
		for (const u of S.units) {
			if (u.hp <= 0 || (u.side !== 'p' && !S.lit && !vis.has(u.y * F.w + u.x))) continue;
			shown.add(u.uid);
			const d = D.units[u.uid] || (D.units[u.uid] = { anim: 'Idle', t0: 0, flash: 0 });
			const tw = M.tw[u.uid];
			if (tw && now < tw.t1) { const k = (now - tw.t0) / (tw.t1 - tw.t0); d.wx = [tw.from[0] + (u.x - tw.from[0]) * k, tw.from[1] + (u.y - tw.from[1]) * k]; if (d.anim === 'Idle') d.anim = 'Walk'; }
			else { d.wx = null; delete M.tw[u.uid]; if (d.anim === 'Walk') d.anim = 'Idle'; }
			if (d.anim === 'Attack' && now - d.t0 > 0.4) d.anim = 'Idle';
			if (d.anim === 'Hurt' && now - d.t0 > 0.25) d.anim = 'Idle';
			if (d.anim === 'Idle' && (u.nap || u.status === 'slp')) d.anim = 'Sleep';
			else if (d.anim === 'Sleep' && !(u.nap || u.status === 'slp')) d.anim = 'Idle';
			d.x = u.x; d.y = u.y; d.hp = u.hp; d.facing = DIR8_KEYS[u.dir]; d.alive = true;
			M.pos[u.uid] = [u.x, u.y];
		}
		for (const uid of Object.keys(D.units)) if (!shown.has(uid)) delete D.units[uid];
	}

	// ---- the run's events, shown and said
	function play(evs) {
		const D = P.disp, now = performance.now() / 1000, S = M.S;
		const who = (uid) => { const u = MM.unit(S, uid); return u ? nameOf(u.species) : 'It'; };
		for (const e of evs) {
			const d = e.uid && D.units[e.uid];
			if (e.t === 'step' || e.t === 'moved' || e.t === 'warp') { if (M.pos[e.uid] && e.t === 'step') M.tw[e.uid] = { from: M.pos[e.uid], t0: now, t1: now + STEP_S }; M.pos[e.uid] = [e.x, e.y]; if (e.t === 'warp') say(who(e.uid) + ' was sent somewhere else!'); }
			else if (e.t === 'use') { if (d) { d.anim = 'Attack'; d.t0 = now; } const u = MM.unit(S, e.uid); if (u && e.move !== ATTACK_ID) { ctx.moveFx(e, u); say(who(e.uid) + ' used ' + moveName(e.move) + '!'); } }
			else if (e.t === 'hit') { const v = D.units[e.target]; if (v) { v.flash = 1; v.anim = 'Hurt'; v.t0 = now; } ctx.pop(e.target, '-' + e.dmg, e.crit ? '#ff7a5a' : e.eff > 1 ? '#ffd23c' : e.eff > 0 && e.eff < 1 ? '#b8c2c6' : '#ffffff'); if (e.target === S.leader) ctx.shake(0.25); }
			else if (e.t === 'hurt') { ctx.pop(e.uid, '-' + e.n, '#c8a0ff'); if (e.why === 'hunger' && e.uid === S.leader && M.msgs[M.msgs.length - 1] !== 'You are starving!') say('You are starving!'); if ((e.why === 'hail' || e.why === 'sand') && e.uid === S.leader) say(e.why === 'hail' ? 'The hail bites.' : 'The sand stings.'); }
			else if (e.t === 'heal') ctx.pop(e.uid, '+' + e.n, '#7cf08a');
			else if (e.t === 'miss' && e.target) ctx.pop(e.target, 'Miss', '#cccccc');
			else if (e.t === 'immune') ctx.pop(e.uid, 'Immune', '#cccccc');
			else if (e.t === 'status') { ctx.pop(e.uid, statusShow(e.st), '#e0b36b'); }
			else if (e.t === 'cured') ctx.pop(e.uid, 'Cured', '#7cf08a');
			else if (e.t === 'mark') { const n = (MARK_SAY[e.what] || [e.what])[0]; ctx.pop(e.uid, n, '#9fe0ff'); say(who(e.uid) + ': ' + n); }
			else if (e.t === 'endured') ctx.pop(e.uid, 'Endured!', '#9fe0ff');
			else if (e.t === 'retype') ctx.pop(e.uid, e.types.join(' / '), '#9fe0ff');
			else if (e.t === 'ability') ctx.pop(e.uid, abilitySay(e, P.data.abilities._names).pop, '#9fe0ff');
			else if (e.t === 'confused') ctx.pop(e.uid, 'CONFUSED', '#e0b36b');
			else if (e.t === 'boost') ctx.pop(e.uid, Object.entries(e.changes).map(([k, n]) => (n > 0 ? '+' : '') + n + ' ' + k.toUpperCase()).join(' '), Object.values(e.changes)[0] > 0 ? '#7cf08a' : '#e0b36b');
			else if (e.t === 'ko') { const at = M.pos[e.uid]; if (at) ctx.fx({ k: 'ring', at, r: 1, t: 0, dur: 0.4, color: '#ffffff' }); }
			else if (e.t === 'lost') { ctx.sfx.error(); if (e.recruit) say(nameOf(e.species) + ' fell.'); else { say(nameOf(e.species) + ' is gone for good.'); ctx.banner(nameOf(e.species) + ' is gone'); } }
			else if (e.t === 'leader') { say(who(e.uid) + ' leads now.'); ctx.banner(who(e.uid) + ' leads now'); }
			else if (e.t === 'floor') { ctx.banner(`${M.dungeon.name} · B${e.n}F`); M.msgs = []; M.tw = {}; M.pos = {}; keep('— B' + e.n + 'F —'); }
			else if (e.t === 'pickup') { ctx.sfx.coin && ctx.sfx.coin(); say(e.id === 'stars' ? `Picked up ${e.n} stars.` : `Picked up ${nm({ id: e.id, n: e.n })}${[...S.bag].reverse().some((it, k) => k === 0 && it.id === e.id && it.sticky) ? ' (sticky: it cannot be used until it is carried out)' : ''}.`); }
			else if (e.t === 'bagfull') say(`The bag is full: ${nm({ id: e.id })} stays.${S.rev >= 16 ? ' (Bag → an item → Swap to take it.)' : ''}`);
			else if (e.t === 'drop') say(`Put down ${nm({ id: e.id, n: e.n })}.`);
			else if (e.t === 'swap') say(`Swapped ${nm({ id: e.left })} for ${nm({ id: e.got })}.`);
			else if (e.t === 'sold') { ctx.sfx.coin && ctx.sfx.coin(); say(`Sold ${nm({ id: e.id, n: e.n })} for ${e.stars} stars.`); }
			else if (e.t === 'item') say(e.how === 'throw' ? `${(ITEMS[e.id] || {}).group === 'wand' ? 'Waved' : 'Threw'} ${nm({ id: e.id })}.` : e.how === 'give' ? `${nameOf((S.units.find((x) => x.uid === e.uid) || {}).species || 'Your partner')} took the ${nm({ id: e.id })}.` : (ITEMS[e.id] || {}).teach ? `Read the ${nm({ id: e.id })}.` : `Used ${nm({ id: e.id })}.`);
			else if (e.t === 'nothing') say('Nothing happened.');
			else if (e.t === 'taught') { ctx.sfx.coin && ctx.sfx.coin(); ctx.pop(e.uid, moveName(e.move), '#ffd23c'); say(who(e.uid) + ' learned ' + moveName(e.move) + (e.forgot ? ' and forgot ' + moveName(e.forgot) : '') + '!'); }
			else if (e.t === 'bosstrick') { const say1 = { rage: `${nameOf(e.species)} flies into a rage: it moves twice as fast!`, mend: `${nameOf(e.species)} mends its wounds!`, rally: `${nameOf(e.species)} calls for help!` }[e.kind] || `${nameOf(e.species)} does something.`; ctx.banner((BOSS_TRICKS[e.kind] || {}).name ? `${nameOf(e.species)}: ${BOSS_TRICKS[e.kind].name}` : nameOf(e.species)); say(say1); ctx.sfx.error && ctx.sfx.error(); ctx.shake && ctx.shake(0.4); }
			else if (e.t === 'special') { ctx.banner(SPECIAL_NAME[e.kind] || 'A special floor'); say(`${SPECIAL_NAME[e.kind] || 'A special floor'}. ${SPECIAL_SAY[e.kind] || ''}`); }
			else if (e.t === 'unlock') { say(e.key ? 'The Brass Key turns: the door is open.' : 'You open the door from inside.'); ctx.sfx.coin && ctx.sfx.coin(); }
			else if (e.t === 'weather') say(e.floor ? `${WEATHER_NAME[e.kind] || 'Weather'} on this floor. ${WEATHER_SAY[e.kind] || ''}` : `The weather changed: ${(WEATHER_NAME[e.kind] || e.kind).toLowerCase()}.`);
			else if (e.t === 'known') say(`The ${pelletAlias(S, e.id)} was a ${ITEMS[e.id].name}!`);
			// (owner's list, 2026-11-24: these happened without a word)
			else if (e.t === 'speed') { const u = MM.unit(S, e.uid); if (u) { const how = u.haste > 0 ? 'is moving faster!' : u.slow > 0 ? 'is slowed!' : 'is back to its usual speed.'; ctx.pop(e.uid, u.haste > 0 ? 'FAST' : u.slow > 0 ? 'SLOW' : 'speed back', '#9fe0ff'); if (u.side === 'p' || P.disp.units[e.uid]) say(who(e.uid) + ' ' + how); } }
			else if (e.t === 'stone') ctx.pop(e.uid, 'STONE', '#b8c2c6');
			else if (e.t === 'grimy') say((ITEMS[e.id] ? ITEMS[e.id].name : 'Something') + ' in the bag went grimy!');
			else if (e.t === 'reset') { ctx.pop(e.uid, 'reset', '#9fe0ff'); say(who(e.uid) + '\'s stat changes were wiped away.'); }
			else if (e.t === 'pp') { ctx.pop(e.uid, '+PP', '#7cd0ff'); say(who(e.uid) + '\'s PP came back.'); }
			else if (e.t === 'trawl') say('Every item on the floor is at your feet.');
			else if (e.t === 'belly') say('Belly: ' + e.n + '.');
			else if (e.t === 'hungry') { ctx.sfx.error(); say(e.n ? 'Getting hungry… (belly ' + e.n + ')' : 'Your belly is empty!'); }
			else if (e.t === 'trap') { ctx.sfx.error(); say(e.dud ? `A ${TRAPS[e.kind].name}! …but nothing happened.` : `A ${TRAPS[e.kind].name}!`); ctx.shake(0.3); }
			else if (e.t === 'trapseen') say(`Found a ${TRAPS[e.kind].name}.`);
			else if (e.t === 'house') { ctx.banner('It\'s a Monster House!'); ctx.sfx.error(); ctx.shake(0.6); }
			else if (e.t === 'thief') { ctx.banner('Thief!'); ctx.sfx.error(); say('The shopkeeper is coming for you!'); }
			else if (e.t === 'angry') say('The shopkeeper is furious!');
			else if (e.t === 'take') say(`${nm({ id: e.id })}: ${e.price} stars. You owe ${e.owed}.`);
			else if (e.t === 'paid') { ctx.sfx.coin && ctx.sfx.coin(); say(`Paid ${e.n} stars.`); }
			else if (e.t === 'putback') say(`Put back ${nm({ id: e.id })}.`);
			else if (e.t === 'recruit') { ctx.sfx.coin && ctx.sfx.coin(); ctx.banner(nameOf(e.species) + (e.joined ? ' joined you!' : ' will wait outside')); say(nameOf(e.species) + (e.joined ? ' joined the party!' : ' wants to join: it waits outside.')); }
			else if (e.t === 'woke') ctx.pop(e.uid, '!', '#ffffff');
			else if (e.t === 'asleep' && e.uid === S.leader) say('Zzz…');
			else if (e.t === 'stumble') say('You stumble about, confused.');
			else if (e.t === 'sealed') say(who(e.uid) + '\'s ' + moveName(e.move) + ' is sealed!');
			else if (e.t === 'ppzero') say(who(e.uid) + '\'s ' + moveName(e.move) + ' lost its PP!');
			else if (e.t === 'sticky') say(`${nm({ id: e.id })} turned sticky!`);
			else if (e.t === 'fell') say('You fell to the next floor!');
			else if (e.t === 'reveal') say('The whole floor is shown.');
			else if (e.t === 'tactic') say(who(e.uid) + ': ' + TACTIC_NAME[e.tactic] + '.');
			else if (e.t === 'plan') say(who(e.uid) + ': ' + PLAN_NAME[e.plan] + '.');
			else if (e.t === 'moveoff') say(who(e.uid) + (e.off ? ' will not use ' : ' may use ') + moveName(e.id) + (e.off ? '.' : ' again.'));
			else if (e.t === 'level') { ctx.sfx.coin && ctx.sfx.coin(); ctx.pop(e.uid, 'Lv ' + e.level, '#ffd23c'); say(who(e.uid) + ' grew to Lv ' + e.level + (e.moves && e.moves.length ? ' and learned ' + e.moves.map(moveName).join(', ') : '') + '!'
				+ (e.moves && e.moves.length && (() => { const p = MM.unit(S, e.uid); return p && e.moves.some((id) => !p.fig.equipped.includes(id)); })() ? ' (Moves: Change moves to use it)' : '')); }
			else if (e.t === 'equip') say(who(e.uid) + ' now has ' + moveName(e.id) + (e.out ? ' in place of ' + moveName(e.out) : '') + '.');
			else if (e.t === 'bossdown') { ctx.banner(nameOf(e.species) + ' is down: the stairs are open'); ctx.sfx.coin && ctx.sfx.coin(); }
		}
		// a figurine of yours that fell is gone at once (the permanent-loss rule): the page buries it now
		if (playing()) while (M.buried < S.fallen.length) { if (ctx.onLost) ctx.onLost(S.fallen[M.buried]); M.buried++; }
	}

	// ---- one action of the leader's
	function act(a, quiet) {
		if (!M.S || M.S.over || !playing()) return false;
		const ev = MM.act(M.S, a, data);
		if (ev[0] && ev[0].t === 'no') { if (!quiet) { ctx.sfx.error(); ctx.toast(cap(ev[0].why)); } return false; }
		M.acts.push(a);
		play(ev);
		refresh();
		save();
		if (M.S.over) over();
		return true;
	}
	function refresh() {
		const S = M.S;
		if (S.floorNo !== M.floor || seenCount() !== M.seenN || ((S.F.locks || []).length !== (M.lockN || 0))) board();   // (a door that opens is taken off the board)
		const u = L();
		if (u && !M.aim) P.cursor = { x: u.x, y: u.y };
		// (aiming: the view goes to the aim's cursor at once. Else it GLIDES to the leader: camGlide, each frame)
		if (M.aim || !ctx.panToward) ctx.follow(true); else M.camOn = true;
		sync(); draw();
	}
	/**
	 * The camera walks with the leader (owner, 2026-11-25: "movement is very choppy, jerking the camera around"). It used to
	 * be cut to the leader's new tile the moment a step was taken, a whole tile at once, while the sprite took STEP_S to
	 * glide there: every step the world jumped and the leader slid back to the middle. Now the view eases toward where
	 * the leader's sprite IS, each frame, and stops when it is there (so a drag to look around is left alone until the next step).
	 */
	const CAM_RATE = 16;   // (per second: the view covers ~63% of what is left every 1/16 s)
	function camGlide(dt) {
		if (!M.camOn || M.aim || !ctx.panToward) return;
		const u = L();
		if (!u) return;
		const d = P.disp && P.disp.units[u.uid], at = d && d.wx ? d.wx : [u.x, u.y];
		const left = ctx.panToward(at[0], at[1], 1 - Math.exp(-Math.min(0.1, dt) * CAM_RATE));
		if (left < 0.01 && !(d && d.wx)) { ctx.panToward(at[0], at[1], 1); M.camOn = false; }
	}

	// ---- the bar and the minimap
	function bar() {
		if (M.bar) return M.bar;
		const el = document.createElement('div');
		el.id = 'pt-mm'; el.className = 'bal-panel pt-mm'; el.hidden = true;
		el.addEventListener('click', (ev) => {
			const b = ev.target.closest('[data-act]'); if (!b || !M.S) return;
			if (b.dataset.act === 'fold') { ctx.sfx.press(); foldBar(); return; }
			if (b.dataset.act === 'coach-skip') { ctx.sfx.press(); coachDone(); drawBar(); return; }
			if (!playing()) {
				ctx.sfx.press();
				if (b.dataset.act === 'w-start') wStart(); else if (b.dataset.act === 'w-prev') wJump(M.S.floorNo - 1); else if (b.dataset.act === 'w-next') wJump(M.S.floorNo + 1);
				else if (b.dataset.act === 'w-play') wToggle(); else if (b.dataset.act === 'w-speed') wSpeed(); else if (b.dataset.act === 'w-clip' && ctx.clip) ctx.clip(M.S.floorNo);
				return;
			}
			if (M.S.over) return;
			ctx.sfx.press();
			if (P.menu) closeMenu();
			if (b.dataset.act === 'attack') confirm();
			else if (b.dataset.act === 'moves') openMoves();
			else if (b.dataset.act === 'bag') openBag();
			else if (b.dataset.act === 'wait') act({ t: 'pass' });
			else if (b.dataset.act === 'menu') openField();
		});
		document.body.appendChild(el);
		// the minimap: its own corner of the screen (top left), so no menu ever covers it
		M.mini = document.createElement('canvas');
		M.mini.id = 'mm-map'; M.mini.className = 'pt-mm-map'; M.mini.width = 112; M.mini.height = 64; M.mini.hidden = true;
		// (a tap or a click on the minimap makes it three times the size, and again puts it back: plan item M8)
		M.mini.setAttribute('role', 'button'); M.mini.setAttribute('aria-label', 'The map: press to make it bigger'); M.mini.tabIndex = -1;
		M.mini.addEventListener('click', () => { ctx.sfx.press(); M.mini.classList.toggle('is-big'); mapBig(); });
		document.body.appendChild(M.mini);
		// (the big map says what is on it: names on the map itself, and a key under it of the colours this floor shows)
		M.mapLab = document.createElement('div'); M.mapLab.id = 'mm-maplab'; M.mapLab.className = 'pt-mm-maplab'; M.mapLab.hidden = true;
		M.mapKey = document.createElement('div'); M.mapKey.id = 'mm-mapkey'; M.mapKey.className = 'pt-mm-mapkey bal-panel'; M.mapKey.hidden = true;
		M.mapKey.addEventListener('click', () => { ctx.sfx.press(); M.mini.classList.remove('is-big'); mapBig(); });
		document.body.append(M.mapLab, M.mapKey);
		return (M.bar = el);
	}
	// ---- the touch pad (the overworld's layout): a joystick, A / B, and MENU / MOVES / BAG / WAIT
	const isTouch = () => (M.touch != null ? M.touch : (M.touch = !!(ctx.touch ? ctx.touch() : typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)));
	/** A push of the stick, as a step on the board: the way it points ON SCREEN. */
	const stickVec = (way) => { const v = [0, 0]; for (const k of STICK_WAYS[way]) { const s2 = ctx.stepFor(k); v[0] += s2[0]; v[1] += s2[1]; } return [Math.sign(v[0]), Math.sign(v[1])]; };
	function stickGo(way) {
		if (!M.S || !playing() || M.S.over) return;
		if (P.menu) { if (way >= 5 || way === 0) ctx.menuMove(way === 0 ? 1 : -1); else if (way >= 1 && way <= 4) ctx.menuMove(1); return; }   // (up-ish: the choice above; down-ish: below)
		const v = stickVec(way);
		if (M.aim) { aimMove(v); return; }
		if (M.hold || M.turn) { M.turn = false; M.auto = null; act({ t: 'face', d: dirOf(v) }, true); return; }   // (B held, or X pressed first: only turn)
		go(v);
	}
	/** The stick's state: the touch joystick's and a controller's left stick drive the same one. */
	const stk = () => M.stick || (M.stick = { base: null, knob: null, id: null, way: null, timer: null });
	/** A controller's left stick, read each frame: pushed past half way, it is the 8-way stick. */
	function padStick() {
		if (typeof navigator === 'undefined' && typeof window === 'undefined') return;
		const pads = (typeof window !== 'undefined' && window.__owFakePads) || (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []);
		let x = 0, y = 0;
		for (const p of pads) { if (!p || p.connected === false || !p.axes) continue; const ax = +p.axes[0] || 0, ay = +p.axes[1] || 0; if (Math.hypot(ax, ay) > Math.hypot(x, y)) { x = ax; y = ay; } }
		M.padLean = Math.hypot(x, y) > 0.15;   // (the stick is off centre at all: any direction the shared layer reports is the stick's, not the d-pad's)
		if (Math.hypot(x, y) >= PAD_DEAD && !(typeof document !== 'undefined' && document.hidden)) { M.padStick = true; stickSet(((Math.round(Math.atan2(y, x) / (Math.PI / 4)) % 8) + 8) % 8); }
		else if (M.padStick) { M.padStick = false; if (stk().id === null) stickSet(null); }
	}
	function stickSet(way) {
		const K = stk();
		if (way === K.way) return;
		K.way = way;
		clearTimeout(K.timer);
		if (way == null) return;
		stickGo(way);
		const again = () => { if (K.way == null) return; stickGo(K.way); K.timer = setTimeout(again, STICK_REPEAT); };
		K.timer = setTimeout(again, STICK_FIRST);
	}
	function stickAt(x, y) {
		const K = M.stick, r = K.base.getBoundingClientRect(), dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2), len = Math.hypot(dx, dy), max = r.width / 2 - 22;
		const k = len > max ? max / len : 1;
		K.knob.style.transform = `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px)`;
		stickSet(len < STICK_DEAD ? null : ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8);
	}
	function stickUp() { const K = M.stick; if (!K) return; K.id = null; if (K.knob) K.knob.style.transform = ''; M.padStick = false; stickSet(null); }
	function pad() {
		if (M.pad) return M.pad;
		const el = document.createElement('div');
		el.id = 'mm-pad'; el.className = 'pt-mm-pad'; el.hidden = true;
		el.innerHTML = `<div class="pt-mm-stick" id="mm-stick" aria-label="Move: 8 directions"><div class="pt-mm-knob" id="mm-knob"></div></div>
			<div class="pt-tbtn" id="mm-a" data-pad="a">A</div><div class="pt-tbtn" id="mm-b" data-pad="b">B</div>
			<div class="pt-tbtn" id="mm-menu" data-pad="menu">MENU</div><div class="pt-tbtn" id="mm-moves" data-pad="moves">MOVES</div><div class="pt-tbtn" id="mm-bag" data-pad="bag">BAG</div><div class="pt-tbtn" id="mm-wait" data-pad="wait">WAIT</div>`;
		document.body.appendChild(el);
		const K = Object.assign(stk(), { base: el.querySelector('#mm-stick'), knob: el.querySelector('#mm-knob') });
		K.base.addEventListener('pointerdown', (e) => { e.preventDefault(); K.id = e.pointerId; stickAt(e.clientX, e.clientY); });
		addEventListener('pointermove', (e) => { if (K.id !== null && e.pointerId === K.id) stickAt(e.clientX, e.clientY); });
		for (const n of ['pointerup', 'pointercancel']) addEventListener(n, (e) => { if (K.id !== null && e.pointerId === K.id) stickUp(); });
		const press = { a: padA, b: padB, menu: () => { if (P.menu) closeMenu(); else openField(); }, moves: () => { if (P.menu) closeMenu(); openMoves(); }, bag: () => { if (P.menu) closeMenu(); openBag(); }, wait: () => { if (P.menu) closeMenu(); if (M.aim) endAim(false); act({ t: 'pass' }); } };
		for (const b of el.querySelectorAll('[data-pad]')) b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!M.S || !playing() || M.S.over) return; ctx.sfx.press(); press[b.dataset.pad](); });
		const b = el.querySelector('#mm-b');
		for (const n of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(n, () => { if (M.hold) { M.hold = false; if (M.S) draw(); } });
		return (M.pad = el);
	}
	/** A: pick in a menu, use the aim, else what Z does (attack, the stairs, a shop's item). */
	function padA() { if (P.menu) ctx.menuPick(); else if (M.aim) endAim(true); else { M.turn = false; confirm(); } }
	/** B: back out of a menu or an aim; otherwise, while it is held, the stick only turns the leader. */
	function padB() { if (P.menu) closeMenu(); else if (M.aim) endAim(false); else { M.hold = true; draw(); } }
	function drawPad() {
		const on = !!M.S && playing() && !M.S.over && isTouch();
		document.body.classList.toggle('pt-mm-touch', on);
		if (!on) { if (M.pad) { M.pad.hidden = true; if (stk().id !== null) stickUp(); M.hold = false; } return; }
		const el = pad();
		el.hidden = false;
		const a = el.querySelector('#mm-a'), say = P.menu ? 'OK' : M.aim ? 'USE' : underfoot() === 'Attack' ? 'A' : underfoot().toUpperCase();
		if (a.textContent !== say) a.textContent = say;
		a.classList.toggle('is-word', say.length > 2);
	}
	// ---- the first run's coach: a row in the bar, one step at a time, ticked off by doing it
	const coachSeen = () => { try { return localStorage.getItem(COACH_KEY) === 'done'; } catch { return true; } };
	const coachDone = () => { M.coach = null; try { localStorage.setItem(COACH_KEY, 'done'); } catch { /* shown again next time */ } };
	function coachRow() {
		if (!playing() || M.coach == null || M.S.over) return '';
		while (M.coach < COACH.length && COACH[M.coach].done(M.S, M)) M.coach++;
		if (M.coach >= COACH.length) { coachDone(); return '<div class="pt-mm-coach" id="mm-coach"><span class="bal-badge bal-green">✓</span><span>That is the maze. Remember: a figurine that faints is <b>gone for good</b>.</span></div>'; }
		const c = COACH[M.coach];
		return `<div class="pt-mm-coach" id="mm-coach"><span class="bal-badge bal-orange">${M.coach + 1}/${COACH.length}</span><span>${isTouch() ? c.touch : c.key}</span><button class="bal-btn bal-sm bal-grey" data-act="coach-skip">Skip</button></div>`;
	}
	// ---- the bar folds to one line (owner, 2026-11-23: "minimizable/collapsable to reduce how cluttered the screen is")
	const barSmall = () => { if (M.small == null) { try { M.small = localStorage.getItem(BAR_KEY) === 'small'; } catch { M.small = false; } } return M.small; };
	function foldBar(to) {
		M.small = to == null ? !barSmall() : !!to;
		try { localStorage.setItem(BAR_KEY, M.small ? 'small' : 'full'); } catch { /* for this visit only */ }
		if (M.S) drawBar();
	}
	function drawBar() {
		drawPad();
		const v = M.view || MM.view(M.S), el = bar(), u = L();
		const key = (k) => `<span class="bal-key">${k}</span>`;
		const controls = playing() ? `<button class="bal-btn bal-sm bal-red" data-act="attack">${underfoot()} ${key('Z')}</button><button class="bal-btn bal-sm bal-blue" data-act="moves">Moves ${key('C')}</button><button class="bal-btn bal-sm bal-purple" data-act="bag">Bag ${key('V')}</button><button class="bal-btn bal-sm bal-grey" data-act="wait">Wait</button><button class="bal-btn bal-sm bal-grey" data-act="menu">Menu</button>`
			: M.mode === 'watch' ? `<button class="bal-btn bal-sm bal-grey" data-act="w-start" aria-label="Back to the start">⏮ ${key('X')}</button><button class="bal-btn bal-sm bal-blue" data-act="w-prev" aria-label="The floor before">◀</button><button class="bal-btn bal-sm bal-orange" data-act="w-play">${M.ended ? '↺ Again' : M.paused ? '▶ Play' : '⏸ Pause'} ${key('Z')}</button><button class="bal-btn bal-sm bal-blue" data-act="w-next" aria-label="The floor after">▶</button><button class="bal-btn bal-sm bal-blue" data-act="w-speed">${M.speed}× ${key('C')}</button><button class="bal-btn bal-sm bal-grey" data-act="w-clip">Link ${key('V')}</button><span class="bal-muted" id="mm-prog">${M.drv ? M.drv.k : 0}/${M.rec ? M.rec.n : 0}</span>`
				: `<span class="bal-muted" id="mm-follow">${esc(M.say || 'Watching live')}</span>`;
		const tagsOf = (x) => [x.status && ((STATUS_SHOW[x.status] || [''])[0] + x.status.toUpperCase()), x.confused && 'CONF', x.nap && 'ASLEEP', x.haste && 'FAST', x.slow && 'SLOW', x.sealed && 'SEAL'].filter(Boolean).map((t) => ' <i>' + t + '</i>').join('');
		// (SCREENS THAT READ AT A GLANCE, Plans/POKETACTICA_MODES_PLAN.md A2/A3: each of the party is a name, its HP as a number AND as a bar
		// that turns amber at half and red at a quarter; the leader's is ringed)
		const hpBar = (x) => { const f = Math.max(0, Math.min(1, x.hp / Math.max(1, x.maxHP))); return `<span class="pt-mm-hp${f <= 0.25 ? ' is-red' : f <= 0.5 ? ' is-amber' : ''}" aria-hidden="true"><span style="width:${Math.round(f * 100)}%"></span></span>`; };
		const party = v.units.filter((x) => x.side === 'p').map((x) => `<span class="pt-mm-chip${x.uid === v.leader ? ' is-lead' : ''}" data-uid="${x.uid}"><span class="pt-mm-who">${tagsOf(x).trim()} ${esc(nameOf(x.species))} <b>${x.hp}</b>/${x.maxHP}</span>${hpBar(x)}</span>`).join('');
		const small = barSmall(), lead = v.units.find((x) => x.uid === v.leader), hurt = v.units.filter((x) => x.side === 'p' && x.uid !== v.leader && x.hp * 2 <= x.maxHP).length;
		const fold = `<button class="bal-btn bal-sm bal-grey pt-mm-fold" data-act="fold" aria-expanded="${!small}" aria-label="${small ? 'Show the whole bar' : 'Fold the bar to one line'}">${small ? '▾' : '▴'}</button>`;
		// (folded: one line. The floor, the belly, the leader's HP, a mark if a partner is at half HP or less; the coach still shows)
		const sky = v.weather ? `<span class="bal-badge bal-grey" id="mm-sky" title="${esc(WEATHER_SAY[v.weather] || '')}">${{ rain: '☔', sun: '☀', hail: '❄', sand: '🌪' }[v.weather] || ''}${small ? '' : ' ' + esc(WEATHER_NAME[v.weather] || v.weather)}</span>` : '';
		const sp = v.special ? `<span class="bal-badge bal-gold" id="mm-special" title="${esc(SPECIAL_SAY[v.special] || '')}">${{ vault: '★', locked: '🔒', sleepers: '💤' }[v.special] || ''}${small ? '' : ' ' + esc(SPECIAL_NAME[v.special] || v.special)}</span>` : '';
		const html = small ? `<div class="pt-mm-row pt-mm-small"><span class="bal-badge bal-blue" id="mm-floor">B${v.floor}F</span>${sp}${sky}<span class="bal-badge ${v.belly <= 20 ? 'bal-red' : 'bal-green'}" id="mm-belly">🍎 ${v.belly}</span>${lead ? `<span class="pt-mm-chip is-lead" data-uid="${lead.uid}">${esc(nameOf(lead.species))} <b>${lead.hp}</b>/${lead.maxHP}${tagsOf(lead)}</span>` : ''}${v.owed ? `<span class="bal-badge bal-orange" id="mm-owed">owe ${v.owed}</span>` : ''}${hurt ? `<span class="bal-badge bal-red" id="mm-hurt" title="Partners at half HP or less">♥ ${hurt}</span>` : ''}${fold}</div>${coachRow()}${playing() ? '' : `<div class="pt-mm-row">${controls}</div>`}`
			: `<div class="pt-mm-row pt-mm-top"><span class="bal-badge bal-blue" id="mm-floor" title="${esc(v.dungeon)}">${isTouch() ? '' : esc(v.dungeon) + ' · '}B${v.floor}F</span>${sp}${sky}<span class="bal-badge ${v.belly <= 20 ? 'bal-red' : 'bal-green'}" id="mm-belly">🍎 ${v.belly}</span><span class="bal-badge bal-gold" id="mm-stars">★ ${v.stars}</span><span class="bal-badge bal-purple" id="mm-bagn">🎒 ${v.bag.length}/20</span>${v.owed ? `<span class="bal-badge bal-orange" id="mm-owed">owe ${v.owed}</span>` : ''}${u ? `<span class="bal-badge bal-grey" id="mm-sp">SP ${u.sp}/${u.maxSP}</span>` : ''}${fold}</div>
			<div class="pt-mm-row" id="mm-party">${party}</div>
			${coachRow()}<div class="pt-mm-msg" id="mm-msg">${M.msgs.map((m, i) => `<span class="pt-mm-say${i === M.msgs.length - 1 ? ' is-new' : ''}">${esc(m)}</span>`).join('<br>')}</div>
			${playing() && isTouch() ? '' : `<div class="pt-mm-row">${controls}</div>`}`;
		if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
		el.hidden = !!P.menu && !(playing() && isTouch());   // (a menu takes the bar's place while it is open; on touch the bar is at the top, out of its way)
		M.mini.hidden = false;
		// (on touch the minimap and the menu buttons hang under the bar, however tall the party makes it)
		if (document.body.classList.contains('pt-mm-touch') && !el.hidden) document.body.style.setProperty('--mm-under', Math.round(el.getBoundingClientRect().bottom + 8) + 'px');
		minimap(v);
	}
	/** What Z does where the leader stands. */
	function underfoot() {
		const S = M.S, u = L();
		if (!u) return 'Attack';
		if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) return 'Stairs';
		if (S.items.some((o) => o.shop && o.x === u.x && o.y === u.y)) return 'Take';
		return 'Attack';
	}
	function minimap(v) {
		const c = M.mini; if (!c) return;
		const g = c.getContext('2d'), k = 2;
		g.clearRect(0, 0, c.width, c.height);
		for (let i = 0; i < v.tiles.length; i++) {
			const t = v.tiles[i]; if (t <= 0) continue;
			g.fillStyle = t === 1 ? '#8f8a7c' : v.water ? '#4a8fe0' : '#e07a3a';
			g.fillRect((i % v.w) * k, Math.floor(i / v.w) * k, k, k);
		}
		const dot = (x, y, col) => { g.fillStyle = col; g.fillRect(x * k - 1, y * k - 1, k + 2, k + 2); };
		for (const o of v.items) dot(o.x, o.y, '#5fe08a');
		for (const t of v.traps) dot(t.x, t.y, '#c070ff');
		if (v.stairs) dot(v.stairs[0], v.stairs[1], '#ffd23c');
		for (const i of v.locks || []) dot(i % v.w, Math.floor(i / v.w), '#c9a227');
		for (const u of v.units) dot(u.x, u.y, u.uid === v.leader ? '#ffffff' : u.side === 'p' ? '#9be7ff' : u.keeper && !u.hostile ? '#ffb36b' : '#ff5a5a');
		M.mapV = v; mapBig();
	}
	/**
	 * THE BIG MAP SAYS WHAT IS ON IT (plan item M8; the screens pass: "Screens are hard to read"). The minimap was dots of
	 * ten colours, and what each meant was three presses away in the menu. Made big, it now names the stairs, the shop and a
	 * locked door on the map itself, and under it stands a key of the colours THIS floor shows now. A tap on either closes it.
	 */
	function mapBig() {
		const c = M.mini, v = M.mapV; if (!c || !M.mapKey) return;
		const on = !c.hidden && c.classList.contains('is-big') && !!v;
		M.mapLab.hidden = M.mapKey.hidden = !on;
		if (!on) return;
		const r = c.getBoundingClientRect(), w = Math.min(336, innerWidth - 20), h = Math.round(w * c.height / c.width);
		Object.assign(M.mapLab.style, { left: r.left + 'px', top: r.top + 'px', width: w + 'px', height: h + 'px' });
		Object.assign(M.mapKey.style, { left: r.left + 'px', top: Math.round(r.top + h + 8) + 'px', width: w + 'px' });
		const at = (x, y, text, col) => `<span style="left:${Math.max(12, Math.min(88, 100 * (x + 0.5) / v.w)).toFixed(1)}%;top:${(100 * (y + 0.5) / v.h).toFixed(1)}%;color:${col}"${100 * (y + 0.5) / v.h < 22 ? ' class="is-under"' : ''}>${text}</span>`;
		const keeper = v.units.find((u) => u.keeper && !u.hostile), lock = (v.locks || [])[0];
		const lab = (v.stairs ? at(v.stairs[0], v.stairs[1], '▼ Stairs', '#ffd23c') : '') + (keeper ? at(keeper.x, keeper.y, 'Shop', '#ffb36b') : '') + (lock != null ? at(lock % v.w, Math.floor(lock / v.w), 'Locked', '#e9c84a') : '');
		if (M.mapLab.dataset.h !== lab) { M.mapLab.innerHTML = lab; M.mapLab.dataset.h = lab; }
		const has = { 'You (the leader)': true, 'Your partners': v.units.some((u) => u.side === 'p' && u.uid !== v.leader), 'Wild Pokémon': v.units.some((u) => u.side !== 'p' && !(u.keeper && !u.hostile)), 'A shopkeeper': !!keeper,
			'The stairs': !!v.stairs, 'An item': v.items.length > 0, 'A trap you have found': v.traps.length > 0, 'A locked door': lock != null, 'Floor you have seen': true, Water: !!v.water && v.tiles.some((t) => t > 1), Lava: !v.water && v.tiles.some((t) => t > 1) };
		const key = MAP_KEY.filter(([, t]) => has[t]).map(([col, t]) => `<span class="pt-mm-keyrow"><span class="pt-mm-key" style="background:${col}"></span>${esc(t.replace(/^(The|An|A|Your) /, '').replace(/^./, (ch) => ch.toUpperCase()).replace(' (the leader)', '').replace(' you have found', '').replace(' you have seen', ' seen'))}</span>`).join('')
			+ `<span class="pt-mm-keyclose">${v.stairs ? '' : 'The stairs are not found yet. '}${isTouch() ? 'Tap' : 'Click'} the map to close it.</span>`;
		if (M.mapKey.dataset.h !== key) { M.mapKey.innerHTML = key; M.mapKey.dataset.h = key; }
	}
	/** Highlights: the stairs, items and shown traps on the ground; while aiming, where the move can go and what it would cover. */
	function draw() {
		const S = M.S, F = S.F, extra = [];
		const si = F.stairs[1] * F.w + F.stairs[0];
		if (S.seen[si]) extra.push([F.stairs[0], F.stairs[1], 0xffd23c]);
		for (const o of S.items) if (S.seen[o.y * F.w + o.x]) extra.push([o.x, o.y, o.shop ? 0xffa23c : 0x5fe08a]);
		for (const t of S.traps) if (t.seen) extra.push([t.x, t.y, 0xb04cff]);
		for (const i of F.locks || []) if (S.seen[i]) extra.push([i % F.w, Math.floor(i / F.w), 0xc9a227]);
		// what stands on those tiles, said on the board itself
		const marks = [];
		if (S.seen[si]) marks.push({ x: F.stairs[0], y: F.stairs[1], text: '▼', color: '#ffd23c', sub: 'stairs' });
		for (const o of S.items) if (S.seen[o.y * F.w + o.x] && !MM.unitAt(S, o.x, o.y)) marks.push(o.shop ? { x: o.x, y: o.y, text: '◆', color: '#ffa23c', sub: o.price + '★' } : o.id === 'stars' ? { x: o.x, y: o.y, text: '★', color: '#ffd23c', sub: 'stars' } : { x: o.x, y: o.y, text: '◆', color: '#5fe08a', sub: 'item' });
		for (const t of S.traps) if (t.seen && !MM.unitAt(S, t.x, t.y)) marks.push({ x: t.x, y: t.y, text: '✖', color: '#c070ff', sub: t.kind === 'wonder' ? 'wonder' : 'trap' });
		for (const i of F.locks || []) if (S.seen[i]) marks.push({ x: i % F.w, y: Math.floor(i / F.w), text: '', color: '#ffd23c', sub: 'locked' });   // (the door itself is drawn: its word alone stands over it)
		for (const o of S.units) if (o.boss && o.hp > 0 && (S.lit || P.disp.units[o.uid])) marks.push({ x: o.x, y: o.y, text: '', color: '#ff5a5a', sub: 'BOSS' });
		P.marks = marks;
		const hl = { extra };
		if (M.aim) { hl.aim = M.aim.aims; hl.area = M.aim.cover(M.aim.aims[M.aim.i]); P.cursor = { x: M.aim.aims[M.aim.i][0], y: M.aim.aims[M.aim.i][1] }; }
		P.hl = hl;
		ctx.rebuildOverlay();
		drawBar();
		const u = L();
		$('hint').innerHTML = S.over || !u || !playing() ? '' : M.aim ? (isTouch() ? `<b>${esc(M.aim.title)}</b> · stick: aim · A: use · B: back` : `<b>${esc(M.aim.title)}</b> · arrows: aim · Z: use · X: back`) : M.hold ? 'Turning: push the stick the way to face' : M.turn ? (isTouch() ? 'Push the stick the way to face · B: never mind' : 'Press a direction to turn that way · X: never mind') : M.rest ? 'Resting… any press stops' : hintHere(u);
	}
	function hintHere(u) {
		const S = M.S, here = S.items.find((o) => o.x === u.x && o.y === u.y);
		const tc = isTouch();
		if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) return 'The stairs · ' + (tc ? 'A' : 'Z') + ': go down';
		if (here && here.shop) return `<b>${esc(nm(here))}</b> · ${here.price} stars · ${tc ? 'A' : 'Z'}: take it`;
		if (S.owed) return `You owe ${S.owed} stars · ${tc ? 'MENU' : 'Enter'}: pay · leaving the carpet unpaid is theft`;
		return '';
	}

	// ---- stepping
	const dirOf = (v) => DIR8.findIndex(([dx, dy]) => dx === v[0] && dy === v[1]);
	/** Would this step carry the leader, owing, off the shop's carpet? (mm/turn.js: that is theft, and the keeper comes.) */
	const wouldSteal = (S, u, d) => S.owed > 0 && !S.thief && !!(S.F.terrain[u.y * S.F.w + u.x] & T_SHOP) && !(S.F.terrain[(u.y + DIR8[d][1]) * S.F.w + u.x + DIR8[d][0]] & T_SHOP) && !MM.actBlock(S, { t: 'step', d }, data);
	function go(v) {
		const d = dirOf(v), S = M.S, u = L();
		if (d < 0 || !u || S.over) return;
		if (M.aim) { aimMove(v); return; }
		M.auto = null; M.rest = null;
		const ahead = MM.unitAt(S, u.x + v[0], u.y + v[1]);   // (a foe there is struck, not stepped onto; a partner swaps places: that IS leaving)
		if (!M.turn && u.confused <= 0 && !(ahead && isFoe(u, ahead)) && wouldSteal(S, u, d)) {
			menu([{ label: 'Stay <small>pay, or put things back</small>', color: 'bal-green', go: closeMenu }, { label: `Leave without paying <small>you owe ${S.owed} ★: the shopkeeper will come for you</small>`, color: 'bal-red', go: () => { closeMenu(); act({ t: 'step', d }, true); } }], `Leave the shop without paying? You owe ${S.owed} ★.`);
			return;
		}
		if (M.turn) { M.turn = false; act({ t: 'face', d }, true); return; }
		const o = MM.unitAt(S, u.x + v[0], u.y + v[1]);
		if (o && isFoe(u, o)) { if (u.dir !== d) act({ t: 'face', d }, true); act({ t: 'attack' }); return; }
		if (!act({ t: 'step', d }, true) && u.dir !== d) act({ t: 'face', d }, true);   // (a wall: just turn)
	}
	/** A direction pressed: wait a moment for a second one, and step between the two. */
	function dirInput(v) {
		if (M.chord) {
			clearTimeout(M.chord.t);
			const a = M.chord.v; M.chord = null;
			const sum = [Math.sign(a[0] + v[0]), Math.sign(a[1] + v[1])];
			if (sum[0] || sum[1]) go(sum);
			return;
		}
		M.chord = { v, t: setTimeout(() => { const c = M.chord; M.chord = null; if (c) go(c.v); }, CHORD_MS) };
	}
	/** Walking to a far tile, a step at a time: it stops the moment a foe comes into view or anything else happens. */
	function autoStep() {
		const A = M.auto, S = M.S, u = L();
		if (!A || !u || S.over || P.menu || M.aim) { M.auto = null; return; }
		const foes = () => S.units.filter((o) => isFoe(u, o) && P.disp.units[o.uid]).length;
		const dist = MM.walkMap(S.F, u, A.x, A.y), here = dist[u.y * S.F.w + u.x];
		if (here <= 0 || foes() > A.foes) { M.auto = null; return; }
		const d = [0, 1, 2, 3, 4, 5, 6, 7].find((k) => MM.canWalk(S.F, u, k) && dist[(u.y + DIR8[k][1]) * S.F.w + u.x + DIR8[k][0]] === here - 1 && !MM.actBlock(S, { t: 'step', d: k }, data));
		const hp = u.hp;
		if (d != null && wouldSteal(S, u, d)) { M.auto = null; ctx.toast('You owe ' + S.owed + ' ★: pay before you leave the carpet'); return; }
		if (d == null || !act({ t: 'step', d }, true) || L() !== u || u.hp < hp || foes() > A.foes) M.auto = null;
	}

	/** Resting (the field menu): a turn passes every moment until everyone is healed, a foe comes into view, someone is hurt,
	 *  the belly runs low or any button is pressed. */
	const REST_MAX = 400;
	function startRest() {
		const S = M.S, u = L(), foes = S.units.filter((o) => isFoe(u, o) && P.disp.units[o.uid]).length;
		if (foes) { ctx.sfx.error(); ctx.toast('Not with a foe in sight'); return; }
		if (MM.partyOf(S).every((p) => p.hp >= p.maxHP)) { ctx.toast('Everyone is at full HP'); return; }
		if (S.belly <= 0) { ctx.sfx.error(); ctx.toast('Not on an empty belly: resting heals nothing'); return; }
		M.turn = false; M.rest = { t: AUTO_S, n: 0, foes }; draw();
	}
	function restStep() {
		const R = M.rest, S = M.S, u = L();
		if (!R || !u || S.over || P.menu || M.aim) { M.rest = null; return; }
		const foes = () => S.units.filter((o) => isFoe(u, o) && P.disp.units[o.uid]).length, hp = MM.partyOf(S).reduce((a, p) => a + p.hp, 0);
		const stop = (why) => { M.rest = null; if (why) say(why); draw(); };
		if (!act({ t: 'pass' }, true) || L() !== u) return stop('');
		R.n++;
		if (foes() > R.foes) return stop('Something is coming: you stop resting.');
		if (MM.partyOf(S).reduce((a, p) => a + p.hp, 0) < hp) return stop('Hurt: you stop resting.');
		if (MM.partyOf(S).every((p) => p.hp >= p.maxHP)) return stop('Rested: everyone is at full HP (' + R.n + ' turns).');
		if (S.belly <= 200) return stop('Getting hungry: you stop resting.');
		if (R.n >= REST_MAX) return stop('You stop resting.');
	}

	// ---- aiming a move or a lobbed item
	function startAim(title, aims, cover, use, prefer) {
		if (!aims.length) { ctx.sfx.error(); ctx.toast('Nothing in reach'); return; }
		let i = prefer ? aims.findIndex(([x, y]) => prefer.some(([px, py]) => px === x && py === y)) : -1;
		if (i < 0) i = 0;
		M.aim = { title, aims, cover, use, i };
		P.mode = 'mm-aim';
		draw();
	}
	function aimMove(v) {
		const A = M.aim, [cx, cy] = A.aims[A.i];
		let best = -1, score = Infinity;
		A.aims.forEach(([x, y], k) => {
			const dx = x - cx, dy = y - cy, along = dx * v[0] + dy * v[1];
			if (k === A.i || along <= 0) return;
			const off = Math.abs(dx * v[1] - dy * v[0]), s = along + off * 2;
			if (s < score) { score = s; best = k; }
		});
		if (best >= 0) { A.i = best; ctx.sfx.tab && ctx.sfx.tab(); draw(); }
	}
	function endAim(use) {
		const A = M.aim; M.aim = null; P.mode = 'mm';
		if (use && A) A.use(A.aims[A.i]);
		else refresh();
	}

	// ---- menus (the battle's own command window)
	const closeMenu = () => { P.mode = 'mm'; ctx.setMenu(null); draw(); };
	const menu = (items, title) => { P.mode = 'mm-menu'; M.auto = null; M.rest = null; ctx.setMenu(items, title); if (M.bar) drawBar(); };
	function openMoves() {
		const S = M.S, u = L();
		const items = u.fig.equipped.map((id) => {
			const m = moveFor(u, id, data), why = (u.sealed || []).includes(id) ? 'It is sealed' : (u.pp[id] || 0) < 1 ? 'No PP left' : u.sp < m.spCost ? 'Not enough SP' : null;
			return { label: `${esc(moveName(id))} <small>${esc(m.type)} · PP ${u.pp[id] || 0} · SP ${m.spCost}</small>`, color: 'bal-blue', off: why, go: () => {
				ctx.setMenu(null);
				startAim(moveName(id), aimsOf(S.F, u, m), ([x, y]) => hitTiles8(S.F, m, u.x, u.y, x, y), ([x, y]) => act({ t: 'move', id, x, y }), aimsAtFoes(S, u, m));
			} };
		});
		items.push({ label: 'Attack <small>no cost · the tile in front</small>', color: 'bal-red', go: () => { closeMenu(); act({ t: 'attack' }); } });
		if (MM.partyOf(S).some((p) => spare(p).length)) items.push({ label: 'Change moves <small>takes a turn</small>', color: 'bal-purple', go: openChange });
		items.push({ label: 'Back', color: 'bal-grey', go: closeMenu });
		menu(items, `${nameOf(u.species)} · SP ${u.sp}/${u.maxSP}`);
	}
	// ---- change moves inside a run (MM_RULES_REV 13): a move it knows but does not have on, in place of one it has
	const spare = (p) => p.fig.pool.map((m) => m.id).filter((id) => !p.fig.equipped.includes(id) && data.moves[id] && data.shapes[id]);
	const moveSay = (p, id) => { const m = moveFor(p, id, data), d = data.moves[id] || {}; return `${esc(moveName(id))} <small>${esc(m ? m.type : d.type || '')}${d.category === 'Status' ? ' · status' : d.power ? ' · power ' + d.power : ''} · SP ${m ? m.spCost : '?'}</small>`; };
	function openChange() {
		const S = M.S, who = MM.partyOf(S).filter((p) => spare(p).length);
		if (who.length === 1) return openChangeOf(who[0].uid);
		menu([...who.map((p) => ({ label: `${esc(nameOf(p.species))} <small>Lv ${p.level} · ${spare(p).length} more known</small>`, color: 'bal-blue', go: () => openChangeOf(p.uid) })), { label: 'Back', color: 'bal-grey', go: openMoves }], 'Change whose moves?');
	}
	function openChangeOf(uid) {
		const p = MM.unit(M.S, uid);
		if (!p) return closeMenu();
		const slots = p.fig.equipped.map((id) => ({ label: `Take off ${moveSay(p, id)}`, color: 'bal-blue', go: () => openChangeTo(uid, id) }));
		if (p.fig.equipped.length < MM.MOVE_SLOTS) slots.push({ label: 'Empty slot <small>add a move</small>', color: 'bal-green', go: () => openChangeTo(uid, null) });
		menu([...slots, { label: 'Back', color: 'bal-grey', go: openMoves }], `${nameOf(p.species)}: which move goes?`);
	}
	function openChangeTo(uid, out) {
		const p = MM.unit(M.S, uid);
		if (!p) return closeMenu();
		const kept = p.ppKept || {};
		const items = spare(p).map((id) => ({ label: `${moveSay(p, id)}${id in kept ? ` <small>· PP ${kept[id]}</small>` : ''}`, color: 'bal-blue', go: () => { closeMenu(); act({ t: 'equip', uid, id, ...(out != null ? { out } : {}) }); } }));
		menu([...items, { label: 'Back', color: 'bal-grey', go: () => openChangeOf(uid) }], out != null ? `In place of ${moveName(out)}` : 'Which move?');
	}
	function openBag() {
		const S = M.S;
		if (!S.bag.length) { ctx.toast('The bag is empty'); return; }
		const items = S.bag.map((it, slot) => ({ label: `${goodIconImg(iconIn(S, it))} ${esc(nm(it))}${it.sticky ? ' <small>sticky</small>' : ''}${it.unpaid ? ` <small>unpaid · ${it.unpaid}★</small>` : ''}`, color: it.sticky ? 'bal-grey' : 'bal-purple', go: () => openItem(slot) }));
		items.push({ label: 'Back', color: 'bal-grey', go: closeMenu });
		menu(items, `Bag ${S.bag.length}/20`);
	}
	function openItem(slot) {
		const S = M.S, it = S.bag[slot], d = ITEMS[it.id] || {}, u = L(), items = [];
		const onCarpet = !!(S.F.terrain[u.y * S.F.w + u.x] & T_SHOP);
		// (a Lesson Slate, plan item M5: what it would teach is said before it is read; with every slot full, which move makes way)
		const reads = (who, a) => { const eq = who.fig.equipped || [], id = MM.nextLesson(S, who); if (eq.length < MM.MOVE_SLOTS) { closeMenu(); return act(a); }
			menu([...eq.map((m, i) => ({ label: `Forget ${esc(moveName(m))} <small>PP ${who.pp[m] || 0}</small>`, color: 'bal-orange', go: () => { closeMenu(); act({ ...a, forget: i }); } })), { label: 'Keep them all', color: 'bal-grey', go: () => openItem(slot) }], `${nameOf(who.species)} learns ${moveName(id)}: which move makes way?`); };
		if (d.teach) { const id = MM.nextLesson(S, u); items.push({ label: `Read <small>${id ? esc(nameOf(u.species)) + ' learns ' + esc(moveName(id)) + ' for this run' : esc(nameOf(u.species)) + ' has nothing left to learn'}</small>`, color: 'bal-green', off: it.sticky ? 'It is sticky' : !id && 'It has nothing left to learn', go: () => reads(u, { t: 'use', slot }) }); }
		else if (usable(it.id)) items.push({ label: 'Use', color: 'bal-green', off: it.sticky && 'It is sticky', go: () => { closeMenu(); act({ t: 'use', slot }); } });
		if (throwable(it.id) && !['orb', 'drink'].includes(d.group)) items.push({ label: d.arc ? 'Throw <small>at a tile</small>' : d.group === 'wand' ? 'Wave <small>the way you face · one charge</small>' : 'Throw <small>the way you face</small>', color: 'bal-orange', off: it.sticky && 'It is sticky', go: () => {
			ctx.setMenu(null);
			if (!d.arc) { P.mode = 'mm'; act({ t: 'throw', slot }); return; }
			const aims = [];
			for (let y = u.y - LOB_RANGE; y <= u.y + LOB_RANGE; y++) for (let x = u.x - LOB_RANGE; x <= u.x + LOB_RANGE; x++) if (!throwBlock(S, u, it, x, y)) aims.push([x, y]);
			startAim('Throw ' + nm({ id: it.id }), aims, (a) => [a], ([x, y]) => act({ t: 'throw', slot, x, y }), S.units.filter((o) => isFoe(u, o)).map((o) => [o.x, o.y]));
		} });
		if (it.unpaid) items.push({ label: 'Put back', color: 'bal-blue', off: !onCarpet && 'Stand on the shop\'s carpet', go: () => { closeMenu(); act({ t: 'putback', slot }); } });
		// (rules 16) the bag's own decisions: hand it to a partner, change it for what lies underfoot, put it down, sell it
		if (S.rev >= 16 && !it.unpaid) {
			const why = (a) => { const w = MM.actBlock(S, a, data); return w ? w[0].toUpperCase() + w.slice(1) : false; };
			const partners = MM.partyOf(S).filter((p) => p !== u), under = S.items.find((o) => o.x === u.x && o.y === u.y && !o.shop);
			if (partners.length && givable(it.id)) items.push({ label: 'Give <small>a partner takes it in · a turn</small>', color: 'bal-green', off: it.sticky && 'It is sticky', go: () => menu([...partners.map((p) => (d.teach ? { label: `${esc(nameOf(p.species))} <small>${MM.nextLesson(S, p) ? 'learns ' + esc(moveName(MM.nextLesson(S, p))) : 'nothing left to learn'}</small>`, color: 'bal-blue', off: !MM.nextLesson(S, p) && 'It has nothing left to learn', go: () => reads(p, { t: 'give', slot, uid: p.uid }) } : { label: `${esc(nameOf(p.species))} <small>HP ${p.hp}/${p.maxHP}${p.status ? ' · ' + p.status.toUpperCase() : ''}</small>`, color: 'bal-blue', go: () => { closeMenu(); act({ t: 'give', slot, uid: p.uid }); } })), { label: 'Back', color: 'bal-grey', go: () => openItem(slot) }], `Give ${nm({ id: it.id })} to…`) });
			if (under) items.push({ label: `Swap <small>for the ${esc(nm(under))} underfoot · a turn</small>`, color: 'bal-blue', off: why({ t: 'swap', slot }), go: () => { closeMenu(); act({ t: 'swap', slot }); } });
			else items.push({ label: 'Drop <small>put it down here · a turn</small>', color: 'bal-grey', off: why({ t: 'drop', slot }), go: () => { closeMenu(); act({ t: 'drop', slot }); } });
			if (onCarpet) items.push({ label: `Sell <small>${sellPrice(it)} ★, half its price</small>`, color: 'bal-gold', off: why({ t: 'sell', slot }), go: () => { closeMenu(); act({ t: 'sell', slot }); } });
		}
		items.push({ label: 'Back', color: 'bal-grey', go: openBag });
		menu(items, `${nm(it)} · ${noteIn(S, it)}`);
	}
	/** Tactics: the partners; then one partner's tactic, its order for moves and each of its moves on or off (rules 17). */
	function openTactics(focusUid) {
		const S = M.S, partners = MM.partyOf(S).filter((p) => p !== L());
		menu([...partners.map((p) => ({ label: `${esc(nameOf(p.species))} <small>${TACTIC_NAME[p.tactic]}${S.rev >= 17 ? ' · ' + PLAN_NAME[p.plan || 'any'] + ((p.off || []).length ? ' · ' + p.off.length + ' move' + (p.off.length === 1 ? '' : 's') + ' off' : '') : ''}</small>`, color: 'bal-blue', go: () => openPartner(p.uid) })), { label: 'Back', color: 'bal-grey', go: openField }], 'Tactics');
		const k = partners.findIndex((p) => p.uid === focusUid); if (k > 0) { P.menu.i = k; ctx.menuMove(0); }
	}
	function openPartner(uid, focus = 0) {
		const S = M.S, p = MM.partyOf(S).find((x) => x.uid === uid);
		if (!p) return openTactics();
		const free = (a, i) => { ctx.setMenu(null); P.mode = 'mm'; act(a); openPartner(uid, i); };   // (an order is free: the menu stays)
		const items = MM.TACTICS.map((t, i) => ({ label: TACTIC_NAME[t], color: t === p.tactic ? 'bal-green' : 'bal-blue', go: () => free({ t: 'tactic', uid, tactic: t }, i) }));
		if (S.rev >= 17) {
			const plans = ['any', 'save', 'attack'], cur = p.plan || 'any', n0 = items.length;
			items.push({ label: `Moves: ${PLAN_NAME[cur]} <small>${PLAN_SAY[cur]}</small>`, color: 'bal-purple', go: () => free({ t: 'plan', uid, plan: plans[(plans.indexOf(cur) + 1) % plans.length] }, n0) });
			p.fig.equipped.forEach((id, k) => { const off = (p.off || []).includes(id); items.push({ label: `${esc(moveName(id))} <small>${off ? 'off: it will not use it' : 'on'} · PP ${p.pp[id] || 0}</small>`, color: off ? 'bal-grey' : 'bal-orange', go: () => free({ t: 'moveoff', uid, id, off: !off }, n0 + 1 + k) }); });
		}
		items.push({ label: 'Back', color: 'bal-grey', go: () => openTactics(uid) });
		menu(items, `${nameOf(p.species)} · Lv ${p.level} · HP ${p.hp}/${p.maxHP}`);
		if (focus > 0) { P.menu.i = Math.min(focus, items.length - 1); ctx.menuMove(0); }
	}
	/** LOOK (improvement plan, 2026-11-25: nothing on the floor could be asked what it is): pick something in sight, read about it. */
	function lookAt() {
		const S = M.S, F = S.F, u = L(), vis = new Set(MM.sightNow(S)), seen = (x, y) => S.lit || vis.has(y * F.w + x), out = [];
		for (const o of S.units) if (o.hp > 0 && o !== u && (o.side === 'p' || seen(o.x, o.y))) out.push([o.x, o.y]);
		for (const t of S.traps) if (t.seen && S.seen[t.y * F.w + t.x]) out.push([t.x, t.y]);
		for (const it of S.items) if (S.seen[it.y * F.w + it.x]) out.push([it.x, it.y]);
		if (S.seen[F.stairs[1] * F.w + F.stairs[0]]) out.push([F.stairs[0], F.stairs[1]]);
		const key = new Set(); return out.filter(([x, y]) => (key.has(x + ',' + y) ? false : key.add(x + ',' + y))).sort((a, b) => cheb(u.x, u.y, a[0], a[1]) - cheb(u.x, u.y, b[0], b[1]));
	}
	function startLook() {
		const aims = lookAt();
		if (!aims.length) { ctx.toast('Nothing to look at yet'); return; }
		startAim('Look', aims, (a) => [a], ([x, y]) => openLook(x, y), aims.slice(0, 1));
	}
	function openLook(x, y) {
		const S = M.S, F = S.F, rows = [], line = (html, color = 'bal-grey') => rows.push({ label: html, color, go: () => {} });
		const o = S.units.find((v) => v.hp > 0 && v.x === x && v.y === y), tr = S.traps.find((t) => t.seen && t.x === x && t.y === y), it = S.items.find((i) => i.x === x && i.y === y);
		let title = 'Nothing there';
		if (o) {
			const sp = data.species[o.species] || {};
			title = `${nameOf(o.species)} · Lv ${o.level}`;
			line(`<b>${o.side === 'p' ? 'Your partner' : o.boss ? 'The boss' : o.keeper ? (o.hostile ? 'An angry shopkeeper' : 'The shopkeeper') : 'A wild Pokémon'}</b> <small>${esc((sp.types || o.types || []).join(' / '))}</small>`, o.side === 'p' ? 'bal-blue' : 'bal-red');
			line(`HP ${o.hp} / ${o.maxHP}${o.status ? ' · ' + statusShow(o.status) : ''}${o.nap ? ' · asleep' : ''}${o.stone ? ' · turned to stone' : ''}${o.confused > 0 ? ' · confused' : ''}`);
			if (o.side === 'p') {
				line(`${TACTIC_NAME[o.tactic] || ''}${S.rev >= 17 ? ' · moves: ' + PLAN_NAME[o.plan || 'any'] : ''}`);
				for (const id of o.fig.equipped) line(`${esc(moveName(id))} <small>PP ${o.pp[id] || 0}${(o.off || []).includes(id) ? ' · off' : ''}${(o.sealed || []).includes(id) ? ' · sealed' : ''}</small>`, 'bal-orange');
				if (o.heldId) line(`Holds ${esc(o.heldId)}`);
			} else if (o.ability) line(`Ability: ${esc(((data.abilities && data.abilities.names && data.abilities.names[o.ability]) || o.ability))}`);
		}
		if (tr) { if (!o) title = TRAPS[tr.kind].name; line(`<b>${esc(TRAPS[tr.kind].name)}</b> <small>${esc(TRAPS[tr.kind].note)}</small>`, 'bal-purple'); }
		if (it) { const d = ITEMS[it.id] || {}; if (!o && !tr) title = nm(it); line(`${goodIconImg(iconIn(S, it))} <b>${esc(nm(it))}</b> <small>${esc(noteIn(S, it))}${it.shop ? ' · for sale: ' + it.price + ' ★' : ''}</small>`, 'bal-green'); }
		if (x === F.stairs[0] && y === F.stairs[1]) { if (!rows.length) title = 'The stairs'; line(`<b>The stairs</b> <small>${S.floorNo >= MM.lastFloor(S.dungeon) ? 'the way out' : 'down to B' + (S.floorNo + 1) + 'F'}</small>`, 'bal-gold'); }
		rows.push({ label: 'Look at something else', color: 'bal-blue', go: () => { closeMenu(); startLook(); } }, { label: 'Close', color: 'bal-grey', go: closeMenu });
		menu(rows, title);
		P.menu.i = rows.length - 2; ctx.menuMove(0);
	}
	/** The run's messages, the newest first (the bar only ever shows three). */
	function openMessages() {
		const list = (M.hist || []).slice().reverse();
		const items = list.map((t) => (t[0] === '—' ? { label: `<b>${esc(t)}</b>`, color: 'bal-blue', go: () => {} } : { label: `<span class="pt-mm-line">${esc(t)}</span>`, color: 'bal-grey', go: () => {} }));
		items.unshift({ label: 'Back', color: 'bal-green', go: openField });
		menu(items, list.length ? 'Messages · the newest first' : 'Messages · nothing yet');
	}
	/** What the minimap's colours mean. */
	function openLegend() {
		const lava = M.S && M.S.F && M.S.F.water === false;
		const rows = MAP_KEY.filter(([, t]) => (t === 'Water' ? !lava : t === 'Lava' ? lava : true));
		menu([...rows.map(([col, t]) => ({ label: `<span class="pt-mm-key" style="background:${col}"></span>${esc(t)}`, color: 'bal-grey', go: () => {} })), { label: 'Back', color: 'bal-green', go: openField }], 'The minimap');
		P.menu.i = rows.length; ctx.menuMove(0);
	}
	function openField() {
		const S = M.S, u = L(), onStairs = u.x === S.F.stairs[0] && u.y === S.F.stairs[1];
		const items = [{ label: 'Wait a turn', color: 'bal-green', go: () => { closeMenu(); act({ t: 'pass' }); } }];
		items.push({ label: 'Rest <small>turns pass until everyone is healed, or something comes</small>', color: 'bal-green', go: () => { closeMenu(); startRest(); } });
		items.push({ label: barSmall() ? 'Show the whole bar' : 'Fold the bar <small>to one line</small>', color: 'bal-grey', go: () => { closeMenu(); foldBar(); } });
		if (onStairs) items.push({ label: 'Go down the stairs', color: 'bal-gold', go: () => { closeMenu(); act({ t: 'stairs' }); } });
		if (S.owed) items.push({ label: `Pay <small>${S.owed} of your ${S.stars} stars</small>`, color: 'bal-gold', off: S.stars < S.owed && 'Not enough stars', go: () => { closeMenu(); act({ t: 'pay' }); } });
		items.push({ label: 'Turn on the spot <small>then a direction</small>', color: 'bal-blue', go: () => { closeMenu(); M.turn = true; draw(); } });
		const partners = MM.partyOf(S).filter((p) => p !== u);
		if (partners.length) items.push({ label: 'Tactics <small>where they stand, and how they use their moves</small>', color: 'bal-blue', go: () => openTactics() });
		items.push({ label: 'Look <small>what is that?</small>', color: 'bal-blue', go: () => { closeMenu(); startLook(); } });
		items.push({ label: `Messages <small>${(M.hist || []).filter((t) => t[0] !== '—').length ? 'what has happened this run' : 'nothing yet'}</small>`, color: 'bal-grey', go: openMessages });
		items.push({ label: 'Map legend <small>what the minimap\'s colours mean</small>', color: 'bal-grey', go: openLegend });
		if (ctx.help) items.push({ label: 'How to play', color: 'bal-grey', go: () => { closeMenu(); ctx.help(); } });
		const carried = [M.stars ? M.stars + ' ★' : '', M.bag.length ? M.bag.length + ' item' + (M.bag.length === 1 ? '' : 's') : ''].filter(Boolean).join(', ');
		items.push({ label: 'Give up <small>leave with nothing: not what you found, not what you carried in</small>', color: 'bal-red', go: () => menu([{ label: 'Keep going', color: 'bal-green', go: closeMenu }, { label: 'Give up', color: 'bal-red', go: () => { closeMenu(); act({ t: 'quit' }); } },
			// (a dive into an item: a Pull Cord leaves now and keeps the floors cleared; the page banks it)
			...(M.dungeon.iw && ctx.cords && ctx.cords() ? [{ label: `Use a Pull Cord <small>leave now: ${S.floorNo > 1 ? 'keep the ' + (S.floorNo - 1) + ' floor' + (S.floorNo === 2 ? '' : 's') + ' cleared' : 'no floor is cleared yet'} · you have ${ctx.cords()}</small>`, color: 'bal-gold', off: S.floorNo <= 1 && 'No floor of this dive is cleared yet: there is nothing to keep', go: () => { closeMenu(); if (ctx.pull(S.floorNo)) act({ t: 'quit' }); else ctx.toast('No Pull Cord'); } }] : [])], 'Give up? Everything found on this run is lost' + (carried ? ', and so is what you carried in (' + carried + ').' : '.')) });
		items.push({ label: 'Close', color: 'bal-grey', go: closeMenu });
		menu(items, `${M.dungeon.name} · B${S.floorNo}F · turn ${S.turns}`);
	}
	/** Z: the stairs (asked first), a shop's item underfoot, or the plain Attack. */
	function confirm() {
		const S = M.S, u = L();
		if (u.x === S.F.stairs[0] && u.y === S.F.stairs[1]) { menu([{ label: S.floorNo >= MM.lastFloor(S.dungeon) ? 'Take the stairs out' : 'Go down', color: 'bal-gold', go: () => { closeMenu(); act({ t: 'stairs' }); } }, { label: 'Stay', color: 'bal-grey', go: closeMenu }], 'The stairs'); return; }
		if (S.items.some((o) => o.shop && o.x === u.x && o.y === u.y)) { act({ t: 'take' }); return; }
		act({ t: 'attack' });
	}

	// ---- the end of a run
	function over() {
		if (M.shownOver) return;
		M.shownOver = true;
		ctx.setMenu(null); P.mode = 'mm'; M.aim = null; M.auto = null;
		draw();
		drawPad();
		if (!playing()) return;
		save();
		ctx.onOver({ S: M.S, dungeon: M.dungeon, seed: M.seed, party: M.party, acts: M.acts, recipe: recipe() });
	}

	// ---- in and out
	function enter(mode, d) {
		Object.assign(M, { mode, dungeon: d, coach: null, acts: [], msgs: [], hist: [], tw: {}, pos: {}, aim: null, auto: null, turn: false, shownOver: false, buried: 0, seenN: -1, drv: null, rec: null, speed: 1, paused: false, acc: 0, ended: false, view: null });
		P.screen = 'mm'; P.mode = 'mm'; P.menu = null; P.sel = null;
		P.setup = null; P.actions = []; P.anims = []; P.busy = false; P.teamMap = null; P.online = null; P.disp = null;
		document.body.classList.add('pt-mming');
		$('result').hidden = true;
	}
	function show() {
		board();
		const u = L();
		if (u) P.cursor = { x: u.x, y: u.y };
		ctx.placeCam(); ctx.setZoom(zoomNow()); ctx.follow(true);
		sync(); draw();
	}
	/** A new run: a dungeon (or its id), the figurines going in (the first leads). opts: { seed, bag, stars } */
	function open(dungeon, party, opts = {}) {
		const d = typeof dungeon === 'string' ? dungeonById(dungeon) : dungeon;
		if (!d || !party.length) return false;
		enter('play', d);
		// (the run uses the figurines as a recipe keeps them, so the live run and its replay are the very same run)
		Object.assign(M, { seed: opts.seed || 'mm-' + Date.now().toString(36), party: party.slice(0, d.party || 4).map(mmFig), bag: (opts.bag || []).map((it) => ({ ...it })), stars: opts.stars | 0 });
		M.S = MM.newRun(M.seed, { dungeon: d, party: M.party, bag: M.bag, stars: M.stars }, data);
		M.coach = opts.coach === false || coachSeen() ? null : 0;   // (the first run on this device is coached)
		show();
		play(M.S.ev);
		sync(); draw();
		ctx.banner(`${d.name} · B1F`);
		save();
		broadcast();
		return true;
	}
	/** A run saved on this device (a reload, a locked phone): its actions re-run, and there you are. */
	function resume(saved) {
		const rec = saved && saved.recipe, d = rec && dungeonById(rec.dungeon);
		if (!d) return false;
		enter('play', d);
		Object.assign(M, { seed: rec.seed, party: rec.party, bag: rec.bag, stars: rec.stars });
		M.S = mmRunTo(rec, null, data);
		M.acts = unpackActs(rec.acts) || [];
		M.buried = M.S.fallen.length;   // (they were buried when they fell)
		show();
		ctx.banner(`Resumed · ${d.name} · B${M.S.floorNo}F`);
		save();
		broadcast();
		if (M.S.over) over();
		return true;
	}
	/** A signed-in player's run goes live for friends: what the player sees, and nothing more. */
	function broadcast() {
		if (!ctx.live) return;
		ctx.live(() => (M.S && playing() ? { mm: 1, view: MM.view(M.S), msgs: M.msgs, over: M.S.over } : null),
			() => 'Poketactica · Mystery Maze · ' + M.dungeon.name + ' · B' + (M.S ? M.S.floorNo : 1) + 'F',
			// (a bet: does this run clear the dungeon? the endless one: does it beat the record?)
			() => (M.S && playing() ? { run: M.seed, prog: M.S.floorNo, res: M.S.over ? (M.S.over.won || (M.dungeon.endless && M.S.floorNo > (ctx.best ? ctx.best(M.dungeon.id) : 0)) ? 'win' : 'lose') : null } : null));
	}

	// ---- watch: a replay, re-run action by action
	function watch(rec, opts = {}) {
		const d = dungeonById(rec.dungeon);
		if (!d) return false;
		enter('watch', d);
		Object.assign(M, { seed: rec.seed, party: rec.party, bag: rec.bag, stars: rec.stars, rec, drv: mmDriver(rec, data) });
		M.S = M.drv.S;
		show();
		if (opts.floor > 1) wJump(opts.floor);
		ctx.banner(rec.label || 'Replay');
		return true;
	}
	function watchFrame(dt) {
		if (M.paused || M.ended) return;
		M.acc += Math.min(0.1, dt) * M.speed * WATCH_RATE;
		let n = 0;
		while (M.acc >= 1 && n < 16 && !M.ended) {
			const ev = M.drv.step(); M.acc -= 1; n++;
			if (ev) play(ev);
			if (M.drv.done()) { M.ended = true; ctx.toast(M.S.over ? (M.S.over.won ? 'Dungeon cleared' : M.S.over.escaped ? 'Escaped' : 'The run ended on B' + M.S.floorNo + 'F') : 'End of the replay'); }
		}
		if (n) refresh();
	}
	/** Jump to where a floor began (no animation): on from here if it is ahead, else from the start again. */
	function wJump(f) {
		f = Math.max(1, f | 0);
		if (f <= M.S.floorNo) { M.drv = mmDriver(M.rec, data); M.msgs = []; }
		while (M.drv.S.floorNo < f && !M.drv.done()) M.drv.step();
		M.S = M.drv.S; M.ended = M.drv.done(); M.acc = 0; M.tw = {}; M.pos = {}; M.seenN = -1;
		refresh();
		ctx.banner(M.ended ? 'The end' : 'B' + M.S.floorNo + 'F');
	}
	function wStart() { M.drv = mmDriver(M.rec, data); M.S = M.drv.S; M.ended = false; M.acc = 0; M.paused = true; M.msgs = []; M.tw = {}; M.pos = {}; M.seenN = -1; refresh(); ctx.banner('The start · paused'); }
	function wToggle() { if (M.ended) { wStart(); M.paused = false; } else M.paused = !M.paused; drawBar(); }
	function wSpeed() { M.speed = WATCH_SPEEDS[(WATCH_SPEEDS.indexOf(M.speed) + 1) % WATCH_SPEEDS.length]; ctx.sfx.tab && ctx.sfx.tab(); drawBar(); }

	// ---- follow: a friend's live run, drawn from what they see. snap: { mm: 1, view, msgs, over }
	function follow(snap, say) {
		const v = snap && snap.view;
		if (!v || !Array.isArray(v.tiles)) return false;
		const first = M.mode !== 'follow' || !M.S;
		if (first) enter('follow', { id: '', name: v.dungeon, theme: v.theme || 'cave' });
		M.say = say || M.say; M.view = v; M.msgs = (snap.msgs || []).slice(-3);
		// (a stand-in run with only what the view holds: the same drawing code reads it)
		const now = performance.now() / 1000;
		const units = v.units.map((u) => ({ ...u, fig: { shiny: u.shiny }, types: [], boosts: {} }));
		for (const u of units) { const p = M.pos[u.uid]; if (p && cheb(p[0], p[1], u.x, u.y) === 1) M.tw[u.uid] = { from: p, t0: now, t1: now + STEP_S }; }
		const F = { w: v.w, h: v.h, terrain: v.tiles.map((t) => (t < 0 ? 0 : t)), room: [], stairs: v.stairs || [-1, -1], water: v.water, ...(v.locks ? { locks: v.locks } : {}) };
		const floorChanged = !M.S || M.S.floorNo !== v.floor;
		M.S = { F, seen: v.tiles.map((t) => (t >= 0 ? 1 : 0)), units, leader: v.leader, floorNo: v.floor, lit: true, items: v.items.map((o) => ({ ...o, shop: o.price != null })), traps: v.traps.map((t) => ({ ...t, seen: true })),
			bag: v.bag, stars: v.stars, owed: v.owed, turns: v.turns, over: snap.over || v.over || null, dungeon: { name: v.dungeon, floors: [] },
			B: { units, geo: [], symbols: [], queue: [], phase: 'watch', map: null, field: {} } };
		if (floorChanged) { M.tw = {}; M.pos = {}; M.seenN = -1; }
		if (first) show(); else refresh();
		return true;
	}
	function close() {
		document.body.classList.remove('pt-mming');
		if (M.bar) { M.bar.hidden = true; M.mini.hidden = true; M.mini.classList.remove('is-big'); mapBig(); }
		if (M.pad) M.pad.hidden = true;
		stickUp();
		M.hold = false;
		document.body.classList.remove('pt-mm-touch');
		if (M.chord) { clearTimeout(M.chord.t); M.chord = null; }
		ctx.setMenu(null);
		P.hl = {}; P.marks = null; M.S = null; M.aim = null; M.auto = null; M.coach = null;
	}
	function frame(dt) {
		if (!M.S) return;
		if (M.mode === 'watch') { watchFrame(dt); sync(); camGlide(dt); return; }
		if (playing()) padStick();
		if (M.auto) { M.auto.t = (M.auto.t || 0) + dt; if (M.auto.t >= AUTO_S) { M.auto.t = 0; autoStep(); } }
		if (M.rest) { M.rest.t = (M.rest.t || 0) + dt; if (M.rest.t >= AUTO_S / 2) { M.rest.t = 0; restStep(); } }
		sync();
		camGlide(dt);
	}
	/** A viewer's keys (a replay; a live run has none but the camera). */
	function onWatchAction(action, o = {}) {
		if (!M.S) return false;
		if (['up', 'down'].includes(action)) return true;
		if (M.mode !== 'watch') return ['left', 'right', 'confirm', 'cancel', 'secondary', 'context', 'menu'].includes(action);
		if (o.repeat) return true;
		if (action === 'confirm') { wToggle(); return true; }
		if (action === 'left') { wJump(M.S.floorNo - 1); return true; }
		if (action === 'right') { wJump(M.S.floorNo + 1); return true; }
		if (action === 'cancel') { wStart(); return true; }
		if (action === 'secondary') { wSpeed(); return true; }
		if (action === 'context') { if (ctx.clip) ctx.clip(M.S.floorNo); return true; }
		return action === 'menu';
	}
	function onAction(action, o = {}) {
		if (!M.S) return false;
		if (!playing()) return onWatchAction(action, o);
		if (M.rest) { M.rest = null; say('You stop resting.'); draw(); return true; }   // (any press stops a rest)
		// (a controller's stick pushed over is read as the 8-way stick: the four-way direction the shared layer makes of it is not also taken)
		if (o.source === 'pad' && ['up', 'down', 'left', 'right'].includes(action)) { padStick(); if (M.padStick || M.padLean) return true; }
		if (P.menu) {
			if (['up', 'down', 'left', 'right'].includes(action)) { ctx.menuMove(action === 'up' || action === 'left' ? -1 : 1); return true; }
			if (action === 'confirm') { if (!o.repeat) ctx.menuPick(); return true; }
			if (action === 'cancel' || action === 'menu') { if (!o.repeat) closeMenu(); return true; }
			return true;
		}
		if (M.S.over) return false;
		if (['up', 'down', 'left', 'right'].includes(action)) { dirInput(ctx.stepFor(action)); return true; }
		if (M.aim) {
			if (action === 'confirm') { if (!o.repeat) endAim(true); return true; }
			if (action === 'cancel' || action === 'menu') { if (!o.repeat) endAim(false); return true; }
			return true;
		}
		if (action === 'confirm') { if (!o.repeat) { ctx.sfx.press(); M.turn = false; confirm(); } return true; }
		if (action === 'cancel') { if (!o.repeat) { M.turn = !M.turn; draw(); } return true; }
		if (action === 'secondary') { if (!o.repeat) { ctx.sfx.press(); openMoves(); } return true; }
		if (action === 'context') { if (!o.repeat) { ctx.sfx.press(); openBag(); } return true; }
		if (action === 'menu') { if (!o.repeat) { ctx.sfx.press(); openField(); } return true; }
		return false;   // (Q / E: the page turns the board)
	}
	function tap(x, y) {
		const S = M.S, u = L();
		if (!S || !u || !playing()) return;
		if (M.rest) { M.rest = null; say('You stop resting.'); draw(); return; }
		if (P.menu) { closeMenu(); return; }
		if (S.over) return;
		if (M.aim) { const k = M.aim.aims.findIndex(([ax, ay]) => ax === x && ay === y); if (k < 0) endAim(false); else if (k === M.aim.i) endAim(true); else { M.aim.i = k; draw(); } return; }
		const c = cheb(u.x, u.y, x, y);
		if (c === 0) { ctx.sfx.press(); if (underfoot() === 'Attack') openField(); else confirm(); return; }
		if (c === 1) { go([x - u.x, y - u.y]); return; }
		M.auto = { x, y, t: AUTO_S, foes: S.units.filter((o) => isFoe(u, o) && P.disp.units[o.uid]).length };
	}
	return { open, resume, watch, follow, close, onAction, onWatchAction, tap, frame, act, recipe, M, stickGo, stickVec, get active() { return P.screen === 'mm' && !!M.S; }, view: () => M.view || MM.view(M.S), hash: () => MM.hashOf(M.S), go };   // (a followed run IS the view it was sent)
}
