// gen_shapes.mjs — every move and ability in the game, translated to Poketactica's grid (owner, 2026-11-20: "all of the
// moves and abilities to have a shape of some kind"). Rules first (from the move's real Pokémon target and flags, via
// Showdown's data in showdown_*.min.json), then the hand edits in poketactica/data/shape_overrides.json win. Writes
//   poketactica/data/move_shapes.json      id -> MOVE (below)
//   poketactica/data/ability_shapes.json   id -> ABILITY (below)
//   node tools/poketactica/gen_shapes.mjs            (re-run after changing a rule or an override; the test checks it is current)
//
// MOVE  { s, n, r: [min, max], t, ff?, h, sp, pp, kb?, piv?, rand?, charge?, grow, note }
//   s     shape   one      the target tile
//                 line     n tiles straight out from the user (aimed by direction; hits every unit on them)
//                 cone     a widening wedge n deep (row k is 2k-1 wide), aimed by direction
//                 arc      3 wide, n deep, in front of the user, aimed by direction
//                 cross    the target tile + n tiles each way (a plus)
//                 dia      a diamond of radius n around the target tile
//                 burst    a diamond of radius n around the USER (not the user)
//                 aura     the user's side within n of the user, the user included
//                 dash     the user charges up to n tiles straight and hits the first unit met
//                 leap     the user flies / digs to a tile in range and strikes there (lands next to the target)
//                 trap     sets a hazard on a diamond of radius n at the target tile
//                 paint    paints a terrain (a Geo colour) on a diamond of radius n at the target tile
//                 map      the whole map
//                 swap     trades places with the target
//                 self     the user only
//   n     size (radius / length / depth)            r   cast range from the user, in tiles ([0,0] = the user)
//   t     who it can be aimed at: foe | ally | any | self | tile
//   ff    1 = friendly fire: hits the user's own side too (Earthquake, Surf, Explosion, …)
//   h     height rule: melee (reach ±2 levels) | lob (arcs over terrain) | beam (straight; blocked by higher ground) | any
//   sp    SP cost at move level 1 (owner: a move needs both PP and SP)          pp   PP (the move's own)
//   kb    knockback tiles (Roar, Dragon Tail)       piv  tiles the user may move after hitting (U-turn)
//   rand  1 = picks its target at random among those in reach (Outrage)        charge  1 = two-turn (fires next phase)
//   grow  { track, pow, acc, sp, at: [[level, { n?, r?, s? }], …] } — at move level 99: power × pow, accuracy + acc,
//         SP cost × sp; `at` = the milestone levels where the area / reach / shape grows (owner: levels 1–99, move XP
//         from damage dealt with it; a status move earns it per target affected)
//   note  why it got this shape (a person reads it on the review page)
//
// ABILITY { s, n, on, aff, note }   (abilities are static: they never level)
//   s     self | aura (always on, within n) | burst (once, within n) | map | zone (foes within n can't walk away freely) |
//         pull (draws matching moves aimed within n) | paint (terrain diamond n around the user) | trap (hazards around)
//   on    always | enter (when it lands on the map) | hit (when it is hit) | contact (hit by a contact move) | attack | ko | turn
//   aff   self | foe | ally | all
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

export function build() {
	const ours = J('overworld/data/moves_battle.json');
	const SD = J('tools/poketactica/showdown_moves.min.json');
	const SDA = J('tools/poketactica/showdown_abilities.min.json');
	const OV = J('poketactica/data/shape_overrides.json');
	const speciesAb = J('overworld/data/species_abilities.json');

	const moves = {};
	for (const id of Object.keys(ours).sort()) {
		const m = moveShape(id, ours[id], SD[id] || null);
		const o = OV.moves[id];
		moves[id] = o ? applyOverride(m, o) : m;
	}
	const abIds = [...new Set(Object.values(speciesAb).flat().filter((a) => typeof a === 'string'))].sort();
	const abilities = {};
	for (const a of abIds) {
		const x = abilityShape(a, SDA[a] || null);
		const o = OV.abilities[a];
		abilities[a] = o ? { ...x, ...o, note: o.note || x.note } : x;
	}
	return { moves, abilities };
}

const applyOverride = (m, o) => {
	const out = { ...m, ...o };
	if (o.grow) out.grow = { ...m.grow, ...o.grow };
	if (!o.note) out.note = m.note + ' (hand-tuned)';
	for (const k of Object.keys(out)) if (out[k] === null) delete out[k];
	return out;
};

