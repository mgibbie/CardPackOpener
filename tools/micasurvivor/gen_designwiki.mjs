// gen_designwiki.mjs — designwiki/data/micasurvivor.json, the design wiki's MicaSurvivor reference
// (designwiki/app.js micasurvivor*View), generated from the game's own data files:
//   micasurvivor/js/data/{pokedex,starters,moves,items,upgrades}.js, js/systems/abilities.js (the
//   passive ability of every Pokémon, M5 batch 2), js/systems/zmoves.js (the 18 Z-moves and their
//   Z-crystal missions, M5 batch 4), js/systems/dynamax.js (Dynamax + raid dens, M5 batch 5), js/systems/modes.js
//   (the quick modes, the 6 modifiers and the level-up ban, M5 batch 6), js/systems/team.js (Team mode, M5
//   batch 7), js/systems/bossrush.js + js/systems/tower.js (Boss Rush and the Floor Tower, M5 batch 8), js/systems/adaptive.js +
//   js/data/enemies.js + js/world/tiles.js (adaptive difficulty, biome spawns and the support caps, M5 batch 9), js/core/display.js +
//   js/ui/minimap.js (the minimap, the field of view and the UI scale, M5 batch 10), js/data/achievements.js +
//   js/data/missions.js + js/systems/dmglog.js + js/ui/lexicon-ui.js (achievements, missions, titles, the damage
//   breakdown, the Lexicon and the trainer card, M5 batch 11), js/systems/localcoop.js (Co-op Mode, the local partner,
//   M5 batch 12a), js/net/coop.js + js/entities/player.js + server/mp.mjs's MSURV_* limits (online co-op with friends,
//   M5 batch 12b), js/mica/spectate.js + js/mica/replay.js + server/mp.mjs's spectating / replay limits (watching a
//   friend live and run replays, M5 batch 12c) (+ lang-en.js for the English
//   names: the game is written in Spanish and translated on the fly, js/core/i18n.js).
// The scripts are loaded in a sandbox with a stub browser; nothing is copied by hand.
//   node tools/micasurvivor/gen_designwiki.mjs           (write)
//   node tools/micasurvivor/gen_designwiki.mjs --check   (exit 1 if the file is out of date)
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
const JS = path.join(ROOT, 'micasurvivor/js');
const OUT = path.join(ROOT, 'designwiki/data/micasurvivor.json');

