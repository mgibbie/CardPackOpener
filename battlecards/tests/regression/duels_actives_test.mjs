// duels_actives_test.mjs — the Duels active-treasure wave: 38 new treasures
// (+2 tokens) FIRED one by one, the 16 reused Heist/Tombs treasures tagged
// into the shared pool, and the two faithfulness fixes that rode along
// (Canopic Jars' legendary filter, Book of the Dead's cost discount).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 8, rarity: 'common' };
byId._beast = { id: '_beast', name: 'Beastie', type: 'creature', cost: 2, attack: 2, health: 6, rarity: 'common', tribe: 'Beast' };
byId._dr = { id: '_dr', name: 'Rattler', type: 'creature', cost: 2, attack: 1, health: 1, rarity: 'common', keywords: ['deathrattle'], deathrattle: [{ type: 'draw', value: 1 }], description: 'Deathrattle: Draw a card.' };
byId._frost = { id: '_frost', name: 'Test Frost Blast', type: 'sorcery', tribe: 'Frost', cost: 1, rarity: 'common', effects: [{ type: 'damage', value: 20, target: 'enemy-creature' }] };
byId._spark = { id: '_spark', name: 'Test Spark', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
byId._zap = { id: '_zap', name: 'Test Zap', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'damage', value: 2, target: 'enemy-creature' }] };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(42), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.secrets = []; p.mana = { cur: 30, max: 10, bonus: 0 }; }
	return st;
}
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const play = (st, pi, id, target, choice) => { const c = give(st, pi, id); E.playCard(st, pi, c.uid, target ?? null, choice ?? null); return c; };

// ---- pool membership: the tags + the wave all reach the shared pool ----
{
	const pool = raw.cards.filter(c => (c.treasure && c.set === 'DUELS') || c.duelsTreasure);
	ok('the shared active-treasure pool is at least 96 strong', pool.length >= 96, pool.length);
	for (const id of ['ulda_branns_saddle', 'dala_overpowered', 'ulda_book_of_the_dead', 'dala_banana_split'])
		ok(`${id} is tagged into the pool`, !!byId[id].duelsTreasure);
	ok('lorequest sees the tagged cards too (shared predicate)', pool.some(c => c.id === 'ulda_scales_of_justice'));
	ok('tokens stay OUT of the pool', !pool.some(c => c.id === 'duels_might_of_the_horde' || c.id === 'duels_stand_as_one'));
	ok('Book of the Dead now carries its advertised discount', byId.ulda_book_of_the_dead.costLessPerDeathGame === true);
}

// ---- Slate's Syringe ----
{
	const st = fresh();
	const foe = put(st, 1, '_v'); foe.attack = 6; foe.maxHealth = 8;
	const mine = put(st, 0, '_v');
	play(st, 0, 'duels_slates_syringe', { type: 'creature', uid: foe.uid, player: 1 });
	ok('Syringe drains 4/4 from the victim', foe.attack === 2 && foe.maxHealth === 4, [foe.attack, foe.maxHealth].join('/'));
	ok('...and a friendly creature receives them', mine.attack === 6 && mine.maxHealth === 12, [mine.attack, mine.maxHealth].join('/'));
}

// ---- Forge in Light ----
{
	const st = fresh();
	const held = give(st, 0, '_v');
	play(st, 0, 'duels_forge_in_light');
	ok('Forge in Light buffs the held creature +3/+3', held.attack === 5 && held.maxHealth === 11, [held.attack, held.maxHealth].join('/'));
	ok('...and grants Divine Shield', held.keywords.includes('divine_shield'), held.keywords);
}

// ---- Magister Unchained ----
{
	const st = fresh();
	st.players[0].deck = ['_spark', '_v', '_v'];
	play(st, 0, 'duels_magister_unchained');
	play(st, 0, '_spark');
	const drawn = st.players[0].hand.find(c => c.id === '_spark');
	ok('casting a spell under Magister draws a spell', !!drawn, st.players[0].hand.map(c => c.id));
}

