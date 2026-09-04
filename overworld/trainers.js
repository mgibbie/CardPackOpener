// trainers.js — trainer NPCs: sight lines, the "!" moment, walk-up, and
// engagement. Rosters come from trainers.json (FireRed decomp + Johto
// pokecrystal + hand-crafted gym leaders); fallback teams from class pools.
import { getJSON, getImage, META } from './engine.js';
import { MAX_LEVEL } from './badges.js';
import { buildMon } from './battle.js';
import { safeLoad, safeSave } from './safestore.js';
import { objectHiddenByFlag } from './events.js';

const FACE_OF = {
	MOVEMENT_TYPE_FACE_DOWN: 'down', MOVEMENT_TYPE_FACE_UP: 'up',
	MOVEMENT_TYPE_FACE_LEFT: 'left', MOVEMENT_TYPE_FACE_RIGHT: 'right',
	MOVEMENT_TYPE_FACE_DOWN_IF_FIELD_MOVES: 'down',
	MOVEMENT_TYPE_FACE_UP_IF_FIELD_MOVES: 'up',
	MOVEMENT_TYPE_FACE_LEFT_IF_FIELD_MOVES: 'left',
	MOVEMENT_TYPE_FACE_RIGHT_IF_FIELD_MOVES: 'right',
};
const DIRS = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
const DEFEATED_KEY = 'magepunk_defeated_v1';
const REMATCH_KEY = 'magepunk_rematch_v1'; // trainer key -> rematch tier (badges when the VS Seeker re-armed them)

// boss-tier trainers fight with real equipment + the boss AI (see buildBattle;
// exported for main.js's script-battle path, which builds its own info)
export const BOSS_CLASSES = new Set(['Gym Leader', 'Elite Four', 'Champion', 'Rival',
	'Aqua Leader', 'Magma Leader', 'Aqua Admin', 'Magma Admin',
	'TRAINER_CLASS_BOSS', 'TRAINER_CLASS_RIVAL_EARLY', 'TRAINER_CLASS_RIVAL_LATE']);
const TYPE_ITEM = {
	Fire: 'charcoal', Water: 'mysticwater', Electric: 'magnet', Grass: 'miracleseed',
	Ice: 'nevermeltice', Fighting: 'blackbelt', Poison: 'poisonbarb', Ground: 'softsand',
	Flying: 'sharpbeak', Psychic: 'twistedspoon', Bug: 'silverpowder', Rock: 'hardstone',
	Ghost: 'spelltag', Dragon: 'dragonfang', Dark: 'blackglasses', Steel: 'metalcoat',
	Normal: 'silkscarf',
};

// The Emerald sprite set was never imported into data/people (served read-only from
// owdata), so Hoenn gym leaders had no sprite and silently failed to spawn — leaving
// Hoenn gyms unbeatable. Their real overworld art now ships in overworld/people_extra/
// (tracked — served by the MAIN deploy, so no owdata push needed). Anything else that
// is still missing a sprite falls back to a generic so an NPC/trainer can never fail
// to render. Returns a full page-relative path.
const LEADER_ART = new Set(['ROXANNE', 'BRAWLY', 'WATTSON', 'FLANNERY', 'NORMAN', 'WINONA', 'TATE', 'LIZA', 'JUAN', 'WALLACE'].map(n => 'OBJ_EVENT_GFX_' + n));
export function spritePath(graphicsId, isTrainer) {
	if (LEADER_ART.has(graphicsId)) return `people_extra/${graphicsId.replace('OBJ_EVENT_GFX_', '').toLowerCase()}.png`;
	return `data/people/${isTrainer ? 'cooltrainer_m.png' : 'man.png'}`;
}

// all battle-capable trainers, including talk-to ones (sight range 0 — gym
// leaders etc.). npcs.js excludes these; trainers.js renders them.
export function isTrainerEvent(ev) {
	// object_events are always objects; the Emerald (Hoenn) map parser omits the
	// `type` field entirely, so treat a missing type as 'object' (else no Hoenn
	// trainer — gym leaders included — would ever spawn)
	return (ev.type === 'object' || ev.type == null)
		&& (ev.trainer_type === 'TRAINER_TYPE_NORMAL' || ev.trainer_type === 'TRAINER_TYPE_SEE_ALL_DIRECTIONS')
		&& ev.script && ev.script !== '0x0';
}

class Trainer {
	constructor(ev, img) {
		this.ev = ev;
		this.img = img;
		this.frames = Math.floor(img.width / 16);
		this.tx = ev.x; this.ty = ev.y;
		this.px = ev.x * META; this.py = ev.y * META;
		this.facing = FACE_OF[ev.movement_type] || 'down';
		this.range = parseInt(ev.trainer_sight_or_berry_tree_id, 10) || 0;
		this.seeAll = ev.trainer_type === 'TRAINER_TYPE_SEE_ALL_DIRECTIONS';
		this.exclaim = 0;
	}

