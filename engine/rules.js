// engine/rules.js
import { attackOX, defenceOX } from './coins.js';

export const OUT           = 'OUT';
export const SAFE_NONE     = 'SAFE_NONE';       // untouched; leave it alone
export const SAFE_RESET    = 'SAFE_RESET';      // original position, shooter picks facing
export const SAFE_RELOCATE = 'SAFE_RELOCATE';   // anywhere in-field ≥1 coin-width clear

// Ties favour the DEFENDER. Strictly greater-than — never >=.
export const oxBattle = (attack, defence) => (attack > defence ? OUT : SAFE_RESET);

const isFlipped = coin => coin.ringUp !== coin.side;

export function resolveCoin({ coin, shooter, isShooter, inField }) {
  if (isShooter) {
    // 自爆 — never an OX battle, in either direction.
    if (!inField) return OUT;
    if (isFlipped(coin)) return OUT;
    return coin.core === 'released' ? SAFE_RESET : SAFE_NONE;
  }

  // The core check MUST precede the flip check: the manual requires 解除 AND
  // flipped for an opponent's coin to be out. Spec §2.2.
  if (!inField) {
    if (coin.core === 'set') return SAFE_RELOCATE;
    if (isFlipped(coin)) return OUT;
    return oxBattle(attackOX(shooter), defenceOX(coin)) === OUT ? OUT : SAFE_RELOCATE;
  }
  if (coin.core === 'set') return SAFE_NONE;
  if (isFlipped(coin)) return OUT;
  return oxBattle(attackOX(shooter), defenceOX(coin));
}

export function resolveTurn({ coins, shooter, inFieldFn }) {
  return coins
    .filter(c => c.alive)
    .map(coin => ({
      coin,
      result: resolveCoin({
        coin,
        shooter,
        isShooter: coin.owner === shooter.owner,
        inField: inFieldFn(coin),
      }),
    }));
}

// engine/rules.js — match state machine (Task 8)
import { C } from './constants.js';
import { makeCoin } from './coins.js';
import { inField, simulate } from './physics.js';

export const PHASE = Object.freeze({ AIM: 'AIM', PLACEMENT: 'PLACEMENT', GAME_OVER: 'GAME_OVER' });

export function newMatch({ defs, sides, first }) {
  const cx = C.FIELD_W / 2, cy = C.FIELD_H / 2, half = C.START_SEPARATION / 2;
  // p0 sits at -y and faces +y, switch to its right (+x). p1 mirrors it.
  const coins = [
    makeCoin(defs[0], 0, sides[0], cx, cy - half, 0),
    makeCoin(defs[1], 1, sides[1], cx, cy + half, Math.PI),
  ];
  return { world: { coins, t: 0, restCount: 0, events: [] },
           turn: first, phase: PHASE.AIM, pendingPlacements: [], log: [], winner: null };
}

export function beginShot(match, { coinIndex, vx, vy }) {
  if (match.phase !== PHASE.AIM) throw new Error(`cannot shoot during ${match.phase}`);
  const shooter = match.world.coins[coinIndex];
  if (!shooter || !shooter.alive) throw new Error('invalid shooter coin');
  if (shooter.owner !== match.turn) throw new Error('can only shoot your own coin on your turn');

  match.world.events = [];
  match.world.t = 0;
  match.world.timedOut = false;
  // SAFE_RESET means the position at the beginning of this shot, not the
  // post-collision resting point. Keep that snapshot outside physics.
  match.shotOrigins = new Map(match.world.coins.map(c => [c, { x: c.x, y: c.y }]));
  match.activeShooter = shooter;
  shooter.vx = vx;
  shooter.vy = vy;
  shooter.restCount = 0;
  return shooter;
}

export function finishShot(match, shooter = match.activeShooter) {
  if (!shooter) throw new Error('no active shooter');
  const resolutions = resolveTurn({ coins: match.world.coins, shooter, inFieldFn: inField });
  const placements = [];

  for (const { coin, result } of resolutions) {
    match.log.push({ coin, result, attack: attackOX(shooter), defence: defenceOX(coin) });
    if (result === OUT) { coin.alive = false; continue; }
    if (result === SAFE_NONE) { continue; }
    const origin = match.shotOrigins?.get(coin) ?? { x: coin.x, y: coin.y };
    placements.push({ coin, kind: result, origin: { ...origin } });
  }

  const alive = o => match.world.coins.some(c => c.alive && c.owner === o);
  if (!alive(0) && !alive(1)) { match.phase = PHASE.GAME_OVER; match.winner = 'draw'; }
  else if (!alive(1)) { match.phase = PHASE.GAME_OVER; match.winner = 0; }
  else if (!alive(0)) { match.phase = PHASE.GAME_OVER; match.winner = 1; }
  else if (placements.length) {
    match.phase = PHASE.PLACEMENT;
    match.pendingPlacements = placements;
  } else {
    match.turn = 1 - match.turn;
    match.phase = PHASE.AIM;
  }

  match.activeShooter = null;
  match.shotOrigins = null;
  return { events: match.world.events, resolutions, placements, winner: match.winner };
}

export function takeShot(match, shot, rng) {
  const shooter = beginShot(match, shot);
  simulate(match.world, rng);
  return finishShot(match, shooter);
}

export function applyPlacement(match, placement, { x, y, theta }) {
  const c = placement.coin;
  c.x = placement.kind === SAFE_RESET ? placement.origin.x : x;
  c.y = placement.kind === SAFE_RESET ? placement.origin.y : y;
  c.theta = theta;
  c.core = 'set';
  c.vx = 0; c.vy = 0; c.omega = 0;
  match.pendingPlacements = match.pendingPlacements.filter(p => p !== placement);
  if (!match.pendingPlacements.length && match.phase === PHASE.PLACEMENT) {
    match.turn = 1 - match.turn;
    match.phase = PHASE.AIM;
  }
}

// Valid relocation target: in-field and ≥1 coin-width clear of every other live coin.
export const canRelocate = (match, moving, x, y) =>
  x >= 0 && x <= C.FIELD_W && y >= 0 && y <= C.FIELD_H &&
  match.world.coins.every(c =>
    !c.alive || c === moving || Math.hypot(c.x - x, c.y - y) >= 4 * C.COIN_RADIUS);
