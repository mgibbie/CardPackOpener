'use strict';
/* ============ systems/forms.js — regional formes and Megas in every mode (MicaSurvivor U3, not upstream) ============
 * Owner (2026-11-02): "a sweep of all 3 game modes to make sure all 1025 are playable and show up as enemies as well as all
 * Megas and regional formes." Decisions (Plans/MICASURVIVOR_UNIFIED_PLAN.md): the formes are animated SpriteCollab sheets,
 * the Megas are rare elites and bosses (Survival after ~15 min, Expedition zone 3, Dive below floor 30, sometimes an alpha /
 * boss) and playable in the Survival modes too; one unlock list for every mode (a forme is its own collection entry).
 *
 * The data model: every id is an INTEGER, PokéAPI's — 1-1025 the species, 10091-10253 the 58 regional formes
 * (js/data/forms.js: entries of their own in G.DEX, after the species), 10033-10325 the 93 Megas (js/data/mega-data.js:
 * in G.DEX_BY only, never in G.DEX: a Mega is a transformation, not a collection entry). So a forme or a Mega flows through
 * everything that carries a dex number (G.DEX_BY, the sprites assets/pokemon/<id>/, save.owned, the net frames, replays,
 * the server's bounds) with no new field anywhere.
 *
 *   G.Forms   is(d) · speciesOf(d) (a forme / Mega -> its species) · patchLeague(D): the Expedition League learns the formes
 *             as stages of their base species' family (a forme that starts its line is an `alt` stage; one with a pre-
 *             evolution is in that stage's `evo`; G.FORM_INTO: a forme into a species of its own, Galarian Meowth -> Perrserker)
 *   G.Megas   BY / OF / LIST · foes() (every Mega with a sheet) · pick(rng) · stream(seed) · the look: aura + emblem (drawn by
 *             G.Sprites.Animator for any Mega id) · the BASE runs' Mega Evolution: from Lv 40 (K.LV) a level-up's cards are
 *             the Megas of the species you play and "Not yet" (offered again K.AGAIN levels later), as in an Expedition League
 *             run (js/expedition/league.js megaCards); the Mega's real base stats and types for the rest of the run
 */
G.Forms = (() => {
  const LIST = G.FORMS || [];
  const BY = {};
  for (const p of LIST) BY[p.dex] = p;
  const is = d => !!BY[d];
  /** The species a forme or a Mega is of (a species: itself). */
  const speciesOf = d => (BY[d] ? BY[d].sp : G.Megas && G.Megas.BY[d] ? G.Megas.BY[d].sp : +d);
  /** The Expedition League data D (js/expedition/league-data.js) with the formes as stages of their lines (once). */
  function patchLeague(D) {
    if (!D || D.u3) return D;
    const fam = {};
    for (const m of D.members) {
      const st = [m.dex];
      for (let i = 0; i < st.length; i++) for (const [to] of m.evo[st[i]] || []) if (!st.includes(to)) st.push(to);
      for (const d of st) fam[d] = m;
    }
    for (const p of LIST) {
      const m = fam[p.sp];
      if (!m) continue;
      D.base[p.dex] = p.base.slice();
      if (p.from) (m.evo[p.from] = m.evo[p.from] || []).push([p.dex, p.lv]);
      else (m.alt = m.alt || []).push(p.dex);
      fam[p.dex] = m;
    }
    for (const [a, t, lv] of G.FORM_INTO || []) { const m = fam[a]; if (m && fam[t] === m) (m.evo[a] = m.evo[a] || []).push([t, lv]); }
    D.u3 = true;
    return D;
  }
  return { LIST, BY, is, speciesOf, patchLeague };
})();

