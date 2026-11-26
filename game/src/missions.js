// Missions: what a sortie asks of the pilot. Each mission places its own
// goals in the world — golden rings, runway landings, floating stars — and
// scores them. The pilot picks one on the title screen.
import { mulberry32, range, clamp, angleDelta } from './random.js';
import { WORLD, PLANE } from './config.js';

function ringPath(world, rng) {
  // A tour of the archipelago: rings strung between islands at flying height.
  const order = [1, 5, 2, 6, 3, 7, 4, 0];
  const rings = [];
  for (let i = 0; i < WORLD.ringCount; i += 1) {
    const island = world.islands[order[i % order.length]];
    const a = rng() * Math.PI * 2;
    const d = island.r + range(rng, 120, 320);
    // Keep every ring well inside the chart — a ring past the edge can never
    // be flown and strands the pilot on the boundary.
    const margin = world.half - 160;
    rings.push({
      x: clamp(island.x + Math.cos(a) * d, -margin, margin),
      y: range(rng, 70, 150),
      z: clamp(island.z + Math.sin(a) * d, -margin, margin),
      r: PLANE.ringRadius,
      passed: false,
      index: i,
    });
  }
  return rings;
}

function hopList(world) {
  // Land on Beacon, then Gull, then home — the three runways in order.
  return [world.islands[3], world.islands[4], world.islands[0]];
}

function starField(world, rng) {
  const stars = [];
  for (let i = 0; i < WORLD.starCount; i += 1) {
    const island = world.islands[Math.floor(rng() * world.islands.length)];
    const a = rng() * Math.PI * 2;
    const d = island.r + range(rng, 60, 420);
    const margin = world.half - 160;
    stars.push({
      x: clamp(island.x + Math.cos(a) * d, -margin, margin),
      y: range(rng, 60, 170),
      z: clamp(island.z + Math.sin(a) * d, -margin, margin),
      r: 9,
      taken: false,
    });
  }
  return stars;
}

export function createMission(id, world) {
  const rng = mulberry32(world.seed + id.length * 977);
  const base = { id, score: 0, ringsPassed: 0, landings: 0, starsCollected: 0, done: false, failed: false, failReason: '' };
  if (id === 'rings') {
    return { ...base, name: 'RING RUN', rings: ringPath(world, rng), target: WORLD.ringCount, timeLeft: 480, homeIsland: world.home };
  }
  if (id === 'hop') {
    const legs = hopList(world);
    return { ...base, name: 'ISLAND HOP', legs, legIndex: 0, target: legs.length, timeLeft: 420 };
  }
  return { ...base, name: 'FREE FLIGHT', starList: starField(world, rng), target: WORLD.starCount, timeLeft: 360 };
}

// The next thing the pilot should fly toward, for the HUD arrow and the autopilot.
export function currentTarget(mission, world) {
  if (mission.id === 'rings') {
    const next = mission.rings.find((r) => !r.passed);
    if (next) return { x: next.x, y: next.y, z: next.z, label: `RING ${mission.ringsPassed + 1}/${mission.rings.length}`, kind: 'ring' };
    return { x: world.home.x, y: 40, z: world.home.z, label: 'LAND AT HARBOUR', kind: 'runway' };
  }
  if (mission.id === 'hop') {
    const island = mission.legs[mission.legIndex];
    if (!island) return null;
    return { x: island.x, y: 30, z: island.z, label: `LAND: ${island.name.toUpperCase()} ${mission.legIndex + 1}/${mission.legs.length}`, kind: 'runway' };
  }
  const next = mission.starList.find((s) => !s.taken);
  if (next) return { x: next.x, y: next.y, z: next.z, label: `STAR ${mission.starsCollected + 1}/${mission.starList.length}`, kind: 'star' };
  return null;
}

