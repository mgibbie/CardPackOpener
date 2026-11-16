// bgm_themes.js — the battle and field themes of each soundtrack, by role (ow_music.js picks the role; the owner's
// /audioswap/ page lists them). Kept by itself so that page can read it without loading the game.
export const BATTLE_THEMES = {
	// SINNOH's source has its own wild, Galactic, Cyrus, Cynthia and Dialga/Palkia themes (rendered from its MIDI,
	// tools/gen_sinnoh_bgm.mjs) and plays Emerald's for the rest, as the source itself does
	sinnoh: {
		wild: 'sinnoh_MUS_DPP_VS_WILD', trainer: 'emerald_MUS_VS_TRAINER',
		gym: 'emerald_MUS_VS_GYM_LEADER', elite: 'emerald_MUS_VS_ELITE_FOUR',
		champion: 'sinnoh_MUS_DPP_VS_CYNTHIA', rival: 'emerald_MUS_VS_RIVAL',
		evil: 'sinnoh_MUS_DPP_VS_GALACTIC', evilboss: 'sinnoh_MUS_DPP_VS_CYRUS',
		legendary: 'sinnoh_MUS_DPP_VS_DIALGA_PALKIA', regi: 'emerald_MUS_VS_REGI',
		surf: 'emerald_MUS_SURF', bike: 'sinnoh_MUS_DPP_CYCLING',
	},
	crystal: {
		wild: 'crystal_MUSIC_JOHTO_WILD_BATTLE', wildNight: 'crystal_MUSIC_JOHTO_WILD_BATTLE_NIGHT',
		trainer: 'crystal_MUSIC_JOHTO_TRAINER_BATTLE', gym: 'crystal_MUSIC_JOHTO_GYM_LEADER_BATTLE',
		kantoWild: 'crystal_MUSIC_KANTO_WILD_BATTLE', kantoTrainer: 'crystal_MUSIC_KANTO_TRAINER_BATTLE',
		kantoGym: 'crystal_MUSIC_KANTO_GYM_LEADER_BATTLE',
		// GSC's Elite Four ride the gym-leader theme; only the Champion differs
		elite: 'crystal_MUSIC_JOHTO_GYM_LEADER_BATTLE',
		champion: 'crystal_MUSIC_CHAMPION_BATTLE', rival: 'crystal_MUSIC_RIVAL_BATTLE',
		evil: 'crystal_MUSIC_ROCKET_BATTLE', evilboss: 'crystal_MUSIC_ROCKET_BATTLE',
		legendary: 'crystal_MUSIC_SUICUNE_BATTLE', regi: 'crystal_MUSIC_SUICUNE_BATTLE',
		surf: 'crystal_MUSIC_SURF', bike: 'crystal_MUSIC_BICYCLE',
	},
	firered: {
		wild: 'firered_MUS_VS_WILD', trainer: 'firered_MUS_VS_TRAINER',
		gym: 'firered_MUS_VS_GYM_LEADER', elite: 'firered_MUS_VS_GYM_LEADER',
		champion: 'firered_MUS_VS_CHAMPION',
		// FR gives rockets and the mid-game rival plain trainer music — authentic
		rival: 'firered_MUS_VS_TRAINER', evil: 'firered_MUS_VS_TRAINER', evilboss: 'firered_MUS_VS_TRAINER',
		legendary: 'firered_MUS_VS_LEGEND', regi: 'firered_MUS_VS_LEGEND',
		surf: 'firered_MUS_SURF', bike: 'firered_MUS_CYCLING',
	},
	emerald: {
		wild: 'emerald_MUS_VS_WILD', trainer: 'emerald_MUS_VS_TRAINER',
		gym: 'emerald_MUS_VS_GYM_LEADER', elite: 'emerald_MUS_VS_ELITE_FOUR',
		champion: 'emerald_MUS_VS_CHAMPION', rival: 'emerald_MUS_VS_RIVAL',
		evil: 'emerald_MUS_VS_AQUA_MAGMA', evilboss: 'emerald_MUS_VS_AQUA_MAGMA_LEADER',
		legendary: 'emerald_MUS_VS_KYOGRE_GROUDON', regi: 'emerald_MUS_VS_REGI',
		surf: 'emerald_MUS_SURF', bike: 'emerald_MUS_CYCLING',
	},
};
// the music of the two events that bring their own (ow_music.js bgmTick)
export const EVENT_THEMES = { blender: 'emerald_MUS_CYCLING', contest: 'emerald_MUS_CONTEST' };