G.Megas = (() => {
  const D = G.EXP_MEGA_DATA || [];
  const K = { LV: 40, AGAIN: 5, IFRAMES: 1.2 };
  const r2 = x => Math.round(x * 100) / 100;
  const BY = {}, OF = {};
  for (const e of D) {
    const sp = G.DEX_BY[e.sp];
    if (!sp) continue;
    const [hp, atk, , spa, , spe] = e.base;
    // (fetch_pokedex.py's game stats from the Mega's base stats)
    const primal = e.kind === 'primal';   // (Primal Kyogre / Groudon: a Mega in every way but the name)
    const row = { dex: e.id, name: primal ? sp.name + ' Primigenio' : 'Mega-' + sp.name + (e.suf ? ' ' + e.suf : ''), types: e.types.slice(), hp: Math.round(70 + hp * 0.45),
      spd: Math.round(78 + spe * 0.42), atk: r2(0.70 + Math.max(atk, spa) / 100 * 0.55), rarity: 5, bst: e.base.reduce((a, b) => a + b, 0),
      starter: false, gen: sp.gen, sp: e.sp, mega: true, ...(primal ? { primal: true } : {}) };
    if (sp.leg) row.leg = true;
    BY[e.id] = row;
    (OF[e.sp] = OF[e.sp] || []).push(row);
    if (!G.DEX_BY[e.id]) G.DEX_BY[e.id] = row;
  }
  const LIST = Object.values(BY).sort((a, b) => a.dex - b.dex);
  if (G.I18n && G.I18n.add) G.I18n.add({ 'Mega-{x}': 'Mega {x}', 'MEGAEVOLUCIÓN': 'MEGA EVOLUTION', 'Todavía no': 'Not yet',
    '¡{x} megaevoluciona a {x}!': '{x} Mega Evolved into {x}!', 'Sigue como {x}; se ofrece otra vez dentro de {x} niveles': 'Stay as {x}; offered again in {x} levels',
    '{x} · Vida {x} → {x}': '{x} · HP {x} → {x}', '¡Un {x} salvaje anda cerca!': 'A wild {x} is near!',
    '¡{x} salvaje aparece!': 'A wild {x} appears!', 'REGRESIÓN PRIMIGENIA': 'PRIMAL REVERSION', '¡{x} regresa a su estado primigenio: {x}!': '{x} underwent Primal Reversion into {x}!',
    ...Object.fromEntries(LIST.filter(p => p.primal).map(p => [p.name, 'Primal ' + G.DEX_BY[p.sp].name])) });
  /** Every Mega that can be drawn (its sprites-meta row: animated, a battle front, or its species' sheet). */
  const foes = () => LIST.filter(p => G.SPRITE_META && G.SPRITE_META[p.dex]).map(p => p.dex);
  /** A seeded stream (mulberry32), so the Mega draws never take from Math.random (the base runs' sequences stay theirs). */
  function stream(seed) {
    let a = (seed >>> 0) || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  /** A Mega's id from the stream (uniform over foes(): every Mega comes up over seeds). */
  const pick = rng => { const f = foes(); return f.length ? f[Math.min(f.length - 1, Math.floor(rng() * f.length))] : 0; };
  const T = () => G.I18n;
  const name = d => (G.DEX_BY[d] ? T().t(G.DEX_BY[d].name) : '#' + d);

  // ---------------- the look (G.Sprites.Animator draws it for any Mega id) ----------------
  const TAU = Math.PI * 2;
  function aura(ctx, x, y, r, t) {
    ctx.save();
    const a = 0.32 + 0.12 * Math.sin((t || 0) * 5);
    const g = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 1.6);
    g.addColorStop(0, 'rgba(255,240,255,' + a + ')');
    g.addColorStop(0.55, 'rgba(214,92,255,' + a * 0.8 + ')');
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }
  function emblem(ctx, x, y, t) {
    t = t || 0;
    ctx.save();
    const s = 6 + Math.sin(t * 4) * 0.5, cols = ['#ff9a2e', '#e050e8', '#3fa2ff'];
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = cols[i];
      ctx.beginPath(); ctx.arc(x, y, s, t * 1.5 + i * TAU / 3, t * 1.5 + i * TAU / 3 + TAU / 3 - 0.35); ctx.stroke();
    }
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, s * 0.42, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------------- the base runs' Mega Evolution (owner decision #3: "Megas are also playable in Survival modes") ----------------
  /** The id a player shows (its Mega once it Mega Evolved, else its species): the net frame's field 16. */
  const lookOf = pl => (pl && pl.mega && BY[pl.mega] && BY[pl.mega].sp === pl.dex ? pl.mega : pl ? pl.dex : 0);
  /** The level-up's cards when a Mega is due (null: none): a base run, from Lv K.LV, a species that has Megas. */
  function baseCards(pl) {
    if (!pl || pl.remote || (G.Modes && G.Modes.isExp && G.Modes.isExp())) return null;
    const opts = OF[pl.dex];
    if (!opts || !opts.length || pl.mega || pl.level < (pl.megaAt || K.LV)) return null;
    const cur = pl.mon || G.DEX_BY[pl.dex];
    const cards = opts.filter(e => G.SPRITE_META && G.SPRITE_META[e.dex]).map(e => ({
      w: 0, type: 'xevo', key: 'mega:' + e.dex, icon: 'star', color: '#e050e8', tag: T().t(e.primal ? 'REGRESIÓN PRIMIGENIA' : 'MEGAEVOLUCIÓN'), sprite: e.dex, mega: e.dex,
      title: name(pl.dex) + ' → ' + name(e.dex),
      desc: T().f('{x} · Vida {x} → {x}', e.types.map(t => T().t(G.U.TYPE_NAME[t])).join(' / '), Math.round(pl.maxHp), Math.round(pl.maxHp + e.hp - cur.hp)),
      apply: q => { evolve(q, e.dex); }
    }));
    if (!cards.length) return null;
    cards.push({ w: 0, type: 'xevo', key: 'mega:later', icon: 'clock', color: '#9fb1c9', tag: T().t('Todavía no'), title: T().t('Todavía no'),
      desc: T().f('Sigue como {x}; se ofrece otra vez dentro de {x} niveles', name(pl.dex), K.AGAIN),
      apply: q => { q.megaAt = q.level + K.AGAIN; } });
    return cards;
  }
  /** Player pl Mega Evolves into Mega `id` (a base run): its base stats (by ratio, so every bonus stays) and types, its look. */
  function evolve(pl, id) {
    const e = BY[id];
    if (!pl || !e || pl.mega || e.sp !== pl.dex) return false;
    const cur = pl.mon || G.DEX_BY[pl.dex];
    const dHp = e.hp - cur.hp;
    pl.maxHp = Math.max(1, pl.maxHp + dHp);
    pl.hp = G.U.clamp(pl.hp + Math.max(0, dHp), 1, pl.maxHp);
    if (cur.spd > 0) pl.baseSpd *= e.spd / cur.spd;
    if (cur.atk > 0) pl.baseAtk *= e.atk / cur.atk;
    pl.mon = Object.assign({}, cur, { types: e.types.slice(), hp: e.hp, spd: e.spd, atk: e.atk });
    pl.mega = id;
    if (G.Sprites) {
      const dir = pl.anim ? pl.anim.dir : 0, scale = pl.anim ? pl.anim.scale : 1;
      pl.anim = new G.Sprites.Animator(id, scale, !!pl.shiny && G.Sprites.hasShiny(id));
      pl.anim.dir = dir;
      pl.r = G.Sprites.bodyRadius(id);
      pl.bodyH = G.Sprites.bodyHeight(id);
      G.Sprites.preload([id], 8000, !!pl.shiny);
    }
    pl.invuln = Math.max(pl.invuln || 0, K.IFRAMES);
    const txt = T().f(e.primal ? '¡{x} regresa a su estado primigenio: {x}!' : '¡{x} megaevoluciona a {x}!', name(pl.dex), name(id));
    if (G.Spawner && G.Spawner.say) G.Spawner.say(txt, 3.2, true);
    if (G.Game && G.Game.flash) G.Game.flash('#ffe6ff', 0.7);
    if (G.FX && G.FX.ring) for (const [r, c] of [[150, '#ff9a2e'], [190, '#e050e8'], [230, '#3fa2ff']]) G.FX.ring(pl.x, pl.y, 8, r, c, 0.9, 6);
    if (G.Audio && G.Audio.sfx) G.Audio.sfx('legend');
    return true;
  }
  return { K, BY, OF, LIST, foes, pick, stream, aura, emblem, lookOf, baseCards, evolve, of: sp => OF[sp] || [] };
})();
