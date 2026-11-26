// Sky Harbour — Island Run: every tunable number for the game lives here, so a
// balance change is one edit in one place and nothing else has to move.
export const GAME = {
  title: 'SKY HARBOUR',
  subtitle: 'Island Run',
  version: '1.0.0',
};

export const VIEW = {
  width: 1280,
  height: 720,
  focal: 790, // focal length in pixels for the chase-camera projection
  cameraBack: 17, // metres behind the aircraft
  cameraUp: 5.2, // metres above the aircraft
  cameraLookAhead: 34, // metres ahead of the aircraft the camera looks at
};

export const PLANE = {
  cruiseSpeed: 58, // m/s at 70% throttle, level flight
  maxSpeed: 96,
  stallSpeed: 27, // below this the wing stops flying
  minThrottle: 0,
  maxThrottle: 100,
  accel: 14, // m/s^2 toward the throttle's target speed
  climbRate: 13, // m/s at full up elevator
  sinkRate: 16, // m/s at full down elevator
  bankRate: 1.9, // rad/s the pilot can roll
  maxBank: 1.05, // rad (~60 deg)
  turnFactor: 0.62, // heading change per second per radian of bank, scaled by speed
  fuelCapacity: 100,
  fuelBurn: 0.28, // units per second at 70% throttle — a full tank flies ~6 min
  fuelRingBonus: 6, // fuel a flown ring gives back
  maxDamage: 100,
  gearSpeed: 34, // below this the gear is down and the plane can land
  landingSpeedMax: 40, // touchdown above this on a runway is a crash
  landingSinkMax: 4.5, // m/s of descent a landing may carry
  roughSinkMax: 3.0, // m/s a rough field landing may carry
  ringRadius: 13, // metres, golden rings
  ringScore: 500,
  starScore: 150,
  landingScore: 1000,
  smoothBonus: 400, // extra for a gentle touchdown
  timeBonusRate: 4, // points per second left on the clock, Ring Run
};

export const WORLD = {
  seed: 7,
  size: 4200, // the archipelago is size x size metres
  islandCount: 8,
  cloudCount: 26,
  starCount: 14,
  ringCount: 8,
  hopRunways: 3,
};

export const MISSIONS = [
  {
    id: 'rings',
    key: '1',
    name: 'RING RUN',
    tag: 'Fly all 8 golden rings, then land home',
    timeLimit: 480,
  },
  {
    id: 'hop',
    key: '2',
    name: 'ISLAND HOP',
    tag: 'Land on 3 island runways in order',
    timeLimit: 420,
  },
  {
    id: 'free',
    key: '3',
    name: 'FREE FLIGHT',
    tag: 'Explore the archipelago, collect stars',
    timeLimit: 360,
  },
];

export const STEP = 1 / 60; // fixed physics step, seconds

// Colours: one dusk palette for sky, sea and land so the whole game reads as
// one place, not a set of mismatched drawings.
export const PALETTE = {
  skyTop: '#1e3a5f',
  skyMid: '#7fb2d9',
  skyLow: '#f6c98a',
  sunCore: '#fff3c4',
  sunGlow: 'rgba(255, 196, 110, 0.55)',
  seaFar: '#3f6d8e',
  seaNear: '#1d4a68',
  seaGlitter: 'rgba(255, 236, 180, 0.35)',
  sand: '#e8d29a',
  grassFar: '#5d8a4a',
  grass: '#4d7a3e',
  grassNear: '#3e6b34',
  rock: '#6b6f66',
  forest: '#2e5230',
  runway: '#3a3f45',
  runwayEdge: '#e8e8e8',
  ringGold: '#ffc93c',
  ringGlow: 'rgba(255, 201, 60, 0.45)',
  hudGlass: 'rgba(8, 18, 30, 0.72)',
  hudLine: 'rgba(140, 220, 255, 0.85)',
  hudText: '#cfeeff',
  hudAmber: '#ffcf5e',
  hudRed: '#ff6b5e',
  hudGreen: '#7dff9a',
};
