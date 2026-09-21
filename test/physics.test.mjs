// test/physics.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../engine/rng.js';
import { C, FLIP } from '../engine/constants.js';
import { makeCoin } from '../engine/coins.js';
import { inField, simulate, atRest } from '../engine/physics.js';

test('rng is deterministic for a given seed', () => {
  const a = makeRng(12345), b = makeRng(12345);
  const seqA = Array.from({ length: 50 }, a);
  const seqB = Array.from({ length: 50 }, b);
  assert.deepEqual(seqA, seqB);
});

test('rng differs across seeds and stays in range', () => {
  const a = makeRng(1), b = makeRng(2);
  assert.notEqual(a(), b());
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
});

test('max shot speed equals the top of the flip force band', () => {
  // Deliberate coupling: the hardest possible flick is also the least reliable.
  assert.equal(C.MAX_SHOT_SPEED, FLIP.forceBand.max);
});

const def = ox => ({ id: `p${ox}`, name: `P${ox}`, variants: [], rarity: 'R', set: 'synthetic',
  mainSide: 'order', faces: { order: { label: 'a', ox }, xtreme: { label: 'b', ox } } });
const world = (...coins) => ({ coins, t: 0, restCount: 0, events: [] });

test('a coin inside the field is in bounds, outside is not', () => {
  assert.equal(inField(makeCoin(def(1), 0, 'order', 500, 500, 0)), true);
  assert.equal(inField(makeCoin(def(1), 0, 'order', -5, 500, 0)), false);
  assert.equal(inField(makeCoin(def(1), 0, 'order', 500, C.FIELD_H + 1, 0)), false);
});

test('friction brings a moving coin to rest within MAX_SIM_SECONDS', () => {
  const c = makeCoin(def(1), 0, 'order', 100, 500, 0);
  c.vx = C.MAX_SHOT_SPEED;
  const w = world(c);
  simulate(w, makeRng(1));
  assert.ok(atRest(w), 'world should come to rest');
  assert.ok(w.t < C.MAX_SIM_SECONDS, `took ${w.t}s`);
  assert.equal(c.vx, 0);
});

test('a harder shot travels further than a softer one', () => {
  const run = speed => {
    const c = makeCoin(def(1), 0, 'order', 100, 500, 0);
    c.vx = speed;
    const w = world(c);
    simulate(w, makeRng(1));
    return c.x - 100;
  };
  assert.ok(run(3000) > run(1000));
});

test('same seed and same shot produce an identical end state', () => {
  const run = () => {
    const a = makeCoin(def(1), 0, 'order', 300, 500, 0);
    const b = makeCoin(def(1), 1, 'xtreme', 601, 500, 0);
    a.vx = 2600;
    const w = world(a, b);
    simulate(w, makeRng(99));
    return w.coins.map(c => [c.x, c.y, c.theta, c.core]);
  };
  assert.deepEqual(run(), run());
});

// --- Task 6: swept collision, impulse, spin ---
import { sweptTOI, stepWorld } from '../engine/physics.js';

test('a head-on shot transfers momentum to the struck coin', () => {
  const a = makeCoin(def(1), 0, 'order', 300, 500, 0);
  const b = makeCoin(def(1), 1, 'xtreme', 500, 500, 0);
  a.vx = 2600;
  const w = world(a, b);
  simulate(w, makeRng(3));
  assert.ok(b.x > 500, 'struck coin should be pushed along +x');
  assert.ok(a.x < b.x, 'shooter should end up behind the struck coin');
});

test('a full-power shot does not tunnel through a coin one diameter away', () => {
  const a = makeCoin(def(1), 0, 'order', 400, 500, 0);
  const b = makeCoin(def(1), 1, 'xtreme', 400 + 2 * C.COIN_RADIUS + 1, 500, 0);
  a.vx = C.MAX_SHOT_SPEED;
  const w = world(a, b);
  simulate(w, makeRng(4));
  assert.ok(w.events.some(e => e.type === 'contact'), 'contact must be detected');
  assert.ok(b.x > a.x, 'no pass-through');
});

test('sweptTOI finds the contact instant for a closing pair', () => {
  const a = { x: 0, y: 0, vx: 1000, vy: 0 };
  const b = { x: 200, y: 0, vx: 0, vy: 0 };
  const t = sweptTOI(a, b, 1);
  // gap closes from 200mm to 43mm at 1000 mm/s → 0.157 s
  assert.ok(Math.abs(t - (200 - 2 * C.COIN_RADIUS) / 1000) < 1e-9);
});

test('sweptTOI returns null for a separating pair', () => {
  const a = { x: 0, y: 0, vx: -1000, vy: 0 };
  const b = { x: 200, y: 0, vx: 0, vy: 0 };
  assert.equal(sweptTOI(a, b, 1), null);
});

test('an off-centre hit imparts spin to both coins', () => {
  const a = makeCoin(def(1), 0, 'order', 300, 480, 0);
  const b = makeCoin(def(1), 1, 'xtreme', 500, 500, 0);
  a.vx = 2600;
  const w = world(a, b);
  simulate(w, makeRng(5));
  assert.ok(a.theta !== 0 || b.theta !== 0, 'off-centre contact should rotate a coin');
});