// ---- For the Horde! (Start of Game) ----
{
	const deck = ['duels_for_the_horde'];
	for (let i = 0; i < 29; i++) deck.push('_v');
	const st = E.createGame(byId, seededRng(7), deck, 2, [{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	const p = st.players[0];
	const inHand = p.hand.some(c => c.id === 'duels_for_the_horde');
	// the opening deal happens AFTER Start of Game, so a Might can land in hand
	const shuffled = p.deck.filter(id => id === 'duels_might_of_the_horde').length
		+ p.hand.filter(c => c.id === 'duels_might_of_the_horde').length;
	ok('Start of Game draws For the Horde itself', inHand, p.hand.map(c => c.id).join(','));
	ok('...and shuffles 15 Might of the Horde into the deck', shuffled === 15, shuffled);
	ok('Might of the Horde is Tradeable', byId.duels_might_of_the_horde.tradeable === true);
}

// ---- Spymaster's Gambit ----
{
	const st = fresh();
	give(st, 0, '_v'); give(st, 0, '_beast');
	play(st, 0, 'duels_spymasters_gambit');
	const board = st.players[0].board;
	ok('Gambit summons a copy of each held creature', board.length === 2, board.length);
	ok('...with Stealth', board.every(c => c.keywords.includes('stealth')));
	ok('...and the hand keeps the originals', st.players[0].hand.filter(c => c.type === 'creature').length === 2);
}

// ---- Stalker's Supplies ----
{
	const st = fresh();
	const before = st.players[0].deck.length;
	play(st, 0, 'duels_stalkers_supplies');
	const secrets = st.players[0].deck.filter(id => byId[id] && byId[id].type === 'secret' && byId[id].cardClass === 'hunter');
	ok('three Hunter Secrets joined the deck', st.players[0].deck.length === before + 3 && secrets.length === 3, secrets.length);
}

// ---- Rending Ambush ----
{
	const st = fresh();
	const foe = put(st, 1, '_v'); foe.maxHealth = 30;
	give(st, 0, '_v'); give(st, 0, '_beast');
	play(st, 0, 'duels_rending_ambush');
	ok('Ambush summons both edge creatures', st.players[0].board.length === 2, st.players[0].board.length);
	ok('...they left the hand', st.players[0].hand.filter(c => c.type === 'creature').length === 0);
	ok('...and struck the enemy creature', foe.damage === 4, foe.damage);
}

// ---- Devout Blessings ----
{
	const st = fresh();
	const r = put(st, 0, '_dr');
	r.damage = r.maxHealth; E.sweepDeaths(st);
	play(st, 0, 'duels_devout_blessings');
	ok('a fallen Deathrattle friend comes back as a hand copy', st.players[0].hand.some(c => c.id === '_dr'), st.players[0].hand.map(c => c.id));
}

// ---- Valorous Display ----
{
	const st = fresh();
	put(st, 0, '_v'); put(st, 1, '_v');
	play(st, 0, 'duels_valorous_display');
	ok('the board wipe lands immediately', st.players.every(p => p.board.filter(c => !E.isDead(c)).length === 0));
	const pend = st.pickQueue && st.pickQueue[0];
	ok('a weapon Discover is offered', !!pend && pend.ids.every(id => byId[id].type === 'weapon'), pend && pend.ids.map(id => byId[id].type));
	if (pend) {
		E.resolvePick(st, pend.ids[0]);
		ok('the pick is EQUIPPED, not held', st.players[0].weapon && st.players[0].weapon.id === pend.ids[0], st.players[0].weapon && st.players[0].weapon.id);
	}
}

// ---- Pact of the Lich ----
{
	const st = fresh();
	// a deep deck so the seeded post-shuffle draws hit fillers, not the rifts
	// (a drawn Fel Rift casts-when-drawn and would leave the deck again)
	st.players[0].deck = Array(40).fill('_v');
	const before = st.players[0].hand.length;
	play(st, 0, 'duels_pact_of_the_lich');
	const rifts = st.players[0].deck.filter(id => id === 'fel_rift').length;
	ok('five Fel Rifts joined the deck', rifts === 5, rifts);
	ok('...and three cards were drawn', st.players[0].hand.length >= before + 3, st.players[0].hand.length);
}

// ---- Stalking Pride ----
{
	const st = fresh();
	play(st, 0, 'ice_barrier');
	play(st, 0, 'duels_stalking_pride');
	const beasts = st.players[0].board.filter(c => (c.tribe || '').includes('Beast'));
	ok('one Beast base + one per Secret played', beasts.length === 2, beasts.length);
}

// ---- Men at Arms ----
{
	const st = fresh();
	const rec = put(st, 0, 'silver_hand_recruit');
	play(st, 0, 'duels_men_at_arms');
	ok('existing Recruits get +2/+2 at once', rec.attack === 3 && rec.maxHealth === 3, [rec.attack, rec.maxHealth].join('/'));
	const later = E.summon(st, 0, byId.silver_hand_recruit);
	ok('future Recruits arrive buffed', later && later.attack === 3 && later.maxHealth === 3, later && [later.attack, later.maxHealth].join('/'));
}

// ---- Acquired Allies ----
{
	const st = fresh();
	const foe = put(st, 1, '_beast');
	play(st, 0, 'duels_acquired_allies', { type: 'creature', uid: foe.uid, player: 1 });
	ok('the target bounced to its owner\'s hand', st.players[1].hand.some(c => c.id === '_beast') && !st.players[1].board.some(c => c.uid === foe.uid));
	ok('two copies joined YOUR deck', st.players[0].deck.filter(id => id === '_beast').length === 2);
}

// ---- Gift of the Old Gods ----
{
	const st = fresh();
	play(st, 0, 'duels_gift_of_the_old_gods');
	const pend = st.pickQueue && st.pickQueue[0];
	ok('the Discover offers Corrupt cards', !!pend && pend.ids.every(id => !!byId[id].corrupt), pend && pend.ids.join(','));
	if (pend) {
		const pickId = pend.ids[0];
		E.resolvePick(st, pickId);
		const corruptedId = byId[pickId].corrupt;
		ok('the pick arrives already Corrupted', st.players[0].hand.some(c => c.id === corruptedId), st.players[0].hand.map(c => c.id));
		ok('a second Discover queues (count 2)', st.pickQueue.length >= 1);
		while (st.pickQueue.length) E.resolvePick(st, st.pickQueue[0].ids[0]);
	}
}

// ---- Mask of Mimicry ----
{
	const st = fresh();
	const tgt = put(st, 0, '_beast');
	give(st, 0, '_v'); give(st, 0, '_v');
	play(st, 0, 'duels_mask_of_mimicry', { type: 'creature', uid: tgt.uid, player: 0 });
	ok('hand creatures became copies of the target', st.players[0].hand.filter(c => c.id === '_beast').length === 2, st.players[0].hand.map(c => c.id));
}

// ---- Haunted Curio / Sack of Coins / Militia Horn / Angry Mob chains ----
{
	const st = fresh();
	play(st, 0, 'duels_haunted_curio');
	ok('Curio: three 2/2 Ghosts', st.players[0].board.filter(c => c.name === 'Ghost' && c.attack === 2).length === 3);
	ok('Curio: a Cursed Curio waits in the deck', st.players[0].deck.includes('duels_cursed_curio'));
}
{
	const st = fresh();
	play(st, 0, 'duels_sack_of_coins');
	ok('Sack: a 6-Cost creature appears', st.players[0].board.length === 1 && (byId[st.players[0].board[0].id].cost || 0) === 6, st.players[0].board.map(c => c.id));
	ok('Sack: it reshuffles itself', st.players[0].deck.includes('duels_sack_of_coins'));
}
{
	const st = fresh();
	const a = put(st, 0, '_v');
	play(st, 0, 'duels_militia_horn');
	ok('Horn: +2/+2 & Taunt', a.attack === 4 && a.maxHealth === 10 && a.keywords.includes('taunt'), [a.attack, a.maxHealth, a.keywords].join('|'));
	ok('Horn: the Veteran\'s upgrade waits in the deck', st.players[0].deck.includes('duels_veterans_militia_horn'));
}
{
	const st = fresh();
	put(st, 1, '_v'); put(st, 1, '_v'); put(st, 1, '_v');
	play(st, 0, 'duels_angry_mob');
	ok('Mob: two random enemies die', st.players[1].board.filter(c => !E.isDead(c)).length === 1);
	ok('Mob: a Crazed Mob waits in the deck', st.players[0].deck.includes('duels_crazed_mob'));
}
{
	const st = fresh();
	const foe = put(st, 1, '_dr');
	const before = st.players[1].hand.length;
	play(st, 0, 'duels_crazed_mob');
	ok('Crazed Mob: everything enemy dies', st.players[1].board.filter(c => !E.isDead(c)).length === 0);
	ok('...silenced FIRST — the Deathrattle never fires', st.players[1].hand.length === before, st.players[1].hand.length - before);
}

// ---- Chaos Theory ----
{
	const st = fresh();
	give(st, 0, '_spark'); give(st, 1, '_spark');
	const l0 = st.players[0].life, l1 = st.players[1].life;
	play(st, 0, 'duels_chaos_theory');
	ok('both players\' hand spells were cast', st.players.every(p => !p.hand.some(c => c.id === '_spark')));
	ok('...and their damage landed somewhere', st.players[0].life + st.players[1].life < l0 + l1, [st.players[0].life, st.players[1].life].join(','));
}

// ---- Fire Stomp ----
{
	const st = fresh();
	const f1 = put(st, 1, '_v'); const f2 = put(st, 1, '_dr'); // the 1/1 dies
	st.players[0].life = 20;
	play(st, 0, 'duels_fire_stomp');
	ok('Fire Stomp hits every enemy character', f1.damage === 3 && E.isDead(f2) && st.players[1].life === 37, [f1.damage, st.players[1].life].join(','));
	// 3 characters hit (+3) and one died (+1) = 4 Life
	ok('...and heals per hit + kill', st.players[0].life === 24, st.players[0].life);
}

// ---- Apocalypse / Uber Apocalypse ----
{
	const st = fresh();
	put(st, 0, '_v'); put(st, 1, '_v');
	play(st, 0, 'duels_apocalypse');
	ok('Apocalypse wipes the boards', st.players.every(p => p.board.filter(c => !E.isDead(c)).length === 0));
	const before = st.players[1].life;
	E.damageHero(st, 1, 3, 0);
	ok('the enemy hero now takes DOUBLE damage', st.players[1].life === before - 6, before - st.players[1].life);
	const mine = st.players[0].life;
	E.damageHero(st, 0, 3, 1);
	ok('...but yours does not', st.players[0].life === mine - 3, mine - st.players[0].life);
}
{
	const st = fresh();
	play(st, 0, 'duels_uber_apocalypse');
	const c = put(st, 1, '_v');
	play(st, 0, '_zap', { type: 'creature', uid: c.uid, player: 1 });
	ok('Uber: enemy MINIONS take double damage too (2 -> 4)', c.damage === 4, c.damage);
}

// ---- Soulstone Trap ----
{
	const st = fresh();
	const foe = put(st, 1, '_v'); foe.attack = 5; foe.maxHealth = 7;
	play(st, 0, 'duels_soulstone_trap', { type: 'creature', uid: foe.uid, player: 1 });
	ok('the victim dies', !st.players[1].board.some(c => c.uid === foe.uid && !E.isDead(c)));
	ok('your hero gains its Attack', st.players[0].heroTempAttack === 5, st.players[0].heroTempAttack);
	ok('...and its Health as Armor', st.players[0].armor === 7, st.players[0].armor);
}

// ---- Black Soulstone ----
{
	const st = fresh();
	play(st, 0, 'duels_black_soulstone');
	const gained = st.players[0].hand.find(c => ['duels_fire_stomp', 'duels_apocalypse', 'duels_soulstone_trap', 'duels_uber_apocalypse'].includes(c.id));
	ok('a Diablo treasure lands in hand', !!gained, st.players[0].hand.map(c => c.id));
	ok('the Soulstone reshuffles itself', st.players[0].deck.includes('duels_black_soulstone'));
}

// ---- The Stone of Jordan ----
{
	const st = fresh();
	const before = st.players[0].hand.length;
	play(st, 0, 'duels_stone_of_jordan');
	ok('the Stone grants +2 hero Attack', st.players[0].heroTempAttack === 2, st.players[0].heroTempAttack);
	ok('...and draws two', st.players[0].hand.length === before + 2);
}

// ---- Fractured Spirits ----
{
	const st = fresh();
	const tgt = put(st, 0, '_dr');
	play(st, 0, 'duels_fractured_spirits', { type: 'creature', uid: tgt.uid, player: 0 });
	const copies = st.players[0].board.filter(c => c.id === '_dr');
	ok('two copies of the chosen creature appear (3 on board)', copies.length === 3, copies.length);
	ok('...and the ORIGINAL is silenced', !(tgt.keywords || []).includes('deathrattle'), tgt.keywords);
}

// ---- Ace in the Hole ----
{
	const st = fresh();
	st.players[0].cardsPlayedLastTurnIds = ['_v', '_spark'];
	play(st, 0, 'duels_ace_in_the_hole');
	const h = st.players[0].hand.map(c => c.id);
	ok('last turn\'s plays return as hand copies', h.includes('_v') && h.includes('_spark'), h.join(','));
}

// ---- Demonology 101 ----
{
	const st = fresh();
	put(st, 0, '_v'); put(st, 1, '_v'); put(st, 1, '_beast');
	play(st, 0, 'duels_demonology_101');
	ok('everything dies', st.players.every(p => p.board.filter(c => !E.isDead(c)).length === 0));
	ok('a Soul Fragment per ENEMY minion (2)', st.players[0].deck.filter(id => id === 'sch_soul_fragment').length === 2);
}

// ---- Binding Chains ----
{
	const st = fresh();
	put(st, 1, '_v'); put(st, 1, '_v'); put(st, 1, '_beast'); put(st, 1, '_dr');
	play(st, 0, 'duels_binding_chains');
	ok('exactly three enemies go Dormant', st.players[1].board.filter(c => c.dormantLeft > 0).length === 3);
}

// ---- Vision of the Warden / Warden's Insight ----
{
	const st = fresh();
	st.players[0].mana.max = 5;
	play(st, 0, 'duels_vision_of_the_warden');
	ok('a Treant per Mana Crystal (5)', st.players[0].board.filter(c => c.id === 'dmf_treant').length === 5, st.players[0].board.length);
}
{
	const st = fresh();
	st.players[0].mana.max = 8; st.players[0].mana.cur = 6;
	play(st, 0, 'duels_wardens_insight', null, [0]);
	ok('Choose One: refresh restores full Mana after the cast', st.players[0].mana.cur === 8, st.players[0].mana.cur);
}

// ---- Remembrance of Ice ----
{
	const st = fresh();
	const foe = put(st, 1, '_beast'); foe.maxHealth = 3;
	play(st, 0, '_frost', { type: 'creature', uid: foe.uid, player: 1 });
	ok('the Frost kill is remembered', (st.players[0].frostKillIds || []).includes('_beast'), st.players[0].frostKillIds);
	play(st, 0, 'duels_remembrance_of_ice');
	ok('the victim is resurrected on YOUR side', st.players[0].board.some(c => c.id === '_beast'));
}

// ---- Unholy Embrace ----
{
	const st = fresh();
	st.players[0].corpses = 4;
	const before = st.players[0].hand.length;
	play(st, 0, 'duels_unholy_embrace');
	ok('four Corpses became four DK cards', st.players[0].hand.length === before + 4 && st.players[0].corpses === 0, [st.players[0].hand.length - before, st.players[0].corpses].join(','));
	ok('...all Death Knight class', st.players[0].hand.slice(before).every(c => byId[c.id].cardClass === 'death_knight'));
}

// ---- Contagion Concoction ----
{
	const st = fresh();
	const a = put(st, 1, '_v'); const b = put(st, 1, '_beast');
	play(st, 0, 'duels_contagion_concoction', { type: 'creature', uid: a.uid, player: 1 });
	ok('the infection lands as a Deathrattle', (a.deathrattle || []).some(d => d.type === 'contagion-spread'));
	const hp1 = st.players[1].life;
	a.damage = a.maxHealth; E.sweepDeaths(st);
	ok('dying deals 3 to the OWNER\'s hero', st.players[1].life === hp1 - 3, hp1 - st.players[1].life);
	ok('...and infects a creature on that side', (b.deathrattle || []).some(d => d.type === 'contagion-spread'));
}

// ---- Smarty Pants ----
{
	const st = fresh();
	const tgt = put(st, 0, '_v');
	play(st, 0, 'duels_smarty_pants', { type: 'creature', uid: tgt.uid, player: 0 });
	ok('Smarty Pants buffs +1/+1', tgt.attack === 3 && tgt.maxHealth === 9);
	tgt.damage = tgt.maxHealth; E.sweepDeaths(st);
	ok('...and its death hands you an Explorer\'s Hat', st.players[0].hand.some(c => c.id === 'explorers_hat'), st.players[0].hand.map(c => c.id));
}

// ---- Elemental Chaos ----
{
	const st = fresh();
	const foe = put(st, 1, '_v');
	st.players[0].life = 20;
	play(st, 0, 'duels_elemental_chaos');
	ok('Earth: two 2/3 Taunt Elementals', st.players[0].board.filter(c => c.name === 'Elemental' && c.keywords.includes('taunt')).length === 2);
	ok('Fire: 6 to the enemy hero', st.players[1].life === 34, st.players[1].life);
	ok('Lightning: 2 to enemy creatures', foe.damage === 2, foe.damage);
	ok('Water: your side is healed', st.players[0].life > 20, st.players[0].life);
}

// ---- Yogg-tastic Tasties ----
{
	const st = fresh();
	st.players[0].spellsPlayedTotal = 3;
	let threw = null;
	try { play(st, 0, 'duels_yogg_tastic_tasties'); } catch (e) { threw = e.message; }
	ok('the Tasties spin without throwing', threw === null, threw);
}

// ---- Canopic Jars fix: the summoned Deathrattle creature really is Legendary ----
{
	const st = fresh();
	const a = put(st, 0, '_v');
	play(st, 0, 'ulda_canopic_jars');
	a.damage = a.maxHealth; E.sweepDeaths(st);
	const summoned = st.players[0].board.find(c => !E.isDead(c));
	ok('the Jars deathrattle summons a LEGENDARY (the filter was silently missing)', summoned && byId[summoned.id] && byId[summoned.id].rarity === 'legendary', summoned && byId[summoned.id]?.rarity);
}

// ---- Book of the Dead fix: the discount is real now ----
{
	const st = fresh();
	const book = give(st, 0, 'ulda_book_of_the_dead');
	const full = E.effectiveCost(st, 0, book);
	st.minionsDiedGame = 6;
	const cut = E.effectiveCost(st, 0, book);
	ok('Book of the Dead costs (1) less per death this game', full - cut === 6, `${full} -> ${cut}`);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
