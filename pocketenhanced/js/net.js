// Pocket Enhanced's account glue: broadcasting a match to friends and watching a friend's reuse Micatro's
// publisher / spectator loops (micatro/js/net.js) over this game's own actions:
//   publish-pocket {snapshot?, label, seq, over, won} -> the player's SPECTATOR view (no hands); presence 'pocket:<label>'
//   pocket-state   {username, seq}                    -> a FRIEND reads it (cap 10)
// Nothing here throws into the game; a guest simply does not broadcast.
import * as MP from '/battlecards/mpmode.js';
import { startPublisher as micPublisher, startSpectate as micSpectate } from '../../micatro/js/net.js';

export const isLoggedIn = () => MP.hasToken();
export const myName = () => MP.cachedState()?.username || null;
export const call = (action, body) => MP.call(action, body);

export const startPublisher = (getSnapshot, getLabel) => micPublisher(getSnapshot, getLabel, { action: 'publish-pocket' });
export const startSpectate = (username, handlers) => micSpectate(username, { ...handlers, action: 'pocket-state' });
