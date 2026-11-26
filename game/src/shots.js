// The screenshot scenes behind ?shot=start|play|rings|end. Each one plays the
// real rules forward from a fresh world for a fixed number of steps, steered
// by a simple autopilot (turn toward the next goal, hold a sensible altitude
// and throttle), so the frame is what a short game really looks like — and the
// same seed always gives the same frame.
import { STEP } from './config.js';
import { angleDelta, clamp } from './random.js';
import { currentTarget } from './missions.js';

const SAMPLE = STEP;

// Steer toward `target` at `wantAlt` metres: bank to turn, pitch to hold height.
// Up close the pilot flies straight at the goal — a hard turn beside a ring
// would orbit it forever instead of flying through it.
function autopilot(plane, target, wantAlt) {
  const dx = target.x - plane.x;
  const dz = target.z - plane.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const wantHeading = Math.atan2(dx, dz);
  const turn = angleDelta(plane.heading, wantHeading);
  const straighten = clamp(dist / 350, 0.15, 1);
  const bank = clamp(turn * 1.4 * straighten, -1, 1);
  const altErr = wantAlt - plane.y;
  const pitch = clamp(altErr * 0.02, -1, 1);
  let throttle = 0;
  if (plane.speed < 52) throttle = 1;
  else if (plane.speed > 66) throttle = -1;
  return { pitch, bank, throttle };
}

// Land the plane on the home runway, as a proper traffic pattern: fly out to
// a point 1000 m south of the strip, make a level 180° turn onto the runway
// heading, then fly the centreline down a gentle slope, flare, and roll out.
// `st` carries the outbound/turn/final phase between steps.
function landingAutopilot(plane, world, st) {
  const home = world.home;
  const rwy = home.runway.heading;
  const sin = Math.sin(rwy);
  const cos = Math.cos(rwy);
  const dx = plane.x - home.x;
  const dz = plane.z - home.z;
  const along = dx * sin + dz * cos; // +ve past the threshold, -ve still out
  const across = dx * cos - dz * sin; // +ve east of the centreline
  if (!st.phase) st.phase = 'outbound';
  const outX = home.x - sin * 1000;
  const outZ = home.z - cos * 1000;
  const outDist = Math.hypot(outX - plane.x, outZ - plane.z);
  if (st.phase === 'outbound' && outDist < 140) st.phase = 'turn';
  if (st.phase === 'turn' && Math.abs(angleDelta(plane.heading, rwy)) < 0.25) st.phase = 'final';
  if (st.phase === 'final' && along > 120) st.phase = 'outbound'; // overshot: go around
  let wantHeading;
  let wantAlt;
  let pitchLimit = 0.25;
  let pitchGain = 0.03;
  if (st.phase === 'outbound') {
    wantHeading = Math.atan2(outX - plane.x, outZ - plane.z);
    wantAlt = 50;
  } else if (st.phase === 'turn') {
    // A level turn onto the runway heading: hold altitude, the bank's sink is
    // paid for with a little nose-up, never with a dive over the island.
    wantHeading = rwy;
    wantAlt = 50;
    pitchGain = 0.03;
    pitchLimit = 0.25;
  } else {
    // On final: hold the runway heading, corrected back onto the centreline.
    wantHeading = rwy + clamp(-across * 0.004, -0.45, 0.45);
    const toThreshold = Math.max(0, -along - 170);
    wantAlt = clamp(toThreshold * 0.06 + 4, 4, 130);
    pitchLimit = 0.16; // gentle on final: a hard dive meets the hillside
    pitchGain = 0.015;
  }
  const turn = angleDelta(plane.heading, wantHeading);
  const pitch = clamp((wantAlt - plane.y) * pitchGain, -pitchLimit, 0.22);
  let throttle = 0;
  // Touchdown speed must stay under the 40 m/s landing limit, with margin.
  if (plane.speed < 34) throttle = 1;
  else if (plane.speed > 38) throttle = -1;
  return { pitch, bank: clamp(turn * 1.6, -1, 1), throttle };
}

export function stageShot(name, game) {
  const { plane, mission, world } = game;
  if (name === 'start') {
    // The title screen over a live flight, not a parked plane: take off and
    // climb toward the first ring, then freeze with the title cards up. The
    // sea, the islands and the sky are all in frame behind the aircraft.
    game.screen = 'play';
    game.time = 0;
    let steps = 0;
    while (steps < 60 * 12) {
      const target = currentTarget(mission, world);
      game.step(SAMPLE, autopilot(plane, target, target.y), true);
      steps += 1;
    }
    game.screen = 'title';
    game.time = 12;
    return;
  }
  if (name === 'play' || name === 'rings') {
    // Take off, then chase the rings with the autopilot until a good frame.
    game.screen = 'play';
    game.time = 0;
    let steps = 0;
    const maxSteps = 60 * 150;
    while (steps < maxSteps) {
      const target = currentTarget(mission, world);
      const input = autopilot(plane, target, target.y);
      game.step(SAMPLE, input, true);
      steps += 1;
      if (name === 'play' && steps > 60 * 24 && plane.y > 60 && !plane.onGround) break;
      if (name === 'rings') {
        const next = mission.rings.find((r) => !r.passed);
        if (next) {
          const dx = next.x - plane.x;
          const dz = next.z - plane.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const facing = Math.abs(angleDelta(plane.heading, Math.atan2(dx, dz)));
          // Freeze with the ring well ahead and in frame, not under the nose.
          if (dist < 320 && dist > 170 && facing < 0.3 && plane.y > 55) break;
        }
      }
    }
    game.time = 24;
    return;
  }
  // 'end': fly the whole Ring Run with the autopilot and land home, so the
  // frame shows the mission-complete panel over the runway.
  game.screen = 'play';
  game.time = 0;
  const landingState = {};
  let steps = 0;
  const maxSteps = 60 * 560;
  while (steps < maxSteps && game.screen !== 'complete' && game.screen !== 'crashed') {
    const target = currentTarget(mission, world);
    let input;
    if (mission.allRings) {
      input = landingAutopilot(plane, world, landingState);
    } else {
      input = autopilot(plane, target, target.y);
    }
    game.step(SAMPLE, input, true);
    steps += 1;
    // If the autopilot is stuck on the ground, give it full throttle and nose up.
    if (plane.onGround && steps > 60 * 6 && plane.speed < 20) {
      game.step(SAMPLE, { pitch: 1, bank: 0, throttle: 1 }, true);
    }
  }
  if (game.screen !== 'complete') {
    // The autopilot did not finish the mission in the budget: force the
    // landed-and-complete frame by hand so the shot still shows the ending.
    plane.onGround = true;
    plane.speed = 0;
    plane.y = world.groundHeight(plane.x, plane.z) + 0.4;
    game.screen = 'complete';
    game.summaryLine = `All ${mission.rings.length} rings flown — landed at Harbour Field.`;
  }
  game.time = 60;
}
