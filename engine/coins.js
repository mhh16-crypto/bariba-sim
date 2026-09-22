// engine/coins.js
export const other = side => (side === 'order' ? 'xtreme' : 'order');

// The face showing while the core is SET — what you attack with.
export const attackOX = coin => coin.def.faces[coin.side].ox;

// The face showing after the core inverts — what you defend with.
// For a normal coin both faces carry the same number, so this collapses
// to a single stat with no special case. Spec §3.3.
export const defenceOX = coin => coin.def.faces[other(coin.side)].ox;

export const isMeta = def => def.faces.order.ox !== def.faces.xtreme.ox;

export const deckOX = def => (def.faces.order.ox + def.faces.xtreme.ox) / 2;

export const deckTotal = defs => defs.reduce((sum, def) => sum + deckOX(def), 0);

export function canSelectDeckCoin(deck, slot, candidate, limit = 15000, minimumCoinOX = 0) {
  const nextDeck = deck.map((def, index) => index === slot ? candidate : def);
  const selected = nextDeck.filter(Boolean);
  const remainingSlots = nextDeck.length - selected.length;
  return deckTotal(selected) + remainingSlots * minimumCoinOX <= limit;
}

export function makeCoin(def, owner, side, x, y, theta) {
  return {
    def, owner, side,
    x, y, vx: 0, vy: 0,
    theta, omega: 0,
    core: 'set',
    ringUp: side,
    alive: true,
  };
}