	draw(ctx, camX, camY) {
		const stills = { down: 0, up: 1, left: 2, right: 2 };
		let frame = stills[this.facing];
		if (frame >= this.frames) frame = 0;
		const x = Math.round(this.px - camX), y = Math.round(this.py - 16 - camY);
		ctx.save();
		if (this.facing === 'right') { ctx.translate(x + 16, y); ctx.scale(-1, 1); }
		else ctx.translate(x, y);
		ctx.drawImage(this.img, frame * 16, 0, 16, 32, 0, 0, 16, 32);
		ctx.restore();
		if (this.exclaim > 0) {
			ctx.fillStyle = '#fff';
			ctx.fillRect(x + 4, y - 11, 8, 10);
			ctx.strokeStyle = '#222';
			ctx.strokeRect(x + 4.5, y - 10.5, 7, 9);
			ctx.fillStyle = '#c02020';
			ctx.font = 'bold 9px monospace';
			ctx.fillText('!', x + 6, y - 3);
		}
	}
}

export class Trainers {
	constructor(world, player) {
		this.world = world;
		this.player = player;
		this.list = [];
		this.data = null;
		this.gfx = null;
		this.engagement = null; // { trainer, phase: 'exclaim'|'walk', t }
		this.onEngage = null;   // set by main.js
		this.spawnFlagged = null; // set by main.js: predicate to un-hide villain-grunt events during a beat
		{ const d = safeLoad(DEFEATED_KEY, []); this.defeated = new Set(Array.isArray(d) ? d : []); }
		{ const r = safeLoad(REMATCH_KEY, {}); this.rematch = (r && typeof r === 'object' && !Array.isArray(r)) ? r : {}; }
	}

	// VS Seeker: re-arm this map's defeated trainers for a rematch. The tier
	// (badge count at re-arm, min 1) sticks to the trainer key and scales
	// buildBattle's levels, so rematches keep pace with the player.
	rearmMap(tier) {
		let n = 0;
		for (const t of this.list) {
			const key = this.keyOf(t);
			if (!this.defeated.has(key)) continue;
			this.defeated.delete(key);
			this.rematch[key] = Math.max(this.rematch[key] || 0, Math.max(1, tier || 0));
			n++;
		}
		if (n) {
			safeSave(DEFEATED_KEY, [...this.defeated]);
			safeSave(REMATCH_KEY, this.rematch);
		}
		return n;
	}

	async init() {
		[this.data, this.gfx] = await Promise.all([
			getJSON('data/trainers.json'),
			getJSON('data/gfx_map.json'),
		]);
	}

	keyOf(t) {
		return `${this.world.current.map.id}:${t.ev.local_id || t.ev.script || `${t.ev.x},${t.ev.y}`}`;
	}

	isDefeated(t) { return this.defeated.has(this.keyOf(t)); }

	markDefeated(t) {
		this.defeated.add(this.keyOf(t));
		safeSave(DEFEATED_KEY, [...this.defeated]);
	}

	// battleable = flagged trainer event OR any NPC whose script has a roster
	// entry (gym leaders are TRAINER_TYPE_NONE but script-battled)
	claims(ev) {
		if (isTrainerEvent(ev)) return true;
		return (ev.type === 'object' || ev.type == null) && ev.script && this.data?.rosters?.[ev.script] != null;
	}

