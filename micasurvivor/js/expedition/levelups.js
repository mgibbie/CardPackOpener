'use strict';
/* ============ expedition/levelups.js — rarity-rolled level-ups, Refresh / Skip / Banish, the XP curve (MicaSurvivor DLC D5) ============
 * Lazy-loaded with the rest of js/expedition/ (G.Expedition.load()); a base page never runs it, and every entry point acts
 * only in an Expedition run, on its own player (on(pl)), or on an Expedition snapshot's `x` block.
 * Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.1 (the XP curve), 2.5 (offers, rarity, reroll / skip / banish) and the D5 row.
 *
 *   the cards     an Expedition level-up deals K.CARDS (3) cards of its own (the levelup.offer seam, after the League's
 *                 branch choice): a MOVE LEVEL (each owned move below Lv 8: G.ExpMoves), a NEW MOVE (the moves the
 *                 line learns, by its types, and the kits of other League members of your type; they took one of
 *                 K.EXTRA_SLOTS slots past the kit's 4 until D16), a SWAP (DLC D16, owner 2026-10-26: "1 item slot and 4
 *                 move slots"; decision #6: with the 4 slots full, a rare card swaps one of those moves in for your
 *                 lowest-level one, so the Expedition's own moves stay reachable), a NEW VITAMIN (3 slots) or a
 *                 VITAMIN LEVEL (to 10: G.ExpItems). A move card is always pulled to the front. When nothing is left,
 *                 TRAINING: a small permanent bonus with diminishing returns (never under a third of the first).
 *   rarity        every card rolls its own: Common / Uncommon / Rare / Epic / Legendary, x1 / 1.2 / 1.45 / 1.75 / 2.1 on its
 *                 values. Base weights 70 / 24 / 5 / 0.9 / 0.12; luck a = luck / 100 lifts Uncommon x(1 + 0.5a), Rare
 *                 x(1 + a)^2, Epic x(1 + a)^3, Legendary x(1 + a)^4; Rare / Epic / Legendary are GATED by power =
 *                 level + luck / 8 + 12 (zone - 1): they ramp in over power 3 -> 10, 8 -> 18 and 14 -> 26 (study 2.5).
 *   the tools     Refresh 2 (the base reroll button, its count raised), Skip 2 (a new button: no card, +10 x zone
 *                 Pokémonedas of the run), Banish 1 (the base ban button: it also takes a new vitamin; the banished move
 *                 or vitamin never comes back this run). The base game's bought rerolls / bans add on top (max 6 each).
 *   the XP curve  8 + 5.5 L + L^1.8 (study 2.1) x K.XP_K (the xp.need seam): the scale is ours, measured so that a normal
 *                 Classic run reaches the Lv 50 / 55 evolutions (README "DLC D5": the probe's numbers).
 *
 *   held item   DLC D17 (owner 2026-10-26: "keep the backpack/more items in expedition and just have 1 slot for an equipped held
 *                 item in both modes"): the stacking items above stay exactly as they are; on top, ONE equipped base held item
 *                 (js/data/items.js, base's slot and replace screen: pl.item). Its source: every boss (a zone's guardian, the
 *                 shrine's, Survival's milestones) also drops one, seeded, from the base held items no stacking item duplicates
 *                 (K.HELD_POOL: Focus Sash, Never-Melt Ice, Big Orb, Type Gem, Safety Goggles, Light Ball, Thick Club; where
 *                 both exist, e.g. Leftovers, the Choice Band or Silver Powder, the stacking one stays the Expedition's).
 * Determinism: every card (which cards, their rarity, a move level's rolls) comes from a G.DLC.rng stream seeded by the
 * run's world seed, the player's co-op slot and the run's draw count, and every item drop from its own stream (roll), so
 * the same run deals the same cards and drops the same items; nothing here calls Math.random. Viewers are told: the `x`
 * block v5 carries `u` (row()): the vitamins, items, move levels and tools of each player (js/expedition/core.js).
 */
G.ExpEN = Object.assign(G.ExpEN || {}, {
  'Nuevo movimiento': 'New move', 'Movimiento de la línea': 'Line move', 'Movimiento de la Liga: {x}': 'League move: {x}',
  'Vitamina': 'Vitamin', 'Nueva vitamina': 'New vitamin', 'Vitamina Nv. {x} → {x}': 'Vitamin Lv {x} → {x}', 'Nv. {x} → {x}': 'Lv {x} → {x}',
  'Entrenamiento': 'Training', 'Descanso': 'Rest', 'Recupera el 40 % de tu vida.': 'Heals 40% of your HP.',
  '+{x} % de daño por nivel': '+{x}% damage a level', 'Hueco {x}/{x}': 'Slot {x}/{x}', 'Nv. {x}/{x}': 'Lv {x}/{x}',
  'Saltar ({x})': 'Skip ({x})', 'Saltas las cartas: +{x} Pokémonedas': 'Skipped: +{x} Pokémonedas', 'Saltas las cartas: +{x} ₽': 'Skipped: +{x} ₽',
  'Vitaminas': 'Vitamins', 'Objetos': 'Items', 'Movimientos': 'Moves', 'Suerte {x}': 'Luck {x}',
  'Cambiar {x} · Saltar {x} · Vetar {x}': 'Refresh {x} · Skip {x} · Banish {x}', 'Ninguno todavía': 'None yet',
  'Expedición · tu equipo': 'Expedition · your kit', 'Objetos: {x} · Vitaminas: {x}': 'Items: {x} · Vitamins: {x}', '¡{x}!': '{x}!', 'Escudo': 'Shield',
  'Cambia {x}': 'Replaces {x}', 'Olvida {x} (Nv. {x}).': 'Forgets {x} (Lv {x}).'
});
G.I18n.add(G.ExpEN);