// ---- name families the flags don't carry
const BEAM = /beam|cannon|hydro ?pump|blast burn|frenzy plant|flamethrower|prismatic laser|photon geyser|laser|steel beam|eternabeam|dynamax|mist ball|luster purge|origin pulse|aeroblast|spacial rend|roar of time/i;
const FLY = new Set(['fly', 'bounce', 'skydrop']);
const DIG = new Set(['dig', 'dive', 'phantomforce', 'shadowforce']);
const LINE_GROUND = new Set(['fissure', 'thousandwaves', 'precipiceblades', 'headlongrush', 'stompingtantrum']);

export function moveShape(id, m, x) {
	const cat = m.category, pw = m.power | 0, acc = m.acc | 0, pri = m.priority | 0;
	const tg = x ? x.target : (cat === 'Status' ? 'self' : 'normal');
	const F = new Set(x ? x.flags : []), has = (f) => F.has(f);
	const status = cat === 'Status', contact = has('contact');
	const r = (a, b) => [a, b];
	let s = 'one', n = 0, rr = r(1, 3), t = status ? 'foe' : 'foe', h = 'beam', note = '', ff = 0, kb = 0, piv = 0, rand = 0;

	if (tg === 'self' || tg === 'scripted') {
		s = 'self'; rr = r(0, 0); t = 'self'; h = 'any';
		note = tg === 'scripted' ? 'a reaction: it answers the hit the user takes' : x && (x.stallingMove) ? 'guards the user for the phase' : 'works on the user';
		if (id === 'allyswitch') { s = 'swap'; rr = r(1, 3); t = 'ally'; note = 'trades places with an ally in reach'; }
		if (x && x.selfdestruct && !status) { s = 'burst'; n = 2; ff = 1; note = 'explodes around the user'; }
	} else if (x && x.weather) { s = 'map'; rr = r(0, 0); t = 'tile'; h = 'any'; note = 'weather covers the whole map'; }
	else if (x && x.terrain) { s = 'paint'; n = 2; rr = r(0, 3); t = 'tile'; h = 'any'; note = 'paints its terrain as a Geo colour (a diamond of radius 2)'; }
	else if (x && x.pseudoWeather) { s = 'map'; rr = r(0, 0); t = 'tile'; h = 'any'; note = 'a field rule for the whole map'; }
	else if (tg === 'foeSide') { s = 'trap'; n = 1; rr = r(1, 4); t = 'tile'; h = 'lob'; note = 'sets its hazard on the tiles around the target tile'; }
	else if (tg === 'allySide' || tg === 'allyTeam' || tg === 'allies') { s = 'aura'; n = 2; rr = r(0, 0); t = 'ally'; h = 'any'; note = 'covers the user\'s side within 2 tiles'; }
	else if (tg === 'adjacentAlly') { s = 'one'; rr = r(1, 1); t = 'ally'; h = 'any'; note = 'an adjacent ally'; }
	else if (tg === 'adjacentAllyOrSelf') { s = 'one'; rr = r(0, 1); t = 'ally'; h = 'any'; note = 'the user or an adjacent ally'; }
	else if (tg === 'all') { s = id === 'perishsong' ? 'burst' : 'map'; n = id === 'perishsong' ? 3 : 0; ff = id === 'perishsong' ? 1 : 0; rr = r(0, 0); t = 'tile'; h = 'any'; note = id === 'perishsong' ? 'everyone within 3 hears it, the user\'s side too' : 'affects the whole map'; }
	else if (tg === 'allAdjacent') {
		s = 'burst'; ff = 1; rr = r(0, 0); t = 'tile'; h = 'any';
		n = x && x.selfdestruct ? 3 : pw >= 90 ? 2 : 1;   // (Surf, Discharge: a big wave / burst)
		note = `hits everyone within ${n} of the user, allies too (Pokémon's own rule for this move)`;
	} else if (tg === 'allAdjacentFoes') {
		if (status) { s = 'burst'; n = 2; rr = r(0, 0); t = 'foe'; h = 'any'; note = 'every foe within 2 of the user'; }
		else if (has('wind') || has('sound')) { s = 'cone'; n = 3; rr = r(1, 1); h = 'any'; note = (has('wind') ? 'a gust' : 'a sound') + ' that fans out in front: a cone 3 deep'; }
		else if (has('slicing') && !contact) { s = 'cone'; n = 2; rr = r(1, 1); h = 'any'; note = 'a flurry of blades fanning out in front: a cone 2 deep'; }
		else if (cat === 'Physical' && !contact) { s = 'dia'; n = 1; rr = r(1, 4); h = 'lob'; note = 'falls on a small area (a diamond of radius 1) at range'; }
		else if (contact) { s = 'arc'; n = 1; rr = r(1, 1); h = 'melee'; note = 'a sweep: the 3 tiles in front'; }
		else { s = 'arc'; n = 2; rr = r(1, 1); h = 'beam'; note = 'spreads in front: 3 wide, 2 deep'; }
	} else if (tg === 'randomNormal') { s = 'one'; rr = r(1, 1); rand = 1; h = 'melee'; note = 'thrashes at a random foe next to it'; }
	else {
		// normal / any / adjacentFoe: one target
		const reach = tg === 'any' ? 5 : 3;
		if (status) {
			if (x && x.heal || /heal|floral|pollen/i.test(m.name) && !x?.boosts) { t = 'ally'; rr = r(1, 4); h = 'any'; note = 'heals an ally in reach'; }
			else if (x && x.forceSwitch) { rr = r(1, 2); kb = 3; h = 'any'; note = 'blows the target back 3 tiles'; }
			else { t = 'any'; rr = r(1, reach); h = has('sound') || has('powder') ? 'any' : 'beam'; note = `any unit within ${reach} (a foe, or an ally — as in Pokémon doubles)`; }
		} else if (FLY.has(id)) { s = 'leap'; rr = r(2, 5); h = 'any'; note = 'flies up, then strikes anywhere within 5 (over any height)'; }
		else if (DIG.has(id)) { s = 'leap'; rr = r(2, 4); h = 'any'; note = 'vanishes, then strikes up to 4 away'; }
		else if (LINE_GROUND.has(id)) { s = 'line'; n = 4; rr = r(1, 1); h = 'any'; note = 'a crack along the ground, 4 tiles'; }
		else if (contact && pri > 0) { s = 'dash'; n = 2 + Math.min(2, pri); rr = r(1, n); h = 'melee'; note = `a priority move: dashes up to ${n} tiles and strikes`; }
		else if (contact && x && x.recoil) { s = 'dash'; n = 3; rr = r(1, 3); h = 'melee'; note = 'a reckless charge: up to 3 tiles in a line'; }
		else if (contact) {
			rr = r(1, 1); h = 'melee'; note = 'melee: an adjacent foe';
			if (x && x.forceSwitch) { kb = 2; note = 'melee, and throws the target back 2 tiles'; }
			if (x && x.selfSwitch) { piv = 3; note = 'melee, then the user may move 3 more tiles'; }
		} else if (BEAM.test(m.name)) { s = 'line'; n = pw >= 120 ? 5 : pw >= 80 ? 4 : 3; rr = r(1, 1); h = 'beam'; note = `a beam: ${n} tiles straight, through everyone on them`; }
		else if (has('pulse')) { rr = r(1, 5); h = 'beam'; note = 'a pulse: reaches 5'; }
		else if (has('bullet')) { rr = r(1, 4); h = 'lob'; note = 'a lobbed shot: reaches 4 over walls'; }
		else if (has('sound')) { rr = r(1, 3); h = 'any'; note = 'a sound: reaches 3, through walls'; }
		else if (pri > 0) { rr = r(1, 4); h = 'beam'; note = 'a priority shot: quick, reaches 4'; }
		else if (cat === 'Physical') { rr = r(1, tg === 'any' ? 4 : 2); h = 'lob'; note = `a thrown / ranged physical hit: reaches ${rr[1]}`; }
		else { rr = r(1, reach); h = 'beam'; note = `a ranged special hit: reaches ${reach}`; }
		if (x && x.selfSwitch && !piv) { piv = 3; note += '; then the user may move 3 more tiles'; }
	}
	if (status && tg !== 'self' && tg !== 'scripted' && t === 'foe' && x && x.target === 'adjacentFoe') { rr = r(1, 1); h = 'melee'; }
	const charge = !!(x && x.charge) && s !== 'leap';
	if (charge) note += '; charges for a phase first';

	// SP cost: damage by power (area costs more), status by kind
	const area = ['line', 'cone', 'arc', 'dia', 'burst', 'cross'].includes(s);
	let sp;
	if (status) sp = ['map', 'paint', 'trap', 'aura'].includes(s) ? 8 : s === 'self' ? 4 : 5;
	else { const hits = x && Array.isArray(x.multihit) ? (x.multihit[0] + x.multihit[1]) / 2 : x && x.multihit ? x.multihit : 1; sp = Math.max(2, Math.ceil((pw || 60) * hits / 10)); if (area) sp = Math.ceil(sp * 1.5); }
	if (x && x.ohko) sp = 20;

	// growth (owner: each move its own way): the track sets power / accuracy / SP at 99, `at` the milestones
	let grow;
	const accUp = acc > 0 && acc < 100 ? Math.min(15, 100 - acc) : 0;
	if (x && x.ohko) grow = { track: 'fixed', pow: 1, acc: 10, sp: 0.5, at: [] };
	else if (status) {
		if (s === 'self') grow = { track: 'buff', pow: 1, acc: 0, sp: 0.5, at: [[99, { s: 'aura', n: 1 }]] };
		else if (['map'].includes(s)) grow = { track: 'field', pow: 1, acc: 0, sp: 0.5, at: [] };
		else if (['paint', 'trap', 'aura', 'burst'].includes(s)) grow = { track: 'field', pow: 1, acc: 0, sp: 0.6, at: [[50, { n: n + 1 }], [99, { n: n + 2 }]] };
		else grow = { track: 'status', pow: 1, acc: Math.max(accUp, 0), sp: 0.6, at: [[60, { r: [rr[0], rr[1] + 1] }], [99, { s: 'cross', n: 1 }]] };
	} else if (area) grow = { track: 'area', pow: 1.5, acc: accUp, sp: 0.8, at: [[30, { n: n + 1 }], [99, { n: n + 2 }]] };
	else if (s === 'dash') grow = { track: 'power', pow: 1.8, acc: accUp, sp: 0.8, at: [[50, { n: n + 1, r: [1, n + 1] }]] };
	else if (s === 'leap' || rr[1] >= 4) grow = { track: 'reach', pow: 1.6, acc: accUp, sp: 0.8, at: [[33, { r: [rr[0], rr[1] + 1] }], [66, { r: [rr[0], rr[1] + 2] }]] };
	else grow = { track: 'power', pow: 2, acc: accUp, sp: 0.8, at: [] };

	const out = { s, n, r: rr, t, h, sp, pp: m.pp | 0, grow, note: note || 'the target' };
	if (ff) out.ff = 1;
	if (kb) out.kb = kb;
	if (piv) out.piv = piv;
	if (rand) out.rand = 1;
	if (charge) out.charge = 1;
	return out;
}