test('REST_FRAMES hysteresis: coin is not clamped on first sub-threshold step, but is after REST_FRAMES consecutive ones', () => {
  const c = makeCoin(def(1), 0, 'order', 500, 500, 0);
  c.vx = C.REST_SPEED - 1;
  const w = world(c);
  stepWorld(w, makeRng(6));
  assert.notEqual(c.vx, 0, 'must not clamp on the first sub-threshold step');
  for (let i = 0; i < C.REST_FRAMES - 1; i++) stepWorld(w, makeRng(6));
  assert.equal(c.vx, 0, 'must clamp once REST_FRAMES consecutive sub-threshold steps have elapsed');
});

// --- Task 6 fix round 1: separating-pair starvation + impulse-reset coverage ---

test('a separating overlapping pair does not starve a genuine collision in the same step', () => {
  const a = makeCoin(def(1), 0, 'order', 452, 500, 0);
  const b = makeCoin(def(1), 1, 'xtreme', 500, 500, 0);
  const c = makeCoin(def(1), 2, 'order', 520, 500, 0);
  a.vx = 2600;
  c.vx = 100; // b and c already overlap (20mm apart, 2r=43) but c is moving away from b
  const w = world(a, b, c);
  stepWorld(w, makeRng(8));
  assert.ok(
    w.events.some(e => e.type === 'contact' && (e.a === a || e.b === a) && (e.a === b || e.b === b)),
    'a-b contact must be detected within this step, not starved by the dead b-c pair'
  );
});

test('an impulse resets a struck coin\'s rest hysteresis counter immediately', () => {
  const a = makeCoin(def(1), 0, 'order', 300, 500, 0);
  const b = makeCoin(def(1), 1, 'xtreme', 500, 500, 0);
  a.vx = 2600;
  b.restCount = C.REST_FRAMES; // b was already at the clamp threshold before impact
  const w = world(a, b);
  let contactEvent = null;
  for (let i = 0; i < 2000 && !contactEvent; i++) {
    stepWorld(w, makeRng(9));
    contactEvent = w.events.find(e => e.type === 'contact');
  }
  assert.ok(contactEvent, 'expected a contact between a and b');
  assert.equal(b.restCount, 0, 'impulse must reset restCount immediately');
  assert.notEqual(b.vx, 0, 'b should be moving after impact');
});

// --- Task 7: リバースポット sectors, deterministic release, weighted flip ---
import { sectorHit, flipProbability } from '../engine/physics.js';

test('a hit dead on the switch is fully square', () => {
  const c = makeCoin(def(1), 0, 'order', 500, 500, 0);   // switch points +x (theta = 0)
  const h = sectorHit(c, 0);                              // contact normal along +x
  assert.equal(h.inSector, true);
  assert.ok(Math.abs(h.squareness - 1) < 1e-9);
});

test('the point opposite the switch is also a reverse spot', () => {
  const c = makeCoin(def(1), 0, 'order', 500, 500, 0);
  const h = sectorHit(c, Math.PI);
  assert.equal(h.inSector, true);
  assert.ok(Math.abs(h.squareness - 1) < 1e-9);
});

test('front and back are armoured at any angle within them', () => {
  const c = makeCoin(def(1), 0, 'order', 500, 500, 0);
  for (const a of [Math.PI / 2, -Math.PI / 2, Math.PI / 2 + 0.3]) {
    assert.equal(sectorHit(c, a).inSector, false, `angle ${a}`);
  }
});

test('squareness falls to zero at the sector edge', () => {
  const c = makeCoin(def(1), 0, 'order', 500, 500, 0);
  const h = sectorHit(c, C.SECTOR_HALF_ANGLE);
  assert.equal(h.inSector, true);
  assert.ok(h.squareness < 1e-9);
});

test('flip probability rewards a square hit and stays clamped', () => {
  const square = flipProbability(1, FLIP.forceBand.ideal);
  const glancing = flipProbability(0, FLIP.forceBand.ideal);
  assert.ok(square > glancing);
  for (const s of [0, 0.5, 1]) {
    for (const v of [0, 500, 2200, 9000]) {
      const p = flipProbability(s, v);
      assert.ok(p >= FLIP.clamp[0] && p <= FLIP.clamp[1], `p=${p}`);
    }
  }
});

// CORRECTION 1 (task-7-report.md): the brief's fixture used theta = PI/2 for the
// target coin, which puts both reverse spots at TOP/BOTTOM — a strike from -y then
// lands dead on a sector and SHOULD release, contradicting the intended assertion.
// Using theta = 0 puts the sectors at the LEFT/RIGHT flanks; a strike from -y hits
// the armoured face at angle -PI/2, which is 90° from the nearest sector centre —
// well outside the 40° half-angle — so the core correctly stays 'set'.
test('a hit on the armoured face never releases, at any speed', () => {
  const a = makeCoin(def(1), 0, 'order', 500, 300, 0);
  const b = makeCoin(def(1), 1, 'xtreme', 500, 500, 0); // switch points +x → armour faces +/-y
  a.vy = C.MAX_SHOT_SPEED;
  const w = world(a, b);
  simulate(w, makeRng(11));
  assert.equal(b.core, 'set', 'armoured hit must not release the core');
});

test('a square hit above the impulse threshold always releases', () => {
  const a = makeCoin(def(1), 0, 'order', 300, 500, 0);
  const b = makeCoin(def(1), 1, 'xtreme', 500, 500, 0);          // switch points +x → -x is a reverse spot
  a.vx = 3000;
  const w = world(a, b);
  simulate(w, makeRng(12));
  assert.equal(b.core, 'released');
  assert.ok(w.events.some(e => e.type === 'release' && e.coin === b));
});
