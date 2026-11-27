// SKY HARBOUR: AIRPLANE RUN — tuning, environments, planes, missions.
// All values are mine, written fresh for this entry.

export const GAME = {
  title: 'SKY HARBOUR: AIRPLANE RUN',
  // Flight envelope (world units, seconds).
  baseSpeed: 26,
  maxSpeed: 78,
  speedRamp: 0.55, // +units/s of speed per second survived
  turboSpeed: 34, // extra speed while turbo held
  turboDrain: 26, // turbo meter per second
  turboRegen: 7,
  lateralRange: 16, // how far left/right the plane can steer
  verticalMin: 3,
  verticalMax: 30,
  lateralSpeed: 26,
  verticalSpeed: 20,
  // Survival.
  maxFuel: 100,
  fuelDrain: 1.35, // per second
  fuelPickup: 34,
  maxHealth: 3,
  // Scoring.
  coinScore: 25,
  ringScore: 100,
  crystalScore: 150,
  // Difficulty.
  obstacleGapStart: 46,
  obstacleGapMin: 24,
  ringEveryM: 260,
  coinRunEveryM: 180,
};

// Seven skies the flight cycles through, one every ~700 m.
export const ENVIRONMENTS = [
  {
    name: 'Tropical Island',
    sky: 0x8ecfeb, fog: 0xaadcf0, sun: 0xfff2c0, sunPos: [40, 60, -80],
    ground: 0x2fa36b, groundKind: 'islands', cloud: 0xffffff, ambient: 0xbfd9e8,
  },
  {
    name: 'Sky City',
    sky: 0x9fc4e8, fog: 0xb8cfe0, sun: 0xffffff, sunPos: [30, 80, -60],
    ground: 0x5b6b7a, groundKind: 'city', cloud: 0xf2f6fa, ambient: 0xc3d2de,
  },
  {
    name: 'Snowy Mountains',
    sky: 0xbcd7f0, fog: 0xcfe2f5, sun: 0xfff6dd, sunPos: [-50, 70, -70],
    ground: 0xdde6ef, groundKind: 'peaks', cloud: 0xffffff, ambient: 0xd7e6f2,
  },
  {
    name: 'Desert Airspace',
    sky: 0xf7cf8e, fog: 0xf2c98f, sun: 0xffd27a, sunPos: [60, 45, -40],
    ground: 0xd9a45b, groundKind: 'dunes', cloud: 0xfff3dd, ambient: 0xe8c48f,
  },
  {
    name: 'Ocean World',
    sky: 0x6fb7e8, fog: 0x8fc6ea, sun: 0xfff8d0, sunPos: [20, 90, -50],
    ground: 0x1e6f9e, groundKind: 'ocean', cloud: 0xffffff, ambient: 0xa8c8e0,
  },
  {
    name: 'Storm Zone',
    sky: 0x5a5f6e, fog: 0x6a7080, sun: 0xcfd6e6, sunPos: [-30, 90, -30],
    ground: 0x3d4454, groundKind: 'peaks', cloud: 0x8b93a5, ambient: 0x77808f,
    storm: true,
  },
  {
    name: 'Sunset Paradise',
    sky: 0xf2a06b, fog: 0xe89a7a, sun: 0xff9a4d, sunPos: [0, 22, -120],
    ground: 0x7a4a6e, groundKind: 'islands', cloud: 0xffd9c2, ambient: 0xe0a37e,
  },
];

// Flyable planes. price 0 = owned from the start.
export const PLANES = [
  {
    id: 'prop', name: 'Skyhopper', kind: 'prop', price: 0,
    color: 0xe8442e, accent: 0xffffff, speed: 1.0, handling: 1.0,
    desc: 'Pesawat baling-baling kecil yang lincah.',
  },
  {
    id: 'stunt', name: 'Loopwing', kind: 'stunt', price: 300,
    color: 0x2e7fe8, accent: 0xffd23e, speed: 1.05, handling: 1.25,
    desc: 'Biplane akrobatik, belok paling tajam.',
  },
  {
    id: 'jet', name: 'Cloudliner', kind: 'jet', price: 900,
    color: 0xe8e8ec, accent: 0x2e7fe8, speed: 1.2, handling: 0.95,
    desc: 'Jet pribadi yang cepat dan stabil.',
  },
  {
    id: 'future', name: 'Starhawk X', kind: 'future', price: 2000,
    color: 0x23232e, accent: 0x37e6c8, speed: 1.35, handling: 1.1,
    desc: 'Jet futuristik tercepat di langit.',
  },
];

// Missions: id, text, target, reward coins.
export const MISSIONS = [
  { id: 'd500', text: 'Terbang sejauh 500 m', target: 500, stat: 'distance', reward: 50 },
  { id: 'd2000', text: 'Terbang sejauh 2.000 m', target: 2000, stat: 'distance', reward: 150 },
  { id: 'd5000', text: 'Terbang sejauh 5.000 m', target: 5000, stat: 'distance', reward: 400 },
  { id: 'r5', text: 'Lewati 5 cincin udara', target: 5, stat: 'rings', reward: 100 },
  { id: 'r15', text: 'Lewati 15 cincin udara', target: 15, stat: 'rings', reward: 250 },
  { id: 'c20', text: 'Kumpulkan 20 koin', target: 20, stat: 'coins', reward: 80 },
  { id: 'c60', text: 'Kumpulkan 60 koin', target: 60, stat: 'coins', reward: 200 },
  { id: 's60', text: 'Bertahan 60 detik tanpa menabrak', target: 60, stat: 'cleanTime', reward: 150 },
  { id: 's180', text: 'Bertahan 180 detik tanpa menabrak', target: 180, stat: 'cleanTime', reward: 350 },
];

// Quality presets: pixel ratio cap, shadows, clouds, view distance.
export const QUALITY = {
  low: { pixelRatio: 1, shadows: false, clouds: 14, far: 420 },
  medium: { pixelRatio: 1.5, shadows: false, clouds: 22, far: 560 },
  high: { pixelRatio: 2, shadows: true, clouds: 30, far: 700 },
  ultra: { pixelRatio: 2.5, shadows: true, clouds: 42, far: 900 },
};

export const STORE_KEYS = {
  coins: 'sh_coins',
  best: 'sh_best',
  planes: 'sh_planes',
  plane: 'sh_plane',
  missions: 'sh_missions',
  quality: 'sh_quality',
  muted: 'sh_muted',
  board: 'sh_board',
  daily: 'sh_daily',
};