// ---- abilities
const A = (s, n, on, aff, note) => ({ s, n, on, aff, note });
const WEATHER = new Set(['drought', 'drizzle', 'sandstream', 'snowwarning', 'primordialsea', 'desolateland', 'deltastream', 'orichalcumpulse']);
const NO_WEATHER = new Set(['cloudnine', 'airlock']);
const SURGE = new Set(['electricsurge', 'grassysurge', 'psychicsurge', 'mistysurge', 'hadronengine']);
const ENTER_FOE = { intimidate: 'lowers the Attack of every foe within 2', frisk: 'reveals the held items of foes within 3', anticipation: 'warns of foes within 3 with a super-effective move', forewarn: 'reveals the strongest move of foes within 3', supersweetsyrup: 'lowers the evasion of foes within 2', trace: 'copies the ability of the nearest foe within 3', download: 'compares the nearest foe\'s defences within 3', imposter: 'transforms into the nearest foe within 3' };
const AURA_FOE = { pressure: 'foes within 2 pay +1 SP for their moves', unnerve: 'foes within 2 can\'t eat berries', vesselofruin: 'lowers the Sp. Atk of everyone else within 2', swordofruin: 'lowers the Defense of everyone else within 2', tabletsofruin: 'lowers the Attack of everyone else within 2', beadsofruin: 'lowers the Sp. Def of everyone else within 2' };
const AURA_ALL = { damp: [3, 'no one within 3 can explode'], neutralizinggas: [2, 'abilities within 2 stop working'], fairyaura: [3, 'Fairy moves within 3 hit harder'], darkaura: [3, 'Dark moves within 3 hit harder'], aurabreak: [3, 'reverses the auras within 3'], dancer: [3, 'copies dance moves used within 3'] };
const ALLY_ADJ = { friendguard: 'adjacent allies take less damage', plus: 'powers up with an adjacent Plus/Minus ally', minus: 'powers up with an adjacent Plus/Minus ally', battery: 'adjacent allies\' special moves hit harder', powerspot: 'adjacent allies\' moves hit harder', healer: 'may cure adjacent allies\' status each turn', flowergift: 'in sun, adjacent allies gain Attack and Sp. Def', telepathy: 'the user is never hit by its allies\' moves', steelyspirit: 'adjacent allies\' Steel moves hit harder', aromaveil: 'protects adjacent allies from Taunt and the like', sweetveil: 'adjacent allies can\'t fall asleep', pastelveil: 'adjacent allies can\'t be poisoned', flowerveil: 'adjacent Grass allies\' stats can\'t be lowered', symbiosis: 'passes its item to an adjacent ally that used one', receiver: 'takes the ability of an adjacent ally that faints', powerofalchemy: 'takes the ability of an adjacent ally that faints', costar: 'copies an adjacent ally\'s stat changes when it lands', hospitality: 'heals adjacent allies when it lands', victorystar: 'raises accuracy of allies within 2', commander: 'teams up with an adjacent Dondozo' };
const ZONE = { arenatrap: 'grounded foes within 1 can\'t walk away freely', shadowtag: 'foes within 1 can\'t walk away freely', magnetpull: 'Steel foes within 2 can\'t walk away freely' };
const PULL = { lightningrod: 'draws Electric moves aimed within 3', stormdrain: 'draws Water moves aimed within 3' };
const CONTACT = new Set(['static', 'flamebody', 'roughskin', 'ironbarbs', 'poisonpoint', 'effectspore', 'cutecharm', 'gooey', 'tanglinghair', 'mummy', 'wanderingspirit', 'lingeringaroma', 'perishbody', 'pickpocket', 'poisontouch', 'toxicchain']);

