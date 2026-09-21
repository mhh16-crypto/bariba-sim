// engine/constants.js  —  spec §8.5. Every tunable in the project lives here.
export const C = {
  COIN_RADIUS:             21.5,   // mm — measured, 43 mm diameter
  FIELD_W:                 1000,   // mm
  FIELD_H:                 1000,   // mm
  START_SEPARATION:        301,    // mm centre-to-centre = 7 diameters
  DT:                      1 / 240,// s — fixed timestep
  FRICTION_K:              2.6,    // 1/s
  OMEGA_FRICTION_K:        4.0,    // 1/s
  REST_SPEED:              8,      // mm/s
  REST_FRAMES:             12,     // steps
  MAX_SIM_SECONDS:         8,      // s — safety valve
  RESTITUTION:             0.85,
  SPIN_COUPLING:           0.25,
  MAX_COLLISIONS_PER_STEP: 8,
  MAX_SHOT_SPEED:          5200,   // mm/s
  RELEASE_IMPULSE_MIN:     260,    // mm/s normal impulse to trip the core
  SECTOR_HALF_ANGLE:       40 * Math.PI / 180,  // rad
  SHOOTER_USES_SET_FACE:   true,   // rules gap — spec §3.3
};

export const FLIP = {
  base:         0.50,
  depthGain:    0.22,
  forceBand:    { min: 900, ideal: 2200, max: 5200 },
  forcePenalty: 0.18,
  clamp:        [0.15, 0.85],
};
