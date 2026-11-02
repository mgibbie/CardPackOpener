/* ============ unlocks.js — one unlock list for every mode (MicaSurvivor, owner 2026-11-02) ============
 * Owner: "You either have a mon unlocked for all 3 modes or you don't, it's all or nothing. Catching a pokemon in the
 * overworld/traditional battle system game should unlock it in MicaSurvivor. Then we have the gacha game and unlocking in
 * expedition/dive as well." And: "I don't want unlocking something to unlock the entire family. Evolving into something
 * should unlock it."
 *
 * The list is the base save's collection (save.owned, G.DB.owns): Survival's partner picker, Expedition's League and Dive
 * all read it. Every way in ADDS a species (never a family; never removes anything):
 *   gacha          the base game's pulls (as always)
 *   starters       the starter picks, free for everyone: the 27 trios' first stages, Psyduck, Slowpoke and Pichu
 *   overworld      every species the overworld game's Pokédex has CAUGHT: the account's overworld save on the server
 *                  (micasurvivor-ow-caught), or this device's (localStorage magepunk_dex_v1) for a guest; ids mapped by
 *                  G.OW_SPECIES (js/data/ow-species.js)
 *   expedition     a form a League run evolved into, a Pokémon caught in a run (js/expedition/league.js, capture.js),
 *                  and once, everything the Expedition save already had (league.form / league.own)
 * add() writes only new entries ({at, from}) and commits once; sync() runs on the main menu, once per account a while.
 */
G.Unlocks = (() => {
  const SYNC_EVERY = 10 * 60 * 1000;
  let last = { who: null, at: 0 }, busy = null;
  /** Unlock these dex numbers (from: 'starter' | 'overworld' | 'expedition' | ...). -> how many were new */
  function add(list, from) {
    const s = G.DB && G.DB.save;
    if (!s || !s.owned) return 0;
    let n = 0;
    const now = Date.now();
    for (const d0 of list || []) {
      const d = d0 | 0;
      if (!(d >= 1 && d <= 1025) || !G.DEX_BY[d] || s.owned[d]) continue;
      s.owned[d] = { at: now, from: from || 'unlock' };
      n++;
    }
    if (n) G.DB.commit(true);
    return n;
  }
  // (owner 2026-11-02: every starter pick is free for all: the 27 trios' first stages, Psyduck and Slowpoke (G.STARTERS), and Pichu)
  const EXTRA_FREE = [172];
  const starters = () => add((G.STARTERS || []).map(st => st.dex).concat(EXTRA_FREE), 'starter');
  /** The overworld game's caught species (the account's server save, else this device's). -> Promise of the dex list */
  async function overworldCaught() {
    const ids = new Set();
    try {
      const raw = localStorage.getItem('magepunk_dex_v1');
      const d = raw ? JSON.parse(raw) : null;
      if (d && Array.isArray(d.caught)) for (const id of d.caught) ids.add(String(id));
    } catch (e) { /* no local overworld save */ }
    const A = G.MicaAccount;
    if (A && A.name && A.name() && A.call) {
      try {
        const r = await A.call('micasurvivor-ow-caught', {});
        if (r && r.ok && r.body && Array.isArray(r.body.caught)) for (const id of r.body.caught) ids.add(String(id));
      } catch (e) { /* offline: the local list only */ }
    }
    const M = G.OW_SPECIES || {}, out = new Set();
    for (const id of ids) { const n = M[id] || M[id.toLowerCase()]; if (n) out.add(n); }
    return [...out];
  }
  /** The Expedition save's own unlocks, once it is open (league.form: evolved into; league.own: caught). */
  function expedition() {
    const X = G.ExpSave;
    if (!X || !X.list) return 0;
    return add(X.list('league.form').concat(X.list('league.own')).map(Number), 'expedition');
  }
  /** Everything at once (the main menu): the starters, the overworld, the Expedition save if loaded. -> Promise of {starter, overworld, expedition} */
  function sync(force) {
    const who = (G.DB && G.DB.save && G.DB.save.name) || null;
    if (!force && busy) return busy;
    if (!force && last.who === who && Date.now() - last.at < SYNC_EVERY) return Promise.resolve(null);
    last = { who, at: Date.now() };
    busy = (async () => {
      const r = { starter: starters(), expedition: expedition(), overworld: 0 };
      r.overworld = add(await overworldCaught(), 'overworld');
      if (r.overworld && G.UI && G.UI.toast) G.UI.toast(G.I18n.f('{x} Pokémon del mundo desbloqueados en MicaSurvivor', r.overworld), 3600);
      return r;
    })().finally(() => { busy = null; });
    return busy;
  }
  G.I18n && G.I18n.add && G.I18n.add({ '{x} Pokémon del mundo desbloqueados en MicaSurvivor': '{x} Pokémon from the overworld unlocked in MicaSurvivor' });
  return { add, starters, overworldCaught, expedition, sync, SYNC_EVERY };
})();