export function abilityShape(id, desc) {
	const d = desc || '';
	if (WEATHER.has(id)) return A('map', 0, 'enter', 'all', 'sets its weather over the whole map when it lands');
	if (NO_WEATHER.has(id)) return A('map', 0, 'always', 'all', 'weather has no effect anywhere on the map');
	if (SURGE.has(id)) return A('paint', 2, 'enter', 'all', 'paints its terrain (a Geo colour) around itself, radius 2, when it lands');
	if (id === 'seedsower') return A('paint', 1, 'hit', 'all', 'paints Grassy Terrain around itself, radius 1, when hit');
	if (id === 'sandspit') return A('map', 0, 'hit', 'all', 'whips up a sandstorm over the map when hit');
	if (id === 'toxicdebris') return A('trap', 1, 'hit', 'foe', 'scatters Toxic Spikes on the tiles around it when hit by a physical move');
	if (id === 'cottondown') return A('burst', 1, 'hit', 'all', 'when hit, lowers the Speed of everyone else within 1');
	if (ENTER_FOE[id]) return A('burst', id === 'intimidate' || id === 'supersweetsyrup' ? 2 : 3, 'enter', 'foe', ENTER_FOE[id] + ' when it lands');
	if (AURA_FOE[id]) return A('aura', 2, 'always', /everyone else/.test(AURA_FOE[id]) ? 'all' : 'foe', AURA_FOE[id]);
	if (AURA_ALL[id]) return A('aura', AURA_ALL[id][0], 'always', 'all', AURA_ALL[id][1]);
	if (ALLY_ADJ[id]) return A('aura', id === 'victorystar' ? 2 : 1, ['costar', 'hospitality'].includes(id) ? 'enter' : 'always', id === 'telepathy' ? 'self' : 'ally', ALLY_ADJ[id]);
	if (ZONE[id]) return A('zone', id === 'magnetpull' ? 2 : 1, 'always', 'foe', ZONE[id]);
	if (PULL[id]) return A('pull', 3, 'always', 'foe', PULL[id]);
	if (id === 'aftermath') return A('self', 0, 'ko', 'foe', 'when knocked out by a contact move, hurts the attacker');
	if (id === 'innardsout') return A('self', 0, 'ko', 'foe', 'when knocked out, hurts the attacker by the HP it had left');
	if (CONTACT.has(id)) return A('self', 0, 'contact', 'foe', 'works on whoever touches it: ' + (d || id));
	return A('self', 0, 'always', 'self', d ? d : 'custom ability (no Showdown text): works on the user only');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const { moves, abilities } = build();
	fs.mkdirSync(path.join(ROOT, 'poketactica/data'), { recursive: true });
	fs.writeFileSync(path.join(ROOT, 'poketactica/data/move_shapes.json'), JSON.stringify(moves, null, 0).replace(/\},"/g, '},\n"') + '\n');
	fs.writeFileSync(path.join(ROOT, 'poketactica/data/ability_shapes.json'), JSON.stringify(abilities, null, 0).replace(/\},"/g, '},\n"') + '\n');
	const by = (o, k) => Object.values(o).reduce((a, x) => ((a[x[k]] = (a[x[k]] || 0) + 1), a), {});
	console.log('moves', Object.keys(moves).length, JSON.stringify(by(moves, 's')));
	console.log('abilities', Object.keys(abilities).length, JSON.stringify(by(abilities, 's')));
}