	async loadForMap() {
		this.list = [];
		this.engagement = null;
		const evs = this.world.current.map.object_events || [];
		const crystal = !!this.world.current.map._crystal_tileset;
		// a few decomp objects ship with script "0x0" and their battle stranded in
		// an onFrame scene the engine can't arm (see repairScript in main.js).
		// Rewriting ev.script HERE is deliberate: claims(), keyOf() and buildBattle
		// all read ev.script, so one mutation keeps every consumer consistent.
		if (this.repairScript) for (const ev of evs) this.repairScript(ev, this.world.current.map.id);
		await Promise.all(evs.map(async ev => {
			if (!this.claims(ev)) return;
			// hidden story trainers are skipped — EXCEPT villain grunts that the active
			// quest beat wants populating the dungeon (main.js sets spawnFlagged).
			// On CRYSTAL maps "hidden" means the flag is actually SET, not merely
			// present: MISTY and her three gym swimmers, BLUE, and the Route 24 Rocket
			// are all flagged trainers, and treating any flag as permanent removal is
			// what made the Cascade and Earth badges unobtainable.
			const hidden = objectHiddenByFlag(ev, crystal);
			if (hidden && !(this.spawnFlagged && this.spawnFlagged(ev))) return;
			// "villain" means a story-flagged trainer the ACTIVE quest beat is
			// populating — a Rocket on a hideout floor, not just any flagged NPC. It
			// used to be inferred from `hidden`, which worked only while "hidden" meant
			// "carries a flag at all". Now that a flag is read for its actual state,
			// that inference collapsed: the grunts still spawned (their flags are
			// clear) but stopped being MARKED, so the quest's own crawl looked empty.
			// Say what it means instead of deriving it from a coincidence.
			const storyFlagged = !!(ev.flag && ev.flag !== '0');
			const claimedByBeat = storyFlagged && !!(this.spawnFlagged && this.spawnFlagged(ev));
			// gfx map first, then guess from the id (OBJ_EVENT_GFX_BROCK -> brock.png)
			const file = this.gfx[ev.graphics_id]
				|| (ev.graphics_id || '').replace('OBJ_EVENT_GFX_', '').toLowerCase() + '.png';
			let img = await getImage(`data/people/${file}`).catch(() => null);
			// missing sprite (e.g. Hoenn leaders) must NOT hide a battleable trainer —
			// use their real people_extra art, else a generic
			if (!img) img = await getImage(spritePath(ev.graphics_id, true)).catch(() => null);
			if (img) { const t = new Trainer(ev, img); if (claimedByBeat) t.villain = true; this.list.push(t); }
		}));
	}

	occupied(tx, ty) {
		// a defeated trainer no longer blocks its tile — so a beaten grunt can't wall
		// a dungeon corridor (checkSight already skips defeated, so no re-battle)
		return this.list.some(t => t.tx === tx && t.ty === ty && !this.isDefeated(t));
	}

	get engaging() { return this.engagement != null; }

	trainerAt(tx, ty) {
		return this.list.find(t => t.tx === tx && t.ty === ty) || null;
	}

	// talk-to engagement (Z in front of any trainer, incl. sight range 0)
	talkTo(t, playerFacing) {
		if (this.engagement) return;
		t.facing = { up: 'down', down: 'up', left: 'right', right: 'left' }[playerFacing] || t.facing;
		this.onEngage?.(t);
	}

	// called when the player finishes a step; true if a trainer spotted them
	checkSight(ptx, pty) {
		if (this.engagement) return true;
		for (const t of this.list) {
			if (t.range <= 0) continue; // talk-to trainers don't spot you
			if (this.isDefeated(t)) continue;
			const dirs = t.seeAll ? ['down', 'up', 'left', 'right'] : [t.facing];
			for (const dir of dirs) {
				const [dx, dy] = DIRS[dir];
				for (let i = 1; i <= t.range; i++) {
					const cx = t.tx + dx * i, cy = t.ty + dy * i;
					if (cx === ptx && cy === pty) {
						t.facing = dir;
						this.engagement = { trainer: t, phase: 'exclaim', t: 0, steps: i - 1, dir };
						t.exclaim = 0.9;
						return true;
					}
					if (!this.world.isPassable(cx, cy)) break; // wall blocks the view
				}
			}
		}
		return false;
	}

	update(dt) {
		for (const t of this.list) if (t.exclaim > 0) t.exclaim -= dt;
		const e = this.engagement;
		if (!e) return;
		e.t += dt;
		const t = e.trainer;
		if (e.phase === 'exclaim') {
			if (e.t > 0.9) { e.phase = 'walk'; e.t = 0; }
			return;
		}
		if (e.phase === 'walk') {
			if (e.steps <= 0) {
				// arrived: face the player, hand off to battle
				this.engagement = null;
				this.onEngage?.(t);
				return;
			}
			const [dx, dy] = DIRS[e.dir];
			const speed = META / 0.16; // ~FireRed approach pace
			t.px += dx * speed * dt;
			t.py += dy * speed * dt;
			const targetX = (t.tx + dx) * META, targetY = (t.ty + dy) * META;
			if ((dx && Math.abs(t.px - t.tx * META) >= META) || (dy && Math.abs(t.py - t.ty * META) >= META)) {
				t.tx += dx; t.ty += dy;
				t.px = t.tx * META; t.py = t.ty * META;
				e.steps--;
			}
		}
	}

