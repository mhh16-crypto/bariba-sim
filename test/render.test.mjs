import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coinVisualState } from '../ui/render.js';

const coin = (over = {}) => ({
  core: 'set',
  side: 'order',
  ringUp: 'order',
  ...over,
});

test('locked coin renders its actual upward face', () => {
  assert.deepEqual(coinVisualState(coin()), {
    released: false,
    flipped: false,
    faceSide: 'order',
    state: 'locked',
  });
});

test('unlock without a flip keeps the original face visible', () => {
  assert.deepEqual(coinVisualState(coin({ core: 'released' })), {
    released: true,
    flipped: false,
    faceSide: 'order',
    state: 'unlocked',
  });
});

test('unlock with a flip renders the actual opposite face', () => {
  assert.deepEqual(coinVisualState(coin({ core: 'released', ringUp: 'xtreme' })), {
    released: true,
    flipped: true,
    faceSide: 'xtreme',
    state: 'flipped',
  });
});
