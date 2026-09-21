// test/rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeCoin } from '../engine/coins.js';
import { OUT, SAFE_NONE, SAFE_RESET, SAFE_RELOCATE, oxBattle, resolveCoin, resolveTurn } from '../engine/rules.js';

const coins = JSON.parse(readFileSync(new URL('../data/coins.json', import.meta.url)));
const pick = (name, rarity) => coins.find(c => c.name === name && c.rarity === rarity);

// Synthetic flat-OX definitions keep rule tests independent of real card data.
const flat = ox => ({ id: `synth-${ox}`, name: `S${ox}`, variants: [], rarity: 'R',
  set: 'synthetic', mainSide: 'order',
  faces: { order: { label: `S${ox}O`, ox }, xtreme: { label: `S${ox}X`, ox } } });

const coin = (ox, side = 'xtreme', over = {}) =>
  Object.assign(makeCoin(flat(ox), 1, side, 500, 500, 0), over);
const shot = (ox, side = 'order') => makeCoin(flat(ox), 0, side, 500, 200, 0);

const R = (target, shooter, isShooter, inField) =>
  resolveCoin({ coin: target, shooter, isShooter, inField });

test('1 · opponent released and flipped is OUT regardless of OX', () => {
  const t = coin(9000, 'xtreme', { core: 'released', ringUp: 'order' });
  assert.equal(R(t, shot(500), false, true), OUT);
});

test('2 · OX battle won: 6000 attacker beats 5000 defender', () => {
  const t = coin(5000, 'xtreme', { core: 'released' });
  assert.equal(R(t, shot(6000), false, true), OUT);
});

test('3 · OX battle tie goes to the DEFENDER (guards against >=)', () => {
  const t = coin(5000, 'xtreme', { core: 'released' });
  assert.equal(R(t, shot(5000), false, true), SAFE_RESET);
});

test('4 · OX battle lost: 5000 attacker cannot remove a 6000 defender', () => {
  const t = coin(6000, 'xtreme', { core: 'released' });
  assert.equal(R(t, shot(5000), false, true), SAFE_RESET);
});

test('5 · opponent struck but core stayed SET is untouched', () => {
  const t = coin(500, 'xtreme', { core: 'set' });
  assert.equal(R(t, shot(9000), false, true), SAFE_NONE);
});

test('6 · own coin flipped is OUT even on your own turn', () => {
  const t = coin(9000, 'order', { core: 'released', ringUp: 'xtreme' });
  assert.equal(R(t, shot(9000), true, true), OUT);
});

test('7 · own coin released but not flipped is SAFE — never an OX battle', () => {
  const t = coin(500, 'order', { core: 'released' });
  assert.equal(R(t, shot(9000), true, true), SAFE_RESET);
});

test('8 · own coin out of bounds is OUT regardless of core or ring', () => {
  for (const core of ['set', 'released']) {
    const t = coin(9000, 'order', { core });
    assert.equal(R(t, shot(9000), true, false), OUT);
  }
});

test('9 · opponent out of bounds with core still SET is SAFE(relocate)', () => {
  const t = coin(500, 'xtreme', { core: 'set' });
  assert.equal(R(t, shot(9000), false, false), SAFE_RELOCATE);
});

test('9b · opponent out of bounds, released, losing the OX battle is SAFE(relocate)', () => {
  const t = coin(6000, 'xtreme', { core: 'released' });
  assert.equal(R(t, shot(5000), false, false), SAFE_RELOCATE);
});

test('9c · opponent out of bounds, released, flipped is OUT', () => {
  const t = coin(9000, 'xtreme', { core: 'released', ringUp: 'order' });
  assert.equal(R(t, shot(500), false, false), OUT);
});

test('11a · generated-state invariant: a released+flipped coin is always OUT', () => {
  for (const isShooter of [true, false]) {
    for (const inField of [true, false]) {
      const side = isShooter ? 'order' : 'xtreme';
      const t = coin(9000, side, { core: 'released', ringUp: side === 'order' ? 'xtreme' : 'order' });
      assert.equal(R(t, shot(500), isShooter, inField), OUT, `isShooter=${isShooter} inField=${inField}`);
    }
  }
});

test('12/13 · meta coin asymmetry drives the OX battle', () => {
  const leo = pick('レオウ', 'BR');       // order 8000 / xtreme 4000
  const kabu = pick('カブトル', 'BBR');   // order 9000 / xtreme 5000

  // レオウ on Order attacks at 8000; カブトル on Order defends at 5000 → OUT
  const attacker = makeCoin(leo, 0, 'order', 500, 200, 0);
  const defender = Object.assign(makeCoin(kabu, 1, 'order', 500, 500, 0), { core: 'released' });
  assert.equal(R(defender, attacker, false, true), OUT);

  // Flip both sides: レオウ attacks at 4000, カブトル defends at 9000 → SAFE
  const attacker2 = makeCoin(leo, 0, 'xtreme', 500, 200, 0);
  const defender2 = Object.assign(makeCoin(kabu, 1, 'xtreme', 500, 500, 0), { core: 'released' });
  assert.equal(R(defender2, attacker2, false, true), SAFE_RESET);
});