	// team + display info for a trainer (buildParty/buildInfo port)
	//
	// `levelScale` is set by main.js and is how JOHKANTO stays a fight: its rosters
	// are authored for a team fresh off a League, and the cap now runs to 255. This
	// module has no business knowing about regions or badges, so it just asks.
	buildBattle(t, data) {
		const script = t.ev.script && t.ev.script !== '0x0' ? t.ev.script : null;
		const roster = script ? this.data.rosters[script] : null;
		// `levelScale` is set by main.js and is how JOHKANTO stays a fight. It is told
		// whether this is a BOSS and whether this mon is the ACE, because a gym leader
		// there is levelled off the player rather than off the roster.
		const boss = !!(roster?.class && BOSS_CLASSES.has(roster.class));
		const aceLevel = Math.max(0, ...((roster?.party || []).map(e => e.l || 0)));
		const scale = (l, opts) => Math.max(1, Math.min(MAX_LEVEL, this.levelScale ? this.levelScale(l, opts) : l));
		// VS Seeker rematches climb: +2 levels per rematch tier (badges at re-arm)
		const bump = 2 * (this.rematch[this.keyOf(t)] || 0);
		let party = [];
		if (roster?.party?.length) {
			party = roster.party.map(e => {
				const mon = buildMon(e.s, scale(e.l + bump, { boss, ace: (e.l || 0) >= aceLevel, bump, script }), data);
				if (!mon) return null;
				// authentic movesets / held items when the roster carries them
				// (gen_trainer_movesets.mjs backfills these from the decomps);
				// otherwise buildMon's level-up moveset stands in
				if (e.moves?.length && !bump) { // round 2: skip the fixed low-level moves → higher-level learnset
					const mv = e.moves.map(id => {
						const info = data.moves[id];
						return info ? { id, name: info.name, pp: info.pp, maxPp: info.pp } : null;
					}).filter(Boolean);
					if (mv.length) mon.moves = mv;
				}
				if (e.item) mon.heldItem = e.item;
				return mon;
			}).filter(Boolean);
		}
		if (!party.length) {
			const pool = this.data.classPools[t.ev.graphics_id] || this.data.defaultPool;
			const base = this.data.mapLevel[this.world.current.map.id] || 20;
			const n = 1 + Math.floor(Math.random() * 2);
			for (let i = 0; i < n; i++) {
				const s = pool[Math.floor(Math.random() * pool.length)];
				const lv = Math.max(5, scale(base + bump + Math.floor(Math.random() * 7) - 3, { boss: false, script }));
				const mon = buildMon(s, lv, data);
				if (mon) party.push(mon);
			}
		}
		// bosses (leaders, Elite Four, champions, rivals, villain leadership) fight
		// with real equipment: their canonical first-listed ability instead of a
		// random roll, a Sitrus Berry on the ace, a type-boost item on the rest
		if (roster?.class && BOSS_CLASSES.has(roster.class)) {
			const ace = party.reduce((a, m) => (m.level > (a?.level ?? -1) ? m : a), null);
			for (const m of party) {
				const opts = data.abilities?.[m.speciesId];
				if (opts?.length) m.ability = opts[0];
				// a roster-supplied (authentic) item always wins over this fallback
				if (!m.heldItem) m.heldItem = m === ace ? 'sitrusberry' : (TYPE_ITEM[m.types[0]] || 'leftovers');
			}
		}
		// ROUND 2 (Batch 6 follow-up): a re-armed boss (rematch) doesn't just gain
		// levels — movesets modernise (the fixed low-level roster moves are skipped
		// above when bump>0) and the squad fills out toward six with extra threats
		// drawn from the leader's class pool, each with its canonical ability + a
		// type item. Ordinary trainers (bump 0, non-boss) are untouched.
		if (bump > 0 && boss && party.length && party.length < 6) {
			const ace = party.reduce((a, m) => (m.level > (a?.level ?? -1) ? m : a), null);
			const pool = this.data.classPools[t.ev.graphics_id] || this.data.defaultPool || [];
			const have = new Set(party.map(m => m.speciesId));
			for (let i = 0; i < pool.length && party.length < 6; i++) {
				const s = pool[i];
				if (have.has(s)) continue;
				const mon = buildMon(s, Math.max(5, (ace?.level || 30) - 2), data);
				if (!mon) continue;
				have.add(s);
				const opts = data.abilities?.[s];
				if (opts?.length) mon.ability = opts[0];
				mon.heldItem = TYPE_ITEM[mon.types[0]] || 'leftovers';
				party.push(mon);
			}
		}
		const className = roster?.class || this.data.classNames[t.ev.graphics_id] || 'Trainer';
		const name = roster?.name || '';
		const displayName = (name ? `${className} ${name}` : className) + (bump ? ' (rematch)' : '');
		const high = Math.max(5, ...party.map(m => m.level));
		return {
			party,
			info: {
				displayName,
				// boss-tier AI: no random wobble, status logic, counter-switches,
				// best-matchup replacements, one potion (battle.js reads this)
				boss: !!(roster?.class && BOSS_CLASSES.has(roster.class)),
				introQuote: roster?.introQuote || null,
				defeatText: roster?.defeatText || `${displayName} was defeated!`,
				money: high * 8,
			},
		};
	}

	draw(ctx, camX, camY) {
		// handled via main's y-sorted sprite list; kept for the ! overlay pass
	}
}
