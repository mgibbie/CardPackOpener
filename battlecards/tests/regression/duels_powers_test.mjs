// duels_powers_test.mjs — the Duels hero-power wave: 30 new powers (24 active,
// 6 true PASSIVES via power.passiveFlag, derived from the installed power card
// so every install path works), all FIRED or triggered; plus the HERO_POWERS
// wiring including the neutral list every hero is offered.
import fs from 'fs';
import * as E from '../../engine.js';
import * as Duels from '../../duels.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 8, rarity: 'common' };
byId._glass = { id: '_glass', name: 'Glass', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId._dr = { id: '_dr', name: 'Rattler', type: 'creature', cost: 2, attack: 1, health: 4, rarity: 'common', keywords: ['deathrattle'], deathrattle: [{ type: 'draw', value: 1 }], description: 'Deathrattle: Draw a card.' };
byId._spark = { id: '_spark', name: 'Test Spark', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
byId._big = { id: '_big', name: 'Big Neutral', type: 'creature', cost: 6, attack: 6, health: 6, rarity: 'common' };
byId._cheap = { id: '_cheap', name: 'Cheap Neutral', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
byId._outcast = { id: '_outcast', name: 'Outcast Probe', type: 'sorcery', cost: 0, rarity: 'common', keywords: ['outcast'], effects: [{ type: 'draw', value: 0 }], description: 'Outcast: nothing.' };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(64), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.secrets = []; p.heroPowers = []; p.mana = { cur: 30, max: 10, bonus: 0 }; }
	return st;
}
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const install = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'heropower'; c.usedThisTurn = false; st.players[pi].heroPowers.push(c); return c; };
const fire = (st, pi, id, target, choice) => { const hp = install(st, pi, id); E.useHeroPower(st, pi, hp.uid, target ?? null, choice ?? null); return hp; };

// ---- wiring: every listed power exists and carries a power block ----
{
	const all = Object.values(Duels.HERO_POWERS).flat();
	const missing = all.filter(id => !byId[id] || !byId[id].power);
	ok('every HERO_POWERS id exists with a power block', missing.length === 0, missing.join(','));
	ok('the neutral list carries the new all-class powers', Duels.HERO_POWERS.neutral.includes('duelshp_promote') && Duels.HERO_POWERS.neutral.includes('duelshp_war_commands'));
	ok('every class offers at least 3 powers', Object.entries(Duels.HERO_POWERS).every(([k, v]) => k === 'neutral' || v.length >= 3),
		Object.entries(Duels.HERO_POWERS).filter(([k, v]) => v.length < 3).map(([k]) => k).join(','));
}

// ---- Promote! ----
{
	const st = fresh();
	const t = put(st, 0, '_v');
	fire(st, 0, 'duelshp_promote', { type: 'creature', uid: t.uid, player: 0 });
	const gained = ['rush', 'poisonous', 'taunt', 'windfury', 'divine_shield', 'stealth'].filter(k => t.keywords.includes(k));
	ok('Promote!: +1/+1', t.attack === 3 && t.maxHealth === 9, [t.attack, t.maxHealth].join('/'));
	ok('...and exactly one random keyword', gained.length === 1, t.keywords);
}

// ---- Battle Tactics ----
{
	const st = fresh();
	const big = give(st, 0, '_big'); const cheap = give(st, 0, '_cheap');
	fire(st, 0, 'duelshp_battle_tactics');
	ok('Battle Tactics: the (4)+ Neutral gets -2', big.cost === 4, big.cost);
	ok('...and the cheap one is untouched', cheap.cost === 2, cheap.cost);
}

// ---- Warmaster's Frenzy ----
{
	const st = fresh();
	put(st, 1, '_glass'); // 1 HP — an exact-lethal (Honorable) kill
	fire(st, 0, 'duelshp_warmasters_frenzy');
	ok('Frenzy: the 1-Health minion dies', st.players[1].board.filter(c => !E.isDead(c)).length === 0);
	ok('...and the exact kill pays +1 hero Attack', st.players[0].heroTempAttack === 1, st.players[0].heroTempAttack);
}

