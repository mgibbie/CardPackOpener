// rivals.js — the recurring cross-region RIVAL. In the badge-thirds spine you must climb
// all three regions in lockstep; your home-region rival (GARY / SILVER / BRENDAN, stored at
// the intro in `magepunk_rival`) is doing the same, and intercepts you once per tier at that
// tier's gym town — in whichever region you reach first. This threads a narrative through
// the region-hopping. The encounter fires on-arrive (the villain-beat pattern, main.js
// checkVillainTrigger) — no placed sprite — and is gated by a per-tier one-shot flag.
//
// The rival's team is a single authored roster that escalates by tier and mixes species from
// all three regions (fitting a trainer who's also climbing everywhere) — cleaner than
// per-region variants, and it sidesteps the fact that Johto's SILVER ships no team data.
import { PORTAL_TOWNS } from './portals.js';
import { globalTier } from './quest.js';
import * as Story from './events.js';

// tier (0..7, = the gym you're both about to face) -> the rival's team. Evolving cores:
// pidgey→pidgeotto→pidgeot, growlithe→arcanine, geodude→graveler→golem,
// gastly→haunter→gengar, dratini→dragonair→dragonite; plus a Hoenn dog + late SNORLAX.
// Levels sit a touch under each tier's gym leader (a warmup rematch).
export const RIVAL_TIERS = {
	0: [{ s: 'pidgey', l: 9 }, { s: 'dratini', l: 10 }],
	1: [{ s: 'pidgey', l: 14 }, { s: 'poochyena', l: 15 }, { s: 'dratini', l: 16 }],
	2: [{ s: 'pidgeotto', l: 20 }, { s: 'mightyena', l: 21 }, { s: 'dragonair', l: 22 }],
	3: [{ s: 'pidgeotto', l: 26 }, { s: 'growlithe', l: 26 }, { s: 'geodude', l: 27 }, { s: 'dragonair', l: 28 }],
	4: [{ s: 'pidgeot', l: 32 }, { s: 'growlithe', l: 32 }, { s: 'graveler', l: 33 }, { s: 'gastly', l: 33 }, { s: 'dragonair', l: 35 }],
	5: [{ s: 'pidgeot', l: 40 }, { s: 'arcanine', l: 40 }, { s: 'golem', l: 41 }, { s: 'haunter', l: 41 }, { s: 'dragonair', l: 43 }],
	6: [{ s: 'pidgeot', l: 46 }, { s: 'arcanine', l: 46 }, { s: 'golem', l: 47 }, { s: 'gengar', l: 47 }, { s: 'snorlax', l: 47 }, { s: 'dragonair', l: 49 }],
	7: [{ s: 'pidgeot', l: 54 }, { s: 'arcanine', l: 54 }, { s: 'golem', l: 55 }, { s: 'gengar', l: 55 }, { s: 'snorlax', l: 56 }, { s: 'dragonite', l: 58 }],
};

export function rivalFlag(tier) { return 'rival_tier' + tier + '_done'; }

// if the current map is the gym town of your CURRENT shared tier, the intro is done, and you
// haven't fought the rival at this tier yet, return that tier — else null.
export function rivalDue(mapId) {
	const info = PORTAL_TOWNS[mapId];
	if (!info || !Story.getFlag('intro_done')) return null;
	const tier = globalTier();
	if (tier > 7 || info.tier !== tier) return null;
	if (Story.getFlag(rivalFlag(tier))) return null;
	if (!(RIVAL_TIERS[tier] || []).length) return null;
	return tier;
}
