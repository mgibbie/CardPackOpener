// Local, per-player Joker usage. Each run counts at most once per Joker,
// including after a resume. Only the live player's owned Joker area is read.
const storageKey = (user) => 'micatro_joker_usage_v1:' + (user || 'guest');
function read(user) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(user)) || '{}');
    return value && value.runs && typeof value.runs === 'object' ? value : { runs: {} };
  } catch (_) { return { runs: {} }; }
}
export function recordJokerUsage(user, runId, jokers, won = false) {
  if (!runId || !Array.isArray(jokers)) return;
  const data = read(user);
  const run = data.runs[runId] || { used: {}, won: {} };
  for (const key of jokers) if (typeof key === 'string' && /^j_[A-Za-z0-9_]{1,100}$/.test(key)) {
    run.used[key] = true;
    if (won) run.won[key] = true;
  }
  data.runs[runId] = run;
  try { localStorage.setItem(storageKey(user), JSON.stringify(data)); } catch (_) { /* storage unavailable */ }
}
export function jokerUsage(user) {
  const totals = {};
  for (const run of Object.values(read(user).runs)) {
    for (const key of Object.keys(run.used || {})) (totals[key] ||= { runs: 0, wins: 0 }).runs++;
    for (const key of Object.keys(run.won || {})) (totals[key] ||= { runs: 0, wins: 0 }).wins++;
  }
  return totals;
}
export function usageUser() {
  try { return localStorage.getItem('magepunk_mp_token_v1') ? (JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || '{}') || {}).username || 'guest' : 'guest'; }
  catch (_) { return 'guest'; }
}
