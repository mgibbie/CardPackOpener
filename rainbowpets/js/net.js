// Rainbow Pets' account glue (as Pair of Pears'): live broadcasting to friends and spectating reuse Micatro's publisher /
// spectator loops (micatro/js/net.js), and the online matches are server/rpets_pvp.mjs's `rpvp-*` actions.
//   publish-rpets {snapshot?, label, seq, over, won, replay?}  -> the player's own view; presence 'rpets:<label>'
//   rpets-state   {username, seq}                               -> a FRIEND reads it
// Nothing here throws into the game.
import * as MP from '/battlecards/mpmode.js';
import { startPublisher as micPublisher, startSpectate as micSpectate, mountChat } from '../../micatro/js/net.js';

export const isLoggedIn = () => MP.hasToken();
export const myName = () => MP.cachedState()?.username || null;
export const call = (action, body) => MP.call(action, body);
export { mountChat };
export const startPublisher = (getSnapshot, getLabel, more = {}) => micPublisher(getSnapshot, getLabel, { ...more, action: 'publish-rpets' });   // (more.bet: spectator bets)
export const startSpectate = (username, handlers) => micSpectate(username, { ...handlers, action: 'rpets-state' });
