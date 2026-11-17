// say.js — the quick messages of an online match. Players send a phrase's number, never text of their own, so there is
// nothing to moderate. The server (server/pocket_pvp.mjs) checks the number against this list.
export const SAY = Object.freeze(['Hello!', 'Good luck!', 'Nice move!', 'Thinking…', 'Oops!', 'So close!', 'Thanks!', 'Good game!']);
export const SAY_EVERY_MS = 2500, SAY_SHOWN_MS = 12000;