export function build() {
	const store = { micasurvivor_lang: 'en' };
	const noop = () => {};
	const el = () => ({ style: {}, classList: { add: noop, remove: noop, toggle: noop }, appendChild: noop, setAttribute: noop, getContext: () => null });
	const sandbox = {
		console, Math, JSON, Date, Object, Array, Set, Map, Number, String, RegExp, Promise, Symbol, Infinity, NaN, isFinite, parseInt, parseFloat,
		localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
		location: { pathname: '/micasurvivor/', search: '', hostname: 'localhost', protocol: 'http:' },
		navigator: { language: 'en', languages: ['en'] },
		document: { documentElement: {}, createElement: el, getElementById: () => null, querySelectorAll: () => [], addEventListener: noop, fonts: null },
		CanvasRenderingContext2D: function () {}, Image: function () {}, addEventListener: noop, setTimeout, clearTimeout,
	};
	sandbox.CanvasRenderingContext2D.prototype = { fillText: noop, strokeText: noop, measureText: noop };
	sandbox.window = sandbox;
	sandbox.confirm = noop; sandbox.alert = noop;
	vm.createContext(sandbox);
	for (const f of ['core/util.js', 'core/i18n.js', 'data/lang-en.js', 'data/pokedex.js', 'data/types.js', 'data/moves.js', 'data/starters.js', 'data/items.js', 'data/upgrades.js', 'systems/abilities.js', 'systems/zmoves.js', 'systems/dynamax.js', 'systems/modes.js', 'systems/team.js', 'systems/localcoop.js', 'systems/bossrush.js', 'systems/tower.js', 'systems/adaptive.js', 'data/enemies.js', 'world/tiles.js', 'core/display.js', 'ui/minimap.js', 'data/sprites-meta.js', 'data/missions.js', 'data/achievements.js', 'systems/dmglog.js', 'ui/lexicon-ui.js', 'entities/player.js', 'mica/online.js', 'mica/spectate.js', 'mica/replay.js', 'net/net.js', 'net/coop.js']) {
		if (f === 'ui/lexicon-ui.js') sandbox.G.UI = sandbox.G.UI || { $: () => null };   // (only its data tables are read)
		vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), sandbox, { filename: f });
	}
	const G = sandbox.G;
	const T = s => G.I18n.t(s);
	if (G.I18n.lang !== 'en') throw new Error('i18n did not switch to English');
	const name = d => (G.DEX_BY[d] || {}).name || '#' + d;

	const moves = G.Moves.ALL.map(m => {
		const evo = G.Moves.EVO[m.id];
		return {
			id: m.id, name: T(m.name), type: m.type, kind: m.kind, desc: T(m.desc),
			cd: m.cd ?? null, dmg: m.dmg ?? null, maxLvl: m.maxLvl,
			...(evo ? { evo: { name: T(evo[0]), needs: T(G.Moves.NEED_NAME[evo[1]] || evo[1]) } } : {}),
		};
	});
	const starters = G.STARTERS.map(s => ({
		dex: s.dex, name: name(s.dex), types: (G.DEX_BY[s.dex] || {}).types || [],
		start: T((G.Moves.BY_ID[s.start] || {}).name || s.start),
	}));
	// (M5 batch 3: species-locked items say who can use them; upgrades carry their price per level)
	const items = G.Items.LIST.map(i => ({ id: i.id, name: T(i.name), desc: T(i.desc), ...(i.only ? { only: i.only.map(name) } : {}), ...(i.instant ? { instant: true } : {}) }));
	const upgrades = G.Upgrades.LIST.map(u => ({ id: u.id, name: T(u.name), unit: T(u.unit), max: u.max, costs: Array.from({ length: u.max }, (_, l) => G.Upgrades.cost(u.id, l)) }));
	// [dex, name, types, rarity, gen, legendary, ability id]
	const pokemon = G.DEX.map(p => [p.dex, p.name, p.types, p.rarity, p.gen, p.leg ? 1 : 0, G.Abilities.of(p.dex)]);
	// (M5 batch 4: one Z-move per type, with its Z-crystal mission)
	const Z = G.ZMoves;
	const zmoves = Z.ORDER.map(t => { const m = Z.ZMIS.find(x => x.type === t); return { type: t, name: T(Z.DEF[t].name), desc: T(Z.DEF[t].desc), mission: T(m.desc) }; });
	const zrules = { need: Z.NEED, cooldown: Z.COOLDOWN, minLevel: Z.MIN_LEVEL, bossCap: Z.BOSS_CAP, crystal: Z.CRYSTAL_P, missionCoins: Z.ZMIS_COINS };
	// (M5 batch 5: Dynamax and its raid dens)
	const D = G.Dynamax;
	const dynrules = { dur: D.DUR, minLevel: D.MIN_LEVEL, cooldown: D.COOLDOWN, statK: D.STAT_K, hpBonus: D.HP_BONUS, taken: D.TAKEN, grow: D.GROW, pulse: D.PULSE,
		pulseR: D.PULSE_R, bigR: D.BIG_R, bigK: D.BIG_K, denRate: D.DEN_RATE, denTtl: D.DEN_TTL, denFrom: D.DEN_FROM, denScale: D.DEN_SCALE,
		reward: { orbs: D.DEN_REWARD.orbs, items: D.DEN_REWARD.items, tickets: D.DEN_REWARD.tickets, coins: D.DEN_REWARD.coins * D.DEN_REWARD.coinValue },
		status: Object.entries(D.STATUS).map(([t, [cc, poison, slow]]) => ({ type: t, cc, poison, slow })) };
	// (M5 batch 6: the quick modes, the 6 run modifiers and the in-run card ban, whose count is the Veto upgrade)
	const M = G.Modes, ban = G.Upgrades.BY.ban;
	const modes = { list: M.LIST.map(id => ({ id, name: T(M.NAME[id]) })), mods: M.MOD_IDS.map(id => ({ id, name: T(M.MOD[id].name), desc: T(M.MOD[id].desc) })),
		rifts: M.RIFTS, coins: M.COINS, k: M.K, typeMin: M.TYPE_DONE_MIN, partyDex: M.PARTY_DEX, types: M.TYPES.length,
		ban: { upgrade: T(ban.name), max: ban.max, costs: Array.from({ length: ban.max }, (_, l) => G.Upgrades.cost('ban', l)) },
		// (M5 batch 7: Team mode)
		team: { max: G.Team.MAX, minOwned: G.Team.MIN_OWNED, cooldown: G.Team.CD, inv: G.Team.INV, invAuto: G.Team.INV_AUTO, regen: G.Team.REGEN },
		// (M5 batch 12a: Co-op Mode, the local partner: AI or a second controller)
		coop: (C => ({ speed: C.speed, follow: C.follow, engage: C.engage, seek: C.seek, flee: C.flee, leash: C.leash, tpR: C.tpR, deadzone: C.dz, dmg: C.dmg, cd: C.cd,
			lvEvery: C.lvEvery, lvMax: C.lvMax, coins: C.coins, groupMin: C.groupMin, reviveT: C.reviveT, downK: C.downK, reviveHp: C.reviveHp, reviveInv: C.reviveInv,
			fallback: name(C.fallback), fallback2: name(C.fallback2) }))(G.LocalCoop.K),
		// (M5 batch 8: Boss Rush and the Floor Tower, with its risk pacts and legendary cards)
		rush: { first: G.BossRush.FIRST, rest: G.BossRush.REST, legEvery: G.BossRush.LEG_EVERY, biome: G.BossRush.BIOME_EVERY, hp: G.BossRush.HP, dmg: G.BossRush.DMG, bst: G.BossRush.BST },
		tower: { floors: G.Tower.FLOORS, bossAt: G.Tower.BOSS_AT, k: G.Tower.K, adapt: { maxHp: G.Tower.ADAPT.maxHp, maxDmg: G.Tower.ADAPT.maxDmg }, maxRisks: G.Tower.MAX_RISKS, legendChance: G.Tower.LEGEND_CHANCE,
			rest: G.Tower.REST, relic: G.Tower.RELIC, relicsMax: G.Tower.RELICS_MAX, bonds: G.Tower.BOND_FLOORS, reward: [1, 5, 30].map(f => ({ floor: f, ...G.Tower.reward(f) })),
			rests: G.Tower.REST_CARDS.map(c => ({ id: c.id, name: T(c.title), desc: c.desc ? T(c.desc) : null })),
			risks: G.Tower.RISKS.map(r => ({ id: r.id, name: T(r.name), desc: T(r.desc) })), legends: G.Tower.LEGENDS.map(r => ({ id: r.id, name: T(r.name), desc: T(r.desc) })) } };
	// (M5 batch 9: adaptive difficulty, biome-themed spawns and the enemy support caps)
	const AK = G.Adaptive.K, EN = G.Enemies;
	const biomeNames = G.Tiles.BIOMES.slice(0, EN.BASE_BIOMES.length).map(b => T(b.name));
	const difficulty = {
		adaptive: { base: AK.base, perm: AK.perm, push: AK.push, pushPerm: AK.pushPerm, permFull: AK.permFull, powerFull: AK.powerFull, lvl: AK.lvl, evo: AK.evo,
			newRuns: AK.newRuns, newK: AK.newK, min: AK.min, max: AK.max, every: AK.every, hurtHi: AK.hurtHi, lowHp: AK.lowHp, hurtLo: AK.hurtLo,
			down: AK.down, up: AK.up, adjMin: AK.adjMin, adjMax: AK.adjMax, glide: AK.glide, dmgExp: AK.dmgExp, xpExp: AK.xpExp,
			setting: T('Dificultad adaptativa'), desc: T('En la partida normal, el juego empieza fácil y se pone más difícil según tus mejoras: más vida y daño, más enemigos, hordas más seguidas y más experiencia por nivel.') },
		biomes: EN.BASE_BIOMES.map((key, i) => ({ key, name: biomeNames[i], types: EN.BIOME_TYPES[key], dex: (EN.BIOME_DEX[key] || []).map(name) })),
		arenas: G.Tiles.ARENA_TYPES.filter(t => t !== 'judgment').length, extra: EN.BIOME_EXTRA, mul: EN.BIOME_W_MUL,
		support: EN.SUPPORT_CAPS,
	};
	// (M5 batch 10: the minimap, the field-of-view slider and the UI scale)
	const DP = G.Display, MK = G.Minimap.K;
	const display = {
		fov: { name: T('Campo de visión'), min: DP.FOV.min, max: DP.FOV.max, step: DP.FOV.step, def: DP.FOV.def, phoneMin: DP.FOV.phoneMin, phoneSide: DP.FOV.phoneSide, viewW: DP.VIEW.w },
		ui: { name: T('Tamaño de la interfaz'), min: DP.UI.min, max: DP.UI.max, step: DP.UI.step, def: DP.UI.def, touchMin: DP.UI.touchMin },
		minimap: { name: T('Minimapa'), desc: T('El mapa redondo de la izquierda: el terreno que has explorado, los enemigos cercanos, los cofres y altares, los jefes y la grieta.'),
			size: MK.size, tiles: MK.VIEW, sight: MK.SIGHT, radar: MK.RADAR, traps: MK.TRAP_R, foes: MK.FOE_R },
	};
	// (M5 batch 11: achievements, missions, titles, the damage breakdown, the Lexicon and the trainer card)
	const AD = G.AchDefs, MD = G.MissionDefs;
	const rw = r => ({ coins: r.coins || 0, t1: r.t1 || 0, t10: r.t10 || 0 });
	const goals = {
		achievements: {
			total: AD.LIST.length,
			cats: AD.CATS.map(([k, n]) => ({ key: k, name: T(n), count: AD.LIST.filter(a => a.cat === k).length, titles: AD.LIST.filter(a => a.cat === k && a.title).length })),
			bosses: AD.LIST.filter(a => /^boss[0-9]+$/.test(a.id)).map(a => ({ id: a.id, name: T(a.name), goal: a.goal, tier: a.tier, reward: rw(a.reward), title: a.title ? T(a.title) : '' })),
			byType: AD.LIST.filter(a => a.cat === 'tipos' && a.type === 'fire').map(a => ({ goal: a.goal, tier: a.tier, name: T(a.name).replace('Fire', 'X'), reward: rw(a.reward) })),
			types: AD.LIST.filter(a => a.cat === 'tipos').length,
		},
		missions: ['daily', 'weekly'].map(k => MD[k].map(d => ({ id: d.id, period: k, goals: d.goals, reward: rw(d.reward),
			text: T(d.text(d.goals.join(' / '), 'fire')), random: d.param === 'type' }))).flat(),
		titles: AD.LIST.filter(a => a.title).map(a => ({ title: T(a.title), ach: T(a.name), id: a.id })),
		breakdown: G.DmgLog.ROWS.map(([k, n]) => ({ key: k, name: T(n) })),
		lexicon: { tabs: G.LexiconUI.TABS.map(([k, n]) => ({ key: k, name: T(n) })), status: G.LexiconUI.STATUS.map(([k, n, d]) => ({ key: k, name: T(n), desc: T(d) })) },
		card: ['Partidas', 'Mejor tiempo', 'Mejor nivel', 'Derrotados', 'Jefes', 'Cofres', 'Pokémon', 'Logros', 'Tiempo jugado'].map(T),
	};
	// (M5 batch 12b: online co-op with friends: upstream's group rules (js/net/coop.js) and the server's limits)
	const CO = G.Coop, sv = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const lim = k => { const m = new RegExp('const MSURV_' + k + ' = (?:[^;]*\\|\\| )?([0-9_]+(?: \\* [0-9_]+)*);').exec(sv); if (!m) throw new Error('MSURV_' + k + ' not found'); return m[1].split(' * ').reduce((a, n) => a * Number(n.replace(/_/g, '')), 1); };
	const online = {
		max: lim('MAX'), colors: CO.COLORS, rateDirect: CO.K.rateDirect, rateRelay: CO.K.rateRelay, stall: CO.K.stall, revive: G.Player.REVIVE_TIME,
		scale: [1, 2, 3, 4].map(n => ({ players: n, spawn: CO.scaleRate(n), hp: CO.scaleHp(n), xp: Math.round(1000 / (1 + 0.6 * (n - 1))) / 1000 })),
		lobby: { idle: lim('LOBBY_IDLE_MS') / 1000, runIdle: lim('RUN_IDLE_MS') / 1000, member: lim('MEMBER_IDLE_MS') / 1000, invite: lim('INVITE_TTL_MS') / 1000 },
		relay: { min: lim('RELAY_MIN_MS'), msg: lim('RELAY_MSG_MAX'), row: lim('RELAY_MAX'), window: lim('RELAY_WINDOW'), stale: lim('RELAY_STALE_MS') / 1000, daily: lim('RELAY_DAILY_MIN') },
		signal: { row: lim('SIGNAL_MAX'), window: lim('SIGNAL_WINDOW') },
		strings: ['Jugar con amigos', 'Estoy listo', 'Conectado (por servidor)', 'Inicia sesión para jugar con amigos', 'Relé: quedan 12 min hoy', CO.BUDGET_MSG].map(T),
	};
	// (M5 batch 12c: watching a friend live and run replays: the client's cadence (spectate.js / replay.js) and the server's limits)
	const SP = G.Spectate.K, RP = G.Replay.K;
	const top = k => { const m = new RegExp('const ' + k + ' = ([0-9_]+);').exec(sv); if (!m) throw new Error(k + ' not found'); return Number(m[1].replace(/_/g, '')); };
	const days = (/\['msurvreplay:', (\d+) \* 24 \* HR\]/.exec(sv) || [])[1];
	if (!days) throw new Error('msurvreplay: GC not found');
	const spectate = {
		publish: SP.PUB_MS / 1000, check: SP.CHECK_MS / 1000, slow: SP.SLOW_MS / 1000, poll: SP.POLL_MS / 1000, near: SP.NEAR, bossNear: SP.BOSS_NEAR, maxEnemies: SP.MAX_E,
		beacon: lim('LIVE_BEAT_MS') / 60000, live: lim('LIVE_TTL_MS') / 60000, stale: lim('STATE_STALE_MS') / 1000, floor: lim('STATE_MIN_MS'), daily: lim('SPEC_DAILY_MIN'),
		snapshot: lim('SNAPSHOT_MAX'), window: top('SPEC_WINDOW_MS') / 1000, cap: top('SPEC_CAP'), heartbeat: top('SPEC_BEAT_MS') / 1000,
		replay: { every: RP.REC_DT, quantum: RP.Q, local: RP.LOCAL_MAX, max: lim('REPLAY_MAX'), frames: lim('REPLAY_FRAMES'), perUser: lim('REPLAY_PER_USER'), days: Number(days) },
		strings: ['Viendo a', 'EN DIRECTO', 'Dejar de ver', 'En directo ahora', 'Compartir repetición', 'Ver repetición', '¡Enlace copiado!', 'Está eligiendo una mejora…', 'Ver otra vez'].map(T),
	};
	const abilities = G.Abilities.list().map(a => ({ id: a.id, name: T(a.name), desc: T(a.desc), pokemon: pokemon.filter(p => p[6] === a.id).length }));
	return {
		source: 'micasurvivor/js/data (tools/micasurvivor/gen_designwiki.mjs)',
		counts: { pokemon: pokemon.length, legendaries: pokemon.filter(p => p[5]).length, starters: starters.length, moves: moves.length, items: items.length, upgrades: upgrades.length, abilities: abilities.length, zmoves: zmoves.length },
		starters, moves, zmoves, zrules, dynrules, modes, difficulty, display, goals, online, spectate, items, upgrades, abilities, pokemon,
	};
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
	const text = JSON.stringify(build()) + '\n';
	if (process.argv.includes('--check')) {
		const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
		if (cur !== text) { console.error('designwiki/data/micasurvivor.json is out of date: node tools/micasurvivor/gen_designwiki.mjs'); process.exit(1); }
		console.log('designwiki/data/micasurvivor.json is up to date');
	} else {
		fs.writeFileSync(OUT, text);
		const d = JSON.parse(text);
		console.log(`designwiki/data/micasurvivor.json: ${JSON.stringify(d.counts)} (${text.length} bytes)`);
	}
}
