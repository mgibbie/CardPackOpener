import assert from 'node:assert/strict';
import { loadMods, modOptionList, modStakes } from '../js/mods/index.js';
import { newRun, get_poker_hand_info } from '../js/engine/run.js';
import { G, P_CENTER_POOLS, P_CENTERS, P_CARDS, Card, create_card, create_playing_card } from '../js/engine/core.js';
import { Tag, add_tag } from '../js/engine/tag.js';
import { Session } from '../js/engine/session.js';
await loadMods(['tagteam']);
const key = 'j_snoresville_tag_team';
assert(modOptionList('tagteam').some((o) => o.key === 'content:' + key && o.default === true));
newRun({ seed: 'TOGGLE', mods: ['tagteam'], modOptions: { tagteam: { ['content:' + key]: false } } });
assert(!P_CENTER_POOLS.Joker.some((c) => c.key === key));
const card = new Card(null, P_CENTERS.j_joker);
card.set_ability(P_CENTERS[key], true);
assert.equal(card.config.center.key, 'j_joker', 'disabled center cannot be introduced by transformation');
let setupCalls = 0;
P_CENTERS[key].set_ability = () => setupCalls++;
const forced = new Card(null, P_CENTERS[key]);
assert.equal(setupCalls, 0, 'constructing disabled content does not run its setup hook');
delete P_CENTERS[key].set_ability;
forced.add_to_deck(); G.jokers.emplace(forced);
assert(!forced.added_to_deck && !G.jokers.cards.includes(forced), 'directly constructed disabled content cannot enter the run');
assert.notEqual(create_card('Joker', G.jokers, null, null, null, false, key).config.center.key, key, 'forced creation uses an enabled alternative');
const session = new Session();
session.start({ seed: 'RESTORE', mods: ['tagteam'], modOptions: { tagteam: { ['content:' + key]: false } } });
Session.fromRecipe(session.recipe);
assert(!P_CENTER_POOLS.Joker.some((c) => c.key === key), 'disabled content remains disabled when resuming a recipe');
newRun({ seed: 'TOGGLE', mods: ['tagteam'] });
assert(P_CENTER_POOLS.Joker.some((c) => c.key === key));
await loadMods(['mikas', 'betmma']);
for (const id of ['mikas', 'betmma']) {
  const entries = modOptionList(id).filter((o) => o.key.startsWith('content:'));
  const types = new Set();
  const disabled = {};
  for (const option of entries) {
    const center = P_CENTERS[option.key.slice(8)];
    if (center && ['Joker', 'Tarot', 'Spectral', 'Voucher'].includes(center.set) && !types.has(center.set)) {
      disabled[option.key] = false; types.add(center.set);
    }
  }
  assert(types.size > 0, `${id} exposes individual content`);
  newRun({ seed: 'TOGGLE', mods: [id], modOptions: { [id]: disabled } });
  for (const option of Object.keys(disabled)) {
    const center = P_CENTERS[option.slice(8)];
    assert(!(P_CENTER_POOLS[center.set] || []).includes(center), `${option} removed from its pool`);
    if (center.set === 'Voucher') {
      const voucher = new Card(null, center);
      voucher.redeem();
      assert(!G.GAME.used_vouchers[center.key], 'a directly redeemed disabled voucher has no effect');
      let applied = false;
      const redeem = center.redeem;
      center.redeem = () => { applied = true; };
      Card.apply_to_run(null, center);
      center.redeem = redeem;
      assert(!applied, 'a directly applied disabled voucher has no effect');
    }
    if (center.consumeable) {
      const consumable = new Card(null, center);
      consumable.use_consumeable();
      assert(!G.GAME.consumeable_usage[center.key], 'a directly used disabled consumable has no effect');
    }
  }
}
await loadMods(['bunco']);
const tag = modOptionList('bunco').find((o) => o.label.startsWith('Tag:'));
assert(tag, 'Bunco exposes individual tags');
newRun({ seed: 'TOGGLE', mods: ['bunco'], modOptions: { bunco: { [tag.key]: false } } });
assert(!P_CENTER_POOLS.Tag.some((c) => c.key === tag.key.slice(8)), 'disabled tag is excluded from its pool');
const previousTally = G.GAME.tag_tally;
add_tag(new Tag(tag.key.slice(8)));
assert(!G.GAME.tags.some((t) => t.key === tag.key.slice(8)), 'disabled tag cannot be directly added');
assert.equal(G.GAME.tag_tally, previousTally, 'constructing a disabled tag does not change the tally');
const suit = modOptionList('bunco').find((o) => o.label.startsWith('Suit:'));
assert(suit, 'Bunco exposes its suits');
newRun({ seed: 'TOGGLE', mods: ['bunco'], modOptions: { bunco: { [suit.key]: false } } });
assert(!Object.values(P_CARDS).some((c) => c.suit === suit.key.slice(8)), 'disabled suit is absent from the deck pool');
const normalCard = G.deck.cards[0];
const originalSuit = normalCard.base.suit;
normalCard.change_suit(suit.key.slice(8));
assert.equal(normalCard.base.suit, originalSuit, 'disabled suit cannot be applied directly');
const part = modOptionList('bunco').find((o) => o.label.startsWith('Hand Part:'));
newRun({ seed: 'TOGGLE', mods: ['bunco'], modOptions: { bunco: { [part.key]: false } } });
assert(get_poker_hand_info(G.deck.cards.slice(0, 5)), 'hands still evaluate with a disabled hand part');
const sticker = modOptionList('bunco').find((o) => o.label.startsWith('Sticker:'));
assert(sticker, 'Bunco exposes its stickers');
newRun({ seed: 'TOGGLE', mods: ['bunco'], modOptions: { bunco: { [sticker.key]: false } } });
const stickerCard = new Card(null, P_CENTERS.j_joker);
stickerCard.ability[sticker.key.slice(8)] = true;
assert(!stickerCard.ability[sticker.key.slice(8)], 'disabled sticker cannot be assigned to a card');
const stickerRun = new Session();
stickerRun.start({ seed: 'STICKER', mods: ['bunco'], modOptions: { bunco: { [sticker.key]: false } } });
assert(stickerRun.act({ type: 'select_blind' }).ok);
if (stickerRun.view().state === 'PAGES') assert(stickerRun.act({ type: 'pick_page', index: 0 }).ok); // (Pages: 25% of Blinds)
assert(stickerRun.act({ type: 'highlight', id: G.hand.cards[0].sort_id }).ok);
assert(stickerRun.act({ type: 'play' }).ok);
const restoredStickerRun = Session.fromRecipe(stickerRun.recipe);
assert.equal(restoredStickerRun.stoppedAt, null, 'a run with a disabled sticker can be replayed');
await loadMods(['morefluff']);
const stake = modStakes(['morefluff'])[0];
assert(stake && modOptionList('morefluff').some((op) => op.key === 'content:' + stake.key));
assert(!modStakes(['morefluff'], { morefluff: { ['content:' + stake.key]: false } }).some((s) => s.key === stake.key), 'disabled stake is absent from selection');
newRun({ seed: 'TOGGLE', mods: ['morefluff'], modOptions: { morefluff: { 'content:m_mf_yucky': false } } });
const playing = create_playing_card({ front: P_CARDS.S_A, center: P_CENTERS.m_mf_yucky }, G.deck);
assert.equal(playing.config.center.key, 'c_base', 'directly created playing cards do not gain disabled enhancements');
assert.equal(new Card(P_CARDS.S_A, P_CENTERS.m_mf_yucky, { playing_card: 1 }).config.center.key, 'c_base', 'direct Card constructors also replace disabled playing-card enhancements');
await loadMods(['pokermon']);
newRun({ seed: 'TOGGLE', mods: ['pokermon'], modOptions: { pokermon: { 'content:j_poke_ivysaur': false } } });
const bulbasaur = new Card(null, P_CENTERS.j_poke_bulbasaur);
const { poke_evolve } = await import('../mods/pokermon/systems/evolution.js');
poke_evolve(bulbasaur, 'j_poke_ivysaur', true);
assert.equal(bulbasaur.config.center.key, 'j_poke_bulbasaur', 'a disabled evolution is not applied');
newRun({ seed: 'TOGGLE', mods: ['pokermon'], modOptions: { pokermon: { 'content:fire_sticker': false } } });
const tera = new Card(null, P_CENTERS.j_poke_bulbasaur);
const { apply_type_sticker } = await import('../mods/pokermon/systems/types.js');
const beforeType = tera.ability.extra.ptype;
apply_type_sticker(tera, 'Fire');
assert(!tera.ability.fire_sticker && tera.ability.extra.ptype === beforeType, 'disabled Tera type does not change the Joker type');
const { POKETYPES } = await import('../mods/pokermon/systems/types.js');
const onlyFire = Object.fromEntries(POKETYPES.filter((t) => t !== 'Fire').map((t) => ['content:' + t.toLowerCase() + '_sticker', false]));
newRun({ seed: 'TOGGLE', mods: ['pokermon'], modOptions: { pokermon: onlyFire } });
const randomTera = new Card(null, P_CENTERS.j_poke_bulbasaur);
assert.equal(apply_type_sticker(randomTera), 'Fire', 'random Tera selection only offers enabled stickers');
console.log('Mod center switch: default on, disabled pool, and subsequent enabled run passed');
