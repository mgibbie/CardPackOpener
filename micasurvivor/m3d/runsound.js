// runsound.js — MicaSurvivor 3D, going live (Plans/MICASURVIVOR_3D_PLAN.md §5.43): a run's SOUND. The 2D game makes all
// of its sound as it plays (js/core/audio.js: a synthesizer, no files), and names each effect. This says which of those
// names a 3D run's events are, and which of its themes plays; the page hands them to the 2D game's own G.Audio.
//
// Pure: events in, names out. The effects' own limits (how often one may repeat, how many at once) are G.Audio's.

/** The effects of one tick's events. events: the fight's and the run's (combat.js, expedition.js);
 *  moveOf(id) -> { kind, type } (the move's, for a shot's voice). -> [[name, opts | undefined]] */
export function soundsOf(events, moveOf = () => null) {
	const out = [];
	for (const ev of events || []) {
		switch (ev.k) {
			case 'shot': { const m = moveOf(ev.id) || {}; out.push(['shot', { kind: m.kind || 'bolt', type: m.type }]); break; }
			case 'melee': { const m = moveOf(ev.id) || {}; out.push(['shot', { kind: 'melee', type: m.type }]); break; }
			case 'aura': { const m = moveOf(ev.id) || {}; out.push(['shot', { kind: 'aura', type: m.type }]); break; }
			case 'smite': out.push(['shot', { kind: 'nova' }]); break;
			case 'hit': out.push(['hit']); break;
			case 'kill': out.push([ev.boss ? 'bossDown' : 'faint']); break;
			case 'hurt': out.push(['hurt']); break;
			case 'shielded': case 'sturdy': out.push(['break']); break;
			case 'levelup': out.push(['levelup']); break;
			case 'chose': out.push(['confirm']); break;
			case 'pickup': out.push([ev.kind === 'coin' ? 'coin' : ev.kind === 'heal' ? 'heal' : ev.kind === 'item' ? 'chest' : 'xp']); break;
			case 'item': out.push(['chest']); break;
			case 'pick': out.push(['reveal']); break;
			case 'spin': out.push([ev.win ? 'coin' : 'error']); break;
			case 'cine': out.push(['ball']); break;
			case 'caught': out.push([ev.kind === 'shiny' ? 'shinyGet' : 'legend']); break;
			case 'wild': out.push(['boss']); break;
			case 'summon': case 'leap': out.push(['surge']); break;
			case 'thud': out.push(['quake']); break;
			case 'evolve': case 'mega': out.push(['surge']); break;
			case 'zone': out.push(['descend']); break;
			case 'revived': out.push(['heal']); break;
			case 'weather': if (ev.kind) out.push(['biome']); break;
			case 'runover': out.push([ev.won ? 'legend' : 'gameover']); break;
			default: break;
		}
	}
	return out;
}
/** The effects of how you moved this tick (sim.js's marks on the state). */
export function moveSounds(s) {
	const out = [];
	if (!s) return out;
	if (s.hard) out.push(['quake']); else if (s.landed > 9) out.push(['land']);
	if (s.bounced) out.push(['surge']);
	if (s.railed) out.push(['shake']);
	if (s.jumped === 3 || s.jumped === 4 || s.jumped === 5) out.push(['select']);   // (off a wall, a rail, a bank)
	return out;
}
/** The theme a run plays. o: { over, boss (one is on the field), mapIndex, tracks: G.BIOME_MUSIC } -> its name or null */
export function musicOf(o) {
	if (o.over) return null;
	if (o.boss) return 'boss';
	const t = o.tracks || [];
	return t.length ? t[((o.mapIndex | 0) % t.length + t.length) % t.length] : null;
}
