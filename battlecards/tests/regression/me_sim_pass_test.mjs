// me_sim_pass_test.mjs — Lorequest: Middle-earth, simulation balance pass (2026-10-13).
// The AI-vs-AI simulation (every hero vs every enemy; later rungs with the hero deck grown by
// the run's own rewards) on the cards after #680/#681/#683 still showed the mode far harder than
// Sword Coast or Final Fantasy. Hero win rate before -> after:
//   Mooks: Grishnákh 21->39, Chief Warg 31->49, Gorbag 35->44, Old Man Willow 34->35
//   Lieutenants: Bolg 8->44, Mauhúr 18->46, King of the Oathbreakers 21->47, Great Goblin 30->41,
//     Uglúk 32->52
//   Commanders: Smaug 9->49, Sauron the Necromancer 14->49, Witch-king 29->40, Saruman 31->41,
//     Azog 31->44
//   The Dark Lord: Sauron the Dark Lord 2->25, Sauron the Lidless Eye 14->32
// Each enemy has its own deck, so the nerfs are per deck: +1 mana on the token-makers, cheap
// Rush/Charge bodies, removal and engines (Gorbag: Easterling Vanguard carried him), +2 on the
// Necromancer's 2-mana 6/6 Reanimate, and every one of these hero powers raised (to 3-5).
// Pins the 129 changed costs and the hero-power costs.
import fs from 'fs';
import * as ME from '../../middleearth.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

const COSTS = {
	"me_gr_sig":5,"me_gr_foray":4,"me_gr_scarred":3,"me_cw_sig":5,"me_cw_snarling":3,"me_cw_company":4,
	"me_cw_desolation":5,"me_bo_sig":6,"me_bo_reanimate":3,"me_bo_extract":5,"me_bo_ench":5,"me_ma_sig":6,
	"me_ma_muster":5,"me_ma_foray":4,"me_ma_bowmasters":4,"me_oa_sig":6,"me_oa_summoning":5,"me_oa_living":7,
	"me_oa_soldier":3,"me_gg_sig":6,"me_gg_swarm":4,"me_gg_pinecone":3,"me_gg_surrounded":5,"me_ug_sig":6,
	"me_ug_wrath":4,"me_ug_unleashed":5,"me_ug_celebrant":4,"me_gr_marauder":4,"me_gr_raider":4,"me_go_throat":3,
	"me_go_gnash":5,"me_go_art":4,"me_go_siege":5,"me_cw_ravening":5,"me_cw_art":4,"me_bo_company":4,
	"me_bo_darkdwellers":6,"me_bo_nasty":3,"me_bo_art":4,"me_ma_raider":4,"me_ma_marauder":4,"me_ma_scavenger":3,
	"me_ma_art":4,"me_oa_grey":5,"me_oa_departed":4,"me_oa_art":4,"me_sm_art":5,"me_sm_cavern":7,
	"me_sm_ench":5,"me_sm_loc":5,"me_sm_fury":4,"me_sm_desolation":6,"me_sm_sig":9,"me_sn_loc":5,
	"me_sn_art":5,"me_sn_toxic":6,"me_sn_sig":8,"me_sn_reanimate":5,"me_wk_lord":7,"me_wk_ench":5,
	"me_wk_decree":7,"me_sa_summons":5,"me_sa_fire":5,"me_sa_treason":5,"me_az_foray":4,"me_az_rage":4,
	"me_az_executioner":4,"me_sd_ench":6,"me_sd_gaze":6,"me_sd_ransom":4,"me_sd_march":6,"me_sd_loc":5,
	"me_sd_sig":10,"me_sd_lord":9,"me_se_ench":6,"me_se_blasphemous":7,"me_se_loc":5,"me_se_art":5,
	"me_se_desolation":6,"me_se_sig":10,"me_go_trebuchet":4,"me_go_persecutor":6,"me_ma_berserker":5,"me_ma_siegemaster":5,
	"me_ma_smite":3,"me_ma_wargrider":6,"me_ma_loc":4,"me_bo_reckoning":7,"me_bo_opportunist":4,"me_bo_flunkies":3,
	"me_bo_haunt":4,"me_bo_loc":4,"me_bo_wep":3,"me_oa_nazgul":5,"me_oa_ringwraiths":6,"me_oa_loc":4,
	"me_oa_haunt":4,"me_sn_persecutor":6,"me_sn_nazgul":5,"me_sn_ringwraiths":6,"me_sn_batcloud":5,"me_sn_trebuchet":4,
	"me_sn_fellbeast":6,"me_sn_ench":5,"me_sn_crypt":3,"me_sm_wicked":8,"me_sm_calamity":7,"me_sm_magnificent":6,
	"me_sm_knollspine":7,"me_sm_scourge":6,"me_sm_wake":5,"me_sm_wep":5,"me_wk_sig":7,"me_wk_bringer":8,
	"me_wk_ringwraiths":6,"me_wk_fellbeast":6,"me_wk_skyscourge":7,"me_wk_rise":5,"me_wk_loc":5,"me_wk_art":4,
	"me_sd_witchking":7,"me_sd_balrog":8,"me_sd_nazgul":5,"me_sd_ringwraiths":6,"me_sd_persecutor":6,"me_sd_trebuchet":4,
	"me_sd_wep":5,"me_sd_art":6,"me_go_easterling":4
};
for (const [id, cost] of Object.entries(COSTS))
	ok(`${id} (${byId[id]?.name}) costs ${cost}`, byId[id] && byId[id].cost === cost, byId[id]?.cost);

const HP = {"Grishnákh":3,"The Chief Warg":3,"Old Man Willow":3,"Gorbag":3,"Bolg":4,"Mauhúr":4,"King of the Oathbreakers":4,"The Great Goblin":3,"Uglúk":3,"Smaug":4,"Sauron the Necromancer":5,"Witch-king of Angmar":4,"Saruman":3,"Azog":3,"Sauron the Dark Lord":4,"Sauron the Lidless Eye":3,"Shagrat":2,"Lotho":2,"Gothmog":2,"The Balrog":2};
for (const [ch, cost] of Object.entries(HP)) ok(`${ch} hero power costs ${cost}`, ME.powerOf(ch).cost === cost, ME.powerOf(ch).cost);

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
