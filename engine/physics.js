import { C, FLIP } from './constants.js';
import { other } from './coins.js';

const wrapPi = a => Math.atan2(Math.sin(a), Math.cos(a));

// The two リバースポット are centred on theta and theta+PI.
export function sectorHit(coin, normalAngle) {
  const d1 = Math.abs(wrapPi(normalAngle - coin.theta));
  const d2 = Math.abs(wrapPi(normalAngle - coin.theta - Math.PI));
  const dist = Math.min(d1, d2);
  return {
    inSector: dist <= C.SECTOR_HALF_ANGLE,
    squareness: Math.max(0, 1 - dist / C.SECTOR_HALF_ANGLE),
  };
}

export function flipProbability(squareness, impactSpeed) {
  const { min, ideal, max } = FLIP.forceBand;
  const span = impactSpeed < ideal ? ideal - min : max - ideal;
  const forceMiss = Math.min(1, Math.abs(impactSpeed - ideal) / (span || 1));
  const p = FLIP.base + FLIP.depthGain * squareness - FLIP.forcePenalty * forceMiss;
  return Math.min(FLIP.clamp[1], Math.max(FLIP.clamp[0], p));
}

// Evaluated for BOTH coins in a contact, each in its own local frame — which is
// how 自爆 by striking with your own reverse spot falls out without a special case.
function applyRelease(coin, normalAngle, impulse, world, rng) {
  if (coin.core !== 'set') return;
  if (impulse < C.RELEASE_IMPULSE_MIN) return;
  const { inSector, squareness } = sectorHit(coin, normalAngle);
  if (!inSector) return;

  coin.core = 'released';
  const flipped = rng() < flipProbability(squareness, impulse);
  if (flipped) coin.ringUp = other(coin.ringUp);
  world.events.push({ type: 'release', coin, flipped, squareness, impulse });
}

export const inField = c =>
  c.x >= 0 && c.x <= C.FIELD_W && c.y >= 0 && c.y <= C.FIELD_H;

export function atRest(world) {
  return world.coins.every(c => !c.alive || (c.vx === 0 && c.vy === 0));
}

const R2 = () => 2 * C.COIN_RADIUS;

// Earliest t in [0, dt] where centre distance equals 2r, or null.
export function sweptTOI(a, b, dt) {
  const px = b.x - a.x, py = b.y - a.y;
  const vx = b.vx - a.vx, vy = b.vy - a.vy;
  const r = R2();
  const A = vx * vx + vy * vy;
  if (A === 0) return null;
  const B = 2 * (px * vx + py * vy);
  const Cq = px * px + py * py - r * r;
  // Already overlapping: resolve now only if the pair is still closing (B < 0).
  // A separating overlapping pair (e.g. the instant after a collision resolves,
  // or an unrelated pair drifting apart) must return null — otherwise its
  // t=0 always wins the outer loop's earliest-collision search and starves
  // any genuine collision elsewhere in the same step.
  if (Cq < 0) return B < 0 ? 0 : null;
  const disc = B * B - 4 * A * Cq;
  if (disc < 0) return null;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= dt ? t : null;
}

function advance(coins, dt) {
  for (const c of coins) {
    if (!c.alive) continue;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    c.theta += c.omega * dt;
  }
}

function collide(a, b, world, rng) {
  const nx0 = b.x - a.x, ny0 = b.y - a.y;
  const d = Math.hypot(nx0, ny0) || 1;
  const nx = nx0 / d, ny = ny0 / d;

  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn > 0) return null;               // already separating

  // Equal mass, equal radius: the normal components simply swap, scaled by restitution.
  const j = -(1 + C.RESTITUTION) * vn / 2;
  a.vx -= j * nx; a.vy -= j * ny;
  b.vx += j * nx; b.vy += j * ny;

  // Tangential relative motion becomes spin on both coins.
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  a.omega -= C.SPIN_COUPLING * vt / C.COIN_RADIUS;
  b.omega += C.SPIN_COUPLING * vt / C.COIN_RADIUS;

  // CORRECTION A: an applied impulse resets each coin's rest-hysteresis counter.
  a.restCount = 0;
  b.restCount = 0;

  const event = { type: 'contact', a, b, normal: { x: nx, y: ny }, impulse: Math.abs(vn) };
  world.events.push(event);

  const angAtoB = Math.atan2(ny, nx);
  applyRelease(a, angAtoB, event.impulse, world, rng);              // a is struck on its +n side
  applyRelease(b, angAtoB + Math.PI, event.impulse, world, rng);    // b is struck from the opposite side
  return event;
}

export function stepWorld(world, rng) {
  let remaining = C.DT;
  const live = () => world.coins.filter(c => c.alive);

  for (let guard = 0; guard < C.MAX_COLLISIONS_PER_STEP && remaining > 0; guard++) {
    const cs = live();
    let best = null;
    for (let i = 0; i < cs.length; i++) {
      for (let k = i + 1; k < cs.length; k++) {
        const t = sweptTOI(cs[i], cs[k], remaining);
        if (t !== null && (best === null || t < best.t)) best = { t, a: cs[i], b: cs[k] };
      }
    }
    if (!best) break;
    advance(cs, best.t);
    remaining -= best.t;
    collide(best.a, best.b, world, rng);   // Task 7 hooks release detection in here
  }

  advance(live(), remaining);

  const decay = Math.exp(-C.FRICTION_K * C.DT);
  const spinDecay = Math.exp(-C.OMEGA_FRICTION_K * C.DT);
  for (const c of live()) {
    c.vx *= decay; c.vy *= decay; c.omega *= spinDecay;
    // CORRECTION A: REST_FRAMES hysteresis — only clamp after REST_FRAMES
    // consecutive sub-threshold steps, not on the first one.
    c.restCount ??= 0;
    if (Math.hypot(c.vx, c.vy) < C.REST_SPEED) {
      c.restCount++;
      if (c.restCount >= C.REST_FRAMES) {
        c.vx = 0; c.vy = 0; c.omega = 0; c.restCount = 0;
      }
    } else {
      c.restCount = 0;
    }
  }
  world.t += C.DT;
}

export function simulate(world, rng) {
  world.timedOut = false;
  while (!atRest(world) && world.t < C.MAX_SIM_SECONDS) stepWorld(world, rng);
  // CORRECTION B: record whether the safety valve tripped before forcing rest.
  world.timedOut = world.t >= C.MAX_SIM_SECONDS && !atRest(world);
  for (const c of world.coins) { c.vx = 0; c.vy = 0; c.omega = 0; }
  return world;
}