G.ExpLevel = (() => {
  const T = G.I18n;
  // a text with {x} holes: the exact English (the I18n patterns can match an older, shorter one first), else I18n.f
  const F = (es, ...v) => { const en = T.lang === 'en' && G.ExpEN[es]; let i = 0; return en ? en.replace(/\{x\}/g, () => v[i++]) : T.f(es, ...v); };
  const M = () => G.ExpMoves, I = () => G.ExpItems, LG = () => G.ExpLeague;
  // ---------------- balance (tune here; README "DLC D5") ----------------
  const K = {
    CARDS: 3,                                  // cards per level (study 2.5; + the Lab's "fourth option": D10, G.ExpMeta.labNow)
    EXTRA_SLOTS: 0,                            // move slots past the kit's 4 (D5-D15: 2; DLC D16, owner: 4 move slots in both modes)
    MAX_MOVES: 4,                              // DLC D16: the move slots (every one fires on its own cooldown)
    // card weights (a League member's move: x0.6 of a line move). swap: DLC D16, the WHOLE weight of the swap cards (each
    // candidate gets swap / n, so they stay rare however many moves the line can learn)
    W: { up: 14, newMove: 6, newVit: 6, vitUp: 8, league: 0.6, swap: 3 },
    RAR_W: [70, 24, 5, 0.9, 0.12],             // the rarity weights (study 2.5)
    GATE: [null, null, [3, 10], [8, 18], [14, 26]],   // Rare / Epic / Legendary ramp in over these powers
    ZONE_POWER: 12,                            // power = level + luck / 8 + 12 x (zone - 1)
    REFRESH: 2, SKIP: 2, BANISH: 1, TOOL_MAX: 6,   // the run's tools (study 2.5: 2 / 2 / 1, +1 each a Lab level, max 6)
    SKIP_COINS: 10,                            // a Skip pays 10 x zone ₽ (D7: the run's in-play currency, G.ExpEco.earn)
    TRAIN_DMG: 0.04, TRAIN_HP: 10, TRAIN_DECAY: 0.15, TRAIN_MIN: 1 / 3,   // Training: +4 % damage / +10 HP, then x 1 / (1 + 0.15 n), never under 1/3
    // DLC D17: the base held items a boss drops (none that a stacking Expedition item duplicates; no Rare Candy, an instant; no
    // Pure Incense, the base spawner's)
    HELD_POOL: ['focussash', 'eternalice', 'bigorb', 'typegem', 'safetygoggles', 'lightball', 'thickclub'],   // (Silver Powder: the stacking bug booster)
    XP_A: 8, XP_B: 5.5, XP_P: 1.8, XP_K: 2.0   // XP to the next level = 2 x (8 + 5.5 L + L^1.8) (study 2.1; the x2 is ours: Lv 55 at 69k XP, README "DLC D5")
  };

  // ---------------- seeded streams ----------------
  function mix(...vals) {
    let h = 0x2545F491 | 0;
    for (const v of vals) { h ^= v | 0; h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B); h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35); h ^= h >>> 16; }
    return h >>> 0;
  }
  const strHash = s => { let h = 0; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
  const slot = () => (G.Coop && G.Coop.active && G.Net && G.Net.uid ? strHash(String(G.Net.uid)) : 0);

  // ---------------- rarity (pure) ----------------
  const ramp = (p, a, b) => Math.max(0, Math.min(1, (p - a) / (b - a)));
  const power = ({ level = 1, luck = 0, zone = 1 }) => level + luck / 8 + K.ZONE_POWER * (Math.max(1, zone) - 1);
  /** The 5 rarity weights for {level, luck, zone} (study 2.5: luck lifts the higher tiers, power gates them). */
  function weights(o) {
    const a = (o.luck || 0) / 100, p = power(o), w = K.RAR_W.slice();
    w[1] *= 1 + 0.5 * a; w[2] *= Math.pow(1 + a, 2); w[3] *= Math.pow(1 + a, 3); w[4] *= Math.pow(1 + a, 4);
    for (let i = 2; i < 5; i++) w[i] *= ramp(p, K.GATE[i][0], K.GATE[i][1]);
    return w;
  }
  /** The 5 odds (they sum to 1). */
  const odds = o => { const w = weights(o), s = w.reduce((x, y) => x + y, 0); return w.map(x => x / s); };
  /** One rarity tier 0..4 from rng. */
  function rollRarity(rng, o) {
    const w = weights(o), s = w.reduce((x, y) => x + y, 0);
    let r = rng() * s;
    for (let i = 0; i < 5; i++) { r -= w[i]; if (r < 0) return i; }
    return 0;
  }
  const zone = () => { const r = G.ExpClassic && G.ExpClassic.run; return r ? Math.min(4, r.zone || 1) : (G.World.zone && G.World.zone.zone) || 1; };

  // ---------------- the run ----------------
  let S = null;   // {draw, items, skips, log: [[level, kind, key, tier]]}
  const on = pl => !!(S && G.Modes.isExp() && pl && pl === G.Game.player && !pl.remote);
  const need = L => Math.round(K.XP_K * (K.XP_A + K.XP_B * L + Math.pow(L, K.XP_P)));
  /** The xp.need seam: an Expedition run's curve (a base run: the base one). */
  const xpNeed = (v, L) => (G.Modes.isExp() ? need(L) : v);

  /** An Expedition run starts (after the League's begin): the curve, the tools, the stats' bookkeeping. */
  function begin(pl) {
    S = null;
    if (!pl || !G.Modes.isExp()) return null;
    const lab = id => (G.ExpMeta ? G.ExpMeta.labNow(id) : 0);   // (D10: the Lab, +1 each a level, max 6; D16: the move slot is retired)
    S = { draw: 0, items: 0, held: 0, skips: Math.min(K.TOOL_MAX, K.SKIP + lab('skip')), log: [], extra: [] };
    I().ensure(pl);
    pl.xpNext = need(pl.level);
    pl.maxMoves = K.MAX_MOVES + K.EXTRA_SLOTS;   // (DLC D16: 4, every one firing; the Lab's +1 move slot is retired and refunded)
    pl.afDmg = G.Combat.AF.DMG_EXP;              // (DLC D16: the Expedition's all-fire damage factor)
    pl.rerollBonus = Math.min(K.TOOL_MAX - 1, (pl.rerollBonus || 0) + K.REFRESH - 1 + lab('refresh'));
    pl.bansLeft = Math.min(K.TOOL_MAX, (pl.bansLeft || 0) + K.BANISH + lab('banish'));
    I().apply(pl);
    I().reset();
    M().clear();
    mountUI();
    return S;
  }
  function reset() { S = null; if (M()) M().clear(); if (I()) I().reset(); syncUI(true); const b = typeof document !== 'undefined' && document.getElementById('lvl-skip'); if (b) b.classList.add('hidden'); }

  // ---------------- the cards ----------------
  const name = id => { const d = M().MOVES[id] || G.Moves.BY_ID[id]; return d ? T.t(d.name) : id; };
  const typeOf = id => (M().MOVES[id] || G.Moves.BY_ID[id] || {}).type || 'normal';
  const kindOf = id => (M().MOVES[id] || G.Moves.BY_ID[id] || {}).kind;
  const iconOf = id => (G.Moves.BY_ID[id] ? 'move:' + id : 'type:' + typeOf(id));
  const banned = (pl, k) => !!(pl.banned && pl.banned.has(k));
  const kitIds = () => { const r = LG() && LG().run; return r ? LG().BY[r.member].kit : []; };
  /** The moves this player could learn now: the line's (its types: our moves and the Expedition's) and the League's. */
  function moveCands(pl) {
    const out = [], seen = new Set(), kit = kitIds(), types = (pl.mon && pl.mon.types) || ['normal'];
    const buffs = pl.moves.filter(m => m.kind === 'buff' || m.kind === 'weather').length;
    const ok = id => !seen.has(id) && !pl.hasMove(id) && !kit.includes(id) && !banned(pl, id)
      && !((kindOf(id) === 'buff' || kindOf(id) === 'weather') && buffs >= 1);
    for (const id of Object.keys(M().MOVES).concat(...types.map(t => G.Moves.POOL[t] || []))) {
      if (!ok(id) || !types.includes(typeOf(id))) continue;
      seen.add(id); out.push({ id, from: 0 });
    }
    const L = LG(), r = L && L.run;
    if (r) for (const d of L.roster()) {
      if (d === r.member) continue;
      const tp = G.DEX_BY[d] ? G.DEX_BY[d].types : [];
      if (!tp.some(t => types.includes(t))) continue;
      for (const id of L.BY[d].kit) if (ok(id)) { seen.add(id); out.push({ id, from: d }); }
    }
    return out;
  }
  /** Every candidate card: {key, w, kind, make(ti, rng) -> card}. */
  function candidates(pl) {
    const out = [], Mv = M(), Iv = I();
    for (const m of pl.moves) {
      if (Mv.levelOf(m) >= Mv.K.MAX_LV) continue;
      out.push({ key: 'up:' + m.id, w: K.W.up, kind: 'move', make: (ti, rng) => upCard(pl, m, ti, rng) });
    }
    const extras = S.extra.length;
    if (extras < K.EXTRA_SLOTS && pl.slots.length < pl.maxMoves) {
      for (const c of moveCands(pl)) out.push({ key: 'new:' + c.id, w: K.W.newMove * (c.from ? K.W.league : 1), kind: 'move', make: (ti, rng) => newCard(pl, c, ti, rng) });
    }
    // DLC D16 (decision #6): the 4 slots full, a rare swap (its whole weight K.W.swap, shared by the candidates)
    const out0 = swapOut(pl);
    if (out0 && pl.slots.length >= pl.maxMoves) {
      const cs = moveCands(pl), wsum = cs.reduce((a, c) => a + (c.from ? K.W.league : 1), 0);
      for (const c of cs) out.push({ key: 'swap:' + c.id, w: K.W.swap * (c.from ? K.W.league : 1) / wsum, kind: 'move', make: (ti, rng) => swapCard(pl, c, out0, ti, rng) });
    }
    if (pl.xv.length < Iv.slots(pl)) {
      for (const v of Iv.VITAMINS) if (!Iv.vitOf(pl, v.id) && !banned(pl, 'v:' + v.id)) out.push({ key: 'vit:' + v.id, w: K.W.newVit, kind: 'vit', make: ti => vitCard(pl, v.id, ti) });
    }
    for (const x of pl.xv) if (x.lvl < Iv.K.VIT_MAX) out.push({ key: 'vit:' + x.id, w: K.W.vitUp, kind: 'vit', make: ti => vitCard(pl, x.id, ti) });
    return out;
  }
  const RAR_TAG = ti => T.t(I().RAR_NAME[ti]);
  function dress(c, ti) { c.rar = ti + 1; c.rarName = RAR_TAG(ti); c.tier = ti; return c; }
  function upCard(pl, m, ti, rng) {
    const Mv = M(), mul = I().RAR_MUL[ti], rolls = Mv.drawRolls(m, ti, mul, rng), lv = Mv.levelOf(m);
    const txt = [F('+{x} % de daño', Math.round(Mv.K.LV_DMG * 100))].concat(rolls.map(Mv.rollText)).join(' · ');
    return dress({
      w: 0, type: 'up', key: 'up:' + m.id, mid: m.id, rolls, icon: iconOf(m.id), color: G.U.TYPE_COLOR[m.type],
      tag: F('Nv. {x} → {x}', lv, lv + 1), title: name(m.id), desc: txt,
      apply: p => { Mv.levelUp(p, m, rolls); logPick(p, 'up', m.id, ti); }
    }, ti);
  }
  function newCard(pl, c, ti, rng) {
    const Mv = M(), d = Mv.MOVES[c.id] || G.Moves.BY_ID[c.id], tmp = Mv.instance(c.id);
    const rolls = ti > 0 ? Mv.drawRolls(tmp, ti, I().RAR_MUL[ti], rng) : [];
    const from = c.from ? F('Movimiento de la Liga: {x}', G.DEX_BY[c.from] ? T.t(G.DEX_BY[c.from].name) : '#' + c.from) : T.t('Movimiento de la línea');
    const desc = T.t(d.desc) + (d.xexp ? ' <span class="cc-chance">' + T.t(G.U.TYPE_NAME[d.type]) + ' · ' + Mv.kindName(d) + '</span>' : '')
      + (rolls.length ? ' · ' + rolls.map(Mv.rollText).join(' · ') : '') + ' <span class="xsrc">' + from + '</span>';
    return dress({
      w: 0, type: 'new', key: 'new:' + c.id, xban: c.id, icon: iconOf(c.id), color: G.U.TYPE_COLOR[d.type], tag: T.t(G.U.TYPE_NAME[d.type]),
      title: name(c.id), desc,
      apply: p => {
        const m = Mv.learn(p, c.id);
        if (!m) return;
        if (S) S.extra.push(c.id);
        if (G.ExpLeague && G.ExpLeague.run && G.ExpLeague.run.st) { const k = G.ExpLeague.factorOf(c.id, G.ExpLeague.run.st); if (m.dmg != null && !m.xk) { m.dmg *= k; m.xk = k; } }
        Mv.base(m);
        if (rolls.length) Mv.addRolls(p, m, rolls); else Mv.refresh(p, m);
        logPick(p, 'new', c.id, ti);
      }
    }, ti);
  }
  /** DLC D16: the move a swap card replaces: your lowest-level one (on a tie, the last slot's). -> the instance or null */
  function swapOut(pl) {
    let best = null;
    pl.slots.forEach(g => { for (const m of g) if (!best || M().levelOf(m) <= M().levelOf(best)) best = m; });
    return best;
  }
  /** DLC D16: a swap card: move c.id takes `old`'s slot (old is forgotten; its level-ups too). */
  function swapCard(pl, c, old, ti, rng) {
    const card = newCard(pl, c, ti, rng), learnNew = card.apply;
    card.type = 'swap'; card.key = 'swap:' + c.id; card.swapOut = old.id;
    card.tag = F('Cambia {x}', name(old.id));
    card.desc = F('Olvida {x} (Nv. {x}).', name(old.id), M().levelOf(old)) + ' ' + card.desc;
    card.apply = p => {
      const m0 = p.moves.find(m => m.id === old.id), si = p.slotOf(old.id);
      if (!m0 || si < 0 || p.hasMove(c.id)) return;
      p.moves.splice(p.moves.indexOf(m0), 1);
      p.slots[si] = p.slots[si].filter(m => m !== m0);
      if (!p.slots[si].length) p.slots.splice(si, 1);
      for (const o of G.Projectiles.all().filter(o => o.orb && o.owner === p && o.mid === old.id)) G.Projectiles.remove(o);
      learnNew(p);
      // into the old move's slot (the others keep theirs)
      const ni = p.slotOf(c.id);
      if (ni >= 0 && ni !== si) { const g = p.slots.splice(ni, 1)[0]; p.slots.splice(Math.min(si, p.slots.length), 0, g); }
      if (S) S.log[S.log.length - 1] = [p.level, 'swap', c.id + '>' + old.id, ti];
    };
    return card;
  }
  function vitCard(pl, id, ti) {
    const Iv = I(), v = Iv.VIT[id], x = Iv.vitOf(pl, id), lv = x ? x.lvl : 0;
    const c = dress({
      w: 0, type: x ? 'up' : 'new', key: 'vit:' + id, img: Iv.icon(v.icon), icon: 'up', color: Iv.RAR_COL[ti],
      tag: x ? F('Vitamina Nv. {x} → {x}', lv, lv + 1) : T.t('Vitamina'), title: T.t(v.name),
      desc: Iv.vitText(id, Iv.RAR_MUL[ti]) + (x ? '' : ' · ' + F('Hueco {x}/{x}', pl.xv.length + 1, Iv.slots(pl))),
      apply: p => { Iv.takeVitamin(p, id, ti); logPick(p, 'vit', id, ti); }
    }, ti);
    if (!x) c.xban = 'v:' + id;
    return c;
  }
  function trainCards(pl) {
    const n = pl.xtr ? pl.xtr.n : 0, k = Math.max(K.TRAIN_MIN, 1 / (1 + K.TRAIN_DECAY * n));
    const dmg = +(K.TRAIN_DMG * k).toFixed(4), hp = Math.max(1, Math.round(K.TRAIN_HP * k));
    return [
      { w: 0, type: 'stat', key: 'xtrain:dmg', icon: 'fist', color: '#8fa3c4', tag: T.t('Entrenamiento'), title: T.t('Entrenamiento'), desc: I().statText('dmg', dmg),
        apply: p => { p.xtr.n++; p.xtr.dmg += dmg; I().apply(p); logPick(p, 'train', 'dmg', 0); } },
      { w: 0, type: 'stat', key: 'xtrain:hp', icon: 'heart', color: '#8fa3c4', tag: T.t('Entrenamiento'), title: T.t('Entrenamiento'), desc: I().statText('hp', hp),
        apply: p => { p.xtr.n++; p.xtr.hp += hp; I().apply(p); logPick(p, 'train', 'hp', 0); } },
      { w: 0, type: 'stat', key: 'xtrain:rest', icon: 'berry', color: '#8fa3c4', tag: T.t('Descanso'), title: T.t('Descanso'), desc: T.t('Recupera el 40 % de tu vida.'),
        apply: p => { p.heal(p.maxHp * 0.4); logPick(p, 'train', 'rest', 0); } }
    ];
  }
  function logPick(p, kind, key, ti) { if (S) S.log.push([p.level, kind, key, ti]); syncUI(); }

  /** The levelup.offer seam (after the League's branch): an Expedition run's own cards. -> cards, or undefined. */
  function offer(pl, n = K.CARDS) {
    if (!on(pl)) return undefined;
    if (G.ExpMeta) n += G.ExpMeta.labNow('option');   // (D10: the Lab's fourth option)
    M().refreshAll(pl);
    const rng = G.DLC.rng(mix(G.World.seed | 0, slot(), pl.level, S.draw++, 0xD5));
    const pool = candidates(pl), picked = [], o = { level: pl.level, luck: pl.xluck || 0, zone: zone() };
    while (picked.length < n && pool.length) {
      const tot = pool.reduce((a, c) => a + c.w, 0);
      let r = rng() * tot, i = 0;
      for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r < 0) break; }
      picked.push(pool.splice(i, 1)[0]);
    }
    // a move card is always there and up front (study 2.5)
    if (!picked.some(c => c.kind === 'move')) {
      const j = pool.findIndex(c => c.kind === 'move');
      if (j >= 0) { if (picked.length >= n) picked.pop(); picked.push(pool.splice(j, 1)[0]); }
    }
    picked.sort((a, b) => (a.kind === 'move' ? 0 : 1) - (b.kind === 'move' ? 0 : 1));
    let cards = picked.map(c => c.make(rollRarity(rng, o), rng));
    if (!cards.length) cards = trainCards(pl).slice(0, n);
    if (LG()) cards = LG().cardsHook(cards, pl);
    queueMicrotask(syncTools);
    return cards;
  }

  // ---------------- Skip ----------------
  const skipsLeft = () => (S ? S.skips : 0);
  /** Skip this level's cards (the button, X, the pad's swap): no card, +10 x zone ₽ (D7: G.ExpEco.earn). */
  function skip() {
    const pl = G.Game.player;
    if (!on(pl) || S.skips <= 0 || !G.UI.isOpen('scr-levelup') || !G.RunUI.offers || G.RunUI.banMode) return false;
    const coins = K.SKIP_COINS * zone();
    const ok = G.RunUI.take({ w: 0, type: 'skip', key: 'skip', title: 'skip', desc: '',
      apply: p => { if (!S) return; S.skips--; if (G.ExpEco && G.ExpEco.run) G.ExpEco.earn(coins, 'skip'); else p.coins += coins; G.Spawner.say(F('Saltas las cartas: +{x} ₽', coins), 2.4, true); logPick(p, 'skip', 'skip', 0); if (LG() && LG().run) LG().run.note = []; } });
    if (ok) G.Audio.sfx('select');
    return ok;
  }

  // ---------------- item drops (the item.roll / item.take seams) ----------------
  /** item.roll: an Expedition run's drop: one of its own items, from the run's item stream. -> 'x:<id>' (or a heal) */
  function itemRoll(pl) {
    if (!S || !G.Modes.isExp()) return undefined;
    const p = pl || G.Game.player;
    const rng = G.DLC.rng(mix(G.World.seed | 0, 0x17E3, S.items++));
    const id = I().rollItem(p, rng);
    return id ? I().PREFIX + id : I().PREFIX + 'leftovers';
  }
  // ---------------- DLC D17: the one held item ----------------
  /** The base held item a boss drops for player pl (seeded; one it can use and doesn't hold), or null. */
  function heldRoll(pl) {
    if (!S) return null;
    const pool = K.HELD_POOL.filter(id => G.Items.BY[id] && !G.Items.BY[id].instant && G.Items.okFor(id, pl.dex) && !(G.ExpItems && G.ExpItems.IT[id]) && !pl.hasItem(id));
    if (!pool.length) return null;
    const rng = G.DLC.rng(mix(G.World.seed | 0, 0x4E1D, S.held++));
    return pool[Math.floor(rng() * pool.length)];
  }
  /** enemy.ko: a boss of this page's sim drops one base held item too (base's pickup: base's slot and replace screen). */
  function onKill(e, pl) {
    if (!S || !e || !e.boss || e.remote || !G.Modes.isExp()) return null;
    const id = heldRoll(pl || G.Game.player);
    if (id) G.Pickups.drop('item', e.x + 26, e.y - 10, id);
    return id;
  }
  /** item.take: an Expedition item picked up: one more stack (no choice screen). -> true if it was ours */
  function itemTake(pl, v) {
    const id = I() && I().idOf(v);
    if (!id) return undefined;
    if (!S || !pl || pl.remote) return true;
    const n = I().takeItem(pl, id), it = I().IT[id];
    if (!it) return true;
    if (n) {
      G.Spawner.say(n > 1 ? F('Objeto: {x} ×{x}', T.t(it.name), n) : F('Objeto: {x}', T.t(it.name)), 2.6, true);
      G.FX.ring(pl.x, pl.y, 8, 90, I().RAR_COL[it.rar], 0.5, 4);
      S.log.push([pl.level, 'item', id, it.rar]);
    } else pl.heal(pl.maxHp * 0.2);   // (at its cap: a heal instead)
    syncUI();
    return true;
  }

  // ---------------- the `x` block's `u` (viewers and guests) ----------------
  /** The local player's row: {v: [[vitamin, lv]], i: {item: n}, m: {move: lv}, e: [Expedition moves], t: [refresh, skip, banish]} */
  function row(pl = G.Game.player) {
    if (!S || !pl || !pl.xv) return null;
    const r = I().row(pl), m = {}, e = [];
    for (const mv of pl.moves) { if ((mv.xlv || 1) > 1) m[mv.id] = mv.xlv; if (M().isExpMove(mv.id)) e.push(mv.id); }
    r.m = m; if (e.length) r.e = e;
    r.t = [Math.max(0, 1 + (pl.rerollBonus || 0) - (pl.rerolls || 0)), S.skips, Math.max(0, pl.bansLeft || 0)];
    return r;
  }
  /** A viewer's / host's puppet p shows row r: its bag (the strip / pause panel read p.xu) and its Expedition moves. */
  function applyRow(p, r) {
    if (!p) return false;
    mountUI();   // (a viewer's page never started an Expedition run of its own)
    p.xu = r && typeof r === 'object' ? r : null;
    if (p.xu && Array.isArray(p.xu.e) && p.moves) {
      for (const id of p.xu.e) if (M().isExpMove(id) && !p.moves.some(m => m.id === id)) { const m = M().instance(id); p.moves.push(m); if (p.slots) p.slots.push([m]); }
      // (DLC D16: an Expedition move swapped away is dropped from the puppet too)
      const gone = m => M().isExpMove(m.id) && !p.xu.e.includes(m.id);
      if (p.moves.some(gone)) { p.moves = p.moves.filter(m => !gone(m)); if (p.slots) p.slots = p.slots.map(g => g.filter(m => !gone(m))).filter(g => g.length); }
    }
    if (p === viewing()) syncUI();
    return true;
  }
  let watched = null;
  const viewing = () => watched;
  function watch(p) { watched = p || null; syncUI(); }

  // ---------------- the UI: card frames, the Skip button, the bag (HUD strip + pause panel) ----------------
  const CSS = `
.card.rar { position: relative; }
.card.rar-1 { border-color: rgba(185,196,212,.55); }
.card.rar-2 { border-color: #5fd07a; box-shadow: inset 0 0 0 1px rgba(95,208,122,.35); }
.card.rar-3 { border-color: #4f9cf0; box-shadow: inset 0 0 0 1px rgba(79,156,240,.45), 0 0 10px rgba(79,156,240,.25); }
.card.rar-4 { border-color: #b46cf2; box-shadow: inset 0 0 0 1px rgba(180,108,242,.5), 0 0 14px rgba(180,108,242,.35); background: linear-gradient(90deg, rgba(180,108,242,.16), rgba(180,108,242,.03)); }
.card.rar-5 { border-color: #ffb020; box-shadow: inset 0 0 0 1px rgba(255,176,32,.55), 0 0 18px rgba(255,176,32,.45); background: linear-gradient(90deg, rgba(255,176,32,.2), rgba(255,176,32,.04)); }
.card .rar-chip { font-size: 11px; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; padding: 1px 7px; border-radius: 999px; background: rgba(255,255,255,.12); color: #d9e2ef; }
.card.rar-2 .rar-chip { background: #2f7d45; color: #eaffef; } .card.rar-3 .rar-chip { background: #2a64a8; color: #eef6ff; }
.card.rar-4 .rar-chip { background: #7438b0; color: #f6ecff; } .card.rar-5 .rar-chip { background: #c07b00; color: #fff6e0; }
.card .ico .ico-item { image-rendering: pixelated; width: 32px; height: 32px; }
.card .xsrc { display: block; font-size: 12px; color: #9fb1c9; margin-top: 2px; }
#lvl-skip { }
#xbag { position: fixed; left: 8px; bottom: 16px; z-index: 6; display: flex; flex-direction: column-reverse; gap: 3px; pointer-events: none; font: 700 11px/1 system-ui, sans-serif; color: #f4f8ff; text-shadow: 0 1px 2px #000; }
#xbag.hidden { display: none; }
#xbag .xb-row { display: flex; gap: 3px; flex-wrap: wrap-reverse; max-width: min(232px, calc(50vw - 200px)); min-width: 88px; }
#xbag .xb { position: relative; width: 26px; height: 26px; border-radius: 6px; background: rgba(10,16,28,.72); border: 1px solid rgba(140,170,210,.3); display: grid; place-items: center; }
#xbag .xb img { width: 24px; height: 24px; image-rendering: pixelated; }
#xbag .xb b { position: absolute; right: -2px; bottom: -3px; font-size: 10px; }
#xbag .xb.vit { border-color: rgba(255,210,63,.55); }
#xbag .xb.empty { opacity: .45; }
body.touch #xbag { bottom: 10px; } body.touch #xbag .xb-row { max-width: 146px; }
#pause-xbag { position: relative; flex: 0 1 auto; width: min(340px, 38vw); max-height: calc(100% - 4px); overflow-y: auto; margin-left: 12px; text-align: left; padding: 10px 12px;
  background: linear-gradient(180deg, var(--box1), var(--box2)); border: 3px solid var(--edge); border-radius: 12px; box-shadow: 0 0 0 3px var(--edge-out), inset 0 0 0 2px var(--edge-in); }
#pause-xbag.hidden { display: none; }
#pause-xbag h4 { margin: 6px 0 4px; font-size: 13px; color: #ffd23f; text-transform: uppercase; letter-spacing: .05em; }
#pause-xbag .xp-line { display: flex; gap: 8px; align-items: center; font-size: 13px; padding: 2px 0; }
#pause-xbag .xp-line img { width: 24px; height: 24px; image-rendering: pixelated; flex: 0 0 24px; }
#pause-xbag .xp-line .xp-t { flex: 1; color: #c9d4e4; }
#pause-xbag .xp-line b { color: #f4f8ff; }
#pause-xbag .xp-tools { font-size: 12px; color: #9fb1c9; margin-top: 6px; }
@media (max-height: 520px) { #scr-levelup.xlv .box > .sub { display: none; } #scr-levelup.xlv .box > h2 { margin-bottom: 4px; }
  #scr-levelup.xlv .card .xsrc { display: none; } #scr-levelup.xlv .card .ds { font-size: 12px; line-height: 1.25; } #scr-levelup.xlv .card .nm { font-size: 15px; } }
@media (max-height: 520px) { #pause-xbag { padding: 6px 8px; font-size: 12px; } #pause-xbag h4 { margin: 3px 0 2px; font-size: 12px; } #pause-xbag .xp-line { font-size: 12px; padding: 1px 0; } }
`;
  let mounted = false, bagEl = null, pauseEl = null, uiT = 0, bagKey = '';
  function mountUI() {
    if (mounted || typeof document === 'undefined') return;
    mounted = true;
    const st = document.createElement('style'); st.id = 'exp-d5-style'; st.textContent = CSS; document.head.appendChild(st);
    bagEl = document.createElement('div'); bagEl.id = 'xbag'; bagEl.className = 'hidden'; document.body.appendChild(bagEl);
    const ex = document.querySelector('#scr-levelup .lvl-extras');
    if (ex && !document.getElementById('lvl-skip')) {
      const b = document.createElement('button');
      b.id = 'lvl-skip'; b.className = 'btn small ghost hidden'; b.dataset.sfx = 'none';
      b.innerHTML = `<span id="lvl-skip-t"></span> · <span class="key-k"><kbd>X</kbd></span>`;
      b.onclick = () => skip();
      ex.appendChild(b);
    }
    // the pause screen's bag: a panel beside the pause box (the screen is a centred flex row), only in an Expedition run
    const ps = document.getElementById('scr-pause');
    if (ps && !document.getElementById('pause-xbag')) {
      pauseEl = document.createElement('div'); pauseEl.id = 'pause-xbag'; pauseEl.className = 'hidden';
      ps.appendChild(pauseEl);
      new MutationObserver(() => { if (G.UI.isOpen('scr-pause')) renderPause(); }).observe(document.getElementById('scr-pause'), { attributes: true, attributeFilter: ['class'] });
    }
    // the Skip button never outlives an Expedition level-up (a base run's screen never shows it); the strip follows a view
    const lu = document.getElementById('scr-levelup'), wb = document.getElementById('watch-bar');
    if (lu) new MutationObserver(() => { const b = document.getElementById('lvl-skip'); if (b && !b.classList.contains('hidden') && (!S || !G.Modes.isExp() || !G.UI.isOpen('scr-levelup'))) b.classList.add('hidden'); if ((!S || !G.Modes.isExp()) && lu.classList.contains('xlv')) lu.classList.remove('xlv'); }).observe(lu, { attributes: true, attributeFilter: ['class'] });
    if (wb) new MutationObserver(() => syncUI()).observe(wb, { attributes: true, attributeFilter: ['class'] });
    addEventListener('keydown', e => { if ((e.code === 'KeyX' || e.key === 'x') && G.UI.isOpen('scr-levelup') && S) { if (skip()) e.preventDefault(); } });
  }
  /** The Skip button: shown with its count while an Expedition level-up is open (after each deal). */
  function syncTools() {
    const b = document.getElementById('lvl-skip');
    if (!b) return;
    const lu = document.getElementById('scr-levelup');
    const want = !!S && G.Modes.isExp(); if (lu && lu.classList.contains('xlv') !== want) lu.classList.toggle('xlv', want);   // (a phone's Expedition level-up drops the hint line: Skip needs the room)
    const show = !!S && G.Modes.isExp() && S.skips > 0 && !!G.RunUI.offers;
    b.classList.toggle('hidden', !show);
    const t = document.getElementById('lvl-skip-t');
    if (t) t.textContent = F('Saltar ({x})', S ? S.skips : 0);
  }
  /** The player (or the watched puppet) whose bag is shown: {xv, xi} or a viewer's row. */
  function bagOf() {
    const w = viewing();
    if (w && w.xu) return { v: w.xu.v || [], i: w.xu.i || {} };
    const pl = G.Game.player;
    if (S && pl && pl.xv && G.Modes.isExp()) return { v: pl.xv.map(x => [x.id, x.lvl]), i: pl.xi };
    return null;
  }
  function syncUI(force) {
    if (!bagEl) return;
    const wb = document.getElementById('watch-bar');
    if (watched && (!wb || wb.classList.contains('hidden'))) watched = null;   // (the replay / live view has closed)
    const b = bagOf(), playing = G.Game.state !== 'over' && G.Game.state !== 'ui' && (G.Modes.isExp() || viewing());
    if (!b || !playing) { bagEl.classList.add('hidden'); bagKey = ''; return; }
    const key = JSON.stringify(b);
    bagEl.classList.remove('hidden');
    if (key === bagKey && !force) return;
    bagKey = key;
    const Iv = I(), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let v = '';
    for (let k = 0; k < Iv.K.VIT_SLOTS; k++) {
      const x = b.v[k];
      v += x && Iv.VIT[x[0]] ? `<span class="xb vit" title="${esc(T.t(Iv.VIT[x[0]].name))}"><img src="${Iv.icon(Iv.VIT[x[0]].icon)}" alt=""><b>${x[1]}</b></span>` : '<span class="xb vit empty"></span>';
    }
    let it = '';
    for (const id of Object.keys(b.i)) { const d = Iv.IT[id]; if (d) it += `<span class="xb" title="${esc(T.t(d.name))}" style="border-color:${Iv.RAR_COL[d.rar]}"><img src="${Iv.icon(d.icon)}" alt="">${b.i[id] > 1 ? `<b>${b.i[id]}</b>` : ''}</span>`; }
    bagEl.innerHTML = `<div class="xb-row" id="xbag-vit">${v}</div><div class="xb-row" id="xbag-items">${it}</div>`;
  }
  function renderPause() {
    if (!pauseEl) return;
    const pl = G.Game.player;
    if (!S || !pl || !pl.xv || !G.Modes.isExp()) { pauseEl.classList.add('hidden'); return; }
    const Iv = I(), Mv = M(), esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const vit = pl.xv.map(x => { const d = Iv.VIT[x.id]; return `<div class="xp-line"><img src="${Iv.icon(d.icon)}" alt=""><b>${esc(T.t(d.name))}</b> <span>${F('Nv. {x}/{x}', x.lvl, Iv.K.VIT_MAX)}</span><span class="xp-t">${esc(Iv.statText(d.stat, x.v))}</span></div>`; }).join('')
      || `<div class="xp-line"><span class="xp-t">${T.t('Ninguno todavía')}</span></div>`;
    const items = Object.keys(pl.xi).map(id => { const d = Iv.IT[id]; return `<div class="xp-line"><img src="${Iv.icon(d.icon)}" alt=""><b style="color:${Iv.RAR_COL[d.rar]}">${esc(T.t(d.name))}</b> <span>×${pl.xi[id]} / ${d.cap}</span><span class="xp-t">${esc(Iv.itemText(id))}</span></div>`; }).join('')
      || `<div class="xp-line"><span class="xp-t">${T.t('Ninguno todavía')}</span></div>`;
    const moves = pl.moves.map(m => `<div class="xp-line">${G.Icons.html(iconOf(m.id), 20)}<b>${esc(name(m.id))}</b> <span>${F('Nv. {x}/{x}', Mv.levelOf(m), Mv.K.MAX_LV)}</span></div>`).join('');
    const t = row(pl).t;
    pauseEl.innerHTML = `<h4>${T.t('Vitaminas')} (${pl.xv.length}/${Iv.slots(pl)})</h4>${vit}<h4>${T.t('Objetos')}</h4>${items}<h4>${T.t('Movimientos')}</h4>${moves}
      <div class="xp-tools">${F('Suerte {x}', Math.round(pl.xluck || 0))} · ${F('Cambiar {x} · Saltar {x} · Vetar {x}', t[0], t[1], t[2])}</div>`;
    pauseEl.classList.remove('hidden');
  }
  // ---------------- the end of the run (the Expedition save: counters only, merged by max) ----------------
  /** The run's level-ups and items into the Expedition save (js/expedition/core.js run.end). -> the run-over line */
  function record(sum) {
    const Sv = G.ExpSave, pl = G.Game.player;
    if (!S || !Sv) return [];
    let picks = 0, items = 0;
    for (const [, kind, , ti] of S.log) {
      if (kind === 'up' || kind === 'new' || kind === 'vit' || kind === 'swap') { picks++; Sv.bump('lv.rar.' + (ti + 1)); }
      if (kind === 'swap') Sv.bump('lv.swaps');   // (DLC D16)
      if (kind === 'item') items++;
      if (kind === 'skip') Sv.bump('lv.skips');
    }
    Sv.bump('lv.cards', picks);
    if (items) Sv.bump('lv.items', items);
    if (pl && pl.xv) {
      Sv.best('lv.vitmax', pl.xv.reduce((a, x) => Math.max(a, x.lvl), 0));
      Sv.best('lv.move8', pl.moves.filter(m => (m.xlv || 1) >= M().K.MAX_LV).length);
      Sv.best('lv.stacks', Object.values(pl.xi).reduce((a, n) => a + n, 0));
    }
    const nItems = pl && pl.xi ? Object.values(pl.xi).reduce((a, n) => a + n, 0) : 0;
    return [F('Objetos: {x} · Vitaminas: {x}', nItems, pl && pl.xv ? pl.xv.map(x => T.t(I().VIT[x.id].name) + ' ' + x.lvl).join(', ') || '—' : '—')];
  }

  /** run.tick: the bag strip a few times a second. */
  function tick(dt) { uiT -= dt; if (uiT <= 0) { uiT = 0.25; syncUI(); } }

  return {
    K, weights, odds, rollRarity, power, zone, need, xpNeed, begin, reset, offer, candidates, moveCands, trainCards, skip, skipsLeft,
    itemRoll, itemTake, heldRoll, onKill, row, applyRow, watch, record, syncUI, syncTools, renderPause, tick, mix,
    get run() { return S; }, get bagEl() { return bagEl; }
  };
})();
