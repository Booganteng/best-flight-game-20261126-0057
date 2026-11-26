// The archipelago: a seeded set of islands, each with a beach, green hills, a
// few palms and (on three of them) a runway. The same seed always builds the
// same islands, so a mission and a screenshot can be replayed exactly.
import { mulberry32, range, clamp } from './random.js';
import { WORLD } from './config.js';

function smooth(t) {
  return t * t * (3 - 2 * t);
}

export function buildWorld(seed) {
  const rng = mulberry32(seed);
  const half = WORLD.size / 2;
  const islands = [];

  // Home island, dead centre, with the home runway pointing north.
  islands.push({
    name: 'Harbour',
    x: 0,
    z: 0,
    r: 420,
    h: 46,
    runway: { heading: 0, length: 340, width: 26 },
    palms: 26,
  });

  // The other islands, kept clear of home and of each other.
  const spots = [
    { x: -1150, z: -900, r: 330, h: 78 },
    { x: 1050, z: -1150, r: 300, h: 96 },
    { x: 1250, z: 700, r: 360, h: 60 },
    { x: -1250, z: 950, r: 280, h: 110 },
    { x: -350, z: -1650, r: 260, h: 70 },
    { x: 550, z: 1650, r: 300, h: 84 },
    { x: -1650, z: -250, r: 240, h: 58 },
  ];
  for (const spot of spots) {
    islands.push({
      name: spot.x < 0 ? 'West' : 'East',
      x: spot.x + range(rng, -60, 60),
      z: spot.z + range(rng, -60, 60),
      r: spot.r,
      h: spot.h,
      runway: null,
      palms: Math.floor(range(rng, 10, 22)),
    });
  }

  // Runways on the two hop islands: one east, one north-west.
  islands[3].runway = { heading: 1.35, length: 300, width: 24 };
  islands[4].runway = { heading: -0.6, length: 300, width: 24 };
  islands[1].name = 'Coral';
  islands[2].name = 'Palm';
  islands[3].name = 'Beacon';
  islands[4].name = 'Gull';
  islands[5].name = 'Turtle';
  islands[6].name = 'Drift';
  islands[7].name = 'Reef';

  // Palm positions per island, placed on the grass ring.
  for (const island of islands) {
    const prng = mulberry32(seed + Math.floor(island.x) + Math.floor(island.z));
    island.palmSpots = [];
    for (let i = 0; i < island.palms; i += 1) {
      const a = prng() * Math.PI * 2;
      const d = island.r * (0.35 + prng() * 0.5);
      island.palmSpots.push({ dx: Math.cos(a) * d, dz: Math.sin(a) * d, s: 0.7 + prng() * 0.7 });
    }
  }

  // Clouds drift slowly west to east, high above the sea.
  const clouds = [];
  for (let i = 0; i < WORLD.cloudCount; i += 1) {
    clouds.push({
      x: range(rng, -half, half),
      y: range(rng, 150, 320),
      z: range(rng, -half, half),
      s: range(rng, 26, 64),
      drift: range(rng, 1.5, 4),
    });
  }

  const world = { seed, islands, clouds, half };

  // Ground height at (x, z): the tallest island mound under the point, else sea.
  world.groundHeight = (x, z) => {
    let h = 0;
    for (const island of islands) {
      const dx = x - island.x;
      const dz = z - island.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < island.r) {
        const t = 1 - d / island.r;
        const mound = island.h * smooth(t);
        // Flatten the top where a runway sits so the strip is level, and keep
        // the approach corridor level too: a glide slope that meets a rising
        // hillside is a crash, not a landing.
        if (island.runway) {
          const along = Math.abs(dx * Math.sin(island.runway.heading) + dz * Math.cos(island.runway.heading));
          const across = Math.abs(dx * Math.cos(island.runway.heading) - dz * Math.sin(island.runway.heading));
          if (along < island.runway.length / 2 + 320 && across < island.runway.width / 2 + 60) {
            h = Math.max(h, Math.min(mound, 6));
            continue;
          }
        }
        h = Math.max(h, mound);
      }
    }
    return h;
  };

  // True when (x, z) is on a runway strip (within the strip, near the ground).
  world.runwayAt = (x, z) => {
    for (const island of islands) {
      if (!island.runway) continue;
      const dx = x - island.x;
      const dz = z - island.z;
      const along = dx * Math.sin(island.runway.heading) + dz * Math.cos(island.runway.heading);
      const across = dx * Math.cos(island.runway.heading) - dz * Math.sin(island.runway.heading);
      if (Math.abs(along) < island.runway.length / 2 && Math.abs(across) < island.runway.width / 2) {
        return { island, along, across };
      }
    }
    return null;
  };

  world.home = islands[0];
  return world;
}

// Bright daylight sun, high in the sky (Flight Sim 2018 look).
export const SUN = { azimuth: -2.25, elevation: 0.85 };