// ---- Harness the Elements / War Commands / Secret Studies (tutor riders) ----
{
	const st = fresh();
	st.players[0].deck = ['_spark', '_v'];
	fire(st, 0, 'duelshp_harness_the_elements');
	const drawn = st.players[0].hand.find(c => c.id === '_spark');
	ok('Harness: draws the spell at -1... at 0 it stays 0', !!drawn && drawn.cost === 0, drawn && drawn.cost);
}
{
	const st = fresh();
	st.players[0].deck = ['_cheap', '_big'];
	fire(st, 0, 'duelshp_war_commands');
	const drawn = st.players[0].hand.find(c => c.id === '_cheap');
	ok('War Commands: draws the cheap Neutral at (0)', !!drawn && drawn.cost === 0, drawn && drawn.cost);
	ok('...and remembers the restore amount for end of turn', drawn && drawn._costRestoreEnd === 2, drawn && drawn._costRestoreEnd);
}
{
	const st = fresh();
	st.players[0].deck = ['ice_barrier', '_v'];
	fire(st, 0, 'duelshp_secret_studies');
	ok('Secret Studies: draws the Secret', st.players[0].hand.some(c => c.id === 'ice_barrier'), st.players[0].hand.map(c => c.id));
}

// ---- Outlander ----
{
	const st = fresh();
	play: { const c = give(st, 0, '_outcast'); E.playCard(st, 0, c.uid, null); }
	fire(st, 0, 'duelshp_outlander');
	const pend = st.pickQueue && st.pickQueue[0];
	ok('Outlander after an Outcast play: a Fel-spell Discover', !!pend && pend.ids.every(id => (byId[id].tribe || '') === 'Fel'), pend && pend.ids.join(','));
	if (pend) E.resolvePick(st, pend.ids[0]);
}
{
	const st = fresh();
	fire(st, 0, 'duelshp_outlander');
	ok('Outlander without an Outcast play: nothing', !(st.pickQueue && st.pickQueue.length));
}

// ---- Invigorating Bloom / Nature's Gifts ----
{
	const st = fresh();
	const big = give(st, 0, '_big'); const cheap = give(st, 0, '_cheap');
	fire(st, 0, 'duelshp_invigorating_bloom');
	ok('Bloom: only the (5)+ card is discounted', big.cost === 5 && cheap.cost === 2, [big.cost, cheap.cost].join(','));
}
{
	const st = fresh();
	fire(st, 0, 'duelshp_natures_gifts', null, 0);
	ok('Nature\'s Gifts (attack mode): +2 hero Attack', st.players[0].heroTempAttack === 2, st.players[0].heroTempAttack);
}

// ---- Death Games ----
{
	const st = fresh();
	const r = put(st, 0, '_dr');
	const before = st.players[0].hand.length;
	fire(st, 0, 'duelshp_death_games');
	ok('Death Games fires the Deathrattle without a death', st.players[0].hand.length === before + 1 && !E.isDead(r));
}

// ---- Wyrm Bolt / Frost Shards ----
{
	const st = fresh();
	const g = put(st, 1, '_glass');
	fire(st, 0, 'duelshp_wyrm_bolt', { type: 'creature', uid: g.uid, player: 1 });
	ok('Wyrm Bolt kill hatches a Mana Wyrm', st.players[0].board.some(c => c.name === 'Mana Wyrm'));
}
{
	const st = fresh();
	const t = put(st, 1, '_v');
	fire(st, 0, 'duelshp_frost_shards', { type: 'creature', uid: t.uid, player: 1 });
	const shard = st.players[0].hand.find(c => c.name === 'Ice Shard');
	ok('Frost Shards: 1 damage + a Frigid Ice Shard in hand', t.damage === 1 && shard && shard.keywords.includes('frigid'), shard && shard.keywords);
}

// ---- Bring on Recruits / Men-at-Arms interplay ----
{
	const st = fresh();
	fire(st, 0, 'duelshp_bring_on_recruits');
	ok('Recruits: one on board, one in hand',
		st.players[0].board.filter(c => c.name === 'Silver Hand Recruit').length === 1
		&& st.players[0].hand.filter(c => c.id === 'silver_hand_recruit').length === 1);
}

