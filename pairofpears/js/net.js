// Pair of Pears' account glue: live broadcasting to friends and spectating reuse Micatro's
// publisher / spectator loops (micatro/js/net.js) over the game's own actions:
//   publish-pears {snapshot?, label, seq, over, won} -> the runner's view; presence 'pears:<label>'
//   pears-state   {username, seq}                    -> a FRIEND reads it (cap 10)
// Nothing here throws into the game.
import * as MP from '/battlecards/mpmode.js';
import { startPublisher as micPublisher, startSpectate as micSpectate, mountChat } from '../../micatro/js/net.js';

export const isLoggedIn = () => MP.hasToken();
export const myName = () => MP.cachedState()?.username || null;
export { mountChat };

export const startPublisher = (getSnapshot, getLabel) => micPublisher(getSnapshot, getLabel, { action: 'publish-pears' });
export const startSpectate = (username, handlers) => micSpectate(username, { ...handlers, action: 'pears-state' });
