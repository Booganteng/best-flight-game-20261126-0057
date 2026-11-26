// The aircraft: position, speed, attitude, fuel and damage, and the one step()
// that moves it. Arcade physics with real trade-offs: climbing bleeds speed,
// a steep bank without throttle sinks, and speed is what keeps you flying.
import { PLANE, STEP } from './config.js';
import { clamp, angleDelta } from './random.js';

export function createAircraft(world) {
  const home = world.home;
  return {
    // Parked at the south end of the home runway, facing north down the strip.
    x: home.x - Math.sin(home.runway.heading) * (home.runway.length / 2 - 30),
    y: 2,
    z: home.z - Math.cos(home.runway.heading) * (home.runway.length / 2 - 30),
    heading: home.runway.heading,
    pitch: 0, // radians, positive = nose up
    bank: 0, // radians, positive = right wing down
    speed: 0,
    throttle: 0,
    verticalSpeed: 0,
    fuel: PLANE.fuelCapacity,
    damage: 0,
    gearDown: true,
    onGround: true,
    flying: false,
    propAngle: 0,
    distanceFlown: 0,
  };
}

// `input` is { pitch: -1..1, bank: -1..1, throttle: -1..1 } from the pilot
// (or the autopilot). Returns an event string when something notable happens.
export function stepAircraft(plane, input, world, dt) {
  const events = [];

  // Throttle moves toward its target; the engine only burns fuel while running.
  const targetThrottle = clamp(plane.throttle + input.throttle * 55 * dt, PLANE.minThrottle, PLANE.maxThrottle);
  plane.throttle = targetThrottle;
  if (plane.throttle > 2 && plane.fuel > 0) {
    plane.fuel = Math.max(0, plane.fuel - PLANE.fuelBurn * (0.35 + plane.throttle / 100) * dt);
  }
  const engineOut = plane.fuel <= 0;

  // Target speed follows throttle; drag pulls the speed toward it.
  const targetSpeed = engineOut
    ? 0
    : PLANE.cruiseSpeed * (0.35 + (plane.throttle / 100) * 1.35);
  const drag = plane.onGround ? 2.2 : 0.55;
  plane.speed += clamp(targetSpeed - plane.speed, -PLANE.accel * drag * dt, PLANE.accel * dt);

  // Pitch: the pilot asks, the wing answers. Climbing costs speed, diving gains it.
  const wantPitch = clamp(input.pitch * 0.42, -0.42, 0.42);
  plane.pitch += clamp(wantPitch - plane.pitch, -1.4 * dt, 1.4 * dt);
  const climbPower = Math.sin(plane.pitch);
  if (!plane.onGround) {
    plane.speed -= climbPower * 26 * dt; // climbing bleeds speed
    plane.speed = Math.max(8, Math.min(PLANE.maxSpeed, plane.speed));
  }

  // Bank rolls the wing; the bank turns the heading, faster when fast.
  // On the ground the wheels keep the plane straight: no turning on the roll.
  const wantBank = plane.onGround
    ? 0
    : clamp(input.bank * PLANE.maxBank, -PLANE.maxBank, PLANE.maxBank);
  plane.bank += clamp(wantBank - plane.bank, -PLANE.bankRate * dt, PLANE.bankRate * dt);
  const turnRate = plane.onGround
    ? 0
    : plane.bank * PLANE.turnFactor * clamp(plane.speed / PLANE.cruiseSpeed, 0.4, 1.4);
  plane.heading += turnRate * dt;

  // A steep bank without speed or throttle sinks the aircraft: turn discipline.
  let sink = 0;
  if (!plane.onGround) {
    const liftLoss = Math.abs(plane.bank) * 3.2 + (plane.speed < PLANE.stallSpeed ? 9 : 0);
    sink = liftLoss;
  }

  plane.verticalSpeed = Math.sin(plane.pitch) * plane.speed - sink;
  if (plane.onGround) plane.verticalSpeed = 0;

  // Move.
  const forward = plane.onGround ? Math.max(plane.speed, 0) : plane.speed;
  plane.x += Math.sin(plane.heading) * forward * dt;
  plane.z += Math.cos(plane.heading) * forward * dt;
  plane.y += plane.verticalSpeed * dt;
  plane.distanceFlown += forward * dt;
  plane.propAngle += (0.4 + plane.throttle / 12) * dt * 10;

  // Take-off: enough speed and a pulled nose lifts the wheels, with a small
  // hop so the ground-contact check below does not fire on the same step.
  if (plane.onGround && plane.speed > 34 && plane.pitch > 0.06) {
    plane.onGround = false;
    plane.flying = true;
    plane.y = Math.max(plane.y, world.groundHeight(plane.x, plane.z) + 2);
    events.push('takeoff');
  }

  // Gear follows speed: down when slow, up when fast and flying.
  plane.gearDown = plane.speed < PLANE.gearSpeed;

  // Keep the heading wrapped so it never grows without bound.
  plane.heading = angleDelta(0, plane.heading);

  // Stay inside the archipelago: the sea beyond is a soft wall that steers
  // the plane back toward the islands instead of flipping it around.
  const half = world.half;
  const nearEdge = Math.abs(plane.x) > half - 60 || Math.abs(plane.z) > half - 60;
  if (nearEdge) {
    const toCentre = Math.atan2(-plane.x, -plane.z);
    plane.heading += angleDelta(plane.heading, toCentre) * 1.6 * dt;
    plane.x = clamp(plane.x, -half, half);
    plane.z = clamp(plane.z, -half, half);
    if (!plane._edgeWarned) {
      events.push('turnback');
      plane._edgeWarned = true;
    }
  } else {
    plane._edgeWarned = false;
  }

  // Ground contact. A plane climbing away from the strip is leaving the
  // ground, not hitting it; a plane buried in a hillside is a crash.
  const ground = world.groundHeight(plane.x, plane.z);
  if (plane.y <= ground + 0.4 && !plane.onGround) {
    if (plane.y < ground - 0.5) {
      events.push('crashed');
      return { events, runway: null, crashed: true };
    }
    if (plane.verticalSpeed >= 1) {
      // Skimming the ground while climbing: stay airborne, keep the height.
      plane.y = ground + 0.4;
      return { events, runway: null };
    }
    const runway = world.runwayAt(plane.x, plane.z);
    const sinkRate = -plane.verticalSpeed;
    const aligned = runway !== null && Math.abs(angleDelta(plane.heading, runway.island.runway.heading)) < 0.5;
    if (runway && aligned && plane.speed <= PLANE.landingSpeedMax && sinkRate <= PLANE.landingSinkMax) {
      plane.onGround = true;
      plane.y = ground + 0.4;
      plane.pitch = 0;
      plane.bank = 0;
      events.push(sinkRate <= 2.2 ? 'landed-smooth' : 'landed');
      return { events, runway };
    }
    if (ground > 2 && plane.speed <= 30 && sinkRate <= PLANE.roughSinkMax) {
      // A gentle touchdown on grass: a rough landing, heavy damage, but alive.
      plane.onGround = true;
      plane.y = ground + 0.4;
      plane.damage += 45;
      plane.speed *= 0.3;
      events.push('rough');
      return { events, runway: null };
    }
    if (ground <= 2 && plane.speed <= 32 && sinkRate <= PLANE.roughSinkMax) {
      // Ditching in the sea, gently: the sortie ends, the pilot survives.
      plane.onGround = true;
      plane.y = 0.4;
      plane.speed = 0;
      events.push('ditched');
      return { events, runway: null };
    }
    events.push('crashed');
    return { events, runway: null, crashed: true };
  }
  if (plane.onGround) plane.y = Math.max(plane.y, ground + 0.4);

  return { events, runway: null };
}

export function addDamage(plane, amount) {
  plane.damage = Math.min(PLANE.maxDamage, plane.damage + amount);
  return plane.damage >= PLANE.maxDamage;
}