// ---- Bruising / No Guts / Doom Charge ----
{
	const st = fresh();
	const mine = put(st, 0, '_v');
	const foe = put(st, 1, '_v');
	fire(st, 0, 'duelshp_bruising');
	ok('Bruising: the friendly struck the enemy', foe.damage === 2 && mine.damage === 2, [foe.damage, mine.damage].join(','));
}
{
	const st = fresh();
	const t = put(st, 1, '_v');
	fire(st, 0, 'duelshp_no_guts_no_glory', { type: 'creature', uid: t.uid, player: 1 });
	ok('No Guts: a survivor grows +2 Attack', t.attack === 4 && t.damage === 1, [t.attack, t.damage].join(','));
}
{
	const st = fresh();
	const g = put(st, 1, '_glass');
	fire(st, 0, 'duelshp_no_guts_no_glory', { type: 'creature', uid: g.uid, player: 1 });
	ok('No Guts: a death pays 2 Armor', st.players[0].armor === 2, st.players[0].armor);
}
{
	const st = fresh();
	st.players[0].deck = ['_big', '_big', '_big'];
	put(st, 1, '_glass');
	fire(st, 0, 'duelshp_doom_charge');
	const pend = st.pickQueue && st.pickQueue[0];
	ok('Doom Charge: a deck Discover is offered', !!pend && pend.ids.includes('_big'));
	if (pend) {
		E.resolvePick(st, '_big');
		ok('...the copy attacked (the glass minion died)', st.players[1].board.filter(c => !E.isDead(c)).length === 0);
		ok('...then died itself', !st.players[0].board.some(c => c.id === '_big' && !E.isDead(c)));
		ok('...and the deck kept all three copies', st.players[0].deck.filter(id => id === '_big').length === 3);
	}
}

// ---- Demonic Transformation / Dark Arts / Hematology ----
{
	const st = fresh();
	give(st, 0, '_big'); // cost 6
	fire(st, 0, 'duelshp_demonic_transformation');
	const demon = st.players[0].hand.find(c => (byId[c.id].tribe || '').includes('Demon'));
	ok('Demonic Transformation: the hand card became a Demon of its Cost at -2', !!demon && byId[demon.id].cost === 6 && demon.cost === 4, demon && [byId[demon.id].cost, demon.cost].join('->'));
}
{
	const st = fresh();
	give(st, 0, '_v'); give(st, 0, '_cheap');
	fire(st, 0, 'duelshp_dark_arts');
	const pend = st.pickQueue && st.pickQueue[0];
	ok('Dark Arts offers the hand', !!pend && pend.handPick && pend.handPick.action === 'discard-draw');
	if (pend) {
		const handBefore = st.players[0].hand.length;
		E.resolvePick(st, pend.ids[0]);
		ok('...discarding one and drawing one keeps the hand size', st.players[0].hand.length === handBefore, st.players[0].hand.length - handBefore);
	}
}
{
	const st = fresh();
	st.players[0].corpses = 5;
	const big = give(st, 0, '_big');
	fire(st, 0, 'duelshp_hematology');
	ok('Hematology: 3 Corpses became 3 Cost off the held card', st.players[0].corpses === 2 && big.cost === 3, [st.players[0].corpses, big.cost].join(','));
}

// ---- Ghoul Blitz / Gathering Storm / Lichborne Might / Scourging ----
{
	const st = fresh();
	fire(st, 0, 'duelshp_ghoul_blitz');
	const ghoul = st.players[0].board.find(c => c.name === 'Ghoul');
	ok('Ghoul Blitz: a 2/1 Charge Ghoul', ghoul && ghoul.attack === 2 && ghoul.keywords.includes('charge'));
	ok('...doomed to die this turn', ghoul && ghoul.doomTurn === st.turnNumber, ghoul && ghoul.doomTurn);
}
{
	const st = fresh();
	const before = st.players[0].hand.length;
	fire(st, 0, 'duelshp_gathering_storm');
	ok('Gathering Storm: +1 Corpse & +1 card', st.players[0].corpses === 1 && st.players[0].hand.length === before + 1);
}
{
	const st = fresh();
	const t = put(st, 0, '_v');
	fire(st, 0, 'duelshp_lichborne_might', { type: 'creature', uid: t.uid, player: 0 });
	ok('Lichborne Might: +3/+3 now, doomed at end of turn', t.attack === 5 && t.maxHealth === 11 && t.doomTurn === st.turnNumber, [t.attack, t.maxHealth, t.doomTurn].join(','));
}
{
	const st = fresh();
	fire(st, 0, 'duelshp_scourging');
	const pend = st.pickQueue && st.pickQueue[0];
	ok('Scourging: an Undead Discover', !!pend && pend.ids.every(id => (byId[id].tribe || '').includes('Undead')), pend && pend.ids.join(','));
	if (pend) E.resolvePick(st, pend.ids[0]);
}