// Score a frame: rings passed, stars collected, landings. Returns event strings.
export function stepMission(mission, plane, world, dt, prev) {
  const events = [];
  mission.timeLeft -= dt;
  if (mission.timeLeft <= 0 && !mission.done && !mission.failed) {
    mission.failed = true;
    mission.failReason = 'Out of time';
    events.push('time-up');
    return events;
  }

  if (mission.id === 'rings') {
    for (const ring of mission.rings) {
      if (ring.passed) continue;
      const dx = plane.x - ring.x;
      const dy = plane.y - ring.y;
      const dz = plane.z - ring.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      // Crossing the ring plane close to its centre counts; clipping the rim hurts.
      // wasAhead/nowAhead are the signed distance along the heading from the
      // ring to the plane: negative while approaching, positive once past it.
      const prevDx = prev.x - ring.x;
      const prevDz = prev.z - ring.z;
      const wasAhead = prevDx * Math.sin(plane.heading) + prevDz * Math.cos(plane.heading);
      const nowAhead = dx * Math.sin(plane.heading) + dz * Math.cos(plane.heading);
      if (wasAhead < 0 && nowAhead >= 0 && dist < ring.r + 26) {
        if (dist < ring.r * 0.85) {
          ring.passed = true;
          mission.ringsPassed += 1;
          mission.score += PLANE.ringScore;
          plane.fuel = Math.min(PLANE.fuelCapacity, plane.fuel + PLANE.fuelRingBonus);
          events.push('ring');
        } else {
          plane.damage = Math.min(PLANE.maxDamage, plane.damage + 18);
          events.push('ring-clip');
        }
      }
    }
    if (mission.ringsPassed === mission.rings.length && !mission.done) {
      mission.allRings = true;
    }
  }

  if (mission.id === 'free') {
    for (const star of mission.starList) {
      if (star.taken) continue;
      const dx = plane.x - star.x;
      const dy = plane.y - star.y;
      const dz = plane.z - star.z;
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 16) {
        star.taken = true;
        mission.starsCollected += 1;
        mission.score += PLANE.starScore;
        events.push('star');
      }
    }
    if (mission.starsCollected === mission.target && !mission.done) {
      mission.done = true;
      mission.score += Math.round(mission.timeLeft) * PLANE.timeBonusRate;
      events.push('complete');
    }
  }

  if (mission.id === 'hop' && mission.legIndex < mission.legs.length) {
    // Landings are scored by the caller (it knows the runway); see onLanding.
  }
  return events;
}

// Called when the aircraft touches down on a runway.
export function onLanding(mission, plane, runway, smooth) {
  if (!runway) return [];
  const events = [];
  const bonus = PLANE.landingScore + (smooth ? PLANE.smoothBonus : 0);
  if (mission.id === 'rings') {
    if (mission.allRings && runway.island === mission.homeIsland) {
      mission.done = true;
      mission.score += bonus + Math.round(mission.timeLeft) * PLANE.timeBonusRate;
      events.push('complete');
    } else if (mission.allRings) {
      events.push('wrong-runway');
    } else {
      mission.score += Math.round(bonus / 2);
      events.push('landed-early');
    }
    mission.landings += 1;
  } else if (mission.id === 'hop') {
    const want = mission.legs[mission.legIndex];
    if (runway.island === want) {
      mission.legIndex += 1;
      mission.landings += 1;
      mission.score += bonus;
      plane.fuel = PLANE.fuelCapacity;
      events.push(mission.legIndex >= mission.legs.length ? 'complete' : 'leg-done');
      if (mission.legIndex >= mission.legs.length) {
        mission.done = true;
        mission.score += Math.round(mission.timeLeft) * PLANE.timeBonusRate;
      }
    } else {
      events.push('wrong-runway');
    }
  } else {
    mission.landings += 1;
    mission.score += Math.round(bonus / 2);
    plane.fuel = PLANE.fuelCapacity;
    events.push('landed-early');
  }
  return events;
}

export function missionProgress(mission) {
  if (mission.id === 'rings') return `${mission.ringsPassed}/${mission.rings.length} rings`;
  if (mission.id === 'hop') return `leg ${Math.min(mission.legIndex + 1, mission.legs.length)}/${mission.legs.length}`;
  return `${mission.starsCollected}/${mission.target} stars`;
}
