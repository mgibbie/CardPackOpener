// encounters_daynight.js — AUTHENTIC per-map day/night GRASS tables for JOHTO + JohKanto
// (Gen-2), extracted from pokecrystal data/wild/{johto,kanto}_grass.asm by
// tools/gen_johto_daynight.mjs. The base wild data (owdata data/encounters.json) is read-only
// and has no time-of-day split, so the real morning/day/night species lists live here in
// code. encounters.js prefers DAYNIGHT[map][kind][phase] over the base table (no reweighting —
// these are already time-specific). Slot weights are the Gen-2 grass rates [30,30,20,10,5,4,1].
// Kanto(FR) and Hoenn(Em) are Gen-3 (no vanilla day/night) — they keep encounters.js's
// reweighting/overlay. GENERATED — do not edit by hand; re-run the tool to regenerate.
export const DAYNIGHT = {
	'MAP_SPROUT_TOWER_2F': { land: {
		morning: [{id:'rattata',min:3,max:3,w:30},{id:'rattata',min:4,max:4,w:30},{id:'rattata',min:5,max:5,w:20},{id:'rattata',min:3,max:3,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:5,max:5,w:4},{id:'rattata',min:5,max:5,w:1}],
		day: [{id:'rattata',min:3,max:3,w:30},{id:'rattata',min:4,max:4,w:30},{id:'rattata',min:5,max:5,w:20},{id:'rattata',min:3,max:3,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:5,max:5,w:4},{id:'rattata',min:5,max:5,w:1}],
		night: [{id:'gastly',min:3,max:3,w:30},{id:'gastly',min:4,max:4,w:30},{id:'gastly',min:5,max:5,w:20},{id:'rattata',min:3,max:3,w:10},{id:'gastly',min:6,max:6,w:5},{id:'rattata',min:5,max:5,w:4},{id:'rattata',min:5,max:5,w:1}],
	} },
	'MAP_SPROUT_TOWER_3F': { land: {
		morning: [{id:'rattata',min:3,max:3,w:30},{id:'rattata',min:4,max:4,w:30},{id:'rattata',min:5,max:5,w:20},{id:'rattata',min:3,max:3,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:5,max:5,w:4},{id:'rattata',min:5,max:5,w:1}],
		day: [{id:'rattata',min:3,max:3,w:30},{id:'rattata',min:4,max:4,w:30},{id:'rattata',min:5,max:5,w:20},{id:'rattata',min:3,max:3,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:5,max:5,w:4},{id:'rattata',min:5,max:5,w:1}],
		night: [{id:'gastly',min:3,max:3,w:30},{id:'gastly',min:4,max:4,w:30},{id:'gastly',min:5,max:5,w:20},{id:'rattata',min:3,max:3,w:10},{id:'gastly',min:6,max:6,w:5},{id:'rattata',min:5,max:5,w:4},{id:'rattata',min:5,max:5,w:1}],
	} },
	'MAP_TIN_TOWER_2F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_TIN_TOWER_3F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_TIN_TOWER_4F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_TIN_TOWER_5F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_TIN_TOWER_6F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_TIN_TOWER_7F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_TIN_TOWER_8F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_TIN_TOWER_9F': { land: {
		morning: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		day: [{id:'rattata',min:20,max:20,w:30},{id:'rattata',min:21,max:21,w:30},{id:'rattata',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
		night: [{id:'gastly',min:20,max:20,w:30},{id:'gastly',min:21,max:21,w:30},{id:'gastly',min:22,max:22,w:20},{id:'rattata',min:22,max:22,w:10},{id:'rattata',min:23,max:23,w:5},{id:'rattata',min:24,max:24,w:4},{id:'rattata',min:24,max:24,w:1}],
	} },
	'MAP_BURNED_TOWER_1F': { land: {
		morning: [{id:'rattata',min:13,max:13,w:30},{id:'koffing',min:14,max:14,w:30},{id:'rattata',min:15,max:15,w:20},{id:'zubat',min:14,max:14,w:10},{id:'rattata',min:15,max:15,w:5},{id:'raticate',min:15,max:15,w:4},{id:'raticate',min:15,max:15,w:1}],
		day: [{id:'rattata',min:13,max:13,w:30},{id:'koffing',min:14,max:14,w:30},{id:'rattata',min:15,max:15,w:20},{id:'zubat',min:14,max:14,w:10},{id:'rattata',min:15,max:15,w:5},{id:'raticate',min:15,max:15,w:4},{id:'raticate',min:15,max:15,w:1}],
		night: [{id:'rattata',min:13,max:13,w:30},{id:'koffing',min:14,max:14,w:30},{id:'rattata',min:15,max:15,w:20},{id:'zubat',min:14,max:14,w:10},{id:'rattata',min:15,max:15,w:5},{id:'raticate',min:15,max:15,w:4},{id:'raticate',min:15,max:15,w:1}],
	} },
	'MAP_BURNED_TOWER_B1F': { land: {
		morning: [{id:'rattata',min:14,max:14,w:30},{id:'koffing',min:14,max:14,w:30},{id:'koffing',min:16,max:16,w:20},{id:'zubat',min:15,max:15,w:10},{id:'koffing',min:12,max:12,w:5},{id:'koffing',min:16,max:16,w:4},{id:'weezing',min:16,max:16,w:1}],
		day: [{id:'rattata',min:14,max:14,w:30},{id:'koffing',min:14,max:14,w:30},{id:'koffing',min:16,max:16,w:20},{id:'zubat',min:15,max:15,w:10},{id:'koffing',min:12,max:12,w:5},{id:'koffing',min:16,max:16,w:4},{id:'weezing',min:16,max:16,w:1}],
		night: [{id:'rattata',min:14,max:14,w:30},{id:'koffing',min:14,max:14,w:30},{id:'koffing',min:16,max:16,w:20},{id:'zubat',min:15,max:15,w:10},{id:'koffing',min:12,max:12,w:5},{id:'koffing',min:16,max:16,w:4},{id:'weezing',min:16,max:16,w:1}],
	} },
	'MAP_NATIONAL_PARK': { land: {
		morning: [{id:'nidoranm',min:12,max:12,w:30},{id:'nidoranf',min:12,max:12,w:30},{id:'ledyba',min:14,max:14,w:20},{id:'pidgey',min:13,max:13,w:10},{id:'caterpie',min:10,max:10,w:5},{id:'weedle',min:10,max:10,w:4},{id:'weedle',min:10,max:10,w:1}],
		day: [{id:'nidoranf',min:12,max:12,w:30},{id:'nidoranm',min:12,max:12,w:30},{id:'sunkern',min:14,max:14,w:20},{id:'pidgey',min:13,max:13,w:10},{id:'caterpie',min:10,max:10,w:5},{id:'weedle',min:10,max:10,w:4},{id:'weedle',min:10,max:10,w:1}],
		night: [{id:'psyduck',min:12,max:12,w:30},{id:'hoothoot',min:13,max:13,w:30},{id:'spinarak',min:14,max:14,w:20},{id:'hoothoot',min:15,max:15,w:10},{id:'venonat',min:10,max:10,w:5},{id:'venonat',min:12,max:12,w:4},{id:'venonat',min:12,max:12,w:1}],
	} },
	'MAP_RUINS_OF_ALPH_OUTSIDE': { land: {
		morning: [{id:'natu',min:20,max:20,w:30},{id:'natu',min:22,max:22,w:30},{id:'natu',min:18,max:18,w:20},{id:'natu',min:24,max:24,w:10},{id:'smeargle',min:20,max:20,w:5},{id:'smeargle',min:22,max:22,w:4},{id:'smeargle',min:22,max:22,w:1}],
		day: [{id:'natu',min:20,max:20,w:30},{id:'natu',min:22,max:22,w:30},{id:'natu',min:18,max:18,w:20},{id:'natu',min:24,max:24,w:10},{id:'smeargle',min:20,max:20,w:5},{id:'smeargle',min:22,max:22,w:4},{id:'smeargle',min:22,max:22,w:1}],
		night: [{id:'natu',min:20,max:20,w:30},{id:'natu',min:22,max:22,w:30},{id:'natu',min:18,max:18,w:20},{id:'natu',min:24,max:24,w:10},{id:'wooper',min:22,max:22,w:5},{id:'quagsire',min:22,max:22,w:4},{id:'quagsire',min:22,max:22,w:1}],
	} },
	'MAP_RUINS_OF_ALPH_INNER_CHAMBER': { land: {
		morning: [{id:'unown',min:5,max:5,w:30},{id:'unown',min:5,max:5,w:30},{id:'unown',min:5,max:5,w:20},{id:'unown',min:5,max:5,w:10},{id:'unown',min:5,max:5,w:5},{id:'unown',min:5,max:5,w:4},{id:'unown',min:5,max:5,w:1}],
		day: [{id:'unown',min:5,max:5,w:30},{id:'unown',min:5,max:5,w:30},{id:'unown',min:5,max:5,w:20},{id:'unown',min:5,max:5,w:10},{id:'unown',min:5,max:5,w:5},{id:'unown',min:5,max:5,w:4},{id:'unown',min:5,max:5,w:1}],
		night: [{id:'unown',min:5,max:5,w:30},{id:'unown',min:5,max:5,w:30},{id:'unown',min:5,max:5,w:20},{id:'unown',min:5,max:5,w:10},{id:'unown',min:5,max:5,w:5},{id:'unown',min:5,max:5,w:4},{id:'unown',min:5,max:5,w:1}],
	} },
	'MAP_UNION_CAVE_1F': { land: {
		morning: [{id:'geodude',min:6,max:6,w:30},{id:'sandshrew',min:6,max:6,w:30},{id:'zubat',min:5,max:5,w:20},{id:'rattata',min:4,max:4,w:10},{id:'zubat',min:7,max:7,w:5},{id:'onix',min:6,max:6,w:4},{id:'onix',min:6,max:6,w:1}],
		day: [{id:'geodude',min:6,max:6,w:30},{id:'sandshrew',min:6,max:6,w:30},{id:'zubat',min:5,max:5,w:20},{id:'rattata',min:4,max:4,w:10},{id:'zubat',min:7,max:7,w:5},{id:'onix',min:6,max:6,w:4},{id:'onix',min:6,max:6,w:1}],
		night: [{id:'geodude',min:6,max:6,w:30},{id:'rattata',min:6,max:6,w:30},{id:'wooper',min:5,max:5,w:20},{id:'rattata',min:4,max:4,w:10},{id:'zubat',min:7,max:7,w:5},{id:'onix',min:6,max:6,w:4},{id:'onix',min:6,max:6,w:1}],
	} },
	'MAP_UNION_CAVE_B1F': { land: {
		morning: [{id:'geodude',min:8,max:8,w:30},{id:'zubat',min:6,max:6,w:30},{id:'zubat',min:8,max:8,w:20},{id:'onix',min:8,max:8,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:8,max:8,w:4},{id:'rattata',min:8,max:8,w:1}],
		day: [{id:'geodude',min:8,max:8,w:30},{id:'zubat',min:6,max:6,w:30},{id:'zubat',min:8,max:8,w:20},{id:'onix',min:8,max:8,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:8,max:8,w:4},{id:'rattata',min:8,max:8,w:1}],
		night: [{id:'geodude',min:8,max:8,w:30},{id:'zubat',min:6,max:6,w:30},{id:'wooper',min:8,max:8,w:20},{id:'onix',min:8,max:8,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:8,max:8,w:4},{id:'rattata',min:8,max:8,w:1}],
	} },
	'MAP_UNION_CAVE_B2F': { land: {
		morning: [{id:'zubat',min:22,max:22,w:30},{id:'golbat',min:22,max:22,w:30},{id:'zubat',min:22,max:22,w:20},{id:'raticate',min:21,max:21,w:10},{id:'geodude',min:20,max:20,w:5},{id:'onix',min:23,max:23,w:4},{id:'onix',min:23,max:23,w:1}],
		day: [{id:'zubat',min:22,max:22,w:30},{id:'golbat',min:22,max:22,w:30},{id:'zubat',min:22,max:22,w:20},{id:'raticate',min:21,max:21,w:10},{id:'geodude',min:20,max:20,w:5},{id:'onix',min:23,max:23,w:4},{id:'onix',min:23,max:23,w:1}],
		night: [{id:'zubat',min:22,max:22,w:30},{id:'golbat',min:22,max:22,w:30},{id:'quagsire',min:22,max:22,w:20},{id:'raticate',min:21,max:21,w:10},{id:'geodude',min:20,max:20,w:5},{id:'onix',min:23,max:23,w:4},{id:'onix',min:23,max:23,w:1}],
	} },
	'MAP_SLOWPOKE_WELL_B1F': { land: {
		morning: [{id:'zubat',min:5,max:5,w:30},{id:'zubat',min:6,max:6,w:30},{id:'zubat',min:7,max:7,w:20},{id:'slowpoke',min:6,max:6,w:10},{id:'zubat',min:8,max:8,w:5},{id:'slowpoke',min:8,max:8,w:4},{id:'slowpoke',min:8,max:8,w:1}],
		day: [{id:'zubat',min:5,max:5,w:30},{id:'zubat',min:6,max:6,w:30},{id:'zubat',min:7,max:7,w:20},{id:'slowpoke',min:6,max:6,w:10},{id:'zubat',min:8,max:8,w:5},{id:'slowpoke',min:8,max:8,w:4},{id:'slowpoke',min:8,max:8,w:1}],
		night: [{id:'zubat',min:5,max:5,w:30},{id:'zubat',min:6,max:6,w:30},{id:'zubat',min:7,max:7,w:20},{id:'slowpoke',min:6,max:6,w:10},{id:'zubat',min:8,max:8,w:5},{id:'slowpoke',min:8,max:8,w:4},{id:'slowpoke',min:8,max:8,w:1}],
	} },
	'MAP_SLOWPOKE_WELL_B2F': { land: {
		morning: [{id:'zubat',min:21,max:21,w:30},{id:'zubat',min:23,max:23,w:30},{id:'zubat',min:19,max:19,w:20},{id:'slowpoke',min:21,max:21,w:10},{id:'golbat',min:23,max:23,w:5},{id:'slowpoke',min:23,max:23,w:4},{id:'slowpoke',min:23,max:23,w:1}],
		day: [{id:'zubat',min:21,max:21,w:30},{id:'zubat',min:23,max:23,w:30},{id:'zubat',min:19,max:19,w:20},{id:'slowpoke',min:21,max:21,w:10},{id:'golbat',min:23,max:23,w:5},{id:'slowpoke',min:23,max:23,w:4},{id:'slowpoke',min:23,max:23,w:1}],
		night: [{id:'zubat',min:21,max:21,w:30},{id:'zubat',min:23,max:23,w:30},{id:'zubat',min:19,max:19,w:20},{id:'slowpoke',min:21,max:21,w:10},{id:'golbat',min:23,max:23,w:5},{id:'slowpoke',min:23,max:23,w:4},{id:'slowpoke',min:23,max:23,w:1}],
	} },
	'MAP_ILEX_FOREST': { land: {
		morning: [{id:'caterpie',min:5,max:5,w:30},{id:'weedle',min:5,max:5,w:30},{id:'metapod',min:7,max:7,w:20},{id:'kakuna',min:7,max:7,w:10},{id:'pidgey',min:7,max:7,w:5},{id:'paras',min:6,max:6,w:4},{id:'paras',min:6,max:6,w:1}],
		day: [{id:'caterpie',min:5,max:5,w:30},{id:'weedle',min:5,max:5,w:30},{id:'metapod',min:7,max:7,w:20},{id:'kakuna',min:7,max:7,w:10},{id:'pidgey',min:7,max:7,w:5},{id:'paras',min:6,max:6,w:4},{id:'paras',min:6,max:6,w:1}],
		night: [{id:'oddish',min:5,max:5,w:30},{id:'venonat',min:5,max:5,w:30},{id:'oddish',min:7,max:7,w:20},{id:'psyduck',min:7,max:7,w:10},{id:'hoothoot',min:7,max:7,w:5},{id:'paras',min:6,max:6,w:4},{id:'paras',min:6,max:6,w:1}],
	} },
	'MAP_MOUNT_MORTAR_1F_OUTSIDE': { land: {
		morning: [{id:'rattata',min:14,max:14,w:30},{id:'zubat',min:13,max:13,w:30},{id:'machop',min:14,max:14,w:20},{id:'golbat',min:13,max:13,w:10},{id:'geodude',min:14,max:14,w:5},{id:'raticate',min:16,max:16,w:4},{id:'raticate',min:16,max:16,w:1}],
		day: [{id:'rattata',min:14,max:14,w:30},{id:'zubat',min:13,max:13,w:30},{id:'machop',min:14,max:14,w:20},{id:'golbat',min:13,max:13,w:10},{id:'geodude',min:14,max:14,w:5},{id:'raticate',min:16,max:16,w:4},{id:'raticate',min:16,max:16,w:1}],
		night: [{id:'rattata',min:14,max:14,w:30},{id:'zubat',min:13,max:13,w:30},{id:'marill',min:14,max:14,w:20},{id:'golbat',min:13,max:13,w:10},{id:'geodude',min:14,max:14,w:5},{id:'raticate',min:16,max:16,w:4},{id:'raticate',min:16,max:16,w:1}],
	} },
	'MAP_MOUNT_MORTAR_1F_INSIDE': { land: {
		morning: [{id:'geodude',min:13,max:13,w:30},{id:'rattata',min:14,max:14,w:30},{id:'machop',min:15,max:15,w:20},{id:'raticate',min:14,max:14,w:10},{id:'zubat',min:15,max:15,w:5},{id:'golbat',min:15,max:15,w:4},{id:'golbat',min:15,max:15,w:1}],
		day: [{id:'geodude',min:13,max:13,w:30},{id:'rattata',min:14,max:14,w:30},{id:'machop',min:15,max:15,w:20},{id:'raticate',min:14,max:14,w:10},{id:'zubat',min:15,max:15,w:5},{id:'golbat',min:15,max:15,w:4},{id:'golbat',min:15,max:15,w:1}],
		night: [{id:'geodude',min:13,max:13,w:30},{id:'rattata',min:14,max:14,w:30},{id:'raticate',min:15,max:15,w:20},{id:'zubat',min:14,max:14,w:10},{id:'marill',min:15,max:15,w:5},{id:'golbat',min:15,max:15,w:4},{id:'golbat',min:15,max:15,w:1}],
	} },
	'MAP_MOUNT_MORTAR_2F_INSIDE': { land: {
		morning: [{id:'graveler',min:31,max:31,w:30},{id:'machoke',min:32,max:32,w:30},{id:'geodude',min:31,max:31,w:20},{id:'raticate',min:30,max:30,w:10},{id:'machop',min:28,max:28,w:5},{id:'golbat',min:30,max:30,w:4},{id:'golbat',min:30,max:30,w:1}],
		day: [{id:'graveler',min:31,max:31,w:30},{id:'machoke',min:32,max:32,w:30},{id:'geodude',min:31,max:31,w:20},{id:'raticate',min:30,max:30,w:10},{id:'machop',min:28,max:28,w:5},{id:'golbat',min:30,max:30,w:4},{id:'golbat',min:30,max:30,w:1}],
		night: [{id:'graveler',min:31,max:31,w:30},{id:'geodude',min:31,max:31,w:30},{id:'raticate',min:30,max:30,w:20},{id:'golbat',min:30,max:30,w:10},{id:'marill',min:28,max:28,w:5},{id:'golbat',min:32,max:32,w:4},{id:'golbat',min:32,max:32,w:1}],
	} },
	'MAP_MOUNT_MORTAR_B1F': { land: {
		morning: [{id:'zubat',min:15,max:15,w:30},{id:'zubat',min:17,max:17,w:30},{id:'golbat',min:17,max:17,w:20},{id:'machop',min:16,max:16,w:10},{id:'geodude',min:16,max:16,w:5},{id:'raticate',min:18,max:18,w:4},{id:'raticate',min:18,max:18,w:1}],
		day: [{id:'zubat',min:15,max:15,w:30},{id:'zubat',min:17,max:17,w:30},{id:'golbat',min:17,max:17,w:20},{id:'machop',min:16,max:16,w:10},{id:'geodude',min:16,max:16,w:5},{id:'raticate',min:18,max:18,w:4},{id:'raticate',min:18,max:18,w:1}],
		night: [{id:'zubat',min:15,max:15,w:30},{id:'zubat',min:17,max:17,w:30},{id:'golbat',min:17,max:17,w:20},{id:'marill',min:16,max:16,w:10},{id:'geodude',min:16,max:16,w:5},{id:'raticate',min:18,max:18,w:4},{id:'raticate',min:18,max:18,w:1}],
	} },
	'MAP_ICE_PATH_1F': { land: {
		morning: [{id:'swinub',min:21,max:21,w:30},{id:'zubat',min:22,max:22,w:30},{id:'golbat',min:22,max:22,w:20},{id:'swinub',min:23,max:23,w:10},{id:'golbat',min:24,max:24,w:5},{id:'golbat',min:22,max:22,w:4},{id:'golbat',min:22,max:22,w:1}],
		day: [{id:'swinub',min:21,max:21,w:30},{id:'zubat',min:22,max:22,w:30},{id:'golbat',min:22,max:22,w:20},{id:'swinub',min:23,max:23,w:10},{id:'golbat',min:24,max:24,w:5},{id:'golbat',min:22,max:22,w:4},{id:'golbat',min:22,max:22,w:1}],
		night: [{id:'delibird',min:21,max:21,w:30},{id:'zubat',min:22,max:22,w:30},{id:'golbat',min:22,max:22,w:20},{id:'delibird',min:23,max:23,w:10},{id:'golbat',min:24,max:24,w:5},{id:'golbat',min:22,max:22,w:4},{id:'golbat',min:22,max:22,w:1}],
	} },
	'MAP_ICE_PATH_B1F': { land: {
		morning: [{id:'swinub',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'golbat',min:23,max:23,w:20},{id:'swinub',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:23,max:23,w:4},{id:'jynx',min:22,max:22,w:1}],
		day: [{id:'swinub',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'golbat',min:23,max:23,w:20},{id:'swinub',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:23,max:23,w:4},{id:'jynx',min:22,max:22,w:1}],
		night: [{id:'delibird',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'golbat',min:23,max:23,w:20},{id:'delibird',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:23,max:23,w:4},{id:'sneasel',min:22,max:22,w:1}],
	} },
	'MAP_ICE_PATH_B2F_MAHOGANY_SIDE': { land: {
		morning: [{id:'swinub',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'golbat',min:24,max:24,w:20},{id:'swinub',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'jynx',min:22,max:22,w:4},{id:'jynx',min:24,max:24,w:1}],
		day: [{id:'swinub',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'golbat',min:24,max:24,w:20},{id:'swinub',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'jynx',min:22,max:22,w:4},{id:'jynx',min:24,max:24,w:1}],
		night: [{id:'delibird',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'golbat',min:24,max:24,w:20},{id:'delibird',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'sneasel',min:22,max:22,w:4},{id:'sneasel',min:24,max:24,w:1}],
	} },
	'MAP_ICE_PATH_B2F_BLACKTHORN_SIDE': { land: {
		morning: [{id:'swinub',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'golbat',min:24,max:24,w:20},{id:'swinub',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'jynx',min:22,max:22,w:4},{id:'jynx',min:24,max:24,w:1}],
		day: [{id:'swinub',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'golbat',min:24,max:24,w:20},{id:'swinub',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'jynx',min:22,max:22,w:4},{id:'jynx',min:24,max:24,w:1}],
		night: [{id:'delibird',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'golbat',min:24,max:24,w:20},{id:'delibird',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'sneasel',min:22,max:22,w:4},{id:'sneasel',min:24,max:24,w:1}],
	} },
	'MAP_ICE_PATH_B3F': { land: {
		morning: [{id:'swinub',min:24,max:24,w:30},{id:'zubat',min:25,max:25,w:30},{id:'golbat',min:25,max:25,w:20},{id:'swinub',min:26,max:26,w:10},{id:'jynx',min:22,max:22,w:5},{id:'jynx',min:24,max:24,w:4},{id:'jynx',min:26,max:26,w:1}],
		day: [{id:'swinub',min:24,max:24,w:30},{id:'zubat',min:25,max:25,w:30},{id:'golbat',min:25,max:25,w:20},{id:'swinub',min:26,max:26,w:10},{id:'jynx',min:22,max:22,w:5},{id:'jynx',min:24,max:24,w:4},{id:'jynx',min:26,max:26,w:1}],
		night: [{id:'delibird',min:24,max:24,w:30},{id:'zubat',min:25,max:25,w:30},{id:'golbat',min:25,max:25,w:20},{id:'delibird',min:26,max:26,w:10},{id:'sneasel',min:22,max:22,w:5},{id:'sneasel',min:24,max:24,w:4},{id:'sneasel',min:26,max:26,w:1}],
	} },
	'MAP_WHIRL_ISLAND_NW': { land: {
		morning: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		day: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		night: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'krabby',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:24,max:24,w:4},{id:'golbat',min:24,max:24,w:1}],
	} },
	'MAP_WHIRL_ISLAND_NE': { land: {
		morning: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		day: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		night: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'krabby',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:24,max:24,w:4},{id:'golbat',min:24,max:24,w:1}],
	} },
	'MAP_WHIRL_ISLAND_SW': { land: {
		morning: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		day: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		night: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'krabby',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:24,max:24,w:4},{id:'golbat',min:24,max:24,w:1}],
	} },
	'MAP_WHIRL_ISLAND_CAVE': { land: {
		morning: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		day: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		night: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'krabby',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:24,max:24,w:4},{id:'golbat',min:24,max:24,w:1}],
	} },
	'MAP_WHIRL_ISLAND_SE': { land: {
		morning: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		day: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'seel',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'seel',min:24,max:24,w:4},{id:'seel',min:24,max:24,w:1}],
		night: [{id:'krabby',min:22,max:22,w:30},{id:'zubat',min:23,max:23,w:30},{id:'krabby',min:22,max:22,w:20},{id:'krabby',min:24,max:24,w:10},{id:'golbat',min:25,max:25,w:5},{id:'golbat',min:24,max:24,w:4},{id:'golbat',min:24,max:24,w:1}],
	} },
	'MAP_WHIRL_ISLAND_B1F': { land: {
		morning: [{id:'krabby',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'seel',min:23,max:23,w:20},{id:'krabby',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'seel',min:25,max:25,w:4},{id:'seel',min:25,max:25,w:1}],
		day: [{id:'krabby',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'seel',min:23,max:23,w:20},{id:'krabby',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'seel',min:25,max:25,w:4},{id:'seel',min:25,max:25,w:1}],
		night: [{id:'krabby',min:23,max:23,w:30},{id:'zubat',min:24,max:24,w:30},{id:'krabby',min:23,max:23,w:20},{id:'krabby',min:25,max:25,w:10},{id:'golbat',min:26,max:26,w:5},{id:'golbat',min:25,max:25,w:4},{id:'golbat',min:25,max:25,w:1}],
	} },
	'MAP_WHIRL_ISLAND_B2F': { land: {
		morning: [{id:'krabby',min:24,max:24,w:30},{id:'zubat',min:25,max:25,w:30},{id:'seel',min:24,max:24,w:20},{id:'krabby',min:26,max:26,w:10},{id:'golbat',min:27,max:27,w:5},{id:'seel',min:26,max:26,w:4},{id:'seel',min:26,max:26,w:1}],
		day: [{id:'krabby',min:24,max:24,w:30},{id:'zubat',min:25,max:25,w:30},{id:'seel',min:24,max:24,w:20},{id:'krabby',min:26,max:26,w:10},{id:'golbat',min:27,max:27,w:5},{id:'seel',min:26,max:26,w:4},{id:'seel',min:26,max:26,w:1}],
		night: [{id:'krabby',min:24,max:24,w:30},{id:'zubat',min:25,max:25,w:30},{id:'krabby',min:24,max:24,w:20},{id:'krabby',min:26,max:26,w:10},{id:'golbat',min:27,max:27,w:5},{id:'golbat',min:26,max:26,w:4},{id:'golbat',min:26,max:26,w:1}],
	} },
	'MAP_WHIRL_ISLAND_LUGIA_CHAMBER': { land: {
		morning: [{id:'krabby',min:25,max:25,w:30},{id:'zubat',min:26,max:26,w:30},{id:'seel',min:25,max:25,w:20},{id:'krabby',min:27,max:27,w:10},{id:'golbat',min:28,max:28,w:5},{id:'seel',min:27,max:27,w:4},{id:'seel',min:27,max:27,w:1}],
		day: [{id:'krabby',min:25,max:25,w:30},{id:'zubat',min:26,max:26,w:30},{id:'seel',min:25,max:25,w:20},{id:'krabby',min:27,max:27,w:10},{id:'golbat',min:28,max:28,w:5},{id:'seel',min:27,max:27,w:4},{id:'seel',min:27,max:27,w:1}],
		night: [{id:'krabby',min:25,max:25,w:30},{id:'zubat',min:26,max:26,w:30},{id:'krabby',min:25,max:25,w:20},{id:'krabby',min:27,max:27,w:10},{id:'golbat',min:28,max:28,w:5},{id:'golbat',min:27,max:27,w:4},{id:'golbat',min:27,max:27,w:1}],
	} },
	'MAP_SILVER_CAVE_ROOM_1': { land: {
		morning: [{id:'graveler',min:43,max:43,w:30},{id:'ursaring',min:44,max:44,w:30},{id:'onix',min:42,max:42,w:20},{id:'magmar',min:45,max:45,w:10},{id:'golbat',min:45,max:45,w:5},{id:'larvitar',min:20,max:20,w:4},{id:'larvitar',min:15,max:15,w:1}],
		day: [{id:'graveler',min:43,max:43,w:30},{id:'ursaring',min:44,max:44,w:30},{id:'onix',min:42,max:42,w:20},{id:'magmar',min:45,max:45,w:10},{id:'golbat',min:45,max:45,w:5},{id:'larvitar',min:20,max:20,w:4},{id:'larvitar',min:15,max:15,w:1}],
		night: [{id:'graveler',min:43,max:43,w:30},{id:'golbat',min:44,max:44,w:30},{id:'onix',min:42,max:42,w:20},{id:'golbat',min:42,max:42,w:10},{id:'golduck',min:45,max:45,w:5},{id:'golbat',min:46,max:46,w:4},{id:'golbat',min:46,max:46,w:1}],
	} },
	'MAP_SILVER_CAVE_ROOM_2': { land: {
		morning: [{id:'golbat',min:48,max:48,w:30},{id:'machoke',min:48,max:48,w:30},{id:'ursaring',min:47,max:47,w:20},{id:'parasect',min:46,max:46,w:10},{id:'parasect',min:48,max:48,w:5},{id:'larvitar',min:15,max:15,w:4},{id:'larvitar',min:20,max:20,w:1}],
		day: [{id:'golbat',min:48,max:48,w:30},{id:'machoke',min:48,max:48,w:30},{id:'ursaring',min:47,max:47,w:20},{id:'parasect',min:46,max:46,w:10},{id:'parasect',min:48,max:48,w:5},{id:'larvitar',min:15,max:15,w:4},{id:'larvitar',min:20,max:20,w:1}],
		night: [{id:'golbat',min:48,max:48,w:30},{id:'golduck',min:48,max:48,w:30},{id:'golbat',min:46,max:46,w:20},{id:'parasect',min:46,max:46,w:10},{id:'parasect',min:48,max:48,w:5},{id:'misdreavus',min:45,max:45,w:4},{id:'misdreavus',min:45,max:45,w:1}],
	} },
	'MAP_SILVER_CAVE_ROOM_3': { land: {
		morning: [{id:'golbat',min:51,max:51,w:30},{id:'onix',min:48,max:48,w:30},{id:'graveler',min:48,max:48,w:20},{id:'ursaring',min:50,max:50,w:10},{id:'larvitar',min:20,max:20,w:5},{id:'larvitar',min:15,max:15,w:4},{id:'pupitar',min:20,max:20,w:1}],
		day: [{id:'golbat',min:51,max:51,w:30},{id:'onix',min:48,max:48,w:30},{id:'graveler',min:48,max:48,w:20},{id:'ursaring',min:50,max:50,w:10},{id:'larvitar',min:20,max:20,w:5},{id:'larvitar',min:15,max:15,w:4},{id:'pupitar',min:20,max:20,w:1}],
		night: [{id:'golbat',min:51,max:51,w:30},{id:'onix',min:48,max:48,w:30},{id:'graveler',min:48,max:48,w:20},{id:'golbat',min:49,max:49,w:10},{id:'golduck',min:45,max:45,w:5},{id:'golbat',min:53,max:53,w:4},{id:'golbat',min:53,max:53,w:1}],
	} },
	'MAP_SILVER_CAVE_ITEM_ROOMS': { land: {
		morning: [{id:'golbat',min:48,max:48,w:30},{id:'golbat',min:46,max:46,w:30},{id:'golbat',min:50,max:50,w:20},{id:'parasect',min:46,max:46,w:10},{id:'parasect',min:48,max:48,w:5},{id:'parasect',min:50,max:50,w:4},{id:'parasect',min:52,max:52,w:1}],
		day: [{id:'golbat',min:48,max:48,w:30},{id:'golbat',min:46,max:46,w:30},{id:'golbat',min:50,max:50,w:20},{id:'parasect',min:46,max:46,w:10},{id:'parasect',min:48,max:48,w:5},{id:'parasect',min:50,max:50,w:4},{id:'parasect',min:52,max:52,w:1}],
		night: [{id:'misdreavus',min:45,max:45,w:30},{id:'golbat',min:48,max:48,w:30},{id:'golbat',min:50,max:50,w:20},{id:'parasect',min:46,max:46,w:10},{id:'parasect',min:48,max:48,w:5},{id:'parasect',min:50,max:50,w:4},{id:'parasect',min:52,max:52,w:1}],
	} },
	'MAP_DARK_CAVE_VIOLET_ENTRANCE': { land: {
		morning: [{id:'geodude',min:3,max:3,w:30},{id:'zubat',min:2,max:2,w:30},{id:'geodude',min:2,max:2,w:20},{id:'geodude',min:4,max:4,w:10},{id:'teddiursa',min:2,max:2,w:5},{id:'zubat',min:4,max:4,w:4},{id:'dunsparce',min:4,max:4,w:1}],
		day: [{id:'geodude',min:3,max:3,w:30},{id:'zubat',min:2,max:2,w:30},{id:'geodude',min:2,max:2,w:20},{id:'geodude',min:4,max:4,w:10},{id:'zubat',min:2,max:2,w:5},{id:'zubat',min:4,max:4,w:4},{id:'dunsparce',min:4,max:4,w:1}],
		night: [{id:'geodude',min:3,max:3,w:30},{id:'zubat',min:2,max:2,w:30},{id:'geodude',min:2,max:2,w:20},{id:'geodude',min:4,max:4,w:10},{id:'zubat',min:2,max:2,w:5},{id:'zubat',min:4,max:4,w:4},{id:'dunsparce',min:4,max:4,w:1}],
	} },
	'MAP_DARK_CAVE_BLACKTHORN_ENTRANCE': { land: {
		morning: [{id:'geodude',min:23,max:23,w:30},{id:'zubat',min:23,max:23,w:30},{id:'graveler',min:25,max:25,w:20},{id:'ursaring',min:25,max:25,w:10},{id:'teddiursa',min:20,max:20,w:5},{id:'golbat',min:23,max:23,w:4},{id:'golbat',min:23,max:23,w:1}],
		day: [{id:'geodude',min:23,max:23,w:30},{id:'zubat',min:23,max:23,w:30},{id:'graveler',min:25,max:25,w:20},{id:'ursaring',min:25,max:25,w:10},{id:'ursaring',min:30,max:30,w:5},{id:'golbat',min:23,max:23,w:4},{id:'golbat',min:23,max:23,w:1}],
		night: [{id:'geodude',min:23,max:23,w:30},{id:'zubat',min:23,max:23,w:30},{id:'graveler',min:25,max:25,w:20},{id:'wobbuffet',min:20,max:20,w:10},{id:'wobbuffet',min:25,max:25,w:5},{id:'golbat',min:23,max:23,w:4},{id:'golbat',min:23,max:23,w:1}],
	} },
	'MAP_ROUTE_29': { land: {
		morning: [{id:'pidgey',min:2,max:2,w:30},{id:'sentret',min:2,max:2,w:30},{id:'pidgey',min:3,max:3,w:20},{id:'sentret',min:3,max:3,w:10},{id:'rattata',min:2,max:2,w:5},{id:'hoppip',min:3,max:3,w:4},{id:'hoppip',min:3,max:3,w:1}],
		day: [{id:'pidgey',min:2,max:2,w:30},{id:'sentret',min:2,max:2,w:30},{id:'pidgey',min:3,max:3,w:20},{id:'sentret',min:3,max:3,w:10},{id:'rattata',min:2,max:2,w:5},{id:'hoppip',min:3,max:3,w:4},{id:'hoppip',min:3,max:3,w:1}],
		night: [{id:'hoothoot',min:2,max:2,w:30},{id:'rattata',min:2,max:2,w:30},{id:'hoothoot',min:3,max:3,w:20},{id:'rattata',min:3,max:3,w:10},{id:'rattata',min:2,max:2,w:5},{id:'hoothoot',min:3,max:3,w:4},{id:'hoothoot',min:3,max:3,w:1}],
	} },
	'MAP_ROUTE_30': { land: {
		morning: [{id:'ledyba',min:3,max:3,w:30},{id:'caterpie',min:3,max:3,w:30},{id:'caterpie',min:4,max:4,w:20},{id:'pidgey',min:4,max:4,w:10},{id:'weedle',min:3,max:3,w:5},{id:'hoppip',min:4,max:4,w:4},{id:'hoppip',min:4,max:4,w:1}],
		day: [{id:'pidgey',min:3,max:3,w:30},{id:'caterpie',min:3,max:3,w:30},{id:'caterpie',min:4,max:4,w:20},{id:'pidgey',min:4,max:4,w:10},{id:'weedle',min:3,max:3,w:5},{id:'hoppip',min:4,max:4,w:4},{id:'hoppip',min:4,max:4,w:1}],
		night: [{id:'spinarak',min:3,max:3,w:30},{id:'hoothoot',min:3,max:3,w:30},{id:'poliwag',min:4,max:4,w:20},{id:'hoothoot',min:4,max:4,w:10},{id:'zubat',min:3,max:3,w:5},{id:'hoothoot',min:4,max:4,w:4},{id:'hoothoot',min:4,max:4,w:1}],
	} },
	'MAP_ROUTE_31': { land: {
		morning: [{id:'ledyba',min:4,max:4,w:30},{id:'caterpie',min:4,max:4,w:30},{id:'bellsprout',min:5,max:5,w:20},{id:'pidgey',min:5,max:5,w:10},{id:'weedle',min:4,max:4,w:5},{id:'hoppip',min:5,max:5,w:4},{id:'hoppip',min:5,max:5,w:1}],
		day: [{id:'pidgey',min:4,max:4,w:30},{id:'caterpie',min:4,max:4,w:30},{id:'bellsprout',min:5,max:5,w:20},{id:'pidgey',min:5,max:5,w:10},{id:'weedle',min:4,max:4,w:5},{id:'hoppip',min:5,max:5,w:4},{id:'hoppip',min:5,max:5,w:1}],
		night: [{id:'spinarak',min:4,max:4,w:30},{id:'poliwag',min:4,max:4,w:30},{id:'bellsprout',min:5,max:5,w:20},{id:'hoothoot',min:5,max:5,w:10},{id:'zubat',min:4,max:4,w:5},{id:'gastly',min:5,max:5,w:4},{id:'gastly',min:5,max:5,w:1}],
	} },
	'MAP_ROUTE_32': { land: {
		morning: [{id:'ekans',min:4,max:4,w:30},{id:'rattata',min:5,max:5,w:30},{id:'bellsprout',min:7,max:7,w:20},{id:'hoppip',min:6,max:6,w:10},{id:'pidgey',min:7,max:7,w:5},{id:'hoppip',min:7,max:7,w:4},{id:'hoppip',min:7,max:7,w:1}],
		day: [{id:'ekans',min:4,max:4,w:30},{id:'rattata',min:5,max:5,w:30},{id:'bellsprout',min:7,max:7,w:20},{id:'hoppip',min:6,max:6,w:10},{id:'pidgey',min:7,max:7,w:5},{id:'hoppip',min:7,max:7,w:4},{id:'hoppip',min:7,max:7,w:1}],
		night: [{id:'wooper',min:4,max:4,w:30},{id:'rattata',min:5,max:5,w:30},{id:'bellsprout',min:7,max:7,w:20},{id:'zubat',min:6,max:6,w:10},{id:'hoothoot',min:7,max:7,w:5},{id:'gastly',min:7,max:7,w:4},{id:'gastly',min:7,max:7,w:1}],
	} },
	'MAP_ROUTE_33': { land: {
		morning: [{id:'rattata',min:6,max:6,w:30},{id:'spearow',min:6,max:6,w:30},{id:'geodude',min:6,max:6,w:20},{id:'hoppip',min:6,max:6,w:10},{id:'ekans',min:7,max:7,w:5},{id:'hoppip',min:7,max:7,w:4},{id:'hoppip',min:7,max:7,w:1}],
		day: [{id:'rattata',min:6,max:6,w:30},{id:'spearow',min:6,max:6,w:30},{id:'geodude',min:6,max:6,w:20},{id:'hoppip',min:6,max:6,w:10},{id:'ekans',min:7,max:7,w:5},{id:'hoppip',min:7,max:7,w:4},{id:'hoppip',min:7,max:7,w:1}],
		night: [{id:'rattata',min:6,max:6,w:30},{id:'zubat',min:6,max:6,w:30},{id:'geodude',min:6,max:6,w:20},{id:'zubat',min:6,max:6,w:10},{id:'rattata',min:7,max:7,w:5},{id:'rattata',min:7,max:7,w:4},{id:'rattata',min:7,max:7,w:1}],
	} },
	'MAP_ROUTE_34': { land: {
		morning: [{id:'snubbull',min:10,max:10,w:30},{id:'rattata',min:11,max:11,w:30},{id:'pidgey',min:12,max:12,w:20},{id:'abra',min:10,max:10,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'ditto',min:10,max:10,w:4},{id:'ditto',min:10,max:10,w:1}],
		day: [{id:'snubbull',min:10,max:10,w:30},{id:'rattata',min:11,max:11,w:30},{id:'pidgey',min:12,max:12,w:20},{id:'abra',min:10,max:10,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'ditto',min:10,max:10,w:4},{id:'ditto',min:10,max:10,w:1}],
		night: [{id:'drowzee',min:12,max:12,w:30},{id:'rattata',min:11,max:11,w:30},{id:'hoothoot',min:12,max:12,w:20},{id:'abra',min:10,max:10,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'ditto',min:10,max:10,w:4},{id:'ditto',min:10,max:10,w:1}],
	} },
	'MAP_ROUTE_35': { land: {
		morning: [{id:'snubbull',min:12,max:12,w:30},{id:'pidgey',min:14,max:14,w:30},{id:'growlithe',min:13,max:13,w:20},{id:'abra',min:10,max:10,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'ditto',min:10,max:10,w:4},{id:'yanma',min:12,max:12,w:1}],
		day: [{id:'snubbull',min:12,max:12,w:30},{id:'pidgey',min:14,max:14,w:30},{id:'growlithe',min:13,max:13,w:20},{id:'abra',min:10,max:10,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'ditto',min:10,max:10,w:4},{id:'yanma',min:12,max:12,w:1}],
		night: [{id:'drowzee',min:12,max:12,w:30},{id:'hoothoot',min:14,max:14,w:30},{id:'psyduck',min:13,max:13,w:20},{id:'abra',min:10,max:10,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'ditto',min:10,max:10,w:4},{id:'yanma',min:12,max:12,w:1}],
	} },
	'MAP_ROUTE_36': { land: {
		morning: [{id:'ledyba',min:4,max:4,w:30},{id:'pidgey',min:4,max:4,w:30},{id:'bellsprout',min:5,max:5,w:20},{id:'growlithe',min:5,max:5,w:10},{id:'pidgey',min:5,max:5,w:5},{id:'pidgey',min:6,max:6,w:4},{id:'pidgey',min:6,max:6,w:1}],
		day: [{id:'pidgey',min:4,max:4,w:30},{id:'pidgey',min:4,max:4,w:30},{id:'bellsprout',min:5,max:5,w:20},{id:'growlithe',min:5,max:5,w:10},{id:'pidgey',min:5,max:5,w:5},{id:'pidgey',min:6,max:6,w:4},{id:'pidgey',min:6,max:6,w:1}],
		night: [{id:'spinarak',min:4,max:4,w:30},{id:'hoothoot',min:4,max:4,w:30},{id:'bellsprout',min:5,max:5,w:20},{id:'hoothoot',min:5,max:5,w:10},{id:'hoothoot',min:5,max:5,w:5},{id:'gastly',min:5,max:5,w:4},{id:'gastly',min:5,max:5,w:1}],
	} },
	'MAP_ROUTE_37': { land: {
		morning: [{id:'ledyba',min:13,max:13,w:30},{id:'growlithe',min:14,max:14,w:30},{id:'pidgey',min:15,max:15,w:20},{id:'growlithe',min:16,max:16,w:10},{id:'pidgeotto',min:15,max:15,w:5},{id:'ledian',min:15,max:15,w:4},{id:'ledian',min:15,max:15,w:1}],
		day: [{id:'pidgey',min:13,max:13,w:30},{id:'growlithe',min:14,max:14,w:30},{id:'pidgey',min:15,max:15,w:20},{id:'growlithe',min:16,max:16,w:10},{id:'pidgeotto',min:15,max:15,w:5},{id:'pidgey',min:15,max:15,w:4},{id:'pidgey',min:15,max:15,w:1}],
		night: [{id:'spinarak',min:13,max:13,w:30},{id:'stantler',min:14,max:14,w:30},{id:'hoothoot',min:15,max:15,w:20},{id:'stantler',min:16,max:16,w:10},{id:'noctowl',min:15,max:15,w:5},{id:'ariados',min:15,max:15,w:4},{id:'ariados',min:15,max:15,w:1}],
	} },
	'MAP_ROUTE_38': { land: {
		morning: [{id:'rattata',min:16,max:16,w:30},{id:'raticate',min:16,max:16,w:30},{id:'magnemite',min:16,max:16,w:20},{id:'pidgeotto',min:16,max:16,w:10},{id:'tauros',min:13,max:13,w:5},{id:'miltank',min:13,max:13,w:4},{id:'miltank',min:13,max:13,w:1}],
		day: [{id:'rattata',min:16,max:16,w:30},{id:'raticate',min:16,max:16,w:30},{id:'magnemite',min:16,max:16,w:20},{id:'pidgeotto',min:16,max:16,w:10},{id:'tauros',min:13,max:13,w:5},{id:'miltank',min:13,max:13,w:4},{id:'miltank',min:13,max:13,w:1}],
		night: [{id:'meowth',min:16,max:16,w:30},{id:'raticate',min:16,max:16,w:30},{id:'magnemite',min:16,max:16,w:20},{id:'noctowl',min:16,max:16,w:10},{id:'meowth',min:16,max:16,w:5},{id:'meowth',min:16,max:16,w:4},{id:'meowth',min:16,max:16,w:1}],
	} },
	'MAP_ROUTE_39': { land: {
		morning: [{id:'rattata',min:16,max:16,w:30},{id:'raticate',min:16,max:16,w:30},{id:'magnemite',min:16,max:16,w:20},{id:'pidgeotto',min:16,max:16,w:10},{id:'miltank',min:15,max:15,w:5},{id:'tauros',min:15,max:15,w:4},{id:'tauros',min:15,max:15,w:1}],
		day: [{id:'rattata',min:16,max:16,w:30},{id:'raticate',min:16,max:16,w:30},{id:'magnemite',min:16,max:16,w:20},{id:'pidgeotto',min:16,max:16,w:10},{id:'miltank',min:15,max:15,w:5},{id:'tauros',min:15,max:15,w:4},{id:'tauros',min:15,max:15,w:1}],
		night: [{id:'meowth',min:16,max:16,w:30},{id:'raticate',min:16,max:16,w:30},{id:'magnemite',min:16,max:16,w:20},{id:'noctowl',min:16,max:16,w:10},{id:'meowth',min:18,max:18,w:5},{id:'meowth',min:18,max:18,w:4},{id:'meowth',min:18,max:18,w:1}],
	} },
	'MAP_ROUTE_42': { land: {
		morning: [{id:'ekans',min:13,max:13,w:30},{id:'spearow',min:14,max:14,w:30},{id:'rattata',min:15,max:15,w:20},{id:'raticate',min:16,max:16,w:10},{id:'arbok',min:15,max:15,w:5},{id:'fearow',min:16,max:16,w:4},{id:'fearow',min:16,max:16,w:1}],
		day: [{id:'ekans',min:13,max:13,w:30},{id:'spearow',min:14,max:14,w:30},{id:'rattata',min:15,max:15,w:20},{id:'raticate',min:16,max:16,w:10},{id:'arbok',min:15,max:15,w:5},{id:'fearow',min:16,max:16,w:4},{id:'fearow',min:16,max:16,w:1}],
		night: [{id:'rattata',min:13,max:13,w:30},{id:'zubat',min:14,max:14,w:30},{id:'raticate',min:15,max:15,w:20},{id:'golbat',min:16,max:16,w:10},{id:'marill',min:15,max:15,w:5},{id:'golbat',min:16,max:16,w:4},{id:'golbat',min:16,max:16,w:1}],
	} },
	'MAP_ROUTE_43': { land: {
		morning: [{id:'sentret',min:15,max:15,w:30},{id:'pidgeotto',min:16,max:16,w:30},{id:'farfetchd',min:16,max:16,w:20},{id:'furret',min:15,max:15,w:10},{id:'raticate',min:17,max:17,w:5},{id:'furret',min:17,max:17,w:4},{id:'furret',min:17,max:17,w:1}],
		day: [{id:'sentret',min:15,max:15,w:30},{id:'pidgeotto',min:16,max:16,w:30},{id:'farfetchd',min:16,max:16,w:20},{id:'furret',min:15,max:15,w:10},{id:'raticate',min:17,max:17,w:5},{id:'furret',min:17,max:17,w:4},{id:'furret',min:17,max:17,w:1}],
		night: [{id:'venonat',min:15,max:15,w:30},{id:'noctowl',min:16,max:16,w:30},{id:'raticate',min:16,max:16,w:20},{id:'venonat',min:17,max:17,w:10},{id:'raticate',min:17,max:17,w:5},{id:'venomoth',min:17,max:17,w:4},{id:'venomoth',min:17,max:17,w:1}],
	} },
	'MAP_ROUTE_44': { land: {
		morning: [{id:'tangela',min:23,max:23,w:30},{id:'lickitung',min:22,max:22,w:30},{id:'bellsprout',min:22,max:22,w:20},{id:'weepinbell',min:24,max:24,w:10},{id:'lickitung',min:24,max:24,w:5},{id:'lickitung',min:26,max:26,w:4},{id:'lickitung',min:26,max:26,w:1}],
		day: [{id:'tangela',min:23,max:23,w:30},{id:'lickitung',min:22,max:22,w:30},{id:'bellsprout',min:22,max:22,w:20},{id:'weepinbell',min:24,max:24,w:10},{id:'lickitung',min:24,max:24,w:5},{id:'lickitung',min:26,max:26,w:4},{id:'lickitung',min:26,max:26,w:1}],
		night: [{id:'tangela',min:23,max:23,w:30},{id:'poliwag',min:22,max:22,w:30},{id:'bellsprout',min:22,max:22,w:20},{id:'weepinbell',min:24,max:24,w:10},{id:'poliwhirl',min:24,max:24,w:5},{id:'poliwhirl',min:26,max:26,w:4},{id:'poliwhirl',min:26,max:26,w:1}],
	} },
	'MAP_ROUTE_45': { land: {
		morning: [{id:'geodude',min:23,max:23,w:30},{id:'graveler',min:23,max:23,w:30},{id:'gligar',min:24,max:24,w:20},{id:'donphan',min:25,max:25,w:10},{id:'phanpy',min:20,max:20,w:5},{id:'skarmory',min:27,max:27,w:4},{id:'skarmory',min:27,max:27,w:1}],
		day: [{id:'geodude',min:23,max:23,w:30},{id:'graveler',min:23,max:23,w:30},{id:'gligar',min:24,max:24,w:20},{id:'donphan',min:25,max:25,w:10},{id:'donphan',min:30,max:30,w:5},{id:'skarmory',min:27,max:27,w:4},{id:'skarmory',min:27,max:27,w:1}],
		night: [{id:'geodude',min:23,max:23,w:30},{id:'graveler',min:23,max:23,w:30},{id:'gligar',min:24,max:24,w:20},{id:'graveler',min:25,max:25,w:10},{id:'graveler',min:27,max:27,w:5},{id:'graveler',min:27,max:27,w:4},{id:'graveler',min:27,max:27,w:1}],
	} },
	'MAP_ROUTE_46': { land: {
		morning: [{id:'geodude',min:2,max:2,w:30},{id:'spearow',min:2,max:2,w:30},{id:'geodude',min:3,max:3,w:20},{id:'rattata',min:3,max:3,w:10},{id:'phanpy',min:2,max:2,w:5},{id:'rattata',min:2,max:2,w:4},{id:'rattata',min:2,max:2,w:1}],
		day: [{id:'geodude',min:2,max:2,w:30},{id:'spearow',min:2,max:2,w:30},{id:'geodude',min:3,max:3,w:20},{id:'rattata',min:3,max:3,w:10},{id:'rattata',min:2,max:2,w:5},{id:'rattata',min:2,max:2,w:4},{id:'rattata',min:2,max:2,w:1}],
		night: [{id:'geodude',min:2,max:2,w:30},{id:'rattata',min:2,max:2,w:30},{id:'geodude',min:3,max:3,w:20},{id:'rattata',min:3,max:3,w:10},{id:'rattata',min:2,max:2,w:5},{id:'rattata',min:2,max:2,w:4},{id:'rattata',min:2,max:2,w:1}],
	} },
	'MAP_SILVER_CAVE_OUTSIDE': { land: {
		morning: [{id:'tangela',min:41,max:41,w:30},{id:'ponyta',min:42,max:42,w:30},{id:'arbok',min:42,max:42,w:20},{id:'rapidash',min:44,max:44,w:10},{id:'doduo',min:41,max:41,w:5},{id:'dodrio',min:43,max:43,w:4},{id:'dodrio',min:43,max:43,w:1}],
		day: [{id:'tangela',min:41,max:41,w:30},{id:'ponyta',min:42,max:42,w:30},{id:'arbok',min:42,max:42,w:20},{id:'rapidash',min:44,max:44,w:10},{id:'doduo',min:41,max:41,w:5},{id:'dodrio',min:43,max:43,w:4},{id:'dodrio',min:43,max:43,w:1}],
		night: [{id:'tangela',min:41,max:41,w:30},{id:'poliwhirl',min:42,max:42,w:30},{id:'golbat',min:42,max:42,w:20},{id:'poliwhirl',min:44,max:44,w:10},{id:'golbat',min:40,max:40,w:5},{id:'golbat',min:44,max:44,w:4},{id:'golbat',min:44,max:44,w:1}],
	} },
	'MAP_DIGLETTS_CAVE': { land: {
		morning: [{id:'diglett',min:3,max:3,w:30},{id:'diglett',min:6,max:6,w:30},{id:'diglett',min:12,max:12,w:20},{id:'diglett',min:24,max:24,w:10},{id:'dugtrio',min:24,max:24,w:5},{id:'dugtrio',min:24,max:24,w:4},{id:'dugtrio',min:24,max:24,w:1}],
		day: [{id:'diglett',min:2,max:2,w:30},{id:'diglett',min:4,max:4,w:30},{id:'diglett',min:8,max:8,w:20},{id:'diglett',min:16,max:16,w:10},{id:'dugtrio',min:16,max:16,w:5},{id:'dugtrio',min:16,max:16,w:4},{id:'dugtrio',min:16,max:16,w:1}],
		night: [{id:'diglett',min:4,max:4,w:30},{id:'diglett',min:8,max:8,w:30},{id:'diglett',min:16,max:16,w:20},{id:'diglett',min:32,max:32,w:10},{id:'dugtrio',min:32,max:32,w:5},{id:'dugtrio',min:32,max:32,w:4},{id:'dugtrio',min:32,max:32,w:1}],
	} },
	'MAP_MOUNT_MOON': { land: {
		morning: [{id:'zubat',min:6,max:6,w:30},{id:'geodude',min:8,max:8,w:30},{id:'sandshrew',min:8,max:8,w:20},{id:'paras',min:12,max:12,w:10},{id:'geodude',min:10,max:10,w:5},{id:'clefairy',min:8,max:8,w:4},{id:'clefairy',min:8,max:8,w:1}],
		day: [{id:'zubat',min:6,max:6,w:30},{id:'geodude',min:8,max:8,w:30},{id:'sandshrew',min:8,max:8,w:20},{id:'paras',min:12,max:12,w:10},{id:'geodude',min:10,max:10,w:5},{id:'clefairy',min:8,max:8,w:4},{id:'clefairy',min:8,max:8,w:1}],
		night: [{id:'zubat',min:6,max:6,w:30},{id:'geodude',min:8,max:8,w:30},{id:'clefairy',min:8,max:8,w:20},{id:'paras',min:12,max:12,w:10},{id:'geodude',min:10,max:10,w:5},{id:'clefairy',min:12,max:12,w:4},{id:'clefairy',min:12,max:12,w:1}],
	} },
	'MAP_JOHKANTO_ROCK_TUNNEL_1F': { land: {
		morning: [{id:'cubone',min:10,max:10,w:30},{id:'geodude',min:11,max:11,w:30},{id:'machop',min:12,max:12,w:20},{id:'zubat',min:12,max:12,w:10},{id:'machoke',min:15,max:15,w:5},{id:'marowak',min:12,max:12,w:4},{id:'marowak',min:12,max:12,w:1}],
		day: [{id:'cubone',min:10,max:10,w:30},{id:'geodude',min:11,max:11,w:30},{id:'machop',min:12,max:12,w:20},{id:'zubat',min:12,max:12,w:10},{id:'machoke',min:15,max:15,w:5},{id:'marowak',min:12,max:12,w:4},{id:'marowak',min:12,max:12,w:1}],
		night: [{id:'zubat',min:12,max:12,w:30},{id:'geodude',min:11,max:11,w:30},{id:'geodude',min:12,max:12,w:20},{id:'haunter',min:17,max:17,w:10},{id:'zubat',min:15,max:15,w:5},{id:'zubat',min:15,max:15,w:4},{id:'zubat',min:15,max:15,w:1}],
	} },
	'MAP_JOHKANTO_ROCK_TUNNEL_B1F': { land: {
		morning: [{id:'cubone',min:12,max:12,w:30},{id:'geodude',min:14,max:14,w:30},{id:'onix',min:16,max:16,w:20},{id:'zubat',min:12,max:12,w:10},{id:'marowak',min:15,max:15,w:5},{id:'kangaskhan',min:15,max:15,w:4},{id:'kangaskhan',min:15,max:15,w:1}],
		day: [{id:'cubone',min:12,max:12,w:30},{id:'geodude',min:14,max:14,w:30},{id:'onix',min:16,max:16,w:20},{id:'zubat',min:12,max:12,w:10},{id:'marowak',min:15,max:15,w:5},{id:'kangaskhan',min:15,max:15,w:4},{id:'kangaskhan',min:15,max:15,w:1}],
		night: [{id:'zubat',min:12,max:12,w:30},{id:'geodude',min:14,max:14,w:30},{id:'onix',min:16,max:16,w:20},{id:'zubat',min:15,max:15,w:10},{id:'haunter',min:15,max:15,w:5},{id:'golbat',min:15,max:15,w:4},{id:'golbat',min:15,max:15,w:1}],
	} },
	'MAP_VICTORY_ROAD': { land: {
		morning: [{id:'graveler',min:34,max:34,w:30},{id:'rhyhorn',min:32,max:32,w:30},{id:'onix',min:33,max:33,w:20},{id:'golbat',min:34,max:34,w:10},{id:'sandslash',min:35,max:35,w:5},{id:'rhydon',min:35,max:35,w:4},{id:'rhydon',min:35,max:35,w:1}],
		day: [{id:'graveler',min:34,max:34,w:30},{id:'rhyhorn',min:32,max:32,w:30},{id:'onix',min:33,max:33,w:20},{id:'golbat',min:34,max:34,w:10},{id:'sandslash',min:35,max:35,w:5},{id:'rhydon',min:35,max:35,w:4},{id:'rhydon',min:35,max:35,w:1}],
		night: [{id:'golbat',min:34,max:34,w:30},{id:'graveler',min:34,max:34,w:30},{id:'onix',min:32,max:32,w:20},{id:'graveler',min:36,max:36,w:10},{id:'graveler',min:38,max:38,w:5},{id:'graveler',min:40,max:40,w:4},{id:'graveler',min:40,max:40,w:1}],
	} },
	'MAP_TOHJO_FALLS': { land: {
		morning: [{id:'zubat',min:22,max:22,w:30},{id:'raticate',min:22,max:22,w:30},{id:'golbat',min:24,max:24,w:20},{id:'slowpoke',min:21,max:21,w:10},{id:'rattata',min:20,max:20,w:5},{id:'slowpoke',min:23,max:23,w:4},{id:'slowpoke',min:23,max:23,w:1}],
		day: [{id:'zubat',min:22,max:22,w:30},{id:'raticate',min:22,max:22,w:30},{id:'golbat',min:24,max:24,w:20},{id:'slowpoke',min:21,max:21,w:10},{id:'rattata',min:20,max:20,w:5},{id:'slowpoke',min:23,max:23,w:4},{id:'slowpoke',min:23,max:23,w:1}],
		night: [{id:'zubat',min:22,max:22,w:30},{id:'raticate',min:22,max:22,w:30},{id:'golbat',min:24,max:24,w:20},{id:'slowpoke',min:21,max:21,w:10},{id:'rattata',min:20,max:20,w:5},{id:'slowpoke',min:23,max:23,w:4},{id:'slowpoke',min:23,max:23,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_1': { land: {
		morning: [{id:'pidgey',min:2,max:2,w:30},{id:'rattata',min:2,max:2,w:30},{id:'sentret',min:3,max:3,w:20},{id:'pidgey',min:3,max:3,w:10},{id:'furret',min:6,max:6,w:5},{id:'pidgey',min:4,max:4,w:4},{id:'pidgey',min:4,max:4,w:1}],
		day: [{id:'pidgey',min:2,max:2,w:30},{id:'rattata',min:2,max:2,w:30},{id:'sentret',min:3,max:3,w:20},{id:'pidgey',min:3,max:3,w:10},{id:'furret',min:6,max:6,w:5},{id:'pidgey',min:4,max:4,w:4},{id:'pidgey',min:4,max:4,w:1}],
		night: [{id:'hoothoot',min:2,max:2,w:30},{id:'rattata',min:2,max:2,w:30},{id:'rattata',min:3,max:3,w:20},{id:'hoothoot',min:3,max:3,w:10},{id:'raticate',min:6,max:6,w:5},{id:'hoothoot',min:4,max:4,w:4},{id:'hoothoot',min:4,max:4,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_2': { land: {
		morning: [{id:'caterpie',min:3,max:3,w:30},{id:'ledyba',min:3,max:3,w:30},{id:'pidgey',min:5,max:5,w:20},{id:'butterfree',min:7,max:7,w:10},{id:'ledian',min:7,max:7,w:5},{id:'pikachu',min:4,max:4,w:4},{id:'pikachu',min:4,max:4,w:1}],
		day: [{id:'caterpie',min:3,max:3,w:30},{id:'pidgey',min:3,max:3,w:30},{id:'pidgey',min:5,max:5,w:20},{id:'butterfree',min:7,max:7,w:10},{id:'pidgeotto',min:7,max:7,w:5},{id:'pikachu',min:4,max:4,w:4},{id:'pikachu',min:4,max:4,w:1}],
		night: [{id:'hoothoot',min:3,max:3,w:30},{id:'spinarak',min:3,max:3,w:30},{id:'hoothoot',min:5,max:5,w:20},{id:'noctowl',min:7,max:7,w:10},{id:'ariados',min:7,max:7,w:5},{id:'noctowl',min:4,max:4,w:4},{id:'noctowl',min:4,max:4,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_3': { land: {
		morning: [{id:'spearow',min:5,max:5,w:30},{id:'rattata',min:5,max:5,w:30},{id:'ekans',min:8,max:8,w:20},{id:'raticate',min:10,max:10,w:10},{id:'arbok',min:10,max:10,w:5},{id:'sandshrew',min:10,max:10,w:4},{id:'sandshrew',min:10,max:10,w:1}],
		day: [{id:'spearow',min:5,max:5,w:30},{id:'rattata',min:5,max:5,w:30},{id:'ekans',min:8,max:8,w:20},{id:'raticate',min:10,max:10,w:10},{id:'arbok',min:10,max:10,w:5},{id:'sandshrew',min:10,max:10,w:4},{id:'sandshrew',min:10,max:10,w:1}],
		night: [{id:'rattata',min:5,max:5,w:30},{id:'rattata',min:10,max:10,w:30},{id:'raticate',min:10,max:10,w:20},{id:'zubat',min:6,max:6,w:10},{id:'rattata',min:5,max:5,w:5},{id:'clefairy',min:6,max:6,w:4},{id:'clefairy',min:6,max:6,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_4': { land: {
		morning: [{id:'spearow',min:5,max:5,w:30},{id:'rattata',min:5,max:5,w:30},{id:'ekans',min:8,max:8,w:20},{id:'raticate',min:10,max:10,w:10},{id:'arbok',min:10,max:10,w:5},{id:'sandshrew',min:10,max:10,w:4},{id:'sandshrew',min:10,max:10,w:1}],
		day: [{id:'spearow',min:5,max:5,w:30},{id:'rattata',min:5,max:5,w:30},{id:'ekans',min:8,max:8,w:20},{id:'raticate',min:10,max:10,w:10},{id:'arbok',min:10,max:10,w:5},{id:'sandshrew',min:10,max:10,w:4},{id:'sandshrew',min:10,max:10,w:1}],
		night: [{id:'rattata',min:5,max:5,w:30},{id:'rattata',min:10,max:10,w:30},{id:'raticate',min:10,max:10,w:20},{id:'zubat',min:6,max:6,w:10},{id:'rattata',min:5,max:5,w:5},{id:'clefairy',min:6,max:6,w:4},{id:'clefairy',min:6,max:6,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_5': { land: {
		morning: [{id:'pidgey',min:13,max:13,w:30},{id:'snubbull',min:13,max:13,w:30},{id:'pidgeotto',min:15,max:15,w:20},{id:'abra',min:12,max:12,w:10},{id:'jigglypuff',min:14,max:14,w:5},{id:'abra',min:14,max:14,w:4},{id:'abra',min:14,max:14,w:1}],
		day: [{id:'pidgey',min:13,max:13,w:30},{id:'snubbull',min:13,max:13,w:30},{id:'pidgeotto',min:15,max:15,w:20},{id:'abra',min:12,max:12,w:10},{id:'jigglypuff',min:14,max:14,w:5},{id:'abra',min:14,max:14,w:4},{id:'abra',min:14,max:14,w:1}],
		night: [{id:'hoothoot',min:13,max:13,w:30},{id:'meowth',min:13,max:13,w:30},{id:'noctowl',min:15,max:15,w:20},{id:'abra',min:12,max:12,w:10},{id:'jigglypuff',min:14,max:14,w:5},{id:'abra',min:14,max:14,w:4},{id:'abra',min:14,max:14,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_6': { land: {
		morning: [{id:'rattata',min:13,max:13,w:30},{id:'snubbull',min:13,max:13,w:30},{id:'magnemite',min:14,max:14,w:20},{id:'raticate',min:15,max:15,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'granbull',min:15,max:15,w:4},{id:'granbull',min:15,max:15,w:1}],
		day: [{id:'rattata',min:13,max:13,w:30},{id:'snubbull',min:13,max:13,w:30},{id:'magnemite',min:14,max:14,w:20},{id:'raticate',min:15,max:15,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'granbull',min:15,max:15,w:4},{id:'granbull',min:15,max:15,w:1}],
		night: [{id:'meowth',min:13,max:13,w:30},{id:'drowzee',min:13,max:13,w:30},{id:'magnemite',min:14,max:14,w:20},{id:'psyduck',min:15,max:15,w:10},{id:'jigglypuff',min:12,max:12,w:5},{id:'raticate',min:15,max:15,w:4},{id:'raticate',min:15,max:15,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_7': { land: {
		morning: [{id:'rattata',min:17,max:17,w:30},{id:'spearow',min:17,max:17,w:30},{id:'snubbull',min:18,max:18,w:20},{id:'raticate',min:18,max:18,w:10},{id:'jigglypuff',min:18,max:18,w:5},{id:'abra',min:16,max:16,w:4},{id:'abra',min:16,max:16,w:1}],
		day: [{id:'rattata',min:17,max:17,w:30},{id:'spearow',min:17,max:17,w:30},{id:'snubbull',min:18,max:18,w:20},{id:'raticate',min:18,max:18,w:10},{id:'jigglypuff',min:18,max:18,w:5},{id:'abra',min:16,max:16,w:4},{id:'abra',min:16,max:16,w:1}],
		night: [{id:'meowth',min:17,max:17,w:30},{id:'murkrow',min:17,max:17,w:30},{id:'houndour',min:18,max:18,w:20},{id:'persian',min:18,max:18,w:10},{id:'jigglypuff',min:18,max:18,w:5},{id:'abra',min:16,max:16,w:4},{id:'abra',min:16,max:16,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_8': { land: {
		morning: [{id:'snubbull',min:17,max:17,w:30},{id:'pidgeotto',min:19,max:19,w:30},{id:'abra',min:16,max:16,w:20},{id:'growlithe',min:17,max:17,w:10},{id:'jigglypuff',min:16,max:16,w:5},{id:'kadabra',min:18,max:18,w:4},{id:'kadabra',min:18,max:18,w:1}],
		day: [{id:'snubbull',min:17,max:17,w:30},{id:'pidgeotto',min:19,max:19,w:30},{id:'abra',min:16,max:16,w:20},{id:'growlithe',min:17,max:17,w:10},{id:'jigglypuff',min:16,max:16,w:5},{id:'kadabra',min:18,max:18,w:4},{id:'kadabra',min:18,max:18,w:1}],
		night: [{id:'meowth',min:17,max:17,w:30},{id:'noctowl',min:20,max:20,w:30},{id:'abra',min:16,max:16,w:20},{id:'haunter',min:17,max:17,w:10},{id:'jigglypuff',min:16,max:16,w:5},{id:'kadabra',min:18,max:18,w:4},{id:'kadabra',min:18,max:18,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_9': { land: {
		morning: [{id:'rattata',min:15,max:15,w:30},{id:'spearow',min:15,max:15,w:30},{id:'raticate',min:15,max:15,w:20},{id:'fearow',min:15,max:15,w:10},{id:'fearow',min:15,max:15,w:5},{id:'marowak',min:18,max:18,w:4},{id:'marowak',min:18,max:18,w:1}],
		day: [{id:'rattata',min:15,max:15,w:30},{id:'spearow',min:15,max:15,w:30},{id:'raticate',min:15,max:15,w:20},{id:'fearow',min:15,max:15,w:10},{id:'fearow',min:15,max:15,w:5},{id:'marowak',min:18,max:18,w:4},{id:'marowak',min:18,max:18,w:1}],
		night: [{id:'rattata',min:15,max:15,w:30},{id:'venonat',min:15,max:15,w:30},{id:'raticate',min:15,max:15,w:20},{id:'venomoth',min:15,max:15,w:10},{id:'zubat',min:15,max:15,w:5},{id:'raticate',min:18,max:18,w:4},{id:'raticate',min:18,max:18,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_10_NORTH': { land: {
		morning: [{id:'spearow',min:15,max:15,w:30},{id:'voltorb',min:17,max:17,w:30},{id:'raticate',min:15,max:15,w:20},{id:'fearow',min:15,max:15,w:10},{id:'marowak',min:15,max:15,w:5},{id:'electabuzz',min:16,max:16,w:4},{id:'electabuzz',min:16,max:16,w:1}],
		day: [{id:'spearow',min:15,max:15,w:30},{id:'voltorb',min:17,max:17,w:30},{id:'raticate',min:15,max:15,w:20},{id:'fearow',min:15,max:15,w:10},{id:'marowak',min:15,max:15,w:5},{id:'electabuzz',min:18,max:18,w:4},{id:'electabuzz',min:18,max:18,w:1}],
		night: [{id:'venonat',min:15,max:15,w:30},{id:'voltorb',min:17,max:17,w:30},{id:'raticate',min:15,max:15,w:20},{id:'venomoth',min:15,max:15,w:10},{id:'zubat',min:15,max:15,w:5},{id:'electabuzz',min:16,max:16,w:4},{id:'electabuzz',min:16,max:16,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_11': { land: {
		morning: [{id:'hoppip',min:14,max:14,w:30},{id:'raticate',min:13,max:13,w:30},{id:'magnemite',min:15,max:15,w:20},{id:'pidgeotto',min:16,max:16,w:10},{id:'rattata',min:16,max:16,w:5},{id:'hoppip',min:16,max:16,w:4},{id:'hoppip',min:16,max:16,w:1}],
		day: [{id:'hoppip',min:14,max:14,w:30},{id:'raticate',min:13,max:13,w:30},{id:'magnemite',min:15,max:15,w:20},{id:'pidgeotto',min:16,max:16,w:10},{id:'rattata',min:16,max:16,w:5},{id:'hoppip',min:16,max:16,w:4},{id:'hoppip',min:16,max:16,w:1}],
		night: [{id:'drowzee',min:14,max:14,w:30},{id:'meowth',min:13,max:13,w:30},{id:'magnemite',min:15,max:15,w:20},{id:'noctowl',min:16,max:16,w:10},{id:'raticate',min:16,max:16,w:5},{id:'hypno',min:16,max:16,w:4},{id:'hypno',min:16,max:16,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_13': { land: {
		morning: [{id:'nidorino',min:23,max:23,w:30},{id:'nidorina',min:23,max:23,w:30},{id:'pidgeotto',min:25,max:25,w:20},{id:'hoppip',min:25,max:25,w:10},{id:'hoppip',min:27,max:27,w:5},{id:'hoppip',min:27,max:27,w:4},{id:'chansey',min:25,max:25,w:1}],
		day: [{id:'nidorino',min:23,max:23,w:30},{id:'nidorina',min:23,max:23,w:30},{id:'pidgeotto',min:25,max:25,w:20},{id:'hoppip',min:25,max:25,w:10},{id:'hoppip',min:27,max:27,w:5},{id:'hoppip',min:27,max:27,w:4},{id:'chansey',min:25,max:25,w:1}],
		night: [{id:'venonat',min:23,max:23,w:30},{id:'quagsire',min:23,max:23,w:30},{id:'noctowl',min:25,max:25,w:20},{id:'venomoth',min:25,max:25,w:10},{id:'quagsire',min:25,max:25,w:5},{id:'quagsire',min:25,max:25,w:4},{id:'chansey',min:25,max:25,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_14': { land: {
		morning: [{id:'nidorino',min:26,max:26,w:30},{id:'nidorina',min:26,max:26,w:30},{id:'pidgeotto',min:28,max:28,w:20},{id:'hoppip',min:28,max:28,w:10},{id:'skiploom',min:30,max:30,w:5},{id:'skiploom',min:30,max:30,w:4},{id:'chansey',min:28,max:28,w:1}],
		day: [{id:'nidorino',min:26,max:26,w:30},{id:'nidorina',min:26,max:26,w:30},{id:'pidgeotto',min:28,max:28,w:20},{id:'hoppip',min:28,max:28,w:10},{id:'skiploom',min:30,max:30,w:5},{id:'skiploom',min:30,max:30,w:4},{id:'chansey',min:28,max:28,w:1}],
		night: [{id:'venonat',min:26,max:26,w:30},{id:'quagsire',min:26,max:26,w:30},{id:'noctowl',min:28,max:28,w:20},{id:'venomoth',min:28,max:28,w:10},{id:'quagsire',min:28,max:28,w:5},{id:'quagsire',min:28,max:28,w:4},{id:'chansey',min:28,max:28,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_15': { land: {
		morning: [{id:'nidorino',min:23,max:23,w:30},{id:'nidorina',min:23,max:23,w:30},{id:'pidgeotto',min:25,max:25,w:20},{id:'hoppip',min:25,max:25,w:10},{id:'hoppip',min:27,max:27,w:5},{id:'hoppip',min:27,max:27,w:4},{id:'chansey',min:25,max:25,w:1}],
		day: [{id:'nidorino',min:23,max:23,w:30},{id:'nidorina',min:23,max:23,w:30},{id:'pidgeotto',min:25,max:25,w:20},{id:'hoppip',min:25,max:25,w:10},{id:'hoppip',min:27,max:27,w:5},{id:'hoppip',min:27,max:27,w:4},{id:'chansey',min:25,max:25,w:1}],
		night: [{id:'venonat',min:23,max:23,w:30},{id:'quagsire',min:23,max:23,w:30},{id:'noctowl',min:25,max:25,w:20},{id:'venomoth',min:25,max:25,w:10},{id:'quagsire',min:25,max:25,w:5},{id:'quagsire',min:25,max:25,w:4},{id:'chansey',min:25,max:25,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_16': { land: {
		morning: [{id:'grimer',min:26,max:26,w:30},{id:'fearow',min:27,max:27,w:30},{id:'grimer',min:28,max:28,w:20},{id:'fearow',min:29,max:29,w:10},{id:'fearow',min:29,max:29,w:5},{id:'muk',min:30,max:30,w:4},{id:'muk',min:30,max:30,w:1}],
		day: [{id:'grimer',min:26,max:26,w:30},{id:'fearow',min:27,max:27,w:30},{id:'grimer',min:28,max:28,w:20},{id:'fearow',min:29,max:29,w:10},{id:'slugma',min:29,max:29,w:5},{id:'muk',min:30,max:30,w:4},{id:'muk',min:30,max:30,w:1}],
		night: [{id:'grimer',min:26,max:26,w:30},{id:'grimer',min:27,max:27,w:30},{id:'grimer',min:28,max:28,w:20},{id:'murkrow',min:29,max:29,w:10},{id:'murkrow',min:29,max:29,w:5},{id:'muk',min:30,max:30,w:4},{id:'muk',min:30,max:30,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_17': { land: {
		morning: [{id:'fearow',min:30,max:30,w:30},{id:'grimer',min:29,max:29,w:30},{id:'grimer',min:31,max:31,w:20},{id:'fearow',min:32,max:32,w:10},{id:'grimer',min:33,max:33,w:5},{id:'muk',min:33,max:33,w:4},{id:'muk',min:33,max:33,w:1}],
		day: [{id:'fearow',min:30,max:30,w:30},{id:'slugma',min:29,max:29,w:30},{id:'grimer',min:29,max:29,w:20},{id:'fearow',min:32,max:32,w:10},{id:'slugma',min:32,max:32,w:5},{id:'muk',min:33,max:33,w:4},{id:'muk',min:33,max:33,w:1}],
		night: [{id:'grimer',min:30,max:30,w:30},{id:'grimer',min:29,max:29,w:30},{id:'grimer',min:31,max:31,w:20},{id:'grimer',min:32,max:32,w:10},{id:'grimer',min:33,max:33,w:5},{id:'muk',min:33,max:33,w:4},{id:'muk',min:33,max:33,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_18': { land: {
		morning: [{id:'grimer',min:26,max:26,w:30},{id:'fearow',min:27,max:27,w:30},{id:'grimer',min:28,max:28,w:20},{id:'fearow',min:29,max:29,w:10},{id:'fearow',min:29,max:29,w:5},{id:'muk',min:30,max:30,w:4},{id:'muk',min:30,max:30,w:1}],
		day: [{id:'grimer',min:26,max:26,w:30},{id:'fearow',min:27,max:27,w:30},{id:'grimer',min:28,max:28,w:20},{id:'fearow',min:29,max:29,w:10},{id:'slugma',min:29,max:29,w:5},{id:'muk',min:30,max:30,w:4},{id:'muk',min:30,max:30,w:1}],
		night: [{id:'grimer',min:26,max:26,w:30},{id:'grimer',min:27,max:27,w:30},{id:'grimer',min:28,max:28,w:20},{id:'grimer',min:29,max:29,w:10},{id:'grimer',min:29,max:29,w:5},{id:'muk',min:30,max:30,w:4},{id:'muk',min:30,max:30,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_21': { land: {
		morning: [{id:'tangela',min:30,max:30,w:30},{id:'rattata',min:25,max:25,w:30},{id:'tangela',min:35,max:35,w:20},{id:'raticate',min:20,max:20,w:10},{id:'mrmime',min:30,max:30,w:5},{id:'mrmime',min:28,max:28,w:4},{id:'mrmime',min:28,max:28,w:1}],
		day: [{id:'tangela',min:30,max:30,w:30},{id:'rattata',min:25,max:25,w:30},{id:'tangela',min:35,max:35,w:20},{id:'raticate',min:20,max:20,w:10},{id:'mrmime',min:28,max:28,w:5},{id:'mrmime',min:30,max:30,w:4},{id:'mrmime',min:30,max:30,w:1}],
		night: [{id:'tangela',min:30,max:30,w:30},{id:'rattata',min:25,max:25,w:30},{id:'tangela',min:35,max:35,w:20},{id:'raticate',min:20,max:20,w:10},{id:'tangela',min:30,max:30,w:5},{id:'tangela',min:28,max:28,w:4},{id:'tangela',min:28,max:28,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_22': { land: {
		morning: [{id:'rattata',min:3,max:3,w:30},{id:'spearow',min:3,max:3,w:30},{id:'spearow',min:5,max:5,w:20},{id:'doduo',min:4,max:4,w:10},{id:'ponyta',min:6,max:6,w:5},{id:'fearow',min:7,max:7,w:4},{id:'fearow',min:7,max:7,w:1}],
		day: [{id:'rattata',min:3,max:3,w:30},{id:'spearow',min:3,max:3,w:30},{id:'spearow',min:5,max:5,w:20},{id:'doduo',min:4,max:4,w:10},{id:'ponyta',min:6,max:6,w:5},{id:'fearow',min:7,max:7,w:4},{id:'fearow',min:7,max:7,w:1}],
		night: [{id:'rattata',min:3,max:3,w:30},{id:'poliwag',min:3,max:3,w:30},{id:'rattata',min:5,max:5,w:20},{id:'poliwag',min:4,max:4,w:10},{id:'rattata',min:6,max:6,w:5},{id:'rattata',min:7,max:7,w:4},{id:'rattata',min:7,max:7,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_24': { land: {
		morning: [{id:'caterpie',min:8,max:8,w:30},{id:'caterpie',min:10,max:10,w:30},{id:'metapod',min:12,max:12,w:20},{id:'abra',min:12,max:12,w:10},{id:'bellsprout',min:10,max:10,w:5},{id:'butterfree',min:14,max:14,w:4},{id:'butterfree',min:14,max:14,w:1}],
		day: [{id:'caterpie',min:8,max:8,w:30},{id:'sunkern',min:12,max:12,w:30},{id:'caterpie',min:10,max:10,w:20},{id:'abra',min:12,max:12,w:10},{id:'bellsprout',min:10,max:10,w:5},{id:'butterfree',min:14,max:14,w:4},{id:'butterfree',min:14,max:14,w:1}],
		night: [{id:'venonat',min:10,max:10,w:30},{id:'oddish',min:10,max:10,w:30},{id:'oddish',min:12,max:12,w:20},{id:'abra',min:12,max:12,w:10},{id:'bellsprout',min:10,max:10,w:5},{id:'gloom',min:14,max:14,w:4},{id:'gloom',min:14,max:14,w:1}],
	} },
	'MAP_JOHKANTO_ROUTE_25': { land: {
		morning: [{id:'caterpie',min:10,max:10,w:30},{id:'pidgey',min:10,max:10,w:30},{id:'pidgeotto',min:12,max:12,w:20},{id:'metapod',min:12,max:12,w:10},{id:'bellsprout',min:10,max:10,w:5},{id:'butterfree',min:14,max:14,w:4},{id:'butterfree',min:14,max:14,w:1}],
		day: [{id:'caterpie',min:10,max:10,w:30},{id:'pidgey',min:10,max:10,w:30},{id:'pidgeotto',min:12,max:12,w:20},{id:'metapod',min:12,max:12,w:10},{id:'bellsprout',min:10,max:10,w:5},{id:'butterfree',min:14,max:14,w:4},{id:'butterfree',min:14,max:14,w:1}],
		night: [{id:'oddish',min:10,max:10,w:30},{id:'hoothoot',min:10,max:10,w:30},{id:'venonat',min:10,max:10,w:20},{id:'noctowl',min:12,max:12,w:10},{id:'bellsprout',min:10,max:10,w:5},{id:'noctowl',min:14,max:14,w:4},{id:'noctowl',min:14,max:14,w:1}],
	} },
	'MAP_ROUTE_26': { land: {
		morning: [{id:'doduo',min:28,max:28,w:30},{id:'sandslash',min:28,max:28,w:30},{id:'ponyta',min:32,max:32,w:20},{id:'raticate',min:30,max:30,w:10},{id:'doduo',min:30,max:30,w:5},{id:'arbok',min:30,max:30,w:4},{id:'arbok',min:30,max:30,w:1}],
		day: [{id:'doduo',min:28,max:28,w:30},{id:'sandslash',min:28,max:28,w:30},{id:'ponyta',min:32,max:32,w:20},{id:'raticate',min:30,max:30,w:10},{id:'doduo',min:30,max:30,w:5},{id:'arbok',min:30,max:30,w:4},{id:'arbok',min:30,max:30,w:1}],
		night: [{id:'noctowl',min:28,max:28,w:30},{id:'raticate',min:28,max:28,w:30},{id:'noctowl',min:32,max:32,w:20},{id:'raticate',min:30,max:30,w:10},{id:'quagsire',min:30,max:30,w:5},{id:'quagsire',min:30,max:30,w:4},{id:'quagsire',min:30,max:30,w:1}],
	} },
	'MAP_ROUTE_27': { land: {
		morning: [{id:'doduo',min:28,max:28,w:30},{id:'arbok',min:28,max:28,w:30},{id:'raticate',min:30,max:30,w:20},{id:'doduo',min:30,max:30,w:10},{id:'ponyta',min:32,max:32,w:5},{id:'dodrio',min:30,max:30,w:4},{id:'dodrio',min:30,max:30,w:1}],
		day: [{id:'doduo',min:28,max:28,w:30},{id:'arbok',min:28,max:28,w:30},{id:'raticate',min:30,max:30,w:20},{id:'doduo',min:30,max:30,w:10},{id:'ponyta',min:32,max:32,w:5},{id:'dodrio',min:30,max:30,w:4},{id:'dodrio',min:30,max:30,w:1}],
		night: [{id:'quagsire',min:28,max:28,w:30},{id:'noctowl',min:28,max:28,w:30},{id:'raticate',min:30,max:30,w:20},{id:'quagsire',min:30,max:30,w:10},{id:'noctowl',min:32,max:32,w:5},{id:'noctowl',min:32,max:32,w:4},{id:'noctowl',min:32,max:32,w:1}],
	} },
	'MAP_ROUTE_28': { land: {
		morning: [{id:'tangela',min:39,max:39,w:30},{id:'ponyta',min:40,max:40,w:30},{id:'rapidash',min:40,max:40,w:20},{id:'arbok',min:42,max:42,w:10},{id:'doduo',min:41,max:41,w:5},{id:'dodrio',min:43,max:43,w:4},{id:'dodrio',min:43,max:43,w:1}],
		day: [{id:'tangela',min:39,max:39,w:30},{id:'ponyta',min:40,max:40,w:30},{id:'rapidash',min:40,max:40,w:20},{id:'arbok',min:42,max:42,w:10},{id:'doduo',min:41,max:41,w:5},{id:'dodrio',min:43,max:43,w:4},{id:'dodrio',min:43,max:43,w:1}],
		night: [{id:'tangela',min:39,max:39,w:30},{id:'poliwhirl',min:40,max:40,w:30},{id:'golbat',min:40,max:40,w:20},{id:'poliwhirl',min:40,max:40,w:10},{id:'golbat',min:42,max:42,w:5},{id:'golbat',min:42,max:42,w:4},{id:'golbat',min:42,max:42,w:1}],
	} },
};
