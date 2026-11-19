// Scoundrel's account glue: live broadcasting to friends and spectating reuse Micatro's
// publisher / spectator loops (micatro/js/net.js) over Scoundrel's own actions:
//   publish-scoundrel {snapshot?, label, seq, over, won, replay?}  (the last push carries the ?replay= param) -> the runner's view; presence 'scoundrel:<label>'
//   scoundrel-state   {username, seq}                    -> a FRIEND reads it (cap 10)
//   run-score         {mode:'scoundrel', dungeons, final, seed, replay}  (replay: the ?replay= param; the server re-simulates it)
//   run-leaderboard   {mode:'scoundrel'}                 -> {top, you}
// Nothing here throws into the game.
import * as MP from '/battlecards/mpmode.js';
import { startPublisher as micPublisher, startSpectate as micSpectate, mountChat } from '../../micatro/js/net.js';

export const isLoggedIn = () => MP.hasToken();
export const myName = () => MP.cachedState()?.username || null;
export { mountChat };

export const startPublisher = (getSnapshot, getLabel) => micPublisher(getSnapshot, getLabel, { action: 'publish-scoundrel' });
export const startSpectate = (username, handlers) => micSpectate(username, { ...handlers, action: 'scoundrel-state' });

export async function submitScore({ dungeons, final, seed, replay }) {
  if (!isLoggedIn()) return { error: 'not logged in' };
  try { return await MP.call('run-score', { mode: 'scoundrel', dungeons, final, seed, ...(replay ? { replay } : {}) }); } catch (e) { return { error: String(e && e.message || e) }; }
}
export async function fetchLeaderboard() {
  if (!isLoggedIn()) return { error: 'not logged in', top: [] };
  try { return await MP.call('run-leaderboard', { mode: 'scoundrel' }); } catch (e) { return { error: String(e && e.message || e), top: [] }; }
}
