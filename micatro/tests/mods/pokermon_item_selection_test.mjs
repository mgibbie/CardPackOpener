// Playing-card Items accept one through their maximum number of selections.
import { T, start, hand, add, act, G } from './poke_helpers.mjs';
import '../../mods/nacho/index.js';
import '../../mods/pokermonplus/index.js';
import { RULES } from '../../js/mods/pins.js';
const { ok, done } = T();
const use = (c, cards) => act({ type: 'use', id: c.sort_id, targets: cards.map(x => x.sort_id) });
const keys = ['S_2', 'H_3', 'C_4', 'D_5', 'S_6'];
for (const n of [0, 1, 2, 3, 4, 5]) {
  start('FIRE' + n); const cs = hand(keys); const item = add('c_poke_firestone');
  const before = G.playing_cards.length, result = use(item, cs.slice(0, n)); G.E_MANAGER.flush();
  ok(result.ok === (n >= 1 && n <= 4), `Fire Stone accepts ${n} selected only in range`);
  if (result.ok) ok(G.playing_cards.length === before - 1 && cs.slice(0, n).filter(c => G.playing_cards.includes(c)).every(c => c.config.center.key === 'm_mult'), `Fire Stone converts selected cards and destroys one (${n})`);
}
for (const name of ['sunstone', 'upgrade', 'icestone', 'linkcable', 'heartscale']) for (const n of [0, 1, 2, 3]) {
  start(name + n); const cs = hand(keys.slice(0, 3)); const result = use(add('c_poke_' + name), cs.slice(0, n)); G.E_MANAGER.flush();
  ok(result.ok === (n >= 1 && n <= 2), `${name} accepts ${n} selected only in range`);
}
for (const name of ['tartapple', 'sweetapple']) for (const n of [0, 1, 2, 3]) {
  start(name + n, {}, { mods: ['nacho', 'pokermonplus'] }); const cs = hand(keys.slice(0, 3)); const result = use(add('c_nacho_' + name), cs.slice(0, n)); G.E_MANAGER.flush();
  ok(result.ok === (n >= 1 && n <= 2), `${name} accepts ${n} selected only in range`);
}
start('LINKONE'); { const [c] = hand(['S_5']); const r = use(add('c_poke_linkcable'), [c]); G.E_MANAGER.flush(); ok(r.ok && c.base.value === '6', 'one-card Linking Cord increases its rank'); }
start('HEARTONE'); { const [c] = hand(['S_5']); const r = use(add('c_poke_heartscale'), [c]); G.E_MANAGER.flush(); ok(r.ok && c.base.suit === 'Hearts', 'one-card Heart Scale makes it Hearts'); }
for (const name of ['tartapple', 'sweetapple']) {
  start(name + 'ONE', {}, { mods: ['nacho'] }); const [c] = hand(['S_5']); const money = G.GAME.dollars;
  const r = use(add('c_nacho_' + name), [c]); G.E_MANAGER.flush();
  ok(r.ok && G.playing_cards.includes(c) && (name === 'tartapple' ? c.ability.perma_mult === 1 : G.GAME.dollars === money + 2), `${name}: one card receives benefit without destruction`);
}
for (const name of ['tartapple', 'sweetapple']) {
  start(name + 'TWO', {}, { mods: ['nacho'] }); const [left, right] = hand(['S_5', 'H_6'], { center: 'm_wild' }); const money = G.GAME.dollars;
  const r = use(add('c_nacho_' + name), [left, right]); G.E_MANAGER.flush();
  ok(r.ok && G.playing_cards.includes(left) && !G.playing_cards.includes(right) && (name === 'tartapple' ? left.ability.perma_mult === 2 : G.GAME.dollars === money + 4), `${name}: two cards keep left benefit and right destruction`);
}
start('OLDFIRE'); { const cs = hand(keys.slice(0, 3)); const item = add('c_poke_firestone'); RULES.pins = { pokermon: '3.9.1+r106' }; try { ok(!use(item, cs).ok, 'old r106 replay keeps exact-four rule'); } finally { RULES.pins = null; } }
for (const itemKey of ['c_poke_linkcable', 'c_poke_heartscale', 'c_nacho_tartapple', 'c_nacho_sweetapple']) {
  start('OLD' + itemKey, {}, { mods: ['nacho'] }); const cs = hand(['S_5']); const item = add(itemKey);
  RULES.pins = { pokermon: '3.9.1+r106' };
  try { ok(!use(item, cs).ok, `r106 replays keep two-card requirement for ${itemKey}`); } finally { RULES.pins = null; }
}
done();
