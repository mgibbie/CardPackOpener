// ow_postgame.js — the postgame arc as guidance: JohKanto's gyms, the legendary hunt's counter and rumors, and the objective / quest-log rows that point at them (split from main.js).
import * as Badges from './badges.js';
import * as Story from './events.js';
import { battle } from './ow_core.js';
import { LEGENDARY_ENCOUNTERS } from './ow_legendaries.js';
import * as Dex from './pokedex.js';

// ---------- the postgame arc, as guidance ----------
// The content exists (JohKanto's 8 gyms, the Mt Silver league, 87+ placed
// legendaries); this is the layer that TELLS the player so. Lives here rather
// than quest.js because it reads the legendary registry, which is main's.
const JOHKANTO_GYMS = [
	['BROCK', 'PEWTER CITY'], ['MISTY', 'CERULEAN CITY'], ['LT. SURGE', 'VERMILION CITY'],
	['ERIKA', 'CELADON CITY'], ['JANINE', 'FUCHSIA CITY'], ['SABRINA', 'SAFFRON CITY'],
	['BLAINE', 'CINNABAR ISLAND'], ['BLUE', 'VIRIDIAN CITY'],
];
export function legendStats() {
	const species = [...new Set(Object.values(LEGENDARY_ENCOUNTERS).map(e => e.species))];
	return { caught: species.filter(s => Dex.isCaught(s)).length, total: species.length };
}
// one uncaught legend's lair, as a rumor — the hunt had NO structure: no
// counter, no hints, just blind flood-crawling three regions' dungeons
function legendRumor() {
	const entry = Object.entries(LEGENDARY_ENCOUNTERS).find(([, e]) => !Dex.isCaught(e.species));
	if (!entry) return null;
	const pretty = entry[0].replace(/^MAP_(JOHKANTO_)?/, '').replace(/_/g, ' ');
	return `Rumor places ${(battle.data?.species?.[entry[1].species]?.name || entry[1].species).toUpperCase()} in ${pretty}.`;
}
export function postgameObjective() {
	if (!Badges.isChampion('JOHTO')) return null;   // the postgame opens on the JOHTO crown
	const jk = Badges.count('JOHKANTO');
	if (!Story.getFlag('beat_red')) {
		if (jk >= 8) return 'All 16 badges! The silent trainer RED waits at the summit of MT SILVER.';
		return `The MAGNET TRAIN runs again — the KANTO of old awaits. ${8 - jk} of its GYMS remain. (Board at GOLDENROD.)`;
	}
	const { caught, total } = legendStats();
	if (caught >= total) return 'RED has fallen and every legend is caught. The world is yours to wander.';
	return `RED has fallen. ${total - caught} legendary POKeMON still hide in the deep places (${caught}/${total}). ${legendRumor() || ''}`;
}
// quest-log rows for the same arc (appended to the region log by drawQuest)
export function postgameLog() {
	if (!Badges.isChampion('JOHTO')) return [];
	const jk = Badges.count('JOHKANTO');
	const rows = JOHKANTO_GYMS.map(([leader, town], i) => ({
		label: `${leader} — ${town}`,
		state: i < jk ? 'done' : (i === jk ? 'current' : 'locked'),
	}));
	rows.push({ label: 'RED — MT SILVER', state: Story.getFlag('beat_red') ? 'done' : (jk >= 8 ? 'current' : 'locked') });
	const { caught, total } = legendStats();
	rows.push({ label: `LEGENDS — ${caught}/${total}`, state: caught >= total ? 'done' : (Story.getFlag('beat_red') ? 'current' : 'locked') });
	return rows;
}
