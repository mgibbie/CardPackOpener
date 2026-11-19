// Pair of Pears' account glue: live broadcasting to friends and spectating reuse Micatro's
// publisher / spectator loops (micatro/js/net.js) over the game's own actions:
//   publish-pears {snapshot?, label, seq, over, won, replay?} -> the runner's view; presence 'pears:<label>'
//                 (the last push carries the run's ?replay= param: a spectator's end screen offers it)
//   pears-state   {username, seq}                    -> a FRIEND reads it (cap 10)
// Nothing here throws into the game.
import * as MP from '/battlecards/mpmode.js';
import { startPublisher as micPublisher, startSpectate as micSpectate, mountChat } from '../../micatro/js/net.js';

export const isLoggedIn = () => MP.hasToken();
export const myName = () => MP.cachedState()?.username || null;
export const call = (action, body) => MP.call(action, body);
export { mountChat };

export const startPublisher = (getSnapshot, getLabel) => micPublisher(getSnapshot, getLabel, { action: 'publish-pears' });
export const startSpectate = (username, handlers) => micSpectate(username, { ...handlers, action: 'pears-state' });