test('oxBattle is strictly greater-than', () => {
  assert.equal(oxBattle(5001, 5000), OUT);
  assert.equal(oxBattle(5000, 5000), SAFE_RESET);
  assert.equal(oxBattle(4999, 5000), SAFE_RESET);
});

// Regression guards for the resolveCoin ordering rule: the manual requires an
// opponent's coin to be BOTH released AND flipped to be out. Every prior test
// pairs core:'set' with an un-flipped ring and core:'released' with a flipped
// one, so the two `if` checks could be swapped and every prior test would
// still pass. These two cover the case no other test reaches: core still
// SET but ringUp already flipped — must stay SAFE, not OUT.
test('14 · opponent flipped but core still SET, in field, is SAFE(none) — not OUT', () => {
  const t = coin(500, 'xtreme', { core: 'set', ringUp: 'order' });
  assert.equal(R(t, shot(9000), false, true), SAFE_NONE);
});

test('15 · opponent flipped but core still SET, out of bounds, is SAFE(relocate) — not OUT', () => {
  const t = coin(500, 'xtreme', { core: 'set', ringUp: 'order' });
  assert.equal(R(t, shot(9000), false, false), SAFE_RELOCATE);
});

test('16 · resolveTurn pairs each alive coin with its result and drops dead ones', () => {
  const mine = coin(500, 'order', { owner: 0, core: 'released' });   // shooter's own coin
  const theirs = coin(500, 'xtreme', { owner: 1, core: 'released', ringUp: 'order' }); // OUT
  const dead = coin(9000, 'xtreme', { owner: 1, alive: false });
  const shooter = shot(9000); // owner 0

  const results = resolveTurn({
    coins: [mine, theirs, dead],
    shooter,
    inFieldFn: () => true,
  });

  assert.equal(results.length, 2);
  assert.deepEqual(results.find(r => r.coin === mine), { coin: mine, result: SAFE_RESET });
  assert.deepEqual(results.find(r => r.coin === theirs), { coin: theirs, result: OUT });
  assert.equal(results.find(r => r.coin === dead), undefined);
});

import { newMatch, takeShot, beginShot, finishShot, applyPlacement, PHASE } from '../engine/rules.js';
import { makeRng } from '../engine/rng.js';
import { C } from '../engine/constants.js';

const mk = () => newMatch({
  defs: [flat(5000), flat(5000)],
  sides: ['order', 'xtreme'],
  first: 0,
});

test('a new match starts the coins 301mm apart, switches on the x-axis', () => {
  const m = mk();
  const [a, b] = m.world.coins;
  assert.ok(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - C.START_SEPARATION) < 1e-6);
  assert.ok(Math.abs(Math.cos(a.theta) - 1) < 1e-9, 'p0 switch points +x');
  assert.ok(Math.abs(Math.cos(b.theta) + 1) < 1e-9, 'p1 switch points -x');
  assert.equal(m.phase, PHASE.AIM);
  assert.equal(m.turn, 0);
});

test('turn alternates after a shot that needs no placement', () => {
  const m = mk();
  takeShot(m, { coinIndex: 0, vx: 0, vy: 40 }, makeRng(1));  // a nudge that reaches nothing
  assert.equal(m.turn, 1);
  assert.equal(m.phase, PHASE.AIM);
});

test('a SAFE result queues a placement and blocks the turn until resolved', () => {
  const m = mk();
  // Force the state a shot would have produced: opponent released, not flipped, tie on OX.
  m.world.coins[1].core = 'released';
  const r = takeShot(m, { coinIndex: 0, vx: 0, vy: 1 }, makeRng(2));
  assert.ok(r.placements.length >= 1);
  assert.equal(m.phase, PHASE.PLACEMENT);
  assert.equal(m.turn, 0, 'turn must not pass while a placement is pending');

  applyPlacement(m, r.placements[0], { x: 500, y: 650, theta: 0 });
  assert.equal(m.phase, PHASE.AIM);
  assert.equal(m.turn, 1);
});

test('a placement re-sets the coin core', () => {
  const m = mk();
  m.world.coins[1].core = 'released';
  const r = takeShot(m, { coinIndex: 0, vx: 0, vy: 1 }, makeRng(3));
  applyPlacement(m, r.placements[0], { x: 500, y: 650, theta: 1.2 });
  assert.equal(m.world.coins[1].core, 'set');
  assert.equal(m.world.coins[1].theta, 1.2);
});

test('removing the opponent last coin ends the match', () => {
  const m = mk();
  m.world.coins[1].core = 'released';
  m.world.coins[1].ringUp = 'order';       // flipped → OUT
  const r = takeShot(m, { coinIndex: 0, vx: 0, vy: 1 }, makeRng(4));
  assert.equal(r.winner, 0);
  assert.equal(m.phase, PHASE.GAME_OVER);
});


test('SAFE_RESET placement origin is the position before the shot, not the resting point', () => {
  const m = mk();
  const target = m.world.coins[1];
  const original = { x: target.x, y: target.y };
  target.core = 'released';
  const shooter = beginShot(m, { coinIndex: 0, vx: 0, vy: 0 });
  target.x += 123;
  target.y += 45;
  const out = finishShot(m, shooter);
  const placement = out.placements.find(p => p.coin === target);
  assert.deepEqual(placement.origin, original);
});
