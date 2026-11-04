// ow_mega.js — where MEGA EVOLUTION meets the overworld: the KEY STONE, the Mega
// marts, and the Primal ORBS. The rules live in mega.js; the battle side in battle.js.
//
//   KEY STONE   the Gym Leader of your 8th badge (in any region) hands it over with
//               the badge; a save already past its 8th badge gets it on load.
//   MEGA STONES sold at the League counters (FireRed's Indigo Plateau clerk, Crystal's
//               Indigo Plateau clerk, Emerald's Ever Grande League clerk) once you are
//               that region's CHAMPION and hold the Key Stone.
//   RED / BLUE  the old couple at the summit of MT. PYRE, once you are Hoenn's
//   ORB         Champion (as in ORAS): the old man keeps the RED ORB, the old woman
//               the BLUE ORB. The old man also teaches a Rayquaza DRAGON ASCENT, the
//               move MEGA RAYQUAZA needs in place of a stone.
import * as Badges from './badges.js';
import * as Bag from './bag.js';
import * as Story from './events.js';
import { Journal } from './journal.js';
import { battle, dialog, hud, npcs, world } from './ow_core.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';
import { sfx } from './sound.js';
import { ENABLED_STONES, KEY_STONE, MEGA_MART_MAPS } from './mega.js';

const LEAGUE_REGIONS = ['KANTO', 'JOHTO', 'HOENN', 'JOHKANTO'];
const KEY_STONE_LINE = 'Hold onto it. A POKeMON holding its own\nMEGA STONE can MEGA EVOLVE in battle -\nonce in each battle. (FIGHT > MEGA)';

// the 8th badge's leader gives the Key Stone; returns the line to show, or null
export function grantKeyStone(region, badgeId) {
	if (Bag.count(KEY_STONE) || Badges.count(region) < 8) return null;
	const leader = (Badges.BADGES[Badges.regionKey(region)] || []).find(b => b.id === badgeId)?.leader || 'The Gym Leader';
	Bag.addItem(KEY_STONE);
	Story.setFlag('got_key_stone');
	Journal.add(`Received the KEY STONE from ${leader}`);
	return `${leader} also handed you a KEY STONE!\n\n${KEY_STONE_LINE}`;
}
// a save already holding 8 badges somewhere when this shipped (silent: boot)
export function catchUpKeyStone() {
	if (Bag.count(KEY_STONE)) return false;
	if (!LEAGUE_REGIONS.some(r => Badges.count(r) >= 8)) return false;
	// bag + HUD only: boot is too early for story flags / journal writes
	Bag.addItem(KEY_STONE);
	hud.textContent = 'Your 8 badges earned you a KEY STONE! (Mega Evolution: FIGHT > MEGA)';
	return true;
}

// the Mega Stones a League counter adds to its stock here, now
export function megaStockAt(mapId) {
	const region = MEGA_MART_MAPS[mapId];
	if (!region || !Bag.count(KEY_STONE) || !Badges.isChampion(region)) return [];
	return ENABLED_STONES.slice();
}

// ---------- MT. PYRE: the old couple and the ORBS ----------
const PYRE = 'MAP_MT_PYRE_SUMMIT';
const ORB_KEEPERS = {
	MtPyre_Summit_EventScript_OldMan: { orb: 'redorb', flag: 'got_red_orb', who: 'OLD MAN' },
	MtPyre_Summit_EventScript_OldLady: { orb: 'blueorb', flag: 'got_blue_orb', who: 'OLD WOMAN' },
};
// talking to someone on the faced tile; true when this handled it
export function megaNpcTalk(fx, fy) {
	if (world.current?.map?.id !== PYRE || !Badges.isChampion('HOENN')) return false;
	const n = npcs.list.find(o => o.tx === fx && o.ty === fy);
	const k = n && ORB_KEEPERS[n.ev?.script];
	if (!k) return false;
	if (!Story.getFlag(k.flag)) {
		Story.setFlag(k.flag);
		Bag.addItem(k.orb);
		sfx('item_get');
		const name = Bag.nameOf(k.orb);
		Journal.add(`Received the ${name} at MT. PYRE`);
		dialog.open(`${k.who}: You calmed the sea and the land.\nThe ${name} belongs with one who can\nwalk beside its power.\n\nReceived the ${name}!\n\n(${k.orb === 'redorb' ? 'GROUDON' : 'KYOGRE'} holding it undergoes\nPRIMAL REVERSION in battle.)`);
		return true;
	}
	if (k.orb === 'redorb') return teachDragonAscent();
	return false;
}
// the Draconid tale the old man keeps: a Rayquaza learns DRAGON ASCENT
export function teachDragonAscent() {
	const ray = (S.party || []).find(m => m && m.speciesId === 'rayquaza' && !m.moves.some(mv => mv.id === 'dragonascent'));
	const info = battle.data?.moves?.dragonascent;
	if (!ray || !info) return false;
	const learn = slot => {
		const mv = { id: 'dragonascent', name: info.name, pp: info.pp, maxPp: info.pp };
		if (slot == null) ray.moves.push(mv); else ray.moves[slot] = mv;
		saveParty(S.party);
		sfx('levelup');
		dialog.open(`${ray.name} learned DRAGON ASCENT!\n\nWith it, a KEY STONE can MEGA EVOLVE it.`);
	};
	if (ray.moves.length < 4) {
		dialog.open(`OLD MAN: That RAYQUAZA... let me teach it\nthe move of the sky.`, () => learn(null));
		return true;
	}
	const last = ray.moves[3];
	dialog.open(`OLD MAN: That RAYQUAZA... let me teach it\nthe move of the sky. It must forget\n${String(last.name).toUpperCase()}.\n\nZ = Teach   X = Not now`, d => { if (d !== 'x') learn(3); });
	return true;
}
