// test/coins.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const coins = JSON.parse(readFileSync(new URL('../data/coins.json', import.meta.url)));
const byId = id => coins.find(c => c.id === id);

test('every coin has both faces with numeric OX', () => {
  for (const c of coins) {
    assert.equal(typeof c.faces.order.ox, 'number', `${c.id} order ox`);
    assert.equal(typeof c.faces.xtreme.ox, 'number', `${c.id} xtreme ox`);
    assert.ok(c.faces.order.ox > 0 && c.faces.xtreme.ox > 0);
  }
});

test('non-meta coins carry the same OX on both faces', () => {
  const nonMeta = coins.filter(c => !c.name.match(/カブトル|ハサムネ|レオウ|カイザーク/));
  for (const c of nonMeta) {
    assert.equal(c.faces.order.ox, c.faces.xtreme.ox, `${c.id} ${c.name} should be flat`);
  }
});

test('第2転 R イグルス is 5500, not 4500 (verified from coin photo)', () => {
  const ig = coins.find(c => c.name === 'イグルス' && c.rarity === 'R' && c.set.includes('第2転'));
  assert.equal(ig.faces.order.ox, 5500);
});

test('BBR カブトル is a meta coin: Order 9000 / Xtreme 5000', () => {
  const k = coins.find(c => c.name === 'カブトル' && c.rarity === 'BBR');
  assert.equal(k.faces.order.ox, 9000);
  assert.equal(k.faces.xtreme.ox, 5000);
  assert.equal(k.mainSide, 'order');
});

test('BBR ハサムネ mirrors it: Xtreme 9000 / Order 5000', () => {
  const h = coins.find(c => c.name === 'ハサムネ' && c.rarity === 'BBR');
  assert.equal(h.faces.xtreme.ox, 9000);
  assert.equal(h.faces.order.ox, 5000);
  assert.equal(h.mainSide, 'xtreme');
});

test('character names are canonical, spelling variants recorded', () => {
  assert.equal(coins.filter(c => c.name === 'ラッティ').length, 0, 'ラッティ should normalise to ラッティー');
  const r = coins.find(c => c.name === 'ラッティー');
  assert.ok(r.variants.includes('ラッティ'));
});

test('ids are unique', () => {
  assert.equal(new Set(coins.map(c => c.id)).size, coins.length);
});

import { other, attackOX, defenceOX, isMeta, makeCoin, deckOX, deckTotal, canSelectDeckCoin } from '../engine/coins.js';

const leo = coins.find(c => c.name === 'レオウ' && c.rarity === 'BR');
const flat = coins.find(c => c.name === 'ニャルバン' && c.rarity === 'BBR' && c.set.includes('第1転'));
const synthetic = ox => ({ faces: { order: { ox }, xtreme: { ox } } });

test('other() flips the side', () => {
  assert.equal(other('order'), 'xtreme');
  assert.equal(other('xtreme'), 'order');
});

test('meta coin on Order: attacks 8000, defends 4000', () => {
  const c = makeCoin(leo, 0, 'order', 500, 350, 0);
  assert.equal(attackOX(c), 8000);
  assert.equal(defenceOX(c), 4000);
});

test('same meta coin on Xtreme: attacks 4000, defends 8000', () => {
  const c = makeCoin(leo, 1, 'xtreme', 500, 650, 0);
  assert.equal(attackOX(c), 4000);
  assert.equal(defenceOX(c), 8000);
});

test('non-meta coin: attack equals defence on either side', () => {
  for (const side of ['order', 'xtreme']) {
    const c = makeCoin(flat, 0, side, 0, 0, 0);
    assert.equal(attackOX(c), defenceOX(c));
    assert.equal(attackOX(c), 7000);
  }
});

test('isMeta detects the split', () => {
  assert.equal(isMeta(leo), true);
  assert.equal(isMeta(flat), false);
});

test('a fresh coin is set, alive, and showing its own colour', () => {
  const c = makeCoin(flat, 0, 'order', 500, 350, 0);
  assert.equal(c.core, 'set');
  assert.equal(c.ringUp, 'order');
  assert.equal(c.alive, true);
  assert.equal(c.vx, 0);
});

test('Expert deck cost uses M (the mean of both faces) for meta coins', () => {
  assert.equal(deckOX(leo), 6000);
  assert.equal(deckOX(flat), 7000);
});

test('Expert deck total sums all three selected coins', () => {
  const deck = [
    coins.find(c => c.name === 'ニャルバン' && c.rarity === 'R' && c.set.includes('第1転')),
    coins.find(c => c.name === 'ラビナ' && c.rarity === 'R' && c.set.includes('第1転')),
    coins.find(c => c.name === 'イグルス' && c.rarity === 'BR' && c.set.includes('第1転')),
  ];
  assert.equal(deckTotal(deck), 15000);
});

test('coin picker reserves enough OX for every remaining empty slot', () => {
  const deck = [synthetic(8000), null, null];
  assert.equal(canSelectDeckCoin(deck, 1, synthetic(6500), 15000, 500), true);
  assert.equal(canSelectDeckCoin(deck, 1, synthetic(6501), 15000, 500), false);
});

test('coin picker excludes the current slot when replacing a coin', () => {
  const deck = [synthetic(8000), synthetic(7000), null];
  assert.equal(canSelectDeckCoin(deck, 0, synthetic(8000)), true);
  assert.equal(canSelectDeckCoin(deck, 0, synthetic(8001)), false);
});