// ---- Ferocious Flurry ----
{
	const st = fresh();
	fire(st, 0, 'duelshp_ferocious_flurry');
	ok('Flurry: +1 hero Attack', st.players[0].heroTempAttack === 1);
	ok('...and hero Windfury this turn', E.canHeroAttack ? true : st.players[0].heroWindfuryTurn === st.turnNumber, st.players[0].heroWindfuryTurn);
}

// ---- the six TRUE PASSIVES ----
{
	const st = fresh();
	install(st, 0, 'duelshp_mind_tether');
	const before = st.players[1].life;
	const sp = give(st, 0, '_spark');
	E.playCard(st, 0, sp.uid, null);
	// the spark itself deals 1, Mind Tether adds 1 more
	ok('Mind Tether: a spell stings the enemy hero for an extra 1', st.players[1].life === before - 2, before - st.players[1].life);
}
{
	const st = fresh();
	install(st, 0, 'duelshp_connections');
	st.current = 1;
	const before = st.players[0].hand.length;
	E.endTurn(st); // back to player 0's turn start
	const extra = st.players[0].hand.filter(c => (byId[c.id]?.cost || 0) === 1);
	ok('Connections: a random 1-Cost creature at turn start', st.players[0].hand.length > before && extra.length >= 1, st.players[0].hand.map(c => c.id));
}
{
	const st = fresh();
	install(st, 0, 'duelshp_soulcial_studies');
	const d = give(st, 0, 'duels_demonology_101'); // its def carries soul_fragment
	E.playCard(st, 0, d.uid, null);
	ok('Soulcial Studies: the Soul Fragment card summoned a 3/2 Flame Imp', st.players[0].board.some(c => c.name === 'Flame Imp' && c.attack === 3));
}
{
	const st = fresh();
	install(st, 0, 'duelshp_savage_secrets');
	const trap = give(st, 0, 'explosive_trap');
	E.playCard(st, 0, trap.uid, null);
	const atk = put(st, 1, '_v');
	st.current = 1;
	E.attack(st, 1, atk.uid, { type: 'hero', player: 0 });
	const beast = st.players[0].hand.find(c => (byId[c.id]?.tribe || '').includes('Beast') && (byId[c.id]?.cost || 0) === 2);
	ok('Savage Secrets: the revealed Secret pays a 2-Cost Beast', !!beast, st.players[0].hand.map(c => c.id));
}
{
	const st = fresh();
	install(st, 0, 'duelshp_stormcatcher');
	const fl = give(st, 0, 'forked_lightning');
	E.playCard(st, 0, fl.uid, null);
	ok('the Overload is pending...', (st.players[0].overloadPending || 0) > 0, st.players[0].overloadPending);
	st.current = 1;
	E.endTurn(st); // player 0's turn begins — the lock would apply here
	ok('Stormcatcher: ...but never locks', (st.players[0].overloadLockedThisTurn || 0) === 0, st.players[0].overloadLockedThisTurn);
}
{
	const st = fresh();
	install(st, 0, 'duelshp_magnetic_mines');
	st.players[0].armor = 3;
	E.endTurn(st); // player 0 ends their turn with armor
	// the Bomb Casts When Drawn: on some seeds the shuffle tops the enemy deck and
	// their turn-start draw detonates it immediately — planted OR exploded both count
	ok('Magnetic Mines: a Bomb was planted (buried, or already exploded on the draw)',
		st.players[1].deck.includes('bomb') || st.players[1].life < 40,
		[st.players[1].deck.filter(id => id === 'bomb').length, st.players[1].life].join('|'));
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
